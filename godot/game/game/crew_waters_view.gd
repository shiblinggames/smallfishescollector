class_name CrewWatersView
extends Control
## FISHING TOGETHER, ON THIS GAME'S SCREEN (game/crew_fishing.gd runs it on
## the founder's): a crewmate's catch popping over their ship, words on the
## water; the crew's callouts in the HUD's toast lane (queued with the other
## toasts, held while the dial is up); the crew streak as motes rising round
## every hull in it, with its count; and a derby's standings and clock at the
## right, under the top-right column and its notes, your own row in gold.
## Flat words, no boxes, no icons.
##
## THE DERBY FINISH (ENDING TOGETHER, Kong, 2026-10-11): when a derby ends the
## final standings hold FINISH_HOLD seconds where the live ones stood, the
## winner lettered larger and a small burst of gold motes over their hull on
## the water, and a line for you ("You came 2nd"); then they fade.

var sea: Sea
var fishing: CrewFishing
var my_key: String = ""

var _pops: Array = []
var _calls: Array = []
## A beat between callouts handed to the toast lane.
var _call_t: float = 0.0
var _streak_l: Label
var _derby_box: VBoxContainer
var _derby_title: Label
## The standings' rows (rebuilt with each state), and the finish's clock.
var _derby_lines: Array = []
const FINISH_HOLD: float = 6.0
const FINISH_FADE: float = 0.6
var _finish_t: float = -1.0
var _winner: String = ""
var _t: float = 0.0
## Whether the last frame drew anything (one more redraw clears it).
var _drew: bool = false
## The crew streak's count, this far under her hull's centre on the screen.
const STREAK_W: float = 400.0
const STREAK_BELOW: float = 78.0
## How long the winner's burst and words stay over their hull.
const BURST_S: float = 3.2


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_streak_l = _label(18, Kit.SEA_GOLD)
	# Under her own hull (co-op walkthrough, 2026-10-11: fixed at the top
	# centre it sat at the catch word's height, and your own "+7 XP" rose
	# through it into a smear). It follows the boat in _process.
	_streak_l.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	_streak_l.size = Vector2(STREAK_W, 28)
	_streak_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_streak_l.visible = false
	_derby_box = VBoxContainer.new()
	_derby_box.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	_derby_box.offset_left = -330
	_derby_box.offset_right = -24
	_derby_box.offset_top = 150
	_derby_box.offset_bottom = 360
	_derby_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_derby_box.add_theme_constant_override("separation", 2)
	add_child(_derby_box)
	_derby_title = _label(17, Kit.SEA_GOLD, _derby_box)
	_derby_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_derby_box.visible = false
	fishing.popped.connect(_on_pop)
	fishing.called.connect(_on_call)
	fishing.streak_changed.connect(func(_n: int, _k: Array) -> void: _paint_streak())
	fishing.derby_changed.connect(func(_st: Dictionary) -> void: _paint_derby())
	_paint_streak()
	_paint_derby()


func _label(px: int, col: Color, parent: Node = self) -> Label:
	var l: Label = Label.new()
	l.add_theme_font_override("font", Kit.font("cinzel", 700))
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(l)
	# Lettering on the water, in the one recipe.
	Kit.lift(l)
	return l


func _on_pop(key: String, pop: Dictionary) -> void:
	# Your own catch has its own moment; the pops are the crew's.
	if key == my_key:
		return
	var text: String = str(pop.get("name", ""))
	if Js.num(pop.get("size")) > 0.0:
		text += "  %s in" % Js.thousands(round(Js.num(pop["size"])))
	_pops.append({ "key": key, "text": text, "golden": pop.get("golden", false), "t": 0.0 })


func _on_call(text: String, about: String) -> void:
	# The catcher hears about their own catch from their own screens.
	if about != "" and about == my_key:
		return
	_calls.append(text)


func _paint_streak() -> void:
	var n: int = fishing.streak
	_streak_l.visible = n >= 2 and fishing.streak_keys.has(my_key)
	_streak_l.text = "Crew streak  %d" % n


