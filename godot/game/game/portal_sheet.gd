class_name PortalSheet
extends Control
## WHERE TO? (Godot port of the portal sheet and PortalMap.tsx, the rest of the
## sea, stage 5): opened by stepping through the Homestead Portal. One row of
## the five waters: the ones it reaches sail at a press, the next is priced
## with whether its stone is in hand, the rest are locked. Below it the
## crossing to the Anchorage, which the port does not reach yet. Pick a
## locked one and the footer says what it wants.

signal closed
## Sail there: the sea takes the passage.
signal sail(x: float, y: float, accent: Color)
## A rung was built (the well redraws).
signal built

var session: Session
var _board: HBoxContainer
var _foot: HBoxContainer
var _err: Label
var _sel: Variant = null
var _busy: bool = false
## The card and the dim, kept so close() can fade them out (Motion.dismiss).
var _card: Pane
var _scrim: ColorRect


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = Kit.scrim(self)
	_scrim = shade
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	var violet: Color = Color(0.66, 0.57, 1.0)
	var card: Pane = Kit.pane(center, Kit.modal(violet, 20))
	_card = card
	card.custom_minimum_size = Vector2(640, 0)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	card.add_child(col)
	var head: HBoxContainer = HBoxContainer.new()
	col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(titles)
	Kit.text(titles, "The Homestead Portal", "eyebrow", Kit.a(violet, 0.85))
	Kit.text(titles, "Where to?", "title", Kit.INK)
	var x: Button = Kit.close_button()
	x.pressed.connect(close)
	head.add_child(x)
	Kit.text(col, "The waters", "label", Kit.DIM)
	_board = HBoxContainer.new()
	_board.add_theme_constant_override("separation", 8)
	col.add_child(_board)
	Kit.text(col, "The crossing", "label", Kit.DIM)
	var cross: HBoxContainer = HBoxContainer.new()
	col.add_child(cross)
	var crossing: Button = _node("Anchorage", Color("#d9a45a"), _cross_art(), false, false, false, "Locked", func() -> void:
		_sel = "cross"
		_paint())
	crossing.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	crossing.custom_minimum_size.x = 116
	cross.add_child(crossing)
	_foot = HBoxContainer.new()
	_foot.add_theme_constant_override("separation", 12)
	col.add_child(_foot)
	_err = Kit.text(col, "", "small", Kit.DANGER_INK, true)
	_err.visible = false
	_paint()
	# The card was readied inside add_child (this is the sheet's own _ready),
	# so its ready signal has already gone: start the entrance here.
	Kit.modal_in(card)


func _tier() -> int:
	var t: Variant = session.profile().get("portal_tier")
	return 1 if t == null else int(Js.num(t))


func _stone_for(tier: int) -> bool:
	return Portal.has_stone_for(tier, session.save.get("discoveries", []))


func _cross_art() -> Texture2D:
	for p: Dictionary in Rules.data()["ports"]:
		if p["id"] == "crew_hall" and not (p["buildings"] as Array).is_empty():
			return Skipper.tex(p["buildings"][0]["art"])
	return null


