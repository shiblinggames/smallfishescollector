extends RefCounted
## Part of Casino: Blackjack (a port of web/lib/blackjack.ts and the hand
## in web/lib/core/casino.ts): the shoe, the table's turns, the settle and
## the moves over the purse. Split out of core/casino.gd on 2026-10-10 for
## size; Casino forwards what the Den, the Charter's table and RulesApi call.


static func rank(card: String) -> String:
	return card.left(1)


static func new_shoe() -> Array:
	var shoe: Array = []
	for d: int in int(Casino.c()["deckCount"]):
		for r: String in Casino.c()["ranks"]:
			for s: String in Casino.c()["suits"]:
				shoe.append(r + s)
	for i: int in range(shoe.size() - 1, 0, -1):
		var j: int = int(floor(Dice.next() * (i + 1)))
		var t: String = shoe[i]
		shoe[i] = shoe[j]
		shoe[j] = t
	return shoe


static func draw(shoe: Array) -> String:
	return shoe.pop_back()


static func hand_value(cards: Array) -> Dictionary:
	var total: int = 0
	var aces: int = 0
	for cd: String in cards:
		var r: String = rank(cd)
		if r == "A":
			aces += 1
			total += 11
		elif r in ["K", "Q", "J", "T"]:
			total += 10
		else:
			total += int(r)
	while total > 21 and aces > 0:
		total -= 10
		aces -= 1
	return { "total": float(total), "soft": aces > 0 }


static func is_natural(cards: Array) -> bool:
	return cards.size() == 2 and float(hand_value(cards)["total"]) == 21.0


static func can_split(cards: Array) -> bool:
	return cards.size() == 2 and rank(cards[0]) == rank(cards[1])


static func dealer_play(shoe: Array, dealer: Array) -> Array:
	var hand: Array = dealer.duplicate()
	while true:
		var v: Dictionary = hand_value(hand)
		if not (float(v["total"]) < 17.0 or (float(v["total"]) == 17.0 and v["soft"])):
			break
		hand.append(draw(shoe))
	return hand


static func _advance(st: Dictionary) -> void:
	var hands: Array = st["hands"]
	while int(st["activeHandIdx"]) < hands.size():
		var h: Dictionary = hands[int(st["activeHandIdx"])]
		if not h["busted"] and not h["stood"]:
			return
		st["activeHandIdx"] = float(int(st["activeHandIdx"]) + 1)
	st["dealerCards"] = dealer_play(st["shoe"], st["dealerCards"])
	st["phase"] = "settled"


static func _close_naturals(st: Dictionary) -> void:
	for h: Dictionary in st["hands"]:
		h["stood"] = true
	st["activeHandIdx"] = float((st["hands"] as Array).size())
	st["phase"] = "settled"


static func deal_table(wager: float) -> Dictionary:
	var shoe: Array = new_shoe()
	var pc: Array = [draw(shoe), draw(shoe)]
	var dc: Array = [draw(shoe), draw(shoe)]
	var nat: bool = is_natural(pc)
	var st: Dictionary = {
		"shoe": shoe,
		"hands": [{ "cards": pc, "wager": wager, "doubled": false, "stood": nat, "busted": false, "isNatural": nat, "isSplit": false }],
		"activeHandIdx": 0.0, "dealerCards": dc,
		"insuranceTaken": false, "insuranceAmount": 0.0, "insuranceResolved": false,
		"phase": "insuranceOffered" if rank(dc[0]) == "A" else "playerTurn",
	}
	if st["phase"] == "playerTurn" and (nat or is_natural(dc)):
		_close_naturals(st)
	return st


static func _stand_all(st: Dictionary) -> void:
	for h: Dictionary in st["hands"]:
		if not h["busted"] and not h["stood"]:
			h["stood"] = true
	st["activeHandIdx"] = float((st["hands"] as Array).size())
	st["dealerCards"] = dealer_play(st["shoe"], st["dealerCards"])
	st["phase"] = "settled"


static func _turn_refusal(st: Dictionary) -> String:
	if st["phase"] != "playerTurn":
		return "Not your turn"
	var hands: Array = st["hands"]
	var i: int = int(st["activeHandIdx"])
	if i >= hands.size() or (hands[i] as Dictionary)["stood"] or (hands[i] as Dictionary)["busted"]:
		return "Hand already done"
	return ""


