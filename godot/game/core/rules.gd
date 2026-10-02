class_name Rules
extends RefCounted
## THE RULES' TABLES AND THE SMALL RULES OVER THEM (Godot port, stage 1).
##
## content/rules.json is written by web/scripts/export-godot-rules.mts from the
## TypeScript's own tables (rods, bait, zones, holds, lines, pets, crates, the
## daily pools), so a number lives in one place. The functions here are ports
## of the small helpers in web/lib that read them; each names its source.

static var _d: Dictionary = {}
## The web's tables alone, without the port's own rules (content/port_rules.json)
## laid over them: the parity runner sets this, since the TS is its spec.
static var web_only: bool = false


## The Fishing level a thing needs (the port's levelGates), or 0.
static func gate(kind: String, key: String) -> int:
	return int(Js.num(Js.obj(Js.obj(data().get("levelGates")).get(kind)).get(key)))


## Why this captain cannot have it yet ("Needs Fishing 30"), or "".
static func gate_block(kind: String, key: String, fishing_xp: float) -> String:
	var need: int = gate(kind, key)
	if need > 0 and level_from_xp(fishing_xp) < need:
		return "Needs Fishing %d" % need
	return ""


static func data() -> Dictionary:
	if _d.is_empty():
		_d = JsJson.parse(FileAccess.get_file_as_string("res://content/rules.json"))
		if not web_only and FileAccess.file_exists("res://content/port_rules.json"):
			_merge(_d, JsJson.parse(FileAccess.get_file_as_string("res://content/port_rules.json")))
	return _d


## Lay b over a: dictionaries merge key by key, anything else replaces; keys
## starting "_" are notes, not rules.
static func _merge(a: Dictionary, b: Dictionary) -> void:
	for k: Variant in b:
		if str(k).begins_with("_"):
			continue
		if a.get(k) is Dictionary and b[k] is Dictionary:
			_merge(a[k], b[k])
		else:
			a[k] = b[k]


# ── Levels (lib/fishingLevel) ──────────────────────────────────────────────────

const MAX_LEVEL: int = 100


static func level_from_xp(xp: float) -> int:
	var table: Array = data()["xpTable"]
	if xp >= float(table[MAX_LEVEL - 1]):
		return MAX_LEVEL
	for lv: int in range(MAX_LEVEL - 1, 0, -1):
		if xp >= float(table[lv]):
			return lv + 1
	return 1


## catchXP(difficulty, zone, perfect), from the exported table.
static func catch_xp(difficulty: float, zone: String, perfect: bool) -> float:
	var by_zone: Dictionary = data()["catchXp"]
	if not by_zone.has(zone):
		push_error("catch_xp: no table for zone %s" % zone)
		return 0.0
	var i: int = clampi(int(difficulty) - 1, 0, 4)
	return float(((by_zone[zone] as Array)[i] as Array)[1 if perfect else 0])


# ── The perfect streak (lib/perfectStreak) ─────────────────────────────────────

const STREAK_XP_CAP: float = 10.0
const STREAK_PER_STEP: float = 0.08
const STREAK_LEVEL_FLOOR: float = 0.4
const STREAK_RECORD_CEILING: float = 45.0


static func streak_level_scale(fishing_level: float) -> float:
	return STREAK_LEVEL_FLOOR + (1.0 - STREAK_LEVEL_FLOOR) * (minf(maxf(_milestone_level(fishing_level), 1.0), 100.0) / 100.0)


## The level a stat reads (the port's rules: the last milestone reached, so
## the gains come in steps; the web: the level itself).
static func _milestone_level(fishing_level: float) -> float:
	var m: float = Js.num(data().get("statMilestone"))
	if m <= 0.0:
		return fishing_level
	return maxf(1.0, floor(fishing_level / m) * m)


## The catch zone a level gives, in degrees (the web: one every five levels).
static func level_catch_bonus(fishing_level: float) -> float:
	var m: float = Js.num(data().get("statMilestone"))
	if m <= 0.0:
		return floor(fishing_level * 0.2)
	return floor(fishing_level / m) * m * 0.2


static func streak_mult(streak: float, fishing_level: float) -> float:
	return 1.0 + minf(maxf(streak, 0.0), STREAK_XP_CAP) * STREAK_PER_STEP * streak_level_scale(fishing_level)


# ── Bait (lib/bait) ────────────────────────────────────────────────────────────

static func bait(type: String) -> Dictionary:
	var baits: Array = data()["baits"]
	for b: Dictionary in baits:
		if b["type"] == type:
			return b
	return baits[0]


