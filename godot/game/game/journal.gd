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

## THE STORY, AS A MAIN STORY (Kong, 2026-10-03: "the journal feels like it's
## spoiling future things; too wordy"). Pictures over paragraphs, and nothing
## ahead of you named: the chapter you are in as a banner, the road of five
## chapters (finished ones inked, yours lit, the rest sealed, their numeral
## only), the job in hand as its slip, and the last thing Finn said. The
## rest of what he has told you folds away under one button.
var _story_open: bool = false


func _story() -> void:
	var st: Variant = Finn.state(session.store, session.uid)
	if not (st is Dictionary):
		return
	var s: Dictionary = st
	var done: Array = Js.list(s.get("questsDone"))
	var level: int = int(Js.num(s.get("fishingLevel")))
	var views: Array = Finn.chapter_views(done, level)
	var cur: Dictionary = {}
	for v: Dictionary in views:
		if v["current"]:
			cur = v
	if cur.is_empty():
		for v: Dictionary in views:
			if not v["complete"]:
				cur = v
				break
	var all_done: bool = cur.is_empty()

	# The banner: the chapter you are in.
	var banner: VBoxContainer = VBoxContainer.new()
	banner.add_theme_constant_override("separation", 0)
	_body.add_child(banner)
	var eb: Label = Paper.text(banner, "THE LONG CAST", "eyebrow", Paper.RED)
	eb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var big: Label = Paper.text(banner, "Complete" if all_done else "Chapter %s" % str(cur["chapter"]["romanNumeral"]), "display", Paper.INK)
	big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	big.add_theme_font_size_override("font_size", 44)
	if not all_done and cur["open"]:
		var tl: Label = Paper.text(banner, str(cur["chapter"]["title"]), "heading", Paper.INK_SOFT)
		tl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	elif not all_done:
		var wl: Label = Paper.text(banner, "Opens at Fishing %d" % int(cur["chapter"]["minLevel"]), "heading", Paper.INK_SOFT)
		wl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	# The road of five.
	var road: Control = Control.new()
	road.custom_minimum_size = Vector2(0, 104)
	var t0: float = Time.get_ticks_msec() / 1000.0
	road.draw.connect(func() -> void: _draw_road(road, views, cur, t0))
	_body.add_child(road)
	var tick: Timer = Timer.new()
	tick.wait_time = 0.05
	tick.autostart = true
	tick.timeout.connect(road.queue_redraw)
	road.add_child(tick)

	# The job in hand, or what is next.
	var q: Variant = s.get("quest")
	if q is Dictionary:
		var holder: CenterContainer = CenterContainer.new()
		_body.add_child(holder)
		var slip: JobSlip = JobSlip.new()
		slip.job = q
		slip.have = float((q as Dictionary)["have"])
		holder.add_child(slip)
		if (q as Dictionary)["done"]:
			var back: Label = Paper.text(_body, "Done. Take it back to Finn.", "label", Paper.RED)
			back.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	elif not all_done:
		var nxt: Dictionary = Finn.next_quest(done, level)
		var msg: Label = Paper.text(_body, "Finn has work for you" if not nxt.is_empty() else "Chapter %s opens at Fishing %d" % [str(cur["chapter"]["romanNumeral"]), int(cur["chapter"]["minLevel"])], "heading", Paper.RED)
		msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	# The last thing he said; the rest folded.
	var heard: Array = []
	for b: Dictionary in Finn.d()["beats"]:
		if Js.list(s.get("seenBeats")).has(b["id"]):
			heard.append(b)
	if s.get("revealed", false):
		heard.append(Finn.d()["reveal"])
	if heard.is_empty():
		return
	var last: Array = (heard[heard.size() - 1] as Dictionary)["lines"]
	var quote: Label = Paper.text(_body, "\"%s\"" % _line_text(last[last.size() - 1]), "body", Paper.INK, true)
	quote.add_theme_font_override("font", Kit.italic())
	quote.add_theme_font_size_override("font_size", 17)
	quote.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var sig: Label = Paper.text(_body, "Finn", "small", Paper.INK_SOFT)
	sig.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var holder2: CenterContainer = CenterContainer.new()
	_body.add_child(holder2)
	var more: Pane.PaneButton = Paper.button("Hide the story so far" if _story_open else "The story so far", _story_open)
	more.pressed.connect(func() -> void:
		_story_open = not _story_open
		_rebuild())
	holder2.add_child(more)
	if not _story_open:
		return
	var rev: Array = heard.duplicate()
	rev.reverse()
	for b: Dictionary in rev:
		var words: Array = []
		for l: Variant in b["lines"]:
			words.append(_line_text(l))
		var p: Label = Paper.text(_body, " ".join(PackedStringArray(words)), "body", Paper.INK_SOFT, true)
		p.add_theme_font_override("font", Kit.italic())
		p.add_theme_font_size_override("font_size", 15)


