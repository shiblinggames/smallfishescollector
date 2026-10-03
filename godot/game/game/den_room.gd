class_name DenRoom
extends Room
## THE DEN (Godot port of app/(app)/tavern/casino, slots, roulette and
## blackjack; Kong 2026-10-03: "make them match our game, and use Godot for
## better animations and smoother play"). Paper and stained wood like every
## other room, and the games move: the reels spin and land, the wheel turns
## and the ball drops, the cards slide and flip.
##
## One chip purse for all three (core/casino.gd). The strip at the top holds
## it: your chips, what you can still buy in today, a buy-in for a few sizes,
## and cashing out. Under it, a tab for each game; Roulette opens at Fishing
## 10 and Blackjack at 20 (port rules), and a closed tab says when.
##
## THE CHIPS ARE REAL (Kong, 2026-10-03: "actual chips that get animated, and
## different stack tiers; it'd be more fun seeing the chips add to your
## stack"): painted wooden tavern chips (web/public/den, Kie.ai), 10 bone, 25
## coral, 50 sea blue, 100 kelp, 250 charcoal, 500 purple. Your chips sit as a
## stack by the number, a short stack, a tall one, two, then a heap as they
## grow. A bet flies out of the stack as chips; a win flies back in as chips,
## each landing with a tick and the stack giving a little under it.

const RED: Color = Color("#d9534f")
const CHIP_GOLD: Color = Color(0.55, 0.38, 0.04)

var game: String = "slots"
var _strip: Pane
var _chips_l: Label
var _left_l: Label
var _buys: HBoxContainer
var _cash: Button
var _table: Control
var _tabs: HBoxContainer
var _stack: TextureRect
var _stack_tier: int = -1
var _shown_chips: float = 0.0

const DENOMS: Array = [500.0, 250.0, 100.0, 50.0, 25.0, 10.0]
const STACK_H: Array = [0.0, 46.0, 66.0, 80.0, 92.0]


func _init() -> void:
	title = "The Den"
	accent = RED


func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.color = Color("#120b08")
	add_child(bg)
	var glow: TextureRect = TextureRect.new()
	glow.texture = Glow.radial(256, Color(0.95, 0.55, 0.25))
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	glow.modulate = Color(1, 1, 1, 0.1)
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(glow)


func _build() -> void:
	chip_tex(10.0)
	# The purse.
	_strip = Kit.pane(col, { "radius": 10, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.3)], "shadow": [Color(0, 0, 0, 0.45), 16, Vector2(0, 5)], "pad": [22, 14, 22, 14], "paper": true })
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	_strip.add_child(row)
	_stack = TextureRect.new()
	_stack.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_stack.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_stack.custom_minimum_size = Vector2(110, 92)
	_stack.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(_stack)
	var left: VBoxContainer = VBoxContainer.new()
	left.add_theme_constant_override("separation", 0)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(left)
	Paper.text(left, "Your chips", "label", Paper.INK_SOFT)
	_chips_l = Paper.text(left, "", "display", CHIP_GOLD)
	_chips_l.add_theme_font_size_override("font_size", 34)
	_left_l = Paper.text(left, "", "note", Paper.INK_SOFT)
	_buys = HBoxContainer.new()
	_buys.add_theme_constant_override("separation", 6)
	_buys.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_buys)
	_cash = Kit.button("Cash out", "secondary", "small")
	_cash.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_cash.pressed.connect(_cash_out)
	row.add_child(_cash)
	# The games.
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 8)
	col.add_child(_tabs)
	_table = Control.new()
	_table.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_child(_table)
	paint_purse()
	_open(game)


## The strip, from the purse as it is now (the games call this after a play).
func paint_purse(chips_override: float = -1.0) -> void:
	if _chips_l == null or not is_instance_valid(_chips_l):
		return
	var w: Dictionary = Casino.state(session.store, session.uid)
	var chips: float = float(w["chips"]) if chips_override < 0.0 else chips_override
	_chips_l.text = "%s" % Js.thousands(chips)
	_paint_stack(chips)
	_left_l.text = "Purse %s ⟡   ·   %s ⟡ more you can buy in today" % [Js.thousands(float(w["doubloons"])), Js.thousands(float(w["dailyRemaining"]))]
	for c: Node in _buys.get_children():
		c.queue_free()
	var left: float = float(w["dailyRemaining"])
	for n: float in [100.0, 250.0, 500.0, 1000.0]:
		if n > left or n > float(w["doubloons"]):
			continue
		var b: Button = Kit.button("+%s" % Js.thousands(n), "accent", "small", RED)
		b.tooltip_text = "Buy %s chips for %s ⟡" % [Js.thousands(n), Js.thousands(n)]
		b.pressed.connect(func() -> void: _buy(n))
		_buys.add_child(b)
	_cash.disabled = chips <= 0.0


