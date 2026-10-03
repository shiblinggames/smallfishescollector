class_name Sea
extends Node2D
## THE SEA (Godot port, stage 1): the chart you sail across, with the fishing
## loop over it. A first slice of web/app/(app)/sea/SeaMap.tsx: the water, the
## Mainland, the five fishing bands, the boat, day and night, and fishing.
## Docking, the regulars, traders and the rooms come in later slices.
##
## Layers, back to front:
##   the water, a full-screen shader on its own canvas layer (so the night
##     tint below never darkens it twice: the palette already did);
##   the world, squashed by Chart.GROUND, under a CanvasModulate that dims the
##     solid things at night, with 2D lights (the boat's lantern, the town)
##     pooling on them;
##   the HUD.

var session: Session
## In a Charter, the crew's line (null when sailing alone), and the crewmates'
## ships on this sea by their key.
var net: CrewNet = null
var _mates: Dictionary = {}
var _crew_marks: CrewMarks
## The isles, the digs' tells, and the bottles drifting near (by key), with
## the bottles fished out this session; the fog cells seen and not yet saved.
var _isles: Dictionary = {}
var _campaign: CampaignWater
var _xfog: ExpFog
var _digs: Dictionary = {}
var _bottles: Dictionary = {}
var _taken: Dictionary = {}
var _bottle_t: float = 99.0
var _bottle_win: int = -1
var _fog: PackedByteArray = PackedByteArray()
var _fog_new: Array = []
## The hotspots standing now, by key, and when they were last derived.
var _spots: Dictionary = {}
var _spot_t: float = 99.0
var _look_t: float = 0.0
var _last_look: Dictionary = {}
## Leaving the sea: back to the captains (or out of the Charter).
signal left
var _water: ShaderMaterial
var _world: Node2D
var _boat: Boat
var _camera: Camera2D
var _wake: Wake
var _field: SeaField
## THE DEEP MOTES (seaLights.ts): sparks of light drifting up through the dark
## in the Abyss and the Ancient Deep.
var _motes: GPUParticles2D
var _squall: SquallFx
var _sound: SeaSound
var _course: Course
var _course_mark: Course.CourseMark
var _course_t: float = 0.0
var _life: SeaLife
var _sky: SeaSky
var _snd_heading: float = 0.0
## How far into a squall the view is, eased (dims the scene, roughs the hulls).
var _storm: float = 0.0
const BLOOMS: Array = [
	[8269.0, 3010.0, 1100.0], [-732.0, 8368.0, 1100.0], [-5500.0, 6900.0, 1000.0],
	[10739.0, 6200.0, 1400.0], [300.0, 14400.0, 1400.0], [-11085.0, 6400.0, 1400.0],
]
## THE WHEEL ZOOM (SeaMap.tsx): 0.35 to 1.6 of the chart's own scale, eased,
## and remembered on this machine (a number tuned on one screen is wrong on
## another, so it is not in the save; "sea_zoom_2", since the default moved).
const ZOOM_MIN: float = 0.35
## The sea's own zoom, shown as 100% (Kong, 2026-10-02: what read 63% is the
## default; the old 100%, 0.87, was too close).
const ZOOM_DEFAULT: float = 0.55
const ZOOM_MAX: float = 1.6
var _zoom_to: float = 1.0
## THE STAGE (the Locker): the camera pushed in on her and set off to one
## side, { "zoom": float, "shift": Vector2 screen px }; null for the sea's own
## camera. The captain's zoom is not touched.
var stage: Variant = null
var _stage_k: float = 0.0
var _stage_last: Dictionary = { "zoom": 1.0, "shift": Vector2.ZERO }
var _night: CanvasModulate
## THE SUN (and the moon), a DirectionalLight2D that crosses the sky with the
## sea clock: high and white by day, low, warm and grazing at dusk and dawn,
## faint and blue at night. The land's normal maps take it from its side.
var _sun: DirectionalLight2D
## THE GRADE: glow on whatever burns past white, and each water's own colour
## (bright and warm in the Shallows, colder and harder down through the Deep
## and the Abyss, drained and green-black in the Ancient Deep). Post stops at
## the world's layer, so the HUD is never graded.
var _env: Environment
const GRADES: Dictionary = {
	"": [1.0, 1.0, 1.0, Color(1, 1, 1)],
	"shallows": [1.03, 1.02, 1.10, Color(1.0, 1.0, 0.98)],
	"open_waters": [1.0, 1.04, 1.04, Color(0.98, 1.0, 1.02)],
	"deep": [0.97, 1.07, 0.96, Color(0.94, 0.98, 1.04)],
	"abyss": [0.93, 1.10, 0.86, Color(0.9, 0.95, 1.06)],
	"ancient_deep": [0.90, 1.14, 0.70, Color(0.86, 1.0, 0.94)],
}
var _town_light: PointLight2D
var _hud: FishingHud
var _hud_layer: CanvasLayer
var _room_layer: CanvasLayer
## Each port's berth, by id.
var _berths: Dictionary = {}
var _buyers: Array[Buyer] = []
var _mark: BuyerMark
## Buyers dealt with this session: "Hail" becomes "Speak to".
var _dealt: Dictionary = {}
## Everyone else on the water, by key: the nine regulars and Yoon (always
## there), and the strangers in the cells round the boat (and, at night, the
## blockade runners), refreshed as the boat crosses a cell or the light turns.
var _regulars: Dictionary = {}
var _strangers: Dictionary = {}
var _trader_cell: String = ""
## The wanderers dealt with today (the plate greys, the cap counts them), and
## the sea day that list is for.
var _dealt_keys: Array = []
var _dealt_day: int = -1
var _hailing: String = ""
## The Homestead Portal, whether its offer is live (out of the mouth once since
## the last passage), and the recall's last redraw.
var _portal: PortalWell
var _portal_armed: bool = true
var _recall_t: float = 99.0
var _warping: bool = false
var _save_t: float = 0.0
## Music starts on the first key or press, as on the web.
var _music_started: bool = false


func _ready() -> void:
	var water_layer: CanvasLayer = CanvasLayer.new()
	water_layer.layer = -10
	add_child(water_layer)
	var rect: ColorRect = ColorRect.new()
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_water = ShaderMaterial.new()
	_water.shader = load("res://game/water.gdshader")
	rect.material = _water
	water_layer.add_child(rect)

	_world = Node2D.new()
	_world.scale = Vector2(1.0, Chart.GROUND)
	_world.y_sort_enabled = true
	add_child(_world)

	# Every port: its plate, 2r x width wide, the island's centre `water` of
	# the way down it, painted in perspective so it stands un-squashed; what
	# stands on it, feet first; and its berth on the water.
	for port: Dictionary in Chart.ports():
		_draw_port(port)
	_draw_north()
	for i: Dictionary in Rules.data()["isles"]:
		var n: SeaFinds.IsleNode = SeaFinds.IsleNode.new()
		n.isle = i
		n.found = Js.includes(session.save.get("discoveries", []), i["id"])
		_world.add_child(n)
		_isles[i["id"]] = n
	for d: Dictionary in Rules.data()["digSites"]:
		var h: SeaFinds.DigHint = SeaFinds.DigHint.new()
		h.site = d
		h.z_index = -1
		_world.add_child(h)
		_digs[d["id"]] = h
	_fog = Explore.fog_decode(session.profile().get("sea_explored"))
	for info: Dictionary in Chart.residents():
		var b: Buyer = Buyer.new()
		b.info = info
		_world.add_child(b)
		_buyers.append(b)
	_moor_regulars()
	_finn = FinnHull.new()
	for sp: Dictionary in session.save["species"]:
		if sp["habitat"] == "shallows":
			_finn.catch_names.append(sp["name"])
	_finn.splashed.connect(func(at: Vector2) -> void:
		_field.ring(at, 90.0, 1.2, 0.7)
		if at.distance_to(_boat.position) < 900.0:
			Sound.plip())
	_world.add_child(_finn)
	_portal = PortalWell.new()
	_world.add_child(_portal)
	_portal_state()
	_town_light = PointLight2D.new()
	_town_light.texture = Glow.radial(256, Color(1.0, 0.8, 0.5), true)
	_town_light.texture_scale = 4.0
	_town_light.color = Color(1.0, 0.78, 0.5)
	_town_light.energy = 0.0
	_town_light.position = Vector2(-30, 120)
	_world.add_child(_town_light)

	_world.add_child(SeaFlow.new())
	_wake = Wake.new()
	_wake.z_index = -1
	_world.add_child(_wake)
	_squall = SquallFx.new()
	add_child(_squall)
	_sound = SeaSound.new()
	add_child(_sound)
	_life = SeaLife.new()
	_world.add_child(_life)
	_sky = SeaSky.new()
	add_child(_sky)
	_sky.attach(_world)
	_squall.struck.connect(_sound.thunder)
	for port: Dictionary in Chart.ports():
		_sound.add_surf(_world, Vector2(float(port["x"]), float(port["y"])), float(port["r"]))
	for i: Dictionary in Rules.data()["isles"]:
		_sound.add_surf(_world, Vector2(float(i["x"]), float(i["y"])), float(i["r"]))
	_motes = _mote_layer()
	_world.add_child(_motes)
	_field = SeaField.new()
	add_child(_field)
	_field.share_wake(_wake)
	_water.set_shader_parameter("u_field", _field.texture())
	_water.set_shader_parameter("u_under", _field.under.get_texture())
	_water.set_shader_parameter("u_flow", _field.flow.get_texture())
	_water.set_shader_parameter("u_flow_on", 1.0)
	_life.sink_fish(_field.under_world)
	for bid: String in _berths:
		(_berths[bid] as Berth).field = _field
	_water.set_shader_parameter("u_field_on", 1.0)
	_boat = Boat.new()
	_boat.field = _field
	_boat.cast_landed.connect(_life.scatter)
	_boat.held_at_gate.connect(_held_at_gate)
	_boat.held_at_bay.connect(_held_at_bay)
	_campaign = CampaignWater.new()
	_campaign.sea = self
	_campaign.node_pressed.connect(open_node)
	_open_sea_gate()
	_course = Course.new()
	_course.sea = self
	_course.boat = _boat
	add_child(_course)
	var cl: Course.CourseLine = Course.CourseLine.new()
	cl.course = _course
	cl.z_index = -1
	_world.add_child(cl)
	_course.changed.connect(_course_chip)
	_boat.cue_changed.connect(func(c: Dictionary) -> void: _hud.set_cues(c))
	_boat.surged.connect(func() -> void:
		_field.ring(_boat.position, 130.0, 1.1, 0.7)
		Rumble.buzz([0, 16, 40, 22]))
	var at: Variant = session.profile().get("sea_x")
	add_child(_campaign)
	# The campaign's fog: the saved mask, or (when there is none) the water
	# already earned, queued so the first save carries it.
	_xfog = ExpFog.new()
	_xfog.sea = self
	var xraw: Variant = session.profile().get("sea_explored_exp")
	_xfog.bits = Explore.xfog_decode(xraw)
	if xraw == null or str(xraw) == "":
		var been: Array = []
		for e: Dictionary in Campaign.water()["encounters"]:
			if _campaign.status.get(e["node"]) == "cleared":
				been.append(Vector2(float(e["at"]["x"]), float(e["at"]["y"])))
		Explore.xfog_seed(_xfog.bits, been)
		for i: int in Explore.xfog_cells():
			if Explore.xfog_has(_xfog.bits, i):
				_xfog.fresh.append(i)
	_world.add_child(_xfog)
	_boat.position = Vector2(Js.num(at), Js.num(session.profile().get("sea_y"))) if at != null else Chart.HOME
	_world.add_child(_boat)
	_boat.set_look(Skipper.look_of(session.profile()))
	_boat.set_fit(session.profile())
	# The Log's shelf, loading in the background (game/skipper.gd).
	var names: Array = []
	for f: Dictionary in session.save.get("species", []):
		names.append(f["name"])
	Skipper.warm_fish_thumbs(names)
	session.changed.connect(func() -> void: _boat.set_fit(session.profile()))

	_night = CanvasModulate.new()
	add_child(_night)
	var we: WorldEnvironment = WorldEnvironment.new()
	_env = Environment.new()
	_env.background_mode = Environment.BG_CANVAS
	_env.background_canvas_max_layer = 0
	_env.glow_enabled = true
	# No HDR 2D (it moves the whole canvas into linear colour, and every
	# painting and shader here was made for sRGB): the glow takes what is
	# nearly white instead.
	_env.glow_hdr_threshold = 0.94
	_env.glow_hdr_scale = 2.0
	_env.glow_intensity = 0.6
	_env.glow_strength = 1.0
	_env.glow_bloom = 0.0
	_env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	for lv: int in 7:
		_env.set_glow_level(lv, 1.0 if lv in [1, 2, 3, 4] else 0.0)
	_env.adjustment_enabled = true
	we.environment = _env
	add_child(we)
	_sun = DirectionalLight2D.new()
	_sun.blend_mode = Light2D.BLEND_MODE_ADD
	add_child(_sun)

	_camera = Camera2D.new()
	_camera.position_smoothing_enabled = false
	_zoom_to = clampf(float(Prefs.get_value("sea_zoom_2", ZOOM_DEFAULT)), ZOOM_MIN, ZOOM_MAX)
	_camera.zoom = Vector2(_zoom_to, _zoom_to)
	add_child(_camera)
	_camera.make_current()

	var hud_layer: CanvasLayer = CanvasLayer.new()
	hud_layer.layer = 10
	add_child(hud_layer)
	_hud_layer = hud_layer
	if RaidTable.live != null and (session.remote != null or session.charter != null):
		var muster: RaidMuster = RaidMuster.new()
		muster.sea = self
		hud_layer.add_child(muster)
	_room_layer = CanvasLayer.new()
	_room_layer.layer = 20
	add_child(_room_layer)
	_mark = BuyerMark.new()
	hud_layer.add_child(_mark)
	_crew_marks = CrewMarks.new()
	hud_layer.add_child(_crew_marks)
	var sound: Sound = Sound.new()
	add_child(sound)
	_hud = FishingHud.new()
	_hud.session = session
	_hud.boat = _boat
	_hud.fishing_changed.connect(func(active: bool) -> void:
		_boat.locked = active
		_boat.set_pose("wait" if active else "rest"))
	_hud.leave_label = "Leave the Charter" if net != null else "Captains"
	_hud.leave.connect(func() -> void: left.emit())
	_hud.recall_pressed.connect(_press_recall)
	_course.hud = _hud
	_hud.chart_pressed.connect(_open_chart)
	_hud.locker_wanted.connect(_open_locker)
	_hud.expedition_wanted.connect(_open_expedition)
	_hud.course_autopilot.connect(_course.toggle_autopilot)
	_hud.course_clear.connect(_course.clear)
	hud_layer.add_child(_hud)
	_course_mark = Course.CourseMark.new()
	hud_layer.add_child(_course_mark)
	if net != null:
		net.mate_boat.connect(_on_mate_boat)
		net.mate_look.connect(_on_mate_look)
		net.mate_left.connect(func(k: String) -> void:
			if _mates.has(k):
				var gone: Shipmate = _mates[k]
				_hud.toast("%s has left port" % gone.mate_name)
				gone.queue_free()
				_mates.erase(k))
		_send_look()
		net.proposed.connect(_on_proposed)