# ── Rods (lib/rods) ────────────────────────────────────────────────────────────

static func rod(tier: float) -> Dictionary:
	var rods: Array = data()["rods"]
	for r: Dictionary in rods:
		if float(r["tier"]) == tier:
			return r
	return rods[0]


static func rod_by_id(id: String) -> Dictionary:
	for r: Dictionary in data()["rods"]:
		if r["id"] == id:
			return r
	return {}


static func rod_id_for_tier(tier: float) -> String:
	for r: Dictionary in data()["rods"]:
		if float(r["tier"]) == tier:
			return r["id"]
	return ""


static func rod_has_unique_effect(r: Dictionary) -> bool:
	if float(r["tier"]) == float(data()["completionist"]["tier"]):
		return false
	return Js.num(r.get("rarityBonus")) > 0 \
		or Js.num(r.get("doubleCatchChance")) > 0 \
		or Js.num(r.get("retryOnMissChance")) > 0 \
		or Js.num(r.get("jackpotChance")) > 0 \
		or float(Js.nz(r.get("crateChanceMult"), 1.0)) > 1 \
		or float(Js.nz(r.get("perfectXpMult"), 1.0)) > 1 \
		or Js.truthy(r.get("wormhole")) \
		or Js.num(r.get("instantBiteChance")) > 0


static func resolve_completionist_rod(effect_tiers: Array) -> Dictionary:
	var comp: Dictionary = data()["completionist"]
	var base: Dictionary = rod(float(comp["tier"])).duplicate(true)
	var seen: Array = []
	for t: Variant in effect_tiers:
		var tier: float = float(t)
		if Js.includes(seen, tier) or seen.size() >= int(comp["maxEffects"]) or tier == float(comp["tier"]):
			continue
		var donor: Dictionary = {}
		for r: Dictionary in data()["rods"]:
			if float(r["tier"]) == tier:
				donor = r
				break
		if donor.is_empty() or not rod_has_unique_effect(donor):
			continue
		seen.append(tier)
		base["rarityBonus"] = maxf(Js.num(base.get("rarityBonus")), Js.num(donor.get("rarityBonus")))
		base["doubleCatchChance"] = maxf(Js.num(base.get("doubleCatchChance")), Js.num(donor.get("doubleCatchChance")))
		base["retryOnMissChance"] = maxf(Js.num(base.get("retryOnMissChance")), Js.num(donor.get("retryOnMissChance")))
		base["crateChanceMult"] = maxf(float(Js.nz(base.get("crateChanceMult"), 1.0)), float(Js.nz(donor.get("crateChanceMult"), 1.0)))
		base["perfectXpMult"] = maxf(float(Js.nz(base.get("perfectXpMult"), 1.0)), float(Js.nz(donor.get("perfectXpMult"), 1.0)))
		if Js.num(donor.get("jackpotChance")) > Js.num(base.get("jackpotChance")):
			base["jackpotChance"] = donor.get("jackpotChance")
			base["jackpotMultiplier"] = donor.get("jackpotMultiplier")
		if Js.truthy(donor.get("wormhole")):
			base["wormhole"] = true
		if Js.num(donor.get("instantBiteChance")) > Js.num(base.get("instantBiteChance")):
			base["instantBiteChance"] = donor.get("instantBiteChance")
	return base


static func effective_rod(tier: float, completionist_effects: Variant) -> Dictionary:
	if tier != float(data()["completionist"]["tier"]):
		return rod(tier)
	return resolve_completionist_rod(Js.list(completionist_effects))


## lockedInState: the Locked-In Rod's stage off the streak the captain built.
static func locked_in_state(r: Dictionary, streak: float) -> Dictionary:
	var s: Dictionary = { "stage": 0.0, "waitMult": 1.0, "catchQty": 1.0, "rarityBonus": 0.0 }
	if not Js.truthy(r.get("lockedIn")):
		return s
	var li: Dictionary = data()["lockedIn"]
	if streak >= float(li["speedStreak"]):
		s["stage"] = 1.0
		s["waitMult"] = float(li["speedWaitMult"])
	if streak >= float(li["tripleStreak"]):
		s["stage"] = 2.0
		s["catchQty"] = float(li["tripleQty"])
	if streak >= float(li["frenzyStreak"]):
		s["stage"] = 3.0
		s["waitMult"] = float(li["frenzyWaitMult"])
		s["rarityBonus"] = float(li["frenzyRarityBonus"])
	return s


