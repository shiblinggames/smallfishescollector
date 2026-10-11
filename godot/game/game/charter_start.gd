extends RefCounted
## STARTING TOGETHER (Kong, 2026-10-11; docs/systems/steam-port.md): the
## pieces a Charter's crew see as they start something together.
##
##   LookCard   a new crewmate's first step after the founder answers: the
##              Found form's name-and-colour captain card (portrait, the free
##              starting colours), before the harbour. A known berth skips it.
##   Stamp      a small ink stamp that thumps on (READY on a berth or a seat,
##              SAILS and CLOSED as the harbour casts off), with a few specks
##              of ink flying off it, drawn in code.
##   CountDial  the 3, 2, 1 in a muster's footer (a raid's or a dive's), a
##              ring draining each second, read off the table's state.
##   sets_sail  the fade from the harbour onto the water, where "<Charter>
##              sets sail" rises in words on the water, every hull ringing
##              the water as it casts off.
##
## No class_name (main.gd, harbour_lobby.gd, ready_screen.gd and
## gauntlet_entry.gd preload it). Crew menus are on the night paper: flat, no
## wood, brass or coloured rims.

const Cards = preload("res://game/charter_cards.gd")
## This file, for its inner classes to reach the helpers above them.
const Start_ = preload("res://game/charter_start.gd")

## How long a stamp takes to land, and how far its specks of ink fly.
const STAMP_LAND: float = 0.16
const SPECKS: float = 0.36


## A stamp drawn on any canvas item: `word` in Cinzel capitals in a thin
## rectangle, tilted a little, in `ink`. `age` is seconds since it was
## pressed (it lands from larger and fainter, and throws a few specks); a big
## age is simply there.
static func draw_stamp(ci: CanvasItem, c: Vector2, word: String, ink: Color, age: float, fs: int = 15, tilt: float = -0.09) -> void:
	var k: float = clampf(age / STAMP_LAND, 0.0, 1.0)
	var e: float = 1.0 - pow(1.0 - k, 3.0)
	var sc: float = lerpf(1.7, 1.0, e)
	var a: float = k
	var f: Font = Kit.font("cinzel", 700)
	var tw: float = f.get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var box: Vector2 = Vector2(tw + 18.0, fs + 12.0)
	ci.draw_set_transform(c, tilt, Vector2(sc, sc))
	var r: Rect2 = Rect2(-box / 2.0, box)
	ci.draw_rect(r, Color(ink, 0.08 * a), true)
	ci.draw_rect(r, Color(ink, 0.9 * a), false, 2.0, true)
	ci.draw_string(f, Vector2(-tw / 2.0, fs * 0.36), word, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(ink, a))
	ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	# The specks: a few drops of ink thrown off as it lands, gone in a moment.
	if age >= STAMP_LAND * 0.6 and age < SPECKS:
		var u: float = (age - STAMP_LAND * 0.6) / (SPECKS - STAMP_LAND * 0.6)
		for i: int in 7:
			var ang: float = i * 0.9 + 0.4
			var dir: Vector2 = Vector2(cos(ang), sin(ang) * 0.6)
			var p: Vector2 = c + dir * (box.x * 0.45 + u * 22.0)
			ci.draw_circle(p, 1.6 * (1.0 - u) + 0.4, Color(ink, 0.7 * (1.0 - u)))


# ── A stamp ───────────────────────────────────────────────────────────────────

## A stamp as its own small Control (the harbour's rows).
class Stamp:
	extends Control

	var word: String = "READY"
	var ink: Color = Paper.NIGHT_GREEN
	var fs: int = 15
	## When it was pressed (msec): long ago means it is just there.
	var pressed_ms: int = -100000

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		custom_minimum_size = Vector2(104, 40)
		set_process(false)

	## Pressed now: it lands with a soft thump.
	func thump(quiet: bool = false) -> void:
		pressed_ms = Time.get_ticks_msec()
		set_process(true)
		queue_redraw()
		if not quiet:
			Sound.seal(false)

	func _process(_d: float) -> void:
		queue_redraw()
		if Time.get_ticks_msec() - pressed_ms > int(SPECKS * 1000.0) + 60:
			set_process(false)

	func _draw() -> void:
		Start_.draw_stamp(self, size / 2.0, word, ink, float(Time.get_ticks_msec() - pressed_ms) / 1000.0, fs)


