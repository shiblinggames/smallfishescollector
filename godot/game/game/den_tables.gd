class_name DenTables
extends Node
## THE DEN'S SHARED TABLES (Kong, 2026-10-03: "if you're playing in a
## Charter, anyone in it should be able to join in on roulette and blackjack;
## quick and easy and fun to play with friends").
##
## One roulette wheel and one blackjack table per Charter, run on the
## founder's game like every other action (a table action is `denTable`,
## caught by Charter.run). After every change the table is sent to everyone
## aboard, so every screen turns the same wheel and deals the same cards. Chips
## stay each captain's own; a table only moves a captain's chips through the
## Den's own rules (core/casino.gd).
##
## ROULETTE: anyone sits down by opening it. Bets go down on one board (each
## captain's chips in their own colour); a 20-second countdown starts with the
## first ready, and the wheel spins when everyone at it is ready or the time
## runs out (anyone with chips down then plays; the rest watch). One number
## settles everyone.
## BLACKJACK: up to four seats, one dealer, one shoe. Each seat picks a bet and
## says ready (15 seconds from the first ready, or at once when all are); the
## cards go round; turns follow the seats, 30 seconds each before a stand is
## taken for you; then the dealer plays and every seat is paid. No insurance
## at the shared table (a dealer's natural is seen at once).

signal changed(game: String, state: Dictionary)

const COLORS: Array = ["#e0a545", "#6fc4b4", "#dd8f79", "#a99be6"]
const RL_BETTING: float = 20.0
const RL_SPUN: float = 7.5
const BJ_BETTING: float = 15.0
const BJ_TURN: float = 30.0
const BJ_RESULT: float = 6.0

## Who in this game is listening (DenRoulette, DenBlackjack): the live one.
static var live: DenTables = null

## On the founder's game: the Charter the tables belong to.
var charter: Charter = null
## The latest of each table, as everyone sees it.
var states: Dictionary = {}
var _rl: Dictionary = _fresh_rl()
var _bj: Dictionary = _fresh_bj()
var _push_t: float = 0.0


static func _fresh_rl() -> Dictionary:
	return { "round": 0, "phase": "betting", "left": -1.0, "seats": {}, "result": {} }


static func _fresh_bj() -> Dictionary:
	return { "round": 0, "phase": "betting", "left": -1.0, "seats": {}, "order": [], "turn": "", "hand": 0, "dealer": [], "shoe": [] }


## The Charter is left (CrewNet): both tables cleared, so a countdown from the
## old Charter neither runs on nor reaches the next one.
func reset() -> void:
	charter = null
	states.clear()
	_rl = _fresh_rl()
	_bj = _fresh_bj()
	_push_t = 0.0


func _ready() -> void:
	name = "DenTables"
	live = self


func hosting() -> bool:
	return charter != null


# ── The founder's side ─────────────────────────────────────────────────────────

## One table action from a captain: [game, action, payload].
func handle(key: String, s: Session, args: Array) -> Dictionary:
	var game: String = str(args[0]) if args.size() > 0 else ""
	var action: String = str(args[1]) if args.size() > 1 else ""
	var payload: Variant = args[2] if args.size() > 2 else null
	var r: Dictionary
	if game == "roulette":
		r = _rl_handle(key, s, action, payload)
	elif game == "blackjack":
		r = _bj_handle(key, s, action, payload)
	else:
		r = { "error": "There is no such table." }
	return r


## A captain whose game dropped off the line: up from both tables, as if they
## had stood (a blackjack hand of theirs stands as it is). Without this the
## wheel waited on them and the blackjack turn hung on them.
func drop(key: String) -> void:
	if _rl["seats"].has(key):
		_rl_handle(key, null, "leave", null)
	if _bj["seats"].has(key):
		_bj_handle(key, null, "leave", null)


