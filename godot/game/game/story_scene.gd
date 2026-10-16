class_name StoryScene
extends Control
## A STORY BEAT OF THE CAMPAIGN (Godot port of components/StoryScene.tsx and
## app/(app)/sea/SeaStory.tsx). Played over the sea: the scene's backdrop
## (SCENE_BACKDROPS, or a line's own) fills the screen with a slow drift, and
## the cast stand on two marks either side of the dialogue plate. The first to
## speak takes the left, the next the right; a third steps in for whoever spoke
## least recently. The speaker steps forward and lights; the other dims. A
## line with no speaker is the narrator, in italics; a portrait on a narrator
## line is a face shot. A closeup leans the bust in; an insert (a sealed
## letter, a ledger, Finn as he is) takes the stage alone. `*word*` is said in
## the scene's accent. Typed at 22 ms a character; a press finishes the line,
## the next press moves on. Skip only on a replay.
##
## finished(read): true when the last line's button was pressed (the sheet
## then writes the read), false when it was skipped or closed.

signal finished(read: bool)
## Each line as it comes up (a cinematic on the water starts its moment on
## the line's `cue`; see FinnReveal).
signal line_shown(i: int, line: Dictionary)

const GOLD: Color = Color(1.0, 0.82, 0.38)

var node: Dictionary = {}
## Replays can be skipped; a first read cannot.
var allow_skip: bool = false
## The words on the last line's button.
var cta: String = "Log it"
## Played over a fight on the water: no backdrop of its own, the sea shows
## through under the vignette.
var over_water: bool = false
## A cinematic on the live sea (FinnReveal): no backdrop and no dim over the
## water, a letterbox, the busts out of the way while the narrator speaks,
## and inserts left to the stage. `under` is the layer under the busts and
## the words where the stage draws on the screen.
var stage_mode: bool = false
var under: Control
## Over the busts, under the words (the stage's lettering: the F, the title).
var over: Control

var _lines: Array = []
var _i: int = -1
var _accent: Color = GOLD
var _back: TextureRect
var _back_next: TextureRect
var _back_path: String = ""
var _flash: ColorRect
var _shade: ColorRect
var _plate: Control
var _name: Label
var _text: RichTextLabel
var _hint: Label
var _cta: Pane.PaneButton
var _skip: Button
var _slots: Array = [{}, {}]
var _busts: Array = []
var _insert: Control
var _at: PackedFloat32Array = PackedFloat32Array()
var _t: float = 0.0
var _typing: bool = false
var _wait: float = 0.0
var _clock: float = 0.0
var _shake: float = 0.0
var _gone: bool = false
## A line with `choice` waits on one of its answers (either goes on).
var _choosing: bool = false
var _choices: HBoxContainer
## The lines read so far, for the history (H).
var _log: Control
var _log_btn: Button
## How fast the words type (GameSettings story_speed), and the wait before an
## auto-advance moves on.
var _speed: float = 1.0
var _auto_wait: float = -1.0
## The voice: which character typed last, and the note it used.
var _shown_n: int = 0
var _voice_v: int = 0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	_lines = Js.list(node.get("scene"))
	_speed = float(GameSettings.STORY_SPEEDS.get(str(GameSettings.value("story_speed")), 1.0))
	if node.get("sceneAccent") != null:
		_accent = Color(str(node["sceneAccent"]))
	var base: ColorRect = ColorRect.new()
	base.color = Color("#07090d") if not over_water else Color(0.02, 0.03, 0.05, 0.35)
	if stage_mode:
		base.color = Color(0, 0, 0, 0)
	base.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(base)
	_back = _backdrop_rect()
	_back_next = _backdrop_rect()
	_shade = ColorRect.new()
	_shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh: ShaderMaterial = ShaderMaterial.new()
	sh.shader = _vignette()
	_shade.material = sh
	add_child(_shade)
	under = Control.new()
	under.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	under.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(under)
	if stage_mode:
		_shade.modulate.a = 0.55
		for top: bool in [true, false]:
			var bar: ColorRect = ColorRect.new()
			bar.color = Color(0, 0, 0, 0.9)
			bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
			bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE if top else Control.PRESET_BOTTOM_WIDE)
			if top:
				bar.offset_bottom = 64
			else:
				bar.offset_top = -64
			add_child(bar)
	for k: int in 2:
		var b: TextureRect = TextureRect.new()
		b.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		b.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		b.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.modulate.a = 0.0
		add_child(b)
		_busts.append(b)
	_insert = Control.new()
	_insert.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_insert.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_insert)
	over = _insert
	_build_plate()
	_flash = ColorRect.new()
	_flash.color = Color(1, 1, 1, 0)
	_flash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_flash)
	if not stage_mode:
		_set_backdrop(str(Js.obj(Rules.data()["campaign"].get("backdrops")).get(node.get("id"), "")), true)
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.45)
	resized.connect(_layout)
	_layout()
	_next()


