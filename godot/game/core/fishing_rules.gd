class_name FishingRules
extends RefCounted
## THE FISHING RULES, a port of web/lib/fishingRules.ts (Godot port, stage 1).
##
## What a cast rolls and what a landing pays, as plain functions over plain
## inputs; lib/core/fishing (here core/fishing.gd) reads, claims and writes.
## Every roll goes through Dice.next() IN THE TS'S ORDER, including where a
## short-circuit decides whether a roll happens at all.
##
## Results are dictionaries shaped like the TS's objects. A key the TS leaves
## undefined is left out here (JSON drops it); a key the TS sets to null is
## kept as null.

const CRATE_FISH_ID: float = -1.0
const EVENT_DURATION_MS: float = 120000.0
const MEGALODON_ID: float = 143.0
const MEGALODON_PREREQS: Array[float] = [144.0, 145.0, 146.0, 147.0, 148.0]
const PERFECT_BAIT_SAVE_CHANCE: float = 0.5
const CRATE_WAIT: Dictionary = { "shallows": 4000.0, "open_waters": 7000.0, "deep": 11000.0, "abyss": 16000.0 }


static func fish_wait_ms(habitat: String, bait_type: String, fishing_level: float, renown_wait_mult: float, rod_mult: float) -> float:
	var band: Array = Js.nz((Rules.data()["zones"]["waitBase"] as Dictionary).get(habitat), [13000.0, 21000.0])
	var z_min: float = float(band[0])
	var z_max: float = float(band[1])
	var base: float = z_min + Dice.next() * (z_max - z_min)
	var bait_mult: float = float(Rules.bait(bait_type)["waitMult"])
	var level_mult: float = 1.0 - ((fishing_level - 1.0) / 99.0) * 0.33
	return maxf(3000.0, Js.round(base * bait_mult * level_mult * renown_wait_mult * rod_mult))


## Two-stage pick: a rarity tier on the zone's rates (rod bias applied), then
## uniformly within it.
static func tier_weighted_pick(items: Array, habitat: String, rarity_bonus: float) -> Dictionary:
	var all_rates: Dictionary = Rules.data()["zones"]["rarityRates"]
	var base_rates: Dictionary = all_rates.get(habitat, all_rates["shallows"])
	var groups: Dictionary = {}
	var tiers: Array = []
	for item: Dictionary in items:
		var r: float = float(item["bite_rarity"])
		if not groups.has(r):
			groups[r] = []
			tiers.append(r)
		(groups[r] as Array).append(item)
	var adjusted: Dictionary = {}
	for r: float in tiers:
		adjusted[r] = float(base_rates.get(Js.key(r), 0.0)) * (1.0 + rarity_bonus * (r - 1.0))
	var total: float = 0.0
	for r: float in tiers:
		total += float(adjusted[r])
	if total == 0.0:
		return items[int(floor(Dice.next() * items.size()))]
	var rand: float = Dice.next() * total
	var selected: float = tiers[0]
	for r: float in tiers:
		rand -= float(adjusted[r])
		if rand <= 0:
			selected = r
			break
	var pool: Array = groups[selected]
	return pool[int(floor(Dice.next() * pool.size()))]


static func roll_crate_tier(habitat: String) -> String:
	var all_tiers: Dictionary = Rules.data()["zones"]["crateTiers"]
	var dist: Dictionary = all_tiers.get(habitat, all_tiers["shallows"])
	var total: float = 0.0
	for t: Variant in dist:
		total += float(dist[t])
	var r: float = Dice.next() * total
	for t: Variant in dist:
		r -= float(dist[t])
		if r < 0:
			return t
	return dist.keys().back() if dist.size() > 0 else "wooden"


## The zone event running on this profile, if it has not expired.
static func active_event_of(raw: Variant) -> Variant:
	if typeof(raw) != TYPE_DICTIONARY:
		return null
	var e: Dictionary = raw
	if not Js.truthy(e.get("type")) or not Js.truthy(e.get("started_at")):
		return null
	if Clock.now_ms() - Js.parse_ms(e["started_at"]) > EVENT_DURATION_MS:
		return null
	return { "type": e["type"] }


static func zone_crate_chance(zone: String) -> float:
	var z: Dictionary = Rules.data()["zones"]
	return float(z["ancientCrateChance"]) if zone == "ancient_deep" else float(z["baseCrateChance"])


