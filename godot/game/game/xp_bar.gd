class_name XpBar
extends Control
## THE FISHING XP BAR (Godot port of components/FishingXPBar.tsx, fishing pass 2).
##
## A dark pill: "LV" and the level, the track filling toward the next level
## (blue, gold at the top level), what is left to go and the next reward (a
## milestone in gold with a star), and the perfect streak with a flame drawn
## beside it, bright while it runs and faint at nothing. The fill eases to its
## new width over 0.7s and starts again from empty on a new level.

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


func _process(delta: float) -> void:
	if absf(_shown - fill) > 0.001:
		_shown = lerpf(_shown, fill, 1.0 - exp(-delta * 6.0))
		queue_redraw()


func _draw() -> void:
	var top: bool = level >= Rules.MAX_LEVEL
	var c: Color = Color("#f0c040") if top else Color("#60a5fa")
	var r: Rect2 = Rect2(Vector2.ZERO, size)
	var pill: StyleBoxFlat = StyleBoxFlat.new()
	pill.bg_color = Color(0.016, 0.04, 0.07, 0.72)
	pill.border_color = Color(c, 0.16)
	pill.set_border_width_all(1)
	pill.set_corner_radius_all(20)
	draw_style_box(pill, r)
	var body: Font = Kit.font("karla", 700)
	var title: Font = Kit.font("cinzel", 800)
	draw_string(Kit.tracked("karla", 700, 9, 0.14), Vector2(14, 24), "LV", HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(c, 0.73))
	draw_string(title, Vector2(30, 27), str(level), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, c)
	var track: Rect2 = Rect2(64, size.y / 2.0 - 3.5, 170, 7)
	var tb: StyleBoxFlat = StyleBoxFlat.new()
	tb.bg_color = Color(1, 1, 1, 0.08)
	tb.set_corner_radius_all(4)
	draw_style_box(tb, track)
	if _shown > 0.0:
		# The fill brightens along its length (the kit's bar), with a glow.
		var w: float = maxf(track.size.y, track.size.x * clampf(_shown, 0.0, 1.0))
		var glow: StyleBoxFlat = StyleBoxFlat.new()
		glow.bg_color = Color(c, 0.0)
		glow.set_corner_radius_all(4)
		glow.shadow_color = Color(c, 0.4)
		glow.shadow_size = 6
		draw_style_box(glow, Rect2(track.position, Vector2(w, track.size.y)))
		var fb: StyleBoxFlat = StyleBoxFlat.new()
		fb.bg_color = c
		fb.set_corner_radius_all(4)
		draw_style_box(fb, Rect2(track.position, Vector2(w, track.size.y)))
		draw_polygon(PackedVector2Array([track.position + Vector2(3, 0), track.position + Vector2(w * 0.7, 0), track.position + Vector2(w * 0.7, track.size.y), track.position + Vector2(3, track.size.y)]), PackedColorArray([Color(0.02, 0.04, 0.07, 0.45), Color(0.02, 0.04, 0.07, 0.0), Color(0.02, 0.04, 0.07, 0.0), Color(0.02, 0.04, 0.07, 0.45)]))
	var x: float = track.end.x + 10.0
	if not top:
		draw_string(body, Vector2(x, 25), "%s xp" % Js.thousands(to_go), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(1, 1, 1, 0.65))
		x += 62.0
		if next_reward != "":
			draw_string(body, Vector2(x, 25), ("★ " if milestone else "") + next_reward, HORIZONTAL_ALIGNMENT_LEFT, 200, 10, Color("#f0c040") if milestone else Color(1, 1, 1, 0.5))
	# The streak, with its flame.
	var on: bool = streak > 0
	var fc: Color = Color(0.98, 0.57, 0.24, 0.9) if on else Color(0.84, 0.91, 0.94, 0.3)
	var fx: float = size.x - 44.0
	var fy: float = size.y / 2.0
	draw_colored_polygon(PackedVector2Array([
		Vector2(fx, fy - 7), Vector2(fx + 4.5, fy - 1), Vector2(fx + 3.5, fy + 5), Vector2(fx, fy + 7),
		Vector2(fx - 3.5, fy + 5), Vector2(fx - 4.5, fy), Vector2(fx - 1.5, fy - 3),
	]), fc)
	draw_string(title, Vector2(fx + 9, fy + 5), str(streak), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, fc)
