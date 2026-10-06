class_name RaidRun
extends RefCounted
## A RAID'S REWARDS (a port of lib/core/raids.ts awardRaidKill, raidRules'
## raidKillReward and rollRaidCrate, and lib/raidLoot rollCrate), paid into
## each captain's own save (in a Charter, the host pays every captain in the
## fight into theirs: full XP to each, personal crates, nothing split).
##
##   A KILL: the enemy's Navigation XP and doubloons (the boss adds the raid's
##   completion bonus, a quarter of all its kills' XP); every crew hand seated
##   for raids takes the same XP.
##   THE CRATE (a raid's boss; never a skirmish): 300 to 600 doubloons times
##   Fortune (1 + fortune/75), and each of the raid's items rolled on its own
##   (epic 10%, legendary 5%, cosmetic 2.5%; a challenge doubles them; times
##   1 + min(1, fortune/150), at most 95%). A skin or special item already
##   owned is passed over. PORT RULE: gems are retired, so the crate always
##   pays its coin (the web's gem rows paid gems instead).


static func completion_bonus(raid: Dictionary) -> float:
	var tot: float = 0.0
	var kr: Dictionary = Js.obj(raid.get("killRewards"))
	for id: Variant in Js.list(raid.get("sequence")):
		tot += Js.num(Js.obj(kr.get(id)).get("xp"))
	tot += Js.num(Js.obj(kr.get(raid["bossId"])).get("xp"))
	return float(Js.round(tot * 0.25))


## A kill, paid into one captain's save.
## tier: a co-op tier's rules (Battle.tier_cfg) and share: an escort's part of
## a kill (the tier's escortPay); Normal leaves both alone, as the web pays.
static func award_kill(db: CaptainStore, uid: String, raid: Dictionary, enemy_id: String, boss: bool, tier: Dictionary = {}, share: float = 1.0) -> Dictionary:
	var kr: Dictionary = Js.obj(Js.obj(raid.get("killRewards")).get(enemy_id))
	var xp: float = Js.num(kr.get("xp")) + (completion_bonus(raid) if boss else 0.0)
	if not tier.is_empty():
		xp = float(Js.round(xp * float(tier["xp"]) * share))
	# Plunder (Navigation Renown) and the class's coin; Command lifts crew XP.
	var ren: Dictionary = Js.obj(db.me(uid).get("nav_renown_alloc"))
	var plunder: float = 1.0 + maxf(0.0, floor(Js.num(ren.get("plunder")))) * 0.015
	var command: float = 1.0 + maxf(0.0, floor(Js.num(ren.get("command")))) * 0.02
	var gold: float = float(Js.round(Js.num(kr.get("gold")) * float(Campaign.class_effects(db.me(uid).get("ship_classes"))["doubloonMult"]) * plunder))
	if not tier.is_empty():
		gold = float(Js.round(gold * float(tier["coin"]) * share))
	if xp > 0.0:
		db.bump_stat(uid, "expedition_xp", xp)
	if gold > 0.0:
		db.bump_stat(uid, "doubloons", gold)
		db.ledger(uid, gold, "%s: %s sunk" % [raid.get("raidTitle", "Raid"), enemy_id])
	var crew_grants: Array = []
	for c: Dictionary in Crew.live(db):
		if c.get("raid_slot") != null and xp > 0.0:
			var old: float = Js.num(c.get("xp"))
			var cxp: float = float(Js.round(xp * command))
			c["xp"] = old + cxp
			crew_grants.append({ "id": c["id"], "oldLevel": float(Crew.level(old)), "newLevel": float(Crew.level(old + cxp)), "gained": cxp })
	return { "xp": xp, "doubloons": gold, "crew": crew_grants }


