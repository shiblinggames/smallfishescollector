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
	var boat: Dictionary = _find("boats", look.get("boat"))
	if not boat.is_empty():
		_part(tex(boat["castImageUrl"] if frame == "cast" else boat["restImageUrl"]), origin, _pos(boat["positions"][frame]), w, h, false)
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


static func _pos(o: Dictionary) -> Array:
	return [float(o["top"]), float(o["left"]), float(o["width"]), float(o["rotate"])]


## One layer: top%, left%, width% of the box, turned by rotate degrees.
func _part(t: Texture2D, origin: Vector2, p: Array, w: float, h: float, pivot_bottom_right: bool) -> void:
	if t == null:
		return
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
