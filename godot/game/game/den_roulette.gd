class_name DenRoulette
extends VBoxContainer
## FISH ROULETTE (Godot port of app/(app)/tavern/roulette, made to move): a
## wooden wheel in the real wheel's order, and a paper board. Press a spot on
## the board to stack a chip of the size you have picked there (a number, a
## dozen, a column, red or black, even or odd, low or high); Spin, and the
## wheel turns while the ball runs the other way round the rim, drops, rattles
## and settles in its pocket. The fish that pocket is named for comes up in
## the hub, the winning spot lights on the board and the chips come home.
##
## IN A CHARTER THE WHEEL IS SHARED (game/den_tables.gd): everyone at it
## sees the others' chips on the board in their colours, "Spin" becomes
## "Ready", a countdown starts with the first ready, and one spin settles the
## whole table; every captain's result is called out after it.

const ORDER: Array = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
const CHIPS: Array = [10.0, 25.0, 50.0, 100.0, 250.0, 500.0]
const POCKET_RED: Color = Color(0.68, 0.2, 0.15)
const POCKET_BLACK: Color = Color(0.16, 0.12, 0.1)
const POCKET_GREEN: Color = Color(0.18, 0.45, 0.36)

var session: Session
var den: DenRoom
var _chip: float = 25.0
## The slip: "type|target" -> { type, target, amount }.
var _bets: Dictionary = {}
var _last: Dictionary = {}
var _wheel: Wheel
var _board: Board
var _chips_row: HBoxContainer
var _total: Label
var _says: Label
var _spin_b: Button
var _busy: bool = false
var _shared: bool = false
var _seen_round: int = -1
var _deadline: float = -1.0
var _seats_l: Label
var _ready_sent: bool = false
var _phase: String = "betting"


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	var table: Pane = Kit.pane(self, { "radius": 16, "fill": [Kit.WOOD_HI, Kit.WOOD_LO], "border": [2, Color(0.25, 0.15, 0.08, 0.9)], "shadow": [Color(0, 0, 0, 0.5), 22, Vector2(0, 8)], "pad": [22, 18, 22, 20], "keep": true, "grain": true })
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	table.add_child(v)
	var head: HBoxContainer = HBoxContainer.new()
	v.add_child(head)
	var t: Label = Kit.text(head, "Fish Roulette", "title", Kit.WOOD_INK)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_says = Kit.text(head, "Place your chips on the board", "label", Color(1.0, 0.86, 0.5))
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	v.add_child(row)
	_wheel = Wheel.new()
	_wheel.custom_minimum_size = Vector2(330, 330)
	row.add_child(_wheel)
	_board = Board.new()
	_board.custom_minimum_size = Vector2(560, 300)
	_board.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_board.owner_table = self
	row.add_child(_board)
	# The chip you are placing, the slip's total, and the wheel.
	var ctl: HBoxContainer = HBoxContainer.new()
	ctl.add_theme_constant_override("separation", 10)
	ctl.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(ctl)
	_chips_row = HBoxContainer.new()
	_chips_row.add_theme_constant_override("separation", 6)
	ctl.add_child(_chips_row)
	_paint_chips()
	_total = Kit.text(ctl, "", "value", Kit.INK)
	_total.custom_minimum_size = Vector2(150, 0)
	_total.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var clear: Button = Kit.button("Clear", "secondary", "small")
	clear.pressed.connect(func() -> void:
		if not _busy:
			_bets.clear()
			_changed())
	ctl.add_child(clear)
	var again: Button = Kit.button("Same again", "secondary", "small")
	again.pressed.connect(func() -> void:
		if not _busy and not _last.is_empty():
			_bets = _last.duplicate(true)
			_changed())
	ctl.add_child(again)
	_spin_b = Kit.button("Spin   ·   Space", "primary")
	_spin_b.custom_minimum_size = Vector2(200, 54)
	_spin_b.add_theme_font_size_override("font_size", 19)
	_spin_b.pressed.connect(spin)
	ctl.add_child(_spin_b)
	_changed()
	var rs: Dictionary = Casino.roulette_state(session.store, session.uid)
	_wheel.recent = (rs["recentSpins"] as Array).map(func(s: Dictionary) -> float: return float(s["winningNumber"]))
	if DenTables.shared_for(session):
		_shared = true
		_spin_b.text = "Ready   ·   Space"
		_seats_l = Kit.text(self, "", "label", Kit.INK)
		_seats_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		DenTables.live.changed.connect(_on_table)
		tree_exiting.connect(func() -> void: session.act("denTable", ["roulette", "leave"]))
		var st: Variant = DenTables.live.states.get("roulette")
		if st is Dictionary:
			_seen_round = int(Js.obj((st as Dictionary).get("result")).get("round", -1))
		session.act("denTable", ["roulette", "sit"])


