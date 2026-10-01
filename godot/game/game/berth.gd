class_name Berth
extends Node2D
## A PORT'S MOORING ON THE WATER (Godot, rebuilt 2026-10-01 at Kong's word:
## "rethink how we do this in Godot"). The web drew a glowing pool, a neon rim
## and fourteen lamps; under the port's glow they bloomed into blobs. Here a
## mooring is made of things that stand in the water:
##
##   PILINGS  three wooden posts on the island side of the berth, bound with
##            rope, standing up out of the water with their reflections under
##            them and the water ringing round their feet; the outer two carry
##            lanterns that come up with the dark (their light runs down the
##            water as every lamp's does).
##   FLOATS   a line of cork floats strung round the berth, bobbing on their
##            rope: the outline of where to sail in.
##   INSIDE   when she is in the berth (`lit` eases to 1) the lanterns burn
##            brighter and the floats catch the light, warm by day and night.
##
## Lives in the World (the water plane): the floats lie on it, the pilings are
## counter-squashed so they stand up.

const FLOATS: int = 18

var r: float = 330.0
## The direction from the island to the berth (the pilings stand on the
## island side, opposite it).
var bearing: float = 0.0
var inside: bool = false
var darkness: float = 0.0
var lit: float = 0.0
## The sea's reactive water: the pilings ring it now and then.
var field: SeaField
var _t: float = 0.0
var _ring_t: float = 0.0
var _posts: Array[Piling] = []
## The floats that sit on open water (the berth's island side runs onto the
## land), by angle.
var _float_at: Array[float] = []


## Open water here, with room to spare toward the land.
func _wet(local: Vector2) -> bool:
	var world: Vector2 = position + local
	var toward_land: Vector2 = Vector2.from_angle(bearing + PI)
	var side: Vector2 = toward_land.orthogonal()
	for probe: Vector2 in [Vector2.ZERO, toward_land * 140.0, side * 60.0, -side * 60.0]:
		if Chart.off_shore(world + probe)["hit"]:
			return false
	return true


func _ready() -> void:
	for i: int in FLOATS:
		var a: float = float(i) / FLOATS * TAU
		if _wet(Vector2(cos(a), sin(a)) * r * 0.98):
			_float_at.append(a)
	# The pilings: along the shore edge of the berth, the three open-water
	# spots on its ring nearest the land, spread apart.
	var back: float = bearing + PI
	var spots: Array = []
	for d: int in 72:
		var a: float = float(d) / 72.0 * TAU
		if _wet(Vector2(cos(a), sin(a)) * r * 0.9):
			spots.append(a)
	spots.sort_custom(func(x: float, y: float) -> bool: return absf(wrapf(x - back, -PI, PI)) < absf(wrapf(y - back, -PI, PI)))
	var chosen: Array = []
	for a: float in spots:
		var clear: bool = true
		for c: float in chosen:
			if absf(wrapf(a - c, -PI, PI)) < 0.45:
				clear = false
		if clear:
			chosen.append(a)
		if chosen.size() == 3:
			break
	chosen.sort_custom(func(x: float, y: float) -> bool: return wrapf(x - back, -PI, PI) < wrapf(y - back, -PI, PI))
	for k: int in chosen.size():
		var a: float = chosen[k]
		var p: Piling = Piling.new()
		p.position = Vector2(cos(a), sin(a)) * r * 0.9
		p.lamp = k != 1
		p.height = 78.0 if k == 1 else 92.0
		p.phase = k * 1.3 + bearing
		add_child(p)
		_posts.append(p)


## Where the lanterns' light meets the water (the sea runs their light down
## it at night), in the World's space.
func lamp_points() -> Array[Vector2]:
	var out: Array[Vector2] = []
	for p: Piling in _posts:
		if p.lamp:
			out.append(position + p.position)
	return out


func _process(delta: float) -> void:
	_t += delta
	lit = move_toward(lit, 1.0 if inside else 0.0, delta * 3.0)
	for p: Piling in _posts:
		p.glow = clampf(darkness * 0.9 + lit * 0.6, 0.0, 1.0)
		p.t = _t
		p.queue_redraw()
	_ring_t -= delta
	if field != null and _ring_t <= 0.0 and not _posts.is_empty():
		_ring_t = randf_range(1.6, 3.2)
		var p: Piling = _posts[randi() % _posts.size()]
		field.ring(position + p.position, 46.0, 1.4, 0.35)
	queue_redraw()


