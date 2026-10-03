class_name BattleFx
extends Node2D
## THE GUNS ON THE WATER (the battle's effects, in the sea's World so they
## sit in the same water as the hulls). Kong, 2026-10-03: "make combat feel
## visceral ... cannons and volleys and megas all feel and look good ...
## good animations for all of them, including dodges and reloads". Every beat
## has an anticipation, an action and a follow-through, kept LOCAL (the hull
## that fires, the water it lands in; never the whole screen shaking):
##
##   A SHOT       the gun's flash cone and a bank of smoke rolling out along
##                the line of fire, a ring kicked up on the water; the ball
##                flies a high arc trailing smoke; where it comes down:
##   A HIT        a flash, splinters as tumbling shards, embers, smoke, a
##                ring on the water; a crit a gold shockwave and sparks.
##   A MISS       a column of water thrown up and falling back, rings.
##   A VOLLEY     three guns down the length of the hull, one after another.
##   THE RAILGUN  light gathering at the muzzle, then the lance (wavering,
##                burning out), a pierce flare through the target.
##   THE BARRAGE  four heavy shells in a rolling rhythm, each its own blow.
##   THE NUKE     one shell lobbed high and slow, then a white flash, a
##                mushroom of smoke and a shockwave over the water.
##   A RELOAD     a ball lifted and rammed home: a clunk of smoke at the port.
##   A SWERVE     a dodge: a curl of foam and spray where the hull leant away.
## Drawn here in the World's space: un-squashed for what stands out of the
## water (balls, smoke, shards), flat for what lies on it (rings, foam).

const GROUND: float = 0.58

var field: SeaField = null
var _balls: Array = []
var _bits: Array = []
var _puffs: Array = []
var _rings: Array = []
var _beams: Array = []
var _waves: Array = []
var _cones: Array = []
var _sparks: Array = []
var _t: float = 0.0
## A soft white glow (tinted as drawn): flashes fall off rather than sit flat.
var _glow: Texture2D = Glow.radial(128, Color.WHITE)


func _process(delta: float) -> void:
	_t += delta
	for b: Dictionary in _balls:
		b["t"] = float(b["t"]) + delta
		# Smoke left along the flight.
		if float(b["t"]) > 0.0 and float(b["t"]) < float(b["dur"]):
			b["smoke"] = float(b.get("smoke", 0.0)) + delta
			if float(b["smoke"]) > 0.035:
				b["smoke"] = 0.0
				_puffs.append({ "p": _ball_at(b), "v": Vector2(randf_range(-6, 6), randf_range(-14, -4)), "t": 0.0, "life": 0.55 + randf() * 0.3, "r": (5.0 if not b["big"] else 7.0) + randf() * 3.0, "c": Color(0.82, 0.8, 0.76), "world": false, "a": 0.32 })
	_balls = _balls.filter(func(b: Dictionary) -> bool: return float(b["t"]) < float(b["dur"]) + 0.05)
	for p: Dictionary in _bits:
		p["t"] = float(p["t"]) + delta
		p["v"] = (p["v"] as Vector2) + Vector2(0, float(p.get("g", 620.0)) * delta)
		p["p"] = (p["p"] as Vector2) + (p["v"] as Vector2) * delta
		p["rot"] = float(p.get("rot", 0.0)) + float(p.get("spin", 0.0)) * delta
	_bits = _bits.filter(func(p: Dictionary) -> bool: return float(p["t"]) < float(p["life"]))
	for p: Dictionary in _puffs:
		p["t"] = float(p["t"]) + delta
		# Smoke drags to a stop and keeps rising a little.
		var drag: float = exp(-delta * float(p.get("drag", 2.2)))
		p["v"] = (p["v"] as Vector2) * drag + Vector2(0, -6.0 * delta)
		p["p"] = (p["p"] as Vector2) + (p["v"] as Vector2) * delta
	_puffs = _puffs.filter(func(p: Dictionary) -> bool: return float(p["t"]) < float(p["life"]))
	for list: Array in [_rings, _waves, _cones, _sparks]:
		for r: Dictionary in list:
			r["t"] = float(r["t"]) + delta
	_rings = _rings.filter(func(r: Dictionary) -> bool: return float(r["t"]) < float(r["life"]))
	_waves = _waves.filter(func(w: Dictionary) -> bool: return float(w["t"]) < float(w["life"]))
	_cones = _cones.filter(func(c: Dictionary) -> bool: return float(c["t"]) < float(c["life"]))
	_sparks = _sparks.filter(func(c: Dictionary) -> bool: return float(c["t"]) < float(c["life"]))
	for bm: Dictionary in _beams:
		bm["t"] = float(bm["t"]) + delta
	_beams = _beams.filter(func(bm: Dictionary) -> bool: return float(bm["t"]) < float(bm.get("life", 0.9)))
	queue_redraw()


