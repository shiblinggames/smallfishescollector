class_name BattleLook
extends RefCounted
## THE FIGHT'S LOOK (Kong, 2026-10-03: the fight's UI and the plates over the
## ships "still look a bit elementary ... can we do a visual overhaul", then
## "I still want the style to be in the similar style as what our overall
## theme is"): THE NIGHT PAPER, DRESSED IN BRASS. Warm dark-paper browns with a
## brass inlay rim (the deck sits on the night paper itself), cannonballs drawn
## as round shot, health bars with a gloss and a pale trail that drains after a
## hit, every captain's own avatar (CharacterAvatar, as the web's leaderboards
## show them) in a brass medallion, and vector icons for every order (no emoji). Everything here draws onto a
## CanvasItem, so the plates on the water, the deck and the turn track all
## share one hand.

const LACQUER: Color = Color("#2a1f17")
const LACQUER_HI: Color = Color("#3a2b20")
const LACQUER_LO: Color = Color("#19120d")
const BRASS: Color = Color("#d8b26b")
const BRASS_HI: Color = Color("#f7e1a6")
const BRASS_LO: Color = Color("#7a5a2c")
const CREAM: Color = Color("#f4ead6")
const MUTED: Color = Color("#c4ae8c")
const ALLY: Color = Color("#6ad893")
const ALLY_LO: Color = Color("#23824f")
const FOE: Color = Color("#ff735c")
const FOE_LO: Color = Color("#a3291f")
const SHIELD: Color = Color("#8ccfff")
const GOLD: Color = Color("#ffd36b")

static var _boxes: Dictionary = {}


## A rounded box (cached): fill, rim, rim width, corner radius, and a shadow
## (or a glow, in the shadow's colour).
static func box(bg: Color, rim: Color, rim_w: int, r: float, shadow: float = 0.0, shadow_col: Color = Color(0, 0, 0, 0.5)) -> StyleBoxFlat:
	var key: String = "%s|%s|%d|%d|%d|%s" % [bg.to_html(), rim.to_html(), rim_w, int(r), int(shadow), shadow_col.to_html()]
	if _boxes.has(key):
		return _boxes[key]
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = rim
	s.set_border_width_all(rim_w)
	s.set_corner_radius_all(int(r))
	s.corner_detail = 12
	s.anti_aliasing = true
	if shadow > 0.0:
		s.shadow_color = shadow_col
		s.shadow_size = int(shadow)
		s.shadow_offset = Vector2(0, shadow * 0.3)
	_boxes[key] = s
	return s


static func draw_box(ci: CanvasItem, r: Rect2, s: StyleBoxFlat) -> void:
	s.draw(ci.get_canvas_item(), r)


## A lacquer panel with a brass inlay: a dark outer line, the lacquer, a thin
## brass ring just inside, and a pale catch of light along the top.
static func panel(ci: CanvasItem, r: Rect2, radius: float = 12.0, alpha: float = 1.0, glow: float = 0.0, glow_col: Color = BRASS_HI) -> void:
	if glow > 0.0:
		draw_box(ci, r, box(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, radius, 16.0, Color(glow_col, 0.55 * glow)))
	draw_box(ci, r, box(Color(LACQUER, 0.94 * alpha), Color(BRASS_LO, alpha), 2, radius, 10.0, Color(0, 0, 0, 0.45 * alpha)))
	draw_box(ci, r.grow(-3.0), box(Color(0, 0, 0, 0), Color(BRASS, 0.42 * alpha), 1, maxf(2.0, radius - 3.0)))
	ci.draw_line(r.position + Vector2(radius, 4.5), Vector2(r.end.x - radius, r.position.y + 4.5), Color(1, 1, 1, 0.07 * alpha), 1.5, true)


