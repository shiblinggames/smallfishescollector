class_name Loadout
extends RefCounted
## THE CAPTAIN'S LOADOUT, a port of web/lib/core/loadout.ts (Godot port, pass 1
## of fishing): the Auto Caster switches, the special items, boats, hats, pets
## and the Completionist forge. Each checks ownership and cost in the order the
## TS does, and gives back what it took when a second guard refuses.


static func set_auto_fishing(db: CaptainStore, uid: String, value: bool) -> void:
	db.update_profile(uid, { "auto_fishing_on": value })


static func set_show_wait_timer(db: CaptainStore, uid: String, value: bool) -> void:
	db.update_profile(uid, { "show_wait_timer": value })


static func _special(id: String) -> Dictionary:
	for d: Dictionary in Rules.data()["specialItems"]:
		if d["id"] == id:
			return d
	return {}


static func buy_special_item(db: CaptainStore, uid: String, item_id: String) -> Dictionary:
	var columns: Dictionary = { "auto_caster": "has_auto_caster", "auto_catcher": "has_auto_catcher" }
	var column: String = columns.get(item_id, "")
	if column == "":
		return { "error": "Unknown item" }
	var def: Dictionary = _special(item_id)
	var gs: String = Rules.gate_block("special", item_id, Js.num(db.profile(uid, "fishing_xp").get("fishing_xp")))
	if gs != "":
		return { "error": gs }
	var fathoms: bool = def.get("costFathoms") != null
	if def.is_empty() or (not Js.truthy(def.get("shopCost")) and not fathoms):
		return { "error": "Not for sale" }
	var p: Dictionary = db.profile(uid, "doubloons, gauntlet_fathoms, has_auto_caster, has_auto_catcher, gauntlet_deepest")
	var owned: Dictionary = { "has_auto_caster": Js.truthy(p.get("has_auto_caster")), "has_auto_catcher": Js.truthy(p.get("has_auto_catcher")) }
	if owned[column]:
		return { "error": "Already owned" }
	if Js.truthy(def.get("requiresItem")) and not owned.get(columns.get(def["requiresItem"], ""), false):
		return { "error": "Requires the Auto Caster first" }
	if Js.truthy(def.get("requiresGauntletDepth")) and Js.num(p.get("gauntlet_deepest")) < float(def["requiresGauntletDepth"]):
		return { "error": "Reach depth %d in Davy Jones' Gauntlet first" % int(def["requiresGauntletDepth"]) }
	var col: String = "gauntlet_fathoms" if fathoms else "doubloons"
	var cost: float = float(def["costFathoms"]) if fathoms else float(def["shopCost"])
	if db.spend(uid, col, cost) == null:
		return { "error": "Not enough Fathoms" if fathoms else "Not enough doubloons" }
	if not db.flag_on(uid, column):
		db.grant(uid, col, cost)
		return { "error": "Already owned" }
	return { "ok": true }


static func equip_special_item(db: CaptainStore, uid: String, item_id: Variant) -> Dictionary:
	if item_id != null:
		var def: Dictionary = _special(item_id)
		if def.is_empty():
			return { "error": "No such item" }
		if def["finaleSlotOnly"]:
			return { "error": "That one does not fit this slot" }
		var col: String = (Rules.data()["specialOwnedColumn"] as Dictionary)[def["id"]]
		if db.profile(uid, col).get(col) != true:
			return { "error": "You do not own that" }
	db.update_profile(uid, { "equipped_special": item_id })
	return { "ok": true }


static func _find(list_key: String, id: String) -> Dictionary:
	for d: Dictionary in Rules.data()[list_key]:
		if d["id"] == id:
			return d
	return {}


## gateMet: a cosmetic's level or achievement-point gate.
static func _gate_met(g: Dictionary, fishing_level: float, nav_level: float, ap: Variant) -> bool:
	match g["kind"]:
		"fishing":
			return fishing_level >= float(g["level"])
		"nav":
			return nav_level >= float(g["level"])
	return ap != null and float(ap) >= Js.round(float(Rules.data()["apPool"]) * float(g["share"]))


static func nav_level_from_xp(xp: float) -> int:
	var table: Array = Rules.data()["navXpTable"]
	if xp >= float(table[99]):
		return 100
	for lv: int in range(99, 0, -1):
		if xp >= float(table[lv]):
			return lv + 1
	return 1