static func _settle_hand(h: Dictionary, dealer: Dictionary) -> Dictionary:
	var total: float = float(hand_value(h["cards"])["total"])
	var outcome: String
	if total > 21.0:
		outcome = "lose"
	elif h["isNatural"] and dealer["natural"]:
		outcome = "push"
	elif h["isNatural"]:
		outcome = "blackjack"
	elif dealer["natural"]:
		outcome = "lose"
	elif dealer["bust"]:
		outcome = "win"
	elif total > float(dealer["total"]):
		outcome = "win"
	elif total < float(dealer["total"]):
		outcome = "lose"
	else:
		outcome = "push"
	var w: float = float(h["wager"])
	var payout: float = 0.0
	if outcome == "blackjack":
		payout = floor(w * 2.5)
	elif outcome == "win":
		payout = w * 2.0
	elif outcome == "push":
		payout = w
	return { "cards": h["cards"], "wager": w, "doubled": h["doubled"], "total": total, "outcome": outcome, "payout": payout, "net": payout - w }


static func _settle_table(st: Dictionary, total_wagered: float) -> Dictionary:
	var df: Array = st["dealerCards"]
	var dt: float = float(hand_value(df)["total"])
	var dealer: Dictionary = { "cards": df, "total": dt, "bust": dt > 21.0, "natural": is_natural(df) }
	var settled: Array = []
	for h: Dictionary in st["hands"]:
		settled.append(_settle_hand(h, dealer))
	var ins_amt: float = float(st["insuranceAmount"])
	var ins: Dictionary
	if ins_amt <= 0.0:
		ins = { "paid": 0.0, "net": 0.0, "win": false }
	elif dealer["natural"]:
		ins = { "paid": ins_amt * 3.0, "net": ins_amt * 2.0, "win": true }
	else:
		ins = { "paid": 0.0, "net": -ins_amt, "win": false }
	var ret: float = float(ins["paid"])
	for s: Dictionary in settled:
		ret += float(s["payout"])
	return { "settled": settled, "dealerFinal": df, "dealerTotal": dt, "dealerBust": dealer["bust"], "dealerNatural": dealer["natural"], "insurance": ins, "totalReturned": ret, "netDelta": ret - total_wagered }


static func _hand(db: CaptainStore, uid: String) -> Dictionary:
	db.me(uid)
	var h: Variant = Casino._den(db).get("hand")
	if not (h is Dictionary) or (h as Dictionary).get("state") == null:
		return {}
	return (h as Dictionary).duplicate(true)


static func _save_hand(db: CaptainStore, id: float, st: Dictionary, total: float) -> void:
	var den: Dictionary = Casino._den(db)
	if den.get("hand") is Dictionary and float(den["hand"]["id"]) == id:
		var h: Dictionary = (den["hand"] as Dictionary).duplicate()
		h["state"] = st.duplicate(true)
		h["total_wagered"] = total
		den["hand"] = h


static func _finalize(db: CaptainStore, uid: String, id: float, st: Dictionary, total: float) -> Variant:
	var t: Dictionary = _settle_table(st, total)
	var den: Dictionary = Casino._den(db)
	if not (den.get("hand") is Dictionary) or float(den["hand"]["id"]) != id:
		return null
	den["hand"] = null
	var new_chips: float = db.grant(uid, "casino_chips", t["totalReturned"]) if float(t["totalReturned"]) > 0.0 else Js.num(db.profile(uid, "casino_chips").get("casino_chips"))
	var p: Dictionary = db.profile(uid, "doubloons, casino_session_buy_ins, blackjack_session_net, blackjack_win_streak, blackjack_dealer_bj_streak")
	var ar: Dictionary = Casino.after_round(new_chips, Js.num(p.get("blackjack_session_net")), t["netDelta"], Js.num(p.get("casino_session_buy_ins")))
	var nd: float = t["netDelta"]
	var pw: float = Js.num(p.get("blackjack_win_streak"))
	var win: float = pw + 1.0 if nd > 0.0 else (0.0 if nd < 0.0 else pw)
	var dbj: float = Js.num(p.get("blackjack_dealer_bj_streak")) + 1.0 if t["dealerNatural"] else 0.0
	var patch: Dictionary = { "casino_session_buy_ins": ar["sessionBuyIns"], "blackjack_session_net": ar["sessionNet"], "blackjack_win_streak": win, "blackjack_dealer_bj_streak": dbj }
	if ar["busted"]:
		patch["roulette_session_net"] = 0.0
		patch["slots_session_net"] = 0.0
	db.update_profile(uid, patch)
	if win >= 5.0:
		db.grant_badge(uid, "unstoppable")
	if dbj >= 2.0:
		db.grant_badge(uid, "stacked_deck")
	var ins: Dictionary = t["insurance"]
	return {
		"handId": id, "hands": t["settled"], "dealerCards": t["dealerFinal"], "dealerTotal": t["dealerTotal"],
		"dealerBust": t["dealerBust"], "dealerNatural": t["dealerNatural"],
		"insurance": { "taken": st["insuranceTaken"], "amount": st["insuranceAmount"], "paid": ins["paid"], "net": ins["net"], "win": ins["win"] },
		"netDelta": nd, "newChips": new_chips, "doubloons": Js.num(p.get("doubloons")),
		"dailyCap": Casino._cap(db, uid), "dailyWagered": Casino._bought_today(db, uid),
		"sessionBuyIns": ar["sessionBuyIns"], "sessionNet": ar["sessionNet"],
	}


