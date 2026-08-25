class_name Boat
extends Node3D

## THE BOAT, now on a water plane rather than a screen.
##
## Same feel as the 2D version and the same five numbers, moved from pixels to
## metres and from Vector2 to the XZ plane. Y is up and the boat never leaves
## y = 0, so all the steering maths stays two-dimensional; only the rendering
## became 3D.
##
## Tap where you want to go and it sails there. Not drag-to-steer: steering
## wants a stick, a stick wants a thumb parked on the glass, and a thumb parked
## on the glass covers a third of a phone screen.

## Top speed, metres/sec. Sets how big the map may be more than any other number
## here: the longest crossing anyone tolerates is about ten seconds.
@export var max_speed: float = 30.0
## How hard it accelerates toward top speed. Low is heavy.
@export var accel: float = 2.2
## Radians/sec the hull can turn through. Deliberately slow: a boat that spins
## instantly to face a tap feels like a mouse pointer.
@export var turn_rate: float = 2.6
## Inside this, it is arrived. Bigger than you would think, or the boat fidgets
## on the spot hunting an exact point.
@export var arrive_radius: float = 1.6
## Where it starts easing off. The gap between this and arrive_radius is the
## whole feeling of a boat coasting into a berth.
@export var slow_radius: float = 11.0
## How far the hull rides on the swell. Cosmetic, and the cheapest thing in the
## scene that makes the water read as having a surface.
@export var bob_height: float = 0.16

var target: Vector3 = Vector3.ZERO
var velocity: Vector3 = Vector3.ZERO
var _heading: float = 0.0
var _t: float = 0.0

signal arrived(where: Vector3)

func _ready() -> void:
	target = global_position
	_heading = rotation.y

func sail_to(point: Vector3) -> void:
	# Flattened: a tap resolves against the water plane, and the boat has no
	# business anywhere but on it.
	target = Vector3(point.x, 0.0, point.z)

func _physics_process(delta: float) -> void:
	_t += delta
	var here := Vector3(global_position.x, 0.0, global_position.z)
	var to_target := target - here
	var dist := to_target.length()

	# Desired speed, eased down inside the slow radius. Smoothstep rather than
	# linear so the last stretch is a long glide instead of a ramp.
	var want := 0.0
	if dist > arrive_radius:
		var tt: float = clamp((dist - arrive_radius) / (slow_radius - arrive_radius), 0.0, 1.0)
		want = max_speed * (tt * tt * (3.0 - 2.0 * tt))

	var desired: Vector3 = to_target.normalized() * want if dist > 0.001 else Vector3.ZERO
	# Momentum. The boat does not get the velocity it wants, it gets closer to it.
	velocity = velocity.lerp(desired, clamp(accel * delta, 0.0, 1.0))
	var next := here + velocity * delta

	# HEADING follows the velocity, not the target, so a boat still carrying way
	# from the last leg swings round properly instead of snapping to a new tap.
	if velocity.length() > 0.7:
		# atan2(x, z) rather than the usual (z, x): Godot forward is -Z, so this
		# is the angle that puts the bow along the direction of travel.
		var want_heading := atan2(velocity.x, velocity.z)
		_heading = rotate_toward(_heading, want_heading, turn_rate * delta)

	# Two out-of-phase waves so the bob never reads as a metronome, plus a roll.
	var bob := sin(_t * 1.7) * 0.6 + sin(_t * 2.6 + 1.1) * 0.4
	global_position = Vector3(next.x, bob * bob_height, next.z)
	rotation = Vector3(
		sin(_t * 2.1) * 0.02,
		_heading,
		sin(_t * 1.4 + 0.7) * 0.035 - clamp(_turn_error() * 0.35, -0.16, 0.16),
	)

	if dist <= arrive_radius and velocity.length() < 1.4:
		arrived.emit(global_position)

## How far the hull is off the way it is actually moving. Drives the heel into a
## turn, so lean is a consequence of turning rather than an animation played at it.
func _turn_error() -> float:
	if velocity.length() < 0.7:
		return 0.0
	return angle_difference(_heading, atan2(velocity.x, velocity.z))
