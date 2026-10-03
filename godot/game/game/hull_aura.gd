class_name HullAura
extends Node2D
## WHAT A SHIP IN A FIGHT IS WEARING, drawn on it in the sea's own World
## (squashed by Chart.GROUND; anything standing is drawn upright):
##   ABLAZE     flames licking up the hull, embers and a column of smoke, and
##              a warm light flickering on the water.
##   ICED       a frost crust: the hull blued and pale, ice shards at the
##              waterline, cold mist breathing off it.
##   SHIELDED   a bubble of light over the hull, its rim shimmering (a crew
##              ward, a palisade, an enemy's barrier).
##   WARDED     the boss's vengeance ward: dark runes turning under it.
##   FORESIGHT  an eye of pale light opening over its masthead.
##   SURGING    after the ward saved it: a red heat around it.
##   THE LAST WALL  a curved rampart of iron plates rising out of the water in
##              front of it; each blow cracks a plate, and at the last it
##              bursts apart.
## Fed every frame by the battle stage (set()); it eases in and out.

const GROUND: float = 0.58

var width: float = 300.0
var face: float = -1.0
var burn: bool = false
var ice: bool = false
var shield: float = 0.0
var ward: bool = false
var foresight: bool = false
var surge: bool = false
var wall_left: float = 0.0
var wall_of: float = 0.0

var _burn_a: float = 0.0
var _ice_a: float = 0.0
var _sh_a: float = 0.0
var _ward_a: float = 0.0
var _eye_a: float = 0.0
var _surge_a: float = 0.0
var _wall_a: float = 0.0
var _t: float = randf() * 10.0
var _sparks: Array = []
var _smoke: Array = []
var _shards: Array = []
var _light: PointLight2D
var _cracked: float = 0.0


func _ready() -> void:
	_light = PointLight2D.new()
	_light.texture = Glow.radial(128, Color(1.0, 0.6, 0.25), true)
	_light.texture_scale = 5.0
	_light.color = Color(1.0, 0.55, 0.2)
	_light.energy = 0.0
	add_child(_light)


func _process(delta: float) -> void:
	_t += delta
	var k: float = 1.0 - exp(-delta * 5.0)
	_burn_a = lerpf(_burn_a, 1.0 if burn else 0.0, k)
	_ice_a = lerpf(_ice_a, 1.0 if ice else 0.0, k)
	_sh_a = lerpf(_sh_a, 1.0 if shield > 0.0 else 0.0, k)
	_ward_a = lerpf(_ward_a, 1.0 if ward else 0.0, k)
	_eye_a = lerpf(_eye_a, 1.0 if foresight else 0.0, k)
	_surge_a = lerpf(_surge_a, 1.0 if surge else 0.0, k)
	_wall_a = lerpf(_wall_a, 1.0 if wall_left > 0.0 else 0.0, 1.0 - exp(-delta * 3.0))
	_cracked = lerpf(_cracked, (1.0 - wall_left / maxf(1.0, wall_of)) if wall_of > 0.0 else 0.0, k)
	_light.energy = _burn_a * (0.9 + 0.35 * sin(_t * 17.0) * sin(_t * 7.3))
	_light.position = Vector2(0, -20)
	# Fire: embers spat up, smoke rising.
	if _burn_a > 0.05:
		if randf() < delta * 40.0 * _burn_a:
			_sparks.append({ "p": Vector2(randf_range(-width * 0.35, width * 0.35), randf_range(-30, 0)), "v": Vector2(randf_range(-30, 30), randf_range(-160, -70)), "t": 0.0, "life": randf_range(0.6, 1.2) })
		if randf() < delta * 9.0 * _burn_a:
			_smoke.append({ "p": Vector2(randf_range(-width * 0.25, width * 0.25), -60), "v": Vector2(randf_range(-8, 22), randf_range(-60, -35)), "t": 0.0, "life": randf_range(2.0, 3.2), "r": randf_range(18, 34) })
	# Ice: shards that glint.
	if _ice_a > 0.05 and _shards.is_empty():
		for i: int in 9:
			_shards.append({ "x": randf_range(-width * 0.45, width * 0.45), "h": randf_range(14, 40), "w": randf_range(6, 14), "tilt": randf_range(-0.4, 0.4) })
	elif _ice_a < 0.02:
		_shards.clear()
	for s: Dictionary in _sparks:
		s["t"] = float(s["t"]) + delta
		s["p"] = (s["p"] as Vector2) + (s["v"] as Vector2) * delta
		s["v"] = (s["v"] as Vector2) * (1.0 - delta * 0.8)
	_sparks = _sparks.filter(func(s: Dictionary) -> bool: return float(s["t"]) < float(s["life"]))
	for m: Dictionary in _smoke:
		m["t"] = float(m["t"]) + delta
		m["p"] = (m["p"] as Vector2) + (m["v"] as Vector2) * delta
	_smoke = _smoke.filter(func(m: Dictionary) -> bool: return float(m["t"]) < float(m["life"]))
	queue_redraw()


