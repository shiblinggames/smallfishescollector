class_name Paper
extends RefCounted
## PAPER AND INK (Kong, 2026-10-01: the menus move off the dark kit onto
## painted paper and wood, to match the world chart and the watercolour sea).
##
## The pieces every paper screen shares: a sheet (fx/paper.gdshader, grained,
## tea-stained, deckled), a watercolour blot to set art on, ink buttons, ink
## text, and the item tile (a blot, the art, a name, and a hand-drawn ring in
## red ink round the one you wear). Inks and pigments are named here so the
## screens cannot drift.
##
## THE MENU SHELL (2026-10-09, M1 and M2): Paper.open builds a sheet on a host
## (scrim, centred paper, a body column) and Paper.close takes it away;
## Paper.header is THE header every menu shares (eyebrow and title on the
## left, Close or the back pill on the right, tabs on their own row, a rule);
## three button roles: Paper.tab (an underlined word), Paper.button (quiet)
## and Paper.primary (the wooden plank, the one thing to do);
## Paper.status_line is the reserved feedback line under the header.

const INK: Color = Kit.PAPER_INK
const INK_SOFT: Color = Kit.PAPER_INK_SOFT
const INK_FAINT: Color = Color(0.45, 0.38, 0.3)
const RED: Color = Color(0.66, 0.2, 0.15)
const GREEN: Color = Color(0.22, 0.48, 0.3)
const PAPER: Color = Kit.PAPER
## Money on the day paper (the doubloon's gold, inked).
const MONEY: Color = Color(0.55, 0.38, 0.04)
## The rust an eyebrow is inked in on the day paper.
const EYEBROW: Color = Color(0.55, 0.3, 0.15)

## THE NIGHT PAPER (Kong, 2026-10-02: "everything in the anchorage and the
## expeditions should have a darker paper, to separate the two"). Fishing's
## menus keep the day's tea-stained sheet; the expedition side (the Crew Hall,
## the recruits, everything north of the reef) is a tarred chart: dark,
## warm-black paper, cream ink, CHOSEN for what is chosen.
##
## NIGHT HAS ONE SOURCE: the `night_root` meta on a screen's root (Paper.open
## sets it, as does Pane.set_night). Every helper here that takes a node
## (ink(n), red(n), ...) reads it from that node's ancestors. Paper.night, a
## static a screen sets while it builds, is the DEPRECATED fallback, used only
## when no node is given or no root says.
static var night: bool = false
const NIGHT_PAPER_DEEP: Color = Color(0.12, 0.1, 0.085)
const NIGHT_PAPER: Color = Color(0.19, 0.155, 0.13)
const NIGHT_PAPER_HI: Color = Color(0.2, 0.165, 0.14)
## The darkest night ground (the battle's keycaps and troughs).
const NIGHT_PAPER_LO: Color = Color(0.09, 0.075, 0.065)
const NIGHT_INK: Color = Color(0.94, 0.88, 0.77)
const NIGHT_INK_SOFT: Color = Color(0.76, 0.69, 0.59)
const NIGHT_INK_FAINT: Color = Color(0.56, 0.5, 0.43)
const NIGHT_HAIR: Color = Color(1, 1, 1, 0.08)
const NIGHT_RED: Color = Color(0.93, 0.45, 0.33)
const NIGHT_GREEN: Color = Color(0.5, 0.86, 0.58)
const NIGHT_GOLD: Color = Color(0.94, 0.78, 0.4)
## What is chosen, selected or mounted (on the night paper; the day paper
## rings it in red()).
const CHOSEN: Color = Color(0.86, 0.66, 0.34)
## The old name for CHOSEN, kept for the screens that still say it.
const BRASS: Color = CHOSEN

## THE SHEET SIZES (both centred): a menu with a grid, and a plain one.
const SHEET_WIDE: Vector2 = Vector2(1200, 800)
const SHEET_NARROW: Vector2 = Vector2(920, 660)
## The height of the reserved feedback line under a header.
const STATUS_H: float = 18.0

static var _mat_cache: Shader