## Count the chip number from one value to another.
func roll_chips(from: float, to: float) -> void:
	if _chips_l == null:
		return
	var tw: Tween = _chips_l.create_tween()
	tw.tween_method(func(x: float) -> void:
		if is_instance_valid(_chips_l):
			_chips_l.text = Js.thousands(round(x))
			_paint_stack(x), from, to, 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
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


static func tier_of(chips: float) -> int:
	if chips <= 0.0:
		return 0
	if chips < 500.0:
		return 1
	if chips < 2500.0:
		return 2
	if chips < 10000.0:
		return 3
	return 4


func _paint_stack(chips: float) -> void:
	if _stack == null:
		return
	_shown_chips = chips
	var t: int = tier_of(chips)
	if t == _stack_tier:
		return
	var grew: bool = t > _stack_tier and _stack_tier >= 0
	_stack_tier = t
	_stack.texture = null if t == 0 else Skipper.tex("den/stack-%d.png" % t)
	_stack.custom_minimum_size = Vector2(110, 92)
	_stack.pivot_offset = Vector2(55, 92)
	var sc: float = float(STACK_H[t]) / 92.0
	_stack.scale = Vector2(sc, sc)
	if grew:
		var tw: Tween = _stack.create_tween()
		tw.tween_property(_stack, "scale", Vector2(sc * 1.18, sc * 1.18), 0.1)
		tw.tween_property(_stack, "scale", Vector2(sc, sc), 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## Where the stack is on the screen.
func stack_point() -> Vector2:
	return _stack.get_global_rect().get_center() + Vector2(0, 20) if _stack != null else get_viewport_rect().size / 2.0


func _bump_stack() -> void:
	if _stack == null:
		return
	var sc: float = float(STACK_H[maxi(1, _stack_tier)]) / 92.0
	var tw: Tween = _stack.create_tween()
	tw.tween_property(_stack, "scale", Vector2(sc * 1.06, sc * 0.94), 0.05)
	tw.tween_property(_stack, "scale", Vector2(sc, sc), 0.12)


## CHIPS IN FLIGHT: an amount as painted chips arcing from one point to
## another, one after another; into the stack each lands with a tick and a
## give; out to the table they land with a soft clack.
func fly_chips(from: Vector2, amount: float, into_stack: bool = true, to: Vector2 = Vector2.INF) -> void:
	if amount <= 0.0:
		return
	var target: Vector2 = stack_point() if into_stack else to
	var start: Vector2 = from if into_stack else stack_point()
	var chips: Array = breakdown(amount, 14 if into_stack else 6)
	for i: int in chips.size():
		var c: TextureRect = TextureRect.new()
		c.texture = chip_tex(float(chips[i]))
		c.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		c.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		c.size = Vector2(40, 34)
		c.pivot_offset = c.size / 2.0
		c.top_level = true
		c.z_index = 50
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(c)
		c.visible = false
		var jitter: Vector2 = Vector2(randf_range(-22, 22), randf_range(-14, 14))
		var lift: float = randf_range(70, 150)
		var spin: float = randf_range(-6.0, 6.0)
		var fly: Callable = func(u: float) -> void:
			c.visible = true
			var p: Vector2 = (start + jitter).lerp(target, u * u * (3.0 - 2.0 * u))
			p.y -= sin(u * PI) * lift
			c.position = p - c.size / 2.0
			c.rotation = spin * u
			c.scale = Vector2.ONE * lerpf(1.1, 0.7, u)
		var tw: Tween = c.create_tween()
		tw.tween_interval(i * 0.06)
		tw.tween_method(fly, 0.0, 1.0, 0.55)
		tw.tween_callback(func() -> void:
			if into_stack:
				Sound.xp_tick()
				_bump_stack()
			else:
				Sound.plip()
			c.queue_free())


func _buy(n: float) -> void:
	var before: float = Js.num(session.profile().get("casino_chips"))
	var r: Dictionary = await session.act("buyInCasino", [n])
	if r.has("error"):
		toast(str(r["error"]), RED)
		return
	session.persist()
	Sound.chest(false)
	fly_chips(_chips_l.get_global_rect().get_center() + Vector2(260, 0), n)
	roll_chips(before, float(r["newChips"]))


func _cash_out() -> void:
	var r: Dictionary = await session.act("cashOutCasino")
	if r.has("error"):
		toast(str(r["error"]), RED)
		return
	session.persist()
	Sound.chest(true)
	toast("Cashed out %s ⟡ to your purse" % Js.thousands(float(r["cashedOut"])))
	paint_purse()


func _open(which: String) -> void:
	game = which
	for c: Node in _tabs.get_children():
		c.queue_free()
	var xp: float = Js.num(session.profile().get("fishing_xp"))
	for t: Array in [["slots", "Fish Slots", ""], ["roulette", "Fish Roulette", "den_roulette"], ["blackjack", "Blackjack", "den_blackjack"]]:
		var block: String = Rules.gate_block("feature", t[2], xp) if t[2] != "" else ""
		var label: String = t[1] if block == "" else "%s  ·  %s" % [t[1], block]
		var b: Button = Paper.button(label, t[0] == which)
		b.disabled = block != ""
		b.pressed.connect(func() -> void: _open(t[0]))
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
	g.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	g.resized.connect(func() -> void: _table.custom_minimum_size = Vector2(0, g.size.y))
	g.minimum_size_changed.connect(func() -> void: _table.custom_minimum_size = Vector2(0, g.get_combined_minimum_size().y))
