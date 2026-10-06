class_name GauntletMuster
extends Control
## THE DIVE CALL on the sea (game/gauntlet_table.gd): a captain in the line
## gets the entry screen (game/gauntlet_entry.gd); everyone else aboard a
## Charter sees a small banner (who is forming which dive, who is in) with
## Join, lit only near the maelstrom. When the line goes down, every captain
## in it is taken into the dive. Alone, the same for the one captain.

var sea: Sea
var table: GauntletTable
var my_key: String = ""
var _card: Pane
var _join: Button = null
var _last: Dictionary = {}
var _opened_seq: int = -1
var _screen: GauntletEntry = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.make()
	table.changed.connect(_on_table)
	if not table.state.is_empty():
		_on_table(table.state)


var _rang: Array = [-1]


func _member(st: Dictionary) -> bool:
	return Js.list(st.get("members")).any(func(m: Dictionary) -> bool: return m["key"] == my_key) or Js.obj(st.get("caps")).has(my_key)


func _on_table(st: Dictionary) -> void:
	_last = st
	match str(st.get("phase", "")):
		"muster":
			if _member(st):
				_close()
				if _screen == null or not is_instance_valid(_screen):
					_screen = GauntletEntry.new()
					_screen.sea = sea
					_screen.table = table
					_screen.my_key = my_key
					sea._hud.hold_for(_screen)
					sea._hud_layer.add_child(_screen)
			else:
				_paint(st)
		"playing":
			_close()
			if _member(st) and int(Js.num(st.get("seq"))) != _opened_seq and Js.list(st.get("ev")).any(func(e: Dictionary) -> bool: return e["t"] in ["begin", "resume"]):
				_opened_seq = int(Js.num(st.get("seq")))
				sea.open_gauntlet_battle(table, my_key, str(Js.obj(st.get("run")).get("variant", "davy")))
		"idle", "done":
			_close()
		_:
			_close()


func _close() -> void:
	_join = null
	if _card != null:
		_card.queue_free()
		_card = null


func _paint(st: Dictionary) -> void:
	_close()
	var spec: Dictionary = Kit.modal(Kit.GOLD, 18)
	spec["night"] = true
	var holder: Control = Control.new()
	holder.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	holder.offset_left = -270
	holder.offset_right = 270
	holder.offset_top = 96
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(holder)
	_card = Kit.pane(holder, spec)
	_card.custom_minimum_size = Vector2(540, 0)
	var body: VBoxContainer = VBoxContainer.new()
	body.add_theme_constant_override("separation", 8)
	_card.add_child(body)
	var by: String = ""
	var names: Array = []
	for m: Dictionary in Js.list(st.get("members")):
		names.append(str(m["name"]))
		if m["key"] == st.get("by"):
			by = str(m["name"])
	Kit.text(body, "%s is gathering a %s dive" % [by, "co-op" if str(st.get("mode", "solo")) == "coop" else "solo"], "small", Dossier.SOFT)
	Kit.text(body, str(Gauntlet.NAMES.get(str(st.get("variant", "davy")), "")), "title")
	Kit.text(body, "In the line: %s  ·  %d of %d" % [", ".join(PackedStringArray(names)), names.size(), GauntletTable.MAX_SEATS], "small", Dossier.SOFT, true)
	RaidMuster.invite_block(body, st, my_key, by, str(Gauntlet.NAMES.get(str(st.get("variant", "davy")), "a dive")), sea, "gauntletTable", "dive", _rang)
	if names.size() < GauntletTable.MAX_SEATS:
		var jn: Button = Kit.button("Join the dive", "primary")
		_join = jn
		jn.pressed.connect(func() -> void:
			var r: Variant = await sea.session.act("gauntletTable", ["join", { "x": sea._boat.position.x, "y": sea._boat.position.y }])
			if r is Dictionary and (r as Dictionary).has("error"):
				sea._hud.toast(str(r["error"])))
		body.add_child(jn)
	Pane.set_night(_card, true)


func _process(_d: float) -> void:
	if _join != null and is_instance_valid(_join) and not _last.is_empty():
		var at: bool = GauntletTable.near(str(_last.get("variant", "davy")), { "x": sea._boat.position.x, "y": sea._boat.position.y })
		_join.disabled = not at
		_join.text = "Join the dive" if at else "Sail to the maelstrom to join"
