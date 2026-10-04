class_name HullAura
extends Node2D
## WHAT A SHIP IN A FIGHT IS WEARING, drawn on it in the sea's own World
## (squashed by Chart.GROUND; anything standing is drawn upright):
##   ABLAZE     flames licking up the hull, embers and a column of smoke, and
##              a warm light flickering on the water.
##   ICED       a frost crust: the hull blued and pale, ice shards at the
##              waterline, cold mist breathing off it.
##   SHIELDED   a bubble of light over the hull, its rim shimmering (a crew
##              ward, a palisade, an enemy's barrier).
##   WARDED     the boss's vengeance ward: dark runes turning under it.
##   FORESIGHT  an eye of pale light opening over its masthead.
##   SURGING    after the ward saved it: a red heat around it.
##   THE LAST WALL  a curved rampart of iron plates rising out of the water in
##              front of it; each blow cracks a plate, and at the last it
##              bursts apart.
##   AND WHAT IS ON IT (2026-10-04, Kong: "everything should look and feel
##   good"), painted (FxSheet): MARKED a red hunter's reticle turning over the
##   masthead (our Spotter's Mark a gold one); WEAKENED a broken cutlass
##   hanging by the mast; FEEBLE planks splintering off; CORRODED acid running
##   down the hull; SLOWED an anchor dragging at the bow; SILENCED padlocks on
##   the gunports; ENRAGED red fire low on the deck; MENDING green motes;
##   FORTIFIED a ward ring; BLINDED or NARROWED a dark cloud round the
##   crow's nest; KRAKEN COILS a tentacle up the hull for each; FOG BANK a steam
##   bank hugging it; BOARDED grapnel ropes across it.
## Fed every frame by the battle stage (set()); it eases in and out.

const GROUND: float = 0.58

var width: float = 300.0
var face: float = -1.0
var burn: bool = false
var ice: bool = false
var shield: float = 0.0
var ward: bool = false
var foresight: bool = false
var surge: bool = false
var wall_left: float = 0.0
var wall_of: float = 0.0
## Statuses on it (status id -> true), coils, and the co-op marks.
var wear: Dictionary = {}
var coils: int = 0
var fog: bool = false
var spot: bool = false
var boarded: bool = false
const WEAR: Array = ["marked", "weaken", "feeble", "corrode", "slowed", "silence", "enrage", "regen", "fortify", "blinded", "narrowed", "coils", "fog", "spot", "boarded"]
var _wa: Dictionary = {}
var _drips: Array = []
var _planks: Array = []
var _motes: Array = []
var _lightl: Node2D

var _burn_a: float = 0.0
var _ice_a: float = 0.0
var _sh_a: float = 0.0
var _ward_a: float = 0.0
var _eye_a: float = 0.0
var _surge_a: float = 0.0
var _wall_a: float = 0.0
var _t: float = randf() * 10.0
var _sparks: Array = []
var _smoke: Array = []
var _shards: Array = []
var _light: PointLight2D
var _cracked: float = 0.0


func _ready() -> void:
	_light = PointLight2D.new()
	_light.texture = Glow.radial(128, Color(1.0, 0.6, 0.25), true)
	_light.texture_scale = 5.0
	_light.color = Color(1.0, 0.55, 0.2)
	_light.energy = 0.0
	add_child(_light)
	_lightl = Node2D.new()
	var m: CanvasItemMaterial = CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_lightl.material = m
	_lightl.draw.connect(_draw_light)
	add_child(_lightl)


