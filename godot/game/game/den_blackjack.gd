class_name DenBlackjack
extends Control
## BLACKJACK (Godot port of app/(app)/tavern/blackjack, made to move). On the
## Den's felt (THE DEN AS A PLACE, 2026-10-10): the dealer across the top with
## the shoe at the dealer's right, the table's words printed on the felt, and
## your hand at the foot with its bet circle. Pick a chip and deal: the bet
## slides out of your pile into the circle; each card flies out of the shoe to
## its place and turns face up; the dealer's hole card lies face down until the
## end, then turns over and the dealer draws one by one. Totals tick up. A
## bust shakes that hand and dims it. At the end a win slides the payout from
## the circle to your pile, a loss sweeps the chips to the dealer. Hit, Stand,
## Double and Split are buttons and H, S, D and P; an Ace up offers insurance
## first. Blackjack pays 3 to 2; the dealer hits a soft 17.
##
## Card, Hand and the felt's print and shoe are shared with the crew's table
## (game/den_blackjack_table.gd).

const DEAL_GAP: float = 0.08
## The play area's height a card is sized from (a card is this fraction of it).
const CARD_OF_H: float = 0.24

var session: Session
var den: DenRoom
var _bet: float = 25.0
var _dealer: Hand
var _hands: Array = []
var _says: Label
var _ctl: HBoxContainer
var _moves: HBoxContainer
var _bets_row: HBoxContainer
var _busy: bool = false
var _view: Dictionary = {}
var _print_y: float = 0.0


func _ready() -> void:
	_dealer = Hand.new(false, true)
	add_child(_dealer)
	_dealer.top_l.text = "Dealer"
	_says = DenRoom.says(self, "Place a bet and deal", "title", DenRoom.CREAM)
	_says.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Kit.lift(_says)
	# The moves, and the bet, along the foot of the felt.
	_ctl = HBoxContainer.new()
	_ctl.alignment = BoxContainer.ALIGNMENT_CENTER
	_ctl.add_theme_constant_override("separation", 12)
	add_child(_ctl)
	_bets_row = HBoxContainer.new()
	_bets_row.add_theme_constant_override("separation", 2)
	_ctl.add_child(_bets_row)
	_moves = HBoxContainer.new()
	_moves.add_theme_constant_override("separation", 8)
	_ctl.add_child(_moves)
	resized.connect(_layout)
	_layout()
	_paint_controls()
	# A hand left open last time comes back where it was.
	var resume: Variant = Casino.resume(session.store, session.uid)
	if resume is Dictionary:
		_says.text = ""
		_render({ "kind": "active", "state": resume }, false)


