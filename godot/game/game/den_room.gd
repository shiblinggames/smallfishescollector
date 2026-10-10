class_name DenRoom
extends Room
## THE DEN (Godot port of app/(app)/tavern/casino, slots, roulette and
## blackjack; Kong 2026-10-03: "make them match our game, and use Godot for
## better animations and smoother play").
##
## THE DEN AS A PLACE (Kong, 2026-10-10: the games "were based on being a web
## app so ... animations and visuals were all a bit lacking"). The room keeps
## the header every room has (the title, the back pill) with the games as its
## tabs; under it, the whole screen is ONE flat felt table: a deep sea green,
## rounded, a hairline darker rim, no grain, no wood, no gradient, no shadow
## (he rejected painted backdrops and the faux wood). Everything sits on the
## felt and is sized from the felt, so it fills any window. Every change of
## state moves: chips slide, cards fly and flip, the wheel and the reels spin.
##
## One chip purse for all three (core/casino.gd). It sits on the felt's top
## edge as words and buttons, not a box: your chips as a pile of real chips
## and the count inked as money, what you can still buy in today, a buy-in for
## a few sizes, and cashing out. Roulette opens at Fishing 10 and Blackjack at
## 20 (port rules), and a closed tab says when.
##
## THE CHIPS ARE REAL (Kong, 2026-10-03: "actual chips that get animated, and
## different stack tiers; it'd be more fun seeing the chips add to your
## stack"): painted wooden tavern chips (web/public/den, Kie.ai), 10 bone, 25
## coral, 50 sea blue, 100 kelp, 250 charcoal, 500 purple. Your pile is drawn
## chip by chip from what you hold (biggest first, in columns), so every win
## grows it and every bet takes from it, chip by chip as the count rolls. A bet
## slides out of the pile as chips; a win slides back in, each chip landing
## with a tick and the pile giving a little under it; a lost bet is swept off
## the felt.

const RED: Color = Color("#d9534f")
## The felt: one flat deep sea green, its rim a shade darker.
const FELT: Color = Color(0.086, 0.27, 0.225)
const FELT_RIM: Color = Color(0.05, 0.17, 0.14)
## Darker felt, for wells on the table (a reel window's surround, the shoe).
const FELT_DEEP: Color = Color(0.055, 0.19, 0.155)
## The cream lines printed on the felt (the board, the bet circles).
const FELT_LINE: Color = Color(0.97, 0.94, 0.86, 0.5)
## Words on the felt.
const CREAM: Color = Kit.SEA_INK
const CREAM_SOFT: Color = Color(0.97, 0.94, 0.86, 0.68)
## The chip count, inked as money on the felt.
const CHIP_GOLD: Color = Kit.SEA_GOLD
## The lit gold of a winning spot or line.
const WIN: Color = Color(1.0, 0.84, 0.42)

var game: String = "slots"
var _felt: Pane
var _chips_l: Label
var _left_l: Label
var _buys: HBoxContainer
var _cash: Button
var _table: Control
var _tabs: HBoxContainer
var _pile: Pile

const DENOMS: Array = [500.0, 250.0, 100.0, 50.0, 25.0, 10.0]
## The stakes every Den game offers, one chip each.
const STAKES: Array = [10.0, 25.0, 50.0, 100.0, 250.0, 500.0]
## A chip's height for its width (the painted chips are a little wider than tall).
const CHIP_ASPECT: float = 0.9


## The stake chips, added to `row` (the caller clears it); the current one
## lifted and ringed, and `on_pick(stake)` on a press (the caller repaints).
static func stake_row(row: Node, current: float, on_pick: Callable) -> void:
	for b: float in STAKES:
		var c: ChipPick = ChipPick.new(b, b == current)
		c.pressed.connect(func() -> void:
			Sound.plip()
			on_pick.call(b))
		row.add_child(c)


