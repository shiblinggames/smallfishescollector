class_name Wake
extends Node2D
## WHAT A HULL LEAVES ON THE WATER (Godot port of app/(app)/sea/seaWake.ts):
## one layer in the World, under the boats, for every hull on the chart.
##
## Under way, a pair of streaks is laid at the CUTWATER every 32ms, one each
## side, and each slides outward across the heading as it ages, so the marks
## open into a V behind her; a boil of churn falls in close behind the bow
## (more of it the faster she goes), and past 45% of top speed the bow throws
## two short arms of spray. Sitting still, the water rings out from under her
## keel every 1.53 seconds instead. Everything is drawn on the water plane, so
## the World's squash foreshortens it like anything else lying flat.
##
## Hulls are handed in each frame by `lay` as contacts: { id, x, y (the
## cutwater), cx, cy (under the keel), ang (heading), scale, force? }. Without
## a force the wake reads the speed off the hull's own movement, so a moored
## trader drifting slower than 26px/s rings rather than trails.

const EVERY: float = 32.0
const DENSITY: float = EVERY / 95.0
const SPREAD: float = 62.0
const UNDER_WAY: float = 26.0
const RING_EVERY: float = 1.53
const RING_LIFE: float = 4.6
const CAP: int = 690
const RING_CAP: int = 240
## The plain wake (seaWake.ts STYLES.plain). Ship skins bring their own when
## warships come to the port.
const STYLE: Dictionary = {
	"colors": [Color("#ecfaff"), Color("#e2f4fa")], "alpha": 0.42, "along": 76.0, "across": 26.0,
	"life": 1.9, "spread": 1.0, "churn": 1.0,
}

var _marks: MultiMeshInstance2D
var _rings: MultiMeshInstance2D
## Per mark: [x, y, ang, side, force, scale, age, life, wobble, drift, churn, bow]
var _m: Array = []
var _r: Array = []
var _next: int = 0
var _ring_next: int = 0
var _seen: Dictionary = {}
var _pending: Array = []


func _ready() -> void:
	_marks = _layer(CAP, _streak_tex())
	_rings = _layer(RING_CAP, _ring_tex())
	add_child(_rings)
	add_child(_marks)
	for i: int in CAP:
		_m.append([0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0, 1.0, false, false, Color.WHITE])
		_hide(_marks.multimesh, i)
	for i: int in RING_CAP:
		_r.append([0.0, 0.0, 1.0, 1.0, 1.0])
		_hide(_rings.multimesh, i)


func _layer(n: int, tex: Texture2D) -> MultiMeshInstance2D:
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
	return mi


func _hide(mm: MultiMesh, i: int) -> void:
	mm.set_instance_transform_2d(i, Transform2D(0.0, Vector2.ZERO, 0.0, Vector2.ZERO))
	mm.set_instance_color(i, Color(1, 1, 1, 0))


## The streak: a soft ellipse, brightest a little behind its front (seaWake's
## textureFor('streak')), 128 x 64.
static func _streak_tex() -> Texture2D:
	var img: Image = Image.create(128, 64, false, Image.FORMAT_RGBA8)
	for y: int in 64:
		for x: int in 128:
			var dx: float = (x + 0.5 - 128.0 * 0.38) / (128.0 * 0.62)
			var dy: float = (y + 0.5 - 32.0) / 32.0
			var d: float = sqrt(dx * dx + dy * dy)
			var a: float = 0.0
			if d < 0.46:
				a = lerpf(0.72, 0.34, d / 0.46)
			elif d < 0.76:
				a = lerpf(0.34, 0.0, (d - 0.46) / 0.30)
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)


## The ring: a bright band near the rim and nothing inside, 256 square.
static func _ring_tex() -> Texture2D:
	var img: Image = Image.create(256, 256, false, Image.FORMAT_RGBA8)
	for y: int in 256:
		for x: int in 256:
			var d: float = Vector2(x + 0.5 - 128.0, y + 0.5 - 128.0).length() / 128.0
			var a: float = 0.0
			if d >= 0.74 and d < 0.86:
				a = (d - 0.74) / 0.12
			elif d >= 0.86 and d < 0.97:
				a = 1.0 - (d - 0.86) / 0.11
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)


func lay(contacts: Array) -> void:
	_pending = contacts


func _emit(s: Dictionary, force: float, side: float, churn: bool, bow: bool) -> void:
	var m: Array = _m[_next]
	_next = (_next + 1) % CAP
	var ang: float = float(s["ang"])
	var sc: float = float(s.get("scale", 1.0))
	var life: float = STYLE["life"]
	var wob: float = randf_range(-1.0, 1.0) * (0.5 if churn else 0.16)
	var x: float = float(s["x"])
	var y: float = float(s["y"])
	var ux: float = cos(ang)
	var uy: float = sin(ang)
	var off: float = randf_range(-1.0, 1.0) * 9.0 * sc if churn else side * 3.0 * sc
	x += -uy * off
	y += ux * off
	if churn:
		var back: float = (6.0 + randf() * 26.0) * sc
		x -= ux * back
		y -= uy * back
		life *= 0.4
	if bow:
		ang = ang + side * 0.42
		side = 0.0
		life *= 0.34
		wob = randf_range(-1.0, 1.0) * 0.08
		var out: float = (10.0 + randf() * 14.0) * sc
		x += cos(ang) * out
		y += sin(ang) * out
	var cols: Array = STYLE["colors"]
	m[0] = x; m[1] = y; m[2] = ang; m[3] = side; m[4] = force; m[5] = sc
	m[6] = 0.0; m[7] = life; m[8] = wob; m[9] = 0.75 + randf() * 0.5; m[10] = churn; m[11] = bow
	m[12] = cols[randi() % cols.size()]


