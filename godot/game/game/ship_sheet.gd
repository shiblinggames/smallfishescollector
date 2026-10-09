class_name ShipSheet
extends Control
## YOUR SHIP (Godot port; the expedition row's Ship). The ship you sail north
## of the arch, on the night paper: her painting (the sea art the chart draws,
## or a worn ship skin's hull), her name and class, and what is still to come
## for her (the Gunwharf's refits and arms, crew seats). Esc or a press
## outside closes it.

signal closed

var session: Session
var _parts: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE shell every sheet shares (Paper.open), on the night paper.
	_parts = Paper.open(self, Vector2(720, 560), true, close, 30)
	var col: VBoxContainer = _parts["body"]
	Paper.night = true
	var p: Dictionary = session.profile()
	var tier: int = clampi(int(Js.num(p.get("ship_tier"))), 2, 6)
	var sa: Dictionary = North.ship_art(tier, p.get("equipped_ship_skin"))
	var def: Dictionary = sa["def"]
	var art: String = sa["art"]
	# THE shared header: "Your ship" over her name, Close on the right.
	Paper.header(col, str(Js.nz(p.get("ship_name"), def.get("name", "Your ship"))), "Your ship", close)
	var holder: Control = Control.new()
	holder.custom_minimum_size = Vector2(0, 300)
	col.add_child(holder)
	Paper.blot(holder, Color(0.36, 0.5, 0.6), 0.6)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex(art)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	holder.add_child(pic)
	Paper.stat(col, "Class", "%s  ·  tier %d of 6" % [def.get("name", "Sloop"), tier])
	Paper.text(col, "She carries your crew past the Sea Gate. Buy her a bigger hull, name her, paint her, seat her crew, mount her arms, fit her repair kit and build her ultimate at the Gunwharf.", "note", Paper.ink_soft(), true)
	Paper.night = false


func close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	Paper.close(self, _parts)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()