func _seat_color(table: Dictionary, key: String) -> String:
	var used: Array = []
	for k: String in table["seats"]:
		if k != key:
			used.append(table["seats"][k]["color"])
	for c: String in COLORS:
		if not used.has(c):
			return c
	return COLORS[0]


func _process(delta: float) -> void:
	if not hosting():
		return
	for t: Dictionary in [_rl, _bj]:
		if float(t["left"]) > 0.0:
			t["left"] = float(t["left"]) - delta
			if float(t["left"]) <= 0.0:
				t["left"] = -1.0
				if t == _rl:
					_rl_timeout()
				else:
					_bj_timeout()
	# The countdowns, once a second, so a late joiner sees the right time.
	_push_t += delta
	if _push_t >= 1.0:
		_push_t = 0.0
		if float(_rl["left"]) > 0.0:
			_push("roulette")
		if float(_bj["left"]) > 0.0:
			_push("blackjack")


## Send a table to everyone (and to this game's own screens).
func _push(game: String) -> void:
	var pub: Dictionary = _public(game)
	# With no line open, an rpc fails (and skips the local call): this game's
	# own screens are told directly, as the other tables do.
	if multiplayer.multiplayer_peer != null and not multiplayer.get_peers().is_empty():
		_state.rpc(game, pub)
	else:
		_state(game, pub)


@rpc("authority", "call_local", "reliable")
func _state(game: String, pub: Dictionary) -> void:
	states[game] = pub
	changed.emit(game, pub)


func _public(game: String) -> Dictionary:
	if game == "roulette":
		return _rl.duplicate(true)
	var p: Dictionary = _bj.duplicate(true)
	p.erase("shoe")
	# The hole card stays face down until the dealer plays.
	if p["phase"] == "playing" and (p["dealer"] as Array).size() >= 2:
		p["dealer"] = [p["dealer"][0], "X"]
		p["dealerTotal"] = null
	else:
		p["dealerTotal"] = Casino.hand_value(p["dealer"])["total"] if not (p["dealer"] as Array).is_empty() else null
	return p


## After chips move: the captains' saves to their games, and the file.
func _settle_saves() -> void:
	if charter == null:
		return
	charter._spread("")
	charter.write()


func _session(key: String) -> Session:
	return charter.session_for(key) if charter != null else null


# ── Roulette ───────────────────────────────────────────────────────────────────

func _rl_handle(key: String, s: Session, action: String, payload: Variant) -> Dictionary:
	var seats: Dictionary = _rl["seats"]
	match action:
		"sit":
			if not seats.has(key):
				seats[key] = { "name": s.captain_name(), "color": _seat_color(_rl, key), "bets": [], "ready": false }
			_push("roulette")
			return { "ok": true }
		"leave":
			seats.erase(key)
			_rl_maybe_spin()
			_push("roulette")
			return { "ok": true }
		"bets":
			if _rl["phase"] != "betting":
				return { "error": "The wheel is turning. Next spin." }
			if not seats.has(key):
				return { "error": "Sit down at the wheel first." }
			var p: Dictionary = payload if payload is Dictionary else {}
			var bets: Array = Js.list(p.get("bets"))
			if not bets.is_empty():
				var err: String = Casino.slip_refusal(bets)
				if err != "":
					return { "error": err }
				var total: float = 0.0
				for b: Dictionary in bets:
					total += float(b["amount"])
				if Js.num(s.profile().get("casino_chips")) < total:
					return { "error": "Not enough chips" }
			seats[key]["bets"] = bets
			seats[key]["ready"] = p.get("ready", false) == true and not bets.is_empty()
			if seats[key]["ready"] and float(_rl["left"]) <= 0.0:
				_rl["left"] = RL_BETTING
			_rl_maybe_spin()
			_push("roulette")
			return { "ok": true }
	return { "error": "Not at this table." }


func _rl_maybe_spin() -> void:
	if _rl["phase"] != "betting":
		return
	# Everyone at the wheel ready (with chips down), or the countdown.
	var any: bool = false
	for k: String in _rl["seats"]:
		var st: Dictionary = _rl["seats"][k]
		if not st["ready"]:
			return
		any = true
	if any:
		_rl_spin()


