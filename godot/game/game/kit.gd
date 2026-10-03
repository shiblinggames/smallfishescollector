class_name Kit
extends RefCounted
## THE GAME'S DESIGN SYSTEM (Godot port, the style kit). Every screen is built
## from these pieces, so the same role always looks the same. The web was the
## reference, not the rule: where it styled one role five ways (close buttons,
## eyebrows, modal shells, three grey inks, two rarity palettes) one standard
## was chosen, and it is written here. docs/systems/steam-port.md, "The style
## kit", lists each choice.
##
## A room has an ACCENT (the Almanac violet, the shops gold, the sea warm sand)
## that tints its eyebrows, selected tabs and borders; everything else is
## shared.

# ── Colour ─────────────────────────────────────────────────────────────────────

## One warm ink ramp for every screen (was three: violet, cool, warm grey).
const INK: Color = Color("#f4ecd8")
const INK_2: Color = Color("#d8d2c6")
const DIM: Color = Color("#9a9488")
const FAINT: Color = Color("#6a6764")
const GHOST: Color = Color("#4a4845")

const GOLD: Color = Color("#f0c040")
const GOLD_HI: Color = Color("#f5cf6a")
const GOLD_LO: Color = Color("#e0a82e")
const GOLD_INK: Color = Color("#1a1508")
const SAND: Color = Color("#ffce8a")
const BRONZE: Color = Color("#c4a96a")
const VIOLET: Color = Color("#a78bfa")
const TEAL: Color = Color("#5eead4")
const SKY: Color = Color("#7dd3fc")
const BLUE: Color = Color("#60a5fa")

const GOOD: Color = Color("#7fd6a0")
const WARN: Color = Color("#e8c98a")
const UP: Color = Color("#4ade80")
const DOWN: Color = Color("#f87171")
const DANGER_INK: Color = Color("#f0a0a0")

## The base every panel stands on (opaque: panels sit over art).
const BASE: Color = Color("#0a1016")
const BASE_DEEP: Color = Color("#080e15")

## PAPER (Kong, 2026-10-01: every screen on painted paper and wood). Panels
## are paper now (Pane turns a dark fill into paper, see Pane.paperize), and
## words ON paper are inked: a light neutral becomes the ink ramp, a bright
## accent its own dark pigment (Kit.ink). Words on the water or a dark
## backdrop keep their light colour, so nothing a screen asks for is lost.
## SEA-WORN PARCHMENT (Kong, 2026-10-01: the first paper was too bright): a
## warm, aged ground, deeper than fresh paper, so a sheet sits in the scene
## instead of glaring over it. The inks are deepened to keep their contrast.
const PAPER: Color = Color(0.83, 0.77, 0.65)
const PAPER_INK: Color = Color(0.18, 0.13, 0.09)
const PAPER_INK_SOFT: Color = Color(0.33, 0.26, 0.19)
const WOOD_HI: Color = Color(0.6, 0.4, 0.22)
const WOOD_LO: Color = Color(0.45, 0.28, 0.15)
const WOOD_INK: Color = Color(0.98, 0.94, 0.85)


## The colour a word takes on paper.
static func ink(c: Color) -> Color:
	var l: float = c.get_luminance()
	if l < 0.5:
		return c
	if c.s < 0.28:
		return Color(PAPER_INK if l >= 0.72 else PAPER_INK_SOFT, c.a)
	return Color.from_hsv(c.h, minf(1.0, c.s * 1.15), c.v * 0.5, c.a)


## The colour a word takes on the night paper: dark inks come up to cream,
## a coloured ink keeps its hue and is lifted.
static func night_ink(c: Color) -> Color:
	var l: float = c.get_luminance()
	if l >= 0.5:
		return c
	if c.s < 0.28:
		return Color(Paper.NIGHT_INK if l < 0.3 else Paper.NIGHT_INK_SOFT, c.a)
	return Color.from_hsv(c.h, c.s * 0.8, maxf(0.82, c.v), c.a)


## Whether a control sits on the night paper: the nearest ancestor that says.
static func on_night(n: Node) -> bool:
	var p: Node = n.get_parent()
	var hops: int = 0
	while p != null and hops < 24:
		if p.has_meta("night") and p.get_meta("night") == true:
			return true
		if p.has_meta("paper") and p.get_meta("paper") == true:
			return false
		if p is CanvasLayer or p is Viewport:
			return false
		p = p.get_parent()
		hops += 1
	return false


