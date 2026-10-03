class_name DenBlackjackTable
extends VBoxContainer
## BLACKJACK WITH THE CREW (in a Charter; the table is game/den_tables.gd on
## the founder's game). Up to four seats along the table, each with its
## captain's name in their colour, their cards and their word at the end; the
## dealer across the top. Pick a bet and say Ready (it deals when everyone is,
## or 15 seconds after the first); on your turn your seat lights and the moves
## come up (H, S, D, P), with 30 seconds before a stand is taken for you.
## Everyone sees every card dealt, the hole card turn over and the dealer draw.

const BETS: Array = [10.0, 25.0, 50.0, 100.0, 250.0, 500.0]

var session: Session
var den: DenRoom
var _bet: float = 25.0
var _dealer: HBoxContainer
var _dealer_total: Label
var _seats_box: HBoxContainer
var _seat_ui: Dictionary = {}
var _shown: Dictionary = {}
var _shown_dealer: Array = []
var _says: Label
var _ctl: HBoxContainer
var _round: int = -1
var _state: Dictionary = {}
var _deadline: float = -1.0
var _queue: Array = []
var _draining: bool = false
var _paid_round: int = -1


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	var table: Pane = Kit.pane(self, { "radius": 16, "fill": [Kit.WOOD_HI, Kit.WOOD_LO], "border": [2, Color(0.25, 0.15, 0.08, 0.9)], "shadow": [Color(0, 0, 0, 0.5), 22, Vector2(0, 8)], "pad": [22, 16, 22, 18], "keep": true, "grain": true })
	table.custom_minimum_size = Vector2(0, 470)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	table.add_child(v)
	var head: HBoxContainer = HBoxContainer.new()
	v.add_child(head)
	var t: Label = Kit.text(head, "Blackjack with the crew", "title", Kit.WOOD_INK)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Kit.text(head, "Pays 3 to 2   ·   Dealer hits soft 17", "label", Color(1.0, 0.86, 0.5))
	var dh: HBoxContainer = HBoxContainer.new()
	dh.alignment = BoxContainer.ALIGNMENT_CENTER
	dh.add_theme_constant_override("separation", 10)
	v.add_child(dh)
	Kit.text(dh, "Dealer", "label", Color(Kit.WOOD_INK, 0.75))
	_dealer_total = Kit.text(dh, "", "value", Kit.WOOD_INK)
	_dealer = HBoxContainer.new()
	_dealer.alignment = BoxContainer.ALIGNMENT_CENTER
	_dealer.add_theme_constant_override("separation", -26)
	_dealer.custom_minimum_size = Vector2(0, 128)
	v.add_child(_dealer)
	_says = Kit.text(v, "", "title", Color(1.0, 0.88, 0.55))
	_says.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_says.custom_minimum_size = Vector2(0, 32)
	_seats_box = HBoxContainer.new()
	_seats_box.alignment = BoxContainer.ALIGNMENT_CENTER
	_seats_box.add_theme_constant_override("separation", 26)
	_seats_box.custom_minimum_size = Vector2(0, 200)
	v.add_child(_seats_box)
	_ctl = HBoxContainer.new()
	_ctl.alignment = BoxContainer.ALIGNMENT_CENTER
	_ctl.add_theme_constant_override("separation", 8)
	add_child(_ctl)
	DenTables.live.changed.connect(_on_table)
	tree_exiting.connect(func() -> void: session.act("denTable", ["blackjack", "leave"]))
	var st: Variant = DenTables.live.states.get("blackjack")
	if st is Dictionary:
		_on_table("blackjack", st)
	var r: Dictionary = await session.act("denTable", ["blackjack", "sit"])
	if r.has("error"):
		_says.text = str(r["error"])


func play_for_shot() -> void:
	_ready_up()


func _process(_delta: float) -> void:
	if _deadline > 0.0 and not _state.is_empty():
		var left: int = int(ceil(_deadline - Time.get_ticks_msec() / 1000.0))
		if left >= 0:
			var me: String = DenTables.live.my_key()
			match str(_state["phase"]):
				"betting":
					_says.text = "Dealing in %d" % left
				"playing":
					var who: String = str(Js.obj(_state["seats"].get(_state["turn"])).get("name", ""))
					_says.text = ("Your turn  ·  %d" % left) if _state["turn"] == me else "%s's turn  ·  %d" % [who, left]


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not (event as InputEventKey).pressed or (event as InputEventKey).echo or _state.is_empty():
		return
	var k: Key = (event as InputEventKey).keycode
	var mine: bool = _state["phase"] == "playing" and _state["turn"] == DenTables.live.my_key()
	if _state["phase"] == "betting" and k == KEY_SPACE:
		_ready_up()
	elif mine and k == KEY_H:
		_move("hit")
	elif mine and k == KEY_S:
		_move("stand")
	elif mine and k == KEY_D:
		_move("double")
	elif mine and k == KEY_P:
		_move("split")
	else:
		return
	get_viewport().set_input_as_handled()


