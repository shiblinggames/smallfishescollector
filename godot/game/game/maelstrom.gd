class_name Maelstrom
extends Node2D
## THE TWO MAELSTROMS (a port of app/(app)/sea/seaMaelstrom.ts): the
## gauntlets' doors on the campaign's water. The house painting of the
## whirlpool (sea/mael-davy.webp, sea/mael-don.webp), turned slowly and laid
## through a PERSPECTIVE MESH whose corners form a keystone (the near edge
## wide and low, the far edge narrow and high): a bowl seen from a deck, not a
## decal on the water. Under its mouth, a THROAT: terraces each smaller,
## darker and dropped further below the plane, turning faster the deeper, the
## whole throat leaning toward the camera as it comes alongside, so the eye at
## the bottom reads as down. The sea streams in across the skirt; the lip
## breaks and throws spray, which arcs and falls under gravity (GPU particle
## physics); foam rides the bowl; the theme's spirits rise from (Davy) or sink
## into (the Don) the eye; the keeper (Davy Jones, Don's Ghost) stands in the
## light at the floor and climbs the throat as you come in.
##
## (No wreckage now: Kong, 2026-10-05, the debris fields "look cheap"; the
## rigid bodies that carried it round the bowl are gone with it.) The hull
## still feels the pull (Boat, whirl).
##
## Everything is quiet from across the water and rouses as the camera nears;
## out of sight it rests.

var info: Dictionary = {}
var gather: bool = false
var why: String = ""
## Whose face may stand in the door (the Don's only once the Throne is down).
var show_keeper: bool = true

const TEX: float = 512.0
const R: float = 200.0
const FAR_W: float = 0.68
const FAR_H: float = 0.70
const NEAR_W: float = 1.04
const NEAR_H: float = 1.14
const DEPTH: float = 0.2
const NARROW: float = 0.82
const TERRACES: int = 6
const LEAN: float = 0.5
const KEY_W: float = (FAR_W + NEAR_W) / 2.0
const KEY_H: float = (FAR_H + NEAR_H) / 2.0
const KEY_DROP: float = (NEAR_H - FAR_H) / 2.0
const SKIRT_DROP: float = 0.3
const SKIRT_H: float = 0.78
const STREAM_OUT: float = 1.95
const STREAM_IN: float = 1.02
const DEPTH_FAR: float = 0.74
const DEPTH_NEAR: float = 1.14
const FOAM_N: int = 120
const SPIRIT_N: int = 40
const STREAM_N: int = 5

const THEMES: Dictionary = {
	"davy": { "arm": Color("#156f6c"), "mid": Color("#1f918c"), "wisp": Color("#5fc9c6"), "core": Color("#a6eef0"), "eye": Color("#1a7f7a"), "foam": Color("#8fd6d8"),
		"spirit": Color("#9cf0ff"), "speed": 0.5, "rise": true, "face": "davyjones.png", "paint": "sea/mael-davy.webp" },
	"don": { "arm": Color("#1f4a3a"), "mid": Color("#2f6a52"), "wisp": Color("#7fb098"), "core": Color("#d8e6dc"), "eye": Color("#275c46"), "foam": Color("#93b9a5"),
		"spirit": Color("#d6b25c"), "speed": 0.4, "rise": false, "face": "donsgauntlet.png", "paint": "sea/mael-don.webp" },
}

var _th: Dictionary
var _r: float = 640.0
var _t: float = 0.0
var _g: float = 0.0
var _spd: float = 0.5
var _paint: MeshInstance2D
var _paint_mat: ShaderMaterial
var _dark: MeshInstance2D
var _dark_mat: ShaderMaterial
var _terr: Array = []
var _floor: Sprite2D
var _wall: Sprite2D
var _lip: Sprite2D
var _eye: Sprite2D
var _core: Sprite2D
var _beam: Sprite2D
var _keeper: Sprite2D
var _keeper_mat: ShaderMaterial
var _streams: Array = []
var _drag: Sprite2D
var _drag_h: Node2D
var _spray: GPUParticles2D
var _spray_h: Node2D
var _motes: Motes
var _foam: Array = []
var _spirits: Array = []
var _label: Label
var _sub: Label
var _name_holder: Node2D
var _awake: bool = true
var _lx: float = 0.0
var _ly: float = 0.0
var _heave: float = 1.0

