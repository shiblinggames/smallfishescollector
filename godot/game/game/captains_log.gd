class_name CaptainsLog
extends Control
## THE CAPTAIN'S LOG (Godot port of /achievements and /profile; core/journey.gd).
## A sheet of paper over the sea, opened by pressing your name at the top left:
##   CAPTAIN  who you are, in numbers: levels, the record, the rarest catches,
##            the crew you sail with, the hull under you
##   STORY    every stop on the campaign you have cleared, and where the trail
##            goes next (Finn's words live in the Journal, game/journal.gd)
##   JOURNEY  every goal, grouped by pursuit, how far along you are
## A crewmate's face in the Tavern opens their Captain page alone, read only.
## The web's AI voyage log is left out (Kong, 2026-10-05).

signal closed

## The captain read: yours, or a crewmate's (then `own` is false).
var store: CaptainStore
var uid: String
var own: bool = true
var view: String = "captain"
var _group: int = 0
var _body: VBoxContainer
var _sheet: Control

const KIND_COLOR: Dictionary = { "story": Color("#3f8a45"), "combat": Color("#b8562a"), "milestone": Color("#a07a24"), "shop": Color("#7a55b8") }
const KIND_LABEL: Dictionary = { "story": "Story", "combat": "Battle", "milestone": "Milestone", "shop": "Port of call" }


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.06, 0.45)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	add_child(shade)
	_sheet = Control.new()
	_sheet.anchor_left = 0.5
	_sheet.anchor_right = 0.5
	_sheet.anchor_bottom = 1.0
	_sheet.offset_left = -380.0
	_sheet.offset_right = 380.0
	_sheet.offset_top = 64.0
	_sheet.offset_bottom = -24.0
	add_child(_sheet)
	Paper.sheet(_sheet, 8.0)
	var margin: MarginContainer = MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, 34)
	margin.add_theme_constant_override("margin_top", 26)
	margin.add_theme_constant_override("margin_bottom", 24)
	_sheet.add_child(margin)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 6)
	col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 0)
	head.add_child(titles)
	var who: String = str(Js.nz(store.me(uid).get("username"), "Captain"))
	Paper.text(titles, "The Captain's Log" if own else "%s's papers" % who, "display", Paper.INK)
	Paper.text(titles, "Who you are, what has happened, and what is left to do." if own else "A crewmate's record, as their log has it.", "note", Paper.INK_SOFT)
	if own:
		for o: Array in [["captain", "Captain"], ["story", "Story"], ["journey", "Journey"]]:
			var b: Pane.PaneButton = Paper.button(o[1], o[0] == view)
			b.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
			b.pressed.connect(func() -> void:
				view = o[0]
				_rebuild())
			head.add_child(b)
	var x: Pane.PaneButton = Paper.button("Close  Esc")
	x.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	x.pressed.connect(close)
	head.add_child(x)
	Paper.rule(col)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	_body = VBoxContainer.new()
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 10)
	scroll.add_child(_body)
	_sheet.modulate.a = 0.0
	_sheet.position.y += 16.0
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_sheet, "modulate:a", 1.0, 0.2)
	tw.tween_property(_sheet, "position:y", _sheet.position.y - 16.0, 0.25).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_rebuild()


## The log of a crewmate's captain, read from their berth (never adopted as a
## session: nothing here writes, and nothing here rolls a die).
static func for_berth(ch: Charter, key: String) -> CaptainsLog:
	var log: CaptainsLog = CaptainsLog.new()
	log.own = false
	if ch.sessions.has(key):
		var s: Session = ch.sessions[key]
		log.store = s.store
		log.uid = s.uid
		return log
	var b: Dictionary = ch.berth_of(key)
	if b.is_empty():
		return null
	var loaded: Dictionary = SaveFile.deserialize(b["captain"], Captains._species())
	if loaded.has("error"):
		return null
	log.store = CaptainStore.new(loaded["save"])
	log.uid = loaded["save"]["uid"]
	return log


func close() -> void:
	if is_queued_for_deletion():
		return
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


func _rebuild() -> void:
	for c: Node in _body.get_children():
		c.queue_free()
	match view:
		"story": _build_story()
		"journey": _build_journey()
		_: _build_captain()


func _eyebrow(t: String) -> void:
	Paper.text(_body, t, "eyebrow", Paper.INK_SOFT)


# ── Captain ────────────────────────────────────────────────────────────────────