func _process(delta: float) -> void:
	var input: Vector2 = Vector2.ZERO if _hud.busy() else Input.get_vector("sail_left", "sail_right", "sail_up", "sail_down")
	# The currents, the kelp and the sails rest while the rod is out or a panel
	# is up (the web's hush).
	_boat.hush = _hud.busy() or not (_hud.phase == "idle" or _hud.phase == "result")
	_hold_steer()
	if input.length() > 0.1:
		_course.helm_taken()
	_boat.steer(input, delta)
	_course.step(delta)
	_course_t += delta
	if _course_t > 0.5:
		_course_t = 0.0
		_course_chip()
	if _course_mark != null:
		_course_mark.offset = null
		if _course.active():
			_course_mark.offset = Vector2(_course.dest.x - _boat.position.x, (_course.dest.y - _boat.position.y) * Chart.GROUND) * _camera.zoom.x
			_course_mark.text = "%s  ·  %s" % [_course.label, Course.eta_text(_course.eta())]
	var cam_world: Vector2 = _boat.position
	_camera.position = Vector2(cam_world.x, cam_world.y * Chart.GROUND)
	if stage != null:
		_stage_k = minf(1.0, _stage_k + delta * 2.2)
	else:
		_stage_k = maxf(0.0, _stage_k - delta * 2.8)
	if _stage_k > 0.0:
		var sk: float = _stage_k * _stage_k * (3.0 - 2.0 * _stage_k)
		if stage != null:
			_stage_last = stage
		_camera.position += (_stage_last["shift"] as Vector2) / _camera.zoom.x * sk

	var now: float = Clock.now_ms()
	var clock: Dictionary = SeaClock.at(now)
	var dark: float = clock["darkness"]
	var stops: Array[Color] = Chart.sea_at(cam_world, dark)
	var vp: Vector2 = get_viewport_rect().size
	_water.set_shader_parameter("u_cam", cam_world)
	var zt: float = (_zoom_to if stage == null else float(stage["zoom"])) * (1.0 - 0.1 * _pass_k)
	var z: float = lerpf(_camera.zoom.x, zt, 1.0 - exp(-delta * (12.0 if stage == null and _stage_k <= 0.0 else 3.5)))
	_camera.zoom = Vector2(z, z)
	_water.set_shader_parameter("u_zoom", _camera.zoom.x)
	_water.set_shader_parameter("u_res", vp)
	_water.set_shader_parameter("u_deep", stops[0])
	_water.set_shader_parameter("u_mid", stops[1])
	_water.set_shader_parameter("u_shallow", stops[2])
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
	_water.set_shader_parameter("u_dark", dark)
	_water.set_shader_parameter("u_shelf", Chart.SHELF)
	_water.set_shader_parameter("u_sand", Vector2(3000.0, 6200.0) + Vector2.ONE * SeaScale.d)
	_water.set_shader_parameter("u_warm", warm)
	_water.set_shader_parameter("u_light", toward)
	_water.set_shader_parameter("u_sun_h", elev)
	_water.set_shader_parameter("u_shadow", shadow_k)
	Skipper.sun(-toward * lerpf(30.0, 5.0, elev), shadow_k)
	_water.set_shader_parameter("u_rush", clampf(_boat.velocity.length() / Boat.MAX_SPEED, 0.0, 1.0) * 0.6)
	_water.set_shader_parameter("u_lantern", dark)

	# Night on the solid world: dim and cool it, and let the lights pool.
	# The world sits a little under full by day so the sun has room to model
	# it: lit faces come up to full, the far sides stay soft.
	# By day: brightest at noon, warmer and a touch dimmer as the sun lowers.
	var day_col: Color = Color(0.9, 0.9, 0.9).lerp(Color(0.9, 0.82, 0.74), float(sky["low"]) * 0.8)
	_night.color = day_col.lerp(Color(0.40, 0.46, 0.64), dark)
	# Under a squall the light goes grey; a strike lights it all.
	_night.color = _night.color.lerp(Color(0.6, 0.64, 0.7), _storm * 0.55).lerp(Color(0.84, 0.86, 0.88), _squall.fog * 0.5).lerp(Color(1.0, 1.0, 1.0), _squall.flash * 0.6)
	_sun.rotation = (-toward).angle() - PI / 2.0
	_sun.height = lerpf(0.15, 0.85, elev)
	var sun_col: Color = Color(1.0, 0.62, 0.32).lerp(Color(1.0, 0.97, 0.9), smoothstep(0.0, 0.55, elev))
	_sun.color = sun_col.lerp(Color(0.55, 0.66, 1.0), dark)
	_sun.energy = lerpf(0.22 + 0.12 * float(sky["low"]), 0.06 + 0.12 * elev, dark)
	_grade(delta, cam_world, dark)
	_boat.lantern.energy = dark * 1.1 * (0.5 + 0.5 * _boat.lantern_glow)
	_town_light.energy = dark * 1.4
	# Light and lettering are not dimmed by the night: undo it for them.
	var lift: Color = Color(1.0 / _night.color.r, 1.0 / _night.color.g, 1.0 / _night.color.b)
	for bid: String in _berths:
		var bt: Berth = _berths[bid]
		bt.darkness = dark
	for b: Buyer in _buyers:
		b.lift = lift
	_wanderers(now, clock, lift)
	_night_water(dark, cam_world)
	var half: Vector2 = Vector2(vp.x / 2.0 / _camera.zoom.x, vp.y / 2.0 / _camera.zoom.x / Chart.GROUND)
	_life.step(delta, cam_world, half, _boat.position, _boat.velocity.length(), dark, clock["warmth"], now)
	_sky.step(delta, cam_world, _camera.zoom.x, vp, dark, warm, stops[2])
	_weather(delta, now, cam_world)
	_ship_side()
	_passage(delta)
	_finn_tick(delta)
	_feed_berths(cam_world)
	# Every hull's wake, laid on the water.
	var contacts: Array = [_boat.wake_contact()]
	for list: Dictionary in [_regulars, _strangers]:
		for k: String in list:
			var w: Wanderer = list[k]
			contacts.append(Boat.contact_for(k, w.position, w.skipper))
	for b: Buyer in _buyers:
		contacts.append(Boat.contact_for("buyer:" + str(b.info["zoneId"]), b.position, b.skipper))
	for k: String in _mates:
		var m: Shipmate = _mates[k]
		contacts.append(Boat.contact_for("mate:" + k, m.position, m.skipper))
	_wake.lay(contacts)
	var speeds: Dictionary = {}
	for id: String in _wake._seen:
		speeds[id] = (_wake._seen[id] as Dictionary)["speed"]
	speeds["me"] = _boat.velocity.length()
	_field.step(delta, _camera.position, _camera.zoom.x, get_viewport_rect().size, contacts, speeds)
	_water.set_shader_parameter("u_field_px", Vector2(1.0, 1.0) / Vector2(_field.viewport.size))
	_portal.lift = lift
	_recall_t += delta
	if _recall_t > 1.0:
		_recall_t = 0.0
		_hud.set_recall(Portal.recall_left_ms(session.profile(), "fishing"))
		_crew_morning(now)
		_hud.set_stir(FishBias.stirring(session.save.get("species", []), str(Chart.water_at(_boat.position).get("id", "")), _boat.position, now) if not Chart.water_at(_boat.position).is_empty() else "")
		# A stone opened (or a crewmate built a rung): the well catches up.
		var live: bool = Portal.has_stone_for(1, session.save.get("discoveries", [])) or Js.num(session.profile().get("portal_tier")) > 1.0
		if live != _portal.live or int(Js.num(Js.nz(session.profile().get("portal_tier"), 1.0))) != _portal.tier:
			_portal_state()
	_reach(cam_world)
	_hotspots(delta, now)
	_finds(delta, now, lift)
	if net != null:
		_look_t += delta
		if _look_t > 1.0:
			_look_t = 0.0
			var look: Dictionary = Skipper.look_of(session.profile())
			if look != _last_look:
				_send_look()
		net.send_boat(delta, { "x": _boat.position.x, "y": _boat.position.y, "vx": _boat.velocity.x, "vy": _boat.velocity.y, "pose": _boat.skipper.frame, "facing": _boat.facing() })
		var marks: Array = []
		for k: String in _mates:
			var m: Shipmate = _mates[k]
			m.lift = lift
			marks.append([m.mate_name, Vector2(m.position.x - cam_world.x, (m.position.y - cam_world.y) * Chart.GROUND) * _camera.zoom.x])
		_crew_marks.marks = marks

	_hud.set_water(Chart.water_at(cam_world))
	_hud.set_clock(SeaClock.time_label(now), sky)
	if _music_started:
		Sound.music_for(clock["phase"])

	# Remember where the boat is, now and then, so a captain comes back to it.
	# The fog: the cells around the boat, as they are first seen.
	if _boat.position.y > Explore.NORTH_WALL:
		for i: int in Explore.fog_reveal(_boat.position.x, _boat.position.y):
			if not Explore.fog_has(_fog, i):
				Explore.fog_set(_fog, i)
				_fog_new.append(i)
	_save_t += delta
	var xnew: bool = _xfog != null and not _xfog.fresh.is_empty()
	if _save_t > 5.0 and (_boat.velocity.length() < 5.0 or not _fog_new.is_empty() or xnew):
		_save_t = 0.0
		var p: Dictionary = session.profile()
		if not _fog_new.is_empty() or xnew or Js.num(p.get("sea_x")) != round(_boat.position.x) or Js.num(p.get("sea_y")) != round(_boat.position.y):
			_flush_position()


