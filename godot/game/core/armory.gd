class_name Armory
extends RefCounted
## THE SHIP'S ARMORY, RULES (a port of lib/core/ship.ts saveEquippedRaidItems,
## buySixthBerth and buyArmoryExpansion, with lib/raidItems' loadout rules and
## lib/raidLoadout's cut of the list). Raid items are held in raid_items (a
## list; copies allowed) and mounted in equipped_raid_items:
##   THE CAP: the hull's mounts (Sloop 1 to Man-o-War 4), plus any class
##   pick's, plus the Expanded Armory's one.
##   ONE OF A FAMILY: two grades of the same drop never ride together, and a
##   forged item never beside its own ingredients (all the way down).
##   THE FINALE'S MOUNT: items that fit only the extra mount opened by beating
##   Finn (the Primeval Maw) ride apart from the cap, one at most.
## Parity: tests/parity/armory.json.

static var _by_id: Dictionary = {}


static func item(id: String) -> Dictionary:
	if _by_id.is_empty():
		for it: Dictionary in Rules.data()["raidItems"]:
			_by_id[it["id"]] = it
	return Js.obj(_by_id.get(id.split("#")[0]))


static func recipe(result: String) -> Dictionary:
	for r: Dictionary in Js.list(Rules.data().get("forgeRecipes")):
		if r["result"] == result:
			return r
	return {}


## raidItemSlotsForTier + class itemSlots + the Expanded Armory.
static func slots(prof: Dictionary) -> int:
	var tier: int = clampi(int(Js.nz(prof.get("ship_tier"), 0.0)), 2, 6)
	var row: Dictionary = Js.obj(Js.obj(Rules.data().get("shipCombat")).get(str(tier)))
	return int(Js.nz(row.get("itemSlots"), 1.0)) + int(Campaign.class_effects(prof.get("ship_classes"))["itemSlots"]) + (1 if prof.get("has_armory_expansion") == true else 0)


## The finale's extra mount is open (the nav spoil).
static func finale_mount(prof: Dictionary) -> bool:
	return prof.get("finn_spoil_free") == "nav" or prof.get("finn_spoil_paid") == "nav"


## fusionExcludedItems: every ingredient up a forged item's tree, and every
## grade of each ingredient's family.
static func fusion_excluded(result: String) -> Array:
	var r: Dictionary = recipe(result)
	if r.is_empty():
		return []
	var ids: Array = []
	var queue: Array = Js.list(r.get("components")).duplicate()
	while not queue.is_empty():
		var id: String = str(queue.pop_back())
		if ids.has(id):
			continue
		ids.append(id)
		var sub: Dictionary = recipe(id)
		if not sub.is_empty():
			queue.append_array(Js.list(sub.get("components")))
	var out: Array = ids.duplicate()
	for id: Variant in ids:
		var fam: Variant = item(str(id)).get("family")
		if fam == null:
			continue
		for it: Dictionary in Rules.data()["raidItems"]:
			if it.get("family") == fam and not out.has(it["id"]):
				out.append(it["id"])
	return out


## conflictingRaidItems: what in `equipped` cannot ride beside `id`.
static func conflicts(id: String, equipped: Array) -> Array:
	var out: Array = []
	var fam: Variant = item(id).get("family")
	var mine: Array = fusion_excluded(id)
	for other: Variant in equipped:
		if other == id:
			continue
		if fam != null and item(str(other)).get("family") == fam:
			out.append(other)
		elif mine.has(other) or fusion_excluded(str(other)).has(id):
			out.append(other)
	return out


## dedupeRaidItems: keep the earlier of any pair that cannot coexist.
static func dedupe(ids: Array) -> Array:
	var out: Array = []
	for id: Variant in ids:
		if conflicts(str(id), out).is_empty():
			out.append(id)
	return out


## saveEquippedRaidItems.
static func save_equipped(db: CaptainStore, uid: String, ids: Array) -> Dictionary:
	var p: Dictionary = db.profile(uid, "raid_items, ship_tier, ship_classes, has_armory_expansion")
	var owned: Array = Js.list(p.get("raid_items"))
	var mine: Array = ids.filter(func(id: Variant) -> bool: return owned.has(id))
	var mounted: Array = mine.filter(func(id: Variant) -> bool: return item(str(id)).get("finaleSlotOnly") == true).slice(0, 1)
	var normal: Array = mine.filter(func(id: Variant) -> bool: return item(str(id)).get("finaleSlotOnly") != true)
	var valid: Array = dedupe(normal).slice(0, slots(p)) + mounted
	db.update_profile(uid, { "equipped_raid_items": valid })
	return { "equipped": valid }


