class_name ChaseFx
extends Control
## A CHASE SKIN'S SIGNATURE (a port of the web's components/ChaseSkinFx.tsx and
## its keyframes in globals.css): one effect per chase skin, played over the
## crew's painting and kept inside its box. Ambient on cards and tiles; the
## bolder `summon` on the big reveal. No sweeping sheen (a shop-window shine
## was rejected on cards); each skin has its own:
##   mako_tempest       a lightning flash lighting the character, sparks.
##   dole_krakenhunter  drifting caustic light, bubbles rising.
##   catfish_galaxy     nebula haze, twinkling stars, a rare shooting star.
##   coelacanth_fossil  two glyph rings turning opposite ways, jade and amber
##                      haze, motes rising.
##   doby_huntersbane   a reticle turning, lock brackets pulsing in.
##   moorish_idol_idol  a gilded aureole of rays turning, rose and gold haze,
##                      motes rising.

const FOSSIL_AMBER: Color = Color("#ead6a6")
const IDOL_GOLD: Color = Color("#f5c542")
const SPARKS: Array = [[30, 30], [70, 40], [46, 62], [22, 52], [64, 74]]
const STARS: Array = [[22, 24, 1.0], [70, 20, 1.3], [44, 40, 0.8], [80, 52, 1.0], [16, 56, 1.1], [58, 66, 0.9], [34, 80, 1.2], [86, 36, 0.8], [12, 40, 1.0], [64, 88, 1.0], [50, 30, 0.7], [30, 62, 0.9]]

var skin_id: String = ""
var color: Color = Color.WHITE
var summon: bool = false
var _t: float = 0.0


## Over a picture's box (filling it), for a skin; nothing for a plain skin.
static func over(holder: Control, skin: Dictionary, big: bool = false) -> ChaseFx:
	if not skin.get("chase", false):
		return null
	var fx: ChaseFx = ChaseFx.new()
	fx.skin_id = str(skin["id"])
	fx.color = Color(str(skin.get("color", "#ffffff")))
	fx.summon = big
	fx.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fx.clip_contents = true
	holder.add_child(fx)
	return fx


func _process(delta: float) -> void:
	_t += delta
	queue_redraw()


func _at(lx: float, ty: float) -> Vector2:
	return Vector2(size.x * lx / 100.0, size.y * ty / 100.0)


## A looping keyframe's progress: 0..1 through a `dur` cycle after `delay`.
func _phase(dur: float, delay: float) -> float:
	var t: float = _t - delay
	if t < 0.0:
		return -1.0
	return fmod(t, dur) / dur


## chase-caustic: a soft pool breathing 0.1 to 0.26 and drifting.
func _haze(c: Color, lx: float, ty: float, s: float, dur: float, delay: float) -> void:
	var u: float = _phase(dur, delay)
	if u < 0.0:
		return
	var w: float = 0.5 - 0.5 * cos(u * TAU)
	var op: float = lerpf(0.1, 0.26, w)
	var sc: float = lerpf(1.0, 1.16, w)
	var off: Vector2 = Vector2(lerpf(-0.04, 0.04, w) * s, 0.03 * w * s)
	var px: float = s * sc * (size.x / 160.0)
	var tex: Texture2D = Glow.radial(128, Color(c, 1.0))
	draw_texture_rect(tex, Rect2(_at(lx, ty) + off - Vector2(px, px) / 2.0, Vector2(px, px)), false, Color(1, 1, 1, op * 2.2))


## chase-bubble-rise: up from under the box to past its top, fading in and out.
func _rise(lx: float, dur: float, delay: float, r: float, c: Color, ring: bool, base_op: float) -> void:
	var u: float = _phase(dur, delay)
	if u < 0.0:
		return
	var op: float = (smoothstep(0.0, 0.12, u) * lerpf(0.9, 0.45, clampf((u - 0.12) / 0.76, 0.0, 1.0))) * (1.0 - smoothstep(0.88, 1.0, u)) * base_op
	var p: Vector2 = Vector2(size.x * lx / 100.0, size.y * 1.08 - size.y * 1.2 * u)
	draw_circle(p, r * 2.4, Color(c, 0.18 * op))
	if ring:
		draw_circle(p, r, Color(c, 0.13 * op))
		draw_arc(p, r, 0.0, TAU, 12, Color(c, 0.73 * op), 1.0, true)
	else:
		draw_circle(p, r, Color(c, op))


## chase-reticle-spin: a ring of ticks turning (in a 100-unit box).
func _ticks(radius: float, from: float, to: float, n: int, col_a: Color, col_b: Color, width: float, angle: float, op: float) -> void:
	var c: Vector2 = size / 2.0
	var k: Vector2 = size / 100.0
	for i: int in n:
		var a: float = angle + TAU * float(i) / float(n) - PI / 2.0
		var d: Vector2 = Vector2.from_angle(a)
		draw_line(c + d * from * k, c + d * to * k, Color(col_a if i % 2 else col_b, op), width, true)


