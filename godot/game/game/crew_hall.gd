class_name CrewHall
extends Control
## THE CREW HALL (Godot port, crew slice 1; the web's HallSheet and the
## Recruit and Roster rooms of CrewHub, on paper). Opened by mooring at the
## Crew Hall in the anchorage. One sheet: the rooms down the left (Recruit,
## Roster, The Hall), a grid of portrait cards, and the chosen hand on the
## right, painting first (Kong, 2026-09-24: "crew cards are art first").
##   RECRUIT  the free board (it reloads every few sea days); a card opens the
##            recruit, and Sign on takes them aboard, with a moment for it.
##   ROSTER   your crew, highest level first; the sheet names them (once) or
##            dismisses them.
##   THE HALL the building: its tier and painting, roster space, and the next
##            tier with its price and gate.
##   THE TRUNK every crew skin (Kong, 2026-10-03), by crew, the ones not found
##            yet in grey; skin vouchers (Bosun's, Captain's) opened here; a skin
##            owned is worn from here or from the roster card's skin row.
## Every change is Crew.*, through the rules (core/crew.gd).

signal closed

const RARITY_NAMES: Array = ["Common", "Rare", "Epic", "Legendary"]
## lib/crewGen RARITY_COLORS.
const RARITY_COLORS: Array = [Color("#8a857c"), Color("#3b8ef0"), Color("#a78bfa"), Color("#f0c040")]

var session: Session
var room: String = "recruit"
## Moored at the Crew Hall (the building's room is shown only there; from
## the expedition row it is the roster and the board).
var at_hall: bool = true
var _state: Dictionary = {}
var _skins: Dictionary = {}
var _pick: Dictionary = {}
var _pick_kind: String = ""
var _body: VBoxContainer
var _detail: VBoxContainer
var _tabs: HBoxContainer
var _head_note: Label
var _busy: bool = false


func _ready() -> void:
	# The expedition side's paper (Paper.night): dark, cream ink, brass.
	Paper.night = true
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.06, 0.5)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	add_child(shade)
	var sheet: Control = Control.new()
	sheet.anchor_left = 0.5
	sheet.anchor_right = 0.5
	sheet.anchor_bottom = 1.0
	sheet.offset_left = -560.0
	sheet.offset_right = 560.0
	sheet.offset_top = 40.0
	sheet.offset_bottom = -28.0
	add_child(sheet)
	Paper.sheet(sheet, 8.0)
	var margin: MarginContainer = MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, 32)
	margin.add_theme_constant_override("margin_top", 24)
	margin.add_theme_constant_override("margin_bottom", 22)
	sheet.add_child(margin)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)
	var head: HBoxContainer = HBoxContainer.new()
	col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 0)
	head.add_child(titles)
	Paper.text(titles, "The Crew Hall", "display", Paper.ink())
	_head_note = Paper.text(titles, "", "note", Paper.ink_soft())
	var x: Pane.PaneButton = Paper.button("Close  Esc")
	x.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	x.pressed.connect(close)
	head.add_child(x)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	col.add_child(_tabs)
	Paper.rule(col)
	var split: HBoxContainer = HBoxContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 24)
	col.add_child(split)
	_body = VBoxContainer.new()
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 10)
	split.add_child(_body)
	_detail = VBoxContainer.new()
	_detail.custom_minimum_size = Vector2(360, 0)
	_detail.add_theme_constant_override("separation", 6)
	split.add_child(_detail)
	sheet.modulate.a = 0.0
	create_tween().tween_property(sheet, "modulate:a", 1.0, 0.2)
	Paper.night = false
	_load()


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


func _load() -> void:
	var r: Variant = await session.act("getCrewState")
	var k: Variant = await session.act("skinsState")
	session.persist()
	if r is Dictionary:
		_state = r
	if k is Dictionary:
		_skins = k
	# A picked hand is redrawn from the fresh roster (its skin may have changed).
	if _pick_kind == "roster":
		for m: Dictionary in Js.list(_state.get("roster")):
			if m["id"] == _pick.get("id"):
				_pick = m
	_draw_room()


## A crew action: the new state, or its refusal as a toast; then redraw.
func _act(op: String, args: Array) -> Dictionary:
	if _busy:
		return {}
	_busy = true
	var r: Variant = await session.act(op, args)
	_busy = false
	session.persist()
	var res: Dictionary = r if r is Dictionary else {}
	if res.has("error"):
		_note(str(res["error"]))
	elif res.has("state"):
		_state = res["state"]
	return res