## A point of the World as drawn un-squashed (y times GROUND).
static func up(p: Vector2) -> Vector2:
	return Vector2(p.x, p.y * GROUND)


func _ball_at(b: Dictionary) -> Vector2:
	var u: float = clampf(float(b["t"]) / float(b["dur"]), 0.0, 1.0)
	return up(b["a"]).lerp(up(b["b"]), u) + Vector2(0, -sin(u * PI) * float(b["h"]))


func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


## A shot: `n` balls from `from` to `to` (World points at the waterline);
## `landing` is "hit", "crit", "miss" or "dodge". A volley's guns go off down
## the hull one after another. on_fire(k) as each gun fires (the hull's
## recoil), on_land(k) as each ball comes down. Returns when the last lands.
func shot(from: Vector2, to: Vector2, landing: String, n: int = 1, big: bool = false, on_fire: Callable = Callable(), on_land: Callable = Callable()) -> void:
	var dir: float = signf(to.x - from.x) if to.x != from.x else 1.0
	var dur: float = clampf(from.distance_to(to) / 1250.0, 0.42, 0.66)
	var gap: float = 0.13 if n > 1 else 0.0
	for k: int in n:
		# Guns down the length of the hull, stern to bow.
		var port: Vector2 = from + Vector2((k - (n - 1) / 2.0) * 46.0 * dir, 0)
		muzzle(port, dir > 0.0, big or n > 1)
		Sound.cannon(n > 1 and k == 0)
		if on_fire.is_valid():
			on_fire.call(k)
		var aim: Vector2 = to + (Vector2(randf_range(-30, 30), randf_range(-14, 14)) if n > 1 else Vector2.ZERO)
		if landing == "miss" or landing == "dodge":
			aim += Vector2(randf_range(-110, -60) * dir, randf_range(30, 70) * (1.0 if randf() < 0.5 else -1.0))
		_balls.append({ "a": port + Vector2(0, -30), "b": aim, "t": 0.0, "dur": dur, "h": 150.0 + from.distance_to(to) * 0.13, "big": big, "land": landing, "k": k })
		_land_later(aim, landing, dur, k, on_land)
		if gap > 0.0 and k < n - 1:
			await _wait(gap)
	await _wait(dur + 0.02)


func _land_later(at: Vector2, landing: String, dur: float, k: int, on_land: Callable) -> void:
	await _wait(dur)
	if landing == "miss" or landing == "dodge":
		splash(at)
	else:
		burst(at, landing == "crit")
	if on_land.is_valid():
		on_land.call(k)


## THE RAILGUN: light gathering at the muzzle, then the lance across the
## water, wavering and burning out; a pierce flare through the target.
func beam(from: Vector2, to: Vector2, col: Color, grazed: bool) -> void:
	var mz: Vector2 = up(from) + Vector2(56, -36)
	# The gather: motes drawn in to the muzzle, a growing glow.
	for k: int in 26:
		var a: float = randf() * TAU
		var d: float = randf_range(70, 150)
		_sparks.append({ "kind": "gather", "a": mz + Vector2.from_angle(a) * d, "b": mz, "t": -randf() * 0.18, "life": 0.42, "c": col.lightened(0.3) })
	_puffs.append({ "p": mz, "v": Vector2.ZERO, "t": 0.0, "life": 0.5, "r": 26.0, "c": col.lightened(0.4), "flash": true, "world": false, "grow": true })
	Sound.charge()
	await _wait(0.45)
	Sound.cannon(true)
	muzzle(from, to.x > from.x, true)
	var end: Vector2 = to + (Vector2(-70, 34) if grazed else Vector2.ZERO)
	_beams.append({ "a": from + Vector2(50, -34), "b": end, "t": 0.0, "c": col, "life": 0.85 })
	await _wait(0.08)
	burst(end, not grazed)
	# The pierce: a flare straight on through and out the far side.
	_sparks.append({ "kind": "streak", "a": up(end) + Vector2(0, -36), "v": Vector2(1, 0) * 900.0 * signf(to.x - from.x), "t": 0.0, "life": 0.35, "c": col.lightened(0.5) })
	for k: int in 10:
		_sparks.append({ "kind": "streak", "a": up(end) + Vector2(0, -36), "v": Vector2.from_angle(randf_range(-0.6, 0.6) + (0.0 if to.x > from.x else PI)) * randf_range(300, 700), "t": 0.0, "life": 0.3 + randf() * 0.2, "c": col.lightened(0.3) })
	if field != null:
		field.ring(end, 180.0, 1.0, 0.9)
	await _wait(0.25)


