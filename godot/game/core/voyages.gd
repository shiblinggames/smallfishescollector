class_name Voyages
extends RefCounted
## VOYAGES (Godot port of lib/core/voyages.ts, lib/voyageRules.ts,
## lib/voyageRoll.ts and lib/voyageEvents.ts, with the Steam decisions of
## 2026-09-30 in docs/systems/voyages.md): seat a voyage crew, pick a route,
## and they sail for a run of SEA DAYS (Coastal 2, Open 4, Deep 6, Triangle 8,
## Shroud 11; 48 minutes each), shortened a little by Navigation level, the
## crew's Navigation and Swift Sails. ONE event and ONE loot roll, decided as
## they sail: Power sets how it goes (triumph, success, setback), Fortune what
## comes home and how safe the crew are, the route the size of it all. One
## voyage in a hundred is Massive Booty (ten times the coin). On the deeper
## routes one hand may be lost, a single flat roll, Fortune taking it to
## nothing at the route's own Navigation level; Safe Passage removes it.
## Home again: doubloons, Navigation XP, crew XP to the survivors, perhaps a
## lure.
##
## NO GEMS (the port has none). The expedition crate that is to stand in for
## them is not built yet: its chance and table are still to be set.
##
## The tables are content/voyages.json (tools/export_voyages.py). Kept in the
## save as "voyages": [{ id, route, crew_variant_ids, status, events,
## total_doubloons, crew_lost, created_ms, duration_ms }].

const ROUTES: Array = ["coastal", "open", "deep", "triangle", "shroud"]
const SEA_DAYS: Dictionary = { "coastal": 2, "open": 4, "deep": 6, "triangle": 8, "shroud": 11 }
const CREW_MULT: float = 0.8
const MAX_LEVEL_CUT: float = 0.10
const MAX_NAV_CUT: float = 0.10

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://content/voyages.json"))
	return _data


static func route(key: String) -> Dictionary:
	return Js.obj(data()["routes"].get(key))


static func payout(key: String) -> Dictionary:
	return Js.obj(data()["payouts"].get(key))


static func base_ms(key: String) -> float:
	return float(SEA_DAYS.get(key, 4)) * SeaClock.CYCLE_MS


static func _swift(p: Dictionary) -> bool:
	return Gauntlet.owns(p, "swift_sails")


static func _safe(p: Dictionary) -> bool:
	return Gauntlet.owns(p, "safe_voyages")


## computeVoyageDurationMs, then Swift Sails.
static func duration_ms(key: String, nav_level: int, total_nav: float, p: Dictionary) -> float:
	var lvl_cut: float = MAX_LEVEL_CUT * pow(minf(1.0, float(nav_level) / 100.0), 2.0)
	var nav_cut: float = MAX_NAV_CUT * pow(minf(1.0, total_nav / 75.0), 2.0)
	var ms: float = float(Js.round(base_ms(key) * maxf(0.80, 1.0 - (lvl_cut + nav_cut))))
	return float(Js.round(ms * (0.85 if _swift(p) else 1.0)))


static func crew_cap(p: Dictionary) -> int:
	var ship: Dictionary = Js.obj(Js.obj(Rules.data().get("shipCombat")).get(str(int(Js.nz(p.get("ship_tier"), 2.0)))))
	return int(Js.nz(ship.get("crewSlots"), 1.0)) + int(Campaign.class_effects(p.get("ship_classes"))["crewSlots"]) + (1 if p.get("has_sixth_berth") == true else 0)


## The voyage crew: seated hands, captain first, none out on a trawl.
static func party(db: CaptainStore, uid: String) -> Array:
	var cap: int = crew_cap(db.me(uid))
	var trawling: Array = Js.list(db.save.get("trawls")).map(func(t: Dictionary) -> float: return float(t["crew_id"]))
	var seated: Array = Crew.live(db).filter(func(c: Dictionary) -> bool:
		return c.get("voyage_slot") != null and float(c["voyage_slot"]) < float(cap) and not trawling.has(float(c["id"])))
	seated.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["voyage_slot"]) < float(b["voyage_slot"]))
	return seated


