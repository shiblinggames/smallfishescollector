extends RefCounted
## Part of Sea (game/sea.gd): THE LIGHT AND THE AIR. The grade and the glow,
## the sun and the night on the world, a dive's water, the northern chapters'
## own seas, the weather (and the sea's sound that follows it), the deep
## motes, and the lamps, blooms and moorings the water paints. The state stays
## on the Sea; these read and write it there.
## Split out of game/sea.gd on 2026-10-10 for size.


const BLOOMS: Array = [
	[8269.0, 3010.0, 1100.0], [-732.0, 8368.0, 1100.0], [-5500.0, 6900.0, 1000.0],
	[10739.0, 6200.0, 1400.0], [300.0, 14400.0, 1400.0], [-11085.0, 6400.0, 1400.0],
]
## THE GRADE: glow on whatever burns past white, and each water's own colour
## (bright and warm in the Shallows, colder and harder down through the Deep
## and the Abyss, drained and green-black in the Ancient Deep). Post stops at
## the world's layer, so the HUD is never graded.
const GRADES: Dictionary = {
	"": [1.0, 1.0, 1.0, Color(1, 1, 1)],
	"shallows": [1.03, 1.02, 1.10, Color(1.0, 1.0, 0.98)],
	"open_waters": [1.0, 1.04, 1.04, Color(0.98, 1.0, 1.02)],
	"deep": [0.97, 1.07, 0.96, Color(0.94, 0.98, 1.04)],
	"abyss": [0.93, 1.10, 0.86, Color(0.9, 0.95, 1.06)],
	"ancient_deep": [0.90, 1.14, 0.70, Color(0.86, 1.0, 0.94)],
}


## The night's modulate, the grade's environment and the sun, made once.
static func build(o: Sea) -> void:
	o._night = CanvasModulate.new()
	o.add_child(o._night)
	var we: WorldEnvironment = WorldEnvironment.new()
	o._env = Environment.new()
	o._env.background_mode = Environment.BG_CANVAS
	o._env.background_canvas_max_layer = 0
	o._env.glow_enabled = true
	# No HDR 2D (it moves the whole canvas into linear colour, and every
	# painting and shader here was made for sRGB): the glow takes what is
	# nearly white instead.
	o._env.glow_hdr_threshold = 0.94
	o._env.glow_hdr_scale = 2.0
	o._env.glow_intensity = 0.6
	o._env.glow_strength = 1.0
	o._env.glow_bloom = 0.0
	o._env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	for lv: int in 7:
		o._env.set_glow_level(lv, 1.0 if lv in [1, 2, 3, 4] else 0.0)
	o._env.adjustment_enabled = true
	we.environment = o._env
	o.add_child(we)
	o._sun = DirectionalLight2D.new()
	o._sun.blend_mode = Light2D.BLEND_MODE_ADD
	o.add_child(o._sun)


## A gauntlet's water (BattleStage sets it for a dive's fights): the sea in
## that descent's own colours, eased in and out. stops: the water's three
## colours this frame, changed in place.
static func theme(o: Sea, delta: float, stops: Array[Color]) -> void:
	o._theme_k = move_toward(o._theme_k, 1.0 if not o.water_theme.is_empty() else 0.0, delta * 0.8)
	if not o.water_theme.is_empty():
		o._theme_last = o.water_theme
	if o._theme_k > 0.0 and not o._theme_last.is_empty():
		var th: Array = o._theme_last["sea"]
		for k: int in 3:
			stops[k] = stops[k].lerp((th[k] as Color).lerp(Color8(2, 5, 9), float(o._theme_last.get("dim", 0.0))), o._theme_k)


