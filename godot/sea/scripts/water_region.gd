class_name WaterRegion
extends Node3D

## A STRETCH OF SEA, not a marker.
##
## This is the correction that matters most in the whole map. A fishing zone is
## not a dot you tap — it is water you sail into, with a boundary you cross. You
## enter the Shallows the way you enter a room, and the sea changes under you.
##
## That is also what turns a level gate into something you can SEE. A locked
## region is walled off by weather you cannot push through, so the reason you
## cannot fish there is on screen rather than in a message. Same principle the
## raid map follows with previewWhenLocked: a goal you cannot see is a goal you
## have no reason to chase.

signal entered(route: String)

var data: Dictionary = {}
var locked: bool = false
var inside: bool = false

var _radius: float = 60.0
var _tint: Color = Color.WHITE
var _t: float = 0.0
var _tide: MeshInstance3D
var _wall: Node3D

func radius() -> float:
	return _radius

func setup(d: Dictionary, is_locked: bool) -> void:
	data = d
	locked = is_locked
	_radius = float(d.get("radius", 60.0))
	position = d["pos"]
	_tint = d.get("tint", Color.WHITE)

	# THE WATER ITSELF, tinted. Sits a hand's breadth above the sea plane so it
	# blends rather than z-fights, and it is what tells you the sea has changed
	# before any label does.
	_tide = MeshInstance3D.new()
	var disc := CylinderMesh.new()
	disc.top_radius = _radius
	disc.bottom_radius = _radius
	disc.height = 0.05
	disc.radial_segments = 48
	_tide.mesh = disc
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(_tint.r, _tint.g, _tint.b, 0.07 if not locked else 0.05)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true
	mat.emission = _tint
	mat.emission_energy_multiplier = 0.12
	mat.roughness = 0.25
	_tide.material_override = mat
	_tide.position.y = 0.06
	add_child(_tide)

	if locked:
		_build_wall()

## The weather that keeps you out. A ring of tall, dim columns reads as a squall
## line from a tilted camera and needs no art. It is deliberately not a fence:
## the point is that the sea is against you there, not that a designer said no.
func _build_wall() -> void:
	_wall = Node3D.new()
	add_child(_wall)
	var count := 34
	for i in range(count):
		var a := TAU * float(i) / float(count)
		var col := MeshInstance3D.new()
		var m := CylinderMesh.new()
		m.top_radius = 5.0
		m.bottom_radius = 8.0
		m.height = 26.0
		m.radial_segments = 6
		col.mesh = m
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.44, 0.47, 0.53, 0.30)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.roughness = 1.0
		col.material_override = mat
		col.position = Vector3(cos(a) * _radius, 11.0, sin(a) * _radius)
		_wall.add_child(col)

func _process(delta: float) -> void:
	_t += delta
	if _tide:
		var mat := _tide.material_override as StandardMaterial3D
		if mat:
			# Breathes, and breathes harder once you are in it, so the region
			# reads as alive water rather than a decal on the surface.
			var pulse := 0.5 + 0.5 * sin(_t * (1.6 if inside else 0.8))
			var base := 0.05 if locked else (0.10 if inside else 0.06)
			mat.albedo_color = Color(_tint.r, _tint.g, _tint.b, base + pulse * 0.025)
	if _wall:
		# The squall turns slowly. Weather that sits perfectly still reads as
		# scenery; weather that moves reads as something keeping you out.
		_wall.rotation.y += delta * 0.06

func contains(p: Vector3) -> bool:
	return Vector2(p.x - position.x, p.z - position.z).length() < _radius

func can_enter() -> bool:
	return inside and not locked

func enter() -> void:
	if can_enter():
		entered.emit(String(data.get("route", "")))
