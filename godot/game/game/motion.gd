class_name Motion
extends RefCounted
## THE GAME'S MOTION (Godot port, the visual and motion pass, 2026-10-09).
## One value for every kind of move, so the same job always moves the same
## way. docs: the visual spec, section 1.2.
##
## WHAT TO USE FOR WHAT
##   Motion.panel_in(c, rise, pace)
##                             a sheet, room, card or modal arriving: fade (SINE)
##                             while it rises 16px and scales 0.97 to 1 (CUBIC
##                             out). No BACK on panels.
##   Motion.panel_out(c, done) the same panel leaving: 0.14 fade, drops 8px.
##   Motion.dismiss(host, panel, scrim)
##                             THE close for a menu: blocks input at once, fades
##                             the panel and the scrim out, then frees the host.
##                             Emit `closed` BEFORE calling it.
##   Motion.scrim_in(r) / scrim_out(r, free)
##                             the dim behind a panel; never in one frame
##                             (Kit.scrim fades in by itself).
##   Motion.arrive(c, size, delay)
##                             a thing popping in. size "s" (pill, note, chip,
##                             dealt card), "m" (dial, entry card, art on a
##                             card), "l" (hero reveal: rare, skin, crate).
##   Motion.leave(c, free)     a thing leaving: 0.2 fade and a slight shrink
##                             (CUBIC in); frees it after unless free = false.
##   Motion.rise_word(c, delay)
##                             words and lettering in: fade 0.2, rise 6px. Never
##                             arrive/Kit.pop on text.
##   Motion.note_in(c) / note_out(c, free)
##                             a toast or notification in, or out.
##   Motion.swap(c, rebuild)   crossfade a panel body that changes (tabs).
##   Motion.stagger(c, i)      tile i of a grid fading in a beat after i-1.
##   Motion.count(node, from, to, fn, bar)
##                             a count-up (CUBIC out) or a bar fill (QUART out).
##   Motion.press(c) / release(c)
##                             the press squeeze (Kit.tap uses these).
##   Motion.hover_k(delta)     the lerp factor for any hover approach:
##                             lerp(x, goal, Motion.hover_k(delta)).
##   Motion.near(a, on, delta) lettering on the water appearing or going:
##                             a = Motion.near(a, close_enough, delta).
##   Motion.pulse(t, rate)     0..1 breathing: rate PULSE_CALL for a thing
##                             calling you, PULSE_BREATH for idle breath.
##   Motion.ease_fade / ease_rise / ease_exit / ease_pop (tw, obj, prop, to, dur)
##                             add one tweener to a tween with the law's
##                             easing: fades SINE, rises CUBIC out, exits CUBIC
##                             in, pops BACK out (small arrivals only).
##
## THE LAW: every ease has a trans; BACK only with EASE_OUT and only on small
## arrivals, reward pops and the press release (never alpha, panels, text);
## whatever eases in eases out (no queue_free on a visible thing without
## leave / panel_out / dismiss); whatever fades in starts at alpha 0; a pivot
## is set after layout (the helpers wait one frame for it). A move that lives
## in a Container does not slide (the container owns its position): it fades
## and scales only.

# ── Durations (seconds) ───────────────────────────────────────────────────────

const PRESS: float = 0.06
const RELEASE: float = 0.12
const PRESS_SCALE: float = 0.96
## Exponential approach rate for hover and interaction (settles in ~0.08s;
## it was 12, ~0.15s, and read as the button lagging the pointer, Kong
## 2026-10-09). World blends keep their own slow rates (k <= 1.2).
const HOVER_RATE: float = 26.0

## SNAPPIER (Kong, 2026-10-09: "opening menus ... a slight delay"): a menu is
## readable within a tenth of a second and settled by a fifth (was 0.18 and
## 0.34).
const PANEL_FADE: float = 0.1
const PANEL_IN: float = 0.22
const PANEL_RISE: float = 16.0
const PANEL_SCALE: float = 0.97
const PANEL_OUT: float = 0.14
const PANEL_DROP: float = 8.0

const SCRIM_IN: float = 0.12
const SCRIM_OUT: float = 0.14

