class_name Vigil
extends RefCounted
## THE LONG VIGIL, a port of web/lib/ancientVigil (Godot port, stage 1).
##
## The six giants of the Ancient Deep, released and hunted again for ranks.
## The state is a dictionary keyed by the giant's id as text:
## { "144": { rank, released, paid? } }.

const ANCIENT_IDS: Array[float] = [144.0, 145.0, 146.0, 147.0, 148.0, 143.0]
const MAX_RANK: float = 5.0
const PET_ID: String = "plesiosaur_baby"
const HUNT_BASE: Dictionary = { 2: 0.15, 3: 0.12, 4: 0.10, 5: 0.08 }
const HUNT_CAP: float = 0.45
const LUMINOUS_RATIO: float = 0.75
const RANKUP_XP: Dictionary = { 2: 3000.0, 3: 4000.0, 4: 5500.0, 5: 7500.0 }
const LANDED_XP: float = 500.0
const FIRST_CATCH_XP: float = 7000.0


static func hunt_chance(attempting_rank: float, rarity_bonus: float, lure: String) -> float:
	var base: float = HUNT_BASE.get(int(attempting_rank), 0.0)
	if base == 0.0:
		return 0.0
	var lured: float = base * LUMINOUS_RATIO if lure == "luminous" else base
	return minf(HUNT_CAP, lured * (1.0 + maxf(0.0, rarity_bonus) * 1.5))


static func catch_xp(first_catch: bool, was_released: bool, from_rank: float, perfect: bool, paid_through: float) -> float:
	if first_catch:
		return FIRST_CATCH_XP
	if not was_released:
		return 0.0
	if perfect and from_rank < MAX_RANK:
		return float(RANKUP_XP.get(int(from_rank) + 1, 0.0))
	return LANDED_XP if from_rank > paid_through else 0.0


static func paid_after(was_released: bool, from_rank: float, perfect: bool, paid_through: float) -> float:
	var failed: bool = was_released and not (perfect and from_rank < MAX_RANK)
	return maxf(paid_through, from_rank) if failed else paid_through


static func read(raw: Variant) -> Dictionary:
	var out: Dictionary = {}
	if typeof(raw) != TYPE_DICTIONARY:
		return out
	for k: Variant in raw:
		var v: Variant = (raw as Dictionary)[k]
		if typeof(v) != TYPE_DICTIONARY:
			continue
		var e: Dictionary = v
		var rank_raw: float = floor(Js.num(Js.nz(e.get("rank"), 1.0)))
		var rank: float = maxf(1.0, minf(MAX_RANK, rank_raw if Js.truthy(rank_raw) else 1.0))
		var paid_raw: float = floor(Js.num(Js.nz(e.get("paid"), 0.0)))
		var paid: float = maxf(0.0, minf(MAX_RANK, paid_raw if Js.truthy(paid_raw) else 0.0))
		out[str(k)] = { "rank": rank, "released": e.get("released") == true, "paid": paid } if paid > 0 else { "rank": rank, "released": e.get("released") == true }
	return out


## vigilFor: the stored state, with rank 1 for every giant ever caught.
static func state_for(raw: Variant, ancient_catches: Variant) -> Dictionary:
	var out: Dictionary = read(raw)
	for id: Variant in Js.list(ancient_catches):
		if not out.has(Js.key(id)):
			out[Js.key(id)] = { "rank": 1.0, "released": false }
	return out


static func total(state: Dictionary) -> float:
	var s: float = 0.0
	for k: Variant in state:
		s += maxf(0.0, minf(MAX_RANK, float((state[k] as Dictionary)["rank"])))
	return s


static func complete(state: Dictionary) -> bool:
	for id: float in ANCIENT_IDS:
		if float(Js.nz((state.get(Js.key(id), {}) as Dictionary).get("rank"), 0.0)) < MAX_RANK:
			return false
	return true


static func is_released(state: Dictionary, fish_id: float) -> bool:
	return (state.get(Js.key(fish_id), {}) as Dictionary).get("released") == true


static func rank_of(state: Dictionary, fish_id: float) -> float:
	return float(Js.nz((state.get(Js.key(fish_id), {}) as Dictionary).get("rank"), 1.0))
