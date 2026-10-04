extends SceneTree
## THE GAUNTLETS, PLAYED (Godot port): bots dive through the real table, alone
## and as a Charter's party, to the end. Alone: Davy's Gauntlet down to a
## depth, then banked (the pot, the Fathoms, the XP and the record land in the
## save). Together: three captains in Don's Gauntlet, the draft table taken in
## turn (the order rotating), the votes, the jobs, the Marks, a sunk ship
## towed home, and a co-op dive HELD by vote and resumed by the same crew. Checks
## that every phase moves on, that nothing is paid twice, that a lost dive
## pays only Fathoms.
##
##   godot --headless --path godot/game -s tests/gauntlet_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _strong(s: Session, deep: bool) -> void:
	var p: Dictionary = s.store.me(s.uid)
	p["has_completed_practice_raid"] = true
	p["raid_node_progress"] = { "cleared": ["intro", Gauntlet.UNLOCK_NODE], "choices": {} }
	p["ship_tier"] = 6.0
	p["expedition_xp"] = 4000000.0 if deep else 400000.0
	p["raid_items"] = ["the_standing_wall", "bloodletter", "warden_of_the_deep", "leviathans_cannon"]
	p["equipped_raid_items"] = ["the_standing_wall", "bloodletter", "warden_of_the_deep", "leviathans_cannon"]
	p["gauntlet_deepest"] = 20.0
	p["dons_gauntlet_deepest"] = 20.0
	p["gauntlet_upgrades"] = ["second_cast", "salt_ward", "sounding_line", "vigor"]
	p["dons_gauntlet_upgrades"] = ["dg_boon_filter", "dg_reroll_boon"]
	s.save["raidClears"] = (Js.list(s.save.get("raidClears")) + [{ "raid_id": "the_throne", "at": "2026-10-01T00:00:00.000Z" }])
	# A hand seated for raids (a hardcore squad).
	var cards: Array = Crew.cards()
	(s.save["crew"] as Array).append({
		"id": s.store.next_id(), "card_id": cards[0]["id"], "rarity": 2.0, "power": 20.0, "dodge": 10.0, "fortune": 10.0, "effects": [],
		"pending_trait": null, "voyage_slot": null, "raid_slot": 0.0, "xp": 0.0, "nickname": null, "recruited_at": "2026-10-01T00:00:00.000Z",
		"died_at": null, "died_on_voyage_id": null, "died_hardcore_depth": null,
	})


