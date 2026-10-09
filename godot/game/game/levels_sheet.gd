class_name LevelsSheet
extends Control
## THE FISHING GUIDE (Kong, 2026-10-02: "the levels page should open from the
## level bar; it does not belong in the Locker"). A sheet of paper over the
## sea, opened by pressing the level bar: every level and what it brings, the
## skills alone, or the achievements (points, the colour track, every badge).
## Esc, the close button or a press outside it closes it.

signal closed

var session: Session
var _body: VBoxContainer
var _sheet: Control
var _parts: Dictionary = {}
var _views: HBoxContainer
var _status: Label


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE shell every sheet shares (Paper.open): the day's paper, a tall
	# narrow sheet, centred.
	_parts = Paper.open(self, Vector2(720, 1000), false, close, 30)
	_sheet = _parts["sheet"]
	var col: VBoxContainer = _parts["body"]
	# THE shared header: the title and its line, Close on the right, the views
	# as tabs on their own row, the rule; the feedback line under it.
	var head: Dictionary = Paper.header(col, "The Fishing Guide", "", close)
	Paper.text(head["titles"] as VBoxContainer, "What every level brings, and what you have earned.", "note", Paper.INK_SOFT)
	_views = head["tabs"]
	_views.visible = true
	_status = Paper.status_line(col)
	_body = VBoxContainer.new()
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 10)
	col.add_child(_body)
	_rebuild()


func _rebuild() -> void:
	for c: Node in _views.get_children():
		_views.remove_child(c)
		c.queue_free()
	for o: Array in [["levels", "Every level"], ["skills", "Skills"], ["renown", "Renown"], ["achievements", "Achievements"]]:
		var b: Pane.PaneButton = Paper.tab(o[1], o[0] == _levels_view, false)
		b.pressed.connect(func() -> void:
			if _levels_view == o[0]:
				return
			_levels_view = o[0]
			_levels_only_skills = o[0] == "skills"
			Paper.say(_status, "")
			_rebuild())
		_views.add_child(b)
	for c: Node in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	_build_levels()


func close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	Paper.close(self, _parts)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


# ── Levels ─────────────────────────────────────────────────────────────────────

var _levels_only_skills: bool = false
## "levels", "skills" or "achievements".
var _levels_view: String = "levels"


## THE FISHING GUIDE (Kong, 2026-10-02: "show these level unlocks somewhere,
## so players can see what's upcoming"): every level to 100 and what it
## brings, the way the level-up tells it. Levels passed are ticked; the next
## one is marked in red; the rest are in grey pencil. Or the skills alone.
func _build_levels() -> void:
	var lv: int = session.level()
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 6)
	_body.add_child(head)
	var ht: Label = Paper.text(head, "Fishing %d" % lv, "heading", Paper.INK)
	ht.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if _levels_view == "achievements":
		ht.text = "Achievements"
		_build_achievements()
		return
	if _levels_view == "renown":
		ht.text = "Renown"
		_build_renown()
		return
	Paper.text(_body, "Skills are free and yours for good. They save you time or show you more; catching is down to your gear." if _levels_only_skills else "Every level and what it brings. Gear unlocks are for sale at the shops from that level; skills, upgrades and gifts are free.", "note", Paper.INK_SOFT, true)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var list: VBoxContainer = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 8)
	scroll.add_child(list)
	var next_row: Control = null
	var rows: Array = []
	if _levels_only_skills:
		for s: Dictionary in Rules.skills():
			rows.append([int(s["level"]), [["Learned", "%s: %s" % [s["name"], s["text"]]]]])
	else:
		for n: int in range(2, 101):
			var lines: Array = LevelUp.level_lines(n)
			if not lines.is_empty():
				rows.append([n, lines])
	for r: Array in rows:
		var n: int = r[0]
		var done: bool = n <= lv
		var is_next: bool = not done and next_row == null
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		list.add_child(row)
		if is_next:
			next_row = row
		var num: Label = Paper.text(row, str(n), "heading", Paper.RED if is_next else (Paper.INK if done else Paper.INK_FAINT))
		num.custom_minimum_size = Vector2(40, 0)
		num.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		var col: VBoxContainer = VBoxContainer.new()
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		col.add_theme_constant_override("separation", 1)
		row.add_child(col)
		for l: Array in r[1]:
			var skill: bool = l[0] == "Learned"
			var ink: Color = LevelUp.SECTION_INK[l[0]] if (done or is_next) else Paper.INK_FAINT
			var t: Label = Paper.text(col, ("✓ " if done else "") + ("Skill · " if skill else "") + str(l[1]), "body_strong" if skill else "small", ink, true)
			if not done and not is_next:
				t.modulate.a = 0.75
		Paper.rule(list)
	if next_row != null:
		await get_tree().process_frame
		await get_tree().process_frame
		if is_instance_valid(scroll) and is_instance_valid(next_row):
			scroll.scroll_vertical = int(maxf(0.0, next_row.position.y - 120.0))


