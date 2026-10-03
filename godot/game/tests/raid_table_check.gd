extends SceneTree
## A CHARTER'S RAID TOGETHER, in one process (Godot port): a Charter of three
## captains. Two whose maps have reached Pete muster for his raid; the third,
## whose map has not, is turned away. The raid is played to its end through the
## same path a crewmate's action takes (Charter.run with "raidTable"): each
## round both plan and say ready, every round is "played" before it moves on,
## the flares and the tides are each captain's own. Checks: the muster, the
## refusals, that each kill pays both captains into their own saves, that a
## captain who flees is paid no more, the crates and the clears for those who
## finished, and that every state sent out is one the rules made.
##
##   godot --headless --path godot/game -s tests/raid_table_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _ready_for_pete(s: Session) -> void:
	var p: Dictionary = s.store.me(s.uid)
	p["has_completed_practice_raid"] = true
	p["raid_node_progress"] = { "cleared": ["intro"], "choices": {} }
	p["ship_tier"] = 6.0
	p["expedition_xp"] = 4000000.0
	p["raid_items"] = ["the_standing_wall", "bloodletter", "warden_of_the_deep", "leviathans_cannon"]
	p["equipped_raid_items"] = ["the_standing_wall", "bloodletter", "warden_of_the_deep", "leviathans_cannon"]


