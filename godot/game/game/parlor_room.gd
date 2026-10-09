class_name ParlorRoom
extends Room
## THE PARLOR (Godot port of app/(app)/tavern/trivia; Kong 2026-10-03: "match
## the aesthetic of our game; use Godot for better animations"). Paper, ink
## and a little theatre: the Captain's Board is your hand of cards face down,
## and one turned over grows into the question with a ring of time draining
## round it; the Pirate King is a ladder you climb rung by rung; the capstan
## is a wheel that really spins and a board of tiles that turn over as their
## letters are called. Rules: core/parlor.gd.

const CORAL: Color = Color("#dd8f79")
const RIGHT: Color = Paper.GREEN
const WRONG: Color = Paper.RED

var tab: String = "board"
var _st: Dictionary = {}
var _tabs: HBoxContainer
var _body: VBoxContainer
var _rank_l: Label
var _pts_bar: Kit.Bar
var _streak_l: Label
var _busy: bool = false
# The card in play.
var _q_card: Control = null
var _ring: Control = null
var _deadline: float = -1.0
var _answering: Callable = Callable()
# The capstan.
var _cap_i: int = 0
var _wheel: CapWheel = null


func _init() -> void:
	title = "The Parlor"
	accent = CORAL


func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.color = Color("#14100c")
	add_child(bg)
	var glow: TextureRect = TextureRect.new()
	glow.texture = Glow.radial(256, Color(0.95, 0.6, 0.45))
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	glow.modulate = Color(1, 1, 1, 0.08)
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(glow)


func _build() -> void:
	_st = Parlor.state(session.store, session.uid)
	# Where you stand: the rank, the points to the next, the streak.
	var strip: Pane = Kit.pane(col, { "radius": Kit.R_LARGE, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.3)], "shadow": [Color(0, 0, 0, 0.45), 16, Vector2(0, 5)], "pad": [22, 12, 22, 14], "paper": true })
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	strip.add_child(row)
	var left: VBoxContainer = VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 2)
	row.add_child(left)
	_rank_l = Paper.text(left, "", "heading", Paper.INK)
	_pts_bar = Kit.bar(left, 0.0, Paper.INK)
	var note: Label = Paper.text(left, "", "note", Paper.INK_SOFT)
	note.name = "PtsNote"
	_streak_l = Paper.text(row, "", "title", Paper.RED)
	_streak_l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_tabs = HBoxContainer.new()
	col.add_child(_tabs)
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 12)
	col.add_child(_body)
	_paint_strip()
	_open(tab)


func _paint_strip() -> void:
	var rk: Dictionary = _st["rank"]
	_rank_l.text = str(rk["title"])
	_rank_l.add_theme_color_override("font_color", Kit.ink(Color(str(rk["color"]))))
	var nxt: Variant = _st.get("nextRank")
	var pn: Label = _rank_l.get_parent().get_node("PtsNote")
	pn.text = "%d Parlor points%s   ·   %d of %d questions met" % [int(_st["points"]), ("   ·   %d to %s" % [int(float(nxt["at"]) - float(_st["points"])), nxt["title"]]) if nxt != null else "", int(_st["seen"]), int(_st["bankSize"])]
	_streak_l.text = "Streak %d" % int(_st["streak"]) if float(_st["streak"]) > 0.0 else ""
	# The capstone (core/skins.gd): Parlor Legend brings a Captain's Voucher.
	var cap: String = str(Skins.cfg().get("parlorCapstone", ""))
	if nxt != null and str(nxt["title"]) == cap:
		pn.text += "   ·   %s brings a %s" % [cap, Skins.kind_def("captain").get("name", "Captain's Voucher")]
	var f: float = 1.0
	if nxt != null:
		f = clampf((float(_st["points"]) - float(rk["at"])) / maxf(1.0, float(nxt["at"]) - float(rk["at"])), 0.0, 1.0)
	var bar: Kit.Bar = _pts_bar
	bar.color = Kit.ink(Color(str(rk["color"])))
	bar.set_value(f)


func _refresh() -> void:
	_st = Parlor.state(session.store, session.uid)
	_paint_strip()


