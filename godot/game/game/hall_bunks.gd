class_name HallBunks
extends VBoxContainer
## THE BUNKS ROOM OF THE CREW HALL (Kong, 2026-10-03: "make the bunk and
## training experience look and feel better", painted bunks and animations).
## Rules: core/bunks.gd. On the night paper, inside game/crew_hall.gd.
##
##   THE BUNKS  one painted bunk per hall tier (driftwood up to the hall of
##              legends; the sixth is the Leviathan's, carved from bone). An
##              empty one asks for a hand; a hand in one sleeps there, the
##              card breathing, a z drifting up now and then, and a candle at
##              its side burns down as the stint runs (the candle IS the
##              timer). A finished stint glows and wakes: press it and the
##              hand rises, the XP counts in, the level ticks up a note at a
##              time, motes fly; a Special stepping up is a promotion card.
##   THE DEEP   the Leviathan bunk's draw, laid beside the trait the hand
##              carries: keep it or take it.
##   DRILLS / STORES  the two ladders, their paintings growing with the tier
##              (the web's crew/drill_N and stores_N), with what the next buys.

const LEVIATHAN: Color = Color("#3fd6c4")
const GOLD: Color = Color(0.98, 0.8, 0.38)

var hall: CrewHall
var _tiles: Array = []


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	build()


func st() -> Dictionary:
	return hall._state


func build() -> void:
	for c: Node in get_children():
		c.queue_free()
	_tiles.clear()
	var s: Dictionary = st()
	var tier: int = int(Js.num(s.get("hallTier")))
	var slots: int = int(Crew.hall_def(tier)["bunks"])
	Paper.text(self, "A hand in a bunk trains while you are away: %s XP an hour, for a stint of %d hour%s. They stay until the stint is done, then you collect." % [Js.thousands(Bunks.rate_per_hour(s.get("drillLevel"))), int(Js.num(s.get("capHours"))), "" if int(Js.num(s.get("capHours"))) == 1 else "s"], "note", Paper.ink_soft(), true)
	# Offers from the deep waiting on an answer come first.
	for m: Dictionary in Js.list(s.get("roster")):
		if m.get("pendingTrait") != null:
			add_child(_offer_card(m))
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(row)
	var who: Dictionary = {}
	for k: String in Js.obj(s.get("bunkTerms")):
		var t: Dictionary = s["bunkTerms"][k]
		who[int(Js.num(t.get("slot")))] = { "crewId": k, "terms": t }
	for i: int in 6:
		var tile: BunkTile = BunkTile.new()
		tile.owner_room = self
		tile.slot = i
		tile.open = i < slots
		tile.need_tier = i + 1
		tile.art = Skipper.tex("crew/bunk-leviathan.png" if i == 5 else "crew/bunk-%d.png" % mini(5, tier))
		if who.has(i):
			tile.terms = who[i]["terms"]
			tile.member = _member(float(who[i]["crewId"]))
		row.add_child(tile)
		_tiles.append(tile)
	Paper.rule(self)
	var lad: HBoxContainer = HBoxContainer.new()
	lad.add_theme_constant_override("separation", 16)
	add_child(lad)
	lad.add_child(_ladder("drill"))
	lad.add_child(_ladder("stores"))


func _member(id: float) -> Dictionary:
	for m: Dictionary in Js.list(st().get("roster")):
		if float(m["id"]) == id:
			return m
	return {}


# ── Drills and Stores ─────────────────────────────────────────────────────────

