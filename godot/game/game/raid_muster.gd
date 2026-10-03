class_name RaidMuster
extends Control
## THE MUSTER CALL on the sea (a Charter's raid together, game/raid_table.gd):
## when a captain calls a raid, everyone aboard sees a card at the top of the
## screen with the raid, who is coming and how long until it sails; a captain
## whose map has reached it may Join. The caller may sail at once or call it
## off. When the line forms, every captain in it is taken to the fight.
## The expedition side's night paper. It never blocks the sea under it.

var sea: Sea
var _card: Pane
var _body: VBoxContainer
var _until: float = 0.0
var _t: float = 0.0
var _left: Label
var _last: Dictionary = {}
var _opened_seq: int = -1
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
			_until = _t + float(Js.nz(st.get("left"), RaidTable.MUSTER))
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
	Kit.text(_body, "A RAID IS CALLED", "eyebrow", Kit.a(Kit.GOLD, 0.85))
	Kit.text(_body, str(raid.get("raidTitle", node.get("label", "A raid"))), "title")
	Kit.text(_body, "%s the crew to arms. Aboard: %s." % ["You call" if mine else by + " calls", ", ".join(PackedStringArray(names))], "body", Kit.INK_2, true)
	_left = Kit.text(_body, "", "note", Kit.DIM)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_body.add_child(row)
	if mine:
		var off: Button = Kit.button("Call it off", "secondary")
		off.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		off.pressed.connect(func() -> void: sea.session.act("raidTable", ["leave"]))
		row.add_child(off)
		var go: Button = Kit.button("Sail now", "primary")
		go.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		go.pressed.connect(func() -> void: sea.session.act("raidTable", ["go"]))
		row.add_child(go)
	elif _member(st):
		var lv: Button = Kit.button("Stay behind", "secondary")
		lv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lv.pressed.connect(func() -> void: sea.session.act("raidTable", ["leave"]))
		row.add_child(lv)
	elif Js.list(st.get("members")).size() < RaidTable.MAX_SEATS:
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
	if _left == null:
		return
	var n: int = maxi(0, ceili(_until - _t))
	if _join != null and not _last.is_empty():
		var at: bool = sea._boat.position.distance_to(RaidTable.dock_of(str(_last["nodeId"]))) <= RaidTable.NEAR
		_join.disabled = not at
		_join.text = "Join the raid" if at else "Sail to the raid to join"
	_left.text = "Sails in %ds. Every captain in the line earns their own XP, crate and clear; the coin goes to the crew's purse." % n
