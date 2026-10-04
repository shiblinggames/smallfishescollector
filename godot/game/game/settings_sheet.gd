class_name SettingsSheet
extends Control
## SETTINGS (Godot port, 2026-10-04; Kong: "a much more robust settings page"),
## on the night paper, opened from the title screen or the Esc menu. Tabs:
##   SOUND     master, music, effects, the sea, and quiet in the background.
##   DISPLAY   window mode and size, VSync, the frame limit, the FPS counter.
##   PLAY      the bite timer (this captain's), controller rumble, reduced
##             flashes, whether the full combat log starts open.
##   CONTROLS  every key and button, by place.
##   ABOUT     the build, the saves and logs folders, the credits and licences.
## Kept by GameSettings (Prefs); applied as they change.

signal closed

## The captain playing, when opened from a game (the bite timer is theirs).
var session: Session
var _body: VBoxContainer
var _tab: String = "sound"


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.06, 0.6)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	add_child(shade)
	var sheet: Control = Control.new()
	sheet.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	sheet.offset_left = -460
	sheet.offset_right = 460
	sheet.offset_top = -330
	sheet.offset_bottom = 330
	add_child(sheet)
	Paper.night = true
	Paper.sheet(sheet, 8.0)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 28)
	sheet.add_child(m)
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 10)
	m.add_child(_body)
	Paper.night = false
	_paint()


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


func _paint() -> void:
	Paper.night = true
	for c: Node in _body.get_children():
		c.queue_free()
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	_body.add_child(head)
	var tl: Label = Paper.text(head, "Settings", "display", Paper.ink())
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for t: Array in [["sound", "Sound"], ["display", "Display"], ["play", "Play"], ["controls", "Controls"], ["about", "About"]]:
		var tb: Pane.PaneButton = Paper.button(t[1], _tab == t[0])
		var id: String = t[0]
		tb.pressed.connect(func() -> void:
			_tab = id
			Sound.plip()
			_paint())
		head.add_child(tb)
	Paper.rule(_body)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var list: VBoxContainer = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 14)
	scroll.add_child(list)
	match _tab:
		"sound": _sound(list)
		"display": _display(list)
		"play": _play(list)
		"controls": _controls(list)
		"about": _about(list)
	var foot: HBoxContainer = HBoxContainer.new()
	foot.alignment = BoxContainer.ALIGNMENT_END
	_body.add_child(foot)
	var x: Pane.PaneButton = Paper.button("Done  Esc")
	x.pressed.connect(close)
	foot.add_child(x)
	Paper.night = false


# ── Rows ─────────────────────────────────────────────────────────────────────

func _row(list: Control, label: String, note: String) -> HBoxContainer:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	list.add_child(row)
	var words: VBoxContainer = VBoxContainer.new()
	words.add_theme_constant_override("separation", 0)
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(words)
	Paper.text(words, label, "body_strong", Paper.ink())
	if note != "":
		Paper.text(words, note, "small", Paper.ink_soft(), true)
	return row


func _slider(list: Control, label: String, key: String) -> void:
	var row: HBoxContainer = _row(list, label, "")
	var pct: Label = Paper.text(row, "%d%%" % int(round(float(GameSettings.value(key)) * 100.0)), "body_strong", Paper.ink_soft())
	pct.custom_minimum_size = Vector2(52, 0)
	pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var s: HSlider = HSlider.new()
	s.min_value = 0.0
	s.max_value = 1.0
	s.step = 0.05
	s.value = float(GameSettings.value(key))
	s.custom_minimum_size = Vector2(300, 28)
	s.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	s.value_changed.connect(func(v: float) -> void:
		GameSettings.set_value(key, v)
		pct.text = "%d%%" % int(round(v * 100.0)))
	s.drag_ended.connect(func(_c: bool) -> void: Sound.plip())
	row.add_child(s)
	row.move_child(pct, row.get_child_count() - 1)


func _toggle(list: Control, label: String, note: String, on: bool, f: Callable) -> void:
	var row: HBoxContainer = _row(list, label, note)
	var cb: CheckButton = CheckButton.new()
	cb.button_pressed = on
	cb.focus_mode = Control.FOCUS_ALL
	cb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	cb.toggled.connect(func(v: bool) -> void:
		Sound.plip()
		f.call(v))
	row.add_child(cb)


func _choice(list: Control, label: String, note: String, options: Array, current: Variant, f: Callable) -> void:
	var row: HBoxContainer = _row(list, label, note)
	var ob: OptionButton = OptionButton.new()
	ob.custom_minimum_size = Vector2(240, 36)
	ob.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	for i: int in options.size():
		ob.add_item(str(options[i][1]), i)
		if options[i][0] == current:
			ob.select(i)
	ob.item_selected.connect(func(i: int) -> void:
		Sound.plip()
		f.call(options[i][0]))
	row.add_child(ob)


# ── The tabs ─────────────────────────────────────────────────────────────────

func _sound(list: Control) -> void:
	_slider(list, "Master volume", "vol_master")
	_slider(list, "Music", "vol_music")
	_slider(list, "Sound effects", "vol_sfx")
	_slider(list, "The sea (waves, wind, gulls, rain)", "vol_amb")
	_toggle(list, "Quiet in the background", "Mute the game while its window is not the one in front.", bool(GameSettings.value("quiet_unfocused")), func(v: bool) -> void: GameSettings.set_value("quiet_unfocused", v))


