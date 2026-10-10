class_name ParlorRoom
extends Room
## THE PARLOR (Godot port of app/(app)/tavern/trivia; Kong 2026-10-03: "match
## the aesthetic of our game; use Godot for better animations"). Rules:
## core/parlor.gd; the parts it draws with: game/parlor_parts.gd.
##
## THE PARLOR AS A PLACE (Kong, 2026-10-10: the Chart Room, Parlor and Den
## "were based on being a web app so ... animations and visuals and
## everything were all a bit lacking"; the Den was the pilot and he approved
## it). The room keeps the header every room has, with the three games as its
## tabs; under it the whole screen is the game: your rank, points and purse as
## words and a slim bar along the top, then ONE flat slate board filling the
## rest (a deep charcoal green, rounded, a thin darker rim; no texture,
## gradient or shadow, as he wants it clean), the questions written on it in
## chalk. Every change of state moves:
##   - THE CAPTAIN'S BOARD: your hand is dealt onto the slate face down; a card
##     turned over narrows to its edge, the board is wiped, the question is
##     written in and four cream answer cards are dealt under it, a fuse
##     burning across the top for the clock. The pick presses in; right, it
##     turns to a gold-ringed face and glows and the points fly to your rank;
##     wrong, it shakes and dims and the right card turns gold.
##   - THE PIRATE KING: the ladder is a mast beside the slate, ten yards and
##     their prizes, the safe yards flagged, the crown at the masthead; your
##     marker climbs a yard on a right answer and falls back to the last safe
##     yard on a wrong one. The 50/50 slides two wrong cards off the board.
##     Walking away sends the prize flying to your purse.
##   - SPIN THE CAPSTAN: a big flat wheel beside the slate that spins up,
##     turns heavily, runs a touch past and settles on the wedge the rules
##     returned, a pawl knocked aside by each peg; the prize lifts off it. The
##     phrase's tiles turn over as their letters are called.
## Results are written on the slate in chalk; the toast is only the fallback.
## Keys: 1-4 pick an answer, Enter goes on, Space spins the capstan; a pad
## moves focus across the cards and keys.

const PP = preload("res://game/parlor_parts.gd")
const CORAL: Color = Color("#dd8f79")
const RIGHT: Color = Paper.GREEN
const WRONG: Color = Paper.RED
## The height of the rank and purse line over the slate.
const TOP_H: float = 60.0
## The slate's inner margin.
const PAD: float = 40.0

var tab: String = "board"
var _st: Dictionary = {}
var _tabs: HBoxContainer
var _place: Control
var _top: HBoxContainer
var _rank_l: Label
var _note_l: Label
var _pts_bar: Kit.Bar
var _streak_l: Label
var _purse_l: Label
var _purse_shown: float = 0.0
var _slate: PP.Slate
var _page: Control = null
## Whatever stands beside the slate (the King's mast, the capstan's wheel).
var _side: Control = null
var _mast: PP.Mast = null
var _wheel: PP.CapWheel = null
var _busy: bool = false
var _wiping: bool = false
# The question on the slate.
var _fuse: PP.Fuse = null
var _cards: Array = []
var _q_text: String = ""
var _verdict: Label = null
var _explain: Label = null
var _foot: HBoxContainer = null
var _next: Button = null
var _answering: Callable = Callable()
## The answer cards are down (no answer, and no burnt fuse, before).
var _dealt: bool = false
## The question's answer, kept: an answer the rules turn back (an error)
## hands the cards back to it.
var _answer_fn: Callable = Callable()
## The page's words for a message (an error, a call).
var _msg: Label = null
# The capstan.
var _cap_i: int = 0
## Where the wheel came to rest: the page is rebuilt after every spin, letter
## and solve, and a fresh wheel would otherwise snap back to 0.
var _cap_angle: float = 0.0
var _bank_l: Label = null
var _strikes_l: Label = null
var _spin_b: Button = null
var _tiles: Control = null


func _init() -> void:
	title = "The Parlor"
	accent = CORAL


## Behind the slate: the room's plain dark (no picture, no glow; Kong wants
## it clean).
func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.05, 0.06, 0.06)
	add_child(bg)


## The games are the header's tabs, beside the back pill.
func _badge() -> Control:
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 2)
	_tabs.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return _tabs


func _build() -> void:
	_st = Parlor.state(session.store, session.uid)
	var m: MarginContainer = col.get_parent() as MarginContainer
	if m != null:
		m.add_theme_constant_override("margin_bottom", 16)
	_place = Control.new()
	_place.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_place.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(_place)
	# Where you stand, along the top: the rank and its bar, the streak, the purse.
	_top = HBoxContainer.new()
	_top.add_theme_constant_override("separation", 22)
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_place.add_child(_top)
	var left: VBoxContainer = VBoxContainer.new()
	left.add_theme_constant_override("separation", 6)
	left.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_top.add_child(left)
	var line: HBoxContainer = HBoxContainer.new()
	line.add_theme_constant_override("separation", 14)
	left.add_child(line)
	_rank_l = _words(line, "", "title", PP.CHALK)
	_note_l = _words(line, "", "small", PP.CHALK_SOFT)
	_note_l.size_flags_vertical = Control.SIZE_SHRINK_END
	_pts_bar = Kit.bar(left, 0.0, PP.GOLD)
	_pts_bar.custom_minimum_size = Vector2(420, 6)
	_pts_bar.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	var gap: Control = Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(gap)
	_streak_l = _words(_top, "", "heading", Paper.NIGHT_RED)
	_streak_l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var purse: VBoxContainer = VBoxContainer.new()
	purse.add_theme_constant_override("separation", 0)
	purse.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_top.add_child(purse)
	_words(purse, "Your purse", "label", PP.CHALK_SOFT).horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_purse_l = _words(purse, "", "display_sm", Kit.SEA_GOLD)
	_purse_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_purse_shown = Js.num(session.profile().get("doubloons"))
	_purse_l.text = "%s ⟡" % Js.thousands(_purse_shown)
	_slate = PP.Slate.new()
	_place.add_child(_slate)
	_place.resized.connect(_layout)
	_fit()
	if not get_viewport().size_changed.is_connected(_fit):
		get_viewport().size_changed.connect(_fit)
	_paint_strip(false)
	_open(tab)


## The place to the screen: the column as wide as the window allows, down to
## the foot (from the window, never a fixed 1600 x 900).
func _fit() -> void:
	if _place == null or not is_instance_valid(_place):
		return
	var vp: Vector2 = get_viewport_rect().size
	col.custom_minimum_size = Vector2(maxf(640.0, vp.x - 40.0), 0)
	var above: float = 0.0
	var sep: float = float(col.get_theme_constant("separation"))
	for c: Node in col.get_children():
		if c == _place:
			break
		if c is Control:
			above += (c as Control).get_combined_minimum_size().y + sep
	_place.custom_minimum_size = Vector2(0, maxf(560.0, vp.y - 22.0 - 16.0 - above))


## The line along the top, the slate, and what stands beside it.
func _layout() -> void:
	var w: float = _place.size.x
	var h: float = _place.size.y
	if w < 10.0 or h < 10.0:
		return
	_top.position = Vector2(4, 0)
	_top.size = Vector2(w - 8.0, TOP_H)
	var y0: float = TOP_H + 8.0
	var mh: float = h - y0
	var sx: float = 0.0
	if _side != null and is_instance_valid(_side):
		if _side == _wheel:
			var d: float = floorf(minf(mh, w * 0.4))
			_side.position = Vector2(0, y0 + (mh - d) / 2.0)
			_side.size = Vector2(d, d)
			sx = d + 22.0
		else:
			var sw: float = clampf(w * 0.18, 250.0, 320.0)
			_side.position = Vector2(0, y0)
			_side.size = Vector2(sw, mh)
			sx = sw + 16.0
	_slate.position = Vector2(sx, y0)
	_slate.size = Vector2(w - sx, mh)


