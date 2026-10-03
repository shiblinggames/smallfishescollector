class_name Casino
extends RefCounted
## THE DEN, a port of web/lib/core/casino.ts with web/lib/casinoRules.ts,
## web/lib/roulette.ts, web/lib/blackjack.ts and the local store's casino
## (web/lib/data/local/casinoLocal.ts); the tables come from rules.json
## "casino".
##
## ONE chip purse (profile.casino_chips) backs all three games. Buy-in turns
## doubloons into chips against one shared daily cap; chips churn freely
## between the games; cash-out turns them all back and ends the session. A
## purse that hits zero ends the session too.
##
## THE PORT'S OWN RULES (port_rules "casino"; never under parity; Kong
## 2026-10-02): the Catfish Jackpot is a fixed multiple of the bet (no shared
## pot, nothing fed into it), the slots pay table is trimmed so the machine is
## a gentle sink, and the daily buy-in cap follows the Fishing level alone.


static func c() -> Dictionary:
	return Rules.data()["casino"]


static func _den(db: CaptainStore) -> Dictionary:
	if not (db.save.get("casino") is Dictionary):
		var seed: float = float(c()["potSeed"])
		db.save["casino"] = { "buyIns": [], "hand": null, "rouletteSpins": [], "slots": { "spins": 0.0, "net": 0.0, "biggest_win": 0.0 },
			"pot": { "pot": seed, "seed": seed, "last_winner_name": null, "last_win_amount": null, "last_won_at": null } }
	return db.save["casino"]


static func _now_iso() -> String:
	return Js.iso(Clock.now_ms())


static func day_start() -> String:
	return _now_iso().split("T")[0]


static func _is_int(v: Variant) -> bool:
	return (typeof(v) == TYPE_FLOAT or typeof(v) == TYPE_INT) and is_finite(float(v)) and float(v) == floor(float(v))


# ── The purse ──────────────────────────────────────────────────────────────────

static func bought_in_since(db: CaptainStore, uid: String, since: String) -> float:
	db.me(uid)
	var n: float = 0.0
	for b: Dictionary in _den(db)["buyIns"]:
		if str(b["at"]) >= since:
			n += float(b["amount"])
	return n


static func _bought_today(db: CaptainStore, uid: String) -> float:
	return bought_in_since(db, uid, day_start())


## The day's buy-in cap. The web's: 2,000, or for a Captain climbing with
## Fishing + Navigation to 20,000. The port's: by Fishing level alone
## (port_rules casino.capByLevel, [level, cap] steps).
static func cap_for(p: Dictionary) -> float:
	var steps: Array = Js.list(c().get("capByLevel"))
	if not steps.is_empty():
		var lv: int = Rules.level_from_xp(Js.num(p.get("fishing_xp")))
		var cap: float = 0.0
		for s: Array in steps:
			if lv >= int(s[0]):
				cap = float(s[1])
		return cap
	if not Rules.premium_active(p):
		return float(c()["capBase"])
	var t: float = clampf(float(Rules.level_from_xp(Js.num(p.get("fishing_xp"))) + Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))), 0.0, float(c()["capMaxLevel"]))
	return Js.round(float(c()["capBase"]) + (float(c()["capMax"]) - float(c()["capBase"])) * (t / float(c()["capMaxLevel"])))


static func _cap(db: CaptainStore, uid: String) -> float:
	return cap_for(db.profile(uid, "fishing_xp, expedition_xp, is_premium, premium_expires_at"))


static func buy_in_ok(amount: Variant) -> bool:
	return _is_int(amount) and float(amount) >= float(c()["buyInMin"]) and float(amount) <= float(c()["buyInMax"])


static func buy_in_refusal(amount: float, doubloons: float, already: float, cap: float) -> String:
	if not buy_in_ok(amount):
		return "Invalid amount"
	if doubloons < amount:
		return "Insufficient doubloons"
	if already + amount > cap:
		return "Daily limit reached (%s ⟡)" % Js.thousands(cap)
	return ""


static func after_round(chips_after: float, prev_net: float, net: float, prev_buy_ins: float) -> Dictionary:
	var busted: bool = chips_after == 0.0
	return { "busted": busted, "sessionNet": 0.0 if busted else prev_net + net, "sessionBuyIns": 0.0 if busted else prev_buy_ins }