func _note(text: String) -> void:
	_head_note.text = text
	_head_note.add_theme_color_override("font_color", Paper.NIGHT_RED)
	var tw: Tween = create_tween()
	tw.tween_interval(2.6)
	tw.tween_callback(func() -> void:
		_head_note.remove_theme_color_override("font_color")
		_head_line())


func _head_line() -> void:
	var roster: Array = Js.list(_state.get("roster"))
	_head_note.text = "Your hall, your hands.  ·  Roster %d of %d" % [roster.size(), int(Js.num(_state.get("capacity")))]


# ── Rooms ──────────────────────────────────────────────────────────────────────

func _draw_room() -> void:
	Paper.night = true
	_build_room()
	Paper.night = false


func _build_room() -> void:
	_head_line()
	for c: Node in _tabs.get_children():
		c.queue_free()
	var board_open: int = Js.list(_state.get("board")).filter(func(b: Dictionary) -> bool: return b["recruited"] != true).size()
	if room == "hall" and not at_hall:
		room = "recruit"
	var rooms: Array = [["recruit", "Recruit%s" % ("  %d" % board_open if board_open > 0 else "")], ["roster", "Roster  %d" % Js.list(_state.get("roster")).size()]]
	if at_hall:
		rooms.append(["hall", "The Hall"])
	var waiting: int = 0
	for kv: Variant in Js.obj(_skins.get("vouchers")):
		waiting += int(Js.num(_skins["vouchers"][kv]))
	rooms.append(["trunk", "The Trunk  %d/%d%s" % [Js.list(_skins.get("owned")).size(), int(Js.num(_skins.get("total"))), ("  ·  %d to open" % waiting) if waiting > 0 else ""]])
	for o: Array in rooms:
		var b: Pane.PaneButton = Paper.button(o[1], o[0] == room or (o[0] == "trunk" and waiting > 0 and room != "trunk"))
		b.custom_minimum_size = Vector2(110, 34)
		b.pressed.connect(func() -> void:
			room = o[0]
			_pick = {}
			_pick_kind = ""
			_draw_room())
		_tabs.add_child(b)
	for c: Node in _body.get_children():
		c.queue_free()
	match room:
		"recruit":
			_recruit_room()
		"roster":
			_roster_room()
		"trunk":
			_trunk_room()
		_:
			_hall_room()
	_draw_detail()


func _recruit_room() -> void:
	var every: float = Js.num(Crew.port().get("boardEveryMs"))
	Paper.text(_body, "Hands looking for a ship. Sign on whoever you want aboard; %s." % ("new hopefuls come in at sunrise each sea day" if every > 0.0 else "the board fills again each day"), "note", Paper.ink_soft(), true)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	_body.add_child(grid)
	for c: Dictionary in Js.list(_state.get("board")):
		grid.add_child(_card(c, "board"))
	_notices_row()


## POST A NOTICE (port rules, core/crew.gd): the notices held, each with its
## odds in plain words and a button that posts a fresh board.
func _notices_row() -> void:
	var defs: Dictionary = Crew.notice_defs()
	if defs.is_empty():
		return
	Paper.rule(_body)
	Paper.text(_body, "Post a notice", "eyebrow", Paper.ink_soft())
	Paper.text(_body, "The board each sunrise is the Tavern Notice: mostly commons and rares, an Epic now and then, never a Legendary. A posted notice replaces the board standing with a fresh one at its own odds. Notices are found in treasure-hunt caskets and fishing crates.", "note", Paper.ink_soft(), true)
	var held: Dictionary = Js.obj(_state.get("notices"))
	for id: Variant in defs:
		var d: Dictionary = defs[id]
		var n: int = int(Js.num(held.get(id)))
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		_body.add_child(row)
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 0)
		row.add_child(v)
		Paper.text(v, "%s  ·  %d held" % [d["name"], n], "body_strong", Paper.ink() if n > 0 else Paper.ink_faint())
		Paper.text(v, str(d["blurb"]), "small", Paper.ink_soft(), true)
		var b: Pane.PaneButton = Paper.button("Post it", n > 0)
		b.disabled = n <= 0
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void:
			var r: Dictionary = await _act("postNotice", [id])
			if r.has("state"):
				Sound.chest(true)
				Rumble.buzz([0, 30, 30, 60])
				_pick = {}
				for c: Dictionary in Js.list(_state.get("board")):
					if float(c["rarity"]) >= 4.0:
						_sign_on_moment("A Legendary answers!", Color("#f0c040"))
			_draw_room())
		row.add_child(b)