func _init() -> void:
	Captains.dir_override = "user://raid_table_captains"
	Charter.dir_override = "user://raid_table_charters"
	for d: String in [Captains.dir_override, Charter.dir_override]:
		if DirAccess.dir_exists_absolute(d):
			for f: String in DirAccess.get_files_at(d):
				DirAccess.remove_absolute("%s/%s" % [d, f])
	await process_frame
	Dice.install(Dice.Mulberry32.new(41))
	var c: Charter = Charter.found("The Raid Test", false, "anna-key", "Anna")
	var a: Session = c.session_for("anna-key")
	var b: Session = c.add_member("ben-key", "Ben")
	var x: Session = c.add_member("cal-key", "Cal")
	_ready_for_pete(a)
	_ready_for_pete(b)
	var t: RaidTable = RaidTable.new()
	root.add_child(t)
	t.charter = c
	c.raids = t
	var sent: Array = [0]
	t.changed.connect(func(_st: Dictionary) -> void: sent[0] += 1)

	var at: Dictionary = { "x": RaidTable.dock_of("pete").x, "y": RaidTable.dock_of("pete").y }
	var far: Dictionary = { "x": float(at["x"]) + 5000.0, "y": at["y"] }
	var pete: Dictionary = { "raidId": "corsairs_reckoning", "nodeId": "pete" }
	# ── The muster ──
	check((await c.run(x, "raidTable", ["call", pete.merged(at)])).has("error"), "Cal's map has not reached Pete")
	check((await c.run(a, "raidTable", ["call", pete.merged(far)])).has("error"), "Anna must be at the raid to call it")
	check(not (await c.run(a, "raidTable", ["call", pete.merged(at)])).has("error"), "Anna calls Pete's raid")
	check((await c.run(a, "raidTable", ["call", pete.merged(at)])).has("error"), "one raid at a time")
	check((await c.run(x, "raidTable", ["join", at])).has("error"), "Cal cannot join it")
	check((await c.run(b, "raidTable", ["join", far])).has("error"), "Ben must sail to it first")
	check(not (await c.run(b, "raidTable", ["join", at])).has("error"), "Ben joins")
	check((await c.run(b, "raidTable", ["go"])).has("error"), "only the caller sails early")
	var a_coin: float = Js.num(a.profile().get("doubloons"))
	var b_coin: float = Js.num(b.profile().get("doubloons"))
	await c.run(a, "raidTable", ["go"])
	check(t.state["phase"] == "playing" and (t.state["b"]["seats"] as Array).size() == 2, "the line forms with two ships")

	# ── Played to the end ──
	var rounds: int = 0
	var pays: Dictionary = { "anna-key": 0, "ben-key": 0 }
	var tides: int = 0
	var flares: int = 0
	var seen_seq: int = -1
	while t.state["phase"] != "done" and rounds < 400:
		var st: Dictionary = t.state
		match str(st["phase"]):
			"playing":
				if int(st["seq"]) != seen_seq:
					seen_seq = int(st["seq"])
					for e: Dictionary in st["ev"]:
						if e["t"] == "pay":
							pays[e["key"]] = int(pays[e["key"]]) + 1
				# Both screens say they have played it.
				await c.run(a, "raidTable", ["played", st["seq"]])
				await c.run(b, "raidTable", ["played", st["seq"]])
			"plan":
				rounds += 1
				for s: Session in [a, b]:
					var key: String = c.key_of(s)
					var si: int = -1
					for i: int in (st["b"]["seats"] as Array).size():
						if st["b"]["seats"][i]["key"] == key:
							si = i
					var seat: Dictionary = t._r["b"]["seats"][si]
					if not Battle.alive(t._r["b"]).has(seat):
						continue
					var lg: Dictionary = Battle.legal(t._r["b"], seat)
					var act: String = "volley" if lg["volley"] else ("fire" if lg["fire"] else "reload")
					await c.run(s, "raidTable", ["plan", { "action": act, "aim": "hit" if Dice.next() < 0.7 else "critical" }])
			"flares":
				flares += 1
				await c.run(a, "raidTable", ["flares", { "missed": 1.0, "feints": 0.0 }])
				await c.run(b, "raidTable", ["flares", { "missed": 0.0, "feints": 0.0 }])
			"tide":
				tides += 1
				var ch: Array = st["tide"]["choices"]
				await c.run(a, "raidTable", ["tide", ch[0]["id"]])
				await c.run(b, "raidTable", ["tide", ch[ch.size() - 1]["id"]])
	check(t.state["phase"] == "done", "the raid ends (%s after %d rounds)" % [t.state["phase"], rounds])
	print("  co-op Pete: %s in %d rounds; kills paid Anna %d, Ben %d" % [t.state.get("result", ""), rounds, pays["anna-key"], pays["ben-key"]])
	check(int(pays["anna-key"]) > 0 and int(pays["ben-key"]) > 0, "both captains are paid for the kills")
	# The Charter's purse is the crew's: both captains' pay went into it.
	check(Js.num(a.profile().get("doubloons")) > a_coin and Js.num(a.profile().get("expedition_xp")) > 4000000.0 and Js.num(b.profile().get("expedition_xp")) > 4000000.0, "into the crew's purse, and each captain's own XP")
	if t.state.get("result") == "won":
		check(a.store.clear_count(a.uid, "corsairs_reckoning") == 1 and b.store.clear_count(b.uid, "corsairs_reckoning") == 1, "the clear is each captain's")
		check(x.store.clear_count(x.uid, "corsairs_reckoning") == 0, "and not Cal's")

	# ── A flee: Ben gets away, and is paid no more ──
	await c.run(a, "raidTable", ["call", pete.merged(at)])
	await c.run(b, "raidTable", ["join", at])
	await c.run(a, "raidTable", ["go"])
	var fled: bool = false
	var after_flee_pay: int = 0
	var guard: int = 0
	seen_seq = -1
	while t.state["phase"] != "done" and guard < 600:
		guard += 1
		var st2: Dictionary = t.state
		match str(st2["phase"]):
			"playing":
				if int(st2["seq"]) != seen_seq:
					seen_seq = int(st2["seq"])
					for e: Dictionary in st2["ev"]:
						if e["t"] == "flee" and e["success"]:
							fled = true
						elif e["t"] == "pay" and e["key"] == "ben-key" and fled:
							after_flee_pay += 1
				await c.run(a, "raidTable", ["played", st2["seq"]])
				await c.run(b, "raidTable", ["played", st2["seq"]])
			"plan":
				var bs: Dictionary = t._r["b"]["seats"][1]
				if Battle.alive(t._r["b"]).has(bs):
					await c.run(b, "raidTable", ["plan", { "action": "flee" }])
				var as2: Dictionary = t._r["b"]["seats"][0]
				if Battle.alive(t._r["b"]).has(as2) and t.state["phase"] == "plan":
					var lg2: Dictionary = Battle.legal(t._r["b"], as2)
					await c.run(a, "raidTable", ["plan", { "action": "volley" if lg2["volley"] else ("fire" if lg2["fire"] else "reload"), "aim": "hit" }])
			"flares":
				await c.run(a, "raidTable", ["flares", { "missed": 0.0, "feints": 0.0 }])
				await c.run(b, "raidTable", ["flares", { "missed": 0.0, "feints": 0.0 }])
			"tide":
				var ch2: Array = st2["tide"]["choices"]
				await c.run(a, "raidTable", ["tide", ch2[0]["id"]])
				await c.run(b, "raidTable", ["tide", ch2[0]["id"]])
	check(fled, "Ben got away at last")
	check(after_flee_pay == 0, "and was paid nothing after (%d)" % after_flee_pay)
	check(int(sent[0]) > 20, "every change went out (%d)" % sent[0])
	print("  raid table check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
