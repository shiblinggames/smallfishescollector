class_name GunwharfSheet
extends Control
## THE GUNWHARF (Godot port; "where your ship lies at her berth, is refitted
## and armed for the campaign"), on the night paper. For now: your raid
## party's seats (who sails with you, the captain's hand first; one of each
## fish), THE ARMORY (the raid items on her mounts, picked from those held;
## two grades of a family, or a forged piece beside its own ingredients,
## never ride together), and THE YARD'S REFITS (the sixth berth, the extra
## mount). Seats are Crew.assign; the armory core/armory.gd; both parity.

signal closed

var session: Session
var _body: VBoxContainer
var _tab: String = "crew"


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
	sheet.offset_left = -560
	sheet.offset_right = 560
	sheet.offset_top = -370
	sheet.offset_bottom = 370
	add_child(sheet)
	Paper.night = true
	Paper.sheet(sheet, 8.0)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 28)
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
		close()


func _paint() -> void:
	Paper.night = true
	for c: Node in _body.get_children():
		c.queue_free()
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	_body.add_child(head)
	var tl: Label = Paper.text(head, "The Gunwharf", "display", Paper.ink())
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for t: Array in [["crew", "Raid party"], ["armory", "Armory"], ["ultimate", "Ultimate"], ["kit", "Repair kit"], ["yard", "Refits"]]:
		var tb: Pane.PaneButton = Paper.button(t[1], _tab == t[0])
		var id: String = t[0]
		tb.pressed.connect(func() -> void:
			_tab = id
			_paint())
		head.add_child(tb)
	if _tab == "armory":
		_armory()
		Paper.night = false
		return
	if _tab == "yard":
		_yard()
		Paper.night = false
		return
	if _tab == "ultimate":
		_ultimate()
		Paper.night = false
		return
	if _tab == "kit":
		_kits()
		Paper.night = false
		return
	var st: Dictionary = RulesApi.run(session.store, session.uid, "getCrewState", [])
	var prof: Dictionary = session.profile()
	var slots: int = Crew.party_slots(prof)
	Paper.text(_body, "YOUR RAID PARTY  ·  %d SEAT%s" % [slots, "" if slots == 1 else "S"], "eyebrow", Paper.ink_soft())
	Paper.text(_body, "Who sails into a fight with you. The first seat is your right hand (full stats); the rest give 80%. One of each fish. Their orders are your crew cards in battle.", "small", Paper.ink_soft(), true)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_body.add_child(row)
	var roster: Array = st["roster"]
	for k: int in slots:
		var who: Dictionary = {}
		for mem: Dictionary in roster:
			if mem.get("raidSlot") != null and int(mem["raidSlot"]) == k:
				who = mem
		row.add_child(_seat(k, who, roster))
	Paper.rule(_body)
	Paper.text(_body, "The campaign's water is out past the Sea Gate, due north. The Sea Gate lets her out once your right hand is seated.", "small", Paper.ink_soft(), true)
	var x: Pane.PaneButton = Paper.button("Close  Esc")
	x.size_flags_horizontal = Control.SIZE_SHRINK_END
	x.pressed.connect(close)
	_body.add_child(x)
	Paper.night = false


func _seat(k: int, who: Dictionary, roster: Array) -> Control:
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	v.custom_minimum_size = Vector2(130, 0)
	var pic: TextureRect = TextureRect.new()
	pic.custom_minimum_size = Vector2(120, 120)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	if not who.is_empty():
		pic.texture = Skipper.tex("card_thumbs/%s.png" % str(who["filename"]).get_basename())
	v.add_child(pic)
	Paper.text(v, ("Right hand" if k == 0 else "Seat %d" % (k + 1)), "eyebrow", Paper.ink_soft())
	Paper.text(v, str(who.get("name", "Empty")), "body_strong", Paper.ink() if not who.is_empty() else Paper.ink_faint())
	var pick: OptionButton = OptionButton.new()
	pick.add_item("(empty)", 0)
	var ids: Array = [null]
	for mem: Dictionary in roster:
		pick.add_item("%s  ·  Lv %d" % [mem["name"], Crew.level(Js.num(mem.get("xp")))], ids.size())
		ids.append(mem["id"])
		if not who.is_empty() and mem["id"] == who["id"]:
			pick.select(ids.size() - 1)
	pick.item_selected.connect(func(i: int) -> void:
		var r: Variant
		if ids[i] == null:
			if not who.is_empty():
				r = await session.act("benchCrew", [who["id"]])
		else:
			r = await session.act("assignToRaid", [ids[i], float(k)])
		session.persist()
		if r is Dictionary and (r as Dictionary).has("error"):
			push_warning(str(r["error"]))
		_paint())
	v.add_child(pick)
	return v


