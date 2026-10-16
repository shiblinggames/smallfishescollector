extends RefCounted
## CONNECTING AND COMING BACK (Kong, 2026-10-11; docs/systems/steam-port.md):
## the cards a Charter's crew see when the line opens, closes or goes down.
##
##   Hailing   joining or rejoining: on the harbour art, a night-paper card,
##             "Hailing <address>" (or the Charter and its founder when they
##             are known), a lantern swinging and calling out in rings, and
##             Cancel (Esc). It was a bare grey screen for 30 seconds.
##   Parted    the founder closed the Charter, their game was lost, or it
##             changed hands: who, that your captain is safe aboard it, and
##             Rejoin or Back to port. It was one line on the title.
##   Ending    a hardcore Charter sunk: its name, the days it sailed, the life
##             log and each captain's best, with Back to port.
##   sink_on_sea  the ending on the water first: "<Charter> is lost" in words
##             on the water, every boat settling with a small local wake, then
##             the Ending card over it.
##
## No class_name (main.gd preloads this file): the classes are inner ones.
## Crew menus are on the night paper; flat, no wood, brass or coloured rims.

const SEA_DYE: Color = Color(0.36, 0.6, 0.58)
## This file, for its inner classes to reach the helpers above them.
const CharterCards_ = preload("res://game/charter_cards.gd")


## The harbour as the title shows it, under a night root (the buttons, rules
## and panes inside take the night paper).
static func backdrop(host: Control) -> void:
	host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	host.theme = UiTheme.make()
	host.set_meta("night_root", true)
	var bg: TextureRect = TextureRect.new()
	bg.texture = Skipper.tex("welcome-harbour-open.webp")
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(bg)
	# The title's veil, a little deeper: the card is the thing to read.
	Kit.wash(host, [[Color(0.02, 0.04, 0.06, 0.35), 0.0], [Color(0.02, 0.04, 0.06, 0.55), 0.5], [Color(0.02, 0.035, 0.05, 0.8), 1.0]])


## A night-paper card centred on the host; returns its column.
static func card(host: Control, width: float) -> VBoxContainer:
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	host.add_child(center)
	var p: Pane = Kit.pane(center, { "radius": 16, "fill": [Paper.NIGHT_PAPER], "border": [1, Color(Paper.NIGHT_INK_FAINT, 0.5)], "shadow": [Color(0, 0, 0, 0.5), 26, Vector2(0, 10)], "pad": [28, 24, 28, 24], "paper": true, "night": true })
	p.custom_minimum_size = Vector2(width, 0)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	p.add_child(v)
	Motion.panel_in(p)
	return v


static func _t(parent: Node, t: String, role: String, col: Color, wrap: bool = false) -> Label:
	return Kit.text(parent, t, role, col, wrap)


## The captain as they look on their boat, on a soft wash (the title's
## portrait, drawn at three times the size and shown shrunk).
static func portrait(look: Dictionary, box_px: Vector2) -> Control:
	var holder: Control = Control.new()
	holder.custom_minimum_size = box_px
	holder.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	holder.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var wash: Panel = Panel.new()
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(SEA_DYE, 0.16)
	sb.set_corner_radius_all(10)
	wash.add_theme_stylebox_override("panel", sb)
	wash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	wash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(wash)
	const SS: float = 3.0
	var vp: SubViewport = SubViewport.new()
	vp.transparent_bg = true
	vp.size = Vector2i(box_px * SS)
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR
	holder.add_child(vp)
	var sk: Skipper = Skipper.new()
	sk.water = false
	sk.box_scale = box_px.y / 140.0 * SS
	sk.position = Vector2(box_px.x * 0.6, box_px.y * 0.5) * SS
	sk.scale.x = -1.0
	vp.add_child(sk)
	sk.set_look(look if not look.is_empty() else { "color": "default" })
	var pic: TextureRect = TextureRect.new()
	pic.texture = vp.get_texture()
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_SCALE
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(pic)
	return holder


# ── Hailing ───────────────────────────────────────────────────────────────────

