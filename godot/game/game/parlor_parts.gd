extends RefCounted
## THE PARLOR'S PARTS (THE PARLOR AS A PLACE, Kong 2026-10-10). Preloaded by
## game/parlor_room.gd (no class_name, so no --import): the slate the
## questions are written on, the fuse that burns across its top, the answer
## cards and the hand's face-down cards, the Pirate King's mast, the capstan's
## wheel, the phrase tiles and letter keys, and the wipe between questions.
## All flat and drawn in code: no painted backdrop, no wood, no gradient, no
## gloss, no shadow (Kong rejected the painted backdrop and the faux wood for
## the Den, and the Parlor follows the Den).

## The slate: one flat deep charcoal green, its rim a shade darker.
const SLATE: Color = Color(0.115, 0.155, 0.145)
const SLATE_RIM: Color = Color(0.055, 0.075, 0.07)
## A well on the slate (the solve box, a tile not yet turned).
const SLATE_DEEP: Color = Color(0.085, 0.115, 0.105)
## Chalk: the words written on the slate.
const CHALK: Color = Color(0.95, 0.92, 0.84)
const CHALK_SOFT: Color = Color(0.95, 0.92, 0.84, 0.68)
const CHALK_FAINT: Color = Color(0.95, 0.92, 0.84, 0.28)
## The cards: flat cream, inked.
const CARD: Color = Color(0.94, 0.91, 0.83)
const CARD_HOT: Color = Color(0.99, 0.97, 0.91)
const CARD_INK: Color = Kit.PAPER_INK
## The lit gold of a right answer, a landed wedge, the crown.
const GOLD: Color = Color(1.0, 0.82, 0.42)
const GOLD_DEEP: Color = Color(0.74, 0.53, 0.14)
## A wrong answer, a hazard wedge, the fuse's last seconds.
const RED: Color = Color(0.86, 0.36, 0.3)
const RED_DEEP: Color = Color(0.6, 0.2, 0.16)
## The safe rungs on the mast.
const SAFE: Color = Paper.NIGHT_GREEN
## The fuse, unburnt.
const FUSE: Color = Color(0.86, 0.79, 0.62)
## The second cream of the wheel's wedges.
const SAND: Color = Color(0.85, 0.79, 0.66)


## THE DRAWING HELPERS (an inner class: the parts below are inner classes
## too, and an inner class reaches its outer script's constants, not its
## functions).
class Draw:
	## A flat rounded rectangle (and its rim), drawn.
	static func box(ci: CanvasItem, rect: Rect2, radius: float, fill: Color, rim: Color = Color(0, 0, 0, 0), rim_w: int = 0) -> void:
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = fill
		sb.set_corner_radius_all(int(radius))
		sb.anti_aliasing = true
		if rim_w > 0:
			sb.border_color = rim
			sb.set_border_width_all(rim_w)
		sb.draw(ci.get_canvas_item(), rect)


	## A rounded outline only.
	static func ring(ci: CanvasItem, rect: Rect2, radius: float, col: Color, w: int) -> void:
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.draw_center = false
		sb.set_corner_radius_all(int(radius))
		sb.border_color = col
		sb.set_border_width_all(w)
		sb.anti_aliasing = true
		sb.draw(ci.get_canvas_item(), rect)


	## Buttons drawn by hand: no stylebox of their own.
	static func bare(b: Button) -> void:
		var empty: StyleBoxEmpty = StyleBoxEmpty.new()
		for st: String in ["normal", "hover", "pressed", "disabled", "hover_pressed", "focus"]:
			b.add_theme_stylebox_override(st, empty)
		b.text = ""
		b.focus_mode = Control.FOCUS_ALL


# ── The slate ──────────────────────────────────────────────────────────────────

## THE SLATE: the board the questions are written on. Its pages clip at its
## edge, so a card slid off the board is gone.
class Slate:
	extends Control

	func _ready() -> void:
		clip_contents = true
		mouse_filter = Control.MOUSE_FILTER_PASS

	func _draw() -> void:
		Draw.box(self, Rect2(Vector2.ZERO, size), Kit.R_LARGE, SLATE, SLATE_RIM, 2)


