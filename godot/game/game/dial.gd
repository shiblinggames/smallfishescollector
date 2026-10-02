class_name Dial
extends Control
## THE CATCH DIAL (Godot port; drawn to the web's FishingDial and DialFx).
##
## The zones are web/app/(app)/fishing/depths.ts buildFishZones, rotated to a
## random place each bite (as the chart's dial does); the needle sweeps at a
## speed rolled once per bite from the fish's difficulty and the reel.
##
## THE LOCK-IN. On the web the needle ran on the compositor, ahead of the main
## thread, and freezing "where you saw it" needed a forward prediction (see
## docs/systems/fishing.md). Here the needle is drawn by the same frame that
## reads the press, so strike() freezes it at exactly the angle on screen, and
## that angle is the one scored. It never moves back, and the needle wears the
## colour of the wedge it is in, so gold means "press now and it is a perfect".
##
## What the web draws, at its sizes scaled from a 220 box: the wedge under the
## needle lit full and the rest dimmed (perfect 0.5, snag 0.45, others 0.28),
## the perfect's brackets and star and the snag's cross, the hub's snap and
## ripple on every strike, the gold burst on a perfect, and the streak's fire:
## a pulsing ring from two perfects, a second from three, and embers on the rim
## that grow with the streak (DialFx: min(2.8, 2((s-1)/9)^0.68)).

signal struck(result: String, angle: float)

const CATCH_CENTER: float = 97.5
const CATCH_BONUS_PER_TIER: float = 3.0
const COLORS: Dictionary = {
	"miss": Color("#64748b"), "catch": Color("#4ade80"), "perfect": Color("#fde68a"), "penalty": Color("#f87171"),
}
const DIM: Dictionary = { "miss": 0.28, "catch": 0.28, "perfect": 0.5, "penalty": 0.45 }
const GOLD: Color = Color("#fde68a")

var zones: Array = []
var zone_rot: float = 0.0
var angle: float = 0.0
var sweep: float = 0.0
var spinning: bool = false
var frozen_on: String = ""
var streak: int = 0

## THE ANCIENT DEEP'S FIGHT (see BossFight): the mechanic moving the ring or
## the window, the rebuild the breathing shrink needs each frame, the chance of
## a blackout per tick, the giant's aura, and the stage for the breath's depth.
var mechanic: String = ""
var rebuild: Callable = Callable()
var blackout_chance: float = 0.0
var ancient_aura: bool = false
var stage: int = 1
var _gyre_base: float = 0.0
var _mech_t: float = 0.0
var _tick_left: float = 0.0
var _dark: float = 0.0

var _t: float = 0.0
var _snap: float = 0.0
var _burst: float = 0.0
var _embers: GPUParticles2D
var _burst_fx: GPUParticles2D
## Godot over the web baseline (2026-10-01): the instrument itself is drawn by
## fx/dial.gdshader (brass bezel, bevelled track, glass face, the needle's
## trail) on _face; the fire and the giant's aura behind it on _back; the
## needle, hub and glyphs by _draw on top.
var _face: ColorRect
var _back: Control


