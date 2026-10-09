class_name HomesteadRoom
extends Control
## THE HOMESTEAD (Godot port of /home's RoomView and its panels; core/
## homestead.gd), on the paper, when you tie up at your island. On the left
## the room you are in, painted, with what you have put in it standing where it
## stands: the house (its furniture), the gallery (badges you hang, and the
## Almanac's count), the menagerie (every pet you took in), the trophy room
## (the giants you landed). On the right: FURNISH the house's slots, BUILD the
## next rung, HANG badges in the gallery. The island's name is set at the top.
## Esc or a press outside closes it.

signal closed

var session: Session
var _body: VBoxContainer
var _room: String = "main"
var _side: String = "furnish"
var _flash: String = ""
var _parts: Dictionary = {}
var _scroll: ScrollContainer
## Where each side's list was scrolled to (a repaint keeps it).
var _keep: Dictionary = {}

const ROOM_W: float = 700.0
const ROOM_H: float = 700.0 * 666.0 / 1008.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE shell every sheet shares (Paper.open): the day's paper.
	_parts = Paper.open(self, Paper.SHEET_WIDE, false, close, 26)
	_body = _parts["body"]
	_paint()


func close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	Paper.close(self, _parts)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


func _h() -> Dictionary:
	return Homestead.of(session.store)


func _paint() -> void:
	if _scroll != null and is_instance_valid(_scroll):
		_keep[_scroll.get_meta("side", "")] = _scroll.scroll_vertical
	for c: Node in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	var h: Dictionary = _h()
	# THE shared header: the island over its name on the left; the name field,
	# Name it and Close on the right; the rule.
	var hd: Dictionary = Paper.header(_body, Homestead.name_of(h), "Your island  ·  %s" % str(Homestead.built(h)["name"]), close)
	var head: HBoxContainer = hd["right"]
	var field: LineEdit = LineEdit.new()
	field.placeholder_text = "Name your island"
	field.text = str(Js.nz(h.get("name"), ""))
	field.max_length = 24
	field.custom_minimum_size = Vector2(220, 0)
	field.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(field)
	var nb: Pane.PaneButton = Paper.button("Name it")
	nb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	nb.pressed.connect(func() -> void: _act("homesteadRename", [field.text], "Named."))
	field.text_submitted.connect(func(_t: String) -> void: nb.pressed.emit())
	head.add_child(nb)
	# The feedback line: reserved, so a message never pushes the rooms down.
	var status: Label = Paper.status_line(_body)
	if _flash != "":
		Paper.say(status, _flash.trim_prefix("!"), Paper.RED if _flash.begins_with("!") else Paper.GREEN)
		_flash = ""
	var cols: HBoxContainer = HBoxContainer.new()
	cols.add_theme_constant_override("separation", 24)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_child(cols)
	var left: VBoxContainer = VBoxContainer.new()
	left.add_theme_constant_override("separation", 8)
	cols.add_child(left)
	var rooms: HBoxContainer = HBoxContainer.new()
	rooms.add_theme_constant_override("separation", 6)
	left.add_child(rooms)
	for r: Dictionary in Homestead.data()["rooms"]:
		var open: bool = Homestead.tier(h) >= int(r["needsHouse"])
		var b: Pane.PaneButton = Paper.tab(str(r["name"]).trim_prefix("The ").capitalize() if open else "%s  ·  %s" % [str(r["name"]).trim_prefix("The ").capitalize(), Homestead.data()["house"][int(r["needsHouse"])]["name"]], _room == r["id"], false)
		b.disabled = not open
		var rid: String = r["id"]
		b.pressed.connect(func() -> void:
			_room = rid
			if rid == "gallery":
				_side = "hang"
			elif _side == "hang":
				_side = "furnish"
			_paint())
		rooms.add_child(b)
	left.add_child(_room_view(h))
	var room: Dictionary = {}
	for r: Dictionary in Homestead.data()["rooms"]:
		if r["id"] == _room:
			room = r
	Paper.text(left, str(room.get("blurb", "")), "small", Paper.INK_SOFT, true)
	var right: VBoxContainer = VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 8)
	cols.add_child(right)
	var tabs: HBoxContainer = HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 6)
	right.add_child(tabs)
	var sides: Array = [["furnish", "Furnish"], ["build", "Build"]]
	if Homestead.tier(h) >= 2:
		sides.append(["hang", "Hang badges"])
	for t: Array in sides:
		var tb: Pane.PaneButton = Paper.tab(t[1], _side == t[0], false)
		var sid: String = t[0]
		tb.pressed.connect(func() -> void:
			_side = sid
			_paint())
		tabs.add_child(tb)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	right.add_child(scroll)
	var list: VBoxContainer = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 6)
	scroll.add_child(list)
	match _side:
		"furnish": _furnish(list, h)
		"build": _build(list, h)
		"hang": _hang(list, h)
	_scroll = scroll
	_scroll.set_meta("side", _side)
	_scroll.set_deferred("scroll_vertical", int(_keep.get(_side, 0)))