## Arrivals: [fade, starting scale, scale time].
const ARRIVE_S: Array = [0.1, 0.9, 0.2]
const ARRIVE_M: Array = [0.12, 0.92, 0.26]
const ARRIVE_L: Array = [0.3, 0.6, 0.5]

const LEAVE: float = 0.2
const LEAVE_SCALE: float = 0.96

const WORD_IN: float = 0.2
const WORD_RISE: float = 6.0
const WORD_TIME: float = 0.28

const NOTE_IN: float = 0.15
const NOTE_RISE: float = 8.0
const NOTE_HOLD: float = 2.4
const NOTE_OUT: float = 0.4

const SWAP_OUT: float = 0.08
const SWAP_RESIZE: float = 0.16
const SWAP_IN: float = 0.12

## Lettering on the water: alpha moves at this rate per second (0.25s).
const NEAR_RATE: float = 4.0
const COUNT: float = 0.7
const VEIL: float = 0.48
const BARS_OUT: float = 0.5
## Pulses, in radians a second.
const PULSE_CALL: float = 2.4
const PULSE_BREATH: float = 2.0
## One clock for the cast landing (sound, ring, pose).
const CAST_LAND_S: float = 0.55
## The golden catch's note holds this long before the choice.
const GOLDEN_HOLD: float = 1.2
const STAGGER_STEP: float = 0.03
const STAGGER_MAX: float = 0.3


# ── Easing helpers ────────────────────────────────────────────────────────────

static func ease_fade(tw: Tween, obj: Object, prop: String, to: Variant, dur: float) -> PropertyTweener:
	return tw.tween_property(obj, prop, to, dur).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


static func ease_rise(tw: Tween, obj: Object, prop: String, to: Variant, dur: float) -> PropertyTweener:
	return tw.tween_property(obj, prop, to, dur).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


static func ease_exit(tw: Tween, obj: Object, prop: String, to: Variant, dur: float) -> PropertyTweener:
	return tw.tween_property(obj, prop, to, dur).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)


static func ease_pop(tw: Tween, obj: Object, prop: String, to: Variant, dur: float) -> PropertyTweener:
	return tw.tween_property(obj, prop, to, dur).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## The lerp factor for a hover approach this frame.
static func hover_k(delta: float) -> float:
	return 1.0 - exp(-delta * HOVER_RATE)


## Lettering on the water: its alpha toward shown (on) or gone.
static func near(a: float, on: bool, delta: float) -> float:
	return move_toward(a, 1.0 if on else 0.0, NEAR_RATE * delta)


## 0..1, breathing at `rate` radians a second.
static func pulse(t: float, rate: float = PULSE_CALL) -> float:
	return 0.5 + 0.5 * sin(t * rate)


# ── Internals ─────────────────────────────────────────────────────────────────

## One motion tween per node: a new move replaces the one running.
static func _own(n: Node, tw: Tween) -> Tween:
	if n.has_meta("_motion"):
		var old: Variant = n.get_meta("_motion")
		if old is Tween and (old as Tween).is_valid():
			(old as Tween).kill()
	n.set_meta("_motion", tw)
	return tw


## Wait until the control is in the tree and laid out (one frame), so its size
## and position are real. False if it went away meanwhile.
static func _laid_out(c: Node) -> bool:
	if not is_instance_valid(c):
		return false
	if not c.is_inside_tree():
		await c.tree_entered
	if not is_instance_valid(c) or not c.is_inside_tree():
		return false
	await c.get_tree().process_frame
	return is_instance_valid(c) and c.is_inside_tree() and not c.is_queued_for_deletion()


## Whether a move may slide it (a container owns its children's positions).
static func _slides(c: CanvasItem) -> bool:
	return c is Control and not (c.get_parent() is Container)


static func _centre(c: CanvasItem) -> void:
	if c is Control:
		(c as Control).pivot_offset = (c as Control).size / 2.0


# ── Panels ────────────────────────────────────────────────────────────────────