func _process(_delta: float) -> void:
	if _shared and _seats_l != null:
		var left: int = int(ceil((_deadline - Time.get_ticks_msec() / 1000.0)))
		if _phase == "betting" and _deadline > 0.0 and left >= 0:
			_says.text = "Spins in %d" % left


## The table as the founder's game sees it.
func _on_table(game: String, st: Dictionary) -> void:
	if game != "roulette" or not is_inside_tree():
		return
	var me: String = DenTables.live.my_key()
	_phase = str(st["phase"])
	_deadline = Time.get_ticks_msec() / 1000.0 + float(st["left"]) if float(st["left"]) > 0.0 else -1.0
	var names: Array = []
	var others: Array = []
	for k: String in st["seats"]:
		var seat: Dictionary = st["seats"][k]
		names.append("%s%s" % [seat["name"], " (ready)" if seat["ready"] else ""])
		if k != me:
			others.append({ "color": Color(str(seat["color"])), "bets": seat["bets"] })
	_seats_l.text = "At the wheel: %s" % ", ".join(PackedStringArray(names))
	_board.others = others
	_board.queue_redraw()
	if _phase == "betting":
		if _ready_sent and not (Js.obj(st["seats"].get(me)).get("ready", false)):
			_ready_sent = false
		_spin_b.disabled = _ready_sent
		if _deadline <= 0.0:
			_says.text = "Place your chips, then Ready" if not _ready_sent else "Waiting for the others"
	var res: Dictionary = Js.obj(st.get("result"))
	if _phase == "spun" and int(res.get("round", -1)) > _seen_round:
		_seen_round = int(res["round"])
		_shared_spin(res, st)


func _shared_spin(res: Dictionary, st: Dictionary) -> void:
	_busy = true
	_spin_b.disabled = true
	_board.won = []
	_board.result = -1
	var me: String = DenTables.live.my_key()
	var mine: Dictionary = Js.obj(Js.obj(res["by"]).get(me))
	var before: float = Js.num(session.profile().get("casino_chips"))
	_says.text = "No more bets"
	Sound.cast()
	await _wheel.spin_to(int(res["n"]))
	var n: int = int(res["n"])
	_board.result = n
	_board.won = Js.list(mine.get("won"))
	_board.queue_redraw()
	var parts: Array = []
	for k: String in res["by"]:
		var r: Dictionary = res["by"][k]
		if r.has("error"):
			continue
		var who: String = str(Js.obj(st["seats"].get(k)).get("name", "Someone"))
		var net: float = float(r["net"])
		parts.append("%s %s%s" % [who, "+" if net >= 0.0 else "-", Js.thousands(absf(net))])
	_says.text = "%d, %s.   %s" % [n, _pocket_name(n), "   ".join(PackedStringArray(parts))]
	if not mine.is_empty() and not mine.has("error"):
		var wk: Array = Js.list(mine.get("won"))
		if not wk.is_empty() and float(mine["payout"]) > 0.0:
			den.fly_chips(_board.cell_center(str(wk[0])), float(mine["payout"]))
		if float(mine["net"]) > 0.0:
			Sound.chest(false)
			Rumble.buzz([0, 40, 30, 60])
		den.roll_chips(before, float(mine["chipsAfter"]))
	_last = _bets.duplicate(true)
	await get_tree().create_timer(2.5).timeout
	_bets.clear()
	_ready_sent = false
	_changed()
	_busy = false
	_spin_b.disabled = false


func _send_ready() -> void:
	if _bets.is_empty():
		den.toast("Place a chip on the board first", DenRoom.RED)
		return
	var r: Dictionary = await session.act("denTable", ["roulette", "bets", { "bets": _bets.values(), "ready": true }])
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)
		return
	_ready_sent = true
	_spin_b.disabled = true


