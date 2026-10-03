class_name LevelUp
extends Control
## THE FISHING LEVEL-UP (Godot port of LevelRewardsGrant / LevelUpCelebration,
## fishing pass 2). Redrawn 2026-10-01 (Kong: "I hate the way they look"; the
## web's navy wash, turning rays and rings through the words are gone).
##
## Shown when claimFishingLevelRewards covered a level (to > from), which it
## does on opening the sea and after a catch that crossed one: most levels pay
## nothing and every one of them is still a level. Now in the game's own
## hand: the sea stays under a light dim; FISHING and the new level lettered
## large over a soft warm glow, the number counting up from the old one, a
## stroke of light drawing out beneath it and a few motes rising; then what
## was paid, and the waters that opened, on a slip of paper that rises in
## under it. A press closes it.

signal closed

var claim: Dictionary = {}
var _t: float = 0.0
var _num: Label
var _slip: Control
var _hint: Label
var _motes: Array = []

const CREAM: Color = Color(0.98, 0.94, 0.85)
## Learned is a skill: free and for good.
const SECTION_INK: Dictionary = { "Learned": Color(0.42, 0.27, 0.58), "Stronger": Color(0.55, 0.3, 0.15), "Unlocked": Color(0.2, 0.42, 0.4), "Earned": Color(0.55, 0.42, 0.1) }
const WARM: Color = Color(1.0, 0.78, 0.38)


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	Rumble.buzz(Rumble.LEVEL_UP)
	Sound.chest(true)
	var from: int = int(claim["from"])
	var to: int = int(claim["to"])
	# The number above her boat, the slip below it, so she stays in sight.
	var col: VBoxContainer = VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_END
	col.anchor_right = 1.0
	col.anchor_top = 0.5
	col.anchor_bottom = 0.5
	col.offset_top = -420
	col.offset_bottom = -70
	col.add_theme_constant_override("separation", 2)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(col)
	var eb: Label = _letter(col, "FISHING LEVEL", 15, Color(CREAM, 0.8), false)
	eb.add_theme_font_override("font", Kit.tracked("karla", 700, 15, 0.32))
	_num = _letter(col, str(from), 112, CREAM, true)
	_num.add_theme_color_override("font_shadow_color", Color(WARM, 0.55))
	_num.add_theme_constant_override("shadow_outline_size", 22)
	_num.add_theme_constant_override("shadow_offset_y", 0)
	# What it brought, on a slip of paper, under her boat.
	var slip_row: CenterContainer = CenterContainer.new()
	slip_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slip_row.anchor_right = 1.0
	slip_row.anchor_top = 0.5
	slip_row.anchor_bottom = 0.5
	slip_row.offset_top = 50
	slip_row.offset_bottom = 230
	slip_row.use_top_left = false
	add_child(slip_row)
	_slip = _build_slip(slip_row, from, to)
	_hint = _letter(self, "Press anywhere to continue", 13, Color(CREAM, 0.6), false)
	_hint.anchor_top = 1.0
	_hint.anchor_bottom = 1.0
	_hint.anchor_right = 1.0
	_hint.offset_top = -110
	_hint.offset_bottom = -84
	_hint.modulate.a = 0.0
	# In: the number rises and brightens, counts up, the slip follows.
	_num.modulate.a = 0.0
	eb.modulate.a = 0.0
	var tw: Tween = create_tween()
	tw.set_parallel()
	tw.tween_property(eb, "modulate:a", 1.0, 0.35).set_delay(0.1)
	tw.tween_property(_num, "modulate:a", 1.0, 0.4).set_delay(0.15)
	tw.chain().tween_interval(0.05)
	var steps: int = maxi(1, to - from)
	var per: float = clampf(0.9 / steps, 0.13, 0.42)
	for n: int in range(from + 1, to + 1):
		tw.chain().tween_callback(func() -> void:
			_num.text = str(n)
			_num.pivot_offset = _num.size / 2.0
			_num.scale = Vector2(1.14, 1.14)
			Sound.plip())
		tw.chain().tween_property(_num, "scale", Vector2.ONE, per).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if _slip != null:
		_slip.modulate.a = 0.0
		_slip.position.y += 24.0
		var sl: Tween = create_tween().set_parallel()
		sl.tween_property(_slip, "modulate:a", 1.0, 0.4).set_delay(0.55)
		sl.tween_property(_slip, "position:y", _slip.position.y - 24.0, 0.5).set_delay(0.55).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	create_tween().tween_property(_hint, "modulate:a", 1.0, 0.5).set_delay(1.1)
	for i: int in 14:
		_motes.append([randf_range(-180.0, 180.0), randf_range(0.0, 1.0), randf_range(0.5, 1.2), randf_range(1.2, 2.6)])