static func equip_boat(db: CaptainStore, uid: String, boat_id: Variant) -> Dictionary:
	if boat_id != null:
		var p: Dictionary = db.profile(uid, "unlocked_boats, fishing_xp, expedition_xp")
		var unlocked: Array = Js.list(p.get("unlocked_boats"))
		if not Js.includes(unlocked, boat_id):
			var def: Dictionary = _find("boats", boat_id)
			if def.get("gate") != null:
				var gate: Dictionary = def["gate"]
				var ap: Variant = db.achievement_points(uid) if gate["kind"] == "ap" else null
				if _gate_met(gate, Rules.level_from_xp(Js.num(p.get("fishing_xp"))), nav_level_from_xp(Js.num(p.get("expedition_xp"))), ap):
					db.add_to_list(uid, "unlocked_boats", boat_id)
					unlocked = unlocked + [boat_id]
			if not Js.includes(unlocked, boat_id):
				return { "error": "Boat not unlocked" }
	db.update_profile(uid, { "equipped_boat": boat_id })
	return { "ok": true }


static func buy_boat(db: CaptainStore, uid: String, boat_id: String) -> Dictionary:
	var def: Dictionary = _find("boats", boat_id)
	if def.is_empty():
		return { "error": "Unknown boat" }
	if def["crateOnly"]:
		return { "error": "This boat is only found in crates" }
	if def.get("gate") != null:
		return { "error": "This boat is earned, not bought" }
	var gems: bool = def.get("gemPrice") != null and float(def["gemPrice"]) > 0
	var price: float = float(def["gemPrice"]) if gems else float(def["cost"])
	var p: Dictionary = db.profile(uid, "doubloons, gems, unlocked_boats")
	if Js.includes(Js.list(p.get("unlocked_boats")), boat_id):
		return { "error": "Already owned" }
	var col: String = "gems" if gems else "doubloons"
	var balance: Variant = db.spend(uid, col, price)
	if balance == null:
		return { "error": "Not enough gems" if gems else "Not enough doubloons" }
	if not db.add_to_list(uid, "unlocked_boats", boat_id):
		db.grant(uid, col, price)
		return { "error": "Already owned" }
	db.update_profile(uid, { "equipped_boat": boat_id })
	db.ledger(uid, -price, "Bought %s boat" % def["name"], col)
	return { "ok": true, "gems": balance } if gems else { "ok": true, "doubloons": balance }


static func equip_hat(db: CaptainStore, uid: String, hat_id: Variant) -> Dictionary:
	if hat_id != null and not Js.includes(Js.list(db.profile(uid, "unlocked_hats").get("unlocked_hats")), hat_id):
		return { "error": "Hat not unlocked" }
	db.update_profile(uid, { "equipped_hat": hat_id })
	return { "ok": true }


## Pets sit in two slots, routed by the pet (a front-facing one goes to the
## bow); unequipping names the slot.
static func equip_pet(db: CaptainStore, uid: String, pet_id: Variant, slot: String = "stern") -> Dictionary:
	var column: String = "equipped_pet_bow" if slot == "bow" else "equipped_pet"
	if pet_id != null:
		if not Js.includes(Js.list(db.profile(uid, "unlocked_pets").get("unlocked_pets")), pet_id):
			return { "error": "Pet not unlocked" }
		var def: Dictionary = _find("pets", pet_id)
		if def.is_empty():
			return { "error": "No such pet" }
		column = "equipped_pet_bow" if def["bow"] else "equipped_pet"
	db.update_profile(uid, { column: pet_id })
	return { "ok": true }


static func buy_hat(db: CaptainStore, uid: String, hat_id: String) -> Dictionary:
	var def: Dictionary = _find("hats", hat_id)
	if def.is_empty():
		return { "error": "Unknown hat" }
	if def["crateOnly"]:
		return { "error": "This hat is only found in crates" }
	var p: Dictionary = db.profile(uid, "doubloons, unlocked_hats")
	if Js.includes(Js.list(p.get("unlocked_hats")), hat_id):
		return { "error": "Already owned" }
	var after: Variant = db.spend(uid, "doubloons", float(def["cost"]))
	if after == null:
		return { "error": "Not enough doubloons" }
	if not db.add_to_list(uid, "unlocked_hats", hat_id):
		db.grant(uid, "doubloons", float(def["cost"]))
		return { "error": "Already owned" }
	db.update_profile(uid, { "equipped_hat": hat_id })
	db.ledger(uid, -float(def["cost"]), "Bought %s bandana" % def["name"])
	return { "ok": true, "doubloons": after }


