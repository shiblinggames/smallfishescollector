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
## How far this pose was moved to keep the hull where the rest pose has it.
var pose_shift: Vector2 = Vector2.ZERO
static var _marks: Dictionary = {}
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
var _mirror_base: float = 0.0
var _waterline: float = 30.0
## HOW SHE SITS IN THE SEA (Godot over the web baseline): bob and roll on the
## swell, a heel into turns, the bow lifting under way. Set by whoever sails
## her (sway()); pivoted on the waterline.
var _bob: float = 0.0
var _rock: float = 0.0
var _t: float = randf() * 100.0
var _wob: float = 0.0
var _phase: float = randf() * 6.28


## A LOOK (a character colour) as a picture: just the captain, head and
## shoulders, cut from their sheet, with no boat under them, so a look never
## reads as a boat (Kong, 2026-10-01). Every sheet puts the captain in the
## same place.
static var _looks: Dictionary = {}


static func look_art(color: Variant) -> Texture2D:
	var id: String = str(Js.nz(color, "default"))
	if _looks.has(id):
		return _looks[id]
	var sheet: Texture2D = tex("fishing_rest.png" if id == "default" else "fishing_%s_rest.png" % id)
	if sheet == null:
		return null
	var at: AtlasTexture = AtlasTexture.new()
	at.atlas = sheet
	at.region = Rect2(415, 385, 340, 240)
	_looks[id] = at
	return at


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
	frame_at = Time.get_ticks_msec() / 1000.0
	if f != "wait":
		line_target = null
		line_slack = 0.0
		line_snap_t = -1.0
	_build()


## THE LINE (game/fishing_line.gd): where it runs to in a fight (a global
## point, or null for the pose's own), how slack it hangs (0 taut, 1 limp),
## and when it snapped (seconds, or -1). Cleared when the pose changes.
var line_target: Variant = null
var line_slack: float = 0.0
var line_snap_t: float = -1.0
var frame_at: float = 0.0


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
	# HOLD THE HULL STILL BETWEEN POSES (Godot over the web baseline): the
	# wait and cast sheets draw the boat 60-odd px right of the rest sheet
	# (and wait 32 px higher), so the whole boat jumped when she cast. Each
	# pose is moved by its own measured hull shift, and the parts placed on it
	# move with it.
	pose_shift = Vector2.ZERO
	if frame != "rest":
		var color0: String = look.get("color", "default")
		var known0: bool = false
		for c: Dictionary in Rules.data()["characterColors"]:
			if c["id"] == color0:
				known0 = true
		var stem: String = "fishing_%s.png" if (color0 == "default" or not known0) else "fishing_" + color0 + "_%s.png"
		var a: Vector2 = _hull_mark(tex(stem % "rest"))
		var b: Vector2 = _hull_mark(tex(stem % frame))
		if a != Vector2.INF and b != Vector2.INF:
			pose_shift = Vector2((a.x - b.x) * w, (a.y - b.y) * h)
	origin += pose_shift
	# The character, in their color (an unknown color is the default).
	var color: String = look.get("color", "default")
	var known: bool = false
	for c: Dictionary in Rules.data()["characterColors"]:
		if c["id"] == color:
			known = true
	var base: String = "fishing_%s.png" % frame if (color == "default" or not known) else "fishing_%s_%s.png" % [color, frame]
	_roles = {}
	_roles["skin"] = _part(tex(base), origin, [0.0, 0.0, 100.0, 0.0], w, h, false)
	var hat: Dictionary = _find("hats", look.get("hat"))
	if not hat.is_empty():
		_roles["hat"] = _part(tex(hat["castImageUrl"] if frame == "cast" else hat["restImageUrl"]), origin, _pos(hat["positions"][frame]), w, h, false)
	_hull_sprite = null
	var boat: Dictionary = _find("boats", look.get("boat"))
	if not boat.is_empty():
		_hull_sprite = _part(tex(boat["castImageUrl"] if frame == "cast" else boat["restImageUrl"]), origin, _pos(boat["positions"][frame]), w, h, false)
	if look.get("rodSlug") != null:
		_roles["rod"] = _part(tex("%s_%s.png" % [look["rodSlug"], frame]), origin, ROD[frame], w, h, true)
	if look.get("reel") != null:
		_part(tex(look["reel"]), origin, REEL[frame], w, h, false)
	for key: String in ["pet", "petBow"]:
		var pet: Dictionary = _find("pets", look.get(key))
		if not pet.is_empty():
			var o: Dictionary = (Rules.data()["petOverlays"] as Dictionary)[pet["species"]][frame]
			_roles[key] = _part(tex(pet["restImageUrl"]), origin, _pos(o), w, h, false)
	# The hook hangs on the end of the live line now (game/fishing_line.gd),
	# so it moves with it; it is no longer placed here.
	_roles["boat"] = _hull_sprite if _hull_sprite != null else _roles.get("skin")
	if water:
		_water_fx(origin, h, _hull_sprite)
	# The line, drawn live from the rod's tip (cleared from the sheets).
	if look.get("rodSlug") != null:
		var fl: FishingLine = FishingLine.new()
		fl.skipper = self
		add_child(fl)