## The boss's crate, into one captain's save.
static func open_crate(db: CaptainStore, uid: String, raid: Dictionary, fortune: float, tier: Dictionary = {}) -> Dictionary:
	if raid.get("skirmish", false) == true:
		return {}
	var prof: Dictionary = db.me(uid)
	var base: float = floor(Dice.next() * 301.0 + 300.0)
	var coin: float = minf(3000.0, floor(base * (1.0 + maxf(0.0, fortune) / 75.0)))
	coin = float(Js.round(coin * float(Campaign.class_effects(prof.get("ship_classes"))["doubloonMult"])))
	if not tier.is_empty():
		coin = float(Js.round(coin * float(tier["coin"])))
	var rolls: int = 1 + int(Js.num(tier.get("extraRolls")))
	var items: Array = []
	var owned: Array = Js.list(prof.get("owned_ship_skins"))
	var spec: Dictionary = Rules.data()["specialOwnedColumn"]
	# A crate that pays one of its items, or none (the Quartermaster's Ghost:
	# uniqueShare, the web's rule; the port had rolled every item apart).
	var share: float = Js.num(raid.get("uniqueShare"))
	if share > 0.0 and not Rules.web_only:
		var pool: Array = []
		for row0: Dictionary in Js.list(raid.get("loot")):
			if rollable(row0, owned):
				pool.append(row0)
		var p0: float = minf(0.95, share * (1.0 + minf(1.0, fortune / 150.0)) * float(Js.nz(tier.get("rarityMult"), 1.0)))
		for k0: int in rolls:
			if not pool.is_empty() and Dice.next() < p0:
				var got: Dictionary = pool[int(floor(Dice.next() * pool.size()))]
				if not items.has(got):
					items.append(got)
	for row: Dictionary in (Js.list(raid.get("loot")) if share <= 0.0 or Rules.web_only else []):
		# Coin rows and owned skins are passed over without a roll; every other
		# row rolls (at 0 too), as the web's does.
		if not rollable(row, owned):
			continue
		# A special already owned (the Primeval Eye) is not rolled again: it
		# would only re-seat itself over the captain's choice (the audit).
		if not Rules.web_only and spec.has(row["id"]) and prof.get(spec[row["id"]]) == true:
			continue
		var p: float = item_chance(raid, row, fortune, tier, owned, 2.0 if Gauntlet.owns(prof, "dg_kingpin_cut") else 1.0)
		# A tier's extra rolls: each a fresh chance, the item at most once.
		for k: int in rolls:
			if Dice.next() < p:
				items.append(row)
				break
	db.bump_stat(uid, "doubloons", coin)
	db.ledger(uid, coin, "%s: the crate" % raid.get("raidTitle", "Raid"))
	for row: Dictionary in items:
		if row.get("shipSkinId") != null:
			db.add_to_list(uid, "owned_ship_skins", row["shipSkinId"])
		elif not Rules.web_only and (Rules.data()["specialOwnedColumn"] as Dictionary).has(row["id"]):
			# A special item (the Primeval Eye off the Sunken Hand) is owned by
			# its flag, as the web's ITEM_GRANTS does, not held as raid gear.
			db.update_profile(uid, { (Rules.data()["specialOwnedColumn"] as Dictionary)[row["id"]]: true })
			# The Eye seats itself in the Sunken Hand's slot (the web's grant).
			if row["id"] == "anglers_patience":
				db.update_profile(uid, { "equipped_special_2": "anglers_patience" })
		else:
			var held: Array = Js.list(prof.get("raid_items")).duplicate()
			held.append(row["id"])
			db.update_profile(uid, { "raid_items": held })
	return { "coin": coin, "items": items }


## A raid cleared, in the captain's record (raidLocal addClear; the campaign
## map reads it): the clear and its time. The Reef Skirmish is not a raid
## (recordSkirmishClear): it sets has_completed_practice_raid and nothing else.
static func record_clear(db: CaptainStore, uid: String, raid_id: String, ms: Variant = null) -> void:
	if raid_id == "reef_skirmish":
		db.update_profile(uid, { "has_completed_practice_raid": true })
		return
	db.add_clear(uid, raid_id, ms)



## One roll's chance at a crate item (0 for coin rows and owned skins): its
## rarity's odds (a challenge raid's doubled), Fortune's lift, a co-op tier's
## rarityMult. The web's crate for Normal.
static func rollable(row: Dictionary, owned_skins: Array) -> bool:
	var rid: String = str(row["id"])
	if rid.begins_with("doubloons") or rid.begins_with("gems") or rid.begins_with("pack"):
		return false
	return not (row.get("shipSkinId") != null and owned_skins.has(row["shipSkinId"]))


