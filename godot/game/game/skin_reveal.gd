class_name SkinReveal
extends Control
## OPENING A SKIN VOUCHER (Kong, 2026-10-03: "set up the crew roll voucher
## system"; the reveal is the point of it). A sealed card rises out of the
## dark and trembles, its glow climbing through the tiers it could still be,
## stopping on the one it is; it flips, and the painting is there with a
## burst of its tier's colour. A chase skin gets more: rays turning behind
## it and its own signature effect (ChaseFx). Press anywhere once it has landed to put it away.
## Rules: core/skins.gd (the roll is made before this plays).

signal done

const TIER_COLORS: Dictionary = {
	"rare": Color("#3b8ef0"), "epic": Color("#a78bfa"), "legendary": Color("#f0c040"), "chase": Color("#ff7a59"),
}
const TIER_NAMES: Dictionary = { "rare": "Rare", "epic": "Epic", "legendary": "Legendary", "chase": "Chase" }
const CARD: Vector2 = Vector2(340, 390)

var result: Dictionary = {}
var _t: float = 0.0
var _landed: bool = false
var _col: Color = Color.WHITE
var _fx: Control
var _card: Control
var _back: Control
var _face: TextureRect
var _words: VBoxContainer
var _flipped: bool = false
var _tick: int = -1
var _seal: Texture2D


## Play the reveal for an openSkinVoucher result over `parent`.
static func play(parent: Node, r: Dictionary) -> SkinReveal:
	var s: SkinReveal = SkinReveal.new()
	s.result = r
	parent.add_child(s)
	return s


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 50
	var tier: String = str(result.get("tier", "rare"))
	_col = TIER_COLORS.get(tier, Color.WHITE)
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.01, 0.02, 0.03, 0.82)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	shade.modulate.a = 0.0
	create_tween().tween_property(shade, "modulate:a", 1.0, 0.25)
	_fx = Control.new()
	_fx.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.draw.connect(_draw_fx)
	add_child(_fx)
	_card = Control.new()
	_card.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_card.offset_left = -CARD.x / 2.0
	_card.offset_right = CARD.x / 2.0
	_card.offset_top = -CARD.y / 2.0 - 40.0
	_card.offset_bottom = CARD.y / 2.0 - 40.0
	_card.pivot_offset = CARD / 2.0
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_card)
	# Loaded here, not in the draw (a texture first loaded in a draw shows white).
	_seal = Skipper.tex(str(Skins.kind_def(str(result.get("kind", "bosun"))).get("art", "den/hook.png")))
	_back = Control.new()
	_back.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_back.draw.connect(_draw_back)
	_card.add_child(_back)
	_face = TextureRect.new()
	_face.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "top"]:
		_face.set("offset_" + side, 16.0)
	for side: String in ["right", "bottom"]:
		_face.set("offset_" + side, -16.0)
	_face.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_face.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var skin: Dictionary = Js.obj(result.get("skin"))
	_face.texture = Skipper.tex("card-arts/%s.webp" % str(skin.get("filename", "")).get_basename())
	_face.visible = false
	_card.add_child(_face)
	# A chase skin plays its own signature, bold (game/chase_fx.gd).
	ChaseFx.over(_face, skin, true)
	_words = VBoxContainer.new()
	_words.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_words.offset_left = -360
	_words.offset_right = 360
	_words.offset_top = -190
	_words.offset_bottom = -40
	_words.alignment = BoxContainer.ALIGNMENT_CENTER
	_words.add_theme_constant_override("separation", 2)
	_words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_words.modulate.a = 0.0
	add_child(_words)
	_card.scale = Vector2(0.4, 0.4)
	_card.modulate.a = 0.0
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_card, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_card, "modulate:a", 1.0, 0.3)
	Sound.bell()


## The glow climbs through the tiers below the one it lands on, a beat each.
func _glow_now() -> Color:
	var order: Array = ["rare", "epic", "legendary", "chase"]
	var land: int = order.find(str(result.get("tier", "rare")))
	var step: int = mini(int(floor(maxf(0.0, _t - 0.5) / 0.45)), land)
	return TIER_COLORS[order[step]]


func _process(delta: float) -> void:
	_t += delta
	var big: bool = result.get("tier") in ["legendary", "chase"]
	var shake_until: float = 0.5 + 0.45 * float(["rare", "epic", "legendary", "chase"].find(str(result.get("tier", "rare"))) + 1)
	if not _flipped and _t > 0.5 and _t < shake_until:
		var k: float = (_t - 0.5) / (shake_until - 0.5)
		_card.rotation = sin(_t * 38.0) * 0.035 * k
		_card.scale = Vector2.ONE * (1.0 + 0.04 * k)
		var step: int = int(floor((_t - 0.5) / 0.45))
		if step != _tick:
			_tick = step
			Sound.job_tick(step)
	if not _flipped and _t >= shake_until:
		_flipped = true
		_card.rotation = 0.0
		var tw: Tween = create_tween()
		tw.tween_property(_card, "scale", Vector2(0.0, 1.08), 0.14).set_ease(Tween.EASE_IN)
		tw.tween_callback(func() -> void:
			_face.visible = true
			_land(big))
		tw.tween_property(_card, "scale", Vector2(1.06, 1.06), 0.16).set_ease(Tween.EASE_OUT)
		tw.tween_property(_card, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_SINE)
	_back.queue_redraw()
	_fx.queue_redraw()


