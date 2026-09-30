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
	_fishing(species)
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


func _fishing(species: Array) -> void:
	var cases: Dictionary = _json("res://tests/parity/fishing.json")
	var calls: int = 0
	for s: Dictionary in cases["sessions"]:
		for key: String in ["start", "end"]:
			if SaveFile.deserialize(str(s[key]), species).has("error"):
				_fail("fishing %s: the %s save would not open" % [s["name"], key])
		calls += (s["ops"] as Array).size()
	# Stage 1 replays these through the ported cast and reel.
	pending += calls
	print("  fishing: PENDING, %d calls in %d sessions wait on the cast and reel port" % [calls, (cases["sessions"] as Array).size()])