# ── Night ─────────────────────────────────────────────────────────────────────

## 1 a night root says night, 0 a root says day, -1 no root says.
static func _root(n: Node) -> int:
	var p: Node = n
	var hops: int = 0
	while p != null and hops < 32:
		if p.has_meta("night_root"):
			return 1 if p.get_meta("night_root") == true else 0
		p = p.get_parent()
		hops += 1
	return -1


## Is this node on the night paper? Its root says; else the fallback.
static func is_night(n: Node = null) -> bool:
	if n == null:
		return night
	var r: int = _root(n)
	if r >= 0:
		return r == 1
	return night


## The inks for whichever paper `n` is on (no node: the paper being built).
static func ink(n: Node = null) -> Color:
	return NIGHT_INK if is_night(n) else INK


static func ink_soft(n: Node = null) -> Color:
	return NIGHT_INK_SOFT if is_night(n) else INK_SOFT


static func ink_faint(n: Node = null) -> Color:
	return NIGHT_INK_FAINT if is_night(n) else INK_FAINT


static func red(n: Node = null) -> Color:
	return NIGHT_RED if is_night(n) else RED


static func green(n: Node = null) -> Color:
	return NIGHT_GREEN if is_night(n) else GREEN


## Gold words (money, a reward) on either paper.
static func gold(n: Node = null) -> Color:
	return NIGHT_GOLD if is_night(n) else MONEY


## The ring round what is chosen: red ink by day, CHOSEN by night.
static func chosen(n: Node = null) -> Color:
	return CHOSEN if is_night(n) else RED


## A rarity's pigment (number 1-5 or name), derived from THE table
## (Kit.RARITY): on the day paper, the hue as watercolour; given a node on the
## night paper, the kit's own colour. With no node it is the day pigment.
static func rarity(r: Variant, n: Node = null) -> Color:
	var c: Color = Kit.rarity(r)
	if n != null and is_night(n):
		return c
	return Color.from_hsv(c.h, minf(1.0, c.s * 0.85), c.v * 0.76)


# ── The sheet ─────────────────────────────────────────────────────────────────

static func _shader() -> Shader:
	if _mat_cache == null:
		_mat_cache = load("res://game/fx/paper.gdshader")
	return _mat_cache


## A stable seed for a node: the names of its ancestors that are not made up
## by the engine (so a rebuilt screen gets the same stains).
static func _seed_of(n: Node, extra: String = "") -> float:
	var parts: PackedStringArray = PackedStringArray()
	var p: Node = n
	var hops: int = 0
	while p != null and hops < 12:
		var nm: String = String(p.name)
		if not nm.contains("@"):
			parts.append(nm)
		p = p.get_parent()
		hops += 1
	return float(absi(("/".join(parts) + extra).hash()) % 5000) / 100.0


## A sheet of paper filling its parent (or sized by the caller). seed: its
## stains (negative: stable for where it sits, so a rebuild does not reshuffle
## them).
static func sheet(parent: Control, deckle: float = 7.0, stain: float = 1.0, tint: Color = PAPER, seed: float = -1.0) -> ColorRect:
	var by_root: bool = tint == PAPER
	if night and tint == PAPER:
		tint = NIGHT_PAPER
	var r: ColorRect = ColorRect.new()
	r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var m: ShaderMaterial = ShaderMaterial.new()
	m.shader = _shader()
	m.set_shader_parameter("u_deckle", deckle)
	m.set_shader_parameter("u_stain", stain)
	m.set_shader_parameter("u_paper", tint)
	m.set_shader_parameter("u_seed", seed if seed >= 0.0 else _seed_of(parent))
	r.material = m
	r.resized.connect(func() -> void: m.set_shader_parameter("u_size", r.size))
	# A sheet of the default paper follows its root's side of the reef.
	if by_root:
		r.tree_entered.connect(func() -> void:
			var k: int = Paper._root(r)
			if k >= 0:
				m.set_shader_parameter("u_paper", NIGHT_PAPER if k == 1 else PAPER))
	parent.add_child(r)
	return r