## THE BARRAGE: four heavy shells in a rolling rhythm.
func barrage(from: Vector2, to: Vector2, landing: String, on_fire: Callable = Callable(), on_land: Callable = Callable()) -> void:
	for k: int in 4:
		shot(from + Vector2(0, randf_range(-8, 8)), to + Vector2(randf_range(-50, 50), randf_range(-18, 18)), landing, 1, true, on_fire, on_land)
		await _wait(0.16)
	await _wait(0.7)


## THE NUKE: one shell lobbed high and slow, then the flash, the mushroom
## and the shockwave.
func nuke(from: Vector2, to: Vector2, lands: bool, on_fire: Callable = Callable()) -> void:
	muzzle(from, to.x > from.x, true)
	Sound.cannon(true)
	if on_fire.is_valid():
		on_fire.call(0)
	var b: Dictionary = { "a": from + Vector2(0, -30), "b": to, "t": 0.0, "dur": 1.05, "h": 520.0, "big": true, "glow": true }
	_balls.append(b)
	await _wait(1.05)
	if lands:
		blast(to)
	else:
		splash(to + Vector2(-90, 50))
	await _wait(0.5)


## THE NUKE'S BLOW: a white flash, a shockwave over the water, a column of
## smoke capped in a mushroom.
func blast(at: Vector2) -> void:
	var u: Vector2 = up(at)
	_puffs.append({ "p": u + Vector2(0, -60), "v": Vector2.ZERO, "t": 0.0, "life": 0.55, "r": 95.0, "c": Color(1.0, 0.85, 0.55), "flash": true, "world": false })
	_waves.append({ "p": at, "t": 0.0, "life": 1.4, "r": 560.0 })
	_waves.append({ "p": at, "t": -0.15, "life": 1.2, "r": 380.0 })
	# The stem, then the cap rolling outward.
	for k: int in 16:
		_puffs.append({ "p": u + Vector2(randf_range(-26, 26), -30 - k * 12.0), "v": Vector2(randf_range(-10, 10), randf_range(-70, -40)), "t": -k * 0.02, "life": 2.6 + randf(), "r": 22.0 + randf() * 14.0, "c": Color(0.3, 0.26, 0.24), "world": false, "drag": 1.2, "a": 0.6 })
	for k: int in 14:
		var a: float = -PI + PI * k / 13.0
		_puffs.append({ "p": u + Vector2(0, -230), "v": Vector2(cos(a) * 120.0, sin(a) * 40.0 - 30.0), "t": 0.05, "life": 2.8 + randf(), "r": 34.0 + randf() * 18.0, "c": Color(0.36, 0.3, 0.27), "world": false, "drag": 1.0, "a": 0.6 })
	for k: int in 36:
		var ang: float = randf() * TAU
		_bits.append({ "p": u + Vector2(0, -40), "v": Vector2.from_angle(ang) * randf_range(220, 560) + Vector2(0, -180), "t": 0.0, "life": 1.2, "r": randf_range(2.5, 5.5), "c": Color(1.0, 0.62, 0.22) if k % 2 else Color(0.5, 0.35, 0.2), "shard": k % 2 == 0, "spin": randf_range(-12, 12) })
	if field != null:
		for k: int in 3:
			field.ring(at, 280.0 + 170.0 * k, 1.7, 1.0)
	Sound.impact(true)
	Rumble.buzz([0, 90, 40, 120])