static func state(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "doubloons, casino_chips, casino_session_buy_ins, blackjack_session_net, roulette_session_net, slots_session_net, fishing_xp, expedition_xp, is_premium, premium_expires_at")
	var today: float = _bought_today(db, uid)
	var cap: float = cap_for(p)
	return {
		"isMember": Rules.premium_active(p),
		"chips": Js.num(p.get("casino_chips")),
		"doubloons": Js.num(p.get("doubloons")),
		"sessionBuyIns": Js.num(p.get("casino_session_buy_ins")),
		"dailyBoughtIn": today,
		"dailyCap": cap,
		"dailyRemaining": maxf(0.0, cap - today),
		"sessionNets": {
			"blackjack": Js.num(p.get("blackjack_session_net")),
			"roulette": Js.num(p.get("roulette_session_net")),
			"slots": Js.num(p.get("slots_session_net")),
		},
	}


static func buy_in(db: CaptainStore, uid: String, amount: Variant) -> Dictionary:
	if not buy_in_ok(amount):
		return { "error": "Invalid amount" }
	var amt: float = float(amount)
	var p: Dictionary = db.profile(uid, "doubloons, casino_session_buy_ins")
	if p.is_empty():
		return { "error": "Profile not found" }
	var doubloons: float = Js.num(p.get("doubloons"))
	var prev: float = Js.num(p.get("casino_session_buy_ins"))
	if doubloons < amt:
		return { "error": "Insufficient doubloons" }
	var already: float = _bought_today(db, uid)
	var cap: float = _cap(db, uid)
	var refusal: String = buy_in_refusal(amt, doubloons, already, cap)
	if refusal != "":
		return { "error": refusal }
	var new_d: Variant = db.spend(uid, "doubloons", amt)
	if new_d == null:
		return { "error": "Insufficient doubloons" }
	var new_chips: float = db.grant(uid, "casino_chips", amt)
	var new_sbi: float = prev + amt
	db.update_profile(uid, { "casino_session_buy_ins": new_sbi })
	var den: Dictionary = _den(db)
	var cutoff: String = Js.iso(Clock.now_ms() - 2.0 * 86400000.0)
	den["buyIns"] = (den["buyIns"] as Array).filter(func(b: Dictionary) -> bool: return str(b["at"]) >= cutoff) + [{ "amount": amt, "at": _now_iso() }]
	db.ledger(uid, -amt, "Casino: buy-in %s ⟡" % JsJson.number(amt))
	return {
		"newDoubloons": new_d, "newChips": new_chips,
		"dailyBoughtIn": already + amt, "dailyCap": cap,
		"dailyRemaining": maxf(0.0, cap - (already + amt)),
		"sessionBuyIns": new_sbi,
	}


static func cash_out(db: CaptainStore, uid: String) -> Dictionary:
	db.me(uid)
	if _den(db).get("hand") != null:
		return { "error": "Finish your blackjack hand first" }
	var prof: Dictionary = db.me(uid)
	var chips: float = Js.num(prof.get("casino_chips"))
	if chips <= 0.0:
		return { "error": "No chips to cash out" }
	prof["doubloons"] = Js.num(prof.get("doubloons")) + chips
	prof["casino_chips"] = 0.0
	db.update_profile(uid, { "casino_session_buy_ins": 0.0, "blackjack_session_net": 0.0, "roulette_session_net": 0.0, "slots_session_net": 0.0 })
	db.ledger(uid, chips, "Casino: cash-out %s ⟡" % JsJson.number(chips))
	return { "newDoubloons": prof["doubloons"], "cashedOut": chips }


# ── Fish Slots ─────────────────────────────────────────────────────────────────

static func _weighted(key: String) -> String:
	var syms: Array = c()["symbols"]
	var total: float = 0.0
	for s: Dictionary in syms:
		total += float(s[key])
	var r: float = Dice.next() * total
	for s: Dictionary in syms:
		r -= float(s[key])
		if r <= 0.0:
			return s["id"]
	return (syms[syms.size() - 1] as Dictionary)["id"]


static func _pay(id: String) -> float:
	return Js.num((c()["payouts"] as Dictionary).get(id))


