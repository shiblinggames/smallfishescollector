class_name FxSheet
extends RefCounted
## THE BATTLE'S PARTICLES (Godot port, 2026-10-04). Every effect a fight draws
## (BattleFx) and everything a ship wears (HullAura) is built from these
## particle shapes, drawn in code: soft glows, embers, four-point sparks,
## smoke and mist puffs, ice slivers, droplets, rings. NO painted art: Kong
## turned down painted effect sprites and object art on the ships ("a lot of
## things can just be particle effects").

## What is light (drawn added, on a light layer).
const LIGHT: Array = ["flame", "ember", "spark", "flash", "fireball", "ward", "plus", "chevron", "ring", "bubble", "crack", "tick", "hex", "cross"]

## Each status's colour and shape: the same colour as its chip on the unit
## frame, a shape that says what it is (a crosshair for Marked, chevrons down
## for Weakened, cracks for Feeble, bubbles for Corroded, a slow ripple for
## Slowed, crossed-out guns for Silenced, chevrons up for Enraged, plus signs
## for Mending, hex glints for Fortified, an ink swirl for Blinded, a closing
## ring for Narrowed).
const STATUS: Dictionary = {
	"marked": [Color(1.0, 0.27, 0.25), "tick"],
	"weaken": [Color(0.72, 0.62, 0.95), "chevron"],
	"feeble": [Color(1.0, 0.62, 0.3), "crack"],
	"corrode": [Color(0.78, 1.0, 0.22), "bubble"],
	"slowed": [Color(0.45, 0.68, 1.0), "ring"],
	"silence": [Color(0.78, 0.45, 1.0), "cross"],
	"enrage": [Color(1.0, 0.45, 0.15), "chevron"],
	"regen": [Color(0.4, 1.0, 0.62), "plus"],
	"fortify": [Color(0.75, 0.9, 1.0), "hex"],
	"blinded": [Color(0.62, 0.52, 0.85), "ember"],
	"narrowed": [Color(0.62, 0.52, 0.85), "ring"],
}


static func status_color(id: String) -> Color:
	return STATUS[id][0] if STATUS.has(id) else Color(1.0, 0.6, 0.5)

static var _glow: Texture2D


static func has(_k: String) -> bool:
	return true


static func glow() -> Texture2D:
	if _glow == null:
		_glow = Glow.radial(128, Color.WHITE)
	return _glow