static var _hole: Texture2D
static var _disc: Texture2D
static var _ring: Texture2D
static var _liptex: Texture2D
static var _mote: Texture2D
static var _mid: Texture2D
static var _wisp: Texture2D

const PAINT_SHADER: String = """shader_type canvas_item;
uniform float rot = 0.0;
uniform float fill = 0.957;
void fragment() {
	vec2 p = (UV - 0.5) / fill;
	float c = cos(rot); float s = sin(rot);
	p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
	vec2 uv = p + 0.5;
	vec4 col = texture(TEXTURE, uv);
	if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { col.a = 0.0; }
	COLOR = col;
}
"""
const DARK_SHADER: String = """shader_type canvas_item;
uniform float storm_r = 0.42;
uniform float storm_a = 0.26;
uniform float funnel_r = 0.41;
uniform float funnel_a = 0.5;
float hole(float d) {
	if (d >= 1.0) { return 0.0; }
	if (d < 0.5) { return mix(1.0, 0.9, d / 0.5); }
	return mix(0.9, 0.0, (d - 0.5) / 0.5);
}
void fragment() {
	float d = length(UV - 0.5);
	float a1 = hole(d / storm_r) * storm_a;
	float a2 = hole(d / funnel_r) * funnel_a;
	COLOR = vec4(0.0, 0.0, 0.0, 1.0 - (1.0 - a1) * (1.0 - a2));
}
"""
const GHOST_SHADER: String = """shader_type canvas_item;
uniform float solid = 0.0;
void fragment() {
	vec4 c = texture(TEXTURE, UV);
	float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
	vec3 g = min(vec3(1.0), (c.rgb * 0.5 + l * 0.5) * 0.8 + 50.0 / 255.0);
	c.rgb = mix(g, c.rgb, solid);
	float from = mix(0.5, 0.62, solid);
	c.a *= 1.0 - smoothstep(from, 1.0, UV.y);
	COLOR = c * COLOR;
}
"""


