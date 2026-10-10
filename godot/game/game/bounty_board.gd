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
## THE shell (Paper.open): scrim, sheet, body.
var _parts: Dictionary = {}
## What the feedback line says after an action (it survives the repaint).
var _flash: String = ""
var _flash_bad: bool = false

const GREEN: Color = Paper.NIGHT_GREEN
const GOLD: Color = Paper.NIGHT_GOLD
## The tiers in words (no colour per tier: the words carry it).
const TIER_NAME: Dictionary = { "easy": "Easy", "medium": "Medium", "hard": "Hard", "elite": "Elite", "crew": "With the crew" }


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE shell every sheet shares (Paper.open): the scrim, the night paper
	# rising in at the wide size, a body column.
	_parts = Paper.open(self, Paper.SHEET_WIDE, true, close)
	_body = _parts["body"]
	_paint()


func close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	Paper.close(self, _parts)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


func _paint() -> void:
	Paper.night = true
	for c: Node in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	var st: Dictionary = RulesApi.run(session.store, session.uid, "bountyState", [])
	# THE shared header (eyebrow and title on the left, "Close  Esc" on the
	# right, the rule), then the feedback line: a claim's word fades in there
	# instead of pushing the board down.
	Paper.header(_body, "Bounties", "The Posting House", close)
	var status: Label = Paper.status_line(_body)
	if _flash != "":
		Paper.say(status, _flash, Paper.NIGHT_RED if _flash_bad else GREEN)
	if not st["unlocked"]:
		Paper.text(_body, str(st["lockReason"]), "body", Paper.ink_soft(), true)
		Paper.text(_body, "Bounties are orders to go and do something out past the Sea Gate: sink a named captain, beat a raid under the clock, take the Gauntlet deep, land a big voyage. Each pays doubloons and bounty points.", "small", Paper.ink_soft(), true)
		Paper.night = false
		return
	var news: Dictionary = st["news"]
	if not news.is_empty():
		var nl: String = ("The bounty board is open: %d order on it. Every chapter you clear adds another." % int(news["orders"])) if news["first"] else ("%s is behind you: the board now posts %d orders." % [news["boss"], int(news["orders"])])
		Paper.text(_body, nl, "body_strong", GOLD, true)
		# Through the session (fire and forget, like Almanac.mark_read), so a
		# Charter crewmate's flag goes to the founder and is not undone by the
		# next save the founder sends.
		session.act("markBountyRungSeen", [float(news["chapter"])])
		session.persist()
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
	Paper.text(top, TIER_NAME[v["tier"]], "eyebrow", Paper.ink_soft())
	Paper.text(c, str(v["desc"]), "small", Paper.ink_soft(), true)
	# THE progress bar (Kit.bar), night-aware on this paper.
	var frac: float = clampf(float(v["progress"]) / maxf(1.0, float(v["target"])), 0.0, 1.0)
	Kit.bar(c, frac, GREEN if frac >= 1.0 else Color(Paper.NIGHT_INK, 0.45))
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
	elif not swap_used and not v.get("crew", false):
		var sw: Pane.PaneButton = Paper.button("Swap")
		sw.tooltip_text = "Swap this order for another of the same tier (one swap a board)"
		sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		sw.pressed.connect(func() -> void:
			var r: Variant = await session.act("rerollBounty", [id])
			session.persist()
			_flash = ""
			_flash_bad = false
			if r is Dictionary and (r as Dictionary).has("error"):
				Sound.slack()
				_flash = str(r["error"])
				_flash_bad = true
			else:
				Sound.plip()
			_paint())
		row.add_child(sw)


func _claim(id: String) -> void:
	var r: Variant = await session.act("claimBounty", [id])
	session.persist()
	_flash_bad = false
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
		if r is Dictionary and (r as Dictionary).has("error"):
			_flash = str(r["error"])
			_flash_bad = true
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
		# The rank in words and its medallion (no colour per rank).
		Paper.text(rv, str(rank["title"]), "heading", Paper.ink())
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
	Kit.bar(v, clampf(pts / maxf(1.0, float(m["points"])), 0.0, 1.0), GOLD)
	if int(st["milestonesReady"]) > 0:
		# The one thing to do here: the wooden plank.
		var b: Pane.PaneButton = Paper.primary("Collect", true)
		b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		b.pressed.connect(func() -> void:
			var r: Variant = await session.act("claimBountyMilestone", [])
			session.persist()
			if r is Dictionary and (r as Dictionary).get("ok") == true:
				Sound.chest(true)
				_flash = "Collected: %s." % r["label"]
				_flash_bad = false
			else:
				Sound.slack()
			_paint())
		v.add_child(b)
	else:
		Paper.text(v, "%s points to go." % Js.thousands(float(m["points"]) - pts), "small", Paper.ink_soft())
