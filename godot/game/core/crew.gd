class_name Crew
extends RefCounted
## THE CREW HALL, SLICE 1: the recruit board, signing on, the roster, the
## hall's tiers, dismissing and naming. A port of lib/core/crew.ts
## (getCrewState, recruitCrew, upgradeCrewHall, dismissCrew, renameCrew) over
## the save's crew, recruits and bunks (lib/data/local/crewLocal), with the
## rolls of lib/crewRules and lib/crewGen and the tables the rules export
## (rules.json "crew"). Bunks, seats, skins and promotions come later.
##
## The state returned is the web's CrewState cut to what the port has: the
## board, the roster, the roster's capacity, the hall's tier, the purse and
## the Navigation level (the parity session takes the same cut).
##
## PORT RULES (port_rules "crewPort", never under the parity run):
##   - boardEveryMs / boardOffsetMs: a fresh free board every sea day, at
##     sunrise (Kong, 2026-10-02: "crew should refresh based on in-game days"),
##     rather than once a real day;
##   - navFromFishing: the Navigation the hall reads (roster capacity, the
##     hall's gates) is the Fishing level until Navigation is earned in the
##     port (Kong, 2026-10-01: "focus on Fishing for now").

static var _cards: Array = []


static func t() -> Dictionary:
	return Rules.data()["crew"]


static func port() -> Dictionary:
	return Js.obj(Rules.data().get("crewPort")) if not Rules.web_only else {}


## content/cards.json, the crew species (game content, not save data).
static func cards() -> Array:
	if _cards.is_empty():
		_cards = JsJson.parse(FileAccess.get_file_as_string("res://content/cards.json"))
	return _cards


static func card(id: float) -> Dictionary:
	for c: Dictionary in cards():
		if float(c["id"]) == id:
			return c
	return {}


## crewDisplayName: the species' crew nickname, else its catalogue name.
static func display_name(slug: String, fallback: String) -> String:
	return str(Js.obj(t().get("names")).get(slug.to_lower(), fallback))


## groupForSlug: 1 common .. 4 legendary, or 0 for no crew fish.
static func group_for(slug: String) -> int:
	var groups: Array = t()["groups"]
	for i: int in groups.size():
		if (groups[i] as Array).has(slug.to_lower()):
			return i + 1
	return 0


static func legendary_locked(slug: String, unlocks: Array) -> bool:
	var s: String = slug.to_lower()
	if (t()["alwaysUnlocked"] as Array).has(s):
		return false
	if not Js.obj(t().get("legendaryGate")).has(s):
		return false
	for u: Variant in unlocks:
		if str(u).to_lower() == s:
			return false
	return true


## crewLevelFromXP.
static func level(xp: float) -> int:
	var tb: Array = t()["xpTable"]
	var mx: int = int(t()["maxLevel"])
	if xp >= float(tb[mx - 1]):
		return mx
	for lv: int in range(mx - 1, 0, -1):
		if xp >= float(tb[lv]):
			return lv + 1
	return 1


static func class_of(slug: String) -> Dictionary:
	var id: Variant = Js.obj(t().get("classBySlug")).get(slug.to_lower())
	return Js.obj(Js.obj(t().get("classes")).get(id)) if id != null else {}


## traitLabel of a crew's net trait (exported over the whole -4..4 cube).
static func trait_label(effects: Array) -> String:
	var p: int = 0
	var d: int = 0
	var f: int = 0
	for e: Variant in effects:
		var s: String = str(e)
		if s.begins_with("s:"):
			var parts: PackedStringArray = s.substr(2).split(",")
			if parts.size() == 3:
				p += int(parts[0])
				d += int(parts[1])
				f += int(parts[2])
	return str(Js.obj(t().get("traitLabels")).get("%d,%d,%d" % [clampi(p, -4, 4), clampi(d, -4, 4), clampi(f, -4, 4)], ""))


# ── The hall and the roster's size (lib/crewHall, lib/crewCapacity) ─────────

static func clamp_hall(tier: Variant) -> int:
	return clampi(int(floor(Js.num(Js.nz(tier, 1.0)))), 1, 6)


static func hall_def(tier: Variant) -> Dictionary:
	return (t()["hallTiers"] as Array)[clamp_hall(tier) - 1]


static func next_hall(tier: Variant) -> Dictionary:
	var cur: int = clamp_hall(tier)
	return {} if cur >= 6 else (t()["hallTiers"] as Array)[cur]


static func capacity(nav_level: int, hall_tier: Variant) -> int:
	var c: Dictionary = t()["capacity"]
	return int(c["base"]) + int(floor(float(nav_level) / float(c["perLevels"]))) + (clamp_hall(hall_tier) - 1) * int(c["perHallTier"])


