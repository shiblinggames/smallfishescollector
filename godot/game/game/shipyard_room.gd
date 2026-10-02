class_name ShipyardRoom
extends Room
## THE SHIPYARD (Godot port of app/(app)/shipyard/ShipyardClient.tsx, on the
## style kit). Tie up at the Shipyard and this opens over the chart.
##
## Two tabs. REFIT YOUR BOAT: five ladders, each bought a rung at a time and
## each read in units people use (top speed in m/s, turning in degrees a second,
## pick-up in seconds to top speed, the hold in fish, the lantern in metres of
## light): the value now, what it does and why it matters, the whole ladder,
## and the next rung behind a confirm (it cannot be undone). YOUR RIG: what you
## carry (the loadout), changed here; the Tackle Shop ashore sells it.
##
## The rod rack the web once sold here was retired there (2 players of 81
## ever bought a rung); every rod you own sails with you.

const LADDERS: Array = [
	# key, tab, title, accent, unit, column
	["hull", "Speed", "Speed", "#9fc9e8", "top speed", "hull_speed_tier"],
	["handling", "Turning", "Turning", "#7dd3fc", "how fast she turns", "hull_handling_tier"],
	["accel", "Pick-up", "Pick-up", "#a7f3d0", "to reach top speed", "hull_accel_tier"],
	["hold", "Hold", "Fish hold", "#f0c040", "before you have to sell", "fish_hold_tier"],
	["lantern", "Lantern", "Lantern", "#ffc07a", "lit after dark", "lantern_tier"],
]
const EXPLAIN: Dictionary = {
	"hull": ["Raises your top speed, so you cross the chart in less time.", "It changes nothing about fishing. Bites, catch zones and rarity are untouched. It only shortens the sail to the deep water and back."],
	"handling": ["Turns the boat faster, so she comes round in fewer degrees of drift.", "Top speed is the long haul out. This is everything you do once you are there: pulling alongside a drifting trader, threading a wreck field, holding a line through a hotspot."],
	"accel": ["Reaches top speed sooner after every stop.", "Every stop and start: after a cast, after a hail, coming off a dock. It does not raise your top speed, only how quickly you reach it."],
	"hold": ["Holds more fish, so you can stay out longer before selling.", "A full hold stops you casting. Selling to a zone buyer or at the market ashore is what empties it."],
	"lantern": ["Widens the pool of light your boat casts at night.", "It changes nothing at all by day, and nothing about fishing at any hour. What it changes is how much of the water ahead you can see once the sun is down."],
}

var _tab: String = "refit"
var _ladder: String = "hull"
var _busy: bool = false
var _error: String = ""


func _init() -> void:
	title = "The Shipyard"
	accent = Color("#9fc9e8")


func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.color = Color("#08121c")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var glow: TextureRect = TextureRect.new()
	glow.texture = Glow.radial(256, Color("#2a5a7a"))
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.modulate.a = 0.35
	glow.anchor_left = -0.1
	glow.anchor_right = 1.1
	glow.anchor_top = -0.5
	glow.anchor_bottom = 0.6
	add_child(glow)


func _badge() -> Control:
	var h: HBoxContainer = HBoxContainer.new()
	Kit.money(h, Js.num(session.profile().get("doubloons")), "price", false, "number")
	return h


# ── The numbers, in units people read (lib/shipyard.ts) ───────────────────────

func _tier(key: String) -> float:
	return Js.num(session.profile().get(_col(key)))


static func _col(key: String) -> String:
	for l: Array in LADDERS:
		if l[0] == key:
			return l[5]
	return ""


func _max(key: String) -> int:
	if key == "hold":
		return (Rules.data()["fishHoldTiers"] as Array).size() - 1
	return Shipyard.max_tier(_col(key))