# ── The room, painted ────────────────────────────────────────────────────────

func _pic(parent: Control, art: String, spot: Dictionary, anchor_bottom: bool, flip: bool = false) -> void:
	if art == "":
		return
	var t: Texture2D = Skipper.tex(art.trim_prefix("/"))
	if t == null:
		return
	var tr: TextureRect = TextureRect.new()
	tr.texture = t
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_SCALE
	var w: float = ROOM_W * float(spot["w"]) / 100.0
	var hh: float = w * float(t.get_height()) / float(t.get_width())
	tr.size = Vector2(w, hh)
	tr.position = Vector2(ROOM_W * float(spot["x"]) / 100.0 - w / 2.0, ROOM_H * float(spot["y"]) / 100.0 - (hh if anchor_bottom else hh / 2.0))
	tr.flip_h = flip
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(tr)


func _room_view(h: Dictionary) -> Control:
	var box: Control = Control.new()
	box.custom_minimum_size = Vector2(ROOM_W, ROOM_H)
	box.clip_contents = true
	var room: Dictionary = {}
	for r: Dictionary in Homestead.data()["rooms"]:
		if r["id"] == _room:
			room = r
	var t: int = Homestead.tier(h)
	var bg: TextureRect = TextureRect.new()
	bg.texture = Skipper.tex(Homestead.room_art(room, t).trim_prefix("/"))
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.size = Vector2(ROOM_W, ROOM_H)
	box.add_child(bg)
	var p: Dictionary = session.profile()
	match _room:
		"main":
			var spots: Dictionary = Homestead.room_spots(room, t)
			# Floor first, so what stands on it stands in front.
			for slot: String in ["floor", "hearth", "mount", "cornerL", "cornerR"]:
				if not Homestead.open_slots(h).has(slot) or not spots.has(slot):
					continue
				var it: Dictionary = Homestead.in_slot(h, slot)
				if it.get("art") != null:
					_pic(box, str(it["art"]), spots[slot], true)
		"gallery":
			var c: Dictionary = room["content"]
			var row: HBoxContainer = HBoxContainer.new()
			row.alignment = BoxContainer.ALIGNMENT_CENTER
			row.add_theme_constant_override("separation", 14)
			var w: float = ROOM_W * float(c["w"]) / 100.0
			row.size = Vector2(w, 120)
			row.position = Vector2(ROOM_W * float(c["x"]) / 100.0 - w / 2.0, ROOM_H * float(c["y"]) / 100.0 - 60.0)
			box.add_child(row)
			var defs: Dictionary = {}
			for d: Dictionary in Achievements.defs():
				defs[d["id"]] = d
			for id: Variant in h["pinned"]:
				var d: Dictionary = defs.get(id, {})
				var ic: TextureRect = TextureRect.new()
				ic.texture = Skipper.tex(str(d.get("imageUrl", "")).trim_prefix("/"))
				ic.custom_minimum_size = Vector2(84, 84)
				ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
				ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
				ic.tooltip_text = str(d.get("name", id))
				row.add_child(ic)
			var logged: int = session.store.collection_ids(session.uid).size()
			var total: int = (session.store.save["species"] as Array).size()
			var tag: Label = Paper.text(box, "%d of %d species logged" % [logged, total], "body_strong", Paper.INK)
			tag.position = Vector2(ROOM_W * 0.5 - 110.0, ROOM_H * 0.72)
			tag.size = Vector2(220, 30)
			tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			if (h["pinned"] as Array).is_empty():
				var e: Label = Paper.text(box, "The rail is bare. Hang badges from the right.", "small", Paper.INK_SOFT)
				e.position = Vector2(ROOM_W * 0.5 - 170.0, ROOM_H * 0.42)
				e.size = Vector2(340, 30)
				e.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		"menagerie":
			var spots: Dictionary = Homestead.data()["menagerie"]
			for id: Variant in Js.list(p.get("unlocked_pets")):
				var pt: Dictionary = Skipper._find("pets", id)
				if pt.is_empty():
					continue
				var sp: Dictionary = Js.obj(spots.get(str(id), Homestead.data()["menagerieFallback"]))
				_pic(box, str(pt.get("restImageUrl", "")), sp, true, sp.get("flip", false) == true)
		"trophy":
			var c: Dictionary = room["content"]
			var row: HBoxContainer = HBoxContainer.new()
			row.alignment = BoxContainer.ALIGNMENT_CENTER
			row.add_theme_constant_override("separation", 10)
			var w: float = ROOM_W * float(c["w"]) / 100.0
			row.size = Vector2(w, 130)
			row.position = Vector2(ROOM_W * float(c["x"]) / 100.0 - w / 2.0, ROOM_H * float(c["y"]) / 100.0 - 65.0)
			box.add_child(row)
			var landed: Array = Js.list(p.get("ancient_catches"))
			for f: Dictionary in session.store.save["species"]:
				if f["habitat"] == "ancient_deep" and Js.num(f.get("sell_value")) == 0.0 and landed.has(f["id"]):
					var ic: TextureRect = TextureRect.new()
					ic.texture = Skipper.fish_thumb(str(f["name"]))
					ic.custom_minimum_size = Vector2(100, 100)
					ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
					ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
					ic.tooltip_text = str(f["name"])
					row.add_child(ic)
			if row.get_child_count() == 0:
				var e: Label = Kit.lift(Paper.text(box, "No giant on the wall yet. They live in the Ancient Deep.", "small", Kit.SEA_INK))
				e.position = Vector2(ROOM_W * 0.5 - 200.0, ROOM_H * 0.4)
				e.size = Vector2(400, 30)
				e.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return box


