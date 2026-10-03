class_name Bunks
extends RefCounted
## THE CREW HALL, SLICE 2: the bunks, Drills and Stores, the Leviathan bunk and
## the promotions. A port of lib/crewBunks, lib/crewBunkSettle, lib/crewRules'
## stints and offers, lib/crewTraits' deep table and lib/core/crew.ts's
## bunkCrew, collectBunk, resolveTraitOffer, buyHallUpgrade and
## checkPromotions, over the save's bunks (crewLocal). Parity:
## tests/parity/crew.json "the hall bunks".
##
## A benched hand takes a bunk and is LOCKED there for a whole stint (the
## Stores tier sets how long); collecting pays the whole stint (rate x hours,
## Drills sets the rate) and frees the bunk. The hall's tier is how many bunks
## there are. The sixth (Leviathan) bunk draws a whole new trait from a flat
## table of 28 at the end of each stint and OFFERS it: keep yours or take it.
## A crew's Special steps up at Lv 10, 25, 40, 75 and 100: each is a
## promotion, the one levelling moment that gets a card of its own.

const NEUTRAL_OFFER: String = "s:0,0,0"
const TIER: Array = ["I", "II", "III", "IV", "V", "VI"]


static func b() -> Dictionary:
	return Crew.t()["bunks"]


static func rate_per_hour(drill: Variant) -> float:
	return float(b()["ratePerHour"][clampi(int(floor(Js.num(Js.nz(drill, 1.0)))), 1, 6) - 1])


static func cap_hours(stores: Variant) -> float:
	return float(b()["capHours"][clampi(int(floor(Js.num(Js.nz(stores, 1.0)))), 1, 6) - 1])


static func is_leviathan(slot: Variant) -> bool:
	return slot != null and int(Js.num(slot)) == int(b()["leviathanSlot"]) and float(Js.num(slot)) == floor(Js.num(slot))


## canBunk: an ordinary bunk pays XP (a hand at the ceiling has nothing to
## gain); the Leviathan bunk pays a re-cut, and a maxed hand is who wants one.
static func can_bunk(xp: float, slot: Variant = null) -> bool:
	if is_leviathan(slot):
		return true
	return Crew.level(xp) < int(Crew.t()["maxLevel"])


static func ms_until_done(since: Variant, now: float, cap: float) -> float:
	var start: float = Js.parse_ms(since)
	if is_nan(start):
		return 0.0
	var full: float = cap * 3600000.0
	return minf(full, maxf(0.0, start + full - now))


static func stint_done(since: Variant, now: float, cap: float) -> bool:
	return ms_until_done(since, now, cap) <= 0.0


static func stint_progress(since: Variant, now: float, cap: float) -> float:
	var start: float = Js.parse_ms(since)
	if is_nan(start) or cap <= 0.0:
		return 0.0
	return clampf((now - start) / (cap * 3600000.0), 0.0, 1.0)


static func _rows(db: CaptainStore) -> Array:
	return Js.list(db.save.get("bunks"))


static func bunk_of(db: CaptainStore, crew_id: float) -> Dictionary:
	for r: Dictionary in _rows(db):
		if float(r["crew_id"]) == crew_id:
			return r
	return {}


## bunkTerms: a row's own rate and length, or the hall's live ones.
static func terms(r: Dictionary, live_rate: float, live_cap: float) -> Dictionary:
	return {
		"rate": Js.num(r["rate_per_hour"]) if r.get("rate_per_hour") != null else live_rate,
		"cap": Js.num(r["cap_hours"]) if r.get("cap_hours") != null else live_cap,
	}


## The state's bunk fields (getCrewState).
static func state_fields(db: CaptainStore, prof: Dictionary) -> Dictionary:
	var live_rate: float = rate_per_hour(prof.get("crew_drill_level"))
	var live_cap: float = cap_hours(prof.get("crew_stores_level"))
	var bunked: Array = []
	var locked: Array = []
	var tm: Dictionary = {}
	var now: float = Clock.now_ms()
	for r: Dictionary in _rows(db):
		bunked.append(r["crew_id"])
		var t: Dictionary = terms(r, live_rate, live_cap)
		tm[Js.key(r["crew_id"])] = { "since": r["since"], "rate": t["rate"], "cap": t["cap"], "slot": r.get("slot") }
		if not stint_done(r["since"], now, Js.num(r["cap_hours"]) if r.get("cap_hours") != null else live_cap):
			locked.append(r["crew_id"])
	return {
		"bunkedCrewIds": bunked, "bunkLockedCrewIds": locked, "bunkTerms": tm,
		"drillLevel": Js.nz(prof.get("crew_drill_level"), 1.0), "storesLevel": Js.nz(prof.get("crew_stores_level"), 1.0),
		"capHours": live_cap,
	}