## The Navigation level the hall reads (a port rule may read Fishing instead).
static func nav_level(p: Dictionary) -> int:
	if port().get("navFromFishing") == true:
		return Rules.level_from_xp(Js.num(p.get("fishing_xp")))
	return Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))


# ── The rolls (lib/crewGen, lib/crewRules) ──────────────────────────────────

static func _rand_int(lo: int, hi: int) -> int:
	return lo + int(floor(Dice.next() * float(hi - lo + 1)))


static func roll_rarity(w: Array) -> int:
	var total: float = float(w[0]) + float(w[1]) + float(w[2]) + float(w[3])
	var r: float = Dice.next() * total
	for i: int in 4:
		if r < float(w[i]):
			return i + 1
		r -= float(w[i])
	return 1


static func roll_stats(rarity: int, prof: Dictionary) -> Dictionary:
	var band: Array = Js.obj(t().get("statBudget"))[str(rarity)]
	var budget: int = _rand_int(int(band[0]), int(band[1]))
	var stats: Array = [1, 1, 1]
	var remaining: int = maxi(0, budget - 3)
	var pr: Array = [maxf(0.5, float(prof["power"])), maxf(0.5, float(prof["dodge"])), maxf(0.5, float(prof["fortune"]))]
	var w: Array = []
	for v: float in pr:
		w.append(v * (0.85 + Dice.next() * 0.3))
	var sum_w: float = float(w[0]) + float(w[1]) + float(w[2])
	var assigned: int = 0
	for i: int in 3:
		var a: int = int(Js.round(float(remaining) * float(w[i]) / sum_w))
		stats[i] = int(stats[i]) + a
		assigned += a
	var primary: int = 0 if (float(w[0]) >= float(w[1]) and float(w[0]) >= float(w[2])) else (1 if float(w[1]) >= float(w[2]) else 2)
	stats[primary] = int(stats[primary]) + remaining - assigned
	if int(stats[primary]) < 1:
		stats[primary] = 1
	return { "power": float(stats[0]), "dodge": float(stats[1]), "fortune": float(stats[2]) }


static func _magnitude(rarity: int) -> int:
	var w: Array = Js.obj(t().get("magWeights"))[str(rarity)]
	var total: float = 0.0
	for n: Variant in w:
		total += float(n)
	var r: float = Dice.next() * total
	for i: int in w.size():
		if r < float(w[i]):
			return i
		r -= float(w[i])
	return 0


## rollTrait (the recruit board's weighted roll; the deep draw is slice 2).
static func roll_trait(rarity: int) -> Array:
	var out: Array = []
	for k: int in 3:
		var m: int = _magnitude(rarity)
		var sign: int = -1 if Dice.next() < 0.5 else 1
		out.append(m * sign)
	return out


static func encode_trait(tr: Array) -> Variant:
	if int(tr[0]) == 0 and int(tr[1]) == 0 and int(tr[2]) == 0:
		return null
	return "s:%d,%d,%d" % [int(tr[0]), int(tr[1]), int(tr[2])]


## cardPools: the catalogue as portrait pools by group.
static func pools() -> Dictionary:
	var by: Dictionary = { 1: [], 2: [], 3: [], 4: [] }
	for c: Dictionary in cards():
		var g: int = group_for(str(c["slug"]))
		if g > 0:
			(by[g] as Array).append(float(c["id"]))
	return by


## rollRecruitBoard (no gifted legendary on a free board).
static func roll_board(size: int, weights: Array, unlocks: Array) -> Array:
	var by: Dictionary = pools()
	var group4: Array = (by[4] as Array).filter(func(id: float) -> bool: return not legendary_locked(str(card(id).get("slug", "")), unlocks))
	var pool_for: Callable = func(r: int) -> Array: return group4 if r == 4 else by[r]
	var out: Array = []
	for slot: int in size:
		var rarity: int = roll_rarity(weights)
		while (pool_for.call(rarity) as Array).is_empty() and rarity > 1:
			rarity -= 1
		var pool: Array = pool_for.call(rarity)
		if pool.is_empty():
			continue
		var card_id: float = pool[int(floor(Dice.next() * pool.size()))]
		var m: Dictionary = card(card_id)
		var stats: Dictionary = roll_stats(rarity, { "power": Js.nz(m.get("power"), 1.0), "dodge": Js.nz(m.get("dodge"), 1.0), "fortune": Js.nz(m.get("fortune"), 1.0) })
		var tid: Variant = encode_trait(roll_trait(rarity))
		out.append({ "cardId": card_id, "rarity": float(rarity), "power": stats["power"], "dodge": stats["dodge"], "fortune": stats["fortune"], "effects": [tid] if tid != null else [] })
	return out