## Whether a control sits on paper: the nearest ancestor that says.
static func on_paper(n: Node) -> bool:
	var p: Node = n.get_parent()
	var hops: int = 0
	while p != null and hops < 24:
		if p.has_meta("paper"):
			return bool(p.get_meta("paper"))
		if p is CanvasLayer or p is Viewport:
			return false
		p = p.get_parent()
		hops += 1
	return false


## A label is inked when it lands on paper (and again if it is restyled).
static func _hook(l: Label, col: Color) -> void:
	l.set_meta("raw_ink", col)
	if not l.has_meta("ink_hooked"):
		l.set_meta("ink_hooked", true)
		l.tree_entered.connect(func() -> void: Kit._settle(l))
	if l.is_inside_tree():
		_settle(l)


static func _settle(l: Label) -> void:
	if l.has_meta("lifted") or not l.has_meta("raw_ink"):
		return
	var raw: Color = l.get_meta("raw_ink")
	l.add_theme_color_override("font_color", night_ink(raw) if on_night(l) else (ink(raw) if on_paper(l) else raw))


## Rarity 1-5 (the catch card's palette; the market's near-copy is retired).
const RARITY: Array[Color] = [Color("#94a3b8"), Color("#4ade80"), Color("#60a5fa"), Color("#c084fc"), Color("#f59e0b")]


static func rarity(r: float) -> Color:
	return RARITY[clampi(int(r) - 1, 0, 4)]


static func a(c: Color, alpha: float) -> Color:
	return Color(c, alpha)


# ── Type ───────────────────────────────────────────────────────────────────────
#
# Role: [family, weight, px, tracking (em), upper]. Cinzel for names, titles
# and numbers that matter; Karla for everything read.

const ROLES: Dictionary = {
	"display": ["cinzel", 800, 34, 0.0, false],
	"title": ["cinzel", 700, 22, 0.02, false],
	"heading": ["cinzel", 700, 17, 0.02, false],
	"name": ["cinzel", 700, 15, 0.0, false],
	"number": ["cinzel", 800, 17, 0.0, false],
	"eyebrow": ["karla", 700, 11, 0.16, true],
	"eyebrow_hero": ["karla", 700, 11, 0.24, true],
	"label": ["karla", 600, 11, 0.10, true],
	"body": ["karla", 400, 15, 0.0, false],
	"body_strong": ["karla", 600, 15, 0.0, false],
	"small": ["karla", 600, 13, 0.0, false],
	"note": ["karla", 400, 13, 0.0, false],
	"value": ["karla", 700, 14, 0.0, false],
	"button": ["cinzel", 700, 16, 0.0, false],
	"button_small": ["karla", 700, 11, 0.08, true],
	"chip": ["karla", 700, 10, 0.10, true],
}

static var _files: Dictionary = {}
static var _vars: Dictionary = {}


static func font(family: String, weight: int) -> Font:
	var key: String = "%s%d" % [family, weight]
	if not _files.has(key):
		var path: String = "res://art/fonts/%s-latin-%d-normal.woff2" % [family, weight]
		_files[key] = load(path) if ResourceLoader.exists(path) else ThemeDB.fallback_font
	return _files[key]


## A font with letter-spacing (tracking in em at this size).
static func tracked(family: String, weight: int, px: int, em: float) -> Font:
	if em == 0.0:
		return font(family, weight)
	var key: String = "%s%d/%d/%s" % [family, weight, px, em]
	if not _vars.has(key):
		var v: FontVariation = FontVariation.new()
		v.base_font = font(family, weight)
		v.spacing_glyph = int(round(em * px))
		_vars[key] = v
	return _vars[key]


## Style a label for a role (and colour).
static func style(l: Label, role: String, col: Color = INK) -> Label:
	var r: Array = ROLES[role]
	l.add_theme_font_override("font", tracked(r[0], r[1], r[2], r[3]))
	l.add_theme_font_size_override("font_size", r[2])
	l.add_theme_color_override("font_color", col)
	l.uppercase = r[4]
	_hook(l, col)
	return l


