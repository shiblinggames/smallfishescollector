extends SceneTree
## THE PARITY RUNNER (Godot port, stage 0).
##
## Replays the cases web/scripts/parity-export.mts wrote from the TypeScript
## rules (tests/parity/*.json) and fails on the first difference in each. The
## TS is the spec: when a case fails here, the port is wrong, not the case.
##
##   godot --headless --path godot/game -s tests/parity.gd
##
## (tools/parity.mjs runs the export, imports the project and runs this.)
##
## A system whose rules are not ported yet is reported as PENDING with how many
## calls wait on it; the run still passes, so stages can land one at a time.

var failed: int = 0
var pending: int = 0


func _init() -> void:
	var species: Array = _json("res://content/fish_species.json")
	_dice()
	_saves(species)
	_daily()
	_hotspots()
	_bottles()
	_fishing(species, "res://tests/parity/fishing.json", "fishing")
	_fishing(species, "res://tests/parity/fishing_rest.json", "the rest of fishing and the loadout")
	_fishing(species, "res://tests/parity/shop.json", "selling and the tackle shop")
	print("")
	if failed > 0:
		print("  %d FAILED" % failed)
	else:
		print("  parity ok%s" % ("" if pending == 0 else " (%d calls pending a port)" % pending))
	quit(1 if failed > 0 else 0)


func _fail(msg: String) -> void:
	failed += 1
	print("  FAIL " + msg)


func _json(path: String) -> Variant:
	var text: String = FileAccess.get_file_as_string(path)
	if text == "":
		_fail("%s is missing (run tools/parity.mjs)" % path)
		return []
	return JsJson.parse(text)


func _dice() -> void:
	var cases: Dictionary = _json("res://tests/parity/dice.json")
	var n: int = 0
	for seq: Dictionary in cases["sequences"]:
		var rng: Dice.Mulberry32 = Dice.Mulberry32.new(int(seq["seed"]))
		var values: Array = seq["values"]
		for i: int in values.size():
			var got: int = rng.next_u32()
			if got != int(values[i]):
				_fail("dice: seed %d, roll %d gave %d, the TS gave %d" % [int(seq["seed"]), i, got, int(values[i])])
				break
			n += 1
	for h: Dictionary in cases["hashes"]:
		var got: int = Dice.seed_of(str(h["text"]))
		if got != int(h["seed"]):
			_fail("dice: seed_of(%s) gave %d, the TS gave %d" % [JsJson.short(h["text"]), got, int(h["seed"])])
		n += 1
	# The float the rules see is the integer over 2^32, exactly.
	var r: Dice.Mulberry32 = Dice.Mulberry32.new(2026)
	var first: float = r.next()
	if first != float(int((cases["sequences"][2] as Dictionary)["values"][0])) / Dice.TWO_32:
		_fail("dice: the float roll is not the integer over 2^32")
	print("  dice: %d rolls and hashes match" % n)


func _saves(species: Array) -> void:
	var cases: Dictionary = _json("res://tests/parity/save.json")
	var exact: int = 0
	var saves: Array = cases["saves"]
	for c: Dictionary in saves:
		var text: String = c["text"]
		var loaded: Dictionary = SaveFile.deserialize(text, species)
		if loaded.has("error"):
			_fail("save %s: %s" % [c["name"], loaded["error"]])
			continue
		if (loaded["save"] as Dictionary)["species"] != species:
			_fail("save %s: the species were not attached" % c["name"])
		var again: String = SaveFile.serialize(loaded["save"], loaded["carried"], loaded["saved_at"])
		var d: String = JsJson.diff(JsJson.parse(text), JsJson.parse(again))
		if d != "":
			_fail("save %s: written back differently at %s" % [c["name"], d])
		elif again == text:
			exact += 1
	var refused: Dictionary = SaveFile.deserialize('{"format":"seasthebooty-local-save","version":99,"save":{}}', species)
	if not refused.has("error"):
		_fail("save: a save from a newer game was opened")
	if not SaveFile.deserialize("{}", species).has("error"):
		_fail("save: a file that is not a save was opened")
	print("  saves: %d read and written back as the same data (%d byte for byte); a newer or foreign file refused" % [saves.size(), exact])


func _daily() -> void:
	var cases: Dictionary = _json("res://tests/parity/daily.json")
	var n: int = 0
	for day: Dictionary in cases["days"]:
		var picks: Dictionary = day["picks"]
		for level: Variant in picks:
			var got: Array = []
			for c: Dictionary in Daily.challenges(day["date"], float(str(level).to_int())):
				got.append(c["label"])
			var d: String = JsJson.diff(got, picks[level])
			if d != "":
				_fail("daily: %s at level %s differs at %s" % [day["date"], level, d])
				return
			n += 1
	print("  daily: %d days-and-levels deal the same challenges" % n)


