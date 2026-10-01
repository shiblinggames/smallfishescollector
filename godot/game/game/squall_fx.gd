class_name SquallFx
extends CanvasLayer
## IN A SQUALL (Godot over the web baseline, 2026-10-01): rain driven across
## the screen on the wind, and in the heaviest squalls lightning that lights
## the whole sea for an instant (the web only paled the storm's shadow, and
## only in the north). Above the world, below the HUD.

signal struck(strength: float)

var rain: float = 0.0
var flash: float = 0.0
var _drops: GPUParticles2D
var _sheet: ColorRect
var _next: float = 6.0
var _strike: float = -1.0
var _power: float = 0.0


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


static func _streak() -> Texture2D:
	var img: Image = Image.create(6, 48, false, Image.FORMAT_RGBA8)
	for y: int in 48:
		for x: int in 6:
			var across: float = 1.0 - absf(x + 0.5 - 3.0) / 3.0
			img.set_pixel(x, y, Color(1, 1, 1, across * float(y) / 48.0))
	return ImageTexture.create_from_image(img)


## deep: how far into a squall the view is; power: that squall's power.
func step(delta: float, deep: float, power: float, screen: Vector2) -> void:
	rain = lerpf(rain, deep, 1.0 - exp(-delta * 0.8))
	_power = power
	_drops.position = Vector2(screen.x / 2.0 + 120.0, -40.0)
	(_drops.process_material as ParticleProcessMaterial).emission_box_extents = Vector3(screen.x * 0.75, 40, 0)
	_drops.amount_ratio = clampf(rain * 1.3, 0.0, 1.0)
	_drops.emitting = rain > 0.03
	# Lightning in the heart of a heavy squall: a strike every 7 to 18
	# seconds, two pulses, the second weaker.
	if deep > 0.5 and power > 0.8:
		_next -= delta
		if _next <= 0.0:
			_next = randf_range(7.0, 18.0)
			_strike = 0.0
			struck.emit(deep)
	if _strike >= 0.0:
		_strike += delta
		var u: float = _strike / 0.5
		flash = (u / 0.12 if u < 0.12 else maxf(0.0, 1.0 - (u - 0.12) / 0.3)) * 0.9
		if u > 0.5 and u < 0.62:
			flash = 0.45
		if u > 1.0:
			_strike = -1.0
			flash = 0.0
	_sheet.color.a = flash * 0.22
