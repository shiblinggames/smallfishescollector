class_name DenBlackjackTable
extends Control
## BLACKJACK WITH THE CREW (in a Charter; the table is game/den_tables.gd on
## the founder's game). The same felt as the solo game (THE DEN AS A PLACE,
## 2026-10-10): the dealer and the shoe across the top, up to four seats along
## the foot, each with its captain's name in their colour, their cards, their
## bet circle and their word at the end. Pick a chip and say Ready (it deals
## when everyone is, or 15 seconds after the first): your chips slide into
## your circle, the others' land in theirs. Every card flies from the shoe
## and turns up; on your turn your seat lights and the moves come up (H, S, D,
## P), with 30 seconds before a stand is taken for you. Everyone sees the hole
## card turn over and the dealer draw; winners' chips slide home, losers' are
## swept to the dealer.

var session: Session
var den: DenRoom
var _bet: float = 25.0
var _dealer: DenBlackjack.Hand
## seat key -> { "hands": [Hand], "color": Color }
var _seat_ui: Dictionary = {}
var _order: Array = []
var _says: Label
var _ctl: HBoxContainer
var _round: int = -1
var _state: Dictionary = {}
var _deadline: float = -1.0
var _queue: Array = []
var _draining: bool = false
var _paid_round: int = -1
var _print_y: float = 0.0
## A move or ready is on its way to the founder: a second press would hit twice
## (or land on the next split hand after a 21 auto-stands).
var _sending: bool = false


func _ready() -> void:
	_dealer = DenBlackjack.Hand.new(false, true)
	add_child(_dealer)
	_dealer.top_l.text = "Dealer"
	_says = DenRoom.says(self, "", "title", DenRoom.CREAM)
	_says.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Kit.lift(_says)
	_ctl = HBoxContainer.new()
	_ctl.alignment = BoxContainer.ALIGNMENT_CENTER
	_ctl.add_theme_constant_override("separation", 8)
	add_child(_ctl)
	resized.connect(_layout)
	_layout()
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


func _cs() -> float:
	return DenBlackjack.fit_scale(size.y, 0.19, 64.0, true)


## The dealer's row and the print across the top, the seats along the foot
## (each seat's hands side by side in its share), the moves under them.
func _layout() -> void:
	var w: float = size.x
	var h: float = size.y
	if w < 10.0 or h < 10.0:
		return
	var cs: float = _cs()
	var ctl_h: float = 62.0
	_ctl.position = Vector2(0, h - ctl_h)
	_ctl.size = Vector2(w, ctl_h)
	_dealer.cs = cs
	_dealer.position = Vector2(w * 0.25, 0)
	_dealer.size = Vector2(w * 0.5, _dealer.full_h())
	_dealer.relayout()
	var n: int = maxi(1, _order.size())
	var seat_w: float = w / n
	for si: int in _order.size():
		var k: String = _order[si]
		if not _seat_ui.has(k):
			continue
		var hands: Array = _seat_ui[k]["hands"]
		var m: int = maxi(1, hands.size())
		for i: int in hands.size():
			var hd: DenBlackjack.Hand = hands[i]
			hd.cs = cs
			var hw: float = seat_w / m
			hd.size = Vector2(hw, hd.full_h())
			var goal: Vector2 = Vector2(si * seat_w + i * hw, h - ctl_h - 2.0 - hd.full_h())
			if hd.position != Vector2.ZERO and hd.position != goal:
				hd.create_tween().tween_property(hd, "position", goal, 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			else:
				hd.position = goal
			hd.relayout()
	var seats_top: float = h - ctl_h - 2.0 - DenBlackjack.Hand.full_h_for(cs, true, true)
	var ys: Vector2 = DenBlackjack.print_ys(_dealer.full_h(), seats_top)
	_print_y = ys.x
	_says.position = Vector2(0, ys.y)
	_says.size = Vector2(w, 36)
	queue_redraw()


func _draw() -> void:
	DenBlackjack.draw_print(self, Vector2(size.x / 2.0, _print_y), "Blackjack pays 3 to 2", "Dealer hits soft 17")
	DenBlackjack.draw_shoe(self, DenBlackjack.shoe_rect(size, _dealer.cs))


func _shoe_point() -> Vector2:
	var r: Rect2 = DenBlackjack.shoe_rect(size, _dealer.cs)
	return get_global_transform() * Vector2(r.position.x + r.size.x * 0.3, r.get_center().y)


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
	if _sending:
		return
	_sending = true
	var r: Dictionary = await session.act("denTable", ["blackjack", "ready", _bet])
	_sending = false
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)


