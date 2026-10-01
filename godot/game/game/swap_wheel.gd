class_name SwapWheel
extends Control
## THE QUICK-SWAP WHEEL (Godot over the web baseline; Kong, 2026-10-01): hold
## Q (or the pad's left shoulder) on the water and the bait you hold and the
## rods you own fan out round her on paper discs; point (the mouse, or the
## stick) and let go to put one on. Nothing opens, nothing pauses. Only
## between casts; the same equip actions the Locker uses.

signal picked(kind: String, id: Variant)

## [kind, id, name, art, pigment, worn]
var items: Array = []
var centre: Vector2 = Vector2.ZERO
var _hot: int = -1
var _k: float = 0.0
const R: float = 150.0
const DISC: float = 34.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if centre == Vector2.ZERO:
		centre = get_viewport_rect().size / 2.0


func _process(delta: float) -> void:
	_k = minf(1.0, _k + delta * 7.0)
	var dir: Vector2 = get_viewport().get_mouse_position() - centre
	var stick: Vector2 = Input.get_vector("sail_left", "sail_right", "sail_up", "sail_down")
	if stick.length() > 0.4:
		dir = stick * 100.0
	_hot = -1
	if dir.length() > 40.0 and not items.is_empty():
		var a: float = fposmod(dir.angle() + PI / 2.0 + PI / items.size(), TAU)
		_hot = int(a / TAU * items.size()) % items.size()
	queue_redraw()


func _slot_at(i: int) -> Vector2:
	var a: float = -PI / 2.0 + TAU * i / maxf(1.0, float(items.size()))
	return centre + Vector2.from_angle(a) * R * (0.6 + 0.4 * _k)


## Let go: put on whatever is pointed at (nothing, if the pointer is home).
func release() -> void:
	if _hot >= 0:
		var it: Array = items[_hot]
		if not it[5]:
			picked.emit(it[0], it[1])
	queue_free()


func _draw() -> void:
	var a: float = _k * _k * (3.0 - 2.0 * _k)
	draw_circle(centre, R + DISC + 14.0, Color(0.02, 0.05, 0.08, 0.38 * a))
	draw_arc(centre, R, 0.0, TAU, 72, Color(0.95, 0.92, 0.84, 0.25 * a), 1.5, true)
	var f: Font = Kit.font("karla", 700)
	for i: int in items.size():
		var it: Array = items[i]
		var p: Vector2 = _slot_at(i)
		var hot: bool = i == _hot
		var d: float = DISC * (1.18 if hot else 1.0)
		draw_circle(p + Vector2(0, 3), d, Color(0, 0, 0, 0.25 * a))
		draw_circle(p, d, Color(Paper.PAPER, a))
		draw_circle(p, d * 0.78, Color(it[4], 0.35 * a))
		var tex: Texture2D = it[3]
		if tex != null:
			var s: float = d * 1.4 / maxf(tex.get_width(), tex.get_height())
			var sz: Vector2 = tex.get_size() * s
			draw_texture_rect(tex, Rect2(p - sz / 2.0, sz), false, Color(1, 1, 1, a))
		draw_arc(p, d, 0.0, TAU, 32, Color(Paper.RED if it[5] else Paper.INK, (0.9 if it[5] or hot else 0.45) * a), 2.4 if it[5] else 1.2, true)
		if it[0] == "rod" and (i == 0 or items[i - 1][0] != "rod"):
			var lp: Vector2 = p + Vector2.from_angle((p - centre).angle()) * (d + 14.0)
			draw_string(f, lp - Vector2(16, -4), "RODS", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(0.95, 0.92, 0.84, 0.7 * a))
	var name: String = "Point and let go" if _hot < 0 else str(items[_hot][2]) + ("  (on)" if items[_hot][5] else "")
	var w: float = f.get_string_size(name, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
	draw_string(f, centre + Vector2(-w / 2.0, R + DISC + 40.0), name, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(0.97, 0.94, 0.87, a))