func _ready() -> void:
	position = Vector2(float(info["x"]), float(info["y"]))
	z_index = -1
	_r = float(info["r"])
	_th = THEMES.get(str(info.get("id", "davy")), THEMES["davy"])
	_spd = float(_th["speed"])
	_textures()
	var foam: Color = _th["foam"]
	# The sea streaming in, under the mouth.
	_drag_h = Node2D.new()
	add_child(_drag_h)
	_drag = _sprite(_wisp, foam, 0.0, true)
	_drag_h.add_child(_drag)
	for i: int in STREAM_N:
		var h: Node2D = Node2D.new()
		add_child(h)
		var s: Sprite2D = _sprite(_ring, foam, 0.0, true)
		h.add_child(s)
		_streams.append({ "s": s, "h": h, "q": float(i) / STREAM_N })
	# The painting on its keystone, then the dark that deepens it.
	_paint = MeshInstance2D.new()
	_paint.mesh = _keystone_mesh()
	_paint.texture = Skipper.tex(str(_th["paint"]))
	_paint_mat = ShaderMaterial.new()
	_paint_mat.shader = _shader(PAINT_SHADER)
	_paint.material = _paint_mat
	add_child(_paint)
	_dark = MeshInstance2D.new()
	_dark.mesh = _paint.mesh
	_dark_mat = ShaderMaterial.new()
	_dark_mat.shader = _shader(DARK_SHADER)
	_dark.material = _dark_mat
	var white: Image = Image.create(4, 4, false, Image.FORMAT_RGBA8)
	white.fill(Color.WHITE)
	_dark.texture = ImageTexture.create_from_image(white)
	add_child(_dark)
	# The foam, the throat's terraces, the wreckage on the far side.
	_motes = Motes.new()
	_motes.owner_m = self
	add_child(_motes)
	for i2: int in range(1, TERRACES + 1):
		var u: float = float(i2) / TERRACES
		var dk: Sprite2D = _sprite(_hole, Color.BLACK, 0.3, false)
		var band: Sprite2D = _sprite(_mid if i2 % 2 == 1 else _wisp, _th["mid"] if i2 % 2 == 1 else _th["wisp"], 0.2, true)
		band.rotation = randf() * TAU
		add_child(dk)
		add_child(band)
		_terr.append({ "u": u, "dark": dk, "band": band })
	_floor = _sprite(_hole, Color.BLACK, 0.8, false)
	_wall = _sprite(_disc, _th["mid"], 0.12, true)
	_lip = _sprite(_liptex, foam, 0.0, true)
	add_child(_floor)
	add_child(_wall)
	add_child(_lip)
	# Spray off the lip: GPU particles that arc and fall under gravity, in an
	# upright holder (the plane is squashed; the air above it is not).
	_spray_h = Node2D.new()
	_spray_h.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	add_child(_spray_h)
	_spray = GPUParticles2D.new()
	_spray.amount = 70
	_spray.lifetime = 1.1
	_spray.preprocess = 1.0
	_spray.texture = _mote
	_spray.local_coords = true
	_spray.visibility_rect = Rect2(-_r * 2.0, -_r * 2.0, _r * 4.0, _r * 4.0)
	var add: CanvasItemMaterial = CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_spray.material = add
	var pm: ParticleProcessMaterial = ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_POINTS
	var pts: Image = Image.create(128, 1, false, Image.FORMAT_RGF)
	for k: int in 128:
		var a: float = k / 128.0 * TAU
		var lp: Vector2 = Vector2(cos(a) * _r * 0.97 * KEY_W, sin(a) * _r * 0.97 * KEY_H + _r * 0.97 * KEY_DROP)
		pts.set_pixel(k, 0, Color(lp.x, lp.y * Chart.GROUND, 0.0))
	pm.emission_point_texture = ImageTexture.create_from_image(pts)
	pm.emission_point_count = 128
	pm.direction = Vector3(0, -1, 0)
	pm.spread = 24.0
	pm.initial_velocity_min = 90.0
	pm.initial_velocity_max = 220.0
	pm.gravity = Vector3(0, 380, 0)
	pm.radial_accel_min = -40.0
	pm.radial_accel_max = -10.0
	pm.scale_min = 0.18
	pm.scale_max = 0.42
	var g: Gradient = Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.25, 1.0])
	g.colors = PackedColorArray([Color(foam, 0.0), Color(foam, 0.7), Color(foam, 0.0)])
	var gt: GradientTexture1D = GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	_spray.process_material = pm
	_spray_h.add_child(_spray)
	# The light at the floor, the keeper standing in it.
	_eye = _sprite(_disc, _th["eye"], 0.35, true)
	_core = _sprite(_disc, _th["core"], 0.3, true)
	_beam = _sprite(_disc, _th["core"], 0.0, true)
	add_child(_eye)
	add_child(_core)
	add_child(_beam)
	_keeper = Sprite2D.new()
	_keeper.texture = Skipper.tex(str(_th["face"]))
	_keeper.centered = false
	_keeper_mat = ShaderMaterial.new()
	_keeper_mat.shader = _shader(GHOST_SHADER)
	_keeper.material = _keeper_mat
	add_child(_keeper)
	# The spirits, then the near-side wreckage over everything.
	_motes.spirit_layer = Spirits.new()
	_motes.spirit_layer.owner_m = self
	add_child(_motes.spirit_layer)
	for k2: int in FOAM_N:
		_foam.append({ "ang": randf() * TAU, "r": R * (0.3 + randf() * 0.75), "size": 3.0 + randf() * 6.0 })
	for k3: int in SPIRIT_N:
		_spirits.append({ "ang": 0.0, "r": 0.0, "h": 0.0, "age": randf() * 3.0, "life": 2.2 + randf() * 2.2, "size": 8.0 + randf() * 12.0 })
	# The name over it.
	var holder: Node2D = Node2D.new()
	holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	holder.position = Vector2(0, _r * 1.2)
	holder.z_index = 6
	add_child(holder)
	_name_holder = holder
	# Lettering on the water: the one ink (the name, its line under in INK_2).
	_label = Kit.lift(Kit.text(holder, str(info.get("name", "")), "heading", Kit.SEA_INK))
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.resized.connect(func() -> void: _label.position = Vector2(-_label.size.x / 2.0, 0))
	_sub = Kit.lift(Kit.text(holder, "", "small", Kit.INK_2))
	_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sub.modulate.a = 0.0
	_sub.resized.connect(func() -> void: _sub.position = Vector2(-_sub.size.x / 2.0, 34))