## buildFishZones: the arcs for one bite, in degrees clockwise from the top.
static func build_zones(difficulty: float, hook_tier: float, line_penalty: float, zone_catch_mult: float, level_bonus: float, perfect_bonus: float) -> Array:
	var d: int = clampi(int(difficulty), 1, 5) - 1
	var base_catch: float = [77.0, 62.0, 46.0, 32.0, 20.0][d]
	var base_snag: float = [18.0, 26.0, 36.0, 48.0, 58.0][d]
	var gap_right: float = [28.0, 14.0, 5.0, 0.0, 0.0][d]
	var gap_left: float = [0.0, 0.0, 5.0, 0.0, 0.0][d]
	var catch_deg: float = maxf(10.0, Js.round((base_catch + clampf(hook_tier, 0.0, 8.0) * CATCH_BONUS_PER_TIER + level_bonus) * zone_catch_mult))
	var perfect_deg: float = maxf(5.0, 5.0 + perfect_bonus)
	var snag_deg: float = Js.round(base_snag * line_penalty)
	var left: float = gap_left if d >= 2 else -1.0
	var catch_start: float = CATCH_CENTER - catch_deg / 2.0
	var catch_end: float = CATCH_CENTER + catch_deg / 2.0
	var perf_start: float = CATCH_CENTER - perfect_deg / 2.0
	var perf_end: float = CATCH_CENTER + perfect_deg / 2.0
	var out: Array = []
	if left >= 0:
		var left_end: float = catch_start - left
		var left_start: float = maxf(0.0, left_end - snag_deg)
		if left_start > 0:
			out.append([0.0, left_start, "miss"])
		out.append([left_start, left_end, "penalty"])
		out.append([left_end, catch_start, "miss"])
	else:
		out.append([0.0, catch_start, "miss"])
	out.append([catch_start, perf_start, "catch"])
	out.append([perf_start, perf_end, "perfect"])
	out.append([perf_end, catch_end, "catch"])
	var right_start: float = catch_end + gap_right
	var right_end: float = right_start + snag_deg
	out.append([catch_end, right_start, "miss"])
	out.append([right_start, right_end, "penalty"])
	if right_end < 360.0:
		out.append([right_end, 360.0, "miss"])
	return out


func _ready() -> void:
	_back = Control.new()
	_back.show_behind_parent = true
	_back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_back.set_anchors_preset(Control.PRESET_FULL_RECT)
	_back.draw.connect(_draw_back)
	add_child(_back)
	_embers = _make_embers()
	_burst_fx = _make_burst()
	add_child(_embers)
	_face = ColorRect.new()
	_face.show_behind_parent = true
	_face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_face.set_anchors_preset(Control.PRESET_FULL_RECT)
	var m: ShaderMaterial = ShaderMaterial.new()
	m.shader = load("res://game/fx/dial.gdshader")
	_face.material = m
	add_child(_face)
	# The face is drawn (_draw_face), like the Locker's gauge (Kong: the
	# watercolour face looked fake).
	_face.visible = false
	add_child(_burst_fx)
	resized.connect(_place_fx)
	_place_fx()


## The dial's size in the web's 220 box.
func _k() -> float:
	return minf(size.x, size.y) / 220.0


func _place_fx() -> void:
	var c: Vector2 = size / 2.0
	_embers.position = c
	_burst_fx.position = c
	((_embers.process_material) as ParticleProcessMaterial).emission_ring_radius = 102.0 * _k()
	((_embers.process_material) as ParticleProcessMaterial).emission_ring_inner_radius = 98.0 * _k()


static func _ember_ramp() -> GradientTexture1D:
	var g: Gradient = Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.2, 0.45, 0.75, 1.0])
	g.colors = PackedColorArray([Color("#fff3d0"), Color("#ffd479"), Color("#ff9d3c"), Color("#ef4b28"), Color("#8f2410", 0.0)])
	var t: GradientTexture1D = GradientTexture1D.new()
	t.gradient = g
	return t


func _make_embers() -> GPUParticles2D:
	var p: GPUParticles2D = GPUParticles2D.new()
	p.amount = 360
	p.lifetime = 1.4
	p.amount_ratio = 0.0
	p.show_behind_parent = true
	p.texture = Glow.radial(16, Color.WHITE)
	var add: CanvasItemMaterial = CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	p.material = add
	var m: ParticleProcessMaterial = ParticleProcessMaterial.new()
	m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	m.emission_ring_axis = Vector3(0, 0, 1)
	m.emission_ring_height = 0.0
	m.gravity = Vector3(0, -140, 0)
	m.direction = Vector3(0, -1, 0)
	m.spread = 50.0
	m.initial_velocity_min = 10.0
	m.initial_velocity_max = 45.0
	m.scale_min = 0.25
	m.scale_max = 0.55
	m.lifetime_randomness = 0.5
	m.color_ramp = _ember_ramp()
	p.process_material = m
	return p


