extends RefCounted
## Part of Gauntlet: the draft (curses, boons, confluences, convergences and
## reprieves), a port of the web's draft rules held to parity. Split out of
## core/gauntlet.gd on 2026-10-10 for size. Callers go through Gauntlet's
## forwarders.

# ══ Curses ════════════════════════════════════════════════════════════════════

static func curse_def(id: String) -> Dictionary:
	for c: Dictionary in Js.list(Gauntlet.t().get("curses")):
		if c["id"] == id:
			return c
	return {}


static func is_curse_depth(d: int, freq: float = 1.0) -> bool:
	var last: int = Gauntlet.CURSE_DEPTHS[Gauntlet.CURSE_DEPTHS.size() - 1]
	if Gauntlet.CURSE_DEPTHS.has(d) or (d > last and (d - last) % Gauntlet.CURSE_INTERVAL == 0):
		return true
	if freq > 1.0 and d > last:
		var tight: int = maxi(2, int(Js.round(Gauntlet.CURSE_INTERVAL / freq)))
		return (d - last) % tight == 0
	if freq > 1.0 and d <= last and d >= Gauntlet.CURSE_DEPTHS[0]:
		return Gauntlet.CURSE_DEPTHS.any(func(x: int) -> bool: return d == x - 1) and d > Gauntlet.CURSE_DEPTHS[0]
	return false


## drawCurse: a fresh curse, or (from depth 13) a deepening of one carried;
## once the pool is spent and the run is past the bend, The Crush.
static func draw_curse(held: Dictionary, d: int, worst: bool, variant: String) -> Dictionary:
	var elig: Array = []
	for c: Dictionary in Js.list(Gauntlet.t().get("curses")):
		if c["id"] == "the_crush" or not Gauntlet.in_pool(c.get("gauntlet"), variant):
			continue
		var nx: int = int(Js.num(held.get(c["id"]))) + 1
		if nx <= Js.list(c["tiers"]).size() and (nx == 1 or d >= Gauntlet.CURSE_TIER2_DEPTH):
			elig.append([c, nx])
	if not elig.is_empty():
		var dr: Array = elig[int(floor(Dice.next() * elig.size()))]
		var c: Dictionary = dr[0]
		var nx: int = mini(Js.list(c["tiers"]).size(), maxi(int(dr[1]), 2)) if worst else int(dr[1])
		return _curse_offer(c, nx)
	if d > Gauntlet.DEEP_BEND_START:
		var crush: Dictionary = curse_def("the_crush")
		var nx2: int = int(Js.num(held.get("the_crush"))) + 1
		if not crush.is_empty() and nx2 <= Js.list(crush["tiers"]).size():
			return _curse_offer(crush, nx2)
	return {}


static func _curse_offer(c: Dictionary, tier: int) -> Dictionary:
	var tr: Dictionary = c["tiers"][tier - 1]
	return {
		"id": c["id"], "name": c["name"], "image": c.get("image"), "flavor": c.get("flavor", ""), "tier": float(tier),
		"desc": tr.get("desc", ""), "detail": tr.get("detail", ""), "effects": Js.list(tr.get("effects")),
		"hpDrainPct": Js.num(tr.get("hpDrainPct")), "silenceCrew": Js.num(tr.get("silenceCrew")), "isUpgrade": tier > 1,
	}


static func curse_effects(held: Dictionary) -> Array:
	var out: Array = []
	for id: String in held:
		var c: Dictionary = curse_def(id)
		var tiers: Array = Js.list(c.get("tiers"))
		var tr: int = int(held[id])
		if tr >= 1 and tr <= tiers.size():
			out += Js.list(Js.obj(tiers[tr - 1]).get("effects"))
	return out


