class_name MarketRoom
extends Room
## THE MARKET (Godot port of the Hold side of app/(app)/tavern/market/
## MarketClient.tsx, docking): where the hold sells for full price.
##
## Simple by default: what is aboard and what it is worth, Sell all (asked
## twice), and each stack with its own Sell. Advanced (remembered) adds the
## board: the market's mood, the Sea Index, the next tick's countdown, the
## ticker's colour mode, the hold's value against normal and a sparkline,
## the day's movers and every species you have logged. A stack's row opens the
## trade sheet to sell part of it. Every sale is Selling.*, the ported rules.
## The Exchange side waits for its own slice.

const UP: Color = Color("#4ade80")
const DOWN: Color = Color("#f87171")
const RARITY: Dictionary = { 1: "#9ca3af", 2: "#34d399", 3: "#60a5fa", 4: "#c084fc", 5: "#fb923c" }
const HABITAT: Dictionary = {
	"shallows": ["Shallows", "#38bdf8"], "open_waters": ["Open Waters", "#34d399"],
	"deep": ["Deep", "#818cf8"], "abyss": ["Abyss", "#f87171"],
}

var _advanced: bool = false
## 'normal' compares to the base price, 'movement' to the last tick.
var _mode: String = "normal"
var _confirm_all: bool = false
var _busy: bool = false
var _sort: String = "value"
var _zone: String = ""
var _show_all: bool = false
var _countdown: Label = null
var _next_at: float = 0.0


func _init() -> void:
	title = "The Market"
	_advanced = Prefs.get_value("market_advanced", false)
	_mode = Prefs.get_value("market_color_mode", "normal")


func _ready() -> void:
	super._ready()
	if session.remote != null:
		await session.act("marketRefresh")
		if is_inside_tree():
			rebuild()


func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var g: Gradient = Gradient.new()
	g.set_color(0, Color("#0c0e13"))
	g.set_color(1, Color("#090a0e"))
	var gt: GradientTexture2D = GradientTexture2D.new()
	gt.gradient = g
	gt.fill_from = Vector2(0, 0)
	gt.fill_to = Vector2(0, 1)
	var tr: TextureRect = TextureRect.new()
	tr.texture = gt
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_SCALE
	tr.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(tr)
	var ledger: Ledger = Ledger.new()
	ledger.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ledger.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(ledger)


## The page's ledger lines and the warm light from above.
class Ledger:
	extends Control

	func _draw() -> void:
		var y: float = 0.0
		while y < size.y:
			draw_line(Vector2(0, y), Vector2(size.x, y), Color(1, 1, 1, 0.015), 1.0)
			y += 30.0
		var glow: Texture2D = Glow.radial(256, Color(0.77, 0.66, 0.42))
		draw_texture_rect(glow, Rect2(size.x * -0.1, -size.y * 0.35, size.x * 1.2, size.y * 0.7), false, Color(1, 1, 1, 0.11))


# ── The board ──────────────────────────────────────────────────────────────────

## MarketFishEntry for every species, sorted by price today: its base value,
## the multiplier now and at the last tick, its history, and how many are
## aboard. `logged` marks the species in the collection (the browse list).
func _entries() -> Array:
	# A crewmate's market is the founder's: read the copy it sent, never roll.
	var state: Dictionary = session.save["market"] if session.remote != null and session.save.get("market") != null else Market.current(session.save)
	var fish: Dictionary = state["fish"]
	var held: Dictionary = {}
	for s: Dictionary in session.store.hold_stacks(session.uid):
		held[float(s["fish_id"])] = float(s["quantity"])
	var logged: Dictionary = {}
	for id: Variant in session.store.collection_ids(session.uid):
		logged[float(id)] = true
	var out: Array = []
	for sp: Dictionary in session.save["species"]:
		var id: float = float(sp["id"])
		var f: Dictionary = Js.obj(fish.get(Js.key(id)))
		out.append({
			"id": id, "name": sp["name"], "habitat": sp["habitat"], "rarity": float(sp["bite_rarity"]),
			"value": Js.num(sp.get("sell_value")), "qty": float(held.get(id, 0.0)),
			"m": float(f.get("m", 1.0)), "prev": float(f.get("prev", 1.0)), "history": Js.list(f.get("history")),
			"logged": logged.has(id),
		})
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a["value"] * a["m"] > b["value"] * b["m"])
	_next_at = float(state["lastTickAt"]) + Market.HOUR
	return out


