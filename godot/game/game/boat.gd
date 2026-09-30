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
var _sprite: Sprite2D
var _wake: GPUParticles2D
var _spray: GPUParticles2D
var lantern: PointLight2D


func _ready() -> void:
	_sprite = Sprite2D.new()
	_sprite.texture = load("res://art/fishing_rest.png")
	var s: float = SPRITE_W / float(_sprite.texture.get_width())
	_sprite.scale = Vector2(s, s / Chart.GROUND)
	_sprite.offset = Vector2(0, -110)
	_wake = _particles(70, 1.8, Color(0.92, 0.97, 1.0, 0.34), 26.0, 10.0)
	_spray = _particles(24, 0.6, Color(1.0, 1.0, 1.0, 0.5), 60.0, 6.0)
	add_child(_wake)
	add_child(_spray)
	add_child(_sprite)
	lantern = PointLight2D.new()
	lantern.texture = Glow.radial(256, Color(1.0, 0.78, 0.45))
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
	var shore: float = Chart.MAINLAND_R * 0.82 + 40.0
	if next.length() < shore:
		next = next.normalized() * shore
		velocity = Vector2.ZERO
	position = next
	var speed: float = velocity.length()
	if speed > 20.0:
		_sprite.flip_h = velocity.x > 0.0
	_wake.emitting = speed > 40.0
	_spray.emitting = speed > MAX_SPEED * 0.7
	var back: Vector2 = -velocity.normalized() if speed > 1.0 else Vector2.ZERO
	(_wake.process_material as ParticleProcessMaterial).direction = Vector3(back.x, back.y, 0)
	(_spray.process_material as ParticleProcessMaterial).direction = Vector3(-back.x, -back.y, 0)
	_spray.position = -back * 70.0


func set_pose(pose: String) -> void:
	_sprite.texture = load("res://art/fishing_%s.png" % pose)
