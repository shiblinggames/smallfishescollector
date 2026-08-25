extends Node2D

## THE SEA — root of the hub scene.
##
## Reads taps, keeps the camera on the boat, feeds the water shader the camera
## offset that makes a screen-sized rect behave like open ocean, and — as of
## phase 2 — owns the destinations, the docking rule, and the pointers that stop
## you getting lost in featureless water.
##
## DOCKING IS TWO TAPS, DELIBERATELY. Tap a place to sail to it; tap again once
## you have arrived to go in. Auto-docking on arrival sounds friendlier and is
## worse: pass near the Market on your way somewhere else and the game yanks you
## off the map. Arriving somewhere should never be a decision you did not make.

@onready var boat: Boat = $World/Boat
@onready var cam: Camera2D = $World/Camera
@onready var water: ColorRect = $Background/Water
@onready var wake: CPUParticles2D = $World/Boat/Wake
@onready var world: Node2D = $World
@onready var hud: Control = $UI/HUD

## How hard the camera chases. Low enough to lag the boat slightly, which is
## what gives a sense of speed; high enough that it never feels dragged.
@export var cam_follow: float = 3.4
## The camera leads in the direction of travel, so you see where you are going
## rather than where you have been.
@export var cam_lead: float = 0.42

## Fishing level, for gating. The app will pass the real one in at load in phase
## 3; this is the standalone-in-the-editor default, set high so the whole map is
## reachable while it is being laid out.
var fishing_level: int = 100

var _places: Array[Destination] = []
var _near: Destination = null

func _ready() -> void:
	cam.global_position = boat.global_position
	cam.make_current()
	_spawn_places()

func _spawn_places() -> void:
	for d in Destinations.LIST:
		var place := Destination.new()
		place.setup(d, int(d.get("min_level", 0)) > fishing_level)
		place.entered.connect(_on_entered)
		world.add_child(place)
		# Behind the boat, so sailing over a place never hides you.
		world.move_child(place, 0)
		_places.append(place)

func _on_entered(route: String) -> void:
	Bridge.dock(route)

func _unhandled_input(event: InputEvent) -> void:
	# One handler for touch and mouse. In a browser Godot delivers taps as
	# InputEventScreenTouch on mobile and InputEventMouseButton on desktop, and
	# both need to work: the same build is tested on a phone and a laptop.
	if event is InputEventScreenTouch and event.pressed:
		_tap(event.position)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_tap(event.position)

func _tap(screen_pos: Vector2) -> void:
	# Screen space to world space through the camera's transform, so a tap lands
	# where it looks like it landed at any zoom.
	var target: Vector2 = get_canvas_transform().affine_inverse() * screen_pos

	# Tapping the place you are already alongside is the second half of the dock.
	# Checked first, or it would just re-issue a course to where you already are.
	if _near and _near.can_enter() and target.distance_to(_near.global_position) < Destination.DOCK_RANGE:
		_near.enter()
		return

	# Tapping ON a place sets a course for its EDGE rather than its centre, so
	# you pull alongside instead of trying to park inside the island.
	for p in _places:
		if target.distance_to(p.global_position) < Destination.RADIUS * 1.3:
			var toward: Vector2 = (boat.global_position - p.global_position).normalized()
			boat.sail_to(p.global_position + toward * (Destination.RADIUS * 1.55))
			return

	boat.sail_to(target)

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

	_update_proximity()
	hud.queue_redraw()

func _update_proximity() -> void:
	var closest: Destination = null
	var best: float = Destination.DOCK_RANGE
	for p in _places:
		var d: float = boat.global_position.distance_to(p.global_position)
		p.in_range = d < Destination.DOCK_RANGE
		if p.in_range and d < best:
			best = d
			closest = p
	_near = closest

## Everything the HUD needs, so the overlay does not reach into the world.
func hud_state() -> Dictionary:
	var out: Array = []
	var vp: Vector2 = get_viewport_rect().size
	for p in _places:
		var screen: Vector2 = get_canvas_transform() * p.global_position
		out.append({
			"name": String(p.data.get("name", "")),
			"tint": p.data.get("tint", Color.WHITE),
			"locked": p.locked,
			"min_level": int(p.data.get("min_level", 0)),
			"screen": screen,
			"onscreen": Rect2(Vector2.ZERO, vp).grow(-40.0).has_point(screen),
			"dist": boat.global_position.distance_to(p.global_position),
		})
	return {
		"places": out,
		"near": null if _near == null else String(_near.data.get("name", "")),
		"near_locked": _near != null and _near.locked,
		"near_level": 0 if _near == null else int(_near.data.get("min_level", 0)),
		"can_enter": _near != null and _near.can_enter(),
	}