## RENOWN (core/renown.gd): past level 100, Fishing and Navigation each earn
## Renown points to spend on their own board; a respec token clears one.
func _build_renown() -> void:
	Paper.text(_body, "Past level 100, every skill keeps going: its XP earns Renown levels, each a point to spend on that skill's board. Points stay where you put them; a respec token clears one board.", "note", Paper.INK_SOFT, true)
	var tokens: HBoxContainer = HBoxContainer.new()
	tokens.add_theme_constant_override("separation", 10)
	_body.add_child(tokens)
	var tl: Label = Paper.text(tokens, "Respec tokens: %d" % int(Js.num(session.profile().get("renown_respecs"))), "small", Paper.INK_SOFT)
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var buy: Pane.PaneButton = Paper.button("Buy a token  ·  %s ⟡" % Js.thousands(Renown.RESPEC_COST))
	buy.disabled = Js.num(session.profile().get("doubloons")) < Renown.RESPEC_COST
	buy.pressed.connect(func() -> void: _renown_act("buyRenownRespec", []))
	tokens.add_child(buy)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var list: VBoxContainer = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 8)
	scroll.add_child(list)
	for skill: String in ["fishing", "nav"]:
		var st: Dictionary = RulesApi.run(session.store, session.uid, "renownState", [skill])
		var title: String = "Fishing" if skill == "fishing" else "Navigation"
		var h: HBoxContainer = HBoxContainer.new()
		list.add_child(h)
		var hl: Label = Paper.text(h, "%s Renown %d" % [title, int(st["level"])], "heading", Paper.INK)
		hl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		Paper.text(h, "%d to spend" % int(st["available"]) if int(st["available"]) > 0 else "", "body_strong", Paper.RED)
		if not st["reached"]:
			Paper.text(list, "Opens at %s 100." % title, "small", Paper.INK_FAINT)
		else:
			var pg: Array = st["progress"]
			Paper.text(list, "%s of %s XP to the next point." % [Js.thousands(float(pg[0])), Js.thousands(float(pg[1]))], "small", Paper.INK_SOFT)
		for s: Dictionary in Renown.STATS[skill]:
			var pts: float = Js.num(Js.obj(st["alloc"]).get(s["id"]))
			var row: HBoxContainer = HBoxContainer.new()
			row.add_theme_constant_override("separation", 10)
			list.add_child(row)
			var v: VBoxContainer = VBoxContainer.new()
			v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			v.add_theme_constant_override("separation", 0)
			row.add_child(v)
			Paper.text(v, "%s  ·  %d point%s" % [s["name"], int(pts), "" if int(pts) == 1 else "s"], "body_strong", Paper.INK)
			Paper.text(v, "%s  Now %s; each point %s." % [s["blurb"], Renown.total_text(s, pts), Renown.total_text(s, 1.0)], "small", Paper.INK_SOFT, true)
			var add: Pane.PaneButton = Paper.button("Spend a point")
			add.disabled = int(st["available"]) <= 0
			add.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			var sid: String = s["id"]
			add.pressed.connect(func() -> void: _renown_act("allocateRenown", [skill, sid]))
			row.add_child(add)
		if int(st["spent"]) > 0:
			var rs: Pane.PaneButton = Paper.button("Clear this board  ·  a token")
			rs.disabled = int(st["respecs"]) <= 0
			rs.size_flags_horizontal = Control.SIZE_SHRINK_END
			rs.pressed.connect(func() -> void: _renown_act("respecRenown", [skill]))
			list.add_child(rs)
		Paper.rule(list)


