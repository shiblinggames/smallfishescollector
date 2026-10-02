class_name XpBar
extends Control
## THE LEVEL BAR (Godot port of components/FishingXPBar.tsx, fishing pass 2).
## LETTERING ON THE WATER (Kong, 2026-10-01: not paper, not the old dark pill,
## not the wood-and-brass instrument): no box at all. Centred at the top of
## the screen and always there.
##
## It is about the side of the reef she is on (as the web's spine panel is):
## FISHING in the fishing waters, NAVIGATION in the harbour waters north of
## the reef. Crossing over, it fades out and back in on the other skill.
## The skill's name, the level in Cinzel over a soft shadow, a thin line of
## light toward the next level with a breathing bead where it has reached
## (gold at the top), what is left to go and the next reward, and, for
## fishing, the perfect streak by a flame. The line eases to its new length
## over 0.7s and starts again from empty on a new level.

var skill: String = "fishing"
var level: int = 1
var fill: float = 0.0
var to_go: float = 0.0
var next_reward: String = ""
var milestone: bool = false
var streak: int = 0
var _shown: float = 0.0
var _shown_level: int = 0
var _t: float = 0.0
var _swap: Tween


func _ready() -> void:
	custom_minimum_size = Vector2(560, 40)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## streak is -1 where there is none to show (navigation).
func set_values(lvl: int, frac: float, left: float, reward: String, is_milestone: bool, run: int, which: String = "fishing") -> void:
	_pending = [lvl, frac, left, reward, is_milestone, run]
	if which == _want:
		# Already showing (or heading for) this skill: the newest numbers win.
		if _swap == null or not _swap.is_valid():
			skill = which
			_apply(lvl, frac, left, reward, is_milestone, run)
		return
	_want = which
	if not is_inside_tree():
		skill = which
		_apply(lvl, frac, left, reward, is_milestone, run)
		return
	# Crossing the reef: fade out, take the other skill, fade back in.
	if _swap != null and _swap.is_valid():
		_swap.kill()
	_swap = create_tween()
	_swap.tween_property(self, "modulate:a", 0.0, 0.2)
	_swap.tween_callback(func() -> void:
		skill = _want
		_shown_level = 0
		var v: Array = _pending
		_apply(v[0], v[1], v[2], v[3], v[4], v[5]))
	_swap.tween_property(self, "modulate:a", 1.0, 0.3)


var _want: String = "fishing"
var _pending: Array = []


func _apply(lvl: int, frac: float, left: float, reward: String, is_milestone: bool, run: int) -> void:
	if lvl != _shown_level:
		if _shown_level != 0 and lvl > _shown_level and skill == _want:
			# A level crossed: the line runs on to full first (_process),
			# then the number ticks and it starts again from empty.
			_crossing = lvl
			level_from = level
			_shown_level = lvl
		else:
			_shown = 0.0 if _shown_level != 0 else frac
			_shown_level = lvl
	level = lvl
	fill = frac
	to_go = left
	next_reward = reward
	milestone = is_milestone
	streak = run
	queue_redraw()


# THE XP COMING IN (Kong, 2026-10-01: "can gaining XP feel more dopamine?").
# A catch sends a stream of motes from where the fish came up into the bar;
# the line only moves as they land, with a soft tick; close to a level it
# warms and the bead quickens; crossing one, the line runs on to full,
# flashes, the number ticks up with a rising note, and it starts again. Under
# the bar, a quiet tally of the XP earned this trip.

## [from (local), arrival time, start time, size]
var _motes: Array = []
var _hold_until: float = 0.0
var _crossing: int = 0
var level_from: int = 0
var _flash: float = 0.0
var _trip: float = 0.0
var _trip_t: float = -99.0
var _ticks: int = 0
var _bead: Vector2 = Vector2.ZERO


## A catch's XP flying in from a screen point. strength 1 for an everyday
## fish, more for a rare one, a perfect, a streak.
func gain(amount: float, from_screen: Vector2, strength: float = 1.0) -> void:
	var from: Vector2 = get_global_transform_with_canvas().affine_inverse() * from_screen
	var n: int = clampi(int(5.0 + strength * 5.0), 5, 22)
	for i: int in n:
		var start: float = _t + i * 0.035
		_motes.append([from + Vector2(randf_range(-14, 14), randf_range(-10, 10)), start + randf_range(0.5, 0.75), start, randf_range(1.6, 2.6) * (0.8 + 0.2 * strength)])
	_hold_until = _t + 0.55
	_trip += amount
	_trip_t = _t


func _process(delta: float) -> void:
	_t += delta
	_flash = maxf(0.0, _flash - delta * 2.5)
	var landed: int = 0
	for m: Array in _motes:
		if _t >= float(m[1]):
			landed += 1
	if landed > 0:
		_motes = _motes.filter(func(m: Array) -> bool: return _t < float(m[1]))
		_ticks += landed
		if _ticks >= 3:
			_ticks = 0
			Sound.xp_tick()
	if _t >= _hold_until:
		if _crossing > 0:
			_shown = lerpf(_shown, 1.05, 1.0 - exp(-delta * 7.0))
			if _shown >= 0.995:
				_crossing = 0
				_shown = 0.0
				_flash = 1.0
				Sound.streak(clampi(level % 10 + 3, 1, 10))
		elif absf(_shown - fill) > 0.001:
			_shown = lerpf(_shown, fill, 1.0 - exp(-delta * 6.0))
	queue_redraw()


