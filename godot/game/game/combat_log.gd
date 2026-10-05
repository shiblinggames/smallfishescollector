class_name CombatLog
extends Control
## THE COMBAT LOG (Godot over the web's LogBox, 2026-10-04; Kong: "an action
## log ... more robust since it's a desktop only game"; docked on the right
## edge, the recap on demand). Every event a fight plays is written here, from
## the one place the stage plays them (BattleStage._one), so nothing goes
## unlogged: shots and what they did, dodges, burns and freezes, statuses,
## heals, balls won and lost, bonds, combos, reactions, sinkings. Grouped by
## fight (a gauntlet's depth) and turn; scrollable through the whole raid or
## dive; sticks to the newest line unless the captain has scrolled up.
##   Names in their own colours (you gold, each crewmate theirs, enemies red),
##   damage bold, crits lit, statuses in their chip's colour; hovering a
##   status, a reaction or a combo says what it does.
##   No box: the lines sit on a soft fade into the edge, the panel as tall as
##   its lines; each line a mark in the actor's colour and the number in its
##   own column (gold for a crit, red on a captain, green for a heal); thin
##   turn rules; older lines settle back. One chip cycles the filter (All,
##   Mine, Crew, Enemies, Damage). L shows or hides it (kept).
##   RECAP (a button): per captain per fight, or the whole run: damage dealt,
##   taken, healing and shields given, crits, the best hit, dodges, assists.
## Only what happened: never an enemy's next move.

const W: float = 330.0
const H: float = 460.0
const ME: Color = Color("#f2d27a")
const MATES: Array = [Color("#7fc8ff"), Color("#c3a6ff"), Color("#8fe3a8"), Color("#ffb36b")]
const FOE: Color = Color("#ff8a78")
const SYS: Color = Color(0.72, 0.66, 0.57)
const INK: Color = Color(0.9, 0.86, 0.78)
const FILTERS: Array = [["all", "All"], ["me", "Mine"], ["crew", "Crew"], ["enemy", "Enemies"], ["dmg", "Damage"]]
## Lines this far back from the newest are dimmed.
const FRESH: int = 14

var stage: BattleStage
var entries: Array = []
## Per fight: { title, turns, stats: { seat: {...} } }.
var fights: Array = []
var _fight: int = -1
## The battle's own fight counter when this log's fight began.
var _bfight: int = -99
var _turn: int = 1
var _shown_fight: int = -2
var _shown_turn: int = -1
var _filter: String = "all"
## While an event the log already wrote is playing, the stage's caption for it
## is not written again (a boss's words and a check's lines still are).
var covering: bool = false
var _last_note: String = ""
var _open: bool = true
var _panel: Control
var _scroll: ScrollContainer
var _rows: VBoxContainer
var _chip: Button
var _tip: PanelContainer
var _tip_label: RichTextLabel
var _handle: Button
var _lines: Array = []
## The log in the deck: the last few lines (the stage seats it there).
var mini: VBoxContainer
var _mini_rows: VBoxContainer
const MINI: int = 4


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_open = bool(Prefs.get_value("combat_log_open", false))
	# No box: the lines sit on a soft dark fade that deepens toward the edge.
	_panel = Control.new()
	_panel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_panel.offset_left = -W - 10.0
	_panel.offset_right = 0.0
	_panel.offset_top = 86.0
	_panel.offset_bottom = 86.0 + 60.0
	add_child(_panel)
	var fade: TextureRect = TextureRect.new()
	var gt: GradientTexture2D = GradientTexture2D.new()
	var g: Gradient = Gradient.new()
	g.set_color(0, Color(0.03, 0.025, 0.02, 0.0))
	g.set_color(1, Color(0.03, 0.025, 0.02, 0.78))
	g.add_point(0.35, Color(0.03, 0.025, 0.02, 0.55))
	gt.gradient = g
	gt.width = 64
	gt.height = 4
	fade.texture = gt
	fade.stretch_mode = TextureRect.STRETCH_SCALE
	fade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	fade.offset_left = -60.0
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_panel.add_child(fade)
	var col: VBoxContainer = VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.offset_left = 16.0
	col.offset_right = -16.0
	col.offset_top = 6.0
	col.add_theme_constant_override("separation", 6)
	_panel.add_child(col)
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 2)
	col.add_child(head)
	var title: Label = Kit.text(head, "LOG", "small", SYS)
	title.add_theme_font_override("font", Kit.font("karla", 800))
	title.add_theme_font_size_override("font_size", 11)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_chip = _link_button("All", func() -> void: _next_filter())
	_chip.tooltip_text = "Which lines to show (click to change)"
	head.add_child(_chip)
	head.add_child(_link_button("Recap", func() -> void: _show_recap()))
	head.add_child(_link_button("Hide", func() -> void: toggle()))
	var rule: ColorRect = ColorRect.new()
	rule.color = Color(1, 1, 1, 0.07)
	rule.custom_minimum_size = Vector2(0, 1)
	col.add_child(rule)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(_scroll)
	_rows = VBoxContainer.new()
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rows.add_theme_constant_override("separation", 3)
	_scroll.add_child(_rows)
	_rows.resized.connect(_fit)
	# Hidden: a slim tab on the edge.
	_handle = _link_button("LOG  ·  L", func() -> void: toggle())
	_handle.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_handle.offset_left = -84.0
	_handle.offset_right = -12.0
	_handle.offset_top = 88.0
	_handle.offset_bottom = 112.0
	add_child(_handle)
	# A hover's explanation.
	_tip = PanelContainer.new()
	var tsb: StyleBoxFlat = StyleBoxFlat.new()
	tsb.bg_color = Color(0.05, 0.04, 0.035, 0.97)
	tsb.border_color = Color(1, 1, 1, 0.12)
	tsb.set_border_width_all(1)
	tsb.set_corner_radius_all(10)
	tsb.set_content_margin_all(10)
	_tip.add_theme_stylebox_override("panel", tsb)
	_tip.visible = false
	_tip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tip_label = RichTextLabel.new()
	_tip_label.bbcode_enabled = true
	_tip_label.fit_content = true
	_tip_label.custom_minimum_size = Vector2(250, 0)
	_tip_label.add_theme_font_override("normal_font", Kit.font("karla", 500))
	_tip_label.add_theme_font_override("bold_font", Kit.font("karla", 800))
	_tip_label.add_theme_font_size_override("normal_font_size", 12)
	_tip_label.add_theme_font_size_override("bold_font_size", 13)
	_tip_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tip.add_child(_tip_label)
	add_child(_tip)
	_build_mini()
	_apply_open()


