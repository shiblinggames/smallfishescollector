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

const HOLD_S: float = 0.62
const HOLD_PERFECT_S: float = 0.9
const INK: Color = Color("#f0ede8")
const DIM: Color = Color("#a0a09a")
const GOLD: Color = Color("#f0c040")
const TEAL: Color = Color("#67d4e8")

var session: Session
var boat: Boat
var leave_label: String = "Captains"
var water: Dictionary = {}
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
var _purse: Label
var _spot_badge: Pane
var _spot_family: Label
var _spot_name: Label
var _spot_left: Label
var _spot_effect: Label
var _spot: Dictionary = {}
var _ledger_btn: Button
var _where: Label
var _blurb: Label
var _clock: Label
var _recall: Button
var _action: DialButton
## The rod's four menus; _hold is the Hold button's count, where fish land.
var _m_loadout: Button
var _m_bait: Button
var _m_log: Button
var _m_hold: Button
var _hold: Label
var _bait_val: Label
var _loadout_val: Label
var _log_val: Label
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
var _toast: Label
var _toast_t: float = 0.0
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
	_name = Kit.lift(Kit.text(tl, "", "title", INK))
	_xp = XpBar.new()
	tl.add_child(_xp)
	var purse_row: HBoxContainer = HBoxContainer.new()
	purse_row.add_theme_constant_override("separation", 10)
	purse_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tl.add_child(purse_row)
	_purse = Kit.lift(Kit.text(purse_row, "", "number", GOLD))
	# In a Charter the purse is the crew's: its ledger is a press away.
	_ledger_btn = Kit.button("Crew purse", "accent", "small", GOLD)
	_ledger_btn.focus_mode = Control.FOCUS_NONE
	_ledger_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_ledger_btn.visible = session.save.has("charter")
	_ledger_btn.pressed.connect(func() -> void: _open_sheet(Menus.purse_sheet(session)))
	purse_row.add_child(_ledger_btn)
	session.changed.connect(func() -> void:
		if is_inside_tree():
			refresh())
	_auto = Pane.PaneButton.new({ "radius": 999, "fill": [Color(0.016, 0.04, 0.07, 0.72)], "border": [1, Color(0.7, 0.83, 0.89, 0.22)], "pad": [10, 4, 12, 4] }, { "radius": 999, "fill": [Color(0.016, 0.04, 0.07, 0.86)], "border": [1, Color(0.7, 0.83, 0.89, 0.45)], "pad": [10, 4, 12, 4] })
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
	_where = Kit.lift(Kit.text(tr, "", "title", INK))
	_blurb = Kit.lift(Kit.text(tr, "", "small", Kit.INK_2))
	for l: Label in [_where, _blurb]:
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
	var clock_pill: Pane = Kit.pane(clock_row, { "radius": 999, "fill": [Color(0.016, 0.04, 0.07, 0.72)], "border": [1, Color(0.7, 0.83, 0.89, 0.22)], "pad": [10, 3, 10, 4] })
	clock_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_clock = Kit.text(clock_pill, "", "label", Color(0.82, 0.88, 0.93, 0.85))
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
	_place(bottom, Vector2(0.5, 1.0), Vector2(-344, -72), Vector2(688, 54))
	add_child(bottom)
	var lv: Array = _menu(bottom, "Loadout", _open_loadout)
	_m_loadout = lv[0]
	_loadout_val = lv[1]
	var bv: Array = _menu(bottom, "Bait", _open_bait)
	_m_bait = bv[0]
	_bait_val = bv[1]
	_action = DialButton.new(112.0)
	# On the PRESS: a button fires on release by default, which held the
	# needle until the click came back up.
	_action.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
	_action.pressed.connect(_act)
	_place(_action, Vector2(0.5, 1.0), Vector2(-56, -72 - 12 - 112), Vector2(112, 112))
	add_child(_action)
	var gv: Array = _menu(bottom, "Log", _open_log)
	_m_log = gv[0]
	_log_val = gv[1]
	var hv: Array = _menu(bottom, "Hold", _open_hold)
	_m_hold = hv[0]
	_hold = hv[1]
	_blocked = Kit.lift(Kit.text(self, "", "small", Color("#f8a2a2")))
	_blocked.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_blocked.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_place(_blocked, Vector2(0.5, 1.0), Vector2(-300, -72 - 12 - 112 - 34), Vector2(600, 28))

	_status = Kit.lift(Kit.text(self, "", "heading", INK))
	_status.add_theme_font_size_override("font_size", 21)
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_status, Vector2(0.5, 0.5), Vector2(-300, 110), Vector2(600, 32))
	_dots = Kit.lift(Kit.text(self, "", "heading", Color(0.78, 0.86, 0.91, 0.9)))
	_dots.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_dots, Vector2(0.5, 0.5), Vector2(-150, 80), Vector2(300, 30))
	_timer = Kit.lift(Kit.text(self, "", "small", Color(0.75, 0.83, 0.89, 0.6)))
	_timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_timer, Vector2(0.5, 0.5), Vector2(-150, 146), Vector2(300, 22))

	_dial = Dial.new()
	_place(_dial, Vector2(0.5, 0.5), Vector2(140, -170), Vector2(300, 300))
	_dial.visible = false
	_dial.mouse_filter = Control.MOUSE_FILTER_STOP
	_dial.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and phase == "hooked":
			_dial.strike())
	_dial.struck.connect(_on_struck)
	add_child(_dial)
	_tide = Kit.button("Tide Turner", "accent", "small", Color("#c9a7ff"))
	_place(_tide, Vector2(0.5, 0.5), Vector2(150, 150), Vector2(280, 44))
	_tide.visible = false
	_tide.pressed.connect(_skip)
	add_child(_tide)

	_cues = HBoxContainer.new()
	_cues.alignment = BoxContainer.ALIGNMENT_CENTER
	_cues.add_theme_constant_override("separation", 8)
	_cues.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cues.anchor_left = 0.0
	_cues.anchor_right = 1.0
	_cues.offset_top = 156.0
	_cues.offset_bottom = 186.0
	add_child(_cues)
	_course = HBoxContainer.new()
	_course.alignment = BoxContainer.ALIGNMENT_CENTER
	_course.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_course.anchor_left = 0.0
	_course.anchor_right = 1.0
	_course.offset_top = 192.0
	_course.offset_bottom = 230.0
	add_child(_course)
	_reach_btn = Pane.PaneButton.new(
		{ "radius": 999, "fill": [Color(0.04, 0.078, 0.11, 0.88)], "border": [1, Color(0.7, 0.84, 0.91, 0.45)], "shadow": [Color(0, 0, 0, 0.45), 16, Vector2(0, 4)], "pad": 0 },
		{ "radius": 999, "fill": [Color(0.06, 0.1, 0.14, 0.92)], "border": [1, Color(1.0, 0.85, 0.53, 0.8)], "shadow": [Color(1.0, 0.8, 0.45, 0.18), 18, Vector2(0, 4)], "pad": 0 })
	_reach_btn.focus_mode = Control.FOCUS_NONE
	_reach_btn.visible = false
	_reach_btn.pressed.connect(_press_reach)
	add_child(_reach_btn)
	_reach_l = Label.new()
	Kit.style(_reach_l, "heading", Color("#f2ead8"))
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

	_spot_badge = Pane.new({ "radius": 14, "fill": [Color(0.016, 0.04, 0.07, 0.86)], "border": [1, Color(1, 1, 1, 0.14)], "shadow": [Color(0, 0, 0, 0.45), 16, Vector2(0, 4)], "pad": [14, 9, 14, 10] })
	_spot_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_place(_spot_badge, Vector2(0.5, 0.0), Vector2(-180, 168), Vector2(360, 0))
	_spot_badge.visible = false
	add_child(_spot_badge)
	var sv: VBoxContainer = VBoxContainer.new()
	sv.add_theme_constant_override("separation", 2)
	sv.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spot_badge.add_child(sv)
	_spot_family = Kit.text(sv, "", "eyebrow", GOLD)
	var sh: HBoxContainer = HBoxContainer.new()
	sh.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sv.add_child(sh)
	_spot_name = Kit.text(sh, "", "heading", INK)
	_spot_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_spot_left = Kit.text(sh, "", "small", DIM)
	_spot_left.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_spot_effect = Kit.text(sv, "", "small", Kit.INK_2, true)

	_toast = Kit.lift(Kit.text(self, "", "heading", GOLD))
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_toast, Vector2(0.5, 0.0), Vector2(-300, 120), Vector2(600, 30))
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
func _menu(parent: Control, key: String, on_press: Callable) -> Array:
	var b: Pane.PaneButton = Pane.PaneButton.new(
		{ "radius": 10, "fill": [Color(0.024, 0.055, 0.086, 0.86)], "border": [1, Color(1, 1, 1, 0.16)], "shadow": [Color(0, 0, 0, 0.35), 12, Vector2(0, 3)], "pad": 0 },
		{ "radius": 10, "fill": [Color(0.04, 0.08, 0.12, 0.92)], "border": [1, Color(1, 1, 1, 0.3)], "shadow": [Color(0, 0, 0, 0.35), 12, Vector2(0, 3)], "pad": 0 })
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


