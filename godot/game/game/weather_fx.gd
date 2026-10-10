class_name WeatherFx
extends Node
## WEATHER THAT FEELS LIKE WEATHER (Kong, 2026-10-06: "does weather feel like
## weather?"; the port's fronts dimmed the light and drew rain over the
## screen, but nothing touched the sea). With SquallFx (the rain sheet, the
## flash, the fog veil, the gusts), drawn in code (no painted effects):
##
##   RAIN ON THE WATER   rings opening on the sea round you, as many as the
##                       rain is heavy (in the world, so they lie flat on it)
##   WIND YOU CAN SEE    in a Gale or a Tempest foam streaks run the way it
##                       blows and whitecaps break; she throws spray off her
##                       bow; the rain slants with it
##   SEEING IT COMING    a front on its way is a dark curtain of rain at that
##                       side of the screen, closer and darker as it nears
##                       (and the same going away); a Tempest grumbles before
##                       it arrives, lighting its curtain from inside
##   LIGHTNING YOU SEE   a strike is a forked bolt down to the sea, white-blue,
##                       with the flash
## Sea feeds it each frame (step); it asks nothing of the rules.

var sea: Sea
var _world: Node2D
var _screen: CanvasLayer
var _curtain: ColorRect
var _cmat: ShaderMaterial
var _bolt: Node2D
var _rings: Array = []
var _streaks: Array = []
var _caps: Array = []
var _spray: Array = []
var _bolts: Array = []
var _t: float = 0.0
var _ring_acc: float = 0.0
var _streak_acc: float = 0.0
var _cap_acc: float = 0.0
var _spray_acc: float = 0.0
var _rumble_t: float = 6.0
var _glow: float = 0.0
var _rain: float = 0.0
var _wind: float = 0.0
var _wind_dir: Vector2 = Vector2.RIGHT
var _view: Rect2 = Rect2()


func _ready() -> void:
	_world = Node2D.new()
	_world.z_index = 2
	_world.draw.connect(_draw_world)
	_world.set_meta("ambient", true)
	sea._world.add_child(_world)
	_screen = CanvasLayer.new()
	_screen.layer = 1
	add_child(_screen)
	_curtain = ColorRect.new()
	_curtain.set_anchors_preset(Control.PRESET_FULL_RECT)
	_curtain.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cmat = ShaderMaterial.new()
	_cmat.shader = _curtain_shader()
	_curtain.material = _cmat
	_curtain.visible = false
	_screen.add_child(_curtain)
	_bolt = Node2D.new()
	_bolt.draw.connect(_draw_bolts)
	_screen.add_child(_bolt)


func _exit_tree() -> void:
	if is_instance_valid(_world):
		_world.queue_free()


## A strike (SquallFx.struck): a bolt somewhere on the sea in view.
func strike(strength: float) -> void:
	var vp: Vector2 = _screen.get_viewport().get_visible_rect().size
	var top: Vector2 = Vector2(randf_range(0.15, 0.85) * vp.x, -20.0)
	var foot: Vector2 = Vector2(top.x + randf_range(-160, 160), randf_range(0.42, 0.72) * vp.y)
	var main: PackedVector2Array = _fork(top, foot, 14, 46.0)
	var branches: Array = []
	for b: int in randi_range(1, 3):
		var at: int = randi_range(3, main.size() - 4)
		var from: Vector2 = main[at]
		var to: Vector2 = from + Vector2(randf_range(-160, 160), randf_range(70, 190))
		branches.append(_fork(from, to, 6, 26.0))
	_bolts.append({ "main": main, "branches": branches, "t": 0.0, "k": clampf(strength, 0.5, 1.0) })


func _fork(a: Vector2, b: Vector2, n: int, jag: float) -> PackedVector2Array:
	var out: PackedVector2Array = PackedVector2Array()
	var side: Vector2 = (b - a).normalized().orthogonal()
	for i: int in n + 1:
		var u: float = float(i) / float(n)
		var p: Vector2 = a.lerp(b, u)
		if i > 0 and i < n:
			p += side * randf_range(-jag, jag) * (1.0 - absf(u - 0.5))
		out.append(p)
	return out


## Each frame, from Sea._weather: the rain here (0..1), the storm's weight,
## the front (Weather.current) and where it stands, the camera's view of the
## world, whether the sky is clear of the chart.
func step(delta: float, rain: float, storm: float, f: Dictionary, now: float, cam: Vector2, half: Vector2, shown: bool) -> void:
	_t += delta
	_rain = rain
	_view = Rect2(cam - half * 1.1, half * 2.2)
	var kind: String = str(f.get("kind", ""))
	_wind_dir = f.get("dir", Vector2.RIGHT)
	var windy: float = storm if kind in ["gale", "tempest"] else (0.35 * Js.num(Weather.depth(f, cam, now)) if kind == "wind" else 0.0)
	_wind = lerpf(_wind, windy, 1.0 - exp(-delta * 0.8))
	# The rain slants with a strong wind (screen x of the way it blows).
	sea._squall.slant(_wind_dir.x * _wind * 0.9)
	if shown:
		_spawn(delta, cam)
	_age(delta)
	_approach(delta, f, now, cam, shown)
	_world.queue_redraw()
	_bolt.queue_redraw()


