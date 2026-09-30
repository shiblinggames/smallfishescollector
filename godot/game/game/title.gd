class_name Title
extends Control
## THE TITLE SCREEN (Godot port of desktop/src/CaptainSelect.tsx, with the
## Charters beside it; docs/systems/steam-port.md, "Captains and worlds").
##
## Left, YOUR CAPTAINS: each solo captain with their portrait, name, level,
## purse and when last played; Play, and Retire (asks once). A new captain is
## named here (the Steam name offered).
## Right, CHARTERS: the Charters this machine founded, each opened to its crew
## from here; Found a Charter (its name, normal or hardcore, fixed from then
## on, and your Charter captain's name); and joining a friend's (on Steam, by
## their invite or Join Game; on the local network, by the founder's address).

signal play(id: String)
signal new_captain(captain_name: String)
signal host(charter_id: String)
signal found(charter_name: String, hardcore: bool, captain_name: String)
signal join(address: String, captain_name: String)

const INK: Color = Color("#f4ecd8")
const SUB: Color = Color("#9fb4c2")
const TEAL: Color = Color("#5eead4")

var note: String = ""
var _retiring: String = ""
var _hardcore: bool = false
var _cols: HBoxContainer
var _first: Control = null


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
	scrim.color = Color(0.02, 0.035, 0.055, 0.72)
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(scrim)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)
	var center: CenterContainer = CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	var margin: MarginContainer = MarginContainer.new()
	margin.add_theme_constant_override("margin_top", 36)
	margin.add_theme_constant_override("margin_bottom", 36)
	center.add_child(margin)
	var page: VBoxContainer = VBoxContainer.new()
	page.custom_minimum_size = Vector2(minf(1120.0, get_viewport_rect().size.x - 48.0), 0)
	page.add_theme_constant_override("separation", 14)
	margin.add_child(page)
	var t: Label = Room.text(page, "Seas the Booty", 44, INK, true)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if note != "":
		var n: Label = Room.text(page, note, 15, Color("#f8c28a"), false, true)
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_cols = HBoxContainer.new()
	_cols.add_theme_constant_override("separation", 20)
	page.add_child(_cols)
	_build()


func _build() -> void:
	for c: Node in _cols.get_children():
		_cols.remove_child(c)
		c.queue_free()
	_first = null
	_captains(_column("Your Captains", "Each captain sails their own sea, alone."))
	_charters(_column("Charters", "A shared world for 2 to 4 friends. Its captains live only there, and it sails while its founder hosts."))
	if _first != null:
		_first.grab_focus.call_deferred()


func _column(heading: String, blurb: String) -> VBoxContainer:
	var p: PanelContainer = Room.panel(_cols, Room.box(Color(0.04, 0.063, 0.086, 0.96), Color(0.7, 0.84, 0.91, 0.22), 18, 20))
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	p.add_child(v)
	Room.text(v, heading, 24, INK, true)
	Room.text(v, blurb, 13, SUB, false, true).custom_minimum_size = Vector2(0, 0)
	return v


# ── Solo captains ──────────────────────────────────────────────────────────────

func _captains(v: VBoxContainer) -> void:
	for id: String in Captains.list():
		var c: Dictionary = Captains.summary(id)
		var card: PanelContainer = Room.panel(v, Room.box(Color(0.06, 0.08, 0.1, 0.95), Color(1, 1, 1, 0.08), 14, 12))
		var h: HBoxContainer = HBoxContainer.new()
		h.add_theme_constant_override("separation", 12)
		card.add_child(h)
		var portrait: SubViewportContainer = _portrait(c.get("look", {}))
		h.add_child(portrait)
		var info: VBoxContainer = VBoxContainer.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.alignment = BoxContainer.ALIGNMENT_CENTER
		info.add_theme_constant_override("separation", 2)
		h.add_child(info)
		if c.has("error"):
			Room.text(info, id, 15, INK, true)
			Room.text(info, "This save would not open.", 13, Color("#f87171"))
			continue
		Room.text(info, c["name"], 18, INK, true)
		Room.text(info, "Fishing Lv %d   ·   %s ⟡" % [int(c["level"]), Js.thousands(float(c["doubloons"]))], 13, Color("#e0b45a"))
		Room.text(info, "Last played %s" % Time.get_datetime_string_from_unix_time(int(c["at"]), true).left(16), 12, SUB)
		var btns: VBoxContainer = VBoxContainer.new()
		btns.alignment = BoxContainer.ALIGNMENT_CENTER
		h.add_child(btns)
		var go: Button = Button.new()
		go.text = "Play"
		go.custom_minimum_size = Vector2(110, 40)
		go.pressed.connect(func() -> void: play.emit(id))
		btns.add_child(go)
		if _first == null:
			_first = go
		var asking: bool = _retiring == id
		var ret: Button = Room.tinted("Retire for good?" if asking else "Retire", Color("#f87171") if asking else Color("#8a95a0"), 12, 30)
		ret.pressed.connect(func() -> void:
			if _retiring != id:
				_retiring = id
				_build()
				return
			_retiring = ""
			Captains.retire(id)
			_build())
		btns.add_child(ret)
	Room.heading(v, "New captain", Color(0.75, 0.83, 0.89, 0.6), 12)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	v.add_child(row)
	var nm: LineEdit = _line(row, SteamLayer.suggested_name(), "Your captain's name")
	var make: Button = Button.new()
	make.text = "Set out"
	make.custom_minimum_size = Vector2(120, 40)
	make.pressed.connect(func() -> void: new_captain.emit(nm.text))
	row.add_child(make)
	if _first == null:
		_first = nm


