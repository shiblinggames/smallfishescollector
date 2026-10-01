class_name Charter
extends RefCounted
## A CHARTER'S WORLD ON THE FOUNDER'S MACHINE (Godot port; docs/systems/
## steam-port.md, "The Charter").
##
## One file, user://charters/<id>.json: the Charter's name, whether it is
## hardcore (fixed at founding), who founded it, whether it has set sail (the
## roster locks then), a berth per member (up to four) holding that member's
## CHARTER CAPTAIN as a whole save, and what the crew SHARES. Charter captains
## live only in here, so nothing reaches a solo game and nothing comes in from
## one. Written atomically after every change.
##
## WHAT THE CREW SHARES (decided with Kong, 2026-09-30):
##   the purse: doubloons are the Charter's, one purse every captain earns
##     into and spends from, with a crew ledger of who earned and spent what;
##   the Almanac: one book (the log, the lifetime counts, one best per species
##     with its holder's name, goldens with their catcher's name, prestige and
##     its boosts for the whole crew, the zone rewards paid once, the giants'
##     wall and the Vigil);
##   the sea's market.
## Everything else is each captain's own: levels, gear, the hold, bait,
## Fathoms and gems, their own regulars.
##
## HOW: the ported rules act on one captain's save, so the Charter LENDS the
## shared parts into a captain's save before an action and TAKES them back
## after (run()). Then every other captain is lent the result, the ledger
## records who did it, and the file is written. A captain's file in its berth
## carries the shared parts too, but the shared copy is the one that counts.
##
## NOT YET: the crew chest (waits on the inventory sitting; zone rewards pay
## the purse meanwhile) and the shared daily board (the daily rules count each
## captain's own play against a snapshot; sharing it is its own pass).

signal shared_changed(actor_key: String)

const DIR: String = "user://charters"
const BERTHS: int = 4
const SHARED_SAVE: Array[String] = ["collection", "lifetime", "bests", "market"]
const SHARED_PROFILE: Array[String] = [
	"doubloons", "prestige_levels", "zone_golden_boost",
	"zone_shallows_rewarded", "zone_open_waters_rewarded", "zone_deep_rewarded", "zone_abyss_rewarded",
	"ancient_catches", "ancient_vigil", "lifetime_species", "lifetime_species_count",
]
const LEDGER_KEEP: int = 400
static var dir_override: String = ""

var data: Dictionary = {}
## Each member's captain, opened: key -> Session.
var sessions: Dictionary = {}
## Asks the crew present to agree (CrewNet sets it): (proposer key, text) ->
## bool, awaited. Without a crew line, everything goes ahead.
var voter: Callable = Callable()


static func _dir() -> String:
	return dir_override if dir_override != "" else DIR


static func _path(id: String) -> String:
	return "%s/%s.json" % [_dir(), id]


## The Charters this machine founded (or was handed), most recent first.
static func list() -> Array:
	DirAccess.make_dir_recursive_absolute(_dir())
	var out: Array = []
	for f: String in DirAccess.get_files_at(_dir()):
		if not f.ends_with(".json"):
			continue
		var d: Variant = JsJson.parse(FileAccess.get_file_as_string("%s/%s" % [_dir(), f]))
		if d is Dictionary:
			var names: Array = []
			for b: Dictionary in (d as Dictionary).get("berths", []):
				names.append(b.get("name", "?"))
			out.append({ "id": d["id"], "name": d["name"], "hardcore": d.get("hardcore", false), "sailed": d.get("sailed", false), "crew": names, "founder": d.get("founder", ""), "at": FileAccess.get_modified_time(_path(d["id"])) })
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a["at"]) > int(b["at"]))
	return out


static func found(charter_name: String, hardcore: bool, founder_key: String, captain_name: String) -> Charter:
	var c: Charter = Charter.new()
	c.data = {
		"v": 1, "id": "charter-" + Crypto.new().generate_random_bytes(6).hex_encode(),
		"name": charter_name, "hardcore": hardcore, "founded_at": Js.iso(Clock.now_ms()),
		"founder": founder_key, "sailed": false, "berths": [],
	}
	c.add_member(founder_key, captain_name)
	c.write()
	return c


static func open(id: String) -> Charter:
	var d: Variant = JsJson.parse(FileAccess.get_file_as_string(_path(id)))
	if not d is Dictionary:
		return null
	var c: Charter = Charter.new()
	c.data = d
	# Every captain opened at once: the crew's goldens are read across all of
	# them, and a crewmate's game is sent theirs the moment they arrive.
	for b: Dictionary in c.data["berths"]:
		c.session_for(b["key"])
	return c


