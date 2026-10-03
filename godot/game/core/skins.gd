class_name Skins
extends RefCounted
## CREW SKINS AND SKIN VOUCHERS (Kong, 2026-10-03; the web's 75 skins,
## lib/crewSkins.ts, rules.json "crewSkins"). Gems are retired, so skins are
## earned: a SKIN VOUCHER is an item found like a crate, rarely, and opens to
## a skin you do not own yet. TWO KINDS (port_rules skinVouchers.kinds):
##   BOSUN'S   from wooden, metal and gold crates and the lesser caskets.
##   CAPTAIN'S from diamond and ancient crates and elite caskets, and once
##             from the Parlor at Parlor Legend (its capstone).
## Each kind rolls the skin's tier by its own weights (rare, epic, legendary),
## then a skin in that tier. A Legendary crew's skins include its chase skins
## (animated); within that roll a chase skin counts a little less than a
## plain one (chaseWeight), so it is a little harder (Kong, 2026-10-03:
## "It's already rare to get a legendary. Just have it slightly harder to
## roll a chase if you roll a legendary"). A tier you own all of is left out
## and the rest keep their shares,
## so a voucher never comes up empty; with every skin owned it pays doubloons.
## A skin can be for a crew not signed yet: it waits in the Trunk. Skins are
## worn per crew type (every copy wears it), as on the web.

const TIERS: Array = ["rare", "epic", "legendary", "chase"]
## What a voucher rolls first: chase skins are in the legendary roll.
const ROLLS: Array = ["rare", "epic", "legendary"]
const KINDS: Array = ["bosun", "captain"]


static func cfg() -> Dictionary:
	return Js.obj(Rules.data().get("skinVouchers"))


static func kind_def(kind: String) -> Dictionary:
	return Js.obj(Js.obj(cfg().get("kinds")).get(kind))


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


## The roll a skin is in: its tier, with chase skins in the legendary roll.
static func roll_of(k: Dictionary) -> String:
	return "legendary" if k.get("chase", false) else tier_of(k)


## Of a legendary roll on a fresh collection, the share that is a chase skin.
static func chase_share() -> float:
	var cw: float = float(cfg().get("chaseWeight", 1.0))
	var plain: float = 0.0
	var chase: float = 0.0
	for k: Dictionary in all():
		if k.get("chase", false):
			chase += cw
		elif tier_of(k) == "legendary":
			plain += 1.0
	return chase / maxf(1.0, chase + plain)


static func owned(prof: Dictionary) -> Array:
	return Js.list(prof.get("owned_crew_skins"))


static func equipped(prof: Dictionary) -> Dictionary:
	return Js.obj(prof.get("equipped_crew_skins"))


## The art a crew card wears: its equipped skin's, or its own.
static func filename_for(prof: Dictionary, slug: String, base: String) -> String:
	var k: Dictionary = by_id(equipped(prof).get(slug))
	return str(k["filename"]) if not k.is_empty() else base


## Vouchers held, by kind. (The first build kept a list with a floor each:
## rare and epic floors read as Bosun's, legendary and chase as Captain's.)
static func vouchers(prof: Dictionary) -> Dictionary:
	var v: Variant = prof.get("skin_vouchers")
	if v is Array:
		var out: Dictionary = {}
		for x: Variant in v:
			var k: String = "captain" if str(Js.obj(x).get("floor")) in ["legendary", "chase"] else "bosun"
			out[k] = Js.num(out.get(k)) + 1.0
		return out
	return Js.obj(v)


static func held(prof: Dictionary) -> int:
	var n: int = 0
	for k: Variant in vouchers(prof):
		n += int(Js.num(vouchers(prof)[k]))
	return n


static func grant(db: CaptainStore, uid: String, kind: String, n: float = 1.0) -> void:
	var v: Dictionary = vouchers(db.me(uid)).duplicate()
	v[kind] = Js.num(v.get(kind)) + n
	db.update_profile(uid, { "skin_vouchers": v })


## A drop table ({kind: chance}) rolled: what was found, granted.
static func roll_drops(db: CaptainStore, uid: String, table: Variant) -> Dictionary:
	var out: Dictionary = {}
	var tb: Dictionary = Js.obj(table)
	for kind: Variant in tb:
		if Dice.next() < float(tb[kind]):
			grant(db, uid, str(kind))
			out[str(kind)] = 1.0
	return out


