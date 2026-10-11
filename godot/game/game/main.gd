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
## The address being hailed, until the founder welcomes us ("" otherwise).
var _join_addr: String = ""
## The remembered Charter being rejoined ("" for a plain join): a rejoin
## nobody answered marks its card "Waiting for <founder> to host".
var _rejoin_id: String = ""
## The Charter this game sails in as a crewmate (its memory is kept fresh).
var _joined_id: String = ""
## Each hail's number: a wait timer from an older hail does nothing.
var _join_n: int = 0

## CONNECTING AND COMING BACK (Kong, 2026-10-11): the hailing card, the
## founder-left card and the hardcore end card (game/charter_cards.gd).
const Cards = preload("res://game/charter_cards.gd")
## STARTING TOGETHER (Kong, 2026-10-11): the crewmate's look card, and the
## Charter's name rising on the water as it sails (game/charter_start.gd).
const Start = preload("res://game/charter_start.gd")
## How long a hail waits on an answer before saying nobody answered (it was
## ENet's own ~30 seconds on a dead address).
const JOIN_WAIT: float = 9.0


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
	_bind("ping", [KEY_G], [], -1, 0.0)
	GameSettings.apply()
	_fps_layer()
	SteamLayer.start()
	net = CrewNet.new()
	net.name = "CrewNet"
	add_child(net)
	net.welcomed.connect(_on_welcomed)
	net.sailing.connect(_on_sailing)
	# A join that fails (refused, or nobody answered) reopens the join form
	# with the address kept and the cause inside it.
	net.refused_by_founder.connect(func(why: String) -> void:
		if _join_addr != "":
			_join_failed(why, false)
		else:
			title(why))
	net.ended.connect(func(why: String) -> void: title(why))
	net.lost.connect(_on_lost)
	net.sunk.connect(_on_sunk)
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
	t.new_captain.connect(func(n: String, color: String) -> void: _sea(Captains.make(n, color), false))
	t.host.connect(func(id: String) -> void: host(id))
	t.found.connect(func(n: String, hardcore: bool, cap: String, color: String) -> void:
		var c: Charter = Charter.found(n, hardcore, SteamLayer.player_key(), cap, color)
		var cid: String = c.id()
		c.close()
		if not host(cid):
			# Not open to the crew: not founded either (the walkthrough: a taken
			# port still wrote the Charter). The form comes back as it was.
			Charter.unfound(cid)
			var again: Title = _screen as Title
			if again != null:
				again.reopen_found(n, hardcore, cap, color))
	t.join.connect(func(address: String, cap: String) -> void: join(address, cap))
	t.rejoin.connect(rejoin)
	_show(t)


## A join that did not take: the title, with the join form open on the address
## that was tried and the cause written inside it. A rejoin from a remembered
## card goes back to that card instead: nobody answered ("Waiting for Anna to
## host"), or why it was refused, on the card.
func _join_failed(why: String, no_answer: bool = true) -> void:
	var addr: String = _join_addr
	var rid: String = _rejoin_id
	_join_addr = ""
	_rejoin_id = ""
	_join_n += 1
	net.leave()
	title("")
	if rid != "":
		if no_answer:
			Charter.remember(rid, { "waiting": true })
			(_screen as Title).card_note(rid, "")
		else:
			(_screen as Title).card_note(rid, why)
		return
	(_screen as Title).reopen_join(addr, _joining_name, why)


## The founder opens their Charter: to the harbor while the crew gathers, or
## straight onto the sea once it has sailed. False if it could not open.
func host(id: String) -> bool:
	var c: Charter = Charter.open(id)
	if c == null:
		title("That Charter's file would not open.")
		return false
	var err: Error = net.host(c)
	if err != OK:
		var first: int = CrewNet.base_port()
		title("No port was free to host on (%d to %d): another game on this computer is already hosting a Charter. Close it, then try again." % [first, first + CrewNet.PORTS - 1] if err == ERR_ALREADY_IN_USE else "The Charter could not open to the crew.")
		return false
	if c.sailed():
		_sea(c.session_for(net.key), true)
	else:
		_harbour(net._info())
	return true


