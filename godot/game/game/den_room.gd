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
	# The purse.
	_strip = Kit.pane(col, { "radius": 10, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.3)], "shadow": [Color(0, 0, 0, 0.45), 16, Vector2(0, 5)], "pad": [22, 14, 22, 14], "paper": true })
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	_strip.add_child(row)
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
			_chips_l.text = Js.thousands(round(x)), from, to, 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func() -> void: paint_purse())


func _buy(n: float) -> void:
	var before: float = Js.num(session.profile().get("casino_chips"))
	var r: Dictionary = await session.act("buyInCasino", [n])
	if r.has("error"):
		toast(str(r["error"]), RED)
		return
	session.persist()
	Sound.chest(false)
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