static func _line_text(l: Variant) -> String:
	return (str(l) if typeof(l) == TYPE_STRING else str((l as Dictionary)["text"])).replace("*", "")


## Five medallions on a line: inked and ticked when finished, lit red and
## breathing for the one you are in, sealed (the numeral only, faint, with the
## level it opens at) for the rest. The chapter you are in carries its jobs
## as pips underneath.
func _draw_road(road: Control, views: Array, cur: Dictionary, t0: float) -> void:
	var n: int = views.size()
	var w: float = road.size.x
	var y: float = 40.0
	var step: float = (w - 120.0) / maxf(1.0, n - 1)
	var f: Font = Kit.font("cinzel", 800)
	var small: Font = Kit.font("karla", 700)
	var t: float = Time.get_ticks_msec() / 1000.0 - t0
	for i: int in n - 1:
		var a: Vector2 = Vector2(60.0 + i * step + 26.0, y)
		var b: Vector2 = Vector2(60.0 + (i + 1) * step - 26.0, y)
		var finished: bool = views[i]["complete"]
		if finished:
			road.draw_line(a, b, Color(Paper.INK, 0.7), 2.0, true)
		else:
			road.draw_dashed_line(a, b, Color(Paper.INK, 0.3), 2.0, 8.0)
	for i: int in n:
		var v: Dictionary = views[i]
		var c: Vector2 = Vector2(60.0 + i * step, y)
		var num: String = str(v["chapter"]["romanNumeral"])
		var is_cur: bool = not cur.is_empty() and v["chapter"]["id"] == cur["chapter"]["id"]
		var col: Color
		if v["complete"]:
			road.draw_circle(c, 24.0, Paper.INK)
			col = Kit.PAPER
		elif is_cur:
			var pulse: float = 0.5 + 0.5 * sin(t * 2.6)
			road.draw_circle(c, 30.0 + pulse * 4.0, Color(Paper.RED, 0.12 * (1.0 - pulse) + 0.05))
			road.draw_circle(c, 24.0, Color(1, 1, 1, 0.35))
			road.draw_arc(c, 24.0, 0.0, TAU, 40, Paper.RED, 3.0, true)
			col = Paper.RED
		else:
			road.draw_circle(c, 24.0, Color(Paper.INK, 0.05))
			road.draw_arc(c, 24.0, 0.0, TAU, 40, Color(Paper.INK, 0.25), 1.5, true)
			col = Color(Paper.INK, 0.35)
		var sz: Vector2 = f.get_string_size(num, HORIZONTAL_ALIGNMENT_LEFT, -1, 20)
		road.draw_string(f, c + Vector2(-sz.x / 2.0, 7.0), num, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, col)
		if not v["open"]:
			var lab: String = "Fishing %d" % int(v["chapter"]["minLevel"])
			var lsz: Vector2 = small.get_string_size(lab, HORIZONTAL_ALIGNMENT_LEFT, -1, 12)
			road.draw_string(small, c + Vector2(-lsz.x / 2.0, 46.0), lab, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(Paper.INK, 0.4))
		elif is_cur:
			# Its jobs, as pips under it.
			var total: int = int(v["total"])
			var got: int = int(v["done"])
			var span: float = (total - 1) * 12.0
			for k: int in total:
				var p: Vector2 = c + Vector2(-span / 2.0 + k * 12.0, 44.0)
				if k < got:
					road.draw_circle(p, 4.0, Paper.RED)
				else:
					road.draw_arc(p, 4.0, 0.0, TAU, 14, Color(Paper.RED, 0.6), 1.2, true)


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
