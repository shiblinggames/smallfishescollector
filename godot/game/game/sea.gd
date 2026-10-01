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
var _life: SeaLife
var _sky: SeaSky
var _snd_heading: float = 0.0
## How far into a squall the view is, eased (dims the scene, roughs the hulls).
var _storm: float = 0.0
const BLOOMS: Array = [
	[8269.0, 3010.0, 1100.0], [-732.0, 8368.0, 1100.0], [-5500.0, 6900.0, 1000.0],
	[10739.0, 6200.0, 1400.0], [300.0, 14400.0, 1400.0], [-11085.0, 6400.0, 1400.0],
]
## THE WHEEL ZOOM (SeaMap.tsx): 0.55 to 1.6 of the chart's own scale, eased,
## and remembered on this machine (a number tuned on one screen is wrong on
## another, so it is not in the save).
const ZOOM_MIN: float = 0.55
const ZOOM_MAX: float = 1.6
var _zoom_to: float = 1.0
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
	_water.set_shader_parameter("u_field_on", 1.0)
	_boat = Boat.new()
	_boat.field = _field
	_boat.cast_landed.connect(_life.scatter)
	_boat.cue_changed.connect(func(c: Dictionary) -> void: _hud.set_cues(c))
	_boat.surged.connect(func() -> void:
		_field.ring(_boat.position, 130.0, 1.1, 0.7)
		Rumble.buzz([0, 16, 40, 22]))
	var at: Variant = session.profile().get("sea_x")
	_boat.position = Vector2(Js.num(at), Js.num(session.profile().get("sea_y"))) if at != null else Chart.HOME
	_world.add_child(_boat)
	_boat.set_look(Skipper.look_of(session.profile()))
	_boat.set_fit(session.profile())
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
	_zoom_to = clampf(float(Prefs.get_value("sea_zoom", 1.0)), ZOOM_MIN, ZOOM_MAX)
	_camera.zoom = Vector2(_zoom_to, _zoom_to)
	add_child(_camera)
	_camera.make_current()

	var hud_layer: CanvasLayer = CanvasLayer.new()
	hud_layer.layer = 10
	add_child(hud_layer)
	_hud_layer = hud_layer
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
	hud_layer.add_child(_hud)
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
	_boat.steer(input, delta)
	var cam_world: Vector2 = _boat.position
	_camera.position = Vector2(cam_world.x, cam_world.y * Chart.GROUND)

	var now: float = Clock.now_ms()
	var clock: Dictionary = SeaClock.at(now)
	var dark: float = clock["darkness"]
	var stops: Array[Color] = Chart.sea_at(cam_world, dark)
	var vp: Vector2 = get_viewport_rect().size
	_water.set_shader_parameter("u_cam", cam_world)
	var z: float = lerpf(_camera.zoom.x, _zoom_to, 1.0 - exp(-delta * 12.0))
	_camera.zoom = Vector2(z, z)
	_water.set_shader_parameter("u_zoom", _camera.zoom.x)
	_water.set_shader_parameter("u_res", vp)
	_water.set_shader_parameter("u_deep", stops[0])
	_water.set_shader_parameter("u_mid", stops[1])
	_water.set_shader_parameter("u_shallow", stops[2])
	_water.set_shader_parameter("u_dark", dark)
	_water.set_shader_parameter("u_warm", clock["warmth"])
	_water.set_shader_parameter("u_light", Vector2.from_angle(SeaClock.sun_angle(now)))
	_water.set_shader_parameter("u_rush", clampf(_boat.velocity.length() / Boat.MAX_SPEED, 0.0, 1.0) * 0.6)
	_water.set_shader_parameter("u_lantern", dark)

	# Night on the solid world: dim and cool it, and let the lights pool.
	# The world sits a little under full by day so the sun has room to model
	# it: lit faces come up to full, the far sides stay soft.
	_night.color = Color(0.88, 0.88, 0.88).lerp(Color(0.40, 0.46, 0.64), dark)
	# Under a squall the light goes grey; a strike lights it all.
	_night.color = _night.color.lerp(Color(0.6, 0.64, 0.7), _storm * 0.55).lerp(Color(1.0, 1.0, 1.0), _squall.flash * 0.6)
	var warm: float = float(clock["warmth"])
	var toward: Vector2 = Vector2.from_angle(SeaClock.sun_angle(now))
	_sun.rotation = (-toward).angle() - PI / 2.0
	_sun.height = lerpf(0.72, 0.22, warm)
	var sun_col: Color = Color(1.0, 0.97, 0.9).lerp(Color(1.0, 0.62, 0.32), warm)
	_sun.color = sun_col.lerp(Color(0.55, 0.66, 1.0), dark)
	_sun.energy = lerpf(0.22 + 0.12 * warm, 0.16, dark)
	_grade(delta, cam_world, dark)
	_boat.lantern.energy = dark * 1.1 * (0.5 + 0.5 * _boat.lantern_glow)
	_town_light.energy = dark * 1.4
	# Light and lettering are not dimmed by the night: undo it for them.
	var lift: Color = Color(1.0 / _night.color.r, 1.0 / _night.color.g, 1.0 / _night.color.b)
	for bid: String in _berths:
		var bt: Berth = _berths[bid]
		bt.darkness = dark
		bt.modulate = lift
	for b: Buyer in _buyers:
		b.lift = lift
	_wanderers(now, clock, lift)
	_night_water(dark, cam_world)
	var half: Vector2 = Vector2(vp.x / 2.0 / _camera.zoom.x, vp.y / 2.0 / _camera.zoom.x / Chart.GROUND)
	_life.step(delta, cam_world, half, _boat.position, _boat.velocity.length(), dark, clock["warmth"], now)
	_sky.step(delta, cam_world, _camera.zoom.x, vp, dark, clock["warmth"], stops[2])
	_weather(delta, now, cam_world)
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
	_hud.set_clock(SeaClock.PHASE_LABEL[clock["phase"]])
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
	if _save_t > 5.0 and (_boat.velocity.length() < 5.0 or not _fog_new.is_empty()):
		_save_t = 0.0
		var p: Dictionary = session.profile()
		if not _fog_new.is_empty() or Js.num(p.get("sea_x")) != round(_boat.position.x) or Js.num(p.get("sea_y")) != round(_boat.position.y):
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
		var found: Variant = _find_in_reach(at)
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
	add_lamp.call(_boat.position + keel, 16.0 + 18.0 * _boat.lantern_glow, 0.30 + 0.25 * _boat.lantern_glow, Color(1.0, 0.72, 0.4))
	add_lamp.call(_town_light.position + Vector2(0, 260), 46.0, 0.45, Color(1.0, 0.74, 0.45))
	for bid: String in _berths:
		add_lamp.call((_berths[bid] as Berth).position, 14.0, 0.16, Color(1.0, 0.8, 0.5))
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
		if blooms.size() < 4 and Vector2(float(b[0]), float(b[1])).distance_to(at) < float(b[2]) + 2600.0:
			blooms.append(Vector4(b[0], b[1], b[2], 1.0))
	while blooms.size() < 4:
		blooms.append(Vector4(0, 0, 0, 0))
	_water.set_shader_parameter("u_blooms", blooms)


