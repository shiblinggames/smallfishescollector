class_name CrewHall
extends Control
## THE CREW HALL (Godot port, crew slice 1; the web's HallSheet and the
## Recruit and Roster rooms of CrewHub, on paper). Opened by mooring at the
## Crew Hall in the anchorage. One sheet: the rooms down the left (Recruit,
## Roster, The Hall), a grid of portrait cards, and the chosen hand on the
## right, painting first (Kong, 2026-09-24: "crew cards are art first").
##   RECRUIT  A PULL SCREEN (Kong, 2026-10-10; game/crew_pull.gd): the board
##            large across the top, on the notice it came from, with the
##            countdown to the free board at sunrise; the notices under it as
##            pull tickets (the stack held, the odds in one line). Posting one
##            tears the board down, slams the notice up and turns three sealed
##            cards, each seal glowing its rarity first (a legendary last, in a
##            column of gold); a press skips to the end. A card opens the
##            recruit; Sign on (under the card, or in the hand) takes them
##            aboard with a moment and an ABOARD stamp.
##   ROSTER   your crew, highest level first; the sheet names them (once) or
##            dismisses them.
##   THE HALL the building: its tier and painting, roster space, and the next
##            tier with its price and gate.
##   THE TRUNK every crew skin (Kong, 2026-10-03), by crew, the ones not found
##            yet in grey; skin vouchers (Bosun's, Captain's) opened here; a skin
##            owned is worn from here or from the roster card's skin row.
##   THE BOOK every crewmate in the game (Kong, 2026-10-10): the ones met on a
##            board or aboard in their painting, the rest as dark shapes with
##            "?", a tick on each ever signed; "Met 23 of 41".
## THE RECRUIT ROOM, DEEPER (Kong, 2026-10-10): the tickets say how near the
## bad-luck guarantee is; with three or more notices held, Post all posts
## them one board at a time (Next board between, signing as you go); a face
## shows NEW, its line, its trait stamp and, on hover or focus, how it stacks
## against your best hand of its class; signing onto a full roster asks, right
## there, who to let go (weakest first).
## Every change is Crew.*, through the rules (core/crew.gd).

signal closed

const RARITY_NAMES: Array = ["Common", "Rare", "Epic", "Legendary"]


## A crew rarity (1-4: Common, Rare, Epic, Legendary) in THE rarity table
## (Kit.RARITY; crew skip "uncommon", so they key in by name).
static func rarity_color(rar: int) -> Color:
	return Kit.rarity(String(RARITY_NAMES[clampi(rar, 1, 4) - 1]))

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
var _status: Label
var _parts: Dictionary = {}
## Where each room's list was scrolled to (a redraw keeps it).
var _keep: Dictionary = {}
var _busy: bool = false
## THE RECRUIT ROOM AS A PULL (game/crew_pull.gd): the board on show, the
## countdown on it, a reveal waiting ("pull" after a notice is posted), a
## reveal running, the card to stamp ABOARD, the "?" open.
const Pull = preload("res://game/crew_pull.gd")
var _stage: Pull.Stage
var _count_label: Label
var _next_board_at: float = 0.0
var _reveal_mode: String = ""
var _pulling: bool = false
var _stamp_id: Variant = null
var _help_open: bool = false
## POST ALL: the notices still to post after the board on show, and how many
## the run started with (for "board 2 of 5").
var _queue: Array = []
var _queue_total: int = 0
var _next_btn: Pane.PaneButton
## ROSTER FULL: the chooser of who to let go, while it is open.
var _release: Control
## The board each captain last saw, by uid: a free board that came in since
## plays the light reveal (for the life of the game; a fresh start just shows it).
static var _seen_boards: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE shell every sheet shares (Paper.open), centred, on the expedition
	# side's night paper: dark, cream ink, CHOSEN for what is chosen.
	_parts = Paper.open(self, Paper.SHEET_WIDE, true, close, 28)
	var col: VBoxContainer = _parts["body"]
	Paper.night = true
	# THE shared header: the title (and the roster line under it), Close on the
	# right, the rooms as tabs on their own row, the rule.
	var head: Dictionary = Paper.header(col, "The Crew Hall", "", close)
	_head_note = Paper.text(head["titles"] as VBoxContainer, "", "note", Paper.ink_soft())
	_tabs = head["tabs"]
	_tabs.visible = true
	_status = Paper.status_line(col)
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
	Paper.night = false
	_load()


func close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	Paper.close(self, _parts)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		if _release != null and is_instance_valid(_release):
			_close_release()
			return
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


