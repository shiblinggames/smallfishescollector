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
##
## HOW A SHIP SITS IN THE SEA (Kong, 2026-10-09: the fishing boat "feels really
## tuned and locked in", the ships "a little off"): the fishing boat's own
## swell (Skipper.sway: two waves each for the bob and the roll, eased in,
## pivoted on the waterline), slower and steadier the bigger the hull (heft).
## Whoever sails her (Boat, Shipmate) sets rough and lean_deg each frame, the
## heel into a turn and the bow lifting under way. A TURN ABOUT (Kong: the
## squash through the beam "makes it feel like its 2d paper"): she heels hard
## into the turn and dips, and at the peak of it the picture turns, hidden in
## spray thrown off the bow and foam swirling at the stern (turn()).
## Her keel and waterline are the rules' own for a base hull, measured from
## the picture for a skin (Skipper.keel_frac), and she sinks by her painted
## width, not her padded plate's.
## The roll is a true rotation on the screen, not in the World's squashed plane.

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
## The white of a ball's contact (BattleStage's hold), gone in a blink.
var white: float = 0.0
var _heel_rate: float = 3.0
## How big a hull: 0 a Sloop, 1 a Man-o-War (from the rules' tier).
var heft: float = 0.5
## The swell's strength (deeper water, a squall), and the lean her sailor puts
## on her in degrees (a turn's heel, the bow lifting).
var rough: float = 0.8
var lean_deg: float = 0.0
## Lifted out of the water (a crossing's rise), in World pixels.
var rise: float = 0.0
## A turn about takes this long; she heels TURN_LEAN degrees and dips
## TURN_DIP screen pixels at its peak.
const TURN_S: float = 0.36
const TURN_LEAN: float = 7.0
const TURN_DIP: float = 6.0
## The sea, for the foam of a turn (set by whoever sails her).
var field: SeaField = null
var _face0: float = 1.0
var _drawn: float = 1.0
var _turn_u: float = 1.0
var _turn_dir: float = 0.0
var _bob: float = 0.0
var _rock: float = 0.0
var _pivot_y: float = 0.0
var _mirror_y: float = 0.0
var _rig: Node2D
var _hull: Sprite2D
var _mirror: CanvasGroup
var _t: float = 0.0
var _base_y: float = 0.0
var _cut: float = 0.9


func _ready() -> void:
	if tex == null:
		return
	heft = clampf((float(def.get("tier", 4.0)) - 2.0) / 4.0, 0.0, 1.0)
	_face0 = face if face != 0.0 else 1.0
	_drawn = _face0
	var flip: bool = def.get("seaFlip", false) == true
	var sc: float = box / float(tex.get_width())
	_hull = Sprite2D.new()
	_hull.texture = tex
	_hull.scale = Vector2(sc, sc / Chart.GROUND)
	_hull.flip_h = (face < 0.0) != flip
	var h: float = tex.get_height() * _hull.scale.y
	# The rules' keel for the hull's own picture; a skin's, measured.
	var own: bool = str(def.get("seaImageUrl", "")) != "" and tex.resource_path.ends_with(str(def.get("seaImageUrl", "")).trim_prefix("/"))
	var keel_frac: float = float(def.get("seaKeel", 0.75)) if own else Skipper.keel_frac(tex)
	_hull.position = Vector2(0, -h * (keel_frac - 0.5))
	var top: float = _hull.position.y - h / 2.0
	var keel: float = top + h * keel_frac
	var waterline: float = keel - Skipper.SINK * box * minf(1.0, Skipper.paint_width(tex) / 0.975) / Chart.GROUND
	var cut: float = (waterline - top) / h
	var depth: float = (keel - waterline) / h
	_cut = cut
	_pivot_y = waterline
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
	_mirror_y = waterline * (1.0 + Skipper.LIE)
	_mirror.position = Vector2(0, _mirror_y)
	_mirror.scale = Vector2(1.0, -Skipper.LIE)
	add_child(_mirror)
	_rig = Node2D.new()
	add_child(_rig)
	_rig.add_child(_hull)
	var collar: Sprite2D = Skipper.collar_of(_hull, cut, depth, phase)
	_rig.add_child(collar)
	_base_y = _hull.position.y


## Turn her about (sailing the other way): over TURN_S she heels into it and
## dips, turning at the peak in spray and foam; or at once.
func turn(f: float, instant: bool = false) -> void:
	if f == 0.0 or signf(f) == face:
		if instant:
			_drawn = face
			_turn_u = 1.0
		return
	face = signf(f)
	if instant or _rig == null:
		_drawn = face
		_turn_u = 1.0
		return
	_turn_u = 0.0
	# The way she is turning to, on the screen (face is -1 when bow-right).
	_turn_dir = -face


