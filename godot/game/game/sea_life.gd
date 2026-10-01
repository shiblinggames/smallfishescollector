class_name SeaLife
extends Node2D
## LIFE ON AND UNDER THE WATER (Godot port of app/(app)/sea/seaShoals.ts,
## seaDrift.ts and seaGulls.ts, 2026-10-01, with the Godot additions noted).
## Lives in the World (the water plane). Nothing here touches a rule: the
## shoals SHOW where fish are thick (each water's density, the hotspots) but
## the catch is the rules' alone.
##
##   SHOALS  260 fish in 20 schools of 13, four kinds, thicker in deeper water
##           and pulled into the shoal hotspots, thinner in barren patches (the
##           web's own density map). They bolt from a hull under way and
##           scatter from a cast. Drawn under the surface: low, tinted with the
##           water, wavering.
##   DRIFT   140 flecks of foam riding the current, smeared by your way.
##   GULLS   seven over each shoal and flotsam hotspot, circling high with
##           their shadows on the water; sail in and they flare up (alarm),
##           and they cry (Godot: the cries are SeaSound's).

const GROUND: float = 0.58
const KINDS: Array = [
	[0.95, 1.0, 30.0, Vector2(190, 120), Vector2(5, 14), Color("#dfeef6")],
	[1.85, 1.12, 17.0, Vector2(250, 155), Vector2(3, 8), Color("#c9dfe8")],
	[1.3, 1.6, 23.0, Vector2(320, 90), Vector2(6, 15), Color("#d2e8dc")],
	[0.55, 0.92, 26.0, Vector2(130, 85), Vector2(7, 18), Color("#eef6fa")],
]
const BAND_DENSITY: Dictionary = { "shallows": 0.5, "open_waters": 0.68, "deep": 0.85, "abyss": 1.0, "ancient_deep": 1.0 }

var _fish: MultiMeshInstance2D
var _drift: MultiMeshInstance2D
var _gulls: Node2D
var _schools: Array = []
var _f: Array = []
var _d: Array = []
var _birds: Array = []
var _cam_prev: Vector2 = Vector2.INF
var _cam_speed: float = 0.0
var _wash: float = 0.0
var _t: float = 0.0
var _seeded: bool = false
## Where the gulls are calling from, for the sound (the nearest flock).
var flock_at: Vector2 = Vector2.INF


func _ready() -> void:
	_fish = _layer(260, _fish_tex(), false)
	_fish.z_index = -3
	add_child(_fish)
	_drift = _layer(140, _fleck_tex(), true)
	_drift.z_index = -1
	add_child(_drift)
	_gulls = Gulls.new()
	_gulls.z_index = 8
	add_child(_gulls)
	for i: int in 20:
		_schools.append({ "x": 0.0, "y": 0.0, "ang": randf() * TAU, "turn": 0.0, "kind": 0, "lit": 0.0, "bx": 0.0, "by": 0.0, "bolt": 0.0 })
	for i: int in 260:
		_f.append({ "ox": 0.0, "oy": 0.0, "stretch": 1.0, "amp": 8.0, "size": 1.0, "ph": randf() * TAU })
	for i: int in 140:
		var r: float = randf()
		_d.append({ "x": randf(), "y": randf(), "vx": 6.0 * (0.6 + r * 0.8), "vy": 2.5 * (0.6 + r * 0.8),
			"size": 6.0 + randf() * 12.0, "base": 0.07 + randf() * 0.16, "rate": 0.25 + randf() * 0.5, "phase": randf() * TAU })


func _layer(n: int, tex: Texture2D, additive: bool) -> MultiMeshInstance2D:
	var mm: MultiMesh = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_2D
	mm.use_colors = true
	var q: QuadMesh = QuadMesh.new()
	q.size = Vector2(1, 1)
	mm.mesh = q
	mm.instance_count = n
	var mi: MultiMeshInstance2D = MultiMeshInstance2D.new()
	mi.multimesh = mm
	mi.texture = tex
	if additive:
		var add: CanvasItemMaterial = CanvasItemMaterial.new()
		add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		mi.material = add
	for i: int in n:
		mm.set_instance_color(i, Color(1, 1, 1, 0))
		mm.set_instance_transform_2d(i, Transform2D(0.0, Vector2.ZERO, 0.0, Vector2.ZERO))
	return mi


