class_name FinnScene
extends Control
## A WORD WITH FINN (Godot port of app/(app)/sea/FinnTalk.tsx, made the main
## story, Kong 2026-10-02: The Long Cast). His face, his words typed out a line
## at a time, and the job as a slip of paper (game/job_slip.gd).
##
## Three ways in. Nothing open: he speaks (speakToFinn), and if that set you a
## job its slip slides up for you to take; taking it stamps it and it flies up
## to the story line under the level bar. A job open and not done: where you
## are with it, the slip showing how far. A job done: the slip with "Hand it
## over"; the wax seal is pressed, the XP pours into the level bar, and he
## tells you the next piece of the story, with the next slip after it.

signal closed
## Something changed (a job set or handed back): the sea redraws the mark and
## the story line.
signal changed
## A job was handed back: the HUD pours `xp` into the level bar from `from`.
signal paid(xp: float, from: Vector2)
## A job was taken: the slip flies to the story line from `from`.
signal taken(from: Vector2)

const GOLD: Color = Color(1.0, 0.8, 0.3)

var session: Session
## finnState when he was hailed.
var st: Dictionary = {}
var _card: Pane
var _line: TypedLine
var _choices: VBoxContainer
var _slip_box: CenterContainer
var _slip: JobSlip
var _err: Label
var _queue: Array = []
var _then: Callable = Callable()
var _busy: bool = false
var _asked: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = Kit.scrim(self)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			_tap_outside())
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	var outer: VBoxContainer = VBoxContainer.new()
	outer.add_theme_constant_override("separation", 16)
	outer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(outer)
	var spec: Dictionary = Kit.modal(GOLD, 18)
	spec["top"] = [1, Kit.a(GOLD, 0.56)]
	_card = Kit.pane(outer, spec)
	_card.custom_minimum_size = Vector2(500, 0)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	_card.add_child(col)

	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	col.add_child(head)
	var av: Avatar = Avatar.new()
	var fa: Dictionary = Rules.data()["finnAvatar"]
	av.face = { "characterColor": fa["characterColor"], "hat": fa.get("equippedHat"), "bg": fa["bgColor"], "ring": fa["borderColor"], "mirrored": fa.get("mirrored", true) }
	av.px = 58.0
	head.add_child(av)
	var who: VBoxContainer = VBoxContainer.new()
	who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	who.alignment = BoxContainer.ALIGNMENT_CENTER
	who.add_theme_constant_override("separation", 1)
	head.add_child(who)
	var done_n: float = float(Js.list(st.get("questsDone")).size())
	var tier: int = Finn.standing_tier(Finn.standing(Js.num(st.get("encounters")), done_n))
	Kit.text(who, "The Angler  ·  %s" % str(Finn.d()["standingName"][tier]), "eyebrow", GOLD)
	Kit.text(who, "Finn", "title", Kit.INK)
	var x: Button = Kit.close_button()
	x.pressed.connect(close)
	head.add_child(x)

	var say_box: HBoxContainer = HBoxContainer.new()
	say_box.add_theme_constant_override("separation", 12)
	say_box.custom_minimum_size = Vector2(0, 112)
	col.add_child(say_box)
	var rule: ColorRect = ColorRect.new()
	rule.color = Kit.a(GOLD, 0.5)
	rule.custom_minimum_size = Vector2(2, 0)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	say_box.add_child(rule)
	_line = TypedLine.new()
	_line.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Kit.style(_line, "body", Color("#e6eef4"))
	_line.add_theme_font_size_override("font_size", 17)
	_line.add_theme_font_override("font", Kit.italic())
	_line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_line.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	_line.size_flags_vertical = Control.SIZE_EXPAND_FILL
	say_box.add_child(_line)
	_line.done.connect(_line_done)

	_choices = VBoxContainer.new()
	_choices.add_theme_constant_override("separation", 7)
	col.add_child(_choices)
	_err = Kit.text(col, "", "small", Kit.DANGER_INK, true)
	_err.visible = false

	# The slip sits under the card, on the table between you.
	_slip_box = CenterContainer.new()
	_slip_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Room kept for it, so the card does not jump when it comes and goes.
	_slip_box.custom_minimum_size = Vector2(0, 190)
	outer.add_child(_slip_box)
	_card.ready.connect(func() -> void: Kit.modal_in(_card))
	_open.call_deferred()


func _open() -> void:
	var q: Variant = st.get("quest")
	if st.get("questReady", false) and q != null:
		_put_slip(q, float((q as Dictionary)["have"]))
		_say(["You have got it. Go on then, hand it over."], func() -> void:
			_choice("Hand it over", "The job is done", true, _turn_in))
		return
	var r: Variant = await session.act("speakToFinn", [Js.num(st.get("encounters"))])
	if not (r is Dictionary):
		_say(["..."], _farewell)
		return
	var before_id: Variant = (q as Dictionary).get("id") if q is Dictionary else null
	changed.emit()
	_say((r as Dictionary)["lines"], func() -> void:
		var now: Variant = await session.act("finnState")
		var nq: Variant = (now as Dictionary).get("quest") if now is Dictionary else null
		if nq is Dictionary and (nq as Dictionary)["id"] != before_id:
			_offer(nq)
		elif nq is Dictionary:
			_put_slip(nq, float((nq as Dictionary)["have"]))
			_farewell()
		else:
			_farewell())


# ── Saying things ──────────────────────────────────────────────────────────────

## Lines one after another (strings, or { text, pause } from a scene), each
## typed out; "Go on" between them, `then` after the last.
func _say(lines: Array, then: Callable) -> void:
	_queue = lines.duplicate()
	_then = then
	_next_line()