func _roster_room() -> void:
	var roster: Array = Js.list(_state.get("roster"))
	if roster.is_empty():
		Paper.text(_body, "Nobody aboard yet. Sign someone on from the Recruit board.", "note", Paper.ink_soft(), true)
		return
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	scroll.add_child(grid)
	for c: Dictionary in roster:
		grid.add_child(_card(c, "roster"))


func _hall_room() -> void:
	var tier: int = int(Js.num(_state.get("hallTier")))
	var def: Dictionary = Crew.hall_def(tier)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	_body.add_child(row)
	var art: TextureRect = TextureRect.new()
	art.texture = Skipper.tex("crew/hall_%d.png" % tier)
	art.custom_minimum_size = Vector2(300, 240)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	row.add_child(art)
	var v: VBoxContainer = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 4)
	row.add_child(v)
	Paper.text(v, "Tier %d of 6" % tier, "eyebrow", Paper.ink_soft())
	Paper.text(v, str(def["name"]), "title", Color(def["accent"]))
	Paper.text(v, str(def["flavor"]), "note", Paper.ink_soft(), true)
	var cap: Dictionary = Rules.data()["crew"]["capacity"]
	Paper.stat(v, "Roster", "%d of %d" % [Js.list(_state.get("roster")).size(), int(Js.num(_state.get("capacity")))])
	Paper.stat(v, "From the hall", "+%d" % ((tier - 1) * int(cap["perHallTier"])))
	Paper.stat(v, "From your level (%d)" % int(Js.num(_state.get("navLevel"))), "+%d, one every %d levels" % [int(floor(Js.num(_state.get("navLevel")) / float(cap["perLevels"]))), int(cap["perLevels"])])
	Paper.stat(v, "Bunks", "%d (training comes next)" % int(def["bunks"]))
	Paper.rule(_body)
	var nxt: Dictionary = Crew.next_hall(tier)
	if nxt.is_empty():
		Paper.text(_body, "The hall is built as far as it goes.", "body_strong", Paper.ink())
		return
	Paper.text(_body, "Next: %s" % nxt["name"], "heading", Paper.ink())
	Paper.text(_body, str(nxt["flavor"]), "note", Paper.ink_soft(), true)
	var gate_name: String = "Fishing" if Crew.port().get("navFromFishing") == true else "Navigation"
	Paper.text(_body, "+%d roster, a bunk more  ·  needs %s %d  ·  %s ⟡" % [int(cap["perHallTier"]), gate_name, int(nxt["minNav"]), Js.thousands(float(nxt["cost"]))], "body_strong", Paper.ink())
	var ok: bool = Js.num(_state.get("navLevel")) >= float(nxt["minNav"]) and Js.num(_state.get("doubloons")) >= float(nxt["cost"])
	var b: Pane.PaneButton = Paper.button("Build the %s  ·  %s ⟡" % [nxt["name"], Js.thousands(float(nxt["cost"]))], true)
	b.disabled = not ok
	b.pressed.connect(func() -> void:
		var r: Dictionary = await _act("upgradeCrewHall", [])
		if r.has("state"):
			Sound.chest(true)
			Rumble.buzz([0, 40, 30, 60])
		_draw_room())
	_body.add_child(b)


# ── The Trunk ──────────────────────────────────────────────────────────────────

const TIER_NAMES: Dictionary = { "rare": "Rare", "epic": "Epic", "legendary": "Legendary", "chase": "Chase" }


static func tier_color(tier: String) -> Color:
	return SkinReveal.TIER_COLORS.get(tier, Color.WHITE)