## The fish: a soft body and a tail (seaShoals.ts), 64 x 32.
static func _fish_tex() -> Texture2D:
	var img: Image = Image.create(64, 32, false, Image.FORMAT_RGBA8)
	for y: int in 32:
		for x: int in 64:
			var dx: float = (x + 0.5 - 64.0 * 0.4) / (64.0 * 0.42)
			var dy: float = (y + 0.5 - 16.0) / (64.0 * 0.42 * 0.44)
			var d: float = sqrt(dx * dx + dy * dy)
			var a: float = 0.0
			if d < 1.0:
				a = 1.0 - d * 0.45 if d < 0.55 else lerpf(0.75, 0.0, (d - 0.55) / 0.45)
			# The tail: a triangle from 0.72 to 0.98 of the width.
			var u: float = (x + 0.5) / 64.0
			if u > 0.72 and u < 0.98:
				var half: float = (u - 0.72) / 0.26 * 0.26
				if absf((y + 0.5) / 32.0 - 0.5) < half:
					a = maxf(a, 0.5)
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)


## A fleck of foam: a soft dash (seaDrift.ts), 32 x 32.
static func _fleck_tex() -> Texture2D:
	var img: Image = Image.create(32, 32, false, Image.FORMAT_RGBA8)
	for y: int in 32:
		for x: int in 32:
			var d: float = Vector2((x + 0.5 - 16.0) / 16.0, (y + 0.5 - 16.0) / (16.0 * 0.42)).length()
			var a: float = 0.0 if d >= 1.0 else (lerpf(1.0, 0.55, d / 0.35) if d < 0.35 else lerpf(0.55, 0.0, (d - 0.35) / 0.65))
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)


static func _cell_noise(ix: int, iy: int) -> float:
	var h: int = Dice.imul(ix, 374761393) ^ Dice.imul(iy, 668265263)
	h = Dice.imul(h ^ ((h & 0xFFFFFFFF) >> 13), 1274126177)
	return float((h ^ ((h & 0xFFFFFFFF) >> 16)) & 0xFFFFFFFF) / 4294967295.0


static func _patch(x: float, y: float) -> float:
	var gx: float = x / 1500.0
	var gy: float = y / 1500.0
	var ix: int = int(floor(gx))
	var iy: int = int(floor(gy))
	var tx: float = gx - ix
	var ty: float = gy - iy
	var sx: float = tx * tx * (3.0 - 2.0 * tx)
	var sy: float = ty * ty * (3.0 - 2.0 * ty)
	var v: float = lerpf(lerpf(_cell_noise(ix, iy), _cell_noise(ix + 1, iy), sx), lerpf(_cell_noise(ix, iy + 1), _cell_noise(ix + 1, iy + 1), sx), sy)
	return 0.0 if v < 0.4 else sqrt((v - 0.4) / 0.6)


static func density(x: float, y: float, spots: Array) -> float:
	if y < 300.0:
		return 0.0
	var w: Dictionary = Chart.water_at(Vector2(x, y))
	var d: float = float(BAND_DENSITY.get(str(w.get("id", "")), 0.0))
	var hs: float = 0.0
	for s: Dictionary in spots:
		if s["kind"] != "shoal":
			continue
		var dist: float = Vector2(x, y).distance_to(Vector2(float(s["x"]), float(s["y"])))
		if dist < float(s["r"]) * 1.5:
			hs = maxf(hs, 1.0 - dist / (float(s["r"]) * 1.5))
	d *= maxf(_patch(x, y), hs)
	return d * (1.0 + 2.2 * hs)


func _dress(sc: Dictionary, base: int) -> void:
	var r: float = randf()
	sc["kind"] = 0 if r < 0.52 else (1 if r < 0.68 else (2 if r < 0.84 else 3))
	var k: Array = KINDS[sc["kind"]]
	for j: int in 13:
		var f: Dictionary = _f[base + j]
		f["stretch"] = float(k[1]) * (0.92 + randf() * 0.16)
		f["ox"] = (randf() - 0.5) * (k[3] as Vector2).x
		f["oy"] = (randf() - 0.5) * (k[3] as Vector2).y
		f["amp"] = randf_range((k[4] as Vector2).x, (k[4] as Vector2).y)
		f["size"] = (0.5 + randf() * 0.6) * float(k[0])


## A cast landed here: every school near enough bolts away.
func scatter(at: Vector2) -> void:
	for sc: Dictionary in _schools:
		var dx: float = float(sc["x"]) - at.x
		var dy: float = (float(sc["y"]) - at.y) / GROUND
		var dd: float = sqrt(dx * dx + dy * dy)
		if dd > 520.0 or dd < 0.001:
			continue
		var push: float = (1.0 - dd / 520.0) * (150.0 + randf() * 190.0)
		sc["bx"] = dx / dd * push
		sc["by"] = dy / dd * push * 0.7
		sc["bolt"] = 1.0