func _draw() -> void:
	# The rope, sagging between the floats on open water.
	var ring_r: float = r * 0.98
	var step: float = TAU / FLOATS
	for a: float in _float_at:
		if not _float_at.has(fposmod(a + step, TAU)) and not (absf(fposmod(a + step, TAU)) < 0.001 and _float_at.has(0.0)):
			continue
		var seg: PackedVector2Array = PackedVector2Array()
		for j: int in 9:
			var aa: float = a + step * j / 8.0
			var sag: float = sin(float(j) / 8.0 * PI) * 7.0
			seg.append(Vector2(cos(aa), sin(aa)) * (ring_r - sag))
		draw_polyline(seg, Color(0.12, 0.09, 0.06, 0.4), 2.0, true)
	# The floats: cork and red by turns, bobbing, catching the light inside.
	var warm: Color = Color(1.0, 0.82, 0.5)
	for a: float in _float_at:
		var i: int = int(round(a / step))
		var bob: float = sin(_t * 1.6 + i * 0.9) * 0.18
		var at: Vector2 = Vector2(cos(a), sin(a)) * ring_r
		var base: Color = Color(0.86, 0.76, 0.56) if i % 2 == 0 else Color(0.74, 0.22, 0.18)
		var c: Color = base.lerp(warm, lit * 0.45)
		draw_circle(at + Vector2(0, 6), 11.0, Color(0, 0, 0, 0.18))
		draw_set_transform(at, 0.0, Vector2(1.0, 1.0 + bob))
		draw_circle(Vector2.ZERO, 10.0, c.darkened(0.25))
		draw_circle(Vector2(-2.0, -3.0), 6.0, c)
		draw_circle(Vector2(-3.0, -5.0), 2.4, Color(1, 1, 1, 0.35 + lit * 0.3))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		if lit > 0.01:
			draw_circle(at, 22.0, Color(warm, 0.10 * lit))


## A WOODEN PILING: a post bound with rope standing up out of the water, its
## reflection beneath it, and on the outer posts a lantern.
class Piling:
	extends Node2D
	var height: float = 90.0
	var lamp: bool = false
	var glow: float = 0.0
	var phase: float = 0.0
	var t: float = 0.0

	func _ready() -> void:
		scale = Vector2(1.0, 1.0 / Chart.GROUND)
		z_index = 2

	func _draw() -> void:
		var w: float = 15.0
		var lean: float = sin(t * 0.8 + phase) * 0.6
		# The reflection: the post upside down in the water, faint and broken.
		for k: int in 6:
			var y0: float = k * height * 0.55 / 6.0
			var y1: float = (k + 1) * height * 0.55 / 6.0
			var off: float = sin(t * 2.2 + phase + k * 1.3) * 2.2
			draw_rect(Rect2(-w / 2.0 + off, y0, w, y1 - y0), Color(0.28, 0.2, 0.12, 0.22 * (1.0 - float(k) / 6.0)))
		# The post: lit down its left side, shadowed down its right.
		var top: float = -height
		var pts: PackedVector2Array = PackedVector2Array([Vector2(-w / 2.0 + lean, top), Vector2(w / 2.0 + lean, top), Vector2(w / 2.0, 0), Vector2(-w / 2.0, 0)])
		draw_polygon(pts, PackedColorArray([Color(0.62, 0.46, 0.3), Color(0.32, 0.22, 0.13), Color(0.26, 0.18, 0.1), Color(0.5, 0.36, 0.22)]))
		# Grain.
		for g: int in 3:
			var gx: float = -w / 2.0 + w * (0.25 + g * 0.25)
			draw_line(Vector2(gx + lean, top + 4.0), Vector2(gx, -4.0), Color(0.18, 0.12, 0.07, 0.35), 1.0, true)
		# The cap.
		draw_set_transform(Vector2(lean, top), 0.0, Vector2(1.0, 0.45))
		draw_circle(Vector2.ZERO, w / 2.0, Color(0.55, 0.42, 0.28))
		draw_circle(Vector2.ZERO, w / 2.0 - 2.5, Color(0.42, 0.31, 0.2))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		# Rope bands.
		for by: float in [-height * 0.62, -height * 0.55]:
			draw_line(Vector2(-w / 2.0 - 1.0, by), Vector2(w / 2.0 + 1.0, by + 2.0), Color(0.78, 0.68, 0.48), 2.6, true)
		# Weed and wet at the waterline.
		draw_rect(Rect2(-w / 2.0, -9.0, w, 9.0), Color(0.14, 0.2, 0.12, 0.55))
		# The lantern.
		if lamp:
			var at: Vector2 = Vector2(lean, top - 12.0)
			if glow > 0.01:
				draw_circle(at, 34.0, Color(1.0, 0.75, 0.4, 0.12 * glow))
				draw_circle(at, 16.0, Color(1.0, 0.8, 0.45, 0.25 * glow))
			draw_rect(Rect2(at - Vector2(5.5, 7.0), Vector2(11.0, 14.0)), Color(0.18, 0.13, 0.08))
			draw_rect(Rect2(at - Vector2(3.5, 5.0), Vector2(7.0, 10.0)), Color(1.0, 0.82, 0.5).lerp(Color(0.5, 0.42, 0.3), 1.0 - maxf(glow, 0.15)))
			draw_line(at + Vector2(-6.0, -7.0), at + Vector2(6.0, -7.0), Color(0.12, 0.09, 0.05), 2.0)