## A label in a role. wrap: it wraps at the width it is given.
static func text(parent: Node, t: String, role: String, col: Color = INK, wrap: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = t
	style(l, role, col)
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		l.custom_minimum_size = Vector2(120, 0)
	if parent != null:
		parent.add_child(l)
	return l


## A label sized in pixels, put on the kit's faces: a short upper-case line is
## an eyebrow (Karla 700, tracked); a title is Cinzel (800 when large); anything
## else is Karla (600 when small). For screens that size type by hand.
static func face(l: Label, px: int, title: bool) -> Label:
	if l.has_theme_color_override("font_color"):
		_hook(l, l.get_theme_color("font_color"))
	var t: String = l.text
	var upper: bool = t.length() > 2 and t == t.to_upper() and t != t.to_lower()
	if upper:
		l.add_theme_font_override("font", tracked("karla", 700, px, 0.18))
	elif title:
		l.add_theme_font_override("font", font("cinzel", 800 if px >= 22 else 700))
	else:
		l.add_theme_font_override("font", font("karla", 600 if px <= 14 else 400))
	return l


## A soft glow under a title (RoomHeader's text-shadow).
static func glow(l: Label, c: Color) -> Label:
	l.add_theme_color_override("font_shadow_color", Color(c.darkened(0.4), 0.22))
	l.add_theme_constant_override("shadow_offset_x", 0)
	l.add_theme_constant_override("shadow_offset_y", 2)
	l.add_theme_constant_override("shadow_outline_size", 5)
	return l


## Words over art: a dark shadow so they read on anything.
static func lift(l: Label) -> Label:
	# Lettering on the water is not lit by the sun or the lanterns.
	l.light_mask = 0
	l.set_meta("lifted", true)
	if l.has_meta("raw_ink"):
		l.add_theme_color_override("font_color", l.get_meta("raw_ink"))
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.75))
	l.add_theme_constant_override("shadow_offset_x", 0)
	l.add_theme_constant_override("shadow_offset_y", 1)
	l.add_theme_constant_override("shadow_outline_size", 4)
	return l


# ── Surfaces ───────────────────────────────────────────────────────────────────

## A modal or sheet: radius 18, opaque base, a hairline in the accent, a deep
## shadow (was five recipes).
static func modal(accent: Color = SAND, pad: Variant = 18) -> Dictionary:
	return { "radius": 18, "fill": [BASE], "border": [1, Color(accent, 0.28)], "shadow": [Color(0, 0, 0, 0.6), 36, Vector2(0, 14)], "pad": pad }


## A card that carries one lit thing (the catch card, the crate): flat, deep,
## one accent hairline.
static func card(accent: Color, pad: Variant = 16) -> Dictionary:
	return { "radius": 16, "fill": [BASE_DEEP], "border": [1, Color(accent, 0.4)], "shadow": [Color(0, 0, 0, 0.55), 24, Vector2(0, 8)], "pad": pad }


## A panel inside a panel.
static func inset(pad: Variant = 12) -> Dictionary:
	return { "radius": 12, "fill": [Color(1, 1, 1, 0.04)], "border": [1, Color(1, 1, 1, 0.08)], "pad": pad }


## A tile (tileSurface): a neutral body, its state on the top rim, a sheen.
## state: "active" (full colour), "owned", "ready" (gold), "locked" (flat).
static func tile(c: Color, state: String = "owned", pad: Variant = 14) -> Dictionary:
	var rim: Color = c if state == "active" else (Color(c, 0.67) if state == "owned" else (Color(GOLD, 0.85) if state == "ready" else Color(1, 1, 1, 0.08)))
	var s: Dictionary = {
		"radius": 15, "fill": [Color(0.075, 0.082, 0.106, 0.96), Color(0.043, 0.051, 0.07, 0.97)],
		"top": [2, rim], "sheen": 0.0 if state == "locked" else 0.06, "border": [1, Color(1, 1, 1, 0.06)],
		"shadow": [Color(0, 0, 0, 0.5), 14, Vector2(0, 3)], "pad": pad,
	}
	if state == "ready":
		s["border"] = [1, Color(GOLD, 0.45)]
	if state == "active":
		s["fill"] = [Color(c, 0.10), Color(0.043, 0.051, 0.07, 0.97)]
	return s


