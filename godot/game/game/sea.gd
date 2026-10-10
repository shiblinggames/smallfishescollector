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
##
## This file builds the scene, drives it each frame, holds every piece of the
## sea's state, and takes the input. Its systems live in parts beside it
## (split out 2026-10-10 for size), each a set of static functions taking the
## Sea: game/sea_camera.gd (the view, the zoom, the fight's stage, the arch),
## game/sea_atmos.gd (light, grade, weather, the chapters' seas),
## game/sea_hunts.gd (isles, digs, bottles, treasure hunts),
## game/sea_ports.gd (ports, docking, rooms, the north, the Sea Gate),
## game/sea_battles.gd (raids, dives, campaign nodes), game/sea_folk.gd
## (regulars, traders, buyers, Finn, the crew) and game/sea_portal.gd (the
## portal, the passage, the recall). What other files call stays here, as
## one-line forwarders where the work moved.

const SeaCamera = preload("res://game/sea_camera.gd")
const SeaAtmos = preload("res://game/sea_atmos.gd")
const SeaHunts = preload("res://game/sea_hunts.gd")
const SeaPorts = preload("res://game/sea_ports.gd")
const SeaBattles = preload("res://game/sea_battles.gd")
const SeaFolk = preload("res://game/sea_folk.gd")
const SeaPortal = preload("res://game/sea_portal.gd")

## Leaving the sea: back to the captains (or out of the Charter).
signal left
## The HUD's settings button: the Esc menu (Main opens it).
signal menu_wanted

## THE WHEEL ZOOM (SeaMap.tsx): 0.35 to 1.6 of the chart's own scale, eased,
## and remembered on this machine (a number tuned on one screen is wrong on
## another, so it is not in the save; "sea_zoom_2", since the default moved).
const ZOOM_MIN: float = 0.35
## The sea's own zoom, shown as 100% (Kong, 2026-10-02: what read 63% is the
## default; the old 100%, 0.87, was too close).
const ZOOM_DEFAULT: float = 0.55
const ZOOM_MAX: float = 1.6
## A FIGHT'S ZOOM, NUDGED (Kong, 2026-10-09): the wheel (or - and =) in a fight
## scales the fight's own framing within these, remembered for the next fight.
const FIGHT_ZOOM_MIN: float = 0.7
const FIGHT_ZOOM_MAX: float = 1.45

