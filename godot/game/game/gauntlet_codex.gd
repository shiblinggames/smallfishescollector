class_name GauntletCodex
extends Control
## THE CODEX (the web's SynergiesModal): every synergy a descent holds. A
## synergy (confluence) is two powers held together and then TAKEN when it is
## offered at a draft; the Don's convergences fuse two synergies. One taken
## for the first time is DISCOVERED for good (gauntlet_confluences_seen,
## shared by both descents); until then it is fogged.
##
##   THIS DIVE   (from inside a dive) what this captain's powers make: the
##               synergies online, the ones ready to be offered, the ones a
##               single power away (and which power).
##   ALL         every synergy of the descent, discovered or fogged, with its
##               recipe and what it does at each level.
## Flat, on the night side's browns. EMBEDDED (the entry screen's Codex tab):
## it fills the pane it is given, its cards one or two to a row.

const W: float = 1060.0

var variant: String = "davy"
var profile: Dictionary = {}
## This captain's run, when opened from inside a dive (boons, taken, takenCv).
var run_cap: Dictionary = {}
## Drawn inside a pane (its size set before it is added) rather than as a sheet.
var embedded: bool = false

var _box: Panel
var _scroll: ScrollContainer
var _list: VBoxContainer
var _tab: String = ""
var _tabs: HBoxContainer
var _tex: Dictionary = {}


func _ready() -> void:
	theme = UiTheme.make()
	_box = Panel.new()
	if embedded:
		mouse_filter = Control.MOUSE_FILTER_PASS
		_box.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
		_box.size = size
	else:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_STOP
		var scrim: ColorRect = ColorRect.new()
		scrim.color = Color(0, 0, 0, 0.66)
		scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(scrim)
		var vp: Vector2 = get_viewport_rect().size
		_box.add_theme_stylebox_override("panel", BattleLook.box(Dossier.FILL, Dossier.HAIR, 1, 18, 40.0, Color(0, 0, 0, 0.6)))
		_box.size = Vector2(minf(W, vp.x - 60.0), minf(760.0, vp.y - 60.0))
		_box.position = (vp - _box.size) / 2.0
	add_child(_box)
	var found: int = 0
	var all: Array = _all()
	for e: Dictionary in all:
		if _seen(str(e["id"])):
			found += 1
	var top: float = 0.0 if embedded else 42.0
	if not embedded:
		_text(Vector2(32, 24), "THE CODEX  ·  %s" % str(Gauntlet.NAMES[variant]).to_upper(), "karla", 800, 12, Dossier.SOFT)
		_text(Vector2(32, 42), "Synergies", "cinzel", 700, 30, Dossier.INK)
	_text(Vector2(8 if embedded else 32, top + (8.0 if embedded else 44.0)), "Discovered %d of %d.  Hold both powers of a pair, then take the synergy when a draft offers it. Its level is the lower of its two powers' tiers." % [found, all.size()], "karla", 500, 13, Dossier.SOFT, _box.size.x - (16.0 if embedded else 64.0))
	_tabs = HBoxContainer.new()
	_tabs.position = Vector2(_box.size.x - 360, 34)
	_tabs.size = Vector2(330, 40)
	_tabs.alignment = BoxContainer.ALIGNMENT_END
	_tabs.add_theme_constant_override("separation", 8)
	_box.add_child(_tabs)
	_scroll = ScrollContainer.new()
	_scroll.position = Vector2(0, 64) if embedded else Vector2(24, 128)
	_scroll.size = _box.size - (Vector2(0, 64) if embedded else Vector2(48, 200))
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_box.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.custom_minimum_size = Vector2(_scroll.size.x - 14.0, 0)
	_list.add_theme_constant_override("separation", 10)
	_scroll.add_child(_list)
	if not embedded:
		var close: Button = Kit.button("Done", "primary")
		close.custom_minimum_size = Vector2(150, 46)
		close.position = Vector2(_box.size.x - 182, _box.size.y - 62)
		close.pressed.connect(queue_free)
		_box.add_child(close)
	_tab = "dive" if not run_cap.is_empty() else "all"
	_paint()
	Pane.set_night(_box, true)