static func item_chance(raid: Dictionary, row: Dictionary, fortune: float, tier: Dictionary = {}, owned_skins: Array = [], legend_mult: float = 1.0) -> float:
	if not rollable(row, owned_skins):
		return 0.0
	var challenge: bool = str(raid["raidId"]).ends_with("_challenge")
	var flm: float = 1.0 + minf(1.0, fortune / 150.0)
	var rarity: Dictionary = { "epic": 0.20 if challenge else 0.10, "legendary": 0.10 if challenge else 0.05, "cosmetic": 0.05 if challenge else 0.025, "ancient": 0.10 if challenge else 0.05 }
	# Kingpin's Cut (the Don's Locker): legendaries twice as often (and, as
	# the web had it, the ancients).
	var rar: String = str(row.get("rarity", ""))
	var lm: float = legend_mult if rar == "legendary" or (rar == "ancient" and not Rules.web_only) else 1.0
	return minf(0.95, float(rarity.get(str(row.get("rarity", "")), 0.0)) * flm * float(Js.nz(tier.get("rarityMult"), 1.0)) * lm)


## The crate as the entry screen shows it: each item it can pay and the chance
## this captain's crate holds it (all a tier's rolls together), and the coin.
static func crate_odds(raid: Dictionary, fortune: float, tier: Dictionary = {}, owned_skins: Array = [], legend_mult: float = 1.0) -> Dictionary:
	var rolls: int = 1 + int(Js.num(tier.get("extraRolls")))
	var out: Array = []
	var share: float = Js.num(raid.get("uniqueShare"))
	if share > 0.0 and not Rules.web_only:
		var pool: Array = Js.list(raid.get("loot")).filter(func(r0: Dictionary) -> bool: return rollable(r0, owned_skins))
		var p0: float = minf(0.95, share * (1.0 + minf(1.0, fortune / 150.0)) * float(Js.nz(tier.get("rarityMult"), 1.0)))
		for r1: Dictionary in pool:
			out.append({ "id": r1["id"], "label": r1.get("label", r1["id"]), "rarity": r1.get("rarity", ""), "chance": 1.0 - pow(1.0 - p0 / float(pool.size()), rolls), "image": r1.get("image", "") })
	for row: Dictionary in (Js.list(raid.get("loot")) if share <= 0.0 or Rules.web_only else []):
		var p: float = item_chance(raid, row, fortune, tier, owned_skins, legend_mult)
		if p > 0.0:
			out.append({ "id": row["id"], "label": row.get("label", row["id"]), "rarity": row.get("rarity", ""), "chance": 1.0 - pow(1.0 - p, rolls), "image": row.get("image", "") })
	var cm: float = float(Js.nz(tier.get("coin"), 1.0))
	var lift: float = 1.0 + maxf(0.0, fortune) / 75.0
	return { "items": out, "coinMin": float(Js.round(minf(3000.0, floor(300.0 * lift)) * cm)), "coinMax": float(Js.round(minf(3000.0, floor(600.0 * lift)) * cm)) }


## A tier clear's record: the clear of the raid itself (the campaign reads
## it) and the tier's own ("raid@coop"). Returns whether it is this captain's
## first clear of that tier (the stamp says so).
static func record_tier_clear(db: CaptainStore, uid: String, raid_id: String, tier_id: String, tier: Dictionary, ms: Variant = null) -> bool:
	var key: String = raid_id if tier_id == "normal" or tier.is_empty() else "%s@%s" % [raid_id, tier_id]
	var first: bool = db.clear_count(uid, key) == 0
	record_clear(db, uid, raid_id, ms)
	if key != raid_id:
		db.add_clear(uid, key, ms)
	return first


## Which tiers of a raid this captain has beaten.
static func tier_clears(db: CaptainStore, uid: String, raid_id: String) -> Dictionary:
	return { "normal": db.clear_count(uid, raid_id) > 0, "coop": db.clear_count(uid, raid_id + "@coop") > 0, "coopc": db.clear_count(uid, raid_id + "@coopc") > 0 }