## Rebuilds the board and foot. Not named _draw: that is the CanvasItem draw
## virtual, and the engine would rebuild the board on every redraw and resize.
func _paint() -> void:
	for c: Node in _board.get_children():
		c.queue_free()
	var tier: int = _tier()
	var first: Button = null
	for t: Dictionary in Portal.tiers():
		var n: int = int(t["tier"])
		var owned: bool = n <= tier
		var next: bool = n == tier + 1
		var note: String = "" if owned else ("%s ⟡" % _short(float(t["cost"])) if next else "Locked")
		var b: Button = _node(str(t["name"]).trim_prefix("The "), Color(str(t["accent"])), null, owned, not owned and not next,
			_sel is Dictionary and int((_sel as Dictionary)["tier"]) == n, note, func() -> void:
				if owned:
					_go(t)
				else:
					_sel = t
					_paint())
		_board.add_child(b)
		if first == null:
			first = b
	for c: Node in _foot.get_children():
		c.queue_free()
	if _sel != null:
		var accent: Color
		var name: String
		var line: String
		var act: Button = null
		if _sel is Dictionary:
			var t: Dictionary = _sel
			accent = Color(str(t["accent"]))
			name = t["name"]
			var need: int = int(Js.num((Rules.data()["zones"]["minLevel"] as Dictionary).get(t["band"]))) if not Js.obj(Rules.data().get("levelGates")).is_empty() else 0
			if int(t["tier"]) == tier + 1 and Rules.level_from_xp(Js.num(session.profile().get("fishing_xp"))) < need:
				line = "Locked  ·  Needs Fishing %d" % need
			elif int(t["tier"]) == tier + 1:
				var stone: bool = _stone_for(int(t["tier"]))
				line = "%s ⟡  ·  %s" % [Js.thousands(float(t["cost"])), "stone in hand" if stone else "needs the stone from %s" % t["name"]]
				act = Kit.button("Working…" if _busy else ("Build" if stone else "No stone"), "primary", "small")
				act.disabled = _busy or not stone
				act.modulate.a = 0.5 if act.disabled else 1.0
				act.pressed.connect(_build)
			else:
				line = "Build the waters before it first."
		else:
			accent = Color("#d9a45a")
			name = "The Anchorage"
			line = "Opens once you have sailed through the reef to the anchorage the long way."
		var dot: Pane = Pane.new({ "radius": 8, "fill": [accent], "pad": 0 })
		dot.custom_minimum_size = Vector2(16, 16)
		dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		_foot.add_child(dot)
		var words: VBoxContainer = VBoxContainer.new()
		words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_foot.add_child(words)
		Kit.text(words, name, "heading", Kit.INK)
		Kit.text(words, line, "small", Kit.DIM, true)
		if act != null:
			_foot.add_child(act)
	if first != null and get_viewport().gui_get_focus_owner() == null:
		first.grab_focus.call_deferred()


## One place to go: a round mark in its water's colour (or the berth's
## building, for the crossing), its name, and what it wants if anything.
func _node(label: String, accent: Color, art: Texture2D, owned: bool, dim: bool, on: bool, note: String, run: Callable) -> Button:
	var n: Dictionary = { "radius": 12, "fill": [Kit.a(accent, 0.12) if owned or on else Color(1, 1, 1, 0.03)], "border": [1, Kit.a(accent, 0.6) if on else (Kit.a(accent, 0.35) if owned else Color(1, 1, 1, 0.1))], "pad": 0 }
	var h: Dictionary = n.duplicate()
	h["border"] = [1, Kit.a(accent, 0.75)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.custom_minimum_size = Vector2(104, 112)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.modulate.a = 0.5 if dim else 1.0
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", 6)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(v)
	if art != null:
		var tr: TextureRect = TextureRect.new()
		tr.texture = art
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		tr.custom_minimum_size = Vector2(0, 54)
		tr.modulate = Color.WHITE if owned else Color(0.45, 0.45, 0.48)
		tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
		v.add_child(tr)
	else:
		var holder: CenterContainer = CenterContainer.new()
		holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		v.add_child(holder)
		var dot: Pane = Pane.new({ "radius": 15, "fill": [accent if owned else Kit.a(accent, 0.25)], "border": [2, Kit.a(accent.lightened(0.3), 0.8)], "shadow": [Kit.a(accent, 0.4 if owned else 0.0), 14], "pad": 0 })
		dot.custom_minimum_size = Vector2(30, 30)
		dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(dot)
	var l: Label = Kit.text(v, label, "name", Kit.INK if owned else Kit.DIM)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if note != "":
		var nl: Label = Kit.text(v, note, "small", Kit.GOLD if note.ends_with("⟡") else Kit.FAINT)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.pressed.connect(func() -> void:
		Rumble.tap(8)
		run.call())
	Kit.tap(b)
	return b


static func _short(n: float) -> String:
	return "%dk" % int(Js.round(n / 1000.0)) if n >= 1000.0 else str(int(n))


func _go(t: Dictionary) -> void:
	sail.emit(float(t["to"]["x"]), float(t["to"]["y"]), Color(str(t["accent"])))
	close()


func _build() -> void:
	if _busy:
		return
	_busy = true
	_err.visible = false
	_paint()
	var r: Variant = await session.act("buyPortalTier", [])
	_busy = false
	if not r is Dictionary or (r as Dictionary).has("error"):
		_err.text = str((r as Dictionary).get("error", "That did not go through. Try again.")) if r is Dictionary else "That did not go through. Try again."
		_err.visible = true
	else:
		session.persist()
		Rumble.buzz([0, 30, 40, 60])
		Sound.chest(true)
		_sel = null
		built.emit()
	_paint()


func close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	# The card and the dim fade out before it goes.
	Motion.dismiss(self, _card, _scrim)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()