## A refusal (or, good, a plain word): on the status line under the header,
## so nothing below it moves.
func _note(text: String, good: bool = false) -> void:
	Paper.say(_status, text, Paper.NIGHT_GREEN if good else Paper.NIGHT_RED)


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
		_tabs.remove_child(c)
		c.queue_free()
	var board_open: int = Js.list(_state.get("board")).filter(func(b: Dictionary) -> bool: return b["recruited"] != true).size()
	if room in ["hall", "bunks"] and not at_hall:
		room = "recruit"
	var rooms: Array = [["recruit", "Recruit%s" % ("  %d" % board_open if board_open > 0 else "")], ["roster", "Roster  %d" % Js.list(_state.get("roster")).size()]]
	if at_hall:
		rooms.append(["hall", "The Hall"])
		var ready_n: int = 0
		var waiting_n: int = 0
		for k: String in Js.obj(_state.get("bunkTerms")):
			var tm: Dictionary = _state["bunkTerms"][k]
			if Bunks.stint_done(tm["since"], Clock.now_ms(), float(tm["cap"])):
				ready_n += 1
		for m: Dictionary in Js.list(_state.get("roster")):
			if m.get("pendingTrait") != null:
				waiting_n += 1
		rooms.append(["bunks", "Bunks%s" % ("  ·  %d ready" % (ready_n + waiting_n) if ready_n + waiting_n > 0 else "")])
	var waiting: int = 0
	for kv: Variant in Js.obj(_skins.get("vouchers")):
		waiting += int(Js.num(_skins["vouchers"][kv]))
	rooms.append(["trunk", "The Trunk  %d/%d%s" % [Js.list(_skins.get("owned")).size(), int(Js.num(_skins.get("total"))), ("  ·  %d to open" % waiting) if waiting > 0 else ""]])
	if _state.has("crewSeen"):
		rooms.append(["book", "The Book  %d/%d" % [_book_met(), book_cards().size()]])
	for o: Array in rooms:
		# Only the room shown is the chosen tab; vouchers waiting in the Trunk
		# are a dot beside its count, not a second chosen tab.
		var b: Pane.PaneButton = Paper.tab(o[1], o[0] == room, true)
		if o[0] == "trunk" and waiting > 0 and room != "trunk":
			notice_dot(b)
		b.pressed.connect(func() -> void:
			if room == o[0]:
				return
			room = o[0]
			_pick = {}
			_pick_kind = ""
			_draw_room())
		_tabs.add_child(b)
	# A redraw keeps the room's list where it was.
	for sc: Node in _body.find_children("", "ScrollContainer", true, false):
		_keep[_body.get_meta("room", "")] = (sc as ScrollContainer).scroll_vertical
		break
	_body.set_meta("room", room)
	for c: Node in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	match room:
		"recruit":
			_recruit_room()
		"roster":
			_roster_room()
		"trunk":
			_trunk_room()
		"book":
			_book_room()
		"bunks":
			var hb: HallBunks = HallBunks.new()
			hb.hall = self
			hb.size_flags_vertical = Control.SIZE_EXPAND_FILL
			_body.add_child(hb)
		_:
			_hall_room()
	for sc: Node in _body.find_children("", "ScrollContainer", true, false):
		UiTheme.night_scroll(sc as ScrollContainer)
		(sc as ScrollContainer).set_deferred("scroll_vertical", int(_keep.get(room, 0)))
		break
	_draw_detail()


## Something waiting behind a tab: a small CHOSEN dot at its top right.
## Public: the Chart Room's tabs wear the same dot.
static func notice_dot(b: Control) -> void:
	var d: Control = Control.new()
	d.mouse_filter = Control.MOUSE_FILTER_IGNORE
	d.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	d.draw.connect(func() -> void: d.draw_circle(Vector2(d.size.x - 5.0, 7.0), 3.0, Paper.CHOSEN))
	b.add_child(d)


## THE ART TILE'S FEEL (Paper.Tile's): the art swells a little under the
## pointer or the pad's focus, a press squeezes (Kit.tap), and a pad can reach
## it (its focus ring: CHOSEN on the night paper; pass the inked gold, Kit.ink
## (Kit.GOLD), on the day's).
static func art_hover(b: Button, pic: Control, ring: Color = Paper.CHOSEN) -> void:
	b.focus_mode = Control.FOCUS_ALL
	b.add_theme_stylebox_override("focus", UiTheme.focus_ring(Kit.R_SMALL, ring))
	var grow: Callable = func(on: bool) -> void:
		if not is_instance_valid(pic) or (on and b.disabled):
			return
		pic.pivot_offset = pic.size / 2.0
		Motion.ease_rise(pic.create_tween(), pic, "scale", Vector2.ONE * (1.06 if on else 1.0), 0.15)
	b.mouse_entered.connect(func() -> void: grow.call(true))
	b.mouse_exited.connect(func() -> void: grow.call(false))
	b.focus_entered.connect(func() -> void: grow.call(true))
	b.focus_exited.connect(func() -> void: grow.call(false))
	Kit.tap(b)


## THE INKED RING (Paper.ring) round the chosen art, filling `holder`.
static func ring_over(holder: Control) -> void:
	var r: Control = Control.new()
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	r.draw.connect(func() -> void: Paper.ring(r, r.size / 2.0, r.size * Vector2(0.48, 0.5)))
	holder.add_child(r)


