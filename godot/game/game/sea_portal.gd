extends RefCounted
## Part of Sea (game/sea.gd): THE PORTAL AND THE RECALL. The Homestead
## Portal's well (its rung, whether it is live, its sheet), the passage that
## carries her (portal, recall and the way back to the Gunwharf all use it),
## and the free recall home. The state (the well, whether a passage is under
## way) stays on the Sea.
## Split out of game/sea.gd on 2026-10-10 for size.


## The well's rung and whether it is live (a stone opened, or a rung above the
## first: a built portal is never dead water).
static func portal_state(o: Sea) -> void:
	var t: Variant = o.session.profile().get("portal_tier")
	o._portal.tier = 1 if t == null else int(Js.num(t))
	o._portal.live = Portal.has_stone_for(1, o.session.save.get("discoveries", [])) or o._portal.tier > 1
	o._portal.refresh()


static func open_portal(o: Sea) -> void:
	Rumble.buzz([12, 50, 18])
	# Course and way both die here: stepping into something, not past it.
	o._boat.velocity = Vector2.ZERO
	o._boat.target = null
	var sh: PortalSheet = PortalSheet.new()
	sh.session = o.session
	sh.sail.connect(o._warp)
	sh.built.connect(func() -> void:
		portal_state(o)
		o._hud.refresh())
	o._hold(sh, o._hud_layer)


## THE PASSAGE: the light comes up, she moves under it, it clears, and the
## water she lands in rings out from where she broke it. Portal and recall both.
static func warp(o: Sea, x: float, y: float, accent: Color) -> void:
	if o._warping:
		return
	o._warping = true
	o._portal_armed = false
	Rumble.buzz([14, 60, 22, 60, 30])
	Sound.bell()
	var veil: ColorRect = ColorRect.new()
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	veil.color = Color(accent.lerp(Color.WHITE, 0.55), 0.0)
	veil.mouse_filter = Control.MOUSE_FILTER_STOP
	o._room_layer.add_child(veil)
	var tw: Tween = o.create_tween()
	tw.tween_property(veil, "color:a", 1.0, Motion.VEIL).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	await tw.finished
	o._boat.position = Vector2(x, y)
	o._boat.velocity = Vector2.ZERO
	o._boat.target = null
	o._camera.position = Vector2(x, y * Chart.GROUND)
	o._camera.reset_smoothing()
	var ring: Surfacing = Surfacing.new()
	ring.color = accent
	ring.position = Vector2(x, y)
	o._world.add_child(ring)
	o._trader_cell = ""
	var out: Tween = o.create_tween()
	out.tween_property(veil, "color:a", 0.0, Motion.VEIL).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	await out.finished
	veil.queue_free()
	o._warping = false
	o._flush_position()


## The free recall home, once a sea day: the rules stamp it, then the passage.
static func press_recall(o: Sea) -> void:
	if o._warping or o._hud.busy():
		return
	var to: Dictionary = Portal.HOME_TO
	if o._boat.position.distance_to(Vector2(float(to["x"]), float(to["y"]))) < 900.0:
		o._hud.toast("You are already home")
		return
	var left: float = Portal.recall_left_ms(o.session.profile(), "fishing")
	if left > 0.0:
		o._hud.toast("Recall ready in %dm" % int(ceil(left / 60000.0)))
		return
	var r: Variant = await o.session.act("spendRecall", ["fishing"])
	if r is Dictionary and r.get("ok", false):
		o.session.persist()
		o._recall_t = 99.0
		o._warp(float(to["x"]), float(to["y"]), Color(str(to["accent"])))
	elif r is Dictionary and r.get("readyAt") != null:
		o._hud.toast("Recall ready in %dm" % maxi(1, int(ceil((Js.parse_ms(r["readyAt"]) - Clock.now_ms()) / 60000.0))))
	else:
		o._hud.toast("The recall did not go through")


## Back to the Gunwharf's berth (a lost fight, a gate that held): the sea
## dims and she is there.
static func warp_to_gunwharf(o: Sea) -> void:
	if not o._berths.has("gunwharf"):
		return
	var at: Vector2 = (o._berths["gunwharf"] as Node2D).position
	o._warp(at.x, at.y, Color(0.85, 0.75, 0.6))


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