func _dashed(radius: float, col: Color, width: float, angle: float, op: float, dash: float, gap: float) -> void:
	var c: Vector2 = size / 2.0
	var circ: float = TAU * radius
	var segs: int = int(circ / (dash + gap))
	var k: Vector2 = size / 100.0
	for i: int in segs:
		var a0: float = angle + TAU * float(i) / float(segs)
		var a1: float = a0 + TAU * dash / circ
		var pts: PackedVector2Array = PackedVector2Array()
		for j: int in 4:
			var a: float = lerpf(a0, a1, float(j) / 3.0)
			pts.append(c + Vector2(cos(a), sin(a)) * radius * k)
		draw_polyline(pts, Color(col, op), width, true)


func _draw() -> void:
	match skin_id:
		"mako_tempest":
			_tempest()
		"dole_krakenhunter":
			_kraken()
		"catfish_galaxy":
			_galaxy()
		"coelacanth_fossil":
			_fossil()
		"doby_huntersbane":
			_hunters_bane()
		"moorish_idol_idol":
			_idol()


func _tempest() -> void:
	# chase-storm-flash: dark most of the cycle, then a sudden multi-flicker.
	var u: float = _phase(2.6 if summon else 4.0, 0.0) * 100.0
	var keys: Array = [[0.0, 0.0], [1.5, 1.0], [3.0, 0.3], [4.5, 0.85], [6.5, 0.0], [56.0, 0.0], [58.0, 0.95], [59.5, 0.28], [61.0, 0.0], [100.0, 0.0]]
	var op: float = 0.0
	for i: int in keys.size() - 1:
		if u >= keys[i][0] and u <= keys[i + 1][0]:
			op = lerpf(keys[i][1], keys[i + 1][1], (u - keys[i][0]) / maxf(0.001, keys[i + 1][0] - keys[i][0]))
	if op > 0.0:
		var px: float = maxf(size.x, size.y) * 1.3
		draw_texture_rect(Glow.radial(128, color), Rect2(_at(50, 44) - Vector2(px, px) / 2.0, Vector2(px, px)), false, Color(1, 1, 1, op * 0.6))
		draw_texture_rect(Glow.radial(128, Color.WHITE), Rect2(_at(50, 44) - Vector2(px, px) * 0.2, Vector2(px, px) * 0.4), false, Color(1, 1, 1, op * 0.8))
	var sz: float = 3.0 if summon else 2.0
	for i: int in SPARKS.size():
		var su: float = _phase((3.0 if summon else 4.6) + float(i % 5) * 0.7, float(i) * 0.9)
		if su < 0.0 or su > 0.14:
			continue
		var sop: float = smoothstep(0.0, 0.05, su) * 0.7 if su < 0.05 else lerpf(0.7, 0.0, (su - 0.05) / 0.09)
		var sp: Vector2 = _at(SPARKS[i][0], SPARKS[i][1])
		draw_circle(sp, sz * 3.0, Color(color, 0.3 * sop))
		draw_circle(sp, sz, Color(color, sop))


func _kraken() -> void:
	for c: Array in [[34, 26, 68, 0.0], [66, 44, 58, 1.7], [50, 66, 62, 3.1]]:
		_haze(color, c[0], c[1], c[2], 4.0 if summon else 7.0, c[3])
	var n: int = 15 if summon else 10
	for i: int in n:
		_rise(6.0 + fmod(float(i) * 79.0 / float(n), 88.0), (1.9 if summon else 3.4) + float(i % 4) * 0.7, float(i) * 0.3, (2.0 + float(i % 4) * 1.7) / 2.0, color, true, 0.85 if summon else 0.5)


func _galaxy() -> void:
	for nb: Array in [[38, 30, 72, "#8b7bf0", 0.0], [66, 52, 60, "#4dc9ff", 2.2], [46, 72, 64, "#b17dff", 4.0]]:
		_haze(Color(nb[3]), nb[0], nb[1], nb[2], 4.5 if summon else 8.0, nb[4])
	for i: int in STARS.size():
		var u: float = _phase((1.6 if summon else 2.8) + float(i % 4) * 0.5, float(i) * 0.24)
		if u < 0.0:
			continue
		var w: float = 0.5 - 0.5 * cos(u * TAU)
		var sz: float = (5.0 if summon else 3.2) * float(STARS[i][2]) * lerpf(0.2, 1.0, w)
		var p: Vector2 = _at(STARS[i][0], STARS[i][1])
		draw_circle(p, sz * 2.4, Color(color, 0.25 * w))
		draw_colored_polygon(PackedVector2Array([p + Vector2(0, -sz), p + Vector2(sz, 0), p + Vector2(0, sz), p + Vector2(-sz, 0)]), Color(1, 1, 1, w))
	for s: Array in [[22.0, 3.0 if summon else 7.0, 0.5 if summon else 2.0], [58.0, 3.6 if summon else 8.5, 1.7 if summon else 5.0]]:
		var u2: float = _phase(s[1], s[2])
		if u2 < 0.0 or u2 > 0.13:
			continue
		var k: float = u2 / 0.13
		var op: float = smoothstep(0.0, 0.3, k) * (1.0 - smoothstep(0.3, 1.0, k)) * 0.95
		var head: Vector2 = Vector2(size.x * (-0.16 + 1.14 * k) + size.x * 0.4, size.y * s[0] / 100.0 + size.y * 0.86 * k * 0.25)
		draw_line(head - Vector2(size.x * 0.4, size.y * 0.09), head, Color(color, op * 0.6), 2.0, true)
		draw_circle(head, 2.0, Color(1, 1, 1, op))


