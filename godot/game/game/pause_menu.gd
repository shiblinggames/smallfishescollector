class_name PauseMenu
extends Control
## THE ESC MENU (Godot port, 2026-10-04): over the game when Esc (B on a pad)
## is pressed with nothing else to close: Resume, Settings, Captains (back to
## the captain select, saved) and Quit to Desktop (saved). In a Charter the
## crew's game does not stop for one captain's menu, so nothing is paused;
## alone, the world keeps its clock too (the sea is player-paced; nothing is
## lost by a menu).

signal resumed

var session: Session
var on_captains: Callable
var on_quit: Callable
var captains_label: String = "Captains"


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.06, 0.55)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			_resume())
	add_child(shade)
	var sheet: Control = Control.new()
	sheet.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	sheet.offset_left = -170
	sheet.offset_right = 170
	sheet.offset_top = -190
	sheet.offset_bottom = 190
	add_child(sheet)
	Paper.night = true
	Paper.sheet(sheet, 8.0)
	var col: VBoxContainer = VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.offset_left = 30
	col.offset_right = -30
	col.offset_top = 28
	col.offset_bottom = -28
	col.add_theme_constant_override("separation", 10)
	sheet.add_child(col)
	var t: Label = Paper.text(col, "Paused", "display", Paper.ink())
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var first: Pane.PaneButton = null
	for b: Array in [["Resume", _resume], ["Settings", _settings], [captains_label, _captains], ["Quit to Desktop", _quit]]:
		var bt: Pane.PaneButton = Paper.button(b[0], b[0] == "Resume")
		bt.custom_minimum_size = Vector2(0, 46)
		bt.pressed.connect(b[1])
		col.add_child(bt)
		if first == null:
			first = bt
	var v: Label = Paper.text(col, GameSettings.build(), "small", Paper.ink_faint())
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Paper.night = false
	first.grab_focus.call_deferred()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		_resume()


func _resume() -> void:
	Sound.plip()
	resumed.emit()
	queue_free()


func _settings() -> void:
	Sound.plip()
	var s: SettingsSheet = SettingsSheet.new()
	s.session = session
	add_child(s)


func _captains() -> void:
	Sound.plip()
	queue_free()
	if on_captains.is_valid():
		on_captains.call()


func _quit() -> void:
	if session != null:
		session.persist()
	if on_quit.is_valid():
		on_quit.call()
	get_tree().quit()