## A watercolour blot of pigment, filling its parent. seed as sheet's (a tile
## passes its name).
static func blot(parent: Control, pigment: Color, strength: float = 1.0, seed: float = -1.0) -> ColorRect:
	var r: ColorRect = sheet(parent, 0.0, 0.0, PAPER, seed)
	var m: ShaderMaterial = r.material
	m.set_shader_parameter("u_wash", Color(pigment, strength))
	return r


static func text(parent: Node, t: String, role: String, col: Color = INK, wrap: bool = false) -> Label:
	return Kit.text(parent, t, role, col, wrap)


# ── Open and close ────────────────────────────────────────────────────────────

## OPEN A PAPER SHEET on `host` (a Control filling the screen): the scrim
## (SCRIM_SHEET, fading in; a press on it calls on_scrim), the sheet centred
## at `size` (SHEET_WIDE or SHEET_NARROW, fitted to the screen), its paper,
## and a body column inside a margin. The host becomes the night root for
## night_side (the expedition side) or the day's. The sheet rises in
## (Motion.panel_in). Returns { "scrim", "sheet", "body" }; keep it for
## Paper.close.
static func open(host: Control, size: Vector2 = SHEET_WIDE, night_side: bool = false, on_scrim: Callable = Callable(), margin: int = 28) -> Dictionary:
	host.set_meta("night_root", night_side)
	var shade: ColorRect = Kit.scrim(host, Kit.SCRIM_SHEET)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if on_scrim.is_valid() and e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			on_scrim.call())
	var vp: Vector2 = host.get_viewport_rect().size if host.is_inside_tree() else Vector2(1920, 1080)
	var w: float = minf(size.x, vp.x - 40.0)
	var h: float = minf(size.y, vp.y - 40.0)
	var sh: Control = Control.new()
	sh.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	sh.offset_left = -w / 2.0
	sh.offset_right = w / 2.0
	sh.offset_top = -h / 2.0
	sh.offset_bottom = h / 2.0
	host.add_child(sh)
	var seed: float = -1.0
	if host.get_script() != null:
		seed = float(absi(str((host.get_script() as Script).resource_path).hash()) % 5000) / 100.0
	sheet(sh, 8.0, 1.0, NIGHT_PAPER if night_side else PAPER, seed)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, margin)
	sh.add_child(m)
	var body: VBoxContainer = VBoxContainer.new()
	body.add_theme_constant_override("separation", 10)
	m.add_child(body)
	Motion.panel_in(sh)
	return { "scrim": shade, "sheet": sh, "body": body }


## CLOSE a sheet Paper.open built: input stops, the sheet and scrim fade out,
## the host is freed. Emit the host's `closed` first. Safe to call twice.
static func close(host: Control, parts: Dictionary) -> void:
	Motion.dismiss(host, parts.get("sheet") as Control, parts.get("scrim") as CanvasItem)


# ── The header ────────────────────────────────────────────────────────────────