# ── The count ─────────────────────────────────────────────────────────────────

## THE COUNT in a muster's footer: "The line sails in" and 3, 2, 1, a ring
## draining each second. Read off the table's state: `secs` from when this
## screen heard of it (`start_ms`), so every screen counts the same.
class CountDial:
	extends Control

	var start_ms: int = 0
	var secs: float = 3.0
	var words: String = "The line sails in"
	var under: String = "Leave is still open."
	var _shown: int = -1
	var _pop_ms: int = -100000

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		custom_minimum_size = Vector2(320, 60)

	func left() -> float:
		return secs - float(Time.get_ticks_msec() - start_ms) / 1000.0

	func _process(_d: float) -> void:
		var n: int = clampi(int(ceil(left())), 1, int(ceil(secs)))
		if n != _shown:
			# Each number lands with a tick, a little higher as it nears.
			if _shown != -1 or left() > secs - 0.2:
				Sound.job_tick(int(ceil(secs)) - n)
			_shown = n
			_pop_ms = Time.get_ticks_msec()
		queue_redraw()

	func _draw() -> void:
		var c: Vector2 = Vector2(28, size.y / 2.0)
		var frac: float = clampf(fmod(maxf(left(), 0.0), 1.0), 0.0, 1.0)
		if left() <= 0.0:
			frac = 0.0
		var ink: Color = Paper.NIGHT_INK
		draw_arc(c, 25.0, 0.0, TAU, 48, Color(ink, 0.12), 2.0, true)
		draw_arc(c, 25.0, -PI / 2.0, -PI / 2.0 + TAU * frac, 48, Paper.NIGHT_GOLD, 2.5, true)
		var age: float = float(Time.get_ticks_msec() - _pop_ms) / 1000.0
		var k: float = clampf(age / 0.18, 0.0, 1.0)
		var sc: float = lerpf(1.35, 1.0, 1.0 - pow(1.0 - k, 3.0))
		var f: Font = Kit.font("cinzel", 800)
		var t: String = str(maxi(_shown, 1))
		var w: float = f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 30).x
		draw_set_transform(c, 0.0, Vector2(sc, sc))
		draw_string(f, Vector2(-w / 2.0, 11.0), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, Color(ink, lerpf(0.3, 1.0, k)))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		draw_string(Kit.font("karla", 800), Vector2(66, size.y / 2.0 - 3.0), words, HORIZONTAL_ALIGNMENT_LEFT, size.x - 70.0, 15, ink)
		draw_string(Kit.font("karla", 600), Vector2(66, size.y / 2.0 + 16.0), under, HORIZONTAL_ALIGNMENT_LEFT, size.x - 70.0, 12, Paper.NIGHT_INK_SOFT)


## When a screen first heard of a count: its state's `count` ({ n, secs })
## and `left` (seconds still to go when it was sent) give the moment it began
## here. `seen` keeps each count's start per screen (n -> msec).
static func count_start(st: Dictionary, seen: Dictionary) -> int:
	var cnt: Dictionary = Js.obj(st.get("count"))
	if cnt.is_empty():
		return -1
	var n: int = int(Js.num(cnt.get("n")))
	if not seen.has(n):
		var secs: float = Js.num(cnt.get("secs"))
		var left: float = Js.num(st.get("left")) if Js.num(st.get("left")) > 0.0 else secs
		seen[n] = Time.get_ticks_msec() - int((secs - minf(left, secs)) * 1000.0)
	return int(seen[n])


# ── The crewmate's look ───────────────────────────────────────────────────────