# ── The free board ──────────────────────────────────────────────────────────

## The board's key now: the UTC date (the web), or the stretch of sea days
## it belongs to (port rules).
static func board_key(now: float) -> String:
	var every: float = Js.num(port().get("boardEveryMs"))
	if every > 0.0:
		# A fresh board each sea day, at sunrise (boardOffsetMs), as the
		# market's prices change.
		return "sea:%d" % int(floor((now - Js.num(port().get("boardOffsetMs"))) / every))
	return Js.iso(now).left(10)


static func _fill_free_board(db: CaptainStore, uid: String, prev: Variant) -> void:
	var today: String = board_key(Clock.now_ms())
	if prev != null and str(prev) == today:
		return
	var prof: Dictionary = db.me(uid)
	if str(Js.nz(prof.get("last_free_recruit_date"), "")) != str(Js.nz(prev, "")):
		return
	prof["last_free_recruit_date"] = today
	var rows: Array = roll_board(int(t()["dailyRecruits"]), t()["freeWeights"], Js.list(prof.get("legendary_unlocks")))
	var recs: Array = []
	for slot: int in rows.size():
		var r: Dictionary = rows[slot]
		recs.append({ "id": db.next_id(), "slot": float(slot), "source": "free", "card_id": r["cardId"], "rarity": r["rarity"],
			"power": r["power"], "dodge": r["dodge"], "fortune": r["fortune"], "effects": r["effects"], "recruited": false, "start_xp": 0.0 })
	db.save["recruits"] = recs


# ── The state ───────────────────────────────────────────────────────────────

static func _candidate(r: Dictionary) -> Dictionary:
	var m: Dictionary = card(float(r["card_id"]))
	return {
		"id": r["id"], "slot": r["slot"], "source": r["source"], "cardId": r["card_id"],
		"name": display_name(str(m.get("slug", "")), str(m.get("name", ""))) if not m.is_empty() else "Unknown",
		"filename": str(m.get("filename", "")), "slug": str(m.get("slug", "")).to_lower(),
		"rarity": r["rarity"], "power": r["power"], "dodge": r["dodge"], "fortune": r["fortune"],
		"effects": Js.list(r.get("effects")), "recruited": r["recruited"], "startXp": Js.nz(r.get("start_xp"), 0.0),
	}


static func _member(c: Dictionary) -> Dictionary:
	var m: Dictionary = card(float(c["card_id"]))
	var nick: Variant = c.get("nickname")
	return {
		"id": c["id"], "cardId": c["card_id"],
		"name": nick if nick != null else (display_name(str(m.get("slug", "")), str(m.get("name", ""))) if not m.is_empty() else "Unknown"),
		"nickname": nick, "filename": str(m.get("filename", "")), "baseFilename": str(m.get("filename", "")),
		"slug": str(m.get("slug", "")).to_lower(),
		"rarity": c["rarity"], "power": c["power"], "dodge": c["dodge"], "fortune": c["fortune"],
		"effects": Js.list(c.get("effects")), "pendingTrait": c.get("pending_trait"),
		"voyageSlot": c.get("voyage_slot"), "raidSlot": c.get("raid_slot"), "xp": Js.nz(c.get("xp"), 0.0),
	}


static func live(db: CaptainStore) -> Array:
	return Js.list(db.save.get("crew")).filter(func(c: Dictionary) -> bool: return c.get("died_at") == null)


## getCrewState, cut to the port's fields; fills the free board when stale.
static func state(db: CaptainStore, uid: String) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	_fill_free_board(db, uid, prof.get("last_free_recruit_date"))
	var nav: int = nav_level(prof)
	var board: Array = Js.list(db.save.get("recruits")).duplicate()
	board.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["slot"]) < float(b["slot"]))
	var rows: Array = live(db).duplicate()
	# The store's order (newest first), then rosterSort: level, rarity, XP.
	rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var la: int = level(Js.num(a.get("xp")))
		var lb: int = level(Js.num(b.get("xp")))
		if la != lb:
			return la > lb
		if float(a["rarity"]) != float(b["rarity"]):
			return float(a["rarity"]) > float(b["rarity"])
		if Js.num(a.get("xp")) != Js.num(b.get("xp")):
			return Js.num(a.get("xp")) > Js.num(b.get("xp"))
		if str(a["recruited_at"]) != str(b["recruited_at"]):
			return str(a["recruited_at"]) > str(b["recruited_at"])
		return float(a["id"]) > float(b["id"]))
	return {
		"board": board.map(func(r: Dictionary) -> Dictionary: return _candidate(r)),
		"roster": rows.map(func(c: Dictionary) -> Dictionary: return _member(c)),
		"capacity": float(capacity(nav, prof.get("crew_hall_tier"))),
		"navLevel": float(nav),
		"hallTier": float(clamp_hall(prof.get("crew_hall_tier"))),
		"doubloons": Js.nz(prof.get("doubloons"), 0.0),
	}


