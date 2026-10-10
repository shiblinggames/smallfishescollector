class_name CrewFishing
extends Node
## FISHING TOGETHER (Kong, 2026-10-06: "make group fishing more fun and
## interesting ... not basic xp boost stuff"; he picked these three). Run on
## the founder's game, beside the raid and dive tables (a child of CrewNet, so
## its calls reach the same node on every game); every catch any captain
## reels goes through Charter.run, which hands it here.
##
##   CATCH POPS AND CALLOUTS: every crewmate's catch pops over their ship on
##     everyone's water (the fish and its length; a golden in gold). A golden,
##     a new crew best, a species new to the crew's book or an ancient is
##     called out to the whole crew ("Ben landed a golden Marlin").
##   THE CREW STREAK: perfects by captains fishing in company (another
##     crewmate within NEAR) build one shared streak; any other reel by one of
##     them breaks it. It shows from 2 on, under every hull in it. The crew's
##     best is kept in the Charter with the names in it.
##   THE DERBY: any captain starts one for everyone aboard: DERBY_S long,
##     biggest single fish (by length) or most species. Standings live; the
##     winner called out and the result kept in the Charter's records.
## No numbers on catching: nothing here touches what bites or what it pays.

signal popped(key: String, pop: Dictionary)
signal called(text: String, about: String)
signal streak_changed(n: int, keys: Array)
signal derby_changed(state: Dictionary)

const NEAR: float = 2200.0
const FRESH_MS: int = 6000
const DERBY_S: float = 600.0
const DERBY_KINDS: Dictionary = { "biggest": "biggest fish", "species": "most species" }
const ANCIENTS: Array = [143.0, 144.0, 145.0, 146.0, 147.0, 148.0]

var charter: Charter = null
## Where each captain's ship was last seen, and when: key -> [Vector2, ms].
var _pos: Dictionary = {}
var _streak: int = 0
var _streak_keys: Array = []
var _derby: Dictionary = {}
var _derby_end_ms: int = 0
## This game's view of the derby: the state and the msec it was received.
var derby: Dictionary = {}
var derby_got_ms: int = 0
var streak: int = 0
var streak_keys: Array = []


func hosting() -> bool:
	return charter != null and is_multiplayer_authority()


## The Charter is left (CrewNet): no derby or streak carries into the next one.
func reset() -> void:
	charter = null
	_pos.clear()
	_streak = 0
	_streak_keys = []
	_derby = {}
	_derby_end_ms = 0
	derby = {}
	derby_got_ms = 0
	streak = 0
	streak_keys = []


func _send(method: String, args: Array) -> void:
	if multiplayer.multiplayer_peer != null and not multiplayer.get_peers().is_empty():
		callv("rpc", [method] + args)
	else:
		callv(method, args)


# ── The founder's side ────────────────────────────────────────────────────────

func note_pos(key: String, st: Dictionary) -> void:
	_pos[key] = [Vector2(Js.num(st.get("x")), Js.num(st.get("y"))), Time.get_ticks_msec()]


## The crewmates fishing within NEAR of this captain now.
func company(key: String) -> Array:
	var out: Array = []
	if not _pos.has(key):
		return out
	var me: Vector2 = _pos[key][0]
	var now: int = Time.get_ticks_msec()
	for k: String in _pos:
		if k == key or now - int(_pos[k][1]) > FRESH_MS:
			continue
		if (_pos[k][0] as Vector2).distance_to(me) <= NEAR:
			out.append(k)
	return out


func _name(key: String) -> String:
	var s: Session = charter.session_for(key) if charter != null else null
	return s.captain_name() if s != null else "A crewmate"


