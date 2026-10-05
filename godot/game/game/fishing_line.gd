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
const WIDTH: float = 0.55

var skipper: Skipper


## THE LINE IS A ROPE (Kong, 2026-10-01: the drawn curve still moved
## wrongly). A chain of points simulated in the world (verlet, under gravity,
## held to its length), so it swings with the boat, trails behind the hook in
## flight, sags, pulls taut and falls slack on its own. The rod's tip holds
## one end. The other: at rest it hangs free with the hook's weight; in the
## cast it rides the thrown hook; waiting, it is held where the line runs into
## the water; in a fight, on the fish. The chain lives on the Skipper, so it
## carries on through a change of pose (which rebuilds this node).
const NODES: int = 20
const GRAVITY: float = 900.0


func _process(delta: float) -> void:
	_step(clampf(delta, 0.0, 1.0 / 30.0))
	queue_redraw()


## A sheet point (in the base sheet's pixels) in the captain's space.
func _sheet(p: Vector2) -> Vector2:
	var skin: Variant = skipper._roles.get("skin")
	if skin == null or not is_instance_valid(skin):
		return Vector2.ZERO
	var sp: Sprite2D = skin
	return sp.transform * (p - sp.texture.get_size() / 2.0)


## Where each end is this frame (global), how long the line is, and whether
## the far end is held (else it hangs free).
func _ends() -> Dictionary:
	var frame: String = skipper.frame
	var tip: Vector2 = to_global(_sheet(PTS[frame][0]))
	var now: float = skipper.line_clock
	var t: float = now - skipper.frame_at
	match frame:
		"rest":
			var rest_end: Vector2 = to_global(_sheet(PTS["rest"][1]))
			# Reeled up: the hook is drawn in to where it hangs over half a
			# second, held all the way, and only then let go, so it does not
			# fly about when the line comes out of the water.
			if skipper.line_from != null and t < 0.5:
				var k: float = t / 0.5
				k = k * k * (3.0 - 2.0 * k)
				var held_at: Vector2 = (skipper.line_from as Vector2).lerp(rest_end, k)
				return { "tip": tip, "len": tip.distance_to(held_at) * 1.02, "held": held_at }
			# ON A SOFT LEASH, not free (Kong, 2026-10-02: hanging free it
			# flailed like a ragdoll as she sailed): held where it hangs, let
			# trail a little behind her way (smoothed) and sway gently.
			var sway: Vector2 = Vector2(sin(now * 1.3) * 1.6, sin(now * 0.9 + 1.0) * 0.6) * absf(global_scale.x)
			var held_rest: Vector2 = rest_end + _trail + sway
			return { "tip": tip, "len": tip.distance_to(held_rest) * 1.03, "held": held_rest }
		"cast":
			var water: Vector2 = to_global(skipper.sheet_point("wait", PTS["wait"][1]))
			var start: Vector2 = skipper.line_from if skipper.line_from != null else tip
			var u: float = clampf(t / 0.55, 0.0, 1.0)
			var e: float = 1.0 - pow(1.0 - u, 2.2)
			var high: Vector2 = tip + Vector2((water.x - tip.x) * 0.9, -95.0 * absf(global_scale.y))
			var at: Vector2 = start.lerp(high, e).lerp(high.lerp(water, e), e)
			return { "tip": tip, "len": maxf(tip.distance_to(at), tip.distance_to(water)) * 1.06, "held": at }
		_:
			if skipper.line_target != null:
				var to: Vector2 = skipper.line_target
				return { "tip": tip, "len": tip.distance_to(to) * (1.01 + 0.4 * skipper.line_slack), "held": to }
			var end: Vector2 = to_global(_sheet(PTS["wait"][1]))
			if skipper.line_dip_t >= 0.0:
				var d: float = (now - skipper.line_dip_t) / 0.24
				if d >= 0.0 and d < 1.0:
					end.y += sin(d * PI) * 6.0 * absf(global_scale.y)
			return { "tip": tip, "len": tip.distance_to(end) * 1.04, "held": end }


## How far the resting hook trails behind her way: her rod tip's speed,
## smoothed hard, turned into a backward lean (and a little lift), capped.
var _trail: Vector2 = Vector2.ZERO
var _tip_last: Vector2 = Vector2.INF
var _vel: Vector2 = Vector2.ZERO


