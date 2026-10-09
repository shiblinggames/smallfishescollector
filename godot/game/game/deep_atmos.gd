class_name DeepAtmos
extends Node
## THE DIVE'S OWN WATER, DRAWN (with DeepLook, which says how each band looks).
## Over the world, under every word on screen:
##   THE MURK      the band's haze in the water, rolling slowly, and the dark
##                 closing in round your hull (deeper bands close it further;
##                 the Crush and the Maw breathe it in and out)
##   ON SCREEN     what drifts between you and the sea: wisps, glowing
##                 specks, falling silt, ash, rising embers, falling fronds,
##                 spores
##   ON THE WATER  under the hulls: planks of old wrecks, a court of candles,
##                 the Leviathan's shadow passing beneath, kelp, the Kraken's
##                 arm sweeping under you, blooms of ink
## Everything is drawn in code (FxSheet's rule: no painted effects). A band
## change crossfades; leave() fades it all out.

## The sea's ground squash (one value, Chart.GROUND).
const GROUND: float = Chart.GROUND

var sea: Sea
var _layer: CanvasLayer
var _murk: ColorRect
var _mat: ShaderMaterial
var _screen: Node2D
var _water: Node2D
var _look: Dictionary = {}
var _t: float = 0.0
var _fade: float = 0.0
var _fade_to: float = 1.0
## The drawn things' strength (0 while one band's things give way to the next).
var _mk: float = 0.0
var _kind: String = ""
var _want: String = ""
var _cur: Dictionary = { "murk": Color(0.5, 0.6, 0.6), "murkA": 0.0, "vig": 0.0 }
var _sp: Array = []
var _wp: Array = []
var _next: float = 0.0
## The clear zone's lean toward the enemy off her bow: 0.17 of the screen in a
## fight, eased to 0 (centred on her) while she sails.
var _bias: float = 0.0


func _ready() -> void:
	_bias = 0.17 if sea != null and sea.stage != null else 0.0
	_layer = CanvasLayer.new()
	_layer.layer = 2
	add_child(_layer)
	_murk = ColorRect.new()
	_murk.set_anchors_preset(Control.PRESET_FULL_RECT)
	_murk.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mat = ShaderMaterial.new()
	_mat.shader = _shader()
	_murk.material = _mat
	_layer.add_child(_murk)
	_screen = Node2D.new()
	_screen.draw.connect(_draw_screen)
	_layer.add_child(_screen)
	_water = Node2D.new()
	_water.z_index = -1
	_water.draw.connect(_draw_water)
	sea._world.add_child(_water)


func _exit_tree() -> void:
	if is_instance_valid(_water):
		_water.queue_free()


## The band's look (DeepLook.look); the change eases in.
func set_look(l: Dictionary) -> void:
	_look = l
	_want = str(l.get("motes", ""))


## Fade everything out, then go.
func leave() -> void:
	_fade_to = 0.0


func _process(delta: float) -> void:
	_t += delta
	_fade = move_toward(_fade, _fade_to, delta * 0.6)
	if _fade_to <= 0.0 and _fade <= 0.0:
		queue_free()
		return
	if _look.is_empty():
		return
	var e: float = 1.0 - exp(-delta * 0.9)
	_cur["murk"] = (_cur["murk"] as Color).lerp(_look["murk"], e)
	_cur["murkA"] = lerpf(float(_cur["murkA"]), float(_look["murkA"]), e)
	_cur["vig"] = lerpf(float(_cur["vig"]), float(_look["vig"]), e)
	# One band's things give way before the next band's come.
	if _kind != _want:
		_mk = move_toward(_mk, 0.0, delta * 0.8)
		if _mk <= 0.0:
			_kind = _want
			_sp.clear()
			_wp.clear()
			_next = 0.0
	else:
		_mk = move_toward(_mk, 1.0, delta * 0.5)
	var vp: Vector2 = _layer.get_viewport().get_visible_rect().size
	var focus: Vector2 = sea._boat.get_global_transform_with_canvas().origin
	var breathe: float = 0.0
	if _kind == "ember" or _kind == "spore":
		breathe = sin(_t * 1.3) * 0.035
	_mat.set_shader_parameter("u_murk", _cur["murk"])
	_mat.set_shader_parameter("u_amt", float(_cur["murkA"]))
	_mat.set_shader_parameter("u_vig", clampf(float(_cur["vig"]) + breathe, 0.0, 0.97))
	_mat.set_shader_parameter("u_focus", focus)
	_mat.set_shader_parameter("u_res", vp)
	_mat.set_shader_parameter("u_t", _t)
	_mat.set_shader_parameter("u_fade", _fade)
	_bias = lerpf(_bias, 0.17 if sea.stage != null else 0.0, 1.0 - exp(-delta * 1.2))
	_mat.set_shader_parameter("u_bias", _bias)
	_step_screen(delta, vp)
	_step_water(delta)
	_screen.queue_redraw()
	_water.queue_redraw()


