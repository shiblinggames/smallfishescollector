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
##   AND WHAT IS ON IT (2026-10-04, Kong: "everything should look and feel
##   good"; then "a lot of things can just be particle effects"), all of it
##   PARTICLES (FxSheet), no art on the ship; each status its own colour
##   (the colour of its chip) and a shape that says what it is: MARKED a red
##   crosshair over the masthead, its ticks breathing (our Spotter's Mark four
##   gold stars round a glint); WEAKENED violet chevrons sinking by the mast;
##   FEEBLE cracks flashing across the hull, splinters flying; CORRODED acid
##   bubbles rising and popping; SLOWED a cold ripple spreading slowly out on
##   the water, foam astern; SILENCED a crossed-out mark over the gunports, the
##   guns sputtering; ENRAGED chevrons and embers streaming up; MENDING plus
##   signs rising; FORTIFIED a dome of hex glints on the side it faces;
##   BLINDED an ink swirl round the sails; NARROWED a ring closing on them;
##   KRAKEN COILS a spiral of sea-green droplets wound round the hull, a turn
##   per coil; FOG BANK mist low on the water; BOARDED two lines of amber motes
##   across the deck, a hook's glint at each end.
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
## Statuses on it (status id -> true), coils, and the co-op marks.
var wear: Dictionary = {}
var coils: int = 0
var fog: bool = false
var spot: bool = false
var boarded: bool = false
const WEAR: Array = ["marked", "weaken", "feeble", "corrode", "slowed", "silence", "enrage", "regen", "fortify", "blinded", "narrowed", "coils", "fog", "spot", "boarded"]
var _wa: Dictionary = {}
## The wear's particles: { k, p, v, t, life, w, w1, c, g, light }.
var _parts: Array = []
var _lightl: Node2D

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
	_lightl = Node2D.new()
	var m: CanvasItemMaterial = CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_lightl.material = m
	_lightl.draw.connect(_draw_light)
	add_child(_lightl)


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
	for key: String in WEAR:
		var on: bool = wear.has(key)
		match key:
			"coils": on = coils > 0
			"fog": on = fog
			"spot": on = spot
			"boarded": on = boarded
		_wa[key] = lerpf(float(_wa.get(key, 0.0)), 1.0 if on else 0.0, k)
	_emit(delta)
	for q: Dictionary in _parts:
		q["t"] = float(q["t"]) + delta
		q["v"] = (q["v"] as Vector2) + Vector2(0, float(q.get("g", 0.0)) * delta)
		q["p"] = (q["p"] as Vector2) + (q["v"] as Vector2) * delta
	_parts = _parts.filter(func(q: Dictionary) -> bool: return float(q["t"]) < float(q["life"]))
	_lightl.queue_redraw()
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
	var rest: Transform2D = Transform2D(0.0, up, 0.0, Vector2.ZERO)
	# Fire on the deck (the flames themselves are light: _draw_light).
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
	_draw_wear(rest)
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
	# Sparks: iron shards off the wall (the fire's embers are light).
	for s: Dictionary in _sparks:
		var u: float = float(s["t"]) / float(s["life"])
		if s.get("iron", false):
			draw_rect(Rect2(s["p"], Vector2(5, 3)), Color(0.4, 0.42, 0.46, 1.0 - u))

	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _a(key: String) -> float:
	return float(_wa.get(key, 0.0))


## A wear particle, born at `p` (standing space) moving `v`, turned `rot`.
func _part(k: String, p: Vector2, v: Vector2, life: float, w: float, w1: float, c: Color, light: bool, g: float = 0.0, rot: float = 0.0, spin: float = 0.0) -> void:
	_parts.append({ "k": k, "p": p, "v": v, "t": 0.0, "life": life, "w": w, "w1": w1, "c": c, "light": light, "g": g, "rot": rot, "spin": spin })


func _chance(rate: float, delta: float, a: float) -> bool:
	return a > 0.25 and randf() < rate * delta * a