func _build_captain() -> void:
	var p: Dictionary = store.me(uid)
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 18)
	_body.add_child(top)
	var look: Dictionary = Skipper.look_of(p)
	var av: Avatar = Avatar.new()
	av.face = { "characterColor": look["color"], "hat": look["hat"], "bg": "#2a2018", "ring": "#8a6f42" }
	av.px = 96.0
	av.custom_minimum_size = Vector2(96, 96)
	av.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	top.add_child(av)
	var who: VBoxContainer = VBoxContainer.new()
	who.add_theme_constant_override("separation", 2)
	who.alignment = BoxContainer.ALIGNMENT_CENTER
	who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(who)
	Paper.text(who, str(Js.nz(p.get("username"), "Captain")), "title", Paper.INK)
	var fish: int = Rules.level_from_xp(Js.num(p.get("fishing_xp")))
	var nav: int = Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))
	Paper.text(who, "Fishing %d  ·  Navigation %d" % [fish, nav], "heading", Paper.INK)
	var stars: float = 0.0
	for v: float in Achievements._prestige(p):
		stars += v
	var have: int = Js.list(p.get("unlocked_badges")).size()
	var bits: Array = []
	if stars > 0.0:
		bits.append("%d prestige star%s" % [int(stars), "" if stars == 1.0 else "s"])
	bits.append("%d achievement points" % int(Achievements.points(store, uid)))
	bits.append("%d of %d badges" % [have, Achievements.defs().size()])
	Paper.text(who, "  ·  ".join(bits), "note", Paper.INK_SOFT)
	var hull: Dictionary = Hulls.hull(Hulls.tier_of(p))
	var ship: String = str(Js.nz(p.get("ship_name"), ""))
	Paper.text(who, "Sails the %s%s" % [str(hull.get("name", "Sloop")), (", the %s" % ship) if ship != "" else ""], "note", Paper.INK_SOFT)
	Paper.rule(_body)
	_eyebrow("The record")
	var grid: GridContainer = GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 34)
	grid.add_theme_constant_override("v_separation", 4)
	_body.add_child(grid)
	for r: Array in Journey.record(store, uid):
		var s: HBoxContainer = Paper.stat(grid, r[0], r[1])
		s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Paper.rule(_body)
	_eyebrow("Rarest catches")
	var fishes: Array = []
	for id: Variant in store.collection_ids(uid):
		var sp: Variant = store.species(float(id))
		if sp != null:
			fishes.append(sp)
	fishes.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return [-Js.num(a.get("bite_rarity")), -Js.num(a.get("catch_score")), a["name"]] < [-Js.num(b.get("bite_rarity")), -Js.num(b.get("catch_score")), b["name"]])
	if fishes.is_empty():
		Paper.text(_body, "Nothing in the logbook yet.", "note", Paper.INK_SOFT)
	else:
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		_body.add_child(row)
		for sp: Dictionary in fishes.slice(0, 6):
			var t: Paper.Tile = Paper.Tile.new()
			t.label = sp["name"]
			t.art = Skipper.fish_thumb(sp["name"])
			t.pigment = Paper.rarity(Js.num(sp.get("bite_rarity")))
			t.custom_minimum_size = Vector2(104, 100)
			t.mouse_filter = Control.MOUSE_FILTER_IGNORE
			row.add_child(t)
	Paper.rule(_body)
	var live: Array = Crew.live(store)
	_eyebrow("The crew  ·  %d aboard" % live.size())
	if live.is_empty():
		Paper.text(_body, "Nobody signed on yet.", "note", Paper.INK_SOFT)
		return
	var shown: Array = []
	var pick: Array = Js.list(p.get("showcase_crew_ids"))
	for c: Dictionary in live:
		if Js.includes(pick, c["id"]):
			shown.append(c)
	if shown.is_empty():
		shown = live.duplicate()
		shown.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			return [-Js.num(a.get("rarity")), -Js.num(a.get("xp"))] < [-Js.num(b.get("rarity")), -Js.num(b.get("xp"))])
	var crow: HBoxContainer = HBoxContainer.new()
	crow.add_theme_constant_override("separation", 8)
	_body.add_child(crow)
	for c: Dictionary in shown.slice(0, 6):
		var m: Dictionary = Crew._member(c, p)
		var t2: Paper.Tile = Paper.Tile.new()
		t2.label = str(m["name"])
		var fn: String = str(m["filename"])
		t2.art = Skipper.tex("card_thumbs/%s.png" % fn.get_basename()) if fn != "" else null
		t2.pigment = Paper.rarity(Js.num(c.get("rarity")))
		t2.corner = "Lv %d" % Crew.level(Js.num(c.get("xp")))
		t2.custom_minimum_size = Vector2(104, 108)
		t2.mouse_filter = Control.MOUSE_FILTER_IGNORE
		crow.add_child(t2)


# ── Story ──────────────────────────────────────────────────────────────────────

func _para(parent: Node, t: String, col: Color = Paper.INK) -> Label:
	var l: Label = Paper.text(parent, t, "body", col, true)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l


