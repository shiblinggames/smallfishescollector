extends RefCounted
## Part of Locker (game/locker.gd): THE HOLD tab. One pip per space in the
## hold, coloured by what fills it; every fish aboard as a tile; what it all
## fetches at the Market against this water's buyer, and the Quick Sell.
## Static helpers that take the Locker as their first parameter; the tab's
## state (_hold_sort, _hold_detail) stays on the Locker. Pips moved with it.
## Split out of game/locker.gd on 2026-10-10 for size.


static func build(o: Locker) -> void:
	var session: Session = o.session
	var hud: FishingHud = o.hud
	var p: Dictionary = session.profile()
	var cap: int = int(Rules.fish_hold(Js.num(p.get("fish_hold_tier")))["capacity"])
	var rows: Array = []
	var hold: Dictionary = session.save["hold"]
	# Merchant's Eye (a skill): today's Market price, and which way it went.
	var eye: bool = Rules.has_skill(Js.num(p.get("fishing_xp")), "merchants_eye")
	# A crewmate reads the founder's stored market and never rolls one of its own.
	var mstate: Dictionary = {}
	if eye:
		mstate = Market.read(session.save) if session.remote != null else Market.current(session.save)
	var mkt: Dictionary = Js.obj(mstate.get("fish"))
	for k: Variant in hold:
		var f: Variant = session.store.species(float(str(k)))
		if f == null or float(hold[k]) <= 0:
			continue
		var fd: Dictionary = f
		var base: float = Js.num(session.store.species_value(float(str(k))))
		var mf: Dictionary = Js.obj(mkt.get(Js.key(float(str(k)))))
		var m: float = float(mf.get("m", 1.0))
		rows.append({ "id": float(str(k)), "name": fd["name"], "qty": float(hold[k]), "each": Market.price_each(base, m) if eye else base, "base": base,
			"trend": signf(m - float(mf.get("prev", m))) if eye else 0.0, "rarity": Js.num(fd.get("bite_rarity")) })
	var count: int = 0
	for r: Dictionary in rows:
		count += int(r["qty"])
	var top: HBoxContainer = HBoxContainer.new()
	o._body.add_child(top)
	var lt: Label = Paper.text(top, "%d of %d aboard" % [count, cap], "heading", Paper.INK)
	lt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if count >= cap:
		Paper.text(top, "Full. Sell before you cast again.", "small", Paper.RED)
	# One pip per space, coloured by what fills it (rarest first).
	var units: Array = []
	var by_rarity: Array = rows.duplicate()
	by_rarity.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["rarity"]) > float(b["rarity"]))
	for r: Dictionary in by_rarity:
		for i: int in int(r["qty"]):
			units.append(Paper.rarity(float(r["rarity"])))
	var pips: Pips = Pips.new()
	pips.cap = cap
	pips.units = units
	o._body.add_child(pips)
	var sorts: HBoxContainer = HBoxContainer.new()
	sorts.add_theme_constant_override("separation", 5)
	o._body.add_child(sorts)
	Paper.text(sorts, "Sort", "label", Paper.INK_SOFT).vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	for s: Array in [["value", "Value"], ["rarity", "Rarity"], ["name", "Name"]]:
		var b: Pane.PaneButton = Paper.tab(s[1], s[0] == o._hold_sort, false)
		b.pressed.connect(func() -> void:
			o._hold_sort = s[0]
			o._show_tab("hold"))
		sorts.add_child(b)
	match o._hold_sort:
		"value":
			rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["each"]) * float(a["qty"]) > float(b["each"]) * float(b["qty"]))
		"rarity":
			rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return [-float(a["rarity"]), a["name"]] < [-float(b["rarity"]), b["name"]])
		_:
			rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return String(a["name"]) < String(b["name"]))
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	o._body.add_child(scroll)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(grid)
	var zone: Dictionary = Chart.water_at(o.sea._boat.position)
	var res: Dictionary = Selling.resident(str(zone.get("id", "")))
	if rows.is_empty():
		Paper.text(grid, "Empty. Every fish you catch goes in here until you sell it.", "note", Paper.INK_SOFT, true)
	for r: Dictionary in rows:
		var t: Paper.Tile = Paper.Tile.new()
		t.label = r["name"]
		t.art = Skipper.fish_thumb(r["name"])
		t.pigment = Paper.rarity(float(r["rarity"]))
		t.corner = "×%d" % int(r["qty"])
		if eye and float(r["trend"]) != 0.0:
			t.corner += "  ▲" if float(r["trend"]) > 0.0 else "  ▼"
		t.custom_minimum_size = Vector2(124, 120)
		t.mouse_entered.connect(func() -> void: o._hold_detail.text = fish_line(r, res))
		t.focus_entered.connect(func() -> void: o._hold_detail.text = fish_line(r, res))
		grid.add_child(t)
	Paper.rule(o._body)
	o._hold_detail = Paper.text(o._body, "Point at a fish for what it fetches.", "note", Paper.INK_SOFT, true)
	var total: float = 0.0
	var at_rate: float = 0.0
	for r: Dictionary in rows:
		total += float(r["each"]) * float(r["qty"])
	if not res.is_empty():
		var stacks: Array = []
		for r: Dictionary in rows:
			stacks.append(float(r["base"]) * float(r["qty"]))
		var sum: float = 0.0
		for v: float in stacks:
			sum += v
		at_rate = floor(sum * float(res["rate"]))
	var money: VBoxContainer = VBoxContainer.new()
	money.add_theme_constant_override("separation", 2)
	o._body.add_child(money)
	Paper.stat(money, "At the Market on the Mainland, today" if eye else "At the Market on the Mainland, about", "%s ⟡" % Js.thousands(total), Paper.GREEN)
	# Quick Sell (a skill): the whole hold, from right here.
	var qs: float = Rules.quick_sell_rate(Js.num(p.get("fishing_xp")))
	if qs > 0.0 and not rows.is_empty():
		var today: float = 0.0
		for r: Dictionary in rows:
			var fid: float = float(r["id"])
			# A crewmate's estimate reads the stored market (Market.read_multiplier), never rolls.
			var mult: float = Market.read_multiplier(session.save, fid) if session.remote != null else Market.multiplier(session.save, fid)
			today += Market.price_each(float(r["base"]), mult) * float(r["qty"])
		var qb: Pane.PaneButton = Paper.button("Quick sell the hold here, %d%% of market:  %s ⟡" % [int(round(qs * 100.0)), Js.thousands(floor(today * qs))], true)
		qb.disabled = o.line_out()
		qb.pressed.connect(func() -> void:
			qb.disabled = true
			var r: Dictionary = await session.act("quickSellHold")
			if r.has("error"):
				hud.toast(str(r["error"]))
			else:
				session.persist()
				Rumble.buzz([0, 30, 40, 60])
				hud.toast("Sold %d fish for %s ⟡" % [int(r["fishSold"]), Js.thousands(float(r["earned"]))])
				hud.refresh()
			o._show_tab("hold"))
		money.add_child(qb)
	if res.is_empty():
		Paper.stat(money, "Out here", "Nobody buys in this water", Paper.INK_SOFT)
	else:
		Paper.stat(money, "To %s here, %d%% of market" % [res["name"], int(Js.round(float(res["rate"]) * 100.0))], "%s ⟡" % Js.thousands(at_rate), Paper.INK)
	var tiers: Array = Rules.data()["fishHoldTiers"]
	var at: int = clampi(int(Js.num(p.get("fish_hold_tier"))), 0, tiers.size() - 1)
	if at + 1 < tiers.size():
		var nxt: Dictionary = tiers[at + 1]
		Paper.text(o._body, "The Shipyard sells the next size, %d fish, for ⟡ %s." % [int(nxt["capacity"]), Js.thousands(float(nxt["cost"]))], "note", Paper.INK_SOFT, true)


