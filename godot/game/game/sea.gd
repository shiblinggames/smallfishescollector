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
var _water: ShaderMaterial
var _world: Node2D
var _boat: Boat
var _camera: Camera2D
var _night: CanvasModulate
var _town_light: PointLight2D
var _hud: FishingHud
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
	add_child(_world)

	var mainland: Sprite2D = Sprite2D.new()
	mainland.texture = load("res://art/sea/port-mainland.webp")
	var s: float = Chart.MAINLAND_R * 2.0 / float(mainland.texture.get_width())
	mainland.scale = Vector2(s, s / Chart.GROUND)
	_world.add_child(mainland)
	_town_light = PointLight2D.new()
	_town_light.texture = Glow.radial(256, Color(1.0, 0.8, 0.5), true)
	_town_light.texture_scale = 4.0
	_town_light.color = Color(1.0, 0.78, 0.5)
	_town_light.energy = 0.0
	_world.add_child(_town_light)

	_boat = Boat.new()
	var at: Variant = session.profile().get("sea_x")
	_boat.position = Vector2(Js.num(at), Js.num(session.profile().get("sea_y"))) if at != null else Chart.HOME
	_world.add_child(_boat)

	_night = CanvasModulate.new()
	add_child(_night)

	_camera = Camera2D.new()
	_camera.position_smoothing_enabled = false
	add_child(_camera)
	_camera.make_current()

	var hud_layer: CanvasLayer = CanvasLayer.new()
	hud_layer.layer = 10
	add_child(hud_layer)
	var sound: Sound = Sound.new()
	add_child(sound)
	_hud = FishingHud.new()
	_hud.session = session
	_hud.boat = _boat
	_hud.fishing_changed.connect(func(active: bool) -> void:
		_boat.locked = active
		_boat.set_pose("wait" if active else "rest"))
	hud_layer.add_child(_hud)


func _process(delta: float) -> void:
	var input: Vector2 = Input.get_vector("sail_left", "sail_right", "sail_up", "sail_down")
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
	_boat.lantern.energy = dark * 1.1
	_town_light.energy = dark * 1.4

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
			p["sea_x"] = round(_boat.position.x)
			p["sea_y"] = round(_boat.position.y)
			session.persist()


func _input(event: InputEvent) -> void:
	if not _music_started and (event is InputEventKey or event is InputEventMouseButton or event is InputEventJoypadButton) and event.is_pressed():
		_music_started = true


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var gp: Vector2 = get_global_mouse_position()
		_boat.target = Vector2(gp.x, gp.y / Chart.GROUND)