const ROD_WAIT_SCALE: float = 0.25


static func rod_wait_mult(r: Dictionary) -> float:
	var implied: float = (3800.0 - float(r["biteIntervalMs"])) / 3800.0
	return maxf(0.85, minf(1.10, 1.0 - ROD_WAIT_SCALE * implied))


static func jackpot_chance_for_zone(r: Dictionary, habitat: String) -> float:
	if not Js.truthy(r.get("jackpotChance")):
		return 0.0
	return float(Js.nz((data()["zoneJackpotChance"] as Dictionary).get(habitat), r["jackpotChance"]))


# ── Holds and lines (lib/fishHold, lib/lines) ──────────────────────────────────

static func fish_hold(tier: float) -> Dictionary:
	var tiers: Array = data()["fishHoldTiers"]
	return tiers[clampi(int(tier), 0, tiers.size() - 1)]


static func line_for_species_count(n: float) -> Dictionary:
	var lines: Array = data()["lines"]
	for i: int in range(lines.size() - 1, -1, -1):
		if n >= float((lines[i] as Dictionary)["unlockAt"]):
			return lines[i]
	return lines[0]


# ── Finn's items and renown (lib/finnItems, lib/renown) ────────────────────────

static func finn_item_level(xp: float) -> int:
	var th: Array = data()["finn"]["thresholds"]
	var lvl: int = 1
	for i: int in range(1, th.size()):
		if xp >= float(th[i]):
			lvl = i + 1
	return mini(lvl, th.size())


## eyeFromProfile: the Primeval Eye's effects, identity unless seated.
static func eye_from_profile(p: Dictionary) -> Dictionary:
	var idle: Dictionary = { "sellMult": 1.0, "waitMult": 1.0, "fishingXpMult": 1.0, "goldenOddsMult": 1.0, "crateChanceMult": 1.0, "perfectBaitSave": false }
	var seated: bool = p.get("equipped_special_2") == "anglers_patience" \
		and p.get("has_anglers_patience") == true \
		and (p.get("finn_spoil_free") == "fishing" or p.get("finn_spoil_paid") == "fishing")
	if not seated:
		return idle
	var milestones: Array = data()["finn"]["anglersPatience"]
	var m: Dictionary = milestones[mini(finn_item_level(Js.num(p.get("anglers_patience_xp"))), milestones.size()) - 1]
	return {
		"sellMult": float(Js.nz(m.get("sellMult"), 1.0)),
		"waitMult": float(Js.nz(m.get("waitMult"), 1.0)),
		"fishingXpMult": float(Js.nz(m.get("fishingXpMult"), 1.0)),
		"goldenOddsMult": float(Js.nz(m.get("goldenOddsMult"), 1.0)),
		"crateChanceMult": float(Js.nz(m.get("crateChanceMult"), 1.0)),
		"perfectBaitSave": m.get("perfectBaitSave") == true,
	}


static func _renown_pts(alloc: Variant, id: String) -> float:
	return maxf(0.0, floor(Js.num(Js.obj(alloc).get(id))))


## fishingRenownEffects: the post-100 renown points spent on fishing.
static func fishing_renown(alloc: Variant) -> Dictionary:
	var per: Dictionary = data()["renownFishingPerPoint"]
	return {
		"sellMult": 1.0 + _renown_pts(alloc, "bounty") * float(per.get("bounty", 0.0)),
		"xpMult": 1.0 + _renown_pts(alloc, "wisdom") * float(per.get("wisdom", 0.0)),
		"biteWaitMult": 1.0 - minf(0.30, _renown_pts(alloc, "patience") * float(per.get("patience", 0.0))),
		"crateChanceMult": 1.0 + _renown_pts(alloc, "providence") * float(per.get("providence", 0.0)),
	}


## fishingColorsToGrant: the colors this fishing level has earned and the
## captain does not own yet, in the game's order.
static func fishing_colors_to_grant(level: int, unlocked: Array) -> Array:
	var out: Array = []
	for id: Variant in (data()["fishingColorsByLevel"] as Dictionary).get(str(level), []):
		if not Js.includes(unlocked, id):
			out.append(id)
	return out


# ── Hotspots (lib/seaHotspots) ─────────────────────────────────────────────────

## hotspotEffect for no hotspot. The chart's hotspots (hotspotAt) come with the
## sea screen; until then every cast is in open water.
static func no_hotspot() -> Dictionary:
	return { "waitMult": 1.0, "rarityBonus": 0.0, "crateChanceMult": 1.0 }