# ── The repair kits ─────────────────────────────────────────────────────────

## The kit she carries (its heal with this crew's Fortune) and the ladder: the
## kits owned (press one to carry it), the next to buy (its price and its
## Navigation gate), the rest still to come.
func _kits() -> void:
	var p: Dictionary = session.profile()
	var fortune: float = Js.num(Battle.seat_for(session.store, session.uid).get("fortune"))
	var nav: int = Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))
	var worn: Dictionary = RepairKits.by_id(Js.nz(p.get("equipped_repair_kit"), "basic_repair_kit"))
	var have: Array = RepairKits.owned(p)
	var nx: Dictionary = RepairKits.next_kit(p)
	Paper.text(_body, "THE REPAIR KIT  ·  A SPECIAL IN EVERY FIGHT", "eyebrow", Paper.ink_soft())
	Paper.text(_body, "Press Special (S) in a fight to patch the hull: it costs your turn, once a fight. Your crew's Fortune lifts the top of the heal.", "small", Paper.ink_soft(), true)
	var list: VBoxContainer = VBoxContainer.new()
	list.add_theme_constant_override("separation", 8)
	_body.add_child(list)
	for k: Dictionary in RepairKits.all():
		var id: String = k["id"]
		var own: bool = have.has(id)
		var is_next: bool = not nx.is_empty() and nx["id"] == id
		var wearing: bool = not worn.is_empty() and worn["id"] == id
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 14)
		row.modulate.a = 1.0 if (own or is_next) else 0.45
		list.add_child(row)
		var pic: TextureRect = TextureRect.new()
		pic.texture = Skipper.tex(str(k.get("image", "")))
		pic.custom_minimum_size = Vector2(64, 64)
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		row.add_child(pic)
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 0)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(v)
		var rg: Vector2 = RepairKits.range_for(k, fortune)
		Paper.text(v, "%s%s" % [k["name"], "  ·  carried" if wearing else ""], "body_strong", Paper.ink())
		Paper.text(v, "Heals %d to %d  ·  %s" % [int(rg.x), int(rg.y), str(k.get("description", "")).replace(" Once per fight.", "")], "small", Paper.ink_soft(), true)
		var id2: String = id
		if own and not wearing:
			var eb: Pane.PaneButton = Paper.button("Carry it")
			eb.pressed.connect(func() -> void:
				await session.act("equipRepairKit", [id2])
				session.persist()
				_paint())
			row.add_child(eb)
		elif is_next:
			var gated: bool = nav < int(k["navLevelReq"])
			var bb: Pane.PaneButton = Paper.button("Needs Navigation %d" % int(k["navLevelReq"]) if gated else "Buy  ·  %s ⟡" % Js.thousands(float(k["cost"])), not gated)
			bb.disabled = gated
			bb.pressed.connect(func() -> void:
				var r: Variant = await session.act("buyRepairKit", [])
				session.persist()
				if r is Dictionary and (r as Dictionary).has("error"):
					Sound.slack()
					push_warning(str(r["error"]))
				else:
					Sound.chest(true)
				_paint())
			row.add_child(bb)
		elif not own:
			Paper.text(row, "Navigation %d  ·  %s ⟡" % [int(k["navLevelReq"]), Js.thousands(float(k["cost"]))], "small", Paper.ink_faint())
	if nx.is_empty():
		Paper.text(_body, "Every repair kit is yours.", "small", Paper.ink_soft())