## The value at a tier, as text with its unit.
static func _value(key: String, t: float) -> String:
	var base: Dictionary = Rules.data()["shipyard"]["base"]
	match key:
		"hull":
			return "%.1f m/s" % (float(base["speedPx"]) * Shipyard.effect("hull_speed_tier", t) / 30.0)
		"handling":
			return "%d°/s" % int(Js.round(float(base["turnRad"]) * Shipyard.effect("hull_handling_tier", t) * 180.0 / PI))
		"accel":
			return "%.1fs" % (3.0 / (float(base["accel"]) * Shipyard.effect("hull_accel_tier", t)))
		"lantern":
			return "%.1f m" % ((132.0 + 46.0) * Shipyard.effect("lantern_tier", t) * 2.0 / 30.0)
		"hold":
			return "%d fish" % int(Rules.fish_hold(t)["capacity"])
	return ""


static func _gain(key: String, t: float) -> String:
	var base: Dictionary = Rules.data()["shipyard"]["base"]
	match key:
		"hull":
			return "+%.1f m/s faster" % (float(base["speedPx"]) * (Shipyard.effect("hull_speed_tier", t + 1.0) - Shipyard.effect("hull_speed_tier", t)) / 30.0)
		"handling":
			return "+%d°/s sharper" % int(Js.round(float(base["turnRad"]) * (Shipyard.effect("hull_handling_tier", t + 1.0) - Shipyard.effect("hull_handling_tier", t)) * 180.0 / PI))
		"accel":
			return "%.1fs quicker" % (3.0 / (float(base["accel"]) * Shipyard.effect("hull_accel_tier", t)) - 3.0 / (float(base["accel"]) * Shipyard.effect("hull_accel_tier", t + 1.0)))
		"lantern":
			return "+%.1f m of light" % ((178.0) * (Shipyard.effect("lantern_tier", t + 1.0) - Shipyard.effect("lantern_tier", t)) * 2.0 / 30.0)
		"hold":
			return "+%d more fish" % int(float(Rules.fish_hold(t + 1.0)["capacity"]) - float(Rules.fish_hold(t)["capacity"]))
	return ""


static func _cost(key: String, t: int) -> float:
	if key == "hold":
		return float(Rules.fish_hold(float(t))["cost"])
	return float((Shipyard.ladder(_col(key))["costs"] as Array)[t])


# ── The page ───────────────────────────────────────────────────────────────────

func _build() -> void:
	if _error != "":
		Kit.text(col, _error, "small", Color("#e6a0a0"), true)
	var cols: HBoxContainer = HBoxContainer.new()
	cols.add_theme_constant_override("separation", 18)
	col.add_child(cols)
	_stage(cols)
	var right: VBoxContainer = VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.size_flags_stretch_ratio = 1.4
	right.add_theme_constant_override("separation", 12)
	cols.add_child(right)
	Kit.tabs(right, [["refit", "Refit your boat"], ["rig", "Your rig"]], _tab, accent, func(k: Variant) -> void:
		_tab = k
		rebuild(), true)
	if _tab == "refit":
		_refit(right)
	else:
		Kit.text(right, "Press anything to change it. Rods, reels and hooks are bought at the Tackle Shop ashore.", "note", Kit.DIM, true)
		var view: LoadoutView = LoadoutView.new()
		view.session = session
		view.line_out = false
		right.add_child(view)


## Your boat as she sails, and what she is fitted with.
func _stage(parent: Control) -> void:
	var left: VBoxContainer = VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 10)
	parent.add_child(left)
	var frame: Pane = Kit.pane(left, { "radius": 16, "fill": [Color("#0b1a26")], "border": [1, Color(1, 1, 1, 0.1)], "pad": 0 })
	frame.custom_minimum_size = Vector2(0, 260)
	frame.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex("welcome-harbour-open.webp")
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	frame.add_child(pic)
	var holder: Control = Control.new()
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(holder)
	var sk: Skipper = Skipper.new()
	sk.box_scale = 1.15
	sk.scale.x = -1.0
	holder.add_child(sk)
	sk.set_look(Skipper.look_of(session.profile()))
	holder.resized.connect(func() -> void: sk.position = Vector2(holder.size.x * 0.52, holder.size.y * 0.66))
	var stats: Pane = Kit.pane(left, Kit.inset([14, 8, 14, 10]))
	var sv: VBoxContainer = VBoxContainer.new()
	sv.add_theme_constant_override("separation", 0)
	stats.add_child(sv)
	for l: Array in LADDERS:
		Kit.stat_row(sv, l[2], _value(l[0], _tier(l[0])))