func _box(at: Vector2, right: bool, w: float) -> VBoxContainer:
	var b: VBoxContainer = VBoxContainer.new()
	_place(b, Vector2(1.0 if right else 0.0, 0.0), at + (Vector2(-w, 0) if right else Vector2.ZERO), Vector2(w, 120))
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(b)
	return b


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
	var next: Dictionary = (Rules.data()["levelRewards"] as Dictionary).get(str(lvl + 1), {})
	_xp.set_values(lvl, frac, left, LevelUp.reward_label(next) if not next.is_empty() else "", next.get("milestone", false), _streak())
	_dial.streak = _streak()
	_purse.text = "%s ⟡" % _thousands(Js.num(p.get("doubloons")))
	# The bait on the line: the one chosen while any is left, else the first held.
	var held: Array = session.baits()
	var have: bool = false
	for b: Array in held:
		if b[0] == _bait:
			have = true
			_bait_val.text = "%s  %d" % [b[1], int(b[2])]
	if not have and held.size() > 0:
		_bait = held[0][0]
		_bait_val.text = "%s  %d" % [held[0][1], int(held[0][2])]
	elif held.is_empty():
		_bait_val.text = "None"
	var cap: int = int(Rules.fish_hold(Js.num(p.get("fish_hold_tier")))["capacity"])
	var count: int = int(session.store.hold_count(session.uid))
	_hold.text = "%d/%d" % [count, cap]
	_hold.add_theme_color_override("font_color", Color(0.7, 0.2, 0.15) if count >= cap else Kit.PAPER_INK)
	_loadout_val.text = String(Rules.rod(Js.num(p.get("rod_tier")))["name"])
	_log_val.text = "Catches"
	_update_auto()
	_update_action()


