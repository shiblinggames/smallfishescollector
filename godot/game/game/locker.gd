class_name Locker
extends Control
## THE LOCKER (Kong, 2026-10-01: "rethink the menus now that we're in Godot;
## improve the inventory and loadouts"). One screen for what she carries,
## replacing the web's Loadout, Bait and Hold sheets, on paper.
##
## The sea does not go away: the camera pushes in on HER boat and sets it to
## the left (Sea.stage), the world dims round it, and the right of the screen
## is a sheet of paper. LOADOUT: the slots (Rod, Bait, Look, Hat, Boat, Pet);
## what you own as tiles on watercolour blots, the worn one circled in red; hover to
## try it on the real boat, press to wear it. Rods and bait show what they
## do to the dial against what you have now, on a small painted dial. HOLD:
## one pip per space in the hold, coloured by what fills it; every fish
## aboard as a tile; what it all fetches at the Market against this water's
## buyer. LOG opens the Almanac. Equip only; nothing is bought here, and
## nothing you do not own is listed. No rule is changed by this screen.
##
## This file is the shell (the stage, the veil, the sheet, the tabs, the
## card), the Orders, Boat and Log tabs; Loadout, Hold and Crates live in
## locker_loadout.gd, locker_hold.gd and locker_crates.gd beside it.

signal closed

## The tabs too big to keep here, each in its own part (split 2026-10-10).
const LockerLoadout = preload("res://game/locker_loadout.gd")
const LockerHold = preload("res://game/locker_hold.gd")
const LockerCrates = preload("res://game/locker_crates.gd")
const PANEL_W: float = 620.0

var sea: Sea
var hud: FishingHud
var session: Session
var tab: String = "loadout"
var slot: String = "rod"

var _body: VBoxContainer
var _tabs: HBoxContainer
var _veil: ColorRect
var _card: Control
var _card_eyebrow: Label
var _card_title: Label
var _card_body: Label
var _gauge: LockerLoadout.ZoneGauge
var _compare: VBoxContainer
var _note: Label
var _hold_sort: String = "value"
var _hold_detail: Label
var _trying: Array = ["__"]
var _panel: Control
var _almanac: Almanac


func _ready() -> void:
	session = sea.session
	# The fishing side: the day's paper.
	set_meta("night_root", false)
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var vp: Vector2 = get_viewport_rect().size
	_stage(tab)
	# The world dims round her.
	_veil = ColorRect.new()
	_veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var vm: ShaderMaterial = ShaderMaterial.new()
	vm.shader = load("res://game/fx/locker_veil.gdshader")
	_veil.material = vm
	add_child(_veil)
	_build_card()
	# The sheet.
	var panel: Control = Control.new()
	panel.anchor_left = 1.0
	panel.anchor_right = 1.0
	panel.anchor_bottom = 1.0
	panel.offset_left = -PANEL_W - 22.0
	panel.offset_right = -22.0
	panel.offset_top = 22.0
	panel.offset_bottom = -22.0
	add_child(panel)
	_panel = panel
	var shadow: Pane = Kit.pane(panel, { "radius": 14, "fill": [Color(0, 0, 0, 0)], "shadow": [Color(0, 0, 0, 0.45), 26, Vector2(0, 8)], "pad": 0 })
	shadow.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shadow.offset_left = 10
	shadow.offset_right = -10
	shadow.offset_top = 10
	shadow.offset_bottom = -10
	Paper.sheet(panel, 8.0)
	var margin: MarginContainer = MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, 34)
	margin.add_theme_constant_override("margin_top", 28)
	margin.add_theme_constant_override("margin_bottom", 26)
	panel.add_child(margin)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)
	# THE shared header: the title and its line, Close on the right, the tabs
	# on their own row, the rule.
	var head: Dictionary = Paper.header(col, "The Locker", "", close)
	Paper.text(head["titles"] as VBoxContainer, "What she carries, and what it does.", "note", Paper.INK_SOFT)
	_tabs = head["tabs"]
	_tabs.visible = true
	_body = VBoxContainer.new()
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 10)
	col.add_child(_body)
	Motion.panel_in(panel)
	_show_tab(tab)


