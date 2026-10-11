class_name HarbourLobby
extends Control
## THE HARBOR LOBBY (Godot port, the Charter slice): a new Charter's crew
## gathering before it sails. Four berths, filled as friends join and make
## their Charter captains; the founder invites (the Steam overlay) or reads out
## this machine's address (on the local network), and presses SET SAIL, which
## locks the roster for good. A crewmate waits for that. Either can leave.
##
## STARTING TOGETHER (Kong, 2026-10-11; it was plain text rows on the title's
## day paper, a card that jumped as crew came, the lock-in note shown to the
## founder alone, and Set Sail a one-frame cut):
##   THE BERTHS  four rows of one fixed height on the night paper: each
##               captain's portrait as they look on their boat, their name, a
##               quiet "you" on your own row, where they are (Founder, Aboard,
##               Ashore, Choosing a look). An empty berth is a quiet open seat.
##               A new arrival slides in with a soft plip. The card never
##               changes height.
##   READY       each crewmate has a Ready toggle on their own row; everyone
##               else sees a READY stamp thump onto it. The founder's button
##               reads "Set Sail (2 of 3 ready)" and is pressable whenever two
##               berths are filled: the founder sails with whoever is aboard,
##               ready or not (the roster locks for every berth, as it did).
##               The "locks the crew for good" note is shown to everyone.
##   CASTING OFF Set Sail starts CrewNet.CAST_OFF seconds of "Casting off" on
##               every harbour card: the berths seal one by one with a small
##               stamp (SAILS, or CLOSED on an open one), a hairline fills,
##               and the card fades into the night; the sea then fades in
##               with the Charter's name on the water (charter_start.gd).

signal set_sail
signal leave

const Cards = preload("res://game/charter_cards.gd")
const Start = preload("res://game/charter_start.gd")
## One berth row's height: fixed, so the card never jumps as crew arrive.
const ROW_H: float = 78.0
## When each berth seals while casting off (seconds in), and when the card
## starts to fade into the night.
const SEAL_AT: float = 0.45
const SEAL_STEP: float = 0.55
const FADE_AT: float = 2.55

var net: CrewNet
var info: Dictionary = {}
var _slots: Array[Control] = []
## What each slot shows now (a row is rebuilt only when this changes).
var _sigs: Array[String] = ["", "", "", ""]
var _stamps: Array = [null, null, null, null]
var _sail: Pane.PaneButton = null
var _ready_btn: Pane.PaneButton = null
var _line: Label = null
var _foot: HBoxContainer
var _pane: Control
var _list: Array = []
## Who was aboard and who was ready when last shown (an arrival slides in, a
## new Ready thumps on); nothing animates on the first showing.
var _was_aboard: Dictionary = {}
var _was_ready: Dictionary = {}
var _shown_once: bool = false
## Escape asked once: the next Escape (or the button) leaves.
var _asking: bool = false
## Casting off: seconds since Set Sail (-1 until then), how many berths have
## sealed, the hairline and the night the card fades into.
var _cast_t: float = -1.0
var _sealed: int = 0
var _hair: Control
var _night: ColorRect


