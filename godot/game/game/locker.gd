class_name Locker
extends Control
## THE LOCKER (Kong, 2026-10-01: "rethink the menus now that we're in Godot;
## improve the inventory and loadouts"). One screen for what she carries,
## replacing the web's Loadout, Bait and Hold sheets, on paper.
##
## The sea does not go away: the camera pushes in on HER boat and sets it to
## the left (Sea.stage), the world dims round it, and the right of the screen
## is a sheet of paper. LOADOUT: the slots (Rod, Bait, Look, Hat, Boat, Pet);
## what you own as tiles on watercolour blots, the worn one circled in red; hover to
## try it on the real boat, press to wear it. Rods and bait show what they
## do to the dial against what you have now, on a small painted dial. HOLD:
## one pip per space in the hold, coloured by what fills it; every fish
## aboard as a tile; what it all fetches at the Market against this water's
## buyer. LOG opens the Almanac. Equip only; nothing is bought here, and
## nothing you do not own is listed. No rule is changed by this screen.

signal closed

const SLOTS: Array = [["rod", "Rod"], ["bait", "Bait"], ["special", "Special"], ["skin", "Look"], ["hat", "Hat"], ["pet", "Pet"]]
const HOW_TO_GET: Dictionary = {
	"rod": "New rods are sold at the Tackle Shop. Stronger ones unlock as your Fishing level climbs.",
	"bait": "Bait is sold at the Tackle Shop, by the traders out on the water, and found in crates.",
	"skin": "Looks unlock with achievement points (see the Fishing Guide), and come from nowhere else.",
	"hat": "Hats are bought with doubloons. A few only come out of crates.",
	"pet": "Pets come out of supply crates.",
	"special": "One special rides with you. The Auto Caster is sold at the Tackle Shop; the others come back from voyages.",
}
const PANEL_W: float = 620.0

var sea: Sea
var hud: FishingHud
var session: Session
var tab: String = "loadout"
var slot: String = "rod"

var _body: VBoxContainer
var _tabs: HBoxContainer
var _veil: ColorRect
var _card: Control
var _card_eyebrow: Label
var _card_title: Label
var _card_body: Label
var _gauge: ZoneGauge
var _compare: VBoxContainer
var _note: Label
var _hold_sort: String = "value"
var _hold_detail: Label
var _trying: Array = ["__"]
var _panel: Control
var _almanac: Almanac


func _ready() -> void:
	session = sea.session
	# The fishing side: the day's paper.
	set_meta("night_root", false)
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var vp: Vector2 = get_viewport_rect().size
	_stage(tab)
	# The world dims round her.
	_veil = ColorRect.new()
	_veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var vm: ShaderMaterial = ShaderMaterial.new()
	vm.shader = load("res://game/fx/locker_veil.gdshader")
	_veil.material = vm
	add_child(_veil)
	_build_card()
	# The sheet.
	var panel: Control = Control.new()
	panel.anchor_left = 1.0
	panel.anchor_right = 1.0
	panel.anchor_bottom = 1.0
	panel.offset_left = -PANEL_W - 22.0
	panel.offset_right = -22.0
	panel.offset_top = 22.0
	panel.offset_bottom = -22.0
	add_child(panel)
	_panel = panel
	var shadow: Pane = Kit.pane(panel, { "radius": 14, "fill": [Color(0, 0, 0, 0)], "shadow": [Color(0, 0, 0, 0.45), 26, Vector2(0, 8)], "pad": 0 })
	shadow.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shadow.offset_left = 10
	shadow.offset_right = -10
	shadow.offset_top = 10
	shadow.offset_bottom = -10
	Paper.sheet(panel, 8.0)
	var margin: MarginContainer = MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, 34)
	margin.add_theme_constant_override("margin_top", 28)
	margin.add_theme_constant_override("margin_bottom", 26)
	panel.add_child(margin)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)
	# THE shared header: the title and its line, Close on the right, the tabs
	# on their own row, the rule.
	var head: Dictionary = Paper.header(col, "The Locker", "", close)
	Paper.text(head["titles"] as VBoxContainer, "What she carries, and what it does.", "note", Paper.INK_SOFT)
	_tabs = head["tabs"]
	_tabs.visible = true
	_body = VBoxContainer.new()
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 10)
	col.add_child(_body)
	Motion.panel_in(panel)
	_show_tab(tab)


## The camera pushes in on her boat beside the sheet; not for the Log, whose
## book covers nearly the whole screen (Kong: the push in and back out read
## as a strange zoom there).
func _stage(t: String) -> void:
	sea.stage = null if t == "log" else { "zoom": 2.3, "shift": Vector2((PANEL_W + 40.0) / 2.0, 30.0) }


func close() -> void:
	if Motion.closing(self):
		return
	sea.stage = null
	if _almanac != null and is_instance_valid(_almanac):
		_almanac.mark_read()
	_wear(Skipper.look_of(session.profile()))
	closed.emit()
	if _card.visible:
		Motion.leave(_card, false)
	Motion.dismiss(self, _panel, _veil)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back") or event.is_action_pressed("locker"):
		get_viewport().set_input_as_handled()
		close()
	elif event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_TAB:
		get_viewport().set_input_as_handled()
		var order: Array = ["loadout", "boat", "hold", "crates", "orders", "log"]
		_show_tab(order[(order.find(tab) + 1) % order.size()])


func _process(_delta: float) -> void:
	var at: Vector2 = sea._boat.get_global_transform_with_canvas().origin
	var m: ShaderMaterial = _veil.material
	m.set_shader_parameter("u_focus", at)
	m.set_shader_parameter("u_res", get_viewport_rect().size)


func line_out() -> bool:
	return not (hud.phase == "idle" or hud.phase == "result")


# ── Tabs ───────────────────────────────────────────────────────────────────────

func _show_tab(t: String) -> void:
	tab = t
	_stage(t)
	for c: Node in _tabs.get_children():
		_tabs.remove_child(c)
		c.queue_free()
	for o: Array in [["loadout", "Loadout"], ["boat", "Boat"], ["hold", "Hold"], ["crates", "Crates%s" % ("  %d" % _crate_count() if _crate_count() > 0 else "")], ["orders", "Orders"], ["log", "Log"]]:
		var b: Pane.PaneButton = Paper.tab(o[1], o[0] == t, false)
		b.tooltip_text = "Tab to switch"
		b.pressed.connect(func() -> void: _show_tab(o[0]))
		_tabs.add_child(b)
	if _almanac != null and is_instance_valid(_almanac) and t != "log":
		_almanac.mark_read()
	_almanac = null
	for c: Node in _body.get_children():
		c.queue_free()
	_gauge = null
	_card.visible = t == "loadout" or t == "boat"
	_widen(t == "log")
	if t == "boat":
		slot = "boat"
	elif t == "loadout" and slot == "boat":
		slot = "rod"
	if t == "loadout":
		_build_loadout()
	elif t == "boat":
		_build_boat()
	elif t == "hold":
		_build_hold()
	elif t == "crates":
		_build_crates()
	elif t == "orders":
		_build_orders()
	else:
		_build_log()


