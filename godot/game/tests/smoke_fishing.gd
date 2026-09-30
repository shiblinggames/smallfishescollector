extends SceneTree
## A SMOKE RUN OF THE FISHING LOOP (Godot port, stage 1).
##
## Opens the real game, puts the boat in the Shallows and fishes a dozen casts
## through the HUD (the bite wait skipped), so every path from the cast to the
## card runs at least once without anyone at the keyboard. It checks the loop
## does not break; the rules themselves are held by tests/parity.gd.
##
##   godot --headless --path godot/game -s tests/smoke_fishing.gd
##
## It plays on the most recent captain, or starts one; run it on a machine
## whose saves do not matter, or move them aside first.


func _init() -> void:
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	var sea: Sea = main.get_child(0)
	sea.session.save["bait"]["worm"] = 40.0
	sea._boat.position = Vector2(0, 2600)
	for f: int in 3:
		await process_frame
	var hud: FishingHud = sea._hud
	hud.refresh()
	# The game clock, pushed past each bite instead of waiting it out.
	var ahead: Array = [0.0]
	Clock.install(func() -> float: return Time.get_unix_time_from_system() * 1000.0 + float(ahead[0]))
	var cards: Dictionary = {}
	var bad: int = 0
	for i: int in 12:
		hud.cast()
		if hud.phase != "waiting":
			print("  cast %d did not go out (phase %s, cast button: %s)" % [i, hud.phase, hud._cast.text])
			bad += 1
			break
		hud._wait_left = 0.0
		ahead[0] = float(ahead[0]) + float(hud._shot["waitMs"]) + 1000.0
		var n: int = 0
		while hud.phase == "waiting" and n < 60:
			await process_frame
			n += 1
		# Half the casts strike wherever the needle is; the rest wait for it to
		# be over the catch zone, so the catch and crate cards run too.
		for f: int in randi_range(1, 30):
			await process_frame
		n = 0
		while i % 2 == 0 and not (hud._dial.zone_at(hud._dial.angle) in ["catch", "perfect"]) and n < 2000:
			await process_frame
			n += 1
		hud._dial.strike()
		n = 0
		while hud.phase == "reeling" and n < 600:
			await process_frame
			n += 1
		if hud.phase != "result" or hud._card == null:
			print("  cast %d ended in phase %s with no card" % [i, hud.phase])
			bad += 1
			continue
		var kind: String = (hud._card.get_child(0).get_child(0) as Label).text if hud._card.get_child(0).get_child_count() > 0 else "?"
		cards[kind] = int(cards.get(kind, 0)) + 1
		hud._close_card()
		hud._set_phase("idle")
	Clock.install(Callable())
	print("  %d casts, cards: %s" % [12, cards])
	print("  smoke %s" % ("FAILED" if bad > 0 else "ok"))
	quit(1 if bad > 0 else 0)