func step(delta: float, cam: Vector2, half: Vector2, boat: Vector2, boat_speed: float, dark: float, warm: float, now: float) -> void:
	var d: float = minf(delta, 0.05)
	_t += d
	var tint_night: Color = _night_tint(dark, warm)
	if _cam_prev == Vector2.INF:
		_cam_prev = cam
	var moved: float = cam.distance_to(_cam_prev) / maxf(d, 0.0001)
	_cam_speed += (moved - _cam_speed) * minf(1.0, d * 6.0)
	_cam_prev = cam
	_wash += (boat_speed - _wash) * minf(1.0, d * 2.2)
	var spots: Array = Hotspots.at_time(now)

	# ── Shoals ──
	var margin: Vector2 = half * 1.35
	if not _seeded:
		_seeded = true
		for i: int in 20:
			var sc: Dictionary = _schools[i]
			sc["x"] = cam.x + randf_range(-margin.x, margin.x)
			sc["y"] = cam.y + randf_range(-margin.y, margin.y)
			_dress(sc, i * 13)
	var wash: float = minf(1.0, _wash / 260.0)
	var fm: MultiMesh = _fish.multimesh
	for i: int in 20:
		var sc: Dictionary = _schools[i]
		var k: Array = KINDS[sc["kind"]]
		# Wrap round the view, a fresh kind each time it comes back in.
		var wrapped: bool = false
		if float(sc["x"]) - cam.x > margin.x:
			sc["x"] = float(sc["x"]) - margin.x * 2.0; wrapped = true
		elif cam.x - float(sc["x"]) > margin.x:
			sc["x"] = float(sc["x"]) + margin.x * 2.0; wrapped = true
		if float(sc["y"]) - cam.y > margin.y:
			sc["y"] = float(sc["y"]) - margin.y * 2.0; wrapped = true
		elif cam.y - float(sc["y"]) > margin.y:
			sc["y"] = float(sc["y"]) + margin.y * 2.0; wrapped = true
		if wrapped:
			_dress(sc, i * 13)
			sc["lit"] = 0.0
		sc["turn"] = clampf(float(sc["turn"]) + (randf() - 0.5) * 2.4 * d - float(sc["turn"]) * 0.9 * d, -0.22, 0.22)
		sc["ang"] = float(sc["ang"]) + float(sc["turn"]) * d
		sc["x"] = float(sc["x"]) + cos(float(sc["ang"])) * float(k[2]) * d
		sc["y"] = float(sc["y"]) + sin(float(sc["ang"])) * float(k[2]) * d * 0.7
		var want: float = density(float(sc["x"]), float(sc["y"]), spots)
		sc["lit"] = float(sc["lit"]) + (want - float(sc["lit"])) * minf(1.0, d * 1.6)
		# A hull under way pushes the school aside.
		if wash > 0.05:
			var dx: float = float(sc["x"]) - boat.x
			var dy: float = (float(sc["y"]) - boat.y) / GROUND
			var dd: float = sqrt(dx * dx + dy * dy)
			var reach: float = 330.0 * (0.55 + 0.45 * wash)
			if dd < reach and dd > 0.001:
				var near: float = 1.0 - dd / reach
				var push: float = near * wash * 120.0
				sc["bx"] = float(sc["bx"]) + (dx / dd * push - float(sc["bx"])) * minf(1.0, d * 2.4)
				sc["by"] = float(sc["by"]) + (dy / dd * push * 0.7 - float(sc["by"])) * minf(1.0, d * 2.4)
				sc["bolt"] = minf(minf(1.0, near * 1.15), float(sc["bolt"]) + 1.1 * d)
		sc["bolt"] = maxf(0.0, float(sc["bolt"]) - 0.75 * d)
		var b2: float = float(sc["bolt"]) * float(sc["bolt"])
		var ax: float = cos(float(sc["ang"]))
		var ay: float = sin(float(sc["ang"]))
		var vis: float = minf(1.0, float(sc["lit"]))
		var tint: Color = (k[5] as Color) * tint_night
		for j: int in 13:
			var f: Dictionary = _f[i * 13 + j]
			var slot: float = float(f["ph"]) / TAU
			var on: bool = float(sc["lit"]) > slot * 1.15
			var wob: float = sin(_t * 2.2 + float(f["ph"]) * 5.0) * float(f["amp"])
			var fx: float = float(sc["x"]) + float(sc["bx"]) * b2 + float(f["ox"]) * ax - float(f["oy"]) * ay + wob * -ay * 0.4
			var fy: float = float(sc["y"]) + float(sc["by"]) * b2 + float(f["ox"]) * ay + float(f["oy"]) * ax + wob * ax * 0.4
			var rot: float = atan2(ay * 0.58, ax) + sin(_t * 3.0 + float(f["ph"])) * 0.12
			var kk: float = float(f["size"]) * (0.5 + vis * 0.22) * (1.0 + float(sc["bolt"]) * 0.15)
			var st: float = sqrt(float(f["stretch"]))
			# On the water plane the fish lies flat: the World squashes it.
			fm.set_instance_transform_2d(i * 13 + j, Transform2D(rot, Vector2(64.0 * kk * st, 32.0 * kk / st), 0.0, Vector2(fx, fy)))
			var a: float = minf(0.5, 0.16 + vis * 0.2 + float(sc["bolt"]) * 0.28) if on else 0.0
			# Godot: under the surface, not on it. By day a fish beneath the
			# water is a shadow darker than it; at night only a faint pale.
			# Godot: beneath the surface. In bright shallow water a fish is a
			# shadow under it; out in dark water it catches what light there is
			# and shows pale (the web's look). Blended by how far out it is.
			var far: float = clampf((Vector2(fx, fy).length() - 2000.0) / 6000.0, 0.0, 1.0)
			var under: Color = Color(0.05, 0.15, 0.17).lerp(tint * 0.8, maxf(far, dark * 0.7))
			fm.set_instance_color(i * 13 + j, Color(under.r, under.g, under.b, a * (0.85 if far < 0.5 else 0.75)))

	# ── Drift ──
	var dm: MultiMesh = _drift.multimesh
	var smear: float = 1.0 + minf(3.4, _cam_speed / 210.0)
	var busy: float = 1.0 / (1.0 + pow(_cam_speed / 240.0, 1.7))
	for i: int in 140:
		var fl: Dictionary = _d[i]
		if not fl.has("live"):
			fl["live"] = true
			fl["x"] = cam.x + (float(fl["x"]) - 0.5) * half.x * 2.0
			fl["y"] = cam.y + (float(fl["y"]) - 0.5) * half.y * 2.0
		fl["x"] = float(fl["x"]) + float(fl["vx"]) * d
		fl["y"] = float(fl["y"]) + float(fl["vy"]) * d
		var w2: Vector2 = half * 2.0
		var rx: float = fposmod(float(fl["x"]) - cam.x + half.x, w2.x) - half.x
		var ry: float = fposmod(float(fl["y"]) - cam.y + half.y, w2.y) - half.y
		fl["x"] = cam.x + rx
		fl["y"] = cam.y + ry
		var ang: float = atan2(float(fl["vy"]), float(fl["vx"])) if _cam_speed > 12.0 else 0.0
		var sz: float = float(fl["size"])
		dm.set_instance_transform_2d(i, Transform2D(ang, Vector2(sz * smear, sz), 0.0, Vector2(float(fl["x"]), float(fl["y"]))))
		# Faint and slow: foam turning over, not a glitter.
		var a2: float = float(fl["base"]) * 0.45 * busy * (0.6 + 0.4 * sin(_t * float(fl["rate"]) * 0.35 + float(fl["phase"])))
		dm.set_instance_color(i, Color(tint_night.r, tint_night.g, tint_night.b, a2))

	# ── Gulls ──
	(_gulls as Gulls).step(d, _t, cam, half, boat, spots, tint_night)
	flock_at = (_gulls as Gulls).nearest