func _follow(dt: float) -> void:
	if skipper == null or skipper._roles.get("skin") == null or dt <= 0.0:
		return
	var tip: Vector2 = to_global(_sheet(PTS[skipper.frame][0]))
	if _tip_last != Vector2.INF and tip.distance_to(_tip_last) < 120.0 * absf(global_scale.x):
		_vel = _vel.lerp((tip - _tip_last) / dt, 1.0 - exp(-dt * 2.5))
	_tip_last = tip
	# Under way the hook swings well back behind her (Kong, 2026-10-05: the
	# hooks "look weird as you're sailing", hanging out ahead of the bow), and
	# lifts a little as the line is pulled back; still smoothed, never loose.
	var lean: Vector2 = -_vel * 0.075
	var cap: float = 40.0 * absf(global_scale.x)
	if lean.length() > cap:
		lean = lean.normalized() * cap
	lean.y -= absf(lean.x) * 0.3
	_trail = _trail.lerp(lean, 1.0 - exp(-dt * 3.0))


func _step(dt: float) -> void:
	if skipper == null or not PTS.has(skipper.frame) or skipper._roles.get("skin") == null:
		return
	if skipper.line_snap_t >= 0.0:
		return
	_follow(dt)
	var e: Dictionary = _ends()
	var tip: Vector2 = e["tip"]
	var pts: PackedVector2Array = skipper.line_pts
	var prev: PackedVector2Array = skipper.line_prev
	# A jump (a teleport, a recall, a new captain): start the rope again in
	# place rather than drag it across the sea.
	if pts.size() == NODES and pts[0].distance_to(tip) > 120.0 * absf(global_scale.x):
		pts = PackedVector2Array()
	if pts.size() != NODES:
		pts.resize(NODES)
		prev.resize(NODES)
		var far: Vector2 = e["held"] if e["held"] != null else tip + Vector2(0, float(e["len"]))
		for n: int in NODES:
			pts[n] = tip.lerp(far, float(n) / (NODES - 1))
			prev[n] = pts[n]
	var seg: float = float(e["len"]) / (NODES - 1)
	var g: Vector2 = Vector2(0, GRAVITY * absf(global_scale.y))
	# Move: carry on as last frame (damped), and fall.
	for n: int in range(1, NODES):
		# Damped harder while the far end is held, so slack settles fast.
		var v: Vector2 = (pts[n] - prev[n]) * (0.86 if e["held"] != null else 0.96)
		prev[n] = pts[n]
		var weight: float = 2.2 if n == NODES - 1 else 1.0
		pts[n] = pts[n] + v + g * weight * dt * dt
	# Hold to length, pinning the ends.
	for it: int in 14:
		pts[0] = tip
		if e["held"] != null:
			pts[NODES - 1] = e["held"]
		for n: int in range(NODES - 1):
			var a: Vector2 = pts[n]
			var b: Vector2 = pts[n + 1]
			var dv: Vector2 = b - a
			var dl: float = dv.length()
			if dl < 0.0001 or dl <= seg:
				continue
			var fix: Vector2 = dv * ((dl - seg) / dl)
			var a_pinned: bool = n == 0
			var b_pinned: bool = n + 1 == NODES - 1 and e["held"] != null
			if a_pinned and not b_pinned:
				pts[n + 1] = b - fix
			elif b_pinned and not a_pinned:
				pts[n] = a + fix
			elif not a_pinned and not b_pinned:
				pts[n] = a + fix * 0.5
				pts[n + 1] = b - fix * 0.5
	skipper.line_pts = pts
	skipper.line_prev = prev
	skipper.line_end_prev = pts[NODES - 1]
	skipper.line_end_ok = true


func _draw() -> void:
	if skipper == null or not PTS.has(skipper.frame) or skipper._roles.get("skin") == null:
		return
	var now: float = skipper.line_clock
	var tip_l: Vector2 = _sheet(PTS[skipper.frame][0])
	if skipper.line_snap_t >= 0.0:
		_snapped(tip_l, to_local(skipper.line_end_prev), now - skipper.line_snap_t)
		return
	var pts: PackedVector2Array = skipper.line_pts
	if pts.size() != NODES:
		return
	var local: PackedVector2Array = PackedVector2Array()
	for n: int in NODES:
		local.append(to_local(pts[n]))
	# On the water it is a hair; in a small portrait it has to be drawn
	# thicker or it vanishes when the picture is shrunk.
	draw_polyline(local, INK, WIDTH if skipper.water else 1.4 * maxf(1.0, skipper.box_scale), true)
	_last_dir = (local[NODES - 1] - local[NODES - 2]).normalized()
	# The hook: on show at rest and in flight; under the water otherwise.
	if skipper.frame != "wait":
		_hook(local[NODES - 1], _last_dir)


## The hook, on the end of the line, hanging along it. The worn hook's own art
## (every tier's sheet has the hook in the same place: cut out here, at the
## size the old placement drew it), or a small drawn one when none is worn.
const HOOK_REGION: Rect2 = Rect2(244, 366, 37, 75)
## The eye: the hole at the top of the hook picture, where the line ties on.
const HOOK_EYE: Vector2 = Vector2(28.5, 7.0)
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
