extends SceneTree
## THE REVEAL, PLAYED THROUGH (FinnReveal): a scratch captain with all six
## giants and the campaign cleared up to it opens The Finndicate Lives On on
## the sea, reads every line at a reading pace (answering the choice), and
## saves a picture a little after each cue's line comes up. Needs a window.
##
##   godot --path godot/game -s tests/reveal_film.gd -- <out folder> [node]
## node: the_hand_that_sharpens (the reveal, the default) or the_long_quiet.

const READ_S: float = 2.2


func _init() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out: String = args[0] if args.size() > 0 else "user://reveal_film"
	var nid: String = args[1] if args.size() > 1 else "the_hand_that_sharpens"
	DirAccess.make_dir_recursive_absolute(out)
	Captains.dir_override = "user://reveal_captains"
	DirAccess.make_dir_recursive_absolute(Captains.dir_override)
	for f: String in DirAccess.get_files_at(Captains.dir_override):
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	Main.straight_to_sea = true
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	for f: int in 20:
		await process_frame
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	var p: Dictionary = sea.session.profile()
	p["ancient_catches"] = [144.0, 145.0, 146.0, 147.0, 148.0, 143.0]
	p["expedition_xp"] = 9.0e7
	var cleared: Array = []
	for n: Dictionary in Rules.data()["campaign"]["nodes"]:
		if n["id"] == nid:
			break
		cleared.append(n["id"])
	p["raid_node_progress"] = { "cleared": cleared }
	sea._campaign.refresh()
	for f: int in 30:
		await process_frame
	# Where a captain is when it opens: at its mark on the northern water.
	var at: Variant = sea._campaign.node_at(nid)
	if at is Vector2:
		sea._boat.position = (at as Vector2) + Vector2(-320, 220)
		sea._boat.velocity = Vector2.ZERO
	for f: int in 90:
		await process_frame
	sea.open_node(nid)
	var sc: StoryScene = null
	for f: int in 60:
		await process_frame
		for n: Node in sea._hud_layer.find_children("", "StoryScene", true, false):
			sc = n
		if sc != null:
			break
	if sc == null:
		print("REVEAL: no scene opened")
		quit(1)
		return
	var shot_n: int = 0
	var last: int = -1
	var guard: int = 0
	while is_instance_valid(sc) and not sc._gone and guard < 400:
		guard += 1
		var i: int = sc._i
		if i != last:
			last = i
			var l: Dictionary = sc._lines[i]
			var cue: String = str(l.get("cue", ""))
			await create_timer(1.6 if cue != "" else 0.4).timeout
			if cue != "" or l.has("choice"):
				shot_n += 1
				var name: String = "%02d_%s.png" % [shot_n, cue if cue != "" else "choice"]
				root.get_texture().get_image().save_png("%s/%s" % [out, name])
				print("REVEAL shot ", name, "  line ", i + 1)
			await create_timer(maxf(0.0, READ_S - 1.6)).timeout
		if sc._choosing:
			await create_timer(0.8).timeout
			sc._answer()
		elif sc._typing:
			sc._press()
		elif sc._i >= sc._lines.size() - 1:
			await create_timer(2.5).timeout
			root.get_texture().get_image().save_png("%s/99_end.png" % out)
			sc._end(true)
		else:
			sc._press()
		await process_frame
	for f: int in 120:
		await process_frame
	root.get_texture().get_image().save_png("%s/99_after.png" % out)
	print("REVEAL done: stage ", sea.stage, " dark ", sea.cine_dark, " swell ", sea.cine_swell, " hud ", sea._hud.visible)
	quit()
