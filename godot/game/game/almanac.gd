class_name Almanac
extends Control
## THE ANGLER'S ALMANAC (Godot port of app/(app)/fishing/Almanac.tsx and its
## rooms, fishing pass 3).
##
## Five rooms: the Collection (by water, with each water's payout and prestige,
## and nine other ways to read the book), the Goldens, the Giants (the Long
## Vigil's wall and the release), the Pets, and the Stats. It re-reads the save
## every time it opens and after a claim or a prestige; closing it stamps the
## book as read, so NEW marks last the whole visit.

signal closed

const ZONES: Array = [["shallows", "Shallows", "#60a5fa"], ["open_waters", "Open Waters", "#34d399"], ["deep", "Deep", "#a78bfa"], ["abyss", "Abyss", "#f87171"], ["ancient_deep", "Ancient Deep", "#c084fc"]]
const RARITY: Array = [["Common", "#9aa3ad"], ["Uncommon", "#4ade80"], ["Rare", "#60a5fa"], ["Epic", "#c084fc"], ["Legendary", "#f0c040"]]
const VIEWS: Array = ["By Water", "Newly Logged", "Still Missing", "Trophies", "Goldens", "Most Caught", "Biggest", "Most Valuable", "Rarest", "Newest"]
const INK: Color = Color("#f2ecdd")
const DIM: Color = Color(0.85, 0.8, 0.7, 0.7)
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


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var base: ColorRect = ColorRect.new()
	base.color = Color("#0a090d")
	base.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(base)
	var paper: TextureRect = TextureRect.new()
	paper.texture = Skipper.tex("almanac-paper.jpg")
	paper.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	paper.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	paper.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	paper.modulate = Color(0.32, 0.29, 0.27)
	add_child(paper)
	var outer: MarginContainer = MarginContainer.new()
	outer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		outer.add_theme_constant_override("margin_" + side, 28)
	add_child(outer)
	var col: VBoxContainer = VBoxContainer.new()
	outer.add_child(col)
	var head: HBoxContainer = HBoxContainer.new()
	col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(titles)
	_t(titles, "FISHING", 12, Color("#a78bfa"), true)
	_t(titles, "The Angler's Almanac", 30, INK, true)
	var x: Button = Button.new()
	x.text = "✕"
	x.custom_minimum_size = Vector2(44, 44)
	x.pressed.connect(close)
	head.add_child(x)
	var body: HBoxContainer = HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 18)
	col.add_child(body)
	_tabs = VBoxContainer.new()
	_tabs.custom_minimum_size = Vector2(208, 0)
	body.add_child(_tabs)
	_scroll = ScrollContainer.new()
	_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(_scroll)
	_content = VBoxContainer.new()
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content.add_theme_constant_override("separation", 10)
	_scroll.add_child(_content)
	_reload()
	x.grab_focus.call_deferred()


func close() -> void:
	AlmanacData.mark_viewed(session.store, session.uid)
	session.persist()
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		if _overlay != null:
			_overlay.queue_free()
			_overlay = null
		else:
			close()


func _reload() -> void:
	_d = AlmanacData.build(session.store, session.uid)
	_draw_tabs()
	_draw_room()


func _t(parent: Control, text: String, px: int, col: Color, title: bool = false, wrap: bool = false) -> Label:
	return Sheet.text(parent, text, px, col, title, wrap)


func _entries(filter: Callable) -> Array:
	var out: Array = []
	for e: Dictionary in _d["entries"]:
		if filter.call(e):
			out.append(e)
	return out


