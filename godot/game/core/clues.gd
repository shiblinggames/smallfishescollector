class_name Clues
extends RefCounted
## TREASURE HUNTS (Kong, 2026-10-02: "bottles should work like clue scrolls
## in RuneScape, and the dig is the hunt's final step; you should never just
## come across a dig spot, only as part of an active treasure hunt").
##
## THE BOTTLES. A few drift on the open sea each sea day (48 minutes): 3 to 5,
## hashed from the day, so every captain sees the same ones. Each captain may
## fish each one out once. The water it floats in sets its tier: the Shallows
## an easy clue, Open Waters medium, the Deep hard, the Abyss and the Ancient
## Deep elite. One hunt of each tier at a time: with a medium clue already in
## hand, a medium bottle is left where it floats.
##
## THE HUNT. A few steps, then the dig: easy 2, medium 3, hard 4, elite 5. A
## step is a BEARING (a spot given as metres off a landmark: sail there and
## search), a RIDDLE (a rock named in a verse: sail to it and search), a
## CATCH (bring up a given fish in a given water: it advances on the catch),
## or a WORD (find a regular and ask them). The last step is always a bearing
## to a buried site in the tier's water: dig there. Only then does the site
## show its tell on the water; a dig spot is never found any other way.
##
## THE CASKET. Doubloons, bait, and (often, deeper always) a fishing crate for
## the stash: cosmetics still come only from crates. Rolled on the rules' dice.
##
## Steps are rolled from the hunt's own seed when it starts, and kept in the
## profile (clue_hunts), so a hunt reads the same every time it is opened.

const TIERS: Array[String] = ["easy", "medium", "hard", "elite"]
## What each tier is called in the game (Kong: not RuneScape's easy to
## elite): what the bottle holds. The ids stay easy..elite in the save.
const TIER_NAME: Dictionary = { "easy": "Scrawl", "medium": "Ship's Letter", "hard": "Torn Map", "elite": "Last Will" }
const BAND_TIER: Dictionary = { "shallows": "easy", "open_waters": "medium", "deep": "hard", "abyss": "elite", "ancient_deep": "elite" }
## The waters a tier's steps send you to.
const TIER_BANDS: Dictionary = { "easy": ["shallows"], "medium": ["open_waters"], "hard": ["deep"], "elite": ["abyss", "ancient_deep"] }
## How close counts as there, in world pixels.
const SEARCH_RANGE: float = 420.0
const SPEAK_RANGE: float = 700.0
const BOTTLE_REACH: float = 320.0


static func cfg() -> Dictionary:
	return Js.obj(Rules.data().get("clues"))


## On in the port (port_rules "clues"); never under the parity run.
static func on() -> bool:
	return not Rules.web_only and not cfg().is_empty()


static func sea_day(now: float) -> int:
	return int(floor(now / SeaClock.CYCLE_MS))


# ── The bottles ────────────────────────────────────────────────────────────────

static var _day_cache: int = -99999
static var _day_bottles: Array = []


## Today's bottles: [{ key, x, y, seed, tier, band }].
static func bottles(now: float) -> Array:
	var day: int = sea_day(now)
	if day == _day_cache:
		return _day_bottles
	_day_cache = day
	_day_bottles = []
	var rnd: Traders.Stream = Traders.Stream.new(Traders._hash(day, 0x5c1e, 0xb077))
	var lo: int = int(Js.list(cfg().get("bottlesPerDay"))[0]) if cfg().has("bottlesPerDay") else 3
	var hi: int = int(Js.list(cfg().get("bottlesPerDay"))[1]) if cfg().has("bottlesPerDay") else 5
	var n: int = lo + int(floor(rnd.next() * float(hi - lo + 1)))
	var tries: int = 0
	while _day_bottles.size() < n and tries < 400:
		tries += 1
		# Anywhere on the fishing side: a radius (weighted to the wider, outer
		# rings a little less than area would) and an angle south of the reef.
		var r: float = lerpf(1700.0, Chart.LAST_OUTER - 500.0, pow(rnd.next(), 0.8))
		var ang: float = lerpf(0.05, PI - 0.05, rnd.next())
		var x: float = cos(ang) * r
		var y: float = sin(ang) * r
		if y < 600.0 or not _open_water(Vector2(x, y)):
			continue
		var w: Dictionary = Chart.water_at(Vector2(x, y))
		if w.is_empty():
			continue
		_day_bottles.append({ "key": "clue:%d:%d" % [day, _day_bottles.size()], "x": x, "y": y, "seed": int(rnd.next() * 1000000.0),
			"band": w["id"], "tier": BAND_TIER.get(w["id"], "easy") })
	return _day_bottles


