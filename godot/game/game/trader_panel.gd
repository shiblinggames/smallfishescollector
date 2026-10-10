class_name TraderPanel
extends Control
## HAILING SOMEONE ON THE WATER (Godot port of app/(app)/sea/TraderPanel.tsx,
## the rest of the sea, stage 4): a card over the chart with who they are,
## what they say, and what they offer.
##
## A peddler or a deep tinker sells a bundle of bait under the shop's price; a
## salter buys the whole hold; a blockade runner cuts a deck for a rod (the
## stake and the odds printed before anyone pays). A talker only talks: "Go on"
## walks their lines. One of the nine regulars opens the conversation
## ("Speak to"), and at full rapport the two who carry a rod no shop sells
## will part with it here. Six deals a day across the whole sea; the card
## says how many are left.

signal closed
## A deal went through (the sea greys their plate), and the purse or the
## hold moved (the HUD redraws).
signal dealt(key: String)
signal changed

var session: Session
var trader: Dictionary = {}
var already_dealt: bool = false
var deals_left: int = 6
var _folk: Dictionary = {}
var _rap: Dictionary = {}
var _accent: Color = Color(1.0, 0.81, 0.54)
var _card: Pane
var _col: VBoxContainer
var _quote: Label
var _dots: HBoxContainer
var _rod_box: VBoxContainer
var _offer: Pane
var _note: Label
var _left: Label
var _own: Label
var _foot: HBoxContainer
var _go: Button
var _close: Button
var _said: int = 0
var _done: bool = false
var _busy: bool = false
var _cut: Variant = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	if trader.get("folkId") != null:
		_folk = Folk.by_id(str(trader["folkId"]))
		if not _folk.is_empty():
			_accent = Color(str(_folk["accent"]))
	var shade: ColorRect = Kit.scrim(self)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())

	_card = Pane.new(Kit.modal(_accent if not _folk.is_empty() else Kit.SAND, 20))
	_card.anchor_left = 0.5
	_card.anchor_right = 0.5
	_card.anchor_top = 1.0
	_card.anchor_bottom = 1.0
	_card.offset_left = -260
	_card.offset_right = 260
	_card.offset_top = -30
	_card.offset_bottom = -30
	_card.grow_vertical = Control.GROW_DIRECTION_BEGIN
	add_child(_card)
	_col = VBoxContainer.new()
	_col.add_theme_constant_override("separation", 8)
	_card.add_child(_col)

	var head: HBoxContainer = HBoxContainer.new()
	_col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 2)
	head.add_child(titles)
	var eyebrow: HBoxContainer = HBoxContainer.new()
	eyebrow.add_theme_constant_override("separation", 0)
	titles.add_child(eyebrow)
	var role: Label = Kit.text(eyebrow, _role(), "eyebrow", Kit.a(_accent, 0.8) if not _folk.is_empty() else Kit.a(Kit.SAND, 0.75))
	role.name = "Role"
	if trader["deal"] == "talk" and _folk.is_empty():
		Kit.text(eyebrow, "  ·  %s" % trader.get("mood", ""), "eyebrow", Kit.a(Kit.SAND, 0.45))
	Kit.text(titles, str(trader["name"]), "title", Kit.INK)
	var x: Button = Kit.close_button()
	x.pressed.connect(close)
	head.add_child(x)

	# What they say: for a talker the whole point, set as a quote with a rule
	# down the side; for everyone else a line of flavour above the offer.
	var talk: bool = trader["deal"] == "talk"
	var qbox: HBoxContainer = HBoxContainer.new()
	qbox.add_theme_constant_override("separation", 12)
	_col.add_child(qbox)
	if talk:
		var rule: ColorRect = ColorRect.new()
		rule.color = Kit.a(Kit.SAND, 0.45)
		rule.custom_minimum_size = Vector2(2, 0)
		rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
		qbox.add_child(rule)
	_quote = Kit.text(qbox, _line(), "body", Color("#dbe8f2") if talk else Color("#b9cbd8"), true)
	_quote.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_quote.add_theme_font_override("font", Kit.italic())
	_quote.add_theme_font_size_override("font_size", 16 if talk else 15)
	if talk:
		var lines: Array = trader.get("lines", [])
		if lines.size() > 1:
			_dots = HBoxContainer.new()
			_dots.add_theme_constant_override("separation", 5)
			_dots.alignment = BoxContainer.ALIGNMENT_CENTER
			_col.add_child(_dots)
			_paint_dots()

	_rod_box = VBoxContainer.new()
	_col.add_child(_rod_box)
	if not talk:
		_offer = Kit.pane(_col, Kit.inset(14))
		_draw_offer()
	_note = Kit.text(_col, "", "body_strong", Kit.GOOD, true)
	_note.visible = false
	_left = Kit.text(_col, "", "small", Color(1, 1, 1, 0.42))
	_own = Kit.text(_col, "", "small", Color(1, 1, 1, 0.55), true)
	_own.visible = false
	_foot = HBoxContainer.new()
	_foot.add_theme_constant_override("separation", 10)
	_col.add_child(_foot)
	_draw_foot()
	# The card is readied inside add_child (this is the panel's own _ready),
	# so its entrance starts here, not on its ready signal.
	Kit.modal_in(_card)

	if not _folk.is_empty():
		var rows: Variant = await session.act("folkState", [])
		if rows is Array:
			for r: Dictionary in rows:
				if r["folkId"] == _folk["id"]:
					_rap = r
		if is_inside_tree():
			(_card.find_child("Role", true, false) as Label).text = _role()
			_draw_rod()
			_draw_foot()


