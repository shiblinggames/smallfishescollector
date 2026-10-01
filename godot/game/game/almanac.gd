class_name Almanac
extends Control
## THE ANGLER'S ALMANAC (Godot port of app/(app)/fishing/Almanac.tsx and its
## rooms, on the style kit).
##
## A book, not a dashboard: the dark paper under a wash, a header bar, the
## contents down the left, and five rooms. The Collection (by water, each a
## chapter heading whose rule is its progress, with the water's payout and
## prestige; and nine other ways to read the book), the Goldens, the Giants
## (the Long Vigil's wall and the release), the Pets, and the Stats. Specimens
## stand frameless on a halo of their rarity with a floor shadow; what is not
## caught yet is a silhouette. It re-reads the save every time it opens and
## after a claim or a prestige; closing it stamps the book as read, so NEW
## marks last the whole visit. The accent is the Almanac's violet; the ink is
## the kit's.

signal closed

const ZONES: Array = [["shallows", "Shallows", "#60a5fa"], ["open_waters", "Open Waters", "#34d399"], ["deep", "Deep", "#a78bfa"], ["abyss", "Abyss", "#f87171"], ["ancient_deep", "Ancient Deep", "#c084fc"]]
const RARITY_NAMES: Array[String] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"]
const VIEWS: Array = ["By Water", "Newly Logged", "Still Missing", "Trophies", "Goldens", "Most Caught", "Biggest", "Most Valuable", "Rarest", "Newest"]
const ACCENT: Color = Kit.VIOLET
const INK: Color = Kit.INK
const DIM: Color = Kit.DIM
const LOCKED: Color = Color("#7b7499")
const FAINT: Color = Color("#8a849a")
const CHAPTER: Color = Color("#f2ecdd")
const FRAME: Dictionary = {
	1: ["Rope and driftwood", "#c08a5a"], 2: ["Iron banding", "#b8c4d0"], 3: ["Verdigris brass", "#2dd4bf"],
	4: ["Blood-dark", "#e0455a"], 5: ["Struck in gold", "#fbcc4a"],
}
const TELL: Dictionary = {
	143: "Perfect or nothing, every phase. No dark to fight, just your own hands.",
	144: "The ring circles you the whole way down.",
	145: "The armored ram. Every phase comes faster than the last.",
	146: "It coils, and the ring rocks like a swell.",
	147: "It bears down: the ring drifts and the needle quickens together.",
	148: "The breathing jaw. The window closes and opens as you watch.",
}

var session: Session
var _d: Dictionary = {}
var _room: String = "Collection"
var _view: String = "By Water"
var _tabs: VBoxContainer
var _content: VBoxContainer
var _scroll: ScrollContainer
var _overlay: Control
var _book_w: float = 1240.0
## IN THE LOCKER (2026-10-01): the Log tab is this book, laid on the Locker's
## own sheet of paper. No frame, no header, no close of its own; it fills
## what it is given, book_w wide.
var embedded: bool = false
var book_w: float = 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var book: Control = Control.new()
	var x: Button = null
	if embedded:
		_book_w = book_w if book_w > 0.0 else size.x
		book.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		book.set_meta("paper", true)
		add_child(book)
	else:
		var base: ColorRect = ColorRect.new()
		base.color = Color("#0a090d")
		base.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(base)
		# The book: as wide as reads well (1,240), on paper.
		_book_w = minf(1240.0, get_viewport_rect().size.x)
		book.anchor_left = 0.5
		book.anchor_right = 0.5
		book.anchor_bottom = 1.0
		book.offset_left = -_book_w / 2.0
		book.offset_right = _book_w / 2.0
		book.set_meta("paper", true)
		add_child(book)
		Paper.sheet(book, 6.0)
	var col: VBoxContainer = VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.add_theme_constant_override("separation", 0)
	book.add_child(col)

	if not embedded:
		# The header bar.
		var bar: Pane = Kit.pane(col, { "radius": 0, "fill": [Color(0.039, 0.035, 0.051, 0.9), Color(0.039, 0.035, 0.051, 0.72)], "pad": [18, 12, 16, 12] })
		var head: HBoxContainer = HBoxContainer.new()
		bar.add_child(head)
		var titles: VBoxContainer = VBoxContainer.new()
		titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		titles.add_theme_constant_override("separation", 0)
		head.add_child(titles)
		var crew_name: Variant = Js.obj(session.save.get("charter")).get("name")
		Kit.text(titles, "Fishing" if crew_name == null else "%s · the crew's book" % crew_name, "eyebrow", Kit.a(ACCENT, 0.72))
		Kit.text(titles, "The Angler's Almanac", "title", INK)
		x = Kit.close_button()
		x.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		x.pressed.connect(close)
		head.add_child(x)
		var line: ColorRect = ColorRect.new()
		line.color = Color(Kit.PAPER_INK, 0.18)
		line.custom_minimum_size = Vector2(0, 1)
		col.add_child(line)

	var body: HBoxContainer = HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 0)
	col.add_child(body)
	# The contents, down the left, as a book's contents page is.
	var rail: Pane = Kit.pane(body, { "radius": 0, "angle": 90.0, "fill": [Color(0.039, 0.035, 0.051, 0.74), Color(0.039, 0.035, 0.051, 0.34)], "pad": [11, 14, 11, 14] })
	rail.custom_minimum_size = Vector2(208, 0)
	_tabs = VBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 4)
	rail.add_child(_tabs)
	var rule: ColorRect = ColorRect.new()
	rule.color = Color(Kit.PAPER_INK, 0.18)
	rule.custom_minimum_size = Vector2(1, 0)
	body.add_child(rule)
	_scroll = ScrollContainer.new()
	_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(_scroll)
	var pad: MarginContainer = MarginContainer.new()
	pad.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pad.add_theme_constant_override("margin_left", 22)
	pad.add_theme_constant_override("margin_right", 22)
	pad.add_theme_constant_override("margin_top", 18)
	pad.add_theme_constant_override("margin_bottom", 34)
	_scroll.add_child(pad)
	_content = VBoxContainer.new()
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content.add_theme_constant_override("separation", 10)
	pad.add_child(_content)
	_reload()
	if x != null:
		x.grab_focus.call_deferred()


func close() -> void:
	mark_read()
	closed.emit()
	queue_free()


## Stamp the book as read (closing it, or leaving the Locker's Log tab).
func mark_read() -> void:
	session.act("markAlmanacViewed")
	session.persist()


