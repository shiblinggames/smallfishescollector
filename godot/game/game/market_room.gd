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

const UP: Color = Kit.UP
const DOWN: Color = Kit.DOWN
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
	_next_at = Market.next_tick_after(float(state["lastTickAt"]))
	return out


## A water's label (and the web's colour, unused: no colour coding); the web
## lists four and shows the rest plainly.
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
	# The Advanced board comes at a Fishing level (port rules).
	var adv_block: String = Rules.gate_block("feature", "market_advanced", Js.num(session.profile().get("fishing_xp")))
	if adv_block != "":
		_advanced = false
	var adv: Button = Kit.button(("Advanced: %s" % ("On" if _advanced else "Off")) if adv_block == "" else "Advanced" + Kit.SEP + adv_block, "accent" if _advanced else "secondary", "small", GOLD)
	adv.disabled = adv_block != ""
	adv.tooltip_text = "The board: the market's mood, the Sea Index, the day's movers, price history and every species you have logged."
	adv.pressed.connect(func() -> void:
		_advanced = not _advanced
		Prefs.set_value("market_advanced", _advanced)
		rebuild())
	top.add_child(adv)

	if not _advanced:
		_counter(held, total, count)
		return
	_ticker(logged)
	if not held.is_empty():
		_hero(held, total, count)
	_holdings(held)
	_movers(logged)
	_browse(logged.filter(func(e: Dictionary) -> bool: return e["qty"] <= 0))
	var w: HBoxContainer = HBoxContainer.new()
	col.add_child(w)
	var wl: Label = Kit.text(w, "Wallet", "eyebrow", Color(SUB, Kit.EYEBROW_ALPHA))
	wl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Kit.text(w, "%s ⟡" % Js.thousands(Js.num(session.profile().get("doubloons"))), "heading", GOLD)


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
	Kit.chip(row, mood["label"], mc)
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
	Kit.text(ib, "Sea Index", "eyebrow", Color(SUB, Kit.EYEBROW_ALPHA))
	Kit.text(ib, "%.2f×" % idx, "name", INK)
	Kit.text(ib, "%s %s" % ["▲" if ipct >= 0.0 else "▼", pct_text(ipct)], "small", UP if ipct >= 0.0 else DOWN)
	var sp: Control = Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(sp)
	Kit.text(row, "New prices at sunrise, in" if Market.daily() else "Next update", "eyebrow", Color(SUB, Kit.EYEBROW_ALPHA))
	_countdown = Kit.text(row, "", "name", INK)
	_tick_countdown()
	Kit.text(v, mood["desc"], "small", SUB, true)
	var modes: HBoxContainer = HBoxContainer.new()
	modes.add_theme_constant_override("separation", 6)
	v.add_child(modes)
	var ml: Label = Kit.text(modes, ("TICKER COLORS" + Kit.SEP + "%s") % ("above normal price" if _mode == "normal" else ("up since yesterday" if Market.daily() else "up since last tick")), "small", Color(SUB, Kit.EYEBROW_ALPHA))
	ml.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# THE room tabs (Kit.tabs).
	Kit.tabs(modes, [["normal", "vs Normal"], ["movement", "Recent"]], _mode, accent, func(k: Variant) -> void:
		_mode = String(k)
		Prefs.set_value("market_color_mode", _mode)
		rebuild())


func _tick_countdown() -> void:
	if _countdown == null or not is_instance_valid(_countdown):
		return
	var left: int = maxi(0, int((_next_at - Clock.now_ms()) / 1000.0))
	_countdown.text = "%d:%02d" % [left / 60, left % 60]


func _process(delta: float) -> void:
	super._process(delta)
	if _all_armed > 0.0:
		_all_armed -= delta
		if _all_armed <= 0.0:
			rebuild()
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
	Kit.text(v, "Hold value", "eyebrow", Color(Kit.SAND, Kit.EYEBROW_ALPHA))
	Kit.text(v, "%s ⟡" % Js.thousands(total), "display", GOLD)
	if _advanced:
		var base: float = 0.0
		for e: Dictionary in held:
			var ref: float = 1.0 if _mode == "normal" else float(e["prev"])
			base += Market.price_each(float(e["value"]), ref) * float(e["qty"])
		var d: float = total - base
		var dp: float = d / maxf(1.0, base) * 100.0
		Kit.text(v, "%s%s ⟡ (%s)  %s" % ["+" if d >= 0 else "-", Js.thousands(absf(d)), pct_text(dp), "vs normal value" if _mode == "normal" else ("vs yesterday" if Market.daily() else "vs last tick")], "small", UP if d >= 0 else DOWN)
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
	Kit.text(v, "%d fish  ·  %d species" % [int(count), held.size()], "small", SUB)
	if not _confirm_all:
		var b: Button = Kit.button("Sell all %d fish   ·   %s ⟡" % [int(count), Js.thousands(total)], "primary")
		b.custom_minimum_size = Vector2(0, 54)
		b.add_theme_font_size_override("font_size", 18)
		b.pressed.connect(func() -> void:
			_confirm_all = true
			rebuild())
		v.add_child(b)
		Kit.text(v, "Full market price, paid straight away.", "small", SUB)
	else:
		Kit.text(v, "Sell all %d fish for %s ⟡? This cannot be undone." % [int(count), Js.thousands(total)], "body", INK, true)
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
	if _advanced:
		toast("+%s ⟡" % Js.thousands(float(r["earned"])))
	else:
		await get_tree().create_timer(0.25).timeout
	rebuild()


