class_name CrateLoot
extends RefCounted
## A CRATE, OPENED, a port of web/lib/crateLoot and the pet roll in web/lib/pets
## (Godot port, stage 1). The tables are in content/rules.json.


static func roll_pet() -> Dictionary:
	var weights: Dictionary = Rules.data()["petSpeciesWeights"]
	var total: float = 0.0
	for s: Variant in weights:
		total += float(weights[s])
	var roll: float = Dice.next() * total
	var species: String = "parrot"
	for s: Variant in weights:
		roll -= float(weights[s])
		if roll <= 0:
			species = s
			break
	var pool: Array = []
	for p: Dictionary in Rules.data()["pets"]:
		if p["species"] == species and not p["earnedOnly"]:
			pool.append(p)
	var total_w: float = 0.0
	for p: Dictionary in pool:
		total_w += float(p["weight"])
	var v: float = Dice.next() * total_w
	for p: Dictionary in pool:
		v -= float(p["weight"])
		if v <= 0:
			return p
	return pool[0]


## rollCrateLoot: { pet, outcome } where outcome is a cosmetic, doubloons or bait.
static func roll(tier: String, owned: Dictionary) -> Dictionary:
	var c: Dictionary = Rules.data()["crate"]
	var pet: Variant = roll_pet() if Dice.next() < float((c["petChance"] as Dictionary)[tier]) else null
	var unowned: Array = []
	var band_w: Array = []
	# The port's bands (content/port_rules.json): a crate draws only the
	# cosmetics in its tier's bands, weighted by band. Without them, the web's
	# even draw from the whole pool.
	var bands: Dictionary = Js.obj(Js.obj(c.get("cosmeticBands")).get(tier))
	var rarity: Dictionary = Js.obj(c.get("cosmeticRarity"))
	for entry: Dictionary in c["cosmeticPool"]:
		var list: Array = owned["skins"] if entry["kind"] == "skin" else (owned["boats"] if entry["kind"] == "boat" else owned["hats"])
		if Js.includes(list, entry["id"]):
			continue
		var w: float = 1.0
		if not rarity.is_empty():
			w = float(bands.get(str(rarity.get("%s:%s" % [entry["kind"], entry["id"]], "")), 0.0))
		if w > 0.0:
			unowned.append(entry)
			band_w.append(w)
	var weights: Dictionary = (c["outcomeWeights"] as Dictionary)[tier]
	var cosmetic_w: float = float(weights["cosmetic"]) if unowned.size() > 0 else 0.0
	var doubloon_w: float = float(weights["doubloons"]) + (0.0 if unowned.size() > 0 else float(weights["cosmetic"]))
	var pool: Array = [["doubloons", doubloon_w], ["bait", float(weights["bait"])], ["cosmetic", cosmetic_w]]
	var total: float = 0.0
	for o: Array in pool:
		total += float(o[1])
	var rand: float = Dice.next() * total
	var outcome: String = "doubloons"
	for o: Array in pool:
		rand -= float(o[1])
		if rand <= 0:
			outcome = o[0]
			break
	if outcome == "cosmetic":
		if rarity.is_empty():
			return { "pet": pet, "outcome": { "kind": "cosmetic", "entry": unowned[int(floor(Dice.next() * unowned.size()))] } }
		var wt: float = 0.0
		for w: float in band_w:
			wt += w
		var cr: float = Dice.next() * wt
		for i: int in unowned.size():
			cr -= float(band_w[i])
			if cr <= 0.0:
				return { "pet": pet, "outcome": { "kind": "cosmetic", "entry": unowned[i] } }
		return { "pet": pet, "outcome": { "kind": "cosmetic", "entry": unowned.back() } }
	if outcome == "doubloons":
		var range_: Array = (c["doubloonRange"] as Dictionary)[tier]
		var lo: float = float(range_[0])
		var hi: float = float(range_[1])
		return { "pet": pet, "outcome": { "kind": "doubloons", "amount": floor(lo + Dice.next() * (hi - lo + 1.0)) } }
	var bait_pool: Array = (c["baitPools"] as Dictionary)[tier]
	var total_b: float = 0.0
	for b: Dictionary in bait_pool:
		total_b += float(b["weight"])
	var br: float = Dice.next() * total_b
	var picked: Dictionary = bait_pool[0]
	for b: Dictionary in bait_pool:
		br -= float(b["weight"])
		if br <= 0:
			picked = b
			break
	return { "pet": pet, "outcome": { "kind": "bait", "baitType": picked["type"], "qty": float((c["baitQty"] as Dictionary)[tier]) } }


## grantCrateLootTo: roll the crate and put it in the captain's hands.
static func grant(db: CaptainStore, uid: String, tier: String) -> Dictionary:
	var profile: Dictionary = db.profile(uid, "unlocked_character_colors, unlocked_boats, unlocked_hats, unlocked_pets")
	var pets: Array = Js.list(profile.get("unlocked_pets"))
	var r: Dictionary = roll(tier, {
		"skins": Js.list(profile.get("unlocked_character_colors")),
		"boats": Js.list(profile.get("unlocked_boats")),
		"hats": Js.list(profile.get("unlocked_hats")),
	})
	var dupe: Variant = null
	if r["pet"] != null:
		var pet: Dictionary = r["pet"]
		if not Js.includes(pets, pet["id"]) and db.add_to_list(uid, "unlocked_pets", pet["id"]):
			db.update_profile_if_null(uid, { "equipped_pet": pet["id"] }, "equipped_pet")
			return { "type": "pet", "petId": pet["id"], "petName": pet["name"], "petImageUrl": pet["restImageUrl"], "petAccent": pet["accentColor"] }
		dupe = { "petId": pet["id"], "petName": pet["name"], "petImageUrl": pet["restImageUrl"], "petAccent": pet["accentColor"] }
	var o: Dictionary = r["outcome"]
	var loot: Dictionary
	if o["kind"] == "cosmetic":
		var e: Dictionary = o["entry"]
		if e["kind"] == "skin":
			db.add_to_list(uid, "unlocked_character_colors", e["id"])
			loot = { "type": "skin", "skinId": e["id"], "skinName": e["name"] }
		elif e["kind"] == "boat":
			db.add_to_list(uid, "unlocked_boats", e["id"])
			loot = { "type": "boat", "boatId": e["id"], "boatName": e["name"], "boatImageUrl": e["imageUrl"] }
		else:
			db.add_to_list(uid, "unlocked_hats", e["id"])
			loot = { "type": "hat", "hatId": e["id"], "hatName": e["name"], "hatImageUrl": e["imageUrl"] }
	elif o["kind"] == "doubloons":
		var now: float = db.grant(uid, "doubloons", o["amount"])
		loot = { "type": "doubloons", "amount": o["amount"], "newDoubloons": now }
	else:
		db.add_bait(uid, o["baitType"], o["qty"])
		loot = { "type": "bait", "baitType": o["baitType"], "baitName": Rules.bait(o["baitType"])["name"], "quantity": o["qty"] }
	if dupe != null:
		loot["dupePet"] = dupe
	return loot