func _unhandled_input(event: InputEvent) -> void:
	if embedded and _overlay == null:
		return
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		if _overlay != null:
			_close_overlay()
		else:
			close()


func _reload() -> void:
	_d = AlmanacData.build(session.store, session.uid)
	_draw_tabs()
	_draw_room()


func _t(parent: Control, text: String, role: String, col: Color = INK, wrap: bool = false) -> Label:
	return Kit.text(parent, text, role, col, wrap)


## A chapter heading's type: Cinzel at its heaviest.
func _chapter(parent: Control, text: String) -> Label:
	var l: Label = _t(parent, text, "heading", CHAPTER)
	l.add_theme_font_override("font", Kit.font("cinzel", 800))
	l.add_theme_font_size_override("font_size", 21)
	return l


func _gap(parent: Control, h: float) -> void:
	var c: Control = Control.new()
	c.custom_minimum_size = Vector2(0, h)
	parent.add_child(c)


func _entries(filter: Callable) -> Array:
	var out: Array = []
	for e: Dictionary in _d["entries"]:
		if filter.call(e):
			out.append(e)
	return out


func _not_giant(e: Dictionary) -> bool:
	return not AlmanacData.is_giant(e)


static func _art(name: String) -> String:
	return "fish/%s" % ResultCard.fish_art_path(name).get_file()


## The width the room's content has to lay out in.
func _content_w() -> float:
	return _book_w - 208.0 - 1.0 - 44.0 - 12.0


func _draw_tabs() -> void:
	for c: Node in _tabs.get_children():
		c.queue_free()
	var fish: Array = _entries(_not_giant)
	var caught: int = 0
	for e: Dictionary in fish:
		if e["everCaught"]:
			caught += 1
	var unsold: int = 0
	for g: Dictionary in _d["goldens"]:
		if g["status"] != "sold":
			unsold += 1
	var owned_pets: int = (_d["unlockedPets"] as Array).size()
	var labels: Array = [
		["Collection", "%d/%d%s" % [caught, fish.size(), (" · %d new" % int(_d["newCount"])) if int(_d["newCount"]) > 0 else ""]],
		["Goldens", str(unsold)],
		["Giants", "%d/6" % (_d["ancientCatches"] as Array).size()],
		["Pets", "%d/%d" % [owned_pets, (Rules.data()["pets"] as Array).size()]],
		["Stats", ""],
	]
	for l: Array in labels:
		var on: bool = l[0] == _room
		var n: Dictionary = { "radius": 9, "fill": [Kit.a(ACCENT, 0.13) if on else Color(0, 0, 0, 0)], "border": [1, Kit.a(ACCENT, 0.4) if on else Color(0, 0, 0, 0)], "pad": 0 }
		var h: Dictionary = n.duplicate()
		h["fill"] = [Kit.a(ACCENT, 0.18) if on else Color(1, 1, 1, 0.04)]
		var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
		b.custom_minimum_size = Vector2(0, 38)
		var row: HBoxContainer = HBoxContainer.new()
		row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		row.offset_left = 11
		row.offset_right = -11
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(row)
		var name_l: Label = Kit.text(row, l[0], "body_strong", INK if on else DIM)
		name_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		var badge: Label = Kit.text(row, l[1], "small", ACCENT.lightened(0.2) if on else FAINT)
		badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		b.pressed.connect(func() -> void:
			_room = l[0]
			_draw_tabs()
			_draw_room())
		Kit.tap(b)
		_tabs.add_child(b)


func _clear() -> void:
	for c: Node in _content.get_children():
		c.queue_free()
	_scroll.scroll_vertical = 0


func _draw_room() -> void:
	_clear()
	match _room:
		"Collection":
			_collection()
		"Goldens":
			_goldens()
		"Giants":
			_giants()
		"Pets":
			_pets()
		"Stats":
			_stats()


# ── The Collection ─────────────────────────────────────────────────────────────

func _collection() -> void:
	var flow: HFlowContainer = HFlowContainer.new()
	flow.add_theme_constant_override("h_separation", 6)
	flow.add_theme_constant_override("v_separation", 6)
	_content.add_child(flow)
	var opts: Array = []
	for v: String in VIEWS:
		opts.append([v, v])
	var pills: HBoxContainer = Kit.tabs(null, opts, _view, ACCENT, func(k: Variant) -> void:
		_view = k
		_draw_room())
	for b: Node in pills.get_children():
		pills.remove_child(b)
		flow.add_child(b)
	pills.queue_free()
	_gap(_content, 4)
	if _view == "By Water":
		for z: Array in ZONES:
			_water(z)
		return
	var list: Array = _entries(_not_giant)
	var empty: String = "Nothing here yet. Go and land some."
	match _view:
		"Newly Logged":
			list = list.filter(func(e: Dictionary) -> bool: return e["isNew"])
			list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a["firstCaughtAt"]) > str(b["firstCaughtAt"]))
			empty = "Nothing new since you last looked."
		"Still Missing":
			list = list.filter(func(e: Dictionary) -> bool: return not e["everCaught"])
			list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return [a["rarity"], a["name"]] < [b["rarity"], b["name"]])
			empty = "Nothing missing. Every fish in every water is in the book."
		"Trophies":
			list = list.filter(func(e: Dictionary) -> bool: return _tier(e) == "Trophy")
		"Goldens":
			var ids: Array = []
			for g: Dictionary in _d["goldens"]:
				if g["status"] != "sold":
					ids.append(float(g["fishId"]))
			list = list.filter(func(e: Dictionary) -> bool: return ids.has(float(e["id"])))
		"Most Caught":
			list = list.filter(func(e: Dictionary) -> bool: return e["count"] > 0)
			list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["count"]) > float(b["count"]))
		"Biggest":
			list = list.filter(func(e: Dictionary) -> bool: return e["pbLength"] != null)
			list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["pbLength"]) > float(b["pbLength"]))
		"Most Valuable":
			list = list.filter(func(e: Dictionary) -> bool: return e["everCaught"])
			list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["sellValue"]) > float(b["sellValue"]))
		"Rarest":
			list = list.filter(func(e: Dictionary) -> bool: return e["everCaught"])
			list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return [-float(a["rarity"]), -float(a["difficulty"]), a["name"]] < [-float(b["rarity"]), -float(b["difficulty"]), b["name"]])
		"Newest":
			list = list.filter(func(e: Dictionary) -> bool: return e["everCaught"] and e["firstCaughtAt"] != null)
			list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a["firstCaughtAt"]) > str(b["firstCaughtAt"]))
	if list.is_empty():
		var l: Label = _t(_content, empty, "note", DIM, true)
		l.add_theme_font_override("font", Kit.italic())
		return
	_t(_content, "%d species" % list.size(), "eyebrow", Kit.a(ACCENT, 0.7))
	_grid(list)