## The Log is a book: the sheet opens out to nearly the whole width, over
## the boat; the other tabs fold it back.
func _widen(wide: bool) -> void:
	if _panel == null:
		return
	var vp: Vector2 = get_viewport_rect().size
	var goal: float = -(vp.x - 44.0) if wide else -PANEL_W - 22.0
	if is_equal_approx(_panel.offset_left, goal):
		return
	var tw: Tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(_panel, "offset_left", goal, 0.32)


# ── Orders ─────────────────────────────────────────────────────────────────────

## THE DAY'S ORDERS (core/orders.gd): three orders, each claimed for its
## doubloons; all three claimed, the board is swept for a fishing crate and a
## new board comes up at once. The Master order (Fishing 75) runs beside it.
func _build_orders() -> void:
	var st: Dictionary = RulesApi.run(session.store, session.uid, "ordersState", [])
	Paper.text(_body, "BOARD %d" % int(st["board"]), "eyebrow", Paper.INK_SOFT)
	Paper.text(_body, "Claim each order for its doubloons. Claim all three and sweep the board for a fishing crate; a new board comes up at once. Nothing expires.", "note", Paper.INK_SOFT, true)
	for i: int in 3:
		_order_row(st["orders"][i], float(st["progress"][i]), st["claimed"][i] == true, i, "Claim  ·  %s ⟡" % Js.thousands(float(st["orders"][i]["reward"])))
	var sw: Pane.PaneButton = Paper.button("Sweep the board  ·  a fishing crate", st["sweepable"])
	sw.disabled = not st["sweepable"]
	sw.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	sw.pressed.connect(func() -> void: _order_act("sweepOrders", []))
	_body.add_child(sw)
	var m: Dictionary = st["master"]
	Paper.rule(_body)
	Paper.text(_body, "THE MASTER ORDER", "eyebrow", Paper.INK_SOFT)
	if m.is_empty():
		Paper.text(_body, "Opens at Fishing %d: a harder order of its own, paid with a crate of any tier." % int(Rules.data()["daily"]["masterMinLevel"]), "note", Paper.INK_SOFT, true)
		return
	_order_row(m, float(st["masterProgress"]), false, 3, "Claim  ·  a crate")


func _order_row(c: Dictionary, got: float, claimed: bool, i: int, claim_label: String) -> void:
	var target: float = float(c["target"])
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	_body.add_child(row)
	var v: VBoxContainer = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 3)
	row.add_child(v)
	Paper.text(v, str(c["label"]), "body_strong", Paper.INK if not claimed else Paper.INK_FAINT)
	# THE progress bar (Kit.bar), on the day paper.
	var frac: float = clampf(got / maxf(1.0, target), 0.0, 1.0)
	_bar(v, frac, Paper.GREEN if frac >= 1.0 else Color(Paper.INK, 0.45))
	Paper.text(v, "%s of %s" % [Js.thousands(minf(got, target)), Js.thousands(target)], "small", Paper.INK_SOFT)
	if claimed:
		Paper.text(row, "Claimed", "small", Paper.INK_FAINT)
	elif got >= target:
		var b: Pane.PaneButton = Paper.button(claim_label, true)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void: _order_act("claimOrder", [i]))
		row.add_child(b)
	else:
		var rw: Label = Paper.text(row, claim_label.trim_prefix("Claim  ·  "), "small", Paper.INK_FAINT)
		rw.size_flags_vertical = Control.SIZE_SHRINK_CENTER


## Kit.bar on the paper (its track inked for it).
static func _bar(parent: Node, frac: float, col: Color) -> void:
	var w: VBoxContainer = VBoxContainer.new()
	w.set_meta("paper", true)
	w.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(w)
	Kit.bar(w, frac, col)


func _order_act(op: String, args: Array) -> void:
	var r: Variant = await session.act(op, args)
	session.persist()
	if r is Dictionary and (r as Dictionary).has("error"):
		Sound.slack()
		hud.toast(str(r["error"]))
	elif r is Dictionary and (r as Dictionary).has("crate"):
		Sound.chest(true)
		hud.toast("%s stowed with your crates." % CrateMoment.TIERS.get(str(r["crate"]), CrateMoment.TIERS["wooden"])[0])
	else:
		Sound.chest(false)
	hud.refresh()
	_show_tab("orders")


# ── Boat ───────────────────────────────────────────────────────────────────────

## THE BOAT (Kong, 2026-10-01): her hull to wear (from crates) and what she
## is fitted with: each upgrade's reading now, its tier, and how the next one
## comes (free at a Fishing level, or bought at the Shipyard behind one).
func _build_boat() -> void:
	Paper.text(_body, "Her look", "eyebrow", Paper.INK_SOFT)
	Paper.text(_body, "Boats come only from fishing crates. Hover one to see it on her; press to sail it.", "note", Paper.INK_SOFT, true)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 8)
	_body.add_child(grid)
	var worn: Variant = _worn("boat")
	var opts: Array = _options("boat")
	if opts.is_empty():
		Paper.text(grid, "Just the hull she came with.", "note", Paper.INK_SOFT)
	for o: Array in opts:
		var t: Paper.Tile = Paper.Tile.new()
		t.on = o[0] != null and worn != null and str(o[0]) == str(worn)
		t.label = o[1]
		t.art = Skipper.tex(o[2]) if o[2] != "" else null
		t.pigment = o[3]
		t.custom_minimum_size = Vector2(124, 104)
		t.mouse_entered.connect(func() -> void: _try_on(o))
		t.mouse_exited.connect(func() -> void: _try_on([]))
		t.pressed.connect(func() -> void: _choose(o[0]))
		grid.add_child(t)
	Paper.rule(_body)
	Paper.text(_body, "Her fittings", "eyebrow", Paper.INK_SOFT)
	var lvl: int = session.level()
	for l: Array in ShipyardRoom.LADDERS:
		var col: String = l[5]
		var cur: int = int(Js.num(session.profile().get(col)))
		var mx: int = (Rules.data()["fishHoldTiers"] as Array).size() - 1 if l[0] == "hold" else Shipyard.max_tier(col)
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		_body.add_child(row)
		var name: Label = Paper.text(row, l[2], "body_strong", Paper.INK)
		name.custom_minimum_size = Vector2(96, 0)
		Paper.text(row, ShipyardRoom._value(l[0], float(cur)), "value", Paper.INK)
		var pips: Label = Paper.text(row, "  " + "●".repeat(cur + 1) + "○".repeat(mx - cur), "small", Color(l[3]).darkened(0.35))
		pips.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var nxt: String = "Fully fitted"
		if cur < mx:
			var free_lv: int = ShipyardRoom._free_at(l, cur + 1)
			var gate_lv: int = ShipyardRoom._gate_at(l, cur + 1)
			if free_lv > 0:
				nxt = "Next free at Fishing %d" % free_lv
			elif gate_lv > lvl:
				nxt = "Next: Fishing %d, then %s ⟡ at the Shipyard" % [gate_lv, Js.thousands(ShipyardRoom._cost(l[0], cur + 1))]
			else:
				nxt = "Next: %s ⟡ at the Shipyard" % Js.thousands(ShipyardRoom._cost(l[0], cur + 1))
		Paper.text(row, nxt, "note", Paper.INK_SOFT)
	_trying = ["__"]
	_try_on([])