## The sun's (or the moon's) light on the water and the world, the night's
## dimming, the grade, and the lamps. Returns { sky: SeaClock.sky, warm: how
## low and golden the light is, lift: the colour that undoes the night for
## light and lettering }.
static func light(o: Sea, delta: float, now: float, clock: Dictionary, at: Vector2) -> Dictionary:
	var dark: float = clock["darkness"]
	# The sun's (or the moon's) place in the sky: where the light comes from,
	# how high, and how low and golden the sun is (SeaClock.sky).
	var sky: Dictionary = SeaClock.sky(now)
	var toward: Vector2 = sky["toward"]
	var elev: float = sky["elev"]
	var warm: float = maxf(float(clock["warmth"]), float(sky["low"]) * 0.55)
	# Shadows: full by day, fading as the sun or moon nears the horizon (so
	# the hand-over at dusk and dawn, sun to moon, is never seen), faint by
	# moonlight.
	var shadow_k: float = smoothstep(0.02, 0.2, elev) * (0.4 if sky["moon"] else 1.0)
	o._water.set_shader_parameter("u_dark", dark)
	o._water.set_shader_parameter("u_shelf", Chart.SHELF)
	o._water.set_shader_parameter("u_sand", Vector2(3000.0, 6200.0) + Vector2.ONE * SeaScale.d)
	o._water.set_shader_parameter("u_warm", warm)
	o._water.set_shader_parameter("u_light", toward)
	o._water.set_shader_parameter("u_sun_h", elev)
	o._water.set_shader_parameter("u_shadow", shadow_k)
	Skipper.sun(-toward * lerpf(30.0, 5.0, elev), shadow_k)
	o._water.set_shader_parameter("u_rush", clampf(o._boat.velocity.length() / Boat.MAX_SPEED, 0.0, 1.0) * 0.6)
	o._water.set_shader_parameter("u_swell", lerpf(1.0, float(o._ch_look.get("swell", 1.0)), o._ch_k))
	o._water.set_shader_parameter("u_lantern", dark)

	# Night on the solid world: dim and cool it, and let the lights pool.
	# The world sits a little under full by day so the sun has room to model
	# it: lit faces come up to full, the far sides stay soft.
	# By day: brightest at noon, warmer and a touch dimmer as the sun lowers.
	var day_col: Color = Color(0.9, 0.9, 0.9).lerp(Color(0.9, 0.82, 0.74), float(sky["low"]) * 0.8)
	o._night.color = day_col.lerp(Color(0.40, 0.46, 0.64), dark)
	# Under a squall the light goes grey; a strike lights it all.
	o._night.color = o._night.color.lerp(Color(0.6, 0.64, 0.7), o._storm * 0.55).lerp(Color(0.84, 0.86, 0.88), o._squall.fog * 0.5).lerp(Color(1.0, 1.0, 1.0), o._squall.flash * 0.6)
	# A northern chapter's own light, less of it by night.
	if o._ch_k > 0.0:
		o._night.color = o._night.color.lerp(Color(str(o._ch_look["light"])), o._ch_k * 0.55 * (1.0 - dark * 0.6))
	if o._theme_k > 0.0 and not o._theme_last.is_empty():
		o._night.color = o._night.color.lerp(o._theme_last["light"], o._theme_k * 0.9)
	o._sun.rotation = (-toward).angle() - PI / 2.0
	o._sun.height = lerpf(0.15, 0.85, elev)
	var sun_col: Color = Color(1.0, 0.62, 0.32).lerp(Color(1.0, 0.97, 0.9), smoothstep(0.0, 0.55, elev))
	o._sun.color = sun_col.lerp(Color(0.55, 0.66, 1.0), dark)
	o._sun.energy = lerpf(0.22 + 0.12 * float(sky["low"]), 0.06 + 0.12 * elev, dark)
	grade(o, delta, at, dark)
	o._boat.lantern.energy = dark * 1.1 * (0.5 + 0.5 * o._boat.lantern_glow)
	o._town_light.energy = dark * 1.4
	# Light and lettering are not dimmed by the night: undo it for them.
	var lift: Color = Color(1.0 / o._night.color.r, 1.0 / o._night.color.g, 1.0 / o._night.color.b)
	return { "sky": sky, "warm": warm, "lift": lift }


## THE DEEP MOTES (seaLights.ts): sparks of light drifting up through the dark
## in the Abyss and the Ancient Deep.
static func mote_layer() -> GPUParticles2D:
	var p: GPUParticles2D = GPUParticles2D.new()
	p.amount = 190
	p.lifetime = 14.0
	p.preprocess = 14.0
	p.local_coords = false
	p.texture = Glow.radial(32, Color.WHITE)
	var m: ParticleProcessMaterial = ParticleProcessMaterial.new()
	m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	m.emission_box_extents = Vector3(1100, 1100, 0)
	m.gravity = Vector3.ZERO
	m.direction = Vector3(0, -1, 0)
	m.spread = 25.0
	m.initial_velocity_min = 4.0
	m.initial_velocity_max = 9.0
	m.scale_min = 0.07
	m.scale_max = 0.22
	var g: Gradient = Gradient.new()
	g.set_color(0, Color(Kit.GLOW_TEAL, 0.0))
	g.add_point(0.3, Color(Kit.GLOW_TEAL, 0.75))
	g.add_point(0.7, Color(Kit.GLOW_TEAL, 0.55))
	g.set_color(g.get_point_count() - 1, Color(Kit.GLOW_TEAL, 0.0))
	var ramp: GradientTexture1D = GradientTexture1D.new()
	ramp.gradient = g
	m.color_ramp = ramp
	m.turbulence_enabled = true
	m.turbulence_noise_strength = 0.6
	m.turbulence_noise_scale = 4.0
	p.process_material = m
	var add: CanvasItemMaterial = CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	add.light_mode = CanvasItemMaterial.LIGHT_MODE_UNSHADED
	p.material = add
	p.z_index = 4
	return p