## A water as a chapter: its name, the count, a rule in its colour that fills
## as far as you have charted it, the prestige line, then its specimens.
func _water(z: Array) -> void:
	var list: Array = _entries(func(e: Dictionary) -> bool: return e["habitat"] == z[0] and not AlmanacData.is_giant(e))
	if list.is_empty():
		return
	var got: int = 0
	var fresh: int = 0
	var cycle_done: bool = true
	for e: Dictionary in list:
		if e["everCaught"]:
			got += 1
		if e["isNew"]:
			fresh += 1
		if float(e["cycleCount"]) <= 0:
			cycle_done = false
	var zc: Color = Color(z[2])
	var done: bool = got == list.size()
	_gap(_content, 10)
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	_content.add_child(head)
	_chapter(head, z[1]).size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if fresh > 0:
		Kit.chip(head, "%d new" % fresh, Kit.UP)
	var count: Label = _t(head, "✦ all charted" if done else "%d / %d" % [got, list.size()], "value", Kit.GOLD if done else zc)
	count.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_content.add_child(_rule(float(got) / maxf(1.0, list.size()), Kit.GOLD if done else zc))
	if z[0] != "ancient_deep":
		_prestige_line(z, zc, cycle_done)
	_grid(list)


## The chapter rule: a hairline that fills in a colour as far as it has got.
func _rule(frac: float, c: Color) -> Control:
	var track: ColorRect = ColorRect.new()
	track.color = Color(1, 1, 1, 0.10)
	track.custom_minimum_size = Vector2(0, 2)
	var fill: ColorRect = ColorRect.new()
	fill.color = c
	fill.anchor_bottom = 1.0
	fill.anchor_right = 0.0
	track.add_child(fill)
	track.ready.connect(func() -> void:
		var tw: Tween = track.create_tween()
		tw.tween_property(fill, "anchor_right", clampf(frac, 0.0, 1.0), 0.7).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT))
	return track


func _prestige_line(z: Array, zc: Color, cycle_done: bool) -> void:
	var lvl: int = int(Js.num((_d["prestige"] as Dictionary).get(z[0])))
	var boost: int = int(Js.num((_d["goldenBoosts"] as Dictionary).get(z[0])))
	var claimed: bool = (_d["zoneRewardsClaimed"] as Dictionary).get(z[0], false)
	var reward: float = FishingRules.zone_reward_doubloons(z[0], lvl)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_content.add_child(row)
	var stars: HBoxContainer = HBoxContainer.new()
	stars.add_theme_constant_override("separation", 2)
	row.add_child(stars)
	for i: int in 5:
		var s: Label = Label.new()
		s.text = "★"
		s.add_theme_font_size_override("font_size", 13)
		s.add_theme_color_override("font_color", (Kit.GOLD if lvl >= 5 else zc) if i < lvl else Color(1, 1, 1, 0.16))
		stars.add_child(s)
	if lvl >= 5:
		_t(row, "Max Prestige", "eyebrow", Kit.GOLD).size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if boost > 0:
		Kit.chip(row, "✦ +%d%% goldens" % (boost * 10), Kit.GOLD)
	var spacer: Control = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	if not cycle_done:
		var t: Label = _t(row, "Reward claimed" if claimed else "%s ⟡ when every fish is charted" % Js.thousands(reward), "small", DIM)
		t.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	elif not claimed:
		var b: Button = Kit.button("Claim %s ⟡" % Js.thousands(reward), "accent", "small", zc)
		b.pressed.connect(func() -> void:
			var r: Dictionary = await session.act("claimZoneReward", [z[0]])
			session.persist()
			if r.has("error"):
				b.text = r["error"]
				return
			_reload())
		row.add_child(b)
	else:
		var b: Button = Kit.button("✦ Wipe for +10% goldens" if lvl >= 5 else "★ Prestige %d" % (lvl + 1), "accent", "small", Kit.GOLD if lvl >= 5 else zc)
		b.pressed.connect(func() -> void: _confirm_prestige(z, lvl, boost))
		row.add_child(b)


func _confirm_prestige(z: Array, lvl: int, boost: int) -> void:
	var at_max: bool = lvl >= 5
	var body: String
	if at_max:
		body = "Your %s log is wiped. Your golden trophies stay. In return, a permanent +10%% golden catch chance here, on top of your +%d%%." % [z[1], boost * 10]
	else:
		body = "Your %s log is wiped. Your golden trophies stay. In return, a permanent +%d%% XP on every catch here%s Chart it again and it pays again." % [
			z[1], (lvl + 1) * 10, ". This is the last one: Max Prestige." if lvl + 1 >= 5 else ", up to +50% at Max Prestige."]
	_ask("Wipe for gold" if at_max else "Prestige %d" % (lvl + 1), body, "Yes, wipe for gold" if at_max else "Yes, prestige", "Not yet", func() -> void:
		var r: Dictionary = await session.act("prestigeZone", [z[0]])
		session.persist()
		_reload()
		if r.has("error"):
			_ask("Not yet", r["error"], "", "Close", Callable()))


## The shelf: as many columns as fit at about 150 wide.
func _grid(list: Array) -> void:
	var g: GridContainer = GridContainer.new()
	g.columns = maxi(2, int(_content_w() / 152.0))
	g.add_theme_constant_override("h_separation", 4)
	g.add_theme_constant_override("v_separation", 6)
	_content.add_child(g)
	var i: int = 0
	for e: Dictionary in list:
		var c: Control = _card(e)
		g.add_child(c)
		Kit.stagger(c, i)
		i += 1


func _tier(e: Dictionary) -> String:
	if e["pbLength"] == null or e["lengthMin"] == null or e["lengthMax"] == null:
		return ""
	var t: String = Rules.tier_for_length(float(e["pbLength"]), float(e["lengthMin"]), float(e["lengthMax"]))
	return t.capitalize()