func _backdrop_rect() -> TextureRect:
	var r: TextureRect = TextureRect.new()
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	r.modulate.a = 0.0
	add_child(r)
	return r


func _vignette() -> Shader:
	var s: Shader = Shader.new()
	s.code = """shader_type canvas_item;
void fragment() {
	vec2 d = UV - vec2(0.5, 0.42);
	float v = smoothstep(0.35, 0.95, length(d * vec2(1.0, 1.25)));
	float low = smoothstep(0.45, 1.0, UV.y);
	COLOR = vec4(0.02, 0.02, 0.04, clamp(v * 0.75 + low * 0.7, 0.0, 0.92));
}"""
	return s


func _build_plate() -> void:
	# THE WORDS SIT ON A FADE, NOT IN A BOX (Kong, 2026-10-16: the rounded box
	# with its coloured strip "look very AI-generated"): the dark rises from
	# the foot of the screen, full width, and the name and words sit on it.
	var foot: ColorRect = ColorRect.new()
	foot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	foot.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	foot.offset_top = -380.0
	var fm: ShaderMaterial = ShaderMaterial.new()
	var fs: Shader = Shader.new()
	fs.code = """
shader_type canvas_item;
void fragment() {
	float k = smoothstep(0.0, 1.0, UV.y);
	COLOR = vec4(0.0, 0.0, 0.015, 0.9 * k * k * (3.0 - 2.0 * k));
}
"""
	fm.shader = fs
	foot.material = fm
	add_child(foot)
	_plate = Control.new()
	_plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_plate)
	_name = Label.new()
	_name.add_theme_font_override("font", Kit.font("cinzel", 800))
	_name.add_theme_font_size_override("font_size", 26)
	_name.add_theme_color_override("font_color", Color(0.98, 0.93, 0.82))
	_name.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
	_name.add_theme_constant_override("shadow_offset_y", 2)
	_name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_plate.add_child(_name)
	_name.position = Vector2(34, 8)
	_text = RichTextLabel.new()
	_text.bbcode_enabled = true
	_text.fit_content = false
	_text.scroll_active = false
	_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_text.add_theme_font_override("normal_font", Kit.font("karla", 500))
	# The narrator, slanted (Karla has no italic cut).
	var slant: FontVariation = FontVariation.new()
	slant.base_font = Kit.font("karla", 400)
	slant.variation_transform = Transform2D(Vector2(1, 0), Vector2(0.2, 1), Vector2.ZERO)
	_text.add_theme_font_override("italics_font", slant)
	_text.add_theme_font_size_override("normal_font_size", 25)
	_text.add_theme_font_size_override("italics_font_size", 25)
	_text.add_theme_color_override("default_color", Color(0.95, 0.92, 0.85))
	_text.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	_text.add_theme_constant_override("shadow_offset_y", 2)
	_text.add_theme_constant_override("line_separation", 6)
	_plate.add_child(_text)
	_hint = Kit.text(_plate, "", "small", Color(0.9, 0.86, 0.78, 0.55))
	_cta = Kit.button(cta, "primary", "large", _accent)
	_plate.add_child(_cta)
	_cta.visible = false
	_cta.pressed.connect(func() -> void: _end(true))
	_skip = Button.new()
	_skip.text = "Skip  Esc"
	_skip.flat = true
	_skip.add_theme_color_override("font_color", Color(0.9, 0.86, 0.78, 0.6))
	_skip.visible = allow_skip
	_skip.pressed.connect(func() -> void: _end(false))
	add_child(_skip)
	# THE HISTORY (H): every line read so far, to look back over.
	_log_btn = Button.new()
	_log_btn.text = "History  H"
	_log_btn.flat = true
	_log_btn.add_theme_color_override("font_color", Color(0.9, 0.86, 0.78, 0.6))
	_log_btn.focus_mode = Control.FOCUS_NONE
	_log_btn.pressed.connect(_toggle_log)
	add_child(_log_btn)


