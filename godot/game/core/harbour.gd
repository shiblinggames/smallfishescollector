class_name Harbour
extends RefCounted
## THE TACKLE SHOP AND THE HOLD'S UPGRADE, a port of web/lib/core/harbour.ts
## (Godot port, docking): bait by the bundle, rods (bought as copies, sold back
## at 65%, the Captain's rods for Captains, each gated by fishing level), the
## next reel and hook, the Completionist once the whole of fishing is done, and
## the next hold. Each spends first and gives back if a second guard refuses.


static func _price(n: float) -> String:
	return Js.thousands(n)


static func buy_bait(db: CaptainStore, uid: String, bait_type: String, qty: float) -> Dictionary:
	var bait: Dictionary = {}
	for b: Dictionary in Rules.data()["baits"]:
		if b["type"] == bait_type:
			bait = b
	if bait.is_empty() or float(bait["shopCost"]) <= 0:
		return { "error": "Not for sale" }
	var gb: String = Rules.gate_block("bait", bait_type, Js.num(db.profile(uid, "fishing_xp").get("fishing_xp")))
	if gb != "":
		return { "error": gb }
	if qty != floor(qty) or qty <= 0:
		return { "error": "Invalid quantity" }
	var p: Dictionary = db.profile(uid, "doubloons")
	var total: float = float(bait["shopCost"]) * qty
	if Js.num(p.get("doubloons")) < total:
		return { "error": "Need %s ⟡" % _price(total) }
	var now: Variant = db.deduct_doubloons(uid, total)
	if now == null:
		return { "error": "Need %s ⟡" % _price(total) }
	db.add_bait(uid, bait_type, qty)
	var new_qty: float = Js.num((db.save["bait"] as Dictionary).get(bait_type, qty))
	db.ledger(uid, -total, "Bought %d× %s" % [int(qty), bait["name"]])
	return { "doubloons": now, "newQty": new_qty }


static func purchase_rod(db: CaptainStore, uid: String, rod_tier: float) -> Dictionary:
	var rod: Dictionary = _rod(rod_tier)
	if rod.is_empty():
		return { "error": "Invalid rod" }
	if float(rod["cost"]) == 0.0 or rod.get("earnedOnly") == true:
		return { "error": "This rod cannot be purchased" }
	if rod.get("traderOnly") == true:
		return { "error": "No chandler ashore carries that. You will have to find one who does." }
	var p: Dictionary = db.profile(uid, "doubloons, fishing_xp, is_premium, premium_expires_at")
	var shop: Dictionary = (Rules.data()["rodShop"] as Dictionary)[Js.key(rod_tier)]
	if shop["captainRod"] and not Rules.premium_active(p):
		return { "error": "The %s is a Captain's rod. Become a Captain to wield it." % rod["name"] }
	var req: int = int(shop["levelReq"])
	if Rules.level_from_xp(Js.num(p.get("fishing_xp"))) < req:
		return { "error": "Reach Fishing Lv %d to buy the %s" % [req, rod["name"]] }
	if Js.num(p.get("doubloons")) < float(rod["cost"]):
		return { "error": "Need %s ⟡" % _price(float(rod["cost"])) }
	var now: Variant = db.deduct_doubloons(uid, float(rod["cost"]))
	if now == null:
		return { "error": "Need %s ⟡" % _price(float(rod["cost"])) }
	db.rod_give(uid, rod["id"])
	db.ledger(uid, -float(rod["cost"]), "Bought %s" % rod["name"])
	return { "doubloons": now, "ownedRods": db.held_rod_tiers(uid) }


static func sell_rod(db: CaptainStore, uid: String, rod_tier: float) -> Dictionary:
	var rod: Dictionary = _rod(rod_tier)
	if rod.is_empty():
		return { "error": "Invalid rod" }
	if float(rod["cost"]) == 0.0 or rod.get("earnedOnly") == true:
		return { "error": "This rod cannot be sold" }
	var p: Dictionary = db.profile(uid, "doubloons, rod_tier")
	var refund: float = floor(float(rod["cost"]) * float(Rules.data()["rodSellRate"]))
	if not db.rod_take(uid, rod["id"]):
		return { "error": "You don't own this rod" }
	var was_equipped: bool = Js.num(p.get("rod_tier")) == rod_tier and db.rod_held(uid, rod["id"]) == 0.0
	var new_tier: float = 0.0 if was_equipped else Js.num(p.get("rod_tier"))
	var now: float = db.grant(uid, "doubloons", refund)
	if was_equipped:
		db.update_profile_if(uid, { "rod_tier": 0.0 }, [{ "col": "rod_tier", "eq": rod_tier }])
	db.ledger(uid, refund, "Sold %s" % rod["name"])
	return { "doubloons": now, "ownedRods": db.held_rod_tiers(uid), "refund": refund, "rodTier": new_tier }


