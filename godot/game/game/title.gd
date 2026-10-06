class_name Title
extends Control
## THE TITLE SCREEN (Godot port of desktop/src/CaptainSelect.tsx, with the
## Charters beside it; docs/systems/steam-port.md, "Captains and worlds").
## Redrawn 2026-10-01 (Kong: "hard to tell Charters apart from captains;
## everything can be more clear"): two sheets that do not look alike.
##
## Left, SAIL ALONE: plain parchment, one boat for its mark. Each solo captain
## as a card: their portrait on a wash of sea, name, level and purse, when they
## last sailed; Play (the wood) and a quiet Retire (asks once). A new captain is
## made in a card of its own: a name and one of the four starting colours (the
## web's first-visit setup), shown on a big portrait as you pick.
## Right, SAIL WITH FRIENDS: sea-dyed parchment, a little fleet for its mark.
## Each Charter with its crew's portraits in a row, whether it is hardcore,
## whether it has sailed, and Host (only its founder can). Found a Charter
## and Join a friend's fold open from their own buttons.

signal play(id: String)
signal new_captain(captain_name: String, color: String)
signal host(charter_id: String)
signal found(charter_name: String, hardcore: bool, captain_name: String, color: String)
signal join(address: String, captain_name: String)

const STARTING: Array = ["default", "gray", "blue", "pink"]
const SEA_DYE: Color = Color(0.36, 0.6, 0.58)

var note: String = ""
var _retiring: String = ""
## A berth the founder is asked once about releasing ("charter id|key").
var _releasing: String = ""
var _hardcore: bool = false
var _making: bool = false
var _founding: bool = false
var _joining: bool = false
var _color: String = "default"
var _name_draft: String = ""
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
	# The harbour stays a harbour: a light veil, deeper toward the bottom.
	Kit.wash(self, [[Color(0.02, 0.04, 0.06, 0.25), 0.0], [Color(0.02, 0.04, 0.06, 0.45), 0.5], [Color(0.02, 0.035, 0.05, 0.75), 1.0]])
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)
	# Settings and Quit in the corner; the build in the other.
	var corner: HBoxContainer = HBoxContainer.new()
	corner.add_theme_constant_override("separation", 8)
	corner.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	corner.offset_left = -260
	corner.offset_top = -58
	corner.offset_right = -20
	corner.offset_bottom = -18
	corner.alignment = BoxContainer.ALIGNMENT_END
	add_child(corner)
	var sb: Button = Kit.button("Settings", "secondary", "small")
	sb.pressed.connect(func() -> void:
		Sound.plip()
		add_child(SettingsSheet.new()))
	corner.add_child(sb)
	var qb: Button = Kit.button("Quit", "secondary", "small")
	qb.pressed.connect(func() -> void: get_tree().quit())
	corner.add_child(qb)
	var stamp: Label = Kit.text(self, GameSettings.build(), "note", Color(1, 1, 1, 0.45))
	stamp.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	stamp.offset_left = 20
	stamp.offset_top = -40
	stamp.offset_bottom = -18
	var center: CenterContainer = CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	var margin: MarginContainer = MarginContainer.new()
	margin.add_theme_constant_override("margin_top", 30)
	margin.add_theme_constant_override("margin_bottom", 36)
	center.add_child(margin)
	var page: VBoxContainer = VBoxContainer.new()
	page.custom_minimum_size = Vector2(minf(1180.0, get_viewport_rect().size.x - 48.0), 0)
	page.add_theme_constant_override("separation", 6)
	margin.add_child(page)
	var t: Label = Kit.lift(Kit.text(page, "Seas the Booty", "display", Kit.INK))
	t.add_theme_font_size_override("font_size", 52)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var sub: Label = Kit.text(page, "Fish the open sea, alone or with your crew", "body_strong", Color(0.96, 0.92, 0.84))
	sub.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.55))
	sub.add_theme_constant_override("shadow_offset_y", 2)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if note != "":
		var n: Label = Kit.lift(Kit.text(page, note, "body_strong", Color("#f8c28a"), true))
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var gap: Control = Control.new()
	gap.custom_minimum_size = Vector2(0, 14)
	page.add_child(gap)
	_cols = HBoxContainer.new()
	_cols.add_theme_constant_override("separation", 26)
	page.add_child(_cols)
	_build()


func _build() -> void:
	for c: Node in _cols.get_children():
		_cols.remove_child(c)
		c.queue_free()
	_first = null
	_captains(_sheet("Sail alone", "Your Captains", "Each captain sails their own sea, at their own pace.", Kit.PAPER, "one"))
	_charters(_sheet("Sail with friends", "Charters", "A shared world for 2 to 4 friends. Its captains live only there, and it sails while its founder hosts.", Kit.PAPER.lerp(SEA_DYE, 0.16), "fleet"))
	if _first != null:
		_first.grab_focus.call_deferred()