func _process(delta: float) -> void:
	_t += delta
	var k: float = 1.0 - exp(-delta * 5.0)
	_burn_a = lerpf(_burn_a, 1.0 if burn else 0.0, k)
	_ice_a = lerpf(_ice_a, 1.0 if ice else 0.0, k)
	_sh_a = lerpf(_sh_a, 1.0 if shield > 0.0 else 0.0, k)
	_ward_a = lerpf(_ward_a, 1.0 if ward else 0.0, k)
	_eye_a = lerpf(_eye_a, 1.0 if foresight else 0.0, k)
	_surge_a = lerpf(_surge_a, 1.0 if surge else 0.0, k)
	_wall_a = lerpf(_wall_a, 1.0 if wall_left > 0.0 else 0.0, 1.0 - exp(-delta * 3.0))
	_cracked = lerpf(_cracked, (1.0 - wall_left / maxf(1.0, wall_of)) if wall_of > 0.0 else 0.0, k)
	_light.energy = _burn_a * (0.9 + 0.35 * sin(_t * 17.0) * sin(_t * 7.3))
	_light.position = Vector2(0, -20)
	for key: String in WEAR:
		var on: bool = wear.has(key)
		match key:
			"coils": on = coils > 0
			"fog": on = fog
			"spot": on = spot
			"boarded": on = boarded
		_wa[key] = lerpf(float(_wa.get(key, 0.0)), 1.0 if on else 0.0, k)
	# Acid running down the hull.
	if float(_wa.get("corrode", 0.0)) > 0.3 and randf() < delta * 5.0:
		_drips.append({ "p": Vector2(randf_range(-width * 0.3, width * 0.3), -50.0), "v": Vector2(0, randf_range(30, 60)), "t": 0.0, "life": 1.1, "rot": randf_range(-0.3, 0.3) })
	# Planks splintering off.
	if float(_wa.get("feeble", 0.0)) > 0.3 and randf() < delta * 1.6:
		_planks.append({ "p": Vector2(randf_range(-width * 0.3, width * 0.3), -40.0), "v": Vector2(randf_range(-90, 90), randf_range(-170, -90)), "t": 0.0, "life": 1.0, "rot": randf() * TAU, "spin": randf_range(-6, 6) })
	# Mending motes rising.
	if float(_wa.get("regen", 0.0)) > 0.3 and randf() < delta * 7.0:
		_motes.append({ "p": Vector2(randf_range(-width * 0.3, width * 0.3), -20.0), "v": Vector2(randf_range(-10, 10), randf_range(-70, -40)), "t": 0.0, "life": 1.3 })
	for d: Dictionary in _drips + _motes:
		d["t"] = float(d["t"]) + delta
		d["p"] = (d["p"] as Vector2) + (d["v"] as Vector2) * delta
	for pl: Dictionary in _planks:
		pl["t"] = float(pl["t"]) + delta
		pl["v"] = (pl["v"] as Vector2) + Vector2(0, 520.0 * delta)
		pl["p"] = (pl["p"] as Vector2) + (pl["v"] as Vector2) * delta
		pl["rot"] = float(pl["rot"]) + float(pl["spin"]) * delta
	_drips = _drips.filter(func(d: Dictionary) -> bool: return float(d["t"]) < float(d["life"]))
	_motes = _motes.filter(func(d: Dictionary) -> bool: return float(d["t"]) < float(d["life"]))
	_planks = _planks.filter(func(d: Dictionary) -> bool: return float(d["t"]) < float(d["life"]))
	_lightl.queue_redraw()
	# Fire: embers spat up, smoke rising.
	if _burn_a > 0.05:
		if randf() < delta * 40.0 * _burn_a:
			_sparks.append({ "p": Vector2(randf_range(-width * 0.35, width * 0.35), randf_range(-30, 0)), "v": Vector2(randf_range(-30, 30), randf_range(-160, -70)), "t": 0.0, "life": randf_range(0.6, 1.2) })
		if randf() < delta * 9.0 * _burn_a:
			_smoke.append({ "p": Vector2(randf_range(-width * 0.25, width * 0.25), -60), "v": Vector2(randf_range(-8, 22), randf_range(-60, -35)), "t": 0.0, "life": randf_range(2.0, 3.2), "r": randf_range(18, 34) })
	# Ice: shards that glint.
	if _ice_a > 0.05 and _shards.is_empty():
		for i: int in 9:
			_shards.append({ "x": randf_range(-width * 0.45, width * 0.45), "h": randf_range(14, 40), "w": randf_range(6, 14), "tilt": randf_range(-0.4, 0.4) })
	elif _ice_a < 0.02:
		_shards.clear()
	for s: Dictionary in _sparks:
		s["t"] = float(s["t"]) + delta
		s["p"] = (s["p"] as Vector2) + (s["v"] as Vector2) * delta
		s["v"] = (s["v"] as Vector2) * (1.0 - delta * 0.8)
	_sparks = _sparks.filter(func(s: Dictionary) -> bool: return float(s["t"]) < float(s["life"]))
	for m: Dictionary in _smoke:
		m["t"] = float(m["t"]) + delta
		m["p"] = (m["p"] as Vector2) + (m["v"] as Vector2) * delta
	_smoke = _smoke.filter(func(m: Dictionary) -> bool: return float(m["t"]) < float(m["life"]))
	queue_redraw()