## The captain as they look on their boat, small.
func _portrait(look: Dictionary) -> SubViewportContainer:
	var box: SubViewportContainer = SubViewportContainer.new()
	box.custom_minimum_size = Vector2(96, 86)
	box.stretch = true
	var vp: SubViewport = SubViewport.new()
	vp.transparent_bg = true
	vp.size = Vector2i(96, 86)
	box.add_child(vp)
	var sk: Skipper = Skipper.new()
	sk.box_scale = 0.5
	sk.position = Vector2(52, 50)
	sk.scale.x = -1.0
	vp.add_child(sk)
	sk.set_look(look)
	return box


# ── Charters ───────────────────────────────────────────────────────────────────

func _charters(v: VBoxContainer) -> void:
	var mine: String = SteamLayer.player_key()
	for c: Dictionary in Charter.list():
		var card: PanelContainer = Room.panel(v, Room.box(Color(0.05, 0.09, 0.1, 0.95), Color(0.37, 0.92, 0.83, 0.25), 14, 12))
		var h: HBoxContainer = HBoxContainer.new()
		h.add_theme_constant_override("separation", 12)
		card.add_child(h)
		var info: VBoxContainer = VBoxContainer.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.add_theme_constant_override("separation", 2)
		h.add_child(info)
		var top: HBoxContainer = HBoxContainer.new()
		top.add_theme_constant_override("separation", 8)
		info.add_child(top)
		Room.text(top, c["name"], 18, INK, true)
		if c["hardcore"]:
			Room.chip(top, "HARDCORE", Color("#f87171"), Color(0.97, 0.44, 0.44, 0.1), Color(0.97, 0.44, 0.44, 0.35), 10)
		Room.text(info, "Crew: %s" % ", ".join(PackedStringArray(c["crew"])), 13, SUB, false, true).custom_minimum_size = Vector2(0, 0)
		Room.text(info, "At sea" if c["sailed"] else "Still in harbor, crew not yet set", 12, TEAL if c["sailed"] else Color("#e0b45a"))
		var open: Button = Button.new()
		open.text = "Host"
		open.custom_minimum_size = Vector2(110, 40)
		open.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		open.disabled = c["founder"] != mine
		open.tooltip_text = "" if c["founder"] == mine else "Only its founder can host it."
		open.pressed.connect(func() -> void: host.emit(c["id"]))
		h.add_child(open)

	Room.heading(v, "Found a Charter", Color(0.75, 0.83, 0.89, 0.6), 12)
	var cname: LineEdit = _line(v, "", "The Charter's name")
	var modes: HBoxContainer = HBoxContainer.new()
	modes.add_theme_constant_override("separation", 6)
	v.add_child(modes)
	for m: Array in [[false, "Normal"], [true, "Hardcore"]]:
		var on: bool = _hardcore == m[0]
		var b: Button = Room.tinted(m[1], (Color("#f87171") if m[0] else TEAL) if on else Color("#8a95a0"), 13, 32)
		b.pressed.connect(func() -> void:
			_hardcore = m[0]
			_build())
		modes.add_child(b)
	Room.text(v, "Hardcore: the crew shares a pool of lives, one per captain and one spare. A sunk ship spends one. At none, the Charter is gone for good. Chosen now and never changed." if _hardcore else "Normal: sail as long as you like. Hardcore can only be chosen at founding.", 12, SUB, false, true).custom_minimum_size = Vector2(0, 0)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	v.add_child(row)
	var cap: LineEdit = _line(row, SteamLayer.suggested_name(), "Your Charter captain's name")
	var go: Button = Button.new()
	go.text = "Found it"
	go.custom_minimum_size = Vector2(120, 40)
	go.pressed.connect(func() -> void:
		if cname.text.strip_edges() == "":
			cname.placeholder_text = "Name the Charter first"
			cname.grab_focus()
			return
		found.emit(cname.text.strip_edges(), _hardcore, cap.text))
	row.add_child(go)

	Room.heading(v, "Join a friend's Charter", Color(0.75, 0.83, 0.89, 0.6), 12)
	if SteamLayer.up:
		Room.text(v, "Accept your friend's invite in Steam, or choose Join Game on their name in your friends list.", 13, SUB, false, true).custom_minimum_size = Vector2(0, 0)
	else:
		Room.text(v, "Steam is not running, so Charters sail over this network. Enter the founder's address.", 13, SUB, false, true).custom_minimum_size = Vector2(0, 0)
		var jr: HBoxContainer = HBoxContainer.new()
		jr.add_theme_constant_override("separation", 8)
		v.add_child(jr)
		var addr: LineEdit = _line(jr, "127.0.0.1", "The founder's address")
		var who: LineEdit = _line(jr, SteamLayer.suggested_name(), "Your captain's name")
		var j: Button = Button.new()
		j.text = "Join"
		j.custom_minimum_size = Vector2(100, 40)
		j.pressed.connect(func() -> void: join.emit(addr.text.strip_edges(), who.text))
		jr.add_child(j)


func _line(parent: Control, value: String, hint: String) -> LineEdit:
	var l: LineEdit = LineEdit.new()
	l.text = value
	l.placeholder_text = hint
	l.max_length = 24
	l.custom_minimum_size = Vector2(0, 40)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(l)
	return l