## A sheet: its eyebrow, its emblem, its title and what it is.
func _sheet(eyebrow: String, heading: String, blurb: String, tint: Color, emblem: String) -> VBoxContainer:
	var p: Pane = Kit.pane(_cols, { "radius": 16, "fill": [tint], "border": [1, Color(Kit.PAPER_INK, 0.35)], "shadow": [Color(0, 0, 0, 0.45), 26, Vector2(0, 10)], "pad": [26, 22, 26, 24], "paper": true })
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	p.add_child(v)
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 14)
	v.add_child(head)
	var mark: Emblem = Emblem.new()
	mark.kind = emblem
	mark.custom_minimum_size = Vector2(58, 48)
	head.add_child(mark)
	var tv: VBoxContainer = VBoxContainer.new()
	tv.add_theme_constant_override("separation", 0)
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(tv)
	Kit.text(tv, eyebrow, "eyebrow", Kit.ink(SEA_DYE) if emblem == "fleet" else Color(0.55, 0.3, 0.15))
	Kit.text(tv, heading, "title", Kit.PAPER_INK).add_theme_font_size_override("font_size", 28)
	Kit.text(v, blurb, "note", Kit.PAPER_INK_SOFT, true)
	Paper.rule(v)
	return v


# ── Solo captains ──────────────────────────────────────────────────────────────

func _captains(v: VBoxContainer) -> void:
	for id: String in Captains.list():
		var c: Dictionary = Captains.summary(id)
		var card: Pane = Kit.pane(v, { "radius": 12, "fill": [Kit.PAPER.lightened(0.05)], "border": [1, Color(Kit.PAPER_INK, 0.25)], "shadow": [Color(0, 0, 0, 0.18), 8, Vector2(0, 3)], "pad": [10, 10, 14, 10], "paper": true })
		var h: HBoxContainer = HBoxContainer.new()
		h.add_theme_constant_override("separation", 14)
		card.add_child(h)
		var pic: Control = _portrait(c.get("look", {}), Vector2(118, 92))
		pic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(pic)
		var info: VBoxContainer = VBoxContainer.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.alignment = BoxContainer.ALIGNMENT_CENTER
		info.add_theme_constant_override("separation", 2)
		h.add_child(info)
		if c.has("error"):
			Kit.text(info, id, "heading", Kit.PAPER_INK)
			Kit.text(info, "This save would not open.", "small", Color(0.66, 0.2, 0.15))
			continue
		Kit.text(info, c["name"], "heading", Kit.PAPER_INK).add_theme_font_size_override("font_size", 20)
		var stats: HBoxContainer = HBoxContainer.new()
		stats.add_theme_constant_override("separation", 10)
		info.add_child(stats)
		Kit.text(stats, "Fishing Lv %d" % int(c["level"]), "value", Kit.PAPER_INK)
		Kit.text(stats, "%s ⟡" % Js.thousands(float(c["doubloons"])), "value", Color(0.55, 0.38, 0.06))
		Kit.text(info, "Last sailed %s" % _ago(int(c["at"])), "note", Kit.PAPER_INK_SOFT)
		var btns: VBoxContainer = VBoxContainer.new()
		btns.alignment = BoxContainer.ALIGNMENT_CENTER
		btns.add_theme_constant_override("separation", 4)
		h.add_child(btns)
		var go: Button = Kit.button("Play", "primary", "large")
		go.custom_minimum_size = Vector2(118, 44)
		go.pressed.connect(func() -> void: play.emit(id))
		btns.add_child(go)
		if _first == null:
			_first = go
		var asking: bool = _retiring == id
		var ret: Button = Kit.button("Retire for good?" if asking else "Retire", "danger" if asking else "secondary", "small")
		ret.pressed.connect(func() -> void:
			if _retiring != id:
				_retiring = id
				_build()
				return
			_retiring = ""
			Captains.retire(id)
			_build())
		btns.add_child(ret)
	if not _making:
		var add: Button = Kit.button("+  New captain", "secondary", "large")
		add.pressed.connect(func() -> void:
			_making = true
			_build())
		v.add_child(add)
		if _first == null:
			_first = add
		return
	_creator(v, "New captain", "Set out", func(n: String) -> void: new_captain.emit(n, _color), func() -> void:
		_making = false
		_build())


