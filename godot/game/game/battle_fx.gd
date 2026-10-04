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
## PARTICLES, never painted art (Kong, 2026-10-04): flashes, embers, flames,
## sparks, ice slivers, mist and spray are particle shapes (FxSheet); the
## additive ones (light) on a child layer.

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
const LIGHT: Array = FxSheet.LIGHT
## Particles: { k, p (un-squashed), v, t, life, s0, s1 (px across),
## rot, spin, c, a, g, drag }.
var _paint: Array = []
var _add: Node2D
## Standing links between two hulls (a pack's combo), set by the stage each
## frame: [[World a, World b, colour]]; drawn as motes running along a sag
## between them.
var links: Array = []
## Standing light for a while (a summon's sigil on the water, an aureole, glyph
## rings, a reticle, lightning): { kind, p, t, life, c, big, pts }.
var _marks: Array = []


func _ready() -> void:
	_add = Node2D.new()
	var m: CanvasItemMaterial = CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_add.material = m
	_add.draw.connect(_draw_light)
	add_child(_add)


## One particle. `at` is un-squashed (BattleFx.up of a World point,
## then lifted); `size` the width in px at birth, `grow` its width at death.
func paint(k: String, at: Vector2, v: Vector2, life: float, size: float, grow: float = -1.0, c: Color = Color.WHITE, opts: Dictionary = {}) -> void:
	var p: Dictionary = { "k": k, "p": at, "v": v, "t": float(opts.get("delay", 0.0)) * -1.0, "life": life, "s0": size, "s1": size if grow < 0.0 else grow,
		"rot": float(opts.get("rot", randf() * TAU)), "spin": float(opts.get("spin", randf_range(-1.2, 1.2))), "c": c, "a": float(opts.get("a", 1.0)),
		"g": float(opts.get("g", 0.0)), "drag": float(opts.get("drag", 0.0)), "fade": float(opts.get("fade", 0.6)), "in": float(opts.get("in", 0.08)) }
	_paint.append(p)


