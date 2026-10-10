class_name FinnMoment
extends Node2D
## A CHAPTER OF THE LONG CAST CLOSES ON THE WATER (Kong, 2026-10-03; he loves
## moments staged in the world, each its own and never one move reused). When
## the last job of a chapter is handed back and Finn's scene closes, the sea
## round your boat answers, once, in the chapter's own way:
##   I   THE HAND ON THE ROD    a ring of little fish leaps all round you.
##   II  PAST THE SHELF         flying fish skip across your bow in a line.
##   III THE LONG SAIL          a marlin clears your boat in one great leap.
##   IV  WHERE IT STOPS BEING BLUE  lights rise out of the dark and break the
##                              surface round you.
##   V   THE SIX                six rings of gold open round you one by one,
##                              and something very large passes beneath.
## Lives in the World (squashed by Chart.GROUND): what lies on the water is
## drawn flat (so it is foreshortened), what stands up out of it is drawn in
## `_up`, which undoes the squash. Nothing here touches a rule.

const GROUND: float = Chart.GROUND

var chapter: int = 1
var field: SeaField = null
var _up: Node2D
var _t: float = 0.0
var _life: float = 4.0
## Flat things drawn on the water: [kind, pos, born, life, extra].
var _marks: Array = []


static func play(world: Node2D, at: Vector2, sea_field: SeaField, number: int, z: int = 5) -> FinnMoment:
	var m: FinnMoment = FinnMoment.new()
	m.chapter = clampi(number, 1, 5)
	m.field = sea_field
	m.position = at
	m.z_index = z
	m.set_meta("fight", true)
	world.add_child(m)
	return m


func _ready() -> void:
	_up = Node2D.new()
	_up.scale = Vector2(1.0, 1.0 / GROUND)
	add_child(_up)
	match chapter:
		1:
			_ring_of_leapers()
		2:
			_flying_fish()
		3:
			_marlin()
		4:
			_lights_rise()
		_:
			_the_six()


func _process(delta: float) -> void:
	_t += delta
	queue_redraw()
	if _t > _life:
		queue_free()


## A point on the water (world offset from the boat) as `_up` sees it.
static func up(p: Vector2) -> Vector2:
	return Vector2(p.x, p.y * GROUND)


func _splash(p: Vector2, big: bool = false) -> void:
	_marks.append(["ring", p, _t, 1.1 if big else 0.8, 70.0 if big else 34.0])
	if field != null:
		field.ring(position + p, 150.0 if big else 70.0, 1.4 if big else 0.9, 0.9 if big else 0.5)
	if big:
		Sound.chest(false)
	else:
		Sound.plip()


func _fish(name: String, px: float) -> Sprite2D:
	var tex: Texture2D = Skipper.tex("fish/%s.png" % name)
	var s: Sprite2D = Sprite2D.new()
	s.texture = tex
	if tex != null:
		s.scale = Vector2.ONE * (px / maxf(1.0, float(tex.get_width())))
	_up.add_child(s)
	return s


## A fish up out of the water from `a` to `b` (both on the water), `h` high
## at the top, over `secs`, after `delay`; a splash each end.
func _leap(name: String, px: float, a: Vector2, b: Vector2, h: float, secs: float, delay: float, big: bool = false) -> void:
	var f: Sprite2D = _fish(name, px)
	f.visible = false
	var face: float = signf(b.x - a.x) if b.x != a.x else 1.0
	f.flip_h = face < 0.0
	var fly: Callable = func(u: float) -> void:
		var p: Vector2 = up(a.lerp(b, u))
		p.y -= sin(u * PI) * h
		f.position = p
		# Nose along the arc: up on the way out, down on the way in.
		f.rotation = atan(-cos(u * PI) * PI * h / maxf(1.0, absf(up(b - a).x))) * -face
	var tw: Tween = f.create_tween()
	tw.tween_interval(delay)
	tw.tween_callback(func() -> void:
		f.visible = true
		_splash(a, big))
	tw.tween_method(fly, 0.0, 1.0, secs)
	tw.tween_callback(func() -> void:
		_splash(b, big)
		f.queue_free())


# ── I. The Hand on the Rod: a ring of little fish ─────────────────────────────

func _ring_of_leapers() -> void:
	_life = 3.6
	var kinds: Array = ["atlantic-herring", "pacific-sardine", "european-anchovy", "atlantic-mackerel"]
	var n: int = 14
	for i: int in n:
		var ang: float = TAU * float(i) / float(n) - PI / 2.0
		var a: Vector2 = Vector2.from_angle(ang) * 120.0
		var b: Vector2 = Vector2.from_angle(ang) * 185.0
		_leap(kinds[i % kinds.size()], 52.0, a, b, 46.0, 0.55, 0.12 * float(i))


# ── II. Past the Shelf: flying fish across the bow ────────────────────────────

func _flying_fish() -> void:
	_life = 4.4
	for i: int in 8:
		var lane: float = 70.0 + float(i % 3) * 26.0
		var x0: float = -340.0 + float(i % 2) * 30.0
		var delay: float = 0.18 * float(i)
		# Three skips each, the glides long and low.
		var pts: Array = [Vector2(x0, lane), Vector2(x0 + 230.0, lane + 6.0), Vector2(x0 + 470.0, lane - 4.0), Vector2(x0 + 680.0, lane + 4.0)]
		for k: int in 3:
			_leap("flying-fish", 60.0, pts[k], pts[k + 1], 38.0 - float(k) * 8.0, 0.55, delay + 0.55 * float(k))


# ── III. The Long Sail: one great leap over the boat ──────────────────────────

