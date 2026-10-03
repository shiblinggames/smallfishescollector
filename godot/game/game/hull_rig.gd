class_name HullRig
extends Node2D
## A SHIP ON THE WATER that is not the captain's own boat: the battle's enemy
## hulls (and, in a Charter's raid, a crewmate's ship in the line). Built the
## way Boat.set_ship builds the expedition ship, so a hull in a fight sits in
## the same water as every other: the painting sunk at its waterline through
## the waterline shader, the collar of pushed-aside water round it, and its
## reflection, a twin lying down under it. Lives in the sea's World (squashed
## by Chart.GROUND), at the hull's keel.
##
##   face   1 bow-right as painted, -1 turned (the enemy faces the line)
##   box    how wide the hull is drawn

var tex: Texture2D
var def: Dictionary = {}
var box: float = 340.0
var face: float = 1.0
var phase: float = randf() * 6.28
## A sinking hull: 0 afloat, 1 gone under.
var sink: float = 0.0
## A heel to one side (a hit, a dodge), in radians; it settles back.
var heel: float = 0.0
## Recoil along the beam (a broadside), in pixels; it settles back.
var kick: float = 0.0
## A shove off its berth (a recoil, a hit, a swerve), springing back.
var slide: Vector2 = Vector2.ZERO
var _slide_v: Vector2 = Vector2.ZERO
## A hit's tint, fading.
var flash: float = 0.0
var _rig: Node2D
var _hull: Sprite2D
var _mirror: CanvasGroup
var _t: float = 0.0
var _base_y: float = 0.0
var _cut: float = 0.9


func _ready() -> void:
	if tex == null:
		return
	var flip: bool = def.get("seaFlip", false) == true
	var sc: float = box / float(tex.get_width())
	_hull = Sprite2D.new()
	_hull.texture = tex
	_hull.scale = Vector2(sc, sc / Chart.GROUND)
	_hull.flip_h = (face < 0.0) != flip
	var h: float = tex.get_height() * _hull.scale.y
	var keel_frac: float = float(def.get("seaKeel", 0.75))
	_hull.position = Vector2(0, -h * (keel_frac - 0.5))
	var top: float = _hull.position.y - h / 2.0
	var keel: float = top + h * keel_frac
	var waterline: float = keel - Skipper.SINK * box / Chart.GROUND
	var cut: float = (waterline - top) / h
	var depth: float = (keel - waterline) / h
	_cut = cut
	_hull.material = Skipper.afloat_mat("res://game/fx/waterline.gdshader", _hull, cut, depth, phase)
	(_hull.material as ShaderMaterial).set_shader_parameter("tilt", Skipper.keel_tilt(tex) * (-1.0 if _hull.flip_h else 1.0))
	_mirror = CanvasGroup.new()
	_mirror.fit_margin = 12.0
	var mm: ShaderMaterial = ShaderMaterial.new()
	mm.shader = load("res://game/fx/hull_mirror.gdshader")
	_mirror.material = mm
	var twin: Sprite2D = Sprite2D.new()
	twin.texture = tex
	twin.scale = _hull.scale
	twin.position = _hull.position
	twin.flip_h = _hull.flip_h
	_mirror.add_child(twin)
	_mirror.position = Vector2(0, waterline * (1.0 + Skipper.LIE))
	_mirror.scale = Vector2(1.0, -Skipper.LIE)
	add_child(_mirror)
	_rig = Node2D.new()
	add_child(_rig)
	_rig.add_child(_hull)
	var collar: Sprite2D = Skipper.collar_of(_hull, cut, depth, phase)
	_rig.add_child(collar)
	_base_y = _hull.position.y


## Turn her about (a crewmate's ship sailing the other way): the hull and its
## reflection flip, the waterline's tilt with them.
func turn(f: float) -> void:
	if _hull == null or signf(f) == signf(face):
		return
	face = f
	_hull.flip_h = (face < 0.0) != (def.get("seaFlip", false) == true)
	(_hull.material as ShaderMaterial).set_shader_parameter("tilt", Skipper.keel_tilt(tex) * (-1.0 if _hull.flip_h else 1.0))
	for c: Node in _mirror.get_children():
		(c as Sprite2D).flip_h = _hull.flip_h


## The hull's middle above the water, in the World's space (for shots and
## numbers aimed at it).
func centre() -> Vector2:
	if _hull == null:
		return position
	return position + Vector2(0, _hull.position.y * 0.6)


func _process(delta: float) -> void:
	if _rig == null:
		return
	_t += delta
	# A slow roll on the swell, the hit's heel and the broadside's kick
	# settling back.
	heel = lerpf(heel, 0.0, 1.0 - exp(-delta * 3.0))
	kick = lerpf(kick, 0.0, 1.0 - exp(-delta * 4.0))
	var roll: float = sin(_t * 1.1 + phase) * 0.018
	# The shove springs back (a little overshoot, then settles).
	_slide_v += (-slide * 60.0 - _slide_v * 9.0) * delta
	slide += _slide_v * delta
	flash = maxf(0.0, flash - delta * 5.0)
	_rig.rotation = roll + heel
	_rig.position = Vector2(kick, sin(_t * 1.6 + phase) * 2.5 + sink * 40.0) + slide
	_hull.self_modulate = Color.WHITE.lerp(Color(1.0, 0.55, 0.45), clampf(flash, 0.0, 1.0))
	# Going under: the waterline climbs the hull (the shader cuts there), the
	# bow lifting as she settles stern first.
	if sink > 0.0:
		(_hull.material as ShaderMaterial).set_shader_parameter("cut", lerpf(_cut, 0.0, sink))
		_rig.rotation += sink * 0.25 * face
	_mirror.position.x = kick + slide.x
	_mirror.modulate.a = 1.0 - sink
	_rig.modulate.a = 1.0 - smoothstep(0.6, 1.0, sink)



## A blow, a gun's recoil or a swerve: lean, a shove (it springs back), and
## a hit's tint.
func react(lean: float, shove: Vector2, tint: float = 0.0) -> void:
	heel += lean
	_slide_v += shove * 9.0
	flash = maxf(flash, tint)
