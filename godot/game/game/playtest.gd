class_name Playtest
extends RefCounted
## PLAYTEST PROGRESS STAYS IN THE PLAYTEST (Kong, 2026-10-09: web testers'
## captains can be brought in while testing, "and then wipe out their accounts
## once we do the full production release").
##
## The build's channel is game/channel (tools/build.mjs writes it into the
## build's override.cfg: "playtest" or "game"; "dev" running from the editor).
## Every captain and Charter written by a build that is not the store game is
## stamped "playtest". The store game's title screen moves stamped files aside
## into user://playtest_archive (nothing is deleted), so everyone starts the
## release as a new captain, and only a test build offers "Import a captain".


## Where the store game sets playtest files aside; tests point it elsewhere.
static var archive: String = "user://playtest_archive"


static func channel() -> String:
	return str(ProjectSettings.get_setting("game/channel", "dev"))


static func release() -> bool:
	return channel() == "game"


## Mark a save (or a Charter's data) as written by a test build.
static func stamp(d: Dictionary) -> void:
	if not release():
		d["playtest"] = true


## The store game: every stamped captain and Charter moved to the archive.
## Returns how many moved.
static func sweep() -> int:
	if not release():
		return 0
	var moved: int = 0
	for pair: Array in [[Captains._dir(), "captains"], [Charter._dir(), "charters"]]:
		var from: String = pair[0]
		if not DirAccess.dir_exists_absolute(from):
			continue
		var to: String = "%s/%s" % [archive, pair[1]]
		for f: String in DirAccess.get_files_at(from):
			if not f.ends_with(".json"):
				continue
			var d: Variant = JsJson.parse(FileAccess.get_file_as_string("%s/%s" % [from, f]))
			if not d is Dictionary:
				continue
			var stamped: bool = (d as Dictionary).get("playtest", false) == true or Js.obj((d as Dictionary).get("save")).get("playtest", false) == true
			if not stamped:
				continue
			DirAccess.make_dir_recursive_absolute(to)
			if DirAccess.rename_absolute("%s/%s" % [from, f], "%s/%s" % [to, f]) == OK:
				moved += 1
	return moved
