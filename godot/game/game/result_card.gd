class_name ResultCard
extends Pane
## THE CATCH CARD (Godot port of components/CatchResultCard.tsx, on the style
## kit).
##
## A SLIP OF THE DAY PAPER (M7, 2026-10-09): it matches the catch note (the
## same paper, a hairline in the catch's rarity pigment, inked words), since
## the fishing side's menus are light paper. No glow behind the fish; on a
## golden the golden shader is the only gold light. Stacked and
## centred: the fish on its halo, NEW SPECIES when it is, the name, the rarity
## (and the size tier), the length counting up and landing; then the tally in
## a strip of cells divided by hairlines, each figure counting from nothing in
## turn; then the notes under a rule; then what to do next.
##
## It ARRIVES IN ORDER, and a rarer catch arrives harder (the "punch": golden
## and Ancient 1, legendary 0.85, epic 0.6, rare 0.32, a personal best 0.5, a
## jackpot 0.6) with a shockwave ring in its colour. On a perfect the hairline
## flashes gold once.

signal cast_again
signal closed
signal wormhole

const RARITY_NAMES: Array[String] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"]
const HAIR: Color = Color(Kit.PAPER_INK, 0.15)
## THE NEWS INKS on the day paper (the catch note's, so a personal best or a
## golden reads the same on both surfaces).
const NEWS: Dictionary = {
	"golden": Color(0.75, 0.55, 0.1),
	"new": Color(0.07, 0.4, 0.52),
	"pb": Color(0.55, 0.3, 0.6),
	"trophy": Paper.RED,
}

## The hairline's pigment (on the paper) and the shockwave's colour (out over
## the water, where the bright kit colour reads).
var _accent: Color = Paper.rarity(3)
var _wave: Color = Kit.rarity(3)
var _punch: float = 0.0
var _beats: Array[Control] = []
var _note: Label
var _worm: Button
var _col: VBoxContainer


func _init() -> void:
	super({ "radius": Kit.R_LARGE, "fill": [Kit.PAPER], "border": [1, Color(Paper.rarity(3), 0.7)], "shadow": [Color(0, 0, 0, 0.35), 14, Vector2(0, 5)], "pad": 0, "paper": true })
	custom_minimum_size = Vector2(440, 0)
	_col = VBoxContainer.new()
	_col.add_theme_constant_override("separation", 0)
	add_child(_col)