func _draw() -> void:
	var top: bool = level >= 100
	var nav: bool = skill == "nav"
	var cream: Color = Color(0.97, 0.93, 0.85)
	var shade: Color = Color(0, 0, 0, 0.55)
	var glass: Color = Color(1.0, 0.82, 0.42) if top else (Color(0.98, 0.78, 0.5) if nav else Color(0.56, 0.9, 0.84))
	var title: Font = Kit.font("cinzel", 800)
	var body: Font = Kit.font("karla", 700)
	var small: Font = Kit.tracked("karla", 700, 10, 0.2)
	var cy: float = size.y / 2.0
	var name: String = "NAVIGATION" if nav else "FISHING"
	var ls: String = str(level)
	var togo: String = ("%s xp to go" % Js.thousands(to_go)) if not top else "Top of the ladder"
	var rw: String = ""
	if not top and next_reward != "":
		rw = ("★ " if milestone else "then ") + next_reward
	# Measure it all, so it sits centred whatever it says.
	var w_name: float = small.get_string_size(name, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
	var w_num: float = title.get_string_size(ls, HORIZONTAL_ALIGNMENT_LEFT, -1, 24).x
	var bar_w: float = 200.0
	var w_togo: float = body.get_string_size(togo, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
	var w_rw: float = minf(220.0, body.get_string_size(rw, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x) if rw != "" else 0.0
	var w_flame: float = 34.0 if streak >= 0 else 0.0
	var total: float = w_name + 8.0 + w_num + 12.0 + bar_w + 14.0 + w_togo + (14.0 + w_rw if rw != "" else 0.0) + (16.0 + w_flame if w_flame > 0.0 else 0.0)
	var x: float = (size.x - total) / 2.0
	_ink(small, Vector2(x, cy + 4), name, 10, Color(cream, 0.75), shade)
	x += w_name + 8.0
	if _crossing > 0:
		ls = str(level_from)
	if _flash > 0.0:
		draw_circle(Vector2(x + w_num / 2.0, cy), 26.0 * (1.0 + (1.0 - _flash) * 0.6), Color(glass, 0.35 * _flash))
	_ink(title, Vector2(x, cy + 9), ls, 24, cream.lerp(Color(1, 0.9, 0.6), _flash), shade)
	x += w_num + 12.0
	# A thin line of light: the way to the next level.
	var track: Rect2 = Rect2(x, cy - 2.0, bar_w, 4.0)
	_pill(track.grow(1.0), Color(0, 0, 0, 0.35))
	_pill(track, Color(1, 1, 1, 0.16))
	var f: float = 1.0 if top else clampf(_shown, 0.0, 1.0)
	# Close to a level it warms, and the bead quickens.
	var near: float = smoothstep(0.88, 1.0, f) if not top else 0.0
	var line_c: Color = glass.lerp(Color(1.0, 0.85, 0.45), near * 0.7)
	if _flash > 0.0:
		_pill(track.grow(3.0 + 4.0 * _flash), Color(1.0, 0.9, 0.6, 0.35 * _flash))
	_bead = Vector2(x + maxf(4.0, bar_w * f), cy)
	if f > 0.0:
		var fw: float = maxf(4.0, bar_w * f)
		for g: int in 3:
			_pill(Rect2(track.position - Vector2(g + 1, g + 1), Vector2(fw + (g + 1) * 2.0, 4.0 + (g + 1) * 2.0)), Color(line_c, 0.09 + near * 0.06))
		_pill(Rect2(track.position, Vector2(fw, 4.0)), line_c)
		# A bead of light where it has reached, breathing (faster when close).
		var bead: Vector2 = Vector2(x + fw, cy)
		var rate: float = 2.4 + near * 6.0
		draw_circle(bead, 4.5 + sin(_t * rate) * (0.6 + near * 1.2), Color(line_c, 0.25 + near * 0.2))
		draw_circle(bead, 2.4, Color(1, 1, 1, 0.95))
	# The motes, flying in along a little arc and landing on the bead.
	for m: Array in _motes:
		var u: float = clampf((_t - float(m[2])) / maxf(0.01, float(m[1]) - float(m[2])), 0.0, 1.0)
		if u <= 0.0:
			continue
		var e: float = u * u * (3.0 - 2.0 * u)
		var a0: Vector2 = m[0]
		var mid: Vector2 = a0.lerp(_bead, 0.5) + Vector2(0, -60.0)
		var p: Vector2 = a0.lerp(mid, e).lerp(mid.lerp(_bead, e), e)
		draw_circle(p, float(m[3]) * 2.2, Color(line_c, 0.18))
		draw_circle(p, float(m[3]), Color(1, 1, 0.92, 0.9))
	# The XP earned this trip, quietly, under the bar.
	var since: float = _t - _trip_t
	if _trip > 0.0 and since < 8.0:
		var ta: float = 1.0 - smoothstep(5.0, 8.0, since)
		var tt: String = "+%s XP this trip" % Js.thousands(_trip)
		var ttw: float = body.get_string_size(tt, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		_ink(body, Vector2(size.x / 2.0 - ttw / 2.0, cy + 26), tt, 11, Color(line_c.lerp(cream, 0.4), 0.85 * ta), Color(0, 0, 0, 0.5 * ta))
	x += bar_w + 14.0
	_ink(body, Vector2(x, cy + 4), togo, 11, Color(1.0, 0.84, 0.5) if top else Color(cream, 0.85), shade)
	x += w_togo + 14.0
	if rw != "":
		_ink(body, Vector2(x, cy + 4), rw, 10, Color(1.0, 0.84, 0.5) if milestone else Color(cream, 0.6), shade, 220)
		x += w_rw + 16.0
	# The streak, by its flame (fishing only).
	if streak >= 0:
		var on: bool = streak > 0
		var fc: Color = Color(1.0, 0.62, 0.25) if on else Color(cream, 0.35)
		var fx: float = x + 6.0
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