## A sheet, room, card or modal arriving. pace stretches its times (1.0 is
## the standard; the Dossier keeps Kong's slower 1.25).
static func panel_in(c: Control, rise: bool = true, pace: float = 1.0) -> void:
	c.modulate.a = 0.0
	if not await _laid_out(c):
		return
	_centre(c)
	c.scale = Vector2.ONE * PANEL_SCALE
	var tw: Tween = _own(c, c.create_tween().set_parallel(true))
	ease_fade(tw, c, "modulate:a", 1.0, PANEL_FADE * pace)
	ease_rise(tw, c, "scale", Vector2.ONE, PANEL_IN * pace)
	if rise and _slides(c):
		var goal: Vector2 = c.position
		c.position = goal + Vector2(0, PANEL_RISE)
		ease_rise(tw, c, "position", goal, PANEL_IN * pace)


## A panel leaving: fades and drops a little. `done` runs after.
static func panel_out(c: Control, done: Callable = Callable()) -> Tween:
	_centre(c)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tw: Tween = _own(c, c.create_tween().set_parallel(true))
	ease_exit(tw, c, "modulate:a", 0.0, PANEL_OUT)
	if _slides(c):
		ease_exit(tw, c, "position", c.position + Vector2(0, PANEL_DROP), PANEL_OUT)
	if done.is_valid():
		tw.chain().tween_callback(done)
	return tw


## THE close of a menu: input stops at once (a blocker eats clicks, focus is
## dropped, the host's input callbacks stop), the panel and scrim fade out,
## and then the host is freed. Safe to call twice. Emit `closed` first.
static func dismiss(host: Control, panel: Control = null, scrim: CanvasItem = null) -> void:
	if not is_instance_valid(host) or host.has_meta("_closing"):
		return
	host.set_meta("_closing", true)
	host.set_process_input(false)
	host.set_process_unhandled_input(false)
	host.set_process_unhandled_key_input(false)
	if not host.is_inside_tree():
		host.queue_free()
		return
	var f: Control = host.get_viewport().gui_get_focus_owner()
	if f != null and host.is_ancestor_of(f):
		f.release_focus()
	var block: Control = Control.new()
	block.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	block.mouse_filter = Control.MOUSE_FILTER_STOP
	host.add_child(block)
	if panel != null and is_instance_valid(panel):
		panel_out(panel)
	if scrim != null and is_instance_valid(scrim):
		scrim_out(scrim, false)
	var tw: Tween = host.create_tween()
	tw.tween_interval(maxf(PANEL_OUT, SCRIM_OUT) + 0.02)
	tw.tween_callback(host.queue_free)


## Whether a host is on its way out (Motion.dismiss ran on it).
static func closing(host: Node) -> bool:
	return host == null or not is_instance_valid(host) or host.has_meta("_closing") or host.is_queued_for_deletion()


# ── Scrims ────────────────────────────────────────────────────────────────────

static func scrim_in(r: CanvasItem) -> void:
	r.modulate.a = 0.0
	var go: Callable = func() -> void:
		if is_instance_valid(r):
			ease_fade(_own(r, r.create_tween()), r, "modulate:a", 1.0, SCRIM_IN)
	if r.is_inside_tree():
		go.call()
	else:
		r.tree_entered.connect(go, CONNECT_ONE_SHOT)