## The deck's log: LOG, the last few lines, Full log (L) and Recap.
func _build_mini() -> void:
	mini = VBoxContainer.new()
	mini.add_theme_constant_override("separation", 4)
	mini.mouse_filter = Control.MOUSE_FILTER_PASS
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 2)
	mini.add_child(head)
	var title: Label = Kit.text(head, "LOG", "small", SYS)
	title.add_theme_font_override("font", Kit.font("karla", 800))
	title.add_theme_font_size_override("font_size", 10)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(_link_button("Recap", func() -> void: _show_recap()))
	var full: Button = _link_button("Full log  L", func() -> void: toggle())
	full.tooltip_text = "The whole log down the right edge"
	head.add_child(full)
	_mini_rows = VBoxContainer.new()
	_mini_rows.add_theme_constant_override("separation", 2)
	_mini_rows.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_mini_rows.clip_contents = true
	mini.add_child(_mini_rows)


func _mini_add(e: Dictionary) -> void:
	if _mini_rows == null:
		return
	_mini_rows.add_child(_row(e, 12))
	while _mini_rows.get_child_count() > MINI:
		var old: Node = _mini_rows.get_child(0)
		_mini_rows.remove_child(old)
		old.queue_free()
	# On the water with no panel: the older a line, the fainter.
	var n: int = _mini_rows.get_child_count()
	for i: int in n:
		(_mini_rows.get_child(i) as CanvasItem).modulate.a = lerpf(0.45, 1.0, float(i + 1) / float(n))


## A word that acts as a button (no box until hovered).
func _link_button(t: String, f: Callable) -> Button:
	var b: Button = Button.new()
	b.text = t
	b.flat = true
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", Kit.font("karla", 800))
	b.add_theme_font_size_override("font_size", 11)
	b.add_theme_color_override("font_color", SYS)
	b.add_theme_color_override("font_hover_color", INK)
	b.add_theme_color_override("font_pressed_color", INK)
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = Color(1, 1, 1, 0.0)
	s.set_corner_radius_all(6)
	s.content_margin_left = 7
	s.content_margin_right = 7
	s.content_margin_top = 2
	s.content_margin_bottom = 2
	b.add_theme_stylebox_override("normal", s)
	var sh: StyleBoxFlat = s.duplicate()
	sh.bg_color = Color(1, 1, 1, 0.08)
	b.add_theme_stylebox_override("hover", sh)
	b.add_theme_stylebox_override("pressed", sh)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.pressed.connect(f)
	return b


## The recap's buttons (boxed: it is a card of its own).
func _small_button(t: String, f: Callable) -> Button:
	var b: Button = _link_button(t, f)
	var s: StyleBoxFlat = (b.get_theme_stylebox("normal") as StyleBoxFlat).duplicate()
	s.bg_color = Color(1, 1, 1, 0.05)
	b.add_theme_stylebox_override("normal", s)
	return b


func _next_filter() -> void:
	var k: int = 0
	for i: int in FILTERS.size():
		if FILTERS[i][0] == _filter:
			k = i
	_filter = FILTERS[(k + 1) % FILTERS.size()][0]
	_chip.text = FILTERS[(k + 1) % FILTERS.size()][1]
	Sound.plip()
	_rebuild()


func toggle() -> void:
	_open = not _open
	Prefs.set_value("combat_log_open", _open)
	Sound.plip()
	_apply_open()


func _apply_open() -> void:
	_panel.visible = _open
	_handle.visible = false
	_tip.visible = false


func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventKey and ev.pressed and not ev.echo and (ev as InputEventKey).keycode == KEY_L:
		toggle()
		get_viewport().set_input_as_handled()


func _process(_d: float) -> void:
	if _tip.visible:
		var m: Vector2 = get_local_mouse_position()
		_tip.position = Vector2(clampf(m.x - _tip.size.x - 16.0, 8.0, size.x - _tip.size.x - 8.0), clampf(m.y + 14.0, 8.0, size.y - _tip.size.y - 8.0))


## As tall as its lines, up to H.
func _fit() -> void:
	var want: float = minf(H, 40.0 + _rows.size.y + 8.0)
	_panel.offset_bottom = _panel.offset_top + want


# ── Writing ──────────────────────────────────────────────────────────────────

## A new fight: its header, and a fresh tally.
func fight_begins(title: String) -> void:
	_bfight = int(Js.num(stage.b.get("fight")))
	_fight += 1
	_turn = 1
	fights.append({ "title": title, "turns": 1, "stats": {} })


