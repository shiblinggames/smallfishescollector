class_name FolkScene
extends "res://game/talk_modal.gd"
## A WORD WITH ONE OF THE REGULARS (Godot port of app/(app)/sea/FolkScene.tsx,
## the rest of the sea, stage 4): their face, their voice typed out, where you
## stand with them, and what you can say.
##
## The chart stays, dimmed. What you can say: the day's word ("So how have you
## been?", +1 rapport, once a day, listed greyed once had), the questions their
## tier opens (free, each once a visit, some with a beat after), and the job:
## ask what they are after, then, once you have landed one since they asked,
## hand it over (+3). A tier crossed puts up the crest: "You are now", the
## tier, and what they said; the top one sends three rings, not one.
##
## Everything goes through Session.act, so a crewmate's word is still theirs:
## rapport is personal in a Charter.
##
## The shell (card, head, typed line, choices, input) is the talk modal
## shared with FinnScene (game/talk_modal.gd).

## The standing changed: the row as it is now (the trader panel redraws the
## rod block off it).
signal changed(rap: Dictionary)

var folk: Dictionary = {}
var rap: Dictionary = {}
var _said: Label
var _bar_box: VBoxContainer
var _crest: Control
var _follow: Variant = null
var _gained: float = 0.0


func _ready() -> void:
	_accent = Color(str(folk.get("accent", "#f0c040")))
	var center: CenterContainer = _build_shell()
	var col: VBoxContainer = _build_card(center, Vector2(480, 540))

	# Who.
	var role: Label = _build_head(col, folk["face"], Folk.role_for(folk, _tier()), folk["short"])
	role.name = "Role"

	# What you said last, and what they are saying (a reserved block: their
	# lines run from four words to thirty and the card must not jump).
	_said = Kit.text(col, "", "note", Color(0.71, 0.84, 0.91, 0.6), true)
	_said.visible = false
	_build_say(col, 120)
	_line.done.connect(_show_choices)

	_bar_box = VBoxContainer.new()
	_bar_box.add_theme_constant_override("separation", 5)
	col.add_child(_bar_box)
	_draw_bar(false)

	_build_choices(col)
	_choices.size_flags_vertical = Control.SIZE_EXPAND_FILL

	_line.say(str(folk["greeting"]))
	# The card was readied inside add_child (this is the scene's own _ready),
	# so its ready signal has already gone: start the entrance here.
	Kit.modal_in(_card)


func _tier() -> int:
	return Folk.tier_for(Js.num(rap.get("points")))


## Where you stand: the tier, how far to the next, and the bar (from where it
## was, when something just moved it, with the gain floating off it).
func _draw_bar(animate: bool) -> void:
	for c: Node in _bar_box.get_children():
		c.queue_free()
	var points: float = Js.num(rap.get("points"))
	var tier: int = Folk.tier_for(points)
	var floor_at: float = Folk.TIER_AT[tier]
	var ceil_at: float = Folk.TIER_AT[4] if tier == 4 else Folk.TIER_AT[tier + 1]
	var span: float = maxf(1.0, ceil_at - floor_at)
	var frac: float = 1.0 if tier == 4 else minf(1.0, (points - floor_at) / span)
	var was: float = 1.0 if tier == 4 else clampf((points - _gained - floor_at) / span, 0.0, 1.0)
	var top: HBoxContainer = HBoxContainer.new()
	_bar_box.add_child(top)
	var tn: Label = Kit.text(top, Folk.TIER_NAME[tier], "label", _accent)
	tn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if animate and _gained > 0.0:
		# Floats free of the row, so the row does not hold it in place.
		var hold: Control = Control.new()
		hold.custom_minimum_size = Vector2(34, 0)
		hold.mouse_filter = Control.MOUSE_FILTER_IGNORE
		top.add_child(hold)
		var plus: Label = Kit.glow(Kit.text(hold, "+%d" % int(_gained), "value", _accent), _accent)
		plus.position = Vector2(0, -6)
		plus.ready.connect(func() -> void:
			var tw: Tween = plus.create_tween().set_parallel(true)
			tw.tween_property(plus, "position:y", plus.position.y - 22.0, 1.5).set_ease(Tween.EASE_OUT)
			tw.tween_property(plus, "modulate:a", 0.0, 1.5).set_delay(0.6))
	Kit.text(top, "As far as it goes" if tier == 4 else "%d to go" % int(ceil_at - points), "small", Kit.DIM)
	var bar: Kit.Bar = Kit.bar(_bar_box, was if animate else frac, _accent)
	if animate:
		bar.ready.connect(func() -> void: bar.set_value(frac, true))