func _refit(parent: Control) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	parent.add_child(row)
	for l: Array in LADDERS:
		var t: float = _tier(l[0])
		var mx: int = _max(l[0])
		var on: bool = _ladder == l[0]
		var c: Color = Color(l[3])
		var n: Dictionary = { "radius": 10, "fill": [Color(c, 0.13) if on else Color(1, 1, 1, 0.04)], "border": [1, Color(c, 0.5) if on else Color(1, 1, 1, 0.1)], "pad": 0 }
		var hot: Dictionary = n.duplicate()
		hot["border"] = [1, Color(c, 0.7)]
		var b: Pane.PaneButton = Pane.PaneButton.new(n, hot)
		b.custom_minimum_size = Vector2(0, 50)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var v: VBoxContainer = VBoxContainer.new()
		v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		v.add_theme_constant_override("separation", 0)
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(v)
		var a: Label = Kit.text(v, l[1], "small", Kit.INK if on else Kit.INK_2)
		a.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var s: Label = Kit.text(v, "Max" if int(t) >= mx else "%d/%d" % [int(t) + 1, mx + 1], "chip", c if on else Kit.DIM)
		s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		Kit.tap(b)
		b.pressed.connect(func() -> void:
			_ladder = l[0]
			_error = ""
			rebuild())
		row.add_child(b)
	_detail(parent)


## The level that gives a tier for free (the port's rules): the fish hold by
## Fishing level, the ship's sailing upgrades by Navigation level.
func _free_at(l: Array, i: int) -> String:
	if l[0] == "hold":
		var lr: Dictionary = Rules.data()["levelRewards"]
		for k: Variant in lr:
			if (lr[k] as Dictionary).get("holdFloor") != null and int(lr[k]["holdFloor"]) == i:
				return "Fishing %s" % str(k)
		return ""
	var nl: int = Shipyard.free_at(str(l[5]), float(i))
	return ("Fishing %d" % nl) if nl > 0 else ""


## The Fishing level a bought tier needs, or 0.
func _gate_at(l: Array, i: int) -> int:
	if l[0] == "hold":
		return Rules.gate("hold", str(i))
	return int(Js.num(Js.obj(Js.obj(Js.obj(Rules.data().get("levelGates")).get("ship")).get(str(l[5]))).get(str(i))))


func _detail(parent: Control) -> void:
	var l: Array = []
	for x: Array in LADDERS:
		if x[0] == _ladder:
			l = x
	var c: Color = Color(l[3])
	var t: int = int(_tier(_ladder))
	var mx: int = _max(_ladder)
	var card: Pane = Kit.pane(parent, Kit.card(c, 18))
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	card.add_child(v)
	Kit.text(v, l[2], "eyebrow", Kit.a(c, 0.85))
	var now: HBoxContainer = HBoxContainer.new()
	now.add_theme_constant_override("separation", 10)
	v.add_child(now)
	var big: Label = Kit.text(now, _value(_ladder, t), "display", Kit.INK)
	big.add_theme_font_size_override("font_size", 30)
	var unit: Label = Kit.text(now, l[4], "small", Kit.DIM)
	unit.size_flags_vertical = Control.SIZE_SHRINK_END
	Kit.text(v, EXPLAIN[_ladder][0], "body", Kit.INK_2, true)
	# The whole ladder.
	var ladder: VBoxContainer = VBoxContainer.new()
	ladder.add_theme_constant_override("separation", 0)
	v.add_child(ladder)
	for i: int in mx + 1:
		var h: HBoxContainer = HBoxContainer.new()
		h.custom_minimum_size = Vector2(0, 30)
		h.modulate.a = 1.0 if i <= t + 1 else 0.55
		ladder.add_child(h)
		var mark: Label = Kit.text(h, "✓" if i <= t else ("›" if i == t + 1 else "·"), "value", c if i <= t + 1 else Kit.FAINT)
		mark.custom_minimum_size = Vector2(18, 0)
		var name_l: Label = Kit.text(h, "Tier %d  ·  %s" % [i + 1, _value(_ladder, i)], "small", Kit.INK if i == t + 1 else Kit.INK_2)
		name_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var free: String = _free_at(l, i)
		var price: String = "%s ⟡" % Js.thousands(_cost(_ladder, i))
		if free == "" and _gate_at(l, i) > 0:
			price = "Fishing %d  ·  %s" % [_gate_at(l, i), price]
		if free != "":
			price = "Free at %s  ·  or %s" % [free, price]
		Kit.text(h, "Standard" if i == 0 else ("Owned" if i <= t else price), "value", Kit.GOOD if (i <= t and i > 0) else (Kit.GOLD if i > t else Kit.DIM))
	if t >= mx:
		Kit.text(v, "Fully upgraded", "heading", c)
		return
	var cost: float = _cost(_ladder, t + 1)
	var purse: float = Js.num(session.profile().get("doubloons"))
	Kit.text(v, "Next: %s (%s)" % [_value(_ladder, t + 1), _gain(_ladder, t)], "body_strong", Kit.INK)
	var go: Button
	var gneed: int = _gate_at(l, t + 1)
	var lock: String = ("Needs Fishing %d" % gneed) if gneed > 0 and session.level() < gneed else ""
	if _busy:
		go = Kit.button("Working…", "primary")
		go.disabled = true
	elif lock != "":
		go = Kit.button("Locked  ·  %s" % lock, "secondary")
		go.disabled = true
	elif purse < cost:
		go = Kit.button("Need %s more ⟡" % Js.thousands(cost - purse), "secondary")
		go.disabled = true
	else:
		go = Kit.button("Upgrade · %s ⟡" % Js.thousands(cost), "primary")
		go.pressed.connect(func() -> void: _confirm(l, t, cost))
	v.add_child(go)


