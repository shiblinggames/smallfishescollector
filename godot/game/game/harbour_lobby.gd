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
var _foot: HBoxContainer
## Escape asked once: the next Escape (or the button) leaves.
var _asking: bool = false


## THE CHARTER CARD (M13, 2026-10-09): the same sea-dyed paper sheet the title
## screen shows the Charters on, so the hand-off from the title to the harbor
## keeps its look. Escape is Leave (it asks once).
func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = UiTheme.make()
	var bg: TextureRect = TextureRect.new()
	bg.texture = Skipper.tex("welcome-harbour-open.webp")
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	# The title screen's veil: the harbour stays a harbour.
	Kit.wash(self, [[Color(0.02, 0.04, 0.06, 0.25), 0.0], [Color(0.02, 0.04, 0.06, 0.45), 0.5], [Color(0.02, 0.035, 0.05, 0.75), 1.0]])
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var card: Pane = Kit.pane(center, { "radius": 16, "fill": [Kit.PAPER.lerp(Title.SEA_DYE, 0.16)], "border": [1, Color(Kit.PAPER_INK, 0.35)], "shadow": [Color(0, 0, 0, 0.45), 26, Vector2(0, 10)], "pad": [26, 22, 26, 24], "paper": true })
	card.custom_minimum_size = Vector2(580, 0)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	card.add_child(v)
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 14)
	v.add_child(head)
	var mark: Title.Emblem = Title.Emblem.new()
	mark.kind = "fleet"
	mark.custom_minimum_size = Vector2(58, 48)
	head.add_child(mark)
	var tv: VBoxContainer = VBoxContainer.new()
	tv.add_theme_constant_override("separation", 0)
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(tv)
	Kit.text(tv, "In harbor", "eyebrow", Kit.ink(Title.SEA_DYE))
	var nr: HBoxContainer = HBoxContainer.new()
	nr.add_theme_constant_override("separation", 10)
	tv.add_child(nr)
	Kit.text(nr, str(info.get("name", "The Charter")), "display_sm", Kit.PAPER_INK)
	if info.get("hardcore", false):
		Kit.chip(nr, "Hardcore", Paper.RED)
	Kit.text(v, "The crew gathers here before the Charter sails.", "note", Kit.PAPER_INK_SOFT, true)
	Paper.rule(v)
	_berths = VBoxContainer.new()
	_berths.add_theme_constant_override("separation", 6)
	v.add_child(_berths)
	if net.hosting:
		if SteamLayer.up:
			var inv: Button = Kit.button("Invite friends", "accent", "large", Title.SEA_DYE)
			inv.pressed.connect(net.invite)
			v.add_child(inv)
		else:
			Kit.text(v, "Crewmates join from their title screen at %s." % _address(), "small", Kit.PAPER_INK_SOFT, true)
		Kit.text(v, "Set Sail locks the crew for good: nobody joins afterwards. A crewmate who stops playing keeps their berth.", "note", Kit.PAPER_INK_SOFT, true)
		_sail = Kit.button("Set Sail", "primary")
		_sail.custom_minimum_size = Vector2(0, 50)
		_sail.pressed.connect(func() -> void: set_sail.emit())
		v.add_child(_sail)
	else:
		Kit.text(v, "Waiting for the founder to set sail.", "body", Kit.PAPER_INK_SOFT)
	_foot = HBoxContainer.new()
	_foot.alignment = BoxContainer.ALIGNMENT_END
	v.add_child(_foot)
	_leave_button()
	Motion.panel_in(card)
	net.roster_changed.connect(_show)
	_show(net.roster())


## Leave (quiet), or, once Escape has asked, the red "Leave the harbor?".
func _leave_button() -> void:
	for c: Node in _foot.get_children():
		_foot.remove_child(c)
		c.queue_free()
	var out: Button = Kit.button("Leave the harbor?" if _asking else "Leave", "danger" if _asking else "secondary", "small")
	out.tooltip_text = "Esc"
	out.pressed.connect(func() -> void: leave.emit())
	_foot.add_child(out)
	if _asking:
		out.grab_focus.call_deferred()


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed("fish_back"):
		return
	get_viewport().set_input_as_handled()
	if _asking:
		leave.emit()
		return
	_asking = true
	Sound.plip()
	_leave_button()


func _address() -> String:
	for a: String in IP.get_local_addresses():
		if a.count(".") == 3 and not a.begins_with("127.") and not a.begins_with("169.254"):
			return a
	return "127.0.0.1"


## The four berths, as the title's Charter cards list a crew: a name and where
## they are, in words.
func _show(list: Array) -> void:
	if not is_inside_tree():
		return
	for c: Node in _berths.get_children():
		_berths.remove_child(c)
		c.queue_free()
	_crew = 0
	for i: int in Charter.BERTHS:
		var filled: bool = i < list.size()
		var row: Pane = Kit.pane(_berths, { "radius": Kit.R_LARGE, "fill": [Kit.PAPER.lightened(0.05) if filled else Color(Kit.PAPER_INK, 0.04)], "border": [1, Color(Kit.PAPER_INK, 0.25 if filled else 0.14)], "pad": [14, 10, 14, 10], "paper": true })
		var h: HBoxContainer = HBoxContainer.new()
		h.add_theme_constant_override("separation", 10)
		row.add_child(h)
		if filled:
			var m: Dictionary = list[i]
			_crew += 1
			var n: Label = Kit.text(h, m["name"], "title", Kit.PAPER_INK)
			n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var where: String = "Founder" if m["founder"] else ("Aboard" if m["aboard"] else "Ashore")
			var st: Label = Kit.text(h, where, "label", Paper.GREEN if m["aboard"] else Paper.INK_FAINT)
			st.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		else:
			Kit.text(h, "Open berth", "body", Paper.INK_FAINT)
	if _sail != null:
		_sail.disabled = _crew < 2
		_sail.tooltip_text = "A Charter sails with at least two captains." if _crew < 2 else ""