func _paint_chips() -> void:
	for c: Node in _chips_row.get_children():
		c.queue_free()
	for n: float in CHIPS:
		var b: Button = Paper.button("%d" % int(n), n == _chip)
		b.pressed.connect(func() -> void:
			_chip = n
			_paint_chips())
		_chips_row.add_child(b)


## A spot pressed: a chip of the picked size stacked on it.
func place(type: String, target: Variant) -> void:
	if _busy:
		return
	if _shared and (_phase != "betting" or _ready_sent):
		return
	var key: String = "%s|%s" % [type, JsJson.stringify(target)]
	var cap: float = float(Casino.c()["rlMaxStraight"] if Casino.INSIDE.has(type) else Casino.c()["rlMaxOutside"])
	var have: float = float((_bets.get(key, {}) as Dictionary).get("amount", 0.0))
	if have + _chip > cap:
		den.toast("%s chips is the most on one spot" % Js.thousands(cap), DenRoom.RED)
		return
	_bets[key] = { "type": type, "target": target, "amount": have + _chip }
	den.fly_chips(Vector2.ZERO, _chip, false, _board.cell_center(key))
	_changed()


func _changed() -> void:
	var sum: float = 0.0
	for k: String in _bets:
		sum += float(_bets[k]["amount"])
	_total.text = "On the board: %s" % Js.thousands(sum) if sum > 0.0 else "No chips down"
	_board.bets = _bets
	_board.queue_redraw()


func play_for_shot() -> void:
	place("color", "red")
	place("straight", 17.0)
	place("dozen", 2.0)
	spin()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo and (event as InputEventKey).keycode == KEY_SPACE:
		get_viewport().set_input_as_handled()
		spin()


func spin() -> void:
	if _shared:
		if not _busy and not _ready_sent:
			_send_ready()
		return
	if _busy or _bets.is_empty():
		if _bets.is_empty():
			den.toast("Place a chip on the board first", DenRoom.RED)
		return
	var slip: Array = _bets.values()
	var stake: float = 0.0
	for b: Dictionary in slip:
		stake += float(b["amount"])
	var chips: float = Js.num(session.profile().get("casino_chips"))
	if chips < stake:
		den.toast("Not enough chips. Buy in above.", DenRoom.RED)
		return
	_busy = true
	_spin_b.disabled = true
	_board.won = []
	_board.result = -1
	den.paint_purse(chips - stake)
	var r: Dictionary = await session.act("placeBetsAndSpin", [slip])
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)
		den.paint_purse()
		_busy = false
		_spin_b.disabled = false
		return
	session.persist()
	_says.text = "No more bets"
	Sound.cast()
	await _wheel.spin_to(int(r["winningNumber"]))
	var n: int = int(r["winningNumber"])
	_board.result = n
	var won: Array = []
	for pb: Dictionary in r["perBet"]:
		if pb["won"]:
			won.append("%s|%s" % [pb["bet"]["type"], JsJson.stringify(pb["bet"]["target"])])
	_board.won = won
	_board.queue_redraw()
	for pb: Dictionary in r["perBet"]:
		if pb["won"]:
			den.fly_chips(_board.cell_center("%s|%s" % [pb["bet"]["type"], JsJson.stringify(pb["bet"]["target"])]), float(pb["payout"]))
	var name: String = _pocket_name(n)
	if float(r["net"]) > 0.0:
		_says.text = "%d, %s.  +%s" % [n, name, Js.thousands(float(r["totalPayout"]))]
		Sound.chest(float(r["net"]) >= stake * 5.0)
		Rumble.buzz([0, 40, 30, 60])
	elif float(r["totalPayout"]) > 0.0:
		_says.text = "%d, %s.  %s back" % [n, name, Js.thousands(float(r["totalPayout"]))]
		Sound.plip()
	else:
		_says.text = "%d, %s." % [n, name]
	_last = _bets.duplicate(true)
	den.roll_chips(chips - stake, float(r["chipsAfter"]))
	await get_tree().create_timer(1.6).timeout
	_bets.clear()
	_changed()
	_busy = false
	_spin_b.disabled = false