## A line the stage said aloud (rewards, a boss's words): logged as told.
func note(text: String) -> void:
	if text.strip_edges() == "" or covering or text.begins_with("Fight ") or text.begins_with("Depth ") or text == _last_note:
		return
	_last_note = text
	_push("sys", false, "[color=#%s][i]%s[/i][/color]" % [SYS.to_html(false), _esc(text)])


## An event played: its line, and its count in the recap.
func add(x: Dictionary) -> void:
	# A new fight whenever the battle has moved on to one (raids and dives
	# alike), whatever told the stage.
	if fights.is_empty() or int(Js.num(stage.b.get("fight"))) != _bfight:
		fight_begins(_title())
	var t: String = str(x.get("t", ""))
	if t == "end":
		_turn += 1
		fights[_fight]["turns"] = _turn
		return
	if t in ["begin", "nextFight"]:
		return
	_tally(x)
	var r: Array = _fmt(x)
	covering = not r.is_empty() and t not in ["phase", "checkArm", "eSpecial", "bossAbility"]
	if r.is_empty():
		return
	var who_col: Color = FOE if r[0] == "enemy" else (_seat_color(int(x.get("seat", -1))) if int(x.get("seat", -1)) >= 0 and r[0] != "sys" else SYS)
	_push(r[0], r[1], _you(str(r[2])), who_col)


## Lines about this captain read in the second person: "You fire", "your
## rack", "at you".
func _you(bb: String) -> String:
	if not bb.contains("§ME§"):
		return bb
	var tag: String = "[color=#%s][b]" % ME.to_html(false)
	var lead: String = tag + "§ME§[/b][/color]"
	if bb.begins_with(lead + ":"):
		bb = tag + "You[/b][/color]" + bb.substr(lead.length())
	elif bb.begins_with(lead + "'s"):
		bb = tag + "Your[/b][/color]" + bb.substr(lead.length() + 2)
	elif bb.begins_with(lead + " "):
		var rest: String = bb.substr(lead.length() + 1)
		var sp: int = rest.find(" ")
		var verb: String = rest if sp < 0 else rest.substr(0, sp)
		bb = tag + "You[/b][/color] " + _base(verb) + ("" if sp < 0 else rest.substr(sp))
	return bb.replace("§ME§'s", "your").replace("§ME§", "you")


## A verb said of someone else, said of you ("fires" to "fire").
func _base(v: String) -> String:
	if v == "is":
		return "are"
	if v.ends_with("ies"):
		return v.substr(0, v.length() - 3) + "y"
	for e: String in ["shes", "ches", "xes", "zes", "sses"]:
		if v.ends_with(e):
			return v.substr(0, v.length() - 2)
	if v.ends_with("s") and not v.ends_with("ss"):
		return v.substr(0, v.length() - 1)
	return v


func _title() -> String:
	var b: Dictionary = stage.b
	if stage.gauntlet != "":
		return "Depth %d" % int(Js.num(b.get("depth")))
	return "Fight %d  ·  %s" % [int(b.get("fight", 0)) + 1, _foe_name(0, false)]


func _push(who: String, dmg: bool, bb: String, col: Color = SYS) -> void:
	var e: Dictionary = { "fight": _fight, "turn": _turn, "who": who, "dmg": dmg, "bb": bb, "col": col }
	entries.append(e)
	_mini_add(e)
	if _passes(e):
		var bar: VScrollBar = _scroll.get_v_scroll_bar()
		var at_end: bool = bar.value >= bar.max_value - bar.page - 12.0
		_write(e)
		if at_end:
			_stick.call_deferred()


func _stick() -> void:
	await get_tree().process_frame
	_scroll.scroll_vertical = int(_scroll.get_v_scroll_bar().max_value)


func _passes(e: Dictionary) -> bool:
	match _filter:
		"me": return e["who"] == "me"
		"crew": return e["who"] in ["me", "crew"]
		"enemy": return e["who"] == "enemy"
		"dmg": return e["dmg"]
	return true


func _write(e: Dictionary) -> void:
	if int(e["fight"]) != _shown_fight:
		_shown_fight = int(e["fight"])
		_shown_turn = -1
		var ft: String = str(fights[_shown_fight]["title"]) if _shown_fight >= 0 and _shown_fight < fights.size() else ""
		var hl: Label = Kit.text(_rows, ft.to_upper(), "small", Color(0.93, 0.84, 0.64))
		hl.add_theme_font_override("font", Kit.font("cinzel", 700))
		hl.add_theme_font_size_override("font_size", 12)
		if _rows.get_child_count() > 1:
			hl.custom_minimum_size = Vector2(0, 30)
			hl.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	if int(e["turn"]) != _shown_turn:
		_shown_turn = int(e["turn"])
		var tr: HBoxContainer = HBoxContainer.new()
		tr.add_theme_constant_override("separation", 8)
		tr.custom_minimum_size = Vector2(0, 16)
		_rows.add_child(tr)
		var tl: Label = Kit.text(tr, str(_shown_turn), "small", Color(0.6, 0.55, 0.48))
		tl.add_theme_font_override("font", Kit.font("karla", 800))
		tl.add_theme_font_size_override("font_size", 10)
		var hair: ColorRect = ColorRect.new()
		hair.color = Color(1, 1, 1, 0.06)
		hair.custom_minimum_size = Vector2(0, 1)
		hair.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hair.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		tr.add_child(hair)
	_rows.add_child(_row(e))
	_lines.append(_rows.get_child(_rows.get_child_count() - 1))
	# The older lines settle back.
	if _lines.size() > FRESH:
		var old: Control = _lines[_lines.size() - FRESH - 1]
		if is_instance_valid(old):
			old.modulate.a = 0.55


