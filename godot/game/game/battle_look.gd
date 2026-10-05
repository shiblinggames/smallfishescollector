class_name BattleLook
extends RefCounted
## THE FIGHT'S LOOK (Kong, 2026-10-03). The plates and the deck "look a bit
## elementary"; then, of a brass-trim pass: "I don't like the brass trim
## aesthetic. I like the flat, clean aesthetic look that we have still in the
## game." So: FLAT AND CLEAN, in the expedition side's night-paper browns.
## Solid fills, one faint hairline, rounded corners, a soft shadow at most; no
## rims, gloss, sheen or flourishes. Colour carries meaning only (green your
## line, red the enemy, gold a critical or what is chosen). Every captain wears
## their own avatar (CharacterAvatar, as the web's leaderboards show it);
## the orders carry drawn icons (no emoji). Everything draws onto a CanvasItem
## so the plates on the water, the deck and the turn track share one hand.

const LACQUER: Color = Color(0.135, 0.11, 0.095)
const LACQUER_HI: Color = Color(0.2, 0.165, 0.14)
const LACQUER_LO: Color = Color(0.09, 0.075, 0.065)
const HAIR: Color = Color(1, 1, 1, 0.09)
## The accent words (labels, a chosen thing).
const BRASS: Color = Color("#c4a96a")
const BRASS_HI: Color = Color("#f5cf6a")
const BRASS_LO: Color = Color(1, 1, 1, 0.09)
const CREAM: Color = Color(0.94, 0.88, 0.77)
const MUTED: Color = Color(0.72, 0.66, 0.57)
const ALLY: Color = Color("#6fd394")
const ALLY_LO: Color = Color("#2f8a58")
const FOE: Color = Color("#f2705c")
const FOE_LO: Color = Color("#a3291f")
const SHIELD: Color = Color("#8ccfff")
const GOLD: Color = Color("#f0c040")

static var _boxes: Dictionary = {}


## A rounded box (cached): fill, hairline, its width, corner radius, and a soft
## shadow (or a glow, in the shadow's colour).
static func box(bg: Color, rim: Color, rim_w: int, r: float, shadow: float = 0.0, shadow_col: Color = Color(0, 0, 0, 0.45)) -> StyleBoxFlat:
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


## A flat panel: one fill, one hairline, a soft shadow. Lit (the one acting),
## its hairline turns gold.
static func panel(ci: CanvasItem, r: Rect2, radius: float = 12.0, alpha: float = 1.0, glow: float = 0.0, glow_col: Color = GOLD) -> void:
	var rim: Color = Color(glow_col, 0.55 + 0.4 * glow) if glow > 0.0 else Color(HAIR, HAIR.a * alpha)
	draw_box(ci, r, box(Color(LACQUER, 0.93 * alpha), rim, 2 if glow > 0.0 else 1, radius, 10.0, Color(0, 0, 0, 0.35 * alpha)))


## A health bar: a flat trough, the pale trail where hull was just lost (it
## drains after the hit), the fill, and a shield as a thin bar along the top.
static func bar(ci: CanvasItem, r: Rect2, frac: float, trail: float, shield: float, hi: Color, _lo: Color, alpha: float = 1.0) -> void:
	var rad: float = r.size.y / 2.0
	draw_box(ci, r, box(Color(0, 0, 0, 0.45 * alpha), Color(0, 0, 0, 0), 0, rad))
	frac = clampf(frac, 0.0, 1.0)
	trail = clampf(trail, 0.0, 1.0)
	if trail > frac + 0.002:
		draw_box(ci, Rect2(r.position, Vector2(maxf(r.size.y, r.size.x * trail), r.size.y)), box(Color(CREAM, 0.6 * alpha), Color(0, 0, 0, 0), 0, rad))
	if frac > 0.0:
		draw_box(ci, Rect2(r.position, Vector2(maxf(r.size.y, r.size.x * frac), r.size.y)), box(Color(hi, alpha), Color(0, 0, 0, 0), 0, rad))
	if shield > 0.0:
		draw_box(ci, Rect2(r.position + Vector2(0, -5), Vector2(maxf(6.0, r.size.x * clampf(shield, 0.0, 1.0)), 3.0)), box(Color(SHIELD, alpha), Color(0, 0, 0, 0), 0, 1.5))


