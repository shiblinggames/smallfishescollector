class_name DenBlackjack
extends VBoxContainer
## BLACKJACK (Godot port of app/(app)/tavern/blackjack, made to move): a
## stained-wood table, paper cards. They slide in from the shoe one at a time;
## the dealer's hole card lies face down until the end, then turns over and
## the dealer draws one by one; each hand of yours ends with its own word.
## Hit, Stand, Double and Split are buttons and H, S, D and P; an Ace up offers
## insurance first. Blackjack pays 3 to 2; the dealer hits a soft 17.

const BETS: Array = [10.0, 25.0, 50.0, 100.0, 250.0, 500.0]
const DEAL_GAP: float = 0.22

var session: Session
var den: DenRoom
var _bet: float = 25.0
var _dealer: HBoxContainer
var _dealer_total: Label
var _hands_box: HBoxContainer
var _hand_rows: Array = []
var _says: Label
var _ctl: HBoxContainer
var _moves: HBoxContainer
var _bets_row: HBoxContainer
var _shown_dealer: Array = []
var _shown_hands: Array = []
var _busy: bool = false
var _view: Dictionary = {}


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	var table: Pane = Kit.pane(self, { "radius": 16, "fill": [Kit.WOOD_HI, Kit.WOOD_LO], "border": [2, Color(0.25, 0.15, 0.08, 0.9)], "shadow": [Color(0, 0, 0, 0.5), 22, Vector2(0, 8)], "pad": [26, 18, 26, 22], "keep": true, "grain": true })
	table.custom_minimum_size = Vector2(0, 470)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	table.add_child(v)
	var head: HBoxContainer = HBoxContainer.new()
	v.add_child(head)
	var t: Label = Kit.text(head, "Blackjack", "title", Kit.WOOD_INK)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Kit.text(head, "Blackjack pays 3 to 2   ·   Dealer hits soft 17", "label", Kit.SAND)
	# The dealer.
	var dh: HBoxContainer = HBoxContainer.new()
	dh.alignment = BoxContainer.ALIGNMENT_CENTER
	dh.add_theme_constant_override("separation", 10)
	v.add_child(dh)
	Kit.text(dh, "Dealer", "label", Color(Kit.WOOD_INK, 0.75))
	_dealer_total = Kit.text(dh, "", "value", Kit.WOOD_INK)
	_dealer = HBoxContainer.new()
	_dealer.alignment = BoxContainer.ALIGNMENT_CENTER
	_dealer.add_theme_constant_override("separation", -26)
	_dealer.custom_minimum_size = Vector2(0, 132)
	v.add_child(_dealer)
	_says = Kit.text(v, "Place a bet and deal", "title", Kit.SAND)
	_says.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_says.custom_minimum_size = Vector2(0, 36)
	# Your hands.
	_hands_box = HBoxContainer.new()
	_hands_box.alignment = BoxContainer.ALIGNMENT_CENTER
	_hands_box.add_theme_constant_override("separation", 60)
	_hands_box.custom_minimum_size = Vector2(0, 170)
	v.add_child(_hands_box)
	# The moves, and the bet.
	_ctl = HBoxContainer.new()
	_ctl.alignment = BoxContainer.ALIGNMENT_CENTER
	_ctl.add_theme_constant_override("separation", 10)
	add_child(_ctl)
	_bets_row = HBoxContainer.new()
	_bets_row.add_theme_constant_override("separation", 6)
	_ctl.add_child(_bets_row)
	_moves = HBoxContainer.new()
	_moves.add_theme_constant_override("separation", 8)
	_ctl.add_child(_moves)
	_paint_controls()
	# A hand left open last time comes back where it was.
	var resume: Variant = Casino.resume(session.store, session.uid)
	if resume is Dictionary:
		_render({ "kind": "active", "state": resume }, false)


func _paint_controls() -> void:
	for c: Node in _bets_row.get_children():
		c.queue_free()
	for c: Node in _moves.get_children():
		c.queue_free()
	var active: bool = _view.get("kind") == "active"
	_bets_row.visible = not active
	if not active:
		for b: float in BETS:
			var btn: Button = Paper.button("%d" % int(b), b == _bet)
			btn.pressed.connect(func() -> void:
				_bet = b
				_paint_controls())
			_bets_row.add_child(btn)
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
	var b: Button = Kit.button(t, kind)
	b.custom_minimum_size = Vector2(0, 50)
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
	_clear_table()
	den.paint_purse(chips - _bet)
	den.fly_chips(Vector2.ZERO, _bet, false, _hands_box.get_global_rect().get_center())
	var r: Dictionary = await session.act("dealBlackjack", [_bet])
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)
		den.paint_purse()
		_busy = false
		_paint_controls()
		return
	session.persist()
	_says.text = ""
	await _render(r, true)


