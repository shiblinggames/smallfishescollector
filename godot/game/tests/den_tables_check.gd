extends SceneTree
## THE DEN'S SHARED TABLES, in one process (Godot port): a Charter with two
## captains, both at the roulette wheel and the blackjack table, played round
## after round through the same path a crewmate's action takes (Charter.run
## with "denTable"). Checks: one number settles everyone; nobody's chips move
## but by what they bet and won; the wheel waits for everyone ready and spins
## on the countdown; blackjack deals when all are ready, keeps turns in seat
## order, takes a stand when a turn runs out, pays every seat; and every table
## sent out names the same round.
##
##   godot --headless --path godot/game -s tests/den_tables_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://den_tables_captains"
	Charter.dir_override = "user://den_tables_charters"
	for d: String in [Captains.dir_override, Charter.dir_override]:
		if DirAccess.dir_exists_absolute(d):
			for f: String in DirAccess.get_files_at(d):
				DirAccess.remove_absolute("%s/%s" % [d, f])
	await process_frame
	var c: Charter = Charter.found("The Den Test", false, "anna-key", "Anna")
	var a: Session = c.session_for("anna-key")
	var b: Session = c.add_member("ben-key", "Ben")
	var xp: Array = Rules.data()["xpTable"]
	for s: Session in [a, b]:
		s.store.me(s.uid)["fishing_xp"] = float(xp[29])
		s.store.me(s.uid)["casino_chips"] = 5000.0
	var t: DenTables = DenTables.new()
	root.add_child(t)
	t.charter = c
	c.tables = t
	var seen: Array = []
	t.changed.connect(func(game: String, st: Dictionary) -> void: seen.append([game, st]))

	# ── Roulette ──
	check(not (await c.run(a, "denTable", ["roulette", "sit"])).has("error"), "Anna sits at the wheel")
	check(not (await c.run(b, "denTable", ["roulette", "sit"])).has("error"), "Ben sits at the wheel")
	var spins: int = 0
	for round: int in 12:
		var a0: float = Js.num(a.profile().get("casino_chips"))
		var b0: float = Js.num(b.profile().get("casino_chips"))
		var ab: Array = [{ "type": "color", "target": "red", "amount": 50.0 }, { "type": "straight", "target": float(round), "amount": 10.0 }]
		var bb: Array = [{ "type": "parity", "target": "even", "amount": 100.0 }]
		check(not (await c.run(a, "denTable", ["roulette", "bets", { "bets": ab, "ready": true }])).has("error"), "Anna's chips go down")
		check(t._rl["phase"] == "betting", "the wheel waits for Ben")
		if round % 3 == 0:
			# Ben dawdles: the countdown spins it with his chips down but unready.
			await c.run(b, "denTable", ["roulette", "bets", { "bets": bb, "ready": false }])
			t._process(DenTables.RL_BETTING + 0.1)
		else:
			await c.run(b, "denTable", ["roulette", "bets", { "bets": bb, "ready": true }])
		check(t._rl["phase"] == "spun", "the wheel spins (round %d)" % round)
		var res: Dictionary = t._rl["result"]
		var n: int = int(res["n"])
		var ar: Dictionary = res["by"]["anna-key"]
		var br: Dictionary = res["by"]["ben-key"]
		var a_want: float = 0.0
		if Casino.color_of(n) == "red":
			a_want += 100.0
		if n == round:
			a_want += 360.0
		var b_want: float = 200.0 if n != 0 and n % 2 == 0 else 0.0
		check(float(ar["payout"]) == a_want and float(br["payout"]) == b_want, "one number (%d) settles both (%s, %s)" % [n, str(ar["payout"]), str(br["payout"])])
		check(Js.num(a.profile().get("casino_chips")) == a0 - 60.0 + a_want, "Anna's chips are her bets and wins only")
		check(Js.num(b.profile().get("casino_chips")) == b0 - 100.0 + b_want, "Ben's chips are his bets and wins only")
		spins += 1
		t._process(DenTables.RL_SPUN + 0.1)
		check(t._rl["phase"] == "betting" and (t._rl["seats"]["anna-key"]["bets"] as Array).is_empty(), "the board clears for the next spin")
	check(not (await c.run(a, "denTable", ["roulette", "bets", { "bets": [{ "type": "color", "target": "red", "amount": 9999.0 }], "ready": true }])).has("ok"), "a bad slip is refused")

	# ── Blackjack ──
	check(not (await c.run(a, "denTable", ["blackjack", "sit"])).has("error"), "Anna sits at blackjack")
	check(not (await c.run(b, "denTable", ["blackjack", "sit"])).has("error"), "Ben sits at blackjack")
	var hands: int = 0
	for round: int in 40:
		var a0: float = Js.num(a.profile().get("casino_chips"))
		var b0: float = Js.num(b.profile().get("casino_chips"))
		await c.run(a, "denTable", ["blackjack", "ready", 50.0])
		check(t._bj["phase"] == "betting", "the table waits for Ben to be ready")
		await c.run(b, "denTable", ["blackjack", "ready", 25.0])
		check(t._bj["phase"] in ["playing", "result"], "it deals when both are ready")
		var guard: int = 0
		while t._bj["phase"] == "playing" and guard < 40:
			guard += 1
			var who: String = t._bj["turn"]
			var s: Session = a if who == "anna-key" else b
			var other: Session = b if s == a else a
			check(not (await c.run(other, "denTable", ["blackjack", "hit"])).has("ok"), "only the seat whose turn it is may move")
			if round % 7 == 3 and guard == 1:
				t._process(DenTables.BJ_TURN + 0.1)
				continue
			var h: Dictionary = t._bj["seats"][who]["hands"][int(t._bj["hand"])]
			var total: float = float(Casino.hand_value(h["cards"])["total"])
			var m: String = "hit" if total < 15.0 else "stand"
			if round % 5 == 1 and (h["cards"] as Array).size() == 2 and not h["isSplit"]:
				m = "double"
			if Casino.can_split(h["cards"]) and (t._bj["seats"][who]["hands"] as Array).size() == 1:
				m = "split"
			var r: Dictionary = await c.run(s, "denTable", ["blackjack", m])
			check(not r.has("error"), "%s's %s goes through (%s)" % [who, m, str(r.get("error", ""))])
		check(t._bj["phase"] == "result", "every seat is paid (round %d)" % round)
		for pair: Array in [[a, "anna-key", a0], [b, "ben-key", b0]]:
			var seat: Dictionary = t._bj["seats"][pair[1]]
			check(Js.num((pair[0] as Session).profile().get("casino_chips")) == float(pair[2]) + float(seat["net"]), "%s's chips move by their net only" % pair[1])
		hands += 1
		t._process(DenTables.BJ_RESULT + 0.1)
		check(t._bj["phase"] == "betting", "a new hand after the result")
	# Every table sent out was one the founder had.
	var rounds_ok: bool = seen.all(func(e: Array) -> bool: return e[1].has("round"))
	check(rounds_ok and seen.size() > 50, "the tables went out (%d updates)" % seen.size())
	print("  den tables check: %s (%d spins, %d hands)" % ["ok" if bad == 0 else "%d FAILED" % bad, spins, hands])
	quit(0 if bad == 0 else 1)
