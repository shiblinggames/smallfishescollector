class_name Glow
extends RefCounted
## Soft round textures for lights and particles, made once and shared.

static var _cache: Dictionary = {}


static func radial(size_px: int, col: Color) -> GradientTexture2D:
	var key: String = "%d:%s" % [size_px, col.to_html()]
	if _cache.has(key):
		return _cache[key]
	var g: Gradient = Gradient.new()
	g.set_color(0, col)
	g.set_color(1, Color(col, 0.0))
	var t: GradientTexture2D = GradientTexture2D.new()
	t.gradient = g
	t.width = size_px
	t.height = size_px
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	_cache[key] = t
	return t