## Words on the dark (cream chalk, or a tone), never catching the mouse.
static func _words(parent: Node, t: String, role: String, c: Color = PP.CHALK, wrap: bool = false) -> Label:
	var l: Label = Kit.text(parent, t, role, c, wrap)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## THE ONE THING TO DO on the slate (Climb, Spin, Back to your hand): a flat
## cream button inked in the slate's dark. Not the wooden plank.
static func _primary(label: String) -> Pane.PaneButton:
	var n: Dictionary = { "radius": Kit.R_LARGE, "fill": [PP.CARD], "border": [1, Color(PP.SLATE_RIM, 0.6)], "pad": [26, 10, 26, 11], "keep": true }
	var h: Dictionary = n.duplicate()
	h["fill"] = [PP.CARD_HOT]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.text = label
	var r: Array = Kit.ROLES["button"]
	b.add_theme_font_override("font", Kit.tracked(r[0], r[1], r[2], r[3]))
	b.add_theme_font_size_override("font_size", 18)
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, PP.SLATE_RIM)
	b.add_theme_color_override("font_disabled_color", Color(PP.SLATE_RIM, 0.4))
	b.custom_minimum_size = Vector2(0, 50)
	b.focus_mode = Control.FOCUS_ALL
	Kit.tap(b)
	return b


## A second choice on the slate: chalk words in a chalk hairline.
static func _chalk_button(label: String) -> Pane.PaneButton:
	var n: Dictionary = { "radius": Kit.R_SMALL, "fill": [Color(0, 0, 0, 0)], "border": [1, Color(PP.CHALK, 0.45)], "pad": [18, 8, 18, 9], "keep": true }
	var h: Dictionary = n.duplicate()
	h["fill"] = [Color(PP.CHALK, 0.08)]
	h["border"] = [1, Color(PP.CHALK, 0.85)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.text = label
	var r: Array = Kit.ROLES["button_quiet"]
	b.add_theme_font_override("font", Kit.font(r[0], r[1]))
	b.add_theme_font_size_override("font_size", 16)
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, PP.CHALK)
	b.add_theme_color_override("font_disabled_color", Color(PP.CHALK, 0.3))
	b.custom_minimum_size = Vector2(0, 46)
	b.focus_mode = Control.FOCUS_ALL
	Kit.tap(b)
	return b


# ── The line along the top ─────────────────────────────────────────────────────

func _paint_strip(animate: bool = true) -> void:
	var rk: Dictionary = _st["rank"]
	_rank_l.text = str(rk["title"])
	_rank_l.add_theme_color_override("font_color", Kit.night_ink(Color(str(rk["color"]))))
	var nxt: Variant = _st.get("nextRank")
	_note_l.add_theme_color_override("font_color", PP.CHALK_SOFT)
	_note_l.text = "%d Parlor points%s%s%d of %d questions met" % [int(_st["points"]), (Kit.SEP + "%d to %s" % [int(float(nxt["at"]) - float(_st["points"])), nxt["title"]]) if nxt != null else "", Kit.SEP, int(_st["seen"]), int(_st["bankSize"])]
	# The capstone (core/skins.gd): Parlor Legend brings a Captain's Voucher.
	var cap: String = str(Skins.cfg().get("parlorCapstone", ""))
	if nxt != null and str(nxt["title"]) == cap:
		_note_l.text += "%s%s brings a %s" % [Kit.SEP, cap, Skins.kind_def("captain").get("name", "Captain's Voucher")]
	_streak_l.text = "Streak %d" % int(_st["streak"]) if float(_st["streak"]) > 0.0 else ""
	var f: float = 1.0
	if nxt != null:
		f = clampf((float(_st["points"]) - float(rk["at"])) / maxf(1.0, float(nxt["at"]) - float(rk["at"])), 0.0, 1.0)
	_pts_bar.color = Kit.night_ink(Color(str(rk["color"])))
	_pts_bar.set_value(f, animate)


func _refresh(animate: bool = true) -> void:
	_st = Parlor.state(session.store, session.uid)
	_paint_strip(animate)