func _layout() -> void:
	var vp: Vector2 = size
	var pw: float = minf(1180.0, vp.x - 120.0)
	var ph: float = 200.0
	_plate.position = Vector2((vp.x - pw) / 2.0, vp.y - ph - 46.0)
	_plate.size = Vector2(pw, ph)
	# The words in a column between the two marks (they stood under the
	# busts once the box was gone).
	var tw: float = minf(820.0, pw - 340.0)
	_text.position = Vector2((pw - tw) / 2.0, 50)
	_text.size = Vector2(tw, ph - 70)
	_name.position = Vector2((pw - tw) / 2.0, 8)
	_hint.position = Vector2(pw - 210, ph - 30)
	_cta.position = Vector2(pw - _cta.get_combined_minimum_size().x - 30, ph - 62)
	_skip.position = Vector2(vp.x - 160, 26)
	_log_btn.position = Vector2(vp.x - 300, 26)
	for k: int in 2:
		_fit(k)


## WHICH WAY EACH PORTRAIT LOOKS as painted (Kong, 2026-10-09: the cast
## "should always be looking at each other (towards the center)"): -1 to the
## left, 1 to the right; one not listed looks out front and is never turned.
## Sorted by eye from the art (checked at full size: the crocodiles all look
## left); a new portrait in profile goes in here.
const FACING: Dictionary = {
	"bilge_eel": -1,
	"Catfish": -1,
	"Coelacanth": -1,
	"Doby_Mick_v2": -1,
	"Dole": -1,
	"Mako_Shark": -1,
	"driftscout": -1,
	"thesurveyor": -1,
	"finn_portrait": -1,
	"quartermasterghost": -1,
	"raid4_gulletmaw": -1,
	"raid4_silverdart": -1,
	"raid4_theexactor": -1,
	"raid6_thequartermaster": -1,
	"raid7_thebank": -1,
	"raid8_donfinleone": -1,
	"raid8_thecloser": -1,
	"raid8_thegnash": -1,
	"raid8_thegorge": -1,
	"raid8_thereaper": -1,
	"raid8_therender": -1,
	"raid8_theripper": -1,
	"Mira": 1,
	"raid4_snapjaw": -1,
	"raid7_oldscar": -1,
	"raid7_salbrackwater": -1,
	"raid7_themangrove": -1,
	"raid7_themuzzle": -1,
	"raid7_therasp": -1,
	"raid7_thescute": -1,
	"raid7_thewedge": -1,
}


## The way a portrait looks, by its file's name: -1 left, 1 right, 0 front.
static func facing(path: String) -> int:
	return int(FACING.get(path.get_file().get_basename(), 0))


## How far past the dialogue plate's ends each mark stands (Kong: the two
## stood "too close to each other").
const SPREAD: float = 230.0


## A bust sized to its art, standing on its mark with its feet behind the
## dialogue plate, turned to look toward the middle.
func _fit(k: int) -> void:
	var b: TextureRect = _busts[k]
	# Kong, 2026-10-16: "zoomed in way too much" at 0.6 of the screen.
	var bh: float = minf(size.y * 0.44, 440.0)
	var asp: float = 0.8
	if b.texture != null:
		asp = float(b.texture.get_width()) / float(b.texture.get_height())
	b.size = Vector2(bh * asp, bh)
	b.pivot_offset = Vector2(b.size.x / 2.0, b.size.y)
	var pw: float = _plate.size.x
	var x: float = _plate.position.x - SPREAD if k == 0 else _plate.position.x + pw + SPREAD - b.size.x
	x = clampf(x, 16.0, size.x - 16.0 - b.size.x)
	b.position = Vector2(x, _plate.position.y - bh + 70.0)
	b.set_meta("home_y", b.position.y)
	# The left mark looks right and the right mark left: turned when painted
	# the other way.
	var looks: int = facing(b.texture.resource_path) if b.texture != null else 0
	b.flip_h = (k == 0 and looks < 0) or (k == 1 and looks > 0)


# ── The lines ────────────────────────────────────────────────────────────────

