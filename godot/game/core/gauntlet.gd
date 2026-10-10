class_name Gauntlet
extends RefCounted
## THE GAUNTLETS' RULES (a port of lib/gauntlet.ts and its siblings:
## gauntletTerms, gauntletMarks, gauntletMerchant, gauntletContracts,
## gauntletOffer, gauntletRules; Kong, 2026-10-03: "build it like how we have
## it but with multiplayer in mind"). The tables are the web's
## (content/rules.json gauntlet, written by web/scripts/export-godot-rules.mts);
## the logic is ported here, every roll through Dice in the web's order, and
## checked against seeded cases (tests/parity/gauntlet.json).
##
## Two descents: DAVY'S GAUNTLET (variant "davy", renamed from Davy Jones'
## Gauntlet, Kong 2026-10-03) on the raids 1 to 4 hands, and DON'S GAUNTLET
## ("don") on raids 5 to 8, Don Finleone rising at the landmark depths.
##
## A DEPTH is one fight. Its REWARD depth is the ships sunk so far plus one;
## its COMBAT depth adds Veteran's Start's head start (skip). The combat depth
## drives the enemy curve, boss and elite odds, the drafts and the curses; the
## reward depth drives the pot, the chest, the XP and the Fathoms.
##
## Everything a run holds is plain Dictionaries and Arrays (it crosses the
## Charter's wire, and the party's table holds one per captain).
##
## Split 2026-10-10 for size: this file keeps the constants, the economy,
## Davy's Offer, the enemy curve, the affixes, the fights and the bands; the
## draft (gauntlet_draft.gd), the Terms, Marks and jobs (gauntlet_terms.gd),
## the Locker (gauntlet_locker.gd) and the port-native co-op packs and bonds
## (gauntlet_packs.gd) live in their own parts, reached through the
## forwarders at the foot of this file so every caller still says Gauntlet.x.

const GauntletDraft = preload("res://core/gauntlet_draft.gd")
const GauntletTerms = preload("res://core/gauntlet_terms.gd")
const GauntletLocker = preload("res://core/gauntlet_locker.gd")
const GauntletPacks = preload("res://core/gauntlet_packs.gd")

const VARIANTS: Array = ["davy", "don"]
## Davy's opens at the second chapter's Captain's Choice (GAUNTLET_UNLOCK_NODE);
## hardcore once a captain has reached this depth on the descent.
const UNLOCK_NODE: String = "chapter_2_class"
const HC_UNLOCK_DEPTH: int = 5
const NAMES: Dictionary = { "davy": "Davy's Gauntlet", "don": "Don's Gauntlet" }

const POT_GROWTH: float = 42.0
const POT_FLATTEN_DEPTH: int = 30
const BOSS_POT_MULT: float = 3.0
const DONS_FATHOM_MULT: float = 2.0
const DONS_XP_MULT: float = 1.2
const DONS_CREW_XP_MULT: float = 1.25
const DONS_POT_MULT: float = 1.5
const DONS_CHEST_GEM_MULT: float = 1.5
const XP_GROWTH: float = 19.0
const XP_FLATTEN_DEPTH: int = 26
const XP_BOSS_FACTOR: float = 1.35
const CREW_XP_PER_DEPTH: float = 150.0
const MAX_DEPTH: int = 100
const REWARD_DEPTH_CAP: int = 70

const DEEP_BEND_START: int = 60
const DEEP_BEND_START_2: int = 48
const DEEP_BEND_RATE: float = 1.03
const BOSS_HP_MULT: float = 2.8
const BOSS_DMG_MULT: float = 1.5
const FIRST_BOSS_EARLIEST: int = 4
const BOSS_CHANCE_BASE: float = 0.08
const BOSS_CHANCE_GROWTH: float = 0.035
const BOSS_CHANCE_CAP: float = 0.35
const BOSS_PITY: int = 9
const ELITE_CHANCE_BASE: float = 0.06
const ELITE_CHANCE_GROWTH: float = 0.05
const ELITE_CHANCE_CAP: float = 0.6
const DUAL_AFFIX_MIN_DEPTH: int = 30
const DUAL_AFFIX_CHANCE: float = 0.3
const TRIPLE_AFFIX_CHANCE: float = 0.25
const EARLY_GRACE_END_2: int = 20
const APEX_HP_MULT: float = 3.6
const CLOSER_MIN_DEPTH: int = 12
const CLOSER_CHANCE: float = 0.05
const MINI_BOSS_HP_MULT: float = 1.8
const PHASE2_BOSS_MIN_DEPTH: int = 20

const CURSE_DEPTHS: Array = [4, 7, 10, 13, 16, 19]
const CURSE_INTERVAL: int = 3
const CURSE_TIER2_DEPTH: int = 13
const REPRIEVE_MIN_DEPTH: int = 6
const REPRIEVE_CHANCE: float = 0.55
const CONFLUENCE_OFFER_CHANCE: float = 0.7
const CONVERGENCE_OFFER_CHANCE: float = 0.85
const SHRINE_FIRST: int = 8
const SHRINE_INTERVAL: int = 7
const MERCHANT_FIRST: int = 11
const MERCHANT_INTERVAL: int = 9
const SHRINE_WAGER_CAP: int = 10
const CONTRACT_OFFER_CHANCE: float = 1.0 / 7.5
const CONTRACT_MIN_DEPTH: int = 4
const CONTRACT_KINDS: Array = ["fast", "deadeye", "no_crew", "fire_only", "volley_only", "ultimate_only", "no_dodge", "untouched"]
const MARK_ROLL_MIN: int = 5
const MARK_ROLL_MAX: int = 10
const MARK_BUFFS_PER: int = 3
const OFFER_MIN_DEPTH: int = 30
const OFFER_MIN_HP_PCT: float = 0.5
const OFFER_COOLDOWN: int = 8
const OFFER_CHANCE: float = 0.10
const OFFER_MAX_TIER: int = 3
const CHEST_ODDS_CAP: float = 0.25
const PRESSURE_GEM_RATE: float = 0.075
const PRESSURE_CAP: float = 40.0
const PRESSURE_DEPTH_FLOOR: float = 20.0
const PRESSURE_DEPTH_FULL: float = 30.0
const PRESSURE_SKIN_THRESHOLD: float = 25.0
const BLOOD_GEM_MIN_PER_DEPTH: float = 0.5
const BLOOD_GEM_MAX_PER_DEPTH: float = 0.7
const DON_RISE_DEPTHS: Array = [20, 42, 60, 85]

