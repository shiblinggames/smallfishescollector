extends Node2D

## THE SEA — root of the hub scene.
##
## Owns three things and nothing else, because phase 1 is a movement test:
## reading taps, keeping the camera on the boat, and feeding the water shader
## the camera offset that makes a screen-sized rect behave like open ocean.
##
## Destinations, gating, docking and the bridge back to the web app are phase 2.
## The deliberate absence of them is what keeps this build honest: if sailing is
## not pleasant with nothing to sail to, adding somewhere to sail will not fix it.

@onready var boat: Boat = $World/Boat
@onready var cam: Camera2D = $World/Camera
@onready var water: ColorRect = $Background/Water
@onready var wake: CPUParticles2D = $World/Boat/Wake

## How hard the camera chases. Low enough to lag the boat slightly, which is
## what gives a sense of speed; high enough that it never feels dragged.
@export var cam_follow: float = 3.4
## The camera leads in the direction of travel, so you see where you are going
## rather than where you have been.
@export var cam_lead: float = 0.42

func _ready() -> void:
	cam.global_position = boat.global_position
	cam.make_current()

func _unhandled_input(event: InputEvent) -> void:
	# One handler for touch and mouse. In a browser Godot delivers taps as
	# InputEventScreenTouch on mobile and InputEventMouseButton on desktop, and
	# both need to work: the same build is tested on a phone and a laptop.
	if event is InputEventScreenTouch and event.pressed:
		_sail_to_screen(event.position)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_sail_to_screen(event.position)

func _sail_to_screen(screen_pos: Vector2) -> void:
	# Screen space to world space through the camera's transform, so a tap lands
	# where it looks like it landed at any zoom.
	var world := get_canvas_transform().affine_inverse() * screen_pos
	boat.sail_to(world)

func _process(delta: float) -> void:
	var lead: Vector2 = boat.velocity * cam_lead
	cam.global_position = cam.global_position.lerp(
		boat.global_position + lead,
		clamp(cam_follow * delta, 0.0, 1.0),
	)

	# The rect never moves; the noise samples somewhere else. That is the whole
	# trick behind an ocean with no texture and no seams.
	var mat := water.material as ShaderMaterial
	if mat:
		mat.set_shader_parameter("world_offset", cam.global_position)

	# Wake only while actually making way, or the boat sits at anchor trailing
	# foam like it is still under power.
	if wake:
		wake.emitting = boat.velocity.length() > 60.0
