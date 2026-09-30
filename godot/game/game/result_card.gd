class_name ResultCard
extends PanelContainer
## THE CATCH CARD (Godot port of components/CatchResultCard.tsx, fishing pass 2).
##
## It ARRIVES IN ORDER, and that is the whole of its juice: the fish springs
## in, the length counts up and lands a beat later, the tally fades up left to
## right with each figure counting from nothing, and on a perfect the hairline
## flashes gold once. A rarer catch arrives harder (the "punch": golden and
## Ancient 1, legendary 0.85, epic 0.6, rare 0.32, a personal best 0.5, a
## jackpot 0.6) with a shockwave ring in its colour. The surface stays flat and
## opaque: it sits on moving water.

signal cast_again
signal closed
signal wormhole

const RARITY: Array = [
	["Common", "#94a3b8"], ["Uncommon", "#4ade80"], ["Rare", "#60a5fa"], ["Epic", "#c084fc"], ["Legendary", "#f59e0b"],
]
const INK: Color = Color("#f2ece0")
const DIM: Color = Color("#9fb4c2")

var _style: StyleBoxFlat
var _accent: Color = Color("#60a5fa")
var _punch: float = 0.0
var _beats: Array[Control] = []
var _note: Label
var _worm: Button


func _init() -> void:
	_style = StyleBoxFlat.new()
	_style.bg_color = Color("#080e15")
	_style.set_border_width_all(1)
	_style.set_corner_radius_all(16)
	_style.set_content_margin_all(20)
	add_theme_stylebox_override("panel", _style)
	custom_minimum_size = Vector2(440, 0)