## THE ONE THING TO DO on the felt (Spin, Deal, Ready): a flat cream button
## inked in the felt's green. Not the wooden plank (Kong rejected the faux
## wood for the Den).
static func primary(label: String) -> Pane.PaneButton:
	var n: Dictionary = { "radius": Kit.R_LARGE, "fill": [CREAM], "border": [1, Color(FELT_RIM, 0.6)], "pad": [26, 10, 26, 11], "keep": true }
	var h: Dictionary = n.duplicate()
	h["fill"] = [Color(1.0, 0.98, 0.93)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.text = label
	var r: Array = Kit.ROLES["button"]
	b.add_theme_font_override("font", Kit.tracked(r[0], r[1], r[2], r[3]))
	b.add_theme_font_size_override("font_size", 19)
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, FELT_DEEP)
	b.add_theme_color_override("font_disabled_color", Color(FELT_DEEP, 0.45))
	b.custom_minimum_size = Vector2(0, 52)
	b.focus_mode = Control.FOCUS_ALL
	Kit.tap(b)
	return b


## Words on the felt: cream (or a tone), on no paper.
static func says(parent: Node, t: String, role: String, col: Color = CREAM) -> Label:
	var l: Label = Kit.text(parent, t, role, col)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _init() -> void:
	title = "The Den"
	accent = RED


## Behind the felt: the room's plain dark (no picture, no glow; Kong wants
## it clean).
func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.05, 0.06, 0.06)
	add_child(bg)


## The games are the header's tabs, beside the back pill.
func _badge() -> Control:
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 2)
	_tabs.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return _tabs


func _build() -> void:
	chip_tex(10.0)
	# The felt fills the screen under the header: the column goes full width
	# and its foot margin narrows to the felt's.
	var m: MarginContainer = col.get_parent() as MarginContainer
	if m != null:
		m.add_theme_constant_override("margin_bottom", 16)
	_felt = Kit.pane(col, { "radius": Kit.R_LARGE, "fill": [FELT], "border": [2, FELT_RIM], "pad": [26, 14, 26, 18], "keep": true })
	_felt.set_meta("paper", false)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	_felt.add_child(v)
	# The purse, along the felt's top edge.
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	v.add_child(row)
	var left: VBoxContainer = VBoxContainer.new()
	left.add_theme_constant_override("separation", 0)
	left.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(left)
	says(left, "Your chips", "label", CREAM_SOFT)
	_chips_l = says(left, "", "display", CHIP_GOLD)
	_left_l = says(left, "", "note", CREAM_SOFT)
	_chips_l.custom_minimum_size = Vector2(180, 0)
	# The pile stands beside the count and grows to the right.
	_pile = Pile.new()
	_pile.custom_minimum_size = Vector2(220, 86)
	_pile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_pile)
	_buys = HBoxContainer.new()
	_buys.add_theme_constant_override("separation", 6)
	_buys.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_buys)
	_cash = Paper.button("Cash out")
	_cash.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_cash.pressed.connect(_cash_out)
	row.add_child(_cash)
	# The game, filling the rest of the felt.
	_table = Control.new()
	_table.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_table.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(_table)
	_fit()
	if not get_viewport().size_changed.is_connected(_fit):
		get_viewport().size_changed.connect(_fit)
	paint_purse()
	_open(game)


## The felt to the screen: the column as wide as the window allows, the felt
## down to the foot (from the window, never a fixed 1600 x 900).
func _fit() -> void:
	if _felt == null or not is_instance_valid(_felt):
		return
	var vp: Vector2 = get_viewport_rect().size
	col.custom_minimum_size = Vector2(maxf(640.0, vp.x - 40.0), 0)
	var above: float = 0.0
	var sep: float = float(col.get_theme_constant("separation"))
	for c: Node in col.get_children():
		if c == _felt:
			break
		if c is Control:
			above += (c as Control).get_combined_minimum_size().y + sep
	_felt.custom_minimum_size = Vector2(0, maxf(560.0, vp.y - 22.0 - 16.0 - above))


## The purse, from the chips as they are now (the games call this after a play).
func paint_purse(chips_override: float = -1.0) -> void:
	if _chips_l == null or not is_instance_valid(_chips_l):
		return
	var w: Dictionary = Casino.state(session.store, session.uid)
	var chips: float = float(w["chips"]) if chips_override < 0.0 else chips_override
	_chips_l.text = "%s" % Js.thousands(chips)
	_paint_stack(chips)
	_left_l.text = "Purse %s ⟡%s%s ⟡ more you can buy in today" % [Js.thousands(float(w["doubloons"])), Kit.SEP, Js.thousands(float(w["dailyRemaining"]))]
	for c: Node in _buys.get_children():
		c.queue_free()
	var left: float = float(w["dailyRemaining"])
	for n: float in [100.0, 250.0, 500.0, 1000.0]:
		if n > left or n > float(w["doubloons"]):
			continue
		var b: Button = Paper.button("+%s" % Js.thousands(n))
		b.tooltip_text = "Buy %s chips for %s ⟡" % [Js.thousands(n), Js.thousands(n)]
		b.pressed.connect(func() -> void: _buy(n))
		_buys.add_child(b)
	_cash.disabled = chips <= 0.0