static func _flat(b: Button) -> void:
	var empty: StyleBoxEmpty = StyleBoxEmpty.new()
	for st: String in ["normal", "hover", "pressed", "disabled", "focus", "hover_pressed"]:
		b.add_theme_stylebox_override(st, empty)


## One specimen, frameless: its halo, the art, its floor shadow, the name on
## one line, and in a sorted view the thing it was sorted by. A trophy-sized
## catch wears a cup in the corner (gold if a golden is mounted).
func _card(e: Dictionary) -> Control:
	var caught: bool = e["everCaught"]
	var b: Button = Button.new()
	_flat(b)
	b.custom_minimum_size = Vector2(0, 112)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var col: VBoxContainer = VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.add_theme_constant_override("separation", 3)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(col)
	var holder: Control = Kit.art(col, _art(e["name"]), Vector2(0, 78), Kit.rarity(float(e["rarity"])), not caught)
	if e["isNew"]:
		var tag: Pane = Kit.chip(null, "New", Kit.UP)
		tag.position = Vector2(4, 2)
		holder.add_child(tag)
	if caught and _tier(e) == "Trophy":
		var cup: Kit.Glyph = Kit.Glyph.new()
		cup.kind = "trophy"
		cup.color = Kit.GOLD if e["everGolden"] else Color("#c8d2e0")
		cup.anchor_left = 1.0
		cup.anchor_right = 1.0
		cup.offset_left = -24
		cup.offset_right = -6
		cup.offset_top = 2
		cup.offset_bottom = 20
		cup.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(cup)
	var n: Label = _t(col, e["name"] if caught else "???", "name", INK if caught else LOCKED)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	n.clip_text = true
	n.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var note: String = ""
	match _view:
		"Newly Logged", "Newest":
			note = _date(e["firstCaughtAt"])
		"Still Missing", "Rarest":
			note = RARITY_NAMES[clampi(int(e["rarity"]) - 1, 0, 4)]
		"Most Caught":
			note = "×%d" % int(e["count"])
		"Biggest":
			note = FishingHud.length_text(float(e["pbLength"]))
		"Most Valuable":
			note = "%s ⟡" % Js.thousands(float(e["sellValue"]))
	if note != "":
		var nl: Label = _t(col, note, "small", DIM)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.disabled = not caught
	if caught:
		# Lift on hover, as the web's specimens do.
		b.mouse_entered.connect(func() -> void: holder.create_tween().tween_property(holder, "position:y", -3.0, 0.12))
		b.mouse_exited.connect(func() -> void: holder.create_tween().tween_property(holder, "position:y", 0.0, 0.16))
		Kit.tap(b)
	b.pressed.connect(func() -> void: _species(e))
	return b


static func _date(iso: Variant) -> String:
	var ms: float = Js.parse_ms(iso)
	if is_nan(ms):
		return ""
	var d: Dictionary = Time.get_datetime_dict_from_unix_time(int(ms / 1000.0))
	var months: Array = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
	return "%d %s %d" % [d["day"], months[int(d["month"]) - 1], d["year"]]


## A species, opened: a page of its own. The specimen on a plate of paper in
## its pool of light (gold once a golden is taken), its name and rarity, your
## record with it, your best against the whole possible range, and the facts.
func _species(e: Dictionary) -> void:
	var zone: String = ""
	var zc: Color = ACCENT
	for z: Array in ZONES:
		if z[0] == e["habitat"]:
			zone = z[1]
			zc = Color(z[2])
	var sheet: Pane = _sheet(560, { "radius": 18, "fill": [Color("#16141b"), Color("#0c0b10")], "border": [1, Kit.a(zc, 0.33)], "shadow": [Color(0, 0, 0, 0.6), 36, Vector2(0, 14)], "pad": 0 })
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	sheet.add_child(col)
	# The plate, its top corners rounded by a pane that clips it.
	var plate: Pane = Kit.pane(col, { "radius": 18, "fill": [Color(0.04, 0.035, 0.05)], "pad": 0 })
	plate.custom_minimum_size = Vector2(0, 168)
	plate.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	var paper: TextureRect = TextureRect.new()
	paper.texture = Skipper.tex("almanac-paper.jpg")
	paper.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	paper.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	plate.add_child(paper)
	var art: Control = Kit.art(plate, _art(e["name"]), Vector2(0, 168), Kit.GOLD if e["everGolden"] else zc)
	var over: Control = Control.new()
	over.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_child(over)
	plate.resized.connect(func() -> void:
		paper.size = plate.size
		art.position = Vector2(plate.size.x * 0.2, 6)
		art.size = Vector2(plate.size.x * 0.6, plate.size.y - 12)
		over.size = plate.size)
	var zl: Label = Kit.lift(_t(over, zone, "eyebrow", zc))
	zl.position = Vector2(14, 12)
	var x: Button = Kit.close_button()
	x.anchor_left = 1.0
	x.anchor_right = 1.0
	x.offset_left = -40
	x.offset_right = -10
	x.offset_top = 10
	x.offset_bottom = 40
	x.pressed.connect(_close_overlay)
	over.add_child(x)

	var body: MarginContainer = MarginContainer.new()
	body.add_theme_constant_override("margin_left", 18)
	body.add_theme_constant_override("margin_right", 18)
	body.add_theme_constant_override("margin_top", 10)
	body.add_theme_constant_override("margin_bottom", 18)
	col.add_child(body)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	body.add_child(v)
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	v.add_child(top)
	var nm: Label = _t(top, e["name"], "title", INK)
	nm.add_theme_font_override("font", Kit.font("cinzel", 800))
	Kit.chip(top, RARITY_NAMES[clampi(int(e["rarity"]) - 1, 0, 4)], Kit.rarity(float(e["rarity"])))
	if e["everGolden"]:
		Kit.chip(top, "Golden taken" if e.get("goldenBy") == null else "Golden · %s" % e["goldenBy"], Kit.GOLD)
	if e["scientificName"] != null:
		var sci: Label = _t(v, e["scientificName"], "note", DIM)
		sci.add_theme_font_override("font", Kit.italic())
	var goldens: int = 0
	for g: Dictionary in _d["goldens"]:
		if float(g["fishId"]) == float(e["id"]):
			goldens += 1
	var cells: HBoxContainer = HBoxContainer.new()
	cells.add_theme_constant_override("separation", 6)
	v.add_child(cells)
	_cell(cells, "Caught", str(int(e["count"])), Kit.INK_2)
	_cell(cells, "Goldens", str(goldens), Kit.GOLD if goldens > 0 else Kit.INK_2)
	_cell(cells, "Worth", "%s ⟡" % Js.thousands(float(e["sellValue"])), Kit.GOLD)
	if e["pbLength"] != null and e["lengthMin"] != null and e["lengthMax"] != null:
		var tier: String = _tier(e)
		var tc: Color = Kit.GOLD if tier == "Trophy" else Kit.INK_2
		var box: Pane = Kit.pane(v, Kit.inset([12, 10, 12, 10]))
		var bv: VBoxContainer = VBoxContainer.new()
		bv.add_theme_constant_override("separation", 5)
		box.add_child(bv)
		var bh: HBoxContainer = HBoxContainer.new()
		bv.add_child(bh)
		_t(bh, "Your best" if e.get("pbBy") == null else "Crew best · %s" % e["pbBy"], "label", DIM).size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_t(bh, "%s%s" % [FishingHud.length_text(float(e["pbLength"])), ("  ·  " + tier) if tier != "" else ""], "name", tc)
		var span: float = float(e["lengthMax"]) - float(e["lengthMin"])
		var pct: float = clampf((float(e["pbLength"]) - float(e["lengthMin"])) / span, 0.0, 1.0) if span > 0.0 else 1.0
		bv.add_child(_needle(pct, tc))
		var ends: HBoxContainer = HBoxContainer.new()
		bv.add_child(ends)
		_t(ends, FishingHud.length_text(float(e["lengthMin"])), "small", FAINT).size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_t(ends, FishingHud.length_text(float(e["lengthMax"])), "small", FAINT)
	if e["funFact"] != null:
		var ff: Label = _t(v, e["funFact"], "note", Kit.INK_2, true)
		ff.add_theme_font_override("font", Kit.italic())
	var facts: GridContainer = GridContainer.new()
	facts.columns = 2
	facts.add_theme_constant_override("h_separation", 16)
	facts.add_theme_constant_override("v_separation", 0)
	v.add_child(facts)
	var rows: Array = [["Difficulty", "%d/5" % int(e["difficulty"])]]
	if e["sizeCategory"] != null:
		rows.append(["Size class", String(e["sizeCategory"]).capitalize()])
	if e["dietType"] != null:
		rows.append(["Diet", String(e["dietType"]).capitalize()])
	if e["region"] != null:
		rows.append(["Region", String(e["region"])])
	rows.append(["First caught", _date(e["firstCaughtAt"])])
	rows.append(["Last caught", _date(e["lastCaughtAt"])])
	if e["pbAt"] != null:
		rows.append(["Best landed", _date(e["pbAt"])])
	for r: Array in rows:
		var cellbox: VBoxContainer = VBoxContainer.new()
		cellbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		facts.add_child(cellbox)
		Kit.stat_row(cellbox, r[0], r[1])