## What a ship carries into a fight (getRaidPlayerStats' cut): the hull's
## mounts and, with the finale's mount open, its one item.
static func live_items(prof: Dictionary) -> Array:
	var eq: Array = Js.list(prof.get("equipped_raid_items"))
	var normal: Array = dedupe(eq.filter(func(id: Variant) -> bool: return item(str(id)).get("finaleSlotOnly") != true)).slice(0, slots(prof))
	if finale_mount(prof):
		normal += eq.filter(func(id: Variant) -> bool: return item(str(id)).get("finaleSlotOnly") == true).slice(0, 1)
	# The Primeval Maw rides tagged with its charge level (borrowed_jaw#L).
	var lvl: int = Rules.finn_item_level(Js.num(prof.get("borrowed_jaw_xp")))
	return normal.map(func(id: Variant) -> Variant: return ("borrowed_jaw#%d" % lvl) if id == "borrowed_jaw" else id)


## A charged item's effects come from its milestone (borrowedJawRaidEffects).
static func effects_of(id: String) -> Array:
	if id.begins_with("borrowed_jaw#"):
		var ms: Array = Js.list(Js.obj(Rules.data().get("finn")).get("borrowedJaw"))
		if ms.is_empty():
			return []
		var m: Dictionary = ms[clampi(id.split("#")[1].to_int(), 1, ms.size()) - 1]
		var out: Array = []
		for pair: Array in [["bossDamageMult", "boss_damage_mult"], ["fireDamageMult", "fire_damage_mult"], ["volleyDamageMult", "volley_damage_mult"], ["megaDamageMult", "mega_damage_mult"], ["extraStartChargeChance", "extra_start_charge_chance"], ["critChargeRefundChance", "crit_charge_refund_chance"]]:
			if m.get(pair[0]) != null:
				out.append({ "type": pair[1], "value": m[pair[0]] })
		return out
	return Js.list(item(id).get("effects"))


static func _buy(db: CaptainStore, uid: String, col: String, gate: String, cost: float, already: String, locked: String, ledger: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, col)
	if p.get(col) == true:
		return { "ok": false, "error": already }
	if not db.has_cleared(uid, gate):
		return { "ok": false, "error": locked }
	var left: Variant = db.spend(uid, "doubloons", cost)
	if left == null:
		return { "ok": false, "error": "You need %s doubloons." % Js.thousands(cost) }
	if not db.update_profile_if(uid, { col: true }, [{ "col": col, "eq": false }]):
		db.grant(uid, "doubloons", cost)
		return { "ok": false, "error": already }
	db.ledger(uid, -cost, ledger)
	return { "ok": true, "doubloons": left }


## buySixthBerth: a sixth crew seat, once Sal Brackwater is beaten.
static func buy_sixth_berth(db: CaptainStore, uid: String) -> Dictionary:
	return _buy(db, uid, "has_sixth_berth", "the_blockade", float(Rules.data()["sixthBerthCost"]),
		"Your ship already has its sixth crew slot.", "Beat Sal Brackwater before you can add a crew slot.", "The Sixth Berth (Man-o-War crew slot)")


## buyArmoryExpansion: one more raid-item mount, once the Throne is taken.
static func buy_armory_expansion(db: CaptainStore, uid: String) -> Dictionary:
	return _buy(db, uid, "has_armory_expansion", "the_throne", float(Rules.data()["armoryExpansionCost"]),
		"Your deck already carries the extra mount.", "Take the throne before the shipwright will cut you a new mount.", "The Expanded Armory (extra raid-item mount)")


# ══ The Man-o-War's ultimate (lib/shipAugments, lib/core/ship.ts) ═════════════
#
# Raise one Mega weapon into the hull from the Quartermaster's plans: the
# Railgun, the Barrage or the Nuke. Four gates (the Quartermaster beaten, a
# Man-o-War, Navigation 70, the Extra Cannonball Rack from the Gauntlet's
# Locker), 750,000 and a day's work. Re-pick free while it builds; retool a
# built one for 250,000 and another day; or buy the Full Schematics and switch
# freely. A finished build goes live the next time the state is read.