## Name and colour, with the captain shown as you choose.
func _creator(v: VBoxContainer, heading: String, go_label: String, on_go: Callable, on_cancel: Callable) -> LineEdit:
	var card: Pane = Kit.pane(v, { "radius": 12, "fill": [Kit.PAPER.lightened(0.05)], "border": [1, Color(Kit.PAPER_INK, 0.4)], "pad": 14, "paper": true })
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	card.add_child(row)
	var big: Control = _portrait({ "color": _color }, Vector2(170, 132))
	big.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(big)
	var col: VBoxContainer = VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 8)
	row.add_child(col)
	Kit.text(col, heading, "eyebrow", Color(0.55, 0.3, 0.15))
	var nm: LineEdit = _line(col, _name_draft if _name_draft != "" else SteamLayer.suggested_name(), "Your captain's name")
	nm.text_changed.connect(func(t: String) -> void: _name_draft = t)
	Kit.text(col, "Their colours", "label", Kit.PAPER_INK_SOFT)
	var sw: HBoxContainer = HBoxContainer.new()
	sw.add_theme_constant_override("separation", 6)
	col.add_child(sw)
	for id: String in STARTING:
		var name: String = id
		for cc: Dictionary in Rules.data()["characterColors"]:
			if cc["id"] == id:
				name = cc["name"]
		var t: Paper.Tile = Paper.Tile.new()
		t.on = id == _color
		t.label = name
		# Just the captain: a colour is a look, not a boat.
		t.art = Skipper.look_art(id)
		t.pigment = SEA_DYE
		t.custom_minimum_size = Vector2(78, 84)
		t.pressed.connect(func() -> void:
			_color = id
			_name_draft = nm.text
			_build())
		sw.add_child(t)
	Kit.text(col, "More colours are earned as you play.", "note", Kit.PAPER_INK_SOFT)
	var acts: HBoxContainer = HBoxContainer.new()
	acts.add_theme_constant_override("separation", 8)
	col.add_child(acts)
	var go: Button = Kit.button(go_label, "primary", "large")
	go.custom_minimum_size = Vector2(140, 44)
	go.pressed.connect(func() -> void: on_go.call(nm.text))
	acts.add_child(go)
	var back: Button = Kit.button("Cancel", "secondary", "small")
	back.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	back.pressed.connect(on_cancel)
	acts.add_child(back)
	nm.grab_focus.call_deferred()
	return nm


## The captain as they look on their boat, on a wash of sea. No water of
## their own (the reflection and the waterline are the sea's, not a card's).
func _portrait(look: Dictionary, box_px: Vector2) -> Control:
	var holder: Control = Control.new()
	holder.custom_minimum_size = box_px
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var wash: Control = Control.new()
	wash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	wash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(wash)
	Paper.blot(wash, SEA_DYE, 0.8)
	# Drawn at three times the size and shown shrunk (a big sheet drawn
	# straight down to a hundred pixels came out soft and grainy).
	const SS: float = 3.0
	var vp: SubViewport = SubViewport.new()
	vp.transparent_bg = true
	vp.size = Vector2i(box_px * SS)
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR
	holder.add_child(vp)
	var sk: Skipper = Skipper.new()
	sk.water = false
	sk.box_scale = box_px.y / 190.0 * SS
	# Set to the left, so the rod and the hook on its line hang inside.
	sk.position = Vector2(box_px.x * 0.4, box_px.y * 0.5) * SS
	sk.scale.x = -1.0
	vp.add_child(sk)
	sk.set_look(look)
	var pic: TextureRect = TextureRect.new()
	pic.texture = vp.get_texture()
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_SCALE
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(pic)
	return holder


func _ago(unix: int) -> String:
	var days: int = int((Time.get_unix_time_from_system() - unix) / 86400.0)
	if days <= 0:
		return "today"
	if days == 1:
		return "yesterday"
	if days < 30:
		return "%d days ago" % days
	return Time.get_datetime_string_from_unix_time(unix).left(10)


# ── Charters ───────────────────────────────────────────────────────────────────

