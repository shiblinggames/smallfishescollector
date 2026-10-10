class_name DenSlots
extends Control
## FISH SLOTS (Godot port of app/(app)/tavern/SlotMachine.tsx, made to move).
## On the Den's felt (THE DEN AS A PLACE, 2026-10-10): a flat cabinet of the
## night paper standing on the felt, three clean paper windows in it, a coin
## slot and a payout tray; the pays printed on the felt beside it. Pick a chip
## and spin: the stake slides from your pile into the slot, the reels kick back
## and run fast (each picture stretched along its run with ghost copies), then
## stop one at a time left to right with a small overshoot and a knock. The
## line that pays lights across the windows; a bigger win throws a small burst
## of chips out of the tray and the winnings slide to your pile. Three hooks
## spin the bonus round (the Jellyfish is wild, wins pay half again); three
## catfish pay 300 times the bet. Space spins.

const SYMS: Dictionary = {
	"common": "card-arts/Sardine_v2.webp", "rare": "card-arts/Blue_Marlin.webp", "shark": "card-arts/Great_White_Shark.webp",
	"legendary": "card-arts/Blue_Whale_v2.webp", "catfish": "card-arts/Catfish.webp", "anchor": "den/hook.png", "wild": "card-arts/Jellyfish.webp",
}
## The cabinet: the night paper, a shade lighter at its windows' surround.
const CAB: Color = Paper.NIGHT_PAPER
const CAB_WELL: Color = Paper.NIGHT_PAPER_DEEP

var session: Session
var den: DenRoom
var _bet: float = 25.0
var _reels: Array = []
var _cab: Cabinet
var _spin_b: Button
var _says: Label
var _sub: Label
var _bets_row: HBoxContainer
var _ctl: HBoxContainer
var _pays: VBoxContainer
var _busy: bool = false


func _ready() -> void:
	_cab = Cabinet.new()
	add_child(_cab)
	for i: int in 3:
		var r: Reel = Reel.new()
		_cab.add_child(r)
		_reels.append(r)
	_cab.line = Payline.new()
	_cab.add_child(_cab.line)
	var jp: float = Casino.fixed_jackpot()
	_cab.marquee = "Three catfish pay %d times your bet" % int(jp) if jp > 0.0 else "Three catfish win the pot"
	_says = DenRoom.says(_cab, "", "title", DenRoom.CREAM)
	_says.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sub = DenRoom.says(_cab, "", "body_strong", DenRoom.CREAM_SOFT)
	_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# The stake and the lever, along the foot of the felt.
	_ctl = HBoxContainer.new()
	_ctl.add_theme_constant_override("separation", 14)
	_ctl.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(_ctl)
	_bets_row = HBoxContainer.new()
	_bets_row.add_theme_constant_override("separation", 2)
	_ctl.add_child(_bets_row)
	_paint_bets()
	_spin_b = DenRoom.primary("Spin   ·   Space")
	_spin_b.custom_minimum_size = Vector2(230, 56)
	_spin_b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_spin_b.pressed.connect(spin)
	_ctl.add_child(_spin_b)
	_pays = VBoxContainer.new()
	_pays.add_theme_constant_override("separation", 6)
	add_child(_pays)
	_paytable()
	resized.connect(_layout)
	_layout()


