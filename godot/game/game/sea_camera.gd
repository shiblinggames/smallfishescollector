extends RefCounted
## Part of Sea (game/sea.gd): THE CAMERA. Where the view sits over her (the
## lead under way, the fight's stage), how far in it is (the wheel zoom, a
## fight's own framing, a critical's punch), the water clearing for a fight,
## and the passage through the arch. The state (zoom, stage, punch, the eased
## values) stays on the Sea; these read and write it there.
## Split out of game/sea.gd on 2026-10-10 for size.


## THE CAMERA UNDER WAY (Kong, 2026-10-09): it leads the way she is sailing,
## up to LEAD of the screen at full speed, and settles dead centre at anchor,
## with the rod out or a panel up (fishing stays locked in); it draws back
## SAIL_OUT at full sail, and sits SHIP_OUT wider north of the arch for the
## bigger hulls. punch: a fight's critical, a small push in (BattleStage).
const LEAD: float = 0.09


## The view over her this frame: led ahead of her under way, set off to one
## side for a fight's stage, and the water cleared round a fight. Returns the
## world point the camera looks at (the lead included, not the stage).
static func follow(o: Sea, delta: float) -> Vector2:
	var cam_world: Vector2 = o._boat.position + cam_lead(o, delta)
	o._camera.position = Vector2(cam_world.x, cam_world.y * Chart.GROUND)
	if o.stage != null:
		o._stage_k = minf(1.0, o._stage_k + delta * 2.2)
	else:
		o._stage_k = maxf(0.0, o._stage_k - delta * 2.8)
	if o._stage_k > 0.0:
		var sk: float = o._stage_k * o._stage_k * (3.0 - 2.0 * o._stage_k)
		if o.stage != null:
			o._stage_last = o.stage
		# The fight's centre, at the fight's own framing (so a nudge of the
		# zoom keeps it centred).
		o._camera.position += (o._stage_last["shift"] as Vector2) / maxf(0.05, float(o._stage_last.get("zoom", o._camera.zoom.x))) * sk
	fight_clear(o)
	return cam_world


## The zoom this frame: the captain's (drawn back at full sail, wider on the
## ship, out in the arch) or the fight's, eased, with a critical's push on top.
static func zoom_step(o: Sea, delta: float) -> void:
	var zt: float = (o._zoom_to * (1.0 - 0.04 * o._sail_k) * (1.0 - 0.1 * o._ship_k) if o.stage == null else float(o.stage["zoom"]) * o.fight_zoom) * (1.0 - 0.1 * o._pass_k)
	# (Read back from the camera, less the last push, so a shot or a film that
	# snaps the zoom is followed from there.)
	o._zoom_base = lerpf(o._camera.zoom.x / (1.0 + o._punch_was), zt, 1.0 - exp(-delta * (12.0 if o.stage == null and o._stage_k <= 0.0 else 3.5)))
	# The critical's push in, on top of the eased zoom and a touch toward
	# the ship it struck.
	var z: float = o._zoom_base * (1.0 + o.punch)
	o._punch_was = o.punch
	o._camera.zoom = Vector2(z, z)
	if o.punch > 0.0:
		o._camera.position = o._camera.position.lerp(Vector2(o.punch_at.x, o.punch_at.y * Chart.GROUND), o.punch * 2.0)


## THE WATER CLEARS FOR A FIGHT: see Sea._fight_alpha.
static func fight_clear(o: Sea) -> void:
	var sk: float = o._stage_k * o._stage_k * (3.0 - 2.0 * o._stage_k)
	if sk <= 0.0 and o._fight_alpha.is_empty():
		return
	var keep: Array = [o._boat, o._wake, o._life, o._motes, o._xfog]
	keep += o._mates.values()
	for n: Node in o._world.get_children():
		if not (n is CanvasItem) or n in keep or n.has_meta("fight") or n.has_meta("ambient") or n is SeaFlow:
			continue
		var ci: CanvasItem = n
		var id: int = ci.get_instance_id()
		if not o._fight_alpha.has(id):
			o._fight_alpha[id] = 1.0 if (o._fight_snapped or ci is Wanderer) else ci.modulate.a
		ci.modulate.a = float(o._fight_alpha[id]) * (1.0 - sk)
	o._fight_snapped = true
	if sk <= 0.0:
		o._fight_alpha.clear()
		o._fight_snapped = false
		# The campaign's marks and islands as the fight left them.
		if o._campaign != null:
			o._campaign.refresh()