## THE RECRUIT ROOM AS A PULL (Kong, 2026-10-10): the board large across the
## top (Pull.Stage: the notice it came from, the countdown to the free board,
## three cards, a Sign on under each), the notices as pull tickets under it.
func _recruit_room() -> void:
	var board: Array = Js.list(_state.get("board"))
	var src: String = str((board[0] as Dictionary).get("source", "free")) if not board.is_empty() else "free"
	var defs: Dictionary = Crew.notice_defs()
	var title: String = str(Js.obj(defs.get(src)).get("name", "Tavern Notice")) if src != "free" else "Tavern Notice"
	_stage = Pull.Stage.new(title)
	_body.add_child(_stage)
	_count_label = _stage.countdown
	var every: float = Js.num(Crew.port().get("boardEveryMs"))
	_next_board_at = 0.0
	if every > 0.0:
		var off: float = Js.num(Crew.port().get("boardOffsetMs"))
		_next_board_at = off + (floor((Clock.now_ms() - off) / every) + 1.0) * every
	_tick_countdown()
	for c: Dictionary in board:
		var cd: Pull.Card = Pull.Card.new(c, _thumb(str(c.get("filename", ""))))
		cd.dress(c.get("isNew") == true, Crew.quip(str(c.get("slug", ""))), _compare(c))
		if _pick.get("id") == c.get("id") and _pick_kind == "board":
			ring_over(cd.holder)
		art_hover(cd, cd.holder)
		cd.pressed.connect(func() -> void:
			_pick = c
			_pick_kind = "board"
			Rumble.tap(8)
			_draw_room())
		var sign: Pane.PaneButton = null
		if c.get("recruited") != true:
			sign = Paper.button("Sign on", false, true)
			sign.pressed.connect(func() -> void: _sign(c))
		_stage.add_card(cd, sign)
		if _stamp_id != null and c.get("id") == _stamp_id:
			cd.stamp = -1.0
			cd.stamp_on.call_deferred()
	_stamp_id = null
	# THE REVEAL: a notice just posted plays the pull; a free board the
	# captain has not seen yet (it came in at sunrise, the room open or shut)
	# plays the light version; anything else is simply there.
	var ids: String = ",".join(PackedStringArray(board.map(func(c: Dictionary) -> String: return str(c.get("id")))))
	var uid: String = str(session.uid)
	var mode: String = _reveal_mode
	if mode == "" and _seen_boards.has(uid) and _seen_boards[uid] != ids and not board.is_empty():
		mode = "light"
	_seen_boards[uid] = ids
	_reveal_mode = ""
	if mode != "":
		_pulling = true
		_stage.finished.connect(func() -> void:
			_pulling = false
			_after_reveal())
		_stage.run.call_deferred(mode)
	_post_all_bar()
	_notices_row()


## The board has turned: a full roster is said now (signing will ask who to
## let go), and a Post all run puts the pad on Next board.
func _after_reveal() -> void:
	if _roster_full():
		_note("Your roster is full (%d of %d). Sign someone on and you choose who to let go." % [Js.list(_state.get("roster")).size(), int(Js.num(_state.get("capacity")))])
	if _next_btn != null and is_instance_valid(_next_btn):
		_next_btn.grab_focus()


func _roster_full() -> bool:
	return Js.list(_state.get("roster")).size() >= int(Js.num(_state.get("capacity")))


## HOW A RECRUIT STACKS UP: against your best hand of the same class (the
## most Power, Dodge and Fortune together, as they would sail today), stat by
## stat as this recruit would sign on. "+2 Power, -1 Dodge" over "vs your best
## Snare (Ell, Lv 12)"; "Your first Snare" when there is none aboard.
func _compare(c: Dictionary) -> String:
	var slug: String = str(c.get("slug", ""))
	var cls: Dictionary = Crew.class_of(slug)
	if cls.is_empty():
		return ""
	var by: Dictionary = Js.obj(Crew.t().get("classBySlug"))
	var want: Variant = by.get(slug)
	var best: Dictionary = {}
	var best_st: Dictionary = {}
	var best_sum: float = -1.0
	for m: Dictionary in Js.list(_state.get("roster")):
		if by.get(str(m.get("slug", ""))) != want:
			continue
		var st: Dictionary = Crew.leveled_stats(m)
		var sum: float = float(st["power"]) + float(st["dodge"]) + float(st["fortune"])
		if sum > best_sum:
			best = m
			best_st = st
			best_sum = sum
	if best.is_empty():
		return "Your first %s" % cls["name"]
	var mine: Dictionary = Crew.leveled_stats({ "power": c.get("power"), "dodge": c.get("dodge"), "fortune": c.get("fortune"), "xp": c.get("startXp", 0.0), "effects": Js.list(c.get("effects")) })
	var bits: Array = []
	for s2: Array in [["power", "Power"], ["dodge", "Dodge"], ["fortune", "Fortune"]]:
		var d: int = int(float(mine[s2[0]]) - float(best_st[s2[0]]))
		if d != 0:
			bits.append("%+d %s" % [d, s2[1]])
	var who: String = "your best %s: %s, Lv %d" % [cls["name"], best.get("name", ""), Crew.level(Js.num(best.get("xp")))]
	if bits.is_empty():
		return "Level with %s" % who
	return "%s\nvs %s" % [", ".join(PackedStringArray(bits)), who]


## POST ALL, while a run is on: which board this is, Next board, Stop.
func _post_all_bar() -> void:
	_next_btn = null
	if _queue.is_empty():
		return
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_body.add_child(row)
	var l: Label = Paper.text(row, "Posting all  ·  board %d of %d" % [_queue_total - _queue.size(), _queue_total], "body_strong", Paper.ink())
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var nb: Pane.PaneButton = Paper.primary("Next board  ·  %d left" % _queue.size(), true)
	nb.pressed.connect(func() -> void:
		if _pulling or _busy or _queue.is_empty():
			return
		_pull(str(_queue.pop_front())))
	row.add_child(nb)
	_next_btn = nb
	var stop: Pane.PaneButton = Paper.button("Stop here", false, true)
	stop.pressed.connect(func() -> void:
		_queue = []
		_queue_total = 0
		_draw_room())
	row.add_child(stop)