# ── The panels ───────────────────────────────────────────────────────────────

func _furnish(list: VBoxContainer, h: Dictionary) -> void:
	var open: Array = Homestead.open_slots(h)
	var doubloons: float = Js.num(session.profile().get("doubloons"))
	for f: Dictionary in Homestead.data()["furniture"]:
		var slot: String = f["slot"]
		if not open.has(slot):
			var at: int = 0
			var slots: Array = Homestead.data()["slots"]
			for k: int in slots.size():
				if (Homestead.data()["furniture"] as Array).slice(0, int(slots[k])).any(func(x: Dictionary) -> bool: return x["slot"] == slot):
					at = k
					break
			Paper.text(list, "%s  ·  opens with %s" % [f["label"], str(Homestead.data()["house"][at]["name"]).to_lower()], "small", Paper.INK_FAINT)
			continue
		Paper.text(list, str(f["label"]).to_upper(), "eyebrow", Paper.INK_SOFT)
		var here: Dictionary = Homestead.in_slot(h, slot)
		for o: Dictionary in f["options"]:
			var row: HBoxContainer = HBoxContainer.new()
			row.add_theme_constant_override("separation", 8)
			list.add_child(row)
			var nm: Label = Paper.text(row, str(o["name"]), "body_strong" if here["id"] == o["id"] else "body", Paper.INK)
			nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var owned: bool = (h["owned"] as Array).has(o["id"])
			if here["id"] == o["id"]:
				Paper.text(row, "In place", "small", Paper.GREEN)
				continue
			var found: bool = o.get("found") != null
			if found and not owned:
				Paper.text(row, "Found on a far isle", "small", Paper.INK_FAINT)
				continue
			var cost: float = float(o["cost"])
			var b: Pane.PaneButton = Paper.button("Put it here" if owned or cost == 0.0 else "%s ⟡" % Js.thousands(cost))
			b.disabled = not owned and cost > doubloons
			var oid: String = o["id"]
			b.pressed.connect(func() -> void: _act("homesteadFurnish", [oid], "%s, in place." % o["name"]))
			row.add_child(b)