func _act(op: String) -> void:
	if _busy:
		return
	_busy = true
	_paint_controls()
	var before: float = Js.num(session.profile().get("casino_chips"))
	var r: Dictionary = await session.act(op)
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)
		_busy = false
		_paint_controls()
		return
	session.persist()
	if op in ["doubleDown", "split", "acceptInsurance"]:
		den.paint_purse(Js.num(session.profile().get("casino_chips")))
	await _render(r, true)


func _clear_table() -> void:
	for c: Node in _dealer.get_children():
		c.queue_free()
	for c: Node in _hands_box.get_children():
		c.queue_free()
	_hand_rows.clear()
	_shown_dealer.clear()
	_shown_hands.clear()
	_dealer_total.text = ""


## Bring the table up to a view: new cards dealt in one by one; at the end of
## a hand the hole card turns and the dealer draws, then the word on each hand.
func _render(r: Dictionary, animate: bool) -> void:
	_view = r
	var settled: bool = r.get("kind") == "settled"
	var dealer: Array = (r["result"]["dealerCards"] if settled else r["state"]["dealerCards"])
	var hands: Array = (r["result"]["hands"] if settled else r["state"]["hands"])
	# A split reshapes the hands: lay them out again.
	if hands.size() != _shown_hands.size():
		for c: Node in _hands_box.get_children():
			c.queue_free()
		_hand_rows.clear()
		var old: Array = _shown_hands.duplicate()
		_shown_hands.clear()
		for i: int in hands.size():
			var box: VBoxContainer = VBoxContainer.new()
			box.alignment = BoxContainer.ALIGNMENT_CENTER
			box.add_theme_constant_override("separation", 4)
			_hands_box.add_child(box)
			var row: HBoxContainer = HBoxContainer.new()
			row.alignment = BoxContainer.ALIGNMENT_CENTER
			row.add_theme_constant_override("separation", -26)
			row.custom_minimum_size = Vector2(0, 132)
			box.add_child(row)
			var info: Label = Kit.text(box, "", "label", Kit.WOOD_INK)
			info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			var word: Label = Kit.text(box, "", "title", Kit.SAND)
			word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			_hand_rows.append([row, info, word])
			# A split hand keeps the card it came from without dealing it again.
			var keep: Array = []
			if not old.is_empty() and i < hands.size() and not (old[0] as Array).is_empty():
				keep = [old[0][i]] if i < (old[0] as Array).size() else []
			for cd: String in keep:
				row.add_child(Card.make(cd, false))
			_shown_hands.append(keep)
	# Deal in what is new: player's first, then the dealer's, in turn order.
	var first_deal: bool = _shown_dealer.is_empty()
	if first_deal:
		for k: int in 2:
			for i: int in hands.size():
				var cards: Array = hands[i]["cards"]
				if k < cards.size() and (_shown_hands[i] as Array).size() <= k:
					await _deal_card(_hand_rows[i][0], cards[k], animate)
					(_shown_hands[i] as Array).append(cards[k])
			if k < dealer.size():
				var d0: String = str(dealer[k]) if not settled or k == 0 else "X"
				await _deal_card(_dealer, d0, animate)
				_shown_dealer.append(d0)
	for i: int in hands.size():
		var cards: Array = hands[i]["cards"]
		while (_shown_hands[i] as Array).size() < cards.size():
			var cd: String = cards[(_shown_hands[i] as Array).size()]
			await _deal_card(_hand_rows[i][0], cd, animate)
			(_shown_hands[i] as Array).append(cd)
	for i: int in hands.size():
		var h: Dictionary = hands[i]
		var total: float = float(h.get("total", Casino.hand_value(h["cards"])["total"]))
		var soft: bool = h.get("soft", false)
		(_hand_rows[i][1] as Label).text = "%s%d   ·   bet %s%s" % ["soft " if soft and total < 21 else "", int(total), Js.thousands(float(h["wager"])), "  (doubled)" if h.get("doubled", false) else ""]
		var row_lit: bool = not settled and i == int(_view["state"]["activeHandIdx"]) and hands.size() > 1
		(_hand_rows[i][0] as Control).modulate = Color(1, 1, 1) if row_lit or hands.size() == 1 or settled else Color(0.75, 0.75, 0.75)
	if not settled:
		_dealer_total.text = "%d showing" % int(Casino.hand_value([dealer[0]])["total"])
		_busy = false
		_paint_controls()
		return
	# The end of the hand: the hole card turns, the dealer draws, the words.
	var res: Dictionary = r["result"]
	if _dealer.get_child_count() >= 2:
		var hole: Card = _dealer.get_child(1)
		if hole.code == "X":
			await hole.flip_to(str(dealer[1]))
			_shown_dealer[1] = str(dealer[1])
	while _shown_dealer.size() < dealer.size():
		var dc: String = dealer[_shown_dealer.size()]
		await _deal_card(_dealer, dc, animate)
		_shown_dealer.append(dc)
	_dealer_total.text = "%d%s" % [int(res["dealerTotal"]), "   bust" if res["dealerBust"] else ("   blackjack" if res["dealerNatural"] else "")]
	for i: int in hands.size():
		var h: Dictionary = hands[i]
		var w: Label = _hand_rows[i][2]
		match str(h["outcome"]):
			"blackjack":
				w.text = "Blackjack!  +%s" % Js.thousands(float(h["net"]))
			"win":
				w.text = "Win  +%s" % Js.thousands(float(h["net"]))
			"push":
				w.text = "Push"
			_:
				w.text = "Bust" if float(h["total"]) > 21.0 else "Lose"
		# The word rises in (never a bounce on text).
		Motion.rise_word(w)
	var net: float = float(res["netDelta"])
	var back: float = 0.0
	for h: Dictionary in hands:
		back += float(h["payout"])
	if back > 0.0:
		den.fly_chips(_hands_box.get_global_rect().get_center(), back)
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
	den.roll_chips(Js.num(session.profile().get("casino_chips")) - maxf(0.0, float(res["newChips"]) - Js.num(session.profile().get("casino_chips"))), float(res["newChips"]))
	_busy = false
	_paint_controls()


