class_name SeaFlow
extends Node2D
## THE CURRENTS AND THE KELP (Godot port of lib/seaFlow.ts and
## app/(app)/sea/seaFlowGfx.ts, 2026-10-01). Lives in the World.
##
## Five lanes of moving water (three rings round the chart, a lane out and a
## lane home) that carry a hull along at up to 55% of base speed, strongest in
## the middle of the lane and fading at its edges and its ends; and the kelp
## beds of the Shallows and the Open Waters, which hold a hull to 60% of its
## speed. The lanes' points and the beds come from the TS (rules.json "flow");
## currentAt and kelpAt are ported here. They move only the hull on the chart,
## never a rule.
##
## Drawn as the web draws them: each lane four strips of ripple, from a broad
## faint body to narrow quick streaks, scrolling down the lane at their own
## speeds, tapering in at both ends. Godot: the strips are Line2Ds with a
## scrolling shader, and they shimmer with the light. The kelp is the web's
## two layers of weed, laid into the water and swaying.

static func flow() -> Dictionary:
	return Rules.data()["flow"]


static var _boxes: Array = []


static func _box(li: int) -> Rect2:
	if _boxes.is_empty():
		for l: Dictionary in flow()["currents"]:
			var lo: Vector2 = Vector2(INF, INF)
			var hi: Vector2 = Vector2(-INF, -INF)
			for p: Array in l["pts"]:
				lo = Vector2(minf(lo.x, float(p[0])), minf(lo.y, float(p[1])))
				hi = Vector2(maxf(hi.x, float(p[0])), maxf(hi.y, float(p[1])))
			var h: float = float(l["half"])
			_boxes.append(Rect2(lo - Vector2(h, h), hi - lo + Vector2(h, h) * 2.0))
	return _boxes[li]


## currentAt: the lane's direction here, how strongly it has you (0..1), and
## which lane; a lane you are already in is kept while it is at least half as
## strong as another.
static func current_at(x: float, y: float, prefer: String = "") -> Dictionary:
	var bk: float = 0.0
	var bu: Vector2 = Vector2.ZERO
	var bid: String = ""
	var kk: float = -1.0
	var ku: Vector2 = Vector2.ZERO
	var lanes: Array = flow()["currents"]
	for li: int in lanes.size():
		if not _box(li).has_point(Vector2(x, y)):
			continue
		var lane: Dictionary = lanes[li]
		var pts: Array = lane["pts"]
		var half: float = float(lane["half"])
		var n: int = pts.size() - 1
		var mk: float = 0.0
		var mu: Vector2 = Vector2.ZERO
		for i: int in n:
			var a: Vector2 = Vector2(float(pts[i][0]), float(pts[i][1]))
			var c: Vector2 = Vector2(float(pts[i + 1][0]), float(pts[i + 1][1]))
			var v: Vector2 = c - a
			var l2: float = maxf(v.length_squared(), 1.0)
			var t: float = clampf(((x - a.x) * v.x + (y - a.y) * v.y) / l2, 0.0, 1.0)
			var dx: float = x - (a.x + v.x * t)
			var dy: float = y - (a.y + v.y * t)
			var d2: float = dx * dx + dy * dy
			if d2 >= half * half:
				continue
			var across: float = 1.0 - sqrt(d2) / half
			var edge: float = across * across * (3.0 - 2.0 * across)
			var along: float = (i + t) / n
			var ends: float = minf(1.0, minf(along / 0.12, (1.0 - along) / 0.12))
			var k: float = edge * maxf(0.0, ends)
			if k > mk:
				mk = k
				mu = v / sqrt(l2)
		if mk <= 0.0:
			continue
		if lane["id"] == prefer:
			kk = mk
			ku = mu
		if mk > bk:
			bk = mk
			bu = mu
			bid = lane["id"]
	if kk > 0.0 and kk * 2.0 >= bk:
		return { "u": ku, "k": kk, "id": prefer }
	return { "u": bu, "k": bk, "id": bid }


## kelpAt: how deep in a bed (0 outside, 1 in its heart).
static func kelp_at(x: float, y: float) -> float:
	var best: float = 0.0
	for k: Dictionary in flow()["kelp"]:
		var d: float = Vector2(float(k["x"]) - x, float(k["y"]) - y).length()
		if d >= float(k["r"]):
			continue
		best = maxf(best, minf(1.0, (1.0 - d / float(k["r"])) * 2.2))
	return best


# ── Drawn ──────────────────────────────────────────────────────────────────────

const LAYERS: Array = [
	# texture, tile length, speed px/s, width (of half), alpha, tint, wobble
	["body", 2400.0, 28.0, 0.9, 0.07, Color("#9fdce8"), 0.3],
	["ripA", 1500.0, 60.0, 0.95, 0.17, Color("#eef8fa"), 1.7],
	["ripB", 1100.0, 100.0, 0.7, 0.19, Color("#ffffff"), 3.1],
	["ripC", 800.0, 150.0, 0.42, 0.15, Color("#ffffff"), 4.6],
]

