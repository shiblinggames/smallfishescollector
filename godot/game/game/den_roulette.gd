class_name DenRoulette
extends Control
## FISH ROULETTE (Godot port of app/(app)/tavern/roulette, made to move). On
## the Den's felt (THE DEN AS A PLACE, 2026-10-10): a big wheel on the left,
## drawn flat in code (the pockets in the real wheel's order, no wood), and
## the board on the right printed on the felt in cream lines. Pick a chip,
## press a spot (a number, a split, a corner, a street, a line, a dozen, a
## column, red or black, even or odd, low or high): the chip slides out of your
## pile and stacks on the spot, taller with each one. Spin: the view leans in
## to the wheel (it grows a little), the wheel turns and slows while the ball
## runs the rim the other way, drops, skitters across a pocket or two and
## settles; the fish that pocket is named for rises in the hub. The winning
## spots light, the losing chips are swept off the felt, and every win slides
## back to your pile.
##
## IN A CHARTER THE WHEEL IS SHARED (game/den_tables.gd): everyone at it
## sees the others' chips on the board ringed in their colours, "Spin" becomes
## "Ready", a countdown starts with the first ready, and one spin settles the
## whole table; every captain's result is called out after it.

const ORDER: Array = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
const POCKET_RED: Color = Color(0.7, 0.2, 0.16)
const POCKET_BLACK: Color = Color(0.11, 0.11, 0.11)
const POCKET_GREEN: Color = Color(0.2, 0.52, 0.4)
## How far the view leans in to the wheel while it spins.
const LEAN: float = 1.09

var session: Session
var den: DenRoom
var _chip: float = 25.0
## The slip: "type|target" -> { type, target, amount }.
var _bets: Dictionary = {}
var _last: Dictionary = {}
var _wheel: Wheel
var _holder: Control
var _board: Board
var _chips_row: HBoxContainer
var _ctl: HBoxContainer
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
	var row: HBoxContainer = HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.add_theme_constant_override("separation", 28)
	add_child(row)
	# The wheel stands in a plain holder: a container resets the scale of
	# its own children whenever it lays them out, and the wheel leans in.
	_holder = Control.new()
	_holder.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(_holder)
	_wheel = Wheel.new()
	_wheel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_holder.add_child(_wheel)
	var right: VBoxContainer = VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 8)
	row.add_child(right)
	var head: HBoxContainer = HBoxContainer.new()
	right.add_child(head)
	var t: Label = DenRoom.says(head, "Fish Roulette", "title")
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_says = DenRoom.says(head, "Place your chips on the board", "body_strong", DenRoom.CREAM_SOFT)
	_says.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_board = Board.new()
	_board.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_board.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_board.owner_table = self
	right.add_child(_board)
	# The inside bets, said plainly (the edge spots only show when pointed at).
	var hint: Label = DenRoom.says(right, "On the lines: between two numbers a split (pays 17 to 1), where four meet a corner (8 to 1), under a column a street of 3 (11 to 1), between two columns at the bottom a line of 6 (5 to 1).", "small", DenRoom.CREAM_SOFT)
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.custom_minimum_size = Vector2(200, 0)
	# The chip you are placing, the slip's total, and the wheel.
	_ctl = HBoxContainer.new()
	var ctl: HBoxContainer = _ctl
	ctl.add_theme_constant_override("separation", 12)
	right.add_child(ctl)
	_chips_row = HBoxContainer.new()
	_chips_row.add_theme_constant_override("separation", 2)
	ctl.add_child(_chips_row)
	_paint_chips()
	_total = DenRoom.says(ctl, "", "value", DenRoom.CREAM)
	_total.custom_minimum_size = Vector2(150, 0)
	_total.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_total.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_total.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var clear: Button = Paper.button("Clear")
	clear.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	clear.pressed.connect(_clear)
	ctl.add_child(clear)
	var again: Button = Paper.button("Same again")
	again.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	again.pressed.connect(_same_again)
	ctl.add_child(again)
	_spin_b = DenRoom.primary("Spin   ·   Space")
	_spin_b.custom_minimum_size = Vector2(210, 54)
	_spin_b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_spin_b.pressed.connect(spin)
	ctl.add_child(_spin_b)
	resized.connect(_fit)
	_fit()
	_changed()
	var rs: Dictionary = Casino.roulette_state(session.store, session.uid)
	_wheel.recent = (rs["recentSpins"] as Array).map(func(s: Dictionary) -> float: return float(s["winningNumber"]))
	if DenTables.shared_for(session):
		_shared = true
		_spin_b.text = "Ready   ·   Space"
		_seats_l = DenRoom.says(right, "", "label", DenRoom.CREAM)
		right.move_child(_seats_l, 1)
		DenTables.live.changed.connect(_on_table)
		tree_exiting.connect(func() -> void: session.act("denTable", ["roulette", "leave"]))
		var st: Variant = DenTables.live.states.get("roulette")
		if st is Dictionary:
			_seen_round = int(Js.obj((st as Dictionary).get("result")).get("round", -1))
		session.act("denTable", ["roulette", "sit"])


