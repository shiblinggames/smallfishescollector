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
## THE CREW CHEST (Kong, 2026-10-06): raid items, forge scrap and rods, put
## in and taken out by anyone, one action at a time on the founder's game
## (Terraria's chest). Hooks and reels are each captain's own upgrades.
## HARDCORE LIVES: one per captain and one spare, fixed at Set Sail; a captain
## sunk in a lost fight spends one; at none the Charter sinks for good (moved
## to charters/sunk, never deleted). RELEASE: the founder frees a berth (its
## captain kept in the file, unplayable). HANDOVER: the founder hands the
## whole file to a crewmate, who hosts from then on.
## NOT YET: the shared daily and bounty boards.

signal shared_changed(actor_key: String)
## A hardcore Charter's last life is spent (CrewNet sinks it once the fight
## that spent it is over).
signal sinking

const DIR: String = "user://charters"
const BERTHS: int = 4
const SHARED_SAVE: Array[String] = ["collection", "lifetime", "bests", "market", "discoveries", "digs", "homestead"]
const SHARED_PROFILE: Array[String] = [
	"doubloons", "prestige_levels", "zone_golden_boost",
	"zone_shallows_rewarded", "zone_open_waters_rewarded", "zone_deep_rewarded", "zone_abyss_rewarded",
	"ancient_catches", "ancient_vigil", "lifetime_species", "lifetime_species_count",
	"portal_tier",
	# One crew board (Kong, 2026-10-06): the bounties and the day's orders.
	"bounty_board", "bounty_points", "bounty_milestones_claimed", "orders",
]
## Rules that reach every captain's own save (a skin or a crate for each), so
## every berth is written and sent.
const CREW_WIDE: Array[String] = ["claimBountyMilestone", "claimOrder", "sweepOrders"]
const LEDGER_KEEP: int = 400
static var dir_override: String = ""

var data: Dictionary = {}
## Each member's captain, opened: key -> Session.
var sessions: Dictionary = {}
## Asks the crew present to agree (CrewNet sets it): (proposer key, text) ->
## bool, awaited. Without a crew line, everything goes ahead.
var voter: Callable = Callable()
## The Den's shared tables (CrewNet sets them when it hosts).
var tables: DenTables = null
## The Charter's raid together, run on the founder's game (game/raid_table.gd).
var raids: RaidTable = null
var gauntlets: GauntletTable = null
## Fishing together: catch pops, callouts, the crew streak, derbies.
var fishing: CrewFishing = null
## Why no action runs now ("" when they do): set while the Charter is being
## handed over (CrewNet.hand_over), since this copy is about to be put away.
var busy_why: String = ""


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
		# Sunk but never moved (the game closed while the last fight played
		# out): the flag is the truth, so it goes to charters/sunk now.
		if d is Dictionary and (d as Dictionary).get("sunk", false) == true and (d as Dictionary).has("id"):
			_bury(str(d["id"]))
			continue
		if d is Dictionary:
			var names: Array = []
			var looks: Array = []
			for b: Dictionary in (d as Dictionary).get("berths", []):
				names.append(b.get("name", "?"))
				looks.append(b.get("look", { "color": "default" }))
			var keys: Array = (d as Dictionary).get("berths", []).map(func(b: Dictionary) -> String: return str(b.get("key", "")))
			var lv: float = -1.0
			if d.get("hardcore", false):
				lv = Js.num(d.get("lives", float(keys.size() + 1)))
			out.append({ "id": d["id"], "name": d["name"], "hardcore": d.get("hardcore", false), "sailed": d.get("sailed", false), "crew": names, "looks": looks, "keys": keys, "lives": lv, "founder": d.get("founder", ""), "at": FileAccess.get_modified_time(_path(d["id"])) })
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a["at"]) > int(b["at"]))
	return out


static func found(charter_name: String, hardcore: bool, founder_key: String, captain_name: String, color: String = "default") -> Charter:
	var c: Charter = Charter.new()
	c.data = {
		"v": 1, "id": "charter-" + Crypto.new().generate_random_bytes(6).hex_encode(),
		"name": charter_name, "hardcore": hardcore, "founded_at": Js.iso(Clock.now_ms()),
		"founder": founder_key, "sailed": false, "berths": [],
	}
	var s: Session = c.add_member(founder_key, captain_name)
	if s != null:
		s.profile()["character_color"] = color
	c.write()
	c.flush()
	return c


