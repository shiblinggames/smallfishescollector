class_name Traders
extends RefCounted
## THE WANDERING TRADERS, a port of traderAt, runnerAt, tradersAround and
## traderFromKey in web/lib/seaTraders.ts, and strikeDeal and
## wagerForRunnerRod in web/lib/core/selling.ts (Godot port, the rest of the
## sea, stage 4). The tables come from rules.json "traders".
##
## The sea is cut into 1,500-pixel cells, and each holds at most one wanderer a
## day: where it sits, whether anyone is there, who they are, what they sell or
## buy or only talk about, and how they look are all hashed from the cell and
## the day, so every captain meets the same people. Peddlers and deep tinkers
## sell bait under the shop's price; salters buy the whole hold (74 to 86%);
## talkers pass the time. At night, in the Ancient Deep, a blockade runner may
## cut you a deck for a rod no shop sells. Six deals a day, then word travels.

const U32: int = 0xFFFFFFFF


static func t() -> Dictionary:
	return Rules.data()["traders"]


## JS's x|0: wrapped to a signed 32-bit integer (the runner's seed, a night's
## index times 7,919, runs past it).
static func _i32(v: int) -> int:
	return ((v & U32) ^ 0x80000000) - 0x80000000


static func _hash(a: int, b: int, c: int) -> int:
	a = _i32(a)
	b = _i32(b)
	c = _i32(c)
	var h: int = Explore.to_u32(float(a) * float(0x27d4eb2d)) ^ Explore.to_u32(float(b) * float(0x165667b1)) ^ Explore.to_u32(float(c) * float(0x9e3779b1))
	h &= U32
	h = Dice.imul(h ^ (h >> 15), 0x85ebca6b)
	h = Dice.imul(h ^ (h >> 13), 0xc2b2ae35)
	return (h ^ (h >> 16)) & U32


## The LCG stream (s = s x 1664525 + 1013904223, mod 2^32), as floats in [0, 1).
class Stream:
	extends RefCounted
	var s: int = 0

	func _init(seed: int) -> void:
		s = seed & 0xFFFFFFFF

	func next() -> float:
		s = (Dice.imul(s, 1664525) + 1013904223) & 0xFFFFFFFF
		return float(s) / 4294967296.0


static func sea_day(now: float) -> int:
	return int(floor(now / 86400000.0))


static func _pick(arr: Array, rnd: Stream) -> Variant:
	return arr[int(floor(rnd.next() * arr.size()))]


static func _clear(x: float, y: float, pad: float) -> bool:
	for s: Array in t()["solids"]:
		var dx: float = float(s[0]) - x
		var dy: float = float(s[1]) - y
		if sqrt(dx * dx + dy * dy) < float(s[2]) + pad:
			return false
	return true


static func _bait(type: String) -> Dictionary:
	return Rules.bait(type)


static func _offer_for(kind: String, depth: float, rnd: Stream) -> Variant:
	if kind == "salter":
		return { "deal": "buy", "rate": Js.round((0.74 + depth * 0.12) * 100.0) / 100.0 }
	var pool: Array = (t()["stock"][kind] as Array).filter(func(b: String) -> bool: return Js.num(_bait(b).get("shopCost")) > 0)
	if pool.is_empty():
		return null
	var bait_type: String = pool[int(floor(rnd.next() * pool.size()))]
	var bait: Dictionary = _bait(bait_type)
	if bait.is_empty() or float(bait["shopCost"]) <= 0:
		return null
	var qty: float = float(bait["bundleSize"]) * (3.0 if kind == "tinker" else 2.0)
	var shop_cost: float = float(bait["shopCost"]) * qty
	var discount: float = 0.18 + depth * 0.22 + rnd.next() * 0.08
	return { "deal": "bait", "baitType": bait_type, "qty": qty, "cost": maxf(1.0, Js.round(shop_cost * (1.0 - discount) / 5.0) * 5.0), "shopCost": shop_cost }


static func _gcd(a: int, b: int) -> int:
	while b != 0:
		var r: int = a % b
		a = b
		b = r
	return a


static func _run_of(pool: Array, n: int, rnd: Stream) -> Array:
	var length: int = pool.size()
	if length == 0:
		return []
	var take: int = mini(n, length)
	var stride: int = 1 + int(floor(rnd.next() * (length - 1)))
	while _gcd(stride, length) != 1:
		stride = (stride % (length - 1)) + 1
	var start: int = int(floor(rnd.next() * length))
	var out: Array = []
	for i: int in take:
		out.append(pool[(start + i * stride) % length])
	return out