## Everything placed from the felt's size: the card scale, the dealer's row,
## the print, the hands and their circles, the moves along the foot.
func _layout() -> void:
	var w: float = size.x
	var h: float = size.y
	if w < 10.0 or h < 10.0:
		return
	var ctl_h: float = 62.0
	var cs: float = fit_scale(h, CARD_OF_H, ctl_h + 4.0, false)
	_ctl.position = Vector2(0, h - ctl_h)
	_ctl.size = Vector2(w, ctl_h)
	_dealer.cs = cs
	_dealer.position = Vector2(w * 0.2, 0)
	_dealer.size = Vector2(w * 0.6, _dealer.full_h())
	_dealer.relayout()
	var n: int = maxi(1, _hands.size())
	for i: int in _hands.size():
		var hd: Hand = _hands[i]
		hd.cs = cs
		var hw: float = minf(w / n, 560.0)
		hd.size = Vector2(hw, hd.full_h())
		var goal: Vector2 = Vector2(w * (i + 0.5) / n - hw / 2.0, h - ctl_h - 4.0 - hd.full_h())
		if hd.position != goal and hd.is_inside_tree() and hd.position != Vector2.ZERO:
			hd.create_tween().tween_property(hd, "position", goal, 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		else:
			hd.position = goal
		hd.relayout()
	var hands_top: float = h - ctl_h - 4.0 - Hand.full_h_for(cs, true, false)
	var ys: Vector2 = print_ys(_dealer.full_h(), hands_top)
	_print_y = ys.x
	_says.position = Vector2(0, ys.y)
	_says.size = Vector2(w, 36)
	queue_redraw()


## A card's scale for a play area this tall.
static func card_scale(h: float, frac: float) -> float:
	return clampf(h * frac / Card.SIZE.y, 0.7, 1.6)


## The room the print and the words need between the dealer's cards and the
## hands (the print's arc and its soft-17 line, a gap, one line of words).
const PRINT_GAP: float = 104.0


## The card scale, shrunk until the print and the words fit between the
## dealer's cards and the hands (a short window used to lay the print right
## under the dealer's cards, half covered by them). `foot`: what sits under
## the hands (the moves); `named`: the hands carry a name over their cards.
static func fit_scale(h: float, frac: float, foot: float, named: bool) -> float:
	var cs: float = card_scale(h, frac)
	while cs > 0.7 and h - foot - Hand.full_h_for(cs, true, named) - Hand.full_h_for(cs, false, true) < PRINT_GAP:
		cs -= 0.03
	return maxf(cs, 0.7)


## Where the print (x) and the words (y) go between the dealer's cards'
## foot and the hands' top: the pair centred in the gap, the print never
## closer than 18px under the cards (and their shadow).
static func print_ys(dealer_foot: float, hands_top: float) -> Vector2:
	var block: float = 54.0 + 8.0 + 34.0
	var start: float = maxf(dealer_foot + 6.0, dealer_foot + 6.0 + (hands_top - dealer_foot - 6.0 - block) / 2.0)
	return Vector2(start + 18.0, start + 62.0)


func _draw() -> void:
	draw_print(self, Vector2(size.x / 2.0, _print_y), "Blackjack pays 3 to 2", "Dealer hits soft 17")
	draw_shoe(self, shoe_rect(size, _dealer.cs))


## The shoe, at the dealer's right: where it sits for a play area this size.
static func shoe_rect(sz: Vector2, cs: float) -> Rect2:
	var cw: float = Card.SIZE.x * cs
	return Rect2(sz.x - cw * 1.7 - 12.0, 6.0, cw * 1.7, Card.SIZE.y * cs * 0.82)


## THE SHOE, flat: a dark box with a cream hairline, the backs of the cards
## standing in it, the mouth facing the table.
static func draw_shoe(ci: CanvasItem, r: Rect2) -> void:
	var box: StyleBoxFlat = StyleBoxFlat.new()
	box.bg_color = Color(0.07, 0.09, 0.09)
	box.set_corner_radius_all(8)
	box.border_color = Color(DenRoom.CREAM, 0.35)
	box.set_border_width_all(1)
	ci.draw_style_box(box, r)
	var inner: Rect2 = Rect2(r.position + Vector2(r.size.x * 0.1, r.size.y * 0.16), Vector2(r.size.x * 0.62, r.size.y * 0.68))
	for k: int in 4:
		var cr: Rect2 = Rect2(inner.position + Vector2(k * 3.0, -k * 2.0), inner.size)
		Card.draw_back(ci, cr)
	var f: Font = Kit.font("karla", 700)
	Kit.sea_string(ci, f, Vector2(r.position.x, r.end.y + 16.0), "SHOE", 10, Color(DenRoom.CREAM, 0.6), HORIZONTAL_ALIGNMENT_CENTER, r.size.x)


## Where the cards come from: the shoe's mouth, in global coordinates.
func shoe_point() -> Vector2:
	var r: Rect2 = shoe_rect(size, _dealer.cs)
	return get_global_transform() * Vector2(r.position.x + r.size.x * 0.3, r.get_center().y)


## THE PRINT on the felt: the table's rule in cream along a gentle arc, the
## soft-17 line under it.
static func draw_print(ci: CanvasItem, c: Vector2, big: String, small: String) -> void:
	var f: Font = Kit.font("cinzel", 700)
	var fs: int = 20
	var t: String = big.to_upper()
	var total: float = f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var rad: float = maxf(total * 1.6, 600.0)
	var centre: Vector2 = c + Vector2(0, rad)
	var a: float = -total / 2.0 / rad
	for ch: String in t:
		var cw: float = f.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var mid: float = a + cw / 2.0 / rad
		var p: Vector2 = centre + Vector2(sin(mid), -cos(mid)) * rad
		ci.draw_set_transform(p, mid, Vector2.ONE)
		ci.draw_string(f, Vector2(-cw / 2.0, fs * 0.35), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(DenRoom.CREAM, 0.42))
		a += cw / rad
	ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	var sf: Font = Kit.font("karla", 700)
	ci.draw_string(sf, Vector2(c.x - 200.0, c.y + 32.0), small.to_upper(), HORIZONTAL_ALIGNMENT_CENTER, 400.0, 12, Color(DenRoom.CREAM, 0.36))


func _paint_controls() -> void:
	for c: Node in _bets_row.get_children():
		c.queue_free()
	for c: Node in _moves.get_children():
		c.queue_free()
	var active: bool = _view.get("kind") == "active"
	_bets_row.visible = not active
	if not active:
		DenRoom.stake_row(_bets_row, _bet, func(b: float) -> void:
			_bet = b
			_paint_controls())
		_move_button("Deal   ·   Space", "primary", deal)
		return
	var s: Dictionary = _view["state"]
	if s.get("insuranceOffered", false):
		_says.text = "Dealer shows an Ace. Insurance?"
		_move_button("Insure for %s" % Js.thousands(floor(float((s["hands"][0] as Dictionary)["wager"]) / 2.0)), "secondary", func() -> void: _act("acceptInsurance"))
		_move_button("No insurance", "secondary", func() -> void: _act("declineInsurance"))
		return
	if s.get("canHit", false):
		_move_button("Hit  ·  H", "primary", func() -> void: _act("hit"))
		_move_button("Stand  ·  S", "secondary", func() -> void: _act("stand"))
	if s.get("canDouble", false):
		_move_button("Double  ·  D", "secondary", func() -> void: _act("doubleDown"))
	if s.get("canSplit", false):
		_move_button("Split  ·  P", "secondary", func() -> void: _act("split"))


func _move_button(t: String, kind: String, run: Callable) -> void:
	var b: Button = DenRoom.primary(t) if kind == "primary" else Paper.button(t)
	b.custom_minimum_size = Vector2(maxf(b.custom_minimum_size.x, 120.0), 50)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	b.disabled = _busy
	b.pressed.connect(func() -> void:
		if not _busy:
			run.call())
	_moves.add_child(b)


func play_for_shot() -> void:
	deal()


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not (event as InputEventKey).pressed or (event as InputEventKey).echo or _busy:
		return
	var k: Key = (event as InputEventKey).keycode
	var active: bool = _view.get("kind") == "active"
	var s: Dictionary = _view.get("state", {})
	if not active and k == KEY_SPACE:
		deal()
	elif active and k == KEY_H and s.get("canHit", false):
		_act("hit")
	elif active and k == KEY_S and s.get("canStand", false):
		_act("stand")
	elif active and k == KEY_D and s.get("canDouble", false):
		_act("doubleDown")
	elif active and k == KEY_P and s.get("canSplit", false):
		_act("split")
	else:
		return
	get_viewport().set_input_as_handled()


func deal() -> void:
	if _busy:
		return
	var chips: float = Js.num(session.profile().get("casino_chips"))
	if chips < _bet:
		den.toast("Not enough chips. Buy in above.", DenRoom.RED)
		return
	_busy = true
	_paint_controls()
	_clear_table()
	var hd: Hand = _new_hand()
	_hands = [hd]
	_layout()
	_says.text = ""
	# The bet slides out of the pile into the circle.
	hd.staked = _bet
	var amt: float = _bet
	den.paint_purse(chips - _bet)
	den.fly_chips(Vector2.ZERO, amt, false, hd.circle_global(), func() -> void:
		if is_instance_valid(hd):
			hd.add_chips(amt))
	var r: Dictionary = await session.act("dealBlackjack", [_bet])
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)
		den.paint_purse()
		_busy = false
		_paint_controls()
		return
	session.persist()
	await get_tree().create_timer(0.3).timeout
	await _render(r, true)