static func curse_hp_drain(held: Dictionary) -> float:
	var a: float = 0.0
	for id: String in held:
		var tiers: Array = Js.list(curse_def(id).get("tiers"))
		var tr: int = int(held[id])
		if tr >= 1 and tr <= tiers.size():
			a += Js.num(Js.obj(tiers[tr - 1]).get("hpDrainPct"))
	return a


static func curse_silence(held: Dictionary) -> int:
	var a: int = 0
	for id: String in held:
		var tiers: Array = Js.list(curse_def(id).get("tiers"))
		var tr: int = int(held[id])
		if tr >= 1 and tr <= tiers.size():
			a += int(Js.num(Js.obj(tiers[tr - 1]).get("silenceCrew")))
	return a


# ══ Boons ═════════════════════════════════════════════════════════════════════

static func boon_def(id: String) -> Dictionary:
	for b: Dictionary in Js.list(Gauntlet.t().get("boons")):
		if b["id"] == id:
			return b
	for b2: Dictionary in Gauntlet.bonds():
		if b2["id"] == id:
			return b2
	return {}


## Every synergy: the web's, then the co-op ones (bond + power; port rules
## battle.gauntlet.bondSynergies, none under the parity run).
static func confluences() -> Array:
	return Js.list(Gauntlet.t().get("confluences")) + Js.list(Js.obj(Battle.cfg().get("gauntlet")).get("bondSynergies"))


static func rarity(b: Dictionary) -> String:
	return str(Js.nz(b.get("rarity"), "common"))


static func is_boon_depth(d: int, freq: float = 1.0) -> bool:
	if d < 2:
		return false
	var m: int = (d - 2) % 5
	if m != 0 and m != 2:
		return false
	return not (freq < 1.0 and m == 2)


## drawBoons: up to n families, each at the next tier this captain can take,
## weighted by rarity (luck lifts the rare ones, a skew crushes them).
static func draw_boons(n: int, owned: Dictionary, luck: float, skew: float, variant: String, banned: Array = []) -> Array:
	var meta: Dictionary = Gauntlet.t()["rarity"]
	var avail: Array = []
	for b: Dictionary in Js.list(Gauntlet.t().get("boons")):
		if not Gauntlet.in_pool(b.get("gauntlet"), variant) or banned.has(b["id"]):
			continue
		var nx: int = int(Js.num(owned.get(b["id"]))) + 1
		if nx <= Js.list(b["tiers"]).size():
			avail.append([b, nx])
	var w: Callable = func(b: Dictionary) -> float:
		var r: String = rarity(b)
		if r == "common":
			return float(meta[r]["weight"])
		return float(meta[r]["weight"]) * luck * (1.0 - clampf(skew, 0.0, 1.0))
	var out: Array = []
	var i: int = 0
	while i < n and not avail.is_empty():
		var tot: float = 0.0
		for x: Array in avail:
			tot += float(w.call(x[0]))
		var r: float = Dice.next() * tot
		var idx: int = 0
		while idx < avail.size() - 1:
			r -= float(w.call(avail[idx][0]))
			if r <= 0.0:
				break
			idx += 1
		var pick: Array = avail.pop_at(idx)
		out.append(boon_offer(pick[0], int(pick[1])))
		i += 1
	return out


static func boon_offer(b: Dictionary, tier: int) -> Dictionary:
	var tr: Dictionary = b["tiers"][tier - 1]
	return {
		"id": b["id"], "name": b["name"], "flavor": b.get("flavor", ""), "rarity": rarity(b), "tier": float(tier),
		"desc": tr.get("desc", ""), "detail": tr.get("detail", ""), "effect": tr.get("effect"), "upgrade": tier > 1, "image": b.get("image"),
	}


static func blood_oath_boon(variant: String) -> String:
	var pool: Array = Js.list(Gauntlet.t().get("boons")).filter(func(b: Dictionary) -> bool:
		return Gauntlet.in_pool(b.get("gauntlet"), variant) and rarity(b) != "legendary" and b["id"] != "manowars_wrath")
	if pool.is_empty():
		return ""
	return str(pool[int(floor(Dice.next() * pool.size()))]["id"])