func _role() -> String:
	if trader.has("roleLabel"):
		return str(trader["roleLabel"])
	if not _folk.is_empty():
		return Folk.role_for(_folk, Folk.tier_for(Js.num(_rap.get("points"))))
	return str(Rules.data()["traders"]["kindLabel"].get(trader["kind"], ""))


func _line() -> String:
	if trader["deal"] == "talk":
		var lines: Array = trader.get("lines", [trader["line"]])
		return str(lines[_said % lines.size()])
	return str(trader["line"])


func _paint_dots() -> void:
	for c: Node in _dots.get_children():
		c.queue_free()
	var lines: Array = trader["lines"]
	for i: int in lines.size():
		var d: Pane = Pane.new({ "radius": 3, "fill": [Kit.a(Kit.SAND, 0.9) if i == _said % lines.size() else Color(1, 1, 1, 0.18)], "pad": 0 })
		d.custom_minimum_size = Vector2(5, 5)
		_dots.add_child(d)


func _spent() -> bool:
	return already_dealt or _done


func _rod_owned() -> bool:
	if trader["deal"] != "wager":
		return false
	for r: Dictionary in Rules.data()["rods"]:
		if float(r["tier"]) == float(trader["rodTier"]):
			return Js.num(Js.obj(session.save.get("rodItems")).get(r["id"])) > 0.0
	return false


func _rod() -> Dictionary:
	for r: Dictionary in Rules.data()["rods"]:
		if trader.has("rodTier") and float(r["tier"]) == float(trader["rodTier"]):
			return r
	return {}