# ── Crates ─────────────────────────────────────────────────────────────────────

var _opening: bool = false


func _stash() -> Dictionary:
	return Js.obj(session.profile().get("crate_stash"))


func _crate_count() -> int:
	var n: int = 0
	for k: Variant in _stash():
		n += int(Js.num(_stash()[k]))
	return n


## THE CRATES (Kong, 2026-10-01): every crate there is, with how many are
## stowed, and the chosen one's whole drop table: what is always inside (the
## doubloons and the bait, with their odds), every cosmetic it can hold (by
## band) and the pets in its own set, the ones you have in colour with a
## tick and the ones you lack in grey pencil, and how much of it you have
## collected. Collect everything a crate can give and it is complete.
var _crate_sel: String = ""
const TIER_ORDER: Array = ["wooden", "metal", "gold", "diamond", "ancient"]
const BAND_PIGMENT: Dictionary = { "common": Color(0.52, 0.5, 0.46), "uncommon": Color(0.3, 0.58, 0.36), "rare": Color(0.28, 0.46, 0.72), "epic": Color(0.55, 0.34, 0.7) }


func _build_crates() -> void:
	var stash: Dictionary = _stash()
	if _crate_sel == "":
		_crate_sel = "wooden"
		for t: String in TIER_ORDER:
			if Js.num(stash.get(t)) > 0.0:
				_crate_sel = t
	# The crates, in a row.
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_body.add_child(row)
	for tier: String in TIER_ORDER:
		var t: Array = CrateMoment.TIERS[tier]
		var n: int = int(Js.num(stash.get(tier)))
		var got: Array = _crate_collection(tier)
		var tile: Paper.Tile = Paper.Tile.new()
		tile.on = tier == _crate_sel
		tile.label = str(t[0]).replace(" Crate", "").replace(" Chest", "")
		tile.art = CrateMoment._tex("%sclosed.png" % t[2])
		tile.pigment = Color(t[1]).darkened(0.2)
		tile.corner = ("×%d" % n) if n > 0 else ""
		tile.custom_minimum_size = Vector2(100, 104)
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tile.tooltip_text = "%s: %d of %d collected" % [t[0], got[0], got[1]]
		tile.pressed.connect(func() -> void:
			_crate_sel = tier
			_show_tab("crates"))
		row.add_child(tile)
	Paper.rule(_body)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var col: VBoxContainer = VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 8)
	scroll.add_child(col)
	_crate_table(col, _crate_sel, int(Js.num(stash.get(_crate_sel))))


## [collected, total] of what a crate can give that can be collected.
func _crate_collection(tier: String) -> Array:
	var have: int = 0
	var total: int = 0
	for e: Array in _crate_cosmetics(tier):
		total += 1
		if e[3]:
			have += 1
	for p: Array in _crate_pets(tier):
		total += 1
		if p[3]:
			have += 1
	return [have, total]


## The cosmetics a tier can hold: [entry, band, art, owned], best band first.
func _crate_cosmetics(tier: String) -> Array:
	var c: Dictionary = Rules.data()["crate"]
	var bands: Dictionary = Js.obj(Js.obj(c.get("cosmeticBands")).get(tier))
	var rarity: Dictionary = Js.obj(c.get("cosmeticRarity"))
	var p: Dictionary = session.profile()
	var out: Array = []
	if float(Js.nz((c["outcomeWeights"][tier] as Dictionary).get("cosmetic"), 0.0)) <= 0.0:
		return out
	for e: Dictionary in c["cosmeticPool"]:
		var band: String = str(rarity.get("%s:%s" % [e["kind"], e["id"]], "common"))
		if not rarity.is_empty() and float(bands.get(band, 0.0)) <= 0.0:
			continue
		var owned: bool
		var art: Texture2D
		match e["kind"]:
			"skin":
				owned = Js.includes(Js.list(p.get("unlocked_character_colors")), e["id"])
				art = Skipper.look_art(e["id"])
			"boat":
				owned = Js.includes(Js.list(p.get("unlocked_boats")), e["id"])
				art = Skipper.tex(e.get("imageUrl"))
			_:
				owned = Js.includes(Js.list(p.get("unlocked_hats")), e["id"])
				art = Skipper.tex(e.get("imageUrl"))
		out.append([e, band, art, owned])
	var order: Array = ["epic", "rare", "uncommon", "common"]
	out.sort_custom(func(a: Array, b: Array) -> bool: return order.find(a[1]) < order.find(b[1]))
	return out


## The pets a crate can hold (its own set, content/port_rules.json; every
## crate-borne pet without one): [pet, species, art, owned].
func _crate_pets(tier: String) -> Array:
	var owned: Array = Js.list(session.profile().get("unlocked_pets"))
	var own: Array = Js.list(Js.obj(Rules.data()["crate"].get("petTiers")).get(tier))
	var out: Array = []
	for pt: Dictionary in Rules.data()["pets"]:
		if pt["earnedOnly"]:
			continue
		if not own.is_empty() and not Js.includes(own, pt["id"]):
			continue
		out.append([pt, pt["species"], _trimmed(Skipper.tex(pt["restImageUrl"])), Js.includes(owned, pt["id"])])
	return out


static var _trims: Dictionary = {}


## A picture cut to where it is painted (the pet sheets are mostly margin).
static func _trimmed(t: Texture2D) -> Texture2D:
	if t == null:
		return null
	if _trims.has(t.resource_path):
		return _trims[t.resource_path]
	var img: Image = t.get_image()
	var out: Texture2D = t
	if img != null:
		if img.is_compressed():
			img.decompress()
		var r: Rect2i = img.get_used_rect()
		if r.size.x > 0:
			var at: AtlasTexture = AtlasTexture.new()
			at.atlas = t
			at.region = Rect2(r).grow(4.0)
			out = at
	_trims[t.resource_path] = out
	return out


