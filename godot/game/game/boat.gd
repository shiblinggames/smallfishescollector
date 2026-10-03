class_name Boat
extends Node2D
## THE CAPTAIN'S BOAT ON THE CHART (Godot port, stage 1).
##
## Lives in the World node, which squashes the plane by Chart.GROUND; the
## sprite is counter-squashed because a boat stands up out of the water. Sail
## by clicking where to go, or steer with the keys or a stick.
##
## SAILING IS THE WEB'S (SeaMap.tsx): the boat has a HEADING. The bow comes
## round toward where you point at the rudder's rate (faster from a standstill),
## she picks up along the heading at the rig's rate, sideways drift bleeds off
## (grip), and on a long straight run at speed she reaches full sail. The
## Shipyard's ladders (hull, rudder, rig) and the boat's trim set the numbers:
## top speed SPEED x hull x boat speed; turn TURN x rudder x boat agility;
## pick-up ACCEL x rig x boat agility.
##
## Her wake is laid by the sea's Wake layer (game/wake.gd) from `wake_contact`;
## the lantern is a 2D light that comes up with the dark.

const SPEED: float = 300.0
const ACCEL: float = 2.6
const TURN: float = 2.4
const GRIP: float = 6.0
const FULL_SAIL: float = 1.15
const FULL_SAIL_AFTER: float = 2.5
const ARRIVE: float = 26.0
const SLOW: float = 240.0
const SPRITE_W: float = 210.0
## The fastest any boat goes (the wake and spray scale against it).
const MAX_SPEED: float = SPEED * 1.75 * 1.15

## What she is fitted with (set_fit): hull, rudder and rig multipliers, and the
## boat's own speed and agility from its grade and trim.
var hull: float = 1.0
var rudder: float = 1.0
var rig: float = 1.0
var boat_speed: float = 1.0
var agility: float = 1.0
var lantern_glow: float = 0.34
var heading: float = PI / 2.0
var _straight_t: float = 0.0
var _full: bool = false
## The weather on her (core/weather.gd, set by the Sea each frame): her top
## speed and her turning as multipliers, and its cue in words.
var weather_speed: float = 1.0
var weather_turn: float = 1.0
var weather_cue: String = ""
var full_sail: float = FULL_SAIL
var _sail_mom: float = 1.0
var _last_heading: float = PI / 2.0
var _sway_heading: float = PI / 2.0
## How deep in a squall she is (the sea sets it): the swell takes her harder.
var storm: float = 0.0

var velocity: Vector2 = Vector2.ZERO
## THE WATER UNDER HER (lib/seaFlow, SeaMap.tsx): the lane she is riding,
## the kelp's hold on her, and what to tell the captain about it (the HUD's
## cue chips). hush: the rod is out or a panel is up, so none of it applies.
var hush: bool = false
var cue: Dictionary = { "current": "", "full": false, "kelp": false, "weather": "" }
signal cue_changed(cue: Dictionary)
## She caught a lane or her sails filled: a splash, a buzz.
signal surged
## At the Sea Gate, which holds her back (the campaign is not built yet).
signal held_at_gate
## Held on a shut bay's rim; the line says which, and what opens it.
signal held_at_bay(line: String)
var _lane: String = ""
var _in_lane: bool = false
var _kelp_keep: float = 1.0
var _cue_t: float = 0.0
## Godot: streaks of water rushing past her at full sail or riding a lane.
var _rush: GPUParticles2D
var target: Variant = null
var locked: bool = false
## A fight has her (game/battle_stage.gd): no helm, no shore, no wall.
var hold_still: bool = false
var skipper: Skipper
var _facing: float = -1.0
var lantern: PointLight2D
## The sea's disturbance (set by the sea): casts, bobbers and splashes ring it.
var field: SeaField
## The line went in here (the shoals scatter from it).
signal cast_landed(at: Vector2)
var _line_t: float = 0.0
var _bob_t: float = 0.0


