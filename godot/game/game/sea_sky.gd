class_name SeaSky
extends CanvasLayer
## THE SKY OVER THE CHART (Godot port of app/(app)/sea/seaClouds.ts and the
## depth haze in SeaIslandsGPU.tsx, 2026-10-01).
##
##   CLOUDS  at most two aloft, from the eight frames of /sea-clouds.webp,
##           blowing across on the wind with parallax (higher than the sea,
##           so they slide faster than it); their shadows cross the water
##           and the boats under them (in the World, multiplied).
##           Godot: lit by the hour (gold at dusk, slate at night).
##   HAZE    the far half of the screen thickening toward the horizon, in
##           the sea's own pale colour.

const FRAMES: Array = [
	Rect2(0, 0, 600, 269), Rect2(604, 0, 600, 209), Rect2(0, 273, 600, 188), Rect2(604, 273, 600, 303),
	Rect2(0, 580, 600, 124), Rect2(604, 580, 600, 175), Rect2(0, 759, 600, 145), Rect2(604, 759, 392, 152),
]
const WIND: Vector2 = Vector2(9, -4)

var _sheet: Texture2D
var _bodies: Array[Sprite2D] = []
var _shadows: Array[Sprite2D] = []
var _clouds: Array = []
var _next: float = 6.0
var _haze: TextureRect


func _ready() -> void:
	layer = 1
	_sheet = Skipper.tex("sea-clouds.webp")
	_haze = TextureRect.new()
	_haze.set_anchors_preset(Control.PRESET_FULL_RECT)
	_haze.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_haze.stretch_mode = TextureRect.STRETCH_SCALE
	_haze.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	var g: Gradient = Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.add_point(0.28, Color(1, 1, 1, 0.55))
	g.set_color(g.get_point_count() - 1, Color(1, 1, 1, 0))
	g.add_point(0.66, Color(1, 1, 1, 0))
	var gt: GradientTexture2D = GradientTexture2D.new()
	gt.gradient = g
	gt.fill_from = Vector2(0, 0)
	gt.fill_to = Vector2(0, 1)
	gt.width = 4
	gt.height = 128
	_haze.texture = gt
	add_child(_haze)


## The shadows live in the World; the sea hands it over.
func attach(world: Node2D) -> void:
	for i: int in 4:
		var body: Sprite2D = Sprite2D.new()
		body.visible = false
		body.region_enabled = true
		body.texture = _sheet
		add_child(body)
		_bodies.append(body)
		var sh: Sprite2D = Sprite2D.new()
		sh.visible = false
		sh.region_enabled = true
		sh.texture = _sheet
		sh.modulate = Color("#93a8bf")
		var mul: CanvasItemMaterial = CanvasItemMaterial.new()
		mul.blend_mode = CanvasItemMaterial.BLEND_MODE_MUL
		sh.material = mul
		sh.z_index = 3
		world.add_child(sh)
		_shadows.append(sh)
		_clouds.append({ "on": false })


func step(delta: float, cam: Vector2, zoom: float, screen: Vector2, dark: float, warm: float, pale: Color) -> void:
	if _sheet == null:
		return
	_haze.modulate = Color(minf(1.0, pale.r * 0.72 + 0.29), minf(1.0, pale.g * 0.72 + 0.32), minf(1.0, pale.b * 0.72 + 0.36), 0.12 * (1.0 - dark * 0.66))
	_next -= delta
	var aloft: int = 0
	for c: Dictionary in _clouds:
		if c["on"]:
			aloft += 1
	if _next <= 0.0 and aloft < 2:
		_next = randf_range(16.0, 46.0)
		for i: int in _clouds.size():
			var c: Dictionary = _clouds[i]
			if c["on"]:
				continue
			var w: float = randf_range(380.0, 760.0)
			var par: float = randf_range(1.14, 1.42)
			var hw: float = screen.x / 2.0 / zoom / par
			var hh: float = screen.y / 2.0 / zoom / 0.58 / par
			c["on"] = true
			c["frame"] = FRAMES[randi() % FRAMES.size()]
			c["w"] = w
			c["par"] = par
			c["a"] = randf_range(0.20, 0.38) * (1.0 - (760.0 - w) / 380.0 * 0.22)
			c["x"] = cam.x - (hw + w)
			c["y"] = cam.y - randf_range(0.15, 0.95) * hh
			c["age"] = 0.0
			break
	# Godot: clouds take the hour's light.
	var lit: Color = Color(1, 1, 1).lerp(Color(1.0, 0.78, 0.6), warm * 0.7).lerp(Color(0.62, 0.62, 0.77), dark)
	for i: int in _clouds.size():
		var c: Dictionary = _clouds[i]
		var body: Sprite2D = _bodies[i]
		var sh: Sprite2D = _shadows[i]
		if not c["on"]:
			body.visible = false
			sh.visible = false
			continue
		c["age"] = float(c["age"]) + delta
		c["x"] = float(c["x"]) + WIND.x * delta
		c["y"] = float(c["y"]) + WIND.y * delta
		var fr: Rect2 = c["frame"]
		var w: float = float(c["w"])
		var par: float = float(c["par"])
		var sx: float = screen.x / 2.0 + zoom * (float(c["x"]) - cam.x) * par
		var sy: float = screen.y / 2.0 + zoom * 0.58 * (float(c["y"]) - cam.y) * par
		var draw_w: float = w * zoom
		var draw_h: float = draw_w * fr.size.y / fr.size.x
		if sx > screen.x + draw_w * 1.2 or sy < -draw_h * 2.0 or sy > screen.y + draw_h * 2.0:
			c["on"] = false
			continue
		var fade: float = minf(1.0, float(c["age"]) / 2.6)
		body.visible = true
		body.region_rect = fr
		body.position = Vector2(sx, sy)
		body.scale = Vector2.ONE * (draw_w / fr.size.x)
		body.modulate = Color(lit.r, lit.g, lit.b, float(c["a"]) * fade * (1.0 - dark * 0.72))
		sh.visible = true
		sh.region_rect = fr
		sh.position = Vector2(float(c["x"]) + w * 0.12, float(c["y"]) + w * 0.40)
		sh.scale = Vector2(w / fr.size.x, w / fr.size.x)
		# Multiplied: white leaves the water alone, the tint darkens it.
		sh.modulate = Color(1, 1, 1).lerp(Color("#93a8bf"), 0.55 * fade * (1.0 - dark))
