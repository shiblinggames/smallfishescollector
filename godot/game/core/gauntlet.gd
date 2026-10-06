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


static func estimate_pot(depth: int, variant: String = "davy") -> float:
	var total: float = 0.0
	for d: int in range(1, depth + 1):
		total += round_contribution(d, false, variant)
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


## A party's field (port rule, Kong 2026-10-03: "multiple ships for enemies
## just like in raids"): the lead from generate_fight, then escorts, mobs of
## the same depth, each with its own elite roll. port_rules gauntlet.party.
static func escorts(fight: Dictionary, n: int, terms: Dictionary, variant: String) -> Array:
	if n < 2:
		return []
	var pk: Dictionary = packs_cfg()
	var tm: Dictionary = terms if not terms.is_empty() else no_terms()
	var d: int = int(fight["depth"])
	var boss: bool = fight["isBoss"] == true
	# The threat budget: the party's size, a little either way, less under a
	# boss, more in deep water.
	var budget: int = int(Js.num(Js.obj(pk.get("budget")).get(str(clampi(n, 2, 4)))))
	var sp: int = int(Js.nz(pk.get("spread"), 1.0))
	budget += int(floor(Dice.next() * (2 * sp + 1))) - sp
	if boss:
		budget -= int(Js.nz(pk.get("bossCut"), 2.0))
	budget += _deep_bonus(pk, variant, d)
	# The fleet: the lead's own when it is one of the descent's crews.
	var fleets: Dictionary = _fleets(variant)
	var names: Array = fleets.keys()
	names.sort()
	var lead_fleet: String = str(Js.obj(fight["enemy"]).get("raidId", ""))
	var home: String = lead_fleet if fleets.has(lead_fleet) else str(names[int(floor(Dice.next() * names.size()))])
	var away: String = ""
	if names.size() > 1 and d >= int(Js.num(Js.obj(pk.get("mixFrom")).get(variant))) and Dice.next() < float(Js.nz(pk.get("mixChance"), 0.4)):
		var others: Array = names.filter(func(x: String) -> bool: return x != home)
		away = str(others[int(floor(Dice.next() * others.size()))])
	fight["pack"] = _fleet_name(home) + ((" and " + _fleet_name(away)) if away != "" else "")
	var tm2: Dictionary = tm.duplicate()
	tm2["eliteChanceMult"] = float(tm["eliteChanceMult"]) * float(party_cfg().get("escortElite", 1.0))
	var out: Array = []
	var support: Array = Js.list(pk.get("support"))
	var has_sup: bool = false
	var has_other: bool = false
	var cost: Dictionary = Js.obj(pk.get("cost"))
	while out.size() < int(Js.nz(pk.get("maxEscorts"), 3.0)):
		var fl: String = home if away == "" or Dice.next() < 0.5 else away
		var afford: Array = Js.list(fleets[fl]).filter(func(p: Array) -> bool: return int(Js.nz(cost.get(str(p[1])), 2.0)) <= budget)
		if afford.is_empty():
			break
		var pair: Array = afford[int(floor(Dice.next() * afford.size()))]
		budget -= int(Js.nz(cost.get(str(pair[1])), 2.0))
		var en: Dictionary = scale_to_curve(hand(pair), d, false, variant)
		var r: Dictionary = _elite_roll(en, d, tm2)
		if r["elite"]:
			budget -= int(Js.nz(pk.get("eliteCost"), 2.0))
		# A role, from the ship's own fleet, when the pack has room for it.
		var role: String = ""
		if budget >= int(Js.nz(pk.get("roleCost"), 1.0)) and Dice.next() < float(Js.nz(pk.get("roleChance"), 0.55)):
			var can: Array = Js.list(Js.obj(Js.obj(pk.get("fleets")).get(fl)).get("roles")).filter(func(x: String) -> bool:
				return (not has_sup) if support.has(x) else (not has_other))
			if not can.is_empty():
				role = str(can[int(floor(Dice.next() * can.size()))])
				budget -= int(Js.nz(pk.get("roleCost"), 1.0))
				if support.has(role):
					has_sup = true
				else:
					has_other = true
		out.append({ "enemy": r["enemy"], "isElite": r["elite"], "affix": r["affix"], "role": role, "kind": str(pair[1]), "fleet": fl })
	_combo(fight, out, variant, d)
	return out


## The deep water's extra budget at this depth (the last step reached).
static func _deep_bonus(pk: Dictionary, variant: String, d: int) -> int:
	var add: int = 0
	for st: Variant in Js.list(Js.obj(pk.get("deepBonus")).get(variant)):
		if d >= int(st[0]):
			add = int(st[1])
	return add