func _open(which: String) -> void:
	tab = which
	for c: Node in _tabs.get_children():
		_tabs.remove_child(c)
		c.queue_free()
	var lock: String = str(_st["king"].get("locked", ""))
	var opts: Array = []
	var shut: Array = []
	for t: Array in [["board", "Captain's Board", ""], ["king", "The Pirate King", lock], ["capstan", "Spin the Capstan", ""]]:
		opts.append([t[0], t[1] if t[2] == "" else t[1] + Kit.SEP + t[2]])
		shut.append(t[2] != "")
	var row: HBoxContainer = Kit.tabs(_tabs, opts, which, accent, func(k: Variant) -> void:
		if not _busy:
			_open(String(k)))
	for i: int in row.get_child_count():
		var b: Button = row.get_child(i)
		b.disabled = shut[i]
		b.add_theme_color_override("font_disabled_color", Color(Kit.PAPER_INK_SOFT, 0.55))
	for c: Node in _body.get_children():
		c.queue_free()
	_q_card = null
	match which:
		"king":
			_king_view()
		"capstan":
			_capstan_view()
		_:
			_board_view()


func _process(delta: float) -> void:
	super._process(delta)
	if _ring != null and is_instance_valid(_ring):
		_ring.queue_redraw()
		if _deadline > 0.0 and Time.get_ticks_msec() / 1000.0 > _deadline and _answering.is_valid():
			var go: Callable = _answering
			_answering = Callable()
			go.call(-1)


# ── The Captain's Board ────────────────────────────────────────────────────────

func _cat(key: String) -> Dictionary:
	for c: Dictionary in Parlor.c()["categories"]:
		if c["key"] == key:
			return c
	return { "label": key, "color": "#888888" }


func _board_view() -> void:
	var b: Dictionary = _st["board"]
	var head: HBoxContainer = HBoxContainer.new()
	_body.add_child(head)
	var t: Label = Kit.text(head, "Your hand", "title", Kit.INK)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var next: float = float(b["nextIn"])
	Kit.text(head, ("Next card in %s" % _dur(next)) if next >= 0.0 else "Your hand is full: play a card to be dealt another", "label", Color(Kit.INK, 0.7))
	var hand: HBoxContainer = HBoxContainer.new()
	hand.alignment = BoxContainer.ALIGNMENT_CENTER
	hand.add_theme_constant_override("separation", 18)
	hand.custom_minimum_size = Vector2(0, 250)
	_body.add_child(hand)
	var cards: Array = b["hand"]
	if cards.is_empty():
		Kit.text(hand, "No cards in hand. One is dealt every eight hours.", "label", Color(Kit.INK, 0.7))
	for i: int in cards.size():
		var c: Dictionary = cards[i]
		var card: Button = _card_button(c)
		hand.add_child(card)
		card.pivot_offset = Vector2(80, 230)
		card.rotation = deg_to_rad((i - (cards.size() - 1) / 2.0) * 4.0)
		Motion.stagger(card, i)
		if c.has("question"):
			# Turned over and not answered: back to it.
			_play_card.call_deferred(c)
	var how: Label = Paper.text(_body, "Turn a card over to see its question; you have %d seconds to answer. Right pays the card's worth." % int(Parlor.c()["answerSeconds"]), "note", Color(Kit.INK, 0.6), true)
	how.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _dur(ms: float) -> String:
	var m: int = int(ms / 60000.0)
	return "%dh %02dm" % [m / 60, m % 60] if m >= 60 else "%dm" % maxi(1, m)


