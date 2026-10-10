extends RefCounted
## Part of Casino: Fish Roulette (a port of web/lib/roulette.ts and the
## spin in web/lib/core/casino.ts): the bet shapes, the slip's checks and the
## spin over the purse. Split out of core/casino.gd on 2026-10-10 for size;
## Casino forwards what the Den and RulesApi call.


const RED: Array = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
const INSIDE: Array = ["straight", "split", "street", "corner", "line"]


static func street_numbers(i: float) -> Array:
	return [3.0 * i - 2.0, 3.0 * i - 1.0, 3.0 * i]


static func line_numbers(i: float) -> Array:
	return street_numbers(i) + street_numbers(i + 1.0)


static func split_adjacent(a: float, b: float) -> bool:
	if a < 1 or b < 1 or a > 36 or b > 36 or a == b:
		return false
	var lo: float = minf(a, b)
	var hi: float = maxf(a, b)
	if hi - lo == 1.0 and fmod(lo, 3.0) != 0.0:
		return true
	return hi - lo == 3.0


static func valid_corner(nums: Variant) -> bool:
	if not (nums is Array) or (nums as Array).size() != 4:
		return false
	var s: Array = (nums as Array).duplicate()
	s.sort_custom(func(x: Variant, y: Variant) -> bool: return float(x) < float(y))
	var a: float = float(s[0])
	if a < 1 or float(s[3]) > 36:
		return false
	if fmod(a, 3.0) == 0.0:
		return false
	return float(s[1]) == a + 1 and float(s[2]) == a + 3 and float(s[3]) == a + 4


static func color_of(n: float) -> String:
	if n == 0:
		return "green"
	return "red" if RED.has(int(n)) else "black"


static func _num(v: Variant) -> bool:
	return typeof(v) == TYPE_FLOAT or typeof(v) == TYPE_INT


static func is_winner(bet: Dictionary, n: float) -> bool:
	var t: Variant = bet["target"]
	match bet["type"]:
		"straight":
			return _num(t) and float(t) == n
		"split", "corner":
			return t is Array and (t as Array).any(func(x: Variant) -> bool: return _num(x) and float(x) == n)
		"street":
			return _num(t) and street_numbers(float(t)).has(n)
		"line":
			return _num(t) and line_numbers(float(t)).has(n)
		"dozen":
			return n != 0 and _num(t) and float(t) == (1.0 if n <= 12 else (2.0 if n <= 24 else 3.0))
		"column":
			var m: float = fmod(n, 3.0)
			return n != 0 and _num(t) and float(t) == (1.0 if m == 1.0 else (2.0 if m == 2.0 else 3.0))
		"color":
			return t is String and t == color_of(n)
		"parity":
			return n != 0 and t is String and t == ("even" if fmod(n, 2.0) == 0.0 else "odd")
		"half":
			return n != 0 and t is String and t == ("low" if n <= 18 else "high")
	return false


static func validate_bet(bet: Dictionary, lo: float, hi: float) -> String:
	var amt: Variant = bet.get("amount")
	if not Casino._is_int(amt) or float(amt) < lo or float(amt) > hi:
		return "Each bet must be %s–%s chips" % [JsJson.number(lo), JsJson.number(hi)]
	var t: Variant = bet.get("target")
	match bet.get("type"):
		"straight":
			if not Casino._is_int(t) or float(t) < 0 or float(t) > 36:
				return "Invalid number"
			return ""
		"split":
			if not (t is Array) or (t as Array).size() != 2:
				return "Invalid split"
			if not (_num(t[0]) and _num(t[1])) or not split_adjacent(float(t[0]), float(t[1])):
				return "Numbers not adjacent for split"
			return ""
		"street":
			if not Casino._is_int(t) or float(t) < 1 or float(t) > 12:
				return "Invalid street"
			return ""
		"corner":
			if not (t is Array) or not valid_corner(t):
				return "Invalid corner"
			return ""
		"line":
			if not Casino._is_int(t) or float(t) < 1 or float(t) > 11:
				return "Invalid line"
			return ""
		"dozen", "column":
			if not (_num(t) and (float(t) == 1.0 or float(t) == 2.0 or float(t) == 3.0)):
				return "Invalid group"
			return ""
		"color":
			if t != "red" and t != "black":
				return "Invalid color"
			return ""
		"parity":
			if t != "even" and t != "odd":
				return "Invalid parity"
			return ""
		"half":
			if t != "low" and t != "high":
				return "Invalid half"
			return ""
	return "Unknown bet type"