func _land(big: bool) -> void:
	_landed = true
	set_meta("landed_at", _t)
	Sound.chest(big)
	Rumble.buzz([0, 40, 30, 80] if big else [0, 30])
	var skin: Dictionary = Js.obj(result.get("skin"))
	var tier: String = str(result.get("tier", "rare"))
	var crew_name: String = Crew.display_name(str(skin.get("slug", "")), str(skin.get("slug", "")).capitalize())
	var e: Label = Kit.text(_words, "%s SKIN" % str(TIER_NAMES.get(tier, "")).to_upper(), "eyebrow", _col.lightened(0.2))
	e.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var n: Label = Kit.text(_words, "%s %s" % [skin.get("name", ""), crew_name], "display", Color(0.98, 0.95, 0.88))
	n.add_theme_font_size_override("font_size", 40)
	n.add_theme_color_override("font_shadow_color", Color(_col.darkened(0.55), 0.9))
	n.add_theme_constant_override("shadow_outline_size", 12)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var b: Label = Kit.text(_words, str(skin.get("blurb", "")), "note", Color(0.9, 0.86, 0.78), true)
	b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var where: String
	if result.get("worn", false):
		where = "Your %s wears it now." % crew_name
	elif result.get("crewHas", false):
		where = "In your Trunk. Put it on your %s in the Crew Hall." % crew_name
	else:
		where = "In your Trunk. It waits for the day you sign a %s." % crew_name
	var w: Label = Kit.text(_words, where, "small", Color(0.85, 0.8, 0.7), true)
	w.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var p: Label = Kit.text(_words, "Press anywhere", "small", Color(0.85, 0.8, 0.7, 0.55))
	p.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	create_tween().tween_property(_words, "modulate:a", 1.0, 0.4).set_delay(0.2)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and _landed:
		accept_event()
		_close()


func _unhandled_input(event: InputEvent) -> void:
	if _landed and (event.is_action_pressed("fish_back") or event.is_action_pressed("ui_accept")):
		get_viewport().set_input_as_handled()
		_close()


func _close() -> void:
	if is_queued_for_deletion():
		return
	set_process(false)
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.2)
	tw.tween_callback(func() -> void:
		done.emit()
		queue_free())


## The sealed card: dark board, a brass border, the voucher's painting in the
## middle, and the glow of the tier it is climbing through.
func _draw_back() -> void:
	var g: Color = _col if _flipped and _face.visible else _glow_now()
	var r: Rect2 = Rect2(Vector2.ZERO, CARD)
	var pulse: float = 0.5 + 0.5 * sin(_t * 9.0)
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.shadow_color = Color(g, 0.45 + 0.25 * pulse)
	sb.shadow_size = 26
	sb.bg_color = Color("#1d1712")
	sb.border_color = Color(0.78, 0.62, 0.36)
	sb.set_border_width_all(3)
	sb.set_corner_radius_all(14)
	_back.draw_style_box(sb, r)
	var inner: StyleBoxFlat = StyleBoxFlat.new()
	inner.bg_color = Color(0, 0, 0, 0)
	inner.border_color = Color(g, 0.55)
	inner.set_border_width_all(2)
	inner.set_corner_radius_all(10)
	_back.draw_style_box(inner, r.grow(-12.0))
	if _face.visible:
		# The face: the tier's colour pooled behind the painting.
		_back.draw_circle(CARD / 2.0, CARD.x * 0.42, Color(g, 0.22))
		_back.draw_circle(CARD / 2.0, CARD.x * 0.30, Color(g, 0.18))
		return
	var c: Vector2 = CARD / 2.0
	# The voucher itself, painted, on a pool of the glow.
	_back.draw_circle(c, 120.0, Color(g, 0.10 + 0.06 * pulse))
	if _seal != null:
		var sz: Vector2 = _seal.get_size()
		var k: float = 230.0 / maxf(sz.x, sz.y)
		_back.draw_texture_rect(_seal, Rect2(c - sz * k / 2.0, sz * k), false)


## Behind the card: a ring breaking out at the flip, and for the best tiers
## slow rays turning.
func _draw_fx() -> void:
	var c: Vector2 = _fx.size / 2.0 + Vector2(0, -40)
	if not _landed:
		var g: Color = _glow_now()
		_fx.draw_circle(c, 260.0, Color(g, 0.05))
		return
	var since: float = _t - float(get_meta("landed_at", _t))
	var u: float = clampf(since / 1.2, 0.0, 1.0)
	var r: float = 120.0 + 420.0 * (1.0 - pow(1.0 - u, 3.0))
	_fx.draw_arc(c, r, 0.0, TAU, 96, Color(_col, (1.0 - u) * 0.85), 8.0 * (1.0 - u) + 1.0, true)
	_fx.draw_circle(c, 300.0, Color(_col, 0.07 + 0.05 * (1.0 - u)))
	var tier: String = str(result.get("tier", "rare"))
	if tier in ["legendary", "chase"]:
		var n: int = 18 if tier == "chase" else 12
		var a0: float = _t * (0.25 if tier == "chase" else 0.15)
		for i: int in n:
			var a: float = a0 + TAU * float(i) / float(n)
			var p: PackedVector2Array = PackedVector2Array([c, c + Vector2.from_angle(a - 0.05) * 460.0, c + Vector2.from_angle(a + 0.05) * 460.0])
			_fx.draw_colored_polygon(p, Color(_col, 0.045 * minf(1.0, since * 2.0)))
	# Motes drifting up from the card.
	for i: int in 26:
		var seed: float = float(i) * 12.9898
		var x: float = fmod(abs(sin(seed) * 43758.5453), 1.0)
		var life: float = fmod(since * 0.5 + x * 3.0, 1.0)
		var pos: Vector2 = c + Vector2((x - 0.5) * 420.0, 200.0 - life * 460.0)
		_fx.draw_circle(pos, 2.0 + 2.0 * x, Color(_col.lightened(0.3), (1.0 - life) * 0.7 * minf(1.0, since * 3.0)))
