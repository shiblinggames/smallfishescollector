class_name Shipyard
extends RefCounted
## THE SHIPYARD'S REFITS, a port of buyShipyardTier and equipRod in
## web/lib/core/ship.ts with the ladders of web/lib/shipyard.ts (exported as
## rules.json "shipyard").
##
## Four ladders, one shape: the hull (top speed), the rudder (how fast the bow
## comes round), the rig (how hard she picks up) and the lantern (how far it
## lights the water at night). Each rung is bought in order; the price comes
## from the table, never the request. The write is conditional on the tier just
## read, and one that does not land gives the coin back.


static func ladder(col: String) -> Dictionary:
	return Js.obj((Rules.data()["shipyard"] as Dictionary).get(col))


static func max_tier(col: String) -> int:
	return (ladder(col)["costs"] as Array).size() - 1


static func next_cost(col: String, tier: float) -> Variant:
	var costs: Array = ladder(col)["costs"]
	var t: int = int(tier) + 1
	return null if t > costs.size() - 1 else float(costs[t])


## What a rung does: the ladder's multiplier at this tier (clamped).
static func effect(col: String, tier: float) -> float:
	var e: Array = ladder(col)["effect"]
	return float(e[clampi(int(tier), 0, e.size() - 1)])


## LEVELS RAISE THE SHIP (the port's rules, content/port_rules.json
## shipUpgrades, by Fishing level for now): each level that carries an upgrade
## lifts that column to at least its tier, free. State-based, so it is right
## whenever it runs. Returns what it raised: [[column, tier, level], ...].
static func level_floors(db: CaptainStore, uid: String) -> Array:
	var ups: Dictionary = Js.obj(Rules.data().get("shipUpgrades"))
	if ups.is_empty():
		return []
	var cols: Array = ["fishing_xp"]
	for lv: Variant in ups:
		for c: Variant in ups[lv]:
			if not cols.has(c):
				cols.append(c)
	var p: Dictionary = db.profile(uid, ", ".join(PackedStringArray(cols)))
	var fishing: int = Rules.level_from_xp(Js.num(p.get("fishing_xp")))
	var patch: Dictionary = {}
	var raised: Array = []
	for lv: Variant in ups:
		if fishing < int(lv):
			continue
		for c: Variant in ups[lv]:
			var t: float = float(ups[lv][c])
			var have: float = maxf(Js.num(p.get(c)), Js.num(patch.get(c)))
			if t > have:
				patch[c] = t
				raised.append([c, t, int(lv)])
	if not patch.is_empty():
		db.update_profile(uid, patch)
	return raised


## The Fishing level that gives a tier for free, or 0.
static func free_at(col: String, tier: float) -> int:
	var ups: Dictionary = Js.obj(Rules.data().get("shipUpgrades"))
	for lv: Variant in ups:
		if float(Js.obj(ups[lv]).get(col, -1.0)) == tier:
			return int(lv)
	return 0


static func buy_tier(db: CaptainStore, uid: String, col: String) -> Dictionary:
	# The port's rule: each bought tier is behind a Fishing level.
	var cur_t: float = Js.num(db.profile(uid, col).get(col))
	var gate_need: int = int(Js.num(Js.obj(Js.obj(Js.obj(Rules.data().get("levelGates")).get("ship")).get(col)).get(str(int(cur_t + 1.0)))))
	if gate_need > 0 and Rules.level_from_xp(Js.num(db.profile(uid, "fishing_xp").get("fishing_xp"))) < gate_need:
		return { "error": "Needs Fishing %d" % gate_need }
	var l: Dictionary = ladder(col)
	var p: Dictionary = db.profile(uid, col)
	var tier: float = Js.num(p.get(col))
	if tier >= max_tier(col):
		return { "error": l["full"] }
	var price: Variant = next_cost(col, tier)
	if price == null:
		return { "error": l["full"] }
	var bal: Variant = db.deduct_doubloons(uid, float(price))
	if bal == null:
		return { "error": "That refit costs %s and you have not got it." % Js.thousands(float(price)) }
	db.ledger(uid, -float(price), "Shipyard: %s %d" % [l["label"], int(tier) + 1])
	var after: Dictionary = db.profile(uid, col)
	var seen: float = float(Js.nz(after.get(col), tier))
	var fitted: bool = db.update_profile_if(uid, { col: minf(max_tier(col), seen + 1.0) }, [{ "col": col, "eq": Js.nz(after.get(col), 0.0) }])
	if not fitted:
		db.grant(uid, "doubloons", float(price))
		db.ledger(uid, float(price), "Refunded: %s %d could not be fitted" % [l["label"], int(tier) + 1])
		return { "error": "The yard could not fit that. Your coin is back in your purse." }
	return { "ok": true, "doubloons": bal }


static func equip_rod(db: CaptainStore, uid: String, tier: float) -> Dictionary:
	var rod: Dictionary = Rules.rod(tier)
	if rod.is_empty() or float(rod.get("tier", -1.0)) != tier:
		return { "error": "No such rod." }
	if float(rod["cost"]) != 0.0 or rod.get("earnedOnly") == true or rod.get("traderOnly") == true:
		if db.rod_held(uid, rod["id"]) == 0.0:
			return { "error": "You do not carry that rod." }
	db.update_profile(uid, { "rod_tier": tier })
	return { "ok": true }
