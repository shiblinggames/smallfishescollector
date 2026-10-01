class_name Skipper
extends Node2D
## THE CAPTAIN ON THE BOAT (Godot port of app/(app)/sea/seaCaptain.ts and
## skiffArt.ts, fishing pass 3).
##
## A stack of the web's sprites in a 210-wide box (the sheets are 900x800), each
## part placed by the web's percentages of the box for the pose: its LEFT edge
## at left%, its TOP edge at top%, its width at width% (the height follows the
## art), turned about its centre (the rod about its bottom-right corner). Bottom
## to top: the character in their color, the hat, the boat, the rod, the reel,
## the stern pet, the bow pet, the hook (in the water, so hidden, while waiting).
## The base sheet already has a plain hull and a red bandana painted in, so no
## hat or boat means no overlay. The whole stack is nudged up and left (the
## sheet keeps room for the rod and line there) and centred on the boat.
##
## The web's sea draws only the stern pet; the bow pet (the Baby Plesiosaurus,
## "It rides the bow") appeared only in the loadout preview. Here it rides the
## bow on the water too.

const W: float = 210.0
const H: float = 210.0 * 800.0 / 900.0

## The rod, reel and hook placements (seaCaptain.ts), top/left/width/rotate.
const ROD: Dictionary = { "rest": [37.0, -12.0, 107.5, 0.0], "wait": [37.5, -8.0, 107.5, 0.0], "cast": [-8.5, 3.5, 100.5, 0.0] }
const REEL: Dictionary = { "rest": [15.0, -10.3, 222.0, -18.0], "wait": [-5.2, -3.1, 222.0, -36.5], "cast": [38.9, -42.0, 219.5, 46.5] }
const HOOK: Dictionary = { "rest": [39.5, -10.5, 204.5, 0.0], "wait": [39.5, -10.5, 222.0, 0.0], "cast": [40.5, -73.0, 204.5, 66.5] }

var look: Dictionary = {}
var frame: String = "rest"
var box_scale: float = 1.0
## ON THE WATER (seaCaptain.ts): a soft shadow under the hull, her whole
## picture thrown back by the water (mirrored about the waterline, foreshortened
## to 55%, faint, and shearing slowly so it reads as water and not as a second
## boat), and the sea coming up the bottom of the hull. Off for previews.
var water: bool = false
const LIE: float = 0.55
const MIRROR_ALPHA: float = 0.26
const MIRROR_SHEAR: float = 0.021
const MIRROR_RATE: float = 0.78
const SINK: float = 0.04
static var _bands: Dictionary = {}
static var _shadow_mat: ShaderMaterial
static var _mirror_mat: ShaderMaterial
var _mirror: Node2D
var _wob: float = 0.0
var _phase: float = randf() * 6.28


static func tex(url: Variant) -> Texture2D:
	if url == null or String(url) == "":
		return null
	var path: String = "res://art/%s" % String(url).trim_prefix("/")
	return load(path) if ResourceLoader.exists(path) else null


## What a profile wears, as the web reads it (lib/core/seaPage.ts).
static func look_of(p: Dictionary) -> Dictionary:
	var rod: Dictionary = Rules.effective_rod(Js.num(p.get("rod_tier")), p.get("completionist_effects"))
	var reels: Array = Rules.data()["reels"]
	var hooks: Array = Rules.data()["hooks"]
	return {
		"color": str(Js.nz(p.get("character_color"), "default")),
		"hat": p.get("equipped_hat"), "boat": p.get("equipped_boat"),
		"pet": p.get("equipped_pet"), "petBow": p.get("equipped_pet_bow"),
		"rodSlug": rod.get("slug"),
		"reel": (reels[clampi(int(Js.num(p.get("reel_tier"))), 0, reels.size() - 1)] as Dictionary).get("imageUrl"),
		"hook": (hooks[clampi(int(Js.num(p.get("hook_tier"))), 0, hooks.size() - 1)] as Dictionary).get("imageUrl"),
	}


func set_look(l: Dictionary) -> void:
	look = l
	_build()


func set_frame(f: String) -> void:
	if f == frame:
		return
	frame = f
	_build()


static func _find(list_key: String, id: Variant) -> Dictionary:
	if id == null:
		return {}
	for d: Dictionary in Rules.data()[list_key]:
		if d["id"] == id:
			return d
	return {}


func _build() -> void:
	for c: Node in get_children():
		c.queue_free()
	var w: float = W * box_scale
	var h: float = H * box_scale
	var origin: Vector2 = Vector2(-w / 2.0 - 0.08 * w, -h / 2.0 - 0.26 * h)
	# The character, in their color (an unknown color is the default).
	var color: String = look.get("color", "default")
	var known: bool = false
	for c: Dictionary in Rules.data()["characterColors"]:
		if c["id"] == color:
			known = true
	var base: String = "fishing_%s.png" % frame if (color == "default" or not known) else "fishing_%s_%s.png" % [color, frame]
	_part(tex(base), origin, [0.0, 0.0, 100.0, 0.0], w, h, false)
	var hat: Dictionary = _find("hats", look.get("hat"))
	if not hat.is_empty():
		_part(tex(hat["castImageUrl"] if frame == "cast" else hat["restImageUrl"]), origin, _pos(hat["positions"][frame]), w, h, false)
	_hull_sprite = null
	var boat: Dictionary = _find("boats", look.get("boat"))
	if not boat.is_empty():
		_hull_sprite = _part(tex(boat["castImageUrl"] if frame == "cast" else boat["restImageUrl"]), origin, _pos(boat["positions"][frame]), w, h, false)
	if look.get("rodSlug") != null:
		_part(tex("%s_%s.png" % [look["rodSlug"], frame]), origin, ROD[frame], w, h, true)
	if look.get("reel") != null:
		_part(tex(look["reel"]), origin, REEL[frame], w, h, false)
	for key: String in ["pet", "petBow"]:
		var pet: Dictionary = _find("pets", look.get(key))
		if not pet.is_empty():
			var o: Dictionary = (Rules.data()["petOverlays"] as Dictionary)[pet["species"]][frame]
			_part(tex(pet["restImageUrl"]), origin, _pos(o), w, h, false)
	if look.get("hook") != null and frame != "wait":
		_part(tex(look["hook"]), origin, HOOK[frame], w, h, false)
	if water:
		_water_fx(origin, h, _hull_sprite)


