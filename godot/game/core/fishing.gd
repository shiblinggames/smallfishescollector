class_name Fishing
extends RefCounted
## THE CAST AND THE REEL, a port of web/lib/core/fishing.ts (Godot port, stage 1).
##
## cast_line, reel_in and reel_crate, over one captain's store. The rules live
## in FishingRules; these read, check, claim and write, in the TS's order. The
## TS comments explain each rule; this port keeps the code in the same order so
## the two can be read side by side.
##
## A cast carries where the line went in, so its hotspot (Hotspots) is
## re-derived here; without it, open water.


static func _now_iso() -> String:
	return Js.iso(Clock.now_ms())


## Who asked for this species and is still waiting on it.
static func _folk_waiting_on(db: CaptainStore, uid: String, fish_id: float) -> Array:
	var out: Array = []
	var folk: Dictionary = Rules.data()["folk"]
	for folk_id: Variant in db.folk_wanting(uid, fish_id):
		var f: Variant = folk.get(folk_id)
		if f == null:
			continue
		for fav: Dictionary in (f as Dictionary)["favourites"]:
			if float(fav["id"]) == fish_id:
				out.append({ "folkId": folk_id, "short": (f as Dictionary)["short"], "fishName": fav["name"] })
				break
	return out


## `at` is where the line went in ({x, y}), for hotspots; without it, open water.
static func cast_line(db: CaptainStore, uid: String, bait_type: String, habitat: String, at: Variant = null) -> Dictionary:
	# Which patch of water this is, if any: derived from the clock, never trusted.
	var spot: Dictionary = Hotspots.at_point(float(at["x"]), float(at["y"]), Clock.now_ms()) if at is Dictionary else {}
	var hs: Dictionary = Hotspots.effect(spot.get("kind"), int(spot.get("tier", 1)))
	var profile: Dictionary = db.profile(uid, "rod_tier, completionist_effects, hook_tier, fishing_xp, fish_hold_tier, ancient_catches, ancient_vigil, active_event, catch_pending, pending_cast, fishing_renown_alloc, has_ancient_deep_access, current_perfect_streak, equipped_special_2, has_anglers_patience, anglers_patience_xp, borrowed_jaw_xp, equipped_raid_items, finn_spoil_free, finn_spoil_paid, pending_reroll, lifetime_species, line_tier, prestige_levels, is_premium, premium_expires_at, is_admin")

	settle_deferred_species_credit(db, uid, profile)

	var renown: Dictionary = Rules.fishing_renown(profile.get("fishing_renown_alloc"))

	var fishing_level: int = Rules.level_from_xp(Js.num(profile.get("fishing_xp")))
	var min_level: float = float((Rules.data()["zones"]["minLevel"] as Dictionary).get(habitat, 1.0))
	if fishing_level < min_level:
		return { "error": "Reach Fishing Level %d to fish here" % int(min_level) }

	if habitat == "ancient_deep" and profile.get("has_ancient_deep_access") != true:
		if not db.has_cleared(uid, "the_quartermaster"):
			return { "error": "Clear Chapter 3 (defeat the Quartermaster) to reach the Ancient Deep." }
		if not Rules.in_captains_water(profile):
			return { "error": Rules.CAPTAIN_WATER_ANCIENT }
		db.update_profile(uid, { "has_ancient_deep_access": true })

	var active_event: Variant = FishingRules.active_event_of(profile.get("active_event"))
	var no_bait: bool = active_event != null and (active_event as Dictionary)["type"] == "bloom"
	var event_rarity_bonus: float = 0.25 if active_event != null and (active_event as Dictionary)["type"] == "redtide" else 0.0

	var hold: Dictionary = Rules.fish_hold(Js.num(profile.get("fish_hold_tier")))
	var total_fish: float = db.hold_count(uid)
	var bait_held: Variant = db.bait_count(uid, bait_type)
	var candidates: Array = db.candidates(habitat)

	if total_fish >= float(hold["capacity"]):
		var cap: int = int(hold["capacity"])
		return { "error": "Fish hold full (%d/%d). Sell some fish to make room." % [cap, cap] }

	var live: Variant = profile.get("pending_cast")
	var live_shot: bool = live != null and Js.truthy((live as Dictionary).get("shot"))
	var resuming: bool = live_shot and (live as Dictionary)["habitat"] == habitat

	if not no_bait and (bait_held == null or float(bait_held) <= 0):
		return { "error": "No bait remaining." }

	if resuming:
		if not no_bait and bait_held != null:
			db.set_bait_count(uid, bait_type, float(bait_held) - 1.0)
			db.bump_json_counter(uid, "bait_used", bait_type, 1.0)
		db.bump_stat(uid, "fishing_casts", 1.0)
		if Js.num(profile.get("current_perfect_streak")) > 0:
			db.update_profile(uid, { "current_perfect_streak": 0.0 })
		var resumed: Dictionary = ((live as Dictionary)["shot"] as Dictionary).duplicate(true)
		if not no_bait and bait_held != null:
			resumed["baitRemaining"] = float(bait_held) - 1.0
		return resumed

	var rod: Dictionary = Rules.effective_rod(Js.num(profile.get("rod_tier")), profile.get("completionist_effects"))
	var prev_streak: float = Js.num(profile.get("current_perfect_streak"))
	var cast_streak: float = 0.0 if Js.truthy(profile.get("catch_pending")) else prev_streak

	var roll: Dictionary = FishingRules.roll_cast({
		"habitat": habitat, "baitType": bait_type,
		"candidates": candidates,
		# When a fish bites best (port rules): nudged among its own rarity.
		"nudges": FishBias.for_cast(candidates, Js.list(db.save.get("species")), Vector2(float(at["x"]), float(at["y"])) if at is Dictionary else Vector2(Js.num(db.me(uid).get("sea_x")), Js.num(db.me(uid).get("sea_y"))), Clock.now_ms()) if FishBias.on() else {},
		"fishingLevel": fishing_level,
		"firstEver": Js.num(profile.get("fishing_xp")) == 0.0,
		"ancientCatches": Js.list(profile.get("ancient_catches")),
		"ancientVigil": profile.get("ancient_vigil"),
		"rod": rod,
		"locked": Rules.locked_in_state(rod, cast_streak),
		"patience": Rules.eye_from_profile(profile),
		"renown": renown,
		"hotspot": hs,
		"eventRarityBonus": event_rarity_bonus,
		"stale": live if (live_shot and (live as Dictionary)["habitat"] != habitat) else null,
		"alwaysAncientTrophy": false,
	})
	if roll.has("error"):
		return { "error": roll["error"] }

	var cast_update: Dictionary = { "last_used_bait": bait_type, "catch_pending": true }
	if Js.truthy(profile.get("catch_pending")):
		cast_update["current_perfect_streak"] = 0.0
	db.update_profile(uid, cast_update)

	db.bump_stat(uid, "fishing_casts", 1.0)

	if not no_bait and bait_held != null:
		db.set_bait_count(uid, bait_type, float(bait_held) - 1.0)
		db.bump_json_counter(uid, "bait_used", bait_type, 1.0)

	db.update_profile(uid, { "pending_cast": roll["token"] })

	var out: Dictionary = (roll["shot"] as Dictionary).duplicate(true)
	if not no_bait and bait_held != null:
		out["baitRemaining"] = float(bait_held) - 1.0
	return out