func _ready() -> void:
	skipper = Skipper.new()
	skipper.water = true
	skipper.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	_rush = GPUParticles2D.new()
	_rush.amount = 46
	_rush.lifetime = 0.55
	_rush.local_coords = false
	_rush.texture = SquallFx._streak()
	_rush.amount_ratio = 0.0
	_rush.z_index = -1
	var rm: ParticleProcessMaterial = ParticleProcessMaterial.new()
	rm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	rm.emission_box_extents = Vector3(170, 120, 0)
	rm.gravity = Vector3.ZERO
	rm.spread = 4.0
	rm.initial_velocity_min = 320.0
	rm.initial_velocity_max = 460.0
	rm.particle_flag_align_y = true
	rm.scale_min = 0.5
	rm.scale_max = 1.0
	var rg: Gradient = Gradient.new()
	rg.set_color(0, Color(0.9, 0.97, 1.0, 0.0))
	rg.add_point(0.3, Color(0.9, 0.97, 1.0, 0.28))
	rg.set_color(rg.get_point_count() - 1, Color(0.9, 0.97, 1.0, 0.0))
	var rt: GradientTexture1D = GradientTexture1D.new()
	rt.gradient = rg
	rm.color_ramp = rt
	_rush.process_material = rm
	add_child(_rush)
	add_child(skipper)
	lantern = PointLight2D.new()
	# A beam, not a glow (Kong: "like a flashlight, pointing where you go").
	lantern.texture = Glow.beam()
	lantern.texture_scale = 2.2
	lantern.color = Color(1.0, 0.8, 0.55)
	lantern.energy = 0.0
	lantern.position = Vector2(0, -20)
	add_child(lantern)


var _ship: Sprite2D
var _ship_base_y: float = 0.0
## Under her, north of the arch: the expedition ship (North).
var on_ship: bool = false


## The ship's rig (the hull, sunk at its waterline, and the water it pushes
## aside), her reflection, and whether her picture is drawn bow-right (so it
## turns the other way to the fishing boat's bow-left convention).
var _ship_rig: Node2D
var _ship_mirror: CanvasGroup
var _ship_flip: bool = false
var _ship_mirror_y: float = 0.0
var _ship_phase: float = randf() * 6.28
var _ship_wob: float = 0.0


## THE CHANGE OF BOAT (North): past the sign in the arch, the ship you own
## for expeditions; back through it, the fishing boat. Drawn as the web's
## Warship (SeaMap.tsx): the hull's sea art (lib/ships.ts seaImageUrl, or an
## equipped ship skin's hull) in a 340-wide box, its keel (seaKeel) on the
## water. IN the water as the fishing boats are (Kong): the hull sinks below
## its waterline through the same waterline shader, the same collar of
## pushed-aside water rings it, and its reflection is the boats' own, a twin
## mirrored about the waterline through the hull-mirror shader, lying down and
## swaying. def: the rules' "ships" row; tex: the picture; wide: how much
## wider a skin's padded plate is drawn.
## THE CROSSING (Kong: "very satisfying and seamless"): with `animate`, a
## pool of light blooms under her (gold going north, sea-blue coming home),
## the hull she leaves fades down into the water and the one she takes rises
## out of it, settling with a little overshoot.
var _rise: float = 0.0
var _swap_tw: Tween