func _make_burst() -> GPUParticles2D:
	var p: GPUParticles2D = GPUParticles2D.new()
	p.amount = 46
	p.lifetime = 0.64
	p.one_shot = true
	p.explosiveness = 1.0
	p.emitting = false
	p.texture = Glow.radial(16, Color.WHITE)
	var add: CanvasItemMaterial = CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	p.material = add
	var m: ParticleProcessMaterial = ParticleProcessMaterial.new()
	m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	m.emission_ring_axis = Vector3(0, 0, 1)
	m.emission_ring_radius = 100.0
	m.emission_ring_inner_radius = 96.0
	m.emission_ring_height = 0.0
	m.gravity = Vector3.ZERO
	m.spread = 180.0
	m.initial_velocity_min = 130.0
	m.initial_velocity_max = 240.0
	m.radial_velocity_min = 130.0
	m.radial_velocity_max = 240.0
	m.scale_min = 0.3
	m.scale_max = 0.6
	m.lifetime_randomness = 0.35
	m.color_ramp = _ember_ramp()
	p.process_material = m
	return p


func begin(new_zones: Array, new_sweep: float) -> void:
	zones = new_zones
	sweep = new_sweep
	zone_rot = floor(randf() * 360.0)
	angle = randf() * 360.0
	frozen_on = ""
	spinning = true
	_gyre_base = zone_rot
	_mech_t = 0.0
	_dark = 0.0
	queue_redraw()


## The next phase of a fight: new zones, a new place on the ring, the needle
## back at the start, spinning again.
func next_phase(new_zones: Array, new_sweep: float) -> void:
	zones = new_zones
	sweep = new_sweep
	zone_rot = floor(randf() * 360.0)
	_gyre_base = zone_rot
	_mech_t = 0.0
	angle = 270.0
	frozen_on = ""
	spinning = true
	queue_redraw()


## The zone under an angle.
func zone_at(at: float) -> String:
	var rot_at: float = fposmod(at - zone_rot, 360.0)
	for z: Array in zones:
		if rot_at >= float(z[0]) and rot_at < float(z[1]):
			return z[2]
	return "miss"


## Freeze where the needle is drawn and say what it landed on.
func strike() -> void:
	if not spinning:
		return
	spinning = false
	frozen_on = zone_at(angle)
	_snap = 1.0
	if frozen_on == "perfect":
		_burst = 1.0
		_burst_fx.restart()
	queue_redraw()
	struck.emit(frozen_on, angle)


## Second Wind: spin again from somewhere new.
func respin() -> void:
	zone_rot = floor(randf() * 360.0)
	angle = randf() * 360.0
	frozen_on = ""
	_snap = 1.0
	spinning = true
	queue_redraw()


func _mechanics(delta: float) -> void:
	_mech_t += delta
	match mechanic:
		"drift", "surge":
			zone_rot = fposmod(zone_rot + 80.0 * delta, 360.0)
		"gyre":
			zone_rot = fposmod(_gyre_base + 46.0 * sin(_mech_t / 1.5 * TAU), 360.0)
		"shrink":
			# The breath: open at the crest, tightest at the trough, deeper and
			# quicker each phase.
			if rebuild.is_valid():
				var amp: float = 12.0 + stage * 3.0
				var period: float = maxf(0.65, 1.5 - stage * 0.25)
				zones = rebuild.call(amp * (0.5 - 0.5 * cos(_mech_t / period * TAU)))
	# The Ancient Deep's ticks (every 150 to 350ms): a blackout now and then,
	# and the randomize snap.
	_tick_left -= delta
	if _tick_left <= 0.0:
		_tick_left = randf_range(0.15, 0.35)
		if blackout_chance > 0.0 and _dark <= 0.0 and randf() < blackout_chance:
			_dark = randf_range(0.5, 1.1)
		if mechanic == "randomize" and randf() < 0.4:
			zone_rot = floor(randf() * 360.0)


## The streak's fire: how hard the embers burn (DialFx's curve).
static func fire_intensity(s: int) -> float:
	if s < 2:
		return 0.0
	return minf(2.8, 2.0 * pow((float(s) - 1.0) / 9.0, 0.68))