## THE WIPE between pages: a duster's sweep of slate across the board, left
## to right, covering the old page; the new page is put up under it and the
## sweep carries on off the right edge. A faint smear of chalk dust trails its
## leading edge.
class Wipe:
	extends Control
	var k: float = 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	## Sweep over, call `swap`, sweep off; returns when the board is clear.
	func run(swap: Callable) -> void:
		var tw: Tween = create_tween()
		tw.tween_method(_set_k, 0.0, 1.0, 0.24).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		await tw.finished
		swap.call()
		var tw2: Tween = create_tween()
		tw2.tween_method(_set_k, 1.0, 2.0, 0.26).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		await tw2.finished
		queue_free()

	func _set_k(v: float) -> void:
		k = v
		queue_redraw()

	func _draw() -> void:
		var w: float = size.x
		var x0: float = 0.0 if k <= 1.0 else w * (k - 1.0)
		var x1: float = w * minf(k, 1.0) if k <= 1.0 else w
		if x1 - x0 <= 0.5:
			return
		draw_rect(Rect2(x0, 0, x1 - x0, size.y), SLATE)
		# The dust on the leading (or trailing) edge.
		var edge: float = x1 if k <= 1.0 else x0
		for i: int in 7:
			var bx: float = edge + (-1.0 if k <= 1.0 else 1.0) * (6.0 + i * 7.0)
			draw_line(Vector2(bx, 0), Vector2(bx, size.y), Color(CHALK, 0.05 - i * 0.006), 5.0)


# ── The fuse ───────────────────────────────────────────────────────────────────

## THE FUSE: the answer clock, a cord run across the top of the slate that
## burns down from its right end toward the seconds left, a spark spitting at
## the burning end (small, drawn in code), the cord reddening in its last
## seconds. stop() leaves it where it burnt to.
class Fuse:
	extends Control
	var total: float = 12.0
	## When it burns out (engine seconds); -1 when stopped.
	var deadline: float = -1.0
	var _left: float = 12.0
	var _sparks: Array = []
	var _spawn: float = 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func light(seconds_left: float) -> void:
		deadline = Time.get_ticks_msec() / 1000.0 + seconds_left
		_left = seconds_left

	func stop() -> void:
		if deadline > 0.0:
			_left = maxf(0.0, deadline - Time.get_ticks_msec() / 1000.0)
		deadline = -1.0

	func left() -> float:
		return maxf(0.0, deadline - Time.get_ticks_msec() / 1000.0) if deadline > 0.0 else _left

	func _process(delta: float) -> void:
		var burning: bool = deadline > 0.0 and left() > 0.0
		if burning:
			_spawn += delta * 46.0
			var tip: Vector2 = _tip()
			while _spawn >= 1.0:
				_spawn -= 1.0
				var a: float = randf_range(-PI * 0.95, -PI * 0.05)
				_sparks.append({ "p": tip, "v": Vector2.from_angle(a) * randf_range(40.0, 130.0), "t": 0.0, "life": randf_range(0.18, 0.42) })
		for s: Dictionary in _sparks:
			s["t"] = float(s["t"]) + delta
			s["v"] = (s["v"] as Vector2) + Vector2(0, 260.0) * delta
			s["p"] = (s["p"] as Vector2) + (s["v"] as Vector2) * delta
		_sparks = _sparks.filter(func(s: Dictionary) -> bool: return float(s["t"]) < float(s["life"]))
		if burning or not _sparks.is_empty():
			queue_redraw()

	func _x0() -> float:
		return 46.0

	func _tip() -> Vector2:
		var f: float = clampf(left() / maxf(0.1, total), 0.0, 1.0)
		return Vector2(_x0() + (size.x - _x0()) * f, size.y / 2.0)

	func _draw() -> void:
		var y: float = size.y / 2.0
		var l: float = left()
		var hot: float = clampf((4.0 - l) / 4.0, 0.0, 1.0)
		var cord: Color = FUSE.lerp(RED, hot)
		# The seconds, in chalk (red in the last four).
		var s: String = str(int(ceil(l)))
		var f: Font = Kit.font("cinzel", 800)
		draw_string(f, Vector2(0, y + 8.0), s, HORIZONTAL_ALIGNMENT_CENTER, 30.0, 22, CHALK.lerp(RED, hot))
		# What has burnt: a faint line of ash.
		var tip: Vector2 = _tip()
		var x: float = tip.x + 6.0
		while x < size.x:
			draw_line(Vector2(x, y), Vector2(minf(size.x, x + 5.0), y), CHALK_FAINT, 2.0)
			x += 10.0
		if tip.x > _x0() + 0.5:
			draw_line(Vector2(_x0(), y), tip, cord, 5.0, true)
			# The twist of the cord.
			var t: float = _x0() + 4.0
			while t < tip.x - 3.0:
				draw_line(Vector2(t, y - 2.5), Vector2(t + 3.0, y + 2.5), Color(cord.darkened(0.35), 0.8), 1.5, true)
				t += 7.0
		if deadline > 0.0 and l > 0.0:
			draw_circle(tip, 7.0, Color(GOLD, 0.25))
			draw_circle(tip, 3.5, GOLD)
			draw_circle(tip, 1.8, Color(1, 1, 0.92))
		for sp: Dictionary in _sparks:
			var u: float = float(sp["t"]) / float(sp["life"])
			var p: Vector2 = sp["p"]
			var v: Vector2 = sp["v"]
			draw_line(p, p - v * 0.035, Color(GOLD.lerp(RED, u), 1.0 - u), 1.6, true)