func set_ship(on: bool, def: Dictionary = {}, tex: Texture2D = null, wide: float = 1.0, animate: bool = false) -> void:
	on_ship = on
	if _swap_tw != null and _swap_tw.is_valid():
		_swap_tw.kill()
	_rise = 0.0
	var old_rig: Node2D = _ship_rig
	var old_mirror: Node2D = _ship_mirror
	_ship_rig = null
	_ship_mirror = null
	_ship = null
	if animate:
		_bloom(Color(1.0, 0.8, 0.45) if on else Color(0.45, 0.82, 1.0))
		_spray(on)
		_swap_tw = create_tween().set_parallel()
	# What she leaves: faded down into the water.
	if on:
		if animate:
			_swap_tw.tween_property(skipper, "modulate:a", 0.0, 0.3)
			_swap_tw.chain().tween_callback(func() -> void:
				skipper.visible = false
				skipper.modulate.a = 1.0)
			_swap_tw.set_parallel()
		else:
			skipper.visible = false
	for n: Node2D in [old_rig, old_mirror]:
		if n == null:
			continue
		if animate:
			var fade: Tween = n.create_tween()
			fade.tween_property(n, "modulate:a", 0.0, 0.3)
			fade.tween_callback(n.queue_free)
		else:
			n.queue_free()
	# What she takes: risen out of it.
	if not on:
		skipper.visible = true
		if animate:
			skipper.modulate.a = 0.0
			_swap_tw.tween_property(skipper, "modulate:a", 1.0, 0.5).set_delay(0.18)
		return
	if tex == null:
		return
	_ship_flip = def.get("seaFlip", false) == true
	var box: float = 340.0 * wide
	var sc: float = box / float(tex.get_width())
	var hull: Sprite2D = Sprite2D.new()
	hull.texture = tex
	hull.scale = Vector2(sc, sc / Chart.GROUND)
	var h: float = tex.get_height() * hull.scale.y
	# The keel on the water here (y 0), and the waterline a little up it, by
	# the same share as the fishing boats sink (Skipper.SINK of the box).
	var keel_frac: float = float(def.get("seaKeel", 0.75))
	hull.position = Vector2(0, -h * (keel_frac - 0.5))
	var top: float = hull.position.y - h / 2.0
	var keel: float = top + h * keel_frac
	var waterline: float = keel - Skipper.SINK * box / Chart.GROUND
	var cut: float = (waterline - top) / h
	var depth: float = (keel - waterline) / h
	# Along the keel's own slope (a hull drawn stern-high sits so in the water).
	var tilt: float = Skipper.keel_tilt(tex)
	hull.material = Skipper.afloat_mat("res://game/fx/waterline.gdshader", hull, cut, depth, _ship_phase)
	(hull.material as ShaderMaterial).set_shader_parameter("tilt", tilt)
	_ship_rig = Node2D.new()
	add_child(_ship_rig)
	_ship_rig.add_child(hull)
	var collar: Sprite2D = Skipper.collar_of(hull, cut, depth, _ship_phase)
	(collar.material as ShaderMaterial).set_shader_parameter("tilt", tilt)
	_ship_rig.add_child(collar)
	_ship = hull
	# The reflection: a twin about the waterline, lying down, under the hull.
	_ship_mirror = CanvasGroup.new()
	_ship_mirror.fit_margin = 12.0
	var mm: ShaderMaterial = ShaderMaterial.new()
	mm.shader = load("res://game/fx/hull_mirror.gdshader")
	_ship_mirror.material = mm
	var twin: Sprite2D = Sprite2D.new()
	twin.texture = tex
	twin.scale = hull.scale
	twin.position = hull.position
	_ship_mirror.add_child(twin)
	_ship_mirror_y = waterline * (1.0 + Skipper.LIE)
	_ship_mirror.position = Vector2(0, _ship_mirror_y)
	_ship_mirror.scale = Vector2(1.0, -Skipper.LIE)
	add_child(_ship_mirror)
	move_child(_ship_mirror, 0)
	_ship_base_y = 0.0
	if animate:
		_rise = 30.0
		_ship_rig.modulate.a = 0.0
		_ship_mirror.modulate.a = 0.0
		_swap_tw.tween_property(_ship_rig, "modulate:a", 1.0, 0.45).set_delay(0.15)
		_swap_tw.tween_property(_ship_mirror, "modulate:a", 1.0, 0.6).set_delay(0.25)
		_swap_tw.tween_property(self, "_rise", 0.0, 0.7).set_delay(0.15).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## A pool of light blooming under her and fading, for the crossing.