## Count the chip number from one value to another; the pile grows or
## shrinks chip by chip with it.
func roll_chips(from: float, to: float) -> void:
	if _chips_l == null:
		return
	var tw: Tween = Motion.count(_chips_l, from, to, func(x: float) -> void:
		if is_instance_valid(_chips_l):
			_chips_l.text = Js.thousands(round(x))
			_paint_stack(round(x)), false, 0.8)
	tw.tween_callback(func() -> void: paint_purse())


# ── The chips ──────────────────────────────────────────────────────────────────

## The chips, loaded once and held (a texture first loaded inside a draw
## call is not on the GPU until the next frame, and a board that draws only
## when it changes would show white squares).
static var _chip_cache: Dictionary = {}


static func chip_tex(v: float) -> Texture2D:
	if _chip_cache.is_empty():
		for d: float in DENOMS:
			_chip_cache[d] = Skipper.tex("den/chip-%d.png" % int(d))
	for d: float in DENOMS:
		if v >= d:
			return _chip_cache[d]
	return _chip_cache[10.0]


## An amount as chips, biggest first, no more than `cap` of them (the rest
## rides on the last).
static func breakdown(amount: float, cap: int = 14) -> Array:
	var out: Array = []
	var left: float = amount
	for d: float in DENOMS:
		while left >= d and out.size() < cap:
			out.append(d)
			left -= d
	if out.is_empty() and amount > 0.0:
		out.append(10.0)
	return out


## A PILE drawn on the felt: `amount` as chips (biggest first), stacked in
## columns of `per_col` side by side, each chip `w` wide, `base` the middle
## of its foot. The step between chips shows each one's painted rim.
static func draw_pile(ci: CanvasItem, base: Vector2, amount: float, w: float, cap: int = 36, per_col: int = 6, alpha: float = 1.0) -> void:
	if amount <= 0.0:
		return
	var chips: Array = breakdown(amount, cap)
	var h: float = w * CHIP_ASPECT
	var step: float = w * 0.17
	var cols: int = ceili(chips.size() / float(per_col))
	var gap: float = w * 0.94
	var x0: float = base.x - (cols - 1) * gap / 2.0
	for i: int in chips.size():
		var c: int = i / per_col
		var k: int = i % per_col
		var p: Vector2 = Vector2(x0 + c * gap, base.y - h / 2.0 - k * step)
		ci.draw_texture_rect(chip_tex(float(chips[i])), Rect2(p - Vector2(w, h) / 2.0, Vector2(w, h)), false, Color(1, 1, 1, alpha))


## How tall a pile of this amount stands (for a label over it).
static func pile_height(amount: float, w: float, cap: int = 36, per_col: int = 6) -> float:
	var n: int = mini(breakdown(amount, cap).size(), per_col)
	return w * CHIP_ASPECT + maxf(0.0, n - 1) * w * 0.17


func _paint_stack(chips: float) -> void:
	if _pile == null:
		return
	_pile.set_amount(chips)


## Where the pile is on the screen (its top, where chips land and leave).
func stack_point() -> Vector2:
	return _pile.top_point() if _pile != null else get_viewport_rect().size / 2.0


func _bump_stack() -> void:
	if _pile != null:
		_pile.bump()