## A gun going off: the flash cone, a bank of smoke rolling out along the
## line of fire, sparks, a ring on the water at the port.
func muzzle(at: Vector2, right: bool, big: bool = false) -> void:
	var d: float = 1.0 if right else -1.0
	var mz: Vector2 = up(at) + Vector2(56.0 * d, -30)
	_cones.append({ "p": mz, "d": d, "t": 0.0, "life": 0.16 if not big else 0.2, "len": 96.0 if big else 72.0 })
	_puffs.append({ "p": mz + Vector2(10.0 * d, 0), "v": Vector2.ZERO, "t": 0.0, "life": 0.18, "r": 30.0 if big else 24.0, "c": Color(1.0, 0.8, 0.4), "flash": true, "world": false })
	for k: int in (14 if big else 10):
		_puffs.append({ "p": mz + Vector2(randf_range(0, 18) * d, randf_range(-8, 8)), "v": Vector2(randf_range(120, 320) * d, randf_range(-50, 14)), "t": 0.0, "life": 1.3 + randf() * 0.8, "r": 13.0 + randf() * 14.0, "c": Color(0.88, 0.87, 0.84), "world": false, "drag": 3.2, "a": 0.55 })
	for k: int in 6:
		_sparks.append({ "kind": "streak", "a": mz, "v": Vector2(randf_range(380, 620) * d, randf_range(-160, 120)), "t": 0.0, "life": 0.18 + randf() * 0.1, "c": Color(1.0, 0.8, 0.4) })
	if field != null:
		field.ring(at + Vector2(40.0 * d, 8), 70.0, 0.7, 0.35)


## A miss: a column of water thrown up and falling back, rings around it.
func splash(at: Vector2) -> void:
	if field != null:
		field.ring(at, 120.0, 1.3, 0.9)
	_rings.append({ "p": at, "t": 0.0, "life": 1.1, "r": 70.0 })
	_rings.append({ "p": at, "t": -0.12, "life": 1.0, "r": 45.0 })
	var u: Vector2 = up(at)
	for k: int in 22:
		var a: float = -PI / 2.0 + randf_range(-0.32, 0.32)
		_bits.append({ "p": u, "v": Vector2.from_angle(a) * randf_range(260, 520), "t": 0.0, "life": 0.95, "r": randf_range(2.5, 5.0), "c": Color(0.9, 0.96, 1.0, 0.9), "g": 900.0 })
	for k: int in 6:
		_puffs.append({ "p": u + Vector2(randf_range(-10, 10), -10), "v": Vector2(randf_range(-20, 20), randf_range(-240, -140)), "t": 0.0, "life": 0.8, "r": 12.0 + randf() * 8.0, "c": Color(0.92, 0.97, 1.0), "world": false, "drag": 3.5, "a": 0.55 })
	Sound.splash()


## A hit: a flash, splinters as tumbling shards, embers, smoke; a crit a gold
## shockwave and a spray of sparks.
func burst(at: Vector2, crit: bool) -> void:
	var u: Vector2 = up(at) + Vector2(0, -30)
	var n: int = 22 if crit else 13
	for k: int in n:
		var a: float = randf_range(-PI, 0.0)
		_bits.append({ "p": u, "v": Vector2.from_angle(a) * randf_range(140, 360 if crit else 240), "t": 0.0, "life": 1.0, "r": randf_range(3.0, 6.0), "c": Color(0.5, 0.34, 0.18) if k % 3 else Color(0.72, 0.52, 0.3), "shard": true, "spin": randf_range(-14, 14), "rot": randf() * TAU })
	for k: int in (10 if crit else 5):
		_bits.append({ "p": u, "v": Vector2.from_angle(randf_range(-PI, 0.0)) * randf_range(120, 300), "t": 0.0, "life": 0.7, "r": randf_range(1.5, 2.8), "c": Color(1.0, 0.72, 0.3), "g": 200.0 })
	for k: int in (8 if crit else 5):
		_puffs.append({ "p": u + Vector2(randf_range(-20, 20), randf_range(-10, 10)), "v": Vector2(randf_range(-30, 30), randf_range(-70, -30)), "t": 0.0, "life": 1.5 + randf() * 0.7, "r": 15.0 + randf() * 12.0, "c": Color(0.33, 0.31, 0.3), "world": false, "drag": 1.6, "a": 0.55 })
	_puffs.append({ "p": u, "v": Vector2.ZERO, "t": 0.0, "life": 0.2 if not crit else 0.3, "r": 50.0 if crit else 32.0, "c": Color(1.0, 0.78, 0.35), "flash": true, "world": false })
	if crit:
		_rings.append({ "p": at, "t": 0.0, "life": 0.6, "r": 150.0, "gold": true })
		for k: int in 12:
			_sparks.append({ "kind": "streak", "a": u, "v": Vector2.from_angle(randf() * TAU) * randf_range(400, 760), "t": 0.0, "life": 0.25 + randf() * 0.15, "c": Color(1.0, 0.88, 0.5) })
	if field != null:
		field.ring(at, 90.0, 1.0, 0.55)
	Sound.impact(crit)