## One line: who acted (a mark in their colour), what happened, and the number
## in a column of its own (gold for a crit, red for a hit on a captain, green
## for a heal).
func _row(e: Dictionary, fs: int = 13) -> Control:
	var bb: String = str(e["bb"])
	var num: String = ""
	var ncol: Color = INK
	var m: RegExMatch = RegEx.create_from_string(":\\s\\[b\\](\\d+)\\[/b\\]((?:\\s\\s\\[color=#ffd36b\\]\\[b\\]CRIT\\[/b\\]\\[/color\\])?)").search(bb)
	if m != null and e["dmg"]:
		num = m.get_string(1)
		var crit: bool = m.get_string(2) != ""
		bb = bb.substr(0, m.get_start()) + bb.substr(m.get_end())
		ncol = Color("#ffd36b") if crit else (FOE if e["who"] == "enemy" else INK)
		if crit:
			num += "!"
	elif str(e["bb"]).contains(" back") or str(e["bb"]).contains("Tithe"):
		ncol = Color(0.5, 0.95, 0.6)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var pip: ColorRect = ColorRect.new()
	pip.color = Color(e["col"], 0.9 if e["who"] != "sys" else 0.3)
	pip.custom_minimum_size = Vector2(3, 0)
	row.add_child(pip)
	var rt: RichTextLabel = RichTextLabel.new()
	rt.bbcode_enabled = true
	rt.fit_content = true
	rt.scroll_active = false
	rt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rt.add_theme_font_override("normal_font", Kit.font("karla", 500))
	rt.add_theme_font_override("bold_font", Kit.font("karla", 800))
	rt.add_theme_font_override("italics_font", Kit.font("karla", 500))
	for k: String in ["normal_font_size", "bold_font_size", "italics_font_size"]:
		rt.add_theme_font_size_override(k, fs)
	rt.add_theme_color_override("default_color", INK)
	rt.meta_underlined = false
	rt.meta_hover_started.connect(_on_hover)
	rt.meta_hover_ended.connect(func(_m: Variant) -> void: _tip.visible = false)
	rt.text = bb
	row.add_child(rt)
	if num != "":
		var nl: Label = Kit.text(row, num, "body_strong", ncol)
		nl.add_theme_font_override("font", Kit.font("karla", 800))
		nl.add_theme_font_size_override("font_size", fs + 2)
		nl.custom_minimum_size = Vector2(38, 0)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.modulate.a = 0.0
	row.create_tween().tween_property(row, "modulate:a", 1.0, 0.2)
	return row


func _rebuild() -> void:
	for c: Node in _rows.get_children():
		c.queue_free()
	_lines.clear()
	_shown_fight = -2
	_shown_turn = -1
	for e: Dictionary in entries:
		if _passes(e):
			_write(e)
	for l: Control in _lines:
		l.modulate.a = 1.0
	for k: int in maxi(0, _lines.size() - FRESH):
		_lines[k].modulate.a = 0.55
	_stick.call_deferred()


# ── The words for each event ─────────────────────────────────────────────────

func _esc(s: String) -> String:
	return s.replace("[", "[lb]")


func _seat_color(i: int) -> Color:
	if i == stage.me:
		return ME
	var k: int = 0
	for j: int in i:
		if j != stage.me:
			k += 1
	return MATES[k % MATES.size()]


## A captain's name in their colour ("You" for this captain).
func _S(i: int) -> String:
	var seats: Array = stage.b.get("seats", [])
	if i < 0 or i >= seats.size():
		return "a ship"
	var n: String = "§ME§" if i == stage.me else str(seats[i].get("name", "A captain"))
	return "[color=#%s][b]%s[/b][/color]" % [_seat_color(i).to_html(false), _esc(n)]


func _foe_name(j: int, colored: bool = true) -> String:
	var fs: Array = Battle.foes(stage.b) if not stage.b.is_empty() else []
	var n: String = str(fs[clampi(j, 0, fs.size() - 1)].get("name", "the enemy")) if not fs.is_empty() else "the enemy"
	return "[color=#%s][b]%s[/b][/color]" % [FOE.to_html(false), _esc(n)] if colored else n


func _E(x: Dictionary) -> String:
	return _foe_name(int(x.get("foe", stage._cur)))


func _n(v: Variant) -> String:
	return "[b]%d[/b]" % int(Js.num(v))


## A hoverable name: a status, a reaction, a combo.
func _link(kind: String, id: String, label: String, col: Color) -> String:
	return "[url=%s:%s][color=#%s][b]%s[/b][/color][/url]" % [kind, id, col.to_html(false), _esc(label)]


func _status(id: String) -> String:
	var st: Array = Js.list(EnemyCard.STATUS.get(id))
	return _link("st", id, str(st[0]) if not st.is_empty() else id.capitalize(), FxSheet.status_color(id))


const ACT: Dictionary = { "fire": "fires", "volley": "volleys", "mega": "fires", "ultimate": "unleashes everything" }