static func fish_art_path(fish_name: String) -> String:
	var slug: String = fish_name.to_lower().replace(" ", "-")
	var clean: String = ""
	for ch: String in slug:
		if (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9") or ch == "-":
			clean += ch
	return "res://art/fish/%s.png" % clean


## A line of the card. Only `wrap` lines wrap, and at the card's width: a
## wrapping label in a container with no width measures one letter wide and
## as tall as its letters.
func _label(parent: Control, text: String, px: int, col: Color, title: bool = false, wrap: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	if title:
		l.add_theme_font_override("font", UiTheme.title_font())
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size = Vector2(400, 0)
	parent.add_child(l)
	return l


## A fish landed. `r` is reelIn's result, `shot` what the cast rolled (the
## jackpot, the double, the Locked-In haul).
func show_fish(r: Dictionary, perfect: bool, shot: Dictionary) -> void:
	var fish: Dictionary = r["fish"]
	var ancient: bool = fish["habitat"] == "ancient_deep" and Js.num(fish.get("sell_value")) == 0.0
	var golden: bool = r.get("isShiny") == true
	var rarity: int = clampi(int(Js.num(fish.get("bite_rarity"))), 1, 5) - 1
	var label: String = RARITY[rarity][0]
	_accent = Color(RARITY[rarity][1])
	if golden:
		label = "Golden"
		_accent = Color("#fbcc4a")
	elif ancient:
		label = "Ancient"
		_accent = Color("#e11d48")
	_punch = 0.0
	if golden or ancient:
		_punch = 1.0
	elif rarity == 4:
		_punch = 0.85
	elif rarity == 3:
		_punch = 0.6
	elif rarity == 2:
		_punch = 0.32
	if r.get("isPB") == true and r.get("previousBest") != null:
		_punch = maxf(_punch, 0.5)
	var jackpot: float = float(shot.get("jackpotMult", 1.0))
	if jackpot > 1.0:
		_punch = maxf(_punch, 0.6)

	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	add_child(col)
	_beats.append(_label(col, label.to_upper(), 12, _accent, true))
	var art_path: String = fish_art_path(fish["name"])
	if ResourceLoader.exists(art_path):
		var holder: CenterContainer = CenterContainer.new()
		holder.custom_minimum_size = Vector2(0, 150)
		col.add_child(holder)
		var t: TextureRect = TextureRect.new()
		t.texture = load(art_path)
		t.custom_minimum_size = Vector2(300, 140)
		t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		if golden:
			var m: ShaderMaterial = ShaderMaterial.new()
			m.shader = load("res://game/golden.gdshader")
			t.material = m
		holder.add_child(t)
		t.pivot_offset = Vector2(150, 70)
		t.scale = Vector2(0.62, 0.62)
		var tw: Tween = create_tween()
		tw.tween_property(t, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if r.get("isNewSpecies") == true and not golden:
		var pill: Label = _label(col, "NEW SPECIES", 11, Color("#7dd3fc"), true)
		pill.modulate.a = 0.0
		create_tween().tween_property(pill, "modulate:a", 1.0, 0.25).set_delay(0.18)
	_beats.append(_label(col, fish["name"], 24, INK, true))

	# The length counts up, then lands a little large.
	var size_in: float = float(r.get("sizeIn", 0.0))
	if size_in > 0.0:
		var sz: Label = _label(col, "", 17, Color("#d6cfc1"))
		var count: Callable = func(v: float) -> void: sz.text = FishingHud.length_text(v)
		create_tween().tween_method(count, 0.0, size_in, 0.55).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
		sz.pivot_offset = Vector2(220, 10)
		var pop: Tween = create_tween()
		pop.tween_interval(0.55)
		pop.tween_property(sz, "scale", Vector2(1.18, 1.18), 0.01)
		pop.tween_property(sz, "scale", Vector2.ONE, 0.25)
		if r.get("isPB") == true and r.get("previousBest") != null:
			_label(col, "Best · +%.1f in" % (size_in - float(r["previousBest"])), 14, Color("#5eead4"))

	# The tally, left to right.
	var tally: Array = []
	if not ancient:
		tally.append([Js.thousands(Js.num(fish.get("sell_value"))), "Sell ⟡", "#f0c040"])
	tally.append(["+%s" % Js.thousands(float(r.get("xpCatch", r.get("xpGained", 0.0)))), "XP", "#86efac"])
	if shot.get("doubleCatch") == true and jackpot <= 1.0:
		tally.append(["×2", "Double", "#fbbf24"])
	elif float(shot.get("catchQty", 1.0)) > 1.0 and jackpot <= 1.0:
		tally.append(["×%d" % int(float(r.get("catchQty", 1.0))), "Haul", "#f0c040"])
	if jackpot > 1.0:
		tally.append(["×%d" % int(jackpot), "Jackpot", "#fb923c"])
	if r.has("perfectBonusXP") and float(r["perfectBonusXP"]) > 0.0:
		tally.append(["+%s" % Js.thousands(float(r["perfectBonusXP"])), "Perfect", "#f0c040"])
	if float(r.get("xpStreak", 0.0)) > 0.0:
		var s: int = int(r.get("perfectStreak", 1.0))
		tally.append(["+%s" % Js.thousands(float(r["xpStreak"])), "Streak ×%d" % s if s > 1 else "Streak", "#fbbf24"])
	var row: HBoxContainer = HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 22)
	col.add_child(row)
	for n: int in tally.size():
		var cell: VBoxContainer = VBoxContainer.new()
		cell.add_theme_constant_override("separation", 0)
		row.add_child(cell)
		var v: Label = _label(cell, tally[n][0], 19, Color(tally[n][2]), true)
		_label(cell, tally[n][1], 11, Color(1, 1, 1, 0.5))
		cell.modulate.a = 0.0
		var ct: Tween = create_tween()
		ct.tween_interval(0.3 + n * 0.07)
		ct.tween_property(cell, "modulate:a", 1.0, 0.2)
		v.text = tally[n][0]

	# The notes.
	var notes: Array[String] = []
	if golden:
		var msgs: Array = Rules.data()["shinyMessages"]
		notes.append(String(msgs[randi() % msgs.size()]).replace("{fish}", fish["name"]))
	elif r.get("isNewSpecies") == true:
		notes.append("New species. Logged.")
	if r.get("baitSaved") == true:
		notes.append("The bait survived.")
	if r.get("vigilRankUp") != null:
		var up: Dictionary = r["vigilRankUp"]
		notes.append("Vigil %s. Rank %d to %d." % [["", "I", "II", "III", "IV", "V"][int(up["to"])], int(up["from"]), int(up["to"])])
	for n: String in notes:
		_beats.append(_label(col, n, 14, DIM, false, true))
	if r.has("waitingOn"):
		var names: Array[String] = []
		for w: Dictionary in r["waitingOn"]:
			names.append(w["short"])
		var who: String = " and ".join(names)
		_label(col, "%s %s waiting on this one. Sail it over." % [who, "is" if names.size() == 1 else "are"], 13, Color("#f0c040"), false, true)
	_note = _label(col, "", 14, Color("#7fd6a0"), false, true)
	_note.visible = false
	_buttons(col, r.get("wormhole") == true and not golden)
	_arrive(perfect)


## A crate's loot, told plainly (the crate moment itself runs before this).
func show_note(title: String, body: String) -> void:
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	add_child(col)
	_accent = Color("#d9b7b7")
	_beats.append(_label(col, title, 22, Color("#d9b7b7"), true))
	_beats.append(_label(col, body, 15, DIM, false, true))
	_buttons(col, false)
	_arrive(false)


## The wormhole's answer, under the card (the card itself stays as it was).
func set_note(text: String) -> void:
	_note.text = text
	_note.visible = true
	if _worm != null:
		_worm.visible = false


func _buttons(col: VBoxContainer, show_worm: bool) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	col.add_child(row)
	var again: Button = Button.new()
	again.text = "Cast Again"
	again.add_theme_color_override("font_color", Color("#67d4e8"))
	again.pressed.connect(func() -> void: cast_again.emit())
	row.add_child(again)
	var close: Button = Button.new()
	close.text = "Close"
	close.pressed.connect(func() -> void: closed.emit())
	row.add_child(close)
	if show_worm:
		_worm = Button.new()
		_worm.text = "Wormhole · Reroll"
		_worm.add_theme_color_override("font_color", Color("#f0ddff"))
		_worm.pressed.connect(func() -> void: wormhole.emit())
		row.add_child(_worm)
	again.grab_focus.call_deferred()


func _arrive(perfect: bool) -> void:
	_style.border_color = Color(_accent, 0.4)
	if perfect:
		var flash: Tween = create_tween()
		flash.tween_interval(0.15)
		flash.tween_property(_style, "border_color", Color("#f0c040"), 0.15)
		flash.tween_property(_style, "border_color", Color(_accent, 0.4), 0.75)
	pivot_offset = Vector2(220, 180)
	modulate.a = 0.0
	scale = Vector2.ONE * (1.0 - 0.07 * _punch)
	var drop: float = 16.0 + 14.0 * _punch
	offset_top += drop
	offset_bottom += drop
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(self, "modulate:a", 1.0, 0.18)
	var trans: int = Tween.TRANS_BACK if _punch > 0.0 else Tween.TRANS_CUBIC
	tw.tween_property(self, "offset_top", offset_top - drop, 0.35).set_trans(trans).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "offset_bottom", offset_bottom - drop, 0.35).set_trans(trans).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "scale", Vector2.ONE, 0.35).set_trans(trans).set_ease(Tween.EASE_OUT)
	for i: int in _beats.size():
		_beats[i].modulate.a = 0.0
		var bt: Tween = create_tween()
		bt.tween_interval(0.08 + 0.07 * i)
		bt.tween_property(_beats[i], "modulate:a", 1.0, 0.22)
	if _punch > 0.0:
		queue_redraw()
		var ring: Tween = create_tween()
		ring.tween_method(func(u: float) -> void:
			_ring_u = u
			queue_redraw(), 0.0, 1.0, 0.42 + 0.16 * _punch)


var _ring_u: float = 1.0


func _draw() -> void:
	if _punch <= 0.0 or _ring_u >= 1.0:
		return
	var grow: float = lerpf(0.86, 1.14 + 0.12 * _punch, _ring_u)
	var r: Rect2 = Rect2(Vector2.ZERO, size)
	var c: Vector2 = r.get_center()
	var box: Rect2 = Rect2(c - r.size * grow / 2.0, r.size * grow)
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.draw_center = false
	sb.border_color = Color(_accent, 0.5 * _punch * (1.0 - _ring_u))
	sb.set_border_width_all(3)
	sb.set_corner_radius_all(22)
	draw_style_box(sb, box.grow(6))