## The purse counts to what it holds now.
func _purse_to(v: float) -> void:
	var from: float = _purse_shown
	_purse_shown = v
	if from == v:
		return
	Motion.count(_purse_l, from, v, func(x: float) -> void:
		if is_instance_valid(_purse_l):
			_purse_l.text = "%s ⟡" % Js.thousands(round(x)))
	var tw: Tween = _purse_l.create_tween()
	_purse_l.pivot_offset = _purse_l.size / 2.0
	tw.tween_property(_purse_l, "scale", Vector2.ONE * 1.08, 0.08)
	tw.tween_property(_purse_l, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## A new rank, said on the line along the top (in gold, the rank's name
## lifting a touch).
func _ranked_up(r: Dictionary) -> void:
	if not r.get("rankedUp", false):
		return
	var now: String = str(Parlor.rank_of(float(r["newPoints"]))["rank"]["title"])
	_note_l.text = ("A new rank: %s. A %s waits in your Trunk." % [now, Skins.kind_def("captain").get("name", "")]) if now == str(Skins.cfg().get("parlorCapstone", "")) else "A new rank: %s" % now
	_note_l.add_theme_color_override("font_color", PP.GOLD)
	Motion.rise_word(_rank_l)
	Sound.bell()


## Where flying points land (the bar) and where doubloons land (the purse).
func _bar_point() -> Vector2:
	return _pts_bar.get_global_rect().get_center()


func _purse_point() -> Vector2:
	return _purse_l.get_global_rect().get_center()


## CHALK IN FLIGHT: a figure lifts off where it was won and flies in an arc
## to where it counts (the bar, the purse, the bank), shrinking as it goes;
## `landed` runs as it arrives.
func _fly(t: String, from: Vector2, to: Vector2, c: Color = PP.GOLD, landed: Callable = Callable()) -> void:
	var l: Label = _words(null, t, "display_sm", c)
	l.top_level = true
	l.z_index = 60
	add_child(l)
	l.modulate.a = 0.0
	await get_tree().process_frame
	if not is_instance_valid(l):
		return
	l.reset_size()
	l.pivot_offset = l.size / 2.0
	var a: Vector2 = from - l.size / 2.0
	var b: Vector2 = to - l.size / 2.0
	var tw: Tween = l.create_tween()
	tw.tween_method(func(u: float) -> void:
		l.modulate.a = 1.0
		l.position = a + Vector2(0, -22.0 * sin(u * PI / 2.0))
		l.scale = Vector2.ONE * (1.0 + 0.15 * u), 0.0, 1.0, 0.18).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	var lifted: Vector2 = a + Vector2(0, -22.0)
	tw.tween_method(func(u: float) -> void:
		var e: float = u * u * (3.0 - 2.0 * u)
		var p: Vector2 = lifted.lerp(b, e)
		p.y -= sin(u * PI) * 60.0
		l.position = p
		l.scale = Vector2.ONE * lerpf(1.15, 0.55, e)
		l.modulate.a = 1.0 - clampf((u - 0.8) / 0.2, 0.0, 1.0), 0.0, 1.0, 0.62)
	tw.tween_callback(func() -> void:
		if landed.is_valid():
			landed.call()
		l.queue_free())


# ── Tabs and pages ─────────────────────────────────────────────────────────────

func _paint_tabs() -> void:
	for c: Node in _tabs.get_children():
		_tabs.remove_child(c)
		c.queue_free()
	var lock: String = str(_st["king"].get("locked", ""))
	for t: Array in [["board", "Captain's Board", ""], ["king", "The Pirate King", lock], ["capstan", "Spin the Capstan", ""]]:
		var b: Pane.PaneButton = Paper.tab(t[1] if t[2] == "" else t[1] + Kit.SEP + t[2], t[0] == tab)
		# A game still closed says when, and does not open.
		b.disabled = t[2] != ""
		var key: String = t[0]
		b.pressed.connect(func() -> void:
			if not _busy and not _wiping and key != tab:
				_open(key))
		_tabs.add_child(b)


func _open(which: String) -> void:
	var first: bool = _page == null
	tab = which
	_refresh(false)
	_paint_tabs()
	if _side != null and is_instance_valid(_side):
		_side.queue_free()
	_side = null
	_mast = null
	_wheel = null
	match which:
		"king":
			_mast = PP.Mast.new()
			var k: Dictionary = _st["king"]
			_mast.prizes = k["prizes"]
			_mast.havens = k["havens"]
			_mast.pos = _king_pos(k)
			_mast.crowned = str(k["status"]) == "crowned"
			_side = _mast
		"capstan":
			_wheel = PP.CapWheel.new()
			_wheel.wedges = _st["capstan"]["wheel"]
			_wheel.angle = _cap_angle
			_side = _wheel
	if _side != null:
		_place.add_child(_side)
		_side.modulate.a = 0.0
		Motion.ease_fade(_side.create_tween(), _side, "modulate:a", 1.0, Motion.PANEL_IN)
	_layout()
	var page: Callable = _hand_page
	match which:
		"king":
			page = _king_page
		"capstan":
			page = _cap_page
	_turn_page(page, not first)


## Where the King's marker stands for this run: on the yard you hold, at the
## safe yard you fell to, or at the masthead.
func _king_pos(k: Dictionary) -> float:
	var n: int = (k["prizes"] as Array).size()
	match str(k["status"]):
		"crowned":
			return float(n - 1)
		"busted":
			var won: float = float(k["awarded"])
			if won <= 0.0:
				return -1.0
			return float((k["prizes"] as Array).find(won)) if (k["prizes"] as Array).has(won) else float((k["prizes"] as Array).find(int(won)))
	return float(int(k["rung"]) - 1)


## THE BOARD WIPED and a new page put up under the sweep (wipe = false: put
## up at once). The page builder may run its own arrivals.
func _turn_page(build: Callable, wipe: bool = true) -> void:
	if wipe and _page != null and is_instance_valid(_page):
		_wiping = true
		var w: PP.Wipe = PP.Wipe.new()
		_slate.add_child(w)
		Sound.whoosh()
		await w.run(func() -> void: _swap_page(build))
		_wiping = false
	else:
		_swap_page(build)


func _swap_page(build: Callable) -> void:
	if _page != null and is_instance_valid(_page):
		_page.queue_free()
	_answering = Callable()
	_dealt = false
	_fuse = null
	_cards = []
	_msg = null
	_verdict = null
	_explain = null
	_foot = null
	_next = null
	_bank_l = null
	_strikes_l = null
	_spin_b = null
	_tiles = null
	_page = Control.new()
	_page.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_page.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_slate.add_child(_page)
	_slate.move_child(_page, 0)
	# Built at the slate's real size (the first page waits a frame for it).
	var guard: int = 0
	while _slate.size.y < 100.0 and guard < 10 and is_inside_tree():
		guard += 1
		await get_tree().process_frame
	build.call()


## Set a control's anchors (left, top, right, bottom) and offsets.
static func _pin(c: Control, an: Array, off: Array) -> void:
	c.anchor_left = an[0]
	c.anchor_top = an[1]
	c.anchor_right = an[2]
	c.anchor_bottom = an[3]
	c.offset_left = off[0]
	c.offset_top = off[1]
	c.offset_right = off[2]
	c.offset_bottom = off[3]


## A message on the slate in chalk (the toast only when no page can say it).
func _say(t: String, c: Color = PP.CHALK) -> void:
	var l: Label = _msg if _msg != null and is_instance_valid(_msg) else (_verdict if _verdict != null and is_instance_valid(_verdict) else null)
	if l == null:
		toast(t, WRONG if c == PP.RED else GOLD)
		return
	l.text = t
	l.add_theme_color_override("font_color", c)
	Motion.rise_word(l)


func _process(_delta: float) -> void:
	# The fuse burnt out answers for you, through the same path as a press.
	if _dealt and _fuse != null and is_instance_valid(_fuse) and _fuse.deadline > 0.0 and _fuse.left() <= 0.0 and _answering.is_valid():
		_answering.call(-1)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo:
		var typing: bool = get_viewport().gui_get_focus_owner() is LineEdit
		var k: Key = (event as InputEventKey).keycode
		if not typing and k >= KEY_1 and k <= KEY_4 and _answering.is_valid():
			get_viewport().set_input_as_handled()
			_answering.call(int(k - KEY_1))
			return
		if (k == KEY_ENTER or k == KEY_KP_ENTER) and not typing and _next != null and is_instance_valid(_next) and _next.visible and not _next.disabled:
			get_viewport().set_input_as_handled()
			_next.pressed.emit()
			return
		if k == KEY_SPACE and not typing and tab == "capstan" and _spin_b != null and is_instance_valid(_spin_b) and not _spin_b.disabled:
			get_viewport().set_input_as_handled()
			_cap_spin()
			return
	# A pad's first press with nothing in focus lands on the slate's first card.
	for a: String in ["ui_up", "ui_down", "ui_left", "ui_right"]:
		if event.is_action_pressed(a) and get_viewport().gui_get_focus_owner() == null and _page != null:
			var first: Control = Sheet.first_focus(_page)
			if first != null:
				first.grab_focus()
				get_viewport().set_input_as_handled()
				return
	super(event)


# ── The Captain's Board ────────────────────────────────────────────────────────

func _cat(key: String) -> Dictionary:
	for c: Dictionary in Parlor.c()["categories"]:
		if c["key"] == key:
			return c
	return { "label": key, "color": "#888888" }


func _dur(ms: float) -> String:
	var m: int = int(ms / 60000.0)
	return "%dh %02dm" % [m / 60, m % 60] if m >= 60 else "%dm" % maxi(1, m)


## YOUR HAND, dealt onto the slate face down (or straight back to a card
## already turned and not answered).
func _hand_page() -> void:
	var b: Dictionary = _st["board"]
	var cards: Array = b["hand"]
	for c: Dictionary in cards:
		if c.has("question"):
			_board_q(c)
			return
	var eb: Label = _words(_page, "The Captain's Board", "eyebrow", PP.CHALK_SOFT)
	_pin(eb, [0, 0, 0.5, 0], [PAD, 30, 0, 48])
	var t: Label = _words(_page, "Your hand", "display", PP.CHALK)
	_pin(t, [0, 0, 0.5, 0], [PAD, 50, 0, 96])
	var next: float = float(b["nextIn"])
	var nl: Label = _words(_page, ("Next card in %s" % _dur(next)) if next >= 0.0 else "Your hand is full: play a card to be dealt another", "body_strong", PP.CHALK_SOFT)
	nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_pin(nl, [0.5, 0, 1, 0], [0, 40, -PAD, 64])
	_msg = _words(_page, "Turn a card over to see its question; you have %d seconds to answer. Right pays the card's worth." % int(Parlor.c()["answerSeconds"]), "body", PP.CHALK_SOFT)
	_msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_pin(_msg, [0, 1, 1, 1], [PAD, -64, -PAD, -36])
	if cards.is_empty():
		var none: Label = _words(_page, "No cards in hand. One is dealt every eight hours.", "title", PP.CHALK_SOFT)
		none.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		none.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_pin(none, [0, 0.5, 1, 0.5], [PAD, -30, -PAD, 30])
		Motion.rise_word(none)
		return
	var ch: float = clampf(_slate.size.y * 0.46, 210.0, 320.0)
	var cw: float = ch * 0.72
	var gap: float = 30.0
	var total: float = cards.size() * cw + (cards.size() - 1) * gap
	var made: Array = []
	for i: int in cards.size():
		var c: Dictionary = cards[i]
		var cat: Dictionary = _cat(str(c["category"]))
		var hc: PP.HandCard = PP.HandCard.new(c, str(cat["label"]), Color(str(cat["color"])))
		var x: float = -total / 2.0 + i * (cw + gap)
		var mid: float = i - (cards.size() - 1) / 2.0
		_pin(hc, [0.5, 0.5, 0.5, 0.5], [x, -ch / 2.0 + absf(mid) * 8.0 + 10.0, x + cw, ch / 2.0 + absf(mid) * 8.0 + 10.0])
		hc.rotation = deg_to_rad(mid * 2.5)
		hc.mouse_filter = Control.MOUSE_FILTER_IGNORE
		hc.modulate.a = 0.0
		hc.pressed.connect(func() -> void: _turn(c, hc))
		_page.add_child(hc)
		made.append(hc)
	_deal_hand(made)


## The hand dealt in, card by card, from below the board.
func _deal_hand(made: Array) -> void:
	await get_tree().process_frame
	for i: int in made.size():
		var hc: PP.HandCard = made[i]
		if not is_instance_valid(hc):
			return
		hc.settle()
		var goal: Vector2 = hc.position
		var turn: float = hc.rotation
		hc.position = goal + Vector2(0, 240)
		hc.rotation = turn + deg_to_rad(-8.0)
		var tw: Tween = hc.create_tween().set_parallel()
		tw.tween_property(hc, "modulate:a", 1.0, 0.18).set_delay(i * 0.09)
		tw.tween_property(hc, "position", goal, 0.42).set_delay(i * 0.09).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(hc, "rotation", turn, 0.42).set_delay(i * 0.09).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.chain().tween_callback(func() -> void:
			if is_instance_valid(hc):
				hc.mouse_filter = Control.MOUSE_FILTER_STOP)
		get_tree().create_timer(i * 0.09).timeout.connect(func() -> void: Sound.plip())


func _turn(c: Dictionary, from: PP.HandCard) -> void:
	if _busy or _wiping:
		return
	_busy = true
	var r: Dictionary = await session.act("boardReveal", [c["key"]])
	if r.has("error"):
		_say(str(r["error"]), PP.RED)
		_busy = false
		return
	session.persist()
	# The card turns: it narrows to its edge, the board is wiped and the
	# question is written.
	await from.flip_away()
	Sound.plip()
	var mine: Dictionary = (r["hand"] as Array).filter(func(x: Dictionary) -> bool: return x["key"] == c["key"])[0]
	_st["board"] = r
	_busy = false
	_turn_page(func() -> void: _board_q(mine))


## A turned card's question on the slate, its fuse lit from when it turned.
func _board_q(c: Dictionary) -> void:
	var cat: Dictionary = _cat(str(c["category"]))
	var lim: float = float(Parlor.c()["answerSeconds"])
	var left: float = maxf(0.0, lim - (Clock.now_ms() - float(c["revealedAt"])) / 1000.0)
	_q_page("%s%s%d ⟡" % [cat["label"], Kit.SEP, int(c["value"])], str(c["question"]), c["options"], [], left)
	_next = _primary("Back to your hand   ·   Enter")
	_next.visible = false
	_next.pressed.connect(func() -> void:
		if _wiping:
			return
		_refresh()
		_turn_page(_hand_page))
	_foot.add_child(_next)
	_bind(func(i: int) -> Dictionary:
		return await session.act("boardAnswer", [c["key"], float(i)]),
		func(_r: Dictionary) -> void:
			_show_next())


# ── The question on the slate (the Captain's Board and the Pirate King) ────────

## THE QUESTION PAGE: the fuse across the top, the topic and worth, the
## question written in chalk, four answer cards two by two, and a foot for
## the verdict, its explanation and what comes next.
func _q_page(eyebrow: String, question: String, options: Array, removed: Array, seconds_left: float) -> void:
	_q_text = question
	var h: float = _slate.size.y
	var card_h: float = clampf(h * 0.14, 76.0, 112.0)
	var g: float = 16.0
	var foot: float = 104.0
	_fuse = PP.Fuse.new()
	_fuse.total = float(Parlor.c()["answerSeconds"])
	_pin(_fuse, [0, 0, 1, 0], [PAD - 8.0, 20, -PAD, 52])
	_page.add_child(_fuse)
	_fuse.light(seconds_left)
	var eb: Label = _words(_page, eyebrow, "eyebrow", PP.CHALK_SOFT)
	_pin(eb, [0, 0, 1, 0], [PAD, 66, -PAD, 84])
	var ql: Label = _words(_page, question, "display", PP.CHALK)
	ql.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ql.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var q_bottom: float = foot + card_h * 2.0 + g + 22.0
	_pin(ql, [0, 0, 1, 1], [PAD, 90, -PAD, -q_bottom])
	# As large as the space allows: a long question steps down a size.
	var room_h: float = h - 90.0 - q_bottom
	var width: float = _slate.size.x - PAD * 2.0
	var fnt: Font = Kit.font("cinzel", 800)
	var px: int = 22
	for p: int in [40, 36, 32, 28, 25]:
		if fnt.get_multiline_string_size(question, HORIZONTAL_ALIGNMENT_LEFT, width, p).y * 1.05 <= room_h:
			px = p
			break
	ql.add_theme_font_size_override("font_size", px)
	# The chalk writes the question in, quickly, as it slides on.
	ql.visible_ratio = 0.0
	var wt: Tween = ql.create_tween()
	wt.tween_property(ql, "visible_ratio", 1.0, clampf(question.length() * 0.011, 0.25, 0.7)).set_delay(0.08)
	Motion.rise_word(eb)
	# The four answers, dealt in one after another.
	for i: int in 4:
		var ac: PP.AnswerCard = PP.AnswerCard.new(i, str(options[i]))
		var colm: int = i % 2
		var row: int = i / 2
		var top: float = -(foot + card_h * (2 - row) + g * (1 - row))
		_pin(ac, [0.5 * colm, 1, 0.5 * colm + 0.5, 1], [PAD if colm == 0 else g / 2.0, top, -g / 2.0 if colm == 0 else -PAD, top + card_h])
		ac.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ac.modulate.a = 0.0
		_page.add_child(ac)
		_cards.append(ac)
		if Js.includes(removed, float(i)) or removed.has(i):
			ac.disabled = true
			ac.focus_mode = Control.FOCUS_NONE
			ac.visible = false
	# The foot: the verdict and its explanation on the left, the way on.
	var words: VBoxContainer = VBoxContainer.new()
	words.add_theme_constant_override("separation", 2)
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pin(words, [0, 1, 1, 1], [PAD, -foot + 12.0, -PAD - 330.0, -14])
	_page.add_child(words)
	_verdict = _words(words, "", "title", PP.CHALK)
	_explain = _words(words, "", "small", PP.CHALK_SOFT, true)
	_explain.add_theme_font_size_override("font_size", 14)
	_explain.max_lines_visible = 3
	_foot = HBoxContainer.new()
	_foot.add_theme_constant_override("separation", 10)
	_foot.alignment = BoxContainer.ALIGNMENT_END
	_pin(_foot, [1, 1, 1, 1], [-PAD - 320.0, -foot + 18.0, -PAD, -24])
	_page.add_child(_foot)
	_deal_answers()


func _deal_answers() -> void:
	await get_tree().process_frame
	var dealt: Array = _cards
	var page: Control = _page
	get_tree().create_timer(0.16 + dealt.size() * 0.07 + 0.2).timeout.connect(func() -> void:
		if page == _page:
			_dealt = true)
	for i: int in dealt.size():
		var ac: PP.AnswerCard = dealt[i]
		if not is_instance_valid(ac) or not ac.visible:
			continue
		ac.settle()
		var goal: Vector2 = ac.position
		ac.position = goal + Vector2(0, 46)
		ac.scale = Vector2.ONE * 0.94
		var d: float = 0.16 + i * 0.07
		var tw: Tween = ac.create_tween().set_parallel()
		tw.tween_property(ac, "modulate:a", 1.0, 0.16).set_delay(d)
		tw.tween_property(ac, "position", goal, 0.32).set_delay(d).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(ac, "scale", Vector2.ONE, 0.32).set_delay(d).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.chain().tween_callback(func() -> void:
			if is_instance_valid(ac) and not ac.disabled:
				ac.mouse_filter = Control.MOUSE_FILTER_STOP)


## An answer once: the fuse stops, the pick presses in, the rules are asked
## (`ask`), the cards are judged, then `after` with the reply. The burnt fuse
## and the keys answer through `_answering`, the same path as a press.
func _bind(ask: Callable, after: Callable) -> void:
	var answer: Callable = func(i: int) -> void:
		if _busy or not _dealt or not _answering.is_valid():
			return
		if i >= 0 and (i >= _cards.size() or (_cards[i] as PP.AnswerCard).disabled):
			return
		_busy = true
		_answering = Callable()
		if _fuse != null:
			_fuse.stop()
		for c: PP.AnswerCard in _cards:
			c.mouse_filter = Control.MOUSE_FILTER_IGNORE
			if c._hover > 0.0:
				c._hover_to(0.0)
		if i >= 0:
			await (_cards[i] as PP.AnswerCard).press_in()
		var r: Dictionary = await ask.call(i)
		if r.has("error"):
			_say(str(r["error"]), PP.RED)
			for c: PP.AnswerCard in _cards:
				if not c.disabled:
					c.mouse_filter = Control.MOUSE_FILTER_STOP
			_answering = _answer_fn
			_busy = false
			return
		session.persist()
		for c: PP.AnswerCard in _cards:
			c.focus_mode = Control.FOCUS_NONE
		await _judge(i, r)
		after.call(r)
		_busy = false
	_answering = answer
	_answer_fn = answer
	for i: int in 4:
		(_cards[i] as PP.AnswerCard).pressed.connect(func() -> void:
			if _answering.is_valid():
				_answering.call(i))


## The answer judged on the slate: right turns gold and glows, the points
## fly to your rank and the pay to your purse; wrong shakes and dims and the
## right card turns gold.
func _judge(chosen: int, r: Dictionary) -> void:
	var right: int = int(r["correctIndex"])
	var won: float = float(r.get("doubloonsWon", r.get("doubloonsAwarded", 0.0)))
	var timed: bool = r.get("timedOut", false)
	if r["correct"]:
		Sound.perfect()
		Rumble.buzz([0, 30, 20, 40])
		_verdict.text = "Right!" + (("   +%s ⟡" % Js.thousands(won)) if won > 0.0 else "")
		_verdict.add_theme_color_override("font_color", PP.GOLD)
		await (_cards[chosen] as PP.AnswerCard).turn("right", true)
		var from: Vector2 = (_cards[chosen] as PP.AnswerCard).get_global_rect().get_center()
		if won > 0.0:
			_fly("+%s ⟡" % Js.thousands(won), from, _purse_point(), Kit.SEA_GOLD, func() -> void: _purse_to(Js.num(session.profile().get("doubloons"))))
		var pts: float = float(r.get("pointsEarned", 0.0))
		if pts > 0.0:
			await get_tree().create_timer(0.12).timeout
			_fly("+%d point%s" % [int(pts), "" if pts == 1.0 else "s"], from, _bar_point(), PP.GOLD, func() -> void:
				_refresh()
				_ranked_up(r))
		else:
			_refresh()
	else:
		Sound.slack()
		_verdict.text = "Out of time." if timed else "Not this time."
		_verdict.add_theme_color_override("font_color", PP.RED)
		if chosen >= 0:
			await (_cards[chosen] as PP.AnswerCard).shake_dim()
		else:
			await get_tree().create_timer(0.15).timeout
		for i: int in _cards.size():
			if i != right and i != chosen and (_cards[i] as PP.AnswerCard).visible:
				(_cards[i] as PP.AnswerCard).create_tween().tween_property(_cards[i], "modulate:a", 0.72, 0.25)
		await (_cards[right] as PP.AnswerCard).turn("answer", true)
		_refresh()
	Motion.rise_word(_verdict)
	_explain.text = str(r.get("explanation", ""))
	Motion.rise_word(_explain, 0.08)


## The way on appears in the foot (and takes the pad's focus).
func _show_next() -> void:
	if _next == null or not is_instance_valid(_next):
		return
	_next.visible = true
	_next.modulate.a = 0.0
	Motion.ease_fade(_next.create_tween(), _next, "modulate:a", 1.0, Motion.PANEL_IN)
	if get_viewport().gui_get_focus_owner() != null:
		_next.grab_focus()


# ── The Pirate King ────────────────────────────────────────────────────────────

## The ladder's length in words for the copy ("ten"), read from the rules'
## prize list so a retuned ladder keeps the line true.
static func _count_word(n: int) -> String:
	var words: Array[String] = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]
	return words[n] if n >= 0 and n < words.size() else str(n)