func id() -> String:
	return data["id"]


func sailed() -> bool:
	return data.get("sailed", false) == true


func berth_of(key: String) -> Dictionary:
	for b: Dictionary in data["berths"]:
		if b["key"] == key:
			return b
	return {}


func key_of(s: Session) -> String:
	for k: String in sessions:
		if sessions[k] == s:
			return k
	return ""


## Why this player cannot take a berth, or "" if they can (or already have one).
func refusal(key: String) -> String:
	if not berth_of(key).is_empty():
		return ""
	if sailed():
		return "This Charter has set sail. Its crew is fixed."
	if (data["berths"] as Array).size() >= BERTHS:
		return "Every berth in this Charter is taken."
	return ""


## A new member's Charter captain, in a new berth. The first one's state
## starts the shared book; everyone after brings their starting purse aboard.
func add_member(key: String, captain_name: String) -> Session:
	var made: Dictionary = Captains.create(Captains.new_id())
	var s: Session = Session.new(made["save"], made["carried"])
	var name_ok: String = captain_name.strip_edges()
	if name_ok != "":
		s.profile()["username"] = name_ok
	(data["berths"] as Array).append({ "key": key, "name": s.captain_name(), "captain": "" })
	_adopt_session(key, s)
	if not data.has("shared"):
		_start_shared(s)
	else:
		var brought: float = Js.num(s.profile().get("doubloons"))
		if brought > 0.0:
			_shared()["profile"]["doubloons"] = Js.num(_shared()["profile"].get("doubloons")) + brought
			_note(s.captain_name(), brought, "Brought %s ⟡ aboard" % Js.thousands(brought))
		_spread("")
	write()
	return s


## A member's captain, opened from their berth, with the shared parts lent.
func session_for(key: String) -> Session:
	if sessions.has(key):
		return sessions[key]
	var b: Dictionary = berth_of(key)
	if b.is_empty():
		return null
	var loaded: Dictionary = SaveFile.deserialize(b["captain"], Captains._species())
	if loaded.has("error"):
		push_error("a Charter captain would not open: %s" % loaded["error"])
		return null
	var s: Session = Session.new(loaded["save"], loaded["carried"])
	_adopt_session(key, s)
	# A Charter from before the crew shared anything starts its book from the
	# founder's captain.
	if not data.has("shared") and key == data["founder"]:
		_start_shared(s)
	if data.has("shared"):
		_lend(s)
	return s


func _adopt_session(key: String, s: Session) -> void:
	sessions[key] = s
	s.writer = write
	s.charter = self


func set_sail() -> void:
	data["sailed"] = true
	write()


# ── The shared book, purse and market ──────────────────────────────────────────

func _shared() -> Dictionary:
	return data["shared"]


func _start_shared(s: Session) -> void:
	data["shared"] = { "save": {}, "profile": {}, "ledger": [], "best_by": {}, "golden_by": {} }
	_take(s)


## Put the shared parts into a captain's save (the same objects, so the rules
## act on them directly), and what the crew screens read: the ledger, who holds
## each best and golden, the crew's goldens, the members.
func _lend(s: Session) -> void:
	var sh: Dictionary = _shared()
	for k: String in SHARED_SAVE:
		if (sh["save"] as Dictionary).has(k):
			s.save[k] = sh["save"][k]
	var p: Dictionary = s.profile()
	for c: String in SHARED_PROFILE:
		if (sh["profile"] as Dictionary).has(c):
			p[c] = sh["profile"][c]
	var ledger: Array = sh["ledger"]
	s.save["charter"] = {
		"name": data["name"], "hardcore": data.get("hardcore", false),
		"ledger": ledger.slice(maxi(0, ledger.size() - 60)),
		"bestBy": sh["best_by"], "goldenBy": sh["golden_by"],
		"goldens": _crew_goldens(), "crew": _crew_names(),
	}


## Take the shared parts back from the captain who just acted.
func _take(s: Session) -> void:
	var sh: Dictionary = _shared()
	for k: String in SHARED_SAVE:
		sh["save"][k] = s.save[k]
	var p: Dictionary = s.profile()
	for c: String in SHARED_PROFILE:
		sh["profile"][c] = p.get(c)


