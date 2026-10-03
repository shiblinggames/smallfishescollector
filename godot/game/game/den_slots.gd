class_name DenSlots
extends VBoxContainer
## FISH SLOTS (Godot port of app/(app)/tavern/SlotMachine.tsx, made to move):
## a stained-wood cabinet with three paper windows. The reels run fast with
## a motion blur, land one after another with a small overshoot and a knock,
## and the line that pays lights up. Three hooks spin the bonus round (the
## Jellyfish is wild, wins pay half again); three catfish pay 300 times the
## bet. Space spins.

const SYMS: Dictionary = {
	"common": "card-arts/Sardine_v2.webp", "rare": "card-arts/Blue_Marlin.webp", "shark": "card-arts/Great_White_Shark.webp",
	"legendary": "card-arts/Blue_Whale_v2.webp", "catfish": "card-arts/Catfish.webp", "anchor": "den/hook.png", "wild": "card-arts/Jellyfish.webp",
}
const BETS: Array = [10.0, 25.0, 50.0, 100.0, 250.0, 500.0]

var session: Session
var den: DenRoom
var _bet: float = 25.0
var _reels: Array = []
var _spin_b: Button
var _says: Label
var _sub: Label
var _bets_row: HBoxContainer
var _busy: bool = false


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	var cab: Pane = Kit.pane(self, { "radius": 16, "fill": [Kit.WOOD_HI, Kit.WOOD_LO], "border": [2, Color(0.25, 0.15, 0.08, 0.9)], "shadow": [Color(0, 0, 0, 0.5), 22, Vector2(0, 8)], "pad": [26, 18, 26, 22], "keep": true, "grain": true })
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	cab.add_child(v)
	var head: HBoxContainer = HBoxContainer.new()
	v.add_child(head)
	var t: Label = Kit.text(head, "Fish Slots", "title", Kit.WOOD_INK)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Kit.text(head, "Three catfish pay %d times your bet" % int(Casino.fixed_jackpot() if Casino.fixed_jackpot() > 0.0 else 0.0), "label", Color(1.0, 0.86, 0.5))
	# The windows.
	var win: HBoxContainer = HBoxContainer.new()
	win.alignment = BoxContainer.ALIGNMENT_CENTER
	win.add_theme_constant_override("separation", 14)
	v.add_child(win)
	for i: int in 3:
		var r: Reel = Reel.new()
		r.custom_minimum_size = Vector2(190, 230)
		win.add_child(r)
		_reels.append(r)
	# What it came to.
	_says = Kit.text(v, "", "title", Color(1.0, 0.88, 0.55))
	_says.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_says.custom_minimum_size = Vector2(0, 34)
	_sub = Kit.text(v, "", "label", Color(Kit.WOOD_INK, 0.8))
	_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# The stake and the lever.
	var ctl: HBoxContainer = HBoxContainer.new()
	ctl.add_theme_constant_override("separation", 10)
	ctl.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(ctl)
	_bets_row = HBoxContainer.new()
	_bets_row.add_theme_constant_override("separation", 6)
	ctl.add_child(_bets_row)
	_paint_bets()
	_spin_b = Kit.button("Spin   ·   Space", "primary")
	_spin_b.custom_minimum_size = Vector2(220, 56)
	_spin_b.add_theme_font_size_override("font_size", 20)
	_spin_b.pressed.connect(spin)
	ctl.add_child(_spin_b)
	_paytable()


func _paint_bets() -> void:
	for c: Node in _bets_row.get_children():
		c.queue_free()
	for b: float in BETS:
		var btn: Button = Paper.button("%d" % int(b), b == _bet)
		btn.pressed.connect(func() -> void:
			_bet = b
			_paint_bets())
		_bets_row.add_child(btn)