func _unhandled_input(ev: InputEvent) -> void:
	if embedded:
		return
	if ev is InputEventKey and (ev as InputEventKey).pressed and (ev as InputEventKey).keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		queue_free()


func _text(at: Vector2, s: String, family: String, weight: int, fs: int, c: Color, w: float = -1.0) -> Label:
	var l: Label = Label.new()
	l.text = s
	l.position = at
	l.add_theme_font_override("font", Kit.font(family, weight))
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", c)
	if w > 0.0:
		l.custom_minimum_size = Vector2(w, 0)
		l.size = Vector2(w, 0)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_box.add_child(l)
	return l


## The descent's synergies, then (the Don's) its convergences.
func _all() -> Array:
	var out: Array = []
	for c: Dictionary in Gauntlet.confluences():
		if Gauntlet.in_pool(c.get("gauntlet"), variant):
			out.append(c)
	for cv: Dictionary in Js.list(Gauntlet.t().get("convergences")):
		if Gauntlet.in_pool(cv.get("gauntlet"), variant):
			out.append(cv)
	return out


func _seen(id: String) -> bool:
	if Js.list(profile.get("gauntlet_confluences_seen")).has(id):
		return true
	return Js.list(run_cap.get("taken")).has(id) or Js.list(run_cap.get("takenCv")).has(id)


func _icon(path: Variant) -> Texture2D:
	var p: String = str(path if path != null else "").trim_prefix("/")
	if p == "":
		return null
	if not _tex.has(p):
		_tex[p] = Skipper.tex(p)
	return _tex[p]


func _paint() -> void:
	for c: Node in _tabs.get_children():
		c.queue_free()
	if not run_cap.is_empty():
		for t: Array in [["dive", "This dive"], ["all", "All synergies"]]:
			var b: Button = Kit.button(t[1], "primary" if _tab == t[0] else "secondary", "small")
			b.custom_minimum_size = Vector2(150, 38)
			var id: String = t[0]
			b.pressed.connect(func() -> void:
				_tab = id
				Sound.plip()
				_paint())
			_tabs.add_child(b)
	for c2: Node in _list.get_children():
		c2.queue_free()
	if _tab == "dive":
		_dive_tab()
	else:
		_all_tab()
	Pane.set_night(_list, true)


func _heading(t: String, sub: String = "") -> void:
	var h: Label = Kit.text(_list, t, "heading", Dossier.INK)
	h.add_theme_font_size_override("font_size", 17)
	if sub != "":
		Kit.text(_list, sub, "small", Dossier.SOFT, true)


func _grid() -> GridContainer:
	var g: GridContainer = GridContainer.new()
	g.columns = 3 if _list.custom_minimum_size.x > 900.0 else (2 if _list.custom_minimum_size.x > 560.0 else 1)
	g.add_theme_constant_override("h_separation", 10)
	g.add_theme_constant_override("v_separation", 10)
	_list.add_child(g)
	return g


func _all_tab() -> void:
	var confs: Array = _all().filter(func(e: Dictionary) -> bool: return e.has("requires") and Js.list(e["requires"]).size() > 0 and (e["requires"][0] as Dictionary).has("boonId"))
	var convs: Array = _all().filter(func(e: Dictionary) -> bool: return not confs.has(e))
	var crew: Array = confs.filter(func(e: Dictionary) -> bool: return e.get("coop", false))
	confs = confs.filter(func(e: Dictionary) -> bool: return not e.get("coop", false))
	_heading("Synergies", "Two powers, held together and taken at a draft.")
	var g: GridContainer = _grid()
	for c: Dictionary in confs:
		g.add_child(_entry(c, false, 0, ""))
	_heading("Bond powers", "Co-op dives only. Powers that reach your crewmates: tanks take the fire, healers mend, support lifts the others, gunners hit what the crew hits.")
	var gb: GridContainer = _grid()
	for b: Dictionary in Gauntlet.bonds():
		var e: Dictionary = { "id": b["id"], "name": b["name"], "image": b.get("image"),
			"levels": Js.list(b["tiers"]).map(func(t: Dictionary) -> Dictionary: return { "desc": t.get("desc", "") }) }
		var en: Control = _entry(e, false, 0, "%s  ·  %s" % [str(b.get("role", "")).capitalize(), str(Gauntlet.rarity(b)).capitalize()])
		gb.add_child(en)
	if not crew.is_empty():
		_heading("Crew synergies", "Co-op dives only. A bond power and a power: one captain may hold both, or two captains one each.")
		var gc: GridContainer = _grid()
		for c3: Dictionary in crew:
			gc.add_child(_entry(c3, false, 0, ""))
	if not convs.is_empty():
		_heading("Convergences", "Two synergies, both taken and online, fused. The Don's descent only.")
		var g2: GridContainer = _grid()
		for cv: Dictionary in convs:
			g2.add_child(_entry(cv, true, 0, ""))