## ONE CAST, ROLLED (rollCast). Input keys as the TS's CastRollInput.
## Returns { error } or { crate, shot, token, fish? }.
static func roll_cast(i: Dictionary) -> Dictionary:
	var habitat: String = i["habitat"]
	var bait_type: String = i["baitType"]
	var candidates: Array = i["candidates"]
	var rod: Dictionary = i["rod"]
	var locked: Dictionary = i["locked"]
	var patience: Dictionary = i["patience"]
	var renown: Dictionary = i["renown"]
	var hs: Dictionary = i["hotspot"]
	var event_bonus: float = i["eventRarityBonus"]
	var stale: Variant = i["stale"]
	var first_ever: bool = i["firstEver"]
	if candidates.is_empty():
		return { "error": "No fish found in this zone" }

	var vigil_state: Dictionary = {}
	var pool: Array = candidates
	if habitat == "ancient_deep":
		var caught: Array = i["ancientCatches"]
		var vigil: Dictionary = Vigil.state_for(i["ancientVigil"], caught)
		vigil_state = vigil
		var is_lure: bool = bait_type == "luminous" or bait_type == "golden"
		var megalodon_locked: bool = false
		for id: float in MEGALODON_PREREQS:
			if not Js.includes(caught, id):
				megalodon_locked = true
		pool = []
		for f: Dictionary in candidates:
			var fid: float = float(f["id"])
			if Js.includes(caught, fid) and not Vigil.is_released(vigil, fid):
				continue
			if not is_lure and not i["alwaysAncientTrophy"] and Js.num(f.get("sell_value")) == 0.0:
				continue
			if fid == MEGALODON_ID and megalodon_locked:
				continue
			pool.append(f)
		if pool.is_empty():
			return { "error": "You have caught every Ancient Deep species available with this bait!" }

	var is_crate: bool
	if first_ever:
		is_crate = false
	elif stale != null:
		is_crate = float((stale as Dictionary)["fishId"]) == CRATE_FISH_ID
	else:
		is_crate = Dice.next() < zone_crate_chance(habitat) * float(Js.nz(rod.get("crateChanceMult"), 1.0)) * float(patience["crateChanceMult"]) * float(renown["crateChanceMult"]) * float(hs["crateChanceMult"])

	if is_crate:
		var crate_wait: float = CRATE_WAIT.get(habitat, 6000.0)
		var crate_tier: String = roll_crate_tier(habitat)
		var shot: Dictionary = { "fishId": CRATE_FISH_ID, "catchDifficulty": 1.0, "biteRarity": 1.0, "waitMs": crate_wait, "crateTier": crate_tier }
		var token: Dictionary = { "fishId": CRATE_FISH_ID, "habitat": habitat, "baitType": bait_type, "crateTier": crate_tier, "jackpotMult": 1.0, "doubleCatch": false, "castAt": Clock.now_ms(), "shot": shot }
		return { "crate": true, "shot": shot, "token": token }

	var fish: Dictionary
	if habitat == "ancient_deep":
		var trophy_pool: Array = []
		var regular_pool: Array = []
		for f: Dictionary in pool:
			if Js.num(f.get("sell_value")) == 0.0:
				trophy_pool.append(f)
			elif Js.num(f.get("sell_value")) > 0.0:
				regular_pool.append(f)
		var ever: Array = i["ancientCatches"]
		var first_hunt: Array = []
		var released: Array = []
		for f: Dictionary in trophy_pool:
			if Js.includes(ever, f["id"]):
				released.append(f)
			else:
				first_hunt.append(f)
		var rarity_bonus: float = float(rod["rarityBonus"]) + event_bonus + float(locked["rarityBonus"])
		var base_trophy: float = 0.20 if bait_type == "golden" else (0.15 if bait_type == "luminous" else 0.0)
		var trophy_chance: float = minf(0.95, base_trophy * (1.0 + rarity_bonus * 4.0))
		var on_lure: bool = bait_type == "luminous" or bait_type == "golden"
		var vigil_hit: Variant = null
		if on_lure:
			for f: Dictionary in released:
				var attempting: float = minf(Vigil.MAX_RANK, Vigil.rank_of(vigil_state, float(f["id"])) + 1.0)
				if Dice.next() < Vigil.hunt_chance(attempting, rarity_bonus, "golden" if bait_type == "golden" else "luminous"):
					vigil_hit = f
					break
		var next_in_order: Variant = null
		for id: float in Vigil.ANCIENT_IDS:
			for f: Dictionary in first_hunt:
				if float(f["id"]) == id:
					next_in_order = f
					break
			if next_in_order != null:
				break
		if i["alwaysAncientTrophy"] and trophy_pool.size() > 0:
			if next_in_order != null:
				fish = next_in_order
			else:
				var sorted: Array = trophy_pool.duplicate()
				sorted.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["id"]) < float(b["id"]))
				fish = sorted[0]
		elif vigil_hit != null:
			fish = vigil_hit
		elif next_in_order != null and Dice.next() < trophy_chance:
			fish = next_in_order
		elif regular_pool.size() > 0:
			fish = tier_weighted_pick(regular_pool, habitat, float(rod["rarityBonus"]) + event_bonus + float(locked["rarityBonus"]) + float(hs["rarityBonus"]))
		else:
			fish = trophy_pool[int(floor(Dice.next() * trophy_pool.size()))]
	elif first_ever:
		var sorted: Array = pool.duplicate()
		# A stable sort, as Array.prototype.sort is: ties keep their order.
		var keyed: Array = []
		for idx: int in sorted.size():
			keyed.append([sorted[idx], idx])
		keyed.sort_custom(func(a: Array, b: Array) -> bool:
			var fa: Dictionary = a[0]
			var fb: Dictionary = b[0]
			var d: float = float(fa["bite_rarity"]) - float(fb["bite_rarity"])
			if d == 0.0:
				d = float(fa["catch_difficulty"]) - float(fb["catch_difficulty"])
			if d == 0.0:
				return int(a[1]) < int(b[1])
			return d < 0.0)
		fish = keyed[0][0]
	else:
		fish = tier_weighted_pick(pool, habitat, float(rod["rarityBonus"]) + event_bonus + float(locked["rarityBonus"]) + float(hs["rarityBonus"]))

	var wait_ms: float = fish_wait_ms(habitat, bait_type, float(i["fishingLevel"]), float(renown["biteWaitMult"]), minf(Rules.rod_wait_mult(rod), float(locked["waitMult"])) * float(patience["waitMult"]) * float(hs["waitMult"]))

	var instant_bite: bool = false
	var ibc: float = Js.num(rod.get("instantBiteChance"))
	if ibc > 0 and Dice.next() < ibc:
		wait_ms = minf(wait_ms, 700.0)
		instant_bite = true

	var sell: float = Js.num(fish.get("sell_value"))
	var is_trophy_roll: bool = habitat == "ancient_deep" and sell == 0.0
	var dcc: float = Js.num(rod.get("doubleCatchChance"))
	var can_double_here: bool = habitat != "ancient_deep" or dcc >= 1.0
	var zone_jackpot: float = 0.0 if is_trophy_roll else Rules.jackpot_chance_for_zone(rod, habitat)
	var jackpot_hit: bool = not first_ever and zone_jackpot > 0 and Dice.next() < zone_jackpot
	var jackpot_mult: float = float(Js.nz(rod.get("jackpotMultiplier"), 1.0)) if jackpot_hit else 1.0
	var double_catch: bool = not first_ever and not jackpot_hit and not is_trophy_roll and can_double_here and dcc > 0 and Dice.next() < dcc

	var locked_qty: Variant = float(locked["catchQty"]) if float(locked["catchQty"]) > 1 else null
	var vigil_attempt: Variant = null
	if habitat == "ancient_deep" and Vigil.is_released(vigil_state, float(fish["id"])):
		vigil_attempt = minf(Vigil.MAX_RANK, Vigil.rank_of(vigil_state, float(fish["id"])) + 1.0)
	var shot: Dictionary = { "fishId": fish["id"], "catchDifficulty": fish["catch_difficulty"], "biteRarity": fish["bite_rarity"], "waitMs": wait_ms, "instantBite": instant_bite, "jackpotMult": jackpot_mult, "doubleCatch": double_catch }
	if locked_qty != null:
		shot["catchQty"] = locked_qty
	shot["lockedStage"] = locked["stage"]
	if vigil_attempt != null:
		shot["vigilRank"] = vigil_attempt
	var token: Dictionary = { "fishId": fish["id"], "habitat": habitat, "baitType": bait_type, "jackpotMult": jackpot_mult, "doubleCatch": double_catch }
	if locked_qty != null:
		token["catchQty"] = locked_qty
	token["castAt"] = Clock.now_ms()
	token["shot"] = shot
	return { "crate": false, "fish": fish, "shot": shot, "token": token }


