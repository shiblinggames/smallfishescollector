extends SceneTree
## WHEN A FISH BITES BEST (core/fish_bias.gd): a nudge moves fish only within
## their own rarity. 40,000 picks in the Shallows with and without the Night
## nudge: each rarity's share holds; the nudged fish's share within its
## rarity rises by about its boost.
##
##   godot --headless --path godot/game -s tests/bias_check.gd

func _init() -> void:
	var species: Array = JsJson.parse(FileAccess.get_file_as_string("res://content/fish_species.json"))
	var shallows: Array = species.filter(func(f: Dictionary) -> bool: return f["habitat"] == "shallows" and Js.num(f.get("sell_value")) > 0.0)
	var cat: Dictionary = shallows.filter(func(f: Dictionary) -> bool: return f["name"] == "Channel Catfish")[0]
	var runs: Array = []
	for nudged: bool in [false, true]:
		FishingRules._nudge = { float(cat["id"]): 1.25 } if nudged else {}
		var by_r: Dictionary = {}
		var cats: int = 0
		for i: int in 40000:
			var f: Dictionary = FishingRules.tier_weighted_pick(shallows, "shallows", 0.0)
			by_r[float(f["bite_rarity"])] = int(by_r.get(float(f["bite_rarity"]), 0)) + 1
			if f["id"] == cat["id"]:
				cats += 1
		runs.append([by_r, cats])
	FishingRules._nudge = {}
	var bad: int = 0
	for r: Variant in runs[0][0]:
		var a: float = float(runs[0][0][r]) / 40000.0
		var b: float = float(runs[1][0].get(r, 0)) / 40000.0
		if absf(a - b) > 0.012:
			bad += 1
			print("  FAILED: rarity %d share moved %.3f -> %.3f" % [int(r), a, b])
	var lift: float = float(runs[1][1]) / maxf(1.0, float(runs[0][1]))
	print("  catfish x%.2f within its rarity (want about 1.2)" % lift)
	if lift < 1.08 or lift > 1.35:
		bad += 1
	print("  bias %s" % ("FAILED" if bad > 0 else "ok"))
	quit(1 if bad > 0 else 0)
