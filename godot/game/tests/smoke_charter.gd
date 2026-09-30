extends SceneTree
## A SMOKE RUN OF A CHARTER (Godot port): two copies of the game on this
## machine, over the local network (no Steam), each on its own scratch folder.
##
##   godot --headless --path godot/game -s tests/smoke_charter.gd -- --role=host --as=anna
##   godot --headless --path godot/game -s tests/smoke_charter.gd -- --role=crew --as=ben
##
## (Run both at once, the host first.) The founder founds a Charter
## and hosts it; the crewmate joins and makes a captain; the founder sets sail
## once both are aboard. On the sea the crewmate casts and reels for real (the
## founder's game rolls every die and keeps the time), and buys bait. The
## crewmate's copy must show the catch and the bait; the founder's Charter file
## must hold them; each must see the other's ship, named. Then the crewmate
## leaves and the founder sees them go.

var bad: int = 0
var role: String = ""


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
	print("  [%s] %s %s" % [role, "ok  " if ok else "FAILED", what])


func until(cond: Callable, seconds: float) -> bool:
	var t: float = 0.0
	while not cond.call():
		await process_frame
		t += 1.0 / 60.0
		await create_timer(1.0 / 60.0).timeout
		if t > seconds:
			return false
	return true


func _init() -> void:
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--role="):
			role = a.trim_prefix("--role=")
	Captains.dir_override = "user://smoke_charter_%s/captains" % role
	Charter.dir_override = "user://smoke_charter_%s/charters" % role
	for d: String in [Captains.dir_override, Charter.dir_override]:
		if DirAccess.dir_exists_absolute(d):
			for f: String in DirAccess.get_files_at(d):
				DirAccess.remove_absolute("%s/%s" % [d, f])
	Main.straight_to_sea = false
	var main: Main = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	if role == "host":
		await _host(main)
	else:
		await _crew(main)
	print("  [%s] charter smoke: %s" % [role, "ok" if bad == 0 else "%d failed" % bad])
	quit(0 if bad == 0 else 1)


func _host(main: Main) -> void:
	var c: Charter = Charter.found("The Salt Ledger", false, SteamLayer.player_key(), "Anna")
	main.host(c.id())
	check(main._screen is HarbourLobby, "the founder waits in the harbor")
	var net: CrewNet = main.net
	c = net.charter
	check(await until(func() -> bool:
		var aboard: int = 0
		for m: Dictionary in net.roster():
			if m["aboard"]:
				aboard += 1
		return aboard >= 2, 40.0), "a crewmate comes aboard")
	var ben: String = ""
	for m: Dictionary in net.roster():
		if not m["founder"]:
			ben = m["key"]
	net.set_sail()
	await process_frame
	check(main._screen is Sea, "Set Sail takes the founder to the sea")
	check(c.sailed() and c.refusal("local-somebody-else") != "", "the roster is locked")
	var sea: Sea = main._screen
	check(await until(func() -> bool: return sea._mates.has(ben) and (sea._mates[ben] as Shipmate).mate_name == "Ben", 20.0), "the crewmate's ship is on the founder's sea, named")
	var their: Session = c.session_for(ben)
	check(await until(func() -> bool: return their.store.hold_count(their.uid) > 0.0 and (their.save["ledger"] as Array).any(func(l: Dictionary) -> bool: return str(l["reason"]).begins_with("Bought 10× Worms")), 90.0), "the crewmate's catch and bait are in their captain, on the founder's game")
	check(await until(func() -> bool: return not sea._mates.has(ben), 60.0), "the founder sees the crewmate leave")
	var again: Charter = Charter.open(c.id())
	var s2: Session = again.session_for(ben)
	check(s2 != null and s2.store.hold_count(s2.uid) > 0.0, "the Charter file on disk holds the crewmate's catch")


func _crew(main: Main) -> void:
	var net: CrewNet = main.net
	var joined: bool = false
	for attempt: int in 20:
		main.join("127.0.0.1", "Ben")
		joined = await until(func() -> bool: return main._screen is HarbourLobby or main._screen is Sea, 3.0)
		if joined:
			break
		net.leave()
		await create_timer(0.5).timeout
	check(joined, "the crewmate reaches the founder's harbor")
	check(await until(func() -> bool: return main._screen is Sea, 40.0), "Set Sail takes the crewmate to the sea")
	var sea: Sea = main._screen
	var s: Session = sea.session
	check(s.remote != null, "the crewmate's captain is remote (the founder runs the rules)")
	check(await until(func() -> bool:
		for k: String in sea._mates:
			if (sea._mates[k] as Shipmate).mate_name == "Anna":
				return true
		return false, 20.0), "the founder's ship is on the crewmate's sea, named")
	# Fish in the Shallows for real: the founder's clock decides when a bite is due.
	sea._boat.position = Vector2(0, 2600)
	var hud: FishingHud = sea._hud
	await until(func() -> bool: return not hud.water.is_empty(), 5.0)
	var landed: bool = false
	for cast: int in 6:
		await until(func() -> bool: return hud._modal == null and (hud.phase == "idle" or hud.phase == "result"), 15.0)
		hud._close_card()
		await hud.cast()
		if hud.phase != "waiting":
			print("  [crew] the cast did not go out: %s" % hud._action.text)
			continue
		await until(func() -> bool: return hud.phase == "hooked", 40.0)
		await until(func() -> bool: return hud._dial.zone_at(hud._dial.angle) in ["catch", "perfect"], 10.0)
		hud._dial.strike()
		await until(func() -> bool: return hud.phase == "result", 20.0)
		if s.store.hold_count(s.uid) > 0.0:
			landed = true
			break
	check(landed, "a fish reeled on the crewmate's game lands in their copy of the hold")
	var worms: float = Js.num((s.save["bait"] as Dictionary).get("worm"))
	var r: Variant = await s.act("buyBait", ["worm", 10.0])
	check(r is Dictionary and not (r as Dictionary).has("error") and Js.num((s.save["bait"] as Dictionary).get("worm")) == worms + 10.0, "buying bait goes through the founder and comes back (%s)" % str(r))
	var nope: Variant = await s.act("buyBait", ["nonsense", 1.0])
	check(nope is Dictionary and (nope as Dictionary).has("error"), "a refusal comes back as a refusal")
	await create_timer(1.0).timeout
	sea.left.emit()
	await process_frame
	check(main._screen is Title, "leaving the Charter goes to the title")