## Log one catch: the career (lifetime) and this prestige cycle (collection).
## Returns whether this was a first sighting this cycle.
static func log_catch_to_bestiary(db: CaptainStore, uid: String, fish_id: float) -> bool:
	var now: String = _now_iso()
	db.bump_lifetime(uid, fish_id, now)
	var existing: Variant = db.collection_row(uid, fish_id)
	db.log_catch(uid, fish_id, existing, now)
	return existing == null


static func settle_deferred_species_credit(db: CaptainStore, uid: String, profile: Dictionary) -> void:
	var pending: Variant = profile.get("pending_reroll")
	if pending == null:
		return
	if not db.claim_pending_reroll(uid):
		return
	var fid: float = float((pending as Dictionary)["fishId"])
	if log_catch_to_bestiary(db, uid, fid):
		credit_new_species(db, uid, fid, profile)


## The first time a species is landed: the lifetime set, the line tier and
## the Full Collection badge.
static func credit_new_species(db: CaptainStore, uid: String, new_id: float, profile: Dictionary) -> void:
	var non_ancient: Array = db.non_ancient_species_ids()
	var caught: Array = db.collection_ids(uid)
	var stored: Array = Js.list(profile.get("lifetime_species"))
	var lifetime: Array = []
	for id: Variant in stored + caught + [new_id]:
		if not Js.includes(lifetime, id):
			lifetime.append(id)
	if lifetime.size() > stored.size():
		db.update_profile(uid, { "lifetime_species": lifetime })
	var new_tier: float = float(Rules.line_for_species_count(lifetime.size())["tier"])
	if new_tier > Js.num(profile.get("line_tier")):
		db.update_profile(uid, { "line_tier": new_tier })
	var non_ancient_caught: int = 0
	for id: Variant in non_ancient:
		if Js.includes(lifetime, id):
			non_ancient_caught += 1
	if (non_ancient.size() > 0 and non_ancient_caught >= non_ancient.size()) or Rules.has_prestiged_all_zones(profile.get("prestige_levels")):
		db.grant_badge(uid, "full_collection")