func _ladder(kind: String) -> Control:
	var s: Dictionary = st()
	var drill: bool = kind == "drill"
	var lv: int = int(Js.num(s.get("drillLevel" if drill else "storesLevel")))
	var box: HBoxContainer = HBoxContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", 12)
	var art: TextureRect = TextureRect.new()
	art.texture = Skipper.tex("crew/%s_%d.png" % ["drill" if drill else "stores", lv])
	art.custom_minimum_size = Vector2(96, 96)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	box.add_child(art)
	var v: VBoxContainer = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 2)
	box.add_child(v)
	Paper.text(v, "%s  ·  %s of VI" % ["DRILLS" if drill else "STORES", Bunks.TIER[lv - 1]], "eyebrow", Paper.ink_soft())
	# Six pips, the tiers bought inked.
	var pips: Control = Control.new()
	pips.custom_minimum_size = Vector2(0, 10)
	pips.draw.connect(func() -> void:
		for i: int in 6:
			var c: Vector2 = Vector2(6.0 + i * 16.0, 5.0)
			pips.draw_circle(c, 5.0, Color(GOLD, 0.9) if i < lv else Color(Paper.NIGHT_INK, 0.18)))
	v.add_child(pips)
	if drill:
		Paper.text(v, "%s XP an hour in every bunk" % Js.thousands(Bunks.rate_per_hour(lv)), "body_strong", Paper.ink())
	else:
		Paper.text(v, "Stints of %d hour%s" % [int(Bunks.cap_hours(lv)), "" if int(Bunks.cap_hours(lv)) == 1 else "s"], "body_strong", Paper.ink())
	if lv >= 6:
		Paper.text(v, "As far as it goes.", "small", Paper.ink_faint())
		return box
	var cost: float = float((Bunks.b()["drillCost"] if drill else Bunks.b()["storesCost"])[lv - 1])
	var next_line: String = ("Next: %s XP an hour" % Js.thousands(Bunks.rate_per_hour(lv + 1))) if drill else ("Next: %d-hour stints (the same XP a day, fewer visits)" % int(Bunks.cap_hours(lv + 1)))
	Paper.text(v, next_line, "small", Paper.ink_soft(), true)
	var locked: bool = int(Js.num(s.get("hallTier"))) < lv + 1
	var b: Pane.PaneButton = Paper.button(("Needs hall tier %d" % (lv + 1)) if locked else "Buy %s  ·  %s ⟡" % [Bunks.TIER[lv], Js.thousands(cost)], not locked)
	b.disabled = locked or Js.num(s.get("doubloons")) < cost
	b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	b.pressed.connect(func() -> void:
		var r: Dictionary = await hall._act("buyHallUpgrade", [kind])
		if r.has("state"):
			Sound.chest(true)
			Rumble.buzz([0, 30, 30, 50])
			hall._draw_room()
			_flourish(art))
	v.add_child(b)
	return box


## A bought tier: the painting swells and settles with a ring of gold.
func _flourish(old_art: TextureRect) -> void:
	pass_on_next(func() -> void:
		var tw: Tween = create_tween()
		tw.tween_property(self, "modulate", Color(1.15, 1.1, 0.95), 0.15)
		tw.tween_property(self, "modulate", Color.WHITE, 0.4))


func pass_on_next(f: Callable) -> void:
	get_tree().process_frame.connect(f, CONNECT_ONE_SHOT)


# ── The deep's offer ──────────────────────────────────────────────────────────

func _offer_card(m: Dictionary) -> Control:
	var p: Pane = Kit.pane(null, { "radius": 12, "fill": [Color("#0f1d1d")], "border": [2, Color(LEVIATHAN, 0.75)], "shadow": [Color(LEVIATHAN, 0.35), 18, Vector2.ZERO], "pad": [16, 12, 16, 12] })
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 14)
	p.add_child(h)
	var pic: TextureRect = TextureRect.new()
	pic.texture = hall._thumb(str(m.get("filename", "")))
	pic.custom_minimum_size = Vector2(72, 84)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	h.add_child(pic)
	var v: VBoxContainer = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 2)
	h.add_child(v)
	Paper.text(v, "A DRAW FROM THE DEEP  ·  %s" % str(m.get("name", "")).to_upper(), "eyebrow", LEVIATHAN.lightened(0.2))
	var now_t: Array = Bunks.net_trait(Js.list(m.get("effects")))
	var off_t: Array = Bunks.net_trait([m["pendingTrait"]])
	var pair: HBoxContainer = HBoxContainer.new()
	pair.add_theme_constant_override("separation", 10)
	v.add_child(pair)
	pair.add_child(_trait_chip("Carries", now_t, Paper.ink_soft(), off_t))
	var arrow: Label = Paper.text(pair, "→", "title", LEVIATHAN)
	arrow.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	pair.add_child(_trait_chip("The deep offers", off_t, LEVIATHAN, now_t))
	Paper.text(v, "Take it and it replaces the trait they carry. Keep theirs and this draw is gone.", "small", Paper.ink_faint(), true)
	var bs: VBoxContainer = VBoxContainer.new()
	bs.add_theme_constant_override("separation", 6)
	bs.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(bs)
	var take: Pane.PaneButton = Paper.button("Take the new one", true)
	take.pressed.connect(func() -> void: _answer(m, true, p))
	bs.add_child(take)
	var keep: Pane.PaneButton = Paper.button("Keep theirs")
	keep.pressed.connect(func() -> void: _answer(m, false, p))
	bs.add_child(keep)
	return p


