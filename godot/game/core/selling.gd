class_name Selling
extends RefCounted
## SELLING FISH, a port of the market and zone-buyer sales in
## web/lib/core/selling.ts (Godot port, docking).
##
## Two lanes (docs/systems/fish-economy.md): the Market ashore pays the full
## price (the species' value times its multiplier today), one stack or the
## whole hold in one go; the buyer out in each water takes the whole hold for a
## little less (78% in the Shallows up to 86% in the Ancient Deep) in exchange
## for not sailing home. The wandering traders' deals come with the regulars.


## Sell the whole hold at the market's prices.
static func sell_entire_hold(db: CaptainStore, uid: String) -> Dictionary:
	var stacks: Array = []
	for s: Dictionary in db.hold_stacks(uid):
		if float(s["quantity"]) > 0:
			stacks.append({ "fish_id": s["fish_id"], "quantity": s["quantity"], "sell_value": Js.num(db.species_value(float(s["fish_id"]))) })
	var save: Dictionary = db.save
	var market: Dictionary = Market.current(save)
	if stacks.is_empty():
		return { "error": "The hold is empty" }
	var earned: float = 0.0
	var sold: float = 0.0
	for item: Dictionary in stacks:
		if not db.empty_stack(uid, float(item["fish_id"]), float(item["quantity"])):
			continue
		var f: Variant = (market["fish"] as Dictionary).get(Js.key(item["fish_id"]))
		var mult: float = float((f as Dictionary)["m"]) if f != null else 1.0
		earned += Market.price_each(float(item["sell_value"]), mult) * float(item["quantity"])
		sold += float(item["quantity"])
	if earned <= 0:
		return { "error": "The hold is empty" }
	var now: float = db.grant(uid, "doubloons", earned)
	db.ledger(uid, earned, "Sold %d fish (market)" % int(sold))
	db.bump_stat(uid, "fish_sold_doubloons", earned)
	return { "earned": earned, "fishSold": sold, "doubloons": now }


## Sell some of one species at the market's price.
static func market_sell_fish(db: CaptainStore, uid: String, fish_id: float, quantity: float) -> Dictionary:
	if quantity != floor(quantity) or quantity <= 0:
		return { "error": "Invalid quantity" }
	var held: Variant = db.hold_qty(uid, fish_id)
	var value: Variant = db.species_value(fish_id)
	var mult: Variant = null if value == null else Market.multiplier(db.save, fish_id)
	if held == null or value == null:
		return { "error": "Data not found" }
	if float(held) < quantity:
		return { "error": "Not enough fish" }
	var earned: float = Market.price_each(float(value), float(Js.nz(mult, 1.0))) * quantity
	if not db.take_stack(uid, fish_id, float(held) - quantity, float(held)):
		return { "error": "Not enough fish" }
	var now: float = db.grant(uid, "doubloons", earned)
	db.ledger(uid, earned, "Sold fish (market)")
	db.bump_stat(uid, "fish_sold_doubloons", earned)
	return { "earned": earned, "doubloons": now }


static func resident(zone_id: String) -> Dictionary:
	for r: Dictionary in Rules.data()["residents"]:
		if r["zoneId"] == zone_id:
			return r
	return {}


static func _hold_at_rate(db: CaptainStore, rows: Array, rate: float) -> float:
	var total: float = 0.0
	for r: Dictionary in rows:
		total += Js.num(db.species_value(float(r["fish_id"]))) * float(r["quantity"]) * rate
	return floor(total)


## The buyer in a water takes the whole hold at their rate.
static func sell_to_resident(db: CaptainStore, uid: String, zone_id: String) -> Dictionary:
	var zone: Dictionary = {}
	for w: Dictionary in Chart.WATERS:
		if w["id"] == zone_id:
			zone = w
	var res: Dictionary = resident(zone_id)
	if zone.is_empty() or res.is_empty():
		return { "error": "There is nobody buying here." }
	var rate: float = float(res["rate"])
	var rows: Array = db.hold_stacks(uid)
	if rows.is_empty():
		return { "error": "Your hold is empty." }
	if _hold_at_rate(db, rows, rate) <= 0:
		return { "error": "Nothing in your hold is worth anything to them." }
	var taken: Array = db.take_whole_hold(uid)
	var sold: float = _hold_at_rate(db, taken, rate)
	if sold <= 0:
		return { "error": "Your hold is empty." }
	var now: float = db.grant(uid, "doubloons", sold)
	db.ledger(uid, sold, "Sold the hold to %s in %s" % [res["name"], zone["name"]])
	return { "ok": true, "earned": sold, "rate": rate, "doubloons": now }