## The squalls: on the water, in the air, under the hulls.
func _weather(delta: float, now: float, at: Vector2) -> void:
	var storms: Array[Vector4] = []
	var power: float = 0.0
	for s: Dictionary in Weather.squalls(now):
		var p: Vector2 = Weather.pos(s, now)
		storms.append(Vector4(p.x, p.y, float(s["r"]), float(s["power"])))
		if p.distance_to(at) < float(s["r"]):
			power = maxf(power, float(s["power"]))
	while storms.size() < 2:
		storms.append(Vector4(0, 0, 0, 0))
	_water.set_shader_parameter("u_storms", storms)
	var deep: float = Weather.deep_at(at.x, at.y, now)
	_storm = lerpf(_storm, deep, 1.0 - exp(-delta * 0.55))
	_squall.step(delta, deep, power, get_viewport_rect().size)
	_water.set_shader_parameter("u_flash", _squall.flash)
	_boat.storm = _storm
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
	await session.act("saveSeaPosition", [round(_boat.position.x), round(_boat.position.y), seen])
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
		# Something on the bottom: bubbles breaking the surface over it, more
		# of them and stronger the closer she is.
		if h.strength > 0.0:
			h.bubble_t -= delta
			if h.bubble_t <= 0.0:
				h.bubble_t = randf_range(0.35, 1.1) / (0.4 + h.strength)
				var off: Vector2 = Vector2(randf_range(-55.0, 55.0), randf_range(-35.0, 35.0))
				_field.ring(h.position + off, randf_range(26.0, 58.0), 1.2, 0.25 + 0.4 * h.strength)
	_bottle_t += delta
	var win: int = Explore.bottle_window(now)
	if _bottle_t > 10.0 or win != _bottle_win:
		_bottle_t = 0.0
		_bottle_win = win
		var want: Dictionary = {}
		for b: Dictionary in Explore.bottles_around(at.x, at.y, 5200.0, now):
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
	var isle: Dictionary = Explore.isle_near(at.x, at.y)
	if not isle.is_empty():
		var been: bool = Js.includes(session.save.get("discoveries", []), isle["id"])
		return [("Look again at %s" if been else "Go ashore at %s") % isle["name"], _land.bind(isle)]
	var site: Dictionary = Explore.dig_at(at.x, at.y)
	if not site.is_empty() and not _dug(site["id"]):
		return ["Drop the grapple", _dig.bind(site)]
	for k: String in _bottles:
		var bn: SeaFinds.BottleNode = _bottles[k]
		if at.distance_to(bn.position) < Explore.BOTTLE_REACH:
			return ["Take the bottle", _bottle.bind(bn.bottle)]
	return null


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
	_taken[b["key"]] = true
	if _bottles.has(b["key"]):
		(_bottles[b["key"]] as Node).queue_free()
		_bottles.erase(b["key"])
	if not r is Dictionary or not (r as Dictionary).get("ok", false):
		_hud.toast(str((r as Dictionary).get("error", "It slipped out of your hands. Try that one again.")) if r is Dictionary else "It slipped out of your hands. Try that one again.")
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
		_:
			Rumble.tap(10)
			_hud.toast("%s is not built yet in this build." % Chart.port(id).get("name", "That port"))


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


func _unhandled_input(event: InputEvent) -> void:
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
		Prefs.set_value("sea_zoom", _zoom_to)
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var gp: Vector2 = get_global_mouse_position()
		_boat.target = Vector2(gp.x, gp.y / Chart.GROUND)


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