var _hull_sprite: Sprite2D
## The parts by what they are (skin, hat, rod, boat, pet, petBow), for anyone
## pointing at them (the Locker's callouts).
var _roles: Dictionary = {}


## Where a part is drawn, in this node's space: the middle of its picture
## (the rod: two thirds of the way out to its tip). Vector2.INF when absent.
func anchor(role: String) -> Vector2:
	var s: Variant = _roles.get(role)
	if s == null or not is_instance_valid(s):
		return Vector2.INF
	var sp: Sprite2D = s
	var r: Rect2 = sp.get_rect()
	var at: Vector2 = r.get_center()
	if role == "rod":
		at = r.position + r.size * Vector2(0.3, 0.3)
	elif role == "skin":
		at = r.get_center() + Vector2(r.size.x * 0.1, r.size.y * 0.16)
	elif role == "boat" and sp == _roles.get("skin"):
		at = r.get_center() + Vector2(0, r.size.y * 0.28)
	return sp.transform * at


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
	var keel_frac: float = _keel(hull)
	# The same depth under the water for every hull, as a share of the
	# captain's box (a boat overlay is a much shorter picture than the sheet).
	var waterline: float = top_y + hh * keel_frac - SINK * h
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
	_waterline = waterline
	_mirror_base = waterline * (1.0 + LIE)
	_mirror.position = Vector2(0, _mirror_base)
	_mirror.scale = Vector2(1.0, -LIE)
	for c: Sprite2D in parts:
		_mirror.add_child(_twin(c))
	add_child(_mirror)
	move_child(_mirror, 1 if hull != null else 0)
	# IN the water: every upright part that reaches below the waterline goes
	# under it (the base sheet paints a plain hull under the boat overlay, so
	# it goes too), and the water she pushes aside rings her at it.
	var keel: float = top_y + hh * keel_frac
	for c: Sprite2D in parts:
		if c.rotation != 0.0 or not c.centered:
			continue
		var ch: float = c.texture.get_height() * absf(c.scale.y)
		var ctop: float = c.position.y - ch / 2.0
		if ctop + ch <= waterline:
			continue
		c.material = afloat_mat("res://game/fx/waterline.gdshader", c, (waterline - ctop) / ch, (keel - waterline) / ch, _phase)
	var collar: Sprite2D = collar_of(hull, (waterline - top_y) / hh, (keel - waterline) / hh, _phase)
	add_child(collar)
	move_child(collar, _mirror.get_index() + 1)


## A material for something afloat (fx/waterline.gdshader on the thing,
## fx/water_collar.gdshader on a twin behind it): cut and depth are fractions
## of the picture's height (the water, and the keel below it).
static func afloat_mat(shader: String, spr: Sprite2D, cut: float, depth: float, phase: float) -> ShaderMaterial:
	var m: ShaderMaterial = ShaderMaterial.new()
	m.shader = load(shader)
	m.set_shader_parameter("cut", cut)
	m.set_shader_parameter("depth", maxf(depth, 0.01))
	m.set_shader_parameter("aspect", float(spr.texture.get_width()) * absf(spr.scale.x) / maxf(1.0, float(spr.texture.get_height()) * absf(spr.scale.y)))
	m.set_shader_parameter("phase", phase)
	m.set_shader_parameter("ref", float(spr.texture.get_height()) * absf(spr.scale.y) / H)
	return m


## The water pushed aside round something afloat: a twin of it, its region
## grown a quarter each way so the ring runs past the picture's edge.
static func collar_of(spr: Sprite2D, cut: float, depth: float, phase: float) -> Sprite2D:
	var c: Sprite2D = Sprite2D.new()
	c.texture = spr.texture
	c.scale = spr.scale
	c.position = spr.position
	c.rotation = spr.rotation
	var sz: Vector2 = spr.texture.get_size()
	c.region_enabled = true
	c.region_rect = Rect2(-sz * 0.25, sz * 1.5)
	var m: ShaderMaterial = afloat_mat("res://game/fx/water_collar.gdshader", spr, cut, depth, phase)
	m.set_shader_parameter("span", span_at(spr.texture, cut - depth * 0.35))
	c.material = m
	return c


