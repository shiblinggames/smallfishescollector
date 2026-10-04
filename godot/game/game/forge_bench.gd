class_name ForgeBench
extends Control
## THE FORGE ISLAND'S ANVIL (Godot port, the redesigned forge; core/forge.gd),
## on the night paper. Three tabs. THE ANVIL: two slots; fill both and they
## either take to each other (the result, both parts' effects beside it, what
## the forge takes, and Forge it) or they do not (remembered); two copies of a
## transmutable epic show its legendary. THE RECIPE BOOK: every recipe found,
## its parts against what you hold, the notes bought with Fathoms. YOUR ITEMS:
## each item with its copies and grade, Temper and Salvage. Esc steps back,
## then closes.

signal closed

var session: Session
var _body: VBoxContainer
var _tab: String = "anvil"
var _slots: Array = ["", ""]
## The slot being filled (-1 none).
var _picking: int = -1
var _outcome: Dictionary = {}
var _flash: String = ""
var _flash_col: Color = Color.WHITE

const GREEN: Color = Color(0.5, 0.86, 0.58)
const GOLD: Color = Color(0.94, 0.78, 0.4)
const RED: Color = Color(0.93, 0.48, 0.42)
const RARITY: Dictionary = { "rare": Color(0.45, 0.68, 0.95), "epic": Color(0.72, 0.5, 0.95), "legendary": Color(1.0, 0.75, 0.3), "ancient": Color(0.4, 0.9, 0.85) }


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
	sheet.offset_left = -590
	sheet.offset_right = 590
	sheet.offset_top = -400
	sheet.offset_bottom = 400
	add_child(sheet)
	Paper.night = true
	Paper.sheet(sheet, 8.0)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 26)
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
		if _picking >= 0:
			_picking = -1
			_paint()
			return
		close()


func _st() -> Dictionary:
	return RulesApi.run(session.store, session.uid, "forgeState", [])


func _say(t: String, col: Color = GREEN) -> void:
	_flash = t
	_flash_col = col


func _paint() -> void:
	Paper.night = true
	for c: Node in _body.get_children():
		c.queue_free()
	var st: Dictionary = _st()
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	_body.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.add_theme_constant_override("separation", 0)
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(titles)
	Paper.text(titles, "THE FORGE  ·  %s SCRAP  ·  %s FATHOMS" % [Js.thousands(float(st["scrap"])), Js.thousands(float(st["fathoms"]))], "eyebrow", Paper.ink_soft())
	Paper.text(titles, "The anvil", "display", Paper.ink())
	if st["forge"]:
		for t: Array in [["anvil", "Anvil"], ["book", "Recipe book  %d of %d" % [(st["book"] as Array).size(), int(st["total"])]], ["items", "Your items"]]:
			var tb: Pane.PaneButton = Paper.button(t[1], _tab == t[0])
			tb.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
			var id: String = t[0]
			tb.pressed.connect(func() -> void:
				_tab = id
				_picking = -1
				_flash = ""
				_paint())
			head.add_child(tb)
	var x: Pane.PaneButton = Paper.button("Close  Esc")
	x.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	x.pressed.connect(close)
	head.add_child(x)
	if not st["forge"]:
		Paper.text(_body, "The anvil is cold. The Forge opens in the Davy Jones Gauntlet's Locker.", "body", Paper.ink_soft(), true)
		Paper.text(_body, "Once it is lit: put two raid items on the anvil to find what they fuse into, forge what you find, temper spare copies to make an item stronger, and break unwanted copies into scrap.", "small", Paper.ink_soft(), true)
		Paper.night = false
		return
	if _flash != "":
		Paper.text(_body, _flash, "body_strong", _flash_col, true)
	match _tab:
		"anvil": _anvil(st)
		"book": _book(st)
		"items": _items(st)
	Paper.night = false


# ── Tiles ────────────────────────────────────────────────────────────────────

func _name(id: String) -> String:
	return str(Armory.item(id).get("name", id))


func _rcol(id: String) -> Color:
	return RARITY.get(str(Armory.item(id).get("rarity", "")), Color(0.6, 0.55, 0.5))