# ── The cards ──────────────────────────────────────────────────────────────────

## AN ANSWER CARD: flat cream, its letter in a ring, the answer inked. Hover
## lifts it a touch; pressed it sinks. Right, it turns (a flip on its width)
## to a gold-ringed face and glows; wrong, it shakes and dims; the right card
## turns gold to show the answer. A pad or keyboard sees a gold ring.
class AnswerCard:
	extends Button
	var letter: String = "A"
	var answer: String = ""
	var index: int = 0
	## "", "right" (your pick, right), "answer" (shown right), "wrong".
	var state: String = ""
	## Where it rests (the hover lifts from here).
	var base: Vector2 = Vector2.ZERO
	var settled: bool = false
	var _hover: float = 0.0
	var _glow: float = 0.0
	var _label: Label
	var _lift_tw: Tween

	func _init(i: int, a: String) -> void:
		index = i
		letter = ["A", "B", "C", "D"][i]
		answer = a
		Draw.bare(self)
		tooltip_text = ""
		mouse_entered.connect(func() -> void: _hover_to(1.0))
		mouse_exited.connect(func() -> void: _hover_to(0.0))
		focus_entered.connect(queue_redraw)
		focus_exited.connect(queue_redraw)
		resized.connect(_fit)

	func _ready() -> void:
		_label = Kit.text(self, answer, "body_strong", CARD_INK)
		_label.add_theme_font_override("font", Kit.font("karla", 700))
		_label.add_theme_font_size_override("font_size", 20)
		_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_fit()

	func _fit() -> void:
		pivot_offset = size / 2.0
		if _label != null:
			var disc: float = _disc_r() * 2.0 + 34.0
			_label.position = Vector2(disc, 6.0)
			_label.size = Vector2(maxf(40.0, size.x - disc - 18.0), size.y - 12.0)
			# A long answer steps down a size so it stays on the card.
			var px: int = 20 if answer.length() < 46 else (18 if answer.length() < 80 else 16)
			_label.add_theme_font_size_override("font_size", px)

	func _disc_r() -> float:
		return clampf(size.y * 0.24, 15.0, 22.0)

	## Rest here, now that the layout is known.
	func settle() -> void:
		base = position
		settled = true

	func _hover_to(k: float) -> void:
		# Not before it has a resting place (it would lift from the corner).
		if not settled:
			return
		if disabled:
			k = 0.0
		if _lift_tw != null and _lift_tw.is_valid():
			_lift_tw.kill()
		_lift_tw = create_tween()
		_lift_tw.tween_method(func(x: float) -> void:
			_hover = x
			position = base - Vector2(0, 4.0 * x)
			queue_redraw(), _hover, k, 0.12).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)

	## Pressed: it sinks in and comes back.
	func press_in() -> void:
		var tw: Tween = create_tween()
		tw.tween_property(self, "scale", Vector2.ONE * 0.95, 0.07).set_trans(Tween.TRANS_SINE)
		tw.tween_property(self, "scale", Vector2.ONE, 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		await tw.finished

	## Turned over on its width to `to` (a new face), then a glow pulses out.
	func turn(to: String, glow: bool) -> void:
		var tw: Tween = create_tween()
		tw.tween_property(self, "scale:x", 0.0, 0.12).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		tw.tween_callback(func() -> void:
			state = to
			queue_redraw())
		tw.tween_property(self, "scale:x", 1.0, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		await tw.finished
		if glow:
			var g: Tween = create_tween()
			g.tween_method(_set_glow, 0.0, 1.0, 0.16)
			g.tween_method(_set_glow, 1.0, 0.35, 0.9).set_trans(Tween.TRANS_SINE)

	func _set_glow(v: float) -> void:
		_glow = v
		queue_redraw()

	## A wrong pick: a short shake where it lies, then it dims.
	func shake_dim() -> void:
		state = "wrong"
		queue_redraw()
		var at: Vector2 = base if settled else position
		var tw: Tween = create_tween()
		for i: int in 6:
			var d: float = (9.0 - i * 1.4) * (1.0 if i % 2 == 0 else -1.0)
			tw.tween_property(self, "position", at + Vector2(d, 0), 0.04)
		tw.tween_property(self, "position", at, 0.05)
		tw.tween_property(self, "modulate:a", 0.42, 0.25)
		await tw.finished

	## Slid off the board (the 50/50 striking it).
	func slide_off(dx: float) -> void:
		disabled = true
		focus_mode = Control.FOCUS_NONE
		var tw: Tween = create_tween().set_parallel()
		tw.tween_property(self, "position:x", position.x + dx, 0.42).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		tw.tween_property(self, "rotation", deg_to_rad(6.0 if dx > 0.0 else -6.0), 0.42)
		tw.tween_property(self, "modulate:a", 0.0, 0.42).set_delay(0.12)
		await tw.finished
		visible = false

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var lit: bool = state == "right" or state == "answer"
		if lit and _glow > 0.0:
			for i: int in 4:
				var g: float = 4.0 + i * 5.0
				Draw.box(self, r.grow(g), Kit.R_LARGE + g, Color(GOLD, 0.11 * _glow * (1.0 - i * 0.2)))
		var fill: Color = CARD_HOT if (_hover > 0.0 or lit) else CARD
		if _hover > 0.0 and not lit:
			fill = CARD.lerp(CARD_HOT, _hover)
		Draw.box(self, r, Kit.R_LARGE, fill, Color(CARD_INK, 0.14), 1)
		if lit:
			Draw.ring(self, r, Kit.R_LARGE, GOLD_DEEP if state == "answer" else GOLD, 4)
		# The letter in its ring.
		var dr: float = _disc_r()
		var c: Vector2 = Vector2(18.0 + dr, size.y / 2.0)
		var f: Font = Kit.font("cinzel", 800)
		var px: int = int(dr * 1.0)
		if lit:
			draw_circle(c, dr, GOLD)
			draw_string(f, c + Vector2(-dr, px * 0.36), letter, HORIZONTAL_ALIGNMENT_CENTER, dr * 2.0, px, CARD_INK)
		elif state == "wrong":
			draw_circle(c, dr, RED_DEEP)
			draw_string(f, c + Vector2(-dr, px * 0.36), letter, HORIZONTAL_ALIGNMENT_CENTER, dr * 2.0, px, CARD)
		else:
			draw_arc(c, dr - 1.0, 0.0, TAU, 40, Color(CARD_INK, 0.6), 2.0, true)
			draw_string(f, c + Vector2(-dr, px * 0.36), letter, HORIZONTAL_ALIGNMENT_CENTER, dr * 2.0, px, CARD_INK)
		if has_focus() and _hover == 0.0 and state == "" and not disabled:
			Draw.ring(self, r.grow(4.0), Kit.R_LARGE + 4, Kit.GOLD, 2)


## A CARD IN THE HAND, face down: flat cream, a band of its topic's colour,
## the topic, its tier in stars and its worth. Hover lifts it.
class HandCard:
	extends Button
	var card: Dictionary = {}
	var topic: String = ""
	var colour: Color = Color.WHITE
	var base: Vector2 = Vector2.ZERO
	var _hover: float = 0.0
	var _tw: Tween

	func _init(c: Dictionary, label: String, col: Color) -> void:
		card = c
		topic = label
		colour = col
		Draw.bare(self)
		tooltip_text = "Turn it over"
		mouse_entered.connect(func() -> void: _hover_to(1.0))
		mouse_exited.connect(func() -> void: _hover_to(0.0))
		focus_entered.connect(queue_redraw)
		focus_exited.connect(queue_redraw)
		resized.connect(func() -> void: pivot_offset = size / 2.0)

	func settle() -> void:
		base = position

	func _hover_to(k: float) -> void:
		if _tw != null and _tw.is_valid():
			_tw.kill()
		_tw = create_tween()
		_tw.tween_method(func(x: float) -> void:
			_hover = x
			position = base - Vector2(0, 10.0 * x)
			queue_redraw(), _hover, k, 0.14).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)

	## Turned over: it narrows to its edge (the question is written next).
	func flip_away() -> void:
		var tw: Tween = create_tween()
		tw.tween_property(self, "scale:x", 0.0, 0.14).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		await tw.finished

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		Draw.box(self, r, Kit.R_LARGE, CARD.lerp(CARD_HOT, _hover), Color(CARD_INK, 0.14), 1)
		# The topic's band across the top.
		var band: Rect2 = Rect2(0, 0, size.x, 14.0)
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = colour
		sb.corner_radius_top_left = Kit.R_LARGE
		sb.corner_radius_top_right = Kit.R_LARGE
		sb.anti_aliasing = true
		sb.draw(get_canvas_item(), band)
		var cin: Font = Kit.font("cinzel", 800)
		var cy: float = size.y * 0.42
		draw_string(cin, Vector2(0, cy), topic, HORIZONTAL_ALIGNMENT_CENTER, size.x, 18, CARD_INK)
		var stars: String = "★".repeat(int(card.get("tier", 1)))
		draw_string(Kit.font("karla", 700), Vector2(0, cy + 34.0), stars, HORIZONTAL_ALIGNMENT_CENTER, size.x, 22, Kit.ink(colour))
		var worth: String = "%d ⟡" % int(card.get("value", 0))
		draw_string(cin, Vector2(0, size.y - 30.0), worth, HORIZONTAL_ALIGNMENT_CENTER, size.x, 28, Paper.MONEY)
		if has_focus() and _hover == 0.0:
			Draw.ring(self, r.grow(4.0), Kit.R_LARGE + 4, Kit.GOLD, 2)


# ── The Pirate King's mast ─────────────────────────────────────────────────────

## THE MAST: the King's ladder as a mast of ten yards, bottom to top, each
## with its prize; the safe yards (the havens) flagged; the crown at the
## masthead. Your marker stands on the yard you hold: it climbs one on a right
## answer and falls to the last safe yard on a wrong one, with a settle.
class Mast:
	extends Control
	var prizes: Array = []
	var havens: Array = []
	## Where the marker stands: -1 the deck, i the yard of prize i, a float
	## while it moves.
	var pos: float = -1.0
	## The yard being played for (-1: none).
	var playing: int = -1
	var crowned: bool = false
	var _crown_glow: float = 0.0
	var _ring: float = 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _foot() -> float:
		return size.y - 26.0

	func _top() -> float:
		return 92.0

	## The height of a yard (i), or the deck (-1).
	func y_of(p: float) -> float:
		var n: int = maxi(1, prizes.size())
		var step: float = (_foot() - _top()) / float(n)
		return _foot() - (p + 1.0) * step

	func _mx() -> float:
		return size.x * 0.36

	## Where the marker is, on screen (chalk flies from here).
	func marker_point() -> Vector2:
		return get_global_transform() * Vector2(_mx(), y_of(pos) - 14.0)

	func crown_point() -> Vector2:
		return get_global_transform() * Vector2(_mx(), _top() - 46.0)

	## Up a yard: a short climb that runs a touch past and settles.
	func climb_to(p: float) -> void:
		var tw: Tween = create_tween()
		tw.tween_method(func(v: float) -> void:
			pos = v
			queue_redraw(), pos, p, 0.42).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		await tw.finished
		Sound.plip()

	## Down to a safe yard (or the deck): a fall, a bounce, a settle.
	func fall_to(p: float) -> void:
		var tw: Tween = create_tween()
		tw.tween_method(func(v: float) -> void:
			pos = v
			queue_redraw(), pos, p, 0.85).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
		await tw.finished

	## The crown lights.
	func crown() -> void:
		crowned = true
		var tw: Tween = create_tween()
		tw.tween_method(func(v: float) -> void:
			_crown_glow = v
			queue_redraw(), 0.0, 1.0, 0.3)
		tw.tween_method(func(v: float) -> void:
			_crown_glow = v
			queue_redraw(), 1.0, 0.5, 1.0).set_trans(Tween.TRANS_SINE)

	## A ring pulsed out of the marker (banked: walked away).
	func pulse() -> void:
		var tw: Tween = create_tween()
		tw.tween_method(func(v: float) -> void:
			_ring = v
			queue_redraw(), 0.0, 1.0, 0.7).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)

	func _draw() -> void:
		var mx: float = _mx()
		var n: int = prizes.size()
		var cin: Font = Kit.font("cinzel", 800)
		var kar: Font = Kit.font("karla", 700)
		# The deck and the mast.
		draw_line(Vector2(mx - 60.0, _foot()), Vector2(mx + 60.0, _foot()), CHALK_SOFT, 3.0, true)
		draw_line(Vector2(mx, _foot()), Vector2(mx, _top() - 22.0), CHALK_SOFT, 6.0, true)
		var held: int = int(floor(pos + 0.001))
		for i: int in n:
			var y: float = y_of(float(i))
			var done: bool = i <= held
			var cur: bool = i == playing
			var haven: bool = havens.has(float(i + 1)) or havens.has(i + 1)
			var yard_c: Color = GOLD if done else (CHALK if cur else CHALK_FAINT)
			var half: float = 30.0 + (n - i) * 1.2
			draw_line(Vector2(mx - half, y), Vector2(mx + half, y), yard_c, 5.0 if cur else 4.0, true)
			var s: String = "%s ⟡" % Js.thousands(float(prizes[i]))
			var col: Color = GOLD if done else (CHALK if cur else CHALK_SOFT)
			draw_string(cin, Vector2(mx + half + 12.0, y + 7.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 19 if cur else 17, col)
			if haven:
				# A safe yard: a pennant on the mast and the word.
				var fy: float = y - 4.0
				draw_colored_polygon(PackedVector2Array([Vector2(mx - 3.0, fy - 18.0), Vector2(mx - 30.0, fy - 11.0), Vector2(mx - 3.0, fy - 4.0)]), SAFE)
				draw_string(kar, Vector2(mx - half - 50.0, y + 5.0), "SAFE", HORIZONTAL_ALIGNMENT_RIGHT, 42.0, 12, SAFE)
		# The crown at the masthead.
		var cc: Vector2 = Vector2(mx, _top() - 46.0)
		var cw: float = 26.0
		var pts: PackedVector2Array = PackedVector2Array([
			cc + Vector2(-cw, 12), cc + Vector2(-cw, -8), cc + Vector2(-cw * 0.5, 2), cc + Vector2(0, -14),
			cc + Vector2(cw * 0.5, 2), cc + Vector2(cw, -8), cc + Vector2(cw, 12)])
		if crowned:
			if _crown_glow > 0.0:
				for i: int in 4:
					draw_circle(cc, 30.0 + i * 8.0, Color(GOLD, 0.09 * _crown_glow * (1.0 - i * 0.22)))
			draw_colored_polygon(pts, GOLD)
		else:
			var closed: PackedVector2Array = pts.duplicate()
			closed.append(pts[0])
			draw_polyline(closed, CHALK_SOFT, 2.0, true)
		# The marker: a gold token standing on the yard it holds.
		var my: float = y_of(pos) - 14.0
		var mc: Vector2 = Vector2(mx, my)
		if _ring > 0.0:
			draw_arc(mc, 14.0 + _ring * 30.0, 0.0, TAU, 40, Color(GOLD, 1.0 - _ring), 3.0, true)
		draw_circle(mc, 13.0, SLATE_RIM)
		draw_circle(mc, 11.0, GOLD)
		draw_circle(mc, 5.0, GOLD_DEEP)


# ── The capstan wheel ──────────────────────────────────────────────────────────

## THE CAPSTAN'S WHEEL: sixteen wedges in two creams, the two hazards in red,
## each wedge's prize written along it; pegs at the rim, a pawl at the top
## that the pegs knock aside as they pass. It spins up, turns heavily, slows,
## runs a touch past and settles back onto the wedge the rules returned.
class CapWheel:
	extends Control
	var wedges: Array = []
	var angle: float = 0.0
	## The wedge lit after a spin (-1: none).
	var lit: int = -1
	var _lit_k: float = 0.0
	var _pawl: float = 0.0
	var _peg: int = 0
	var _last_tick: float = 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(delta: float) -> void:
		if _pawl > 0.0:
			_pawl = maxf(0.0, _pawl - delta * 7.0)
			queue_redraw()

	func _r() -> float:
		return minf(size.x, size.y) / 2.0 - 30.0

	func _c() -> Vector2:
		return Vector2(size.x / 2.0, size.y / 2.0 + 14.0)

	## The pointer's tip on screen (a prize lifts off from here).
	func pointer_point() -> Vector2:
		return get_global_transform() * (_c() + Vector2(0, -_r() + _r() * 0.28))

	func _set_angle(a: float) -> void:
		angle = a
		var n: int = maxi(1, wedges.size())
		var peg: int = int(floor(angle / (TAU / n)))
		if peg != _peg:
			_peg = peg
			_pawl = 1.0
			var now: float = Time.get_ticks_msec() / 1000.0
			# A tick a peg, but never a buzz when it runs fast.
			if now - _last_tick > 0.045:
				_last_tick = now
				Sound.xp_tick()
		queue_redraw()

	## Spin onto wedge i: up to speed, a long heavy slowing that runs a
	## little past, then back onto the wedge.
	func spin_to(i: int) -> void:
		lit = -1
		_lit_k = 0.0
		var n: int = wedges.size()
		var w: float = TAU / n
		var start: float = angle
		_peg = int(floor(start / w))
		# The wedge's middle under the pawl, a hair off centre so it never
		# reads as on a fret.
		var base: float = -w * (float(i) + 0.5) + randf_range(-w * 0.18, w * 0.18)
		var end: float = base + TAU * ceilf((start + TAU * 4.0 - base) / TAU)
		var over: float = w * 0.42
		var d2: float = (end + over - start) / 1.234
		var d1: float = d2 * 0.234
		var tw: Tween = create_tween()
		tw.tween_method(_set_angle, start, start + d1, 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_method(_set_angle, start + d1, end + over, 3.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_method(_set_angle, end + over, end, 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		await tw.finished
		angle = fmod(end, TAU)
		_peg = int(floor(angle / w))
		lit = i
		var g: Tween = create_tween()
		g.tween_method(func(v: float) -> void:
			_lit_k = v
			queue_redraw(), 0.0, 1.0, 0.25)

	func _draw() -> void:
		var c: Vector2 = _c()
		var R: float = _r()
		var n: int = wedges.size()
		if n == 0:
			return
		var f: Font = Kit.font("cinzel", 800)
		draw_circle(c, R + 10.0, SLATE_RIM)
		draw_circle(c, R + 7.0, SLATE)
		for i: int in n:
			var a0: float = angle + TAU * i / n - PI / 2.0
			var a1: float = a0 + TAU / n
			var pts: PackedVector2Array = PackedVector2Array([c])
			for k: int in 9:
				pts.append(c + Vector2.from_angle(lerpf(a0, a1, k / 8.0)) * R)
			var w: Variant = wedges[i]
			var hazard: bool = w is String
			var col: Color = RED_DEEP if hazard else (CARD if i % 2 == 0 else SAND)
			draw_colored_polygon(pts, col)
			var label: String = ("OVERBOARD" if w == "overboard" else "LOSE A TURN") if hazard else str(int(w))
			var am: float = (a0 + a1) / 2.0
			var px: int = int(clampf(R * (0.055 if hazard else 0.085), 11.0, 30.0))
			# Written along the wedge, never upside down: the left half reads
			# inward.
			var turn: float = am if cos(am) >= 0.0 else am + PI
			draw_set_transform(c + Vector2.from_angle(am) * (R * 0.6), turn, Vector2.ONE)
			var tw: float = f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
			draw_string(f, Vector2(-tw / 2.0, px * 0.36), label, HORIZONTAL_ALIGNMENT_LEFT, -1, px, CARD if hazard else CARD_INK)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		# The frets between wedges and the pegs at the rim.
		for i: int in n:
			var a: float = angle + TAU * i / n - PI / 2.0
			draw_line(c + Vector2.from_angle(a) * R * 0.2, c + Vector2.from_angle(a) * R, Color(SLATE_RIM, 0.55), 2.0, true)
			draw_circle(c + Vector2.from_angle(a) * (R - 6.0), 4.0, SLATE_RIM)
		# The landed wedge, ringed in gold.
		if lit >= 0 and lit < n and _lit_k > 0.0:
			var b0: float = angle + TAU * lit / n - PI / 2.0
			var arc: PackedVector2Array = PackedVector2Array([c + Vector2.from_angle(b0) * R * 0.2])
			for k: int in 9:
				arc.append(c + Vector2.from_angle(lerpf(b0, b0 + TAU / n, k / 8.0)) * (R - 2.0))
			arc.append(c + Vector2.from_angle(b0 + TAU / n) * R * 0.2)
			arc.append(arc[0])
			draw_polyline(arc, Color(GOLD, _lit_k), 4.0, true)
		# The hub.
		draw_circle(c, R * 0.2, SLATE)
		draw_arc(c, R * 0.2, 0.0, TAU, 48, CHALK_SOFT, 2.0, true)
		draw_circle(c, R * 0.06, CHALK_SOFT)
		# The pawl at the top, knocked aside by each peg.
		var top: Vector2 = c + Vector2(0, -R - 16.0)
		var tilt: float = -_pawl * 0.35
		var tip: Vector2 = top + Vector2(0, 40.0).rotated(tilt)
		var l: Vector2 = top + Vector2(-13.0, 0).rotated(tilt)
		var r: Vector2 = top + Vector2(13.0, 0).rotated(tilt)
		draw_colored_polygon(PackedVector2Array([l, r, tip]), GOLD)
		draw_circle(top, 7.0, SLATE_RIM)
		draw_circle(top, 4.0, GOLD)


# ── The capstan's phrase and letters ───────────────────────────────────────────

## A TILE of the phrase: blank until its letter is called, then it turns over
## to show the letter.
class Tile:
	extends Control
	var letter: String = ""
	var shown: bool = false

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		resized.connect(func() -> void: pivot_offset = size / 2.0)

	## Turned over to show its letter, after `delay`.
	func turn_up(delay: float) -> void:
		var tw: Tween = create_tween()
		tw.tween_interval(delay)
		tw.tween_property(self, "scale:x", 0.0, 0.1).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		tw.tween_callback(func() -> void:
			shown = true
			queue_redraw()
			Sound.job_tick(4))
		tw.tween_property(self, "scale:x", 1.0, 0.14).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		if shown:
			Draw.box(self, r, 5, CARD)
			var f: Font = Kit.font("cinzel", 800)
			var px: int = int(size.y * 0.56)
			draw_string(f, Vector2(0, size.y / 2.0 + px * 0.36), letter, HORIZONTAL_ALIGNMENT_CENTER, size.x, px, CARD_INK)
		else:
			Draw.box(self, r, 5, SAND.darkened(0.25))


## A LETTER to call, chalked in a hairline square; one called is struck.
class LetterKey:
	extends Button
	var letter: String = "A"
	var used: bool = false
	var vowel: bool = false
	var _hover: float = 0.0

	func _init(l: String) -> void:
		letter = l
		vowel = l in ["A", "E", "I", "O", "U"]
		Draw.bare(self)
		mouse_entered.connect(func() -> void:
			_hover = 1.0
			queue_redraw())
		mouse_exited.connect(func() -> void:
			_hover = 0.0
			queue_redraw())
		focus_entered.connect(queue_redraw)
		focus_exited.connect(queue_redraw)
		resized.connect(func() -> void: pivot_offset = size / 2.0)
		Kit.tap(self)

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size).grow(-2.0)
		var a: float = 0.3 if disabled else 1.0
		if _hover > 0.0 and not disabled:
			Draw.box(self, r, 6, Color(CHALK, 0.1))
		Draw.ring(self, r, 6, Color(GOLD if vowel else CHALK, (0.55 if vowel else 0.4) * a), 1)
		var f: Font = Kit.font("cinzel", 800)
		var px: int = 18
		draw_string(f, Vector2(0, size.y / 2.0 + px * 0.36), letter, HORIZONTAL_ALIGNMENT_CENTER, size.x, px, Color(CHALK, a))
		if used:
			draw_line(Vector2(size.x * 0.22, size.y * 0.78), Vector2(size.x * 0.78, size.y * 0.22), Color(CHALK, 0.45), 2.0, true)
		if has_focus() and _hover == 0.0:
			Draw.ring(self, r.grow(2.0), 8, Kit.GOLD, 2)