## The cabinet as big as the felt allows (a little wider than tall), the pays
## beside it, the stake and the lever under it.
func _layout() -> void:
	var w: float = size.x
	var h: float = size.y
	if w < 10.0 or h < 10.0:
		return
	var ctl_h: float = 70.0
	_ctl.position = Vector2(0, h - ctl_h)
	_ctl.size = Vector2(w, ctl_h)
	var pay_w: float = clampf(w * 0.27, 260.0, 400.0)
	var ch: float = h - ctl_h - 10.0
	var cw: float = minf(ch * 1.3, w - pay_w - 60.0)
	var x0: float = (w - cw - pay_w - 48.0) / 2.0
	_cab.position = Vector2(x0, 0)
	_cab.size = Vector2(cw, ch)
	_pays.position = Vector2(x0 + cw + 48.0, maxf(0.0, (ch - _pays.get_combined_minimum_size().y) / 2.0))
	_pays.size = Vector2(pay_w, 0)
	# Inside the cabinet: the marquee, the windows, the words, the tray.
	var pad: float = cw * 0.05
	var top: float = 70.0
	var win_h: float = clampf(ch - top - 130.0, 120.0, cw * 0.52)
	var gap: float = cw * 0.025
	var rw: float = (cw - pad * 2.0 - gap * 2.0) / 3.0
	for i: int in 3:
		var r: Reel = _reels[i]
		r.position = Vector2(pad + i * (rw + gap), top)
		r.size = Vector2(rw, win_h)
	_cab.windows = Rect2(pad, top, cw - pad * 2.0, win_h)
	_cab.line.position = Vector2(pad - 10.0, top)
	_cab.line.size = Vector2(cw - pad * 2.0 + 20.0, win_h)
	_says.position = Vector2(0, top + win_h + 14.0)
	_says.size = Vector2(cw, 32)
	_sub.position = Vector2(0, top + win_h + 48.0)
	_sub.size = Vector2(cw, 22)
	_cab.queue_redraw()


func _paint_bets() -> void:
	for c: Node in _bets_row.get_children():
		c.queue_free()
	DenRoom.stake_row(_bets_row, _bet, func(b: float) -> void:
		_bet = b
		_paint_bets())


## The pays, printed on the felt beside the machine: each fish, its name and
## what it pays.
func _paytable() -> void:
	DenRoom.says(_pays, "The pays", "eyebrow", DenRoom.CREAM_SOFT)
	var c: Dictionary = Casino.c()
	for s: Dictionary in c["symbols"]:
		var id: String = s["id"]
		var pay: String = ""
		if id == "catfish":
			pay = "3 for %dx" % int(Casino.fixed_jackpot()) if Casino.fixed_jackpot() > 0.0 else "3 for the pot"
			if Js.num((c["pairPayouts"] as Dictionary).get(id)) > 0.0:
				pay += ", 2 for %sx" % _x(float(c["pairPayouts"][id]))
		elif id == "anchor":
			pay = "3 for the bonus round, 2 for your bet back"
		elif id == "wild":
			pay = "Bonus round only: stands in for any fish"
		else:
			pay = "3 for %sx" % _x(float(c["payouts"][id]))
			if Js.num((c["pairPayouts"] as Dictionary).get(id)) > 0.0:
				pay += ", 2 for %sx" % _x(float(c["pairPayouts"][id]))
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		_pays.add_child(row)
		var pic: TextureRect = TextureRect.new()
		pic.texture = Skipper.tex(SYMS.get(id, ""))
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.custom_minimum_size = Vector2(46, 34)
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(pic)
		var words: VBoxContainer = VBoxContainer.new()
		words.add_theme_constant_override("separation", -2)
		words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(words)
		DenRoom.says(words, str(s["label"]), "label", DenRoom.CREAM)
		var p: Label = DenRoom.says(words, pay, "note", DenRoom.CREAM_SOFT)
		p.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		p.custom_minimum_size = Vector2(160, 0)


static func _x(v: float) -> String:
	return str(int(v)) if v == floor(v) else str(v)


## (The screenshot test: one spin.)
func play_for_shot() -> void:
	spin()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo and (event as InputEventKey).keycode == KEY_SPACE:
		get_viewport().set_input_as_handled()
		spin()


func _label(id: String) -> String:
	for s: Dictionary in Casino.c()["symbols"]:
		if s["id"] == id:
			return str(s["label"])
	return id


