class_name Shipmate
extends Node2D
## A CREWMATE'S SHIP ON YOUR SEA (Godot port, the Charter slice): drawn as your
## own boat is (Skipper, in their look), with their captain's name on a plate
## under the hull, and moved smoothly between the ten updates a second their
## game sends (CrewNet.send_boat): it runs on from the last one at its speed
## and eases toward where that puts it, so a lost packet is a small glide
## rather than a jump.

var mate_name: String = ""
var lift: Color = Color.WHITE
var skipper: Skipper
var _plate: PanelContainer
var _name_l: Label
## What they are doing, under their name (Sea._status_text on their game).
var status: String = ""
var _do_l: Label
var _at: Vector2 = Vector2.ZERO
var _vel: Vector2 = Vector2.ZERO
var _age: float = 0.0
var _placed: bool = false


func _ready() -> void:
	skipper = Skipper.new()
	skipper.water = true
	skipper.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	add_child(skipper)
	var holder: Node2D = Node2D.new()
	holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	holder.position = Vector2(-18.0, 62.0 / Chart.GROUND)
	holder.z_index = 5
	add_child(holder)
	# The one nameplate on the water (Wanderer.plate), in the crew's teal; what
	# they are doing under the name, in soft ink.
	var pl: Dictionary = Wanderer.plate(mate_name, "", Kit.TEAL)
	_plate = pl["plate"]
	_name_l = pl["name"]
	_do_l = pl["sub"]
	_do_l.add_theme_color_override("font_color", Kit.PAPER_INK_SOFT)
	holder.add_child(_plate)
	set_mate_name(mate_name)
	# A ship coming into your sea fades in (never pops onto the water).
	modulate.a = 0.0
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 1.0, FADE).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)


## How long a crewmate's ship takes to fade in or out.
const FADE: float = 0.4


## They left: the ship fades off the water, then is gone.
func leave() -> void:
	if is_queued_for_deletion() or has_meta("_leaving"):
		return
	set_meta("_leaving", true)
	set_process(true)
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, FADE).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_callback(queue_free)


func set_mate_name(n: String) -> void:
	mate_name = n
	if _name_l != null:
		_name_l.text = n


func set_look(look: Dictionary) -> void:
	skipper.set_look(look)
	_look = look
	if _hull != null:
		_hull.queue_free()
		_hull = null
	_on_ship = false
	skipper.visible = true


var _look: Dictionary = {}
## In a fight: held facing this way (1 right, -1 left; 0 free).
var face_lock: float = 0.0
## North of the arch: their expedition ship, as yours becomes (Boat.set_ship).
var _hull: HullRig = null
var _on_ship: bool = false


func _side() -> void:
	var want: bool = North.ship_water(position)
	if want == _on_ship:
		return
	_on_ship = want
	skipper.visible = not want
	if _hull != null:
		_hull.queue_free()
		_hull = null
	if not want:
		return
	var sa: Dictionary = North.ship_art(_look.get("shipTier"), _look.get("shipSkin"))
	var tex: Texture2D = Skipper.tex(str(sa["art"]).trim_prefix("/"))
	if tex == null:
		skipper.visible = true
		return
	_hull = HullRig.new()
	_hull.face = signf(skipper.scale.x) if skipper.scale.x != 0.0 else 1.0
	_hull.tex = tex
	_hull.def = sa["def"]
	_hull.box = 340.0 * float(sa["wide"])
	add_child(_hull)
	move_child(_hull, 0)


## One update from their game.
func state(st: Dictionary) -> void:
	_at = Vector2(float(st["x"]), float(st["y"]))
	_vel = Vector2(float(st.get("vx", 0.0)), float(st.get("vy", 0.0)))
	_age = 0.0
	if not _placed:
		position = _at
		_placed = true
	skipper.set_frame(str(st.get("pose", "rest")))
	var d: String = str(st.get("do", ""))
	if d != status:
		status = d
		if _do_l != null:
			_do_l.text = d
			_do_l.visible = d != ""
	var f: float = float(st.get("facing", -1.0)) if face_lock == 0.0 else face_lock
	skipper.scale.x = -f


func _process(delta: float) -> void:
	_age = minf(_age + delta, 0.5)
	var aim: Vector2 = _at + _vel * _age
	position = position.lerp(aim, 1.0 - exp(-10.0 * delta))
	_side()
	if _hull != null:
		if face_lock != 0.0:
			skipper.scale.x = -face_lock
		_hull.turn(1.0 if skipper.scale.x > 0.0 else -1.0)
	_plate.modulate = lift
	_plate.position = Vector2(-_plate.size.x / 2.0, 0)
	var way: float = clampf(_vel.length() / 300.0, 0.0, 1.0)
	var rough: float = 1.0 + clampf((position.length() - 1400.0) / 21200.0, 0.0, 1.0) * 1.4
	var pitch: float = -signf(_vel.x) * way * 2.8 if absf(_vel.x) > 8.0 else 0.0
	skipper.sway(delta, rough, 0.0, pitch)
	if _hull != null:
		# Their ship sits in the swell as yours does (Boat.steer): the heel
		# into a turn read off the way their heading swings.
		var ang: float = _vel.angle() if _vel.length() > 20.0 else _ang
		var swing: float = wrapf(ang - _ang, -PI, PI) / maxf(delta, 0.0001)
		_ang = ang
		var heel: float = clampf(swing * way * 4.0, -7.0, 7.0) * signf(_vel.x if absf(_vel.x) > 1.0 else 1.0)
		_hull.rough = rough
		_hull.lean_deg = (heel + pitch) * lerpf(0.9, 0.6, _hull.heft)


var _ang: float = 0.0


## Where their wake starts: their ship's cutwater north of the arch, the
## fishing boat's otherwise.
func wake_contact(id: String) -> Dictionary:
	if _hull != null:
		return _hull.wake_contact(id, position, -signf(skipper.scale.x))
	return Boat.contact_for(id, position, skipper)



## In a fight: a crewmate's ship takes a blow, recoils or swerves.
func react(lean: float, shove: Vector2, tint: float = 0.0) -> void:
	if _hull != null and is_instance_valid(_hull):
		_hull.react(lean, shove, tint)
