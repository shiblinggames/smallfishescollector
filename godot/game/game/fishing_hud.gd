class_name FishingHud
extends Control
## THE HUD AND THE FISHING LOOP (Godot port of web/app/(app)/sea/FishingHere.tsx).
##
## The verdicts are the ported rules (Fishing.*); this shows them, on the web's
## timeline:
##   cast      the cast sound and pose at once, the line hitting the water at
##             600ms, the wait pose at 650ms; the waiting dots, "Waiting on a
##             bite" and the timer from 1.5s (an instant bite skips all that
##             and says so);
##   the bite  the dial springs in, the tick starts, the pad buzzes;
##   strike    the needle freezes where it is drawn; the snap, the splash at
##             the bow, and on a perfect the burst, the flash and its sound;
##             the frozen dial holds 620ms (900 on a perfect);
##   result    the XP rises off the boat, the fish flies to the hold, the card
##             arrives; a crate plays its own moment; a golden is asked about;
##             a level crossed is celebrated.
## The Tide Turner rides the dial while it is up; the wormhole rides the card.
##
## Controls: Space, Enter or the pad's A to cast and to reel in; Escape or B
## to walk away (the line stays out and resumes on the next cast here) or to
## close the card. What is in reach (the berth, a buyer) shows as a pill over
## the menus: E or the pad's Y presses it, and so does Space where there is
## no fishing to be had.

signal fishing_changed(active: bool)
## The captain asks to leave the sea (for the captains, or out of a Charter).
signal leave
## The recall pill was pressed (the sea asks the rules and takes her home).
signal recall_pressed
## The chart was asked for (its pill, or M).
signal chart_pressed
## The Locker was asked for, on a tab (and a slot).
signal locker_wanted(tab: String, slot: String)
## North of the arch: "crew", "recruits" or "ship" (the Sea opens it).
signal expedition_wanted(what: String)

const HOLD_S: float = 0.62
## A perfect holds longer than a catch so the leap lands before the card.
const HOLD_PERFECT_S: float = 1.15
const INK: Color = Kit.INK
const DIM: Color = Kit.DIM
const GOLD: Color = Kit.GOLD
## The cast and fishing action's cyan.
const TEAL: Color = Kit.CAST
## The top-centre stack (spec 1.6): the level bar at 12-52, the compass under
## it, the story line, then ONE lane for the cues, the hotspot and the course,
## with the toasts stacked under whatever it holds.
const LANE_Y: float = 216.0
const LANE_W: float = 760.0
const TOAST_W: float = 600.0
## At most this many toasts read at once; an older one leaves early.
const TOAST_MAX: int = 3

var session: Session
var boat: Boat
var leave_label: String = "Captains"
var water: Dictionary = {}
## Past the arch's sign, on the expedition side (the Sea sets it with the
## change of boat): the level bar reads Navigation and the bottom row is the
## expedition's, not fishing's.
var expedition: bool = false
var _story: StoryLine
var _story_st: Dictionary = {}
var _finn_arrow: FinnArrow
var _bottom_fish: HBoxContainer
var _orders_val: Label
var _bottom_exp: HBoxContainer
var _crew_val: Label
var _recruit_val: Label
var _ship_val: Label
var _recruit_dot: Control
var phase: String = "idle"

var _shot: Dictionary = {}
var _bait: String = "worm"
var _wait_left: float = 0.0
var _since_cast: float = 0.0
var _cast_zone: String = ""
var _mods: Dictionary = {}
var _gen: int = 0

var _name: Label
var _xp: XpBar
var _next_for: int = -1
var _next_text: String = ""
var _purse: Label
## The hotspot, lettered on the water in the lane (M6: no box, no discs).
var _spot_badge: VBoxContainer
var _spot_family: Label
var _spot_name: Label
var _spot_left: Label
var _spot_effect: Label
var _spot: Dictionary = {}
var _ledger_btn: Button
var _chest_btn: Button
var _where: Label
var _blurb: Label
var _stir: Label
var _clock: Label
var _recall: Button
var _action: DialButton
## The rod's four menus; _hold is the Hold button's count, where fish land.
var _m_loadout: Button
var _m_bait: Button
var _m_hold: Button
var _hold: Label
var _bait_val: Label
var _loadout_val: Label
## The Ancient Deep's fight in progress (BossFight), or {} for an ordinary
## fish: its name, mechanic, config, stage, the window's shrink and the
## needle's multiplier, and whether it is one of the six giants.
var _boss: Dictionary = {}
var _boss_sweep: float = 0.0
var _auto: Button
var _auto_on: bool = false
var _auto_t: float = -1.0
var _catch_t: float = 0.0
var _blocked: Label
var _status: Label
var _dots: Label
var _timer: Label
var _tide: Button
var _dial: Dial
var _card: Control
## The newest toast (its words are what was last said).
var _toast: Label
## Where the toasts stack: under the lane, or over the dial while it is up.
var _toasts: VBoxContainer
## Toasts held back while a side banner has the sky.
var _toast_wait: Array = []
var _now: float = 0.0
## The top-centre lane (cues, hotspot, course) and the corners' columns.
var _lane: VBoxContainer
var _tl: VBoxContainer
var _tr: VBoxContainer
## The hold's count held at what it was until the fish lands in it (-1: live).
var _hold_shown: int = -1
var _fly_pending: bool = false
## The waiting words have faded in for this cast.
var _wait_shown: bool = false
var _dial_tw: Tween
var _wait_tw: Tween
var _modal: Control
var _level_seen: int = 0
## An action is out with the rules (in a Charter, with the founder's game).
var _asking: bool = false
## What is in reach, and the pill that offers it.
var _reach_text: String = ""
var _reach_act: Callable = Callable()
var _reach_btn: Pane.PaneButton
## WHAT THE WATER IS DOING TO HER (SeaMap.tsx's SeaCueChip): riding, against
## or crossing a current, full sail, in the kelp. Under the water's name.
var _cues: HBoxContainer
## THE COURSE (game/course.gd): where she is headed, how long, and the
## autopilot and clear buttons. Under the cues.
var _course: HBoxContainer
signal course_autopilot
signal course_clear
var _reach_l: Label


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.make()

	var tl: VBoxContainer = _box(Vector2(20, 14), false, 580)
	tl.add_theme_constant_override("separation", 6)
	_tl = tl
	_name = Kit.lift(Kit.text(tl, "", "title", INK))
	# Your name opens the Captain's Log (game/captains_log.gd).
	_name.mouse_filter = Control.MOUSE_FILTER_STOP
	_name.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_name.tooltip_text = "The Captain's Log"
	_name.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
			open_log())
	# The level bar: centred at the top, always there (game/xp_bar.gd).
	_xp = XpBar.new()
	_place(_xp, Vector2(0.5, 0.0), Vector2(-320, 12), Vector2(640, 40))
	add_child(_xp)
	_xp.pressed.connect(open_guide)
	# The story line under it (The Long Cast), and the arrow to Finn.
	_story = StoryLine.new()
	_place(_story, Vector2(0.5, 0.0), Vector2(-StoryLine.W / 2.0, 160), Vector2(StoryLine.W, 52))
	add_child(_story)
	_story.pressed.connect(func() -> void: open_journal("story"))
	_finn_arrow = FinnArrow.new()
	# Finn is on the compass ribbon now (game/compass_ribbon.gd).
	_finn_arrow.visible = false
	add_child(_finn_arrow)
	move_child(_finn_arrow, 0)
	var purse_row: HBoxContainer = HBoxContainer.new()
	purse_row.add_theme_constant_override("separation", 10)
	purse_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tl.add_child(purse_row)
	_purse = Kit.lift(Kit.text(purse_row, "", "number", GOLD))
	# In a Charter the purse is the crew's: its ledger is a press away.
	_ledger_btn = Kit.button("Charter", "accent", "small", GOLD)
	_ledger_btn.focus_mode = Control.FOCUS_NONE
	_ledger_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_ledger_btn.visible = session.save.has("charter")
	_ledger_btn.pressed.connect(func() -> void:
		var net: CrewNet = _crew_net()
		var hand: Callable = Callable()
		var aboard: Array = []
		if net != null and net.hosting:
			hand = net.hand_over
			aboard = net._members.values()
		_open_sheet(Menus.purse_sheet(session, hand, aboard)))
	purse_row.add_child(_ledger_btn)
	_chest_btn = Kit.button("Crew chest", "accent", "small", GOLD)
	_chest_btn.focus_mode = Control.FOCUS_NONE
	_chest_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_chest_btn.visible = session.save.has("charter")
	_chest_btn.pressed.connect(func() -> void:
		var cc: CrewChest = CrewChest.new()
		cc.session = session
		_modal = cc
		cc.closed.connect(func() -> void:
			_modal = null
			refresh())
		add_child(cc))
	purse_row.add_child(_chest_btn)
	session.changed.connect(func() -> void:
		if is_inside_tree():
			refresh())
	_auto = Pane.PaneButton.new(Kit.water_pill([10, 4, 12, 4]), Kit.water_pill([10, 4, 12, 4], true))
	_auto.custom_minimum_size = Vector2(0, 28)
	_auto.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_auto.add_theme_font_override("font", Kit.tracked("karla", 700, 11, 0.12))
	_auto.add_theme_font_size_override("font_size", 11)
	_auto.icon = Skipper.tex("autocaster.png")
	_auto.expand_icon = false
	_auto.add_theme_constant_override("icon_max_width", 16)
	_auto.pressed.connect(_toggle_auto)
	tl.add_child(_auto)
	_auto_on = session.profile().get("auto_fishing_on") == true

	var tr: VBoxContainer = _box(Vector2(-20, 16), true, 360)
	tr.add_theme_constant_override("separation", 4)
	_tr = tr
	_where = Kit.lift(Kit.text(tr, "", "title", INK))
	_blurb = Kit.lift(Kit.text(tr, "", "small", Kit.INK_2))
	# What is biting best here now (core/fish_bias.gd).
	_stir = Kit.lift(Kit.text(tr, "", "small", Kit.SEA_GOLD))
	_stir.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_stir.custom_minimum_size = Vector2(360, 0)
	for l: Label in [_where, _blurb, _stir]:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var clock_row: HBoxContainer = HBoxContainer.new()
	clock_row.alignment = BoxContainer.ALIGNMENT_END
	clock_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tr.add_child(clock_row)
	# THE FREE RECALL HOME, on the clock's row: ready, or the minutes left.
	_recall = Kit.button("Recall home", "secondary", "small")
	_recall.focus_mode = Control.FOCUS_NONE
	_recall.tooltip_text = "Home to the Homestead Portal, free once a sea day"
	_recall.pressed.connect(func() -> void:
		if phase == "idle" or phase == "result":
			recall_pressed.emit()
		else:
			toast("Bring the line in first"))
	clock_row.add_child(_recall)
	var chart: Button = Kit.button("Chart  M", "secondary", "small")
	chart.focus_mode = Control.FOCUS_NONE
	chart.tooltip_text = "The world chart: where everything is, and a course to anywhere"
	chart.pressed.connect(func() -> void: chart_pressed.emit())
	clock_row.add_child(chart)
	clock_row.move_child(chart, 0)
	var clock_pill: Pane = Kit.pane(clock_row, Kit.water_pill())
	clock_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var clock_in: HBoxContainer = HBoxContainer.new()
	clock_in.add_theme_constant_override("separation", 6)
	clock_in.mouse_filter = Control.MOUSE_FILTER_IGNORE
	clock_pill.add_child(clock_in)
	_sky_arc = SkyArc.new()
	clock_in.add_child(_sky_arc)
	_clock = Kit.text(clock_in, "", "label", Color(0.82, 0.88, 0.93, 0.85))
	_clock.custom_minimum_size = Vector2(62, 0)
	_clock.tooltip_text = "The time at sea. A day is 48 minutes: 32 of daylight, 16 of night."
	var out: Button = Kit.back_pill(leave_label)
	out.size_flags_horizontal = Control.SIZE_SHRINK_END
	out.focus_mode = Control.FOCUS_NONE
	out.pressed.connect(func() -> void:
		if phase == "idle" or phase == "result":
			leave.emit()
		else:
			toast("Bring the line in first"))
	tr.add_child(out)

	_bait = str(Js.nz(session.profile().get("last_used_bait"), "worm"))
	var bottom: HBoxContainer = HBoxContainer.new()
	bottom.alignment = BoxContainer.ALIGNMENT_CENTER
	bottom.add_theme_constant_override("separation", 8)
	# ONE ROW (Kong, 2026-10-01): the bait on the line (a press puts on the
	# next one; Q for the wheel), the Locker (gear, hold, crates, log: I), and
	# the hold (a press opens it in the Locker).
	_place(bottom, Vector2(0.5, 1.0), Vector2(-460, -72), Vector2(920, 54))
	add_child(bottom)
	var bv: Array = _menu(bottom, "Bait", _toggle_bait_picker)
	_m_bait = bv[0]
	_bait_val = bv[1]
	_m_bait.tooltip_text = "Choose the bait on your line (Q for the wheel)"
	# The bait on the line, pictured, at the button's left.
	_bait_icon = TextureRect.new()
	_bait_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_bait_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_bait_icon.position = Vector2(10, 7)
	_bait_icon.size = Vector2(40, 40)
	_bait_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_m_bait.add_child(_bait_icon)
	var lv: Array = _menu(bottom, "Locker  ·  I", _open_loadout)
	_m_loadout = lv[0]
	_loadout_val = lv[1]
	_action = DialButton.new(112.0)
	# On the PRESS: a button fires on release by default, which held the
	# needle until the click came back up.
	_action.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
	_action.pressed.connect(_act)
	# Lettered on the water under the boat (below the waiting cues).
	_place(_action, Vector2(0.5, 0.5), Vector2(-220, 150), Vector2(440, 52))
	add_child(_action)
	var gv: Array = _menu(bottom, "Log", _open_log)
	_m_log = gv[0]
	_log_val = gv[1]
	_log_val.text = "Catches"
	_log_dot_c = _new_dot(_m_log)
	_log_dot = int(AlmanacData.build(session.store, session.uid).get("newCount", 0)) > 0
	_log_dot_c.set_meta("on", _log_dot)
	var hv: Array = _menu(bottom, "Hold", _open_hold)
	_m_hold = hv[0]
	_hold = hv[1]
	var ov: Array = _menu(bottom, "Orders", func() -> void: locker_wanted.emit("orders", ""))
	_orders_val = ov[1]
	_bottom_fish = bottom
	_build_expedition_row()
	_blocked = Kit.lift(Kit.text(self, "", "small", Kit.DANGER_INK))
	_blocked.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_blocked.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	# Under the Cast lettering (150 to 202), not across it.
	_place(_blocked, Vector2(0.5, 0.5), Vector2(-300, 208), Vector2(600, 28))

	_status = Kit.lift(Kit.text(self, "", "heading", INK))
	_status.add_theme_font_size_override("font_size", 21)
	Kit.lift(_status)
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dots = Kit.lift(Kit.text(self, "", "heading", Color(Kit.SEA_INK, 0.9)))
	_dots.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_timer = Kit.lift(Kit.text(self, "", "small", Color(Kit.SEA_INK, 0.6)))
	_timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_timer, Vector2(0.5, 0.5), Vector2(-150, 146), Vector2(300, 22))
	_readouts(false)

	_dial = Dial.new()
	# The dial sits beside where the line goes in (placed each frame in
	# _process), so the needle, the strike and the fight are in one place.
	_place(_dial, Vector2(0.0, 0.0), Vector2.ZERO, Vector2(320, 320))
	_dial.visible = false
	_dial.mouse_filter = Control.MOUSE_FILTER_STOP
	_dial.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and phase == "hooked":
			_dial.strike())
	_dial.struck.connect(_on_struck)
	add_child(_dial)
	_tide = Kit.button("Tide Turner", "accent", "small", Color("#c9a7ff"))
	# Clear of the Reel In lettering (-220 to 220), at its right.
	_place(_tide, Vector2(0.5, 0.5), Vector2(236, 154), Vector2(230, 44))
	_tide.visible = false
	_tide.pressed.connect(_skip)
	add_child(_tide)

	# THE LANE (spec 1.6): one owner for the top-centre stack under the story
	# line, so each pushes the next down: the cues, the hotspot, the course.
	_lane = VBoxContainer.new()
	_lane.add_theme_constant_override("separation", 6)
	_lane.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_place(_lane, Vector2(0.5, 0.0), Vector2(-LANE_W / 2.0, LANE_Y), Vector2(LANE_W, 0))
	add_child(_lane)
	_cues = HBoxContainer.new()
	_cues.alignment = BoxContainer.ALIGNMENT_CENTER
	_cues.add_theme_constant_override("separation", 8)
	_cues.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cues.custom_minimum_size = Vector2(0, 0)
	_lane.add_child(_cues)
	_build_spot()
	_course = HBoxContainer.new()
	_course.alignment = BoxContainer.ALIGNMENT_CENTER
	_course.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_course.visible = false
	_lane.add_child(_course)
	_reach_btn = Pane.PaneButton.new(Kit.water_pill(0), Kit.water_pill(0, true))
	_reach_btn.focus_mode = Control.FOCUS_NONE
	_reach_btn.visible = false
	_reach_btn.pressed.connect(_press_reach)
	add_child(_reach_btn)
	_reach_l = Label.new()
	Kit.style(_reach_l, "heading", Kit.SEA_INK)
	_reach_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_reach_btn.add_child(_reach_l)
	var key: Label = Label.new()
	key.name = "Key"
	key.text = "E"
	Kit.style(key, "chip", Kit.PAPER_INK)
	key.add_theme_font_size_override("font_size", 11)
	key.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	key.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var ks: StyleBoxFlat = StyleBoxFlat.new()
	ks.bg_color = Color(Kit.PAPER_INK, 0.06)
	ks.border_color = Color(Kit.PAPER_INK, 0.4)
	ks.set_border_width_all(1)
	ks.set_corner_radius_all(5)
	key.add_theme_stylebox_override("normal", ks)
	key.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_reach_btn.add_child(key)

	# THE TOASTS: notes stacked under the lane (placed each frame), each in,
	# held and out on the NOTE moves; nothing overwrites another.
	_toasts = VBoxContainer.new()
	_toasts.add_theme_constant_override("separation", 2)
	_toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_place(_toasts, Vector2(0.5, 0.0), Vector2(-TOAST_W / 2.0, LANE_Y), Vector2(TOAST_W, 0))
	add_child(_toasts)
	_toast = Label.new()
	_toast.visible = false
	_toasts.add_child(_toast)
	_level_seen = session.level()
	refresh()
	# What the sea owes on opening: levels not yet celebrated, then a golden
	# still waiting on an answer.
	_after_catch.call_deferred(false)