## What is in reach of the boat: the berth first, then a buyer in hail range.
## The HUD shows it and presses it.
func _reach(at: Vector2) -> void:
	var w: Dictionary = Chart.water_at(at)
	var band_buyer: Buyer = null
	for b: Buyer in _buyers:
		if not w.is_empty() and b.info["zoneId"] == w["id"]:
			band_buyer = b
	var docked: Dictionary = Chart.berth_at(at)
	if docked.is_empty():
		var found: Variant = _campaign.reach(at) if at.y < Explore.NORTH_WALL else null
		if found == null:
			found = _find_in_reach(at)
		if found != null:
			_hud.set_reach(found[0], found[1])
			_mark.target = null
			return
	for bid: String in _berths:
		(_berths[bid] as Berth).inside = bid == docked.get("id")
	if not docked.is_empty():
		_hud.set_reach(Chart.dock_label(docked), _dock.bind(docked["id"]))
		_mark.target = null
		return
	# The portal's mouth: it offers, once you have been out of it since the
	# last passage, and never takes you by itself.
	var in_mouth: bool = Portal.inside(at.x, at.y)
	if not in_mouth:
		_portal_armed = true
	_portal.gather = in_mouth
	if in_mouth and _portal_armed and not _warping:
		_hud.set_reach("Step through the portal", _open_portal)
		_mark.target = null
		return
	for b: Buyer in _buyers:
		if b.near(at):
			_hud.set_reach(("Speak to %s" if _dealt.has(b.info["zoneId"]) else "Hail %s") % b.info["name"], _hail.bind(b))
			_mark.target = null
			return
	if _finn != null and _finn.near(at):
		var ready: bool = _finn_st.get("questReady", false)
		_hud.set_reach("Hand the job to Finn" if ready else "Talk to Finn", _open_finn)
		_mark.target = null
		return
	for list: Dictionary in [_regulars, _strangers]:
		for k: String in list:
			var wn: Wanderer = list[k]
			if wn.near(at):
				_hud.set_reach(("Speak to %s" if _dealt_keys.has(k) else "Hail %s") % wn.info["name"], _hail_wanderer.bind(wn))
				_mark.target = null
				return
	_hud.set_reach("", Callable())
	# The compass mark: while you are in a water, where its buyer is.
	_mark.target = null if band_buyer == null else Vector2(band_buyer.position.x - at.x, (band_buyer.position.y - at.y) * Chart.GROUND) * _camera.zoom.x


# ── The crew ───────────────────────────────────────────────────────────────────

func _mate(k: String) -> Shipmate:
	if not _mates.has(k):
		var m: Shipmate = Shipmate.new()
		_world.add_child(m)
		_mates[k] = m
	return _mates[k]


func _on_mate_boat(k: String, st: Dictionary) -> void:
	if k == net.key:
		return
	_mate(k).state(st)


func _on_mate_look(k: String, mate_name: String, look: Dictionary) -> void:
	if k == net.key:
		return
	var m: Shipmate = _mate(k)
	var fresh: bool = m.mate_name == ""
	m.set_mate_name(mate_name)
	m.set_look(look)
	if fresh:
		_hud.toast("%s is on the water" % mate_name)


## The crew is asked to agree to something: a small panel over the sea,
## Agree or Not now.
func _on_proposed(n: int, by: String, text: String) -> void:
	var p: Control = Control.new()
	p.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	p.theme = UiTheme.make()
	Kit.scrim(p)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	p.add_child(center)
	var card: Pane = Kit.pane(center, Kit.modal(Kit.GOLD, 22))
	card.custom_minimum_size = Vector2(480, 0)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	card.add_child(v)
	Kit.text(v, "A crew vote", "eyebrow", Kit.a(Kit.GOLD, 0.8))
	Kit.text(v, "%s asks the crew" % by, "title")
	Kit.text(v, text, "body", Kit.INK_2, true)
	Kit.text(v, "It goes ahead only if everyone aboard agrees.", "note", Kit.DIM, true)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	v.add_child(row)
	var no: Button = Kit.button("Not now", "secondary")
	no.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(no)
	var yes: Button = Kit.button("Agree", "primary")
	yes.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(yes)
	no.pressed.connect(func() -> void:
		net.vote(n, false)
		p.queue_free())
	yes.pressed.connect(func() -> void:
		net.vote(n, true)
		p.queue_free())
	_hud.hold_for(p)
	_room_layer.add_child(p)
	card.ready.connect(func() -> void: Kit.modal_in(card))
	no.grab_focus.call_deferred()


func _send_look() -> void:
	if net != null:
		_last_look = Skipper.look_of(session.profile())
		net.send_look(Skipper.look_of(session.profile()), session.captain_name())


## The hotspots: re-derived every 15 seconds (never while a fish is on), drawn
## on the water, and the one the boat is in shown on the HUD.
func _hotspots(delta: float, now: float) -> void:
	_spot_t += delta
	if _spot_t >= 15.0 and _hud.phase != "hooked":
		_spot_t = 0.0
		var standing: Dictionary = {}
		for h: Dictionary in Hotspots.at_time(now):
			standing[h["key"]] = h
		for k: String in _spots.keys():
			if not standing.has(k):
				(_spots[k] as HotspotPatch).leave()
				_spots.erase(k)
		for k: String in standing:
			if not _spots.has(k):
				var p: HotspotPatch = HotspotPatch.new()
				p.spot = standing[k]
				p.z_index = -1
				_world.add_child(p)
				_spots[k] = p
	var inside: Dictionary = {}
	for k: String in _spots:
		var h: Dictionary = (_spots[k] as HotspotPatch).spot
		if _boat.position.distance_to(Vector2(float(h["x"]), float(h["y"]))) <= float(h["r"]):
			inside = h
	_hud.set_spot(inside)


func _mote_layer() -> GPUParticles2D:
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
	g.set_color(0, Color(0.37, 0.94, 0.82, 0.0))
	g.add_point(0.3, Color(0.37, 0.94, 0.82, 0.75))
	g.add_point(0.7, Color(0.37, 0.94, 0.82, 0.55))
	g.set_color(g.get_point_count() - 1, Color(0.37, 0.94, 0.82, 0.0))
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
func _night_water(dark: float, at: Vector2) -> void:
	var r: float = at.length()
	var glow: float = 1.0 if r > 16000.0 else (0.6 if r > 10900.0 else 0.0)
	_motes.position = at
	_motes.amount_ratio = clampf(dark * glow, 0.0, 1.0)
	_motes.emitting = dark * glow > 0.02
	for list: Dictionary in [_regulars, _strangers]:
		for k: String in list:
			(list[k] as Wanderer).night = dark
	for b: Buyer in _buyers:
		b.night = dark
	if dark < 0.05:
		_water.set_shader_parameter("u_lamp_n", 0)
		return
	var xf: Transform2D = _world.get_global_transform_with_canvas()
	var vp: Vector2 = get_viewport_rect().size
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
	var bs: Vector2 = xf * (_boat.position + Vector2.from_angle(_boat.heading) * 30.0)
	var bdir: Vector2 = xf.basis_xform(Vector2.from_angle(_boat.heading))
	_water.set_shader_parameter("u_beam", Vector4(bs.x / vp.x, bs.y / vp.y, bdir.x, bdir.y))
	_water.set_shader_parameter("u_beam_len", 280.0 + 520.0 * _boat.lantern_glow)
	_water.set_shader_parameter("u_beam_k", 0.6 + 0.4 * _boat.lantern_glow)
	add_lamp.call(_town_light.position + Vector2(0, 260), 46.0, 0.45, Color(1.0, 0.74, 0.45))
	for bid: String in _berths:
		pass
	for list: Dictionary in [_regulars, _strangers]:
		for k: String in list:
			var w: Wanderer = list[k]
			add_lamp.call(w.position + keel, 12.0, 0.18, Color(1.0, 0.74, 0.45))
	if _portal.live:
		add_lamp.call(_portal.position + Vector2(0, 120), 60.0, 0.22, Color(str(Portal.tier_def(_portal.tier).get("accent", "#7fc8de"))))
	_water.set_shader_parameter("u_lamps", lamps)
	_water.set_shader_parameter("u_lamp_cols", cols)
	_water.set_shader_parameter("u_lamp_n", lamps.size())
	var blooms: Array[Vector4] = []
	for b: Array in BLOOMS:
		var bp: Vector2 = SeaScale.expand(Vector2(float(b[0]), float(b[1])))
		if blooms.size() < 4 and bp.distance_to(at) < float(b[2]) + 2600.0:
			blooms.append(Vector4(bp.x, bp.y, b[2], 1.0))
	while blooms.size() < 4:
		blooms.append(Vector4(0, 0, 0, 0))
	_water.set_shader_parameter("u_blooms", blooms)