func spin() -> void:
	if _busy:
		return
	var chips: float = Js.num(session.profile().get("casino_chips"))
	if chips < _bet:
		den.toast("Not enough chips. Buy in above.", DenRoom.RED)
		return
	_busy = true
	_spin_b.disabled = true
	_says.text = ""
	_sub.text = ""
	_cab.line.lit = false
	for r: Reel in _reels:
		r.lit = false
	den.paint_purse(chips - _bet)
	den.fly_chips(Vector2.ZERO, _bet, false, _cab.slot_global())
	var r: Dictionary = await session.act("spinSlots", [_bet])
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)
		den.paint_purse()
		_busy = false
		_spin_b.disabled = false
		return
	session.persist()
	Sound.cast()
	await _run(r["reels"])
	var outcome: String = r["outcome"]
	if outcome == "bonus" and r.get("bonus") is Dictionary:
		var b: Dictionary = r["bonus"]
		_says.text = "Bonus round"
		Sound.bell()
		_pop(_says)
		_light(r["reels"], "anchor")
		await get_tree().create_timer(0.9).timeout
		for rr: Reel in _reels:
			rr.lit = false
		_cab.line.lit = false
		await _run(b["reels"])
		_show(String(b["outcome"]), float(b["payout"]), b.get("matchedSymbol"), b["reels"], true)
		_sub.text = "Your bet back, and %s" % ("nothing more" if float(b["payout"]) <= 0.0 else "%s more" % Js.thousands(float(b["payout"])))
		Motion.rise_word(_sub)
	else:
		_show(outcome, float(r["payout"]), r.get("matchedSymbol"), r["reels"], false)
	den.roll_chips(chips - _bet, float(r["newChips"]))
	_busy = false
	_spin_b.disabled = false


## The reels to these symbols, landing one after another, left to right.
func _run(target: Array) -> void:
	Sound.reel_clicks(0.85 + 0.38 * 2)
	for i: int in 3:
		(_reels[i] as Reel).spin_to(str(target[i]), 0.85 + 0.38 * i)
	await get_tree().create_timer(0.85 + 0.38 * 2 + 0.35).timeout


func _show(outcome: String, payout: float, sym: Variant, reels: Array, _bonus: bool) -> void:
	match outcome:
		"jackpot":
			_says.text = "Catfish Jackpot!   +%s" % Js.thousands(payout)
			for r: Reel in _reels:
				r.lit = true
			_cab.line.lit = true
			Sound.chest(true)
			Rumble.buzz([0, 60, 40, 80, 40, 120])
			den.burst(_cab.tray_global(), 30)
			den.fly_chips(_cab.tray_global(), payout)
		"win":
			_says.text = "Three %s!   +%s" % [_label(str(sym if sym != null else reels[0])), Js.thousands(payout)]
			_light(reels, str(sym if sym != null else reels[0]))
			Sound.chest(false)
			den.burst(_cab.tray_global(), 12)
			den.fly_chips(_cab.tray_global(), payout)
		"pair_win", "pair":
			_says.text = "Two %s   +%s" % [_label(str(sym)), Js.thousands(payout)]
			_light(reels, str(sym))
			Sound.perfect()
			den.fly_chips(_cab.tray_global(), payout)
		"refund":
			_says.text = "Two hooks: your bet back"
			_light(reels, "anchor")
			Sound.plip()
			den.fly_chips(_cab.tray_global(), payout)
		"near_miss":
			_says.text = "Two sardines. So close."
		_:
			_says.text = ""
	if _says.text != "":
		_pop(_says)


func _light(reels: Array, sym: String) -> void:
	var n: int = 0
	for i: int in 3:
		if reels[i] == sym or (reels[i] == "wild" and sym != "anchor"):
			(_reels[i] as Reel).lit = true
			n += 1
	_cab.line.lit = n >= 2


## What it came to, said: the words rise in (never a bounce on text).
func _pop(l: Label) -> void:
	Motion.rise_word(l)


