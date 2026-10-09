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
var _tab: String = "hull"
## THE shell (Paper.open): scrim, sheet, body.
var _parts: Dictionary = {}
## The feedback line under the header (Paper.status_line) and what it says
## after a repaint: [text, colour].
var _status: Label = null
var _say: Array = ["", Color(0, 0, 0, 0)]
## Where each tab's list was scrolled to (a repaint keeps it).
var _keep: Dictionary = {}
## The Refit's re-walk: the picks made so far, chapter by chapter (null: not
## re-walking).
var _rewalk: Variant = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE shell every sheet shares (Paper.open): the scrim, the night paper
	# rising in at the wide size, a body column.
	_parts = Paper.open(self, Paper.SHEET_WIDE, true, close)
	_body = _parts["body"]
	_paint()


func close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	Paper.close(self, _parts)


## Escape (or the pad's B) backs out one level, then closes: a Refit
## half re-walked is set down first.
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		if _rewalk is Dictionary:
			_rewalk = null
			_paint()
			return
		close()


## Say something on the feedback line (it outlasts the repaint that follows).
func _tell(t: String, col: Color = Color(0, 0, 0, 0)) -> void:
	_say = [t, col]
	if _status != null and is_instance_valid(_status):
		Paper.say(_status, t, col)


## A rules call's answer: a refusal goes on the feedback line.
func _refused(r: Variant) -> bool:
	if r is Dictionary and (r as Dictionary).has("error"):
		_tell(str(r["error"]), Paper.NIGHT_RED)
		return true
	_say = ["", Color(0, 0, 0, 0)]
	return false


func _paint() -> void:
	Paper.night = true
	# A repaint keeps each tab's scroll (the Armory's hold).
	var was: ScrollContainer = _scroll_in(_body)
	if was != null:
		_keep[_tab] = was.scroll_vertical
	for c: Node in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	# THE shared header: the title on the left, "Close  Esc" on the right on
	# every tab, the tabs on their own row, the rule; then the feedback line.
	Paper.header(_body, "The Gunwharf", "", close, [["hull", "Hull"], ["crew", "Raid party"], ["armory", "Armory"], ["ultimate", "Ultimate"], ["kit", "Repair kit"], ["yard", "Refits"], ["look", "Look"]], _tab, func(id: Variant) -> void:
		if _tab == String(id):
			return
		_tab = String(id)
		_say = ["", Color(0, 0, 0, 0)]
		_paint())
	_status = Paper.status_line(_body)
	if String(_say[0]) != "":
		Paper.say(_status, String(_say[0]), _say[1])
	match _tab:
		"hull": _hull()
		"look": _look()
		"armory": _armory()
		"yard": _yard()
		"ultimate": _ultimate()
		"kit": _kits()
		_: _party()
	var now: ScrollContainer = _scroll_in(_body)
	if now != null and _keep.has(_tab):
		now.set_deferred("scroll_vertical", _keep[_tab])
	Paper.night = false


func _scroll_in(n: Node) -> ScrollContainer:
	for c: Node in n.get_children():
		if c is ScrollContainer:
			return c
	return null