func _rl_timeout() -> void:
	if _rl["phase"] == "betting":
		_rl_spin()
	elif _rl["phase"] == "spun":
		_rl["phase"] = "betting"
		for k: String in _rl["seats"]:
			_rl["seats"][k]["bets"] = []
			_rl["seats"][k]["ready"] = false
		_push("roulette")


func _rl_spin() -> void:
	var anyone: bool = false
	for k: String in _rl["seats"]:
		if not (_rl["seats"][k]["bets"] as Array).is_empty():
			anyone = true
	if not anyone:
		_rl["left"] = -1.0
		return
	var n: int = int(floor(Dice.next() * 37.0))
	var by: Dictionary = {}
	for k: String in _rl["seats"]:
		var st: Dictionary = _rl["seats"][k]
		if (st["bets"] as Array).is_empty():
			continue
		var s: Session = _session(k)
		if s == null:
			continue
		var r: Dictionary = Casino.spin_roulette(s.store, s.uid, st["bets"], n)
		if r.has("error"):
			by[k] = { "error": r["error"] }
			continue
		var won: Array = []
		for pb: Dictionary in r["perBet"]:
			if pb["won"]:
				won.append("%s|%s" % [pb["bet"]["type"], JsJson.stringify(pb["bet"]["target"])])
		by[k] = { "net": r["net"], "payout": r["totalPayout"], "chipsAfter": r["chipsAfter"], "won": won }
	_rl["round"] = int(_rl["round"]) + 1
	_rl["phase"] = "spun"
	_rl["left"] = RL_SPUN
	_rl["result"] = { "round": _rl["round"], "n": n, "by": by }
	_settle_saves()
	_push("roulette")


# ── Blackjack ──────────────────────────────────────────────────────────────────

func _bj_handle(key: String, s: Session, action: String, payload: Variant) -> Dictionary:
	var seats: Dictionary = _bj["seats"]
	match action:
		"sit":
			if not seats.has(key):
				if seats.size() >= 4:
					return { "error": "The table is full." }
				seats[key] = { "name": s.captain_name(), "color": _seat_color(_bj, key), "wager": 25.0, "ready": false, "playing": false, "hands": [], "outcomes": [], "net": 0.0 }
				(_bj["order"] as Array).append(key)
			_push("blackjack")
			return { "ok": true }
		"leave":
			if seats.has(key):
				if _bj["phase"] == "playing" and seats[key]["playing"]:
					for h: Dictionary in seats[key]["hands"]:
						h["stood"] = true
					seats[key]["gone"] = true
					if _bj["turn"] == key:
						_bj_advance()
				else:
					seats.erase(key)
					(_bj["order"] as Array).erase(key)
			_bj_maybe_deal()
			_push("blackjack")
			return { "ok": true }
		"ready":
			if _bj["phase"] != "betting":
				return { "error": "A hand is being played. Next one." }
			if not seats.has(key):
				return { "error": "Take a seat first." }
			var w: float = Js.num(payload)
			if w != floor(w) or w < float(Casino.c()["bjMin"]) or w > float(Casino.c()["bjMax"]):
				return { "error": "Invalid wager" }
			if Js.num(s.profile().get("casino_chips")) < w:
				return { "error": "Not enough chips" }
			seats[key]["wager"] = w
			seats[key]["ready"] = true
			if float(_bj["left"]) <= 0.0:
				_bj["left"] = BJ_BETTING
			_bj_maybe_deal()
			_push("blackjack")
			return { "ok": true }
		"hit", "stand", "double", "split":
			if _bj["phase"] != "playing" or _bj["turn"] != key:
				return { "error": "Not your turn" }
			var r: String = _bj_move(key, s, action)
			if r != "":
				return { "error": r }
			_push("blackjack")
			return { "ok": true }
	return { "error": "Not at this table." }


