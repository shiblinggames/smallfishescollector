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
##             arrives; a crate is stowed; a golden is asked about; a level
##             crossed is celebrated.
## The Tide Turner rides the dial while it is up; the wormhole rides the card.
## The loop itself is game/fishing_loop.gd; this file is the HUD it plays on
## (the rows, the corners, the lane, the dial and its readouts, the panels).
##
## Controls: Space, Enter or the pad's A to cast and to reel in; Escape or B
## to walk away (the line stays out and resumes on the next cast here) or to
## close the card. What is in reach (the berth, a buyer) shows as a pill over
## the menus: E or the pad's Y presses it, and so does Space where there is
## no fishing to be had.

signal fishing_changed(active: bool)
## The recall pill was pressed (the sea asks the rules and takes her home).
signal recall_pressed
## The settings button at the top right (Kong, 2026-10-09): the Esc menu.
signal menu_pressed
## The chart was asked for (its pill, or M).
signal chart_pressed
## The Locker was asked for, on a tab (and a slot).
signal locker_wanted(tab: String, slot: String)
## North of the arch: "crew", "recruits" or "ship" (the Sea opens it).
signal expedition_wanted(what: String)

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
var water: Dictionary = {}
## Past the arch's sign, on the expedition side (the Sea sets it with the
## change of boat): the level bar reads Navigation and the bottom row is the
## expedition's, not fishing's.
var expedition: bool = false
var _story: StoryLine
var _story_st: Dictionary = {}
var _bottom_fish: HBoxContainer
var _orders_val: Label
var _bottom_exp: HBoxContainer
var _crew_val: Label
var _recruit_val: Label
var _ship_val: Label
var _recruit_dot: Control
## The bait on the line.
var _bait: String = "worm"

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
var _auto: Button
var _auto_on: bool = false
var _blocked: Label
var _status: Label
var _dots: Label
var _timer: Label
var _tide: Button
var _dial: Dial
## The top-centre lane (cues, hotspot, course) and the corners' columns.
var _lane: VBoxContainer
var _tl: VBoxContainer
var _tr: VBoxContainer
## The hold's count held at what it was until the fish lands in it (-1: live).
var _hold_shown: int = -1
var _modal: Control
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

## THE PARTS (split out of this file on 2026-10-10, for size): the fishing
## loop (game/fishing_loop.gd) holds the loop's state; the notes, the bait
## picker and the treasure hunts' clues each hold their own. What other files
## read of the loop and the notes is forwarded below, under the same names.
const FishingLoop = preload("res://game/fishing_loop.gd")
const HudNotes = preload("res://game/fishing_hud_notes.gd")
const HudBait = preload("res://game/fishing_hud_bait.gd")
const HudClues = preload("res://game/fishing_hud_clues.gd")
var _loop: FishingLoop
var _notes: HudNotes
var _bait_picker: HudBait
var _clues: HudClues

## The loop's phase: idle, waiting, hooked, reeling or result.
var phase: String:
	get:
		return _loop.phase
	set(v):
		_loop.phase = v
var _shot: Dictionary:
	get:
		return _loop._shot
	set(v):
		_loop._shot = v
var _wait_left: float:
	get:
		return _loop._wait_left
	set(v):
		_loop._wait_left = v
var _cast_zone: String:
	get:
		return _loop._cast_zone
	set(v):
		_loop._cast_zone = v
var _mods: Dictionary:
	get:
		return _loop._mods
	set(v):
		_loop._mods = v
var _boss: Dictionary:
	get:
		return _loop._boss
	set(v):
		_loop._boss = v
var _card: Control:
	get:
		return _loop._card
	set(v):
		_loop._card = v
var _level_seen: int:
	get:
		return _loop._level_seen
	set(v):
		_loop._level_seen = v
## The newest toast (its words are what was last said).
var _toast: Label:
	get:
		return _notes._toast


