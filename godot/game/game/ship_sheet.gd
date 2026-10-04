class_name ShipSheet
extends Control
## YOUR SHIP (Godot port; the expedition row's Ship). The ship you sail north
## of the arch, on the night paper: her painting (the sea art the chart draws,
## or a worn ship skin's hull), her name and class, and what is still to come
## for her (the Gunwharf's refits and arms, crew seats). Esc or a press
## outside closes it.

signal closed

var session: Session


func _ready() -> void:
	Paper.night = true
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.06, 0.5)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	add_child(shade)
	var sheet: Control = Control.new()
	sheet.anchor_left = 0.5
	sheet.anchor_right = 0.5
	sheet.anchor_top = 0.5
	sheet.anchor_bottom = 0.5
	sheet.offset_left = -360.0
	sheet.offset_right = 360.0
	sheet.offset_top = -280.0
	sheet.offset_bottom = 280.0
	add_child(sheet)
	Paper.sheet(sheet, 8.0)
	var margin: MarginContainer = MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 30)
	sheet.add_child(margin)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	margin.add_child(col)
	var p: Dictionary = session.profile()
	var tier: int = clampi(int(Js.num(p.get("ship_tier"))), 2, 6)
	var def: Dictionary = {}
	for sd: Dictionary in Js.list(Rules.data().get("ships")):
		if int(sd["tier"]) == tier:
			def = sd
	var art: String = str(def.get("seaImageUrl", ""))
	for sk: Dictionary in Js.list(Rules.data().get("shipSkins")):
		if sk["id"] == p.get("equipped_ship_skin") and sk.get("imageByTier") != null and (sk["imageByTier"] as Dictionary).has(str(tier)):
			art = str(sk["imageByTier"][str(tier)])
	var head: HBoxContainer = HBoxContainer.new()
	col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 0)
	head.add_child(titles)
	Paper.text(titles, "Your ship", "eyebrow", Paper.ink_soft())
	Paper.text(titles, str(Js.nz(p.get("ship_name"), def.get("name", "Your ship"))), "display", Paper.ink())
	var x: Pane.PaneButton = Paper.button("Close  Esc")
	x.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	x.pressed.connect(close)
	head.add_child(x)
	var holder: Control = Control.new()
	holder.custom_minimum_size = Vector2(0, 300)
	col.add_child(holder)
	Paper.blot(holder, Color(0.36, 0.5, 0.6), 0.6)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex(art)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	holder.add_child(pic)
	Paper.stat(col, "Class", "%s  ·  tier %d of 6" % [def.get("name", "Sloop"), tier])
	Paper.rule(col)
	Paper.text(col, "She carries your crew past the Sea Gate. Seat her crew, mount her arms, fit her repair kit and build her ultimate at the Gunwharf.", "note", Paper.ink_soft(), true)
	Paper.night = false


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()