## THE HEADER every menu shares (M1): the eyebrow and the title (display_sm)
## on the left; on the far right a slot for a badge (the purse), then "Close
## Esc" (on_close) or, given `back`, the back pill to that place; the tabs on
## their own row below (Paper.tab: options [[key, label], ...], current,
## on_tab gets the key); then the rule. Night comes from the parent's root.
## Returns { "head" (the whole), "titles" (eyebrow and title; add a blurb
## here), "title", "right" (the badge slot), "close", "tabs", "rule" }.
static func header(parent: Control, title: String, eyebrow: String = "", on_close: Callable = Callable(), tabs: Array = [], current: Variant = null, on_tab: Callable = Callable(), back: String = "", close_label: String = "Close  Esc") -> Dictionary:
	var nt: bool = is_night(parent)
	var head: VBoxContainer = VBoxContainer.new()
	head.add_theme_constant_override("separation", 6)
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(head)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	head.add_child(row)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 0)
	row.add_child(titles)
	if eyebrow != "":
		var eb: Label = text(titles, eyebrow, "eyebrow", Color(CHOSEN, Kit.EYEBROW_ALPHA + 0.2) if nt else EYEBROW)
		eb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tl: Label = text(titles, title, "display_sm", NIGHT_INK if nt else INK)
	tl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var right: HBoxContainer = HBoxContainer.new()
	right.add_theme_constant_override("separation", 10)
	right.alignment = BoxContainer.ALIGNMENT_END
	right.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(right)
	var x: Control = null
	if back != "":
		var pill: Pane.PaneButton = Kit.back_pill(back)
		if on_close.is_valid():
			pill.pressed.connect(func() -> void: on_close.call())
		row.add_child(pill)
		x = pill
	elif on_close.is_valid():
		var cb: Pane.PaneButton = button(close_label, false, nt)
		cb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		cb.pressed.connect(func() -> void: on_close.call())
		row.add_child(cb)
		x = cb
	var tab_row: HBoxContainer = HBoxContainer.new()
	tab_row.add_theme_constant_override("separation", 4)
	head.add_child(tab_row)
	tab_row.visible = not tabs.is_empty()
	for o: Array in tabs:
		var key: Variant = o[0]
		var tb: Pane.PaneButton = tab(String(o[1]), key == current, nt)
		tb.pressed.connect(func() -> void:
			if on_tab.is_valid():
				on_tab.call(key))
		tab_row.add_child(tb)
	var ru: Control = rule(head, nt)
	return { "head": head, "titles": titles, "title": tl, "right": right, "close": x, "tabs": tab_row, "rule": ru }


## A text field on the night paper: a dark well, a faint cream hairline,
## cream ink. THE one style for typing on the night paper (the Crew Hall's
## rename, the Gunwharf's ship name).
static func night_field(max_len: int) -> LineEdit:
	var field: LineEdit = LineEdit.new()
	field.max_length = max_len
	field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var fsb: StyleBoxFlat = StyleBoxFlat.new()
	fsb.bg_color = Color(0.13, 0.105, 0.09)
	fsb.border_color = Color(NIGHT_INK, 0.35)
	fsb.set_border_width_all(1)
	fsb.set_corner_radius_all(6)
	fsb.content_margin_left = 10
	fsb.content_margin_right = 10
	for st: String in ["normal", "focus"]:
		field.add_theme_stylebox_override(st, fsb)
	field.add_theme_color_override("font_color", NIGHT_INK)
	field.add_theme_color_override("font_placeholder_color", NIGHT_INK_FAINT)
	return field


## THE FEEDBACK LINE: an 18px line reserved under the header (so a message
## never pushes the list down). Paper.say puts words on it.
static func status_line(parent: Control) -> Label:
	var l: Label = text(parent, "", "small", ink_soft(parent))
	l.custom_minimum_size = Vector2(0, STATUS_H)
	l.clip_text = true
	l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.modulate.a = 0.0
	return l


## Say something on a status line: the words fade in (Motion.rise_word).
## col: a tone (red(n), green(n)); none: the soft ink. "" clears it.
static func say(line: Label, t: String, col: Color = Color(0, 0, 0, 0)) -> void:
	if not is_instance_valid(line):
		return
	line.text = t
	line.add_theme_color_override("font_color", col if col.a > 0.0 else ink_soft(line))
	if t == "":
		line.modulate.a = 0.0
		return
	Motion.rise_word(line)


# ── Buttons ───────────────────────────────────────────────────────────────────