## The pays, small, under the machine.
func _paytable() -> void:
	var p: Pane = Kit.pane(self, { "radius": 10, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.25)], "pad": [18, 10, 18, 12], "paper": true })
	var g: GridContainer = GridContainer.new()
	g.columns = 4
	g.add_theme_constant_override("h_separation", 22)
	g.add_theme_constant_override("v_separation", 2)
	p.add_child(g)
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
		Paper.text(g, str(s["label"]), "label", Paper.INK)
		Paper.text(g, pay, "note", Paper.INK_SOFT)


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
	for r: Reel in _reels:
		r.lit = false
	den.paint_purse(chips - _bet)
	den.fly_chips(Vector2.ZERO, _bet, false, (_reels[1] as Reel).get_global_rect().get_center())
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
		await get_tree().create_timer(0.7).timeout
		await _run(b["reels"])
		_show(String(b["outcome"]), float(b["payout"]), b.get("matchedSymbol"), b["reels"], true)
		_sub.text = "Your bet back, and %s" % ("nothing more" if float(b["payout"]) <= 0.0 else "%s more" % Js.thousands(float(b["payout"])))
	else:
		_show(outcome, float(r["payout"]), r.get("matchedSymbol"), r["reels"], false)
	den.roll_chips(chips - _bet, float(r["newChips"]))
	_busy = false
	_spin_b.disabled = false


## The reels to these symbols, landing one after another.
func _run(target: Array) -> void:
	for i: int in 3:
		(_reels[i] as Reel).spin_to(str(target[i]), 0.85 + 0.38 * i)
	await get_tree().create_timer(0.85 + 0.38 * 2 + 0.3).timeout


func _show(outcome: String, payout: float, sym: Variant, reels: Array, bonus: bool) -> void:
	match outcome:
		"jackpot":
			_says.text = "Catfish Jackpot!   +%s" % Js.thousands(payout)
			for r: Reel in _reels:
				r.lit = true
			Sound.chest(true)
			Rumble.buzz([0, 60, 40, 80, 40, 120])
			_burst(40)
			den.fly_chips(_win_from(), payout)
		"win":
			_says.text = "Three %s!   +%s" % [_label(str(sym if sym != null else reels[0])), Js.thousands(payout)]
			_light(reels, str(sym if sym != null else reels[0]))
			Sound.chest(false)
			_burst(10)
			den.fly_chips(_win_from(), payout)
		"pair_win", "pair":
			_says.text = "Two %s   +%s" % [_label(str(sym)), Js.thousands(payout)]
			_light(reels, str(sym))
			Sound.perfect()
			den.fly_chips(_win_from(), payout)
		"refund":
			_says.text = "Two hooks: your bet back"
			_light(reels, "anchor")
			Sound.plip()
			den.fly_chips(_win_from(), payout)
		"near_miss":
			_says.text = "Two sardines. So close."
		_:
			_says.text = ""
	if _says.text != "":
		_pop(_says)


func _win_from() -> Vector2:
	return (_reels[1] as Reel).get_global_rect().get_center()


func _light(reels: Array, sym: String) -> void:
	for i: int in 3:
		if reels[i] == sym or (reels[i] == "wild" and sym != "anchor"):
			(_reels[i] as Reel).lit = true