func _paint_derby() -> void:
	var st: Dictionary = fishing.derby
	for l: Variant in _derby_lines:
		(l as Node).queue_free()
	_derby_lines.clear()
	_derby_box.modulate.a = 1.0
	_derby_box.visible = not st.is_empty()
	if st.is_empty():
		_finish_t = -1.0
		return
	var rows: Array = Js.list(st.get("rows"))
	var final: bool = st.get("final", false) == true
	_finish_t = 0.0 if final else -1.0
	_winner = str(Js.obj(rows[0]).get("key", "")) if final and not rows.is_empty() else ""
	if final:
		_derby_title.text = "Derby over: %s" % st.get("title", "")
		# The winner, lettered larger.
		if not rows.is_empty():
			var w0: Dictionary = rows[0]
			_line("%s won" % ("You" if str(w0.get("key", "")) == my_key else str(w0.get("name", "?"))), 26, Kit.SEA_GOLD)
			_line(str(w0.get("label", "")), 15, Kit.SEA_INK)
		else:
			_line("Nobody landed a thing", 18, Kit.SEA_INK)
	# The standings (the winner's row is the line above, at the finish); your
	# own row marked, and kept on the board below the top four.
	var mine_at: int = -1
	for i: int in rows.size():
		if str(Js.obj(rows[i]).get("key", "")) == my_key:
			mine_at = i
	var first: int = 1 if final else 0
	var shown: int = 0
	for i2: int in range(first, rows.size()):
		if shown >= 4 and i2 != mine_at:
			continue
		var r: Dictionary = rows[i2]
		var me: bool = i2 == mine_at
		_line("%d.  %s   %s" % [i2 + 1, "You" if me else str(r.get("name", "?")), r.get("label", "")], 15, Kit.SEA_GOLD if me else Kit.SEA_INK)
		shown += 1
	if rows.is_empty() and not final:
		_line("No catches yet", 15, Kit.SEA_INK)
	if final and mine_at > 0:
		_line("You came %s" % _ordinal(mine_at + 1), 18, Kit.SEA_GOLD)
	elif final and mine_at < 0 and not rows.is_empty():
		_line("You did not land one this time", 15, Kit.SEA_INK)
	if final:
		Sound.streak(3)


func _line(t: String, px: int, col: Color) -> void:
	var l: Label = _label(px, col, _derby_box)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	l.text = t
	_derby_lines.append(l)
	# The finish's lines come up one after another; the live board just changes.
	if _finish_t >= 0.0:
		Motion.rise_word(l, 0.06 * _derby_lines.size())


static func _ordinal(n: int) -> String:
	var suf: String = "th"
	if n % 100 < 11 or n % 100 > 13:
		suf = { 1: "st", 2: "nd", 3: "rd" }.get(n % 10, "th")
	return "%d%s" % [n, suf]


func _node_of(key: String) -> Node2D:
	if key == my_key:
		return sea._boat
	return sea._mates.get(key)


func _hud() -> FishingHud:
	return sea._hud if sea != null else null


func _process(delta: float) -> void:
	_t += delta
	var hud: FishingHud = _hud()
	var dial_up: bool = hud != null and hud._dial != null and hud._dial.visible
	# The callouts go to the toast lane, a beat apart, and wait while the
	# dial is up (the fight has the screen).
	_call_t = maxf(0.0, _call_t - delta)
	if _call_t <= 0.0 and not _calls.is_empty() and not dial_up and hud != null:
		hud.toast(str(_calls.pop_front()))
		_call_t = 1.2
	# The streak's count steps aside while the dial is up (it sat on the ring).
	_streak_l.modulate.a = move_toward(_streak_l.modulate.a, 0.0 if dial_up else 1.0, delta * Motion.NEAR_RATE)
	if _streak_l.visible and sea != null and is_instance_valid(sea._boat):
		var hull: Vector2 = get_global_transform_with_canvas().affine_inverse() * sea._boat.get_global_transform_with_canvas().origin
		_streak_l.position = hull + Vector2(-STREAK_W / 2.0, STREAK_BELOW)
	# The derby sits under the top-right column and any note there.
	if hud != null:
		var y: float = hud.notes_bottom()
		_derby_box.offset_top = lerpf(_derby_box.offset_top, y, Motion.hover_k(delta))
		_derby_box.offset_bottom = _derby_box.offset_top + 210.0
	if _derby_box.visible and _finish_t < 0.0:
		var left: float = maxf(0.0, Js.num(fishing.derby.get("left")) - float(Time.get_ticks_msec() - fishing.derby_got_ms) / 1000.0)
		_derby_title.text = "Derby: %s   %d:%02d" % [fishing.derby.get("title", ""), int(left) / 60, int(left) % 60]
	# The finish holds, then fades away (the standings go with it).
	if _finish_t >= 0.0:
		_finish_t += delta
		_derby_box.modulate.a = 1.0 - smoothstep(FINISH_HOLD, FINISH_HOLD + FINISH_FADE, _finish_t)
		if _finish_t > FINISH_HOLD + FINISH_FADE:
			_finish_t = -1.0
			_winner = ""
			_derby_box.visible = false
	for p: Dictionary in _pops:
		p["t"] = float(p["t"]) + delta
	_pops = _pops.filter(func(p: Dictionary) -> bool: return float(p["t"]) < 2.6)
	# Only redrawn while there is something to draw (a pop, a streak), and
	# once more after, to clear the last of it.
	var drawing: bool = not _pops.is_empty() or fishing.streak >= 2 or (_winner != "" and _finish_t < BURST_S + 0.1)
	if drawing or _drew:
		queue_redraw()
	_drew = drawing


