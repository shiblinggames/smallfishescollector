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
## Rejoin a remembered Charter (one this game sailed in as a crewmate, or
## founded and handed on).
signal rejoin(charter_id: String)

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
## What was typed in the Found and Join forms: a press that rebuilds the
## sheet (a mode, a colour) keeps them (the walkthrough: picking Hardcore or
## a colour wiped the Charter's name).
var _charter_draft: String = ""
var _addr_draft: String = ""
var _who_draft: String = ""
## Why the open form did not go (a join refused or unanswered, no port free),
## shown inside it.
var _form_note: String = ""
## A word on the Charters sheet (a berth released).
var _charter_note: String = ""
## A word on one remembered Charter's card (why a rejoin was refused).
var _card_notes: Dictionary = {}
## The remembered Charter asked once about forgetting.
var _forgetting: String = ""
var _note_label: Label = null
var _cols: HBoxContainer
var _first: Control = null


func _ready() -> void:
	# The store game: playtest captains and Charters set aside (Playtest).
	Playtest.sweep()
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
	var t: Label = Kit.lift(Kit.text(page, "Seas the Booty", "hero", Kit.SEA_INK))
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var sub: Label = Kit.lift(Kit.text(page, "Fish the open sea, alone or with your crew", "body_strong", Kit.SEA_INK))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if note != "":
		var n: Label = Kit.lift(Kit.text(page, note, "body_strong", Kit.SEA_GOLD, true))
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_note_label = n
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
	Kit.text(tv, eyebrow, "eyebrow", Kit.ink(SEA_DYE) if emblem == "fleet" else Paper.EYEBROW)
	Kit.text(tv, heading, "display_sm", Kit.PAPER_INK)
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
			Kit.text(info, "This save would not open.", "small", Paper.RED)
			continue
		Kit.text(info, c["name"], "title", Kit.PAPER_INK)
		var stats: HBoxContainer = HBoxContainer.new()
		stats.add_theme_constant_override("separation", 10)
		info.add_child(stats)
		Kit.text(stats, "Fishing Lv %d" % int(c["level"]), "value", Kit.PAPER_INK)
		Kit.text(stats, "%s ⟡" % Js.thousands(float(c["doubloons"])), "value", Paper.MONEY)
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
		# A test build takes a captain brought from the web (Playtest).
		if not Playtest.release():
			var imp: Button = Kit.button("Import a captain", "secondary", "small")
			imp.tooltip_text = "Open a captain's save file (a web captain sent to you for the playtest)"
			imp.pressed.connect(_pick_import)
			v.add_child(imp)
			if _import_note != "":
				var note: Label = Kit.text(v, _import_note, "small", Kit.INK_2)
				note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		return
	_creator(v, "New captain", "Set out", func(n: String) -> void: new_captain.emit(n, _color), func() -> void:
		_making = false
		_build())


var _import_note: String = ""