## EVERYTHING A LEVEL BRINGS (Kong, 2026-10-01: "show your stat increases and
## what you unlock; tell you everything, or as much as it can"). For the
## levels crossed: [section, line] pairs. Stronger: the catch zone (one
## degree every five levels) and the perfect streak's ceiling. Unlocked: new
## waters, rods, reels and hooks the shops will now sell you, colours earned,
## the Master daily. Earned: what the level paid.
static func gains(from: int, to: int) -> Array:
	var out: Array = []
	var d: Dictionary = Rules.data()
	var cz: int = int(Rules.level_catch_bonus(to)) - int(Rules.level_catch_bonus(from))
	if cz > 0:
		out.append(["Stronger", "Catch zone +%d° (%d° from your level now)" % [cz, int(Rules.level_catch_bonus(to))]])
	var s0: float = Rules.streak_mult(10.0, float(from))
	var s1: float = Rules.streak_mult(10.0, float(to))
	if "%.2f" % s1 != "%.2f" % s0:
		out.append(["Stronger", "A full perfect streak pays ×%.2f XP (was ×%.2f)" % [s1, s0]])
	var mins: Dictionary = d["zones"]["minLevel"]
	for w: Dictionary in Chart.WATERS:
		var need: int = int(mins.get(w["id"], 1))
		if need > from and need <= to:
			out.append(["Unlocked", "%s is open to you, and the portal to it" % w["name"]])
	var rods: Array = d["rods"]
	for k: Variant in d["rodShop"]:
		var lr: int = int(Js.num((d["rodShop"][k] as Dictionary).get("levelReq")))
		if lr > from and lr <= to and int(k) < rods.size():
			var captain: bool = (d["rodShop"][k] as Dictionary).get("captainRod") == true
			out.append(["Unlocked", "%s at the Tackle Shop%s" % [rods[int(k)]["name"], " (Captain)" if captain else ""], Skipper.tex("%s_thumb.png" % rods[int(k)].get("slug", ""))])
	for kind: Array in [["reels", "reel"], ["hooks", "hook"]]:
		for g: Dictionary in d[kind[0]]:
			var lr2: int = int(Js.num(g.get("levelReq")))
			if lr2 > from and lr2 <= to:
				out.append(["Unlocked", "%s at the Tackle Shop" % g["name"], Skipper.tex(str(g.get("imageUrl", "")).replace(".png", "_thumb.png")) if Skipper.tex(str(g.get("imageUrl", "")).replace(".png", "_thumb.png")) != null else Skipper.tex(g.get("imageUrl"))])
	var by: Dictionary = d["fishingColorsByLevel"]
	var c0: Array = by.get(str(from), [])
	for cid: Variant in by.get(str(to), []):
		if not c0.has(cid):
			for cc: Dictionary in d["characterColors"]:
				if cc["id"] == cid:
					out.append(["Unlocked", "The %s look" % cc["name"], Skipper.look_art(cid)])
	var tiers: Array = d["fishHoldTiers"]
	for k: Variant in d["levelRewards"]:
		var hf: Variant = (d["levelRewards"][k] as Dictionary).get("holdFloor")
		if hf != null and int(k) > from and int(k) <= to:
			var ht: Dictionary = tiers[clampi(int(hf), 0, tiers.size() - 1)]
			out.append(["Stronger", "Your hold is now a %s, %d fish (free)" % [ht["name"], int(ht["capacity"])]])
	var lg: Dictionary = Js.obj(d.get("levelGates"))
	for bt: Variant in Js.obj(lg.get("bait")):
		var bl: int = int(lg["bait"][bt])
		if bl > from and bl <= to:
			out.append(["Unlocked", "%s at the Tackle Shop" % Rules.bait(str(bt)).get("name", bt), Skipper.tex(Rules.bait(str(bt)).get("imageUrl"))])
	for hk: Variant in Js.obj(lg.get("hold")):
		var hl: int = int(lg["hold"][hk])
		if hl > from and hl <= to:
			out.append(["Unlocked", "The %s at the Shipyard" % (tiers[clampi(int(hk), 0, tiers.size() - 1)] as Dictionary)["name"]])
	for sk: Variant in Js.obj(lg.get("special")):
		var sl: int = int(lg["special"][sk])
		if sl > from and sl <= to:
			for sp: Dictionary in d["specialItems"]:
				if sp["id"] == sk:
					out.append(["Unlocked", "The %s" % sp["name"]])
	for fk: Variant in Js.obj(lg.get("feature")):
		var fl: int = int(lg["feature"][fk])
		if fl > from and fl <= to:
			out.append(["Unlocked", { "market_advanced": "The Market's Advanced board: moods, the Sea Index, movers and price history", "den_roulette": "Fish Roulette in the Den", "den_blackjack": "Blackjack in the Den" }.get(fk, str(fk))])
	# The Den's daily buy-in grows with Fishing (port rules casino.capByLevel).
	for st: Variant in Js.list(Js.obj(d.get("casino")).get("capByLevel")):
		var cl: int = int((st as Array)[0])
		if cl > 1 and cl > from and cl <= to:
			out.append(["Stronger", "The Den: buy in up to %s chips a day" % Js.thousands(float((st as Array)[1]))])
	var names: Dictionary = { "hull_speed_tier": "Hull speed", "hull_handling_tier": "Rudder", "hull_accel_tier": "Rig", "lantern_tier": "Lantern" }
	var su: Dictionary = Js.obj(d.get("shipUpgrades"))
	for lvk: Variant in su:
		if int(lvk) > from and int(lvk) <= to:
			for c: Variant in su[lvk]:
				out.append(["Stronger", "%s upgraded to tier %d (free)" % [names.get(c, c), int(su[lvk][c]) + 1]])
	var sg: Dictionary = Js.obj(lg.get("ship"))
	for c2: Variant in sg:
		for tk: Variant in sg[c2]:
			var tl: int = int(sg[c2][tk])
			if tl > from and tl <= to:
				out.append(["Unlocked", "%s tier %d at the Shipyard" % [names.get(c2, c2), int(tk) + 1]])
	var mm: int = int(Js.num(d["daily"].get("masterMinLevel")))
	if mm > from and mm <= to:
		out.append(["Unlocked", "A fourth daily challenge, the Master"])
	for s: Dictionary in Rules.skills():
		if int(s["level"]) > from and int(s["level"]) <= to:
			out.append(["Learned", "%s: %s" % [s["name"], s["text"]]])
	return out


