extends SceneTree
## THE CHARTER'S CREW TOOLS, in one process (Godot port, 2026-10-06): the
## crew chest (raid items, rods and forge scrap in and out through Charter.run
## "crewChest", with its refusals), a hardcore Charter's lives (fixed at Set
## Sail, spent one at a time, the last one sinking the file), releasing a
## berth, and handing the Charter over (the file read back as the new
## founder's).
##
##   godot --headless --path godot/game -s tests/charter_crew_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://crew_check_captains"
	Charter.dir_override = "user://crew_check_charters"
	for d: String in [Captains.dir_override, Charter.dir_override, Charter.dir_override + "/sunk", Charter.dir_override + "/handed"]:
		if DirAccess.dir_exists_absolute(d):
			for f: String in DirAccess.get_files_at(d):
				DirAccess.remove_absolute("%s/%s" % [d, f])
	await process_frame
	var c: Charter = Charter.found("The Chest Test", true, "anna-key", "Anna")
	var a: Session = c.session_for("anna-key")
	var b: Session = c.add_member("ben-key", "Ben")
	var cal: Session = c.add_member("cal-key", "Cal")
	c.set_sail()
	check(c.lives() == 4.0, "a hardcore crew of three sails with four lives (%s)" % c.lives())

	# ── The chest ──
	var xp: Array = Rules.data()["xpTable"]
	a.store.me(a.uid)["raid_items"] = ["corsair_cannon", "corsair_cannon", "war_drum"]
	a.store.me(a.uid)["equipped_raid_items"] = ["war_drum"]
	a.store.me(a.uid)["forge_scrap"] = 30.0
	a.store.rod_give(a.uid, "carbon")
	b.store.me(b.uid)["fishing_xp"] = float(xp[4])
	check((await c.run(a, "crewChest", ["put", "item", "war_drum"])).has("error"), "a mounted last copy stays on the ship")
	check(not (await c.run(a, "crewChest", ["put", "item", "corsair_cannon"])).has("error"), "Anna puts a cannon in")
	check(Js.list(a.profile()["raid_items"]).count("corsair_cannon") == 1, "one cannon left with Anna")
	check(not (await c.run(a, "crewChest", ["put", "scrap", "", 25.0])).has("error"), "Anna puts 25 scrap in")
	check((await c.run(a, "crewChest", ["put", "scrap", "", 25.0])).has("error"), "she has only 5 left")
	check(not (await c.run(a, "crewChest", ["put", "rod", "carbon"])).has("error"), "Anna puts her carbon rod in")
	check((await c.run(a, "crewChest", ["put", "rod", "bamboo"])).has("error"), "the bamboo rod does not go in")
	var r: Dictionary = await c.run(b, "crewChest", ["take", "item", "corsair_cannon"])
	check(not r.has("error") and Js.list(b.profile()["raid_items"]).has("corsair_cannon"), "Ben takes the cannon")
	check((await c.run(b, "crewChest", ["take", "item", "corsair_cannon"])).has("error"), "the chest has no second cannon")
	check((await c.run(b, "crewChest", ["take", "rod", "carbon"])).has("error"), "Ben is too green for the carbon rod")
	b.store.me(b.uid)["fishing_xp"] = float(xp[xp.size() - 1])
	check(not (await c.run(b, "crewChest", ["take", "rod", "carbon"])).has("error") and b.store.rod_held(b.uid, "carbon") == 1.0, "at a high level he takes it")
	check(not (await c.run(cal, "crewChest", ["take", "scrap", "", 10.0])).has("error") and Js.num(cal.profile().get("forge_scrap")) == 10.0, "Cal takes 10 scrap")
	check(Js.num(c._chest()["scrap"]) == 15.0, "15 scrap stay in the chest")
	check((c._chest()["log"] as Array).size() == 6, "the chest's log names every move")
	check(Js.obj(Js.obj(cal.save.get("charter")).get("chest")).get("scrap") == 15.0, "every captain sees the chest")

	# ── Release and handover ──
	check(c.release("anna-key") != "", "the founder cannot release herself")
	check(c.release("cal-key") == "", "Anna releases Cal's berth")
	check(c.berth_of("cal-key").is_empty() and (c.data["released"] as Array).size() == 1, "his captain is kept, out of the crew")
	check(c.refusal("cal-key") != "", "a sailed Charter cannot fill the berth again")
	var text: String = c.handover_text("ben-key")
	var c2_id: String = c.id()
	c.handed_off()
	check(not FileAccess.file_exists(Charter._path(c2_id)), "Anna's copy is put away")
	check(Charter.take_handover(text, "ben-key") == "", "Ben's game takes the Charter")
	var c2: Charter = Charter.open(c2_id)
	check(c2 != null and c2.data["founder"] == "ben-key", "Ben is its founder now")
	check(c2 != null and Js.num(c2._chest()["scrap"]) == 15.0, "the chest came with it")
	check(Charter.take_handover(text, "someone-else") != "", "only the captain it was handed to can take it")

	# ── Lives ──
	var sank: Array = [false]
	c2.sinking.connect(func() -> void: sank[0] = true)
	for i: int in 3:
		c2.spend_life("ben-key", "Sunk at a test")
	check(c2.lives() == 1.0 and not sank[0], "one life left after three sinkings")
	check(Js.num(Js.obj(c2.session_for("anna-key").save.get("charter")).get("lives")) == 1.0, "every captain sees the lives")
	c2.spend_life("anna-key", "Sunk at a test")
	check(sank[0] and c2.data.get("sunk", false), "the last life sinks the Charter")
	c2.sink()
	check(not FileAccess.file_exists(Charter._path(c2_id)), "a sunk Charter's file leaves the list")
	check(DirAccess.get_files_at(Charter.dir_override + "/sunk").size() == 1, "and is kept under sunk")
	c2.write()
	c2.flush()
	check(not FileAccess.file_exists(Charter._path(c2_id)), "nothing writes it back")

	print("charter crew check: %s" % ("ok" if bad == 0 else "%d failed" % bad))
	quit(1 if bad > 0 else 0)