## A reel, as the rules answered it (from Charter.run).
func on_reel(key: String, result: String, r: Variant) -> void:
	if charter == null or not r is Dictionary:
		return
	var d: Dictionary = r
	var who: String = _name(key)
	var caught: bool = d.get("caught") == true
	if caught:
		var fish: Dictionary = Js.obj(d.get("fish"))
		var fname: String = str(fish.get("name", "a fish"))
		var size_in: float = Js.num(d.get("sizeIn"))
		var golden: bool = d.get("isShiny") == true
		_send("_pop", [key, { "name": fname, "size": size_in, "golden": golden, "tier": str(d.get("sizeTier", "")) }])
		# The moments the whole crew hears about.
		var line: String = ""
		if ANCIENTS.has(Js.num(fish.get("id"))):
			line = "%s landed an ancient: the %s" % [who, fname]
		elif golden:
			line = "%s landed a golden %s" % [who, fname]
		elif d.get("isNewSpecies") == true:
			line = "%s logged a new species for the crew: %s" % [who, fname]
		elif d.get("isPB") == true and d.get("previousBest") != null:
			line = "%s set the crew's best %s: %s in" % [who, fname, Js.thousands(round(size_in))]
		if line != "":
			_send("_call", [line, key])
		_derby_catch(key, fish, size_in)
	_streak_reel(key, result == "perfect" and caught)


func _streak_reel(key: String, perfect: bool) -> void:
	var with: Array = company(key)
	if with.is_empty():
		return
	if perfect:
		_streak += 1
		for k: String in [key] + with:
			if not _streak_keys.has(k):
				_streak_keys.append(k)
		if _streak >= 2:
			_send("_streak_state", [_streak, _streak_keys])
		if _streak > 0 and _streak % 10 == 0:
			_crew_moment("crew_streak", float(_streak))
		if _streak > 0 and _streak % 10 == 0:
			_send("_call", ["Crew streak %d" % _streak, ""])
		return
	if _streak >= 2:
		var best: Dictionary = Js.obj(charter.data.get("crewStreak"))
		var names: Array = _streak_keys.map(func(k: String) -> String: return _name(k))
		if float(_streak) > Js.num(best.get("n")):
			charter.data["crewStreak"] = { "n": float(_streak), "names": names, "at": Js.iso(Clock.now_ms()) }
			charter.write()
			_send("_call", ["A new crew best streak: %d (%s)" % [_streak, ", ".join(PackedStringArray(names))], ""])
		else:
			_send("_call", ["%s broke the crew streak at %d" % [_name(key), _streak], ""])
	_streak = 0
	_streak_keys = []
	_send("_streak_state", [0, []])


## A derby action from a captain: ["start", kind].
func handle(key: String, args: Array) -> Dictionary:
	var verb: String = str(args[0]) if args.size() > 0 else ""
	if verb != "start":
		return { "error": "Not a derby order." }
	if not _derby.is_empty():
		return { "error": "A derby is already on." }
	var kind: String = str(args[1]) if args.size() > 1 else "biggest"
	if not DERBY_KINDS.has(kind):
		return { "error": "There is no such derby." }
	_derby = { "kind": kind, "by": _name(key), "scores": {}, "names": {} }
	_derby_end_ms = Time.get_ticks_msec() + int(DERBY_S * 1000.0)
	_derby_push()
	_send("_call", ["%s started a derby: %s, %d minutes" % [_name(key), DERBY_KINDS[kind], int(DERBY_S / 60.0)], ""])
	return { "ok": true }


func _derby_catch(key: String, fish: Dictionary, size_in: float) -> void:
	if _derby.is_empty():
		return
	var sc: Dictionary = _derby["scores"]
	_derby["names"][key] = _name(key)
	var cur: Dictionary = Js.obj(sc.get(key))
	if _derby["kind"] == "biggest":
		if size_in > Js.num(cur.get("v")):
			sc[key] = { "v": size_in, "label": "%s, %s in" % [fish.get("name", "?"), Js.thousands(round(size_in))] }
		else:
			return
	else:
		var seen: Array = Js.list(cur.get("seen")).duplicate()
		var id: float = Js.num(fish.get("id"))
		if seen.has(id):
			return
		seen.append(id)
		sc[key] = { "v": float(seen.size()), "seen": seen, "label": "%d species" % seen.size() }
	_derby_push()