## Clear of every isle and port by a good margin.
static func _open_water(at: Vector2) -> bool:
	for i: Dictionary in Rules.data()["isles"]:
		if at.distance_to(Vector2(float(i["x"]), float(i["y"]))) < float(i["r"]) + 700.0:
			return false
	for p: Dictionary in Chart.ports():
		if at.distance_to(Vector2(float(p["x"]), float(p["y"]))) < float(p["r"]) + 900.0:
			return false
	return true


static func bottle(key: String, now: float) -> Dictionary:
	for b: Dictionary in bottles(now):
		if b["key"] == key:
			return b
	return {}


## Today's bottles within reach of a point, not yet taken by this captain.
static func bottles_near(prof: Dictionary, x: float, y: float, radius: float, now: float) -> Array:
	var taken: Dictionary = Js.obj(prof.get("clue_bottles"))
	return bottles(now).filter(func(b: Dictionary) -> bool:
		return not taken.has(b["key"]) and Vector2(float(b["x"]) - x, float(b["y"]) - y).length() < radius)


## Fish a bottle out: a new hunt of its tier, or (holding one) leave it.
static func take_bottle(db: CaptainStore, uid: String, key: String) -> Dictionary:
	var now: float = Clock.now_ms()
	var b: Dictionary = bottle(key, now)
	if b.is_empty():
		return { "ok": false, "error": "It has drifted off." }
	var p: Dictionary = db.me(uid)
	var taken: Dictionary = Js.obj(p.get("clue_bottles")).duplicate()
	if taken.has(key):
		return { "ok": false, "error": "You have had this one." }
	var at: Dictionary = Explore.bottle_pos(b, now / 1000.0)
	if not Explore._near_enough(p, float(at["x"]), float(at["y"]), BOTTLE_REACH * 3.0):
		return { "ok": false, "error": "It is out of reach." }
	var tier: String = b["tier"]
	var hunts: Dictionary = Js.obj(p.get("clue_hunts")).duplicate(true)
	if hunts.has(tier):
		return { "ok": false, "held": true, "error": "You already carry %s. Finish that hunt before you take another." % _a(tier) }
	var hunt: Dictionary = make_hunt(tier, int(b["seed"]) ^ uid.hash(), db.save)
	hunts[tier] = hunt
	# Keep only today's taken bottles.
	var keep: Dictionary = {}
	var day: String = "clue:%d:" % sea_day(now)
	for k: Variant in taken:
		if str(k).begins_with(day):
			keep[k] = true
	keep[key] = true
	db.update_profile(uid, { "clue_hunts": hunts, "clue_bottles": keep })
	return { "ok": true, "tier": tier, "hunt": hunt, "step": hunt["steps"][0] }


static func _a(tier: String) -> String:
	return "a " + str(TIER_NAME[tier])


# ── A hunt ─────────────────────────────────────────────────────────────────────

## A new hunt of this tier: its steps, rolled from the seed.
static func make_hunt(tier: String, seed: int, save: Dictionary) -> Dictionary:
	var rnd: Traders.Stream = Traders.Stream.new(seed)
	var n: int = int(Js.obj(cfg().get("steps")).get(tier, 2))
	var kinds: Array = Js.list(cfg().get("kinds"))
	if kinds.is_empty():
		kinds = ["bearing", "riddle", "catch", "speak"]
	var steps: Array = []
	var last: String = ""
	var guard: int = 0
	while steps.size() < n and guard < 60:
		guard += 1
		var kind: String = kinds[int(floor(rnd.next() * kinds.size()))]
		if kind == last:
			continue
		var s: Dictionary = _step(kind, tier, rnd, save, steps)
		if s.is_empty():
			continue
		steps.append(s)
		last = kind
	steps.append(_dig_step(tier, rnd))
	return { "tier": tier, "step": 0, "steps": steps, "started": Js.iso(Clock.now_ms()) }