func _process(delta: float) -> void:
	_t += delta
	for pp: Dictionary in _paint:
		pp["t"] = float(pp["t"]) + delta
		if float(pp["t"]) < 0.0:
			continue
		if float(pp["drag"]) > 0.0:
			pp["v"] = (pp["v"] as Vector2) * exp(-delta * float(pp["drag"]))
		pp["v"] = (pp["v"] as Vector2) + Vector2(0, float(pp["g"]) * delta)
		pp["p"] = (pp["p"] as Vector2) + (pp["v"] as Vector2) * delta
		pp["rot"] = float(pp["rot"]) + float(pp["spin"]) * delta
	_paint = _paint.filter(func(pp: Dictionary) -> bool: return float(pp["t"]) < float(pp["life"]))
	if _add != null:
		_add.queue_redraw()
	for b: Dictionary in _balls:
		b["t"] = float(b["t"]) + delta
		# Smoke left along the flight.
		if float(b["t"]) > 0.0 and float(b["t"]) < float(b["dur"]):
			b["smoke"] = float(b.get("smoke", 0.0)) + delta
			if float(b["smoke"]) > 0.016:
				b["smoke"] = 0.0
				_puffs.append({ "p": _ball_at(b), "v": Vector2(randf_range(-4, 4), randf_range(-10, -3)), "t": 0.0, "life": 0.45 + randf() * 0.25, "r": (3.0 if not b["big"] else 4.5) + randf() * 1.5, "c": Color(0.82, 0.8, 0.76), "world": false, "a": 0.22 })
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
	for mk: Dictionary in _marks:
		mk["t"] = float(mk["t"]) + delta
	_marks = _marks.filter(func(mk: Dictionary) -> bool: return float(mk["t"]) < float(mk["life"]))
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
	paint("fireball", u + Vector2(0, -80), Vector2(0, -30), 1.0, 120.0, 260.0, Color(1.0, 0.85, 0.7), { "fade": 0.35, "spin": 0.3 })
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
	paint("splash", u + Vector2(0, -40), Vector2.ZERO, 0.75, 70.0, 120.0, Color(0.95, 0.98, 1.0, 0.95), { "rot": 0.0, "spin": 0.0, "fade": 0.4 })
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
		_bits.append({ "p": u, "v": Vector2.from_angle(randf_range(-PI, 0.0)) * randf_range(120, 300), "t": 0.0, "life": 0.7, "r": randf_range(1.5, 2.8), "c": Color(1.0, 0.72, 0.3), "g": 200.0, "ember": true, "rot": randf() * TAU })
	for k: int in (8 if crit else 5):
		_puffs.append({ "p": u + Vector2(randf_range(-20, 20), randf_range(-10, 10)), "v": Vector2(randf_range(-30, 30), randf_range(-70, -30)), "t": 0.0, "life": 1.5 + randf() * 0.7, "r": 15.0 + randf() * 12.0, "c": Color(0.33, 0.31, 0.3), "world": false, "drag": 1.6, "a": 0.55 })
	_puffs.append({ "p": u, "v": Vector2.ZERO, "t": 0.0, "life": 0.2 if not crit else 0.3, "r": 50.0 if crit else 32.0, "c": Color(1.0, 0.78, 0.35), "flash": true, "world": false })
	paint("flame", u + Vector2(0, -6), Vector2(0, -40), 0.45, 40.0 if not crit else 60.0, 80.0 if not crit else 120.0, Color(1.0, 0.75, 0.45), { "spin": 0.0, "rot": 0.0, "fade": 0.3 })
	if crit:
		for k2: int in 5:
			paint("spark", u, Vector2.from_angle(randf_range(-PI, 0.0)) * randf_range(160, 300), 0.5, 34.0, 10.0, Color(1.0, 0.9, 0.55), { "drag": 3.0, "spin": randf_range(-6, 6) })
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
	# A summon's sigil on the water: two rune rings turning opposite ways.
	for mk: Dictionary in _marks:
		if str(mk["kind"]) != "sigil" or float(mk["t"]) < 0.0:
			continue
		var su: float = float(mk["t"]) / float(mk["life"])
		var sa: float = minf(1.0, su * 6.0) * (1.0 - smoothstep(0.7, 1.0, su))
		var sr: float = 150.0 * float(mk["big"]) * (0.7 + 0.3 * minf(1.0, su * 4.0))
		for ring: Array in [[sr, 1.2, 40], [sr * 0.72, -1.6, 28]]:
			for k: int in int(ring[2]):
				var an: float = float(mk["t"]) * float(ring[1]) + TAU * k / float(ring[2])
				var on: bool = k % 5 == 0
				draw_circle(mk["p"] + Vector2(cos(an), sin(an)) * float(ring[0]), 4.0 if on else 2.0, Color(mk["c"], sa * (0.95 if on else 0.55)))
		draw_arc(mk["p"], sr * 1.08, 0.0, TAU, 64, Color(mk["c"], sa * 0.35), 2.0, true)
	# Standing up: everything else, drawn un-squashed.
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 1.0 / GROUND))
	for bm: Dictionary in _beams:
		var u3: float = float(bm["t"]) / float(bm.get("life", 0.9))
		var a2: Vector2 = up(bm["a"])
		var b2: Vector2 = up(bm["b"]) + Vector2(0, -30)
		var c: Color = bm["c"]
		var wid: float = (8.0 if bm.get("thin", false) else 26.0) * (1.0 - u3) * (1.0 + 0.15 * sin(_t * 60.0))
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
			continue
		# A soft puff: denser at its heart, falling off at the edge.
		var rr2: float = float(p["r"]) * (0.6 + 0.9 * u) * 1.3
		var sc: Color = (p["c"] as Color).darkened(0.28)
		draw_texture_rect(_glow, Rect2(pos - Vector2(rr2, rr2), Vector2(rr2, rr2) * 2.0), false, Color(sc, float(p.get("a", 0.45)) * 1.15 * pow(1.0 - u, 1.4) * minf(1.0, u * 10.0 + 0.3)))
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
		elif q.get("ember", false):
			continue
		else:
			draw_circle(q["p"], float(q["r"]) * (1.0 - u5 * 0.5), col)
	# A combo's link between its two hulls: amber motes running along a sag.
	for ln: Array in links:
		var a0: Vector2 = up(ln[0]) + Vector2(0, -70)
		var b0: Vector2 = up(ln[1]) + Vector2(0, -70)
		var mid: Vector2 = (a0 + b0) / 2.0 + Vector2(0, 50.0)
		for k: int in 14:
			var f: float = fposmod(k / 14.0 + _t * 0.18, 1.0)
			var q: Vector2 = a0.lerp(mid, f).lerp(mid.lerp(b0, f), f)
			var fade: float = sin(f * PI)
			draw_circle(q, 2.4, Color(ln[2], 0.75 * fade))
	# The particles that are not light.
	for pp: Dictionary in _paint:
		if not LIGHT.has(pp["k"]) and float(pp["t"]) >= 0.0:
			_paint_one(self, pp)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## The light: flashes, embers, flames, sparks and fireballs, added.
