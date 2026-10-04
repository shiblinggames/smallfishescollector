class_name FxSheet
extends RefCounted
## THE BATTLE'S PARTICLES (Godot port, 2026-10-04). Every effect a fight draws
## (BattleFx) and everything a ship wears (HullAura) is built from these
## particle shapes, drawn in code: soft glows, embers, four-point sparks,
## smoke and mist puffs, ice slivers, droplets, rings. NO painted art: Kong
## turned down painted effect sprites and object art on the ships ("a lot of
## things can just be particle effects").

## What is light (drawn added, on a light layer).
const LIGHT: Array = ["flame", "ember", "spark", "flash", "fireball", "ward"]

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
			on.draw_texture_rect(g, Rect2(-h * 0.4, -h * 0.4, w * 0.4, w * 0.4), false, Color(1, 1, 1, c.a))
		"ward":
			on.draw_arc(Vector2.ZERO, h * 0.9, 0.0, TAU, 48, c, maxf(1.5, w * 0.02), true)
		"ice":
			# A sliver: a long thin diamond, a bright edge.
			var pts: PackedVector2Array = PackedVector2Array([Vector2(0, -h), Vector2(h * 0.22, 0), Vector2(0, h * 0.4), Vector2(-h * 0.22, 0)])
			on.draw_colored_polygon(pts, c)
			on.draw_line(Vector2(0, -h), Vector2(0, h * 0.4), Color(1, 1, 1, c.a * 0.7), 1.2, true)
		"splash":
			for j: int in 5:
				var a: float = -PI / 2.0 + (j - 2) * 0.35
				on.draw_circle(Vector2.from_angle(a) * h * 0.6, maxf(1.0, w * 0.06), c)
		_:
			# Smoke, mist, frost: a soft puff.
			on.draw_texture_rect(g, Rect2(-h, -h, w, w), false, c)
	on.draw_set_transform_matrix(rest)
