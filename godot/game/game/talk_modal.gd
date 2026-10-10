extends Control
## THE TALK MODAL: the shell shared by FinnScene (game/finn_scene.gd) and
## FolkScene (game/folk_scene.gd), which were the same modal built twice
## (merged 2026-10-10). It owns the dimmed chart behind, the centred card in
## the speaker's accent, the head (face, eyebrow, name, close), the reserved
## block where their words are typed out beside a thin accent rule, the
## choices column and its error line, and the input every talk takes: a tap
## finishes the typing, Back leaves, Accept finishes the typing.
##
## No class_name (the class cache is rebuilt only by an import): the scenes
## extend it by path. Each keeps its own flow, its own choice buttons (Finn's
## gold words, a regular's tagged rows) and its own way of being left, through
## _tap_outside and _back.

signal closed

var session: Session
## The speaker's colour: the card's frame, the rule, the eyebrow.
var _accent: Color = Color.WHITE
var _card: Pane
var _line: TypedLine
var _choices: VBoxContainer
var _err: Label
var _busy: bool = false
var _asked: Dictionary = {}


## The full-screen layer and its scrim (a tap on it goes to _tap_outside);
## the centring box the card goes in, at whatever depth the scene wants it.
func _build_shell() -> CenterContainer:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = Kit.scrim(self)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			_tap_outside())
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	return center


## The card in the accent under `parent`, at `min_size`; its column back.
func _build_card(parent: Control, min_size: Vector2) -> VBoxContainer:
	var spec: Dictionary = Kit.modal(_accent, 18)
	spec["top"] = [1, Kit.a(_accent, 0.56)]
	_card = Kit.pane(parent, spec)
	_card.custom_minimum_size = min_size
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	_card.add_child(col)
	return col


## Who: their face, the eyebrow over their name, and the close button. The
## eyebrow comes back (a regular's role is rewritten as the tier moves).
func _build_head(col: VBoxContainer, face: Dictionary, eyebrow: String, title: String) -> Label:
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	col.add_child(head)
	var av: Avatar = Avatar.new()
	av.face = face
	av.px = 58.0
	head.add_child(av)
	var who: VBoxContainer = VBoxContainer.new()
	who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	who.alignment = BoxContainer.ALIGNMENT_CENTER
	who.add_theme_constant_override("separation", 1)
	head.add_child(who)
	var brow: Label = Kit.text(who, eyebrow, "eyebrow", _accent)
	Kit.text(who, title, "title", Kit.INK)
	var x: Button = Kit.close_button()
	x.pressed.connect(close)
	head.add_child(x)
	return brow


## What they are saying: a reserved block `min_h` tall (their lines run from
## four words to thirty and the card must not jump), the accent rule beside
## the italic TypedLine.
func _build_say(col: VBoxContainer, min_h: float) -> void:
	var say_box: HBoxContainer = HBoxContainer.new()
	say_box.add_theme_constant_override("separation", 12)
	say_box.custom_minimum_size = Vector2(0, min_h)
	col.add_child(say_box)
	var rule: ColorRect = ColorRect.new()
	rule.color = Kit.a(_accent, 0.5)
	rule.custom_minimum_size = Vector2(2, 0)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	say_box.add_child(rule)
	_line = TypedLine.new()
	_line.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Kit.style(_line, "body", Color("#e6eef4"))
	_line.add_theme_font_size_override("font_size", 17)
	_line.add_theme_font_override("font", Kit.italic())
	_line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_line.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	_line.size_flags_vertical = Control.SIZE_EXPAND_FILL
	say_box.add_child(_line)


## The choices column and the error line under it.
func _build_choices(col: VBoxContainer) -> void:
	_choices = VBoxContainer.new()
	_choices.add_theme_constant_override("separation", 7)
	col.add_child(_choices)
	_err = Kit.text(col, "", "small", Kit.DANGER_INK, true)
	_err.visible = false


func _clear_choices() -> void:
	for c: Node in _choices.get_children():
		c.queue_free()


## A choice's bare button: the frame from `n` (and `h` under the pointer),
## taller with a hint, and the side margins its words go in.
func _choice_frame(n: Dictionary, h: Dictionary, hint: String) -> Array:
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.custom_minimum_size = Vector2(0, 52 if hint != "" else 42)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side: String in ["left", "right"]:
		m.add_theme_constant_override("margin_" + side, 14)
	b.add_child(m)
	return [b, m]


## The column a choice's words stack in, centred, under `parent`.
func _choice_words(parent: Control) -> VBoxContainer:
	var words: VBoxContainer = VBoxContainer.new()
	words.alignment = BoxContainer.ALIGNMENT_CENTER
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	words.add_theme_constant_override("separation", 0)
	parent.add_child(words)
	return words


## A tap on the dimmed chart. Each scene says what it does.
func _tap_outside() -> void:
	pass


## Back pressed (already marked handled). Each scene says what it does.
func _back() -> void:
	close()


func close() -> void:
	closed.emit()
	queue_free()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and _line.typing:
		_line.finish()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		_back()
	elif event.is_action_pressed("ui_accept") and _line.typing:
		get_viewport().set_input_as_handled()
		_line.finish()