## Co-op packs (port rules battle.gauntlet.packs).
static func packs_cfg() -> Dictionary:
	return Js.obj(coop_cfg().get("packs"))


## The descent's crews: { raidId: [[raidId, key], ...] }.
static func _fleets(variant: String) -> Dictionary:
	var out: Dictionary = {}
	for p: Variant in Js.list(t()["pools"]["donMobs" if variant == "don" else "davyMobs"]):
		var pr: Array = p
		if not out.has(str(pr[0])):
			out[str(pr[0])] = []
		(out[str(pr[0])] as Array).append(pr)
	return out


static func _fleet_name(id: String) -> String:
	return str(Js.obj(Js.obj(packs_cfg().get("fleets")).get(id)).get("name", id.capitalize()))


## One named combo for the pack, past its depth: a role ship and a partner
## (the lead counts when it is a plain ship), neither with an elite affix.
## Written as { id, with } on each half (0 is the lead, escort j is j + 1).
static func _combo(fight: Dictionary, out: Array, variant: String, d: int) -> void:
	var pk: Dictionary = packs_cfg()
	if d < int(Js.num(Js.obj(pk.get("comboFrom")).get(variant))) or Dice.next() >= float(Js.nz(pk.get("comboChance"), 0.6)):
		return
	var heavy: Array = Js.list(pk.get("heavy"))
	var ships: Array = []
	var lead: Dictionary = Js.obj(fight["enemy"])
	if fight["isBoss"] != true and Js.obj(fight.get("affix")).is_empty() and fight.get("isElite", false) != true:
		ships.append({ "i": 0, "role": "", "kind": str(lead.get("key", "")), "name": str(lead.get("name", "")) })
	for j: int in out.size():
		var x: Dictionary = out[j]
		if Js.obj(x.get("affix")).is_empty():
			ships.append({ "i": j + 1, "role": str(x["role"]), "kind": str(x["kind"]), "name": str(Js.obj(x["enemy"]).get("name", "")) })
	var can: Array = []
	for c: Dictionary in Js.list(pk.get("combos")):
		for a: Dictionary in ships:
			if a["role"] != c["role"]:
				continue
			for p: Dictionary in ships:
				if p["i"] == a["i"]:
					continue
				var ok: bool = false
				match str(c["partner"]):
					"heavy": ok = heavy.has(p["kind"]) and p["role"] == ""
					"plain": ok = p["role"] == ""
					_: ok = p["role"] == c["partner"]
				if ok:
					can.append([c, a, p])
	if can.is_empty():
		return
	var pick: Array = can[int(floor(Dice.next() * can.size()))]
	var cb: Dictionary = pick[0]
	var halves: Array = [pick[1], pick[2]]
	for h: int in 2:
		var me: Dictionary = halves[h]
		var other: Dictionary = halves[1 - h]
		var tag: Dictionary = { "id": cb["id"], "with": float(other["i"]), "withName": other["name"], "half": "role" if h == 0 else "partner" }
		if int(me["i"]) == 0:
			fight["leadCombo"] = tag
		else:
			out[int(me["i"]) - 1]["combo"] = tag


static func combo_def(id: String) -> Dictionary:
	for c: Dictionary in Js.list(packs_cfg().get("combos")):
		if c["id"] == id:
			return c
	return {}


static func party_cfg() -> Dictionary:
	return Js.obj(Js.obj(Battle.cfg().get("gauntlet")).get("party"))


## Co-op's own (port rules battle.gauntlet): bond and crew synergy odds, the
## Fleet Chest, the vouchers.
static func coop_cfg() -> Dictionary:
	return Js.obj(Battle.cfg().get("gauntlet"))


# ══ Curses ════════════════════════════════════════════════════════════════════

static func curse_def(id: String) -> Dictionary:
	for c: Dictionary in Js.list(t().get("curses")):
		if c["id"] == id:
			return c
	return {}


static func is_curse_depth(d: int, freq: float = 1.0) -> bool:
	var last: int = CURSE_DEPTHS[CURSE_DEPTHS.size() - 1]
	if CURSE_DEPTHS.has(d) or (d > last and (d - last) % CURSE_INTERVAL == 0):
		return true
	if freq > 1.0 and d > last:
		var tight: int = maxi(2, int(Js.round(CURSE_INTERVAL / freq)))
		return (d - last) % tight == 0
	if freq > 1.0 and d <= last and d >= CURSE_DEPTHS[0]:
		return CURSE_DEPTHS.any(func(x: int) -> bool: return d == x - 1) and d > CURSE_DEPTHS[0]
	return false