## Every notice held, in the order the rules list them, one board after
## another (the rules are unchanged: each is one postNotice).
func _post_all() -> void:
	if _pulling or _busy:
		return
	var held: Dictionary = Js.obj(_state.get("notices"))
	var q: Array = []
	for id: Variant in Crew.notice_defs():
		for i: int in int(Js.num(held.get(id))):
			q.append(str(id))
	if q.is_empty():
		return
	_queue_total = q.size()
	var first: String = q.pop_front()
	_queue = q
	_pull(first)


## The countdown to the free board, on the sea's clock.
func _tick_countdown() -> void:
	if _count_label == null or not is_instance_valid(_count_label):
		return
	if _next_board_at <= 0.0:
		_count_label.text = "A free board each day"
		return
	_count_label.text = "Free board at sunrise  ·  %s" % Pull.sea_left(_next_board_at - Clock.now_ms(), Js.num(Crew.port().get("boardEveryMs")))


func _process(_delta: float) -> void:
	if _count_label == null or not is_instance_valid(_count_label) or room != "recruit":
		return
	_tick_countdown()
	# Sunrise with the room open: the rules fill the fresh free board on the
	# next read, and the room shows it coming in.
	if _next_board_at > 0.0 and Clock.now_ms() >= _next_board_at and not _busy and not _pulling:
		_next_board_at = 0.0
		_load()


## A press or a key during the reveal turns every card left at once.
func _input(event: InputEvent) -> void:
	if _stage == null or not is_instance_valid(_stage) or not _stage.revealing or not _pulling:
		return
	var press: bool = false
	if event is InputEventMouseButton:
		press = (event as InputEventMouseButton).pressed
	elif event is InputEventKey:
		press = (event as InputEventKey).pressed and not (event as InputEventKey).echo
	elif event is InputEventJoypadButton:
		press = (event as InputEventJoypadButton).pressed
	if press:
		get_viewport().set_input_as_handled()
		_stage.skip()


## POST A NOTICE (port rules, core/crew.gd): each notice a ticket to pull,
## with the stack held and its odds in one line worked from its weights; the
## long explanation behind the "?" (open and shut in place).
func _notices_row() -> void:
	var defs: Dictionary = Crew.notice_defs()
	if defs.is_empty():
		return
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	_body.add_child(head)
	var eb: Label = Paper.text(head, "Post a notice for a fresh board", "eyebrow", Paper.ink_soft())
	eb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var q: Pane.PaneButton = Paper.button("?", _help_open, true)
	q.custom_minimum_size = Vector2(28, 26)
	q.tooltip_text = "How notices work"
	head.add_child(q)
	var free_w: Array = Js.list(Crew.port().get("freeWeights", Crew.t()["freeWeights"]))
	var faces: int = int(Crew.t()["dailyRecruits"])
	var help: Label = Paper.text(_body, "The free board each sunrise is the Tavern Notice (%s). Posting a notice spends one and replaces the board standing with three fresh recruits at that notice's odds; a Legendary only answers a posted notice. Notices are found in treasure-hunt caskets, fishing crates and voyages.%s" % [Pull.odds_line(free_w, faces).to_lower(), (" After %d posted boards in a row without an Epic or better, the next posted board is sure of one." % Crew.pity_after()) if Crew.pity_after() > 0 else ""], "note", Paper.ink_soft(), true)
	help.visible = _help_open
	q.pressed.connect(func() -> void:
		_help_open = not _help_open
		help.visible = _help_open
		var s2: Array = Paper._button_specs(_help_open, true)
		q.restyle(s2[0], s2[1])
		Paper._button_ink(q, _help_open, true))
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	_body.add_child(row)
	var held: Dictionary = Js.obj(_state.get("notices"))
	var pity: String = Pull.pity_words(Js.obj(_state.get("pity")))
	var total: int = 0
	for id: Variant in defs:
		var d: Dictionary = defs[id]
		var n: int = int(Js.num(held.get(id)))
		total += maxi(0, n)
		var tk: Pull.Ticket = Pull.Ticket.new("Post a %s" % d["name"], Pull.odds_line(Js.list(d.get("weights")), faces), n, Pull.found_in(str(id)), pity)
		tk.pressed.connect(func() -> void:
			_queue = []
			_queue_total = 0
			_pull(str(id)))
		row.add_child(tk)
	# POST ALL: three or more held, and no run already on.
	if total >= 3 and _queue.is_empty():
		var pa: Pane.PaneButton = Paper.button("Post all  ·  %d" % total, false, true)
		pa.tooltip_text = "Post every notice held, one board at a time"
		pa.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		pa.pressed.connect(_post_all)
		head.add_child(pa)


## THE PULL: the board standing is torn down while the notice posts; the
## fresh board comes in sealed and turns (Pull.Stage.run). The rules' board
## is the board shown. before_reveal is for tests/shot.gd and the trailer only
## (to set the board up for a picture before it is shown).
func _pull(id: String, before_reveal: Callable = Callable()) -> void:
	if _pulling or _busy:
		return
	_pulling = true
	_pick = {}
	_pick_kind = ""
	var tear: Tween = _stage.tear_down() if _stage != null and is_instance_valid(_stage) else null
	var r: Dictionary = await _act("postNotice", [id])
	if tear != null and tear.is_running():
		await tear.finished
	if not r.has("state"):
		_pulling = false
		_draw_room()
		return
	Rumble.buzz([0, 30, 30, 60])
	if before_reveal.is_valid():
		await before_reveal.call()
		var s: Variant = await session.act("getCrewState")
		if s is Dictionary:
			_state = s
	_reveal_mode = "pull"
	_draw_room()