# ── The armory ────────────────────────────────────────────────────────────────

func _armory() -> void:
	var p: Dictionary = session.profile()
	var cap: int = Armory.slots(p)
	var eq: Array = Armory.live_items(p)
	var held: Array = Js.list(p.get("raid_items"))
	Paper.text(_body, ("HER MOUNTS  ·  %d" % cap) + ("  ·  AND THE FINALE'S" if Armory.finale_mount(p) else ""), "eyebrow", Paper.ink_soft())
	Paper.text(_body, "What she carries into every fight. Press a piece to take it off; press one below to mount it. Two grades of the same piece, or a forged piece beside what it was forged from, never ride together.", "small", Paper.ink_soft(), true)
	var mounts: HBoxContainer = HBoxContainer.new()
	mounts.add_theme_constant_override("separation", 10)
	_body.add_child(mounts)
	var normal: Array = eq.filter(func(id: Variant) -> bool: return Armory.item(str(id)).get("finaleSlotOnly") != true)
	for k: int in cap:
		mounts.add_child(_item_tile(normal[k] if k < normal.size() else null, true, eq))
	if Armory.finale_mount(p):
		var fin: Array = eq.filter(func(id: Variant) -> bool: return Armory.item(str(id)).get("finaleSlotOnly") == true)
		mounts.add_child(_item_tile(fin[0] if not fin.is_empty() else null, true, eq))
	Paper.rule(_body)
	Paper.text(_body, "IN THE HOLD", "eyebrow", Paper.ink_soft())
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var grid: HFlowContainer = HFlowContainer.new()
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	scroll.add_child(grid)
	var seen: Array = []
	for id: Variant in held:
		if seen.has(id) or eq.has(id):
			continue
		seen.append(id)
		grid.add_child(_item_tile(id, false, eq, held.count(id)))
	if seen.is_empty():
		Paper.text(grid, "Nothing else in the hold. Raid crates and the caches out on the water fill it.", "small", Paper.ink_faint())


func _item_tile(id: Variant, mounted: bool, eq: Array, n: int = 1) -> Control:
	var it: Dictionary = Armory.item(str(id)) if id != null else {}
	var rar: String = str(it.get("rarity", ""))
	var col: Color = { "common": Color(0.7, 0.7, 0.68), "uncommon": Color(0.5, 0.82, 0.5), "rare": Color(0.45, 0.68, 0.95), "epic": Color(0.72, 0.5, 0.95), "legendary": Color(1.0, 0.75, 0.3), "ancient": Color(0.4, 0.9, 0.85) }.get(rar, Color(0.6, 0.55, 0.5))
	var bt: Button = Button.new()
	bt.flat = true
	bt.focus_mode = Control.FOCUS_NONE
	bt.custom_minimum_size = Vector2(150, 176) if mounted else Vector2(124, 150)
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(col, 0.08) if id != null else Color(1, 1, 1, 0.03)
	sb.border_color = Color(col, 0.55) if id != null else Color(1, 1, 1, 0.15)
	sb.set_border_width_all(2 if mounted and id != null else 1)
	sb.set_corner_radius_all(10)
	var hv: StyleBoxFlat = sb.duplicate()
	hv.bg_color = Color(col, 0.16)
	hv.border_color = Color(col, 0.95)
	bt.add_theme_stylebox_override("normal", sb)
	bt.add_theme_stylebox_override("hover", hv)
	bt.add_theme_stylebox_override("pressed", hv)
	bt.add_theme_stylebox_override("disabled", sb)
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.offset_left = 8
	v.offset_right = -8
	v.offset_top = 8
	v.offset_bottom = -6
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_theme_constant_override("separation", 2)
	bt.add_child(v)
	if id == null:
		var e: Label = Paper.text(v, "An empty mount", "small", Paper.ink_faint(), true)
		e.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		e.size_flags_vertical = Control.SIZE_EXPAND_FILL
		e.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		bt.disabled = true
		return bt
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex(str(it.get("image", "")).trim_prefix("/"))
	pic.custom_minimum_size = Vector2(0, 86 if mounted else 70)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(pic)
	var nm: Label = Paper.text(v, str(it.get("name", id)) + (("  x%d" % n) if n > 1 else ""), "small", Paper.ink(), true)
	nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	nm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var rl: Label = Paper.text(v, rar.to_upper(), "eyebrow", col)
	rl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var clash: Array = Armory.conflicts(str(id), eq) if not mounted else []
	var tip: String = str(it.get("description", ""))
	if not clash.is_empty():
		tip += "\nWould replace: " + ", ".join(PackedStringArray(clash.map(func(x: Variant) -> String: return str(Armory.item(str(x)).get("name", x)))))
	bt.tooltip_text = tip
	bt.pressed.connect(func() -> void:
		var next: Array = eq.duplicate()
		if mounted:
			next.erase(id)
		else:
			for c: Variant in clash:
				next.erase(c)
			# Onto the hull first; when full, the last mounted comes off.
			next.push_front(id)
		await session.act("saveEquippedRaidItems", [next])
		session.persist()
		Sound.seal(true)
		_paint())
	return bt


