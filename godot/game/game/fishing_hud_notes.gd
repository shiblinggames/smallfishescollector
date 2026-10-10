extends RefCounted
## Part of FishingHud: THE NOTES. The toasts in the lane under the top stack
## (or over the dial while it is up), and the corner notes at the top right
## (achievements earned, colours unlocked, a hunt's next step, anything sent
## through notify()). Split out of game/fishing_hud.gd on 2026-10-10 for size;
## the HUD forwards toast(), notify(), notes_bottom() and _toast.

## The HUD these notes are said on.
var h: FishingHud
## The newest toast (its words are what was last said).
var _toast: Label
## Where the toasts stack: under the lane, or over the dial while it is up.
var _toasts: VBoxContainer
## Toasts held back while a side banner has the sky.
var _toast_wait: Array = []
var _now: float = 0.0


func _init(hud: FishingHud) -> void:
	h = hud


## THE TOASTS: notes stacked under the lane (placed each frame), each in,
## held and out on the NOTE moves; nothing overwrites another.
func build() -> void:
	_toasts = VBoxContainer.new()
	_toasts.add_theme_constant_override("separation", 2)
	_toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	FishingHud._place(_toasts, Vector2(0.5, 0.0), Vector2(-FishingHud.TOAST_W / 2.0, FishingHud.LANE_Y), Vector2(FishingHud.TOAST_W, 0))
	h.add_child(_toasts)
	_toast = Label.new()
	_toast.visible = false
	_toasts.add_child(_toast)


## [title, line, art] waiting to be shown, one at a time.
var _badge_q: Array = []
var _badge_t: float = 0.0


## What the rules just earned (Achievements.sweep queues it in the save),
## taken off the save and shown as notes. A great many at once (a save from
## before achievements) is one note.
func _drain_badges() -> void:
	var q: Array = Js.list(h.session.save.get("badges_new"))
	if q.is_empty():
		return
	h.session.save.erase("badges_new")
	# This machine's captain: the same achievements on Steam.
	SteamLayer.achieve(q)
	var pts: Dictionary = Rules.data()["badgePoints"]
	var defs: Dictionary = {}
	for d: Dictionary in Achievements.defs():
		defs[d["id"]] = d
	var badges: Array = q.filter(func(x: Variant) -> bool: return not str(x).begins_with("color:"))
	var cols: Array = q.filter(func(x: Variant) -> bool: return str(x).begins_with("color:"))
	if badges.size() > 3:
		var sum: float = 0.0
		for b: Variant in badges:
			sum += float(pts.get(b, 0.0))
		_badge_q.append(["ACHIEVEMENTS", "%d achievements" % badges.size(), "+%d points  ·  press the level bar to see them" % int(sum), null])
	else:
		for b: Variant in badges:
			var d: Dictionary = defs.get(b, {})
			_badge_q.append(["ACHIEVEMENT", str(d.get("name", b)), "+%d point%s  ·  %s" % [int(pts.get(b, 0.0)), "" if int(pts.get(b, 0.0)) == 1 else "s", d.get("description", "")], Skipper.tex(d.get("imageUrl"))])
	for c: Variant in cols:
		var cid: String = str(c).trim_prefix("color:")
		var nm: String = cid.capitalize()
		for cc: Dictionary in Rules.data()["characterColors"]:
			if cc["id"] == cid:
				nm = cc["name"]
		_badge_q.append(["UNLOCKED", "New colour: %s" % nm, "Earned with achievement points. Wear it from the Locker, Look.", Skipper.look_art(cid)])


var _badge_note: Control


## Recording a film (godot/trailer, FILM_QUIET): no corner notes at all.
static var _film_quiet: bool = OS.get_environment("FILM_QUIET") != ""


## A note in the same slip as an achievement's: eyebrow, title, line, picture.
func notify(eyebrow: String, title: String, line: String, art: Texture2D = null) -> void:
	_badge_q.append([eyebrow, title, line, art])


func _badge_step(delta: float) -> void:
	# Recording a film (godot/trailer, FILM_QUIET): no notices at the corner.
	if _film_quiet:
		_badge_q.clear()
		return
	_badge_t -= delta
	if _badge_t > 0.0 or _badge_q.is_empty():
		return
	var n: Array = _badge_q.pop_front()
	_badge_t = 3.2
	if _badge_note != null and is_instance_valid(_badge_note):
		Motion.leave(_badge_note)
	var note: Pane = Kit.pane(h, { "radius": 12, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.35)], "shadow": [Color(0, 0, 0, 0.35), 14, Vector2(0, 4)], "pad": [12, 8, 16, 8], "paper": true })
	note.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Unseen until it is measured and placed.
	note.modulate.a = 0.0
	_badge_note = note
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	note.add_child(row)
	if n[3] != null:
		var pic: TextureRect = TextureRect.new()
		pic.texture = n[3]
		pic.custom_minimum_size = Vector2(48, 48)
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(pic)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(col)
	Kit.text(col, n[0], "eyebrow", Paper.EYEBROW)
	Kit.text(col, n[1], "name", Kit.PAPER_INK).add_theme_font_size_override("font_size", 16)
	var line: Label = Kit.text(col, n[2], "note", Kit.PAPER_INK_SOFT)
	line.custom_minimum_size = Vector2(300, 0)
	line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	Sound.chest(false)
	await h.get_tree().process_frame
	if not is_instance_valid(note):
		return
	# Under the top-right column as it measures now (the water's name, its
	# blurb, a stir line that may wrap, the clock row, the back pill).
	note.position = Vector2(h.size.x - note.size.x - 24.0, _tr_bottom() + 12.0)
	var tw: Tween = note.create_tween()
	note.set_meta("_motion", tw)
	Motion.ease_fade(tw, note, "modulate:a", 1.0, 0.25)
	tw.parallel().tween_property(note, "position:x", note.position.x, 0.3).from(note.position.x + 40.0).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_interval(Motion.NOTE_HOLD)
	Motion.ease_fade(tw, note, "modulate:a", 0.0, Motion.NOTE_OUT)
	tw.tween_callback(note.queue_free)


