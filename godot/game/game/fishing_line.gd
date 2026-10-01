class_name FishingLine
extends Node2D
## THE FISHING LINE, drawn live (Kong, 2026-10-01). It used to be painted into
## the captain's sheets, so it never moved; tools/setup.mjs now clears it from
## them and this draws it from the rod's tip, in the captain's own space (so
## it heels and bobs with her).
##
## Where the tip and the line's end are, per pose, was measured off the painted
## line before it was cleared: the same on every colour's sheet. Resting, it
## hangs, swaying a little, with a small hook at its end when no hook is worn.
## Casting, it flies out from the tip, whipping as it goes. Waiting, it runs
## down into the water. In a fight it runs to the fish (Skipper.line_target),
## taut and humming, or hangs in a slack curve (line_slack); snapped
## (line_snap_t), the two halves spring back and are gone.

const PTS: Dictionary = {
	"rest": [Vector2(172, 337), Vector2(165, 670)],
	"wait": [Vector2(158, 439), Vector2(153, 753)],
	"cast": [Vector2(531, 104), Vector2(147, 173)],
}
const INK: Color = Color(0.86, 0.88, 0.9, 0.78)
const WIDTH: float = 1.2

var skipper: Skipper


func _process(_delta: float) -> void:
	queue_redraw()


## A sheet point (in the base sheet's pixels) in the captain's space.
func _sheet(p: Vector2) -> Vector2:
	var skin: Variant = skipper._roles.get("skin")
	if skin == null or not is_instance_valid(skin):
		return Vector2.ZERO
	var s: Sprite2D = skin
	return s.transform * (p - s.texture.get_size() / 2.0)


func _draw() -> void:
	var frame: String = skipper.frame
	if not PTS.has(frame) or skipper._roles.get("skin") == null:
		return
	var tip: Vector2 = _sheet(PTS[frame][0])
	var end: Vector2 = _sheet(PTS[frame][1])
	var now: float = Time.get_ticks_msec() / 1000.0
	var t: float = now - skipper.frame_at
	if skipper.line_snap_t >= 0.0:
		_snapped(tip, end, now - skipper.line_snap_t)
		return
	match frame:
		"rest":
			end += Vector2(sin(now * 1.3 + skipper._phase) * 2.2, 0.0)
			_curve(tip, end, 3.0, 0.0, 0.0)
			if skipper.look.get("hook") == null:
				_hook(end)
		"cast":
			# Flying out from the tip, whipping, and settling into its arc.
			var u: float = clampf(t / 0.45, 0.0, 1.0)
			var e: float = 1.0 - pow(1.0 - u, 3.0)
			_curve(tip, tip.lerp(end, e), 10.0 * e, 9.0 * (1.0 - u), now * 26.0)
		_:
			if skipper.line_target != null:
				var to: Vector2 = to_local(skipper.line_target)
				var slack: float = skipper.line_slack
				# Taut, it hums; slack, it hangs.
				var hum: float = sin(now * 46.0) * 1.3 * (1.0 - slack)
				# Slack, it bows out sideways in a lazy loop as well as sagging.
				_curve(tip, to, 3.0 + slack * 22.0, hum + slack * 16.0 * sin(now * 3.0 + 1.0), slack * 2.0)
			else:
				_curve(tip, end, 5.0, 0.0, 0.0)


## A line from a to b, sagging by sag (down the screen), with a wave along it
## (amp, at phase) for a whip or a hum.
func _curve(a: Vector2, b: Vector2, sag: float, amp: float, phase: float) -> void:
	var pts: PackedVector2Array = PackedVector2Array()
	var n: int = 18
	var side: Vector2 = (b - a).orthogonal().normalized()
	for i: int in n + 1:
		var u: float = float(i) / n
		var p: Vector2 = a.lerp(b, u)
		p.y += sin(u * PI) * sag
		p += side * sin(u * PI) * sin(u * 9.0 - phase) * amp
		pts.append(p)
	draw_polyline(pts, INK, WIDTH, true)


## A small hook at the end of a hanging line (when none is worn).
func _hook(at: Vector2) -> void:
	var c: Color = Color(0.72, 0.75, 0.78, 0.9)
	draw_line(at, at + Vector2(0, 5), c, 1.1, true)
	draw_arc(at + Vector2(-2.2, 5), 2.2, 0.0, PI, 10, c, 1.1, true)
	draw_line(at + Vector2(-4.4, 5), at + Vector2(-4.4, 3.4), c, 1.1, true)


## Snapped: the near half springs back to the tip, the far half falls away.
func _snapped(tip: Vector2, end: Vector2, s: float) -> void:
	var k: float = clampf(s / 0.45, 0.0, 1.0)
	if k >= 1.0:
		return
	var to: Vector2 = to_local(skipper.line_target) if skipper.line_target != null else end
	var cut: Vector2 = tip.lerp(to, 0.55)
	var near: Vector2 = cut.lerp(tip, k)
	var c: Color = Color(INK, INK.a * (1.0 - k))
	var pts: PackedVector2Array = PackedVector2Array()
	for i: int in 9:
		var u: float = float(i) / 8.0
		var p: Vector2 = tip.lerp(near, u)
		p.y += sin(u * PI * 2.0 + k * 8.0) * 4.0 * (1.0 - k)
		pts.append(p)
	draw_polyline(pts, c, WIDTH, true)
	draw_line(cut.lerp(to, 0.2) + Vector2(0, 10.0 * k), to + Vector2(0, 16.0 * k), c, WIDTH, true)
