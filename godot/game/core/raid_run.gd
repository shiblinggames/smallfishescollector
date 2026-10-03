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
static func award_kill(db: CaptainStore, uid: String, raid: Dictionary, enemy_id: String, boss: bool) -> Dictionary:
	var kr: Dictionary = Js.obj(Js.obj(raid.get("killRewards")).get(enemy_id))
	var xp: float = Js.num(kr.get("xp")) + (completion_bonus(raid) if boss else 0.0)
	var gold: float = float(Js.round(Js.num(kr.get("gold"))))
	if xp > 0.0:
		db.bump_stat(uid, "expedition_xp", xp)
	if gold > 0.0:
		db.bump_stat(uid, "doubloons", gold)
		db.ledger(uid, gold, "%s: %s sunk" % [raid.get("raidTitle", "Raid"), enemy_id])
	var crew_grants: Array = []
	for c: Dictionary in Crew.live(db):
		if c.get("raid_slot") != null and xp > 0.0:
			var old: float = Js.num(c.get("xp"))
			c["xp"] = old + xp
			crew_grants.append({ "id": c["id"], "oldLevel": float(Crew.level(old)), "newLevel": float(Crew.level(old + xp)) })
	return { "xp": xp, "doubloons": gold, "crew": crew_grants }


## The boss's crate, into one captain's save.
static func open_crate(db: CaptainStore, uid: String, raid: Dictionary, fortune: float) -> Dictionary:
	if raid.get("skirmish", false) == true:
		return {}
	var prof: Dictionary = db.me(uid)
	var base: float = floor(Dice.next() * 301.0 + 300.0)
	var coin: float = minf(3000.0, floor(base * (1.0 + maxf(0.0, fortune) / 75.0)))
	var challenge: bool = str(raid["raidId"]).ends_with("_challenge")
	var flm: float = 1.0 + minf(1.0, fortune / 150.0)
	var rarity: Dictionary = { "epic": 0.20 if challenge else 0.10, "legendary": 0.10 if challenge else 0.05, "cosmetic": 0.05 if challenge else 0.025, "ancient": 0.10 if challenge else 0.05 }
	var owned_skins: Array = Js.list(prof.get("owned_ship_skins"))
	var items: Array = []
	for row: Dictionary in Js.list(raid.get("loot")):
		var rid: String = str(row["id"])
		if rid.begins_with("doubloons") or rid.begins_with("gems") or rid.begins_with("pack"):
			continue
		if row.get("shipSkinId") != null and owned_skins.has(row["shipSkinId"]):
			continue
		var p: float = minf(0.95, float(rarity.get(str(row.get("rarity", "")), 0.0)) * flm)
		if Dice.next() < p:
			items.append(row)
	db.bump_stat(uid, "doubloons", coin)
	db.ledger(uid, coin, "%s: the crate" % raid.get("raidTitle", "Raid"))
	for row: Dictionary in items:
		if row.get("shipSkinId") != null:
			db.add_to_list(uid, "owned_ship_skins", row["shipSkinId"])
		else:
			var held: Array = Js.list(prof.get("raid_items")).duplicate()
			held.append(row["id"])
			db.update_profile(uid, { "raid_items": held })
	return { "coin": coin, "items": items }


## A raid cleared, in the captain's record (the campaign map reads it).
static func record_clear(db: CaptainStore, uid: String, raid_id: String) -> void:
	var prof: Dictionary = db.me(uid)
	var clears: Dictionary = Js.obj(prof.get("raid_clears")).duplicate()
	clears[raid_id] = Js.num(clears.get(raid_id)) + 1.0
	db.update_profile(uid, { "raid_clears": clears })
