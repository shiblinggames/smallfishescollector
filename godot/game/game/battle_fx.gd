class_name BattleFx
extends Node2D
## THE GUNS ON THE WATER (the battle's effects, in the sea's World so they
## sit in the same water as the hulls): a cannonball's arc from one hull to
## another with a puff of smoke and a flash at the muzzle; where it comes
## down, a white splash and rings in the sea's own field (a miss or a dodge)
## or a burst of splinters, fire and smoke on the hull (a hit; a crit bigger
## and brighter). All drawn here in the World's space, un-squashed for things
## standing out of the water (balls, smoke, splinters), flat for what lies on
## it (rings). shot() returns when the ball lands.

const GROUND: float = 0.58

var field: SeaField = null
var _balls: Array = []
var _bits: Array = []
var _puffs: Array = []
var _rings: Array = []
var _t: float = 0.0


func _process(delta: float) -> void:
	_t += delta
	for b: Dictionary in _balls:
		b["t"] = float(b["t"]) + delta
	_balls = _balls.filter(func(b: Dictionary) -> bool: return float(b["t"]) < float(b["dur"]) + 0.05)
	for p: Dictionary in _bits:
		p["t"] = float(p["t"]) + delta
		p["v"] = (p["v"] as Vector2) + Vector2(0, 520.0 * delta)
		p["p"] = (p["p"] as Vector2) + (p["v"] as Vector2) * delta
	_bits = _bits.filter(func(p: Dictionary) -> bool: return float(p["t"]) < float(p["life"]))
	for p: Dictionary in _puffs:
		p["t"] = float(p["t"]) + delta
	_puffs = _puffs.filter(func(p: Dictionary) -> bool: return float(p["t"]) < float(p["life"]))
	for r: Dictionary in _rings:
		r["t"] = float(r["t"]) + delta
	_rings = _rings.filter(func(r: Dictionary) -> bool: return float(r["t"]) < float(r["life"]))
	queue_redraw()


## A point of the World as drawn un-squashed (y times GROUND).
static func up(p: Vector2) -> Vector2:
	return Vector2(p.x, p.y * GROUND)


## A shot: `n` balls (a volley throws three) from `from` to `to` (World
## points at the waterline); `landing` is "hit", "crit", "miss" or "dodge".
func shot(from: Vector2, to: Vector2, landing: String, n: int = 1, big: bool = false) -> void:
	var dur: float = clampf(from.distance_to(to) / 1300.0, 0.38, 0.6)
	muzzle(from, to.x > from.x)
	Sound.cannon(n > 1)
	for k: int in n:
		var off: Vector2 = Vector2(randf_range(-26, 26), randf_range(-14, 14)) if n > 1 else Vector2.ZERO
		var aim: Vector2 = to + off
		if landing == "miss" or landing == "dodge":
			aim += Vector2(randf_range(-90, -50) * signf(to.x - from.x), randf_range(30, 60))
		_balls.append({ "a": from + Vector2(0, -30), "b": aim, "t": -0.09 * k, "dur": dur, "h": 140.0 + from.distance_to(to) * 0.12, "big": big })
	await get_tree().create_timer(dur + 0.09 * (n - 1)).timeout
	for k: int in n:
		var at: Vector2 = to + Vector2(randf_range(-20, 20), randf_range(-10, 10)) if n > 1 else to
		if landing == "miss" or landing == "dodge":
			splash(at + Vector2(-70.0 * signf(to.x - from.x), 40))
		else:
			burst(at, landing == "crit")


func muzzle(at: Vector2, right: bool) -> void:
	var mz: Vector2 = at + Vector2(60.0 * (1.0 if right else -1.0), -24)
	for k: int in 7:
		_puffs.append({ "p": mz + Vector2(randf_range(-10, 10), randf_range(-6, 6)), "v": Vector2(randf_range(10, 40) * (1.0 if right else -1.0), randf_range(-30, -10)), "t": 0.0, "life": 1.1 + randf() * 0.5, "r": 12.0 + randf() * 10.0, "c": Color(0.85, 0.85, 0.82) })
	_puffs.append({ "p": mz, "v": Vector2.ZERO, "t": 0.0, "life": 0.12, "r": 22.0, "c": Color(1.0, 0.8, 0.35), "flash": true })