func _draw() -> void:
	var font: Font = Kit.font("cinzel", 700)
	for p: Dictionary in _pops:
		var n: Node2D = _node_of(str(p["key"]))
		if n == null or not is_instance_valid(n):
			continue
		var t: float = float(p["t"])
		var at: Vector2 = n.get_global_transform_with_canvas().origin + Vector2(0, -150.0 - 40.0 * t)
		var a: float = clampf(minf(t / 0.2, (2.6 - t) / 0.5), 0.0, 1.0)
		var col: Color = Kit.SEA_GOLD if p["golden"] else Kit.SEA_INK
		var w: float = font.get_string_size(str(p["text"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
		Kit.sea_string(self, font, at - Vector2(w / 2.0, 0), str(p["text"]), 20, col, HORIZONTAL_ALIGNMENT_LEFT, -1.0, a)
	# The derby's winner: a small burst of gold motes over their hull, and the
	# words on the water, local to them (no screen-wide flash).
	if _winner != "" and _finish_t >= 0.0 and _finish_t < BURST_S:
		var wn: Node2D = _node_of(_winner)
		if wn != null and is_instance_valid(wn):
			var c0: Vector2 = wn.get_global_transform_with_canvas().origin + Vector2(0, -90)
			var u: float = clampf(_finish_t / BURST_S, 0.0, 1.0)
			var fade: float = 1.0 - smoothstep(0.55, 1.0, u)
			for q: int in 22:
				var ang: float = TAU * q / 22.0 + float(q % 3) * 0.4
				var spd: float = 70.0 + 50.0 * float((q * 7) % 5) / 4.0
				var d: float = spd * (1.0 - pow(1.0 - u, 3.0))
				var p: Vector2 = c0 + Vector2(cos(ang), sin(ang) * 0.7) * d + Vector2(0, 40.0 * u * u)
				draw_circle(p, 2.6 * (1.0 - u) + 0.8, Color(Kit.SEA_GOLD, fade))
			var word: String = "Derby winner"
			var ww: float = font.get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
			Kit.sea_string(self, font, c0 + Vector2(-ww / 2.0, -36.0 - 14.0 * u), word, 22, Kit.SEA_GOLD, HORIZONTAL_ALIGNMENT_LEFT, -1.0, clampf(minf(_finish_t / 0.25, (BURST_S - _finish_t) / 0.6), 0.0, 1.0))
	# The crew streak: motes rising off the water round every hull in it, more
	# as it climbs.
	var n2: int = fishing.streak
	if n2 >= 2:
		var count: int = mini(6 + n2 * 2, 40)
		for k: Variant in fishing.streak_keys:
			var hull: Node2D = _node_of(str(k))
			if hull == null or not is_instance_valid(hull):
				continue
			var c: Vector2 = hull.get_global_transform_with_canvas().origin
			var salt: float = float(str(k).hash() % 97)
			for i: int in count:
				var seed: float = float(i) * 12.9898 + salt
				var x: float = fmod(abs(sin(seed) * 43758.5453), 1.0)
				var life: float = fmod(_t * (0.35 + 0.25 * x) + x * 3.0, 1.0)
				var pos: Vector2 = c + Vector2((x - 0.5) * 220.0, 30.0 - life * 150.0)
				draw_circle(pos, 1.6 + 2.2 * x, Color(Kit.SEA_GOLD, (1.0 - life) * 0.75 * sin(life * PI)))