static func _settled_or_error(r: Variant) -> Dictionary:
	return { "kind": "settled", "result": r } if r != null else { "error": "Hand already settled" }


static func _active(db: CaptainStore, uid: String, id: float, st: Dictionary, total: float, chips: Variant = null) -> Dictionary:
	var p: Dictionary = db.profile(uid, "casino_chips, doubloons, casino_session_buy_ins, blackjack_session_net")
	var already: float = Casino._bought_today(db, uid)
	var cap: float = Casino._cap(db, uid)
	var ch: float = float(chips) if chips != null else Js.num(p.get("casino_chips"))
	var hands: Array = st["hands"]
	var ai: int = int(st["activeHandIdx"])
	var active: Dictionary = hands[ai] if ai < hands.size() else {}
	var turn: bool = st["phase"] == "playerTurn"
	var initial: float = float((hands[0] as Dictionary)["wager"]) if not hands.is_empty() else 0.0
	var can_hit: bool = turn and not active.is_empty() and not active["busted"] and not active["stood"]
	var can_double: bool = can_hit and (active["cards"] as Array).size() == 2 and not active["isSplit"] and ch >= float(active["wager"])
	var can_split_now: bool = can_hit and hands.size() == 1 and can_split(active["cards"]) and ch >= initial
	var dealer: Array = st["dealerCards"]
	var client_hands: Array = []
	for h: Dictionary in hands:
		var v: Dictionary = hand_value(h["cards"])
		var ch2: Dictionary = h.duplicate()
		ch2["total"] = v["total"]
		ch2["soft"] = v["soft"]
		client_hands.append(ch2)
	var state_out: Dictionary = {
		"handId": id, "phase": st["phase"], "hands": client_hands, "activeHandIdx": st["activeHandIdx"],
		"dealerCards": dealer if st["phase"] == "settled" else [dealer[0], "X"],
		"dealerUpCard": dealer[0],
		"dealerTotal": hand_value(dealer)["total"] if st["phase"] == "settled" else null,
		"insuranceOffered": st["phase"] == "insuranceOffered",
		"insuranceTaken": st["insuranceTaken"], "insuranceAmount": st["insuranceAmount"],
		"totalWagered": total,
		"canHit": can_hit, "canStand": can_hit, "canDouble": can_double, "canSplit": can_split_now,
		"dailyRemaining": maxf(0.0, cap - already), "dailyCap": cap,
		"chips": ch, "doubloons": Js.num(p.get("doubloons")),
		"sessionBuyIns": Js.num(p.get("casino_session_buy_ins")), "sessionNet": Js.num(p.get("blackjack_session_net")),
	}
	return { "kind": "active", "state": state_out }


static func deal(db: CaptainStore, uid: String, wager: Variant) -> Dictionary:
	var gb: String = Casino.gate(db, uid, "den_blackjack")
	if gb != "":
		return { "error": gb }
	if not Casino._is_int(wager) or float(wager) < float(Casino.c()["bjMin"]) or float(wager) > float(Casino.c()["bjMax"]):
		return { "error": "Invalid wager" }
	var w: float = float(wager)
	var orphan: Dictionary = _hand(db, uid)
	if not orphan.is_empty():
		_stand_all(orphan["state"])
		_finalize(db, uid, float(orphan["id"]), orphan["state"], float(orphan["total_wagered"]))
	var after_stake: Variant = db.spend(uid, "casino_chips", w)
	if after_stake == null:
		return { "error": "Not enough chips" }
	var st: Dictionary = deal_table(w)
	var id: float = db.next_id()
	Casino._den(db)["hand"] = { "id": id, "state": st.duplicate(true), "initial_wager": w, "total_wagered": w }
	if st["phase"] == "settled":
		return _settled_or_error(_finalize(db, uid, id, st, w))
	return _active(db, uid, id, st, w, after_stake)