func splash(at: Vector2) -> void:
	if field != null:
		field.ring(at, 110.0, 1.2, 0.8)
	_rings.append({ "p": at, "t": 0.0, "life": 1.0, "r": 60.0 })
	for k: int in 14:
		var a: float = -PI / 2.0 + randf_range(-0.7, 0.7)
		_bits.append({ "p": up(at), "v": Vector2.from_angle(a) * randf_range(140, 300), "t": 0.0, "life": 0.7, "r": randf_range(2.5, 5.0), "c": Color(0.92, 0.97, 1.0, 0.9) })
	Sound.plip()


func burst(at: Vector2, crit: bool) -> void:
	var n: int = 22 if crit else 12
	for k: int in n:
		var a: float = randf() * TAU
		_bits.append({ "p": up(at) + Vector2(0, -30), "v": Vector2.from_angle(a) * randf_range(120, 320 if crit else 220) + Vector2(0, -120), "t": 0.0, "life": 0.9, "r": randf_range(2.0, 4.5), "c": Color(0.55, 0.38, 0.2) if k % 3 else Color(1.0, 0.7, 0.3), "stick": true })
	for k: int in (8 if crit else 5):
		_puffs.append({ "p": up(at) + Vector2(randf_range(-20, 20), -40 + randf_range(-10, 10)), "v": Vector2(randf_range(-20, 20), randf_range(-50, -25)), "t": 0.0, "life": 1.4 + randf() * 0.6, "r": 16.0 + randf() * 12.0, "c": Color(0.35, 0.33, 0.32), "world": false })
	_puffs.append({ "p": up(at) + Vector2(0, -36), "v": Vector2.ZERO, "t": 0.0, "life": 0.18 if not crit else 0.28, "r": 46.0 if crit else 30.0, "c": Color(1.0, 0.75, 0.3), "flash": true, "world": false })
	if field != null:
		field.ring(at, 80.0, 0.9, 0.5)
	Sound.impact(crit)


func _draw() -> void:
	# On the water: splash rings (foreshortened by the World's squash).
	for r: Dictionary in _rings:
		var u: float = float(r["t"]) / float(r["life"])
		draw_arc(r["p"], float(r["r"]) * (0.4 + u), 0.0, TAU, 32, Color(1, 1, 1, 0.6 * (1.0 - u)), 3.0, true)
	# Standing up: everything else, drawn un-squashed.
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 1.0 / GROUND))
	for p: Dictionary in _puffs:
		var u: float = float(p["t"]) / float(p["life"])
		var pos: Vector2 = (p["p"] as Vector2) if p.get("world", true) == false else up(p["p"])
		pos += (p["v"] as Vector2) * float(p["t"])
		if p.get("flash", false):
			draw_circle(pos, float(p["r"]) * (1.0 + u), Color(p["c"], 0.85 * (1.0 - u)))
		else:
			draw_circle(pos, float(p["r"]) * (0.7 + 0.8 * u), Color(p["c"], 0.45 * (1.0 - u)))
	for b: Dictionary in _balls:
		var t: float = float(b["t"])
		if t < 0.0:
			continue
		var u: float = clampf(t / float(b["dur"]), 0.0, 1.0)
		var a: Vector2 = up(b["a"])
		var c: Vector2 = up(b["b"])
		var p: Vector2 = a.lerp(c, u) + Vector2(0, -sin(u * PI) * float(b["h"]))
		var prev: Vector2 = a.lerp(c, maxf(0.0, u - 0.06)) + Vector2(0, -sin(maxf(0.0, u - 0.06) * PI) * float(b["h"]))
		draw_line(prev, p, Color(0.9, 0.85, 0.75, 0.35), 3.0, true)
		draw_circle(p, 7.0 if b["big"] else 5.5, Color(0.12, 0.12, 0.13))
		draw_circle(p + Vector2(-1.5, -1.5), 2.0, Color(1, 1, 1, 0.35))
	for p: Dictionary in _bits:
		var u: float = float(p["t"]) / float(p["life"])
		draw_circle(p["p"], float(p["r"]) * (1.0 - u * 0.5), Color(p["c"], 1.0 - u))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
