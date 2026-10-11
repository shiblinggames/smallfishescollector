extends Control
## ENDING TOGETHER ON THE SEA (Kong, 2026-10-11), for a Charter's raids and
## dives (the founder's tables: game/raid_table.gd, game/gauntlet_table.gd):
##
##   THE FOLLOW CARD   a captain who fled or sank out of a co-op raid, or is out
##                     of a dive, is not left with nothing: a small night card
##                     on the sea while the crew fight on ("The crew fight on
##                     · Anna · fight 2 of 5"), updating as the line goes.
##   THE SPOILS SHEET  when a co-op raid ends (won or lost), every captain of
##                     it gets the shared sheet (game/crew_spoils.gd) once
##                     their own fight screen has closed; so does a captain
##                     who followed a dive from outside it. Those still in a
##                     dive see it in the dive's own sheet instead
##                     (game/gauntlet_overlay.gd).
##   A TOAST           for a captain who put the follow card away (Hide), or
##                     is busy in another screen when it ends: the result in a
##                     line, and their share.
## Solo raids and dives (one captain in the line) keep their own endings.

const CrewSpoils = preload("res://game/crew_spoils.gd")

var sea: Sea
var my_key: String = ""
## The Charter's tables: [table, op].
var tables: Array = []

## Runs seen under way on this game (a sheet only for those: a state handed
## over on joining, of a run long done, is not news), and runs already ended
## here (shown, toasted, or shown by the dive's own sheet).
var _live: Dictionary = {}
var _done: Dictionary = {}
## The follow card, the run it follows, and runs whose card was put away.
var _card: Control = null
var _card_l: Label = null
var _card_sub: Label = null
var _card_rid: String = ""
var _hidden: Dictionary = {}
var _sheet: Control = null


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.make()
	for pair: Array in tables:
		var t: Node = pair[0]
		if t != null:
			t.connect("changed", _on_state.bind(t))


func _on_state(st: Dictionary, t: Node) -> void:
	var rid: String = str(st.get("rid", ""))
	if rid == "":
		return
	var ph: String = str(st.get("phase", ""))
	if not ["idle", "muster", "done"].has(ph) and str(Js.obj(st.get("spoils")).get("result", "")) == "":
		_live[rid] = true
	# A dive's end shown in the dive's own sheet, on this game's fight screen.
	if ph in ["haul", "dead"] and RaidMuster.stage_up(sea, t):
		_done[rid] = true


func _process(_delta: float) -> void:
	if sea == null:
		return
	var follow: Array = []
	for pair: Array in tables:
		var t: Node = pair[0]
		if t == null or not is_instance_valid(t):
			continue
		var st: Dictionary = Js.obj(t.get("state"))
		var rid: String = str(st.get("rid", ""))
		if rid == "" or not _live.has(rid):
			continue
		if _ended(st):
			if not _done.has(rid) and _mine(st) and not RaidMuster.stage_up(sea, t):
				_done[rid] = true
				_finish(st, t, str(pair[1]))
		elif follow.is_empty():
			var f: Array = _following(st, t)
			if not f.is_empty():
				follow = [rid, f[0], f[1]]
	_paint_card(follow)


## A co-op run's end is in (its spoils carry a result).
static func _ended(st: Dictionary) -> bool:
	var sp: Dictionary = Js.obj(st.get("spoils"))
	if sp.is_empty() or str(sp.get("result", "")) == "":
		return false
	if str(sp.get("kind", "")) == "dive":
		return ["haul", "dead", "done"].has(str(st.get("phase", "")))
	return true


## This captain had a column in it, and it was a crew's (two or more).
func _mine(st: Dictionary) -> bool:
	var seats: Dictionary = Js.obj(Js.obj(st.get("spoils")).get("seats"))
	return seats.size() >= 2 and seats.has(my_key)