static func _talker_offer(rnd: Stream) -> Dictionary:
	var persona: Dictionary = _pick(t()["personas"], rnd)
	var chat: Array = _run_of(persona["lines"], 3, rnd)
	var roll: float = rnd.next()
	if roll < 0.40:
		return { "deal": "talk", "topic": "hint", "mood": persona["mood"], "lines": [chat[0], _pick(t()["hints"], rnd)] + chat.slice(1) }
	if roll < 0.55:
		return { "deal": "talk", "topic": "story", "mood": persona["mood"], "lines": [chat[0], _pick(t()["stories"], rnd)] + chat.slice(1) }
	return { "deal": "talk", "topic": "chat", "mood": persona["mood"], "lines": chat }


## The wanderer in this cell today, or {}.
static func at_cell(cx: int, cy: int, day: int) -> Dictionary:
	var tb: Dictionary = t()
	var cell: float = float(tb["cell"])
	var rnd: Stream = Stream.new(_hash(cx, cy, day))
	var x: float = cx * cell + rnd.next() * cell
	var y: float = cy * cell + rnd.next() * cell
	var depth: float = minf(1.0, sqrt(x * x + y * y) / 7600.0)
	if rnd.next() > 0.07 + 0.28 * sin(PI * depth):
		return {}
	var md: float = float(tb["maxDrift"])
	var r: float = sqrt(x * x + y * y)
	if r > float(tb["outerEdge"]) - md:
		return {}
	if y < float(tb["northWall"]) + md:
		return {}
	if r < float(tb["doorstep"]):
		return {}
	if not _clear(x, y, md + float(tb["boatClear"])):
		return {}
	var talker: bool = rnd.next() < 0.4
	var roll: float = rnd.next()
	var kind: String = "tinker" if (depth > 0.5 and roll < 0.34) else ("peddler" if roll < 0.62 else "salter")
	var offer: Variant = _talker_offer(rnd) if talker else _offer_for(kind, depth, rnd)
	if offer == null:
		return {}
	var look: Dictionary = {
		"characterColor": _pick(tb["colors"], rnd), "boatId": _pick(tb["boats"], rnd),
		"hatId": _pick(tb["hats"], rnd) if rnd.next() < 0.75 else null,
		"rodSlug": _pick(tb["rods"], rnd), "hook": _pick(tb["hooks"], rnd),
	}
	var drift_r: float = 90.0 + rnd.next() * 190.0
	var drift_rate: float = (1.0 if rnd.next() < 0.5 else -1.0) * TAU / (50.0 + rnd.next() * 90.0)
	var drift_phase: float = rnd.next() * TAU
	var name: String = "%s %s" % [_pick(tb["namesFirst"], rnd), _pick(tb["namesLast"], rnd)]
	var line: String = offer["lines"][0] if offer["deal"] == "talk" else str(_pick(tb["lines"][kind], rnd))
	var out: Dictionary = {
		"key": "%d:%d:%d" % [day, cx, cy], "kind": "talker" if talker else kind, "name": name,
		"x": x, "y": y, "look": look, "line": line,
		"driftR": drift_r, "driftRate": drift_rate, "driftPhase": drift_phase,
	}
	out.merge(offer)
	return out


static func runner_at(cx: int, cy: int, night_index: int) -> Dictionary:
	var tb: Dictionary = t()
	var cell: float = float(tb["cell"])
	var rnd: Stream = Stream.new(_hash(cx, cy, night_index * 7919 + 3))
	var x: float = cx * cell + rnd.next() * cell
	var y: float = cy * cell + rnd.next() * cell
	var md: float = float(tb["maxDrift"])
	var r: float = sqrt(x * x + y * y)
	if r > float(tb["outerEdge"]) - md:
		return {}
	if y < float(tb["northWall"]) + md:
		return {}
	if not _clear(x, y, md + float(tb["boatClear"])):
		return {}
	var ancient: Dictionary = Chart.WATERS[4]
	if r < float(ancient["inner"]) + md or r > float(ancient["outer"]) - md:
		return {}
	if rnd.next() > 0.11:
		return {}
	var rods: Array = tb["runnerRods"]
	if rods.is_empty():
		return {}
	var rod: Dictionary = rods[int(floor(rnd.next() * rods.size()))]
	var name: String = "%s %s" % [_pick(tb["namesFirst"], rnd), _pick(tb["namesLast"], rnd)]
	var line: String = _pick(tb["runnerLines"], rnd)
	var drift_r: float = 70.0 + rnd.next() * 120.0
	var drift_rate: float = (1.0 if rnd.next() < 0.5 else -1.0) * TAU / (60.0 + rnd.next() * 70.0)
	var drift_phase: float = rnd.next() * TAU
	return {
		"key": "night:%d:%d:%d" % [night_index, cx, cy], "kind": "runner", "name": name, "x": x, "y": y,
		"look": { "characterColor": "gray", "boatId": "charcoal", "hatId": "black", "rodSlug": rod["slug"], "hook": null },
		"line": line, "driftR": drift_r, "driftRate": drift_rate, "driftPhase": drift_phase,
		"deal": "wager", "rodTier": rod["tier"], "stake": tb["runnerStake"], "odds": tb["runnerOdds"],
	}