func _draw_light() -> void:
	for p: Dictionary in _puffs:
		if not p.get("flash", false) or float(p["t"]) < 0.0:
			continue
		var u: float = float(p["t"]) / float(p["life"])
		var pos: Vector2 = (p["p"] as Vector2) if p.get("world", true) == false else up(p["p"])
		var rr: float = float(p["r"]) * ((0.3 + u) if p.get("grow", false) else (1.0 + 0.6 * u))
		var fa: float = 1.0 - u * u
		if not p.has("rot"):
			p["rot"] = randf() * TAU
		_sprite(_add, "flash", pos, rr * 2.2, float(p["rot"]), Color(Color.WHITE.lerp(p["c"], 0.6), fa * 0.85))
	for q: Dictionary in _bits:
		if q.get("ember", false):
			var u5: float = float(q["t"]) / float(q["life"])
			_sprite(_add, "ember", q["p"], float(q["r"]) * 7.0 * (1.0 - u5 * 0.4), float(q.get("rot", 0.0)), Color(q["c"], 1.0 - u5 * u5))
	for pp: Dictionary in _paint:
		if LIGHT.has(pp["k"]) and float(pp["t"]) >= 0.0:
			_paint_one(_add, pp)
	_draw_marks()


## The standing light a strike leaves for a moment (on the light layer).
func _draw_marks() -> void:
	var gt: Transform2D = Transform2D(0.0, Vector2(1.0, 1.0 / GROUND), 0.0, Vector2.ZERO)
	_add.draw_set_transform_matrix(gt)
	for mk: Dictionary in _marks:
		if float(mk["t"]) < 0.0:
			continue
		var u: float = float(mk["t"]) / float(mk["life"])
		var a: float = minf(1.0, u * 8.0) * (1.0 - smoothstep(0.6, 1.0, u))
		var c: Color = mk["c"]
		var p: Vector2 = up(mk["p"]) + Vector2(0, -70)
		match str(mk["kind"]):
			"aureole":
				# Rays of gilded light turning round the ship.
				var n: int = 16 if mk["big"] > 1.0 else 12
				for k: int in n:
					var an: float = float(mk["t"]) * 0.6 + TAU * k / n
					var l: float = (150.0 + 30.0 * sin(float(mk["t"]) * 4.0 + k)) * float(mk["big"])
					_add.draw_colored_polygon(PackedVector2Array([p + Vector2.from_angle(an) * 40.0, p + Vector2.from_angle(an - 0.06) * l, p + Vector2.from_angle(an + 0.06) * l]), Color(c, 0.35 * a))
				_add.draw_texture_rect(_glow, Rect2(p - Vector2(90, 90), Vector2(180, 180)), false, Color(c, 0.5 * a))
			"glyphs":
				# Two glyph rings turning opposite ways over the ship.
				for ring: Array in [[110.0, 1.0, 24], [76.0, -1.4, 16]]:
					for k: int in int(ring[2]):
						var an: float = float(mk["t"]) * float(ring[1]) + TAU * k / float(ring[2])
						var q: Vector2 = p + Vector2.from_angle(an) * float(ring[0]) * float(mk["big"])
						if k % 3 == 0:
							_add.draw_line(q - Vector2.from_angle(an) * 6.0, q + Vector2.from_angle(an) * 6.0, Color(c, a), 2.0, true)
						else:
							_add.draw_circle(q, 2.0, Color(c, 0.7 * a))
				_add.draw_arc(p, 24.0 * (1.0 + 0.1 * sin(float(mk["t"]) * 6.0)), 0.0, TAU, 32, Color(c, a), 2.0, true)
			"reticle":
				# A crosshair closing on the ship, then holding.
				var r: float = lerpf(200.0, 54.0, smoothstep(0.0, 0.35, u)) * float(mk["big"])
				_add.draw_arc(p, r, 0.0, TAU, 48, Color(c, a), 3.0, true)
				for k: int in 4:
					var an: float = TAU * k / 4.0 + float(mk["t"]) * 0.8
					_add.draw_line(p + Vector2.from_angle(an) * (r - 14.0), p + Vector2.from_angle(an) * (r + 18.0), Color(c, a), 4.0, true)
				_add.draw_circle(p, 4.0, Color(c, a))
			"bolt":
				# A bolt of lightning from the sky, flickering.
				var pts: PackedVector2Array = mk["pts"]
				var fl: float = a * (0.6 + 0.4 * absf(sin(float(mk["t"]) * 60.0)))
				_add.draw_polyline(pts, Color(c, 0.35 * fl), 10.0, true)
				_add.draw_polyline(pts, Color(c.lightened(0.6), fl), 3.0, true)
			"chains":
				# Rings of light pulling tight round the hull.
				for k: int in 3:
					var rr: float = lerpf(170.0, 70.0 + k * 14.0, smoothstep(0.0, 0.4, u))
					var hb: Vector2 = up(mk["p"]) + Vector2(0, -30.0 - k * 22.0)
					_add.draw_arc(hb, rr, 0.0, TAU, 48, Color(c, a * (0.9 - k * 0.2)), 3.0, true)
	_add.draw_set_transform_matrix(Transform2D.IDENTITY)