## The file picker for a captain's save; the captain is written in and listed.
func _pick_import() -> void:
	var fd: FileDialog = FileDialog.new()
	fd.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	fd.access = FileDialog.ACCESS_FILESYSTEM
	fd.filters = PackedStringArray(["*.json ; Captain save"])
	fd.use_native_dialog = true
	fd.title = "Import a captain"
	add_child(fd)
	fd.file_selected.connect(func(p: String) -> void:
		var r: Dictionary = Captains.import_file(p)
		_import_note = str(r["error"]) if r.has("error") else "%s is aboard." % r["name"]
		fd.queue_free()
		_build())
	fd.canceled.connect(fd.queue_free)
	fd.popup_centered_ratio(0.6)


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
	Kit.text(col, heading, "eyebrow", Paper.EYEBROW)
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
	# Just the captain in their boat, centred (Kong, 2026-10-16: the rod threw
	# the picture off centre), as the Charter's cards draw them.
	sk.position = Vector2(box_px.x * 0.6, box_px.y * 0.5) * SS
	sk.scale.x = -1.0
	vp.add_child(sk)
	var bare: Dictionary = look.duplicate()
	for k: String in ["rodSlug", "reel", "hook"]:
		bare.erase(k)
	sk.set_look(bare)
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
	var joined: Array = Charter.remembered()
	if list.is_empty() and joined.is_empty():
		Kit.text(v, "No Charters yet. Found one and your friends can join it.", "note", Kit.PAPER_INK_SOFT, true)
	for c: Dictionary in list:
		var card: Pane = Kit.pane(v, { "radius": 12, "fill": [Kit.PAPER.lerp(SEA_DYE, 0.1).lightened(0.04)], "border": [1, Color(Kit.ink(SEA_DYE), 0.45)], "shadow": [Color(0, 0, 0, 0.18), 8, Vector2(0, 3)], "pad": 12, "paper": true })
		var col: VBoxContainer = VBoxContainer.new()
		col.add_theme_constant_override("separation", 6)
		card.add_child(col)
		var top: HBoxContainer = HBoxContainer.new()
		top.add_theme_constant_override("separation", 8)
		col.add_child(top)
		Kit.text(top, c["name"], "title", Kit.PAPER_INK)
		Kit.chip(top, "Hardcore" if c["hardcore"] else "Normal", Paper.RED if c["hardcore"] else Kit.ink(SEA_DYE))
		if c["hardcore"] and c["sailed"]:
			var lv: int = int(c.get("lives", 0.0))
			Kit.text(top, "%d %s left" % [lv, "life" if lv == 1 else "lives"], "small", Paper.RED)
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
			# A fixed column: the confirm below a face never stretches it.
			m.custom_minimum_size = Vector2(88, 0)
			crew.add_child(m)
			m.add_child(_portrait(looks[i] if i < looks.size() else { "color": "default" }, Vector2(78, 60)))
			var nl: Label = Kit.text(m, names[i], "small", Kit.PAPER_INK)
			nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			# The founder can free a crewmate's berth (asks once).
			var keys: Array = c.get("keys", [])
			if c["founder"] == mine and i < keys.size() and keys[i] != mine:
				var tag: String = "%s|%s" % [c["id"], keys[i]]
				var asking: bool = _releasing == tag
				var rel: Button = Kit.button("For good?" if asking else "Release", "danger" if asking else "secondary", "small")
				rel.tooltip_text = "Free this berth. Their captain stays in the Charter's file but sails no more.%s" % (" A Charter that has sailed cannot fill it again." if c["sailed"] else "")
				rel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
				rel.pressed.connect(func() -> void:
					if _releasing != tag:
						_releasing = tag
						_build()
						return
					_releasing = ""
					var ch: Charter = Charter.open(c["id"])
					if ch != null:
						var why: String = ch.release(str(keys[i]))
						_charter_note = why if why != "" else "%s's berth is released. Their captain is kept in the Charter's file." % names[i]
						# Opened only to free the berth: let it go again.
						ch.close()
					_build())
				m.add_child(rel)
		# Released captains, faintly (they no longer vanish without a word).
		for rn: Variant in c.get("released", []):
			var rl: Label = Kit.text(crew, "%s  ·  released" % str(rn), "note", Color(Kit.PAPER_INK_SOFT, 0.6))
			rl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		# A sailed Charter's crew is fixed: no open berths it can never fill.
		for i: int in range(names.size(), 0 if c["sailed"] else Charter.BERTHS):
			var e: VBoxContainer = VBoxContainer.new()
			crew.add_child(e)
			var slot: Pane = Kit.pane(e, { "radius": 30, "fill": [Color(Kit.PAPER_INK, 0.05)], "border": [1, Color(Kit.PAPER_INK, 0.18)], "pad": 0, "paper": true })
			slot.custom_minimum_size = Vector2(60, 60)
			var el: Label = Kit.text(e, "Open berth", "note", Kit.PAPER_INK_SOFT)
			el.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		Kit.text(col, "At sea  ·  crew fixed at sailing" if c["sailed"] else "In harbor, the crew still gathering", "note", Kit.ink(SEA_DYE) if c["sailed"] else Paper.MONEY)
		if c["founder"] != mine:
			Kit.text(col, "Only its founder can host it.", "note", Kit.PAPER_INK_SOFT)
	# The Charters this game sailed in as a crewmate, beside the ones it founded.
	for m: Dictionary in joined:
		_remembered_card(v, m)
	if _charter_note != "":
		Kit.text(v, _charter_note, "note", Kit.PAPER_INK_SOFT, true)
	var acts: HBoxContainer = HBoxContainer.new()
	acts.add_theme_constant_override("separation", 8)
	v.add_child(acts)
	var fb: Button = Kit.button("+  Found a Charter", "accent" if _founding else "secondary", "large", SEA_DYE)
	fb.pressed.connect(func() -> void:
		_founding = not _founding
		_joining = false
		_form_note = ""
		_build())
	acts.add_child(fb)
	var jb: Button = Kit.button("Join a friend's", "accent" if _joining else "secondary", "large", SEA_DYE)
	jb.pressed.connect(func() -> void:
		_joining = not _joining
		_founding = false
		_form_note = ""
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
	var cname: LineEdit = _line(col, _charter_draft, "The Charter's name")
	cname.text_changed.connect(func(t: String) -> void: _charter_draft = t)
	_form_line(col)
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
	_creator(col, "Your Charter captain", "Found it", func(n: String) -> void:
		if cname.text.strip_edges() == "":
			cname.placeholder_text = "Name the Charter first"
			cname.grab_focus()
			return
		found.emit(cname.text.strip_edges(), _hardcore, n, _color), func() -> void:
		_founding = false
		_build())
	cname.grab_focus.call_deferred()


## A REMEMBERED CHARTER (Kong, 2026-10-11): "<Charter> · <Founder> hosts ·
## your captain <Name>", how it stands, Rejoin, and a small Forget (asks once).
func _remembered_card(v: VBoxContainer, m: Dictionary) -> void:
	var cid: String = str(m.get("id", ""))
	var cname: String = str(m.get("name", "A Charter"))
	var founder: String = str(m.get("founder", "the founder"))
	var cap: String = str(m.get("captain", ""))
	var card: Pane = Kit.pane(v, { "radius": 12, "fill": [Kit.PAPER.lerp(SEA_DYE, 0.1).lightened(0.04)], "border": [1, Color(Kit.ink(SEA_DYE), 0.45)], "shadow": [Color(0, 0, 0, 0.18), 8, Vector2(0, 3)], "pad": [10, 10, 12, 10], "paper": true })
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 14)
	card.add_child(h)
	var pic: Control = _portrait(Js.obj(m.get("look")) if not Js.obj(m.get("look")).is_empty() else { "color": "default" }, Vector2(96, 74))
	pic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(pic)
	var info: VBoxContainer = VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.alignment = BoxContainer.ALIGNMENT_CENTER
	info.add_theme_constant_override("separation", 2)
	h.add_child(info)
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	info.add_child(top)
	Kit.text(top, cname, "title", Kit.PAPER_INK)
	if m.get("hardcore", false) == true:
		Kit.chip(top, "Hardcore", Paper.RED)
	var handed: bool = m.get("handed", false) == true
	Kit.text(info, "%s hosts  ·  your captain %s" % [founder, cap] if cap != "" else "%s hosts" % founder, "small", Kit.PAPER_INK)
	# How it stands, in a word: handed on by this game, moved to a new
	# founder, or nobody answered the last hail.
	var state: String = ""
	var tone: Color = Kit.PAPER_INK_SOFT
	if handed:
		state = "Handed to %s" % founder
		tone = Kit.ink(SEA_DYE)
	elif m.get("moved", false) == true:
		state = "%s hosts it now" % founder
		tone = Kit.ink(SEA_DYE)
	elif m.get("waiting", false) == true:
		state = "Waiting for %s to host" % founder
		tone = Paper.MONEY
	if state != "":
		Kit.text(info, state, "body_strong", tone)
	Kit.text(info, "Last sailed %s" % _ago(int(Js.num(m.get("at")))), "note", Kit.PAPER_INK_SOFT)
	var why: String = str(_card_notes.get(cid, ""))
	if why != "":
		Kit.text(info, why, "small", Paper.RED, true)
	var btns: VBoxContainer = VBoxContainer.new()
	btns.alignment = BoxContainer.ALIGNMENT_CENTER
	btns.add_theme_constant_override("separation", 4)
	h.add_child(btns)
	var go: Button = Kit.button("Rejoin", "primary", "large")
	go.custom_minimum_size = Vector2(118, 42)
	var addr: String = str(m.get("addr", ""))
	if addr == "":
		go.disabled = true
		go.tooltip_text = "Join from their name in your Steam friends list when they host."
	else:
		go.tooltip_text = "Hail %s at %s" % [founder, addr]
	go.pressed.connect(func() -> void:
		_card_notes.erase(cid)
		rejoin.emit(cid))
	btns.add_child(go)
	if _first == null and not go.disabled:
		_first = go
	var asking: bool = _forgetting == cid
	var fg: Button = Kit.button("Forget it?" if asking else "Forget", "danger" if asking else "secondary", "small")
	fg.tooltip_text = "Take this card off your title. Your captain stays in the Charter on the founder's game."
	fg.pressed.connect(func() -> void:
		if _forgetting != cid:
			_forgetting = cid
			_build()
			return
		_forgetting = ""
		Charter.forget(cid)
		_build())
	btns.add_child(fg)