static func slip_refusal(bets: Variant) -> String:
	if not (bets is Array) or (bets as Array).is_empty():
		return "Place at least one bet"
	if (bets as Array).size() > 50:
		return "Too many bets"
	var zones: Dictionary = {}
	var sum: float = 0.0
	for bet: Dictionary in bets:
		var hi: float = float(Casino.c()["rlMaxStraight"]) if INSIDE.has(bet.get("type")) else float(Casino.c()["rlMaxOutside"])
		var err: String = validate_bet(bet, float(Casino.c()["rlMin"]), hi)
		if err != "":
			return err
		var zone: String = "%s:%s" % [bet["type"], JsJson.stringify(bet["target"])]
		var total: float = float(zones.get(zone, 0.0)) + float(bet["amount"])
		if total > hi:
			return "Each bet maxes out at %s chips" % Js.thousands(hi)
		zones[zone] = total
		sum += float(bet["amount"])
	if sum <= 0.0:
		return "Invalid bet total"
	return ""


static func roulette_state(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "doubloons, casino_chips, casino_session_buy_ins, roulette_session_net, fishing_xp, expedition_xp, is_premium, premium_expires_at")
	var today: float = Casino._bought_today(db, uid)
	var recent: Array = []
	var rows: Array = (Casino._den(db)["rouletteSpins"] as Array).duplicate()
	rows.reverse()
	for r: Dictionary in rows.slice(0, 20):
		recent.append({ "id": r["id"], "winningNumber": r["winning_number"], "net": r["net_chips"], "totalWagered": r["total_wagered"], "createdAt": r["created_at"] })
	var cap: float = Casino.cap_for(p)
	return {
		"chips": Js.num(p.get("casino_chips")), "doubloons": Js.num(p.get("doubloons")),
		"sessionBuyIns": Js.num(p.get("casino_session_buy_ins")), "sessionNet": Js.num(p.get("roulette_session_net")),
		"dailyBoughtIn": today, "dailyCap": cap, "dailyRemaining": maxf(0.0, cap - today),
		"recentSpins": recent,
	}


## `at`: the number the wheel already landed on (a Charter's shared table
## spins once for everyone), or -1 to roll it here.
static func spin_roulette(db: CaptainStore, uid: String, bets: Variant, at: int = -1) -> Dictionary:
	var gb: String = Casino.gate(db, uid, "den_roulette")
	if gb != "":
		return { "error": gb }
	var err: String = slip_refusal(bets)
	if err != "":
		return { "error": err }
	var p: Dictionary = db.profile(uid, "casino_chips, casino_session_buy_ins, roulette_session_net, doubloons")
	if p.is_empty():
		return { "error": "Profile not found" }
	var total: float = 0.0
	for b: Dictionary in bets:
		total += float(b["amount"])
	var after_stake: Variant = db.spend(uid, "casino_chips", total)
	if after_stake == null:
		return { "error": "Not enough chips" }
	var before: float = float(after_stake) + total
	var n: float = floor(Dice.next() * 37.0) if at < 0 else float(at)
	var mult: Dictionary = Casino.c()["payoutMult"]
	var paid: float = 0.0
	var wagered: float = 0.0
	var per: Array = []
	for b: Dictionary in bets:
		var pay: float = float(b["amount"]) * float(mult[b["type"]]) if is_winner(b, n) else 0.0
		wagered += float(b["amount"])
		paid += pay
		per.append({ "bet": b, "payout": pay, "won": pay > 0.0 })
	var net: float = paid - wagered
	var after: float = db.grant(uid, "casino_chips", paid) if paid > 0.0 else float(after_stake)
	var ar: Dictionary = Casino.after_round(after, Js.num(p.get("roulette_session_net")), net, Js.num(p.get("casino_session_buy_ins")))
	var patch: Dictionary = { "roulette_session_net": ar["sessionNet"] }
	if ar["busted"]:
		patch["casino_session_buy_ins"] = 0.0
		patch["blackjack_session_net"] = 0.0
		patch["slots_session_net"] = 0.0
	db.update_profile(uid, patch)
	var den: Dictionary = Casino._den(db)
	var row: Dictionary = { "id": db.next_id(), "bets": bets, "winning_number": n, "total_wagered": wagered, "total_payout": paid,
		"net_chips": net, "chips_before": before, "chips_after": after, "created_at": Casino._now_iso() }
	var spins: Array = (den["rouletteSpins"] as Array) + [row]
	den["rouletteSpins"] = spins.slice(maxi(0, spins.size() - int(Casino.c()["keepRoulette"])))
	if per.any(func(pb: Dictionary) -> bool: return pb["won"] and (pb["bet"] as Dictionary)["type"] == "straight"):
		db.grant_badge(uid, "called_it")
	return {
		"winningNumber": n, "totalWagered": wagered, "totalPayout": paid, "net": net,
		"chipsBefore": before, "chipsAfter": after, "perBet": per,
		"doubloons": Js.num(p.get("doubloons")), "sessionNet": ar["sessionNet"], "sessionBuyIns": ar["sessionBuyIns"],
	}
