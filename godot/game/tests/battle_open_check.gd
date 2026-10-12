extends SceneTree
## A SOLO RAID OPENS WITH A FIGHT IN IT (2026-10-12): the real game on a fresh
## captain in a scratch folder sails to Pete's raid from the Gunwharf, and the
## fight screen must hold a fight (seats, an enemy, the fight number) and let
## its first turn be chosen. A line of the co-op walkthrough's (hiding the
## charting words) slid between the line's `if` and the solo fight's `else`
## and every solo raid opened empty; the rules checks never open the screen.
##
##   godot --headless --path godot/game -s tests/battle_open_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://battle_open_captains"
	for f: String in DirAccess.get_files_at(Captains.dir_override) if DirAccess.dir_exists_absolute(Captains.dir_override) else PackedStringArray():
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	Main.straight_to_sea = true
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	for f: int in 5:
		await process_frame
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	var p: Dictionary = sea.session.profile()
	p["expedition_xp"] = 2000.0
	check(sea._chart_fx != null, "the sea has its charting words (the path that broke)")
	sea._launch("corsairs_reckoning", "")
	var bst: BattleStage = null
	for f: int in 20:
		await process_frame
		for n: Node in sea._hud_layer.get_children():
			if n is BattleStage:
				bst = n
		if bst != null:
			break
	check(bst != null, "the raid opens its fight screen")
	if bst != null:
		check(not bst.b.is_empty(), "the solo fight has begun (b is not empty)")
		check(bst.b.has("seats") and (bst.b["seats"] as Array).size() == 1, "one seat, hers")
		check(bst.b.has("enemy") or bst.b.has("foes"), "an enemy to fight")
		check(int(Js.num(bst.b.get("fight"))) == 0, "the first fight")
		check(not sea._chart_fx.visible, "the charting words are kept off while the fight holds the screen")
		for f: int in 30:
			await process_frame
	print("  battle open check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(1 if bad > 0 else 0)