## The bottom of the top-right column, in this HUD's coordinates.
func _tr_bottom() -> float:
	if h._tr == null:
		return 150.0
	return h._tr.position.y + h._tr.get_combined_minimum_size().y


## Where the top-right lane is free from (the derby sits here): under the
## column, and under a corner note while one is up.
func notes_bottom() -> float:
	var y: float = _tr_bottom() + 12.0
	if _badge_note != null and is_instance_valid(_badge_note) and _badge_note.modulate.a > 0.01:
		y = maxf(y, _badge_note.position.y + _badge_note.size.y + 12.0)
	return y


## THE TOASTS (spec 1.6 and 1.2): each a note on the water in the toast lane,
## in on NOTE_IN, held NOTE_HOLD, out on NOTE_OUT; a newer one stacks under
## the last instead of overwriting it, a repeat only holds the one showing a
## little longer, and while a side banner has the sky they wait for it.
## tone: "" plain words, "good" good news (the gold), "name" a place or a
## headline word (Cinzel), "danger" a warning, "dim" quiet.
func toast(text: String, tone: String = "") -> void:
	if text == "":
		return
	if _toasts == null:
		return
	if is_instance_valid(h._side_banner) and not h._side_banner.is_queued_for_deletion():
		# A place's name is the banner's to say; anything else waits for it.
		if tone != "name":
			_toast_wait.append([text, tone])
		return
	var live: Array = []
	for n: Node in _toasts.get_children():
		if n is Label and n != _toast_stub() and n.visible and not n.has_meta("gone"):
			live.append(n)
			if (n as Label).text == text:
				n.set_meta("until", _now + Motion.NOTE_HOLD)
				_toast = n
				return
	var l: Label
	match tone:
		"name":
			l = Kit.text(_toasts, text, "heading", Kit.SEA_INK)
		"good":
			l = Kit.text(_toasts, text, "body_strong", Kit.SEA_GOLD)
		"danger":
			l = Kit.text(_toasts, text, "body_strong", Kit.DANGER_INK)
		"dim":
			l = Kit.text(_toasts, text, "body_strong", Kit.DIM)
		_:
			l = Kit.text(_toasts, text, "body_strong", Kit.SEA_INK)
	Kit.lift(l)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.set_meta("until", _now + Motion.NOTE_IN + Motion.NOTE_HOLD)
	Motion.note_in(l)
	_toast = l
	# Too many at once: the oldest leaves early.
	if live.size() >= FishingHud.TOAST_MAX:
		_toast_out(live[0] as Label)


## The first child of the lane: an empty, hidden label that stands for "no
## toast yet" (so _toast is never null).
func _toast_stub() -> Node:
	return _toasts.get_child(0) if _toasts != null and _toasts.get_child_count() > 0 else null


func _toast_out(l: Label) -> void:
	if l.has_meta("gone"):
		return
	l.set_meta("gone", true)
	Motion.note_out(l)


## Each frame: toasts whose time is up leave; held ones go once the banner
## has gone; the lane sits under the top stack, or over the dial while it
## is up (over the dim, above the fight's readouts).
func _toast_step(delta: float) -> void:
	_now += delta
	if not _toast_wait.is_empty() and not is_instance_valid(h._side_banner):
		var held: Array = _toast_wait.duplicate()
		_toast_wait.clear()
		for w: Array in held:
			toast(w[0], w[1])
	for n: Node in _toasts.get_children():
		if n is Label and n != _toast_stub() and not n.has_meta("gone") and _now >= float(n.get_meta("until", 0.0)):
			_toast_out(n as Label)
	if h._dial != null and h._dial.visible:
		var bottom: float = h._dial.position.y - (80.0 if h._status.text != "" else 10.0)
		_toasts.grow_vertical = Control.GROW_DIRECTION_BEGIN
		_toasts.offset_top = bottom
		_toasts.offset_bottom = bottom
	else:
		var y: float = h._lane.position.y + h._lane.get_combined_minimum_size().y + (6.0 if h._lane.get_combined_minimum_size().y > 0.0 else 0.0)
		_toasts.grow_vertical = Control.GROW_DIRECTION_END
		_toasts.offset_top = y
		_toasts.offset_bottom = y
