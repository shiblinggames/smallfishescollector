extends RefCounted
## Part of FishingHud: THE BAIT PICKER over the Bait button. Split out of
## game/fishing_hud.gd on 2026-10-10 for size; the HUD forwards
## _toggle_bait_picker().

## The HUD the picker rises on.
var h: FishingHud


func _init(hud: FishingHud) -> void:
	h = hud


var _picker: Control


## THE BAIT PICKER (Kong, 2026-10-01): a strip of paper rising over the Bait
## button with every bait aboard, pictured with its count and what it does;
## press one to put it on. Press the button again, or anywhere else, to close.
func _toggle_bait_picker() -> void:
	if _picker != null and is_instance_valid(_picker):
		_close_picker()
		return
	if h.phase != "idle" and h.phase != "result":
		h.toast("Bait goes on before the cast")
		return
	var held: Array = h.session.baits()
	if held.is_empty():
		h.toast("No bait aboard")
		return
	_picker = Control.new()
	_picker.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_picker.mouse_filter = Control.MOUSE_FILTER_STOP
	_picker.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and _picker != null:
			_close_picker())
	h.add_child(_picker)
	var card: Pane = Kit.pane(_picker, { "radius": 14, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.35)], "shadow": [Color(0, 0, 0, 0.4), 16, Vector2(0, 5)], "pad": [14, 12, 14, 12], "paper": true })
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	card.add_child(row)
	for b: Array in held:
		var def: Dictionary = Rules.bait(b[0])
		var t: Paper.Tile = Paper.Tile.new()
		t.on = b[0] == h._bait
		t.label = b[1]
		t.art = Skipper.tex(def.get("imageUrl"))
		t.pigment = Color(str(def.get("color", "#5f9fb0"))).darkened(0.15)
		t.corner = "×%s" % Js.thousands(float(b[2]))
		t.custom_minimum_size = Vector2(108, 104)
		var bonus: float = Js.num(def.get("catchZoneBonus"))
		var faster: float = 1.0 - float(def.get("waitMult", 1.0))
		t.tooltip_text = "%s%s" % [("+%d° catch zone  " % int(bonus)) if bonus > 0 else "", ("%d%% faster bites" % int(round(faster * 100.0))) if faster > 0.001 else ""]
		t.pressed.connect(func() -> void:
			h.set_bait(b[0])
			Rumble.tap(8)
			# Said where it happened: the bait pops on the Bait button.
			_pop_bait()
			if _picker != null:
				_close_picker())
		row.add_child(t)
	# Unseen until it is measured and placed.
	card.name = "Card"
	card.modulate.a = 0.0
	await h.get_tree().process_frame
	if _picker == null or not is_instance_valid(_picker):
		return
	var r: Rect2 = h._m_bait.get_global_rect()
	card.position = Vector2(clampf(r.position.x + r.size.x / 2.0 - card.size.x / 2.0, 12.0, h.size.x - card.size.x - 12.0), r.position.y - card.size.y - 10.0)
	card.position.y += 10.0
	var tw: Tween = card.create_tween().set_parallel()
	Motion.ease_fade(tw, card, "modulate:a", 1.0, 0.15)
	Motion.ease_rise(tw, card, "position:y", card.position.y - 10.0, 0.18)


## The picker goes: input stops at once, it fades and drops 6px, then is freed.
func _close_picker() -> void:
	var pk: Control = _picker
	_picker = null
	if pk == null or not is_instance_valid(pk):
		return
	pk.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var card: Control = pk.get_node_or_null("Card")
	if card == null or not pk.is_inside_tree():
		pk.queue_free()
		return
	var tw: Tween = pk.create_tween().set_parallel()
	Motion.ease_exit(tw, card, "modulate:a", 0.0, 0.12)
	Motion.ease_exit(tw, card, "position:y", card.position.y + 6.0, 0.12)
	tw.chain().tween_callback(pk.queue_free)


## The bait just put on pops on the Bait button.
func _pop_bait() -> void:
	if h._bait_icon == null or not h._bait_icon.is_inside_tree():
		return
	h._bait_icon.pivot_offset = h._bait_icon.size / 2.0
	h._bait_icon.scale = Vector2.ONE * 1.16
	Motion.ease_pop(h._bait_icon.create_tween(), h._bait_icon, "scale", Vector2.ONE, 0.22)