## A door or feature card: the accent fading down into a solid dark floor.
static func door(c: Color, pad: Variant = 12) -> Dictionary:
	return { "radius": 16, "fill": [[Color(c, 0.14), 0.0], [Color(0.016, 0.04, 0.07, 0.72), 0.48], [Color(0.012, 0.03, 0.055, 0.94), 1.0]], "border": [1, Color(c, 0.36)], "shadow": [Color(c, 0.08), 22], "pad": pad }


## A row in a list.
static func row(pad: Variant = 12) -> Dictionary:
	return { "radius": 12, "fill": [Color(0.067, 0.078, 0.098, 0.96)], "border": [1, Color(1, 1, 1, 0.07)], "pad": pad }


static func pane(parent: Node, spec: Dictionary) -> Pane:
	var p: Pane = Pane.new(spec)
	if parent != null:
		parent.add_child(p)
	return p


## The dim behind a modal: one alpha (0.7), or 0.9 for a moment that blocks.
static func scrim(parent: Node, heavy: bool = false) -> ColorRect:
	var r: ColorRect = ColorRect.new()
	r.color = Color(0.008, 0.024, 0.04, 0.9 if heavy else 0.7)
	r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if parent != null:
		parent.add_child(r)
	return r


# ── Buttons ────────────────────────────────────────────────────────────────────
#
# kind: "primary" (solid gold, the one thing to do), "accent" (a wash of the
# room's colour), "secondary" (quiet), "danger". size: "large" (radius 12) or
# "small" (radius 9, the in-row actions). Two radii, was six.

static func button(t: String, kind: String = "secondary", size: String = "large", accent: Color = GOLD) -> Pane.PaneButton:
	var big: bool = size == "large"
	var r: int = 12 if big else 9
	var pad: Array = [18, 11, 18, 11] if big else [12, 6, 12, 7]
	var n: Dictionary
	var h: Dictionary
	var ink: Color
	match kind:
		"primary":
			# The one thing to do is a plank of stained wood.
			n = { "radius": r, "fill": [WOOD_HI, WOOD_LO], "border": [1, Color(0.25, 0.15, 0.08, 0.8)], "shadow": [Color(0.2, 0.12, 0.05, 0.35), 12, Vector2(0, 4)], "pad": pad, "keep": true, "grain": true }
			h = n.duplicate()
			h["fill"] = [WOOD_HI.lightened(0.1), WOOD_LO.lightened(0.08)]
			ink = WOOD_INK
		"accent":
			var tint: Color = PAPER.lerp(accent, 0.2)
			n = { "radius": r, "fill": [tint, tint.darkened(0.04)], "border": [1, Color(ink(accent), 0.55)], "shadow": [Color(0, 0, 0, 0.14), 6, Vector2(0, 2)], "pad": pad, "paper": true }
			h = n.duplicate()
			h["fill"] = [PAPER.lerp(accent, 0.32), PAPER.lerp(accent, 0.26)]
			h["border"] = [1, Color(ink(accent), 0.85)]
			ink = ink(accent).darkened(0.15)
		"danger":
			var red: Color = Color(0.7, 0.22, 0.18)
			n = { "radius": r, "fill": [PAPER.lerp(red, 0.14)], "border": [1, Color(red, 0.6)], "shadow": [Color(0, 0, 0, 0.14), 6, Vector2(0, 2)], "pad": pad, "paper": true }
			h = n.duplicate()
			h["fill"] = [PAPER.lerp(red, 0.24)]
			ink = red.darkened(0.2)
		_:
			n = { "radius": r, "fill": [PAPER], "border": [1, Color(PAPER_INK, 0.45)], "shadow": [Color(0, 0, 0, 0.14), 6, Vector2(0, 2)], "pad": pad, "paper": true }
			h = n.duplicate()
			h["fill"] = [PAPER.lightened(0.1)]
			h["border"] = [1, Color(PAPER_INK, 0.75)]
			ink = PAPER_INK
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.text = t
	var role: Array = ROLES["button" if big else "button_small"]
	if kind == "secondary" and big:
		role = ["karla", 700, 15, 0.0, false]
	b.add_theme_font_override("font", tracked(role[0], role[1], role[2], role[3]))
	b.add_theme_font_size_override("font_size", role[2])
	if role[4]:
		b.text = t.to_upper()
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, ink)
	b.add_theme_color_override("font_disabled_color", Color(ink, 0.4))
	b.custom_minimum_size = Vector2(0, 46 if big else 32)
	tap(b)
	return b