## The camera pushes in on her boat beside the sheet; not for the Log, whose
## book covers nearly the whole screen (Kong: the push in and back out read
## as a strange zoom there).
func _stage(t: String) -> void:
	sea.stage = null if t == "log" else { "zoom": 2.3, "shift": Vector2((PANEL_W + 40.0) / 2.0, 30.0) }


func close() -> void:
	if Motion.closing(self):
		return
	sea.stage = null
	if _almanac != null and is_instance_valid(_almanac):
		_almanac.mark_read()
	_wear(Skipper.look_of(session.profile()))
	closed.emit()
	if _card.visible:
		Motion.leave(_card, false)
	Motion.dismiss(self, _panel, _veil)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back") or event.is_action_pressed("locker"):
		get_viewport().set_input_as_handled()
		close()
	elif event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_TAB:
		get_viewport().set_input_as_handled()
		var order: Array = ["loadout", "boat", "hold", "crates", "orders", "log"]
		_show_tab(order[(order.find(tab) + 1) % order.size()])


func _process(_delta: float) -> void:
	var at: Vector2 = sea._boat.get_global_transform_with_canvas().origin
	var m: ShaderMaterial = _veil.material
	m.set_shader_parameter("u_focus", at)
	m.set_shader_parameter("u_res", get_viewport_rect().size)


func line_out() -> bool:
	return not (hud.phase == "idle" or hud.phase == "result")


# ── Tabs ───────────────────────────────────────────────────────────────────────

func _show_tab(t: String) -> void:
	tab = t
	_stage(t)
	for c: Node in _tabs.get_children():
		_tabs.remove_child(c)
		c.queue_free()
	for o: Array in [["loadout", "Loadout"], ["boat", "Boat"], ["hold", "Hold"], ["crates", "Crates%s" % ("  %d" % _crate_count() if _crate_count() > 0 else "")], ["orders", "Orders"], ["log", "Log"]]:
		var b: Pane.PaneButton = Paper.tab(o[1], o[0] == t, false)
		b.tooltip_text = "Tab to switch"
		b.pressed.connect(func() -> void: _show_tab(o[0]))
		_tabs.add_child(b)
	if _almanac != null and is_instance_valid(_almanac) and t != "log":
		_almanac.mark_read()
	_almanac = null
	for c: Node in _body.get_children():
		c.queue_free()
	_gauge = null
	_card.visible = t == "loadout" or t == "boat"
	_widen(t == "log")
	if t == "boat":
		slot = "boat"
	elif t == "loadout" and slot == "boat":
		slot = "rod"
	if t == "loadout":
		LockerLoadout.build(self)
	elif t == "boat":
		_build_boat()
	elif t == "hold":
		LockerHold.build(self)
	elif t == "crates":
		LockerCrates.build(self)
	elif t == "orders":
		_build_orders()
	else:
		_build_log()


## The Log is a book: the sheet opens out to nearly the whole width, over
## the boat; the other tabs fold it back.
func _widen(wide: bool) -> void:
	if _panel == null:
		return
	var vp: Vector2 = get_viewport_rect().size
	var goal: float = -(vp.x - 44.0) if wide else -PANEL_W - 22.0
	if is_equal_approx(_panel.offset_left, goal):
		return
	var tw: Tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(_panel, "offset_left", goal, 0.32)


# ── Orders ─────────────────────────────────────────────────────────────────────