func _paint_one(on: CanvasItem, pp: Dictionary) -> void:
	var u: float = clampf(float(pp["t"]) / float(pp["life"]), 0.0, 1.0)
	var w: float = lerpf(float(pp["s0"]), float(pp["s1"]), u)
	var fade_at: float = float(pp["fade"])
	var a: float = float(pp["a"]) * minf(1.0, u / maxf(0.001, float(pp["in"]))) * (1.0 if u < fade_at else 1.0 - (u - fade_at) / maxf(0.001, 1.0 - fade_at))
	_sprite(on, str(pp["k"]), pp["p"], w, float(pp["rot"]), Color(pp["c"], (pp["c"] as Color).a * a))


## One particle, `w` px across, centred at `at` (un-squashed).
func _sprite(on: CanvasItem, k: String, at: Vector2, w: float, rot: float, c: Color) -> void:
	FxSheet.draw(on, k, at, w, rot, c, GROUND, Transform2D(0.0, Vector2(1.0, 1.0 / GROUND), 0.0, Vector2.ZERO) if on == self else Transform2D.IDENTITY)



## A role's beam: a line of light from one hull to another, motes running
## along it, a ring where it lands.
func tether(from: Vector2, to: Vector2, col: Color) -> void:
	_beams.append({ "a": from + Vector2(0, -20), "b": to + Vector2(0, 10), "t": 0.0, "c": col, "life": 0.7, "thin": true })
	for k: int in 14:
		_sparks.append({ "kind": "gather", "a": up(from) + Vector2(0, -50), "b": up(to) + Vector2(0, -50), "t": -k * 0.025, "life": 0.45, "c": col.lightened(0.3) })
	await _wait(0.4)
	_rings.append({ "p": to, "t": 0.0, "life": 0.8, "r": 120.0 })
	_puffs.append({ "p": up(to) + Vector2(0, -50), "v": Vector2.ZERO, "t": 0.0, "life": 0.4, "r": 40.0, "c": col, "flash": true, "world": false })