func _not_giant(e: Dictionary) -> bool:
	return not AlmanacData.is_giant(e)


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
		var b: Button = Button.new()
		b.text = "%s   %s" % [l[0], l[1]]
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.custom_minimum_size = Vector2(208, 48)
		if l[0] == _room:
			b.add_theme_color_override("font_color", Color("#c4b5fd"))
		b.pressed.connect(func() -> void:
			_room = l[0]
			_draw_tabs()
			_draw_room())
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
	var chips: HFlowContainer = HFlowContainer.new()
	_content.add_child(chips)
	for v: String in VIEWS:
		var b: Button = Button.new()
		b.text = v
		b.add_theme_font_size_override("font_size", 13)
		if v == _view:
			b.add_theme_color_override("font_color", Color("#c4b5fd"))
		b.pressed.connect(func() -> void:
			_view = v
			_draw_room())
		chips.add_child(b)
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
		_t(_content, empty, 16, DIM)
		return
	_t(_content, "%d species" % list.size(), 13, DIM)
	_grid(list)


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
	var head: HBoxContainer = HBoxContainer.new()
	_content.add_child(head)
	var n: Label = _t(head, z[1], 22, INK, true)
	n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if fresh > 0:
		_t(head, "%d new  " % fresh, 13, Color("#4ade80"), true)
	_t(head, "✦ all charted" if got == list.size() else "%d / %d" % [got, list.size()], 15, Color("#f0c040") if got == list.size() else zc, true)
	var rule: ProgressBar = ProgressBar.new()
	rule.show_percentage = false
	rule.custom_minimum_size = Vector2(0, 3)
	rule.value = 100.0 * got / maxf(1.0, list.size())
	var fill: StyleBoxFlat = StyleBoxFlat.new()
	fill.bg_color = Color("#f0c040") if got == list.size() else zc
	rule.add_theme_stylebox_override("fill", fill)
	_content.add_child(rule)
	if z[0] != "ancient_deep":
		_prestige_line(z, zc, cycle_done)
	_grid(list)


func _prestige_line(z: Array, zc: Color, cycle_done: bool) -> void:
	var lvl: int = int(Js.num((_d["prestige"] as Dictionary).get(z[0])))
	var boost: int = int(Js.num((_d["goldenBoosts"] as Dictionary).get(z[0])))
	var claimed: bool = (_d["zoneRewardsClaimed"] as Dictionary).get(z[0], false)
	var reward: float = FishingRules.zone_reward_doubloons(z[0], lvl)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_content.add_child(row)
	var stars: String = ""
	for i: int in 5:
		stars += "★" if i < lvl else "☆"
	_t(row, stars, 18, Color("#f0c040") if lvl >= 5 else zc)
	if lvl >= 5:
		_t(row, "Max Prestige", 13, Color("#f0c040"), true)
	if boost > 0:
		_t(row, "✦ +%d%% goldens" % (boost * 10), 13, Color("#f0c040"))
	var spacer: Control = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	if not cycle_done:
		_t(row, "Reward claimed" if claimed else "%s ⟡ when every fish is charted" % Js.thousands(reward), 13, DIM)
	elif not claimed:
		var b: Button = Button.new()
		b.text = "Claim %s ⟡" % Js.thousands(reward)
		b.pressed.connect(func() -> void:
			var r: Dictionary = await session.act("claimZoneReward", [z[0]])
			session.persist()
			if r.has("error"):
				b.text = r["error"]
				return
			_reload())
		row.add_child(b)
	else:
		var b: Button = Button.new()
		b.text = "✦ Wipe for +10% goldens" if lvl >= 5 else "★ Prestige %d" % (lvl + 1)
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


func _grid(list: Array) -> void:
	var g: HFlowContainer = HFlowContainer.new()
	g.add_theme_constant_override("h_separation", 8)
	g.add_theme_constant_override("v_separation", 8)
	_content.add_child(g)
	for e: Dictionary in list:
		g.add_child(_card(e))


func _tier(e: Dictionary) -> String:
	if e["pbLength"] == null or e["lengthMin"] == null or e["lengthMax"] == null:
		return ""
	var t: String = Rules.tier_for_length(float(e["pbLength"]), float(e["lengthMin"]), float(e["lengthMax"]))
	return t.capitalize()


func _card(e: Dictionary) -> Control:
	var b: Button = Button.new()
	b.custom_minimum_size = Vector2(148, 128)
	var caught: bool = e["everCaught"]
	var col: VBoxContainer = VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	b.add_child(col)
	var top: HBoxContainer = HBoxContainer.new()
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(top)
	var new_l: Label = _t(top, "NEW" if e["isNew"] else "", 10, Color("#4ade80"), true)
	new_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if _tier(e) == "Trophy":
		_t(top, "🏆" if false else "✦", 12, Color("#f0c040") if e["everGolden"] else Color("#c8d2e0"))
	var art: TextureRect = TextureRect.new()
	art.texture = Skipper.tex("fish/%s" % ResultCard.fish_art_path(e["name"]).get_file())
	art.custom_minimum_size = Vector2(120, 64)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not caught:
		art.modulate = Color(0, 0, 0, 0.26)
	col.add_child(art)
	var n: Label = _t(col, e["name"] if caught else "???", 13, INK if caught else DIM)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	n.clip_text = true
	n.custom_minimum_size = Vector2(140, 0)
	var note: String = ""
	match _view:
		"Newly Logged", "Newest":
			note = _date(e["firstCaughtAt"])
		"Still Missing", "Rarest":
			note = RARITY[clampi(int(e["rarity"]) - 1, 0, 4)][0]
		"Most Caught":
			note = "×%d" % int(e["count"])
		"Biggest":
			note = FishingHud.length_text(float(e["pbLength"]))
		"Most Valuable":
			note = "%s ⟡" % Js.thousands(float(e["sellValue"]))
	if note != "":
		var nl: Label = _t(col, note, 11, DIM)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.disabled = not caught
	b.pressed.connect(func() -> void: _species(e))
	return b