## A water's label and colour; the web lists four and shows the rest plainly.
static func _hab(e: Dictionary) -> Array:
	return HABITAT.get(e["habitat"], [String(e["habitat"]).capitalize(), "#9fb4c2"])


static func each(e: Dictionary) -> float:
	return Market.price_each(float(e["value"]), float(e["m"]))


## The signal a row shows: up or down, and by how much, against the normal
## price or the last tick.
func _signal(e: Dictionary) -> Array:
	if _mode == "movement":
		var pct: float = (float(e["m"]) - float(e["prev"])) / maxf(0.0001, float(e["prev"])) * 100.0
		return [pct >= 0.0, pct]
	return [float(e["m"]) >= 1.0, (float(e["m"]) - 1.0) * 100.0]


static func pct_text(pct: float) -> String:
	return "%s%.1f%%" % ["+" if pct >= 0.0 else "-", absf(pct)]


func _build() -> void:
	var all: Array = _entries()
	var held: Array = all.filter(func(e: Dictionary) -> bool: return e["qty"] > 0)
	var logged: Array = all.filter(func(e: Dictionary) -> bool: return e["logged"])
	var total: float = 0.0
	var count: float = 0.0
	for e: Dictionary in held:
		total += each(e) * float(e["qty"])
		count += float(e["qty"])

	# The Advanced switch.
	var top: HBoxContainer = HBoxContainer.new()
	top.alignment = BoxContainer.ALIGNMENT_END
	col.add_child(top)
	var adv: Button = Room.tinted("Advanced: %s" % ("On" if _advanced else "Off"), Color("#b9c6d0") if not _advanced else GOLD, 12, 30)
	adv.pressed.connect(func() -> void:
		_advanced = not _advanced
		Prefs.set_value("market_advanced", _advanced)
		rebuild())
	top.add_child(adv)

	if _advanced:
		_ticker(logged)
	if not held.is_empty():
		_hero(held, total, count)
	_holdings(held)
	if _advanced:
		_movers(logged)
		_browse(logged.filter(func(e: Dictionary) -> bool: return e["qty"] <= 0))
	var w: HBoxContainer = HBoxContainer.new()
	col.add_child(w)
	var wl: Label = Room.text(w, "WALLET", 12, Color(0.75, 0.83, 0.89, 0.6))
	wl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Room.text(w, "%s ⟡" % Js.thousands(Js.num(session.profile().get("doubloons"))), 18, GOLD, true)


## The mood, the Sea Index, the next tick, and the colour mode.
func _ticker(logged: Array) -> void:
	var state: Dictionary = session.save["market"]
	var moods: Dictionary = Rules.data()["marketMoods"]
	var mood: Dictionary = moods.get(state["mood"], moods["calm"])
	var p: PanelContainer = Room.panel(col, Room.box(Color(0.06, 0.07, 0.09, 0.95), Color(1, 1, 1, 0.08), 14, 14))
	var v: VBoxContainer = VBoxContainer.new()
	p.add_child(v)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	v.add_child(row)
	var mc: Color = Color(mood["color"])
	Room.chip(row, mood["label"], mc, Color(mc, 0.1), Color(mc, 0.25), 13)
	var idx: float = 0.0
	var idx_prev: float = 0.0
	for e: Dictionary in logged:
		idx += float(e["m"])
		idx_prev += float(e["prev"])
	var n: float = maxf(1.0, logged.size())
	idx = idx / n if not logged.is_empty() else 1.0
	idx_prev = idx_prev / n if not logged.is_empty() else 1.0
	var ipct: float = (idx - idx_prev) / maxf(0.0001, idx_prev) * 100.0 if _mode == "movement" else (idx - 1.0) * 100.0
	var ib: HBoxContainer = HBoxContainer.new()
	row.add_child(ib)
	Room.text(ib, "SEA INDEX", 11, Color(0.75, 0.83, 0.89, 0.6))
	Room.text(ib, "%.2f×" % idx, 15, INK, true)
	Room.text(ib, "%s %s" % ["▲" if ipct >= 0.0 else "▼", pct_text(ipct)], 13, UP if ipct >= 0.0 else DOWN)
	var sp: Control = Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(sp)
	Room.text(row, "NEXT UPDATE", 11, Color(0.75, 0.83, 0.89, 0.6))
	_countdown = Room.text(row, "", 15, INK, true)
	_tick_countdown()
	Room.text(v, mood["desc"], 13, SUB, false, true)
	var modes: HBoxContainer = HBoxContainer.new()
	modes.add_theme_constant_override("separation", 6)
	v.add_child(modes)
	var ml: Label = Room.text(modes, "TICKER COLORS  ·  %s" % ("above normal price" if _mode == "normal" else "up since last tick"), 11, Color(0.75, 0.83, 0.89, 0.6))
	ml.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for m: Array in [["normal", "vs Normal"], ["movement", "Recent"]]:
		var on: bool = _mode == m[0]
		var b: Button = Room.tinted(m[1], GOLD if on else Color("#8a95a0"), 12, 28)
		b.pressed.connect(func() -> void:
			_mode = m[0]
			Prefs.set_value("market_color_mode", _mode)
			rebuild())
		modes.add_child(b)