func _act(op: String) -> void:
	if _busy:
		return
	_busy = true
	_paint_controls()
	var r: Dictionary = await session.act(op)
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)
		_busy = false
		_paint_controls()
		return
	session.persist()
	if op in ["doubleDown", "split", "acceptInsurance"]:
		## A double that ends the hand has already been paid in the store, so the
		## strip shows the chips before the payout and the settle counts it up.
		den.paint_purse(_staked_chips(r["result"]) if r.get("kind") == "settled" else Js.num(session.profile().get("casino_chips")))
	await _render(r, true)


## The purse once every stake is down and before anything comes back: the
## settled chips less what the hands and the insurance returned. The count-up
## at the end of a hand runs from here (the store already holds the payout).
static func _staked_chips(res: Dictionary) -> float:
	var back: float = float(Js.obj(res.get("insurance")).get("paid", 0.0))
	for h: Dictionary in res["hands"]:
		back += float(h["payout"])
	return float(res["newChips"]) - back


func _new_hand() -> Hand:
	var hd: Hand = Hand.new(true, false)
	add_child(hd)
	return hd


## The last hand's cards slide off to the discard (the felt's left) and the
## circles empty; the dealer's row is cleared for the next deal.
func _clear_table() -> void:
	var discard: Vector2 = get_global_transform() * Vector2(-40.0, size.y * 0.2)
	_dealer.discard(discard)
	for hd: Hand in _hands:
		hd.discard(discard)
		hd.queue_free()
	_hands.clear()
	_dealer.top_l.text = "Dealer"
	_dealer.total_shown = 0.0