## The wheel sized from the felt: as tall as the table allows, never more
## than about two fifths of its width.
func _fit() -> void:
	var right_min: float = _ctl.get_combined_minimum_size().x if _ctl != null else 900.0
	# Room left over the wheel for it to lean in without touching the purse.
	var d: float = floorf(minf(minf(size.y - 34.0, size.x * 0.42), size.x - 28.0 - right_min) / LEAN)
	if d > 40.0:
		_holder.custom_minimum_size = Vector2(d, d + 34.0)


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
	await _turn_wheel(int(res["n"]))
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
	Motion.rise_word(_says)
	if not mine.is_empty() and not mine.has("error"):
		var wk: Array = Js.list(mine.get("won"))
		_sweep_losers(wk)
		if not wk.is_empty() and float(mine["payout"]) > 0.0:
			await get_tree().create_timer(0.35).timeout
			den.fly_chips(_board.cell_center(str(wk[0])), float(mine["payout"]))
			for k: String in wk:
				_board.shown.erase(k)
			_board.queue_redraw()
		if float(mine["net"]) > 0.0:
			Sound.chest(false)
			Rumble.buzz([0, 40, 30, 60])
		den.roll_chips(before, float(mine["chipsAfter"]))
	_last = _bets.duplicate(true)
	await get_tree().create_timer(2.5).timeout
	_bets.clear()
	_board.shown.clear()
	_board.won = []
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
	DenRoom.stake_row(_chips_row, _chip, func(n: float) -> void:
		_chip = n
		_paint_chips())


## A spot pressed: a chip of the picked size slides out of the pile and
## lands on it (the board shows it once it is down).
func place(type: String, target: Variant) -> void:
	if _busy:
		return
	if _shared and (_phase != "betting" or _ready_sent):
		return
	var key: String = Board.key_of(type, target)
	var cap: float = float(Casino.c()["rlMaxStraight"] if Casino.INSIDE.has(type) else Casino.c()["rlMaxOutside"])
	var have: float = float((_bets.get(key, {}) as Dictionary).get("amount", 0.0))
	if have + _chip > cap:
		den.toast("%s chips is the most on one spot" % Js.thousands(cap), DenRoom.RED)
		return
	if _slip_sum() + _chip > Js.num(session.profile().get("casino_chips")):
		den.toast("Not enough chips. Buy in above.", DenRoom.RED)
		return
	_bets[key] = { "type": type, "target": target, "amount": have + _chip }
	var amt: float = _chip
	den.fly_chips(Vector2.ZERO, amt, false, _board.cell_center(key), func() -> void:
		if is_instance_valid(_board) and _bets.has(key):
			_board.shown[key] = float(_board.shown.get(key, 0.0)) + amt
			_board.land(key))
	_changed()


## Clear: every chip on the board slides home.
func _clear() -> void:
	if _busy or _bets.is_empty():
		return
	for k: String in _bets:
		den.fly_chips(_board.cell_center(k), float(_bets[k]["amount"]))
	_bets.clear()
	_board.shown.clear()
	_changed()


