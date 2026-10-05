class_name AimDial
extends AimBar
## FINN'S DIAL (the finale's aim, aimStyle "dial"; Kong, 2026-10-05: "a hybrid
## of the fishing dial and expedition aim styling"). The aim bar in polar
## coordinates, as on the web: the same needle, zone, judgment and enemy
## afflictions (it IS an AimBar), drawn round a dial. The needle and the band
## both turn back at a mark at twelve o'clock, so judgment stays linear.
##
## ITS LOOK: the fishing dial's shape (a round face with rim ticks, the bands
## on a ring, a needle from the hub) in the aim bar's flat dress (a dark
## lacquer face with a hairline edge, solid bands: a muted amber graze, the
## hit green, a gold crit seam, the one under the needle at full strength; the
## needle a flat bar in its band's colour with brackets at its tip; a lock
## rings out and throws embers; FIRE with its key under it).
##
## FISHING GEAR FEEDS IT (lib/dialAim): the hook's tiers and the rod's catch
## zone widen the hit band (in degrees, as fishing zones are), the reel slows
## the needle (its fishing slowdown carried at 0.32). Nothing widens the crit.
## Bands are scaled for a full circle: hit and graze x0.34, crit x0.9.

const HIT_SCALE: float = 0.34
const CRIT_SCALE: float = 0.90
const REEL_RELIEF: float = 0.32
const MAX_HIT_BONUS: float = 0.055

const PANEL: Color = Color(0.135, 0.11, 0.095)
const TRACK: Color = Color(0.07, 0.06, 0.055)
const GRAZE_C: Color = Color(0.86, 0.62, 0.3)
const HIT_C: Color = Color(0.4, 0.78, 0.52)
const CRIT_C: Color = Color(0.98, 0.8, 0.32)

## The Perfect Streak riding into this shot (shown under the dial).
var streak: float = 0.0
var streak_label: String = ""
var streak_per: float = 0.0
var pierce_at: float = 0.0


## The fishing gear's pull on the dial (dialAimBonus): the hit band's extra
## half-width and the needle's speed.
static func gear(p: Dictionary) -> Dictionary:
	var rod: Dictionary = Rules.effective_rod(Js.num(p.get("rod_tier")), p.get("completionist_effects"))
	var deg: float = clampf(Js.num(p.get("hook_tier")), 0.0, 8.0) * 3.0 + Js.num(rod.get("catchZoneBonus"))
	var reels: Array = Rules.data()["reels"]
	var reel: Dictionary = reels[clampi(int(Js.num(p.get("reel_tier"))), 0, reels.size() - 1)]
	var mult: float = float(Js.nz(reel.get("needleSpeedMultiplier"), 1.0))
	return { "hitBonus": minf(MAX_HIT_BONUS, deg / 2.0 / 360.0), "needleMult": 1.0 - (1.0 - mult) * REEL_RELIEF }


## Set the dial's bands and needle from the gear (call before it is added).
func fit(g: Dictionary) -> void:
	hit_w = (Battle.HIT_W + float(g["hitBonus"])) * HIT_SCALE
	graze_w = Battle.GRAZE_W * HIT_SCALE
	crit_w *= CRIT_SCALE
	needle_mult *= float(g["needleMult"])


func _ready() -> void:
	super._ready()
	# No bar face: the dial draws its own.
	_face.visible = false
	custom_minimum_size = Vector2(420, 470)


func _feed() -> void:
	pass


func _center() -> Vector2:
	return Vector2(size.x / 2.0, 214.0)


const R: float = 150.0
const BAND_R: float = 118.0
const BAND_W: float = 30.0


## A point along the ring for u in 0..1, clockwise from twelve o'clock.
func _ang(u: float) -> float:
	return -PI / 2.0 + u * TAU


func _arc(c: Vector2, u0: float, u1: float, r: float, w: float, col: Color) -> void:
	var a0: float = _ang(clampf(u0, 0.0, 1.0))
	var a1: float = _ang(clampf(u1, 0.0, 1.0))
	if a1 <= a0:
		return
	draw_arc(c, r, a0, a1, maxi(6, int((a1 - a0) / 0.03)), col, w, true)