func _tile(id: String, px: Vector2, sub: String, on: bool = false) -> Button:
	var col: Color = _rcol(id) if id != "" else Color(1, 1, 1, 0.4)
	var bt: Button = Button.new()
	bt.flat = true
	bt.focus_mode = Control.FOCUS_NONE
	bt.custom_minimum_size = px
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(col, 0.08 if id != "" else 0.03)
	sb.border_color = Color(col, 0.95 if on else 0.5)
	sb.set_border_width_all(2 if on else 1)
	sb.set_corner_radius_all(10)
	var hv: StyleBoxFlat = sb.duplicate()
	hv.bg_color = Color(col, 0.16)
	hv.border_color = Color(col, 0.95)
	for k: String in ["normal", "disabled"]:
		bt.add_theme_stylebox_override(k, sb)
	for k: String in ["hover", "pressed"]:
		bt.add_theme_stylebox_override(k, hv)
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.offset_left = 6
	v.offset_right = -6
	v.offset_top = 6
	v.offset_bottom = -6
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_theme_constant_override("separation", 2)
	bt.add_child(v)
	if id == "":
		var e: Label = Paper.text(v, sub, "small", Paper.ink_faint(), true)
		e.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		return bt
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex(str(Armory.item(id).get("image", "")).trim_prefix("/"))
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(pic)
	var n: Label = Paper.text(v, _name(id), "small", Paper.ink(), true)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if sub != "":
		var s: Label = Paper.text(v, sub, "small", Paper.ink_soft())
		s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	for c: Node in v.get_children():
		(c as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	return bt


func _grade_tag(st: Dictionary, id: String) -> String:
	var g: int = int(Js.num(Js.obj(st["grades"]).get(id)))
	return "  +%d" % g if g > 0 else ""


## A bare picture of an item (lists, where the name is beside it).
func _icon(id: String, px: float) -> TextureRect:
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex(str(Armory.item(id).get("image", "")).trim_prefix("/"))
	pic.custom_minimum_size = Vector2(px, px)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return pic


## An item's lines; one with no passive effect (a drum) says what it does.
func _lines(id: String, grade: int) -> Array:
	var l: Array = Forge.lines(id, grade)
	if l.is_empty():
		l = [str(Armory.item(id).get("description", ""))]
	return l


## An item's effect lines, under a heading.
func _effects(parent: Control, heading: String, id: String, grade: int, col: Color = Color(0, 0, 0, 0)) -> void:
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 1)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(v)
	Paper.text(v, heading, "eyebrow", col if col.a > 0.0 else Paper.ink_soft())
	Paper.text(v, _name(id) + ("  +%d" % grade if grade > 0 else ""), "body_strong", _rcol(id))
	for l: Variant in _lines(id, grade):
		Paper.text(v, "·  " + str(l), "small", Paper.ink(), true)


# ── The anvil ────────────────────────────────────────────────────────────────

func _anvil(st: Dictionary) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	_body.add_child(row)
	for k: int in 2:
		var id: String = _slots[k]
		var sub: String = "%d held%s" % [int(Js.num(Js.obj(st["held"]).get(id))), _grade_tag(st, id)] if id != "" else "Press to put an item here"
		var b: Button = _tile(id, Vector2(170, 170), sub, _picking == k)
		var kk: int = k
		b.pressed.connect(func() -> void:
			_picking = -1 if _picking == kk else kk
			_paint())
		row.add_child(b)
		if k == 0:
			var plus: Label = Paper.text(row, "+", "display", Paper.ink_soft())
			plus.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var arrow: Label = Paper.text(row, "=", "display", Paper.ink_soft())
	arrow.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var res: String = str(_outcome.get("result", "")) if _outcome.get("fused", false) else ""
	row.add_child(_tile(res, Vector2(170, 170), "?" if _slots[0] == "" or _slots[1] == "" else ("Will not take" if res == "" else "")))
	if _picking >= 0:
		_picker(st)
		return
	if _slots[0] == "" or _slots[1] == "":
		Paper.text(_body, "Put two raid items on the anvil. If they fuse, the recipe goes into your book for good; if they will not take to each other, the anvil remembers. Two copies of some epic boss items transmute into their legendary.", "small", Paper.ink_soft(), true)
		return
	_preview(st)