static func cam_lead(o: Sea, delta: float) -> Vector2:
	var vp: Vector2 = o.get_viewport_rect().size
	var v: Vector2 = o._boat.velocity
	var top: float = maxf(1.0, Boat.SPEED * o._boat.hull * o._boat.boat_speed)
	var way: float = clampf(v.length() / top, 0.0, 1.0)
	var sailing: bool = o.stage == null and not o._boat.hush and not o._boat.hold_still and v.length() > 20.0
	var to: Vector2 = Vector2.ZERO
	if sailing:
		var d: Vector2 = v.normalized()
		var z: float = maxf(0.05, o._camera.zoom.x)
		to = Vector2(d.x * vp.x, d.y * vp.y / Chart.GROUND) * LEAD / z * way
	# Quick enough to keep up with the helm (it trailed her by a second and
	# made sailing feel floaty).
	var k: float = 1.0 - exp(-delta * 3.2)
	o._lead = o._lead.lerp(to, k)
	o._sail_k = lerpf(o._sail_k, 1.0 if (sailing and o._boat.cue.get("full", false) == true) else 0.0, 1.0 - exp(-delta * 1.2))
	o._ship_k = lerpf(o._ship_k, 1.0 if o._boat.on_ship else 0.0, 1.0 - exp(-delta * 1.5))
	return o._lead


## THROUGH THE ARCH: see Sea._pass_k.
static func passage(o: Sea, delta: float) -> void:
	var p: Vector2 = o._boat.position
	var lane: float = 1.0 - smoothstep(North.GATE_HALF + 150.0, North.GATE_HALF + 650.0, absf(p.x - North.GATE_X))
	var dy: float = absf(p.y - (Explore.NORTH_WALL - 160.0))
	var near: float = (1.0 - smoothstep(150.0, 900.0, dy)) * lane
	o._pass_k = lerpf(o._pass_k, near, 1.0 - exp(-delta * 2.5))
	var under: float = (1.0 - smoothstep(60.0, 420.0, dy)) * lane
	Sound.muffle(under)
	if o._arch != null:
		# The span covers, on screen, the water from about 660 to 1,430 north
		# of its near foot (the picture stands 895 / Chart.GROUND tall).
		var foot: float = Explore.NORTH_WALL + 60.0
		var behind: float = smoothstep(560.0, 760.0, foot - p.y) * (1.0 - smoothstep(1330.0, 1530.0, foot - p.y))
		behind *= 1.0 - smoothstep(North.ARCH_WIDE * 0.4, North.ARCH_WIDE * 0.55, absf(p.x - North.GATE_X))
		o._arch.modulate.a = lerpf(o._arch.modulate.a, 1.0 - 0.55 * behind, 1.0 - exp(-delta * 6.0))


## Zoom by the wheel, a trackpad pinch, or - and = on the keyboard: the sea's
## own zoom, or in a fight a nudge on the fight's framing. True when the
## event was a zoom (and handled).
static func zoom_input(o: Sea, event: InputEvent) -> bool:
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
	if zf != 1.0 and o.stage != null:
		# In a fight: a nudge on the fight's own framing, kept for the next.
		o.fight_zoom = clampf(o.fight_zoom * zf, Sea.FIGHT_ZOOM_MIN, Sea.FIGHT_ZOOM_MAX)
		Prefs.set_value("fight_zoom", o.fight_zoom)
		o.get_viewport().set_input_as_handled()
		return true
	if zf != 1.0:
		o._zoom_to = clampf(o._zoom_to * zf, Sea.ZOOM_MIN, Sea.ZOOM_MAX)
		Prefs.set_value("sea_zoom_2", o._zoom_to)
		o._hud.show_zoom(o._zoom_to)
		o.get_viewport().set_input_as_handled()
		return true
	return false