static func boon_effects(owned: Dictionary) -> Array:
	var out: Array = []
	for b: Dictionary in Js.list(Gauntlet.t().get("boons")) + Gauntlet.bonds():
		var tr: int = int(Js.num(owned.get(b["id"])))
		if tr >= 1:
			out.append(b["tiers"][mini(tr, Js.list(b["tiers"]).size()) - 1]["effect"])
	return out


static func hp_boon_mult(effects: Array, d: int, kills: int) -> float:
	var m: float = 1.0
	for e: Dictionary in effects:
		match str(e.get("kind", "")):
			"maxHpMult":
				m *= float(e["mult"])
			"maxHpPerDepth":
				m *= 1.0 + minf(float(e["max"]), float(e["perDepth"]) * maxi(0, d))
			"maxHpPerKill":
				m *= 1.0 + minf(float(e["max"]), float(e["perKill"]) * maxi(0, kills))
	return m


# ── Confluences and convergences ──────────────────────────────────────────────

static func confluence_def(id: String) -> Dictionary:
	for c: Dictionary in confluences():
		if c["id"] == id:
			return c
	return {}


static func convergence_def(id: String) -> Dictionary:
	for c: Dictionary in Js.list(Gauntlet.t().get("convergences")):
		if c["id"] == id:
			return c
	return {}


static func confluence_level(c: Dictionary, owned: Dictionary) -> int:
	var lo: int = 99
	for r: Dictionary in Js.list(c["requires"]):
		lo = mini(lo, int(Js.num(owned.get(r["boonId"]))))
	if lo < 1:
		return 0
	return mini(lo, Js.list(c["levels"]).size())


static func eligible_confluences(owned: Dictionary, taken: Array, variant: String) -> Array:
	return confluences().filter(func(c: Dictionary) -> bool:
		return Gauntlet.in_pool(c.get("gauntlet"), variant) and not taken.has(c["id"]) and confluence_level(c, owned) >= 1)


static func confluence_hints(offer_id: String, offer_tier: int, owned: Dictionary, taken: Array) -> Array:
	var after: Dictionary = owned.duplicate()
	after[offer_id] = float(maxi(int(Js.num(owned.get(offer_id))), offer_tier))
	var out: Array = []
	for c: Dictionary in confluences():
		if not Js.list(c["requires"]).any(func(r: Dictionary) -> bool: return r["boonId"] == offer_id):
			continue
		var before: int = confluence_level(c, owned)
		var nx: int = confluence_level(c, after)
		if nx < 1:
			continue
		if not taken.has(c["id"]):
			if before < 1:
				out.append({ "id": c["id"], "name": c["name"], "kind": "unlocks", "level": float(nx) })
		elif nx > before:
			out.append({ "id": c["id"], "name": c["name"], "kind": "deepens", "level": float(nx) })
	return out


static func _desc_at(levels: Array, level: int) -> String:
	return str(Js.obj(levels[clampi(level if level > 0 else 1, 1, levels.size()) - 1]).get("desc", ""))


## drawConfluenceOffer: a synergy card for this captain's draft, the pity rule
## guaranteeing one never yet shown.
static func draw_confluence(owned: Dictionary, taken: Array, offered: Array, mult: float, variant: String) -> Dictionary:
	if mult <= 0.0:
		return {}
	var pool: Array = eligible_confluences(owned, taken, variant)
	if pool.is_empty():
		return {}
	var fresh: Array = pool.filter(func(c: Dictionary) -> bool: return not offered.has(c["id"]))
	if not fresh.is_empty() and mult < 1.0 and Dice.next() >= mult:
		return {}
	if fresh.is_empty() and Dice.next() >= Gauntlet.CONFLUENCE_OFFER_CHANCE * mult:
		return {}
	var from: Array = fresh if not fresh.is_empty() else pool
	var c: Dictionary = from[int(floor(Dice.next() * from.size()))]
	var lv: int = confluence_level(c, owned)
	var req: Array = Js.list(c["requires"])
	return {
		"kind": "confluence", "id": c["id"], "name": c["name"], "flavor": c.get("flavor", ""), "level": float(lv),
		"desc": _desc_at(c["levels"], lv), "detail": c.get("detail", ""), "image": c.get("image"),
		"halves": [str(boon_def(req[0]["boonId"]).get("name", req[0]["boonId"])), str(boon_def(req[1]["boonId"]).get("name", req[1]["boonId"]))],
	}


