class_name GoldenChoice
extends Control
## THE GOLDEN CHOICE (Godot port of components/GoldenChoice.tsx, fishing pass 2).
##
## A golden fish waits on hold until it is sold or mounted, and this asks. It
## cannot be dismissed (no Escape, no click outside, no close): on the web a
## dismissable choice stranded seventy percent of every golden ever caught.
## It comes up after a golden is landed and whenever the sea opens with one
## still waiting, oldest first; after an answer the next one in line follows.
## No price is shown, as on the web.
##
## A SLIP OF THE DAY PAPER (M7, 2026-10-09): the fishing side's menus are
## light paper, so the choice is too. No glow and no gold shadow: the golden
## shader on the fish is the only gold light. It arrives as a panel
## (Motion.panel_in) and leaves as one (Motion.dismiss) once answered.

signal answered

var session: Session
var golden: Dictionary = {}
var _error: Label
var _busy: bool = false
var _scrim: ColorRect
var _card: Pane


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	# The dim fades in (Kit.scrim does by itself) at a sheet's weight.
	_scrim = Kit.scrim(self, Kit.SCRIM_SHEET)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	_card = Pane.new({ "radius": Kit.R_SHEET, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.4)], "shadow": [Color(0, 0, 0, 0.35), 18, Vector2(0, 6)], "pad": 24, "paper": true })
	_card.custom_minimum_size = Vector2(420, 0)
	center.add_child(_card)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	_card.add_child(col)
	_text(col, "A golden one", "eyebrow", Kit.ink(Kit.GOLD))
	var art: String = ResultCard.fish_art_path(golden.get("name", ""))
	if ResourceLoader.exists(art):
		var t: TextureRect = TextureRect.new()
		t.texture = load(art)
		t.custom_minimum_size = Vector2(0, 150)
		t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		var m: ShaderMaterial = ShaderMaterial.new()
		m.shader = load("res://game/golden.gdshader")
		t.material = m
		col.add_child(t)
	_text(col, golden.get("name", "A golden fish"), "display_sm", Kit.PAPER_INK)
	var mounted: bool = golden.get("alreadyMounted", false)
	_text(col, "You have one of these on the wall already. This one can only be sold." if mounted else "Sell it, or mount it in your Captain's Log. One of each species only.", "body", Kit.PAPER_INK_SOFT, true)
	_error = _text(col, "", "small", Paper.RED, true)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	col.add_child(row)
	var sell: Button = Kit.button("Sell", "secondary")
	sell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sell.custom_minimum_size = Vector2(0, 46)
	sell.pressed.connect(func() -> void: _answer("sell"))
	row.add_child(sell)
	if not mounted:
		var mount: Button = Paper.primary("Mount it", false)
		mount.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		mount.size_flags_stretch_ratio = 1.25
		mount.pressed.connect(func() -> void: _answer("mount"))
		row.add_child(mount)
		mount.grab_focus.call_deferred()
	else:
		sell.grab_focus.call_deferred()
	_text(col, "It waits here until you decide. Nothing is lost either way.", "note", Paper.INK_FAINT, true)
	Motion.panel_in(_card)


func _text(parent: Control, text: String, role: String, col: Color, wrap: bool = false) -> Label:
	var l: Label = Kit.text(parent, text, role, col, wrap)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if not wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


func _answer(how: String) -> void:
	if _busy or Motion.closing(self):
		return
	_busy = true
	Rumble.buzz(Rumble.GOLDEN)
	var id: float = float(golden["id"])
	var r: Dictionary = await session.act("sellGoldenTrophy" if how == "sell" else "mountGoldenTrophy", [id])
	session.persist()
	_busy = false
	if r.has("error"):
		_error.text = r["error"]
		return
	answered.emit()
	Motion.dismiss(self, _card, _scrim)


## Block other input while it is up: the choice has to be made.
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back") or event.is_action_pressed("fish_act"):
		get_viewport().set_input_as_handled()
