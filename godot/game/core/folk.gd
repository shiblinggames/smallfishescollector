class_name Folk
extends RefCounted
## THE REGULARS, a port of folkState, talkToFolk, askForFavourite,
## deliverToFolk and buyFolkRod in web/lib/core/sea.ts with the helpers of
## web/lib/seaFolk.ts; who they are and what they say come from rules.json
## "regulars" (Godot port, the rest of the sea, stage 4).
##
## Nine people who live out on the water. Rapport is points: a word a day (+1)
## and a favourite fish brought when they asked for it (+3), never decaying,
## climbing five tiers (a stranger, a known face, good company, trusted, thick
## as thieves). Each says the next line of their tier they have not said yet,
## and at the top three of them will part with a rod no shop sells.

const TIER_NAME: Array[String] = ["A stranger", "A known face", "Good company", "Trusted", "Thick as thieves"]
const TIER_AT: Array[float] = [0.0, 4.0, 14.0, 34.0, 70.0]
const CHAT_POINTS: float = 1.0
const GIFT_POINTS: float = 3.0


static func roster() -> Array:
	return Rules.data()["regulars"]["folk"]


static func by_id(id: String) -> Dictionary:
	for f: Dictionary in roster():
		if f["id"] == id:
			return f
	return {}


static func asks(id: String) -> Array:
	return Js.list((Rules.data()["regulars"]["asks"] as Dictionary).get(id))


static func tier_for(points: float) -> int:
	for t: int in range(4, 0, -1):
		if points >= TIER_AT[t]:
			return t
	return 0


static func to_next(points: float) -> Variant:
	var t: int = tier_for(points)
	return null if t == 4 else TIER_AT[t + 1] - points


static func role_for(f: Dictionary, tier: int) -> String:
	return TIER_NAME[4] if tier == 4 else str(f["role"])


static func pool_for(f: Dictionary, tier: int) -> Array:
	var lines: Array = (f["lines"] as Dictionary).get(str(tier), []) if f["lines"] is Dictionary else f["lines"][tier]
	return (lines + Js.list(f.get("afterMax"))) if tier == 4 else lines


static func next_line(f: Dictionary, tier: int, seen: Array) -> Dictionary:
	var pool: Array = pool_for(f, tier)
	var at: int = -1
	for i: int in pool.size():
		if not seen.has("%s:%d:%d" % [f["id"], tier, i]):
			at = i
			break
	if at < 0:
		at = int(floor(Dice.next() * pool.size()))
	return { "line": pool[at], "key": "%s:%d:%d" % [f["id"], tier, at] }


static func favourite_for(f: Dictionary, gifts: float) -> Dictionary:
	var favs: Array = f["favourites"]
	var n: int = favs.size()
	return favs[((int(gifts) % n) + n) % n]


static func favourite_by_id(f: Dictionary, fish_id: Variant) -> Dictionary:
	if fish_id == null:
		return {}
	for fav: Dictionary in f["favourites"]:
		if float(fav["id"]) == float(fish_id):
			return fav
	return {}


static func favourites_known(f: Dictionary, seen: Array) -> Array:
	var known: Dictionary = {}
	for key: Variant in seen:
		var parts: PackedStringArray = str(key).split(":")
		if parts.size() < 3 or parts[0] != f["id"]:
			continue
		if parts[1] == "want":
			known[float(parts[2])] = true
			continue
		var pool: Array = pool_for(f, parts[1].to_int())
		var i: int = parts[2].to_int()
		if i < 0 or i >= pool.size():
			continue
		var hay: String = str(pool[i]).to_lower()
		for fav: Dictionary in f["favourites"]:
			if hay.contains(str(fav["name"]).to_lower()):
				known[float(fav["id"])] = true
	return (f["favourites"] as Array).filter(func(fav: Dictionary) -> bool: return known.has(float(fav["id"])))


# ── The store's side (lib/data/local/seaLocal) ─────────────────────────────────

static func _today() -> String:
	return Js.iso(Clock.now_ms()).substr(0, 10)


static func _row(db: CaptainStore, id: String) -> Dictionary:
	for r: Dictionary in db.save["rapport"]:
		if r["folk_id"] == id:
			return r
	return {}