static func fish_art_path(fish_name: String) -> String:
	var slug: String = fish_name.to_lower().replace(" ", "-")
	var clean: String = ""
	for ch: String in slug:
		if (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9") or ch == "-":
			clean += ch
	return "res://art/fish/%s.png" % clean


func _centred(parent: Control, text: String, role: String, col: Color, wrap: bool = false) -> Label:
	var l: Label = Kit.text(parent, text, role, col, wrap)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l


func _section(pad: Array) -> VBoxContainer:
	var m: MarginContainer = MarginContainer.new()
	m.add_theme_constant_override("margin_left", pad[0])
	m.add_theme_constant_override("margin_top", pad[1])
	m.add_theme_constant_override("margin_right", pad[2])
	m.add_theme_constant_override("margin_bottom", pad[3])
	_col.add_child(m)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	m.add_child(v)
	return v


func _hairline() -> void:
	var r: ColorRect = ColorRect.new()
	r.color = HAIR
	r.custom_minimum_size = Vector2(0, 1)
	_col.add_child(r)


## A fish landed. `r` is reelIn's result, `shot` what the cast rolled (the
## jackpot, the double, the Locked-In haul).
func show_fish(r: Dictionary, perfect: bool, shot: Dictionary) -> void:
	var fish: Dictionary = r["fish"]
	var ancient: bool = fish["habitat"] == "ancient_deep" and Js.num(fish.get("sell_value")) == 0.0
	var golden: bool = r.get("isShiny") == true
	var rarity: int = clampi(int(Js.num(fish.get("bite_rarity"))), 1, 5)
	var label: String = RARITY_NAMES[rarity - 1]
	_accent = Paper.rarity(rarity)
	_wave = Kit.rarity(rarity)
	if golden:
		label = "Golden"
		_accent = NEWS["golden"]
		_wave = Kit.GOLD
	elif ancient:
		label = "Ancient"
		_accent = Paper.rarity("ancient")
		_wave = Kit.rarity("ancient")
	_punch = 0.0
	if golden or ancient:
		_punch = 1.0
	elif rarity == 5:
		_punch = 0.85
	elif rarity == 4:
		_punch = 0.6
	elif rarity == 3:
		_punch = 0.32
	if r.get("isPB") == true and r.get("previousBest") != null:
		_punch = maxf(_punch, 0.5)
	var jackpot: float = float(shot.get("jackpotMult", 1.0))
	if jackpot > 1.0:
		_punch = maxf(_punch, 0.6)
	var fresh: bool = r.get("isNewSpecies") == true and not golden

	# The head: the one lit thing, then its words.
	var head: VBoxContainer = _section([16, 14, 16, 12])
	head.add_theme_constant_override("separation", 3)
	var art_path: String = fish_art_path(fish["name"])
	if ResourceLoader.exists(art_path):
		# The fish on the paper, flat: no halo and no floor shadow.
		var pic: TextureRect = TextureRect.new()
		pic.texture = Skipper.tex(art_path.trim_prefix("res://art/"))
		pic.custom_minimum_size = Vector2(0, 130)
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if golden:
			var m: ShaderMaterial = ShaderMaterial.new()
			m.shader = load("res://game/golden.gdshader")
			pic.material = m
		head.add_child(pic)
		Motion.arrive(pic, "m")
	if fresh:
		var row: HBoxContainer = HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_CENTER
		head.add_child(row)
		var pill: Pane = Kit.chip(row, "★ New species", NEWS["new"])
		Motion.arrive(pill, "s", 0.18)
	var name_l: Label = _centred(head, fish["name"], "title", Kit.PAPER_INK)
	name_l.add_theme_font_override("font", Kit.font("cinzel", 800))
	_beats.append(name_l)
	var tier: String = ""
	if r.get("sizeTier") != null and String(r["sizeTier"]) in ["trophy", "large"]:
		tier = String(r["sizeTier"]).capitalize()
	_beats.append(_centred(head, label + ((Kit.SEP + tier) if tier != "" else ""), "eyebrow", _accent))

	# The length counts up, then lands a little large.
	var size_in: float = float(r.get("sizeIn", 0.0))
	if size_in > 0.0 and not golden:
		var line: HBoxContainer = HBoxContainer.new()
		line.alignment = BoxContainer.ALIGNMENT_CENTER
		line.add_theme_constant_override("separation", 8)
		head.add_child(line)
		var sz: Label = Kit.text(line, "", "number", Kit.PAPER_INK)
		sz.add_theme_font_size_override("font_size", 22)
		var count: Callable = func(v: float) -> void: sz.text = FishingHud.length_text(v)
		create_tween().tween_method(count, 0.0, size_in, 0.55).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
		if r.get("isPB") == true and not ancient:
			var best: Label = Kit.text(line, "Best" + ((" · +%.1f in" % (size_in - float(r["previousBest"]))) if r.get("previousBest") != null else ""), "eyebrow", NEWS["pb"])
			best.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		# Unseen from its first frame; its pivot is taken once it is laid out.
		line.modulate.a = 0.0
		_land(line)

	# The tally, left to right.
	var tally: Array = []
	if not ancient:
		tally.append([Js.num(fish.get("sell_value")), "", "Sell ⟡", Paper.MONEY])
	tally.append([float(r.get("xpCatch", r.get("xpGained", 0.0))), "+", "XP", Paper.GREEN])
	if shot.get("doubleCatch") == true and jackpot <= 1.0:
		tally.append(["×2", "", "Double", Paper.MONEY])
	elif float(shot.get("catchQty", 1.0)) > 1.0 and jackpot <= 1.0:
		tally.append(["×%d" % int(float(r.get("catchQty", 1.0))), "", "Haul", Paper.MONEY])
	if jackpot > 1.0:
		tally.append(["×%d" % int(jackpot), "", "Jackpot", Paper.MONEY])
	if r.has("perfectBonusXP") and float(r["perfectBonusXP"]) > 0.0:
		tally.append([float(r["perfectBonusXP"]), "+", "Perfect", Paper.GREEN])
	if float(r.get("xpStreak", 0.0)) > 0.0:
		var s: int = int(r.get("perfectStreak", 1.0))
		tally.append([float(r["xpStreak"]), "+", "Streak ×%d" % s if s > 1 else "Streak", Paper.GREEN])
	_hairline()
	var strip: HBoxContainer = HBoxContainer.new()
	strip.add_theme_constant_override("separation", 0)
	_col.add_child(strip)
	for n: int in tally.size():
		if n > 0:
			var div: ColorRect = ColorRect.new()
			div.color = HAIR
			div.custom_minimum_size = Vector2(1, 0)
			strip.add_child(div)
		var cell: VBoxContainer = VBoxContainer.new()
		cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cell.add_theme_constant_override("separation", 1)
		strip.add_child(cell)
		var pad_top: Control = Control.new()
		pad_top.custom_minimum_size = Vector2(0, 6)
		cell.add_child(pad_top)
		var t: Array = tally[n]
		var v: Label = _centred(cell, "", "number", t[3])
		v.add_theme_font_size_override("font_size", 16)
		_centred(cell, t[2], "chip", Paper.INK_FAINT)
		var pad_bot: Control = Control.new()
		pad_bot.custom_minimum_size = Vector2(0, 6)
		cell.add_child(pad_bot)
		var delay: float = 0.3 + n * 0.07
		if t[0] is float:
			var target: float = t[0]
			var sign: String = t[1]
			v.text = sign + "0"
			var tw: Tween = create_tween()
			tw.tween_interval(delay)
			tw.tween_method(func(x: float) -> void: v.text = sign + Js.thousands(Js.round(x)), 0.0, target, 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		else:
			v.text = t[0]
		cell.modulate.a = 0.0
		var ct: Tween = create_tween()
		ct.tween_interval(delay)
		Motion.ease_fade(ct, cell, "modulate:a", 1.0, 0.22)

	# The notes.
	var notes: Array = []
	if golden:
		var msgs: Array = Rules.data()["shinyMessages"]
		notes.append([String(msgs[randi() % msgs.size()]).replace("{fish}", fish["name"]), NEWS["golden"]])
	elif r.get("isNewSpecies") == true:
		notes.append(["New species. Logged.", NEWS["new"]])
	if r.get("baitSaved") == true:
		notes.append(["The bait survived.", Paper.GREEN])
	if ancient and r.get("isNewSpecies") == true:
		notes.append(["Ancient %d of 6 revealed." % int(r.get("ancientCount", 0)), Paper.rarity("ancient")])
	if r.get("vigilRankUp") != null:
		var up: Dictionary = r["vigilRankUp"]
		notes.append(["Vigil %s. Rank %d to %d." % [["", "I", "II", "III", "IV", "V"][int(up["to"])], int(up["from"]), int(up["to"])], Kit.PAPER_INK_SOFT])
	if r.has("waitingOn"):
		var names: Array[String] = []
		for w: Dictionary in r["waitingOn"]:
			names.append(w["short"])
		notes.append(["%s %s waiting on this one. Sail it over." % [" and ".join(names), "is" if names.size() == 1 else "are"], Paper.MONEY])
	if not notes.is_empty():
		_hairline()
		var nb: VBoxContainer = _section([16, 8, 16, 8])
		nb.add_theme_constant_override("separation", 3)
		for n: Array in notes:
			_beats.append(Kit.text(nb, n[0], "small", n[1], true))
	_buttons(r.get("wormhole") == true and not golden)
	_arrive(perfect)


## The wormhole's answer, under the card (the card itself stays as it was).
func set_note(text: String) -> void:
	_note.text = text
	_note.visible = true
	if _worm != null:
		_worm.visible = false


func _buttons(show_worm: bool) -> void:
	_hairline()
	var v: VBoxContainer = _section([14, 10, 14, 12])
	_note = Kit.text(v, "", "small", Paper.GREEN, true)
	_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_note.visible = false
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	v.add_child(row)
	# One family of buttons on the paper: the one thing to do is the plank.
	var again: Button = Paper.primary("Cast Again", false)
	again.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	again.pressed.connect(func() -> void: cast_again.emit())
	row.add_child(again)
	if show_worm:
		_worm = Kit.button("Wormhole", "secondary")
		_worm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_worm.tooltip_text = "Reroll this catch into another fish"
		_worm.pressed.connect(func() -> void: wormhole.emit())
		row.add_child(_worm)
	var close: Button = Kit.button("Close", "secondary")
	close.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	close.pressed.connect(func() -> void: closed.emit())
	row.add_child(close)
	again.grab_focus.call_deferred()


func _edge(c: Color) -> void:
	var s: Dictionary = spec.duplicate()
	s["border"] = [1, c]
	set_spec(s)


## The length line lands a little large (a reward pop), once laid out.
func _land(line: Control) -> void:
	if not line.is_inside_tree():
		await line.tree_entered
	await line.get_tree().process_frame
	if not is_instance_valid(line):
		return
	line.pivot_offset = line.size / 2.0
	line.scale = Vector2.ONE * 1.18
	var tw: Tween = line.create_tween().set_parallel(true)
	Motion.ease_pop(tw, line, "scale", Vector2.ONE, 0.35).set_delay(0.25)
	Motion.ease_fade(tw, line, "modulate:a", 1.0, 0.15).set_delay(0.25)


func _arrive(perfect: bool) -> void:
	var edge: Color = Kit.a(_accent, 0.7)
	_edge(edge)
	if perfect:
		# The hairline flashes gold ink once.
		var gold: Color = Kit.ink(Kit.GOLD)
		var flash: Tween = create_tween()
		flash.tween_interval(0.15)
		flash.tween_method(func(k: float) -> void: _edge(edge.lerp(gold, k)), 0.0, 1.0, 0.15)
		flash.tween_interval(0.25)
		flash.tween_method(func(k: float) -> void: _edge(gold.lerp(edge, k)), 0.0, 1.0, 0.5)
	# Unseen from its first frame; the arrival starts once the card is laid
	# out, so it scales from its own centre (the pivot was hard-coded).
	modulate.a = 0.0
	for b: Control in _beats:
		b.modulate.a = 0.0
	if not is_inside_tree():
		await tree_entered
	await get_tree().process_frame
	if not is_instance_valid(self) or is_queued_for_deletion():
		return
	pivot_offset = size / 2.0
	scale = Vector2.ONE * (1.0 - 0.07 * _punch)
	var drop: float = 16.0 + 14.0 * _punch
	offset_top += drop
	offset_bottom += drop
	var tw: Tween = create_tween().set_parallel(true)
	Motion.ease_fade(tw, self, "modulate:a", 1.0, 0.18)
	# A rarer catch lands harder (a reward pop, so BACK); a plain one rises.
	var trans: int = Tween.TRANS_BACK if _punch > 0.0 else Tween.TRANS_CUBIC
	tw.tween_property(self, "offset_top", offset_top - drop, 0.35).set_trans(trans).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "offset_bottom", offset_bottom - drop, 0.35).set_trans(trans).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "scale", Vector2.ONE, 0.35).set_trans(trans).set_ease(Tween.EASE_OUT)
	for i: int in _beats.size():
		var bt: Tween = create_tween()
		bt.tween_interval(0.08 + 0.07 * i)
		Motion.ease_fade(bt, _beats[i], "modulate:a", 1.0, 0.22)
	if _punch > 0.0:
		# The shockwave, on its own layer: what the card draws itself goes
		# through its pane shader. Out over the water, in the bright colour.
		var ring: Ring = Ring.new()
		ring.color = _wave
		ring.punch = _punch
		ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(ring)


## A ring spreading out from the card as it lands, in the catch's colour.
class Ring:
	extends Control
	var color: Color = Color.WHITE
	var punch: float = 1.0
	var u: float = 0.0

	func _ready() -> void:
		var tw: Tween = create_tween()
		tw.tween_method(func(x: float) -> void:
			u = x
			queue_redraw(), 0.0, 1.0, 0.42 + 0.16 * punch)
		tw.tween_callback(queue_free)

	func _draw() -> void:
		var grow: float = lerpf(0.86, 1.14 + 0.12 * punch, u)
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var c: Vector2 = r.get_center()
		var box: Rect2 = Rect2(c - r.size * grow / 2.0, r.size * grow)
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.draw_center = false
		sb.border_color = Color(color, 0.5 * punch * (1.0 - u))
		sb.set_border_width_all(3)
		sb.set_corner_radius_all(Kit.R_LARGE + 6)
		draw_style_box(sb, box.grow(6))