## drawCurse: a fresh curse, or (from depth 13) a deepening of one carried;
## once the pool is spent and the run is past the bend, The Crush.
static func draw_curse(held: Dictionary, d: int, worst: bool, variant: String) -> Dictionary:
	var elig: Array = []
	for c: Dictionary in Js.list(t().get("curses")):
		if c["id"] == "the_crush" or not in_pool(c.get("gauntlet"), variant):
			continue
		var nx: int = int(Js.num(held.get(c["id"]))) + 1
		if nx <= Js.list(c["tiers"]).size() and (nx == 1 or d >= CURSE_TIER2_DEPTH):
			elig.append([c, nx])
	if not elig.is_empty():
		var dr: Array = elig[int(floor(Dice.next() * elig.size()))]
		var c: Dictionary = dr[0]
		var nx: int = mini(Js.list(c["tiers"]).size(), maxi(int(dr[1]), 2)) if worst else int(dr[1])
		return _curse_offer(c, nx)
	if d > DEEP_BEND_START:
		var crush: Dictionary = curse_def("the_crush")
		var nx2: int = int(Js.num(held.get("the_crush"))) + 1
		if not crush.is_empty() and nx2 <= Js.list(crush["tiers"]).size():
			return _curse_offer(crush, nx2)
	return {}


static func _curse_offer(c: Dictionary, tier: int) -> Dictionary:
	var tr: Dictionary = c["tiers"][tier - 1]
	return {
		"id": c["id"], "name": c["name"], "image": c.get("image"), "flavor": c.get("flavor", ""), "tier": float(tier),
		"desc": tr.get("desc", ""), "detail": tr.get("detail", ""), "effects": Js.list(tr.get("effects")),
		"hpDrainPct": Js.num(tr.get("hpDrainPct")), "silenceCrew": Js.num(tr.get("silenceCrew")), "isUpgrade": tier > 1,
	}


static func curse_effects(held: Dictionary) -> Array:
	var out: Array = []
	for id: String in held:
		var c: Dictionary = curse_def(id)
		var tiers: Array = Js.list(c.get("tiers"))
		var tr: int = int(held[id])
		if tr >= 1 and tr <= tiers.size():
			out += Js.list(Js.obj(tiers[tr - 1]).get("effects"))
	return out


static func curse_hp_drain(held: Dictionary) -> float:
	var a: float = 0.0
	for id: String in held:
		var tiers: Array = Js.list(curse_def(id).get("tiers"))
		var tr: int = int(held[id])
		if tr >= 1 and tr <= tiers.size():
			a += Js.num(Js.obj(tiers[tr - 1]).get("hpDrainPct"))
	return a


static func curse_silence(held: Dictionary) -> int:
	var a: int = 0
	for id: String in held:
		var tiers: Array = Js.list(curse_def(id).get("tiers"))
		var tr: int = int(held[id])
		if tr >= 1 and tr <= tiers.size():
			a += int(Js.num(Js.obj(tiers[tr - 1]).get("silenceCrew")))
	return a


# ══ Boons ═════════════════════════════════════════════════════════════════════

static func boon_def(id: String) -> Dictionary:
	for b: Dictionary in Js.list(t().get("boons")):
		if b["id"] == id:
			return b
	for b2: Dictionary in bonds():
		if b2["id"] == id:
			return b2
	return {}


## Every synergy: the web's, then the co-op ones (bond + power; port rules
## battle.gauntlet.bondSynergies, none under the parity run).
static func confluences() -> Array:
	return Js.list(t().get("confluences")) + Js.list(Js.obj(Battle.cfg().get("gauntlet")).get("bondSynergies"))


## The co-op bond powers (port rules battle.gauntlet.bonds; none under the
## parity run, which reads the web's tables alone).
static func bonds() -> Array:
	return Js.list(Js.obj(Battle.cfg().get("gauntlet")).get("bonds"))


## One bond card for a co-op spread, weighted by rarity like the powers,
## among the families someone at the table can still take.
static func draw_bond(lowest: Dictionary, banned: Array) -> Dictionary:
	var meta: Dictionary = t()["rarity"]
	var pool: Array = []
	var tot: float = 0.0
	for b: Dictionary in bonds():
		if banned.has(b["id"]):
			continue
		var nx: int = int(Js.num(lowest.get(b["id"]))) + 1
		if nx > Js.list(b["tiers"]).size():
			continue
		var w: float = float(Js.obj(meta.get(rarity(b))).get("weight", 1.0))
		pool.append([b, nx, w])
		tot += w
	if pool.is_empty():
		return {}
	var r: float = Dice.next() * tot
	for p: Array in pool:
		r -= float(p[2])
		if r <= 0.0:
			var o: Dictionary = boon_offer(p[0], int(p[1]))
			o["bond"] = true
			o["role"] = p[0].get("role", "")
			return o
	var last: Array = pool[pool.size() - 1]
	var o2: Dictionary = boon_offer(last[0], int(last[1]))
	o2["bond"] = true
	o2["role"] = last[0].get("role", "")
	return o2