func _spawn(delta: float, cam: Vector2) -> void:
	# Rain on the water: up to ~260 rings a second in the heaviest.
	_ring_acc += delta * 260.0 * _rain
	while _ring_acc >= 1.0 and _rings.size() < 420:
		_ring_acc -= 1.0
		var p: Vector2 = _view.position + Vector2(randf() * _view.size.x, randf() * _view.size.y)
		_rings.append([p, 0.0, randf_range(9.0, 18.0)])
	_ring_acc = minf(_ring_acc, 4.0)
	# Wind: foam streaks running with it, whitecaps breaking.
	_streak_acc += delta * 26.0 * _wind
	while _streak_acc >= 1.0 and _streaks.size() < 90:
		_streak_acc -= 1.0
		var p2: Vector2 = _view.position + Vector2(randf() * _view.size.x, randf() * _view.size.y)
		_streaks.append([p2, 0.0, randf_range(60.0, 150.0), randf_range(2.2, 3.4)])
	_streak_acc = minf(_streak_acc, 3.0)
	_cap_acc += delta * 34.0 * maxf(0.0, _wind - 0.2)
	while _cap_acc >= 1.0 and _caps.size() < 80:
		_cap_acc -= 1.0
		var p3: Vector2 = _view.position + Vector2(randf() * _view.size.x, randf() * _view.size.y)
		_caps.append([p3, 0.0, randf_range(16.0, 34.0)])
	_cap_acc = minf(_cap_acc, 3.0)
	# Spray off her bow, driving into weather.
	var b: Boat = sea._boat
	var way: float = clampf(b.velocity.length() / Boat.SPEED, 0.0, 1.0)
	_spray_acc += delta * 70.0 * maxf(0.0, _wind - 0.25) * way
	var fwd: Vector2 = Vector2.from_angle(b.heading)
	while _spray_acc >= 1.0 and _spray.size() < 160:
		_spray_acc -= 1.0
		var bow: Vector2 = b.position + fwd * 95.0
		var side: Vector2 = fwd.orthogonal() * (1.0 if randf() < 0.5 else -1.0)
		var v: Vector2 = side * randf_range(90.0, 220.0) + fwd * randf_range(40.0, 140.0) + _wind_dir * 60.0
		_spray.append([bow, v, 0.0, randf_range(-260.0, -150.0)])
	_spray_acc = minf(_spray_acc, 3.0)


func _age(delta: float) -> void:
	for r: Array in _rings:
		r[1] = float(r[1]) + delta
	_rings = _rings.filter(func(r: Array) -> bool: return float(r[1]) < 0.55)
	for s: Array in _streaks:
		s[1] = float(s[1]) + delta
		s[0] = (s[0] as Vector2) + _wind_dir * 70.0 * delta
	_streaks = _streaks.filter(func(s: Array) -> bool: return float(s[1]) < float(s[3]))
	for c: Array in _caps:
		c[1] = float(c[1]) + delta
	_caps = _caps.filter(func(c: Array) -> bool: return float(c[1]) < 1.1)
	for p: Array in _spray:
		p[2] = float(p[2]) + delta
		# Thrown up, falling back: the height kept apart from the water.
		p[0] = (p[0] as Vector2) + (p[1] as Vector2) * delta
	_spray = _spray.filter(func(p: Array) -> bool: return float(p[2]) < 0.6)
	for bo: Dictionary in _bolts:
		bo["t"] = float(bo["t"]) + delta
	_bolts = _bolts.filter(func(bo: Dictionary) -> bool: return float(bo["t"]) <= SquallFx.STRIKE_LIFE)