## The raid party's seats.
func _party() -> void:
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
		_refused(r)
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
			eb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			eb.pressed.connect(func() -> void:
				await session.act("equipRepairKit", [id2])
				session.persist()
				_paint())
			row.add_child(eb)
		elif is_next:
			var gated: bool = nav < int(k["navLevelReq"])
			# The one thing to do here is the wooden plank (Paper.primary).
			var bb: Pane.PaneButton = Paper.button("Needs Navigation %d" % int(k["navLevelReq"])) if gated else Paper.primary("Buy  ·  %s ⟡" % Js.thousands(float(k["cost"])), true)
			bb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			bb.disabled = gated
			bb.pressed.connect(func() -> void:
				var r: Variant = await session.act("buyRepairKit", [])
				session.persist()
				if _refused(r):
					Sound.slack()
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


## A raid item on the night paper (Paper.Tile): its art on a blot in its
## rarity's pigment, its name under, a count in the corner, the inked ring
## round what is mounted; the rarity in words under it. An empty mount is a
## faint, grey tile that does nothing.
func _item_tile(id: Variant, mounted: bool, eq: Array, n: int = 1) -> Control:
	var it: Dictionary = Armory.item(str(id)) if id != null else {}
	var rar: String = str(it.get("rarity", ""))
	var box: VBoxContainer = VBoxContainer.new()
	box.add_theme_constant_override("separation", 0)
	var bt: Paper.Tile = Paper.Tile.new()
	bt.custom_minimum_size = Vector2(150, 150) if mounted else Vector2(124, 124)
	box.add_child(bt)
	if id == null:
		bt.label = "An empty mount"
		bt.grey = true
		bt.disabled = true
		bt.focus_mode = Control.FOCUS_NONE
		return box
	bt.on = mounted
	bt.art = Skipper.tex(str(it.get("image", "")).trim_prefix("/"))
	bt.label = str(it.get("name", id))
	bt.pigment = Paper.rarity(rar)
	if n > 1:
		bt.corner = "x%d" % n
	var rl: Label = Paper.text(box, rar, "eyebrow", Paper.ink_faint())
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
		var r: Variant = await session.act("saveEquippedRaidItems", [next])
		session.persist()
		if not _refused(r):
			Sound.seal(true)
		_paint())
	return box


# ── Her hull ──────────────────────────────────────────────────────────────────

func _field(text: String) -> LineEdit:
	var field: LineEdit = LineEdit.new()
	field.text = text
	field.max_length = 32
	field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var fsb: StyleBoxFlat = StyleBoxFlat.new()
	fsb.bg_color = Color(0.13, 0.105, 0.09)
	fsb.border_color = Color(Paper.NIGHT_INK, 0.35)
	fsb.set_border_width_all(1)
	fsb.set_corner_radius_all(6)
	fsb.content_margin_left = 10
	fsb.content_margin_right = 10
	for st: String in ["normal", "focus"]:
		field.add_theme_stylebox_override(st, fsb)
	field.add_theme_color_override("font_color", Paper.NIGHT_INK)
	field.add_theme_color_override("font_placeholder_color", Paper.NIGHT_INK_FAINT)
	return field