static func _step(kind: String, tier: String, rnd: Traders.Stream, save: Dictionary, so_far: Array) -> Dictionary:
	var bands: Array = TIER_BANDS[tier]
	match kind:
		"bearing":
			for i: int in 40:
				var p: Vector2 = _point_in(bands, rnd)
				if p != Vector2.INF and _open_water(p):
					return { "kind": "bearing", "x": p.x, "y": p.y, "text": "Search the water %s." % bearing_text(p) }
		"riddle":
			var riddles: Dictionary = Js.obj(cfg().get("riddles"))
			var pool: Array = (Rules.data()["isles"] as Array).filter(func(i: Dictionary) -> bool: return bands.has(i["band"]) and riddles.has(i["id"]))
			pool = pool.filter(func(i: Dictionary) -> bool: return not so_far.any(func(s: Dictionary) -> bool: return s.get("isle") == i["id"]))
			if pool.is_empty():
				return {}
			var isle: Dictionary = pool[int(floor(rnd.next() * pool.size()))]
			return { "kind": "riddle", "isle": isle["id"], "x": float(isle["x"]), "y": float(isle["y"]), "r": float(isle["r"]),
				"text": "%s Search the water beside it." % riddles[isle["id"]] }
		"catch":
			var cap: int = int(Js.obj(cfg().get("catchRarity")).get(tier, 2))
			var fish: Array = Js.list(save.get("species")).filter(func(f: Dictionary) -> bool:
				return bands[0] == f["habitat"] and float(f["bite_rarity"]) <= cap and Js.num(f.get("sell_value")) > 0.0)
			if fish.is_empty():
				return {}
			var f: Dictionary = fish[int(floor(rnd.next() * fish.size()))]
			var wname: String = ""
			for w: Dictionary in Chart.WATERS:
				if w["id"] == f["habitat"]:
					wname = w["name"]
			# Not its name: what the Log says of it, so a fish caught before can be
			# found in the Log, and one never caught must be guessed (Kong).
			var said: String = veil(str(f.get("fun_fact") if f.get("fun_fact") != null else f.get("description", "")).strip_edges(), str(f["name"]))
			return { "kind": "catch", "fish": float(f["id"]), "text": "Bring up the fish in %s that your Log would describe so: \"%s\"" % [wname, said] }
		"speak":
			var folk: Array = Folk.roster().filter(func(f: Dictionary) -> bool: return not so_far.any(func(s: Dictionary) -> bool: return s.get("folk") == f["id"]))
			if folk.is_empty():
				return {}
			var f: Dictionary = folk[int(floor(rnd.next() * folk.size()))]
			return { "kind": "speak", "folk": f["id"], "text": "Show this to %s and ask what it means." % f["name"] }
	return {}


## The Log's words with the fish's name taken out (and the last word of it,
## "Catfish" in "Flathead Catfish", which would give it away as well).
static func veil(text: String, name: String) -> String:
	var words: PackedStringArray = name.split(" ")
	var names: Array = [name]
	if words.size() > 1 and words[words.size() - 1].length() > 3:
		names.append(words[words.size() - 1])
	var out: String = text
	var esc: RegEx = RegEx.create_from_string(r"[.*+?^${}()|\[\]\\]")
	for n: String in names:
		var e: String = esc.sub(n, r"\$0", true)
		out = RegEx.create_from_string(r"(?i)\b(the |a |an )?%s(e?s)?\b(?= (are|were|have|can|live|lie|grow|feed|hunt|spend))" % e).sub(out, "they", true)
		out = RegEx.create_from_string(r"(?i)\b(the |a |an )?%s(e?s)?\b" % e).sub(out, "this fish", true)
	# Each sentence starts with a capital again.
	var parts: PackedStringArray = out.split(". ")
	for k: int in parts.size():
		parts[k] = parts[k].left(1).to_upper() + parts[k].substr(1)
	return ". ".join(parts)


static func _dig_step(tier: String, rnd: Traders.Stream) -> Dictionary:
	var sites: Array = (Rules.data()["digSites"] as Array).filter(func(d: Dictionary) -> bool: return TIER_BANDS[tier].has(d["band"]))
	var site: Dictionary = sites[int(floor(rnd.next() * sites.size()))]
	var at: Vector2 = Vector2(float(site["x"]), float(site["y"]))
	return { "kind": "dig", "site": site["id"], "x": at.x, "y": at.y, "text": "X marks it: %s. Bring a grapple and dig." % bearing_text(at) }


