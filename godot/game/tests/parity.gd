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
	_fishing(species, "res://tests/parity/fishing.json", "fishing")
	_fishing(species, "res://tests/parity/fishing_rest.json", "the rest of fishing and the loadout")
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


## One recorded call, run through the port. Returns the result (a dictionary,
## or null where the TS returned nothing), or "not ported".
func _call(db: CaptainStore, uid: String, save: Dictionary, op: String, a: Array) -> Variant:
	match op:
		"castLine": return Fishing.cast_line(db, uid, a[0], a[1])
		"reelIn": return Fishing.reel_in(db, uid, float(a[0]), a[1], a[2])
		"reelCrate": return Fishing.reel_crate(db, uid, a[0])
		"rerollWormhole": return Fishing.reroll_wormhole(db, uid)
		"tideTurnerSkip": return Fishing.tide_turner_skip(db, uid)
		"heldGolden": return Fishing.held_golden(db, uid)
		"sellGoldenTrophy": return Fishing.sell_golden_trophy(db, uid, float(a[0]))
		"mountGoldenTrophy": return Fishing.mount_golden_trophy(db, uid, float(a[0]))
		"claimFishingLevelRewards": return Fishing.claim_fishing_level_rewards(db, uid)
		"claimZoneReward": return Fishing.claim_zone_reward(db, uid, a[0])
		"prestigeZone": return Fishing.prestige_zone(db, uid, a[0])
		"releaseAncient": return Fishing.release_ancient(db, uid, float(a[0]))
		"setAutoFishing":
			Loadout.set_auto_fishing(db, uid, a[0])
			return null
		"setShowWaitTimer":
			Loadout.set_show_wait_timer(db, uid, a[0])
			return null
		"buySpecialItem": return Loadout.buy_special_item(db, uid, a[0])
		"equipSpecialItem": return Loadout.equip_special_item(db, uid, a[0])
		"buyHat": return Loadout.buy_hat(db, uid, a[0])
		"equipHat": return Loadout.equip_hat(db, uid, a[0])
		"buyBoat": return Loadout.buy_boat(db, uid, a[0])
		"equipBoat": return Loadout.equip_boat(db, uid, a[0])
		"equipPet": return Loadout.equip_pet(db, uid, a[0], a[1] if a.size() > 1 else "stern")
		"setCompletionistEffects": return Loadout.set_completionist_effects(db, uid, a[0])
		# The session's own setup between calls, replayed so both sides play the same save.
		"patchProfile":
			db.update_profile(uid, a[0])
			return null
		"patchSave":
			var patch: Dictionary = (a[0] as Dictionary).duplicate(true)
			for k: Variant in patch:
				save[k] = patch[k]
			return null
	return "not ported"
