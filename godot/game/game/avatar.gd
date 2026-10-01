class_name Avatar
extends Control
## A ROUND PORTRAIT (Godot port of components/CharacterAvatar.tsx): the
## character's rest sprite and hat, cropped to a circle on a tinted ground
## inside a ring, framed the way the web frames it (the sprite at 317% of the
## circle, its focal point 63% across and 65% down).
##
## face: { characterColor, hat, bg, ring, mirrored }, as the regulars carry it.

var face: Dictionary = {}
var px: float = 58.0


func _ready() -> void:
	custom_minimum_size = Vector2(px, px)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var r: int = int(px / 2.0)
	var mask: Panel = Panel.new()
	var ground: StyleBoxFlat = StyleBoxFlat.new()
	ground.bg_color = Kit.a(Color(str(face.get("bg", "#1a1408"))), 0.92)
	ground.set_corner_radius_all(r)
	ground.anti_aliasing = true
	mask.add_theme_stylebox_override("panel", ground)
	mask.size = Vector2(px, px)
	mask.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	mask.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(mask)

	# Mirrored as a whole, sprite and hat together, about the circle's middle.
	var turn: Control = Control.new()
	turn.size = Vector2(px, px)
	turn.pivot_offset = Vector2(px, px) / 2.0
	if face.get("mirrored", false):
		turn.scale = Vector2(-1.0, 1.0)
	turn.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mask.add_child(turn)

	var color: String = str(face.get("characterColor", "default"))
	var known: bool = false
	for c: Dictionary in Rules.data()["characterColors"]:
		if c["id"] == color:
			known = true
	var body: Texture2D = Skipper.tex("fishing_rest.png" if (color == "default" or not known) else "fishing_%s_rest.png" % color)
	if body == null:
		return
	var iw: float = px * 3.17
	var ih: float = iw * float(body.get_height()) / float(body.get_width())
	var inner: Control = Control.new()
	inner.size = Vector2(iw, ih)
	inner.position = Vector2(px / 2.0 - 0.63 * iw, px / 2.0 - 0.65 * ih)
	inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	turn.add_child(inner)
	var b: TextureRect = TextureRect.new()
	b.texture = body
	b.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	b.size = inner.size
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inner.add_child(b)
	var hat: Dictionary = Skipper._find("hats", face.get("hat"))
	if not hat.is_empty():
		var ht: Texture2D = Skipper.tex(hat["restImageUrl"])
		if ht != null:
			var hp: Dictionary = hat["positions"]["rest"]
			var hw: float = iw * float(hp["width"]) / 100.0
			var h: TextureRect = TextureRect.new()
			h.texture = ht
			h.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			h.size = Vector2(hw, hw * float(ht.get_height()) / float(ht.get_width()))
			h.position = Vector2(iw * float(hp["left"]) / 100.0, ih * float(hp["top"]) / 100.0)
			h.pivot_offset = h.size / 2.0
			h.rotation_degrees = float(hp["rotate"])
			h.mouse_filter = Control.MOUSE_FILTER_IGNORE
			inner.add_child(h)

	var ring: Panel = Panel.new()
	var rs: StyleBoxFlat = StyleBoxFlat.new()
	rs.bg_color = Color(0, 0, 0, 0)
	rs.border_color = Color(str(face.get("ring", "#c8a060")))
	rs.set_border_width_all(2)
	rs.set_corner_radius_all(r)
	rs.anti_aliasing = true
	ring.add_theme_stylebox_override("panel", rs)
	ring.size = Vector2(px, px)
	ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(ring)