static func rarity(b: Dictionary) -> String:
	return str(Js.nz(b.get("rarity"), "common"))


static func is_boon_depth(d: int, freq: float = 1.0) -> bool:
	if d < 2:
		return false
	var m: int = (d - 2) % 5
	if m != 0 and m != 2:
		return false
	return not (freq < 1.0 and m == 2)


## drawBoons: up to n families, each at the next tier this captain can take,
## weighted by rarity (luck lifts the rare ones, a skew crushes them).
static func draw_boons(n: int, owned: Dictionary, luck: float, skew: float, variant: String, banned: Array = []) -> Array:
	var meta: Dictionary = t()["rarity"]
	var avail: Array = []
	for b: Dictionary in Js.list(t().get("boons")):
		if not in_pool(b.get("gauntlet"), variant) or banned.has(b["id"]):
			continue
		var nx: int = int(Js.num(owned.get(b["id"]))) + 1
		if nx <= Js.list(b["tiers"]).size():
			avail.append([b, nx])
	var w: Callable = func(b: Dictionary) -> float:
		var r: String = rarity(b)
		if r == "common":
			return float(meta[r]["weight"])
		return float(meta[r]["weight"]) * luck * (1.0 - clampf(skew, 0.0, 1.0))
	var out: Array = []
	var i: int = 0
	while i < n and not avail.is_empty():
		var tot: float = 0.0
		for x: Array in avail:
			tot += float(w.call(x[0]))
		var r: float = Dice.next() * tot
		var idx: int = 0
		while idx < avail.size() - 1:
			r -= float(w.call(avail[idx][0]))
			if r <= 0.0:
				break
			idx += 1
		var pick: Array = avail.pop_at(idx)
		out.append(boon_offer(pick[0], int(pick[1])))
		i += 1
	return out


static func boon_offer(b: Dictionary, tier: int) -> Dictionary:
	var tr: Dictionary = b["tiers"][tier - 1]
	return {
		"id": b["id"], "name": b["name"], "flavor": b.get("flavor", ""), "rarity": rarity(b), "tier": float(tier),
		"desc": tr.get("desc", ""), "detail": tr.get("detail", ""), "effect": tr.get("effect"), "upgrade": tier > 1, "image": b.get("image"),
	}


static func blood_oath_boon(variant: String) -> String:
	var pool: Array = Js.list(t().get("boons")).filter(func(b: Dictionary) -> bool:
		return in_pool(b.get("gauntlet"), variant) and rarity(b) != "legendary" and b["id"] != "manowars_wrath")
	if pool.is_empty():
		return ""
	return str(pool[int(floor(Dice.next() * pool.size()))]["id"])


static func boon_effects(owned: Dictionary) -> Array:
	var out: Array = []
	for b: Dictionary in Js.list(t().get("boons")) + bonds():
		var tr: int = int(Js.num(owned.get(b["id"])))
		if tr >= 1:
			out.append(b["tiers"][mini(tr, Js.list(b["tiers"]).size()) - 1]["effect"])
	return out


static func hp_boon_mult(effects: Array, d: int, kills: int) -> float:
	var m: float = 1.0
	for e: Dictionary in effects:
		match str(e.get("kind", "")):
			"maxHpMult":
				m *= float(e["mult"])
			"maxHpPerDepth":
				m *= 1.0 + minf(float(e["max"]), float(e["perDepth"]) * maxi(0, d))
			"maxHpPerKill":
				m *= 1.0 + minf(float(e["max"]), float(e["perKill"]) * maxi(0, kills))
	return m


# ── Confluences and convergences ──────────────────────────────────────────────

static func confluence_def(id: String) -> Dictionary:
	for c: Dictionary in confluences():
		if c["id"] == id:
			return c
	return {}


static func convergence_def(id: String) -> Dictionary:
	for c: Dictionary in Js.list(t().get("convergences")):
		if c["id"] == id:
			return c
	return {}


static func confluence_level(c: Dictionary, owned: Dictionary) -> int:
	var lo: int = 99
	for r: Dictionary in Js.list(c["requires"]):
		lo = mini(lo, int(Js.num(owned.get(r["boonId"]))))
	if lo < 1:
		return 0
	return mini(lo, Js.list(c["levels"]).size())


static func eligible_confluences(owned: Dictionary, taken: Array, variant: String) -> Array:
	return confluences().filter(func(c: Dictionary) -> bool:
		return in_pool(c.get("gauntlet"), variant) and not taken.has(c["id"]) and confluence_level(c, owned) >= 1)