func _hotspots() -> void:
	var cases: Dictionary = _json("res://tests/parity/hotspots.json")
	var n: int = 0
	for c: Dictionary in cases["cases"]:
		var d: String = JsJson.diff(JsJson.parse(JsJson.stringify(Hotspots.at_time(float(c["now"])))), c["spots"])
		if d != "":
			_fail("hotspots at %s differ at %s" % [str(c["now"]), d])
			return
		n += 1
	print("  hotspots: %d moments stand the same patches" % n)


static func _near(a: float, b: float) -> bool:
	return absf(a - b) <= 1e-9 * maxf(1.0, absf(b))


func _bottles() -> void:
	var cases: Dictionary = _json("res://tests/parity/bottles.json")
	var n: int = 0
	for c: Dictionary in cases["cases"]:
		var got: Array = Explore.bottles_around(float(c["x"]), float(c["y"]), 5200.0, float(c["now"]))
		var want: Array = c["bottles"]
		if got.size() != want.size():
			_fail("bottles at %s: %d drifting, the TS has %d" % [str(c["now"]), got.size(), want.size()])
			return
		for k: int in got.size():
			var g: Dictionary = got[k]
			var w: Dictionary = want[k]
			# Godot's JSON reader rounds a 17-digit number in its last place, so
			# the coordinates are compared to that, not bit for bit.
			if g["key"] != w["key"] or not _near(float(g["x"]), float(w["x"])) or not _near(float(g["y"]), float(w["y"])) or float(g["seed"]) != float(w["seed"]):
				_fail("bottle %s differs: %s against %s" % [w["key"], str(g), str(w)])
				return
			var pos: Dictionary = Explore.bottle_pos(g, float(c["now"]) / 1000.0)
			if absf(float(pos["x"]) - float(w["pos"]["x"])) > 1e-6 or absf(float(pos["y"]) - float(w["pos"]["y"])) > 1e-6:
				_fail("bottle %s drifts to %s, the TS to %s" % [w["key"], str(pos), str(w["pos"])])
				return
			n += 1
	print("  bottles: %d bottles in %d moments float in the same places" % [n, cases["cases"].size()])


## Replay each session through the ported cast and reel: the same start save,
## the same seed, the clock each call ran at. Every call's result and roll
## count must match, and the save must end the same. A session stops at its
## first difference, which is the one worth reading.
func _fishing(species: Array, file: String, title: String) -> void:
	var cases: Dictionary = _json(file)
	var matched: int = 0
	var sessions: Array = cases["sessions"]
	for s: Dictionary in sessions:
		var loaded: Dictionary = SaveFile.deserialize(str(s["start"]), species)
		if loaded.has("error"):
			_fail("fishing %s: the start save would not open" % s["name"])
			continue
		var save: Dictionary = loaded["save"]
		var db: CaptainStore = CaptainStore.new(save)
		var uid: String = save["uid"]
		var now: Array = [0.0]
		Dice.install(Dice.Mulberry32.new(int(s["seed"])))
		Clock.install(func() -> float: return now[0])
		var ok: bool = true
		var ops: Array = s["ops"]
		for n: int in ops.size():
			var op: Dictionary = ops[n]
			var args: Array = op["args"]
			now[0] = float(op["now"])
			Dice.rolls = 0
			var got: Dictionary
			var called: Variant = _call(db, uid, save, op["op"], args)
			if typeof(called) == TYPE_STRING and called == "not ported":
				_fail("%s %s: call %d is %s, which is not ported" % [title, s["name"], n, op["op"]])
				ok = false
				break
			got = called if typeof(called) == TYPE_DICTIONARY else {}
			var result_null: bool = called == null
			var normalized: Variant = null if result_null else JsJson.parse(JsJson.stringify(called))
			var d: String = JsJson.diff(normalized, op["result"])
			if d != "":
				_fail("%s %s: call %d (%s) differs at %s" % [title, s["name"], n, op["op"], d.replace("$", "result")])
				ok = false
				break
			if Dice.rolls != int(op["rolls"]):
				_fail("%s %s: call %d (%s) took %d rolls, the TS took %d" % [title, s["name"], n, op["op"], Dice.rolls, int(op["rolls"])])
				ok = false
				break
			matched += 1
		Dice.install(null)
		Clock.install(Callable())
		if not ok:
			continue
		var end_d: String = JsJson.diff(JsJson.parse(SaveFile.serialize(save, {}, "x")).get("save"), (JsJson.parse(str(s["end"])) as Dictionary).get("save"))
		if end_d != "":
			_fail("fishing %s: every call matched but the save ends differently at %s" % [s["name"], end_d.replace("$", "save")])
	print("  %s: %d calls in %d sessions replayed" % [title, matched, sessions.size()])


## One recorded call, run through the port (RulesApi), with the session's own
## setup between calls replayed so both sides play the same save.
func _call(db: CaptainStore, uid: String, save: Dictionary, op: String, a: Array) -> Variant:
	match op:
		"patchProfile":
			db.update_profile(uid, a[0])
			return null
		"patchSave":
			var patch: Dictionary = (a[0] as Dictionary).duplicate(true)
			for k: Variant in patch:
				save[k] = patch[k]
			return null
	return RulesApi.run(db, uid, op, a)
