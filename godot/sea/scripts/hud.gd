extends Control

## THE OVERLAY: edge pointers and the dock prompt.
##
## The pointers are not decoration, they are what makes the map usable at all.
## Open water with nothing in view is the classic overworld failure — you cannot
## tell whether there is anything out there or which way it is, so you stop
## exploring and start resenting the map. An arrow pinned to the edge of the
## screen for every place you cannot currently see fixes that for almost nothing.
##
## Drawn rather than built from nodes because it is per-frame and entirely
## derived from world state; a tree of Controls would be state to keep in sync
## for no gain.

@onready var sea: Node3D = get_parent().get_parent()

var _font: Font

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_font = ThemeDB.fallback_font

func _draw() -> void:
	if not sea.has_method("hud_state"):
		return
	var st: Dictionary = sea.hud_state()
	var vp: Vector2 = size
	var centre: Vector2 = vp * 0.5

	for p in st["places"]:
		if p["onscreen"]:
			_draw_label(p, vp)
		else:
			_draw_pointer(p, centre, vp)

	_draw_prompt(st, vp)

## A name under a place you can actually see.
func _draw_label(p: Dictionary, _vp: Vector2) -> void:
	var tint: Color = p["tint"]
	if p["locked"]:
		tint = Color(0.52, 0.56, 0.62)
	var txt: String = String(p["name"])
	if p["locked"]:
		txt += "  ·  Fishing %d" % int(p["min_level"])
	var w: float = _font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
	var at: Vector2 = Vector2(p["screen"]) + Vector2(-w * 0.5, 300.0)
	draw_string(_font, at + Vector2(1, 1), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(0, 0, 0, 0.7))
	draw_string(_font, at, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, tint)

## An arrow pinned to the screen edge for a place that is out of view, with how
## far away it is. Distance matters as much as direction: it is what tells you
## whether that glow is a short hop or the other side of the map.
func _draw_pointer(p: Dictionary, centre: Vector2, vp: Vector2) -> void:
	var dir: Vector2 = (Vector2(p["screen"]) - centre)
	# BEHIND THE CAMERA, unproject_position gives a mirrored point rather than
	# nothing, so an arrow for a place astern would point dead ahead. Flip it.
	if p.get("behind", false):
		dir = -dir
	if dir.length() < 0.001:
		return
	dir = dir.normalized()

	# Push out to the edge of an inset rect, so arrows sit inside the safe area
	# rather than half off the glass.
	var m: float = 54.0
	var half: Vector2 = vp * 0.5 - Vector2(m, m)
	var t: float = min(
		half.x / max(abs(dir.x), 0.0001),
		half.y / max(abs(dir.y), 0.0001),
	)
	var at: Vector2 = centre + dir * t

	var tint: Color = p["tint"]
	if p["locked"]:
		tint = Color(0.52, 0.56, 0.62)

	# The arrowhead, pointing the way.
	var a: float = dir.angle()
	var tri := PackedVector2Array([
		at + Vector2(cos(a), sin(a)) * 15.0,
		at + Vector2(cos(a + 2.5), sin(a + 2.5)) * 12.0,
		at + Vector2(cos(a - 2.5), sin(a - 2.5)) * 12.0,
	])
	draw_colored_polygon(tri, Color(tint.r, tint.g, tint.b, 0.92))

	var km: String = "%dm" % int(float(p["dist"]))
	var w: float = _font.get_string_size(km, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
	var lab: Vector2 = at - dir * 22.0 + Vector2(-w * 0.5, 5.0)
	draw_string(_font, lab + Vector2(1, 1), km, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(0, 0, 0, 0.7))
	draw_string(_font, lab, km, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(tint.r, tint.g, tint.b, 0.85))

## The dock prompt, along the bottom. Says what to do, or why you cannot.
func _draw_prompt(st: Dictionary, vp: Vector2) -> void:
	if st["near"] == null:
		return
	var txt: String
	var col: Color
	if st["can_enter"]:
		txt = "Tap again to %s %s" % [String(st["verb"]), String(st["near"])]
		col = Color(0.95, 0.90, 0.78)
	else:
		txt = "%s  ·  needs Fishing %d" % [String(st["near"]), int(st["near_level"])]
		col = Color(0.72, 0.60, 0.58)

	var w: float = _font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 19).x
	var box := Rect2(Vector2((vp.x - w) * 0.5 - 20.0, vp.y - 150.0), Vector2(w + 40.0, 46.0))
	draw_rect(box, Color(0.01, 0.04, 0.07, 0.78), true)
	draw_rect(box, Color(col.r, col.g, col.b, 0.45), false, 1.5)
	draw_string(_font, Vector2(box.position.x + 20.0, box.position.y + 30.0), txt,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 19, col)