func _ready_up() -> void:
	var r: Dictionary = await session.act("denTable", ["blackjack", "ready", _bet])
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)
		return
	var me: String = DenTables.live.my_key()
	if _seat_ui.has(me):
		den.fly_chips(Vector2.ZERO, _bet, false, (_seat_ui[me]["box"] as Control).get_global_rect().get_center())


func _move(m: String) -> void:
	var r: Dictionary = await session.act("denTable", ["blackjack", m])
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)
	else:
		den.paint_purse()


## A new table: queued, so the cards deal in turn even when updates come fast.
func _on_table(game: String, st: Dictionary) -> void:
	if game != "blackjack" or not is_inside_tree():
		return
	_queue.append(st)
	if not _draining:
		_drain()


func _drain() -> void:
	_draining = true
	while not _queue.is_empty():
		var st: Dictionary = _queue.pop_front()
		await _apply(st)
	_draining = false


func _apply(st: Dictionary) -> void:
	_state = st
	_deadline = Time.get_ticks_msec() / 1000.0 + float(st["left"]) if float(st["left"]) > 0.0 else -1.0
	var me: String = DenTables.live.my_key()
	# A new round: a clean table.
	if int(st["round"]) != _round and st["phase"] != "betting":
		_round = int(st["round"])
		for c: Node in _dealer.get_children():
			c.queue_free()
		_shown_dealer.clear()
		_shown.clear()
	if st["phase"] == "betting" and (st["dealer"] as Array).is_empty() and not _shown_dealer.is_empty():
		for c: Node in _dealer.get_children():
			c.queue_free()
		_shown_dealer.clear()
		_shown.clear()
	_layout_seats(st)
	# Cards: everyone's new ones, then the dealer's.
	var order: Array = st["order"]
	for k: String in order:
		var seat: Dictionary = st["seats"][k]
		var hands: Array = seat["hands"]
		var ui: Dictionary = _seat_ui[k]
		var shown: Array = _shown.get(k, [])
		if shown.size() != hands.size():
			for c: Node in (ui["cards"] as HBoxContainer).get_children():
				c.queue_free()
			shown = []
			for i: int in hands.size():
				shown.append([])
		for i: int in hands.size():
			var cards: Array = hands[i]["cards"]
			while (shown[i] as Array).size() < cards.size():
				var cd: String = cards[(shown[i] as Array).size()]
				var c: DenBlackjack.Card = DenBlackjack.Card.make(cd, true)
				(ui["cards"] as HBoxContainer).add_child(c)
				(shown[i] as Array).append(cd)
				Sound.plip()
				await get_tree().create_timer(0.16).timeout
		_shown[k] = shown
	var dealer: Array = st["dealer"]
	if _dealer.get_child_count() >= 2 and (_dealer.get_child(1) as DenBlackjack.Card).code == "X" and dealer.size() >= 2 and str(dealer[1]) != "X":
		await (_dealer.get_child(1) as DenBlackjack.Card).flip_to(str(dealer[1]))
		_shown_dealer[1] = str(dealer[1])
	while _shown_dealer.size() < dealer.size():
		var dc: String = dealer[_shown_dealer.size()]
		_dealer.add_child(DenBlackjack.Card.make(dc, true))
		_shown_dealer.append(dc)
		Sound.plip()
		await get_tree().create_timer(0.22).timeout
	if st["phase"] == "playing" and not dealer.is_empty():
		_dealer_total.text = "%d showing" % int(Casino.hand_value([dealer[0]])["total"])
	elif st.get("dealerTotal") != null:
		_dealer_total.text = "%d" % int(st["dealerTotal"])
	else:
		_dealer_total.text = ""
	# The words, and my pay.
	for k: String in order:
		var seat: Dictionary = st["seats"][k]
		var ui: Dictionary = _seat_ui[k]
		var words: Array = []
		for o: Dictionary in seat.get("outcomes", []):
			match str(o["outcome"]):
				"blackjack":
					words.append("Blackjack!")
				"win":
					words.append("Win")
				"push":
					words.append("Push")
				_:
					words.append("Bust" if float(o["total"]) > 21.0 else "Lose")
		(ui["word"] as Label).text = " / ".join(PackedStringArray(words))
		if st["phase"] == "result" and seat["playing"]:
			(ui["word"] as Label).text += "   %s%s" % ["+" if float(seat["net"]) >= 0.0 else "-", Js.thousands(absf(float(seat["net"])))]
	if st["phase"] == "result" and _paid_round != int(st["round"]):
		_paid_round = int(st["round"])
		var mine: Dictionary = Js.obj(st["seats"].get(me))
		if mine.get("playing", false) and _seat_ui.has(me):
			var staked: float = 0.0
			for h: Dictionary in mine["hands"]:
				staked += float(h["wager"])
			var back: float = staked + float(mine["net"])
			if back > 0.0:
				den.fly_chips((_seat_ui[me]["box"] as Control).get_global_rect().get_center(), back)
		if mine.get("playing", false):
			if float(mine["net"]) > 0.0:
				Sound.chest(false)
				Rumble.buzz([0, 40, 30, 60])
			_says.text = "You %s" % ("won %s" % Js.thousands(float(mine["net"])) if float(mine["net"]) > 0.0 else ("broke even" if float(mine["net"]) == 0.0 else "lost %s" % Js.thousands(-float(mine["net"]))))
		den.paint_purse()
	_paint_controls(st)