const GOLD_HULL: String = "golden_gauntlet_hull"
const BLOOD_HULL: String = "bad_blood_hull"
const GALAXY_HULL: String = "galaxy_hull"
const GHOST_HULL: String = "dons_ghost_hull"
const PRESSURE_SKIN: String = "pitch_black_hull"
const GHOST_HULL_DROP_MULT: float = 0.5
const DAVY_CANNONS: Array = ["davys_heavy_cannon", "davys_hand_cannon"]
const DON_ITEMS: Array = ["opening_statement", "made_man", "the_shakedown"]
const BLOOD_CANNON: String = "davys_blood_cannon"
## THE HARDCORE GAUNTLET'S FINDS, NOW RARE IN EVERY DIVE (Kong, 2026-10-06:
## "they're really rare drops from normal gauntlet"; the hardcore gauntlet was
## cut, which had left them, and three forge recipes, out of reach): the Blood
## Cannon (Davy's, from the third chest) and Don's Palisade (the Don's, from
## the third) at a fifth of the gear chance; the Bad Blood Hull (Davy's, from
## the fourth) at a fifth of the hull chance, the Pitch Black Hull (Davy's,
## from the fifth) at a tenth. The port only; the web's hardcore rolls stand.
const RARE_FIND: float = 0.2
const DROP_NAMES: Dictionary = {
	"davys_heavy_cannon": "Davy's Heavy Cannon", "davys_hand_cannon": "Davy's Hand Cannon", "davys_blood_cannon": "Davy's Blood Cannon",
	"opening_statement": "Vanguard Battery", "made_man": "Dampener Plate", "the_shakedown": "Carrion Sight", "dons_palisade": "Don's Palisade",
	"golden_gauntlet_hull": "Golden Gauntlet Hull", "bad_blood_hull": "Bad Blood Hull", "galaxy_hull": "Galaxy Hull",
	"dons_ghost_hull": "Don's Ghost Hull", "pitch_black_hull": "Pitch Black Hull",
}
const DONS_CHEST_LABELS: Dictionary = { 1: "Skimmed Purse", 2: "Kickback Crate", 3: "Laundered Hoard", 4: "The Ledger Vault", 5: "Finleone's Vault" }


static func t() -> Dictionary:
	return Js.obj(Rules.data().get("gauntlet"))


static func in_pool(tag: Variant, variant: String) -> bool:
	return tag == null or str(tag) == "both" or str(tag) == variant


# ══ The economy ═══════════════════════════════════════════════════════════════

static func round_contribution(depth: int, boss: bool, variant: String = "davy") -> float:
	var base: float = POT_GROWTH * mini(depth, POT_FLATTEN_DEPTH)
	return float(Js.round(base * (BOSS_POT_MULT if boss else 1.0) * (DONS_POT_MULT if variant == "don" else 1.0)))


static func xp_for_depth(depth: int, variant: String = "davy") -> float:
	var total: float = 0.0
	for d: int in range(1, maxi(0, depth) + 1):
		total += XP_GROWTH * mini(d, XP_FLATTEN_DEPTH)
	return float(Js.round(total * XP_BOSS_FACTOR * (DONS_XP_MULT if variant == "don" else 1.0)))


static func crew_xp(depth: int, variant: String = "davy") -> float:
	return float(Js.round(maxi(0, depth) * CREW_XP_PER_DEPTH * (DONS_CREW_XP_MULT if variant == "don" else 1.0)))


static func max_pot(depth: int, variant: String = "davy") -> float:
	var total: float = 0.0
	for d: int in range(1, depth + 1):
		total += round_contribution(d, true, variant)
	return total


static func fathoms_for_depth(depth: int, variant: String = "davy") -> float:
	var base: float = float(maxi(0, depth))
	return base * DONS_FATHOM_MULT if variant == "don" else base


static func chest_for_depth(depth: int) -> Dictionary:
	var chests: Array = Js.list(t().get("chests"))
	var chest: Dictionary = chests[0]
	for c: Dictionary in chests:
		if depth >= int(c["minDepth"]):
			chest = c
	return chest


static func chest_label(chest: Dictionary, variant: String, hardcore: bool = false) -> String:
	if hardcore:
		return "The Bone Vault" if variant == "don" else "The Blood Coffer"
	return str(DONS_CHEST_LABELS.get(int(chest["tier"]), chest["label"])) if variant == "don" else str(chest["label"])


static func cannon_drop_chance(depth: int) -> float:
	return minf(0.10, maxf(0.01, 0.03 + (depth - 20) * (0.07 / 30.0)))


static func skin_drop_chance(depth: int) -> float:
	return minf(0.10, maxf(0.005, 0.02 + (depth - 20) * (0.08 / 30.0)))


static func blood_gems_for_depth(depth: int, rand: float) -> float:
	var tt: float = clampf((depth - 20) / 40.0, 0.0, 1.0)
	var lo: float = BLOOD_GEM_MIN_PER_DEPTH + (0.95 - BLOOD_GEM_MIN_PER_DEPTH) * tt
	var hi: float = BLOOD_GEM_MAX_PER_DEPTH + (1.0 - BLOOD_GEM_MAX_PER_DEPTH) * tt
	return float(Js.round(depth * (lo + (hi - lo) * rand)))


static func pressure_depth_factor(depth: int) -> float:
	return clampf((depth - PRESSURE_DEPTH_FLOOR) / (PRESSURE_DEPTH_FULL - PRESSURE_DEPTH_FLOOR), 0.0, 1.0)


static func pressure_gem_mult(pressure: float, depth: int) -> float:
	if pressure <= 0.0:
		return 1.0
	return 1.0 + minf(pressure, PRESSURE_CAP) * PRESSURE_GEM_RATE * pressure_depth_factor(depth)