static func open(id: String) -> Charter:
	var d: Variant = JsJson.parse(FileAccess.get_file_as_string(_path(id)))
	if not d is Dictionary:
		return null
	# A sunk Charter never opens again, however it was left (see list()).
	if (d as Dictionary).get("sunk", false) == true:
		_bury(str((d as Dictionary).get("id", id)))
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
	CrewRules.crew_of = _crew_for
	s.writer = func() -> void: write(key)
	s.charter = self


## The crew a captain of this Charter sails with, for the shared rules.
func _crew_for(uid: String) -> Array:
	var out: Array = []
	var mine: bool = false
	for k: String in sessions:
		var s: Session = sessions[k]
		out.append([s.store, s.uid])
		mine = mine or s.uid == uid
	return out if mine else []


func set_sail() -> void:
	data["sailed"] = true
	if data.get("hardcore", false) and not data.has("lives"):
		data["lives"] = float(lives_max())
	write()
	flush()


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
		"lives": lives(), "livesMax": float(lives_max()),
		"chest": _chest_view(), "founder": data["founder"] == key_of(s),
		"crewStreak": data.get("crewStreak", {}), "derbies": Js.list(data.get("derbies")).slice(-5),
		"members": _members_view(),
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
	if busy_why != "":
		return { "error": busy_why }
	var key: String = key_of(s)
	# A seat at the Den's shared tables: run by the tables, not the rules.
	if op == "denTable":
		if tables == null:
			return { "error": "The Den's tables are not open." }
		return tables.handle(key, s, args)
	if op == "gauntletTable":
		if gauntlets == null:
			return { "error": "The crew cannot dive together here." }
		return gauntlets.handle(key, s, args)
	if op == "crewChest":
		return chest_run(key, s, args)
	if op == "crewDerby":
		if fishing == null:
			return { "error": "A derby needs the crew aboard." }
		return fishing.handle(key, args)
	if op == "raidTable":
		if raids == null:
			return { "error": "The crew cannot muster for a raid here." }
		return raids.handle(key, s, args)
	if op == "prestigeZone" and voter.is_valid():
		var agreed: bool = await voter.call(key, _prestige_text(s, String(args[0])))
		if not agreed:
			return { "error": "The crew said not yet." }
	_lend(s)
	var shared_before: int = _shared().hash()
	var ledger_n: int = (s.save["ledger"] as Array).size()
	var bests_before: Dictionary = (s.save["bests"] as Dictionary).duplicate(true)
	var golden_before: Dictionary = {}
	for k: Variant in s.save["collection"]:
		golden_before[k] = Js.obj((s.save["collection"] as Dictionary)[k]).get("is_golden") == true
	var r: Variant = RulesApi.run(s.store, s.uid, op, args)
	_take(s)
	if op == "reelIn" and fishing != null:
		fishing.on_reel(key, str(args[1]) if args.size() > 1 else "", r)
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
	# Only a change to what the crew shares goes out to the crew (Kong's audit,
	# 2026-10-06: every action used to send every crewmate their whole save).
	if CREW_WIDE.has(op):
		_spread("")
		write()
		return r
	if _shared().hash() != shared_before:
		_spread(key)
	write(key)
	return r


# ── Hardcore lives ────────────────────────────────────────────────────────────

func lives_max() -> int:
	return (data["berths"] as Array).size() + 1


## Lives left (-1: not a hardcore Charter).
func lives() -> float:
	if not data.get("hardcore", false):
		return -1.0
	return Js.num(data.get("lives", float(lives_max())))


## A captain's ship sunk in a lost fight: a life gone. The last one sinks the
## Charter.
func spend_life(key: String, what: String) -> void:
	if not data.get("hardcore", false) or data.get("sunk", false):
		return
	var left: float = maxf(0.0, lives() - 1.0)
	data["lives"] = left
	var s: Session = sessions.get(key)
	var who: String = s.captain_name() if s != null else str(berth_of(key).get("name", "A captain"))
	if not data.has("lifeLog"):
		data["lifeLog"] = []
	(data["lifeLog"] as Array).append({ "by": who, "what": what, "left": left, "at": Js.iso(Clock.now_ms()) })
	if left <= 0.0:
		data["sunk"] = true
	_spread("")
	write()
	flush()
	if left <= 0.0:
		sinking.emit()