## SIGN ON (from the card or the chosen hand): the rules sign them, the
## moment plays, and their card takes an ABOARD stamp.
func _sign(c: Dictionary) -> void:
	if _pulling or _busy:
		return
	# A full roster: choose who to let go, right here, then sign.
	if _roster_full():
		_open_release(c)
		return
	var r: Dictionary = await _act("recruitCrew", [c["id"]])
	if str(r.get("error", "")) == "Roster full":
		_open_release(c)
		return
	if r.has("state"):
		_sign_on_moment(str(c.get("name", "")), rarity_color(clampi(int(Js.num(c.get("rarity"))), 1, 4)))
		_stamp_id = c["id"]
		_pick = {}
	_draw_room()


# ── Roster full: who to let go ─────────────────────────────────────────────────

## THE CHOOSER (Kong, 2026-10-10): the roster, weakest first (level, then
## rarity, then their stats together), each with Release (the dismiss rule,
## pressed twice to be sure); releasing one signs the recruit waiting.
func _open_release(c: Dictionary) -> void:
	_close_release()
	Paper.night = true
	var layer: Control = Control.new()
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.mouse_filter = Control.MOUSE_FILTER_STOP
	layer.draw.connect(func() -> void: layer.draw_rect(Rect2(Vector2.ZERO, layer.size), Color(0, 0, 0, 0.5)))
	layer.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
			_close_release())
	add_child(layer)
	_release = layer
	var cc: CenterContainer = CenterContainer.new()
	cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(cc)
	var pane: Pane = Kit.pane(null, { "radius": Kit.R_LARGE, "fill": [Paper.NIGHT_PAPER_HI], "border": [1, Paper.NIGHT_HAIR], "pad": [20, 16, 20, 16], "keep": true, "night": true })
	pane.custom_minimum_size = Vector2(700, 0)
	pane.mouse_filter = Control.MOUSE_FILTER_STOP
	cc.add_child(pane)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	pane.add_child(v)
	Paper.text(v, "THE ROSTER IS FULL", "eyebrow", Paper.ink_soft())
	Paper.text(v, "Let someone go to sign %s" % str(c.get("name", "")), "title", Paper.ink())
	Paper.text(v, "Releasing a crewmate is for good. Weakest first.", "note", Paper.ink_soft(), true)
	var said: Label = Paper.text(v, "", "small", Paper.NIGHT_RED, true)
	said.visible = false
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 340)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(scroll)
	UiTheme.night_scroll(scroll)
	var list: VBoxContainer = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 4)
	scroll.add_child(list)
	var roster: Array = Js.list(_state.get("roster")).duplicate()
	roster.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var la: int = Crew.level(Js.num(a.get("xp")))
		var lb: int = Crew.level(Js.num(b.get("xp")))
		if la != lb:
			return la < lb
		if float(a["rarity"]) != float(b["rarity"]):
			return float(a["rarity"]) < float(b["rarity"])
		return Js.num(a.get("power")) + Js.num(a.get("dodge")) + Js.num(a.get("fortune")) < Js.num(b.get("power")) + Js.num(b.get("dodge")) + Js.num(b.get("fortune")))
	var first: Control = null
	for m: Dictionary in roster:
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		list.add_child(row)
		var pic: TextureRect = TextureRect.new()
		pic.texture = _thumb(str(m.get("filename", "")))
		pic.custom_minimum_size = Vector2(48, 48)
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		row.add_child(pic)
		var t: VBoxContainer = VBoxContainer.new()
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.alignment = BoxContainer.ALIGNMENT_CENTER
		t.add_theme_constant_override("separation", 0)
		row.add_child(t)
		var rar: int = clampi(int(Js.num(m.get("rarity"))), 1, 4)
		var cls: Dictionary = Crew.class_of(str(m.get("slug", "")))
		var nl: Label = Paper.text(t, str(m.get("name", "")), "body_strong", Paper.ink())
		nl.clip_text = true
		var st: Dictionary = Crew.leveled_stats(m)
		var sub: Label = Paper.text(t, "Lv %d  ·  %s%s  ·  Power %d, Dodge %d, Fortune %d" % [Crew.level(Js.num(m.get("xp"))), RARITY_NAMES[rar - 1], ("  ·  " + str(cls["name"])) if not cls.is_empty() else "", int(st["power"]), int(st["dodge"]), int(st["fortune"])], "small", Paper.ink_soft())
		sub.clip_text = true
		sub.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		var b: Pane.PaneButton = Paper.button("Release", false, true)
		b.custom_minimum_size = Vector2(140, 0)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void:
			if b.get_meta("armed", false) != true:
				b.set_meta("armed", true)
				b.text = "For good? Again"
				return
			_release_and_sign(m, c, said))
		row.add_child(b)
		if first == null:
			first = b
	var keep: Pane.PaneButton = Paper.button("Keep everyone", false, true)
	keep.size_flags_horizontal = Control.SIZE_SHRINK_END
	keep.pressed.connect(_close_release)
	v.add_child(keep)
	Paper.night = false
	Motion.panel_in(pane)
	if first != null:
		first.grab_focus.call_deferred()


func _close_release() -> void:
	if _release != null and is_instance_valid(_release):
		_release.queue_free()
	_release = null


