class_name BountyBoard
extends Control
## THE POSTING HOUSE'S BOUNTY BOARD (Godot port of BountiesPanel; core/
## bounties.gd), on the night paper. The orders on this board, each with how
## far along it is, what it pays (doubloons and points) and a Claim when done;
## one swap a board; finish them all and a new board is posted at once. Beside
## them the slow ladder: points, the rank they hold and the next, and the next
## milestone to collect. A rung newly earned is announced once, at the top.

signal closed

var session: Session
var _body: VBoxContainer
var _flash: String = ""

const GREEN: Color = Color(0.5, 0.86, 0.58)
const GOLD: Color = Color(0.94, 0.78, 0.4)
const TIER_NAME: Dictionary = { "easy": "Easy", "medium": "Medium", "hard": "Hard", "elite": "Elite" }
const TIER_COL: Dictionary = { "easy": Color(0.62, 0.78, 0.86), "medium": Color(0.55, 0.82, 0.6), "hard": Color(0.94, 0.7, 0.4), "elite": Color(0.86, 0.55, 0.9) }


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.06, 0.55)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	add_child(shade)
	var sheet: Control = Control.new()
	sheet.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	sheet.offset_left = -560
	sheet.offset_right = 560
	sheet.offset_top = -380
	sheet.offset_bottom = 380
	add_child(sheet)
	Paper.night = true
	Paper.sheet(sheet, 8.0)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 28)
	sheet.add_child(m)
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 10)
	m.add_child(_body)
	Paper.night = false
	_paint()


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


func _paint() -> void:
	Paper.night = true
	for c: Node in _body.get_children():
		c.queue_free()
	var st: Dictionary = RulesApi.run(session.store, session.uid, "bountyState", [])
	var head: HBoxContainer = HBoxContainer.new()
	_body.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.add_theme_constant_override("separation", 0)
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(titles)
	Paper.text(titles, "THE POSTING HOUSE", "eyebrow", Paper.ink_soft())
	Paper.text(titles, "Bounties", "display", Paper.ink())
	var x: Pane.PaneButton = Paper.button("Close  Esc")
	x.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	x.pressed.connect(close)
	head.add_child(x)
	if not st["unlocked"]:
		Paper.text(_body, str(st["lockReason"]), "body", Paper.ink_soft(), true)
		Paper.text(_body, "Bounties are orders to go and do something out past the Sea Gate: sink a named captain, beat a raid under the clock, take the Gauntlet deep, land a big voyage. Each pays doubloons and bounty points.", "small", Paper.ink_soft(), true)
		Paper.night = false
		return
	var news: Dictionary = st["news"]
	if not news.is_empty():
		var nl: String = ("The bounty board is open: %d order on it. Every chapter you clear adds another." % int(news["orders"])) if news["first"] else ("%s is behind you: the board now posts %d orders." % [news["boss"], int(news["orders"])])
		Paper.text(_body, nl, "body_strong", GOLD, true)
		RulesApi.run(session.store, session.uid, "markBountyRungSeen", [float(news["chapter"])])
		session.persist()
	if _flash != "":
		Paper.text(_body, _flash, "body_strong", GREEN, true)
	var cols: HBoxContainer = HBoxContainer.new()
	cols.add_theme_constant_override("separation", 30)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_child(cols)
	var left: VBoxContainer = VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 10)
	cols.add_child(left)
	var rung: Dictionary = st["rung"]
	Paper.text(left, "BOARD %d  ·  CHAPTER %s RUNG  ·  UP TO %s ⟡" % [int(st["board"]), ["I", "II", "III", "IV"][clampi(int(rung["chapter"]) - 1, 0, 3)], Js.thousands(float(rung["pay"]))], "eyebrow", Paper.ink_soft())
	Paper.text(left, "Claim each order when it is done. Finish the board for %d more points, and a new one is posted at once. One swap a board, for an order you cannot attempt." % int(st["sweepPoints"]), "small", Paper.ink_soft(), true)
	for v: Dictionary in st["bounties"]:
		_row(left, v, st["rerollUsed"])
	var nx: Dictionary = st["next"]
	if not nx.is_empty():
		Paper.text(left, "Beat %s and the board posts another order (up to %s ⟡)." % [nx["boss"], Js.thousands(float(nx["pay"]))], "small", Paper.ink_faint(), true)
	_ladder(cols, st)
	Paper.night = false


