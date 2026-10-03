class_name PromotionCard
extends Control
## A PROMOTION (lib/core/crew.ts checkPromotions; the web's promotion card): a
## crew's Special stepped up at Lv 10, 25, 40, 75 or 100, the one levelling
## moment that takes the screen. The card drops in tilted and settles, the
## class's colour rings out, a wax seal is pressed with the new tier, and the
## Special's old words are struck through over its new ones. Press anywhere.

signal done

var promo: Dictionary = {}
var _t: float = 0.0
var _card: Control
var _fx: Control
## Over the card: its seal and the strike through the old Special.
var _top: Control
var _col: Color
var _ready_to_go: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_col = Color(str(promo.get("color", "#d9a83a")))
	var dim: ColorRect = ColorRect.new()
	dim.color = Color(0.01, 0.02, 0.03, 0.78)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)
	_fx = Control.new()
	_fx.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.draw.connect(_draw_fx)
	add_child(_fx)
	var cc: CenterContainer = CenterContainer.new()
	cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(cc)
	_card = Control.new()
	_card.custom_minimum_size = Vector2(420, 500)
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cc.add_child(_card)
	Paper.night = true
	Paper.sheet(_card, 7.0)
	var band: ColorRect = ColorRect.new()
	band.color = Color(_col, 0.85)
	band.position = Vector2(0, 0)
	band.size = Vector2(420, 8)
	_card.add_child(band)
	var v: VBoxContainer = VBoxContainer.new()
	v.position = Vector2(28, 26)
	v.size = Vector2(364, 450)
	v.add_theme_constant_override("separation", 4)
	_card.add_child(v)
	Paper.text(v, "PROMOTED", "eyebrow", _col.lightened(0.25))
	var name_l: Label = Paper.text(v, str(promo.get("name", "")), "display", Paper.ink())
	name_l.add_theme_font_size_override("font_size", 34)
	Paper.text(v, "%s  ·  Tier %s  ·  Level %d" % [promo.get("className", ""), promo.get("tier", ""), int(Js.num(promo.get("level")))], "body_strong", _col.lightened(0.2))
	var art: TextureRect = TextureRect.new()
	art.texture = Skipper.tex(str(promo.get("art", "")).trim_prefix("/"))
	art.custom_minimum_size = Vector2(0, 250)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	v.add_child(art)
	Paper.rule(v)
	Paper.text(v, "Their Special now", "eyebrow", Paper.ink_soft())
	if promo.get("from") != null:
		var old: Label = Paper.text(v, str(promo["from"]), "small", Paper.ink_faint(), true)
		# Struck through once the card has landed.
		var strike: ColorRect = ColorRect.new()
		strike.color = Color(Paper.NIGHT_RED, 0.85)
		strike.mouse_filter = Control.MOUSE_FILTER_IGNORE
		old.add_child(strike)
		var fnt: Font = old.get_theme_font("font")
		var fs: int = old.get_theme_font_size("font_size")
		var tw_full: float = minf(364.0, fnt.get_string_size(old.text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x)
		strike.position = Vector2(0, fs * 0.72)
		strike.size = Vector2(0, 2)
		var stw: Tween = strike.create_tween()
		stw.tween_interval(0.75)
		stw.tween_property(strike, "size:x", tw_full, 0.35).set_ease(Tween.EASE_OUT)
	Paper.text(v, str(promo.get("to", "")), "body_strong", Paper.ink(), true)
	Paper.night = false
	_top = Control.new()
	_top.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.draw.connect(_draw_top)
	add_child(_top)
	# Dropped in tilted, settling.
	_card.pivot_offset = Vector2(210, 280)
	_card.rotation = -0.18
	_card.scale = Vector2(0.7, 0.7)
	_card.modulate.a = 0.0
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_card, "rotation", 0.0, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_card, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_card, "modulate:a", 1.0, 0.2)
	tw.chain().tween_callback(func() -> void:
		Sound.seal(true)
		Rumble.buzz([0, 40, 30, 70])
		_ready_to_go = true)
	Sound.horn()


func _process(delta: float) -> void:
	_t += delta
	_fx.queue_redraw()
	_top.queue_redraw()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		accept_event()
		if _ready_to_go:
			_close()


func _unhandled_input(event: InputEvent) -> void:
	if _ready_to_go and (event.is_action_pressed("fish_back") or event.is_action_pressed("ui_accept")):
		get_viewport().set_input_as_handled()
		_close()


func _close() -> void:
	if is_queued_for_deletion():
		return
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.2)
	tw.tween_callback(func() -> void:
		done.emit()
		queue_free())


func _draw_fx() -> void:
	var c: Vector2 = _fx.size / 2.0
	var u: float = clampf((_t - 0.45) / 1.2, 0.0, 1.0)
	_fx.draw_circle(c, 340.0, Color(_col, 0.06))
	if _t > 0.45:
		_fx.draw_arc(c, 260.0 + 300.0 * (1.0 - pow(1.0 - u, 3.0)), 0.0, TAU, 96, Color(_col, 0.7 * (1.0 - u)), 6.0 * (1.0 - u) + 1.0, true)


func _draw_top() -> void:
	var _fx: Control = _top
	# The wax seal at the card's corner, pressed when it lands, with the tier.
	if _ready_to_go or _t > 0.5:
		var sp: Vector2 = _card.get_global_rect().position - get_global_rect().position + Vector2(372, 58)
		var press: float = clampf((_t - 0.5) / 0.15, 0.0, 1.0)
		var r: float = 34.0 * (1.4 - 0.4 * press)
		_fx.draw_circle(sp, r + 4.0, Color(0.35, 0.05, 0.04, 0.9 * press))
		_fx.draw_circle(sp, r, Color(0.7, 0.13, 0.1, press))
		_fx.draw_arc(sp, r * 0.72, 0.0, TAU, 32, Color(0.95, 0.6, 0.5, 0.6 * press), 2.0, true)
		var f: Font = Kit.font("cinzel", 900)
		var tier: String = str(promo.get("tier", ""))
		var tw2: float = f.get_string_size(tier, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
		_fx.draw_string(f, sp + Vector2(-tw2 / 2.0, 8.0), tier, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(1.0, 0.85, 0.75, press))