## The Charter gone down: its file moved to charters/sunk (nothing is ever
## deleted; a slip is undone by moving it back by hand).
func sink() -> void:
	flush()
	_bury(id())
	_closed = true


## A sunk Charter's file, moved to charters/sunk.
static func _bury(charter_id: String) -> void:
	var to_dir: String = "%s/sunk" % _dir()
	DirAccess.make_dir_recursive_absolute(to_dir)
	var stamp: String = Time.get_datetime_string_from_system(true).replace(":", "").replace("-", "")
	DirAccess.rename_absolute(_path(charter_id), "%s/%s-%s.json" % [to_dir, charter_id, stamp])


## Done with this Charter on this game (left, sunk, handed over, a berth
## released from the title): what is batched is written, and the Charter and
## its captains let go of each other. Each Session held the Charter (its writer
## and its charter) while the Charter held each Session, a cycle Godot never
## frees, so every Charter opened in a run stayed in memory with every save.
## The sessions are marked closed, so a late persist() from a screen still
## being torn down writes nothing (never a solo captain's file).
func close() -> void:
	flush()
	for k: String in sessions:
		var s: Session = sessions[k]
		s.charter = null
		s.writer = Callable()
		s.closed = true
	sessions.clear()
	if CrewRules.crew_of.is_valid() and CrewRules.crew_of.get_object() == self:
		CrewRules.crew_of = Callable()
	voter = Callable()
	tables = null
	raids = null
	gauntlets = null
	fishing = null


# ── The crew, released and handed over ────────────────────────────────────────

func _members_view() -> Array:
	var out: Array = []
	for b: Dictionary in data["berths"]:
		out.append({ "key": b["key"], "name": b.get("name", "?"), "founder": b["key"] == data["founder"] })
	return out


## The founder frees a crewmate's berth. Their captain stays in the file under
## "released" (never deleted), but nobody plays them again. A Charter that has
## sailed cannot fill the berth again; one still in harbor can.
func release(key: String) -> String:
	if key == data["founder"]:
		return "The founder cannot release their own berth. Hand the Charter over first."
	var b: Dictionary = berth_of(key)
	if b.is_empty():
		return "There is no such berth."
	var s: Session = sessions.get(key)
	if s != null:
		b["captain"] = SaveFile.serialize(s.save, s.carried, Js.iso(Clock.now_ms()))
	sessions.erase(key)
	(data["berths"] as Array).erase(b)
	b["released_at"] = Js.iso(Clock.now_ms())
	if not data.has("released"):
		data["released"] = []
	(data["released"] as Array).append(b)
	_spread("")
	write()
	flush()
	return ""


## The whole Charter as text, for handing to a crewmate (written first).
func handover_text(to_key: String) -> String:
	flush()
	var d: Dictionary = data.duplicate(true)
	d["founder"] = to_key
	d["handed_from"] = data["founder"]
	d["handed_at"] = Js.iso(Clock.now_ms())
	return JsJson.stringify(d)


## After a handover: this machine's copy moves to charters/handed (kept, not
## hostable), since the crewmate's copy is the Charter now.
func handed_off() -> void:
	flush()
	_closed = true
	var to_dir: String = "%s/handed" % _dir()
	DirAccess.make_dir_recursive_absolute(to_dir)
	var stamp: String = Time.get_datetime_string_from_system(true).replace(":", "").replace("-", "")
	DirAccess.rename_absolute(_path(id()), "%s/%s-%s.json" % [to_dir, id(), stamp])


## A Charter handed to this machine: written in as its own, founded by me.
static func take_handover(text: String, my_key: String) -> String:
	var d: Variant = JsJson.parse(text)
	if not d is Dictionary or not (d as Dictionary).has("id") or str((d as Dictionary).get("founder", "")) != my_key:
		return "The Charter did not come across whole."
	DirAccess.make_dir_recursive_absolute(_dir())
	var err: Error = SaveFile.write_file(ProjectSettings.globalize_path(_path(str(d["id"]))), text)
	return "" if err == OK else "The Charter could not be written: %s" % error_string(err)


# ── The crew chest ────────────────────────────────────────────────────────────

const CHEST_LOG_KEEP: int = 120