func _marlin() -> void:
	_life = 3.4
	_leap("blue-marlin", 230.0, Vector2(250.0, 40.0), Vector2(-250.0, 20.0), 230.0, 1.45, 0.25, true)
	# The spray hung in the air where it went in and came out.
	_marks.append(["spray", Vector2(250.0, 40.0), 0.25, 1.2, 0.0])
	_marks.append(["spray", Vector2(-250.0, 20.0), 1.7, 1.2, 0.0])


# ── IV. Where It Stops Being Blue: lights from below ──────────────────────────

func _lights_rise() -> void:
	_life = 4.6
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = 4
	for i: int in 34:
		var ang: float = rng.randf() * TAU
		var r: float = 90.0 + rng.randf() * 210.0
		var p: Vector2 = Vector2.from_angle(ang) * r
		var born: float = 0.2 + rng.randf() * 2.2
		var hue: Color = [Color(0.45, 0.95, 1.0), Color(0.6, 1.0, 0.75), Color(0.75, 0.6, 1.0)][i % 3]
		_marks.append(["light", p, born, 1.6, hue])
	Sound.muffle(0.6)
	var tw: Tween = create_tween()
	tw.tween_interval(3.6)
	tw.tween_callback(func() -> void: Sound.muffle(0.0))


# ── V. The Six: six rings of gold, and a shadow under them ────────────────────

func _the_six() -> void:
	_life = 6.4
	Sound.horn()
	for i: int in 6:
		var ang: float = TAU * float(i) / 6.0 - PI / 2.0
		var p: Vector2 = Vector2.from_angle(ang) * 230.0
		_marks.append(["six", p, 0.4 + 0.45 * float(i), 5.6 - 0.45 * float(i), i])
		var tw: Tween = create_tween()
		tw.tween_interval(0.4 + 0.45 * float(i))
		tw.tween_callback(func() -> void:
			Sound.job_tick(i * 2)
			if field != null:
				field.ring(position + p, 120.0, 1.2, 0.6))
	# Something very large, passing beneath, flat on the water as a shadow.
	var tex: Texture2D = Skipper.tex("fish/megalodon.png")
	if tex != null:
		var sh: Sprite2D = Sprite2D.new()
		sh.texture = tex
		sh.scale = Vector2.ONE * (620.0 / float(tex.get_width()))
		sh.modulate = Color(0.0, 0.03, 0.06, 0.0)
		sh.z_index = -6
		sh.z_as_relative = true
		add_child(sh)
		sh.position = Vector2(-700.0, 60.0)
		var tw2: Tween = sh.create_tween()
		tw2.tween_interval(3.0)
		tw2.set_parallel()
		tw2.tween_property(sh, "position", Vector2(700.0, -20.0), 3.0)
		tw2.tween_property(sh, "modulate:a", 0.32, 0.8)
		tw2.chain().tween_property(sh, "modulate:a", 0.0, 0.4)


func _draw() -> void:
	for m: Array in _marks:
		var age: float = _t - float(m[2])
		if age < 0.0 or age > float(m[3]):
			continue
		var u: float = age / float(m[3])
		var p: Vector2 = m[1]
		match m[0]:
			"ring":
				var r: float = float(m[4]) * (0.3 + 0.9 * (1.0 - pow(1.0 - u, 2.0)))
				draw_arc(p, r, 0.0, TAU, 40, Color(0.95, 0.98, 1.0, 0.55 * (1.0 - u)), 3.0 / GROUND * 0.6, true)
			"spray":
				for k: int in 16:
					var a: float = PI + PI * float(k) / 15.0
					var d: float = 30.0 + 60.0 * u * (0.6 + 0.4 * sin(float(k) * 7.1))
					var q: Vector2 = p + Vector2(cos(a) * d, sin(a) * d * 0.4) - Vector2(0, 90.0 * sin(u * PI) * (0.5 + 0.5 * sin(float(k) * 3.3)) / GROUND)
					draw_circle(q, 4.0 * (1.0 - u) + 1.0, Color(0.95, 0.98, 1.0, 0.8 * (1.0 - u)))
			"light":
				# Deep and dim, then brighter as it comes up; a little ring
				# where it breaks the surface, then gone.
				var hue: Color = m[4]
				var b: float = smoothstep(0.0, 0.7, u) * (1.0 - smoothstep(0.8, 1.0, u))
				var lift: float = (1.0 - u) * 26.0
				var q2: Vector2 = p + Vector2(0, lift)
				draw_circle(q2, 22.0 * (0.5 + 0.5 * u), Color(hue, 0.10 * b))
				draw_circle(q2, 9.0 * (0.5 + 0.5 * u), Color(hue, 0.35 * b))
				draw_circle(q2, 3.0, Color(1, 1, 1, 0.8 * b))
				if u > 0.72:
					var ru: float = (u - 0.72) / 0.28
					draw_arc(p, 8.0 + 30.0 * ru, 0.0, TAU, 24, Color(hue, 0.6 * (1.0 - ru)), 2.0, true)
			"six":
				var grow: float = smoothstep(0.0, 0.12, u)
				var fade: float = 1.0 - smoothstep(0.85, 1.0, u)
				var pulse: float = 0.85 + 0.15 * sin(_t * 3.0 + float(m[4]))
				var gold: Color = Color(1.0, 0.82, 0.38)
				draw_circle(p, 58.0 * grow, Color(gold, 0.08 * fade))
				draw_arc(p, 46.0 * grow * pulse, 0.0, TAU, 48, Color(gold, 0.85 * fade), 3.0, true)
				draw_arc(p, 30.0 * grow, 0.0, TAU, 40, Color(gold, 0.45 * fade), 2.0, true)
