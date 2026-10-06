class_name ExpFog
extends Node2D
## THE FOG OVER THE CAMPAIGN'S WATER (Godot over the web's xfog canvas; rules
## in core/explore.gd, lib/seaExploreExp). Unsailed water past the Sea Gate
## lies under a bank of cloud. Each 700 cell wears fog by its distance from
## her (clear inside a cell and a half, soft out to 3.2), so the edge moves
## with the hull rather than a square at a time; fog that has lifted never
## comes back, and a cell wholly clear is remembered (sea_explored_exp).
##
## Drawn as one quad over the grid: a small texture holds each cell's cover,
## sampled smooth, and a shader turns it into rolling cloud (two layers of
## drifting noise, thicker where it is deep, a pale lit top and a darker
## underside), lit by the hour.

var sea: Sea
var bits: PackedByteArray = PackedByteArray()
## Cells newly cleared since the last save.
var fresh: Array = []
## Patches lifting for the first time this frame (the charting moment).
signal lifted(cells: Array)
var _alpha: PackedFloat32Array = PackedFloat32Array()
var _img: Image
var _tex: ImageTexture
var _quad: ColorRect
var _mat: ShaderMaterial
var _fading: bool = true


func _ready() -> void:
	z_index = 30
	var w: int = Explore.xfog_w()
	var h: int = Explore.xfog_h()
	_alpha.resize(w * h)
	for i: int in w * h:
		_alpha[i] = 0.0 if Explore.xfog_open(bits, i) else 1.0
	_img = Image.create(w, h, false, Image.FORMAT_R8)
	_tex = ImageTexture.create_from_image(_img)
	_upload()
	var box: Rect2 = Explore.xfog_box()
	_quad = ColorRect.new()
	_quad.position = box.position
	_quad.size = Vector2(w * Explore.XFOG_CELL, h * Explore.XFOG_CELL)
	_quad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mat = ShaderMaterial.new()
	_mat.shader = _shader()
	_mat.set_shader_parameter("u_cover", _tex)
	var n: FastNoiseLite = FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = 0.012
	n.fractal_octaves = 4
	var nt: NoiseTexture2D = NoiseTexture2D.new()
	nt.width = 256
	nt.height = 256
	nt.seamless = true
	nt.noise = n
	_mat.set_shader_parameter("u_noise", nt)
	_mat.set_shader_parameter("u_cells", Vector2(w, h))
	_quad.material = _mat
	add_child(_quad)


func _shader() -> Shader:
	var s: Shader = Shader.new()
	s.code = """shader_type canvas_item;
uniform sampler2D u_cover : filter_linear, repeat_disable;
uniform sampler2D u_noise : filter_linear, repeat_enable;
uniform vec2 u_cells;
uniform float u_time;
uniform float u_dark;
void fragment() {
	// The cell's cover, sampled smooth across cells (half a texel in, so the
	// edges of the grid do not bleed).
	float c = texture(u_cover, UV).r;
	if (c < 0.003) { discard; }
	vec2 p = UV * u_cells * 0.35;
	float n1 = texture(u_noise, p + vec2(u_time * 0.004, u_time * 0.0025)).r;
	float n2 = texture(u_noise, p * 2.3 - vec2(u_time * 0.006, -u_time * 0.003)).r;
	float cloud = n1 * 0.65 + n2 * 0.35;
	// Thin where it is lifting: the edge breaks into wisps.
	float edge = smoothstep(0.0, 1.0, c * 1.25 + (cloud - 0.5) * 0.9);
	float a = clamp(edge, 0.0, 1.0) * (0.86 + cloud * 0.14);
	vec3 lit = mix(vec3(0.70, 0.75, 0.80), vec3(0.88, 0.91, 0.94), cloud);
	vec3 under = vec3(0.30, 0.35, 0.42);
	vec3 col = mix(under, lit, smoothstep(0.25, 0.85, cloud));
	col = mix(col, col * vec3(0.18, 0.22, 0.32), u_dark * 0.8);
	COLOR = vec4(col, a);
}"""
	return s


func _upload() -> void:
	for i: int in _alpha.size():
		_img.set_pixel(i % _img.get_width(), i / _img.get_width(), Color(_alpha[i], 0, 0))
	_tex.update(_img)


func _process(delta: float) -> void:
	if sea == null:
		return
	_mat.set_shader_parameter("u_time", Time.get_ticks_msec() / 1000.0)
	_mat.set_shader_parameter("u_dark", float(SeaClock.at(Clock.now_ms())["darkness"]))
	var at: Vector2 = sea._boat.position
	var changed: bool = false
	var now_lifted: Array = []
	if Explore.in_exp_water(at.y):
		for ci: Variant in Explore.xfog_near(at):
			var i: int = int(ci)
			var want: float = Explore.xfog_cover(i, at)
			if want < _alpha[i]:
				_alpha[i] = want
				changed = true
			if want <= 0.0 and not Explore.xfog_has(bits, i):
				Explore.xfog_set(bits, i)
				fresh.append(i)
				now_lifted.append(i)
	if not now_lifted.is_empty():
		lifted.emit(now_lifted)
	if _fading:
		# Only ever down: lifting is the only way anything here may go.
		var k: float = 1.0 - exp(-2.6 * delta)
		var live: bool = false
		for i: int in _alpha.size():
			var target: float = 0.0 if Explore.xfog_open(bits, i) else 1.0
			if _alpha[i] <= target:
				continue
			_alpha[i] += (target - _alpha[i]) * k
			if _alpha[i] - target < 0.01:
				_alpha[i] = target
			else:
				live = true
			changed = true
		_fading = live
	if changed:
		_fading = true
		_upload()


## Is this point hidden under the fog (for marks and prompts)?
func hides(p: Vector2) -> bool:
	var i: int = Explore.xfog_index(p.x, p.y)
	return i >= 0 and _alpha[i] > 0.6