func _trunk_room() -> void:
	var vrow: HBoxContainer = HBoxContainer.new()
	vrow.add_theme_constant_override("separation", 10)
	_body.add_child(vrow)
	for kind: String in Skins.KINDS:
		vrow.add_child(_voucher(kind))
	Paper.text(_body, "A legendary roll can land on a chase skin (a Legendary crew's animated one): about 1 in %d." % int(round(1.0 / maxf(0.01, Skins.chase_share()))), "small", Paper.ink_soft(), true)
	var owned: Array = Js.list(_skins.get("owned"))
	var eq: Dictionary = Js.obj(_skins.get("equipped"))
	var aboard: Array = Js.list(_skins.get("crewSlugs"))
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var list: VBoxContainer = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 6)
	scroll.add_child(list)
	# By crew: the Legendaries first, each crew's skins in a row.
	var slugs: Array = []
	for k: Dictionary in Skins.all():
		if not slugs.has(k["slug"]):
			slugs.append(k["slug"])
	slugs.sort_custom(func(a: String, b: String) -> bool:
		var ta: int = int(Skins.for_slug(a)[0].get("crewTier", 1))
		var tb: int = int(Skins.for_slug(b)[0].get("crewTier", 1))
		return ta > tb if ta != tb else a < b)
	for slug: String in slugs:
		var kins: Array = Skins.for_slug(slug)
		var got: int = kins.filter(func(k: Dictionary) -> bool: return owned.has(k["id"])).size()
		if slug != slugs[0]:
			var gap: Control = Control.new()
			gap.custom_minimum_size = Vector2(0, 6)
			list.add_child(gap)
		var head: Label = Paper.text(list, "%s  ·  %s crew  ·  %d of %d%s" % [Crew.display_name(slug, slug.capitalize()), RARITY_NAMES[int(kins[0].get("crewTier", 1))], got, kins.size(), "" if aboard.has(slug) else "  ·  not signed yet"], "body_strong", Paper.ink() if got > 0 else Paper.ink_soft())
		head.clip_text = true
		var row: HFlowContainer = HFlowContainer.new()
		row.add_theme_constant_override("h_separation", 8)
		row.add_theme_constant_override("v_separation", 8)
		list.add_child(row)
		for k: Dictionary in kins:
			row.add_child(_skin_tile(k, owned.has(k["id"]), eq.get(slug) == k["id"]))


## A kind of voucher: its painting, how many held, its odds in plain words,
## where it is found, and Open.
func _voucher(kind: String) -> Control:
	var d: Dictionary = Skins.kind_def(kind)
	var n: int = int(Js.num(Js.obj(_skins.get("vouchers")).get(kind)))
	var col: Color = Color(str(d.get("color", "#c0392b")))
	var p: Pane = Kit.pane(null, { "radius": 10, "fill": [Color("#1d1712")], "border": [2 if n > 0 else 1, Color(col, 0.8 if n > 0 else 0.3)], "shadow": [Color(col, 0.35 if n > 0 else 0.0), 14, Vector2.ZERO], "pad": [12, 10, 14, 10] })
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p.size_flags_stretch_ratio = 1.0
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	p.add_child(h)
	var art: TextureRect = TextureRect.new()
	art.texture = Skipper.tex(str(d.get("art", "")))
	art.custom_minimum_size = Vector2(56, 56)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	if n <= 0:
		art.modulate = Color(1, 1, 1, 0.4)
	h.add_child(art)
	var t: VBoxContainer = VBoxContainer.new()
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_theme_constant_override("separation", 0)
	h.add_child(t)
	Paper.text(t, "%d HELD" % n, "eyebrow", col.lightened(0.25) if n > 0 else Paper.ink_faint())
	Paper.text(t, str(d.get("name", kind)), "body_strong", Paper.ink() if n > 0 else Paper.ink_soft())
	var w: Dictionary = Js.obj(d.get("weights"))
	var odds: Array = []
	for tier: String in Skins.ROLLS:
		if float(w.get(tier, 0.0)) > 0.0:
			var pc: float = float(w[tier])
			odds.append("%s %s%%" % [TIER_NAMES[tier], str(int(pc)) if pc == floorf(pc) else str(pc)])
	Paper.text(t, ", ".join(PackedStringArray(odds)), "small", col.lightened(0.25), true)
	Paper.text(t, str(d.get("from", "")), "small", Paper.ink_soft(), true)
	var b: Pane.PaneButton = Paper.button("Open", n > 0)
	b.disabled = n <= 0
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	b.pressed.connect(func() -> void: _open_voucher(kind))
	h.add_child(b)
	if n > 0:
		# A slow breath, so a voucher waiting looks alive.
		var tw: Tween = p.create_tween().set_loops()
		tw.tween_property(p, "modulate", Color(1.12, 1.12, 1.12), 0.9).set_trans(Tween.TRANS_SINE)
		tw.tween_property(p, "modulate", Color.WHITE, 0.9).set_trans(Tween.TRANS_SINE)
	return p


