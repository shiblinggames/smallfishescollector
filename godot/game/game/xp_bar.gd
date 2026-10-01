class_name XpBar
extends Control
## THE FISHING XP BAR (Godot port of components/FishingXPBar.tsx, fishing pass 2).
##
## AN INSTRUMENT, NOT A PANEL (Kong, 2026-10-01: not paper like the menus,
## and not the old dark pill): a plank of stained wood trimmed in brass, the
## level struck on a brass medallion, and the way to the next level as sea
## water filling a glass vial, a bright meniscus on it and bubbles rising
## (gold water at the top level). Then what is left to go and the next reward,
## and the perfect streak by a flame, bright while it runs. The water eases to
## its new level over 0.7s and starts again from empty on a new level.

var level: int = 1
var fill: float = 0.0
var to_go: float = 0.0
var next_reward: String = ""
var milestone: bool = false
var streak: int = 0
var _shown: float = 0.0
var _shown_level: int = 0


func _ready() -> void:
	custom_minimum_size = Vector2(560, 40)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_values(lvl: int, frac: float, left: float, reward: String, is_milestone: bool, run: int) -> void:
	if lvl != _shown_level:
		_shown = 0.0 if _shown_level != 0 else frac
		_shown_level = lvl
	level = lvl
	fill = frac
	to_go = left
	next_reward = reward
	milestone = is_milestone
	streak = run
	queue_redraw()


var _t: float = 0.0


func _process(delta: float) -> void:
	_t += delta
	if absf(_shown - fill) > 0.001:
		_shown = lerpf(_shown, fill, 1.0 - exp(-delta * 6.0))
	queue_redraw()