static func confluence_effects(owned: Dictionary, taken: Array) -> Array:
	var out: Array = []
	for c: Dictionary in confluences():
		if not taken.has(c["id"]):
			continue
		var lv: int = confluence_level(c, owned)
		if lv >= 1:
			out += Js.list(c["levels"][lv - 1]["effects"])
	return out


static func convergence_level(cv: Dictionary, owned: Dictionary, taken: Array) -> int:
	var lo: int = 99
	for r: Dictionary in Js.list(cv["requires"]):
		var l: int = 0
		if taken.has(r["confluenceId"]):
			var c: Dictionary = confluence_def(str(r["confluenceId"]))
			l = confluence_level(c, owned) if not c.is_empty() else 0
		lo = mini(lo, l)
	if lo < 1:
		return 0
	return mini(lo, Js.list(cv["levels"]).size())


static func draw_convergence(owned: Dictionary, taken: Array, taken_cv: Array, offered: Array, mult: float, variant: String) -> Dictionary:
	if mult <= 0.0:
		return {}
	var pool: Array = Js.list(Gauntlet.t().get("convergences")).filter(func(cv: Dictionary) -> bool:
		return Gauntlet.in_pool(cv.get("gauntlet"), variant) and not taken_cv.has(cv["id"]) and convergence_level(cv, owned, taken) >= 1)
	if pool.is_empty():
		return {}
	var fresh: Array = pool.filter(func(cv: Dictionary) -> bool: return not offered.has(cv["id"]))
	if not fresh.is_empty() and mult < 1.0 and Dice.next() >= mult:
		return {}
	if fresh.is_empty() and Dice.next() >= Gauntlet.CONVERGENCE_OFFER_CHANCE * mult:
		return {}
	var from: Array = fresh if not fresh.is_empty() else pool
	var cv: Dictionary = from[int(floor(Dice.next() * from.size()))]
	var lv: int = convergence_level(cv, owned, taken)
	var req: Array = Js.list(cv["requires"])
	return {
		"kind": "confluence", "isConvergence": true, "id": cv["id"], "name": cv["name"], "flavor": cv.get("flavor", ""), "level": float(lv),
		"desc": _desc_at(cv["levels"], lv), "detail": cv.get("detail", ""), "image": cv.get("image"),
		"halves": [str(confluence_def(req[0]["confluenceId"]).get("name", "")), str(confluence_def(req[1]["confluenceId"]).get("name", ""))],
	}


static func convergence_effects(owned: Dictionary, taken: Array, taken_cv: Array) -> Array:
	var out: Array = []
	for cv: Dictionary in Js.list(Gauntlet.t().get("convergences")):
		if not taken_cv.has(cv["id"]):
			continue
		var lv: int = convergence_level(cv, owned, taken)
		if lv >= 1:
			out += Js.list(cv["levels"][lv - 1]["effects"])
	return out


# ── Reprieves ─────────────────────────────────────────────────────────────────

static func draw_reprieve(curse_count: int) -> Dictionary:
	var pool: Array = Js.list(Gauntlet.t().get("reprieves")).filter(func(r: Dictionary) -> bool: return r["kind"] != "cleanse" or curse_count > 0)
	return pool[int(floor(Dice.next() * pool.size()))]