## Lamps on the water, the blooms in view, the motes, the wanderers' lanterns.
static func night_water(o: Sea, dark: float, at: Vector2) -> void:
	var r: float = at.length()
	# Thickening smoothly with distance (a step would pop a third of the
	# motes in or out at once).
	var glow: float = 0.6 * smoothstep(10400.0, 11400.0, r) + 0.4 * smoothstep(15200.0, 16800.0, r)
	o._motes.position = at
	o._motes.amount_ratio = clampf(dark * glow, 0.0, 1.0)
	o._motes.emitting = dark * glow > 0.02
	for list: Dictionary in [o._regulars, o._strangers]:
		for k: String in list:
			(list[k] as Wanderer).night = dark
	for b: Buyer in o._buyers:
		b.night = dark
	if dark < 0.05:
		o._water.set_shader_parameter("u_lamp_n", 0)
		return
	var xf: Transform2D = o._world.get_global_transform_with_canvas()
	var vp: Vector2 = o.get_viewport_rect().size
	var lamps: Array[Vector4] = []
	var cols: Array[Vector4] = []
	var add_lamp: Callable = func(p: Vector2, wid: float, strength: float, c: Color) -> void:
		if lamps.size() >= 16:
			return
		var s: Vector2 = xf * p
		if s.x < -200.0 or s.x > vp.x + 200.0 or s.y < -300.0 or s.y > vp.y + 50.0:
			return
		lamps.append(Vector4(s.x / vp.x, s.y / vp.y, wid, strength))
		cols.append(Vector4(c.r, c.g, c.b, 1.0))
	var keel: Vector2 = Vector2(0, 34.0 / Chart.GROUND)
	# Her lantern is a beam ahead of the bow, not a reflection (water shader).
	var bs: Vector2 = xf * (o._boat.position + Vector2.from_angle(o._boat.heading) * 30.0)
	var bdir: Vector2 = xf.basis_xform(Vector2.from_angle(o._boat.heading))
	o._water.set_shader_parameter("u_beam", Vector4(bs.x / vp.x, bs.y / vp.y, bdir.x, bdir.y))
	o._water.set_shader_parameter("u_beam_len", 280.0 + 520.0 * o._boat.lantern_glow)
	o._water.set_shader_parameter("u_beam_k", 0.6 + 0.4 * o._boat.lantern_glow)
	add_lamp.call(o._town_light.position + Vector2(0, 260), 46.0, 0.45, Kit.LAMP)
	for list: Dictionary in [o._regulars, o._strangers]:
		for k: String in list:
			var w: Wanderer = list[k]
			add_lamp.call(w.position + keel, 12.0, 0.18, Kit.LAMP)
	if o._portal.live:
		add_lamp.call(o._portal.position + Vector2(0, 120), 60.0, 0.22, Color(str(Portal.tier_def(o._portal.tier).get("accent", "#7fc8de"))))
	o._water.set_shader_parameter("u_lamps", lamps)
	o._water.set_shader_parameter("u_lamp_cols", cols)
	o._water.set_shader_parameter("u_lamp_n", lamps.size())
	var blooms: Array[Vector4] = []
	for b: Array in BLOOMS:
		var bp: Vector2 = SeaScale.expand(Vector2(float(b[0]), float(b[1])))
		if blooms.size() < 4 and bp.distance_to(at) < float(b[2]) + 2600.0:
			blooms.append(Vector4(bp.x, bp.y, b[2], 1.0))
	while blooms.size() < 4:
		blooms.append(Vector4(0, 0, 0, 0))
	o._water.set_shader_parameter("u_blooms", blooms)