# ── The landing ────────────────────────────────────────────────────────────────

## The Borrowed Jaw's charge on fishing xp, or null when not mounted.
static func jaw_charge_after(p: Dictionary, xp_gained: float) -> Variant:
	var mounted: bool = Js.includes(Js.list(p.get("equipped_raid_items")), "borrowed_jaw") \
		and (p.get("finn_spoil_free") == "nav" or p.get("finn_spoil_paid") == "nav")
	return Js.num(p.get("borrowed_jaw_xp")) + xp_gained if mounted else null


static func streak_record(streak: float, best: float, zone: String) -> Dictionary:
	if streak > Rules.STREAK_RECORD_CEILING:
		return { "anomaly": true, "updates": {} }
	if streak > best:
		return { "anomaly": false, "updates": { "highest_perfect_streak": streak, "highest_streak_set_at": Js.iso(Clock.now_ms()), "best_streak_zone": zone } }
	return { "anomaly": false, "updates": {} }


## ONE OF THE SIX GIANTS, LANDED (landAncient).
static func land_ancient(p: Dictionary, fish_id: float, result: String, renown_xp_mult: float) -> Dictionary:
	var existing: Array = Js.list(p.get("ancient_catches"))
	var is_new: bool = not Js.includes(existing, fish_id)
	var vigil: Dictionary = Vigil.state_for(p.get("ancient_vigil"), existing)
	var vkey: String = Js.key(fish_id)
	var entry: Dictionary = vigil.get(vkey, {})
	var was_released: bool = entry.get("released") == true
	var from_rank: float = float(Js.nz(entry.get("rank"), 1.0))
	var paid_through: float = float(Js.nz(entry.get("paid"), 0.0))
	var perfect: bool = result == "perfect"

	var xp_gained: float = Js.round(Vigil.catch_xp(is_new, was_released, from_rank, perfect, paid_through) * renown_xp_mult)
	var jaw: Variant = jaw_charge_after(p, xp_gained)
	var new_xp: float = Js.num(p.get("fishing_xp")) + xp_gained
	var a_streak: float = Js.num(p.get("current_perfect_streak")) + 1.0 if perfect else 0.0
	var updates: Dictionary = { "fishing_xp": new_xp, "current_perfect_streak": a_streak, "catch_pending": false }
	if jaw != null:
		updates["borrowed_jaw_xp"] = jaw
	if perfect:
		updates["total_perfects"] = Js.num(p.get("total_perfects")) + 1.0
	var rec: Dictionary = streak_record(a_streak, Js.num(p.get("highest_perfect_streak")), "ancient_deep")
	updates.merge(rec["updates"], true)
	if is_new:
		var next: Array = existing.duplicate()
		next.append(fish_id)
		updates["ancient_catches"] = next

	var rank_up: Variant = null
	var grant_pet: bool = false
	var written: bool = false
	if was_released:
		var ranked: bool = perfect and from_rank < Vigil.MAX_RANK
		var to: float = from_rank + 1.0 if ranked else from_rank
		var paid: float = Vigil.paid_after(was_released, from_rank, perfect, paid_through)
		vigil[vkey] = { "rank": to, "released": false, "paid": paid } if paid > 0 else { "rank": to, "released": false }
		updates["ancient_vigil"] = vigil
		written = true
		if ranked:
			rank_up = { "from": from_rank, "to": to }
		if Vigil.complete(vigil):
			grant_pet = not Js.includes(Js.list(p.get("unlocked_pets")), Vigil.PET_ID)
	var trophy_count: float = existing.size() + 1.0 if is_new else float(existing.size())
	var badges: Array = []
	if trophy_count >= 6:
		badges.append("ancient_ones")
	if a_streak >= 10:
		badges.append("unbroken")
	var sigil: float = minf(a_streak, 3.0) * 10.0 if perfect and Js.truthy(p.get("has_perfected_sigil")) and p.get("equipped_special") == "perfected_sigil" else 0.0
	return {
		"isNewTrophy": is_new, "xpGained": xp_gained, "newXP": new_xp, "perfectStreak": a_streak, "updates": updates,
		"anomaly": rec["anomaly"], "vigil": vigil, "vigilWritten": written, "vigilRankUp": rank_up, "grantVigilPet": grant_pet,
		"trophyCount": trophy_count, "sigilBonus": sigil, "badges": badges,
	}