static func _date(iso: Variant) -> String:
	var ms: float = Js.parse_ms(iso)
	if is_nan(ms):
		return ""
	var d: Dictionary = Time.get_datetime_dict_from_unix_time(int(ms / 1000.0))
	var months: Array = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
	return "%d %s %d" % [d["day"], months[int(d["month"]) - 1], d["year"]]


## A species, opened: its art, what the book knows, and the facts.
func _species(e: Dictionary) -> void:
	var panel: VBoxContainer = _panel(560)
	var zone: String = ""
	for z: Array in ZONES:
		if z[0] == e["habitat"]:
			zone = z[1]
	_t(panel, zone.to_upper(), 11, DIM, true)
	var art: TextureRect = TextureRect.new()
	art.texture = Skipper.tex("fish/%s" % ResultCard.fish_art_path(e["name"]).get_file())
	art.custom_minimum_size = Vector2(0, 150)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	panel.add_child(art)
	_t(panel, e["name"], 26, INK, true)
	var r: Array = RARITY[clampi(int(e["rarity"]) - 1, 0, 4)]
	_t(panel, r[0] + ("  ·  Golden taken" if e["everGolden"] else ""), 13, Color(r[1]), true)
	if e["scientificName"] != null:
		_t(panel, e["scientificName"], 13, DIM)
	var goldens: int = 0
	for g: Dictionary in _d["goldens"]:
		if float(g["fishId"]) == float(e["id"]):
			goldens += 1
	_row(panel, "Caught", str(int(e["count"])))
	_row(panel, "Goldens", str(goldens))
	_row(panel, "Worth", "%s ⟡" % Js.thousands(float(e["sellValue"])))
	if e["pbLength"] != null:
		_row(panel, "Your best", "%s%s" % [FishingHud.length_text(float(e["pbLength"])), ("  ·  " + _tier(e)) if _tier(e) != "" else ""])
	if e["funFact"] != null:
		_t(panel, e["funFact"], 14, Color(0.9, 0.85, 0.75, 0.85), false, true)
	_row(panel, "Difficulty", "%d/5" % int(e["difficulty"]))
	if e["sizeCategory"] != null:
		_row(panel, "Size class", String(e["sizeCategory"]).capitalize())
	if e["dietType"] != null:
		_row(panel, "Diet", String(e["dietType"]).capitalize())
	if e["region"] != null:
		_row(panel, "Region", e["region"])
	_row(panel, "First caught", _date(e["firstCaughtAt"]))
	_row(panel, "Last caught", _date(e["lastCaughtAt"]))
	if e["pbAt"] != null:
		_row(panel, "Best landed", _date(e["pbAt"]))


func _row(parent: Control, k: String, v: String) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	parent.add_child(row)
	var kl: Label = _t(row, k, 14, DIM)
	kl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_t(row, v, 15, INK)


## A floating panel over the book (a species, a question, the release).
func _panel(w: float) -> VBoxContainer:
	if _overlay != null:
		_overlay.queue_free()
	_overlay = Control.new()
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_overlay)
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0, 0, 0, 0.6)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed and _overlay != null:
			_overlay.queue_free()
			_overlay = null)
	_overlay.add_child(shade)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(center)
	var card: PanelContainer = PanelContainer.new()
	card.add_theme_stylebox_override("panel", UiTheme.card())
	card.custom_minimum_size = Vector2(w, 0)
	center.add_child(card)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	card.add_child(col)
	return col


func _ask(title: String, body: String, yes: String, no: String, on_yes: Callable) -> void:
	var p: VBoxContainer = _panel(460)
	_t(p, title, 22, INK, true)
	_t(p, body, 15, DIM, false, true)
	var row: HBoxContainer = HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 10)
	p.add_child(row)
	var n: Button = Button.new()
	n.text = no
	n.pressed.connect(func() -> void:
		_overlay.queue_free()
		_overlay = null)
	row.add_child(n)
	if yes != "":
		var y: Button = Button.new()
		y.text = yes
		y.pressed.connect(func() -> void:
			_overlay.queue_free()
			_overlay = null
			on_yes.call())
		row.add_child(y)
	n.grab_focus.call_deferred()


