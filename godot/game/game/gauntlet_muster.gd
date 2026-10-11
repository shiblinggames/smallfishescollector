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
## The banner's holder (what fades in and out).
var _holder: Control = null
var _join: Button = null
var _last: Dictionary = {}
var _opened_seq: int = -1
var _screen: GauntletEntry = null
## The invite's own buttons (On my way far off, Join near), swapped by _process.
var _inv: Dictionary = {}
var _stage_left_ms: int = -100000


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
				if _screen == null or not is_instance_valid(_screen) or Motion.closing(_screen):
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
			else:
				_back_in(st)
		"idle", "done":
			_close()
			RaidMuster.end_left_open(sea, table, st)
		_:
			_close()
			_back_in(st)


## BACK IN THE LINE (as RaidMuster._back_in): a captain still in the dive
## (not out of it, not gone) with no fight screen up for it gets one, where
## the dive stands (its sheet, its fight).
func _back_in(st: Dictionary) -> void:
	if not st.has("b") or not Js.obj(st.get("caps")).has(my_key) or Js.obj(st.get("gone")).has(my_key):
		return
	if str(Js.obj(Js.obj(st.get("caps")).get(my_key)).get("out", "")) != "":
		return
	# An end screen this captain has already pressed on from.
	if str(st.get("phase", "")) in ["haul", "dead", "held"] and Js.obj(st.get("acks")).has(my_key):
		return
	if RaidMuster.stage_up(sea, table) or Time.get_ticks_msec() - _stage_left_ms < 4000:
		return
	_opened_seq = int(Js.num(st.get("seq")))
	sea.open_gauntlet_battle(table, my_key, str(Js.obj(st.get("run")).get("variant", "davy")))
	var bs: BattleStage = RaidMuster.stage_of(sea, table)
	if bs != null:
		bs.rejoin = true
		bs.tree_exiting.connect(func() -> void: _stage_left_ms = Time.get_ticks_msec())


## The banner going: it fades away (fade = false: freed at once, for a
## repaint that puts the next one straight in its place).
func _close(fade: bool = true) -> void:
	_join = null
	_inv = {}
	if _holder != null and is_instance_valid(_holder):
		if fade:
			Motion.note_out(_holder)
		else:
			_holder.queue_free()
	_holder = null
	_card = null


func _paint(st: Dictionary) -> void:
	# A repaint swaps in place; a banner that was not up arrives (Motion.note_in).
	var was_up: bool = _holder != null and is_instance_valid(_holder)
	_close(false)
	var spec: Dictionary = Kit.modal(Kit.GOLD, 18)
	spec["night"] = true
	var holder: Control = Control.new()
	holder.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	holder.offset_left = -270
	holder.offset_right = 270
	holder.offset_top = 96
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(holder)
	_holder = holder
	if not was_up:
		Motion.note_in(holder)
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
	var solo: bool = str(st.get("mode", "solo")) != "coop"
	Kit.text(body, ("%s is diving alone" % by) if solo else ("%s is gathering a co-op dive" % by), "small", Dossier.SOFT)
	Kit.text(body, str(Gauntlet.NAMES.get(str(st.get("variant", "davy")), "")), "title")
	if solo:
		# A solo dive takes nobody else: no Join to be refused (the
		# walkthrough, 2026-10-11), only who it is.
		Kit.text(body, "A solo dive. %s can switch it to Co-op to bring the crew." % by, "small", Dossier.SOFT, true)
		Pane.set_night(_card, true)
		return
	Kit.text(body, "In the line: %s  ·  %d of %d" % [", ".join(PackedStringArray(names)), names.size(), GauntletTable.MAX_SEATS], "small", Dossier.SOFT, true)
	_inv = RaidMuster.invite_block(body, st, my_key, by, str(Gauntlet.NAMES.get(str(st.get("variant", "davy")), "a dive")), sea, "gauntletTable", "dive", _rang, "Join the dive")
	if _inv.is_empty() and names.size() < GauntletTable.MAX_SEATS:
		var jn: Button = Kit.button("Join the dive", "primary")
		_join = jn
		jn.pressed.connect(func() -> void:
			var r: Variant = await sea.session.act("gauntletTable", ["join", { "x": sea._boat.position.x, "y": sea._boat.position.y }])
			if r is Dictionary and (r as Dictionary).has("error"):
				sea._hud.toast(str(r["error"])))
		body.add_child(jn)
	Pane.set_night(_card, true)


func _process(_d: float) -> void:
	if _last.is_empty() or str(_last.get("phase", "")) != "muster":
		return
	var at: bool = GauntletTable.near(str(_last.get("variant", "davy")), { "x": sea._boat.position.x, "y": sea._boat.position.y })
	if _join != null and is_instance_valid(_join):
		# The line counting down to dive (STARTING TOGETHER) takes nobody more.
		var counting: bool = not Js.obj(_last.get("count")).is_empty()
		_join.disabled = not at or counting
		_join.text = "The line is going down" if counting else ("Join the dive" if at else "Sail to the maelstrom to join")
	RaidMuster.invite_swap(_inv, at)