## A hand as a voyager: their levelled stats with trait, and their name.
static func hand(c: Dictionary) -> Dictionary:
	var st: Dictionary = Crew.leveled_stats(c)
	var card: Dictionary = Crew.card(float(c["card_id"]))
	return {
		"id": float(c["id"]), "name": str(Js.nz(c.get("nickname"), Crew.display_name(str(card.get("slug", "")), str(card.get("name", "Crew"))))),
		"filename": str(card.get("filename", "")), "power": float(st["power"]), "dodge": float(st["dodge"]), "fortune": float(st["fortune"]),
		"level": Crew.level(Js.num(c.get("xp"))),
	}


## The crew's weighted totals (the captain at full, the rest at 80%).
static func totals(hands: Array) -> Dictionary:
	var t: Dictionary = { "power": 0.0, "dodge": 0.0, "fortune": 0.0 }
	for i: int in hands.size():
		var m: float = 1.0 if i == 0 else CREW_MULT
		for k: String in ["power", "dodge", "fortune"]:
			t[k] = float(t[k]) + float(Js.round(float(hands[i][k]) * m))
	return t


# ── The roll (lib/voyageRoll.ts) ──────────────────────────────────────────────

static func fortune_scale(fortune: float) -> float:
	return 0.7 + 0.3 * clampf(fortune / float(data()["fortuneRef"]), 0.0, 2.0)


static func outcome_chances(power: float, key: String) -> Dictionary:
	var d: float = float(payout(key)["difficulty"])
	var ratio: float = power / d if d > 0.0 else 2.0
	return { "triumph": clampf(0.1 + 0.32 * ratio, 0.05, 0.65), "setback": clampf(0.5 - 0.28 * ratio, 0.08, 0.6) }


static func mean_outcome(power: float, key: String) -> float:
	var c: Dictionary = outcome_chances(power, key)
	var om: Dictionary = data()["outcomeMult"]
	var success: float = maxf(0.0, 1.0 - c["triumph"] - c["setback"])
	return c["triumph"] * float(om["triumph"]) + success * float(om["success"]) + c["setback"] * float(om["setback"])


## The pre-sail estimate: the probability-weighted average.
static func expected(key: String, power: float, fortune: float) -> Dictionary:
	var b: Dictionary = payout(key)
	var mo: float = mean_outcome(power, key)
	return {
		"doubloons": float(Js.round(float(b["doubloons"]) * mo * fortune_scale(fortune))),
		"xp": float(Js.round(float(b["xp"]) * mo)),
		"crewXp": float(Js.round(float(b["crewXp"]) * mo)),
	}


## effectiveCrewLossChance: Fortune takes it to nothing at the route's level.
static func loss_chance(key: String, fortune: float) -> float:
	var r: Dictionary = route(key)
	if float(r["baseCrewLossChance"]) == 0.0:
		return 0.0
	return float(r["baseCrewLossChance"]) * maxf(0.0, 1.0 - fortune / float(r["minLevel"]))


static func _roll_outcome(power: float, key: String) -> String:
	var c: Dictionary = outcome_chances(power, key)
	var r: float = Dice.next()
	if r < c["triumph"]:
		return "triumph"
	if r > 1.0 - c["setback"]:
		return "setback"
	return "success"