func _build_story() -> void:
	var st: Dictionary = Journey.story(store, uid)
	Paper.text(_body, "Every stop on the campaign you have put behind you. What Finn has told you on the dock is kept in the Journal.", "note", Paper.INK_SOFT, true)
	var done: Array = st["done"]
	_eyebrow("The Sunken Hand  ·  %d of %d stops" % [done.size(), st["total"]])
	if done.is_empty():
		Paper.text(_body, "The campaign water waits past the fog. Nothing cleared yet.", "note", Paper.INK_SOFT, true)
	for d: Dictionary in done:
		var v2: VBoxContainer = VBoxContainer.new()
		v2.add_theme_constant_override("separation", 2)
		_body.add_child(v2)
		var h: HBoxContainer = HBoxContainer.new()
		h.add_theme_constant_override("separation", 10)
		v2.add_child(h)
		Paper.text(h, str(d["label"]), "name", Paper.INK)
		Paper.text(h, KIND_LABEL[d["kind"]], "label", Kit.ink(KIND_COLOR[d["kind"]]))
		if str(d["text"]) != "":
			_para(v2, str(d["text"]), Paper.INK_SOFT)
	var nx: Dictionary = st["next"]
	if not nx.is_empty():
		Paper.rule(_body)
		_eyebrow("The trail continues")
		Paper.text(_body, str(nx["label"]), "name", Paper.INK)
		_para(_body, str(nx["text"]), Paper.INK_SOFT)


# ── Journey ────────────────────────────────────────────────────────────────────

func _build_journey() -> void:
	var gs: Array = Journey.groups(store, uid)
	var total: int = 0
	var got: int = 0
	for g: Dictionary in gs:
		total += (g["goals"] as Array).size()
		got += int(g["done"])
	Paper.text(_body, "%d of %d goals met. Each one is a badge; the Fishing Guide holds them all on one wall." % [got, total], "note", Paper.INK_SOFT, true)
	var picks: HFlowContainer = HFlowContainer.new()
	picks.add_theme_constant_override("h_separation", 6)
	picks.add_theme_constant_override("v_separation", 6)
	_body.add_child(picks)
	_group = clampi(_group, 0, gs.size() - 1)
	for i: int in gs.size():
		var g: Dictionary = gs[i]
		var b: Pane.PaneButton = Paper.button("%s  %d/%d" % [g["title"], g["done"], (g["goals"] as Array).size()], i == _group)
		b.pressed.connect(func() -> void:
			_group = i
			_rebuild())
		picks.add_child(b)
	var gr: Dictionary = gs[_group]
	Paper.rule(_body)
	Paper.text(_body, str(gr["title"]), "heading", Kit.ink(Color(str(gr["accent"]))))
	Paper.text(_body, str(gr["flavor"]), "note", Paper.INK_SOFT, true)
	var goals: Array = (gr["goals"] as Array).duplicate()
	# Nearest first: met goals sink to the bottom, the rest by how close.
	goals.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if a["done"] != b["done"]:
			return not a["done"]
		return _frac(a) > _frac(b))
	for g: Dictionary in goals:
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		row.modulate.a = 0.62 if g["done"] else 1.0
		_body.add_child(row)
		var pic: TextureRect = TextureRect.new()
		pic.texture = Skipper.tex(g["image"])
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.custom_minimum_size = Vector2(46, 46)
		if not g["done"]:
			pic.self_modulate = Color(0.55, 0.52, 0.5, 0.55)
		row.add_child(pic)
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 2)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(v)
		var h: HBoxContainer = HBoxContainer.new()
		v.add_child(h)
		var nm: Label = Paper.text(h, str(g["label"]), "name", Paper.INK)
		nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var right: String = "Earned" if g["done"] else ("%s / %s" % [Js.thousands(g["current"]), Js.thousands(g["target"])] if float(g["target"]) > 0.0 else "")
		if right != "":
			Paper.text(h, right, "small", Color("#3f7a45") if g["done"] else Paper.INK_SOFT)
		Paper.text(v, "%s  ·  %s, %d pt" % [g["desc"], str(g["difficulty"]).capitalize(), int(g["points"])], "note", Paper.INK_SOFT, true)
		if not g["done"] and float(g["target"]) > 0.0:
			var bar: Kit.Bar = Kit.bar(v, _frac(g), Kit.ink(Color(str(gr["accent"]))), true)
			bar.custom_minimum_size = Vector2(0, 5)


static func _frac(g: Dictionary) -> float:
	if g["done"]:
		return 1.0
	return float(g["current"]) / float(g["target"]) if float(g["target"]) > 0.0 else 0.0