## AN ORDINARY FISH, LANDED (landFish). Input keys as the TS's FishLandingInput.
static func land_fish(i: Dictionary) -> Dictionary:
	var p: Dictionary = i["profile"]
	var fish: Dictionary = i["fish"]
	var rod: Dictionary = i["rod"]
	var eye: Dictionary = i["eye"]
	var perfect: bool = i["result"] == "perfect"
	var habitat: String = fish["habitat"]

	var bait_saved: bool = perfect and Dice.next() < PERFECT_BAIT_SAVE_CHANCE
	var phantom_seated: bool = Js.truthy(p.get("has_phantom_hook")) and p.get("equipped_special") == "phantom_hook"
	if not bait_saved and phantom_seated:
		bait_saved = Dice.next() < 0.25
	if not bait_saved and eye["perfectBaitSave"] and perfect:
		bait_saved = true

	var forced_once: bool = Js.truthy(p.get("force_shiny_next_perfect")) and perfect
	var forced_always: bool = Js.truthy(p.get("force_shiny_always"))
	var golden_wipes: float = Js.num(Js.obj(p.get("zone_golden_boost")).get(habitat))
	var is_shiny: bool = forced_once or forced_always or Rules.roll_shiny(perfect, Js.num(fish.get("sell_value")), Rules.golden_boost_mult(golden_wipes) * float(eye["goldenOddsMult"]))

	var dcc: float = Js.num(rod.get("doubleCatchChance"))
	var no_double: bool = habitat == "ancient_deep" and dcc < 1.0
	var eff_double: bool = i["doubleCatch"] and not no_double
	var eff_jackpot: float = minf(float(i["jackpotMult"]), 100.0)
	var locked_qty: float = float(i["lockedCatchQty"])
	var desired: float = 1.0 if is_shiny else (eff_jackpot if eff_jackpot > 1 else (locked_qty if locked_qty > 1 else (2.0 if eff_double else 1.0)))
	var catch_qty: float = 1.0 if is_shiny else minf(desired, maxf(0.0, float(i["holdCapacity"]) - float(i["holdCount"])))

	var abyss_streak: float = Js.num(p.get("fishing_abyss_streak")) + 1.0 if perfect and habitat == "abyss" else 0.0
	var zone_perfects: Dictionary = Js.obj(p.get("zone_perfects")).duplicate()
	if perfect:
		zone_perfects[habitat] = Js.num(zone_perfects.get(habitat)) + 1.0
	var zone_prestige: float = Js.num(Js.obj(p.get("prestige_levels")).get(habitat))
	var prestige_mult: float = 1.0 + minf(zone_prestige, 5.0) * 0.10
	var perfect_xp_mult: float = float(Js.nz(rod.get("perfectXpMult"), 1.0)) if perfect else 1.0
	var new_streak: float = Js.num(p.get("current_perfect_streak")) + 1.0 if perfect else 0.0
	var mult: float = Rules.streak_mult(new_streak, Rules.level_from_xp(Js.num(p.get("fishing_xp"))))
	var base_xp: float = Rules.catch_xp(float(fish["catch_difficulty"]), habitat, perfect)
	var streak_bonus: float = Js.round(base_xp * (mult - 1.0))
	var rx: float = float(i["renownXpMult"])
	var ex: float = float(eye["fishingXpMult"])
	var xp_gained: float = Js.round((base_xp + streak_bonus) * prestige_mult * perfect_xp_mult * rx * ex)
	var perfect_bonus: Variant = null
	if perfect:
		perfect_bonus = Js.round(base_xp * prestige_mult * perfect_xp_mult * rx * ex) - Js.round(Rules.catch_xp(float(fish["catch_difficulty"]), habitat, false) * prestige_mult * rx * ex)
	var xp_streak: float = xp_gained - Js.round(base_xp * prestige_mult * perfect_xp_mult * rx * ex)
	var xp_catch: float = xp_gained - Js.num(perfect_bonus) - xp_streak
	var jaw: Variant = jaw_charge_after(p, xp_gained)
	var new_xp: float = Js.num(p.get("fishing_xp")) + xp_gained

	var sigil: float = minf(new_streak, 3.0) * 10.0 if perfect and Js.truthy(p.get("has_perfected_sigil")) and p.get("equipped_special") == "perfected_sigil" else 0.0
	var wormhole: bool = Js.truthy(rod.get("wormhole")) and not is_shiny and catch_qty > 0

	var updates: Dictionary = { "fishing_abyss_streak": abyss_streak, "fishing_xp": new_xp, "current_perfect_streak": new_streak, "catch_pending": false }
	if perfect:
		updates["zone_perfects"] = zone_perfects
	if jaw != null:
		updates["borrowed_jaw_xp"] = jaw
	if perfect:
		updates["total_perfects"] = Js.num(p.get("total_perfects")) + 1.0
	var rec: Dictionary = streak_record(new_streak, Js.num(p.get("highest_perfect_streak")), habitat)
	updates.merge(rec["updates"], true)

	var from: int = Rules.level_from_xp(Js.num(p.get("fishing_xp")))
	var to: int = Rules.level_from_xp(new_xp)
	var badges: Array = []
	if from < 100 and to >= 100:
		badges.append("master_angler")
	if new_streak >= 10:
		badges.append("unbroken")

	var size_min: Variant = null if fish.get("length_min_in") == null else Js.num(fish["length_min_in"])
	var size_max: Variant = null if fish.get("length_max_in") == null else Js.num(fish["length_max_in"])
	var size_in: float = 0.0
	var size_tier: Variant = null
	if size_min != null and size_max != null:
		if is_shiny:
			size_in = size_max
			size_tier = "trophy"
		else:
			var roll: Dictionary = Rules.roll_fish_size(size_min, size_max)
			size_in = roll["lengthIn"]
			size_tier = roll["tier"]

	var deep_stirs: bool = habitat == "ancient_deep" \
		and i["baitType"] != "luminous" and i["baitType"] != "golden" \
		and Js.list(p.get("ancient_catches")).size() < 6 \
		and Dice.next() < 0.14

	var size: Dictionary = { "sizeIn": size_in, "sizeMin": size_min, "sizeMax": size_max }
	if size_tier != null:
		size["sizeTier"] = size_tier
	var out: Dictionary = {
		"baitSaved": bait_saved, "isShiny": is_shiny, "catchQty": catch_qty, "effectiveDoubleCatch": eff_double, "effectiveJackpotMult": eff_jackpot,
		"xpGained": xp_gained, "newXP": new_xp, "streakBonusXP": streak_bonus, "xpCatch": xp_catch, "xpStreak": xp_streak, "perfectStreak": new_streak,
		"sigilBonus": sigil, "wormhole": wormhole, "size": size, "deepStirs": deep_stirs,
		"updates": updates, "anomaly": rec["anomaly"], "levels": { "from": from, "to": to }, "badges": badges,
	}
	if perfect_bonus != null:
		out["perfectBonusXP"] = perfect_bonus
	return out


# ── Timing and crates ──────────────────────────────────────────────────────────

static func bite_floor_ms(token: Dictionary) -> float:
	var shot: Dictionary = Js.obj(token.get("shot"))
	if Js.truthy(shot.get("instantBite")):
		return 760.0
	return maxf(760.0, Js.num(shot.get("waitMs")))


static func reel_too_early(token: Dictionary) -> Dictionary:
	var floor_ms: float = bite_floor_ms(token)
	var elapsed: float = Clock.now_ms() - Js.num(token.get("castAt"))
	return { "early": elapsed < floor_ms, "elapsed": elapsed, "floor": floor_ms }


static func crate_streak(p: Dictionary, result: String, habitat: String) -> Dictionary:
	var streak: float = Js.num(p.get("current_perfect_streak")) + 1.0 if result == "perfect" else 0.0
	var rec: Dictionary = streak_record(streak, Js.num(p.get("highest_perfect_streak")), habitat)
	var updates: Dictionary = { "current_perfect_streak": streak, "catch_pending": false }
	updates.merge(rec["updates"], true)
	return { "streak": streak, "updates": updates, "anomaly": rec["anomaly"] }