func _move(m: String) -> void:
	if _sending:
		return
	_sending = true
	var r: Dictionary = await session.act("denTable", ["blackjack", m])
	_sending = false
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


## Every card off the felt (to the discard at its left).
func _clear_cards() -> void:
	var discard: Vector2 = get_global_transform() * Vector2(-40.0, size.y * 0.2)
	_dealer.discard(discard)
	_dealer.total_shown = 0.0
	_dealer.top_l.text = "Dealer"
	for k: String in _seat_ui:
		for hd: DenBlackjack.Hand in _seat_ui[k]["hands"]:
			hd.discard(discard)
			hd.word.text = ""
			hd.total_shown = 0.0


func _new_hand() -> DenBlackjack.Hand:
	var hd: DenBlackjack.Hand = DenBlackjack.Hand.new(true, true)
	add_child(hd)
	return hd


func _apply(st: Dictionary) -> void:
	_state = st
	_deadline = Time.get_ticks_msec() / 1000.0 + float(st["left"]) if float(st["left"]) > 0.0 else -1.0
	var me: String = DenTables.live.my_key()
	# A new round: a clean table.
	if int(st["round"]) != _round and st["phase"] != "betting":
		_round = int(st["round"])
		_clear_cards()
	if st["phase"] == "betting" and (st["dealer"] as Array).is_empty() and not _dealer.codes.is_empty():
		_clear_cards()
	_layout_seats(st)
	var order: Array = st["order"]
	# Chips into the circles: mine slide from my pile, the others' land.
	for k: String in order:
		var seat: Dictionary = st["seats"][k]
		var hands_ui: Array = _seat_ui[k]["hands"]
		var wagers: Array = []
		if st["phase"] == "betting":
			wagers = [float(seat["wager"]) if seat["ready"] else 0.0]
		else:
			for h: Dictionary in seat["hands"]:
				wagers.append(float(h["wager"]))
		for i: int in mini(wagers.size(), hands_ui.size()):
			var hd: DenBlackjack.Hand = hands_ui[i]
			var wg: float = float(wagers[i])
			if wg > hd.staked:
				var diff: float = wg - hd.staked
				hd.staked = wg
				if k == me:
					# My pile gives up the chips as they leave (a ready bet is
					# only taken at the deal, so it is shown as already gone).
					var have: float = Js.num(session.profile().get("casino_chips"))
					den.paint_purse(have - diff if st["phase"] == "betting" else have)
					den.fly_chips(Vector2.ZERO, diff, false, hd.circle_global(), func() -> void:
						if is_instance_valid(hd):
							hd.add_chips(diff))
				else:
					hd.add_chips(diff)
	# Cards: everyone's new ones, then the dealer's.
	for k: String in order:
		var seat: Dictionary = st["seats"][k]
		var hands: Array = seat["hands"]
		var hands_ui: Array = _seat_ui[k]["hands"]
		for i: int in mini(hands.size(), hands_ui.size()):
			var cards: Array = hands[i]["cards"]
			var hd: DenBlackjack.Hand = hands_ui[i]
			while hd.codes.size() < cards.size():
				await hd.deal(str(cards[hd.codes.size()]), _shoe_point())
				if not is_inside_tree():
					return
	var dealer: Array = st["dealer"]
	if _dealer.codes.size() >= 2 and _dealer.codes[1] == "X" and dealer.size() >= 2 and str(dealer[1]) != "X":
		await _dealer.reveal(1, str(dealer[1]))
	while _dealer.codes.size() < dealer.size():
		await _dealer.deal(str(dealer[_dealer.codes.size()]), _shoe_point())
		if not is_inside_tree():
			return
	if st["phase"] == "playing" and not dealer.is_empty():
		_dealer.tick(float(Casino.hand_value([dealer[0]])["total"]), func(x: int) -> String: return "Dealer   ·   %d showing" % x)
	elif st.get("dealerTotal") != null:
		var bust: bool = float(st["dealerTotal"]) > 21.0
		_dealer.tick(float(st["dealerTotal"]), func(x: int) -> String: return "Dealer   ·   %d%s" % [x, "   bust" if bust else ""])
		if bust:
			_dealer.bust()
	# Each seat's totals, the turn lit, busts shaken.
	for k: String in order:
		var seat: Dictionary = st["seats"][k]
		var hands_ui: Array = _seat_ui[k]["hands"]
		var hands: Array = seat["hands"]
		for i: int in hands_ui.size():
			var hd: DenBlackjack.Hand = hands_ui[i]
			if st["phase"] == "betting":
				hd.info.text = ("Ready  ·  bet %s" % Js.thousands(float(seat["wager"]))) if seat["ready"] else "Choosing a bet"
				hd.lit(true)
				continue
			if not seat["playing"] or i >= hands.size():
				hd.info.text = "Sitting this one out"
				hd.lit(false)
				continue
			var total: float = float(Casino.hand_value(hands[i]["cards"])["total"])
			var wg: float = float(hands[i]["wager"])
			hd.tick(total, func(x: int) -> String: return "%d  ·  bet %s" % [x, Js.thousands(wg)])
			if total > 21.0:
				hd.bust()
			else:
				hd.lit(st["phase"] != "playing" or (st["turn"] == k and int(st["hand"]) == i))
	# The words, and the pay.
	if st["phase"] == "result" and _paid_round != int(st["round"]):
		_paid_round = int(st["round"])
		var house: Vector2 = _dealer.get_global_transform() * Vector2(_dealer.size.x / 2.0, _dealer.full_h() * 0.5)
		for k: String in order:
			var seat: Dictionary = st["seats"][k]
			if not seat["playing"]:
				continue
			var hands_ui: Array = _seat_ui[k]["hands"]
			var outs: Array = seat.get("outcomes", [])
			for i: int in mini(outs.size(), hands_ui.size()):
				var o: Dictionary = outs[i]
				var hd: DenBlackjack.Hand = hands_ui[i]
				var word: String = { "blackjack": "Blackjack!", "win": "Win", "push": "Push" }.get(str(o["outcome"]), "Bust" if float(o["total"]) > 21.0 else "Lose")
				var won: bool = str(o["outcome"]) in ["blackjack", "win"]
				hd.say(word, DenRoom.WIN if won else (DenRoom.CREAM if str(o["outcome"]) == "push" else DenRoom.CREAM_SOFT))
			var staked: float = 0.0
			for h: Dictionary in seat["hands"]:
				staked += float(h["wager"])
			var back: float = staked + float(seat["net"])
			var first: DenBlackjack.Hand = hands_ui[0]
			if k == me and back > 0.0:
				den.fly_chips(first.circle_global(), back)
			elif back > 0.0:
				# Theirs slide back toward their side of the table.
				den.sweep_chips(first.circle_global(), first.circle_global() + Vector2(0, 140), back)
			if back <= 0.0:
				for hd: DenBlackjack.Hand in hands_ui:
					den.sweep_chips(hd.circle_global(), house, hd.amount)
			for hd: DenBlackjack.Hand in hands_ui:
				hd.add_chips(-hd.amount)
				hd.staked = 0.0
			var tail: Label = first.top_l
			tail.text = "%s   %s%s" % [_name_of(k, seat, me), "+" if float(seat["net"]) >= 0.0 else "-", Js.thousands(absf(float(seat["net"])))]
		var mine: Dictionary = Js.obj(st["seats"].get(me))
		if mine.get("playing", false):
			if float(mine["net"]) > 0.0:
				Sound.chest(false)
				Rumble.buzz([0, 40, 30, 60])
			_says.text = "You %s" % ("won %s" % Js.thousands(float(mine["net"])) if float(mine["net"]) > 0.0 else ("broke even" if float(mine["net"]) == 0.0 else "lost %s" % Js.thousands(-float(mine["net"]))))
			Motion.rise_word(_says)
		den.paint_purse()
	_paint_controls(st)