static func _pair_pay(id: String) -> float:
	return Js.num((c()["pairPayouts"] as Dictionary).get(id))


static func eval_bonus_line(rs: Array) -> Dictionary:
	var wilds: int = rs.count("wild")
	var opts: Array = []
	for s: String in ["common", "rare", "shark", "legendary"]:
		if rs.count(s) + wilds == 3:
			opts.append({ "symbol": s, "kind": "triple", "mult": _pay(s) })
	if rs.count("legendary") + wilds >= 2 and _pair_pay("legendary") != 0.0:
		opts.append({ "symbol": "legendary", "kind": "pair", "mult": _pair_pay("legendary") })
	if rs.count("shark") + wilds >= 2 and _pair_pay("shark") != 0.0:
		opts.append({ "symbol": "shark", "kind": "pair", "mult": _pair_pay("shark") })
	if rs.count("catfish") >= 2 and _pair_pay("catfish") != 0.0:
		opts.append({ "symbol": "catfish", "kind": "pair", "mult": _pair_pay("catfish") })
	if rs.count("rare") + wilds >= 2 and _pair_pay("rare") != 0.0:
		opts.append({ "symbol": "rare", "kind": "pair", "mult": _pair_pay("rare") })
	if opts.is_empty():
		return {}
	var best: Dictionary = opts[0]
	for o: Dictionary in opts:
		if float(o["mult"]) > float(best["mult"]):
			best = o
	return best


static func pair_symbol(rs: Array) -> String:
	var x: String = rs[0]
	var y: String = rs[1]
	var z: String = rs[2]
	if x == y and y == z:
		return ""
	if x == y and x != "anchor":
		return x
	if x == z and x != "anchor":
		return x
	if y == z and y != "anchor":
		return y
	return ""


const FORCEABLE: Array = ["common", "rare", "legendary", "catfish", "anchor"]


static func roll_slots(wager: float, forced: Variant, is_admin: bool) -> Dictionary:
	var is_forced: bool = forced != null and FORCEABLE.has(forced)
	var reels: Array = [forced, forced, forced] if is_forced else [_weighted("weight"), _weighted("weight"), _weighted("weight")]
	var a: String = reels[0]
	var all_same: bool = reels[0] == reels[1] and reels[1] == reels[2]
	var hooks: int = reels.count("anchor")
	if all_same and a == "anchor":
		var br: Array = [_weighted("bonusWeight"), _weighted("bonusWeight"), _weighted("bonusWeight")]
		var cat: bool = br[0] == "catfish" and br[1] == "catfish" and br[2] == "catfish"
		var bonus: Dictionary
		if cat and not is_admin:
			return { "reels": reels, "isForced": is_forced, "outcome": "bonus", "payout": wager, "bonus": { "reels": br, "outcome": "jackpot", "payout": 0.0 }, "jackpot": "bonus" }
		elif cat:
			bonus = { "reels": br, "outcome": "win", "payout": floor(wager * _pay("legendary") * float(c()["bonusMult"])), "matchedSymbol": "catfish" }
		else:
			var line: Dictionary = eval_bonus_line(br)
			if not line.is_empty() and line["kind"] == "triple":
				bonus = { "reels": br, "outcome": "win", "payout": floor(wager * float(line["mult"]) * float(c()["bonusMult"])), "matchedSymbol": line["symbol"] }
			elif not line.is_empty() and line["kind"] == "pair":
				bonus = { "reels": br, "outcome": "pair", "payout": floor(wager * float(line["mult"]) * float(c()["bonusMult"])), "matchedSymbol": line["symbol"] }
			else:
				bonus = { "reels": br, "outcome": "lose", "payout": 0.0 }
		return { "reels": reels, "isForced": is_forced, "outcome": "bonus", "payout": wager + float(bonus["payout"]), "bonus": bonus, "jackpot": null }
	if all_same and a == "catfish" and not is_admin:
		return { "reels": reels, "isForced": is_forced, "outcome": "jackpot", "payout": 0.0, "jackpot": "main" }
	if all_same and a == "catfish":
		return { "reels": reels, "isForced": is_forced, "outcome": "win", "payout": wager * _pay("legendary"), "jackpot": null }
	if all_same:
		return { "reels": reels, "isForced": is_forced, "outcome": "win", "payout": wager * _pay(a), "jackpot": null }
	if hooks == 2:
		return { "reels": reels, "isForced": is_forced, "outcome": "refund", "payout": wager, "jackpot": null }
	var pair: String = pair_symbol(reels)
	if pair != "" and _pair_pay(pair) != 0.0:
		return { "reels": reels, "isForced": is_forced, "outcome": "pair_win", "matchedSymbol": pair, "payout": floor(wager * _pair_pay(pair)), "jackpot": null }
	if pair == "common":
		return { "reels": reels, "isForced": is_forced, "outcome": "near_miss", "matchedSymbol": pair, "payout": 0.0, "jackpot": null }
	return { "reels": reels, "isForced": is_forced, "outcome": "lose", "payout": 0.0, "jackpot": null }