## The weather (core/weather.gd's fronts): on the water, in the air, on the
## hull and in how she sails.
func _weather(delta: float, now: float, at: Vector2) -> void:
	var fx: Dictionary = Weather.effect(at, now, _boat.heading)
	var f: Dictionary = fx["front"]
	if not f.is_empty():
		var e: Vector2 = Weather.edges(f, now)
		var dir: Vector2 = f["dir"]
		_water.set_shader_parameter("u_front", Vector4(dir.x, dir.y, e.x, e.y))
		_water.set_shader_parameter("u_front_c", Weather.centre())
		_water.set_shader_parameter("u_front_w", float(Weather.KINDS[f["kind"]].get("cloud", 0.0)))
	else:
		_water.set_shader_parameter("u_front_w", 0.0)
	var cloud: float = float(fx["cloud"])
	_storm = lerpf(_storm, cloud, 1.0 - exp(-delta * 0.55))
	_squall.step(delta, float(fx["rain"]), 1.0 if fx["lightning"] else 0.5, get_viewport_rect().size)
	var wind: float = float(fx["k"]) if not f.is_empty() and f["kind"] == "wind" else 0.0
	_squall.step_air(delta, float(fx["fog"]), _boat.get_global_transform_with_canvas().origin, wind, f.get("dir", Vector2.RIGHT), get_viewport_rect().size)
	_water.set_shader_parameter("u_flash", _squall.flash)
	# The chart is paper over the sea: no rain or fog on it.
	_squall.visible = _chart == null
	_boat.storm = _storm
	_boat.weather_speed = float(fx["speed"])
	_boat.weather_turn = float(fx["turn"])
	_boat.weather_cue = str(fx["cue"])
	# The sea's sound: her way, a hard turn, how far out, the nearest shore.
	var spd: float = clampf(_boat.velocity.length() / (300.0 * 1.4), 0.0, 1.0)
	var turn: float = 0.0
	if _boat.velocity.length() > 40.0:
		turn = minf(1.0, absf(wrapf(_boat.heading - _snd_heading, -PI, PI)) / maxf(delta, 0.001) / 0.35 / 10.0)
	_snd_heading = _boat.heading
	var depth: float = clampf((at.y - 1400.0) / 21200.0, 0.0, 1.0)
	var land: float = 0.0
	var shore: Vector2 = at
	for p: Dictionary in Chart.ports() + (Rules.data()["isles"] as Array):
		var c: Vector2 = Vector2(float(p["x"]), float(p["y"]))
		var edge: float = c.distance_to(at) - float(p["r"])
		var l: float = clampf(1.0 - edge / 900.0, 0.0, 1.0)
		if l > land:
			land = l
			shore = c
	if _life.flock_at != Vector2.INF and _life.flock_at.distance_to(at) < 1600.0:
		land = maxf(land, clampf(1.0 - _life.flock_at.distance_to(at) / 1600.0, 0.0, 1.0))
		shore = _life.flock_at
	var shore_canvas: Vector2 = _world.get_global_transform() * shore
	_sound.step(delta, spd, turn, depth, land, _squall.rain, SeaClock.at(now)["darkness"], _hud.busy(), shore_canvas)


## The moorings near the view, for the water to paint.
func _feed_berths(at: Vector2) -> void:
	var near: Array = []
	for bid: String in _berths:
		var b: Berth = _berths[bid]
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
	_water.set_shader_parameter("u_berths", out)


## Ease the grade toward the water she is in.
func _grade(delta: float, at: Vector2, dark: float) -> void:
	var w: Dictionary = Chart.water_at(at)
	var g: Array = GRADES.get(str(w.get("id", "")), GRADES[""])
	var k: float = 1.0 - exp(-delta * 0.8)
	_env.adjustment_brightness = lerpf(_env.adjustment_brightness, float(g[0]), k)
	_env.adjustment_contrast = lerpf(_env.adjustment_contrast, float(g[1]), k)
	_env.adjustment_saturation = lerpf(_env.adjustment_saturation, float(g[2]) * (1.0 - dark * 0.15), k)
	# Night blooms more: the lights are what is left.
	_env.glow_intensity = lerpf(_env.glow_intensity, 0.12 + dark * 0.7, k)


## Where the boat is and what it has seen, saved (before any claim, too: the
## rules check the saved position).
func _flush_position() -> void:
	var seen: Array = _fog_new.duplicate()
	_fog_new.clear()
	var seen_exp: Array = _xfog.fresh.duplicate() if _xfog != null else []
	if _xfog != null:
		_xfog.fresh.clear()
	await session.act("saveSeaPosition", [round(_boat.position.x), round(_boat.position.y), seen, seen_exp])
	session.persist()


## The isles, the digs' tells and the bottles: what to draw, and how close.
func _finds(delta: float, now: float, lift: Color) -> void:
	var at: Vector2 = _boat.position
	var near_isle: Dictionary = Explore.isle_near(at.x, at.y)
	var found: Array = session.save.get("discoveries", [])
	for id: String in _isles:
		var n: SeaFinds.IsleNode = _isles[id]
		var was: bool = n.found
		var was_near: bool = n.near
		n.found = Js.includes(found, id)
		n.near = near_isle.get("id") == id
		n.lift = lift
		if n.found != was or n.near != was_near:
			n.refresh()
	for id: String in _digs:
		var h: SeaFinds.DigHint = _digs[id]
		var d: float = at.distance_to(h.position)
		h.strength = clampf((Explore.DIG_HINT_RANGE - d) / 480.0, 0.0, 1.0) if not _dug(id) else 0.0
		# A buried site shows itself only to a hunt that points at it.
		if Clues.on() and Clues.dig_open(session.profile(), id) == "":
			h.strength = 0.0
		# Something on the bottom: bubbles breaking the surface over it, more
		# of them and stronger the closer she is.
		if h.strength > 0.0:
			h.bubble_t -= delta
			if h.bubble_t <= 0.0:
				h.bubble_t = randf_range(0.35, 1.1) / (0.4 + h.strength)
				var off: Vector2 = Vector2(randf_range(-55.0, 55.0), randf_range(-35.0, 35.0))
				_field.ring(h.position + off, randf_range(26.0, 58.0), 1.2, 0.25 + 0.4 * h.strength)
	_bottle_t += delta
	var win: int = Clues.sea_day(now) if Clues.on() else Explore.bottle_window(now)
	if _bottle_t > 10.0 or win != _bottle_win:
		_bottle_t = 0.0
		_bottle_win = win
		var want: Dictionary = {}
		var near: Array = Clues.bottles_near(session.profile(), at.x, at.y, 5200.0, now) if Clues.on() else Explore.bottles_around(at.x, at.y, 5200.0, now)
		for b: Dictionary in near:
			if not _taken.has(b["key"]):
				want[b["key"]] = b
		for k: String in _bottles.keys():
			if not want.has(k):
				(_bottles[k] as Node).queue_free()
				_bottles.erase(k)
		for k: String in want:
			if not _bottles.has(k):
				var bn: SeaFinds.BottleNode = SeaFinds.BottleNode.new()
				bn.bottle = want[k]
				_world.add_child(bn)
				_bottles[k] = bn


func _dug(site_id: String) -> bool:
	for r: Dictionary in session.save.get("digs", []):
		if r["site_id"] == site_id and r.get("dug_at") != null:
			return true
	return false


## The nearest thing to do out here: an isle to land on, a site to dig, a
## bottle to fish out. [label, action] or null.
func _find_in_reach(at: Vector2) -> Variant:
	var clue: Variant = _clue_in_reach(at)
	if clue != null:
		return clue
	var isle: Dictionary = Explore.isle_near(at.x, at.y)
	if not isle.is_empty():
		var been: bool = Js.includes(session.save.get("discoveries", []), isle["id"])
		return [("Look again at %s" if been else "Go ashore at %s") % isle["name"], _land.bind(isle)]
	var site: Dictionary = Explore.dig_at(at.x, at.y)
	if not site.is_empty() and not Clues.on() and not _dug(site["id"]):
		return ["Drop the grapple", _dig.bind(site)]
	for k: String in _bottles:
		var bn: SeaFinds.BottleNode = _bottles[k]
		if at.distance_to(bn.position) < Explore.BOTTLE_REACH:
			return ["Take the bottle", _bottle.bind(bn.bottle)]
	return null


## A treasure hunt's step she has reached: [label, action] or null. A dig is
## the hunt's last step and the only way a site is found (port rules).
func _clue_in_reach(at: Vector2) -> Variant:
	if not Clues.on():
		return null
	var p: Dictionary = session.profile()
	for th: Array in Clues.hunts(p):
		var tier: String = th[0]
		var s: Dictionary = Clues.current(p, tier)
		match s.get("kind", ""):
			"bearing":
				if at.distance_to(Vector2(float(s["x"]), float(s["y"]))) < Clues.SEARCH_RANGE:
					return ["Search here  ·  %s" % Clues.TIER_NAME[tier], _clue_search.bind(tier)]
			"riddle":
				if at.distance_to(Vector2(float(s["x"]), float(s["y"]))) < float(s["r"]) + Clues.SEARCH_RANGE:
					return ["Search here  ·  %s" % Clues.TIER_NAME[tier], _clue_search.bind(tier)]
			"dig":
				if at.distance_to(Vector2(float(s["x"]), float(s["y"]))) < Clues.SEARCH_RANGE:
					return ["Dig here  ·  %s" % Clues.TIER_NAME[tier], _clue_search.bind(tier)]
			"speak":
				var w: Variant = _regulars.get("folk:%s" % s["folk"])
				if w != null and (w as Wanderer).near(at):
					return ["Ask %s about the clue" % (w as Wanderer).info["name"], _clue_search.bind(tier)]
	return null