# ── The Goldens ────────────────────────────────────────────────────────────────

func _goldens() -> void:
	var all: Array = _d["goldens"]
	var kept: Array = all.filter(func(g: Dictionary) -> bool: return g["status"] != "sold")
	if kept.is_empty():
		if all.is_empty():
			_t(_content, "No goldens yet", 22, INK, true)
			_t(_content, "A perfect catch rolls 1 in 1,000 for a golden. Land enough perfects and the sea pays one out.", 15, DIM, false, true)
		else:
			_t(_content, "Nothing on the wall", 22, INK, true)
			_t(_content, "You have landed %d in your time and sold every one. Keep the next." % all.size(), 15, DIM, false, true)
		return
	var sold: float = 0.0
	var species: Dictionary = {}
	for g: Dictionary in all:
		if g["status"] == "sold":
			sold += Js.num(g.get("soldFor"))
	for g: Dictionary in kept:
		species[g["fishId"]] = true
	var strip: HBoxContainer = HBoxContainer.new()
	strip.add_theme_constant_override("separation", 30)
	_content.add_child(strip)
	for pair: Array in [["Mounted", str(kept.size())], ["Species", str(species.size())], ["Ever landed", str(all.size())], ["Sold for", "%s ⟡" % Js.thousands(sold)]]:
		var c: VBoxContainer = VBoxContainer.new()
		strip.add_child(c)
		_t(c, pair[1], 22, Color("#f0c040"), true)
		_t(c, pair[0], 12, DIM)
	var g2: HFlowContainer = HFlowContainer.new()
	g2.add_theme_constant_override("h_separation", 10)
	_content.add_child(g2)
	for g: Dictionary in kept:
		var box: VBoxContainer = VBoxContainer.new()
		box.custom_minimum_size = Vector2(228, 0)
		g2.add_child(box)
		var art: TextureRect = TextureRect.new()
		art.texture = Skipper.tex("fish/%s" % ResultCard.fish_art_path(g["name"]).get_file())
		art.custom_minimum_size = Vector2(228, 110)
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		var m: ShaderMaterial = ShaderMaterial.new()
		m.shader = load("res://game/golden.gdshader")
		art.material = m
		box.add_child(art)
		_t(box, g["name"], 16, INK, true)
		_t(box, FishingHud.length_text(Js.num(g.get("sizeIn"))) if g.get("sizeIn") != null else "unmeasured", 13, DIM)
		_t(box, _date(g["caughtAt"]), 12, DIM)


# ── The Giants ─────────────────────────────────────────────────────────────────

func _giants() -> void:
	var unlocked: bool = _d["vigilUnlocked"]
	var vigil: Dictionary = _d["vigil"]
	var caught: Array = _d["ancientCatches"]
	var head: HBoxContainer = HBoxContainer.new()
	_content.add_child(head)
	var t: Label = _t(head, "The Ancient Deep", 24, INK, true)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if unlocked:
		var total: float = Vigil.total(vigil)
		_t(head, "%d/30 Vigil" % int(total), 16, Color("#f0c040") if total >= 30 else Color("#c9a7ff"), true)
	else:
		_t(head, "%d/6" % caught.size(), 16, Color("#c9a7ff"), true)
	_t(_content, "Finn is done, and the six are stirring again. Put one back in the water and it will come up harder than it did the first time." if unlocked else "Six things that should not still be down there. They fetch nothing at market because nobody would dare buy one.", 14, DIM, false, true)
	var grid: HFlowContainer = HFlowContainer.new()
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
		var slab: Button = Button.new()
		slab.custom_minimum_size = Vector2(330, 118)
		var fr: Array = FRAME[rank]
		var st: StyleBoxFlat = StyleBoxFlat.new()
		st.bg_color = Color(0.03, 0.03, 0.05, 0.9)
		st.set_corner_radius_all(14)
		st.set_border_width_all(1 if rank < 2 else (3 if rank == 5 else 2))
		st.border_color = Color(fr[1], 0.7) if got and unlocked and not released else Color(0.47, 0.59, 0.7, 0.42)
		for state: String in ["normal", "hover", "pressed", "disabled", "focus"]:
			slab.add_theme_stylebox_override(state, st)
		var col: VBoxContainer = VBoxContainer.new()
		col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		col.offset_left = 16
		col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.alignment = BoxContainer.ALIGNMENT_CENTER
		slab.add_child(col)
		var art: TextureRect = TextureRect.new()
		art.texture = Skipper.tex("fish/%s" % ResultCard.fish_art_path(name).get_file())
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		art.anchor_left = 0.5
		art.anchor_right = 1.0
		art.anchor_bottom = 1.0
		art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slab.add_child(art)
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
			sub = "Raised"
			if rank >= 5 and unlocked:
				var m: ShaderMaterial = ShaderMaterial.new()
				m.shader = load("res://game/golden.gdshader")
				art.material = m
		_t(col, eyebrow.to_upper(), 11, Color(fr[1]) if got and unlocked else DIM, true)
		_t(col, name, 20, INK, true)
		var sl: Label = _t(col, sub, 12, DIM, false, true)
		sl.custom_minimum_size = Vector2(160, 0)
		slab.disabled = not (unlocked and got)
		slab.pressed.connect(func() -> void: _giant(id, name, rank, released))
		grid.add_child(slab)