## A card face down: its topic's colour, its topic and its worth.
func _card_button(c: Dictionary) -> Button:
	var cat: Dictionary = _cat(str(c["category"]))
	var colr: Color = Color(str(cat["color"]))
	var n: Dictionary = { "radius": Kit.R_LARGE, "fill": [Kit.PAPER], "border": [2, Color(Kit.ink(colr), 0.7)], "shadow": [Color(0, 0, 0, 0.45), 14, Vector2(0, 6)], "pad": 0, "paper": true }
	var h: Dictionary = n.duplicate()
	h["border"] = [3, Kit.ink(colr)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.custom_minimum_size = Vector2(160, 230)
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", 8)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(v)
	var band: ColorRect = ColorRect.new()
	band.color = Color(colr, 0.85)
	band.custom_minimum_size = Vector2(0, 10)
	band.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(band)
	var l: Label = Paper.text(v, str(cat["label"]), "heading", Paper.INK)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var tier: Label = Paper.text(v, "★".repeat(int(c["tier"])), "title", Kit.ink(colr))
	tier.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var w: Label = Paper.text(v, "%d ⟡" % int(c["value"]), "display_sm", Paper.MONEY)
	w.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.pressed.connect(func() -> void: _turn(c, b))
	return b


func _turn(c: Dictionary, from: Control) -> void:
	if _busy:
		return
	_busy = true
	var r: Dictionary = await session.act("boardReveal", [c["key"]])
	if r.has("error"):
		toast(str(r["error"]), WRONG)
		_busy = false
		return
	session.persist()
	# The card turns: narrows to an edge, then the question grows from it.
	var tw: Tween = from.create_tween()
	tw.tween_property(from, "scale:x", 0.0, 0.14).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	await tw.finished
	Sound.plip()
	var mine: Dictionary = (r["hand"] as Array).filter(func(x: Dictionary) -> bool: return x["key"] == c["key"])[0]
	_busy = false
	_play_card(mine)


## The question on its card, the ring of time round it, the four answers.
func _play_card(c: Dictionary) -> void:
	for n: Node in _body.get_children():
		n.queue_free()
	var cat: Dictionary = _cat(str(c["category"]))
	var colr: Color = Color(str(cat["color"]))
	var holder: CenterContainer = CenterContainer.new()
	_body.add_child(holder)
	var card: Pane = Kit.pane(holder, { "radius": 14, "fill": [Kit.PAPER], "border": [2, Kit.ink(colr)], "shadow": [Color(0, 0, 0, 0.5), 22, Vector2(0, 8)], "pad": [30, 22, 30, 24], "paper": true })
	card.custom_minimum_size = Vector2(760, 0)
	_q_card = card
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	card.add_child(v)
	var top: HBoxContainer = HBoxContainer.new()
	v.add_child(top)
	var cl: Label = Paper.text(top, "%s   ·   %d ⟡" % [cat["label"], int(c["value"])], "eyebrow", Kit.ink(colr))
	cl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ring = Control.new()
	_ring.custom_minimum_size = Vector2(54, 54)
	_ring.draw.connect(_draw_ring)
	top.add_child(_ring)
	var ql: Label = Paper.text(v, str(c["question"]), "title", Paper.INK, true)
	ql.add_theme_font_size_override("font_size", 24)
	var opts: GridContainer = GridContainer.new()
	opts.columns = 2
	opts.add_theme_constant_override("h_separation", 12)
	opts.add_theme_constant_override("v_separation", 12)
	v.add_child(opts)
	var buttons: Array = []
	for i: int in 4:
		# An answer is a sentence: the quiet large button (Karla), not capitals.
		var ob: Button = Kit.button(str(c["options"][i]), "quiet")
		ob.custom_minimum_size = Vector2(340, 56)
		opts.add_child(ob)
		buttons.append(ob)
	var explain: Label = Paper.text(v, "", "body", Paper.INK_SOFT, true)
	var next_b: Button = Kit.button("Back to your hand", "primary")
	next_b.visible = false
	next_b.pressed.connect(func() -> void:
		_refresh()
		_open("board"))
	v.add_child(next_b)
	var revealed: float = float(c["revealedAt"])
	var lim: float = float(Parlor.c()["answerSeconds"])
	var left: float = maxf(0.0, lim - (Clock.now_ms() - revealed) / 1000.0)
	_deadline = Time.get_ticks_msec() / 1000.0 + left
	Motion.arrive(card, "m")
	var answer: Callable = func(i: int) -> void:
		if _busy:
			return
		_busy = true
		_answering = Callable()
		_deadline = -1.0
		var r: Dictionary = await session.act("boardAnswer", [c["key"], float(i)])
		_busy = false
		if r.has("error"):
			toast(str(r["error"]), WRONG)
			return
		session.persist()
		_judge(buttons, i, r, explain)
		next_b.visible = true
	_answering = answer
	for i: int in 4:
		(buttons[i] as Button).pressed.connect(func() -> void: answer.call(i))


func _draw_ring() -> void:
	var c: Vector2 = _ring.size / 2.0
	var lim: float = float(Parlor.c()["answerSeconds"])
	var left: float = maxf(0.0, _deadline - Time.get_ticks_msec() / 1000.0) if _deadline > 0.0 else 0.0
	var f: float = clampf(left / lim, 0.0, 1.0)
	_ring.draw_circle(c, 24.0, Color(Paper.INK, 0.08))
	var col: Color = Paper.RED if f < 0.33 else Paper.INK
	if f > 0.0:
		_ring.draw_arc(c, 22.0, -PI / 2.0, -PI / 2.0 + TAU * f, 48, col, 4.0, true)
	var s: String = str(int(ceil(left)))
	var fnt: Font = Kit.font("cinzel", 800)
	var w: float = fnt.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
	_ring.draw_string(fnt, c + Vector2(-w / 2.0, 7.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, col)


## The answer judged: the right option inked green, a wrong pick red, the
## explanation, the pay (and the streak and points) up top.
func _judge(buttons: Array, chosen: int, r: Dictionary, explain: Label) -> void:
	var right: int = int(r["correctIndex"])
	for i: int in 4:
		var b: Button = buttons[i]
		b.disabled = true
		if i == right:
			b.add_theme_color_override("font_disabled_color", RIGHT)
			b.text = "✓  " + b.text
		elif i == chosen:
			b.add_theme_color_override("font_disabled_color", WRONG)
			b.text = "✗  " + b.text
	if r["correct"]:
		Sound.perfect()
		Rumble.buzz([0, 30, 20, 40])
		explain.text = "Right!  +%d ⟡   ·   %s" % [int(r.get("doubloonsWon", r.get("doubloonsAwarded", 0))), r["explanation"]]
		_stamp("RIGHT", RIGHT)
	else:
		Sound.slack()
		explain.text = ("Out of time.   " if r.get("timedOut", false) else "Not this time.   ") + str(r["explanation"])
		_stamp("MISSED" if not r.get("timedOut", false) else "TOO LATE", WRONG)
	if r.get("rankedUp", false):
		var now: String = str(Parlor.rank_of(float(r["newPoints"]))["rank"]["title"])
		toast(("A new rank: %s. A %s waits in your Trunk." % [now, Skins.kind_def("captain").get("name", "")]) if now == str(Skins.cfg().get("parlorCapstone", "")) else "A new rank: %s" % now)
	_refresh()


## A stamp pressed onto the question card.
func _stamp(word: String, col: Color) -> void:
	if _q_card == null:
		return
	var box: Pane = Kit.pane(_q_card, { "radius": 6, "fill": [Color(0, 0, 0, 0)], "border": [3, Color(col, 0.85)], "pad": [16, 6, 16, 6] })
	box.top_level = true
	var l: Label = Kit.text(box, word, "title", Color(col, 0.9))
	l.add_theme_font_override("font", Kit.font("cinzel", 900))
	l.add_theme_font_size_override("font_size", 26)
	await get_tree().process_frame
	var sz: Vector2 = box.get_combined_minimum_size()
	box.size = sz
	box.pivot_offset = sz / 2.0
	box.global_position = _q_card.get_global_rect().position + Vector2(_q_card.size.x - sz.x - 40.0, 16.0)
	box.rotation = deg_to_rad(-10.0)
	box.scale = Vector2(2.4, 2.4)
	box.modulate.a = 0.0
	var tw: Tween = box.create_tween().set_parallel()
	tw.tween_property(box, "scale", Vector2.ONE, 0.16).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	tw.tween_property(box, "modulate:a", 1.0, 0.1)
	await tw.finished
	Sound.seal(col == RIGHT)


# ── The Pirate King ────────────────────────────────────────────────────────────

func _king_view() -> void:
	var k: Dictionary = _st["king"]
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 22)
	_body.add_child(row)
	# The ladder.
	var ladder: Control = Control.new()
	ladder.custom_minimum_size = Vector2(240, 470)
	var rung: int = int(k["rung"])
	var prizes: Array = k["prizes"]
	var havens: Array = k["havens"]
	ladder.draw.connect(func() -> void:
		var fnt: Font = Kit.font("cinzel", 800)
		var h: float = ladder.size.y / prizes.size()
		ladder.draw_line(Vector2(30, 0), Vector2(30, ladder.size.y), Kit.WOOD_LO, 6.0)
		ladder.draw_line(Vector2(ladder.size.x - 30, 0), Vector2(ladder.size.x - 30, ladder.size.y), Kit.WOOD_LO, 6.0)
		for i: int in prizes.size():
			var y: float = ladder.size.y - (i + 0.5) * h
			var done: bool = i < rung
			var cur: bool = i == rung and k["status"] == "active"
			var haven: bool = havens.has(float(i + 1)) or havens.has(i + 1)
			ladder.draw_line(Vector2(30, y), Vector2(ladder.size.x - 30, y), Kit.WOOD_HI if not cur else Kit.GOLD_HI, 5.0 if cur else 3.0)
			var s: String = "%d ⟡" % int(prizes[i])
			var col: Color = Kit.SAND if cur else (Kit.INK if done else Color(Kit.INK, 0.5))
			var w: float = fnt.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
			ladder.draw_string(fnt, Vector2(ladder.size.x / 2.0 - w / 2.0, y - 6.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, col)
			if haven:
				ladder.draw_string(Kit.font("karla", 700), Vector2(ladder.size.x - 26, y - 6.0), "safe", HORIZONTAL_ALIGNMENT_LEFT, -1, Kit.role_px("label"), Paper.NIGHT_GREEN)
			if done:
				ladder.draw_circle(Vector2(16, y), 6.0, Kit.GOLD_HI))
	row.add_child(ladder)
	var right: VBoxContainer = VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 12)
	row.add_child(right)
	Kit.text(right, "The Pirate King", "title", Kit.INK)
	var status: String = str(k["status"])
	var lines: Dictionary = {
		"active": "Ten questions, easier to harder. Climb as far as you dare: a wrong answer drops you to the last safe rung (4 and 7), or walk away with what you have climbed to. One 50/50 a run. One run a week.",
		"crowned": "Crowned. You climbed all ten this week: %d ⟡. A new ladder on Monday." % int(k["awarded"]),
		"busted": "You fell this week with %d ⟡. A new ladder on Monday." % int(k["awarded"]),
		"walked": "You walked away this week with %d ⟡. A new ladder on Monday." % int(k["awarded"]),
	}
	Kit.text(right, str(lines.get(status, "")), "body", Color(Kit.INK, 0.8), true)
	if status != "active":
		return
	var acts: HBoxContainer = HBoxContainer.new()
	acts.add_theme_constant_override("separation", 10)
	right.add_child(acts)
	var climb: Button = Kit.button("Climb to %d ⟡" % int(prizes[rung]), "primary")
	climb.pressed.connect(func() -> void: _king_rung(right))
	acts.add_child(climb)
	if rung >= 1:
		var walk: Button = Kit.button("Walk away with %d ⟡" % int(prizes[rung - 1]), "secondary")
		walk.pressed.connect(func() -> void:
			var r: Dictionary = await session.act("kingWalk")
			if r.has("error"):
				toast(str(r["error"]), WRONG)
				return
			session.persist()
			Sound.chest(false)
			_refresh()
			_open("king"))
		acts.add_child(walk)
	if k.has("current"):
		_king_rung.call_deferred(right)


func _king_rung(host: VBoxContainer) -> void:
	if _busy:
		return
	_busy = true
	var st: Dictionary = await session.act("kingStart")
	_busy = false
	if st.has("error"):
		toast(str(st["error"]), WRONG)
		return
	session.persist()
	for n: Node in host.get_children():
		n.queue_free()
	var q: Dictionary = st["current"]
	var rung: int = int(_st["king"]["rung"])
	var cat: Dictionary = _cat(str(q.get("category", "LORE")))
	var card: Pane = Kit.pane(host, { "radius": 14, "fill": [Kit.PAPER], "border": [2, Kit.ink(Kit.GOLD)], "shadow": [Color(0, 0, 0, 0.5), 22, Vector2(0, 8)], "pad": [26, 20, 26, 22], "paper": true })
	_q_card = card
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	card.add_child(v)
	var top: HBoxContainer = HBoxContainer.new()
	v.add_child(top)
	var cl: Label = Paper.text(top, "Rung %d   ·   for %d ⟡   ·   %s" % [rung + 1, int(_st["king"]["prizes"][rung]), cat["label"]], "eyebrow", Paper.RED)
	cl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ring = Control.new()
	_ring.custom_minimum_size = Vector2(54, 54)
	_ring.draw.connect(_draw_ring)
	top.add_child(_ring)
	Paper.text(v, str(q["question"]), "title", Paper.INK, true).add_theme_font_size_override("font_size", 22)
	var opts: GridContainer = GridContainer.new()
	opts.columns = 2
	opts.add_theme_constant_override("h_separation", 10)
	opts.add_theme_constant_override("v_separation", 10)
	v.add_child(opts)
	var buttons: Array = []
	for i: int in 4:
		var ob: Button = Kit.button(str(q["options"][i]), "quiet")
		ob.custom_minimum_size = Vector2(300, 52)
		ob.disabled = Js.includes(q["removed"], float(i))
		opts.add_child(ob)
		buttons.append(ob)
	var explain: Label = Paper.text(v, "", "body", Paper.INK_SOFT, true)
	var tools: HBoxContainer = HBoxContainer.new()
	tools.add_theme_constant_override("separation", 10)
	v.add_child(tools)
	var lim: float = float(Parlor.c()["answerSeconds"])
	_deadline = Time.get_ticks_msec() / 1000.0 + maxf(0.0, lim - (Clock.now_ms() - float(st["startedAt"])) / 1000.0)
	if not _st["king"]["fiftyUsed"]:
		var fifty: Button = Kit.button("50/50", "secondary", "small")
		fifty.pressed.connect(func() -> void:
			var r: Dictionary = await session.act("kingFifty")
			if r.has("error"):
				toast(str(r["error"]), WRONG)
				return
			session.persist()
			fifty.disabled = true
			for i: Variant in r["removed"]:
				var bb: Button = buttons[int(i)]
				bb.disabled = true
				bb.create_tween().tween_property(bb, "modulate:a", 0.35, 0.25).set_trans(Tween.TRANS_SINE))
		tools.add_child(fifty)
	var go_on: Button = Kit.button("Onward", "primary")
	go_on.visible = false
	go_on.pressed.connect(func() -> void:
		_refresh()
		_open("king"))
	tools.add_child(go_on)
	var answer: Callable = func(i: int) -> void:
		if _busy:
			return
		_busy = true
		_answering = Callable()
		_deadline = -1.0
		var r: Dictionary = await session.act("kingAnswer", [float(rung), float(i)])
		_busy = false
		if r.has("error"):
			toast(str(r["error"]), WRONG)
			return
		session.persist()
		_judge(buttons, i, r, explain)
		if r["status"] == "crowned":
			Sound.chest(true)
			explain.text = "Crowned!  +1,000 ⟡   ·   " + str(r["explanation"])
		elif r["status"] == "busted":
			explain.text += "   You keep %d ⟡." % int(r["doubloonsAwarded"])
		go_on.visible = true
	_answering = answer
	for i: int in 4:
		(buttons[i] as Button).pressed.connect(func() -> void: answer.call(i))


# ── Spin the Capstan ───────────────────────────────────────────────────────────

func _capstan_view() -> void:
	var cs: Dictionary = _st["capstan"]
	var puzzles: Array = cs["puzzles"]
	if puzzles.is_empty():
		Kit.text(_body, "The capstan is being rigged. Come back soon.", "label", Kit.INK)
		return
	_cap_i = clampi(_cap_i, 0, puzzles.size() - 1)
	var opts: Array = []
	for i: int in puzzles.size():
		var mark: String = {"solved": "  ✓", "failed": "  ✗"}.get((puzzles[i] as Dictionary)["status"], "")
		opts.append([i, "Puzzle %d%s" % [i + 1, mark]])
	Kit.tabs(_body, opts, _cap_i, accent, func(k: Variant) -> void:
		_cap_i = int(k)
		_open("capstan"))
	var p: Dictionary = puzzles[_cap_i]
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	_body.add_child(row)
	_wheel = CapWheel.new()
	_wheel.wedges = cs["wheel"]
	_wheel.custom_minimum_size = Vector2(300, 300)
	row.add_child(_wheel)
	var right: VBoxContainer = VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 12)
	row.add_child(right)
	var head: HBoxContainer = HBoxContainer.new()
	right.add_child(head)
	var cat: Label = Kit.text(head, str(p["category"]), "title", Kit.INK)
	cat.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Kit.text(head, "Bank %d ⟡   ·   strikes %d of %d" % [int(p["bank"]), int(p["strikes"]), int(Parlor.c()["capstanMaxStrikes"])], "label", Kit.SAND)
	# The board of tiles.
	var tiles: HFlowContainer = HFlowContainer.new()
	tiles.add_theme_constant_override("h_separation", 18)
	tiles.add_theme_constant_override("v_separation", 10)
	right.add_child(tiles)
	for word: Array in p["mask"]:
		var wb: HBoxContainer = HBoxContainer.new()
		wb.add_theme_constant_override("separation", 4)
		tiles.add_child(wb)
		for ch: Variant in word:
			var t: Pane = Kit.pane(wb, { "radius": 4, "fill": [Kit.PAPER if ch != null else Kit.PAPER.darkened(0.25)], "border": [1, Color(Kit.PAPER_INK, 0.4)], "pad": 0, "paper": true })
			t.custom_minimum_size = Vector2(36, 46)
			var l: Label = Paper.text(t, str(ch) if ch != null else "", "title", Paper.INK)
			l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			l.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var msg: Label = Kit.text(right, "", "label", Kit.SAND)
	if p["status"] != "active":
		msg.text = ("Solved: %s  ·  +%d ⟡" % [p["phrase"], int(p["earned"])]) if p["status"] == "solved" else "Out of strikes. It was: %s" % p["phrase"]
		return
	var pending: Variant = p["pendingValue"]
	msg.text = ("Call a consonant for %d ⟡ each" % int(pending)) if pending != null else "Spin the capstan, buy a vowel, or solve"
	# The letters.
	var keys: GridContainer = GridContainer.new()
	keys.columns = 13
	keys.add_theme_constant_override("h_separation", 4)
	keys.add_theme_constant_override("v_separation", 4)
	right.add_child(keys)
	for code: int in range(65, 91):
		var L: String = char(code)
		var vowel: bool = L in ["A", "E", "I", "O", "U"]
		var kb: Button = Paper.button(L)
		kb.custom_minimum_size = Vector2(36, 36)
		var used: bool = (p["called"] as Array).has(L)
		kb.disabled = used or (vowel and (pending != null or float(p["bank"]) < float(Parlor.c()["capstanVowelCost"]))) or (not vowel and pending == null)
		kb.pressed.connect(func() -> void: _cap_letter(L, vowel))
		keys.add_child(kb)
	var acts: HBoxContainer = HBoxContainer.new()
	acts.add_theme_constant_override("separation", 10)
	right.add_child(acts)
	var spin: Button = Kit.button("Spin the capstan", "primary")
	spin.disabled = pending != null
	spin.pressed.connect(_cap_spin)
	acts.add_child(spin)
	var guess: LineEdit = LineEdit.new()
	guess.placeholder_text = "Your solve"
	guess.custom_minimum_size = Vector2(240, 44)
	acts.add_child(guess)
	var solve: Button = Kit.button("Solve", "secondary")
	solve.pressed.connect(func() -> void: _cap_solve(guess.text))
	guess.text_submitted.connect(func(t: String) -> void: _cap_solve(t))
	acts.add_child(solve)