static func confluence_hints(offer_id: String, offer_tier: int, owned: Dictionary, taken: Array) -> Array:
	var after: Dictionary = owned.duplicate()
	after[offer_id] = float(maxi(int(Js.num(owned.get(offer_id))), offer_tier))
	var out: Array = []
	for c: Dictionary in confluences():
		if not Js.list(c["requires"]).any(func(r: Dictionary) -> bool: return r["boonId"] == offer_id):
			continue
		var before: int = confluence_level(c, owned)
		var nx: int = confluence_level(c, after)
		if nx < 1:
			continue
		if not taken.has(c["id"]):
			if before < 1:
				out.append({ "id": c["id"], "name": c["name"], "kind": "unlocks", "level": float(nx) })
		elif nx > before:
			out.append({ "id": c["id"], "name": c["name"], "kind": "deepens", "level": float(nx) })
	return out


static func _desc_at(levels: Array, level: int) -> String:
	return str(Js.obj(levels[clampi(level if level > 0 else 1, 1, levels.size()) - 1]).get("desc", ""))


## drawConfluenceOffer: a synergy card for this captain's draft, the pity rule
## guaranteeing one never yet shown.
static func draw_confluence(owned: Dictionary, taken: Array, offered: Array, mult: float, variant: String) -> Dictionary:
	if mult <= 0.0:
		return {}
	var pool: Array = eligible_confluences(owned, taken, variant)
	if pool.is_empty():
		return {}
	var fresh: Array = pool.filter(func(c: Dictionary) -> bool: return not offered.has(c["id"]))
	if not fresh.is_empty() and mult < 1.0 and Dice.next() >= mult:
		return {}
	if fresh.is_empty() and Dice.next() >= CONFLUENCE_OFFER_CHANCE * mult:
		return {}
	var from: Array = fresh if not fresh.is_empty() else pool
	var c: Dictionary = from[int(floor(Dice.next() * from.size()))]
	var lv: int = confluence_level(c, owned)
	var req: Array = Js.list(c["requires"])
	return {
		"kind": "confluence", "id": c["id"], "name": c["name"], "flavor": c.get("flavor", ""), "level": float(lv),
		"desc": _desc_at(c["levels"], lv), "detail": c.get("detail", ""), "image": c.get("image"),
		"halves": [str(boon_def(req[0]["boonId"]).get("name", req[0]["boonId"])), str(boon_def(req[1]["boonId"]).get("name", req[1]["boonId"]))],
	}


static func confluence_effects(owned: Dictionary, taken: Array) -> Array:
	var out: Array = []
	for c: Dictionary in confluences():
		if not taken.has(c["id"]):
			continue
		var lv: int = confluence_level(c, owned)
		if lv >= 1:
			out += Js.list(c["levels"][lv - 1]["effects"])
	return out


static func convergence_level(cv: Dictionary, owned: Dictionary, taken: Array) -> int:
	var lo: int = 99
	for r: Dictionary in Js.list(cv["requires"]):
		var l: int = 0
		if taken.has(r["confluenceId"]):
			var c: Dictionary = confluence_def(str(r["confluenceId"]))
			l = confluence_level(c, owned) if not c.is_empty() else 0
		lo = mini(lo, l)
	if lo < 1:
		return 0
	return mini(lo, Js.list(cv["levels"]).size())


static func draw_convergence(owned: Dictionary, taken: Array, taken_cv: Array, offered: Array, mult: float, variant: String) -> Dictionary:
	if mult <= 0.0:
		return {}
	var pool: Array = Js.list(t().get("convergences")).filter(func(cv: Dictionary) -> bool:
		return in_pool(cv.get("gauntlet"), variant) and not taken_cv.has(cv["id"]) and convergence_level(cv, owned, taken) >= 1)
	if pool.is_empty():
		return {}
	var fresh: Array = pool.filter(func(cv: Dictionary) -> bool: return not offered.has(cv["id"]))
	if not fresh.is_empty() and mult < 1.0 and Dice.next() >= mult:
		return {}
	if fresh.is_empty() and Dice.next() >= CONVERGENCE_OFFER_CHANCE * mult:
		return {}
	var from: Array = fresh if not fresh.is_empty() else pool
	var cv: Dictionary = from[int(floor(Dice.next() * from.size()))]
	var lv: int = convergence_level(cv, owned, taken)
	var req: Array = Js.list(cv["requires"])
	return {
		"kind": "confluence", "isConvergence": true, "id": cv["id"], "name": cv["name"], "flavor": cv.get("flavor", ""), "level": float(lv),
		"desc": _desc_at(cv["levels"], lv), "detail": cv.get("detail", ""), "image": cv.get("image"),
		"halves": [str(confluence_def(req[0]["confluenceId"]).get("name", "")), str(confluence_def(req[1]["confluenceId"]).get("name", ""))],
	}