func _hull() -> void:
	var p: Dictionary = session.profile()
	var tier: int = Hulls.tier_of(p)
	var nav: int = Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))
	var cols: HBoxContainer = HBoxContainer.new()
	cols.add_theme_constant_override("separation", 28)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_child(cols)
	# Her, on the left: the picture the chart draws, her name, her numbers.
	var left: VBoxContainer = VBoxContainer.new()
	left.custom_minimum_size = Vector2(440, 0)
	left.add_theme_constant_override("separation", 8)
	cols.add_child(left)
	var holder: Control = Control.new()
	holder.custom_minimum_size = Vector2(0, 250)
	left.add_child(holder)
	Paper.blot(holder, Color(0.36, 0.5, 0.6), 0.6)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex(str(North.ship_art(tier, p.get("equipped_ship_skin"))["art"]))
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	holder.add_child(pic)
	var nm: HBoxContainer = HBoxContainer.new()
	nm.add_theme_constant_override("separation", 6)
	left.add_child(nm)
	var field: LineEdit = _field(str(Js.nz(p.get("ship_name"), Hulls.hull(tier).get("name", "Sloop"))))
	field.placeholder_text = "Name her"
	nm.add_child(field)
	var rb: Pane.PaneButton = Paper.button("Rename")
	rb.pressed.connect(func() -> void:
		var r: Variant = await session.act("renameShip", [field.text])
		session.persist()
		if _refused(r):
			Sound.slack()
		else:
			Sound.plip()
		_paint())
	field.text_submitted.connect(func(_t: String) -> void: rb.pressed.emit())
	nm.add_child(rb)
	var c: Dictionary = Hulls.combat(tier)
	Paper.stat(left, "Hull", "%s  ·  tier %d of %d" % [Hulls.hull(tier).get("name", "Sloop"), tier, Hulls.TOP])
	Paper.stat(left, "Hull points", str(int(Js.num(c.get("durability")))))
	Paper.stat(left, "Speed", str(int(Js.num(c.get("speed")))))
	Paper.stat(left, "Crew seats", str(Crew.party_slots(p)))
	Paper.stat(left, "Raid-item mounts", str(Armory.slots(p)))
	# The ladder, on the right: every hull, hers marked, the next one for sale.
	var right: VBoxContainer = VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 10)
	cols.add_child(right)
	Paper.text(right, "THE HULLS", "eyebrow", Paper.ink_soft())
	Paper.text(right, "Each hull is bought in turn. A bigger hull seats more crew, mounts more raid items, takes more punishment and hits harder at its weakest.", "small", Paper.ink_soft(), true)
	for h: Dictionary in Hulls.ladder():
		var t: int = int(h["tier"])
		var hc: Dictionary = Hulls.combat(t)
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 14)
		row.modulate.a = 1.0 if t <= tier + 1 else 0.45
		right.add_child(row)
		var art: TextureRect = TextureRect.new()
		art.texture = Skipper.tex(str(North.ship_art(t, null)["art"]))
		art.custom_minimum_size = Vector2(84, 56)
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		row.add_child(art)
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 0)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(v)
		var mounts: int = int(Js.num(hc.get("itemSlots")))
		Paper.text(v, str(h["name"]), "body_strong", Paper.ink())
		Paper.text(v, "%d hull  ·  %d speed  ·  %d crew  ·  %d mount%s  ·  %d least damage" % [int(Js.num(hc.get("durability"))), int(Js.num(hc.get("speed"))), int(Js.num(hc.get("crewSlots"))), mounts, "" if mounts == 1 else "s", int(Js.num(hc.get("minDamage")))], "small", Paper.ink_soft())
		if t == tier:
			Paper.text(row, "Sailing her", "body_strong", Paper.green())
		elif t < tier:
			Paper.text(row, "Outgrown", "small", Paper.ink_faint())
		elif t == tier + 1:
			var gated: bool = nav < int(h["navLevelReq"])
			var cost: float = float(h["cost"])
			var bb: Pane.PaneButton = Paper.button("Needs Navigation %d" % int(h["navLevelReq"])) if gated else Paper.primary("Buy  ·  %s ⟡" % Js.thousands(cost), true)
			bb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			bb.disabled = gated or Js.num(p.get("doubloons")) < cost
			bb.pressed.connect(func() -> void:
				var r: Variant = await session.act("buyShip", [])
				session.persist()
				if _refused(r):
					Sound.slack()
				else:
					Sound.chest(true)
				_paint())
			row.add_child(bb)
		else:
			Paper.text(row, "Navigation %d  ·  %s ⟡" % [int(h["navLevelReq"]), Js.thousands(float(h["cost"]))], "small", Paper.ink_faint())


# ── Her paint ─────────────────────────────────────────────────────────────────

