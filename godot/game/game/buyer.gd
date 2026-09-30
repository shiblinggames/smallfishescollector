class_name Buyer
extends Node2D
## THE BUYER OUT IN A WATER (Godot port of the residents in
## app/(app)/sea/SeaMap.tsx, docking): one per fishing water, moored in it,
## who takes the whole hold for a little less than the Market pays.
##
## They drift slowly round their mooring (a shorter beat than the regulars:
## they are waiting for trade, not looking for it), in a look hashed off the
## water's id, with their name and "Buyer" on a plate under the hull. The sea
## asks `near()` to put "Hail <name>" in reach.

var info: Dictionary = {}
var home: Vector2
var drift_r: float = 0.0
## Undoes the night's dimming on the name plate, which is lettering, not a
## thing on the water (the sea sets it).
var lift: Color = Color.WHITE
var skipper: Skipper
var _plate: PanelContainer
var _t: float = 0.0


func _ready() -> void:
	home = Vector2(float(info["x"]), float(info["y"]))
	drift_r = Chart.drift_r(home, info["zoneId"])
	position = home
	skipper = Skipper.new()
	skipper.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	add_child(skipper)
	var look: Dictionary = (info["look"] as Dictionary).duplicate()
	skipper.set_look(look)

	# The plate, counter-squashed so it reads upright.
	var holder: Node2D = Node2D.new()
	holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	holder.position = Vector2(-18.0, 62.0 / Chart.GROUND)
	holder.z_index = 5
	add_child(holder)
	_plate = PanelContainer.new()
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = Color(0.024, 0.047, 0.07, 0.86)
	s.border_color = Color(1.0, 0.81, 0.54, 0.34)
	s.set_border_width_all(1)
	s.set_corner_radius_all(10)
	s.content_margin_left = 12
	s.content_margin_right = 12
	s.content_margin_top = 4
	s.content_margin_bottom = 5
	_plate.add_theme_stylebox_override("panel", s)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	_plate.add_child(col)
	var n: Label = Label.new()
	n.text = info["name"]
	n.add_theme_font_override("font", UiTheme.title_font())
	n.add_theme_font_size_override("font_size", 15)
	n.add_theme_color_override("font_color", Color("#e6eef4"))
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(n)
	var k: Label = Label.new()
	k.text = "BUYER"
	k.add_theme_font_size_override("font_size", 11)
	k.add_theme_color_override("font_color", Color(1.0, 0.84, 0.59, 0.85))
	k.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(k)
	holder.add_child(_plate)


func _process(delta: float) -> void:
	_t += delta
	var a: float = _t * float(info["driftRate"]) + float(info["driftPhase"])
	var was: Vector2 = position
	position = home + Vector2(cos(a), sin(a)) * drift_r
	var vx: float = position.x - was.x
	if absf(vx) > 0.001:
		skipper.scale.x = 1.0 if vx < 0.0 else -1.0
	_plate.modulate = lift
	_plate.position = Vector2(-_plate.size.x / 2.0, 0)


func near(boat_at: Vector2) -> bool:
	return boat_at.distance_to(position) < Chart.HAIL_RANGE
