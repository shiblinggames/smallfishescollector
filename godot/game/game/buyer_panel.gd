class_name BuyerPanel
extends Control
## HAILING A WATER'S BUYER (Godot port of app/(app)/sea/TraderPanel.tsx for a
## resident, docking): a card over the chart with their name and line, the
## offer (the whole hold at their rate), and Sell the hold or No thanks.
## Selling goes through Selling.sell_to_resident; the card then says what it
## paid. Escape, B, the backdrop or the X close it.

signal closed
signal sold

var session: Session
var info: Dictionary = {}
var _card: Pane
var _result: Label
var _sell: Button
var _busy: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = Kit.scrim(null)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	add_child(shade)

	_card = Pane.new(Kit.modal(Kit.SAND, 22))
	_card.anchor_left = 0.5
	_card.anchor_right = 0.5
	_card.anchor_top = 1.0
	_card.anchor_bottom = 1.0
	_card.offset_left = -250
	_card.offset_right = 250
	_card.offset_top = -330
	_card.offset_bottom = -30
	_card.grow_vertical = Control.GROW_DIRECTION_BEGIN
	add_child(_card)

	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	_card.add_child(col)
	var head: HBoxContainer = HBoxContainer.new()
	col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 2)
	head.add_child(titles)
	Sheet.text(titles, "BUYER", 11, Color(1.0, 0.84, 0.59, 0.85))
	Sheet.text(titles, info["name"], 25, Color("#f4ecd8"), true)
	var x: Button = Kit.close_button()
	x.pressed.connect(close)
	head.add_child(x)
	var line: Label = Sheet.text(col, info["line"], 15, Color("#c9d6de"), false, true)
	line.add_theme_font_override("font", _italic())

	var offer: Pane = Pane.new(Kit.inset(14))
	col.add_child(offer)
	var oc: VBoxContainer = VBoxContainer.new()
	oc.add_theme_constant_override("separation", 3)
	offer.add_child(oc)
	Sheet.text(oc, "Sell the whole hold", 17, Color("#f4ecd8"), true)
	Sheet.text(oc, "%d%% of market value" % int(Js.round(float(info["rate"]) * 100.0)), 16, Color("#f0c040"), true)
	Sheet.text(oc, "Paid now, right here.", 13, Color("#9fb4c2"))
	Sheet.text(oc, "The market ashore pays full price, but the catch has to be aboard when you get there.", 13, Color("#9fb4c2"), false, true)

	_result = Sheet.text(col, "", 15, Color("#7fd6a0"), false, true)
	_result.visible = false
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	col.add_child(row)
	_sell = Kit.button("Sell the hold", "primary")
	_sell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sell.pressed.connect(_do_sell)
	row.add_child(_sell)
	var no: Button = Kit.button("No thanks", "secondary")
	no.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	no.pressed.connect(close)
	row.add_child(no)
	_sell.grab_focus.call_deferred()

	_card.modulate.a = 0.0
	_card.offset_top += 24
	_card.offset_bottom += 24
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(_card, "modulate:a", 1.0, 0.15)
	tw.tween_property(_card, "offset_top", _card.offset_top - 24, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_card, "offset_bottom", _card.offset_bottom - 24, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


static func _italic() -> Font:
	var f: FontVariation = FontVariation.new()
	f.base_font = ThemeDB.fallback_font if UiTheme.make().default_font == null else UiTheme.make().default_font
	f.variation_transform = Transform2D(Vector2(1, 0), Vector2(0.2, 1), Vector2.ZERO)
	return f


func _do_sell() -> void:
	if _busy:
		return
	_busy = true
	_sell.text = "…"
	var r: Dictionary = await session.act("sellToResident", [info["zoneId"]])
	_busy = false
	_sell.text = "Sell the hold"
	_result.visible = true
	if r.has("error"):
		_result.add_theme_color_override("font_color", Color("#f8a2a2"))
		_result.text = r["error"]
		return
	session.persist()
	Rumble.buzz([0, 30, 40, 60])
	_result.add_theme_color_override("font_color", Color("#7fd6a0"))
	_result.text = "%s ⟡ for the lot. Hold's empty." % Js.thousands(float(r["earned"]))
	_sell.disabled = true
	sold.emit()


func close() -> void:
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()
