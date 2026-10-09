class_name SquallFx
extends CanvasLayer
## UNDER A FRONT (Godot over the web baseline, 2026-10-01; fronts 2026-10-02):
## rain driven across the screen, and in a Tempest lightning that lights the
## whole sea for an instant; Fog, a pale veil thick toward the edges; a Fair
## Wind, faint streaks of spray running the way it blows. Above the world,
## below the HUD.

signal struck(strength: float)

var rain: float = 0.0
var flash: float = 0.0
var _drops: GPUParticles2D
var _sheet: ColorRect
var _next: float = 6.0
var _strike: float = -1.0
var _power: float = 0.0
var _fog: ColorRect
var _gusts: GPUParticles2D
var fog: float = 0.0
var _drift: Vector2 = Vector2.ZERO


## Fog and wind: the veil's thickness round her, and the spray's way.
func step_air(delta: float, fog_amt: float, focus: Vector2, wind: float, wind_dir: Vector2, screen: Vector2) -> void:
	fog = lerpf(fog, fog_amt, 1.0 - exp(-delta * 0.6))
	_fog.visible = fog > 0.01
	if _fog.visible:
		_drift += Vector2(0.05, 0.02) * delta
		var m: ShaderMaterial = _fog.material
		m.set_shader_parameter("u_amt", fog)
		m.set_shader_parameter("u_focus", focus)
		m.set_shader_parameter("u_res", screen)
		m.set_shader_parameter("u_drift", _drift)
	_gusts.emitting = wind > 0.15
	if _gusts.emitting:
		# On screen the sea is foreshortened: north-south runs shorter.
		var d: Vector2 = Vector2(wind_dir.x, wind_dir.y * 0.6).normalized()
		var gm: ParticleProcessMaterial = _gusts.process_material
		gm.direction = Vector3(d.x, d.y, 0)
		gm.emission_box_extents = Vector3(screen.x * 0.6, screen.y * 0.6, 0)
		_gusts.position = screen / 2.0 - d * screen.length() * 0.25
		_gusts.amount_ratio = clampf(wind, 0.0, 1.0)


func _ready() -> void:
	layer = 1
	_drops = GPUParticles2D.new()
	_drops.amount = 700
	_drops.lifetime = 0.7
	_drops.preprocess = 0.7
	_drops.local_coords = false
	_drops.texture = _streak()
	var m: ParticleProcessMaterial = ParticleProcessMaterial.new()
	m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	m.emission_box_extents = Vector3(1100, 60, 0)
	m.direction = Vector3(-0.28, 1, 0)
	m.spread = 3.0
	m.initial_velocity_min = 1300.0
	m.initial_velocity_max = 1700.0
	m.gravity = Vector3.ZERO
	m.scale_min = 0.6
	m.scale_max = 1.1
	m.particle_flag_align_y = true
	var g: Gradient = Gradient.new()
	g.set_color(0, Color(0.82, 0.88, 0.95, 0.0))
	g.add_point(0.15, Color(0.82, 0.88, 0.95, 0.42))
	g.set_color(g.get_point_count() - 1, Color(0.82, 0.88, 0.95, 0.22))
	var ramp: GradientTexture1D = GradientTexture1D.new()
	ramp.gradient = g
	m.color_ramp = ramp
	_drops.process_material = m
	_drops.emitting = false
	add_child(_drops)
	_sheet = ColorRect.new()
	_sheet.set_anchors_preset(Control.PRESET_FULL_RECT)
	_sheet.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sheet.color = Color(0.78, 0.85, 1.0, 0.0)
	var add: CanvasItemMaterial = CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_sheet.material = add
	add_child(_sheet)
	_fog = ColorRect.new()
	_fog.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fog.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fm: ShaderMaterial = ShaderMaterial.new()
	fm.shader = load("res://game/fx/fog_veil.gdshader")
	_fog.material = fm
	_fog.visible = false
	add_child(_fog)
	_gusts = GPUParticles2D.new()
	_gusts.amount = 90
	_gusts.lifetime = 1.6
	_gusts.local_coords = false
	_gusts.texture = _streak()
	var gm: ParticleProcessMaterial = ParticleProcessMaterial.new()
	gm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	gm.spread = 2.0
	gm.initial_velocity_min = 700.0
	gm.initial_velocity_max = 950.0
	gm.gravity = Vector3.ZERO
	gm.scale_min = 0.4
	gm.scale_max = 0.8
	gm.particle_flag_align_y = true
	var gg: Gradient = Gradient.new()
	gg.set_color(0, Color(0.95, 0.97, 1.0, 0.0))
	gg.add_point(0.4, Color(0.95, 0.97, 1.0, 0.16))
	gg.set_color(gg.get_point_count() - 1, Color(0.95, 0.97, 1.0, 0.0))
	var gr: GradientTexture1D = GradientTexture1D.new()
	gr.gradient = gg
	gm.color_ramp = gr
	_gusts.process_material = gm
	_gusts.emitting = false
	add_child(_gusts)