## What you can say, once they have finished saying theirs (and not under the
## crest).
func _show_choices() -> void:
	_clear_choices()
	if _crest != null:
		return
	var tier: int = _tier()
	var can_chat: bool = not rap.get("chattedToday", false)
	var first: Control = null
	if _follow == null:
		first = _choice("So how have you been?", ("They will have something new to say" if can_chat else "Come back tomorrow"),
			"+1 rapport" if can_chat else "Had today", can_chat, not can_chat, _chat)
	if _follow != null:
		var f: Dictionary = _follow
		first = _choice(str(f["you"]), "", "", false, false, func() -> void:
			_follow = null
			_say(str(f["you"]), str(f["they"])))
	else:
		var asks: Array = Folk.asks(folk["id"])
		var here: Array = Js.list(asks[tier]) if tier < asks.size() else []
		for i: int in here.size():
			if _asked.has(i):
				continue
			var a: Dictionary = here[i]
			_choice(str(a["you"]), "", "", false, false, func() -> void:
				_asked[i] = true
				if a.get("then") != null:
					_follow = a["then"]
				_say(str(a["you"]), str(a["they"])))
		var want: Variant = rap.get("want")
		if want == null:
			_choice("Anything you're after?", "They will name one fish", "", false, false, _ask)
		elif not rap.get("wantReady", false):
			_choice("Still after that %s?" % want["name"], "Go and land one. Something already in the hold will not do.", "Waiting", false, true, Callable())
		else:
			_choice("I got your %s." % want["name"], "", "+%d rapport" % int(Folk.GIFT_POINTS), true, false, _deliver)
		_choice("I should get back to it.", "", "", false, false, close)
		if not can_chat and want != null and not rap.get("wantReady", false):
			var n: Label = Kit.text(_choices, "Nothing is lost by waiting.", "note", Kit.FAINT)
			n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	for i: int in _choices.get_child_count():
		Kit.stagger(_choices.get_child(i) as Control, i)
	for c: Node in _choices.get_children():
		if c is Button and not (c as Button).disabled:
			(c as Button).grab_focus.call_deferred()
			break


## One thing you can say: warm when it moves the friendship, greyed and
## dead when it is spent (and saying why), with its tag on the right.
func _choice(label: String, hint: String, tag: String, warm: bool, spent: bool, run: Callable) -> Button:
	var n: Dictionary
	if spent:
		n = { "radius": 11, "fill": [Color(1, 1, 1, 0.02)], "border": [1, Color(1, 1, 1, 0.1)], "pad": 0 }
	elif warm:
		n = { "radius": 11, "fill": [Kit.a(_accent, 0.12)], "border": [1, Kit.a(_accent, 0.36)], "pad": 0 }
	else:
		n = { "radius": 11, "fill": [Color(1, 1, 1, 0.045)], "border": [1, Color(1, 1, 1, 0.13)], "pad": 0 }
	var h: Dictionary = n.duplicate()
	if not spent:
		h["border"] = [1, Kit.a(_accent, 0.6)]
	var fr: Array = _choice_frame(n, h, hint)
	var b: Pane.PaneButton = fr[0]
	b.disabled = spent or _busy
	b.focus_mode = Control.FOCUS_NONE if spent else Control.FOCUS_ALL
	var row: HBoxContainer = HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 8)
	(fr[1] as MarginContainer).add_child(row)
	var words: VBoxContainer = _choice_words(row)
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var ink: Color = Color(0.89, 0.93, 0.96, 0.42) if spent else (Color("#f4ecd8") if warm else Color("#cfe0ec"))
	var l: Label = Kit.text(words, label, "body_strong", ink)
	l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	l.clip_text = true
	if hint != "":
		var hl: Label = Kit.text(words, hint, "note", Kit.a(ink, 0.6))
		hl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		hl.clip_text = true
	if tag != "":
		var chip: Pane = Kit.chip(row, tag, Color(0.89, 0.93, 0.96, 0.5) if spent else _accent, spent)
		chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if run.is_valid():
		b.pressed.connect(func() -> void:
			Rumble.tap(8)
			run.call())
	Kit.tap(b)
	_choices.add_child(b)
	return b


## You say something and they answer: the answer typed under your words.
func _say(you: String, they: String) -> void:
	_said.text = "You: %s" % you
	_said.visible = true
	_clear_choices()
	_line.say(they)


func _them(they: String) -> void:
	_said.visible = false
	_clear_choices()
	_line.say(they)