func _chest() -> Dictionary:
	if not data.has("chest"):
		data["chest"] = { "items": {}, "rods": {}, "scrap": 0.0, "log": [] }
	return data["chest"]


func _chest_view() -> Dictionary:
	var c: Dictionary = _chest()
	var lg: Array = c["log"]
	return { "items": c["items"], "rods": c["rods"], "scrap": c["scrap"], "log": lg.slice(maxi(0, lg.size() - 40)) }


## One chest action: [verb ("put"/"take"), kind ("item"/"rod"/"scrap"), id, n].
## For an item or a rod, n copies move in one action (a shift-click), stopping
## at the first that cannot; the answer says how many moved.
func chest_run(key: String, s: Session, args: Array) -> Dictionary:
	var verb: String = str(args[0]) if args.size() > 0 else ""
	var kind: String = str(args[1]) if args.size() > 1 else ""
	var id_: String = str(args[2]) if args.size() > 2 else ""
	var n: float = maxf(1.0, floor(Js.num(args[3]))) if args.size() > 3 else 1.0
	if not ["put", "take"].has(verb):
		return { "error": "The chest does not do that." }
	var r: Dictionary
	var moved: int = 1
	match kind:
		"item", "rod":
			moved = 0
			for i: int in int(n):
				var one: Dictionary = _chest_item(s, verb, id_) if kind == "item" else _chest_rod(s, verb, id_)
				if one.has("error"):
					if moved == 0:
						r = one
					break
				r = one
				moved += 1
		"scrap": r = _chest_scrap(s, verb, n)
		_: return { "error": "That does not go in the crew chest." }
	if r.has("error"):
		return r
	var what: String = str(r["what"]) if moved <= 1 else "%s x%d" % [r["what"], moved]
	var c: Dictionary = _chest()
	(c["log"] as Array).append({ "by": s.captain_name(), "verb": verb, "what": what, "at": Js.iso(Clock.now_ms()) })
	if (c["log"] as Array).size() > CHEST_LOG_KEEP:
		c["log"] = (c["log"] as Array).slice((c["log"] as Array).size() - CHEST_LOG_KEEP)
	# Only the actor's own save and the chest changed. The chest reaches the
	# others in the lent "charter" view (CrewNet's shared slice); the actor's
	# save goes back in their answer. Spreading as "" sent every crewmate their
	# whole save on every move.
	_spread(key)
	write(key)
	return { "ok": true, "chest": _chest_view(), "moved": float(moved) }


func _bump(d: Dictionary, id_: String, by: float) -> void:
	var v: float = Js.num(d.get(id_)) + by
	if v <= 0.0:
		d.erase(id_)
	else:
		d[id_] = v


func _chest_item(s: Session, verb: String, id_: String) -> Dictionary:
	var def: Dictionary = Armory.item(id_)
	if def.is_empty():
		return { "error": "There is no such raid item." }
	var p: Dictionary = s.profile()
	var held: Array = Js.list(p.get("raid_items")).duplicate()
	var items: Dictionary = _chest()["items"]
	if verb == "put":
		var n: int = held.count(id_)
		if n <= 0:
			return { "error": "You do not hold that." }
		if n == 1 and Js.list(p.get("equipped_raid_items")).has(id_):
			return { "error": "That is mounted on your ship. Take it off first." }
		held.erase(id_)
		_bump(items, id_, 1.0)
	else:
		if Js.num(items.get(id_)) < 1.0:
			return { "error": "The chest has none of that." }
		held.append(id_)
		_bump(items, id_, -1.0)
	s.store.update_profile(s.uid, { "raid_items": held })
	# The last copy gone: its grade (and any mount) goes with it.
	Forge._tidy(s.store, s.uid)
	return { "what": str(def.get("name", id_)) }