## The sea thrown up either side as one hull goes down and the other comes
## up: white water off the beam, arching and falling back.
func _spray(big: bool) -> void:
	for side: float in [-1.0, 1.0]:
		var p: CPUParticles2D = CPUParticles2D.new()
		p.one_shot = true
		p.emitting = false
		p.amount = 46 if big else 30
		p.lifetime = 0.95
		p.explosiveness = 0.85
		p.texture = Glow.radial(32, Color(1, 1, 1), false)
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
		p.emission_rect_extents = Vector2(120.0 if big else 70.0, 6.0)
		p.position = Vector2(side * (60.0 if big else 30.0), -4.0)
		p.direction = Vector2(side * 0.55, -1.0).normalized()
		p.spread = 26.0
		p.initial_velocity_min = 260.0 if big else 190.0
		p.initial_velocity_max = 480.0 if big else 330.0
		p.gravity = Vector2(0, 1500.0)
		p.damping_min = 40.0
		p.damping_max = 90.0
		p.scale_amount_min = 0.35
		p.scale_amount_max = 0.95
		var ramp: Gradient = Gradient.new()
		ramp.set_color(0, Color(1, 1, 1, 0.85))
		ramp.set_color(1, Color(0.85, 0.95, 1.0, 0.0))
		p.color_ramp = ramp
		var sc: Curve = Curve.new()
		sc.add_point(Vector2(0, 0.6))
		sc.add_point(Vector2(0.3, 1.0))
		sc.add_point(Vector2(1, 0.4))
		p.scale_amount_curve = sc
		p.z_index = 2
		add_child(p)
		p.emitting = true
		p.finished.connect(p.queue_free)


func _bloom(col: Color) -> void:
	var l: PointLight2D = PointLight2D.new()
	l.texture = Glow.radial(256, col, true)
	l.texture_scale = 3.2
	l.color = col
	l.energy = 0.0
	l.position = Vector2(0, -10)
	add_child(l)
	var tw: Tween = l.create_tween()
	tw.tween_property(l, "energy", 1.5, 0.18).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "energy", 0.0, 0.9).set_trans(Tween.TRANS_SINE)
	tw.tween_callback(l.queue_free)


## The Shipyard's refits and the boat's trim, from a profile.
func set_fit(p: Dictionary) -> void:
	# The Full Sail skill (port rules) lifts the long-run speed.
	full_sail = float(Rules.skill("full_sail").get("value", FULL_SAIL)) if Rules.has_skill(Js.num(p.get("fishing_xp")), "full_sail") else FULL_SAIL
	hull = Shipyard.effect("hull_speed_tier", Js.num(p.get("hull_speed_tier")))
	rudder = Shipyard.effect("hull_handling_tier", Js.num(p.get("hull_handling_tier")))
	rig = Shipyard.effect("hull_accel_tier", Js.num(p.get("hull_accel_tier")))
	lantern_glow = Shipyard.effect("lantern_tier", Js.num(p.get("lantern_tier")))
	var b: Dictionary = Skipper._find("boats", p.get("equipped_boat"))
	var grade: float = float(b.get("grade", 1.0))
	var trim: float = float(b.get("trim", 0.0))
	boat_speed = grade * (1.0 + trim)
	agility = grade * (1.0 - trim)