func _crate_table(col: VBoxContainer, tier: String, stowed: int) -> void:
	var c: Dictionary = Rules.data()["crate"]
	var t: Array = CrateMoment.TIERS[tier]
	var got: Array = _crate_collection(tier)
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	col.add_child(head)
	var tv: VBoxContainer = VBoxContainer.new()
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tv.add_theme_constant_override("separation", 0)
	head.add_child(tv)
	Paper.text(tv, t[0], "title", Paper.INK)
	var waters: Array = []
	for h: String in ["shallows", "open_waters", "deep", "abyss", "ancient_deep"]:
		if float(Js.nz((Rules.data()["zones"]["crateTiers"][h] as Dictionary).get(tier), 0.0)) > 0.0:
			for w: Dictionary in Chart.WATERS:
				if w["id"] == h:
					waters.append(w["name"])
	Paper.text(tv, ("Comes up in %s" % ", ".join(PackedStringArray(waters))) if not waters.is_empty() else "Does not come up anywhere", "note", Paper.INK_SOFT)
	if got[0] >= got[1] and got[1] > 0:
		var done_l: Label = Paper.text(head, "Complete", "title", Paper.RED)
		done_l.rotation_degrees = -6.0
	if stowed > 0:
		var b: Pane.PaneButton = Paper.button("Open one  ·  %d stowed" % stowed, true)
		b.custom_minimum_size = Vector2(0, 38)
		b.disabled = _opening
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void: _open_crate(tier))
		head.add_child(b)
	# Collected.
	Paper.text(col, "Collected  %d of %d" % [got[0], got[1]], "value", Paper.INK)
	_bar(col, float(got[0]) / maxf(1.0, float(got[1])), Paper.GREEN)
	# Always inside.
	var w: Dictionary = c["outcomeWeights"][tier]
	var tot: float = float(w["doubloons"]) + float(w["bait"]) + float(w["cosmetic"])
	var r: Array = c["doubloonRange"][tier]
	var baits: Array = []
	for b: Dictionary in c["baitPools"][tier]:
		baits.append(str(Rules.bait(b["type"]).get("name", b["type"])))
	Paper.text(col, "Inside", "eyebrow", Paper.INK_SOFT)
	Paper.stat(col, "Doubloons, %s to %s ⟡" % [Js.thousands(float(r[0])), Js.thousands(float(r[1]))], "%d%%" % int(round(100.0 * float(w["doubloons"]) / tot)))
	Paper.stat(col, "%d bait: %s" % [int(c["baitQty"][tier]), ", ".join(PackedStringArray(baits))], "%d%%" % int(round(100.0 * float(w["bait"]) / tot)))
	Paper.stat(col, "A cosmetic you do not have yet", ("%d%%" % int(round(100.0 * float(w["cosmetic"]) / tot))) if float(w["cosmetic"]) > 0.0 else "None")
	Paper.stat(col, "A pet, as well as the rest", "%s%%" % str(snappedf(float(c["petChance"][tier]) * 100.0, 0.1)))
	# What can be collected.
	var cos: Array = _crate_cosmetics(tier)
	if not cos.is_empty():
		Paper.text(col, "Cosmetics it can hold", "eyebrow", Paper.INK_SOFT)
		var g: GridContainer = GridContainer.new()
		g.columns = 4
		g.add_theme_constant_override("h_separation", 8)
		g.add_theme_constant_override("v_separation", 6)
		col.add_child(g)
		for e: Array in cos:
			var tile: Paper.Tile = Paper.Tile.new()
			tile.label = str((e[0] as Dictionary)["name"])
			tile.art = e[2]
			tile.grey = not e[3]
			tile.pigment = BAND_PIGMENT.get(e[1], Color(0.5, 0.5, 0.5))
			tile.corner = "✓" if e[3] else str(e[1]).capitalize()
			tile.custom_minimum_size = Vector2(124, 112)
			tile.tooltip_text = "%s  ·  %s  ·  %s" % [(e[0] as Dictionary)["name"], str(e[1]).capitalize(), "collected" if e[3] else "not yet"]
			g.add_child(tile)
	Paper.text(col, "Pets it can hold", "eyebrow", Paper.INK_SOFT)
	var pg: GridContainer = GridContainer.new()
	pg.columns = 5
	pg.add_theme_constant_override("h_separation", 6)
	pg.add_theme_constant_override("v_separation", 6)
	col.add_child(pg)
	for pe: Array in _crate_pets(tier):
		var tile: Paper.Tile = Paper.Tile.new()
		tile.label = str((pe[0] as Dictionary)["name"])
		tile.art = pe[2]
		tile.grey = not pe[3]
		tile.pigment = Color(str((pe[0] as Dictionary).get("accentColor", "#7a9a8a"))).darkened(0.2)
		tile.corner = "✓" if pe[3] else ""
		tile.custom_minimum_size = Vector2(96, 96)
		tile.tooltip_text = "%s  ·  %s" % [(pe[0] as Dictionary)["name"], "collected" if pe[3] else "not yet"]
		pg.add_child(tile)


func _open_crate(tier: String) -> void:
	if _opening:
		return
	_opening = true
	var r: Dictionary = await session.act("openCrate", [tier])
	session.persist()
	if r.has("error"):
		hud.toast(str(r["error"]))
		_opening = false
		return
	var cs: CrateSurface = CrateSurface.new()
	cs.tier = tier
	cs.mode = "open"
	cs.loot = r
	cs.boat = sea._boat
	cs.side = -1.0
	sea._boat.get_parent().add_child(cs)
	_show_tab("crates")
	_after_crate(cs, hud, r, self)


## Waits out the crate on the sea, then posts what was found in it. Static, and
## nothing here runs on the Locker unless it is still open: the Locker can be
## shut (Esc, I) while the crate plays, and a coroutine on a freed Locker would
## be dropped with the notices unsent.
static func _after_crate(cs: CrateSurface, h: FishingHud, r: Dictionary, lk: Locker) -> void:
	await cs.done
	if is_instance_valid(lk):
		lk._opening = false
	if not is_instance_valid(h):
		return
	# A notice for the Crew Hall in the crate (port rules, core/crew.gd).
	for nt: Variant in Js.obj(r.get("notices")):
		h.notify("FOUND IN THE CRATE", "A %s" % Js.obj(Crew.notice_defs().get(nt)).get("name", nt), "Post it at the Crew Hall for a fresh board of hopefuls.", Skipper.tex("crew/hall_1.png"))
	# A skin voucher (core/skins.gd): opened in the Crew Hall's Trunk.
	for kv: Variant in Js.obj(r.get("vouchers")):
		var vd: Dictionary = Skins.kind_def(str(kv))
		Sound.chest(kv == "captain")
		h.notify("FOUND IN THE CRATE", "A %s!" % vd.get("name", kv), "Open it in the Crew Hall's Trunk for a crew skin you do not own yet.", Skipper.tex(str(vd.get("art", ""))))
	h.refresh()
	if is_instance_valid(lk) and lk.is_inside_tree() and lk.tab == "crates":
		lk._show_tab("crates")


# ── Log ────────────────────────────────────────────────────────────────────────

func _build_log() -> void:
	var vp: Vector2 = get_viewport_rect().size
	_almanac = Almanac.new()
	_almanac.session = session
	_almanac.embedded = true
	_almanac.book_w = vp.x - 44.0 - 22.0 - 68.0
	_almanac.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_almanac.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_almanac.mouse_filter = Control.MOUSE_FILTER_PASS
	_body.add_child(_almanac)


# ── Loadout ────────────────────────────────────────────────────────────────────