## A QUIET BUTTON (M2): paper with inked capitals (button_small); `on`, flat
## ink with paper words (cream with dark words at night; it was a plank of
## grained wood until 2026-10-10). Focusable for a pad (the ring
## shows only for keyboard and pad focus). nt: the night paper (null: the
## deprecated Paper.night); it also follows its root when it lands.
static func button(label: String, on: bool = false, nt: Variant = null) -> Pane.PaneButton:
	var dark: bool = night if nt == null else bool(nt)
	var specs: Array = _button_specs(on, dark)
	var b: Pane.PaneButton = Pane.PaneButton.new(specs[0], specs[1])
	b.text = label.to_upper()
	var r: Array = Kit.ROLES["button_small"]
	b.add_theme_font_override("font", Kit.tracked(r[0], r[1], r[2], r[3]))
	b.add_theme_font_size_override("font_size", r[2])
	_button_ink(b, on, dark)
	b.custom_minimum_size = Vector2(0, 32)
	b.focus_mode = Control.FOCUS_ALL
	b.set_meta("paper_night", dark)
	b.tree_entered.connect(func() -> void:
		var k: int = Paper._root(b)
		if k >= 0 and (k == 1) != bool(b.get_meta("paper_night")):
			b.set_meta("paper_night", k == 1)
			var s2: Array = Paper._button_specs(on, k == 1)
			b.restyle(s2[0], s2[1])
			Paper._button_ink(b, on, k == 1)
		elif k >= 0:
			Paper._button_ink(b, on, k == 1))
	Kit.tap(b)
	return b


static func _button_specs(on: bool, dark: bool) -> Array:
	if on:
		var ps: Array = Kit.primary_specs(dark, [12, 6, 12, 7], Kit.R_SMALL)
		(ps[0] as Dictionary)["night"] = dark
		(ps[1] as Dictionary)["night"] = dark
		return ps
	var face: Color = Color(0.27, 0.22, 0.18, 0.97) if dark else Color(PAPER, 0.97)
	var lk: Color = NIGHT_INK if dark else INK
	var n: Dictionary = { "radius": Kit.R_SMALL, "fill": [face], "border": [1, Color(lk, 0.4 if dark else 0.5)], "shadow": [Color(0, 0, 0, 0.3 if dark else 0.16), 6, Vector2(0, 2)], "pad": [12, 6, 12, 7], "keep": true, "night": dark }
	var hv: Dictionary = n.duplicate()
	hv["fill"] = [face.lightened(0.12) if dark else PAPER.lightened(0.1)]
	hv["border"] = [1, Color(lk, 0.8)]
	return [n, hv]


static func _button_ink(b: Button, on: bool, dark: bool) -> void:
	var c: Color = (NIGHT_PAPER_DEEP if dark else PAPER) if on else (NIGHT_INK if dark else INK)
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, c)
	b.add_theme_color_override("font_disabled_color", Color(c, 0.4))
	b.set_meta("day_font", c)


## THE PRIMARY (M2): the one thing to do on a sheet ("Forge it", "Sign on"),
## 46px in Cinzel 16: flat ink on the day paper, flat cream on the night's
## (Kit.primary_specs; it was a plank of stained wood until 2026-10-10).
static func primary(label: String, nt: Variant = null) -> Pane.PaneButton:
	var dark: bool = night if nt == null else bool(nt)
	var b: Pane.PaneButton = Kit.button(label, "primary", "large")
	if dark:
		var ps: Array = Kit.primary_specs(true, [18, 11, 18, 11], 12)
		b.restyle(ps[0], ps[1])
		Kit._ink_all(b, NIGHT_PAPER_DEEP)
	b.custom_minimum_size = Vector2(0, 46)
	b.focus_mode = Control.FOCUS_ALL
	return b


