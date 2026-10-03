class_name AimBar
extends Control
## THE AIM BAR (Godot port of RaidCombat's AimBarInline): a brass needle runs
## along a wooden rail and back (the web's 0.006 of the rail a frame at 60, a
## sweep in 2.8 s) while the target zone drifts at the enemy's speed, slowed
## by your Navigation. Press (Space, Enter, or a click) and the shot is judged
## where the needle IS: raw, no settling (the web's law). The gold band is the
## crit (a Sharpshot widens it), green the hit, the pale fringe a graze.
## Emits locked(result) with "critical", "hit", "graze" or "miss".

signal locked(result: String)

var enemy_speed: float = 4.0
var nav: float = 0.0
var crit_w: float = Battle.CRIT_W
var volley: bool = false

var _pos: float = 0.0
var _dir: float = 1.0
var _zone: float = 0.5
var _zdir: float = 1.0
var _done: bool = false
var _flash: String = ""
var _flash_t: float = 0.0
var _t: float = 0.0


func _ready() -> void:
	custom_minimum_size = Vector2(620, 74)
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	_zone = 0.3 + randf() * 0.4
	_zdir = -1.0 if randf() < 0.5 else 1.0
	grab_focus.call_deferred()


func _process(delta: float) -> void:
	_t += delta
	if not _done:
		var f: float = delta * 60.0
		_pos += 0.006 * _dir * f
		if _pos >= 1.0:
			_pos = 2.0 - _pos
			_dir = -1.0
		elif _pos <= 0.0:
			_pos = -_pos
			_dir = 1.0
		var zs: float = enemy_speed * 0.0008 / (1.0 + nav * 0.015)
		var lo: float = Battle.HIT_W + Battle.GRAZE_W
		_zone += zs * _zdir * f
		if _zone >= 1.0 - lo:
			_zone = 2.0 * (1.0 - lo) - _zone
			_zdir = -1.0
		elif _zone <= lo:
			_zone = 2.0 * lo - _zone
			_zdir = 1.0
	else:
		_flash_t += delta
	queue_redraw()


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		accept_event()
		lock()


func _unhandled_input(e: InputEvent) -> void:
	if _done or not is_visible_in_tree():
		return
	if e is InputEventKey and (e as InputEventKey).pressed and not (e as InputEventKey).echo and (e as InputEventKey).keycode in [KEY_SPACE, KEY_ENTER, KEY_KP_ENTER]:
		get_viewport().set_input_as_handled()
		lock()


func lock() -> void:
	if _done:
		return
	_done = true
	var res: String = Battle.judge(_pos, _zone, crit_w)
	_flash = res
	Rumble.tap(18 if res == "critical" else 10)
	match res:
		"critical":
			Sound.perfect()
		"hit":
			Sound.plip()
		_:
			Sound.slack()
	locked.emit(res)


func _draw() -> void:
	var w: float = size.x
	var h: float = size.y
	var rail: Rect2 = Rect2(14, h * 0.32, w - 28, h * 0.36)
	# The rail: dark wood with a brass rim.
	draw_rect(rail.grow(4), Color("#3a2716"))
	draw_rect(rail, Color("#5b3c22"))
	for k: int in 7:
		var gx: float = rail.position.x + rail.size.x * float(k) / 6.0
		draw_line(Vector2(gx, rail.position.y), Vector2(gx, rail.end.y), Color(0, 0, 0, 0.15), 1.0)
	var px: Callable = func(u: float) -> float: return rail.position.x + rail.size.x * u
	var gw: float = Battle.HIT_W + Battle.GRAZE_W
	# The bands, widest first.
	draw_rect(Rect2(px.call(_zone - gw), rail.position.y, rail.size.x * gw * 2.0, rail.size.y), Color(0.95, 0.88, 0.62, 0.35))
	draw_rect(Rect2(px.call(_zone - Battle.HIT_W), rail.position.y, rail.size.x * Battle.HIT_W * 2.0, rail.size.y), Color(0.36, 0.72, 0.42, 0.85))
	var cg: float = 0.5 + 0.5 * sin(_t * 8.0)
	draw_rect(Rect2(px.call(_zone - crit_w), rail.position.y - 3, rail.size.x * crit_w * 2.0, rail.size.y + 6), Color(1.0, 0.82, 0.3).lerp(Color(1, 0.95, 0.7), cg * 0.4))
	draw_rect(rail.grow(4), Color(0.78, 0.62, 0.36), false, 2.0)
	# The needle: a brass pointer above and below the rail.
	var nx: float = px.call(_pos)
	var col: Color = Color(1, 0.96, 0.85)
	draw_line(Vector2(nx, rail.position.y - 10), Vector2(nx, rail.end.y + 10), Color(0, 0, 0, 0.5), 5.0)
	draw_line(Vector2(nx, rail.position.y - 10), Vector2(nx, rail.end.y + 10), col, 3.0)
	draw_colored_polygon(PackedVector2Array([Vector2(nx - 8, rail.position.y - 18), Vector2(nx + 8, rail.position.y - 18), Vector2(nx, rail.position.y - 6)]), Color(0.86, 0.68, 0.36))
	draw_colored_polygon(PackedVector2Array([Vector2(nx - 8, rail.end.y + 18), Vector2(nx + 8, rail.end.y + 18), Vector2(nx, rail.end.y + 6)]), Color(0.86, 0.68, 0.36))
	var f: Font = Kit.font("cinzel", 800)
	if _flash != "":
		var word: String = { "critical": "CRITICAL!", "hit": "HIT", "graze": "GRAZE", "miss": "MISS" }[_flash]
		var c2: Color = { "critical": Color(1, 0.85, 0.35), "hit": Color(0.55, 0.9, 0.6), "graze": Color(0.95, 0.88, 0.62), "miss": Color(0.9, 0.5, 0.45) }[_flash]
		var u: float = clampf(_flash_t / 0.5, 0.0, 1.0)
		var fs: int = int(lerpf(34.0, 26.0, u))
		var tw: float = f.get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string_outline(f, Vector2(nx - tw / 2.0, rail.position.y - 22), word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 6, Color(0, 0, 0, 0.7))
		draw_string(f, Vector2(nx - tw / 2.0, rail.position.y - 22), word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, c2)
	else:
		var hint: String = "VOLLEY  ·  SPACE TO FIRE" if volley else "SPACE TO FIRE"
		var hw: float = Kit.font("karla", 700).get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
		draw_string(Kit.font("karla", 700), Vector2(w / 2.0 - hw / 2.0, h - 2), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.95, 0.9, 0.8, 0.7))