func steer(input: Vector2, delta: float) -> void:
	# In a fight (BattleStage) the stage moves her; nothing else does.
	if hold_still:
		velocity = Vector2.ZERO
		return
	var top: float = SPEED * hull * boat_speed * weather_speed
	var order: Variant = null
	var want: float = 0.0
	if not locked:
		if input.length() > 0.1:
			target = null
			order = input.angle()
			want = top * minf(1.0, input.length()) * _sail_mom * _kelp_keep
		elif target != null:
			var to: Vector2 = (target as Vector2) - position
			var d: float = to.length()
			if d < ARRIVE:
				target = null
			else:
				order = to.angle()
				var t: float = clampf((d - ARRIVE) / (SLOW - ARRIVE), 0.0, 1.0)
				want = top * t * t * (3.0 - 2.0 * t) * _sail_mom * _kelp_keep
	# The bow comes round toward the order, faster from a standstill.
	var spd: float = velocity.length()
	if order != null:
		var stopped: float = 1.0 - minf(1.0, spd / (SPEED * 0.35))
		var max_turn: float = TURN * rudder * agility * weather_turn * (1.0 + stopped * 2.5) * delta
		heading += clampf(wrapf(float(order) - heading, -PI, PI), -max_turn, max_turn)
	# Along the heading she picks up toward the speed she wants; across it the
	# drift bleeds off.
	var h: Vector2 = Vector2.from_angle(heading)
	var n: Vector2 = h.orthogonal()
	var fwd: float = velocity.dot(h)
	var lat: float = velocity.dot(n)
	var align: float = maxf(0.0, 0.5 + 0.5 * cos(heading - float(order))) if order != null else 0.0
	var kf: float = 1.0 - exp(-ACCEL * rig * agility * delta)
	fwd += (want * align - fwd) * kf
	lat *= exp(-GRIP * delta)
	velocity = h * fwd + n * lat
	var next: Vector2 = position + velocity * delta
	_flow(delta, top, input.length() > 0.1)
	next += _flow_push
	# Every island's shore stops the hull.
	var off: Dictionary = Chart.off_shore(next)
	if off["hit"]:
		next = off["at"]
		velocity *= 0.2
	# The reef (through the arch only) and the anchorage's wall (North).
	var held: Dictionary = North.hold(position, next)
	if held["hit"]:
		next = held["at"]
		velocity *= 0.2
		if held["why"] == "gate":
			held_at_gate.emit()
	# A shut bay of the campaign: back on its rim, sliding along it.
	var shut: Dictionary = CampaignWater.hold(next)
	if shut["hit"]:
		next = shut["at"]
		var inward: float = velocity.dot(-(shut["out"] as Vector2))
		if inward > 0.0:
			velocity += (shut["out"] as Vector2) * inward
		target = null
		held_at_bay.emit(str(shut["line"]))
	position = next
	var speed: float = velocity.length()
	# How she sits: rougher further out, heeling into a turn (away from its
	# centre), the bow lifting with way on.
	var band: float = clampf((position.length() - 1400.0) / 21200.0, 0.0, 1.0)
	var rough: float = 1.0 + band * 1.4 + storm * 1.8
	var turn_rate: float = wrapf(heading - _sway_heading, -PI, PI) / maxf(delta, 0.0001)
	_sway_heading = heading
	var way: float = clampf(speed / (SPEED * hull * boat_speed), 0.0, 1.0)
	var heel: float = clampf(turn_rate * way * 4.0, -7.0, 7.0) * signf(velocity.x if absf(velocity.x) > 1.0 else 1.0)
	var pitch: float = -signf(velocity.x) * way * 2.8 if absf(velocity.x) > 8.0 else 0.0
	skipper.sway(delta, rough, heel, pitch)
	var rk: float = rush()
	_rush.amount_ratio = rk
	_rush.emitting = rk > 0.01
	if speed > 1.0:
		var back: Vector2 = -velocity.normalized()
		(_rush.process_material as ParticleProcessMaterial).direction = Vector3(back.x, back.y, 0)
	lantern.texture_scale = 2.4 + 4.0 * lantern_glow
	# Pointed the way the bow points.
	lantern.rotation = heading
	if speed > 20.0 and absf(velocity.x) > 8.0:
		_facing = 1.0 if velocity.x > 0.0 else -1.0
		skipper.scale.x = -_facing
	if _ship_rig != null:
		# Bow-left by convention (as the fishing boat), turned to her way; a
		# little roll and heave on the waterline, the reflection keeping time
		# and swaying as the boats' does.
		var fx: float = -1.0 if ((_facing > 0.0) != _ship_flip) else 1.0
		var bob: float = sin(Time.get_ticks_msec() / 1300.0) * 3.0
		_ship_rig.scale.x = fx
		_fx_v += (-_fx_slide * 60.0 - _fx_v * 9.0) * delta
		_fx_slide += _fx_v * delta
		_fx_heel = lerpf(_fx_heel, 0.0, 1.0 - exp(-delta * 3.0))
		_fx_flash = maxf(0.0, _fx_flash - delta * 5.0)
		_ship_rig.rotation = sin(Time.get_ticks_msec() / 900.0) * 0.012 * rough + _fx_heel
		_ship_rig.position.y = bob + _rise + _fx_slide.y
		_ship_rig.position.x = _fx_slide.x
		_ship_rig.modulate = Color.WHITE.lerp(Color(1.0, 0.55, 0.45), clampf(_fx_flash, 0.0, 1.0))
		_ship_mirror.scale.x = fx
		_ship_mirror.rotation = -_ship_rig.rotation
		_ship_mirror.position.y = _ship_mirror_y - bob * 0.75 - _rise * Skipper.LIE
		_ship_wob += delta
		_ship_mirror.skew = sin(_ship_wob * Skipper.MIRROR_RATE + _ship_phase) * Skipper.MIRROR_SHEAR + sin(_ship_wob * Skipper.MIRROR_RATE * 1.63 + _ship_phase * 2.1) * Skipper.MIRROR_SHEAR * 0.45


