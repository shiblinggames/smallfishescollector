class_name Dossier
extends Control
## A FIGHTER'S DOSSIER: the one layout the enemy's stat card and the captain's
## ledger share (Kong, 2026-10-03: the cards "look super AI especially with
## the accent color strips ... can be redesigned to look a lot better").
##
## Set like a page, not a dashboard. LEFT, the art, large: the enemy's painting
## (or a captain's ship, their avatar set into its corner) standing on a flat
## disc of its colour (no shadow under it, M5). RIGHT, a quiet lead-in line, the
## name, the hull as one wide bar, the numbers as a row of figures over small
## words with hairlines between, and then plain sections: a sentence-case
## heading, entries as a name and a line of description, no boxes, no strips,
## no icon tiles. Colour is kept for meaning (red harm, green help, gold a
## warning to answer). Flat, on the night side's browns. Escape, the X or a
## click outside shuts it.

signal closed

const W: float = 920.0
const ART_W: float = 360.0
## The night paper's tokens (aliases, so the dossier cannot drift).
const FILL: Color = Paper.NIGHT_PAPER_DEEP
const ART_FILL: Color = Paper.NIGHT_PAPER
const INK: Color = Paper.NIGHT_INK
const SOFT: Color = Paper.NIGHT_INK_SOFT
const FAINT: Color = Paper.NIGHT_INK_FAINT
const HAIR: Color = Paper.NIGHT_HAIR
const HARM: Color = Kit.HARM
const HELP: Color = Kit.HELP
const WARN: Color = Kit.CAUTION

## The art and its ground.
var art: Texture2D
var disc: Color = Color(0.3, 0.4, 0.45)
## A captain's avatar, set into the art's corner (null for an enemy).
var badge: Texture2D
## Was: a shadow under a standing figure. Art has no floor shadow now (M5);
## kept so the cards that set it still compile.
var ground: bool = true
var lead: String = ""
var title: String = ""
var hull: float = 0.0
var hull_max: float = 1.0
var shield: float = 0.0
var hull_col: Color = HARM
## [[figure, word], ...]
var figures: Array = []

var _list: VBoxContainer
var _card: Panel
var _scrim: ColorRect


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE scrim (Kit's tinted base at the sheet weight). It dims in at Kong's
	# slower pace rather than going dark at once (2026-10-05: the card "pops
	# up too quickly").
	_scrim = Kit.scrim(self, Kit.SCRIM_SHEET, false)
	_scrim.modulate.a = 0.0
	Motion.ease_fade(create_tween(), _scrim, "modulate:a", 1.0, 0.3)
	_scrim.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
			_close())
	var vp: Vector2 = get_viewport_rect().size
	var h: float = minf(vp.y - 80.0, 620.0)
	_card = Panel.new()
	_card.add_theme_stylebox_override("panel", BattleLook.box(FILL, HAIR, 1, 18, 40.0, Color(0, 0, 0, 0.55)))
	_card.size = Vector2(W, h)
	_card.position = (vp - _card.size) / 2.0
	_card.clip_contents = true
	add_child(_card)
	var pane: ArtPane = ArtPane.new()
	pane.d = self
	pane.position = Vector2.ZERO
	pane.size = Vector2(ART_W, h)
	_card.add_child(pane)
	# The page.
	var page: MarginContainer = MarginContainer.new()
	page.position = Vector2(ART_W, 0)
	page.size = Vector2(W - ART_W, h)
	for side: Array in [["left", 34], ["right", 34], ["top", 30], ["bottom", 24]]:
		page.add_theme_constant_override("margin_" + side[0], side[1])
	_card.add_child(page)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	page.add_child(col)
	_role(col, lead, "desc", SOFT)
	_gap(col, 2)
	_role(col, title, "display_sm", INK)
	_gap(col, 16)
	var hb: HullBar = HullBar.new()
	hb.d = self
	hb.custom_minimum_size = Vector2(0, 38)
	col.add_child(hb)
	_gap(col, 18)
	var fr: Figures = Figures.new()
	fr.items = figures
	fr.custom_minimum_size = Vector2(0, 52)
	col.add_child(fr)
	_gap(col, 18)
	var rule: ColorRect = ColorRect.new()
	rule.color = HAIR
	rule.custom_minimum_size = Vector2(0, 1)
	col.add_child(rule)
	var sc: ScrollContainer = ScrollContainer.new()
	sc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(sc)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 0)
	sc.add_child(_list)
	_content()
	_gap(_list, 8)
	# THE close button, on the night paper.
	var x: Pane.PaneButton = Kit.close_button(true)
	x.position = Vector2(W - 46, 14)
	x.size = Vector2(30, 30)
	x.focus_mode = Control.FOCUS_NONE
	x.pressed.connect(_close)
	_card.add_child(x)
	_card.modulate.a = 0.0
	# As tall as the page needs (the art wants some height), up to the screen.
	await get_tree().process_frame
	var need: float = col.get_combined_minimum_size().y - sc.get_combined_minimum_size().y + _list.get_combined_minimum_size().y + 54.0
	h = clampf(need, 480.0, h)
	_card.size.y = h
	pane.size.y = h
	page.size.y = h
	_card.position = (vp - _card.size) / 2.0
	# THE panel move (Motion.panel_in: SINE fade, CUBIC rise, no BACK), at
	# Kong's slower pace for this card.
	Motion.panel_in(_card, true, 1.25)