## completionistProgress: level 100, every species, every regular at Thick as
## Thieves, every isle landed on.
static func completionist_progress(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "fishing_xp, ancient_catches, lifetime_species, prestige_levels")
	var needs: Dictionary = Rules.data()["completionistNeeds"]
	var caught: Dictionary = {}
	for id: Variant in Js.list(p.get("lifetime_species")) + db.collection_ids(uid) + Js.list(p.get("ancient_catches")):
		caught[float(id)] = true
	if Rules.has_prestiged_all_zones(p.get("prestige_levels")):
		for s: Dictionary in db.save["species"]:
			if s["habitat"] != "ancient_deep":
				caught[float(s["id"])] = true
	var species_have: int = 0
	for s: Dictionary in db.save["species"]:
		if caught.has(float(s["id"])):
			species_have += 1
	var maxed: Dictionary = {}
	for r: Dictionary in db.save["rapport"]:
		if Js.includes(needs["folk"], r.get("folk_id")) and Js.num(r.get("points")) >= float(needs["maxRapport"]):
			maxed[r["folk_id"]] = true
	var found: Dictionary = {}
	for d: Variant in db.save["discoveries"]:
		if Js.includes(needs["isles"], d):
			found[d] = true
	var reqs: Array = [
		["Fishing Level", float(Rules.level_from_xp(Js.num(p.get("fishing_xp")))), float(needs["level"])],
		["Species Discovered", float(species_have), float((db.save["species"] as Array).size())],
		["Regulars, Thick as Thieves", float(maxed.size()), float((needs["folk"] as Array).size())],
		["Isles Landed On", float(found.size()), float((needs["isles"] as Array).size())],
	]
	var all: Array = []
	var eligible: bool = true
	for r: Array in reqs:
		var done: bool = float(r[2]) > 0 and float(r[1]) >= float(r[2])
		all.append({ "label": r[0], "have": minf(float(r[1]), float(r[2])), "need": r[2], "done": done })
		if not done:
			eligible = false
	return { "all": all, "eligible": eligible }


static func completionist_blocker(progress: Dictionary) -> Variant:
	var all: Array = progress["all"]
	for i: int in all.size():
		var r: Dictionary = all[i]
		if r["done"]:
			continue
		match i:
			0:
				return "Need level %d (you're level %d)" % [int(r["need"]), int(r["have"])]
			1:
				return "Catch all %d species first (%d so far)" % [int(r["need"]), int(r["have"])]
			2:
				return "Get all %d regulars to Thick as Thieves first (%d so far)" % [int(r["need"]), int(r["have"])]
			_:
				return "Land on all %d isles first (%d so far)" % [int(r["need"]), int(r["have"])]
	return null


static func claim_completionist_rod(db: CaptainStore, uid: String) -> Dictionary:
	if db.rod_held(uid, "completionist") > 0.0:
		return { "error": "Already owned" }
	var progress: Dictionary = completionist_progress(db, uid)
	if not progress["eligible"]:
		return { "error": Js.nz(completionist_blocker(progress), "Not yet") }
	db.rod_give(uid, "completionist")
	db.grant_badge(uid, "completionist_rod")
	return { "ownedRods": db.held_rod_tiers(uid) }


## The next reel or hook: bought in order, gated by fishing level.
static func _buy_tier(db: CaptainStore, uid: String, col: String, list_key: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "%s, doubloons, fishing_xp" % col)
	var tiers: Array = Rules.data()[list_key]
	var cur: float = Js.num(p.get(col))
	var next: int = int(cur) + 1
	if next >= tiers.size():
		return { "error": "Already at max tier" }
	var item: Dictionary = tiers[next]
	var cost: float = float(item["cost"])
	if Rules.level_from_xp(Js.num(p.get("fishing_xp"))) < int(item["levelReq"]):
		return { "error": "Reach Fishing Lv %d to buy the %s" % [int(item["levelReq"]), item["name"]] }
	var now: Variant = db.spend(uid, "doubloons", cost)
	if now == null:
		return { "error": "Not enough doubloons" }
	var guard: Array = [{ "col": col, "is": null }] if p.get(col) == null else [{ "col": col, "eq": p.get(col) }]
	if not db.update_profile_if(uid, { col: float(next) }, guard):
		db.grant(uid, "doubloons", cost)
		return { "error": "Your tackle just changed. Try again." }
	db.ledger(uid, -cost, "Bought %s" % item["name"])
	return { col.replace("_tier", "Tier"): float(next), "doubloons": now }


static func buy_reel(db: CaptainStore, uid: String) -> Dictionary:
	return _buy_tier(db, uid, "reel_tier", "reels")


static func buy_hook(db: CaptainStore, uid: String) -> Dictionary:
	return _buy_tier(db, uid, "hook_tier", "hooks")


static func upgrade_fish_hold(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "doubloons, fish_hold_tier")
	var tiers: Array = Rules.data()["fishHoldTiers"]
	var cur: float = Js.num(p.get("fish_hold_tier"))
	if cur >= tiers.size() - 1:
		return { "error": "Fish hold is already at max tier" }
	var gh: String = Rules.gate_block("hold", str(int(cur + 1.0)), Js.num(db.profile(uid, "fishing_xp").get("fishing_xp")))
	if gh != "":
		return { "error": gh }
	var nxt: Dictionary = Rules.fish_hold(cur + 1.0)
	var now: Variant = db.spend(uid, "doubloons", float(nxt["cost"]))
	if now == null:
		return { "error": "Not enough doubloons" }
	var guard: Array = [{ "col": "fish_hold_tier", "is": null }] if p.get("fish_hold_tier") == null else [{ "col": "fish_hold_tier", "eq": p.get("fish_hold_tier") }]
	if not db.update_profile_if(uid, { "fish_hold_tier": cur + 1.0 }, guard):
		db.grant(uid, "doubloons", float(nxt["cost"]))
		return { "error": "Your hold just changed. Try again." }
	db.ledger(uid, -float(nxt["cost"]), "Upgraded fish hold to %s" % nxt["name"])
	return { "ok": true, "newTier": cur + 1.0, "doubloons": now }


static func _rod(tier: float) -> Dictionary:
	for r: Dictionary in Rules.data()["rods"]:
		if float(r["tier"]) == tier:
			return r
	return {}
