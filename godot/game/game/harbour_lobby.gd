class_name HarbourLobby
extends Control
## THE HARBOR LOBBY (Godot port, the Charter slice): a new Charter's crew
## gathering before it sails. Four berths, filled as friends join and make
## their Charter captains; the founder invites (the Steam overlay) or reads out
## this machine's address (on the local network), and presses SET SAIL, which
## locks the roster for good. A crewmate waits for that. Either can leave.

signal set_sail
signal leave

var net: CrewNet
var info: Dictionary = {}
var _berths: VBoxContainer
var _sail: Button
var _crew: int = 0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = UiTheme.make()
	var bg: TextureRect = TextureRect.new()
	bg.texture = Skipper.tex("welcome-harbour-open.webp")
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var scrim: ColorRect = ColorRect.new()
	scrim.color = Color(0.02, 0.035, 0.055, 0.66)
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(scrim)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var card: PanelContainer = Room.panel(center, Room.box(Color(0.04, 0.063, 0.086, 0.97), Color(0.37, 0.92, 0.83, 0.3), 18, 24))
	card.custom_minimum_size = Vector2(560, 0)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	card.add_child(v)
	Room.text(v, "IN HARBOR", 12, Color(0.75, 0.84, 0.89, 0.8))
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 10)
	v.add_child(top)
	Room.text(top, str(info.get("name", "The Charter")), 28, Color("#f4ecd8"), true)
	if info.get("hardcore", false):
		Room.chip(top, "HARDCORE", Color("#f87171"), Color(0.97, 0.44, 0.44, 0.1), Color(0.97, 0.44, 0.44, 0.35), 10).size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_berths = VBoxContainer.new()
	_berths.add_theme_constant_override("separation", 6)
	v.add_child(_berths)
	if net.hosting:
		if SteamLayer.up:
			var inv: Button = Room.tinted("Invite friends", Color("#5eead4"), 14, 40)
			inv.pressed.connect(net.invite)
			v.add_child(inv)
		else:
			Room.text(v, "Crewmates join from their title screen at %s." % _address(), 13, Color("#9fb4c2"), false, true).custom_minimum_size = Vector2(0, 0)
		Room.text(v, "Set Sail locks the crew for good: nobody joins afterwards. A crewmate who stops playing keeps their berth.", 12, Color("#9fb4c2"), false, true).custom_minimum_size = Vector2(0, 0)
		_sail = Button.new()
		_sail.text = "Set Sail"
		_sail.custom_minimum_size = Vector2(0, 50)
		_sail.pressed.connect(func() -> void: set_sail.emit())
		v.add_child(_sail)
	else:
		Room.text(v, "Waiting for the founder to set sail.", 14, Color("#9fb4c2"))
	var out: Button = Room.tinted("Leave", Color("#8a95a0"), 13, 36)
	out.pressed.connect(func() -> void: leave.emit())
	v.add_child(out)
	net.roster_changed.connect(_show)
	_show(net.roster())


func _address() -> String:
	for a: String in IP.get_local_addresses():
		if a.count(".") == 3 and not a.begins_with("127.") and not a.begins_with("169.254"):
			return a
	return "127.0.0.1"


func _show(list: Array) -> void:
	if not is_inside_tree():
		return
	for c: Node in _berths.get_children():
		c.queue_free()
	_crew = 0
	for i: int in Charter.BERTHS:
		var row: PanelContainer = Room.panel(_berths, Room.box(Color(0.06, 0.08, 0.1, 0.95), Color(1, 1, 1, 0.07), 12, 12))
		var h: HBoxContainer = HBoxContainer.new()
		h.add_theme_constant_override("separation", 10)
		row.add_child(h)
		if i < list.size():
			var m: Dictionary = list[i]
			_crew += 1
			Room.text(h, "●", 13, Color("#4ade80") if m["aboard"] else Color("#5a6570"))
			var n: Label = Room.text(h, m["name"], 17, Color("#f4ecd8"), true)
			n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			Room.text(h, "Founder" if m["founder"] else ("Aboard" if m["aboard"] else "Ashore"), 12, Color("#9fb4c2"))
		else:
			Room.text(h, "Open berth", 14, Color("#5a6570"))
	if _sail != null:
		_sail.disabled = _crew < 2
		_sail.tooltip_text = "A Charter sails with at least two captains." if _crew < 2 else ""
