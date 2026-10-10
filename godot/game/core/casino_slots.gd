extends RefCounted
## Part of Casino: Fish Slots (a port of web/lib/casinoRules.ts' slots and
## web/lib/core/casino.ts' spin): the reels, the bonus line, the Catfish
## Jackpot and the spin over the purse. Split out of core/casino.gd on
## 2026-10-10 for size; Casino forwards what the Den and RulesApi call.


static func _weighted(key: String) -> String:
	var syms: Array = Casino.c()["symbols"]
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
	return Js.num((Casino.c()["payouts"] as Dictionary).get(id))


static func _pair_pay(id: String) -> float:
	return Js.num((Casino.c()["pairPayouts"] as Dictionary).get(id))


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
			bonus = { "reels": br, "outcome": "win", "payout": floor(wager * _pay("legendary") * float(Casino.c()["bonusMult"])), "matchedSymbol": "catfish" }
		else:
			var line: Dictionary = eval_bonus_line(br)
			if not line.is_empty() and line["kind"] == "triple":
				bonus = { "reels": br, "outcome": "win", "payout": floor(wager * float(line["mult"]) * float(Casino.c()["bonusMult"])), "matchedSymbol": line["symbol"] }
			elif not line.is_empty() and line["kind"] == "pair":
				bonus = { "reels": br, "outcome": "pair", "payout": floor(wager * float(line["mult"]) * float(Casino.c()["bonusMult"])), "matchedSymbol": line["symbol"] }
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
	return Js.num(Casino.c().get("fixedJackpot"))


static func slot_stats(db: CaptainStore, uid: String) -> Dictionary:
	db.me(uid)
	var s: Dictionary = Casino._den(db)["slots"]
	return { "spins": Js.num(s.get("spins")), "net": Js.num(s.get("net")), "biggestWin": Js.num(s.get("biggest_win")) }


static func jackpot_state(db: CaptainStore) -> Dictionary:
	var p: Dictionary = Casino._den(db)["pot"]
	return { "pot": p.get("pot", 15000.0), "lastWinnerName": p.get("last_winner_name"), "lastWinAmount": p.get("last_win_amount"), "lastWonAt": p.get("last_won_at") }


static func spin_slots(db: CaptainStore, uid: String, wager: Variant) -> Dictionary:
	if not Casino._is_int(wager) or float(wager) < float(Casino.c()["slotsMin"]) or float(wager) > float(Casino.c()["slotsMax"]):
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
	var den: Dictionary = Casino._den(db)
	var pot_row: Dictionary = den["pot"]
	var fixed: float = fixed_jackpot()
	if fixed <= 0.0:
		pot_row["pot"] = float(pot_row["pot"]) + maxf(0.0, float(int(ceil(w * float(Casino.c()["feedPct"])))))
	var pot: float = float(pot_row["pot"])
	var winner: String = str(p.get("username")) if p.get("username") != null else "A sailor"
	var claim: Callable = func() -> float:
		if fixed > 0.0:
			return w * fixed
		var max_bet: float = float(Casino.c()["slotsMax"])
		var share: float = floor(float(pot_row["pot"]) * minf(maxf(w, 0.0), max_bet) / max_bet)
		pot_row["pot"] = maxf(float(pot_row["seed"]), float(pot_row["pot"]) - share)
		pot_row["last_win_amount"] = share
		pot_row["last_winner_name"] = winner
		pot_row["last_won_at"] = Casino._now_iso()
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
	var ar: Dictionary = Casino.after_round(new_chips, Js.num(p.get("slots_session_net")), net, Js.num(p.get("casino_session_buy_ins")))
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

