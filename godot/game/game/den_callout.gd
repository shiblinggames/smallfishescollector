extends Control
## THE DEN CALLOUT (THE DEN AND THE WATER TOGETHER, Kong, 2026-10-11; the
## walkthrough: nothing told the crew a friend was at a Den table, the friend
## just read "ashore"). When a crewmate takes a seat at a shared table the
## rest of the crew get words on the water, "Ben sat down at the wheel" (or
## "at the card table"), with Join and Not now. One callout per sit-down: the
## founder's game says it once per new seat (DenTables.sat), and this side
## lets the same captain at the same table call again only after REPEAT_S
## (stepping from the wheel to the slots and back is not a new sit-down).
##
## JOIN, by where you are: in the Mainland's berth (the Den is one of its
## doors) Join opens the Den on that game, closing a room you are in there;
## anywhere else south of the reef it reads "Set a course" and pins The
## Mainland on the compass, with the line "The Den is ashore at The
## Mainland." (in the port the Den is a Mainland door, not in the Tavern);
## a game still shut to you says when it opens instead. Nothing shows while
## you are at the Den yourself or in a fight. It goes after LIFE seconds.
## Made by the sea for a Charter (sea_folk.gd join_crew); no class_name.

const LIFE: float = 14.0
const REPEAT_S: float = 120.0
const TABLE_WORDS: Dictionary = { "roulette": "at the wheel", "blackjack": "at the card table" }
const GAME_NAMES: Dictionary = { "roulette": "Fish Roulette", "blackjack": "Blackjack" }
const GATES: Dictionary = { "roulette": "den_roulette", "blackjack": "den_blackjack" }

var sea: Sea
## "key|game" -> msec of the last callout for it.
var _last: Dictionary = {}
var _holder: Control = null
var _t: float = 0.0
## A callout that came while a sheet was open on the water: [game, who, msec],
## shown when the sheet goes (if it is still fresh), never over the sheet.
var _pending: Array = []


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	# A method of this node (not a lambda): the connection goes when it is
	# freed with the sea, and survives the node moving between layers.
	if DenTables.live != null:
		DenTables.live.sat.connect(_on_sat)


## Whether this captain is at the Den now (no callout over the tables).
func _at_den() -> bool:
	for c: Node in sea._room_layer.get_children():
		if c is DenRoom and not c.is_queued_for_deletion():
			return true
	return false


func _room_open() -> Room:
	for c: Node in sea._room_layer.get_children():
		if c is Room and not c.is_queued_for_deletion() and not Motion.closing(c):
			return c
	return null


func _on_sat(game: String, key: String, who: String) -> void:
	if sea == null or sea.net == null or key == sea.net.key or not TABLE_WORDS.has(game):
		return
	if sea.stage != null or _at_den():
		return
	var id: String = "%s|%s" % [key, game]
	var now: int = Time.get_ticks_msec()
	if _last.has(id) and now - int(_last[id]) < int(REPEAT_S * 1000.0):
		return
	_last[id] = now
	if _room_open() == null and sea._hud != null and sea._hud.busy():
		_pending = [game, who, now]
		return
	_show(game, who)


func _show(game: String, who: String) -> void:
	_close(false)
	_t = 0.0
	# Over a room you are in (the Market, the Tackle Shop), else on the water
	# over the HUD (a sheet open there holds it back: _pending).
	var room: Room = _room_open()
	var layer: CanvasLayer = sea._room_layer if room != null else sea._hud_layer
	if get_parent() != layer:
		get_parent().remove_child(self)
		layer.add_child(self)
	layer.move_child(self, layer.get_child_count() - 1)
	var holder: VBoxContainer = VBoxContainer.new()
	holder.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	holder.offset_left = -330
	holder.offset_right = 330
	holder.offset_top = 228
	holder.alignment = BoxContainer.ALIGNMENT_BEGIN
	holder.add_theme_constant_override("separation", 6)
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(holder)
	_holder = holder
	var head: Label = Kit.lift(Kit.text(holder, "%s sat down %s" % [who, TABLE_WORDS[game]], "heading", Kit.SEA_INK))
	head.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sub: Label = Kit.lift(Kit.text(holder, "", "small", Kit.SEA_INK))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row: HBoxContainer = HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(row)
	var xp: float = Js.num(sea.session.profile().get("fishing_xp"))
	var shut: String = Rules.gate_block("feature", str(GATES[game]), xp)
	var here: bool = Chart.in_berth(sea._boat.position)
	if shut != "":
		sub.text = "%s: %s" % [GAME_NAMES[game], shut]
	elif here:
		sub.text = "The Den is one of The Mainland's doors."
		var jn: Button = _button("Join")
		jn.pressed.connect(func() -> void: _join(game))
		row.add_child(jn)
	else:
		sub.text = "The Den is ashore at The Mainland."
		if not North.is_north(sea._boat.position) and sea._compass != null:
			var go: Button = _button("Set a course")
			go.tooltip_text = "Pin The Mainland on your compass"
			go.pressed.connect(func() -> void:
				sea._compass.pinned = "port:mainland"
				sea._hud.toast("The Mainland is pinned on your compass. The Den is ashore there.")
				_close())
			row.add_child(go)
	var no: Button = _button("Not now")
	no.pressed.connect(func() -> void: _close())
	row.add_child(no)
	Sound.plip()
	Motion.note_in(holder)


## A small button on the water (the HUD's water pill; a pad can reach it).
func _button(t: String) -> Button:
	var bt: Pane.PaneButton = Pane.PaneButton.new(Kit.water_pill([14, 5, 14, 6]), Kit.water_pill([14, 5, 14, 6], true))
	bt.text = t
	bt.custom_minimum_size = Vector2(96, 32)
	bt.focus_mode = Control.FOCUS_ALL
	bt.add_theme_font_override("font", Kit.tracked("karla", 800, 12, 0.1))
	bt.add_theme_font_size_override("font_size", 12)
	Kit.tap(bt)
	return bt


## Join: the Den opens on that game (a room open at the Mainland closes first).
func _join(game: String) -> void:
	_close()
	if sea.stage != null or _at_den():
		return
	var room: Room = _room_open()
	if room != null:
		room.close()
	sea._enter_room("den:%s" % game)


func _close(fade: bool = true) -> void:
	if _holder != null and is_instance_valid(_holder):
		if fade:
			Motion.note_out(_holder)
		else:
			_holder.queue_free()
	_holder = null


func _process(delta: float) -> void:
	if not _pending.is_empty() and _holder == null and not sea._hud.busy():
		var p: Array = _pending
		_pending = []
		if Time.get_ticks_msec() - int(p[2]) < int(LIFE * 1000.0) and sea.stage == null and not _at_den():
			_show(str(p[0]), str(p[1]))
	if _holder == null:
		return
	_t += delta
	# Gone after its time, or once you are at the Den or in a fight anyway.
	if _t > LIFE or sea.stage != null or _at_den():
		_close()
