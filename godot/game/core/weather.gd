class_name Weather
extends RefCounted
## THE WEATHER: FRONTS OVER THE WHOLE SEA (Kong, 2026-10-02, replacing the
## web's squalls in the port: "weather impacts almost the full map as it rolls
## out, and lasts 12 to 24 minutes"; the small squalls are gone).
##
## Time is cut into 36-minute slots and each slot may bring one front, rolled
## from the slot alone, so every captain (and every crewmate in a Charter)
## sees the same sky. A front comes in from one side of the chart and sweeps
## across it in four minutes; any one stretch of water is under it for 12 to
## 24 minutes, then it clears the same way, the trailing edge following the
## leading one. Between fronts the weather is fair.
##
## The kinds: three storms (a Rain Squall, a Gale, a Tempest), each heavier
## than the last; Fog; and a Fair Wind that blows the way the front travels.
## A front changes how the sea looks and how a hull sails, and (through
## core/fish_bias.gd) which fish of a rarity bite best; never the rarity odds,
## crates or prices.
##
## The forecast (the Storm Glass and Sky Reader skills) reads these same rolls
## ahead of time.

const SLOT_MS: float = 36.0 * 60000.0
const SWEEP_MS: float = 4.0 * 60000.0
const MIN_MS: float = 12.0 * 60000.0
const MAX_MS: float = 24.0 * 60000.0
## How wide the front's edge is, in world pixels: the weather builds over it.
const EDGE: float = 1600.0
const U32: int = 0xFFFFFFFF

## Each kind: its name, its weight among the slots, what it does to her top
## speed and her turning (multipliers, at its heart), and how heavy its rain
## and how dark its cloud (0 to 1). "clear" is a slot with no front.
const KINDS: Dictionary = {
	"clear": { "name": "Fair weather", "w": 20 },
	"squall": { "name": "Rain Squall", "w": 24, "speed": 0.90, "turn": 0.95, "rain": 0.55, "cloud": 0.6 },
	"gale": { "name": "Gale", "w": 14, "speed": 0.82, "turn": 0.85, "rain": 0.8, "cloud": 0.82 },
	"tempest": { "name": "Tempest", "w": 7, "speed": 0.75, "turn": 0.75, "rain": 1.0, "cloud": 1.0, "lightning": true },
	"fog": { "name": "Fog", "w": 16, "fog": 1.0 },
	"wind": { "name": "Fair Wind", "w": 19, "wind": 0.12 },
}
const ORDER: Array = ["clear", "squall", "gale", "tempest", "fog", "wind"]


## seaHotspots' hash, with JavaScript's arithmetic (as the squalls had it).
static func _hash(a: int, b: int) -> int:
	var h: int = (Explore.to_u32(float(a) * float(0x27d4eb2d)) ^ Explore.to_u32(float(b) * float(0x165667b1)) ^ 0x9e3779b9) & U32
	h = Dice.imul(h ^ (h >> 15), 0x2c1b3c6d)
	h = Dice.imul(h ^ (h >> 12), 0x297a2d39)
	return (h ^ (h >> 15)) & U32


static func _unit(h: int) -> float:
	return float(h % 100000) / 100000.0


## The middle of the chart and how far a front's edge travels either side of
## it (past every corner).
static func centre() -> Vector2:
	return Vector2(0.0, (Explore._outer() + Explore.NORTH_WALL) / 2.0)


static func reach() -> float:
	return Explore._outer() * 1.3


static var _cache: Dictionary = {}


## The front of slot k, or {} for a fair slot. { kind, name, slot, start
## (when its edge first touches the chart), dur (how long any water is under
## it), dir (the way it travels, a unit vector), from (the side it comes from,
## in words), ends (when the last water clears) }.
static func front(k: int) -> Dictionary:
	if _cache.has(k):
		return _cache[k]
	var h: int = _hash(k, 0x5eaf)
	var total: int = 0
	for id: String in ORDER:
		total += int(KINDS[id]["w"])
	var pick: float = _unit(h) * total
	var kind: String = "clear"
	for id: String in ORDER:
		pick -= float(KINDS[id]["w"])
		if pick < 0.0:
			kind = id
			break
	var out: Dictionary = {}
	if kind != "clear":
		var h2: int = _hash(h, 0x2f1b)
		var h3: int = _hash(h2, 0x77a3)
		var h4: int = _hash(h3, 0x1b9d)
		var dur: float = MIN_MS + _unit(h2) * (MAX_MS - MIN_MS)
		var start: float = float(k) * SLOT_MS + _unit(h3) * maxf(0.0, SLOT_MS - dur - SWEEP_MS)
		var ang: float = _unit(h4) * TAU
		var dir: Vector2 = Vector2.from_angle(ang)
		out = { "kind": kind, "name": KINDS[kind]["name"], "slot": k, "start": start, "dur": dur, "dir": dir,
			"from": side_of(-dir), "ends": start + dur + SWEEP_MS }
	if _cache.size() > 64:
		_cache.clear()
	_cache[k] = out
	return out