func join(address: String, cap: String) -> void:
	_joining_name = cap
	_join_addr = address.strip_edges()
	# A berth this game already has keeps its captain's name (the form hides
	# the field for one).
	var known: Dictionary = Charter.memory_of(_rejoin_id) if _rejoin_id != "" else Charter.memory_at(_join_addr)
	if cap.strip_edges() == "" and not known.is_empty():
		cap = str(known.get("captain", ""))
		_joining_name = cap
	# A blank name came out as a machine-made "crew_f9f08" (the walkthrough).
	if cap.strip_edges() == "":
		_join_failed("Name your captain first.", false)
		return
	var err: Error = net.join_address(address, cap)
	if err != OK:
		_join_failed("Could not find %s. An address looks like 192.168.1.39, or 192.168.1.39:%d with the port the founder's harbour shows." % [_join_addr if _join_addr != "" else "that address", CrewNet.base_port() + 1], false)
		return
	# THE HAILING CARD (it was a bare grey screen for 30 seconds): who is being
	# hailed, Cancel (Esc) back to the join form with the address kept.
	var card: Control = Cards.Hailing.new()
	card.set("address", _join_addr)
	if not known.is_empty():
		card.set("charter_name", str(known.get("name", "")))
		card.set("founder", str(known.get("founder", "")))
		card.set("captain", cap)
	card.connect("cancelled", func() -> void:
		var addr: String = _join_addr
		_join_addr = ""
		_rejoin_id = ""
		_join_n += 1
		net.leave()
		title("")
		(_screen as Title).reopen_join(addr, _joining_name, ""))
	_show(card)
	# Nobody answering is said in about nine seconds, not thirty.
	_join_n += 1
	var n: int = _join_n
	get_tree().create_timer(JOIN_WAIT).timeout.connect(func() -> void:
		if n == _join_n and _join_addr != "":
			_join_failed("No founder answered at %s. Check the address and that they are in their harbour." % _join_addr, true))


## Rejoin a remembered Charter (its card on the title, or the founder-left
## card): hail its last address as its captain.
func rejoin(charter_id: String) -> void:
	var m: Dictionary = Charter.memory_of(charter_id)
	if m.is_empty():
		title("")
		return
	_rejoin_id = charter_id
	join(str(m.get("addr", "")), str(m.get("captain", "")))


## The line to the founder went (a crewmate), or a hail did not take.
func _on_lost(why: String) -> void:
	if _join_addr != "":
		_join_failed(why, true)
		return
	# The Charter sank: the ending on the water (or its card) says it all.
	if not net.sunk_info.is_empty():
		return
	var info: Dictionary = net.end_info
	var kind: String = str(info.get("kind", ""))
	if kind in ["closed", "lost", "handed"]:
		_parted(info)
		return
	if kind == "yours":
		# Handed to this game: it is in the founder's list now.
		Charter.forget(str(info.get("id", "")))
	if _screen is Title:
		(_screen as Title).note = why
	else:
		title(why)


## THE FOUNDER LEFT CARD: who closed it (or lost touch, or handed it on),
## that your captain is safe, Rejoin and Back to port. The remembered card is
## updated first (waiting on the founder; a new founder after a handover).
func _parted(info: Dictionary) -> void:
	var cid: String = str(info.get("id", ""))
	_joined_id = ""
	if str(info.get("kind", "")) == "handed":
		var upd: Dictionary = { "founder": str(info.get("to", "")), "moved": true, "waiting": false, "at": Time.get_unix_time_from_system() }
		if str(info.get("to_addr", "")) != "":
			upd["addr"] = str(info["to_addr"])
		Charter.remember(cid, upd)
	else:
		Charter.remember(cid, { "waiting": true, "at": Time.get_unix_time_from_system() })
	var card: Control = Cards.Parted.new()
	card.set("info", info)
	card.set("can_rejoin", str(Charter.memory_of(cid).get("addr", "")) != "")
	card.connect("rejoin", func() -> void: rejoin(cid))
	card.connect("back", func() -> void: title(""))
	_show(card)