## A refit cannot be undone: asked once, with what it buys and what it costs.
func _confirm(l: Array, t: int, cost: float) -> void:
	var sh: Sheet = Sheet.new()
	sh.eyebrow = "Confirm refit"
	sh.title = l[2]
	sh.accent = Color(l[3])
	sh.ready.connect(func() -> void:
		Kit.text(sh.body, EXPLAIN[_ladder][0], "body", Kit.INK, true)
		var why: Label = Kit.text(sh.body, EXPLAIN[_ladder][1], "note", Kit.DIM, true)
		why.add_theme_font_override("font", Kit.italic())
		var box: Pane = Kit.pane(sh.body, Kit.inset(12))
		var bh: HBoxContainer = HBoxContainer.new()
		bh.alignment = BoxContainer.ALIGNMENT_CENTER
		bh.add_theme_constant_override("separation", 16)
		box.add_child(bh)
		Kit.text(bh, _value(_ladder, t), "number", Kit.DIM)
		Kit.text(bh, "→", "number", Kit.DIM)
		Kit.text(bh, _value(_ladder, t + 1), "number", Color(l[3]))
		var purse: float = Js.num(session.profile().get("doubloons"))
		Kit.text(sh.body, "This costs %s ⟡ and cannot be undone or refunded. You have %s ⟡." % [Js.thousands(cost), Js.thousands(purse)], "small", Kit.INK_2, true)
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		sh.body.add_child(row)
		var no: Button = Kit.button("Not yet", "secondary")
		no.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		no.pressed.connect(sh.close)
		row.add_child(no)
		var pay: Button = Kit.button("Pay %s ⟡" % Js.thousands(cost) if purse >= cost else "Not enough ⟡", "primary")
		pay.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		pay.disabled = purse < cost
		pay.pressed.connect(func() -> void:
			sh.close()
			_buy(l))
		row.add_child(pay))
	add_child(sh)


func _buy(l: Array) -> void:
	if _busy:
		return
	_busy = true
	_error = ""
	rebuild()
	var r: Variant
	if l[0] == "hold":
		r = await session.act("upgradeFishHold")
	else:
		r = await session.act("buyShipyardTier", [l[5]])
	_busy = false
	if not is_inside_tree():
		return
	if r is Dictionary and (r as Dictionary).has("error"):
		_error = str(r["error"])
	elif r == null:
		_error = "That did not go through. Try again."
	else:
		session.persist()
		Rumble.buzz([0, 30, 40, 60])
	rebuild()