func _ready() -> void:
	Cards.backdrop(self)
	var v: VBoxContainer = Cards.card(self, 640)
	_pane = v.get_parent()
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 14)
	v.add_child(head)
	var mark: Title.Emblem = Title.Emblem.new()
	mark.kind = "fleet"
	mark.custom_minimum_size = Vector2(58, 48)
	head.add_child(mark)
	var tv: VBoxContainer = VBoxContainer.new()
	tv.add_theme_constant_override("separation", 0)
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(tv)
	Kit.text(tv, "In harbour", "eyebrow", Color(Paper.CHOSEN, 0.85))
	var nr: HBoxContainer = HBoxContainer.new()
	nr.add_theme_constant_override("separation", 10)
	tv.add_child(nr)
	Kit.text(nr, str(info.get("name", "The Charter")), "display_sm", Paper.NIGHT_INK)
	if info.get("hardcore", false):
		Kit.chip(nr, "Hardcore", Paper.NIGHT_RED)
	Kit.text(v, "The crew gathers here before the Charter sails.", "note", Paper.NIGHT_INK_SOFT, true)
	Paper.rule(v, true)
	var berths: VBoxContainer = VBoxContainer.new()
	berths.add_theme_constant_override("separation", 8)
	v.add_child(berths)
	for i: int in Charter.BERTHS:
		var slot: Control = Control.new()
		slot.custom_minimum_size = Vector2(0, ROW_H)
		berths.add_child(slot)
		_slots.append(slot)
	# The casting off's hairline, filling over CAST_OFF (empty until then).
	_hair = Control.new()
	_hair.custom_minimum_size = Vector2(0, 6)
	_hair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hair.draw.connect(func() -> void:
		var y: float = 3.0
		_hair.draw_line(Vector2(0, y), Vector2(_hair.size.x, y), Paper.NIGHT_HAIR, 1.0)
		if _cast_t >= 0.0:
			var k: float = clampf(_cast_t / CrewNet.CAST_OFF, 0.0, 1.0)
			_hair.draw_line(Vector2(0, y), Vector2(_hair.size.x * k, y), Color(Paper.NIGHT_GOLD, 0.85), 2.0, true))
	v.add_child(_hair)
	if net.hosting:
		if SteamLayer.up:
			var inv: Pane.PaneButton = Paper.button("Invite friends", false, true)
			inv.pressed.connect(net.invite)
			v.add_child(inv)
		else:
			# With its port (hosting takes the first free one of a few), so a
			# crewmate types exactly this.
			var at: String = _address() if net.port == 0 else "%s:%d" % [_address(), net.port]
			Kit.text(v, "Crewmates join from their title screen at %s." % at, "small", Paper.NIGHT_INK_SOFT, true)
	# One line that says where things stand (who is ready, what Set Sail
	# does now, casting off), on both sides. Its text changes; its height not.
	_line = Kit.text(v, "", "body_strong", Paper.NIGHT_INK)
	_line.custom_minimum_size = Vector2(0, 22)
	# Shown to everyone (it was the founder's alone).
	Kit.text(v, "Set Sail locks the crew for good: nobody joins afterwards. A crewmate who stops playing keeps their berth.", "note", Paper.NIGHT_INK_SOFT, true)
	if net.hosting:
		_sail = Paper.primary("Set Sail", true)
		_sail.custom_minimum_size = Vector2(0, 50)
		_sail.pressed.connect(func() -> void:
			if _cast_t < 0.0:
				set_sail.emit())
		v.add_child(_sail)
	_foot = HBoxContainer.new()
	_foot.alignment = BoxContainer.ALIGNMENT_END
	v.add_child(_foot)
	_leave_button()
	# The night the card fades into as the crew cast off.
	_night = ColorRect.new()
	_night.color = Color(0.02, 0.035, 0.05, 0.0)
	_night.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_night.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_night)
	net.roster_changed.connect(_show)
	net.casting_off.connect(_on_casting)
	_show(net.roster() if net.hosting else net.last_roster)
	if net.casting:
		_on_casting()
	if _sail != null:
		_sail.grab_focus.call_deferred()


## Leave (quiet), or, once Escape has asked, "Leave the harbour?".
func _leave_button() -> void:
	for c: Node in _foot.get_children():
		_foot.remove_child(c)
		c.queue_free()
	var out: Pane.PaneButton = Paper.button("Leave the harbour?" if _asking else "Leave", false, true)
	out.tooltip_text = "Esc"
	out.pressed.connect(func() -> void: leave.emit())
	_foot.add_child(out)
	if _asking:
		out.grab_focus.call_deferred()


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed("fish_back"):
		return
	get_viewport().set_input_as_handled()
	if _asking:
		leave.emit()
		return
	_asking = true
	Sound.plip()
	_leave_button()


func _address() -> String:
	for a: String in IP.get_local_addresses():
		if a.count(".") == 3 and not a.begins_with("127.") and not a.begins_with("169.254"):
			return a
	return "127.0.0.1"


# ── The berths ────────────────────────────────────────────────────────────────

## The four berths, each in its own fixed slot; only a slot whose captain,
## look, place or Ready changed is drawn again.
func _show(list: Array) -> void:
	if not is_inside_tree():
		return
	_list = list
	var aboard_now: Dictionary = {}
	var ready_now: Dictionary = {}
	for i: int in Charter.BERTHS:
		var m: Dictionary = list[i] if i < list.size() else {}
		var me: bool = not m.is_empty() and str(m.get("key", "")) == net.key
		var sig: String = "" if m.is_empty() else JSON.stringify([m.get("key"), m.get("name"), m.get("aboard"), m.get("founder"), m.get("look"), m.get("fresh", false), m.get("ready", false), me])
		if not m.is_empty():
			if m.get("aboard", false):
				aboard_now[m["key"]] = true
			if m.get("ready", false) and not m.get("founder", false):
				ready_now[m["key"]] = true
		if sig == _sigs[i] and _slots[i].get_child_count() > 0:
			continue
		_sigs[i] = sig
		var arrived: bool = _shown_once and not m.is_empty() and m.get("aboard", false) and not _was_aboard.has(m["key"])
		var readied: bool = _shown_once and not m.is_empty() and ready_now.has(m["key"]) and not _was_ready.has(m["key"])
		_fill(i, m, me, arrived, readied)
	_was_aboard = aboard_now
	_was_ready = ready_now
	_shown_once = true
	_say()