## Release one (the rules' dismiss, which refuses a hand at sea, on a trawl
## or in a bunk), then sign the recruit waiting.
func _release_and_sign(m: Dictionary, c: Dictionary, said: Label) -> void:
	if _busy:
		return
	var r: Dictionary = await _act("dismissCrew", [m["id"]])
	if r.has("error"):
		said.text = str(r["error"])
		said.visible = true
		return
	_close_release()
	if _pick_kind == "roster" and _pick.get("id") == m.get("id"):
		_pick = {}
	_note("%s has gone ashore." % str(m.get("name", "")), true)
	_sign(c)


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
	Paper.text(v, str(def["name"]), "title", Paper.ink())
	Paper.text(v, str(def["flavor"]), "note", Paper.ink_soft(), true)
	var cap: Dictionary = Rules.data()["crew"]["capacity"]
	Paper.stat(v, "Roster", "%d of %d" % [Js.list(_state.get("roster")).size(), int(Js.num(_state.get("capacity")))])
	Paper.stat(v, "From the hall", "+%d" % ((tier - 1) * int(cap["perHallTier"])))
	Paper.stat(v, "From your level (%d)" % int(Js.num(_state.get("navLevel"))), "+%d, one every %d levels" % [int(floor(Js.num(_state.get("navLevel")) / float(cap["perLevels"]))), int(cap["perLevels"])])
	Paper.stat(v, "Bunks", "%d (see the Bunks room)" % int(def["bunks"]))
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
	var b: Pane.PaneButton = Paper.primary("Build the %s  ·  %s ⟡" % [nxt["name"], Js.thousands(float(nxt["cost"]))], true)
	b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	b.disabled = not ok
	b.pressed.connect(func() -> void:
		var r: Dictionary = await _act("upgradeCrewHall", [])
		if r.has("state"):
			Sound.chest(true)
			Rumble.buzz([0, 40, 30, 60])
		_draw_room())
	_body.add_child(b)


# ── The Book ───────────────────────────────────────────────────────────────────

## Every crewmate in the game: the crew species (content/cards.json) the rules
## give a rarity, by rarity then name.
static func book_cards() -> Array:
	var out: Array = Crew.cards().filter(func(cd: Dictionary) -> bool: return Crew.group_for(str(cd.get("slug", ""))) > 0)
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var ga: int = Crew.group_for(str(a["slug"]))
		var gb: int = Crew.group_for(str(b["slug"]))
		if ga != gb:
			return ga < gb
		return Crew.display_name(str(a["slug"]), str(a["name"])) < Crew.display_name(str(b["slug"]), str(b["name"])))
	return out


func _book_met() -> int:
	var seen: Array = Js.list(_state.get("crewSeen"))
	return book_cards().filter(func(cd: Dictionary) -> bool: return seen.has(float(cd["id"]))).size()


## A crewmate as the book holds them (the hand's fields the detail reads).
func _book_entry(cd: Dictionary) -> Dictionary:
	var slug: String = str(cd["slug"]).to_lower()
	return {
		"cardId": float(cd["id"]), "slug": slug, "name": Crew.display_name(slug, str(cd["name"])), "filename": str(cd.get("filename", "")),
		"rarity": float(Crew.group_for(slug)), "met": Js.list(_state.get("crewSeen")).has(float(cd["id"])),
		"signed": Js.list(_state.get("crewSigned")).has(float(cd["id"])),
	}


## THE BOOK (Kong, 2026-10-10): the count, then every crewmate as a tile.
func _book_room() -> void:
	var all: Array = book_cards()
	var signed_n: int = all.filter(func(cd: Dictionary) -> bool: return Js.list(_state.get("crewSigned")).has(float(cd["id"]))).size()
	Paper.text(_body, "Met %d of %d  ·  Signed %d" % [_book_met(), all.size(), signed_n], "heading", Paper.ink())
	Paper.text(_body, "Every crewmate a board has shown you, or who has sailed with you. A tick marks the ones you have signed.", "note", Paper.ink_soft(), true)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var flow: HFlowContainer = HFlowContainer.new()
	flow.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	flow.add_theme_constant_override("h_separation", 8)
	flow.add_theme_constant_override("v_separation", 10)
	scroll.add_child(flow)
	for cd: Dictionary in all:
		flow.add_child(_book_tile(_book_entry(cd)))