## Pin a control to a point of the screen (anchor, 0..1 each way) at an offset
## from it, with a size. `position` would be measured from the top-left of the
## screen whatever the anchor; offsets are measured from the anchor.
static func _place(c: Control, anchor: Vector2, offset: Vector2, size_px: Vector2) -> void:
	c.anchor_left = anchor.x
	c.anchor_right = anchor.x
	c.anchor_top = anchor.y
	c.anchor_bottom = anchor.y
	c.offset_left = offset.x
	c.offset_top = offset.y
	c.offset_right = offset.x + size_px.x
	c.offset_bottom = offset.y + size_px.y


## A menu button: its name small above, its value below.
func _menu(parent: Control, key: String, on_press: Callable, night: bool = false) -> Array:
	var b: Pane.PaneButton = Pane.PaneButton.new(
		{ "radius": 10, "fill": [Color(0.024, 0.055, 0.086, 0.86)], "border": [1, Color(1, 1, 1, 0.16)], "shadow": [Color(0, 0, 0, 0.35), 12, Vector2(0, 3)], "pad": 0, "night": night },
		{ "radius": 10, "fill": [Color(0.04, 0.08, 0.12, 0.92)], "border": [1, Color(1, 1, 1, 0.3)], "shadow": [Color(0, 0, 0, 0.35), 12, Vector2(0, 3)], "pad": 0, "night": night })
	b.custom_minimum_size = Vector2(0, 54)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Kit.tap(b)
	b.pressed.connect(func() -> void:
		Rumble.tap(8)
		on_press.call())
	parent.add_child(b)
	var col: VBoxContainer = VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_theme_constant_override("separation", 0)
	b.add_child(col)
	var k: Label = Kit.text(col, key, "chip", Color(0.75, 0.83, 0.89, 0.5))
	k.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var v: Label = Kit.text(col, "", "value", Color("#dfeaf2"))
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.clip_text = true
	return [b, v]


## THE EXPEDITION SIDE'S ROW (Kong, 2026-10-02: "once you cross through,
## the bottom menu items should swap to what is relevant for navigation"):
## Crew (the roster), Recruits (the board, with a dot when new hopefuls are
## in) and Ship. More join as voyages and raids are ported.
func _build_expedition_row() -> void:
	_bottom_exp = HBoxContainer.new()
	_bottom_exp.alignment = BoxContainer.ALIGNMENT_CENTER
	_bottom_exp.add_theme_constant_override("separation", 8)
	_place(_bottom_exp, Vector2(0.5, 1.0), Vector2(-300, -72), Vector2(600, 54))
	add_child(_bottom_exp)
	var cv: Array = _menu(_bottom_exp, "Crew", func() -> void: expedition_wanted.emit("crew"), true)
	_crew_val = cv[1]
	var rv: Array = _menu(_bottom_exp, "Recruits", func() -> void: expedition_wanted.emit("recruits"), true)
	_recruit_val = rv[1]
	_recruit_dot = _new_dot(rv[0] as Control)
	var sv: Array = _menu(_bottom_exp, "Ship", func() -> void: expedition_wanted.emit("ship"), true)
	_ship_val = sv[1]
	_bottom_exp.visible = false


## Which side of the arch she is on: the row and the level bar follow.
## With `animate` (a crossing, not opening the sea): the row she leaves sinks
## away, and the other rises in a button at a time.
var _side_tw: Tween


func set_side(on_expedition: bool, animate: bool = false) -> void:
	if expedition == on_expedition:
		return
	expedition = on_expedition
	# North of the reef the whole HUD is on the night paper.
	Pane.set_night(self, expedition)
	set_story(_story_st)
	var going: HBoxContainer = _bottom_exp if not expedition else _bottom_fish
	var coming: HBoxContainer = _bottom_exp if expedition else _bottom_fish
	_update_action()
	refresh()
	if _side_tw != null and _side_tw.is_valid():
		_side_tw.kill()
	if not animate:
		going.visible = false
		coming.visible = true
		return
	var home_y: float = coming.position.y
	_side_tw = create_tween()
	_side_tw.set_parallel()
	Motion.ease_exit(_side_tw, going, "modulate:a", 0.0, 0.22)
	Motion.ease_exit(_side_tw, going, "position:y", going.position.y + 26.0, 0.22)
	_side_tw.chain().tween_callback(func() -> void:
		going.visible = false
		going.modulate.a = 1.0
		going.position.y = home_y
		coming.visible = true
		coming.position.y = home_y + 26.0
		for b: Node in coming.get_children():
			(b as Control).modulate.a = 0.0)
	_side_tw.chain().tween_property(coming, "position:y", home_y, 0.38).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	var k: int = 0
	for b: Node in coming.get_children():
		_side_tw.parallel().tween_property(b, "modulate:a", 1.0, 0.25).set_delay(0.07 * k).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		k += 1


## The side she has crossed into, lettered over the water: its name large,
## a line under it, rising in and fading after a moment.
var _side_banner: Control = null