## The guard dismissal (and, later, seating) runs: a bunk holds a hand until
## its stint is collected.
static func hold_error(db: CaptainStore, prof: Dictionary, crew_id: float) -> String:
	var on: Dictionary = bunk_of(db, crew_id)
	if on.is_empty():
		return ""
	var cap: float = Js.num(on["cap_hours"]) if on.get("cap_hours") != null else cap_hours(prof.get("crew_stores_level"))
	if stint_done(on["since"], Clock.now_ms(), cap):
		return "This crew finished their training. Collect it in the hall to free them up."
	return "This crew is training in the hall. Their stint has to finish first."


# ── bunkCrew ──────────────────────────────────────────────────────────────────

static func bunk(db: CaptainStore, uid: String, crew_id: float, slot: float, hours: Variant) -> Dictionary:
	var c: Dictionary = {}
	for x: Dictionary in Crew.live(db):
		if float(x["id"]) == crew_id:
			c = x
	if c.is_empty():
		return { "error": "Crew not found" }
	if c.get("pending_trait") != null:
		return { "error": "They are still holding a draw. Answer it first." }
	if c.get("voyage_slot") != null or c.get("raid_slot") != null:
		return { "error": "Take them out of their party first." }
	if not can_bunk(Js.num(c.get("xp")), slot):
		return { "error": "They are fully trained. Send them to the Leviathan bunk, or bunk a hand who can still learn." }
	for tr: Dictionary in Js.list(db.save.get("trawls")):
		if float(tr["crew_id"]) == crew_id:
			return { "error": "They are out on a trawl. Collect it first." }
	var prof: Dictionary = db.me(uid)
	var slots: int = int(Crew.hall_def(prof.get("crew_hall_tier"))["bunks"])
	var rows: Array = _rows(db)
	if rows.any(func(r: Dictionary) -> bool: return float(r["crew_id"]) == crew_id):
		return { "error": "They already have a bunk." }
	if rows.size() >= slots:
		return { "error": "Every bunk is taken. Build another." }
	var want: int = int(floor(slot))
	if want < 0 or want >= slots:
		return { "error": "That bunk is not open yet." }
	if rows.any(func(r: Dictionary) -> bool: return r.get("slot") != null and int(Js.num(r["slot"])) == want):
		return { "error": "That bunk is taken." }
	var cap: float = cap_hours(prof.get("crew_stores_level"))
	var stint: float = cap
	if is_leviathan(float(want)) and hours != null and not is_nan(Js.num(hours)):
		stint = maxf(1.0, minf(cap, floor(Js.num(hours))))
	if not db.save.has("bunks"):
		db.save["bunks"] = []
	(db.save["bunks"] as Array).append({ "id": db.next_id(), "since": Js.iso(Clock.now_ms()), "crew_id": crew_id, "slot": float(want), "rate_per_hour": rate_per_hour(prof.get("crew_drill_level")), "cap_hours": stint })
	return Crew._after(db, uid)


# ── collectBunk ───────────────────────────────────────────────────────────────