static func _ensure(db: CaptainStore, id: String) -> void:
	if _row(db, id).is_empty():
		(db.save["rapport"] as Array).append({ "folk_id": id, "points": 0.0, "seen_lines": [], "last_chat_on": null, "gifts_given": 0.0, "want_fish_id": null, "want_asked_at": null })


static func _last_caught(db: CaptainStore, fish_id: float) -> Variant:
	var c: Variant = (db.save["collection"] as Dictionary).get(Js.key(fish_id))
	return (c as Dictionary).get("last_caught_at") if c is Dictionary else null


# ── The rules ──────────────────────────────────────────────────────────────────

static func state(db: CaptainStore, uid: String) -> Array:
	db.me(uid)
	var d: String = _today()
	var out: Array = []
	for f: Dictionary in roster():
		var r: Dictionary = _row(db, f["id"])
		var points: float = Js.num(r.get("points"))
		var fav: Dictionary = favourite_by_id(f, r.get("want_fish_id"))
		var ready: bool = false
		if not fav.is_empty() and r.get("want_asked_at") != null:
			var held: Variant = db.hold_qty(uid, float(fav["id"]))
			var caught: Variant = _last_caught(db, float(fav["id"]))
			ready = held != null and float(held) >= 1.0 and caught != null and Js.parse_ms(caught) > Js.parse_ms(r["want_asked_at"])
		out.append({
			"folkId": f["id"], "points": points, "tier": tier_for(points),
			"seenLines": Js.list(r.get("seen_lines")), "chattedToday": r.get("last_chat_on") == d,
			"giftsGiven": Js.num(r.get("gifts_given")),
			"want": null if fav.is_empty() else { "fishId": fav["id"], "name": fav["name"] },
			"wantReady": not fav.is_empty() and ready,
		})
	return out


static func talk(db: CaptainStore, uid: String, folk_id: String) -> Dictionary:
	var f: Dictionary = by_id(folk_id)
	if f.is_empty():
		return { "error": "There is nobody by that name out here." }
	var d: String = _today()
	db.me(uid)
	_ensure(db, f["id"])
	var before: Dictionary = _row(db, f["id"])
	if before.get("last_chat_on") == d:
		return { "error": "You have already had a word with %s today." % f["name"] }
	var was: int = tier_for(Js.num(before.get("points")))
	var seen: Array = Js.list(before.get("seen_lines"))
	var nl: Dictionary = next_line(f, was, seen)
	var points: float = Js.num(before.get("points")) + CHAT_POINTS
	var tier: int = tier_for(points)
	before["points"] = points
	before["seen_lines"] = seen if seen.has(nl["key"]) else seen + [nl["key"]]
	before["last_chat_on"] = d
	return { "line": nl["line"], "points": points, "tier": tier, "tierUp": f["tierUp"][tier - 1] if tier > was else null }


static func ask(db: CaptainStore, uid: String, folk_id: String) -> Dictionary:
	var f: Dictionary = by_id(folk_id)
	if f.is_empty():
		return { "error": "There is nobody by that name out here." }
	db.me(uid)
	_ensure(db, f["id"])
	var row: Dictionary = _row(db, f["id"])
	var open: Dictionary = favourite_by_id(f, row.get("want_fish_id"))
	if not open.is_empty():
		return { "line": open["ask"], "fishId": open["id"], "fishName": open["name"] }
	var fav: Dictionary = favourite_for(f, Js.num(row.get("gifts_given")))
	var seen: Array = Js.list(row.get("seen_lines"))
	var key: String = "%s:want:%s" % [f["id"], Js.key(fav["id"])]
	row["want_fish_id"] = fav["id"]
	row["want_asked_at"] = Js.iso(Clock.now_ms())
	row["seen_lines"] = seen if seen.has(key) else seen + [key]
	return { "line": fav["ask"], "fishId": fav["id"], "fishName": fav["name"] }


