extends SceneTree
## PLAYTEST PROGRESS STAYS IN THE PLAYTEST (game/playtest.gd): a test build
## stamps what it writes and imports a captain's save; the store game refuses
## an import and moves stamped captains and Charters aside (none deleted).
## Scratch folders only: no real captain is touched.
##
##   godot --headless --path godot/game -s tests/playtest_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://pt_check/captains"
	Charter.dir_override = "user://pt_check/charters"
	Playtest.archive = "user://pt_check/archive"
	for d: String in [Captains.dir_override, Charter.dir_override, Playtest.archive + "/captains", Playtest.archive + "/charters"]:
		DirAccess.make_dir_recursive_absolute(d)
		for f: String in DirAccess.get_files_at(d):
			DirAccess.remove_absolute("%s/%s" % [d, f])
	ProjectSettings.set_setting("game/channel", "playtest")
	# A captain made in a test build is stamped.
	var s: Session = Captains.make("Tester")
	var made: Dictionary = Captains.open(s.uid)
	check((made["save"] as Dictionary).get("playtest", false) == true, "a test build's captain is stamped")
	# Import: a save written elsewhere comes in as a captain, stamped.
	var outside: String = ProjectSettings.globalize_path("user://pt_check/outside.json")
	var fresh: Dictionary = Captains.create("web-captain-1")
	(fresh["save"]["profile"] as Dictionary)["username"] = "webby"
	(fresh["save"] as Dictionary).erase("species")
	SaveFile.write_file(outside, SaveFile.serialize(fresh["save"], {}, Js.iso(Clock.now_ms())))
	var r: Dictionary = Captains.import_file(outside)
	check(r.get("name") == "webby", "an import lands (%s)" % str(r))
	check(Captains.list().has("web-captain-1"), "and is listed")
	check(Captains.import_file(ProjectSettings.globalize_path("res://project.godot")).has("error"), "a file that is not a save is refused")
	# A Charter file written by a test build.
	var ch: Dictionary = { "id": "charter-x", "berths": [] }
	Playtest.stamp(ch)
	SaveFile.write_file(ProjectSettings.globalize_path(Charter.dir_override + "/charter-x.json"), JsJson.stringify(ch))
	# An unstamped captain (as the store game writes) stays put.
	SaveFile.write_file(ProjectSettings.globalize_path(Captains.dir_override + "/kept.json"), SaveFile.serialize(Captains.create("kept")["save"], {}, "x"))
	check(Playtest.sweep() == 0, "a test build sweeps nothing")
	# The store game.
	ProjectSettings.set_setting("game/channel", "game")
	check(Captains.import_file(outside).has("error"), "the store game refuses an import")
	var moved: int = Playtest.sweep()
	check(moved == 3, "the store game sets aside both captains and the Charter (%d)" % moved)
	check(Captains.list() == ["kept"], "only the unstamped captain is left (%s)" % str(Captains.list()))
	check(DirAccess.get_files_at(Playtest.archive + "/captains").size() == 2 and DirAccess.get_files_at(Playtest.archive + "/charters").size() == 1, "nothing deleted: they wait in the archive")
	ProjectSettings.set_setting("game/channel", "dev")
	print("playtest check: %s" % ("ok" if bad == 0 else "%d failed" % bad))
	quit(1 if bad > 0 else 0)