func _picker(st: Dictionary) -> void:
	Paper.rule(_body)
	var other: String = _slots[1 - _picking]
	Paper.text(_body, "WHAT GOES ON THE ANVIL", "eyebrow", Paper.ink_soft())
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 8
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(grid)
	var held: Dictionary = st["held"]
	var ids: Array = held.keys()
	ids.sort_custom(func(a: String, b: String) -> bool: return _name(a) < _name(b))
	var known: Dictionary = {}
	for r: Dictionary in Forge.recipes():
		if Js.list(st["book"]).any(func(x: Dictionary) -> bool: return x["result"] == r["result"]):
			known[Forge.pair_key(str(r["components"][0]), str(r["components"][1]))] = true
	for id: String in ids:
		var tag: String = "×%d%s" % [int(held[id]), _grade_tag(st, id)]
		if other != "":
			var key: String = Forge.pair_key(other, id)
			if known.has(key):
				tag += "  ·  fuses"
			elif Js.list(st["tried"]).has(key):
				tag += "  ·  tried"
		var b: Button = _tile(id, Vector2(124, 132), tag)
		var pid: String = id
		b.pressed.connect(func() -> void:
			_slots[_picking] = pid
			_picking = -1
			_flash = ""
			_try())
		grid.add_child(b)
	if ids.is_empty():
		Paper.text(grid, "You hold no raid items yet. They come out of raid crates and gauntlet chests.", "small", Paper.ink_soft(), true)


func _try() -> void:
	_outcome = {}
	if _slots[0] != "" and _slots[1] != "":
		var r: Variant = await session.act("forgeTry", [_slots[0], _slots[1]])
		session.persist()
		if r is Dictionary:
			_outcome = r
			if r.get("discovered", false):
				Sound.chest(true)
				_say("Discovered: %s. It is in your recipe book now." % _name(str(r["result"])), GOLD)
	_paint()


func _preview(st: Dictionary) -> void:
	var kind: String = str(_outcome.get("kind", ""))
	var held: Dictionary = st["held"]
	var a: String = _slots[0]
	var b: String = _slots[1]
	match kind:
		"none":
			Paper.text(_body, "These two do not take to each other. The anvil will remember.", "body_strong", Paper.ink_soft(), true)
			return
		"abyssal_locked":
			Paper.text(_body, "These two would take, but only at the Abyssal Forge (the Don's Locker).", "body_strong", GOLD, true)
			return
		"transmute_locked":
			Paper.text(_body, "Two of these could become %s by Transmuting, once the Abyssal Accelerator is unlocked in the Don's Locker." % _name(str(_outcome["result"])), "body_strong", GOLD, true)
			return
	if not _outcome.get("fused", false):
		return
	var res: String = str(_outcome["result"])
	var cols: HBoxContainer = HBoxContainer.new()
	cols.add_theme_constant_override("separation", 22)
	_body.add_child(cols)
	var ga: int = int(Js.num(Js.obj(st["grades"]).get(a)))
	var gb: int = int(Js.num(Js.obj(st["grades"]).get(b)))
	_effects(cols, "IN", a, ga)
	if a != b:
		_effects(cols, "AND", b, gb)
	_effects(cols, "OUT", res, int(Js.num(Js.obj(st["grades"]).get(res))), GOLD)
	var act: HBoxContainer = HBoxContainer.new()
	act.add_theme_constant_override("separation", 12)
	_body.add_child(act)
	var warn: Array = []
	if kind == "transmute":
		var enough: bool = int(held.get(a, 0)) >= 2 and float(st["scrap"]) >= Forge.TRANSMUTE_SCRAP
		var tb: Pane.PaneButton = Paper.button("Transmute  ·  2 copies and %d scrap" % int(Forge.TRANSMUTE_SCRAP), enough)
		tb.disabled = not enough
		tb.pressed.connect(func() -> void: _do("forgeTransmute", [a], "Transmuted into %s." % _name(res)))
		act.add_child(tb)
		if int(held.get(a, 0)) < 2:
			warn.append("You hold one copy; transmuting takes two.")
	else:
		var need: Dictionary = Forge.counts([a, b])
		var enough: bool = true
		for id: String in need:
			if int(held.get(id, 0)) < int(need[id]):
				enough = false
		var fb: Pane.PaneButton = Paper.button("Forge it  ·  one copy of each part", enough)
		fb.disabled = not enough
		fb.pressed.connect(func() -> void: _do("forgeRaidItem", [res], "Forged: %s." % _name(res)))
		act.add_child(fb)
		for pid: String in need:
			if int(held.get(pid, 0)) == int(need[pid]):
				if int(Js.num(Js.obj(st["grades"]).get(pid))) > 0:
					warn.append("%s is your last copy: its +%d goes with it." % [_name(pid), int(Js.num(Js.obj(st["grades"]).get(pid)))])
				if Js.list(st["mounted"]).has(pid):
					warn.append("%s is your last copy and comes off its mount." % _name(pid))
	var tree: Array = _leaves(res)
	if tree.size() > 2:
		Paper.text(_body, "From the ground up it takes: %s." % ", ".join(tree.map(func(id: String) -> String: return _name(id))), "small", Paper.ink_soft(), true)
	for w: Variant in warn:
		Paper.text(_body, str(w), "small", RED, true)


