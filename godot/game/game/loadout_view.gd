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

signal changed

const HOW_TO_GET: Dictionary = {
	"rod": "Buy new rods at the Tackle Shop. Stronger ones unlock as your Fishing level climbs.",
	"skin": "Skins are bought with doubloons or gems, earned by levels and achievements, or found in crates.",
	"hat": "Hats are bought with doubloons. A few only come out of crates.",
	"boat": "Boats are bought with doubloons or gems, earned by levels and achievements, or found in crates.",
	"pet": "Pets come out of supply crates.",
}
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
	var p: Dictionary = session.profile()
	match slot:
		"rod":
			return String(Rules.rod(Js.num(p.get("rod_tier")))["name"])
		"hat":
			return String(Skipper._find("hats", p.get("equipped_hat")).get("name", "None"))
		"boat":
			return String(Skipper._find("boats", p.get("equipped_boat")).get("name", "Default"))
		"pet":
			return String(Skipper._find("pets", p.get("equipped_pet")).get("name", "None"))
		"skin":
			for c: Dictionary in Rules.data()["characterColors"]:
				if c["id"] == str(Js.nz(p.get("character_color"), "default")):
					return c["name"]
			return "Default"
	return ""


## What this captain owns for a slot: [id, name, art url] (null id = none).
func _options(slot: String) -> Array:
	var p: Dictionary = session.profile()
	var out: Array = []
	match slot:
		"rod":
			var tiers: Array = [0.0] + session.store.held_rod_tiers(session.uid)
			for t: Variant in tiers:
				var r: Dictionary = Rules.rod(float(t))
				out.append([float(t), r["name"], "%s_thumb.png" % r.get("slug", "")])
		"skin":
			var owned: Array = Js.list(p.get("unlocked_character_colors"))
			for c: Dictionary in Rules.data()["characterColors"]:
				if c["free"] or Js.includes(owned, c["id"]):
					out.append([c["id"], c["name"], "fishing_rest.png" if c["id"] == "default" else "fishing_%s_rest.png" % c["id"]])
		"hat":
			out.append([null, "No hat", ""])
			for id: Variant in Js.list(p.get("unlocked_hats")):
				var h: Dictionary = Skipper._find("hats", id)
				if not h.is_empty():
					out.append([id, h["name"], h["restImageUrl"]])
		"boat":
			for id: Variant in Js.list(p.get("unlocked_boats")):
				var b: Dictionary = Skipper._find("boats", id)
				if not b.is_empty():
					out.append([id, b["name"], b["restImageUrl"]])
		"pet":
			out.append([null, "No pet", ""])
			for id: Variant in Js.list(p.get("unlocked_pets")):
				var pt: Dictionary = Skipper._find("pets", id)
				if not pt.is_empty():
					out.append([id, pt["name"], pt["restImageUrl"]])
	return out


func _worn(slot: String) -> Variant:
	var p: Dictionary = session.profile()
	match slot:
		"rod":
			return Js.num(p.get("rod_tier"))
		"skin":
			return str(Js.nz(p.get("character_color"), "default"))
		"hat":
			return p.get("equipped_hat")
		"boat":
			return p.get("equipped_boat")
		"pet":
			return p.get("equipped_pet")
	return null


func _show(slot: String) -> void:
	_slot = slot
	for c: Node in _tabs.get_children():
		c.queue_free()
	for t: Array in TABS:
		var b: Button = Button.new()
		b.text = "%s\n%s" % [t[1], _name_for(t[0])]
		b.custom_minimum_size = Vector2(110, 56)
		b.add_theme_font_size_override("font_size", 13)
		if t[0] == slot:
			b.add_theme_color_override("font_color", Color("#67d4e8"))
		b.pressed.connect(func() -> void: _show(t[0]))
		_tabs.add_child(b)
	_how.text = HOW_TO_GET[slot]
	_error.text = "Rods stay put while a line is in the water." if slot == "rod" and line_out else ""
	for c: Node in _grid.get_children():
		c.queue_free()
	var worn: Variant = _worn(slot)
	for o: Array in _options(slot):
		var cell: Button = Button.new()
		cell.custom_minimum_size = Vector2(112, 104)
		cell.text = o[1]
		cell.icon = Skipper.tex(o[2]) if o[2] != "" else null
		cell.expand_icon = true
		cell.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cell.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
		cell.clip_text = true
		cell.add_theme_font_size_override("font_size", 11)
		var on: bool = (o[0] == null and worn == null) or (o[0] != null and worn != null and str(o[0]) == str(worn))
		if on:
			cell.add_theme_color_override("font_color", Color("#f0c040"))
			cell.text = "%s · On" % o[1]
		cell.mouse_entered.connect(func() -> void: _try_on(slot, o))
		cell.focus_entered.connect(func() -> void: _try_on(slot, o))
		cell.mouse_exited.connect(func() -> void: _try_on(slot, []))
		cell.pressed.connect(func() -> void: _choose(slot, o[0]))
		_grid.add_child(cell)
	_try_on(slot, [])


## The preview wears the item under the pointer, and the card says so.
func _try_on(slot: String, o: Array) -> void:
	var look: Dictionary = Skipper.look_of(session.profile())
	var name: String = _name_for(slot)
	var trying: bool = not o.is_empty()
	if trying:
		name = o[1]
		match slot:
			"rod":
				look["rodSlug"] = Rules.rod(float(o[0])).get("slug")
			"skin":
				look["color"] = o[0]
			"hat":
				look["hat"] = o[0]
			"boat":
				look["boat"] = o[0]
			"pet":
				look["pet"] = o[0]
	_preview.set_look(look)
	_card_title.text = name
	_card_tag.text = "TRYING ON" if trying else "EQUIPPED"
	if slot == "rod":
		var tier: float = float(o[0]) if trying else Js.num(session.profile().get("rod_tier"))
		var r: Dictionary = Rules.rod(tier)
		var mine: Dictionary = Rules.rod(Js.num(session.profile().get("rod_tier")))
		var delta: float = Js.num(r.get("catchZoneBonus")) - Js.num(mine.get("catchZoneBonus"))
		_card_body.text = "%s\n%s" % [r.get("description", ""), "Same catch zone as yours" if delta == 0.0 else "%+d° catch zone vs yours" % int(delta)]
	else:
		_card_body.text = "A look, not a stat. It changes how you appear on the water and nothing about the catch."


func _choose(slot: String, id: Variant) -> void:
	var r: Dictionary = {}
	match slot:
		"rod":
			if line_out:
				return
			r = await session.act("equipTackleRod", [float(id)])
		"skin":
			r = await session.act("updateCharacterColor", [id])
		"hat":
			r = await session.act("equipHat", [id])
		"boat":
			r = await session.act("equipBoat", [id])
		"pet":
			r = await session.act("equipPet", [id, "stern"])
	session.persist()
	_error.text = r.get("error", "")
	changed.emit()
	_show(slot)