func side_banner(title: String, line: String) -> void:
	# One at a time: a newer one takes the sky.
	if is_instance_valid(_side_banner):
		Motion.leave(_side_banner, true, false)
	var v: VBoxContainer = VBoxContainer.new()
	_side_banner = v
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", 2)
	_place(v, Vector2(0.5, 0.5), Vector2(-400, -260), Vector2(800, 110))
	add_child(v)
	var t: Label = Kit.lift(Kit.text(v, title, "hero", Kit.SEA_INK))
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# The letters draw together from wide apart as it arrives.
	var fv: FontVariation = FontVariation.new()
	fv.base_font = t.get_theme_font("font")
	fv.spacing_glyph = 16
	t.add_theme_font_override("font", fv)
	# An ink rule run out under it from the middle.
	var mid: CenterContainer = CenterContainer.new()
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(mid)
	var rule: ColorRect = ColorRect.new()
	rule.color = Color(Kit.SEA_GOLD, 0.85)
	rule.custom_minimum_size = Vector2(0, 2)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mid.add_child(rule)
	var l: Label = Kit.text(v, line, "eyebrow", Kit.SEA_GOLD)
	l.add_theme_font_size_override("font_size", 14)
	Kit.lift(l)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.modulate.a = 0.0
	v.position.y += 14.0
	var tw: Tween = v.create_tween()
	# Its own move, so a newer banner's Motion.leave replaces it.
	v.set_meta("_motion", tw)
	tw.set_parallel()
	tw.tween_property(v, "modulate:a", 1.0, 0.45).set_delay(0.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(v, "position:y", v.position.y - 14.0, 0.6).set_delay(0.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_method(func(g: float) -> void: fv.spacing_glyph = int(round(g)), 16.0, 1.0, 1.1).set_delay(0.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(rule, "custom_minimum_size:x", 300.0, 0.8).set_delay(0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.chain().tween_interval(1.6)
	tw.chain().tween_property(v, "modulate:a", 0.0, 0.7).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.chain().tween_callback(v.queue_free)


## The expedition row's words: crew aboard, the board, the ship.
func _paint_expedition_row() -> void:
	if _crew_val == null:
		return
	var p: Dictionary = session.profile()
	var live: int = Crew.live(session.store).size()
	var cap: int = Crew.capacity(Crew.nav_level(p), p.get("crew_hall_tier"))
	_crew_val.text = "%d of %d aboard" % [live, cap]
	var fresh: bool = not Crew.port().is_empty() and str(p.get("last_free_recruit_date", "")) != Crew.board_key(Clock.now_ms())
	var open: int = Js.list(session.save.get("recruits")).filter(func(r: Dictionary) -> bool: return r.get("recruited") != true).size()
	_recruit_val.text = "New hopefuls" if fresh else ("%d waiting" % open if open > 0 else "Board signed")
	_recruit_dot.set_meta("on", fresh)
	_recruit_dot.queue_redraw()
	var tier: int = clampi(int(Js.num(p.get("ship_tier"))), 2, 6)
	var nm: String = "Your ship"
	for sd: Dictionary in Js.list(Rules.data().get("ships")):
		if int(sd["tier"]) == tier:
			nm = str(sd["name"])
	_ship_val.text = nm


func _box(at: Vector2, right: bool, w: float) -> VBoxContainer:
	var b: VBoxContainer = VBoxContainer.new()
	_place(b, Vector2(1.0 if right else 0.0, 0.0), at + (Vector2(-w, 0) if right else Vector2.ZERO), Vector2(w, 120))
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(b)
	return b


## THE "SOMETHING NEW" DOT on a bottom-row button (the Log, the Recruits): one
## amber, breathing while its meta "on" is set. Nothing is wrong, so not red.
func _new_dot(b: Control) -> Control:
	var d: Control = Control.new()
	d.mouse_filter = Control.MOUSE_FILTER_IGNORE
	d.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	d.draw.connect(func() -> void:
		if d.get_meta("on", false):
			var col: Color = Kit.CAUTION if Paper.is_night(d) else Kit.ink(Kit.CAUTION)
			var p: Vector2 = Vector2(d.size.x - 14.0, 12.0)
			var k: float = Motion.pulse(Time.get_ticks_msec() / 1000.0)
			d.draw_circle(p, 7.0 + k * 2.0, Color(col, 0.25))
			d.draw_circle(p, 5.0, col))
	b.add_child(d)
	return d


## THE HOTSPOT, LETTERED ON THE WATER (M6): its family and tier as an eyebrow,
## its name, the time left, and what it does, as words in the lane. No box,
## no discs. It fades in when she sails into one and out when it goes.
func _build_spot() -> void:
	_spot_badge = VBoxContainer.new()
	_spot_badge.add_theme_constant_override("separation", 0)
	_spot_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spot_badge.visible = false
	_lane.add_child(_spot_badge)
	_spot_family = Kit.lift(Kit.text(_spot_badge, "", "eyebrow", Kit.SEA_GOLD))
	_spot_family.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var sh: HBoxContainer = HBoxContainer.new()
	sh.alignment = BoxContainer.ALIGNMENT_CENTER
	sh.add_theme_constant_override("separation", 10)
	sh.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spot_badge.add_child(sh)
	_spot_name = Kit.lift(Kit.text(sh, "", "heading", Kit.SEA_INK))
	_spot_left = Kit.lift(Kit.text(sh, "", "small", Kit.INK_2))
	_spot_left.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_spot_effect = Kit.lift(Kit.text(_spot_badge, "", "small", Kit.INK_2))
	_spot_effect.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_spot_effect.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_spot_effect.custom_minimum_size = Vector2(LANE_W - 160.0, 0)
	_spot_effect.size_flags_horizontal = Control.SIZE_SHRINK_CENTER


## Where the waiting words sit: under the boat while she waits (fight =
## false), or in a fight ABOVE the dial and over the dim (stage first, then
## its pips), so the stage is never behind the ring.
func _readouts(fight: bool) -> void:
	if not fight:
		_place(_status, Vector2(0.5, 0.5), Vector2(-300, 110), Vector2(600, 32))
		_place(_dots, Vector2(0.5, 0.5), Vector2(-150, 80), Vector2(300, 30))
		return
	var top: float = _dial.position.y
	_place(_status, Vector2(0.5, 0.0), Vector2(-300, top - 72.0), Vector2(600, 32))
	_place(_dots, Vector2(0.5, 0.0), Vector2(-150, top - 38.0), Vector2(300, 30))


func _label(parent: Control, text: String, px: int, col: Color, title: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	l.add_theme_constant_override("shadow_offset_y", 2)
	if title:
		l.add_theme_font_override("font", UiTheme.title_font())
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(l)
	return l


static func _thousands(n: float) -> String:
	return Js.thousands(n)


static func length_text(inches: float) -> String:
	if inches <= 0.0:
		return ""
	if inches < 36.0:
		return "%.1f in" % inches
	var rounded: int = int(Js.round(inches))
	return "%d' %d in" % [rounded / 12, rounded % 12]


func _streak() -> int:
	return int(Js.num(session.profile().get("current_perfect_streak")))


## Everything read off the save: the purse, the level, the streak, the bait, the hold.
func refresh() -> void:
	_drain_badges()
	_paint_clues()
	_paint_expedition_row()
	_paint_orders()
	var p: Dictionary = session.profile()
	var lvl: int = session.level()
	var table: Array = Rules.data()["xpTable"]
	var xp: float = Js.num(p.get("fishing_xp"))
	_name.text = session.captain_name()
	var frac: float = 1.0
	var left: float = 0.0
	if lvl < Rules.MAX_LEVEL:
		var lo: float = float(table[lvl - 1])
		var hi: float = float(table[lvl])
		frac = (xp - lo) / maxf(1.0, hi - lo)
		left = hi - xp
	if expedition:
		# Through the arch, on the expedition side: the Navigation level.
		var nxp: float = Js.num(p.get("expedition_xp"))
		var nlv: int = Loadout.nav_level_from_xp(nxp)
		var nt: Array = Rules.data()["navXpTable"]
		var nfrac: float = 1.0
		var nleft: float = 0.0
		if nlv < 100:
			var nlo: float = float(nt[nlv - 1])
			var nhi: float = float(nt[nlv])
			nfrac = (nxp - nlo) / maxf(1.0, nhi - nlo)
			nleft = nhi - nxp
		_xp.set_values(nlv, nfrac, nleft, "", false, -1, "nav")
	else:
		# What the next level that brings anything brings (the Fishing guide).
		if _next_for != lvl:
			_next_for = lvl
			var nx: Array = LevelUp.next_unlock(lvl)
			_next_text = "Next at %d: %s" % [int(nx[0]), nx[1]] if not nx.is_empty() else ""
		_xp.set_values(lvl, frac, left, _next_text, false, _streak(), "fishing")
	_dial.streak = _streak()
	_purse.text = "%s ⟡" % _thousands(Js.num(p.get("doubloons")))
	# The bait on the line: the one chosen while any is left, else the first held.
	var held: Array = session.baits()
	var have: bool = false
	for b: Array in held:
		if b[0] == _bait:
			have = true
			_bait_val.text = "%s  %d" % [b[1], int(b[2])]
	if _bait_icon != null:
		_bait_icon.texture = Skipper.tex(Rules.bait(_bait).get("imageUrl")) if not held.is_empty() else null
	if not have and held.size() > 0:
		_bait = held[0][0]
		_bait_val.text = "%s  %d" % [held[0][1], int(held[0][2])]
	elif held.is_empty():
		_bait_val.text = "None"
	_paint_hold()
	_loadout_val.text = "Your loadout"
	_update_auto()
	_update_action()


## The hold's count. While a fish is in the air to it (_hold_shown >= 0) it
## reads what it was, and changes when the fish lands.
func _paint_hold() -> void:
	var cap: int = int(Rules.fish_hold(Js.num(session.profile().get("fish_hold_tier")))["capacity"])
	var count: int = _hold_shown if _hold_shown >= 0 else int(session.store.hold_count(session.uid))
	_hold.text = "%d/%d" % [count, cap]
	_hold.add_theme_color_override("font_color", Paper.RED if count >= cap else Kit.PAPER_INK)


## What is stirring in this water now ("Night: ... are feeding."), or "".
func set_stir(text: String) -> void:
	if _stir != null and _stir.text != text:
		_stir.text = text
		if text != "":
			Motion.rise_word(_stir)


func set_water(w: Dictionary) -> void:
	if w.get("id") == water.get("id"):
		return
	water = w
	_where.text = w.get("name", "Harbor approach")
	_blurb.text = w.get("blurb", "Sail south to fish")
	if not w.is_empty():
		toast(w["name"], "name")
	_update_action()
	# The level bar follows the side of the reef she is on.
	refresh()


const _ROMAN: Array = ["I", "II", "III"]


## The hotspot the boat is in ({} for none): lettered in the lane, with its
## countdown. Its arrival IS the announcement (no toast as well).
func set_spot(h: Dictionary) -> void:
	if h.get("key") != _spot.get("key"):
		_spot = h
		if not h.is_empty():
			var def: Dictionary = Hotspots.DEFS[h["kind"]]
			var tier: int = clampi(int(h["tier"]), 1, 3)
			# The family in its own colour (the ring on the water wears it);
			# the tier in words, not discs.
			_spot_family.text = "%s  ·  TIER %s" % [str(def["family"]).to_upper(), _ROMAN[tier - 1]]
			_spot_family.add_theme_color_override("font_color", Color(def["color"]).lerp(Kit.SEA_INK, 0.25))
			_spot_name.text = def["tiers"][tier - 1][0]
			_spot_effect.text = def["tiers"][tier - 1][1]
			_spot_badge.visible = true
			Motion.rise_word(_spot_badge)
		elif _spot_badge.visible and not _spot_badge.has_meta("_going"):
			_spot_badge.set_meta("_going", true)
			var tw: Tween = Motion.note_out(_spot_badge, false)
			if tw != null:
				tw.tween_callback(func() -> void: _spot_badge.remove_meta("_going"))
			else:
				_spot_badge.visible = false
				_spot_badge.remove_meta("_going")
	if not h.is_empty():
		if _spot_badge.has_meta("_going"):
			_spot_badge.remove_meta("_going")
		var left: int = maxi(0, int((float(h["endsAt"]) - Clock.now_ms()) / 1000.0))
		_spot_left.text = ("%dm left" % ceili(left / 60.0)) if left >= 60 else ("%ds" % left)


## THE COURSE CHIP: {label, eta, autopilot}, or {} for none. Built once and
## then only updated (the sea calls this twice a second), so its buttons
## keep their hover and a press never lands on a freed button.
var _course_words: Label
var _course_ap: Button
var _course_auto: bool = false


func set_course(info: Dictionary) -> void:
	if info.is_empty():
		if _course.visible:
			_course.visible = false
		return
	if _course_words == null:
		var p: Pane = Kit.pane(_course, Kit.water_pill([14, 4, 6, 4]))
		var row: HBoxContainer = HBoxContainer.new()
		row.name = "Row"
		row.add_theme_constant_override("separation", 10)
		p.add_child(row)
		# Inked: the pill is paper on the water, so its words are not lifted.
		_course_words = Kit.text(row, "", "chip", Kit.GOLD)
		_course_words.add_theme_font_size_override("font_size", 11)
		_course_words.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var x: Button = Kit.button("Clear", "secondary", "small")
		x.focus_mode = Control.FOCUS_NONE
		x.pressed.connect(func() -> void: course_clear.emit())
		row.add_child(x)
		_course_auto = not info.get("autopilot", false)
	var on: bool = info.get("autopilot", false)
	if on != _course_auto or _course_ap == null:
		_course_auto = on
		var row2: Node = _course_words.get_parent()
		if _course_ap != null:
			_course_ap.queue_free()
		_course_ap = Kit.button("Autopilot on" if on else "Autopilot", "accent" if on else "secondary", "small", Kit.GOLD)
		_course_ap.focus_mode = Control.FOCUS_NONE
		_course_ap.pressed.connect(func() -> void: course_autopilot.emit())
		row2.add_child(_course_ap)
		row2.move_child(_course_ap, 1)
	_course_words.text = "COURSE  ·  %s  ·  %s" % [info["label"], info["eta"]]
	if not _course.visible:
		_course.visible = true
		Motion.rise_word(_course)


## The cues, diffed by their words: a cue that stays does not bounce again,
## one that goes fades away, a new one rises in.
var _cue_labels: Dictionary = {}


func set_cues(c: Dictionary) -> void:
	var want: Array = []
	var cur: String = c.get("current", "")
	if cur != "":
		want.append(["Riding the current" if cur == "with" else ("Against the current" if cur == "against" else "Crossing a current"),
			Color("#8fe0f0") if cur == "with" else (Color("#f0a58f") if cur == "against" else Color("#c9d6e0"))])
	if c.get("full", false):
		want.append(["Full sail", Color("#f0d58a")])
	if c.get("kelp", false):
		want.append(["In the kelp", Color("#a8c483")])
	var w: String = str(c.get("weather", ""))
	if w != "":
		want.append([w, Color("#bcd0e8") if not w.begins_with("Fair wind") else Color("#d8f0c8")])
	var keep: Dictionary = {}
	for x: Array in want:
		keep[x[0]] = true
	# Those that left fade away; the separators are laid again below.
	for t: Variant in _cue_labels.keys():
		if not keep.has(t):
			var gone: Label = _cue_labels[t]
			_cue_labels.erase(t)
			if is_instance_valid(gone):
				Motion.leave(gone, true, false)
	for n: Node in _cues.get_children():
		if n.has_meta("cue_sep"):
			n.queue_free()
	var at: int = 0
	for i: int in want.size():
		if i > 0:
			var dot: Label = Kit.text(null, "·", "eyebrow", Color(Kit.SEA_INK, 0.45))
			dot.set_meta("cue_sep", true)
			dot.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			_cues.add_child(dot)
			Kit.lift(dot)
			_cues.move_child(dot, at)
			at += 1
		var text: String = want[i][0]
		var l: Label = _cue_labels.get(text)
		if l == null or not is_instance_valid(l):
			l = _cue_chip(text, want[i][1])
			_cue_labels[text] = l
		else:
			l.add_theme_color_override("font_color", want[i][1])
		_cues.move_child(l, at)
		at += 1


## A cue is lettering on the water, not a panel (Kong, 2026-10-01): the words
## in their tint, in the one recipe for lettering on the water.
func _cue_chip(text: String, col: Color) -> Label:
	var l: Label = Kit.text(_cues, text, "eyebrow", col)
	l.add_theme_font_size_override("font_size", 12)
	Kit.lift(l)
	Motion.rise_word(l)
	return l


func set_clock(label: String, sky: Dictionary = {}) -> void:
	_clock.text = label
	if not sky.is_empty() and _sky_arc != null:
		_sky_arc.u = float(sky["u"])
		_sky_arc.moon = sky["moon"] == true
		_sky_arc.queue_redraw()


var _sky_arc: SkyArc


## THE SKY IN THE CLOCK: a small arc from east to west with the sun or the
## moon where it stands in it now. Drawn in the ink of the paper the clock's
## pill is (the day's or the night's), the moon a stroked crescent.
class SkyArc:
	extends Control
	var u: float = 0.5
	var moon: bool = false

	func _ready() -> void:
		custom_minimum_size = Vector2(28, 16)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var ink: Color = Paper.ink(self)
		var c: Vector2 = Vector2(size.x / 2.0, size.y - 2.0)
		var r: float = minf(size.x / 2.0 - 2.0, size.y - 4.0)
		draw_line(Vector2(0, c.y), Vector2(size.x, c.y), Color(ink, 0.35), 1.0, true)
		draw_arc(c, r, PI, TAU, 24, Color(ink, 0.3), 1.0, true)
		# East is on the right: it rises there and sets on the left.
		var at: Vector2 = c + Vector2.from_angle(-PI * u) * r
		if moon:
			draw_arc(at, 3.2, PI * 0.35, PI * 1.65, 14, Paper.ink_soft(self), 1.8, true)
		else:
			draw_circle(at, 3.6, Paper.gold(self))


## The recall's state: ready (0), or the milliseconds until it is.
func set_recall(left_ms: float) -> void:
	var t: String = "Recall home" if left_ms <= 0.0 else "Recall in %dm" % int(ceil(left_ms / 60000.0))
	if _recall.text != t.to_upper():
		_recall.text = t.to_upper()
		_recall.modulate.a = 1.0 if left_ms <= 0.0 else 0.6


## The one button: Cast, Reel In, Cast Again, or why it cannot.
func _update_action() -> void:
	_blocked.text = ""
	var teal: bool = true
	match phase:
		"hooked":
			_action.text = "Reel In"
			_action.disabled = false
			teal = false
		"waiting", "reeling":
			_action.text = "…"
			_action.disabled = true
		_:
			_action.text = "Cast Again" if phase == "result" else "Cast"
			_action.disabled = false
			if water.is_empty():
				_action.disabled = true
				_action.text = "Sail south"
			else:
				var need: float = float((Rules.data()["zones"]["minLevel"] as Dictionary).get(water["id"], 1.0))
				var p: Dictionary = session.profile()
				if session.level() < need:
					_action.disabled = true
					_action.text = "Needs Fishing %d" % int(need)
				elif session.store.hold_count(session.uid) >= float(Rules.fish_hold(Js.num(p.get("fish_hold_tier")))["capacity"]):
					_action.disabled = true
					_action.text = "Hold Full"
					_blocked.add_theme_color_override("font_color", Kit.DANGER_INK)
					_blocked.text = "Your hold is full. Sell it to the buyer in this water, or sail it home to the market."
				elif session.baits().is_empty():
					_action.disabled = true
					_action.text = "No Bait"
					_blocked.add_theme_color_override("font_color", Kit.WARN)
					_blocked.text = "Out of bait. There are peddlers out here, and the shop ashore."
	_action.text = _action.text.to_upper()
	_action.accent = TEAL if teal else GOLD
	_action.set_lit(not _action.disabled)
	# No fishing here: the button steps aside (the reach pill takes its place).
	_action.visible = (not water.is_empty() or (phase != "idle" and phase != "result")) and _action.text != "…"


# ── What is in reach ──────────────────────────────────────────────────────────

## The sea says what the boat can reach ("" for nothing) and what pressing it
## does. A new label pops the pill in again, as the web keys it by its text.
func set_reach(text: String, act: Callable) -> void:
	_reach_act = act
	var show: bool = text != "" and _modal == null and (phase == "idle" or phase == "result")
	if text == _reach_text and _reach_btn.visible == show:
		return
	_reach_text = text
	_reach_btn.visible = show
	if not show:
		return
	_reach_l.text = text
	var w: float = Kit.font("cinzel", 700).get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
	var full: float = w + 22.0 + 10.0 + 26.0 + 22.0
	# Just above the bottom row: Cast is lettered under the boat now.
	var above: float = -72.0 - 12.0 - 56.0
	_place(_reach_btn, Vector2(0.5, 1.0), Vector2(-full / 2.0, above), Vector2(full, 44))
	_reach_l.position = Vector2(22, 10)
	var key: Label = _reach_btn.get_node("Key")
	key.position = Vector2(22 + w + 10, 10)
	key.size = Vector2(26, 24)
	_reach_btn.pivot_offset = Vector2(full / 2.0, 22)
	Motion.arrive(_reach_btn, "s")


func _press_reach() -> void:
	if _modal != null or not _reach_btn.visible or not _reach_act.is_valid():
		return
	_reach_act.call()


## The Long Cast's line under the level bar, from finnState ({} for none).
## Only on the fishing side.
func set_story(st: Dictionary) -> void:
	_story_st = st
	if expedition:
		_story.visible = false
		return
	_story.apply(st)


## Finn's place on the screen (null when there is none to point at) and his
## mark: the arrow at the edge when he has something and is off the screen.
func finn_arrow(at: Variant, mark: String) -> void:
	_finn_arrow.target = null if expedition or _modal != null else at
	_finn_arrow.mark = mark


## Charting the northern water: its XP pours into the Navigation bar from
## the water that lifted (a bay charted whole pours big).
func nav_gain(xp: float, from: Vector2, strength: float = 0.4) -> void:
	_xp.gain(xp, from, strength)


## A job handed back: its XP pours into the level bar from the slip.
func story_pour(xp: float, from: Vector2) -> void:
	_xp.gain(xp, from, 3.0)
	refresh()


## After Finn's scene: a level crossed by a job's XP gets the level card.
func after_story() -> void:
	if session.level() > _level_seen:
		_after_catch(true, false, true)


## A panel or room from the sea (ashore, a buyer, the Market) holds the HUD
## still until it closes.
func hold_for(c: Control) -> void:
	_modal = c
	_reach_btn.visible = false
	# Released once: when it says closed, or when it leaves the tree.
	var gone: Array = [false]
	var free_it: Callable = func() -> void:
		if gone[0]:
			return
		gone[0] = true
		if _modal == c:
			_modal = null
		_reach_text = ""
		refresh()
	c.tree_exited.connect(free_it)
	# A menu now fades out after it closes (Motion.dismiss): the sea is hers
	# again the moment it says closed, not when its fade has finished.
	for sg: Dictionary in c.get_signal_list():
		if sg["name"] == "closed" and (sg["args"] as Array).is_empty():
			c.connect("closed", func() -> void:
				if _modal == c:
					free_it.call(), CONNECT_ONE_SHOT)


## Whether anything is open over the sea, so the boat holds still.
func busy() -> bool:
	return _modal != null


## The Captain's Log, over the sea (pressing your name).
func open_log(view: String = "captain") -> CaptainsLog:
	if _modal != null:
		return null
	var g: CaptainsLog = CaptainsLog.new()
	g.store = session.store
	g.uid = session.uid
	g.view = view
	_modal = g
	g.closed.connect(func() -> void:
		_modal = null
		refresh())
	add_child(g)
	return g


## The Fishing Guide, over the sea (pressing the level bar).
## THE JOURNAL (the story and the people you know): from the story line, or J.
func open_journal(tab: String = "story") -> Journal:
	if _modal != null:
		return null
	var j: Journal = Journal.new()
	j.session = session
	j.tab = tab
	_modal = j
	j.closed.connect(func() -> void:
		_modal = null
		refresh())
	add_child(j)
	return j


func open_guide(view: String = "levels") -> LevelsSheet:
	if _modal != null:
		return null
	var g: LevelsSheet = LevelsSheet.new()
	g.session = session
	g._levels_view = view
	g._levels_only_skills = view == "skills"
	_modal = g
	g.closed.connect(func() -> void:
		_modal = null
		refresh())
	add_child(g)
	return g


## The crew's line, from the sea this HUD is on (null alone).
func _crew_net() -> CrewNet:
	var n: Node = get_parent()
	while n != null and not n is Sea:
		n = n.get_parent()
	return (n as Sea).net if n != null else null


func _open_sheet(s: Sheet) -> void:
	_modal = s
	s.closed.connect(func() -> void:
		_modal = null
		refresh())
	add_child(s)


func _open_bait() -> void:
	locker_wanted.emit("loadout", "bait")


## The Orders button: how many are ready to claim, else the board's count.
func _paint_orders() -> void:
	if _orders_val == null:
		return
	var ready: int = Orders.ready_count(session.store, session.uid)
	if ready > 0:
		_orders_val.text = "%d to claim" % ready
		_orders_val.add_theme_color_override("font_color", Paper.MONEY)
		return
	var st: Dictionary = RulesApi.run(session.store, session.uid, "ordersState", [])
	var done: int = 0
	for i: int in 3:
		if st["claimed"][i] == true or float(st["progress"][i]) >= float(st["orders"][i]["target"]):
			done += 1
	_orders_val.text = "%d of 3 done" % done
	_orders_val.add_theme_color_override("font_color", Kit.PAPER_INK)


func _open_hold() -> void:
	locker_wanted.emit("hold", "")


func _open_loadout() -> void:
	locker_wanted.emit("loadout", "rod")


var _bait_icon: TextureRect
var _picker: Control


## THE BAIT PICKER (Kong, 2026-10-01): a strip of paper rising over the Bait
## button with every bait aboard, pictured with its count and what it does;
## press one to put it on. Press the button again, or anywhere else, to close.
func _toggle_bait_picker() -> void:
	if _picker != null and is_instance_valid(_picker):
		_close_picker()
		return
	if phase != "idle" and phase != "result":
		toast("Bait goes on before the cast")
		return
	var held: Array = session.baits()
	if held.is_empty():
		toast("No bait aboard")
		return
	_picker = Control.new()
	_picker.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_picker.mouse_filter = Control.MOUSE_FILTER_STOP
	_picker.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and _picker != null:
			_close_picker())
	add_child(_picker)
	var card: Pane = Kit.pane(_picker, { "radius": 14, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.35)], "shadow": [Color(0, 0, 0, 0.4), 16, Vector2(0, 5)], "pad": [14, 12, 14, 12], "paper": true })
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	card.add_child(row)
	for b: Array in held:
		var def: Dictionary = Rules.bait(b[0])
		var t: Paper.Tile = Paper.Tile.new()
		t.on = b[0] == _bait
		t.label = b[1]
		t.art = Skipper.tex(def.get("imageUrl"))
		t.pigment = Color(str(def.get("color", "#5f9fb0"))).darkened(0.15)
		t.corner = "×%s" % Js.thousands(float(b[2]))
		t.custom_minimum_size = Vector2(108, 104)
		var bonus: float = Js.num(def.get("catchZoneBonus"))
		var faster: float = 1.0 - float(def.get("waitMult", 1.0))
		t.tooltip_text = "%s%s" % [("+%d° catch zone  " % int(bonus)) if bonus > 0 else "", ("%d%% faster bites" % int(round(faster * 100.0))) if faster > 0.001 else ""]
		t.pressed.connect(func() -> void:
			set_bait(b[0])
			Rumble.tap(8)
			# Said where it happened: the bait pops on the Bait button.
			_pop_bait()
			if _picker != null:
				_close_picker())
		row.add_child(t)
	# Unseen until it is measured and placed.
	card.name = "Card"
	card.modulate.a = 0.0
	await get_tree().process_frame
	if _picker == null or not is_instance_valid(_picker):
		return
	var r: Rect2 = _m_bait.get_global_rect()
	card.position = Vector2(clampf(r.position.x + r.size.x / 2.0 - card.size.x / 2.0, 12.0, size.x - card.size.x - 12.0), r.position.y - card.size.y - 10.0)
	card.position.y += 10.0
	var tw: Tween = card.create_tween().set_parallel()
	Motion.ease_fade(tw, card, "modulate:a", 1.0, 0.15)
	Motion.ease_rise(tw, card, "position:y", card.position.y - 10.0, 0.18)


## The picker goes: input stops at once, it fades and drops 6px, then is freed.
func _close_picker() -> void:
	var pk: Control = _picker
	_picker = null
	if pk == null or not is_instance_valid(pk):
		return
	pk.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var card: Control = pk.get_node_or_null("Card")
	if card == null or not pk.is_inside_tree():
		pk.queue_free()
		return
	var tw: Tween = pk.create_tween().set_parallel()
	Motion.ease_exit(tw, card, "modulate:a", 0.0, 0.12)
	Motion.ease_exit(tw, card, "position:y", card.position.y + 6.0, 0.12)
	tw.chain().tween_callback(pk.queue_free)


## The bait just put on pops on the Bait button.
func _pop_bait() -> void:
	if _bait_icon == null or not _bait_icon.is_inside_tree():
		return
	_bait_icon.pivot_offset = _bait_icon.size / 2.0
	_bait_icon.scale = Vector2.ONE * 1.16
	Motion.ease_pop(_bait_icon.create_tween(), _bait_icon, "scale", Vector2.ONE, 0.22)


## Put on the next bait held.
func _cycle_bait() -> void:
	if phase != "idle" and phase != "result":
		toast("Bait goes on before the cast")
		return
	var held: Array = session.baits()
	if held.size() < 2:
		toast("No other bait aboard" if held.size() == 1 else "No bait aboard")
		return
	var i: int = 0
	for n: int in held.size():
		if held[n][0] == _bait:
			i = n
	var nxt: Array = held[(i + 1) % held.size()]
	set_bait(nxt[0])
	Rumble.tap(8)
	_pop_bait()


## The bait on the line (the Locker's Bait slot).
func set_bait(t: String) -> void:
	_bait = t
	refresh()


func _open_log() -> void:
	_log_dot = false
	_paint_log_dot()
	locker_wanted.emit("log", "")


var _m_log: Button
var _log_val: Label
var _log_dot_c: Control
## Something new in the Log: a species first caught, a personal best, a
## trophy, a golden. Cleared when the Log is opened.
var _log_dot: bool = false


func _paint_log_dot() -> void:
	if _log_dot_c != null:
		_log_dot_c.set_meta("on", _log_dot)
		_log_dot_c.queue_redraw()


## The Almanac on its own (no sea under it).
func _open_almanac() -> void:
	var a: Almanac = Almanac.new()
	a.session = session
	_modal = a
	a.closed.connect(func() -> void:
		_modal = null
		refresh())
	get_parent().add_child(a)


# ── The Auto Caster and Auto Catcher ───────────────────────────────────────────
#
# The special slot holds the Auto Caster (or the Auto Catcher, which needs it):
# tier 1 recasts on its own 1.7s after a result (3.3s after a crate), tier 2
# also reels in a fish up to its rarity 0.42s into the bite, on the catch zone
# and never the perfect. It stops for no bait, a full hold or a golden to
# answer. The switch is remembered on the profile.

func _auto_tier() -> int:
	var p: Dictionary = session.profile()
	var slot: Variant = p.get("equipped_special")
	if (slot != "auto_caster" and slot != "auto_catcher") or not Js.truthy(p.get("has_auto_caster")):
		return 0
	return 2 if Js.truthy(p.get("has_auto_catcher")) else 1


func _auto_max_rarity() -> int:
	# Either Locker (the Relentless Catcher is bought in the Don's).
	var p: Dictionary = session.profile()
	if Gauntlet.owns(p, "dg_master_catcher"):
		return 4
	if Gauntlet.owns(p, "tireless_catcher"):
		return 3
	return 2


func _update_auto() -> void:
	var tier: int = _auto_tier()
	_auto.visible = tier > 0
	_auto.text = "%s · %s" % ["AUTO CATCHER" if tier == 2 else "AUTO CASTER", "ON" if _auto_on else "OFF"]
	# The pill is paper on the water: its words are inked, and OFF is said in
	# the words (softer ink), not by fading the whole pill.
	var day: Color = Kit.PAPER_INK if _auto_on else Kit.PAPER_INK_SOFT
	var col: Color = Kit.night_ink(day) if Paper.is_night(self) else day
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		_auto.add_theme_color_override(st, col)
	_auto.set_meta("day_font", day)


func _toggle_auto() -> void:
	_auto_on = not _auto_on
	await session.act("setAutoFishing", [_auto_on])
	session.persist()
	_update_auto()


## THE ZOOM, shown while it changes (Kong): the level as a percentage, the
## default being 100%, on a small scale with the default marked; it fades a
## moment after the last change.
var _zoom_l: Label
var _zoom_t: float = 0.0


func show_zoom(z: float) -> void:
	if _zoom_l == null:
		_zoom_l = Kit.text(self, "", "value", Kit.SEA_INK)
		_zoom_l.add_theme_font_size_override("font_size", 15)
		Kit.lift(_zoom_l)
		_zoom_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		_place(_zoom_l, Vector2(1.0, 1.0), Vector2(-340, -110), Vector2(320, 26))
	var pct: int = int(round(z / Sea.ZOOM_DEFAULT * 100.0))
	_zoom_l.text = "Zoom %d%%%s" % [pct, "  (default)" if pct == 100 else "  ·  default 100%"]
	_zoom_l.modulate.a = 1.0
	_zoom_t = 1.6


# ── Treasure hunts ───────────────────────────────────────────────────────────

var _clues_box: VBoxContainer
var _clues_sig: String = "-"


## The clues in hand, at the left: tier, step, and what it says.
func _paint_clues() -> void:
	if not Clues.on():
		return
	var p: Dictionary = session.profile()
	var hunts: Array = Clues.hunts(p)
	var sig: String = JSON.stringify(hunts)
	if sig == _clues_sig:
		return
	_clues_sig = sig
	if _clues_box == null:
		# In the top-left column, under whatever is above it (the purse, the
		# Charter's buttons, the Auto pill), never pinned over them.
		_clues_box = VBoxContainer.new()
		_clues_box.add_theme_constant_override("separation", 8)
		_clues_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_clues_box.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_clues_box.custom_minimum_size = Vector2(330, 0)
		_tl.add_child(_clues_box)
	for c: Node in _clues_box.get_children():
		c.queue_free()
	for th: Array in hunts:
		var h: Dictionary = th[1]
		var s: Dictionary = (h["steps"] as Array)[int(h["step"])]
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 1)
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_clues_box.add_child(v)
		var e: Label = Kit.lift(Kit.text(v, "%s  ·  STEP %d OF %d" % [str(Clues.TIER_NAME[th[0]]).to_upper(), int(h["step"]) + 1, (h["steps"] as Array).size()], "eyebrow", Kit.SEA_GOLD))
		var t: Label = Kit.lift(Kit.text(v, str(s["text"]), "small", Kit.SEA_INK, true))
		t.custom_minimum_size = Vector2(330, 0)
		if s.get("kind") == "trivia":
			var tier: String = th[0]
			var ab: Button = Kit.button("Answer the note", "accent", "small", Kit.SEA_GOLD)
			ab.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
			ab.mouse_filter = Control.MOUSE_FILTER_STOP
			ab.pressed.connect(func() -> void: _clue_question(tier, str(s["qid"])))
			v.add_child(ab)


## A hunt's question: the note's four answers on a slip of paper.
func _clue_question(tier: String, qid: String) -> void:
	if _modal != null:
		return
	var q: Dictionary = Parlor.question(qid)
	if q.is_empty():
		return
	var shade: Control = Control.new()
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(shade)
	_modal = shade
	var dim: ColorRect = Kit.scrim(shade)
	var cc: CenterContainer = CenterContainer.new()
	cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.add_child(cc)
	var card: Pane = Kit.pane(cc, { "radius": 10, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.4)], "shadow": [Color(0, 0, 0, 0.5), 20, Vector2(0, 6)], "pad": [26, 20, 26, 22], "paper": true })
	card.custom_minimum_size = Vector2(620, 0)
	Motion.panel_in(card)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	card.add_child(v)
	Paper.text(v, "%s  ·  THE NOTE ASKS" % str(Clues.TIER_NAME[tier]).to_upper(), "eyebrow", Paper.RED)
	Paper.text(v, str(q["question"]), "title", Paper.INK, true)
	var close: Callable = func() -> void:
		_modal = null
		Motion.dismiss(shade, card, dim)
		_clues_sig = ""
		refresh()
	for i: int in 4:
		var ob: Button = Paper.button(str(q["options"][i]))
		ob.custom_minimum_size = Vector2(0, 46)
		ob.pressed.connect(func() -> void:
			var r: Dictionary = await session.act("clueAnswer", [tier, float(i)])
			session.persist()
			close.call()
			if r.has("error"):
				toast(str(r["error"]))
			elif r.get("correct", false):
				Sound.perfect()
				toast("Right. The note gives up its next line.")
			else:
				Sound.slack()
				toast("Wrong. The ink has run; look again tomorrow."))
		v.add_child(ob)
	var back: Button = Paper.button("Not yet")
	back.pressed.connect(close)
	v.add_child(back)