## THE DAY'S ORDERS (core/orders.gd): three orders, each claimed for its
## doubloons; all three claimed, the board is swept for a fishing crate and a
## new board comes up at once. The Master order (Fishing 75) runs beside it.
func _build_orders() -> void:
	var st: Dictionary = RulesApi.run(session.store, session.uid, "ordersState", [])
	Paper.text(_body, "BOARD %d" % int(st["board"]), "eyebrow", Paper.INK_SOFT)
	Paper.text(_body, "Claim each order for its doubloons. Claim all three and sweep the board for a fishing crate; a new board comes up at once. Nothing expires.", "note", Paper.INK_SOFT, true)
	for i: int in 3:
		_order_row(st["orders"][i], float(st["progress"][i]), st["claimed"][i] == true, i, "Claim  ·  %s ⟡" % Js.thousands(float(st["orders"][i]["reward"])))
	var sw: Pane.PaneButton = Paper.button("Sweep the board  ·  a fishing crate", st["sweepable"])
	sw.disabled = not st["sweepable"]
	sw.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	sw.pressed.connect(func() -> void: _order_act("sweepOrders", []))
	_body.add_child(sw)
	var m: Dictionary = st["master"]
	Paper.rule(_body)
	Paper.text(_body, "THE MASTER ORDER", "eyebrow", Paper.INK_SOFT)
	if m.is_empty():
		Paper.text(_body, "Opens at Fishing %d: a harder order of its own, paid with a crate of any tier." % int(Rules.data()["daily"]["masterMinLevel"]), "note", Paper.INK_SOFT, true)
		return
	_order_row(m, float(st["masterProgress"]), false, 3, "Claim  ·  a crate")


func _order_row(c: Dictionary, got: float, claimed: bool, i: int, claim_label: String) -> void:
	var target: float = float(c["target"])
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	_body.add_child(row)
	var v: VBoxContainer = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 3)
	row.add_child(v)
	Paper.text(v, str(c["label"]), "body_strong", Paper.INK if not claimed else Paper.INK_FAINT)
	# THE progress bar (Kit.bar), on the day paper.
	var frac: float = clampf(got / maxf(1.0, target), 0.0, 1.0)
	_bar(v, frac, Paper.GREEN if frac >= 1.0 else Color(Paper.INK, 0.45))
	Paper.text(v, "%s of %s" % [Js.thousands(minf(got, target)), Js.thousands(target)], "small", Paper.INK_SOFT)
	if claimed:
		Paper.text(row, "Claimed", "small", Paper.INK_FAINT)
	elif got >= target:
		var b: Pane.PaneButton = Paper.button(claim_label, true)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void: _order_act("claimOrder", [i]))
		row.add_child(b)
	else:
		var rw: Label = Paper.text(row, claim_label.trim_prefix("Claim  ·  "), "small", Paper.INK_FAINT)
		rw.size_flags_vertical = Control.SIZE_SHRINK_CENTER


## Kit.bar on the paper (its track inked for it).
static func _bar(parent: Node, frac: float, col: Color) -> void:
	var w: VBoxContainer = VBoxContainer.new()
	w.set_meta("paper", true)
	w.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(w)
	Kit.bar(w, frac, col)


func _order_act(op: String, args: Array) -> void:
	var r: Variant = await session.act(op, args)
	session.persist()
	if r is Dictionary and (r as Dictionary).has("error"):
		Sound.slack()
		hud.toast(str(r["error"]))
	elif r is Dictionary and (r as Dictionary).has("crate"):
		Sound.chest(true)
		hud.toast("%s stowed with your crates." % CrateMoment.TIERS.get(str(r["crate"]), CrateMoment.TIERS["wooden"])[0])
	else:
		Sound.chest(false)
	hud.refresh()
	_show_tab("orders")


# ── Boat ───────────────────────────────────────────────────────────────────────

