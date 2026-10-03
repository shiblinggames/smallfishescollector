class_name PuzzleBoard
extends Control
## A CAMPAIGN PUZZLE'S BOARD (the five boards of app/(app)/expeditions:
## the beacon chain, the cipher dials, the mirror run, the cargo shuffle and
## the tumbler lock). Each is its own script; make() picks it by the node's
## puzzle kind (no kind is the beacon chain, as on the web). finished(solved)
## when it is cracked or put down.
##
## This holds what the five share: the night paper over the sea, the board
## on the left (drawn by the board's own script), the name, the how-to, the
## counters and the buttons on the right; the shake of a busted budget, the
## flash between stages, and the solve (a moment, then the reveal on the
## paper and "Log it"). Each board keeps its rules as static funcs, so the
## rules can be checked headless (tests/puzzle_check.gd).

signal finished(solved: bool)

const GOLD: Color = Color(0.98, 0.76, 0.33)
const HOT: Color = Color(1.0, 0.92, 0.7)
const STEEL: Color = Color(0.62, 0.71, 0.82)
## Sized to sit clear of the sea's HUD (the top bar, the pills, the dock).
const SHEET: Vector2 = Vector2(1160, 690)

var puzzle: Dictionary = {}
## The board, drawn by draw_board() and pressed through board_input().
var canvas: Control
var side: VBoxContainer
var count_l: Label
var note_l: Label
var reset_b: Pane.PaneButton
var t: float = 0.0
var won: bool = false
var won_at: float = -10.0
var _shake_at: float = -10.0
var _flash_text: String = ""
var _flash_at: float = -10.0
var _flash_len: float = 0.9
var _done: bool = false
var _sheet: Control


static func make(pz: Dictionary) -> PuzzleBoard:
	var kind: String = str(pz["kind"]) if pz.get("kind") != null else "beacon"
	var path: String = "res://game/puzzles/%s.gd" % kind
	if not ResourceLoader.exists(path):
		return null
	var b: PuzzleBoard = (load(path) as GDScript).new()
	b.puzzle = pz
	return b


# ── What each board gives ─────────────────────────────────────────────────────

func board_name() -> String:
	return "A Puzzle"


func how_to() -> String:
	return ""


func board_size() -> Vector2:
	return Vector2(400, 400)


## Read the puzzle and set up the board (before the paper is built).
func build() -> void:
	pass


## Extra buttons under the counters (night paper is on while this runs).
func extra(_box: VBoxContainer) -> void:
	pass


## The counters (count_l) and the line under them (note_l).
func words() -> void:
	pass


func draw_board() -> void:
	pass


func board_input(_e: InputEvent) -> void:
	pass


## A key on the board: true when the board used it.
func on_key(_e: InputEvent) -> bool:
	return false


func on_reset() -> void:
	pass


func tick(_delta: float) -> void:
	pass


# ── The paper ─────────────────────────────────────────────────────────────────

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	build()
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.06, 0.62)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(shade)
	_sheet = Control.new()
	_sheet.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_sheet.offset_left = -SHEET.x / 2.0
	_sheet.offset_right = SHEET.x / 2.0
	_sheet.offset_top = -SHEET.y / 2.0 + 18.0
	_sheet.offset_bottom = SHEET.y / 2.0 + 18.0
	add_child(_sheet)
	Paper.night = true
	Paper.sheet(_sheet, 8.0)
	var m: MarginContainer = MarginContainer.new()
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for s: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + s, 30)
	_sheet.add_child(m)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 30)
	m.add_child(row)
	var holder: CenterContainer = CenterContainer.new()
	holder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(holder)
	canvas = Control.new()
	canvas.custom_minimum_size = board_size()
	canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	canvas.draw.connect(_paint)
	canvas.gui_input.connect(board_input)
	holder.add_child(canvas)
	side = VBoxContainer.new()
	side.custom_minimum_size = Vector2(380, 0)
	side.add_theme_constant_override("separation", 10)
	row.add_child(side)
	Paper.text(side, "A PUZZLE ON THE WAY", "eyebrow", Paper.red())
	Paper.text(side, board_name(), "title", Paper.ink(), true)
	Paper.rule(side)
	Paper.text(side, how_to(), "note", Paper.ink_soft(), true)
	Paper.rule(side)
	count_l = Paper.text(side, "", "body_strong", Paper.ink(), true)
	note_l = Paper.text(side, "", "small", Paper.ink_soft(), true)
	extra(side)
	var gap: Control = Control.new()
	gap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side.add_child(gap)
	var btns: HBoxContainer = HBoxContainer.new()
	btns.add_theme_constant_override("separation", 8)
	btns.alignment = BoxContainer.ALIGNMENT_END
	side.add_child(btns)
	reset_b = Paper.button("Reset")
	reset_b.pressed.connect(func() -> void:
		if won:
			return
		Rumble.tap(10)
		on_reset()
		words())
	btns.add_child(reset_b)
	var down: Pane.PaneButton = Paper.button("Put it down  Esc")
	down.pressed.connect(put_down)
	btns.add_child(down)
	Paper.night = false
	words()
	Kit.modal_in(_sheet)