func set_water(w: Dictionary) -> void:
	if w.get("id") == water.get("id"):
		return
	water = w
	_where.text = w.get("name", "Harbor approach")
	_blurb.text = w.get("blurb", "Sail south to fish")
	if not w.is_empty():
		toast(w["name"])
	_update_action()


## The hotspot the boat is in ({} for none): its badge, with its countdown.
func set_spot(h: Dictionary) -> void:
	if h.get("key") != _spot.get("key"):
		_spot = h
		if not h.is_empty():
			var def: Dictionary = Hotspots.DEFS[h["kind"]]
			var c: Color = Color(def["color"])
			var tier: int = int(h["tier"])
			_spot_family.text = "%s  ·  %s" % [def["family"], "●".repeat(tier) + "○".repeat(3 - tier)]
			_spot_family.add_theme_color_override("font_color", c)
			_spot_name.text = def["tiers"][tier - 1][0]
			_spot_effect.text = def["tiers"][tier - 1][1]
			var s: Dictionary = (_spot_badge.spec as Dictionary).duplicate()
			s["border"] = [1, Color(c, 0.45)]
			_spot_badge.set_spec(s)
			toast(_spot_name.text)
	_spot_badge.visible = not h.is_empty()
	if not h.is_empty():
		var left: int = maxi(0, int((float(h["endsAt"]) - Clock.now_ms()) / 1000.0))
		_spot_left.text = ("%dm left" % ceili(left / 60.0)) if left >= 60 else ("%ds" % left)