## A boxed figure: its label over its value.
func _cell(parent: Control, label: String, value: String, c: Color) -> void:
	var p: Pane = Kit.pane(parent, Kit.inset([8, 7, 8, 8]))
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	p.add_child(v)
	_t(v, label, "label", DIM).horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var n: Label = _t(v, value, "name", c)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


## Your best on the species' range: a track, and a needle where it sits.
func _needle(pct: float, c: Color) -> Control:
	var track: Control = Control.new()
	track.custom_minimum_size = Vector2(0, 12)
	track.draw.connect(func() -> void:
		var y: float = track.size.y / 2.0
		track.draw_line(Vector2(3, y), Vector2(track.size.x - 3, y), Color(1, 1, 1, 0.08), 6.0, true)
		var px: float = clampf(track.size.x * pct, 2.0, track.size.x - 2.0)
		track.draw_rect(Rect2(Vector2(px - 1.5, 0), Vector2(3, track.size.y)), c))
	return track


## A floating panel over the book: the kit's scrim and a pane of this spec,
## centred, rising in. Returns the pane (the caller fills it).
func _sheet(w: float, spec: Dictionary) -> Pane:
	if _overlay != null:
		_overlay.queue_free()
	_overlay = Control.new()
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_overlay)
	var shade: ColorRect = Kit.scrim(_overlay)
	shade.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
			_close_overlay())
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(center)
	var card: Pane = Kit.pane(center, spec)
	card.custom_minimum_size = Vector2(w, 0)
	card.modulate.a = 0.0
	(func() -> void: Kit.modal_in(card)).call_deferred()
	return card


func _close_overlay() -> void:
	if _overlay != null:
		_overlay.queue_free()
		_overlay = null


## A plain panel in the Almanac's colours.
func _panel(w: float) -> VBoxContainer:
	var card: Pane = _sheet(w, Kit.modal(ACCENT, 20))
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	card.add_child(col)
	return col


func _ask(title: String, body: String, yes: String, no: String, on_yes: Callable) -> void:
	var p: VBoxContainer = _panel(460)
	_t(p, title, "title", INK)
	_t(p, body, "body", Kit.INK_2, true)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	p.add_child(row)
	var n: Button = Kit.button(no, "secondary")
	n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	n.pressed.connect(_close_overlay)
	row.add_child(n)
	if yes != "":
		var y: Button = Kit.button(yes, "accent", "large", ACCENT)
		y.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		y.pressed.connect(func() -> void:
			_close_overlay()
			on_yes.call())
		row.add_child(y)
	n.grab_focus.call_deferred()


## A strip of figures: each a number in Cinzel over its label.
func _tally(pairs: Array, c: Color) -> void:
	var strip: HBoxContainer = HBoxContainer.new()
	strip.add_theme_constant_override("separation", 0)
	_content.add_child(strip)
	for i: int in pairs.size():
		if i > 0:
			var rule: ColorRect = ColorRect.new()
			rule.color = Color(1, 1, 1, 0.07)
			rule.custom_minimum_size = Vector2(1, 0)
			strip.add_child(rule)
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 2)
		strip.add_child(v)
		var n: Label = _t(v, str(pairs[i][1]), "number", c)
		n.add_theme_font_size_override("font_size", 22)
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var l: Label = _t(v, pairs[i][0], "label", DIM)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


# ── The Goldens ────────────────────────────────────────────────────────────────

