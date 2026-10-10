class_name LoadoutView
extends HBoxContainer
## THE LOADOUT'S TWO HALVES (Godot port of app/(app)/sea/LoadoutBody.tsx, the
## wide layout, fishing pass 3).
##
## Left, the captain on the harbour backdrop, and a card for the thing under
## the pointer ("Trying on") or worn ("Equipped"). Right, the five slots (Rod,
## Look, Hat, Boat, Pet) with what each holds, a line on where to get more, and
## a grid of what you own: hover to try it on, press to wear it. Equip only;
## nothing is bought here, and nothing you do not own is listed.
##
## The slot data (what you own, what is worn, the names, the look tried on,
## the equip calls, where to get more) is the Locker's, read through
## LockerLoadout (game/locker_loadout.gd); this file only draws it in the
## Shipyard's dark style. It was a second copy of that logic until 2026-10-10.

signal changed

const LockerLoadout = preload("res://game/locker_loadout.gd")
const TABS: Array = [["rod", "Rod"], ["skin", "Look"], ["hat", "Hat"], ["boat", "Boat"], ["pet", "Pet"]]

var session: Session
var line_out: bool = false
var _slot: String = "rod"
var _preview: Skipper
var _card_title: Label
var _card_tag: Label
var _card_body: Label
var _tabs: HBoxContainer
var _how: Label
var _grid: GridContainer
var _error: Label


func _ready() -> void:
	add_theme_constant_override("separation", 18)
	custom_minimum_size = Vector2(0, 470)
	var left: VBoxContainer = VBoxContainer.new()
	left.custom_minimum_size = Vector2(430, 0)
	add_child(left)
	var stage: Panel = Panel.new()
	stage.custom_minimum_size = Vector2(430, 300)
	stage.clip_contents = true
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color("#0d1e2b")
	sb.set_corner_radius_all(22)
	stage.add_theme_stylebox_override("panel", sb)
	left.add_child(stage)
	var bg: TextureRect = TextureRect.new()
	bg.texture = Skipper.tex("welcome-harbour-open.webp")
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.modulate = Color(0.8, 0.85, 0.9)
	stage.add_child(bg)
	_preview = Skipper.new()
	_preview.box_scale = 1.9
	_preview.position = Vector2(245, 230)
	stage.add_child(_preview)
	_preview.set_look(Skipper.look_of(session.profile()))
	var card: VBoxContainer = VBoxContainer.new()
	left.add_child(card)
	var head: HBoxContainer = HBoxContainer.new()
	card.add_child(head)
	_card_title = Sheet.text(head, "", 18, Color("#f2ead8"), true)
	_card_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_card_tag = Sheet.text(head, "", 12, Color("#f0c040"), true)
	_card_body = Sheet.text(card, "", 13, Color("#9fb4c2"), false, true)

	var right: VBoxContainer = VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 10)
	add_child(right)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	right.add_child(_tabs)
	_how = Sheet.text(right, "", 13, Color(0.94, 0.75, 0.25, 0.8), false, true)
	_error = Sheet.text(right, "", 13, Color("#f0a890"), false, true)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 360)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	right.add_child(scroll)
	_grid = GridContainer.new()
	_grid.columns = 5
	_grid.add_theme_constant_override("h_separation", 8)
	_grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(_grid)
	_show(_slot)


func _name_for(slot: String) -> String:
	return LockerLoadout.name_for(session, slot, "")


func _worn(slot: String) -> Variant:
	return LockerLoadout.worn(session, slot, "")