static var _spans: Dictionary = {}


## Where a picture is painted along one row (left, right, as fractions of its
## width), measured once.
static func span_at(t: Texture2D, row: float) -> Vector2:
	var key: String = "%s@%.3f" % [t.resource_path, row]
	if _spans.has(key):
		return _spans[key]
	var out: Vector2 = Vector2(0.3, 0.7)
	var img: Image = t.get_image()
	if img != null:
		if img.is_compressed():
			img.decompress()
		var y: int = clampi(int(row * img.get_height()), 0, img.get_height() - 1)
		# The longest unbroken run: the fishing line on the same row is not
		# the hull.
		var lo: int = -1
		var hi: int = -1
		var run_lo: int = -1
		for x: int in img.get_width() + 1:
			var solid: bool = x < img.get_width() and img.get_pixel(x, y).a > 0.5
			if solid and run_lo < 0:
				run_lo = x
			elif not solid and run_lo >= 0:
				if x - 1 - run_lo > hi - lo:
					lo = run_lo
					hi = x - 1
				run_lo = -1
		if hi > lo:
			out = Vector2(float(lo) / img.get_width(), float(hi + 1) / img.get_width())
	_spans[key] = out
	return out


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


## Where a captain sheet's hull is (the middle of its brown span, and its
## lowest row), as fractions of the sheet; measured once.
static func _hull_mark(t: Texture2D) -> Vector2:
	if t == null:
		return Vector2.INF
	var key: String = t.resource_path
	if _marks.has(key):
		return _marks[key]
	var img: Image = t.get_image()
	var out: Vector2 = Vector2.INF
	if img != null:
		if img.is_compressed():
			img.decompress()
		var small: Image = img.duplicate()
		small.resize(img.get_width() / 3, img.get_height() / 3, Image.INTERPOLATE_NEAREST)
		var lo: int = small.get_width()
		var hi: int = -1
		var bot: int = 0
		for y: int in range(int(small.get_height() * 0.7), small.get_height()):
			for x: int in small.get_width():
				var c: Color = small.get_pixel(x, y)
				if c.a > 0.78 and c.r > c.g and c.g >= c.b and c.r - c.b > 0.16:
					lo = mini(lo, x)
					hi = maxi(hi, x)
					bot = maxi(bot, y)
		if hi >= 0:
			out = Vector2((lo + hi) / 2.0 / small.get_width(), float(bot) / small.get_height())
	_marks[key] = out
	return out


## Where the keel is, as a fraction of the hull picture's height. The
## captain's own sheets paint the line and the hook below the hull while she
## waits, so on those it is the lowest row of the hull's brown, not of the
## paint.
func _keel(hull: Sprite2D) -> float:
	var k: float = _band(hull.texture).y
	if hull == _roles.get("skin"):
		var m: Vector2 = _hull_mark(hull.texture)
		if m != Vector2.INF:
			k = minf(k, m.y + 3.0 / hull.texture.get_height())
	return k


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


## The swell and her way, applied about the waterline. rough scales the swell
## (deeper water, a squall); heel and pitch are degrees (a turn, the bow lifting
## under way), eased in.
func sway(delta: float, rough: float, heel: float = 0.0, pitch: float = 0.0) -> void:
	_t += delta
	var bob: float = (sin(_t * 1.15 + _phase) * 2.6 + sin(_t * 0.67 + _phase * 1.7) * 1.8) * rough
	var roll: float = (sin(_t * 0.92 + _phase * 0.6) * 1.4 + sin(_t * 1.61 + _phase) * 0.6) * rough
	var k: float = 1.0 - exp(-delta * 3.0)
	_bob = lerpf(_bob, bob, k)
	_rock = lerpf(_rock, roll + heel + pitch, k)
	var rot: float = deg_to_rad(_rock)
	var pivot: Vector2 = Vector2(0, _waterline)
	rotation = rot
	position = Vector2(0, _bob) + pivot - pivot.rotated(rot)
	if _mirror != null and is_instance_valid(_mirror):
		# Water flips a lean, and keeps the picture mostly where it is.
		_mirror.rotation = -2.0 * rot
		_mirror.position.y = _mirror_base - _bob * 0.75


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