func _sc(id: String) -> Color:
	return FxSheet.status_color(id)


## The wear's particles born this frame: each status its own shape and motion.
func _emit(delta: float) -> void:
	var top: float = -width * 0.62
	var bow: float = face if face != 0.0 else -1.0
	var hw: float = width * 0.3
	# Weakened: violet chevrons sinking in a column by the mast.
	if _chance(2.2, delta, _a("weaken")):
		_part("chevron", Vector2(-bow * width * 0.16, top + 14.0), Vector2(0, 34), 1.5, 26.0, 20.0, _sc("weaken"), true)
	# Feeble: cracks flashing across the hull, splinters popping off.
	if _chance(2.6, delta, _a("feeble")):
		_part("crack", Vector2(randf_range(-hw, hw), randf_range(-40, -18)), Vector2.ZERO, 0.7, 46.0, 52.0, _sc("feeble"), true, 0.0, randf_range(-0.5, 0.5))
	if _chance(2.0, delta, _a("feeble")):
		_part("ice", Vector2(randf_range(-hw, hw), -30.0), Vector2(randf_range(-110, 110), randf_range(-190, -110)), 0.9, 18.0, 14.0, Color(0.6, 0.42, 0.25, 0.95), false, 560.0, 0.0, randf_range(-8, 8))
	# Corroded: acid bubbles rising off the hull and popping.
	if _chance(6.0, delta, _a("corrode")):
		_part("bubble", Vector2(randf_range(-hw, hw), randf_range(-44, -20)), Vector2(randf_range(-6, 6), randf_range(-34, -18)), 1.0, 8.0, 20.0, _sc("corrode"), true)
	if _chance(4.0, delta, _a("corrode")):
		_part("ember", Vector2(randf_range(-hw, hw), -30.0), Vector2(0, randf_range(40, 70)), 0.6, 9.0, 6.0, _sc("corrode"), true)
	# Slowed: a cold ripple spreading slowly out round the hull, foam astern.
	if _chance(0.9, delta, _a("slowed")):
		_part("ring", Vector2(0, 0), Vector2.ZERO, 2.2, width * 0.6, width * 1.3, Color(_sc("slowed"), 0.8), true)
		_parts[_parts.size() - 1]["flat"] = true
	if _chance(8.0, delta, _a("slowed")):
		_part("smoke", Vector2(-bow * width * 0.42 + randf_range(-10, 10), randf_range(-4, 6)), Vector2(-bow * randf_range(30, 60), 0), 1.4, 12.0, 26.0, Color(0.85, 0.92, 1.0, 0.45), false)
	# Silenced: a crossed-out mark flaring over each gunport, the guns sputtering.
	if _chance(1.6, delta, _a("silence")):
		var gx: float = (-1.0 if randf() < 0.5 else 1.0) * width * 0.18
		_part("cross", Vector2(gx, -34.0), Vector2(0, -6), 0.9, 30.0, 24.0, _sc("silence"), true)
		_part("smoke", Vector2(gx, -30.0), Vector2(randf_range(-6, 6), -26), 1.1, 14.0, 30.0, Color(0.35, 0.3, 0.42, 0.5), false)
	# Enraged: chevrons streaming up, embers.
	if _chance(3.0, delta, _a("enrage")):
		_part("chevron", Vector2(randf_range(-hw, hw) * 0.7, -30.0), Vector2(0, -90), 0.9, 24.0, 18.0, _sc("enrage"), true, 0.0, PI)
	if _chance(8.0, delta, _a("enrage")):
		_part("ember", Vector2(randf_range(-hw, hw), -24.0), Vector2(randf_range(-14, 14), randf_range(-150, -90)), 0.8, 14.0, 6.0, _sc("enrage"), true)
	# Mending: plus signs rising.
	if _chance(3.5, delta, _a("regen")):
		_part("plus", Vector2(randf_range(-hw, hw), -30.0), Vector2(randf_range(-6, 6), randf_range(-60, -40)), 1.4, 20.0, 16.0, _sc("regen"), true)
	# Blinded: an ink swirl round the crow's nest.
	if _chance(7.0, delta, _a("blinded")):
		var an: float = randf() * TAU
		_part("smoke", Vector2(cos(an) * 40.0, top + 70.0 + sin(an) * 12.0), Vector2(-sin(an) * 34.0, cos(an) * 8.0), 1.3, 30.0, 54.0, Color(_sc("blinded"), 0.6), false)
	# Narrowed: a ring closing on the crow's nest.
	if _chance(1.2, delta, _a("narrowed")):
		_part("ring", Vector2(0, top + 70.0), Vector2.ZERO, 1.0, 130.0, 16.0, _sc("narrowed"), true)
	# Fog Bank: mist low on the water.
	if _chance(7.0, delta, _a("fog")):
		_part("smoke", Vector2(randf_range(-width * 0.5, width * 0.5), randf_range(-14, 2)), Vector2(randf_range(-14, 14), -4), 2.6, 60.0, 110.0, Color(0.92, 0.96, 1.0, 0.34), false)
	# Kraken coils: water thrown up where the coils grip.
	if _chance(1.5, delta, _a("coils")):
		_part("splash", Vector2(randf_range(-hw, hw), 0), Vector2(0, -20), 0.6, 40.0, 56.0, Color(0.6, 0.95, 0.9, 0.8), true)