func _show(slot: String) -> void:
	_slot = slot
	for c: Node in _tabs.get_children():
		c.queue_free()
	for t: Array in TABS:
		var on: bool = t[0] == slot
		var teal: Color = Color("#67d4e8")
		var n: Dictionary = { "radius": 10, "fill": [Color(teal, 0.12) if on else Color(0.024, 0.055, 0.086, 0.86)], "border": [1, Color(teal, 0.5) if on else Color(1, 1, 1, 0.14)], "pad": 0 }
		var hot: Dictionary = n.duplicate()
		hot["border"] = [1, Color(teal, 0.7) if on else Color(1, 1, 1, 0.3)]
		var b: Pane.PaneButton = Pane.PaneButton.new(n, hot)
		b.custom_minimum_size = Vector2(112, 52)
		var tv: VBoxContainer = VBoxContainer.new()
		tv.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		tv.alignment = BoxContainer.ALIGNMENT_CENTER
		tv.add_theme_constant_override("separation", 0)
		tv.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(tv)
		var k: Label = Kit.text(tv, t[1], "chip", Color(teal, 0.85) if on else Color(0.75, 0.83, 0.89, 0.55))
		k.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var vl: Label = Kit.text(tv, _name_for(t[0]), "small", Kit.INK if on else Color("#dfeaf2"))
		vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		vl.clip_text = true
		vl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		Kit.tap(b)
		b.pressed.connect(func() -> void: _show(t[0]))
		_tabs.add_child(b)
	_how.text = LockerLoadout.HOW_TO_GET[slot]
	_error.text = "Rods stay put while a line is in the water." if slot == "rod" and line_out else ""
	for c: Node in _grid.get_children():
		c.queue_free()
	var worn: Variant = _worn(slot)
	for o: Array in LockerLoadout.options(session, slot):
		var on: bool = (o[0] == null and worn == null) or (o[0] != null and worn != null and str(o[0]) == str(worn))
		var cn: Dictionary = Kit.tile(Kit.GOLD if on else Color("#67d4e8"), "active" if on else "owned", 0)
		var ch: Dictionary = cn.duplicate()
		ch["border"] = [1, Color(1, 1, 1, 0.28)]
		var cell: Pane.PaneButton = Pane.PaneButton.new(cn, ch)
		cell.custom_minimum_size = Vector2(112, 108)
		var cv: VBoxContainer = VBoxContainer.new()
		cv.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		cv.offset_left = 6
		cv.offset_right = -6
		cv.offset_top = 6
		cv.offset_bottom = -6
		cv.add_theme_constant_override("separation", 2)
		cv.mouse_filter = Control.MOUSE_FILTER_IGNORE
		cell.add_child(cv)
		if o[2] != "":
			if str(o[2]).begins_with("look:"):
				var lr: TextureRect = TextureRect.new()
				lr.texture = Skipper.look_art(str(o[2]).trim_prefix("look:"))
				lr.custom_minimum_size = Vector2(0, 66)
				lr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
				lr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
				lr.mouse_filter = Control.MOUSE_FILTER_IGNORE
				cv.add_child(lr)
			else:
				Kit.art(cv, o[2], Vector2(0, 66), Kit.GOLD if on else Color("#67d4e8"))
		var cl: Label = Kit.text(cv, o[1], "small", Kit.GOLD if on else Kit.INK_2)
		cl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cl.clip_text = true
		cl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		if on:
			var tag: Label = Kit.text(cv, "On", "chip", Kit.GOLD)
			tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		Kit.tap(cell)
		cell.mouse_entered.connect(func() -> void: _try_on(slot, o))
		cell.focus_entered.connect(func() -> void: _try_on(slot, o))
		cell.mouse_exited.connect(func() -> void: _try_on(slot, []))
		cell.pressed.connect(func() -> void: _choose(slot, o[0]))
		_grid.add_child(cell)
	_try_on(slot, [])


## The preview wears the item under the pointer, and the card says so.
func _try_on(slot: String, o: Array) -> void:
	var look: Dictionary = LockerLoadout.look_with(session, slot, o)
	var name: String = _name_for(slot)
	var trying: bool = not o.is_empty()
	if trying:
		name = o[1]
	_preview.set_look(look)
	_card_title.text = name
	_card_tag.text = "TRYING ON" if trying else "EQUIPPED"
	if slot == "rod":
		var tier: float = float(o[0]) if trying else Js.num(session.profile().get("rod_tier"))
		var r: Dictionary = Rules.rod(tier)
		var mine: Dictionary = Rules.rod(Js.num(session.profile().get("rod_tier")))
		var delta: float = Js.num(r.get("catchZoneBonus")) - Js.num(mine.get("catchZoneBonus"))
		_card_body.text = "%s\n%s" % [Kit.clean_copy(str(r.get("description", ""))), "Same catch zone as yours" if delta == 0.0 else "%+d° catch zone vs yours" % int(delta)]
	else:
		_card_body.text = "A look, not a stat. It changes how you appear on the water and nothing about the catch."


func _choose(slot: String, id: Variant) -> void:
	if slot == "rod" and line_out:
		return
	var r: Dictionary = await LockerLoadout.equip(session, slot, id)
	session.persist()
	_error.text = r.get("error", "")
	changed.emit()
	_show(slot)