# ── Achievements ─────────────────────────────────────────────────────────────

## [title, line, art] waiting to be shown, one at a time.
var _badge_q: Array = []
var _badge_t: float = 0.0


## What the rules just earned (Achievements.sweep queues it in the save),
## taken off the save and shown as notes. A great many at once (a save from
## before achievements) is one note.
func _drain_badges() -> void:
	var q: Array = Js.list(session.save.get("badges_new"))
	if q.is_empty():
		return
	session.save.erase("badges_new")
	# This machine's captain: the same achievements on Steam.
	SteamLayer.achieve(q)
	var pts: Dictionary = Rules.data()["badgePoints"]
	var defs: Dictionary = {}
	for d: Dictionary in Achievements.defs():
		defs[d["id"]] = d
	var badges: Array = q.filter(func(x: Variant) -> bool: return not str(x).begins_with("color:"))
	var cols: Array = q.filter(func(x: Variant) -> bool: return str(x).begins_with("color:"))
	if badges.size() > 3:
		var sum: float = 0.0
		for b: Variant in badges:
			sum += float(pts.get(b, 0.0))
		_badge_q.append(["ACHIEVEMENTS", "%d achievements" % badges.size(), "+%d points  ·  press the level bar to see them" % int(sum), null])
	else:
		for b: Variant in badges:
			var d: Dictionary = defs.get(b, {})
			_badge_q.append(["ACHIEVEMENT", str(d.get("name", b)), "+%d point%s  ·  %s" % [int(pts.get(b, 0.0)), "" if int(pts.get(b, 0.0)) == 1 else "s", d.get("description", "")], Skipper.tex(d.get("imageUrl"))])
	for c: Variant in cols:
		var cid: String = str(c).trim_prefix("color:")
		var nm: String = cid.capitalize()
		for cc: Dictionary in Rules.data()["characterColors"]:
			if cc["id"] == cid:
				nm = cc["name"]
		_badge_q.append(["UNLOCKED", "New colour: %s" % nm, "Earned with achievement points. Wear it from the Locker, Look.", Skipper.look_art(cid)])