func _goldens() -> void:
	var all: Array = _d["goldens"]
	var kept: Array = all.filter(func(g: Dictionary) -> bool: return g["status"] != "sold")
	if kept.is_empty():
		if all.is_empty():
			Kit.section(_content, "No goldens yet", "A perfect catch rolls 1 in 1,000 for a golden. Land enough perfects and the sea pays one out.", Kit.GOLD)
		else:
			Kit.section(_content, "Nothing on the wall", "You have landed %d in your time and sold every one. Keep the next." % all.size(), Kit.GOLD)
		return
	var sold: float = 0.0
	var species: Dictionary = {}
	for g: Dictionary in all:
		if g["status"] == "sold":
			sold += Js.num(g.get("soldFor"))
	for g: Dictionary in kept:
		species[g["fishId"]] = true
	_tally([["Mounted", kept.size()], ["Species", species.size()], ["Ever landed", all.size()], ["Sold for", "%s ⟡" % Js.thousands(sold)]], Kit.GOLD)
	_gap(_content, 8)
	var grid: GridContainer = GridContainer.new()
	grid.columns = maxi(2, int(_content_w() / 230.0))
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 12)
	_content.add_child(grid)
	var i: int = 0
	for g: Dictionary in kept:
		var box: VBoxContainer = VBoxContainer.new()
		box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		box.add_theme_constant_override("separation", 2)
		grid.add_child(box)
		var holder: Control = Kit.art(box, _art(g["name"]), Vector2(0, 112), Kit.GOLD)
		var pic: TextureRect = holder.get_child(holder.get_child_count() - 1)
		var m: ShaderMaterial = ShaderMaterial.new()
		m.shader = load("res://game/golden.gdshader")
		pic.material = m
		var n: Label = _t(box, g["name"], "name", INK)
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var s: Label = _t(box, FishingHud.length_text(Js.num(g.get("sizeIn"))) if g.get("sizeIn") != null else "unmeasured", "small", Kit.GOLD)
		s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var d: Label = _t(box, _date(g["caughtAt"]) + (("  ·  " + str(g["by"])) if g.get("by") != null else ""), "small", DIM)
		d.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		Kit.stagger(box, i)
		i += 1


# ── The Giants ─────────────────────────────────────────────────────────────────

func _giants() -> void:
	var unlocked: bool = _d["vigilUnlocked"]
	var vigil: Dictionary = _d["vigil"]
	var caught: Array = _d["ancientCatches"]
	var head: HBoxContainer = HBoxContainer.new()
	_content.add_child(head)
	_chapter(head, "The Ancient Deep").size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if unlocked:
		var total: float = Vigil.total(vigil)
		_t(head, "%d/30 Vigil" % int(total), "value", Kit.GOLD if total >= 30 else Color("#c9a7ff"))
	else:
		_t(head, "%d/6" % caught.size(), "value", Color("#c9a7ff"))
	var intro: Label = _t(_content, "Finn is done, and the six are stirring again. Put one back in the water and it will come up harder than it did the first time." if unlocked else "Six things that should not still be down there. They fetch nothing at market because nobody would dare buy one.", "note", DIM, true)
	intro.add_theme_font_override("font", Kit.italic())
	var grid: GridContainer = GridContainer.new()
	grid.columns = maxi(1, int(_content_w() / 340.0))
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	_content.add_child(grid)
	for i: int in Vigil.ANCIENT_IDS.size():
		var id: float = Vigil.ANCIENT_IDS[i]
		var f: Variant = session.store.species(id)
		var name: String = (f as Dictionary)["name"] if f != null else "?"
		var got: bool = Js.includes(caught, id)
		var entry: Dictionary = vigil.get(Js.key(id), {})
		var rank: int = int(Js.nz(entry.get("rank"), 1.0))
		var released: bool = entry.get("released") == true
		var fr: Array = FRAME[rank]
		var lit: bool = got and unlocked and not released
		var slab: Button = Button.new()
		_flat(slab)
		slab.custom_minimum_size = Vector2(0, 118)
		slab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(slab)
		# The slab: the deep behind it, darkened from the left where the words are.
		var width: int = 1 if (rank < 2 or not lit) else (3 if rank == 5 else 2)
		var edge: Color = Kit.a(Color(fr[1]), 0.7) if lit else (Color(1, 1, 1, 0.14) if got else Color(1, 1, 1, 0.08))
		var face: Pane = Pane.new({ "radius": 14, "fill": [Color(0.031, 0.024, 0.063, 0.72)], "pad": 0 })
		face.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		face.mouse_filter = Control.MOUSE_FILTER_IGNORE
		face.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
		slab.add_child(face)
		var deep: TextureRect = TextureRect.new()
		deep.texture = Skipper.tex("ancient.jpg")
		deep.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		deep.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		deep.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		deep.modulate.a = 0.8 if got else 0.35
		deep.mouse_filter = Control.MOUSE_FILTER_IGNORE
		face.add_child(deep)
		Kit.wash(face, [[Color(0.024, 0.02, 0.047, 0.94), 0.0], [Color(0.024, 0.02, 0.047, 0.72), 0.46], [Color(0.024, 0.02, 0.047, 0.34), 1.0]], 90.0)
		var art: TextureRect = TextureRect.new()
		art.texture = Skipper.tex(_art(name))
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		art.anchor_left = 0.48
		art.anchor_right = 1.0
		art.anchor_bottom = 1.0
		art.offset_top = 8
		art.offset_bottom = -8
		art.offset_right = -8
		art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slab.add_child(art)
		# The rim, drawn over everything, so the clip does not cut it.
		var rim: Pane = Pane.new({ "radius": 14, "fill": [Color(0, 0, 0, 0)], "border": [width, edge], "pad": 0 })
		rim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		rim.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slab.add_child(rim)
		var col: VBoxContainer = VBoxContainer.new()
		col.anchor_bottom = 1.0
		col.anchor_right = 0.6
		col.offset_left = 16
		col.alignment = BoxContainer.ALIGNMENT_CENTER
		col.add_theme_constant_override("separation", 2)
		col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slab.add_child(col)
		var eyebrow: String
		var sub: String
		if not got:
			eyebrow = "Unraised"
			name = "???"
			sub = "Still down there"
			art.modulate = Color(0, 0, 0, 0.42)
		elif released:
			eyebrow = "Berth empty"
			sub = "Somewhere in the Ancient Deep. It rises for a lure, and nothing else."
			art.modulate = Color(0.16, 0.16, 0.16, 0.4)
		else:
			eyebrow = ("Mastered" if rank >= 5 else "Rank %s of V" % ["", "I", "II", "III", "IV"][rank]) if unlocked else "Mount %d of 6" % (i + 1)
			sub = fr[0] if unlocked else "Raised"
			if rank >= 5 and unlocked:
				var m: ShaderMaterial = ShaderMaterial.new()
				m.shader = load("res://game/golden.gdshader")
				art.material = m
		Kit.lift(_t(col, eyebrow, "eyebrow", Color(fr[1]) if lit else DIM))
		Kit.lift(_t(col, name, "heading", INK if got else LOCKED))
		var sl: Label = Kit.lift(_t(col, sub, "small", DIM, true))
		sl.custom_minimum_size = Vector2(150, 0)
		slab.disabled = not (unlocked and got)
		if not slab.disabled:
			Kit.tap(slab)
		slab.pressed.connect(func() -> void: _giant(id, name, rank, released))