## A plate of the Last Wall knocked off: a burst of iron shards.
func crack() -> void:
	for i: int in 14:
		_sparks.append({ "p": Vector2(face * width * 0.62 + randf_range(-30, 30), randf_range(-140, -20)), "v": Vector2(randf_range(-160, 160), randf_range(-200, -40)), "t": 0.0, "life": randf_range(0.5, 0.9), "iron": true })


func shatter() -> void:
	for i: int in 40:
		_sparks.append({ "p": Vector2(face * width * 0.62 + randf_range(-60, 60), randf_range(-200, 0)), "v": Vector2(randf_range(-260, 260), randf_range(-320, -40)), "t": 0.0, "life": randf_range(0.6, 1.3), "iron": true })


func _draw() -> void:
	# Everything that stands, drawn upright over the squashed water.
	var up: Vector2 = Vector2(1.0, 1.0 / GROUND)
	# On the water first (flat): ward runes, the surge, light under a burn.
	if _ward_a > 0.02:
		for k: int in 3:
			var rr: float = width * (0.55 + k * 0.12)
			var a0: float = _t * (0.6 - k * 0.25) * (1.0 if k % 2 == 0 else -1.0)
			for j: int in 8:
				var a: float = a0 + j * TAU / 8.0
				draw_arc(Vector2.ZERO, rr, a, a + 0.42, 10, Color(0.62, 0.35, 0.85, 0.55 * _ward_a), 3.0, true)
	if _surge_a > 0.02:
		for k: int in 4:
			draw_circle(Vector2.ZERO, width * (0.5 + k * 0.1) * (1.0 + 0.04 * sin(_t * 6.0 + k)), Color(0.85, 0.15, 0.1, 0.06 * _surge_a))
	draw_set_transform(Vector2.ZERO, 0.0, up)
	var top: float = -width * 0.62
	# The shield: a bubble over the hull, rim shimmering.
	if _sh_a > 0.02:
		# A dome over the hull, not a ball round it: wide, low, its rim catching light.
		var c: Vector2 = Vector2(0, -6)
		var rx: float = width * 0.56
		var ry: float = width * 0.5
		var shim: float = 0.5 + 0.5 * sin(_t * 2.4)
		var dome: PackedVector2Array = PackedVector2Array()
		for j: int in 33:
			var a: float = PI + PI * j / 32.0
			dome.append(c + Vector2(cos(a) * rx, sin(a) * ry))
		draw_colored_polygon(dome, Color(0.55, 0.8, 1.0, 0.06 * _sh_a))
		draw_polyline(dome, Color(0.75, 0.92, 1.0, (0.28 + 0.2 * shim) * _sh_a), 2.0, true)
		var sweep: float = fposmod(_t * 0.35, 1.0)
		var a1: float = PI + PI * sweep
		draw_arc(c, rx * 0.98, a1, minf(TAU, a1 + 0.5), 12, Color(1, 1, 1, 0.45 * _sh_a), 2.0, true)
	# Fire on the deck: tongues of flame.
	if _burn_a > 0.02:
		for k: int in 7:
			var x: float = (float(k) / 6.0 - 0.5) * width * 0.7
			var h: float = (26.0 + 22.0 * sin(_t * 9.0 + k * 1.7) + 10.0 * sin(_t * 23.0 + k)) * _burn_a
			var base: Vector2 = Vector2(x, -20)
			var pts: PackedVector2Array = PackedVector2Array([base + Vector2(-12, 0), base + Vector2(0, -h), base + Vector2(12, 0)])
			draw_colored_polygon(pts, Color(1.0, 0.45, 0.1, 0.75 * _burn_a))
			var inner: PackedVector2Array = PackedVector2Array([base + Vector2(-6, 0), base + Vector2(0, -h * 0.6), base + Vector2(6, 0)])
			draw_colored_polygon(inner, Color(1.0, 0.85, 0.35, 0.85 * _burn_a))
	for m: Dictionary in _smoke:
		var u: float = float(m["t"]) / float(m["life"])
		draw_circle(m["p"], float(m["r"]) * (0.6 + u), Color(0.2, 0.19, 0.2, 0.32 * (1.0 - u) * _burn_a))
	# Ice: shards along the waterline, mist.
	if _ice_a > 0.02:
		for s: Dictionary in _shards:
			var b: Vector2 = Vector2(float(s["x"]), -6)
			var tip: Vector2 = b + Vector2(sin(float(s["tilt"])), -cos(float(s["tilt"]))) * float(s["h"])
			var poly: PackedVector2Array = PackedVector2Array([b + Vector2(-float(s["w"]) / 2.0, 0), tip, b + Vector2(float(s["w"]) / 2.0, 0)])
			draw_colored_polygon(poly, Color(0.8, 0.93, 1.0, 0.8 * _ice_a))
			draw_line(b, tip, Color(1, 1, 1, 0.6 * _ice_a), 1.5, true)
		for k: int in 5:
			var mx: float = (float(k) / 4.0 - 0.5) * width * 0.8 + sin(_t * 0.7 + k) * 10.0
			draw_circle(Vector2(mx, -16 - 8.0 * sin(_t + k)), 26.0, Color(0.85, 0.95, 1.0, 0.07 * _ice_a))
	# Foresight: an eye opening over the masthead.
	if _eye_a > 0.02:
		var ec: Vector2 = Vector2(0, top - 70.0)
		var open: float = _eye_a * (0.8 + 0.2 * sin(_t * 3.0))
		for k: int in 4:
			draw_circle(ec, 34.0 + k * 10.0, Color(0.7, 0.6, 1.0, 0.05 * _eye_a))
		var lid: PackedVector2Array = PackedVector2Array()
		for j: int in 25:
			var a: float = PI * j / 24.0
			lid.append(ec + Vector2(-cos(a) * 34.0, -sin(a) * 18.0 * open))
		for j: int in 25:
			var a: float = PI * j / 24.0
			lid.append(ec + Vector2(cos(a) * 34.0, sin(a) * 18.0 * open))
		draw_colored_polygon(lid, Color(0.9, 0.88, 1.0, 0.75 * _eye_a))
		draw_circle(ec, 9.0 * open, Color(0.35, 0.2, 0.6, _eye_a))
		draw_circle(ec + Vector2(-3, -3), 3.0, Color(1, 1, 1, 0.8 * _eye_a))
	# The Last Wall: iron plates rising from the water before it.
	if _wall_a > 0.02:
		var n: int = 7
		var rise: float = _wall_a
		var lost: int = int(round(_cracked * n))
		for k: int in n:
			if k < lost:
				continue
			var a: float = (float(k) / (n - 1) - 0.5) * 1.6
			var cx: float = face * width * 0.62 + sin(a) * width * 0.25
			var h: float = (150.0 + 30.0 * cos(a * 2.0)) * rise
			var w: float = 44.0
			var r: Rect2 = Rect2(Vector2(cx - w / 2.0, -h + 10.0), Vector2(w, h))
			draw_rect(r, Color(0.22, 0.24, 0.27, 0.92))
			draw_rect(Rect2(r.position, Vector2(w, 10)), Color(0.42, 0.44, 0.47, 0.95))
			draw_rect(r, Color(0.08, 0.08, 0.09, 0.9), false, 2.0)
			for j: int in 3:
				draw_circle(r.position + Vector2(w / 2.0, 22 + j * (h - 40) / 2.0), 3.0, Color(0.55, 0.5, 0.42))
			# Cracks creep across what is left as it is beaten.
			if _cracked > 0.15:
				draw_line(r.position + Vector2(8, 30), r.position + Vector2(w - 10, h * 0.5), Color(0.05, 0.05, 0.05, _cracked), 2.0, true)
		var glow: float = 0.15 + 0.1 * sin(_t * 2.0)
		draw_circle(Vector2(face * width * 0.62, -60.0 * rise), 120.0, Color(0.6, 0.75, 0.9, glow * 0.25 * rise))
	# Sparks: fire embers, or iron shards off the wall.
	for s: Dictionary in _sparks:
		var u: float = float(s["t"]) / float(s["life"])
		if s.get("iron", false):
			draw_rect(Rect2(s["p"], Vector2(5, 3)), Color(0.4, 0.42, 0.46, 1.0 - u))
		else:
			draw_circle(s["p"], 2.4 * (1.0 - u), Color(1.0, 0.7 - 0.4 * u, 0.25, 1.0 - u))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