## THE CABINET, flat: a slab of the night paper with a hairline, the marquee
## along its top, a coin slot at its right shoulder, the windows' surround,
## and the payout tray at its foot.
class Cabinet:
	extends Control
	var windows: Rect2 = Rect2()
	var marquee: String = ""
	var line: Payline

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _tray() -> Rect2:
		return Rect2(size.x * 0.3, size.y - 34.0, size.x * 0.4, 20.0)

	func _slot() -> Rect2:
		return Rect2(size.x - 54.0, 26.0, 8.0, 26.0)

	func tray_global() -> Vector2:
		return get_global_transform() * _tray().get_center()

	func slot_global() -> Vector2:
		return get_global_transform() * _slot().get_center()

	func _draw() -> void:
		var box: StyleBoxFlat = StyleBoxFlat.new()
		box.bg_color = DenSlots.CAB
		box.set_corner_radius_all(Kit.R_LARGE + 6)
		box.border_color = Color(Paper.NIGHT_INK, 0.14)
		box.set_border_width_all(1)
		draw_style_box(box, Rect2(Vector2.ZERO, size))
		# The marquee.
		var f: Font = Kit.font("cinzel", 800)
		Kit.sea_string(self, f, Vector2(0, 34.0), "Fish Slots", 24, Paper.NIGHT_INK, HORIZONTAL_ALIGNMENT_CENTER, size.x)
		var sf: Font = Kit.font("karla", 700)
		draw_string(sf, Vector2(0, 54.0), marquee.to_upper(), HORIZONTAL_ALIGNMENT_CENTER, size.x, 11, Color(Paper.NIGHT_GOLD, 0.85))
		# The coin slot.
		var s: Rect2 = _slot()
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = Color(0.02, 0.02, 0.02)
		sb.set_corner_radius_all(4)
		draw_style_box(sb, s.grow(5))
		draw_rect(s, Color(0, 0, 0))
		# The windows' surround.
		if windows.size.x > 0.0:
			var wb: StyleBoxFlat = StyleBoxFlat.new()
			wb.bg_color = DenSlots.CAB_WELL
			wb.set_corner_radius_all(Kit.R_LARGE)
			draw_style_box(wb, windows.grow(12))
		# The tray.
		var t: Rect2 = _tray()
		var tb: StyleBoxFlat = StyleBoxFlat.new()
		tb.bg_color = DenSlots.CAB_WELL
		tb.set_corner_radius_all(8)
		tb.border_color = Color(Paper.NIGHT_INK, 0.12)
		tb.set_border_width_all(1)
		draw_style_box(tb, t)


## THE LINE THAT PAYS: drawn across the three windows over the reels; lit, it
## glows gold and pulses, a bead at each end.
class Payline:
	extends Control
	var lit: bool = false:
		set(v):
			lit = v
			_t = 0.0
			set_process(v)
			queue_redraw()
	var _t: float = 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_process(false)

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		var y: float = size.y / 2.0
		if not lit:
			draw_circle(Vector2(4, y), 4.0, Color(DenRoom.CREAM, 0.35))
			draw_circle(Vector2(size.x - 4, y), 4.0, Color(DenRoom.CREAM, 0.35))
			return
		# It draws across from the left, then breathes.
		var run: float = clampf(_t / 0.25, 0.0, 1.0)
		var p: float = 0.5 + 0.5 * sin(_t * 6.0)
		var x1: float = lerpf(4.0, size.x - 4.0, run)
		draw_line(Vector2(4, y), Vector2(x1, y), Color(DenRoom.WIN, 0.25 + 0.15 * p), 12.0, true)
		draw_line(Vector2(4, y), Vector2(x1, y), DenRoom.WIN, 3.0, true)
		draw_circle(Vector2(4, y), 6.0, DenRoom.WIN)
		if run >= 1.0:
			draw_circle(Vector2(size.x - 4, y), 6.0, DenRoom.WIN)