func _draw() -> void:
	var top: bool = level >= Rules.MAX_LEVEL
	var r: Rect2 = Rect2(Vector2.ZERO, size)
	var brass: Color = Color(0.78, 0.62, 0.3)
	var brass_hi: Color = Color(0.95, 0.82, 0.5)
	var cream: Color = Color(0.96, 0.9, 0.78)
	# The plank.
	var plank: StyleBoxFlat = StyleBoxFlat.new()
	plank.bg_color = Color(0.3, 0.19, 0.11, 0.96)
	plank.border_color = Color(brass, 0.85)
	plank.set_border_width_all(1)
	plank.set_corner_radius_all(int(size.y / 2.0))
	plank.shadow_color = Color(0, 0, 0, 0.35)
	plank.shadow_size = 8
	plank.shadow_offset = Vector2(0, 3)
	draw_style_box(plank, r)
	# Its grain: long, faint, uneven lines.
	for k: int in 4:
		var y: float = 9.0 + k * 7.5
		var pts: PackedVector2Array = PackedVector2Array()
		for i: int in 24:
			var x: float = 20.0 + (size.x - 40.0) * i / 23.0
			pts.append(Vector2(x, y + sin(x * 0.031 + k * 1.7) * 1.2 + sin(x * 0.11 + k) * 0.4))
		draw_polyline(pts, Color(0.16, 0.09, 0.05, 0.35), 1.0, true)
	# The medallion.
	var mc: Vector2 = Vector2(size.y / 2.0, size.y / 2.0)
	var mr: float = size.y / 2.0 - 2.0
	draw_circle(mc + Vector2(0, 1.5), mr, Color(0, 0, 0, 0.35))
	draw_circle(mc, mr, brass)
	draw_circle(mc - Vector2(mr * 0.18, mr * 0.22), mr * 0.72, Color(brass_hi, 0.55))
	draw_circle(mc, mr * 0.78, Color(brass.darkened(0.08), 0.9))
	draw_arc(mc, mr, 0.0, TAU, 40, Color(0.4, 0.28, 0.1), 1.2, true)
	var title: Font = Kit.font("cinzel", 800)
	var body: Font = Kit.font("karla", 700)
	var ls: String = str(level)
	var lfs: int = 15 if level < 100 else 12
	var lw: float = title.get_string_size(ls, HORIZONTAL_ALIGNMENT_LEFT, -1, lfs).x
	draw_string(title, mc + Vector2(-lw / 2.0, lfs * 0.36), ls, HORIZONTAL_ALIGNMENT_LEFT, -1, lfs, Color(0.25, 0.16, 0.06))
	# The vial.
	var tube: Rect2 = Rect2(size.y + 8.0, size.y / 2.0 - 7.0, 200.0, 14.0)
	var glass: StyleBoxFlat = StyleBoxFlat.new()
	glass.bg_color = Color(0.06, 0.12, 0.13, 0.85)
	glass.border_color = Color(brass, 0.9)
	glass.set_border_width_all(1)
	glass.set_corner_radius_all(7)
	draw_style_box(glass, tube)
	var inner: Rect2 = tube.grow(-2.0)
	var water: Color = Color(0.92, 0.7, 0.22) if top else Color(0.26, 0.68, 0.64)
	var f: float = 1.0 if top else clampf(_shown, 0.0, 1.0)
	if f > 0.0:
		var w: float = maxf(inner.size.y, inner.size.x * f)
		var liquid: StyleBoxFlat = StyleBoxFlat.new()
		liquid.bg_color = water
		liquid.set_corner_radius_all(5)
		draw_style_box(liquid, Rect2(inner.position, Vector2(w, inner.size.y)))
		# Lighter near the top of the water, and the meniscus where it ends.
		draw_rect(Rect2(inner.position + Vector2(3, 1), Vector2(maxf(0.0, w - 6.0), 2.0)), Color(1, 1, 1, 0.28))
		var mx: float = inner.position.x + w - 1.5
		draw_line(Vector2(mx, inner.position.y + 1.0), Vector2(mx, inner.end.y - 1.0), Color(1, 1, 1, 0.5), 1.5, true)
		# Bubbles drifting up through it.
		for b: int in 6:
			var bx: float = inner.position.x + fposmod(b * 37.0 + _t * (6.0 + b * 1.3), maxf(1.0, w - 4.0)) + 2.0
			var by: float = inner.end.y - fposmod(_t * (4.0 + b) + b * 3.1, inner.size.y)
			draw_circle(Vector2(bx, by), 0.9 + (b % 3) * 0.35, Color(1, 1, 1, 0.35))
	# The glass's own shine over everything in it.
	draw_line(tube.position + Vector2(6, 3), Vector2(tube.end.x - 6, tube.position.y + 3), Color(1, 1, 1, 0.18), 1.0, true)
	# Brass caps at the ends.
	for cx: float in [tube.position.x, tube.end.x]:
		draw_rect(Rect2(cx - 2.0, tube.position.y - 2.0, 4.0, tube.size.y + 4.0), brass)
	var x: float = tube.end.x + 12.0
	if not top:
		draw_string(body, Vector2(x, 25), "%s xp" % Js.thousands(to_go), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, cream)
		x += 62.0
		if next_reward != "":
			draw_string(body, Vector2(x, 25), ("★ " if milestone else "") + next_reward, HORIZONTAL_ALIGNMENT_LEFT, 200, 10, brass_hi if milestone else Color(cream, 0.65))
	else:
		draw_string(body, Vector2(x, 25), "Top of the ladder", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, brass_hi)
	# The streak, with its flame.
	var on: bool = streak > 0
	var fc: Color = Color(1.0, 0.6, 0.22) if on else Color(cream, 0.3)
	var fx: float = size.x - 44.0
	var fy: float = size.y / 2.0
	draw_colored_polygon(PackedVector2Array([
		Vector2(fx, fy - 7), Vector2(fx + 4.5, fy - 1), Vector2(fx + 3.5, fy + 5), Vector2(fx, fy + 7),
		Vector2(fx - 3.5, fy + 5), Vector2(fx - 4.5, fy), Vector2(fx - 1.5, fy - 3),
	]), fc)
	draw_string(title, Vector2(fx + 9, fy + 5), str(streak), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, fc)