## The Catfish Jackpot as a fixed multiple of the bet (the port), or 0 for
## the web's shared pot.
static func fixed_jackpot() -> float:
	return Js.num(c().get("fixedJackpot"))


static func slot_stats(db: CaptainStore, uid: String) -> Dictionary:
	db.me(uid)
	var s: Dictionary = _den(db)["slots"]
	return { "spins": Js.num(s.get("spins")), "net": Js.num(s.get("net")), "biggestWin": Js.num(s.get("biggest_win")) }


static func jackpot_state(db: CaptainStore) -> Dictionary:
	var p: Dictionary = _den(db)["pot"]
	return { "pot": p.get("pot", 15000.0), "lastWinnerName": p.get("last_winner_name"), "lastWinAmount": p.get("last_win_amount"), "lastWonAt": p.get("last_won_at") }


static func spin_slots(db: CaptainStore, uid: String, wager: Variant) -> Dictionary:
	if not _is_int(wager) or float(wager) < float(c()["slotsMin"]) or float(wager) > float(c()["slotsMax"]):
		return { "error": "Invalid wager" }
	var w: float = float(wager)
	var p: Dictionary = db.profile(uid, "casino_chips, casino_session_buy_ins, slots_session_net, username, is_admin, slots_force_next")
	if p.is_empty():
		return { "error": "Profile not found" }
	var after_stake: Variant = db.spend(uid, "casino_chips", w)
	if after_stake == null:
		return { "error": "Not enough chips" }
	var is_admin: bool = p.get("is_admin") == true
	var roll: Dictionary = roll_slots(w, p.get("slots_force_next"), is_admin)
	var den: Dictionary = _den(db)
	var pot_row: Dictionary = den["pot"]
	var fixed: float = fixed_jackpot()
	if fixed <= 0.0:
		pot_row["pot"] = float(pot_row["pot"]) + maxf(0.0, float(int(ceil(w * float(c()["feedPct"])))))
	var pot: float = float(pot_row["pot"])
	var winner: String = str(p.get("username")) if p.get("username") != null else "A sailor"
	var claim: Callable = func() -> float:
		if fixed > 0.0:
			return w * fixed
		var max_bet: float = float(c()["slotsMax"])
		var share: float = floor(float(pot_row["pot"]) * minf(maxf(w, 0.0), max_bet) / max_bet)
		pot_row["pot"] = maxf(float(pot_row["seed"]), float(pot_row["pot"]) - share)
		pot_row["last_win_amount"] = share
		pot_row["last_winner_name"] = winner
		pot_row["last_won_at"] = _now_iso()
		return share
	var outcome: String = roll["outcome"]
	var payout: float = float(roll["payout"])
	var bonus: Variant = roll.get("bonus")
	var jackpot_win: Variant = null
	if roll["jackpot"] != null:
		var share: float = claim.call()
		# (A lambda cannot write the outer pot: read it back.)
		pot = float(pot_row["pot"])
		jackpot_win = share
		if roll["jackpot"] == "main":
			payout = share
		else:
			bonus = (bonus as Dictionary).duplicate()
			bonus["payout"] = share
			payout = w + share
	var net: float = payout - w
	var new_chips: float = db.grant(uid, "casino_chips", payout) if payout > 0.0 else float(after_stake)
	var ar: Dictionary = after_round(new_chips, Js.num(p.get("slots_session_net")), net, Js.num(p.get("casino_session_buy_ins")))
	var patch: Dictionary = { "slots_session_net": ar["sessionNet"] }
	if roll["isForced"]:
		patch["slots_force_next"] = null
	if ar["busted"]:
		patch["casino_session_buy_ins"] = 0.0
		patch["blackjack_session_net"] = 0.0
		patch["roulette_session_net"] = 0.0
	db.update_profile(uid, patch)
	var st: Dictionary = den["slots"]
	den["slots"] = { "spins": Js.num(st.get("spins")) + 1.0, "net": Js.num(st.get("net")) + net, "biggest_win": maxf(Js.num(st.get("biggest_win")), net) }
	if jackpot_win != null and float(jackpot_win) > 0.0:
		db.grant_badge(uid, "catfish_jackpot")
	var out: Dictionary = { "reels": roll["reels"], "outcome": outcome, "payout": payout, "net": net, "newChips": new_chips, "sessionNet": ar["sessionNet"], "sessionBuyIns": ar["sessionBuyIns"], "pot": pot }
	if roll.has("matchedSymbol"):
		out["matchedSymbol"] = roll["matchedSymbol"]
	if jackpot_win != null:
		out["jackpotWin"] = jackpot_win
	if bonus != null:
		out["bonus"] = bonus
	return out