## A rally: a pulse of light out from a hull and a ring on the water.
func pulse(at: Vector2, col: Color) -> void:
	_puffs.append({ "p": up(at) + Vector2(0, -50), "v": Vector2.ZERO, "t": 0.0, "life": 0.5, "r": 46.0, "c": col, "flash": true, "world": false })
	for k: int in 8:
		paint("spark", up(at) + Vector2(0, -50), Vector2.from_angle(TAU * k / 8.0) * 220.0, 0.55, 30.0, 12.0, col, { "drag": 3.5, "spin": 3.0 })
	_rings.append({ "p": at, "t": 0.0, "life": 0.9, "r": 150.0 })


# ══ Particle moments (the kit the stage calls for effects, statuses, bonds) ══

## Fire licking up from a hull: a burn's tick.
func flare_up(at: Vector2, big: bool = false) -> void:
	var u: Vector2 = up(at) + Vector2(0, -26)
	for k: int in (6 if big else 4):
		paint("flame", u + Vector2(randf_range(-50, 50), randf_range(-6, 6)), Vector2(randf_range(-10, 10), randf_range(-90, -50)), 0.7 + randf() * 0.3, 40.0, 90.0, Color(1.0, 0.8, 0.55), { "rot": 0.0, "spin": randf_range(-0.3, 0.3), "delay": k * 0.05, "fade": 0.4 })
	for k2: int in 6:
		paint("ember", u + Vector2(randf_range(-40, 40), -20), Vector2(randf_range(-40, 40), randf_range(-160, -80)), 0.9, 18.0, 8.0, Color(1.0, 0.7, 0.35), { "drag": 1.2, "delay": k2 * 0.04 })
	for k3: int in 3:
		paint("smoke", u + Vector2(randf_range(-30, 30), -60), Vector2(randf_range(-10, 10), -40), 1.4, 50.0, 110.0, Color(0.3, 0.28, 0.27, 0.6), { "delay": 0.15 + k3 * 0.1, "drag": 0.8 })


## Ice snapping over a hull: shards thrown, frost blooming.
func freeze_snap(at: Vector2) -> void:
	var u: Vector2 = up(at) + Vector2(0, -30)
	paint("frost", u, Vector2.ZERO, 0.9, 80.0, 190.0, Color(0.8, 0.92, 1.0, 0.9), { "fade": 0.4, "spin": 0.2 })
	for k: int in 8:
		paint("ice", u, Vector2.from_angle(randf_range(-PI, 0.0)) * randf_range(120, 260), 0.8, 30.0, 18.0, Color(0.85, 0.95, 1.0), { "g": 520.0, "spin": randf_range(-8, 8) })
	Sound.clunk()


## Motes streaming from one point to another (a heal, a gift of powder, a
## mark): sparks drawn along a soft arc.
func motes(from: Vector2, to: Vector2, col: Color, n: int = 10, kind: String = "spark") -> void:
	if col.g > 0.85 and col.r < 0.7 and kind == "spark":
		kind = "plus"
	var a: Vector2 = up(from) + Vector2(0, -50)
	var b: Vector2 = up(to) + Vector2(0, -50)
	for k: int in n:
		var dur: float = 0.55 + randf() * 0.15
		var mid: Vector2 = (a + b) / 2.0 + Vector2(randf_range(-40, 40), -90.0 - randf() * 40.0)
		_arc_mote(kind, a, mid, b, dur, col, k * 0.04)