## THE NORTHERN CHAPTERS' OWN SEAS: see Sea._ch_k.
static func chapter(o: Sea, delta: float, at: Vector2) -> void:
	var ch: Dictionary = ChapterLook.at(at)
	if not ch.is_empty():
		o._ch_look = ch["look"]
	var to: float = float(ch.get("k", 0.0)) * (1.0 - o._theme_k)
	o._ch_k = lerpf(o._ch_k, to, 1.0 - exp(-delta * 1.2))
	if o._ch_k < 0.002 and to <= 0.0:
		o._ch_k = 0.0
	if o._ch_look.is_empty():
		return
	if o._ch_atmos == null and o._ch_k > 0.01:
		o._ch_atmos = DeepAtmos.new()
		o._ch_atmos.sea = o
		o.add_child(o._ch_atmos)
	if o._ch_atmos != null:
		o._ch_atmos.set_look(ChapterLook.atmos(o._ch_look, o._ch_k))


## The weather (core/weather.gd's fronts): on the water, in the air, on the
## hull and in how she sails. dark: the sea clock's darkness this frame.
static func weather(o: Sea, delta: float, now: float, at: Vector2, dark: float) -> void:
	var fx: Dictionary = Weather.effect(at, now, o._boat.heading)
	var f: Dictionary = fx["front"]
	if not f.is_empty():
		var e: Vector2 = Weather.edges(f, now)
		var dir: Vector2 = f["dir"]
		o._water.set_shader_parameter("u_front", Vector4(dir.x, dir.y, e.x, e.y))
		o._water.set_shader_parameter("u_front_c", Weather.centre())
		o._water.set_shader_parameter("u_front_w", float(Weather.KINDS[f["kind"]].get("cloud", 0.0)))
	else:
		o._water.set_shader_parameter("u_front_w", 0.0)
	var cloud: float = float(fx["cloud"])
	var rain: float = float(fx["rain"])
	var power: float = 1.0 if fx["lightning"] else 0.5
	var fog_amt: float = float(fx["fog"])
	var wind: float = float(fx["k"]) if not f.is_empty() and f["kind"] == "wind" else 0.0
	# A northern chapter's own weather, over the sea's (ChapterLook).
	if o._ch_k > 0.0:
		rain = maxf(rain, float(o._ch_look["rain"]) * o._ch_k)
		cloud = maxf(cloud, float(o._ch_look["rain"]) * 0.8 * o._ch_k)
		fog_amt = maxf(fog_amt, float(o._ch_look["fog"]) * o._ch_k)
		if o._ch_look.get("storm", false):
			power = lerpf(power, 1.0, o._ch_k)
	# Recording a film (tests/shot.gd, FILM_CLEAR): a fair sky.
	if OS.get_environment("FILM_CLEAR") != "":
		rain = 0.0
		cloud = 0.0
		fog_amt = 0.0
		wind = 0.0
	# A dive has its own weather (DeepLook): the sea's is set aside for it.
	if o._theme_k > 0.0 and o._theme_last.has("rain"):
		rain = lerpf(rain, float(o._theme_last["rain"]), o._theme_k)
		cloud = lerpf(cloud, float(o._theme_last["rain"]) * 0.8, o._theme_k)
		power = lerpf(power, 1.0 if o._theme_last.get("storm", false) else 0.5, o._theme_k)
		fog_amt *= 1.0 - o._theme_k
		wind *= 1.0 - o._theme_k
	o._storm = lerpf(o._storm, cloud, 1.0 - exp(-delta * 0.55))
	# A bay written as a standing storm strikes however light its rain.
	var storm_floor: float = 0.6 * o._ch_k if o._ch_k > 0.0 and o._ch_look.get("storm", false) else 0.0
	o._squall.step(delta, rain, power, o.get_viewport_rect().size, storm_floor)
	# The rain, spray and fog sit above the world's night: they take it
	# themselves, and a bay's fog its own colour.
	var fog_tint: Color = Color.WHITE
	if o._ch_k > 0.0:
		var murk: Color = Color(str(o._ch_look["murk"]))
		var top: float = maxf(0.001, maxf(murk.r, maxf(murk.g, murk.b)))
		fog_tint = Color.WHITE.lerp(Color(murk.r / top, murk.g / top, murk.b / top), o._ch_k * 0.6)
	o._squall.night(dark, fog_tint)
	o._squall.step_air(delta, fog_amt, o._boat.get_global_transform_with_canvas().origin, wind, f.get("dir", Vector2.RIGHT), o.get_viewport_rect().size)
	o._water.set_shader_parameter("u_flash", o._squall.flash)
	# The chart is paper over the sea: no rain or fog on it.
	o._squall.visible = o._chart == null
	if o._wfx != null:
		var vp2: Vector2 = o.get_viewport_rect().size
		var half2: Vector2 = Vector2(vp2.x / 2.0 / o._camera.zoom.x, vp2.y / 2.0 / o._camera.zoom.x / Chart.GROUND)
		# A dive's own water, or a film's fair sky, sets the sea's front aside.
		var front: Dictionary = f if o._theme_k < 0.5 and OS.get_environment("FILM_CLEAR") == "" else {}
		o._wfx.step(delta, o._squall.rain, o._storm, front, now, at, half2, o._chart == null)
	o._boat.storm = o._storm
	o._boat.weather_speed = float(fx["speed"])
	o._boat.weather_turn = float(fx["turn"])
	o._boat.weather_cue = str(fx["cue"])
	# The sea's sound: her way, a hard turn, how far out, the nearest shore.
	var spd: float = clampf(o._boat.velocity.length() / (300.0 * 1.4), 0.0, 1.0)
	var turn: float = 0.0
	if o._boat.velocity.length() > 40.0:
		turn = minf(1.0, absf(wrapf(o._boat.heading - o._snd_heading, -PI, PI)) / maxf(delta, 0.001) / 0.35 / 10.0)
	o._snd_heading = o._boat.heading
	var depth: float = clampf((at.y - 1400.0) / 21200.0, 0.0, 1.0)
	var land: float = 0.0
	var shore: Vector2 = at
	if o._shores.is_empty():
		o._shores = Chart.ports() + (Rules.data()["isles"] as Array)
	for p: Dictionary in o._shores:
		var c: Vector2 = Vector2(float(p["x"]), float(p["y"]))
		var edge: float = c.distance_to(at) - float(p["r"])
		var l: float = clampf(1.0 - edge / 900.0, 0.0, 1.0)
		if l > land:
			land = l
			shore = c
	if o._life.flock_at != Vector2.INF and o._life.flock_at.distance_to(at) < 1600.0:
		land = maxf(land, clampf(1.0 - o._life.flock_at.distance_to(at) / 1600.0, 0.0, 1.0))
		shore = o._life.flock_at
	var shore_canvas: Vector2 = o._world.get_global_transform() * shore
	o._sound.step(delta, spd, turn, depth, land, o._squall.rain, dark, o._hud.busy(), shore_canvas)


