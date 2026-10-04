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
## ITS LOOK (Kong, 2026-10-04: like the fishing dial, "more game-like ... fits
## our aesthetic"): the dial's instrument laid flat (fx/aim_bar.gdshader): dark
## wood with a brass line round a cream paper track, the bands as watercolour
## washes, the one under the needle lit full. The needle is a tapered ink
## pointer on a brass cap that takes the colour of the band it is over (gold:
## press now for a crit), with a soft trail; the order's word in Cinzel under
## it with its key; a lock bursts embers in the result's colour. It floats free
## over the water (the deck's paper fades while you aim).
##
## WHAT THE ENEMY DOES TO IT (Battle.aim_for): the zone's speed stack (up to
## four times), a crit seam that drifts inside the zone (Rolling Plate), fog
## rolling over the rail, and an affliction for a pass or two:
##   DECOYS     a false court: two gilded bands sliding on their own; lock on
##              one and the shot fumbles ("fumble").
##   HARDENED   iron shutters over the rail: the first press only cracks them
##              (sparks), the second judges.
##   SQUALL     the needle pitches with the gusts and rain streaks the bar.
## And two statuses on the captain (Battle.aim_for):
##   BLINDED    the bar is dark but for a window round the needle: find the
##              zone as the needle passes it.
##   NARROWED   every band (crit, hit, graze) smaller, judged the same.

signal locked(result: String)

var _shade: Texture2D
var _face: ColorRect
var _burst: float = 0.0
var _burst_col: Color = Color(1.0, 0.85, 0.4)
var _burst_x: float = 0.5
var _embers: Array = []
var _trail: Array = []

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
## Blinded: the half-width of sight round the needle (0: sighted).
var blind: float = 0.0
## Narrowed: the bands' scale (1: whole).
var narrow: float = 1.0

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
	custom_minimum_size = Vector2(720, 132)
	_face = ColorRect.new()
	_face.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_face.show_behind_parent = true
	var m: ShaderMaterial = ShaderMaterial.new()
	m.shader = load("res://game/fx/aim_bar.gdshader")
	_face.material = m
	add_child(_face)
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	_zone = 0.3 + randf() * 0.4
	_zdir = -1.0 if randf() < 0.5 else 1.0
	var max_off: float = maxf(0.0, (Battle.HIT_W + Battle.GRAZE_W) * narrow - crit_w)
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
			var max_off2: float = maxf(0.0, (Battle.HIT_W + Battle.GRAZE_W) * narrow - crit_w)
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
		var lo: float = (Battle.HIT_W + Battle.GRAZE_W) * narrow
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
	_burst = maxf(0.0, _burst - delta * 2.2)
	for em: Dictionary in _embers:
		em["t"] = float(em["t"]) + delta
		em["p"] = (em["p"] as Vector2) + (em["v"] as Vector2) * delta
		em["v"] = (em["v"] as Vector2) * (1.0 - delta * 2.0) + Vector2(0, 260.0 * delta)
	_embers = _embers.filter(func(em: Dictionary) -> bool: return float(em["t"]) < float(em["life"]))
	if not _done:
		_trail.push_front(_pos)
		if _trail.size() > 7:
			_trail.pop_back()
	_feed()
	if afflict == "squall":
		for i: int in _rain.size():
			_rain[i] = Vector2(fmod(_rain[i].x + delta * 0.35, 1.0), fmod(_rain[i].y + delta * 2.2, 1.0))
	queue_redraw()


## The track, in the bar's own box.
func _rail() -> Rect2:
	return Rect2(30, 22, size.x - 60, 40)


## Which band the needle is over: 3 the crit, 2 the hit, 1 the graze, 0 none.
func _lit() -> int:
	if absf(_pos - (_zone + _seam)) <= crit_w:
		return 3
	var dz: float = absf(_pos - _zone)
	if dz <= Battle.HIT_W * narrow:
		return 2
	if dz <= (Battle.HIT_W + Battle.GRAZE_W) * narrow:
		return 1
	return 0


const LIT_COL: Array = [Color(0.93, 0.89, 0.8), Color(0.95, 0.84, 0.58), Color(0.5, 0.9, 0.6), Color(1.0, 0.84, 0.38)]


