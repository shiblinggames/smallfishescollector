extends SceneTree
## A LOOK AT THE SCREEN (Godot port): the real game, drawn, saved as a picture.
## Needs a window (not --headless). The boat is put in the Shallows and the
## dial is brought up; "night" in the arguments sets the clock to midnight.
##
##   godot --path godot/game -s tests/shot.gd -- <out.png> [night]
##
## Plays on the most recent captain; nothing is written to the save.


func _init() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out: String = args[0] if args.size() > 0 else "user://shot.png"
	var night: bool = args.has("night")
	var cycle: float = SeaClock.CYCLE_MS
	var base: float = floor(Time.get_unix_time_from_system() * 1000.0 / cycle) * cycle
	var at: float = base + cycle * (0.5 if night else 0.1)
	Clock.install(func() -> float: return at)
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	var sea: Sea = main.get_child(0)
	sea._boat.position = Vector2(-120, 2300)
	var hud: FishingHud = sea._hud
	hud._shot = { "fishId": 1.0, "catchDifficulty": 2.0, "biteRarity": 1.0, "waitMs": 9000.0 }
	hud._cast_zone = "shallows"
	hud._mods = hud._tackle()
	for f: int in 20:
		await process_frame
	hud._bite()
	for f: int in 40:
		await process_frame
	var img: Image = root.get_texture().get_image()
	img.save_png(out)
	print("  saved ", out, " ", img.get_size())
	quit()