## THE one "Go fishing" (both boards): back to the water, in the fishing
## action's colour.
func _go_fishing() -> Button:
	var go: Button = Kit.button("Go fishing", "accent", "large", Kit.CAST)
	go.pressed.connect(close)
	return go


## What is aboard: a row per species, its worth, and a Sell for the stack.
func _holdings(held: Array) -> void:
	Room.heading(col, "Holdings")
	if held.is_empty():
		var p: PanelContainer = Room.panel(col, Room.box(Color(0.06, 0.07, 0.09, 0.9), Color(1, 1, 1, 0.07), 14, 22))
		var v: VBoxContainer = VBoxContainer.new()
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		p.add_child(v)
		var a: Label = Kit.text(v, "No fish in hold", "heading", INK)
		a.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var b: Label = Kit.text(v, "Sail out and catch something worth selling.", "desc", SUB)
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var go: Button = _go_fishing()
		go.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
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
	rh["border"] = [1, Color(GOLD, 0.35)]
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
	var dot: Label = Kit.text(h, "●", "small", Kit.rarity(int(e["rarity"])))
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var names: VBoxContainer = VBoxContainer.new()
	names.alignment = BoxContainer.ALIGNMENT_CENTER
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	names.add_theme_constant_override("separation", 0)
	h.add_child(names)
	Kit.text(names, e["name"], "name", INK).clip_text = true
	Kit.text(names, (("×%d" + Kit.SEP + "%s ⟡") % [int(e["qty"]), Js.thousands(stack)]) if _advanced else "%d aboard" % int(e["qty"]), "small", SUB)
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
		var a: Label = Kit.text(right, "%s ⟡" % Js.thousands(price), "name", INK)
		a.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		var b: Label = Kit.text(right, "%s %s" % ["▲" if sg[0] else "▼", pct_text(sg[1])], "small", UP if sg[0] else DOWN)
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	else:
		var a: Label = Kit.text(right, "%s ⟡" % Js.thousands(stack), "name", GOLD)
		a.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		var b: Label = Kit.text(right, "%s each" % Js.thousands(price), "small", SUB)
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var sell: Button = Kit.button("Sell", "primary", "small")
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
		Kit.text(pr, "%s ⟡" % Js.thousands(each(e)), "display_sm", INK)
		Kit.text(pr, "  %s %s  %s" % ["▲" if sg[0] else "▼", pct_text(sg[1]), "vs normal" if _mode == "normal" else ("vs yesterday" if Market.daily() else "vs last tick")], "desc", UP if sg[0] else DOWN).size_flags_vertical = Control.SIZE_SHRINK_CENTER
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
			var chip: Button = Kit.button(c[0], "secondary", "small")
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
		var p: PanelContainer = Room.panel(null, Room.box(Color(0.07, 0.08, 0.1, 0.95), Color(m[2], 0.3), 12, 14))
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		g.add_child(p)
		var v: VBoxContainer = VBoxContainer.new()
		p.add_child(v)
		Kit.text(v, String(m[0]), "eyebrow", Color(m[2], 0.8))
		Kit.text(v, e["name"], "heading", INK)
		Kit.text(v, "%s ⟡   %s" % [Js.thousands(each(e)), pct_text(_signal(e)[1])], "small", m[2])