func _build(list: VBoxContainer, h: Dictionary) -> void:
	var t: int = Homestead.tier(h)
	var doubloons: float = Js.num(session.profile().get("doubloons"))
	var house: Array = Homestead.data()["house"]
	for k: int in house.size():
		var b: Dictionary = house[k]
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 1)
		list.add_child(v)
		var top: HBoxContainer = HBoxContainer.new()
		v.add_child(top)
		var nm: Label = Paper.text(top, str(b["name"]), "body_strong", Paper.INK if k <= t + 1 else Paper.INK_FAINT)
		nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if k <= t:
			Paper.text(top, "Standing", "small", Paper.GREEN)
		elif k == t + 1:
			var bb: Pane.PaneButton = Paper.button("Build  ·  %s ⟡" % Js.thousands(float(b["cost"])), true)
			bb.disabled = float(b["cost"]) > doubloons
			bb.pressed.connect(func() -> void: _act("homesteadBuild", [], "%s, built." % b["name"]))
			top.add_child(bb)
		else:
			Paper.text(top, "%s ⟡" % Js.thousands(float(b["cost"])), "small", Paper.INK_FAINT)
		Paper.text(v, str(b["blurb"]) + ("  " + str(b["adds"]) if str(b["adds"]) != "" else ""), "small", Paper.INK_SOFT if k <= t + 1 else Paper.INK_FAINT, true)
		var opens: Array = (Homestead.data()["rooms"] as Array).filter(func(r: Dictionary) -> bool: return int(r["needsHouse"]) == k and k > 0)
		if not opens.is_empty():
			Paper.text(v, "Opens %s." % str(opens[0]["name"]).to_lower(), "small", Paper.INK_SOFT)
		Paper.rule(list)


func _hang(list: VBoxContainer, h: Dictionary) -> void:
	var cap: int = int(Homestead.data()["pinnedMax"])
	var pinned: Array = (h["pinned"] as Array).duplicate()
	Paper.text(list, "Up to %d badges on the gallery's rail. Press one to hang it or take it down." % cap, "small", Paper.INK_SOFT, true)
	var earned: Array = Js.list(session.profile().get("unlocked_badges"))
	var grid: GridContainer = GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	list.add_child(grid)
	for d: Dictionary in Achievements.defs():
		if not earned.has(d["id"]):
			continue
		var on: bool = pinned.has(d["id"])
		var t: Paper.Tile = Paper.Tile.new()
		t.on = on
		t.label = str(d["name"])
		t.art = Skipper.tex(str(d.get("imageUrl", "")).trim_prefix("/"))
		t.pigment = Color(0.6, 0.48, 0.3)
		t.custom_minimum_size = Vector2(84, 96)
		var id: String = d["id"]
		t.pressed.connect(func() -> void:
			if pinned.has(id):
				pinned.erase(id)
			elif pinned.size() < cap:
				pinned.append(id)
			else:
				_flash = "!The rail holds %d. Take one down first." % cap
				_paint()
				return
			_act("homesteadPin", [pinned], ""))
		grid.add_child(t)
	if earned.is_empty():
		Paper.text(list, "Earn a badge and it can hang here.", "small", Paper.INK_FAINT)


func _act(op: String, args: Array, ok: String) -> void:
	var r: Variant = await session.act(op, args)
	session.persist()
	if r is Dictionary and (r as Dictionary).has("error"):
		Sound.slack()
		_flash = "!" + str(r["error"])
	else:
		if op == "homesteadBuild":
			Sound.chest(true)
		else:
			Sound.plip()
		_flash = ok
	_paint()