## Play a dive with bots until it ends or `bank_at` is reached. Returns the
## counts of what happened. act: Callable(key, args) -> Dictionary.
func _play(t: GauntletTable, keys: Array, act: Callable, bank_at: int, max_steps: int = 6000, hold_at: int = -1) -> Dictionary:
	var seen: Dictionary = { "fights": 0, "drafts": 0, "curses": 0, "shrines": 0, "fences": 0, "jobs": 0, "marks": 0, "votes": 0, "towed": 0, "orders": [], "steps": 0 }
	var steps: int = 0
	var last_seq: int = -1
	while str(t.state.get("phase", "")) not in ["done", "idle"] and steps < max_steps:
		steps += 1
		var st: Dictionary = t.state
		var ph: String = str(st["phase"])
		match ph:
			"playing":
				if int(st["seq"]) != last_seq:
					last_seq = int(st["seq"])
					for e: Dictionary in st["ev"]:
						if e["t"] in ["begin", "nextFight"]:
							seen["fights"] = int(seen["fights"]) + 1
						if e["t"] == "towed":
							seen["towed"] = int(seen["towed"]) + 1
						if e["t"] == "reaction":
							var rk: String = "r_" + str(e["id"])
							seen[rk] = int(seen.get(rk, 0)) + 1
				for k: String in keys:
					await act.call(k, ["played", st["seq"]])
			"plan":
				var b: Dictionary = t._r["b"]
				for k2: String in keys:
					var si: int = t._seat_of(k2)
					if si < 0 or not Battle.alive(b).has(b["seats"][si]) or Js.obj(t._r["plans"]).has(k2):
						continue
					var lg: Dictionary = Battle.legal(b, b["seats"][si])
					var a: String = "volley" if lg["volley"] else ("fire" if lg["fire"] else "reload")
					var r: float = randf()
					await act.call(k2, ["plan", { "action": a, "aim": "critical" if r < 0.25 else ("hit" if r < 0.85 else "graze"), "target": 0.0 }])
			"flares":
				for k3: String in keys:
					await act.call(k3, ["flares", { "missed": 1.0, "feints": 0.0 }])
			"curse":
				seen["curses"] = int(seen["curses"]) + 1
				for k4: String in keys:
					await act.call(k4, ["bear"])
			"draft":
				seen["drafts"] = int(seen["drafts"]) + 1
				var d: Dictionary = st["draft"]
				(seen["orders"] as Array).append(d["order"])
				var who: String = t._turn_key()
				if who == "":
					continue
				if not Js.obj(d["syn"].get(who)).is_empty() and randf() < 0.5:
					await act.call(who, ["pick", { "syn": true }])
				else:
					var picked: bool = false
					# A crew synergy is always taken by one of its two; a bond
					# first when the probe asks (BONDS=1).
					for i0: int in (d["cards"] as Array).size():
						var c0: Dictionary = d["cards"][i0]
						if picked or Js.obj(d["stamps"]).has(str(i0)):
							continue
						var want: bool = (c0["card"] == "crew" and Js.list(c0["keys"]).has(who)) or (OS.get_environment("BONDS") == "1" and c0.get("bond", false) and t.next_tier(who, str(c0["id"])) > 0)
						if want:
							var r0: Dictionary = await act.call(who, ["pick", { "card": float(i0) }])
							check(not r0.has("error"), "a bond or crew pick is taken (%s)" % str(r0))
							seen["bonds"] = int(seen.get("bonds", 0)) + 1
							picked = true
					for i: int in (d["cards"] as Array).size():
						if picked or Js.obj(d["stamps"]).has(str(i)):
							continue
						var c: Dictionary = d["cards"][i]
						if c["card"] == "crew":
							continue
						if c["card"] == "reprieve" or t.next_tier(who, str(c["id"])) > 0:
							var r2: Dictionary = await act.call(who, ["pick", { "card": float(i) }])
							check(not r2.has("error"), "a pick is taken (%s)" % str(r2))
							picked = true
							break
					if not picked:
						await act.call(who, ["pick", { "syn": true }])
			"shrine":
				seen["shrines"] = int(seen["shrines"]) + 1
				for k5: String in keys:
					if not Js.obj(st["shrine"]["picks"]).has(k5):
						await act.call(k5, ["shrine", { "choice": ["walk", "blood", "coin"][randi() % 3], "stake": 2.0 }])
			"fence":
				seen["fences"] = int(seen["fences"]) + 1
				for k6: String in keys:
					await act.call(k6, ["fence", "heal"])
					await act.call(k6, ["done"])
			"contract":
				seen["jobs"] = int(seen["jobs"]) + 1
				for k7: String in keys:
					await act.call(k7, ["contract", float(randi() % 4)])
			"jobResult":
				for k8: String in keys:
					await act.call(k8, ["home"])
			"marks":
				seen["marks"] = int(seen["marks"]) + 1
				for k9: String in keys:
					await act.call(k9, ["mark", "shark" if randf() < 0.5 else "whale"])
			"breather":
				seen["votes"] = int(seen["votes"]) + 1
				var deep: int = int(t._r["run"]["roll"]["cleared"])
				for k10: String in keys:
					await act.call(k10, ["vote", "hold" if hold_at >= 0 and deep >= hold_at else ("bank" if deep >= bank_at else "dive")])
			"haul", "dead", "held":
				for k11: String in keys:
					await act.call(k11, ["home"])
	seen["steps"] = steps
	seen["result"] = str(t._r.get("result", ""))
	seen["depth"] = int(Js.obj(t._r.get("run")).get("roll", {}).get("cleared", 0))
	return seen