## A reload: the ball lifted and rammed home, a clunk of smoke at the port.
func reload(at: Vector2, right: bool) -> void:
	var d: float = 1.0 if right else -1.0
	var port: Vector2 = up(at) + Vector2(40.0 * d, -34)
	_balls.append({ "a": at + Vector2(-10.0 * d, -10), "b": at + Vector2(40.0 * d, 0), "t": 0.0, "dur": 0.34, "h": 46.0, "big": false, "quiet": true })
	await _wait(0.34)
	for k: int in 5:
		_puffs.append({ "p": port + Vector2(randf_range(-6, 6), randf_range(-4, 4)), "v": Vector2(randf_range(20, 60) * d, randf_range(-30, -10)), "t": 0.0, "life": 0.7, "r": 6.0 + randf() * 5.0, "c": Color(0.86, 0.85, 0.82), "world": false, "drag": 3.0, "a": 0.45 })
	_sparks.append({ "kind": "glint", "a": port, "t": 0.0, "life": 0.3, "c": Color(1.0, 0.9, 0.6) })
	Sound.clunk()


## A dodge: a curl of foam and spray where the hull leant away.
func swerve(at: Vector2, dir: float) -> void:
	for k: int in 8:
		_rings.append({ "p": at + Vector2(-30.0 * k * dir * 0.3, 20.0 * k * dir), "t": -0.03 * k, "life": 0.8, "r": 34.0 + k * 4.0, "foam": true })
	var u: Vector2 = up(at)
	for k: int in 12:
		_bits.append({ "p": u + Vector2(randf_range(-30, 30), 0), "v": Vector2(randf_range(-80, 80), randf_range(-200, -90)), "t": 0.0, "life": 0.6, "r": randf_range(2.0, 4.0), "c": Color(0.9, 0.96, 1.0, 0.85), "g": 700.0 })
	if field != null:
		field.ring(at, 100.0, 1.0, 0.6)
	Sound.whoosh()