## Press feedback: a small squeeze, as the web's whileTap.
static func tap(c: Control) -> void:
	c.resized.connect(func() -> void: c.pivot_offset = c.size / 2.0)
	if c is BaseButton:
		var b: BaseButton = c
		b.button_down.connect(func() -> void:
			if not b.disabled:
				c.create_tween().tween_property(c, "scale", Vector2.ONE * 0.96, 0.06))
		b.button_up.connect(func() -> void: c.create_tween().tween_property(c, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT))


## THE close button: a 30px circle with a drawn X (was five sizes).
static func close_button() -> Pane.PaneButton:
	var n: Dictionary = { "radius": 15, "fill": [PAPER], "border": [1, Color(PAPER_INK, 0.45)], "shadow": [Color(0, 0, 0, 0.16), 5, Vector2(0, 2)], "pad": 0, "paper": true }
	var h: Dictionary = { "radius": 15, "fill": [PAPER.lightened(0.1)], "border": [1, Color(PAPER_INK, 0.8)], "pad": 0, "paper": true }
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.custom_minimum_size = Vector2(30, 30)
	b.size_flags_horizontal = Control.SIZE_SHRINK_END
	b.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	b.tooltip_text = "Close"
	var x: Glyph = Glyph.new()
	x.kind = "x"
	x.color = PAPER_INK
	x.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	x.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(x)
	tap(b)
	return b


## THE back pill: bronze leather, a gold chevron, the place it goes back to.
static func back_pill(label: String) -> Pane.PaneButton:
	var n: Dictionary = { "radius": 999, "fill": [WOOD_HI, WOOD_LO], "border": [1, Color(0.25, 0.15, 0.08, 0.8)], "shadow": [Color(0, 0, 0, 0.35), 9, Vector2(0, 2)], "pad": [26, 6, 13, 6], "keep": true, "grain": true }
	var h: Dictionary = n.duplicate()
	h["border"] = [1, Color(BRONZE, 0.8)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.text = label.to_upper()
	b.tooltip_text = "Back to %s" % label
	var r: Array = ["karla", 700, 11, 0.1]
	b.add_theme_font_override("font", tracked(r[0], r[1], r[2], r[3]))
	b.add_theme_font_size_override("font_size", r[2])
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		b.add_theme_color_override(st, WOOD_INK)
	b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var chev: Glyph = Glyph.new()
	chev.kind = "back"
	chev.color = WOOD_INK
	chev.position = Vector2(9, 0)
	chev.size = Vector2(12, 30)
	chev.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(chev)
	b.resized.connect(func() -> void: chev.size = Vector2(12, b.size.y))
	tap(b)
	return b


# ── Small pieces ───────────────────────────────────────────────────────────────

## THE chip: a pill (radius 999 everywhere) tinted in one colour.
static func chip(parent: Node, t: String, c: Color, quiet: bool = false) -> Pane:
	var p: Pane = Pane.new({ "radius": 999, "fill": [Color(c, 0.06 if quiet else 0.11)], "border": [1, Color(c, 0.18 if quiet else 0.33)], "pad": [8, 2, 8, 3] })
	p.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	text(p, t, "chip", Color(c, 0.6) if quiet else c)
	if parent != null:
		parent.add_child(p)
	return p


## Gear standing: active (in hand), owned, next, locked.
static func status(parent: Node, kind: String, label: String = "") -> Pane:
	var c: Color = { "active": Color("#5fd9bd"), "owned": UP, "next": GOLD, "locked": Color("#7a7775") }[kind]
	var t: String = label if label != "" else { "active": "Active", "owned": "Owned", "next": "Next", "locked": "Locked" }[kind]
	return chip(parent, t, c)


## THE progress bar: 7 tall (3 for the mini), a faint track, the colour
## brightening along its length, easing to its value.
static func bar(parent: Node, frac: float, c: Color, mini: bool = false) -> Bar:
	var b: Bar = Bar.new()
	b.color = c
	b.custom_minimum_size = Vector2(0, 3 if mini else 7)
	b.set_value(frac, false)
	if parent != null:
		parent.add_child(b)
	return b


## A label on the left, its value on the right (tones: good, warn, bad).
static func stat_row(parent: Node, label: String, value: String, tone: String = "", rule: bool = true) -> HBoxContainer:
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 0)
	parent.add_child(v)
	var h: HBoxContainer = HBoxContainer.new()
	h.custom_minimum_size = Vector2(0, 30)
	v.add_child(h)
	var l: Label = text(h, label, "small", Color(DIM, 1.0))
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var col: Color = GOOD if tone == "good" else (WARN if tone == "warn" else (DOWN if tone == "bad" else INK))
	var r: Label = text(h, value, "value", col)
	r.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if rule:
		var line: ColorRect = ColorRect.new()
		line.color = Color(PAPER_INK, 0.12)
		line.custom_minimum_size = Vector2(0, 1)
		v.add_child(line)
	return h


