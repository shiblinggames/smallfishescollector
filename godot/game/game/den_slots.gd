class_name DenSlots
extends Control
## FISH SLOTS (Godot port of app/(app)/tavern/SlotMachine.tsx, made to move).
## On the Den's felt (THE DEN AS A PLACE, 2026-10-10), a MACHINE, not paper
## (Kong, 2026-10-10: the night-paper cabinet with three cream windows "looks
## kinda weird in a paper format ... Doesn't look like slots"). A solid dark
## cabinet with a thin rim: a marquee head with the title, a row of round
## lights along its top and down its sides (they chase while the reels run,
## flash on a win, and a few glow slowly at rest), three reel windows, the
## stake and the last win as lit digit panels at its foot either side of the
## payout tray, and a lever on its right side. Each window shows a REAL REEL:
## a cream strip shaded darker toward the window's top and bottom so it reads
## as a drum turning, three fish on it (the one on the payline whole, the ones
## above and below cut by the window), always in that reel's own order.
## Pull the lever (click it, or drag it down), press Spin or Space: the lever
## travels down and springs back, the stake slides from your pile into the
## coin slot, the reels kick back and run fast (each picture stretched along
## its run with ghost copies), then stop one at a time left to right with a
## small overshoot and a knock, the result on the payline and its real
## neighbours above and below. The line that pays lights across the windows;
## a bigger win spills a small burst of chips over the tray's lip (sideways
## and down, clear of the words) and the winnings slide to your pile. The pays are printed
## on the felt beside the machine. Three hooks spin the bonus round (the
## Jellyfish is wild, wins pay half again); three catfish pay 300 times the
## bet. All flat and drawn in code: no painted art, no wood, no gloss.

const SYMS: Dictionary = {
	"common": "card-arts/Sardine_v2.webp", "rare": "card-arts/Blue_Marlin.webp", "shark": "card-arts/Great_White_Shark.webp",
	"legendary": "card-arts/Blue_Whale_v2.webp", "catfish": "card-arts/Catfish.webp", "anchor": "den/hook.png", "wild": "card-arts/Jellyfish.webp",
}
## THE REEL ORDER: what is printed on a strip, top to bottom. The rules roll
## each reel on its own (core/casino_slots.gd), so this is only what you see:
## a reel lands on its symbol where the strip carries it, and its neighbours
## are the strip's. Each reel starts the order at a different place, so the
## three never read alike. (The wild is not printed; in the bonus round it is
## laid onto the strip where it lands.)
const ORDER: Array = ["common", "anchor", "rare", "common", "shark", "legendary", "common", "catfish", "rare", "anchor", "common", "shark"]
## The cabinet: a deep navy ink, its rim a shade lighter, its wells darker.
const CAB: Color = Color(0.075, 0.09, 0.13)
const CAB_RIM: Color = Color(0.22, 0.26, 0.34)
const CAB_WELL: Color = Color(0.035, 0.045, 0.07)
const CAB_HEAD: Color = Color(0.1, 0.12, 0.175)
## A lit lamp, a lamp off, and the warm digits of a readout.
const LAMP_ON: Color = Color(1.0, 0.84, 0.42)
const LAMP_OFF: Color = Color(0.28, 0.25, 0.2)
const DIGIT: Color = Color(1.0, 0.7, 0.32)