static func _pocket_name(n: int) -> String:
	for p: Dictionary in Casino.c()["pockets"]:
		if int(p["number"]) == n:
			return str(p["name"])
	return ""


static func pocket_color(n: int) -> Color:
	var c: String = Casino.color_of(float(n))
	return POCKET_GREEN if c == "green" else (POCKET_RED if c == "red" else POCKET_BLACK)


## THE WHEEL: a wooden bowl, the pockets in the real order round it, and the
## ball. Spun, it turns down from speed while the ball runs the other way on
## the rim, drops inward with a rattle and comes to rest in the pocket, and
## the fish that pocket is named for rises in the brass hub.
class Wheel:
	extends Control
	var angle: float = 0.0
	var recent: Array = []
	var _ball_rel: float = 0.0
	var _ball_r: float = 1.0
	var _ball_on: bool = false
	var _hub_fish: Texture2D = null
	var _hub_k: float = 0.0

	func _pocket_angle(n: int) -> float:
		var i: int = DenRoulette.ORDER.find(n)
		return TAU * float(i) / DenRoulette.ORDER.size()

	func spin_to(n: int) -> void:
		_hub_k = 0.0
		_hub_fish = null
		_ball_on = true
		var a0: float = angle
		var turns: float = TAU * 3.0
		var target_rel: float = -_pocket_angle(n)
		var rel0: float = target_rel + TAU * 5.0
		var dur: float = 4.2
		var tw: Tween = create_tween()
		var clack: Array = [0.0]
		tw.tween_method(func(u: float) -> void:
			angle = a0 + turns * (1.0 - pow(1.0 - u, 3.0))
			# The ball runs the other way, slowing, onto its pocket.
			_ball_rel = target_rel + (rel0 - target_rel) * pow(1.0 - u, 2.4)
			# On the rim, then dropping inward with a few bounces.
			var drop: float = clampf((u - 0.62) / 0.3, 0.0, 1.0)
			var bounce: float = absf(sin(drop * PI * 4.0)) * (1.0 - drop) * 0.12
			_ball_r = lerpf(1.0, 0.0, drop) + bounce
			if drop > 0.0 and drop < 1.0 and u - clack[0] > 0.035:
				clack[0] = u
				Sound.xp_tick()
			queue_redraw(), 0.0, 1.0, dur)
		await tw.finished
		Rumble.buzz([0, 30])
		_hub_fish = Skipper.fish_thumb(DenRoulette._pocket_name(n)) if n != 0 else null
		recent.push_front(float(n))
		if recent.size() > 12:
			recent.resize(12)
		var hk: Tween = create_tween()
		hk.tween_method(func(k: float) -> void:
			_hub_k = k
			queue_redraw(), 0.0, 1.0, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	func _draw() -> void:
		var c: Vector2 = size / 2.0
		var R: float = minf(size.x, size.y) / 2.0 - 4.0
		var f: Font = Kit.font("cinzel", 700)
		# The bowl and its rim.
		draw_circle(c + Vector2(0, 6), R, Color(0, 0, 0, 0.35))
		draw_circle(c, R, Kit.WOOD_LO.darkened(0.15))
		draw_circle(c, R * 0.93, Kit.WOOD_HI)
		draw_circle(c, R * 0.86, Color(0.22, 0.14, 0.08))
		var n: int = DenRoulette.ORDER.size()
		var r_out: float = R * 0.84
		var r_in: float = R * 0.58
		for i: int in n:
			var a0: float = angle + TAU * i / n - PI / 2.0 - TAU / n / 2.0
			var a1: float = a0 + TAU / n
			var pts: PackedVector2Array = PackedVector2Array()
			for k: int in 6:
				pts.append(c + Vector2.from_angle(lerpf(a0, a1, k / 5.0)) * r_out)
			for k: int in 6:
				pts.append(c + Vector2.from_angle(lerpf(a1, a0, k / 5.0)) * r_in)
			draw_colored_polygon(pts, DenRoulette.pocket_color(int(DenRoulette.ORDER[i])))
			draw_line(c + Vector2.from_angle(a0) * r_in, c + Vector2.from_angle(a0) * r_out, Color(0.85, 0.7, 0.4, 0.8), 1.5, true)
			# The number, upright along its pocket.
			var am: float = (a0 + a1) / 2.0
			var label: String = str(DenRoulette.ORDER[i])
			var at: Vector2 = c + Vector2.from_angle(am) * (r_out - 15.0)
			draw_set_transform(at, am + PI / 2.0, Vector2.ONE)
			var w: float = f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			draw_string(f, Vector2(-w / 2.0, 4.0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.98, 0.94, 0.85))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		# The brass hub, with the winning pocket's fish.
		draw_circle(c, r_in, Color(0.75, 0.58, 0.28))
		draw_circle(c, r_in * 0.9, Color(0.86, 0.72, 0.42))
		draw_circle(c, r_in * 0.82, Kit.PAPER)
		for k: int in 4:
			var a: float = angle * 1.0 + k * PI / 2.0
			draw_line(c + Vector2.from_angle(a) * r_in * 0.82, c + Vector2.from_angle(a) * r_in * 0.95, Color(0.5, 0.36, 0.15), 3.0, true)
		if _hub_fish != null and _hub_k > 0.0:
			var sz: Vector2 = _hub_fish.get_size()
			var sc: float = minf(r_in * 1.4 / sz.x, r_in * 1.2 / sz.y) * _hub_k
			draw_texture_rect(_hub_fish, Rect2(c - sz * sc / 2.0, sz * sc), false)
		# The ball.
		if _ball_on:
			var br: float = lerpf(r_in + 12.0, R * 0.9, clampf(_ball_r, 0.0, 1.2))
			var bp: Vector2 = c + Vector2.from_angle(angle + _ball_rel - PI / 2.0) * br
			draw_circle(bp + Vector2(1.5, 2.5), 7.0, Color(0, 0, 0, 0.35))
			draw_circle(bp, 7.0, Color(0.97, 0.96, 0.92))
			draw_circle(bp + Vector2(-2, -2), 2.5, Color(1, 1, 1))
		# The last numbers, as beads under the wheel.
		for k: int in mini(recent.size(), 10):
			var p: Vector2 = Vector2(c.x - 4.5 * 22.0 + k * 22.0, size.y - 2.0)
			draw_circle(p, 9.0, DenRoulette.pocket_color(int(recent[k])))
			var s: String = str(int(recent[k]))
			var sw: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
			draw_string(f, p + Vector2(-sw / 2.0, 4.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(0.98, 0.94, 0.85))


## THE BOARD: the numbers three rows deep like a real table, zero on the
## left, the columns' "2 to 1" on the right, then the dozens and the even
## bets. Press to place; chips stack where they lie, and after the spin the
## winning number and the spots that paid light up.
class Board:
	extends Control
	var owner_table: DenRoulette
	var bets: Dictionary = {}
	## The other captains' chips at a shared wheel: [{ color, bets }].
	var others: Array = []
	var won: Array = []
	var result: int = -1
	var _cells: Array = []

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		resized.connect(_layout)
		_layout()
		get_tree().process_frame.connect(queue_redraw, CONNECT_ONE_SHOT)

	func _layout() -> void:
		_cells.clear()
		var w: float = size.x
		var h: float = size.y
		var zero_w: float = w * 0.07
		var col_w: float = w * 0.08
		var cw: float = (w - zero_w - col_w) / 12.0
		var rh: float = h * 0.62 / 3.0
		_cells.append({ "r": Rect2(0, 0, zero_w, rh * 3.0), "type": "straight", "target": 0.0, "text": "0", "col": DenRoulette.POCKET_GREEN })
		for i: int in 12:
			for row: int in 3:
				var n: int = i * 3 + (3 - row)
				_cells.append({ "r": Rect2(zero_w + i * cw, row * rh, cw, rh), "type": "straight", "target": float(n), "text": str(n), "col": DenRoulette.pocket_color(n) })
		for row: int in 3:
			_cells.append({ "r": Rect2(w - col_w, row * rh, col_w, rh), "type": "column", "target": float(3 - row), "text": "2 to 1", "col": Color(0, 0, 0, 0) })
		var y2: float = rh * 3.0
		var dh: float = h * 0.19
		for d: int in 3:
			_cells.append({ "r": Rect2(zero_w + d * cw * 4.0, y2, cw * 4.0, dh), "type": "dozen", "target": float(d + 1), "text": ["1st 12", "2nd 12", "3rd 12"][d], "col": Color(0, 0, 0, 0) })
		var y3: float = y2 + dh
		var ow: float = cw * 2.0
		var outs: Array = [["half", "low", "1 to 18"], ["parity", "even", "Even"], ["color", "red", "Red"], ["color", "black", "Black"], ["parity", "odd", "Odd"], ["half", "high", "19 to 36"]]
		for k: int in outs.size():
			var o: Array = outs[k]
			var colr: Color = DenRoulette.POCKET_RED if o[1] == "red" else (DenRoulette.POCKET_BLACK if o[1] == "black" else Color(0, 0, 0, 0))
			_cells.append({ "r": Rect2(zero_w + k * ow, y3, ow, h - y3), "type": o[0], "target": o[1], "text": o[2], "col": colr })
		queue_redraw()

	## A spot's middle on the screen, by its key ("type|target").
	func cell_center(key: String) -> Vector2:
		for cell: Dictionary in _cells:
			if "%s|%s" % [cell["type"], JsJson.stringify(cell["target"])] == key:
				return get_global_transform() * (cell["r"] as Rect2).get_center()
		return get_global_rect().get_center()

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
			var p: Vector2 = (event as InputEventMouseButton).position
			for cell: Dictionary in _cells:
				if (cell["r"] as Rect2).has_point(p):
					owner_table.place(cell["type"], cell["target"])
					accept_event()
					return

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Kit.PAPER)
		var f: Font = Kit.font("cinzel", 700)
		var small: Font = Kit.font("karla", 700)
		for cell: Dictionary in _cells:
			var r: Rect2 = cell["r"]
			var colr: Color = cell["col"]
			if colr.a > 0.0:
				draw_rect(r.grow(-3), Color(colr, 0.85))
			var key: String = "%s|%s" % [cell["type"], JsJson.stringify(cell["target"])]
			var lit: bool = won.has(key) or (cell["type"] == "straight" and int(cell["target"]) == result)
			if lit:
				draw_rect(r.grow(-2), Color(1.0, 0.8, 0.3, 0.55))
			draw_rect(r, Color(Paper.INK, 0.45), false, 1.0)
			var big: bool = cell["type"] == "straight"
			var fnt: Font = f if big else small
			var fs: int = 15 if big else 12
			var tcol: Color = Color(0.98, 0.94, 0.85) if colr.a > 0.0 else Paper.INK
			var tw: float = fnt.get_string_size(str(cell["text"]), HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			draw_string(fnt, r.get_center() + Vector2(-tw / 2.0, fs * 0.35), str(cell["text"]), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, tcol)
			# The others' chips, in their colours, a little to the left.
			var oi: int = 0
			for o: Dictionary in others:
				for ob: Dictionary in o["bets"]:
					if "%s|%s" % [ob["type"], JsJson.stringify(ob["target"])] == key:
						var op: Vector2 = r.get_center() + Vector2(-r.size.x * 0.22 + oi * 6.0, r.size.y * 0.12)
						draw_circle(op + Vector2(0, 1), 12.0, o["color"])
						draw_texture_rect(DenRoom.chip_tex(float(ob["amount"])), Rect2(op - Vector2(11, 9.5), Vector2(22, 19)), false)
						oi += 1
			# The chips on it.
			if bets.has(key):
				var amt: float = float(bets[key]["amount"])
				var cpos: Vector2 = r.get_center() + Vector2(r.size.x * 0.22, -r.size.y * 0.18)
				var stack: int = clampi(int(amt / 25.0) + 1, 1, 5)
				var each: Array = DenRoom.breakdown(amt, 5)
				for s: int in each.size():
					var sp: Vector2 = cpos + Vector2(0, -s * 4.0)
					draw_texture_rect(DenRoom.chip_tex(float(each[s])), Rect2(sp - Vector2(14, 12), Vector2(28, 24)), false)
				stack = each.size()
				var at: String = Js.thousands(amt)
				var aw: float = small.get_string_size(at, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
				draw_string(small, cpos + Vector2(-aw / 2.0, -stack * 3.0 + 4.0), at, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(0.25, 0.15, 0.03))