var _lines: Array[Line2D] = []
var _weed: Array = []
var _t: float = 0.0


func _ready() -> void:
	z_index = -1
	var tex: Dictionary = {
		"body": _body_tex(), "ripA": _ripple_tex(71, 4, 7, 1.6), "ripB": _ripple_tex(113, 5, 5, 1.3), "ripC": _ripple_tex(197, 3, 4, 1.1),
	}
	var shader: Shader = load("res://game/fx/current_strip.gdshader")
	for lane: Dictionary in flow()["currents"]:
		# Densify the lane to a point every ~200px, as the web does.
		var pts: PackedVector2Array = PackedVector2Array()
		var src: Array = lane["pts"]
		pts.append(Vector2(float(src[0][0]), float(src[0][1])))
		for i: int in range(1, src.size()):
			var a: Vector2 = Vector2(float(src[i - 1][0]), float(src[i - 1][1]))
			var b: Vector2 = Vector2(float(src[i][0]), float(src[i][1]))
			var m: int = maxi(1, int(round(a.distance_to(b) / 200.0)))
			for j: int in range(1, m + 1):
				pts.append(a.lerp(b, float(j) / m))
		var total: float = 0.0
		var dist: PackedFloat32Array = PackedFloat32Array([0.0])
		for i: int in range(1, pts.size()):
			total += pts[i].distance_to(pts[i - 1])
			dist.append(total)
		for layer: Array in LAYERS:
			var line: Line2D = Line2D.new()
			var half: float = float(lane["half"])
			var wob: float = float(layer[6])
			var curve: Curve = Curve.new()
			var bent: PackedVector2Array = PackedVector2Array()
			for i: int in pts.size():
				var f: float = dist[i] / maxf(total, 1.0)
				var e: float = minf(1.0, minf(f / 0.18, (1.0 - f) / 0.18))
				var taper: float = e * e * (3.0 - 2.0 * e)
				var dd: float = dist[i]
				var wv: float = 0.72 + 0.28 * sin(dd / 1700.0 + wob) * sin(dd / 730.0 + wob * 1.9)
				var a2: Vector2 = pts[maxi(0, i - 1)]
				var b2: Vector2 = pts[mini(pts.size() - 1, i + 1)]
				var nrm: Vector2 = (b2 - a2).normalized().orthogonal()
				var cbend: float = sin(dd / 1300.0 + wob * 2.3) * 0.18 * half * taper
				bent.append(pts[i] + nrm * cbend)
				curve.add_point(Vector2(f, clampf(taper * wv, 0.0, 1.0)))
			line.points = bent
			line.width = float(layer[3]) * half * 2.0
			line.width_curve = curve
			line.texture = tex[layer[0]]
			line.texture_mode = Line2D.LINE_TEXTURE_TILE
			line.joint_mode = Line2D.LINE_JOINT_ROUND
			var mat: ShaderMaterial = ShaderMaterial.new()
			mat.shader = shader
			mat.set_shader_parameter("speed_px", float(layer[2]))
			mat.set_shader_parameter("tile_px", float(layer[1]))
			mat.set_shader_parameter("tint", layer[5])
			mat.set_shader_parameter("alpha", float(layer[4]))
			line.material = mat
			# In tile mode a Line2D repeats its texture every (texture aspect x
			# line width) px; the shader rescales that to tile_px.
			var tx: Texture2D = tex[layer[0]]
			mat.set_shader_parameter("width_px", line.width * float(tx.get_width()) / float(tx.get_height()))
			line.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
			add_child(line)
			_lines.append(line)
	_lay_kelp()


## The body: a soft band, brighter in patches along it.
static func _body_tex() -> Texture2D:
	var w: int = 256
	var h: int = 64
	var img: Image = Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y: int in h:
		for x: int in w:
			var v: float = float(y) / (h - 1)
			var across: float = maxf(0.0, 1.0 - absf(v - 0.5) * 2.2)
			var u: float = float(x) / w * TAU
			var n: float = 0.5 + 0.5 * sin(u + sin(u * 3.0) * 0.8) * sin(u * 2.0 + 1.3)
			var along: float = pow(maxf(0.0, n), 2.2)
			img.set_pixel(x, y, Color(1, 1, 1, across * across * (3.0 - 2.0 * across) * along))
	var t: ImageTexture = ImageTexture.create_from_image(img)
	return t


