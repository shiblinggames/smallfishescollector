extends SceneTree
## The Captain's Log's reads (core/journey.gd): every journey goal is a badge
## the port lists, bars follow the save, met bars read met, and the story
## lists cleared stops in map order with the next one open.


func _init() -> void:
	var made: Dictionary = Captains.create("journey-check")
	var s: Session = Session.new(made["save"], made["carried"])
	var p: Dictionary = s.profile()
	var ok: bool = true
	var ids: Dictionary = {}
	for d: Dictionary in Achievements.defs():
		ids[d["id"]] = true
	var gs: Array = Journey.groups(s.store, s.uid)
	var listed: int = 0
	for g: Dictionary in gs:
		for goal: Dictionary in g["goals"]:
			listed += 1
			if not ids.has(goal["id"]):
				print("FAIL not a port badge: ", goal["id"])
				ok = false
	if listed < 150:
		print("FAIL too few goals: ", listed)
		ok = false
	p["total_perfects"] = 300.0
	var sure: Dictionary = _goal(Journey.groups(s.store, s.uid), "sure_shot")
	var dead: Dictionary = _goal(Journey.groups(s.store, s.uid), "dead_eye")
	if not sure["done"] or dead["done"] or int(dead["current"]) != 300 or int(dead["target"]) != 1000:
		print("FAIL bars: ", sure, dead)
		ok = false
	var st: Dictionary = Journey.story(s.store, s.uid)
	if not (st["done"] as Array).is_empty() and st["done"][0]["label"] == "":
		print("FAIL story label")
		ok = false
	p["raid_node_progress"] = { "cleared": [Campaign.nodes()[0]["id"]] }
	st = Journey.story(s.store, s.uid)
	if (st["done"] as Array).size() < 1 or (st["next"] as Dictionary).is_empty():
		print("FAIL story: ", st["done"].size(), st["next"])
		ok = false
	if Journey.record(s.store, s.uid).size() < 10:
		print("FAIL record")
		ok = false
	print("journey ok" if ok else "journey FAILED")
	quit(0 if ok else 1)


func _goal(gs: Array, id: String) -> Dictionary:
	for g: Dictionary in gs:
		for goal: Dictionary in g["goals"]:
			if goal["id"] == id:
				return goal
	return {}