static func reel_in(db: CaptainStore, uid: String, fish_id: float, result: String, bait_type: String) -> Dictionary:
	var is_catch: bool = result == "perfect" or result == "catch"

	if result == "penalty":
		var pc: Variant = db.pending_cast(uid)
		var snag_bait: Variant = (pc as Dictionary).get("baitType") if pc != null else null
		var held: Variant = db.bait_count(uid, snag_bait) if Js.truthy(snag_bait) else null
		if Js.truthy(snag_bait) and held != null and float(held) > 0:
			db.set_bait_count(uid, snag_bait, float(held) - 1.0, held)
		db.bump_stat(uid, "fishing_snags", 1.0)

	if not is_catch:
		db.update_profile(uid, { "current_perfect_streak": 0.0, "catch_pending": false, "pending_cast": null })
		return { "caught": false }

	var profile: Dictionary = db.profile(uid, "doubloons, fishing_abyss_streak, fishing_xp, rod_tier, completionist_effects, fish_hold_tier, has_phantom_hook, has_perfected_sigil, equipped_special, equipped_special_2, has_anglers_patience, anglers_patience_xp, borrowed_jaw_xp, equipped_raid_items, finn_spoil_free, finn_spoil_paid, line_tier, prestige_levels, ancient_catches, ancient_vigil, unlocked_pets, unlocked_character_colors, total_perfects, zone_perfects, current_perfect_streak, highest_perfect_streak, force_shiny_next_perfect, force_shiny_always, fishing_renown_alloc, pending_cast, zone_golden_boost, lifetime_species")
	var hold_count: float = db.hold_count(uid)

	var eye: Dictionary = Rules.eye_from_profile(profile)

	var token_v: Variant = profile.get("pending_cast")
	if token_v == null or float((token_v as Dictionary)["fishId"]) == FishingRules.CRATE_FISH_ID:
		return { "caught": false }
	var token: Dictionary = token_v

	var early: Dictionary = FishingRules.reel_too_early(token)
	if early["early"]:
		return { "error": "Nothing has bitten yet. The line is still out." }

	var fish_v: Variant = db.species(float(token["fishId"]))
	if fish_v == null:
		return { "error": "The line went slack. Reel in again." }
	var fish: Dictionary = fish_v

	if not db.claim_cast(uid, float(token["castAt"])):
		return { "caught": false }
	fish_id = float(token["fishId"])
	var double_catch: bool = token["doubleCatch"]
	var jackpot_mult: float = float(token["jackpotMult"])
	bait_type = token["baitType"]
	var locked_qty: float = float(Js.nz(token.get("catchQty"), 1.0))

	var renown_xp_mult: float = float(Rules.fishing_renown(profile.get("fishing_renown_alloc"))["xpMult"])

	if fish["habitat"] == "ancient_deep" and Js.num(fish.get("sell_value")) == 0.0:
		var land: Dictionary = FishingRules.land_ancient(profile, fish_id, result, renown_xp_mult)
		if land["anomaly"]:
			db.flag_anomaly(uid, "implausible:perfectStreak", 3.0, { "claimed": land["perfectStreak"] })
		var pet_granted: bool = db.add_to_list(uid, "unlocked_pets", Vigil.PET_ID) if land["grantVigilPet"] else false
		for b: Variant in land["badges"]:
			db.grant_badge(uid, b)
		db.update_profile(uid, land["updates"])
		var ancient_doubloons: Variant = db.grant(uid, "doubloons", land["sigilBonus"]) if float(land["sigilBonus"]) > 0 else null
		var first_ancient: bool = false
		if db.claim_contest("first_ancient_catch", uid):
			first_ancient = true
			db.mail_to(uid, "🏆 First Ancient Deep Catch: Custom Boat Prize",
				"You did it. You're the first captain ever to land a fish in the Ancient Deep.\n\nAs promised, you've won a custom boat designed for you. Reply to this email to claim it:\n\nhello@shiblinggames.com\n\nInclude your prize code: ANCIENT-FIRST\n\nWe'll work with you on the design. Welcome to the deep.\n\n— Cap'n Shibling",
				"Cap'n Shibling")
		var out_a: Dictionary = {
			"caught": true, "fish": fish, "baitSaved": false, "isNewSpecies": land["isNewTrophy"],
			"xpGained": land["xpGained"], "newXP": land["newXP"], "dailyProgress": [0.0, 0.0, 0.0],
			"perfectStreak": land["perfectStreak"], "streakBonusXP": 0.0,
			"sizeIn": Js.num(fish.get("length_min_in")), "isPB": false, "previousBest": null, "isShiny": false,
			"sigilBonus": land["sigilBonus"], "firstAncientCatch": first_ancient,
			"vigilRankUp": land["vigilRankUp"], "vigilPetGranted": pet_granted,
		}
		if ancient_doubloons != null:
			out_a["newDoubloons"] = ancient_doubloons
		if land["vigilWritten"]:
			out_a["vigilTotal"] = Vigil.total(land["vigil"])
			out_a["vigilComplete"] = Vigil.complete(land["vigil"])
		return out_a

	var reel_rod: Dictionary = Rules.effective_rod(Js.num(profile.get("rod_tier")), profile.get("completionist_effects"))
	var land_f: Dictionary = FishingRules.land_fish({
		"profile": profile, "fish": fish, "result": result, "baitType": bait_type, "rod": reel_rod, "eye": eye, "renownXpMult": renown_xp_mult,
		"doubleCatch": double_catch, "jackpotMult": jackpot_mult, "lockedCatchQty": locked_qty,
		"holdCount": hold_count,
		"holdCapacity": float(Rules.fish_hold(Js.num(profile.get("fish_hold_tier")))["capacity"]),
	})
	var is_shiny: bool = land_f["isShiny"]
	var catch_qty: float = land_f["catchQty"]
	var is_perfect: bool = result == "perfect"
	var wormhole: bool = land_f["wormhole"]
	var old_level: int = (land_f["levels"] as Dictionary)["from"]
	var new_level: int = (land_f["levels"] as Dictionary)["to"]
	var size: Dictionary = land_f["size"]

	var is_new_species: bool = db.collection_row(uid, fish_id) == null

	var had: Variant = db.hold_qty(uid, fish_id)
	if catch_qty > 0 and not is_shiny:
		db.add_to_hold(uid, fish_id, catch_qty, had)

	if not wormhole:
		log_catch_to_bestiary(db, uid, fish_id)
		if is_new_species:
			credit_new_species(db, uid, float(fish["id"]), profile)

	var updates: Dictionary = (land_f["updates"] as Dictionary).duplicate()
	updates["pending_reroll"] = { "fishId": fish_id, "qty": catch_qty, "habitat": fish["habitat"] } if wormhole else null
	if land_f["anomaly"]:
		db.flag_anomaly(uid, "implausible:perfectStreak", 3.0, { "claimed": land_f["perfectStreak"] })
	var unlocked_skin: Variant = null
	var to_add: Array = Rules.fishing_colors_to_grant(new_level, Js.list(profile.get("unlocked_character_colors")))
	if to_add.size() > 0:
		for id: Variant in to_add:
			db.add_to_list(uid, "unlocked_character_colors", id)
		unlocked_skin = to_add.back()
	for b: Variant in land_f["badges"]:
		db.grant_badge(uid, b)

	db.update_profile(uid, updates)
	var new_doubloons: Variant = db.grant(uid, "doubloons", land_f["sigilBonus"]) if float(land_f["sigilBonus"]) > 0 else null
	if land_f["baitSaved"]:
		db.add_bait(uid, bait_type, 1.0)

	if land_f["effectiveDoubleCatch"]:
		db.bump_stat(uid, "fishing_double_catches", 1.0)
	if float(land_f["effectiveJackpotMult"]) > 1:
		db.bump_stat(uid, "fishing_jackpots", 1.0)

	var is_pb: bool = false
	var previous_best: Variant = null
	var size_in: float = size["sizeIn"]
	if size["sizeMin"] != null and size["sizeMax"] != null:
		if size.get("sizeTier") == "trophy":
			db.grant_badge(uid, "trophy_catch")
			db.bump_stat(uid, "trophy_size_catches", 1.0)
		previous_best = db.personal_best(uid, fish_id)
		is_pb = previous_best == null or size_in > float(previous_best)
		if is_pb:
			db.set_personal_best(uid, fish_id, size_in, _now_iso())

	var daily_date: String = Daily.today_utc()

	var shiny_id: Variant = null
	var already_mounted: bool = false
	if is_shiny:
		shiny_id = db.add_shiny(uid, float(fish["id"]), size_in if size_in > 0 else null)
		var row: Variant = db.collection_row(uid, float(fish["id"]))
		already_mounted = row != null and Js.truthy((row as Dictionary).get("is_golden"))
	if Js.truthy(profile.get("force_shiny_next_perfect")) and is_perfect:
		db.update_profile(uid, { "force_shiny_next_perfect": false })

	var daily_row: Variant = db.daily_progress(uid, daily_date)
	var snap_level: float = float(Js.nz((daily_row as Dictionary).get("fishing_level_snapshot") if daily_row != null else null, old_level))
	var challenges: Array = Daily.with_override(daily_date, db.challenge_override(daily_date), snap_level)
	var prior: Array = [0.0, 0.0, 0.0, 0.0]
	if daily_row != null:
		for n: int in 4:
			prior[n] = Js.num((daily_row as Dictionary).get("p%d" % (n + 1)))
	var new_p: Array = []
	for n: int in challenges.size():
		var c: Dictionary = challenges[n]
		new_p.append(minf(float(prior[n]) + Daily.increment(c, fish["habitat"], float(fish["bite_rarity"]), Js.num(fish.get("sell_value")), catch_qty, is_perfect), float(c["target"])))
	db.save_daily_progress(uid, daily_date, new_p, snap_level)

	var waiting_on: Array = _folk_waiting_on(db, uid, fish_id)

	var out: Dictionary = {
		"caught": true, "fish": fish, "baitSaved": land_f["baitSaved"], "isNewSpecies": is_new_species,
		"deepStirs": land_f["deepStirs"], "xpGained": land_f["xpGained"], "newXP": land_f["newXP"], "dailyProgress": new_p,
		"perfectStreak": land_f["perfectStreak"], "streakBonusXP": land_f["streakBonusXP"],
		"xpCatch": land_f["xpCatch"], "xpStreak": land_f["xpStreak"], "sizeIn": size_in,
		"isPB": is_pb, "previousBest": previous_best, "isShiny": is_shiny, "alreadyMounted": already_mounted,
		"sigilBonus": land_f["sigilBonus"], "wormhole": wormhole, "catchQty": catch_qty,
	}
	if waiting_on.size() > 0:
		out["waitingOn"] = waiting_on
	if unlocked_skin != null:
		out["unlockedSkinId"] = unlocked_skin
	if land_f.has("perfectBonusXP"):
		out["perfectBonusXP"] = land_f["perfectBonusXP"]
	if size["sizeMin"] != null:
		out["sizeMin"] = size["sizeMin"]
	if size["sizeMax"] != null:
		out["sizeMax"] = size["sizeMax"]
	if size.has("sizeTier"):
		out["sizeTier"] = size["sizeTier"]
	if shiny_id != null:
		out["shinyId"] = shiny_id
	if new_doubloons != null:
		out["newDoubloons"] = new_doubloons
	return out


