class_name Dial
extends Control
## THE CATCH DIAL (Godot port, stage 1).
##
## The zones are web/app/(app)/fishing/depths.ts buildFishZones, rotated to a
## random place each bite (as the chart's dial does); the needle sweeps at a
## speed rolled once per bite from the fish's difficulty and the reel.
##
## THE LOCK-IN. On the web the needle ran on the compositor, ahead of the main
## thread, and freezing "where you saw it" needed a forward prediction (see
## docs/systems/fishing.md). Here the needle is drawn by the same frame that
## reads the press, so strike() freezes it at exactly the angle on screen, and
## that angle is the one scored. It never moves back, and gold means "press now
## and it is a perfect", because the paint and the score read the same number.

signal struck(result: String, angle: float)

const CATCH_CENTER: float = 97.5
const CATCH_BONUS_PER_TIER: float = 3.0
const COLORS: Dictionary = {
	"miss": Color("#64748b"), "catch": Color("#4ade80"), "perfect": Color("#fde68a"), "penalty": Color("#f87171"),
}
const GOLD: Color = Color("#fbcc4a")

var zones: Array = []
var zone_rot: float = 0.0
var angle: float = 0.0
var sweep: float = 0.0
var spinning: bool = false
var frozen_on: String = ""
var _flash: float = 0.0


## buildFishZones: the arcs for one bite, in degrees clockwise from the top.
static func build_zones(difficulty: float, hook_tier: float, line_penalty: float, zone_catch_mult: float, level_bonus: float, perfect_bonus: float) -> Array:
	var d: int = clampi(int(difficulty), 1, 5) - 1
	var base_catch: float = [77.0, 62.0, 46.0, 32.0, 20.0][d]
	var base_snag: float = [18.0, 26.0, 36.0, 48.0, 58.0][d]
	var gap_right: float = [28.0, 14.0, 5.0, 0.0, 0.0][d]
	var gap_left: float = [0.0, 0.0, 5.0, 0.0, 0.0][d]
	var catch_deg: float = maxf(10.0, Js.round((base_catch + clampf(hook_tier, 0.0, 8.0) * CATCH_BONUS_PER_TIER + level_bonus) * zone_catch_mult))
	var perfect_deg: float = maxf(5.0, 5.0 + perfect_bonus)
	var snag_deg: float = Js.round(base_snag * line_penalty)
	var left: float = gap_left if d >= 2 else -1.0
	var catch_start: float = CATCH_CENTER - catch_deg / 2.0
	var catch_end: float = CATCH_CENTER + catch_deg / 2.0
	var perf_start: float = CATCH_CENTER - perfect_deg / 2.0
	var perf_end: float = CATCH_CENTER + perfect_deg / 2.0
	var out: Array = []
	if left >= 0:
		var left_end: float = catch_start - left
		var left_start: float = maxf(0.0, left_end - snag_deg)
		if left_start > 0:
			out.append([0.0, left_start, "miss"])
		out.append([left_start, left_end, "penalty"])
		out.append([left_end, catch_start, "miss"])
	else:
		out.append([0.0, catch_start, "miss"])
	out.append([catch_start, perf_start, "catch"])
	out.append([perf_start, perf_end, "perfect"])
	out.append([perf_end, catch_end, "catch"])
	var right_start: float = catch_end + gap_right
	var right_end: float = right_start + snag_deg
	out.append([catch_end, right_start, "miss"])
	out.append([right_start, right_end, "penalty"])
	if right_end < 360.0:
		out.append([right_end, 360.0, "miss"])
	return out


func begin(new_zones: Array, new_sweep: float) -> void:
	zones = new_zones
	sweep = new_sweep
	zone_rot = floor(randf() * 360.0)
	angle = randf() * 360.0
	frozen_on = ""
	spinning = true
	queue_redraw()


## The zone under an angle.
func zone_at(at: float) -> String:
	var rot_at: float = fposmod(at - zone_rot, 360.0)
	for z: Array in zones:
		if rot_at >= float(z[0]) and rot_at < float(z[1]):
			return z[2]
	return "miss"


## Freeze where the needle is drawn and say what it landed on.
func strike() -> void:
	if not spinning:
		return
	spinning = false
	frozen_on = zone_at(angle)
	if frozen_on == "perfect":
		_flash = 1.0
	queue_redraw()
	struck.emit(frozen_on, angle)


## Second Wind: spin again from somewhere new.
func respin() -> void:
	zone_rot = floor(randf() * 360.0)
	angle = randf() * 360.0
	frozen_on = ""
	spinning = true
	queue_redraw()


func _process(delta: float) -> void:
	if spinning:
		angle = fposmod(angle + sweep * delta, 360.0)
		queue_redraw()
	if _flash > 0.0:
		_flash = maxf(0.0, _flash - delta * 1.4)
		queue_redraw()


func _ang(deg: float) -> float:
	return deg_to_rad(deg - 90.0)


func _draw() -> void:
	var c: Vector2 = size / 2.0
	var r_out: float = minf(size.x, size.y) * 0.44
	var r_in: float = r_out * 0.69
	var mid: float = (r_out + r_in) / 2.0
	var width: float = r_out - r_in
	# The plate under the ring.
	draw_circle(c, r_out + 10.0, Color(0.05, 0.09, 0.13, 0.92))
	draw_arc(c, r_out + 10.0, 0.0, TAU, 96, Color(0.94, 0.75, 0.25, 0.35), 2.0, true)
	for z: Array in zones:
		var a0: float = float(z[0]) + zone_rot + 0.5
		var a1: float = float(z[1]) + zone_rot - 0.5
		if a1 <= a0:
			continue
		var col: Color = COLORS[z[2]]
		if z[2] == "miss":
			col.a = 0.55
		draw_arc(c, mid, _ang(a0), _ang(a1), maxi(4, int((a1 - a0) / 3.0)), col, width, true)
	# The needle: the colour of what it is over, gold over a perfect.
	var under: String = frozen_on if frozen_on != "" else zone_at(angle)
	var needle: Color = Color(0.94, 0.93, 0.91)
	if under == "perfect":
		needle = GOLD
	elif under == "catch":
		needle = Color("#bbf7d0")
	elif under == "penalty":
		needle = Color("#fecaca")
	var tip: Vector2 = c + Vector2.from_angle(_ang(angle)) * (r_in - 8.0)
	if _flash > 0.0:
		draw_circle(tip, 16.0 + 30.0 * (1.0 - _flash), Color(GOLD, 0.35 * _flash))
	draw_line(c, tip, needle, 4.0, true)
	draw_circle(tip, 7.0, needle)
	draw_circle(c, 8.0, Color(0.94, 0.75, 0.25))