## One berth: the captain's row, or a quiet open seat.
func _fill(i: int, m: Dictionary, me: bool, arrived: bool, readied: bool) -> void:
	var slot: Control = _slots[i]
	for c: Node in slot.get_children():
		slot.remove_child(c)
		c.queue_free()
	_stamps[i] = null
	if me:
		_ready_btn = null
	var filled: bool = not m.is_empty()
	var row: Pane = Kit.pane(slot, { "radius": Kit.R_LARGE, "fill": [Paper.NIGHT_PAPER_HI.lightened(0.04) if filled else Color(0, 0, 0, 0)], "border": [1, Color(Paper.NIGHT_INK, 0.12 if filled else 0.07)], "pad": [8, 6, 14, 6], "night": true })
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 14)
	row.add_child(h)
	if not filled:
		# A quiet open seat: a hollow where a portrait would be, two words.
		var hollow: Control = Control.new()
		hollow.custom_minimum_size = Vector2(100, 66)
		hollow.mouse_filter = Control.MOUSE_FILTER_IGNORE
		hollow.draw.connect(func() -> void:
			hollow.draw_arc(hollow.size / 2.0, 22.0, 0.0, TAU, 40, Color(Paper.NIGHT_INK, 0.14), 1.0, true))
		h.add_child(hollow)
		var ov: VBoxContainer = VBoxContainer.new()
		ov.alignment = BoxContainer.ALIGNMENT_CENTER
		ov.add_theme_constant_override("separation", 0)
		h.add_child(ov)
		Kit.text(ov, "Open berth", "body_strong", Paper.NIGHT_INK_FAINT)
		Kit.text(ov, "Waiting for a crewmate", "note", Color(Paper.NIGHT_INK_FAINT, 0.8))
		_end_mark(i, h, false)
		return
	var aboard: bool = m.get("aboard", false) == true
	var pic: Control = Cards.portrait(Js.obj(m.get("look")), Vector2(100, 66))
	pic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if not aboard:
		pic.modulate = Color(1, 1, 1, 0.45)
	h.add_child(pic)
	var nv: VBoxContainer = VBoxContainer.new()
	nv.alignment = BoxContainer.ALIGNMENT_CENTER
	nv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nv.add_theme_constant_override("separation", 0)
	h.add_child(nv)
	var nr: HBoxContainer = HBoxContainer.new()
	nr.add_theme_constant_override("separation", 8)
	nv.add_child(nr)
	Kit.text(nr, str(m.get("name", "")), "title", Paper.NIGHT_INK if aboard else Paper.NIGHT_INK_SOFT)
	if me:
		# Quiet: your own row, in a word.
		var you: Label = Kit.text(nr, "you", "label", Paper.NIGHT_INK_FAINT)
		you.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var where: String = "Founder" if m.get("founder", false) else ("Choosing a look" if m.get("fresh", false) else ("Aboard" if aboard else "Ashore"))
	Kit.text(nv, where, "small", Paper.NIGHT_GREEN if aboard and not m.get("fresh", false) else Paper.NIGHT_INK_FAINT)
	# The right end: your own Ready toggle, or the READY stamp others see.
	if me and not m.get("founder", false):
		var on: bool = m.get("ready", false) == true
		_ready_btn = Paper.button("Ready" if on else "Ready up", on, true)
		_ready_btn.custom_minimum_size = Vector2(118, 38)
		_ready_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		_ready_btn.tooltip_text = "Press again to stand down." if on else "Tell %s you are ready to sail." % net.founder_name()
		_ready_btn.disabled = _cast_t >= 0.0
		_ready_btn.pressed.connect(func() -> void:
			if _cast_t >= 0.0:
				return
			Sound.plip()
			net.harbour_ready(not on))
		h.add_child(_ready_btn)
		if _sail == null:
			_ready_btn.grab_focus.call_deferred()
	else:
		_end_mark(i, h, m.get("ready", false) == true and not m.get("founder", false), readied)
	if arrived:
		_slide_in(row)


## The row's right end: a READY stamp (thumping on if `fresh`), else room for
## the casting off's seal.
func _end_mark(i: int, h: HBoxContainer, ready: bool, fresh: bool = false) -> void:
	var st: Start.Stamp = Start.Stamp.new()
	st.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	st.word = "READY"
	st.ink = Paper.NIGHT_GREEN
	st.visible = ready
	h.add_child(st)
	_stamps[i] = st
	if ready and fresh:
		st.thump()
	if _cast_t >= 0.0 and i < _sealed:
		_seal_stamp(i, true)