## Ripple streaks: clusters of short wavy lines, faded at the strip's edges.
static func _ripple_tex(seed: int, clusters: int, per: int, thick: float) -> Texture2D:
	var w: int = 1024
	var h: int = 96
	var img: Image = Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 1, 1, 0))
	var s: int = seed
	var rnd: Callable = func() -> float:
		s = (s * 1103515245 + 12345) & 0xFFFFFFFF
		return float(s) / 4294967296.0
	for c: int in clusters:
		var cx: float = (c + float(rnd.call()) * 0.6) / clusters * w
		var cy: float = h * (0.3 + float(rnd.call()) * 0.4)
		var n: int = int(round(per * (0.6 + float(rnd.call()) * 0.8)))
		for k: int in n:
			var x0: float = cx + (float(rnd.call()) - 0.5) * 180.0
			var y0: float = cy + (float(rnd.call()) - 0.5) * h * 0.42
			var length: float = 26.0 + float(rnd.call()) * 90.0
			var amp: float = 1.2 + float(rnd.call()) * 2.6
			var a: float = 0.22 + float(rnd.call()) * 0.5
			var lw: float = thick * (0.7 + float(rnd.call()) * 0.7)
			for step: int in int(length):
				var t: float = float(step) / length
				var px: float = x0 + step
				var py: float = y0 + sin(t * PI * 1.6 + k) * amp
				var along_a: float = a * sin(t * PI)
				for oy: int in range(-2, 3):
					var yy: int = int(round(py)) + oy
					if yy < 0 or yy >= h:
						continue
					var cov: float = clampf(lw - absf(float(yy) - py), 0.0, 1.0)
					if cov <= 0.0:
						continue
					var xx: int = posmod(int(round(px)), w)
					var old: Color = img.get_pixel(xx, yy)
					old.a = maxf(old.a, along_a * cov)
					img.set_pixel(xx, yy, old)
	# Fade the strip's edges.
	for y: int in h:
		var v: float = float(y) / h
		var f: float = minf(1.0, minf(v / 0.28, (1.0 - v) / 0.28))
		for x: int in w:
			var c2: Color = img.get_pixel(x, y)
			c2.a *= f
			img.set_pixel(x, y, c2)
	return ImageTexture.create_from_image(img)


## The beds: a blurred mat of canopy, and clumps of deep weed in front of it,
## laid flat into the water (multiplied, so the water shows the weed under it).
func _lay_kelp() -> void:
	var deep: Texture2D = Skipper.tex("sea/kelp-deep.webp")
	var mat: Texture2D = Skipper.tex("sea/kelp-canopy.webp")
	if deep == null or mat == null:
		return
	var shader: Shader = load("res://game/fx/kelp_mul.gdshader")
	for k: Dictionary in flow()["kelp"]:
		var seed: int = int(k["seed"])
		var r: int = (seed * 2654435761) & 0xFFFFFFFF
		var rnd: Callable = func() -> float:
			r = (r * 1103515245 + 12345) & 0xFFFFFFFF
			return float(r) / 4294967296.0
		var kx: float = float(k["x"])
		var ky: float = float(k["y"])
		var kr: float = float(k["r"])
		_weed_sprite(mat, Vector2(kx, ky + kr * 0.08), kr * 1.6, 0.5, Color("#a9bdad"), 0.22, 0.0, shader, rnd)
		var n: int = 4 + seed % 3
		var spots: Array = []
		for c: int in n:
			var a: float = float(rnd.call()) * TAU
			var rr: float = sqrt(float(rnd.call())) * kr * 0.85
			var dy: float = sin(a) * rr * 0.62
			spots.append(Vector3(kx + cos(a) * rr, ky + dy, (dy / (kr * 0.62) + 1.0) / 2.0))
		spots.sort_custom(func(p: Vector3, q: Vector3) -> bool: return p.y < q.y)
		for sp: Vector3 in spots:
			_weed_sprite(deep, Vector2(sp.x, sp.y), kr * (0.42 + 0.42 * sp.z) * (0.85 + float(rnd.call()) * 0.3), 0.92, Color("#adc0a8"), 0.34, 0.05, shader, rnd)


func _weed_sprite(t: Texture2D, at: Vector2, w: float, anchor_y: float, tint: Color, alpha: float, sway: float, shader: Shader, rnd: Callable) -> void:
	var s: Sprite2D = Sprite2D.new()
	s.texture = t
	var sc: float = w / float(t.get_width())
	s.scale = Vector2(sc * (-1.0 if float(rnd.call()) < 0.5 else 1.0), sc)
	s.offset = Vector2(0, (0.5 - anchor_y) * t.get_height())
	s.position = at
	var m: ShaderMaterial = ShaderMaterial.new()
	m.shader = shader
	m.set_shader_parameter("tint", tint)
	m.set_shader_parameter("strength", alpha)
	s.material = m
	s.z_index = -2
	add_child(s)
	_weed.append([s, sway, at.x * 0.001 + float(rnd.call()) * 6.0])


func _process(delta: float) -> void:
	_t += delta
	for wd: Array in _weed:
		var sp: Sprite2D = wd[0]
		if float(wd[1]) > 0.0:
			sp.skew = sin(_t * 0.7 + float(wd[2])) * float(wd[1])