# ── The yard's refits ─────────────────────────────────────────────────────────

func _yard() -> void:
	var p: Dictionary = session.profile()
	Paper.text(_body, "THE YARD'S REFITS", "eyebrow", Paper.ink_soft())
	var refits: Array = [
		["has_sixth_berth", "buySixthBerth", "The Sixth Berth", "A sixth crew seat, framed into the deck the way Sal Brackwater framed his.", float(Rules.data()["sixthBerthCost"]), "the_blockade", "Beat Sal Brackwater first"],
		["has_armory_expansion", "buyArmoryExpansion", "The Expanded Armory", "One more raid-item mount, cut by the don's own shipwright.", float(Rules.data()["armoryExpansionCost"]), "the_throne", "Take the Throne first"],
	]
	for r: Array in refits:
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 14)
		_body.add_child(row)
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(v)
		Paper.text(v, r[2], "body_strong", Paper.ink())
		Paper.text(v, r[3], "small", Paper.ink_soft(), true)
		if p.get(r[0]) == true:
			Paper.text(row, "Fitted", "body_strong", Color(0.5, 0.86, 0.58))
			continue
		var open: bool = session.store.has_cleared(session.uid, r[5])
		var b: Pane.PaneButton = Paper.button(("%s ⟡" % Js.thousands(float(r[4]))) if open else r[6], open)
		b.disabled = not open or Js.num(p.get("doubloons")) < float(r[4])
		var op: String = r[1]
		b.pressed.connect(func() -> void:
			var res: Variant = await session.act(op, [])
			session.persist()
			if res is Dictionary and res.get("ok") == true:
				Sound.chest(true)
			_paint())
		row.add_child(b)


# ── The ultimate ──────────────────────────────────────────────────────────────

