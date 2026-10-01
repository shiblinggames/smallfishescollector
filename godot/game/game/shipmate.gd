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
	_plate = PanelContainer.new()
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = Color(0.024, 0.047, 0.07, 0.86)
	s.border_color = Color(0.37, 0.92, 0.83, 0.45)
	s.set_border_width_all(1)
	s.set_corner_radius_all(10)
	s.content_margin_left = 12
	s.content_margin_right = 12
	s.content_margin_top = 3
	s.content_margin_bottom = 4
	_plate.add_theme_stylebox_override("panel", s)
	_name_l = Label.new()
	_name_l.add_theme_font_override("font", UiTheme.title_font())
	_name_l.add_theme_font_size_override("font_size", 15)
	_name_l.add_theme_color_override("font_color", Color("#dff7f2"))
	_plate.add_child(_name_l)
	holder.add_child(_plate)
	set_mate_name(mate_name)


func set_mate_name(n: String) -> void:
	mate_name = n
	if _name_l != null:
		_name_l.text = n


func set_look(look: Dictionary) -> void:
	skipper.set_look(look)


## One update from their game.
func state(st: Dictionary) -> void:
	_at = Vector2(float(st["x"]), float(st["y"]))
	_vel = Vector2(float(st.get("vx", 0.0)), float(st.get("vy", 0.0)))
	_age = 0.0
	if not _placed:
		position = _at
		_placed = true
	skipper.set_frame(str(st.get("pose", "rest")))
	var f: float = float(st.get("facing", -1.0))
	skipper.scale.x = -f


func _process(delta: float) -> void:
	_age = minf(_age + delta, 0.5)
	var aim: Vector2 = _at + _vel * _age
	position = position.lerp(aim, 1.0 - exp(-10.0 * delta))
	_plate.modulate = lift
	_plate.position = Vector2(-_plate.size.x / 2.0, 0)
	var way: float = clampf(_vel.length() / 300.0, 0.0, 1.0)
	skipper.sway(delta, 1.0 + clampf((position.length() - 1400.0) / 21200.0, 0.0, 1.0) * 1.4, 0.0, -signf(_vel.x) * way * 2.8 if absf(_vel.x) > 8.0 else 0.0)
