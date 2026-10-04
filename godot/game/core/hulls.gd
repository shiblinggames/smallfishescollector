class_name Hulls
extends RefCounted
## THE HULL LADDER (Godot port of buyShip, renameShip and equipShipSkin in
## lib/core/harbour.ts and lib/core/ship.ts): the Sloop is every captain's
## start (tier 2), then the Schooner, Brigantine, Galleon and Man-o-War, each
## bought in turn for doubloons once Navigation reaches its rung. Prices and
## rungs are content/port_rules.json "hulls" (lib/ships.ts and
## navLevelReqForShip). A skin shows only on the Man-o-War (docs ship.md).

const TOP: int = 6
const SKIN_TIER: int = 6


static func ladder() -> Array:
	return Js.list(Rules.data().get("hulls"))


static func tier_of(p: Dictionary) -> int:
	return clampi(int(Js.nz(p.get("ship_tier"), 2.0)), 2, TOP)


static func hull(tier: int) -> Dictionary:
	for h: Dictionary in ladder():
		if int(h["tier"]) == tier:
			return h
	return {}


## Her fighting numbers (shipCombat), for the ladder's rows.
static func combat(tier: int) -> Dictionary:
	return Js.obj(Js.obj(Rules.data().get("shipCombat")).get(str(tier)))


## The next hull to buy, or {} at the top.
static func next_hull(p: Dictionary) -> Dictionary:
	return hull(tier_of(p) + 1)


static func buy(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var nx: Dictionary = next_hull(p)
	if nx.is_empty():
		return { "error": "She is already a Man-o-War." }
	if Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp"))) < int(nx["navLevelReq"]):
		return { "error": "Reach Navigation %d to buy the %s." % [int(nx["navLevelReq"]), nx["name"]] }
	# The spend is the guard: taken before the hull is handed over.
	var bal: Variant = db.deduct_doubloons(uid, float(nx["cost"]))
	if bal == null:
		return { "error": "Not enough doubloons." }
	db.update_profile(uid, { "ship_tier": int(nx["tier"]) })
	db.ledger(uid, -float(nx["cost"]), "Bought %s" % nx["name"])
	return { "ok": true, "shipTier": int(nx["tier"]), "doubloons": bal }


static func rename(db: CaptainStore, uid: String, name: String) -> Dictionary:
	var t: String = name.strip_edges().left(32)
	if t.is_empty():
		return { "error": "Name cannot be empty." }
	db.update_profile(uid, { "ship_name": t })
	return { "ok": true }


static func skins_owned(p: Dictionary) -> Array:
	return Js.list(p.get("owned_ship_skins"))


static func skin(id: String) -> Dictionary:
	for sk: Dictionary in Js.list(Rules.data().get("shipSkins")):
		if sk["id"] == id:
			return sk
	return {}


## Wear an owned skin, or none (id null). Only on the Man-o-War.
static func equip_skin(db: CaptainStore, uid: String, id: Variant) -> Dictionary:
	if id != null:
		var p: Dictionary = db.me(uid)
		if not skins_owned(p).has(id) or skin(str(id)).is_empty():
			return { "error": "That paint is not yours." }
		if tier_of(p) < SKIN_TIER:
			return { "error": "Paint shows on the Man-o-War only." }
	db.update_profile(uid, { "equipped_ship_skin": id })
	return { "ok": true }
