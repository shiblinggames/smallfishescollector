class_name Glow
extends RefCounted
## Soft round textures for lights and particles, made once and shared.
##
## A LIGHT'S texture must fade to BLACK: a 2D light adds the texture's colour
## and ignores its alpha, so a gradient fading to transparent orange lights its
## whole square (that was the rectangles on the water). Particles fade to
## transparent in their own colour, so their edges do not grey.

static var _cache: Dictionary = {}


## A BEAM for a light: a cone from the picture's centre out to its right
## edge, bright along its axis and fading to the sides and the far end; the
## left half dark. For a PointLight2D turned to where the light points.
static var _beam: ImageTexture


static func beam() -> ImageTexture:
	if _beam != null:
		return _beam
	var n: int = 256
	var img: Image = Image.create(n, n, false, Image.FORMAT_RGBA8)
	var c: Vector2 = Vector2(n, n) / 2.0
	for y: int in n:
		for x: int in n:
			var v: Vector2 = Vector2(x, y) + Vector2(0.5, 0.5) - c
			var a: float = 0.0
			if v.x > 0.0:
				var reach: float = v.length() / (n / 2.0)
				var off: float = absf(atan2(v.y, v.x))
				var cone: float = 1.0 - smoothstep(0.32, 0.62, off)
				a = cone * clampf(1.0 - reach, 0.0, 1.0)
				a = pow(a, 1.3)
			# A small pool round the lamp itself, so the boat is lit too.
			a = maxf(a, clampf(1.0 - v.length() / 26.0, 0.0, 1.0) * 0.7)
			img.set_pixel(x, y, Color(a, a, a, 1.0))
	_beam = ImageTexture.create_from_image(img)
	return _beam


static func radial(size_px: int, col: Color, for_light: bool = false) -> GradientTexture2D:
	var key: String = "%d:%s:%s" % [size_px, col.to_html(), for_light]
	if _cache.has(key):
		return _cache[key]
	var g: Gradient = Gradient.new()
	g.set_color(0, col)
	g.set_color(1, Color(0, 0, 0, 0) if for_light else Color(col, 0.0))
	var t: GradientTexture2D = GradientTexture2D.new()
	t.gradient = g
	t.width = size_px
	t.height = size_px
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	_cache[key] = t
	return t