## Filled by the card: sections on the page.
func _content() -> void:
	pass


## Escape or the pad's B closes it; other keys pass on.
func _unhandled_input(ev: InputEvent) -> void:
	if ev.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		_close()


func _close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	Motion.dismiss(self, _card, _scrim)


# ── The page's pieces ─────────────────────────────────────────────────────────

func _text(parent: Control, s: String, family: String, weight: int, fs: int, c: Color, wrap: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = s
	l.add_theme_font_override("font", Kit.font(family, weight))
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", c)
	l.add_theme_constant_override("line_spacing", 2)
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		l.custom_minimum_size.x = 120
	parent.add_child(l)
	return l


## A label in one of the kit's roles (Kit.ROLES), on the dossier's ink.
func _role(parent: Control, s: String, role: String, c: Color, wrap: bool = false) -> Label:
	var l: Label = Kit.text(null, s, role, c, wrap)
	l.add_theme_constant_override("line_spacing", 2)
	if wrap:
		l.custom_minimum_size.x = 120
	parent.add_child(l)
	return l


func _gap(parent: Control, px: float) -> void:
	var g: Control = Control.new()
	g.custom_minimum_size = Vector2(0, px)
	parent.add_child(g)


## A section's heading, in sentence case.
func heading(s: String, aside: String = "") -> void:
	_gap(_list, 22)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_list.add_child(row)
	_role(row, s, "heading", INK)
	if aside != "":
		var a: Label = _role(row, aside, "small", FAINT)
		a.size_flags_vertical = Control.SIZE_SHRINK_END
	_gap(_list, 8)


## An entry: its name (and what kind of thing it is, quietly), then what it
## does. dot: a small mark of meaning before the name (none: no mark).
func entry(name: String, kind: String, desc: String, dot: Color = Color(0, 0, 0, 0)) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_list.add_child(row)
	if dot.a > 0.0:
		var m: Dot = Dot.new()
		m.col = dot
		m.custom_minimum_size = Vector2(8, 20)
		row.add_child(m)
	_role(row, name, "name_strong", INK)
	if kind != "":
		var k: Label = _role(row, kind, "small", FAINT)
		k.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if desc != "":
		var d: Label = _role(_list, desc, "desc", SOFT, true)
		if dot.a > 0.0:
			d.add_theme_constant_override("line_spacing", 2)
	_gap(_list, 12)


## A line of short chips (class bonuses, tides): THE chip (Kit.chip).
func chips(items: Array) -> void:
	var flow: HFlowContainer = HFlowContainer.new()
	flow.add_theme_constant_override("h_separation", 8)
	flow.add_theme_constant_override("v_separation", 8)
	_list.add_child(flow)
	for it: Array in items:
		Kit.chip(flow, str(it[0]), it[1])
	_gap(_list, 12)


## A timeline of steps (a boss's phases): a hairline down the side, a dot at
## each step, its title and lines beside it.
func timeline(steps: Array) -> void:
	for i: int in steps.size():
		var st: Dictionary = steps[i]
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 14)
		_list.add_child(row)
		var rail: Rail = Rail.new()
		rail.first = i == 0
		rail.last = i == steps.size() - 1
		rail.col = st.get("col", HARM)
		rail.custom_minimum_size = Vector2(14, 0)
		rail.size_flags_vertical = Control.SIZE_FILL
		row.add_child(rail)
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 3)
		row.add_child(v)
		var top: HBoxContainer = HBoxContainer.new()
		top.add_theme_constant_override("separation", 10)
		v.add_child(top)
		_role(top, str(st["title"]), "name_strong", INK)
		if str(st.get("aside", "")) != "":
			_role(top, str(st["aside"]), "small", FAINT).size_flags_vertical = Control.SIZE_SHRINK_CENTER
		for ln: Array in Js.list(st.get("lines")):
			_text(v, str(ln[0]), "karla", int(ln[2]) if ln.size() > 2 else 500, 14, ln[1], true)
		_gap(v, 14)


# ── Drawn pieces ──────────────────────────────────────────────────────────────