func _next() -> void:
	_i += 1
	if _i >= _lines.size():
		return
	var l: Dictionary = _lines[_i]
	if l.get("backdrop") != null and not stage_mode:
		_set_backdrop(str(l["backdrop"]), false)
	_wait = float(l.get("pause", 0.0)) / 1000.0
	var speaker: Variant = l.get("speaker")
	_name.text = str(speaker) if speaker != null else ""
	_stage(l)
	line_shown.emit(_i, l)
	var raw: String = str(l.get("text", ""))
	var shown: String = _bb(raw)
	_text.text = ("[i]%s[/i]" % shown) if speaker == null else shown
	_at = TypedLine.schedule(raw.replace("*", ""))
	_t = 0.0
	_shown_n = 0
	_auto_wait = -1.0
	_text.visible_characters = 0
	_typing = true
	_cta.visible = false
	_hint.text = ""
	match str(l.get("fx", "")):
		"shake":
			_shake = 0.5
			Rumble.buzz([0, 30, 40, 30])
		"flash":
			_flash.color.a = 0.85
			create_tween().tween_property(_flash, "color:a", 0.0, 0.7)


## `*word*` in the scene's accent.
func _bb(s: String) -> String:
	var out: String = s.replace("[", "[lb]")
	var parts: PackedStringArray = out.split("*")
	var r: String = ""
	for k: int in parts.size():
		r += ("[color=#%s]%s[/color]" % [_accent.to_html(false), parts[k]]) if k % 2 == 1 else parts[k]
	return r


func _line_done() -> void:
	_typing = false
	_text.visible_characters = -1
	var ch: Array = Js.list((_lines[_i] as Dictionary).get("choice"))
	if not ch.is_empty() and _choices == null:
		_ask(ch)
		return
	# Playing on its own: time to read it, then on.
	if bool(GameSettings.value("story_auto")) and _i < _lines.size() - 1:
		_auto_wait = 1.2 + 0.035 * str((_lines[_i] as Dictionary).get("text", "")).length()
	if _i >= _lines.size() - 1:
		_cta.visible = true
		_cta.grab_focus.call_deferred()
		_layout()
	else:
		_hint.text = "Space  ·  next"


func _process(delta: float) -> void:
	_clock += delta
	# The backdrop drifts, slow, the way a camera breathes.
	for r: TextureRect in [_back, _back_next]:
		r.pivot_offset = r.size / 2.0
		r.scale = Vector2.ONE * (1.06 + 0.02 * sin(_clock * 0.07))
		r.position = Vector2(sin(_clock * 0.05) * 14.0, cos(_clock * 0.04) * 8.0)
	_breathe()
	if _auto_wait >= 0.0 and not _choosing and _log == null:
		_auto_wait -= delta
		if _auto_wait < 0.0 and _i < _lines.size() - 1:
			_press()
	if _shake > 0.0:
		_shake -= delta
		position = Vector2(randf_range(-9, 9), randf_range(-6, 6)) * clampf(_shake / 0.5, 0.0, 1.0)
	else:
		position = Vector2.ZERO
	if not _typing:
		return
	if _wait > 0.0:
		_wait -= delta
		return
	_t += delta * 1000.0 * _speed
	var n: int = maxi(0, _text.visible_characters)
	while n < _at.size() and _at[n] <= _t:
		n += 1
	_text.visible_characters = n
	_speak(n)
	if n >= _at.size():
		_line_done()


func _press() -> void:
	if _gone or _choosing:
		return
	if _log != null:
		_toggle_log()
		return
	if _typing:
		_wait = 0.0
		_line_done()
		return
	if _i < _lines.size() - 1:
		Sound.plip()
		_next()


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		accept_event()
		_press()


func _unhandled_input(e: InputEvent) -> void:
	if not (e is InputEventKey) or not (e as InputEventKey).pressed or (e as InputEventKey).echo:
		return
	var k: Key = (e as InputEventKey).keycode
	if k == KEY_H:
		get_viewport().set_input_as_handled()
		_toggle_log()
		return
	if _choosing and k in [KEY_1, KEY_2, KEY_KP_1, KEY_KP_2]:
		get_viewport().set_input_as_handled()
		_answer()
		return
	if k in [KEY_SPACE, KEY_ENTER, KEY_KP_ENTER]:
		get_viewport().set_input_as_handled()
		if _log != null:
			_toggle_log()
		elif not _typing and _i >= _lines.size() - 1:
			_end(true)
		else:
			_press()
	elif k == KEY_ESCAPE and _log != null:
		get_viewport().set_input_as_handled()
		_toggle_log()
	elif k == KEY_ESCAPE and allow_skip:
		get_viewport().set_input_as_handled()
		_end(false)