static func convergence_effects(owned: Dictionary, taken: Array, taken_cv: Array) -> Array:
	var out: Array = []
	for cv: Dictionary in Js.list(t().get("convergences")):
		if not taken_cv.has(cv["id"]):
			continue
		var lv: int = convergence_level(cv, owned, taken)
		if lv >= 1:
			out += Js.list(cv["levels"][lv - 1]["effects"])
	return out


# ── Reprieves ─────────────────────────────────────────────────────────────────

static func draw_reprieve(curse_count: int) -> Dictionary:
	var pool: Array = Js.list(t().get("reprieves")).filter(func(r: Dictionary) -> bool: return r["kind"] != "cleanse" or curse_count > 0)
	return pool[int(floor(Dice.next() * pool.size()))]


# ══ Terms (hardcore only) ═════════════════════════════════════════════════════

static func term_def(id: String) -> Dictionary:
	for x: Dictionary in Js.list(t().get("terms")):
		if x["id"] == id:
			return x
	return {}


static func terms_for(variant: String) -> Array:
	return Js.list(t().get("terms")).filter(func(x: Dictionary) -> bool: return in_pool(x.get("gauntlet"), variant))


static func terms_title(variant: String) -> String:
	return "Don's Terms" if variant == "don" else "Davy's Terms"


static func pressure(signed: Dictionary) -> float:
	var p: float = 0.0
	for id: String in signed:
		var x: Dictionary = term_def(id)
		var tr: int = int(Js.num(signed[id]))
		if x.is_empty() or tr < 1:
			continue
		p += Js.num(Js.obj(x["tiers"][mini(tr, Js.list(x["tiers"]).size()) - 1]).get("pressure"))
	return p


static func max_pressure(variant: String) -> float:
	var p: float = 0.0
	for x: Dictionary in terms_for(variant):
		var tiers: Array = Js.list(x["tiers"])
		p += Js.num(Js.obj(tiers[tiers.size() - 1]).get("pressure"))
	return p


static func no_terms() -> Dictionary:
	return {
		"forceContracts": false, "eliteChanceMult": 1.0, "affixPairFromStart": false, "tripleAffixChance": 0.0,
		"eliteHpMult": 1.0, "eliteDmgMult": 1.0, "bossHpMult": 1.0, "bossDmgMult": 1.0, "bossAffixCount": 0.0,
		"crewRefreshChance": 1.0, "crewSlotsLost": 0.0, "boonPicks": 3.0, "boonFrequencyMult": 1.0, "commonSkew": 0.0,
		"confluenceOfferMult": 1.0, "curseFrequencyMult": 1.0, "curseStartsAtWorst": false, "maxHpPct": 1.0,
		"noLethalSaves": false, "noReprieves": false, "noPeek": false, "bloodPriceToOne": false,
		"cashOutOnlyAfterBoss": false, "healMult": 1.0,
	}


