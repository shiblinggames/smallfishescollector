class_name Weather
extends RefCounted
## THE SQUALLS, a port of the fishing sea's half of lib/seaWeather.ts (the
## tempests and bay weather belong to the expedition sea, not yet ported).
##
## Up to two squalls a 14-minute window, rolled from the window alone so every
## captain (and every crewmate in a Charter) sees the same storm in the same
## place: south of the harbour, 2,200 to 4,100 across, drifting 1.5 to 4.5px a
## second. Weather pays nothing and changes no roll; it is how the sea looks
## and how a hull rides.

const WINDOW_MS: float = 14.0 * 60000.0
const COUNT: int = 2
const OUTER_EDGE: float = 22600.0
const U32: int = 0xFFFFFFFF


## seaHotspots' hash, with JavaScript's arithmetic: the first products are
## doubles (a chained hash runs past 2^53 and rounds) taken to int32.
static func _hash(a: int, b: int) -> int:
	var h: int = (Explore.to_u32(float(a) * float(0x27d4eb2d)) ^ Explore.to_u32(float(b) * float(0x165667b1)) ^ 0x9e3779b9) & U32
	h = Dice.imul(h ^ (h >> 15), 0x2c1b3c6d)
	h = Dice.imul(h ^ (h >> 12), 0x297a2d39)
	return (h ^ (h >> 15)) & U32


static func _unit(h: int) -> float:
	return float(h % 100000) / 100000.0


static var _cache_win: int = -1
static var _cache: Array = []


static func squalls(now: float) -> Array:
	var win: int = int(floor(now / WINDOW_MS))
	if win == _cache_win:
		return _cache
	_cache_win = win
	_cache = []
	for i: int in COUNT:
		var h: int = _hash(win, i * 0x9e37 + 0x51ed)
		if _unit(h) > 0.62:
			continue
		var h2: int = _hash(h, 0x2f1b)
		var h3: int = _hash(h2, 0x77a3)
		var h4: int = _hash(h3, 0x1b9d)
		var h5: int = _hash(h4, 0x5c31)
		var ang: float = _unit(h2) * PI
		var rad: float = (0.32 + _unit(h3) * 0.62) * OUTER_EDGE
		var x: float = cos(ang) * rad
		var y: float = absf(sin(ang)) * rad
		if y < 900.0:
			continue
		var speed: float = 1.5 + _unit(h5) * 3.0
		var dir: float = _unit(_hash(h5, 0x33af)) * TAU
		_cache.append({
			"key": "%d:%d" % [win, i], "x": x, "y": y, "r": 2200.0 + _unit(_hash(h5, 0x77c1)) * 1900.0,
			"power": 0.55 + _unit(h4) * 0.45, "vx": cos(dir) * speed, "vy": sin(dir) * speed,
			"endsAt": float(win + 1) * WINDOW_MS,
		})
	return _cache


static func pos(s: Dictionary, now: float) -> Vector2:
	var into: float = (now - (float(s["endsAt"]) - WINDOW_MS)) / 1000.0
	var x: float = float(s["x"]) + float(s["vx"]) * into
	var y: float = float(s["y"]) + float(s["vy"]) * into
	var keep: float = OUTER_EDGE - float(s["r"]) * 0.5
	var r: float = sqrt(x * x + y * y)
	if r > keep:
		x = x / r * keep
		y = y / r * keep
	return Vector2(x, maxf(1200.0, y))


## How deep in a squall this point is (0 outside, its power at the heart).
static func deep_at(x: float, y: float, now: float) -> float:
	var best: float = 0.0
	for s: Dictionary in squalls(now):
		var at: Vector2 = pos(s, now)
		var d: float = Vector2(x, y).distance_to(at)
		if d > float(s["r"]):
			continue
		var k: float = 1.0 - maxf(0.0, (d - float(s["r"]) * 0.35) / (float(s["r"]) * 0.65))
		best = maxf(best, clampf(k, 0.0, 1.0) * float(s["power"]))
	return best