## Collect ONE hand's finished stint (nothing while it runs): the XP, the
## bunk back, and the Leviathan's offer if it was the deep bunk.
static func collect(db: CaptainStore, uid: String, crew_id: float) -> Dictionary:
	var out: Dictionary = { "grants": [], "freed": [], "upgrades": [] }
	var row: Dictionary = bunk_of(db, crew_id)
	if not row.is_empty():
		var prof: Dictionary = db.me(uid)
		var t: Dictionary = terms(row, rate_per_hour(prof.get("crew_drill_level")), cap_hours(prof.get("crew_stores_level")))
		if stint_done(row["since"], Clock.now_ms(), t["cap"]):
			(db.save["bunks"] as Array).erase(row)
			var c: Dictionary = {}
			for x: Dictionary in db.save["crew"]:
				if float(x["id"]) == crew_id:
					c = x
			if not c.is_empty() and can_bunk(Js.num(c.get("xp"))):
				var xp: float = floor(float(t["rate"]) * float(t["cap"]))
				if xp > 0.0 and c.get("died_at") == null:
					var old: float = Js.num(c.get("xp"))
					c["xp"] = old + xp
					out["grants"] = [{ "id": c["id"], "name": c["nickname"] if c.get("nickname") != null else Crew.display_name(str(Crew.card(float(c["card_id"])).get("slug", "")), str(Crew.card(float(c["card_id"])).get("name", "Crew"))),
						"oldXP": old, "newXP": old + xp, "oldLevel": float(Crew.level(old)), "newLevel": float(Crew.level(old + xp)) }]
			out["freed"] = [row["crew_id"]]
			if is_leviathan(row.get("slot")) and not c.is_empty():
				var offer: Dictionary = _offer(c)
				if not offer.is_empty() and c.get("pending_trait") == null:
					c["pending_trait"] = offer["parked"]
					out["upgrades"] = [offer["upgrade"]]
	out["state"] = Crew.state(db, uid)
	return out


## THE LEVIATHAN RE-CUT: a whole trait drawn flat from the deep table and
## parked as an offer (never over an offer already open).
static func _offer(c: Dictionary) -> Dictionary:
	if c.get("pending_trait") != null:
		return {}
	var before: Array = net_trait(Js.list(c.get("effects")))
	var table: Array = b()["deepTraits"]
	var d: Dictionary = table[int(floor(Dice.next() * table.size()))]
	var rolled: Array = [float(d["power"]), float(d["dodge"]), float(d["fortune"])]
	var parked: Variant = Crew.encode_trait(rolled)
	var bl: String = _label(before)
	var al: String = _label(rolled)
	return {
		"parked": parked if parked != null else NEUTRAL_OFFER,
		"upgrade": {
			"crewId": c["id"],
			"before": { "power": before[0], "dodge": before[1], "fortune": before[2] },
			"after": { "power": rolled[0], "dodge": rolled[1], "fortune": rolled[2] },
			"gained": { "power": rolled[0] > before[0], "dodge": rolled[1] > before[1], "fortune": rolled[2] > before[2] },
			"beforeLabel": bl if bl != "" else "No trait",
			"afterLabel": al if al != "" else "No trait",
			"pending": true,
		},
	}


static func net_trait(effects: Array) -> Array:
	var out: Array = [0.0, 0.0, 0.0]
	for e: Variant in effects:
		var s: String = str(e)
		if s.begins_with("s:"):
			var parts: PackedStringArray = s.substr(2).split(",")
			if parts.size() == 3:
				for k: int in 3:
					out[k] = float(out[k]) + float(parts[k].to_int())
	return out


static func _label(t: Array) -> String:
	return str(Js.obj(Crew.t().get("traitLabels")).get("%d,%d,%d" % [int(t[0]), int(t[1]), int(t[2])], ""))


# ── resolveTraitOffer ─────────────────────────────────────────────────────────

static func answer(db: CaptainStore, uid: String, crew_id: float, accept: bool) -> Dictionary:
	var c: Dictionary = {}
	for x: Dictionary in Crew.live(db):
		if float(x["id"]) == crew_id:
			c = x
	if c.is_empty():
		return { "error": "Crew not found" }
	var offer: Variant = c.get("pending_trait")
	if offer == null:
		return { "error": "No offer to answer." }
	if accept:
		c["effects"] = [] if offer == NEUTRAL_OFFER else [offer]
	c["pending_trait"] = null
	return Crew._after(db, uid)


# ── buyHallUpgrade: Drills (XP an hour) and Stores (a stint's hours) ──────────

