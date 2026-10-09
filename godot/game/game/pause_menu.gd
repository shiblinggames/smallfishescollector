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
## The night paper (true) or the day's (false); null: read off the sea.
var night_side: Variant = null
var _parts: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE TWO PAPERS (M12): the day's paper on the fishing grounds, the night
	# paper north of the reef and in a fight.
	var nt: bool = _night_side()
	_parts = Paper.open(self, Vector2(340, 400), nt, _resume, 30)
	var col: VBoxContainer = _parts["body"]
	Paper.night = nt
	var t: Label = Paper.text(col, "Paused", "display_sm", Paper.ink())
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Paper.rule(col, nt)
	var first: Pane.PaneButton = null
	for b: Array in [["Resume", _resume], ["Settings", _settings], [captains_label, _captains], ["Quit to Desktop", _quit]]:
		# Resume is the one thing to do (the plank); the rest are quiet.
		var bt: Pane.PaneButton = Paper.primary(b[0], nt) if b[0] == "Resume" else Paper.button(b[0], false, nt)
		bt.custom_minimum_size = Vector2(0, 46)
		bt.pressed.connect(b[1])
		col.add_child(bt)
		if first == null:
			first = bt
	var v: Label = Paper.text(col, GameSettings.build(), "small", Paper.ink_faint())
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Paper.night = false
	first.grab_focus.call_deferred()


## Which paper: given by the opener, or read off the sea (north of the reef,
## or a fight on the water).
func _night_side() -> bool:
	if night_side != null:
		return bool(night_side)
	var main: Node = get_tree().current_scene if is_inside_tree() else null
	var scr: Variant = main.get("_screen") if main != null else null
	if scr is Sea:
		var sea: Sea = scr
		if sea.stage != null:
			return true
		var boat: Variant = sea.get("_boat")
		if boat is Node2D:
			return North.is_north((boat as Node2D).position)
	if session != null:
		var y: Variant = session.profile().get("sea_y")
		if y != null:
			return North.is_north(Vector2(0, Js.num(y)))
	return false


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		_resume()


func _resume() -> void:
	if Motion.closing(self):
		return
	Sound.plip()
	resumed.emit()
	Paper.close(self, _parts)


func _settings() -> void:
	Sound.plip()
	var s: SettingsSheet = SettingsSheet.new()
	s.session = session
	add_child(s)


func _captains() -> void:
	if Motion.closing(self):
		return
	Sound.plip()
	Paper.close(self, _parts)
	if on_captains.is_valid():
		on_captains.call()


func _quit() -> void:
	if session != null:
		session.persist()
	if on_quit.is_valid():
		on_quit.call()
	get_tree().quit()
