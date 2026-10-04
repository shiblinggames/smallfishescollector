class_name Forge
extends RefCounted
## THE FORGE AND THE ABYSSAL ACCELERATOR (Godot port of forgeRaidItem,
## learnForgeRecipe, startAbyssalConversion and claimAbyssalConversion in
## lib/core/ship.ts; docs/systems/forge.md). Raid items held as copies.
##
## THE FORGE (the Davy Jones Locker's "forge"): learn a recipe once for its
## Fathoms, then fuse ONE copy of each component into the result, as often as
## you hold the parts. The tier-3 Abyssal recipes need the Don's Abyssal Forge.
## A component no longer held at all comes off the mounts.
##
## THE ACCELERATOR (the Don's "dg_abyssal_accel", with the Abyssal Forge):
## one slot, ONE copy of an epic boss item in, its legendary out after a day
## (30 sea days). Charged in DOUBLOONS (the port has no gems; the web's 100
## gems x 100), the spend taken first and handed back if the slot is taken.
##
## Recipes are content/rules.json "forgeRecipes"; the conversion is the
## profile's "abyssal_conversion" { epicId, legendaryId, completesMs }.

const ACCEL_MS: float = 24.0 * 60.0 * 60.0 * 1000.0
const ACCEL_COST: float = 10000.0
const EPIC_TO_LEGENDARY: Dictionary = {
	"corsair_cannon": "corsair_prime_cannon", "krusts_carapace": "captains_carapace",
	"cartographers_astrolabe": "captains_astrolabe", "spets_primer": "tollmasters_primer",
	"tell_tale_glass": "admirals_eye", "war_drum": "thunder_drum", "court_fang": "dons_signet",
	"chain_shot": "brackwater_rack",
}


static func recipes() -> Array:
	return Js.list(Rules.data().get("forgeRecipes"))


static func recipe(result: String) -> Dictionary:
	for r: Dictionary in recipes():
		if r["result"] == result:
			return r
	return {}


static func has_forge(p: Dictionary) -> bool:
	return Gauntlet.owns(p, "forge")


static func has_abyssal(p: Dictionary) -> bool:
	return Gauntlet.owns(p, "dg_abyssal_forge")


static func has_accel(p: Dictionary) -> bool:
	return has_abyssal(p) and Gauntlet.owns(p, "dg_abyssal_accel")


static func counts(list: Array) -> Dictionary:
	var out: Dictionary = {}
	for id: Variant in list:
		out[str(id)] = int(out.get(str(id), 0)) + 1
	return out


static func _locked(r: Dictionary, p: Dictionary) -> String:
	if int(Js.nz(r.get("tier"), 2.0)) == 3:
		return "" if has_abyssal(p) else "The Abyssal Forge is locked. Unlock it in the Don's Gauntlet."
	return "" if has_forge(p) else "The Forge is locked. Unlock it in the Davy Jones Gauntlet."


## Take one copy of an item; false if none is held.
static func _take(db: CaptainStore, uid: String, id: String) -> bool:
	var held: Array = Js.list(db.me(uid).get("raid_items")).duplicate()
	var i: int = held.find(id)
	if i < 0:
		return false
	held.remove_at(i)
	db.update_profile(uid, { "raid_items": held })
	return true


static func _give(db: CaptainStore, uid: String, id: String) -> void:
	var held: Array = Js.list(db.me(uid).get("raid_items")).duplicate()
	held.append(id)
	db.update_profile(uid, { "raid_items": held })


## Mounted items no longer held at all come off.
static func _tidy_mounts(db: CaptainStore, uid: String) -> void:
	var p: Dictionary = db.me(uid)
	var held: Array = Js.list(p.get("raid_items"))
	db.update_profile(uid, { "equipped_raid_items": Js.list(p.get("equipped_raid_items")).filter(func(id: Variant) -> bool: return held.has(id)) })


static func learn(db: CaptainStore, uid: String, result: String) -> Dictionary:
	var r: Dictionary = recipe(result)
	if r.is_empty():
		return { "error": "Unknown recipe." }
	var p: Dictionary = db.me(uid)
	var why: String = _locked(r, p)
	if why != "":
		return { "error": why }
	if Js.list(p.get("forge_recipes_learned")).has(result):
		return { "error": "Already learned." }
	if db.spend(uid, "gauntlet_fathoms", float(r["fathomCost"])) == null:
		return { "error": "Not enough Fathoms. This recipe needs %d." % int(r["fathomCost"]) }
	db.add_to_list(uid, "forge_recipes_learned", result)
	return { "ok": true }