static func aug() -> Dictionary:
	return Rules.data()["shipAugments"]


static func augment(id: Variant) -> Dictionary:
	for a: Dictionary in aug()["list"]:
		if a["id"] == id:
			return a
	return {}


## parseAugmentBuild.
static func parse_build(raw: Variant) -> Dictionary:
	if not (raw is Dictionary):
		return {}
	var r: Dictionary = raw
	if not (r.get("id") is String) or not (r.get("completesAt") is String) or augment(r["id"]).is_empty():
		return {}
	var out: Dictionary = { "id": r["id"], "completesAt": r["completesAt"] }
	if r.get("retool") == true:
		out["retool"] = true
	return out


static func _done(b: Dictionary) -> bool:
	return not b.is_empty() and Js.parse_ms(b["completesAt"]) <= Clock.now_ms()


static func has_rack(p: Dictionary) -> bool:
	return Js.list(p.get("gauntlet_upgrades")).has("cannonball_rack")


## The four gates, each true or not (ultimateGateStatus).
static func ultimate_gates(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	return {
		"chapter3": db.has_cleared(uid, "the_quartermaster"),
		"manowar": Js.num(p.get("ship_tier")) >= float(aug()["tier"]),
		"navLevel": float(Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))) >= float(aug()["navLevel"]),
		"rack": has_rack(p),
	}


## getUltimateState (settling a finished build).
static func ultimate_state(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "manowar_augment, manowar_augment_build, manowar_schematics")
	var active: Variant = p.get("manowar_augment")
	var build: Dictionary = parse_build(p.get("manowar_augment_build"))
	if not build.is_empty() and _done(build):
		db.update_profile(uid, { "manowar_augment": build["id"], "manowar_augment_build": null })
		active = build["id"]
		build = {}
	return { "active": active, "build": build if not build.is_empty() else null, "schematics": p.get("manowar_schematics") == true }


