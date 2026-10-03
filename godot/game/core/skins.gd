class_name Skins
extends RefCounted
## CREW SKINS AND SKIN VOUCHERS (Kong, 2026-10-03: "get all the skins in and
## set up the crew roll voucher system"; the web's 75 skins, lib/crewSkins.ts,
## rules.json "crewSkins"). Gems are retired, so skins are earned, never
## bought: a SKIN VOUCHER opens to a skin you do not own yet, at or above its
## floor (rare, epic, legendary, or chase: a Legendary crew's animated skin),
## weighted toward the lower tiers it allows so the best stay special. It can
## land on a crew you have not signed: the skin waits in your Trunk until you
## do. Skins are worn per crew type (every copy wears it), as on the web.
##
## Vouchers come from the Parlor's ranks first (one a rank, the floor rising
## with the rank; port_rules skinVouchers). With every skin owned, a voucher
## pays doubloons instead.

const TIERS: Array = ["rare", "epic", "legendary", "chase"]


static func cfg() -> Dictionary:
	return Js.obj(Rules.data().get("skinVouchers"))


static func all() -> Array:
	return Js.list(Rules.data().get("crewSkins"))


static func by_id(id: Variant) -> Dictionary:
	if id == null:
		return {}
	for k: Dictionary in all():
		if k["id"] == id:
			return k
	return {}


static func for_slug(slug: String) -> Array:
	return all().filter(func(k: Dictionary) -> bool: return k["slug"] == slug)


## A skin's tier: its crew's rarity, or "chase".
static func tier_of(k: Dictionary) -> String:
	if k.get("chase", false):
		return "chase"
	match int(k.get("crewTier", 1)):
		3:
			return "legendary"
		2:
			return "epic"
	return "rare"


static func owned(prof: Dictionary) -> Array:
	return Js.list(prof.get("owned_crew_skins"))


static func equipped(prof: Dictionary) -> Dictionary:
	return Js.obj(prof.get("equipped_crew_skins"))


## The art a crew card wears: its equipped skin's, or its own.
static func filename_for(prof: Dictionary, slug: String, base: String) -> String:
	var k: Dictionary = by_id(equipped(prof).get(slug))
	return str(k["filename"]) if not k.is_empty() else base


static func vouchers(prof: Dictionary) -> Array:
	return Js.list(prof.get("skin_vouchers"))


static func grant(db: CaptainStore, uid: String, floor_tier: String, from: String) -> void:
	var prof: Dictionary = db.me(uid)
	var n: float = Js.num(prof.get("skin_voucher_next")) + 1.0
	var list: Array = vouchers(prof).duplicate()
	list.append({ "id": "v%d" % int(n), "floor": floor_tier, "from": from })
	db.update_profile(uid, { "skin_vouchers": list, "skin_voucher_next": n })


## The Parlor's ranks, one voucher each (state-based: every rank reached and
## not yet paid is paid now, however it was reached).
static func sync_parlor(db: CaptainStore, uid: String) -> void:
	var floors: Array = Js.list(cfg().get("parlorRanks"))
	if floors.is_empty():
		return
	var prof: Dictionary = db.me(uid)
	var pts: float = Js.num(prof.get("parlor_points"))
	var ranks: Array = Parlor.c()["ranks"]
	var reached: int = 0
	for i: int in range(1, ranks.size()):
		if pts >= float(ranks[i]["at"]):
			reached = i
	var paid: int = int(Js.num(prof.get("parlor_vouchers_paid")))
	while paid < reached and paid < floors.size():
		grant(db, uid, str(floors[paid]), "The Parlor: %s" % ranks[paid + 1]["title"])
		paid += 1
	db.update_profile(uid, { "parlor_vouchers_paid": float(paid) })


## Open a voucher: a skin not owned, at or above its floor, weighted toward
## the lower tiers allowed; the floor falls back if nothing is left there,
## and with every skin owned it pays doubloons.
static func open(db: CaptainStore, uid: String, voucher_id: String) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var list: Array = vouchers(prof).duplicate()
	var v: Dictionary = {}
	for x: Dictionary in list:
		if x["id"] == voucher_id:
			v = x
	if v.is_empty():
		return { "error": "That voucher is not in your hand." }
	list.erase(v)
	var have: Array = owned(prof)
	var floor_i: int = TIERS.find(str(v["floor"]))
	var weights: Dictionary = Js.obj(cfg().get("weights"))
	var pick: Dictionary = {}
	for f: int in range(floor_i, -1, -1):
		var pool: Array = all().filter(func(k: Dictionary) -> bool: return not have.has(k["id"]) and TIERS.find(tier_of(k)) >= f)
		if pool.is_empty():
			continue
		var total: float = 0.0
		for k: Dictionary in pool:
			total += float(weights.get(tier_of(k), 1.0))
		var r: float = Dice.next() * total
		for k: Dictionary in pool:
			r -= float(weights.get(tier_of(k), 1.0))
			if r <= 0.0:
				pick = k
				break
		if pick.is_empty():
			pick = pool[pool.size() - 1]
		break
	if pick.is_empty():
		var pay: float = float(cfg().get("allOwnedPays", 2500))
		db.update_profile(uid, { "skin_vouchers": list })
		db.bump_stat(uid, "doubloons", pay)
		db.ledger(uid, pay, "A skin voucher, every skin already owned")
		return { "ok": true, "doubloons": pay }
	var new_owned: Array = have.duplicate()
	new_owned.append(pick["id"])
	var patch: Dictionary = { "skin_vouchers": list, "owned_crew_skins": new_owned }
	# Worn at once if you have that crew and it wears nothing yet.
	var eq: Dictionary = equipped(prof).duplicate()
	var crew_has: bool = Crew.live(db).any(func(c: Dictionary) -> bool: return str(Crew.card(float(c["card_id"])).get("slug", "")).to_lower() == pick["slug"])
	if crew_has and not eq.has(pick["slug"]):
		eq[pick["slug"]] = pick["id"]
		patch["equipped_crew_skins"] = eq
	db.update_profile(uid, patch)
	return { "ok": true, "skin": pick, "tier": tier_of(pick), "worn": patch.has("equipped_crew_skins"), "crewHas": crew_has }


static func equip(db: CaptainStore, uid: String, slug: String, skin_id: Variant) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var eq: Dictionary = equipped(prof).duplicate()
	if skin_id == null or str(skin_id) == "":
		eq.erase(slug)
	else:
		var k: Dictionary = by_id(skin_id)
		if k.is_empty() or k["slug"] != slug:
			return { "error": "That skin is not for this crew." }
		if not owned(prof).has(k["id"]):
			return { "error": "You do not own that skin." }
		eq[slug] = k["id"]
	db.update_profile(uid, { "equipped_crew_skins": eq })
	return { "ok": true, "equipped": eq }


static func state(db: CaptainStore, uid: String) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var crew_slugs: Array = []
	for c: Dictionary in Crew.live(db):
		var s: String = str(Crew.card(float(c["card_id"])).get("slug", "")).to_lower()
		if not crew_slugs.has(s):
			crew_slugs.append(s)
	return { "owned": owned(prof), "equipped": equipped(prof), "vouchers": vouchers(prof), "crewSlugs": crew_slugs, "total": all().size() }