## A plate of the Last Wall knocked off: a burst of iron shards.
func crack() -> void:
	for i: int in 14:
		_sparks.append({ "p": Vector2(face * width * 0.62 + randf_range(-30, 30), randf_range(-140, -20)), "v": Vector2(randf_range(-160, 160), randf_range(-200, -40)), "t": 0.0, "life": randf_range(0.5, 0.9), "iron": true })


func shatter() -> void:
	for i: int in 40:
		_sparks.append({ "p": Vector2(face * width * 0.62 + randf_range(-60, 60), randf_range(-200, 0)), "v": Vector2(randf_range(-260, 260), randf_range(-320, -40)), "t": 0.0, "life": randf_range(0.6, 1.3), "iron": true })


func _draw() -> void:
	# Everything that stands, drawn upright over the squashed water.
	var up: Vector2 = Vector2(1.0, 1.0 / GROUND)
	# On the water first (flat): ward runes, the surge, light under a burn.
	if _ward_a > 0.02:
		for k: int in 3:
			var rr: float = width * (0.55 + k * 0.12)
			var a0: float = _t * (0.6 - k * 0.25) * (1.0 if k % 2 == 0 else -1.0)
			for j: int in 8:
				var a: float = a0 + j * TAU / 8.0
				draw_arc(Vector2.ZERO, rr, a, a + 0.42, 10, Color(0.62, 0.35, 0.85, 0.55 * _ward_a), 3.0, true)
	if _surge_a > 0.02:
		for k: int in 4:
			draw_circle(Vector2.ZERO, width * (0.5 + k * 0.1) * (1.0 + 0.04 * sin(_t * 6.0 + k)), Color(0.85, 0.15, 0.1, 0.06 * _surge_a))
	draw_set_transform(Vector2.ZERO, 0.0, up)
	var top: float = -width * 0.62
	# The shield: a bubble over the hull, rim shimmering.
	if _sh_a > 0.02:
		# A dome over the hull, not a ball round it: wide, low, its rim catching light.
		var c: Vector2 = Vector2(0, -6)
		var rx: float = width * 0.56
		var ry: float = width * 0.5
		var shim: float = 0.5 + 0.5 * sin(_t * 2.4)
		var dome: PackedVector2Array = PackedVector2Array()
		for j: int in 33:
			var a: float = PI + PI * j / 32.0
			dome.append(c + Vector2(cos(a) * rx, sin(a) * ry))
		draw_colored_polygon(dome, Color(0.55, 0.8, 1.0, 0.06 * _sh_a))
		draw_polyline(dome, Color(0.75, 0.92, 1.0, (0.28 + 0.2 * shim) * _sh_a), 2.0, true)
		var sweep: float = fposmod(_t * 0.35, 1.0)
		var a1: float = PI + PI * sweep
		draw_arc(c, rx * 0.98, a1, minf(TAU, a1 + 0.5), 12, Color(1, 1, 1, 0.45 * _sh_a), 2.0, true)
	var rest: Transform2D = Transform2D(0.0, up, 0.0, Vector2.ZERO)
	var painted: bool = FxSheet.has("smoke")
	# Fire on the deck (the flames themselves are light: _draw_light).
	for m: Dictionary in _smoke:
		var u: float = float(m["t"]) / float(m["life"])
		if painted:
			FxSheet.draw(self, "smoke", m["p"], float(m["r"]) * 2.8 * (0.6 + u), float(m.get("rot", 0.0)) + u * 0.5, Color(0.22, 0.2, 0.2, 0.5 * (1.0 - u) * _burn_a), GROUND, rest)
		else:
			draw_circle(m["p"], float(m["r"]) * (0.6 + u), Color(0.2, 0.19, 0.2, 0.32 * (1.0 - u) * _burn_a))
	# Ice: painted shards along the waterline, frost breathing off it.
	if _ice_a > 0.02:
		for k: int in 3:
			var fx: float = (float(k) / 2.0 - 0.5) * width * 0.6 + sin(_t * 0.5 + k) * 8.0
			FxSheet.draw(self, "frost", Vector2(fx, -30), width * 0.42, _t * 0.1 + k, Color(0.85, 0.95, 1.0, 0.35 * _ice_a), GROUND, rest)
		for s: Dictionary in _shards:
			var b: Vector2 = Vector2(float(s["x"]), -6)
			if painted:
				FxSheet.draw(self, "ice", b + Vector2(0, -float(s["h"]) * 0.5), float(s["h"]) * 1.4, float(s["tilt"]), Color(1, 1, 1, 0.9 * _ice_a), GROUND, rest)
			else:
				var tip: Vector2 = b + Vector2(sin(float(s["tilt"])), -cos(float(s["tilt"]))) * float(s["h"])
				draw_colored_polygon(PackedVector2Array([b + Vector2(-float(s["w"]) / 2.0, 0), tip, b + Vector2(float(s["w"]) / 2.0, 0)]), Color(0.8, 0.93, 1.0, 0.8 * _ice_a))
	_draw_wear(rest)
	# Foresight: an eye opening over the masthead.
	if _eye_a > 0.02:
		var ec: Vector2 = Vector2(0, top - 70.0)
		var open: float = _eye_a * (0.8 + 0.2 * sin(_t * 3.0))
		for k: int in 4:
			draw_circle(ec, 34.0 + k * 10.0, Color(0.7, 0.6, 1.0, 0.05 * _eye_a))
		var lid: PackedVector2Array = PackedVector2Array()
		for j: int in 25:
			var a: float = PI * j / 24.0
			lid.append(ec + Vector2(-cos(a) * 34.0, -sin(a) * 18.0 * open))
		for j: int in 25:
			var a: float = PI * j / 24.0
			lid.append(ec + Vector2(cos(a) * 34.0, sin(a) * 18.0 * open))
		draw_colored_polygon(lid, Color(0.9, 0.88, 1.0, 0.75 * _eye_a))
		draw_circle(ec, 9.0 * open, Color(0.35, 0.2, 0.6, _eye_a))
		draw_circle(ec + Vector2(-3, -3), 3.0, Color(1, 1, 1, 0.8 * _eye_a))
	# The Last Wall: iron plates rising from the water before it.
	if _wall_a > 0.02:
		var n: int = 7
		var rise: float = _wall_a
		var lost: int = int(round(_cracked * n))
		for k: int in n:
			if k < lost:
				continue
			var a: float = (float(k) / (n - 1) - 0.5) * 1.6
			var cx: float = face * width * 0.62 + sin(a) * width * 0.25
			var h: float = (150.0 + 30.0 * cos(a * 2.0)) * rise
			var w: float = 44.0
			var r: Rect2 = Rect2(Vector2(cx - w / 2.0, -h + 10.0), Vector2(w, h))
			draw_rect(r, Color(0.22, 0.24, 0.27, 0.92))
			draw_rect(Rect2(r.position, Vector2(w, 10)), Color(0.42, 0.44, 0.47, 0.95))
			draw_rect(r, Color(0.08, 0.08, 0.09, 0.9), false, 2.0)
			for j: int in 3:
				draw_circle(r.position + Vector2(w / 2.0, 22 + j * (h - 40) / 2.0), 3.0, Color(0.55, 0.5, 0.42))
			# Cracks creep across what is left as it is beaten.
			if _cracked > 0.15:
				draw_line(r.position + Vector2(8, 30), r.position + Vector2(w - 10, h * 0.5), Color(0.05, 0.05, 0.05, _cracked), 2.0, true)
		var glow: float = 0.15 + 0.1 * sin(_t * 2.0)
		draw_circle(Vector2(face * width * 0.62, -60.0 * rise), 120.0, Color(0.6, 0.75, 0.9, glow * 0.25 * rise))
	# Sparks: iron shards off the wall (the fire's embers are light).
	for s: Dictionary in _sparks:
		var u: float = float(s["t"]) / float(s["life"])
		if s.get("iron", false):
			draw_rect(Rect2(s["p"], Vector2(5, 3)), Color(0.4, 0.42, 0.46, 1.0 - u))
		elif not painted:
			draw_circle(s["p"], 2.4 * (1.0 - u), Color(1.0, 0.7 - 0.4 * u, 0.25, 1.0 - u))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _a(key: String) -> float:
	return float(_wa.get(key, 0.0))