## What a ship wears: its particles, and the standing marks.
func _draw_wear(rest: Transform2D) -> void:
	for q: Dictionary in _parts:
		if not q["light"]:
			_draw_part(self, q, rest)


func _draw_part(on: CanvasItem, q: Dictionary, rest: Transform2D) -> void:
	var u: float = float(q["t"]) / float(q["life"])
	var c: Color = q["c"]
	var rot: float = float(q.get("rot", 0.0)) + float(q.get("spin", 0.0)) * float(q["t"])
	if q["k"] == "ice":
		rot = atan2((q["v"] as Vector2).x, -(q["v"] as Vector2).y)
	var col: Color = Color(c, c.a * minf(1.0, u * 6.0) * (1.0 - u))
	if q.get("flat", false):
		# Lying on the water: drawn in the squashed plane itself.
		FxSheet.draw(on, str(q["k"]), Vector2((q["p"] as Vector2).x, (q["p"] as Vector2).y * GROUND), lerpf(float(q["w"]), float(q["w1"]), u), rot, col, 1.0, rest)
		return
	FxSheet.draw(on, str(q["k"]), q["p"], lerpf(float(q["w"]), float(q["w1"]), u), rot, col, GROUND, rest)


## The light a ship wears: its flames and embers, and the glowing wear.
func _draw_light() -> void:
	var up: Vector2 = Vector2(1.0, 1.0 / GROUND)
	var rest: Transform2D = Transform2D(0.0, up, 0.0, Vector2.ZERO)
	var top: float = -width * 0.62
	var bow: float = face if face != 0.0 else -1.0
	if _burn_a > 0.02:
		for k: int in 5:
			var x: float = (float(k) / 4.0 - 0.5) * width * 0.62
			var h: float = 60.0 + 18.0 * sin(_t * 9.0 + k * 1.7) + 8.0 * sin(_t * 23.0 + k)
			FxSheet.draw(_lightl, "flame", Vector2(x, -24.0 - h * 0.3), h * _burn_a, 0.05 * sin(_t * 5.0 + k), Color(1.0, 0.55, 0.2, 0.8 * _burn_a), GROUND, rest)
		for sp: Dictionary in _sparks:
			if not sp.get("iron", false):
				var u: float = float(sp["t"]) / float(sp["life"])
				FxSheet.draw(_lightl, "ember", sp["p"], 14.0 * (1.0 - u * 0.5), 0.0, Color(1.0, 0.7, 0.35, 1.0 - u), GROUND, rest)
	for q: Dictionary in _parts:
		if q["light"]:
			_draw_part(_lightl, q, rest)
	var both: bool = _a("marked") > 0.02 and _a("spot") > 0.02
	# Marked: a red crosshair over the masthead, its ticks breathing in.
	var am: float = _a("marked")
	if am > 0.02:
		var cm: Vector2 = Vector2(-28.0 if both else 0.0, top - 40.0)
		var br: float = 1.0 + 0.12 * sin(_t * 5.0)
		var rcol: Color = _sc("marked")
		FxSheet.draw(_lightl, "ring", cm, 54.0 * br, 0.0, Color(rcol, 0.9 * am), GROUND, rest)
		for k2: int in 4:
			var an: float = _t * 0.6 + k2 * TAU / 4.0
			FxSheet.draw(_lightl, "tick", cm + Vector2.from_angle(an) * 30.0 * br, 14.0, an + PI / 2.0, Color(rcol, am), GROUND, rest)
		FxSheet.draw(_lightl, "ember", cm, 12.0, 0.0, Color(rcol, am), GROUND, rest)
	# Our Spotter's Mark: four gold stars round the masthead, a glint at the heart.
	var asp: float = _a("spot")
	if asp > 0.02:
		var cs: Vector2 = Vector2(28.0 if both else 0.0, top - 40.0)
		for k3: int in 4:
			var an2: float = -_t * 0.8 + k3 * TAU / 4.0
			FxSheet.draw(_lightl, "spark", cs + Vector2.from_angle(an2) * 26.0, 20.0, 0.0, Color(1.0, 0.82, 0.4, asp), GROUND, rest)
		FxSheet.draw(_lightl, "spark", cs, 26.0 * (1.0 + 0.15 * sin(_t * 6.0)), _t, Color(1.0, 0.9, 0.55, asp), GROUND, rest)
	# Kraken coils: a spiral of sea-green droplets wound round the hull.
	if _a("coils") > 0.02:
		var turns: int = clampi(coils, 1, 4)
		for k4: int in turns * 12:
			var f: float = float(k4) / (turns * 12.0)
			var an3: float = f * TAU * turns - _t * 1.8
			var pc: Vector2 = Vector2(cos(an3) * width * 0.42, -8.0 - f * 64.0 + sin(an3) * 12.0)
			var front: float = 0.5 + 0.5 * sin(an3)
			FxSheet.draw(_lightl, "ember", pc, 12.0 + 7.0 * front, 0.0, Color(0.35, 0.95, 0.8, _a("coils") * (0.3 + 0.7 * front)), GROUND, rest)
	# Fortified: a dome of hex glints over the side it faces.
	if _a("fortify") > 0.02:
		for k5: int in 9:
			var an4: float = -1.2 + 2.4 * k5 / 8.0
			var pf: Vector2 = Vector2(bow * (width * 0.22 + cos(an4) * 52.0), -50.0 + sin(an4) * 60.0)
			FxSheet.draw(_lightl, "hex", pf, 22.0, 0.0, Color(_sc("fortify"), _a("fortify") * (0.45 + 0.55 * (0.5 + 0.5 * sin(_t * 3.0 + k5)))), GROUND, rest)
	# Boarded: two lines of amber motes across the deck, a hook's glint at each end.
	if _a("boarded") > 0.02:
		for side: int in 2:
			var sgn: float = -1.0 if side == 0 else 1.0
			for k6: int in 7:
				var f2: float = fposmod(k6 / 7.0 + _t * 0.5, 1.0)
				var pb: Vector2 = Vector2(sgn * width * 0.3 * (1.0 - f2 * 2.0), -62.0 + f2 * 42.0)
				FxSheet.draw(_lightl, "ember", pb, 10.0, 0.0, Color(1.0, 0.75, 0.4, _a("boarded") * sin(f2 * PI)), GROUND, rest)
			FxSheet.draw(_lightl, "spark", Vector2(sgn * width * 0.3, -62.0), 18.0, 0.0, Color(1.0, 0.85, 0.55, _a("boarded")), GROUND, rest)