## resolveTerms: the signed board folded into the knobs the run reads.
static func resolve_terms(signed: Dictionary) -> Dictionary:
	var e: Dictionary = no_terms()
	var tier_of: Callable = func(id: String) -> int:
		var x: Dictionary = term_def(id)
		return mini(int(Js.num(signed.get(id))), Js.list(x.get("tiers")).size()) if not x.is_empty() else 0
	if tier_of.call("every_job") > 0:
		e["forceContracts"] = true
	var press: int = tier_of.call("press_ganged")
	if press > 0:
		e["eliteChanceMult"] = 1.8 if press == 1 else 2.6
	var marked: int = tier_of.call("marked_hulls")
	if marked > 0:
		e["affixPairFromStart"] = true
		if marked >= 2:
			e["tripleAffixChance"] = 0.33
	var iron: int = tier_of.call("ironbacked")
	if iron > 0:
		e["eliteHpMult"] = 1.2 if iron == 1 else 1.45
		e["eliteDmgMult"] = 1.12 if iron == 1 else 1.28
	var court: int = tier_of.call("davys_court")
	if court > 0:
		e["bossHpMult"] = 1.25 if court == 1 else 1.5
		e["bossDmgMult"] = 1.15 if court == 1 else 1.3
	e["bossAffixCount"] = float(tier_of.call("crowned"))
	var skel: int = tier_of.call("skeleton_crew")
	if skel > 0:
		e["crewRefreshChance"] = 0.6 if skel == 1 else 0.3
	if tier_of.call("short_handed") > 0:
		e["crewSlotsLost"] = 1.0
	var comm: int = tier_of.call("no_communion")
	if comm > 0:
		e["confluenceOfferMult"] = 0.5 if comm == 1 else 0.0
	var powder: int = tier_of.call("scarce_powder")
	if powder > 0:
		e["boonPicks"] = 2.0
		if powder >= 2:
			e["boonFrequencyMult"] = 0.65
	var barren: int = tier_of.call("barren_tides")
	if barren > 0:
		e["commonSkew"] = 0.6 if barren == 1 else 0.85
	var tongue: int = tier_of.call("loose_tongue")
	if tongue > 0:
		e["curseFrequencyMult"] = 1.5 if tongue == 1 else 1.9
		if tongue >= 2:
			e["curseStartsAtWorst"] = true
	var draft: int = tier_of.call("deep_draft")
	if draft > 0:
		e["maxHpPct"] = 0.85 if draft == 1 else 0.70
	if tier_of.call("full_measure") > 0:
		e["bloodPriceToOne"] = true
	if tier_of.call("no_second_thoughts") > 0:
		e["cashOutOnlyAfterBoss"] = true
	var rations: int = tier_of.call("iron_rations")
	if rations > 0:
		e["healMult"] = 0.5 if rations == 1 else 0.0
	if tier_of.call("no_mercy") > 0:
		e["noLethalSaves"] = true
	if tier_of.call("no_quarter") > 0:
		e["noReprieves"] = true
	if tier_of.call("blind_descent") > 0:
		e["noPeek"] = true
	return e


static func term_effects(signed: Dictionary) -> Array:
	var out: Array = []
	for id: String in signed:
		var x: Dictionary = term_def(id)
		var tr: int = int(Js.num(signed[id]))
		if x.is_empty() or tr < 1:
			continue
		out += Js.list(Js.obj(x["tiers"][mini(tr, Js.list(x["tiers"]).size()) - 1]).get("effects"))
	return out


# ══ Marks of the Don ═════════════════════════════════════════════════════════

static func roll_marks() -> Dictionary:
	var m: Dictionary = t()["marks"]
	return { "shark": _roll_buffs(Js.list(m["shark"])), "whale": _roll_buffs(Js.list(m["whale"])) }


static func _roll_buffs(cats: Array) -> Array:
	var pool: Array = cats.duplicate()
	var out: Array = []
	for i: int in mini(MARK_BUFFS_PER, pool.size()):
		var cat: String = str(pool.pop_at(int(floor(Dice.next() * pool.size()))))
		var pct: int = MARK_ROLL_MIN + int(floor(Dice.next() * (MARK_ROLL_MAX - MARK_ROLL_MIN + 1)))
		out.append({ "cat": cat, "pct": float(pct) })
	return out


static func mark_effects(marks: Array) -> Array:
	var out: Array = []
	for mk: Dictionary in marks:
		for b: Dictionary in Js.list(mk.get("buffs")):
			var p: float = float(b["pct"]) / 100.0
			match str(b["cat"]):
				"gunnery": out.append({ "kind": "damageMult", "mult": 1.0 + p })
				"broadside": out.append({ "kind": "volleyDmgMult", "mult": 1.0 + p })
				"bombards": out.append({ "kind": "megaDmgMult", "mult": 1.0 + p })
				"marksman": out.append({ "kind": "critDmgMult", "mult": 1.0 + p })
				"keen_eye": out.append({ "kind": "critChanceBonus", "chance": p })
				"wildfire": out.append({ "kind": "fireAffinity", "burnChance": p, "burnTurnsBonus": 0.0, "burnTickMult": 1.0 + p })
				"hoarfrost": out.append({ "kind": "iceAffinity", "freezeChance": p, "frozenDmgMult": 1.0 + p })
				"ironhull": out.append({ "kind": "maxHpMult", "mult": 1.0 + p })
				"bulwark": out.append({ "kind": "fightShield", "pctMax": p })
				"mending": out.append({ "kind": "healMult", "mult": 1.0 + p })
				"aegis": out.append({ "kind": "incomingDmgMult", "mult": 1.0 - p, "scope": "allRemaining" })
				"bloodward": out.append({ "kind": "lifestealPct", "pct": p })
	return out


# ══ The Fence, the Shrine, the Don's jobs ═════════════════════════════════════

static func fence_stock(has_curse: bool) -> Array:
	var extras: Array = ["charges", "crew", "boon"]
	if has_curse:
		extras.append("cleanse")
	for i: int in range(extras.size() - 1, 0, -1):
		var j: int = int(floor(Dice.next() * (i + 1)))
		var tmp: Variant = extras[i]
		extras[i] = extras[j]
		extras[j] = tmp
	return ["heal"] + extras.slice(0, 2)