## The course chip: {label, eta, autopilot}, or {} for none.
func set_course(info: Dictionary) -> void:
	for n: Node in _course.get_children():
		n.queue_free()
	if info.is_empty():
		return
	var gold: Color = Color(1.0, 0.92, 0.72)
	var p: Pane = Kit.pane(_course, { "radius": 999, "fill": [Color(0.024, 0.047, 0.07, 0.8)], "border": [1, Kit.a(gold, 0.4)], "shadow": [Kit.a(gold, 0.12), 14], "pad": [14, 4, 6, 4] })
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	p.add_child(row)
	var words: Label = Kit.lift(Kit.text(row, "COURSE  ·  %s  ·  %s" % [info["label"], info["eta"]], "chip", gold))
	words.add_theme_font_size_override("font_size", 11)
	words.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var ap: Button = Kit.button("Autopilot on" if info.get("autopilot", false) else "Autopilot", "accent" if info.get("autopilot", false) else "secondary", "small", gold)
	ap.focus_mode = Control.FOCUS_NONE
	ap.pressed.connect(func() -> void: course_autopilot.emit())
	row.add_child(ap)
	var x: Button = Kit.button("Clear", "secondary", "small")
	x.focus_mode = Control.FOCUS_NONE
	x.pressed.connect(func() -> void: course_clear.emit())
	row.add_child(x)


func set_cues(c: Dictionary) -> void:
	for n: Node in _cues.get_children():
		n.queue_free()
	var cur: String = c.get("current", "")
	if cur != "":
		_cue_chip("Riding the current" if cur == "with" else ("Against the current" if cur == "against" else "Crossing a current"),
			Color("#8fe0f0") if cur == "with" else (Color("#f0a58f") if cur == "against" else Color("#c9d6e0")))
	if c.get("full", false):
		_cue_chip("Full sail", Color("#f0d58a"))
	if c.get("kelp", false):
		_cue_chip("In the kelp", Color("#a8c483"))


## A cue is lettering on the water, not a panel (Kong, 2026-10-01): the words
## in their tint over a soft shadow, a small diamond between them.
func _cue_chip(text: String, col: Color) -> void:
	if _cues.get_child_count() > 0:
		var dot: Label = Kit.lift(Kit.text(_cues, "◆", "chip", Color(0.95, 0.92, 0.84, 0.45)))
		dot.add_theme_font_size_override("font_size", 8)
		dot.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var l: Label = Kit.lift(Kit.text(_cues, text, "eyebrow", col))
	l.add_theme_font_size_override("font_size", 12)
	l.add_theme_constant_override("shadow_outline_size", 6)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	l.ready.connect(func() -> void: Kit.pop(l))