# ── On screen ─────────────────────────────────────────────────────────────────

const SCREEN_N: Dictionary = { "wisp": 26, "speck": 70, "silt": 150, "ash": 70, "ember": 56, "leaf": 26, "spore": 44 }


func _step_screen(delta: float, vp: Vector2) -> void:
	var n: int = int(SCREEN_N.get(_kind, 0))
	if int(_look.get("band", 0)) == 8:
		n = int(n * 0.4)
	# The set builds over the whole screen (already hanging in the water, not
	# sweeping in as one band); only recycled motes come in from an edge.
	while _sp.size() < n:
		_sp.append(_spawn_screen(vp, true))
	for p: Dictionary in _sp:
		p["t"] = float(p["t"]) + delta
		var v: Vector2 = p["v"]
		var sway: float = sin(_t * float(p["w"]) + float(p["ph"])) * float(p["sw"])
		p["p"] = (p["p"] as Vector2) + (v + Vector2(sway, 0)) * delta
		p["rot"] = float(p["rot"]) + float(p["spin"]) * delta
		var at: Vector2 = p["p"]
		if at.y > vp.y + 40.0 or at.y < -40.0 or at.x < -60.0 or at.x > vp.x + 60.0 or float(p["t"]) > float(p["life"]):
			var fresh: Dictionary = _spawn_screen(vp, false)
			p.merge(fresh, true)


func _spawn_screen(vp: Vector2, anywhere: bool) -> Dictionary:
	var p: Dictionary = { "t": 0.0, "life": randf_range(6.0, 14.0), "w": randf_range(0.5, 1.6), "ph": randf() * TAU, "sw": 0.0, "rot": randf() * TAU, "spin": 0.0, "s": 4.0, "a": 1.0 }
	var x: float = randf() * vp.x
	var y: float = randf() * vp.y
	match _kind:
		"wisp":
			p["p"] = Vector2(x, y if anywhere or randf() < 0.6 else vp.y + 30.0)
			p["v"] = Vector2(randf_range(-6, 6), -randf_range(8, 22))
			p["sw"] = 14.0
			p["s"] = randf_range(40, 90)
			p["a"] = randf_range(0.12, 0.26)
		"speck":
			p["p"] = Vector2(x, y)
			p["v"] = Vector2(randf_range(-10, 10), randf_range(-8, 8))
			p["s"] = randf_range(2.0, 4.5)
			p["a"] = randf_range(0.5, 1.0)
		"silt":
			p["p"] = Vector2(x, y if anywhere or randf() < 0.3 else -20.0)
			p["v"] = Vector2(randf_range(4, 18), randf_range(18, 46))
			p["sw"] = 6.0
			p["s"] = randf_range(1.2, 3.0)
			p["a"] = randf_range(0.3, 0.7)
		"ash":
			p["p"] = Vector2(x, y if anywhere or randf() < 0.3 else -20.0)
			p["v"] = Vector2(randf_range(-6, 10), randf_range(14, 30))
			p["sw"] = 18.0
			p["spin"] = randf_range(-1.5, 1.5)
			p["s"] = randf_range(3.0, 6.0)
			p["a"] = randf_range(0.35, 0.7)
		"ember":
			p["p"] = Vector2(x, y if anywhere or randf() < 0.3 else vp.y + 20.0)
			p["v"] = Vector2(randf_range(-12, 12), -randf_range(26, 70))
			p["sw"] = 22.0
			p["s"] = randf_range(2.0, 4.5)
			p["a"] = randf_range(0.6, 1.0)
		"leaf":
			p["p"] = Vector2(x, y if anywhere or randf() < 0.3 else -30.0)
			p["v"] = Vector2(randf_range(-8, 14), randf_range(20, 40))
			p["sw"] = 34.0
			p["spin"] = randf_range(-1.2, 1.2)
			p["s"] = randf_range(10, 18)
			p["a"] = randf_range(0.45, 0.8)
		"spore":
			p["p"] = Vector2(x, y if anywhere or randf() < 0.4 else vp.y + 20.0)
			p["v"] = Vector2(randf_range(-6, 6), -randf_range(10, 26))
			p["sw"] = 10.0
			p["s"] = randf_range(4.0, 8.0)
			p["a"] = randf_range(0.6, 1.0)
		_:
			p["p"] = Vector2(x, y)
			p["v"] = Vector2.ZERO
	if anywhere:
		# Somewhere in its life already, so a fresh set does not all fade in
		# on the same frame.
		p["t"] = randf() * float(p["life"]) * 0.7
	return p