static func forge(db: CaptainStore, uid: String, result: String) -> Dictionary:
	var r: Dictionary = recipe(result)
	if r.is_empty():
		return { "error": "Unknown recipe." }
	var p: Dictionary = db.me(uid)
	var why: String = _locked(r, p)
	if why != "":
		return { "error": why }
	if not Js.list(p.get("forge_recipes_learned")).has(result):
		return { "error": "You haven't learned this recipe yet." }
	var need: Dictionary = counts(r["components"])
	var have: Dictionary = counts(Js.list(p.get("raid_items")))
	for id: String in need:
		if int(have.get(id, 0)) < int(need[id]):
			return { "error": "You don't own every component yet." }
	# The components are the price: taken first, each one.
	for id: Variant in r["components"]:
		_take(db, uid, str(id))
	_give(db, uid, result)
	_tidy_mounts(db, uid)
	db.bump_stat(uid, "raid_items_forged", 1.0)
	return { "ok": true, "result": result }


static func conversion(p: Dictionary) -> Dictionary:
	return Js.obj(p.get("abyssal_conversion"))


static func start_accel(db: CaptainStore, uid: String, epic: String) -> Dictionary:
	var legend: String = str(EPIC_TO_LEGENDARY.get(epic, ""))
	if legend == "":
		return { "error": "That item can't be transmuted." }
	var p: Dictionary = db.me(uid)
	if not has_accel(p):
		return { "error": "The Abyssal Accelerator is locked. Unlock it in the Don's Gauntlet." }
	if not conversion(p).is_empty():
		return { "error": "The Accelerator is already running. Claim it first." }
	if not Js.list(p.get("raid_items")).has(epic):
		return { "error": "You don't own that item." }
	var bal: Variant = db.deduct_doubloons(uid, ACCEL_COST)
	if bal == null:
		return { "error": "Not enough doubloons. Charging costs %s ⟡." % Js.thousands(ACCEL_COST) }
	if not _take(db, uid, epic):
		db.grant(uid, "doubloons", ACCEL_COST)
		return { "error": "You don't own that item." }
	var c: Dictionary = { "epicId": epic, "legendaryId": legend, "completesMs": Clock.now_ms() + ACCEL_MS }
	db.update_profile(uid, { "abyssal_conversion": c })
	_tidy_mounts(db, uid)
	db.ledger(uid, -ACCEL_COST, "Charged the Abyssal Accelerator")
	return { "ok": true, "conversion": c, "doubloons": bal }


static func claim_accel(db: CaptainStore, uid: String) -> Dictionary:
	var c: Dictionary = conversion(db.me(uid))
	if c.is_empty():
		return { "error": "Nothing to claim." }
	if Clock.now_ms() < float(c["completesMs"]):
		return { "error": "It's still transmuting." }
	db.update_profile(uid, { "abyssal_conversion": null })
	_give(db, uid, str(c["legendaryId"]))
	return { "ok": true, "legendaryId": c["legendaryId"] }


## The bench: what is open, every recipe with its parts against what is held,
## and the Accelerator's slot.
static func state(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var held: Dictionary = counts(Js.list(p.get("raid_items")))
	var learned: Array = Js.list(p.get("forge_recipes_learned"))
	var rows: Array = []
	for r: Dictionary in recipes():
		var need: Dictionary = counts(r["components"])
		var ready: bool = true
		var parts: Array = []
		for id: Variant in r["components"]:
			var n: int = int(held.get(str(id), 0))
			parts.append({ "id": id, "held": n })
			if n < int(need[str(id)]):
				ready = false
		rows.append({
			"result": r["result"], "tier": int(Js.nz(r.get("tier"), 2.0)), "fathomCost": float(r["fathomCost"]),
			"learned": learned.has(r["result"]), "parts": parts, "ready": ready, "held": int(held.get(str(r["result"]), 0)),
			"locked": _locked(r, p),
		})
	var epics: Array = []
	for e: String in EPIC_TO_LEGENDARY:
		if int(held.get(e, 0)) > 0:
			epics.append({ "id": e, "legendaryId": EPIC_TO_LEGENDARY[e], "held": int(held[e]) })
	return {
		"forge": has_forge(p), "abyssal": has_abyssal(p), "accel": has_accel(p), "fathoms": Js.num(p.get("gauntlet_fathoms")),
		"recipes": rows, "epics": epics, "conversion": conversion(p), "accelCost": ACCEL_COST, "accelMs": ACCEL_MS,
	}