## A health bar: the trough, a pale trail where hull was just lost (it drains
## after the hit), the fill with its gloss, quarter ticks, and a shield lying
## along the top as a bright bead.
static func bar(ci: CanvasItem, r: Rect2, frac: float, trail: float, shield: float, hi: Color, lo: Color, alpha: float = 1.0) -> void:
	var rad: float = r.size.y / 2.0
	draw_box(ci, r.grow(1.5), box(Color(0, 0, 0, 0.6 * alpha), Color(BRASS_LO, 0.7 * alpha), 1, rad + 1.5))
	frac = clampf(frac, 0.0, 1.0)
	trail = clampf(trail, 0.0, 1.0)
	if trail > frac + 0.002:
		draw_box(ci, Rect2(r.position, Vector2(maxf(r.size.y, r.size.x * trail), r.size.y)), box(Color(1.0, 0.93, 0.75, 0.85 * alpha), Color(0, 0, 0, 0), 0, rad))
	if frac > 0.0:
		var fr: Rect2 = Rect2(r.position, Vector2(maxf(r.size.y, r.size.x * frac), r.size.y))
		draw_box(ci, fr, box(Color(lo, alpha), Color(0, 0, 0, 0), 0, rad))
		draw_box(ci, Rect2(fr.position, Vector2(fr.size.x, fr.size.y * 0.58)), box(Color(hi, alpha), Color(0, 0, 0, 0), 0, rad))
		if fr.size.x > rad * 2.0 + 2.0:
			ci.draw_line(fr.position + Vector2(rad, 2.2), Vector2(fr.end.x - rad, fr.position.y + 2.2), Color(1, 1, 1, 0.4 * alpha), 1.4, true)
	for k: int in range(1, 4):
		var x: float = r.position.x + r.size.x * k / 4.0
		ci.draw_line(Vector2(x, r.position.y + 2), Vector2(x, r.end.y - 2), Color(0, 0, 0, 0.28 * alpha), 1.0)
	if shield > 0.0:
		var sr: Rect2 = Rect2(r.position + Vector2(0, -4.5), Vector2(maxf(6.0, r.size.x * clampf(shield, 0.0, 1.0)), 5.0))
		draw_box(ci, sr.grow(2.0), box(Color(SHIELD, 0.22 * alpha), Color(0, 0, 0, 0), 0, 4.5))
		draw_box(ci, sr, box(Color(SHIELD, alpha), Color(1, 1, 1, 0.6 * alpha), 1, 2.5))


## A round shot: lit from the top left, a cold glint, a rim of brass light.
## Empty: the socket it sits in.
static func ball(ci: CanvasItem, c: Vector2, rad: float, full: bool, alpha: float = 1.0) -> void:
	if not full:
		ci.draw_circle(c, rad, Color(0, 0, 0, 0.4 * alpha))
		ci.draw_arc(c, rad, 0.0, TAU, 24, Color(BRASS, 0.32 * alpha), 1.2, true)
		return
	ci.draw_circle(c + Vector2(0, rad * 0.3), rad * 1.02, Color(0, 0, 0, 0.35 * alpha))
	ci.draw_circle(c, rad, Color(0.10, 0.11, 0.13, alpha))
	ci.draw_circle(c - Vector2(rad, rad) * 0.18, rad * 0.7, Color(0.19, 0.21, 0.24, alpha))
	ci.draw_circle(c - Vector2(rad, rad) * 0.3, rad * 0.38, Color(0.29, 0.31, 0.35, alpha))
	ci.draw_circle(c - Vector2(rad, rad) * 0.42, rad * 0.16, Color(1, 1, 1, 0.75 * alpha))
	ci.draw_arc(c, rad - 0.5, PI * 0.1, PI * 0.9, 16, Color(BRASS, 0.55 * alpha), 1.2, true)


static func _head(ci: CanvasItem, tip: Vector2, dir: Vector2, s: float, col: Color) -> void:
	var d: Vector2 = dir.normalized()
	var n: Vector2 = Vector2(-d.y, d.x)
	ci.draw_colored_polygon(PackedVector2Array([tip, tip - d * s + n * s * 0.6, tip - d * s - n * s * 0.6]), col)