## THE CONNECTING CARD: who is being hailed, the lantern, Cancel (Esc).
class Hailing:
	extends Control

	signal cancelled

	var address: String = ""
	## Known when rejoining a remembered Charter ("" for a first join).
	var charter_name: String = ""
	var founder: String = ""
	var captain: String = ""
	var _status: Label
	var _t: float = 0.0

	func _ready() -> void:
		CharterCards_.backdrop(self)
		var v: VBoxContainer = CharterCards_.card(self, 520)
		var known: bool = charter_name != ""
		CharterCards_._t(v, "Rejoining a Charter" if known else "Joining a Charter", "eyebrow", Color(Paper.CHOSEN, 0.85))
		var head: Label = CharterCards_._t(v, "Hailing %s" % (charter_name if known else address), "display_sm", Paper.NIGHT_INK, true)
		head.custom_minimum_size = Vector2(460, 0)
		if known:
			var who: String = "%s's Charter" % founder if founder != "" else "The founder's Charter"
			CharterCards_._t(v, "%s  ·  %s" % [who, address] if address != "" else who, "small", Paper.NIGHT_INK_SOFT, true)
			if captain != "":
				CharterCards_._t(v, "Your captain %s waits aboard it." % captain, "note", Paper.NIGHT_INK_SOFT, true)
		Paper.rule(v, true)
		var mark: Lantern = Lantern.new()
		mark.custom_minimum_size = Vector2(0, 150)
		v.add_child(mark)
		_status = CharterCards_._t(v, "Calling across the water", "body", Paper.NIGHT_INK_SOFT)
		_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var foot: HBoxContainer = HBoxContainer.new()
		foot.alignment = BoxContainer.ALIGNMENT_END
		v.add_child(foot)
		var c: Pane.PaneButton = Paper.button("Cancel  Esc", false, true)
		c.pressed.connect(func() -> void: cancelled.emit())
		foot.add_child(c)
		c.grab_focus.call_deferred()

	func _process(delta: float) -> void:
		_t += delta
		if _status != null:
			# The dots fill as the seconds go: plain, never a spinner.
			_status.text = "Calling across the water" + ".".repeat(int(_t * 1.5) % 4)

	func _unhandled_input(event: InputEvent) -> void:
		if event.is_action_pressed("fish_back"):
			get_viewport().set_input_as_handled()
			cancelled.emit()


## A lantern on its hook, swinging, its light going out across the water in
## rings (the hail), drawn in code.
class Lantern:
	extends Control

	var _t: float = 0.0

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		var ink: Color = Paper.NIGHT_INK
		var warm: Color = Paper.NIGHT_GOLD
		var hook: Vector2 = Vector2(size.x / 2.0, 14.0)
		# The bracket it hangs from.
		draw_line(hook + Vector2(-26, 0), hook + Vector2(10, 0), Color(ink, 0.55), 2.0, true)
		draw_line(hook + Vector2(-26, 0), hook + Vector2(-26, -8), Color(ink, 0.55), 2.0, true)
		var swing: float = sin(_t * 1.7) * 0.32
		var dir: Vector2 = Vector2(sin(swing), cos(swing))
		var body: Vector2 = hook + dir * 46.0
		draw_line(hook, hook + dir * 30.0, Color(ink, 0.6), 1.5, true)
		# The rings: the call going out, one every 1.1s, fading as they grow.
		for i: int in 3:
			var k: float = fmod(_t / 1.1 + i / 3.0, 1.0)
			draw_arc(body + Vector2(0, 6), 18.0 + k * 70.0, 0.0, TAU, 48, Color(warm, (1.0 - k) * 0.45), 1.5, true)
		# The glow, breathing a little.
		var breathe: float = 0.85 + sin(_t * 3.1) * 0.15
		draw_circle(body + Vector2(0, 6), 26.0, Color(warm, 0.10 * breathe))
		draw_circle(body + Vector2(0, 6), 15.0, Color(warm, 0.22 * breathe))
		# The lantern: a cap, a glass, a base, turned with the swing.
		var x: Vector2 = Vector2(dir.y, -dir.x)
		var y: Vector2 = dir
		var cap: PackedVector2Array = PackedVector2Array([body + x * -7 + y * -16, body + x * 7 + y * -16, body + x * 10 + y * -10, body + x * -10 + y * -10])
		draw_colored_polygon(cap, Color(ink, 0.85))
		var glass: PackedVector2Array = PackedVector2Array([body + x * -9 + y * -10, body + x * 9 + y * -10, body + x * 8 + y * 18, body + x * -8 + y * 18])
		draw_colored_polygon(glass, Color(warm, 0.75 * breathe))
		draw_polyline(PackedVector2Array([glass[0], glass[1], glass[2], glass[3], glass[0]]), Color(ink, 0.8), 1.5, true)
		draw_line(body + y * -10, body + y * 18, Color(ink, 0.45), 1.0, true)
		var base: PackedVector2Array = PackedVector2Array([body + x * -10 + y * 18, body + x * 10 + y * 18, body + x * 7 + y * 23, body + x * -7 + y * 23])
		draw_colored_polygon(base, Color(ink, 0.85))
		draw_arc(body + y * -18, 4.0, 0.0, TAU, 12, Color(ink, 0.7), 1.5, true)