static func fish_line(r: Dictionary, res: Dictionary) -> String:
	var each: float = float(r["each"])
	var t: String = "%s, %s.  ⟡ %s each at the Market%s, ⟡ %s for all %d" % [r["name"], Almanac.RARITY_NAMES[clampi(int(r["rarity"]) - 1, 0, 4)], Js.thousands(each), "" if float(r["trend"]) == 0.0 else ((" (up %s)" if float(r["trend"]) > 0.0 else " (down %s)") % ("today" if Market.daily() else "this hour")), Js.thousands(each * float(r["qty"])), int(r["qty"])]
	if not res.is_empty():
		t += ";  about ⟡ %s each to %s." % [Js.thousands(floor(float(r["base"]) * float(res["rate"]))), res["name"]]
	else:
		t += "."
	return t


## THE HOLD AS SPACES: one inked circle per space, filled with a dab of the
## pigment of the fish in it (rarest first), empty ones left as rings.
class Pips:
	extends Control
	var cap: int = 25
	var units: Array = []
	var _per_row: int = 25
	var _d: float = 16.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		resized.connect(_fit)
		_fit()

	func _fit() -> void:
		var w: float = maxf(200.0, size.x)
		_d = clampf(w / float(maxi(cap, 1)) - 3.0, 7.0, 18.0)
		_per_row = maxi(1, int(w / (_d + 3.0)))
		var rows: int = int(ceil(float(cap) / _per_row))
		custom_minimum_size = Vector2(0, rows * (_d + 3.0) + 2.0)
		queue_redraw()

	func _draw() -> void:
		for i: int in cap:
			var c: Vector2 = Vector2((i % _per_row) * (_d + 3.0) + _d / 2.0, (i / _per_row) * (_d + 3.0) + _d / 2.0 + 1.0)
			var r: float = _d / 2.0
			if i < units.size():
				var col: Color = units[i]
				draw_circle(c + Vector2(0.4, 0.3), r * (0.9 + 0.08 * sin(i * 2.3)), Color(col, 0.75))
			draw_arc(c, r, 0.0, TAU, 18, Color(Paper.INK, 0.45 if i < units.size() else 0.28), 1.0, true)