## Where her wake starts (SeaMap.tsx): the cutwater, 40px toward the bow and
## 21px down the sprite, and under the keel (34px down) for the rings at rest.
## Force is the share of her speed, nothing under 26px/s.
const BOW_X: float = (0.308 - 0.5) * SPRITE_W
const BOW_DOWN: float = (0.599 - 0.5) * SPRITE_W
const KEEL_Y: float = 34.0


func wake_contact() -> Dictionary:
	var speed: float = velocity.length()
	var web_facing: float = signf(skipper.scale.x)
	return {
		"id": "me", "x": position.x + web_facing * BOW_X - 1.0, "y": position.y + BOW_DOWN / Chart.GROUND,
		"cx": position.x - 1.0, "cy": position.y + KEEL_Y / Chart.GROUND,
		"ang": atan2(velocity.y, velocity.x) if speed > 1.0 else heading,
		"force": minf(1.0, speed / (SPEED * 0.9)) if speed > 26.0 else 0.0, "scale": 1.0,
	}


## The same for anyone else on the water, from where they are and which way
## they face; the wake reads their speed and heading off their movement.
static func contact_for(id: String, at: Vector2, sk: Skipper) -> Dictionary:
	var f: float = signf(sk.scale.x) if sk != null else 1.0
	return {
		"id": id, "x": at.x + f * BOW_X - 1.0, "y": at.y + BOW_DOWN / Chart.GROUND,
		"cx": at.x - 1.0, "cy": at.y + KEEL_Y / Chart.GROUND, "scale": 1.0,
	}


var _flow_push: Vector2 = Vector2.ZERO


