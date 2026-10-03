class_name Journal
extends Control
## THE JOURNAL (Kong, 2026-10-02: "the Salt Road doesn't make sense; give it
## a more sensible title"). The web's Salt Road panel (FolkPanel.tsx), on
## paper, in two tabs.
##
## STORY: The Long Cast. The job in hand (its slip), every chapter with its
## jobs as pips (inked when done), and what Finn has told you so far, newest
## first. Only what you have heard is written here, so it keeps his secrets.
##
## PEOPLE: who you know on the water. What they are waiting on first (a fish
## they asked for; the ones you can hand over now on top), then a card each:
## their face, where you stand, and a dot when there is a reason to sail out
## to them (a word not had today, or their fish in your hold). The ones you
## have not met are question marks with their water and nothing else.

signal closed

var session: Session
var tab: String = "story"
var _body: VBoxContainer
var _sheet: Control
var _tabs: HBoxContainer


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.06, 0.45)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	add_child(shade)
	_sheet = Control.new()
	_sheet.anchor_left = 0.5
	_sheet.anchor_right = 0.5
	_sheet.anchor_bottom = 1.0
	_sheet.offset_left = -380.0
	_sheet.offset_right = 380.0
	_sheet.offset_top = 64.0
	_sheet.offset_bottom = -24.0
	add_child(_sheet)
	Paper.sheet(_sheet, 8.0)
	var margin: MarginContainer = MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, 34)
	margin.add_theme_constant_override("margin_top", 26)
	margin.add_theme_constant_override("margin_bottom", 24)
	_sheet.add_child(margin)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 6)
	col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 0)
	head.add_child(titles)
	Paper.text(titles, "The Journal", "display", Paper.INK)
	Paper.text(titles, "The story so far, and the people you know on the water.", "note", Paper.INK_SOFT)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	_tabs.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	head.add_child(_tabs)
	var x: Pane.PaneButton = Paper.button("Close  Esc")
	x.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	x.pressed.connect(close)
	head.add_child(x)
	Paper.rule(col)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	_body = VBoxContainer.new()
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 12)
	scroll.add_child(_body)
	_sheet.modulate.a = 0.0
	_sheet.position.y += 16.0
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_sheet, "modulate:a", 1.0, 0.2)
	tw.tween_property(_sheet, "position:y", _sheet.position.y - 16.0, 0.25).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_rebuild()


func _rebuild() -> void:
	for c: Node in _tabs.get_children():
		c.queue_free()
	for o: Array in [["story", "Story"], ["people", "People"]]:
		var b: Pane.PaneButton = Paper.button(o[1], o[0] == tab)
		b.pressed.connect(func() -> void:
			tab = o[0]
			_rebuild())
		_tabs.add_child(b)
	for c: Node in _body.get_children():
		c.queue_free()
	if tab == "people":
		_people()
	else:
		_story()


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


# ── Story ──────────────────────────────────────────────────────────────────────