func _fossil() -> void:
	var a1: float = TAU * _t / (13.0 if summon else 26.0)
	var a2: float = -TAU * _t / (9.0 if summon else 18.0)
	_dashed(39.0, FOSSIL_AMBER, 1.0, a1, 0.5 if summon else 0.32, 2.0, 5.0)
	_ticks(39.0, 37.0, 43.0, 12, FOSSIL_AMBER, color, 1.6, a1, 0.5 if summon else 0.32)
	_dashed(29.0, color, 1.0, a2, 0.5 if summon else 0.3, 1.0, 6.0)
	_ticks(29.0, 26.0, 31.0, 8, color, FOSSIL_AMBER, 1.4, a2, 0.5 if summon else 0.3)
	_haze(color, 42, 42, 72, 5.0 if summon else 9.0, 0.0)
	_haze(FOSSIL_AMBER, 60, 58, 58, 5.0 if summon else 9.0, 2.6)
	var n: int = 16 if summon else 11
	for i: int in n:
		_rise(8.0 + fmod(float(i) * 77.0 / float(n), 84.0), (2.4 if summon else 4.2) + float(i % 4) * 0.8, float(i) * 0.32, (2.0 + float(i % 3)) / 2.0, FOSSIL_AMBER if i % 2 else color, false, 1.0)


func _hunters_bane() -> void:
	var a: float = TAU * _t / (9.0 if summon else 18.0)
	var op: float = 0.6 if summon else 0.35
	_dashed(37.0, color, 1.0, a, op, 3.0, 4.0)
	var c: Vector2 = size / 2.0
	draw_arc(c, 26.0 * minf(size.x, size.y) / 100.0, 0.0, TAU, 48, Color(color, op), 1.0, true)
	_ticks(37.0, 43.0, 34.0, 4, color, color, 1.4, a, op)
	# chase-reticle-lock: brackets pulsing in on the mark.
	var u: float = _phase(1.7 if summon else 3.2, 0.0)
	var w: float = 0.5 - 0.5 * cos(u * TAU)
	var sc: float = lerpf(1.16, 1.0, w)
	var lop: float = lerpf(0.12, 0.85, w)
	var half: Vector2 = size * 0.29 * sc
	var arm: float = minf(size.x, size.y) * 0.58 * (0.24 if summon else 0.26) * sc
	var bw: float = 2.5 if summon else 1.6
	for sx: float in [-1.0, 1.0]:
		for sy: float in [-1.0, 1.0]:
			var corner: Vector2 = c + Vector2(sx * half.x, sy * half.y)
			draw_line(corner, corner - Vector2(sx * arm, 0), Color(color, lop), bw)
			draw_line(corner, corner - Vector2(0, sy * arm), Color(color, lop), bw)


func _idol() -> void:
	var a: float = TAU * _t / (16.0 if summon else 30.0)
	var op: float = 0.5 if summon else 0.32
	_dashed(40.0, IDOL_GOLD, 1.0, a, op, 1.0, 5.0)
	var c: Vector2 = size / 2.0
	var k: Vector2 = size / 100.0
	for i: int in 24:
		var ang: float = a + TAU * float(i) / 24.0 - PI / 2.0
		var d: Vector2 = Vector2.from_angle(ang)
		draw_line(c + d * 44.0 * k, c + d * (38.0 if i % 2 else 40.0) * k, Color(color if i % 2 else IDOL_GOLD, op), 1.6, true)
	_haze(color, 46, 42, 74, 4.5 if summon else 8.0, 0.0)
	_haze(IDOL_GOLD, 56, 56, 58, 4.5 if summon else 8.0, 2.4)
	var n: int = 14 if summon else 10
	for i: int in n:
		_rise(8.0 + fmod(float(i) * 77.0 / float(n), 84.0), (2.6 if summon else 4.4) + float(i % 4) * 0.7, float(i) * 0.34, (2.0 + float(i % 3)) / 2.0, IDOL_GOLD if i % 2 else color, false, 1.0)