func _dive_tab() -> void:
	var owned: Dictionary = Js.obj(run_cap.get("boons"))
	var taken: Array = Js.list(run_cap.get("taken"))
	var taken_cv: Array = Js.list(run_cap.get("takenCv"))
	var on: Array = []
	var ready: Array = []
	var near: Array = []
	for c: Dictionary in Gauntlet.confluences():
		if not Gauntlet.in_pool(c.get("gauntlet"), variant):
			continue
		var lv: int = Gauntlet.confluence_level(c, owned)
		if taken.has(c["id"]) and lv >= 1:
			on.append([c, false, lv, ""])
		elif lv >= 1:
			ready.append([c, false, lv, "Ready: a draft will offer it."])
		else:
			var halves: Array = Js.list(c["requires"]).map(func(r: Dictionary) -> String: return str(r["boonId"]))
			var held: Array = halves.filter(func(id: String) -> bool: return Js.num(owned.get(id)) >= 1.0)
			if held.size() == 1:
				var want: String = halves[0] if halves[1] == held[0] else halves[1]
				near.append([c, false, 0, "One away: take %s." % Gauntlet.boon_def(want).get("name", want)])
	for cv: Dictionary in Js.list(Gauntlet.t().get("convergences")):
		if not Gauntlet.in_pool(cv.get("gauntlet"), variant):
			continue
		var lv2: int = Gauntlet.convergence_level(cv, owned, taken)
		if taken_cv.has(cv["id"]) and lv2 >= 1:
			on.append([cv, true, lv2, ""])
		elif lv2 >= 1:
			ready.append([cv, true, lv2, "Ready: a draft will offer it."])
	for sec: Array in [["Online", "Taken, and both halves held.", on], ["Ready", "You hold both halves. Take it when a draft offers it.", ready], ["One away", "You hold one half.", near]]:
		_heading(sec[0], sec[1])
		if (sec[2] as Array).is_empty():
			Kit.text(_list, "None.", "small", Dossier.FAINT)
			continue
		var g: GridContainer = _grid()
		for it: Array in sec[2]:
			g.add_child(_entry(it[0], it[1], it[2], it[3]))


## One synergy's card: fogged until discovered.
func _entry(e: Dictionary, conv: bool, level: int, note: String) -> Control:
	var c: Entry = Entry.new()
	var cols: float = 3.0 if _list.custom_minimum_size.x > 900.0 else (2.0 if _list.custom_minimum_size.x > 560.0 else 1.0)
	c.custom_minimum_size = Vector2((_list.custom_minimum_size.x - 10.0 * (cols - 1.0)) / cols, 262)
	c.seen = _seen(str(e["id"])) or level > 0 or note != ""
	c.title = str(e["name"])
	c.icon = _icon(e.get("image"))
	c.conv = conv
	c.level = level
	c.note = note
	var halves: Array = []
	for r: Dictionary in Js.list(e.get("requires")):
		if r.has("boonId"):
			var b: Dictionary = Gauntlet.boon_def(str(r["boonId"]))
			halves.append([str(b.get("name", r["boonId"])), _icon(b.get("image"))])
		else:
			var cf: Dictionary = Gauntlet.confluence_def(str(r["confluenceId"]))
			halves.append([str(cf.get("name", r["confluenceId"])), _icon(cf.get("image"))])
	c.halves = halves
	c.levels = Js.list(e.get("levels")).map(func(l: Dictionary) -> String: return str(l.get("desc", "")))
	return c


