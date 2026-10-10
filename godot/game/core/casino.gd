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
##
## The three games live in parts beside this file (split 2026-10-10 for
## size): casino_slots.gd, casino_roulette.gd and casino_blackjack.gd. This
## file keeps the purse, the Den's save, the shared helpers and a forwarder
## for each game call made from outside.

const CasinoSlots = preload("res://core/casino_slots.gd")
const CasinoRoulette = preload("res://core/casino_roulette.gd")
const CasinoBlackjack = preload("res://core/casino_blackjack.gd")

const INSIDE: Array = CasinoRoulette.INSIDE


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


## A game's Fishing level (port rules levelGates.feature; nothing under
## parity).
static func gate(db: CaptainStore, uid: String, key: String) -> String:
	return Rules.gate_block("feature", key, Js.num(db.profile(uid, "fishing_xp").get("fishing_xp")))


# ── Fish Slots (forwarders; casino_slots.gd) ───────────────────────────────────

## The Catfish Jackpot as a fixed multiple of the bet (the port), or 0 for
## the web's shared pot.
static func fixed_jackpot() -> float:
	return CasinoSlots.fixed_jackpot()


static func slot_stats(db: CaptainStore, uid: String) -> Dictionary:
	return CasinoSlots.slot_stats(db, uid)


static func jackpot_state(db: CaptainStore) -> Dictionary:
	return CasinoSlots.jackpot_state(db)


static func spin_slots(db: CaptainStore, uid: String, wager: Variant) -> Dictionary:
	return CasinoSlots.spin_slots(db, uid, wager)


# ── Fish Roulette (forwarders; casino_roulette.gd) ─────────────────────────────

static func color_of(n: float) -> String:
	return CasinoRoulette.color_of(n)


static func is_winner(bet: Dictionary, n: float) -> bool:
	return CasinoRoulette.is_winner(bet, n)


static func slip_refusal(bets: Variant) -> String:
	return CasinoRoulette.slip_refusal(bets)


static func roulette_state(db: CaptainStore, uid: String) -> Dictionary:
	return CasinoRoulette.roulette_state(db, uid)


## `at`: the number the wheel already landed on (a Charter's shared table
## spins once for everyone), or -1 to roll it here.
static func spin_roulette(db: CaptainStore, uid: String, bets: Variant, at: int = -1) -> Dictionary:
	return CasinoRoulette.spin_roulette(db, uid, bets, at)


# ── Blackjack (forwarders; casino_blackjack.gd) ────────────────────────────────

static func rank(card: String) -> String:
	return CasinoBlackjack.rank(card)


static func new_shoe() -> Array:
	return CasinoBlackjack.new_shoe()


static func draw(shoe: Array) -> String:
	return CasinoBlackjack.draw(shoe)


static func hand_value(cards: Array) -> Dictionary:
	return CasinoBlackjack.hand_value(cards)


static func is_natural(cards: Array) -> bool:
	return CasinoBlackjack.is_natural(cards)


static func can_split(cards: Array) -> bool:
	return CasinoBlackjack.can_split(cards)


static func dealer_play(shoe: Array, dealer: Array) -> Array:
	return CasinoBlackjack.dealer_play(shoe, dealer)


static func _settle_hand(h: Dictionary, dealer: Dictionary) -> Dictionary:
	return CasinoBlackjack._settle_hand(h, dealer)


static func deal(db: CaptainStore, uid: String, wager: Variant) -> Dictionary:
	return CasinoBlackjack.deal(db, uid, wager)


static func insurance(db: CaptainStore, uid: String, take: bool) -> Dictionary:
	return CasinoBlackjack.insurance(db, uid, take)


## A hit, stand, double or split (RulesApi dispatches the four here).
static func _move(db: CaptainStore, uid: String, op: String) -> Dictionary:
	return CasinoBlackjack._move(db, uid, op)


static func resume(db: CaptainStore, uid: String) -> Variant:
	return CasinoBlackjack.resume(db, uid)