## A hardcore Charter sank: the ending on this captain's water, then the end
## card, or the card alone when no sea is up.
func _on_sunk(summary: Dictionary) -> void:
	_joined_id = ""
	if _screen is Sea:
		var sea: Sea = _screen
		Cards.sink_on_sea(sea, summary, func() -> void: sea.left.emit())
		return
	var e: Control = Cards.Ending.new()
	e.set("summary", summary)
	e.set("standalone", true)
	e.connect("back", func() -> void:
		net.leave()
		title(""))
	_show(e)


func _on_welcomed(info: Dictionary, s: Session) -> void:
	# A crewmate's game remembers the Charter: whose it is, where it was
	# hailed, and its captain here (the title's card, and Rejoin).
	var addr: String = _join_addr
	_join_addr = ""
	_rejoin_id = ""
	_join_n += 1
	_joined_id = str(info.get("id", ""))
	if not net.hosting:
		var mem: Dictionary = { "name": str(info.get("name", "")), "founder": str(info.get("founder", "")), "captain": s.captain_name(), "look": Skipper.look_of(s.profile()), "hardcore": info.get("hardcore", false) == true, "at": Time.get_unix_time_from_system(), "waiting": false, "moved": false, "handed": false }
		if addr != "":
			mem["addr"] = addr
		Charter.remember(_joined_id, mem)
	_mine = s
	net.bind(s)
	if info.get("sailed", false):
		_sea(s, true)
	elif info.get("fresh", false) and not net.hosting:
		_look(info, s)
	else:
		_harbour(info)


## THE CREWMATE'S LOOK (STARTING TOGETHER): a new berth's first step, the
## Found form's name-and-colour captain card, before the harbour. A known
## berth (a rejoin) never sees it.
func _look(info: Dictionary, s: Session) -> void:
	var card: Control = Start.LookCard.new()
	card.set("charter_name", str(info.get("name", "")))
	card.set("founder", str(info.get("founder", "")))
	card.set("captain", s.captain_name())
	card.connect("chosen", func(n: String, color: String) -> void:
		_send_look(n, color)
		_harbour(info))
	card.connect("leave", func() -> void:
		net.leave()
		title(""))
	_show(card)


## The look goes to the founder; this game's copy and its memory of the
## Charter take it at once (the founder's save follows).
func _send_look(n: String, color: String) -> void:
	net.set_look(n, color)
	if _mine != null:
		if n.strip_edges() != "":
			_mine.profile()["username"] = n.strip_edges()
		_mine.profile()["character_color"] = color
		if _joined_id != "":
			Charter.remember(_joined_id, { "captain": _mine.captain_name(), "look": Skipper.look_of(_mine.profile()) })


func _harbour(info: Dictionary) -> void:
	var h: HarbourLobby = HarbourLobby.new()
	h.net = net
	h.info = info
	h.set_sail.connect(func() -> void: net.cast_off())
	h.leave.connect(func() -> void:
		net.leave()
		title(""))
	_show(h)


func _on_sailing() -> void:
	# From the harbour (or a look card still open): the Charter's name rises
	# on the water as the sea fades in. A look not yet sent goes as it stands.
	var from_harbour: bool = _screen is HarbourLobby or _screen is Start.LookCard
	if _screen is Start.LookCard:
		var pick: Array = (_screen as Start.LookCard).current()
		_send_look(str(pick[0]), str(pick[1]))
	var cname: String = str(net.charter.data.get("name", "")) if net.hosting and net.charter != null else str(net.joined_info.get("name", ""))
	if net.hosting:
		_sea(net.charter.session_for(net.key), true)
	elif _mine != null:
		_sea(_mine, true)
	else:
		return
	if from_harbour and _screen is Sea:
		Start.sets_sail(_screen as Sea, cname)


func _sea(s: Session, crewed: bool) -> void:
	var sea: Sea = Sea.new()
	sea.session = s
	sea.net = net if crewed else null
	sea.menu_wanted.connect(_open_menu)
	sea.left.connect(func() -> void:
		s.persist()
		# When this crewmate last sailed it, and how their captain looks now.
		if crewed and not net.hosting and _joined_id != "" and net.sunk_info.is_empty():
			Charter.remember(_joined_id, { "captain": s.captain_name(), "look": Skipper.look_of(s.profile()), "at": Time.get_unix_time_from_system() })
		if crewed:
			net.leave()
		title(""))
	_show(sea)