func _cap_spin() -> void:
	if _busy:
		return
	_busy = true
	var r: Dictionary = await session.act("capstanSpin", [float(_cap_i)])
	if r.has("error"):
		toast(str(r["error"]), WRONG)
		_busy = false
		return
	session.persist()
	Sound.cast()
	await _wheel.spin_to(int(r["wedgeIndex"]))
	match str(r["outcome"]):
		"overboard":
			toast("Overboard! The round's bank is lost.", WRONG)
			Sound.slack()
		"lose_turn":
			toast("Lose a turn: a strike.", WRONG)
			Sound.slack()
		_:
			Sound.plip()
	_busy = false
	_refresh()
	_open("capstan")


func _cap_letter(L: String, vowel: bool) -> void:
	if _busy:
		return
	_busy = true
	var r: Dictionary = await session.act("capstanVowel" if vowel else "capstanConsonant", [float(_cap_i), L])
	_busy = false
	if r.has("error"):
		toast(str(r["error"]), WRONG)
		return
	session.persist()
	if int(r["count"]) > 0:
		Sound.job_tick(mini(12, int(r["count"]) * 3))
		toast("%d %s%s" % [int(r["count"]), L, ("   +%d ⟡" % int(r["gained"])) if float(r["gained"]) > 0.0 else ""])
	else:
		Sound.slack()
		toast("No %s" % L, WRONG)
	_refresh()
	_open("capstan")