var session: Session
## In a Charter, the crew's line (null when sailing alone), and the crewmates'
## ships on this sea by their key.
var net: CrewNet = null
## A gauntlet's water while its fights run: { sea: [deep, mid, shallow],
## light: the world's light, dim: how far down toward black }. Empty: the sea's own.
var water_theme: Dictionary = {}
var _theme_k: float = 0.0
var _theme_last: Dictionary = {}
var _mates: Dictionary = {}
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
var _wfx: WeatherFx
var _course: Course
var _compass: CompassRibbon
var _pings: CrewPings = null
## What this captain is doing, for the crew (their name plate, their compass
## mark): worked out once a second and sent with the boat.
var _status: String = ""
var _status_t: float = 0.0
var _input_ms: int = 0
var _course_t: float = 0.0
var _life: SeaLife
var _sky: SeaSky
var _snd_heading: float = 0.0
## How far into a squall the view is, eased (dims the scene, roughs the hulls).
var _storm: float = 0.0
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
## The grade (SeaAtmos.GRADES).
var _env: Environment
var _town_light: PointLight2D
var _hud: FishingHud
var _hud_layer: CanvasLayer
var _room_layer: CanvasLayer
## Each port's berth, by id.
var _berths: Dictionary = {}
var _buyers: Array[Buyer] = []
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
## THE NORTHERN CHAPTERS' OWN SEAS (ChapterLook): how far into a bay's water
## the camera is (eased, and set aside while a dive has its own water), and
## its haze, dark and drifting things (a DeepAtmos of its own).
var _ch_k: float = 0.0
var _ch_look: Dictionary = {}
var _ch_atmos: DeepAtmos = null
## The shores the sea's sound listens for (the ports and the isles), joined
## once: neither moves.
var _shores: Array = []
var _chart_fx: ChartGainFx
## FINN (The Long Cast): his state read off the save each second (a pure
## read of the local copy, so a crewmate's Charter never sends it), the mark
## over him, the story line and the arrow to him.
var _finn: FinnHull
var _finn_st: Dictionary = {}
var _finn_t: float = 99.0
var _finn_ring: float = 0.0
## THROUGH THE ARCH (Kong, 2026-10-02: make the crossing feel great), by
## where she is, not by a timer, so turning back runs it backward: the view
## eases out as she enters the passage (the stone's scale), and under the span
## the music closes in to a muffle and opens again beyond.
var _pass_k: float = 0.0
## THE WATER CLEARS FOR A FIGHT (Kong, 2026-10-09: other ships, NPCs, home
## portals, islands and the campaign's marks behind a fight were "weird"): while
## a fight has the stage, everything on the water fades out with the cut but
## the fight itself (her ship, the line's, the enemy, the battle's effects:
## meta "fight") and the sea's own life (the wake, the ripples, weather, fog,
## the sky: meta "ambient"), and comes back as it ends at the alpha it had.
var _fight_alpha: Dictionary = {}
## Set once the first pass of a fight has taken its snapshot. A node first seen
## after that (a stranger spawned mid-fight, still at its fade-in's 0) or a
## Wanderer (they own their fade tweens) comes back at full, not at the
## near-0 alpha it happened to have when it was first seen.
var _fight_snapped: bool = false
## THE CAMERA UNDER WAY (SeaCamera.LEAD): the lead eased, how far into full
## sail and onto the ship. punch: a fight's critical, a small push in
## (BattleStage), toward punch_at.
var _lead: Vector2 = Vector2.ZERO
var _sail_k: float = 0.0
var _ship_k: float = 0.0
var punch: float = 0.0
var fight_zoom: float = 1.0
var punch_at: Vector2 = Vector2.ZERO
var _zoom_base: float = 1.0
var _punch_was: float = 0.0
## The arch's picture: thinned while she is behind its span, so the stone
## never hides her (she shows through it).
var _arch: Sprite2D
## The Sea Gate's name on the water (lifted out of the night each frame).
var _gate_sign: Label = null
var _gate_note_t: float = -99.0
var _sided: bool = false
var _crew_key: String = ""
var _bay_note_t: float = -99.0
var _home_house: Sprite2D
var _solo_dive: GauntletTable = null
## THE WORLD CHART, over everything; the sea runs on under it (the autopilot
## keeps sailing).
var _chart: WorldMap
## THE LOCKER, over the sea with the camera pushed in on her; the HUD steps
## aside while it is up.
var _locker: Locker
## THE QUICK-SWAP WHEEL: bait and rods round her, while Q is held.
var _wheel: SwapWheel
## Holding the mouse down on the water: she keeps sailing toward the pointer
## (and on past it, so a held press never runs out under her).
var _holding: bool = false
var _held_t: float = 0.0


