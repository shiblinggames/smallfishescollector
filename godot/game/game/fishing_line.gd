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
const INK: Color = Color(0.58, 0.61, 0.63, 0.6)
const WIDTH: float = 0.75

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
	var now: float = skipper.line_clock
	var t: float = now - skipper.frame_at
	if skipper.line_snap_t >= 0.0:
		_snapped(tip, end, now - skipper.line_snap_t)
		return
	# Coming into a pose, the end eases from wherever it was (a fight, a
	# cast, the water) to the pose's own place, so the line never jumps.
	var from: Variant = skipper.line_from
	var ease_in: float = clampf(t / 0.32, 0.0, 1.0)
	ease_in = ease_in * ease_in * (3.0 - 2.0 * ease_in)
	match frame:
		"rest":
			end += Vector2(sin(now * 1.3 + skipper._phase) * 2.2, 0.0)
			if from != null and ease_in < 1.0:
				end = (from as Vector2).lerp(end, ease_in)
			_curve(tip, end, 3.0, 0.0, 0.0)
			_hook(end, _last_dir)
			_remember(end)
		"cast":
			# THE CAST: the hook flies out from where it hung in a high arc
			# and comes down exactly where the line will run into the water
			# once she is waiting, so the cast and the wait are one movement.
			var water: Vector2 = skipper.sheet_point("wait", PTS["wait"][1])
			var start: Vector2 = from if from != null else tip
			var u: float = clampf(t / 0.55, 0.0, 1.0)
			# Thrown: quick off the rod, slowing as it falls (ease out), up
			# over the tip and out, along a curve through a point high above
			# and beyond the tip.
			var e: float = 1.0 - pow(1.0 - u, 2.2)
			var high: Vector2 = tip + Vector2((water.x - tip.x) * 0.9, -95.0)
			var at: Vector2 = start.lerp(high, e).lerp(high.lerp(water, e), e)
			_curve(tip, at, 4.0 + 10.0 * u, 8.0 * (1.0 - u), now * 24.0)
			_hook(at, _last_dir)
			_remember(at)
		_:
			if skipper.line_target != null:
				var to: Vector2 = to_local(skipper.line_target)
				_remember(to)
				var slack: float = skipper.line_slack
				# Taut, it hums; slack, it hangs.
				var hum: float = sin(now * 46.0) * 1.3 * (1.0 - slack)
				# Slack, it bows out sideways in a lazy loop as well as sagging.
				_curve(tip, to, 3.0 + slack * 22.0, hum + slack * 16.0 * sin(now * 3.0 + 1.0), slack * 2.0)
			else:
				if from != null and ease_in < 1.0:
					end = (from as Vector2).lerp(end, ease_in)
				_curve(tip, end, 5.0, 0.0, 0.0)
				_remember(end)


func _remember(at: Vector2) -> void:
	skipper.line_end_prev = at
	skipper.line_end_ok = true


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
	# Which way the line runs at its end, for the hook to hang along it.
	_last_dir = (pts[n] - pts[n - 1]).normalized() if n > 0 else Vector2.DOWN


## The hook, on the end of the line, hanging along it. The worn hook's own art
## (every tier's sheet has the hook in the same place: cut out here, at the
## size the old placement drew it), or a small drawn one when none is worn.
const HOOK_REGION: Rect2 = Rect2(244, 366, 37, 75)
const HOOK_EYE: Vector2 = Vector2(18.5, 6.0)
const HOOK_SCALE: float = 0.224
static var _hooks: Dictionary = {}
var _last_dir: Vector2 = Vector2.DOWN


func _hook(at: Vector2, dir: Vector2) -> void:
	var rot: float = dir.angle() - PI / 2.0
	var url: Variant = skipper.look.get("hook")
	if url != null:
		if not _hooks.has(url):
			var src: Texture2D = Skipper.tex(url)
			var a: AtlasTexture = null
			if src != null:
				a = AtlasTexture.new()
				a.atlas = src
				a.region = HOOK_REGION
			_hooks[url] = a
		var tex: Texture2D = _hooks[url]
		if tex != null:
			draw_set_transform(at, rot, Vector2(HOOK_SCALE, HOOK_SCALE))
			draw_texture(tex, -HOOK_EYE)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			return
	var c: Color = Color(0.72, 0.75, 0.78, 0.9)
	draw_set_transform(at, rot, Vector2.ONE)
	draw_line(Vector2.ZERO, Vector2(0, 5), c, 1.1, true)
	draw_arc(Vector2(-2.2, 5), 2.2, 0.0, PI, 10, c, 1.1, true)
	draw_line(Vector2(-4.4, 5), Vector2(-4.4, 3.4), c, 1.1, true)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


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