func _tick_countdown() -> void:
	if _countdown == null or not is_instance_valid(_countdown):
		return
	var left: int = maxi(0, int((_next_at - Clock.now_ms()) / 1000.0))
	_countdown.text = "%d:%02d" % [left / 60, left % 60]


func _process(delta: float) -> void:
	super._process(delta)
	if _countdown != null and is_instance_valid(_countdown):
		_tick_countdown()
		if Clock.now_ms() >= _next_at and _next_at > 0.0:
			_next_at = 0.0
			rebuild.call_deferred()


## The hold's value, and Sell all (asked twice).
func _hero(held: Array, total: float, count: float) -> void:
	var p: PanelContainer = Room.panel(col, Room.box(Color(0.08, 0.075, 0.06, 0.96), Color(0.77, 0.66, 0.42, 0.3), 18, 20))
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	p.add_child(v)
	Room.text(v, "HOLD VALUE", 12, Color(0.85, 0.78, 0.6, 0.75))
	Room.text(v, "%s ⟡" % Js.thousands(total), 38, GOLD, true)
	if _advanced:
		var base: float = 0.0
		for e: Dictionary in held:
			var ref: float = 1.0 if _mode == "normal" else float(e["prev"])
			base += Market.price_each(float(e["value"]), ref) * float(e["qty"])
		var d: float = total - base
		var dp: float = d / maxf(1.0, base) * 100.0
		Room.text(v, "%s%s ⟡ (%s)  %s" % ["+" if d >= 0 else "-", Js.thousands(absf(d)), pct_text(dp), "vs normal value" if _mode == "normal" else "vs last tick"], 13, UP if d >= 0 else DOWN)
		var line: Array = []
		var n: int = 0
		for e: Dictionary in held:
			n = maxi(n, (e["history"] as Array).size())
		for i: int in n:
			var sum: float = 0.0
			for e: Dictionary in held:
				var h: Array = e["history"]
				var k: int = i - (n - h.size())
				var m: float = float(h[k]) if k >= 0 else 1.0
				sum += Market.price_each(float(e["value"]), m) * float(e["qty"])
			line.append(sum)
		line.append(total)
		var s: Spark = Spark.new()
		s.points = line
		s.color = UP if d >= 0 else DOWN
		s.custom_minimum_size = Vector2(0, 56)
		v.add_child(s)
	Room.text(v, "%d fish  ·  %d species" % [int(count), held.size()], 13, SUB)
	if not _confirm_all:
		var b: Button = Kit.button("Sell all %d fish   ·   %s ⟡" % [int(count), Js.thousands(total)], "primary")
		b.custom_minimum_size = Vector2(0, 54)
		b.add_theme_font_size_override("font_size", 18)
		b.pressed.connect(func() -> void:
			_confirm_all = true
			rebuild())
		v.add_child(b)
		Room.text(v, "Full market price, paid straight away.", 12, SUB)
	else:
		Room.text(v, "Sell all %d fish for %s ⟡? This cannot be undone." % [int(count), Js.thousands(total)], 15, INK, false, true)
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		v.add_child(row)
		var keep: Button = Kit.button("Keep fishing", "secondary")
		keep.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		keep.pressed.connect(func() -> void:
			_confirm_all = false
			rebuild())
		row.add_child(keep)
		var go: Button = Kit.button("Selling…" if _busy else "Sell  ·  %s ⟡" % Js.thousands(total), "primary")
		go.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		go.pressed.connect(_sell_all)
		row.add_child(go)
		go.grab_focus.call_deferred()