## A remembered Charter's card after a rejoin: why it was refused ("" for
## none; a rejoin nobody answered marks the card waiting instead).
func card_note(charter_id: String, why: String) -> void:
	if why == "":
		_card_notes.erase(charter_id)
	else:
		_card_notes[charter_id] = why
	_build()


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
	# The address and name are kept across a rebuild and a failed join; a new
	# form starts on the address last hailed (it always said 127.0.0.1).
	var last: String = Charter.last_address()
	var addr: LineEdit = _line(jr, _addr_draft if _addr_draft != "" else (last if last != "" else "127.0.0.1"), "The founder's address, with :port if the harbour shows one")
	var who: LineEdit = _line(jr, _who_draft if _who_draft != "" else SteamLayer.suggested_name(), "Your captain's name")
	who.text_changed.connect(func(t: String) -> void: _who_draft = t)
	# A berth this game already has at that address: no name to give (the
	# founder keeps the captain), so the field gives way to who sails.
	var known: Label = Kit.text(col, "", "small", Kit.ink(SEA_DYE), true)
	var show_known: Callable = func(t: String) -> void:
		var m: Dictionary = Charter.memory_at(t)
		who.visible = m.is_empty()
		known.visible = not m.is_empty()
		if not m.is_empty():
			known.text = "Rejoining %s as your captain %s." % [m.get("name", "the Charter"), m.get("captain", "")]
	addr.text_changed.connect(func(t: String) -> void:
		_addr_draft = t
		show_known.call(t))
	show_known.call(addr.text)
	var j: Button = Kit.button("Join", "primary", "large")
	j.custom_minimum_size = Vector2(100, 42)
	j.pressed.connect(func() -> void:
		_addr_draft = addr.text
		_who_draft = who.text
		var berth: bool = not Charter.memory_at(addr.text).is_empty()
		# A blank name is refused here (it came out as "crew_f9f08").
		if not berth and who.text.strip_edges() == "":
			_form_note = "Name your captain first."
			_build()
			return
		join.emit(addr.text.strip_edges(), "" if berth else who.text.strip_edges()))
	jr.add_child(j)
	Kit.text(col, "The founder's harbour shows their address, and its port when it is not the usual one (for example 192.168.1.39:24651).", "note", Kit.PAPER_INK_SOFT, true)
	_form_line(col)
	if _form_note == "Name your captain first.":
		who.grab_focus.call_deferred()


## Why the open form did not go, inside it.
func _form_line(col: VBoxContainer) -> void:
	if _form_note != "":
		Kit.text(col, _form_note, "body_strong", Paper.RED, true)


## The join form again after a failed join: the address that was tried, the
## name, and why, inside it.
func reopen_join(address: String, captain: String, why: String) -> void:
	_joining = true
	_founding = false
	_addr_draft = address
	_who_draft = captain
	_form_note = why
	_build()


## The found form again after its Charter could not open to the crew: as it
## was filled in, with why inside it (and not twice, at the top).
func reopen_found(charter_name: String, hardcore: bool, captain: String, color: String) -> void:
	_founding = true
	_joining = false
	_charter_draft = charter_name
	_hardcore = hardcore
	_name_draft = captain
	_color = color
	_form_note = note
	if _note_label != null:
		_note_label.visible = false
	_build()


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