func _charters(v: VBoxContainer) -> void:
	var mine: String = SteamLayer.player_key()
	var list: Array = Charter.list()
	if list.is_empty():
		Kit.text(v, "No Charters yet. Found one and your friends can join it.", "note", Kit.PAPER_INK_SOFT, true)
	for c: Dictionary in list:
		var card: Pane = Kit.pane(v, { "radius": 12, "fill": [Kit.PAPER.lerp(SEA_DYE, 0.1).lightened(0.04)], "border": [1, Color(Kit.ink(SEA_DYE), 0.45)], "shadow": [Color(0, 0, 0, 0.18), 8, Vector2(0, 3)], "pad": 12, "paper": true })
		var col: VBoxContainer = VBoxContainer.new()
		col.add_theme_constant_override("separation", 6)
		card.add_child(col)
		var top: HBoxContainer = HBoxContainer.new()
		top.add_theme_constant_override("separation", 8)
		col.add_child(top)
		Kit.text(top, c["name"], "heading", Kit.PAPER_INK).add_theme_font_size_override("font_size", 20)
		Kit.chip(top, "Hardcore" if c["hardcore"] else "Normal", Color(0.66, 0.2, 0.15) if c["hardcore"] else Kit.ink(SEA_DYE))
		if c["hardcore"] and c["sailed"]:
			var lv: int = int(c.get("lives", 0.0))
			Kit.text(top, "%d %s left" % [lv, "life" if lv == 1 else "lives"], "small", Color(0.66, 0.2, 0.15))
		var sp: Control = Control.new()
		sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		top.add_child(sp)
		var open: Button = Kit.button("Host", "primary", "large")
		open.custom_minimum_size = Vector2(110, 40)
		open.disabled = c["founder"] != mine
		open.tooltip_text = "" if c["founder"] == mine else "Only its founder can host it."
		open.pressed.connect(func() -> void: host.emit(c["id"]))
		top.add_child(open)
		var crew: HBoxContainer = HBoxContainer.new()
		crew.add_theme_constant_override("separation", 8)
		col.add_child(crew)
		var names: Array = c["crew"]
		var looks: Array = c.get("looks", [])
		for i: int in names.size():
			var m: VBoxContainer = VBoxContainer.new()
			m.add_theme_constant_override("separation", 0)
			crew.add_child(m)
			m.add_child(_portrait(looks[i] if i < looks.size() else { "color": "default" }, Vector2(78, 60)))
			var nl: Label = Kit.text(m, names[i], "small", Kit.PAPER_INK)
			nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			# The founder can free a crewmate's berth (asks once).
			var keys: Array = c.get("keys", [])
			if c["founder"] == mine and i < keys.size() and keys[i] != mine:
				var tag: String = "%s|%s" % [c["id"], keys[i]]
				var asking: bool = _releasing == tag
				var rel: Button = Kit.button("Release for good?" if asking else "Release", "danger" if asking else "secondary", "small")
				rel.tooltip_text = "Free this berth. Their captain stays in the Charter's file but sails no more.%s" % (" A Charter that has sailed cannot fill it again." if c["sailed"] else "")
				rel.pressed.connect(func() -> void:
					if _releasing != tag:
						_releasing = tag
						_build()
						return
					_releasing = ""
					var ch: Charter = Charter.open(c["id"])
					if ch != null:
						var why: String = ch.release(str(keys[i]))
						if why != "":
							note = why
					_build())
				m.add_child(rel)
		for i: int in range(names.size(), Charter.BERTHS):
			var e: VBoxContainer = VBoxContainer.new()
			crew.add_child(e)
			var slot: Pane = Kit.pane(e, { "radius": 30, "fill": [Color(Kit.PAPER_INK, 0.05)], "border": [1, Color(Kit.PAPER_INK, 0.18)], "pad": 0, "paper": true })
			slot.custom_minimum_size = Vector2(60, 60)
			var el: Label = Kit.text(e, "Open berth", "note", Kit.PAPER_INK_SOFT)
			el.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		Kit.text(col, "At sea" if c["sailed"] else "In harbor, the crew still gathering", "note", Kit.ink(SEA_DYE) if c["sailed"] else Color(0.55, 0.38, 0.06))
		if c["founder"] != mine:
			Kit.text(col, "Only its founder can host it.", "note", Kit.PAPER_INK_SOFT)
	var acts: HBoxContainer = HBoxContainer.new()
	acts.add_theme_constant_override("separation", 8)
	v.add_child(acts)
	var fb: Button = Kit.button("+  Found a Charter", "accent" if _founding else "secondary", "large", SEA_DYE)
	fb.pressed.connect(func() -> void:
		_founding = not _founding
		_joining = false
		_build())
	acts.add_child(fb)
	var jb: Button = Kit.button("Join a friend's", "accent" if _joining else "secondary", "large", SEA_DYE)
	jb.pressed.connect(func() -> void:
		_joining = not _joining
		_founding = false
		_build())
	acts.add_child(jb)
	if _founding:
		_found_form(v)
	if _joining:
		_join_form(v)