## Same again: last spin's chips go down again, each sliding to its spot.
func _same_again() -> void:
	if _busy or _last.is_empty():
		return
	if not _bets.is_empty():
		_clear()
	var need: float = 0.0
	for k: String in _last:
		need += float(_last[k]["amount"])
	if need > Js.num(session.profile().get("casino_chips")):
		den.toast("Not enough chips. Buy in above.", DenRoom.RED)
		return
	_bets = _last.duplicate(true)
	for k: String in _bets:
		var key: String = k
		var amt: float = float(_bets[k]["amount"])
		den.fly_chips(Vector2.ZERO, amt, false, _board.cell_center(key), func() -> void:
			if is_instance_valid(_board) and _bets.has(key):
				_board.shown[key] = amt
				_board.land(key))
	_changed()


func _slip_sum() -> float:
	var sum: float = 0.0
	for k: String in _bets:
		sum += float(_bets[k]["amount"])
	return sum


func _changed() -> void:
	var sum: float = _slip_sum()
	_total.text = "On the board: %s" % Js.thousands(sum) if sum > 0.0 else "No chips down"
	_board.bets = _bets
	_board.queue_redraw()
	# The pile shows what is left once these chips are down.
	if not _busy and den != null:
		den.paint_purse(maxf(0.0, Js.num(session.profile().get("casino_chips")) - sum))


func play_for_shot() -> void:
	place("color", "red")
	place("straight", 17.0)
	place("split", [16.0, 17.0])
	place("corner", [13.0, 14.0, 16.0, 17.0])
	place("street", 6.0)
	place("dozen", 2.0)
	await get_tree().create_timer(0.8).timeout
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
	var stake: float = _slip_sum()
	var chips: float = Js.num(session.profile().get("casino_chips"))
	if chips < stake:
		den.toast("Not enough chips. Buy in above.", DenRoom.RED)
		return
	_busy = true
	_spin_b.disabled = true
	_board.won = []
	_board.result = -1
	# Whatever is still in the air lands now.
	for k: String in _bets:
		_board.shown[k] = float(_bets[k]["amount"])
	_board.queue_redraw()
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
	await _turn_wheel(int(r["winningNumber"]))
	var n: int = int(r["winningNumber"])
	_board.result = n
	var won: Array = []
	for pb: Dictionary in r["perBet"]:
		if pb["won"]:
			won.append(Board.key_of(pb["bet"]["type"], pb["bet"]["target"]))
	_board.won = won
	_board.queue_redraw()
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
	Motion.rise_word(_says)
	# The house takes the losers first, then the winners come home.
	_sweep_losers(won)
	await get_tree().create_timer(0.4).timeout
	for pb: Dictionary in r["perBet"]:
		if pb["won"]:
			var k: String = Board.key_of(pb["bet"]["type"], pb["bet"]["target"])
			den.fly_chips(_board.cell_center(k), float(pb["payout"]))
			_board.shown.erase(k)
	if float(r["net"]) >= stake * 5.0:
		den.burst(_board.cell_center(won[0]) if not won.is_empty() else _board.get_global_rect().get_center(), 14)
	_board.queue_redraw()
	_last = _bets.duplicate(true)
	den.roll_chips(chips - stake, float(r["chipsAfter"]))
	await get_tree().create_timer(1.6).timeout
	_bets.clear()
	_board.shown.clear()
	_board.won = []
	_board.result = -1
	_changed()
	_busy = false
	_spin_b.disabled = false


## The losing chips swept off the felt toward the house (past the board's top
## edge), and gone from their spots.
func _sweep_losers(won: Array) -> void:
	var house: Vector2 = _board.get_global_rect().position + Vector2(_board.size.x * 0.5, -60.0)
	for k: String in _board.shown.keys():
		if won.has(k):
			continue
		den.sweep_chips(_board.cell_center(k), house, float(_board.shown[k]))
		_board.shown.erase(k)
	_board.queue_redraw()