## The night undone for its name (Sea's lift, through CampaignWater): words on
## the water stay bright when the world dims.
func set_lift(c: Color) -> void:
	if _name_holder != null:
		_name_holder.modulate = c


# ── Made once ─────────────────────────────────────────────────────────────────

static func _shader(code: String) -> Shader:
	var s: Shader = Shader.new()
	s.code = code
	return s


func _sprite(tex: Texture2D, col: Color, a: float, additive: bool) -> Sprite2D:
	var s: Sprite2D = Sprite2D.new()
	s.texture = tex
	s.modulate = Color(col, a)
	if additive:
		var m: CanvasItemMaterial = CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		s.material = m
	return s


static func _textures() -> void:
	if _hole != null:
		return
	_hole = _radial([[0.0, Color(1, 1, 1, 1)], [0.5, Color(1, 1, 1, 0.9)], [1.0, Color(1, 1, 1, 0)]])
	_disc = _radial([[0.0, Color(1, 1, 1, 0.95)], [0.4, Color(1, 1, 1, 0.4)], [1.0, Color(1, 1, 1, 0)]])
	_mote = _radial([[0.0, Color(1, 1, 1, 1)], [0.4, Color(1, 1, 1, 0.6)], [1.0, Color(1, 1, 1, 0)]], 32)
	_ring = _radial([[0.0, Color(1, 1, 1, 0)], [0.88, Color(1, 1, 1, 0)], [0.95, Color(1, 1, 1, 1)], [1.0, Color(1, 1, 1, 0)]])
	_liptex = _radial([[0.0, Color(1, 1, 1, 0)], [0.84, Color(1, 1, 1, 0)], [0.91, Color(1, 1, 1, 0.45)], [0.955, Color(1, 1, 1, 1)], [0.985, Color(1, 1, 1, 0.3)], [1.0, Color(1, 1, 1, 0)]])
	_mid = _spiral(4, 1.7, 13.0)
	_wisp = _spiral(6, 2.4, 7.0)


static func _radial(stops: Array, size: int = 256) -> GradientTexture2D:
	var g: Gradient = Gradient.new()
	g.offsets = PackedFloat32Array(stops.map(func(s: Array) -> float: return s[0]))
	g.colors = PackedColorArray(stops.map(func(s: Array) -> Color: return s[1]))
	var t: GradientTexture2D = GradientTexture2D.new()
	t.gradient = g
	t.width = size
	t.height = size
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	return t