func _giant(id: float, name: String, rank: int, released: bool) -> void:
	var p: VBoxContainer = _panel(500)
	_t(p, "The Long Vigil", "eyebrow", Kit.a(ACCENT, 0.8))
	_t(p, name, "title", INK)
	if released:
		_t(p, "It is out there now, and it will not come up for ordinary bait. Take a Golden or Luminous Lure down to the Ancient Deep and land it on a perfect to raise its rank.", "body", Kit.INK_2, true)
		return
	if rank >= 5:
		_t(p, "Mastered. There is nothing left this one can teach you.", "body", Kit.INK_2, true)
		return
	_t(p, "Release for Rank %d" % (rank + 1), "heading", Color("#c9a7ff"))
	_t(p, TELL.get(int(id), ""), "body", Kit.INK_2, true)
	for c: String in Almanac.vigil_changes(rank + 1):
		_t(p, "· " + c, "small", DIM, true)
	var b: Button = Kit.button("Release it", "danger")
	b.pressed.connect(func() -> void: _release(id, name, rank))
	p.add_child(b)
	b.grab_focus.call_deferred()


## vigilChanges: what gets harder at the next rank.
static func vigil_changes(attempting: int) -> Array[String]:
	var scale: Dictionary = { 2: [0, -6, 2.5, 1.06, 0.0], 3: [1, -9, 3.0, 1.09, 0.03], 4: [1, -12, 3.5, 1.12, 0.05], 5: [2, -15, 4.0, 1.15, 0.08] }
	var out: Array[String] = []
	if not scale.has(attempting):
		return out
	var nxt: Array = scale[attempting]
	var prev: Array = scale.get(attempting - 1, [])
	var extra: int = int(nxt[0]) - (int(prev[0]) if prev.size() > 0 else 0)
	if extra > 0:
		out.append("One more phase to hold." if extra == 1 else "%d more phases to hold." % extra)
	if prev.is_empty():
		out.append("The landing window now closes with every phase.")
	elif float(nxt[2]) > float(prev[2]):
		out.append("The window closes faster.")
	if float(nxt[1]) > (float(prev[1]) if prev.size() > 0 else 0.0):
		out.append("It starts tighter than before.")
	if prev.is_empty() or float(nxt[3]) > float(prev[3]):
		out.append("The needle quickens harder each phase.")
	if float(nxt[4]) > (float(prev[4]) if prev.size() > 0 else 0.0):
		out.append("The light fails more often.")
	return out


## Give it back: held for 1.6 seconds, the tide draining if you let go.
func _release(id: float, name: String, rank: int) -> void:
	var p: VBoxContainer = _panel(500)
	_t(p, "Give it back", "eyebrow", Color("#e0455a"))
	_t(p, name, "title", INK)
	_t(p, TELL.get(int(id), ""), "body", Kit.INK_2, true)
	_t(p, "Your wall is one short until you land it again. Come back with it on a perfect and it mounts at Rank %d." % (rank + 1), "note", DIM, true)
	var bar: Kit.Bar = Kit.bar(p, 0.0, Color("#e0455a"))
	var hold: Button = Kit.button("Hold to release", "danger")
	p.add_child(hold)
	var leave: Button = Kit.button("Leave it on the wall", "secondary")
	leave.pressed.connect(_close_overlay)
	p.add_child(leave)
	var state: Dictionary = { "held": false, "done": false, "p": 0.0, "last": 0 }
	hold.button_down.connect(func() -> void:
		state["held"] = true
		hold.text = "Keep holding…")
	hold.button_up.connect(func() -> void:
		state["held"] = false
		if not state["done"]:
			hold.text = "Hold to release")
	var timer: Timer = Timer.new()
	timer.wait_time = 1.0 / 60.0
	timer.autostart = true
	p.add_child(timer)
	timer.timeout.connect(func() -> void:
		if state["done"]:
			return
		var dt: float = timer.wait_time
		state["p"] = clampf(float(state["p"]) + (dt / 1.6 if state["held"] else -dt / 0.8), 0.0, 1.0)
		bar.set_value(float(state["p"]), false)
		var step: int = int(float(state["p"]) * 5.0)
		if step > int(state["last"]):
			Rumble.tap(6)
		state["last"] = step
		if float(state["p"]) >= 1.0:
			state["done"] = true
			var r: Dictionary = await session.act("releaseAncient", [id])
			session.persist()
			hold.visible = false
			leave.visible = false
			if r.has("error"):
				_t(p, r["error"], "body", Kit.DOWN, true)
				return
			_t(p, "It wakes", "heading", Color("#e0455a"))
			_t(p, "The eye opens. It turns for the dark, and it remembers you.", "body", Kit.INK_2, true)
			await get_tree().create_timer(1.5).timeout
			_reload()
			var q: VBoxContainer = _panel(460)
			_t(q, "%s is back in the deep" % name, "title", INK)
			_t(q, "Its berth is empty until you bring it home. It will only rise for a Golden or Luminous Lure.", "body", Kit.INK_2, true)
			var c: Button = Kit.button("Close", "secondary")
			c.pressed.connect(_close_overlay)
			q.add_child(c)
			c.grab_focus.call_deferred())
	hold.grab_focus.call_deferred()


# ── The Pets ───────────────────────────────────────────────────────────────────