func _trait_chip(head: String, t: Array, col: Color, other: Array) -> Control:
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 0)
	Paper.text(v, head, "small", Paper.ink_faint())
	var lab: String = str(Js.obj(Crew.t().get("traitLabels")).get("%d,%d,%d" % [int(t[0]), int(t[1]), int(t[2])], ""))
	Paper.text(v, lab if lab != "" else "No trait", "body_strong", col)
	var bits: Array = []
	for k: int in 3:
		bits.append("%s %+d" % [["Power", "Dodge", "Fortune"][k], int(t[k])])
	Paper.text(v, "  ".join(PackedStringArray(bits)), "small", Paper.ink_soft())
	return v


func _answer(m: Dictionary, take: bool, card: Control) -> void:
	var r: Dictionary = await hall._act("resolveTraitOffer", [m["id"], take])
	if not r.has("state"):
		return
	if take:
		Sound.seal(true)
	else:
		Sound.slack()
	var tw: Tween = card.create_tween().set_parallel()
	tw.tween_property(card, "modulate:a", 0.0, 0.3)
	tw.tween_property(card, "scale", Vector2(0.96, 0.96), 0.3)
	await tw.finished
	hall._draw_room()


# ── Putting a hand in, and taking them out ────────────────────────────────────

## An empty bunk pressed: the hands who can take it, as a row of cards.
func pick_for(tile: BunkTile) -> void:
	Paper.night = true
	var shade: Control = Control.new()
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	hall.add_child(shade)
	var dim: ColorRect = ColorRect.new()
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.add_child(dim)
	dim.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			shade.queue_free())
	var cc: CenterContainer = CenterContainer.new()
	cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shade.add_child(cc)
	var sheet: Control = Control.new()
	sheet.custom_minimum_size = Vector2(900, 560)
	cc.add_child(sheet)
	Paper.sheet(sheet, 7.0)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 22)
	sheet.add_child(m)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	m.add_child(v)
	var lev: bool = Bunks.is_leviathan(float(tile.slot))
	Paper.text(v, "The Leviathan bunk" if lev else "Bunk %d" % (tile.slot + 1), "title", LEVIATHAN if lev else Paper.ink())
	var cap: int = int(Js.num(st().get("capHours")))
	var hours: Array = [cap]
	if lev:
		Paper.text(v, "Every stint here ends in a draw from the deep: a new trait, offered beside theirs. A shorter stint is more draws for the same XP a day.", "note", Paper.ink_soft(), true)
		var hr: HBoxContainer = HBoxContainer.new()
		hr.add_theme_constant_override("separation", 6)
		v.add_child(hr)
		Paper.text(hr, "Stint:", "body_strong", Paper.ink())
		var btns: Array = []
		for h: int in range(1, cap + 1):
			var hb: Pane.PaneButton = Paper.button("%dh" % h, true)
			hb.modulate = Color(1, 1, 1, 1.0 if h == cap else 0.45)
			btns.append(hb)
			hb.pressed.connect(func() -> void:
				hours[0] = h
				for i: int in btns.size():
					(btns[i] as Control).modulate = Color(1, 1, 1, 1.0 if i + 1 == h else 0.45))
			hr.add_child(hb)
	else:
		Paper.text(v, "%d hour%s, %s XP when it is done. They stay in until then." % [cap, "" if cap == 1 else "s", Js.thousands(floor(Bunks.rate_per_hour(st().get("drillLevel")) * cap))], "note", Paper.ink_soft(), true)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(scroll)
	var cards: HFlowContainer = HFlowContainer.new()
	cards.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cards.add_theme_constant_override("h_separation", 8)
	cards.add_theme_constant_override("v_separation", 8)
	scroll.add_child(cards)
	var bunked: Array = Js.list(st().get("bunkedCrewIds")).map(func(x: Variant) -> float: return float(x))
	var any: bool = false
	# Who can go in first, the rest after, greyed with the reason.
	var rows: Array = []
	for mem: Dictionary in Js.list(st().get("roster")):
		var why: String = ""
		if bunked.has(float(mem["id"])):
			why = "In a bunk"
		elif mem.get("pendingTrait") != null:
			why = "Holding a draw"
		elif mem.get("raidSlot") != null or mem.get("voyageSlot") != null:
			why = "In a party"
		elif not Bunks.can_bunk(Js.num(mem.get("xp")), float(tile.slot)):
			why = "Fully trained"
		rows.append([mem, why])
	rows.sort_custom(func(x: Array, y: Array) -> bool: return x[1] == "" and y[1] != "")
	for rw: Array in rows:
		var mem: Dictionary = rw[0]
		var why: String = rw[1]
		var cb: Button = Button.new()
		cb.flat = true
		cb.focus_mode = Control.FOCUS_NONE
		cb.custom_minimum_size = Vector2(112, 160)
		cb.disabled = why != ""
		var cv: VBoxContainer = VBoxContainer.new()
		cv.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		cv.mouse_filter = Control.MOUSE_FILTER_IGNORE
		cv.add_theme_constant_override("separation", 0)
		cb.add_child(cv)
		var pic: TextureRect = TextureRect.new()
		pic.texture = hall._thumb(str(mem.get("filename", "")))
		pic.custom_minimum_size = Vector2(0, 110)
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		pic.modulate = Color(1, 1, 1, 0.35 if why != "" else 1.0)
		cv.add_child(pic)
		var nl: Label = Paper.text(cv, str(mem.get("name", "")), "small", Paper.ink() if why == "" else Paper.ink_faint())
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		nl.clip_text = true
		var sl: Label = Paper.text(cv, why if why != "" else "Lv %d" % Crew.level(Js.num(mem.get("xp"))), "small", Paper.ink_faint() if why != "" else Paper.ink_soft())
		sl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		if why == "":
			any = true
			var mid: float = float(mem["id"])
			cb.pressed.connect(func() -> void:
				shade.queue_free()
				_put_in(tile, mid, hours[0]))
		cards.add_child(cb)
	if not any:
		Paper.text(v, "Nobody free to bunk right now.", "note", Paper.ink_faint())
	var close: Pane.PaneButton = Paper.button("Not now")
	close.size_flags_horizontal = Control.SIZE_SHRINK_END
	close.pressed.connect(shade.queue_free)
	v.add_child(close)
	Paper.night = false
	sheet.modulate.a = 0.0
	sheet.create_tween().tween_property(sheet, "modulate:a", 1.0, 0.18)