func _open_voucher(kind: String) -> void:
	if _busy:
		return
	_busy = true
	var r: Variant = await session.act("openSkinVoucher", [kind])
	session.persist()
	_busy = false
	var res: Dictionary = r if r is Dictionary else {}
	if res.has("error"):
		_note(str(res["error"]))
		return
	if res.has("doubloons"):
		Sound.chest(false)
		_note("Every skin is already yours. The voucher pays %s ⟡." % Js.thousands(float(res["doubloons"])))
		_load()
		return
	var show: SkinReveal = SkinReveal.play(self, res)
	show.done.connect(func() -> void:
		_pick = res["skin"]
		_pick_kind = "skin"
		_load())


func _skin_tile(k: Dictionary, have: bool, worn: bool) -> Control:
	var tier: String = Skins.tier_of(k)
	var col: Color = tier_color(tier)
	var b: Button = Button.new()
	b.flat = true
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(108, 150)
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.add_theme_constant_override("separation", 1)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(v)
	var holder: Control = Control.new()
	holder.custom_minimum_size = Vector2(0, 118)
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(holder)
	if have:
		Paper.blot(holder, col, 0.7)
	var pic: TextureRect = TextureRect.new()
	pic.texture = _thumb(str(k["filename"]))
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not have:
		var m: ShaderMaterial = ShaderMaterial.new()
		m.shader = preload("res://game/fx/greyed.gdshader")
		m.set_shader_parameter("strength", 0.35)
		pic.material = m
	holder.add_child(pic)
	if have:
		ChaseFx.over(holder, k)
	if _pick_kind == "skin" and _pick.get("id") == k["id"]:
		var ring: Panel = Panel.new()
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = Color(0, 0, 0, 0)
		sb.border_color = Paper.red()
		sb.set_border_width_all(2)
		sb.set_corner_radius_all(10)
		ring.add_theme_stylebox_override("panel", sb)
		ring.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(ring)
	var n: Label = Paper.text(v, str(k["name"]), "small", Paper.ink() if have else Paper.ink_faint())
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	n.clip_text = true
	n.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var sub: Label = Paper.text(v, "Worn" if worn else TIER_NAMES[tier], "small", col.lightened(0.15) if have else Paper.ink_faint())
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.pressed.connect(func() -> void:
		_pick = k
		_pick_kind = "skin"
		Rumble.tap(8)
		_draw_room())
	return b


func _skin_detail() -> void:
	var k: Dictionary = _pick
	var tier: String = Skins.tier_of(k)
	var col: Color = tier_color(tier)
	var have: bool = Js.list(_skins.get("owned")).has(k["id"])
	var slug: String = str(k["slug"])
	var worn: bool = Js.obj(_skins.get("equipped")).get(slug) == k["id"]
	var aboard: bool = Js.list(_skins.get("crewSlugs")).has(slug)
	var crew_name: String = Crew.display_name(slug, slug.capitalize())
	var holder: Control = Control.new()
	holder.custom_minimum_size = Vector2(360, 300)
	_detail.add_child(holder)
	if have:
		Paper.blot(holder, col, 0.9)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex("card-arts/%s.webp" % str(k["filename"]).get_basename())
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if not have:
		var m: ShaderMaterial = ShaderMaterial.new()
		m.shader = preload("res://game/fx/greyed.gdshader")
		pic.material = m
	holder.add_child(pic)
	if have:
		ChaseFx.over(holder, k)
	Paper.text(_detail, "%s %s" % [k["name"], crew_name], "title", Paper.ink() if have else Paper.ink_soft())
	Paper.text(_detail, "%s skin" % TIER_NAMES[tier], "body_strong", col.lightened(0.15))
	Paper.text(_detail, str(k.get("blurb", "")), "note", Paper.ink_soft(), true)
	Paper.rule(_detail)
	if not have:
		Paper.text(_detail, "Not found yet. A skin voucher can open to it.", "note", Paper.ink_faint(), true)
	elif not aboard:
		Paper.text(_detail, "Yours. It waits in the Trunk for the day you sign a %s." % crew_name, "note", Paper.ink_soft(), true)
	else:
		var b: Pane.PaneButton = Paper.button("Take it off" if worn else "Put it on your %s" % crew_name, not worn)
		b.pressed.connect(func() -> void: _equip(slug, null if worn else k["id"]))
		_detail.add_child(b)
		Paper.text(_detail, "Every %s aboard wears it." % crew_name, "small", Paper.ink_faint())