## THE BOAT (Kong, 2026-10-01): her hull to wear (from crates) and what she
## is fitted with: each upgrade's reading now, its tier, and how the next one
## comes (free at a Fishing level, or bought at the Shipyard behind one).
func _build_boat() -> void:
	Paper.text(_body, "Her look", "eyebrow", Paper.INK_SOFT)
	Paper.text(_body, "Boats come only from fishing crates. Hover one to see it on her; press to sail it.", "note", Paper.INK_SOFT, true)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 8)
	_body.add_child(grid)
	var worn: Variant = LockerLoadout.worn(session, "boat", hud._bait)
	var opts: Array = LockerLoadout.options(session, "boat")
	if opts.is_empty():
		Paper.text(grid, "Just the hull she came with.", "note", Paper.INK_SOFT)
	for o: Array in opts:
		var t: Paper.Tile = Paper.Tile.new()
		t.on = o[0] != null and worn != null and str(o[0]) == str(worn)
		t.label = o[1]
		t.art = Skipper.tex(o[2]) if o[2] != "" else null
		t.pigment = o[3]
		t.custom_minimum_size = Vector2(124, 104)
		t.mouse_entered.connect(func() -> void: LockerLoadout.try_on(self, o))
		t.mouse_exited.connect(func() -> void: LockerLoadout.try_on(self, []))
		t.pressed.connect(func() -> void: LockerLoadout.choose(self, o[0]))
		grid.add_child(t)
	Paper.rule(_body)
	Paper.text(_body, "Her fittings", "eyebrow", Paper.INK_SOFT)
	var lvl: int = session.level()
	for l: Array in ShipyardRoom.LADDERS:
		var col: String = l[5]
		var cur: int = int(Js.num(session.profile().get(col)))
		var mx: int = (Rules.data()["fishHoldTiers"] as Array).size() - 1 if l[0] == "hold" else Shipyard.max_tier(col)
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		_body.add_child(row)
		var name: Label = Paper.text(row, l[2], "body_strong", Paper.INK)
		name.custom_minimum_size = Vector2(96, 0)
		Paper.text(row, ShipyardRoom._value(l[0], float(cur)), "value", Paper.INK)
		var pips: Label = Paper.text(row, "  " + "●".repeat(cur + 1) + "○".repeat(mx - cur), "small", Color(l[3]).darkened(0.35))
		pips.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var nxt: String = "Fully fitted"
		if cur < mx:
			var free_lv: int = ShipyardRoom._free_at(l, cur + 1)
			var gate_lv: int = ShipyardRoom._gate_at(l, cur + 1)
			if free_lv > 0:
				nxt = "Next free at Fishing %d" % free_lv
			elif gate_lv > lvl:
				nxt = "Next: Fishing %d, then %s ⟡ at the Shipyard" % [gate_lv, Js.thousands(ShipyardRoom._cost(l[0], cur + 1))]
			else:
				nxt = "Next: %s ⟡ at the Shipyard" % Js.thousands(ShipyardRoom._cost(l[0], cur + 1))
		Paper.text(row, nxt, "note", Paper.INK_SOFT)
	_trying = ["__"]
	LockerLoadout.try_on(self, [])


# ── Crates (game/locker_crates.gd) ──────────────────────────────────────────

## The Crates tab's state: the crate chosen, and a crate opening on the sea.
var _opening: bool = false
var _crate_sel: String = ""


func _crate_count() -> int:
	return LockerCrates.crate_count(self)


## Opens one crate of a tier on the sea (the tests drive this too).
func _open_crate(tier: String) -> void:
	LockerCrates.open_crate(self, tier)


# ── Log ────────────────────────────────────────────────────────────────────────

func _build_log() -> void:
	var vp: Vector2 = get_viewport_rect().size
	_almanac = Almanac.new()
	_almanac.session = session
	_almanac.embedded = true
	_almanac.book_w = vp.x - 44.0 - 22.0 - 68.0
	_almanac.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_almanac.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_almanac.mouse_filter = Control.MOUSE_FILTER_PASS
	_body.add_child(_almanac)


# ── Loadout (game/locker_loadout.gd) ─────────────────────────────────────────

func pick_slot(s: String) -> void:
	slot = s
	_show_tab("loadout")


## A special as shown; kept here as Locker.special_def (LockerLoadout holds it).
static func special_def(id: String, p: Dictionary) -> Dictionary:
	return LockerLoadout.special_def(id, p)


func _wear(look: Dictionary) -> void:
	sea._boat.set_look(look)


# ── The card under the boat ────────────────────────────────────────────────────

func _build_card() -> void:
	_card = Control.new()
	_card.anchor_top = 1.0
	_card.anchor_bottom = 1.0
	_card.offset_left = 40.0
	_card.offset_right = 470.0
	_card.offset_top = -150.0
	_card.offset_bottom = -30.0
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_card)
	Paper.sheet(_card, 6.0, 0.6)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 18 if side != "top" else 14)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_card.add_child(m)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.add_child(v)
	_card_eyebrow = Paper.text(v, "", "eyebrow", Paper.RED)
	_card_title = Paper.text(v, "", "title", Paper.INK)
	_card_body = Paper.text(v, "", "note", Paper.INK_SOFT, true)