class ArtPane:
	extends Control
	var d: Dossier

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = Dossier.ART_FILL
		sb.corner_radius_top_left = 18
		sb.corner_radius_bottom_left = 18
		sb.anti_aliasing = true
		sb.draw(get_canvas_item(), r)
		var foot: float = r.size.y - 54.0
		var ar: Rect2 = Rect2()
		if d.art != null:
			var box: Vector2 = Vector2(r.size.x - 40.0, foot - 30.0)
			var sc: float = minf(box.x / float(d.art.get_width()), box.y / float(d.art.get_height()))
			var ts: Vector2 = d.art.get_size() * sc
			ar = Rect2(Vector2((r.size.x - ts.x) / 2.0, foot + 6.0 - ts.y), ts)
		# The disc sits behind the art's middle.
		var c: Vector2 = ar.get_center() if d.art != null else r.get_center()
		var rad: float = minf(r.size.x * 0.42, maxf(ar.size.x, ar.size.y) * 0.5)
		draw_circle(c, rad, Color(d.disc, 0.2))
		draw_circle(c, rad * 0.7, Color(d.disc, 0.14))
		if d.art != null:
			draw_texture_rect(d.art, ar, false)
		if d.badge != null:
			var bc: Vector2 = Vector2(62, r.size.y - 62)
			draw_circle(bc, 40.0, Dossier.ART_FILL)
			BattleLook.medallion(self, bc, 36.0, d.badge, Dossier.HELP, "", 1.0, Vector2(0.5, 0.5), 0.5)
		draw_line(Vector2(r.size.x - 0.5, 0), Vector2(r.size.x - 0.5, r.size.y), Dossier.HAIR, 1.0)


class HullBar:
	extends Control
	var d: Dossier

	func _draw() -> void:
		var f: Font = Kit.role_font("small")
		var px: int = Kit.role_px("small")
		draw_string(f, Vector2(0, 14), "Hull", HORIZONTAL_ALIGNMENT_LEFT, -1, px, Dossier.SOFT)
		var v: String = "%d / %d" % [int(d.hull), int(d.hull_max)]
		if d.shield > 0.0:
			v += "   +%d shield" % int(d.shield)
		var vw: float = f.get_string_size(v, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
		draw_string(f, Vector2(size.x - vw, 14), v, HORIZONTAL_ALIGNMENT_LEFT, -1, px, Dossier.INK)
		var r: Rect2 = Rect2(0, 24, size.x, 10)
		BattleLook.draw_box(self, r, BattleLook.box(Color(0, 0, 0, 0.4), Color(0, 0, 0, 0), 0, 5))
		var fr: float = clampf(d.hull / maxf(1.0, d.hull_max), 0.0, 1.0)
		if fr > 0.0:
			BattleLook.draw_box(self, Rect2(r.position, Vector2(maxf(10.0, r.size.x * fr), r.size.y)), BattleLook.box(d.hull_col, Color(0, 0, 0, 0), 0, 5))
		if d.shield > 0.0:
			BattleLook.draw_box(self, Rect2(r.position + Vector2(0, -5), Vector2(r.size.x * clampf(d.shield / maxf(1.0, d.hull_max), 0.0, 1.0), 3)), BattleLook.box(BattleLook.SHIELD, Color(0, 0, 0, 0), 0, 1.5))


## The numbers: figures over small words, hairlines between.
class Figures:
	extends Control
	var items: Array = []

	func _draw() -> void:
		if items.is_empty():
			return
		var n: int = items.size()
		var cw: float = size.x / float(n)
		var big: Font = Kit.role_font("figure")
		var small: Font = Kit.role_font("small")
		for i: int in n:
			var x: float = cw * i
			if i > 0:
				draw_line(Vector2(x, 6), Vector2(x, size.y - 4), Dossier.HAIR, 1.0)
			var pad: float = 0.0 if i == 0 else 16.0
			draw_string(big, Vector2(x + pad, 26), str(items[i][0]), HORIZONTAL_ALIGNMENT_LEFT, cw - pad - 4, Kit.role_px("figure"), Dossier.INK)
			draw_string(small, Vector2(x + pad, 46), str(items[i][1]), HORIZONTAL_ALIGNMENT_LEFT, cw - pad - 4, Kit.role_px("small"), Dossier.SOFT)


class Dot:
	extends Control
	var col: Color

	func _draw() -> void:
		draw_circle(Vector2(4, size.y / 2.0 + 1.0), 3.5, col)


class Rail:
	extends Control
	var first: bool = false
	var last: bool = false
	var col: Color

	func _draw() -> void:
		var x: float = size.x / 2.0
		draw_line(Vector2(x, 0.0 if not first else 10.0), Vector2(x, size.y if not last else 10.0), Dossier.HAIR, 1.5)
		draw_circle(Vector2(x, 10), 5.0, Dossier.FILL)
		draw_circle(Vector2(x, 10), 4.0, col)