## Every base drop behind a result (forgeBaseLeaves).
func _leaves(id: String) -> Array:
	var r: Dictionary = Forge.recipe(id)
	if r.is_empty():
		return [id]
	var out: Array = []
	for c: Variant in r["components"]:
		out += _leaves(str(c))
	return out


func _do(op: String, args: Array, ok: String) -> void:
	var r: Variant = await session.act(op, args)
	session.persist()
	if r is Dictionary and (r as Dictionary).get("ok") == true:
		Sound.chest(true)
		_say(ok)
		_slots = ["", ""]
		_outcome = {}
	else:
		Sound.slack()
		_say(str((r as Dictionary).get("error", "That did not work.")) if r is Dictionary else "That did not work.", RED)
	_paint()


# ── The book ─────────────────────────────────────────────────────────────────

func _book(st: Dictionary) -> void:
	var top: HBoxContainer = HBoxContainer.new()
	_body.add_child(top)
	var tl: Label = Paper.text(top, "%d RECIPES FOUND, %d STILL TO FIND" % [(st["book"] as Array).size(), int(st["undiscovered"])], "eyebrow", Paper.ink_soft())
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var nb: Pane.PaneButton = Paper.button("Buy a recipe note  ·  %d Fathoms" % int(Forge.NOTE_COST))
	nb.disabled = float(st["fathoms"]) < Forge.NOTE_COST or int(st["undiscovered"]) == 0
	nb.pressed.connect(func() -> void:
		var r: Variant = await session.act("forgeNote", [])
		session.persist()
		if r is Dictionary and (r as Dictionary).get("ok") == true:
			Sound.plip()
			_say("A note: %s and %s take to each other." % [_name(str(r["part"])), _name(str(r["with"]))], GOLD)
		else:
			Sound.slack()
			_say(str((r as Dictionary).get("error", "")) if r is Dictionary else "", RED)
		_paint())
	top.add_child(nb)
	var notes: Dictionary = st["notes"]
	var found: Array = (st["book"] as Array).map(func(x: Dictionary) -> String: return x["result"])
	for res: String in notes:
		if found.has(res):
			continue
		var n: Dictionary = notes[res]
		Paper.text(_body, "Note: %s and %s take to each other. Put them on the anvil." % [_name(str(n["part"])), _name(str(n["with"]))], "small", GOLD, true)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var list: VBoxContainer = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 8)
	scroll.add_child(list)
	if (st["book"] as Array).is_empty():
		Paper.text(list, "Nothing found yet. Try pairs on the anvil.", "small", Paper.ink_soft())
	for e: Dictionary in st["book"]:
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		list.add_child(row)
		var res: String = e["result"]
		row.add_child(_icon(res, 72))
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 1)
		row.add_child(v)
		Paper.text(v, _name(res) + ("  ·  Abyssal" if int(e["tier"]) == 3 else ""), "body_strong", _rcol(res))
		Paper.text(v, "  ·  ".join(_lines(res, 0)), "small", Paper.ink(), true)
		Paper.text(v, "From %s." % " and ".join((e["parts"] as Array).map(func(pt: Dictionary) -> String: return "%s (%d held)" % [_name(str(pt["id"])), int(pt["held"])])), "small", Paper.ink_soft(), true)
		var b: Pane.PaneButton = Paper.button("Put on the anvil")
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var parts: Array = e["parts"]
		b.pressed.connect(func() -> void:
			_slots = [str(parts[0]["id"]), str(parts[1]["id"])]
			_tab = "anvil"
			_flash = ""
			_try())
		row.add_child(b)