# ── The founder left ──────────────────────────────────────────────────────────

## THE FOUNDER LEFT CARD. info: CrewNet.end_info (kind "closed", "lost" or
## "handed"; charter, founder, to).
class Parted:
	extends Control

	signal rejoin
	signal back

	var info: Dictionary = {}
	## No address to hail (a Steam join): Rejoin is not offered.
	var can_rejoin: bool = true

	func _ready() -> void:
		CharterCards_.backdrop(self)
		var v: VBoxContainer = CharterCards_.card(self, 560)
		var kind: String = str(info.get("kind", "lost"))
		var cname: String = str(info.get("charter", "the Charter"))
		var who: String = str(info.get("founder", "the founder"))
		var eyebrow: String = "The Charter is closed"
		var head: String = "%s closed %s" % [who, cname]
		var again: String = "Rejoin when %s hosts it again." % who
		match kind:
			"lost":
				eyebrow = "The line went quiet"
				head = "Lost touch with %s's game" % who
				again = "%s's game may have closed or lost its connection. Rejoin when they host %s again." % [who, cname]
			"handed":
				eyebrow = "The Charter changed hands"
				head = "%s handed %s to %s" % [who, cname, str(info.get("to", "a crewmate"))]
				again = "%s hosts it from now on. Rejoin when they do." % str(info.get("to", "The new founder"))
		CharterCards_._t(v, eyebrow, "eyebrow", Color(Paper.CHOSEN, 0.85))
		var h: Label = CharterCards_._t(v, head, "display_sm", Paper.NIGHT_INK, true)
		h.custom_minimum_size = Vector2(500, 0)
		Paper.rule(v, true)
		CharterCards_._t(v, "Your captain is safe aboard it.", "body_strong", Paper.NIGHT_INK)
		CharterCards_._t(v, again, "body", Paper.NIGHT_INK_SOFT, true)
		if not can_rejoin:
			CharterCards_._t(v, "Join from their name in your Steam friends list when they host.", "note", Paper.NIGHT_INK_FAINT, true)
		var gap: Control = Control.new()
		gap.custom_minimum_size = Vector2(0, 6)
		v.add_child(gap)
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		v.add_child(row)
		var b: Pane.PaneButton = Paper.button("Back to port  Esc", false, true)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void: back.emit())
		var sp: Control = Control.new()
		sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(b)
		row.add_child(sp)
		if can_rejoin:
			var r: Pane.PaneButton = Paper.primary("Rejoin", true)
			r.custom_minimum_size = Vector2(160, 46)
			r.pressed.connect(func() -> void: rejoin.emit())
			row.add_child(r)
			r.grab_focus.call_deferred()
		else:
			b.grab_focus.call_deferred()

	func _unhandled_input(event: InputEvent) -> void:
		if event.is_action_pressed("fish_back"):
			get_viewport().set_input_as_handled()
			back.emit()


# ── The hardcore ending ───────────────────────────────────────────────────────