## A section: a Cinzel heading, an optional note under it.
static func section(parent: Node, title: String, note: String = "", accent: Color = Color(0, 0, 0, 0)) -> VBoxContainer:
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	parent.add_child(v)
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	v.add_child(h)
	if accent.a > 0.0:
		var mark: ColorRect = ColorRect.new()
		mark.color = accent
		mark.custom_minimum_size = Vector2(3, 15)
		mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(mark)
	text(h, title, "heading", INK)
	if note != "":
		var n: Label = text(v, note, "note", DIM, true)
		n.add_theme_font_override("font", italic())
	return v


static var _italic: FontVariation = null


static func italic() -> Font:
	if _italic == null:
		_italic = FontVariation.new()
		_italic.base_font = font("karla", 400)
		_italic.variation_transform = Transform2D(Vector2(1, 0), Vector2(0.2, 1), Vector2.ZERO)
	return _italic


## Money: the value, then the glyph in its colour a little smaller. role:
## "price" (gold) or "total" (ink). gems: ◆ in violet; doubloons ⟡ in gold.
static func money(parent: Node, n: float, role: String = "price", gems: bool = false, size_role: String = "value") -> HBoxContainer:
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 4)
	h.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	var glyph_c: Color = Color("#c084fc") if gems else GOLD
	text(h, Js.thousands(n), size_role, (glyph_c if role == "price" else INK))
	var g: Label = text(h, "◆" if gems else "⟡", size_role, glyph_c)
	g.add_theme_font_size_override("font_size", int(ROLES[size_role][2] * 0.85))
	g.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if parent != null:
		parent.add_child(h)
	return h


## Art standing on its own: a halo of colour behind it and a floor shadow
## under it (the Almanac's shelf). silhouette: not caught yet.
static func art(parent: Node, url: Variant, box: Vector2, halo: Color, silhouette: bool = false) -> Control:
	var holder: Control = Control.new()
	holder.custom_minimum_size = box
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var h: TextureRect = TextureRect.new()
	h.texture = Glow.radial(128, halo)
	h.modulate.a = 0.0 if silhouette else 0.3
	h.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	# A round pool of light, sized by the box's height, whatever its width.
	var hr: float = box.y * 0.62
	h.anchor_left = 0.5
	h.anchor_right = 0.5
	h.anchor_top = 0.5
	h.anchor_bottom = 0.5
	h.offset_left = -hr
	h.offset_right = hr
	h.offset_top = -hr
	h.offset_bottom = hr
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(h)
	var floor_shadow: TextureRect = TextureRect.new()
	floor_shadow.texture = Glow.radial(64, Color(0, 0, 0))
	floor_shadow.modulate.a = 0.0 if silhouette else 0.55
	floor_shadow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	floor_shadow.anchor_left = 0.2
	floor_shadow.anchor_right = 0.8
	floor_shadow.anchor_top = 0.86
	floor_shadow.anchor_bottom = 0.98
	floor_shadow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(floor_shadow)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex(url)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pic.offset_left = box.x * 0.06
	pic.offset_right = -box.x * 0.06
	pic.offset_top = box.y * 0.04
	pic.offset_bottom = -box.y * 0.1
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if silhouette:
		pic.modulate = Color(0, 0, 0, 0.26)
	holder.add_child(pic)
	if parent != null:
		parent.add_child(holder)
	return holder