func _pop(l: Label) -> void:
	l.pivot_offset = l.size / 2.0
	l.scale = Vector2(1.25, 1.25)
	l.create_tween().tween_property(l, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## Gold coins thrown up out of the windows.
func _burst(n: int) -> void:
	var c: Vector2 = (_reels[1] as Reel).get_global_rect().get_center()
	for i: int in n:
		var m: TextureRect = TextureRect.new()
		m.texture = Glow.radial(32, Color(1.0, 0.8, 0.3), false)
		m.size = Vector2(18, 18)
		m.top_level = true
		m.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(m)
		var v0: Vector2 = Vector2(randf_range(-420, 420), randf_range(-620, -260))
		var start: Vector2 = c + Vector2(randf_range(-240, 240), randf_range(-40, 40))
		var life: float = randf_range(0.9, 1.4)
		var fly: Callable = func(u: float) -> void:
			var tt: float = u * life
			m.position = start + v0 * tt + Vector2(0, 900.0) * tt * tt * 0.5
			m.modulate.a = 1.0 - u * u
		var tw: Tween = m.create_tween()
		tw.tween_method(fly, 0.0, 1.0, life)
		tw.tween_callback(m.queue_free)


## ONE REEL: a paper window with a strip of fish running through it. Spun, it
## runs a long strip fast (each picture smeared and doubled with its speed),
## eases into the target and overshoots a touch, then settles with a knock.
class Reel:
	extends Control
	var lit: bool = false:
		set(v):
			lit = v
			queue_redraw()
	var _strip: Array = ["common", "rare", "catfish"]
	var _pos: float = 1.0
	var _speed: float = 0.0
	var _t: float = 0.0
	var _tex: Dictionary = {}

	func _ready() -> void:
		clip_contents = true
		for k: String in DenSlots.SYMS:
			_tex[k] = Skipper.tex(DenSlots.SYMS[k])

	func spin_to(sym: String, dur: float) -> void:
		var n: int = 18 + int(dur * 10.0)
		var ids: Array = DenSlots.SYMS.keys().filter(func(k: String) -> bool: return k != "wild")
		var strip: Array = [_strip[int(round(_pos)) % _strip.size()]]
		for i: int in n:
			strip.append(ids[randi() % ids.size()])
		strip.append(sym)
		strip.append(ids[randi() % ids.size()])
		_strip = strip
		_pos = 0.0
		var end: float = float(n + 1)
		var tw: Tween = create_tween()
		tw.tween_method(func(p: float) -> void:
			_speed = absf(p - _pos) * 60.0
			_pos = p
			queue_redraw(), 0.0, end + 0.22, dur).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
		tw.tween_method(func(p: float) -> void:
			_speed = 0.0
			_pos = p
			queue_redraw(), end + 0.22, end, 0.16).set_trans(Tween.TRANS_SINE)
		tw.tween_callback(func() -> void:
			Sound.xp_tick()
			Rumble.tap(10))

	func _process(delta: float) -> void:
		_t += delta
		if lit:
			queue_redraw()

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		draw_rect(r, Kit.PAPER)
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
			var dim: float = 1.0 - clampf(absf(_pos - k) * 0.6, 0.0, 0.6)
			if blur > 0.05:
				# The smear: the picture stretched along its run and doubled.
				var st: Vector2 = Vector2(sz.x, sz.y * (1.0 + blur * 0.9))
				for g: int in 3:
					draw_texture_rect(tex, Rect2(Vector2((size.x - st.x) / 2.0, y - st.y / 2.0 + (g - 1) * blur * 18.0), st), false, Color(1, 1, 1, dim * (0.45 if g != 1 else 0.7)))
			else:
				draw_texture_rect(tex, Rect2(Vector2((size.x - sz.x) / 2.0, y - sz.y / 2.0), sz), false, Color(1, 1, 1, dim))
		# The glass: a soft shade at the top and bottom of the window.
		for i: int in 14:
			var a: float = 0.32 * (1.0 - i / 14.0)
			draw_rect(Rect2(0, i * 3.0, size.x, 3.0), Color(0.2, 0.12, 0.06, a))
			draw_rect(Rect2(0, size.y - (i + 1) * 3.0, size.x, 3.0), Color(0.2, 0.12, 0.06, a))
		# The payline.
		draw_line(Vector2(6, mid), Vector2(size.x - 6, mid), Color(0.66, 0.2, 0.15, 0.35), 2.0)
		if lit:
			var p: float = 0.5 + 0.5 * sin(_t * 6.0)
			draw_rect(r.grow(-3), Color(1.0, 0.8, 0.3, 0.55 + 0.4 * p), false, 4.0)
		draw_rect(r, Color(0.25, 0.15, 0.08, 0.9), false, 2.0)