func _clue_search(tier: String) -> void:
	Rumble.tap(14)
	await _flush_position()
	var r: Variant = await session.act("clueSearch", [tier])
	session.persist()
	if not r is Dictionary or not (r as Dictionary).get("ok", false):
		_hud.toast(str((r as Dictionary).get("error", "Nothing here.")) if r is Dictionary else "Nothing here.")
		return
	var res: Dictionary = r
	if res.get("done", false):
		var haul: Array = []
		if Js.num(res.get("doubloons")) > 0:
			haul.append([res["doubloons"], "doubloons"])
		var lines: Array = [["The %s's hunt is done. The casket held:" % Clues.TIER_NAME[tier], "note"]]
		for b: Variant in Js.obj(res.get("bait")):
			lines.append(["%d %s" % [int(res["bait"][b]), Rules.bait(str(b)).get("name", b)], "body_strong"])
		for nt: Variant in Js.obj(res.get("notices")):
			lines.append(["A %s, for the Crew Hall" % Js.obj(Crew.notice_defs().get(nt)).get("name", nt), "body_strong"])
		for kv: Variant in Js.obj(res.get("vouchers")):
			lines.append(["A %s! Open it in the Crew Hall's Trunk" % Skins.kind_def(str(kv)).get("name", kv), "body_strong"])
		for c: Variant in Js.obj(res.get("crates")):
			var cname: String = str((CrateMoment.TIERS.get(c, [str(c).capitalize()]) as Array)[0])
			var cn: int = int(res["crates"][c])
			lines.append([("%s, stowed in your Locker" % cname) if cn == 1 else ("%d of the %s, stowed in your Locker" % [cn, cname]), "body_strong"])
		Sound.chest(true)
		_show_find(SeaFinds.panel(_room_layer, "sea/dig-box.png", "Hauled up from the bottom", "%s casket" % Clues.TIER_NAME[tier], lines, haul))
	else:
		Sound.bell()
		_show_find(SeaFinds.panel(_room_layer, "sea/sea-bottle.png", "%s  ·  step %d of %d" % [Clues.TIER_NAME[tier], int(res["stepNo"]), int(res["of"])], "The next step", [[str(res["next"]["text"]), "body_strong"]], []))
	_hud.refresh()


func _land(isle: Dictionary) -> void:
	Rumble.buzz([18, 40, 24])
	await _flush_position()
	var r: Variant = await session.act("goAshore", [isle["id"]])
	session.persist()
	if not r is Dictionary or not (r as Dictionary).get("ok", false):
		_hud.toast(str((r as Dictionary).get("error", "The sea took that one. Try again.")) if r is Dictionary else "The sea took that one. Try again.")
		return
	var res: Dictionary = r
	var note: Variant = res.get("note")
	var lines: Array = []
	if note != null:
		lines.append([str(note["title"]), "heading"])
		lines.append([str(note["body"]), "note"])
	if res.get("already", false):
		_show_find(SeaFinds.panel(_room_layer, "sea/isle-note.png" if note != null else "sea/isle-chest-open.png", "Been ashore before", res["name"], lines if not lines.is_empty() else ["Nothing left here but the view."], []))
		return
	var haul: Array = []
	if Js.num(res.get("doubloons")) > 0:
		haul.append([res["doubloons"], "doubloons"])
	if Js.num(res.get("gems")) > 0:
		haul.append([res["gems"], "gems"])
	if res.get("salvage") != null:
		lines.append(["Salvaged: %s. Nobody sells one. It is waiting at the Homestead." % res["salvage"]["name"], "body"])
	if res.get("stone") != null:
		lines.append(["A portal stone for %s. The Homestead portal will remember the road." % res["stone"]["name"], "body"])
	Sound.chest(not haul.is_empty())
	_show_find(SeaFinds.panel(_room_layer, "sea/isle-note.png" if note != null else "sea/isle-chest-open.png", "Ashore", res["name"], lines, haul))
	_hud.refresh()


func _dig(site: Dictionary) -> void:
	Rumble.buzz([0, 40, 30, 60])
	await _flush_position()
	var r: Variant = await session.act("digHere", [site["id"]])
	session.persist()
	if not r is Dictionary or not (r as Dictionary).get("ok", false):
		_hud.toast(str((r as Dictionary).get("error", "The spade turned nothing up. Try again.")) if r is Dictionary else "The spade turned nothing up. Try again.")
		return
	Sound.chest(true)
	_show_find(SeaFinds.panel(_room_layer, "sea/dig-box.png", "Hauled up from the bottom", r["name"], [[str(r["found"]), "note"]], [[r["doubloons"], "doubloons"], [r["gems"], "gems"]]))
	_hud.refresh()


func _bottle(b: Dictionary) -> void:
	Rumble.tap(14)
	await _flush_position()
	var r: Variant = await session.act("openBottle", [b["key"]])
	session.persist()
	# Holding a clue of its tier: it is left where it floats.
	if r is Dictionary and (r as Dictionary).get("held", false):
		_hud.toast(str(r["error"]))
		return
	_taken[b["key"]] = true
	if _bottles.has(b["key"]):
		(_bottles[b["key"]] as Node).queue_free()
		_bottles.erase(b["key"])
	if not r is Dictionary or not (r as Dictionary).get("ok", false):
		_hud.toast(str((r as Dictionary).get("error", "It slipped out of your hands. Try that one again.")) if r is Dictionary else "It slipped out of your hands. Try that one again.")
		return
	if Clues.on():
		var hunt: Dictionary = r["hunt"]
		Sound.bell()
		_show_find(SeaFinds.panel(_room_layer, "sea/sea-bottle.png", "Fished out of the water", "A %s" % Clues.TIER_NAME[r["tier"]],
			[["A treasure hunt: %d steps, then a dig. Your clues are listed at the left of the screen." % (hunt["steps"] as Array).size(), "note"], ["Step 1: %s" % r["step"]["text"], "body_strong"]], []))
		_hud.refresh()
		return
	var lines: Array = [[str(r["text"]), "note"]]
	var title: String = "A note in a bottle"
	if r.get("kind") == "bearing":
		title = "A bearing: %s" % r["name"]
		lines.append([str(r["bearing"]), "body_strong"])
		lines.append(["Something lies on the bottom there. Sail over it and drop the grapple.", "small"])
	_show_find(SeaFinds.panel(_room_layer, "sea/sea-bottle.png", "Fished out of the water", title, lines, []))


func _show_find(p: Control) -> void:
	_hud.hold_for(p)


## The reef and the anchorage's wall, rock by rock (North), and the names
## over the arch and the Sea Gate.
func _draw_north() -> void:
	# IN THE WATER, as the boats are (Kong: "the boulders don't look
	# submerged"): the foot of each rock below a lapping waterline, and the
	# water it pushes aside ringing it. Each its own material, since the
	# shader's sizes follow the rock's.
	for r: Array in North.rocks():
		var t: Texture2D = Skipper.tex(r[0])
		if t == null:
			continue
		var holder: Node2D = Node2D.new()
		holder.position = Vector2(float(r[1]), float(r[2]))
		_world.add_child(holder)
		var s: Sprite2D = Sprite2D.new()
		s.texture = t
		var sc: float = float(r[3]) / float(t.get_width())
		s.scale = Vector2(sc, sc / Chart.GROUND)
		# The painted foot, and the water a little up from it.
		var band: Vector2 = Skipper._band(t)
		# Standing on the water: the picture's foot at its point (so the
		# arch's span draws over a boat in the passage behind its front foot).
		s.offset = Vector2(0, -t.get_height() * (band.y - 0.5))
		var arch: bool = r[0] == North.ARCH
		var cut: float = band.y - 0.13
		var depth: float = 0.12
		var phase: float = randf() * 6.0
		if arch:
			# Its two feet at different heights: the water slopes between them.
			cut = 0.72
		var m: ShaderMaterial = Skipper.afloat_mat("res://game/fx/waterline.gdshader", s, cut, depth, phase)
		m.set_shader_parameter("lap_amp", 0.4)
		if arch:
			m.set_shader_parameter("tilt", -0.43)
		s.material = m
		# The ring sits behind the rock, from its own shape (not the arch's:
		# one ring would run across the open passage).
		if not arch:
			var ring: Sprite2D = Skipper.collar_of(s, cut, depth, phase)
			ring.offset = s.offset
			holder.add_child(ring)
		holder.add_child(s)
		if arch:
			_arch = s
	for sign: Array in [["The Sea Gate", North.SEA_GATE + Vector2(0, 520.0)]]:
		var holder: Node2D = Node2D.new()
		holder.position = sign[1]
		holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
		holder.z_index = 5
		_world.add_child(holder)
		var l: Label = Kit.text(null, sign[0], "display", Color(0.97, 0.93, 0.85, 0.9))
		l.add_theme_font_size_override("font_size", 46)
		l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
		l.add_theme_constant_override("shadow_outline_size", 10)
		holder.add_child(l)
		l.position = Vector2(-l.get_minimum_size().x / 2.0, -30.0)


## FINN (The Long Cast): his state read off the save each second (a pure
## read of the local copy, so a crewmate's Charter never sends it), the mark
## over him, the story line and the arrow to him.
var _finn: FinnHull
var _finn_st: Dictionary = {}
var _finn_t: float = 99.0
var _finn_ring: float = 0.0


func _finn_tick(delta: float) -> void:
	if _finn == null:
		return
	# The calm round him: slow rings going out, as off nobody else.
	_finn_ring += delta
	if _finn_ring >= 3.2:
		_finn_ring = 0.0
		_field.ring(_finn.position, 170.0, 3.2, 0.32)
	_finn_t += delta
	if _finn_t >= 1.0:
		_finn_t = 0.0
		_finn_refresh()
	var xf: Transform2D = _world.get_global_transform_with_canvas()
	_hud.finn_arrow(null if North.is_north(_boat.position) else xf * _finn.position, _finn.mark)


func _finn_refresh() -> void:
	var r: Variant = Finn.state(session.store, session.uid)
	if not (r is Dictionary):
		return
	_finn_st = r
	var q: Variant = _finn_st.get("quest")
	if _finn_st.get("questReady", false):
		_finn.mark = "!"
	elif q == null and not Finn.next_quest(Js.list(_finn_st.get("questsDone")), int(Js.num(_finn_st.get("fishingLevel")))).is_empty():
		_finn.mark = "?"
	else:
		_finn.mark = ""
	_hud.set_story(_finn_st)