## [who, is damage, text] or [] to leave it out (the stage already told it).
func _fmt(x: Dictionary) -> Array:
	var t: String = str(x["t"])
	var si: int = int(x.get("seat", -1))
	var mine: String = "me" if si == stage.me else "crew"
	match t:
		"shot":
			var act: String = str(x.get("action", "fire"))
			var what: String = ACT.get(act, "fires")
			if act == "mega":
				what = "fires the %s" % _esc(str(Armory.augment(str(x.get("mega", ""))).get("name", "Mega")))
			var aim: String = str(x.get("aim", "hit"))
			var tail: String = ""
			if x.get("dodged", false):
				tail = ": it slips aside"
			elif aim == "miss":
				tail = ": a miss"
			elif x.get("walled", false):
				tail = ": the wall takes it"
			elif x.get("eParried", false):
				tail = ": turned aside"
			else:
				tail = ": %s%s%s%s" % [_n(x.get("dmg")), "  [color=#ffd36b][b]CRIT[/b][/color]" if aim == "critical" else ("  graze" if aim == "graze" else ""),
					("  (%d into its barrier)" % int(Js.num(x["shielded"]))) if Js.num(x.get("shielded")) > 0.0 else "", "  (sunk)" if Js.num(x.get("enemyHp"), ) <= 0.0 and x.has("enemyHp") else ""]
			return [mine, true, "%s %s at %s%s" % [_S(si), what, _E(x), tail]]
		"eShot":
			var ti: int = int(x.get("target", -1))
			var who2: String = "%s %s at %s" % [_E(x), ACT.get(str(x.get("action", "fire")), "fires"), _S(ti)]
			if x.get("fog", false):
				return ["enemy", true, who2 + ": lost in the fog"]
			if x.get("dodged", false):
				return ["enemy", true, who2 + ": [b]dodged[/b]"]
			if x.get("parried", false):
				return ["enemy", true, who2 + ": parried"]
			return ["enemy", true, "%s: %s%s%s" % [who2, _n(x.get("dmg")), "  [color=#ffd36b][b]CRIT[/b][/color]" if x.get("crit", false) else "", "  (braced)" if x.get("braced", false) else ""]]
		"reload":
			return [mine, false, "%s reloads (+%d)" % [_S(si), 1 + int(Js.num(x.get("extra")))]]
		"brace":
			return [mine, false, "%s braces" % _S(si)]
		"repair":
			return [mine, false, "%s cracks open the %s: %s back" % [_S(si), _esc(str(x.get("name", "Repair Kit"))), _n(x.get("heal"))]]
		"ability":
			return [mine, false, "%s orders [b]%s[/b]" % [_S(si), _esc(str(x.get("name", "")))]]
		"drum":
			return [mine, false, "%s beats the %s%s" % [_S(si), _esc(str(x.get("name", "drum"))), ": an order is ready again" if x.has("refreshed") else ""]]
		"eReload":
			return ["enemy", false, "%s reloads" % _E(x)]
		"eDodge":
			return ["enemy", false, "%s heels away to dodge" % _E(x)]
		"eFrozen":
			return ["enemy", false, "%s is frozen solid and loses its turn" % _E(x)]
		"frozen":
			return [mine, false, "%s is frozen solid and loses the turn" % _S(si)]
		"burn":
			return [mine, true, "%s burns for %s" % [_S(si), _n(x.get("dmg"))]]
		"eBurn":
			return ["enemy", true, "%s burns for %s" % [_E(x), _n(x.get("dmg"))]]
		"ablaze":
			return ["enemy", false, "%s is set ablaze" % _S(si)]
		"iced":
			return ["enemy", false, "%s is iced over" % _S(si)]
		"eAblaze":
			return [mine, false, "%s sets %s ablaze (%s a turn)" % [_S(si), _E(x), _n(x.get("dmg"))]]
		"eIced":
			return [mine, false, "%s freezes %s" % [_S(si), _E(x)]]
		"eStatus":
			return [mine, false, "%s leaves %s %s" % [_S(si), _E(x), _status(str(x.get("status", "")))]]
		"rack":
			var ws: Array = Js.list(x.get("landed")).map(func(s0: Variant) -> String: return _status(str(s0)))
			return [mine, false, "%s leaves %s %s" % [_S(si), _E(x), ", ".join(PackedStringArray(ws))]] if not ws.is_empty() else []
		"leech":
			return [mine, false, "%s drinks %s back" % [_S(si), _n(x.get("heal"))]]
		"overkill":
			return [mine, false, "%s takes %s back from the overkill" % [_S(si), _n(x.get("heal"))]]
		"tithe":
			return [mine, false, "%s takes the Reaper's Tithe: %s" % [_S(si), _n(x.get("heal"))]]
		"eHeal":
			return ["enemy", false, "%s mends %s (%s)" % [_E(x), _n(x.get("heal")), _esc(str(x.get("why", "")))]]
		"loaded":
			return [mine, false, "%s gets a ball back" % _S(si)]
		"bite":
			return ["enemy", false, "%s tears a ball off %s's rack" % [_E(x), _S(si)]]
		"strip":
			return [mine, false, "%s spills %s's powder" % [_S(si), _E(x)]]
		"steal":
			return [mine, false, "%s press-gangs a ball off %s%s" % [_S(si), _E(x), "" if x.get("kept", false) else " (no room for it)"]]
		"refund":
			return [mine, false, "%s's crit costs no ball" % _S(si)]
		"seize":
			return [mine, false, "%s takes the weather gauge" % _S(si)]
		"streak":
			return [mine, false, "%s is on a streak of %d (+%d%%)" % [_S(si), int(Js.num(x.get("n"))), int(Js.num(x.get("pct")))]]
		"streakBroken":
			return [mine, false, "%s's streak is broken" % _S(si)]
		"crossfire":
			var ns: Array = Js.list(x.get("seats")).map(func(s1: Variant) -> String: return _S(int(s1)))
			return ["crew", false, "[color=#ffd36b][b]Crossfire[/b][/color] on %s: %s (x%.2f)" % [_E(x), ", ".join(PackedStringArray(ns)), Js.num(x.get("mult"))]]
		"counter":
			return [mine, true, "%s smashes the shot out of the air%s" % [_S(si), (": %s back" % _n(x.get("reflect"))) if Js.num(x.get("reflect")) > 0.0 else ""]]
		"reflect", "parry":
			if x.has("enemyHp"):
				return [mine, true, "%s: %s throws %s back at %s" % [_esc(str(x.get("name", "Parry"))), _S(si), _n(x.get("dmg")), _E(x)]]
			return ["enemy", true, "%s: %s hits %s for %s" % [_esc(str(x.get("name", "Riposte"))), _E(x), _S(si), _n(x.get("dmg"))]]
		"execute":
			var kn: String = { "execute": "Executioner", "coup": "Coup de Grace", "deathMark": "Death Mark" }.get(str(x.get("kind", "")), "a finishing blow")
			return [mine, true, "%s finishes %s ([b]%s[/b])" % [_S(si), _E(x), kn]]
		"sunkEnemy":
			return ["sys", false, "%s is sunk" % _E(x)]
		"sunk":
			return ["sys", false, "%s is holed below the waterline" % _S(si)]
		"cheat":
			return [mine, false, "%s holds on at %s" % [_S(si), _n(x.get("hp"))]]
		"phase":
			return ["enemy", false, "%s rises again" % _E(x)]
		"aegisHit":
			return [mine, false, "A plate of the wall cracks (%d of %d left)" % [int(Js.num(x.get("left"))), int(Js.num(x.get("of")))]]
		"aegisBreak":
			return [mine, false, "[b]%s[/b] breaks" % _esc(str(x.get("name", "The wall")))]
		"wardSurge":
			return ["enemy", false, "%s's ward saves it, and it surges" % _E(x)]
		"eSpecial":
			return ["enemy", false, "%s uses [b]%s[/b]" % [_E(x), _esc(str(x.get("name", "")))]]
		"bossAbility":
			return ["enemy", true, "%s unleashes [b]%s[/b]" % [_E(x), _esc(str(x.get("name", "")))]]
		"grip":
			return [mine, true, "%s's Kraken's Grip crushes %s for %s" % [_S(si), _E(x), _n(x.get("crush"))]]
		"coil":
			return [mine, false, "%s coils round %s (%d of %d)" % [_S(si), _E(x), int(Js.num(x.get("coils"))), int(Js.num(x.get("of")))]]
		"thermal":
			return [mine, true, "%s: Thermal Shock on %s for %s" % [_S(si), _E(x), _n(x.get("dmg"))]]
		"fumble":
			return [mine, true, "%s locks onto a false flare and takes %s" % [_S(si), _n(x.get("chip"))]]
		"flares":
			return ["enemy", false, "%s fires [b]%s[/b]: %d flares" % [_E(x), _esc(str(x.get("name", "flares"))), int(Js.num(x.get("count")))]]
		"flareHit":
			return [mine, true, "%s lets %d flares through: %s" % [_S(si), int(Js.num(x.get("missed"))), _n(x.get("dmg"))]] if Js.num(x.get("dmg")) > 0.0 else [mine, false, "%s swats every flare" % _S(si)]
		"volatile":
			return ["enemy", true, "%s's wreck goes up: %s takes %s" % [_E(x), _S(si), _n(x.get("dmg"))]]
		"flee":
			return [mine, false, "%s tries to run (%d, needs %d): %s" % [_S(si), int(Js.num(x.get("natural"))), int(Js.num(x.get("need"))), "got away" if x.get("success", false) else "caught"]]
		"intercept":
			return ["enemy", false, "%s throws itself in front of the shot at %s" % [_foe_name(int(x.get("foe", 0))), _foe_name(int(x.get("from", 0)))]]
		"bond":
			var to: int = int(x.get("to", -1))
			return [mine, false, "%s: %s%s" % [_S(si), _esc(str(x.get("text", ""))), (" for %s" % _S(to)) if to >= 0 and to != si else ""]]
		"rake":
			return [mine, true, "%s's Raking Fire carries into %s: %s" % [_S(si), _foe_name(int(x.get("foe", 0))), _n(x.get("dmg"))]]
		"reaction":
			var rd: Dictionary = Battle.reaction_def(str(x.get("id", "")))
			return [mine, true, "%s sets off %s on %s%s" % [_S(si), _link("re", str(x["id"]), str(rd.get("name", x.get("name", ""))), Color("#ffd36b")), _E(x), (": %s" % _n(x.get("dmg"))) if Js.num(x.get("dmg")) > 0.0 else ""]]
		"comboNote":
			return ["enemy", false, "%s: %s" % [_foe_name(int(x.get("foe", 0))), _esc(str(x.get("text", "")))]]
		"comboBroken":
			return ["sys", false, "%s is broken" % _link("co", _combo_id(str(x.get("name", ""))), str(x.get("name", "")), Color("#ffb38a"))]
		"role":
			var rn: String = "[b]%s[/b]" % _esc(str(x.get("name", "")))
			match str(x.get("role", "")):
				"shieldwright": return ["enemy", false, "%s (%s) shields %s: +%d" % [_E(x), rn, _foe_name(int(x.get("to", 0))), int(Js.num(x.get("amount")))]]
				"sawbones": return ["enemy", false, "%s (%s) patches up %s: +%d" % [_E(x), rn, _foe_name(int(x.get("to", 0))), int(Js.num(x.get("amount")))]]
				"hexer", "spotter": return ["enemy", false, "%s (%s) leaves %s %s" % [_E(x), rn, _S(int(x.get("seat", -1))), _status(str(x.get("status", "")))]]
				"rallier": return ["enemy", false, "%s (%s) rallies its line: %s" % [_E(x), rn, _status("enrage")]]
			return []
		"checkArm":
			return ["enemy", false, "%s readies [b]%s[/b]" % [_E(x), _esc(str(x.get("name", "")))]]
		"towed":
			return ["sys", false, "%s is towed home" % _S(si)]
	return []