func _equip(slug: String, id: Variant) -> void:
	if _busy:
		return
	_busy = true
	var r: Variant = await session.act("equipCrewSkin", [slug, id])
	session.persist()
	_busy = false
	if r is Dictionary and (r as Dictionary).has("error"):
		_note(str(r["error"]))
		return
	Sound.seal(false)
	Rumble.tap(12)
	_load()


## The skin a crew member wears ({} for the plain card).
func _worn(c: Dictionary) -> Dictionary:
	return Skins.by_id(Js.obj(_skins.get("equipped")).get(str(c.get("slug", ""))))


## On a roster card: the skins this crew owns, the plain one first; press
## one to wear it.
func _skin_row(c: Dictionary) -> void:
	var slug: String = str(c.get("slug", ""))
	var owned: Array = Js.list(_skins.get("owned"))
	var kins: Array = Skins.for_slug(slug).filter(func(k: Dictionary) -> bool: return owned.has(k["id"]))
	var all_n: int = Skins.for_slug(slug).size()
	if all_n == 0:
		return
	Paper.text(_detail, "Skins  ·  %d of %d" % [kins.size(), all_n], "eyebrow", Paper.ink_soft())
	if kins.is_empty():
		Paper.text(_detail, "None yet. Skin vouchers, found in crates and caskets, open to them.", "small", Paper.ink_faint(), true)
		return
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	_detail.add_child(row)
	var cur: Variant = Js.obj(_skins.get("equipped")).get(slug)
	var opts: Array = [{ "id": null, "filename": str(c.get("baseFilename", "")), "name": "Plain" }]
	opts.append_array(kins)
	for k: Dictionary in opts:
		var on: bool = k["id"] == cur
		var col: Color = tier_color(Skins.tier_of(k)) if k["id"] != null else Paper.ink_soft()
		var b: Button = Button.new()
		b.flat = true
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size = Vector2(54, 64)
		b.tooltip_text = str(k["name"])
		var pic: TextureRect = TextureRect.new()
		pic.texture = _thumb(str(k["filename"]))
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(pic)
		var ring: Panel = Panel.new()
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = Color(col, 0.12)
		sb.border_color = Paper.red() if on else Color(col, 0.45)
		sb.set_border_width_all(2 if on else 1)
		sb.set_corner_radius_all(8)
		ring.add_theme_stylebox_override("panel", sb)
		ring.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ring.show_behind_parent = true
		b.add_child(ring)
		if not on:
			var id: Variant = k["id"]
			b.pressed.connect(func() -> void: _equip(slug, id))
		row.add_child(b)


# ── Cards ──────────────────────────────────────────────────────────────────────

func _thumb(filename: String) -> Texture2D:
	return Skipper.tex("card_thumbs/%s.png" % filename.get_basename()) if filename != "" else null


## A portrait card: the painting on a pool of its rarity, the name, and its
## level, class and trait in a line under it.
func _card(c: Dictionary, kind: String) -> Control:
	var rar: int = clampi(int(Js.num(c.get("rarity"))), 1, 4)
	var rc: Color = RARITY_COLORS[rar - 1]
	var b: Button = Button.new()
	b.flat = true
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(150, 196) if kind == "roster" else Vector2(190, 236)
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.add_theme_constant_override("separation", 1)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(v)
	var holder: Control = Control.new()
	holder.custom_minimum_size = Vector2(0, b.custom_minimum_size.y - 64.0)
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(holder)
	Paper.blot(holder, rc, 0.75)
	var pic: TextureRect = TextureRect.new()
	pic.texture = _thumb(str(c.get("filename", "")))
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if kind == "board" and c.get("recruited") == true:
		pic.modulate = Color(1, 1, 1, 0.35)
	holder.add_child(pic)
	if kind == "roster":
		ChaseFx.over(holder, _worn(c))
	var on: bool = _pick.get("id") == c.get("id") and _pick_kind == kind
	if on:
		var ring: Panel = Panel.new()
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = Color(0, 0, 0, 0)
		sb.border_color = Paper.red()
		sb.set_border_width_all(2)
		sb.set_corner_radius_all(10)
		ring.add_theme_stylebox_override("panel", sb)
		ring.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(ring)
	var name_l: Label = Paper.text(v, str(c.get("name", "")), "name", Paper.ink())
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_l.clip_text = true
	var cls: Dictionary = Crew.class_of(str(c.get("slug", "")))
	var bits: Array = []
	# On the roster the rarity is the line's colour; the words are the level
	# and the class (a narrower card).
	if kind == "roster":
		bits.append("Lv %d" % Crew.level(Js.num(c.get("xp"))))
	else:
		bits.append(RARITY_NAMES[rar - 1])
	if not cls.is_empty():
		bits.append(str(cls["name"]))
	var sub: Label = Paper.text(v, "  ·  ".join(PackedStringArray(bits)) if not (kind == "board" and c.get("recruited") == true) else "Aboard", "small", rc.lightened(0.15))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.clip_text = true
	sub.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var tl: String = Crew.trait_label(Js.list(c.get("effects")))
	var tr: Label = Paper.text(v, tl if tl != "" else " ", "small", Paper.ink_soft())
	tr.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.pressed.connect(func() -> void:
		_pick = c
		_pick_kind = kind
		Rumble.tap(8)
		_draw_room())
	return b