func _name_of(k: String, seat: Dictionary, me: String) -> String:
	return "%s%s" % [seat["name"], "  (you)" if k == me else ""]


## Seats come and go with the table; each has at least one hand (its circle)
## and as many as it has split into.
func _layout_seats(st: Dictionary) -> void:
	var me: String = DenTables.live.my_key()
	var order: Array = st["order"]
	var changed: bool = order != _order
	for k: String in _seat_ui.keys():
		if not order.has(k):
			for hd: DenBlackjack.Hand in _seat_ui[k]["hands"]:
				hd.discard(get_global_transform() * Vector2(-40.0, size.y * 0.2))
				hd.queue_free()
			_seat_ui.erase(k)
	for k: String in order:
		var seat: Dictionary = st["seats"][k]
		if not _seat_ui.has(k):
			_seat_ui[k] = { "hands": [_new_hand()], "color": Color(str(seat["color"])) }
			changed = true
		var ui: Dictionary = _seat_ui[k]
		var want: int = maxi(1, (seat["hands"] as Array).size())
		if (ui["hands"] as Array).size() != want:
			var codes: Array = (seat["hands"] as Array).map(func(h: Dictionary) -> Array: return h["cards"])
			if codes.is_empty():
				codes = [[]]
			ui["hands"] = DenBlackjack.reshape(ui["hands"], codes, _new_hand)
			changed = true
		for i: int in (ui["hands"] as Array).size():
			var hd: DenBlackjack.Hand = ui["hands"][i]
			hd.top_l.text = _name_of(k, seat, me) if i == 0 else ""
			hd.top_l.add_theme_color_override("font_color", ui["color"])
			Kit.lift(hd.top_l)
			if st["phase"] == "betting":
				hd.word.text = ""
	_order = order.duplicate()
	if changed:
		_layout()
		for k: String in _seat_ui:
			for hd: DenBlackjack.Hand in _seat_ui[k]["hands"]:
				hd.arrange(true)


