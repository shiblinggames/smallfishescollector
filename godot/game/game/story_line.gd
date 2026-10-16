class_name StoryLine
extends Control
## THE STORY LINE under the level bar (Kong, 2026-10-02: the campaign as a
## mainline quest, and "very satisfying to complete"). One line, always the
## next thing the story wants: "The Long Cast · Chapter I" over the job and
## how far along it is, with a ruled bar.
##
## Every catch that counts sends a gold mote from the boat into it, and a
## pluck a semitone higher than the last, so the last few climb. The one that
## finishes it presses a wax seal into the line with its own chime, and the
## line turns gold: "Back to Finn". With no job open it says what is waiting
## (gold when he has something for you; quiet when the next chapter waits on
## your level). Pressing it opens the Journal at the story.
##
## A TRACKER IN THE TOP LEFT (Kong, 2026-10-16: the centre top was "still too
## busy"): under the name and the purse, left-aligned and small, "THE LONG
## CAST · CH I" over the job, its count beside a hairline bar; gold only when
## Finn is waiting on you.

signal pressed

const GOLD: Color = Color(1.0, 0.8, 0.3)
const W: float = 300.0
const BAR_W: float = 140.0

var _eyebrow: Label
var _text: Label
var _count: Label
var _bar: Control
var _fill: float = 0.0
var _show_bar: bool = false
var _ready_state: bool = false
var _seal_k: float = 0.0
var _id: String = ""
var _have: float = -1.0
var _t: float = 0.0
var _bump: float = 0.0
## Until when (in _t) a tween is moving the bar or the seal: the line only
## redraws while something moves, not every frame of a fishing session.
var _anim_until: float = 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 1)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(col)
	col.resized.connect(func() -> void: custom_minimum_size = col.get_combined_minimum_size())
	_eyebrow = Kit.lift(Kit.text(col, "", "eyebrow", Color(Kit.INK, 0.6)))
	_eyebrow.add_theme_font_size_override("font_size", 10)
	_text = Kit.lift(Kit.text(col, "", "label", Kit.INK))
	_text.add_theme_font_size_override("font_size", 14)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(row)
	_count = Kit.lift(Kit.text(row, "", "small", Color(Kit.INK, 0.75)))
	_bar = Control.new()
	_bar.custom_minimum_size = Vector2(BAR_W + 26.0, 12)
	_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar.draw.connect(_draw_bar)
	row.add_child(_bar)
	visible = false


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		accept_event()
		pressed.emit()


