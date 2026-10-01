class_name XpBar
extends Control
## THE FISHING XP BAR (Godot port of components/FishingXPBar.tsx, fishing pass 2).
##
## LETTERING ON THE WATER (Kong, 2026-10-01: not paper, not the old dark
## pill, and the wood-and-brass instrument was too much): no box at all. The
## level in Cinzel over a soft shadow, then a thin line of light toward the
## next level with a breathing bead where it has reached (gold at the top),
## what is left to go and the next reward, and the perfect streak by a flame,
## bright while it runs. It reads like the captain's name and purse above it.
## The line eases to its new length over 0.7s and starts again from empty on
## a new level.

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
	var cream: Color = Color(0.97, 0.93, 0.85)
	var shade: Color = Color(0, 0, 0, 0.55)
	var glass: Color = Color(1.0, 0.82, 0.42) if top else Color(0.56, 0.9, 0.84)
	var title: Font = Kit.font("cinzel", 800)
	var body: Font = Kit.font("karla", 700)
	var small: Font = Kit.tracked("karla", 700, 10, 0.16)
	var cy: float = size.y / 2.0
	# The level, lettered on the water.
	_ink(small, Vector2(0, cy + 5), "LV", 10, Color(cream, 0.75), shade)
	var ls: String = str(level)
	_ink(title, Vector2(20, cy + 9), ls, 24, cream, shade)
	var lw: float = title.get_string_size(ls, HORIZONTAL_ALIGNMENT_LEFT, -1, 24).x
	# A thin line of light: the way to the next level.
	var x0: float = 20.0 + lw + 12.0
	var w: float = 210.0
	var track: Rect2 = Rect2(x0, cy - 2.0, w, 4.0)
	_pill(track.grow(1.0), Color(0, 0, 0, 0.35))
	_pill(track, Color(1, 1, 1, 0.16))
	var f: float = 1.0 if top else clampf(_shown, 0.0, 1.0)
	if f > 0.0:
		var fw: float = maxf(4.0, w * f)
		for g: int in 3:
			_pill(Rect2(track.position - Vector2(g + 1, g + 1), Vector2(fw + (g + 1) * 2.0, 4.0 + (g + 1) * 2.0)), Color(glass, 0.09))
		_pill(Rect2(track.position, Vector2(fw, 4.0)), glass)
		# A bead of light where it has reached, breathing.
		var bead: Vector2 = Vector2(x0 + fw, cy)
		draw_circle(bead, 4.5 + sin(_t * 2.4) * 0.6, Color(glass, 0.25))
		draw_circle(bead, 2.4, Color(1, 1, 1, 0.95))
	var x: float = x0 + w + 14.0
	if not top:
		var togo: String = "%s xp to go" % Js.thousands(to_go)
		_ink(body, Vector2(x, cy + 4), togo, 11, Color(cream, 0.85), shade)
		x += body.get_string_size(togo, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x + 14.0
		if next_reward != "":
			_ink(body, Vector2(x, cy + 4), ("★ " if milestone else "then ") + next_reward, 10, Color(1.0, 0.84, 0.5) if milestone else Color(cream, 0.6), shade, 220)
	else:
		_ink(body, Vector2(x, cy + 4), "Top of the ladder", 11, Color(1.0, 0.84, 0.5), shade)
	# The streak, by its flame.
	var on: bool = streak > 0
	var fc: Color = Color(1.0, 0.62, 0.25) if on else Color(cream, 0.35)
	var fx: float = size.x - 30.0
	var fy: float = cy
	var flame: PackedVector2Array = PackedVector2Array([
		Vector2(fx, fy - 8), Vector2(fx + 5, fy - 1), Vector2(fx + 4, fy + 5), Vector2(fx, fy + 7),
		Vector2(fx - 4, fy + 5), Vector2(fx - 5, fy), Vector2(fx - 1.5, fy - 3),
	])
	var sh: PackedVector2Array = PackedVector2Array()
	for p: Vector2 in flame:
		sh.append(p + Vector2(0, 1.5))
	draw_colored_polygon(sh, shade)
	draw_colored_polygon(flame, fc)
	_ink(title, Vector2(fx + 9, fy + 5), str(streak), 13, fc, shade)


## Lettering on the water: the words over their own soft shadow.
func _ink(f: Font, at: Vector2, t: String, px: int, col: Color, shade: Color, max_w: float = -1.0) -> void:
	for o: Vector2 in [Vector2(0, 1.5), Vector2(1, 1), Vector2(-1, 1)]:
		draw_string(f, at + o, t, HORIZONTAL_ALIGNMENT_LEFT, max_w, px, Color(shade, shade.a * 0.6))
	draw_string(f, at, t, HORIZONTAL_ALIGNMENT_LEFT, max_w, px, col)


func _pill(r: Rect2, c: Color) -> void:
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = c
	sb.set_corner_radius_all(int(r.size.y / 2.0) + 1)
	sb.anti_aliasing = true
	draw_style_box(sb, r)