## THE KING between questions: where you stand and what you can do (climb,
## or walk away with what you hold), written on the slate.
func _king_page() -> void:
	var k: Dictionary = _st["king"]
	if _mast != null:
		_mast.playing = -1
		_mast.queue_redraw()
	if k.has("current") and str(k["status"]) == "active":
		_king_q(k["current"], float(k["startedAt"]))
		return
	var prizes: Array = k["prizes"]
	var havens: Array = k["havens"]
	var rung: int = int(k["rung"])
	var status: String = str(k["status"])
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_page.add_child(center)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	v.custom_minimum_size = Vector2(minf(720.0, _slate.size.x - PAD * 2.0), 0)
	center.add_child(v)
	var eb: Label = _words(v, "The Pirate King", "eyebrow", PP.CHALK_SOFT)
	eb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var heads: Dictionary = {
		"active": ("Rung %d of %d" % [rung + 1, prizes.size()]),
		"crowned": "Crowned",
		"busted": "You fell",
		"walked": "You walked away",
	}
	var big: Label = _words(v, str(heads.get(status, "")), "hero", PP.GOLD if status == "crowned" else PP.CHALK)
	big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var lines: Dictionary = {
		"active": "%s questions, easier to harder. Climb as far as you dare: a wrong answer drops you to the last safe rung (%s), or walk away with what you have climbed to. One 50/50 a run. One run a week." % [_count_word(prizes.size()).capitalize(), " and ".join(PackedStringArray(havens.map(func(h: Variant) -> String: return str(int(h)))))],
		"crowned": "You climbed all %s this week: %s ⟡. A new ladder on Monday." % [_count_word(prizes.size()), Js.thousands(float(k["awarded"]))],
		"busted": "You fell this week with %s ⟡. A new ladder on Monday." % Js.thousands(float(k["awarded"])),
		"walked": "You walked away this week with %s ⟡. A new ladder on Monday." % Js.thousands(float(k["awarded"])),
	}
	var copy: Label = _words(v, str(lines.get(status, "")), "body", PP.CHALK_SOFT, true)
	copy.add_theme_font_size_override("font_size", 17)
	copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_msg = _words(v, "", "body_strong", PP.CHALK)
	_msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Motion.rise_word(eb)
	Motion.rise_word(big, 0.05)
	Motion.rise_word(copy, 0.1)
	if status != "active":
		return
	var acts: HBoxContainer = HBoxContainer.new()
	acts.alignment = BoxContainer.ALIGNMENT_CENTER
	acts.add_theme_constant_override("separation", 12)
	v.add_child(acts)
	var climb: Button = _primary("Climb to %s ⟡   ·   Enter" % Js.thousands(float(prizes[rung])))
	climb.pressed.connect(_king_rung)
	acts.add_child(climb)
	_next = climb
	if rung >= 1:
		var walk: Button = _chalk_button("Walk away with %s ⟡" % Js.thousands(float(prizes[rung - 1])))
		walk.pressed.connect(func() -> void: _king_walk(walk))
		acts.add_child(walk)
	acts.modulate.a = 0.0
	Motion.ease_fade(acts.create_tween(), acts, "modulate:a", 1.0, Motion.PANEL_IN)


