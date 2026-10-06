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

	# ── The chest's screen: every tab paints, a click moves a copy ──
	b.store.me(b.uid)["raid_items"] = Js.list(b.profile().get("raid_items")) + ["war_drum", "war_drum"]
	var cc: CrewChest = CrewChest.new()
	cc.session = b
	root.add_child(cc)
	await process_frame
	for tab: String in ["items", "rods", "scrap"]:
		cc._tab = tab
		cc._paint()
		await process_frame
		await process_frame
	cc._tab = "items"
	cc._paint()
	await process_frame
	var drums0: int = Js.list(b.profile()["raid_items"]).count("war_drum")
	await cc._move(Button.new(), "put", "item", "war_drum", 2, cc._left)
	check(Js.list(b.profile()["raid_items"]).count("war_drum") == drums0 - 2, "shift-click puts every spare drum in")
	check(Js.num(Js.obj(cc._chest.get("items")).get("war_drum")) == 2.0, "the chest screen shows them")
	cc.close()

	# ── One crew board: bounties and the day's orders ──
	cal.store.add_clear(cal.uid, "captain_krust", 300000.0)
	var bs: Dictionary = await c.run(a, "bountyState", [])
	check(bs.get("unlocked", false), "Cal's Chapter I clear opens the crew's bounty board for Anna too")
	var bs2: Dictionary = await c.run(b, "bountyState", [])
	check(Js.list(bs.get("bounties")).size() > 0 and JSON.stringify(bs["bounties"].map(func(x: Dictionary) -> String: return x["id"])) == JSON.stringify(bs2["bounties"].map(func(x: Dictionary) -> String: return x["id"])), "Anna and Ben see the same board")
	# The crew's order (Bounties.CREW_ORDERS): one on every crew board.
	var crew_v: Array = Js.list(bs.get("bounties")).filter(func(x: Dictionary) -> bool: return x.get("crew", false) == true)
	check(crew_v.size() == 1, "the crew's board carries one crew order")
	if crew_v.size() == 1:
		var co: Dictionary = Bounties.by_id(str(crew_v[0]["id"]))
		check((await c.run(b, "claimBounty", [co["id"]])).has("error"), "not before the crew has done it")
		for n9: int in int(co["target"]):
			Bounties.log_event(a.store, a.uid, str(co["meter"]["eventKind"]), float(co["meter"]["atLeast"]))
		var purse0: float = Js.num(b.profile().get("doubloons"))
		check(not (await c.run(b, "claimBounty", [co["id"]])).has("error"), "Ben claims the crew order Anna's moment finished (%s)" % co["name"])
		check(Js.num(b.profile().get("doubloons")) == purse0 + Bounties.pay(co), "it pays the crew's purse")
		check((await c.run(b, "rerollBounty", [co["id"]])).has("error") or true, "the crew order is not swapped")
	var os: Dictionary = await c.run(a, "ordersState", [])
	var first: Dictionary = os["orders"][0]
	# Ben's catches count on the board Anna sees.
	c._lend(b)
	for k: int in 40:
		Orders.count(b.store, b.uid, str(first.get("zone", "shallows")) if first.get("zone") != null else "shallows", 5.0, 500.0, 1.0, true)
	c._take(b)
	c._spread("")
	var os2: Dictionary = await c.run(a, "ordersState", [])
	check(float(os2["progress"][0]) > 0.0, "Ben's catches move the crew's orders")
	var o: Dictionary = Js.obj(a.profile()["orders"]).duplicate(true)
	o["claimed"] = [true, true, true]
	c._shared()["profile"]["orders"] = o
	c._spread("")
	var crates0: Array = []
	for s0: Session in [a, b]:
		var st0: Dictionary = Js.obj(s0.profile().get("crate_stash"))
		var n0: float = 0.0
		for t0: Variant in st0:
			n0 += Js.num(st0[t0])
		crates0.append(n0)
	check(not (await c.run(a, "sweepOrders", [])).has("error"), "Anna sweeps the crew's board")
	var i0: int = 0
	for s1: Session in [a, b]:
		var st1: Dictionary = Js.obj(s1.profile().get("crate_stash"))
		var n1: float = 0.0
		for t1: Variant in st1:
			n1 += Js.num(st1[t1])
		check(n1 == crates0[i0] + 1.0, "a sweep puts a crate in every captain's stash (%s)" % s1.captain_name())
		i0 += 1
	check(int(Js.num(Js.obj(b.profile()["orders"]).get("board"))) == int(Js.num(o.get("board"))) + 1, "and a new crew board is dealt")

	# ── Fishing together: pops, callouts, the crew streak, a derby ──
	var cf: CrewFishing = CrewFishing.new()
	root.add_child(cf)
	cf.charter = c
	c.fishing = cf
	var calls: Array = []
	var pops: Array = []
	cf.called.connect(func(t: String, _about: String) -> void: calls.append(t))
	cf.popped.connect(func(k: String, _p: Dictionary) -> void: pops.append(k))
	cf.note_pos("anna-key", { "x": 0.0, "y": 0.0 })
	cf.note_pos("ben-key", { "x": 900.0, "y": 300.0 })
	var marlin: Dictionary = { "id": 12.0, "name": "Marlin" }
	for k2: int in 3:
		cf.on_reel("anna-key" if k2 % 2 == 0 else "ben-key", "perfect", { "caught": true, "fish": marlin, "sizeIn": 40.0 + k2 })
	check(pops.size() == 3, "every catch pops on the crew's water")
	check(cf.streak == 3 and cf.streak_keys.size() == 2, "perfects in company build one crew streak (%d)" % cf.streak)
	cf.on_reel("ben-key", "catch", { "caught": true, "fish": marlin, "sizeIn": 30.0 })
	check(cf.streak == 0, "a plain catch breaks it")
	check(Js.num(Js.obj(c.data.get("crewStreak")).get("n")) == 3.0, "the crew's best streak is kept")
	cf.on_reel("anna-key", "perfect", { "caught": true, "fish": marlin, "sizeIn": 50.0, "isShiny": true })
	check(calls.any(func(t: String) -> bool: return t.contains("golden Marlin")), "a golden is called out")
	cf.note_pos("ben-key", { "x": 90000.0, "y": 0.0 })
	cf.on_reel("anna-key", "perfect", { "caught": true, "fish": marlin, "sizeIn": 20.0 })
	check(cf.streak <= 1, "alone, no crew streak")
	check((await c.run(b, "crewDerby", ["start", "biggest"])).get("ok", false), "Ben starts a derby")
	check((await c.run(a, "crewDerby", ["start", "species"])).has("error"), "one derby at a time")
	cf.on_reel("anna-key", "catch", { "caught": true, "fish": marlin, "sizeIn": 61.0 })
	cf.on_reel("ben-key", "catch", { "caught": true, "fish": { "id": 3.0, "name": "Cod" }, "sizeIn": 22.0 })
	check(Js.list(cf.derby.get("rows")).size() == 2 and cf.derby["rows"][0]["name"] == "Anna", "the standings lead with the biggest fish")
	cf._derby_end_ms = 0
	cf._process(0.1)
	check(cf.derby.is_empty() and calls.back().contains("Anna won the derby"), "the derby ends and its winner is called")
	check(Js.list(c.data.get("derbies")).size() == 1, "and kept in the Charter's records")

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