func _story() -> void:
	var st: Variant = Finn.state(session.store, session.uid)
	if not (st is Dictionary):
		return
	var s: Dictionary = st
	var done: Array = Js.list(s.get("questsDone"))
	var level: int = int(Js.num(s.get("fishingLevel")))
	var top: HBoxContainer = HBoxContainer.new()
	_body.add_child(top)
	var t: Label = Paper.text(top, "The Long Cast", "heading", Paper.INK)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Paper.text(top, "%d of %d jobs" % [done.size(), Finn.quests().size()], "label", Paper.INK_SOFT)
	var tier: int = Finn.standing_tier(Finn.standing(Js.num(s.get("encounters")), float(done.size())))
	Paper.text(_body, "Finn's campaign. He sets you a job, you do it, you hand it back and he tells you the next piece. Finn thinks you are: %s." % str(Finn.d()["standingName"][tier]).to_lower(), "note", Paper.INK_SOFT, true)

	# The job in hand, as its slip.
	var q: Variant = s.get("quest")
	if q is Dictionary:
		var holder: CenterContainer = CenterContainer.new()
		_body.add_child(holder)
		var slip: JobSlip = JobSlip.new()
		slip.job = q
		slip.have = float((q as Dictionary)["have"])
		holder.add_child(slip)
		if (q as Dictionary)["done"]:
			Paper.text(_body, "Done. Take it back to Finn, off the Shallows, to hand it over.", "label", Paper.RED, true).horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	else:
		var msg: String
		var nxt: Dictionary = Finn.next_quest(done, level)
		var wait: Dictionary = Finn.waiting_on(done, level)
		if not nxt.is_empty():
			msg = "Finn has work for you. He is moored off the Shallows."
		elif not wait.is_empty():
			msg = "%s opens at Fishing %d. He will be waiting." % [wait["title"], int(wait["minLevel"])]
		else:
			msg = "Every job he had, done."
		Paper.text(_body, msg, "label", Paper.RED, true)

	# The chapters, with their jobs as pips.
	Paper.rule(_body)
	for v: Dictionary in Finn.chapter_views(done, level):
		_chapter_row(v, done)

	# What he has told you, newest first.
	var heard: Array = []
	for b: Dictionary in Finn.d()["beats"]:
		if Js.list(s.get("seenBeats")).has(b["id"]):
			heard.append(b)
	if s.get("revealed", false):
		heard.append(Finn.d()["reveal"])
	if heard.is_empty():
		return
	Paper.rule(_body)
	Paper.text(_body, "What he has told you", "heading", Paper.INK)
	heard.reverse()
	for b: Dictionary in heard:
		var words: Array = []
		for l: Variant in b["lines"]:
			words.append((str(l) if typeof(l) == TYPE_STRING else str((l as Dictionary)["text"])).replace("*", ""))
		var p: Label = Paper.text(_body, " ".join(PackedStringArray(words)), "body", Paper.INK, true)
		p.add_theme_font_override("font", Kit.italic())
		p.add_theme_font_size_override("font_size", 15)


func _chapter_row(v: Dictionary, done: Array) -> void:
	var ch: Dictionary = v["chapter"]
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	_body.add_child(row)
	var num: Label = Paper.text(row, str(ch["romanNumeral"]), "display", Paper.RED if v["current"] else (Paper.INK if v["complete"] else Paper.INK_FAINT))
	num.custom_minimum_size = Vector2(54, 0)
	num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var col: VBoxContainer = VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 2)
	row.add_child(col)
	var tr: HBoxContainer = HBoxContainer.new()
	col.add_child(tr)
	var tl: Label = Paper.text(tr, str(ch["title"]), "heading", Paper.INK if v["open"] else Paper.INK_FAINT)
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var state: String = "Complete" if v["complete"] else ("In progress" if v["current"] else ("Opens at Fishing %d" % int(ch["minLevel"]) if not v["open"] else "Open"))
	Paper.text(tr, state, "label", Paper.RED if v["current"] else Paper.INK_SOFT)
	Paper.text(col, str(ch["subtitle"]), "note", Paper.INK_SOFT if v["open"] else Paper.INK_FAINT, true)
	# One pip a job: inked when handed back.
	var pips: Control = Control.new()
	pips.custom_minimum_size = Vector2(0, 16)
	var qs: Array = Finn.chapter_quests(str(ch["id"]))
	pips.draw.connect(func() -> void:
		for i: int in qs.size():
			var c: Vector2 = Vector2(8.0 + i * 20.0, 8.0)
			if done.has(qs[i]["id"]):
				pips.draw_circle(c, 6.0, Paper.INK)
			else:
				pips.draw_arc(c, 6.0, 0.0, TAU, 20, Paper.INK_FAINT, 1.5, true))
	col.add_child(pips)


# ── People ─────────────────────────────────────────────────────────────────────