var _badge_note: Control


## A note in the same slip as an achievement's: eyebrow, title, line, picture.
static var _film_quiet: bool = OS.get_environment("FILM_QUIET") != ""


func notify(eyebrow: String, title: String, line: String, art: Texture2D = null) -> void:
	_badge_q.append([eyebrow, title, line, art])


func _badge_step(delta: float) -> void:
	# Recording a film (godot/trailer, FILM_QUIET): no notices at the corner.
	if _film_quiet:
		_badge_q.clear()
		return
	_badge_t -= delta
	if _badge_t > 0.0 or _badge_q.is_empty():
		return
	var n: Array = _badge_q.pop_front()
	_badge_t = 3.2
	if _badge_note != null and is_instance_valid(_badge_note):
		Motion.leave(_badge_note)
	var note: Pane = Kit.pane(self, { "radius": 12, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.35)], "shadow": [Color(0, 0, 0, 0.35), 14, Vector2(0, 4)], "pad": [12, 8, 16, 8], "paper": true })
	note.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Unseen until it is measured and placed.
	note.modulate.a = 0.0
	_badge_note = note
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	note.add_child(row)
	if n[3] != null:
		var pic: TextureRect = TextureRect.new()
		pic.texture = n[3]
		pic.custom_minimum_size = Vector2(48, 48)
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(pic)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(col)
	Kit.text(col, n[0], "eyebrow", Paper.EYEBROW)
	Kit.text(col, n[1], "name", Kit.PAPER_INK).add_theme_font_size_override("font_size", 16)
	var line: Label = Kit.text(col, n[2], "note", Kit.PAPER_INK_SOFT)
	line.custom_minimum_size = Vector2(300, 0)
	line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	Sound.chest(false)
	await get_tree().process_frame
	if not is_instance_valid(note):
		return
	# Under the top-right column as it measures now (the water's name, its
	# blurb, a stir line that may wrap, the clock row, the back pill).
	note.position = Vector2(size.x - note.size.x - 24.0, _tr_bottom() + 12.0)
	var tw: Tween = note.create_tween()
	note.set_meta("_motion", tw)
	Motion.ease_fade(tw, note, "modulate:a", 1.0, 0.25)
	tw.parallel().tween_property(note, "position:x", note.position.x, 0.3).from(note.position.x + 40.0).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_interval(Motion.NOTE_HOLD)
	Motion.ease_fade(tw, note, "modulate:a", 0.0, Motion.NOTE_OUT)
	tw.tween_callback(note.queue_free)


## The bottom of the top-right column, in this HUD's coordinates.
func _tr_bottom() -> float:
	if _tr == null:
		return 150.0
	return _tr.position.y + _tr.get_combined_minimum_size().y


## Where the top-right lane is free from (the derby sits here): under the
## column, and under a corner note while one is up.
func notes_bottom() -> float:
	var y: float = _tr_bottom() + 12.0
	if _badge_note != null and is_instance_valid(_badge_note) and _badge_note.modulate.a > 0.01:
		y = maxf(y, _badge_note.position.y + _badge_note.size.y + 12.0)
	return y


## THE TOASTS (spec 1.6 and 1.2): each a note on the water in the toast lane,
## in on NOTE_IN, held NOTE_HOLD, out on NOTE_OUT; a newer one stacks under
## the last instead of overwriting it, a repeat only holds the one showing a
## little longer, and while a side banner has the sky they wait for it.
## tone: "" plain words, "good" good news (the gold), "name" a place or a
## headline word (Cinzel), "danger" a warning, "dim" quiet.
func toast(text: String, tone: String = "") -> void:
	if text == "":
		return
	if _toasts == null:
		return
	if is_instance_valid(_side_banner) and not _side_banner.is_queued_for_deletion():
		# A place's name is the banner's to say; anything else waits for it.
		if tone != "name":
			_toast_wait.append([text, tone])
		return
	var live: Array = []
	for n: Node in _toasts.get_children():
		if n is Label and n != _toast_stub() and n.visible and not n.has_meta("gone"):
			live.append(n)
			if (n as Label).text == text:
				n.set_meta("until", _now + Motion.NOTE_HOLD)
				_toast = n
				return
	var l: Label
	match tone:
		"name":
			l = Kit.text(_toasts, text, "heading", Kit.SEA_INK)
		"good":
			l = Kit.text(_toasts, text, "body_strong", Kit.SEA_GOLD)
		"danger":
			l = Kit.text(_toasts, text, "body_strong", Kit.DANGER_INK)
		"dim":
			l = Kit.text(_toasts, text, "body_strong", Kit.DIM)
		_:
			l = Kit.text(_toasts, text, "body_strong", Kit.SEA_INK)
	Kit.lift(l)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.set_meta("until", _now + Motion.NOTE_IN + Motion.NOTE_HOLD)
	Motion.note_in(l)
	_toast = l
	# Too many at once: the oldest leaves early.
	if live.size() >= TOAST_MAX:
		_toast_out(live[0] as Label)