func _ready() -> void:
	SteamLayer.presence_home()
	# Every badge this captain holds, on Steam too (Steam skips those set).
	SteamLayer.achieve(Js.list(session.profile().get("unlocked_badges")))
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
		SeaPorts.draw_port(self, port)
	SeaPorts.draw_north(self)
	SeaHunts.build(self)
	_fog = Explore.fog_decode(session.profile().get("sea_explored"))
	for info: Dictionary in Chart.residents():
		var b: Buyer = Buyer.new()
		b.info = info
		_world.add_child(b)
		_buyers.append(b)
	_moor_regulars()
	SeaFolk.build_finn(self)
	_portal = PortalWell.new()
	_world.add_child(_portal)
	_portal_state()
	_town_light = PointLight2D.new()
	_town_light.texture = Glow.radial(256, Kit.LAMP, true)
	_town_light.texture_scale = 4.0
	_town_light.color = Kit.LAMP
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
	# The weather on the water: rings, wind, curtains, bolts (WeatherFx).
	_wfx = WeatherFx.new()
	_wfx.sea = self
	add_child(_wfx)
	_squall.struck.connect(_wfx.strike)
	for port: Dictionary in Chart.ports():
		_sound.add_surf(_world, Vector2(float(port["x"]), float(port["y"])), float(port["r"]))
	for i: Dictionary in Rules.data()["isles"]:
		_sound.add_surf(_world, Vector2(float(i["x"]), float(i["y"])), float(i["r"]))
	_motes = SeaAtmos.mote_layer()
	_world.add_child(_motes)
	_field = SeaField.new()
	add_child(_field)
	_field.share_wake(_wake)
	_water.set_shader_parameter("u_field", _field.texture())
	_water.set_shader_parameter("u_under", _field.under.get_texture())
	_water.set_shader_parameter("u_flow", _field.flow.get_texture())
	_water.set_shader_parameter("u_flow_on", 1.0)
	_life.sink_fish(_field.under_world)
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
	_xfog.lifted.connect(_on_charted)
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

	SeaAtmos.build(self)

	_camera = Camera2D.new()
	_camera.position_smoothing_enabled = false
	_zoom_to = clampf(float(Prefs.get_value("sea_zoom_2", ZOOM_DEFAULT)), ZOOM_MIN, ZOOM_MAX)
	fight_zoom = clampf(float(Prefs.get_value("fight_zoom", 1.0)), FIGHT_ZOOM_MIN, FIGHT_ZOOM_MAX)
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
	# A Charter's dives: the crew line's gauntlet table.
	if net != null and net.gauntlets != null:
		var gm: GauntletMuster = GauntletMuster.new()
		gm.sea = self
		gm.table = net.gauntlets
		gm.my_key = net.key
		hud_layer.add_child(gm)
	_room_layer = CanvasLayer.new()
	_room_layer.layer = 20
	add_child(_room_layer)
	# The edge marks (a "!" disc for the buyer, boxed crew names) gave way
	# to the compass ribbon (game/compass_ribbon.gd), and are gone.
	var sound: Sound = Sound.new()
	add_child(sound)
	_hud = FishingHud.new()
	_hud.session = session
	_hud.boat = _boat
	_hud.fishing_changed.connect(func(active: bool) -> void:
		_boat.locked = active
		_boat.set_pose("wait" if active else "rest"))
	_hud.menu_pressed.connect(func() -> void: menu_wanted.emit())
	_hud.recall_pressed.connect(_press_recall)
	_course.hud = _hud
	_hud.chart_pressed.connect(_open_chart)
	_hud.locker_wanted.connect(_open_locker)
	_hud.expedition_wanted.connect(_open_expedition)
	_hud.course_autopilot.connect(_course.toggle_autopilot)
	_hud.course_clear.connect(_course.clear)
	hud_layer.add_child(_hud)
	_chart_fx = ChartGainFx.new()
	hud_layer.add_child(_chart_fx)
	# THE COMPASS: a heading ribbon under the level bar.
	_compass = CompassRibbon.new()
	_compass.sea = self
	FishingHud._place(_compass, Vector2(0.5, 0.0), Vector2(-CompassRibbon.W / 2.0 - 60.0, 56), Vector2(CompassRibbon.W + 120.0, 100))
	hud_layer.add_child(_compass)
	if net != null:
		SeaFolk.join_crew(self)


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
	var cam_world: Vector2 = SeaCamera.follow(self, delta)

	var now: float = Clock.now_ms()
	var clock: Dictionary = SeaClock.at(now)
	var dark: float = clock["darkness"]
	var stops: Array[Color] = Chart.sea_at(cam_world, dark)
	SeaAtmos.chapter(self, delta, cam_world)
	SeaAtmos.theme(self, delta, stops)
	var vp: Vector2 = get_viewport_rect().size
	_water.set_shader_parameter("u_cam", cam_world)
	SeaCamera.zoom_step(self, delta)
	_water.set_shader_parameter("u_zoom", _camera.zoom.x)
	_water.set_shader_parameter("u_res", vp)
	_water.set_shader_parameter("u_deep", stops[0])
	_water.set_shader_parameter("u_mid", stops[1])
	_water.set_shader_parameter("u_shallow", stops[2])
	var lit: Dictionary = SeaAtmos.light(self, delta, now, clock, cam_world)
	var sky: Dictionary = lit["sky"]
	var warm: float = lit["warm"]
	var lift: Color = lit["lift"]
	for b: Buyer in _buyers:
		b.lift = lift
	SeaFolk.wanderers(self, now, clock, lift)
	SeaAtmos.night_water(self, dark, cam_world)
	var half: Vector2 = Vector2(vp.x / 2.0 / _camera.zoom.x, vp.y / 2.0 / _camera.zoom.x / Chart.GROUND)
	_life.step(delta, cam_world, half, _boat.position, _boat.velocity.length(), dark, clock["warmth"], now)
	_sky.step(delta, cam_world, _camera.zoom.x, vp, dark, warm, stops[2])
	_weather(delta, now, cam_world, dark)
	SeaPorts.ship_side(self)
	SeaCamera.passage(self, delta)
	SeaFolk.finn_tick(self, delta)
	SeaAtmos.feed_berths(self, cam_world)
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
		contacts.append(m.wake_contact("mate:" + k))
	_wake.lay(contacts)
	var speeds: Dictionary = {}
	for id: String in _wake._seen:
		speeds[id] = (_wake._seen[id] as Dictionary)["speed"]
	speeds["me"] = _boat.velocity.length()
	_field.step(delta, _camera.position, _camera.zoom.x, get_viewport_rect().size, contacts, speeds)
	_water.set_shader_parameter("u_field_px", Vector2(1.0, 1.0) / Vector2(_field.viewport.size))
	_portal.lift = lift
	_campaign.lift = lift
	if is_instance_valid(_gate_sign):
		_gate_sign.modulate = lift
	_recall_t += delta
	if _recall_t > 1.0:
		_recall_t = 0.0
		_hud.set_recall(Portal.recall_left_ms(session.profile(), "fishing"))
		SeaPorts.crew_morning(self, now)
		var in_water: Dictionary = Chart.water_at(_boat.position)
		_hud.set_stir(FishBias.stirring(session.save.get("species", []), str(in_water.get("id", "")), _boat.position, now) if not in_water.is_empty() else "")
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
		_status_t += delta
		if _status_t > 1.0:
			_status_t = 0.0
			_status = _status_text()
		net.send_boat(delta, { "x": _boat.position.x, "y": _boat.position.y, "vx": _boat.velocity.x, "vy": _boat.velocity.y, "pose": _boat.skipper.frame, "facing": _boat.facing(), "do": _status })
		for k: String in _mates:
			(_mates[k] as Shipmate).lift = lift

	# The water she is IN (her hull, not the camera's lead ahead of her): the
	# cast fishes this band, so it must be the one under her.
	_hud.set_water(Chart.water_at(_boat.position))
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
	var docked: Dictionary = Chart.berth_at(at)
	if docked.is_empty():
		var found: Variant = _campaign.reach(at) if at.y < Explore.NORTH_WALL else null
		if found == null:
			found = SeaHunts.find_in_reach(self, at)
		if found != null:
			_hud.set_reach(found[0], found[1])
			return
	for bid: String in _berths:
		(_berths[bid] as Berth).inside = bid == docked.get("id")
	if not docked.is_empty():
		_hud.set_reach(Chart.dock_label(docked), _dock.bind(docked["id"]))
		return
	# The portal's mouth: it offers, once you have been out of it since the
	# last passage, and never takes you by itself.
	var in_mouth: bool = Portal.inside(at.x, at.y)
	if not in_mouth:
		_portal_armed = true
	_portal.gather = in_mouth
	if in_mouth and _portal_armed and not _warping:
		_hud.set_reach("Step through the portal", _open_portal)
		return
	for b: Buyer in _buyers:
		if b.near(at):
			_hud.set_reach(("Speak to %s" if _dealt.has(b.info["zoneId"]) else "Hail %s") % b.info["name"], _hail.bind(b))
			return
	if _finn != null and _finn.near(at):
		var ready: bool = _finn_st.get("questReady", false)
		_hud.set_reach("Hand the job to Finn" if ready else "Talk to Finn", _open_finn)
		return
	for list: Dictionary in [_regulars, _strangers]:
		for k: String in list:
			var wn: Wanderer = list[k]
			if wn.near(at):
				_hud.set_reach(("Speak to %s" if _dealt_keys.has(k) else "Hail %s") % wn.info["name"], _hail_wanderer.bind(wn))
				return
	_hud.set_reach("", Callable())