## Everything a voyage is, decided as it sails (planVoyage + generateVoyageEvents).
static func _plan(key: String, hands: Array, safe: bool) -> Dictionary:
	var t: Dictionary = totals(hands)
	var b: Dictionary = payout(key)
	var outcome: String = _roll_outcome(t["power"], key)
	var om: float = float(data()["outcomeMult"][outcome])
	var luck: float = 0.88 + ((Dice.next() + Dice.next()) / 2.0) * 0.24
	var booty: bool = Dice.next() < float(data()["bootyChance"])
	var dbl: float = maxf(1.0, float(Js.round(float(b["doubloons"]) * om * fortune_scale(t["fortune"]) * luck * (float(data()["bootyMult"]) if booty else 1.0))))
	var lost: Array = []
	if not safe and hands.size() > 1 and Dice.next() < loss_chance(key, t["fortune"]):
		lost.append(float(hands[1 + int(Dice.next() * (hands.size() - 1))]["id"]))
	var pools: Dictionary = data()["pools"]
	var pool: Array
	if not lost.is_empty():
		pool = pools["ENCOUNTER_CREW_LOSS"] if Dice.next() < 0.5 else pools["DANGER_CREW_LOSS"]
	elif outcome == "triumph":
		pool = pools["DISCOVERY_SUCCESS"] if Dice.next() < 0.5 else pools["ENCOUNTER_CRUSH"]
	elif outcome == "setback":
		pool = pools["DANGER_SETBACK"] if Dice.next() < 0.5 else pools["WEATHER_FAIL"]
	else:
		pool = pools["PEACEFUL_CREW"] if hands.size() > 1 else pools["PEACEFUL_SOLO"]
	var tpl: Dictionary = pool[int(Dice.next() * pool.size())]
	var lost_name: String = "One of the crew"
	for h: Dictionary in hands:
		if not lost.is_empty() and float(h["id"]) == float(lost[0]):
			lost_name = h["name"]
	var story: String = str(tpl["narrative"]).replace("{captain}", str(hands[0]["name"]) if not hands.is_empty() else "The captain").replace("{name}", lost_name)
	var lure: Variant = null
	if Dice.next() < float(data()["lureRatePerEvent"][key]):
		lure = "golden" if Dice.next() < float(data()["goldenShare"]) else "luminous"
	var kind: String = "danger" if not lost.is_empty() else {"triumph": "discovery", "setback": "danger", "success": "peaceful"}[outcome]
	var event: Dictionary = {
		"type": kind, "title": tpl["title"], "narrative": story,
		"outcome": "failure" if not lost.is_empty() or outcome == "setback" else ("success" if outcome == "triumph" else "neutral"),
		"doubloonDelta": dbl, "crewVariantLost": lost[0] if not lost.is_empty() else null, "baitDrop": lure, "booty": booty,
	}
	return { "events": [event], "totalDoubloons": dbl, "crewLost": lost, "totals": t }


# ── Send, state, reveal ──────────────────────────────────────────────────────

static func _all(db: CaptainStore) -> Array:
	if not (db.save.get("voyages") is Array):
		db.save["voyages"] = []
	return db.save["voyages"]


static func out(db: CaptainStore) -> Dictionary:
	for v: Dictionary in _all(db):
		if v.get("status") == "pending":
			return v
	return {}


static func back(v: Dictionary) -> bool:
	return Clock.now_ms() >= float(v["created_ms"]) + float(v["duration_ms"])


static func send(db: CaptainStore, uid: String, key: String) -> Dictionary:
	if not ROUTES.has(key):
		return { "error": "Unknown route." }
	if not out(db).is_empty():
		return { "error": "Your crew is already at sea." }
	var p: Dictionary = db.me(uid)
	var r: Dictionary = route(key)
	var nav: int = Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))
	if nav < int(r["minLevel"]):
		return { "error": "Reach Navigation %d to sail %s." % [int(r["minLevel"]), r["name"]] }
	if Hulls.tier_of(p) < int(r["minShipTier"]):
		return { "error": "Requires a Sloop or better for this route." }
	var hands: Array = party(db, uid).map(func(c: Dictionary) -> Dictionary: return hand(c))
	var need: int = 1 if key == "coastal" else 2
	if hands.size() < need:
		return { "error": "You need at least one crew member aboard." if need == 1 else "A voyage needs at least two crew members." }
	var plan: Dictionary = _plan(key, hands, _safe(p))
	var v: Dictionary = {
		"id": db.next_id(), "route": key, "crew_variant_ids": hands.map(func(h: Dictionary) -> float: return h["id"]),
		"status": "pending", "events": plan["events"], "total_doubloons": plan["totalDoubloons"], "crew_lost": plan["crewLost"],
		"created_ms": Clock.now_ms(), "duration_ms": duration_ms(key, nav, float(plan["totals"]["dodge"]), p),
	}
	_all(db).append(v)
	return { "ok": true, "voyage": v }