## "the west", "the north-east"... for a direction on the chart (y is south).
static func side_of(v: Vector2) -> String:
	var names: Array = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"]
	return "the " + names[int(round(fposmod(v.angle(), TAU) / (TAU / 8.0))) % 8]


## Where the front's two edges are now, along its direction from the chart's
## middle: water between them is under it. [lead, trail].
static func edges(f: Dictionary, now: float) -> Vector2:
	var span: float = reach() * 2.0
	var lead: float = -reach() + (now - float(f["start"])) / SWEEP_MS * span
	var trail: float = -reach() + (now - float(f["start"]) - float(f["dur"])) / SWEEP_MS * span
	return Vector2(lead, trail)


## The front over the sea now (the newest one still on the chart), or {}.
static func current(now: float) -> Dictionary:
	var k: int = int(floor(now / SLOT_MS))
	for kk: int in [k, k - 1]:
		var f: Dictionary = front(kk)
		if not f.is_empty() and now >= float(f["start"]) and now < float(f["ends"]):
			return f
	return {}


## How far under the front this water is, 0 to 1 (the edge builds over EDGE).
static func depth(f: Dictionary, at: Vector2, now: float) -> float:
	if f.is_empty():
		return 0.0
	var e: Vector2 = edges(f, now)
	var s: float = (at - centre()).dot(f["dir"])
	return clampf((e.x - s) / EDGE, 0.0, 1.0) * clampf((s - e.y) / EDGE, 0.0, 1.0)


## When the front reaches this water and when it leaves it (ms).
static func passage(f: Dictionary, at: Vector2) -> Vector2:
	var s: float = (at - centre()).dot(f["dir"])
	var arrive: float = float(f["start"]) + (s + reach()) / (reach() * 2.0) * SWEEP_MS
	return Vector2(arrive, arrive + float(f["dur"]))


## The fronts still to come after now, soonest first (up to n).
static func ahead(now: float, n: int) -> Array:
	var out: Array = []
	var k: int = int(floor(now / SLOT_MS))
	for kk: int in range(k, k + 12):
		var f: Dictionary = front(kk)
		if not f.is_empty() and float(f["start"]) > now:
			out.append(f)
			if out.size() >= n:
				break
	return out


## What the weather does to a hull here, now: { speed, turn, rain, cloud, fog,
## lightning, cue }. speed takes her heading, for the wind.
static func effect(at: Vector2, now: float, heading: float) -> Dictionary:
	var f: Dictionary = current(now)
	var k: float = depth(f, at, now)
	var out: Dictionary = { "speed": 1.0, "turn": 1.0, "rain": 0.0, "cloud": 0.0, "fog": 0.0, "lightning": false, "cue": "", "k": k, "front": f }
	if k <= 0.0:
		return out
	var d: Dictionary = KINDS[f["kind"]]
	out["speed"] = lerpf(1.0, float(d.get("speed", 1.0)), k)
	out["turn"] = lerpf(1.0, float(d.get("turn", 1.0)), k)
	out["rain"] = float(d.get("rain", 0.0)) * k
	out["cloud"] = float(d.get("cloud", 0.0)) * k
	out["fog"] = float(d.get("fog", 0.0)) * k
	out["lightning"] = d.get("lightning", false) == true and k > 0.5
	if d.has("wind"):
		# With the wind she runs faster, against it slower, across it as she is.
		var along: float = cos(heading - (f["dir"] as Vector2).angle())
		out["speed"] = 1.0 + float(d["wind"]) * along * k
	if k > 0.3:
		if d.has("wind"):
			var along2: float = cos(heading - (f["dir"] as Vector2).angle())
			out["cue"] = "Fair wind behind you" if along2 > 0.5 else ("Sailing into the wind" if along2 < -0.5 else "Wind across the bow")
		elif d.has("fog"):
			out["cue"] = "Fog"
		else:
			out["cue"] = "%s: %d%% slower" % [f["name"], int(round((1.0 - float(d["speed"])) * 100.0))]
	return out


## Minutes, in words: "9m", "1h 4m".
static func mins(ms: float) -> String:
	var m: int = maxi(1, int(ceil(ms / 60000.0)))
	return "%dm" % m if m < 60 else "%dh %dm" % [m / 60, m % 60]