func _feed() -> void:
	if _face == null:
		return
	var m: ShaderMaterial = _face.material
	var r: Rect2 = _rail()
	m.set_shader_parameter("u_size", size)
	m.set_shader_parameter("u_track", Vector4(r.position.x, r.position.y, r.size.x, r.size.y))
	m.set_shader_parameter("u_zone", _zone)
	m.set_shader_parameter("u_hit", Battle.HIT_W * narrow)
	m.set_shader_parameter("u_graze", Battle.GRAZE_W * narrow)
	m.set_shader_parameter("u_crit_c", _zone + _seam)
	m.set_shader_parameter("u_crit", crit_w)
	m.set_shader_parameter("u_lit", _lit() if blind <= 0.0 else 0)
	m.set_shader_parameter("u_burst", _burst)
	m.set_shader_parameter("u_burst_col", Vector3(_burst_col.r, _burst_col.g, _burst_col.b))
	m.set_shader_parameter("u_burst_x", _burst_x)


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
		var rr: Rect2 = _rail()
		for k: int in 18:
			_sparks.append({ "p": Vector2(rr.position.x + rr.size.x * _pos, rr.get_center().y), "v": Vector2(randf_range(-220, 220), randf_range(-260, -60)), "t": 0.0 })
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
		res = Battle.judge(_pos, _zone, -1.0, narrow)
	_flash = res
	_lock_burst(res)
	Rumble.tap(18 if res == "critical" else 10)
	match res:
		"critical":
			Sound.perfect()
		"hit":
			Sound.plip()
		_:
			Sound.slack()
	locked.emit(res)


## The lock: embers thrown from the needle in the result's colour, the paper
## washed with it for a moment.
func _lock_burst(res: String) -> void:
	var col: Color = { "critical": LIT_COL[3], "hit": LIT_COL[2], "graze": LIT_COL[1] }.get(res, Color(0.7, 0.68, 0.64))
	var n: int = { "critical": 30, "hit": 16, "graze": 8 }.get(res, 5)
	var r: Rect2 = _rail()
	var at: Vector2 = Vector2(r.position.x + r.size.x * _pos, r.position.y - 2.0)
	for k: int in n:
		var a: float = randf_range(-PI * 0.95, -PI * 0.05)
		_embers.append({ "p": at, "v": Vector2.from_angle(a) * randf_range(120, 340 if res == "critical" else 220), "t": 0.0, "life": randf_range(0.45, 0.9), "c": col, "r": randf_range(2.0, 4.5) })
	_burst = 1.0
	_burst_col = col
	_burst_x = _pos