## A new arrival slides in from the right with a soft plip.
func _slide_in(row: Control) -> void:
	row.modulate.a = 0.0
	Sound.plip()
	await get_tree().process_frame
	if not is_instance_valid(row):
		return
	var goal: float = row.position.x
	row.position.x = goal + 44.0
	var tw: Tween = row.create_tween().set_parallel(true)
	Motion.ease_rise(tw, row, "position:x", goal, 0.32)
	Motion.ease_fade(tw, row, "modulate:a", 1.0, 0.22)


## The one line: who is ready, what Set Sail does now, or casting off.
func _say() -> void:
	if _line == null:
		return
	var cname: String = str(info.get("name", "The Charter"))
	if _cast_t >= 0.0:
		_line.text = "Casting off. %s sets sail." % cname
		_line.add_theme_color_override("font_color", Paper.NIGHT_GOLD)
		return
	var filled: int = 0
	var aboard: int = 0
	var ready: int = 0
	var unready: Array = []
	var founder: String = net.founder_name()
	var me_ready: bool = false
	for m: Dictionary in _list:
		filled += 1
		if m.get("aboard", false):
			aboard += 1
			if m.get("ready", false):
				ready += 1
			else:
				unready.append("you" if str(m.get("key", "")) == net.key else str(m.get("name", "")))
		if str(m.get("key", "")) == net.key:
			me_ready = m.get("ready", false) == true
	_line.add_theme_color_override("font_color", Paper.NIGHT_INK)
	if net.hosting:
		if _sail != null:
			_sail.text = ("Set Sail (%d of %d ready)" % [ready, aboard]).to_upper()
			_sail.disabled = filled < 2
			_sail.tooltip_text = "A Charter sails with at least two captains." if filled < 2 else ""
		if filled < 2:
			_line.text = "A Charter sails with at least two captains."
		elif unready.is_empty():
			_line.text = "Everyone aboard is ready."
		else:
			var who: String = BattleLook.join_names(unready)
			_line.text = "%s %s not ready. You can sail anyway: everyone with a berth sails." % [who.left(1).to_upper() + who.substr(1), "is" if unready.size() == 1 else "are"]
	else:
		_line.text = ("Ready. Waiting on %s to set sail." % founder) if me_ready else ("Waiting on %s to set sail. Ready up when you are." % founder)


# ── Casting off ───────────────────────────────────────────────────────────────

func _on_casting() -> void:
	if _cast_t >= 0.0:
		return
	_cast_t = 0.0
	_sealed = 0
	if _sail != null:
		_sail.text = "CASTING OFF"
		_sail.disabled = true
		_sail.release_focus()
	if _ready_btn != null and is_instance_valid(_ready_btn):
		_ready_btn.disabled = true
	Sound.bell()
	_say()


func _process(delta: float) -> void:
	if _cast_t < 0.0:
		return
	_cast_t += delta
	_hair.queue_redraw()
	# The berths seal one by one, a small stamp each.
	while _sealed < Charter.BERTHS and _cast_t >= SEAL_AT + SEAL_STEP * _sealed:
		_seal_stamp(_sealed, false)
		_sealed += 1
	if _cast_t >= FADE_AT and _night.color.a == 0.0:
		var tw: Tween = _night.create_tween()
		tw.tween_property(_night, "color:a", 1.0, CrewNet.CAST_OFF - FADE_AT + 0.15).set_trans(Tween.TRANS_SINE)


## Berth i seals: SAILS on a filled one (ready or not, it sails), CLOSED on
## an open one, which goes quiet.
func _seal_stamp(i: int, quiet: bool) -> void:
	var st: Variant = _stamps[i]
	var filled: bool = i < _list.size()
	if st == null or not is_instance_valid(st):
		# Your own row (its Ready toggle): the seal goes over the toggle.
		if _ready_btn != null and is_instance_valid(_ready_btn) and filled and str(_list[i].get("key", "")) == net.key:
			var s2: Start.Stamp = Start.Stamp.new()
			s2.word = "SAILS"
			s2.ink = Paper.NIGHT_GOLD
			s2.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			var par: Node = _ready_btn.get_parent()
			par.remove_child(_ready_btn)
			_ready_btn.queue_free()
			_ready_btn = null
			par.add_child(s2)
			_stamps[i] = s2
			s2.thump(quiet)
		return
	var stamp: Start.Stamp = st
	stamp.visible = true
	stamp.word = "SAILS" if filled else "CLOSED"
	stamp.ink = Paper.NIGHT_GOLD if filled else Paper.NIGHT_INK_FAINT
	stamp.fs = 15 if filled else 13
	if quiet:
		stamp.queue_redraw()
	else:
		stamp.thump()
	if not filled:
		_slots[i].modulate.a = 0.55
