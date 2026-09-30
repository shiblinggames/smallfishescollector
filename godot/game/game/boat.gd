class_name Boat
extends Node2D
## THE CAPTAIN'S BOAT ON THE CHART (Godot port, stage 1).
##
## Lives in the World node, which squashes the plane by Chart.GROUND; the
## sprite is counter-squashed because a boat stands up out of the water. Sail
## by clicking where to go, or steer with the keys or a stick. Acceleration is
## 1 - e^(-k dt), frame-rate independent, as on the web.
##
## The wake and the bow spray are GPU particles left on the water behind it
## (subtle, local); the lantern is a 2D light that comes up with the dark.

const MAX_SPEED: float = 480.0
const ACCEL_K: float = 3.2
const ARRIVE: float = 24.0
const SPRITE_W: float = 210.0

var velocity: Vector2 = Vector2.ZERO
var target: Variant = null
var locked: bool = false
var skipper: Skipper
var _facing: float = -1.0
var _wake: GPUParticles2D
var _spray: GPUParticles2D
var lantern: PointLight2D


func _ready() -> void:
	skipper = Skipper.new()
	skipper.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	_wake = _particles(70, 1.8, Color(0.92, 0.97, 1.0, 0.34), 26.0, 10.0)
	_spray = _particles(24, 0.6, Color(1.0, 1.0, 1.0, 0.5), 60.0, 6.0)
	add_child(_wake)
	add_child(_spray)
	add_child(skipper)
	lantern = PointLight2D.new()
	lantern.texture = Glow.radial(256, Color(1.0, 0.78, 0.45), true)
	lantern.texture_scale = 2.2
	lantern.color = Color(1.0, 0.8, 0.55)
	lantern.energy = 0.0
	lantern.position = Vector2(-20, -60)
	add_child(lantern)


func _particles(amount: int, life: float, col: Color, speed: float, px: float) -> GPUParticles2D:
	var p: GPUParticles2D = GPUParticles2D.new()
	p.amount = amount
	p.lifetime = life
	p.local_coords = false
	p.emitting = false
	p.texture = Glow.radial(32, Color.WHITE)
	var m: ParticleProcessMaterial = ParticleProcessMaterial.new()
	m.gravity = Vector3.ZERO
	m.initial_velocity_min = speed * 0.4
	m.initial_velocity_max = speed
	m.spread = 60.0
	m.scale_min = px / 32.0
	m.scale_max = px / 16.0
	var fade: Gradient = Gradient.new()
	fade.set_color(0, col)
	fade.set_color(1, Color(col, 0.0))
	var ramp: GradientTexture1D = GradientTexture1D.new()
	ramp.gradient = fade
	m.color_ramp = ramp
	p.process_material = m
	return p


func steer(input: Vector2, delta: float) -> void:
	var want: Vector2 = Vector2.ZERO
	if not locked:
		if input.length() > 0.1:
			target = null
			want = input.normalized() * MAX_SPEED * minf(1.0, input.length())
		elif target != null:
			var to: Vector2 = (target as Vector2) - position
			if to.length() < ARRIVE:
				target = null
			else:
				want = to.normalized() * MAX_SPEED * clampf(to.length() / 260.0, 0.25, 1.0)
	velocity = velocity.lerp(want, 1.0 - exp(-ACCEL_K * delta))
	var next: Vector2 = position + velocity * delta
	# The Mainland's shore stops the hull.
	var shore: float = Chart.MAINLAND_R * Chart.SHORE + Chart.HULL
	if next.length() < shore:
		next = next.normalized() * shore
		velocity = Vector2.ZERO
	position = next
	var speed: float = velocity.length()
	if speed > 20.0 and absf(velocity.x) > 8.0:
		_facing = 1.0 if velocity.x > 0.0 else -1.0
		skipper.scale.x = -_facing
	_wake.emitting = speed > 40.0
	_spray.emitting = speed > MAX_SPEED * 0.7
	var back: Vector2 = -velocity.normalized() if speed > 1.0 else Vector2.ZERO
	(_wake.process_material as ParticleProcessMaterial).direction = Vector3(back.x, back.y, 0)
	(_spray.process_material as ParticleProcessMaterial).direction = Vector3(-back.x, -back.y, 0)
	_spray.position = -back * 70.0


func facing() -> float:
	return _facing


func set_pose(pose: String) -> void:
	skipper.set_frame(pose)


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