## CHIPS IN FLIGHT: an amount as painted chips arcing from one point to
## another, one after another; into the pile each lands with a tick and a
## give; out to the table they land with a soft clack. `landed` runs when the
## last one is down (a board shows a bet's chips only once they arrive).
func fly_chips(from: Vector2, amount: float, into_stack: bool = true, to: Vector2 = Vector2.INF, landed: Callable = Callable()) -> float:
	if amount <= 0.0:
		if landed.is_valid():
			landed.call()
		return 0.0
	var target: Vector2 = stack_point() if into_stack else to
	var start: Vector2 = from if into_stack else stack_point()
	var chips: Array = breakdown(amount, 14 if into_stack else 6)
	var w: float = _chip_w()
	var last: float = 0.0
	for i: int in chips.size():
		var c: TextureRect = _flier(float(chips[i]), w)
		var jitter: Vector2 = Vector2(randf_range(-18, 18), randf_range(-10, 10)) if into_stack else Vector2(randf_range(-8, 8), randf_range(-4, 4))
		var lift: float = randf_range(60, 130)
		var spin: float = randf_range(-5.0, 5.0)
		var is_last: bool = i == chips.size() - 1
		var fly: Callable = func(u: float) -> void:
			c.visible = true
			var p: Vector2 = (start + jitter).lerp(target, u * u * (3.0 - 2.0 * u))
			p.y -= sin(u * PI) * lift
			c.position = p - c.size / 2.0
			c.rotation = spin * u * (1.0 - u) * 2.0
			c.scale = Vector2.ONE * lerpf(1.08, 0.82 if into_stack else 0.9, u)
		var tw: Tween = c.create_tween()
		tw.tween_interval(i * 0.06)
		tw.tween_method(fly, 0.0, 1.0, 0.5)
		tw.tween_callback(func() -> void:
			if into_stack:
				Sound.xp_tick()
				_bump_stack()
			else:
				Sound.plip()
			if is_last and landed.is_valid():
				landed.call()
			c.queue_free())
		last = i * 0.06 + 0.5
	return last


## A LOST BET SWEPT: its chips slide flat across the felt to the house (no
## arc, they are pushed) and fade as they go.
func sweep_chips(from: Vector2, to: Vector2, amount: float) -> void:
	if amount <= 0.0:
		return
	var chips: Array = breakdown(amount, 5)
	var w: float = _chip_w()
	for i: int in chips.size():
		var c: TextureRect = _flier(float(chips[i]), w)
		var off: Vector2 = Vector2(randf_range(-6, 6), -i * w * 0.17)
		var tw: Tween = c.create_tween()
		tw.tween_interval(i * 0.03)
		tw.tween_method(func(u: float) -> void:
			c.visible = true
			var e: float = 1.0 - pow(1.0 - u, 3.0)
			c.position = (from + off).lerp(to, e) - c.size / 2.0
			c.modulate.a = 1.0 - clampf((u - 0.55) / 0.45, 0.0, 1.0), 0.0, 1.0, 0.55)
		tw.tween_callback(c.queue_free)
	Sound.whoosh()


## The chip size in flight, from the window (a chip the size of a pile's).
func _chip_w() -> float:
	return clampf(get_viewport_rect().size.y * 0.046, 30.0, 64.0)


func _flier(v: float, w: float) -> TextureRect:
	var c: TextureRect = TextureRect.new()
	c.texture = chip_tex(v)
	c.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	c.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	c.size = Vector2(w, w * CHIP_ASPECT)
	c.pivot_offset = c.size / 2.0
	c.top_level = true
	c.z_index = 50
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.visible = false
	add_child(c)
	return c


## A SMALL BURST of chips thrown up from a point (a bigger win), drawn in
## code: they rise, turn, fall and fade, all within a few hundred pixels.
## `spill`: thrown out sideways and barely up, as chips spilling over a
## tray's lip (the slot machine's: thrown up, they flew across the win's
## words, and the felt's words cannot be drawn over the room's burst).
func burst(at: Vector2, n: int, spill: bool = false) -> void:
	var b: Burst = Burst.new()
	b.top_level = true
	b.z_index = 45
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.position = Vector2.ZERO
	b.size = get_viewport_rect().size
	add_child(b)
	b.go(at, n, _chip_w() * 0.7, spill)


func _buy(n: float) -> void:
	var before: float = Js.num(session.profile().get("casino_chips"))
	var r: Dictionary = await session.act("buyInCasino", [n])
	if r.has("error"):
		toast(str(r["error"]), RED)
		return
	session.persist()
	Sound.chest(false)
	fly_chips(_buys.get_global_rect().get_center() + Vector2(0, 30), n)
	roll_chips(before, float(r["newChips"]))