func _draw_screen() -> void:
	if _look.is_empty():
		return
	var col: Color = _look["mote"]
	var k: float = _mk * _fade
	var g: Texture2D = FxSheet.glow()
	for p: Dictionary in _sp:
		var u: float = float(p["t"]) / float(p["life"])
		var a: float = float(p["a"]) * k * minf(1.0, float(p["t"]) * 1.5) * (1.0 - smoothstep(0.85, 1.0, u))
		var at: Vector2 = p["p"]
		var s: float = float(p["s"])
		match _kind:
			"wisp":
				_screen.draw_texture_rect(g, Rect2(at - Vector2(s, s * 0.6), Vector2(s * 2.0, s * 1.2)), false, Color(col, a))
			"speck", "spore":
				var tw: float = 0.6 + 0.4 * sin(_t * 3.0 + float(p["ph"]))
				_screen.draw_texture_rect(g, Rect2(at - Vector2(s * 4.0, s * 4.0), Vector2(s * 8.0, s * 8.0)), false, Color(col, a * 0.35 * tw))
				_screen.draw_circle(at, s * 0.55, Color(col.lightened(0.4), a * tw))
			"silt":
				_screen.draw_circle(at, s, Color(col, a))
			"ash":
				_screen.draw_set_transform(at, float(p["rot"]), Vector2(1.0, 0.45))
				_screen.draw_circle(Vector2.ZERO, s, Color(col, a))
				_screen.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			"ember":
				var fl: float = 0.6 + 0.4 * sin(_t * 9.0 + float(p["ph"]) * 3.0)
				_screen.draw_texture_rect(g, Rect2(at - Vector2(s * 5.0, s * 5.0), Vector2(s * 10.0, s * 10.0)), false, Color(col, a * 0.3 * fl))
				_screen.draw_circle(at, s * 0.6, Color(1.0, 0.85, 0.6, a * fl))
			"leaf":
				_screen.draw_set_transform(at, float(p["rot"]), Vector2(1.0, 0.32))
				_screen.draw_circle(Vector2.ZERO, s, Color(col, a))
				_screen.draw_line(Vector2(-s, 0), Vector2(s, 0), Color(col.darkened(0.4), a), 1.2, true)
				_screen.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


# ── On the water ──────────────────────────────────────────────────────────────

func _centre() -> Vector2:
	return sea._boat.position + Vector2(320, 0)