# ── The Esc menu, the window, the frame counter (game/pause_menu.gd,
#    game/game_settings.gd) ──────────────────────────────────────────────────

var _menu_layer: CanvasLayer
var _fps: Label


## Esc with nothing else to close, out on the sea: the menu.
func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed("fish_back") or not (_screen is Sea):
		return
	get_viewport().set_input_as_handled()
	_open_menu()


## The Esc menu (Esc, or the settings button at the top right of the sea).
func _open_menu() -> void:
	if not (_screen is Sea):
		return
	if _menu_layer == null:
		_menu_layer = CanvasLayer.new()
		_menu_layer.layer = 90
		add_child(_menu_layer)
	if _menu_layer.get_child_count() > 0:
		return
	var sea: Sea = _screen
	var pm: PauseMenu = PauseMenu.new()
	pm.session = sea.session
	pm.captains_label = "Captains"
	if sea.net != null:
		# Leaving asks first, naming who it sends back to port (the founder's
		# leaving closes the Charter on everyone aboard).
		var others: Array = []
		for m: Dictionary in sea.net.last_roster:
			if m.get("aboard", false) and str(m.get("key", "")) != sea.net.key:
				others.append(str(m.get("name", "A crewmate")))
		if sea.net.hosting:
			pm.captains_label = "Close the Charter"
			if not others.is_empty():
				var back: String = "%s %s back to port." % [_names(others), "goes" if others.size() == 1 else "go"]
				pm.leave_ask = back
				pm.quit_ask = back
		else:
			pm.captains_label = "Leave the Charter"
			pm.leave_ask = "Your captain waits in the Charter. Rejoin when %s hosts." % sea.net.founder_name()
		# Quitting from here leaves the Charter properly (the crew hear why).
		var cnet: CrewNet = sea.net
		pm.on_quit = func() -> void:
			if sea.session.charter != null:
				sea.session.charter.flush()
			cnet.leave()
	pm.on_captains = func() -> void: sea.left.emit()
	_menu_layer.add_child(pm)


## "Ben", "Ben and Cal", "Ben, Cal and Dee".
static func _names(list: Array) -> String:
	if list.size() <= 1:
		return "".join(PackedStringArray(list))
	return "%s and %s" % [", ".join(PackedStringArray(list.slice(0, list.size() - 1))), list.back()]


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_WM_CLOSE_REQUEST:
			# Closing the window saves the captain at sea first.
			if _screen is Sea and (_screen as Sea).session != null:
				(_screen as Sea).session.persist()
				# A Charter's file goes out now (its writes are batched), and the
				# crew hear at once that the founder's game is closing.
				var cs: Sea = _screen
				if cs.session.charter != null:
					cs.session.charter.flush()
				if cs.net != null:
					cs.net.leave()
			# Anywhere else (the harbor, say), a Charter this game hosts still
			# writes its batched changes (a crewmate's new berth) before closing.
			if net != null and net.hosting and net.charter != null:
				net.charter.flush()
				net.leave()
		NOTIFICATION_APPLICATION_FOCUS_OUT:
			if bool(GameSettings.value("quiet_unfocused")):
				AudioServer.set_bus_mute(0, true)
		NOTIFICATION_APPLICATION_FOCUS_IN:
			# Only the sound: re-applying the display here un-maximised the window.
			GameSettings.apply_audio()


func _fps_layer() -> void:
	var l: CanvasLayer = CanvasLayer.new()
	l.layer = 95
	add_child(l)
	_fps = Label.new()
	_fps.position = Vector2(10, 6)
	_fps.add_theme_color_override("font_color", Color(1, 1, 1, 0.7))
	_fps.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	_fps.add_theme_constant_override("outline_size", 4)
	l.add_child(_fps)


func _process(_d: float) -> void:
	if _fps == null:
		return
	_fps.visible = bool(GameSettings.value("show_fps"))
	if _fps.visible:
		_fps.text = "%d fps" % Engine.get_frames_per_second()
