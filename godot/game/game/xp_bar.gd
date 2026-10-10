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

## Pressed: the Fishing guide (every level and what it brings).
signal pressed
## A level crossing has played out (the line ran to full and flashed): the
## level card may come now.
signal crossing_done

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
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	tooltip_text = "Every Fishing level and what it brings"


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT and skill == "fishing":
		accept_event()
		pressed.emit()


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
	Motion.ease_fade(_swap, self, "modulate:a", 0.0, 0.2)
	_swap.tween_callback(func() -> void:
		skill = _want
		_shown_level = 0
		var v: Array = _pending
		_apply(v[0], v[1], v[2], v[3], v[4], v[5]))
	Motion.ease_fade(_swap, self, "modulate:a", 1.0, 0.3)


var _want: String = "fishing"
var _pending: Array = []


## Whether a level crossing is still to play out on the line.
func crossing() -> bool:
	return _crossing > 0


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
				# The bar's own tick, a touch louder (the streak's ladder is
				# the perfects'; the level card's chest follows).
				Sound.xp_tick()
				crossing_done.emit()
		elif absf(_shown - fill) > 0.001:
			_shown = lerpf(_shown, fill, 1.0 - exp(-delta * 6.0))
	queue_redraw()


func _draw() -> void:
	var top: bool = level >= 100
	var nav: bool = skill == "nav"
	var cream: Color = Kit.SEA_INK
	var shade: Color = Kit.SEA_SHADE
	var glass: Color = Color(1.0, 0.82, 0.42) if top else (Color(0.98, 0.78, 0.5) if nav else Color(0.56, 0.9, 0.84))
	var title: Font = Kit.font("cinzel", 800)
	var body: Font = Kit.font("karla", 700)
	var small: Font = Kit.tracked("karla", 800, 12, 0.2)
	var cy: float = size.y / 2.0
	var name: String = "NAVIGATION" if nav else "FISHING"
	var ls: String = str(level)
	var togo: String = ("%s xp to go" % Js.thousands(to_go)) if not top else "Top of the ladder"
	var rw: String = ""
	if not top and next_reward != "":
		rw = next_reward
	# Measure it all, so it sits centred whatever it says.
	var w_name: float = small.get_string_size(name, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
	var w_num: float = title.get_string_size(ls, HORIZONTAL_ALIGNMENT_LEFT, -1, 28).x
	var bar_w: float = 200.0
	var w_togo: float = body.get_string_size(togo, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
	var w_rw: float = minf(240.0, body.get_string_size(rw, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x) if rw != "" else 0.0
	var w_flame: float = 34.0 if streak >= 0 else 0.0
	var total: float = w_name + 8.0 + w_num + 12.0 + bar_w + 14.0 + w_togo + (14.0 + w_rw if rw != "" else 0.0) + (16.0 + w_flame if w_flame > 0.0 else 0.0)
	var x: float = (size.x - total) / 2.0
	# A soft dark pool behind the words, so they read over any water.
	var sb: StyleBoxFlat = _box()
	sb.anti_aliasing = true
	sb.bg_color = Color(0.01, 0.03, 0.05, 0.045)
	for g: int in 8:
		var grow: float = 4.0 + g * 6.0
		sb.set_corner_radius_all(int(size.y / 2.0 + grow))
		draw_style_box(sb, Rect2(Vector2(x - grow, cy - 14.0 - grow * 0.5), Vector2(total + grow * 2.0, 28.0 + grow)))
	_ink(small, Vector2(x, cy + 5), name, 12, cream, shade)
	x += w_name + 8.0
	if _crossing > 0:
		ls = str(level_from)
	if _flash > 0.0:
		draw_circle(Vector2(x + w_num / 2.0, cy), 26.0 * (1.0 + (1.0 - _flash) * 0.6), Color(glass, 0.35 * _flash))
	_ink(title, Vector2(x, cy + 10), ls, 28, cream.lerp(Kit.SEA_GOLD, _flash), shade)
	x += w_num + 12.0
	# A thin line of light: the way to the next level.
	var track: Rect2 = Rect2(x, cy - 2.0, bar_w, 4.0)
	_pill(track.grow(1.0), Color(0, 0, 0, 0.35))
	_pill(track, Color(1, 1, 1, 0.16))
	var f: float = 1.0 if top else clampf(_shown, 0.0, 1.0)
	# Close to a level it warms, and the bead quickens.
	var near: float = smoothstep(0.88, 1.0, f) if not top else 0.0
	var line_c: Color = glass.lerp(Kit.SEA_GOLD, near * 0.7)
	if _flash > 0.0:
		_pill(track.grow(3.0 + 4.0 * _flash), Color(Kit.SEA_GOLD, 0.35 * _flash))
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
	# The XP earned this trip, quietly, under the line and INSIDE the bar's
	# own rect (it overprinted the compass under it before).
	var since: float = _t - _trip_t
	if _trip > 0.0 and since < 8.0:
		var ta: float = 1.0 - smoothstep(5.0, 8.0, since)
		var tt: String = "+%s XP this trip" % Js.thousands(_trip)
		var ttw: float = body.get_string_size(tt, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		Kit.sea_string(self, body, Vector2(track.position.x + bar_w / 2.0 - ttw / 2.0, size.y - 3.0), tt, 11, Color(line_c.lerp(cream, 0.4), 0.85), HORIZONTAL_ALIGNMENT_LEFT, -1.0, ta)
	x += bar_w + 14.0
	_ink(body, Vector2(x, cy + 5), togo, 13, Kit.SEA_GOLD if top else cream, shade)
	x += w_togo + 14.0
	if rw != "":
		_ink(body, Vector2(x, cy + 5), rw, 12, Kit.SEA_GOLD if milestone else Color(cream, 0.85), shade, 240)
		x += w_rw + 16.0
	# The streak, by its flame (fishing only).
	if streak >= 0:
		var on: bool = streak > 0
		var fc: Color = Color(1.0, 0.62, 0.25) if on else Color(cream, 0.35)
		var fx: float = x + 6.0
		var fy: float = cy
		_flame(Vector2(fx, fy + 6.0), 9.0, on)
		_ink(title, Vector2(fx + 10, fy + 6), str(streak), 15, fc, shade)


## THE STREAK'S FLAME: a smooth teardrop of fire in two layers (orange
## round a yellow heart) whose tip sways and flickers, with a soft glow under
## it while a streak runs; an outline of ash when there is none.
func _flame(base: Vector2, h: float, lit: bool) -> void:
	var sway: float = sin(_t * 7.0) * 0.12 + sin(_t * 11.3) * 0.06 if lit else 0.0
	var stretch: float = 1.0 + (sin(_t * 9.0) * 0.06 if lit else 0.0)
	var shape: Callable = func(scale_k: float) -> PackedVector2Array:
		var pts: PackedVector2Array = PackedVector2Array()
		for n: int in 25:
			var a: float = TAU * n / 24.0
			# A drop: round at the base, drawn up to a point that leans.
			var u: float = (1.0 - cos(a)) / 2.0
			var w: float = sin(a) * h * 0.52 * scale_k * pow(1.0 - u * 0.85, 0.9)
			var y: float = -u * h * 1.6 * scale_k * stretch
			pts.append(base + Vector2(w + y * sway * -0.6, y + h * 0.15 * scale_k))
		return pts
	if lit:
		for g: int in 4:
			draw_circle(base + Vector2(0, -h * 0.55), h * (0.7 + g * 0.3), Color(1.0, 0.55, 0.15, 0.035))
		draw_colored_polygon(shape.call(1.0), Color(0.98, 0.45, 0.14))
		draw_colored_polygon(shape.call(0.62), Color(1.0, 0.78, 0.25))
		draw_colored_polygon(shape.call(0.3), Color(1.0, 0.96, 0.7))
	else:
		var o: PackedVector2Array = shape.call(1.0)
		o.append(o[0])
		draw_polyline(o, Color(Kit.SEA_INK, 0.35), 1.2, true)


## Lettering on the water, in the one recipe (Kit.sea_string: the shade
## outline, then the words). shade's alpha scales the outline.
func _ink(f: Font, at: Vector2, t: String, px: int, col: Color, _shade: Color, max_w: float = -1.0) -> void:
	Kit.sea_string(self, f, at, t, px, col, HORIZONTAL_ALIGNMENT_LEFT, max_w)


## One box for every pool and pill, made once: the bar redraws every frame
## (the bead breathes), and draw_style_box takes the box's values as it is
## drawn, so it is only restyled between draws, not built anew.
static var _sb: StyleBoxFlat


static func _box() -> StyleBoxFlat:
	if _sb == null:
		_sb = StyleBoxFlat.new()
	return _sb


func _pill(r: Rect2, c: Color) -> void:
	var sb: StyleBoxFlat = _box()
	sb.bg_color = c
	sb.set_corner_radius_all(int(r.size.y / 2.0) + 1)
	sb.anti_aliasing = true
	draw_style_box(sb, r)