## A panel over the sea on the given layer, holding the HUD while it is up
## (FishingHud.hold_for): the one way every sea panel is opened.
func _hold(c: Control, layer: CanvasLayer) -> void:
	_hud.hold_for(c)
	layer.add_child(c)


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


## The northern fog lifting for the first time: what it pays rises off that
## water as a small word, and the Navigation bar fills as the rules pay it on
## the save it brings forward (Kong, 2026-10-06: a flight for every patch would
## be too much; small +XP and the bar filling are enough).
func _on_charted(cells: Array) -> void:
	if Rules.web_only or _chart_fx == null:
		return
	var xp: float = 0.0
	var c: Vector2 = Vector2.ZERO
	var n: int = 0
	for i: Variant in cells:
		var r: float = Charting.rate(int(i))
		if r > 0.0:
			xp += r
			c += Explore.xfog_centre(int(i))
			n += 1
	if n == 0:
		return
	var at: Vector2 = _world.get_global_transform_with_canvas() * (c / float(n))
	_chart_fx.word(at, Charting.words(xp))
	# Saved (and paid) in a moment, so the bar fills right after.
	_save_t = maxf(_save_t, 4.4)


## Where the boat is and what it has seen, saved (before any claim, too: the
## rules check the saved position).
func _flush_position() -> void:
	var seen: Array = _fog_new.duplicate()
	_fog_new.clear()
	var seen_exp: Array = _xfog.fresh.duplicate() if _xfog != null else []
	if _xfog != null:
		_xfog.fresh.clear()
	var r: Variant = await session.act("saveSeaPosition", [round(_boat.position.x), round(_boat.position.y), seen, seen_exp])
	session.persist()
	# Charting paid (core/charting.gd): the bar settles to it; a bay charted
	# whole is a moment of its own.
	if r is Dictionary and Js.num((r as Dictionary).get("charted")) > 0.0:
		for d: Dictionary in Js.list((r as Dictionary).get("chartedDone")):
			var mid: Vector2 = get_viewport_rect().size / 2.0
			_hud.side_banner(str(d["name"]), "Charted whole  ·  +%s Nav XP" % Js.thousands(float(d["bonus"])))
			_hud.nav_gain(float(d["bonus"]), mid, 3.0)
			_chart_fx.word(mid + Vector2(0, 40), Charting.words(float(d["bonus"])), true)
			Sound.bell()
		_hud.refresh()