func _king_rung() -> void:
	if _busy or _wiping:
		return
	_busy = true
	var st: Dictionary = await session.act("kingStart")
	_busy = false
	if st.has("error"):
		_say(str(st["error"]), PP.RED)
		return
	session.persist()
	_turn_page(func() -> void: _king_q(st["current"], float(st["startedAt"])))


## A rung's question on the slate; the mast marks the yard played for.
func _king_q(q: Dictionary, started: float) -> void:
	var k: Dictionary = _st["king"]
	var rung: int = int(k["rung"])
	var prizes: Array = k["prizes"]
	if _mast != null:
		_mast.playing = rung
		_mast.queue_redraw()
	var cat: Dictionary = _cat(str(q.get("category", "LORE")))
	var lim: float = float(Parlor.c()["answerSeconds"])
	var left: float = maxf(0.0, lim - (Clock.now_ms() - started) / 1000.0)
	_q_page("Rung %d%sfor %s ⟡%s%s" % [rung + 1, Kit.SEP, Js.thousands(float(prizes[rung])), Kit.SEP, cat["label"]], str(q["question"]), q["options"], q["removed"], left)
	if not k["fiftyUsed"]:
		var fifty: Button = _chalk_button("50/50")
		fifty.tooltip_text = "Strike two wrong answers off the board (once a run)"
		fifty.pressed.connect(func() -> void: _king_fifty(fifty))
		_foot.add_child(fifty)
	_next = _primary("Onward   ·   Enter")
	_next.visible = false
	_next.pressed.connect(func() -> void:
		if _wiping:
			return
		_refresh()
		_turn_page(_king_page))
	_foot.add_child(_next)
	_bind(func(i: int) -> Dictionary:
		return await session.act("kingAnswer", [float(rung), float(i)]),
		func(r: Dictionary) -> void:
			for c: Node in _foot.get_children():
				if c != _next:
					c.queue_free()
			await _king_after(r, rung)
			_show_next())