func _arc_mote(kind: String, a: Vector2, mid: Vector2, b: Vector2, dur: float, col: Color, delay: float) -> void:
	await _wait(delay)
	var p: Dictionary = { "k": kind, "p": a, "v": Vector2.ZERO, "t": 0.0, "life": dur, "s0": 26.0, "s1": 18.0, "rot": randf() * TAU, "spin": 4.0, "c": col, "a": 1.0, "g": 0.0, "drag": 0.0, "fade": 0.85, "in": 0.1 }
	_paint.append(p)
	var tw: Tween = create_tween()
	tw.tween_method(func(f: float) -> void:
		var q0: Vector2 = a.lerp(mid, f)
		var q1: Vector2 = mid.lerp(b, f)
		p["p"] = q0.lerp(q1, f), 0.0, 1.0, dur).set_ease(Tween.EASE_IN_OUT)
	await _wait(dur)
	paint(kind, b, Vector2.ZERO, 0.3, 30.0, 60.0, col, { "fade": 0.2 })


## A sigil settling over a hull (a status landing): sparks closing in on the
## ship in the status's colour, with glints.
func sigil(at: Vector2, col: Color) -> void:
	var u: Vector2 = up(at) + Vector2(0, -60)
	# Stars closing in on the ship, then a flash where they meet.
	for k: int in 6:
		_arc_mote("spark", u + Vector2.from_angle(TAU * k / 6.0) * 130.0, u + Vector2.from_angle(TAU * k / 6.0 + 0.6) * 70.0, u, 0.4, col, 0.0)
	for k: int in 6:
		_sparks.append({ "kind": "glint", "a": u + Vector2.from_angle(TAU * k / 6.0) * 60.0, "t": -0.25, "life": 0.35, "c": col.lightened(0.3) })


## A fireball of light flung on an arc (a rake skipping on, a powder keg's
## debris).
func fling(from: Vector2, to: Vector2, kind: String = "fireball", col: Color = Color.WHITE, size: float = 46.0) -> void:
	var a: Vector2 = up(from) + Vector2(0, -40)
	var b: Vector2 = up(to) + Vector2(0, -40)
	_arc_mote(kind, a, (a + b) / 2.0 + Vector2(0, -120), b, 0.45, col, 0.0)
	await _wait(0.45)
	burst(to, false)


## A cannonball tossed from one hull to another (or over the side): a low
## arc, a glint where it is caught or a splash where it falls.
func toss(from: Vector2, to: Vector2, into_sea: bool = false) -> void:
	_balls.append({ "a": from + Vector2(0, -30), "b": to + Vector2(0, -10), "t": 0.0, "dur": 0.5, "h": 110.0, "big": false, "quiet": true })
	await _wait(0.5)
	if into_sea:
		splash(to)
	else:
		_sparks.append({ "kind": "glint", "a": up(to) + Vector2(0, -40), "t": 0.0, "life": 0.35, "c": Color(1.0, 0.9, 0.6) })
		Sound.clunk()


## Something failing: a sputter of grey smoke and a few dying sparks.
func fizzle(at: Vector2) -> void:
	var u: Vector2 = up(at) + Vector2(0, -60)
	for k: int in 3:
		paint("smoke", u + Vector2(randf_range(-20, 20), 0), Vector2(randf_range(-15, 15), -40), 1.0, 40.0, 80.0, Color(0.55, 0.55, 0.55, 0.7), { "delay": k * 0.06, "drag": 1.5 })
	for k2: int in 4:
		paint("ember", u, Vector2.from_angle(randf_range(-PI, 0.0)) * randf_range(60, 120), 0.5, 14.0, 4.0, Color(0.8, 0.8, 0.8), { "g": 300.0 })