## Everything one level brings, gifts included (the Fishing guide).
static func level_lines(lv: int) -> Array:
	var out: Array = gains(lv - 1, lv)
	if lv <= int(Js.num(Rules.data().get("levelRewardMax", 100))):
		var lab: String = reward_label(Js.obj((Rules.data()["levelRewards"] as Dictionary).get(str(lv))))
		if lab != "":
			out.append(["Earned", lab])
	return out


## The next level after this one that brings anything, and the headline of
## it: a skill first, then an unlock, a free upgrade, a gift. [level, text],
## or [] at the top.
static func next_unlock(lv: int) -> Array:
	for n: int in range(lv + 1, 101):
		var lines: Array = level_lines(n)
		for sec: String in ["Learned", "Unlocked", "Stronger", "Earned"]:
			for l: Array in lines:
				if l[0] == sec:
					var t: String = str(l[1]).split(":")[0] if sec == "Learned" else str(l[1])
					return [n, t.replace(" at the Tackle Shop", "").replace(" is open to you, and the portal to it", " opens")]
	return []


var _tiles: Dictionary = {}


func _build_slip(parent: Control, from: int, to: int) -> Control:
	var lines: Array = gains(from, to)
	var granted: Array = claim.get("granted", [])
	for g: Dictionary in granted:
		var label: String = reward_label(g["reward"])
		if label != "":
			lines.append(["Earned", ("Level %d  ·  %s" % [int(g["level"]), label]) if granted.size() > 1 else label])
	if lines.is_empty():
		return null
	# In order: Stronger, Unlocked, Earned.
	var order: Array = ["Learned", "Stronger", "Unlocked", "Earned"]
	var sorted: Array = []
	for sec: String in order:
		for l: Array in lines:
			if l[0] == sec:
				sorted.append(l)
	lines = sorted
	var p: Pane = Kit.pane(parent, { "radius": 12, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.35)], "shadow": [Color(0, 0, 0, 0.4), 18, Vector2(0, 6)], "pad": [28, 16, 28, 18], "paper": true })
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.custom_minimum_size = Vector2(380, 0)
	p.add_child(v)
	var last: String = ""
	for l: Array in lines:
		if l[0] != last:
			last = l[0]
			var head: Label = Kit.text(v, l[0], "eyebrow", SECTION_INK[l[0]])
			head.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			if v.get_child_count() > 1:
				head.custom_minimum_size = Vector2(0, 22)
				head.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
		var art: Texture2D = l[2] if l.size() > 2 else null
		if art != null:
			# Pictures sit side by side, each with its name under it.
			var flow: HFlowContainer = _tiles.get(v)
			if flow == null or flow.get_meta("sec", "") != l[0]:
				flow = HFlowContainer.new()
				flow.alignment = FlowContainer.ALIGNMENT_CENTER
				flow.add_theme_constant_override("h_separation", 12)
				flow.add_theme_constant_override("v_separation", 6)
				flow.mouse_filter = Control.MOUSE_FILTER_IGNORE
				flow.set_meta("sec", l[0])
				v.add_child(flow)
				_tiles[v] = flow
			var cell: VBoxContainer = VBoxContainer.new()
			cell.add_theme_constant_override("separation", 0)
			cell.mouse_filter = Control.MOUSE_FILTER_IGNORE
			cell.custom_minimum_size = Vector2(118, 0)
			flow.add_child(cell)
			var holder: Control = Control.new()
			holder.custom_minimum_size = Vector2(118, 58)
			holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
			cell.add_child(holder)
			Paper.blot(holder, Color(0.36, 0.6, 0.58), 0.55)
			var pic: TextureRect = TextureRect.new()
			pic.texture = art
			pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			pic.offset_left = 26
			pic.offset_right = -26
			pic.offset_top = 4
			pic.offset_bottom = -4
			pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
			holder.add_child(pic)
			var cap: Label = Kit.text(cell, str(l[1]).replace(" at the Tackle Shop", "").replace("The ", ""), "small", Kit.PAPER_INK)
			cap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			cap.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			continue
		_tiles.erase(v)
		var t: Label = Kit.text(v, l[1], "body_strong", Kit.PAPER_INK)
		t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		t.custom_minimum_size = Vector2(380, 0)
	var nx: Array = next_unlock(to)
	if not nx.is_empty():
		var nl: Label = Kit.text(v, "Next, at Fishing %d: %s" % [int(nx[0]), nx[1]], "note", Kit.PAPER_INK_SOFT, true)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		nl.custom_minimum_size = Vector2(0, 26)
		nl.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	if to - from > 1:
		var n: Label = Kit.text(v, "These were waiting for you. Everything you earn is held until you are back at the chart.", "note", Kit.PAPER_INK_SOFT, true)
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return p