## A tile: met, the painting on its rarity's glow (never a coloured edge), the
## name, rarity and class; never met, the painting as a flat dark shape and
## "?". A tick at the corner for one signed ever.
func _book_tile(e: Dictionary) -> Control:
	var met: bool = e["met"] == true
	var rar: int = clampi(int(e["rarity"]), 1, 4)
	var rc: Color = rarity_color(rar)
	var b: Button = Button.new()
	b.flat = true
	b.custom_minimum_size = Vector2(134, 172)
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.add_theme_constant_override("separation", 1)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(v)
	var holder: Control = Control.new()
	holder.custom_minimum_size = Vector2(0, 124)
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(holder)
	if met:
		Paper.blot(holder, rc, 0.7)
	var pic: TextureRect = TextureRect.new()
	pic.texture = _thumb(str(e["filename"]))
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not met:
		# A flat dark shape: the painting multiplied to near black.
		pic.modulate = Color(0.055, 0.045, 0.04, 0.95)
	holder.add_child(pic)
	if e["signed"] == true:
		var tick: Control = Control.new()
		tick.mouse_filter = Control.MOUSE_FILTER_IGNORE
		tick.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		tick.draw.connect(func() -> void:
			var at: Vector2 = Vector2(tick.size.x - 16, 14)
			tick.draw_circle(at, 9.0, Color(0.1, 0.085, 0.07, 0.85))
			tick.draw_arc(at, 9.0, 0.0, TAU, 24, Color(Paper.CHOSEN, 0.9), 1.4, true)
			tick.draw_polyline(PackedVector2Array([at + Vector2(-4, 0), at + Vector2(-1, 3.5), at + Vector2(4.5, -3.5)]), Paper.CHOSEN, 2.0, true))
		holder.add_child(tick)
	if _pick_kind == "book" and _pick.get("cardId") == e["cardId"]:
		ring_over(holder)
	art_hover(b, pic)
	var n: Label = Paper.text(v, str(e["name"]) if met else "?", "name", Paper.ink() if met else Paper.ink_faint())
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	n.clip_text = true
	n.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var cls: Dictionary = Crew.class_of(str(e["slug"]))
	var sub: Label = Paper.text(v, ("%s  ·  %s" % [RARITY_NAMES[rar - 1], cls.get("name", "")]) if met else RARITY_NAMES[rar - 1], "small", rc.lightened(0.15) if met else Paper.ink_faint())
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.clip_text = true
	sub.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	b.pressed.connect(func() -> void:
		_pick = e
		_pick_kind = "book"
		Rumble.tap(8)
		_draw_room())
	return b


func _book_detail() -> void:
	var e: Dictionary = _pick
	var met: bool = e["met"] == true
	var rar: int = clampi(int(e["rarity"]), 1, 4)
	var rc: Color = rarity_color(rar)
	var holder: Control = Control.new()
	holder.custom_minimum_size = Vector2(360, 250)
	_detail.add_child(holder)
	if met:
		Paper.blot(holder, rc, 0.9)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex("card-arts/%s.webp" % str(e["filename"]).get_basename())
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if not met:
		pic.modulate = Color(0.055, 0.045, 0.04, 0.95)
	holder.add_child(pic)
	var cls: Dictionary = Crew.class_of(str(e["slug"]))
	if not met:
		Paper.text(_detail, "Not met yet", "title", Paper.ink_soft())
		Paper.text(_detail, RARITY_NAMES[rar - 1], "body_strong", rc.lightened(0.15))
		var how: String = "Any board may bring them, the free one at sunrise or a posted notice."
		if rar >= 4:
			how = "A Legendary only answers a posted notice."
			var p: Dictionary = session.profile() if session != null else {}
			if Crew.legendary_locked(str(e["slug"]), Js.list(p.get("legendary_unlocks"))):
				how += " The campaign has yet to bring this one within reach."
		Paper.text(_detail, how, "note", Paper.ink_soft(), true)
		return
	Paper.text(_detail, str(e["name"]), "title", Paper.ink())
	Paper.text(_detail, "%s%s" % [RARITY_NAMES[rar - 1], ("  ·  " + str(cls["name"])) if not cls.is_empty() else ""], "body_strong", rc.lightened(0.15))
	var line: String = Crew.quip(str(e["slug"]))
	if line != "":
		Paper.text(_detail, "\u201C%s\u201D" % line, "body", Paper.ink(), true)
	if not cls.is_empty():
		Paper.text(_detail, str(cls["blurb"]), "note", Paper.ink_soft(), true)
	Paper.rule(_detail)
	Paper.text(_detail, "Signed on before." if e["signed"] == true else "Met on a board, never signed.", "body_strong", Paper.CHOSEN if e["signed"] == true else Paper.ink_soft())


# ── The Trunk ──────────────────────────────────────────────────────────────────

const TIER_NAMES: Dictionary = { "rare": "Rare", "epic": "Epic", "legendary": "Legendary", "chase": "Chase" }