## Night on the chart, as seaClock says it: night or dusk, and which night.
static func night(now: float) -> Dictionary:
	var phase: String = SeaClock.at(now)["phase"]
	return { "isNight": phase == "night" or phase == "dusk", "index": int(floor(now / SeaClock.CYCLE_MS)) }


static func around(x: float, y: float, radius: float, day: int, now: float) -> Array:
	var tb: Dictionary = t()
	var cell: float = float(tb["cell"])
	var out: Array = []
	var nt: Dictionary = night(now)
	for cx: int in range(int(floor((x - radius) / cell)), int(floor((x + radius) / cell)) + 1):
		for cy: int in range(int(floor((y - radius) / cell)), int(floor((y + radius) / cell)) + 1):
			if (cy + 1) * cell <= float(tb["northWall"]):
				continue
			var w: Dictionary = at_cell(cx, cy, day)
			if not w.is_empty():
				out.append(w)
			if nt["isNight"]:
				var r: Dictionary = runner_at(cx, cy, nt["index"])
				if not r.is_empty():
					out.append(r)
	return out


## Yoon, the one wanderer who never moves on: a talker, built from his mooring.
static func yoon() -> Dictionary:
	for m: Dictionary in Rules.data()["regulars"]["moorings"]:
		if m.get("folkId") == "yoon":
			return {
				"key": "yoon", "kind": "talker", "folkId": "yoon", "name": m["name"], "x": m["x"], "y": m["y"],
				"line": m["line"], "driftR": m["driftR"], "driftRate": m["driftRate"], "driftPhase": m["driftPhase"],
				"look": { "characterColor": m["look"]["color"], "boatId": m["look"]["boat"], "hatId": m["look"]["hat"], "rodSlug": m["look"]["rodSlug"], "hook": null },
				"deal": "talk", "topic": "chat", "mood": "One of the regulars", "lines": [m["line"]],
			}
	return {}


static func from_key(key: String, now: float) -> Dictionary:
	if key == "yoon":
		return yoon()
	if key.begins_with("night:"):
		var p: PackedStringArray = key.split(":")
		if p.size() != 4 or not (p[1].is_valid_int() and p[2].is_valid_int() and p[3].is_valid_int()):
			return {}
		var nt: Dictionary = night(now)
		if not nt["isNight"] or nt["index"] != p[1].to_int():
			return {}
		var r: Dictionary = runner_at(p[2].to_int(), p[3].to_int(), p[1].to_int())
		return r if r.get("key") == key else {}
	var parts: PackedStringArray = key.split(":")
	if parts.size() != 3 or not (parts[0].is_valid_int() and parts[1].is_valid_int() and parts[2].is_valid_int()):
		return {}
	var w: Dictionary = at_cell(parts[1].to_int(), parts[2].to_int(), parts[0].to_int())
	return w if w.get("key") == key else {}


# ── The deals (lib/core/selling) ───────────────────────────────────────────────

static func _deals(db: CaptainStore) -> Array:
	return db.save["deals"]


static func dealt_today(db: CaptainStore, uid: String) -> Array:
	db.me(uid)
	var today: int = sea_day(Clock.now_ms())
	var out: Array = []
	for d: Dictionary in _deals(db):
		if int(d["sea_day"]) == today:
			out.append(d["trader_key"])
	return out


static func _claim(db: CaptainStore, row: Dictionary) -> String:
	for d: Dictionary in _deals(db):
		if d["trader_key"] == row["trader_key"]:
			return "taken"
	var keep: Array = _deals(db).filter(func(d: Dictionary) -> bool: return float(d["sea_day"]) >= float(row["sea_day"]) - 7.0)
	keep.append(row.duplicate(true))
	db.save["deals"] = keep
	return "ok"


static func _release(db: CaptainStore, key: String) -> void:
	db.save["deals"] = _deals(db).filter(func(d: Dictionary) -> bool: return d["trader_key"] != key)