## startUltimateBuild.
static func start_ultimate(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var a: Dictionary = augment(id)
	if a.is_empty():
		return { "ok": false, "error": "Unknown weapon." }
	var p: Dictionary = db.profile(uid, "ship_tier, expedition_xp, manowar_augment, manowar_augment_build, gauntlet_upgrades")
	if Js.truthy(p.get("manowar_augment")):
		return { "ok": false, "error": "Your ship already carries its ultimate. The choice is permanent." }
	var ex: Dictionary = parse_build(p.get("manowar_augment_build"))
	if not ex.is_empty() and not _done(ex):
		return { "ok": false, "error": "A weapon is already being built. Change your pick instead." }
	var g: Dictionary = ultimate_gates(db, uid)
	if not (g["chapter3"] and g["manowar"] and g["navLevel"] and g["rack"]):
		return { "ok": false, "error": "You do not meet every requirement yet." }
	var cost: float = float(aug()["cost"])
	var left: Variant = db.spend(uid, "doubloons", cost)
	if left == null:
		return { "ok": false, "error": "You need %s doubloons." % Js.thousands(cost) }
	var at: String = Js.iso(Clock.now_ms() + float(aug()["buildMs"]))
	if not db.update_profile_if(uid, { "manowar_augment_build": { "id": a["id"], "completesAt": at } }, [{ "col": "manowar_augment_build", "is": null }, { "col": "manowar_augment", "is": null }]):
		db.grant(uid, "doubloons", cost)
		return { "ok": false, "error": "A weapon is already being built." }
	db.ledger(uid, -cost, "Ultimate weapon build: %s" % a["name"])
	return { "ok": true, "doubloons": left, "completesAt": at }


## swapUltimateBuild: re-task the shipwrights; the clock keeps running.
static func swap_ultimate(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var a: Dictionary = augment(id)
	if a.is_empty():
		return { "ok": false, "error": "Unknown weapon." }
	var p: Dictionary = db.profile(uid, "manowar_augment, manowar_augment_build")
	var ex: Dictionary = parse_build(p.get("manowar_augment_build"))
	if ex.is_empty() or _done(ex):
		return { "ok": false, "error": "No build in progress." }
	if ex["id"] == a["id"]:
		return { "ok": true }
	if ex.get("retool", false) and p.get("manowar_augment") == a["id"]:
		return { "ok": false, "error": "That weapon is already mounted." }
	var nb: Dictionary = { "id": a["id"], "completesAt": ex["completesAt"] }
	if ex.get("retool", false):
		nb["retool"] = true
	db.update_profile(uid, { "manowar_augment_build": nb })
	return { "ok": true }


## startUltimateRetool.
static func retool_ultimate(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var a: Dictionary = augment(id)
	if a.is_empty():
		return { "ok": false, "error": "Unknown weapon." }
	var p: Dictionary = db.profile(uid, "manowar_augment, manowar_augment_build, manowar_schematics")
	if not Js.truthy(p.get("manowar_augment")):
		return { "ok": false, "error": "Forge your first ultimate before retooling." }
	if p["manowar_augment"] == a["id"]:
		return { "ok": false, "error": "That weapon is already mounted." }
	if p.get("manowar_schematics") == true:
		return { "ok": false, "error": "You own the Full Schematics. Switch freely instead." }
	var ex: Dictionary = parse_build(p.get("manowar_augment_build"))
	if not ex.is_empty() and not _done(ex):
		return { "ok": false, "error": "The shipwrights are already at work. Change their pick instead." }
	var cost: float = float(aug()["retoolCost"])
	var left: Variant = db.spend(uid, "doubloons", cost)
	if left == null:
		return { "ok": false, "error": "You need %s doubloons." % Js.thousands(cost) }
	var at: String = Js.iso(Clock.now_ms() + float(aug()["buildMs"]))
	if not db.update_profile_if(uid, { "manowar_augment_build": { "id": a["id"], "completesAt": at, "retool": true } }, [{ "col": "manowar_augment_build", "is": null }]):
		db.grant(uid, "doubloons", cost)
		return { "ok": false, "error": "The shipwrights are already at work." }
	db.ledger(uid, -cost, "Ultimate retool: %s" % a["name"])
	return { "ok": true, "doubloons": left, "completesAt": at }


## buyUltimateSchematics.
static func buy_schematics(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "manowar_augment, manowar_augment_build, manowar_schematics")
	if not Js.truthy(p.get("manowar_augment")):
		return { "ok": false, "error": "Forge your first ultimate before buying the Full Schematics." }
	if p.get("manowar_schematics") == true:
		return { "ok": false, "error": "You already own the Full Schematics." }
	var cost: float = float(aug()["schematicsCost"])
	var left: Variant = db.spend(uid, "doubloons", cost)
	if left == null:
		return { "ok": false, "error": "You need %s doubloons." % Js.thousands(cost) }
	var pending: Dictionary = parse_build(p.get("manowar_augment_build"))
	var active: Variant = pending["id"] if pending.get("retool", false) else p["manowar_augment"]
	var patch: Dictionary = { "manowar_schematics": true, "manowar_augment": active }
	if pending.get("retool", false):
		patch["manowar_augment_build"] = null
	if not db.update_profile_if(uid, patch, [{ "col": "manowar_schematics", "eq": false }]):
		db.grant(uid, "doubloons", cost)
		return { "ok": false, "error": "You already own the Full Schematics." }
	db.ledger(uid, -cost, "Ultimate weapon: the Full Schematics")
	return { "ok": true, "doubloons": left, "active": active }


## switchUltimate: free, for a Full Schematics owner.
static func switch_ultimate(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var a: Dictionary = augment(id)
	if a.is_empty():
		return { "ok": false, "error": "Unknown weapon." }
	var p: Dictionary = db.profile(uid, "manowar_augment, manowar_schematics")
	if not Js.truthy(p.get("manowar_augment")):
		return { "ok": false, "error": "Forge your first ultimate before switching." }
	if p.get("manowar_schematics") != true:
		return { "ok": false, "error": "Switching freely takes the Full Schematics." }
	if p["manowar_augment"] == a["id"]:
		return { "ok": true, "active": a["id"] }
	db.update_profile(uid, { "manowar_augment": a["id"], "manowar_augment_build": null })
	return { "ok": true, "active": a["id"] }


## The Mega a ship carries into a fight (a Man-o-War with a finished weapon).
static func mega_of(p: Dictionary) -> Dictionary:
	if Js.num(p.get("ship_tier")) < float(aug()["tier"]):
		return {}
	var active: Variant = p.get("manowar_augment")
	var build: Dictionary = parse_build(p.get("manowar_augment_build"))
	if not build.is_empty() and _done(build):
		active = build["id"]
	return augment(active)
