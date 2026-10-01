class_name Boat
extends Node2D
## THE CAPTAIN'S BOAT ON THE CHART (Godot port, stage 1).
##
## Lives in the World node, which squashes the plane by Chart.GROUND; the
## sprite is counter-squashed because a boat stands up out of the water. Sail
## by clicking where to go, or steer with the keys or a stick.
##
## SAILING IS THE WEB'S (SeaMap.tsx): the boat has a HEADING. The bow comes
## round toward where you point at the rudder's rate (faster from a standstill),
## she picks up along the heading at the rig's rate, sideways drift bleeds off
## (grip), and on a long straight run at speed she reaches full sail. The
## Shipyard's ladders (hull, rudder, rig) and the boat's trim set the numbers:
## top speed SPEED x hull x boat speed; turn TURN x rudder x boat agility;
## pick-up ACCEL x rig x boat agility.
##
## Her wake is laid by the sea's Wake layer (game/wake.gd) from `wake_contact`;
## the lantern is a 2D light that comes up with the dark.

const SPEED: float = 300.0
const ACCEL: float = 2.6
const TURN: float = 2.4
const GRIP: float = 6.0
const FULL_SAIL: float = 1.15
const FULL_SAIL_AFTER: float = 2.5
const ARRIVE: float = 26.0
const SLOW: float = 240.0
const SPRITE_W: float = 210.0
## The fastest any boat goes (the wake and spray scale against it).
const MAX_SPEED: float = SPEED * 1.75 * 1.15

## What she is fitted with (set_fit): hull, rudder and rig multipliers, and the
## boat's own speed and agility from its grade and trim.
var hull: float = 1.0
var rudder: float = 1.0
var rig: float = 1.0
var boat_speed: float = 1.0
var agility: float = 1.0
var lantern_glow: float = 0.34
var heading: float = PI / 2.0
var _straight_t: float = 0.0
var _full: bool = false
var _sail_mom: float = 1.0
var _last_heading: float = PI / 2.0

var velocity: Vector2 = Vector2.ZERO
var target: Variant = null
var locked: bool = false
var skipper: Skipper
var _facing: float = -1.0
var lantern: PointLight2D
## The sea's disturbance (set by the sea): casts, bobbers and splashes ring it.
var field: SeaField
var _bob_t: float = 0.0


func _ready() -> void:
	skipper = Skipper.new()
	skipper.water = true
	skipper.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	add_child(skipper)
	lantern = PointLight2D.new()
	lantern.texture = Glow.radial(256, Color(1.0, 0.78, 0.45), true)
	lantern.texture_scale = 2.2
	lantern.color = Color(1.0, 0.8, 0.55)
	lantern.energy = 0.0
	lantern.position = Vector2(-20, -60)
	add_child(lantern)


## The Shipyard's refits and the boat's trim, from a profile.
func set_fit(p: Dictionary) -> void:
	hull = Shipyard.effect("hull_speed_tier", Js.num(p.get("hull_speed_tier")))
	rudder = Shipyard.effect("hull_handling_tier", Js.num(p.get("hull_handling_tier")))
	rig = Shipyard.effect("hull_accel_tier", Js.num(p.get("hull_accel_tier")))
	lantern_glow = Shipyard.effect("lantern_tier", Js.num(p.get("lantern_tier")))
	var b: Dictionary = Skipper._find("boats", p.get("equipped_boat"))
	var grade: float = float(b.get("grade", 1.0))
	var trim: float = float(b.get("trim", 0.0))
	boat_speed = grade * (1.0 + trim)
	agility = grade * (1.0 - trim)


func steer(input: Vector2, delta: float) -> void:
	var top: float = SPEED * hull * boat_speed
	var order: Variant = null
	var want: float = 0.0
	if not locked:
		if input.length() > 0.1:
			target = null
			order = input.angle()
			want = top * minf(1.0, input.length()) * _sail_mom
		elif target != null:
			var to: Vector2 = (target as Vector2) - position
			var d: float = to.length()
			if d < ARRIVE:
				target = null
			else:
				order = to.angle()
				var t: float = clampf((d - ARRIVE) / (SLOW - ARRIVE), 0.0, 1.0)
				want = top * t * t * (3.0 - 2.0 * t) * _sail_mom
	# The bow comes round toward the order, faster from a standstill.
	var spd: float = velocity.length()
	if order != null:
		var stopped: float = 1.0 - minf(1.0, spd / (SPEED * 0.35))
		var max_turn: float = TURN * rudder * agility * (1.0 + stopped * 2.5) * delta
		heading += clampf(wrapf(float(order) - heading, -PI, PI), -max_turn, max_turn)
	# Along the heading she picks up toward the speed she wants; across it the
	# drift bleeds off.
	var h: Vector2 = Vector2.from_angle(heading)
	var n: Vector2 = h.orthogonal()
	var fwd: float = velocity.dot(h)
	var lat: float = velocity.dot(n)
	var align: float = maxf(0.0, 0.5 + 0.5 * cos(heading - float(order))) if order != null else 0.0
	var kf: float = 1.0 - exp(-ACCEL * rig * agility * delta)
	fwd += (want * align - fwd) * kf
	lat *= exp(-GRIP * delta)
	velocity = h * fwd + n * lat
	# Full sail: a long straight run at speed fills her out a little more.
	var turning: float = absf(wrapf(heading - _last_heading, -PI, PI)) / maxf(delta, 0.0001)
	_last_heading = heading
	if fwd > 0.75 * top and turning < 0.5:
		_straight_t += delta
	else:
		_straight_t = maxf(0.0, _straight_t - delta * 4.0)
	if _straight_t > (2.0 if _full else FULL_SAIL_AFTER):
		_full = true
	elif _straight_t <= 0.0:
		_full = false
	_sail_mom = move_toward(_sail_mom, FULL_SAIL if _full else 1.0, delta * 3.0 * (FULL_SAIL - 1.0))
	var next: Vector2 = position + velocity * delta
	# Every island's shore stops the hull.
	var off: Dictionary = Chart.off_shore(next)
	if off["hit"]:
		next = off["at"]
		velocity *= 0.2
	position = next
	var speed: float = velocity.length()
	lantern.texture_scale = 0.9 + 3.6 * lantern_glow
	if speed > 20.0 and absf(velocity.x) > 8.0:
		_facing = 1.0 if velocity.x > 0.0 else -1.0
		skipper.scale.x = -_facing


