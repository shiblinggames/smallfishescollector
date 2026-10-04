extends SceneTree
## What co-op packs roll: escorts, roles, mixes and combos by depth and party
## size (port rules battle.gauntlet.packs). Not a pass/fail check.
##
##   godot --headless --path godot/game -s tests/pack_probe.gd


func _init() -> void:
	Dice.install(Dice.Mulberry32.new(7))
	for v: String in ["davy", "don"]:
		for n: int in [2, 3, 4]:
			for d: int in ([5, 12, 20, 30, 40] if v == "davy" else [2, 4, 6, 8, 10]):
				var ships: float = 0.0
				var roles: Dictionary = {}
				var combos: Dictionary = {}
				var mixed: int = 0
				var N: int = 400
				for k: int in N:
					var st: Dictionary = { "cleared": d - 1, "prevWasBoss": true, "roundsSinceBoss": 0 }
					var f: Dictionary = Gauntlet.generate_fight(st, 0, {}, v).duplicate()
					var es: Array = Gauntlet.escorts(f, n, {}, v)
					ships += es.size()
					if str(f.get("pack", "")).contains(" and "):
						mixed += 1
					for x: Dictionary in es:
						if str(x["role"]) != "":
							roles[x["role"]] = int(roles.get(x["role"], 0)) + 1
						if x.has("combo") and x["combo"]["half"] == "role":
							combos[x["combo"]["id"]] = int(combos.get(x["combo"]["id"], 0)) + 1
				print("  %s n=%d d=%d: escorts %.2f, mixed %d%%, roles %s, combos %s" % [v, n, d, ships / N, mixed * 100 / N, str(roles), str(combos)])
	quit(0)
