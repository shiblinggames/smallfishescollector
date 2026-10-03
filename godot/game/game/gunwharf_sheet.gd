class_name GunwharfSheet
extends Control
## THE GUNWHARF (Godot port; "where your ship lies at her berth, is refitted
## and armed for the campaign"), on the night paper. For now: your raid
## party's seats (who sails with you, the captain's hand first; one of each
## fish). Seats are Crew.assign (assignToRaid), parity-checked.

signal closed

var session: Session
var _body: VBoxContainer


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.06, 0.55)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	add_child(shade)
	var sheet: Control = Control.new()
	sheet.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	sheet.offset_left = -470
	sheet.offset_right = 470
	sheet.offset_top = -320
	sheet.offset_bottom = 320
	add_child(sheet)
	Paper.night = true
	Paper.sheet(sheet, 8.0)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 28)
	sheet.add_child(m)
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 10)
	m.add_child(_body)
	Paper.night = false
	_paint()


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


func _paint() -> void:
	Paper.night = true
	for c: Node in _body.get_children():
		c.queue_free()
	Paper.text(_body, "The Gunwharf", "display", Paper.ink())
	var st: Dictionary = RulesApi.run(session.store, session.uid, "getCrewState", [])
	var prof: Dictionary = session.profile()
	var slots: int = Crew.party_slots(prof)
	Paper.text(_body, "YOUR RAID PARTY  ·  %d SEAT%s" % [slots, "" if slots == 1 else "S"], "eyebrow", Paper.ink_soft())
	Paper.text(_body, "Who sails into a fight with you. The first seat is your right hand (full stats); the rest give 80%. One of each fish. Their orders are your crew cards in battle.", "small", Paper.ink_soft(), true)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_body.add_child(row)
	var roster: Array = st["roster"]
	for k: int in slots:
		var who: Dictionary = {}
		for mem: Dictionary in roster:
			if mem.get("raidSlot") != null and int(mem["raidSlot"]) == k:
				who = mem
		row.add_child(_seat(k, who, roster))
	Paper.rule(_body)
	Paper.text(_body, "The campaign's water is out past the Sea Gate, due north. The Sea Gate lets her out once your right hand is seated.", "small", Paper.ink_soft(), true)
	var x: Pane.PaneButton = Paper.button("Close  Esc")
	x.size_flags_horizontal = Control.SIZE_SHRINK_END
	x.pressed.connect(close)
	_body.add_child(x)
	Paper.night = false


func _seat(k: int, who: Dictionary, roster: Array) -> Control:
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	v.custom_minimum_size = Vector2(130, 0)
	var pic: TextureRect = TextureRect.new()
	pic.custom_minimum_size = Vector2(120, 120)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	if not who.is_empty():
		pic.texture = Skipper.tex("card_thumbs/%s.png" % str(who["filename"]).get_basename())
	v.add_child(pic)
	Paper.text(v, ("Right hand" if k == 0 else "Seat %d" % (k + 1)), "eyebrow", Paper.ink_soft())
	Paper.text(v, str(who.get("name", "Empty")), "body_strong", Paper.ink() if not who.is_empty() else Paper.ink_faint())
	var pick: OptionButton = OptionButton.new()
	pick.add_item("(empty)", 0)
	var ids: Array = [null]
	for mem: Dictionary in roster:
		pick.add_item("%s  ·  Lv %d" % [mem["name"], Crew.level(Js.num(mem.get("xp")))], ids.size())
		ids.append(mem["id"])
		if not who.is_empty() and mem["id"] == who["id"]:
			pick.select(ids.size() - 1)
	pick.item_selected.connect(func(i: int) -> void:
		var r: Variant
		if ids[i] == null:
			if not who.is_empty():
				r = await session.act("benchCrew", [who["id"]])
		else:
			r = await session.act("assignToRaid", [ids[i], float(k)])
		session.persist()
		if r is Dictionary and (r as Dictionary).has("error"):
			push_warning(str(r["error"]))
		_paint())
	v.add_child(pick)
	return v
