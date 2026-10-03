class_name TideCard
extends Control
## A TIDE TURNS between fights (the web's TideModal, on the night paper): what
## the sea threw up, in a line of flavour, and two or three ways to take it,
## each a card with what it does in plain words (a boon in green, a cost in
## red). A stronger tide wears gilt. Press a card (or 1 to 3) to take it.
## The Throne's reprieve before its boss comes the same way. chosen(id).

signal chosen(choice_id: String)

const GOLD: Color = Color(1.0, 0.82, 0.38)

var tide: Dictionary = {}
var eyebrow: String = "A TIDE TURNS"
var _sheet: Control
var _picked: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.01, 0.02, 0.04, 0.55)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	var choices: Array = Js.list(tide.get("choices"))
	var w: float = maxf(640.0, 300.0 * choices.size() + 80.0)
	_sheet = Control.new()
	_sheet.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_sheet.offset_left = -w / 2.0
	_sheet.offset_right = w / 2.0
	_sheet.offset_top = -230
	_sheet.offset_bottom = 230
	add_child(_sheet)
	Paper.night = true
	Paper.sheet(_sheet, 8.0)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 30)
	_sheet.add_child(m)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	m.add_child(v)
	var strong: bool = int(Js.nz(tide.get("tier"), 1.0)) >= 2
	Paper.text(v, eyebrow if not strong else "A STRONGER TIDE", "eyebrow", GOLD if strong else Paper.ink_soft())
	Paper.text(v, str(tide.get("title", "")), "display", Paper.ink())
	var fl: Label = Paper.text(v, str(tide.get("flavor", "")), "body", Paper.ink_soft(), true)
	fl.add_theme_font_override("font", Kit.italic())
	Paper.rule(v)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(row)
	for k: int in choices.size():
		row.add_child(_card(choices[k], k))
	Paper.night = false
	_sheet.modulate.a = 0.0
	_sheet.scale = Vector2(0.96, 0.96)
	_sheet.pivot_offset = Vector2(w / 2.0, 230)
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_sheet, "modulate:a", 1.0, 0.3)
	tw.tween_property(_sheet, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	Sound.bell()


func _card(c: Dictionary, k: int) -> Control:
	var bt: Button = Button.new()
	bt.flat = true
	bt.focus_mode = Control.FOCUS_NONE
	bt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bt.custom_minimum_size = Vector2(260, 190)
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(1, 1, 1, 0.04)
	sb.border_color = Color(GOLD, 0.35)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	var hov: StyleBoxFlat = sb.duplicate()
	hov.bg_color = Color(GOLD, 0.1)
	hov.border_color = Color(GOLD, 0.9)
	hov.set_border_width_all(2)
	bt.add_theme_stylebox_override("normal", sb)
	bt.add_theme_stylebox_override("hover", hov)
	bt.add_theme_stylebox_override("pressed", hov)
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.offset_left = 16
	v.offset_right = -16
	v.offset_top = 14
	v.offset_bottom = -14
	v.add_theme_constant_override("separation", 6)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bt.add_child(v)
	Paper.night = true
	Paper.text(v, "%d" % (k + 1), "eyebrow", Paper.ink_faint()).mouse_filter = Control.MOUSE_FILTER_IGNORE
	Paper.text(v, str(c.get("label", "")), "body_strong", Paper.ink()).mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fx: Array = Js.list(c.get("effects"))
	var d: Label = Paper.text(v, str(c.get("description", "")), "small", Paper.ink_soft() if not fx.is_empty() else Paper.ink_faint(), true)
	d.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# What it does, as chips: green for a boon, red for a cost.
	var chips: HFlowContainer = HFlowContainer.new()
	chips.add_theme_constant_override("h_separation", 6)
	chips.add_theme_constant_override("v_separation", 4)
	chips.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(chips)
	var tones: Array = fx.map(func(e: Dictionary) -> String: return tone_of(e))
	if tones.has("good"):
		Kit.text(chips, "▲ A BOON", "eyebrow", Color(0.5, 0.86, 0.58)).mouse_filter = Control.MOUSE_FILTER_IGNORE
	if tones.has("bad"):
		Kit.text(chips, "▼ A COST", "eyebrow", Color(0.94, 0.48, 0.4)).mouse_filter = Control.MOUSE_FILTER_IGNORE
	if fx.is_empty():
		Kit.text(chips, "NOTHING CHANGES", "eyebrow", Paper.ink_faint()).mouse_filter = Control.MOUSE_FILTER_IGNORE
	Paper.night = false
	bt.pressed.connect(func() -> void: _pick(str(c["id"])))
	return bt


func _pick(id: String) -> void:
	if _picked:
		return
	_picked = true
	Sound.seal(true)
	Rumble.tap(12)
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.3)
	await tw.finished
	chosen.emit(id)
	queue_free()


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and (e as InputEventKey).pressed and not (e as InputEventKey).echo:
		var k: int = (e as InputEventKey).keycode - KEY_1
		var ch: Array = Js.list(tide.get("choices"))
		if k >= 0 and k < ch.size():
			get_viewport().set_input_as_handled()
			_pick(str(ch[k]["id"]))


## effectTone: is this effect a boon, a cost, or neither?
static func tone_of(e: Dictionary) -> String:
	var k: String = str(e.get("kind", ""))
	match k:
		"damageMult", "fireDmgMult", "volleyDmgMult", "bossDamageMult", "bossVolleyDmgMult", "critZoneScale":
			return "good" if float(e["mult"]) > 1.0 else ("bad" if float(e["mult"]) < 1.0 else "neutral")
		"incomingDmgMult", "enemyHpScale":
			return "good" if float(e["mult"]) < 1.0 else ("bad" if float(e["mult"]) > 1.0 else "neutral")
		"critChanceBonus", "dodgeBonus":
			return "good" if float(e["chance"]) > 0.0 else ("bad" if float(e["chance"]) < 0.0 else "neutral")
		"instantHealPct":
			return "good" if float(e["pct"]) > 0.0 else "neutral"
		"startHpPctDelta":
			return "good" if float(e["pct"]) > 0.0 else ("bad" if float(e["pct"]) < 0.0 else "neutral")
		"startOfFightHealPct":
			return "good" if float(e["pctMax"]) > 0.0 else "neutral"
		"instantHeal", "speedDelta", "doubloonsAtRaidEnd":
			return "good" if float(e["n"]) > 0.0 else ("bad" if float(e["n"]) < 0.0 else "neutral")
		"fullHeal", "guaranteedDodge", "reloadProc", "refreshAbility":
			return "good"
		"startCharges":
			return "good" if float(e["n"]) > 0.0 else "bad"
	return "neutral"