func _process(delta: float) -> void:
	_t += delta
	if spinning:
		angle = fposmod(angle + sweep * delta, 360.0)
		_mechanics(delta)
	_dark = maxf(0.0, _dark - delta) if _dark > 0.0 else 0.0
	_snap = maxf(0.0, _snap - delta / 0.7)
	_burst = maxf(0.0, _burst - delta / 0.45)
	var i: float = fire_intensity(streak)
	var rate: float = pow(i, 1.5) * 95.0
	_embers.amount_ratio = clampf(rate * _embers.lifetime / float(_embers.amount), 0.0, 1.0)
	_embers.emitting = i > 0.0 and visible
	_feed_face()
	queue_redraw()
	_back.queue_redraw()


## What the face shader needs, each frame.
func _feed_face() -> void:
	var m: ShaderMaterial = _face.material
	m.set_shader_parameter("u_size", size)
	m.set_shader_parameter("u_rot", zone_rot)
	m.set_shader_parameter("u_angle", angle)
	var under_i: int = _under_index()
	var zs: Array[Vector4] = []
	var cs: Array[Vector4] = []
	for n: int in mini(16, zones.size()):
		var z: Array = zones[n]
		var kind: float = { "miss": 0.0, "catch": 1.0, "perfect": 2.0, "penalty": 3.0 }.get(z[2], 0.0)
		zs.append(Vector4(float(z[0]), float(z[1]), kind, 1.0 if n == under_i else 0.0))
		if z.size() > 3:
			var c: Color = Color(z[3])
			cs.append(Vector4(c.r, c.g, c.b, 1.0))
		else:
			cs.append(Vector4(0, 0, 0, 0))
	while zs.size() < 16:
		zs.append(Vector4(0, 0, 0, 0))
		cs.append(Vector4(0, 0, 0, 0))
	m.set_shader_parameter("u_zones", zs)
	m.set_shader_parameter("u_cols", cs)
	m.set_shader_parameter("u_n", mini(16, zones.size()))
	m.set_shader_parameter("u_trail", clampf(sweep * 0.11, 8.0, 70.0) if spinning else 0.0)
	m.set_shader_parameter("u_needle_col", _needle_color(under_i))
	m.set_shader_parameter("u_burst", _burst)
	m.set_shader_parameter("u_dark", clampf(_dark * 2.0, 0.0, 1.0))


func _under_index() -> int:
	var rot_at: float = fposmod(angle - zone_rot, 360.0)
	for n: int in zones.size():
		var z: Array = zones[n]
		if rot_at >= float(z[0]) and rot_at < float(z[1]):
			return n
	return -1


func _needle_color(under_i: int) -> Color:
	var under: String = frozen_on if frozen_on != "" else zone_at(angle)
	var needle: Color = COLORS.get(under, Color.WHITE) if under != "miss" else Color(0.85, 0.88, 0.92)
	if under_i >= 0 and (zones[under_i] as Array).size() > 3 and under != "miss":
		needle = Color(zones[under_i][3])
	if under == "perfect" or _burst > 0.0:
		needle = GOLD
	return needle


func _ang(deg: float) -> float:
	return deg_to_rad(deg - 90.0)


## Behind the instrument: the streak's fire and a giant's aura.
func _draw_back() -> void:
	var k: float = _k()
	var c: Vector2 = size / 2.0
	var r_out: float = 96.0 * k
	var i: float = fire_intensity(streak)
	if i > 0.0:
		var flicker: float = 0.9 + 0.05 * sin(7.3 * _t) + 0.05 * sin(11.7 * _t)
		var wash: Color = Color("#ff7a2a") if i > 1.5 else Color("#ff9d3c")
		_back.draw_circle(c, r_out * (1.4 + 0.3 * i) * 0.62 + 14.0 * k, Color(wash, minf(0.5, 0.17 * i) * 0.35 * flicker))
	var fire_level: int = 2 if streak >= 3 else (1 if streak == 2 else 0)
	if fire_level > 0:
		var pulse: float = 0.5 + 0.5 * sin(_t * TAU / 1.0)
		var lo: float = 0.3 if fire_level == 2 else 0.25
		var hi: float = 0.65 if fire_level == 2 else 0.55
		_back.draw_arc(c, 111.0 * k, 0.0, TAU, 96, Color("#fbbf24", lerpf(lo, hi, pulse)), (2.5 if fire_level == 2 else 2.0) * k, true)
		if fire_level == 2:
			var pulse2: float = 0.5 + 0.5 * sin(_t * TAU / 1.4)
			_back.draw_arc(c, 116.0 * k, 0.0, TAU, 96, Color("#f97316", lerpf(0.1, 0.28, pulse2)), 10.0 * k, true)
	if ancient_aura:
		var b1: float = sin(_t * 0.9)
		var b2: float = sin(_t * 1.37 + 1.1)
		_back.draw_circle(c, r_out * (1.9 + b1 * 0.26) * 0.62 + 14.0 * k, Color("#7c3aed", (0.16 + b1 * 0.13) * 0.5))
		_back.draw_circle(c, r_out * (1.28 + b2 * 0.07) + 12.0 * k, Color("#67e8f9", (0.1 + b2 * 0.1) * 0.35))
		_back.draw_arc(c, r_out + 20.0 * k, 0.0, TAU, 96, Color("#7c3aed", 0.24), 12.0 * k, true)
		_back.draw_arc(c, r_out + 13.0 * k, 0.0, TAU, 96, Color("#67e8f9", 0.6), 1.5 * k, true)