# ── Tabs ───────────────────────────────────────────────────────────────────────

## Pill tabs (or a joined segmented control) in the room's accent. options:
## [[key, label], ...]. on_pick gets the key.
static func tabs(parent: Node, options: Array, current: Variant, accent: Color, on_pick: Callable, joined: bool = false) -> HBoxContainer:
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 0 if joined else 6)
	for i: int in options.size():
		var o: Array = options[i]
		var on: bool = o[0] == current
		var r: int = 9 if joined else 999
		var n: Dictionary = { "radius": r, "fill": [PAPER.lerp(accent, 0.22) if on else PAPER], "border": [1, Color(ink(accent), 0.6) if on else Color(PAPER_INK, 0.3)], "pad": [12, 5, 12, 6], "paper": true }
		var hot: Dictionary = n.duplicate()
		hot["fill"] = [PAPER.lerp(accent, 0.3) if on else PAPER.lightened(0.1)]
		var b: Pane.PaneButton = Pane.PaneButton.new(n, hot)
		b.text = String(o[1])
		var role: Array = ROLES["button_small"]
		b.add_theme_font_override("font", tracked(role[0], role[1], role[2], role[3]))
		b.add_theme_font_size_override("font_size", role[2])
		b.text = b.text.to_upper()
		var tab_ink: Color = ink(accent).darkened(0.15) if on else PAPER_INK_SOFT
		for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
			b.add_theme_color_override(st, tab_ink)
		b.pressed.connect(func() -> void: on_pick.call(o[0]))
		tap(b)
		h.add_child(b)
	if parent != null:
		parent.add_child(h)
	return h


# ── Motion ─────────────────────────────────────────────────────────────────────
#
# Three moves (was a dozen springs): a modal rising in, art popping in, and a
# stagger for tiles.

static func modal_in(c: Control) -> void:
	c.modulate.a = 0.0
	var goal: Vector2 = c.position
	c.position = goal + Vector2(0, 20)
	c.pivot_offset = c.size / 2.0
	c.scale = Vector2.ONE * 0.97
	var tw: Tween = c.create_tween().set_parallel(true)
	tw.tween_property(c, "modulate:a", 1.0, 0.18)
	tw.tween_property(c, "position", goal, 0.34).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(c, "scale", Vector2.ONE, 0.34).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


static func pop(c: Control, delay: float = 0.0) -> void:
	c.pivot_offset = c.size / 2.0
	c.scale = Vector2.ONE * 0.62
	c.modulate.a = 0.0
	var tw: Tween = c.create_tween().set_parallel(true)
	tw.tween_property(c, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT).set_delay(delay)
	tw.tween_property(c, "modulate:a", 1.0, 0.15).set_delay(delay)


static func stagger(c: Control, i: int) -> void:
	var goal: float = c.modulate.a
	c.modulate.a = 0.0
	var tw: Tween = c.create_tween()
	tw.tween_interval(minf(0.3, 0.03 * i))
	tw.tween_property(c, "modulate:a", goal, 0.28).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


# ── Drawn bits ─────────────────────────────────────────────────────────────────