## What a ship wears (the statuses and the co-op marks), painted.
func _draw_wear(rest: Transform2D) -> void:
	var top: float = -width * 0.62
	var bow: float = face if face != 0.0 else -1.0
	# Kraken coils: a tentacle up the hull for each (four at most).
	if _a("coils") > 0.02:
		var n: int = clampi(coils, 1, 4)
		for k: int in n:
			# Up the ends of the hull, alternating sides, the deck left clear.
			var side: float = -1.0 if k % 2 == 0 else 1.0
			var x: float = side * width * (0.34 + 0.08 * (k / 2))
			var sway: float = sin(_t * 1.6 + k * 1.3) * 0.15
			FxSheet.draw(self, "tentacle", Vector2(x, -22.0 + 18.0 * (1.0 - _a("coils"))), 78.0, sway + 0.2 * side, Color(1, 1, 1, _a("coils")), GROUND, rest, side > 0.0)
	# Fog Bank: a steam bank hugging the hull.
	if _a("fog") > 0.02:
		# Low along the waterline, the hull showing through.
		for k: int in 4:
			var fx: float = (float(k) / 3.0 - 0.5) * width * 0.8 + sin(_t * 0.4 + k * 1.7) * 16.0
			FxSheet.draw(self, "frost", Vector2(fx, -12.0 - 8.0 * sin(_t * 0.6 + k)), width * 0.3, _t * 0.06 * (1.0 if k % 2 else -1.0) + k, Color(0.95, 1.0, 1.0, 0.42 * _a("fog")), GROUND, rest)
	# Corroded: acid on the hull and running down it.
	if _a("corrode") > 0.02:
		FxSheet.draw(self, "acid", Vector2(-width * 0.1, -36), 64.0, 0.0, Color(1, 1, 1, 0.85 * _a("corrode")), GROUND, rest)
		for d: Dictionary in _drips:
			var u: float = float(d["t"]) / float(d["life"])
			FxSheet.draw(self, "acid", d["p"], 26.0, float(d["rot"]), Color(1, 1, 1, (1.0 - u) * _a("corrode")), GROUND, rest)
	# Feeble: planks splintering off.
	if _a("feeble") > 0.02:
		FxSheet.draw(self, "plank", Vector2(width * 0.18, -34), 56.0, 0.4, Color(1, 1, 1, 0.9 * _a("feeble")), GROUND, rest)
	for pl: Dictionary in _planks:
		var u2: float = float(pl["t"]) / float(pl["life"])
		FxSheet.draw(self, "plank", pl["p"], 34.0, float(pl["rot"]), Color(1, 1, 1, 1.0 - u2), GROUND, rest)
	# Slowed: an anchor dragging at the bow.
	if _a("slowed") > 0.02:
		var ap: Vector2 = Vector2(bow * width * 0.48, -6.0 + 4.0 * sin(_t * 1.3))
		FxSheet.draw(self, "anchor", ap, 62.0, 0.25 * bow + 0.08 * sin(_t * 1.3), Color(1, 1, 1, _a("slowed")), GROUND, rest, bow > 0.0)
	# Silenced: padlocks on the gunports.
	if _a("silence") > 0.02:
		for k: int in 2:
			FxSheet.draw(self, "padlock", Vector2((k - 0.5) * width * 0.36, -32), 36.0, 0.1 * sin(_t * 2.0 + k), Color(1, 1, 1, _a("silence")), GROUND, rest)
	# Boarded: grapnel ropes across the hull.
	if _a("boarded") > 0.02:
		for k: int in 2:
			FxSheet.draw(self, "rope", Vector2((k - 0.5) * width * 0.3, -44), 78.0, (0.5 if k == 0 else -0.5), Color(1, 1, 1, _a("boarded")), GROUND, rest)
	# Weakened: a broken cutlass hanging by the mast.
	if _a("weaken") > 0.02:
		FxSheet.draw(self, "cutlass", Vector2(-bow * width * 0.22, top + 30.0), 58.0, 0.15 * sin(_t * 1.2) + 0.6, Color(1, 1, 1, 0.95 * _a("weaken")), GROUND, rest)
	# Blinded or narrowed: a dark cloud round the crow's nest.
	var dim: float = maxf(_a("blinded"), _a("narrowed") * 0.6)
	if dim > 0.02:
		for k: int in 3:
			FxSheet.draw(self, "frost", Vector2((k - 1) * 34.0 + sin(_t + k) * 6.0, top + 10.0), 84.0, _t * 0.2 + k, Color(0.5, 0.45, 0.65, 0.85 * dim), GROUND, rest)
	# Marked (red) and our Spotter's Mark (gold): a reticle turning overhead.
	if _a("marked") > 0.02:
		var pul: float = 1.0 + 0.06 * sin(_t * 4.0)
		FxSheet.draw(self, "reticle", Vector2(-30.0 if _a("spot") > 0.02 else 0.0, top - 36.0), 70.0 * pul, _t * 0.5, Color(1.0, 0.9, 0.9, _a("marked")), GROUND, rest)
	if _a("spot") > 0.02:
		pass


