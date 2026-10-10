extends RefCounted
## Part of Gauntlet: the Locker (gauntletUpgrades), its upgrades, what each
## one does to a dive, and buying and switching them. Split out of
## core/gauntlet.gd on 2026-10-10 for size. Callers go through Gauntlet's
## forwarders.

# ══ The Locker (gauntletUpgrades) ═════════════════════════════════════════════

static func upgrade_def(id: String) -> Dictionary:
	for u: Dictionary in Js.list(Gauntlet.t().get("upgrades")):
		if u["id"] == id:
			return _worded(u)
	return {}


static func _worded(u: Dictionary) -> Dictionary:
	if Rules.web_only or not PORT_WORDS.has(u["id"]):
		return u
	var w: Dictionary = u.duplicate()
	w["description"] = PORT_WORDS[u["id"]]
	return w


## The Locker's upgrades the port does not sell: gone by decision (the Don's
## Tribute; the Crimson Tithe with Blood Gems).
const NOT_SOLD: Array = ["dg_daily_tribute", "dg_crimson_tithe"]

## The forge's three upgrades, said as the port's redesigned forge works
## (core/forge.gd): no recipe toll, no gems, no day's wait.
const PORT_WORDS: Dictionary = {
	"forge": "Opens the anvil at the forge island: put two raid items on it to find the recipes that fuse them, forge what you find, temper spare copies to +1, +2 and +3, and break unwanted copies into scrap.",
	"dg_abyssal_forge": "Lets the anvil fuse two forged items into a tier-3 Abyssal item, carrying both effect sets in a single mount. The endgame forge.",
	"dg_abyssal_accel": "Transmuting at the anvil: an epic boss item, a second copy of itself and 25 scrap become its legendary chase counterpart at once.",
}


static func upgrades_for(variant: String) -> Array:
	return Js.list(Gauntlet.t().get("upgrades")).filter(func(u: Dictionary) -> bool: return str(Js.nz(u.get("gauntlet"), "davy")) == variant and not NOT_SOLD.has(u["id"])).map(func(u: Dictionary) -> Dictionary: return _worded(u))


## A permanent upgrade owned in either Locker (the web reads the two together).
static func owns(p: Dictionary, id: String) -> bool:
	return (Js.list(p.get("gauntlet_upgrades")) + Js.list(p.get("dons_gauntlet_upgrades"))).has(id)


## The Run Upgrades this captain has on for a dive (owned, not switched off).
static func active_upgrades(owned: Array, off: Array) -> Array:
	return owned.filter(func(id: Variant) -> bool: return not off.has(id))


static func _has(ups: Array, id: String) -> bool:
	return ups.has(id)


static func run_hp_mult(ups: Array) -> float:
	var m: float = 1.0
	if _has(ups, "diving_bell"):
		m *= 1.15
	m *= 1.5 if _has(ups, "dg_hp_3") else (1.35 if _has(ups, "dg_hp_2") else (1.2 if _has(ups, "dg_hp") else 1.0))
	return m


static func damage_taken_mod(ups: Array) -> float:
	var p: float = 0.0
	if _has(ups, "iron_hide"):
		p -= 10.0
	p += -25.0 if _has(ups, "dg_armor_3") else (-18.0 if _has(ups, "dg_armor_2") else (-12.0 if _has(ups, "dg_armor") else 0.0))
	if _has(ups, "dg_loan_shark"):
		p += 18.0
	return p


static func damage_mod(ups: Array) -> float:
	var p: float = 0.0
	if _has(ups, "gunners_eye"):
		p += 10.0
	p += 22.0 if _has(ups, "dg_power_3") else (16.0 if _has(ups, "dg_power_2") else (10.0 if _has(ups, "dg_power") else 0.0))
	if _has(ups, "dg_loan_shark"):
		p += 25.0
	return p


static func kill_heal_pct(ups: Array) -> float:
	var p: float = 0.08 if _has(ups, "vigor") else 0.0
	return maxf(p, 0.22 if _has(ups, "dg_lifedrain_3") else (0.15 if _has(ups, "dg_lifedrain_2") else (0.10 if _has(ups, "dg_lifedrain") else 0.0)))