## The offer, stated plainly: the flavour above may have charm, the numbers
## may not.
func _draw_offer() -> void:
	for c: Node in _offer.get_children():
		c.queue_free()
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	_offer.add_child(v)
	match str(trader["deal"]):
		"wager":
			Kit.text(v, "He will not name a price", "eyebrow", Color("#7fd8ff"))
			Kit.text(v, str(_rod().get("name", "A rod")), "heading", Kit.INK)
			if _cut != null:
				var won: bool = _cut["won"]
				Kit.text(v, ("He turns the card, looks at it for a long moment, and hands the %s across. Equip it from the tackle shop." % _cut["rodName"]) if won
					else "He turns the card, shakes his head once, and pockets your stake. That is the deal you agreed to. Come back tomorrow.",
					"body_strong", Color("#7fd8ff") if won else Color(1, 1, 1, 0.62), true)
			else:
				var nums: HBoxContainer = HBoxContainer.new()
				nums.add_theme_constant_override("separation", 22)
				v.add_child(nums)
				var a: VBoxContainer = VBoxContainer.new()
				nums.add_child(a)
				Kit.text(a, "The stake", "label", Color(1, 1, 1, 0.45))
				Kit.money(a, float(trader["stake"]), "price")
				var b: VBoxContainer = VBoxContainer.new()
				nums.add_child(b)
				Kit.text(b, "Your odds", "label", Color(1, 1, 1, 0.45))
				Kit.text(b, "1 in %d" % int(Js.round(1.0 / float(trader["odds"]))), "value", Color("#7fd8ff"))
				Kit.text(v, "One cut of the deck. Win and the rod is yours for the stake. Lose and he keeps it and you get nothing.", "small", Color(1, 1, 1, 0.5), true)
				Kit.text(v, "Once a night, whoever you find out here.", "small", Color(1, 1, 1, 0.5), true)
		"bait":
			var bait: Dictionary = Rules.bait(trader["baitType"])
			Kit.text(v, "%d %s" % [int(trader["qty"]), bait.get("name", "bait")], "heading", Kit.INK)
			var price: HBoxContainer = HBoxContainer.new()
			price.add_theme_constant_override("separation", 10)
			v.add_child(price)
			Kit.money(price, float(trader["cost"]), "price")
			var was: Label = Kit.text(price, "%s ⟡" % Js.thousands(float(trader["shopCost"])), "small", Color(1, 1, 1, 0.45))
			was.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			var strike: ColorRect = ColorRect.new()
			strike.color = Color(1, 1, 1, 0.45)
			strike.anchor_top = 0.55
			strike.anchor_bottom = 0.55
			strike.anchor_right = 1.0
			strike.offset_bottom = 1
			strike.mouse_filter = Control.MOUSE_FILTER_IGNORE
			was.add_child(strike)
			Kit.text(v, "%d%% under the shop" % int(Js.round((1.0 - float(trader["cost"]) / float(trader["shopCost"])) * 100.0)), "small", Kit.GOOD)
		"buy":
			Kit.text(v, "Sell the whole hold", "heading", Kit.INK)
			Kit.text(v, "%d%% of market value" % int(Js.round(float(trader["rate"]) * 100.0)), "value", Kit.GOLD)
			Kit.text(v, "Paid now, no settling. Better than a quick sell on the dock and worse than working the market yourself.", "small", Color(1, 1, 1, 0.5), true)


## WHAT A FRIENDSHIP IS FOR: at full rapport, the rod no shop stocks. Nothing
## hints at it beforehand.
func _draw_rod() -> void:
	for c: Node in _rod_box.get_children():
		c.queue_free()
	if _folk.is_empty() or _folk.get("rodTier") == null or int(_rap.get("tier", 0)) != 4:
		return
	var rod: Dictionary = {}
	for r: Dictionary in Rules.data()["rods"]:
		if float(r["tier"]) == float(_folk["rodTier"]):
			rod = r
	if rod.is_empty():
		return
	var owned: bool = Js.num(Js.obj(session.save.get("rodItems")).get(rod["id"])) > 0.0
	var box: Pane = Kit.pane(_rod_box, { "radius": 12, "fill": [Kit.a(_accent, 0.09)], "border": [1, Kit.a(_accent, 0.36)], "shadow": [Kit.a(_accent, 0.12), 22], "pad": 14 })
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	box.add_child(v)
	Kit.text(v, "Yours" if owned else "%s will part with it" % _folk["short"], "eyebrow", _accent)
	Kit.text(v, str(rod["name"]), "heading", Kit.INK)
	if owned:
		Kit.text(v, "Stowed. It is in your tackle now.", "small", Color("#cfe0ec"), true)
		return
	Kit.text(v, str(rod.get("description", "")), "small", Color("#b9cbd8"), true)
	Kit.money(v, float(rod["cost"]), "price")
	var take: Button = Kit.button("Take the %s" % rod["name"], "accent", "large", _accent)
	v.add_child(take)
	var err: Label = Kit.text(v, "", "small", Kit.DANGER_INK, true)
	err.visible = false
	take.pressed.connect(func() -> void:
		if _busy:
			return
		_busy = true
		var r: Variant = await session.act("buyFolkRod", [_folk["id"]])
		_busy = false
		if r is Dictionary and not (r as Dictionary).has("error"):
			session.persist()
			Rumble.buzz([0, 30, 60, 90])
			Sound.chest(true)
			changed.emit()
			_draw_rod()
		else:
			err.text = str((r as Dictionary).get("error", "The deal fell through.")) if r is Dictionary else "The deal fell through."
			err.visible = true)