## THE END CARD: the Charter's name, days sailed, the life log, each
## captain's best (Charter.ending), Back to port. Over the sinking water
## (sink_on_sea), or on the harbour art when no sea is up (standalone).
class Ending:
	extends Control

	signal back

	var summary: Dictionary = {}
	var standalone: bool = false

	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_STOP
		if standalone:
			CharterCards_.backdrop(self)
		else:
			theme = UiTheme.make()
			set_meta("night_root", true)
			Kit.scrim(self, Kit.SCRIM_SHEET)
		var crew: Array = Js.list(summary.get("crew"))
		var v: VBoxContainer = CharterCards_.card(self, 820)
		CharterCards_._t(v, "A hardcore Charter, lost", "eyebrow", Color(Paper.NIGHT_RED, 0.9))
		CharterCards_._t(v, str(summary.get("name", "The Charter")), "display", Paper.NIGHT_INK)
		var days: int = int(Js.num(summary.get("days")))
		var log: Array = Js.list(summary.get("log"))
		CharterCards_._t(v, "Sailed %d %s  ·  %d %s spent  ·  %d %s" % [days, "day" if days == 1 else "days", log.size(), "life" if log.size() == 1 else "lives", crew.size(), "captain" if crew.size() == 1 else "captains"], "small", Paper.NIGHT_INK_SOFT)
		Paper.rule(v, true)
		CharterCards_._t(v, "The life log", "label", Paper.NIGHT_INK_FAINT)
		if log.is_empty():
			CharterCards_._t(v, "No lives were written down.", "note", Paper.NIGHT_INK_SOFT)
		for i: int in log.size():
			var e: Dictionary = log[i]
			var row: HBoxContainer = HBoxContainer.new()
			row.add_theme_constant_override("separation", 12)
			v.add_child(row)
			var nm: Label = CharterCards_._t(row, str(e.get("by", "A captain")), "name", Paper.NIGHT_INK)
			nm.custom_minimum_size = Vector2(150, 0)
			var wh: Label = CharterCards_._t(row, str(e.get("what", "Sunk")), "body", Paper.NIGHT_INK_SOFT)
			wh.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var left: int = int(Js.num(e.get("left")))
			CharterCards_._t(row, "the last life" if left <= 0 else "%d %s left" % [left, "life" if left == 1 else "lives"], "small", Paper.NIGHT_RED if left <= 0 else Paper.NIGHT_INK_FAINT)
			Motion.stagger(row, i)
		Paper.rule(v, true)
		CharterCards_._t(v, "Each captain's best", "label", Paper.NIGHT_INK_FAINT)
		for i: int in crew.size():
			var c: Dictionary = crew[i]
			var row: HBoxContainer = HBoxContainer.new()
			row.add_theme_constant_override("separation", 14)
			v.add_child(row)
			row.add_child(CharterCards_.portrait(Js.obj(c.get("look")), Vector2(76, 58)))
			var nm: VBoxContainer = VBoxContainer.new()
			nm.custom_minimum_size = Vector2(140, 0)
			nm.alignment = BoxContainer.ALIGNMENT_CENTER
			nm.add_theme_constant_override("separation", 0)
			row.add_child(nm)
			CharterCards_._t(nm, str(c.get("name", "?")), "name", Paper.NIGHT_INK)
			CharterCards_._t(nm, "Fishing Lv %d" % int(Js.num(c.get("level"))), "small", Paper.NIGHT_INK_SOFT)
			var big: String = "None in the book"
			if str(c.get("big", "")) != "":
				big = "%s, %s" % [c["big"], FishingHud.length_text(Js.num(c.get("big_len")))]
			var deep: int = int(Js.num(c.get("deepest")))
			var raids: int = int(Js.num(c.get("raids")))
			_cell(row, "Biggest catch", big, 220.0)
			_cell(row, "Deepest dive", "Depth %d" % deep if deep > 0 else "No dives", 110.0)
			_cell(row, "Raids cleared", str(raids), 100.0)
			Motion.stagger(row, log.size() + i)
		var gap: Control = Control.new()
		gap.custom_minimum_size = Vector2(0, 4)
		v.add_child(gap)
		var foot: HBoxContainer = HBoxContainer.new()
		foot.alignment = BoxContainer.ALIGNMENT_END
		v.add_child(foot)
		CharterCards_._t(foot, "The Charter's file is kept, sunk, on the founder's game.", "note", Paper.NIGHT_INK_FAINT).size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var b: Pane.PaneButton = Paper.primary("Back to port", true)
		b.custom_minimum_size = Vector2(190, 46)
		b.pressed.connect(func() -> void: back.emit())
		foot.add_child(b)
		b.grab_focus.call_deferred()

	func _cell(row: HBoxContainer, label: String, value: String, w: float) -> void:
		var c: VBoxContainer = VBoxContainer.new()
		c.custom_minimum_size = Vector2(w, 0)
		c.alignment = BoxContainer.ALIGNMENT_CENTER
		c.add_theme_constant_override("separation", 0)
		row.add_child(c)
		CharterCards_._t(c, label, "label", Paper.NIGHT_INK_FAINT)
		CharterCards_._t(c, value, "value", Paper.NIGHT_INK, true)

	func _unhandled_input(event: InputEvent) -> void:
		if event.is_action_pressed("fish_back"):
			get_viewport().set_input_as_handled()
			back.emit()