static func pressure_skin_chance(pressure: float, depth: int) -> float:
	if pressure < PRESSURE_SKIN_THRESHOLD or depth < int(PRESSURE_DEPTH_FULL):
		return 0.0
	var tt: float = minf(1.0, (pressure - PRESSURE_SKIN_THRESHOLD) / (PRESSURE_CAP - PRESSURE_SKIN_THRESHOLD))
	return 0.03 + (0.12 - 0.03) * tt


## Everything a chest banked at this depth could still pay this captain, and
## how likely (chestOdds). The cash-out rolls against these same numbers.
static func chest_odds(depth: int, variant: String, hardcore: bool, pressure: float, owned_items: Array, owned_skins: Array, odds_mult: float = 1.0, fortune_mult: float = 1.0, combat_depth: int = -1) -> Array:
	var pay: int = mini(depth, REWARD_DEPTH_CAP)
	var tier: int = int(chest_for_depth(pay)["tier"])
	var m: Callable = func(c: float) -> float: return minf(CHEST_ODDS_CAP, c * odds_mult * fortune_mult)
	# The port's breather passes the combat depth, as the haul rolls on it.
	var cd: int = combat_depth if combat_depth >= 0 else pay
	var cannon: float = m.call(cannon_drop_chance(cd))
	var skin: float = m.call(skin_drop_chance(cd))
	var out: Array = []
	if variant == "don":
		for id: String in DON_ITEMS:
			if not owned_items.has(id):
				out.append({ "id": id, "name": DROP_NAMES[id], "kind": "item", "chance": cannon })
		if tier >= 5 and not owned_skins.has(GALAXY_HULL):
			out.append({ "id": GALAXY_HULL, "name": DROP_NAMES[GALAXY_HULL], "kind": "skin", "chance": skin })
		if tier >= 4 and not owned_skins.has(GHOST_HULL):
			out.append({ "id": GHOST_HULL, "name": DROP_NAMES[GHOST_HULL], "kind": "skin", "chance": m.call(skin_drop_chance(pay) * GHOST_HULL_DROP_MULT) })
		if hardcore and tier >= 3 and not owned_items.has("dons_palisade"):
			out.append({ "id": "dons_palisade", "name": DROP_NAMES["dons_palisade"], "kind": "item", "chance": cannon })
		if not hardcore and not Rules.web_only and tier >= 3:
			out.append({ "id": "dons_palisade", "name": DROP_NAMES["dons_palisade"], "kind": "item", "chance": m.call(cannon_drop_chance(cd) * RARE_FIND) })
		return out
	for id: String in DAVY_CANNONS:
		if not owned_items.has(id):
			out.append({ "id": id, "name": DROP_NAMES[id], "kind": "item", "chance": cannon })
	if hardcore and tier >= 3 and not owned_items.has(BLOOD_CANNON):
		out.append({ "id": BLOOD_CANNON, "name": DROP_NAMES[BLOOD_CANNON], "kind": "item", "chance": cannon })
	if not owned_skins.has(GOLD_HULL):
		if tier >= 5:
			out.append({ "id": GOLD_HULL, "name": DROP_NAMES[GOLD_HULL], "kind": "skin", "chance": skin })
		else:
			out.append({ "id": GOLD_HULL, "name": DROP_NAMES[GOLD_HULL], "kind": "skin", "chance": 0.0, "lockedUntilDepth": float(Js.list(t()["chests"])[4]["minDepth"]) })
	if hardcore and tier >= 4 and not owned_skins.has(BLOOD_HULL):
		out.append({ "id": BLOOD_HULL, "name": DROP_NAMES[BLOOD_HULL], "kind": "skin", "chance": skin })
	if hardcore and not owned_skins.has(PRESSURE_SKIN):
		var c: float = pressure_skin_chance(pressure, pay)
		if c > 0.0:
			out.append({ "id": PRESSURE_SKIN, "name": DROP_NAMES[PRESSURE_SKIN], "kind": "skin", "chance": m.call(c) })
	# The rare finds (RARE_FIND), in every dive of the port.
	if not hardcore and not Rules.web_only:
		if tier >= 3:
			out.append({ "id": BLOOD_CANNON, "name": DROP_NAMES[BLOOD_CANNON], "kind": "item", "chance": m.call(cannon_drop_chance(cd) * RARE_FIND) })
		if tier >= 4 and not owned_skins.has(BLOOD_HULL):
			out.append({ "id": BLOOD_HULL, "name": DROP_NAMES[BLOOD_HULL], "kind": "skin", "chance": m.call(skin_drop_chance(cd) * RARE_FIND) })
		if tier >= 5 and not owned_skins.has(PRESSURE_SKIN):
			out.append({ "id": PRESSURE_SKIN, "name": DROP_NAMES[PRESSURE_SKIN], "kind": "skin", "chance": m.call(skin_drop_chance(cd) * RARE_FIND * 0.5) })
	return out