## A split reshapes the hands: each keeps the card it came from, the new one
## takes the other across, and they slide apart.
func _reshape(n: int, codes: Array) -> void:
	_hands = reshape(_hands, codes, _new_hand)
	while _hands.size() < n:
		_hands.append(_new_hand())
	_layout()
	for hd: Hand in _hands:
		hd.arrange(true)


## Bring the table up to a view: new cards dealt in one by one; at the end of
## a hand the hole card turns and the dealer draws, then the word on each hand.
func _render(r: Dictionary, animate: bool) -> void:
	_view = r
	var settled: bool = r.get("kind") == "settled"
	var dealer: Array = (r["result"]["dealerCards"] if settled else r["state"]["dealerCards"])
	var hands: Array = (r["result"]["hands"] if settled else r["state"]["hands"])
	if hands.size() != _hands.size():
		var codes: Array = hands.map(func(h: Dictionary) -> Array: return h["cards"])
		_reshape(hands.size(), codes)
	# A wager that grew (a double, a split's new hand) slides its chips in.
	for i: int in hands.size():
		var hd: Hand = _hands[i]
		var wg: float = float(hands[i]["wager"])
		if wg > hd.staked:
			var diff: float = wg - hd.staked
			hd.staked = wg
			if animate:
				den.fly_chips(Vector2.ZERO, diff, false, hd.circle_global(), func() -> void:
					if is_instance_valid(hd):
						hd.add_chips(diff))
			else:
				hd.add_chips(diff)
	# Deal in what is new: player's first, then the dealer's, in turn order.
	if _dealer.codes.is_empty():
		for k: int in 2:
			for i: int in hands.size():
				var cards: Array = hands[i]["cards"]
				if k < cards.size() and (_hands[i] as Hand).codes.size() <= k:
					await _deal(_hands[i], str(cards[k]), animate)
			if k < dealer.size():
				await _deal(_dealer, str(dealer[k]) if not settled or k == 0 else "X", animate)
	for i: int in hands.size():
		var cards: Array = hands[i]["cards"]
		var hd: Hand = _hands[i]
		while hd.codes.size() < cards.size():
			await _deal(hd, str(cards[hd.codes.size()]), animate)
	for i: int in hands.size():
		var h: Dictionary = hands[i]
		var hd: Hand = _hands[i]
		var total: float = float(h.get("total", Casino.hand_value(h["cards"])["total"]))
		var soft: bool = h.get("soft", false)
		var tail: String = "%s   ·   bet %s%s" % ["", Js.thousands(float(h["wager"])), "  (doubled)" if h.get("doubled", false) else ""]
		hd.tick(total, func(x: int) -> String: return "%s%d%s" % ["soft " if soft and total < 21 else "", x, tail])
		var row_lit: bool = not settled and i == int(_view["state"]["activeHandIdx"]) and hands.size() > 1
		hd.lit(row_lit or hands.size() == 1 or settled)
		if total > 21.0:
			hd.bust()
	if not settled:
		_dealer.tick(float(Casino.hand_value([dealer[0]])["total"]), func(x: int) -> String: return "Dealer   ·   %d showing" % x)
		_busy = false
		_paint_controls()
		return
	# The end of the hand: the hole card turns, the dealer draws, the words.
	var res: Dictionary = r["result"]
	if _dealer.codes.size() >= 2 and _dealer.codes[1] == "X":
		await _dealer.reveal(1, str(dealer[1]))
	while _dealer.codes.size() < dealer.size():
		await _deal(_dealer, str(dealer[_dealer.codes.size()]), animate)
	var tag: String = "   bust" if res["dealerBust"] else ("   blackjack" if res["dealerNatural"] else "")
	_dealer.tick(float(res["dealerTotal"]), func(x: int) -> String: return "Dealer   ·   %d%s" % [x, tag])
	if res["dealerBust"]:
		_dealer.bust()
	var house: Vector2 = _dealer.get_global_transform() * Vector2(_dealer.size.x / 2.0, _dealer.full_h() * 0.5)
	for i: int in hands.size():
		var h: Dictionary = hands[i]
		var hd: Hand = _hands[i]
		match str(h["outcome"]):
			"blackjack":
				hd.say("Blackjack!  +%s" % Js.thousands(float(h["net"])), DenRoom.WIN)
			"win":
				hd.say("Win  +%s" % Js.thousands(float(h["net"])), DenRoom.WIN)
			"push":
				hd.say("Push", DenRoom.CREAM)
			_:
				hd.say("Bust" if float(h["total"]) > 21.0 else "Lose", DenRoom.CREAM_SOFT)
	await get_tree().create_timer(0.35).timeout
	# The chips: winners slide home, losers are swept to the dealer.
	for i: int in hands.size():
		var h: Dictionary = hands[i]
		var hd: Hand = _hands[i]
		if float(h["payout"]) > 0.0:
			den.fly_chips(hd.circle_global(), float(h["payout"]))
			if str(h["outcome"]) == "blackjack":
				den.burst(hd.circle_global(), 12)
		else:
			den.sweep_chips(hd.circle_global(), house, hd.amount)
		hd.add_chips(-hd.amount)
		hd.staked = 0.0
	var net: float = float(res["netDelta"])
	if net > 0.0:
		Sound.chest(hands.any(func(h: Dictionary) -> bool: return h["outcome"] == "blackjack"))
		Rumble.buzz([0, 40, 30, 60])
		_says.text = "+%s" % Js.thousands(net)
	elif net == 0.0:
		_says.text = "Even"
	else:
		_says.text = ""
	var ins: Dictionary = res.get("insurance", {})
	if ins.get("taken", false):
		_says.text += ("   Insurance paid %s" % Js.thousands(float(ins["paid"]))) if ins.get("win", false) else "   Insurance lost"
	if _says.text != "":
		Motion.rise_word(_says)
	den.roll_chips(_staked_chips(res), float(res["newChips"]))
	_busy = false
	_paint_controls()


