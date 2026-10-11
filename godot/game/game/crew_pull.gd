extends RefCounted
## THE RECRUIT ROOM AS A PULL (Kong, 2026-10-10: "it should feel more like a
## game gacha style since that's what you're using to roll for better crew").
## The parts of the Crew Hall's recruit room (game/crew_hall.gd preloads this;
## no class_name, so no --import): the board itself (Stage: the notice the
## board was posted from, pinned on the night paper, and its three cards),
## each card (Card: face down under a wax seal, or face up with its art and a
## thin rim in its rarity's colour), and the notices as ticket-style pull
## buttons (Ticket). Presentation only: every card shows exactly the board the
## rules returned (core/crew.gd), in its slot; nothing here rolls.
##
## THE PULL (Stage.run "pull"): the notice slams onto the board, three sealed
## cards slide in, and each seal glows its rarity before it flips (none for a
## common, a soft shimmer for a rare, rays for an epic); a legendary is always
## turned LAST, after a held pause, and breaks open with a gold column of
## light and sparks, drawn in code on the card (no screen shake). Any press
## turns the rest at once (Stage.skip). The free board at sunrise gets the
## light version ("light": slide in, flip, no seal tell).
##
## DEEPER (Kong, 2026-10-10): a face never had before wears a small NEW stamp
## as it turns (the rules' isNew); each crewmate says their one line as they
## turn, typed on the card for a moment (port_rules crewQuips); the trait is
## a small ink stamp; the tickets say how near the bad-luck guarantee is.
## Sounds made in code (Sound.wax_crack, card_flip, fanfare).
##
## SIGN ON AS THE MOMENT (Kong, 2026-10-11: the on-card comparison "looks
## messy and is hard to read", the Sign on button "a bit hidden but also
## boring"): a face up card carries only its art, name, rarity and class and
## the trait stamp. Hover or focus lifts it a touch, says the trait in one
## line, and slides a flat cream "Sign on" bar up over its foot (the night
## paper's primary look); the bar signs (sign_wanted), the rest of the card
## selects. The comparison lives in the hall's side panel (crew_hall.gd).

## A card on the board, and the gaps the stage keeps round them.
const CARD: Vector2 = Vector2(224, 292)
const GAP: float = 22.0
## The notice's own strip at the top of the board (its name, the countdown).
const STRIP: float = 38.0
const PAD: float = 12.0
## The Sign on bar over a card's foot, and how far a card lifts when hot.
const BAR_H: float = 38.0
const LIFT_PX: float = 6.0
## Sealing wax, and the card's two faces on the night paper (flat fills).
const WAX: Color = Color(0.6, 0.14, 0.12)
const BACK: Color = Color(0.255, 0.21, 0.175)
const FACE: Color = Color(0.225, 0.185, 0.155)
const SHEET: Color = Color(0.215, 0.178, 0.15)


## The words for where a notice is found, by drop source (crewPort.noticeDrops).
const SOURCE_WORDS: Dictionary = { "casket": "caskets", "crate": "crates", "voyage": "voyages" }


# ── Words from the rules' numbers ─────────────────────────────────────────────

## The chance a board of `faces` shows at least one face of rarity r (1-4),
## from a notice's weights (per face, as Crew.roll_rarity reads them).
static func board_chance(weights: Array, r: int, faces: int) -> float:
	var total: float = 0.0
	for w: Variant in weights:
		total += float(w)
	if total <= 0.0 or weights.size() < r:
		return 0.0
	return 1.0 - pow(1.0 - float(weights[r - 1]) / total, faces)


## The bad-luck guarantee for a ticket, from the crew state's pity: "Epic or
## better within 4 posts", or on this one at the threshold ("" with none).
static func pity_words(pity: Dictionary) -> String:
	var within: int = int(Js.num(pity.get("within")))
	if within <= 0:
		return ""
	if within == 1:
		return "Epic or better guaranteed on this one"
	return "Epic or better within %d posts" % within


static func one_in(p: float) -> String:
	return "about 1 in %d" % maxi(1, roundi(1.0 / p))


## A notice's odds in ONE short plain line, worked from its real weights:
## "Epic about 1 in 7 · Legendary about 1 in 100" (a board in each case).
static func odds_line(weights: Array, faces: int) -> String:
	var e: float = board_chance(weights, 3, faces)
	var l: float = board_chance(weights, 4, faces)
	return "%s · %s" % ["Epic %s" % one_in(e) if e > 0.0 else "Never an Epic", "Legendary %s" % one_in(l) if l > 0.0 else "never a Legendary"]


## Where a notice comes from, in a few words (the drop tables that hold it).
static func found_in(id: String) -> String:
	var where: Array = []
	var drops: Dictionary = Js.obj(Crew.port().get("noticeDrops"))
	for src: Variant in drops:
		for tier: Variant in Js.obj(drops[src]):
			if Js.obj(drops[src][tier]).has(id) and SOURCE_WORDS.has(src) and not where.has(SOURCE_WORDS[src]):
				where.append(SOURCE_WORDS[src])
	if where.is_empty():
		return "Not found anywhere yet"
	var last: String = where.pop_back()
	return "Found in %s" % (("%s and %s" % [", ".join(PackedStringArray(where)), last]) if not where.is_empty() else last)


## Time left to the next board on the sea's clock (a sea day is boardEveryMs
## of real time, 24 sea hours): "in 3h 12m".
static func sea_left(left_ms: float, every_ms: float) -> String:
	var m: int = int(ceil(maxf(0.0, left_ms) / every_ms * 1440.0))
	if m >= 60:
		return "in %dh %dm" % [m / 60, m % 60]
	return "in %dm" % maxi(1, m)


