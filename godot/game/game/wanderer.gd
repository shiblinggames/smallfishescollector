class_name Wanderer
extends Node2D
## SOMEONE ON THE WATER (Godot port of the trader hulls in
## app/(app)/sea/SeaMap.tsx, the rest of the sea, stage 4): a hull with its
## skipper, working a beat round a mooring the way traderPos has it (a lap of
## legs with a long sit between them when the rate is positive, a slow circle
## otherwise), and a plate under it with their name and what they are.
##
## The wandering traders, the regulars, Yoon and the buyers are all one of
## these. `info` is the trader as Traders or the sea built it; the look comes
## in the web's keys (characterColor, boatId, hatId) and goes to the Skipper
## in its own.

var info: Dictionary = {}
## What the plate says under the name, and the colour it is lit with (a
## regular's own accent; the shop amber for everyone else).
var role: String = ""
var accent: Color = Color(1.0, 0.81, 0.54)
## Dealt with today: the plate goes grey and says so.
var done: bool = false:
	set(v):
		done = v
		if _kind != null:
			_paint()
## Undoes the night's dimming on the plate (the sea sets it).
var lift: Color = Color.WHITE
var skipper: Skipper
var _plate: PanelContainer
var _name: Label
var _kind: Label
var _box: StyleBoxFlat
var _facing: float = 1.0


func _ready() -> void:
	skipper = Skipper.new()
	skipper.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	add_child(skipper)
	var l: Dictionary = info.get("look", {})
	skipper.set_look({
		"color": l.get("characterColor", l.get("color", "default")),
		"boat": l.get("boatId", l.get("boat")),
		"hat": l.get("hatId", l.get("hat")),
		"rodSlug": l.get("rodSlug"), "hook": l.get("hook"),
	})
	var holder: Node2D = Node2D.new()
	holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	holder.position = Vector2(-18.0, 62.0 / Chart.GROUND)
	holder.z_index = 5
	add_child(holder)
	_plate = PanelContainer.new()
	_box = StyleBoxFlat.new()
	_box.bg_color = Color(0.024, 0.047, 0.07, 0.86)
	_box.set_border_width_all(1)
	_box.set_corner_radius_all(9)
	_box.content_margin_left = 10
	_box.content_margin_right = 10
	_box.content_margin_top = 3
	_box.content_margin_bottom = 4
	_box.shadow_size = 0
	_plate.add_theme_stylebox_override("panel", _box)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	_plate.add_child(col)
	_name = Kit.text(col, str(info["name"]), "name", Color("#e6eef4"))
	_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_kind = Kit.text(col, role, "small", accent)
	_kind.add_theme_font_size_override("font_size", 11)
	_kind.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	holder.add_child(_plate)
	_paint()
	_place(true)


func _paint() -> void:
	_name.add_theme_color_override("font_color", Color(0.71, 0.75, 0.78, 0.6) if done else Color("#e6eef4"))
	_kind.text = "Traded today" if done else role
	_kind.add_theme_color_override("font_color", Color(0.63, 0.69, 0.73, 0.55) if done else accent)
	_box.border_color = Color(0.59, 0.65, 0.7, 0.3) if done else Kit.a(accent, 0.48)


func _place(first: bool = false) -> void:
	var at: Dictionary = Folk.drift_pos(float(info["x"]), float(info["y"]), float(info["driftR"]), float(info["driftRate"]), float(info["driftPhase"]), Clock.now_ms() / 1000.0)
	var next: Vector2 = Vector2(float(at["x"]), float(at["y"]))
	var vx: float = next.x - position.x
	# Facing follows the way they are going, and holds while they sit.
	if first:
		_facing = float(at["facing"])
	elif absf(vx) > 0.01:
		_facing = 1.0 if vx < 0.0 else -1.0
	position = next
	skipper.scale.x = _facing


func _process(_delta: float) -> void:
	_place()
	_plate.modulate = lift
	_plate.position = Vector2(-_plate.size.x / 2.0, 0)


func near(boat_at: Vector2) -> bool:
	return boat_at.distance_to(position) < Chart.HAIL_RANGE