func _found_form(v: VBoxContainer) -> void:
	var card: Pane = Kit.pane(v, { "radius": 12, "fill": [Kit.PAPER.lerp(SEA_DYE, 0.08).lightened(0.05)], "border": [1, Color(Kit.PAPER_INK, 0.35)], "pad": 14, "paper": true })
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	card.add_child(col)
	Kit.text(col, "Found a Charter", "eyebrow", Kit.ink(SEA_DYE))
	var cname: LineEdit = _line(col, "", "The Charter's name")
	var modes: HBoxContainer = HBoxContainer.new()
	modes.add_theme_constant_override("separation", 6)
	col.add_child(modes)
	for m: Array in [[false, "Normal"], [true, "Hardcore"]]:
		var on: bool = _hardcore == m[0]
		var b: Button = Kit.button(m[1], "accent" if on else "secondary", "small", Color(0.75, 0.25, 0.2) if m[0] else SEA_DYE)
		b.pressed.connect(func() -> void:
			_hardcore = m[0]
			_build())
		modes.add_child(b)
	Kit.text(col, "Hardcore: the crew shares a pool of lives, one per captain and one spare. A sunk ship spends one. At none, the Charter is gone for good. Chosen now and never changed." if _hardcore else "Normal: sail as long as you like. Hardcore can only be chosen at founding.", "note", Kit.PAPER_INK_SOFT, true)
	var made: LineEdit = _creator(col, "Your Charter captain", "Found it", func(n: String) -> void:
		if cname.text.strip_edges() == "":
			cname.placeholder_text = "Name the Charter first"
			cname.grab_focus()
			return
		found.emit(cname.text.strip_edges(), _hardcore, n, _color), func() -> void:
		_founding = false
		_build())
	cname.grab_focus.call_deferred()
	if made != null:
		pass


func _join_form(v: VBoxContainer) -> void:
	var card: Pane = Kit.pane(v, { "radius": 12, "fill": [Kit.PAPER.lerp(SEA_DYE, 0.08).lightened(0.05)], "border": [1, Color(Kit.PAPER_INK, 0.35)], "pad": 14, "paper": true })
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	card.add_child(col)
	Kit.text(col, "Join a friend's Charter", "eyebrow", Kit.ink(SEA_DYE))
	if SteamLayer.up:
		Kit.text(col, "Accept your friend's invite in Steam, or choose Join Game on their name in your friends list.", "note", Kit.PAPER_INK_SOFT, true)
		return
	Kit.text(col, "Steam is not running, so Charters sail over this network. Enter the founder's address.", "note", Kit.PAPER_INK_SOFT, true)
	var jr: HBoxContainer = HBoxContainer.new()
	jr.add_theme_constant_override("separation", 8)
	col.add_child(jr)
	var addr: LineEdit = _line(jr, "127.0.0.1", "The founder's address")
	var who: LineEdit = _line(jr, SteamLayer.suggested_name(), "Your captain's name")
	var j: Button = Kit.button("Join", "primary", "large")
	j.custom_minimum_size = Vector2(100, 42)
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


## A sheet's mark, drawn in ink: one boat (alone) or three (a fleet).
class Emblem:
	extends Control

	var kind: String = "one"

	func _draw() -> void:
		var ink: Color = Kit.PAPER_INK
		var c: Vector2 = size / 2.0
		var boats: Array = [[Vector2(0, 0), 1.0]] if kind == "one" else [[Vector2(-15, 4), 0.7], [Vector2(15, 4), 0.7], [Vector2(0, -2), 0.85]]
		draw_circle(c, minf(size.x, size.y) / 2.0, Color(ink, 0.06))
		for b: Array in boats:
			var o: Vector2 = c + (b[0] as Vector2)
			var k: float = b[1]
			var hull: PackedVector2Array = PackedVector2Array([o + Vector2(-14, 6) * k, o + Vector2(14, 6) * k, o + Vector2(9, 13) * k, o + Vector2(-9, 13) * k])
			draw_colored_polygon(hull, Color(0.45, 0.28, 0.15))
			draw_line(o + Vector2(0, 6) * k, o + Vector2(0, -16) * k, ink, 1.5, true)
			draw_colored_polygon(PackedVector2Array([o + Vector2(1, -15) * k, o + Vector2(12, 3) * k, o + Vector2(1, 3) * k]), Color(0.93, 0.88, 0.76))
			draw_polyline(PackedVector2Array([o + Vector2(1, -15) * k, o + Vector2(12, 3) * k, o + Vector2(1, 3) * k, o + Vector2(1, -15) * k]), Color(ink, 0.6), 1.0, true)
		draw_arc(c + Vector2(0, 16), 22.0, 0.2, PI - 0.2, 16, Color(SEA_DYE.darkened(0.3), 0.6), 1.5, true)
