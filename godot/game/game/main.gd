class_name Main
extends Node
## THE GAME'S ENTRY (Godot port): the controls, Steam, and which screen is up.
##
##   the title      solo captains and Charters (Title)
##   the harbor     a new Charter gathering its crew (HarbourLobby)
##   the sea        a solo captain, or a Charter captain with the crew (Sea)
##
## The crew's line (CrewNet) lives here for the whole run, so going from the
## harbor to the sea keeps the connection. Launched from a Steam invite while
## the game was closed, Steam passes +connect_lobby <id>, and the game joins.

## Tests skip the title and open the most recent captain straight onto the sea.
static var straight_to_sea: bool = false

var net: CrewNet
var _screen: Node = null
## A crewmate's captain, from the founder's welcome.
var _mine: Session = null
var _joining_name: String = ""


func _ready() -> void:
	_bind("sail_up", [KEY_W, KEY_UP], [], JOY_AXIS_LEFT_Y, -1.0)
	_bind("sail_down", [KEY_S, KEY_DOWN], [], JOY_AXIS_LEFT_Y, 1.0)
	_bind("sail_left", [KEY_A, KEY_LEFT], [], JOY_AXIS_LEFT_X, -1.0)
	_bind("sail_right", [KEY_D, KEY_RIGHT], [], JOY_AXIS_LEFT_X, 1.0)
	_bind("fish_act", [KEY_SPACE, KEY_ENTER], [JOY_BUTTON_A], -1, 0.0)
	_bind("fish_back", [KEY_ESCAPE], [JOY_BUTTON_B], -1, 0.0)
	_bind("reach", [KEY_E], [JOY_BUTTON_Y], -1, 0.0)
	_bind("chart", [KEY_M], [JOY_BUTTON_BACK], -1, 0.0)
	_bind("locker", [KEY_I], [JOY_BUTTON_X], -1, 0.0)
	_bind("swap", [KEY_Q], [JOY_BUTTON_LEFT_SHOULDER], -1, 0.0)
	SteamLayer.start()
	net = CrewNet.new()
	net.name = "CrewNet"
	add_child(net)
	net.welcomed.connect(_on_welcomed)
	net.sailing.connect(_on_sailing)
	net.refused_by_founder.connect(func(why: String) -> void: title(why))
	net.lost.connect(func(why: String) -> void:
		if _screen is Title:
			(_screen as Title).note = why
		else:
			title(why))
	if straight_to_sea:
		_sea(Session.open_latest(), false)
		return
	var args: PackedStringArray = OS.get_cmdline_args()
	var at: int = args.find("+connect_lobby")
	if at >= 0 and at + 1 < args.size() and SteamLayer.up:
		title("")
		net.join_lobby(int(args[at + 1]))
		return
	title("")


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


func _show(n: Node) -> void:
	if _screen != null:
		_screen.queue_free()
	_screen = n
	add_child(n)


## The title screen, with a note (why a Charter dropped, say).
func title(note: String) -> void:
	var t: Title = Title.new()
	t.note = note
	t.play.connect(func(id: String) -> void:
		var loaded: Dictionary = Captains.open(id)
		if loaded.has("error"):
			title("That captain's save would not open: %s" % loaded["error"])
			return
		_sea(Session.new(loaded["save"], loaded["carried"]), false))
	t.new_captain.connect(func(n: String) -> void: _sea(Captains.make(n), false))
	t.host.connect(func(id: String) -> void: host(id))
	t.found.connect(func(n: String, hardcore: bool, cap: String) -> void:
		var c: Charter = Charter.found(n, hardcore, SteamLayer.player_key(), cap)
		host(c.id()))
	t.join.connect(func(address: String, cap: String) -> void: join(address, cap))
	_show(t)


## The founder opens their Charter: to the harbor while the crew gathers, or
## straight onto the sea once it has sailed.
func host(id: String) -> void:
	var c: Charter = Charter.open(id)
	if c == null:
		title("That Charter's file would not open.")
		return
	var err: Error = net.host(c)
	if err != OK:
		title("The Charter could not open to the crew (%s)." % error_string(err))
		return
	if c.sailed():
		_sea(c.session_for(net.key), true)
	else:
		_harbour(net._info())


func join(address: String, cap: String) -> void:
	_joining_name = cap
	var err: Error = net.join_address(address, cap)
	if err != OK:
		title("Could not set out for that address (%s)." % error_string(err))
		return
	var wait: Label = Label.new()
	wait.text = "Hailing the founder…"
	wait.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_show(wait)


func _on_welcomed(info: Dictionary, s: Session) -> void:
	_mine = s
	net.bind(s)
	if info.get("sailed", false):
		_sea(s, true)
	else:
		_harbour(info)


func _harbour(info: Dictionary) -> void:
	var h: HarbourLobby = HarbourLobby.new()
	h.net = net
	h.info = info
	h.set_sail.connect(func() -> void: net.set_sail())
	h.leave.connect(func() -> void:
		net.leave()
		title(""))
	_show(h)


func _on_sailing() -> void:
	if net.hosting:
		_sea(net.charter.session_for(net.key), true)
	elif _mine != null:
		_sea(_mine, true)


func _sea(s: Session, crewed: bool) -> void:
	var sea: Sea = Sea.new()
	sea.session = s
	sea.net = net if crewed else null
	sea.left.connect(func() -> void:
		s.persist()
		if crewed:
			net.leave()
		title(""))
	_show(sea)