## A skin tier's colour, from THE rarity table (chase included).
static func tier_color(tier: String) -> Color:
	return Kit.rarity(tier) if Kit.rarity_key(tier) != "" else Kit.DIM


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
	# Flat on the night paper: a hairline, CHOSEN while one is waiting (no
	# colour per kind, no glow).
	var p: Pane = Kit.pane(null, { "radius": Kit.R_LARGE, "fill": [Paper.NIGHT_PAPER_HI], "border": [1, Color(Paper.CHOSEN, 0.6) if n > 0 else Paper.NIGHT_HAIR], "pad": [12, 10, 14, 10], "keep": true, "night": true })
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
	Paper.text(t, "%d HELD" % n, "eyebrow", Paper.CHOSEN if n > 0 else Paper.ink_faint())
	Paper.text(t, str(d.get("name", kind)), "body_strong", Paper.ink() if n > 0 else Paper.ink_soft())
	var w: Dictionary = Js.obj(d.get("weights"))
	var odds: Array = []
	for tier: String in Skins.ROLLS:
		if float(w.get(tier, 0.0)) > 0.0:
			var pc: float = float(w[tier])
			odds.append("%s %s%%" % [TIER_NAMES[tier], str(int(pc)) if pc == floorf(pc) else str(pc)])
	Paper.text(t, ", ".join(PackedStringArray(odds)), "small", Paper.ink(), true)
	Paper.text(t, str(d.get("from", "")), "small", Paper.ink_soft(), true)
	var b: Pane.PaneButton = Paper.button("Open", n > 0)
	b.disabled = n <= 0
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	b.pressed.connect(func() -> void: _open_voucher(kind))
	h.add_child(b)
	if n > 0:
		# A slow breath, so a voucher waiting looks alive.
		var tw: Tween = p.create_tween().set_loops()
		var half: float = PI / Motion.PULSE_BREATH
		tw.tween_property(p, "modulate", Color(1.12, 1.12, 1.12), half).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tw.tween_property(p, "modulate", Color.WHITE, half).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
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
		_note("Every skin is already yours. The voucher pays %s ⟡." % Js.thousands(float(res["doubloons"])), true)
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
		Kit.grey(pic)
		(pic.material as ShaderMaterial).set_shader_parameter("strength", 0.35)
	holder.add_child(pic)
	if have:
		ChaseFx.over(holder, k)
	if _pick_kind == "skin" and _pick.get("id") == k["id"]:
		ring_over(holder)
	art_hover(b, pic)
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
		Kit.grey(pic)
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
		b.custom_minimum_size = Vector2(54, 64)
		b.tooltip_text = str(k["name"])
		# Frameless on a blot of its tier; the one worn is circled in ink.
		var holder: Control = Control.new()
		holder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(holder)
		Paper.blot(holder, col, 0.5)
		var pic: TextureRect = TextureRect.new()
		pic.texture = _thumb(str(k["filename"]))
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(pic)
		if on:
			ring_over(holder)
		art_hover(b, pic)
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
	var rc: Color = rarity_color(rar)
	var b: Button = Button.new()
	b.flat = true
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
		ring_over(holder)
	art_hover(b, pic)
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
	_detail.visible = room != "hall" and room != "bunks"
	if _pick.is_empty():
		Paper.text(_detail, "Press a skin to see it." if room == "trunk" else ("Press a crewmate to see them." if room == "book" else "Press a card to see the hand."), "note", Paper.ink_faint(), true)
		return
	if _pick_kind == "skin":
		_skin_detail()
		return
	if _pick_kind == "book":
		_book_detail()
		return
	var c: Dictionary = _pick
	var rar: int = clampi(int(Js.num(c.get("rarity"))), 1, 4)
	var rc: Color = rarity_color(rar)
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
		Paper.text(_detail, "Trait: %s  (%s to their stats)" % [tl, Crew.trait_effect(Js.list(c.get("effects")))], "small", Paper.ink(), true)
	if _pick_kind == "board":
		var cmp: String = _compare(c)
		if cmp != "":
			Paper.text(_detail, cmp.replace("\n", " "), "small", Paper.ink_soft(), true)
	if not cls.is_empty():
		Paper.text(_detail, str(cls["blurb"]), "note", Paper.ink_soft(), true)
		var lvl: int = Crew.level(Js.num(c.get("xp"))) if _pick_kind == "roster" else 1
		var ms: Array = cls["milestones"]
		var now_m: Dictionary = {}
		for m: Dictionary in ms:
			if lvl >= int(m["unlockLevel"]):
				now_m = m
		if not now_m.is_empty():
			Paper.text(_detail, "Special: %s" % now_m["desc"], "small", Paper.ink(), true)
	Paper.rule(_detail)
	if _pick_kind == "board":
		if c.get("recruited") == true:
			Paper.text(_detail, "Already aboard.", "note", Paper.ink_soft())
		else:
			var sign: Pane.PaneButton = Paper.primary("Sign on", true)
			sign.pressed.connect(func() -> void: _sign(c))
			_detail.add_child(sign)
	else:
		_skin_row(c)
		if c.get("nickname") == null:
			var row: HBoxContainer = HBoxContainer.new()
			row.add_theme_constant_override("separation", 6)
			_detail.add_child(row)
			var field: LineEdit = Paper.night_field(30)
			field.placeholder_text = "Give them a name (once)"
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
	# No ring or disc behind it (Kong, 2026-10-05: they "look so cheap"): the
	# words alone over a soft dark band, so they read on anything.
	layer.draw.connect(func() -> void:
		var c: Vector2 = layer.size / 2.0
		var u: float = clampf(t[0] / 1.7, 0.0, 1.0)
		var a: float = minf(1.0, u * 6.0) * (1.0 - smoothstep(0.75, 1.0, u))
		layer.draw_texture_rect(FxSheet.glow(), Rect2(c - Vector2(520, 90), Vector2(1040, 180)), false, Color(0, 0, 0, 0.55 * a)))
	var l: Label = Kit.text(layer, name if name.ends_with("!") else "%s is aboard!" % name, "hero", Paper.NIGHT_INK)
	l.add_theme_color_override("font_shadow_color", Color(col.darkened(0.5), 0.9))
	l.add_theme_constant_override("shadow_outline_size", 14)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	l.offset_left = -400
	l.offset_right = 400
	l.offset_top = -30
	l.offset_bottom = 30
	l.pivot_offset = Vector2(400, 30)
	# The name starts unseen and blooms in with its band (words: no BACK).
	l.scale = Vector2(0.85, 0.85)
	l.modulate.a = 0.0
	var tw: Tween = layer.create_tween().set_parallel()
	tw.tween_method(func(v: float) -> void:
		t[0] = v
		layer.queue_redraw(), 0.0, 1.7, 1.7)
	Motion.ease_fade(tw, l, "modulate:a", 1.0, Motion.WORD_IN)
	Motion.ease_rise(tw, l, "scale", Vector2.ONE, 0.35)
	Motion.ease_exit(tw, l, "modulate:a", 0.0, 0.4).set_delay(1.3)
	tw.chain().tween_callback(layer.queue_free)