## THE FACE, drawn (2026-10-01; the Locker's gauge is the model): a cream
## disc with an ink rim and ticks, the zones as clean bands of colour round
## it, the one under the needle full and the rest softened.
const FACE_COL: Dictionary = {
	"miss": Color(0.78, 0.75, 0.68), "catch": Color(0.36, 0.62, 0.42), "perfect": Color(0.88, 0.66, 0.2), "penalty": Color(0.72, 0.3, 0.24),
}


func _draw_face(c: Vector2, k: float, under_i: int) -> void:
	var r: float = 100.0 * k
	var ink: Color = Color(0.2, 0.16, 0.13)
	draw_circle(c + Vector2(0, 4) * k, r + 6.0 * k, Color(0, 0, 0, 0.3))
	draw_circle(c, r + 6.0 * k, Color(0.96, 0.93, 0.86, 0.96))
	draw_arc(c, r + 6.0 * k, 0.0, TAU, 96, Color(ink, 0.55), 1.6 * k, true)
	draw_circle(c, 58.0 * k, Color(0.93, 0.9, 0.82))
	var band_r: float = 78.0 * k
	var band_w: float = 26.0 * k
	draw_arc(c, band_r, 0.0, TAU, 128, Color(FACE_COL["miss"], 0.45), band_w, true)
	for n: int in zones.size():
		var z: Array = zones[n]
		var a0: float = float(z[0]) + zone_rot
		var a1: float = float(z[1]) + zone_rot
		if a1 <= a0 or z[2] == "miss":
			continue
		var col: Color = Color(z[3]) if z.size() > 3 else FACE_COL.get(z[2], Color.GRAY)
		var lit: bool = n == under_i
		var segs: int = maxi(4, int((a1 - a0) / 3.0))
		draw_arc(c, band_r, _ang(a0), _ang(a1), segs, Color(col, 1.0 if lit else 0.78), band_w, true)
	for t: int in 36:
		var a: float = TAU * t / 36.0
		var u: Vector2 = Vector2.from_angle(a)
		draw_line(c + u * (r + 1.0 * k), c + u * (r + (6.0 if t % 3 == 0 else 3.5) * k), Color(ink, 0.5), 1.0 * k, true)
	draw_arc(c, band_r - band_w / 2.0, 0.0, TAU, 96, Color(ink, 0.25), 1.0 * k, true)
	draw_arc(c, band_r + band_w / 2.0, 0.0, TAU, 96, Color(ink, 0.25), 1.0 * k, true)