## Where her wake starts (SeaMap.tsx): the cutwater, 40px toward the bow and
## 21px down the sprite, and under the keel (34px down) for the rings at rest.
## Force is the share of her speed, nothing under 26px/s.
const BOW_X: float = (0.308 - 0.5) * SPRITE_W
const BOW_DOWN: float = (0.599 - 0.5) * SPRITE_W
const KEEL_Y: float = 34.0


func wake_contact() -> Dictionary:
	var speed: float = velocity.length()
	var web_facing: float = signf(skipper.scale.x)
	return {
		"id": "me", "x": position.x + web_facing * BOW_X - 1.0, "y": position.y + BOW_DOWN / Chart.GROUND,
		"cx": position.x - 1.0, "cy": position.y + KEEL_Y / Chart.GROUND,
		"ang": atan2(velocity.y, velocity.x) if speed > 1.0 else heading,
		"force": minf(1.0, speed / (SPEED * 0.9)) if speed > 26.0 else 0.0, "scale": 1.0,
	}


## The same for anyone else on the water, from where they are and which way
## they face; the wake reads their speed and heading off their movement.
static func contact_for(id: String, at: Vector2, sk: Skipper) -> Dictionary:
	var f: float = signf(sk.scale.x) if sk != null else 1.0
	return {
		"id": id, "x": at.x + f * BOW_X - 1.0, "y": at.y + BOW_DOWN / Chart.GROUND,
		"cx": at.x - 1.0, "cy": at.y + KEEL_Y / Chart.GROUND, "scale": 1.0,
	}


func facing() -> float:
	return _facing


func set_pose(pose: String) -> void:
	if pose == "wait" and skipper.frame != "wait" and field != null:
		# The line lands: a ring where it went in.
		field.ring(hook_at(), 150.0, 1.7, 0.9)
		_bob_t = 0.0
	skipper.set_frame(pose)


## Where the line meets the water while she waits (the sheet's painted ring:
## 155 x 760 of the 900 x 800 sheet), on the plane.
func hook_at() -> Vector2:
	var x: float = -105.0 - 16.8 + 155.0 / 900.0 * 210.0
	var y: float = -93.3 - 48.5 + 760.0 / 800.0 * 186.7
	return position + Vector2(x * signf(skipper.scale.x), y / Chart.GROUND)


func _process(delta: float) -> void:
	# The bobber, twitching now and then while she waits.
	if field != null and skipper.frame == "wait":
		_bob_t -= delta
		if _bob_t <= 0.0:
			_bob_t = randf_range(1.3, 2.4)
			field.ring(hook_at(), 70.0, 1.3, 0.45)


func set_look(look: Dictionary) -> void:
	skipper.set_look(look)


## THE CATCH SPLASH in front of the bow (app/(app)/sea/seaSplash.ts): droplets
## thrown up and falling back, a ring spreading on the water; bigger, and
## part gold, on a perfect.
func splash(perfect: bool) -> void:
	var facing: float = _facing
	var at: Vector2 = Vector2(facing * 150.0, 70.0)
	var p: GPUParticles2D = GPUParticles2D.new()
	p.one_shot = true
	p.explosiveness = 1.0
	p.amount = 34 if perfect else 22
	p.lifetime = 0.78
	p.local_coords = false
	p.texture = Glow.radial(16, Color.WHITE)
	var m: ParticleProcessMaterial = ParticleProcessMaterial.new()
	m.direction = Vector3(0, -1, 0)
	m.spread = 55.0
	m.initial_velocity_min = 160.0 * (1.25 if perfect else 1.0)
	m.initial_velocity_max = 320.0 * (1.25 if perfect else 1.0)
	m.gravity = Vector3(0, 620.0 / Chart.GROUND, 0)
	m.scale_min = 0.25
	m.scale_max = 0.5
	m.lifetime_randomness = 0.45
	var g: Gradient = Gradient.new()
	g.set_color(0, Color("#fde68a") if perfect else Color(0.9, 0.97, 1.0))
	g.set_color(1, Color(0.9, 0.97, 1.0, 0.0))
	var ramp: GradientTexture1D = GradientTexture1D.new()
	ramp.gradient = g
	m.color_ramp = ramp
	p.process_material = m
	p.position = at
	add_child(p)
	p.emitting = true
	if field != null:
		field.ring(position + at, 240.0 if perfect else 170.0, 1.9, 1.0)
	var ring: Ripple = Ripple.new()
	ring.position = at
	ring.grow = 150.0 if perfect else 110.0
	ring.life = 0.7 if perfect else 0.52
	add_child(ring)
	get_tree().create_timer(1.2).timeout.connect(p.queue_free)


## A ring spreading on the water (drawn on the squashed plane, so an ellipse).
class Ripple:
	extends Node2D
	var grow: float = 110.0
	var life: float = 0.52
	var t: float = 0.0

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var age: float = t / life
		draw_arc(Vector2.ZERO, 26.0 + age * grow, 0.0, TAU, 64, Color(1, 1, 1, (1.0 - age) * 0.5), 3.0, true)