func _init() -> void:
	_loop = FishingLoop.new(self)
	_notes = HudNotes.new(self)
	_bait_picker = HudBait.new(self)
	_clues = HudClues.new(self)


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
	# The story line under it (The Long Cast). Finn is on the compass ribbon
	# (game/compass_ribbon.gd).
	_story = StoryLine.new()
	_place(_story, Vector2(0.5, 0.0), Vector2(-StoryLine.W / 2.0, 160), Vector2(StoryLine.W, 52))
	add_child(_story)
	_story.pressed.connect(func() -> void: open_journal("story"))
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

	var tr: VBoxContainer = _box(Vector2(-20, 14), true, 520)
	tr.add_theme_constant_override("separation", 4)
	_tr = tr
	# THE TOP RIGHT ROW (Kong, 2026-10-09: it sat "on a different plane" from
	# the Auto Catcher, and the Captains pill "is weird"): the chart, the
	# recall, the clock and the settings button, all water pills like the
	# top left's, level with the captain's name. Settings opens the Esc menu
	# (Captains and Leave the Charter live there now).
	var clock_row: HBoxContainer = HBoxContainer.new()
	clock_row.alignment = BoxContainer.ALIGNMENT_END
	clock_row.add_theme_constant_override("separation", 6)
	clock_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tr.add_child(clock_row)
	_where = Kit.lift(Kit.text(tr, "", "title", INK))
	_blurb = Kit.lift(Kit.text(tr, "", "small", Kit.INK_2))
	# What is biting best here now (core/fish_bias.gd).
	_stir = Kit.lift(Kit.text(tr, "", "small", Kit.SEA_GOLD))
	_stir.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_stir.custom_minimum_size = Vector2(360, 0)
	for l: Label in [_where, _blurb, _stir]:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	# THE FREE RECALL HOME, on the clock's row: ready, or the minutes left.
	_recall = _water_button("Recall home")
	_recall.focus_mode = Control.FOCUS_NONE
	_recall.tooltip_text = "Home to the Homestead Portal, free once a sea day"
	_recall.pressed.connect(func() -> void:
		if phase == "idle" or phase == "result":
			recall_pressed.emit()
		else:
			toast("Bring the line in first"))
	clock_row.add_child(_recall)
	var chart: Button = _water_button("CHART  M")
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
	var gear: Button = _water_button("")
	gear.tooltip_text = "Settings, captains and quit  (Esc)"
	gear.custom_minimum_size = Vector2(32, 28)
	var cog: Control = Control.new()
	cog.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cog.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cog.draw.connect(func() -> void: _draw_cog(cog))
	gear.add_child(cog)
	gear.pressed.connect(func() -> void: menu_pressed.emit())
	clock_row.add_child(gear)

	_bait = str(Js.nz(session.profile().get("last_used_bait"), "worm"))
	var bottom: HBoxContainer = HBoxContainer.new()
	bottom.alignment = BoxContainer.ALIGNMENT_CENTER
	bottom.add_theme_constant_override("separation", 8)
	# ONE ROW (Kong, 2026-10-01): the bait on the line (a press opens the
	# picker; Q for the wheel), the Locker (gear, hold, crates, log: I), and
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
	_loop._readouts(false)

	_dial = Dial.new()
	# The dial sits beside where the line goes in (placed each frame in
	# _process), so the needle, the strike and the fight are in one place.
	_place(_dial, Vector2(0.0, 0.0), Vector2.ZERO, Vector2(320, 320))
	_dial.visible = false
	_dial.mouse_filter = Control.MOUSE_FILTER_STOP
	_dial.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and phase == "hooked":
			_dial.strike())
	_dial.struck.connect(_loop._on_struck)
	add_child(_dial)
	_tide = Kit.button("Tide Turner", "accent", "small", Color("#c9a7ff"))
	# Clear of the Reel In lettering (-220 to 220), at its right.
	_place(_tide, Vector2(0.5, 0.5), Vector2(236, 154), Vector2(230, 44))
	_tide.visible = false
	_tide.pressed.connect(_loop._skip)
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

	_notes.build()
	_level_seen = session.level()
	refresh()
	# What the sea owes on opening: levels not yet celebrated, then a golden
	# still waiting on an answer.
	_loop._after_catch.call_deferred(false)


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


## A small button on the water, as the Auto Catcher's: the top corners' one look.
func _water_button(t: String) -> Button:
	var bt: Pane.PaneButton = Pane.PaneButton.new(Kit.water_pill([10, 4, 12, 4]), Kit.water_pill([10, 4, 12, 4], true))
	bt.text = t
	bt.custom_minimum_size = Vector2(0, 28)
	bt.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bt.focus_mode = Control.FOCUS_NONE
	bt.add_theme_font_override("font", Kit.tracked("karla", 700, 11, 0.12))
	bt.add_theme_font_size_override("font_size", 11)
	return bt


## The settings cog, drawn: a ring of eight teeth round a hollow hub.
func _draw_cog(c: Control) -> void:
	var o: Vector2 = c.size / 2.0
	var col: Color = Kit.SEA_INK
	var pts: PackedVector2Array = PackedVector2Array()
	for i: int in 32:
		var a: float = TAU * i / 32.0
		var r: float = 7.5 if (i % 4) < 2 else 5.6
		pts.append(o + Vector2.from_angle(a + TAU / 64.0) * r)
	c.draw_colored_polygon(pts, col)
	c.draw_circle(o, 2.4, Kit.SEA_SHADE)


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
	_notes._drain_badges()
	_clues._paint_clues()
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
		_loop._after_catch(true, false, true)


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


## The Fishing Guide, over the sea (pressing the level bar).
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


## THE BAIT PICKER (game/fishing_hud_bait.gd): opened by the Bait button.
func _toggle_bait_picker() -> void:
	await _bait_picker._toggle_bait_picker()


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


# ── Notes (game/fishing_hud_notes.gd) ────────────────────────────────────────

## A note in the same slip as an achievement's: eyebrow, title, line, picture.
func notify(eyebrow: String, title: String, line: String, art: Texture2D = null) -> void:
	_notes.notify(eyebrow, title, line, art)


## Where the top-right lane is free from (the derby sits here).
func notes_bottom() -> float:
	return _notes.notes_bottom()


## A note on the water in the toast lane (the tones are the notes' own).
func toast(text: String, tone: String = "") -> void:
	_notes.toast(text, tone)


func _act() -> void:
	match phase:
		"idle", "result":
			cast()
		"hooked":
			_dial.strike()


# ── The loop (game/fishing_loop.gd), as other files reach it ──────────────────

func cast() -> void:
	await _loop.cast()


func _set_phase(p: String) -> void:
	_loop._set_phase(p)


func _tackle() -> Dictionary:
	return _loop._tackle()


func _bite() -> void:
	_loop._bite()


func _on_struck(raw: String, angle: float) -> void:
	await _loop._on_struck(raw, angle)


func _fish_card(r: Dictionary, perfect: bool) -> void:
	_loop._fish_card(r, perfect)


func _stow_card(r: Dictionary) -> void:
	_loop._stow_card(r)


func _close_card() -> void:
	_loop._close_card()


func _process(delta: float) -> void:
	_notes._badge_step(delta)
	_notes._toast_step(delta)
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
	_loop.step(delta)


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
		_loop.walk_away()
		get_viewport().set_input_as_handled()