func _act(op: String) -> Variant:
	if _busy:
		return null
	_busy = true
	_err.visible = false
	_clear_choices()
	var r: Variant = await session.act(op, [folk["id"]])
	_busy = false
	if not r is Dictionary or (r as Dictionary).has("error"):
		_err.text = str((r as Dictionary).get("error", "They did not hear you.")) if r is Dictionary else "They did not hear you."
		_err.visible = true
		_show_choices()
		return null
	session.persist()
	return r


func _chat() -> void:
	var r: Variant = await _act("talkToFolk")
	if r == null:
		return
	_gain(r)
	rap["chattedToday"] = true
	_them(str(r["line"]))


func _ask() -> void:
	var r: Variant = await _act("askForFavourite")
	if r == null:
		return
	rap["want"] = { "fishId": r["fishId"], "name": r["fishName"] }
	rap["wantReady"] = false
	changed.emit(rap)
	_them(str(r["line"]))


func _deliver() -> void:
	var r: Variant = await _act("deliverToFolk")
	if r == null:
		return
	Rumble.buzz([0, 40, 60, 90])
	rap["giftsGiven"] = Js.num(rap.get("giftsGiven")) + 1.0
	rap["want"] = null
	rap["wantReady"] = false
	_gain(r)
	_them(str(r["line"]))


## Points moved: the bar slides from where it was, and a tier crossed puts up
## the crest.
func _gain(r: Dictionary) -> void:
	_gained = float(r["points"]) - Js.num(rap.get("points"))
	rap["points"] = r["points"]
	rap["tier"] = r["tier"]
	_draw_bar(true)
	(_card.find_child("Role", true, false) as Label).text = Folk.role_for(folk, int(r["tier"]))
	changed.emit(rap)
	if r.get("tierUp") != null:
		_raise_crest(int(r["tier"]), str(r["tierUp"]))


func _raise_crest(tier: int, said: String) -> void:
	Rumble.buzz([0, 40, 60, 90])
	Sound.chest(tier >= 4)
	_crest = Control.new()
	_crest.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_crest.mouse_filter = Control.MOUSE_FILTER_STOP
	_crest.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			_drop_crest())
	var bg: Pane = Pane.new({ "radius": 18, "fill": [Kit.BASE], "pad": 0 })
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_crest.add_child(bg)
	var rings: Rings = Rings.new()
	rings.color = _accent
	rings.count = 3 if tier >= 4 else 1
	rings.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rings.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_crest.add_child(rings)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_crest.add_child(center)
	var v: VBoxContainer = VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", 8)
	v.custom_minimum_size = Vector2(380, 0)
	center.add_child(v)
	var e1: Label = Kit.text(v, "You are now", "eyebrow", Kit.a(_accent, 0.8))
	e1.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var t: Label = Kit.glow(Kit.text(v, Folk.TIER_NAME[tier], "display", _accent.lightened(0.2)), _accent)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var q: Label = Kit.text(v, "“%s”" % said, "body", Color("#dbe8f2"), true)
	q.add_theme_font_override("font", Kit.italic())
	q.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var go: Button = Kit.button("Carry on", "accent", "large", _accent)
	go.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	go.custom_minimum_size.x = 180
	go.pressed.connect(_drop_crest)
	v.add_child(go)
	_card.add_child(_crest)
	_crest.top_level = false
	for i: int in v.get_child_count():
		Kit.stagger(v.get_child(i) as Control, i)
	go.grab_focus.call_deferred()
	get_tree().create_timer(9.0).timeout.connect(func() -> void:
		if is_instance_valid(_crest):
			_drop_crest())


func _drop_crest() -> void:
	if _crest == null:
		return
	_crest.queue_free()
	_crest = null
	if not _line.typing:
		_show_choices()


func _tap_outside() -> void:
	if _crest != null:
		_drop_crest()
	elif _line.typing:
		_line.finish()
	else:
		close()


## Back drops the crest first, then leaves.
func _back() -> void:
	if _crest != null:
		_drop_crest()
	else:
		close()


## THE BOND DEEPENING: rings going out from the middle, one for a rung, three
## for the top (slower and further), the web's crest.
class Rings:
	extends Control
	var color: Color = Color.WHITE
	var count: int = 1
	var _t: float = 0.0

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		var c: Vector2 = size / 2.0
		for i: int in count:
			var dur: float = 1.1 + i * 0.45
			var u: float = clampf((_t - i * 0.22) / dur, 0.0, 1.0)
			if u <= 0.0 or u >= 1.0:
				continue
			var e: float = 1.0 - pow(1.0 - u, 3.0)
			var r: float = 40.0 * lerpf(0.2, 2.6 + i * 0.5, e)
			draw_arc(c, r, 0.0, TAU, 96, Color(color, 0.9 * (1.0 - e)), 2.0, true)