# ── Fish Roulette ──────────────────────────────────────────────────────────────

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
	if not _is_int(amt) or float(amt) < lo or float(amt) > hi:
		return "Each bet must be %s–%s chips" % [JsJson.number(lo), JsJson.number(hi)]
	var t: Variant = bet.get("target")
	match bet.get("type"):
		"straight":
			if not _is_int(t) or float(t) < 0 or float(t) > 36:
				return "Invalid number"
			return ""
		"split":
			if not (t is Array) or (t as Array).size() != 2:
				return "Invalid split"
			if not (_num(t[0]) and _num(t[1])) or not split_adjacent(float(t[0]), float(t[1])):
				return "Numbers not adjacent for split"
			return ""
		"street":
			if not _is_int(t) or float(t) < 1 or float(t) > 12:
				return "Invalid street"
			return ""
		"corner":
			if not (t is Array) or not valid_corner(t):
				return "Invalid corner"
			return ""
		"line":
			if not _is_int(t) or float(t) < 1 or float(t) > 11:
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
		var hi: float = float(c()["rlMaxStraight"]) if INSIDE.has(bet.get("type")) else float(c()["rlMaxOutside"])
		var err: String = validate_bet(bet, float(c()["rlMin"]), hi)
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
	var today: float = _bought_today(db, uid)
	var recent: Array = []
	var rows: Array = (_den(db)["rouletteSpins"] as Array).duplicate()
	rows.reverse()
	for r: Dictionary in rows.slice(0, 20):
		recent.append({ "id": r["id"], "winningNumber": r["winning_number"], "net": r["net_chips"], "totalWagered": r["total_wagered"], "createdAt": r["created_at"] })
	var cap: float = cap_for(p)
	return {
		"chips": Js.num(p.get("casino_chips")), "doubloons": Js.num(p.get("doubloons")),
		"sessionBuyIns": Js.num(p.get("casino_session_buy_ins")), "sessionNet": Js.num(p.get("roulette_session_net")),
		"dailyBoughtIn": today, "dailyCap": cap, "dailyRemaining": maxf(0.0, cap - today),
		"recentSpins": recent,
	}


## A game's Fishing level (port rules levelGates.feature; nothing under
## parity).
static func gate(db: CaptainStore, uid: String, key: String) -> String:
	return Rules.gate_block("feature", key, Js.num(db.profile(uid, "fishing_xp").get("fishing_xp")))