## From finnState (or {} for nothing to show). Animates what moved.
func apply(st: Dictionary) -> void:
	queue_redraw()
	if st.is_empty():
		visible = false
		return
	var q: Variant = st.get("quest")
	var level: int = int(Js.num(st.get("fishingLevel")))
	var done: Array = Js.list(st.get("questsDone"))
	if q is Dictionary:
		var qv: Dictionary = q
		var def: Dictionary = Finn.quest_by_id(qv["id"])
		var ch: Dictionary = JobSlip.chapter_of(def)
		_eyebrow.text = "THE LONG CAST  ·  CH %s" % str(ch.get("romanNumeral", ""))
		var have: float = float(qv["have"])
		var target: float = float(qv["target"])
		var fresh: bool = qv["id"] != _id
		var grew: bool = not fresh and have > _have and _have >= 0.0
		_id = qv["id"]
		_show_bar = true
		if qv["done"]:
			_text.text = "Back to Finn"
			_text.add_theme_color_override("font_color", GOLD)
			_count.text = str(qv["label"])
			_count.add_theme_color_override("font_color", Color(Kit.INK, 0.75))
			if not _ready_state and not fresh:
				_complete()
			elif fresh:
				_seal_k = 1.0
			_ready_state = true
			_fill = 1.0
		else:
			_ready_state = false
			_seal_k = 0.0
			_text.text = str(qv["label"])
			_text.add_theme_color_override("font_color", Kit.INK)
			# Short: the job's words already say "in a row" or "raise".
			_count.text = "" if def.get("type") == "catch_ancient" else "%d of %d" % [mini(int(have), int(target)), int(target)]
			_count.add_theme_color_override("font_color", Color(Kit.INK, 0.7))
			var to: float = clampf(have / maxf(1.0, target), 0.0, 1.0)
			if grew:
				_tick(have, target)
				_anim_until = _t + 0.5
				create_tween().tween_method(func(f: float) -> void: _fill = f, _fill, to, 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			else:
				_fill = to
		_have = have
		visible = true
		return
	_id = ""
	_have = -1.0
	_ready_state = false
	_show_bar = false
	var nxt: Dictionary = Finn.next_quest(done, level)
	if not nxt.is_empty():
		var ch2: Dictionary = JobSlip.chapter_of(nxt)
		_eyebrow.text = "THE LONG CAST  ·  CH %s" % str(ch2.get("romanNumeral", ""))
		_text.text = "Finn has work for you"
		_text.add_theme_color_override("font_color", GOLD)
		_count.text = ""
		visible = true
		return
	var wait: Dictionary = Finn.waiting_on(done, level)
	if not wait.is_empty():
		_eyebrow.text = "THE LONG CAST"
		_text.text = "Chapter %s opens at Fishing %d" % [str(wait["romanNumeral"]), int(wait["minLevel"])]
		_text.add_theme_color_override("font_color", Color(Kit.INK, 0.7))
		_count.text = ""
		visible = true
		return
	visible = false


## A catch that counts: a pluck that climbs, a small lift of the line.
func _tick(have: float, target: float) -> void:
	_bump = 0.0
	_mote()
	await get_tree().create_timer(0.5).timeout
	Sound.job_tick(int(round(12.0 * clampf(have / maxf(1.0, target), 0.0, 1.0))))
	_bump = 1.0
	if target - have == 1.0:
		_count.text = "One more"


## A gold mote from the boat (the middle of the screen) arcing up into the
## line; it lands as the pluck sounds.
func _mote() -> void:
	var host: Control = get_parent() as Control
	if host == null:
		return
	var m: TextureRect = TextureRect.new()
	m.texture = Glow.radial(32, GOLD, false)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.size = Vector2(26, 26)
	m.modulate = Color(1, 1, 1, 0.0)
	host.add_child(m)
	var from: Vector2 = host.get_viewport_rect().size / 2.0 - Vector2(13, 40)
	var to: Vector2 = _bar.global_position - host.global_position + Vector2(BAR_W / 2.0 - 13.0, -7.0)
	var fly: Callable = func(u: float) -> void:
		var e: float = u * u * (3.0 - 2.0 * u)
		var p: Vector2 = from.lerp(to, e)
		p.x += sin(u * PI) * 60.0
		m.position = p
		m.scale = Vector2.ONE * lerpf(1.2, 0.6, u)
		m.modulate.a = clampf(u * 5.0, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, u))
	var tw: Tween = m.create_tween()
	tw.tween_method(fly, 0.0, 1.0, 0.5)
	tw.tween_callback(m.queue_free)


## Done: the seal pressed into the line, its chime, a buzz.
func _complete() -> void:
	_seal_k = 0.0
	_bump = 1.4
	_anim_until = _t + 0.3
	var tw: Tween = create_tween()
	tw.tween_method(func(k: float) -> void: _seal_k = k, 0.0, 1.0, 0.22).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	tw.tween_callback(func() -> void:
		Sound.seal(true)
		Rumble.buzz([0, 40, 20, 30]))


func _process(delta: float) -> void:
	_t += delta
	_bar.queue_redraw()
	# Still: nothing pulses, bumps or tweens, so the last frame stands.
	if _bump <= 0.0 and not _ready_state and _t >= _anim_until:
		return
	_bump = maxf(0.0, _bump - delta * 3.0)
	scale = Vector2.ONE * (1.0 + 0.06 * _bump)
	pivot_offset = size / 2.0
	queue_redraw()


## The hairline bar beside the count, and the seal at its end once done.
func _draw_bar() -> void:
	if not _show_bar:
		return
	var w: float = BAR_W
	var y: float = _bar.size.y / 2.0 - 1.0
	var x0: float = 0.0
	_bar.draw_rect(Rect2(x0, y, w, 2), Color(0, 0, 0, 0.3))
	var c: Color = GOLD.lerp(Color(1.0, 0.92, 0.6), 0.5 + 0.5 * sin(_t * 3.0)) if _ready_state else Color(GOLD, 0.75)
	_bar.draw_rect(Rect2(x0, y, w * _fill, 2), c)
	if _seal_k > 0.0:
		# The wax seal, pressed on at the bar's end: it drops from large.
		var s: float = lerpf(2.6, 1.0, _seal_k) * 0.7
		var at: Vector2 = Vector2(x0 + w + 13.0, y + 1.0)
		_bar.draw_circle(at, 9.0 * s, Color(0.62, 0.13, 0.1, _seal_k))
		_bar.draw_circle(at, 6.0 * s, Color(0.78, 0.24, 0.16, _seal_k))
		_bar.draw_arc(at, 9.0 * s, 0.0, TAU, 24, Color(0.4, 0.06, 0.04, _seal_k), 1.5, true)