## A logarithmic spiral of `arms` soft bands (white): thin at the eye, broad
## at the rim, fading at both ends (the web's spiralTexture, drawn as a field).
static func _spiral(arms: int, turns: float, width: float) -> ImageTexture:
	var S: int = 160
	var img: Image = Image.create(S, S, false, Image.FORMAT_RGBA8)
	var c: float = S / 2.0
	for y: int in S:
		for x: int in S:
			var dx: float = x - c
			var dy: float = y - c
			var rr: float = sqrt(dx * dx + dy * dy) / (c - 3.0)
			if rr > 1.0 or rr < 0.03:
				img.set_pixel(x, y, Color(1, 1, 1, 0))
				continue
			var tt: float = pow(rr, 1.0 / 0.85)
			var th: float = atan2(dy, dx)
			var ph: float = fposmod(th - tt * TAU * turns, TAU / arms) / (TAU / arms)
			var d: float = minf(ph, 1.0 - ph) * TAU / arms * rr * c
			var w: float = width * (0.3 + tt * 1.2) * float(S) / 512.0
			var a: float = clampf(1.0 - d / maxf(0.5, w), 0.0, 1.0)
			a *= 0.12 + 0.7 * sin(tt * PI)
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)


## The keystone, a projective grid: the far edge narrow and high, the near
## edge wide and low (PerspectiveMesh's mapping, square to quad).
func _keystone_mesh() -> ArrayMesh:
	var e: float = _r * 1.2
	var p0: Vector2 = Vector2(-e * FAR_W, -e * FAR_H)
	var p1: Vector2 = Vector2(e * FAR_W, -e * FAR_H)
	var p2: Vector2 = Vector2(e * NEAR_W, e * NEAR_H)
	var p3: Vector2 = Vector2(-e * NEAR_W, e * NEAR_H)
	var sx: float = p0.x - p1.x + p2.x - p3.x
	var sy: float = p0.y - p1.y + p2.y - p3.y
	var dx1: float = p1.x - p2.x
	var dx2: float = p3.x - p2.x
	var dy1: float = p1.y - p2.y
	var dy2: float = p3.y - p2.y
	var den: float = dx1 * dy2 - dx2 * dy1
	var gg: float = (sx * dy2 - dx2 * sy) / den
	var hh: float = (dx1 * sy - sx * dy1) / den
	var a: float = p1.x - p0.x + gg * p1.x
	var b: float = p3.x - p0.x + hh * p3.x
	var d: float = p1.y - p0.y + gg * p1.y
	var ee: float = p3.y - p0.y + hh * p3.y
	var N: int = 16
	var verts: PackedVector2Array = []
	var uvs: PackedVector2Array = []
	for j: int in N + 1:
		for i: int in N + 1:
			var u: float = float(i) / N
			var v: float = float(j) / N
			var w: float = gg * u + hh * v + 1.0
			verts.append(Vector2((a * u + b * v + p0.x) / w, (d * u + ee * v + p0.y) / w))
			uvs.append(Vector2(u, v))
	var idx: PackedInt32Array = []
	for j2: int in N:
		for i2: int in N:
			var k: int = j2 * (N + 1) + i2
			idx.append_array([k, k + 1, k + N + 1, k + 1, k + N + 2, k + N + 1])
	var arr: Array = []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_TEX_UV] = uvs
	arr[Mesh.ARRAY_INDEX] = idx
	var m: ArrayMesh = ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m


## A flat point (world units about the eye) laid on the keystone.
func keystone(fx: float, fy: float) -> Vector2:
	var e: float = _r * 1.2
	var v: float = clampf((fy / e + 1.0) / 2.0, 0.0, 1.0)
	var w: float = FAR_W + (NEAR_W - FAR_W) * v
	return Vector2(fx * w, fy * FAR_H if fy < 0.0 else fy * NEAR_H)


static func depth_k(s: float) -> float:
	return DEPTH_FAR + (DEPTH_NEAR - DEPTH_FAR) * (s + 1.0) / 2.0


func _throat_r(u: float) -> float:
	return _r * (1.0 - NARROW * pow(u, 0.9))


func _throat_y(u: float) -> float:
	return (_r * DEPTH * pow(u, 1.6)) / Chart.GROUND


## A point at depth u down the throat: [x, y, radius], leaned to the camera.
func at_depth(u: float) -> Vector3:
	var y: float = _throat_y(u) * _heave
	return Vector3(_lx * y * Chart.GROUND * LEAN, y + _ly * y * LEAN * 0.6, _throat_r(u))