## The first child of the lane: an empty, hidden label that stands for "no
## toast yet" (so _toast is never null).
func _toast_stub() -> Node:
	return _toasts.get_child(0) if _toasts != null and _toasts.get_child_count() > 0 else null


func _toast_out(l: Label) -> void:
	if l.has_meta("gone"):
		return
	l.set_meta("gone", true)
	Motion.note_out(l)


## Each frame: toasts whose time is up leave; held ones go once the banner
## has gone; the lane sits under the top stack, or over the dial while it
## is up (over the dim, above the fight's readouts).
func _toast_step(delta: float) -> void:
	_now += delta
	if not _toast_wait.is_empty() and not is_instance_valid(_side_banner):
		var held: Array = _toast_wait.duplicate()
		_toast_wait.clear()
		for w: Array in held:
			toast(w[0], w[1])
	for n: Node in _toasts.get_children():
		if n is Label and n != _toast_stub() and not n.has_meta("gone") and _now >= float(n.get_meta("until", 0.0)):
			_toast_out(n as Label)
	if _dial != null and _dial.visible:
		var bottom: float = _dial.position.y - (80.0 if _status.text != "" else 10.0)
		_toasts.grow_vertical = Control.GROW_DIRECTION_BEGIN
		_toasts.offset_top = bottom
		_toasts.offset_bottom = bottom
	else:
		var y: float = _lane.position.y + _lane.get_combined_minimum_size().y + (6.0 if _lane.get_combined_minimum_size().y > 0.0 else 0.0)
		_toasts.grow_vertical = Control.GROW_DIRECTION_END
		_toasts.offset_top = y
		_toasts.offset_bottom = y


func _set_phase(p: String) -> void:
	phase = p
	fishing_changed.emit(p != "idle" and p != "result")
	_update_action()


func _act() -> void:
	match phase:
		"idle", "result":
			cast()
		"hooked":
			_dial.strike()


# ── The loop ───────────────────────────────────────────────────────────────────

func cast() -> void:
	_nibbles = 0
	_wait_shown = false
	if _modal != null or _asking or (phase != "idle" and phase != "result") or _action.disabled:
		return
	_close_card()
	_cast_zone = water["id"]
	_asking = true
	# Where the line goes in, so a hotspot here counts (re-derived by the rules).
	var res: Dictionary = await session.act("castLine", [_bait, _cast_zone, { "x": boat.position.x, "y": boat.position.y }])
	_asking = false
	session.persist()
	if res.has("error"):
		toast(res["error"])
		refresh()
		return
	_gen += 1
	var gen: int = _gen
	_shot = res
	_mods = _tackle()
	_wait_left = maxf(float(res["waitMs"]), 760.0) / 1000.0 + 0.05
	if res.get("instantBite") == true:
		_wait_left = 0.82
		# Good news, said at the hook, in the cast's teal.
		Fx.pill(self, "Instant Bite", _hook_screen() + Vector2(0, -60.0), Kit.INK, Kit.a(Kit.CAST, 0.22), Kit.a(Kit.CAST, 0.6), 1.1)
	_since_cast = 0.0
	_set_phase("waiting")
	Rumble.tap(12)
	Sound.cast()
	boat.set_pose("cast")
	# ONE CLOCK for the line landing: the plop and the wait pose together,
	# when the rope's flight ends (Motion.CAST_LAND_S).
	get_tree().create_timer(Motion.CAST_LAND_S).timeout.connect(func() -> void:
		if gen == _gen and phase != "idle":
			Sound.line_in()
		if gen == _gen and phase == "waiting":
			boat.set_pose("wait"))
	refresh()


## What the captain's tackle does to the dial.
func _tackle() -> Dictionary:
	var p: Dictionary = session.profile()
	var rod: Dictionary = Rules.effective_rod(Js.num(p.get("rod_tier")), p.get("completionist_effects"))
	var lines: Array = Rules.data()["lines"]
	var line: Dictionary = lines[clampi(int(Js.num(p.get("line_tier"))), 0, lines.size() - 1)]
	var reels: Array = Rules.data()["reels"]
	var reel: Dictionary = reels[clampi(int(Js.num(p.get("reel_tier"))), 0, reels.size() - 1)]
	return {
		"hook": Js.num(p.get("hook_tier")), "line": float(line["penaltyMultiplier"]), "reel": float(reel["needleSpeedMultiplier"]),
		"rodCatch": Js.num(rod.get("catchZoneBonus")), "rodPerfect": Js.num(rod.get("perfectZoneBonus")),
		"retry": Js.num(rod.get("retryOnMissChance")), "snagImmune": rod.get("snagImmune") == true,
		"baitCatch": Js.num(Rules.bait(_bait).get("catchZoneBonus")), "level": session.level(),
	}


## The Tide Turner: how many skips are left this sea day, or -1 without one seated.
func _skips_left() -> int:
	var p: Dictionary = session.profile()
	if not Js.truthy(p.get("has_tide_turner")) or p.get("equipped_special") != "tide_turner":
		return -1
	var used: float = Js.num(p.get("tide_turner_used")) if p.get("tide_turner_date") == Fishing.tide_day() else 0.0
	return int(3.0 - used)


## The zones for this bite: the web's buildFishZones, then, in a fight, the
## mechanic's mods (a breathing shrink narrows the green by its breath too)
## and a giant's palette.
func _zones(breath: float = 0.0) -> Array:
	var diff: float = float(_shot["catchDifficulty"])
	var zd: Dictionary = (Rules.data()["dial"]["zoneDifficulty"] as Dictionary).get(_cast_zone, {})
	var zones: Array = Dial.build_zones(diff, _mods["hook"], _mods["line"], float(zd.get("catchMultiplier", 1.0)),
		Rules.level_catch_bonus(float(_mods["level"])) + float(_mods["baitCatch"]) + float(_mods["rodCatch"]) - breath, float(_mods["rodPerfect"]) + 1.0)
	if _boss.is_empty():
		return zones
	var shrink: float = breath if _boss["mechanic"] == "shrink" else float(_boss["shrink"])
	zones = BossFight.apply_mods(zones, _boss["mechanic"], shrink)
	if _boss["giant"]:
		zones = BossFight.palette(zones, _shot.get("vigilRank"))
	return zones


func _start_fight() -> void:
	_boss = {}
	if _cast_zone != "ancient_deep" or float(_shot["fishId"]) == FishingRules.CRATE_FISH_ID:
		return
	var fish: Dictionary = session.store.species(float(_shot["fishId"]))
	var base: Dictionary = BossFight.base_config(fish["name"])
	var mechanic: String = BossFight.WILDCARD[randi() % BossFight.WILDCARD.size()] if base.get("wildcard", false) else base["mechanic"]
	var cfg: Dictionary = BossFight.config(fish["name"], mechanic, _shot.get("vigilRank"))
	_boss = {
		"name": fish["name"], "mechanic": mechanic, "cfg": cfg, "stage": 1,
		"shrink": float(cfg.get("perfectShrinkStart", 0.0)), "mult": 1.0,
		"giant": Js.num(fish.get("sell_value")) == 0.0,
	}


func _fight_hud() -> void:
	var n: int = int(_boss["cfg"]["phases"])
	var rank: Variant = _shot.get("vigilRank")
	var pips: String = ""
	for i: int in n:
		pips += "● " if i < int(_boss["stage"]) else "○ "
	_status.text = ("Rank %s  ·  " % ["", "I", "II", "III", "IV", "V"][int(rank)] if rank != null else "") + "Stage %d/%d" % [int(_boss["stage"]), n]
	_dots.text = pips.strip_edges()
	_timer.text = ""
	_readouts(true)
	for l: Label in [_status, _dots]:
		l.modulate.a = 1.0


func _bite() -> void:
	_focus_on(true)
	var diff: float = float(_shot["catchDifficulty"])
	_start_fight()
	var zones: Array = _zones()
	var speeds: Array = Rules.data()["dial"]["fishDifficultySpeed"]
	var sp: Dictionary = speeds[clampi(int(diff) - 1, 0, 4)]
	var sweep: float = (float(sp["speedMin"]) + randf() * (float(sp["speedMax"]) - float(sp["speedMin"]))) * float(_mods["reel"])
	_dial.streak = _streak()
	_dial.mechanic = "" if _boss.is_empty() else String(_boss["mechanic"])
	_dial.rebuild = _zones if not _boss.is_empty() and _boss["mechanic"] == "shrink" else Callable()
	_dial.blackout_chance = 0.0 if _boss.is_empty() or _boss["cfg"].get("noBlackout", false) else 0.12 * diff / 5.0
	_dial.ancient_aura = not _boss.is_empty() and _boss["giant"]
	_dial.stage = 1
	_boss_sweep = sweep
	_dial.begin(zones, sweep)
	# In its place before its first frame (it showed in the corner for one),
	# then in on the instrument's arrival (its pivot is its centre).
	if _dial_tw != null and _dial_tw.is_valid():
		_dial_tw.kill()
	_place_dial()
	_dial.visible = true
	_dial.scale = Vector2.ONE
	_dial.mouse_filter = Control.MOUSE_FILTER_STOP
	Motion.arrive(_dial, "m")
	if _boss.is_empty():
		# The waiting words go as the dial comes.
		_fade_wait_out()
	else:
		if _wait_tw != null and _wait_tw.is_valid():
			_wait_tw.kill()
		_timer.text = ""
		# One message, in the toast lane over the dial: the encounter, then
		# the warning under it.
		toast("Ancient Encounter  ·  %d stages required" % int(_boss["cfg"]["phases"]), "name")
		toast("Miss once and it escapes. Stay sharp.", "danger")
		_fight_hud()
	var skips: int = _skips_left()
	_tide.visible = skips > 0
	_tide.text = ("Tide Turner · Skip · %d left" % skips).to_upper()
	Rumble.buzz(Rumble.BITE)
	Sound.dial_start(diff)
	_set_phase("hooked")


## A phase held: say so for 1.1s, then the next, harder (a closing window and a
## faster needle on a curve, a quicker needle on the ramps, a new mechanic for
## a wildcard), on a new place on the ring.
func _next_phase(result: String) -> void:
	var cfg: Dictionary = _boss["cfg"]
	if result == "perfect":
		Sound.perfect()
		Rumble.buzz(Rumble.PERFECT)
	else:
		Sound.line_in()
		Rumble.tap(6)
	_set_phase("reeling")
	var n: int = int(cfg["phases"])
	_status.text = "Stage %d/%d" % [int(_boss["stage"]), n]
	await get_tree().create_timer(1.1).timeout
	_boss["stage"] = int(_boss["stage"]) + 1
	if cfg.has("perfectShrinkStep"):
		_boss["shrink"] = float(_boss["shrink"]) + float(cfg["perfectShrinkStep"])
		if cfg.has("speedStepMult"):
			_boss["mult"] = minf(float(_boss["mult"]) * float(cfg["speedStepMult"]), 4.0)
	elif _boss["mechanic"] == "accelerate" or _boss["mechanic"] == "surge":
		_boss["mult"] = minf(float(_boss["mult"]) * 1.4, 4.0)
	if cfg.get("wildcard", false):
		var nxt: String = BossFight.WILDCARD[randi() % BossFight.WILDCARD.size()]
		_boss["mechanic"] = nxt
		_boss["shrink"] = 0.0
		_boss["mult"] = 1.5 if (nxt == "accelerate" or nxt == "surge") else 1.0
		_dial.mechanic = nxt
		_dial.rebuild = _zones if nxt == "shrink" else Callable()
	_dial.stage = int(_boss["stage"])
	_dial.next_phase(_zones(), _boss_sweep * float(_boss["mult"]))
	_fight_hud()
	_set_phase("hooked")


func _skip() -> void:
	if phase != "hooked":
		return
	if _asking:
		return
	_asking = true
	var r: Dictionary = await session.act("tideTurnerSkip")
	_asking = false
	if phase != "hooked":
		return
	session.persist()
	if r.has("error"):
		toast(r["error"])
		return
	_dial.spinning = false
	_dial.visible = false
	_tide.visible = false
	Sound.dial_stop()
	boat.set_pose("rest")
	Rumble.tap(10)
	toast("Thrown back. The streak holds. %d skip%s left this sea day." % [int(r["skipsLeft"]), "" if int(r["skipsLeft"]) == 1 else "s"])
	_set_phase("idle")
	refresh()