func _next_line() -> void:
	_clear_choices()
	if _queue.is_empty():
		var t: Callable = _then
		_then = Callable()
		if t.is_valid():
			t.call()
		return
	var l: Variant = _queue.pop_front()
	var text: String = str(l) if typeof(l) == TYPE_STRING else str((l as Dictionary)["text"])
	_line.say(text.replace("*", ""))


func _line_done() -> void:
	if _queue.is_empty():
		_next_line()
	else:
		_choice("Go on", "", false, _next_line)


func _clear_choices() -> void:
	for c: Node in _choices.get_children():
		c.queue_free()


func _choice(label: String, hint: String, warm: bool, run: Callable) -> Button:
	var n: Dictionary = { "radius": 11, "fill": [Kit.a(GOLD, 0.14) if warm else Color(1, 1, 1, 0.045)], "border": [1, Kit.a(GOLD, 0.42) if warm else Color(1, 1, 1, 0.13)], "pad": 0 }
	var h: Dictionary = n.duplicate()
	h["border"] = [1, Kit.a(GOLD, 0.7)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.custom_minimum_size = Vector2(0, 52 if hint != "" else 42)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side: String in ["left", "right"]:
		m.add_theme_constant_override("margin_" + side, 14)
	b.add_child(m)
	var words: VBoxContainer = VBoxContainer.new()
	words.alignment = BoxContainer.ALIGNMENT_CENTER
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	words.add_theme_constant_override("separation", 0)
	m.add_child(words)
	Kit.text(words, label, "label", GOLD if warm else Kit.INK)
	if hint != "":
		Kit.text(words, hint, "small", Kit.DIM)
	b.pressed.connect(func() -> void:
		if not _busy:
			run.call())
	_choices.add_child(b)
	Kit.stagger(b, _choices.get_child_count() - 1)
	b.grab_focus.call_deferred()
	return b


## What is left to say: the questions his standing opens, and going.
func _farewell() -> void:
	_clear_choices()
	var done_n: float = float(Js.list(st.get("questsDone")).size())
	var tier: int = Finn.standing_tier(Finn.standing(Js.num(st.get("encounters")), done_n))
	var asks: Array = Finn.d()["asks"]
	var here: Array = Js.list(asks[tier]) if tier < asks.size() else []
	for i: int in here.size():
		if _asked.has(i):
			continue
		var a: Dictionary = here[i]
		_choice(str(a["you"]), "", false, func() -> void:
			_asked[i] = true
			_say([a["they"]], _farewell))
	_choice("I should get back to it.", "", false, close)


# ── The slip ───────────────────────────────────────────────────────────────────

func _put_slip(job: Dictionary, have: float) -> JobSlip:
	if _slip != null:
		_slip.queue_free()
	_slip = JobSlip.new()
	_slip.job = job
	_slip.have = have
	_slip_box.add_child(_slip)
	_slip.modulate.a = 0.0
	_slip.position.y += 40.0
	var tw: Tween = _slip.create_tween().set_parallel()
	tw.tween_property(_slip, "modulate:a", 1.0, 0.25)
	tw.tween_property(_slip, "position:y", _slip.position.y - 40.0, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	return _slip


## A new job: its slip slides up, and "Take the job" stamps it and sends it
## up to the story line.
func _offer(q: Dictionary) -> void:
	_put_slip(q, 0.0)
	Sound.plip()
	_clear_choices()
	_choice("Take the job", "It goes up under your level bar", true, func() -> void:
		_busy = true
		_clear_choices()
		await _slip.stamp("TAKEN", false)
		await get_tree().create_timer(0.35).timeout
		taken.emit(_slip.get_global_rect().get_center())
		var tw: Tween = _slip.create_tween().set_parallel()
		tw.tween_property(_slip, "scale", Vector2(0.25, 0.25), 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		tw.tween_property(_slip, "global_position", Vector2(get_viewport_rect().size.x / 2.0 - 50.0, 70.0), 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		tw.tween_property(_slip, "modulate:a", 0.0, 0.45).set_delay(0.15)
		await tw.finished
		changed.emit()
		close())


## Hand it back: the seal, the pay, his words, and the next slip.
func _turn_in() -> void:
	_busy = true
	_clear_choices()
	await _slip.stamp("DONE", true)
	var r: Variant = await session.act("turnInFinnQuest")
	if not (r is Dictionary) or (r as Dictionary).has("error"):
		_busy = false
		_err.text = str((r as Dictionary).get("error", "")) if r is Dictionary else ""
		_err.visible = true
		return
	paid.emit(float((r as Dictionary)["xp"]), _slip.get_global_rect().get_center())
	await get_tree().create_timer(0.5).timeout
	var tw: Tween = _slip.create_tween().set_parallel()
	tw.tween_property(_slip, "modulate:a", 0.0, 0.35)
	tw.tween_property(_slip, "position:y", _slip.position.y + 30.0, 0.35).set_ease(Tween.EASE_IN)
	await tw.finished
	_slip.queue_free()
	_slip = null
	_busy = false
	changed.emit()
	_say((r as Dictionary)["lines"], func() -> void:
		var now: Variant = await session.act("finnState")
		var nq: Variant = (now as Dictionary).get("quest") if now is Dictionary else null
		if now is Dictionary:
			st = now
		if nq is Dictionary:
			_offer(nq)
		else:
			_farewell())


func _tap_outside() -> void:
	if _line.typing:
		_line.finish()
	elif not _busy:
		close()


func close() -> void:
	closed.emit()
	queue_free()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and _line.typing:
		_line.finish()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		if not _busy:
			close()
	elif event.is_action_pressed("ui_accept") and _line.typing:
		get_viewport().set_input_as_handled()
		_line.finish()