## Every species logged and not aboard, sortable and by water.
func _browse(rows: Array) -> void:
	Room.heading(col, "Market Prices")
	var bar: HBoxContainer = HBoxContainer.new()
	bar.add_theme_constant_override("separation", 6)
	col.add_child(bar)
	Kit.tabs(bar, [["value", "Value"], ["change", "Change"], ["name", "A–Z"]], _sort, accent, func(k: Variant) -> void:
		_sort = String(k)
		rebuild())
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
		Kit.text(col, "No species match.", "desc", SUB)
		return
	var shown: Array = list if _show_all else list.slice(0, 10)
	for e: Dictionary in shown:
		var r: PanelContainer = Room.panel(col, Room.box(Color(0.07, 0.08, 0.1, 0.9), Color(1, 1, 1, 0.05), 10, 10))
		var h: HBoxContainer = HBoxContainer.new()
		h.add_theme_constant_override("separation", 10)
		r.add_child(h)
		Kit.text(h, "●", "small", Kit.rarity(int(e["rarity"])))
		var n: Label = Kit.text(h, e["name"], "name", INK)
		n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var hab: Array = _hab(e)
		Kit.text(h, hab[0], "small", SUB)
		Kit.text(h, "%s ⟡" % Js.thousands(floor(float(e["value"]) * float(e["m"]))), "name", INK)
		var sg: Array = _signal(e)
		Kit.text(h, "%s %s" % ["▲" if sg[0] else "▼", pct_text(sg[1])], "small", UP if sg[0] else DOWN)
	if list.size() > 10:
		var more: Button = Kit.button("Show less" if _show_all else "Show all %d species" % list.size(), "secondary", "small")
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


# ── The counter (Simple) ───────────────────────────────────────────────────────
#
# THE FISHMONGER'S COUNTER (Kong, 2026-10-03: "simplify how the market looks;
# selling should be ultra straightforward; show the image of the fish"). One
# sheet of paper: your purse at the top, a tile for each fish aboard (its
# picture, how many, what the stack fetches), and one button for the lot.
# Press a tile and that stack is sold: the tile pops, the coins fly to your
# purse and it counts up. "Sell everything" asks once more on the button
# itself, nowhere else.

const TILE: Vector2 = Vector2(212, 196)
var _purse_l: Label = null
var _purse_from: float = -1.0
var _all_armed: float = 0.0


func _counter(held: Array, total: float, count: float) -> void:
	var sheet: Control = Control.new()
	sheet.custom_minimum_size = Vector2(0, 0)
	sheet.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_child(sheet)
	var pane: Pane = Kit.pane(col, { "radius": 10, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.3)], "shadow": [Color(0, 0, 0, 0.45), 20, Vector2(0, 6)], "pad": [28, 22, 28, 24], "paper": true })
	sheet.queue_free()
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 16)
	pane.add_child(v)
	# The purse.
	var top: HBoxContainer = HBoxContainer.new()
	v.add_child(top)
	var what: Label = Paper.text(top, "Your hold" if not held.is_empty() else "Your hold is empty", "heading", Paper.INK)
	what.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Paper.text(top, "Purse", "label", Paper.INK_SOFT).size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var now_purse: float = Js.num(session.profile().get("doubloons"))
	_purse_l = Paper.text(top, "%s ⟡" % Js.thousands(now_purse if _purse_from < 0.0 else _purse_from), "display_sm", Paper.MONEY)
	if _purse_from >= 0.0 and _purse_from != now_purse:
		var from: float = _purse_from
		_purse_from = -1.0
		# The count-up waits for the coins to land (Motion.count, CUBIC out).
		var pl: Label = _purse_l
		get_tree().create_timer(0.35).timeout.connect(func() -> void:
			if is_instance_valid(pl):
				Motion.count(pl, from, now_purse, func(x: float) -> void:
					if is_instance_valid(pl):
						pl.text = "%s ⟡" % Js.thousands(round(x))))
	_purse_from = -1.0
	if held.is_empty():
		Paper.text(v, "Sail out and catch something worth selling.", "body", Paper.INK_SOFT)
		var go: Button = _go_fishing()
		go.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		v.add_child(go)
		return
	Paper.text(v, "Press a fish to sell that stack at today's price.", "note", Paper.INK_SOFT)
	var g: GridContainer = GridContainer.new()
	g.columns = maxi(1, int((col.custom_minimum_size.x - 56.0) / (TILE.x + 12.0))) if col.custom_minimum_size.x > 0.0 else 4
	g.add_theme_constant_override("h_separation", 12)
	g.add_theme_constant_override("v_separation", 12)
	v.add_child(g)
	for e: Dictionary in held:
		g.add_child(_tile(e))
	# The lot.
	var armed: bool = _all_armed > 0.0
	var all: Button = Kit.button(("Press again to sell all %d fish for %s ⟡" if armed else "Sell everything   ·   %s ⟡") % ([int(count), Js.thousands(total)] if armed else [Js.thousands(total)]), "primary")
	all.custom_minimum_size = Vector2(0, 58)
	all.add_theme_font_size_override("font_size", 19)
	all.pressed.connect(func() -> void:
		if _all_armed > 0.0:
			_all_armed = 0.0
			_sell_lot(g)
		else:
			_all_armed = 3.0
			rebuild())
	v.add_child(all)