func _crew_names() -> Array:
	var out: Array = []
	for b: Dictionary in data["berths"]:
		var s: Session = sessions.get(b["key"])
		out.append(s.captain_name() if s != null else b.get("name", "?"))
	return out


## Every golden the crew has landed, each with its catcher's name.
func _crew_goldens() -> Array:
	var out: Array = []
	for b: Dictionary in data["berths"]:
		var s: Session = sessions.get(b["key"])
		if s == null:
			continue
		for g: Dictionary in s.save["shinies"]:
			var row: Dictionary = g.duplicate()
			row["by"] = s.captain_name()
			out.append(row)
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a.get("caught_at", "")) < str(b.get("caught_at", "")))
	return out


func _note(by: String, amount: float, reason: String) -> void:
	var ledger: Array = _shared()["ledger"]
	ledger.append({ "by": by, "amount": amount, "reason": reason, "at": Js.iso(Clock.now_ms()) })
	if ledger.size() > LEDGER_KEEP:
		_shared()["ledger"] = ledger.slice(ledger.size() - LEDGER_KEEP)


## Lend the shared parts to every captain, and say so (the crew line sends
## each crewmate their save; the screens refresh).
func _spread(actor_key: String) -> void:
	for k: String in sessions:
		_lend(sessions[k])
	for k: String in sessions:
		(sessions[k] as Session).changed.emit()
	shared_changed.emit(actor_key)


## Run one action for a captain of this Charter: what the crew must agree to is
## put to the crew first; then lend, run, take back, record, spread, write.
func run(s: Session, op: String, args: Array) -> Variant:
	var key: String = key_of(s)
	if op == "prestigeZone" and voter.is_valid():
		var agreed: bool = await voter.call(key, _prestige_text(s, String(args[0])))
		if not agreed:
			return { "error": "The crew said not yet." }
	_lend(s)
	var ledger_n: int = (s.save["ledger"] as Array).size()
	var bests_before: Dictionary = (s.save["bests"] as Dictionary).duplicate(true)
	var golden_before: Dictionary = {}
	for k: Variant in s.save["collection"]:
		golden_before[k] = Js.obj((s.save["collection"] as Dictionary)[k]).get("is_golden") == true
	var r: Variant = RulesApi.run(s.store, s.uid, op, args)
	_take(s)
	var who: String = s.captain_name()
	for e: Dictionary in (s.save["ledger"] as Array).slice(ledger_n):
		if str(e.get("currency", "doubloons")) == "doubloons" and float(e.get("amount", 0.0)) != 0.0:
			_note(who, float(e["amount"]), str(e.get("reason", "")))
	for k: Variant in s.save["bests"]:
		var now_len: float = Js.num(Js.obj((s.save["bests"] as Dictionary)[k]).get("len"))
		var was_len: float = Js.num(Js.obj(bests_before.get(k)).get("len"))
		if now_len > was_len:
			_shared()["best_by"][str(k)] = who
	for k: Variant in s.save["collection"]:
		if Js.obj((s.save["collection"] as Dictionary)[k]).get("is_golden") == true and not golden_before.get(k, false):
			_shared()["golden_by"][str(k)] = who
	_spread(key)
	write()
	return r


func _prestige_text(s: Session, zone: String) -> String:
	var lvl: int = int(Js.num(Js.obj(_shared()["profile"].get("prestige_levels")).get(zone)))
	var water: String = zone.replace("_", " ").capitalize()
	for w: Dictionary in Chart.WATERS:
		if w["id"] == zone:
			water = w["name"]
	if lvl >= 5:
		return "Wipe %s for gold. The crew's log there is wiped; goldens stay. In return, +10%% golden catch chance there for the whole crew." % water
	return "Prestige %d in %s. The crew's log there is wiped; goldens stay. In return, +%d%% XP on every catch there for the whole crew." % [lvl + 1, water, (lvl + 1) * 10]


## Every opened captain back into its berth, and the file written.
func write() -> void:
	for b: Dictionary in data["berths"]:
		var s: Session = sessions.get(b["key"])
		if s != null:
			b["captain"] = SaveFile.serialize(s.save, s.carried, Js.iso(Clock.now_ms()))
			b["name"] = s.captain_name()
	DirAccess.make_dir_recursive_absolute(_dir())
	var err: Error = SaveFile.write_file(ProjectSettings.globalize_path(_path(id())), JsJson.stringify(data))
	if err != OK:
		push_error("the Charter did not write: %s" % error_string(err))
