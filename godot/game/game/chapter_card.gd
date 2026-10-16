class_name ChapterCard
extends Control
## A CHAPTER OF THE LONG CAST, opening or closed (Kong, 2026-10-02: the
## campaign as the main story). A sheet of parchment laid over everything:
## opening, the chapter's numeral pressed in, its title and what it is about;
## closing, the same with "Complete" and what it came to (its jobs, the XP they
## paid). The numeral drops in, the rule runs out, then any press goes on.
##
## 2026-10-16, the page given life and kept the fishing story's own (never the
## expedition's dark titles): a small ink-and-watercolour sketch of the
## chapter's water soaks into the top of the sheet (port_art/longcast/<band>,
## multiplied onto the paper), the numeral is inked in left to right, the rule
## is a pen stroke drawn out, and the sheet lands with a soft page sound.

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
	var shade: ColorRect = Kit.scrim(self)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sheet = Control.new()
	_sheet.anchor_left = 0.5
	_sheet.anchor_right = 0.5
	_sheet.anchor_top = 0.5
	_sheet.anchor_bottom = 0.5
	_sheet.offset_left = -340.0
	_sheet.offset_right = 340.0
	_sheet.offset_top = -285.0
	_sheet.offset_bottom = 285.0
	_sheet.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_sheet)
	Paper.sheet(_sheet, 10.0, 1.4)
	var col: VBoxContainer = VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.offset_top = 26.0
	col.offset_bottom = -22.0
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 8)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sheet.add_child(col)
	var wash: ShaderMaterial = null
	var pic_tex: Texture2D = Skipper.tex("longcast/%s.jpg" % str(chapter.get("band", "")))
	if pic_tex != null:
		var pic: TextureRect = TextureRect.new()
		pic.texture = pic_tex
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		pic.custom_minimum_size = Vector2(560, 236)
		pic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		wash = ShaderMaterial.new()
		wash.shader = load("res://game/fx/wash_bloom.gdshader")
		wash.set_shader_parameter("box", pic.custom_minimum_size)
		wash.set_shader_parameter("progress", 0.0)
		pic.material = wash
		col.add_child(pic)
	var eb: Label = Paper.text(col, eyebrow, "eyebrow", Paper.RED)
	eb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var numeral: String = str(chapter.get("romanNumeral", ""))
	var num: Label = Paper.text(col, ("Chapter %s" % numeral) if numeral != "" else "The Last of It", "display", Paper.INK)
	num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	num.add_theme_font_size_override("font_size", 48)
	var ink: ShaderMaterial = ShaderMaterial.new()
	ink.shader = load("res://game/fx/ink_wipe.gdshader")
	ink.set_shader_parameter("progress", 0.0)
	num.material = ink
	var title: Label = Paper.text(col, str(chapter.get("title", "")), "heading", Paper.INK)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 26)
	var mid: CenterContainer = CenterContainer.new()
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(mid)
	var rule: Control = Control.new()
	rule.custom_minimum_size = Vector2(340, 6)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rule.set_meta("p", 0.0)
	rule.draw.connect(func() -> void: _pen(rule))
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
	sub.custom_minimum_size = Vector2(540, 0)
	if not closing:
		sub.add_theme_font_override("font", Kit.italic())
	if sparks:
		var fx: CPUParticles2D = CPUParticles2D.new()
		fx.position = Vector2(340, 570)
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
	# In: the sheet laid down, the painting soaking in from its middle, the
	# numeral inked across, then the title, the pen stroke and the words.
	_sheet.modulate.a = 0.0
	_sheet.scale = Vector2(0.96, 0.96)
	_sheet.pivot_offset = Vector2(340, 285)
	title.modulate.a = 0.0
	sub.modulate.a = 0.0
	Sound.page()
	var tw: Tween = create_tween()
	tw.set_parallel()
	tw.tween_property(_sheet, "modulate:a", 1.0, 0.3)
	tw.tween_property(_sheet, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	if wash != null:
		tw.tween_method(func(v: float) -> void: wash.set_shader_parameter("progress", v), 0.0, 1.0, 1.6).set_delay(0.15).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func() -> void:
		# The numeral's words sit centred: the ink starts where they do.
		var w: float = num.get_theme_font("font").get_string_size(num.text, HORIZONTAL_ALIGNMENT_LEFT, -1, num.get_theme_font_size("font_size")).x
		ink.set_shader_parameter("box", Vector2(w, num.size.y))
		ink.set_shader_parameter("left", (num.size.x - w) / 2.0)).set_delay(0.05)
	tw.tween_method(func(v: float) -> void: ink.set_shader_parameter("progress", v), 0.0, 1.0, 0.75).set_delay(0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_callback(func() -> void:
		Rumble.buzz([0, 30])
		if closing:
			Sound.chest(true)
		else:
			Sound.bell()).set_delay(1.15)
	tw.tween_property(title, "modulate:a", 1.0, 0.45).set_delay(1.1)
	tw.tween_method(func(v: float) -> void:
		rule.set_meta("p", v)
		rule.queue_redraw(), 0.0, 1.0, 0.65).set_delay(1.25).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(sub, "modulate:a", 1.0, 0.5).set_delay(1.5)
	tw.tween_property(go, "modulate:a", 1.0, 0.5).set_delay(2.4)
	_ready_at = 1.6


## The rule as a pen stroke: thin at both ends, full in the middle, drawn out
## to its meta "p" (0 to 1) from the left.
static func _pen(c: Control) -> void:
	var p: float = float(c.get_meta("p", 0.0))
	if p <= 0.0:
		return
	var w: float = c.size.x
	var y: float = c.size.y / 2.0
	var top: PackedVector2Array = PackedVector2Array()
	var bot: PackedVector2Array = PackedVector2Array()
	var n: int = 40
	for i: int in n + 1:
		var u: float = float(i) / n * p
		var th: float = 0.5 + 1.6 * sin(PI * u)
		var wob: float = sin(u * 9.0) * 0.4
		top.append(Vector2(u * w, y - th + wob))
		bot.append(Vector2(u * w, y + th + wob))
	bot.reverse()
	c.draw_colored_polygon(top + bot, Color(Paper.RED, 0.72))


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