static func reel_crate(db: CaptainStore, uid: String, result: String) -> Dictionary:
	var profile: Dictionary = db.profile(uid, "pending_cast, current_perfect_streak, highest_perfect_streak")
	var token_v: Variant = profile.get("pending_cast")
	if token_v == null or float((token_v as Dictionary)["fishId"]) != FishingRules.CRATE_FISH_ID or not Js.truthy((token_v as Dictionary).get("crateTier")):
		return { "error": "No crate to open." }
	var token: Dictionary = token_v

	var early: Dictionary = FishingRules.reel_too_early(token)
	if early["early"]:
		return { "error": "Nothing has bitten yet. The line is still out." }

	if not db.claim_crate_cast(uid, float(token["castAt"])):
		return { "error": "No crate to open." }

	var cs: Dictionary = FishingRules.crate_streak(profile, result, token["habitat"])
	if cs["anomaly"]:
		db.flag_anomaly(uid, "implausible:perfectStreak", 3.0, { "claimed": cs["streak"] })
	db.update_profile(uid, cs["updates"])

	db.bump_stat(uid, "fishing_crates_opened", 1.0)
	db.bump_json_counter(uid, "crate_opens", token["crateTier"], 1.0)

	var loot: Dictionary = CrateLoot.grant(db, uid, token["crateTier"])
	if loot.has("error"):
		return loot
	loot["perfectStreak"] = cs["streak"]
	return loot