func _cash_out() -> void:
	var before: float = Js.num(session.profile().get("casino_chips"))
	var r: Dictionary = await session.act("cashOutCasino")
	if r.has("error"):
		toast(str(r["error"]), RED)
		return
	session.persist()
	Sound.chest(true)
	# The pile goes back across the counter.
	sweep_chips(stack_point(), _cash.get_global_rect().get_center(), before)
	toast("Cashed out %s ⟡ to your purse" % Js.thousands(float(r["cashedOut"])))
	roll_chips(before, 0.0)


func _open(which: String) -> void:
	game = which
	for c: Node in _tabs.get_children():
		_tabs.remove_child(c)
		c.queue_free()
	var xp: float = Js.num(session.profile().get("fishing_xp"))
	for t: Array in [["slots", "Fish Slots", ""], ["roulette", "Fish Roulette", "den_roulette"], ["blackjack", "Blackjack", "den_blackjack"]]:
		var block: String = Rules.gate_block("feature", t[2], xp) if t[2] != "" else ""
		var b: Pane.PaneButton = Paper.tab(t[1] if block == "" else t[1] + Kit.SEP + block, t[0] == which)
		# A game still closed says when, and does not open.
		b.disabled = block != ""
		var key: String = t[0]
		b.pressed.connect(func() -> void:
			## A game mid-play (awaiting its spin, deal or settle) keeps the
			## table: freeing it would strand its coroutine and leave the purse
			## on chips less the stake.
			if _table.get_child_count() > 0 and _table.get_child(_table.get_child_count() - 1).get("_busy") == true:
				return
			if key != game:
				_open(key))
		_tabs.add_child(b)
	for c: Node in _table.get_children():
		c.queue_free()
	var g: Control
	match which:
		"roulette":
			g = DenRoulette.new()
		"blackjack":
			# In a Charter, the crew's shared table.
			g = DenBlackjackTable.new() if DenTables.shared_for(session) else DenBlackjack.new()
		_:
			g = DenSlots.new()
	g.set("session", session)
	g.set("den", self)
	_table.add_child(g)
	g.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# The new game settles onto the felt.
	g.modulate.a = 0.0
	var tw: Tween = g.create_tween()
	Motion.ease_fade(tw, g, "modulate:a", 1.0, Motion.PANEL_IN)