## A TAB (M2): a word, no border; the chosen one inked full and underlined,
## the rest soft. nt as button's.
static func tab(label: String, on: bool = false, nt: Variant = null) -> Pane.PaneButton:
	var dark: bool = night if nt == null else bool(nt)
	var n: Dictionary = { "radius": 6, "fill": [Color(0, 0, 0, 0)], "pad": [10, 6, 10, 9], "keep": true, "night": dark }
	var hv: Dictionary = n.duplicate()
	hv["fill"] = [Color(NIGHT_INK if dark else INK, 0.05)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, hv)
	b.text = label.to_upper()
	var r: Array = Kit.ROLES["button_small"]
	b.add_theme_font_override("font", Kit.tracked(r[0], r[1], r[2], r[3]))
	b.add_theme_font_size_override("font_size", r[2])
	var full: Color = NIGHT_INK if dark else INK
	var soft: Color = NIGHT_INK_SOFT if dark else INK_SOFT
	b.add_theme_color_override("font_color", full if on else soft)
	for st: String in ["font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, full)
	b.add_theme_color_override("font_disabled_color", Color(soft, 0.5))
	b.set_meta("day_font", full if on else soft)
	b.custom_minimum_size = Vector2(0, 32)
	b.focus_mode = Control.FOCUS_ALL
	var line: Control = Control.new()
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	line.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	line.draw.connect(func() -> void:
		if not on:
			return
		var y: float = line.size.y - 3.0
		line.draw_line(Vector2(10, y), Vector2(line.size.x - 10, y), chosen_ink(dark), 2.0, true))
	b.add_child(line)
	Kit.tap(b)
	return b


static func chosen_ink(dark: bool) -> Color:
	return CHOSEN if dark else RED


## A row of tabs (Paper.tab). options: [[key, label], ...]; on_pick gets the key.
static func tabs(parent: Node, options: Array, current: Variant, on_pick: Callable, nt: Variant = null) -> HBoxContainer:
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 4)
	for o: Array in options:
		var key: Variant = o[0]
		var b: Pane.PaneButton = tab(String(o[1]), key == current, nt)
		b.pressed.connect(func() -> void: on_pick.call(key))
		h.add_child(b)
	if parent != null:
		parent.add_child(h)
	return h


# ── Rules, stats, rings ───────────────────────────────────────────────────────

## A rule drawn in ink, a little uneven. nt as button's.
static func rule(parent: Control, nt: Variant = null) -> Control:
	var c: Control = Control.new()
	c.custom_minimum_size = Vector2(0, 8)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var dark: bool = night if nt == null else bool(nt)
	c.set_meta("rule_ink", Color(NIGHT_INK if dark else INK, 0.3))
	c.tree_entered.connect(func() -> void:
		var k: int = Paper._root(c)
		if k >= 0:
			c.set_meta("rule_ink", Color(NIGHT_INK if k == 1 else INK, 0.3)))
	c.draw.connect(func() -> void:
		var w: float = c.size.x
		var pts: PackedVector2Array = PackedVector2Array()
		for i: int in 25:
			var x: float = w * i / 24.0
			pts.append(Vector2(x, 4.0 + sin(i * 1.7) * 0.5))
		c.draw_polyline(pts, c.get_meta("rule_ink"), 1.0, true))
	parent.add_child(c)
	return c


## A label and a value on one line, in ink.
static func stat(parent: Node, label: String, value: String, tone: Color = INK) -> HBoxContainer:
	if is_night(parent) and tone == INK:
		tone = NIGHT_INK
	var h: HBoxContainer = HBoxContainer.new()
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(h)
	var l: Label = text(h, label, "small", ink_soft(parent))
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text(h, value, "value", tone)
	return h


## THE INKED RING round what is chosen, by hand: an ellipse that does not
## quite close, wobbling a little as if the pen were still on it. Draw it from
## a _draw: c its centre, r its radii, t a clock (0: still). col: none gives
## the chosen ink for ci's paper.
static func ring(ci: CanvasItem, c: Vector2, r: Vector2, t: float = 0.0, col: Color = Color(0, 0, 0, 0), width: float = 2.2) -> void:
	if col.a <= 0.0:
		col = Color(chosen(ci), 0.8)
	var pts: PackedVector2Array = PackedVector2Array()
	var n: int = 48
	for i: int in n + 6:
		var a: float = -2.2 + TAU * i / float(n)
		var wob: float = 1.0 + sin(a * 3.0 + 1.3) * 0.03 + sin(a * 7.0 + t * 0.6) * 0.008 + (i / float(n)) * 0.04
		pts.append(c + Vector2(cos(a) * r.x, sin(a) * r.y) * wob)
	ci.draw_polyline(pts, col, width, true)