## The bank at a cash-out (cashOutHaul): the pot through the chest, the XP,
## the gems, the Fathoms, and the chest's chase drops rolled in the web's
## order on the combat depth (gear always rolls, a captain may hold copies; a
## hull only while unowned). rd: the reward depth, cd: the combat depth.
## mults: { shipClass, renown, haul (Locker), xp (Locker), fathoms (Locker),
## crewXp (renown), bloodGem (Crimson Tithe), fortune (1..2) }.
static func haul(rd: int, cd: int, variant: String, pot: float, hardcore: bool, pressure: float, owned_skins: Array, mults: Dictionary, offer: Dictionary = {}, fence_spent: float = 0.0) -> Dictionary:
	var don: bool = variant == "don"
	var pay: int = mini(rd, REWARD_DEPTH_CAP)
	var clean: float = maxf(0.0, minf(floor(pot), max_pot(pay, variant)))
	var chest: Dictionary = chest_for_depth(pay)
	var tier: int = int(chest["tier"])
	var odds: float = offer_chest_mult(offer) * float(Js.nz(mults.get("fortune"), 1.0))
	var drop: Callable = func(c: float) -> float: return minf(CHEST_ODDS_CAP, c * odds)
	var items: Array = []
	var skins: Array = []
	for id: String in (DON_ITEMS if don else DAVY_CANNONS):
		if Dice.next() < float(drop.call(cannon_drop_chance(cd))):
			items.append(id)
	if not don and hardcore and tier >= 3 and Dice.next() < float(drop.call(cannon_drop_chance(cd))):
		items.append(BLOOD_CANNON)
	var rare: bool = not hardcore and not Rules.web_only
	if rare and tier >= 3 and Dice.next() < float(drop.call(cannon_drop_chance(cd) * RARE_FIND)):
		items.append("dons_palisade" if don else BLOOD_CANNON)
	var main: String = GALAXY_HULL if don else GOLD_HULL
	if tier >= 5 and not owned_skins.has(main) and Dice.next() < float(drop.call(skin_drop_chance(cd))):
		skins.append(main)
	var second: String = GHOST_HULL if don else BLOOD_HULL
	if (don or hardcore) and tier >= 4 and not owned_skins.has(second) and Dice.next() < float(drop.call(skin_drop_chance(cd) * (GHOST_HULL_DROP_MULT if don else 1.0))):
		skins.append(second)
	if not don and hardcore and not owned_skins.has(PRESSURE_SKIN) and Dice.next() < float(drop.call(pressure_skin_chance(pressure if hardcore else 0.0, pay))):
		skins.append(PRESSURE_SKIN)
	if rare and not don:
		if tier >= 4 and not owned_skins.has(BLOOD_HULL) and Dice.next() < float(drop.call(skin_drop_chance(cd) * RARE_FIND)):
			skins.append(BLOOD_HULL)
		if tier >= 5 and not owned_skins.has(PRESSURE_SKIN) and Dice.next() < float(drop.call(skin_drop_chance(cd) * RARE_FIND * 0.5)):
			skins.append(PRESSURE_SKIN)
	var gem_mult: float = pressure_gem_mult(pressure if hardcore else 0.0, pay)
	var base_blood: float = blood_gems_for_depth(pay, Dice.next()) if hardcore else 0.0
	return {
		"depth": float(rd), "payDepth": float(pay), "chest": chest, "chestLabel": chest_label(chest, variant, hardcore),
		"doubloons": float(Js.round(clean * float(chest["potMult"]) * float(Js.nz(mults.get("shipClass"), 1.0)) * float(Js.nz(mults.get("renown"), 1.0)) * float(Js.nz(mults.get("haul"), 1.0)) * offer_coin_mult(offer))),
		"navXp": float(Js.round(xp_for_depth(pay, variant) * float(Js.nz(mults.get("xp"), 1.0)))),
		"gems": float(Js.round(float(chest["gems"]) * (DONS_CHEST_GEM_MULT if don else 1.0))),
		"fathoms": run_fathoms(rd, variant, float(Js.nz(mults.get("fathoms"), 1.0)), offer, fence_spent),
		"crewXp": float(Js.round(crew_xp(pay, variant) * float(Js.nz(mults.get("crewXp"), 1.0)))),
		"bloodGems": float(Js.round(base_blood * gem_mult * float(Js.nz(mults.get("bloodGem"), 1.0)))),
		"items": items, "skins": skins,
	}


static func run_fathoms(rd: int, variant: String, locker_mult: float, offer: Dictionary = {}, fence_spent: float = 0.0) -> float:
	return maxf(0.0, float(Js.round(fathoms_for_depth(rd, variant) * locker_mult * offer_fathom_mult(offer))) - fence_spent)


# ── Davy's Offer (gauntletOffer) ──────────────────────────────────────────────

static func offer_coin_mult(o: Dictionary) -> float:
	return 1.0 + [0.25, 0.40, 0.60][int(o["tier"]) - 1] if str(o.get("kind", "")) == "coin" else 1.0


static func offer_fathom_mult(o: Dictionary) -> float:
	return 1.0 + [0.30, 0.50, 0.75][int(o["tier"]) - 1] if str(o.get("kind", "")) == "fathoms" else 1.0


static func offer_chest_mult(o: Dictionary) -> float:
	return [1.5, 2.0, 2.5][int(o["tier"]) - 1] if str(o.get("kind", "")) == "chest" else 1.0


## One roll per breather (rollOffer): a bargain on cashing out here, its
## tier climbing with each one dived past. st: { live, refused, lastAt, rolledAt }.
static func roll_offer(st: Dictionary, depth: int, hp_pct: float, chest_live: bool, blocked: bool = false) -> Dictionary:
	var prev: Dictionary = st if not st.is_empty() else { "live": null, "refused": 0.0, "lastAt": 0.0 }
	if prev.has("rolledAt") and int(Js.num(prev["rolledAt"])) == depth:
		return prev
	var refused: float = Js.num(prev.get("refused"))
	if prev.get("live") != null and int(Js.obj(prev["live"]).get("depth", 0)) < depth:
		refused += 1.0
	var base: Dictionary = { "live": null, "refused": refused, "lastAt": Js.num(prev.get("lastAt")), "rolledAt": float(depth) }
	if blocked or depth < OFFER_MIN_DEPTH or hp_pct < OFFER_MIN_HP_PCT or depth - int(Js.num(prev.get("lastAt"))) < OFFER_COOLDOWN:
		return base
	if Dice.next() >= OFFER_CHANCE:
		return base
	var kinds: Array = ["coin", "fathoms", "chest"] if chest_live else ["coin", "fathoms"]
	var kind: String = kinds[int(floor(Dice.next() * kinds.size()))]
	return { "live": { "kind": kind, "tier": float(clampi(1 + int(refused), 1, OFFER_MAX_TIER)), "depth": float(depth) }, "refused": refused, "lastAt": float(depth), "rolledAt": float(depth) }