## THE CREWMATE'S LOOK: the name-and-colour captain card the founder's Found
## form has, as a new crewmate's first step (the walkthrough: every crewmate
## sailed default green, and a blank name became "crew_f9f08"). Come aboard
## sends it and opens the harbour; Leave (Esc, asked once) goes back to port.
class LookCard:
	extends Control

	signal chosen(captain_name: String, color: String)
	signal leave

	var charter_name: String = ""
	var founder: String = ""
	var captain: String = ""
	var _color: String = "default"
	var _name: LineEdit
	var _pic_box: Control
	var _tiles: HBoxContainer
	var _why: Label
	var _foot: HBoxContainer
	var _asking: bool = false

	func _ready() -> void:
		Cards.backdrop(self)
		var v: VBoxContainer = Cards.card(self, 660)
		Kit.text(v, "Joining %s" % charter_name if charter_name != "" else "Joining a Charter", "eyebrow", Color(Paper.CHOSEN, 0.85))
		Kit.text(v, "Your Charter captain", "display_sm", Paper.NIGHT_INK)
		var whose: String = "%s's Charter" % founder if founder != "" else "This Charter"
		Kit.text(v, "%s keeps its own captains. Name yours and choose their colours before you come aboard." % whose, "note", Paper.NIGHT_INK_SOFT, true)
		Paper.rule(v, true)
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 18)
		v.add_child(row)
		_pic_box = Control.new()
		_pic_box.custom_minimum_size = Vector2(190, 148)
		_pic_box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(_pic_box)
		var col: VBoxContainer = VBoxContainer.new()
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		col.add_theme_constant_override("separation", 8)
		row.add_child(col)
		Kit.text(col, "Their name", "label", Paper.NIGHT_INK_SOFT)
		_name = Paper.night_field(24)
		_name.text = captain
		_name.placeholder_text = "Your captain's name"
		_name.custom_minimum_size = Vector2(0, 40)
		_name.text_submitted.connect(func(_t: String) -> void: _go())
		col.add_child(_name)
		Kit.text(col, "Their colours", "label", Paper.NIGHT_INK_SOFT)
		_tiles = HBoxContainer.new()
		_tiles.add_theme_constant_override("separation", 6)
		col.add_child(_tiles)
		Kit.text(col, "More colours are earned as you play.", "note", Paper.NIGHT_INK_SOFT)
		# Why it did not go (a blank name), in a line kept for it.
		_why = Kit.text(v, "", "body_strong", Paper.NIGHT_RED)
		_why.custom_minimum_size = Vector2(0, 20)
		_foot = HBoxContainer.new()
		_foot.alignment = BoxContainer.ALIGNMENT_END
		_foot.add_theme_constant_override("separation", 10)
		v.add_child(_foot)
		_paint_look()
		_foot_buttons()
		_name.grab_focus.call_deferred()

	## The name and colour as they stand (main.gd sends them if the crew sail
	## while this is still open).
	func current() -> Array:
		var n: String = _name.text.strip_edges() if _name != null else ""
		return [n if n != "" else captain, _color]

	func _paint_look() -> void:
		for c: Node in _pic_box.get_children():
			c.queue_free()
		var pic: Control = Cards.portrait({ "color": _color }, Vector2(190, 148))
		pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_pic_box.add_child(pic)
		for c2: Node in _tiles.get_children():
			_tiles.remove_child(c2)
			c2.queue_free()
		for id: String in Title.STARTING:
			var nm: String = id
			for cc: Dictionary in Rules.data()["characterColors"]:
				if cc["id"] == id:
					nm = cc["name"]
			var t: Paper.Tile = Paper.Tile.new()
			t.on = id == _color
			t.label = nm
			t.art = Skipper.look_art(id)
			t.pigment = Cards.SEA_DYE
			t.custom_minimum_size = Vector2(80, 86)
			var pick: String = id
			t.pressed.connect(func() -> void:
				if _color == pick:
					return
				_color = pick
				Sound.plip()
				_paint_look()
				# The pad keeps its place on the row.
				for tt: Node in _tiles.get_children():
					if (tt as Paper.Tile).label == nm:
						(tt as Control).grab_focus.call_deferred())
			_tiles.add_child(t)

	func _foot_buttons() -> void:
		for c: Node in _foot.get_children():
			_foot.remove_child(c)
			c.queue_free()
		var out: Pane.PaneButton = Paper.button("Leave the Charter?" if _asking else "Leave", false, true)
		out.tooltip_text = "Esc"
		out.pressed.connect(func() -> void: leave.emit())
		_foot.add_child(out)
		var go: Pane.PaneButton = Paper.primary("Come aboard", true)
		go.custom_minimum_size = Vector2(190, 46)
		go.pressed.connect(_go)
		_foot.add_child(go)
		if _asking:
			out.grab_focus.call_deferred()

	func _go() -> void:
		# A blank name is refused here, as in the join form.
		if _name.text.strip_edges() == "":
			_why.text = "Name your captain first."
			Motion.rise_word(_why)
			_name.grab_focus()
			return
		Sound.plip()
		chosen.emit(_name.text.strip_edges(), _color)

	func _unhandled_input(event: InputEvent) -> void:
		if not event.is_action_pressed("fish_back"):
			return
		get_viewport().set_input_as_handled()
		if _asking:
			leave.emit()
			return
		_asking = true
		Sound.plip()
		_foot_buttons()