## The current, the kelp and the sails (SeaMap.tsx's frame loop, as the web
## runs it): the lane carries her along it at up to 55% of base speed (and the
## spot she was told to sail to with her, when she is nearly there); the kelp
## holds her to 60%; a clean straight run at speed fills her sails to 1.15.
func _flow(delta: float, top: float, steering: bool) -> void:
	_flow_push = Vector2.ZERO
	var way: String = ""
	var full: bool = false
	if not hush:
		var cur: Dictionary = SeaFlow.current_at(position.x, position.y, _lane)
		_lane = cur["id"]
		var k: float = float(cur["k"])
		var u: Vector2 = cur["u"]
		if k > 0.0:
			var push: float = float(SeaFlow.flow()["push"]) * SPEED * k * delta
			_flow_push = u * push
			if not steering and target != null and ((target as Vector2) - position).length() < SLOW:
				target = (target as Vector2) + u * push
		var lane_now: bool = k > (0.25 if _in_lane else 0.35)
		if lane_now and not _in_lane:
			surged.emit()
		_in_lane = lane_now
		if lane_now:
			var sp: float = velocity.length()
			var dot: float = velocity.dot(u) / sp if sp > 20.0 else 1.0
			var prev: String = cue["current"]
			way = "with" if dot > (0.35 if prev == "with" else 0.55) else ("against" if dot < (-0.35 if prev == "against" else -0.55) else "across")
		var keep_to: float = 1.0 - (1.0 - float(SeaFlow.flow()["keep"])) * SeaFlow.kelp_at(position.x, position.y)
		_kelp_keep += (keep_to - _kelp_keep) * (1.0 - exp(-4.0 * delta))
		var turn: float = wrapf(heading - _last_heading, -PI, PI)
		_last_heading = heading
		var fast: bool = velocity.length() > top * 0.75 * _kelp_keep
		if fast and absf(turn) / maxf(delta, 0.0001) < 0.5:
			_straight_t += delta
		else:
			_straight_t = maxf(0.0, _straight_t - delta * 4.0)
		full = _straight_t > (FULL_SAIL_AFTER - 0.5 if _full else FULL_SAIL_AFTER)
		if full and not _full:
			surged.emit()
		_full = full
		_sail_mom += ((full_sail if full else 1.0) - _sail_mom) * (1.0 - exp(-3.0 * delta))
	else:
		_kelp_keep += (1.0 - _kelp_keep) * (1.0 - exp(-4.0 * delta))
		_sail_mom += (1.0 - _sail_mom) * (1.0 - exp(-3.0 * delta))
		_straight_t = 0.0
		_full = false
		_in_lane = false
		_lane = ""
	var kelp_now: bool = _kelp_keep < 0.9
	_cue_t += delta
	if (cue["current"] != way or cue["full"] != full or cue["kelp"] != kelp_now or cue.get("weather", "") != weather_cue) and _cue_t > 0.3:
		_cue_t = 0.0
		cue = { "current": way, "full": full, "kelp": kelp_now, "weather": weather_cue }
		cue_changed.emit(cue)


## How hard the water is rushing past her: full sail, riding a lane.
func rush() -> float:
	var riding: bool = cue["current"] == "with" and velocity.length() > SPEED * hull * boat_speed * 0.3
	return 1.0 if (cue["full"] and riding) else (0.6 if cue["full"] else (0.3 if riding else 0.0))


func facing() -> float:
	return _facing


func set_pose(pose: String) -> void:
	if pose == "wait" and skipper.frame != "wait" and field != null:
		# The line lands: a ring where it went in.
		field.ring(hook_at(), 100.0, 1.6, 0.8)
		_bob_t = 0.0
		cast_landed.emit(hook_at())
	skipper.set_frame(pose)


## Where the line meets the water while she waits (the sheet's painted ring:
## 155 x 760 of the 900 x 800 sheet), on the plane.
## A nibble: the bobber dips, a small ring, a soft plip.
func nibble() -> void:
	skipper.line_dip_t = skipper.line_clock
	if field != null:
		field.ring(hook_at(), 20.0, 0.8, 0.35)
	Sound.plip()


func hook_at() -> Vector2:
	var x: float = -105.0 - 16.8 + 155.0 / 900.0 * 210.0 + skipper.pose_shift.x
	var y: float = -93.3 - 48.5 + 760.0 / 800.0 * 186.7 + skipper.pose_shift.y
	return position + Vector2(x * signf(skipper.scale.x), y / Chart.GROUND)