## The light a ship wears: its flames and embers, an enrage's red fire, the
## mending motes, a fortify's ward ring.
func _draw_light() -> void:
	if not FxSheet.has("flame"):
		return
	var up: Vector2 = Vector2(1.0, 1.0 / GROUND)
	var rest: Transform2D = Transform2D(0.0, up, 0.0, Vector2.ZERO)
	if _burn_a > 0.02:
		for k: int in 5:
			var x: float = (float(k) / 4.0 - 0.5) * width * 0.62
			var h: float = 70.0 + 20.0 * sin(_t * 9.0 + k * 1.7) + 8.0 * sin(_t * 23.0 + k)
			FxSheet.draw(_lightl, "flame", Vector2(x, -24.0 - h * 0.32), h * _burn_a, 0.05 * sin(_t * 5.0 + k), Color(1.0, 0.85, 0.65, 0.95 * _burn_a), GROUND, rest, k % 2 == 1)
		for sp: Dictionary in _sparks:
			if not sp.get("iron", false):
				var u: float = float(sp["t"]) / float(sp["life"])
				FxSheet.draw(_lightl, "ember", sp["p"], 16.0 * (1.0 - u * 0.5), 0.0, Color(1.0, 0.75, 0.4, 1.0 - u), GROUND, rest)
	if _a("enrage") > 0.02:
		for k: int in 3:
			var x2: float = (float(k) / 2.0 - 0.5) * width * 0.5
			var h2: float = 50.0 + 14.0 * sin(_t * 7.0 + k * 2.1)
			FxSheet.draw(_lightl, "flame", Vector2(x2, -20.0 - h2 * 0.3), h2, 0.0, Color(1.0, 0.25, 0.2, 0.5 * _a("enrage")), GROUND, rest)
	for mo: Dictionary in _motes:
		var u3: float = float(mo["t"]) / float(mo["life"])
		FxSheet.draw(_lightl, "spark", mo["p"], 22.0, _t * 2.0, Color(0.45, 1.0, 0.55, (1.0 - u3) * _a("regen")), GROUND, rest)
	# Our Spotter's Mark: a gold ring of light turning over the masthead.
	if _a("spot") > 0.02:
		FxSheet.draw(_lightl, "spark", Vector2(30.0 if _a("marked") > 0.02 else 0.0, -width * 0.62 - 36.0), 64.0 * (1.0 + 0.08 * sin(_t * 5.0)), _t * 0.6, Color(1.0, 0.82, 0.4, _a("spot")), GROUND, rest)
	if _a("fortify") > 0.02:
		# A shell of light raised on the side it faces.
		var bw: float = face if face != 0.0 else -1.0
		FxSheet.draw(_lightl, "ward", Vector2(bw * width * 0.36, -46), width * 0.3, 0.0, Color(0.9, 0.95, 1.0, 0.35 * _a("fortify") * (0.85 + 0.15 * sin(_t * 2.0))), GROUND, rest, bw > 0.0)