## The mast answers the verdict: up a yard, up to the crown, or down to the
## last safe yard with a settle.
func _king_after(r: Dictionary, rung: int) -> void:
	if _mast == null:
		return
	_mast.playing = -1
	var won: float = float(r["doubloonsAwarded"])
	match str(r["status"]):
		"active":
			Sound.streak(rung)
			_verdict.text = "Right!   You hold %s ⟡" % Js.thousands(float(_st["king"]["prizes"][rung]))
			await _mast.climb_to(float(rung))
		"crowned":
			_verdict.text = "Crowned!   +%s ⟡" % Js.thousands(won)
			await _mast.climb_to(float(rung))
			_mast.crown()
			Sound.chest(true)
			Rumble.buzz([0, 40, 30, 60])
			_fly("+%s ⟡" % Js.thousands(won), _mast.crown_point(), _purse_point(), Kit.SEA_GOLD, func() -> void: _purse_to(Js.num(session.profile().get("doubloons"))))
		"busted":
			var to: float = _king_pos(Parlor.king(session.store, session.uid))
			await get_tree().create_timer(0.2).timeout
			await _mast.fall_to(to)
			Sound.clunk()
			if won > 0.0:
				_verdict.text = "You fell to the safe rung: you keep %s ⟡" % Js.thousands(won)
				_fly("+%s ⟡" % Js.thousands(won), _mast.marker_point(), _purse_point(), Kit.SEA_GOLD, func() -> void: _purse_to(Js.num(session.profile().get("doubloons"))))
			else:
				_verdict.text = "You fell to the deck with nothing this week."
	Motion.rise_word(_verdict)


## The 50/50: two wrong cards slide off the board.
func _king_fifty(b: Button) -> void:
	if _busy:
		return
	_busy = true
	var r: Dictionary = await session.act("kingFifty")
	_busy = false
	if r.has("error"):
		_say(str(r["error"]), PP.RED)
		return
	session.persist()
	# Spent for the run: the button goes.
	b.disabled = true
	Motion.leave(b)
	Sound.whoosh()
	for i: Variant in r["removed"]:
		var ac: PP.AnswerCard = _cards[int(i)]
		ac.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ac.slide_off(-_slate.size.x * 0.7 if int(i) % 2 == 0 else _slate.size.x * 0.7)
	_refresh(false)


## Walking away banks the yard you hold: the marker rings and the prize flies
## to your purse, then the board says so.
func _king_walk(b: Button) -> void:
	if _busy or _wiping:
		return
	_busy = true
	var r: Dictionary = await session.act("kingWalk")
	if r.has("error"):
		_say(str(r["error"]), PP.RED)
		_busy = false
		return
	session.persist()
	b.disabled = true
	Sound.chest(false)
	if _mast != null:
		_mast.pulse()
		_fly("+%s ⟡" % Js.thousands(float(r["doubloonsAwarded"])), _mast.marker_point(), _purse_point(), Kit.SEA_GOLD, func() -> void: _purse_to(Js.num(session.profile().get("doubloons"))))
	await get_tree().create_timer(0.9).timeout
	_busy = false
	_refresh()
	_turn_page(_king_page)


# ── Spin the Capstan ───────────────────────────────────────────────────────────

func _puzzle() -> Dictionary:
	var puzzles: Array = _st["capstan"]["puzzles"]
	return puzzles[clampi(_cap_i, 0, puzzles.size() - 1)] if not puzzles.is_empty() else {}