func _process(delta: float) -> void:
	# The bobber, twitching now and then while she waits.
	# Where the line goes in: small rings, steadily, on the sea's own
	# perspective (the sheet's painted ripple is gone; it was flatter).
	if field != null and skipper.frame == "wait":
		_line_t -= delta
		if _line_t <= 0.0:
			_line_t = 1.9
			field.ring(hook_at(), 14.0, 1.3, 0.12)
	if field != null and skipper.frame == "wait":
		_bob_t -= delta
		if _bob_t <= 0.0:
			_bob_t = randf_range(2.6, 4.6)
			field.ring(hook_at(), 30.0, 1.2, 0.35)


func set_look(look: Dictionary) -> void:
	skipper.set_look(look)


## THE CATCH SPLASH in front of the bow (app/(app)/sea/seaSplash.ts): droplets
## thrown up and falling back, a ring spreading on the water; bigger, and
## part gold, on a perfect.
func splash(perfect: bool, world_at: Variant = null) -> void:
	var facing: float = _facing
	var at: Vector2 = Vector2(facing * 150.0, 70.0) if world_at == null else (world_at as Vector2) - position
	var p: GPUParticles2D = GPUParticles2D.new()
	p.one_shot = true
	p.explosiveness = 1.0
	p.amount = 34 if perfect else 22
	p.lifetime = 0.78
	p.local_coords = false
	p.texture = Glow.radial(16, Color.WHITE)
	var m: ParticleProcessMaterial = ParticleProcessMaterial.new()
	m.direction = Vector3(0, -1, 0)
	m.spread = 55.0
	m.initial_velocity_min = 160.0 * (1.25 if perfect else 1.0)
	m.initial_velocity_max = 320.0 * (1.25 if perfect else 1.0)
	m.gravity = Vector3(0, 620.0 / Chart.GROUND, 0)
	m.scale_min = 0.25
	m.scale_max = 0.5
	m.lifetime_randomness = 0.45
	var g: Gradient = Gradient.new()
	g.set_color(0, Color("#fde68a") if perfect else Color(0.9, 0.97, 1.0))
	g.set_color(1, Color(0.9, 0.97, 1.0, 0.0))
	var ramp: GradientTexture1D = GradientTexture1D.new()
	ramp.gradient = g
	m.color_ramp = ramp
	p.process_material = m
	p.position = at
	add_child(p)
	p.emitting = true
	if field != null:
		field.ring(position + at, 160.0 if perfect else 115.0, 1.7, 0.9)
	var ring: Ripple = Ripple.new()
	ring.position = at
	ring.grow = 105.0 if perfect else 80.0
	ring.life = 0.7 if perfect else 0.52
	add_child(ring)
	get_tree().create_timer(1.2).timeout.connect(p.queue_free)


## A ring spreading on the water (drawn on the squashed plane, so an ellipse).
class Ripple:
	extends Node2D
	var grow: float = 110.0
	var life: float = 0.52
	var t: float = 0.0

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var age: float = t / life
		draw_arc(Vector2.ZERO, 26.0 + age * grow, 0.0, TAU, 64, Color(1, 1, 1, (1.0 - age) * 0.5), 3.0, true)


## Turned to face one way and held there (a fight: the line faces the enemy).
func face_to(f: float) -> void:
	_facing = signf(f)
	skipper.scale.x = -_facing



var _fx_slide: Vector2 = Vector2.ZERO
var _fx_v: Vector2 = Vector2.ZERO
var _fx_heel: float = 0.0
var _fx_flash: float = 0.0


## In a fight: a blow, her guns' recoil or a swerve (as HullRig.react).
func react(lean: float, shove: Vector2, tint: float = 0.0) -> void:
	_fx_heel += lean
	_fx_v += shove * 9.0
	_fx_flash = maxf(_fx_flash, tint)