func _deal(hd: Hand, code: String, animate: bool) -> void:
	if animate:
		await hd.deal(code, shoe_point())
		await get_tree().create_timer(DEAL_GAP).timeout
	else:
		hd.place(code)


## A split: the old hands' cards handed to the new hands by code (each keeps
## the card it came from, so nothing is dealt twice), the rest freed. `make`
## makes a new hand.
static func reshape(old: Array, codes: Array, make: Callable) -> Array:
	var pool: Array = []
	for hd: Hand in old:
		pool.append_array(hd.cards)
		hd.cards.clear()
		hd.codes.clear()
	var out: Array = []
	for i: int in codes.size():
		out.append(old[i] if i < old.size() else make.call())
	for i: int in codes.size():
		var hd: Hand = out[i]
		for code: Variant in codes[i]:
			var at: int = pool.find_custom(func(c: Card) -> bool: return c.code == str(code))
			if at < 0:
				break
			var c: Card = pool[at]
			pool.remove_at(at)
			c.reparent(hd)
			hd.cards.append(c)
			hd.codes.append(str(code))
	for c: Card in pool:
		c.queue_free()
	for i: int in range(codes.size(), old.size()):
		(old[i] as Node).queue_free()
	return out


## ONE HAND on the felt: its cards (a fan, centred), its bet circle with the
## chips in it, the total under it and its word at the end. The dealer's hand
## is one without a circle, with "Dealer" and the total over the cards. A hand
## lays out its own cards; the game places the hand.
class Hand:
	extends Control
	var cs: float = 1.0
	var has_circle: bool = true
	var cards: Array = []
	var codes: Array = []
	## The chips lying in the circle (they show once they land).
	var amount: float = 0.0
	## The wager the table knows of (what has been sent to the circle).
	var staked: float = 0.0
	var total_shown: float = 0.0
	var top_l: Label
	var info: Label
	var word: Label
	var _top: bool = false
	var _give: float = 0.0
	var _busted: bool = false

	func _init(circle: bool, top_label: bool) -> void:
		has_circle = circle
		_top = top_label
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _ready() -> void:
		top_l = DenRoom.says(self, "", "label", DenRoom.CREAM)
		top_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		top_l.visible = _top
		info = DenRoom.says(self, "", "value", DenRoom.CREAM)
		info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		info.visible = has_circle
		word = DenRoom.says(self, "", "title", DenRoom.CREAM)
		word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		word.visible = has_circle
		Kit.lift(word)
		relayout()

	static func full_h_for(scale: float, circle: bool, top: bool) -> float:
		var h: float = Card.SIZE.y * scale + (26.0 if top else 0.0)
		if circle:
			h += 10.0 + Hand.circle_r_for(scale) * 2.0 + 4.0 + 22.0 + 30.0
		return h

	static func circle_r_for(scale: float) -> float:
		return clampf(Card.SIZE.x * scale * 0.34, 22.0, 46.0)

	func full_h() -> float:
		return Hand.full_h_for(cs, has_circle, _top)

	func cards_top() -> float:
		return 26.0 if _top else 0.0

	func circle_c() -> Vector2:
		var r: float = Hand.circle_r_for(cs)
		return Vector2(size.x / 2.0, cards_top() + Card.SIZE.y * cs + 10.0 + r)

	func circle_global() -> Vector2:
		return get_global_transform() * (circle_c() + Vector2(0, Hand.circle_r_for(cs) * 0.25))

	## The middle of card i of n.
	func slot(i: int, n: int) -> Vector2:
		var step: float = Card.SIZE.x * cs * (0.62 if n <= 4 else 0.45)
		return Vector2(size.x / 2.0 + (i - (n - 1) / 2.0) * step, cards_top() + Card.SIZE.y * cs / 2.0)

	func relayout() -> void:
		if top_l == null:
			return
		top_l.position = Vector2(0, 2)
		top_l.size = Vector2(size.x, 22)
		var y: float = circle_c().y + Hand.circle_r_for(cs) + 4.0
		info.position = Vector2(0, y)
		info.size = Vector2(size.x, 22)
		word.position = Vector2(0, y + 22.0)
		word.size = Vector2(size.x, 30)
		arrange(false)
		queue_redraw()

	## Every card to its place in the fan (sliding, or at once).
	func arrange(animate: bool) -> void:
		for i: int in cards.size():
			var c: Card = cards[i]
			c.scale = Vector2(cs, cs)
			c.z_index = i
			var goal: Vector2 = slot(i, cards.size()) - Card.SIZE / 2.0
			if animate:
				c.create_tween().tween_property(c, "position", goal, 0.25).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			else:
				c.position = goal

	## A card dealt: out of the shoe face down, across the felt to its place
	## (the others make room), then turned face up. A hole card ("X") stays
	## down.
	func deal(code: String, from_global: Vector2) -> void:
		var c: Card = Card.make(code)
		c.up = false
		add_child(c)
		cards.append(c)
		codes.append(code)
		var n: int = cards.size()
		for i: int in n - 1:
			var o: Card = cards[i]
			o.create_tween().tween_property(o, "position", slot(i, n) - Card.SIZE / 2.0, 0.25).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		c.scale = Vector2(cs, cs)
		c.z_index = n - 1
		c.position = get_global_transform().affine_inverse() * from_global - Card.SIZE / 2.0
		c.rotation = deg_to_rad(-70.0)
		var goal: Vector2 = slot(n - 1, n) - Card.SIZE / 2.0
		Sound.plip()
		var tw: Tween = c.create_tween().set_parallel()
		tw.tween_property(c, "position", goal, 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_property(c, "rotation", deg_to_rad(randf_range(-2.5, 2.5)), 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		await tw.finished
		if code != "X" and is_instance_valid(c):
			await c.turn_up()

	## A card laid down at once (a hand coming back after a restart).
	func place(code: String) -> void:
		var c: Card = Card.make(code)
		add_child(c)
		cards.append(c)
		codes.append(code)
		arrange(false)

	## Card i turned over to its face (the dealer's hole card).
	func reveal(i: int, code: String) -> void:
		codes[i] = code
		await (cards[i] as Card).flip_to(code)

	## The cards slide off to the discard and go.
	func discard(to_global: Vector2) -> void:
		var game: Node = get_parent()
		for c: Card in cards:
			if not is_instance_valid(c):
				continue
			c.reparent(game)
			var goal: Vector2 = (game as Control).get_global_transform().affine_inverse() * to_global - Card.SIZE / 2.0
			var tw: Tween = c.create_tween().set_parallel()
			tw.tween_property(c, "position", goal, 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
			tw.tween_property(c, "modulate:a", 0.0, 0.35).set_trans(Tween.TRANS_SINE)
			tw.chain().tween_callback(c.queue_free)
		cards.clear()
		codes.clear()
		_busted = false
		modulate = Color.WHITE

	## Chips into (or out of) the circle; the pile there gives as they land.
	func add_chips(v: float) -> void:
		amount = maxf(0.0, amount + v)
		var tw: Tween = create_tween()
		tw.tween_method(func(k: float) -> void:
			_give = k
			queue_redraw(), 1.0, 0.0, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	## The total ticks to a new value; fmt makes the words from the number.
	func tick(to: float, fmt: Callable) -> void:
		var l: Label = info if has_circle else top_l
		var from: float = total_shown
		total_shown = to
		if from == to:
			l.text = fmt.call(int(to))
			return
		Motion.count(l, from, to, func(x: float) -> void:
			if is_instance_valid(l):
				l.text = fmt.call(int(round(x))), false, 0.35)

	## The hand in play is full; one waiting is dimmed a little.
	func lit(on: bool) -> void:
		if _busted:
			return
		create_tween().tween_property(self, "modulate", Color.WHITE if on else Color(0.78, 0.78, 0.78), 0.2)

	## A bust: a small shake of this hand's cards, then it dims.
	func bust() -> void:
		if _busted:
			return
		_busted = true
		Sound.slack()
		for i: int in cards.size():
			var c: Card = cards[i]
			var home: Vector2 = slot(i, cards.size()) - Card.SIZE / 2.0
			var tw: Tween = c.create_tween()
			for dx: float in [9.0, -8.0, 6.0, -4.0, 2.0, 0.0]:
				tw.tween_property(c, "position", home + Vector2(dx, 0), 0.045)
		var dim: Tween = create_tween()
		dim.tween_interval(0.28)
		dim.tween_property(self, "modulate", Color(0.62, 0.62, 0.62, 0.9), 0.25)

	## The hand's word at the end, rising in.
	func say(t: String, col: Color) -> void:
		word.text = t
		word.add_theme_color_override("font_color", col)
		Motion.rise_word(word)

	func _draw() -> void:
		if not has_circle:
			return
		var c: Vector2 = circle_c()
		var r: float = Hand.circle_r_for(cs)
		draw_arc(c, r, 0.0, TAU, 56, DenRoom.FELT_LINE, 2.0, true)
		draw_arc(c, r - 5.0, 0.0, TAU, 56, Color(DenRoom.CREAM, 0.16), 1.0, true)
		if amount > 0.0:
			var w: float = r * 1.15
			var base: Vector2 = c + Vector2(0, r * 0.55)
			draw_set_transform(base, 0.0, Vector2(1.0 + _give * 0.06, 1.0 - _give * 0.08))
			DenRoom.draw_pile(self, Vector2.ZERO, amount, w, 12, 6)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## A PAPER CARD. Its face (rank in the corners, the suit large) or its back
## (flat, a cream line inset). It turns over by narrowing to an edge and
## opening on the other side.
class Card:
	extends Control
	const SIZE: Vector2 = Vector2(88, 124)
	var code: String = "X"
	## Face up (a hole card, "X", is always its back).
	var up: bool = true
	var _inner: Control

	static func make(c: String) -> Card:
		var card: Card = Card.new()
		card.code = c
		card.size = SIZE
		card.pivot_offset = SIZE / 2.0
		return card

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size = SIZE
		pivot_offset = SIZE / 2.0
		_inner = Control.new()
		_inner.size = SIZE
		_inner.pivot_offset = SIZE / 2.0
		_inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_inner.draw.connect(_paint)
		add_child(_inner)

	## Turned face up: narrows to its edge, then opens on its face.
	func turn_up() -> void:
		var tw: Tween = create_tween()
		tw.tween_property(_inner, "scale:x", 0.0, 0.08).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		await tw.finished
		up = true
		_inner.queue_redraw()
		var tw2: Tween = create_tween()
		tw2.tween_property(_inner, "scale:x", 1.0, 0.1).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		await tw2.finished

	func flip_to(c: String) -> void:
		var tw: Tween = create_tween()
		tw.tween_property(_inner, "scale:x", 0.0, 0.12).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		await tw.finished
		code = c
		up = true
		_inner.queue_redraw()
		Sound.plip()
		var tw2: Tween = create_tween()
		tw2.tween_property(_inner, "scale:x", 1.0, 0.14).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		await tw2.finished

	static var _face_box: StyleBoxFlat
	static var _back_box: StyleBoxFlat

	## A card's back, flat: deep red, a cream line inset, a small diamond.
	static func draw_back(ci: CanvasItem, r: Rect2) -> void:
		if _back_box == null:
			_back_box = StyleBoxFlat.new()
			_back_box.bg_color = Color(0.56, 0.17, 0.14)
			_back_box.set_corner_radius_all(6)
			_back_box.border_color = Color(0.3, 0.08, 0.06)
			_back_box.set_border_width_all(1)
		ci.draw_style_box(_back_box, r)
		var inset: Rect2 = r.grow(-minf(r.size.x, r.size.y) * 0.08)
		ci.draw_rect(inset, Color(DenRoom.CREAM, 0.55), false, 1.5)
		var c: Vector2 = r.get_center()
		var d: float = minf(r.size.x, r.size.y) * 0.16
		ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-d, 0), c + Vector2(0, -d * 1.4), c + Vector2(d, 0), c + Vector2(0, d * 1.4)]), Color(DenRoom.CREAM, 0.5))

	func _paint() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, SIZE)
		_inner.draw_rect(Rect2(r.position + Vector2(2, 4), r.size), Color(0, 0, 0, 0.22))
		if code == "X" or not up:
			Card.draw_back(_inner, r)
			return
		if _face_box == null:
			_face_box = StyleBoxFlat.new()
			_face_box.bg_color = Kit.PAPER.lightened(0.12)
			_face_box.set_corner_radius_all(6)
			_face_box.border_color = Color(Kit.PAPER_INK, 0.45)
			_face_box.set_border_width_all(1)
		_inner.draw_style_box(_face_box, r)
		var rank: String = code.left(1)
		var suit: String = code.substr(1, 1)
		var glyph: String = { "H": "♥", "D": "♦", "C": "♣", "S": "♠" }.get(suit, "?")
		var ink: Color = Color(0.68, 0.18, 0.13) if suit in ["H", "D"] else Kit.PAPER_INK
		var shown: String = "10" if rank == "T" else rank
		var f: Font = Kit.font("cinzel", 800)
		var fb: Font = ThemeDB.fallback_font
		_inner.draw_string(f, Vector2(8, 24), shown, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, ink)
		_inner.draw_string(fb, Vector2(9, 44), glyph, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, ink)
		var gw: float = fb.get_string_size(glyph, HORIZONTAL_ALIGNMENT_LEFT, -1, 46).x
		_inner.draw_string(fb, Vector2((SIZE.x - gw) / 2.0, SIZE.y / 2.0 + 18.0), glyph, HORIZONTAL_ALIGNMENT_LEFT, -1, 46, ink)
		_inner.draw_set_transform(SIZE, PI, Vector2.ONE)
		_inner.draw_string(f, Vector2(8, 24), shown, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, ink)
		_inner.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