static func insurance(db: CaptainStore, uid: String, take: bool) -> Dictionary:
	var h: Dictionary = _hand(db, uid)
	if h.is_empty():
		return { "error": "No active hand" }
	var st: Dictionary = h["state"]
	if st["phase"] != "insuranceOffered":
		return { "error": "Insurance not available" }
	var total: float = float(h["total_wagered"])
	var after: Variant = null
	if take:
		var cost: float = floor(float(h["initial_wager"]) / 2.0)
		after = db.spend(uid, "casino_chips", cost)
		if after == null:
			return { "error": "Not enough chips for insurance" }
		st["insuranceTaken"] = true
		st["insuranceAmount"] = cost
		total += cost
	st["insuranceResolved"] = true
	if is_natural(st["dealerCards"]) or (st["hands"][0] as Dictionary)["isNatural"]:
		_close_naturals(st)
	else:
		st["phase"] = "playerTurn"
	_save_hand(db, float(h["id"]), st, total)
	if st["phase"] == "settled":
		return _settled_or_error(_finalize(db, uid, float(h["id"]), st, total))
	return _active(db, uid, float(h["id"]), st, total, after)


static func _move(db: CaptainStore, uid: String, op: String) -> Dictionary:
	var h: Dictionary = _hand(db, uid)
	if h.is_empty():
		return { "error": "No active hand" }
	var st: Dictionary = h["state"]
	var total: float = float(h["total_wagered"])
	var initial: float = float(h["initial_wager"])
	var chips: Variant = null
	match op:
		"hit", "stand":
			var r: String = _turn_refusal(st)
			if r != "":
				return { "error": r }
			var a: Dictionary = st["hands"][int(st["activeHandIdx"])]
			if op == "hit":
				(a["cards"] as Array).append(draw(st["shoe"]))
				var t: float = float(hand_value(a["cards"])["total"])
				if t > 21.0:
					a["busted"] = true
				elif t == 21.0:
					a["stood"] = true
			else:
				a["stood"] = true
			_advance(st)
		"double":
			var r: String = _turn_refusal(st)
			if r != "":
				return { "error": r }
			var a: Dictionary = st["hands"][int(st["activeHandIdx"])]
			if (a["cards"] as Array).size() != 2:
				return { "error": "Can only double on initial two cards" }
			if a["isSplit"]:
				return { "error": "No double after split (house rule)" }
			chips = db.spend(uid, "casino_chips", float(a["wager"]))
			if chips == null:
				return { "error": "Not enough chips to double" }
			a["wager"] = float(a["wager"]) * 2.0
			a["doubled"] = true
			(a["cards"] as Array).append(draw(st["shoe"]))
			if float(hand_value(a["cards"])["total"]) > 21.0:
				a["busted"] = true
			a["stood"] = true
			_advance(st)
			total += float(a["wager"]) / 2.0
		"split":
			if st["phase"] != "playerTurn":
				return { "error": "Not your turn" }
			if (st["hands"] as Array).size() != 1:
				return { "error": "No re-splitting (house rule)" }
			var a: Dictionary = st["hands"][0]
			if (a["cards"] as Array).size() != 2 or not can_split(a["cards"]):
				return { "error": "Cannot split" }
			chips = db.spend(uid, "casino_chips", initial)
			if chips == null:
				return { "error": "Not enough chips to split" }
			var c1: String = a["cards"][0]
			var c2: String = a["cards"][1]
			var aces: bool = rank(c1) == "A"
			st["hands"] = [
				{ "cards": [c1, draw(st["shoe"])], "wager": a["wager"], "doubled": false, "stood": aces, "busted": false, "isNatural": false, "isSplit": true },
				{ "cards": [c2, draw(st["shoe"])], "wager": initial, "doubled": false, "stood": aces, "busted": false, "isNatural": false, "isSplit": true },
			]
			st["activeHandIdx"] = 0.0
			_advance(st)
			total += initial
	_save_hand(db, float(h["id"]), st, total)
	if st["phase"] == "settled":
		return _settled_or_error(_finalize(db, uid, float(h["id"]), st, total))
	return _active(db, uid, float(h["id"]), st, total, chips)


static func resume(db: CaptainStore, uid: String) -> Variant:
	var h: Dictionary = _hand(db, uid)
	if h.is_empty():
		return null
	var v: Dictionary = _active(db, uid, float(h["id"]), h["state"], float(h["total_wagered"]))
	return v.get("state")