func _look() -> void:
	var p: Dictionary = session.profile()
	var mow: bool = Hulls.tier_of(p) >= Hulls.SKIN_TIER
	var worn: Variant = p.get("equipped_ship_skin")
	Paper.text(_body, "HER PAINT", "eyebrow", Paper.ink_soft())
	Paper.text(_body, "Paint shows on the Man-o-War only." + ("" if mow else " Buy her and every paint you hold can be worn."), "small", Paper.ink_soft(), true)
	var owned: Array = Hulls.skins_owned(p)
	if owned.is_empty():
		Paper.text(_body, "No paint yet. Hull paints come off the deep end of the campaign and out of the gauntlets.", "body", Paper.ink_soft(), true)
		return
	var grid: GridContainer = GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 14)
	grid.add_theme_constant_override("v_separation", 14)
	_body.add_child(grid)
	var tiles: Array = [null]
	tiles.append_array(owned)
	for id: Variant in tiles:
		var v: VBoxContainer = VBoxContainer.new()
		v.custom_minimum_size = Vector2(240, 0)
		v.add_theme_constant_override("separation", 4)
		grid.add_child(v)
		var pic: TextureRect = TextureRect.new()
		pic.texture = Skipper.tex(str(North.ship_art(Hulls.SKIN_TIER, id)["art"]))
		pic.custom_minimum_size = Vector2(240, 130)
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		v.add_child(pic)
		Paper.text(v, "Plain hull" if id == null else str(Hulls.skin(str(id)).get("name", id)), "body_strong", Paper.ink())
		if worn == id:
			Paper.text(v, "Worn", "small", Paper.green())
		elif not mow and id != null:
			Paper.text(v, "Man-o-War only", "small", Paper.ink_faint())
		else:
			var b: Pane.PaneButton = Paper.button("Wear")
			b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
			var sid: Variant = id
			b.pressed.connect(func() -> void:
				await session.act("equipShipSkin", [sid])
				session.persist()
				Sound.plip()
				_paint())
			v.add_child(b)


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
			Paper.text(row, "Fitted", "body_strong", Paper.green())
			continue
		var open: bool = session.store.has_cleared(session.uid, r[5])
		var b: Pane.PaneButton = Paper.primary("%s ⟡" % Js.thousands(float(r[4])), true) if open else Paper.button(r[6])
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.disabled = not open or Js.num(p.get("doubloons")) < float(r[4])
		var op: String = r[1]
		b.pressed.connect(func() -> void:
			var res: Variant = await session.act(op, [])
			session.persist()
			if res is Dictionary and res.get("ok") == true:
				Sound.chest(true)
			else:
				_refused(res)
			_paint())
		row.add_child(b)
	_refit_panel(p)


