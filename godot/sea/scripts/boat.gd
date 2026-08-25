class_name Boat
extends Node2D

## THE BOAT.
##
## Tap where you want to go and it sails there. Not drag-to-steer, which is the
## other obvious choice and is worse on touch: steering wants a stick, a stick
## wants a thumb parked on the glass, and a thumb parked on the glass covers a
## third of a phone screen. Tap-to-move keeps the hand off the map.
##
## The feel lives in three numbers below. A boat is heavy, so it should take a
## moment to get going, lean as it turns, and coast when you let it arrive. If
## it stops dead on the target it reads as a cursor rather than a hull.

## Top speed, px/sec. Sets how big the map is allowed to be more than any other
## number here: the longest crossing anyone tolerates is roughly ten seconds.
@export var max_speed: float = 520.0
## How hard it accelerates toward top speed. Low is heavy.
@export var accel: float = 2.2
## Radians/sec the hull can turn through. Deliberately slow: a boat that spins
## instantly to face a tap feels like a mouse pointer.
@export var turn_rate: float = 2.6
## Inside this, it is arrived. Bigger than you would think, or the boat fidgets
## on the spot hunting an exact pixel.
@export var arrive_radius: float = 26.0
## Where it starts easing off. The gap between this and arrive_radius is the
## whole feeling of a boat coasting into a berth.
@export var slow_radius: float = 180.0

var target: Vector2
var velocity: Vector2 = Vector2.ZERO
var _heading: float = 0.0

signal arrived(where: Vector2)

func _ready() -> void:
	target = global_position
	_heading = rotation

func sail_to(point: Vector2) -> void:
	target = point

func _physics_process(delta: float) -> void:
	var to_target := target - global_position
	var dist := to_target.length()

	# DESIRED SPEED, eased down inside the slow radius. Squared falloff rather
	# than linear so the last stretch is a long glide instead of a ramp.
	var want := 0.0
	if dist > arrive_radius:
		var t: float = clamp((dist - arrive_radius) / (slow_radius - arrive_radius), 0.0, 1.0)
		want = max_speed * (t * t * (3.0 - 2.0 * t))

	var desired := to_target.normalized() * want if dist > 0.001 else Vector2.ZERO
	# Momentum. The boat does not get the velocity it wants, it gets closer to it.
	velocity = velocity.lerp(desired, clamp(accel * delta, 0.0, 1.0))
	global_position += velocity * delta

	# HEADING follows the velocity, not the target, so a boat still carrying way
	# from the last leg swings round properly instead of snapping to the new tap.
	if velocity.length() > 12.0:
		var want_heading := velocity.angle()
		_heading = rotate_toward(_heading, want_heading, turn_rate * delta)
		rotation = _heading

	# Lean into the turn. Small: it is a boat, not a motorbike.
	var turn_delta := angle_difference(rotation, velocity.angle()) if velocity.length() > 12.0 else 0.0
	skew = lerp(skew, clamp(-turn_delta * 0.16, -0.08, 0.08), clamp(6.0 * delta, 0.0, 1.0))

	if dist <= arrive_radius and velocity.length() < 24.0:
		arrived.emit(global_position)