func _paint_controls(st: Dictionary) -> void:
	for c: Node in _ctl.get_children():
		c.queue_free()
	var me: String = DenTables.live.my_key()
	var seat: Dictionary = Js.obj(st["seats"].get(me))
	if seat.is_empty():
		return
	if st["phase"] == "betting":
		if seat["ready"]:
			DenRoom.says(_ctl, "Ready. Waiting for the others.", "body_strong", DenRoom.CREAM)
			return
		var chips: HBoxContainer = HBoxContainer.new()
		chips.add_theme_constant_override("separation", 2)
		_ctl.add_child(chips)
		DenRoom.stake_row(chips, _bet, func(b: float) -> void:
			_bet = b
			_paint_controls(_state))
		var go: Button = DenRoom.primary("Ready   ·   Space")
		go.custom_minimum_size = Vector2(210, 52)
		go.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		go.pressed.connect(_ready_up)
		_ctl.add_child(go)
		return
	if st["phase"] != "playing" or st["turn"] != me:
		return
	var h: Dictionary = seat["hands"][int(st["hand"])]
	var chips_now: float = Js.num(session.profile().get("casino_chips"))
	for m: Array in [["Hit  ·  H", "hit", true], ["Stand  ·  S", "stand", true],
			["Double  ·  D", "double", (h["cards"] as Array).size() == 2 and not h["isSplit"] and chips_now >= float(h["wager"])],
			["Split  ·  P", "split", (seat["hands"] as Array).size() == 1 and Casino.can_split(h["cards"]) and chips_now >= float(h["wager"])]]:
		if not m[2]:
			continue
		var b: Button = DenRoom.primary(m[0]) if m[1] == "hit" else Paper.button(m[0])
		b.custom_minimum_size = Vector2(120, 50)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void: _move(m[1]))
		_ctl.add_child(b)