func _end(read: bool) -> void:
	if _gone:
		return
	_gone = true
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.35)
	await tw.finished
	finished.emit(read)
	queue_free()


# ── The stage: the backdrop, the two marks, an insert ─────────────────────────

func _set_backdrop(path: String, now: bool) -> void:
	if path == "" or path == _back_path:
		if now and path == "":
			_back.modulate.a = 0.0
		return
	_back_path = path
	# The port's widescreen painting of the same place, where there is one
	# (port_art/scenes/w-*.jpg; the web's are tall and showed only a band).
	var wide: String = path.get_base_dir() + "/w-" + path.get_file()
	if ResourceLoader.exists("res://art" + wide):
		path = wide
	var tex: Texture2D = Skipper.tex(path.trim_prefix("/"))
	if now:
		_back.texture = tex
		_back.modulate.a = 0.0
		create_tween().tween_property(_back, "modulate:a", 1.0, 0.8)
		return
	# A cross-fade: the new place comes up over the old.
	_back_next.texture = tex
	_back_next.modulate.a = 0.0
	var tw: Tween = create_tween()
	tw.tween_property(_back_next, "modulate:a", 1.0, 0.9)
	tw.tween_callback(func() -> void:
		_back.texture = tex
		_back.modulate.a = 1.0
		_back_next.modulate.a = 0.0)