func _derby_push() -> void:
	var st: Dictionary = {}
	if not _derby.is_empty():
		var rows: Array = []
		for k: String in _derby["scores"]:
			rows.append({ "key": k, "name": _derby["names"].get(k, "?"), "v": _derby["scores"][k]["v"], "label": _derby["scores"][k]["label"] })
		rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["v"]) > float(b["v"]))
		st = { "kind": _derby["kind"], "title": DERBY_KINDS[_derby["kind"]], "by": _derby["by"], "rows": rows,
			"left": maxf(0.0, float(_derby_end_ms - Time.get_ticks_msec()) / 1000.0) }
	_send("_derby_state", [st])


func _derby_finish() -> void:
	var rows: Array = []
	for k: String in _derby["scores"]:
		rows.append([k, float(_derby["scores"][k]["v"]), str(_derby["scores"][k]["label"])])
	rows.sort_custom(func(a: Array, b: Array) -> bool: return float(a[1]) > float(b[1]))
	var line: String = "The derby is over. Nobody landed a thing."
	var rec: Dictionary = { "kind": _derby["kind"], "at": Js.iso(Clock.now_ms()), "winner": "", "label": "" }
	if not rows.is_empty():
		var win: String = _derby["names"].get(rows[0][0], "?")
		line = "%s won the derby (%s): %s" % [win, DERBY_KINDS[_derby["kind"]], rows[0][2]]
		rec["winner"] = win
		rec["label"] = rows[0][2]
	if not charter.data.has("derbies"):
		charter.data["derbies"] = []
	(charter.data["derbies"] as Array).append(rec)
	# Every captain aboard landed a fish: the crew's Derby Day order.
	var aboard: int = (charter.raids.aboard.call() as Array).size() if charter.raids != null and charter.raids.aboard.is_valid() else 0
	if aboard >= 2 and (_derby["scores"] as Dictionary).size() >= aboard:
		_crew_moment("derby_full", float(aboard))
	if (charter.data["derbies"] as Array).size() > 30:
		charter.data["derbies"] = (charter.data["derbies"] as Array).slice(-30)
	charter.write()
	_derby = {}
	_derby_push()
	_send("_call", [line, ""])


## A crew moment for the crew's bounty order, written down once (in the
## founder's record; the board reads the whole crew's).
func _crew_moment(kind: String, value: float) -> void:
	var k: String = str(charter.data.get("founder", ""))
	var s: Session = charter.session_for(k)
	if s == null:
		return
	Bounties.log_event(s.store, s.uid, kind, value)
	charter.write(k)


func _process(_delta: float) -> void:
	if not hosting() or _derby.is_empty():
		return
	if Time.get_ticks_msec() >= _derby_end_ms:
		_derby_finish()


## Someone joining mid-way sees the streak and the derby as they are.
func welcome(id: int) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if _streak >= 2:
		_streak_state.rpc_id(id, _streak, _streak_keys)
	if not _derby.is_empty():
		_derby_push()


func drop(key: String) -> void:
	_pos.erase(key)


# ── Every game's side ─────────────────────────────────────────────────────────

@rpc("authority", "call_local", "reliable")
func _pop(key: String, pop: Dictionary) -> void:
	popped.emit(key, pop)


@rpc("authority", "call_local", "reliable")
func _call(text: String, about: String) -> void:
	called.emit(text, about)


@rpc("authority", "call_local", "reliable")
func _streak_state(n: int, keys: Array) -> void:
	streak = n
	streak_keys = keys
	streak_changed.emit(n, keys)


@rpc("authority", "call_local", "reliable")
func _derby_state(st: Dictionary) -> void:
	derby = st
	derby_got_ms = Time.get_ticks_msec()
	derby_changed.emit(st)