func _combo_id(name: String) -> String:
	for c: Dictionary in Js.list(Js.obj(Js.obj(Battle.cfg().get("gauntlet")).get("packs")).get("combos")):
		if str(c["name"]) == name:
			return str(c["id"])
	return ""


# ── Hovering a name ──────────────────────────────────────────────────────────

func _on_hover(meta: Variant) -> void:
	var m: String = str(meta)
	var kind: String = m.get_slice(":", 0)
	var id: String = m.get_slice(":", 1)
	var title: String = ""
	var body: String = ""
	match kind:
		"st":
			var st: Array = Js.list(EnemyCard.STATUS.get(id))
			title = str(st[0]) if not st.is_empty() else id.capitalize()
			body = { "marked": "Takes more damage from every source.", "weaken": "Deals less damage.", "feeble": "Takes more damage.",
				"corrode": "Its barrier takes more damage.", "slowed": "Acts later in the turn order.", "silence": "Its special abilities are locked.",
				"enrage": "Deals more damage.", "regen": "Heals each round.", "fortify": "Takes less damage.",
				"blinded": "Sees only near the needle on the aim bar.", "narrowed": "A smaller mark to hit on the aim bar." }.get(id, "")
		"re":
			var rd: Dictionary = Battle.reaction_def(id)
			title = str(rd.get("name", id))
			body = "A reaction: %s + %s%s.  %s" % [rd.get("a", ""), rd.get("b", ""), (" + " + str(rd["c"])) if rd.has("c") else "", rd.get("desc", "")]
		"co":
			var cd: Dictionary = Battle.combo_def({}, id)
			title = str(cd.get("name", id))
			body = "An enemy pack's combo of two ships. Sinking either half breaks it."
	if title == "":
		return
	var col: Color = FxSheet.status_color(id) if kind == "st" else Color("#ffd36b")
	_tip_label.text = "[b][color=#%s]%s[/color][/b]\n%s" % [col.to_html(false), _esc(title), _esc(body)]
	_tip.reset_size()
	_tip.visible = true