## THE REFIT: every class pick re-chosen at once, in the order they were
## made, once the don is under. The first is free.
func _refit_panel(p: Dictionary) -> void:
	var picks: Dictionary = Js.obj(p.get("ship_classes"))
	if picks.is_empty() or not session.store.has_cleared(session.uid, "the_throne"):
		return
	var sc: Dictionary = Rules.data()["shipClasses"]
	var order: Array = Js.list(sc["chapterOrder"]).filter(func(ch: Variant) -> bool: return picks.has(ch))
	var cost: float = Campaign.refit_cost(Js.num(p.get("ship_refits_used")))
	Paper.rule(_body)
	Paper.text(_body, "THE REFIT", "eyebrow", Paper.ink_soft())
	Paper.text(_body, "Re-choose every Captain's Choice at once, in the order you made them. Your map stays as it is; only your classes change. %s" % ("The first refit is free." if cost == 0.0 else "Each refit after the first costs %s ⟡." % Js.thousands(cost)), "small", Paper.ink_soft(), true)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	_body.add_child(row)
	var walk: Dictionary = _rewalk if _rewalk is Dictionary else {}
	for i: int in order.size():
		var ch: String = order[i]
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 2)
		row.add_child(v)
		Paper.text(v, "CHAPTER %s" % ["I", "II", "III", "IV"][mini(i, 3)], "eyebrow", Paper.ink_faint())
		var id: Variant = walk.get(ch) if _rewalk is Dictionary else picks.get(ch)
		var c: Dictionary = Js.obj(Js.obj(sc["classes"]).get(id))
		if c.is_empty():
			Paper.text(v, "To choose", "body", Paper.ink_faint())
		else:
			Paper.text(v, str(c["name"]), "body_strong", Paper.ink())
	if not (_rewalk is Dictionary):
		var b: Pane.PaneButton = Paper.button("Begin a refit" + ("" if cost == 0.0 else "  ·  %s ⟡" % Js.thousands(cost)))
		b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		b.disabled = Js.num(p.get("doubloons")) < cost
		b.pressed.connect(func() -> void:
			_rewalk = {}
			_paint())
		_body.add_child(b)
		return
	# The next chapter's menu, given everything chosen before it.
	var next_ch: String = ""
	for ch: String in order:
		if not walk.has(ch):
			next_ch = ch
			break
	var acts: HBoxContainer = HBoxContainer.new()
	acts.add_theme_constant_override("separation", 8)
	_body.add_child(acts)
	if next_ch != "":
		for id: Variant in Campaign.offered_classes(walk):
			var c: Dictionary = Js.obj(sc["classes"][id])
			var ob: Pane.PaneButton = Paper.button(str(c["name"]))
			ob.tooltip_text = str(c.get("tagline", ""))
			var cid: Variant = id
			var chk: String = next_ch
			ob.pressed.connect(func() -> void:
				walk[chk] = cid
				_rewalk = walk
				_paint())
			acts.add_child(ob)
	else:
		var go: Pane.PaneButton = Paper.primary("Refit her" + ("" if cost == 0.0 else "  ·  %s ⟡" % Js.thousands(cost)), true)
		go.pressed.connect(func() -> void:
			var r: Variant = await session.act("refitShipClasses", [walk])
			session.persist()
			if r is Dictionary and (r as Dictionary).get("ok") == true:
				Sound.horn()
			else:
				_refused(r)
				Sound.slack()
			_rewalk = null
			_paint())
		acts.add_child(go)
	var cancel: Pane.PaneButton = Paper.button("Cancel")
	cancel.pressed.connect(func() -> void:
		_rewalk = null
		_paint())
	acts.add_child(cancel)
	if next_ch != "":
		for id: Variant in Campaign.offered_classes(walk):
			var c: Dictionary = Js.obj(sc["classes"][id])
			Paper.text(_body, "%s:  %s" % [c["name"], ",  ".join(Js.list(c.get("bullets")).map(func(bl: Dictionary) -> String: return str(bl["label"])))], "small", Paper.ink_soft())


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
			Paper.text(req, ("✓  " if ok else "✗  ") + r[1], "small", Paper.green() if ok else Paper.red())
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
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 4)
		row.add_child(v)
		var mounted: bool = active == id
		var building: bool = build != null and build["id"] == id
		var lit: bool = mounted or building
		Paper.text(v, ("Mounted" if mounted else ("Being built" if building else "")), "eyebrow", Paper.CHOSEN)
		Paper.text(v, str(a["name"]), "title", Paper.CHOSEN if lit else Paper.ink())
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
			var main: bool = (op == "startUltimateBuild" or op == "switchUltimate") and not locked
			var b: Pane.PaneButton = Paper.primary(label, true) if main else Paper.button(label if not locked else "Not yet")
			b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
			b.disabled = locked
			b.pressed.connect(func() -> void:
				var r: Variant = await session.act(op, [id])
				session.persist()
				if r is Dictionary and r.get("ok") == true:
					Sound.horn()
				else:
					_refused(r)
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
		sb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		sb.pressed.connect(func() -> void:
			var r: Variant = await session.act("buyUltimateSchematics", [])
			session.persist()
			_refused(r)
			_paint())
		h.add_child(sb)


## The web's copy, without its dashes (house rule: no em-dashes).
static func _clean(t: String) -> String:
	t = t.strip_edges().trim_prefix("— ").trim_prefix("—")
	return t.replace(" — ", ", ").replace(" —", ",").replace("— ", ", ").replace("—", ", ").strip_edges()


static func _hm(ms: float) -> String:
	var m: int = int(ms / 60000.0)
	return "%dh %02dm" % [m / 60, m % 60]