func _build_loadout() -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 5)
	_body.add_child(row)
	for s: Array in SLOTS:
		var b: Pane.PaneButton = Paper.tab(s[1], s[0] == slot, false)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func() -> void: pick_slot(s[0]))
		row.add_child(b)
	_note = Paper.text(_body, HOW_TO_GET[slot], "note", Paper.INK_SOFT, true)
	if slot == "rod" and line_out():
		_note.text = "Rods stay put while a line is in the water. Bring it in to change rods."
		_note.add_theme_color_override("font_color", Paper.RED)
	if slot == "bait" and line_out():
		_note.text = "Bait goes on before the cast. Bring the line in to change it."
		_note.add_theme_color_override("font_color", Paper.RED)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 4
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(grid)
	var worn: Variant = _worn(slot)
	var opts: Array = _options(slot)
	if opts.is_empty():
		Paper.text(grid, "Nothing here yet.", "note", Paper.INK_SOFT)
	for o: Array in opts:
		var t: Paper.Tile = Paper.Tile.new()
		t.on = (o[0] == null and worn == null) or (o[0] != null and worn != null and str(o[0]) == str(worn))
		t.label = o[1]
		t.art = (Skipper.look_art(str(o[2]).trim_prefix("look:")) if str(o[2]).begins_with("look:") else Skipper.tex(o[2])) if o[2] != "" else null
		t.pigment = o[3]
		t.corner = o[4]
		t.custom_minimum_size = Vector2(124, 124)
		t.mouse_entered.connect(func() -> void: _try_on(o))
		t.focus_entered.connect(func() -> void: _try_on(o))
		t.mouse_exited.connect(func() -> void: _try_on([]))
		t.pressed.connect(func() -> void: _choose(o[0]))
		grid.add_child(t)
	Paper.rule(_body)
	_trying = ["__"]
	_compare = VBoxContainer.new()
	_compare.add_theme_constant_override("separation", 3)
	_compare.custom_minimum_size = Vector2(0, 176)
	_body.add_child(_compare)
	_try_on([])


func pick_slot(s: String) -> void:
	slot = s
	_show_tab("loadout")


func _name_for(s: String) -> String:
	var p: Dictionary = session.profile()
	match s:
		"rod":
			return String(Rules.rod(Js.num(p.get("rod_tier")))["name"])
		"bait":
			return String(Rules.bait(hud._bait).get("name", "None"))
		"hat":
			return String(Skipper._find("hats", p.get("equipped_hat")).get("name", "None"))
		"boat":
			return String(Skipper._find("boats", p.get("equipped_boat")).get("name", "Default"))
		"pet":
			return String(Skipper._find("pets", p.get("equipped_pet")).get("name", "None"))
		"special":
			var sid: Variant = p.get("equipped_special")
			return "None" if sid == null else str(Locker.special_def(str(sid), p).get("name", sid))
		"skin":
			for c: Dictionary in Rules.data()["characterColors"]:
				if c["id"] == str(Js.nz(p.get("character_color"), "default")):
					return c["name"]
			return "Default"
	return ""


## What this captain owns for a slot: [id, name, art, pigment, corner note]
## (null id = none).
func _options(s: String) -> Array:
	var p: Dictionary = session.profile()
	var out: Array = []
	var sea_blue: Color = Color(0.32, 0.5, 0.6)
	match s:
		"rod":
			var tiers: Array = [0.0] + session.store.held_rod_tiers(session.uid)
			for t: Variant in tiers:
				var r: Dictionary = Rules.rod(float(t))
				out.append([float(t), r["name"], "%s_thumb.png" % r.get("slug", ""), Paper.rarity(1.0 + minf(4.0, float(t) / 2.0)), ""])
		"bait":
			for b: Array in session.baits():
				var def: Dictionary = Rules.bait(b[0])
				out.append([b[0], b[1], str(def.get("imageUrl", "")), Color(str(def.get("color", "#5f9fb0"))).darkened(0.15), "×" + Js.thousands(float(b[2]))])
		"skin":
			var owned: Array = Js.list(p.get("unlocked_character_colors"))
			for c: Dictionary in Rules.data()["characterColors"]:
				if c["free"] or Js.includes(owned, c["id"]):
					out.append([c["id"], c["name"], "look:" + str(c["id"]), sea_blue, ""])
		"hat":
			out.append([null, "No hat", "", Paper.INK_FAINT, ""])
			for id: Variant in Js.list(p.get("unlocked_hats")):
				var h: Dictionary = Skipper._find("hats", id)
				if not h.is_empty():
					out.append([id, h["name"], h["restImageUrl"], Color(0.7, 0.48, 0.3), ""])
		"boat":
			for id: Variant in Js.list(p.get("unlocked_boats")):
				var b: Dictionary = Skipper._find("boats", id)
				if not b.is_empty():
					out.append([id, b["name"], b["restImageUrl"], sea_blue, ""])
		"special":
			out.append([null, "No special", "", Paper.INK_FAINT, ""])
			# The Sunken Hand's slot, beside the first: the Primeval Eye alone.
			if p.get("has_anglers_patience") == true and (p.get("finn_spoil_free") == "fishing" or p.get("finn_spoil_paid") == "fishing"):
				var eye: Dictionary = Locker.special_def("anglers_patience", p)
				out.append(["anglers_patience", eye["name"], str(eye.get("image", "")), Color(str(eye.get("color", "#c4a96a"))).darkened(0.2), "Seated" if p.get("equipped_special_2") == "anglers_patience" else "Hand's slot"])
			for d: Dictionary in Rules.data()["specialItems"]:
				if d["finaleSlotOnly"] or d["id"] == "auto_catcher":
					continue
				if p.get((Rules.data()["specialOwnedColumn"] as Dictionary)[d["id"]]) != true:
					continue
				var e: Dictionary = Locker.special_def(str(d["id"]), p)
				out.append([d["id"], e["name"], str(e.get("image", "")), Color(str(e.get("color", "#9aa3ad"))).darkened(0.2), ""])
		"pet":
			out.append([null, "No pet", "", Paper.INK_FAINT, ""])
			for id: Variant in Js.list(p.get("unlocked_pets")):
				var pt: Dictionary = Skipper._find("pets", id)
				if not pt.is_empty():
					out.append([id, pt["name"], pt["restImageUrl"], Color(0.4, 0.58, 0.4), ""])
	return out


## A special as shown (content/port_rules.json specialInfo over the rules):
## the Auto Caster wears the Auto Catcher's name once it is upgraded.
static func special_def(id: String, p: Dictionary) -> Dictionary:
	if id == "auto_caster" and p.get("has_auto_catcher") == true:
		id = "auto_catcher"
	var out: Dictionary = {}
	for d: Dictionary in Rules.data()["specialItems"]:
		if d["id"] == id:
			out = d.duplicate()
	out.merge(Js.obj(Js.obj(Rules.data().get("specialInfo")).get(id)), true)
	return out


func _worn(s: String) -> Variant:
	var p: Dictionary = session.profile()
	match s:
		"rod":
			return Js.num(p.get("rod_tier"))
		"bait":
			return hud._bait
		"skin":
			return str(Js.nz(p.get("character_color"), "default"))
		"hat":
			return p.get("equipped_hat")
		"boat":
			return p.get("equipped_boat")
		"pet":
			return p.get("equipped_pet")
		"special":
			var sid: Variant = p.get("equipped_special")
			return "auto_caster" if sid == "auto_catcher" else sid
	return null


func _wear(look: Dictionary) -> void:
	sea._boat.set_look(look)