func put_down() -> void:
	if _done:
		return
	if won:
		log_it()
		return
	_done = true
	finished.emit(false)
	queue_free()


func log_it() -> void:
	if _done:
		return
	_done = true
	finished.emit(true)
	queue_free()


func _unhandled_input(e: InputEvent) -> void:
	if _done:
		return
	if e.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		put_down()
		return
	if won:
		if e.is_action_pressed("fish_act") and side.has_meta("revealed"):
			get_viewport().set_input_as_handled()
			log_it()
	elif on_key(e):
		get_viewport().set_input_as_handled()
		return
	# A board over the sea keeps the sea's own keys from reaching it.
	if e is InputEventKey:
		get_viewport().set_input_as_handled()


func _process(delta: float) -> void:
	t += delta
	tick(delta)
	canvas.queue_redraw()


func _paint() -> void:
	var k: float = t - _shake_at
	var off: float = 0.0
	if k < 0.4:
		off = sin(k * 52.0) * 8.0 * (1.0 - k / 0.4)
	canvas.draw_set_transform(Vector2(off, 0))
	draw_board()
	var f: float = t - _flash_at
	if f < _flash_len:
		var a: float = clampf(minf(f / 0.15, (_flash_len - f) / 0.2), 0.0, 1.0)
		canvas.draw_rect(Rect2(Vector2.ZERO, canvas.size), Color(0.08, 0.05, 0.02, 0.74 * a))
		var c: Vector2 = canvas.size / 2.0
		glow(c, 150.0, GOLD, 0.18 * a)
		ink(_flash_text, c, 34, Color(GOLD, a))


# ── What the boards call ──────────────────────────────────────────────────────

## A busted budget: the board shakes (and the board resets itself).
func shake() -> void:
	_shake_at = t
	Rumble.buzz([0, 40, 30, 60])
	Sound.slack()


## A stage done: its line across the board for a moment.
func flash(text: String, length: float = 0.9) -> void:
	_flash_text = text
	_flash_at = t
	_flash_len = length


## Solved. The moment, then the reveal on the paper.
func win() -> void:
	if won:
		return
	won = true
	won_at = t
	reset_b.disabled = true
	Sound.perfect()
	Rumble.buzz([0, 20, 30, 40])
	words()
	get_tree().create_timer(1.1).timeout.connect(_reveal)


func _reveal() -> void:
	if _done:
		return
	for c: Node in side.get_children():
		side.remove_child(c)
		c.queue_free()
	side.set_meta("revealed", true)
	Paper.night = true
	Paper.text(side, "CRACKED", "eyebrow", Paper.BRASS)
	Paper.text(side, board_name(), "title", Paper.ink(), true)
	Paper.rule(side)
	var rv: Variant = puzzle.get("reveal")
	var body: String = str(rv) if rv != null and str(rv) != "" else "Cracked. Log it in your book and sail on."
	var l: Label = Paper.text(side, body, "body", Paper.ink(), true)
	l.modulate.a = 0.0
	l.create_tween().tween_property(l, "modulate:a", 1.0, 0.5)
	var gap: Control = Control.new()
	gap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side.add_child(gap)
	var b: Pane.PaneButton = Paper.button("Log it", true)
	b.size_flags_horizontal = Control.SIZE_SHRINK_END
	b.pressed.connect(log_it)
	side.add_child(b)
	Paper.night = false
	Sound.seal(true)


## Text centered on a point of the board.
func ink(s: String, at: Vector2, px: int, col: Color, family: String = "cinzel", weight: int = 800) -> void:
	var f: Font = Kit.font(family, weight)
	var sz: Vector2 = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, px)
	canvas.draw_string(f, Vector2(at.x - sz.x / 2.0, at.y + f.get_ascent(px) - sz.y / 2.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, col)


## A soft round glow (rings of thinning light).
func glow(c: Vector2, r: float, col: Color, strength: float) -> void:
	if strength <= 0.0:
		return
	for i: int in 7:
		var k: float = 1.0 - float(i) / 7.0
		canvas.draw_circle(c, r * k, Color(col, strength * 0.22))


## A rounded box (fill, and an edge when edge_w > 0).
func box(r: Rect2, fill: Color, radius: float, edge: Color = Color(0, 0, 0, 0), edge_w: float = 0.0) -> void:
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = fill
	sb.set_corner_radius_all(int(radius))
	sb.anti_aliasing = true
	if edge_w > 0.0:
		sb.set_border_width_all(int(edge_w))
		sb.border_color = edge
	canvas.draw_style_box(sb, r)