## One particle, `w` px across, centred at `at` in a standing space (y
## un-squashed by 1/ground; 1.0 for a plain canvas), turned `rot`, coloured
## `c`. Leaves the canvas transform as `rest`.
static func draw(on: CanvasItem, k: String, at: Vector2, w: float, rot: float, c: Color, ground: float, rest: Transform2D, _flip: bool = false) -> void:
	if c.a <= 0.003 or w <= 0.5:
		return
	var m: Transform2D = Transform2D(0.0, Vector2(1.0, 1.0 / ground), 0.0, Vector2.ZERO) * Transform2D(rot, Vector2.ONE, 0.0, at)
	on.draw_set_transform_matrix(m)
	var g: Texture2D = glow()
	var h: float = w / 2.0
	match k:
		"flame":
			# A tongue of fire: a tall soft glow, a hotter core low in it.
			on.draw_texture_rect(g, Rect2(-h * 0.55, -h * 1.1, w * 0.55, w * 1.1), false, c)
			on.draw_texture_rect(g, Rect2(-h * 0.25, -h * 0.35, w * 0.25, w * 0.5), false, Color(1.0, 0.95, 0.8, c.a))
		"ember":
			on.draw_texture_rect(g, Rect2(-h, -h, w, w), false, Color(c, c.a * 0.7))
			on.draw_circle(Vector2.ZERO, maxf(1.0, w * 0.1), Color(c.lightened(0.5), c.a))
		"spark":
			on.draw_texture_rect(g, Rect2(-h * 0.6, -h * 0.6, w * 0.6, w * 0.6), false, Color(c, c.a * 0.6))
			var l: float = h * 0.8
			on.draw_line(Vector2(-l, 0), Vector2(l, 0), c, maxf(1.0, w * 0.05), true)
			on.draw_line(Vector2(0, -l), Vector2(0, l), c, maxf(1.0, w * 0.05), true)
		"flash", "fireball":
			on.draw_texture_rect(g, Rect2(-h, -h, w, w), false, c)
			on.draw_texture_rect(g, Rect2(-h * 0.28, -h * 0.28, w * 0.28, w * 0.28), false, Color(1, 1, 1, c.a * 0.85))
		"ward":
			on.draw_arc(Vector2.ZERO, h * 0.9, 0.0, TAU, 48, c, maxf(1.5, w * 0.02), true)
		"ice":
			# A sliver: a long thin diamond, a bright edge.
			var pts: PackedVector2Array = PackedVector2Array([Vector2(0, -h), Vector2(h * 0.22, 0), Vector2(0, h * 0.4), Vector2(-h * 0.22, 0)])
			on.draw_colored_polygon(pts, c)
			on.draw_line(Vector2(0, -h), Vector2(0, h * 0.4), Color(1, 1, 1, c.a * 0.7), 1.2, true)
		"plus":
			on.draw_texture_rect(g, Rect2(-h * 0.7, -h * 0.7, w * 0.7, w * 0.7), false, Color(c, c.a * 0.35))
			on.draw_line(Vector2(-h * 0.5, 0), Vector2(h * 0.5, 0), c, maxf(2.0, w * 0.16), true)
			on.draw_line(Vector2(0, -h * 0.5), Vector2(0, h * 0.5), c, maxf(2.0, w * 0.16), true)
		"chevron":
			# Pointing down (turn it PI to point up).
			on.draw_polyline(PackedVector2Array([Vector2(-h * 0.6, -h * 0.25), Vector2(0, h * 0.3), Vector2(h * 0.6, -h * 0.25)]), c, maxf(2.0, w * 0.13), true)
		"ring":
			on.draw_arc(Vector2.ZERO, h * 0.85, 0.0, TAU, 48, c, clampf(w * 0.05, 1.5, 3.5), true)
		"bubble":
			on.draw_circle(Vector2.ZERO, h * 0.8, Color(c, c.a * 0.18))
			on.draw_arc(Vector2.ZERO, h * 0.8, 0.0, TAU, 24, c, maxf(1.2, w * 0.07), true)
			on.draw_circle(Vector2(-h * 0.3, -h * 0.3), maxf(1.0, w * 0.1), Color(1, 1, 1, c.a * 0.8))
		"crack":
			# A jagged split (its zigzag set by where it is).
			var pts2: PackedVector2Array = PackedVector2Array()
			for j2: int in 6:
				var f: float = j2 / 5.0
				pts2.append(Vector2(-h + f * w, (h * 0.35) * (1.0 if j2 % 2 == 0 else -1.0) * (0.5 + 0.5 * absf(sin(at.x * 0.37 + j2)))))
			on.draw_polyline(pts2, c, maxf(1.5, w * 0.06), true)
		"tick":
			on.draw_line(Vector2(0, -h * 0.5), Vector2(0, h * 0.5), c, maxf(2.0, w * 0.18), true)
		"hex":
			var hx: PackedVector2Array = PackedVector2Array()
			for j3: int in 7:
				hx.append(Vector2.from_angle(TAU * j3 / 6.0 + PI / 6.0) * h * 0.8)
			on.draw_polyline(hx, c, maxf(1.2, w * 0.08), true)
		"cross":
			on.draw_line(Vector2(-h * 0.5, -h * 0.5), Vector2(h * 0.5, h * 0.5), c, maxf(2.0, w * 0.14), true)
			on.draw_line(Vector2(h * 0.5, -h * 0.5), Vector2(-h * 0.5, h * 0.5), c, maxf(2.0, w * 0.14), true)
		"splash":
			for j: int in 5:
				var a: float = -PI / 2.0 + (j - 2) * 0.35
				on.draw_circle(Vector2.from_angle(a) * h * 0.6, maxf(1.0, w * 0.06), c)
		_:
			# Smoke, mist, frost: a soft puff.
			on.draw_texture_rect(g, Rect2(-h, -h, w, w), false, c)
	on.draw_set_transform_matrix(rest)