static func offer_copy(o: Dictionary) -> Dictionary:
	var tier: int = clampi(int(o["tier"]), 1, OFFER_MAX_TIER)
	var badge: String = ["Davy makes an offer", "Davy makes a better offer", "Davy is done asking nicely"][tier - 1]
	match str(o["kind"]):
		"coin":
			return { "title": "A Purse for Your Trouble", "badge": badge, "line": "Bank right here and the haul comes up %d%% heavier." % [25, 40, 60][tier - 1] }
		"fathoms":
			return { "title": "Wages for the Deep", "badge": badge, "line": "Bank right here and the Fathoms pay out %d%% richer." % [30, 50, 75][tier - 1] }
	return { "title": "A Heavier Chest", "badge": badge, "line": "Bank right here and every drop in the chest is %sx likelier." % ["1.5", "2", "2.5"][tier - 1] }


# ══ The enemy curve ═══════════════════════════════════════════════════════════

static func deep_bend(d: int, start: int) -> float:
	return pow(DEEP_BEND_RATE, d - start) if d > start else 1.0


static func _grace(d: int, lo: float) -> float:
	if d >= EARLY_GRACE_END_2:
		return 1.0
	# The web writes each span as its own literal (0.70 + 0.30 x), not 1 - lo.
	var span: float = 0.30 if lo == 0.70 else 0.20
	return lo + span * ((d - 1) / float(EARLY_GRACE_END_2 - 1))


static func mob_hp(d: int, variant: String) -> float:
	if variant == "don":
		return float(Js.round((170.0 + d * 33.0) * deep_bend(d, DEEP_BEND_START_2) * _grace(d, 0.70)))
	return float(Js.round((34.0 + d * 10.0) * deep_bend(d, DEEP_BEND_START)))


static func mob_min(d: int, variant: String) -> float:
	if variant == "don":
		return float(Js.round((16.0 + d * 2.0) * deep_bend(d, DEEP_BEND_START_2) * _grace(d, 0.80)))
	return float(Js.round((5.0 + d * 0.9) * deep_bend(d, DEEP_BEND_START)))


static func mob_max(d: int, variant: String) -> float:
	if variant == "don":
		return float(Js.round((24.0 + d * 3.2) * deep_bend(d, DEEP_BEND_START_2) * _grace(d, 0.80)))
	return float(Js.round((9.0 + d * 1.7) * deep_bend(d, DEEP_BEND_START)))


static func _accuracy(d: int, extra: float, src: Dictionary) -> float:
	return float(Js.round(18.0 + d * 1.4)) + extra + float(src["shipSpeed"])


static func drowned_name(n: String) -> String:
	if n.contains("Drowned"):
		return n
	return "The Drowned " + n.substr(4) if n.begins_with("The ") else "Drowned " + n


static func ghost_name(n: String) -> String:
	if n.contains("Spectral"):
		return n
	return "The Spectral " + n.substr(4) if n.begins_with("The ") else "Spectral " + n


## A hand from its raid, as the port fights it (Battle.enemy_def: the port's
## own changes to the early hands ride along).
static func hand(pair: Array) -> Dictionary:
	var e: Dictionary = Battle.enemy_def(Battle.raid_def(str(pair[0])), pair[1])
	e["raidId"] = str(pair[0])
	e["key"] = str(pair[1])
	return e


## scaleToCurve: the depth's HP, damage and aim on a hand that keeps its own
## pattern, art and kit, renamed for the deep it was raised from.
static func scale_to_curve(src: Dictionary, d: int, boss: bool, variant: String) -> Dictionary:
	var don: bool = variant == "don"
	var hp: float = mob_hp(d, variant)
	var lo: float = float(Js.round(mob_min(d, variant) * (BOSS_DMG_MULT if boss else 1.0)))
	var hi: float = float(Js.round(mob_max(d, variant) * (BOSS_DMG_MULT if boss else 1.0)))
	var out: Dictionary = src.duplicate(true)
	out["name"] = ghost_name(str(src["name"])) if don else drowned_name(str(src["name"]))
	out["hpBase"] = float(Js.round(hp * BOSS_HP_MULT)) if boss else hp
	out["minDmg"] = maxf(1.0, lo)
	out["maxDmg"] = maxf(maxf(1.0, lo) + 1.0, hi)
	out["accuracy"] = _accuracy(d, 3.0 if boss else 0.0, src)
	if don:
		var ag: float = _grace(d, 0.70)
		if ag < 1.0:
			if Js.num(out.get("aimFogDensity")) != 0.0:
				out["aimFogDensity"] = float(out["aimFogDensity"]) * ag
			if Js.num(out.get("aimSpeedMult")) > 1.0:
				out["aimSpeedMult"] = 1.0 + (float(out["aimSpeedMult"]) - 1.0) * ag
			if Js.num(out.get("zoneSpeedMult")) > 1.0:
				out["zoneSpeedMult"] = 1.0 + (float(out["zoneSpeedMult"]) - 1.0) * ag
	if boss:
		if don:
			var revives: int = 0 if d < 15 else (1 if d < 30 else 2)
			var ph: Array = Js.list(out.get("phases"))
			if not ph.is_empty():
				if revives > 0:
					out["phases"] = ph.slice(0, revives).map(func(p: Dictionary) -> Dictionary:
						var q: Dictionary = p.duplicate(true)
						q.erase("check")
						return q)
				else:
					out.erase("phases")
			if out.get("phase2") != null:
				if revives > 0:
					out["phase2"] = Js.obj(out["phase2"]).duplicate(true)
					out["phase2"].erase("check")
				else:
					out.erase("phase2")
			out.erase("openingCheck")
		elif d <= PHASE2_BOSS_MIN_DEPTH:
			out.erase("phase2")
	return out


static func _soften(check: Variant, max_pct: float) -> Variant:
	if check == null:
		return null
	var c: Dictionary = Js.obj(check).duplicate(true)
	var cons: Dictionary = Js.obj(c.get("consequence"))
	if str(cons.get("kind", "")) == "damagePctMaxHp" and float(cons.get("value", 0.0)) > max_pct:
		cons["value"] = max_pct
		c["consequence"] = cons
	return c