func _renown_act(op: String, args: Array) -> void:
	var r: Variant = await session.act(op, args)
	session.persist()
	_rebuild()
	if r is Dictionary and (r as Dictionary).has("error"):
		Sound.slack()
		Paper.say(_status, str(r["error"]), Paper.RED)
	else:
		Sound.plip()


## ACHIEVEMENTS (port rules): your points, the colours they unlock (the only
## way to a colour), and every badge the port can award, earned in ink and
## the rest in grey pencil.
func _build_achievements() -> void:
	var pts: float = Achievements.points(session.store, session.uid)
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 10)
	_body.add_child(top)
	var big: Label = Paper.text(top, "%d" % int(pts), "display", Paper.INK)
	big.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var tv: VBoxContainer = VBoxContainer.new()
	tv.add_theme_constant_override("separation", 0)
	tv.alignment = BoxContainer.ALIGNMENT_CENTER
	top.add_child(tv)
	Paper.text(tv, "achievement points", "label", Paper.INK_SOFT)
	var nx: Array = Achievements.next_color(pts)
	Paper.text(tv, ("Next colour at %d points" % int(nx[0])) if not nx.is_empty() else "Every colour earned", "note", Paper.INK_SOFT)
	Paper.text(_body, "Badges pay only in points (1 rookie to 5 grandmaster). Captain colours unlock with points and come from nowhere else.", "note", Paper.INK_SOFT, true)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var list: VBoxContainer = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 8)
	scroll.add_child(list)
	Paper.text(list, "Colours", "eyebrow", Paper.INK_SOFT)
	var cg: GridContainer = GridContainer.new()
	cg.columns = 6
	cg.add_theme_constant_override("h_separation", 6)
	cg.add_theme_constant_override("v_separation", 6)
	list.add_child(cg)
	var names: Dictionary = {}
	for cc: Dictionary in Rules.data()["characterColors"]:
		names[cc["id"]] = cc["name"]
	for m: Array in Achievements.colors():
		var t: Paper.Tile = Paper.Tile.new()
		t.label = str(names.get(m[1], m[1]))
		t.art = Skipper.look_art(m[1])
		t.corner = "%d" % int(m[0])
		t.grey = pts < float(m[0])
		t.custom_minimum_size = Vector2(84, 86)
		t.tooltip_text = "%s: %d points" % [t.label, int(m[0])]
		cg.add_child(t)
	var have: Array = Js.list(session.profile().get("unlocked_badges"))
	var defs: Array = Achievements.defs()
	var got: int = defs.filter(func(d: Dictionary) -> bool: return Js.includes(have, d["id"])).size()
	Paper.text(list, "Badges  ·  %d of %d" % [got, defs.size()], "eyebrow", Paper.INK_SOFT)
	var order: Array = ["rookie", "seasoned", "veteran", "master", "grandmaster"]
	defs.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var ea: bool = Js.includes(have, a["id"])
		var eb: bool = Js.includes(have, b["id"])
		if ea != eb:
			return ea
		return order.find(a["difficulty"]) < order.find(b["difficulty"]))
	var bg: GridContainer = GridContainer.new()
	bg.columns = 4
	bg.add_theme_constant_override("h_separation", 8)
	bg.add_theme_constant_override("v_separation", 8)
	list.add_child(bg)
	for d: Dictionary in defs:
		var t: Paper.Tile = Paper.Tile.new()
		t.label = d["name"]
		t.art = Skipper.tex(d["imageUrl"])
		t.corner = "+%d" % int(d["points"])
		t.grey = not Js.includes(have, d["id"])
		t.custom_minimum_size = Vector2(124, 116)
		t.tooltip_text = "%s (%s, %d point%s)" % [d["description"], str(d["difficulty"]).capitalize(), int(d["points"]), "" if int(d["points"]) == 1 else "s"]
		bg.add_child(t)