## The real boat wears the thing under the pointer; the card and the dial
## say what it would change.
func _try_on(o: Array) -> void:
	if _trying == o:
		return
	_trying = o
	var look: Dictionary = Skipper.look_of(session.profile())
	var trying: bool = not o.is_empty()
	if trying:
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
	if slot != "bait":
		_wear(look)
		if trying and sea._boat.field != null:
			sea._boat.field.ring(sea._boat.position, 90.0, 0.9, 0.35)
	_card_eyebrow.text = ("Trying on  ·  " if trying else "Wearing  ·  ") + _slot_name(slot)
	_card_title.text = o[1] if trying else _name_for(slot)
	_card_body.text = _blurb(slot, o)
	_fill_compare(o)


func _slot_name(s: String) -> String:
	for x: Array in SLOTS:
		if x[0] == s:
			return x[1]
	return s


func _blurb(s: String, o: Array) -> String:
	match s:
		"rod":
			var tier: float = float(o[0]) if not o.is_empty() else Js.num(session.profile().get("rod_tier"))
			return Kit.clean_copy(str(Rules.rod(tier).get("description", "")))
		"bait":
			var id: String = str(o[0]) if not o.is_empty() else hud._bait
			var bonus: float = Js.num(Rules.bait(id).get("catchZoneBonus"))
			return ("Widens the catch zone by %d°. A wider catch zone is an easier reel; nothing else changes." % int(bonus)) if bonus > 0 else "Plain bait. No change to the catch zone."
	if s == "special":
		var sid: Variant = (o[0] if not o.is_empty() else session.profile().get("equipped_special"))
		if sid == null:
			return "No special in the slot."
		var e: Dictionary = Locker.special_def(str(sid), session.profile())
		return "%s. %s" % [e.get("effect", ""), Kit.clean_copy(str(e.get("description", "")))]
	if s == "boat":
		return "A look, not a stat: her fittings are what make her faster. Boats come only from fishing crates."
	return "A look, not a stat. It changes how you appear on the water and nothing about the catch."


func _choose(id: Variant) -> void:
	var r: Dictionary = {}
	match slot:
		"rod":
			if line_out():
				return
			r = await session.act("equipTackleRod", [float(id)])
		"bait":
			if line_out():
				return
			hud.set_bait(str(id))
			r = { "ok": true }
		"skin":
			r = await session.act("updateCharacterColor", [id])
		"hat":
			r = await session.act("equipHat", [id])
		"boat":
			r = await session.act("equipBoat", [id])
		"pet":
			r = await session.act("equipPet", [id, "stern"])
		"special":
			if id == "anglers_patience":
				# Its own slot: press to seat it, again to take it out.
				var seated: bool = session.profile().get("equipped_special_2") == "anglers_patience"
				r = await session.act("equipSecondSpecial", [null if seated else id])
			else:
				r = await session.act("equipSpecialItem", [id])
	session.persist()
	if r.get("error") != null:
		hud.toast(str(r["error"]))
	Rumble.tap(10)
	if sea._boat.field != null:
		sea._boat.field.ring(sea._boat.position, 150.0, 1.3, 0.7)
	hud.refresh()
	_trying = ["__"]
	_show_tab("loadout")


# ── What it does to the dial ───────────────────────────────────────────────────

func _fill_compare(o: Array) -> void:
	if _compare == null or not is_instance_valid(_compare):
		return
	for c: Node in _compare.get_children():
		c.queue_free()
	_gauge = null
	if slot == "special":
		Paper.text(_compare, "What it does", "eyebrow", Paper.INK_SOFT)
		Paper.text(_compare, "A special works beside your rod and bait; it never changes the dial itself.", "note", Paper.INK_SOFT, true)
		_streak_line()
		return
	if slot != "rod" and slot != "bait":
		Paper.text(_compare, "On the dial", "eyebrow", Paper.INK_SOFT)
		Paper.text(_compare, "Looks never touch the catch. Rods and bait do: pick one of those to see how.", "note", Paper.INK_SOFT, true)
		_streak_line()
		return
	var p: Dictionary = session.profile()
	var effects: Variant = p.get("completionist_effects")
	var my_rod: Dictionary = Rules.effective_rod(Js.num(p.get("rod_tier")), effects)
	var rod: Dictionary = my_rod
	var bait_id: String = hud._bait
	if not o.is_empty():
		if slot == "rod":
			rod = Rules.effective_rod(float(o[0]), effects)
		else:
			bait_id = str(o[0])
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	_compare.add_child(row)
	_gauge = ZoneGauge.new()
	_gauge.custom_minimum_size = Vector2(168, 168)
	_gauge.now_zones = _zones_for(my_rod, hud._bait)
	_gauge.zones = _zones_for(rod, bait_id)
	row.add_child(_gauge)
	var v: VBoxContainer = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 2)
	row.add_child(v)
	Paper.text(v, "On the dial, for a middling bite", "eyebrow", Paper.INK_SOFT)
	var my_bait: float = Js.num(Rules.bait(hud._bait).get("catchZoneBonus"))
	var bait: float = Js.num(Rules.bait(bait_id).get("catchZoneBonus"))
	_delta_row(v, "Catch zone, rod", Js.num(my_rod.get("catchZoneBonus")), Js.num(rod.get("catchZoneBonus")), "+%d°", true)
	_delta_row(v, "Catch zone, bait", my_bait, bait, "+%d°", true)
	_delta_row(v, "Perfect zone", Js.num(my_rod.get("perfectZoneBonus")), Js.num(rod.get("perfectZoneBonus")), "+%d°", true)
	var r0: float = Js.num(my_rod.get("retryOnMissChance"))
	var r1: float = Js.num(rod.get("retryOnMissChance"))
	if r0 > 0 or r1 > 0:
		_delta_row(v, "Second chance on a miss", r0 * 100.0, r1 * 100.0, "%d%%", true)
	var x0: float = float(Js.nz(my_rod.get("perfectXpMult"), 1.0))
	var x1: float = float(Js.nz(rod.get("perfectXpMult"), 1.0))
	if x0 != 1.0 or x1 != 1.0:
		_delta_row(v, "XP on a perfect", x0, x1, "×%.2f", true)
	if my_rod.get("snagImmune") == true or rod.get("snagImmune") == true:
		Paper.stat(v, "Snags", "Immune" if rod.get("snagImmune") == true else "Can snag", Paper.GREEN if rod.get("snagImmune") == true else Paper.RED)
	_streak_line()


func _delta_row(parent: Node, label: String, was: float, now: float, fmt: String, more_is_better: bool) -> void:
	var tone: Color = Paper.INK
	var txt: String = fmt % now
	if now != was:
		var better: bool = (now > was) == more_is_better
		tone = Paper.GREEN if better else Paper.RED
		txt = "%s  →  %s" % [fmt % was, fmt % now]
	Paper.stat(parent, label, txt, tone)