var session: Session
var den: DenRoom
var _bet: float = 25.0
var _reels: Array = []
var _cab: Cabinet
var _lever: Lever
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
		var o: Array = ORDER.slice(i * 4) + ORDER.slice(0, i * 4)
		r.order = o
		_cab.add_child(r)
		_reels.append(r)
	_cab.line = Payline.new()
	_cab.add_child(_cab.line)
	_cab.lights = Lights.new()
	_cab.add_child(_cab.lights)
	_cab.lights.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var jp: float = Casino.fixed_jackpot()
	_cab.marquee = "Three catfish pay %d times your bet" % int(jp) if jp > 0.0 else "Three catfish win the pot"
	_cab.bet_shown = _bet
	# What it came to, under the windows. The tray's chips spill out sideways
	# and down (DenRoom.burst's spill), never up across these words.
	_says = Kit.lift(DenRoom.says(_cab, "", "title", DenRoom.CREAM))
	_says.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sub = Kit.lift(DenRoom.says(_cab, "", "body_strong", DenRoom.CREAM_SOFT))
	_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_lever = Lever.new()
	_lever.pulled.connect(func() -> void: spin(true))
	add_child(_lever)
	# The stake and the Spin button, along the foot of the felt.
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
	_spin_b.pressed.connect(func() -> void: spin())
	_ctl.add_child(_spin_b)
	_pays = VBoxContainer.new()
	_pays.add_theme_constant_override("separation", 6)
	add_child(_pays)
	_paytable()
	resized.connect(_layout)
	_layout()


## The machine as big as the felt allows (a little wider than tall), its
## lever on its right side, the pays beside it, the stake and Spin under it.
func _layout() -> void:
	var w: float = size.x
	var h: float = size.y
	if w < 10.0 or h < 10.0:
		return
	var ctl_h: float = 70.0
	_ctl.position = Vector2(0, h - ctl_h)
	_ctl.size = Vector2(w, ctl_h)
	var pay_w: float = clampf(w * 0.25, 250.0, 380.0)
	var lever_w: float = 64.0
	var ch: float = h - ctl_h - 10.0
	var cw: float = minf(ch * 1.3, w - pay_w - lever_w - 70.0)
	var x0: float = (w - cw - lever_w - pay_w - 40.0) / 2.0
	_cab.position = Vector2(x0, 0)
	_cab.size = Vector2(cw, ch)
	_pays.position = Vector2(x0 + cw + lever_w + 40.0, maxf(0.0, (ch - _pays.get_combined_minimum_size().y) / 2.0))
	_pays.size = Vector2(pay_w, 0)
	# Inside: the marquee head, the windows, the words, the readouts and tray.
	var pad: float = maxf(44.0, cw * 0.06)
	var top: float = 118.0
	var win_h: float = clampf(ch - top - 156.0, 130.0, cw * 0.5)
	var gap: float = cw * 0.022
	var rw: float = (cw - pad * 2.0 - gap * 2.0) / 3.0
	for i: int in 3:
		var r: Reel = _reels[i]
		r.position = Vector2(pad + i * (rw + gap), top)
		r.size = Vector2(rw, win_h)
	_cab.windows = Rect2(pad, top, cw - pad * 2.0, win_h)
	_cab.line.position = Vector2(pad - 14.0, top)
	_cab.line.size = Vector2(cw - pad * 2.0 + 28.0, win_h)
	_says.position = Vector2(0, top + win_h + 16.0)
	_says.size = Vector2(cw, 32)
	_sub.position = Vector2(0, top + win_h + 48.0)
	_sub.size = Vector2(cw, 22)
	# The lever stands off the cabinet's right side, its mount at the reels.
	_lever.position = Vector2(x0 + cw - 4.0, top - 50.0)
	_lever.size = Vector2(lever_w, win_h + 90.0)
	_lever.pivot_y = 50.0 + win_h * 0.62
	_lever.queue_redraw()
	_cab.queue_redraw()
	_cab.lights.queue_redraw()