## THE PILE by the count: what you hold, drawn chip by chip from the painted
## chips (DenRoom.draw_pile). It gives a little when a chip lands on it.
class Pile:
	extends Control
	var amount: float = 0.0
	var _squash: float = 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size_flags_vertical = Control.SIZE_SHRINK_CENTER

	func set_amount(v: float) -> void:
		if v != amount:
			amount = v
			queue_redraw()

	func _w() -> float:
		return clampf(size.y * 0.46, 26.0, 48.0)

	## The pile's first column stands here; more columns grow to the right.
	func _first_x() -> float:
		return _w() * 0.6 + 8.0

	func top_point() -> Vector2:
		var w: float = _w()
		return get_global_transform() * Vector2(_first_x(), size.y - DenRoom.pile_height(maxf(amount, 10.0), w) + w * 0.4)

	func bump() -> void:
		var tw: Tween = create_tween()
		tw.tween_method(func(k: float) -> void:
			_squash = k
			queue_redraw(), 1.0, 0.0, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	func _draw() -> void:
		if amount <= 0.0:
			return
		var w: float = _w()
		var cols: int = ceili(DenRoom.breakdown(amount, 36).size() / 6.0)
		var foot: Vector2 = Vector2(_first_x() + (cols - 1) * w * 0.47, size.y - 2.0)
		draw_set_transform(foot, 0.0, Vector2(1.0 + _squash * 0.05, 1.0 - _squash * 0.06))
		DenRoom.draw_pile(self, Vector2.ZERO, amount, w)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## A STAKE CHIP: the painted chip of that value with its number on it; the
## chosen one lifts and stands on a cream ring. A pad or keyboard sees a gold
## ring when it has focus.
class ChipPick:
	extends Button
	var value: float = 10.0
	var on: bool = false
	var _lift: float = 0.0
	var _hover: float = 0.0

	func _init(v: float, chosen: bool) -> void:
		value = v
		on = chosen
		text = ""
		tooltip_text = "Bet %s" % Js.thousands(v)
		focus_mode = Control.FOCUS_ALL
		custom_minimum_size = Vector2(62, 64)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var empty: StyleBoxEmpty = StyleBoxEmpty.new()
		for st: String in ["normal", "hover", "pressed", "disabled", "hover_pressed", "focus"]:
			add_theme_stylebox_override(st, empty)
		mouse_entered.connect(func() -> void: _hover_to(1.0))
		mouse_exited.connect(func() -> void: _hover_to(0.0))
		focus_entered.connect(queue_redraw)
		focus_exited.connect(queue_redraw)

	func _ready() -> void:
		Kit.tap(self)
		if on:
			create_tween().tween_method(func(k: float) -> void:
				_lift = k
				queue_redraw(), 0.0, 1.0, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	func _hover_to(k: float) -> void:
		create_tween().tween_method(func(x: float) -> void:
			_hover = x
			queue_redraw(), _hover, k, 0.12)

	func _draw() -> void:
		var w: float = size.x * 0.84
		var h: float = w * DenRoom.CHIP_ASPECT
		var c: Vector2 = Vector2(size.x / 2.0, size.y / 2.0 + 4.0)
		# Where it stands on the felt.
		draw_set_transform(c + Vector2(0, h * 0.34), 0.0, Vector2(1.0, 0.32))
		if on:
			draw_arc(Vector2.ZERO, w * 0.56, 0.0, TAU, 40, DenRoom.CREAM, 5.0, true)
		draw_circle(Vector2.ZERO, w * 0.44, Color(0, 0, 0, 0.18))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		var up: float = _lift * 9.0 + _hover * 3.0
		var a: float = 0.5 if disabled else 1.0
		draw_texture_rect(DenRoom.chip_tex(value), Rect2(c - Vector2(w, h) / 2.0 - Vector2(0, up), Vector2(w, h)), false, Color(1, 1, 1, a))
		var f: Font = Kit.font("karla", 800)
		var t: String = Js.thousands(value)
		var px: int = 15 if t.length() <= 3 else 13
		Kit.sea_string(self, f, c - Vector2(size.x / 2.0, up + h * 0.02 - px * 0.36), t, px, DenRoom.CREAM, HORIZONTAL_ALIGNMENT_CENTER, size.x, a)
		if has_focus() and get_viewport().gui_get_focus_owner() == self:
			draw_arc(c - Vector2(0, up), w * 0.58, 0.0, TAU, 40, Kit.GOLD, 2.0, true)


## THE BURST: chips thrown up, turning, falling and fading (drawn in code).
class Burst:
	extends Control
	var _bits: Array = []
	var _t: float = 0.0
	var _w: float = 24.0

	func go(at: Vector2, n: int, w: float, spill: bool = false) -> void:
		_w = w
		for i: int in n:
			_bits.append({
				"p": at + Vector2(randf_range(-40, 40), randf_range(-8, 8)),
				"v": Vector2(randf_range(-320, 320), randf_range(-160, -30)) if spill else Vector2(randf_range(-260, 260), randf_range(-620, -320)),
				"r": randf_range(0, TAU), "s": randf_range(-9.0, 9.0),
				"life": randf_range(0.8, 1.2), "chip": DenRoom.STAKES[randi() % DenRoom.STAKES.size()],
			})

	func _process(delta: float) -> void:
		_t += delta
		var alive: bool = false
		for b: Dictionary in _bits:
			b["v"] = (b["v"] as Vector2) + Vector2(0, 1500.0) * delta
			b["p"] = (b["p"] as Vector2) + (b["v"] as Vector2) * delta
			b["r"] = float(b["r"]) + float(b["s"]) * delta
			if _t < float(b["life"]):
				alive = true
		queue_redraw()
		if not alive:
			queue_free()

	func _draw() -> void:
		for b: Dictionary in _bits:
			var a: float = 1.0 - clampf((_t - float(b["life"]) * 0.6) / (float(b["life"]) * 0.4), 0.0, 1.0)
			if a <= 0.0:
				continue
			# A chip turning in the air: narrowed across as it turns edge-on.
			var turn: float = absf(cos(float(b["r"])))
			draw_set_transform(b["p"], float(b["r"]) * 0.3, Vector2(maxf(0.15, turn), 1.0))
			draw_texture_rect(DenRoom.chip_tex(float(b["chip"])), Rect2(Vector2(-_w, -_w * DenRoom.CHIP_ASPECT) / 2.0, Vector2(_w, _w * DenRoom.CHIP_ASPECT)), false, Color(1, 1, 1, a))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