## [the line, the line under it] for a captain out of a run still going, or
## [] (still in it, not in it, or nothing to follow).
func _following(st: Dictionary, t: Node) -> Array:
	var ph: String = str(st.get("phase", ""))
	if ["idle", "muster", "done"].has(ph) or RaidMuster.stage_up(sea, t):
		return []
	var b: Dictionary = Js.obj(st.get("b"))
	var seats: Array = Js.list(b.get("seats"))
	if seats.size() < 2:
		return []
	var gone: Dictionary = Js.obj(st.get("gone"))
	var caps: Dictionary = Js.obj(st.get("caps"))
	var in_line: Array = []
	var am_out: bool = false
	var am_in: bool = false
	for s: Dictionary in seats:
		var k: String = str(s.get("key", ""))
		var out: bool = s.get("fled", false) == true or gone.has(k)
		if caps.is_empty():
			out = out or s.get("sunk", false) == true
		else:
			out = out or str(Js.obj(caps.get(k)).get("out", "")) != ""
		if k == my_key:
			am_in = true
			am_out = out
		elif not out:
			in_line.append(str(s.get("name", "A captain")))
	if not am_in or not am_out or in_line.is_empty():
		return []
	var names: String = BattleLook.join_names(in_line)
	if caps.is_empty():
		var raid: Dictionary = Battle.raid_def(str(st.get("raidId", "")))
		var of: int = int(Battle.fight_at(raid, 0)["of"]) if not raid.is_empty() else 0
		return ["The crew fight on  ·  %s  ·  fight %d of %d" % [names, int(Js.num(b.get("fight"))) + 1, of], str(raid.get("raidTitle", "The raid"))]
	var run: Dictionary = Js.obj(st.get("run"))
	var depth: int = int(Js.num(Js.obj(st.get("fight")).get("depth")))
	if depth <= 0:
		depth = int(Js.num(Js.obj(run.get("roll")).get("cleared"))) + int(Js.num(run.get("skip")))
	return ["The crew dive on  ·  %s  ·  depth %d" % [names, depth], "The Don's Gauntlet" if str(run.get("variant", "")) == "don" else "Davy's Gauntlet"]


# ── The follow card ──────────────────────────────────────────────────────────

func _paint_card(follow: Array) -> void:
	var want: bool = not follow.is_empty() and not _hidden.has(str(follow[0]))
	if not want:
		if _card != null:
			var c: Control = _card
			_card = null
			Motion.note_out(c)
		return
	if _card == null:
		_build_card()
	_card_rid = str(follow[0])
	if _card_l.text != str(follow[1]):
		_card_l.text = str(follow[1])
	_card_sub.text = "%s  ·  you will see the spoils when it ends" % follow[2]


func _build_card() -> void:
	var holder: Control = Control.new()
	holder.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	holder.offset_left = -280
	holder.offset_right = 280
	holder.offset_top = 96
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(holder)
	var spec: Dictionary = Kit.modal(Kit.GOLD, 14)
	spec["night"] = true
	var pane: Pane = Kit.pane(holder, spec)
	pane.custom_minimum_size = Vector2(560, 0)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	pane.add_child(row)
	var col: VBoxContainer = VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 2)
	row.add_child(col)
	_card_l = Kit.text(col, "", "body_strong", Dossier.INK, true)
	_card_sub = Kit.text(col, "", "small", Dossier.SOFT, true)
	var hide: Button = BattleLook.night_button("Hide")
	hide.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hide.tooltip_text = "Put the card away. The result comes as a note when the crew are done."
	hide.pressed.connect(func() -> void:
		Sound.plip()
		_hidden[_card_rid] = true)
	row.add_child(hide)
	Pane.set_night(pane, true)
	_card = holder
	Motion.note_in(holder)


# ── The end ──────────────────────────────────────────────────────────────────

func _finish(st: Dictionary, t: Node, op: String) -> void:
	var rid: String = str(st.get("rid", ""))
	var hud: FishingHud = sea._hud
	# Put away, or busy elsewhere (a room, a menu): a toast instead.
	if _hidden.has(rid) or (hud != null and hud.busy()) or (_sheet != null and is_instance_valid(_sheet)):
		hud.toast(summary(Js.obj(st.get("spoils")), my_key))
		return
	var sh: Control = CrewSpoils.new()
	sh.set("sea", sea)
	sh.set("table", t)
	sh.set("op", op)
	sh.set("my_key", my_key)
	sh.set("st", st)
	hud.hold_for(sh)
	# Its own layer over the sea's notices (a sunrise notice poked out beside
	# it), under the Esc menu's (90); it goes when the sheet does.
	var over: CanvasLayer = CanvasLayer.new()
	over.layer = 70
	sea.add_child(over)
	over.add_child(sh)
	sh.tree_exited.connect(over.queue_free)
	_sheet = sh


## The result in one line, and this captain's share (the toast's words).
static func summary(sp: Dictionary, me: String) -> String:
	var c: Dictionary = Js.obj(Js.obj(sp.get("seats")).get(me))
	var at: int = int(Js.num(sp.get("at")))
	var share: String = "  ·  Your share: %s ⟡, +%s XP" % [Js.thousands(Js.num(c.get("coin"))), Js.thousands(Js.num(c.get("xp")))]
	if str(sp.get("kind", "")) == "dive":
		if str(sp.get("result", "")) == "lost":
			return "The crew went down at depth %d  ·  your Fathoms are paid (+%s)" % [at, Js.thousands(Js.num(c.get("fathoms")))]
		return "The crew banked at depth %d%s" % [at, share]
	match str(sp.get("result", "")):
		"lost":
			return "The crew's line was broken at fight %d of %s%s" % [at, sp.get("raid", "the raid"), share]
		"fled":
			return "The crew fell back at fight %d of %s%s" % [at, sp.get("raid", "the raid"), share]
	return "The crew won %s%s" % [sp.get("raid", "the raid"), share]
