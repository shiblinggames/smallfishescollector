class_name AlmanacData
extends RefCounted
## THE ALMANAC'S READ OF THE SAVE (Godot port of getAlmanacData and
## markAlmanacViewed in web/lib/core/harbour.ts, fishing pass 3).
##
## One entry per species: what the book knows about it (the career count from
## the lifetime log, the cycle count, first and last sightings, the best
## length, a golden taken), whether it is NEW (first landed after the book was
## last closed, or ever when it has never been opened), and the captain's
## prestige, golden boosts, claims, the Long Vigil and the career stats.


static func build(db: CaptainStore, uid: String) -> Dictionary:
	var save: Dictionary = db.save
	var p: Dictionary = save["profile"]
	var ancient: Array = Js.list(p.get("ancient_catches"))
	var prestige: Dictionary = Js.obj(p.get("prestige_levels"))
	var viewed_at: float = Js.parse_ms(p.get("almanac_viewed_at")) if p.get("almanac_viewed_at") != null else NAN
	var col: Dictionary = save["collection"]
	var life: Dictionary = save["lifetime"]
	var bests: Dictionary = save["bests"]
	var entries: Array = []
	for s: Dictionary in save["species"]:
		var k: String = Js.key(s["id"])
		var c: Dictionary = Js.obj(col.get(k))
		var l: Dictionary = Js.obj(life.get(k))
		var b: Dictionary = Js.obj(bests.get(k))
		var first: Variant = Js.nz(l.get("first"), c.get("first_caught_at"))
		var lifetime_n: Variant = l.get("n") if l.has("n") else c.get("catch_count")
		var is_giant_caught: bool = Js.includes(ancient, s["id"])
		entries.append({
			"id": float(s["id"]), "name": s["name"], "scientificName": s.get("scientific_name"),
			"funFact": s.get("fun_fact"), "habitat": s["habitat"],
			"rarity": float(Js.nz(s.get("bite_rarity"), 1.0)), "difficulty": float(Js.nz(s.get("catch_difficulty"), 1.0)),
			"sellValue": Js.num(s.get("sell_value")),
			"lengthMin": s.get("length_min_in"), "lengthMax": s.get("length_max_in"),
			"sizeCategory": s.get("size_category"), "dietType": s.get("diet_type"), "region": s.get("region"),
			"count": maxf(Js.num(lifetime_n), 1.0 if is_giant_caught else 0.0),
			"firstCaughtAt": first,
			"isNew": first != null and (is_nan(viewed_at) or Js.parse_ms(first) > viewed_at),
			"lastCaughtAt": Js.nz(l.get("last"), c.get("last_caught_at")),
			"cycleCount": Js.num(c.get("catch_count")),
			"everCaught": Js.num(lifetime_n) > 0 or is_giant_caught or Js.num(prestige.get(s["habitat"])) > 0,
			"everGolden": c.get("is_golden") == true,
			"pbLength": b.get("len"), "pbAt": b.get("at"),
		})
	var goldens: Array = []
	var shinies: Array = (save["shinies"] as Array).duplicate()
	shinies.reverse()
	for g: Dictionary in shinies:
		var f: Variant = db.species(float(g["fish_id"]))
		goldens.append({
			"id": g["id"], "fishId": g["fish_id"], "name": (f as Dictionary)["name"] if f != null else "Unknown",
			"habitat": (f as Dictionary)["habitat"] if f != null else "shallows",
			"sizeIn": g.get("size_in"), "caughtAt": g.get("caught_at"), "status": g.get("status"), "soldFor": g.get("sold_for"),
		})
	var unlocked: bool = db.has_cleared(uid, "the_sunken_hand")
	var new_count: int = 0
	for e: Dictionary in entries:
		if e["isNew"]:
			new_count += 1
	return {
		"entries": entries, "goldens": goldens, "unlockedPets": Js.list(p.get("unlocked_pets")),
		"ancientCatches": ancient, "vigil": Vigil.state_for(p.get("ancient_vigil"), ancient) if unlocked else {},
		"vigilUnlocked": unlocked, "prestige": prestige, "goldenBoosts": Js.obj(p.get("zone_golden_boost")),
		"newCount": new_count,
		"zoneRewardsClaimed": {
			"shallows": p.get("zone_shallows_rewarded") == true, "open_waters": p.get("zone_open_waters_rewarded") == true,
			"deep": p.get("zone_deep_rewarded") == true, "abyss": p.get("zone_abyss_rewarded") == true,
		},
		"stats": {
			"casts": Js.num(p.get("fishing_casts")), "perfects": Js.num(p.get("total_perfects")),
			"bestPerfectStreak": Js.num(p.get("highest_perfect_streak")), "trophySizeCatches": Js.num(p.get("trophy_size_catches")),
			"cratesOpened": Js.num(p.get("fishing_crates_opened")), "doubleCatches": Js.num(p.get("fishing_double_catches")),
			"jackpots": Js.num(p.get("fishing_jackpots")), "snags": Js.num(p.get("fishing_snags")),
			"doubloonsFromFish": Js.num(p.get("fish_sold_doubloons")), "fishingXP": Js.num(p.get("fishing_xp")),
			"crateOpens": Js.obj(p.get("crate_opens")), "baitUsed": Js.obj(p.get("bait_used")),
			"biggestSale": Js.num(p.get("biggest_fish_sale")), "fishSoldCount": Js.num(p.get("fish_sold_count")),
		},
	}


## The book has been read: stamped when it closes, so the NEW marks stay up
## for the whole visit.
static func mark_viewed(db: CaptainStore, uid: String) -> void:
	db.update_profile(uid, { "almanac_viewed_at": Js.iso(Clock.now_ms()) })


static func is_giant(e: Dictionary) -> bool:
	return e["habitat"] == "ancient_deep" and float(e["sellValue"]) == 0.0