## A crate's or a casket's vouchers (port_rules skinVouchers.drops).
static func drops(db: CaptainStore, uid: String, source: String, tier: String) -> Dictionary:
	return roll_drops(db, uid, Js.obj(Js.obj(cfg().get("drops")).get(source)).get(tier))


## The Parlor's capstone: a Captain's Voucher at Parlor Legend, once
## (state-based: paid whenever the rank is found reached).
static func sync_parlor(db: CaptainStore, uid: String) -> void:
	var at: String = str(cfg().get("parlorCapstone", ""))
	if at == "":
		return
	var prof: Dictionary = db.me(uid)
	if prof.get("parlor_capstone_paid") == true:
		return
	for r: Dictionary in Parlor.c()["ranks"]:
		if r["title"] == at and Js.num(prof.get("parlor_points")) >= float(r["at"]):
			grant(db, uid, "captain")
			db.update_profile(uid, { "parlor_capstone_paid": true })


## Open a voucher of a kind: its tier by the kind's weights over the tiers
## with a skin left, then a skin in that tier.
static func open(db: CaptainStore, uid: String, kind: String) -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var v: Dictionary = vouchers(prof).duplicate()
	if Js.num(v.get(kind)) < 1.0:
		return { "error": "You have no voucher like that." }
	v[kind] = Js.num(v.get(kind)) - 1.0
	if float(v[kind]) <= 0.0:
		v.erase(kind)
	var have: Array = owned(prof)
	var left: Dictionary = {}
	for k: Dictionary in all():
		if not have.has(k["id"]):
			var t: String = roll_of(k)
			if not left.has(t):
				left[t] = []
			(left[t] as Array).append(k)
	if left.is_empty():
		var pay: float = float(cfg().get("allOwnedPays", 2500))
		db.update_profile(uid, { "skin_vouchers": v })
		db.bump_stat(uid, "doubloons", pay)
		db.ledger(uid, pay, "A skin voucher, every skin already owned")
		return { "ok": true, "kind": kind, "doubloons": pay }
	var w: Dictionary = Js.obj(kind_def(kind).get("weights"))
	var total: float = 0.0
	for t: String in ROLLS:
		if left.has(t):
			total += float(w.get(t, 0.0))
	var tier: String = ""
	var r: float = Dice.next() * total
	for t: String in ROLLS:
		if left.has(t) and float(w.get(t, 0.0)) > 0.0:
			tier = t
			r -= float(w.get(t, 0.0))
			if r < 0.0:
				break
	if tier == "":
		# Only tiers this kind never gives are left: the lowest of them.
		for t: String in ROLLS:
			if left.has(t):
				tier = t
				break
	# A skin in the tier, a chase skin counting chaseWeight to a plain one's 1.
	var pool: Array = left[tier]
	var cw: float = float(cfg().get("chaseWeight", 1.0))
	var pw: float = 0.0
	for k: Dictionary in pool:
		pw += cw if k.get("chase", false) else 1.0
	var pr: float = Dice.next() * pw
	var pick: Dictionary = pool[pool.size() - 1]
	for k: Dictionary in pool:
		pr -= cw if k.get("chase", false) else 1.0
		if pr < 0.0:
			pick = k
			break
	tier = tier_of(pick)
	var new_owned: Array = have.duplicate()
	new_owned.append(pick["id"])
	var patch: Dictionary = { "skin_vouchers": v, "owned_crew_skins": new_owned }
	# Worn at once if you have that crew and it wears nothing yet.
	var eq: Dictionary = equipped(prof).duplicate()
	var crew_has: bool = Crew.live(db).any(func(c: Dictionary) -> bool: return str(Crew.card(float(c["card_id"])).get("slug", "")).to_lower() == pick["slug"])
	if crew_has and not eq.has(pick["slug"]):
		eq[pick["slug"]] = pick["id"]
		patch["equipped_crew_skins"] = eq
	db.update_profile(uid, patch)
	return { "ok": true, "kind": kind, "skin": pick, "tier": tier, "worn": patch.has("equipped_crew_skins"), "crewHas": crew_has }


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