## A cannonball: a flat dark disc with a faint ring; empty, the ring alone.
static func ball(ci: CanvasItem, c: Vector2, rad: float, full: bool, alpha: float = 1.0) -> void:
	if full:
		ci.draw_circle(c, rad, Color(0.07, 0.07, 0.08, alpha))
		ci.draw_arc(c, rad, 0.0, TAU, 24, Color(1, 1, 1, 0.28 * alpha), 1.0, true)
	else:
		ci.draw_arc(c, rad - 0.5, 0.0, TAU, 24, Color(1, 1, 1, 0.16 * alpha), 1.0, true)


static func _head(ci: CanvasItem, tip: Vector2, dir: Vector2, s: float, col: Color) -> void:
	var d: Vector2 = dir.normalized()
	var n: Vector2 = Vector2(-d.y, d.x)
	ci.draw_colored_polygon(PackedVector2Array([tip, tip - d * s + n * s * 0.6, tip - d * s - n * s * 0.6]), col)


## An order's icon, flat strokes and discs: s is its half size.
static func icon(ci: CanvasItem, kind: String, c: Vector2, s: float, col: Color) -> void:
	match kind:
		"fire":
			for k: int in 3:
				var y: float = c.y - s * 0.3 + k * s * 0.3
				ci.draw_line(Vector2(c.x - s, y), Vector2(c.x - s * 0.2, y), Color(col, 0.35 + 0.2 * k), 1.8, true)
			ci.draw_circle(c + Vector2(s * 0.35, 0), s * 0.5, col)
		"volley":
			for p: Vector2 in [Vector2(-0.45, 0.32), Vector2(0.45, 0.32), Vector2(0.0, -0.4)]:
				ci.draw_circle(c + p * s, s * 0.34, col)
		"mega":
			var pts: PackedVector2Array = PackedVector2Array()
			for k: int in 16:
				var a: float = TAU * k / 16.0 - PI / 2.0
				pts.append(c + Vector2(cos(a), sin(a)) * s * (1.0 if k % 2 == 0 else 0.45))
			ci.draw_colored_polygon(pts, col)
		"reload":
			ci.draw_arc(c, s * 0.72, -PI * 0.85, PI * 0.55, 24, col, 2.2, true)
			var tip: Vector2 = c + Vector2(cos(PI * 0.55), sin(PI * 0.55)) * s * 0.72
			_head(ci, tip + Vector2(-s * 0.1, 0), Vector2(-1, -0.15), s * 0.45, col)
		"dodge":
			var pl: PackedVector2Array = PackedVector2Array()
			for k: int in 13:
				var u: float = k / 12.0
				pl.append(c + Vector2(-s + 1.7 * s * u, sin(u * TAU * 0.9) * s * 0.45))
			ci.draw_polyline(pl, col, 2.2, true)
			_head(ci, pl[pl.size() - 1] + Vector2(s * 0.3, 0), pl[pl.size() - 1] - pl[pl.size() - 3], s * 0.42, col)
		"flee":
			for k: int in 2:
				var x: float = c.x + s * 0.35 - k * s * 0.6
				ci.draw_polyline(PackedVector2Array([Vector2(x, c.y - s * 0.6), Vector2(x - s * 0.5, c.y), Vector2(x, c.y + s * 0.6)]), Color(col, 1.0 - 0.35 * k), 2.2, true)
		"special":
			# The kit: a chest with a cross on it.
			ci.draw_rect(Rect2(c.x - s * 0.75, c.y - s * 0.5, s * 1.5, s * 1.05), Color(col, 0.3))
			ci.draw_rect(Rect2(c.x - s * 0.75, c.y - s * 0.5, s * 1.5, s * 1.05), col, false, 1.8)
			ci.draw_line(c + Vector2(0, -s * 0.28), c + Vector2(0, s * 0.36), col, 2.4, true)
			ci.draw_line(c + Vector2(-s * 0.32, s * 0.04), c + Vector2(s * 0.32, s * 0.04), col, 2.4, true)
		"back":
			ci.draw_polyline(PackedVector2Array([c + Vector2(s * 0.3, -s * 0.55), c + Vector2(-s * 0.3, 0), c + Vector2(s * 0.3, s * 0.55)]), col, 2.2, true)
		"drum":
			ci.draw_rect(Rect2(c.x - s * 0.7, c.y - s * 0.35, s * 1.4, s * 0.8), Color(col, 0.3))
			_ellipse(ci, c + Vector2(0, -s * 0.35), Vector2(s * 0.7, s * 0.22), col)
			ci.draw_line(c + Vector2(-s * 0.2, -s * 0.5), c + Vector2(s * 0.5, -s), col, 1.6, true)
		_:
			ci.draw_circle(c, s * 0.4, col)