# ── The tally for the recap ──────────────────────────────────────────────────

func _st(i: int) -> Dictionary:
	if fights.is_empty() or i < 0:
		return {}
	var stats: Dictionary = fights[_fight]["stats"]
	if not stats.has(i):
		stats[i] = { "dealt": 0.0, "taken": 0.0, "healed": 0.0, "given": 0.0, "crits": 0.0, "best": 0.0, "dodges": 0.0, "assists": 0.0, "shots": 0.0 }
	return stats[i]


func _tally(x: Dictionary) -> void:
	var t: String = str(x["t"])
	var si: int = int(x.get("seat", -1))
	match t:
		"shot":
			var s: Dictionary = _st(si)
			if s.is_empty():
				return
			s["shots"] = float(s["shots"]) + 1.0
			var d: float = Js.num(x.get("dmg"))
			s["dealt"] = float(s["dealt"]) + d
			s["best"] = maxf(float(s["best"]), d)
			if str(x.get("aim", "")) == "critical" and not x.get("dodged", false):
				s["crits"] = float(s["crits"]) + 1.0
		"rake", "thermal", "reaction":
			var s2: Dictionary = _st(si)
			if not s2.is_empty():
				var d2: float = Js.num(x.get("dmg"))
				for o: Variant in Js.list(x.get("others")):
					d2 += Js.num(Js.obj(o).get("dmg"))
				s2["dealt"] = float(s2["dealt"]) + d2
				if t == "reaction":
					s2["assists"] = float(s2["assists"]) + 1.0
		"grip":
			var s3: Dictionary = _st(si)
			if not s3.is_empty():
				s3["dealt"] = float(s3["dealt"]) + Js.num(x.get("crush"))
		"reflect", "parry", "counter":
			var s4: Dictionary = _st(si)
			if not s4.is_empty():
				if x.has("enemyHp") or t == "counter":
					s4["dealt"] = float(s4["dealt"]) + Js.num(x.get("dmg")) + Js.num(x.get("reflect"))
				else:
					s4["taken"] = float(s4["taken"]) + Js.num(x.get("dmg"))
		"eShot":
			var s5: Dictionary = _st(int(x.get("target", -1)))
			if not s5.is_empty():
				if x.get("dodged", false):
					s5["dodges"] = float(s5["dodges"]) + 1.0
				else:
					s5["taken"] = float(s5["taken"]) + Js.num(x.get("dmg"))
		"burn", "volatile", "flareHit":
			var s6: Dictionary = _st(si)
			if not s6.is_empty():
				s6["taken"] = float(s6["taken"]) + Js.num(x.get("dmg"))
		"fumble":
			var s7: Dictionary = _st(si)
			if not s7.is_empty():
				s7["taken"] = float(s7["taken"]) + Js.num(x.get("chip"))
		"leech", "overkill", "tithe", "repair":
			var s8: Dictionary = _st(si)
			if not s8.is_empty():
				s8["healed"] = float(s8["healed"]) + Js.num(x.get("heal"))
		"bond":
			var s9: Dictionary = _st(si)
			if s9.is_empty():
				return
			s9["assists"] = float(s9["assists"]) + 1.0
			var tx: String = str(x.get("text", ""))
			if tx.begins_with("+") and not tx.contains("ball") and int(x.get("to", -1)) != si:
				s9["given"] = float(s9["given"]) + float(tx.substr(1).to_int())


# ── The recap (on demand) ────────────────────────────────────────────────────

func _show_recap() -> void:
	Sound.plip()
	var r: CombatRecap = CombatRecap.new()
	r.log = self
	get_parent().add_child(r)