func _step_water(delta: float) -> void:
	var c: Vector2 = _centre()
	match _kind:
		"plank", "candle", "kelp":
			var n: int = { "plank": 12, "candle": 16, "kelp": 22 }[_kind]
			while _wp.size() < n:
				_wp.append(_spawn_water(c, true))
			for p: Dictionary in _wp:
				p["p"] = (p["p"] as Vector2) + (p["v"] as Vector2) * delta
				p["rot"] = float(p["rot"]) + float(p["spin"]) * delta
				var d: Vector2 = (p["p"] as Vector2) - c
				if absf(d.x) > 1500.0 or absf(d.y) > 1300.0:
					p.merge(_spawn_water(c, false), true)
		"shadow", "tentacle":
			_next -= delta
			if _next <= 0.0 and _wp.is_empty():
				var fromleft: bool = randf() < 0.5
				var span: float = 1500.0 if _kind == "shadow" else 1000.0
				_wp.append({ "t": 0.0, "life": 7.0 if _kind == "shadow" else 6.0, "from": c + Vector2(-span if fromleft else span, randf_range(-220, 220)), "to": c + Vector2(span if fromleft else -span, randf_range(-220, 220)), "ph": randf() * TAU })
				_next = randf_range(6.0, 11.0)
			for p2: Dictionary in _wp:
				p2["t"] = float(p2["t"]) + delta
				# The surface moves over it: rings along where it passes.
				p2["rt"] = float(p2.get("rt", 0.0)) - delta
				if float(p2["rt"]) <= 0.0 and sea._field != null:
					p2["rt"] = 0.32
					var u2: float = float(p2["t"]) / float(p2["life"])
					var head: Vector2 = (p2["from"] as Vector2).lerp(p2["to"], u2)
					sea._field.ring(head + Vector2(randf_range(-260, 260), randf_range(-120, 120)), 260.0, 1.8, 0.5 * sin(u2 * PI))
			_wp = _wp.filter(func(p3: Dictionary) -> bool: return float(p3["t"]) < float(p3["life"]))
		"ink":
			_next -= delta
			if _next <= 0.0:
				_next = randf_range(0.7, 1.5)
				_wp.append({ "t": 0.0, "life": randf_range(3.5, 5.5), "p": c + Vector2(randf_range(-1200, 1200), randf_range(-900, 900)), "r": randf_range(240, 420), "n": randi_range(5, 8), "ph": randf() * TAU })
			for p4: Dictionary in _wp:
				p4["t"] = float(p4["t"]) + delta
			_wp = _wp.filter(func(p5: Dictionary) -> bool: return float(p5["t"]) < float(p5["life"]))


func _spawn_water(c: Vector2, anywhere: bool) -> Dictionary:
	var at: Vector2 = c + Vector2(randf_range(-1400, 1400), randf_range(-1200, 1200))
	if not anywhere:
		at = c + Vector2(1450.0 * (1.0 if randf() < 0.5 else -1.0), randf_range(-1200, 1200))
	match _kind:
		"plank":
			return { "p": at, "v": Vector2(randf_range(-14, 14), randf_range(-8, 8)), "rot": randf() * TAU, "spin": randf_range(-0.08, 0.08), "s": randf_range(130, 240), "ph": randf() * TAU }
		"candle":
			return { "p": at, "v": Vector2(randf_range(-6, 6), randf_range(-4, 4)), "rot": 0.0, "spin": 0.0, "s": 1.0, "ph": randf() * TAU }
		_:
			return { "p": at, "v": Vector2(randf_range(-4, 4), 0.0), "rot": randf() * TAU, "spin": 0.0, "s": randf_range(260, 440), "ph": randf() * TAU }