## stageAt: who stands where. The first speaker takes the left, the next the
## right; a third evicts whoever spoke least recently.
func _stage(l: Dictionary) -> void:
	for c: Node in _insert.get_children():
		c.queue_free()
	var ins: Variant = l.get("insert")
	if stage_mode and (l.get("portrait", "") == "" or ins is Dictionary):
		# The narrator over the water: the busts step out so the sea is seen.
		for b: TextureRect in _busts:
			create_tween().tween_property(b, "modulate:a", 0.0, 0.3)
		return
	if ins is Dictionary:
		for b: TextureRect in _busts:
			create_tween().tween_property(b, "modulate:a", 0.0, 0.25)
		_show_insert(ins)
		return
	var who: Variant = l.get("speaker")
	var face: String = str(l.get("portrait", ""))
	if face == "":
		# The narrator: everyone stays, dimmed.
		for k: int in 2:
			_light(k, false)
		return
	var key: String = str(who) if who != null else face
	var slot: int = -1
	for k: int in 2:
		if _slots[k].get("key") == key:
			slot = k
	if slot < 0:
		if _slots[0].is_empty():
			slot = 0
		elif _slots[1].is_empty():
			slot = 1
		else:
			slot = 0 if int(_slots[0]["at"]) < int(_slots[1]["at"]) else 1
		_slots[slot] = { "key": key, "at": _i }
		var b: TextureRect = _busts[slot]
		b.texture = Skipper.tex(face.trim_prefix("/"))
		_fit(slot)
		b.modulate.a = 0.0
		var from: float = -60.0 if slot == 0 else 60.0
		var home: float = b.position.x
		b.position.x = home + from
		var tw: Tween = create_tween().set_parallel()
		tw.tween_property(b, "position:x", home, 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_property(b, "modulate:a", 1.0, 0.35)
	elif str(_slots[slot].get("face", face)) != face:
		# The same speaker with a new portrait (Finn after he changes, and back):
		# the picture changes where they stand. It kept the first one before.
		var b2: TextureRect = _busts[slot]
		b2.texture = Skipper.tex(face.trim_prefix("/"))
		_fit(slot)
		b2.modulate.a = 0.0
		create_tween().tween_property(b2, "modulate:a", 1.0, 0.35)
	_slots[slot]["at"] = _i
	_slots[slot]["face"] = face
	var ghost: bool = l.get("ghost", false) == true
	for k: int in 2:
		_light(k, k == slot, ghost and k == slot, l.get("closeup", false) == true and k == slot)


func _light(k: int, on: bool, ghost: bool = false, close: bool = false) -> void:
	var b: TextureRect = _busts[k]
	if b.texture == null:
		return
	var col: Color = Color(1, 1, 1, 1) if on else Color(0.55, 0.55, 0.6, 0.62)
	if ghost:
		col = Color(0.7, 0.85, 1.0, 0.62)
	var sc: float = (1.2 if close else 1.03) if on else 0.96
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(b, "modulate", col, 0.25)
	tw.tween_property(b, "scale", Vector2(sc, sc), 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	# The speaker leans a touch toward the one they are talking to.
	tw.tween_property(b, "rotation", (0.025 if k == 0 else -0.025) if on else 0.0, 0.4).set_trans(Tween.TRANS_SINE)
	# A raised voice: a small bump as the line starts.
	if on and not close and _i >= 0 and str((_lines[_i] as Dictionary).get("text", "")).contains("!"):
		var bump: Tween = create_tween()
		bump.tween_property(b, "scale", Vector2(sc * 1.06, sc * 1.06), 0.12).set_delay(0.05)
		bump.tween_property(b, "scale", Vector2(sc, sc), 0.25).set_trans(Tween.TRANS_SINE)


## An insert: the thing itself, alone on the stage.
func _show_insert(ins: Dictionary) -> void:
	var kind: String = str(ins.get("kind", ""))
	var art: Dictionary = { "finn-silhouette": "finn_portrait.png", "finn-unmasked": "finn_final.png", "finn-becoming": "finn_final.png", "finn-sinister": "finn_final.png", "finn-undone": "finn_portrait.png", "finn-remains": "finn_portrait.png" }
	var card: Control = Control.new()
	card.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_insert.add_child(card)
	var y0: float = -size.y * 0.14
	if art.has(kind):
		var t: TextureRect = TextureRect.new()
		t.texture = Skipper.tex(art[kind])
		t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		t.size = Vector2(440, 520)
		t.position = Vector2(-220, y0 - 300)
		t.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var tint: Dictionary = { "finn-silhouette": Color(0.08, 0.08, 0.12), "finn-sinister": Color(0.85, 0.6, 0.95), "finn-undone": Color(0.7, 0.75, 0.85, 0.7), "finn-remains": Color(0.5, 0.55, 0.6, 0.5) }
		t.modulate = tint.get(kind, Color.WHITE)
		card.add_child(t)
	else:
		var d: InsertArt = InsertArt.new()
		d.kind = kind
		d.wax = str(ins.get("wax", ""))
		d.accent = _accent
		d.position = Vector2(0, y0 - 60)
		card.add_child(d)
	card.modulate.a = 0.0
	card.scale = Vector2(0.92, 0.92)
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(card, "modulate:a", 1.0, 0.5)
	tw.tween_property(card, "scale", Vector2.ONE, 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## A drawn insert: a sealed letter, a ledger page, the harvest, the dial.
class InsertArt:
	extends Node2D
	var kind: String = ""
	var wax: String = ""
	var accent: Color = GOLD

	func _draw() -> void:
		var paper: Color = Color(0.93, 0.87, 0.72)
		var ink: Color = Color(0.22, 0.15, 0.08)
		var f: Font = Kit.font("cinzel", 800)
		match kind:
			"sealed-letter":
				draw_rect(Rect2(-230, -150, 460, 300), Color(0, 0, 0, 0.4))
				draw_rect(Rect2(-224, -156, 448, 300), paper)
				draw_line(Vector2(-224, -156), Vector2(0, 10), Color(ink, 0.35), 2.0)
				draw_line(Vector2(224, -156), Vector2(0, 10), Color(ink, 0.35), 2.0)
				draw_circle(Vector2(0, 10), 54, Color(0.55, 0.06, 0.08))
				draw_circle(Vector2(0, 10), 44, Color(0.68, 0.1, 0.12))
				var sz: Vector2 = f.get_string_size(wax, HORIZONTAL_ALIGNMENT_LEFT, -1, 30)
				draw_string(f, Vector2(-sz.x / 2.0, 21), wax, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, Color(0.95, 0.75, 0.6))
			"ledger-f":
				draw_rect(Rect2(-210, -230, 420, 460), paper)
				for r: int in 14:
					draw_line(Vector2(-180, -190 + r * 28), Vector2(180, -190 + r * 28), Color(ink, 0.18), 1.0)
					draw_line(Vector2(-170, -198 + r * 28), Vector2(-170 + 60 + (r * 37) % 200, -198 + r * 28), Color(ink, 0.5), 2.0)
				var s2: Vector2 = f.get_string_size("F", HORIZONTAL_ALIGNMENT_LEFT, -1, 120)
				draw_string(f, Vector2(110 - s2.x / 2.0, 140), "F", HORIZONTAL_ALIGNMENT_LEFT, -1, 120, Color(0.6, 0.08, 0.1, 0.85))
			_:
				draw_circle(Vector2.ZERO, 170, Color(accent, 0.12))
				draw_arc(Vector2.ZERO, 170, 0.0, TAU, 72, Color(accent, 0.7), 4.0, true)
				draw_arc(Vector2.ZERO, 120, 0.0, TAU, 72, Color(accent, 0.35), 2.0, true)
				for k: int in 12:
					var a: float = TAU * k / 12.0
					draw_line(Vector2.from_angle(a) * 130, Vector2.from_angle(a) * 165, Color(accent, 0.6), 3.0)


## The line's answers, as buttons over its plate (1 and 2 on the keys).
## Every answer goes on: the crew answer for the captain either way.
func _ask(ch: Array) -> void:
	_choosing = true
	_hint.text = ""
	_choices = HBoxContainer.new()
	_choices.add_theme_constant_override("separation", 14)
	_choices.alignment = BoxContainer.ALIGNMENT_END
	_plate.add_child(_choices)
	for k: int in ch.size():
		var b: Pane.PaneButton = Kit.button("%s  %d" % [str(ch[k]), k + 1], "primary" if k == ch.size() - 1 else "secondary", "large", _accent)
		b.pressed.connect(_answer)
		_choices.add_child(b)
	_choices.position = Vector2(_plate.size.x - _choices.get_combined_minimum_size().x - 30, _plate.size.y - 62)
	(_choices.get_child(_choices.get_child_count() - 1) as Control).grab_focus.call_deferred()


func _answer() -> void:
	if not _choosing:
		return
	_choosing = false
	Sound.plip()
	_choices.queue_free()
	_choices = null
	if _i < _lines.size() - 1:
		_next()
	else:
		_end(true)


## The speaker's voice under the words as they type: a soft blip every few
## letters (not on spaces or stops), off for the narrator and in settings.
func _speak(n: int) -> void:
	if n <= _shown_n:
		return
	var l: Dictionary = _lines[_i]
	var who: Variant = l.get("speaker")
	var plain: String = str(l.get("text", "")).replace("*", "")
	var fire: bool = false
	for k: int in range(_shown_n, n):
		if k < plain.length() and k % 3 == 0 and plain[k] != " " and not ".,!?".contains(plain[k]):
			fire = true
	_shown_n = n
	if fire and who != null and _speed < 100.0 and bool(GameSettings.value("story_voices")):
		_voice_v = (_voice_v + 1 + randi() % 2) % 3
		Sound.voice(str(who), _voice_v)


## The one speaking breathes: a slow bob of a couple of pixels.
func _breathe() -> void:
	for k: int in 2:
		var b: TextureRect = _busts[k]
		if b.texture == null:
			continue
		if not b.has_meta("home_y"):
			b.set_meta("home_y", b.position.y)
		var lit: bool = b.modulate.r > 0.9
		b.position.y = float(b.get_meta("home_y")) + (sin(_clock * 2.2 + k) * 2.5 if lit else 0.0)


## THE HISTORY: every line read so far, newest at the bottom; H, a press or
## Esc closes it.
func _toggle_log() -> void:
	if _log != null:
		_log.queue_free()
		_log = null
		return
	_log = Control.new()
	_log.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_log.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_log)
	var dim: ColorRect = ColorRect.new()
	dim.color = Color(0.02, 0.02, 0.04, 0.9)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_log.add_child(dim)
	var sc: ScrollContainer = ScrollContainer.new()
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var w: float = minf(980.0, size.x - 120.0)
	sc.position = Vector2((size.x - w) / 2.0, 80.0)
	sc.size = Vector2(w, size.y - 170.0)
	UiTheme.night_scroll(sc)
	_log.add_child(sc)
	var col: VBoxContainer = VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 14)
	sc.add_child(col)
	for k: int in range(0, _i + 1):
		var l: Dictionary = _lines[k]
		var who: Variant = l.get("speaker")
		if who != null:
			Kit.text(col, str(who).to_upper(), "eyebrow", _accent)
		var t: Label = Kit.text(col, str(l.get("text", "")).replace("*", ""), "body", Color(0.95, 0.92, 0.85) if who != null else Color(0.85, 0.82, 0.76, 0.8), true)
		t.custom_minimum_size.x = w - 30.0
	var hint: Label = Kit.text(_log, "H, Esc or a click to go back", "small", Color(0.9, 0.86, 0.78, 0.55))
	hint.position = Vector2((size.x - w) / 2.0, size.y - 70.0)
	_log.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
			_toggle_log())
	sc.set_deferred("scroll_vertical", 100000)
