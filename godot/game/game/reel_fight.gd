class_name ReelFight
extends Node2D
## THE FIGHT (Kong, 2026-10-01: "make the reel feel really good; it's the core
## mechanic"). What used to be a still pause between the press and the catch
## card: the fish is played in, on the water, in the same time.
##
## It all happens where the line goes in (the boat keeps her waiting pose,
## line in the water, until it is over; the line is painted into her sheet).
## Under the surface the fish's shadow thrashes against the line and rises,
## darker and larger as it comes up, the water boiling over it; the rod nods
## with each pull, and the reel ratchets. A PERFECT: it breaks the surface in
## a short leap and drops back in a splash. A CATCH: it comes up in a splash.
## A MISS: the line goes slack and the shadow darts away into the deep. A
## SNAG: the line parts with a crack.
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
var _shadow: Sprite2D
var _leaper: Sprite2D
var _boil_t: float = 0.0
var _rod_rot: float = 0.0
var _rod_seen: Sprite2D
var _sc: float = 1.0


func _ready() -> void:
	z_index = 3
	_at = boat.hook_at()
	# The shadow, under the surface (the sea's under-water layer refracts it).
	_shadow = Sprite2D.new()
	_shadow.texture = fish_art
	if fish_art != null:
		_sc = 64.0 / float(fish_art.get_width())
	_shadow.scale = Vector2(_sc, _sc) * 0.8
	_shadow.modulate = Color(0.02, 0.06, 0.08, 0.3)
	_shadow.position = _at
	if boat.field != null:
		boat.field.under_world.add_child(_shadow)
	else:
		add_child(_shadow)
	match result:
		"penalty":
			Sound.snap()
			if boat.field != null:
				boat.field.ring(_at, 90.0, 0.8, 0.8)
		"miss":
			Sound.slack()
		_:
			Sound.reel_clicks(length_s * 0.85)
	if boat.field != null:
		boat.field.ring(_at, 120.0, 1.2, 0.7)


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
	match result:
		"perfect", "catch":
			# It fights: circling tight under the line, rising as it comes.
			var rise: float = k * k * (3.0 - 2.0 * k)
			var wob: Vector2 = Vector2(cos(_t * 15.0), sin(_t * 19.0) * 0.6) * 18.0 * (1.0 - rise * 0.6)
			_shadow.position = _at + wob
			_shadow.rotation = sin(_t * 15.0) * 0.6
			_shadow.flip_h = cos(_t * 15.0) < 0.0
			_shadow.scale = Vector2(_sc, _sc) * (0.8 + 0.35 * rise)
			_shadow.modulate.a = 0.3 + 0.35 * rise
			_boil_t -= delta
			if _boil_t <= 0.0 and boat.field != null:
				_boil_t = 0.08
				boat.field.ring(_at + wob, 34.0 + 20.0 * rise, 0.7, 0.4 + 0.3 * rise)
			_nod(sin(_t * 15.0) * 0.025 * (1.0 - rise) - 0.03 * (1.0 - rise))
			if result == "perfect" and k > 0.58 and _leaper == null:
				_leap()
		"miss":
			# Slack, and gone: the shadow darts off away from the boat.
			var away: Vector2 = (_at - boat.position).normalized()
			_shadow.position = _at + away * 240.0 * k * k
			_shadow.flip_h = away.x < 0.0
			_shadow.modulate.a = 0.35 * (1.0 - k)
		_:
			# Snapped: the rod springs back, the shadow sinks away.
			_nod(-0.08 * (1.0 - k) * sin(_t * 30.0))
			_shadow.modulate.a = 0.3 * (1.0 - minf(1.0, k * 3.0))
	if k >= 1.0:
		if result == "catch":
			boat.splash(false, _at)
		done.emit()
		queue_free()


## A perfect: it breaks the surface in a short leap and drops back, with a
## splash going out and coming down.
func _leap() -> void:
	boat.splash(true, _at)
	if crate or fish_art == null:
		_leaper = Sprite2D.new()
		return
	_shadow.visible = false
	_leaper = Sprite2D.new()
	_leaper.texture = fish_art
	var holder: Node2D = Node2D.new()
	holder.position = _at
	holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	add_child(holder)
	_leaper.scale = Vector2(_sc, _sc) * 1.1
	var dirx: float = -1.0 if (_at.x - boat.position.x) < 0.0 else 1.0
	_leaper.flip_h = dirx < 0.0
	holder.add_child(_leaper)
	var hop: float = length_s * 0.42
	var tw: Tween = create_tween()
	tw.tween_method(func(u: float) -> void:
		_leaper.position = Vector2(dirx * 30.0 * u, -sin(u * PI) * 78.0)
		_leaper.rotation = (-0.75 + 1.5 * u) * dirx, 0.0, 1.0, hop)
	tw.tween_callback(func() -> void:
		boat.splash(true, _at + Vector2(dirx * 30.0, 0.0))
		holder.queue_free())