func _open_finn() -> void:
	Rumble.tap(12)
	_boat.velocity = Vector2.ZERO
	_boat.target = null
	_finn_refresh()
	var sc: FinnScene = FinnScene.new()
	sc.session = session
	sc.st = _finn_st
	sc.changed.connect(func() -> void:
		session.persist()
		_finn_refresh())
	sc.paid.connect(func(xp: float, from: Vector2) -> void: _hud.story_pour(xp, from))
	var moment: Array = [0]
	sc.chapter_done.connect(func(n: int) -> void: moment[0] = n)
	sc.closed.connect(func() -> void:
		# A chapter closed: the sea round her answers (game/finn_moment.gd).
		if moment[0] > 0:
			FinnMoment.play(_world, _boat.position, _field, moment[0], _boat.z_index + 1)
		_finn_refresh()
		_hud.after_story.call_deferred())
	_hud.hold_for(sc)
	_hud_layer.add_child(sc)


## THROUGH THE ARCH (Kong, 2026-10-02: make the crossing feel great), by
## where she is, not by a timer, so turning back runs it backward: the view
## eases out as she enters the passage (the stone's scale), and under the span
## the music closes in to a muffle and opens again beyond.
var _pass_k: float = 0.0
## The arch's picture: thinned while she is behind its span, so the stone
## never hides her (she shows through it).
var _arch: Sprite2D


func _passage(delta: float) -> void:
	var p: Vector2 = _boat.position
	var lane: float = 1.0 - smoothstep(North.GATE_HALF + 150.0, North.GATE_HALF + 650.0, absf(p.x - North.GATE_X))
	var dy: float = absf(p.y - (Explore.NORTH_WALL - 160.0))
	var near: float = (1.0 - smoothstep(150.0, 900.0, dy)) * lane
	_pass_k = lerpf(_pass_k, near, 1.0 - exp(-delta * 2.5))
	var under: float = (1.0 - smoothstep(60.0, 420.0, dy)) * lane
	Sound.muffle(under)
	if _arch != null:
		# The span covers, on screen, the water from about 660 to 1,430 north
		# of its near foot (the picture stands 895 / Chart.GROUND tall).
		var foot: float = Explore.NORTH_WALL + 60.0
		var behind: float = smoothstep(560.0, 760.0, foot - p.y) * (1.0 - smoothstep(1330.0, 1530.0, foot - p.y))
		behind *= 1.0 - smoothstep(North.ARCH_WIDE * 0.4, North.ARCH_WIDE * 0.55, absf(p.x - North.GATE_X))
		_arch.modulate.a = lerpf(_arch.modulate.a, 1.0 - 0.55 * behind, 1.0 - exp(-delta * 6.0))


## THE CHANGE OF BOAT (North): past the sign in the arch, the ship.
func _ship_side() -> void:
	var want: bool = North.ship_water(_boat.position)
	if want == _boat.on_ship:
		_sided = true
		return
	var sa: Dictionary = North.ship_art(session.profile().get("ship_tier"), session.profile().get("equipped_ship_skin"))
	var def: Dictionary = sa["def"]
	var art: String = sa["art"]
	var wide: float = sa["wide"]
	# The first time (opening the sea already north) is no crossing.
	var crossing: bool = _sided
	_sided = true
	_boat.set_ship(want, def, Skipper.tex(art), wide, crossing)
	_hud.set_side(want, crossing)
	if not crossing:
		return
	# The water gives under her: rings running out, one after another.
	for k: int in 3:
		get_tree().create_timer(0.12 * k).timeout.connect(func() -> void:
			if is_instance_valid(_boat):
				_field.ring(_boat.position, 120.0 + 70.0 * k, 1.6 + 0.3 * k, 0.6 - 0.15 * k))
	Rumble.buzz([0, 30, 30, 50])
	if want:
		Sound.horn()
	else:
		Sound.bell()
	if want:
		_hud.side_banner("The Anchorage", "Your %s is under you" % str(def.get("name", "ship")))
	else:
		_hud.side_banner("The Fishing Grounds", "Back on your boat")


var _gate_note_t: float = -99.0
var _sided: bool = false


## The expedition row (Crew, Recruits, Ship), north of the arch.
func _open_expedition(what: String) -> void:
	if _hud.busy():
		return
	var c: Control
	if what == "ship":
		var sh: ShipSheet = ShipSheet.new()
		sh.session = session
		sh.closed.connect(func() -> void: _hud.refresh())
		c = sh
	else:
		var ch: CrewHall = CrewHall.new()
		ch.session = session
		ch.at_hall = false
		ch.room = "roster" if what == "crew" else "recruit"
		ch.closed.connect(func() -> void: _hud.refresh())
		c = ch
	_hud.hold_for(c)
	_room_layer.add_child(c)
var _crew_key: String = ""


## SUNRISE AT THE CREW HALL (Kong, 2026-10-02): a fresh board of hopefuls comes
## in each sea day; say so when it does, and on coming back to one not yet
## looked at (the board is stamped when the hall is opened).
func _crew_morning(now: float) -> void:
	if Crew.port().is_empty():
		return
	var key: String = Crew.board_key(now)
	if key == _crew_key:
		return
	var first: bool = _crew_key == ""
	_crew_key = key
	if str(session.profile().get("last_free_recruit_date", "")) == key:
		return
	if first and session.profile().get("last_free_recruit_date") == null and Crew.live(session.store).is_empty():
		# A captain who has never been to the hall hears of it once they have.
		return
	_hud.notify("SUNRISE", "New hopefuls at the Crew Hall",
		"A fresh board of hands is looking for a ship. Moor at the Crew Hall, north through the arch, to meet them.",
		Skipper.tex("crew/hall_%d.png" % Crew.clamp_hall(session.profile().get("crew_hall_tier"))))


func _held_at_gate() -> void:
	var now: float = Time.get_ticks_msec() / 1000.0
	if now - _gate_note_t < 6.0:
		return
	_gate_note_t = now
	_hud.toast("She sails with nobody aboard. Seat your raid party at the Gunwharf before you go out.")


var _bay_note_t: float = -99.0


## Held on a shut bay's rim: the helm says which, and what opens it.
func _held_at_bay(line: String) -> void:
	var now: float = Time.get_ticks_msec() / 1000.0
	if now - _bay_note_t < 4.0:
		return
	_bay_note_t = now
	Rumble.tap(12)
	_hud.toast(line)


## The Sea Gate opens with a captain seated to fight (an empty ship does not
## go out: every fight past it is fought by the crew in the seats).
func _open_sea_gate() -> void:
	var seated: bool = false
	for c: Dictionary in Crew.live(session.store):
		if c.get("raid_slot") != null and float(c["raid_slot"]) == 0.0:
			seated = true
	North.gate_open = seated


## A new chapter's water opened: the parchment, once (markChapterUnlockSeen).
func celebrate_chapter() -> void:
	var ch: Dictionary = _campaign.owed_chapter()
	if ch.is_empty() or _hud.busy():
		return
	var prev: Dictionary = Campaign.chapters()[int(ch["number"]) - 2]
	var card: ChapterCard = ChapterCard.new()
	card.chapter = ch
	card.sparks = true
	card.eyebrow = "CHAPTER %s COMPLETE  ·  NEW CHAPTER UNLOCKED" % str(prev.get("romanNumeral", ""))
	card.finished.connect(func() -> void:
		session.act("markChapterUnlockSeen", [ch["id"]])
		session.persist()
		_campaign.refresh())
	_hud.hold_for(card)
	_hud_layer.add_child(card)


## Back to the Gunwharf's berth (a lost fight, a gate that held): the sea
## dims and she is there.
func warp_to_gunwharf() -> void:
	if not _berths.has("gunwharf"):
		return
	var at: Vector2 = (_berths["gunwharf"] as Node2D).position
	_warp(at.x, at.y, Color(0.85, 0.75, 0.6))


## A node of the campaign pressed at the helm: a fight is taken on from its
## dock; anything else opens its sheet (or its scene).
func open_node(id: String) -> void:
	var n: Dictionary = Campaign.node(id)
	var st: String = str(_campaign.status.get(id, "locked"))
	if n["type"] == "skirmish" and st != "locked" and n.get("raidId") != null:
		start_battle(str(n["raidId"]), id)
		return
	var sheet: NodeSheet = NodeSheet.new()
	sheet.sea = self
	sheet.node_id = id
	sheet.done.connect(func() -> void:
		_campaign.refresh()
		_hud.refresh()
		get_tree().create_timer(0.4).timeout.connect(celebrate_chapter))
	_hud.hold_for(sheet)
	_hud_layer.add_child(sheet)


func _draw_port(port: Dictionary) -> void:
	var c: Vector2 = Vector2(float(port["x"]), float(port["y"]))
	var r: float = float(port["r"])
	var d: float = r * 2.0
	var pl: Variant = port.get("plate")
	if pl != null:
		var plate: Sprite2D = Sprite2D.new()
		plate.texture = Lit.tex(String((pl as Dictionary)["art"]))
		if plate.texture != null:
			var w: float = d * float(pl.get("width", 1.0))
			var sc: float = w / float(plate.texture.get_width())
			plate.scale = Vector2(sc, sc / Chart.GROUND)
			var h: float = plate.texture.get_height() * sc
			plate.position = c + Vector2(0, (0.5 - float(pl.get("water", 0.42))) * h / Chart.GROUND)
			plate.z_index = -2
			_world.add_child(plate)
			Shore.trace(plate)
	for bd: Dictionary in port["buildings"]:
		var b: Sprite2D = Sprite2D.new()
		b.texture = Lit.tex(String(bd["art"]))
		if b.texture == null:
			continue
		var bs: float = d * float(bd["scale"]) / float(b.texture.get_width())
		b.scale = Vector2(bs, bs / Chart.GROUND)
		b.offset = Vector2(0, -b.texture.get_height() / 2.0)
		b.position = c + Vector2(-r + float(bd["x"]) / 100.0 * d, -r + float(bd["y"]) / 100.0 * d)
		_world.add_child(b)
	var be: Dictionary = port["berth"]
	var berth: Berth = Berth.new()
	berth.r = float(be["r"])
	berth.position = Vector2(float(be["x"]), float(be["y"]))
	berth.bearing = (berth.position - c).angle()
	berth.z_index = -1
	_world.add_child(berth)
	_berths[port["id"]] = berth