func _chest_rod(s: Session, verb: String, id_: String) -> Dictionary:
	var rod: Dictionary = Rules.rod_by_id(id_)
	if rod.is_empty() or id_ == "bamboo":
		return { "error": "That rod does not go in the chest." }
	if rod.get("earnedOnly") == true:
		return { "error": "The %s was earned. It stays with its captain." % rod["name"] }
	var rods: Dictionary = _chest()["rods"]
	if verb == "put":
		var p: Dictionary = s.profile()
		var equipped: bool = Js.num(p.get("rod_tier")) == float(rod["tier"])
		if equipped and s.store.rod_held(s.uid, id_) <= 1.0:
			return { "error": "You are fishing with that one. Switch rods first." }
		if not s.store.rod_take(s.uid, id_):
			return { "error": "You do not carry that rod." }
		_bump(rods, id_, 1.0)
	else:
		if Js.num(rods.get(id_)) < 1.0:
			return { "error": "The chest has no %s." % rod["name"] }
		var shop: Dictionary = Js.obj(Js.obj(Rules.data().get("rodShop")).get(Js.key(float(rod["tier"]))))
		var req: int = int(Js.num(shop.get("levelReq")))
		if Rules.level_from_xp(Js.num(s.profile().get("fishing_xp"))) < req:
			return { "error": "Reach Fishing Lv %d to take the %s." % [req, rod["name"]] }
		s.store.rod_give(s.uid, id_)
		_bump(rods, id_, -1.0)
	return { "what": str(rod["name"]) }


func _chest_scrap(s: Session, verb: String, n: float) -> Dictionary:
	var c: Dictionary = _chest()
	var have: float = Js.num(s.profile().get("forge_scrap"))
	if verb == "put":
		if have < n:
			return { "error": "You have %s scrap." % Js.thousands(have) }
		s.store.update_profile(s.uid, { "forge_scrap": have - n })
		c["scrap"] = Js.num(c["scrap"]) + n
	else:
		if Js.num(c["scrap"]) < n:
			return { "error": "The chest holds %s scrap." % Js.thousands(Js.num(c["scrap"])) }
		s.store.update_profile(s.uid, { "forge_scrap": have + n })
		c["scrap"] = Js.num(c["scrap"]) - n
	return { "what": "%s scrap" % Js.thousands(n) }


func _prestige_text(s: Session, zone: String) -> String:
	var lvl: int = int(Js.num(Js.obj(_shared()["profile"].get("prestige_levels")).get(zone)))
	var water: String = zone.replace("_", " ").capitalize()
	for w: Dictionary in Chart.WATERS:
		if w["id"] == zone:
			water = w["name"]
	if lvl >= 5:
		return "Wipe %s for gold. The crew's log there is wiped; goldens stay. In return, +10%% golden catch chance there for the whole crew." % water
	return "Prestige %d in %s. The crew's log there is wiped; goldens stay. In return, +%d%% XP on every catch there for the whole crew." % [lvl + 1, water, (lvl + 1) * 10]


## THE FILE, WRITTEN IN A BATCH (Kong's audit, 2026-10-06: every action used
## to serialize every captain and write the whole file, twice, on the main
## thread; with four aboard the founder's game froze for a fifth of a second
## each time). write(key) marks that captain's berth changed ("" marks them
## all) and the file goes out once, a moment later, with only the changed
## captains serialized afresh. flush() writes at once (leaving, closing).
const WRITE_AFTER: float = 1.5
var _dirty: Dictionary = {}
## Sunk or handed over: this machine writes the file no more.
var _closed: bool = false
var _write_due: bool = false


func write(key: String = "") -> void:
	_dirty[key] = true
	if _write_due:
		return
	var tree: SceneTree = Engine.get_main_loop() as SceneTree
	if tree == null:
		flush()
		return
	_write_due = true
	tree.create_timer(WRITE_AFTER).timeout.connect(flush)


func flush() -> void:
	_write_due = false
	if _dirty.is_empty() or _closed:
		return
	var all: bool = _dirty.has("")
	for b: Dictionary in data["berths"]:
		var s: Session = sessions.get(b["key"])
		if s != null and (all or _dirty.has(b["key"]) or not b.has("captain")):
			b["captain"] = SaveFile.serialize(s.save, s.carried, Js.iso(Clock.now_ms()))
			b["name"] = s.captain_name()
			# How they look, for the title screen's crew row (no need to open
			# every captain's save to draw a portrait).
			b["look"] = Skipper.look_of(s.profile())
	_dirty.clear()
	DirAccess.make_dir_recursive_absolute(_dir())
	Playtest.stamp(data)
	var err: Error = SaveFile.write_file(ProjectSettings.globalize_path(_path(id())), JsJson.stringify(data))
	if err != OK:
		push_error("the Charter did not write: %s" % error_string(err))