static func roll_contract(d: int) -> String:
	if d < CONTRACT_MIN_DEPTH:
		return ""
	if Dice.next() >= CONTRACT_OFFER_CHANCE:
		return ""
	return CONTRACT_KINDS[int(floor(Dice.next() * CONTRACT_KINDS.size()))]


static func contract_param(kind: String, stake: int, d: int) -> int:
	return maxi(2, (6 - stake) + int(floor(d / 25.0))) if kind == "fast" else 0


static func build_contract(kind: String, stake: int, d: int) -> Dictionary:
	var plunder: float = float(Js.round(round_contribution(d, true, "don") * (0.4 + 0.3 * stake)))
	var reward: Dictionary
	if stake == 3 and Dice.next() < 0.5:
		reward = { "kind": "boonDraft" }
	elif Dice.next() < 0.3:
		reward = { "kind": "hullBoost", "pct": 0.15 }
	elif Dice.next() < 0.22:
		reward = { "kind": "fullHeal" }
	else:
		reward = { "kind": "plunder", "n": plunder }
	var penalty: Dictionary
	if stake == 3 and Dice.next() < 0.5:
		penalty = { "kind": "curse" }
	elif stake >= 2 and Dice.next() < 0.3:
		penalty = { "kind": "hullCut", "pct": 0.08 }
	elif Dice.next() < 0.4:
		penalty = { "kind": "hpLossPct", "pct": minf(0.4, 0.1 + 0.06 * stake) }
	else:
		penalty = { "kind": "plunderLose", "n": float(Js.round(plunder * 0.7)) }
	return { "kind": kind, "stake": float(stake), "param": float(contract_param(kind, stake, d)), "reward": reward, "penalty": penalty }


## Was the job done? f: the fight's facts, summed over the party.
static func contract_met(c: Dictionary, f: Dictionary) -> bool:
	var won: bool = f.get("won", false) == true
	var n: Callable = func(k: String) -> float: return Js.num(f.get(k))
	match str(c["kind"]):
		"fast": return won and n.call("turns") <= float(c["param"])
		"deadeye": return won and n.call("shots") > 0.0 and n.call("crits") == n.call("shots")
		"no_crew": return won and n.call("crewAbilities") == 0.0
		"fire_only": return won and n.call("volleys") == 0.0 and n.call("megas") == 0.0
		"volley_only": return won and n.call("fires") == 0.0 and n.call("megas") == 0.0
		"ultimate_only": return won and n.call("fires") == 0.0 and n.call("volleys") == 0.0 and n.call("megas") > 0.0
		"no_dodge": return won and n.call("dodges") == 0.0
		"untouched": return won and n.call("nonSpecialHitsTaken") == 0.0
	return false


static func contract_goal(c: Dictionary) -> String:
	var d: Dictionary = Js.obj(Js.obj(t().get("contracts")).get(str(c["kind"])))
	if str(c["kind"]) == "fast":
		var k: int = int(c["param"])
		return "Sink it in %d turn%s or fewer." % [k, "" if k == 1 else "s"]
	return str(d.get("goal", ""))


static func describe_reward(r: Dictionary) -> String:
	match str(r["kind"]):
		"plunder": return "+%s ⟡ plunder" % Js.thousands(float(r["n"]))
		"hullBoost": return "+%d%% max hull, rest of run" % int(round(float(r["pct"]) * 100.0))
		"boonDraft": return "A free power draft"
	return "Patched to full hull"


static func describe_penalty(p: Dictionary) -> String:
	match str(p["kind"]):
		"plunderLose": return "Lose %s ⟡ plunder" % Js.thousands(float(p["n"]))
		"curse": return "A curse for the rest of the run"
		"hpLossPct": return "Lose %d%% of your hull" % int(round(float(p["pct"]) * 100.0))
	return "-%d%% max hull, rest of run" % int(round(float(p["pct"]) * 100.0))


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


# ══ The Locker (gauntletUpgrades) ═════════════════════════════════════════════

static func upgrade_def(id: String) -> Dictionary:
	for u: Dictionary in Js.list(t().get("upgrades")):
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
	return Js.list(t().get("upgrades")).filter(func(u: Dictionary) -> bool: return str(Js.nz(u.get("gauntlet"), "davy")) == variant and not NOT_SOLD.has(u["id"])).map(func(u: Dictionary) -> Dictionary: return _worded(u))


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


static func blood_gem_mult(ups: Array) -> float:
	return 1.15 if _has(ups, "dg_crimson_tithe") else 1.0


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
