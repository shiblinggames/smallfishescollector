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
## Fish he might land (Shallows names; the sea fills it).
var catch_names: Array = []
## A fish landed: the sea rings the water where it came out.
signal splashed(at: Vector2)
var _float: Node2D
var _lantern: Node2D
var _next_catch: float = 12.0


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
	skipper.set_frame("wait")
	# The float on his line, upright over the water.
	_float = Node2D.new()
	_float.z_index = 1
	_float.draw.connect(func() -> void:
		var sq: float = 1.0 / Chart.GROUND
		_float.draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, sq))
		_float.draw_circle(Vector2(0, 0), 5.0, Color(0.95, 0.94, 0.9))
		_float.draw_circle(Vector2(0, -3.5), 4.2, Color(0.82, 0.16, 0.12))
		_float.draw_line(Vector2(0, -7), Vector2(0, -12), Color(0.2, 0.15, 0.1), 1.2, true))
	add_child(_float)
	# The lantern on its pole at the stern.
	_lantern = Node2D.new()
	_lantern.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	_lantern.z_index = 1
	_lantern.draw.connect(func() -> void:
		_lantern.draw_line(Vector2(0, 0), Vector2(0, -66), Color(0.3, 0.2, 0.12), 3.0, true)
		_lantern.draw_line(Vector2(0, -66), Vector2(-9, -66), Color(0.3, 0.2, 0.12), 2.0, true)
		var lit: Color = Color(1.0, 0.82, 0.42)
		_lantern.draw_circle(Vector2(-9, -54), 12.0, Color(lit, 0.18))
		_lantern.draw_rect(Rect2(-14, -62, 10, 13), Color(0.22, 0.15, 0.08))
		_lantern.draw_rect(Rect2(-12.5, -60, 7, 9), lit))
	add_child(_lantern)
	_next_catch = 8.0 + randf() * 14.0


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
	# His lantern never goes out.
	_lamp.energy = 0.3 + night * 0.9
	_lamp.color = Color(1.0, 0.8, 0.42)
	_lamp.position = Vector2(_facing * 40.0, -60.0 / Chart.GROUND)
	_lantern.position = Vector2(_facing * 44.0, -14.0 / Chart.GROUND)
	var end: Vector2 = line_end()
	_float.position = end + Vector2(0, (sin(_t * 1.9) * 1.6) / Chart.GROUND)
	_float.queue_redraw()
	_next_catch -= delta
	if _next_catch <= 0.0:
		_next_catch = 24.0 + randf() * 18.0
		_land_one()
	if _mark_holder != null and _mark_holder.visible:
		_mark_holder.position.y = -150.0 / Chart.GROUND - (sin(_t * 2.4) * 6.0 + 6.0) / Chart.GROUND


## Where his line meets the water, in his space.
func line_end() -> Vector2:
	return skipper.transform * skipper.sheet_point("wait", FishingLine.PTS["wait"][1])


## A bite: the float dips twice, then a small fish comes up out of the water
## in an arc and drops into his boat.
func _land_one() -> void:
	skipper.line_dip_t = skipper.line_clock
	var tw0: Tween = _float.create_tween()
	tw0.tween_property(_float, "scale", Vector2(1, 0.4), 0.12)
	tw0.tween_property(_float, "scale", Vector2.ONE, 0.18)
	tw0.tween_interval(0.35)
	tw0.tween_property(_float, "scale", Vector2(1, 0.3), 0.1)
	tw0.tween_property(_float, "scale", Vector2.ONE, 0.2)
	await tw0.finished
	if catch_names.is_empty():
		return
	var tex: Texture2D = Skipper.fish_thumb(str(catch_names[randi() % catch_names.size()]))
	if tex == null:
		return
	var holder: Node2D = Node2D.new()
	holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	holder.z_index = 2
	add_child(holder)
	var f: Sprite2D = Sprite2D.new()
	f.texture = tex
	f.scale = Vector2.ONE * (34.0 / maxf(1.0, float(tex.get_width())))
	holder.add_child(f)
	var from: Vector2 = Vector2(line_end().x, line_end().y * Chart.GROUND)
	var to: Vector2 = Vector2(0.0, -26.0)
	splashed.emit(position + line_end())
	var fly: Callable = func(u: float) -> void:
		var p: Vector2 = from.lerp(to, u)
		p.y -= sin(u * PI) * 70.0
		f.position = p
		f.rotation = lerpf(-1.2, 1.0, u) * -_facing
		f.modulate.a = 1.0 - smoothstep(0.8, 1.0, u)
	var tw: Tween = holder.create_tween()
	tw.tween_method(fly, 0.0, 1.0, 0.75)
	tw.tween_callback(holder.queue_free)


func near(boat_at: Vector2) -> bool:
	return boat_at.distance_to(position) < float(Finn.d()["reach"])