## The spray off the bow and the foam swirling at the stern as she comes round.
func _turn_wash() -> void:
	var wl: float = Skipper.SINK * box / Chart.GROUND
	var p: GPUParticles2D = GPUParticles2D.new()
	p.one_shot = true
	p.explosiveness = 0.85
	p.amount = 26
	p.lifetime = 0.8
	p.local_coords = false
	p.texture = Glow.radial(16, Color.WHITE)
	var m: ParticleProcessMaterial = ParticleProcessMaterial.new()
	m.direction = Vector3(_turn_dir * 0.6, -1, 0)
	m.spread = 40.0
	m.initial_velocity_min = 180.0
	m.initial_velocity_max = 340.0
	m.gravity = Vector3(0, 620.0 / Chart.GROUND, 0)
	m.scale_min = 0.25
	m.scale_max = 0.55
	m.lifetime_randomness = 0.4
	var g: Gradient = Gradient.new()
	g.set_color(0, Color(0.92, 0.97, 1.0, 0.9))
	g.set_color(1, Color(0.92, 0.97, 1.0, 0.0))
	var ramp: GradientTexture1D = GradientTexture1D.new()
	ramp.gradient = g
	m.color_ramp = ramp
	p.process_material = m
	p.position = Vector2(_turn_dir * box * 0.36, -wl)
	add_child(p)
	p.emitting = true
	get_tree().create_timer(1.2).timeout.connect(p.queue_free)
	if field != null and get_parent() is Node2D:
		var at: Vector2 = (get_parent() as Node2D).position + position
		field.ring(at + Vector2(-_turn_dir * box * 0.34, 0), 150.0, 1.6, 0.8)
		field.ring(at + Vector2(_turn_dir * box * 0.36, -wl), 110.0, 1.2, 0.6)


## Where her wake starts, for the sea's Wake layer (Boat.wake_contact's shape):
## the cutwater a little in from the bow, on the waterline; bow is the way she
## faces on the screen (1 right).
func wake_contact(id: String, at: Vector2, bow: float) -> Dictionary:
	var wl: float = Skipper.SINK * box / Chart.GROUND
	return {
		"id": id, "x": at.x + bow * box * 0.36, "y": at.y - wl,
		"cx": at.x, "cy": at.y, "scale": box / 300.0,
	}


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
	heel = lerpf(heel, 0.0, 1.0 - exp(-delta * _heel_rate))
	white = maxf(0.0, white - delta * 14.0)
	kick = lerpf(kick, 0.0, 1.0 - exp(-delta * 4.0))
	# The swell, as the fishing boat's: slower and steadier the bigger she is.
	var rate: float = lerpf(1.0, 0.68, heft)
	var bob: float = (sin(_t * 1.15 * rate + phase) * 2.6 + sin(_t * 0.67 * rate + phase * 1.7) * 1.8) * rough * lerpf(1.0, 1.25, heft)
	var roll: float = (sin(_t * 0.92 * rate + phase * 0.6) * 1.4 + sin(_t * 1.61 * rate + phase) * 0.6) * rough * lerpf(0.85, 0.6, heft)
	var k: float = 1.0 - exp(-delta * 3.0)
	_bob = lerpf(_bob, bob, k)
	_rock = lerpf(_rock, roll + lean_deg, k)
	# A turn about: heeling and dipping into it, the picture turning at the
	# peak, in the wash.
	var bump: float = 0.0
	if _turn_u < 1.0:
		_turn_u = minf(1.0, _turn_u + delta / TURN_S)
		bump = sin(PI * _turn_u)
		if _drawn != face and _turn_u >= 0.5:
			_drawn = face
			_turn_wash()
	var sx: float = _drawn / _face0
	# The shove springs back (a little overshoot, then settles).
	_slide_v += (-slide * 60.0 - _slide_v * 9.0) * delta
	slide += _slide_v * delta
	flash = maxf(0.0, flash - delta * 5.0)
	var rot: float = deg_to_rad(_rock + bump * TURN_LEAN * _turn_dir) + heel + sink * 0.25 * face
	# Rolled on the screen, about the waterline (the World is squashed by
	# GROUND, so the turn is built through it, not inside it).
	var g: float = Chart.GROUND
	var c: float = cos(rot)
	var sn: float = sin(rot)
	var bx: Vector2 = Vector2(c, sn / g) * sx
	var by: Vector2 = Vector2(-g * sn, c)
	var pivot: Vector2 = Vector2(0, _pivot_y)
	var at: Vector2 = Vector2(kick, (_bob + bump * TURN_DIP) / g + sink * 40.0 - rise) + slide
	_rig.transform = Transform2D(bx, by, at + pivot - by * _pivot_y)
	_hull.self_modulate = Color.WHITE.lerp(Color(1.0, 0.55, 0.45), clampf(flash, 0.0, 1.0)).lerp(Color(2.2, 2.2, 2.2), clampf(white, 0.0, 1.0))
	# Going under: the waterline climbs the hull (the shader cuts there), the
	# bow lifting as she settles stern first.
	if sink > 0.0:
		(_hull.material as ShaderMaterial).set_shader_parameter("cut", lerpf(_cut, 0.0, sink))
	_mirror.position.x = kick + slide.x
	# Water flips a lean and keeps the picture mostly where it is.
	_mirror.scale.x = sx
	_mirror.rotation = -rot * 0.5
	_mirror.position.y = _mirror_y - _bob / g * 0.75 + rise * Skipper.LIE
	# The reflection goes with the hull, not ahead of it.
	_mirror.modulate.a = 1.0 - smoothstep(0.35, 0.9, sink)
	_rig.modulate.a = 1.0 - smoothstep(0.6, 1.0, sink)



## A blow, a gun's recoil or a swerve: lean, a shove (it springs back), and
## a hit's tint.
func react(lean: float, shove: Vector2, tint: float = 0.0) -> void:
	# A heavy blow (a critical) rocks her and settles slower.
	_heel_rate = 2.0 if absf(lean) > 0.12 else 3.0
	heel += lean
	_slide_v += shove * 9.0
	flash = maxf(flash, tint)


## A ball's contact: the hull flashes white (BattleStage._strike).
func flash_white() -> void:
	white = 1.0