## Tying up: the bell, then whatever the port opens.
func _dock(id: String) -> void:
	match id:
		"mainland":
			_go_ashore()
		"shipyard":
			Rumble.buzz([18, 40, 24])
			Sound.bell()
			_enter_room("shipyard")
		"crew_hall":
			Rumble.buzz([18, 40, 24])
			Sound.bell()
			var ch: CrewHall = CrewHall.new()
			ch.session = session
			ch.closed.connect(func() -> void: _hud.refresh())
			_hud.hold_for(ch)
			_room_layer.add_child(ch)
		"gunwharf":
			Rumble.buzz([18, 40, 24])
			Sound.bell()
			var gw: GunwharfSheet = GunwharfSheet.new()
			gw.session = session
			gw.closed.connect(_open_sea_gate)
			_hud.hold_for(gw)
			_room_layer.add_child(gw)
		_:
			Rumble.tap(10)
			var p: Dictionary = Chart.port(id)
			if North.COMING.has(id):
				Sound.bell()
				_show_find(SeaFinds.panel(_room_layer, str(Js.obj(p.get("plate")).get("art", "")).trim_prefix("/"), "Moored", str(p.get("name", "")),
					[[str(p.get("blurb", "")).replace("’", "'"), "body_strong"], [North.COMING[id], "note"], ["Its rooms come in a later build of the port.", "small"]], []))
			else:
				_hud.toast("%s is not built yet in this build." % p.get("name", "That port"))


## A FIGHT ON THE WATER (game/battle_stage.gd): the sea becomes its stage.
func start_battle(raid_id: String, node_id: String = "") -> void:
	# In a Charter every raid goes through the founder's table (the purse is
	# the crew's): the call goes out, and the line forms when it sails.
	if raids_shared():
		var r: Variant = await session.act("raidTable", ["call", { "raidId": raid_id, "nodeId": node_id, "x": _boat.position.x, "y": _boat.position.y }])
		if r is Dictionary and r.has("error"):
			_hud.toast(str(r["error"]))
		return
	# Alone: the entry screen first (the skirmish, a lesson, sails straight in).
	if Battle.raid_def(raid_id).get("skirmish", false) != true:
		var rs: ReadyScreen = ReadyScreen.new()
		rs.sea = self
		rs.raid_id = raid_id
		rs.node_id = node_id
		rs.sail.connect(func(_tier: String) -> void: _launch(raid_id, node_id))
		_hud.hold_for(rs)
		_hud_layer.add_child(rs)
		return
	_launch(raid_id, node_id)


## Into the fight, alone.
func _launch(raid_id: String, node_id: String) -> void:
	var st: BattleStage = BattleStage.new()
	st.sea = self
	st.raid_id = raid_id
	var mark: CampaignWater.Ship = _campaign.ship(node_id) if node_id != "" else null
	if mark != null:
		st.mark = mark
		st.dock = mark.dock()
	st.finished.connect(func(_won: bool) -> void:
		_campaign.refresh()
		_open_sea_gate()
		_hud.refresh()
		get_tree().create_timer(0.4).timeout.connect(celebrate_chapter))
	_hud.hold_for(st)
	_hud_layer.add_child(st)


## Is this captain in a Charter whose raids go through the founder's table?
func raids_shared() -> bool:
	if RaidTable.live == null:
		return false
	return session.remote != null or (session.charter != null and session.charter.raids != null)


## The line has formed for a Charter's raid this captain is in: to the fight.
func open_coop_battle(table_state: Dictionary, my_key: String) -> void:
	var node_id: String = str(table_state.get("nodeId", ""))
	var st: BattleStage = BattleStage.new()
	st.sea = self
	st.raid_id = str(table_state["raidId"])
	st.table = RaidTable.live
	st.my_key = my_key
	var mark: CampaignWater.Ship = _campaign.ship(node_id) if node_id != "" else null
	if mark != null:
		st.mark = mark
		st.dock = mark.dock()
	st.finished.connect(func(_won: bool) -> void:
		_campaign.refresh()
		_open_sea_gate()
		_hud.refresh()
		get_tree().create_timer(0.4).timeout.connect(celebrate_chapter))
	_hud.hold_for(st)
	_hud_layer.add_child(st)


func _go_ashore() -> void:
	Rumble.buzz([18, 40, 24])
	Sound.bell()
	var a: Ashore = Ashore.new()
	a.chose.connect(_enter_room)
	_hud.hold_for(a)
	_hud_layer.add_child(a)


func _enter_room(door: String) -> void:
	var room: Room
	match door:
		"market":
			room = MarketRoom.new()
		"shipyard":
			room = ShipyardRoom.new()
		"den":
			room = DenRoom.new()
		"parlor":
			room = ParlorRoom.new()
		"chart_room":
			room = ChartStudy.new()
		_:
			room = TackleRoom.new()
	room.session = session
	room.closed.connect(func() -> void:
		_boat.set_look(Skipper.look_of(session.profile()))
		_boat.set_fit(session.profile())
		_send_look()
		_hud.refresh())
	_hud.hold_for(room)
	_room_layer.add_child(room)


# ── The regulars and the wanderers ─────────────────────────────────────────────

## The nine regulars and Yoon, where the chart moors them: each regular works
## their own water (all the slack it leaves them, in legs with a sit between);
## Yoon barely moves.
func _moor_regulars() -> void:
	for m: Dictionary in Rules.data()["regulars"]["moorings"]:
		var f: Dictionary = Folk.by_id(str(m["folkId"]))
		var info: Dictionary
		if m["folkId"] == "yoon":
			info = Traders.yoon()
		else:
			info = {
				"key": "folk:%s" % m["folkId"], "kind": "talker", "folkId": m["folkId"], "name": m["name"],
				"x": m["x"], "y": m["y"], "line": m["line"],
				"driftR": Chart.drift_r(Vector2(float(m["x"]), float(m["y"])), m["zoneId"]) / 0.6,
				"driftRate": m["driftRate"], "driftPhase": m["driftPhase"], "look": m["look"],
				"deal": "talk", "topic": "chat", "mood": "One of the regulars", "lines": [m["line"]],
			}
		var w: Wanderer = Wanderer.new()
		w.info = info
		w.role = str(f.get("role", "One of the regulars"))
		if not f.is_empty():
			w.accent = Color(str(f["accent"]))
		_world.add_child(w)
		_regulars[info["key"]] = w


## The strangers round the boat: re-derived when the boat crosses a cell or
## night comes and goes (the runners), and the day's dealt list when the sea
## day turns.
func _wanderers(now: float, clock: Dictionary, lift: Color) -> void:
	var day: int = Traders.sea_day(now)
	if day != _dealt_day:
		_dealt_day = day
		_load_dealt()
	var at: Vector2 = _boat.position
	var cell: float = float(Rules.data()["traders"]["cell"])
	var night: bool = clock["phase"] == "night" or clock["phase"] == "dusk"
	var ck: String = "%d:%d|%s|%d" % [int(floor(at.x / cell)), int(floor(at.y / cell)), night, day]
	if ck != _trader_cell:
		_trader_cell = ck
		var want: Dictionary = {}
		for t: Dictionary in Traders.around(at.x, at.y, 2400.0, day, now):
			want[t["key"]] = t
		for k: String in _strangers.keys():
			if not want.has(k) and k != _hailing:
				(_strangers[k] as Node).queue_free()
				_strangers.erase(k)
		var labels: Dictionary = Rules.data()["traders"]["kindLabel"]
		for k: String in want:
			if _strangers.has(k):
				continue
			var w: Wanderer = Wanderer.new()
			w.info = want[k]
			w.role = str(labels.get(want[k]["kind"], ""))
			w.done = _dealt_keys.has(k)
			_world.add_child(w)
			_strangers[k] = w
	for list: Dictionary in [_regulars, _strangers]:
		for k: String in list:
			(list[k] as Wanderer).lift = lift


func _load_dealt() -> void:
	var r: Variant = await session.act("dealtToday", [])
	_dealt_keys = r if r is Array else []
	for k: String in _strangers:
		(_strangers[k] as Wanderer).done = _dealt_keys.has(k)


func _hail_wanderer(w: Wanderer) -> void:
	Rumble.tap(12)
	var key: String = w.info["key"]
	_hailing = key
	var p: TraderPanel = TraderPanel.new()
	p.session = session
	p.trader = w.info
	p.already_dealt = _dealt_keys.has(key)
	p.deals_left = int(Rules.data()["traders"]["dealsPerDay"]) - _dealt_keys.size()
	p.dealt.connect(func(k: String) -> void:
		if not _dealt_keys.has(k):
			_dealt_keys.append(k)
		if is_instance_valid(w):
			w.done = true)
	p.changed.connect(func() -> void: _hud.refresh())
	p.closed.connect(func() -> void: _hailing = "")
	_hud.hold_for(p)
	_hud_layer.add_child(p)


# ── The portal and the recall ──────────────────────────────────────────────────

## The well's rung and whether it is live (a stone opened, or a rung above the
## first: a built portal is never dead water).
func _portal_state() -> void:
	var t: Variant = session.profile().get("portal_tier")
	_portal.tier = 1 if t == null else int(Js.num(t))
	_portal.live = Portal.has_stone_for(1, session.save.get("discoveries", [])) or _portal.tier > 1
	_portal.refresh()


func _open_portal() -> void:
	Rumble.buzz([12, 50, 18])
	# Course and way both die here: stepping into something, not past it.
	_boat.velocity = Vector2.ZERO
	_boat.target = null
	var sh: PortalSheet = PortalSheet.new()
	sh.session = session
	sh.sail.connect(_warp)
	sh.built.connect(func() -> void:
		_portal_state()
		_hud.refresh())
	_hud.hold_for(sh)
	_hud_layer.add_child(sh)


## THE PASSAGE: the light comes up, she moves under it, it clears, and the
## water she lands in rings out from where she broke it. Portal and recall both.
func _warp(x: float, y: float, accent: Color) -> void:
	if _warping:
		return
	_warping = true
	_portal_armed = false
	Rumble.buzz([14, 60, 22, 60, 30])
	Sound.bell()
	var veil: ColorRect = ColorRect.new()
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	veil.color = Color(accent.lerp(Color.WHITE, 0.55), 0.0)
	veil.mouse_filter = Control.MOUSE_FILTER_STOP
	_room_layer.add_child(veil)
	var tw: Tween = create_tween()
	tw.tween_property(veil, "color:a", 1.0, 0.48).set_ease(Tween.EASE_IN)
	await tw.finished
	_boat.position = Vector2(x, y)
	_boat.velocity = Vector2.ZERO
	_boat.target = null
	_camera.position = Vector2(x, y * Chart.GROUND)
	_camera.reset_smoothing()
	var ring: Surfacing = Surfacing.new()
	ring.color = accent
	ring.position = Vector2(x, y)
	_world.add_child(ring)
	_trader_cell = ""
	var out: Tween = create_tween()
	out.tween_property(veil, "color:a", 0.0, 0.48).set_ease(Tween.EASE_OUT)
	await out.finished
	veil.queue_free()
	_warping = false
	_flush_position()