func _draw_water() -> void:
	if _look.is_empty():
		return
	var col: Color = _look["mote"]
	var k: float = _mk * _fade
	var g: Texture2D = FxSheet.glow()
	match _kind:
		"plank":
			for p: Dictionary in _wp:
				var bob: float = sin(_t * 1.2 + float(p["ph"])) * 3.0
				_water.draw_set_transform(p["p"] + Vector2(0, bob), 0.0, Vector2(1.0, GROUND))
				var s: float = float(p["s"])
				var rot: float = float(p["rot"])
				var ax: Vector2 = Vector2.from_angle(rot)
				var ay: Vector2 = ax.orthogonal()
				var pts: PackedVector2Array = PackedVector2Array([-ax * s * 0.5 - ay * 16.0, ax * s * 0.5 - ay * 14.0, ax * s * 0.48 + ay * 16.0, -ax * s * 0.5 + ay * 14.0])
				_water.draw_texture_rect(g, Rect2(-Vector2(s * 0.7, s * 0.7), Vector2(s * 1.4, s * 1.4)), false, Color(0.8, 0.9, 1.0, 0.1 * k))
				_water.draw_colored_polygon(pts, Color(col.lightened(0.15), 0.95 * k))
				_water.draw_line(-ax * s * 0.46, ax * s * 0.46, Color(col.darkened(0.5), 0.8 * k), 2.0, true)
				_water.draw_line(-ax * s * 0.46 + ay * 8.0, ax * s * 0.3 + ay * 8.0, Color(col.darkened(0.35), 0.6 * k), 1.5, true)
				_water.draw_circle(ax * s * 0.3, 3.0, Color(0.15, 0.12, 0.1, 0.9 * k))
				_water.draw_circle(-ax * s * 0.3, 3.0, Color(0.15, 0.12, 0.1, 0.9 * k))
		"candle":
			for p2: Dictionary in _wp:
				var bob2: float = sin(_t * 1.5 + float(p2["ph"])) * 4.0
				var at: Vector2 = (p2["p"] as Vector2) + Vector2(0, bob2)
				_water.draw_set_transform(at, 0.0, Vector2(1.0, GROUND))
				_water.draw_circle(Vector2.ZERO, 16.0, Color(0.12, 0.1, 0.08, 0.8 * k))
				_water.draw_arc(Vector2.ZERO, 26.0, 0.0, TAU, 20, Color(col, 0.18 * k), 3.0, true)
				_water.draw_set_transform(at, 0.0, Vector2.ONE)
				_water.draw_rect(Rect2(Vector2(-8, -54), Vector2(16, 50)), Color(0.92, 0.88, 0.76, 0.95 * k))
				var fl: float = 0.75 + 0.25 * sin(_t * 8.0 + float(p2["ph"]) * 3.0)
				_water.draw_texture_rect(g, Rect2(Vector2(-90, -150), Vector2(180, 180)), false, Color(col, 0.5 * k * fl))
				_water.draw_circle(Vector2(0, -64), 8.0 * fl, Color(1.0, 0.95, 0.75, 0.95 * k))
		"kelp":
			for p3: Dictionary in _wp:
				_water.draw_set_transform(p3["p"], 0.0, Vector2(1.0, GROUND))
				var s3: float = float(p3["s"])
				var base: Vector2 = Vector2.from_angle(float(p3["rot"]))
				var pts3: PackedVector2Array = PackedVector2Array()
				for i: int in 12:
					var f: float = i / 11.0
					var side: Vector2 = base.orthogonal() * sin(_t * 1.1 + float(p3["ph"]) + f * 4.0) * 22.0 * f
					pts3.append(base * s3 * f + side)
				for j: int in pts3.size() - 1:
					_water.draw_line(pts3[j], pts3[j + 1], Color(col, 0.9 * k), lerpf(18.0, 4.0, j / 11.0), true)
					_water.draw_line(pts3[j], pts3[j + 1], Color(col.lightened(0.25), 0.5 * k), lerpf(4.0, 1.0, j / 11.0), true)
		"shadow":
			for p4: Dictionary in _wp:
				var u: float = float(p4["t"]) / float(p4["life"])
				var at4: Vector2 = (p4["from"] as Vector2).lerp(p4["to"], u)
				var dir: Vector2 = ((p4["to"] as Vector2) - (p4["from"] as Vector2)).normalized()
				var a: float = sin(u * PI) * 0.7 * k
				_water.draw_set_transform(at4, dir.angle(), Vector2(1.0, GROUND * 1.4))
				# A long body, a slow tail: the thing underneath you.
				var body: PackedVector2Array = PackedVector2Array()
				for i2: int in 25:
					var f2: float = i2 / 24.0
					var x: float = lerpf(-900.0, 600.0, f2)
					var wv: float = sin(f2 * PI) * 160.0 * (1.0 - f2 * 0.4)
					body.append(Vector2(x, -wv + sin(_t * 1.4 + f2 * 5.0) * 30.0 * (1.0 - f2)))
				for i3: int in range(24, -1, -1):
					var f3: float = i3 / 24.0
					var x2: float = lerpf(-900.0, 600.0, f3)
					var wv2: float = sin(f3 * PI) * 160.0 * (1.0 - f3 * 0.4)
					body.append(Vector2(x2, wv2 + sin(_t * 1.4 + f3 * 5.0) * 30.0 * (1.0 - f3)))
				_water.draw_colored_polygon(body, Color(col, a))
		"tentacle":
			for p5: Dictionary in _wp:
				var u5: float = float(p5["t"]) / float(p5["life"])
				var at5: Vector2 = (p5["from"] as Vector2).lerp(p5["to"], u5)
				var a5: float = sin(u5 * PI) * 0.85 * k
				var sheen: Color = _look.get("accent", Color(0.3, 0.8, 0.5))
				_water.draw_set_transform(at5, 0.0, Vector2(1.0, GROUND))
				var arm: PackedVector2Array = PackedVector2Array()
				for i4: int in 30:
					var f4: float = i4 / 29.0
					var ang: float = float(p5["ph"]) + f4 * 3.2 + sin(_t * 1.8 + f4 * 3.0) * 0.5
					arm.append(Vector2.from_angle(ang) * (f4 * 700.0) + Vector2(-f4 * 300.0, 0))
				for i5: int in arm.size() - 1:
					var f5: float = i5 / 29.0
					var w5: float = lerpf(90.0, 8.0, f5)
					_water.draw_line(arm[i5], arm[i5 + 1], Color(sheen, a5 * 0.35), w5 + 10.0, true)
					_water.draw_line(arm[i5], arm[i5 + 1], Color(col, a5), w5, true)
				# The suckers, pale along its underside.
				for i6: int in range(2, arm.size() - 2, 2):
					var f6: float = i6 / 29.0
					var nrm: Vector2 = (arm[i6 + 1] - arm[i6]).normalized().orthogonal()
					_water.draw_circle(arm[i6] + nrm * lerpf(30.0, 3.0, f6), lerpf(11.0, 2.0, f6), Color(sheen.lightened(0.3), a5 * 0.45))
		"ink":
			for p6: Dictionary in _wp:
				var u6: float = float(p6["t"]) / float(p6["life"])
				var grow: float = 1.0 - pow(1.0 - minf(1.0, u6 * 1.6), 2.0)
				var a6: float = smoothstep(0.0, 0.15, u6) * (1.0 - smoothstep(0.55, 1.0, u6)) * 0.5 * k
				_water.draw_set_transform(p6["p"], 0.0, Vector2(1.0, GROUND))
				var rim: Color = _look.get("accent", Color(0.3, 0.8, 0.5))
				for b: int in int(p6["n"]):
					var off: Vector2 = Vector2.from_angle(float(p6["ph"]) + b * 2.1) * float(p6["r"]) * 0.45 * grow
					var rr: float = float(p6["r"]) * grow
					# A faint glow at the cloud's edge (the deep's own light), then the ink.
					_water.draw_arc(off, rr * 0.62, 0.0, TAU, 32, Color(rim, a6 * 0.5), 6.0, true)
					_water.draw_texture_rect(g, Rect2(off - Vector2.ONE * rr, Vector2.ONE * rr * 2.0), false, Color(col, minf(1.0, a6 * 2.6)))
	_water.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


