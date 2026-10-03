extends SceneTree
## THE CAMPAIGN'S WATER, by its rules: the Sea Gate lets a crewed ship out and
## holds an empty one; the anchorage's wall holds from both sides except in
## the gate's mouth; the campaign's water ends at RAID_EDGE; a shut bay sets a
## hull back on its rim with its line, and opens on the chapter before it.
##
##   godot --headless --path godot/game -s tests/campaign_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	var gate: Vector2 = North.SEA_GATE
	var inside: Vector2 = gate + Vector2(0, 200)
	var out: Vector2 = gate + Vector2(0, -200)
	North.gate_open = false
	var h: Dictionary = North.hold(inside, out)
	check(h["hit"] and h["why"] == "gate", "an empty ship is held at the gate")
	North.gate_open = true
	h = North.hold(inside, out)
	check(not h["hit"], "a crewed ship goes out through the gate")
	# The wall, from inside, away from the gate.
	var side: Vector2 = North.EXP_ORIGIN + Vector2(-North.EXP_EDGE + 200, -400)
	h = North.hold(side, side + Vector2(-400, 0))
	check(h["hit"] and h["why"] == "wall", "the wall holds from inside")
	# And from outside, coming back in away from the gate.
	var far: Vector2 = North.EXP_ORIGIN + Vector2(-North.EXP_EDGE - 400, -900)
	h = North.hold(far, far + Vector2(600, 0))
	check(h["hit"] and h["why"] == "wall", "the wall holds from outside")
	check((h["at"] as Vector2).distance_to(North.EXP_ORIGIN) >= North.EXP_EDGE, "held outside the rim")
	# Back in through the mouth.
	h = North.hold(out, inside)
	check(not h["hit"], "home through the gate")
	# The edge of the campaign's water.
	var edge: Vector2 = North.EXP_ORIGIN + Vector2(0, -North.RAID_EDGE + 20)
	h = North.hold(edge, edge + Vector2(0, -200))
	check(h["hit"] and h["why"] == "edge", "the campaign's water ends")
	# The bays: with nothing cleared, every bay but the first is shut.
	var bays: Array = Campaign.water()["bays"]
	CampaignWater.shut = bays.filter(func(b: Dictionary) -> bool: return b.get("opensBy") != null)
	check(CampaignWater.shut.size() == 4, "four bays shut at the start")
	var hand: Dictionary = bays[1]
	var c: Vector2 = Vector2(float(hand["centre"]["x"]), float(hand["centre"]["y"]))
	var r: float = float(hand["r"])
	var into: Vector2 = c + Vector2(r - 50, 0)
	var held: Dictionary = CampaignWater.hold(into)
	check(held["hit"], "a shut bay holds")
	check(absf((held["at"] as Vector2).distance_to(c) - (r + CampaignWater.SKIN)) < 0.5, "set back on its rim")
	check(str(held["line"]) == "A Bigger Fish is shut. Finish The Loose Thread first.", "its line: %s" % held["line"])
	var thread: Dictionary = bays[0]
	check(not CampaignWater.hold(Vector2(float(thread["centre"]["x"]), float(thread["centre"]["y"])))["hit"], "the first bay is open")
	# Every node on the water sits in its own bay's disc (or its strait).
	for e: Dictionary in Campaign.water()["encounters"]:
		var bay: Dictionary = CampaignWater.bay_at(Vector2(float(e["at"]["x"]), float(e["at"]["y"])))
		check(bay.get("id") == e["bay"], "%s rides in %s" % [e["node"], e["bay"]])
	# Every node of the map is somewhere on the water or is not a place.
	var placed: Dictionary = {}
	for e: Dictionary in Campaign.water()["encounters"] + Campaign.water()["beats"] + Campaign.water()["caches"]:
		placed[e["node"]] = true
	for n: Dictionary in Campaign.nodes():
		var on_water: bool = placed.has(n["id"])
		var fight: bool = n["type"] == "raid" or n["type"] == "skirmish"
		if not on_water and not (fight and str(n["id"]).ends_with("_challenge")) and not n.get("sideBranch") is Dictionary:
			check(false, "%s (%s) has no place on the water" % [n["id"], n["type"]])
	print("campaign water: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(1 if bad > 0 else 0)