# ── Your items ───────────────────────────────────────────────────────────────

func _items(st: Dictionary) -> void:
	Paper.text(_body, "TEMPER spends a spare copy and scrap to raise an item a grade (+1 to +3); each grade adds a tenth to its bonus, and every copy you hold shares it. SALVAGE breaks a copy into scrap: rare 5, epic 10, legendary 25. Your last copy of a mounted item stays.", "small", Paper.ink_soft(), true)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var list: VBoxContainer = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 8)
	scroll.add_child(list)
	var held: Dictionary = st["held"]
	var ids: Array = held.keys()
	ids.sort_custom(func(a: String, b: String) -> bool: return int(held[a]) > int(held[b]) if int(held[a]) != int(held[b]) else _name(a) < _name(b))
	if ids.is_empty():
		Paper.text(list, "You hold no raid items yet.", "small", Paper.ink_soft())
	for id: String in ids:
		var g: int = int(Js.num(Js.obj(st["grades"]).get(id)))
		var n: int = int(held[id])
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		list.add_child(row)
		row.add_child(_icon(id, 64))
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 1)
		row.add_child(v)
		var mounted: bool = Js.list(st["mounted"]).has(id)
		Paper.text(v, "%s%s  ·  ×%d%s" % [_name(id), "  +%d" % g if g > 0 else "", n, "  ·  mounted" if mounted else ""], "body_strong", _rcol(id))
		var now: Array = _lines(id, g)
		var nxt: Array = _lines(id, g + 1) if g < Forge.MAX_GRADE else []
		Paper.text(v, "  ·  ".join(now), "small", Paper.ink(), true)
		if Forge.temperable(id) and not nxt.is_empty() and nxt != now:
			Paper.text(v, "At +%d:  %s" % [g + 1, "  ·  ".join(nxt)], "small", GOLD, true)
		if g < Forge.MAX_GRADE and Forge.temperable(id):
			var cost: float = float(Forge.TEMPER_SCRAP[g])
			var can: bool = n >= 2 and float(st["scrap"]) >= cost
			var tb: Pane.PaneButton = Paper.button("Temper to +%d  ·  a copy and %d scrap" % [g + 1, int(cost)])
			tb.disabled = not can
			tb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			var tid: String = id
			tb.pressed.connect(func() -> void: _do("forgeTemper", [tid], "%s tempered to +%d." % [_name(tid), g + 1]))
			row.add_child(tb)
		var worth: float = float(Forge.SALVAGE.get(str(Armory.item(id).get("rarity", "")), 0.0))
		if worth > 0.0:
			var sb: Pane.PaneButton = Paper.button("Salvage  ·  +%d scrap" % int(worth))
			sb.disabled = n == 1 and mounted
			sb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			var sid: String = id
			sb.pressed.connect(func() -> void: _do("forgeSalvage", [sid], "%s broken down for %d scrap." % [_name(sid), int(worth)]))
			row.add_child(sb)