func _paint_bets() -> void:
	for c: Node in _bets_row.get_children():
		c.queue_free()
	DenRoom.stake_row(_bets_row, _bet, func(b: float) -> void:
		_bet = b
		if _cab != null and not _busy:
			_cab.bet_shown = b
			_cab.queue_redraw()
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


## One spin. `from_lever`: the lever was pulled by hand and is already down
## (it springs back by itself); from Spin or Space the lever swings too, so
## every spin reads as a pull.
func spin(from_lever: bool = false) -> void:
	if _busy:
		return
	var chips: float = Js.num(session.profile().get("casino_chips"))
	if chips < _bet:
		den.toast("Not enough chips. Buy in above.", DenRoom.RED)
		return
	_busy = true
	_lever.locked = true
	if not from_lever:
		_lever.swing()
	_spin_b.disabled = true
	_says.text = ""
	_sub.text = ""
	_cab.line.lit = false
	_cab.bet_shown = _bet
	_cab.set_win(0.0, false)
	for r: Reel in _reels:
		r.lit = false
	den.paint_purse(chips - _bet)
	den.fly_chips(Vector2.ZERO, _bet, false, _cab.slot_global())
	var r: Dictionary = await session.act("spinSlots", [_bet])
	if r.has("error"):
		den.toast(str(r["error"]), DenRoom.RED)
		den.paint_purse()
		_busy = false
		_lever.locked = false
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
		_cab.lights.mode = Lights.FLASH
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
	# The WIN panel counts up to what came back (a bonus: the bet and more).
	_cab.set_win(float(r["payout"]), true)
	den.roll_chips(chips - _bet, float(r["newChips"]))
	_busy = false
	_lever.locked = false
	_spin_b.disabled = false


## The reels to these symbols, landing one after another, left to right; the
## lamps chase while they run.
func _run(target: Array) -> void:
	_cab.lights.mode = Lights.CHASE
	Sound.reel_clicks(0.85 + 0.38 * 2)
	for i: int in 3:
		(_reels[i] as Reel).spin_to(str(target[i]), 0.85 + 0.38 * i)
	await get_tree().create_timer(0.85 + 0.38 * 2 + 0.35).timeout
	_cab.lights.mode = Lights.IDLE


func _show(outcome: String, payout: float, sym: Variant, reels: Array, _bonus: bool) -> void:
	match outcome:
		"jackpot":
			_says.text = "Catfish Jackpot!   +%s" % Js.thousands(payout)
			for r: Reel in _reels:
				r.lit = true
			_cab.line.lit = true
			_cab.lights.mode = Lights.FLASH
			Sound.chest(true)
			Rumble.buzz([0, 60, 40, 80, 40, 120])
			den.burst(_cab.tray_global(), 30, true)
			den.fly_chips(_cab.tray_global(), payout)
		"win":
			_says.text = "Three %s!   +%s" % [_label(str(sym if sym != null else reels[0])), Js.thousands(payout)]
			_light(reels, str(sym if sym != null else reels[0]))
			_cab.lights.mode = Lights.FLASH
			Sound.chest(false)
			den.burst(_cab.tray_global(), 12, true)
			den.fly_chips(_cab.tray_global(), payout)
		"pair_win", "pair":
			_says.text = "Two %s   +%s" % [_label(str(sym)), Js.thousands(payout)]
			_light(reels, str(sym))
			_cab.lights.mode = Lights.FLASH
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


## THE CABINET, flat: a dark navy body with a thin lighter rim, a marquee
## head with the title lit warm, the windows' dark surround, and along its
## foot the BET readout, the payout tray (with the coin slot beside the bet)
## and the WIN readout.
class Cabinet:
	extends Control
	var windows: Rect2 = Rect2()
	var marquee: String = ""
	var line: Payline
	var lights: Lights
	var bet_shown: float = 0.0
	var win_shown: float = 0.0
	var _win_tw: Tween

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	## The marquee head, inside the ring of lamps.
	func head() -> Rect2:
		return Rect2(windows.position.x, 30.0, windows.size.x, 64.0)

	func _foot_y() -> float:
		return size.y - 72.0

	func _panel_w() -> float:
		return clampf(size.x * 0.2, 120.0, 170.0)

	func bet_rect() -> Rect2:
		return Rect2(windows.position.x, _foot_y(), _panel_w(), 54.0)

	func win_rect() -> Rect2:
		return Rect2(windows.end.x - _panel_w(), _foot_y(), _panel_w(), 54.0)

	func _tray() -> Rect2:
		var tw: float = minf(size.x * 0.28, win_rect().position.x - bet_rect().end.x - 80.0)
		return Rect2((size.x - tw) / 2.0, _foot_y() + 30.0, tw, 20.0)

	func _slot() -> Rect2:
		return Rect2(bet_rect().end.x + 18.0, _foot_y() + 12.0, 8.0, 30.0)

	func tray_global() -> Vector2:
		return get_global_transform() * _tray().get_center()

	func slot_global() -> Vector2:
		return get_global_transform() * _slot().get_center()

	## The WIN panel to `v`, counting up when `roll`.
	func set_win(v: float, roll: bool) -> void:
		if _win_tw != null and _win_tw.is_valid():
			_win_tw.kill()
		if not roll or v <= 0.0:
			win_shown = v
			queue_redraw()
			return
		_win_tw = Motion.count(self, 0.0, v, func(x: float) -> void:
			win_shown = round(x)
			queue_redraw(), false, 0.8)

	func _draw() -> void:
		var box: StyleBoxFlat = StyleBoxFlat.new()
		box.bg_color = DenSlots.CAB
		box.set_corner_radius_all(Kit.R_LARGE)
		box.border_color = DenSlots.CAB_RIM
		box.set_border_width_all(2)
		draw_style_box(box, Rect2(Vector2.ZERO, size))
		if windows.size.x <= 0.0:
			return
		# The marquee head: the title lit warm, the jackpot line under it.
		var hd: Rect2 = head()
		var hb: StyleBoxFlat = StyleBoxFlat.new()
		hb.bg_color = DenSlots.CAB_HEAD
		hb.set_corner_radius_all(Kit.R_LARGE)
		hb.border_color = Color(DenSlots.LAMP_ON, 0.22)
		hb.set_border_width_all(1)
		draw_style_box(hb, hd)
		var f: Font = Kit.font("cinzel", 800)
		draw_string(f, Vector2(hd.position.x, hd.position.y + 36.0), "FISH SLOTS", HORIZONTAL_ALIGNMENT_CENTER, hd.size.x, 28, DenSlots.LAMP_ON)
		var sf: Font = Kit.font("karla", 700)
		draw_string(sf, Vector2(hd.position.x, hd.position.y + 54.0), marquee.to_upper(), HORIZONTAL_ALIGNMENT_CENTER, hd.size.x, 11, Color(DenRoom.CREAM, 0.62))
		# The windows' surround.
		var wb: StyleBoxFlat = StyleBoxFlat.new()
		wb.bg_color = DenSlots.CAB_WELL
		wb.set_corner_radius_all(Kit.R_LARGE)
		draw_style_box(wb, windows.grow(10))
		# The readouts, the coin slot and the tray along the foot.
		_readout(bet_rect(), "BET", bet_shown)
		_readout(win_rect(), "WIN", win_shown)
		var s: Rect2 = _slot()
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = DenSlots.CAB_WELL
		sb.set_corner_radius_all(4)
		sb.border_color = DenSlots.CAB_RIM
		sb.set_border_width_all(1)
		draw_style_box(sb, s.grow(5))
		draw_rect(s, Color(0, 0, 0))
		var t: Rect2 = _tray()
		var tb: StyleBoxFlat = StyleBoxFlat.new()
		tb.bg_color = DenSlots.CAB_WELL
		tb.set_corner_radius_all(8)
		tb.border_color = DenSlots.CAB_RIM
		tb.set_border_width_all(1)
		draw_style_box(tb, t)

	## A LIT READOUT: a dark inset, its name small, the number in warm lit
	## digits in fixed cells (each cell's unlit 8 faint behind it, as a real
	## digit panel shows).
	func _readout(r: Rect2, tag: String, v: float) -> void:
		var pb: StyleBoxFlat = StyleBoxFlat.new()
		pb.bg_color = Color(0.02, 0.022, 0.03)
		pb.set_corner_radius_all(8)
		pb.border_color = DenSlots.CAB_RIM
		pb.set_border_width_all(1)
		draw_style_box(pb, r)
		var lf: Font = Kit.font("karla", 700)
		draw_string(lf, r.position + Vector2(10, 15), tag, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(DenRoom.CREAM, 0.5))
		var df: Font = Kit.font("karla", 800)
		var px: int = 26
		var cells: int = 6
		var cell: float = minf(px * 0.8, (r.size.x - 20.0) / cells)
		var digits: String = str(int(v))
		var x_end: float = r.end.x - 10.0
		var y: float = r.end.y - 9.0
		# Each glyph centred in its cell by hand (draw_string with a width
		# narrower than the glyph drops it).
		for k: int in cells:
			var cx: float = x_end - (cells - k) * cell
			_digit(df, cx, cell, y, "8", px, Color(DenSlots.DIGIT, 0.1))
			var di: int = k - (cells - digits.length())
			if di >= 0 and di < digits.length():
				_digit(df, cx, cell, y, digits[di], px, DenSlots.DIGIT)

	func _digit(f: Font, x: float, cell: float, y: float, ch: String, px: int, col: Color) -> void:
		var gw: float = f.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
		draw_string(f, Vector2(x + (cell - gw) / 2.0, y), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, px, col)


## THE LAMPS: small round lights along the cabinet's top and down both its
## sides. At rest a few glow slowly; while the reels run they CHASE around
## (one in four lit, stepping along); on a win they FLASH together for a
## couple of seconds, then settle back to rest.
class Lights:
	extends Control
	const IDLE: int = 0
	const CHASE: int = 1
	const FLASH: int = 2
	var mode: int = IDLE:
		set(v):
			mode = v
			_since = 0.0
	var _t: float = 0.0
	var _since: float = 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(delta: float) -> void:
		_t += delta
		_since += delta
		if mode == FLASH and _since > 2.4:
			mode = IDLE
		queue_redraw()

	## Each lamp's place, in chase order: across the top, then down both
	## sides together (a side's lamp k shares its step with the other's).
	func _lamps() -> Array:
		var out: Array = []
		var step: float = 26.0
		var n_top: int = maxi(2, int((size.x - 36.0) / step))
		var sx: float = (size.x - 36.0) / float(n_top - 1)
		for i: int in n_top:
			out.append([Vector2(18.0 + i * sx, 14.0), i])
		var n_side: int = maxi(0, int((size.y - 110.0) / step))
		for k: int in n_side:
			var y: float = 14.0 + (k + 1) * step
			out.append([Vector2(size.x - 14.0, y), n_top + k])
			out.append([Vector2(14.0, y), n_top + k])
		return out

	func _draw() -> void:
		if size.x < 40.0:
			return
		var flash_on: bool = int(_since * 6.0) % 2 == 0
		var head: int = int(_t * 16.0)
		for l: Array in _lamps():
			var p: Vector2 = l[0]
			var i: int = l[1]
			var b: float = 0.0
			match mode:
				CHASE:
					b = 1.0 if posmod(i - head, 4) == 0 else 0.0
				FLASH:
					b = 1.0 if flash_on else 0.15
				_:
					# At rest: one lamp in five breathes, each on its own beat.
					if i % 5 == 0:
						b = 0.35 + 0.35 * sin(_t * 1.4 + i * 0.9)
			if b > 0.05:
				draw_circle(p, 8.0, Color(DenSlots.LAMP_ON, 0.16 * b))
			draw_circle(p, 4.5, DenSlots.LAMP_OFF.lerp(DenSlots.LAMP_ON, b))


## THE LINE THAT PAYS: drawn across the middle row of the three windows,
## over the reels. At rest a faint line with a small pointer at each end;
## lit, it draws across gold and pulses, a bead at each end.
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
			draw_line(Vector2(14, y), Vector2(size.x - 14, y), Color(DenSlots.LAMP_ON, 0.28), 1.5, true)
			var c: Color = Color(DenSlots.LAMP_ON, 0.8)
			draw_colored_polygon(PackedVector2Array([Vector2(0, y - 7), Vector2(11, y), Vector2(0, y + 7)]), c)
			draw_colored_polygon(PackedVector2Array([Vector2(size.x, y - 7), Vector2(size.x - 11, y), Vector2(size.x, y + 7)]), c)
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


## ONE REEL: a window onto a cream strip on a drum. Three fish show: the one
## on the payline whole, the ones above and below cut by the window's edges,
## and the strip darkens toward the top and bottom as a drum turning away.
## The strip is the reel's `order`, repeating; `_pos` is the strip index on
## the payline (rising, the strip runs down). Spun, it kicks back a touch,
## runs fast (each picture stretched along its run, with ghost copies above
## and below), eases onto the cell carrying the result and overshoots, then
## settles back with a knock.
class Reel:
	extends Control
	var lit: bool = false:
		set(v):
			lit = v
			set_process(v)
			queue_redraw()
	var order: Array = DenSlots.ORDER
	var _pos: float = 0.0
	var _speed: float = 0.0
	var _t: float = 0.0
	## Symbols laid onto the strip where it lands that the strip does not
	## carry (the bonus round's wild): strip index to symbol.
	var _over: Dictionary = {}
	var _tex: Dictionary = {}

	func _ready() -> void:
		clip_contents = true
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_process(false)
		for k: String in DenSlots.SYMS:
			_tex[k] = Skipper.tex(DenSlots.SYMS[k])

	func sym_at(k: int) -> String:
		return _over.get(k, order[posmod(k, order.size())])

	func spin_to(sym: String, dur: float) -> void:
		var p0: int = int(round(_pos))
		for k: Variant in _over.keys():
			if int(k) < p0 - 3:
				_over.erase(k)
		# The first cell far enough on that carries the symbol.
		var t: int = p0 + 18 + int(dur * 10.0)
		var hit: int = -1
		for j: int in order.size():
			if order[posmod(t + j, order.size())] == sym:
				hit = t + j
				break
		if hit < 0:
			hit = t
			_over[hit] = sym
		var end: float = float(hit)
		var start: float = float(p0)
		_pos = start
		var tw: Tween = create_tween()
		# The kick back, as a lever is pulled.
		tw.tween_method(_run_to, start, start - 0.22, 0.1).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		tw.tween_method(_run_to, start - 0.22, end + 0.24, dur - 0.1).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
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
		draw_rect(r, Kit.PAPER.lightened(0.14))
		# A cell is 0.4 of the window: the middle whole, a part of each
		# neighbour above and below.
		var h: float = size.y * 0.4
		var mid: float = size.y / 2.0
		var base: int = int(floor(_pos))
		var blur: float = clampf(_speed / 6.0, 0.0, 1.0)
		for k: int in range(base - 2, base + 4):
			var y: float = mid + (_pos - k) * h
			if y < -h or y > size.y + h:
				continue
			var tex: Texture2D = _tex.get(sym_at(k))
			if tex == null:
				continue
			var sc: float = minf((size.x * 0.78) / tex.get_width(), (h * 0.84) / tex.get_height())
			var sz: Vector2 = tex.get_size() * sc
			if blur > 0.05:
				# The smear: the picture stretched along its run, with ghosts.
				var st: Vector2 = Vector2(sz.x * (1.0 - blur * 0.12), sz.y * (1.0 + blur * 1.1))
				for g: int in 3:
					draw_texture_rect(tex, Rect2(Vector2((size.x - st.x) / 2.0, y - st.y / 2.0 + (g - 1) * blur * 26.0), st), false, Color(1, 1, 1, 0.35 if g != 1 else 0.65))
			else:
				draw_texture_rect(tex, Rect2(Vector2((size.x - sz.x) / 2.0, y - sz.y / 2.0), sz), false)
		# The drum: darker toward the top and the bottom, clear at the line.
		var dk: Color = Color(0.05, 0.05, 0.08, 0.62)
		var clear: Color = Color(0.05, 0.05, 0.08, 0.0)
		var band: float = size.y * 0.36
		draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(size.x, 0), Vector2(size.x, band), Vector2(0, band)]), PackedColorArray([dk, dk, clear, clear]))
		draw_polygon(PackedVector2Array([Vector2(0, size.y - band), Vector2(size.x, size.y - band), Vector2(size.x, size.y), Vector2(0, size.y)]), PackedColorArray([clear, clear, dk, dk]))
		if lit:
			var p: float = 0.5 + 0.5 * sin(_t * 6.0)
			draw_rect(r.grow(-3), Color(DenRoom.WIN, 0.6 + 0.4 * p), false, 5.0)
			draw_rect(r, Color(DenRoom.WIN, 0.08 + 0.06 * p))
		draw_rect(r, Color(0, 0, 0, 0.5), false, 1.0)


