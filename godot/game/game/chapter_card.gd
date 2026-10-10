class_name ChapterCard
extends Control
## A CHAPTER OF THE LONG CAST, opening or closed (Kong, 2026-10-02: the
## campaign as the main story). A sheet of parchment laid over everything:
## opening, the chapter's numeral pressed in, its title and what it is about;
## closing, the same with "Complete" and what it came to (its jobs, the XP they
## paid). The numeral drops in, the rule runs out, then any press goes on.

signal finished

var chapter: Dictionary = {}
var closing: bool = false
## The line over the numeral (the campaign's own: "Chapter I complete", and
## that the next has opened).
var eyebrow: String = "THE LONG CAST"
## Gold sparks rising round the sheet (the campaign's unlock).
var sparks: bool = false
var _sheet: Control
var _ready_at: float = 0.0
var _t: float = 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = Kit.scrim(self, true)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sheet = Control.new()
	_sheet.anchor_left = 0.5
	_sheet.anchor_right = 0.5
	_sheet.anchor_top = 0.5
	_sheet.anchor_bottom = 0.5
	_sheet.offset_left = -330.0
	_sheet.offset_right = 330.0
	_sheet.offset_top = -190.0
	_sheet.offset_bottom = 190.0
	_sheet.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_sheet)
	Paper.sheet(_sheet, 10.0, 1.4)
	var col: VBoxContainer = VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 8)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sheet.add_child(col)
	var eb: Label = Paper.text(col, eyebrow, "eyebrow", Paper.RED)
	eb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var numeral: String = str(chapter.get("romanNumeral", ""))
	var num: Label = Paper.text(col, ("Chapter %s" % numeral) if numeral != "" else "The Last of It", "display", Paper.INK)
	num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	num.add_theme_font_size_override("font_size", 54)
	num.pivot_offset = Vector2(300, 34)
	var title: Label = Paper.text(col, str(chapter.get("title", "")), "heading", Paper.INK)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 28)
	var mid: CenterContainer = CenterContainer.new()
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(mid)
	var rule: ColorRect = ColorRect.new()
	rule.color = Color(Paper.RED, 0.7)
	rule.custom_minimum_size = Vector2(0, 2)
	mid.add_child(rule)
	var body: String = str(chapter.get("subtitle", ""))
	if closing:
		var qs: Array = Finn.chapter_quests(str(chapter.get("id", "")))
		var xp: float = 0.0
		for q: Dictionary in qs:
			xp += float(q["xp"])
		body = "Complete. %d jobs for Finn, %s XP." % [qs.size(), Js.thousands(xp)]
	var sub: Label = Paper.text(col, body, "body", Paper.INK_SOFT, true)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.custom_minimum_size = Vector2(520, 0)
	if not closing:
		sub.add_theme_font_override("font", Kit.italic())
	if sparks:
		var fx: CPUParticles2D = CPUParticles2D.new()
		fx.position = Vector2(330, 380)
		fx.amount = 28
		fx.lifetime = 2.6
		fx.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
		fx.emission_rect_extents = Vector2(360, 10)
		fx.direction = Vector2(0, -1)
		fx.spread = 18.0
		fx.gravity = Vector2(0, -12)
		fx.initial_velocity_min = 40.0
		fx.initial_velocity_max = 110.0
		fx.scale_amount_min = 2.0
		fx.scale_amount_max = 4.5
		fx.texture = Glow.radial(16, Color(1.0, 0.85, 0.45))
		var ramp: Gradient = Gradient.new()
		ramp.set_color(0, Color(1.0, 0.86, 0.5, 0.9))
		ramp.set_color(1, Color(1.0, 0.7, 0.3, 0.0))
		fx.color_ramp = ramp
		fx.z_index = -1
		_sheet.add_child(fx)
	var go: Label = Paper.text(col, "Press to go on", "small", Paper.INK_FAINT)
	go.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	go.modulate.a = 0.0
	# In: the sheet, then the numeral pressed in from large, then the rule
	# and the words.
	_sheet.modulate.a = 0.0
	_sheet.scale = Vector2(0.94, 0.94)
	_sheet.pivot_offset = Vector2(330, 190)
	num.modulate.a = 0.0
	num.scale = Vector2(1.8, 1.8)
	title.modulate.a = 0.0
	sub.modulate.a = 0.0
	var tw: Tween = create_tween()
	tw.set_parallel()
	tw.tween_property(_sheet, "modulate:a", 1.0, 0.3)
	tw.tween_property(_sheet, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.chain().set_parallel()
	tw.tween_property(num, "modulate:a", 1.0, 0.12)
	tw.tween_property(num, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(func() -> void:
		Rumble.buzz([0, 30])
		if closing:
			Sound.chest(true)
		else:
			Sound.bell())
	tw.chain().set_parallel()
	tw.tween_property(title, "modulate:a", 1.0, 0.4)
	tw.tween_property(rule, "custom_minimum_size:x", 340.0, 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(sub, "modulate:a", 1.0, 0.5).set_delay(0.3)
	tw.tween_property(go, "modulate:a", 1.0, 0.5).set_delay(1.2)
	_ready_at = 1.1


func _process(delta: float) -> void:
	_t += delta


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		accept_event()
		_go()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept") or event.is_action_pressed("fish_back") or event.is_action_pressed("fish_act"):
		get_viewport().set_input_as_handled()
		_go()


func _go() -> void:
	if _t < _ready_at or is_queued_for_deletion():
		return
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.25)
	tw.tween_callback(func() -> void:
		finished.emit()
		queue_free())