## The spin, seen: the view leans in to the wheel while it turns, then eases
## back once the ball is down.
func _turn_wheel(n: int) -> void:
	Sound.cast()
	_wheel.pivot_offset = Vector2(_wheel.size.x / 2.0, (_wheel.size.y - 34.0) / 2.0)
	var lean: Tween = _wheel.create_tween()
	lean.tween_property(_wheel, "scale", Vector2.ONE * LEAN, 0.7).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	await _wheel.spin_to(n)
	var back: Tween = _wheel.create_tween()
	back.tween_interval(0.5)
	back.tween_property(_wheel, "scale", Vector2.ONE, 0.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


static func _pocket_name(n: int) -> String:
	for p: Dictionary in Casino.c()["pockets"]:
		if int(p["number"]) == n:
			return str(p["name"])
	return ""


static func pocket_color(n: int) -> Color:
	var c: String = Casino.color_of(float(n))
	return POCKET_GREEN if c == "green" else (POCKET_RED if c == "red" else POCKET_BLACK)


## THE WHEEL, flat: a dark rim and the ball's track, the pockets in the real
## order round it with cream frets and numbers, the felt-green cone, and a
## cream hub. Spun, the wheel turns down from speed while the ball runs the
## other way on the track, drops inward, skitters across a pocket or two and
## settles; the pocket is ringed and its fish rises in the hub.
class Wheel:
	extends Control
	var angle: float = 0.0
	var recent: Array = []
	var _ball_rel: float = 0.0
	var _ball_r: float = 1.0
	var _ball_on: bool = false
	var _hub_fish: Texture2D = null
	var _hub_k: float = 0.0
	var _result: int = -1

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _pocket_angle(n: int) -> float:
		var i: int = DenRoulette.ORDER.find(n)
		return TAU * float(i) / DenRoulette.ORDER.size()

	func spin_to(n: int) -> void:
		_hub_k = 0.0
		_hub_fish = null
		_result = -1
		_ball_on = true
		var a0: float = angle
		var turns: float = TAU * 2.6
		var target_rel: float = _pocket_angle(n)
		var rel0: float = target_rel + TAU * 5.0
		var pw: float = TAU / DenRoulette.ORDER.size()
		var dur: float = 5.2
		var tw: Tween = create_tween()
		var clack: Array = [0.0, false]
		tw.tween_method(func(u: float) -> void:
			angle = a0 + turns * (1.0 - pow(1.0 - u, 2.6))
			# The ball runs the other way round the track, slowing onto its
			# pocket's neighbourhood.
			var v: float = minf(u / 0.78, 1.0)
			var rel: float = target_rel + (rel0 - target_rel) * pow(1.0 - v, 2.6)
			# It leaves the track and falls toward the pockets...
			var drop: float = clampf((u - 0.5) / 0.22, 0.0, 1.0)
			var r: float = 1.0 - drop * drop
			# ...and skitters: a hop over two pockets, back one, then rest.
			var s: float = clampf((u - 0.7) / 0.24, 0.0, 1.0)
			if s > 0.0:
				rel += pw * 2.4 * sin(s * PI * 2.5) * pow(1.0 - s, 2.0)
				r += absf(sin(s * PI * 5.0)) * pow(1.0 - s, 1.5) * 0.28
			_ball_rel = rel
			_ball_r = r
			if s > 0.0 and s < 0.95 and u - float(clack[0]) > 0.03:
				clack[0] = u
				Sound.xp_tick()
			if u > 0.55 and not clack[1]:
				clack[1] = true
				Sound.reel_clicks(1.4)
			queue_redraw(), 0.0, 1.0, dur)
		await tw.finished
		Rumble.buzz([0, 30])
		_result = n
		_hub_fish = Skipper.fish_thumb(DenRoulette._pocket_name(n)) if n != 0 else null
		recent.push_front(float(n))
		if recent.size() > 12:
			recent.resize(12)
		var hk: Tween = create_tween()
		hk.tween_method(func(k: float) -> void:
			_hub_k = k
			queue_redraw(), 0.0, 1.0, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	func _draw() -> void:
		var d: float = minf(size.x, size.y - 34.0)
		var c: Vector2 = Vector2(size.x / 2.0, d / 2.0)
		var R: float = d / 2.0 - 2.0
		var f: Font = Kit.font("cinzel", 700)
		var cream: Color = DenRoom.CREAM
		# The rim and the ball's track, flat.
		draw_circle(c, R, Color(0.07, 0.085, 0.085))
		draw_circle(c, R * 0.955, Color(0.17, 0.19, 0.19))
		draw_arc(c, R * 0.885, 0.0, TAU, 96, Color(cream, 0.35), 1.5, true)
		var n: int = DenRoulette.ORDER.size()
		var r_out: float = R * 0.87
		var r_in: float = R * 0.6
		var fs: int = clampi(int(R * 0.075), 10, 22)
		for i: int in n:
			var a0: float = angle + TAU * i / n - PI / 2.0 - TAU / n / 2.0
			var a1: float = a0 + TAU / n
			var pts: PackedVector2Array = PackedVector2Array()
			for k: int in 6:
				pts.append(c + Vector2.from_angle(lerpf(a0, a1, k / 5.0)) * r_out)
			for k: int in 6:
				pts.append(c + Vector2.from_angle(lerpf(a1, a0, k / 5.0)) * r_in)
			var num: int = int(DenRoulette.ORDER[i])
			draw_colored_polygon(pts, DenRoulette.pocket_color(num))
			draw_line(c + Vector2.from_angle(a0) * r_in, c + Vector2.from_angle(a0) * r_out, Color(cream, 0.7), 1.5, true)
			# The number, upright along its pocket.
			var am: float = (a0 + a1) / 2.0
			var label: String = str(num)
			var at: Vector2 = c + Vector2.from_angle(am) * (r_out - fs * 1.05)
			draw_set_transform(at, am + PI / 2.0, Vector2.ONE)
			var w: float = f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			draw_string(f, Vector2(-w / 2.0, fs * 0.35), label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, cream)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			if num == _result:
				# The pocket that took the ball, ringed in gold.
				var ring: PackedVector2Array = pts.duplicate()
				ring.append(pts[0])
				draw_polyline(ring, DenRoom.WIN, 3.0, true)
		# The pockets' inner wall, then the cone in the felt's green.
		draw_arc(c, r_in, 0.0, TAU, 96, Color(cream, 0.7), 2.0, true)
		draw_circle(c, r_in - 1.0, DenRoom.FELT_DEEP)
		draw_arc(c, r_in * 0.7, 0.0, TAU, 72, Color(cream, 0.22), 1.5, true)
		# The turret: four cream spokes turning with the wheel, round a cream hub.
		var hub: float = r_in * 0.46
		for k: int in 4:
			var a: float = angle + k * PI / 2.0
			draw_line(c + Vector2.from_angle(a) * hub, c + Vector2.from_angle(a) * r_in * 0.92, Color(cream, 0.6), maxf(2.0, R * 0.012), true)
		draw_circle(c, hub, Color(0.93, 0.89, 0.8))
		if _hub_fish != null and _hub_k > 0.0:
			var sz: Vector2 = _hub_fish.get_size()
			var sc: float = minf(hub * 1.7 / sz.x, hub * 1.5 / sz.y) * _hub_k
			draw_texture_rect(_hub_fish, Rect2(c - sz * sc / 2.0, sz * sc), false)
		# The ball.
		if _ball_on:
			var br: float = lerpf(r_in + (r_out - r_in) * 0.32, R * 0.92, clampf(_ball_r, 0.0, 1.3))
			var bp: Vector2 = c + Vector2.from_angle(angle + _ball_rel - PI / 2.0) * br
			var bs: float = maxf(6.0, R * 0.032)
			draw_circle(bp + Vector2(0, bs * 0.3), bs, Color(0, 0, 0, 0.3))
			draw_circle(bp, bs, Color(0.98, 0.97, 0.94))
		# The last numbers, as beads under the wheel.
		var shown: int = mini(recent.size(), 10)
		for k: int in shown:
			var p: Vector2 = Vector2(c.x - (shown - 1) * 13.0 + k * 26.0, size.y - 13.0)
			draw_circle(p, 11.0, DenRoulette.pocket_color(int(recent[k])))
			if k == 0:
				draw_arc(p, 12.5, 0.0, TAU, 24, Color(cream, 0.8), 1.5, true)
			var s: String = str(int(recent[k]))
			var sw: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
			draw_string(f, p + Vector2(-sw / 2.0, 4.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, cream)


## THE BOARD, printed on the felt: the numbers three rows deep like a real
## table (red and black filled, cream lines), zero on the left, the columns'
## "2 to 1" on the right, then the dozens and the even bets. Press to place;
## chips stack where they lie, taller with each; after the spin the winning
## number and the spots that paid light up gold.
class Board:
	extends Control
	var owner_table: DenRoulette
	var bets: Dictionary = {}
	## The chips on each spot as they have landed (bets fly before they show).
	var shown: Dictionary = {}
	## The other captains' chips at a shared wheel: [{ color, bets }].
	var others: Array = []:
		set(v):
			others = v
			_index_others()
	## The others' chips by spot key, built once per table push so a redraw
	## looks them up instead of stringifying every bet for every spot.
	var _others_at: Dictionary = {}
	var won: Array = []:
		set(v):
			won = v
			set_process(not won.is_empty())
	var result: int = -1
	var _cells: Array = []
	## The spot under the pointer: its numbers glow, so an edge bet shows
	## what it covers before a chip goes down.
	var _hover: Dictionary = {}
	## A spot that just took a chip, and how fresh the landing is (it settles).
	var _landed: String = ""
	var _land_k: float = 0.0
	var _t: float = 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		set_process(false)
		resized.connect(_layout)
		_layout()
		get_tree().process_frame.connect(queue_redraw, CONNECT_ONE_SHOT)

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	## A spot's key ("type|target"), as the bets are keyed.
	static func key_of(type: Variant, target: Variant) -> String:
		return "%s|%s" % [type, JsJson.stringify(target)]

	## A chip landed on a spot: the pile there gives under it.
	func land(key: String) -> void:
		_landed = key
		var tw: Tween = create_tween()
		tw.tween_method(func(k: float) -> void:
			_land_k = k
			queue_redraw(), 1.0, 0.0, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	func _index_others() -> void:
		_others_at.clear()
		for o: Dictionary in others:
			for ob: Dictionary in o["bets"]:
				var k: String = key_of(ob["type"], ob["target"])
				if not _others_at.has(k):
					_others_at[k] = []
				(_others_at[k] as Array).append([o["color"], float(ob["amount"])])

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
		# THE INSIDE BETS on the lines between numbers (Kong, 2026-10-03): a
		# split on the line between two, a corner where four meet, a street
		# on the bottom edge under its column, a line where two streets
		# meet on that edge. Small spots, tested before the numbers.
		var z: float = clampf(rh * 0.22, 14.0, 26.0)
		for i: int in 12:
			var x0: float = zero_w + i * cw
			for row: int in 3:
				var n: int = i * 3 + (3 - row)
				if row < 2:
					_cells.append({ "r": Rect2(x0 + cw * 0.25, (row + 1) * rh - z / 2.0, cw * 0.5, z), "type": "split", "target": [float(n - 1), float(n)], "zone": true })
				if i < 11:
					_cells.append({ "r": Rect2(x0 + cw - z / 2.0, row * rh + rh * 0.25, z, rh * 0.5), "type": "split", "target": [float(n), float(n + 3)], "zone": true })
				if row < 2 and i < 11:
					var a: int = i * 3 + 2 - row
					_cells.append({ "r": Rect2(x0 + cw - z / 2.0, (row + 1) * rh - z / 2.0, z, z), "type": "corner", "target": [float(a), float(a + 1), float(a + 3), float(a + 4)], "zone": true })
			_cells.append({ "r": Rect2(x0 + cw * 0.25, rh * 3.0 - z / 2.0, cw * 0.5, z), "type": "street", "target": float(i + 1), "zone": true })
			if i < 11:
				_cells.append({ "r": Rect2(x0 + cw - z / 2.0, rh * 3.0 - z / 2.0, z, z), "type": "line", "target": float(i + 1), "zone": true })
		var y2: float = rh * 3.0
		var dh: float = h * 0.19
		for d: int in 3:
			_cells.append({ "r": Rect2(zero_w + d * cw * 4.0, y2, cw * 4.0, dh), "type": "dozen", "target": float(d + 1), "text": ["1st 12", "2nd 12", "3rd 12"][d], "col": Color(0, 0, 0, 0) })
		var y3: float = y2 + dh
		var ow: float = cw * 2.0
		var outs: Array = [["half", "low", "1 to 18"], ["parity", "even", "Even"], ["color", "red", "Red"], ["color", "black", "Black"], ["parity", "odd", "Odd"], ["half", "high", "19 to 36"]]
		for k: int in outs.size():
			var o: Array = outs[k]
			_cells.append({ "r": Rect2(zero_w + k * ow, y3, ow, h - y3), "type": o[0], "target": o[1], "text": o[2], "col": Color(0, 0, 0, 0) })
		# Each spot's key, once per layout (not once per redraw).
		for cell: Dictionary in _cells:
			cell["key"] = key_of(cell["type"], cell["target"])
		queue_redraw()

	## A spot's middle on the screen, by its key ("type|target").
	func cell_center(key: String) -> Vector2:
		for cell: Dictionary in _cells:
			if cell["key"] == key:
				return get_global_transform() * _chip_spot(cell)
		return get_global_rect().get_center()

	## Where a spot's chips stand: the middle of an edge spot; off to the side
	## of a printed spot's words.
	func _chip_spot(cell: Dictionary) -> Vector2:
		var r: Rect2 = cell["r"]
		if cell.get("zone", false):
			return r.get_center()
		return r.get_center() + Vector2(r.size.x * 0.2, r.size.y * 0.12)

	## The spot at a point: the small edge spots first, then the rest.
	func _cell_at(p: Vector2) -> Dictionary:
		for cell: Dictionary in _cells:
			if cell.get("zone", false) and (cell["r"] as Rect2).has_point(p):
				return cell
		for cell: Dictionary in _cells:
			if not cell.get("zone", false) and (cell["r"] as Rect2).has_point(p):
				return cell
		return {}

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseMotion:
			var hc: Dictionary = _cell_at((event as InputEventMouseMotion).position)
			if hc != _hover:
				_hover = hc
				queue_redraw()
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
			var cell: Dictionary = _cell_at((event as InputEventMouseButton).position)
			if not cell.is_empty():
				owner_table.place(cell["type"], cell["target"])
				accept_event()

	func _notification(what: int) -> void:
		if what == NOTIFICATION_MOUSE_EXIT and not _hover.is_empty():
			_hover = {}
			queue_redraw()

	func _chip_w() -> float:
		var cw: float = (size.x * 0.85) / 12.0
		var rh: float = size.y * 0.62 / 3.0
		return clampf(minf(cw, rh) * 0.62, 20.0, 46.0)

	func _draw() -> void:
		var f: Font = Kit.font("cinzel", 700)
		var small: Font = Kit.font("karla", 700)
		var line: Color = DenRoom.FELT_LINE
		var cream: Color = DenRoom.CREAM
		var rh: float = size.y * 0.62 / 3.0
		var big_fs: int = clampi(int(rh * 0.3), 14, 30)
		var small_fs: int = clampi(int(rh * 0.2), 12, 18)
		var pulse: float = 0.5 + 0.5 * sin(_t * 5.0)
		for cell: Dictionary in _cells:
			if cell.get("zone", false):
				continue
			var r: Rect2 = cell["r"]
			var key: String = cell["key"]
			var colr: Color = cell["col"]
			if colr.a > 0.0:
				draw_rect(r.grow(-4), colr)
			var lit: bool = won.has(key) or (cell["type"] == "straight" and int(cell["target"]) == result)
			if lit:
				draw_rect(r.grow(-2), Color(DenRoom.WIN, 0.35 + 0.3 * pulse))
				draw_rect(r.grow(-2), DenRoom.WIN, false, 2.5)
			elif not _hover.is_empty() and cell["type"] == "straight" and Casino.is_winner({ "type": _hover["type"], "target": _hover["target"] }, float(cell["target"])):
				draw_rect(r.grow(-2), Color(cream, 0.18))
			elif _hover == cell:
				draw_rect(r.grow(-2), Color(cream, 0.1))
			draw_rect(r, line, false, 1.5)
			var big: bool = cell["type"] == "straight"
			var fnt: Font = f if big else small
			var fs: int = big_fs if big else small_fs
			var label: String = str(cell["text"])
			# Red and black are shown, not written: a diamond of each colour.
			if cell["type"] == "color":
				var dc: Vector2 = r.get_center()
				var dw: float = minf(r.size.x * 0.24, r.size.y * 0.5)
				var dia: PackedVector2Array = PackedVector2Array([dc + Vector2(-dw, 0), dc + Vector2(0, -dw * 0.55), dc + Vector2(dw, 0), dc + Vector2(0, dw * 0.55)])
				draw_colored_polygon(dia, DenRoulette.POCKET_RED if cell["target"] == "red" else DenRoulette.POCKET_BLACK)
				dia.append(dia[0])
				draw_polyline(dia, line, 1.5, true)
			else:
				var tw: float = fnt.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
				draw_string(fnt, r.get_center() + Vector2(-tw / 2.0, fs * 0.35), label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, cream)
		# The board's outer line, a little heavier.
		draw_rect(Rect2(Vector2.ZERO, size), Color(cream, 0.6), false, 2.0)
		# The chips: on the printed spots, then the edge spots over the lines
		# (shown only when pointed at, won, or holding chips).
		for cell: Dictionary in _cells:
			if not cell.get("zone", false):
				_chips_at(cell)
		for cell: Dictionary in _cells:
			if not cell.get("zone", false):
				continue
			var zr: Rect2 = cell["r"]
			var zk: String = cell["key"]
			if _hover == cell:
				draw_circle(zr.get_center(), 7.0, Color(cream, 0.85))
			if won.has(zk):
				draw_circle(zr.get_center(), 11.0, Color(DenRoom.WIN, 0.55 + 0.35 * pulse))
			_chips_at(cell)

	## The chips on a spot: the others' ringed in their colours, then yours as
	## a pile that grows with every chip, its total over it.
	func _chips_at(cell: Dictionary) -> void:
		var key: String = cell["key"]
		var spot: Vector2 = _chip_spot(cell)
		var w: float = _chip_w()
		var oi: int = 0
		for oc: Array in _others_at.get(key, []):
			var op: Vector2 = spot + Vector2(-w * 0.75 - oi * w * 0.3, 0)
			draw_circle(op + Vector2(0, w * 0.05), w * 0.46, oc[0])
			DenRoom.draw_pile(self, op + Vector2(0, w * 0.42), float(oc[1]), w * 0.8, 5, 5)
			oi += 1
		var amt: float = float(shown.get(key, 0.0))
		if amt <= 0.0:
			return
		var give: float = _land_k if key == _landed else 0.0
		var base: Vector2 = spot + Vector2(0, w * 0.42)
		draw_set_transform(base, 0.0, Vector2(1.0 + give * 0.06, 1.0 - give * 0.08))
		DenRoom.draw_pile(self, Vector2.ZERO, amt, w, 8, 8)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		var at: String = Js.thousands(amt)
		var top: float = base.y - DenRoom.pile_height(amt, w, 8, 8)
		Kit.sea_string(self, Kit.font("karla", 800), Vector2(spot.x - 40.0, top + 2.0), at, 12, DenRoom.CREAM, HORIZONTAL_ALIGNMENT_CENTER, 80.0)