func _row(parent: Control, v: Dictionary, swap_used: bool) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	parent.add_child(row)
	var c: VBoxContainer = VBoxContainer.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	c.add_theme_constant_override("separation", 2)
	row.add_child(c)
	var done: bool = float(v["progress"]) >= float(v["target"])
	var claimed: bool = v["claimed"]
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	c.add_child(top)
	Paper.text(top, str(v["name"]), "body_strong", Paper.ink() if not claimed else Paper.ink_faint())
	Paper.text(top, TIER_NAME[v["tier"]].to_upper(), "eyebrow", TIER_COL[v["tier"]])
	Paper.text(c, str(v["desc"]), "small", Paper.ink_soft(), true)
	var bar: Control = Control.new()
	bar.custom_minimum_size = Vector2(0, 5)
	var frac: float = clampf(float(v["progress"]) / maxf(1.0, float(v["target"])), 0.0, 1.0)
	bar.draw.connect(func() -> void:
		bar.draw_rect(Rect2(Vector2.ZERO, bar.size), Color(Paper.NIGHT_INK, 0.12))
		bar.draw_rect(Rect2(Vector2.ZERO, Vector2(bar.size.x * frac, bar.size.y)), GREEN if frac >= 1.0 else Color(Paper.NIGHT_INK, 0.45)))
	c.add_child(bar)
	Paper.text(c, "%d of %d  ·  %s ⟡ and %d point%s" % [int(v["progress"]), int(v["target"]), Js.thousands(float(v["pay"])), int(v["points"]), "" if int(v["points"]) == 1 else "s"], "small", Paper.ink_soft())
	var id: String = v["id"]
	if claimed:
		var cl: Label = Paper.text(row, "Paid", "small", Paper.ink_faint())
		cl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	elif done:
		var b: Pane.PaneButton = Paper.button("Claim", true)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void: _claim(id))
		row.add_child(b)
	elif not swap_used:
		var sw: Pane.PaneButton = Paper.button("Swap")
		sw.tooltip_text = "Swap this order for another of the same tier (one swap a board)"
		sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		sw.pressed.connect(func() -> void:
			var r: Variant = await session.act("rerollBounty", [id])
			session.persist()
			if r is Dictionary and (r as Dictionary).has("error"):
				Sound.slack()
			else:
				Sound.plip()
			_flash = ""
			_paint())
		row.add_child(sw)


func _claim(id: String) -> void:
	var r: Variant = await session.act("claimBounty", [id])
	session.persist()
	if r is Dictionary and (r as Dictionary).get("ok") == true:
		Sound.chest(true)
		var d: Dictionary = r
		_flash = "+%s ⟡ and %d point%s." % [Js.thousands(float(d["doubloons"])), int(d["points"]), "" if int(d["points"]) == 1 else "s"]
		if d["sweep"]:
			_flash += " Board finished: a new one is posted."
		if not (d["rankGained"] as Dictionary).is_empty():
			_flash += " You are a %s now." % d["rankGained"]["title"]
	else:
		Sound.slack()
	_paint()


## The slow ladder: points, the rank held, the next milestone.
func _ladder(parent: Control, st: Dictionary) -> void:
	var v: VBoxContainer = VBoxContainer.new()
	v.custom_minimum_size = Vector2(320, 0)
	v.add_theme_constant_override("separation", 8)
	parent.add_child(v)
	var pts: float = float(st["points"])
	Paper.text(v, "BOUNTY POINTS", "eyebrow", Paper.ink_soft())
	Paper.text(v, Js.thousands(pts), "display", Paper.ink())
	var rank: Dictionary = st["rank"]
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	v.add_child(row)
	var em: TextureRect = TextureRect.new()
	em.custom_minimum_size = Vector2(76, 76)
	em.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	em.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	if not rank.is_empty():
		em.texture = Skipper.tex(str(rank["emblem"]).trim_prefix("/"))
	row.add_child(em)
	var rv: VBoxContainer = VBoxContainer.new()
	rv.add_theme_constant_override("separation", 0)
	rv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rv.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(rv)
	if rank.is_empty():
		Paper.text(rv, "No rank yet", "body_strong", Paper.ink_faint())
	else:
		Paper.text(rv, str(rank["title"]), "heading", Color(str(rank["accent"])))
		Paper.text(rv, str(rank["blurb"]), "small", Paper.ink_soft(), true)
	var nr: Dictionary = st["nextRank"]
	if not nr.is_empty():
		Paper.text(v, "%s at %s points. Ranks are a title and a medallion, nothing more." % [nr["title"], Js.thousands(float(nr["points"]))], "small", Paper.ink_faint(), true)
	Paper.rule(v)
	var m: Dictionary = st["nextMilestone"]
	if m.is_empty():
		Paper.text(v, "Every milestone is collected.", "body_strong", GREEN)
		return
	Paper.text(v, "NEXT MILESTONE  ·  %s POINTS" % Js.thousands(float(m["points"])), "eyebrow", Paper.ink_soft())
	Paper.text(v, str(m["label"]), "body_strong", GOLD)
	var bar: Control = Control.new()
	bar.custom_minimum_size = Vector2(0, 6)
	var frac: float = clampf(pts / maxf(1.0, float(m["points"])), 0.0, 1.0)
	bar.draw.connect(func() -> void:
		bar.draw_rect(Rect2(Vector2.ZERO, bar.size), Color(Paper.NIGHT_INK, 0.12))
		bar.draw_rect(Rect2(Vector2.ZERO, Vector2(bar.size.x * frac, bar.size.y)), GOLD))
	v.add_child(bar)
	if int(st["milestonesReady"]) > 0:
		var b: Pane.PaneButton = Paper.button("Collect", true)
		b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		b.pressed.connect(func() -> void:
			var r: Variant = await session.act("claimBountyMilestone", [])
			session.persist()
			if r is Dictionary and (r as Dictionary).get("ok") == true:
				Sound.chest(true)
				_flash = "Collected: %s." % r["label"]
			else:
				Sound.slack()
			_paint())
		v.add_child(b)
	else:
		Paper.text(v, "%s points to go." % Js.thousands(float(m["points"]) - pts), "small", Paper.ink_soft())
