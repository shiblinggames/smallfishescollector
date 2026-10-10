class_name JobSlip
extends Control
## FINN'S JOB, AS A THING YOU HOLD (Kong, 2026-10-02: "very satisfying to
## complete quests and turn in quests"). A slip of paper in his hand: where in
## the story it sits, what he wants, how far along you are, what it pays, his
## name at the foot. Taking a job stamps it TAKEN; handing it back presses a
## wax seal into it. A counter on a panel became something you carry.

const W: float = 400.0
const SEAL: Color = Color(0.62, 0.13, 0.1)

## The job (a FinnQuestView, or a job def with no progress yet).
var job: Dictionary = {}
var have: float = 0.0
var _card: Pane
var _stamp: Control
var _bar: Control
var _fill: float = 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(W, 0)
	var q: Dictionary = Finn.quest_by_id(job.get("id"))
	_card = Kit.pane(self, { "radius": 6, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.35)], "shadow": [Color(0, 0, 0, 0.45), 18, Vector2(0, 6)], "pad": [20, 16, 20, 14], "paper": true })
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_card.custom_minimum_size = Vector2(W, 0)
	# The slip is as tall as its paper, so a list it sits in makes room.
	_card.resized.connect(func() -> void: custom_minimum_size = Vector2(W, _card.size.y))
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_card.add_child(col)
	var ch: Dictionary = chapter_of(q)
	var eb: Label = Kit.text(col, "THE LONG CAST  ·  CHAPTER %s" % str(ch.get("romanNumeral", "")), "eyebrow", Paper.RED)
	eb.add_theme_font_size_override("font_size", 11)
	var ct: Label = Kit.text(col, str(ch.get("title", "")), "note", Paper.INK_SOFT)
	ct.add_theme_font_override("font", Kit.italic())
	var rule: ColorRect = ColorRect.new()
	rule.color = Color(Paper.INK, 0.25)
	rule.custom_minimum_size = Vector2(0, 1)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(rule)
	var label: Label = Kit.text(col, str(job.get("label", q.get("label", ""))), "title", Paper.INK, true)
	label.add_theme_font_size_override("font_size", 22)
	if q.has("hint"):
		var hint: Label = Kit.text(col, "\"%s\"" % q["hint"], "body", Paper.INK_SOFT, true)
		hint.add_theme_font_override("font", Kit.italic())
		hint.add_theme_font_size_override("font_size", 15)
		hint.custom_minimum_size = Vector2(W - 40.0, 0)
	# How far along: the job's own words, and a ruled bar.
	var target: float = float(job.get("target", q.get("target", 1)))
	_fill = clampf(have / maxf(1.0, target), 0.0, 1.0)
	var prow: HBoxContainer = HBoxContainer.new()
	prow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(prow)
	var pt: Label = Kit.text(prow, Finn.progress_label(q, have) if not q.is_empty() else "", "label", Paper.INK_SOFT)
	pt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pt.name = "Progress"
	var pays: Label = Kit.text(prow, "+%s XP   %s ⟡" % [_n(float(q.get("xp", 0))), _n(float(q.get("reward", 0)))], "label", Paper.INK)
	pays.add_theme_color_override("font_color", Color(0.5, 0.36, 0.05))
	_bar = Control.new()
	_bar.custom_minimum_size = Vector2(0, 8)
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar.draw.connect(func() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, _bar.size)
		_bar.draw_rect(r, Color(Paper.INK, 0.12))
		_bar.draw_rect(Rect2(r.position, Vector2(r.size.x * _fill, r.size.y)), Color(0.72, 0.52, 0.1, 0.9))
		_bar.draw_rect(r, Color(Paper.INK, 0.35), false, 1.0))
	col.add_child(_bar)
	var sig: Label = Kit.text(col, "Finn", "title", Color(0.16, 0.2, 0.32, 0.85))
	sig.add_theme_font_override("font", Kit.italic())
	sig.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	# The stamp, waiting off the paper until it is pressed.
	_stamp = Control.new()
	_stamp.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stamp.visible = false
	add_child(_stamp)


static func chapter_of(q: Dictionary) -> Dictionary:
	for ch: Dictionary in Finn.chapters():
		if ch["band"] == q.get("band"):
			return ch
	return {}


## Thousands with commas (the one formatter, Js.thousands).
static func _n(v: float) -> String:
	return Js.thousands(v)


func set_have(v: float) -> void:
	have = v
	var q: Dictionary = Finn.quest_by_id(job.get("id"))
	var target: float = float(q.get("target", 1))
	var to: float = clampf(v / maxf(1.0, target), 0.0, 1.0)
	var pt: Label = _card.find_child("Progress", true, false)
	if pt != null:
		pt.text = Finn.progress_label(q, v)
	create_tween().tween_method(func(f: float) -> void:
		_fill = f
		_bar.queue_redraw(), _fill, to, 0.5).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


## Press the stamp in: TAKEN (ink) when he hands it over, the wax seal DONE
## when you hand it back. It drops from above the paper, lands with a thump
## and the slip gives under it.
func stamp(word: String, wax: bool) -> void:
	for c: Node in _stamp.get_children():
		c.queue_free()
	var col: Color = SEAL if wax else Color(0.16, 0.2, 0.32)
	var box: Pane = Kit.pane(_stamp, { "radius": 40 if wax else 6, "fill": [Color(col, 0.92) if wax else Color(0, 0, 0, 0)], "border": [3, Color(col, 0.9)], "pad": [18, 8, 18, 8] })
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l: Label = Kit.text(box, word, "title", Color(1.0, 0.9, 0.82) if wax else Color(col, 0.9))
	l.add_theme_font_override("font", Kit.font("cinzel", 900))
	l.add_theme_font_size_override("font_size", 26)
	_stamp.visible = true
	await get_tree().process_frame
	var sz: Vector2 = box.get_combined_minimum_size()
	_stamp.size = sz
	_stamp.pivot_offset = sz / 2.0
	_stamp.position = Vector2(W - sz.x - 26.0, 22.0)
	_stamp.rotation = deg_to_rad(-11.0)
	_stamp.scale = Vector2(2.6, 2.6)
	_stamp.modulate.a = 0.0
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_stamp, "scale", Vector2.ONE, 0.16).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	tw.tween_property(_stamp, "modulate:a", 1.0, 0.1)
	await tw.finished
	Sound.seal(wax)
	Rumble.buzz([0, 40, 20, 30] if wax else [0, 24])
	pivot_offset = size / 2.0
	var give: Tween = create_tween()
	give.tween_property(self, "scale", Vector2(0.965, 0.965), 0.06)
	give.tween_property(self, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