func _put_in(tile: BunkTile, crew_id: float, hours: int) -> void:
	var r: Dictionary = await hall._act("bunkCrew", [crew_id, float(tile.slot), float(hours)])
	if not r.has("state"):
		hall._draw_room()
		return
	Sound.seal(false)
	Rumble.tap(14)
	hall._draw_room()
	# The new tile tucks its hand in (a drop and a settle).
	pass_on_next(func() -> void:
		for t: BunkTile in hall.find_children("", "BunkTile", true, false):
			if t.slot == tile.slot:
				t.tuck_in())


## A finished stint pressed: the hand rises, the XP counts in, the levels
## tick up, then any draw from the deep and any promotion.
func collect(tile: BunkTile) -> void:
	var cid: float = float(tile.member.get("id", -1))
	var before: Dictionary = tile.member.duplicate()
	if hall._busy:
		return
	hall._busy = true
	var r: Variant = await hall.session.act("collectBunk", [cid])
	var promos: Variant = await hall.session.act("checkPromotions")
	hall.session.persist()
	hall._busy = false
	if not (r is Dictionary) or (r as Dictionary).has("error"):
		hall._note(str((r as Dictionary).get("error", "Could not collect.")) if r is Dictionary else "Could not collect.")
		return
	var res: Dictionary = r
	var grant: Dictionary = Js.list(res.get("grants"))[0] if not Js.list(res.get("grants")).is_empty() else {}
	var wake: WakeMoment = WakeMoment.new()
	wake.member = before
	wake.grant = grant
	wake.leviathan = Bunks.is_leviathan(float(tile.slot))
	wake.from_rect = tile.get_global_rect()
	wake.hall = hall
	hall.add_child(wake)
	await wake.done
	hall._state = res["state"]
	hall._draw_room()
	for p: Variant in Js.list(promos):
		var pc: PromotionCard = PromotionCard.new()
		pc.promo = p
		hall.add_child(pc)
		await pc.done