# ── The chosen hand ────────────────────────────────────────────────────────────

func _draw_detail() -> void:
	for c: Node in _detail.get_children():
		c.queue_free()
	_detail.visible = room != "hall"
	if _pick.is_empty():
		Paper.text(_detail, "Press a skin to see it." if room == "trunk" else "Press a card to see the hand.", "note", Paper.ink_faint(), true)
		return
	if _pick_kind == "skin":
		_skin_detail()
		return
	var c: Dictionary = _pick
	var rar: int = clampi(int(Js.num(c.get("rarity"))), 1, 4)
	var rc: Color = RARITY_COLORS[rar - 1]
	var holder: Control = Control.new()
	holder.custom_minimum_size = Vector2(360, 250)
	_detail.add_child(holder)
	Paper.blot(holder, rc, 0.9)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex("card-arts/%s.webp" % str(c.get("filename", "")).get_basename())
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	holder.add_child(pic)
	if _pick_kind == "roster":
		ChaseFx.over(holder, _worn(c))
	Paper.text(_detail, str(c.get("name", "")), "title", Paper.ink())
	var cls: Dictionary = Crew.class_of(str(c.get("slug", "")))
	Paper.text(_detail, "%s%s" % [RARITY_NAMES[rar - 1], ("  ·  " + str(cls["name"])) if not cls.is_empty() else ""], "body_strong", rc.lightened(0.15))
	if _pick_kind == "roster":
		var lv: int = Crew.level(Js.num(c.get("xp")))
		Paper.text(_detail, "Level %d  ·  %s XP" % [lv, Js.thousands(Js.num(c.get("xp")))], "note", Paper.ink_soft())
	var stats: HBoxContainer = HBoxContainer.new()
	stats.add_theme_constant_override("separation", 18)
	_detail.add_child(stats)
	for s: Array in [["Power", "power"], ["Dodge", "dodge"], ["Fortune", "fortune"]]:
		var sv: VBoxContainer = VBoxContainer.new()
		sv.add_theme_constant_override("separation", 0)
		stats.add_child(sv)
		Paper.text(sv, s[0], "eyebrow", Paper.ink_soft())
		Paper.text(sv, str(int(Js.num(c.get(s[1])))), "heading", Paper.ink())
	var tl: String = Crew.trait_label(Js.list(c.get("effects")))
	if tl != "":
		var trip: String = ""
		for e: Variant in Js.list(c.get("effects")):
			if str(e).begins_with("s:"):
				var parts: PackedStringArray = str(e).substr(2).split(",")
				trip = "Power %+d, Dodge %+d, Fortune %+d" % [int(parts[0]), int(parts[1]), int(parts[2])]
		Paper.text(_detail, "Trait: %s  (%s)" % [tl, trip], "small", Paper.ink(), true)
	if not cls.is_empty():
		Paper.text(_detail, str(cls["blurb"]), "note", Paper.ink_soft(), true)
		var lvl: int = Crew.level(Js.num(c.get("xp"))) if _pick_kind == "roster" else 1
		var ms: Array = cls["milestones"]
		var now_m: Dictionary = {}
		for m: Dictionary in ms:
			if lvl >= int(m["unlockLevel"]):
				now_m = m
		if not now_m.is_empty():
			Paper.text(_detail, "Special: %s" % now_m["desc"], "small", cls_color(cls), true)
	Paper.rule(_detail)
	if _pick_kind == "board":
		if c.get("recruited") == true:
			Paper.text(_detail, "Already aboard.", "note", Paper.ink_soft())
		else:
			var sign: Pane.PaneButton = Paper.button("Sign on", true)
			sign.pressed.connect(func() -> void:
				var r: Dictionary = await _act("recruitCrew", [c["id"]])
				if r.has("state"):
					_sign_on_moment(str(c.get("name", "")), rc)
					_pick = {}
				_draw_room())
			_detail.add_child(sign)
	else:
		_skin_row(c)
		if c.get("nickname") == null:
			var row: HBoxContainer = HBoxContainer.new()
			row.add_theme_constant_override("separation", 6)
			_detail.add_child(row)
			var field: LineEdit = LineEdit.new()
			field.placeholder_text = "Give them a name (once)"
			field.max_length = 30
			field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var fsb: StyleBoxFlat = StyleBoxFlat.new()
			fsb.bg_color = Color(0.13, 0.105, 0.09)
			fsb.border_color = Color(Paper.NIGHT_INK, 0.35)
			fsb.set_border_width_all(1)
			fsb.set_corner_radius_all(6)
			fsb.content_margin_left = 10
			fsb.content_margin_right = 10
			for st: String in ["normal", "focus"]:
				field.add_theme_stylebox_override(st, fsb)
			field.add_theme_color_override("font_color", Paper.NIGHT_INK)
			field.add_theme_color_override("font_placeholder_color", Paper.NIGHT_INK_FAINT)
			row.add_child(field)
			var nb: Pane.PaneButton = Paper.button("Name")
			nb.pressed.connect(func() -> void:
				var r: Dictionary = await _act("renameCrew", [c["id"], field.text])
				if r.has("state"):
					for m: Dictionary in Js.list(_state.get("roster")):
						if m["id"] == c["id"]:
							_pick = m
				_draw_room())
			row.add_child(nb)
		var dis: Pane.PaneButton = Paper.button("Dismiss")
		dis.pressed.connect(func() -> void:
			if dis.get_meta("armed", false) != true:
				dis.set_meta("armed", true)
				dis.text = "Dismiss %s for good? Press again" % str(c.get("name", ""))
				return
			var r: Dictionary = await _act("dismissCrew", [c["id"]])
			if r.has("state"):
				_pick = {}
			_draw_room())
		_detail.add_child(dis)