## Every fight's tally summed: the whole raid or dive.
func whole() -> Dictionary:
	var out: Dictionary = {}
	for f: Dictionary in fights:
		for i: Variant in f["stats"]:
			if not out.has(i):
				out[i] = {}
			for k: String in f["stats"][i]:
				var v: float = float(f["stats"][i][k])
				out[i][k] = maxf(float(out[i].get(k, 0.0)), v) if k == "best" else float(out[i].get(k, 0.0)) + v
	return out


class CombatRecap:
	extends Control
	var log: CombatLog
	var _which: int = -1
	var _card: PanelContainer
	var _body: VBoxContainer

	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_STOP
		var dim: ColorRect = ColorRect.new()
		dim.color = Color(0, 0, 0, 0.55)
		dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		dim.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed:
				queue_free())
		add_child(dim)
		_card = PanelContainer.new()
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = Color(0.085, 0.07, 0.06, 0.98)
		sb.border_color = Color(1, 1, 1, 0.1)
		sb.set_border_width_all(1)
		sb.set_corner_radius_all(14)
		sb.set_content_margin_all(22)
		_card.add_theme_stylebox_override("panel", sb)
		_card.set_anchors_preset(Control.PRESET_CENTER)
		_card.custom_minimum_size = Vector2(820, 0)
		add_child(_card)
		_body = VBoxContainer.new()
		_body.add_theme_constant_override("separation", 10)
		_card.add_child(_body)
		_which = log.fights.size() - 1
		_paint()

	func _unhandled_input(ev: InputEvent) -> void:
		if ev is InputEventKey and ev.pressed and (ev as InputEventKey).keycode == KEY_ESCAPE:
			queue_free()
			get_viewport().set_input_as_handled()

	func _paint() -> void:
		for c: Node in _body.get_children():
			c.queue_free()
		var head: HBoxContainer = HBoxContainer.new()
		_body.add_child(head)
		var t: Label = Kit.text(head, "Recap", "heading", BattleLook.CREAM)
		t.add_theme_font_size_override("font_size", 22)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var close: Button = log._small_button("Close  Esc", func() -> void: queue_free())
		head.add_child(close)
		# Which: each fight, or the whole run.
		var picks: HFlowContainer = HFlowContainer.new()
		picks.add_theme_constant_override("h_separation", 6)
		_body.add_child(picks)
		var opts: Array = [[-1, "The whole %s" % ("dive" if log.stage.gauntlet != "" else "raid")]]
		for k: int in log.fights.size():
			opts.append([k, str(log.fights[k]["title"])])
		for o: Array in opts:
			var idx: int = o[0]
			var b: Button = log._small_button(o[1], func() -> void:
				_which = idx
				Sound.plip()
				_paint())
			if idx == _which:
				b.add_theme_color_override("font_color", Color(0.98, 0.93, 0.82))
				var s: StyleBoxFlat = (b.get_theme_stylebox("normal") as StyleBoxFlat).duplicate()
				s.bg_color = Color(1, 1, 1, 0.16)
				b.add_theme_stylebox_override("normal", s)
			picks.add_child(b)
		var stats: Dictionary = log.whole() if _which < 0 else log.fights[_which]["stats"]
		if _which >= 0:
			Kit.text(_body, "%d turns" % int(log.fights[_which]["turns"]), "small", BattleLook.MUTED)
		var grid: GridContainer = GridContainer.new()
		grid.columns = 8
		grid.add_theme_constant_override("h_separation", 22)
		grid.add_theme_constant_override("v_separation", 8)
		_body.add_child(grid)
		for h: String in ["Captain", "Damage", "Taken", "Healed", "Given", "Crits", "Best hit", "Assists"]:
			var l: Label = Kit.text(grid, h.to_upper(), "small", BattleLook.MUTED)
			l.add_theme_font_override("font", Kit.font("karla", 800))
			l.add_theme_font_size_override("font_size", 10)
		var keys: Array = stats.keys()
		keys.sort_custom(func(a: Variant, b2: Variant) -> bool: return float(stats[a]["dealt"]) > float(stats[b2]["dealt"]))
		var top: float = 1.0
		for i: Variant in keys:
			top = maxf(top, float(stats[i]["dealt"]))
		for i2: Variant in keys:
			var s2: Dictionary = stats[i2]
			var seats: Array = log.stage.b.get("seats", [])
			var nm: String = "You" if int(i2) == log.stage.me else (str(seats[int(i2)].get("name", "A captain")) if int(i2) < seats.size() else "A captain")
			var nl: Label = Kit.text(grid, nm, "body_strong", log._seat_color(int(i2)))
			nl.custom_minimum_size = Vector2(150, 0)
			var dv: Label = Kit.text(grid, Js.thousands(float(s2["dealt"])), "body_strong", BattleLook.CREAM)
			dv.tooltip_text = "%d%% of the most" % int(round(float(s2["dealt"]) / top * 100.0))
			for k2: String in ["taken", "healed", "given", "crits", "best", "assists"]:
				Kit.text(grid, Js.thousands(float(s2[k2])), "body", BattleLook.CREAM if float(s2[k2]) > 0.0 else BattleLook.MUTED)
		if keys.is_empty():
			Kit.text(_body, "Nothing has happened yet.", "small", BattleLook.MUTED)
		Kit.text(_body, "Given: healing and shields put on crewmates by bonds.  Assists: bond powers and reactions set off.", "small", BattleLook.MUTED, true)
		_card.reset_size()
		_card.position = (size - _card.size) / 2.0
		_center.call_deferred()

	func _center() -> void:
		_card.reset_size()
		_card.position = (size - _card.size) / 2.0