func _display(list: Control) -> void:
	_choice(list, "Window", "", [["windowed", "Windowed"], ["borderless", "Borderless fullscreen"], ["fullscreen", "Fullscreen"]], GameSettings.value("window_mode"), func(v: Variant) -> void:
		GameSettings.set_value("window_mode", v)
		_paint())
	if str(GameSettings.value("window_mode")) == "windowed":
		var sizes: Array = GameSettings.SIZES.map(func(s: String) -> Array: return [s, s.replace("x", " x ")])
		_choice(list, "Window size", "", sizes, GameSettings.value("window_size"), func(v: Variant) -> void: GameSettings.set_value("window_size", v))
	_toggle(list, "VSync", "Matches the frames to your screen; no tearing.", bool(GameSettings.value("vsync")), func(v: bool) -> void: GameSettings.set_value("vsync", v))
	var caps: Array = GameSettings.CAPS.map(func(c: int) -> Array: return [c, "No limit" if c == 0 else "%d frames a second" % c])
	_choice(list, "Frame limit", "", caps, int(GameSettings.value("fps_cap")), func(v: Variant) -> void: GameSettings.set_value("fps_cap", v))
	_toggle(list, "Show frames a second", "A small counter in the corner.", bool(GameSettings.value("show_fps")), func(v: bool) -> void: GameSettings.set_value("show_fps", v))


func _play(list: Control) -> void:
	if session != null:
		_toggle(list, "Show the bite timer", "While a line is out, how long until something bites. This captain's own.", session.profile().get("show_wait_timer") != false, func(v: bool) -> void:
			await session.act("setShowWaitTimer", [v])
			session.persist())
	_toggle(list, "Controller rumble", "", bool(GameSettings.value("rumble")), func(v: bool) -> void: GameSettings.set_value("rumble", v))
	_toggle(list, "Reduce flashes", "Softer bursts, lightning and summon flashes in fights.", bool(GameSettings.value("reduce_flash")), func(v: bool) -> void: GameSettings.set_value("reduce_flash", v))
	_toggle(list, "Full combat log open in fights", "The whole log down the right edge (L in a fight).", bool(Prefs.get_value("combat_log_open", false)), func(v: bool) -> void: Prefs.set_value("combat_log_open", v))


const KEYS: Array = [
	["AT SEA", [["Sail", "W A S D  or  arrows", "Left stick"], ["Cast, reel in, confirm", "Space  or  Enter", "A"], ["Back, walk away, the menu", "Esc", "B"], ["Talk, dock, reach", "E", "Y"], ["The chart", "M", "Back"], ["The locker", "I", "X"], ["Swap bait", "Q", "LB"]]],
	["IN A FIGHT", [["Fire (Volley V, the Mega M when you can)", "F", ""], ["Reload", "R", ""], ["Dodge", "D", ""], ["Special (the repair kit)", "S", ""], ["Flee", "X", ""], ["The war drum", "B", ""], ["Next target", "Tab", ""], ["Lock the shot", "Space  or  click", "A"], ["The full log", "L", ""]]],
]


func _controls(list: Control) -> void:
	for sec: Array in KEYS:
		Paper.text(list, str(sec[0]), "eyebrow", Paper.ink_soft())
		for k: Array in sec[1]:
			var row: HBoxContainer = _row(list, str(k[0]), "")
			var kl: Label = Paper.text(row, str(k[1]), "body_strong", Paper.ink())
			kl.custom_minimum_size = Vector2(200, 0)
			var pl: Label = Paper.text(row, str(k[2]) if str(k[2]) != "" else "-", "small", Paper.ink_soft())
			pl.custom_minimum_size = Vector2(90, 0)
	Paper.text(list, "Rebinding comes later.", "small", Paper.ink_faint())


func _about(list: Control) -> void:
	Paper.stat(list, "Build", GameSettings.build())
	var r: HBoxContainer = HBoxContainer.new()
	r.add_theme_constant_override("separation", 10)
	list.add_child(r)
	var sv: Pane.PaneButton = Paper.button("Open the saves folder")
	sv.pressed.connect(func() -> void: OS.shell_open(ProjectSettings.globalize_path("user://")))
	r.add_child(sv)
	var lg: Pane.PaneButton = Paper.button("Open the logs folder")
	lg.pressed.connect(func() -> void: OS.shell_open(ProjectSettings.globalize_path("user://logs")))
	r.add_child(lg)
	Paper.text(list, "Reporting a problem? Send the newest file in the logs folder along with what you were doing.", "small", Paper.ink_soft(), true)
	Paper.rule(list)
	Paper.text(list, "CREDITS", "eyebrow", Paper.ink_soft())
	Paper.text(list, "Seas the Booty, by Shibling Games.", "body_strong", Paper.ink())
	Paper.text(list, "Made with the Godot Engine (godotengine.org/license), MIT licence. Copyright (c) 2014-present Godot Engine contributors; (c) 2007-2014 Juan Linietsky, Ariel Manzur.", "small", Paper.ink_soft(), true)
	Paper.text(list, "Steam support through GodotSteam (godotsteam.com), MIT licence. Copyright (c) 2015-present Gramps and contributors. Steamworks SDK (c) Valve Corporation.", "small", Paper.ink_soft(), true)
	Paper.text(list, "Type: Cinzel and Karla, SIL Open Font Licence 1.1.", "small", Paper.ink_soft(), true)