## rewardLabel: "360 ⟡, 15 ◆ and 5 Minnow".
static func reward_label(r: Dictionary) -> String:
	var parts: Array[String] = []
	if Js.num(r.get("doubloons")) > 0:
		parts.append("%s ⟡" % Js.thousands(float(r["doubloons"])))
	if Js.num(r.get("gems")) > 0:
		parts.append("%d ◆" % int(r["gems"]))
	for type: Variant in Js.obj(r.get("bait")):
		if int((r["bait"] as Dictionary)[type]) > 0:
			parts.append("%d %s" % [int((r["bait"] as Dictionary)[type]), Rules.bait(type)["name"]])
	# (A hold raised is told under Stronger, by gains().)
	if parts.size() <= 1:
		return parts[0] if parts.size() == 1 else ""
	return ", ".join(parts.slice(0, parts.size() - 1)) + " and " + parts[parts.size() - 1]


## Lettering over the sea: the words over their own soft shadow.
func _letter(parent: Control, text: String, px: int, col: Color, title: bool) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_override("font", Kit.font("cinzel", 800) if title else Kit.font("karla", 600))
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.55))
	l.add_theme_constant_override("shadow_outline_size", 8)
	l.add_theme_constant_override("shadow_offset_y", 2)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(l)
	return l


func _process(delta: float) -> void:
	_t += delta
	queue_redraw()


func _draw() -> void:
	# The sea stays: a light dim, deeper at the edges.
	var a: float = clampf(_t / 0.3, 0.0, 1.0)
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.02, 0.04, 0.06, 0.42 * a))
	if _num == null:
		return
	var c: Vector2 = _num.global_position - global_position + _num.size / 2.0
	# A soft warm glow behind the number.
	for k: int in 6:
		draw_circle(c, 150.0 - k * 22.0, Color(WARM, 0.025 * a))
	# A stroke of light drawing out beneath it.
	var reach: float = 170.0 * clampf((_t - 0.3) / 0.6, 0.0, 1.0)
	var y: float = c.y + _num.size.y * 0.42
	var n: int = 30
	for i: int in n:
		var k0: float = float(i) / n
		var k1: float = float(i + 1) / n
		var fall: float = 1.0 - pow(absf((k0 + k1) - 1.0), 1.5)
		draw_line(Vector2(c.x - reach + reach * 2.0 * k0, y), Vector2(c.x - reach + reach * 2.0 * k1, y), Color(WARM, 0.75 * fall * a), 2.0, true)
	# A few motes rising from it.
	for m: Array in _motes:
		var life: float = fposmod(_t / float(m[3]) + float(m[1]), 1.0)
		var p: Vector2 = Vector2(c.x + float(m[0]), y - life * 140.0)
		draw_circle(p, float(m[2]), Color(WARM, (1.0 - life) * 0.6 * a))


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		_close()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_act") or event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		_close()


func _close() -> void:
	if _t < 0.6:
		return
	closed.emit()
	queue_free()
