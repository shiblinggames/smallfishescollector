class_name CrewChest
extends Control
## THE CREW CHEST (Kong, 2026-10-06: "super easy to use? And looks good?",
## then yes to this): a sheet of the light paper, the chest on the left and
## your hold on the right, three tabs (Raid items, Rods, Scrap). Every item
## is its own painting, frameless on the paper, its name, its rarity in words
## and how many. A click moves one copy across (the painting slides over);
## shift-click moves every copy you can spare. What cannot move says why on
## the tile itself, dimmed (mounted, the rod in your hand, a rod above your
## Fishing level). Scrap moves by an amount you set. The chest's last moves
## run along the foot. The rules: Charter.chest_run ("crewChest").

signal closed

const TABS: Array = [["items", "Raid items"], ["rods", "Rods"], ["scrap", "Scrap"]]
const TILE: Vector2 = Vector2(150, 176)
const RARITY_IDX: Dictionary = { "common": 0.0, "uncommon": 1.0, "rare": 2.0, "epic": 3.0, "legendary": 4.0, "ancient": 4.0 }

var session: Session
var _tab: String = "items"
var _body: VBoxContainer
var _left: Control
var _right: Control
var _chest: Dictionary = {}
var _said: String = ""
var _said_bad: bool = false
var _busy: bool = false
var _amount: Array = [10.0, 10.0]
var _parts: Dictionary = {}
## Where each tab's two lists were scrolled to (a repaint keeps them).
var _keep: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE shell every sheet shares (Paper.open): the day's paper.
	_parts = Paper.open(self, Paper.SHEET_WIDE, false, close, 28)
	_body = _parts["body"]
	_chest = Js.obj(Js.obj(session.save.get("charter")).get("chest"))
	# A crewmate's move reaches this game as a fresh save: shown at once.
	session.changed.connect(_on_changed)
	_paint()


func _on_changed() -> void:
	if _busy:
		return
	_chest = Js.obj(Js.obj(session.save.get("charter")).get("chest"))
	_paint()


func close() -> void:
	if Motion.closing(self):
		return
	if session.changed.is_connected(_on_changed):
		session.changed.disconnect(_on_changed)
	closed.emit()
	Paper.close(self, _parts)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


# ── The sheet ─────────────────────────────────────────────────────────────────

func _paint() -> void:
	# A repaint keeps both lists where they were.
	var shown: String = str(_body.get_meta("tab", ""))
	var k: int = 0
	for sc: Node in _body.find_children("", "ScrollContainer", true, false):
		_keep["%s/%d" % [shown, k]] = (sc as ScrollContainer).scroll_vertical
		k += 1
	_body.set_meta("tab", _tab)
	for c: Node in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	# THE shared header: the Charter over the title, Close on the right, the
	# tabs on their own row, the rule; the feedback line under it.
	Paper.header(_body, "The crew chest", str(Js.obj(session.save.get("charter")).get("name", "The Charter")), close, TABS, _tab, func(id: Variant) -> void:
		if _tab == String(id):
			return
		_tab = String(id)
		_said = ""
		_paint())
	var hint: String = {
		"items": "Click to move one copy. Shift-click moves every copy you can spare.",
		"rods": "Click to move one. Hooks and reels stay with their captain.",
		"scrap": "Set how much, then move it.",
	}[_tab]
	var said: Label = Paper.status_line(_body)
	if _said != "":
		Paper.say(said, _said, Paper.red() if _said_bad else Paper.green())
	else:
		said.text = hint
		said.modulate.a = 1.0
	var cols: HBoxContainer = HBoxContainer.new()
	cols.add_theme_constant_override("separation", 28)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_child(cols)
	_left = _column(cols, "In the chest")
	var rule: ColorRect = ColorRect.new()
	rule.color = Color(Paper.ink(), 0.16)
	rule.custom_minimum_size = Vector2(1, 0)
	cols.add_child(rule)
	_right = _column(cols, "Your hold")
	match _tab:
		"items": _items()
		"rods": _rods()
		"scrap": _scrap()
	_foot()
	k = 0
	for sc: Node in _body.find_children("", "ScrollContainer", true, false):
		(sc as ScrollContainer).set_deferred("scroll_vertical", int(_keep.get("%s/%d" % [_tab, k], 0)))
		k += 1


func _column(parent: Control, title: String) -> VBoxContainer:
	var v: VBoxContainer = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 8)
	parent.add_child(v)
	Paper.text(v, title, "heading", Paper.ink())
	return v