static func strike_deal(db: CaptainStore, uid: String, key: String) -> Dictionary:
	var now: float = Clock.now_ms()
	var tr: Dictionary = from_key(key, now)
	if tr.is_empty():
		return { "error": "There is nobody there." }
	var today: int = sea_day(now)
	if not key.begins_with("%d:" % today):
		return { "error": "They sailed on. The sea has different people in it today." }
	db.me(uid)
	if dealt_today(db, uid).size() >= int(t()["dealsPerDay"]):
		return { "error": "Word travels. Nobody else out here will deal with you today." }
	var doubloons: float = Js.num(db.profile(uid, "doubloons").get("doubloons"))
	if tr["deal"] != "bait" and tr["deal"] != "buy":
		return { "error": "They have nothing to trade." }
	var detail: Dictionary = { "deal": "bait", "baitType": tr["baitType"], "qty": tr["qty"], "cost": tr["cost"] } if tr["deal"] == "bait" else { "deal": "buy", "rate": tr["rate"] }
	if tr["deal"] == "bait" and doubloons < float(tr["cost"]):
		return { "error": "%s wants %s and you have not got it." % [tr["name"], Js.thousands(float(tr["cost"]))] }
	if _claim(db, { "trader_key": key, "sea_day": float(today), "kind": tr["kind"], "detail": detail }) == "taken":
		return { "error": "You have already dealt with them." }
	if tr["deal"] == "bait":
		var bait: Dictionary = _bait(tr["baitType"])
		if bait.is_empty():
			return { "error": "The deal fell through." }
		var bal: Variant = db.deduct_doubloons(uid, float(tr["cost"]))
		if bal == null:
			_release(db, key)
			return { "error": "You have not got the coin." }
		db.add_bait(uid, tr["baitType"], float(tr["qty"]))
		db.ledger(uid, -float(tr["cost"]), "Bought %d %s from %s" % [int(tr["qty"]), bait["name"], tr["name"]])
		return { "ok": true, "spent": tr["cost"], "baitType": tr["baitType"], "qty": tr["qty"], "doubloons": float(bal) }
	var rows: Array = db.hold_stacks(uid)
	if rows.is_empty():
		_release(db, key)
		return { "error": "Your hold is empty. Nothing to sell." }
	var rate: float = float(tr["rate"])
	if Selling._hold_at_rate(db, rows, rate) <= 0:
		_release(db, key)
		return { "error": "Nothing in your hold is worth his salt." }
	var taken: Array = db.take_whole_hold(uid)
	var sold: float = Selling._hold_at_rate(db, taken, rate)
	if sold <= 0:
		_release(db, key)
		return { "error": "Your hold is empty. Nothing to sell." }
	var now_bal: float = db.grant(uid, "doubloons", sold)
	db.ledger(uid, sold, "Sold the hold to %s at sea" % tr["name"])
	return { "ok": true, "earned": sold, "doubloons": now_bal }


static func wager(db: CaptainStore, uid: String, key: String) -> Dictionary:
	var now: float = Clock.now_ms()
	var tr: Dictionary = from_key(key, now)
	if tr.is_empty() or tr.get("deal") != "wager":
		return { "error": "They have gone. The dark does not keep anyone in one place." }
	var rod: Dictionary = {}
	for r: Dictionary in Rules.data()["rods"]:
		if float(r["tier"]) == float(tr["rodTier"]):
			rod = r
	if rod.is_empty():
		return { "error": "The deal fell through." }
	var today: int = sea_day(now)
	if db.rod_held(uid, rod["id"]) > 0.0:
		return { "error": "You already carry the %s." % rod["name"] }
	var cut_key: String = "yolo:%d" % today
	if _claim(db, { "trader_key": cut_key, "sea_day": float(today), "kind": "runner", "detail": { "deal": "wager", "rodTier": tr["rodTier"], "stake": tr["stake"] } }) == "taken":
		return { "error": "You have had your cut tonight. He will deal again tomorrow." }
	var bal: Variant = db.deduct_doubloons(uid, float(tr["stake"]))
	if bal == null:
		_release(db, cut_key)
		return { "error": "He wants %s on the table and you have not got it." % Js.thousands(float(tr["stake"])) }
	var won: bool = Dice.next() < float(tr["odds"])
	if won and db.rod_give(uid, rod["id"]):
		db.ledger(uid, -float(tr["stake"]), "Won the %s off a blockade runner" % rod["name"])
		return { "ok": true, "won": true, "rodTier": tr["rodTier"], "rodName": rod["name"], "stake": tr["stake"], "doubloons": float(bal) }
	db.ledger(uid, -float(tr["stake"]), "Staked on the %s with a blockade runner" % rod["name"])
	return { "ok": true, "won": false, "rodTier": tr["rodTier"], "rodName": rod["name"], "stake": tr["stake"], "doubloons": float(bal) }
