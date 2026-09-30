extends SceneTree
## A SMOKE RUN OF THE FISHING LOOP (Godot port).
##
## Opens the real game on a fresh captain (saved in a scratch folder, so no
## real captain is touched), puts the boat in the Shallows and fishes through
## the HUD with the bite wait skipped and the game clock pushed past each
## bite: half the strikes land wherever the needle is, half wait for the catch
## zone; a stretch of casts is forced golden; level-ups are closed and goldens
## answered (sold and mounted in turn). It checks the loop never breaks; the
## rules themselves are held by tests/parity.gd.
##
##   godot --headless --path godot/game -s tests/smoke_fishing.gd


func _init() -> void:
	Captains.dir_override = "user://smoke_captains"
	for f: String in DirAccess.get_files_at(Captains.dir_override) if DirAccess.dir_exists_absolute(Captains.dir_override) else PackedStringArray():
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	sea.session.save["bait"]["worm"] = 80.0
	sea._boat.position = Vector2(0, 2600)
	for f: int in 3:
		await process_frame
	var hud: FishingHud = sea._hud
	hud.refresh()
	var ahead: Array = [0.0]
	Clock.install(func() -> float: return Time.get_unix_time_from_system() * 1000.0 + float(ahead[0]))
	var seen: Dictionary = {}
	var bad: int = 0
	for i: int in 40:
		if i == 12:
			sea.session.profile()["force_shiny_always"] = true
		if i == 16:
			sea.session.profile()["force_shiny_always"] = false
		await _clear_modals(hud, seen)
		if i % 10 == 9:
			sea.session.save["hold"] = {}
			hud.refresh()
		hud.cast()
		if hud.phase != "waiting":
			print("  cast %d did not go out (phase %s, button: %s)" % [i, hud.phase, hud._action.text])
			bad += 1
			break
		hud._wait_left = 0.0
		ahead[0] = float(ahead[0]) + float(hud._shot["waitMs"]) + 1000.0
		var n: int = 0
		while hud.phase == "waiting" and n < 120:
			await process_frame
			n += 1
		for f: int in randi_range(1, 20):
			await process_frame
		n = 0
		while i % 2 == 0 and not (hud._dial.zone_at(hud._dial.angle) in ["catch", "perfect"]) and n < 2000:
			await process_frame
			n += 1
		if i % 4 == 0:
			while hud._dial.zone_at(hud._dial.angle) != "perfect" and n < 4000:
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
		var kind: String = "CrateMoment" if hud._card is CrateMoment else "ResultCard"
		seen[kind] = int(seen.get(kind, 0)) + 1
		if hud._card is CrateMoment:
			await (hud._card as CrateMoment).done
		for f: int in 20:
			await process_frame
	await _clear_modals(hud, seen)
	# The Ancient Deep: a captain with lures fights through every phase, aiming
	# at the catch zone (the perfect every third cast), and sits through the
	# ceremony when a giant lands.
	var p: Dictionary = sea.session.profile()
	p["fishing_xp"] = float((Rules.data()["xpTable"] as Array)[89])
	p["has_ancient_deep_access"] = true
	p["fish_hold_tier"] = 8.0
	hud._level_seen = sea.session.level()
	sea.session.save["bait"]["luminous"] = 60.0
	sea.session.save["bait"]["golden"] = 60.0
	sea._boat.position = Vector2(0, 19000)
	hud._bait = "golden"
	for f: int in 3:
		await process_frame
	hud.refresh()
	var phases: int = 0
	for i: int in 16:
		await _clear_modals(hud, seen)
		hud._bait = "golden" if i % 2 == 0 else "luminous"
		hud.cast()
		if hud.phase != "waiting":
			print("  ancient cast %d did not go out (%s: %s)" % [i, hud.phase, hud._action.text])
			bad += 1
			break
		hud._wait_left = 0.0
		ahead[0] = float(ahead[0]) + float(hud._shot["waitMs"]) + 1000.0
		var guard: int = 0
		while (hud.phase == "waiting" or hud.phase == "hooked" or hud.phase == "reeling") and guard < 20000:
			guard += 1
			if hud.phase == "hooked":
				var want: Array = ["perfect"] if i % 3 == 0 else ["catch", "perfect"]
				var n: int = 0
				while hud.phase == "hooked" and not (hud._dial.zone_at(hud._dial.angle) in want) and n < 4000:
					await process_frame
					n += 1
				if hud.phase == "hooked":
					if not hud._boss.is_empty():
						phases += 1
					hud._dial.strike()
			await process_frame
		if hud._card is CrateMoment:
			await (hud._card as CrateMoment).done
		var kind: String = "Ancient card" if hud._card != null else "none"
		seen[kind] = int(seen.get(kind, 0)) + 1
		for f: int in 10:
			await process_frame
	await _clear_modals(hud, seen)
	print("  ancient: %d phases struck; giants on the wall %s" % [phases, p.get("ancient_catches")])
	Clock.install(Callable())
	print("  40 casts; seen: %s" % [seen])
	print("  streak now %d, level %d, hold %s" % [hud._streak(), sea.session.level(), hud._hold.text])
	print("  smoke %s" % ("FAILED" if bad > 0 else "ok"))
	quit(1 if bad > 0 else 0)


## Close a level-up and answer goldens, as a player would.
func _clear_modals(hud: FishingHud, seen: Dictionary) -> void:
	var guard: int = 0
	while hud._modal != null and guard < 20:
		guard += 1
		var m: Control = hud._modal
		if m is LevelUp:
			seen["LevelUp"] = int(seen.get("LevelUp", 0)) + 1
			for f: int in 45:
				await process_frame
			(m as LevelUp)._close()
		elif m is AncientScenes:
			seen["scene:" + (m as AncientScenes).kind] = int(seen.get("scene:" + (m as AncientScenes).kind, 0)) + 1
			for f: int in 40:
				await process_frame
			(m as AncientScenes)._finish()
		elif m is GoldenChoice:
			seen["GoldenChoice"] = int(seen.get("GoldenChoice", 0)) + 1
			(m as GoldenChoice)._answer("mount" if int(seen["GoldenChoice"]) % 2 == 1 else "sell")
		for f: int in 3:
			await process_frame