func _on_struck(raw: String, _angle: float) -> void:
	var result: String = "miss" if raw == "penalty" and _mods["snagImmune"] else raw
	var landed: bool = result == "perfect" or result == "catch"
	if not landed and float(_mods["retry"]) > 0.0 and randf() < float(_mods["retry"]):
		Rumble.buzz(Rumble.SECOND_WIND)
		Fx.pill(self, "Second Wind", _dial.position + Vector2(_dial.size.x / 2.0, -24.0), Kit.INK, Kit.a(Kit.TEAL, 0.22), Kit.a(Kit.TEAL, 0.6), 1.2)
		_dial.respin()
		return
	if not _boss.is_empty() and landed and int(_boss["stage"]) < int(_boss["cfg"]["phases"]):
		await _next_phase(result)
		return
	if not _boss.is_empty():
		_status.text = ""
		_dots.text = ""
		_readouts(false)
	_boss = {}
	_dial.mechanic = ""
	_dial.ancient_aura = false
	Sound.dial_stop()
	_tide.visible = false
	if result == "perfect":
		Sound.perfect()
		# The streak, heard: a step higher for each perfect in a row.
		Sound.streak(_streak() + 1)
		Rumble.buzz(Rumble.PERFECT)
		var pf: Fx.PerfectFlash = Fx.PerfectFlash.new()
		pf.at = _dial.position + _dial.size / 2.0
		add_child(pf)
	else:
		# (The plop is the cast's; the catch is heard in the reel and the
		# splash of the fight.)
		Rumble.tap(6)
	# THE FIGHT: the fish played in on the water through the hold, in place
	# of a still pause (game/reel_fight.gd). A miss and a snag speak too.
	var hold: float = HOLD_PERFECT_S if result == "perfect" else HOLD_S
	var fight: ReelFight = ReelFight.new()
	fight.boat = boat
	fight.result = result
	fight.length_s = hold
	var crate_shot: bool = float(_shot["fishId"]) == FishingRules.CRATE_FISH_ID
	fight.crate = crate_shot
	if crate_shot:
		fight.fish_art = CrateMoment._tex("%sclosed.png" % CrateMoment.TIERS.get(_shot.get("crateTier", "wooden"), CrateMoment.TIERS["wooden"])[2])
	else:
		var sp: Variant = session.store.species(float(_shot["fishId"]))
		if sp != null:
			fight.fish_art = Skipper.tex("fish/%s" % ResultCard.fish_art_path((sp as Dictionary)["name"]).get_file())
	boat.get_parent().add_child(fight)
	# The dial has had its moment (the strike, the perfect's burst): it fades
	# so the fight plays in the open, and the focus lifts with it.
	# It leaves as it came, mirrored (a fade and a slight shrink, CUBIC in);
	# on a perfect it holds until the burst ring on it has finished.
	if _dial_tw != null and _dial_tw.is_valid():
		_dial_tw.kill()
	_dial.pivot_offset = _dial.size / 2.0
	_dial_tw = _dial.create_tween()
	_dial_tw.tween_interval(0.45 if result == "perfect" else 0.22)
	_dial_tw.tween_callback(func() -> void: _dial.mouse_filter = Control.MOUSE_FILTER_IGNORE)
	Motion.ease_exit(_dial_tw, _dial, "modulate:a", 0.0, Motion.LEAVE)
	_dial_tw.parallel().tween_property(_dial, "scale", Vector2.ONE * Motion.LEAVE_SCALE, Motion.LEAVE).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	_dial_tw.tween_callback(func() -> void:
		_dial.visible = false
		_dial.modulate.a = 1.0
		_dial.scale = Vector2.ONE
		_dial.mouse_filter = Control.MOUSE_FILTER_STOP)
	_set_phase("reeling")
	await get_tree().create_timer(hold).timeout
	# The fight is over: the line comes in.
	boat.set_pose("rest")
	var before_level: int = session.level()
	var crate: bool = float(_shot["fishId"]) == FishingRules.CRATE_FISH_ID
	var r: Dictionary = {}
	# The hold reads what it held until the fish lands in it.
	_fly_pending = false
	if not crate:
		_hold_shown = int(session.store.hold_count(session.uid))
	if crate and landed:
		r = await session.act("stowCrate", [result])
	elif not crate:
		r = await session.act("reelIn", [float(_shot["fishId"]), result, _bait])
	session.persist()
	_dial.visible = false
	_set_phase("result")
	# NO CARD (Kong, 2026-10-01): the catch is a small note that floats up
	# over her and fades while the fish flies to the hold; she can cast again
	# at once. Only a wormhole (a choice to make) still brings the card.
	if r.has("error"):
		toast(str(r["error"]))
	elif crate and landed:
		_stow_card(r)
	elif r.get("caught") == true:
		_fish_card(r, result == "perfect")
	else:
		# Said where it happened: over her, where a catch's note would rise.
		var at: Vector2 = _boat_screen() + Vector2(0, -150.0)
		if result == "penalty":
			Fx.rise(self, "Snagged, bait lost", at, Kit.DANGER_INK, 16, 30.0, 1.6)
		else:
			Fx.rise(self, "Got away", at, Kit.DIM, 16, 30.0, 1.6)
	if not _fly_pending:
		_hold_shown = -1
	refresh()
	_auto_t = (3.3 if crate else 1.7) if (_auto_on and _auto_tier() > 0) else -1.0
	var giant: bool = r.get("caught") == true and (r["fish"] as Dictionary)["habitat"] == "ancient_deep" and Js.num((r["fish"] as Dictionary).get("sell_value")) == 0.0
	if giant:
		await _ceremony(r)
	if session.level() > before_level or r.get("isShiny") == true:
		# One thing at a time: the bar crosses (the XP poured, the line run
		# to full and flashed) before the level card comes.
		_after_catch(true, r.get("isShiny") == true, true)


# ── The card, and what follows it ──────────────────────────────────────────────

func _mount_card(c: Control) -> void:
	_close_card()
	_card = c
	_place(c, Vector2(0.5, 0.5), Vector2(110, -250), Vector2(440, 0))
	add_child(c)


func _close_card() -> void:
	if _card != null:
		_card.queue_free()
		_card = null


func _wire(card: ResultCard) -> void:
	card.cast_again.connect(func() -> void: cast())
	card.closed.connect(func() -> void:
		_close_card()
		_set_phase("idle"))
	card.wormhole.connect(func() -> void:
		var w: Dictionary = await session.act("rerollWormhole")
		session.persist()
		card.set_note(w["error"] if w.has("error") else "Rerolled into %s" % (w["fish"] as Dictionary)["name"])
		refresh())


func _fish_card(r: Dictionary, perfect: bool) -> void:
	# The web never passed the count, so its card read "Ancient 0 of 6"; it is
	# the wall as it stands.
	r["ancientCount"] = float(Js.list(session.profile().get("ancient_catches")).size())
	if r.get("wormhole") == true:
		var card: ResultCard = ResultCard.new()
		_mount_card(card)
		card.show_fish(r, perfect, _shot)
		_wire(card)
	else:
		_catch_note(r, perfect)
	# The catch a treasure hunt asked for.
	for st: Variant in Js.list(r.get("clueSteps")):
		var sd: Dictionary = st
		if sd.get("ok", false) and sd.has("next"):
			_badge_q.append(["%s  ·  STEP %d OF %d" % [str(Clues.TIER_NAME[sd["tier"]]).to_upper(), int(sd["stepNo"]), int(sd["of"])], "That is the fish", str(sd["next"]["text"]), Skipper.tex("sea/sea-bottle.png")])
	# An order this catch finished.
	for lbl: Variant in Js.list(r.get("ordersDone")):
		toast("Order done: %s. Claim it under Orders." % str(lbl), "good")
	# The Log has something new to show.
	if r.get("isNewSpecies") == true or r.get("isPB") == true or str(r.get("sizeTier", "")) == "trophy" or r.get("isShiny") == true:
		_log_dot = true
		_paint_log_dot()
	# The XP rises off the boat; the fish flies to the hold.
	var mid: Vector2 = Vector2(size.x / 2.0, size.y * 0.5 - 70.0)
	# What made it: the streak's multiplier, shown when it is working.
	var sm: float = Rules.streak_mult(float(_streak()), float(session.level()))
	var why: String = ("  ×%.2f streak" % sm) if sm > 1.001 else ""
	# (The perfect is announced once, by its flash over the dial; the gold
	# here says it again quietly.)
	Fx.rise(self, "+%s XP%s" % [_thousands(float(r["xpGained"])), why], mid, GOLD if perfect else Kit.UP, 20)
	# The XP flies from where the fish came up into the bar.
	var rar: float = float(Js.nz((r["fish"] as Dictionary).get("bite_rarity"), 1.0))
	var src: Vector2 = boat.get_parent().get_global_transform_with_canvas() * boat.hook_at()
	_xp.gain(float(r["xpGained"]), src, 0.6 + rar * 0.35 + (0.8 if perfect else 0.0) + minf(1.0, float(_streak()) * 0.1))
	if float(r.get("catchQty", 0.0)) > 0.0 and r.get("isShiny") != true:
		_fly_pending = _fly_to_hold(r["fish"], float(r["catchQty"]))


func _crate_card(loot: Dictionary) -> void:
	var m: CrateMoment = CrateMoment.new()
	m.tier = _shot.get("crateTier", "wooden")
	m.loot = loot
	_close_card()
	_card = m
	_place(m, Vector2(0.5, 0.5), Vector2(130, -200), Vector2(360, 0))
	add_child(m)


## A crate reeled up: it breaks the surface beside her and is hauled aboard
## into the stash, to be opened from the Locker when she likes.
func _stow_card(r: Dictionary) -> void:
	var tier: String = str(r.get("stowed", "wooden"))
	var t: Array = CrateMoment.TIERS.get(tier, CrateMoment.TIERS["wooden"])
	var cs: CrateSurface = CrateSurface.new()
	cs.tier = tier
	cs.mode = "stow"
	cs.boat = boat
	boat.get_parent().add_child(cs)
	var total: int = 0
	for k: Variant in Js.obj(r.get("stash")):
		total += int(Js.num(Js.obj(r.get("stash"))[k]))
	toast("%s stowed  ·  %d in your stash (Locker, Crates)" % [t[0], total])