## An order's icon, drawn: s is its half size.
static func icon(ci: CanvasItem, kind: String, c: Vector2, s: float, col: Color) -> void:
	match kind:
		"fire":
			for k: int in 3:
				var y: float = c.y - s * 0.3 + k * s * 0.3
				ci.draw_line(Vector2(c.x - s, y), Vector2(c.x - s * 0.15, y), Color(col, 0.35 + 0.2 * k), 2.0, true)
			ball(ci, c + Vector2(s * 0.35, 0), s * 0.55, true)
			ci.draw_arc(c + Vector2(s * 0.35, 0), s * 0.55, 0.0, TAU, 20, col, 1.4, true)
		"volley":
			for p: Vector2 in [Vector2(-0.45, 0.32), Vector2(0.45, 0.32), Vector2(0.0, -0.4)]:
				ball(ci, c + p * s, s * 0.38, true)
				ci.draw_arc(c + p * s, s * 0.38, 0.0, TAU, 16, col, 1.2, true)
		"mega":
			var pts: PackedVector2Array = PackedVector2Array()
			for k: int in 16:
				var a: float = TAU * k / 16.0 - PI / 2.0
				pts.append(c + Vector2(cos(a), sin(a)) * s * (1.0 if k % 2 == 0 else 0.45))
			ci.draw_colored_polygon(pts, Color(col, 0.9))
			ci.draw_circle(c, s * 0.3, Color(1, 1, 1, 0.85))
		"reload":
			ci.draw_arc(c, s * 0.72, -PI * 0.85, PI * 0.55, 24, col, 2.4, true)
			var tip: Vector2 = c + Vector2(cos(PI * 0.55), sin(PI * 0.55)) * s * 0.72
			_head(ci, tip + Vector2(-s * 0.1, 0), Vector2(-1, -0.15), s * 0.45, col)
			ball(ci, c, s * 0.28, true)
		"dodge":
			var pl: PackedVector2Array = PackedVector2Array()
			for k: int in 13:
				var u: float = k / 12.0
				pl.append(c + Vector2(-s + 1.7 * s * u, sin(u * TAU * 0.9) * s * 0.45))
			ci.draw_polyline(pl, col, 2.4, true)
			_head(ci, pl[pl.size() - 1] + Vector2(s * 0.3, 0), pl[pl.size() - 1] - pl[pl.size() - 3], s * 0.42, col)
		"flee":
			for k: int in 2:
				var x: float = c.x + s * 0.35 - k * s * 0.6
				ci.draw_polyline(PackedVector2Array([Vector2(x, c.y - s * 0.6), Vector2(x - s * 0.5, c.y), Vector2(x, c.y + s * 0.6)]), Color(col, 1.0 - 0.35 * k), 2.4, true)
		"drum":
			ci.draw_rect(Rect2(c.x - s * 0.7, c.y - s * 0.35, s * 1.4, s * 0.8), Color(col, 0.25))
			ci.draw_line(Vector2(c.x - s * 0.7, c.y - s * 0.35), Vector2(c.x - s * 0.7, c.y + s * 0.45), col, 1.6)
			ci.draw_line(Vector2(c.x + s * 0.7, c.y - s * 0.35), Vector2(c.x + s * 0.7, c.y + s * 0.45), col, 1.6)
			_ellipse(ci, c + Vector2(0, -s * 0.35), Vector2(s * 0.7, s * 0.22), col)
			_ellipse(ci, c + Vector2(0, s * 0.45), Vector2(s * 0.7, s * 0.22), Color(col, 0.6))
			ci.draw_line(c + Vector2(-s * 0.2, -s * 0.5), c + Vector2(s * 0.5, -s), col, 1.6, true)
		_:
			ci.draw_circle(c, s * 0.4, col)


static func _ellipse(ci: CanvasItem, c: Vector2, r: Vector2, col: Color) -> void:
	var pts: PackedVector2Array = PackedVector2Array()
	for k: int in 25:
		var a: float = TAU * k / 24.0
		pts.append(c + Vector2(cos(a) * r.x, sin(a) * r.y))
	ci.draw_polyline(pts, col, 1.6, true)


