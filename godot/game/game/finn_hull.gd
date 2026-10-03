class_name FinnHull
extends Wanderer
## FINN ON THE WATER (Godot port of his hull in app/(app)/sea/SeaMap.tsx): moored
## off the Shallows, circling his mooring (Finn.haunt), plated "The Angler" in
## gold, and over him the story's mark.
##
## THE MARK IS GOLD AND MEANS THE STORY, NOTHING ELSE (Kong, 2026-10-02, The
## Long Cast): a ? when he has something to give you (no job open, and one
## your level reaches), a ! when the job he set is done and waiting to be
## handed back. No mark while you are working one: the beats are behind the
## work, so a ? mid-job would send you on a wasted sail. It bobs rather than
## pulses, and is counter-squashed so it stands upright over him.

const GOLD: Color = Color(1.0, 0.8, 0.3)

var mark: String = "":
	set(v):
		if v == mark:
			return
		mark = v
		_paint_mark(true)
var _mark_holder: Node2D
var _mark_l: Label
var _t: float = 0.0


func _init() -> void:
	var h: Dictionary = Finn.haunt(0, 1)
	info = { "key": "finn", "name": "Finn", "x": h["x"], "y": h["y"], "look": Finn.d()["look"] }
	role = "The Angler"
	accent = GOLD


func _ready() -> void:
	super._ready()
	_mark_holder = Node2D.new()
	_mark_holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	_mark_holder.position = Vector2(-14.0, -150.0 / Chart.GROUND)
	_mark_holder.z_index = 6
	add_child(_mark_holder)
	_mark_l = Label.new()
	_mark_l.add_theme_font_override("font", Kit.font("cinzel", 800))
	_mark_l.add_theme_font_size_override("font_size", 58)
	_mark_l.add_theme_color_override("font_color", GOLD)
	_mark_l.add_theme_color_override("font_outline_color", Color(0.25, 0.14, 0.02, 0.95))
	_mark_l.add_theme_constant_override("outline_size", 12)
	_mark_l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.45))
	_mark_l.add_theme_constant_override("shadow_offset_y", 4)
	_mark_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_mark_l.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	_mark_l.size = Vector2(80, 70)
	_mark_l.position = Vector2(-40, -70)
	_mark_l.pivot_offset = Vector2(40, 70)
	_mark_holder.add_child(_mark_l)
	var glow: PointLight2D = PointLight2D.new()
	glow.texture = Glow.radial(128, GOLD, true)
	glow.texture_scale = 1.2
	glow.color = GOLD
	glow.energy = 0.5
	glow.position = Vector2(0, -36)
	glow.name = "Glow"
	_mark_holder.add_child(glow)
	_paint_mark(false)


func _paint_mark(pop: bool) -> void:
	if _mark_l == null:
		return
	_mark_holder.visible = mark != ""
	_mark_l.text = mark
	if pop and mark != "":
		_mark_l.scale = Vector2(0.3, 0.3)
		var tw: Tween = _mark_l.create_tween()
		tw.tween_property(_mark_l, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _place(first: bool = false) -> void:
	var h: Dictionary = Finn.haunt(0, 1)
	var next: Vector2 = Vector2(float(h["x"]), float(h["y"]))
	var vx: float = next.x - position.x
	if first:
		_facing = 1.0
	elif absf(vx) > 0.01:
		_facing = 1.0 if vx < 0.0 else -1.0
	position = next
	skipper.scale.x = _facing


func _process(delta: float) -> void:
	super._process(delta)
	_t += delta
	if _mark_holder != null and _mark_holder.visible:
		_mark_holder.position.y = -150.0 / Chart.GROUND - (sin(_t * 2.4) * 6.0 + 6.0) / Chart.GROUND


func near(boat_at: Vector2) -> bool:
	return boat_at.distance_to(position) < float(Finn.d()["reach"])