func _cap_solve(guess: String) -> void:
	if _busy or guess.strip_edges() == "":
		return
	_busy = true
	var r: Dictionary = await session.act("capstanSolve", [float(_cap_i), guess])
	_busy = false
	if r.has("error"):
		toast(str(r["error"]), WRONG)
		return
	session.persist()
	if r["correct"]:
		Sound.chest(true)
		Rumble.buzz([0, 40, 30, 60])
	else:
		Sound.slack()
		toast("Not quite: a strike.", WRONG)
	_refresh()
	_open("capstan")


## THE CAPSTAN: sixteen wedges round a wooden drum, values in ink, the two
## hazards in red; it spins down onto the wedge the rules rolled.
class CapWheel:
	extends Control
	var wedges: Array = []
	var angle: float = 0.0

	func spin_to(i: int) -> void:
		var n: int = wedges.size()
		var target: float = -TAU * (float(i) + 0.5) / n
		var start: float = angle
		var end: float = target - TAU * 4.0
		while end > start - TAU * 3.0:
			end -= TAU
		var tw: Tween = create_tween()
		var last: Array = [start]
		tw.tween_method(func(a: float) -> void:
			angle = a
			if absf(a - float(last[0])) > TAU / n:
				last[0] = a
				Sound.xp_tick()
			queue_redraw(), start, end, 2.6).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
		await tw.finished
		angle = fmod(end, TAU)

	func _draw() -> void:
		var c: Vector2 = size / 2.0
		var R: float = minf(size.x, size.y) / 2.0 - 6.0
		var n: int = wedges.size()
		var f: Font = Kit.font("cinzel", 800)
		draw_circle(c + Vector2(0, 6), R, Color(0, 0, 0, 0.35))
		draw_circle(c, R, Kit.WOOD_LO)
		for i: int in n:
			var a0: float = angle + TAU * i / n - PI / 2.0
			var a1: float = a0 + TAU / n
			var pts: PackedVector2Array = PackedVector2Array([c])
			for k: int in 7:
				pts.append(c + Vector2.from_angle(lerpf(a0, a1, k / 6.0)) * (R - 8.0))
			var w: Variant = wedges[i]
			var col: Color = Paper.RED if w is String else (Kit.PAPER if i % 2 == 0 else Kit.PAPER.darkened(0.12))
			draw_colored_polygon(pts, col)
			draw_line(c, c + Vector2.from_angle(a0) * (R - 8.0), Color(0.3, 0.2, 0.1, 0.6), 1.5, true)
			var label: String = ("OVER" if w == "overboard" else "LOSE") if w is String else str(int(w))
			var am: float = (a0 + a1) / 2.0
			draw_set_transform(c + Vector2.from_angle(am) * (R * 0.66), am, Vector2.ONE)
			var tw: float = f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
			draw_string(f, Vector2(-tw / 2.0, 5.0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(0.98, 0.94, 0.85) if w is String else Kit.PAPER_INK)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		draw_circle(c, R * 0.16, Color(0.75, 0.58, 0.28))
		draw_circle(c, R * 0.1, Kit.WOOD_LO)
		# The pointer at the top.
		draw_colored_polygon(PackedVector2Array([c + Vector2(-12, -R - 6), c + Vector2(12, -R - 6), c + Vector2(0, -R + 18)]), Paper.RED)