## THE CATCH, IN A NOTE: a small slip of paper rising over her with the
## fish, its name, its size, and any news (a new species, a personal best, a
## trophy, a golden); it holds a moment and fades. It takes no press.
func _catch_note(r: Dictionary, perfect: bool) -> void:
	var fish: Dictionary = r["fish"]
	var rar: int = clampi(int(Js.num(fish.get("bite_rarity"))), 1, 5)
	var news: Array = []
	if r.get("isShiny") == true:
		news.append(["Golden", Paper.MONEY])
	if r.get("isNewSpecies") == true:
		news.append(["New species", Kit.ink(Kit.SKY)])
	if r.get("isPB") == true and r.get("previousBest") != null:
		news.append(["Personal best", Kit.ink(Kit.TEAL)])
	if str(r.get("sizeTier", "")) == "trophy":
		news.append(["Trophy", Paper.RED])
	var note: Pane = Kit.pane(self, { "radius": 12, "fill": [Kit.PAPER], "border": [1, Color(Paper.rarity(rar), 0.7)], "shadow": [Color(0, 0, 0, 0.35), 12, Vector2(0, 4)], "pad": [10, 6, 14, 6], "paper": true })
	note.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Unseen until it is measured and placed (it flashed in the corner for a
	# frame before).
	note.modulate.a = 0.0
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	note.add_child(row)
	var art: TextureRect = TextureRect.new()
	art.texture = Skipper.fish_thumb(fish["name"])
	art.custom_minimum_size = Vector2(54, 40)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if r.get("isShiny") == true:
		var gm: ShaderMaterial = ShaderMaterial.new()
		gm.shader = load("res://game/golden.gdshader")
		art.material = gm
	row.add_child(art)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(col)
	var name_l: Label = Kit.text(col, fish["name"], "name", Kit.PAPER_INK)
	name_l.add_theme_font_size_override("font_size", 16)
	var bits: Array = [Almanac.RARITY_NAMES[rar - 1]]
	if float(r.get("sizeIn", 0.0)) > 0.0:
		bits.append(length_text(float(r["sizeIn"])))
	if float(r.get("catchQty", 1.0)) > 1.0:
		bits.append("×%d" % int(r["catchQty"]))
	if perfect:
		bits.append("Perfect")
	Kit.text(col, "  ·  ".join(PackedStringArray(bits)), "note", Paper.rarity(rar).darkened(0.25))
	for n: Array in news:
		Kit.text(col, "★ " + str(n[0]), "small", n[1])
	await get_tree().process_frame
	# SMOOTH, AND WITH HER (Kong, 2026-10-02: it stuttered): it rides over
	# the boat every frame as she sails, rising quickly into place and then
	# holding still, never a slow crawl (a control creeping a pixel every few
	# frames is what stuttered: they snap to whole pixels).
	note.pivot_offset = note.size / 2.0
	note.scale = Vector2.ONE * float(Motion.ARRIVE_S[1])
	note.modulate.a = 0.0
	var hold: float = 2.0 + 0.8 * news.size()
	var rise: Array = [0.0]
	var place: Callable = func() -> void:
		if not is_instance_valid(note) or not is_instance_valid(boat):
			return
		var at: Vector2 = boat.get_parent().get_global_transform_with_canvas() * boat.position
		note.position = (at + Vector2(-note.size.x / 2.0, -150.0 - note.size.y - rise[0])).round()
	place.call()
	get_tree().process_frame.connect(place)
	note.tree_exiting.connect(func() -> void: get_tree().process_frame.disconnect(place))
	var tw: Tween = note.create_tween()
	tw.set_parallel()
	Motion.ease_fade(tw, note, "modulate:a", 1.0, Motion.NOTE_IN)
	Motion.ease_pop(tw, note, "scale", Vector2.ONE, float(Motion.ARRIVE_S[2]))
	tw.tween_method(func(v: float) -> void: rise[0] = v, -14.0, 0.0, 0.4).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.chain().tween_interval(hold)
	tw.chain().set_parallel()
	Motion.ease_fade(tw, note, "modulate:a", 0.0, Motion.NOTE_OUT)
	tw.tween_method(func(v: float) -> void: rise[0] = v, 0.0, 22.0, Motion.NOTE_OUT).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(note.queue_free)


func _note_card(title: String, body: String) -> void:
	var card: ResultCard = ResultCard.new()
	_mount_card(card)
	card.show_note(title, body)
	_wire(card)


## HoldFlight: the fish, as a dark shape, thrown from where it came up to
## the hold; the count there changes only when it lands. False when there is
## no art to throw (the count then changes at once).
func _fly_to_hold(fish: Dictionary, qty: float) -> bool:
	var path: String = ResultCard.fish_art_path(fish["name"])
	if not ResourceLoader.exists(path):
		return false
	var t: TextureRect = TextureRect.new()
	t.texture = load(path)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.modulate = Color(0.05, 0.1, 0.14, 0.0)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(t)
	t.custom_minimum_size = Vector2(64, 40)
	t.size = Vector2(64, 40)
	t.pivot_offset = Vector2(32, 20)
	var from: Vector2 = _hook_screen() - t.size / 2.0
	var to: Vector2 = _hold.get_global_rect().get_center() - global_position - t.size / 2.0
	t.position = from
	if qty > 1.0:
		var c: Label = _label(t, "×%d" % int(qty), 14, GOLD, true)
		c.position = Vector2(40, -8)
	var fly: Callable = func(u: float) -> void:
		var x: float = lerpf(from.x, to.x, u * u * (3.0 - 2.0 * u))
		var peak: float = minf(from.y, to.y) - 54.0
		var y: float = lerpf(from.y, peak, u / 0.42) if u < 0.42 else lerpf(peak, to.y, (u - 0.42) / 0.58)
		t.position = Vector2(x, y)
		t.scale = Vector2.ONE * lerpf(1.0, 0.34, u)
		t.modulate.a = clampf(u / 0.22, 0.0, 1.0)
	var tw: Tween = create_tween()
	tw.tween_method(fly, 0.0, 1.0, 0.62)
	tw.tween_callback(func() -> void:
		t.queue_free()
		Rumble.tap(8)
		# It has landed: now the count changes, with a thump.
		_hold_shown = -1
		_paint_hold()
		_hold.pivot_offset = _hold.size / 2.0
		var knock: Tween = create_tween()
		knock.tween_property(_hold, "scale", Vector2(1.14, 1.14), 0.08).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		Motion.ease_pop(knock, _hold, "scale", Vector2.ONE, 0.22))
	return true


## Where the hook is on the screen now (this HUD's coordinates).
func _hook_screen() -> Vector2:
	if boat == null or not is_instance_valid(boat) or boat.get_parent() == null:
		return Vector2(size.x / 2.0, size.y * 0.42)
	return (boat.get_parent() as CanvasItem).get_global_transform_with_canvas() * boat.hook_at() - global_position


## Where the boat is on the screen now (this HUD's coordinates).
func _boat_screen() -> Vector2:
	if boat == null or not is_instance_valid(boat) or boat.get_parent() == null:
		return Vector2(size.x / 2.0, size.y / 2.0)
	return (boat.get_parent() as CanvasItem).get_global_transform_with_canvas() * boat.position - global_position


## Wait (at most a moment) for the level bar's crossing to play out: the XP
## pours, the line runs to full and flashes. Then the level card may come.
func _await_crossing() -> void:
	if _xp == null or not _xp.crossing():
		return
	var done: Array = [false]
	var on_done: Callable = func() -> void: done[0] = true
	_xp.crossing_done.connect(on_done, CONNECT_ONE_SHOT)
	var waited: float = 0.0
	while not done[0] and waited < 1.2 and is_inside_tree():
		await get_tree().process_frame
		waited += get_process_delta_time()
	if _xp.crossing_done.is_connected(on_done):
		_xp.crossing_done.disconnect(on_done)


## A giant landed: the first time, the slain cinematic and then Finn's words;
## a rank climbed, the rank-up; all six mastered, the capstone.
func _ceremony(r: Dictionary) -> void:
	var fish: Dictionary = r["fish"]
	var scenes: Array = []
	if r.get("isNewSpecies") == true:
		var count: int = Js.list(session.profile().get("ancient_catches")).size()
		scenes.append(["slain", { "id": fish["id"], "name": fish["name"], "count": count, "total": 6 }])
		var beat: Variant = (Rules.data()["finnAncientBeats"] as Dictionary).get(Js.key(fish["id"]))
		if beat != null:
			scenes.append(["finn", { "beat": beat }])
	if r.get("vigilRankUp") != null:
		scenes.append(["rank_up", { "name": fish["name"], "from": (r["vigilRankUp"] as Dictionary)["from"], "to": (r["vigilRankUp"] as Dictionary)["to"] }])
	if r.get("vigilPetGranted") == true:
		scenes.append(["capstone", { "species": func(id: float) -> Variant: return session.store.species(id) }])
	for sc: Array in scenes:
		if sc[0] == "rank_up" or sc[0] == "capstone":
			await get_tree().create_timer(1.5).timeout
		var a: AncientScenes = AncientScenes.new()
		a.kind = sc[0]
		a.data = sc[1]
		_modal = a
		add_child(a)
		await a.done
		_modal = null
	refresh()
	if r.get("vigilPetGranted") == true:
		boat.set_look(Skipper.look_of(session.profile()))


## After a catch (and on opening the sea): celebrate levels crossed, then ask
## about any golden still waiting. One at a time. shiny: this catch was the
## golden, so its note holds a beat before the choice comes. wait_bar: the
## level card waits for the level bar's crossing to play out first. While a
## card waits its turn it is already the modal (the boat holds, no cast),
## and it is put on the screen when its moment comes.
func _after_catch(from_catch: bool, shiny: bool = false, wait_bar: bool = false) -> void:
	if session.level() > _level_seen or not from_catch:
		var claim: Dictionary = await session.act("claimFishingLevelRewards")
		# Navigation levels raise the ship's upgrades for free (port rules).
		var floors: Variant = await session.act("levelFloors")
		if floors is Array and not (floors as Array).is_empty():
			for f: Array in floors:
				toast("Fishing %d: %s upgraded for free" % [int(f[2]), { "hull_speed_tier": "Hull", "hull_handling_tier": "Rudder", "hull_accel_tier": "Rig" }.get(f[0], f[0])], "good")
		session.persist()
		_level_seen = session.level()
		if float(claim["to"]) > float(claim["from"]):
			var lu: LevelUp = LevelUp.new()
			lu.claim = claim
			_modal = lu
			# The cast lettering steps aside while the level is shown.
			_action.visible = false
			if wait_bar:
				await _await_crossing()
			add_child(lu)
			await lu.closed
			_modal = null
			refresh()
	var held: Variant = await session.act("heldGolden")
	var first: bool = true
	while held != null:
		var g: GoldenChoice = GoldenChoice.new()
		g.session = session
		g.golden = held
		_modal = g
		var said: Array = [false]
		g.answered.connect(func() -> void: said[0] = true)
		var beat: bool = first and shiny and from_catch
		if beat:
			# The golden's own beat: its note is read first, then the choice
			# arrives with the chest and the golden rumble.
			await get_tree().create_timer(Motion.GOLDEN_HOLD).timeout
		first = false
		if said[0]:
			# Answered before it was shown (a script did it): it never shows.
			if is_instance_valid(g) and not g.is_queued_for_deletion():
				g.queue_free()
		else:
			if beat:
				Sound.chest(true)
				Rumble.buzz(Rumble.GOLDEN)
			add_child(g)
			while not said[0] and is_instance_valid(g):
				await get_tree().process_frame
		_modal = null
		refresh()
		held = await session.act("heldGolden")


## THE BITE COMING: the bobber dips twice before the fish takes it, with a
## soft plip each time, so the bite lands as a payoff and not a surprise.
## (Only on a wait long enough to have them; the rules' wait is unchanged.)
var _nibbles: int = 0


func _nibble() -> void:
	_nibbles += 1
	boat.nibble()


func _place_dial() -> void:
	# FOCUS (Kong, 2026-10-01): the dial in the middle of the screen, and
	# everything else dimmed behind it while a fish is on.
	var vp: Vector2 = get_viewport_rect().size
	_dial.position = (vp - _dial.size) / 2.0 + Vector2(0, -30)


var _focus: ColorRect


func _focus_on(on: bool) -> void:
	if _focus == null:
		_focus = ColorRect.new()
		_focus.color = Color(Kit.SCRIM_BASE, 0.0)
		_focus.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_focus.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(_focus)
	if on:
		# THE FIGHT'S LAYERS (spec 1.6): the dim, then the dial, then what the
		# fight says (its stage and pips, the toasts over the dial), then the
		# Reel In lettering, then the Tide Turner. Nothing that matters is
		# left under the dim.
		move_child(_focus, -1)
		move_child(_dial, -1)
		move_child(_status, -1)
		move_child(_dots, -1)
		move_child(_toasts, -1)
		move_child(_action, -1)
		move_child(_tide, -1)


func _process(delta: float) -> void:
	_badge_step(delta)
	_toast_step(delta)
	if _focus != null:
		var want: float = Kit.SCRIM_FOCUS if _dial.visible else 0.0
		_focus.color.a = lerpf(_focus.color.a, want, 1.0 - exp(-delta * (10.0 if want > 0.0 else 6.0)))
	# One headline at a time: the story line and the lane step back while a
	# side banner has the sky, and the story line while a fight's stage is
	# lettered over the dial where it sits.
	var banner: bool = is_instance_valid(_side_banner)
	var k: float = Motion.hover_k(delta)
	_lane.modulate.a = lerpf(_lane.modulate.a, 0.0 if banner else 1.0, k)
	_story.modulate.a = lerpf(_story.modulate.a, 0.0 if banner or (_dial.visible and _status.text != "") else 1.0, k)
	if _log_dot and _log_dot_c != null:
		_log_dot_c.queue_redraw()
	if _recruit_dot != null and _recruit_dot.get_meta("on", false):
		_recruit_dot.queue_redraw()
	if _zoom_t > 0.0:
		_zoom_t -= delta
		_zoom_l.modulate.a = clampf(_zoom_t / 0.5, 0.0, 1.0)
	if _dial.visible:
		_place_dial()
	if phase == "waiting":
		_wait_left -= delta
		_since_cast += delta
		if _since_cast + _wait_left > 1.8:
			if _nibbles == 0 and _wait_left < 1.15:
				_nibble()
			elif _nibbles == 1 and _wait_left < 0.5:
				_nibble()
		if _since_cast >= 1.5:
			if not _wait_shown:
				# The waiting words fade in, once a cast.
				_wait_shown = true
				if _wait_tw != null and _wait_tw.is_valid():
					_wait_tw.kill()
				_wait_tw = create_tween().set_parallel(true)
				for l: Label in [_status, _dots, _timer]:
					l.modulate.a = 0.0
					Motion.ease_fade(_wait_tw, l, "modulate:a", 1.0, 0.25)
			var n: int = int(_since_cast / 0.22) % 3
			_dots.text = ["●  ·  ·", "·  ●  ·", "·  ·  ●"][n]
			_status.text = "Waiting on a bite"
			if session.profile().get("show_wait_timer") != false:
				_timer.text = "%.1fs" % _since_cast
		if _wait_left <= 0.0:
			_bite()
	if phase == "hooked" and _auto_on and _auto_tier() == 2 and float(_shot["fishId"]) != FishingRules.CRATE_FISH_ID \
			and float(Js.nz(_shot.get("biteRarity"), 1.0)) <= _auto_max_rarity():
		_catch_t += delta
		if _catch_t >= 0.42 and _dial.zone_at(_dial.angle) == "catch":
			_dial.strike()
	else:
		_catch_t = 0.0
	if _auto_t >= 0.0:
		_auto_t -= delta
		if _auto_t < 0.0 and phase == "result" and _modal == null and _auto_on and not _action.disabled:
			cast()


## The waiting words go as the dial comes: a quick fade, then cleared.
func _fade_wait_out() -> void:
	if _wait_tw != null and _wait_tw.is_valid():
		_wait_tw.kill()
	_wait_shown = false
	if _status.text == "" and _dots.text == "" and _timer.text == "":
		return
	_wait_tw = create_tween().set_parallel(true)
	for l: Label in [_status, _dots, _timer]:
		Motion.ease_fade(_wait_tw, l, "modulate:a", 0.0, 0.12)
	_wait_tw.chain().tween_callback(func() -> void:
		if phase == "waiting":
			return
		if _boss.is_empty():
			_status.text = ""
			_dots.text = ""
		_timer.text = ""
		for l: Label in [_status, _dots, _timer]:
			l.modulate.a = 1.0)


func _unhandled_input(event: InputEvent) -> void:
	if _modal != null:
		return
	if event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo and (event as InputEventKey).keycode == KEY_J and not expedition:
		open_journal("story")
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("reach") or (event.is_action_pressed("fish_act") and water.is_empty() and _reach_btn.visible):
		_press_reach()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("fish_act"):
		if phase == "idle" or phase == "result":
			cast()
		elif phase == "hooked":
			_dial.strike()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("fish_back"):
		if phase == "waiting" or phase == "hooked":
			if _wait_tw != null and _wait_tw.is_valid():
				_wait_tw.kill()
			if _dial_tw != null and _dial_tw.is_valid():
				_dial_tw.kill()
			_dial.visible = false
			_dial.modulate.a = 1.0
			_dial.scale = Vector2.ONE
			_tide.visible = false
			_status.text = ""
			_dots.text = ""
			_timer.text = ""
			_wait_shown = false
			_readouts(false)
			for l: Label in [_status, _dots, _timer]:
				l.modulate.a = 1.0
			Sound.dial_stop()
			boat.set_pose("rest")
			_boss = {}
			_dial.mechanic = ""
			_dial.ancient_aura = false
			toast("You walked away. The line is still out.")
			_set_phase("idle")
		elif phase == "result":
			_close_card()
			_set_phase("idle")
		get_viewport().set_input_as_handled()