static func cls_color(cls: Dictionary) -> Color:
	return Color(str(cls.get("color", "#555555"))).lightened(0.1)


## SIGNING ON IS A MOMENT (the web's SignOnMoment): the name blooms up in
## the middle in their rarity's colour with a ring breaking out behind it.
func _sign_on_moment(name: String, col: Color) -> void:
	Sound.chest(false)
	Rumble.buzz([0, 30, 40, 70])
	var layer: Control = Control.new()
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(layer)
	var t: Array = [0.0]
	layer.draw.connect(func() -> void:
		var c: Vector2 = layer.size / 2.0
		var u: float = clampf(t[0] / 1.7, 0.0, 1.0)
		var r: float = 40.0 + 260.0 * (1.0 - pow(1.0 - u, 3.0))
		layer.draw_arc(c, r, 0.0, TAU, 64, Color(col, (1.0 - u) * 0.8), 6.0 * (1.0 - u) + 1.0, true)
		layer.draw_circle(c, 120.0 * (1.0 - u * 0.4), Color(col, 0.15 * (1.0 - u))))
	var l: Label = Kit.text(layer, name if name.ends_with("!") else "%s is aboard!" % name, "display", Color(0.98, 0.95, 0.88))
	l.add_theme_font_size_override("font_size", 44)
	l.add_theme_color_override("font_shadow_color", Color(col.darkened(0.5), 0.9))
	l.add_theme_constant_override("shadow_outline_size", 14)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	l.offset_left = -400
	l.offset_right = 400
	l.offset_top = -30
	l.offset_bottom = 30
	l.pivot_offset = Vector2(400, 30)
	l.scale = Vector2(0.6, 0.6)
	var tw: Tween = layer.create_tween().set_parallel()
	tw.tween_method(func(v: float) -> void:
		t[0] = v
		layer.queue_redraw(), 0.0, 1.7, 1.7)
	tw.tween_property(l, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "modulate:a", 0.0, 0.4).set_delay(1.3)
	tw.chain().tween_callback(layer.queue_free)