## STOWED, NOT OPENED (Kong, 2026-10-01; the port only, the web opens a crate
## the moment it is reeled, and reelCrate above still does, for the parity
## replay). The same claim on the cast and the same perfect streak, but the
## crate goes into the captain's stash (profile "crate_stash": tier -> count)
## to be opened when they choose (open_crate). What is inside is rolled when it
## is opened, by the same rule, so nothing about the odds changes.
static func stow_crate(db: CaptainStore, uid: String, result: String) -> Dictionary:
	var profile: Dictionary = db.profile(uid, "pending_cast, current_perfect_streak, highest_perfect_streak, crate_stash")
	var token_v: Variant = profile.get("pending_cast")
	if token_v == null or float((token_v as Dictionary)["fishId"]) != FishingRules.CRATE_FISH_ID or not Js.truthy((token_v as Dictionary).get("crateTier")):
		return { "error": "No crate to bring aboard." }
	var token: Dictionary = token_v
	var early: Dictionary = FishingRules.reel_too_early(token)
	if early["early"]:
		return { "error": "Nothing has bitten yet. The line is still out." }
	if not db.claim_crate_cast(uid, float(token["castAt"])):
		return { "error": "No crate to bring aboard." }
	var cs: Dictionary = FishingRules.crate_streak(profile, result, token["habitat"])
	if cs["anomaly"]:
		db.flag_anomaly(uid, "implausible:perfectStreak", 3.0, { "claimed": cs["streak"] })
	var stash: Dictionary = Js.obj(profile.get("crate_stash")).duplicate()
	var tier: String = token["crateTier"]
	stash[tier] = Js.num(stash.get(tier)) + 1.0
	var updates: Dictionary = (cs["updates"] as Dictionary).duplicate()
	updates["crate_stash"] = stash
	db.update_profile(uid, updates)
	db.bump_stat(uid, "fishing_crates_caught", 1.0)
	return { "stowed": tier, "perfectStreak": cs["streak"], "stash": stash }