## A find's panel (SeaFinds.panel, already on the room layer): the HUD held
## while it is up.
func _show_find(p: Control) -> void:
	_hud.hold_for(p)


# ── The crew ───────────────────────────────────────────────────────────────────

func _on_mate_boat(k: String, st: Dictionary) -> void:
	if k == net.key:
		return
	_mate(k).state(st)


func _send_look() -> void:
	if net != null:
		_last_look = Skipper.look_of(session.profile())
		net.send_look(Skipper.look_of(session.profile()), session.captain_name())


# ── Forwarders to the parts (called from other files, or bound as Callables) ──

func _status_text() -> String:
	return SeaFolk.status_text(self)


func _mate(k: String) -> Shipmate:
	return SeaFolk.mate(self, k)


func _on_mate_look(k: String, mate_name: String, look: Dictionary) -> void:
	SeaFolk.on_mate_look(self, k, mate_name, look)


func _on_proposed(n: int, by: String, text: String) -> void:
	SeaFolk.on_proposed(self, n, by, text)


func _moor_regulars() -> void:
	SeaFolk.moor_regulars(self)


func _hail_wanderer(w: Wanderer) -> void:
	SeaFolk.hail_wanderer(self, w)


func _hail(b: Buyer) -> void:
	SeaFolk.hail(self, b)