func set_clock(label: String) -> void:
	_clock.text = label


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
					_blocked.add_theme_color_override("font_color", Color("#f8a2a2"))
					_blocked.text = "Your hold is full. Sell it to the buyer in this water, or sail it home to the market."
				elif session.baits().is_empty():
					_action.disabled = true
					_action.text = "No Bait"
					_blocked.add_theme_color_override("font_color", Color("#e8c98a"))
					_blocked.text = "Out of bait. There are peddlers out here, and the shop ashore."
	_action.text = _action.text.to_upper()
	_action.accent = TEAL if teal else GOLD
	_action.set_lit(not _action.disabled)
	# No fishing here: the button steps aside (the reach pill takes its place).
	_action.visible = not water.is_empty() or (phase != "idle" and phase != "result")


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
	var above: float = -72.0 - 12.0 - 112.0 - 16.0 - 44.0 if not water.is_empty() else -72.0 - 12.0 - 70.0
	_place(_reach_btn, Vector2(0.5, 1.0), Vector2(-full / 2.0, above), Vector2(full, 44))
	_reach_l.position = Vector2(22, 10)
	var key: Label = _reach_btn.get_node("Key")
	key.position = Vector2(22 + w + 10, 10)
	key.size = Vector2(26, 24)
	_reach_btn.pivot_offset = Vector2(full / 2.0, 22)
	_reach_btn.modulate.a = 0.0
	_reach_btn.scale = Vector2.ONE * 0.94
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(_reach_btn, "modulate:a", 1.0, 0.16)
	tw.tween_property(_reach_btn, "scale", Vector2.ONE, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _press_reach() -> void:
	if _modal != null or not _reach_btn.visible or not _reach_act.is_valid():
		return
	_reach_act.call()


## A panel or room from the sea (ashore, a buyer, the Market) holds the HUD
## still until it closes.
func hold_for(c: Control) -> void:
	_modal = c
	_reach_btn.visible = false
	c.tree_exited.connect(func() -> void:
		if _modal == c:
			_modal = null
		_reach_text = ""
		refresh())


## Whether anything is open over the sea, so the boat holds still.
func busy() -> bool:
	return _modal != null


func _open_sheet(s: Sheet) -> void:
	_modal = s
	s.closed.connect(func() -> void:
		_modal = null
		refresh())
	add_child(s)


func _open_bait() -> void:
	locker_wanted.emit("loadout", "bait")


func _open_hold() -> void:
	locker_wanted.emit("hold", "")


func _open_loadout() -> void:
	locker_wanted.emit("loadout", "rod")


## The bait on the line (the Locker's Bait slot).
func set_bait(t: String) -> void:
	_bait = t
	refresh()


func _open_log() -> void:
	locker_wanted.emit("log", "")


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
	var u: Array = Js.list(session.profile().get("gauntlet_upgrades"))
	if Js.includes(u, "dg_master_catcher"):
		return 4
	if Js.includes(u, "tireless_catcher"):
		return 3
	return 2


func _update_auto() -> void:
	var tier: int = _auto_tier()
	_auto.visible = tier > 0
	_auto.text = "%s · %s" % ["AUTO CATCHER" if tier == 2 else "AUTO CASTER", "ON" if _auto_on else "OFF"]
	_auto.modulate = Color.WHITE if _auto_on else Color(1, 1, 1, 0.55)
	_auto.add_theme_color_override("font_color", Color("#f0ede8") if _auto_on else Color("#9a9488"))


func _toggle_auto() -> void:
	_auto_on = not _auto_on
	await session.act("setAutoFishing", [_auto_on])
	session.persist()
	_update_auto()


func toast(text: String) -> void:
	_toast.text = text
	_toast.modulate.a = 1.0
	_toast_t = 2.4


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
		Fx.pill(self, "Instant Bite", Vector2(size.x / 2.0, 90.0), Color.WHITE, Color(1.0, 0.23, 0.28, 0.32), Color(1.0, 0.35, 0.39, 0.7), 1.1)
	_since_cast = 0.0
	_set_phase("waiting")
	Rumble.tap(12)
	Sound.cast()
	boat.set_pose("cast")
	get_tree().create_timer(0.6).timeout.connect(func() -> void:
		if gen == _gen and phase != "idle":
			Sound.line_in())
	get_tree().create_timer(0.65).timeout.connect(func() -> void:
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


## The Tide Turner: how many skips are left today, or -1 without one seated.
func _skips_left() -> int:
	var p: Dictionary = session.profile()
	if not Js.truthy(p.get("has_tide_turner")) or p.get("equipped_special") != "tide_turner":
		return -1
	var today: String = Js.iso(Clock.now_ms()).split("T")[0]
	var used: float = Js.num(p.get("tide_turner_used")) if p.get("tide_turner_date") == today else 0.0
	return int(3.0 - used)


## The zones for this bite: the web's buildFishZones, then, in a fight, the
## mechanic's mods (a breathing shrink narrows the green by its breath too)
## and a giant's palette.
func _zones(breath: float = 0.0) -> Array:
	var diff: float = float(_shot["catchDifficulty"])
	var zd: Dictionary = (Rules.data()["dial"]["zoneDifficulty"] as Dictionary).get(_cast_zone, {})
	var zones: Array = Dial.build_zones(diff, _mods["hook"], _mods["line"], float(zd.get("catchMultiplier", 1.0)),
		floor(float(_mods["level"]) * 0.2) + float(_mods["baitCatch"]) + float(_mods["rodCatch"]) - breath, float(_mods["rodPerfect"]) + 1.0)
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


func _bite() -> void:
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
	_dial.visible = true
	_dial.modulate.a = 0.0
	_dial.pivot_offset = Vector2(150, 150)
	_dial.scale = Vector2(0.92, 0.92)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(_dial, "modulate:a", 1.0, 0.18)
	tw.tween_property(_dial, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_dots.text = ""
	_timer.text = ""
	_status.text = ""
	if not _boss.is_empty():
		toast("Ancient Encounter  ·  %d stages required" % int(_boss["cfg"]["phases"]))
		_fight_hud()
		Fx.pill(self, "Miss once and it escapes. Stay sharp.", Vector2(size.x / 2.0, 170.0), Color("#fca5a5"), Color(0.08, 0.016, 0.016, 0.92), Color(0.94, 0.27, 0.27, 0.6), 2.2)
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
	toast("Thrown back. The streak holds. %d skip%s left today." % [int(r["skipsLeft"]), "" if int(r["skipsLeft"]) == 1 else "s"])
	_set_phase("idle")
	refresh()


func _on_struck(raw: String, _angle: float) -> void:
	var result: String = "miss" if raw == "penalty" and _mods["snagImmune"] else raw
	var landed: bool = result == "perfect" or result == "catch"
	if not landed and float(_mods["retry"]) > 0.0 and randf() < float(_mods["retry"]):
		Rumble.buzz(Rumble.SECOND_WIND)
		Fx.pill(self, "Second Wind", Vector2(size.x / 2.0 + 290.0, size.y / 2.0 - 200.0), Color("#99f6e4"), Color(0.08, 0.3, 0.3, 0.8), Color(0.37, 0.92, 0.83, 0.7), 1.2)
		_dial.respin()
		return
	if not _boss.is_empty() and landed and int(_boss["stage"]) < int(_boss["cfg"]["phases"]):
		await _next_phase(result)
		return
	if not _boss.is_empty():
		_status.text = ""
		_dots.text = ""
	_boss = {}
	_dial.mechanic = ""
	_dial.ancient_aura = false
	Sound.dial_stop()
	_tide.visible = false
	boat.set_pose("rest")
	if result == "perfect":
		Sound.perfect()
		Rumble.buzz(Rumble.PERFECT)
		add_child(Fx.PerfectFlash.new())
	elif landed:
		Sound.line_in()
		Rumble.tap(6)
	else:
		Rumble.tap(6)
	if landed:
		boat.splash(result == "perfect")
	_set_phase("reeling")
	await get_tree().create_timer(HOLD_PERFECT_S if result == "perfect" else HOLD_S).timeout
	var before_level: int = session.level()
	var crate: bool = float(_shot["fishId"]) == FishingRules.CRATE_FISH_ID
	var r: Dictionary = {}
	if crate and landed:
		r = await session.act("stowCrate", [result])
	elif not crate:
		r = await session.act("reelIn", [float(_shot["fishId"]), result, _bait])
	session.persist()
	_dial.visible = false
	_set_phase("result")
	if r.has("error"):
		_note_card("The line went slack", r["error"])
	elif crate and landed:
		_stow_card(r)
	elif r.get("caught") == true:
		_fish_card(r, result == "perfect")
	else:
		_note_card("Snagged" if result == "penalty" else "It got away",
			"The line fouled and took a bait with it." if result == "penalty" else "The line went slack. Cast again.")
	refresh()
	_auto_t = (3.3 if crate else 1.7) if (_auto_on and _auto_tier() > 0) else -1.0
	var giant: bool = r.get("caught") == true and (r["fish"] as Dictionary)["habitat"] == "ancient_deep" and Js.num((r["fish"] as Dictionary).get("sell_value")) == 0.0
	if giant:
		await _ceremony(r)
	if session.level() > before_level or r.get("isShiny") == true:
		_after_catch(true)


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
	var card: ResultCard = ResultCard.new()
	_mount_card(card)
	# The web never passed the count, so its card read "Ancient 0 of 6"; it is
	# the wall as it stands.
	r["ancientCount"] = float(Js.list(session.profile().get("ancient_catches")).size())
	card.show_fish(r, perfect, _shot)
	_wire(card)
	# The XP rises off the boat; the fish flies to the hold.
	var mid: Vector2 = Vector2(size.x / 2.0, size.y * 0.5 - 70.0)
	Fx.rise(self, "+%s XP%s" % [_thousands(float(r["xpGained"])), "  PERFECT" if perfect else ""], mid, GOLD if perfect else Color("#4ade80"), 20)
	if float(r.get("catchQty", 0.0)) > 0.0 and r.get("isShiny") != true:
		_fly_to_hold(r["fish"], float(r["catchQty"]))


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
	var card: ResultCard = ResultCard.new()
	_mount_card(card)
	card.show_note("%s, stowed" % t[0], "It is in your stash with %d other%s. Open it from the Locker (I), Crates, whenever you like." % [total - 1, "" if total - 1 == 1 else "s"] if total > 1 else "It is in your stash. Open it from the Locker (I), Crates, whenever you like.")
	_wire(card)


func _note_card(title: String, body: String) -> void:
	var card: ResultCard = ResultCard.new()
	_mount_card(card)
	card.show_note(title, body)
	_wire(card)


## HoldFlight: the fish, as a dark shape, thrown from the water to the hold;
## the count there changes only when it lands.
func _fly_to_hold(fish: Dictionary, qty: float) -> void:
	var path: String = ResultCard.fish_art_path(fish["name"])
	if not ResourceLoader.exists(path):
		return
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
	var from: Vector2 = Vector2(size.x / 2.0, size.y * 0.42) - t.size / 2.0
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
		_hold.pivot_offset = _hold.size / 2.0
		var knock: Tween = create_tween()
		knock.tween_property(_hold, "scale", Vector2(1.14, 1.14), 0.12).set_trans(Tween.TRANS_BACK)
		knock.tween_property(_hold, "scale", Vector2.ONE, 0.22))


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
## about any golden still waiting. One at a time.
func _after_catch(from_catch: bool) -> void:
	if session.level() > _level_seen or not from_catch:
		var claim: Dictionary = await session.act("claimFishingLevelRewards")
		session.persist()
		_level_seen = session.level()
		if float(claim["to"]) > float(claim["from"]):
			var lu: LevelUp = LevelUp.new()
			lu.claim = claim
			_modal = lu
			add_child(lu)
			await lu.closed
			_modal = null
			refresh()
	var held: Variant = await session.act("heldGolden")
	while held != null:
		var g: GoldenChoice = GoldenChoice.new()
		g.session = session
		g.golden = held
		_modal = g
		add_child(g)
		await g.answered
		_modal = null
		refresh()
		held = await session.act("heldGolden")


func _process(delta: float) -> void:
	if phase == "waiting":
		_wait_left -= delta
		_since_cast += delta
		if _since_cast >= 1.5:
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
	if _toast_t > 0.0:
		_toast_t -= delta
		_toast.modulate.a = clampf(_toast_t / 0.6, 0.0, 1.0)


func _unhandled_input(event: InputEvent) -> void:
	if _modal != null:
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
			_dial.visible = false
			_tide.visible = false
			_status.text = ""
			_dots.text = ""
			_timer.text = ""
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
