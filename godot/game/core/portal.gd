class_name Portal
extends RefCounted
## THE HOMESTEAD PORTAL AND THE FREE RECALL, a port of lib/seaPortal,
## lib/seaRecall and buyPortalTier / spendRecall in lib/core/sea.ts (Godot port,
## the rest of the sea, stage 5).
##
## The portal stands off the Homestead. Each rung reaches one more water: the
## Shallows comes free, every rung after it costs doubloons and wants the stone
## from a cache chest already opened in that water. Sailing it is free. The
## recall takes you home to the portal's mouth once a sea day/night cycle (48
## minutes), per side of the reef.

const AT: Dictionary = { "x": 2650.0, "y": -620.0, "r": 230.0 }
## Where the recall sets the fishing side down (CROSS_TO.fish).
const HOME_TO: Dictionary = { "x": 2650.0, "y": -190.0, "accent": "#7fd6a0", "name": "the Homestead Portal" }
const RECALL_MS: float = 48.0 * 60000.0
const RECALL_COL: Dictionary = { "fishing": "last_recall_fish_at", "expedition": "last_recall_exp_at" }


static func tiers() -> Array:
	return Rules.data()["portalTiers"]


static func tier_def(tier: int) -> Dictionary:
	for t: Dictionary in tiers():
		if int(t["tier"]) == tier:
			return t
	return {}


static func inside(x: float, y: float) -> bool:
	return Vector2(x - float(AT["x"]), y - float(AT["y"])).length() < float(AT["r"])


## Has a cache chest in this rung's water been opened?
static func has_stone_for(tier: int, discovered: Array) -> bool:
	var t: Dictionary = tier_def(tier)
	if t.is_empty():
		return false
	for i: Dictionary in Rules.data()["isles"]:
		if i["kind"] == "cache" and i["band"] == t["band"] and Js.includes(discovered, i["id"]):
			return true
	return false


static func buy_tier(db: CaptainStore, uid: String) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var discovered: Array = db.save["discoveries"]
	var current: int = int(prof.get("portal_tier", 1) if prof.get("portal_tier") != null else 1)
	var next: Dictionary = tier_def(current + 1)
	if next.is_empty():
		return { "error": "The portal already reaches the Ancient Deep." }
	if not has_stone_for(int(next["tier"]), discovered):
		return { "error": "No stone for %s yet. There is one in a chest out in %s. Sail it the long way first, then the portal will remember the road." % [next["name"], next["name"]] }
	# The port's rule: the portal to a water needs that water's Fishing level.
	if not Js.obj(Rules.data().get("levelGates")).is_empty():
		var need: int = int(Js.num((Rules.data()["zones"]["minLevel"] as Dictionary).get(next["band"])))
		if Rules.level_from_xp(Js.num(prof.get("fishing_xp"))) < need:
			return { "error": "Needs Fishing %d" % need }
	var cost: float = float(next["cost"])
	if Js.num(prof.get("doubloons")) < cost:
		return { "error": "That stage costs %s ⟡." % Js.thousands(cost) }
	prof["portal_tier"] = next["tier"]
	var bal: Variant = db.deduct_doubloons(uid, cost)
	if bal == null:
		prof["portal_tier"] = float(current)
		return { "error": "The payment did not go through." }
	db.ledger(uid, -cost, "Homestead Portal: %s" % next["name"])
	return { "ok": true, "tier": next["tier"], "doubloons": float(bal) }


static func spend_recall(db: CaptainStore, uid: String, side: String) -> Dictionary:
	if not RECALL_COL.has(side):
		return { "ok": false, "readyAt": null }
	var col: String = RECALL_COL[side]
	var now: float = Clock.now_ms()
	var at: String = Js.iso(now)
	var cutoff: String = Js.iso(now - RECALL_MS)
	var prof: Dictionary = db.me(uid)
	var last: Variant = prof.get(col)
	if last == null or str(last) < cutoff:
		prof[col] = at
		return { "ok": true, "at": at }
	return { "ok": false, "readyAt": Js.iso(Js.parse_ms(last) + RECALL_MS) }


## Minutes until this side's recall is back (0 when ready).
static func recall_left_ms(prof: Dictionary, side: String) -> float:
	var last: Variant = prof.get(RECALL_COL[side])
	if last == null:
		return 0.0
	return maxf(0.0, Js.parse_ms(last) + RECALL_MS - Clock.now_ms())