func _draw_foot() -> void:
	for c: Node in _foot.get_children():
		c.queue_free()
	var talk: bool = trader["deal"] == "talk"
	var wager: bool = trader["deal"] == "wager"
	_left.visible = not _spent() and not talk and not _note.visible
	_left.text = "%d %s left today" % [deals_left, "deal" if deals_left == 1 else "deals"]
	_go = null
	_own.visible = wager and _rod_owned() and _cut == null
	_own.text = "You already carry the %s. He has nothing to cut you for." % _rod().get("name", "rod")
	if _own.visible:
		_left.visible = false
	elif not _spent() and not talk and _cut == null:
		var label: String = "Buy" if trader["deal"] == "bait" else ("Stake %s ⟡" % Js.thousands(float(trader["stake"])) if wager else "Sell the hold")
		_go = Kit.button(label, "primary")
		_go.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_go.disabled = not wager and deals_left <= 0
		_go.pressed.connect(_cut_deck if wager else _strike)
		_foot.add_child(_go)
	if talk and (trader.get("lines", []) as Array).size() > 1:
		var on: Button = Kit.button("Go on", "accent", "large", Kit.SAND)
		on.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		on.pressed.connect(func() -> void:
			Rumble.tap(8)
			_said += 1
			_quote.text = _line()
			_paint_dots())
		_foot.add_child(on)
		_go = on
	if not _folk.is_empty():
		var warm: bool = _rap.is_empty() or not _rap.get("chattedToday", false) or _rap.get("want") == null or _rap.get("wantReady", false)
		var speak: Button = Kit.button("Speak to %s" % _folk["short"], "accent" if warm else "secondary", "large", _accent)
		speak.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		speak.pressed.connect(_open_scene)
		_foot.add_child(speak)
		_go = speak
	_close = Kit.button("Thank them" if talk else ("Sail on" if _spent() or _cut != null else "No thanks"), "secondary")
	_close.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_close.pressed.connect(close)
	_foot.add_child(_close)
	(_go if _go != null and not _go.disabled else _close).grab_focus.call_deferred()


func _say(text: String, good: bool) -> void:
	_note.text = text
	_note.add_theme_color_override("font_color", Kit.GOOD if good else Kit.DANGER_INK)
	_note.visible = true


func _strike() -> void:
	if _busy:
		return
	_busy = true
	_go.text = "…"
	Rumble.tap(14)
	var r: Variant = await session.act("strikeDeal", [trader["key"]])
	_busy = false
	if not r is Dictionary or (r as Dictionary).has("error"):
		_say(str((r as Dictionary).get("error", "The deal fell through. Try again.")) if r is Dictionary else "The deal fell through. Try again.", false)
		_draw_foot()
		return
	session.persist()
	Rumble.buzz([0, 30, 40, 60])
	_done = true
	deals_left -= 1
	if r.has("earned"):
		_say("%s ⟡ for the lot. Hold's empty." % Js.thousands(float(r["earned"])), true)
	else:
		_say("%d %s aboard." % [int(r["qty"]), Rules.bait(r["baitType"]).get("name", "bait")], true)
	dealt.emit(trader["key"])
	changed.emit()
	_draw_foot()


func _cut_deck() -> void:
	if _busy:
		return
	_busy = true
	_go.text = "…"
	Rumble.tap(14)
	var r: Variant = await session.act("wagerForRunnerRod", [trader["key"]])
	_busy = false
	if not r is Dictionary or (r as Dictionary).has("error"):
		_say(str((r as Dictionary).get("error", "The deal fell through. Try again.")) if r is Dictionary else "The deal fell through. Try again.", false)
		_draw_foot()
		return
	session.persist()
	_cut = { "won": r["won"], "rodName": r["rodName"] }
	if r["won"]:
		Rumble.buzz([0, 40, 60, 80, 40, 120])
		Sound.chest(true)
		dealt.emit(trader["key"])
	else:
		Rumble.tap(30)
	changed.emit()
	_draw_offer()
	_draw_foot()


func _open_scene() -> void:
	Rumble.tap(10)
	if _rap.is_empty():
		var rows: Variant = await session.act("folkState", [])
		if rows is Array:
			for r: Dictionary in rows:
				if r["folkId"] == _folk["id"]:
					_rap = r
	var s: FolkScene = FolkScene.new()
	s.session = session
	s.folk = _folk
	s.rap = _rap
	s.changed.connect(func(rap: Dictionary) -> void:
		_rap = rap
		(_card.find_child("Role", true, false) as Label).text = _role()
		_draw_rod()
		changed.emit())
	s.closed.connect(func() -> void:
		_draw_foot()
		if is_instance_valid(_go):
			_go.grab_focus())
	add_child(s)


func close() -> void:
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()