func _draw() -> void:
	var k: float = _k()
	var c: Vector2 = size / 2.0
	var r_out: float = 91.0 * k
	var r_in: float = 65.0 * k
	var mid: float = (r_out + r_in) / 2.0
	var under_i: int = _under_index()
	var font: Font = UiTheme.title_font()
	_draw_face(c, k, under_i)
	for n: int in zones.size():
		var z: Array = zones[n]
		var a0: float = float(z[0]) + zone_rot
		var a1: float = float(z[1]) + zone_rot
		if a1 <= a0:
			continue
		var dir: Vector2 = Vector2.from_angle(_ang((a0 + a1) / 2.0))
		if z[2] == "perfect":
			for edge: float in [a0, a1]:
				var e: Vector2 = Vector2.from_angle(_ang(edge))
				draw_line(c + e * (r_in - 2.0 * k), c + e * (r_out + 2.0 * k), Color(0.45, 0.3, 0.05, 0.9), 1.6 * k, true)
			_glyph(font, "✦", c + dir * (r_out + 22.0 * k), 15.0 * k, Color(0.88, 0.66, 0.2))
		elif z[2] == "penalty":
			_glyph(font, "✕", c + dir * mid, 12.0 * k, Color(1, 1, 1, 0.6 if n == under_i else 0.35))

	# The burst ring on a perfect.
	if _burst > 0.0:
		var t: float = 1.0 - _burst
		draw_arc(c, (100.0 + 22.0 * t) * k, 0.0, TAU, 96, Color(GOLD, 0.8 * _burst), 5.0 * k, true)

	# THE NEEDLE: a stroke of ink, tapering to a point that takes the colour
	# of what it is over, with a soft shadow bled under it.
	var needle: Color = _needle_color(under_i)
	var d: Vector2 = Vector2.from_angle(_ang(angle))
	var nrm: Vector2 = d.orthogonal()
	var tip: Vector2 = c + d * (88.0 * k)
	var tail: Vector2 = c - d * (17.0 * k)
	var blade: PackedVector2Array = PackedVector2Array([
		tail + nrm * 2.6 * k, c + nrm * 4.4 * k, tip - d * 10.0 * k + nrm * 1.4 * k, tip,
		tip - d * 10.0 * k - nrm * 1.4 * k, c - nrm * 4.4 * k, tail - nrm * 2.6 * k,
	])
	var shadow: PackedVector2Array = PackedVector2Array()
	for v: Vector2 in blade:
		shadow.append(v + Vector2(2.0, 3.0) * k)
	draw_colored_polygon(shadow, Color(0.02, 0.03, 0.05, 0.28))
	var ink: Color = Color(0.17, 0.15, 0.19)
	var wash: Color = needle.darkened(0.3)
	draw_polygon(blade, PackedColorArray([ink, ink, wash.lerp(ink, 0.35), wash, wash.lerp(ink, 0.35), ink, ink]))
	if needle == GOLD or _burst > 0.0:
		draw_circle(tip, 9.0 * k, Color(GOLD, 0.18))

	# THE HUB: a domed brass cap, and its snap and ripple on a strike.
	var snap_t: float = 1.0 - _snap
	var hub_scale: float = 1.0
	if _snap > 0.0:
		if snap_t < 0.46:
			hub_scale = _keys([1.0, 1.8, 0.7, 1.15, 1.0], snap_t / 0.46)
		draw_arc(c, (10.0 + 30.0 * snap_t) * k, 0.0, TAU, 48, Color(1, 1, 1, 0.22 * _snap), 1.6 * k, true)
	var hr: float = 7.5 * k * hub_scale
	draw_circle(c + Vector2(1.2, 2.0) * k, hr, Color(0.02, 0.03, 0.05, 0.3))
	draw_circle(c, hr, Color(0.47, 0.33, 0.19))
	draw_circle(c - Vector2(0.8, 0.8) * k, hr * 0.74, Color(0.82, 0.64, 0.38))
	if _dark > 0.0:
		draw_circle(c, 110.0 * k, Color(0.01, 0.01, 0.02, 0.85))


## Keyframes evenly spaced over 0..1, eased linearly between.
static func _keys(values: Array, u: float) -> float:
	var span: float = float(values.size() - 1)
	var at: float = clampf(u, 0.0, 1.0) * span
	var n: int = mini(int(at), values.size() - 2)
	return lerpf(float(values[n]), float(values[n + 1]), at - n)


func _glyph(font: Font, text: String, at: Vector2, px: float, col: Color) -> void:
	var fs: int = int(px)
	var w: Vector2 = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
	draw_string(font, at - Vector2(w.x / 2.0, -w.y * 0.3), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
