extends Node
## THE GAME'S ENTRY (Godot port, stage 1): the controls, the captain, the sea.
##
## The captain select comes later (the desktop shell's design carries over);
## for now the most recently played captain opens, or a first one starts.


func _ready() -> void:
	_bind("sail_up", [KEY_W, KEY_UP], [], JOY_AXIS_LEFT_Y, -1.0)
	_bind("sail_down", [KEY_S, KEY_DOWN], [], JOY_AXIS_LEFT_Y, 1.0)
	_bind("sail_left", [KEY_A, KEY_LEFT], [], JOY_AXIS_LEFT_X, -1.0)
	_bind("sail_right", [KEY_D, KEY_RIGHT], [], JOY_AXIS_LEFT_X, 1.0)
	_bind("fish_act", [KEY_SPACE, KEY_ENTER], [JOY_BUTTON_A], -1, 0.0)
	_bind("fish_back", [KEY_ESCAPE], [JOY_BUTTON_B], -1, 0.0)
	var sea: Sea = Sea.new()
	sea.session = Session.open_latest()
	add_child(sea)


func _bind(action: String, keys: Array, buttons: Array, axis: int, dir: float) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action, 0.2)
	for k: int in keys:
		var e: InputEventKey = InputEventKey.new()
		e.physical_keycode = k
		InputMap.action_add_event(action, e)
	for b: int in buttons:
		var j: InputEventJoypadButton = InputEventJoypadButton.new()
		j.button_index = b
		InputMap.action_add_event(action, j)
	if axis >= 0:
		var m: InputEventJoypadMotion = InputEventJoypadMotion.new()
		m.axis = axis
		m.axis_value = dir
		InputMap.action_add_event(action, m)