func _ring_at(sp: Sprite2D, u: float, w: float) -> void:
	var a: Vector3 = at_depth(u)
	sp.position = Vector2(a.x, a.y + a.z * KEY_DROP)
	var tw: float = float(sp.texture.get_width())
	sp.scale = Vector2(a.z * 2.0 * w * KEY_W / tw, a.z * 2.0 * w * KEY_H / tw)


func _flat_ring(h: Node2D, s: Sprite2D, rad: float) -> void:
	var k: float = clampf((rad / _r - 1.0) / (STREAM_OUT - 1.0), 0.0, 1.0)
	var drop: float = KEY_DROP + k * (SKIRT_DROP - KEY_DROP)
	var hk: float = KEY_H + k * (SKIRT_H - KEY_H)
	var tw: float = float(s.texture.get_width())
	h.position = Vector2(0, rad * drop)
	h.scale = Vector2(rad * 2.0 * KEY_W / tw, rad * 2.0 * hk / tw)


# ── Each frame ────────────────────────────────────────────────────────────────

func _process(delta: float) -> void:
	_t += delta
	_g = move_toward(_g, 1.0 if gather else 0.0, delta * 2.0)
	if _sub != null:
		# The line under the name eases in and out (lettering on the water
		# never pops); the words change only while it shows something.
		var line: String = why if why != "" else ("Dive alone or with your crew" if gather else "")
		if line != "":
			_sub.text = line
		_sub.modulate.a = Motion.near(_sub.modulate.a, line != "", delta)
	var cam: Camera2D = get_viewport().get_camera_2d()
	var cp: Vector2 = cam.get_screen_center_position() if cam != null else global_position
	# The camera in the world's own units (the world is squashed).
	var world: Node2D = get_parent() as Node2D
	var camw: Vector2 = world.to_local(cp) if world != null else cp
	var off: Vector2 = camw - position
	var on: bool = visible and off.length() < _r * 9.0
	if on != _awake:
		_awake = on
		_spray.emitting = on
	if not on:
		return
	# How roused it is: by how near the camera is.
	var dd: float = off.length()
	var g: float = clampf(1.0 - (dd - _r) / (_r * 1.5), 0.0, 1.0)
	g = maxf(g, _g * 0.8)
	var gg: float = g * g
	var quiet: float = 0.6 if why != "" else 1.0
	var spd: float = _spd * (1.0 + 0.9 * gg) * quiet
	_lx = clampf(off.x / (_r * 2.5), -1.0, 1.0)
	_ly = clampf(off.y / (_r * 2.5), -1.0, 1.0)
	_heave = 1.0 + 0.06 * sin(_t * 0.9)
	var breathe: float = 1.0 + 0.035 * sin(_t * 0.9)
	# The painting turns; the dark deepens it.
	_paint_mat.set_shader_parameter("rot", -_t * _spd * 0.55 * (1.0 + 0.5 * gg) * (-1.0 if str(info.get("id", "")) == "don" else 1.0))
	_dark_mat.set_shader_parameter("storm_a", 0.26 + 0.5 * gg)
	_dark_mat.set_shader_parameter("storm_r", (R * (2.15 + 0.35 * gg) / 2.0) / TEX)
	_dark_mat.set_shader_parameter("funnel_r", (R * 2.1 * breathe / 2.0) / TEX)
	_dark_mat.set_shader_parameter("funnel_a", 0.48 + 0.2 * gg)
	# The sea falls in.
	for st: Dictionary in _streams:
		st["q"] = float(st["q"]) + delta * (0.1 + 0.14 * gg)
		if float(st["q"]) >= 1.0:
			st["q"] = float(st["q"]) - 1.0
		var q: float = float(st["q"])
		var rr: float = _r * (STREAM_OUT + (STREAM_IN - STREAM_OUT) * q)
		_flat_ring(st["h"], st["s"], rr)
		(st["s"] as Sprite2D).rotation += delta * spd * (0.3 + 1.5 * q)
		(st["s"] as Sprite2D).modulate.a = (0.05 + 0.11 * gg) * sin(q * PI)
	_flat_ring(_drag_h, _drag, _r * 1.45)
	_drag.rotation += delta * spd * 0.42
	_drag.modulate.a = 0.04 + 0.07 * gg
	# The throat.
	for tr: Dictionary in _terr:
		var u: float = float(tr["u"])
		_ring_at(tr["dark"], u, 1.15)
		(tr["dark"] as Sprite2D).modulate.a = 0.2 + 0.14 * u + 0.1 * gg
		_ring_at(tr["band"], u, 1.02)
		(tr["band"] as Sprite2D).rotation += delta * spd * (1.0 + 2.6 * u)
		(tr["band"] as Sprite2D).modulate.a = 0.05 + 0.07 * u + 0.06 * gg
	var fl: Vector3 = at_depth(1.0)
	var fpos: Vector2 = Vector2(fl.x, fl.y + fl.z * KEY_DROP)
	_ring_at(_floor, 1.0, 1.3)
	_floor.modulate.a = 0.66 + 0.2 * gg
	var wl: Vector3 = at_depth(0.5)
	_wall.position = Vector2(wl.x, wl.y - wl.z * 0.5)
	_wall.scale = Vector2(wl.z * 2.2 * KEY_W, wl.z * 1.3 * KEY_H) / 256.0
	_wall.modulate.a = 0.08 + 0.12 * gg
	# The lip breaks.
	_ring_at(_lip, 0.0, breathe)
	_lip.modulate.a = (0.12 + 0.24 * gg) * (0.72 + 0.18 * sin(_t * 2.3) + 0.14 * sin(_t * 3.7 + 1.2))
	_spray.amount_ratio = 0.35 + 0.65 * gg
	_spray.speed_scale = 0.8 + 0.5 * gg
	# The eye beats; the keeper stands in its light and climbs as you come.
	var beat: float = sin(_t * (1.6 + 2.4 * gg))
	_eye.position = fpos
	_core.position = fpos
	_eye.modulate.a = 0.28 + 0.15 * beat + 0.2 * gg
	_core.modulate.a = 0.25 + 0.3 * maxf(0.0, beat) + 0.3 * gg
	_core.scale = Vector2(1.0, 1.0 / Chart.GROUND) * (fl.z * 1.1 / 256.0) * (1.0 + 0.25 * maxf(0.0, beat))
	_eye.scale = Vector2(1.0, 1.0 / Chart.GROUND) * (fl.z * 2.6 / 256.0)
	_beam.position = fpos - Vector2(0, _r * 0.16 / Chart.GROUND)
	_beam.scale = Vector2(1.0, 1.0 / Chart.GROUND) * (_r * 0.5 / 256.0)
	_beam.modulate.a = 0.12 + 0.3 * gg
	_keeper.visible = show_keeper and _keeper.texture != null
	if _keeper.visible:
		var kw: float = _r * 0.52
		var ks: float = kw / float(_keeper.texture.get_width())
		_keeper.scale = Vector2(ks, ks / Chart.GROUND)
		var kh: float = _keeper.texture.get_height() * ks / Chart.GROUND
		_keeper.position = Vector2(fpos.x - kw / 2.0, fpos.y * (1.0 - 0.85 * gg) - (10.0 * sin(_t * 0.8)) / Chart.GROUND - kh)
		_keeper.modulate.a = (0.35 + 0.45 * gg) * (0.85 + 0.15 * sin(_t * 0.9))
	# The foam, spiralling in.
	for f: Dictionary in _foam:
		var k: float = R / maxf(float(f["r"]), 12.0)
		f["ang"] = float(f["ang"]) + delta * spd * 1.4 * k
		f["r"] = float(f["r"]) - delta * (6.0 + 22.0 * (1.0 - float(f["r"]) / R)) * (1.0 + 0.6 * gg)
		if float(f["r"]) < R * 0.3:
			f["r"] = R * (0.94 + randf() * 0.12)
			f["ang"] = randf() * TAU
	# The spirits.
	var rise: bool = _th["rise"]
	for s: Dictionary in _spirits:
		s["age"] = float(s["age"]) + delta * (1.0 + 0.5 * gg)
		if float(s["age"]) >= float(s["life"]):
			s["age"] = 0.0
			s["life"] = 2.2 + randf() * 2.2
			s["ang"] = randf() * TAU
			s["r"] = _r * (0.08 + randf() * 0.2) if rise else _r * (0.95 + randf() * 0.2)
		var su: float = float(s["age"]) / float(s["life"])
		if rise:
			s["ang"] = float(s["ang"]) + delta * 0.9
			s["r"] = float(s["r"]) + delta * _r * 0.2
			s["h"] = su * su * (220.0 + 180.0 * gg)
			s["a"] = sin(su * PI) * (0.45 + 0.35 * gg)
		else:
			var k2: float = _r / maxf(float(s["r"]), 50.0)
			s["ang"] = float(s["ang"]) + delta * spd * 1.6 * k2
			s["r"] = float(s["r"]) - delta * _r * 0.28
			s["h"] = (1.0 - su) * 36.0
			s["a"] = (0.25 + 0.55 * maxf(0.0, sin(_t * 7.0 + float(s["ang"]) * 3.0))) * sin(su * PI)
	_motes.queue_redraw()
	_motes.spirit_layer.queue_redraw()


