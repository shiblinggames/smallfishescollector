class_name Ashore
extends Control
## GOING ASHORE AT THE MAINLAND (Godot port of MainlandAshore in
## app/(app)/sea/SeaMap.tsx and ashoreDoors.ts, docking): not a town screen but
## a picker over the chart, two rows of three doors. The Market and the Tackle
## Shop are built; the Tavern, the Parlor, the Den and the Chart Room come with
## their own slices and say so.

signal closed
signal chose(door: String)

## [key, name, blurb, cta, art, accent]
const ROWS: Array = [
	["Your crew, your catch, your gear", [
		["tavern", "The Tavern", "Other captains, the regulars and the day’s races", "Enter", "sea/tavern.png", "#e0a545"],
		["market", "The Market", "Sell the hold at full price", "Trade", "sea/market.png", "#7fd6a0"],
		["tackle", "Tackle Shop", "Rods, hooks, reels and bait", "Browse", "sea/tackle.png", "#67d4e8"],
	]],
	["Games and puzzles", [
		["parlor", "The Parlor", "Trivia for doubloons", "Sit in", "sea/parlor.png", "#dd8f79"],
		["den", "The Den", "Blackjack, slots and the wheel", "Play", "sea/den.png", "#d9534f"],
		["chart_room", "The Chart Room", "Weekly puzzles that uncover the World Chart", "Study", "sea/charting.png", "#6fc4b4"],
	]],
]
const BUILT: Array[String] = ["market", "tackle", "den", "parlor", "chart_room"]

var _card: Pane
var _first: Button = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = Kit.scrim(null)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	add_child(shade)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	_card = Pane.new(Kit.modal(Color(0.7, 0.84, 0.91), 22))
	_card.custom_minimum_size = Vector2(minf(720.0, get_viewport_rect().size.x - 40.0), 0)
	center.add_child(_card)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	_card.add_child(col)

	var head: HBoxContainer = HBoxContainer.new()
	col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 0)
	head.add_child(titles)
	Room.text(titles, "ASHORE AT THE MAINLAND", 11, Color(0.75, 0.84, 0.89, 0.85))
	Room.text(titles, "Where to?", 22, Color("#f4ecd8"), true)
	var x: Button = Kit.close_button()
	x.pressed.connect(close)
	head.add_child(x)

	var i: int = 0
	for row: Array in ROWS:
		Room.text(col, (row[0] as String).to_upper(), 11, Color(0.75, 0.84, 0.89, 0.7))
		var g: GridContainer = Room.grid(col, 3, 8)
		for d: Array in row[1]:
			var door: Button = _door(d)
			g.add_child(door)
			_stagger(door, i)
			i += 1
	if _first != null:
		_first.grab_focus.call_deferred()
	_card.pivot_offset = _card.custom_minimum_size / 2.0
	_card.modulate.a = 0.0
	_card.scale = Vector2.ONE * 0.94
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(_card, "modulate:a", 1.0, 0.18)
	tw.tween_property(_card, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## One door: art on a halo in the accent, the name, the blurb and the CTA.
func _door(d: Array) -> Button:
	var accent: Color = Color(d[5])
	var built: bool = BUILT.has(d[0])
	var dn: Dictionary = Kit.door(accent, 0)
	var dh: Dictionary = dn.duplicate()
	dh["border"] = [1, Color(accent, 0.7)]
	dh["shadow"] = [Color(accent, 0.18), 24]
	var b: Pane.PaneButton = Pane.PaneButton.new(dn, dh)
	b.custom_minimum_size = Vector2(0, 196)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Kit.tap(b)
	var inner: VBoxContainer = VBoxContainer.new()
	inner.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	inner.offset_top = 12
	inner.offset_bottom = -10
	inner.offset_left = 8
	inner.offset_right = -8
	inner.add_theme_constant_override("separation", 3)
	inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(inner)
	var art: Control = Control.new()
	art.custom_minimum_size = Vector2(0, 84)
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inner.add_child(art)
	var halo: TextureRect = TextureRect.new()
	halo.texture = Glow.radial(128, accent)
	halo.modulate.a = 0.35
	halo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	halo.set_anchors_preset(Control.PRESET_CENTER)
	halo.offset_left = -52
	halo.offset_right = 52
	halo.offset_top = -52
	halo.offset_bottom = 52
	halo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.add_child(halo)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex(d[4])
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.add_child(pic)
	var n: Label = Room.text(inner, d[1], 16, Color("#f0ede8"), true)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var bl: Label = Room.text(inner, d[2], 12, Color(accent, 0.87), false, true)
	bl.custom_minimum_size = Vector2(0, 0)
	bl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	bl.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var cta: Label = Room.text(inner, ("%s  ›" % d[3]).to_upper() if built else "NOT BUILT YET", 12, accent if built else Color("#6a6764"), true)
	cta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	for l: Label in [n, bl, cta]:
		l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if built:
		b.pressed.connect(func() -> void:
			Rumble.buzz([0, 16])
			chose.emit(d[0])
			close())
		if _first == null:
			_first = b
	else:
		b.disabled = true
		b.focus_mode = Control.FOCUS_NONE
		b.modulate = Color(1, 1, 1, 0.55)
	return b


func _stagger(c: Control, i: int) -> void:
	var goal: float = c.modulate.a
	c.modulate.a = 0.0
	var tw: Tween = create_tween()
	tw.tween_interval(0.04 + i * 0.05)
	tw.tween_property(c, "modulate:a", goal, 0.26).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func close() -> void:
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()