static func _shader() -> Shader:
	var sh: Shader = Shader.new()
	sh.code = """shader_type canvas_item;
// The band's murk in the water, rolling, and the dark closing in round her.
uniform vec4 u_murk : source_color = vec4(0.5, 0.6, 0.6, 1.0);
uniform float u_amt = 0.0;
uniform float u_vig = 0.0;
uniform vec2 u_focus = vec2(800.0, 450.0);
uniform vec2 u_res = vec2(1600.0, 900.0);
uniform float u_t = 0.0;
uniform float u_fade = 0.0;
// The clear zone's lean toward the enemy (a share of the screen's width).
uniform float u_bias = 0.17;

float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void fragment() {
	vec2 px = SCREEN_UV * u_res;
	// Round the fight: between her and the enemy off her bow, so both hulls
	// stay clear while the water round them closes in.
	vec2 f = u_focus + vec2(u_res.x * u_bias, 0.0);
	float d = length((px - f) / vec2(u_res.y * 1.45, u_res.y * 0.78));
	float n = vnoise(px / 320.0 + vec2(u_t * 0.03, u_t * 0.012)) * 0.6 + vnoise(px / 110.0 - vec2(u_t * 0.05, 0.0)) * 0.4;
	float haze = u_amt * (0.5 + 0.7 * n) * mix(0.35, 1.0, smoothstep(0.1, 0.6, d));
	float r0 = mix(1.15, 0.16, u_vig);
	float r1 = mix(1.7, 0.66, u_vig);
	float v = smoothstep(r0, r1, d) * min(1.0, u_vig * 1.2) * (0.85 + 0.15 * n);
	float a = clamp(haze + v, 0.0, 0.97);
	vec3 col = mix(u_murk.rgb, u_murk.rgb * 0.12, clamp(v / max(a, 0.001), 0.0, 1.0));
	COLOR = vec4(col, a * u_fade);
}"""
	return sh
