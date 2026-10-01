class_name Lit
extends RefCounted
## LAND THAT TAKES THE LIGHT (Godot over the web baseline, 2026-10-01): a
## painting paired with the normal map tools/setup.mjs made from it, so the
## sun and the lanterns shade it from the side they are on.


## The picture at this art path, with its normal map when there is one.
static func tex(url: Variant) -> Texture2D:
	var t: Texture2D = Skipper.tex(url)
	if t == null:
		return null
	var n: String = "res://art/%s" % String(url).trim_prefix("/").get_basename() + ".n.png"
	if not ResourceLoader.exists(n):
		return t
	var c: CanvasTexture = CanvasTexture.new()
	c.diffuse_texture = t
	c.normal_texture = load(n)
	# Land is not glossy (CanvasTexture's default is a white highlight).
	c.specular_color = Color.BLACK
	c.specular_shininess = 0.0
	return c


## The painting itself, under any normal map.
static func diffuse(t: Texture2D) -> Texture2D:
	return (t as CanvasTexture).diffuse_texture if t is CanvasTexture else t