## A point in one of these waters.
static func _point_in(bands: Array, rnd: Traders.Stream) -> Vector2:
	var band: String = bands[int(floor(rnd.next() * bands.size()))]
	for w: Dictionary in Chart.WATERS:
		if w["id"] == band:
			var r: float = lerpf(float(w["inner"]) + 250.0, float(w["outer"]) - 250.0, rnd.next())
			var ang: float = lerpf(0.08, PI - 0.08, rnd.next())
			var p: Vector2 = Vector2(cos(ang), sin(ang)) * r
			return p if p.y > 600.0 else Vector2.INF
	return Vector2.INF


## "240m east and 195m south of Cormorant Rock": metres (ten pixels each) off
## the nearest landmark, an isle or a port.
static func bearing_text(at: Vector2) -> String:
	var best: Dictionary = {}
	var best_d: float = INF
	for i: Dictionary in (Rules.data()["isles"] as Array) + Chart.ports():
		var d: float = at.distance_to(Vector2(float(i["x"]), float(i["y"])))
		if d < best_d:
			best_d = d
			best = i
	var off: Vector2 = at - Vector2(float(best["x"]), float(best["y"]))
	var ew: String = "%dm %s" % [int(round(absf(off.x) / 10.0)), "east" if off.x >= 0.0 else "west"]
	var ns: String = "%dm %s" % [int(round(absf(off.y) / 10.0)), "south" if off.y >= 0.0 else "north"]
	return "%s and %s of %s" % [ew, ns, str(best["name"]).replace("’", "'")]


## The step she is on in this tier's hunt, or {}.
static func current(prof: Dictionary, tier: String) -> Dictionary:
	var h: Dictionary = Js.obj(Js.obj(prof.get("clue_hunts")).get(tier))
	if h.is_empty():
		return {}
	return (h["steps"] as Array)[int(h["step"])]


## The hunts in hand: [[tier, hunt], ...] in tier order.
static func hunts(prof: Dictionary) -> Array:
	var out: Array = []
	var all: Dictionary = Js.obj(prof.get("clue_hunts"))
	for t: String in TIERS:
		if all.has(t):
			out.append([t, all[t]])
	return out


## Is this dig site the open last step of a hunt in hand?
static func dig_open(prof: Dictionary, site_id: String) -> String:
	for th: Array in hunts(prof):
		var s: Dictionary = current(prof, th[0])
		if s.get("kind") == "dig" and s.get("site") == site_id:
			return th[0]
	return ""


## Where a regular is now (they drift round their mooring).
## (As the Sea moors them: Sea._moor_regulars and Wanderer.)
static func folk_at(folk_id: String, now: float) -> Vector2:
	for m: Dictionary in Js.list(Rules.data()["regulars"].get("moorings")):
		if m.get("folkId") != folk_id:
			continue
		var info: Dictionary = Traders.yoon() if folk_id == "yoon" else {
			"x": m["x"], "y": m["y"], "driftR": Chart.drift_r(Vector2(float(m["x"]), float(m["y"])), m["zoneId"]) / 0.6,
			"driftRate": m["driftRate"], "driftPhase": m["driftPhase"] }
		var d: Dictionary = Folk.drift_pos(float(info["x"]), float(info["y"]), float(info["driftR"]), float(info["driftRate"]), float(info["driftPhase"]), now / 1000.0)
		return Vector2(float(d["x"]), float(d["y"]))
	return Vector2.INF