## Open one crate from the stash: spend it, then the same roll reelCrate makes.
static func open_crate(db: CaptainStore, uid: String, tier: String) -> Dictionary:
	var stash: Dictionary = Js.obj(db.profile(uid, "crate_stash").get("crate_stash")).duplicate()
	if Js.num(stash.get(tier)) < 1.0:
		return { "error": "There is no crate like that in your stash." }
	stash[tier] = Js.num(stash.get(tier)) - 1.0
	if float(stash[tier]) <= 0.0:
		stash.erase(tier)
	db.update_profile(uid, { "crate_stash": stash })
	db.bump_stat(uid, "fishing_crates_opened", 1.0)
	db.bump_json_counter(uid, "crate_opens", tier, 1.0)
	var loot: Dictionary = CrateLoot.grant(db, uid, tier)
	if loot.has("error"):
		return loot
	loot["tier"] = tier
	loot["stash"] = stash
	return loot


# ── The rest of the cast (lib/core/fishing.ts, after reelCrate) ────────────────

## The Galaxy Rod's wormhole: swap the catch just landed for a different fish
## from the same water. One-shot; a failure still logs the original catch.
static func reroll_wormhole(db: CaptainStore, uid: String) -> Dictionary:
	var profile: Dictionary = db.profile(uid, "rod_tier, completionist_effects, pending_reroll, lifetime_species, line_tier, prestige_levels")
	var pending: Variant = profile.get("pending_reroll")
	if pending == null:
		return { "error": "No catch to reroll." }
	if not db.claim_pending_reroll(uid):
		return { "error": "No catch to reroll." }
	var orig: float = float((pending as Dictionary)["fishId"])
	var qty: float = float((pending as Dictionary)["qty"])
	var habitat: String = (pending as Dictionary)["habitat"]
	var abort: Callable = func(error: String) -> Dictionary:
		if log_catch_to_bestiary(db, uid, orig):
			credit_new_species(db, uid, orig, profile)
		return { "error": error }

	var rod: Dictionary = Rules.effective_rod(Js.num(profile.get("rod_tier")), profile.get("completionist_effects"))
	var picked: Variant = FishingRules.wormhole_exit(db.candidates(habitat), orig, habitat, rod)
	if picked == null:
		return abort.call("The wormhole found nothing new.")
	var new_fish_v: Variant = db.species(float((picked as Dictionary)["id"]))
	if new_fish_v == null:
		return abort.call("The wormhole collapsed.")
	var new_fish: Dictionary = new_fish_v
	if not db.take_from_hold(uid, orig, qty):
		return abort.call("That catch is already out of your hold. The wormhole needs something to send.")
	db.add_to_hold(uid, float(new_fish["id"]), qty, db.hold_qty(uid, float(new_fish["id"])))
	var is_new: bool = log_catch_to_bestiary(db, uid, float(new_fish["id"]))
	if is_new:
		credit_new_species(db, uid, float(new_fish["id"]), profile)
	var size: Dictionary = FishingRules.roll_catch_size(new_fish)
	var is_pb: bool = false
	var previous: Variant = null
	if size["sizeMin"] != null and size["sizeMax"] != null:
		previous = db.personal_best(uid, float(new_fish["id"]))
		is_pb = previous == null or float(size["sizeIn"]) > float(previous)
		if is_pb:
			db.set_personal_best(uid, float(new_fish["id"]), size["sizeIn"], _now_iso())
	var out: Dictionary = { "ok": true, "fish": new_fish, "qty": qty, "isNewSpecies": is_new, "sizeIn": size["sizeIn"], "isPB": is_pb, "previousBest": previous }
	if size["sizeMin"] != null:
		out["sizeMin"] = size["sizeMin"]
	if size["sizeMax"] != null:
		out["sizeMax"] = size["sizeMax"]
	if size.has("sizeTier"):
		out["sizeTier"] = size["sizeTier"]
	return out


## The Tide Turner: skip the fish on the line without breaking the streak.
static func tide_turner_skip(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "has_tide_turner, equipped_special, tide_turner_used, tide_turner_date")
	if not Js.truthy(p.get("has_tide_turner")):
		return { "error": "No Tide Turner" }
	if p.get("equipped_special") != "tide_turner":
		return { "error": "Your Tide Turner is not equipped" }
	var today: String = _now_iso().split("T")[0]
	var used: float = Js.num(p.get("tide_turner_used")) if p.get("tide_turner_date") == today else 0.0
	if used >= 3:
		return { "error": "No skips remaining today" }
	db.update_profile(uid, { "tide_turner_used": used + 1.0, "tide_turner_date": today, "catch_pending": false, "pending_cast": null })
	return { "ok": true, "skipsLeft": 3.0 - (used + 1.0) }


## A golden still waiting to be sold or mounted, or null.
static func held_golden(db: CaptainStore, uid: String) -> Variant:
	var held: Variant = db.oldest_held_shiny(uid)
	if held == null:
		return null
	var h: Dictionary = held
	var existing: Variant = db.collection_row(uid, float(h["fish_id"]))
	return {
		"id": h["id"], "name": Js.nz(h.get("name"), "A golden fish"), "fishId": h["fish_id"],
		"sizeIn": Js.num(h.get("size_in")), "alreadyMounted": existing != null and (existing as Dictionary).get("is_golden") == true,
	}