func _grid(col: Control) -> GridContainer:
	var sc: ScrollContainer = ScrollContainer.new()
	sc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(sc)
	var g: GridContainer = GridContainer.new()
	g.columns = 3
	g.add_theme_constant_override("h_separation", 10)
	g.add_theme_constant_override("v_separation", 10)
	sc.add_child(g)
	return g


func _empty(col: Control, t: String) -> void:
	var l: Label = Paper.text(col, t, "body", Paper.ink_faint(), true)
	l.size_flags_vertical = Control.SIZE_EXPAND_FILL


## One thing as a tile: its painting on the bare paper, its name, a line
## under it. `why` set: dimmed, the reason in place of the line, no click.
func _tile(g: GridContainer, tex: Texture2D, name_: String, sub: String, sub_col: Color, why: String, on_move: Callable) -> Button:
	var bt: Button = Button.new()
	bt.flat = true
	bt.custom_minimum_size = TILE
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.offset_left = 6
	v.offset_right = -6
	v.offset_top = 6
	v.offset_bottom = -6
	v.add_theme_constant_override("separation", 1)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bt.add_child(v)
	var pic: TextureRect = TextureRect.new()
	pic.name = "Pic"
	pic.texture = tex
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.custom_minimum_size = Vector2(0, 104)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(pic)
	var n: Label = Paper.text(v, name_, "body_strong", Paper.ink())
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	n.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var s: Label = Paper.text(v, why if why != "" else sub, "small", Paper.red() if why != "" else sub_col)
	s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	for c: Node in v.get_children():
		(c as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	if why != "":
		pic.modulate.a = 0.4
		n.modulate.a = 0.55
		bt.disabled = true
		bt.focus_mode = Control.FOCUS_NONE
		bt.mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN
	else:
		# Paper.Tile's feel: the painting swells under the pointer, a press
		# squeezes, a pad can reach it.
		CrewHall.art_hover(bt, pic, Kit.ink(Kit.GOLD))
		bt.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		bt.tooltip_text = "Click: move one.  Shift-click: move all you can."
		bt.pressed.connect(func() -> void:
			if _busy:
				return
			on_move.call(bt, Input.is_key_pressed(KEY_SHIFT)))
	g.add_child(bt)
	return bt


func _count_line(n: float, rarity: String) -> String:
	var out: String = rarity.capitalize() if rarity != "" else ""
	if n > 1.0:
		out = ("%s  ·  " % out if out != "" else "") + "x%d" % int(n)
	return out


## A rarity in words' colour: THE table's pigment (Paper.rarity), inked.
func _rarity_col(rarity: String) -> Color:
	return Paper.rarity(rarity).darkened(0.25) if Kit.rarity_key(rarity) != "" else Paper.ink_soft()


# ── Raid items ────────────────────────────────────────────────────────────────

func _items() -> void:
	var p: Dictionary = session.profile()
	var chest_items: Dictionary = Js.obj(_chest.get("items"))
	var g: GridContainer = _grid(_left)
	if chest_items.is_empty():
		g.get_parent().queue_free()
		_empty(_left, "No raid items in the chest yet.")
	for id: Variant in _sorted(chest_items.keys()):
		var it: Dictionary = Armory.item(str(id))
		var n: float = Js.num(chest_items[id])
		_tile(g, _item_tex(str(id)), str(it.get("name", id)), _count_line(n, str(it.get("rarity", ""))), _rarity_col(str(it.get("rarity", ""))), "",
			func(bt: Button, all: bool) -> void: _move(bt, "take", "item", str(id), int(n) if all else 1, _right))
	var held: Dictionary = {}
	for x: Variant in Js.list(p.get("raid_items")):
		held[str(x)] = int(held.get(str(x), 0)) + 1
	var mounted: Array = Js.list(p.get("equipped_raid_items"))
	var g2: GridContainer = _grid(_right)
	if held.is_empty():
		g2.get_parent().queue_free()
		_empty(_right, "You hold no raid items. They come from raid and dive crates.")
	for id2: Variant in _sorted(held.keys()):
		var it2: Dictionary = Armory.item(str(id2))
		var n2: int = int(held[id2])
		var spare: int = n2 - (1 if mounted.has(id2) else 0)
		var why: String = "Mounted on your ship" if spare <= 0 else ""
		var sub: String = _count_line(float(n2), str(it2.get("rarity", "")))
		if spare > 0 and spare < n2:
			sub += "  ·  1 mounted"
		_tile(g2, _item_tex(str(id2)), str(it2.get("name", id2)), sub, _rarity_col(str(it2.get("rarity", ""))), why,
			func(bt: Button, all: bool) -> void: _move(bt, "put", "item", str(id2), spare if all else 1, _left))


func _item_tex(id: String) -> Texture2D:
	return Skipper.tex(str(Armory.item(id).get("image", "")).trim_prefix("/"))


## Rarest first, then by name.
func _sorted(ids: Array) -> Array:
	var out: Array = ids.duplicate()
	out.sort_custom(func(a: Variant, b: Variant) -> bool:
		var ra: float = float(RARITY_IDX.get(str(Armory.item(str(a)).get("rarity", "")), 0.0))
		var rb: float = float(RARITY_IDX.get(str(Armory.item(str(b)).get("rarity", "")), 0.0))
		if ra != rb:
			return ra > rb
		return str(Armory.item(str(a)).get("name", a)) < str(Armory.item(str(b)).get("name", b)))
	return out


# ── Rods ──────────────────────────────────────────────────────────────────────

func _rod_req(rod: Dictionary) -> int:
	var shop: Dictionary = Js.obj(Js.obj(Rules.data().get("rodShop")).get(Js.key(float(rod["tier"]))))
	return int(Js.num(shop.get("levelReq")))


func _rod_tile(g: GridContainer, rod: Dictionary, n: float, why: String, sub_extra: String, move: Callable) -> void:
	var tier: float = float(rod["tier"])
	var sub: String = "Tier %d" % int(tier) + ("  ·  x%d" % int(n) if n > 1.0 else "") + sub_extra
	_tile(g, Skipper.tex("%s_thumb.png" % str(rod.get("slug", ""))), str(rod["name"]), sub, Paper.ink_soft(), why, move)


func _rods() -> void:
	var p: Dictionary = session.profile()
	var lvl: int = Rules.level_from_xp(Js.num(p.get("fishing_xp")))
	var chest_rods: Dictionary = Js.obj(_chest.get("rods"))
	var g: GridContainer = _grid(_left)
	if chest_rods.is_empty():
		g.get_parent().queue_free()
		_empty(_left, "No rods in the chest yet.")
	var ids: Array = chest_rods.keys()
	ids.sort_custom(func(a: Variant, b: Variant) -> bool: return float(Rules.rod_by_id(str(a)).get("tier", 0)) > float(Rules.rod_by_id(str(b)).get("tier", 0)))
	for id: Variant in ids:
		var rod: Dictionary = Rules.rod_by_id(str(id))
		if rod.is_empty():
			continue
		var req: int = _rod_req(rod)
		var n: float = Js.num(chest_rods[id])
		_rod_tile(g, rod, n, "Fishing Lv %d to take" % req if lvl < req else "", "",
			func(bt: Button, all: bool) -> void: _move(bt, "take", "rod", str(id), int(n) if all else 1, _right))
	var own: Dictionary = Js.obj(session.save.get("rodItems"))
	var g2: GridContainer = _grid(_right)
	var any: bool = false
	var ids2: Array = own.keys()
	ids2.sort_custom(func(a: Variant, b: Variant) -> bool: return float(Rules.rod_by_id(str(a)).get("tier", 0)) > float(Rules.rod_by_id(str(b)).get("tier", 0)))
	for id2: Variant in ids2:
		var rod2: Dictionary = Rules.rod_by_id(str(id2))
		var n2: float = Js.num(own[id2])
		if rod2.is_empty() or str(id2) == "bamboo" or n2 <= 0.0:
			continue
		any = true
		var fishing: bool = Js.num(p.get("rod_tier")) == float(rod2["tier"])
		var spare: int = int(n2) - (1 if fishing else 0)
		var why: String = ""
		if rod2.get("earnedOnly") == true:
			why = "Earned. It stays with you"
		elif spare <= 0:
			why = "In your hand now"
		_rod_tile(g2, rod2, n2, why, "  ·  1 in hand" if fishing and spare > 0 else "",
			func(bt: Button, all: bool) -> void: _move(bt, "put", "rod", str(id2), spare if all else 1, _left))
	if not any:
		g2.get_parent().queue_free()
		_empty(_right, "No spare rods. The bamboo rod never leaves you.")


# ── Scrap ─────────────────────────────────────────────────────────────────────

func _scrap() -> void:
	var have: float = Js.num(session.profile().get("forge_scrap"))
	var in_chest: float = Js.num(_chest.get("scrap"))
	_scrap_side(_left, in_chest, 0, "Take", "take", "The chest holds no scrap.")
	_scrap_side(_right, have, 1, "Put in", "put", "You have no scrap. Salvage spare raid items at the forge.")


func _scrap_side(col: Control, total: float, side: int, verb_label: String, verb: String, none: String) -> void:
	Paper.text(col, Js.thousands(total), "hero", Paper.ink())
	Paper.text(col, "forge scrap", "small", Paper.ink_soft())
	if total <= 0.0:
		_empty(col, none)
		return
	var amt: float = clampf(float(_amount[side]), 1.0, total)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	col.add_child(row)
	var sl: HSlider = HSlider.new()
	sl.min_value = 1.0
	sl.max_value = total
	sl.step = 1.0
	sl.value = amt
	sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(sl)
	var box: SpinBox = SpinBox.new()
	box.min_value = 1.0
	box.max_value = total
	box.step = 1.0
	box.value = amt
	box.custom_minimum_size = Vector2(96, 0)
	row.add_child(box)
	var go: Pane.PaneButton = Paper.button("%s %s" % [verb_label, Js.thousands(amt)], true)
	sl.value_changed.connect(func(v: float) -> void:
		_amount[side] = v
		box.set_value_no_signal(v)
		go.text = ("%s %s" % [verb_label, Js.thousands(v)]).to_upper())
	box.value_changed.connect(func(v: float) -> void:
		_amount[side] = v
		sl.set_value_no_signal(v)
		go.text = ("%s %s" % [verb_label, Js.thousands(v)]).to_upper())
	var all: Pane.PaneButton = Paper.button("All %s" % Js.thousands(total))
	all.pressed.connect(func() -> void:
		sl.value = total)
	var btns: HBoxContainer = HBoxContainer.new()
	btns.add_theme_constant_override("separation", 8)
	col.add_child(btns)
	btns.add_child(go)
	btns.add_child(all)
	go.pressed.connect(func() -> void:
		if _busy:
			return
		_busy = true
		var r: Variant = await session.act("crewChest", [verb, "scrap", "", float(_amount[side])])
		_done(r, "%s %s scrap." % ["Took" if verb == "take" else "Put in", Js.thousands(float(_amount[side]))]))


# ── Moving things ─────────────────────────────────────────────────────────────

## Move `n` copies across, one action each; the painting slides to the other
## side as the first goes.
func _move(bt: Button, verb: String, kind: String, id: String, n: int, to_col: Control) -> void:
	_busy = true
	_glide(bt, to_col)
	var r: Variant = null
	var moved: int = 0
	for i: int in maxi(1, n):
		r = await session.act("crewChest", [verb, kind, id])
		if r is Dictionary and (r as Dictionary).has("error"):
			break
		moved += 1
	var what: String = str(Armory.item(id).get("name", "")) if kind == "item" else str(Rules.rod_by_id(id).get("name", ""))
	var line: String = "%s %s%s." % ["Took" if verb == "take" else "Put in", what, "" if moved <= 1 else " x%d" % moved]
	if moved > 0 and r is Dictionary and (r as Dictionary).has("error"):
		r = { "chest": Js.obj(Js.obj(session.save.get("charter")).get("chest")) }
	_done(r, line)


func _done(r: Variant, ok_line: String) -> void:
	var d: Dictionary = r if r is Dictionary else {}
	_busy = false
	if d.has("error"):
		_said = str(d["error"])
		_said_bad = true
	else:
		_said = ok_line
		_said_bad = false
		Sound.plip()
	_chest = Js.obj(d.get("chest", Js.obj(Js.obj(session.save.get("charter")).get("chest"))))
	_paint()


## The tile's painting lifts off and slides to the other column.
func _glide(bt: Button, to_col: Control) -> void:
	var pic: TextureRect = bt.find_child("Pic", true, false)
	if pic == null or pic.texture == null:
		return
	var g: TextureRect = TextureRect.new()
	g.texture = pic.texture
	g.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	g.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	g.size = pic.size
	g.global_position = pic.global_position
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g.top_level = true
	add_child(g)
	var dest: Vector2 = to_col.global_position + Vector2(to_col.size.x / 2.0 - pic.size.x / 2.0, 60.0)
	var tw: Tween = g.create_tween().set_parallel()
	tw.tween_property(g, "global_position", dest, 0.32).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(g, "scale", Vector2(0.8, 0.8), 0.32)
	tw.tween_property(g, "modulate:a", 0.0, 0.14).set_delay(0.22)
	tw.chain().tween_callback(g.queue_free)


# ── The foot: the chest's last moves ──────────────────────────────────────────

func _foot() -> void:
	var log: Array = Js.list(_chest.get("log"))
	if log.is_empty():
		return
	var parts: PackedStringArray = []
	for e: Dictionary in log.slice(maxi(0, log.size() - 4)):
		parts.append("%s %s %s" % [e.get("by", "?"), "put in" if e.get("verb") == "put" else "took", e.get("what", "")])
	parts.reverse()
	Paper.rule(_body)
	var l: Label = Paper.text(_body, "Lately:  " + "   ·   ".join(parts), "small", Paper.ink_faint())
	l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
