class_name Chart
extends RefCounted
## THE CHART'S SHAPE, from web/app/(app)/sea/chart.ts (Godot port, stage 1).
##
## The Mainland is the origin and the five fishing waters are bands fanning
## south from it (docs/systems/ocean-hub.md). World units are the web's pixels;
## the plane is squashed by GROUND on screen so it reads as a surface you look
## across, and anything with height is counter-squashed.

const GROUND: float = 0.58
const HOME: Vector2 = Vector2(260, 560)
## The Mainland (chart.ts PLACES 'mainland'): r 500, its painted plate 2r wide
## with the island's centre 42% of the way down it, and one painted town
## standing on it, its feet 47% across and 77% down the island's box.
const MAINLAND_R: float = 500.0
const PLATE_WATER: float = 0.42
const TOWN_FEET: Vector2 = Vector2(47.0, 77.0)
const TOWN_SCALE: float = 0.86
## The hull stops at r x SHORE + HULL from an island's centre (SeaMap.tsx).
const SHORE: float = 0.72
const HULL: float = 55.0
## The Mainland's berth (berthOf with its override): where you tie up. HOME
## sits inside it, so a fresh session opens with the dock prompt up.
const BERTH_AT: Vector2 = Vector2(425, 400)
const BERTH_R: float = 440.0
## How near a boat must be to hail someone on the water.
const HAIL_RANGE: float = 260.0


static func in_berth(p: Vector2) -> bool:
	return p.distance_to(BERTH_AT) < BERTH_R


## The buyer out in each water (chart.ts RESIDENTS): where they moor, their
## rate, their line and their look, from the rules.
static func residents() -> Array:
	return Rules.data()["residents"]


## roamR x 0.6: how far a buyer drifts from their mooring, kept clear of the
## band's edges.
static func drift_r(at: Vector2, zone_id: String) -> float:
	for w: Dictionary in WATERS:
		if w["id"] == zone_id:
			var r: float = at.length()
			var slack: float = minf(r - float(w["inner"]), float(w["outer"]) - r)
			return clampf(slack - 180.0, 140.0, 520.0) * 0.6
	return 240.0 * 0.6

## The five waters, inside out. `sea` is the palette: deep, middle, lit.
const WATERS: Array[Dictionary] = [
	{ "id": "shallows", "name": "The Shallows", "blurb": "Calm water, common fish", "inner": 1400.0, "outer": 3800.0, "sea": ["#123139", "#2a6165", "#60b9af"] },
	{ "id": "open_waters", "name": "Open Waters", "blurb": "Further out, better catches", "inner": 3800.0, "outer": 6900.0, "sea": ["#0e2937", "#244f64", "#4c8fb4"] },
	{ "id": "deep", "name": "The Deep", "blurb": "Long waits, real weight", "inner": 6900.0, "outer": 10900.0, "sea": ["#0a1e2d", "#183c55", "#3a6b91"] },
	{ "id": "abyss", "name": "The Abyss", "blurb": "Where the dark begins", "inner": 10900.0, "outer": 16000.0, "sea": ["#060f1b", "#10263a", "#254660"] },
	{ "id": "ancient_deep", "name": "The Ancient Deep", "blurb": "Giants, and worse", "inner": 16000.0, "outer": 22600.0, "sea": ["#07101a", "#16202f", "#31363f"] },
]
const OPEN_SEA: Array[String] = ["#0b1a24", "#1c3a48", "#4a6f7d"]
const LAST_OUTER: float = 22600.0
const SHELF: Vector2 = Vector2(1400.0, 22600.0)


## The water this point is in, or {} on no fishing water.
static func water_at(p: Vector2) -> Dictionary:
	if p.y <= 0:
		return {}
	var r: float = p.length()
	for w: Dictionary in WATERS:
		if r >= float(w["inner"]) and r < float(w["outer"]):
			return w
	return {}


## seaAt: the three stops (deep, middle, lit) for this position and this hour,
## blended across the bands so no edge is ever visible, and pulled toward cold
## blue-black at night.
static func sea_at(p: Vector2, darkness: float) -> Array[Color]:
	var w_sum: float = 0.18
	var acc: Array[Color] = []
	for k: int in 3:
		acc.append(Color(OPEN_SEA[k]) * 0.18)
	var r: float = minf(p.length(), LAST_OUTER)
	var south: float = 1.0 if p.y > 0 else maxf(0.0, 1.0 + p.y / 700.0)
	for w: Dictionary in WATERS:
		var mid: float = (float(w["inner"]) + float(w["outer"])) / 2.0
		var half: float = maxf(1.0, (float(w["outer"]) - float(w["inner"])) / 2.0)
		var d: float = absf(r - mid) / half
		var d2: float = d * d
		var weight: float = south / (1.0 + d2 * d2)
		w_sum += weight
		for k: int in 3:
			acc[k] += Color((w["sea"] as Array)[k]) * weight
	var out: Array[Color] = []
	var night: Color = Color8(6, 11, 22)
	for k: int in 3:
		var c: Color = acc[k] / w_sum
		c.a = 1.0
		out.append(c.lerp(night, darkness * 0.78))
	return out