## A Don Finleone rise: the Throne's boss on the curve, his phases climbing
## with each rise, only the opener and the finale keeping their checks.
static func don_apex(d: int) -> Dictionary:
	var src: Dictionary = hand(Js.list(t()["pools"]["apex"]))
	var out: Dictionary = src.duplicate(true)
	var lo: float = float(Js.round(mob_min(d, "don") * BOSS_DMG_MULT))
	var hi: float = float(Js.round(mob_max(d, "don") * BOSS_DMG_MULT))
	var idx: int = maxi(0, DON_RISE_DEPTHS.find(d))
	var src_ph: Array = Js.list(src.get("phases"))
	var n: int = mini(src_ph.size(), 2 + idx)
	var ph: Array = []
	for i: int in n:
		var q: Dictionary = Js.obj(src_ph[i]).duplicate(true)
		if i == n - 1 and q.get("check") != null:
			q["check"] = _soften(q["check"], 0.5)
		else:
			q.erase("check")
		ph.append(q)
	out["name"] = "Don Finleone"
	out["hpBase"] = float(Js.round(mob_hp(d, "don") * APEX_HP_MULT))
	out["minDmg"] = maxf(1.0, lo)
	out["maxDmg"] = maxf(maxf(1.0, lo) + 1.0, hi)
	out["accuracy"] = _accuracy(d, 3.0, src)
	if src.get("openingCheck") != null:
		out["openingCheck"] = _soften(src["openingCheck"], 0.45)
	if ph.is_empty():
		out.erase("phases")
	else:
		out["phases"] = ph
	out.erase("phase2")
	return out


## The Closer: the Don's right hand, a mob's pot with one revive.
static func closer(d: int) -> Dictionary:
	var src: Dictionary = hand(Js.list(t()["pools"]["closer"]))
	var out: Dictionary = src.duplicate(true)
	var lo: float = float(Js.round(mob_min(d, "don") * 1.25))
	var hi: float = float(Js.round(mob_max(d, "don") * 1.25))
	out["name"] = ghost_name(str(src["name"]))
	out["hpBase"] = float(Js.round(mob_hp(d, "don") * MINI_BOSS_HP_MULT))
	out["minDmg"] = maxf(1.0, lo)
	out["maxDmg"] = maxf(maxf(1.0, lo) + 1.0, hi)
	out["accuracy"] = _accuracy(d, 2.0, src)
	if src.get("phase2") != null:
		out["phase2"] = Js.obj(src["phase2"]).duplicate(true)
		out["phase2"].erase("check")
	out.erase("phases")
	out.erase("openingCheck")
	return out


# ── Affixes (raidAffixes) ─────────────────────────────────────────────────────

static func _affix_ids() -> Array:
	return Js.list(Js.obj(Rules.data().get("raidAffixes")).get("all"))


static func roll_affix() -> String:
	var all: Array = _affix_ids()
	return str(all[int(floor(Dice.next() * all.size()))])


static func roll_second_affix(first: String) -> String:
	var id: String = roll_affix()
	var guard: int = 0
	while id == first and guard < 8:
		id = roll_affix()
		guard += 1
	return id


static func affix(id: String) -> Dictionary:
	return Js.obj(Js.obj(Js.obj(Rules.data().get("raidAffixes")).get("affixes")).get(id)).duplicate(true)


static func merge_affixes(a: Dictionary, b: Dictionary) -> Dictionary:
	var out: Dictionary = a.duplicate(true)
	out.merge(b, true)
	out["id"] = a.get("id")
	out["name"] = "%s + %s" % [a.get("name", ""), b.get("name", "")]
	out["description"] = "%s %s" % [a.get("description", ""), b.get("description", "")]
	return out


# ══ The fights ════════════════════════════════════════════════════════════════

## Rolls: { cleared, prevWasBoss, roundsSinceBoss }.
static func new_roll() -> Dictionary:
	return { "cleared": 0.0, "prevWasBoss": false, "roundsSinceBoss": 0.0 }


## generateFight: the next depth's enemy, in the web's exact roll order.
static func generate_fight(st: Dictionary, skip: int, terms: Dictionary, variant: String) -> Dictionary:
	var tm: Dictionary = terms if not terms.is_empty() else no_terms()
	var reward_d: int = int(st["cleared"]) + 1
	var d: int = reward_d + skip
	var boss: bool = false
	if d >= FIRST_BOSS_EARLIEST and not st["prevWasBoss"]:
		if int(st["roundsSinceBoss"]) >= BOSS_PITY:
			boss = true
		else:
			boss = Dice.next() < minf(BOSS_CHANCE_CAP, BOSS_CHANCE_BASE + (d - FIRST_BOSS_EARLIEST) * BOSS_CHANCE_GROWTH)
	var paying: bool = reward_d <= REWARD_DEPTH_CAP
	var pools: Dictionary = t()["pools"]
	if variant == "don" and DON_RISE_DEPTHS.has(d):
		return _fight(don_apex(d), true, false, {}, round_contribution(reward_d, true, variant) if paying else 0.0, d, true)
	if variant == "don" and not boss and d >= CLOSER_MIN_DEPTH and not st["prevWasBoss"] and Dice.next() < CLOSER_CHANCE:
		var f: Dictionary = _fight(closer(d), false, false, {}, round_contribution(reward_d, false, variant) if paying else 0.0, d)
		f["closer"] = true
		return f
	if boss:
		var bp: Array = Js.list(pools["donBosses" if variant == "don" else "davyBosses"])
		var e: Dictionary = scale_to_curve(hand(bp[int(floor(Dice.next() * bp.size()))]), d, true, variant)
		if float(tm["bossHpMult"]) != 1.0 or float(tm["bossDmgMult"]) != 1.0:
			e["hpBase"] = float(Js.round(float(e["hpBase"]) * float(tm["bossHpMult"])))
			e["minDmg"] = maxf(1.0, float(Js.round(float(e["minDmg"]) * float(tm["bossDmgMult"]))))
			e["maxDmg"] = maxf(2.0, float(Js.round(float(e["maxDmg"]) * float(tm["bossDmgMult"]))))
		var ba: Dictionary = {}
		if int(tm["bossAffixCount"]) > 0:
			var first: String = roll_affix()
			ba = affix(first)
			if int(tm["bossAffixCount"]) > 1:
				ba = merge_affixes(ba, affix(roll_second_affix(first)))
		return _fight(e, true, false, ba, round_contribution(reward_d, true, variant) if paying else 0.0, d)
	var mp: Array = Js.list(pools["donMobs" if variant == "don" else "davyMobs"])
	var en: Dictionary = scale_to_curve(hand(mp[int(floor(Dice.next() * mp.size()))]), d, false, variant)
	var r: Dictionary = _elite_roll(en, d, tm)
	return _fight(r["enemy"], false, r["elite"], r["affix"], round_contribution(reward_d, false, variant) if paying else 0.0, d)