func _ultimate() -> void:
	var st: Dictionary = RulesApi.run(session.store, session.uid, "getUltimateState", [])
	var g: Dictionary = Armory.ultimate_gates(session.store, session.uid)
	var story: Dictionary = Armory.aug()["story"]
	var active: Variant = st.get("active")
	var build: Variant = st.get("build")
	var schem: bool = st.get("schematics", false)
	Paper.text(_body, str(story["buildKicker"]).to_upper(), "eyebrow", Paper.ink_soft())
	Paper.text(_body, str(story["buildBlurb"]).replace("{charges}", str(int(Armory.aug()["megaCost"]))), "small", Paper.ink_soft(), true)
	if active == null and build == null:
		# The four requirements, ticked or not.
		var req: HBoxContainer = HBoxContainer.new()
		req.add_theme_constant_override("separation", 18)
		_body.add_child(req)
		for r: Array in [["chapter3", "The Quartermaster beaten"], ["manowar", "A Man-o-War"], ["navLevel", "Navigation %d" % int(Armory.aug()["navLevel"])], ["rack", "The Extra Cannonball Rack (the Gauntlet's Locker)"]]:
			var ok: bool = g[r[0]]
			Paper.text(req, ("✓  " if ok else "✗  ") + r[1], "small", Color(0.5, 0.86, 0.58) if ok else Paper.red())
	elif build != null:
		var left: float = maxf(0.0, Js.parse_ms(build["completesAt"]) - Clock.now_ms())
		var line: String = str(story["retoolingLine"] if build.get("retool", false) else story["buildingLine"]).replace("{current}", str(Armory.augment(active).get("name", "")))
		Paper.text(_body, "%s  ·  %s left" % [line, _hm(left)], "small", Paper.ink(), true)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	_body.add_child(row)
	var gates_met: bool = g["chapter3"] and g["manowar"] and g["navLevel"] and g["rack"]
	for a: Dictionary in Armory.aug()["list"]:
		var id: String = a["id"]
		var col: Color = Color(str(a["color"]))
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 4)
		row.add_child(v)
		var mounted: bool = active == id
		var building: bool = build != null and build["id"] == id
		Paper.text(v, ("MOUNTED" if mounted else ("BEING BUILT" if building else "")), "eyebrow", col)
		Paper.text(v, str(a["name"]), "title", col.lightened(0.15))
		Paper.text(v, _clean(str(a["tagline"])), "small", Paper.ink(), true)
		Paper.text(v, "x%s  ·  %s" % [str(a["megaMult"]), _clean(str(a["identity"]))], "small", Paper.ink_soft(), true)
		for perk: Variant in Js.list(a.get("perks")):
			Paper.text(v, _clean(str(perk)), "small", Paper.ink_faint(), true)
		var label: String = ""
		var op: String = ""
		if active == null and build == null:
			label = "Build it  ·  %s ⟡" % Js.thousands(float(Armory.aug()["cost"]))
			op = "startUltimateBuild"
		elif build != null and not building:
			label = "Build this instead"
			op = "swapUltimateBuild"
		elif active != null and not mounted and build == null:
			if schem:
				label = "Switch to it"
				op = "switchUltimate"
			else:
				label = "Retool  ·  %s ⟡" % Js.thousands(float(Armory.aug()["retoolCost"]))
				op = "startUltimateRetool"
		if op != "":
			var locked: bool = op == "startUltimateBuild" and not gates_met
			var b: Pane.PaneButton = Paper.button(label if not locked else "Not yet", (op == "startUltimateBuild" or op == "switchUltimate") and not locked)
			b.disabled = locked
			b.pressed.connect(func() -> void:
				var r: Variant = await session.act(op, [id])
				session.persist()
				if r is Dictionary and r.get("ok") == true:
					Sound.horn()
				_paint())
			v.add_child(b)
	if active != null and not schem:
		Paper.rule(_body)
		var h: HBoxContainer = HBoxContainer.new()
		_body.add_child(h)
		var t: VBoxContainer = VBoxContainer.new()
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		h.add_child(t)
		Paper.text(t, str(story["schematicsTitle"]), "body_strong", Paper.ink())
		Paper.text(t, str(story["schematicsBlurb"]), "small", Paper.ink_soft(), true)
		var sb: Pane.PaneButton = Paper.button("%s ⟡" % Js.thousands(float(Armory.aug()["schematicsCost"])))
		sb.pressed.connect(func() -> void:
			await session.act("buyUltimateSchematics", [])
			session.persist()
			_paint())
		h.add_child(sb)


## The web's copy, without its dashes (house rule: no em-dashes).
static func _clean(t: String) -> String:
	t = t.strip_edges().trim_prefix("— ").trim_prefix("—")
	return t.replace(" — ", ", ").replace(" —", ",").replace("— ", ", ").replace("—", ", ").strip_edges()


static func _hm(ms: float) -> String:
	var m: int = int(ms / 60000.0)
	return "%dh %02dm" % [m / 60, m % 60]
