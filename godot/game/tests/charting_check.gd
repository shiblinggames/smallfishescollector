extends SceneTree
## CHARTING THE NORTHERN WATER (Godot port, core/charting.gd): new patches pay
## Navigation XP once, charted water pays nothing again, the fishing sea pays
## nothing, and a bay charted nearly whole pays its bonus once.
##
##   godot --headless --path godot/game -s tests/charting_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://charting_check_captains"
	await process_frame
	var made: Dictionary = Captains.create(Captains.new_id())
	var s: Session = Session.new(made["save"], made["carried"])
	var xp: Callable = func() -> float: return Js.num(s.profile().get("expedition_xp"))
	var thread: Array = []
	for k: int in Explore.xfog_cells():
		if Charting.area(k) == "thread":
			thread.append(k)
	check(thread.size() > 50, "the Loose Thread has its patches (%d)" % thread.size())
	var x0: float = xp.call()
	var r: Dictionary = RulesApi.run(s.store, s.uid, "saveSeaPosition", [0.0, -9000.0, [], thread.slice(0, 10)])
	check(is_equal_approx(xp.call() - x0, 60.0) and is_equal_approx(Js.num(r.get("charted")), 60.0), "ten new Chapter I patches pay 60 XP (%s)" % (xp.call() - x0))
	var x1: float = xp.call()
	RulesApi.run(s.store, s.uid, "saveSeaPosition", [0.0, -9000.0, [], thread.slice(0, 10)])
	check(xp.call() == x1, "the same patches pay nothing again")
	RulesApi.run(s.store, s.uid, "saveSeaPosition", [0.0, 3000.0, [Explore.fog_index(0.0, 3000.0), Explore.fog_index(700.0, 3000.0)], []])
	check(xp.call() == x1, "the fishing sea's fog pays nothing")
	var r2: Dictionary = RulesApi.run(s.store, s.uid, "saveSeaPosition", [0.0, -9000.0, [], thread])
	var rest: float = 6.0 * float(thread.size() - 10)
	check(is_equal_approx(xp.call() - x1, rest + Charting.BONUS["thread"]), "the rest of the bay and its bonus (%s)" % (xp.call() - x1))
	check(Js.list(r2.get("chartedDone")).size() == 1, "the bay is called charted")
	var x2: float = xp.call()
	var between: int = -1
	for k2: int in Explore.xfog_cells():
		if Charting.area(k2) == "":
			between = k2
			break
	RulesApi.run(s.store, s.uid, "saveSeaPosition", [0.0, -9000.0, [], [between]])
	check(is_equal_approx(xp.call() - x2, Charting.NORTH_OTHER), "a patch between the bays pays %s" % Charting.NORTH_OTHER)
	print("charting check: %s" % ("ok" if bad == 0 else "%d failed" % bad))
	quit(1 if bad > 0 else 0)