func _sell_all() -> void:
	if _busy:
		return
	_busy = true
	var r: Dictionary = await session.act("sellEntireHold")
	_busy = false
	_confirm_all = false
	_after_sale(r, "The sale did not go through.")


func _sell(id: float, qty: float) -> void:
	if _busy:
		return
	_busy = true
	var r: Dictionary = await session.act("marketSellFish", [id, qty])
	_busy = false
	_after_sale(r, "The sale did not go through.")


func _after_sale(r: Dictionary, fallback: String) -> void:
	if r.has("error"):
		toast(str(Js.nz(r.get("error"), fallback)), DOWN)
		rebuild()
		return
	session.persist()
	Rumble.buzz([0, 30, 40, 60])
	toast("+%s ⟡" % Js.thousands(float(r["earned"])))
	rebuild()


## What is aboard: a row per species, its worth, and a Sell for the stack.
func _holdings(held: Array) -> void:
	Room.heading(col, "Holdings")
	if held.is_empty():
		var p: PanelContainer = Room.panel(col, Room.box(Color(0.06, 0.07, 0.09, 0.9), Color(1, 1, 1, 0.07), 14, 22))
		var v: VBoxContainer = VBoxContainer.new()
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		p.add_child(v)
		var a: Label = Room.text(v, "No fish in hold", 18, INK, true)
		a.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var b: Label = Room.text(v, "Sail out and catch something worth selling.", 14, SUB)
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var go: Button = Kit.button("Go Fishing", "accent", "large", Color("#67d4e8"))
		go.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		go.pressed.connect(close)
		v.add_child(go)
		return
	var g: GridContainer = Room.grid(col, 2 if col.custom_minimum_size.x >= 800.0 else 1, 8)
	for e: Dictionary in held:
		g.add_child(_holding_row(e))


func _holding_row(e: Dictionary) -> Control:
	var price: float = each(e)
	var stack: float = price * float(e["qty"])
	var rs: Dictionary = Kit.row(0)
	var rh: Dictionary = rs.duplicate()
	rh["border"] = [1, Color(0.94, 0.75, 0.25, 0.35)]
	var row: Pane.PaneButton = Pane.PaneButton.new(rs, rh)
	row.custom_minimum_size = Vector2(0, 64)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.pressed.connect(func() -> void: _trade(e))
	var h: HBoxContainer = HBoxContainer.new()
	h.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	h.offset_left = 14
	h.offset_right = -10
	h.add_theme_constant_override("separation", 10)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(h)
	var dot: Label = Room.text(h, "●", 12, Color(RARITY.get(int(e["rarity"]), "#9ca3af")))
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var names: VBoxContainer = VBoxContainer.new()
	names.alignment = BoxContainer.ALIGNMENT_CENTER
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	names.add_theme_constant_override("separation", 0)
	h.add_child(names)
	Room.text(names, e["name"], 15, INK, true).clip_text = true
	Room.text(names, ("×%d  ·  %s ⟡" % [int(e["qty"]), Js.thousands(stack)]) if _advanced else "%d aboard" % int(e["qty"]), 12, SUB)
	if _advanced:
		var sp: Spark = Spark.new()
		var pts: Array = (e["history"] as Array).duplicate()
		pts.append(e["m"])
		sp.points = pts
		var sg: Array = _signal(e)
		sp.color = UP if sg[0] else DOWN
		sp.custom_minimum_size = Vector2(50, 26)
		sp.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(sp)
	var right: VBoxContainer = VBoxContainer.new()
	right.alignment = BoxContainer.ALIGNMENT_CENTER
	right.add_theme_constant_override("separation", 0)
	h.add_child(right)
	if _advanced:
		var sg: Array = _signal(e)
		var a: Label = Room.text(right, "%s ⟡" % Js.thousands(price), 15, INK, true)
		a.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		var b: Label = Room.text(right, "%s %s" % ["▲" if sg[0] else "▼", pct_text(sg[1])], 12, UP if sg[0] else DOWN)
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	else:
		var a: Label = Room.text(right, "%s ⟡" % Js.thousands(stack), 15, GOLD, true)
		a.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		var b: Label = Room.text(right, "%s each" % Js.thousands(price), 12, SUB)
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var sell: Button = Room.tinted("Sell", Color("#7fd49a"), 14, 36)
	sell.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	sell.mouse_filter = Control.MOUSE_FILTER_STOP
	sell.pressed.connect(func() -> void: _sell(float(e["id"]), float(e["qty"])))
	h.add_child(sell)
	return row