func _streak_line() -> void:
	var n: int = int(Js.num(session.profile().get("current_perfect_streak")))
	var lvl: int = session.level()
	var t: String = ("Perfect streak running: %d, paying ×%.2f XP. It pays up to ×%.2f at 10." % [n, Rules.streak_mult(n, lvl), Rules.streak_mult(10, lvl)]) if n > 0 else ("No perfect streak running. Ten in a row pays ×%.2f XP at your level." % Rules.streak_mult(10, lvl))
	Paper.text(_compare, t, "note", Paper.INK_SOFT, true)


func _zones_for(rod: Dictionary, bait_id: String) -> Array:
	var p: Dictionary = session.profile()
	var lines: Array = Rules.data()["lines"]
	var line: Dictionary = lines[clampi(int(Js.num(p.get("line_tier"))), 0, lines.size() - 1)]
	var level_bonus: float = Rules.level_catch_bonus(float(session.level())) + Js.num(Rules.bait(bait_id).get("catchZoneBonus")) + Js.num(rod.get("catchZoneBonus"))
	return Dial.build_zones(3.0, Js.num(p.get("hook_tier")), float(line["penaltyMultiplier"]), 1.0, level_bonus, Js.num(rod.get("perfectZoneBonus")) + 1.0)


# ── The card under the boat ────────────────────────────────────────────────────

func _build_card() -> void:
	_card = Control.new()
	_card.anchor_top = 1.0
	_card.anchor_bottom = 1.0
	_card.offset_left = 40.0
	_card.offset_right = 470.0
	_card.offset_top = -150.0
	_card.offset_bottom = -30.0
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_card)
	Paper.sheet(_card, 6.0, 0.6)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 18 if side != "top" else 14)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_card.add_child(m)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.add_child(v)
	_card_eyebrow = Paper.text(v, "", "eyebrow", Paper.RED)
	_card_title = Paper.text(v, "", "title", Paper.INK)
	_card_body = Paper.text(v, "", "note", Paper.INK_SOFT, true)


# ── Hold ───────────────────────────────────────────────────────────────────────

func _build_hold() -> void:
	var p: Dictionary = session.profile()
	var cap: int = int(Rules.fish_hold(Js.num(p.get("fish_hold_tier")))["capacity"])
	var rows: Array = []
	var hold: Dictionary = session.save["hold"]
	# Merchant's Eye (a skill): today's Market price, and which way it went.
	var eye: bool = Rules.has_skill(Js.num(p.get("fishing_xp")), "merchants_eye")
	var mkt: Dictionary = Js.obj(Market.current(session.save).get("fish")) if eye else {}
	for k: Variant in hold:
		var f: Variant = session.store.species(float(str(k)))
		if f == null or float(hold[k]) <= 0:
			continue
		var fd: Dictionary = f
		var base: float = Js.num(session.store.species_value(float(str(k))))
		var mf: Dictionary = Js.obj(mkt.get(Js.key(float(str(k)))))
		var m: float = float(mf.get("m", 1.0))
		rows.append({ "id": float(str(k)), "name": fd["name"], "qty": float(hold[k]), "each": Market.price_each(base, m) if eye else base, "base": base,
			"trend": signf(m - float(mf.get("prev", m))) if eye else 0.0, "rarity": Js.num(fd.get("bite_rarity")) })
	var count: int = 0
	for r: Dictionary in rows:
		count += int(r["qty"])
	var top: HBoxContainer = HBoxContainer.new()
	_body.add_child(top)
	var lt: Label = Paper.text(top, "%d of %d aboard" % [count, cap], "heading", Paper.INK)
	lt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if count >= cap:
		Paper.text(top, "Full. Sell before you cast again.", "small", Paper.RED)
	# One pip per space, coloured by what fills it (rarest first).
	var units: Array = []
	var by_rarity: Array = rows.duplicate()
	by_rarity.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["rarity"]) > float(b["rarity"]))
	for r: Dictionary in by_rarity:
		for i: int in int(r["qty"]):
			units.append(Paper.rarity(float(r["rarity"])))
	var pips: Pips = Pips.new()
	pips.cap = cap
	pips.units = units
	_body.add_child(pips)
	var sorts: HBoxContainer = HBoxContainer.new()
	sorts.add_theme_constant_override("separation", 5)
	_body.add_child(sorts)
	Paper.text(sorts, "Sort", "label", Paper.INK_SOFT).vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	for o: Array in [["value", "Value"], ["rarity", "Rarity"], ["name", "Name"]]:
		var b: Pane.PaneButton = Paper.tab(o[1], o[0] == _hold_sort, false)
		b.pressed.connect(func() -> void:
			_hold_sort = o[0]
			_show_tab("hold"))
		sorts.add_child(b)
	match _hold_sort:
		"value":
			rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["each"]) * float(a["qty"]) > float(b["each"]) * float(b["qty"]))
		"rarity":
			rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return [-float(a["rarity"]), a["name"]] < [-float(b["rarity"]), b["name"]])
		_:
			rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return String(a["name"]) < String(b["name"]))
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(grid)
	var zone: Dictionary = Chart.water_at(sea._boat.position)
	var res: Dictionary = Selling.resident(str(zone.get("id", "")))
	if rows.is_empty():
		Paper.text(grid, "Empty. Every fish you catch goes in here until you sell it.", "note", Paper.INK_SOFT, true)
	for r: Dictionary in rows:
		var t: Paper.Tile = Paper.Tile.new()
		t.label = r["name"]
		t.art = Skipper.fish_thumb(r["name"])
		t.pigment = Paper.rarity(float(r["rarity"]))
		t.corner = "×%d" % int(r["qty"])
		if eye and float(r["trend"]) != 0.0:
			t.corner += "  ▲" if float(r["trend"]) > 0.0 else "  ▼"
		t.custom_minimum_size = Vector2(124, 120)
		t.mouse_entered.connect(func() -> void: _hold_detail.text = _fish_line(r, res))
		t.focus_entered.connect(func() -> void: _hold_detail.text = _fish_line(r, res))
		grid.add_child(t)
	Paper.rule(_body)
	_hold_detail = Paper.text(_body, "Point at a fish for what it fetches.", "note", Paper.INK_SOFT, true)
	var total: float = 0.0
	var at_rate: float = 0.0
	for r: Dictionary in rows:
		total += float(r["each"]) * float(r["qty"])
	if not res.is_empty():
		var stacks: Array = []
		for r: Dictionary in rows:
			stacks.append(float(r["base"]) * float(r["qty"]))
		var sum: float = 0.0
		for v: float in stacks:
			sum += v
		at_rate = floor(sum * float(res["rate"]))
	var money: VBoxContainer = VBoxContainer.new()
	money.add_theme_constant_override("separation", 2)
	_body.add_child(money)
	Paper.stat(money, "At the Market on the Mainland, today" if eye else "At the Market on the Mainland, about", "%s ⟡" % Js.thousands(total), Paper.GREEN)
	# Quick Sell (a skill): the whole hold, from right here.
	var qs: float = Rules.quick_sell_rate(Js.num(p.get("fishing_xp")))
	if qs > 0.0 and not rows.is_empty():
		var today: float = 0.0
		for r: Dictionary in rows:
			today += Market.price_each(float(r["base"]), Market.multiplier(session.save, float(r["id"]))) * float(r["qty"])
		var qb: Pane.PaneButton = Paper.button("Quick sell the hold here, %d%% of market:  %s ⟡" % [int(round(qs * 100.0)), Js.thousands(floor(today * qs))], true)
		qb.disabled = line_out()
		qb.pressed.connect(func() -> void:
			qb.disabled = true
			var r: Dictionary = await session.act("quickSellHold")
			if r.has("error"):
				hud.toast(str(r["error"]))
			else:
				session.persist()
				Rumble.buzz([0, 30, 40, 60])
				hud.toast("Sold %d fish for %s ⟡" % [int(r["fishSold"]), Js.thousands(float(r["earned"]))])
				hud.refresh()
			_show_tab("hold"))
		money.add_child(qb)
	if res.is_empty():
		Paper.stat(money, "Out here", "Nobody buys in this water", Paper.INK_SOFT)
	else:
		Paper.stat(money, "To %s here, %d%% of market" % [res["name"], int(Js.round(float(res["rate"]) * 100.0))], "%s ⟡" % Js.thousands(at_rate), Paper.INK)
	var tiers: Array = Rules.data()["fishHoldTiers"]
	var at: int = clampi(int(Js.num(p.get("fish_hold_tier"))), 0, tiers.size() - 1)
	if at + 1 < tiers.size():
		var nxt: Dictionary = tiers[at + 1]
		Paper.text(_body, "The Shipyard sells the next size, %d fish, for ⟡ %s." % [int(nxt["capacity"]), Js.thousands(float(nxt["cost"]))], "note", Paper.INK_SOFT, true)


