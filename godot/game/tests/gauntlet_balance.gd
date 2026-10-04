extends "res://tests/gauntlet_check.gd"
## How deep bots get (always diving), alone and as parties of two to four,
## in each descent: the party field's tuning probe (port rules
## battle.gauntlet.party). Not a pass/fail check.
##
##   godot --headless --path godot/game -s tests/gauntlet_balance.gd


func _init() -> void:
	Captains.dir_override = "user://gauntlet_balance_captains"
	Charter.dir_override = "user://gauntlet_balance_charters"
	for dd: String in [Captains.dir_override, Charter.dir_override]:
		if DirAccess.dir_exists_absolute(dd):
			for f: String in DirAccess.get_files_at(dd):
				DirAccess.remove_absolute("%s/%s" % [dd, f])
	await process_frame
	var runs: int = int(OS.get_environment("RUNS")) if OS.get_environment("RUNS") != "" else 6
	for variant: String in ["davy", "don"]:
		for n: int in [1, 2, 3, 4]:
			var depths: Array = []
			for k: int in runs:
				Dice.install(Dice.Mulberry32.new(100 + k * 7 + n))
				seed(100 + k)
				var c: Charter = Charter.found("Probe %s %d %d" % [variant, n, k], false, "k0", "Captain 0")
				var ss: Dictionary = { "k0": c.session_for("k0") }
				for i: int in range(1, n):
					ss["k%d" % i] = c.add_member("k%d" % i, "Captain %d" % i)
				for kk: String in ss:
					_strong(ss[kk], true)
				var gt: GauntletTable = GauntletTable.new()
				root.add_child(gt)
				gt.charter = c
				c.gauntlets = gt
				var at: Vector2 = GauntletTable.maelstrom_of(variant)
				var here: Dictionary = { "variant": variant, "x": at.x, "y": at.y }
				var act: Callable = func(key: String, args: Array) -> Dictionary:
					var r: Variant = await c.run(ss[key], "gauntletTable", args)
					return r if r is Dictionary else {}
				await act.call("k0", ["call", here])
				if n > 1:
					await act.call("k0", ["mode", "coop"])
				for i2: int in range(1, n):
					await act.call("k%d" % i2, ["join", here])
					await act.call("k%d" % i2, ["ready", true])
				await act.call("k0", ["go"])
				var r: Dictionary = await _play(gt, ss.keys(), act, 40, 20000)
				depths.append(int(r["depth"]))
				gt.queue_free()
			depths.sort()
			var tot: float = 0.0
			for d: int in depths:
				tot += d
			print("  %s, %d captain%s: mean depth %.1f, median %d  %s" % [variant, n, "" if n == 1 else "s", tot / depths.size(), depths[depths.size() / 2], str(depths)])
	quit(0)