func _layout_seats(st: Dictionary) -> void:
	var me: String = DenTables.live.my_key()
	var order: Array = st["order"]
	for k: String in _seat_ui.keys():
		if not order.has(k):
			(_seat_ui[k]["box"] as Node).queue_free()
			_seat_ui.erase(k)
			_shown.erase(k)
	for k: String in order:
		var seat: Dictionary = st["seats"][k]
		if not _seat_ui.has(k):
			var box: VBoxContainer = VBoxContainer.new()
			box.alignment = BoxContainer.ALIGNMENT_CENTER
			box.add_theme_constant_override("separation", 4)
			box.custom_minimum_size = Vector2(200, 0)
			_seats_box.add_child(box)
			var name_l: Label = Kit.text(box, "", "label", Color(str(seat["color"])))
			name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			var cards: HBoxContainer = HBoxContainer.new()
			cards.alignment = BoxContainer.ALIGNMENT_CENTER
			cards.add_theme_constant_override("separation", -40)
			cards.custom_minimum_size = Vector2(0, 128)
			box.add_child(cards)
			var info: Label = Kit.text(box, "", "label", Kit.WOOD_INK)
			info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			var word: Label = Kit.text(box, "", "label", Color(1.0, 0.88, 0.55))
			word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			_seat_ui[k] = { "box": box, "name": name_l, "cards": cards, "info": info, "word": word }
		var ui: Dictionary = _seat_ui[k]
		(ui["name"] as Label).text = "%s%s" % [seat["name"], "  (you)" if k == me else ""]
		var lit: bool = st["phase"] == "playing" and st["turn"] == k
		(ui["box"] as Control).modulate = Color(1, 1, 1) if lit or st["phase"] != "playing" else Color(0.72, 0.72, 0.72)
		var bits: Array = []
		for h: Dictionary in seat["hands"]:
			bits.append("%d" % int(Casino.hand_value(h["cards"])["total"]))
		var status: String = ""
		if st["phase"] == "betting":
			status = "Ready  ·  bet %s" % Js.thousands(float(seat["wager"])) if seat["ready"] else "Choosing a bet"
		elif seat["playing"]:
			status = "%s  ·  bet %s" % [" / ".join(PackedStringArray(bits)), Js.thousands(float(seat["wager"]))]
		else:
			status = "Sitting this one out"
		(ui["info"] as Label).text = status
		if st["phase"] == "betting":
			(ui["word"] as Label).text = ""


func _paint_controls(st: Dictionary) -> void:
	for c: Node in _ctl.get_children():
		c.queue_free()
	var me: String = DenTables.live.my_key()
	var seat: Dictionary = Js.obj(st["seats"].get(me))
	if seat.is_empty():
		return
	if st["phase"] == "betting":
		if seat["ready"]:
			Kit.text(_ctl, "Ready. Waiting for the others.", "label", Kit.INK)
			return
		for b: float in BETS:
			var btn: Button = Paper.button("%d" % int(b), b == _bet)
			btn.pressed.connect(func() -> void:
				_bet = b
				_paint_controls(_state))
			_ctl.add_child(btn)
		var go: Button = Kit.button("Ready   ·   Space", "primary")
		go.custom_minimum_size = Vector2(200, 50)
		go.pressed.connect(_ready_up)
		_ctl.add_child(go)
		return
	if st["phase"] != "playing" or st["turn"] != me:
		return
	var h: Dictionary = seat["hands"][int(st["hand"])]
	var chips: float = Js.num(session.profile().get("casino_chips"))
	for m: Array in [["Hit  ·  H", "hit", true], ["Stand  ·  S", "stand", true],
			["Double  ·  D", "double", (h["cards"] as Array).size() == 2 and not h["isSplit"] and chips >= float(h["wager"])],
			["Split  ·  P", "split", (seat["hands"] as Array).size() == 1 and Casino.can_split(h["cards"]) and chips >= float(h["wager"])]]:
		if not m[2]:
			continue
		var b: Button = Kit.button(m[0], "primary" if m[1] == "hit" else "secondary")
		b.custom_minimum_size = Vector2(0, 50)
		b.pressed.connect(func() -> void: _move(m[1]))
		_ctl.add_child(b)