## Over the sea while the Charter goes down: holds the sea (no sailing, no
## Esc menu) until the card is up.
class Hush:
	extends Control

	func _unhandled_input(event: InputEvent) -> void:
		if event.is_action_pressed("fish_back"):
			get_viewport().set_input_as_handled()


## THE ENDING ON THE WATER: the words "<Charter> is lost" (the name bare, it
## often starts with "The"), every boat on this sea settling low with a small
## local wake of bubbles and rings, then the Ending card over it. on_back:
## Back to port.
static func sink_on_sea(sea: Sea, summary: Dictionary, on_back: Callable) -> void:
	if sea.has_node("CharterEnding"):
		return
	var layer: CanvasLayer = CanvasLayer.new()
	layer.name = "CharterEnding"
	layer.layer = 85
	sea.add_child(layer)
	var hush: Hush = Hush.new()
	hush.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hush.mouse_filter = Control.MOUSE_FILTER_STOP
	hush.theme = UiTheme.make()
	layer.add_child(hush)
	sea._hud.hold_for(hush)
	sea._boat.velocity = Vector2.ZERO
	sea._boat.target = null
	# The words on the water, just under her boat (the sky lane holds the
	# names of places, and the words printed over a port's).
	var words: VBoxContainer = VBoxContainer.new()
	words.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	words.offset_left = -400
	words.offset_right = 400
	words.offset_top = 90
	words.offset_bottom = 190
	words.add_theme_constant_override("separation", 4)
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hush.add_child(words)
	var head: Label = Kit.lift(Kit.text(words, "%s is lost" % str(summary.get("name", "The Charter")), "display", Kit.SEA_INK))
	head.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var log: Array = Js.list(summary.get("log"))
	var last: String = str(Js.obj(log.back()).get("by", "")) if not log.is_empty() else ""
	var sub: Label = Kit.lift(Kit.text(words, "The last life went down with %s." % last if last != "" else "Its last life is spent.", "body_strong", Kit.SEA_INK))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Motion.rise_word(head)
	Motion.rise_word(sub, 0.4)
	# Every boat settles: this captain's and each crewmate's.
	_settle(sea, sea._boat, sea._boat.get("_ship_rig"))
	for k: String in sea._mates:
		var m: Shipmate = sea._mates[k]
		if is_instance_valid(m):
			_settle(sea, m, m._hull)
	Sound.plip()
	await sea.get_tree().create_timer(4.2).timeout
	if not is_instance_valid(hush):
		return
	Motion.note_out(words)
	var e: Ending = Ending.new()
	e.summary = summary
	e.back.connect(func() -> void: on_back.call())
	hush.add_child(e)


## One boat going down: its hull rig sinks low (or the boat dims and drops a
## little), a few rings on the water round it, and a short wake of bubbles.
static func _settle(sea: Sea, boat: Node2D, rig: Variant) -> void:
	if not is_instance_valid(boat):
		return
	var at: Vector2 = boat.position
	for i: int in 3:
		sea._field.ring(at + Vector2(randf_range(-60, 60), randf_range(0, 20)), 130.0, 1.6 + i * 0.4, 0.5)
	if rig is HullRig and is_instance_valid(rig):
		(rig as HullRig).create_tween().tween_property(rig, "sink", 0.62, 3.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	else:
		var tw: Tween = boat.create_tween().set_parallel(true)
		tw.tween_property(boat, "modulate", Color(0.62, 0.68, 0.74, 0.7), 3.0).set_trans(Tween.TRANS_SINE)
	var p: CPUParticles2D = CPUParticles2D.new()
	p.position = at + Vector2(0, 10)
	p.z_index = boat.z_index + 1
	p.amount = 26
	p.lifetime = 1.6
	p.explosiveness = 0.0
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 34.0
	p.direction = Vector2(0, -1)
	p.spread = 30.0
	p.gravity = Vector2(0, -24)
	p.initial_velocity_min = 8.0
	p.initial_velocity_max = 26.0
	p.scale_amount_min = 2.0
	p.scale_amount_max = 4.5
	var g: Gradient = Gradient.new()
	g.set_color(0, Color(0.92, 0.96, 1.0, 0.75))
	g.set_color(1, Color(0.92, 0.96, 1.0, 0.0))
	p.color_ramp = g
	sea._world.add_child(p)
	p.emitting = true
	var tw2: Tween = p.create_tween()
	tw2.tween_interval(3.4)
	tw2.tween_callback(func() -> void: p.emitting = false)
	tw2.tween_interval(2.0)
	tw2.tween_callback(p.queue_free)