func _giant(id: float, name: String, rank: int, released: bool) -> void:
	var p: VBoxContainer = _panel(500)
	_t(p, name, 24, INK, true)
	if released:
		_t(p, "It is out there now, and it will not come up for ordinary bait. Take a Golden or Luminous Lure down to the Ancient Deep and land it on a perfect to raise its rank.", 15, DIM, false, true)
		return
	if rank >= 5:
		_t(p, "Mastered. There is nothing left this one can teach you.", 15, DIM, false, true)
		return
	_t(p, "Release for Rank %d" % (rank + 1), 16, Color("#c9a7ff"), true)
	_t(p, TELL.get(int(id), ""), 15, DIM, false, true)
	for c: String in Almanac.vigil_changes(rank + 1):
		_t(p, "· " + c, 14, DIM, false, true)
	var b: Button = Button.new()
	b.text = "Release it"
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
	_t(p, "GIVE IT BACK", 12, Color("#e0455a"), true)
	_t(p, name, 24, INK, true)
	_t(p, TELL.get(int(id), ""), 14, DIM, false, true)
	_t(p, "Your wall is one short until you land it again. Come back with it on a perfect and it mounts at Rank %d." % (rank + 1), 14, DIM, false, true)
	var bar: ProgressBar = ProgressBar.new()
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 10)
	p.add_child(bar)
	var hold: Button = Button.new()
	hold.text = "Hold to release"
	p.add_child(hold)
	var leave: Button = Button.new()
	leave.text = "Leave it on the wall"
	leave.pressed.connect(func() -> void:
		_overlay.queue_free()
		_overlay = null)
	p.add_child(leave)
	var state: Dictionary = { "held": false, "done": false, "p": 0.0, "last": 0 }
	hold.button_down.connect(func() -> void:
		state["held"] = true
		hold.text = "Keep holding…")
	hold.button_up.connect(func() -> void:
		state["held"] = false
		if not state["done"]:
			hold.text = "Hold to release")
	var tick: Callable = func(delta: float) -> void:
		pass
	var timer: Timer = Timer.new()
	timer.wait_time = 1.0 / 60.0
	timer.autostart = true
	p.add_child(timer)
	timer.timeout.connect(func() -> void:
		if state["done"]:
			return
		var dt: float = timer.wait_time
		state["p"] = clampf(float(state["p"]) + (dt / 1.6 if state["held"] else -dt / 0.8), 0.0, 1.0)
		bar.value = 100.0 * float(state["p"])
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
				_t(p, r["error"], 15, Color("#f0a890"))
				return
			_t(p, "It wakes", 20, Color("#e0455a"), true)
			_t(p, "The eye opens. It turns for the dark, and it remembers you.", 15, DIM, false, true)
			await get_tree().create_timer(1.5).timeout
			_reload()
			var q: VBoxContainer = _panel(460)
			_t(q, "%s is back in the deep" % name, 22, INK, true)
			_t(q, "Its berth is empty until you bring it home. It will only rise for a Golden or Luminous Lure.", 15, DIM, false, true)
			var c: Button = Button.new()
			c.text = "Close"
			c.pressed.connect(func() -> void:
				_overlay.queue_free()
				_overlay = null)
			q.add_child(c)
			c.grab_focus.call_deferred())
	hold.grab_focus.call_deferred()
	tick.call(0.0)


# ── The Pets ───────────────────────────────────────────────────────────────────