## The web's nightTint, as a Color (seaWater.ts).
static func _night_tint(dark: float, warm: float) -> Color:
	var r: float = 1.0 - dark * 0.78
	var g: float = 1.0 - dark * 0.76
	var b: float = 1.0 - dark * 0.62
	return Color(clampf(r * (1.0 + warm * 0.42), 0.0, 1.0), clampf(g * (1.0 - warm * 0.04), 0.0, 1.0), clampf(b * (1.0 - warm * 0.34), 0.0, 1.0))


## THE GULLS (seaGulls.ts): drawn rather than sprited, an "M" of three curves
## that flaps, with a soft shadow on the water below.
class Gulls:
	extends Node2D
	var birds: Array = []
	var flocks: Dictionary = {}
	var nearest: Vector2 = Vector2.INF
	var _tint: Color = Color.WHITE
	var _t: float = 0.0

	func step(d: float, t: float, cam: Vector2, half: Vector2, boat: Vector2, spots: Array, tint: Color) -> void:
		_t = t
		_tint = tint
		var keep: Dictionary = {}
		nearest = Vector2.INF
		var best: float = INF
		for s: Dictionary in spots:
			if s["kind"] != "shoal" and s["kind"] != "flotsam":
				continue
			var key: String = s["key"]
			keep[key] = true
			if not flocks.has(key):
				var bs: Array = []
				for i: int in 7:
					var r: float = randf()
					bs.append({ "rad": 0.25 + randf() * 0.85, "ph": randf() * TAU, "rate": (0.22 + randf() * 0.3) * (1.0 if randf() < 0.5 else -1.0),
						"alt": 46.0 + randf() * 58.0, "flap": 5.0 + randf() * 4.0, "size": 0.42 + r * 0.3 })
				flocks[key] = { "s": s, "birds": bs, "lit": 0.0, "up": 0.0 }
			var fl: Dictionary = flocks[key]
			var sp: Vector2 = Vector2(float(s["x"]), float(s["y"]))
			var r0: float = float(s["r"])
			var on_view: bool = absf(sp.x - cam.x) < half.x + 2.5 * r0 and absf(sp.y - cam.y) < half.y + 2.5 * r0
			fl["lit"] = move_toward(float(fl["lit"]), 1.0 if on_view else 0.0, 2.2 * d)
			var want: float = maxf(0.0, 1.0 - Vector2(sp.x - boat.x, (sp.y - boat.y) / 0.58).length() / (r0 + 420.0))
			fl["up"] = move_toward(float(fl["up"]), want, (3.4 if want > float(fl["up"]) else 0.7) * d)
			for b: Dictionary in fl["birds"]:
				b["ph"] = float(b["ph"]) + float(b["rate"]) * d * (1.0 + float(fl["up"]) * 1.5)
			var dist: float = sp.distance_to(boat)
			if dist < best and float(fl["lit"]) > 0.2:
				best = dist
				nearest = sp
		for k: String in flocks.keys():
			if not keep.has(k):
				flocks.erase(k)
		queue_redraw()

	func _draw() -> void:
		for key: String in flocks:
			var fl: Dictionary = flocks[key]
			var on: float = float(fl["lit"])
			if on <= 0.01:
				continue
			var s: Dictionary = fl["s"]
			var sp: Vector2 = Vector2(float(s["x"]), float(s["y"]))
			var r0: float = float(s["r"])
			var up: float = float(fl["up"])
			for b: Dictionary in fl["birds"]:
				var rr: float = r0 * float(b["rad"]) * (1.0 + up * 0.55)
				var ph: float = float(b["ph"])
				var x: float = sp.x + cos(ph) * rr
				var yw: float = sp.y + sin(ph) * rr * 0.72
				var alt: float = float(b["alt"])
				# The shadow, on the water.
				var sk: float = float(b["size"]) * 22.0 * (1.0 - (alt - 46.0) / 58.0 * 0.35)
				draw_set_transform(Vector2(x, yw), 0.0, Vector2(1.0, 1.0))
				draw_circle(Vector2.ZERO, sk * 0.5, Color(0, 0, 0, on * (0.2 - (alt - 46.0) / 58.0 * 0.09) * (1.0 - up * 0.55) * 0.6))
				# The bird, in the air: counter-squashed so it reads upright.
				var y: float = yw - (alt + up * 70.0) / 0.58
				var size: float = float(b["size"])
				var dir: float = signf(cos(ph + PI / 2.0) * signf(float(b["rate"])))
				var flap: float = 0.52 + 0.48 * absf(sin(_t * float(b["flap"]) * (1.0 + up * 0.8) + ph * 3.0))
				draw_set_transform(Vector2(x, y), sin(ph) * 0.16, Vector2(size * dir * 1.4, size * flap * 1.4 / 0.58))
				var c: Color = Color(_tint.r * 0.96, _tint.g * 0.97, _tint.b, on * 0.85)
				var pts: PackedVector2Array = PackedVector2Array([Vector2(-26, 4), Vector2(-14, -8), Vector2(-4, -2), Vector2(0, 2), Vector2(4, -2), Vector2(14, -8), Vector2(26, 4)])
				draw_polyline(pts, c, 3.2, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