## THE CAPSTAN'S PAGE: the three phrases as tabs, the round's bank and
## strikes, the phrase's tiles, what to do now, the letters, and Spin and the
## solve. `prev` is the phrase as it was before the last play: tiles newly
## shown turn over, the bank counts from what it was. `note` is what that play
## came to, written in chalk.
func _cap_page(prev: Dictionary = {}, note: String = "", note_c: Color = PP.CHALK) -> void:
	var cs: Dictionary = _st["capstan"]
	var puzzles: Array = cs["puzzles"]
	if puzzles.is_empty():
		var none: Label = _words(_page, "The capstan is being rigged. Come back soon.", "title", PP.CHALK_SOFT)
		none.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_pin(none, [0, 0.5, 1, 0.5], [PAD, -20, -PAD, 20])
		return
	_cap_i = clampi(_cap_i, 0, puzzles.size() - 1)
	var p: Dictionary = puzzles[_cap_i]
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pin(v, [0, 0, 1, 1], [PAD, 18, -PAD, -PAD + 8.0])
	_page.add_child(v)
	# The phrases, the bank and the strikes.
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 4)
	v.add_child(head)
	for i: int in puzzles.size():
		var mark: String = { "solved": Kit.SEP + "solved", "failed": Kit.SEP + "missed" }.get((puzzles[i] as Dictionary)["status"], "")
		var tb: Pane.PaneButton = Paper.tab("Phrase %d%s" % [i + 1, mark], i == _cap_i, true)
		var at: int = i
		tb.pressed.connect(func() -> void:
			if _busy or _wiping or at == _cap_i:
				return
			_cap_i = at
			_turn_page(_cap_page))
		head.add_child(tb)
	var gap: Control = Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_child(gap)
	_strikes_l = _words(head, "Strikes %d of %d" % [int(p["strikes"]), int(Parlor.c()["capstanMaxStrikes"])], "body_strong", PP.CHALK_SOFT)
	_strikes_l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var spacer: Control = Control.new()
	spacer.custom_minimum_size = Vector2(18, 0)
	head.add_child(spacer)
	_bank_l = _words(head, "", "display_sm", Kit.SEA_GOLD)
	_bank_l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var bank0: float = float(prev.get("bank", p["bank"])) if not prev.is_empty() else float(p["bank"])
	_bank_l.text = "Bank %s ⟡" % Js.thousands(bank0)
	if bank0 != float(p["bank"]):
		var bl: Label = _bank_l
		Motion.count(bl, bank0, float(p["bank"]), func(x: float) -> void:
			if is_instance_valid(bl):
				bl.text = "Bank %s ⟡" % Js.thousands(round(x)))
	if not prev.is_empty() and float(prev.get("strikes", 0.0)) < float(p["strikes"]):
		_strikes_l.add_theme_color_override("font_color", PP.RED)
		Motion.rise_word(_strikes_l)
	var cat: Label = _words(v, str(p["category"]), "eyebrow", PP.CHALK_SOFT)
	cat.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# The phrase's tiles, laid out by words onto lines.
	_tiles = Control.new()
	_tiles.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tiles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_child(_tiles)
	var was: Array = Js.list(prev.get("mask")) if not prev.is_empty() else []
	var k: int = 0
	for wi: int in (p["mask"] as Array).size():
		var word: Array = p["mask"][wi]
		for ci: int in word.size():
			var t: PP.Tile = PP.Tile.new()
			var ch: Variant = word[ci]
			t.letter = str(ch) if ch != null else ""
			var before: Variant = was[wi][ci] if wi < was.size() and ci < (was[wi] as Array).size() else ch
			t.shown = ch != null and before != null
			t.set_meta("word", wi)
			_tiles.add_child(t)
			if ch != null and before == null:
				t.turn_up(0.1 + k * 0.12)
				k += 1
	_tiles.resized.connect(_lay_tiles)
	_lay_tiles()
	_msg = _words(v, "", "title", PP.CHALK)
	_msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var pending: Variant = p["pendingValue"]
	if p["status"] != "active":
		_msg.text = ("Solved: %s%s+%s ⟡" % [p["phrase"], Kit.SEP, Js.thousands(float(p["earned"]))]) if p["status"] == "solved" else "Out of strikes. It was: %s" % p["phrase"]
		_msg.add_theme_color_override("font_color", PP.GOLD if p["status"] == "solved" else PP.CHALK_SOFT)
	elif note != "":
		_msg.text = note
		_msg.add_theme_color_override("font_color", note_c)
	else:
		_msg.text = ("Call a consonant: %s ⟡ for each one in the phrase" % Js.thousands(float(pending))) if pending != null else "Spin the capstan, buy a vowel for %s ⟡, or solve" % Js.thousands(float(Parlor.c()["capstanVowelCost"]))
	if note != "" or prev.is_empty():
		Motion.rise_word(_msg)
	if p["status"] != "active":
		return
	if note != "" and pending != null:
		var sub: Label = _words(v, "Call a consonant: %s ⟡ for each one in the phrase" % Js.thousands(float(pending)), "body_strong", PP.CHALK_SOFT)
		sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# The letters, two rows of thirteen.
	var keys_c: CenterContainer = CenterContainer.new()
	keys_c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(keys_c)
	var keys: GridContainer = GridContainer.new()
	keys.columns = 13
	keys.add_theme_constant_override("h_separation", 6)
	keys.add_theme_constant_override("v_separation", 6)
	keys_c.add_child(keys)
	var kw: float = clampf((_slate.size.x - PAD * 2.0 - 12.0 * 6.0) / 13.0, 34.0, 56.0)
	for code: int in range(65, 91):
		var L: String = char(code)
		var key: PP.LetterKey = PP.LetterKey.new(L)
		key.custom_minimum_size = Vector2(kw, kw)
		key.used = (p["called"] as Array).has(L)
		key.tooltip_text = ("Buy %s for %s ⟡ from the bank" % [L, Js.thousands(float(Parlor.c()["capstanVowelCost"]))]) if key.vowel else "Call %s" % L
		key.disabled = key.used or (key.vowel and (pending != null or float(p["bank"]) < float(Parlor.c()["capstanVowelCost"]))) or (not key.vowel and pending == null)
		key.pressed.connect(func() -> void: _cap_letter(L, key.vowel))
		keys.add_child(key)
	var fill: Control = Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(fill)
	# Spin, and the solve.
	var acts: HBoxContainer = HBoxContainer.new()
	acts.alignment = BoxContainer.ALIGNMENT_CENTER
	acts.add_theme_constant_override("separation", 12)
	v.add_child(acts)
	_spin_b = _primary("Spin the capstan   ·   Space")
	_spin_b.disabled = pending != null
	_spin_b.pressed.connect(_cap_spin)
	acts.add_child(_spin_b)
	var guess: LineEdit = Paper.night_field(60)
	guess.placeholder_text = "Your solve"
	guess.custom_minimum_size = Vector2(320, 48)
	guess.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var fsb: StyleBoxFlat = StyleBoxFlat.new()
	fsb.bg_color = PP.SLATE_DEEP
	fsb.border_color = Color(PP.CHALK, 0.35)
	fsb.set_border_width_all(1)
	fsb.set_corner_radius_all(Kit.R_SMALL)
	fsb.content_margin_left = 14
	fsb.content_margin_right = 14
	for st: String in ["normal", "focus"]:
		guess.add_theme_stylebox_override(st, fsb)
	guess.add_theme_color_override("font_color", PP.CHALK)
	guess.add_theme_font_override("font", Kit.font("karla", 700))
	guess.add_theme_font_size_override("font_size", 17)
	acts.add_child(guess)
	var solve: Button = _chalk_button("Solve")
	solve.pressed.connect(func() -> void: _cap_solve(guess.text))
	guess.text_submitted.connect(func(t: String) -> void: _cap_solve(t))
	acts.add_child(solve)