## THE LEVER on the cabinet's right side: a dark mount at the reels' height,
## a steel arm and a round red knob at its top. Click it, or drag the knob
## down past halfway, to pull: it travels down, `pulled` fires at the bottom,
## and it springs back up past its rest with an overshoot. Spin and Space
## swing it the same way (swing()). Locked while the reels run.
class Lever:
	extends Control
	signal pulled
	## Where the arm pivots, from the lever's top.
	var pivot_y: float = 100.0
	var locked: bool = false
	## 0 at rest (knob up), 1 pulled (knob below the mount).
	var _pull: float = 0.0
	var _drag: bool = false
	var _press_y: float = 0.0
	var _moved: bool = false
	var _tw: Tween

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		tooltip_text = "Pull to spin"

	func _knob_y(p: float) -> float:
		var top: float = 18.0
		var low: float = pivot_y + (pivot_y - top) * 0.55
		return lerpf(top, low, p)

	func _set_pull(p: float) -> void:
		_pull = p
		queue_redraw()

	## The whole pull, from rest: down, the spin, back up with an overshoot.
	func swing(fire: bool = false) -> void:
		if _tw != null and _tw.is_valid():
			_tw.kill()
		_tw = create_tween()
		_tw.tween_method(_set_pull, _pull, 1.0, 0.16 * (1.0 - _pull) + 0.04).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		_tw.tween_callback(func() -> void:
			Sound.clunk()
			if fire:
				pulled.emit())
		_spring()

	func _spring() -> void:
		_tw.tween_method(_set_pull, 1.0, 0.0, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
			var mb: InputEventMouseButton = event
			accept_event()
			if mb.pressed:
				if locked:
					return
				_drag = true
				_moved = false
				_press_y = mb.position.y
				if _tw != null and _tw.is_valid():
					_tw.kill()
			elif _drag:
				_drag = false
				# A click, or a drag past halfway, pulls; a short drag lets go.
				if not _moved or _pull > 0.5:
					swing(true)
				else:
					_tw = create_tween()
					_tw.tween_method(_set_pull, _pull, 0.0, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		elif event is InputEventMouseMotion and _drag:
			var my: float = (event as InputEventMouseMotion).position.y
			if absf(my - _press_y) > 6.0:
				_moved = true
			var span: float = _knob_y(1.0) - _knob_y(0.0)
			_set_pull(clampf((my - _press_y) / span, 0.0, 1.0))
			accept_event()

	func _draw() -> void:
		var mx: float = 22.0
		# The mount on the cabinet's side.
		var mb: StyleBoxFlat = StyleBoxFlat.new()
		mb.bg_color = DenSlots.CAB
		mb.set_corner_radius_all(8)
		mb.border_color = DenSlots.CAB_RIM
		mb.set_border_width_all(2)
		draw_style_box(mb, Rect2(0, pivot_y - 30.0, mx + 14.0, 60.0))
		var pv: Vector2 = Vector2(mx, pivot_y)
		var ky: float = _knob_y(_pull)
		var knob: Vector2 = Vector2(mx, ky)
		# The arm (it shortens through the pivot as it swings toward you).
		draw_line(pv, knob, Color(0.08, 0.08, 0.1), 10.0, true)
		draw_line(pv, knob, Color(0.74, 0.75, 0.74), 6.0, true)
		draw_circle(pv, 9.0, DenSlots.CAB_RIM)
		draw_circle(pv, 4.0, DenSlots.CAB_WELL)
		draw_circle(knob, 17.0, Color(0.32, 0.08, 0.07))
		draw_circle(knob, 15.0, DenRoom.RED)