static func fathoms_mult(ups: Array) -> float:
	return (1.33 if _has(ups, "lucky_locker") else 1.0) * (1.4 if _has(ups, "dg_fathoms") else 1.0)


static func haul_mult(ups: Array) -> float:
	return (1.15 if _has(ups, "salvagers_eye") else 1.0) * (1.2 if _has(ups, "dg_haul") else 1.0)


static func xp_mult(ups: Array) -> float:
	return (1.2 if _has(ups, "navigators_log") else 1.0) * (1.25 if _has(ups, "dg_xp") else 1.0)


static func boon_luck(ups: Array) -> float:
	return maxf(1.7 if _has(ups, "diviners_charm") else 1.0, 1.8 if _has(ups, "dg_luck") else 1.0)


static func boon_rerolls(ups: Array) -> int:
	return maxi(1 if _has(ups, "second_cast") else 0, 2 if _has(ups, "dg_reroll_boon_2") else (1 if _has(ups, "dg_reroll_boon") else 0))


static func curse_rerolls(ups: Array) -> int:
	return maxi(1 if _has(ups, "salt_ward") else 0, 2 if _has(ups, "dg_reroll_curse_2") else (1 if _has(ups, "dg_reroll_curse") else 0))


static func boon_filters(ups: Array) -> int:
	return 2 if _has(ups, "dg_boon_filter_2") else (1 if _has(ups, "dg_boon_filter") else 0)


static func synergy_mult(ups: Array) -> float:
	return 2.2 if _has(ups, "dg_consigliere") else 1.0


static func skips_first_curse(ups: Array) -> bool:
	return _has(ups, "calm_before") or _has(ups, "dg_calm")


static func sounding_line(ups: Array) -> bool:
	return _has(ups, "sounding_line") or _has(ups, "dg_peek")


static func start_depth(ups: Array) -> int:
	return 5 if _has(ups, "veterans_start") or _has(ups, "dg_veteran") else 1


static func blood_oath(ups: Array) -> bool:
	return _has(ups, "dg_blood_oath")


## claimGauntletUpgrade: a perk from this descent's Locker, bought with the
## shared Fathoms purse (not owned yet, its prerequisite owned in either
## Locker, the descent's deepest past its depth).
static func buy_upgrade(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var u: Dictionary = upgrade_def(id)
	if u.is_empty() or NOT_SOLD.has(id):
		return { "error": "There is no such upgrade." }
	var v: String = str(Js.nz(u.get("gauntlet"), "davy"))
	var col: String = "dons_gauntlet_upgrades" if v == "don" else "gauntlet_upgrades"
	var p: Dictionary = db.me(uid)
	var own: Array = Js.list(p.get(col))
	if own.has(id):
		return { "error": "Already yours." }
	var req: Variant = u.get("requires")
	if req != null and not (Js.list(p.get("gauntlet_upgrades")) + Js.list(p.get("dons_gauntlet_upgrades"))).has(req):
		return { "error": "Needs %s first." % upgrade_def(str(req)).get("name", req) }
	if Js.num(p.get("dons_gauntlet_deepest" if v == "don" else "gauntlet_deepest")) < Js.num(u.get("depthRequired")):
		return { "error": "Reach depth %d first." % int(Js.num(u.get("depthRequired"))) }
	var cost: float = Js.num(u.get("cost"))
	if Js.num(p.get("gauntlet_fathoms")) < cost:
		return { "error": "Not enough Fathoms." }
	db.bump_stat(uid, "gauntlet_fathoms", -cost)
	db.add_to_list(uid, col, id)
	return { "ok": true }


## A Run Upgrade switched off (or on) for the next dives.
static func toggle_upgrade(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var u: Dictionary = upgrade_def(id)
	if str(u.get("scope", "")) != "gauntlet":
		return { "error": "Only Run Upgrades switch off." }
	var v: String = str(Js.nz(u.get("gauntlet"), "davy"))
	var col: String = ("dons_gauntlet_upgrades" if v == "don" else "gauntlet_upgrades") + "_off"
	var off: Array = Js.list(db.me(uid).get(col)).duplicate()
	if off.has(id):
		off.erase(id)
	else:
		off.append(id)
	db.update_profile(uid, { col: off })
	return { "ok": true, "off": off.has(id) }