## The elite roll on a mob (shared with a party's escorts).
static func _elite_roll(en: Dictionary, d: int, tm: Dictionary) -> Dictionary:
	var elite: bool = false
	var af: Dictionary = {}
	var chance: float = minf(minf(0.95, ELITE_CHANCE_CAP * float(tm["eliteChanceMult"])), (ELITE_CHANCE_BASE + d * ELITE_CHANCE_GROWTH) * float(tm["eliteChanceMult"]))
	if Dice.next() < chance:
		elite = true
		var first: String = roll_affix()
		af = affix(first)
		var pairs: bool = d > DEEP_BEND_START or tm["affixPairFromStart"] or (d >= DUAL_AFFIX_MIN_DEPTH and Dice.next() < DUAL_AFFIX_CHANCE)
		if pairs:
			var second: String = roll_second_affix(first)
			af = merge_affixes(af, affix(second))
			var triple: float = maxf(TRIPLE_AFFIX_CHANCE if d > DEEP_BEND_START else 0.0, float(tm["tripleAffixChance"]))
			if triple > 0.0 and Dice.next() < triple:
				var pool: Array = _affix_ids().filter(func(id: Variant) -> bool: return id != first and id != second)
				af = merge_affixes(af, affix(str(pool[int(floor(Dice.next() * pool.size()))])))
		var ra: Dictionary = Js.obj(Rules.data().get("raidAffixes"))
		en["hpBase"] = float(Js.round(float(en["hpBase"]) * float(ra["eliteHp"]) * float(tm["eliteHpMult"])))
		en["minDmg"] = maxf(1.0, float(Js.round(float(en["minDmg"]) * float(ra["eliteDmg"]) * float(tm["eliteDmgMult"]))))
		en["maxDmg"] = maxf(2.0, float(Js.round(float(en["maxDmg"]) * float(ra["eliteDmg"]) * float(tm["eliteDmgMult"]))))
	return { "enemy": en, "elite": elite, "affix": af }


static func _fight(e: Dictionary, boss: bool, elite: bool, af: Dictionary, pot: float, d: int, apex: bool = false) -> Dictionary:
	return { "enemy": e, "isBoss": boss, "isElite": elite, "isApex": apex, "affix": af, "pot": pot, "depth": float(d) }


static func advance_roll(st: Dictionary, fight: Dictionary) -> Dictionary:
	return {
		"cleared": float(st["cleared"]) + 1.0, "prevWasBoss": fight["isBoss"],
		"roundsSinceBoss": 0.0 if fight["isBoss"] else float(st["roundsSinceBoss"]) + 1.0,
	}


# ══ Bands and voices ══════════════════════════════════════════════════════════

static func band(d: int, variant: String) -> Dictionary:
	var bands: Array = Js.list(Js.obj(t().get("bands")).get(variant))
	var b: Dictionary = bands[0]
	for x: Dictionary in bands:
		if d >= int(x["minDepth"]):
			b = x
	return b


static func taunt(d: int, variant: String) -> String:
	return str(Js.nz(Js.obj(Js.obj(t().get("taunts")).get(variant)).get(str(d)), ""))


static func don_rise(d: int) -> Dictionary:
	for r: Dictionary in Js.list(t().get("donRise")):
		if int(r["depth"]) == d:
			return r
	return {}


static func tier_label(tier: int) -> String:
	return ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"][clampi(tier, 0, 15)]


# ══ The parts, forwarded (one line each; the doc comments live in the parts) ═

# ── Co-op packs and bonds (core/gauntlet_packs.gd, port-native) ───────────────

static func escorts(fight: Dictionary, n: int, terms: Dictionary, variant: String) -> Array:
	return GauntletPacks.escorts(fight, n, terms, variant)


static func combo_def(id: String) -> Dictionary:
	return GauntletPacks.combo_def(id)


static func party_cfg() -> Dictionary:
	return GauntletPacks.party_cfg()


static func coop_cfg() -> Dictionary:
	return GauntletPacks.coop_cfg()


static func bonds() -> Array:
	return GauntletPacks.bonds()


static func draw_bond(lowest: Dictionary, banned: Array) -> Dictionary:
	return GauntletPacks.draw_bond(lowest, banned)


# ── The draft: curses, boons, confluences, convergences, reprieves (core/gauntlet_draft.gd) ───

static func curse_def(id: String) -> Dictionary:
	return GauntletDraft.curse_def(id)


static func is_curse_depth(d: int, freq: float = 1.0) -> bool:
	return GauntletDraft.is_curse_depth(d, freq)


static func draw_curse(held: Dictionary, d: int, worst: bool, variant: String) -> Dictionary:
	return GauntletDraft.draw_curse(held, d, worst, variant)


static func curse_effects(held: Dictionary) -> Array:
	return GauntletDraft.curse_effects(held)


static func curse_hp_drain(held: Dictionary) -> float:
	return GauntletDraft.curse_hp_drain(held)


static func curse_silence(held: Dictionary) -> int:
	return GauntletDraft.curse_silence(held)


static func boon_def(id: String) -> Dictionary:
	return GauntletDraft.boon_def(id)


static func confluences() -> Array:
	return GauntletDraft.confluences()


static func rarity(b: Dictionary) -> String:
	return GauntletDraft.rarity(b)


static func is_boon_depth(d: int, freq: float = 1.0) -> bool:
	return GauntletDraft.is_boon_depth(d, freq)


static func draw_boons(n: int, owned: Dictionary, luck: float, skew: float, variant: String, banned: Array = []) -> Array:
	return GauntletDraft.draw_boons(n, owned, luck, skew, variant, banned)