## A brass medallion: a portrait cropped round (its face: uv_c, uv_r across),
## or the first letter of a name on its colour.
static func medallion(ci: CanvasItem, c: Vector2, rad: float, tex: Texture2D, col: Color, letter: String, alpha: float = 1.0, uv_c: Vector2 = Vector2(0.5, 0.34), uv_r: float = 0.3) -> void:
	ci.draw_circle(c + Vector2(0, 2), rad + 4.0, Color(0, 0, 0, 0.45 * alpha))
	ci.draw_circle(c, rad + 3.5, Color(BRASS_LO, alpha))
	ci.draw_circle(c, rad + 2.0, Color(BRASS, alpha))
	ci.draw_circle(c, rad, Color(col.darkened(0.55), alpha))
	if tex != null:
		var asp: float = float(tex.get_width()) / maxf(1.0, float(tex.get_height()))
		var pts: PackedVector2Array = PackedVector2Array()
		var uvs: PackedVector2Array = PackedVector2Array()
		for k: int in 40:
			var a: float = TAU * k / 40.0
			var d: Vector2 = Vector2(cos(a), sin(a))
			pts.append(c + d * rad)
			uvs.append(uv_c + Vector2(d.x * uv_r, d.y * uv_r * asp))
		ci.draw_colored_polygon(pts, Color(1, 1, 1, alpha), uvs, tex)
	else:
		ci.draw_circle(c - Vector2(0, rad * 0.25), rad * 0.75, Color(col.darkened(0.3), 0.6 * alpha))
		var f: Font = Kit.font("cinzel", 900)
		var fs: int = int(rad * 1.05)
		var w: float = f.get_string_size(letter, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		ci.draw_string(f, Vector2(c.x - w / 2.0, c.y + fs * 0.36), letter, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(CREAM, alpha))
	ci.draw_arc(c, rad, 0.0, TAU, 48, Color(0, 0, 0, 0.55 * alpha), 1.5, true)
	ci.draw_arc(c, rad + 2.0, PI * 1.1, PI * 1.6, 12, Color(BRASS_HI, 0.8 * alpha), 1.2, true)


## Words drawn centred on x, sitting on the baseline y.
static func say(ci: CanvasItem, f: Font, x: float, y: float, s: String, fs: int, col: Color, outline: int = 0) -> float:
	var w: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	if outline > 0:
		ci.draw_string_outline(f, Vector2(x - w / 2.0, y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, outline, Color(0, 0, 0, 0.7 * col.a))
	ci.draw_string(f, Vector2(x - w / 2.0, y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
	return w


## A small pill of words (a tag, a status).
static func pill(ci: CanvasItem, left: Vector2, s: String, tone: Color, alpha: float = 1.0) -> float:
	var f: Font = Kit.font("karla", 800)
	var w: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x + 12.0
	var r: Rect2 = Rect2(left, Vector2(w, 15))
	draw_box(ci, r, box(Color(tone, 0.18 * alpha), Color(tone, 0.75 * alpha), 1, 7.5))
	ci.draw_string(f, left + Vector2(6, 11), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(tone.lightened(0.35), alpha))
	return w


## A diamond knot (the fight track).
static func knot(ci: CanvasItem, c: Vector2, s: float, fill: Color, rim: Color) -> void:
	var pts: PackedVector2Array = PackedVector2Array([c + Vector2(0, -s), c + Vector2(s, 0), c + Vector2(0, s), c + Vector2(-s, 0)])
	ci.draw_colored_polygon(pts, fill)
	pts.append(pts[0])
	ci.draw_polyline(pts, rim, 1.3, true)


# ── The deck's keys ────────────────────────────────────────────────────────────

## An order's key on the deck: a lacquer plaque that lifts and brightens under
## the pointer, its icon, its name, what it costs, and its key in a brass cap.
class ActionKey:
	extends Button
	var kind: String = ""
	var label: String = ""
	var sub: String = ""
	var key_hint: String = ""
	var primary: bool = false
	var chosen: bool = false
	var accent: Color = BattleLook.BRASS
	var _hover: float = 0.0

	func _init() -> void:
		flat = true
		focus_mode = Control.FOCUS_NONE
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

	func _process(delta: float) -> void:
		var want: float = 1.0 if is_hovered() and not disabled else 0.0
		if _hover != want:
			_hover = move_toward(_hover, want, delta * 8.0)
			queue_redraw()

	func _draw() -> void:
		var a: float = 0.36 if disabled else 1.0
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		r.position.y += 1.0 if is_pressed() else -2.0 * _hover
		var lit: float = 1.0 if chosen else _hover
		if primary and not disabled:
			BattleLook.draw_box(self, r, BattleLook.box(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, 10, 12.0, Color(accent, 0.35 + 0.25 * lit)))
		var bg: Color = BattleLook.LACQUER_HI.lerp(Color("#5a4029"), lit * 0.8)
		if primary and not disabled:
			bg = bg.lerp(Color(accent.darkened(0.55), 1.0), 0.35)
		BattleLook.draw_box(self, r, BattleLook.box(Color(bg, 0.96 * a), Color(BattleLook.BRASS_LO, a), 2, 10, 6.0, Color(0, 0, 0, 0.4 * a)))
		BattleLook.draw_box(self, r.grow(-3.0), BattleLook.box(Color(0, 0, 0, 0), Color(accent, (0.35 + 0.55 * lit) * a), 1, 7))
		draw_line(r.position + Vector2(10, 5), Vector2(r.end.x - 10, r.position.y + 5), Color(1, 1, 1, 0.08 * a), 1.2, true)
		var tx: float = r.position.x + 14.0
		if kind != "":
			BattleLook.icon(self, kind, Vector2(r.position.x + 27, r.get_center().y), 12.0, Color(BattleLook.BRASS_HI, a))
			tx = r.position.x + 48.0
		var f: Font = Kit.font("cinzel", 800)
		var fs: int = 15
		var avail: float = r.end.x - tx - (28.0 if key_hint != "" else 8.0)
		while fs > 11 and f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > avail:
			fs -= 1
		var cy: float = r.get_center().y
		draw_string(f, Vector2(tx, cy + (0.0 if sub != "" else 5.0)), label, HORIZONTAL_ALIGNMENT_LEFT, avail, fs, Color(BattleLook.CREAM, a))
		if sub != "":
			draw_string(Kit.font("karla", 700), Vector2(tx, cy + 15.0), sub, HORIZONTAL_ALIGNMENT_LEFT, avail + 22.0, 11, Color(BattleLook.MUTED, a))
		if key_hint != "":
			var kr: Rect2 = Rect2(Vector2(r.end.x - 24, r.position.y + 7), Vector2(17, 17))
			BattleLook.draw_box(self, kr, BattleLook.box(Color(0, 0, 0, 0.35 * a), Color(BattleLook.BRASS, 0.7 * a), 1, 4))
			BattleLook.say(self, Kit.font("karla", 800), kr.get_center().x, kr.end.y - 4.5, key_hint, 11, Color(BattleLook.BRASS_HI, a))


## A crew hand's order on the deck: their portrait in a ring of their class's
## colour, their name, and the order's state; lit in that colour when ordered.
class OrderCard:
	extends Button
	var tex: Texture2D
	var hand: String = ""
	var state: String = ""
	var col: Color = Color.WHITE
	var chosen: bool = false
	var _hover: float = 0.0

	func _init() -> void:
		flat = true
		focus_mode = Control.FOCUS_NONE
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

	func _process(delta: float) -> void:
		var want: float = 1.0 if is_hovered() and not disabled else 0.0
		if _hover != want:
			_hover = move_toward(_hover, want, delta * 8.0)
			queue_redraw()

	func _draw() -> void:
		var a: float = 0.42 if disabled else 1.0
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		r.position.y -= 2.0 * _hover
		if chosen:
			BattleLook.draw_box(self, r, BattleLook.box(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, 10, 14.0, Color(col, 0.55)))
		var bg: Color = BattleLook.LACQUER_HI.lerp(Color(col.darkened(0.6), 1.0), 0.55 if chosen else 0.15 * _hover)
		BattleLook.draw_box(self, r, BattleLook.box(Color(bg, 0.96 * a), Color(BattleLook.BRASS_LO, a), 2, 10, 6.0, Color(0, 0, 0, 0.4 * a)))
		BattleLook.draw_box(self, r.grow(-3.0), BattleLook.box(Color(0, 0, 0, 0), Color(col, (0.95 if chosen else 0.3 + 0.4 * _hover) * a), 1, 7))
		var mr: float = r.size.y * 0.5 - 8.0
		BattleLook.medallion(self, Vector2(r.position.x + mr + 9, r.get_center().y), mr, tex, col, hand.substr(0, 1), a, Vector2(0.5, 0.36), 0.36)
		var tx: float = r.position.x + mr * 2.0 + 20.0
		var avail: float = r.end.x - tx - 6.0
		draw_string(Kit.font("karla", 800), Vector2(tx, r.get_center().y - 2), hand, HORIZONTAL_ALIGNMENT_LEFT, avail, 13, Color(BattleLook.CREAM, a))
		draw_string(Kit.font("karla", 800), Vector2(tx, r.get_center().y + 13), state, HORIZONTAL_ALIGNMENT_LEFT, avail, 10, Color(col.lightened(0.3) if not disabled else BattleLook.MUTED, a))


## The deck's lacquer and a tab at its top edge with its title.
class DeckPanel:
	extends Control
	var title: String = "YOUR ORDERS"
	## The panel's own lacquer (off: it sits on the night paper and draws only
	## a brass rim and its tab).
	var body: bool = true

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		if body:
			BattleLook.panel(self, r, 16.0)
		else:
			BattleLook.draw_box(self, r.grow(-6.0), BattleLook.box(Color(0, 0, 0, 0), Color(BattleLook.BRASS, 0.35), 1, 10))
		if title == "":
			return
		var f: Font = Kit.font("karla", 800)
		var tw: float = f.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + 34.0
		var tab: Rect2 = Rect2(Vector2(r.get_center().x - tw / 2.0, -11), Vector2(tw, 22))
		BattleLook.draw_box(self, tab, BattleLook.box(BattleLook.LACQUER_LO, BattleLook.BRASS, 1, 11, 4.0))
		BattleLook.knot(self, Vector2(tab.position.x + 9, tab.get_center().y), 3.0, BattleLook.BRASS, BattleLook.BRASS_HI)
		BattleLook.knot(self, Vector2(tab.end.x - 9, tab.get_center().y), 3.0, BattleLook.BRASS, BattleLook.BRASS_HI)
		BattleLook.say(self, f, tab.get_center().x, tab.get_center().y + 3.5, title, 10, BattleLook.BRASS_HI)
