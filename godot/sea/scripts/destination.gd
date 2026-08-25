class_name Destination
extends Node2D

## A PLACE ON THE WATER.
##
## Built entirely from _draw() rather than from art. Phase 2 is asking whether
## having somewhere to sail changes how the map feels, and a nice island sprite
## would flatter the answer the same way a nice boat sprite would have flattered
## phase 1. Real art is phase 4.
##
## Locked places are drawn, not hidden. That is the same rule the raid map
## follows with previewWhenLocked: a goal you cannot see is a goal you have no
## reason to chase, and on a map it is the difference between an empty ocean and
## one with somewhere to get to.

signal entered(route: String)

var data: Dictionary = {}
var locked: bool = false
var in_range: bool = false

const RADIUS := 240.0
## Inside this, the place is dockable. Comfortably bigger than the boat's own
## arrive_radius so you never end up parked next to a door you cannot open.
const DOCK_RANGE := 440.0

var _t: float = 0.0

func setup(d: Dictionary, is_locked: bool) -> void:
	data = d
	locked = is_locked
	position = d["pos"]

func _process(delta: float) -> void:
	_t += delta
	queue_redraw()

func _draw() -> void:
	var tint: Color = data.get("tint", Color.WHITE)
	if locked:
		# Drained rather than hidden. You can see it is there and that it is not
		# for you yet.
		tint = Color(0.42, 0.46, 0.52)

	# A slow breath, so a place reads as inhabited rather than as a decal. Faster
	# and brighter once you are close enough to enter.
	var pulse := 0.5 + 0.5 * sin(_t * (2.2 if in_range else 1.1))
	var glow := (0.30 if locked else 0.55) + pulse * (0.10 if locked else 0.35)

	# Halo on the water.
	draw_circle(Vector2.ZERO, RADIUS * 1.7, Color(tint.r, tint.g, tint.b, 0.06 * glow))
	draw_circle(Vector2.ZERO, RADIUS * 1.25, Color(tint.r, tint.g, tint.b, 0.10 * glow))

	# The landmass. Deliberately irregular so a row of these does not read as a
	# row of buttons.
	var pts := PackedVector2Array()
	var seed_off: float = float(data.get("pos", Vector2.ZERO).x) * 0.013
	for i in range(28):
		var a := TAU * float(i) / 28.0
		var r: float = RADIUS * (
			0.86
			+ 0.11 * sin(a * 3.0 + seed_off)
			+ 0.06 * cos(a * 5.0 - seed_off * 1.7)
			+ 0.03 * sin(a * 8.0 + seed_off * 0.6)
		)
		pts.append(Vector2(cos(a), sin(a)) * r)
	draw_colored_polygon(pts, Color(0.20, 0.20, 0.19) if locked else Color(0.34, 0.28, 0.20))

	# A rim catching the light, which is what stops it looking like a hole.
	draw_polyline(pts + PackedVector2Array([pts[0]]), Color(tint.r, tint.g, tint.b, 0.55 * glow), 3.0)

	# Shoals: a paler band just outside the beach so land meets water through
	# something, rather than on a hard cut.
	var shoal := PackedVector2Array()
	for q in pts:
		shoal.append(q * 1.16)
	draw_polyline(shoal + PackedVector2Array([shoal[0]]), Color(tint.r, tint.g, tint.b, 0.13 * glow), 26.0)

	# The lantern. The thing you actually steer toward at distance.
	draw_circle(Vector2(0, -RADIUS * 0.42), 13.0 + pulse * 3.0, Color(tint.r, tint.g, tint.b, 0.85 * glow))
	draw_circle(Vector2(0, -RADIUS * 0.42), 6.0, Color(1, 1, 1, 0.9 * glow))

func can_enter() -> bool:
	return in_range and not locked

func enter() -> void:
	if can_enter():
		entered.emit(String(data.get("route", "")))