## One fish aboard: its picture, how many, and what the stack fetches.
func _tile(e: Dictionary) -> Control:
	var price: float = each(e)
	var stack: float = price * float(e["qty"])
	var rar: Color = Paper.rarity(float(e["rarity"]))
	var n: Dictionary = { "radius": Kit.R_LARGE, "fill": [Color(1, 1, 1, 0.28)], "border": [1, Color(Kit.PAPER_INK, 0.22)], "pad": 0 }
	var h: Dictionary = n.duplicate()
	h["fill"] = [Color(1, 1, 1, 0.45)]
	h["border"] = [2, Color(rar, 0.8)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.custom_minimum_size = TILE
	b.tooltip_text = "Sell %d %s for %s ⟡ (%s each)" % [int(e["qty"]), e["name"], Js.thousands(stack), Js.thousands(price)]
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.offset_left = 12
	v.offset_right = -12
	v.offset_top = 10
	v.offset_bottom = -10
	v.add_theme_constant_override("separation", 2)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(v)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.fish_thumb(str(e["name"]))
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.custom_minimum_size = Vector2(0, 104)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pic.name = "Pic"
	v.add_child(pic)
	var nr: HBoxContainer = HBoxContainer.new()
	nr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(nr)
	var nm: Label = Paper.text(nr, str(e["name"]), "label", Paper.INK)
	nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nm.clip_text = true
	nm.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	Paper.text(nr, "×%d" % int(e["qty"]), "label", Paper.INK_SOFT)
	Paper.text(v, "%s ⟡" % Js.thousands(stack), "title", Paper.MONEY)
	b.pressed.connect(func() -> void: _sell_tile(b, e))
	return b


## A stack sold: the tile pops and goes, the coins fly to the purse.
func _sell_tile(tile: Control, e: Dictionary) -> void:
	if _busy:
		return
	_purse_from = Js.num(session.profile().get("doubloons"))
	_coins(tile.get_global_rect().get_center(), clampi(int(float(e["qty"])) + 3, 4, 14))
	_sold(tile, 0.0)
	Sound.seal(false)
	await _sell(float(e["id"]), float(e["qty"]))


## A sold tile going: a small swell (CUBIC out), then it fades and shrinks
## away (CUBIC in; the law keeps BACK off exits).
func _sold(tile: Control, delay: float) -> void:
	tile.pivot_offset = tile.size / 2.0
	tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tw: Tween = tile.create_tween()
	tw.tween_interval(delay)
	tw.tween_property(tile, "scale", Vector2(1.05, 1.05), 0.08).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.set_parallel(true)
	tw.chain().tween_property(tile, "scale", Vector2(0.6, 0.6), Motion.LEAVE).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tw.tween_property(tile, "modulate:a", 0.0, Motion.LEAVE).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)


## The lot: every tile goes, one after another, and the coins with them.
func _sell_lot(g: GridContainer) -> void:
	if _busy:
		return
	_purse_from = Js.num(session.profile().get("doubloons"))
	var k: int = 0
	for t: Node in g.get_children():
		var tile: Control = t
		var d: float = 0.05 * k
		get_tree().create_timer(d).timeout.connect(func() -> void:
			if not is_instance_valid(tile):
				return
			_coins(tile.get_global_rect().get_center(), 5)
			_sold(tile, 0.0))
		k += 1
	Sound.chest(true)
	await get_tree().create_timer(0.05 * k + 0.2).timeout
	await _sell_all()


## Gold coins arcing from a point up to the purse; each lands with a tick.
func _coins(from: Vector2, n: int) -> void:
	if _purse_l == null or not is_instance_valid(_purse_l):
		return
	var to: Vector2 = _purse_l.get_global_rect().get_center()
	for i: int in n:
		var c: TextureRect = TextureRect.new()
		c.texture = Glow.radial(32, GOLD, false)
		c.size = Vector2(22, 22)
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		c.top_level = true
		add_child(c)
		var off: Vector2 = Vector2(randf_range(-30, 30), randf_range(-20, 20))
		var lift: float = randf_range(60, 140)
		var fly: Callable = func(u: float) -> void:
			var p: Vector2 = (from + off).lerp(to, u * u)
			p.y -= sin(u * PI) * lift
			c.position = p - c.size / 2.0
			c.modulate.a = clampf(u * 6.0, 0.0, 1.0)
		var tw: Tween = c.create_tween()
		tw.tween_interval(i * 0.04)
		tw.tween_method(fly, 0.0, 1.0, 0.55)
		tw.tween_callback(func() -> void:
			Sound.xp_tick()
			c.queue_free())