## Small vector marks drawn rather than typed: the X, the back chevron, the
## forward chevron, a lock, a tick.
class Glyph:
	extends Control
	var kind: String = "x"
	var color: Color = Color("#cfcabf")

	func _draw() -> void:
		var c: Vector2 = size / 2.0
		match kind:
			"x":
				var d: float = 5.0
				draw_line(c + Vector2(-d, -d), c + Vector2(d, d), color, 2.2, true)
				draw_line(c + Vector2(d, -d), c + Vector2(-d, d), color, 2.2, true)
			"back":
				draw_polyline(PackedVector2Array([c + Vector2(3, -5), c + Vector2(-2, 0), c + Vector2(3, 5)]), color, 2.6, true)
			"next":
				draw_polyline(PackedVector2Array([c + Vector2(-2, -5), c + Vector2(3, 0), c + Vector2(-2, 5)]), color, 2.2, true)
			"tick":
				draw_polyline(PackedVector2Array([c + Vector2(-5, 0), c + Vector2(-1, 4), c + Vector2(6, -5)]), color, 2.2, true)
			"lock":
				draw_rect(Rect2(c + Vector2(-6, -1), Vector2(12, 9)), color, false, 2.0)
				draw_arc(c + Vector2(0, -2), 4.0, PI, TAU, 12, color, 2.0, true)
			"trophy":
				# The Almanac's cup: a bowl, two handles, a stem and a foot.
				var k: float = minf(size.x, size.y) / 24.0
				var o: Vector2 = c - Vector2(12, 12) * k
				var cup: PackedVector2Array = PackedVector2Array()
				for i: int in 9:
					var t: float = PI * i / 8.0
					cup.append(o + (Vector2(12, 8.2) + Vector2(cos(t) * 4.0, sin(t) * 4.3)) * k)
				cup.append(o + Vector2(8, 4) * k)
				cup.append(o + Vector2(16, 4) * k)
				draw_colored_polygon(cup, Color(color, 0.9))
				draw_polyline(PackedVector2Array([o + Vector2(8, 5.4) * k, o + Vector2(5.6, 5.4) * k, o + Vector2(6.4, 8.6) * k, o + Vector2(8.2, 9.7) * k]), color, 1.5 * k, true)
				draw_polyline(PackedVector2Array([o + Vector2(16, 5.4) * k, o + Vector2(18.4, 5.4) * k, o + Vector2(17.6, 8.6) * k, o + Vector2(15.8, 9.7) * k]), color, 1.5 * k, true)
				draw_line(o + Vector2(12, 12.5) * k, o + Vector2(12, 15.7) * k, color, 1.5 * k, true)
				draw_colored_polygon(PackedVector2Array([o + Vector2(10, 15.7) * k, o + Vector2(14, 15.7) * k, o + Vector2(14.7, 19) * k, o + Vector2(9.3, 19) * k]), Color(color, 0.9))


## A gradient laid over art (the web's linear-gradient washes): stops of
## [color, at] along a CSS angle. Ignores the mouse.
static func wash(parent: Node, stops: Array, angle: float = 180.0) -> Pane:
	var p: Pane = Pane.new({ "radius": 0, "fill": stops, "angle": angle, "pad": 0, "keep": true })
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if parent != null:
		parent.add_child(p)
	return p


## The progress bar, drawn: a rounded track and a fill brightening along it.
class Bar:
	extends Control
	var color: Color = TEAL
	var frac: float = 0.0

	func set_value(f: float, animate: bool = true) -> void:
		var goal: float = clampf(f, 0.0, 1.0)
		if not animate or not is_inside_tree():
			frac = goal
			queue_redraw()
			return
		create_tween().tween_method(func(v: float) -> void:
			frac = v
			queue_redraw(), frac, goal, 0.7).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)

	func _draw() -> void:
		var r: float = size.y / 2.0
		var track: Color = Color(PAPER_INK, 0.12) if Kit.on_paper(self) else Color(1, 1, 1, 0.07)
		_pill(Rect2(Vector2.ZERO, size), track, track)
		if frac > 0.0:
			_pill(Rect2(Vector2.ZERO, Vector2(maxf(size.y, size.x * frac), size.y)), Color(color, 0.53), color)
		if size.y >= 6.0 and frac > 0.0:
			draw_rect(Rect2(Vector2(r, 1), Vector2(maxf(0.0, size.x * frac - r * 2.0), 1)), Color(1, 1, 1, 0.18))

	func _pill(rect: Rect2, from: Color, to: Color) -> void:
		var r: float = rect.size.y / 2.0
		var pts: PackedVector2Array = PackedVector2Array()
		var cols: PackedColorArray = PackedColorArray()
		for i: int in 9:
			var t: float = PI / 2.0 + PI * i / 8.0
			pts.append(rect.position + Vector2(r, r) + Vector2(cos(t), -sin(t)) * r)
			cols.append(from)
		for i: int in 9:
			var t: float = -PI / 2.0 + PI * i / 8.0
			pts.append(rect.position + Vector2(rect.size.x - r, r) + Vector2(cos(t), -sin(t)) * r)
			cols.append(to)
		draw_polygon(pts, cols)