# ── A ticket: one notice to post ──────────────────────────────────────────────

## A NOTICE AS A PULL BUTTON: a flat ticket (notched sides, a perforation)
## with a small drawn stack of the notices held and its count on the stub,
## "Post a Harbor Bill" and its odds on the rest. Held none, it is greyed and
## says where one is found.
class Ticket:
	extends Button
	var title: String
	var odds: String
	var held: int
	var from_words: String
	## The bad-luck guarantee in words ("Epic or better within 4 posts").
	var pity: String
	var _hot: bool = false
	const STUB: float = 60.0

	func _init(t: String, o: String, n: int, f: String, pty: String = "") -> void:
		title = t
		odds = o
		held = n
		from_words = f
		pity = pty
		flat = true
		disabled = n <= 0
		focus_mode = Control.FOCUS_ALL if n > 0 else Control.FOCUS_NONE
		custom_minimum_size = Vector2(0, 100 if pty != "" and n > 0 else 84)
		size_flags_horizontal = Control.SIZE_EXPAND_FILL
		add_theme_stylebox_override("focus", UiTheme.focus_ring(10, Paper.CHOSEN))
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if n > 0 else Control.CURSOR_ARROW
		var v: VBoxContainer = VBoxContainer.new()
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		v.offset_left = STUB + 12.0
		v.offset_right = -12.0
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		v.add_theme_constant_override("separation", 2)
		add_child(v)
		var ink: Color = Paper.NIGHT_INK if n > 0 else Paper.NIGHT_INK_FAINT
		var tl: Label = Kit.text(v, title, "name", ink)
		tl.clip_text = true
		var ol: Label = Kit.text(v, odds, "note", Paper.NIGHT_INK_SOFT if n > 0 else Paper.NIGHT_INK_FAINT)
		# The odds wrap to a second line in a narrow ticket rather than
		# losing their end (the Legendary chance is the point of a pull).
		ol.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		if n > 0 and pity != "":
			var pl: Label = Kit.text(v, pity, "small", Paper.CHOSEN)
			pl.clip_text = true
			pl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		if n <= 0:
			# The stub's x0 already says none are held.
			var fl: Label = Kit.text(v, "%s." % from_words, "note", Paper.NIGHT_INK_FAINT)
			fl.clip_text = true
			fl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		var count: Label = Kit.text(self, "x%d" % n, "name_strong", Paper.NIGHT_INK if n > 0 else Paper.NIGHT_INK_FAINT)
		count.mouse_filter = Control.MOUSE_FILTER_IGNORE
		count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		count.position = Vector2(0, 50)
		count.size = Vector2(STUB, 22)
		mouse_entered.connect(func() -> void: _set_hot(true))
		mouse_exited.connect(func() -> void: _set_hot(false))
		focus_entered.connect(func() -> void: _set_hot(true))
		focus_exited.connect(func() -> void: _set_hot(false))
		Kit.tap(self)

	func _set_hot(on: bool) -> void:
		_hot = on and not disabled
		queue_redraw()

	## The ticket's outline: a rounded rectangle with a half-round notch
	## bitten out of each side, the way a raffle ticket is cut.
	static func outline(w: float, h: float, r: float, n: float) -> PackedVector2Array:
		var pts: PackedVector2Array = PackedVector2Array()
		var arc: Callable = func(c: Vector2, rad: float, a0: float, a1: float, steps: int) -> void:
			for i: int in steps + 1:
				var a: float = lerpf(a0, a1, i / float(steps))
				pts.append(c + Vector2(cos(a), sin(a)) * rad)
		arc.call(Vector2(w - r, r), r, -PI / 2.0, 0.0, 5)
		arc.call(Vector2(w, h / 2.0), n, -PI / 2.0, -PI * 1.5, 9)
		arc.call(Vector2(w - r, h - r), r, 0.0, PI / 2.0, 5)
		arc.call(Vector2(r, h - r), r, PI / 2.0, PI, 5)
		arc.call(Vector2(0, h / 2.0), n, PI / 2.0, -PI / 2.0, 9)
		arc.call(Vector2(r, r), r, PI, PI * 1.5, 5)
		return pts

	func _draw() -> void:
		var live: bool = held > 0
		var fill: Color = Color(0.29, 0.24, 0.2) if live else Color(0.21, 0.175, 0.15)
		if _hot:
			fill = fill.lightened(0.1)
		var pts: PackedVector2Array = outline(size.x, size.y, 10.0, 9.0)
		draw_colored_polygon(pts, fill)
		var closed: PackedVector2Array = pts.duplicate()
		closed.append(pts[0])
		draw_polyline(closed, Color(Paper.CHOSEN if _hot else Paper.NIGHT_INK, 0.75 if _hot else (0.3 if live else 0.14)), 1.4, true)
		# The perforation between the stub and the ticket.
		draw_dashed_line(Vector2(STUB, 10), Vector2(STUB, size.y - 10), Color(Paper.NIGHT_INK, 0.25 if live else 0.12), 1.5, 4.0)
		# The stack of notices held: up to three sheets, each a little askew.
		var c: Vector2 = Vector2(STUB / 2.0, 30)
		var sheets: int = clampi(held, 1, 3)
		for i: int in sheets:
			var k: int = sheets - 1 - i
			draw_set_transform(c + Vector2(k * 3.0, -k * 3.0), (-0.12 + k * 0.1) if live else 0.0, Vector2.ONE)
			var paper: Color = Color(0.9, 0.84, 0.72) if live else Color(0.45, 0.4, 0.34)
			draw_rect(Rect2(-12, -15, 24, 30), paper.darkened(0.08 * k))
			draw_rect(Rect2(-12, -15, 24, 30), Color(0.18, 0.13, 0.09, 0.5), false, 1.0)
			if k == 0:
				var ink: Color = Color(0.18, 0.13, 0.09, 0.55)
				draw_line(Vector2(-7, -8), Vector2(7, -8), ink, 2.0)
				for j: int in 3:
					draw_line(Vector2(-7, -2 + j * 5), Vector2(7 - j * 3, -2 + j * 5), Color(ink, 0.35), 1.0)
				draw_circle(Vector2(0, -13), 2.0, WAX if live else Color(0.35, 0.3, 0.26))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


