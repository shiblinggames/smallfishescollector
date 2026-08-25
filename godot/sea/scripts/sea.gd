extends Node3D

## THE SEA — root of the hub scene, now in 3D.
##
## What changed and what did not: the rendering became 3D, the steering did not.
## The boat still lives on a flat plane at y = 0, so every distance and heading
## here is two numbers wearing a third. What 3D buys is perspective — waves
## compressing toward a horizon, land with height, a camera that looks ACROSS
## the sea rather than down at it. That is the whole of the 2.5D read.
##
## TAPS ARE RAYCASTS NOW. A screen point no longer maps to a world point on its
## own; it maps to a ray, and where that ray crosses y = 0 is what you meant.
##
## DOCKING IS TWO TAPS, deliberately. Tap to sail, tap again on arrival to go in.
## Auto-docking sounds friendlier and is worse: pass a port on the way somewhere
## else and the game takes you off the map.

@onready var boat: Boat = $World/Boat
@onready var cam: Camera3D = $World/Camera
@onready var water: MeshInstance3D = $World/Water
@onready var world: Node3D = $World
@onready var hud: Control = $UI/HUD

## Where the camera sits relative to the boat. The pitch this produces is the
## most important number in the scene: too steep and it is a top-down map again,
## too shallow and you cannot read the water ahead of you.
@export var cam_offset: Vector3 = Vector3(0.0, 58.0, 108.0)
## How hard the camera chases. Low enough to lag slightly, which is what gives a
## sense of speed; high enough that it never feels dragged.
@export var cam_follow: float = 3.0
## The camera leads in the direction of travel, so you see where you are going
## rather than where you have been.
@export var cam_lead: float = 0.16

## Fishing level, for gating. The app passes the real one in at load; this is the
## standalone-in-the-editor default, set high so the whole map is reachable while
## it is being laid out.
var fishing_level: int = 100

var _ports: Array[Port] = []
var _waters: Array[WaterRegion] = []
var _near_port: Port = null
var _in_water: WaterRegion = null

func _ready() -> void:
	_spawn()
	cam.global_position = boat.global_position + cam_offset
	cam.look_at(boat.global_position, Vector3.UP)

func _spawn() -> void:
	for d in Destinations.PORTS:
		var p := Port.new()
		p.setup(d, int(d.get("min_level", 0)) > fishing_level)
		p.entered.connect(_on_entered)
		world.add_child(p)
		_ports.append(p)
	for d in Destinations.WATERS:
		var w := WaterRegion.new()
		w.setup(d, int(d.get("min_level", 0)) > fishing_level)
		w.entered.connect(_on_entered)
		world.add_child(w)
		_waters.append(w)

func _on_entered(route: String) -> void:
	Bridge.dock(route)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed:
		_tap(event.position)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_tap(event.position)

func _tap(screen_pos: Vector2) -> void:
	var hit = _ray_to_sea(screen_pos)
	if hit == null:
		return
	var target: Vector3 = hit

	# Tapping the port you are already alongside is the second half of the dock.
	# Checked first, or the tap would just re-issue a course to where you are.
	if _near_port and _near_port.can_enter() and target.distance_to(_near_port.global_position) < _near_port.dock_range():
		_near_port.enter()
		return

	# Same for a region you are already sitting in: tap inside it again to fish.
	if _in_water and _in_water.can_enter() and _in_water.contains(target):
		_in_water.enter()
		return

	# Tapping ON a port courses for its EDGE, so you pull alongside rather than
	# trying to sail into a hill.
	for p in _ports:
		if target.distance_to(p.global_position) < p.dock_range():
			var toward: Vector3 = (boat.global_position - p.global_position).normalized()
			boat.sail_to(p.global_position + toward * (p.dock_range() * 0.86))
			return

	boat.sail_to(target)

## Screen point to the place on the water it means. A tap is a ray now, and the
## answer is where that ray crosses y = 0.
func _ray_to_sea(screen_pos: Vector2):
	var from: Vector3 = cam.project_ray_origin(screen_pos)
	var dir: Vector3 = cam.project_ray_normal(screen_pos)
	# Pointing along or above the horizon: there is no sea to hit.
	if dir.y > -0.0001:
		return null
	var t: float = -from.y / dir.y
	if t <= 0.0:
		return null
	return from + dir * t

func _process(delta: float) -> void:
	var lead: Vector3 = boat.velocity * cam_lead
	var want: Vector3 = boat.global_position + lead + cam_offset
	cam.global_position = cam.global_position.lerp(want, clamp(cam_follow * delta, 0.0, 1.0))
	cam.look_at(boat.global_position + lead, Vector3.UP)

	# The sea plane rides with the camera. It is finite; keeping it centred under
	# the view means you can never sail to its edge and find out.
	water.global_position = Vector3(cam.global_position.x, 0.0, cam.global_position.z)

	_update_proximity()
	hud.queue_redraw()

func _update_proximity() -> void:
	var here: Vector3 = boat.global_position

	var closest: Port = null
	var best: float = INF
	for p in _ports:
		var d: float = here.distance_to(p.global_position)
		p.in_range = d < p.dock_range()
		if p.in_range and d < best:
			best = d
			closest = p
	_near_port = closest

	var inside: WaterRegion = null
	for w in _waters:
		w.inside = w.contains(here)
		if w.inside:
			inside = w
	_in_water = inside

## Everything the HUD needs, so the overlay never reaches into the world.
func hud_state() -> Dictionary:
	var out: Array = []
	var vp: Vector2 = get_viewport().get_visible_rect().size

	var all: Array = []
	for p in _ports:
		all.append(p)
	for w in _waters:
		all.append(w)

	for node in all:
		var behind: bool = cam.is_position_behind(node.global_position)
		var screen: Vector2 = cam.unproject_position(node.global_position)
		out.append({
			"name": String(node.data.get("name", "")),
			"tint": node.data.get("tint", Color.WHITE),
			"locked": node.locked,
			"min_level": int(node.data.get("min_level", 0)),
			"screen": screen,
			"behind": behind,
			"onscreen": (not behind) and Rect2(Vector2.ZERO, vp).grow(-40.0).has_point(screen),
			"dist": Vector2(
				node.global_position.x - boat.global_position.x,
				node.global_position.z - boat.global_position.z,
			).length(),
		})

	var near_name = null
	var near_level := 0
	var can_enter := false
	var verb := "enter"
	if _near_port:
		near_name = String(_near_port.data.get("name", ""))
		near_level = int(_near_port.data.get("min_level", 0))
		can_enter = _near_port.can_enter()
		verb = "dock at"
	elif _in_water:
		near_name = String(_in_water.data.get("name", ""))
		near_level = int(_in_water.data.get("min_level", 0))
		can_enter = _in_water.can_enter()
		verb = "fish"

	return {
		"places": out,
		"near": near_name,
		"near_level": near_level,
		"can_enter": can_enter,
		"verb": verb,
	}