static func boon_offer(b: Dictionary, tier: int) -> Dictionary:
	return GauntletDraft.boon_offer(b, tier)


static func blood_oath_boon(variant: String) -> String:
	return GauntletDraft.blood_oath_boon(variant)


static func boon_effects(owned: Dictionary) -> Array:
	return GauntletDraft.boon_effects(owned)


static func hp_boon_mult(effects: Array, d: int, kills: int) -> float:
	return GauntletDraft.hp_boon_mult(effects, d, kills)


static func confluence_def(id: String) -> Dictionary:
	return GauntletDraft.confluence_def(id)


static func convergence_def(id: String) -> Dictionary:
	return GauntletDraft.convergence_def(id)


static func confluence_level(c: Dictionary, owned: Dictionary) -> int:
	return GauntletDraft.confluence_level(c, owned)


static func confluence_hints(offer_id: String, offer_tier: int, owned: Dictionary, taken: Array) -> Array:
	return GauntletDraft.confluence_hints(offer_id, offer_tier, owned, taken)


static func draw_confluence(owned: Dictionary, taken: Array, offered: Array, mult: float, variant: String) -> Dictionary:
	return GauntletDraft.draw_confluence(owned, taken, offered, mult, variant)


static func confluence_effects(owned: Dictionary, taken: Array) -> Array:
	return GauntletDraft.confluence_effects(owned, taken)


static func convergence_level(cv: Dictionary, owned: Dictionary, taken: Array) -> int:
	return GauntletDraft.convergence_level(cv, owned, taken)


static func draw_convergence(owned: Dictionary, taken: Array, taken_cv: Array, offered: Array, mult: float, variant: String) -> Dictionary:
	return GauntletDraft.draw_convergence(owned, taken, taken_cv, offered, mult, variant)


static func convergence_effects(owned: Dictionary, taken: Array, taken_cv: Array) -> Array:
	return GauntletDraft.convergence_effects(owned, taken, taken_cv)


static func draw_reprieve(curse_count: int) -> Dictionary:
	return GauntletDraft.draw_reprieve(curse_count)


# ── Terms, Marks, the Fence and the Don's jobs (core/gauntlet_terms.gd) ───────

static func pressure(signed: Dictionary) -> float:
	return GauntletTerms.pressure(signed)


static func no_terms() -> Dictionary:
	return GauntletTerms.no_terms()


static func resolve_terms(signed: Dictionary) -> Dictionary:
	return GauntletTerms.resolve_terms(signed)


static func term_effects(signed: Dictionary) -> Array:
	return GauntletTerms.term_effects(signed)


static func roll_marks() -> Dictionary:
	return GauntletTerms.roll_marks()


static func mark_effects(marks: Array) -> Array:
	return GauntletTerms.mark_effects(marks)


static func fence_stock(has_curse: bool) -> Array:
	return GauntletTerms.fence_stock(has_curse)


static func roll_contract(d: int) -> String:
	return GauntletTerms.roll_contract(d)


static func build_contract(kind: String, stake: int, d: int) -> Dictionary:
	return GauntletTerms.build_contract(kind, stake, d)


static func contract_met(c: Dictionary, f: Dictionary) -> bool:
	return GauntletTerms.contract_met(c, f)


static func contract_goal(c: Dictionary) -> String:
	return GauntletTerms.contract_goal(c)


static func describe_reward(r: Dictionary) -> String:
	return GauntletTerms.describe_reward(r)


static func describe_penalty(p: Dictionary) -> String:
	return GauntletTerms.describe_penalty(p)


# ── The Locker (core/gauntlet_locker.gd) ──────────────────────────────────────

static func upgrade_def(id: String) -> Dictionary:
	return GauntletLocker.upgrade_def(id)


static func upgrades_for(variant: String) -> Array:
	return GauntletLocker.upgrades_for(variant)


static func owns(p: Dictionary, id: String) -> bool:
	return GauntletLocker.owns(p, id)


static func active_upgrades(owned: Array, off: Array) -> Array:
	return GauntletLocker.active_upgrades(owned, off)


static func run_hp_mult(ups: Array) -> float:
	return GauntletLocker.run_hp_mult(ups)


static func damage_taken_mod(ups: Array) -> float:
	return GauntletLocker.damage_taken_mod(ups)


static func damage_mod(ups: Array) -> float:
	return GauntletLocker.damage_mod(ups)


static func kill_heal_pct(ups: Array) -> float:
	return GauntletLocker.kill_heal_pct(ups)


static func fathoms_mult(ups: Array) -> float:
	return GauntletLocker.fathoms_mult(ups)


static func haul_mult(ups: Array) -> float:
	return GauntletLocker.haul_mult(ups)


static func xp_mult(ups: Array) -> float:
	return GauntletLocker.xp_mult(ups)


static func boon_luck(ups: Array) -> float:
	return GauntletLocker.boon_luck(ups)


static func boon_rerolls(ups: Array) -> int:
	return GauntletLocker.boon_rerolls(ups)


static func curse_rerolls(ups: Array) -> int:
	return GauntletLocker.curse_rerolls(ups)


static func boon_filters(ups: Array) -> int:
	return GauntletLocker.boon_filters(ups)


static func synergy_mult(ups: Array) -> float:
	return GauntletLocker.synergy_mult(ups)


static func skips_first_curse(ups: Array) -> bool:
	return GauntletLocker.skips_first_curse(ups)


static func sounding_line(ups: Array) -> bool:
	return GauntletLocker.sounding_line(ups)


static func start_depth(ups: Array) -> int:
	return GauntletLocker.start_depth(ups)


static func blood_oath(ups: Array) -> bool:
	return GauntletLocker.blood_oath(ups)


static func buy_upgrade(db: CaptainStore, uid: String, id: String) -> Dictionary:
	return GauntletLocker.buy_upgrade(db, uid, id)


static func toggle_upgrade(db: CaptainStore, uid: String, id: String) -> Dictionary:
	return GauntletLocker.toggle_upgrade(db, uid, id)