static func scrim_out(r: CanvasItem, free: bool = true) -> void:
	if r is Control:
		(r as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not r.is_inside_tree():
		if free:
			r.queue_free()
		return
	var tw: Tween = _own(r, r.create_tween())
	ease_fade(tw, r, "modulate:a", 0.0, SCRIM_OUT)
	if free:
		tw.tween_callback(r.queue_free)


# ── Things ────────────────────────────────────────────────────────────────────

static func _arrival(size: String) -> Array:
	match size:
		"m":
			return ARRIVE_M
		"l":
			return ARRIVE_L
	return ARRIVE_S


## A thing popping in: "s" small, "m" instrument, "l" hero reveal.
static func arrive(c: CanvasItem, size: String = "s", delay: float = 0.0) -> void:
	var sp: Array = _arrival(size)
	c.modulate.a = 0.0
	if not await _laid_out(c):
		return
	_centre(c)
	var tw: Tween = _own(c, c.create_tween().set_parallel(true))
	if "scale" in c:
		c.set("scale", Vector2.ONE * float(sp[1]))
		ease_pop(tw, c, "scale", Vector2.ONE, float(sp[2])).set_delay(delay)
	ease_fade(tw, c, "modulate:a", 1.0, float(sp[0])).set_delay(delay)


## A thing leaving: fades (and shrinks a little, if scaled), then is freed.
static func leave(c: CanvasItem, free: bool = true, scaled: bool = true) -> Tween:
	if c.has_meta("_leaving"):
		return null
	c.set_meta("_leaving", true)
	if c is Control:
		(c as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not c.is_inside_tree():
		if free:
			c.queue_free()
		return null
	_centre(c)
	var tw: Tween = _own(c, c.create_tween().set_parallel(true))
	ease_exit(tw, c, "modulate:a", 0.0, LEAVE)
	if scaled and "scale" in c:
		var s: Vector2 = c.get("scale")
		ease_exit(tw, c, "scale", s * LEAVE_SCALE, LEAVE)
	if free:
		tw.chain().tween_callback(c.queue_free)
	else:
		tw.chain().tween_callback(func() -> void:
			if is_instance_valid(c):
				c.remove_meta("_leaving"))
	return tw


## Words and lettering in: fade, and a 6px rise where it is free to move.
static func rise_word(c: CanvasItem, delay: float = 0.0) -> void:
	c.modulate.a = 0.0
	if not await _laid_out(c):
		return
	var tw: Tween = _own(c, c.create_tween().set_parallel(true))
	ease_fade(tw, c, "modulate:a", 1.0, WORD_IN).set_delay(delay)
	if _slides(c):
		var cc: Control = c
		var goal: Vector2 = cc.position
		cc.position = goal + Vector2(0, WORD_RISE)
		ease_rise(tw, cc, "position", goal, WORD_TIME).set_delay(delay)


## A toast or note arriving: fade with an 8px rise.
static func note_in(c: CanvasItem) -> void:
	c.modulate.a = 0.0
	if not await _laid_out(c):
		return
	var tw: Tween = _own(c, c.create_tween().set_parallel(true))
	ease_fade(tw, c, "modulate:a", 1.0, NOTE_IN)
	if _slides(c):
		var cc: Control = c
		var goal: Vector2 = cc.position
		cc.position = goal + Vector2(0, NOTE_RISE)
		ease_rise(tw, cc, "position", goal, NOTE_IN + 0.1)


## A toast or note going: a slow fade, then freed (or hidden, free = false).
static func note_out(c: CanvasItem, free: bool = true) -> Tween:
	if not c.is_inside_tree():
		if free:
			c.queue_free()
		return null
	var tw: Tween = _own(c, c.create_tween())
	ease_fade(tw, c, "modulate:a", 0.0, NOTE_OUT)
	if free:
		tw.tween_callback(c.queue_free)
	else:
		tw.tween_callback(func() -> void:
			if is_instance_valid(c):
				c.visible = false)
	return tw


## Crossfade a body that changes: out, rebuild, in.
static func swap(c: CanvasItem, rebuild: Callable) -> void:
	if not c.is_inside_tree():
		rebuild.call()
		return
	var tw: Tween = _own(c, c.create_tween())
	ease_fade(tw, c, "modulate:a", 0.0, SWAP_OUT)
	tw.tween_callback(rebuild)
	ease_fade(tw, c, "modulate:a", 1.0, SWAP_IN)


## Tile i of a grid fading in, a beat after the one before.
static func stagger(c: CanvasItem, i: int) -> void:
	var goal: float = c.modulate.a if c.modulate.a > 0.0 else 1.0
	c.modulate.a = 0.0
	var tw: Tween = c.create_tween()
	tw.tween_interval(minf(STAGGER_MAX, STAGGER_STEP * i))
	ease_fade(tw, c, "modulate:a", goal, WORD_TIME)


## A count-up (bar = false: CUBIC out) or a progress fill (bar = true: QUART
## out). fn gets each value.
static func count(n: Node, from: float, to: float, fn: Callable, bar: bool = false, dur: float = COUNT) -> Tween:
	var tw: Tween = n.create_tween()
	tw.tween_method(fn, from, to, dur).set_trans(Tween.TRANS_QUART if bar else Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	return tw


# ── Press ─────────────────────────────────────────────────────────────────────

static func press(c: Control) -> void:
	c.create_tween().tween_property(c, "scale", Vector2.ONE * PRESS_SCALE, PRESS)


static func release(c: Control) -> void:
	ease_pop(c.create_tween(), c, "scale", Vector2.ONE, RELEASE)