func _people() -> void:
	var rows: Array = Folk.state(session.store, session.uid)
	var by: Dictionary = {}
	for r: Dictionary in rows:
		by[r["folkId"]] = r
	# What they are waiting on: the ones you can hand over now first.
	var waiting: Array = rows.filter(func(r: Dictionary) -> bool: return r.get("want") != null)
	waiting.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a.get("wantReady", false) and not b.get("wantReady", false))
	if not waiting.is_empty():
		Paper.text(_body, "Waiting on you", "heading", Paper.INK)
		for r: Dictionary in waiting:
			var f: Dictionary = Folk.by_id(r["folkId"])
			var line: HBoxContainer = HBoxContainer.new()
			_body.add_child(line)
			var who: Label = Paper.text(line, "%s wants a %s" % [f["short"], r["want"]["name"]], "label", Paper.INK)
			who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			Paper.text(line, "In your hold: take it to them" if r.get("wantReady", false) else "Land one, in %s" % _water_name(str(f.get("zoneId", ""))), "label", Paper.RED if r.get("wantReady", false) else Paper.INK_SOFT)
		Paper.rule(_body)
	var known: Array = []
	var unknown: Array = []
	for f: Dictionary in Folk.roster():
		var r: Dictionary = by.get(f["id"], {})
		if Js.num(r.get("points")) > 0.0 or not Js.list(r.get("seenLines")).is_empty():
			known.append(f)
		else:
			unknown.append(f)
	for sec: Array in [["Known to you", known], ["Still out there", unknown]]:
		if (sec[1] as Array).is_empty():
			continue
		Paper.text(_body, sec[0], "heading", Paper.INK)
		var grid: GridContainer = GridContainer.new()
		grid.columns = 3
		grid.add_theme_constant_override("h_separation", 12)
		grid.add_theme_constant_override("v_separation", 12)
		_body.add_child(grid)
		for f: Dictionary in sec[1]:
			_card(grid, f, by.get(f["id"], {}), sec[0] == "Known to you")


func _water_name(id: String) -> String:
	for w: Dictionary in Chart.WATERS:
		if w["id"] == id:
			return str(w["name"])
	return "the open sea"


func _card(parent: Node, f: Dictionary, r: Dictionary, met: bool) -> void:
	var accent: Color = Color(str(f.get("accent", "#c8a060")))
	var card: Pane = Kit.pane(parent, { "radius": 8, "fill": [Color(1, 1, 1, 0.22) if met else Color(1, 1, 1, 0.08)], "border": [1, Color(Paper.INK, 0.3) if met else Color(Paper.INK, 0.18)], "pad": [12, 10, 12, 10], "paper": true })
	card.custom_minimum_size = Vector2(212, 0)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 3)
	card.add_child(col)
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 10)
	col.add_child(top)
	if met:
		var av: Avatar = Avatar.new()
		av.face = f["face"]
		av.px = 44.0
		top.add_child(av)
	else:
		var qm: Label = Paper.text(top, "?", "display", Paper.INK_FAINT)
		qm.custom_minimum_size = Vector2(44, 44)
		qm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var who: VBoxContainer = VBoxContainer.new()
	who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	who.add_theme_constant_override("separation", 0)
	top.add_child(who)
	if met:
		Paper.text(who, str(f["short"]), "heading", Paper.INK)
		var tier: int = int(r.get("tier", 0))
		Paper.text(who, Folk.TIER_NAME[tier], "label", Kit.ink(accent))
	else:
		Paper.text(who, "Someone", "heading", Paper.INK_FAINT)
	Paper.text(col, _water_name(str(f.get("zoneId", ""))), "note", Paper.INK_SOFT)
	if met:
		# Where you stand, and a dot when there is a reason to sail out.
		var points: float = Js.num(r.get("points"))
		var tier2: int = Folk.tier_for(points)
		var lo: float = Folk.TIER_AT[tier2]
		var hi: float = Folk.TIER_AT[4] if tier2 == 4 else Folk.TIER_AT[tier2 + 1]
		var frac: float = 1.0 if tier2 == 4 else clampf((points - lo) / maxf(1.0, hi - lo), 0.0, 1.0)
		var bar: Control = Control.new()
		bar.custom_minimum_size = Vector2(0, 5)
		bar.draw.connect(func() -> void:
			bar.draw_rect(Rect2(Vector2.ZERO, bar.size), Color(Paper.INK, 0.12))
			bar.draw_rect(Rect2(Vector2.ZERO, Vector2(bar.size.x * frac, bar.size.y)), Kit.ink(accent)))
		col.add_child(bar)
		var reason: String = ""
		if r.get("wantReady", false):
			reason = "Their fish is in your hold"
		elif not r.get("chattedToday", false):
			reason = "A word to be had today"
		if reason != "":
			var rl: Label = Paper.text(col, "●  " + reason, "small", Paper.RED)
			rl.add_theme_font_size_override("font_size", 12)
