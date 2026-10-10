class_name Course
extends Node
## A COURSE SET ON THE CHART (Godot, 2026-10-01): GPS for the sea. Owned by
## the Sea; set from the world chart (or anywhere) with set_to(), it plans a
## route with SeaRoute and then, every frame:
##   - draws it on the water ahead of her (CourseLine): soft dashes flowing
##     toward the destination, and a mark breathing on the water there;
##   - the compass ribbon marks it when it is off screen, with how long at her
##     speed (game/compass_ribbon.gd; the HUD's course chip says the same);
##   - follows her: waypoints she has passed drop off; stray more than a
##     cable's length off it and it plans again ("Recalculating");
##   - on AUTOPILOT, sails it for her (a point a little way along the route,
##     always ahead); a hand on the helm (keys, a click) takes it back;
##   - says so when she arrives, and clears.

signal changed

var sea: Node
var boat: Boat
var hud: FishingHud
var path: PackedVector2Array = PackedVector2Array()
var dest: Vector2 = Vector2.ZERO
var label: String = ""
var autopilot: bool = false
var _check_t: float = 0.0


func active() -> bool:
	return not path.is_empty()


func set_to(at: Vector2, name: String, sail: bool = false) -> bool:
	# Plotting a course and sailing it are Fishing skills (port rules).
	var xp: float = Js.num((sea as Sea).session.profile().get("fishing_xp"))
	var no_gps: String = Rules.skill_block(xp, "set_course")
	if no_gps != "":
		hud.toast(no_gps)
		return false
	if sail and Rules.skill_block(xp, "autopilot") != "":
		hud.toast(Rules.skill_block(xp, "autopilot") + ". The course is set; sail it by hand.")
		sail = false
	var p: PackedVector2Array = SeaRoute.plan(boat.position, at)
	if p.size() < 2:
		hud.toast("There is no way through to there")
		return false
	path = p
	dest = p[p.size() - 1]
	label = name
	autopilot = sail
	Rumble.tap(10)
	changed.emit()
	return true


func clear() -> void:
	if autopilot:
		boat.target = null
	path = PackedVector2Array()
	autopilot = false
	changed.emit()


func toggle_autopilot() -> void:
	var no_auto: String = Rules.skill_block(Js.num((sea as Sea).session.profile().get("fishing_xp")), "autopilot")
	if no_auto != "" and not autopilot:
		hud.toast(no_auto)
		return
	autopilot = not autopilot and active()
	if not autopilot:
		boat.target = null
	changed.emit()


## Her hand on the helm: the course stays, the autopilot lets go.
func helm_taken() -> void:
	if autopilot:
		autopilot = false
		changed.emit()


func remaining() -> float:
	if path.size() < 2:
		return 0.0
	var n: float = boat.position.distance_to(path[1])
	for k: int in range(2, path.size()):
		n += path[k - 1].distance_to(path[k])
	return n


## Seconds to go at her cruising speed.
func eta() -> float:
	var v: float = Boat.SPEED * boat.hull * boat.boat_speed * 0.92
	return remaining() / maxf(v, 1.0)


static func eta_text(s: float) -> String:
	if s < 60.0:
		return "%ds" % int(ceil(s))
	return "%dm %02ds" % [int(s / 60.0), int(fmod(s, 60.0))]


func step(delta: float) -> void:
	if not active():
		return
	var at: Vector2 = boat.position
	path[0] = at
	# Arrived.
	if at.distance_to(dest) < 220.0:
		hud.toast("Arrived: %s" % label)
		Rumble.buzz([0, 20, 40, 30])
		if autopilot:
			boat.target = null
		path = PackedVector2Array()
		autopilot = false
		changed.emit()
		return
	# Drop the waypoints she has reached, or passed by on her way.
	while path.size() > 2 and (at.distance_to(path[1]) < 200.0 or _past(at, path[1], path[2])):
		path.remove_at(1)
	# Strayed: plan again.
	_check_t += delta
	if _check_t > 0.75:
		_check_t = 0.0
		if _off_course(at) > 450.0:
			var p: PackedVector2Array = SeaRoute.plan(at, dest)
			if p.size() >= 2:
				path = p
				hud.toast("Recalculating")
	if autopilot:
		boat.target = _ahead(at, 320.0)


func _past(at: Vector2, a: Vector2, b: Vector2) -> bool:
	return (at - a).dot(b - a) > 0.0 and SeaRoute._clear_line(at, b)


func _off_course(at: Vector2) -> float:
	var best: float = INF
	for k: int in range(1, path.size()):
		best = minf(best, Geometry2D.get_closest_point_to_segment(at, path[k - 1], path[k]).distance_to(at))
	return best


## A point `d` along the course from her.
func _ahead(at: Vector2, d: float) -> Vector2:
	var left: float = d
	var from: Vector2 = at
	for k: int in range(1, path.size()):
		var seg: float = from.distance_to(path[k])
		if seg >= left:
			return from.move_toward(path[k], left)
		left -= seg
		from = path[k]
	return path[path.size() - 1]


## THE COURSE ON THE WATER: soft dashes of light from her bow flowing toward
## the destination, and the destination's mark breathing on the water.
class CourseLine:
	extends Node2D
	var course: Course
	var _t: float = 0.0

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		if course == null or not course.active():
			return
		var p: PackedVector2Array = course.path
		var col: Color = Color(1.0, 0.92, 0.72)
		# Dashes every 70px, flowing toward the destination.
		var phase: float = fmod(_t * 90.0, 70.0)
		var walked: float = 0.0
		var shown: float = 0.0
		for k: int in range(1, p.size()):
			var a: Vector2 = p[k - 1]
			var b: Vector2 = p[k]
			var seg: float = a.distance_to(b)
			var dir: Vector2 = (b - a) / maxf(seg, 0.001)
			var s: float = fposmod(phase - walked, 70.0)
			while s < seg and shown < 9000.0:
				var d0: Vector2 = a + dir * s
				var d1: Vector2 = a + dir * minf(s + 30.0, seg)
				# Fades in from the bow and out toward the far distance.
				var at: float = walked + s
				var fade: float = clampf(at / 160.0, 0.0, 1.0) * (1.0 - smoothstep(6000.0, 9000.0, at))
				draw_line(d0, d1, Color(col, 0.10 * fade), 16.0, true)
				draw_line(d0, d1, Color(col, 0.55 * fade), 5.0, true)
				s += 70.0
			walked += seg
			shown = walked
		# The destination: rings breathing out on the water.
		var dst: Vector2 = course.dest
		for i: int in 3:
			var u: float = fmod(_t * 0.45 + i / 3.0, 1.0)
			draw_arc(dst, 40.0 + u * 150.0, 0.0, TAU, 64, Color(col, (1.0 - u) * 0.45), 4.0, true)
		draw_circle(dst, 22.0, Color(col, 0.35 + 0.15 * sin(_t * 3.0)))