## The trade sheet: part of a stack, at today's price.
func _trade(e: Dictionary) -> void:
	var sh: Sheet = Sheet.new()
	sh.title = e["name"]
	var hab: Array = _hab(e)
	sh.blurb = "%s  ·  holding ×%d" % [hab[0], int(e["qty"])]
	sh.ready.connect(func() -> void:
		var sg: Array = _signal(e)
		var pr: HBoxContainer = HBoxContainer.new()
		sh.body.add_child(pr)
		Room.text(pr, "%s ⟡" % Js.thousands(each(e)), 26, INK, true)
		Room.text(pr, "  %s %s  %s" % ["▲" if sg[0] else "▼", pct_text(sg[1]), "vs normal" if _mode == "normal" else "vs last tick"], 14, UP if sg[0] else DOWN).size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var sp: Spark = Spark.new()
		var pts: Array = (e["history"] as Array).duplicate()
		pts.append(e["m"])
		sp.points = pts
		sp.color = UP if sg[0] else DOWN
		sp.custom_minimum_size = Vector2(0, 70)
		sh.body.add_child(sp)
		var hi: float = float(e["m"])
		var lo: float = float(e["m"])
		for m: Variant in e["history"]:
			hi = maxf(hi, float(m))
			lo = minf(lo, float(m))
		sh.stat("Base", "%s ⟡" % Js.thousands(float(e["value"])))
		sh.stat("24h High", "%s ⟡" % Js.thousands(Market.price_each(float(e["value"]), hi)))
		sh.stat("24h Low", "%s ⟡" % Js.thousands(Market.price_each(float(e["value"]), lo)))
		sh.stat("Mult", "%.2f×" % float(e["m"]))
		sh.section("Sell quantity")
		var qrow: HBoxContainer = HBoxContainer.new()
		qrow.add_theme_constant_override("separation", 8)
		sh.body.add_child(qrow)
		var q: SpinBox = SpinBox.new()
		q.min_value = 1
		q.max_value = float(e["qty"])
		q.step = 1
		q.value = float(e["qty"])
		q.custom_minimum_size = Vector2(120, 0)
		qrow.add_child(q)
		var go: Button = Kit.button("Sell", "primary")
		go.custom_minimum_size = Vector2(0, 50)
		var label: Callable = func() -> void:
			go.text = "Sell %d  ·  %s ⟡" % [int(q.value), Js.thousands(each(e) * q.value)]
		for c: Array in [["25%", 0.25], ["50%", 0.5], ["All", 1.0]]:
			var chip: Button = Room.tinted(c[0], Color("#b9c6d0"), 13, 34)
			chip.pressed.connect(func() -> void: q.value = maxf(1.0, floor(float(e["qty"]) * float(c[1]))))
			qrow.add_child(chip)
		q.value_changed.connect(func(_v: float) -> void: label.call())
		label.call()
		go.pressed.connect(func() -> void:
			sh.close()
			_sell(float(e["id"]), q.value))
		sh.body.add_child(go)
		sh.note("No fee  ·  instant payout"))
	add_child(sh)


## Today's biggest riser and faller, when anything has moved.
func _movers(logged: Array) -> void:
	if logged.is_empty():
		return
	var up: Dictionary = {}
	var down: Dictionary = {}
	for e: Dictionary in logged:
		var pct: float = _signal(e)[1]
		if pct > 0.05 and (up.is_empty() or pct > _signal(up)[1]):
			up = e
		if pct < -0.05 and (down.is_empty() or pct < _signal(down)[1]):
			down = e
	if up.is_empty() and down.is_empty():
		return
	Room.heading(col, "Today's Movers")
	var g: GridContainer = Room.grid(col, 2, 8)
	for m: Array in [["Top Riser", up, UP], ["Top Faller", down, DOWN]]:
		var e: Dictionary = m[1]
		if e.is_empty():
			continue
		var p: PanelContainer = PanelContainer.new()
		p.add_theme_stylebox_override("panel", Room.box(Color(0.07, 0.08, 0.1, 0.95), Color(m[2], 0.3), 12, 14))
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		g.add_child(p)
		var v: VBoxContainer = VBoxContainer.new()
		p.add_child(v)
		Room.text(v, (m[0] as String).to_upper(), 11, Color(m[2], 0.8))
		Room.text(v, e["name"], 16, INK, true)
		Room.text(v, "%s ⟡   %s" % [Js.thousands(each(e)), pct_text(_signal(e)[1])], 13, m[2])