func _draw() -> void:
	# On the water: splash rings, foam curls, shockwaves (foreshortened).
	for r: Dictionary in _rings:
		if float(r["t"]) < 0.0:
			continue
		var u: float = float(r["t"]) / float(r["life"])
		var col: Color = Color(1.0, 0.85, 0.4, 0.8 * (1.0 - u)) if r.get("gold", false) else Color(1, 1, 1, (0.45 if r.get("foam", false) else 0.6) * (1.0 - u))
		draw_arc(r["p"], float(r["r"]) * (0.4 + u), 0.0, TAU, 40, col, (4.0 if r.get("gold", false) else 3.0) * (1.0 - u * 0.5), true)
	for w: Dictionary in _waves:
		if float(w["t"]) < 0.0:
			continue
		var u2: float = float(w["t"]) / float(w["life"])
		draw_arc(w["p"], float(w["r"]) * (0.1 + u2), 0.0, TAU, 72, Color(1.0, 0.88, 0.65, 0.75 * (1.0 - u2)), 9.0 * (1.0 - u2) + 1.0, true)
	# Standing up: everything else, drawn un-squashed.
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 1.0 / GROUND))
	for bm: Dictionary in _beams:
		var u3: float = float(bm["t"]) / float(bm.get("life", 0.9))
		var a2: Vector2 = up(bm["a"])
		var b2: Vector2 = up(bm["b"]) + Vector2(0, -30)
		var c: Color = bm["c"]
		var wid: float = 26.0 * (1.0 - u3) * (1.0 + 0.15 * sin(_t * 60.0))
		var pts: PackedVector2Array = PackedVector2Array()
		for k: int in 17:
			var f: float = k / 16.0
			pts.append(a2.lerp(b2, f) + Vector2(0, sin(f * 18.0 + _t * 40.0) * 3.0 * (1.0 - u3)))
		draw_polyline(pts, Color(c, 0.22 * (1.0 - u3)), wid * 2.4, true)
		draw_polyline(pts, Color(c.lightened(0.4), 0.85 * (1.0 - u3)), wid, true)
		draw_line(a2, b2, Color(1, 1, 1, 1.0 - u3), maxf(1.0, wid * 0.28), true)
	for c2: Dictionary in _cones:
		var uc: float = float(c2["t"]) / float(c2["life"])
		var p0: Vector2 = c2["p"]
		var d: float = c2["d"]
		var ln: float = float(c2["len"]) * (0.6 + 0.4 * uc)
		draw_colored_polygon(PackedVector2Array([p0 + Vector2(0, -14), p0 + Vector2(ln * 0.55 * d, -9), p0 + Vector2(ln * d, 0), p0 + Vector2(ln * 0.55 * d, 9), p0 + Vector2(0, 14)]), Color(1.0, 0.7, 0.3, 0.8 * (1.0 - uc)))
		draw_colored_polygon(PackedVector2Array([p0 + Vector2(0, -7), p0 + Vector2(ln * 0.75 * d, 0), p0 + Vector2(0, 7)]), Color(1.0, 0.97, 0.82, 1.0 - uc))
	for p: Dictionary in _puffs:
		if float(p["t"]) < 0.0:
			continue
		var u: float = float(p["t"]) / float(p["life"])
		var pos: Vector2 = (p["p"] as Vector2) if p.get("world", true) == false else up(p["p"])
		if p.get("flash", false):
			var rr: float = float(p["r"]) * ((0.3 + u) if p.get("grow", false) else (1.0 + 0.6 * u))
			var fa: float = 1.0 - u * u
			draw_texture_rect(_glow, Rect2(pos - Vector2(rr, rr) * 2.2, Vector2(rr, rr) * 4.4), false, Color(p["c"], 0.55 * fa))
			draw_texture_rect(_glow, Rect2(pos - Vector2(rr, rr), Vector2(rr, rr) * 2.0), false, Color(Color.WHITE.lerp(p["c"], 0.4), 0.95 * fa))
		else:
			draw_circle(pos, float(p["r"]) * (0.7 + 0.9 * u), Color(p["c"], float(p.get("a", 0.45)) * (1.0 - u)))
	for sp: Dictionary in _sparks:
		if float(sp["t"]) < 0.0:
			continue
		var us: float = float(sp["t"]) / float(sp["life"])
		match str(sp["kind"]):
			"streak":
				var a3: Vector2 = (sp["a"] as Vector2) + (sp["v"] as Vector2) * float(sp["t"])
				draw_line(a3, a3 - (sp["v"] as Vector2) * 0.035, Color(sp["c"], 1.0 - us), 2.0, true)
			"gather":
				var g: Vector2 = (sp["a"] as Vector2).lerp(sp["b"], smoothstep(0.0, 1.0, us))
				draw_circle(g, 2.6, Color(sp["c"], us))
			"glint":
				var s: float = 10.0 * (1.0 - us)
				draw_line(sp["a"] + Vector2(-s, 0), sp["a"] + Vector2(s, 0), Color(sp["c"], 1.0 - us), 2.0, true)
				draw_line(sp["a"] + Vector2(0, -s), sp["a"] + Vector2(0, s), Color(sp["c"], 1.0 - us), 2.0, true)
	for b: Dictionary in _balls:
		var t: float = float(b["t"])
		if t < 0.0:
			continue
		var p: Vector2 = _ball_at(b)
		var u4: float = clampf(t / float(b["dur"]), 0.0, 1.0)
		var prev: Vector2 = up(b["a"]).lerp(up(b["b"]), maxf(0.0, u4 - 0.08)) + Vector2(0, -sin(maxf(0.0, u4 - 0.08) * PI) * float(b["h"]))
		var r0: float = 9.0 if b["big"] else 7.0
		if b.get("glow", false):
			draw_circle(p, r0 * 3.2, Color(1.0, 0.6, 0.25, 0.25))
		if not b.get("quiet", false):
			draw_line(prev, p, Color(1.0, 0.92, 0.75, 0.35), r0 * 0.9, true)
		draw_circle(p, r0, Color(0.1, 0.1, 0.11))
		draw_circle(p + Vector2(-1.6, -1.6), r0 * 0.36, Color(1, 1, 1, 0.4))
	for q: Dictionary in _bits:
		var u5: float = float(q["t"]) / float(q["life"])
		var col: Color = Color(q["c"], (q["c"] as Color).a * (1.0 - u5 * u5))
		if q.get("shard", false):
			draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 1.0 / GROUND))
			var r1: float = float(q["r"])
			var rot: float = float(q.get("rot", 0.0))
			var c0: Vector2 = q["p"]
			var ax: Vector2 = Vector2.from_angle(rot) * r1 * 1.6
			var ay: Vector2 = Vector2.from_angle(rot + PI / 2.0) * r1 * 0.5
			draw_colored_polygon(PackedVector2Array([c0 + ax, c0 + ay, c0 - ax, c0 - ay]), col)
		else:
			draw_circle(q["p"], float(q["r"]) * (1.0 - u5 * 0.5), col)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