## A front on its way (or going): its curtain at that side of the screen.
func _approach(delta: float, f: Dictionary, now: float, cam: Vector2, shown: bool) -> void:
	var amt: float = 0.0
	var toward: Vector2 = Vector2.ZERO
	var kind: String = str(f.get("kind", ""))
	var d: Dictionary = Weather.KINDS.get(kind, {})
	var heavy: float = float(d.get("cloud", 0.0))
	if not f.is_empty() and heavy > 0.0:
		var e: Vector2 = Weather.edges(f, now)
		var dir: Vector2 = f["dir"]
		var s: float = (cam - Weather.centre()).dot(dir)
		var ahead: float = s - e.x
		var behind: float = e.y - s
		if ahead > 0.0 and ahead < 6000.0:
			amt = (1.0 - ahead / 6000.0) * heavy
			toward = -dir
		elif behind > 0.0 and behind < 6000.0:
			amt = (1.0 - behind / 6000.0) * heavy * 0.8
			toward = dir
		# A Tempest grumbles before it arrives, its curtain lit from inside.
		if kind == "tempest" and ahead > 0.0 and ahead < 5000.0:
			_rumble_t -= delta
			if _rumble_t <= 0.0:
				_rumble_t = randf_range(8.0, 16.0)
				_glow = 1.0
				if sea._sound != null:
					sea._sound.thunder(0.25 + 0.3 * (1.0 - ahead / 5000.0))
	_glow = maxf(0.0, _glow - delta * 2.2)
	_curtain.visible = shown and amt > 0.01
	if _curtain.visible:
		var sd: Vector2 = Vector2(toward.x, toward.y * Chart.GROUND).normalized()
		_cmat.set_shader_parameter("u_dir", sd)
		_cmat.set_shader_parameter("u_amt", amt)
		_cmat.set_shader_parameter("u_glow", _glow)
		_cmat.set_shader_parameter("u_t", _t)


# ── Drawing ───────────────────────────────────────────────────────────────────

func _draw_world() -> void:
	for r: Array in _rings:
		var u: float = float(r[1]) / 0.55
		var rad: float = float(r[2]) * (0.25 + 0.75 * u)
		_world.draw_arc(r[0], rad, 0.0, TAU, 14, Color(0.86, 0.92, 0.98, 0.4 * (1.0 - u)), 1.4, true)
	for s: Array in _streaks:
		var u2: float = float(s[1]) / float(s[3])
		var a: float = sin(u2 * PI) * 0.32
		var p: Vector2 = s[0]
		_world.draw_line(p, p + _wind_dir * float(s[2]), Color(0.92, 0.96, 1.0, a), 2.0, true)
	for c: Array in _caps:
		var u3: float = float(c[1]) / 1.1
		var ang: float = _wind_dir.angle()
		_world.draw_arc(c[0], float(c[2]) * (0.6 + 0.4 * u3), ang - 1.1, ang + 1.1, 10, Color(1, 1, 1, 0.55 * sin(u3 * PI)), 3.0, true)
	for p2: Array in _spray:
		var u4: float = float(p2[2]) / 0.6
		var tt: float = float(p2[2])
		var lift: float = minf(0.0, float(p2[3]) * tt + 520.0 * tt * tt)
		_world.draw_circle((p2[0] as Vector2) + Vector2(0, lift / Chart.GROUND), 3.2, Color(0.94, 0.97, 1.0, 0.7 * (1.0 - u4)))


func _draw_bolts() -> void:
	for bo: Dictionary in _bolts:
		var t: float = float(bo["t"])
		# On the flash's own clock (SquallFx.strike_light): the bolt and the
		# sky pulse together, the second weaker.
		var a: float = SquallFx.strike_light(t) / 0.9 * float(bo["k"])
		if a <= 0.001:
			continue
		var main: PackedVector2Array = bo["main"]
		_bolt.draw_polyline(main, Color(0.6, 0.72, 1.0, 0.22 * a), 14.0, true)
		_bolt.draw_polyline(main, Color(0.85, 0.9, 1.0, 0.85 * a), 3.5, true)
		_bolt.draw_polyline(main, Color(1, 1, 1, a), 1.5, true)
		for br: Variant in bo["branches"]:
			_bolt.draw_polyline(br, Color(0.6, 0.72, 1.0, 0.16 * a), 8.0, true)
			_bolt.draw_polyline(br, Color(0.9, 0.94, 1.0, 0.7 * a), 1.6, true)


func _curtain_shader() -> Shader:
	var sh: Shader = Shader.new()
	sh.code = """
shader_type canvas_item;
render_mode unshaded;
// A front's rain curtain at the side of the screen it lies off: dark cloud
// thickening toward that edge, rain falling in it, lit from inside by a
// Tempest's distant lightning.
uniform vec2 u_dir = vec2(1.0, 0.0);
uniform float u_amt = 0.0;
uniform float u_glow = 0.0;
uniform float u_t = 0.0;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void fragment() {
	vec2 c = UV - 0.5;
	float toward = dot(c, u_dir) * 2.0;
	float edge = smoothstep(-0.1 - 0.5 * u_amt, 1.0, toward + (n(UV * vec2(3.0, 5.0) + vec2(u_t * 0.05, 0.0)) - 0.5) * 0.35);
	// Rain falling in it: thin streaks.
	float streak = smoothstep(0.82, 1.0, n(vec2(UV.x * 220.0, UV.y * 9.0 - u_t * 14.0)));
	vec3 cloud = mix(vec3(0.16, 0.18, 0.22), vec3(0.55, 0.6, 0.72), u_glow * n(UV * 4.0));
	float a = edge * u_amt * 0.78;
	COLOR = vec4(cloud + streak * 0.12, clamp(a + streak * a * 0.25, 0.0, 0.85));
}
"""
	return sh