## `at`: the number the wheel already landed on (a Charter's shared table
## spins once for everyone), or -1 to roll it here.
static func spin_roulette(db: CaptainStore, uid: String, bets: Variant, at: int = -1) -> Dictionary:
	var gb: String = gate(db, uid, "den_roulette")
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
	var mult: Dictionary = c()["payoutMult"]
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
	var ar: Dictionary = after_round(after, Js.num(p.get("roulette_session_net")), net, Js.num(p.get("casino_session_buy_ins")))
	var patch: Dictionary = { "roulette_session_net": ar["sessionNet"] }
	if ar["busted"]:
		patch["casino_session_buy_ins"] = 0.0
		patch["blackjack_session_net"] = 0.0
		patch["slots_session_net"] = 0.0
	db.update_profile(uid, patch)
	var den: Dictionary = _den(db)
	var row: Dictionary = { "id": db.next_id(), "bets": bets, "winning_number": n, "total_wagered": wagered, "total_payout": paid,
		"net_chips": net, "chips_before": before, "chips_after": after, "created_at": _now_iso() }
	var spins: Array = (den["rouletteSpins"] as Array) + [row]
	den["rouletteSpins"] = spins.slice(maxi(0, spins.size() - int(c()["keepRoulette"])))
	if per.any(func(pb: Dictionary) -> bool: return pb["won"] and (pb["bet"] as Dictionary)["type"] == "straight"):
		db.grant_badge(uid, "called_it")
	return {
		"winningNumber": n, "totalWagered": wagered, "totalPayout": paid, "net": net,
		"chipsBefore": before, "chipsAfter": after, "perBet": per,
		"doubloons": Js.num(p.get("doubloons")), "sessionNet": ar["sessionNet"], "sessionBuyIns": ar["sessionBuyIns"],
	}


# ── Blackjack ──────────────────────────────────────────────────────────────────

static func rank(card: String) -> String:
	return card.left(1)


static func new_shoe() -> Array:
	var shoe: Array = []
	for d: int in int(c()["deckCount"]):
		for r: String in c()["ranks"]:
			for s: String in c()["suits"]:
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
	var h: Variant = _den(db).get("hand")
	if not (h is Dictionary) or (h as Dictionary).get("state") == null:
		return {}
	return (h as Dictionary).duplicate(true)


static func _save_hand(db: CaptainStore, id: float, st: Dictionary, total: float) -> void:
	var den: Dictionary = _den(db)
	if den.get("hand") is Dictionary and float(den["hand"]["id"]) == id:
		var h: Dictionary = (den["hand"] as Dictionary).duplicate()
		h["state"] = st.duplicate(true)
		h["total_wagered"] = total
		den["hand"] = h


static func _finalize(db: CaptainStore, uid: String, id: float, st: Dictionary, total: float) -> Variant:
	var t: Dictionary = _settle_table(st, total)
	var den: Dictionary = _den(db)
	if not (den.get("hand") is Dictionary) or float(den["hand"]["id"]) != id:
		return null
	den["hand"] = null
	var new_chips: float = db.grant(uid, "casino_chips", t["totalReturned"]) if float(t["totalReturned"]) > 0.0 else Js.num(db.profile(uid, "casino_chips").get("casino_chips"))
	var p: Dictionary = db.profile(uid, "doubloons, casino_session_buy_ins, blackjack_session_net, blackjack_win_streak, blackjack_dealer_bj_streak")
	var ar: Dictionary = after_round(new_chips, Js.num(p.get("blackjack_session_net")), t["netDelta"], Js.num(p.get("casino_session_buy_ins")))
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
		"dailyCap": _cap(db, uid), "dailyWagered": _bought_today(db, uid),
		"sessionBuyIns": ar["sessionBuyIns"], "sessionNet": ar["sessionNet"],
	}


static func _settled_or_error(r: Variant) -> Dictionary:
	return { "kind": "settled", "result": r } if r != null else { "error": "Hand already settled" }


static func _active(db: CaptainStore, uid: String, id: float, st: Dictionary, total: float, chips: Variant = null) -> Dictionary:
	var p: Dictionary = db.profile(uid, "casino_chips, doubloons, casino_session_buy_ins, blackjack_session_net")
	var already: float = _bought_today(db, uid)
	var cap: float = _cap(db, uid)
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
	var gb: String = gate(db, uid, "den_blackjack")
	if gb != "":
		return { "error": gb }
	if not _is_int(wager) or float(wager) < float(c()["bjMin"]) or float(wager) > float(c()["bjMax"]):
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
	_den(db)["hand"] = { "id": id, "state": st.duplicate(true), "initial_wager": w, "total_wagered": w }
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