## The foam on the bowl (laid on the keystone, additive).
class Motes:
	extends Node2D
	var owner_m: Maelstrom
	var spirit_layer: Spirits

	func _ready() -> void:
		var m: CanvasItemMaterial = CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = m

	func _draw() -> void:
		var m: Maelstrom = owner_m
		var foam: Color = m._th["foam"]
		var flat_to_world: float = m._r * 2.4 / TEX
		for f: Dictionary in m._foam:
			var fr: float = float(f["r"])
			var near: float = 1.0 - fr / R
			var fp: Vector2 = Vector2(cos(float(f["ang"])), sin(float(f["ang"]))) * fr * flat_to_world
			var kp: Vector2 = m.keystone(fp.x, fp.y)
			var s: float = float(f["size"]) * (0.55 + 0.7 * near) * Maelstrom.depth_k(sin(float(f["ang"]))) * flat_to_world
			draw_texture_rect(Maelstrom._mote, Rect2(kp - Vector2(s, s), Vector2(s, s) * 2.0), false, Color(foam, (0.14 + 0.5 * near) * 0.8))


## The spirits rising out of (or sinking into) the eye.
class Spirits:
	extends Node2D
	var owner_m: Maelstrom

	func _ready() -> void:
		var m: CanvasItemMaterial = CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = m
		z_index = 4

	func _draw() -> void:
		var m: Maelstrom = owner_m
		var col: Color = m._th["spirit"]
		for s: Dictionary in m._spirits:
			if not s.has("a"):
				continue
			var ang: float = float(s["ang"])
			var kp: Vector2 = m.keystone(cos(ang) * float(s["r"]), sin(ang) * float(s["r"]))
			var su: float = clampf(1.0 - float(s["r"]) / (m._r * 1.05), 0.0, 1.0)
			var dp: Vector3 = m.at_depth(su)
			var p: Vector2 = Vector2(kp.x * (1.0 - su * NARROW * 0.5) + dp.x, kp.y * (1.0 - su * NARROW * 0.5) + dp.y - float(s["h"]) / Chart.GROUND)
			var sz: float = float(s["size"]) * Maelstrom.depth_k(sin(ang))
			draw_texture_rect(Maelstrom._mote, Rect2(p - Vector2(sz, sz / Chart.GROUND) / 2.0, Vector2(sz, sz / Chart.GROUND)), false, Color(col, clampf(float(s["a"]), 0.0, 1.0)))