func _ring(s: Dictionary) -> void:
	var r: Array = _r[_ring_next]
	_ring_next = (_ring_next + 1) % RING_CAP
	r[0] = float(s.get("cx", s["x"]))
	r[1] = float(s.get("cy", s["y"]))
	r[2] = 0.0
	r[3] = RING_LIFE
	r[4] = float(s.get("scale", 1.0))


func _process(delta: float) -> void:
	var d: float = minf(delta, 0.05)
	var alive: Dictionary = {}
	for s: Dictionary in _pending:
		var id: String = s["id"]
		alive[id] = true
		var x: float = float(s["x"])
		var y: float = float(s["y"])
		if not _seen.has(id):
			_seen[id] = { "x": x, "y": y, "speed": 0.0, "primed": false, "since": 0.0, "ring": 1e9, "ang": PI / 2.0 }
		var st: Dictionary = _seen[id]
		var dx: float = x - float(st["x"])
		var dy: float = y - float(st["y"])
		var moved: float = sqrt(dx * dx + dy * dy) / maxf(d, 1e-4)
		st["speed"] = float(st["speed"]) + (moved - float(st["speed"])) * minf(1.0, d * 8.0) if st["primed"] else 0.0
		if moved > 1.0:
			st["ang"] = atan2(dy, dx)
		st["x"] = x
		st["y"] = y
		st["primed"] = true
		if not s.has("ang"):
			s["ang"] = st["ang"]
		var force: float = float(s["force"]) if s.has("force") else minf(1.0, float(st["speed"]) / 210.0)
		var under_way: bool = float(s["force"]) > 0.02 if s.has("force") else float(st["speed"]) > UNDER_WAY
		if under_way:
			st["since"] = float(st["since"]) + d * 1000.0
			st["ring"] = 1e9
			while float(st["since"]) >= EVERY:
				st["since"] = float(st["since"]) - EVERY
				_emit(s, force, -1.0, false, false)
				_emit(s, force, 1.0, false, false)
				var boil: float = float(STYLE["churn"]) * force
				if randf() < boil:
					_emit(s, force, 0.0, true, false)
				if force > 0.45:
					_emit(s, force, -1.0, false, true)
					_emit(s, force, 1.0, false, true)
		else:
			st["since"] = 0.0
			st["ring"] = float(st["ring"]) + d
			if float(st["ring"]) >= RING_EVERY:
				st["ring"] = 0.0
				_ring(s)
	for id: String in _seen.keys():
		if not alive.has(id):
			_seen.erase(id)

	var rm: MultiMesh = _rings.multimesh
	for i: int in RING_CAP:
		var r: Array = _r[i]
		if float(r[2]) >= float(r[3]):
			continue
		r[2] = float(r[2]) + d
		if float(r[2]) >= float(r[3]):
			_hide(rm, i)
			continue
		var age: float = float(r[2]) / float(r[3])
		var k: float = (0.42 + (2.2 - 0.42) * age) * float(r[4])
		var a: float = minf(1.0, age / 0.14) * pow(1.0 - age, 1.4) * 0.34
		rm.set_instance_transform_2d(i, Transform2D(0.0, Vector2(104.0 * k, 30.0 / Chart.GROUND * k), 0.0, Vector2(float(r[0]), float(r[1]))))
		rm.set_instance_color(i, Color(STYLE["colors"][0], a))

	var mm: MultiMesh = _marks.multimesh
	for i: int in CAP:
		var m: Array = _m[i]
		if float(m[6]) >= float(m[7]):
			continue
		m[6] = float(m[6]) + d
		if float(m[6]) >= float(m[7]):
			_hide(mm, i)
			continue
		var age: float = float(m[6]) / float(m[7])
		var churn: bool = m[10]
		var bow: bool = m[11]
		var sc: float = float(m[5])
		var ang: float = float(m[2]) + float(m[8]) * age
		var out: float = 0.0 if bow else (14.0 * sc * age * float(m[9]) if churn else SPREAD * float(STYLE["spread"]) * sqrt(sc))
		# A V FROM THE CUTWATER: each pair is laid at the bow and spreads as it
		# ages, so the arms meet at her stem (the web's GPU wake set them out at
		# full width at once, which drew two parallel lines).
		if not bow and not churn:
			out *= (1.0 - pow(1.0 - age, 2.2)) * (0.55 + 0.45 * float(m[4]))
		var px: float = float(m[0]) + -sin(ang) * float(m[3]) * out
		var py: float = float(m[1]) + cos(ang) * float(m[3]) * out
		var fade: float = pow(1.0 - age, 2.4 if churn else (1.2 if bow else 1.7))
		var a: float = fade * float(STYLE["alpha"]) * DENSITY * (0.45 + float(m[4]) * 0.55)
		var along: float = ((0.7 + age * 0.5) * sc) if bow else ((0.55 + age * 0.7) * sc * (0.5 if churn else 1.0))
		var across: float = ((0.22 + age * 0.3) * sc) if bow else ((0.3 + age * 1.5) * sc * (0.7 if churn else 1.0))
		mm.set_instance_transform_2d(i, Transform2D(ang, Vector2(float(STYLE["along"]) * along, float(STYLE["across"]) * across), 0.0, Vector2(px, py)))
		mm.set_instance_color(i, Color(m[12], a))
