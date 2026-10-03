class_name WakeMoment
extends Control
## A STINT COLLECTED (game/hall_bunks.gd): the hand climbs out of the bunk and
## up into the middle, the XP counts in under them, and their level ticks up
## one note at a time (a semitone higher each), with a burst of motes on the
## last. From the Leviathan bunk the light is teal and the moment ends on the
## deep's draw waiting below. Press anywhere once it has landed.

signal done

var member: Dictionary = {}
var grant: Dictionary = {}
var leviathan: bool = false
var from_rect: Rect2
var hall: CrewHall

var _t: float = 0.0
var _landed: bool = false
var _pic: TextureRect
var _fx: Control
var _xp_l: Label
var _lv_l: Label
var _note: Label
var _col: Color = HallBunks.GOLD
var _shown_lv: int = 0
var _burst_at: float = -1.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	if leviathan:
		_col = HallBunks.LEVIATHAN
	var dim: ColorRect = ColorRect.new()
	dim.color = Color(0.01, 0.02, 0.03, 0.72)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dim.modulate.a = 0.0
	add_child(dim)
	create_tween().tween_property(dim, "modulate:a", 1.0, 0.25)
	_fx = Control.new()
	_fx.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.draw.connect(_draw_fx)
	add_child(_fx)
	var vp: Vector2 = get_viewport_rect().size
	var local_from: Vector2 = get_global_transform().affine_inverse() * from_rect.get_center()
	_pic = TextureRect.new()
	_pic.texture = Skipper.tex("card-arts/%s.webp" % str(member.get("filename", "")).get_basename())
	_pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_pic.size = Vector2(300, 300)
	_pic.pivot_offset = Vector2(150, 150)
	_pic.position = local_from - Vector2(150, 150)
	_pic.scale = Vector2(0.35, 0.35)
	_pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_pic)
	var to: Vector2 = Vector2(vp.x / 2.0 - 150.0, vp.y * 0.42 - 150.0)
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_pic, "position", to, 0.55).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_pic, "scale", Vector2.ONE, 0.55).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	var words: VBoxContainer = VBoxContainer.new()
	words.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	words.offset_left = -360
	words.offset_right = 360
	words.offset_top = vp.y * 0.42 - vp.y / 2.0 + 160.0
	words.offset_bottom = words.offset_top + 160.0
	words.alignment = BoxContainer.ALIGNMENT_BEGIN
	words.add_theme_constant_override("separation", 2)
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(words)
	var n: Label = Kit.text(words, str(member.get("name", "")), "display", Color(0.98, 0.95, 0.88))
	n.add_theme_font_size_override("font_size", 34)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_xp_l = Kit.text(words, "", "title", _col.lightened(0.2))
	_xp_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_lv_l = Kit.text(words, "", "heading", Color(0.95, 0.9, 0.8))
	_lv_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_note = Kit.text(words, "", "small", Color(0.85, 0.8, 0.7, 0.7), true)
	_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_shown_lv = int(Js.num(grant.get("oldLevel", Crew.level(Js.num(member.get("xp"))))))
	_lv_l.text = "Level %d" % _shown_lv
	Sound.seal(false)
	Rumble.buzz([0, 20, 30, 40])


func _process(delta: float) -> void:
	_t += delta
	var gained: float = Js.num(grant.get("newXP")) - Js.num(grant.get("oldXP"))
	# The XP counts in from 0.6 s to 1.8 s.
	var k: float = clampf((_t - 0.6) / 1.2, 0.0, 1.0)
	var eased: float = 1.0 - pow(1.0 - k, 3.0)
	if grant.is_empty():
		if _t > 0.6 and _xp_l.text == "":
			_xp_l.text = "Fully trained" if not leviathan else "Rested"
			_note.text = "The deep has a draw for them. Answer it in the bunks." if leviathan else "Nothing more for them to learn in a bunk."
			_land()
	else:
		var shown: float = floor(gained * eased)
		_xp_l.text = "+%s XP" % Js.thousands(shown)
		# The level ticks with the XP, a note a level.
		var lv_now: int = Crew.level(Js.num(grant["oldXP"]) + shown)
		if lv_now > _shown_lv:
			var steps: int = lv_now - int(Js.num(grant["oldLevel"]))
			_shown_lv = lv_now
			_lv_l.text = "Level %d" % _shown_lv
			Sound.job_tick(mini(steps, 12))
			var tw: Tween = _lv_l.create_tween()
			_lv_l.pivot_offset = _lv_l.size / 2.0
			tw.tween_property(_lv_l, "scale", Vector2(1.18, 1.18), 0.06)
			tw.tween_property(_lv_l, "scale", Vector2.ONE, 0.14)
		if k >= 1.0 and not _landed:
			var old_lv: int = int(Js.num(grant["oldLevel"]))
			var new_lv: int = int(Js.num(grant["newLevel"]))
			_lv_l.text = "Level %d  →  %d" % [old_lv, new_lv] if new_lv > old_lv else "Level %d" % new_lv
			if leviathan:
				_note.text = "The deep has a draw for them. Answer it in the bunks."
			_land()
	# A slow rise and fall once landed.
	if _landed:
		_pic.position.y += sin(_t * 2.0) * 0.08
	_fx.queue_redraw()


func _land() -> void:
	_landed = true
	_burst_at = _t
	Sound.chest(leviathan or Js.num(grant.get("newLevel")) > Js.num(grant.get("oldLevel")))
	var p: Label = Kit.text(_note.get_parent(), "Press anywhere", "small", Color(0.85, 0.8, 0.7, 0.45))
	p.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		accept_event()
		if _landed:
			_close()


func _unhandled_input(event: InputEvent) -> void:
	if _landed and (event.is_action_pressed("fish_back") or event.is_action_pressed("ui_accept")):
		get_viewport().set_input_as_handled()
		_close()


func _close() -> void:
	if is_queued_for_deletion():
		return
	set_process(false)
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.2)
	tw.tween_callback(func() -> void:
		done.emit()
		queue_free())


func _draw_fx() -> void:
	var c: Vector2 = _pic.position + Vector2(150, 150) * _pic.scale.x + (Vector2(150, 150) * (1.0 - _pic.scale.x))
	c = _pic.position + _pic.pivot_offset
	var glow: float = clampf(_t / 0.6, 0.0, 1.0)
	_fx.draw_circle(c, 190.0, Color(_col, 0.07 * glow))
	_fx.draw_circle(c, 130.0, Color(_col, 0.06 * glow))
	if _burst_at >= 0.0:
		var since: float = _t - _burst_at
		var u: float = clampf(since / 1.1, 0.0, 1.0)
		_fx.draw_arc(c, 120.0 + 260.0 * (1.0 - pow(1.0 - u, 3.0)), 0.0, TAU, 80, Color(_col, 0.8 * (1.0 - u)), 6.0 * (1.0 - u) + 1.0, true)
		for i: int in 28:
			var a: float = TAU * float(i) / 28.0 + float(i) * 0.37
			var sp: float = 140.0 + 90.0 * fmod(float(i) * 0.618, 1.0)
			var life: float = clampf(since / 1.4, 0.0, 1.0)
			var pos: Vector2 = c + Vector2.from_angle(a) * sp * (1.0 - pow(1.0 - life, 2.0)) + Vector2(0, 60.0 * life * life)
			_fx.draw_circle(pos, 3.0 * (1.0 - life) + 1.0, Color(_col.lightened(0.3), 0.9 * (1.0 - life)))
