class_name Orders
extends RefCounted
## THE DAY'S ORDERS (Godot port of the daily challenges, lib/core/dailies.ts,
## with the Steam decisions of 2026-09-30 in progression.md): three orders
## that RESET ON COMPLETION, not on the calendar. Claim all three and sweep the
## board, and a new board is dealt at once; nothing expires, nothing is missed.
## Each order pays its doubloons (content/rules.json daily.tiers); the sweep
## pays a fishing crate into the stash in place of the web's 10 gems (no gems
## in the port), rolled as a crate from the deepest water the captain can fish.
## From Fishing 75 the Master order runs on its OWN track beside the board, so
## sweeping the three never takes an unfinished Master away; it pays a crate
## on the web's weights. The picks are Daily's own, hashed off the board's
## number ("board-N", "master-N") where the web hashed the date. Each board is
## dealt for the Fishing level it was dealt at, so levelling mid-board never
## swaps an order out from under its count.
##
## Kept on the profile as "orders": { board, master, level, mlevel, p, claimed,
## mp, mclaimed }. The web's per-date rows stay for the parity run only.

const MASTER_WEIGHTS: Array = [["wooden", 25.0], ["metal", 35.0], ["gold", 28.0], ["diamond", 12.0]]
const WATERS: Array = ["ancient_deep", "abyss", "deep", "open_waters", "shallows"]


static func _o(p: Dictionary) -> Dictionary:
	var o: Dictionary = Js.obj(p.get("orders")).duplicate(true)
	for k: String in ["board", "master"]:
		if not o.has(k):
			o[k] = 0.0
	if not (o.get("p") is Array):
		o["p"] = [0.0, 0.0, 0.0]
	if not (o.get("claimed") is Array):
		o["claimed"] = [false, false, false]
	if not o.has("mp"):
		o["mp"] = 0.0
	if not o.has("mclaimed"):
		o["mclaimed"] = false
	return o


static func _level(p: Dictionary) -> float:
	return float(Rules.level_from_xp(Js.num(p.get("fishing_xp"))))


## The board's three orders (pinned to the level it was dealt at).
static func board(o: Dictionary) -> Array:
	var key: String = "board-%d" % int(o["board"])
	var lvl: float = float(Js.nz(o.get("level"), 1.0))
	var tiers: Array = Rules.data()["daily"]["tiers"]
	return [Daily._pick(key, 1, tiers[0], lvl), Daily._pick(key, 2, tiers[1], lvl), Daily._pick(key, 3, tiers[2], lvl)]


## The Master order, or {} below its level.
static func master(o: Dictionary, level: float) -> Dictionary:
	if level < float(Rules.data()["daily"]["masterMinLevel"]):
		return {}
	var lvl: float = float(Js.nz(o.get("mlevel"), level))
	return Daily._pick("master-%d" % int(o["master"]), 4, (Rules.data()["daily"]["tiers"] as Array)[3], lvl)