## The tiles onto lines (a word never split), centred, as large as fits.
func _lay_tiles() -> void:
	if _tiles == null or not is_instance_valid(_tiles):
		return
	var w: float = _tiles.size.x
	if w < 20.0:
		return
	var words: Array = []
	for t: Node in _tiles.get_children():
		var wi: int = int(t.get_meta("word"))
		while words.size() <= wi:
			words.append([])
		(words[wi] as Array).append(t)
	var tw: float = 64.0
	var lines: Array = []
	while true:
		var gap: float = tw * 0.12
		var space: float = tw * 0.6
		lines = [[]]
		var x: float = 0.0
		for word: Array in words:
			var ww: float = word.size() * tw + (word.size() - 1) * gap
			if x > 0.0 and x + space + ww > w:
				lines.append([])
				x = 0.0
			(lines[-1] as Array).append(word)
			x += (space if x > 0.0 else 0.0) + ww
		if lines.size() <= 3 or tw <= 30.0:
			break
		tw -= 4.0
	var th: float = tw * 1.24
	var gap2: float = tw * 0.12
	var space2: float = tw * 0.6
	for li: int in lines.size():
		var line: Array = lines[li]
		var lw: float = 0.0
		for wi: int in line.size():
			var word: Array = line[wi]
			lw += word.size() * tw + (word.size() - 1) * gap2 + (space2 if wi > 0 else 0.0)
		var x: float = (w - lw) / 2.0
		for wi: int in line.size():
			if wi > 0:
				x += space2
			for t: PP.Tile in line[wi]:
				t.position = Vector2(x, li * (th + gap2))
				t.size = Vector2(tw, th)
				x += tw + gap2
			x -= gap2
	_tiles.custom_minimum_size = Vector2(0, lines.size() * (th + gap2))


func _cap_spin() -> void:
	if _busy or _wiping or _wheel == null:
		return
	_busy = true
	var prev: Dictionary = _puzzle().duplicate(true)
	var r: Dictionary = await session.act("capstanSpin", [float(_cap_i)])
	if r.has("error"):
		_say(str(r["error"]), PP.RED)
		_busy = false
		return
	session.persist()
	if _spin_b != null and is_instance_valid(_spin_b):
		_spin_b.disabled = true
	Sound.cast()
	await _wheel.spin_to(int(r["wedgeIndex"]))
	_cap_angle = _wheel.angle
	Sound.clunk()
	var note: String = ""
	var nc: Color = PP.CHALK
	match str(r["outcome"]):
		"overboard":
			note = "Overboard! The round's bank is lost."
			nc = PP.RED
			Sound.slack()
		"lose_turn":
			note = "Lose a turn: a strike."
			nc = PP.RED
			Sound.slack()
		_:
			# The prize lifts off the wheel to the board.
			note = "The capstan stops on %s ⟡" % Js.thousands(float(r["wedge"]))
			nc = PP.GOLD
			var to: Vector2 = _msg.get_global_rect().get_center() if _msg != null and is_instance_valid(_msg) else _slate.get_global_rect().get_center()
			_fly("%s ⟡" % Js.thousands(float(r["wedge"])), _wheel.pointer_point(), to, PP.GOLD)
			await get_tree().create_timer(0.7).timeout
			Sound.plip()
	_refresh(false)
	_swap_page(func() -> void: _cap_page(prev, note, nc))
	_busy = false


func _cap_letter(L: String, vowel: bool) -> void:
	if _busy or _wiping:
		return
	_busy = true
	var prev: Dictionary = _puzzle().duplicate(true)
	var r: Dictionary = await session.act("capstanVowel" if vowel else "capstanConsonant", [float(_cap_i), L])
	if r.has("error"):
		_say(str(r["error"]), PP.RED)
		_busy = false
		return
	session.persist()
	var n: int = int(r["count"])
	var note: String
	var nc: Color = PP.CHALK
	if n > 0:
		note = "%d %s%s" % [n, L, ("   +%s ⟡" % Js.thousands(float(r["gained"]))) if float(r["gained"]) > 0.0 else ""]
		nc = PP.GOLD
	else:
		Sound.slack()
		note = "No %s." % L if vowel else "No %s: a strike." % L
		nc = PP.RED
	_refresh(false)
	_swap_page(func() -> void: _cap_page(prev, note, nc))
	if n > 0 and float(r["gained"]) > 0.0:
		await get_tree().create_timer(0.25 + n * 0.12).timeout
		if _msg != null and is_instance_valid(_msg) and _bank_l != null and is_instance_valid(_bank_l):
			_fly("+%s ⟡" % Js.thousands(float(r["gained"])), _msg.get_global_rect().get_center(), _bank_l.get_global_rect().get_center(), PP.GOLD)
	_busy = false


func _cap_solve(guess: String) -> void:
	if _busy or _wiping or guess.strip_edges() == "":
		return
	_busy = true
	var prev: Dictionary = _puzzle().duplicate(true)
	var r: Dictionary = await session.act("capstanSolve", [float(_cap_i), guess])
	if r.has("error"):
		_say(str(r["error"]), PP.RED)
		_busy = false
		return
	session.persist()
	_refresh(false)
	if r["correct"]:
		Sound.chest(true)
		Rumble.buzz([0, 40, 30, 60])
		_swap_page(func() -> void: _cap_page(prev))
		await get_tree().create_timer(0.6).timeout
		var from: Vector2 = _msg.get_global_rect().get_center() if _msg != null and is_instance_valid(_msg) else _slate.get_global_rect().get_center()
		if float(r["earned"]) > 0.0:
			_fly("+%s ⟡" % Js.thousands(float(r["earned"])), from, _purse_point(), Kit.SEA_GOLD, func() -> void: _purse_to(Js.num(session.profile().get("doubloons"))))
		var pts: float = float(r.get("pointsEarned", 0.0))
		if pts > 0.0:
			await get_tree().create_timer(0.12).timeout
			_fly("+%d points" % int(pts), from, _bar_point(), PP.GOLD, func() -> void:
				_paint_strip(true)
				_ranked_up(r))
	else:
		Sound.slack()
		_swap_page(func() -> void: _cap_page(prev, "Not quite: a strike.", PP.RED))
	_busy = false


# ── For the screenshot rig (tests/shot.gd) ─────────────────────────────────────

## Play the open game once: turn the first card, start the rung, or spin.
func play_for_shot() -> void:
	match tab:
		"board":
			for c: Node in _page.get_children():
				if c is PP.HandCard:
					_turn((c as PP.HandCard).card, c)
					return
		"king":
			_king_rung()
		"capstan":
			_cap_spin()


## Answer the question on the slate: "right", "wrong" or an index.
func pick_for_shot(which: String) -> void:
	if not _answering.is_valid():
		return
	var ci: int = 0
	for q: Dictionary in Parlor.bank()["questions"]:
		if q["question"] == _q_text:
			ci = int(q["correct_index"])
	var i: int = ci
	if which == "wrong":
		i = (ci + 1) % 4
		while (_cards[i] as PP.AnswerCard).disabled:
			i = (i + 1) % 4
	elif which != "right":
		i = int(which)
	_answering.call(i)
