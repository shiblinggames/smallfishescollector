extends "res://tests/gauntlet_check.gd"
## THE REACTIONS (co-op gauntlets): every pairing set up on a live co-op
## battle and fired, checked for its effect; then the same hits alone (one
## captain holding both elements, and a solo dive) set off nothing.
##
##   godot --headless --path godot/game -s tests/reaction_check.gd


func _init() -> void:
	Captains.dir_override = "user://reaction_check_captains"
	Charter.dir_override = "user://reaction_check_charters"
	for dd: String in [Captains.dir_override, Charter.dir_override]:
		if DirAccess.dir_exists_absolute(dd):
			for f: String in DirAccess.get_files_at(dd):
				DirAccess.remove_absolute("%s/%s" % [dd, f])
	await process_frame
	Dice.install(Dice.Mulberry32.new(11))
	var c: Charter = Charter.found("Reaction check", false, "k0", "Captain 0")
	var ss: Dictionary = { "k0": c.session_for("k0") }
	for i: int in range(1, 3):
		ss["k%d" % i] = c.add_member("k%d" % i, "Captain %d" % i)
	for kk: String in ss:
		_strong(ss[kk], true)
	var gt: GauntletTable = GauntletTable.new()
	root.add_child(gt)
	gt.charter = c
	c.gauntlets = gt
	var at: Vector2 = GauntletTable.maelstrom_of("davy")
	var here: Dictionary = { "variant": "davy", "x": at.x, "y": at.y }
	var act: Callable = func(key: String, args: Array) -> Dictionary:
		var r: Variant = await c.run(ss[key], "gauntletTable", args)
		return r if r is Dictionary else {}
	await act.call("k0", ["call", here])
	await act.call("k0", ["mode", "coop"])
	for i2: int in range(1, 3):
		await act.call("k%d" % i2, ["join", here])
		await act.call("k%d" % i2, ["ready", true])
	await act.call("k0", ["go"])
	var b: Dictionary = gt._r["b"]
	check(not b.is_empty() and (b["seats"] as Array).size() == 3, "a three-captain dive is under way")
	# Each case: lay the elements, land a hit by `si` with `act`, expect `id`.
	var cases: Array = [
		["fog_bank", 1, "fire", { "fire": 0, "ice": 1 }],
		["greek_fire", 1, "fire", { "fire": 0, "corrode": 1 }],
		["powder_keg", 1, "volley", { "fire": 0 }],
		["brittle_hull", 1, "volley", { "ice": 0 }],
		["crushing_deep", 1, "fire", { "ice": 0, "coils": 1 }],
		["boiling_sea", 1, "fire", { "fire": 0, "coils": 1 }],
		["rot", 1, "fire", { "corrode": 0, "feeble": 1 }],
		["numbed", 1, "fire", { "weaken": 0, "ice": 1 }],
		["last_rites", 1, "mega", { "marked": 0 }],
		["davys_kiss", 2, "fire", { "fire": 0, "ice": 1, "corrode": 2 }],
	]
	for cs: Array in cases:
		var e: Dictionary = _field(b)
		_lay(b, e, cs[3])
		var ev: Array = []
		Battle._reactions(b, int(cs[1]), e, str(cs[2]), 100.0, ev)
		var got: Array = ev.filter(func(x: Dictionary) -> bool: return x["t"] == "reaction")
		check(got.size() == 1 and got[0]["id"] == cs[0], "%s goes off (got %s)" % [cs[0], str(got.map(func(x: Dictionary) -> String: return str(x["id"])))])
		if got.size() == 1 and got[0]["id"] == cs[0]:
			_effect(b, e, str(cs[0]), got[0])
		# Once a ship a round.
		var ev2: Array = []
		_lay(b, e, cs[3])
		Battle._reactions(b, int(cs[1]), e, str(cs[2]), 100.0, ev2)
		check(ev2.filter(func(x: Dictionary) -> bool: return x["t"] == "reaction").is_empty(), "%s: once a ship a round" % cs[0])
	# One captain holding both: nothing.
	var e2: Dictionary = _field(b)
	_lay(b, e2, { "fire": 1, "ice": 1 })
	var ev3: Array = []
	Battle._reactions(b, 1, e2, "fire", 100.0, ev3)
	check(ev3.is_empty(), "one captain's fire and ice set off nothing")
	# A solo dive: nothing, and nothing written.
	var solo: Dictionary = { "gauntlet": "davy", "seats": [b["seats"][0]], "fight": 0.0, "turn": 1.0, "foes": [] }
	var e3: Dictionary = _field(solo)
	Battle._el(solo, e3, "fire", 0)
	check(not e3.has("elBy"), "a solo dive writes no elements")
	gt.queue_free()
	print("  reaction check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)


## A fresh field of two enemy ships (the first is the one hit).
func _field(b: Dictionary) -> Dictionary:
	var mk: Callable = func() -> Dictionary:
		return { "id": "x", "name": "Test Hull", "hp": 1000.0, "max": 1000.0, "shield": 50.0, "statuses": {}, "burn": {}, "freeze": 0.0,
			"frozenNow": false, "grip": {}, "phase": 1.0, "phases": [], "boss": false, "affix": {}, "charges": 0.0, "mag": 3.0 }
	var e: Dictionary = mk.call()
	b["foes"] = [e, mk.call()]
	b["enemy"] = e
	b["turn"] = float(b.get("turn", 1.0)) + 1.0
	return e


func _lay(b: Dictionary, e: Dictionary, els: Dictionary) -> void:
	for k: String in els:
		var si: int = int(els[k])
		match k:
			"fire": e["burn"] = { "turns": 2.0, "dmg": 10.0, "by": float(si) }
			"ice": e["freeze"] = 1.0
			"coils": e["grip"] = { str(si): 2.0 }
			_: Battle.apply_status(e["statuses"], k, 0.2, 2.0)
		Battle._el(b, e, k, si)


func _effect(b: Dictionary, e: Dictionary, id: String, x: Dictionary) -> void:
	var other: Dictionary = b["foes"][1]
	match id:
		"fog_bank": check(Js.num(e.get("fogged")) > 0.0 and Js.num(e.get("freeze")) == 0.0, "fog bank: fogged, ice melted")
		"greek_fire": check(not Js.obj(other.get("burn")).is_empty(), "greek fire: the other ship burns")
		"powder_keg": check(float(other["hp"]) < 1000.0 and Js.obj(e.get("burn")).is_empty(), "powder keg: splash, fire spent")
		"brittle_hull": check(float(e["hp"]) + float(e["shield"]) < 1050.0, "brittle hull: extra damage")
		"crushing_deep": check(float(e["hp"]) + float(e["shield"]) < 1050.0 and float(other["hp"]) < 1000.0, "crushing deep: crush and splinter")
		"boiling_sea": check(float(e["burn"]["dmg"]) > 10.0 and e["burn"].get("boiled", false), "boiling sea: hotter burn")
		"rot": check(float(e["shield"]) == 0.0, "rot: barrier gone")
		"numbed": check(Js.num(e.get("freeze")) >= 2.0, "numbed: longer freeze")
		"last_rites": check(float(e["hp"]) < 1000.0 and float(e["shield"]) == 50.0, "last rites: straight past the barrier")
		"davys_kiss": check(float(other["hp"]) < 1000.0 and float(b.get("kissFight", -1.0)) == float(b["fight"]), "davy's kiss: every ship, once a fight")
