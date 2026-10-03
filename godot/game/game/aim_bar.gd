class_name AimBar
extends Control
## THE AIM BAR (Godot port of RaidCombat's AimBarInline): a brass needle runs
## along a wooden rail and back (the web's 0.006 of the rail a frame at 60, a
## sweep in 2.8 s) while the target zone drifts at the enemy's speed, slowed
## by your Navigation. Press (Space, Enter, or a click) and the shot is judged
## where the needle IS: raw, no settling (the web's law). The gold band is the
## crit (a Sharpshot widens it), green the hit, the pale fringe a graze.
## Emits locked(result) with "critical", "hit", "graze" or "miss".
##
## WHAT THE ENEMY DOES TO IT (Battle.aim_for): the zone's speed stack (up to
## four times), a crit seam that drifts inside the zone (Rolling Plate), fog
## rolling over the rail, and an affliction for a pass or two:
##   DECOYS     a false court: two gilded bands sliding on their own; lock on
##              one and the shot fumbles ("fumble").
##   HARDENED   iron shutters over the rail: the first press only cracks them
##              (sparks), the second judges.
##   SQUALL     the needle pitches with the gusts and rain streaks the bar.

signal locked(result: String)

var enemy_speed: float = 4.0
var nav: float = 0.0
var crit_w: float = Battle.CRIT_W
var volley: bool = false
## Battle.aim_for's read for this pass.
var zone_stack: float = 1.0
var needle_mult: float = 1.0
var crit_drift: float = 0.0
var fog: float = 0.0
var afflict: String = ""
var decoy_n: int = 0

const DECOY_HALF: float = 0.06 * 0.62

var _seam: float = 0.0
var _seam_dir: float = 1.0
var _decoys: Array = []
var _cracked: bool = false
var _gust_ph: float = 0.0
var _sparks: Array = []
var _rain: Array = []

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
	var max_off: float = maxf(0.0, Battle.HIT_W + Battle.GRAZE_W - crit_w)
	_seam = (randf() * 2.0 - 1.0) * max_off * 0.8
	_seam_dir = -1.0 if randf() < 0.5 else 1.0
	_gust_ph = randf() * TAU
	var lo2: float = 0.098
	var hi2: float = 0.902
	for k: int in decoy_n:
		var at: float = lo2 + (hi2 - lo2) * ((0.32 + randf() * 0.36) if decoy_n == 1 else float(k) / float(decoy_n - 1))
		_decoys.append({ "p": at, "dir": 1.0 if k % 2 == 0 else -1.0, "k": k })
	for k: int in 40:
		_rain.append(Vector2(randf(), randf()))
	grab_focus.call_deferred()