func _deal_card(row: HBoxContainer, code: String, animate: bool) -> void:
	var c: Card = Card.make(code, animate)
	row.add_child(c)
	if animate:
		Sound.plip()
		await get_tree().create_timer(DEAL_GAP).timeout


## A PAPER CARD. Its face (rank in the corners, the suit large) or its back;
## dealt, it slides in from the shoe at the top right with a turn and lands;
## flipped, it narrows to an edge and opens on its face.
class Card:
	extends Control
	const SIZE: Vector2 = Vector2(88, 124)
	var code: String = "X"
	var _inner: Control

	static func make(c: String, slide: bool) -> Card:
		var card: Card = Card.new()
		card.code = c
		card.custom_minimum_size = SIZE
		if slide:
			card.ready.connect(func() -> void: card._slide())
		return card

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_inner = Control.new()
		_inner.size = SIZE
		_inner.pivot_offset = SIZE / 2.0
		_inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_inner.draw.connect(_paint)
		add_child(_inner)

	func _slide() -> void:
		_inner.position = Vector2(520, -260)
		_inner.rotation = deg_to_rad(-24.0)
		_inner.modulate.a = 0.0
		var tw: Tween = create_tween().set_parallel()
		tw.tween_property(_inner, "position", Vector2.ZERO, 0.32).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_property(_inner, "rotation", deg_to_rad(randf_range(-3.0, 3.0)), 0.32).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_property(_inner, "modulate:a", 1.0, 0.12).set_trans(Tween.TRANS_SINE)

	func flip_to(c: String) -> void:
		var tw: Tween = create_tween()
		tw.tween_property(_inner, "scale:x", 0.0, 0.14).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		await tw.finished
		code = c
		_inner.queue_redraw()
		Sound.plip()
		var tw2: Tween = create_tween()
		tw2.tween_property(_inner, "scale:x", 1.0, 0.16).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		await tw2.finished

	func _paint() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, SIZE)
		_inner.draw_rect(Rect2(r.position + Vector2(3, 5), r.size), Color(0, 0, 0, 0.3))
		if code == "X":
			_inner.draw_rect(r, Color(0.48, 0.16, 0.12))
			_inner.draw_rect(r.grow(-6), Color(0.62, 0.22, 0.16), false, 2.0)
			var y: float = 12.0
			while y < SIZE.y - 10.0:
				_inner.draw_line(Vector2(10, y), Vector2(SIZE.x - 10, y + 10), Color(0.85, 0.6, 0.35, 0.35), 1.5)
				y += 9.0
			_inner.draw_rect(r, Color(0.25, 0.08, 0.05), false, 1.5)
			return
		_inner.draw_rect(r, Kit.PAPER.lightened(0.08))
		_inner.draw_rect(r, Color(Kit.PAPER_INK, 0.6), false, 1.5)
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