func _needle_point() -> Vector2:
	return _center() + Vector2.from_angle(_ang(_pos)) * BAND_R


func _lock_burst(res: String) -> void:
	var col: Color = { "critical": LIT_COL[3], "hit": LIT_COL[2], "graze": LIT_COL[1] }.get(res, Color(0.7, 0.68, 0.64))
	var n: int = { "critical": 34, "hit": 18, "graze": 9 }.get(res, 5)
	var c: Vector2 = _center()
	var dir: Vector2 = Vector2.from_angle(_ang(_pos))
	var at: Vector2 = c + dir * BAND_R
	for k: int in n:
		var a: float = dir.angle() + randf_range(-1.1, 1.1)
		_embers.append({ "p": at, "v": Vector2.from_angle(a) * randf_range(120, 360 if res == "critical" else 230), "t": 0.0, "life": randf_range(0.45, 0.9), "c": col, "r": randf_range(2.0, 4.5) })
	_burst = 1.0
	_burst_col = col
	_burst_x = _pos
	_ring = 0.0


func _draw() -> void:
	var c: Vector2 = _center()
	var lit: int = _lit() if blind <= 0.0 else 0
	# THE FACE: flat lacquer, a hairline edge, a soft shadow under it.
	draw_circle(c + Vector2(0, 5), R + 10.0, Color(0, 0, 0, 0.32))
	draw_circle(c, R + 8.0, Color(PANEL, 0.97))
	draw_arc(c, R + 8.0, 0.0, TAU, 128, Color(1, 1, 1, 0.12), 1.2, true)
	# The inner face, a shade lighter, with a hairline ring (the fishing dial's
	# face, in lacquer).
	draw_circle(c, BAND_R - BAND_W / 2.0 - 4.0, PANEL.lightened(0.045))
	draw_arc(c, 62.0, 0.0, TAU, 96, Color(1, 1, 1, 0.06), 1.0, true)
	# The track ring and its ticks (the fishing dial's rim).
	draw_arc(c, BAND_R, 0.0, TAU, 160, TRACK, BAND_W, true)
	for t: int in 48:
		var a: float = TAU * t / 48.0
		var u: Vector2 = Vector2.from_angle(a)
		var long: bool = t % 4 == 0
		draw_line(c + u * (R - 4.0), c + u * (R - (12.0 if long else 7.0)), Color(1, 1, 1, 0.16 if long else 0.08), 1.2, true)
	# THE BANDS, solid: the one under the needle at full strength.
	var gz: float = (hit_w + graze_w) * narrow
	var hz: float = hit_w * narrow
	_arc(c, _zone - gz, _zone + gz, BAND_R, BAND_W, TRACK.lerp(GRAZE_C, 0.95 if lit == 1 else 0.5))
	_arc(c, _zone - hz, _zone + hz, BAND_R, BAND_W, TRACK.lerp(HIT_C, 1.0 if lit == 2 else 0.62))
	var cc: float = _zone + _seam
	_arc(c, cc - crit_w, cc + crit_w, BAND_R, BAND_W, TRACK.lerp(CRIT_C, 1.0 if lit == 3 else 0.85))
	# A lock flashes the band it hit.
	if _burst > 0.0:
		_arc(c, _burst_x - 0.045, _burst_x + 0.045, BAND_R, BAND_W, Color(_burst_col, _burst * 0.5))
	draw_arc(c, BAND_R - BAND_W / 2.0, 0.0, TAU, 128, Color(1, 1, 1, 0.07), 1.0, true)
	draw_arc(c, BAND_R + BAND_W / 2.0, 0.0, TAU, 128, Color(1, 1, 1, 0.07), 1.0, true)
	# The false court's gilded bands.
	for d: Dictionary in _decoys:
		_arc(c, float(d["p"]) - DECOY_HALF, float(d["p"]) + DECOY_HALF, BAND_R, BAND_W - 8.0, Color(0.95, 0.8, 0.35, 0.55 + 0.15 * sin(_t * 5.0 + float(d["k"]))))
	# Fog drifting round the ring.
	if fog > 0.0:
		for k: int in 14:
			var u: float = fposmod(k * 0.071 + _t * (0.025 + 0.01 * (k % 3)), 1.0)
			draw_circle(c + Vector2.from_angle(_ang(u)) * BAND_R, BAND_W * (0.8 + 0.2 * sin(_t + k)), Color(0.82, 0.86, 0.9, fog * 0.28))
	# Iron shutters over the ring, until knocked.
	if afflict == "hardened":
		for k: int in 8:
			var u0: float = k / 8.0 + 0.008
			var u1: float = (k + 1) / 8.0 - 0.008
			_arc(c, u0, u1, BAND_R, BAND_W + 6.0, Color(0.22, 0.24, 0.27, 0.45 if _cracked else 0.9))
	# Blinded: the ring dark but for a window round the needle.
	if blind > 0.0 and not _done:
		var dark: Color = Color(0.05, 0.04, 0.035, 0.96)
		_arc(c, 0.0, _pos - blind, BAND_R, BAND_W + 4.0, dark)
		_arc(c, _pos + blind, 1.0, BAND_R, BAND_W + 4.0, dark)
	# The turnaround mark at twelve o'clock (the needle and the band turn here).
	draw_colored_polygon(PackedVector2Array([c + Vector2(-6, -R - 10.0), c + Vector2(6, -R - 10.0), c + Vector2(0, -R + 2.0)]), Color(CRIT_C, 0.85))
	# THE NEEDLE: a flat bar from the hub in its band's colour, brackets at the
	# tip, a faint trail.
	var ncol: Color = LIT_COL[lit]
	for k: int in range(_trail.size() - 1, 0, -1):
		var tu: Vector2 = Vector2.from_angle(_ang(float(_trail[k])))
		draw_line(c + tu * 30.0, c + tu * (BAND_R + BAND_W / 2.0), Color(ncol, 0.1 * (1.0 - float(k) / _trail.size())), 3.0, true)
	var nu: Vector2 = Vector2.from_angle(_ang(_pos))
	var side: Vector2 = Vector2(-nu.y, nu.x)
	var tip: Vector2 = c + nu * (BAND_R + BAND_W / 2.0 + 6.0)
	draw_line(c + nu * 18.0, tip, ncol, 4.0, true)
	for sx: float in [-1.0, 1.0]:
		var b0: Vector2 = tip + side * sx * 9.0
		draw_polyline(PackedVector2Array([b0 - nu * 6.0, b0, b0 - side * sx * 5.0 + nu * 0.0]), ncol, 2.0, true)
	# The hub.
	draw_circle(c, 18.0, PANEL.lightened(0.08))
	draw_arc(c, 18.0, 0.0, TAU, 48, Color(ncol, 0.8), 2.0, true)
	draw_circle(c, 6.0, ncol)
	# A lock's shockwave out from the tip.
	if _ring >= 0.0:
		var ru: float = _ring / 0.6
		draw_arc(c + Vector2.from_angle(_ang(_burst_x)) * BAND_R, 14.0 + ru * 110.0, 0.0, TAU, 48, Color(_burst_col, 0.6 * (1.0 - ru)), 2.0, true)
	for sp: Dictionary in _sparks:
		draw_circle(sp["p"], 2.0, Color(1.0, 0.75, 0.35, 1.0 - float(sp["t"]) / 0.6))
	for em: Dictionary in _embers:
		var eu: float = float(em["t"]) / float(em["life"])
		var er: float = float(em["r"]) * (1.0 - eu * 0.5)
		draw_texture_rect(_glow_tex(), Rect2(em["p"] - Vector2(er, er) * 3.0, Vector2(er, er) * 6.0), false, Color(em["c"], 0.5 * (1.0 - eu)))
		draw_circle(em["p"], er * 0.6, Color(Color(em["c"]).lightened(0.4), 1.0 - eu))
	if afflict == "squall":
		for rp: Vector2 in _rain:
			var a2: Vector2 = Vector2(size.x * rp.x, size.y * rp.y * 0.85)
			draw_line(a2, a2 + Vector2(-8, 16), Color(0.75, 0.85, 0.95, 0.4), 1.2, true)
	# The word: the result over the dial, or the order and its key under it.
	var f: Font = Kit.font("cinzel", 800)
	if _flash != "":
		var word: String = { "critical": "CRITICAL!", "hit": "HIT", "graze": "GRAZE", "miss": "MISS", "fumble": "FALSE COLORS!" }[_flash]
		var c2: Color = { "critical": Color(1, 0.85, 0.35), "hit": Color(0.55, 0.9, 0.6), "graze": Color(0.95, 0.88, 0.62), "miss": Color(0.9, 0.5, 0.45), "fumble": Color(0.95, 0.5, 0.35) }[_flash]
		var u2: float = clampf(_flash_t / 0.5, 0.0, 1.0)
		var fs: int = int(lerpf(34.0, 26.0, u2))
		var tw: float = f.get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string_outline(f, Vector2(c.x - tw / 2.0, c.y + 12.0), word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 6, Color(0, 0, 0, 0.75))
		draw_string(f, Vector2(c.x - tw / 2.0, c.y + 12.0), word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, c2)
	var by: float = c.y + R + 46.0
	var word2: String = "VOLLEY" if volley else "FIRE"
	var wf: Font = Kit.font("karla", 800)
	var fs2: int = 24
	var ww: float = wf.get_string_size(word2, HORIZONTAL_ALIGNMENT_LEFT, -1, fs2).x + 3.0 * word2.length()
	var kw: float = wf.get_string_size("SPACE", HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x + 18.0
	var x0: float = size.x / 2.0 - (ww + 12.0 + kw) / 2.0
	if _flash == "":
		var cx: float = x0
		for ch: String in word2:
			draw_string(wf, Vector2(cx, by), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs2, Color(1, 0.97, 0.9))
			cx += wf.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs2).x + 3.0
		var kr: Rect2 = Rect2(x0 + ww + 12.0, by - 18.0, kw, 20.0)
		BattleLook.draw_box(self, kr, BattleLook.box(Color(1, 1, 1, 0.12), Color(1, 1, 1, 0.3), 1, 10))
		draw_string(wf, Vector2(kr.position.x + 9.0, kr.position.y + 14.5), "SPACE", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(1, 1, 1, 0.9))
	# The streak, and what the enemy is doing to the dial.
	var lines: Array = []
	if streak_per > 0.0 and streak >= 1.0:
		var line: String = "%s %d  ·  CRITS +%d%%" % [streak_label.to_upper(), int(streak), int(round(streak_per * streak * 100.0))]
		if pierce_at > 0.0 and streak >= pierce_at:
			line += "  ·  THROUGH HIS PLATE"
		lines.append([line, Color(CRIT_C, 0.95)])
	else:
		lines.append(["GOLD IS A CRITICAL  ·  CRITS IN A ROW BUILD A STREAK" if streak_per > 0.0 else "GOLD IS A CRITICAL", Color(1, 1, 1, 0.55)])
	if blind > 0.0:
		lines.append(["BLINDED  ·  YOU SEE ONLY NEAR THE NEEDLE", Color(0.95, 0.75, 0.6, 0.85)])
	elif narrow < 0.99:
		lines.append(["NARROWED  ·  A SMALLER MARK TO HIT", Color(0.95, 0.75, 0.6, 0.85)])
	var hf: Font = Kit.font("karla", 700)
	for k: int in lines.size():
		var hw: float = hf.get_string_size(lines[k][0], HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		draw_string(hf, Vector2(size.x / 2.0 - hw / 2.0, by + 22.0 + k * 16.0), lines[k][0], HORIZONTAL_ALIGNMENT_LEFT, -1, 11, lines[k][1])