static func _streak() -> Texture2D:
	var img: Image = Image.create(6, 48, false, Image.FORMAT_RGBA8)
	for y: int in 48:
		for x: int in 6:
			var across: float = 1.0 - absf(x + 0.5 - 3.0) / 3.0
			img.set_pixel(x, y, Color(1, 1, 1, across * float(y) / 48.0))
	return ImageTexture.create_from_image(img)


## How far the rain leans off the fall (0 the gentle lean it always has;
## a gale's wind pushes it over, WeatherFx).
func slant(k: float) -> void:
	var m: ParticleProcessMaterial = _drops.process_material
	m.direction = Vector3(-0.28 + k, 1.0, 0.0).normalized()


## How a strike lights the sky at this age (0..0.9): one sharp pulse, then a
## weaker second one. The ONE clock for a strike: the sky sheet, the world's
## flash and WeatherFx's bolt all read it.
const STRIKE_LIFE: float = 0.5


static func strike_light(age: float) -> float:
	if age < 0.0 or age > STRIKE_LIFE:
		return 0.0
	var first: float = age / 0.06 if age < 0.06 else maxf(0.0, 1.0 - (age - 0.06) / 0.15)
	# The second pulse, 0.20 to 0.26s, eased in and out so it never steps.
	var second: float = 0.5 * smoothstep(0.17, 0.2, age) * (1.0 - smoothstep(0.26, 0.31, age))
	return maxf(first, second) * 0.9


## The night on the rain, the spray and the fog (they sit above the world's
## night CanvasModulate, so they take the dark themselves). tint: the bay's
## own fog colour (white on the open sea).
func night(dark: float, tint: Color = Color.WHITE) -> void:
	var m: Color = Color(1, 1, 1).lerp(Color(0.55, 0.6, 0.75), clampf(dark, 0.0, 1.0))
	_drops.modulate = m
	_gusts.modulate = m
	var fm: ShaderMaterial = _fog.material
	fm.set_shader_parameter("u_dark", clampf(dark, 0.0, 1.0))
	fm.set_shader_parameter("u_tint", Vector3(tint.r, tint.g, tint.b))


## deep: how far into a squall the view is; power: that squall's power;
## storm_floor: a bay written as a standing storm (The Last Fathom), which
## strikes however light its rain.
func step(delta: float, deep: float, power: float, screen: Vector2, storm_floor: float = 0.0) -> void:
	rain = lerpf(rain, deep, 1.0 - exp(-delta * 0.8))
	_power = power
	_drops.position = Vector2(screen.x / 2.0 + 120.0, -40.0)
	(_drops.process_material as ParticleProcessMaterial).emission_box_extents = Vector3(screen.x * 0.75, 40, 0)
	_drops.amount_ratio = clampf(rain * 1.3, 0.0, 1.0)
	_drops.emitting = rain > 0.03
	# Lightning in the heart of a heavy squall: a strike every 7 to 18
	# seconds, two pulses, the second weaker.
	if maxf(deep, storm_floor) > 0.5 and power > 0.8:
		_next -= delta
		if _next <= 0.0:
			_next = randf_range(7.0, 18.0)
			_strike = 0.0
			struck.emit(maxf(deep, storm_floor))
	if _strike >= 0.0:
		_strike += delta
		flash = strike_light(_strike)
		if _strike > STRIKE_LIFE:
			_strike = -1.0
			flash = 0.0
	_sheet.color.a = flash * 0.22