func _pets() -> void:
	_t(_content, "Nearly every one came out of a crate, from about 1 in 200 wooden ones up to 1 in 10 Ancient Chests. When one does turn up, this is how often it is each of them.", 14, DIM, false, true)
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
		var head: HBoxContainer = HBoxContainer.new()
		_content.add_child(head)
		var t: Label = _t(head, String(species).capitalize(), 20, INK, true)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_t(head, "✦ complete" if got == list.size() else "%d/%d" % [got, list.size()], 14, Color("#f0c040") if got == list.size() else DIM, true)
		var g: HFlowContainer = HFlowContainer.new()
		g.add_theme_constant_override("h_separation", 10)
		_content.add_child(g)
		for pet: Dictionary in list:
			var has: bool = Js.includes(owned, pet["id"])
			var box: VBoxContainer = VBoxContainer.new()
			box.custom_minimum_size = Vector2(150, 0)
			g.add_child(box)
			var art: TextureRect = TextureRect.new()
			art.texture = Skipper.tex(pet["restImageUrl"])
			art.custom_minimum_size = Vector2(150, 90)
			art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			if not has:
				art.modulate = Color(0, 0, 0, 0.3)
			box.add_child(art)
			_t(box, pet["name"] if has else "???", 14, INK if has else DIM, true)
			var share: String = "Never from a crate"
			if not pet["earnedOnly"] and wsum > 0 and vsum > 0:
				share = "%.1f%% of finds" % (100.0 * float(weights.get(species, 0.0)) / wsum * float(pet["weight"]) / vsum)
			_t(box, share, 12, DIM)


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
	_t(_content, "%d of %d charted  ·  %d%%" % [charted, all.size(), int(Js.round(100.0 * charted / maxf(1.0, all.size())))], 20, INK, true)
	var strip: HBoxContainer = HBoxContainer.new()
	strip.add_theme_constant_override("separation", 40)
	_content.add_child(strip)
	for pair: Array in [["Catches", catches], ["Casts", st["casts"]], ["Perfects", st["perfects"]], ["Trophies", st["trophySizeCatches"]]]:
		var c: VBoxContainer = VBoxContainer.new()
		strip.add_child(c)
		_t(c, Js.thousands(float(pair[1])), 24, Color("#f0c040"), true)
		_t(c, pair[0], 12, DIM)
	_t(_content, "The Career", 20, INK, true)
	var goldens: Array = _d["goldens"]
	for pair: Array in [["Best perfect streak", st["bestPerfectStreak"]], ["Crates opened", st["cratesOpened"]], ["Double catches", st["doubleCatches"]], ["Rod jackpots", st["jackpots"]], ["Snags", st["snags"]], ["Fishing XP", st["fishingXP"]], ["Goldens landed", goldens.size()], ["Species met", met]]:
		_row(_content, pair[0], Js.thousands(float(pair[1])))
	_t(_content, "Prestige", 20, INK, true)
	for z: Array in ZONES:
		if z[0] != "ancient_deep":
			_row(_content, z[1], "✦ %d" % int(Js.num((_d["prestige"] as Dictionary).get(z[0]))))
	var top: Array = all.filter(func(e: Dictionary) -> bool: return float(e["count"]) > 0)
	top.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["count"]) > float(b["count"]))
	if top.size() > 0:
		_t(_content, "Most Caught", 20, INK, true)
		for i: int in mini(5, top.size()):
			_row(_content, top[i]["name"], "×%d" % int(top[i]["count"]))
	_t(_content, "Crates Opened", 20, INK, true)
	var opens: Dictionary = st["crateOpens"]
	if opens.is_empty():
		_t(_content, "Nothing counted yet. The next crate you crack starts the tally.", 14, DIM)
	for tier: Variant in opens:
		_row(_content, String(tier).capitalize(), Js.thousands(float(opens[tier])))
	var baits: Dictionary = st["baitUsed"]
	if not baits.is_empty():
		_t(_content, "Bait Burned", 20, INK, true)
		for b: Variant in baits:
			_row(_content, Rules.bait(b)["name"], Js.thousands(float(baits[b])))
	_t(_content, "The Ledger", 20, INK, true)
	_row(_content, "Worth landed", "%s ⟡" % Js.thousands(worth))
	_row(_content, "Earned selling", "%s ⟡" % Js.thousands(float(st["doubloonsFromFish"])))
	_row(_content, "Fish sold", Js.thousands(float(st["fishSoldCount"])))
	_row(_content, "Best single sale", "%s ⟡" % Js.thousands(float(st["biggestSale"])))