## ONE REEL: a clean paper window with a strip of fish running through it.
## Spun, it kicks back a touch, runs a long strip fast (each picture stretched
## along its run, with ghost copies above and below), eases into the target
## and overshoots, then settles back with a knock.
class Reel:
	extends Control
	var lit: bool = false:
		set(v):
			lit = v
			set_process(v)
			queue_redraw()
	var _strip: Array = ["common", "rare", "catfish"]
	var _pos: float = 1.0
	var _speed: float = 0.0
	var _t: float = 0.0
	var _tex: Dictionary = {}

	func _ready() -> void:
		clip_contents = true
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_process(false)
		for k: String in DenSlots.SYMS:
			_tex[k] = Skipper.tex(DenSlots.SYMS[k])

	func spin_to(sym: String, dur: float) -> void:
		var n: int = 18 + int(dur * 10.0)
		var ids: Array = DenSlots.SYMS.keys().filter(func(k: String) -> bool: return k != "wild")
		var strip: Array = [ids[randi() % ids.size()], _strip[int(round(_pos)) % _strip.size()]]
		for i: int in n:
			strip.append(ids[randi() % ids.size()])
		strip.append(sym)
		strip.append(ids[randi() % ids.size()])
		_strip = strip
		_pos = 1.0
		var end: float = float(n + 2)
		var tw: Tween = create_tween()
		# The kick back, as a lever is pulled.
		tw.tween_method(_run_to, 1.0, 0.78, 0.1).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		tw.tween_method(_run_to, 0.78, end + 0.24, dur - 0.1).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
		tw.tween_method(func(p: float) -> void:
			_speed = 0.0
			_pos = p
			queue_redraw(), end + 0.24, end, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_callback(func() -> void:
			Sound.clunk()
			Rumble.tap(10))

	func _run_to(p: float) -> void:
		_speed = absf(p - _pos) * 60.0
		_pos = p
		queue_redraw()

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		draw_rect(r, Kit.PAPER.lightened(0.1))
		var h: float = size.y * 0.62
		var mid: float = size.y / 2.0
		var base: int = int(floor(_pos))
		var blur: float = clampf(_speed / 6.0, 0.0, 1.0)
		for k: int in range(base - 1, base + 3):
			if k < 0 or k >= _strip.size():
				continue
			var tex: Texture2D = _tex.get(_strip[k])
			if tex == null:
				continue
			var y: float = mid + (_pos - k) * h
			var sc: float = minf((size.x * 0.8) / tex.get_width(), (h * 0.85) / tex.get_height())
			var sz: Vector2 = tex.get_size() * sc
			var dim: float = 1.0 - clampf(absf(_pos - k) * 0.55, 0.0, 0.55)
			if blur > 0.05:
				# The smear: the picture stretched along its run, with ghosts.
				var st: Vector2 = Vector2(sz.x * (1.0 - blur * 0.12), sz.y * (1.0 + blur * 1.1))
				for g: int in 3:
					draw_texture_rect(tex, Rect2(Vector2((size.x - st.x) / 2.0, y - st.y / 2.0 + (g - 1) * blur * 26.0), st), false, Color(1, 1, 1, dim * (0.35 if g != 1 else 0.65)))
			else:
				draw_texture_rect(tex, Rect2(Vector2((size.x - sz.x) / 2.0, y - sz.y / 2.0), sz), false, Color(1, 1, 1, dim))
		# The rows above and below the line sit a shade back.
		draw_rect(Rect2(0, 0, size.x, size.y * 0.16), Color(0.1, 0.08, 0.06, 0.12))
		draw_rect(Rect2(0, size.y * 0.84, size.x, size.y * 0.16), Color(0.1, 0.08, 0.06, 0.12))
		if lit:
			var p: float = 0.5 + 0.5 * sin(_t * 6.0)
			draw_rect(r.grow(-3), Color(DenRoom.WIN, 0.6 + 0.4 * p), false, 5.0)
			draw_rect(r, Color(DenRoom.WIN, 0.08 + 0.06 * p))
		draw_rect(r, Color(0, 0, 0, 0.35), false, 1.0)