static func deliver(db: CaptainStore, uid: String, folk_id: String) -> Dictionary:
	var f: Dictionary = by_id(folk_id)
	if f.is_empty():
		return { "error": "There is nobody by that name out here." }
	db.me(uid)
	var before: Dictionary = _row(db, f["id"])
	if before.is_empty() or before.get("want_fish_id") == null or not Js.truthy(before.get("want_asked_at")):
		return { "error": "%s has not asked you for anything." % f["short"] }
	var fav: Dictionary = favourite_by_id(f, before["want_fish_id"])
	if fav.is_empty():
		return { "error": "%s has not asked you for anything." % f["short"] }
	var caught: Variant = _last_caught(db, float(fav["id"]))
	if caught == null or not (Js.parse_ms(caught) > Js.parse_ms(before["want_asked_at"])):
		return { "error": "You have not landed a %s since they asked. One out of the hold does not count." % fav["name"] }
	var old_points: float = Js.num(before.get("points"))
	var old_gifts: float = Js.num(before.get("gifts_given"))
	var asked_at: Variant = before["want_asked_at"]
	var points: float = old_points + GIFT_POINTS
	var was: int = tier_for(old_points)
	var tier: int = tier_for(points)
	before["points"] = points
	before["gifts_given"] = old_gifts + 1.0
	before["want_fish_id"] = null
	before["want_asked_at"] = null
	var have: float = Js.num((db.save["hold"] as Dictionary).get(Js.key(fav["id"])))
	if have < 1.0:
		before["points"] = old_points
		before["gifts_given"] = old_gifts
		before["want_fish_id"] = fav["id"]
		before["want_asked_at"] = asked_at
		return { "error": "There is no %s in your hold." % fav["name"] }
	if have == 1.0:
		(db.save["hold"] as Dictionary).erase(Js.key(fav["id"]))
	else:
		db.save["hold"][Js.key(fav["id"])] = have - 1.0
	db.grant_badge(uid, "you_remembered")
	var brought: Array = fav["brought"]
	var line: String = str(brought[int(floor(Dice.next() * brought.size()))]) if not brought.is_empty() else ""
	return { "line": line, "points": points, "tier": tier, "tierUp": f["tierUp"][tier - 1] if tier > was else null, "fishName": fav["name"] }


static func buy_rod(db: CaptainStore, uid: String, folk_id: String) -> Dictionary:
	var f: Dictionary = by_id(folk_id)
	if f.is_empty() or f.get("rodTier") == null:
		return { "error": "They have nothing like that to sell." }
	var rod: Dictionary = {}
	for r: Dictionary in Rules.data()["rods"]:
		if float(r["tier"]) == float(f["rodTier"]):
			rod = r
	if rod.is_empty():
		return { "error": "The deal fell through." }
	if tier_for(Js.num(_row(db, f["id"]).get("points"))) < 4:
		return { "error": "%s is not going to part with that for you yet." % f["short"] }
	if db.rod_held(uid, rod["id"]) > 0.0:
		return { "error": "You already carry the %s." % rod["name"] }
	var bal: Variant = db.deduct_doubloons(uid, float(rod["cost"]))
	if bal == null:
		return { "error": "They want %s and you have not got it." % Js.thousands(float(rod["cost"])) }
	db.rod_give(uid, rod["id"])
	db.ledger(uid, -float(rod["cost"]), "Bought the %s from %s at sea" % [rod["name"], f["short"]])
	return { "ok": true, "rodTier": f["rodTier"], "rodName": rod["name"], "spent": rod["cost"], "doubloons": float(bal) }


## traderPos: where someone moored on the water has drifted to. A positive
## rate walks a lap of 4 to 6 legs with a long dwell between them; the lap is
## an ellipse (y at 0.6). Returns { x, y, facing } in doubles.
static func drift_pos(home_x: float, home_y: float, r: float, rate: float, phase: float, now_sec: float) -> Dictionary:
	var a: float = phase + now_sec * rate
	if rate > 0.0:
		var lap: float = TAU / rate
		var u: float = fposmod(now_sec / lap, 1.0)
		var n: float = absf(sin(phase * 12.9898) * 43758.5453)
		var legs: int = 4 + int(floor(fmod(n, 1.0) * 3.0))
		var leg: float = u * legs
		var i: int = int(floor(leg))
		var f: float = leg - i
		var moved: float = 0.0
		if f > 0.58:
			var t: float = (f - 0.58) / (1.0 - 0.58)
			moved = t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
		a = phase + (float(i) + moved) / legs * TAU
	return { "x": home_x + cos(a) * r, "y": home_y + sin(a) * r * 0.6, "facing": 1.0 if -sin(a) < 0.0 else -1.0 }
