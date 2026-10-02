class_name ReelFight
extends Node2D
## THE FIGHT (Kong, 2026-10-01: "make the reel feel really good; it's the core
## mechanic"). What used to be a still pause between the press and the catch
## card: the fish is played in, on the water, in the same time.
##
## The line is live (game/fishing_line.gd), so it runs to the fish: from where
## the line went in, the fish's shadow is drawn in toward the boat under the
## surface, thrashing against a taut, humming line, the water boiling over
## it, the rod nodding, the reel ratcheting. A PERFECT: the fish breaks the
## surface in a short leap beside the boat, the line following it up, and
## drops back in a splash. A CATCH: it comes up under the hull in a splash.
## A MISS: the line goes limp and the shadow darts away into the deep. A
## SNAG: the line parts with a crack and both halves spring away.
##
## Presentation only: the result was decided by the press, and the rules run
## after it as before.

signal done

var boat: Boat
var result: String = "catch"
var fish_art: Texture2D
var crate: bool = false
var length_s: float = 0.62

var _t: float = 0.0
var _at: Vector2
var _to: Vector2
var _shadow: Sprite2D
var _leaper: Sprite2D
var _boil_t: float = 0.0
var _rod_rot: float = 0.0
var _rod_seen: Sprite2D
var _sc: float = 1.0


func _ready() -> void:
	z_index = 3
	_at = boat.hook_at()
	# In under the rod, just off the hull.
	_to = boat.position + Vector2((_at.x - boat.position.x) * 0.35, 38.0)
	_shadow = Sprite2D.new()
	_shadow.texture = fish_art
	if fish_art != null:
		_sc = 64.0 / float(fish_art.get_width())
	_shadow.scale = Vector2(_sc, _sc) * 0.8
	_shadow.modulate = Color(0.02, 0.06, 0.08, 0.35)
	_shadow.position = _at
	# Under the surface (the sea's under-water layer refracts it).
	if boat.field != null:
		boat.field.under_world.add_child(_shadow)
	else:
		add_child(_shadow)
	var sk: Skipper = boat.skipper
	sk.line_target = _global(_at)
	match result:
		"penalty":
			Sound.snap()
			sk.line_snap_t = sk.line_clock
			if boat.field != null:
				boat.field.ring(_at, 90.0, 0.8, 0.8)
		"miss":
			Sound.slack()
		_:
			Sound.reel_clicks(length_s * 0.85)
	if boat.field != null:
		boat.field.ring(_at, 70.0, 1.1, 0.6)


func _global(world: Vector2) -> Vector2:
	return boat.get_parent().to_global(world)


func _exit_tree() -> void:
	if _shadow != null and is_instance_valid(_shadow):
		_shadow.queue_free()
	if _rod_seen != null and is_instance_valid(_rod_seen):
		_rod_seen.rotation = _rod_rot


## The rod nods with each pull (looked up afresh: a pose change rebuilds her).
func _nod(amount: float) -> void:
	var rod: Variant = boat.skipper._roles.get("rod")
	if rod == null or not is_instance_valid(rod):
		return
	if rod != _rod_seen:
		_rod_seen = rod
		_rod_rot = (rod as Sprite2D).rotation
	(rod as Sprite2D).rotation = _rod_rot + amount


func _process(delta: float) -> void:
	_t += delta
	var k: float = clampf(_t / maxf(0.05, length_s), 0.0, 1.0)
	var sk: Skipper = boat.skipper
	match result:
		"perfect", "catch":
			# Drawn in: slow against the pull at first, then coming, twisting.
			var e: float = k * k * (3.0 - 2.0 * k)
			var side: Vector2 = (_to - _from_dir()).orthogonal().normalized()
			# It pulls side to side against the line, slowly enough to read.
			var wob: Vector2 = side * sin(_t * 6.5) * 11.0 * (1.0 - e)
			var fish: Vector2 = _at.lerp(_to, e * 0.85) + wob
			if _leaper == null:
				_shadow.position = fish
				var dir: Vector2 = (_to - _at).normalized() + side * cos(_t * 6.5) * 0.5
				_shadow.flip_h = dir.x < 0.0
				_shadow.rotation = (dir.angle() + PI if dir.x < 0.0 else dir.angle()) * 0.6
				_shadow.scale = Vector2(_sc, _sc) * (0.8 + 0.3 * e)
				_shadow.modulate.a = 0.35 + 0.3 * e
				sk.line_target = _global(fish)
				sk.line_slack = 0.0
			else:
				sk.line_target = _leaper.global_position
			_boil_t -= delta
			if _boil_t <= 0.0 and boat.field != null and _leaper == null:
				_boil_t = 0.08
				boat.field.ring(fish, 18.0 + 12.0 * e, 0.6, 0.4 + 0.2 * e)
			_nod(sin(_t * 6.5) * 0.02 * (1.0 - e) - 0.04 * (1.0 - e))
			if result == "perfect" and k > 0.55 and _leaper == null:
				_leap(fish)
		"miss":
			# Limp, and gone: the shadow darts off away from the boat.
			var away: Vector2 = (_at - boat.position).normalized()
			_shadow.position = _at + away * 240.0 * k * k
			_shadow.flip_h = away.x < 0.0
			_shadow.modulate.a = 0.35 * (1.0 - k)
			sk.line_slack = minf(1.0, k * 2.5)
		_:
			# Snapped: the rod springs, the shadow sinks away.
			_nod(-0.08 * (1.0 - k) * sin(_t * 30.0))
			_shadow.modulate.a = 0.3 * (1.0 - minf(1.0, k * 3.0))
	if k >= 1.0:
		if result == "catch":
			boat.splash(false, _shadow.position)
		done.emit()
		queue_free()


func _from_dir() -> Vector2:
	return _at


## A perfect: it breaks the surface in a short leap and drops back, with a
## splash going out and coming down; the line follows it up.
func _leap(at: Vector2) -> void:
	boat.splash(true, at)
	_shadow.visible = false
	_leaper = Sprite2D.new()
	if crate or fish_art == null:
		_leaper.position = at
		add_child(_leaper)
		return
	_leaper.texture = fish_art
	var holder: Node2D = Node2D.new()
	holder.position = at
	holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	add_child(holder)
	_leaper.scale = Vector2(_sc, _sc) * 1.1
	var dirx: float = -1.0 if (at.x - boat.position.x) < 0.0 else 1.0
	_leaper.flip_h = dirx < 0.0
	holder.add_child(_leaper)
	var hop: float = length_s * 0.42
	var tw: Tween = create_tween()
	tw.tween_method(func(u: float) -> void:
		_leaper.position = Vector2(dirx * 30.0 * u, -sin(u * PI) * 78.0)
		_leaper.rotation = (-0.75 + 1.5 * u) * dirx, 0.0, 1.0, hop)
	tw.tween_callback(func() -> void:
		boat.splash(true, at + Vector2(dirx * 30.0, 0.0))
		_leaper.visible = false)