static func _after(db: CaptainStore, uid: String) -> Dictionary:
	return { "state": state(db, uid) }


## recruitCrew: claim the candidate first; a full roster hands it back.
static func recruit(db: CaptainStore, uid: String, recruit_id: float) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var cap: int = capacity(nav_level(prof), prof.get("crew_hall_tier"))
	var rec: Dictionary = {}
	for r: Dictionary in Js.list(db.save.get("recruits")):
		if float(r["id"]) == recruit_id:
			rec = r
	if rec.is_empty() or rec["recruited"] == true:
		return { "error": "Already recruited" if not rec.is_empty() else "Recruit not found" }
	rec["recruited"] = true
	if live(db).size() >= cap:
		rec["recruited"] = false
		return { "error": "Roster full" }
	(db.save["crew"] as Array).append({
		"id": db.next_id(), "card_id": rec["card_id"], "rarity": rec["rarity"], "power": rec["power"], "dodge": rec["dodge"],
		"fortune": rec["fortune"], "effects": Js.list(rec.get("effects")).duplicate(), "pending_trait": null,
		"voyage_slot": null, "raid_slot": null, "xp": Js.nz(rec.get("start_xp"), 0.0), "nickname": null,
		"recruited_at": Js.iso(Clock.now_ms()), "died_at": null, "died_on_voyage_id": null, "died_hardcore_depth": null,
	})
	db.bump_stat(uid, "lifetime_recruits", 1.0)
	return _after(db, uid)


## upgradeCrewHall: the next tier, behind its Navigation gate and its price.
static func upgrade_hall(db: CaptainStore, uid: String) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var cur: int = clamp_hall(prof.get("crew_hall_tier"))
	var nxt: Dictionary = next_hall(cur)
	if nxt.is_empty():
		return { "error": "Crew Hall is fully upgraded" }
	var purse: float = Js.nz(prof.get("doubloons"), 0.0)
	if nav_level(prof) < int(nxt["minNav"]):
		return { "error": "Reach Navigation %d first." % int(nxt["minNav"]) if port().get("navFromFishing") != true else "Reach Fishing %d first." % int(nxt["minNav"]) }
	if purse < float(nxt["cost"]):
		return { "error": "Not enough doubloons" }
	if db.deduct_doubloons(uid, float(nxt["cost"])) == null:
		return { "error": "Not enough doubloons" }
	prof["crew_hall_tier"] = float(nxt["tier"])
	return _after(db, uid)


## dismissCrew, behind assertCanReassign (a voyage, a trawl, a bunk hold one).
static func dismiss(db: CaptainStore, uid: String, crew_id: float) -> Dictionary:
	var c: Dictionary = {}
	for x: Dictionary in live(db):
		if float(x["id"]) == crew_id:
			c = x
	if c.is_empty():
		return { "error": "Crew not found" }
	if c.get("voyage_slot") != null:
		for v: Dictionary in Js.list(db.save.get("voyages")):
			if v.get("status") == "pending" and Js.list(v.get("crew_variant_ids")).has(crew_id):
				return { "error": "This crew is at sea right now. Wait for their voyage to return." }
	for tr: Dictionary in Js.list(db.save.get("trawls")):
		if float(tr["crew_id"]) == crew_id:
			return { "error": "This crew is out on a trawl. Collect it first to free them up." }
	for b: Dictionary in Js.list(db.save.get("bunks")):
		if float(b["crew_id"]) == crew_id:
			return { "error": "This crew is training in the hall. Their stint has to finish first." }
	db.save["crew"] = (db.save["crew"] as Array).filter(func(x: Dictionary) -> bool: return not (float(x["id"]) == crew_id and x.get("died_at") == null))
	return _after(db, uid)


## renameCrew: once, 1 to 30 characters.
static func rename(db: CaptainStore, uid: String, crew_id: float, nickname: String) -> Dictionary:
	var clean: String = nickname.strip_edges()
	if clean.length() < 1:
		return { "error": "Pick a name first." }
	if clean.length() > 30:
		return { "error": "Name must be 30 characters or fewer." }
	for c: Dictionary in live(db):
		if float(c["id"]) == crew_id:
			if c.get("nickname") != null:
				return { "error": "This crew has already been named." }
			c["nickname"] = clean
			return _after(db, uid)
	return { "error": "Crew not found" }
