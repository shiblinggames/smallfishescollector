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
var _night: CanvasModulate
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
	for info: Dictionary in Chart.residents():
		var b: Buyer = Buyer.new()
		b.info = info
		_world.add_child(b)
		_buyers.append(b)
	_town_light = PointLight2D.new()
	_town_light.texture = Glow.radial(256, Color(1.0, 0.8, 0.5), true)
	_town_light.texture_scale = 4.0
	_town_light.color = Color(1.0, 0.78, 0.5)
	_town_light.energy = 0.0
	_town_light.position = Vector2(-30, 120)
	_world.add_child(_town_light)

	_boat = Boat.new()
	var at: Variant = session.profile().get("sea_x")
	_boat.position = Vector2(Js.num(at), Js.num(session.profile().get("sea_y"))) if at != null else Chart.HOME
	_world.add_child(_boat)
	_boat.set_look(Skipper.look_of(session.profile()))
	_boat.set_fit(session.profile())
	session.changed.connect(func() -> void: _boat.set_fit(session.profile()))

	_night = CanvasModulate.new()
	add_child(_night)

	_camera = Camera2D.new()
	_camera.position_smoothing_enabled = false
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
	_boat.steer(input, delta)
	var cam_world: Vector2 = _boat.position
	_camera.position = Vector2(cam_world.x, cam_world.y * Chart.GROUND)

	var now: float = Clock.now_ms()
	var clock: Dictionary = SeaClock.at(now)
	var dark: float = clock["darkness"]
	var stops: Array[Color] = Chart.sea_at(cam_world, dark)
	var vp: Vector2 = get_viewport_rect().size
	_water.set_shader_parameter("u_cam", cam_world)
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
	_night.color = Color.WHITE.lerp(Color(0.42, 0.48, 0.66), dark)
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
	_reach(cam_world)
	_hotspots(delta, now)
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
	_save_t += delta
	if _save_t > 5.0 and _boat.velocity.length() < 5.0:
		_save_t = 0.0
		var p: Dictionary = session.profile()
		if Js.num(p.get("sea_x")) != round(_boat.position.x) or Js.num(p.get("sea_y")) != round(_boat.position.y):
			if session.remote != null:
				session.act("setSeaPos", [round(_boat.position.x), round(_boat.position.y)])
			else:
				p["sea_x"] = round(_boat.position.x)
				p["sea_y"] = round(_boat.position.y)
				session.persist()


## What is in reach of the boat: the berth first, then a buyer in hail range.
## The HUD shows it and presses it.
func _reach(at: Vector2) -> void:
	var w: Dictionary = Chart.water_at(at)
	var band_buyer: Buyer = null
	for b: Buyer in _buyers:
		if not w.is_empty() and b.info["zoneId"] == w["id"]:
			band_buyer = b
	var docked: Dictionary = Chart.berth_at(at)
	for bid: String in _berths:
		(_berths[bid] as Berth).inside = bid == docked.get("id")
	if not docked.is_empty():
		_hud.set_reach(Chart.dock_label(docked), _dock.bind(docked["id"]))
		_mark.target = null
		return
	for b: Buyer in _buyers:
		if b.near(at):
			_hud.set_reach(("Speak to %s" if _dealt.has(b.info["zoneId"]) else "Hail %s") % b.info["name"], _hail.bind(b))
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


func _draw_port(port: Dictionary) -> void:
	var c: Vector2 = Vector2(float(port["x"]), float(port["y"]))
	var r: float = float(port["r"])
	var d: float = r * 2.0
	var pl: Variant = port.get("plate")
	if pl != null:
		var plate: Sprite2D = Sprite2D.new()
		plate.texture = Skipper.tex(String((pl as Dictionary)["art"]))
		if plate.texture != null:
			var w: float = d * float(pl.get("width", 1.0))
			var sc: float = w / float(plate.texture.get_width())
			plate.scale = Vector2(sc, sc / Chart.GROUND)
			var h: float = plate.texture.get_height() * sc
			plate.position = c + Vector2(0, (0.5 - float(pl.get("water", 0.42))) * h / Chart.GROUND)
			plate.z_index = -2
			_world.add_child(plate)
	for bd: Dictionary in port["buildings"]:
		var b: Sprite2D = Sprite2D.new()
		b.texture = Skipper.tex(String(bd["art"]))
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