func _draw() -> void:
	var w: float = size.x
	var h: float = size.y
	var rail: Rect2 = _rail()
	var px: Callable = func(u: float) -> float: return rail.position.x + rail.size.x * u
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

	# Blinded: dark over the rail but for a soft window round the needle.
	if blind > 0.0 and not _done:
		var wx0: float = px.call(_pos - blind)
		var wx1: float = px.call(_pos + blind)
		var dark: Color = Color(0.05, 0.04, 0.035, 0.97)
		var top: float = rail.position.y - 6.0
		var hgt: float = rail.size.y + 12.0
		draw_rect(Rect2(rail.position.x - 6.0, top, maxf(0.0, wx0 - rail.position.x + 6.0), hgt), dark)
		draw_rect(Rect2(wx1, top, maxf(0.0, rail.end.x + 6.0 - wx1), hgt), dark)
		for k: int in 8:
			var fa: float = dark.a * (1.0 - (k + 1) / 9.0)
			draw_rect(Rect2(wx0 + k * 3.0, top, 3.0, hgt), Color(dark, fa))
			draw_rect(Rect2(wx1 - (k + 1) * 3.0, top, 3.0, hgt), Color(dark, fa))
	# The needle: a tapered ink pointer on a brass cap, in the colour of the
	# band it is over, a soft trail behind it.
	var nx: float = px.call(_pos)
	var ncol: Color = LIT_COL[_lit()] if blind <= 0.0 else LIT_COL[0]
	for k: int in range(_trail.size() - 1, 0, -1):
		var tx: float = px.call(float(_trail[k]))
		draw_line(Vector2(tx, rail.position.y + 3), Vector2(tx, rail.end.y - 3), Color(ncol, 0.14 * (1.0 - float(k) / _trail.size())), 3.0)
	var top: float = rail.position.y - 14.0
	var bot: float = rail.end.y + 12.0
	var mid: float = rail.get_center().y
	var outline: PackedVector2Array = PackedVector2Array([Vector2(nx, top), Vector2(nx + 4.5, mid), Vector2(nx, bot), Vector2(nx - 4.5, mid)])
	draw_colored_polygon(outline, Color(0.12, 0.09, 0.08, 0.95))
	draw_colored_polygon(PackedVector2Array([Vector2(nx, top + 5), Vector2(nx + 2.2, mid), Vector2(nx, bot - 4), Vector2(nx - 2.2, mid)]), ncol)
	draw_circle(Vector2(nx, top), 7.5, Color(0.12, 0.09, 0.08, 0.95))
	draw_circle(Vector2(nx, top), 6.0, Color(0.79, 0.64, 0.36))
	draw_circle(Vector2(nx - 1.8, top - 1.8), 2.0, Color(1.0, 0.94, 0.78, 0.9))
	# The embers of a lock.
	if true:
		for em: Dictionary in _embers:
			var eu: float = float(em["t"]) / float(em["life"])
			var er: float = float(em["r"]) * (1.0 - eu * 0.5)
			draw_texture_rect(_glow_tex(), Rect2(em["p"] - Vector2(er, er) * 3.0, Vector2(er, er) * 6.0), false, Color(em["c"], 0.5 * (1.0 - eu)))
			draw_circle(em["p"], er * 0.6, Color(Color(em["c"]).lightened(0.4), 1.0 - eu))
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
		# The order in Cinzel, its key in a chip beside it (as the dial's
		# REEL IN), and what the enemy is doing to the bar under them.
		var word: String = "VOLLEY" if volley else "FIRE"
		var wf: Font = Kit.font("cinzel", 800)
		var ww: float = wf.get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, 26).x + 6.0 * word.length()
		var kf: Font = Kit.font("karla", 800)
		var kw: float = kf.get_string_size("SPACE", HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + 14.0
		var x0: float = w / 2.0 - (ww + 12.0 + kw) / 2.0
		var by: float = rail.end.y + 52.0
		var cx: float = x0
		for ch: String in word:
			draw_string_outline(wf, Vector2(cx, by), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, 26, 5, Color(0, 0, 0, 0.55))
			draw_string(wf, Vector2(cx, by), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, 26, Color(0.96, 0.9, 0.76))
			cx += wf.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, 26).x + 6.0
		var kr: Rect2 = Rect2(x0 + ww + 12.0, by - 16.0, kw, 18.0)
		draw_rect(kr, Color(0, 0, 0, 0.35))
		draw_rect(kr, Color(0.96, 0.9, 0.76, 0.6), false, 1.0)
		draw_string(kf, Vector2(kr.position.x + 7.0, kr.position.y + 13.0), "SPACE", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(0.96, 0.9, 0.76, 0.9))
		var hint: String = ""
		if blind > 0.0:
			hint = "BLINDED  ·  YOU SEE ONLY NEAR THE NEEDLE"
		elif narrow < 0.99:
			hint = "NARROWED  ·  A SMALLER MARK TO HIT"
		if afflict == "hardened" and not _cracked:
			hint = "IRON SHUTTERS  ·  KNOCK ONCE TO CRACK THEM"
		elif afflict == "decoys":
			hint = "A FALSE COURT  ·  ONLY THE GREEN ZONE IS REAL"
		elif afflict == "squall":
			hint = "A SQUALL  ·  THE NEEDLE PITCHES WITH THE GUSTS"
		if hint != "":
			var hw: float = Kit.font("karla", 700).get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
			draw_string(Kit.font("karla", 700), Vector2(w / 2.0 - hw / 2.0, by + 20.0), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.95, 0.75, 0.6, 0.85))


static var _gt: Texture2D


static func _glow_tex() -> Texture2D:
	if _gt == null:
		_gt = Glow.radial(64, Color.WHITE)
	return _gt