var _hull_sprite: Sprite2D


func _water_fx(origin: Vector2, h: float, hull: Sprite2D) -> void:
	var parts: Array = get_children().filter(func(c: Node) -> bool: return c is Sprite2D and not c.is_queued_for_deletion())
	if hull == null and not parts.is_empty():
		hull = parts[0]
	if parts.is_empty():
		return
	# Where the water is: the lowest PAINTED row of the hull (the sheets keep a
	# margin under it, and mirroring about the box's edge threw the picture
	# loose of the boat), a little up it.
	var hh: float = hull.texture.get_height() * absf(hull.scale.y)
	var top_y: float = hull.position.y - hh / 2.0 if hull.centered else hull.position.y + hull.offset.y * absf(hull.scale.y)
	var waterline: float = top_y + hh * (_band(hull.texture).y - SINK)
	# The shadow, under everything.
	if hull != null:
		if _shadow_mat == null:
			_shadow_mat = ShaderMaterial.new()
			_shadow_mat.shader = load("res://game/fx/hull_shadow.gdshader")
		var sh: Sprite2D = _twin(hull)
		sh.material = _shadow_mat
		sh.position.y += 8.0
		add_child(sh)
		move_child(sh, 0)
	# The reflection: a twin of every part, in a box flipped about the
	# waterline. A child at y lands at P - LIE * y; it should land at
	# water + (water - y) * LIE, so P is water * (1 + LIE).
	var group: CanvasGroup = CanvasGroup.new()
	group.fit_margin = 12.0
	if _mirror_mat == null:
		_mirror_mat = ShaderMaterial.new()
		_mirror_mat.shader = load("res://game/fx/hull_mirror.gdshader")
	group.material = _mirror_mat
	_mirror = group
	_mirror.position = Vector2(0, waterline * (1.0 + LIE))
	_mirror.scale = Vector2(1.0, -LIE)
	for c: Sprite2D in parts:
		_mirror.add_child(_twin(c))
	add_child(_mirror)
	move_child(_mirror, 1 if hull != null else 0)
	# The water up her side, over the hull and cut from its own shape.
	if hull != null:
		var band: Vector2 = _band(hull.texture)
		var soak: Sprite2D = _twin(hull)
		var m: ShaderMaterial = ShaderMaterial.new()
		m.shader = load("res://game/fx/hull_soak.gdshader")
		m.set_shader_parameter("top", band.x)
		m.set_shader_parameter("bot", band.y)
		soak.material = m
		add_child(soak)


func _twin(c: Sprite2D) -> Sprite2D:
	var t: Sprite2D = Sprite2D.new()
	t.texture = c.texture
	t.centered = c.centered
	t.offset = c.offset
	t.position = c.position
	t.scale = c.scale
	t.rotation = c.rotation
	t.flip_h = c.flip_h
	t.visible = c.visible
	return t


## The painted rows of a picture, as a fraction of its height (top, bottom),
## measured once.
static func _band(t: Texture2D) -> Vector2:
	var key: String = t.resource_path
	if _bands.has(key):
		return _bands[key]
	var out: Vector2 = Vector2(0.0, 1.0)
	var img: Image = t.get_image()
	if img != null:
		if img.is_compressed():
			img.decompress()
		var r: Rect2i = img.get_used_rect()
		if r.size.y > 0:
			out = Vector2(float(r.position.y) / img.get_height(), float(r.end.y) / img.get_height())
	_bands[key] = out
	return out


func _process(delta: float) -> void:
	if _mirror == null or not is_instance_valid(_mirror):
		return
	_wob += delta
	_mirror.skew = sin(_wob * MIRROR_RATE + _phase) * MIRROR_SHEAR + sin(_wob * MIRROR_RATE * 1.63 + _phase * 2.1) * MIRROR_SHEAR * 0.45


static func _pos(o: Dictionary) -> Array:
	return [float(o["top"]), float(o["left"]), float(o["width"]), float(o["rotate"])]


## One layer: top%, left%, width% of the box, turned by rotate degrees.
func _part(t: Texture2D, origin: Vector2, p: Array, w: float, h: float, pivot_bottom_right: bool) -> Sprite2D:
	if t == null:
		return null
	var pw: float = w * float(p[2]) / 100.0
	var ph: float = pw * float(t.get_height()) / float(t.get_width())
	var top_left: Vector2 = origin + Vector2(w * float(p[1]) / 100.0, h * float(p[0]) / 100.0)
	var s: Sprite2D = Sprite2D.new()
	s.texture = t
	s.scale = Vector2(pw / float(t.get_width()), ph / float(t.get_height()))
	s.rotation_degrees = float(p[3])
	if pivot_bottom_right:
		s.centered = false
		s.offset = -Vector2(t.get_width(), t.get_height())
		s.position = top_left + Vector2(pw, ph)
	else:
		s.position = top_left + Vector2(pw, ph) / 2.0
	add_child(s)
	return s
