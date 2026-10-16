class_name StoryStage
extends Node2D
## A STORY BEAT ON THE LIVE SEA (Kong, 2026-10-16: the campaign as "a true main
## story"; the live sea kept for the moments where something happens ON the
## water, every other scene a living painting). The scene's words stay on the
## StoryScene's fade (stage_mode); a line's `cue` moves the water:
##   MIRA (The Deepest Water, campaignText cinema "stage_mira"):
##     mira_far    a lone schooner far out, coming on out of the haze
##     mira_near   she closes, slows, and holds off your bow, her face over her
##     mira_join   she comes about and settles in beside you, the same heading
##   KRUST (Krust's reveal, cinema "stage_krust"):
##     krust_ahead his brigantine out of the mist ahead, his face over it
##     krust_turn  his crew have seen you: a flare goes up and she comes about
## The ships are the game's own hulls (HullRig), the faces the campaign's marks.
## Lives in the sea's World; finish() puts the sea back.

const GROUND: float = Chart.GROUND

var sea: Sea
## "mira" or "krust".
var kind: String = "mira"
## StoryScene.under (unused here, kept with FinnReveal's shape).
var under: Control
var over: Control

var fx: BattleFx
var _ship: Node2D
var _rig: HullRig
var _face: Sprite2D
var _home: Vector2
var _zoom0: float = 1.0
var _done: Array = []
var _t: float = 0.0


func _ready() -> void:
	set_meta("fight", true)
	z_index = 2
	_home = sea._boat.position
	var vp: Vector2 = get_viewport_rect().size
	_zoom0 = clampf(vp.x * 0.62 / 900.0, 0.6, 1.6)
	fx = BattleFx.new()
	fx.field = sea._field
	fx.z_index = 6
	fx.set_meta("fight", true)
	sea._world.add_child(fx)
	sea._boat.velocity = Vector2.ZERO
	sea._boat.target = null
	sea._boat.hold_still = true
	sea._boat.face_to(1.0)
	sea._hud.visible = false
	sea.cine_clear = true
	_frame(Vector2(260.0, -20.0), 1.0)


func cue_line(_i: int, line: Dictionary) -> void:
	var c: String = str(line.get("cue", ""))
	if c == "" or c in _done:
		return
	_done.append(c)
	match c:
		"mira_far":
			_arrive("ship-hero/schooner_v3.png", "card-arts/Mira.webp", Vector2(1150, -120), Vector2(720, -80), 7.0, "haze")
			_frame(Vector2(420.0, -60.0), 0.82)
		"mira_near":
			_move_to(Vector2(430, -40), 3.0)
			_frame(Vector2(220.0, -20.0), 1.15)
		"mira_join":
			if _rig != null:
				_rig.face = 1.0
			_move_to(Vector2(40, 230), 4.0)
			_frame(Vector2(60.0, 110.0), 1.0)
		"krust_ahead":
			Sound.knock()
			_arrive("ship-hero/brigantine_v3.png", "Captainkrust.png", Vector2(760, -70), Vector2(640, -60), 3.2, "mist", 1.0)
			_frame(Vector2(330.0, -40.0), 1.05)
		"krust_turn":
			_krust_turn()


func _frame(at: Vector2, k: float) -> void:
	var z: float = _zoom0 * k
	sea.stage = { "zoom": z, "shift": Vector2(at.x, at.y * GROUND - 30.0) * z }


## A ship comes on out of the haze (fading in far, sailing to its mark) or out
## of the mist (a ring of it parting where she appears).
func _arrive(hull: String, face: String, from: Vector2, to: Vector2, secs: float, how: String, facing: float = -1.0) -> void:
	_ship = Node2D.new()
	_ship.position = _home + from
	_ship.modulate.a = 0.0
	add_child(_ship)
	_rig = HullRig.new()
	_rig.tex = Skipper.tex(hull)
	_rig.def = { "seaFlip": North.bow_left(hull) }
	_rig.box = 300.0
	_rig.face = facing
	_rig.field = sea._field
	_ship.add_child(_rig)
	_face = Sprite2D.new()
	_face.texture = Skipper.tex(face)
	if _face.texture != null:
		var s: float = 300.0 * 0.42 / float(_face.texture.get_width())
		_face.scale = Vector2(s, s / GROUND)
		_face.offset = Vector2(0, -_face.texture.get_height() / 2.0)
	_face.position = Vector2(0, -300.0 * 0.76 / GROUND)
	_face.modulate.a = 0.0
	_face.z_index = 5
	_ship.add_child(_face)
	var tw: Tween = _ship.create_tween().set_parallel()
	tw.tween_property(_ship, "modulate:a", 1.0, secs * (0.5 if how == "haze" else 0.4))
	tw.tween_property(_ship, "position", _home + to, secs).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	_face.create_tween().tween_property(_face, "modulate:a", 1.0, 1.0).set_delay(secs * 0.55)
	if how == "mist":
		for k: int in 3:
			sea._field.ring(_home + to, 180.0 + 90.0 * k, 2.6, 0.35)


func _move_to(to: Vector2, secs: float) -> void:
	if _ship == null:
		return
	_ship.create_tween().tween_property(_ship, "position", _home + to, secs).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


## His crew have seen you: a flare goes up off his deck and she comes about to
## face you, guns run out.
func _krust_turn() -> void:
	if _ship == null:
		return
	Sound.horn()
	fx.flare_up(_ship.position + Vector2(0, -80), true)
	await get_tree().create_timer(0.5).timeout
	if _rig != null:
		_rig.face = -1.0
	_move_to(Vector2(560, -50), 2.0)
	_frame(Vector2(300.0, -40.0), 1.3)
	if not GameSettings.calm():
		Rumble.buzz([0, 60, 40, 60])


func finish() -> void:
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.8)
	sea.stage = null
	sea._boat.hold_still = false
	sea.cine_clear = false
	sea._hud.visible = true
	await tw.finished
	if is_instance_valid(fx):
		fx.queue_free()
	queue_free()


func _process(delta: float) -> void:
	_t += delta
	if _face != null:
		_face.position.y = (-300.0 * 0.76 + sin(_t * TAU / 6.8) * 6.0) / GROUND