## Forge up to three rods' effects into the Completionist. The first forge is
## free; changing it after costs the reforge price.
static func set_completionist_effects(db: CaptainStore, uid: String, tiers: Array) -> Dictionary:
	var comp: Dictionary = Rules.data()["completionist"]
	var comp_tier: float = float(comp["tier"])
	var owned: Array = db.held_rod_tiers(uid)
	var p: Dictionary = db.profile(uid, "has_seen_forge_flourish, completionist_effects, doubloons, unlocked_badges")
	if not Js.includes(owned, comp_tier):
		return { "error": "You haven't earned the Completionist Rod yet." }
	var unique: Array = []
	for t: Variant in tiers:
		var n: float = float(t)
		if n == floor(n) and not Js.includes(unique, n):
			unique.append(n)
	var clean: Array = []
	for t: float in unique:
		if clean.size() >= int(comp["maxEffects"]):
			break
		if t == comp_tier:
			continue
		if not Js.includes(owned, t):
			return { "error": "You can only forge in rods you own." }
		if not Rules.rod_has_unique_effect(Rules.rod(t)):
			return { "error": "That rod has no unique effect to forge." }
		clean.append(t)
	var doubloons: float = Js.num(p.get("doubloons"))
	var current: Array = Js.list(p.get("completionist_effects"))
	var changed: bool = clean.size() != current.size()
	for t: Variant in clean:
		if not Js.includes(current, t):
			changed = true
	var seen: bool = Js.truthy(p.get("has_seen_forge_flourish"))
	var first_forge: bool = clean.size() > 0 and not seen
	var must_pay: bool = changed and clean.size() > 0 and seen
	var new_doubloons: float = doubloons
	if must_pay:
		var cost: float = float(comp["reforgeCost"])
		var after: Variant = db.spend(uid, "doubloons", cost)
		if after == null:
			return { "error": "Re-forging costs %s doubloons." % Js.thousands(cost) }
		new_doubloons = after
	var update: Dictionary = { "completionist_effects": clean }
	if first_forge:
		update["has_seen_forge_flourish"] = true
	db.update_profile(uid, update)
	if must_pay and clean.size() >= int(comp["maxEffects"]) and not Js.includes(Js.list(p.get("unlocked_badges")), "reforged"):
		db.add_to_list(uid, "unlocked_badges", "reforged")
	return { "completionistEffects": clean, "firstForge": first_forge, "charged": must_pay, "newDoubloons": new_doubloons }


## updateCharacterColor (lib/core/profile): a free color, one already owned,
## or one earned by a level or achievement-point gate (owned from then on).
static func update_character_color(db: CaptainStore, uid: String, color_id: String) -> Dictionary:
	var color: Dictionary = {}
	for c: Dictionary in Rules.data()["characterColors"]:
		if c["id"] == color_id:
			color = c
	if color.is_empty():
		return { "error": "Invalid color" }
	if not color["free"]:
		var p: Dictionary = db.profile(uid, "unlocked_character_colors, fishing_xp, expedition_xp, prestige_levels")
		var unlocked: Array = Js.list(p.get("unlocked_character_colors"))
		if not Js.includes(unlocked, color_id):
			var gate: Variant = color.get("gate")
			var earned: bool = false
			if gate != null and (gate as Dictionary)["kind"] != "ap":
				earned = _gate_met(gate, Rules.level_from_xp(Js.num(p.get("fishing_xp"))), nav_level_from_xp(Js.num(p.get("expedition_xp"))), null)
			if not earned and gate != null and (gate as Dictionary)["kind"] == "ap":
				earned = _gate_met(gate, 0, 0, db.achievement_points(uid))
			if not earned:
				return { "error": "Color not unlocked" }
			db.add_to_list(uid, "unlocked_character_colors", color_id)
	db.update_profile(uid, { "character_color": color_id })
	return {}


## equipTackleRod (lib/core/harbour): put an owned rod in hand, by tier.
static func equip_tackle_rod(db: CaptainStore, uid: String, rod_tier: float) -> Dictionary:
	var rod: Dictionary = {}
	for r: Dictionary in Rules.data()["rods"]:
		if float(r["tier"]) == rod_tier:
			rod = r
	if rod.is_empty():
		return { "error": "Invalid rod" }
	if rod["id"] != "bamboo" and not Js.includes(db.held_rod_tiers(uid), rod_tier):
		return { "error": "Rod not owned" }
	db.update_profile(uid, { "rod_tier": rod_tier })
	return { "rodTier": rod_tier }