## Search, ask or dig where she is, for this tier's hunt.
static func search(db: CaptainStore, uid: String, tier: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var s: Dictionary = current(p, tier)
	if s.is_empty():
		return { "ok": false, "error": "You carry no %s." % TIER_NAME[tier] }
	var here: Vector2 = Vector2(Js.num(p.get("sea_x")), Js.num(p.get("sea_y")))
	match s["kind"]:
		"bearing", "dig":
			if here.distance_to(Vector2(float(s["x"]), float(s["y"]))) > SEARCH_RANGE * 1.6:
				return { "ok": false, "error": "Nothing here. The clue points somewhere else." }
		"riddle":
			if here.distance_to(Vector2(float(s["x"]), float(s["y"]))) > float(s["r"]) + SEARCH_RANGE * 1.6:
				return { "ok": false, "error": "Nothing here. The clue points somewhere else." }
		"speak":
			var at: Vector2 = folk_at(str(s["folk"]), Clock.now_ms())
			if at == Vector2.INF or here.distance_to(at) > SPEAK_RANGE * 1.6:
				return { "ok": false, "error": "They are not here." }
		_:
			return { "ok": false, "error": "This step is not found by searching." }
	return advance(db, uid, tier)


## A catch: does it answer a hunt's step?
static func on_catch(db: CaptainStore, uid: String, fish_id: float) -> Array:
	var out: Array = []
	if not on():
		return out
	var p: Dictionary = db.me(uid)
	for th: Array in hunts(p):
		var s: Dictionary = current(p, th[0])
		if s.get("kind") == "catch" and float(s["fish"]) == fish_id:
			out.append(advance(db, uid, th[0]))
	return out


## The step done: the next, or the casket.
static func advance(db: CaptainStore, uid: String, tier: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var all: Dictionary = Js.obj(p.get("clue_hunts")).duplicate(true)
	var h: Dictionary = all[tier]
	var steps: Array = h["steps"]
	var done: Dictionary = steps[int(h["step"])]
	if done["kind"] != "dig":
		h["step"] = int(h["step"]) + 1
		all[tier] = h
		db.update_profile(uid, { "clue_hunts": all })
		return { "ok": true, "tier": tier, "next": steps[int(h["step"])], "stepNo": int(h["step"]) + 1, "of": steps.size() }
	all.erase(tier)
	var by: Dictionary = Js.obj(p.get("clues_by_tier")).duplicate()
	by[tier] = Js.num(by.get(tier)) + 1.0
	db.update_profile(uid, { "clue_hunts": all, "clues_by_tier": by, "clues_done": Js.num(p.get("clues_done")) + 1.0 })
	var casket: Dictionary = open_casket(db, uid, tier)
	casket["ok"] = true
	casket["tier"] = tier
	casket["done"] = true
	return casket


## The casket: rolled on the rules' dice from port_rules clues.rewards.
static func open_casket(db: CaptainStore, uid: String, tier: String) -> Dictionary:
	var r: Dictionary = Js.obj(Js.obj(cfg().get("rewards")).get(tier))
	var out: Dictionary = { "doubloons": 0.0, "bait": {}, "crates": {} }
	var dr: Array = Js.list(r.get("doubloons"))
	if dr.size() == 2:
		var d: float = floor(lerpf(float(dr[0]), float(dr[1]), Dice.next()) / 10.0) * 10.0
		out["doubloons"] = d
		db.grant(uid, "doubloons", d)
		db.ledger(uid, d, "Treasure hunt (%s)" % tier)
	var bait: Dictionary = Js.obj(r.get("bait"))
	for t: Variant in bait:
		var q: Array = bait[t]
		var n: int = int(floor(lerpf(float(q[0]), float(q[1]) + 0.999, Dice.next())))
		if n > 0:
			db.add_bait(uid, str(t), float(n))
			out["bait"][t] = float(n)
	if Dice.next() < float(r.get("crateChance", 0.0)):
		var weights: Dictionary = Js.obj(r.get("crates"))
		var total: float = 0.0
		for k: Variant in weights:
			total += float(weights[k])
		var cn: Array = Js.list(r.get("crateCount"))
		var count: int = 1 if cn.size() != 2 else int(floor(lerpf(float(cn[0]), float(cn[1]) + 0.999, Dice.next())))
		var stash: Dictionary = Js.obj(db.me(uid).get("crate_stash")).duplicate()
		for i: int in count:
			var roll: float = Dice.next() * total
			for k: Variant in weights:
				roll -= float(weights[k])
				if roll < 0.0:
					stash[k] = Js.num(stash.get(k)) + 1.0
					out["crates"][k] = Js.num((out["crates"] as Dictionary).get(k)) + 1.0
					break
		db.update_profile(uid, { "crate_stash": stash })
	return out