## Every species logged and not aboard, sortable and by water.
func _browse(rows: Array) -> void:
	Room.heading(col, "Market Prices")
	var bar: HBoxContainer = HBoxContainer.new()
	bar.add_theme_constant_override("separation", 6)
	col.add_child(bar)
	for s: Array in [["value", "Value"], ["change", "Change"], ["name", "A–Z"]]:
		var b: Button = Room.tinted(s[1], GOLD if _sort == s[0] else Color("#8a95a0"), 12, 30)
		b.pressed.connect(func() -> void:
			_sort = s[0]
			rebuild())
		bar.add_child(b)
	var sp: Control = Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.add_child(sp)
	var zone: OptionButton = OptionButton.new()
	zone.add_theme_font_size_override("font_size", 13)
	zone.add_item("All zones")
	var keys: Array = HABITAT.keys()
	for k: String in keys:
		zone.add_item(HABITAT[k][0])
	zone.selected = 0 if _zone == "" else keys.find(_zone) + 1
	zone.item_selected.connect(func(i: int) -> void:
		_zone = "" if i == 0 else keys[i - 1]
		rebuild())
	bar.add_child(zone)
	var list: Array = rows.filter(func(e: Dictionary) -> bool: return _zone == "" or e["habitat"] == _zone)
	match _sort:
		"change":
			list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return _signal(a)[1] > _signal(b)[1])
		"name":
			list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return String(a["name"]) < String(b["name"]))
	if list.is_empty():
		Room.text(col, "No species match.", 14, SUB)
		return
	var shown: Array = list if _show_all else list.slice(0, 10)
	for e: Dictionary in shown:
		var r: PanelContainer = Room.panel(col, Room.box(Color(0.07, 0.08, 0.1, 0.9), Color(1, 1, 1, 0.05), 10, 10))
		var h: HBoxContainer = HBoxContainer.new()
		h.add_theme_constant_override("separation", 10)
		r.add_child(h)
		Room.text(h, "●", 12, Color(RARITY.get(int(e["rarity"]), "#9ca3af")))
		var n: Label = Room.text(h, e["name"], 14, INK, true)
		n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var hab: Array = _hab(e)
		Room.text(h, hab[0], 12, Color(hab[1]))
		Room.text(h, "%s ⟡" % Js.thousands(floor(float(e["value"]) * float(e["m"]))), 14, INK, true)
		var sg: Array = _signal(e)
		Room.text(h, "%s %s" % ["▲" if sg[0] else "▼", pct_text(sg[1])], 12, UP if sg[0] else DOWN)
	if list.size() > 10:
		var more: Button = Room.tinted("Show less" if _show_all else "Show all %d species" % list.size(), Color("#b9c6d0"), 13, 34)
		more.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		more.pressed.connect(func() -> void:
			_show_all = not _show_all
			rebuild())
		col.add_child(more)


## A sparkline: the points as a line with a soft fill beneath.
class Spark:
	extends Control
	var points: Array = []
	var color: Color = Color.WHITE

	func _draw() -> void:
		if points.size() < 2:
			draw_line(Vector2(0, size.y / 2.0), Vector2(size.x, size.y / 2.0), Color(color, 0.5), 1.5)
			return
		var lo: float = INF
		var hi: float = -INF
		for p: Variant in points:
			lo = minf(lo, float(p))
			hi = maxf(hi, float(p))
		var span: float = maxf(0.0001, hi - lo)
		var line: PackedVector2Array = PackedVector2Array()
		for i: int in points.size():
			var x: float = size.x * i / float(points.size() - 1)
			var y: float = size.y - 2.0 - (float(points[i]) - lo) / span * (size.y - 4.0)
			line.append(Vector2(x, y))
		var fill: PackedVector2Array = line.duplicate()
		fill.append(Vector2(size.x, size.y))
		fill.append(Vector2(0, size.y))
		draw_colored_polygon(fill, Color(color, 0.12))
		draw_polyline(line, color, 1.6, true)