func _bj_maybe_deal() -> void:
	if _bj["phase"] != "betting":
		return
	var any: bool = false
	for k: String in _bj["seats"]:
		if _bj["seats"][k].get("gone", false):
			continue
		if not _bj["seats"][k]["ready"]:
			return
		any = true
	if any:
		_bj_deal()


func _bj_timeout() -> void:
	match _bj["phase"]:
		"betting":
			_bj_deal()
		"playing":
			# Time's up on this turn: a stand is taken for them.
			var key: String = _bj["turn"]
			if key != "":
				var h: Dictionary = _bj["seats"][key]["hands"][int(_bj["hand"])]
				h["stood"] = true
				_bj_advance()
				_push("blackjack")
		"result":
			_bj["phase"] = "betting"
			_bj["dealer"] = []
			for k: String in _bj["seats"].keys():
				var st: Dictionary = _bj["seats"][k]
				if st.get("gone", false):
					_bj["seats"].erase(k)
					(_bj["order"] as Array).erase(k)
					continue
				st["ready"] = false
				st["playing"] = false
				st["hands"] = []
				st["outcomes"] = []
				st["net"] = 0.0
			_push("blackjack")


func _bj_deal() -> void:
	var players: Array = []
	for k: String in _bj["order"]:
		var st: Dictionary = _bj["seats"][k]
		if not st["ready"] or st.get("gone", false):
			continue
		var s: Session = _session(k)
		if s == null or s.store.spend(s.uid, "casino_chips", float(st["wager"])) == null:
			continue
		st["playing"] = true
		st["hands"] = [{ "cards": [], "wager": float(st["wager"]), "doubled": false, "stood": false, "busted": false, "isNatural": false, "isSplit": false }]
		players.append(k)
	if players.is_empty():
		_bj["left"] = -1.0
		_push("blackjack")
		return
	var shoe: Array = Casino.new_shoe()
	_bj["shoe"] = shoe
	_bj["dealer"] = []
	for round: int in 2:
		for k: String in players:
			(_bj["seats"][k]["hands"][0]["cards"] as Array).append(Casino.draw(shoe))
		(_bj["dealer"] as Array).append(Casino.draw(shoe))
	for k: String in players:
		var h: Dictionary = _bj["seats"][k]["hands"][0]
		if Casino.is_natural(h["cards"]):
			h["isNatural"] = true
			h["stood"] = true
	_bj["round"] = int(_bj["round"]) + 1
	_bj["phase"] = "playing"
	_settle_saves()
	if Casino.is_natural(_bj["dealer"]):
		_bj_finish()
		return
	_bj["turn"] = ""
	_bj["hand"] = 0
	_bj_advance()
	_push("blackjack")


## The next hand that still has a move, in seat order; none left, the dealer.
func _bj_advance() -> void:
	var order: Array = _bj["order"]
	var start: int = order.find(_bj["turn"]) if _bj["turn"] != "" else 0
	for i: int in range(maxi(0, start), order.size()):
		var k: String = order[i]
		var st: Dictionary = _bj["seats"][k]
		if not st["playing"]:
			continue
		var hands: Array = st["hands"]
		for hi: int in hands.size():
			var h: Dictionary = hands[hi]
			if not h["stood"] and not h["busted"]:
				_bj["turn"] = k
				_bj["hand"] = hi
				_bj["left"] = BJ_TURN
				return
	_bj_finish()