static func _ellipse(ci: CanvasItem, c: Vector2, r: Vector2, col: Color) -> void:
	var pts: PackedVector2Array = PackedVector2Array()
	for k: int in 25:
		var a: float = TAU * k / 24.0
		pts.append(c + Vector2(cos(a) * r.x, sin(a) * r.y))
	ci.draw_polyline(pts, col, 1.6, true)


## A round portrait: a captain's avatar or an enemy's face cropped round
## (uv_c, uv_r across), on a disc of its colour, with a thin ring of it. No
## texture: the first letter of the name.
static func medallion(ci: CanvasItem, c: Vector2, rad: float, tex: Texture2D, col: Color, letter: String, alpha: float = 1.0, uv_c: Vector2 = Vector2(0.5, 0.34), uv_r: float = 0.3) -> void:
	ci.draw_circle(c, rad, Color(LACQUER_LO, alpha))
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
		ci.draw_circle(c, rad, Color(col.darkened(0.6), alpha))
		var f: Font = Kit.font("cinzel", 800)
		var fs: int = int(rad * 1.0)
		var w: float = f.get_string_size(letter, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		ci.draw_string(f, Vector2(c.x - w / 2.0, c.y + fs * 0.36), letter, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(CREAM, alpha))
	ci.draw_arc(c, rad, 0.0, TAU, 48, Color(col, 0.9 * alpha), 2.0, true)


## Words drawn centred on x, sitting on the baseline y.
static func say(ci: CanvasItem, f: Font, x: float, y: float, s: String, fs: int, col: Color, outline: int = 0) -> float:
	var w: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	if outline > 0:
		ci.draw_string_outline(f, Vector2(x - w / 2.0, y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, outline, Color(0, 0, 0, 0.7 * col.a))
	ci.draw_string(f, Vector2(x - w / 2.0, y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
	return w


## A small flat pill of words (a tag, a status).
static func pill(ci: CanvasItem, left: Vector2, s: String, tone: Color, alpha: float = 1.0) -> float:
	var f: Font = Kit.font("karla", 800)
	var w: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x + 12.0
	draw_box(ci, Rect2(left, Vector2(w, 15)), box(Color(tone, 0.2 * alpha), Color(0, 0, 0, 0), 0, 7.5))
	ci.draw_string(f, left + Vector2(6, 11), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(tone.lightened(0.3), alpha))
	return w


## A dot on the fight track.
static func knot(ci: CanvasItem, c: Vector2, s: float, fill: Color, rim: Color) -> void:
	ci.draw_circle(c, s * 0.8, fill)
	if rim.a > 0.0 and fill.a < 0.6:
		ci.draw_arc(c, s * 0.8, 0.0, TAU, 20, rim, 1.2, true)


# ── The deck's keys ────────────────────────────────────────────────────────────

## An order's key on the deck: a flat rounded tile that lightens under the
## pointer, its icon, its name, what it costs, and its key in a small cap.
## The lead order is tinted gold; a chosen one wears a gold hairline.
class ActionKey:
	extends Button
	var kind: String = ""
	var label: String = ""
	var sub: String = ""
	var key_hint: String = ""
	var primary: bool = false
	var chosen: bool = false
	var accent: Color = BattleLook.GOLD
	var _hover: float = 0.0
	## The deck's look (Kong, 2026-10-05: no paper strip, no pill buttons): a
	## round dark disc on the water, its icon in it, its word and key under.
	var disc: bool = false
	## The main action's disc: larger, whether or not it can be pressed now.
	var big: bool = false
	## Fire carries the shot in the rack under its word: full of this many.
	var pips: int = -1
	var pips_full: int = 0

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
		if disc:
			_draw_disc()
			return
		var a: float = 0.38 if disabled else 1.0
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var bg: Color = BattleLook.LACQUER_HI.lerp(BattleLook.LACQUER_HI.lightened(0.12), _hover)
		var rim: Color = Color(1, 1, 1, 0.08 + 0.1 * _hover)
		if primary and not disabled:
			bg = bg.lerp(accent.darkened(0.45), 0.4)
			rim = Color(accent, 0.45 + 0.3 * _hover)
		if chosen:
			rim = Color(BattleLook.GOLD, 0.95)
		if primary and not disabled:
			# The main action carries a little light of its own.
			draw_texture_rect(FxSheet.glow(), r.grow(14.0), false, Color(accent, 0.12 + 0.1 * _hover))
		BattleLook.draw_box(self, r, BattleLook.box(Color(bg, a), Color(rim, rim.a * a), 2 if chosen or (primary and not disabled) else 1, 10))
		var tx: float = r.position.x + 14.0
		var ink: Color = Color(BattleLook.CREAM, a)
		if kind != "":
			var ic: float = 13.0 if size.y >= 50.0 else 11.0
			BattleLook.icon(self, kind, Vector2(r.position.x + 14.0 + ic, r.get_center().y), ic, Color(accent if not disabled else BattleLook.CREAM, a))
			tx = r.position.x + 22.0 + ic * 2.0
		var f: Font = Kit.font("karla", 800)
		var fs: int = 17 if size.y >= 50.0 else 15
		var avail: float = r.end.x - tx - (26.0 if key_hint != "" else 8.0)
		while fs > 11 and f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > avail:
			fs -= 1
		var cy: float = r.get_center().y
		draw_string(f, Vector2(tx, cy + (0.0 if sub != "" else 5.0)), label, HORIZONTAL_ALIGNMENT_LEFT, avail, fs, ink)
		if sub != "":
			draw_string(Kit.font("karla", 600), Vector2(tx, cy + 15.0), sub, HORIZONTAL_ALIGNMENT_LEFT, avail + 20.0, 11, Color(BattleLook.MUTED, a))
		if key_hint != "":
			var kw: float = maxf(15.0, Kit.font("karla", 800).get_string_size(key_hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + 8.0)
			var kr: Rect2 = Rect2(Vector2(r.end.x - 7.0 - kw, r.position.y + 7 if sub != "" else r.get_center().y - 7.5), Vector2(kw, 15))
			BattleLook.draw_box(self, kr, BattleLook.box(Color(1, 1, 1, 0.08 * a), Color(0, 0, 0, 0), 0, 4))
			BattleLook.say(self, Kit.font("karla", 800), kr.get_center().x, kr.end.y - 4.0, key_hint, 10, Color(BattleLook.MUTED, a))


	## Words on the water (Kong, 2026-10-05: no discs, no icons): the action in
	## Cinzel with a soft shadow, Fire larger and in gold, the key small under,
	## Fire's shot as balls under it. Hover lifts and brightens; spent fades.
	func _draw_disc() -> void:
		var a: float = 0.3 if disabled else 1.0
		var lift: float = 3.0 * _hover
		var f: Font = Kit.font("cinzel", 700)
		var fs: int = 30 if big else 22
		var word: String = label.to_upper() if big else label
		var gold: bool = big and not disabled
		var col: Color = BattleLook.GOLD.lerp(Color(1.0, 0.9, 0.6), 0.25 * _hover) if gold else BattleLook.CREAM.lerp(Color.WHITE, 0.4 * _hover)
		if chosen:
			col = BattleLook.GOLD
		var cx: float = size.x * 0.5
		var y: float = 34.0 - lift
		# A soft dark breath behind the word so it reads on any water.
		draw_texture_rect(FxSheet.glow(), Rect2(Vector2(cx - size.x * 0.55, y - 34.0), Vector2(size.x * 1.1, 52.0)), false, Color(0, 0, 0, 0.32 * a))
		if gold:
			draw_texture_rect(FxSheet.glow(), Rect2(Vector2(cx - size.x * 0.5, y - 36.0), Vector2(size.x, 56.0)), false, Color(BattleLook.GOLD, 0.1 + 0.1 * _hover))
		BattleLook.say(self, f, cx, y, word, fs, Color(col, a), 6)
		var under: String = key_hint if sub == "" else "%s  ·  %s" % [sub, key_hint]
		var y2: float = y + 18.0
		if pips >= 0 and pips_full > 0:
			var step: float = minf(16.0, 100.0 / float(pips_full))
			var x0: float = cx - step * (pips_full - 1) * 0.5
			for k: int in pips_full:
				BattleLook.ball(self, Vector2(x0 + k * step, y2 + 3.0), 6.0, k < pips, a)
			y2 += 16.0
		BattleLook.say(self, Kit.font("karla", 800), cx, y2 + 6.0, under, 10, Color(BattleLook.MUTED, 0.9 * a), 3)


## A crew hand's order on the deck: their portrait in a ring of their class's
## colour, their name, and the order's state; tinted in that colour when
## ordered.
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
		var a: float = 0.4 if disabled else 1.0
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var bg: Color = BattleLook.LACQUER_HI.lerp(BattleLook.LACQUER_HI.lightened(0.12), _hover)
		if chosen:
			bg = bg.lerp(col.darkened(0.5), 0.45)
		BattleLook.draw_box(self, r, BattleLook.box(Color(bg, a), Color(col, 0.95) if chosen else Color(1, 1, 1, (0.08 + 0.1 * _hover) * a), 2 if chosen else 1, 10))
		var mr: float = r.size.y * 0.5 - 8.0
		BattleLook.medallion(self, Vector2(r.position.x + mr + 9, r.get_center().y), mr, tex, col, hand.substr(0, 1), a, Vector2(0.5, 0.36), 0.36)
		var tx: float = r.position.x + mr * 2.0 + 18.0
		var avail: float = r.end.x - tx - 6.0
		draw_string(Kit.font("karla", 800), Vector2(tx, r.get_center().y - 2), hand, HORIZONTAL_ALIGNMENT_LEFT, avail, 13, Color(BattleLook.CREAM, a))
		draw_string(Kit.font("karla", 700), Vector2(tx, r.get_center().y + 13), state, HORIZONTAL_ALIGNMENT_LEFT, avail, 10, Color(col.lightened(0.3) if not disabled else BattleLook.MUTED, a))


## A CREW HAND STANDING UP OUT OF THE DECK (Kong, 2026-10-05: the orders were
## "too blended into the bar"; then no boxes, no class colours). Frameless:
## their art stands on a soft halo of warm light with a shadow at their feet,
## their name and order in plain words under them, their key small beside.
## Ready: the light breathes. Hovered: they rise a little. Ordered: they stand
## up out of the line and the light comes up full. Spent: grey, the light out.
class CrewCard:
	extends Button
	var tex: Texture2D
	var hand: String = ""
	var state: String = ""
	var key_hint: String = ""
	## Kept for callers; not drawn (Kong: no class colours on the cards).
	var col: Color = Color.WHITE
	var chosen: bool = false
	var _hover: float = 0.0
	var _lift: float = 0.0
	var _on: float = 0.0
	var _t: float = randf() * 6.0
	const LIGHT: Color = Color(1.0, 0.86, 0.6)

	func _init() -> void:
		flat = true
		focus_mode = Control.FOCUS_NONE
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		custom_minimum_size = Vector2(116, 172)

	func _process(delta: float) -> void:
		_t += delta
		_hover = move_toward(_hover, 1.0 if is_hovered() and not disabled else 0.0, delta * 8.0)
		var want: float = 18.0 if chosen else (-6.0 if disabled else 6.0 * _hover)
		_lift = lerpf(_lift, want, 1.0 - exp(-delta * 12.0))
		_on = lerpf(_on, 1.0 if chosen else 0.0, 1.0 - exp(-delta * 10.0))
		queue_redraw()

	func _draw() -> void:
		var w: float = size.x
		var grey: bool = disabled
		var floor_y: float = size.y - 40.0
		var g: Texture2D = FxSheet.glow()
		var breath: float = 0.5 + 0.5 * sin(_t * 2.0)
		# The light behind them (none when spent).
		if not grey:
			var ga: float = lerpf(0.16 + 0.08 * breath + 0.14 * _hover, 0.62, _on)
			var hs: float = lerpf(1.0, 1.25, _on)
			var hc: Vector2 = Vector2(w * 0.5, floor_y - 58.0 - _lift)
			draw_texture_rect(g, Rect2(hc - Vector2(70, 70) * hs, Vector2(140, 140) * hs), false, Color(LIGHT, ga))
			# Ordered: a pool of light on the floor under them.
			if _on > 0.02:
				draw_set_transform(Vector2(w * 0.5, floor_y), 0.0, Vector2(1.0, 0.28))
				draw_texture_rect(g, Rect2(-Vector2(64, 64), Vector2(128, 128)), false, Color(LIGHT, 0.5 * _on))
				draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		# The shadow at their feet.
		draw_set_transform(Vector2(w * 0.5, floor_y + 2.0), 0.0, Vector2(1.0, 0.22))
		draw_circle(Vector2.ZERO, 40.0 - _lift * 0.6, Color(0, 0, 0, 0.45))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		# The crewmate, standing on the floor line.
		if tex != null:
			var ts: Vector2 = tex.get_size()
			var box: Vector2 = Vector2(w - 6.0, floor_y - 6.0)
			var k: float = minf(box.x / ts.x, box.y / ts.y)
			var dw: Vector2 = ts * k
			var at: Vector2 = Vector2((w - dw.x) * 0.5, floor_y - dw.y - _lift)
			var tint: Color = Color(0.38, 0.38, 0.42, 0.6) if grey else Color.WHITE.lerp(Color(1.08, 1.04, 0.96), _on)
			draw_texture_rect(tex, Rect2(at, dw), false, tint)
		# Their name, their order, their key.
		var f: Font = Kit.font("karla", 800)
		var fs: int = 14
		while fs > 10 and f.get_string_size(hand, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > w - 8.0:
			fs -= 1
		BattleLook.say(self, f, w * 0.5, floor_y + 20.0, hand, fs, Color(BattleLook.CREAM, 0.5 if grey else 1.0), 4)
		var line: String = state if key_hint == "" or grey else "%s  ·  %s" % [state, key_hint]
		var ss: int = 10
		while ss > 8 and f.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, ss).x > w - 4.0:
			ss -= 1
		BattleLook.say(self, f, w * 0.5, floor_y + 34.0, line, ss, Color(BattleLook.GOLD, 1.0) if chosen else Color(BattleLook.MUTED, 0.6 if grey else 1.0), 3)


## Kept for the deck's layering: it draws nothing now (the deck is the night
## paper alone).
class DeckPanel:
	extends Control
	var title: String = ""
	var body: bool = false