class Entry:
	extends Control
	var seen: bool = false
	var title: String = ""
	var icon: Texture2D
	var conv: bool = false
	var level: int = 0
	var note: String = ""
	var halves: Array = []
	var levels: Array = []
	var _frames: int = 0

	func _process(_d: float) -> void:
		if _frames < 12:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var tone: Color = Color("#c79bff") if conv else Color("#8b9cff")
		BattleLook.draw_box(self, r, BattleLook.box(BattleLook.LACQUER_HI, Color(tone, 0.5) if level > 0 else Color(1, 1, 1, 0.07), 1, 14))
		var c: Vector2 = Vector2(48, 50)
		if not seen:
			draw_circle(c, 32.0, Color(0, 0, 0, 0.4))
			draw_arc(c, 32.0, 0.0, TAU, 40, Color(1, 1, 1, 0.12), 1.5, true)
			BattleLook.say(self, Kit.font("cinzel", 700), c.x, c.y + 9.0, "?", 26, Color(Dossier.FAINT, 0.9))
			draw_string(Kit.font("cinzel", 700), Vector2(92, 46), "Undiscovered", HORIZONTAL_ALIGNMENT_LEFT, size.x - 104, 16, Dossier.SOFT)
			draw_string(Kit.font("karla", 600), Vector2(92, 66), "A %s not yet taken." % ("convergence" if conv else "synergy"), HORIZONTAL_ALIGNMENT_LEFT, size.x - 104, 12, Dossier.FAINT)
			return
		draw_circle(c, 34.0, Color(tone, 0.14))
		if icon != null:
			draw_texture_rect(icon, Rect2(c - Vector2(30, 30), Vector2(60, 60)), false)
		var kick: String = ("Convergence" if conv else "Synergy") + (("  ·  Level %s" % Gauntlet.tier_label(level)) if level > 0 else "")
		draw_string(Kit.font("karla", 800), Vector2(92, 34), kick.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, size.x - 104, 10, tone)
		draw_multiline_string(Kit.font("cinzel", 700), Vector2(92, 54), title, HORIZONTAL_ALIGNMENT_LEFT, size.x - 104, 16, 2, Dossier.INK)
		# The recipe.
		var y: float = 104.0
		var x: float = 16.0
		for i: int in halves.size():
			var h: Array = halves[i]
			if h[1] != null:
				draw_texture_rect(h[1], Rect2(Vector2(x, y - 15), Vector2(20, 20)), false)
				x += 24.0
			var t: String = str(h[0])
			draw_string(Kit.font("karla", 700), Vector2(x, y), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Dossier.INK)
			x += Kit.font("karla", 700).get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x + 8.0
			if i == 0:
				draw_string(Kit.font("karla", 800), Vector2(x, y), "+", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Dossier.SOFT)
				x += 16.0
			if x > size.x - 60.0 and i == 0:
				x = 16.0
				y += 22.0
		y += 12.0
		# What it does at each level (the live one lit).
		for k: int in levels.size():
			var on: bool = level == k + 1
			var line: String = "%s  %s" % [Gauntlet.tier_label(k + 1), levels[k]]
			y += 4.0
			draw_multiline_string(Kit.font("karla", 700 if on else 600), Vector2(16, y + 12), line, HORIZONTAL_ALIGNMENT_LEFT, size.x - 32, 12, 2, tone.lightened(0.4) if on else Dossier.SOFT)
			y += 32.0
		if note != "":
			draw_string(Kit.font("karla", 800), Vector2(16, size.y - 14), note, HORIZONTAL_ALIGNMENT_LEFT, size.x - 32, 12, Dossier.WARN)