static func sell_golden_trophy(db: CaptainStore, uid: String, shiny_id: float) -> Dictionary:
	var trophy_v: Variant = db.shiny(uid, shiny_id)
	if trophy_v == null:
		return { "error": "Trophy not found" }
	var trophy: Dictionary = trophy_v
	if trophy["status"] != "hold":
		return { "error": "Trophy already resolved" }
	if trophy["fish_species"] == null:
		return { "error": "Species not found" }
	var p: Dictionary = db.profile(uid, "doubloons, fishing_renown_alloc, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid")
	var mult: float = float(Rules.fishing_renown(p.get("fishing_renown_alloc"))["sellMult"]) * float(Rules.eye_from_profile(p)["sellMult"])
	var species: Dictionary = trophy["fish_species"]
	var earned: float = floor(Js.num(species.get("sell_value")) * float(Rules.data()["shinySellMult"]) * mult)
	if earned <= 0:
		return { "error": "Trophy has no value" }
	var sold: Dictionary = db.resolve_shiny(shiny_id, { "status": "sold", "sold_at": _now_iso(), "sold_for": earned })
	if sold["failed"]:
		return { "error": "Could not sell that one. Try again." }
	if not sold["claimed"]:
		return { "error": "Trophy already resolved" }
	var now: float = db.grant(uid, "doubloons", earned)
	db.ledger(uid, earned, "Sold golden %s" % species["name"])
	return { "earned": earned, "doubloons": now }


static func mount_golden_trophy(db: CaptainStore, uid: String, shiny_id: float) -> Dictionary:
	var row_v: Variant = db.shiny(uid, shiny_id)
	if row_v == null:
		return { "error": "Trophy not found" }
	var row: Dictionary = row_v
	if row["status"] != "hold":
		return { "error": "Trophy already resolved" }
	var existing: Variant = db.collection_row(uid, float(row["fish_id"]))
	if existing != null and Js.truthy((existing as Dictionary).get("is_golden")):
		return { "error": "Already mounted" }
	var mounted: Dictionary = db.resolve_shiny(shiny_id, { "status": "mounted", "sold_at": _now_iso() })
	if mounted["failed"]:
		return { "error": "Could not mount that one. Try again." }
	db.set_golden(uid, float(row["fish_id"]))
	return { "ok": true, "fishId": row["fish_id"] }


## Pay every fishing level earned but not yet paid for. State-based, so a
## level reached through a trawl is paid the next time this runs.
static func claim_fishing_level_rewards(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "fishing_xp, claimed_fishing_levels, doubloons, gems, fish_hold_tier")
	var level: int = Rules.level_from_xp(Js.num(p.get("fishing_xp")))
	var claimed: float = float(Js.nz(p.get("claimed_fishing_levels"), 1.0))
	var table: Dictionary = Rules.data()["levelRewards"]
	var owed: Array = []
	for l: int in range(maxi(2, int(claimed) + 1), mini(level, int(Rules.data()["levelRewardMax"])) + 1):
		if table.has(str(l)):
			owed.append({ "level": float(l), "reward": table[str(l)] })
	if owed.is_empty():
		if level > claimed:
			db.update_profile(uid, { "claimed_fishing_levels": float(level) })
		return {
			"granted": [], "from": claimed, "to": maxf(claimed, level),
			"newDoubloons": Js.num(p.get("doubloons")), "newGems": Js.num(p.get("gems")), "newHoldTier": Js.num(p.get("fish_hold_tier")),
		}
	var doubloons: float = 0.0
	var gems: float = 0.0
	var hold_tier: float = Js.num(p.get("fish_hold_tier"))
	var bait: Dictionary = {}
	for o: Dictionary in owed:
		var r: Dictionary = o["reward"]
		doubloons += Js.num(r.get("doubloons"))
		gems += Js.num(r.get("gems"))
		if r.get("holdFloor") != null:
			hold_tier = maxf(hold_tier, float(r["holdFloor"]))
		for type: Variant in Js.obj(r.get("bait")):
			bait[type] = Js.num(bait.get(type)) + float((r["bait"] as Dictionary)[type])
	hold_tier = minf(hold_tier, float((Rules.data()["fishHoldTiers"] as Array).size() - 1))
	if not db.move_level_watermark(uid, null if p.get("claimed_fishing_levels") == null else claimed, level):
		return { "granted": [], "from": claimed, "to": claimed, "newDoubloons": 0.0, "newGems": 0.0, "newHoldTier": 0.0 }
	var new_d: float = db.grant(uid, "doubloons", doubloons)
	var new_g: float = db.grant(uid, "gems", gems)
	db.raise_hold_tier(uid, hold_tier)
	for type: Variant in bait:
		if float(bait[type]) > 0.0:
			db.add_bait(uid, type, bait[type])
	var first: int = int((owed[0] as Dictionary)["level"])
	if doubloons > 0.0:
		db.ledger(uid, doubloons, "Fishing level reward (Lv %d%s)" % [first, ("-%d" % level) if owed.size() > 1 else ""])
	return { "granted": owed, "from": claimed, "to": float(level), "newDoubloons": new_d, "newGems": new_g, "newHoldTier": hold_tier }