func _pets() -> void:
	var intro: Label = _t(_content, "Nearly every one came out of a crate, from about 1 in 200 wooden ones up to 1 in 10 Ancient Chests. When one does turn up, this is how often it is each of them.", "note", DIM, true)
	intro.add_theme_font_override("font", Kit.italic())
	var owned: Array = _d["unlockedPets"]
	var weights: Dictionary = Rules.data()["petSpeciesWeights"]
	var wsum: float = 0.0
	for s: Variant in weights:
		wsum += float(weights[s])
	var groups: Dictionary = {}
	for pet: Dictionary in Rules.data()["pets"]:
		if not groups.has(pet["species"]):
			groups[pet["species"]] = []
		(groups[pet["species"]] as Array).append(pet)
	for species: Variant in groups:
		var list: Array = groups[species]
		var got: int = 0
		var vsum: float = 0.0
		for pet: Dictionary in list:
			if Js.includes(owned, pet["id"]):
				got += 1
			if not pet["earnedOnly"]:
				vsum += float(pet["weight"])
		_gap(_content, 8)
		var head: HBoxContainer = HBoxContainer.new()
		_content.add_child(head)
		var sec: VBoxContainer = Kit.section(head, String(species).capitalize(), "", ACCENT)
		sec.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_t(head, "✦ complete" if got == list.size() else "%d/%d" % [got, list.size()], "value", Kit.GOLD if got == list.size() else DIM)
		var g: GridContainer = GridContainer.new()
		g.columns = maxi(2, int(_content_w() / 160.0))
		g.add_theme_constant_override("h_separation", 6)
		g.add_theme_constant_override("v_separation", 8)
		_content.add_child(g)
		for pet: Dictionary in list:
			var has: bool = Js.includes(owned, pet["id"])
			var box: VBoxContainer = VBoxContainer.new()
			box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			box.add_theme_constant_override("separation", 2)
			g.add_child(box)
			Kit.art(box, pet["restImageUrl"], Vector2(0, 92), ACCENT, not has)
			var n: Label = _t(box, pet["name"] if has else "???", "name", INK if has else LOCKED)
			n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			var share: String = "Never from a crate"
			if not pet["earnedOnly"] and wsum > 0 and vsum > 0:
				share = "%.1f%% of finds" % (100.0 * float(weights.get(species, 0.0)) / wsum * float(pet["weight"]) / vsum)
			var sl: Label = _t(box, share, "small", DIM)
			sl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


# ── The Stats ──────────────────────────────────────────────────────────────────

func _stats() -> void:
	var st: Dictionary = _d["stats"]
	var all: Array = _d["entries"]
	var charted: int = 0
	var catches: float = 0.0
	var worth: float = 0.0
	var met: int = 0
	for e: Dictionary in all:
		if e["everCaught"]:
			charted += 1
		catches += float(e["count"])
		worth += float(e["count"]) * float(e["sellValue"])
		if float(e["count"]) > 0:
			met += 1
	var head: HBoxContainer = HBoxContainer.new()
	_content.add_child(head)
	_chapter(head, "The Record").size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_t(head, "%d of %d charted  ·  %d%%" % [charted, all.size(), int(Js.round(100.0 * charted / maxf(1.0, all.size())))], "value", ACCENT.lightened(0.2))
	Kit.bar(_content, float(charted) / maxf(1.0, all.size()), ACCENT)
	_gap(_content, 6)
	_tally([["Catches", Js.thousands(catches)], ["Casts", Js.thousands(float(st["casts"]))], ["Perfects", Js.thousands(float(st["perfects"]))], ["Trophies", Js.thousands(float(st["trophySizeCatches"]))]], Kit.GOLD)
	var cols: HBoxContainer = HBoxContainer.new()
	cols.add_theme_constant_override("separation", 26)
	_content.add_child(cols)
	var left: VBoxContainer = VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 0)
	cols.add_child(left)
	var right: VBoxContainer = VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 0)
	cols.add_child(right)
	var goldens: Array = _d["goldens"]
	_part(left, "The Career", "What the rod has done.")
	for pair: Array in [["Best perfect streak", st["bestPerfectStreak"]], ["Crates opened", st["cratesOpened"]], ["Double catches", st["doubleCatches"]], ["Rod jackpots", st["jackpots"]], ["Snags", st["snags"]], ["Fishing XP", st["fishingXP"]], ["Goldens landed", goldens.size()], ["Species met", met]]:
		Kit.stat_row(left, pair[0], Js.thousands(float(pair[1])))
	_part(left, "Prestige", "Each water's stars.")
	for z: Array in ZONES:
		if z[0] != "ancient_deep":
			Kit.stat_row(left, z[1], "★ %d" % int(Js.num((_d["prestige"] as Dictionary).get(z[0]))))
	var top: Array = all.filter(func(e: Dictionary) -> bool: return float(e["count"]) > 0)
	top.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["count"]) > float(b["count"]))
	if top.size() > 0:
		_part(right, "Most Caught", "The fish that keep coming back.")
		for i: int in mini(5, top.size()):
			Kit.stat_row(right, top[i]["name"], "×%d" % int(top[i]["count"]))
	_part(right, "Crates Opened", "")
	var opens: Dictionary = st["crateOpens"]
	if opens.is_empty():
		_t(right, "Nothing counted yet. The next crate you crack starts the tally.", "note", DIM, true)
	for tier: Variant in opens:
		Kit.stat_row(right, String(tier).capitalize(), Js.thousands(float(opens[tier])))
	var baits: Dictionary = st["baitUsed"]
	if not baits.is_empty():
		_part(right, "Bait Burned", "")
		for b: Variant in baits:
			Kit.stat_row(right, Rules.bait(b)["name"], Js.thousands(float(baits[b])))
	_part(left, "The Ledger", "What the catch has paid.")
	Kit.stat_row(left, "Worth landed", "%s ⟡" % Js.thousands(worth), "good")
	Kit.stat_row(left, "Earned selling", "%s ⟡" % Js.thousands(float(st["doubloonsFromFish"])))
	Kit.stat_row(left, "Fish sold", Js.thousands(float(st["fishSoldCount"])))
	Kit.stat_row(left, "Best single sale", "%s ⟡" % Js.thousands(float(st["biggestSale"])))


## A part of the record: a heading with the Almanac's mark and a note.
func _part(parent: Control, title: String, note: String) -> void:
	_gap(parent, 14)
	Kit.section(parent, title, note, ACCENT)
	_gap(parent, 4)
