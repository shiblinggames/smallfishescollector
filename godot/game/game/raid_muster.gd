class_name RaidMuster
extends Control
## THE RAID CALL on the sea (a Charter's raid together, game/raid_table.gd):
## when a captain calls a raid, everyone in the line gets its entry screen
## (game/ready_screen.gd); everyone else aboard sees a small banner at the top
## (who is forming which raid, who is in) with Join, lit only near the raid.
## When the line sails, every captain in it is taken to the fight. The banner
## never blocks the sea under it.

var sea: Sea
var _card: Pane
var _body: VBoxContainer
var _until: float = 0.0
var _t: float = 0.0
var _left: Label
var _last: Dictionary = {}
var _opened_seq: int = -1
var _screen: ReadyScreen = null
var _join: Button = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.make()
	if RaidTable.live != null:
		RaidTable.live.changed.connect(_on_table)
		if not RaidTable.live.state.is_empty():
			_on_table(RaidTable.live.state)


func _my_key() -> String:
	return sea.net.key if sea.net != null else ""


func _member(st: Dictionary) -> bool:
	return Js.list(st.get("members")).any(func(m: Dictionary) -> bool: return m["key"] == _my_key())


func _on_table(st: Dictionary) -> void:
	_last = st
	match str(st.get("phase", "")):
		"muster":
			if _member(st):
				_close()
				# In the line: the entry screen.
				if _screen == null or not is_instance_valid(_screen):
					_screen = ReadyScreen.new()
					_screen.sea = sea
					_screen.table = RaidTable.live
					_screen.my_key = _my_key()
					sea._hud.hold_for(_screen)
					sea._hud_layer.add_child(_screen)
			else:
				_paint(st)
		"playing":
			_close()
			# The line has formed: a captain in it goes to the fight.
			if _member(st) and int(Js.num(st.get("seq"))) != _opened_seq and Js.list(st.get("ev")).any(func(e: Dictionary) -> bool: return e["t"] == "begin"):
				_opened_seq = int(Js.num(st.get("seq")))
				sea.open_coop_battle(st, _my_key())
		_:
			if str(st.get("result", "")) == "called off" and _card != null:
				sea._hud.toast("The raid was called off.")
			_close()


func _close() -> void:
	_join = null
	if _card != null:
		_card.queue_free()
		_card = null
		_left = null


func _paint(st: Dictionary) -> void:
	_close()
	var raid: Dictionary = Battle.raid_def(str(st["raidId"]))
	var node: Dictionary = Campaign.node(str(st["nodeId"]))
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
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 8)
	_card.add_child(_body)
	var mine: bool = st.get("by") == _my_key()
	var by: String = ""
	var names: Array = []
	for m: Dictionary in Js.list(st.get("members")):
		names.append(str(m["name"]))
		if m["key"] == st.get("by"):
			by = str(m["name"])
	Kit.text(_body, "%s is forming a raid" % by, "small", Dossier.SOFT)
	Kit.text(_body, str(raid.get("raidTitle", node.get("label", "A raid"))), "title")
	Kit.text(_body, "In the line: %s  ·  %d of %d seats" % [", ".join(PackedStringArray(names)), names.size(), RaidTable.MAX_SEATS], "small", Dossier.SOFT, true)
	_left = null
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_body.add_child(row)
	if Js.list(st.get("members")).size() < RaidTable.MAX_SEATS:
		var jn: Button = Kit.button("Join the raid", "primary")
		jn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_join = jn
		jn.pressed.connect(func() -> void:
			var r: Variant = await sea.session.act("raidTable", ["join", { "x": sea._boat.position.x, "y": sea._boat.position.y }])
			if r is Dictionary and r.has("error"):
				sea._hud.toast(str(r["error"])))
		row.add_child(jn)
	Pane.set_night(_card, true)
	_tick()


func _process(delta: float) -> void:
	_t += delta
	_tick()


func _tick() -> void:
	# Join lights only near the raid.
	if _join != null and is_instance_valid(_join) and not _last.is_empty():
		var at: bool = sea._boat.position.distance_to(RaidTable.dock_of(str(_last["nodeId"]))) <= RaidTable.NEAR
		_join.disabled = not at
		_join.text = "Join the raid" if at else "Sail to the raid to join"