const ZONE_REWARD_COL: Dictionary = {
	"shallows": "zone_shallows_rewarded", "open_waters": "zone_open_waters_rewarded",
	"deep": "zone_deep_rewarded", "abyss": "zone_abyss_rewarded",
}


## The one-time payout for logging every species in a zone.
static func claim_zone_reward(db: CaptainStore, uid: String, zone: String) -> Dictionary:
	var col: String = ZONE_REWARD_COL.get(zone, "")
	if col == "":
		return { "error": "Invalid zone" }
	var ids: Array = db.species_ids_in(zone)
	var p: Dictionary = db.profile(uid, "doubloons, prestige_levels, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded")
	var caught: int = db.logged_count(uid, ids)
	if Js.truthy(p.get(col)):
		return { "error": "Already claimed" }
	if caught < ids.size() or ids.is_empty():
		return { "error": "Zone not complete" }
	var earned: float = FishingRules.zone_reward_doubloons(zone, Js.num(Js.obj(p.get("prestige_levels")).get(zone)))
	if earned == 0.0:
		return { "error": "Invalid zone" }
	if not db.flag_on(uid, col):
		return { "error": "Already claimed" }
	var now: float = db.grant(uid, "doubloons", earned)
	db.ledger(uid, earned, "Zone completion: %s" % zone)
	return { "doubloons": now, "earned": earned }


## Wipe a completed zone's cycle log for the next prestige (or, at the cap, a
## permanent golden boost).
static func prestige_zone(db: CaptainStore, uid: String, zone: String) -> Dictionary:
	if zone == "ancient_deep":
		return { "error": "Ancient Deep does not prestige" }
	var col: String = ZONE_REWARD_COL.get(zone, "")
	if col == "":
		return { "error": "Invalid zone" }
	var ids: Array = db.species_ids_in(zone)
	if ids.is_empty():
		return { "error": "Invalid zone" }
	var p: Dictionary = db.profile(uid, "prestige_levels, zone_golden_boost, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded, unlocked_character_colors")
	if not Js.truthy(p.get(col)):
		return { "error": "Claim completion reward first" }
	if db.logged_count(uid, ids) < ids.size():
		return { "error": "Zone not complete" }
	var max_level: float = float(Rules.data()["prestigeMax"])
	var step: Dictionary = FishingRules.prestige_step(Js.obj(p.get("prestige_levels")), Js.obj(p.get("zone_golden_boost")), zone, max_level)
	var patch: Dictionary = { "prestige_levels": step["newLevels"], col: false }
	if step["atMax"]:
		patch["zone_golden_boost"] = step["newGoldenBoosts"]
	if not db.update_profile_if(uid, patch, [{ "col": col, "eq": true }]):
		return { "error": "Claim completion reward first" }
	var goldens: Array = db.golden_ids(uid, ids)
	var clear: Array = []
	for id: Variant in ids:
		if not Js.includes(goldens, id):
			clear.append(id)
	db.clear_log(uid, clear)
	db.grant_badge(uid, "prestige_i")
	if step["allZonesPrestiged"]:
		db.grant_badge(uid, "zone_legend")
		db.grant_badge(uid, "full_collection")
	if step["atMax"]:
		return { "prestigeLevel": max_level, "goldenBoost": step["newGoldenBoost"] }
	return { "prestigeLevel": step["newLevel"] }


## THE LONG VIGIL: release a mounted giant back into the Ancient Deep.
static func release_ancient(db: CaptainStore, uid: String, fish_id: float) -> Dictionary:
	if not Vigil.ANCIENT_IDS.has(fish_id):
		return { "error": "That is not an Ancient" }
	var p: Dictionary = db.profile(uid, "ancient_catches, ancient_vigil")
	if not db.has_cleared(uid, "the_sunken_hand"):
		return { "error": "The deep does not answer to you yet." }
	var vigil: Dictionary = Vigil.state_for(p.get("ancient_vigil"), p.get("ancient_catches"))
	var key: String = Js.key(fish_id)
	var entry: Variant = vigil.get(key)
	if entry == null:
		return { "error": "You have never landed that one" }
	if (entry as Dictionary)["released"] == true:
		return { "error": "That one is already out there" }
	if float((entry as Dictionary)["rank"]) >= Vigil.MAX_RANK:
		return { "error": "That one is already mastered" }
	vigil[key] = { "rank": (entry as Dictionary)["rank"], "released": true }
	db.update_profile(uid, { "ancient_vigil": vigil })
	db.grant_badge(uid, "back_to_the_dark")
	return { "ok": true, "vigil": vigil }