func _fish_line(r: Dictionary, res: Dictionary) -> String:
	var each: float = float(r["each"])
	var t: String = "%s, %s.  ⟡ %s each at the Market%s, ⟡ %s for all %d" % [r["name"], Almanac.RARITY_NAMES[clampi(int(r["rarity"]) - 1, 0, 4)], Js.thousands(each), "" if float(r["trend"]) == 0.0 else ((" (up %s)" if float(r["trend"]) > 0.0 else " (down %s)") % ("today" if Market.daily() else "this hour")), Js.thousands(each * float(r["qty"])), int(r["qty"])]
	if not res.is_empty():
		t += ";  about ⟡ %s each to %s." % [Js.thousands(floor(float(r["base"]) * float(res["rate"]))), res["name"]]
	else:
		t += "."
	return t


# ── Pieces ─────────────────────────────────────────────────────────────────────

## THE HOLD AS SPACES: one inked circle per space, filled with a dab of the
## pigment of the fish in it (rarest first), empty ones left as rings.
class Pips:
	extends Control
	var cap: int = 25
	var units: Array = []
	var _per_row: int = 25
	var _d: float = 16.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		resized.connect(_fit)
		_fit()

	func _fit() -> void:
		var w: float = maxf(200.0, size.x)
		_d = clampf(w / float(maxi(cap, 1)) - 3.0, 7.0, 18.0)
		_per_row = maxi(1, int(w / (_d + 3.0)))
		var rows: int = int(ceil(float(cap) / _per_row))
		custom_minimum_size = Vector2(0, rows * (_d + 3.0) + 2.0)
		queue_redraw()

	func _draw() -> void:
		for i: int in cap:
			var c: Vector2 = Vector2((i % _per_row) * (_d + 3.0) + _d / 2.0, (i / _per_row) * (_d + 3.0) + _d / 2.0 + 1.0)
			var r: float = _d / 2.0
			if i < units.size():
				var col: Color = units[i]
				draw_circle(c + Vector2(0.4, 0.3), r * (0.9 + 0.08 * sin(i * 2.3)), Color(col, 0.75))
			draw_arc(c, r, 0.0, TAU, 18, Color(Paper.INK, 0.45 if i < units.size() else 0.28), 1.0, true)


## A SMALL PAINTED DIAL: the zones a middling bite would have with what you
## are trying, as watercolour on the ring, and where your catch zone ends now
## as two inked ticks, so a wider or narrower zone shows at a glance.
class ZoneGauge:
	extends Control
	var zones: Array = []
	var now_zones: Array = []
	var _t: float = 0.0

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _ang(deg: float) -> float:
		return deg_to_rad(deg - 90.0)

	func _catch_span(zs: Array) -> Vector2:
		var lo: float = 999.0
		var hi: float = -1.0
		for z: Array in zs:
			if z[2] == "catch" or z[2] == "perfect":
				lo = minf(lo, float(z[0]))
				hi = maxf(hi, float(z[1]))
		return Vector2(lo, hi)

	func _draw() -> void:
		var c: Vector2 = size / 2.0
		var r: float = minf(size.x, size.y) / 2.0 - 10.0
		draw_circle(c, r + 8.0, Color(Kit.PAPER.lightened(0.06), 0.95))
		draw_arc(c, r + 8.0, 0.0, TAU, 64, Color(Paper.INK, 0.5), 1.5, true)
		for z: Array in zones:
			var col: Color = Color(0.85, 0.82, 0.74, 0.5)
			match z[2]:
				"catch":
					col = Color(0.36, 0.62, 0.42, 0.85)
				"perfect":
					col = Color(0.88, 0.66, 0.2, 0.95)
				"penalty":
					col = Color(0.72, 0.3, 0.24, 0.55)
			var a0: float = _ang(float(z[0]))
			var a1: float = _ang(float(z[1]))
			if a1 > a0:
				draw_arc(c, r - 6.0, a0, a1, maxi(4, int((a1 - a0) * 20.0)), col, 12.0, true)
		for k: int in 36:
			var a: float = TAU * k / 36.0
			draw_line(c + Vector2.from_angle(a) * (r + 3.0), c + Vector2.from_angle(a) * (r + (7.0 if k % 3 == 0 else 5.0)), Color(Paper.INK, 0.45), 1.0, true)
		# Where your catch zone ends today.
		var now: Vector2 = _catch_span(now_zones)
		for d: float in [now.x, now.y]:
			var a: float = _ang(d)
			draw_line(c + Vector2.from_angle(a) * (r - 16.0), c + Vector2.from_angle(a) * (r + 6.0), Color(Paper.INK, 0.85), 2.0, true)
		# A slow needle so it reads as a dial.
		var na: float = _ang(fposmod(_t * 60.0, 360.0))
		draw_line(c, c + Vector2.from_angle(na) * (r - 12.0), Color(Paper.INK, 0.8), 2.0, true)
		draw_circle(c, 4.0, Paper.INK)
		var span: Vector2 = _catch_span(zones)
		var f: Font = Kit.font("cinzel", 700)
		var s: String = "%d°" % int(span.y - span.x)
		var w: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
		draw_string(f, c + Vector2(-w / 2.0, 34.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Paper.INK)
		var f2: Font = Kit.font("karla", 600)
		var s2: String = "catch zone"
		var w2: float = f2.get_string_size(s2, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		draw_string(f2, c + Vector2(-w2 / 2.0, 48.0), s2, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Paper.INK_SOFT)