func _process(delta: float) -> void:
	_t += delta
	if not _done:
		var f: float = delta * 60.0
		var gust: float = 1.0 + 0.38 * sin(Time.get_ticks_msec() / 440.0 + _gust_ph) if afflict == "squall" else 1.0
		_pos += 0.006 * needle_mult * gust * _dir * f
		if _pos >= 1.0:
			_pos = 2.0 - _pos
			_dir = -1.0
		elif _pos <= 0.0:
			_pos = -_pos
			_dir = 1.0
		var zs: float = enemy_speed * 0.0008 / (1.0 + nav * 0.015) * minf(4.0, zone_stack)
		# The crit seam rolls inside the zone; the false court's bands slide.
		if crit_drift > 0.0:
			var max_off2: float = maxf(0.0, Battle.HIT_W + Battle.GRAZE_W - crit_w)
			_seam += 0.0022 * crit_drift * _seam_dir * f
			if absf(_seam) > max_off2:
				_seam = signf(_seam) * max_off2
				_seam_dir = -_seam_dir
		for d: Dictionary in _decoys:
			var dsp: float = zs * (1.25 + (int(d["k"]) % 2) * 0.55) * 0.38
			d["p"] = float(d["p"]) + dsp * float(d["dir"]) * f
			if float(d["p"]) > 0.902 or float(d["p"]) < 0.098:
				d["p"] = clampf(float(d["p"]), 0.098, 0.902)
				d["dir"] = -float(d["dir"])
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
	for sp: Dictionary in _sparks:
		sp["t"] = float(sp["t"]) + delta
		sp["p"] = (sp["p"] as Vector2) + (sp["v"] as Vector2) * delta
		sp["v"] = (sp["v"] as Vector2) + Vector2(0, 600.0 * delta)
	_sparks = _sparks.filter(func(sp: Dictionary) -> bool: return float(sp["t"]) < 0.6)
	if afflict == "squall":
		for i: int in _rain.size():
			_rain[i] = Vector2(fmod(_rain[i].x + delta * 0.35, 1.0), fmod(_rain[i].y + delta * 2.2, 1.0))
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
	# Iron shutters: the first knock only cracks them.
	if afflict == "hardened" and not _cracked:
		_cracked = true
		var w: float = size.x
		for k: int in 18:
			_sparks.append({ "p": Vector2(14 + (w - 28) * _pos, size.y * 0.5), "v": Vector2(randf_range(-220, 220), randf_range(-260, -60)), "t": 0.0 })
		Sound.impact(false)
		Rumble.tap(14)
		return
	_done = true
	# A false court: locked on a decoy, the shot never leaves.
	for d: Dictionary in _decoys:
		if absf(_pos - float(d["p"])) <= DECOY_HALF:
			_flash = "fumble"
			Rumble.tap(20)
			Sound.slack()
			locked.emit("fumble")
			return
	# The crit is judged at the seam (it may drift); the rest at the zone.
	var res: String
	if absf(_pos - (_zone + _seam)) <= crit_w:
		res = "critical"
	else:
		res = Battle.judge(_pos, _zone, -1.0)
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
	# The rail: a lacquer trough in a brass collar (game/battle_look.gd).
	BattleLook.draw_box(self, rail.grow(7), BattleLook.box(BattleLook.LACQUER_LO, BattleLook.BRASS_LO, 2, 13, 8.0))
	BattleLook.draw_box(self, rail, BattleLook.box(Color("#140e0a"), Color(0, 0, 0, 0.7), 1, 7))
	for k: int in range(1, 12):
		var gx: float = rail.position.x + rail.size.x * float(k) / 12.0
		draw_line(Vector2(gx, rail.position.y + 3), Vector2(gx, rail.end.y - 3), Color(1, 1, 1, 0.05 if k % 3 else 0.1), 1.0)
	var px: Callable = func(u: float) -> float: return rail.position.x + rail.size.x * u
	var gw: float = Battle.HIT_W + Battle.GRAZE_W
	# The bands, widest first.
	BattleLook.draw_box(self, Rect2(px.call(_zone - gw), rail.position.y + 1, rail.size.x * gw * 2.0, rail.size.y - 2), BattleLook.box(Color(0.95, 0.88, 0.62, 0.2), Color(0.95, 0.88, 0.62, 0.45), 1, 5))
	var hr: Rect2 = Rect2(px.call(_zone - Battle.HIT_W), rail.position.y + 1, rail.size.x * Battle.HIT_W * 2.0, rail.size.y - 2)
	BattleLook.draw_box(self, hr, BattleLook.box(Color(0.24, 0.62, 0.38, 0.95), Color(0.62, 1.0, 0.72, 0.7), 1, 5))
	BattleLook.draw_box(self, Rect2(hr.position, Vector2(hr.size.x, hr.size.y * 0.5)), BattleLook.box(Color(0.42, 0.82, 0.55, 0.9), Color(0, 0, 0, 0), 0, 5))
	var cg: float = 0.5 + 0.5 * sin(_t * 8.0)
	var seam: float = _zone + _seam
	var cr: Rect2 = Rect2(px.call(seam - crit_w), rail.position.y - 4, rail.size.x * crit_w * 2.0, rail.size.y + 8)
	BattleLook.draw_box(self, cr, BattleLook.box(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, 4, 10.0, Color(1.0, 0.82, 0.3, 0.5 + 0.3 * cg)))
	BattleLook.draw_box(self, cr, BattleLook.box(Color(1.0, 0.82, 0.3).lerp(Color(1, 0.95, 0.7), cg * 0.4), Color(1, 0.97, 0.8), 1, 3))
	# The false court: gilded bands that are not the zone.
	for d: Dictionary in _decoys:
		var dx: float = px.call(float(d["p"]))
		var dw: float = rail.size.x * DECOY_HALF * 2.0
		draw_rect(Rect2(dx - dw / 2.0, rail.position.y, dw, rail.size.y), Color(0.95, 0.8, 0.35, 0.55 + 0.15 * sin(_t * 5.0 + float(d["k"]))))
		draw_rect(Rect2(dx - 1.5, rail.position.y - 3, 3, rail.size.y + 6), Color(1.0, 0.86, 0.4, 0.8))
	# Fog rolling over the rail.
	if fog > 0.0:
		# Banks of mist drifting along the rail, kept inside it.
		var rr: float = rail.size.y * 0.5
		for k: int in 14:
			var fx: float = fposmod(k * 0.071 + _t * (0.025 + 0.01 * (k % 3)), 1.0)
			var cx: float = clampf(px.call(fx), rail.position.x + rr, rail.end.x - rr)
			var cy: float = rail.position.y + rr + sin(_t * 0.9 + k) * rr * 0.25
			draw_circle(Vector2(cx, cy), rr * (0.8 + 0.2 * sin(_t + k)), Color(0.82, 0.86, 0.9, fog * 0.28))
	# Iron shutters, until knocked.
	if afflict == "hardened":
		var open: float = 1.0 if _cracked else 0.0
		for k: int in 6:
			var sx: float = rail.position.x + rail.size.x * k / 6.0
			var sw: float = rail.size.x / 6.0
			var r2: Rect2 = Rect2(sx + 1, rail.position.y - 4 + (rail.size.y + 8) * open * (0.7 if k % 2 == 0 else 0.5), sw - 2, (rail.size.y + 8) * (1.0 - open * 0.75))
			draw_rect(r2, Color(0.22, 0.24, 0.27, 0.9 if not _cracked else 0.45))
			draw_rect(r2, Color(0.5, 0.5, 0.5, 0.5), false, 1.0)
	# A squall: rain driving across.
	if afflict == "squall":
		for rp: Vector2 in _rain:
			var a: Vector2 = Vector2(w * rp.x, h * rp.y)
			draw_line(a, a + Vector2(-8, 16), Color(0.75, 0.85, 0.95, 0.4), 1.2, true)
	for sp: Dictionary in _sparks:
		draw_circle(sp["p"], 2.0, Color(1.0, 0.75, 0.35, 1.0 - float(sp["t"]) / 0.6))
	BattleLook.draw_box(self, rail.grow(3), BattleLook.box(Color(0, 0, 0, 0), Color(BattleLook.BRASS, 0.6), 1, 9))
	# The needle: a brass pointer above and below the rail.
	var nx: float = px.call(_pos)
	var col: Color = Color(1, 0.96, 0.85)
	draw_line(Vector2(nx, rail.position.y - 10), Vector2(nx, rail.end.y + 10), Color(1, 0.95, 0.8, 0.18), 9.0)
	draw_line(Vector2(nx, rail.position.y - 10), Vector2(nx, rail.end.y + 10), Color(0, 0, 0, 0.55), 5.0)
	draw_line(Vector2(nx, rail.position.y - 10), Vector2(nx, rail.end.y + 10), col, 2.5)
	draw_colored_polygon(PackedVector2Array([Vector2(nx - 8, rail.position.y - 18), Vector2(nx + 8, rail.position.y - 18), Vector2(nx, rail.position.y - 6)]), Color(0.86, 0.68, 0.36))
	draw_colored_polygon(PackedVector2Array([Vector2(nx - 8, rail.end.y + 18), Vector2(nx + 8, rail.end.y + 18), Vector2(nx, rail.end.y + 6)]), Color(0.86, 0.68, 0.36))
	var f: Font = Kit.font("cinzel", 800)
	if _flash != "":
		var word: String = { "critical": "CRITICAL!", "hit": "HIT", "graze": "GRAZE", "miss": "MISS", "fumble": "FALSE COLORS!" }[_flash]
		var c2: Color = { "critical": Color(1, 0.85, 0.35), "hit": Color(0.55, 0.9, 0.6), "graze": Color(0.95, 0.88, 0.62), "miss": Color(0.9, 0.5, 0.45), "fumble": Color(0.95, 0.5, 0.35) }[_flash]
		var u: float = clampf(_flash_t / 0.5, 0.0, 1.0)
		var fs: int = int(lerpf(34.0, 26.0, u))
		var tw: float = f.get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string_outline(f, Vector2(nx - tw / 2.0, rail.position.y - 22), word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 6, Color(0, 0, 0, 0.7))
		draw_string(f, Vector2(nx - tw / 2.0, rail.position.y - 22), word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, c2)
	else:
		var hint: String = "VOLLEY  ·  SPACE TO FIRE" if volley else "SPACE TO FIRE"
		if afflict == "hardened" and not _cracked:
			hint = "IRON SHUTTERS  ·  KNOCK ONCE TO CRACK THEM"
		elif afflict == "decoys":
			hint = "A FALSE COURT  ·  ONLY THE GREEN ZONE IS REAL"
		elif afflict == "squall":
			hint = "A SQUALL  ·  THE NEEDLE PITCHES WITH THE GUSTS"
		var hw: float = Kit.font("karla", 700).get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
		draw_string(Kit.font("karla", 700), Vector2(w / 2.0 - hw / 2.0, h - 2), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.95, 0.9, 0.8, 0.7))
