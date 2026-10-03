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
	return normal


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