# ── Sets sail ─────────────────────────────────────────────────────────────────

## THE CHARTER SETS SAIL: the harbour fades onto the water (from the night
## the harbour card faded into), and "<Charter> sets sail" rises in words on
## the water under this captain's boat, for every captain. Each hull rings
## the water as it casts off; a horn. Nothing is held: the sea is live under it.
static func sets_sail(sea: Sea, cname: String) -> void:
	if sea == null or sea.has_node("SetsSail"):
		return
	var layer: CanvasLayer = CanvasLayer.new()
	layer.name = "SetsSail"
	layer.layer = 84
	sea.add_child(layer)
	var host: Control = Control.new()
	host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.theme = UiTheme.make()
	layer.add_child(host)
	# The night the harbour card went into, lifting off the water.
	var veil: ColorRect = ColorRect.new()
	veil.color = Color(0.02, 0.035, 0.05, 1.0)
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(veil)
	var tw: Tween = veil.create_tween()
	tw.tween_property(veil, "color:a", 0.0, 0.9).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_callback(veil.queue_free)
	# The words on the water, just under the boat (as the hardcore ending's).
	var words: VBoxContainer = VBoxContainer.new()
	words.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	words.offset_left = -420
	words.offset_right = 420
	words.offset_top = 90
	words.offset_bottom = 190
	words.add_theme_constant_override("separation", 4)
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(words)
	var head: Label = Kit.lift(Kit.text(words, "%s sets sail" % (cname if cname != "" else "The Charter"), "display", Kit.SEA_INK))
	head.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var sub: Label = Kit.lift(Kit.text(words, "The crew is fixed. Fair winds, all of you.", "body_strong", Kit.SEA_INK))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Motion.rise_word(head, 0.5)
	Motion.rise_word(sub, 0.9)
	Sound.horn()
	# Each hull rings the water as it casts off (local, never a screen shake).
	var ring: Callable = func() -> void:
		if not is_instance_valid(sea) or sea._field == null:
			return
		var boats: Array = [sea._boat]
		for k: String in sea._mates:
			boats.append(sea._mates[k])
		for b: Variant in boats:
			if b is Node2D and is_instance_valid(b):
				for i: int in 2:
					sea._field.ring((b as Node2D).position + Vector2(randf_range(-30, 30), randf_range(4, 16)), 110.0, 1.4 + i * 0.5, 0.45)
	sea.get_tree().create_timer(0.6).timeout.connect(ring)
	sea.get_tree().create_timer(4.4).timeout.connect(func() -> void:
		if is_instance_valid(words):
			Motion.note_out(words)
		if is_instance_valid(layer):
			layer.get_tree().create_timer(0.6).timeout.connect(func() -> void:
				if is_instance_valid(layer):
					layer.queue_free()))