static func buy(db: CaptainStore, uid: String, kind: String) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var drill: bool = kind == "drill"
	var from: int = int(Js.nz(prof.get("crew_drill_level" if drill else "crew_stores_level"), 1.0))
	if from >= 6:
		return { "error": "The drills are as sharp as they get." if drill else "Stores are already full." }
	if Crew.clamp_hall(prof.get("crew_hall_tier")) < maxi(1, from + 1):
		return { "error": "Upgrade the hall to tier %d first." % maxi(1, from + 1) }
	var cost: float = float((b()["drillCost"] if drill else b()["storesCost"])[maxi(1, from) - 1])
	if cost <= 0.0:
		return { "error": "Nothing left to buy." }
	if Js.num(prof.get("doubloons")) < cost or db.spend(uid, "doubloons", cost) == null:
		return { "error": "Need %s ⟡" % Js.thousands(cost) }
	prof["crew_drill_level" if drill else "crew_stores_level"] = float(from + 1)
	db.ledger(uid, -cost, "Crew Hall: %s %s" % ["Drill" if drill else "Stores", TIER[from]])
	return Crew._after(db, uid)


# ── checkPromotions ───────────────────────────────────────────────────────────

## The crew who crossed a milestone (Lv 10, 25, 40, 75, 100) since last
## looked; the first look marks everything already reached as seen.
static func promotions(db: CaptainStore, uid: String) -> Array:
	var prof: Dictionary = db.me(uid)
	var seen_col: Variant = prof.get("seen_promotions")
	var seen: Array = Js.list(seen_col)
	var levels: Array = (b()["milestoneLevels"] as Array).map(func(l: Variant) -> int: return int(l))
	var steps: Array = levels.filter(func(l: Variant) -> bool: return int(l) > 1)
	var out: Array = []
	var reached_all: Array = []
	# The store's roster order: newest signed first, then the higher id.
	var rows: Array = Crew.live(db).duplicate()
	rows.sort_custom(func(x: Dictionary, y: Dictionary) -> bool:
		if str(x["recruited_at"]) != str(y["recruited_at"]):
			return str(x["recruited_at"]) > str(y["recruited_at"])
		return float(x["id"]) > float(y["id"]))
	for c: Dictionary in rows:
		var card: Dictionary = Crew.card(float(c["card_id"]))
		var cls: Dictionary = Crew.class_of(str(card.get("slug", "")))
		if card.is_empty() or cls.is_empty():
			continue
		var lv: int = Crew.level(Js.num(c.get("xp")))
		var reached: Array = steps.filter(func(l: Variant) -> bool: return lv >= int(l))
		if reached.is_empty():
			continue
		for l: Variant in reached:
			reached_all.append("%s:%d" % [Js.key(c["id"]), int(l)])
		if seen_col == null:
			continue
		var fresh: Array = reached.filter(func(l: Variant) -> bool: return not seen.has("%s:%d" % [Js.key(c["id"]), int(l)]))
		if fresh.is_empty():
			continue
		var top: int = int(fresh[fresh.size() - 1])
		var idx: int = levels.find(top)
		var ms: Array = cls["milestones"]
		var now_m: Dictionary = {}
		for m: Dictionary in ms:
			if int(m["unlockLevel"]) == top:
				now_m = m
		if now_m.is_empty():
			now_m = ms[mini(idx, ms.size() - 1)]
		var before_level: int = int(levels[maxi(0, levels.find(int(fresh[0])) - 1)])
		var before: Dictionary = {}
		for m: Dictionary in ms:
			if int(m["unlockLevel"]) == before_level:
				before = m
		var fname: String = str(card.get("filename", ""))
		out.append({
			"key": "%s:%d" % [Js.key(c["id"]), top], "crewId": c["id"],
			"name": c["nickname"] if c.get("nickname") != null and str(c["nickname"]) != "" else card["name"],
			"art": "/card-arts/%s.webp" % fname.get_basename() if fname != "" else "",
			"className": cls["name"], "color": cls["color"],
			"tier": TIER[idx] if idx >= 0 and idx < TIER.size() else str(idx + 1),
			"level": float(top),
			"from": before["desc"] if not before.is_empty() and before["desc"] != now_m["desc"] else null,
			"to": now_m["desc"],
		})
	var nxt: Array = seen.duplicate()
	for k: String in reached_all:
		if not nxt.has(k):
			nxt.append(k)
	if seen_col == null or nxt.size() > seen.size():
		db.update_profile(uid, { "seen_promotions": nxt })
	return out
