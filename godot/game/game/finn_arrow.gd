class_name FinnArrow
extends Control
## WHERE FINN IS, when he has something for you and is off the screen: a gold
## chevron at the screen's edge pointing to him, his name and the mark (? or !)
## beside it. Gold means the story; nothing else on the HUD uses it this way.

const GOLD: Color = Color(1.0, 0.8, 0.3)
const INSET: float = 70.0

## His place on the screen, or null to hide.
var target: Variant = null
var mark: String = ""
var _t: float = 0.0
var _k: float = 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _process(delta: float) -> void:
	_t += delta
	var want: float = 0.0
	if target != null and mark != "":
		var p: Vector2 = target
		var r: Rect2 = Rect2(Vector2.ZERO, size).grow(-INSET * 0.5)
		want = 0.0 if r.has_point(p) else 1.0
	_k = move_toward(_k, want, delta * 3.0)
	queue_redraw()


func _draw() -> void:
	if _k <= 0.01 or target == null:
		return
	var c: Vector2 = size / 2.0
	var d: Vector2 = (target as Vector2) - c
	if d.length() < 1.0:
		return
	var dir: Vector2 = d.normalized()
	# Where the ray from the middle meets the inset frame.
	var hx: float = c.x - INSET
	var hy: float = c.y - INSET
	var t: float = minf(hx / maxf(0.001, absf(dir.x)), hy / maxf(0.001, absf(dir.y)))
	var at: Vector2 = c + dir * t - dir * (sin(_t * 3.0) * 4.0)
	var a: float = _k
	var tip: Vector2 = at + dir * 16.0
	var side: Vector2 = Vector2(-dir.y, dir.x)
	var pts: PackedVector2Array = PackedVector2Array([tip, at - dir * 6.0 + side * 13.0, at, at - dir * 6.0 - side * 13.0])
	draw_colored_polygon(PackedVector2Array([tip + dir * 2.0, at - dir * 8.0 + side * 15.0, at - dir * 2.0, at - dir * 8.0 - side * 15.0]), Color(0.25, 0.14, 0.02, 0.85 * a))
	draw_colored_polygon(pts, Color(GOLD, a))
	var f: Font = Kit.font("cinzel", 800)
	var label: String = "Finn  %s" % mark
	var lw: float = f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
	var lp: Vector2 = at - dir * 34.0 - Vector2(lw / 2.0, -5.0)
	draw_string_outline(f, lp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, 6, Color(0.1, 0.06, 0.02, 0.85 * a))
	draw_string(f, lp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(GOLD, a))