## Pay a returned voyage out once (revealVoyageResults + voyagePayout).
static func reveal(db: CaptainStore, uid: String, id: float) -> Dictionary:
	var v: Dictionary = {}
	for x: Dictionary in _all(db):
		if float(x["id"]) == id:
			v = x
	if v.is_empty():
		return { "error": "Voyage not found." }
	if v.get("status") == "revealed":
		return { "error": "Already revealed." }
	if not back(v):
		return { "error": "Your crew has not returned yet." }
	v["status"] = "revealed"
	v["revealed_ms"] = Clock.now_ms()
	var p: Dictionary = db.me(uid)
	var key: String = v["route"]
	var ev: Dictionary = (v["events"] as Array)[0]
	var om: Dictionary = data()["outcomeMult"]
	var mult: float = float(om["triumph"]) if ev.get("outcome") == "success" else (float(om["setback"]) if ev.get("outcome") == "failure" else float(om["success"]))
	var xp: float = float(Js.round(float(payout(key)["xp"]) * mult))
	var crew_xp: float = float(Js.round(float(payout(key)["crewXp"]) * mult))
	var old_xp: float = Js.num(p.get("expedition_xp"))
	var old_level: int = Loadout.nav_level_from_xp(old_xp)
	var eye: Variant = Campaign._eye(p, xp)
	if eye != null:
		db.update_profile(uid, { "anglers_patience_xp": eye })
	db.bump_stat(uid, "expedition_xp", xp)
	var dbl: float = float(v["total_doubloons"])
	var bal: float = db.grant(uid, "doubloons", dbl)
	if dbl > 0.0:
		db.ledger(uid, dbl, "Voyage: %s" % route(key)["name"])
	var bait: Array = []
	if ev.get("baitDrop") != null:
		db.add_bait(uid, str(ev["baitDrop"]), 1.0)
		bait.append({ "type": ev["baitDrop"], "qty": 1.0 })
	if ev.get("booty") == true:
		db.bump_stat(uid, "voyage_booty_hauls", 1.0)
	# The lost are remembered (the Graveyard), not deleted; the rest earn crew XP.
	var lost: Array = Js.list(v.get("crew_lost"))
	var grants: Array = []
	var lost_names: Array = []
	for c: Dictionary in Js.list(db.save.get("crew")):
		var cid: float = float(c["id"])
		if not Js.list(v["crew_variant_ids"]).has(cid):
			continue
		if lost.has(cid):
			lost_names.append(hand(c)["name"])
			c["died_at"] = Js.iso(Clock.now_ms())
			c["died_on_voyage_id"] = v["id"]
			c["voyage_slot"] = null
			c["raid_slot"] = null
			continue
		if c.get("died_at") != null:
			continue
		var old: float = Js.num(c.get("xp"))
		c["xp"] = old + crew_xp
		grants.append({ "id": cid, "name": hand(c)["name"], "oldLevel": Crew.level(old), "newLevel": Crew.level(old + crew_xp) })
	var new_level: int = Loadout.nav_level_from_xp(old_xp + xp)
	var skin: Variant = null
	if new_level >= 50:
		db.grant_badge(uid, "navigator")
		if not Js.includes(Js.list(p.get("unlocked_character_colors")), "sky") and db.add_to_list(uid, "unlocked_character_colors", "sky"):
			skin = "sky"
	var revealed: int = _all(db).filter(func(x: Dictionary) -> bool: return x.get("status") == "revealed").size()
	if revealed >= 100:
		db.grant_badge(uid, "fleet_admiral")
	return {
		"ok": true, "route": key, "event": ev, "earnedDoubloons": dbl, "newDoubloonTotal": bal, "xpEarned": xp,
		"oldExpeditionLevel": old_level, "newExpeditionLevel": new_level, "crewXp": crew_xp, "crewGrants": grants,
		"crewLost": lost, "crewLostNames": lost_names, "earnedBait": bait, "unlockedSkinId": skin,
	}


## The board: the voyage out (and whether it is home), the crew aboard and
## their totals, each route with its estimate, and the last few voyages.
static func state(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var nav: int = Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))
	var hands: Array = party(db, uid).map(func(c: Dictionary) -> Dictionary: return hand(c))
	var t: Dictionary = totals(hands)
	var routes: Array = []
	for key: String in ROUTES:
		var r: Dictionary = route(key).duplicate()
		r["key"] = key
		r["open"] = nav >= int(r["minLevel"])
		r["seaDays"] = SEA_DAYS[key]
		r["durationMs"] = duration_ms(key, nav, t["dodge"], p)
		r["expected"] = expected(key, t["power"], t["fortune"])
		r["chances"] = outcome_chances(t["power"], key)
		r["lossChance"] = 0.0 if _safe(p) else loss_chance(key, t["fortune"])
		r["needCrew"] = 1 if key == "coastal" else 2
		routes.append(r)
	var o: Dictionary = out(db)
	var history: Array = _all(db).filter(func(x: Dictionary) -> bool: return x.get("status") == "revealed")
	history.reverse()
	return {
		"navLevel": nav, "crewCap": crew_cap(p), "hands": hands, "totals": t, "routes": routes,
		"voyage": o, "home": not o.is_empty() and back(o), "history": history.slice(0, 8),
		"safe": _safe(p), "swift": _swift(p),
	}