## AN ITEM ON PAPER: a watercolour blot in its pigment, the art on it, its name
## under, a corner note (a count, a price), and the inked ring when worn. It
## takes its paper's side (night or day) when it lands.
class Tile:
	extends Button
	## The worn one: its ring wobbles, so it keeps the tile processing.
	var on: bool = false:
		set(v):
			on = v
			if v:
				set_process(true)
	var pigment: Color = Color(0.4, 0.55, 0.62)
	var art: Texture2D
	var label: String = ""
	var corner: String = ""
	var dim: bool = false
	## Not collected: the art in grey pencil, the blot faint, the name faint.
	var grey: bool = false
	var _t: float = 0.0
	var _hot: float = 0.0
	var _pic: TextureRect
	var _night: bool = false

	func _ready() -> void:
		_night = Paper.is_night(self)
		flat = true
		focus_mode = Control.FOCUS_ALL
		var empty: StyleBoxEmpty = StyleBoxEmpty.new()
		for st: String in ["normal", "hover", "pressed", "focus", "disabled", "hover_pressed"]:
			add_theme_stylebox_override(st, empty)
		var holder: Control = Control.new()
		holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		holder.offset_bottom = -24
		add_child(holder)
		Paper.blot(holder, Color(0.5, 0.48, 0.45) if grey else pigment, 0.35 if grey else (0.9 if not dim else 0.4), float(absi(label.hash()) % 5000) / 100.0)
		_pic = TextureRect.new()
		_pic.texture = art
		_pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_pic.offset_left = 10
		_pic.offset_right = -10
		_pic.offset_top = 8
		_pic.offset_bottom = -6
		_pic.pivot_offset = Vector2(0, 0)
		_pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if dim:
			_pic.modulate = Color(1, 1, 1, 0.55)
		if grey:
			Kit.grey(_pic)
		holder.add_child(_pic)
		var n: Label = Paper.text(self, label, "small", Paper.chosen_ink(_night) if on else ((Paper.NIGHT_INK_FAINT if _night else Paper.INK_FAINT) if grey else (Paper.NIGHT_INK if _night else Paper.INK)))
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		n.clip_text = true
		n.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		n.anchor_top = 1.0
		n.anchor_bottom = 1.0
		n.anchor_right = 1.0
		n.offset_top = -22
		n.offset_left = 2
		n.offset_right = -2
		n.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if corner != "":
			var c: Label = Paper.text(self, corner, "value", Paper.NIGHT_INK if _night else Paper.INK)
			c.anchor_left = 1.0
			c.anchor_right = 1.0
			c.offset_left = -60
			c.offset_right = -4
			c.offset_top = 2
			c.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		mouse_entered.connect(_heat.bind(1.0))
		mouse_exited.connect(_heat.bind(0.0))
		focus_entered.connect(_heat.bind(1.0))
		focus_exited.connect(_heat.bind(0.0))
		Kit.tap(self)
		# Idle tiles do not process (a sheet can hold a hundred): only the
		# hovered or focused one, one still settling, and the worn one.
		set_process(on)

	func _heat(v: float) -> void:
		_hot = v
		set_process(true)

	func _process(delta: float) -> void:
		_t += delta
		var k: float = Motion.hover_k(delta)
		var s: float = lerpf(_pic.scale.x, 1.0 + 0.07 * _hot, k)
		_pic.pivot_offset = _pic.size / 2.0
		_pic.scale = Vector2(s, s)
		_pic.rotation = lerpf(_pic.rotation, sin(_t * 2.2) * 0.035 * _hot, k)
		if on:
			queue_redraw()
		elif _hot == 0.0 and absf(s - 1.0) < 0.001 and absf(_pic.rotation) < 0.001:
			# At rest: snap and stop until the next hover or focus.
			_pic.scale = Vector2.ONE
			_pic.rotation = 0.0
			set_process(false)

	## The worn one is circled in ink, by hand (Paper.ring).
	func _draw() -> void:
		if not on:
			return
		var c: Vector2 = Vector2(size.x / 2.0, (size.y - 24.0) / 2.0 + 2.0)
		var r: Vector2 = Vector2(size.x * 0.47, (size.y - 24.0) * 0.5)
		Paper.ring(self, c, r, _t, Color(Paper.chosen_ink(_night), 0.8))