## The free recall home, once a sea day: the rules stamp it, then the passage.
func _press_recall() -> void:
	if _warping or _hud.busy():
		return
	var to: Dictionary = Portal.HOME_TO
	if _boat.position.distance_to(Vector2(float(to["x"]), float(to["y"]))) < 900.0:
		_hud.toast("You are already home")
		return
	var left: float = Portal.recall_left_ms(session.profile(), "fishing")
	if left > 0.0:
		_hud.toast("Recall ready in %dm" % int(ceil(left / 60000.0)))
		return
	var r: Variant = await session.act("spendRecall", ["fishing"])
	if r is Dictionary and r.get("ok", false):
		session.persist()
		_recall_t = 99.0
		_warp(float(to["x"]), float(to["y"]), Color(str(to["accent"])))
	elif r is Dictionary and r.get("readyAt") != null:
		_hud.toast("Recall ready in %dm" % maxi(1, int(ceil((Js.parse_ms(r["readyAt"]) - Clock.now_ms()) / 60000.0))))
	else:
		_hud.toast("The recall did not go through")


## Where she came up: light under the hull, then the swell running out.
class Surfacing:
	extends Node2D
	var color: Color = Color.WHITE
	var _t: float = 0.0

	func _process(delta: float) -> void:
		_t += delta
		if _t > 1.4:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var glow: float = clampf(1.0 - _t / 0.6, 0.0, 1.0)
		draw_circle(Vector2.ZERO, 120.0, Color(color, 0.35 * glow))
		for k: int in 2:
			var u: float = clampf((_t - 0.19 - k * 0.2) / 1.0, 0.0, 1.0)
			if u <= 0.0 or u >= 1.0:
				continue
			var e: float = 1.0 - pow(1.0 - u, 3.0)
			draw_arc(Vector2.ZERO, 60.0 + e * 340.0, 0.0, TAU, 96, Color(color.lightened(0.3), 0.6 * (1.0 - e)), 4.0, true)


func _hail(b: Buyer) -> void:
	Rumble.tap(12)
	var p: BuyerPanel = BuyerPanel.new()
	p.session = session
	p.info = b.info
	p.closed.connect(func() -> void: _dealt[b.info["zoneId"]] = true)
	p.sold.connect(func() -> void: _hud.refresh())
	_hud.hold_for(p)
	_hud_layer.add_child(p)


func _input(event: InputEvent) -> void:
	if not _music_started and (event is InputEventKey or event is InputEventMouseButton or event is InputEventJoypadButton) and event.is_pressed():
		_music_started = true


## THE WORLD CHART, over everything; the sea runs on under it (the autopilot
## keeps sailing).
var _chart: WorldMap


func _open_chart() -> void:
	if _chart != null or _hud.busy():
		return
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 30
	add_child(layer)
	_chart = WorldMap.new()
	_chart.sea = self
	_chart.closed.connect(func() -> void:
		_chart = null
		layer.queue_free())
	layer.add_child(_chart)


## THE LOCKER, over the sea with the camera pushed in on her; the HUD steps
## aside while it is up.
var _locker: Locker


func _open_locker(tab: String, slot: String) -> void:
	if _locker != null or _hud.busy() or _chart != null:
		return
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 25
	add_child(layer)
	_locker = Locker.new()
	_locker.sea = self
	_locker.hud = _hud
	_locker.tab = tab
	if slot != "":
		_locker.slot = slot
	_hud_layer.visible = false
	_locker.closed.connect(func() -> void:
		_locker = null
		_hud_layer.visible = true
		layer.queue_free())
	_hud.hold_for(_locker)
	layer.add_child(_locker)


## THE QUICK-SWAP WHEEL: bait and rods round her, while Q is held.
var _wheel: SwapWheel


func _open_wheel() -> void:
	if _wheel != null or _hud.busy() or _chart != null or not (_hud.phase == "idle" or _hud.phase == "result"):
		return
	var p: Dictionary = session.profile()
	var items: Array = []
	for b: Array in session.baits():
		var def: Dictionary = Rules.bait(b[0])
		items.append(["bait", b[0], "%s  ×%s" % [b[1], Js.thousands(float(b[2]))], Skipper.tex(def.get("imageUrl")), Color(str(def.get("color", "#5f9fb0"))), b[0] == _hud._bait])
	var worn: float = Js.num(p.get("rod_tier"))
	for t: Variant in [0.0] + session.store.held_rod_tiers(session.uid):
		var r: Dictionary = Rules.rod(float(t))
		items.append(["rod", float(t), r["name"], Skipper.tex("%s_thumb.png" % r.get("slug", "")), Color(0.7, 0.55, 0.35), float(t) == worn])
	if items.size() < 2:
		_hud.toast("Nothing to swap to yet")
		return
	_wheel = SwapWheel.new()
	_wheel.items = items
	_wheel.centre = _boat.get_global_transform_with_canvas().origin
	_wheel.picked.connect(func(kind: String, id: Variant) -> void:
		if kind == "bait":
			_hud.set_bait(str(id))
		else:
			var r: Dictionary = await session.act("equipTackleRod", [float(id)])
			session.persist()
			if r.get("error") != null:
				_hud.toast(str(r["error"]))
			_boat.set_look(Skipper.look_of(session.profile()))
			_hud.refresh()
		Rumble.tap(10)
		if _boat.field != null:
			_boat.field.ring(_boat.position, 120.0, 1.0, 0.5))
	_hud.hold_for(_wheel)
	_hud_layer.add_child(_wheel)


func _course_chip() -> void:
	if _hud == null:
		return
	if not _course.active():
		_hud.set_course({})
		return
	_hud.set_course({ "label": _course.label, "eta": Course.eta_text(_course.eta()), "autopilot": _course.autopilot })


## Holding the mouse down on the water: she keeps sailing toward the pointer
## (and on past it, so a held press never runs out under her).
var _holding: bool = false
var _held_t: float = 0.0


func _hold_steer() -> void:
	if not _holding:
		return
	if not Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) or _hud.busy():
		_holding = false
		# A held press let go: she eases to a stop where she is. (A quick
		# click keeps its destination.)
		if _held_t > 0.22:
			_boat.target = null
		_held_t = 0.0
		return
	_held_t += get_process_delta_time()
	if _held_t < 0.22:
		return
	var gp: Vector2 = get_global_mouse_position()
	var aim: Vector2 = Vector2(gp.x, gp.y / Chart.GROUND)
	var to: Vector2 = aim - _boat.position
	if to.length() < 220.0 and to.length() > 1.0:
		aim = _boat.position + to.normalized() * 220.0
	_boat.target = aim


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_released("swap") and _wheel != null:
		get_viewport().set_input_as_handled()
		_wheel.release()
		_wheel = null
		return
	if event.is_action_pressed("swap") and not event.is_echo():
		get_viewport().set_input_as_handled()
		_open_wheel()
		return
	if event.is_action_pressed("locker") and _locker == null and _chart == null:
		get_viewport().set_input_as_handled()
		_open_locker("loadout", "")
		return
	if event.is_action_pressed("chart") and _chart == null:
		get_viewport().set_input_as_handled()
		_open_chart()
		return
	# Zoom: the wheel, a trackpad pinch, or - and = on the keyboard.
	var zf: float = 1.0
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		var mb: InputEventMouseButton = event
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			zf = 1.12
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zf = 1.0 / 1.12
	elif event is InputEventMagnifyGesture:
		zf = (event as InputEventMagnifyGesture).factor
	elif event is InputEventKey and (event as InputEventKey).pressed:
		var k: Key = (event as InputEventKey).keycode
		if k == KEY_EQUAL or k == KEY_KP_ADD:
			zf = 1.12
		elif k == KEY_MINUS or k == KEY_KP_SUBTRACT:
			zf = 1.0 / 1.12
	if zf != 1.0:
		_zoom_to = clampf(_zoom_to * zf, ZOOM_MIN, ZOOM_MAX)
		Prefs.set_value("sea_zoom_2", _zoom_to)
		_hud.show_zoom(_zoom_to)
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		# While the line is out a click is for the dial (Reel In), never a
		# heading: it used to be kept, and she sailed off after the catch.
		if _hud.busy() or not (_hud.phase == "idle" or _hud.phase == "result"):
			return
		var gp: Vector2 = get_global_mouse_position()
		_boat.target = Vector2(gp.x, gp.y / Chart.GROUND)
		_course.helm_taken()
		_holding = true
		_held_t = 0.0


## The compass mark (SeaMap.tsx): while you are in a water and its buyer is
## off the screen, a "!" on the screen's edge in their direction.
class BuyerMark:
	extends Control
	## The buyer's offset from the screen's centre, in screen pixels, or null.
	var target: Variant = null

	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(_delta: float) -> void:
		queue_redraw()

	func _draw() -> void:
		if target == null:
			return
		var off: Vector2 = target
		var half: Vector2 = size / 2.0 - Vector2(48, 90)
		if absf(off.x) < half.x and absf(off.y) < half.y:
			return
		var k: float = minf(half.x / maxf(0.001, absf(off.x)), half.y / maxf(0.001, absf(off.y)))
		var at: Vector2 = size / 2.0 + off * k
		draw_circle(at, 17.0, Color(0.024, 0.047, 0.07, 0.86))
		draw_arc(at, 17.0, 0.0, TAU, 40, Color(1.0, 0.81, 0.54, 0.6), 1.5, true)
		var f: Font = UiTheme.title_font()
		draw_string(f, at + Vector2(-5, 8), "!", HORIZONTAL_ALIGNMENT_CENTER, 10, 22, Color("#ffd986"))


## Where each crewmate is when they are off the screen: a teal mark on the
## edge with their name, pointing their way.
class CrewMarks:
	extends Control
	## [name, offset from the screen's centre in pixels] per crewmate.
	var marks: Array = []

	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(_delta: float) -> void:
		queue_redraw()

	func _draw() -> void:
		var f: Font = UiTheme.title_font()
		for m: Array in marks:
			var off: Vector2 = m[1]
			var half: Vector2 = size / 2.0 - Vector2(70, 110)
			if absf(off.x) < half.x + 40.0 and absf(off.y) < half.y + 60.0:
				continue
			var k: float = minf(half.x / maxf(0.001, absf(off.x)), half.y / maxf(0.001, absf(off.y)))
			var at: Vector2 = size / 2.0 + off * k
			var dir: Vector2 = off.normalized()
			var tip: Vector2 = at + dir * 16.0
			var side: Vector2 = dir.orthogonal() * 8.0
			draw_colored_polygon(PackedVector2Array([tip, at + side, at - side]), Color("#5eead4"))
			var label: String = str(m[0])
			var w: float = f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
			var box: Rect2 = Rect2(at - dir * 26.0 - Vector2(w / 2.0 + 8.0, 11.0), Vector2(w + 16.0, 22.0))
			draw_rect(box, Color(0.024, 0.047, 0.07, 0.86))
			draw_rect(box, Color(0.37, 0.92, 0.83, 0.45), false, 1.0)
			draw_string(f, box.position + Vector2(8, 16), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#dff7f2"))
