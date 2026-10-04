class_name RepairKits
extends RefCounted
## THE REPAIR KITS' LADDER (Godot port of web lib/repairKits.ts and
## lib/core/raids.ts buyRepairKit; the kits themselves are port rules
## battle.repairKits). Doubloon-bought, in tier order, each behind a
## Navigation level; a kit bought is added and worn at once (each is strictly
## better). Every captain starts with the Basic Kit.


static func all() -> Array:
	return Js.list(Js.obj(Battle.cfg().get("repairKits")).get("list"))


static func by_id(id: Variant) -> Dictionary:
	for k: Dictionary in all():
		if k["id"] == str(id):
			return k
	return {}


static func owned(p: Dictionary) -> Array:
	var o: Array = Js.list(p.get("owned_repair_kits"))
	return o if not o.is_empty() else ["basic_repair_kit"]


## The next rung: the lowest tier not owned, or {} when every kit is.
static func next_kit(p: Dictionary) -> Dictionary:
	var have: Array = owned(p)
	var list: Array = all().duplicate()
	list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["tier"]) < float(b["tier"]))
	for k: Dictionary in list:
		if not have.has(k["id"]):
			return k
	return {}


## A kit's heal range for a crew's Fortune.
static func range_for(k: Dictionary, fortune: float) -> Vector2:
	var bonus: float = floor(maxf(0.0, fortune) * float(Js.nz(Js.obj(Battle.cfg().get("repairKits")).get("fortuneHealScale"), 0.25)))
	return Vector2(float(k.get("baseMin", 0.0)), float(k.get("baseMax", 0.0)) + bonus)


static func buy(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var nx: Dictionary = next_kit(p)
	if nx.is_empty():
		return { "error": "Every repair kit is already yours." }
	if Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp"))) < int(nx["navLevelReq"]):
		return { "error": "Reach Navigation %d to buy the %s." % [int(nx["navLevelReq"]), nx["name"]] }
	# The spend is the guard: taken before the kit is handed over.
	var bal: Variant = db.deduct_doubloons(uid, float(nx["cost"]))
	if bal == null:
		return { "error": "Not enough doubloons." }
	if Js.list(p.get("owned_repair_kits")).is_empty():
		db.update_profile(uid, { "owned_repair_kits": ["basic_repair_kit"] })
	if not db.add_to_list(uid, "owned_repair_kits", nx["id"]):
		db.grant(uid, "doubloons", float(nx["cost"]))
		return { "error": "Could not complete the purchase." }
	db.update_profile(uid, { "equipped_repair_kit": nx["id"] })
	db.ledger(uid, -float(nx["cost"]), "Bought %s" % nx["name"])
	return { "ok": true, "equippedRepairKit": nx["id"], "ownedRepairKits": owned(db.me(uid)), "doubloons": bal }


## Wear an owned kit.
static func equip(db: CaptainStore, uid: String, id: String) -> Dictionary:
	if not owned(db.me(uid)).has(id) or by_id(id).is_empty():
		return { "error": "That kit is not yours." }
	db.update_profile(uid, { "equipped_repair_kit": id })
	return { "ok": true }
