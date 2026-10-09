extends SceneTree
## EVERY CONVERTED WEB CAPTAIN OPENS AND PLAYS (the playtest's imports): each
## save in a folder (tools/import_web_captain.mts --out) is copied to a scratch
## folder, opened on the real sea, and every system's state read through the
## rules; anything that errors is named with its captain. No real captain is
## touched.
##
##   IMPORT_DIR=<folder> godot --headless --path godot/game -s tests/import_check.gd

const READS: Array = ["getCrewState", "getRaidMapView", "getUltimateState", "forgeState", "bountyState", "voyageState", "trawlState", "ordersState", "folkState", "parlorState", "skinsState", "getCasinoState", "getWorldChartState", "getDigState", "levelFloors"]


func _init() -> void:
	var src: String = OS.get_environment("IMPORT_DIR")
	if src == "" or not DirAccess.dir_exists_absolute(src):
		print("set IMPORT_DIR to a folder of converted captains")
		quit(1)
		return
	Captains.dir_override = "user://import_check"
	Main.straight_to_sea = true
	var files: Array = Array(DirAccess.get_files_at(src)).filter(func(f: String) -> bool: return f.ends_with(".json"))
	var bad: Array = []
	for f: String in files:
		DirAccess.make_dir_recursive_absolute(Captains.dir_override)
		for old: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, old])
		var loaded: Dictionary = SaveFile.deserialize(FileAccess.get_file_as_string("%s/%s" % [src, f]), [])
		if loaded.has("error"):
			bad.append("%s: does not open (%s)" % [f, loaded["error"]])
			continue
		DirAccess.copy_absolute("%s/%s" % [src, f], "%s/%s.json" % [Captains.dir_override, (loaded["save"] as Dictionary)["uid"]])
		var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
		root.add_child(main)
		for k: int in 6:
			await process_frame
		var sea: Sea = main.get_child(main.get_child_count() - 1) as Sea
		if sea == null or sea.session == null:
			bad.append("%s: the sea did not open" % f)
		else:
			for op: String in READS:
				var r: Variant = RulesApi.run(sea.session.store, sea.session.uid, op, [])
				if r == null:
					bad.append("%s: %s returned nothing" % [f, op])
		main.queue_free()
		await process_frame
	for b: String in bad:
		print("  FAILED: " + b)
	print("import check: %d captains, %s" % [files.size(), "ok" if bad.is_empty() else "%d failed" % bad.size()])
	quit(1 if not bad.is_empty() else 0)
