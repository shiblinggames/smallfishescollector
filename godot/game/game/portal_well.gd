class_name PortalWell
extends Node2D
## THE HOMESTEAD PORTAL ON THE WATER (Godot port of the portal ring and
## PortalName in app/(app)/sea/SeaMap.tsx, the rest of the sea, stage 5): a
## well off the Homestead, turning in the colour of the furthest water it
## reaches, that gathers when the boat sits in its mouth. Dead water (still,
## grey) until it can take you anywhere, and its board says what it wants.

var tier: int = 1
## Can it take you anywhere? (a stone opened, or a rung above the first)
var live: bool = false
## The boat is in the mouth: the water gathers.
var gather: bool = false
var lift: Color = Color.WHITE
var _t: float = 0.0
var _g: float = 0.0
## Whether the last drawing was the live well: dead water is still, so it is
## drawn once (and again only when the well wakes or dies), not every frame.
var _drawn_live: bool = false
var _board: Node2D
var _name: Label
var _line: Label
var _hint: Label


func _ready() -> void:
	position = Vector2(float(Portal.AT["x"]), float(Portal.AT["y"]))
	z_index = -1
	_board = Node2D.new()
	_board.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	_board.position = Vector2(0, float(Portal.AT["r"]))
	_board.z_index = 6
	add_child(_board)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 1)
	_board.add_child(v)
	_name = Kit.lift(Kit.text(v, "Home Portal", "title", Color("#eef4f8")))
	_line = Kit.lift(Kit.text(v, "", "body_strong", Kit.INK))
	_hint = Kit.lift(Kit.text(v, "There is one in the cache chest out in the Shallows.", "small", Color(0.77, 0.84, 0.89, 0.66)))
	for l: Label in [_name, _line, _hint]:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.resized.connect(func() -> void: v.position = Vector2(-v.size.x / 2.0, 0))
	refresh()


func refresh() -> void:
	var t: Dictionary = Portal.tier_def(tier)
	_name.add_theme_color_override("font_color", Color("#eef4f8") if live else Color(0.79, 0.84, 0.87, 0.7))
	_line.text = ("Reaches %s" % t.get("name", "the Shallows")) if live else "Dead water. It wants a portal stone."
	_line.add_theme_color_override("font_color", Kit.a(_accent().lightened(0.4), 0.9) if live else Color(0.9, 0.77, 0.55, 0.92))
	_hint.visible = not live


func _accent() -> Color:
	return Color(str(Portal.tier_def(tier).get("accent", "#7fc8de")))


func _process(delta: float) -> void:
	_t += delta
	_g = move_toward(_g, 1.0 if gather else 0.0, delta * 2.0)
	_board.modulate = lift
	if live or live != _drawn_live:
		queue_redraw()
		_drawn_live = live


func _draw() -> void:
	var r: float = float(Portal.AT["r"])
	if not live:
		# Still water: a dull ring and nothing moving in it.
		draw_circle(Vector2.ZERO, r, Color(0.05, 0.08, 0.1, 0.35))
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 96, Color(0.6, 0.66, 0.7, 0.28), 4.0, true)
		draw_arc(Vector2.ZERO, r * 0.55, 0.0, TAU, 72, Color(0.6, 0.66, 0.7, 0.12), 2.0, true)
		return
	var c: Color = _accent()
	# HDR: the arms burn past white and bloom (more when she sits in it).
	var hot: float = 1.6 + _g * 1.2
	var spin: float = _t * (0.35 + _g * 0.9)
	draw_circle(Vector2.ZERO, r, Color(c, 0.10 + 0.08 * _g))
	draw_circle(Vector2.ZERO, r * 0.45, Color(c, 0.12 + 0.18 * _g))
	draw_arc(Vector2.ZERO, r, 0.0, TAU, 128, Color(c, 0.55 + 0.3 * _g), 5.0, true)
	# Arms of light turning in toward the middle, faster when she sits in it.
	for k: int in 6:
		var a0: float = spin + k * TAU / 6.0
		for s: int in 3:
			var rr: float = r * (0.9 - s * 0.22)
			var arm: Color = c.lightened(0.3) * hot
			arm.a = (0.32 - s * 0.08) * (0.7 + 0.5 * _g)
			draw_arc(Vector2.ZERO, rr, a0 + s * 0.5, a0 + s * 0.5 + 0.9, 24, arm, 3.0 - s * 0.6, true)
	var pulse: float = fmod(_t * 0.6, 1.0)
	draw_arc(Vector2.ZERO, r * (1.0 - pulse * 0.7), 0.0, TAU, 96, Color(c.lightened(0.4), 0.25 * pulse * (0.4 + _g)), 2.0, true)