func _bj_move(key: String, s: Session, action: String) -> String:
	var st: Dictionary = _bj["seats"][key]
	var h: Dictionary = st["hands"][int(_bj["hand"])]
	var shoe: Array = _bj["shoe"]
	match action:
		"hit":
			(h["cards"] as Array).append(Casino.draw(shoe))
			var t: float = float(Casino.hand_value(h["cards"])["total"])
			if t > 21.0:
				h["busted"] = true
			elif t == 21.0:
				h["stood"] = true
		"stand":
			h["stood"] = true
		"double":
			if (h["cards"] as Array).size() != 2:
				return "Can only double on initial two cards"
			if h["isSplit"]:
				return "No double after split (house rule)"
			if s.store.spend(s.uid, "casino_chips", float(h["wager"])) == null:
				return "Not enough chips to double"
			h["wager"] = float(h["wager"]) * 2.0
			h["doubled"] = true
			(h["cards"] as Array).append(Casino.draw(shoe))
			if float(Casino.hand_value(h["cards"])["total"]) > 21.0:
				h["busted"] = true
			h["stood"] = true
		"split":
			if (st["hands"] as Array).size() != 1 or not Casino.can_split(h["cards"]):
				return "Cannot split"
			if s.store.spend(s.uid, "casino_chips", float(h["wager"])) == null:
				return "Not enough chips to split"
			var c1: String = h["cards"][0]
			var c2: String = h["cards"][1]
			var aces: bool = Casino.rank(c1) == "A"
			st["hands"] = [
				{ "cards": [c1, Casino.draw(shoe)], "wager": h["wager"], "doubled": false, "stood": aces, "busted": false, "isNatural": false, "isSplit": true },
				{ "cards": [c2, Casino.draw(shoe)], "wager": h["wager"], "doubled": false, "stood": aces, "busted": false, "isNatural": false, "isSplit": true },
			]
			_bj["hand"] = 0
	_settle_saves()
	var cur: Dictionary = st["hands"][int(_bj["hand"])]
	if cur["stood"] or cur["busted"]:
		_bj_advance()
	else:
		_bj["left"] = BJ_TURN
	return ""


## The dealer plays, and every seat is paid.
func _bj_finish() -> void:
	_bj["turn"] = ""
	_bj["dealer"] = Casino.dealer_play(_bj["shoe"], _bj["dealer"])
	var df: Array = _bj["dealer"]
	var dt: float = float(Casino.hand_value(df)["total"])
	var dealer: Dictionary = { "cards": df, "total": dt, "bust": dt > 21.0, "natural": Casino.is_natural(df) }
	for k: String in _bj["order"]:
		var st: Dictionary = _bj["seats"][k]
		if not st["playing"]:
			continue
		var s: Session = _session(k)
		var paid: float = 0.0
		var staked: float = 0.0
		var outs: Array = []
		for h: Dictionary in st["hands"]:
			var res: Dictionary = Casino._settle_hand(h, dealer)
			paid += float(res["payout"])
			staked += float(h["wager"])
			outs.append({ "outcome": res["outcome"], "net": res["net"], "total": res["total"] })
		st["outcomes"] = outs
		st["net"] = paid - staked
		if s != null:
			var chips: float = s.store.grant(s.uid, "casino_chips", paid) if paid > 0.0 else Js.num(s.profile().get("casino_chips"))
			var p: Dictionary = s.store.profile(s.uid, "casino_session_buy_ins, blackjack_session_net")
			var ar: Dictionary = Casino.after_round(chips, Js.num(p.get("blackjack_session_net")), paid - staked, Js.num(p.get("casino_session_buy_ins")))
			var patch: Dictionary = { "casino_session_buy_ins": ar["sessionBuyIns"], "blackjack_session_net": ar["sessionNet"] }
			if ar["busted"]:
				patch["roulette_session_net"] = 0.0
				patch["slots_session_net"] = 0.0
			s.store.update_profile(s.uid, patch)
	_bj["phase"] = "result"
	_bj["left"] = BJ_RESULT
	_settle_saves()
	_push("blackjack")


# ── Either side ────────────────────────────────────────────────────────────────

## This game's own captain's key at the tables.
func my_key() -> String:
	var n: Node = get_parent()
	return str(n.get("key")) if n != null and n.get("key") != null else ""


## Is this captain playing in a Charter (so the tables are shared)?
static func shared_for(s: Session) -> bool:
	return live != null and (s.charter != null or s.remote != null)