## The moorings near the view, for the water to paint.
static func feed_berths(o: Sea, at: Vector2) -> void:
	var near: Array = []
	for bid: String in o._berths:
		var b: Berth = o._berths[bid]
		near.append([b.position.distance_to(at), b])
	near.sort_custom(func(x: Array, y: Array) -> bool: return float(x[0]) < float(y[0]))
	var out: Array[Vector4] = []
	for n: Array in near:
		if out.size() >= 4:
			break
		var b: Berth = n[1]
		out.append(Vector4(b.position.x, b.position.y, b.r, b.lit))
	while out.size() < 4:
		out.append(Vector4(0, 0, 0, 0))
	o._water.set_shader_parameter("u_berths", out)


## Ease the grade toward the water she is in.
static func grade(o: Sea, delta: float, at: Vector2, dark: float) -> void:
	var w: Dictionary = Chart.water_at(at)
	var g: Array = GRADES.get(str(w.get("id", "")), GRADES[""])
	var k: float = 1.0 - exp(-delta * 0.8)
	var gb: float = float(g[0])
	var gc: float = float(g[1])
	var gs: float = float(g[2])
	var glow: float = 0.0
	# A northern chapter grades the whole screen its own way.
	if o._ch_k > 0.0:
		var cg: Array = o._ch_look["grade"]
		gb = lerpf(gb, float(cg[0]), o._ch_k)
		gc = lerpf(gc, float(cg[1]), o._ch_k)
		gs = lerpf(gs, float(cg[2]), o._ch_k)
		glow = float(o._ch_look.get("glow", 0.0)) * o._ch_k
	o._env.adjustment_brightness = lerpf(o._env.adjustment_brightness, gb, k)
	o._env.adjustment_contrast = lerpf(o._env.adjustment_contrast, gc, k)
	o._env.adjustment_saturation = lerpf(o._env.adjustment_saturation, gs * (1.0 - dark * 0.15), k)
	# Night blooms more: the lights are what is left.
	o._env.glow_intensity = lerpf(o._env.glow_intensity, 0.12 + dark * 0.7 + glow, k)