## A finishing blow: a fireball blooming on the hull, a crit's burst and a
## gold ring.
func finisher(at: Vector2) -> void:
	var u: Vector2 = up(at) + Vector2(0, -50)
	paint("fireball", u, Vector2(0, -20), 0.8, 90.0, 190.0, Color(1.0, 0.9, 0.75), { "fade": 0.35, "spin": 0.4 })
	burst(at, true)
	_waves.append({ "p": at, "t": 0.0, "life": 0.9, "r": 260.0 })


## A heal or a gift arriving: green (or the given colour) motes rising off
## the hull.
func rise(at: Vector2, col: Color, n: int = 8) -> void:
	var u: Vector2 = up(at) + Vector2(0, -20)
	for k: int in n:
		paint("spark", u + Vector2(randf_range(-60, 60), randf_range(-10, 10)), Vector2(randf_range(-10, 10), randf_range(-110, -60)), 0.9, 24.0, 10.0, col, { "delay": k * 0.04, "drag": 0.6, "spin": 3.0 })


## A status landing on a ship: its own shape and colour (FxSheet.STATUS)
## gathering in from a ring and settling on the hull, a flash where they meet.
func status_burst(at: Vector2, id: String) -> void:
	var col: Color = FxSheet.status_color(id)
	var k: String = str(FxSheet.STATUS[id][1]) if FxSheet.STATUS.has(id) else "spark"
	var u: Vector2 = up(at) + Vector2(0, -60)
	for j: int in 7:
		var a: float = TAU * j / 7.0
		var from: Vector2 = u + Vector2.from_angle(a) * 120.0
		var p: Dictionary = { "k": k, "p": from, "v": (u - from) * 2.2, "t": -j * 0.02, "life": 0.42, "s0": 30.0, "s1": 20.0,
			"rot": (PI if id == "enrage" else (a + PI / 2.0 if k == "tick" else 0.0)), "spin": 0.0, "c": col, "a": 1.0, "g": 0.0, "drag": 0.0, "fade": 0.75, "in": 0.1 }
		_paint.append(p)
	await _wait(0.4)
	paint("flash", u, Vector2.ZERO, 0.3, 40.0, 110.0, col, { "fade": 0.1 })
	paint(k, u, Vector2.ZERO, 0.7, 40.0, 56.0, col, { "spin": 0.0, "rot": PI if id == "enrage" else 0.0, "fade": 0.5 })


## A burst of one shape outward from a point (a reaction's element).
func glyph_burst(at: Vector2, k: String, col: Color, n: int = 10, speed: float = 220.0, size: float = 26.0, g: float = 0.0) -> void:
	var u: Vector2 = up(at) + Vector2(0, -50)
	for j: int in n:
		var a: float = TAU * j / n + randf_range(-0.2, 0.2)
		paint(k, u, Vector2.from_angle(a) * speed * randf_range(0.7, 1.1), 0.7 + randf() * 0.2, size, size * 0.5, col, { "drag": 2.4, "g": g, "rot": a + PI / 2.0 if k in ["ice", "tick"] else 0.0, "spin": 0.0 })


## Fire leaping from one hull to another: a run of flames along the arc.
func fire_leap(from: Vector2, to: Vector2, col: Color) -> void:
	var a: Vector2 = up(from) + Vector2(0, -50)
	var b: Vector2 = up(to) + Vector2(0, -50)
	var mid: Vector2 = (a + b) / 2.0 + Vector2(0, -110)
	for k: int in 8:
		_arc_mote("flame", a, mid, b, 0.5, col, k * 0.04)
	await _wait(0.6)
	flare_up(to, true)


# ══ Crew summons on the water (BattleStage._ability_card) ══════════════════════

## The caster's sigil: rune rings turning on the water under the ship, and a
## helix of motes climbing out of it.
func summon_circle(at: Vector2, col: Color, big: float = 1.0) -> void:
	_marks.append({ "kind": "sigil", "p": at, "t": 0.0, "life": 2.4, "c": col, "big": big })
	for k: int in int(28 * big):
		var an: float = k * 0.55
		var from: Vector2 = up(at) + Vector2(cos(an) * 90.0 * big, sin(an) * 30.0 * big)
		paint("ember", from, Vector2(-sin(an) * 40.0, -150.0), 1.1, 16.0, 6.0, col.lightened(0.3), { "delay": k * 0.03, "drag": 0.4 })
	if field != null:
		field.ring(at, 180.0 * big, 1.6, 0.8)