# ── Captains (lib/premium, lib/captainWater, lib/badgeStamps, lib/collection) ──

## lib/captainWater CAPTAIN_WATER_SAYS.ancient.
const CAPTAIN_WATER_ANCIENT: String = "The Ancient Deep is Captain's water. Kip on the Mainland has the terms."


static func premium_active(p: Dictionary) -> bool:
	if not Js.truthy(p.get("is_premium")):
		return false
	if not Js.truthy(p.get("premium_expires_at")):
		return true
	return Js.parse_ms(p.get("premium_expires_at")) > Clock.now_ms()


static func in_captains_water(p: Dictionary) -> bool:
	if p.get("is_admin") == true:
		return true
	return premium_active(p)


static func stamp_badges(existing: Variant, earned: Array) -> Dictionary:
	var map: Dictionary = Js.obj(existing).duplicate()
	var now: String = Js.iso(Clock.now_ms())
	for id: Variant in earned:
		if not map.has(id):
			map[id] = now
	return map


const PRESTIGE_ZONES: Array[String] = ["shallows", "open_waters", "deep", "abyss"]


static func has_prestiged_all_zones(prestige: Variant) -> bool:
	var p: Dictionary = Js.obj(prestige)
	for z: String in PRESTIGE_ZONES:
		if Js.num(p.get(z)) < 1:
			return false
	return true


# ── Golden fish (lib/shiny, lib/zoneRewards) ───────────────────────────────────

const SHINY_ODDS: float = 1000.0
const GOLDEN_BOOST_PER_WIPE: float = 0.10


static func roll_shiny(is_perfect: bool, sell_value: float, odds_mult: float) -> bool:
	if not is_perfect:
		return false
	if sell_value == 0.0:
		return false
	return Dice.next() * SHINY_ODDS < odds_mult


static func golden_boost_mult(wipes: float) -> float:
	return 1.0 + maxf(0.0, wipes) * GOLDEN_BOOST_PER_WIPE


# ── Fish size (lib/fishSize) ───────────────────────────────────────────────────

static func tier_for_length(length_in: float, min_in: float, max_in: float) -> String:
	if not (max_in > min_in) or is_inf(length_in) or is_nan(length_in):
		return ""
	var p: float = maxf(0.0, minf(1.0, (length_in - min_in) / (max_in - min_in)))
	if p < 0.20:
		return "tiny"
	if p < 0.50:
		return "small"
	if p < 0.82:
		return "average"
	if p < 0.97:
		return "large"
	return "trophy"


## rollFishSize: { lengthIn, tier, percentile }.
static func roll_fish_size(min_in: float, max_in: float) -> Dictionary:
	if not (max_in > min_in):
		return { "lengthIn": maxf(1.0, min_in if Js.truthy(min_in) else 1.0), "tier": "average", "percentile": 0.5 }
	var r: float = Dice.next()
	var tier: String
	var p_lo: float
	var p_hi: float
	if r < 0.10:
		tier = "tiny"; p_lo = 0.00; p_hi = 0.20
	elif r < 0.35:
		tier = "small"; p_lo = 0.20; p_hi = 0.50
	elif r < 0.82:
		tier = "average"; p_lo = 0.50; p_hi = 0.82
	elif r < 0.97:
		tier = "large"; p_lo = 0.82; p_hi = 0.97
	else:
		tier = "trophy"; p_lo = 0.97; p_hi = 1.00
	var span: float = max_in - min_in
	var p: float = p_lo + Dice.next() * (p_hi - p_lo)
	var step: float = 0.1 if span * 0.03 >= 0.2 else 0.01
	var length_in: float = _round2(_snap(min_in + p * span, min_in, max_in, step))
	var i: int = 0
	while i < 16 and tier_for_length(length_in, min_in, max_in) != tier:
		var cur: float = (length_in - min_in) / span
		length_in = _round2(_clamp(length_in + (step if cur < p_lo else -step), min_in, max_in))
		i += 1
	var percentile: float = maxf(0.0, minf(1.0, (length_in - min_in) / span))
	return { "lengthIn": length_in, "tier": tier, "percentile": percentile }


static func _clamp(x: float, lo: float, hi: float) -> float:
	return maxf(lo, minf(hi, x))


static func _snap(x: float, lo: float, hi: float, step: float) -> float:
	return Js.round(_clamp(x, lo, hi) / step) * step


static func _round2(x: float) -> float:
	return Js.round(x * 100.0) / 100.0
