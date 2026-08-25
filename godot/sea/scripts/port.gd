class_name Port
extends Node3D

## LAND YOU DOCK AT.
##
## Built from primitives rather than art, same reasoning as everything else at
## this stage: a good island model would flatter the answer to "does sailing
## somewhere feel right", which is the only question this build is asking.
##
## A squat frustum reads as land from a tilted camera far better than a flat
## disc does — the sides catch the light and give it height, which is the whole
## point of having gone 3D.

signal entered(route: String)

var data: Dictionary = {}
var locked: bool = false
var in_range: bool = false

var _radius: float = 40.0
var _beacon: OmniLight3D
var _t: float = 0.0

## How far off the beach you can dock from. Outside the coastline, so you moor
## alongside rather than beaching the hull on it.
func dock_range() -> float:
	return _radius + 26.0

func setup(d: Dictionary, is_locked: bool) -> void:
	data = d
	locked = is_locked
	_radius = float(d.get("radius", 40.0))
	position = d["pos"]
	var tint: Color = d.get("tint", Color.WHITE)
	if locked:
		tint = Color(0.42, 0.46, 0.52)

	# The landmass. Top radius smaller than the base so it sits like a hill
	# rather than a drum.
	var land := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = _radius * 0.72
	cyl.bottom_radius = _radius
	cyl.height = 7.0
	cyl.radial_segments = 28
	land.mesh = cyl
	var mat := StandardMaterial3D.new()
	# Unshaded, like every solid form in the game's art. A lit hillside among
	# painted washes is what would give the whole scene away as a 3D render.
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.118, 0.169, 0.200) if locked else Color(0.153, 0.208, 0.239)
	land.material_override = mat
	land.position.y = 1.4
	add_child(land)

	# A shoal ring just under the surface, so land meets water through shallows
	# instead of on a hard edge.
	var shoal := MeshInstance3D.new()
	var ring := CylinderMesh.new()
	ring.top_radius = _radius * 1.34
	ring.bottom_radius = _radius * 1.34
	ring.height = 0.3
	ring.radial_segments = 28
	shoal.mesh = ring
	var smat := StandardMaterial3D.new()
	var shoal_tone := Color(0.549, 0.647, 0.671).lerp(tint, 0.18)
	smat.albedo_color = Color(shoal_tone.r, shoal_tone.g, shoal_tone.b, 0.28)
	smat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	smat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	shoal.mesh = ring
	shoal.material_override = smat
	shoal.position.y = 0.18
	add_child(shoal)

	# The beacon. What you actually steer toward from a distance, and the reason
	# a port reads at range where a low hill would not.
	var post := MeshInstance3D.new()
	var pm := CylinderMesh.new()
	pm.top_radius = 0.7
	pm.bottom_radius = 1.1
	pm.height = 14.0
	post.mesh = pm
	var pmat := StandardMaterial3D.new()
	pmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	pmat.albedo_color = Color(0.106, 0.153, 0.184)
	post.material_override = pmat
	post.position.y = 11.0
	add_child(post)

	var lamp := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 2.2
	sm.height = 4.4
	lamp.mesh = sm
	var lmat := StandardMaterial3D.new()
	lmat.albedo_color = tint
	# Emissive so it stays bright at distance and in shadow, which is what makes
	# it usable as a navigation mark rather than decoration.
	lmat.emission_enabled = true
	lmat.emission = tint
	lmat.emission_energy_multiplier = 0.7 if locked else 2.6
	lamp.material_override = lmat
	lamp.position.y = 19.0
	add_child(lamp)

	_beacon = OmniLight3D.new()
	_beacon.light_color = tint
	_beacon.omni_range = _radius * 2.6
	_beacon.light_energy = 0.6 if locked else 2.0
	_beacon.position.y = 19.0
	add_child(_beacon)

func _process(delta: float) -> void:
	_t += delta
	if _beacon:
		# A slow breath so a port reads as inhabited rather than as a decal, and
		# a faster, brighter one once you are close enough to dock.
		var pulse := 0.5 + 0.5 * sin(_t * (2.2 if in_range else 1.1))
		var base := 0.6 if locked else 1.7
		_beacon.light_energy = base + pulse * (0.2 if locked else 1.1)

func can_enter() -> bool:
	return in_range and not locked

func enter() -> void:
	if can_enter():
		entered.emit(String(data.get("route", "")))