## Pin the levels at first touch; returns the orders as stored.
static func _pinned(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var o: Dictionary = _o(p)
	var lvl: float = _level(p)
	var dirty: bool = not p.has("orders")
	if o.get("level") == null:
		o["level"] = lvl
		dirty = true
	if o.get("mlevel") == null and lvl >= float(Rules.data()["daily"]["masterMinLevel"]):
		o["mlevel"] = lvl
		dirty = true
	if dirty:
		db.update_profile(uid, { "orders": o })
	return o


static func state(db: CaptainStore, uid: String) -> Dictionary:
	var o: Dictionary = _pinned(db, uid)
	var lvl: float = _level(db.me(uid))
	var m: Dictionary = master(o, lvl)
	return {
		"board": int(o["board"]) + 1, "orders": board(o), "progress": o["p"], "claimed": o["claimed"],
		"master": m, "masterProgress": o["mp"], "masterClaimed": o["mclaimed"],
		"sweepable": (o["claimed"] as Array).all(func(c: Variant) -> bool: return c == true),
	}


## How many orders are done and waiting to be claimed (the HUD's dot).
static func ready_count(db: CaptainStore, uid: String) -> int:
	var st: Dictionary = state(db, uid)
	var n: int = 0
	for i: int in 3:
		if st["claimed"][i] != true and float(st["progress"][i]) >= float(st["orders"][i]["target"]):
			n += 1
	if not (st["master"] as Dictionary).is_empty() and st["masterClaimed"] != true and float(st["masterProgress"]) >= float(st["master"]["target"]):
		n += 1
	return n + (1 if st["sweepable"] else 0)


## A catch counted against the board and the Master. Returns the labels of
## the orders this catch finished.
static func count(db: CaptainStore, uid: String, habitat: String, rarity: float, sell_value: float, qty: float, perfect: bool) -> Array:
	var o: Dictionary = _pinned(db, uid)
	var done: Array = []
	var orders: Array = board(o)
	for i: int in 3:
		var c: Dictionary = orders[i]
		var was: float = float(o["p"][i])
		o["p"][i] = minf(was + Daily.increment(c, habitat, rarity, sell_value, qty, perfect), float(c["target"]))
		if was < float(c["target"]) and float(o["p"][i]) >= float(c["target"]):
			done.append(c["label"])
	var m: Dictionary = master(o, _level(db.me(uid)))
	if not m.is_empty() and o["mclaimed"] != true:
		var was: float = float(o["mp"])
		o["mp"] = minf(was + Daily.increment(m, habitat, rarity, sell_value, qty, perfect), float(m["target"]))
		if was < float(m["target"]) and float(o["mp"]) >= float(m["target"]):
			done.append(m["label"])
	db.update_profile(uid, { "orders": o })
	return done


## Claim order i (0 to 2) or the Master (3).
static func claim(db: CaptainStore, uid: String, i: int) -> Dictionary:
	var o: Dictionary = _pinned(db, uid)
	var p: Dictionary = db.me(uid)
	if i == 3:
		var m: Dictionary = master(o, _level(p))
		if m.is_empty():
			return { "error": "The Master order opens at Fishing %d." % int(Rules.data()["daily"]["masterMinLevel"]) }
		if float(o["mp"]) < float(m["target"]):
			return { "error": "That order is not done yet." }
		# A new Master order is dealt at once; the crate goes to the stash.
		var tier: String = _weighted(MASTER_WEIGHTS)
		o["master"] = float(o["master"]) + 1.0
		o["mp"] = 0.0
		o["mclaimed"] = false
		o["mlevel"] = _level(p)
		db.update_profile(uid, { "orders": o })
		_stash(db, uid, tier)
		db.bump_stat(uid, "daily_master_cleared", 1.0)
		return { "ok": true, "crate": tier }
	if i < 0 or i > 2:
		return { "error": "No such order." }
	var c: Dictionary = board(o)[i]
	if o["claimed"][i] == true:
		return { "error": "Already claimed." }
	if float(o["p"][i]) < float(c["target"]):
		return { "error": "That order is not done yet." }
	o["claimed"][i] = true
	db.update_profile(uid, { "orders": o })
	var bal: float = db.grant(uid, "doubloons", float(c["reward"]))
	db.ledger(uid, float(c["reward"]), "Order: %s" % c["label"])
	return { "ok": true, "doubloons": bal, "reward": float(c["reward"]) }


## Sweep a fully claimed board: a crate into the stash and a new board dealt.
static func sweep(db: CaptainStore, uid: String) -> Dictionary:
	var o: Dictionary = _pinned(db, uid)
	if not (o["claimed"] as Array).all(func(c: Variant) -> bool: return c == true):
		return { "error": "Claim all three orders first." }
	var p: Dictionary = db.me(uid)
	var lvl: float = _level(p)
	var water: String = "shallows"
	for w: String in WATERS:
		if lvl >= float(Daily.ZONE_MIN_LEVEL.get(w, 999)):
			water = w
			break
	var tier: String = FishingRules.roll_crate_tier(water)
	o["board"] = float(o["board"]) + 1.0
	o["p"] = [0.0, 0.0, 0.0]
	o["claimed"] = [false, false, false]
	o["level"] = lvl
	db.update_profile(uid, { "orders": o })
	_stash(db, uid, tier)
	db.bump_stat(uid, "daily_challenge_sweeps", 1.0)
	return { "ok": true, "crate": tier }


static func _stash(db: CaptainStore, uid: String, tier: String) -> void:
	var stash: Dictionary = Js.obj(db.me(uid).get("crate_stash")).duplicate()
	stash[tier] = Js.num(stash.get(tier)) + 1.0
	db.update_profile(uid, { "crate_stash": stash })


static func _weighted(table: Array) -> String:
	var total: float = 0.0
	for row: Array in table:
		total += float(row[1])
	var roll: float = Dice.next() * total
	for row: Array in table:
		roll -= float(row[1])
		if roll < 0.0:
			return row[0]
	return table[0][0]