func mark(kind: String, at: Vector2, col: Color, life: float = 1.4, big: float = 1.0) -> void:
	_marks.append({ "kind": kind, "p": at, "t": 0.0, "life": life, "c": col, "big": big })


## Healing falling on a ship: plus signs drifting down out of the sky onto it,
## then rising off it.
func heal_rain(at: Vector2, col: Color, n: int = 14) -> void:
	var u: Vector2 = up(at)
	for k: int in n:
		paint("plus", u + Vector2(randf_range(-110, 110), randf_range(-260, -200)), Vector2(randf_range(-8, 8), randf_range(220, 300)), 0.65, 26.0, 22.0, col, { "delay": k * 0.04, "spin": 0.0, "rot": 0.0, "fade": 0.75 })
	await _wait(0.6)
	rise(at, col, 12)


## A tide across a ship: spray swept along it, a shell of water left over it.
func tide(at: Vector2, col: Color) -> void:
	var u: Vector2 = up(at)
	for k: int in 26:
		var x: float = -170.0 + k * 13.0
		paint("smoke", u + Vector2(x, -20.0 - sin(k * 0.5) * 30.0), Vector2(90.0, -60.0), 0.8, 30.0, 70.0, Color(col, 0.55), { "delay": k * 0.018, "drag": 1.5 })
		paint("ember", u + Vector2(x, -40.0), Vector2(randf_range(40, 120), randf_range(-260, -120)), 0.7, 12.0, 6.0, col.lightened(0.4), { "delay": k * 0.018, "g": 600.0 })
	splash(at)
	await _wait(0.4)
	status_burst(at, "fortify")


## Lightning from the sky onto a ship (Mako's Tempest).
func lightning(at: Vector2, col: Color) -> void:
	var tip: Vector2 = up(at) + Vector2(randf_range(-30, 30), -40)
	var pts: PackedVector2Array = PackedVector2Array()
	var y: float = tip.y - 520.0
	var x: float = tip.x + randf_range(-80, 80)
	pts.append(Vector2(x, y))
	while y < tip.y:
		y += randf_range(40, 80)
		x = lerpf(x, tip.x, 0.35) + randf_range(-36, 36)
		pts.append(Vector2(x, minf(y, tip.y)))
	# Drawn in the light layer's standing space (un-squashed y).
	var flat: PackedVector2Array = PackedVector2Array()
	for q: Vector2 in pts:
		flat.append(Vector2(q.x, q.y * GROUND))
	_marks.append({ "kind": "bolt", "p": at, "pts": pts, "t": 0.0, "life": 0.32, "c": col, "big": 1.0 })
	paint("flash", tip, Vector2.ZERO, 0.25, 60.0, 200.0, col.lightened(0.5), { "fade": 0.1 })
	glyph_burst(at, "spark", col.lightened(0.4), 8, 260.0, 20.0)
	Sound.impact(true)


## Stars spiralling in onto a ship (the Galaxy's heal).
func cosmic(at: Vector2, col: Color) -> void:
	var u: Vector2 = up(at) + Vector2(0, -50)
	for k: int in 24:
		var an: float = TAU * k / 24.0
		_arc_mote("spark", u + Vector2.from_angle(an) * 220.0, u + Vector2.from_angle(an + 1.4) * 110.0, u, 0.7, col.lightened(0.2) if k % 2 else Color(1, 0.95, 0.9), k * 0.015)
	for k2: int in 6:
		paint("smoke", u + Vector2(randf_range(-80, 80), randf_range(-40, 40)), Vector2.ZERO, 1.4, 60.0, 140.0, Color(col, 0.35), { "delay": 0.2 })