func _open_finn() -> void:
	SeaFolk.open_finn(self)


func _weather(delta: float, now: float, at: Vector2, dark: float) -> void:
	SeaAtmos.weather(self, delta, now, at, dark)


func _finds(delta: float, now: float, lift: Color) -> void:
	SeaHunts.finds(self, delta, now, lift)


func _dug(site_id: String) -> bool:
	return SeaHunts.dug(self, site_id)


func _clue_search(tier: String) -> void:
	await SeaHunts.clue_search(self, tier)


func _land(isle: Dictionary) -> void:
	await SeaHunts.land(self, isle)


func _dig(site: Dictionary) -> void:
	await SeaHunts.dig(self, site)


func _bottle(b: Dictionary) -> void:
	await SeaHunts.bottle(self, b)


func refresh_home() -> void:
	SeaPorts.refresh_home(self)


func _dock(id: String) -> void:
	SeaPorts.dock(self, id)


func _go_ashore() -> void:
	SeaPorts.go_ashore(self)


func _enter_room(door: String) -> void:
	SeaPorts.enter_room(self, door)


func _open_expedition(what: String) -> void:
	SeaPorts.open_expedition(self, what)


func _held_at_gate() -> void:
	SeaPorts.held_at_gate(self)


func _held_at_bay(line: String) -> void:
	SeaPorts.held_at_bay(self, line)


func _open_sea_gate() -> void:
	SeaPorts.open_sea_gate(self)


func open_node(id: String) -> void:
	SeaBattles.open_node(self, id)


func celebrate_chapter() -> void:
	SeaBattles.celebrate_chapter(self)


func start_battle(raid_id: String, node_id: String = "") -> void:
	await SeaBattles.start_battle(self, raid_id, node_id)


## Into the fight, alone.
func _launch(raid_id: String, node_id: String) -> void:
	SeaBattles.raid_stage(self, raid_id, node_id, false, "")


## The line has formed for a Charter's raid this captain is in: to the fight.
func open_coop_battle(table_state: Dictionary, my_key: String) -> void:
	var node_id: String = str(table_state.get("nodeId", ""))
	SeaBattles.raid_stage(self, str(table_state["raidId"]), node_id, true, my_key)


func open_gauntlet(variant: String) -> void:
	await SeaBattles.open_gauntlet(self, variant)


func open_gauntlet_battle(t: GauntletTable, my_key: String, variant: String) -> void:
	SeaBattles.open_gauntlet_battle(self, t, my_key, variant)


func raids_shared() -> bool:
	return SeaBattles.raids_shared(self)


func _portal_state() -> void:
	SeaPortal.portal_state(self)


func _open_portal() -> void:
	SeaPortal.open_portal(self)


func _warp(x: float, y: float, accent: Color) -> void:
	await SeaPortal.warp(self, x, y, accent)


func _press_recall() -> void:
	await SeaPortal.press_recall(self)


func warp_to_gunwharf() -> void:
	SeaPortal.warp_to_gunwharf(self)


# ── Input, the chart, the Locker and the wheel ─────────────────────────────────

func _input(event: InputEvent) -> void:
	# Anything pressed: not away (the crew's status).
	if (event is InputEventKey or event is InputEventMouseButton or event is InputEventJoypadButton) and event.is_pressed():
		_input_ms = Time.get_ticks_msec()
	if not _music_started and (event is InputEventKey or event is InputEventMouseButton or event is InputEventJoypadButton) and event.is_pressed():
		_music_started = true


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
	_hold(_locker, layer)


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
	_hold(_wheel, _hud_layer)


func _course_chip() -> void:
	if _hud == null:
		return
	if not _course.active():
		_hud.set_course({})
		return
	_hud.set_course({ "label": _course.label, "eta": Course.eta_text(_course.eta()), "autopilot": _course.autopilot })


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
	if SeaCamera.zoom_input(self, event):
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