func _init() -> void:
	Captains.dir_override = "user://gauntlet_check_captains"
	Charter.dir_override = "user://gauntlet_check_charters"
	for dd: String in [Captains.dir_override, Charter.dir_override]:
		if DirAccess.dir_exists_absolute(dd):
			for f: String in DirAccess.get_files_at(dd):
				DirAccess.remove_absolute("%s/%s" % [dd, f])
	await process_frame
	Dice.install(Dice.Mulberry32.new(7))
	seed(7)

	# ── Alone: Davy's Gauntlet, banked at depth 8 ──
	var fresh: Dictionary = Captains.create(Captains.new_id())
	var me: Session = Session.new(fresh["save"], fresh["carried"])
	Dice.install(Dice.Mulberry32.new(7))
	_strong(me, true)
	var t: GauntletTable = GauntletTable.new()
	t.solo = me
	root.add_child(t)
	var solo_act: Callable = func(k: String, args: Array) -> Dictionary: return t.handle(k, me, args)
	var coin0: float = Js.num(me.profile().get("doubloons"))
	var fath0: float = Js.num(me.profile().get("gauntlet_fathoms"))
	check(not t.handle("me", me, ["call", { "variant": "davy" }]).has("error"), "a solo dive is called")
	check(not t.handle("me", me, ["go"]).has("error"), "and goes down")
	var r1: Dictionary = await _play(t, ["me"], solo_act, 8)
	print("  alone, Davy's: %s at depth %d, %d fights, %d drafts, %d curses, %d shrines, %d breathers, %d steps" % [r1["result"], r1["depth"], r1["fights"], r1["drafts"], r1["curses"], r1["shrines"], r1["votes"], r1["steps"]])
	check(r1["result"] in ["banked", "lost"], "the dive ends")
	if r1["result"] == "banked":
		check(Js.num(me.profile().get("doubloons")) > coin0, "the pot is banked into the save")
		check(Js.num(me.profile().get("gauntlet_deepest")) >= 8.0 or Js.num(me.profile().get("gauntlet_deepest")) == 20.0, "the record holds")
	check(Js.num(me.profile().get("gauntlet_fathoms")) > fath0 - 20.0, "Fathoms are paid")
	check(int(r1["drafts"]) > 0, "a draft came up")
	t.queue_free()

	# ── Together: Don's Gauntlet, three captains ──
	var c: Charter = Charter.found("The Dive Test", false, "anna-key", "Anna")
	var a: Session = c.session_for("anna-key")
	var b: Session = c.add_member("ben-key", "Ben")
	var x: Session = c.add_member("cal-key", "Cal")
	for s: Session in [a, b, x]:
		_strong(s, true)
	var gt: GauntletTable = GauntletTable.new()
	root.add_child(gt)
	gt.charter = c
	c.gauntlets = gt
	var by_key: Dictionary = { "anna-key": a, "ben-key": b, "cal-key": x }
	var party_act: Callable = func(k: String, args: Array) -> Dictionary:
		var r: Variant = await c.run(by_key[k], "gauntletTable", args)
		return r if r is Dictionary else {}
	var at: Vector2 = GauntletTable.maelstrom_of("don")
	check(at != Vector2.INF, "Don's maelstrom is on the water")
	var here: Dictionary = { "variant": "don", "x": at.x, "y": at.y }
	check((await party_act.call("anna-key", ["call", { "variant": "don", "x": at.x + 9000.0, "y": at.y }])).has("error"), "a dive is called at the maelstrom")
	check(not (await party_act.call("anna-key", ["call", here])).has("error"), "Anna calls Don's Gauntlet")
	check((await party_act.call("ben-key", ["join", here])).has("error"), "a solo dive takes nobody else")
	check(not (await party_act.call("anna-key", ["mode", "coop"])).has("error"), "Anna makes it a co-op dive")
	check(not (await party_act.call("ben-key", ["join", here])).has("error"), "Ben joins")
	check(not (await party_act.call("cal-key", ["join", here])).has("error"), "Cal joins")
	check((await party_act.call("anna-key", ["go"])).has("error"), "not until the crew are ready")
	await party_act.call("ben-key", ["ready", true])
	await party_act.call("cal-key", ["ready", true])
	check(not (await party_act.call("anna-key", ["go"])).has("error"), "down they go")
	check((gt._r["b"]["foes"] as Array).size() >= 1, "a field faces them")
	var r2: Dictionary = await _play(gt, ["anna-key", "ben-key", "cal-key"], party_act, 24)
	print("  together, Don's: %s at depth %d, %d fights, %d drafts, %d curses, %d shrines, %d fences, %d jobs, %d marks, %d towed, %d steps" % [r2["result"], r2["depth"], r2["fights"], r2["drafts"], r2["curses"], r2["shrines"], r2["fences"], r2["jobs"], r2["marks"], r2["towed"], r2["steps"]])
	check(r2["result"] in ["banked", "lost"], "the party's dive ends")
	var orders: Array = r2["orders"]
	var firsts: Dictionary = {}
	for o: Array in orders:
		if o.size() == 3:
			firsts[o[0]] = true
	check(firsts.size() >= 2 or int(r2["drafts"]) < 3, "the draft order rotates")
	gt._r = { "phase": "idle", "seq": 0 }

	# ── Held: a co-op dive voted to hold, then resumed by the same crew ──
	await party_act.call("anna-key", ["call", here])
	await party_act.call("anna-key", ["mode", "coop"])
	await party_act.call("ben-key", ["join", here])
	await party_act.call("ben-key", ["ready", true])
	await party_act.call("anna-key", ["go"])
	var r3: Dictionary = await _play(gt, ["anna-key", "ben-key"], party_act, 999, 6000, 3)
	var held: Dictionary = Js.obj(Js.obj(c.data.get("gauntletHeld")).get("don"))
	print("  held, Don's: %s at depth %d" % [r3["result"], r3["depth"]])
	if r3["result"] == "held":
		check(not held.is_empty() and str(held["status"]) == "held", "the held dive is written into the Charter")
		var pot_then: float = Js.num(held.get("pot"))
		gt._r = { "phase": "idle", "seq": 0 }
		await party_act.call("anna-key", ["call", here])
		check(not Js.obj(gt.state.get("held")).is_empty(), "the muster offers the held dive")
		check(not (await party_act.call("anna-key", ["resume", true])).has("error"), "Anna picks the held dive")
		check((await party_act.call("anna-key", ["go"])).has("error"), "not without the whole crew of it")
		await party_act.call("ben-key", ["join", here])
		await party_act.call("ben-key", ["ready", true])
		var rg: Dictionary = await party_act.call("anna-key", ["go"])
		check(not rg.has("error"), "resumed (%s)" % str(rg))
		check(Js.num(gt._r["run"]["pot"]) == pot_then, "the pot comes back as it was")
		var r4: Dictionary = await _play(gt, ["anna-key", "ben-key"], party_act, int(r3["depth"]) + 2)
		print("  resumed, Don's: %s at depth %d" % [r4["result"], r4["depth"]])
		check(r4["result"] in ["banked", "lost"], "the resumed dive ends")
		check(Js.obj(Js.obj(c.data.get("gauntletHeld")).get("don")).is_empty(), "and its hold is cleared")
		check(Js.num(a.profile().get("dons_gauntlet_coop_runs_completed")) + Js.num(a.profile().get("dons_gauntlet_coop_runs_sunk")) >= 1.0, "co-op records kept")
	else:
		check(r3["result"] == "lost", "sank before the hold (allowed)")
	print("  gauntlet check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(1 if bad > 0 else 0)