# ── A card ────────────────────────────────────────────────────────────────────

## ONE RECRUIT ON THE BOARD: face down under a wax seal until it is turned,
## then the painting on a glow of its rarity's colour, the name and the rarity
## word, on a plain hairline card (no coloured rim). Epics and legendaries keep a soft glow of
## their colour behind them. Its seal's tell, the flip, the legendary's column
## and the ABOARD stamp are all drawn here, local to the card.
class Card:
	extends Button
	## The Sign on bar was pressed (or the pad's accept on a chosen card).
	signal sign_wanted
	var c: Dictionary
	var rar: int = 1
	var rc: Color
	var sealed: bool = false
	var revealed: bool = true
	## The seal's tell (0 to 1) and its clock.
	var tell: float = 0.0
	var _t: float = 0.0
	## The glow that lingers behind an epic or a legendary (0 to 1).
	var linger: float = 0.0
	var face: Control
	var holder: Control
	var pic: TextureRect
	var fx: Control
	var stamp_layer: Control
	## The ABOARD stamp: -1 none; 0 to 1 thumping on.
	var stamp: float = -1.0
	## The legendary's column of light (0 to 1, -1 none) and its sparks.
	var beam: float = -1.0
	var _sparks: Array = []
	var _flipping: bool = false
	## Never had before (the rules' isNew): a NEW stamp as it turns. new_k is
	## the stamp thumping on (0 to 1), -1 for none.
	var is_new: bool = false
	var new_k: float = -1.0
	## Their one line, said as the card turns on a reveal (speak).
	var quip: String = ""
	var speak: bool = false
	## The trait in one line, shown on hover or focus ("" with no trait).
	var tip_text: String = ""
	var _quip_box: PanelContainer
	var _quip_l: Label
	var _tip_box: PanelContainer
	var _tip_l: Label
	var _quip_tw: Tween
	## THE SIGN ON BAR (null on a card already aboard): flat cream with dark
	## words, risen over the card's foot while it is hot (bar_k 0 to 1).
	var bar: Pane.PaneButton
	var bar_k: float = 0.0
	var _bar_tw: Tween
	## Held still by the stage while it deals, turns or tears the board down,
	## and by the hall while a signed card flies (no hover, no bar).
	var locked: bool = false
	## The card on show in the side panel: a soft cream hairline round it
	## (never gold: Kong, 2026-10-11, coloured borders look cheap).
	var chosen: bool = false
	## Where the stage lays it; lift raises it from there by up to LIFT_PX.
	var home: Vector2 = Vector2.ZERO
	var lift: float = 0.0:
		set(v):
			lift = v
			if not locked:
				position = home + Vector2(0, -LIFT_PX * v)
	var _hot: bool = false
	var _lift_tw: Tween

	func _init(card: Dictionary, thumb: Texture2D) -> void:
		c = card
		rar = clampi(int(Js.num(c.get("rarity"))), 1, 4)
		rc = CrewHall.rarity_color(rar)
		flat = true
		size = CARD
		custom_minimum_size = CARD
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		face = Control.new()
		face.mouse_filter = Control.MOUSE_FILTER_IGNORE
		face.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(face)
		holder = Control.new()
		holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.position = Vector2(8, 8)
		holder.size = Vector2(CARD.x - 16, CARD.y - 76)
		face.add_child(holder)
		Paper.blot(holder, rc, 0.75)
		pic = TextureRect.new()
		pic.texture = thumb
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(pic)
		var v: VBoxContainer = VBoxContainer.new()
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		v.position = Vector2(8, CARD.y - 64)
		v.size = Vector2(CARD.x - 16, 58)
		v.add_theme_constant_override("separation", 0)
		face.add_child(v)
		var nl: Label = Kit.text(v, str(c.get("name", "")), "heading", Paper.NIGHT_INK)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		nl.clip_text = true
		nl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		var cls: Dictionary = Crew.class_of(str(c.get("slug", "")))
		var word: String = String(["Common", "Rare", "Epic", "Legendary"][rar - 1]).to_upper()
		var rl: Label = Kit.text(v, word + (("  ·  " + str(cls["name"]).to_upper()) if not cls.is_empty() else ""), "label", rc.lightened(0.12))
		rl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		rl.clip_text = true
		# THE TRAIT AS A STAMP: a small inked box (hairline ink, never a
		# rarity colour), its meaning in plain words on hover.
		var tl: String = Crew.trait_label(Js.list(c.get("effects")))
		var trow: CenterContainer = CenterContainer.new()
		trow.mouse_filter = Control.MOUSE_FILTER_IGNORE
		trow.custom_minimum_size = Vector2(0, 20)
		v.add_child(trow)
		if tl != "":
			var tr: Label = Kit.text(trow, tl.to_upper(), "tag", Paper.NIGHT_INK_SOFT)
			var tsb: StyleBoxFlat = StyleBoxFlat.new()
			tsb.bg_color = Color(0, 0, 0, 0)
			tsb.border_color = Color(Paper.NIGHT_INK, 0.4)
			tsb.set_border_width_all(1)
			tsb.set_corner_radius_all(2)
			tsb.content_margin_left = 6
			tsb.content_margin_right = 6
			tsb.content_margin_top = 1
			tsb.content_margin_bottom = 1
			tr.add_theme_stylebox_override("normal", tsb)
			# Its meaning is the card's hover line (dress), not a tooltip.
			tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_quip_box = _strip(Color(0.1, 0.085, 0.07, 0.9))
		_quip_l = _quip_box.get_child(0)
		_tip_box = _strip(Color(0.07, 0.06, 0.05, 0.94))
		_tip_l = _tip_box.get_child(0)
		fx = Control.new()
		fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
		fx.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		var add: CanvasItemMaterial = CanvasItemMaterial.new()
		add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		fx.material = add
		fx.draw.connect(_draw_fx)
		add_child(fx)
		stamp_layer = Control.new()
		stamp_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stamp_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		stamp_layer.draw.connect(_draw_stamp)
		add_child(stamp_layer)
		if c.get("recruited") == true:
			pic.modulate = Color(1, 1, 1, 0.45)
			stamp = 1.0
		linger = 1.0 if rar >= 3 else 0.0
		resized.connect(func() -> void: pivot_offset = size / 2.0)
		pivot_offset = CARD / 2.0
		# A pad can reach it; its focus is a soft cream hairline, not gold.
		focus_mode = Control.FOCUS_ALL
		add_theme_stylebox_override("focus", soft_ring(Kit.R_SMALL))
		Kit.tap(self)
		# Hot is worked out, not toggled: the pointer moving from the card onto
		# its own bar must keep it hot whatever order the signals come in.
		mouse_entered.connect(_check_hot.call_deferred)
		mouse_exited.connect(_check_hot.call_deferred)
		focus_entered.connect(_check_hot.call_deferred)
		focus_exited.connect(_check_hot.call_deferred)
		# The pad: accept on the card already chosen signs (the bar is up on
		# it); on any other it selects, and the hall gives focus back after
		# its redraw (pad_press).
		gui_input.connect(func(ev: InputEvent) -> void:
			if not ev.is_action_pressed("ui_accept") or ev.is_echo():
				return
			if chosen and bar != null and not locked:
				accept_event()
				sign_wanted.emit()
			else:
				set_meta("pad_press", true))
		set_process(false)

	## A soft cream hairline ring a few pixels out (focus and chosen).
	static func soft_ring(radius: int) -> StyleBoxFlat:
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.draw_center = false
		sb.border_color = Color(Paper.NIGHT_INK, 0.5)
		sb.set_border_width_all(1)
		sb.set_corner_radius_all(radius + 3)
		sb.set_expand_margin_all(4)
		sb.anti_aliasing = true
		return sb

	## What the hall adds: NEW (shown at once on a board at rest), the line
	## to say, the trait's meaning for the hover, and the bar's words
	## ("Sign on", "Roster full"; "" for a card already aboard, no bar).
	func dress(fresh: bool, line: String, tip: String, sign_words: String = "") -> void:
		is_new = fresh and c.get("recruited") != true
		new_k = 1.0 if is_new else -1.0
		quip = line
		tip_text = tip
		_tip_l.text = tip
		if sign_words != "" and c.get("recruited") != true and bar == null:
			_make_bar(sign_words)

	## THE SIGN ON BAR: the night paper's primary (Paper.button "on": flat
	## cream, dark words), hidden till the card is hot, then risen over its
	## foot. The name stays clear above it.
	func _make_bar(words: String) -> void:
		bar = Paper.button(words, true, true)
		bar.custom_minimum_size = Vector2(CARD.x - 12.0, BAR_H)
		bar.size = Vector2(CARD.x - 12.0, BAR_H)
		bar.add_theme_stylebox_override("focus", soft_ring(Kit.R_SMALL))
		bar.visible = false
		bar.modulate.a = 0.0
		bar.pressed.connect(func() -> void:
			if not locked:
				sign_wanted.emit())
		bar.mouse_entered.connect(_check_hot.call_deferred)
		bar.mouse_exited.connect(_check_hot.call_deferred)
		bar.focus_entered.connect(_check_hot.call_deferred)
		bar.focus_exited.connect(_check_hot.call_deferred)
		add_child(bar)
		_place_bar()

	func _place_bar() -> void:
		if bar == null:
			return
		bar.position = Vector2(6.0, CARD.y - BAR_H - 6.0 + (1.0 - bar_k) * 14.0)
		bar.modulate.a = bar_k
		bar.visible = bar_k > 0.01

	## Hot: face up, not held still, and the pointer over it (or its bar) or
	## the pad's focus on it. Hot lifts it, says the trait, raises the bar.
	func _check_hot() -> void:
		if not is_inside_tree():
			return
		var over: bool = is_visible_in_tree() and get_global_rect().has_point(get_global_mouse_position())
		var on: bool = revealed and not sealed and not locked and (over or has_focus() or (bar != null and bar.has_focus()))
		set_hot(on)

	func set_hot(on: bool) -> void:
		if on == _hot:
			return
		_hot = on
		if _lift_tw != null:
			_lift_tw.kill()
		_lift_tw = create_tween()
		Motion.ease_rise(_lift_tw, self, "lift", 1.0 if on else 0.0, 0.16)
		_show_tip(on)
		if bar != null:
			if _bar_tw != null:
				_bar_tw.kill()
			_bar_tw = create_tween()
			_bar_tw.tween_method(func(k: float) -> void:
				bar_k = k
				_place_bar(), bar_k, 1.0 if on else 0.0, 0.18 if on else 0.12).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT if on else Tween.EASE_IN)

	## Held still (the stage dealing, a flight): hot is dropped at once.
	func set_locked(on: bool) -> void:
		locked = on
		if on:
			_hot = false
			lift = 0.0
			bar_k = 0.0
			_place_bar()
			if _tip_box != null:
				_tip_box.visible = false
		else:
			_check_hot.call_deferred()

	func set_chosen(on: bool) -> void:
		chosen = on
		queue_redraw()

	## A slim dark strip along the foot of the painting (the line said, or
	## the trait's meaning), hidden until wanted.
	func _strip(fill: Color) -> PanelContainer:
		var box: PanelContainer = PanelContainer.new()
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = fill
		sb.set_corner_radius_all(Kit.R_SMALL)
		sb.content_margin_left = 8
		sb.content_margin_right = 8
		sb.content_margin_top = 4
		sb.content_margin_bottom = 4
		box.add_theme_stylebox_override("panel", sb)
		# Held to the foot of the painting, growing upward with its lines.
		var dock: Control = Control.new()
		dock.mouse_filter = Control.MOUSE_FILTER_IGNORE
		dock.position = holder.position
		dock.size = holder.size
		face.add_child(dock)
		dock.add_child(box)
		box.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
		box.offset_left = 2
		box.offset_right = -2
		box.offset_bottom = -4
		box.offset_top = -4
		box.grow_vertical = Control.GROW_DIRECTION_BEGIN
		var l: Label = Kit.text(box, "", "small", Paper.NIGHT_INK)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		box.visible = false
		return box

	func _show_tip(on: bool) -> void:
		if tip_text == "" or not revealed:
			return
		_tip_box.visible = on
		if on:
			_tip_box.modulate.a = 0.0
			Motion.ease_fade(create_tween(), _tip_box, "modulate:a", 1.0, Motion.WORD_IN)

	## THEIR LINE: typed onto the card, held a moment, then gone.
	func say() -> void:
		if quip == "":
			return
		if _quip_tw != null:
			_quip_tw.kill()
		_quip_l.text = "\u201C%s\u201D" % quip
		_quip_l.visible_ratio = 0.0
		_quip_box.visible = true
		_quip_box.modulate.a = 1.0
		_quip_tw = create_tween()
		_quip_tw.tween_property(_quip_l, "visible_ratio", 1.0, clampf(quip.length() * 0.028, 0.45, 1.3))
		_quip_tw.tween_interval(2.4)
		Motion.ease_exit(_quip_tw, _quip_box, "modulate:a", 0.0, 0.4)
		_quip_tw.tween_callback(func() -> void: _quip_box.visible = false)

	## Face down under its seal (the pull starts here).
	func seal_up() -> void:
		sealed = true
		revealed = false
		face.visible = false
		stamp_layer.visible = false
		linger = 0.0
		set_process(true)
		queue_redraw()

	func _process(delta: float) -> void:
		_t += delta
		if beam >= 0.0 or not _sparks.is_empty():
			for s: Dictionary in _sparks:
				s["life"] = float(s["life"]) + delta
				s["v"] = (s["v"] as Vector2) * (1.0 - 1.6 * delta) + Vector2(0, -40.0 * delta)
				s["p"] = (s["p"] as Vector2) + (s["v"] as Vector2) * delta
			_sparks = _sparks.filter(func(s: Dictionary) -> bool: return float(s["life"]) < float(s["max"]))
			fx.queue_redraw()
		if sealed and tell > 0.0:
			queue_redraw()
		if not sealed and beam < 0.0 and _sparks.is_empty():
			set_process(false)

	## The seal's tell in its rarity's colour, rising to `to` over `dur`.
	func tell_to(to: float, dur: float) -> Tween:
		var tw: Tween = create_tween()
		Motion.ease_rise(tw, self, "tell", to, dur)
		return tw

	## Turn it over: a squeeze to nothing across, the face, back out (a
	## legendary breaks open as it lands, burst()). Once only.
	func flip(quick: bool = false, crack: bool = false) -> Tween:
		if _flipping or not sealed:
			return null
		_flipping = true
		if crack:
			Sound.wax_crack()
		var tw: Tween = create_tween()
		var half: float = 0.08 if quick else 0.11
		Motion.ease_exit(tw, self, "scale:x", 0.0, half)
		tw.tween_callback(_turned)
		Motion.ease_rise(tw, self, "scale:x", 1.0, half + 0.05)
		return tw

	func _turned() -> void:
		_flipping = false
		sealed = false
		revealed = true
		tell = 0.0
		face.visible = true
		stamp_layer.visible = true
		queue_redraw()
		Sound.card_flip()
		if is_new:
			new_k = 0.0
			var tn: Tween = create_tween()
			tn.tween_interval(0.12)
			tn.tween_property(self, "new_k", 1.0, 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
			tn.parallel().tween_method(func(_v: float) -> void: stamp_layer.queue_redraw(), 0.0, 1.0, 0.18)
		if speak:
			say()
		if rar >= 3:
			var tw: Tween = create_tween()
			Motion.ease_fade(tw, self, "linger", 1.0, 0.5)
			tw.parallel().tween_method(func(_v: float) -> void: queue_redraw(), 0.0, 1.0, 0.5)
		if rar >= 4:
			burst()

	## THE LEGENDARY BREAKS OPEN: a gold column of light up through the card
	## and a spray of sparks off the seal, drawn on the card itself.
	func burst() -> void:
		set_process(true)
		beam = 0.0
		var tw: Tween = create_tween()
		tw.tween_property(self, "beam", 1.0, 1.8).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		tw.tween_callback(func() -> void: beam = -1.0)
		for i: int in 46:
			var a: float = -PI / 2.0 + randf_range(-1.25, 1.25)
			_sparks.append({ "p": CARD / 2.0 + Vector2(randf_range(-20, 20), randf_range(-14, 14)), "v": Vector2.from_angle(a) * randf_range(90.0, 320.0), "life": 0.0, "max": randf_range(0.6, 1.4), "w": randf_range(5.0, 13.0) })

	## The ABOARD stamp, thumped on.
	func stamp_on() -> void:
		stamp = 0.0
		var tw: Tween = create_tween()
		tw.tween_property(self, "stamp", 1.0, 0.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.parallel().tween_method(func(_v: float) -> void: stamp_layer.queue_redraw(), 0.0, 1.0, 0.2)
		tw.tween_callback(func() -> void: Sound.seal(false))

	func _box(fill: Color, rim: Color, rim_w: int) -> StyleBoxFlat:
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = fill
		sb.set_corner_radius_all(Kit.R_SMALL)
		sb.border_color = rim
		sb.set_border_width_all(rim_w)
		sb.anti_aliasing = true
		return sb

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		# The glow that stays behind an epic or a legendary.
		if linger > 0.0 and not sealed:
			var g: float = 1.0 if rar >= 4 else 0.7
			draw_texture_rect(FxSheet.glow(), r.grow_individual(70 * g, 60 * g, 70 * g, 60 * g), false, Color(rc, 0.32 * linger * g))
		if sealed:
			var jig: Vector2 = Vector2.ZERO
			if rar >= 4 and tell > 0.3:
				# A legendary's seal strains (the card only, a pixel or two).
				jig = Vector2(sin(_t * 47.0), cos(_t * 39.0)) * 1.4 * (tell - 0.3)
			draw_set_transform(jig, 0.0, Vector2.ONE)
			_draw_tell_back(r)
			draw_style_box(_box(BACK, Color(Paper.NIGHT_INK, 0.22), 1), r)
			# A plain inner border, the card's back.
			draw_style_box(_box(Color(0, 0, 0, 0), Color(Paper.NIGHT_INK, 0.1), 1), r.grow(-10))
			_draw_seal(size / 2.0)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			return
		# A plain hairline: the rarity is the glow behind the painting, never
		# the card's edge (Kong, 2026-10-10: coloured borders "look cheap").
		draw_style_box(_box(FACE, Color(Paper.NIGHT_INK, 0.22), 1), r)
		if chosen:
			draw_style_box(soft_ring(Kit.R_SMALL), r)

	## The tell behind the seal: none for a common; a soft shimmer for a rare;
	## rays for an epic; for a legendary, longer rays in gold and a glow that
	## swells while it is held.
	func _draw_tell_back(r: Rect2) -> void:
		if tell <= 0.0 or rar <= 1:
			return
		var c0: Vector2 = r.size / 2.0
		var col: Color = rc if rar < 4 else rc.lightened(0.25)
		var breathe: float = 0.85 + 0.15 * sin(_t * (6.0 if rar == 2 else 4.0))
		var gw: float = (120.0 if rar == 2 else (170.0 if rar == 3 else 260.0)) * breathe * tell
		draw_texture_rect(FxSheet.glow(), Rect2(c0 - Vector2(gw, gw), Vector2(gw, gw) * 2.0), false, Color(col, 0.55 * tell))

	func _draw_seal(at: Vector2) -> void:
		var col: Color = rc if rar < 4 else rc.lightened(0.25)
		# Rays from the seal (epic and legendary), over the card's back.
		if tell > 0.0 and rar >= 3:
			var n: int = 10 if rar == 3 else 14
			var reach: float = (56.0 if rar == 3 else 120.0) * tell
			for i: int in n:
				var a: float = _t * (0.35 if rar == 3 else 0.6) + TAU * i / float(n)
				var d: Vector2 = Vector2.from_angle(a)
				var side: Vector2 = d.orthogonal() * (5.0 if rar == 3 else 7.0)
				var p0: Vector2 = at + d * 24.0
				var p1: Vector2 = at + d * (24.0 + reach * (0.75 + 0.25 * sin(_t * 5.0 + i)))
				draw_colored_polygon(PackedVector2Array([p0 + side, p0 - side, p1]), Color(col, 0.55 * tell))
		if tell > 0.0 and rar >= 2:
			draw_texture_rect(FxSheet.glow(), Rect2(at - Vector2(54, 54), Vector2(108, 108)), false, Color(col, 0.8 * tell))
		# The wax: a blob with an uneven edge, a pressed ring and a mark.
		var pts: PackedVector2Array = PackedVector2Array()
		for i: int in 28:
			var a: float = TAU * i / 28.0
			var rad: float = 25.0 * (1.0 + 0.07 * sin(a * 5.0 + 0.7) + 0.04 * sin(a * 9.0 + 2.0))
			pts.append(at + Vector2(cos(a), sin(a)) * rad)
		var wax: Color = WAX.lerp(col, 0.25 * tell) if rar >= 2 else WAX
		draw_colored_polygon(pts, wax)
		draw_arc(at, 16.0, 0.0, TAU, 32, wax.darkened(0.3), 2.0, true)
		draw_arc(at, 16.0, -2.2, -0.6, 12, wax.lightened(0.25), 1.2, true)
		var star: PackedVector2Array = PackedVector2Array()
		for i: int in 8:
			var a2: float = -PI / 2.0 + TAU * i / 8.0
			star.append(at + Vector2.from_angle(a2) * (9.0 if i % 2 == 0 else 3.5))
		draw_colored_polygon(star, wax.darkened(0.25))

	func _draw_fx() -> void:
		if beam >= 0.0:
			var gold: Color = CrewHall.rarity_color(4).lightened(0.35)
			var a: float = minf(1.0, beam * 6.0) * (1.0 - smoothstep(0.35, 1.0, beam))
			var cx: float = size.x / 2.0
			var top: float = -260.0
			var w: float = size.x * (0.55 + 0.3 * beam)
			fx.draw_texture_rect(FxSheet.glow(), Rect2(cx - w, top, w * 2.0, size.y - top + 40.0), false, Color(gold, 0.5 * a))
			fx.draw_texture_rect(FxSheet.glow(), Rect2(cx - w * 0.28, top, w * 0.56, size.y - top + 20.0), false, Color(gold, 0.9 * a))
			fx.draw_texture_rect(FxSheet.glow(), Rect2(size / 2.0 - Vector2(150, 150), Vector2(300, 300)), false, Color(gold, 0.7 * a))
		for s: Dictionary in _sparks:
			var u: float = float(s["life"]) / float(s["max"])
			var w2: float = float(s["w"]) * (1.0 - u * 0.6)
			fx.draw_texture_rect(FxSheet.glow(), Rect2((s["p"] as Vector2) - Vector2(w2, w2), Vector2(w2, w2) * 2.0), false, Color(CrewHall.rarity_color(4).lightened(0.4), 1.0 - u))

	func _draw_stamp() -> void:
		if new_k >= 0.0:
			_draw_new()
		if stamp < 0.0:
			return
		var red: Color = Paper.NIGHT_RED
		var s: float = lerpf(1.8, 1.0, stamp)
		var a: float = clampf(stamp * 1.6, 0.0, 1.0) * 0.92
		var f: Font = Kit.role_font("display_sm")
		var px: int = 30
		var tw: float = f.get_string_size("ABOARD", HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
		stamp_layer.draw_set_transform(size / 2.0 + Vector2(0, -18), -0.2, Vector2(s, s))
		var box: Rect2 = Rect2(-tw / 2.0 - 12, -28, tw + 24, 42)
		stamp_layer.draw_rect(box, Color(red, a), false, 3.0)
		stamp_layer.draw_rect(box.grow(-5), Color(red, a * 0.6), false, 1.2)
		stamp_layer.draw_string(f, Vector2(-tw / 2.0, 3), "ABOARD", HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color(red, a))
		stamp_layer.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


	## NEW: a small ink stamp at the painting's top left, thumped on as the
	## card turns (in the chosen ink, never a rarity's colour).
	func _draw_new() -> void:
		var ink: Color = Paper.CHOSEN
		var s: float = lerpf(1.7, 1.0, new_k)
		var a: float = clampf(new_k * 1.6, 0.0, 1.0)
		var f: Font = Kit.role_font("name_strong")
		var px: int = 13
		var tw: float = f.get_string_size("NEW", HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
		stamp_layer.draw_set_transform(Vector2(40, 30), -0.14, Vector2(s, s))
		var box: Rect2 = Rect2(-tw / 2.0 - 7, -11, tw + 14, 21)
		stamp_layer.draw_rect(box, Color(0.1, 0.085, 0.07, 0.85 * a))
		stamp_layer.draw_rect(box, Color(ink, a), false, 1.6)
		stamp_layer.draw_string(f, Vector2(-tw / 2.0, 5), "NEW", HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color(ink, a))
		stamp_layer.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


# ── The board ─────────────────────────────────────────────────────────────────

## THE BOARD: the notice it was posted from (a flat paper sheet pinned up, its
## name and the countdown to the free board in a strip along its top) and the
## three cards across it (each signs from its own bar since 2026-10-11, so no
## button sits under it). It lays its own children (no container) so the
## cards can slide, fly and flip.
class Stage:
	extends Control
	signal finished
	var title: String = ""
	var countdown: Label
	var cards: Array = []
	var revealing: bool = false
	## Torn down for a fresh board (a press then has nothing to skip).
	var torn: bool = false
	var _tw: Tween
	## The sheet slamming on (0 to 1; 1 is at rest).
	var slam: float = 1.0
	var _title_l: Label

	func _init(t: String) -> void:
		title = t
		mouse_filter = Control.MOUSE_FILTER_PASS
		custom_minimum_size = Vector2(3 * CARD.x + 2 * GAP + 2 * PAD, STRIP + CARD.y + PAD * 2.0 + 6.0)
		size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_title_l = Kit.text(self, title.to_upper(), "eyebrow", Paper.NIGHT_INK_SOFT)
		_title_l.position = Vector2(PAD + 4, 12)
		countdown = Kit.text(self, "", "small", Paper.NIGHT_INK_SOFT)
		countdown.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		resized.connect(_lay)

	func add_card(cd: Card) -> void:
		cards.append(cd)
		add_child(cd)
		_lay()

	## A signed card taken off the board to fly (the hall flies it): the
	## stage stops laying it.
	func let_go(cd: Card) -> void:
		cards.erase(cd)

	func _slot(i: int) -> Vector2:
		var w: float = 3 * CARD.x + 2 * GAP
		return Vector2((size.x - w) / 2.0 + i * (CARD.x + GAP), STRIP + 4.0)

	func _lay() -> void:
		countdown.position = Vector2(size.x / 2.0, 12)
		countdown.size = Vector2(size.x / 2.0 - PAD - 4, 18)
		for i: int in cards.size():
			var cd: Card = cards[i]
			cd.home = _slot(i)
			if not revealing:
				cd.lift = cd.lift
		queue_redraw()

	func _draw() -> void:
		# The notice, pinned up: a flat sheet a shade off the room's paper, a
		# hair of rim. Slamming on, it lands from a touch large.
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var k: float = slam
		var sc: float = lerpf(1.08, 1.0, k)
		draw_set_transform(size / 2.0, (1.0 - k) * 0.03, Vector2(sc, sc))
		r.position -= size / 2.0
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = Color(SHEET, clampf(k * 3.0, 0.0, 1.0))
		sb.set_corner_radius_all(Kit.R_LARGE)
		sb.border_color = Color(Paper.NIGHT_INK, 0.12 * clampf(k * 3.0, 0.0, 1.0))
		sb.set_border_width_all(1)
		sb.anti_aliasing = true
		draw_style_box(sb, r)
		draw_line(r.position + Vector2(PAD, STRIP - 2), r.position + Vector2(r.size.x - PAD, STRIP - 2), Color(Paper.NIGHT_INK, 0.08), 1.0)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	## Everything at rest: face up, in place.
	func rest() -> void:
		for cd: Card in cards:
			cd.home = _slot(cards.find(cd))
			cd.position = cd.home

	## THE PULL, or the free board's light version. order: which cards turn
	## when (a legendary always last).
	func run(mode: String) -> void:
		revealing = true
		var order: Array = []
		for i: int in cards.size():
			if (cards[i] as Card).rar < 4:
				order.append(i)
		for i: int in cards.size():
			if (cards[i] as Card).rar >= 4:
				order.append(i)
		for i: int in cards.size():
			var cd: Card = cards[i]
			cd.set_locked(true)
			cd.speak = true
			cd.seal_up()
			cd.modulate.a = 0.0
			cd.position = _slot(i) + (Vector2(0, 46) if mode == "pull" else Vector2(36, 0))
		var pull: bool = mode == "pull"
		_tw = create_tween()
		if pull:
			slam = 0.0
			_title_l.modulate.a = 0.0
			_tw.tween_property(self, "slam", 1.0, 0.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
			_tw.parallel().tween_method(func(_v: float) -> void: queue_redraw(), 0.0, 1.0, 0.2)
			_tw.tween_callback(func() -> void:
				Sound.seal(false)
				Rumble.buzz([0, 25])
				var t2: Tween = create_tween()
				Motion.ease_fade(t2, _title_l, "modulate:a", 1.0, Motion.WORD_IN))
			_tw.tween_interval(0.12)
		# The cards come in, one after another.
		for i: int in cards.size():
			var cd: Card = cards[i]
			_tw.tween_callback(func() -> void:
				var t3: Tween = create_tween().set_parallel()
				Motion.ease_rise(t3, cd, "position", _slot(cards.find(cd)), 0.3)
				Motion.ease_fade(t3, cd, "modulate:a", 1.0, 0.18)
				if pull:
					Sound.plip())
			_tw.tween_interval(0.09)
		_tw.tween_interval(0.4 if pull else 0.25)
		for j: int in order.size():
			var cd2: Card = cards[order[j]]
			if not pull:
				_tw.tween_callback(func() -> void: cd2.flip(true))
				_tw.tween_interval(0.14)
				continue
			match cd2.rar:
				1:
					_tw.tween_interval(0.12)
				2:
					_tw.tween_callback(func() -> void:
						cd2.tell_to(1.0, 0.35)
						Sound.job_tick(5))
					_tw.tween_interval(0.5)
				3:
					_tw.tween_callback(func() -> void:
						cd2.tell_to(1.0, 0.5)
						Sound.charge())
					_tw.tween_interval(0.8)
				_:
					# The held pause, then the seal straining in gold.
					_tw.tween_interval(0.45)
					_tw.tween_callback(func() -> void:
						cd2.tell_to(1.0, 1.1)
						Sound.charge())
					_tw.tween_interval(1.35)
			_tw.tween_callback(func() -> void:
				cd2.flip(false, true)
				_turn_sound(cd2))
			_tw.tween_interval(0.3 if cd2.rar < 4 else 0.9)
		_tw.tween_callback(_end)

	## Over the card's own crack and flip: a rare's pluck, an epic's chest
	## chord, a legendary's fanfare.
	static func _turn_sound(cd: Card) -> void:
		match cd.rar:
			1:
				pass
			2:
				Sound.job_tick(9)
			3:
				Sound.chest(false)
				Rumble.buzz([0, 30])
			_:
				Sound.fanfare()
				Rumble.buzz([0, 40, 40, 80])

	## A press during the reveal: every card left turns at once.
	func skip() -> void:
		if not revealing or torn:
			return
		if _tw != null:
			_tw.kill()
		slam = 1.0
		_title_l.modulate.a = 1.0
		queue_redraw()
		for i: int in cards.size():
			var cd: Card = cards[i]
			cd.modulate.a = 1.0
			cd.position = _slot(i)
			cd.tell = 0.0
			if cd.sealed:
				cd.flip(true)
				cd.tell = 0.0
				if cd.rar >= 4:
					Sound.fanfare()
		_end()

	func _end() -> void:
		revealing = false
		for cd: Card in cards:
			cd.set_locked(false)
		finished.emit()

	## THE OLD BOARD TORN DOWN: each card flies up and off, a little turned,
	## one after another. The tween, to wait on.
	func tear_down() -> Tween:
		revealing = true
		torn = true
		if _tw != null:
			_tw.kill()
		var tw: Tween = create_tween().set_parallel()
		for i: int in cards.size():
			var cd: Card = cards[i]
			cd.set_locked(true)
			cd.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var dir: float = float(i - 1)
			Motion.ease_exit(tw, cd, "position", cd.position + Vector2(dir * 70.0, -120.0), 0.3).set_delay(i * 0.05)
			Motion.ease_exit(tw, cd, "rotation", dir * 0.22 + 0.06, 0.3).set_delay(i * 0.05)
			Motion.ease_exit(tw, cd, "modulate:a", 0.0, 0.3).set_delay(i * 0.05)
		Motion.ease_exit(tw, _title_l, "modulate:a", 0.0, 0.15)
		Sound.whoosh()
		return tw
