class_name CrewPings
extends Control
## PINGS (Kong, 2026-10-06; the doc's "talking is pings and emotes, with
## Steam's own chat and voice"): hold G over the water and a small wheel of
## callouts opens round the pointer; slide toward one and let go to call it
## there (a tap calls "Look"). Everyone aboard sees it on that water, words
## and a ring opening, and on their compass while it lasts. Only in a Charter.
##
## CALL A DERBY (THE DEN AND THE WATER TOGETHER, Kong, 2026-10-11; the
## walkthrough: starting a derby was hidden in the Charter sheet): the wheel's
## fifth option, lower left. Let go on it and a small card on the night paper
## asks which derby (biggest fish or most species, or Not now); starting goes
## through the derby's own rules (Charter.run "crewDerby"), as the sheet's
## buttons do. While a derby is on the option reads "Derby on 7:12" and
## says where the standings are instead. It is not a ping: nothing is sent.
## The five sit evenly round the pointer (up, upper right, lower right, lower
## left, upper left), laid a little wider than tall so the words never meet.

const KINDS: Array = [
	["hotspot", "Hotspot here", Kit.SEA_GOLD],
	["here", "Over here", Color(0.6, 0.92, 0.88)],
	["help", "Need a hand", Color(1.0, 0.58, 0.42)],
	["derby", "Call a derby", Color(0.72, 0.84, 1.0)],
	## Look in a light cream of its own (co-op walkthrough, 2026-10-11: it
	## read dark on the night water beside the coloured three).
	["look", "Look", Color(1.0, 0.97, 0.9)],
]
const LIFE: float = 12.0
const GROUND: float = Chart.GROUND
## Where each of the five sits on the wheel: evenly round from straight up
## (up, upper right, lower right, lower left, upper left), in KINDS' order.
const DIRS: Array = [Vector2(0, -1), Vector2(0.951, -0.309), Vector2(0.588, 0.809), Vector2(-0.588, 0.809), Vector2(-0.951, -0.309)]
## How far the words sit from the pointer, across and up or down.
const SPREAD: Vector2 = Vector2(140.0, 80.0)
## The wheel opens and closes over this long.
const WHEEL_S: float = 0.12

var sea: Sea
## Live pings: { key, name, kind, at (world), t }.
var pings: Array = []
var _open: bool = false
var _held: float = 0.0
var _centre: Vector2 = Vector2.ZERO
var _pick: int = -1
var _last_sent: float = -9.0
var _t: float = 0.0
## How open the wheel is (0 shut, 1 open), and each option's size (1 at
## rest, larger when it is the one picked), eased rather than switched.
var _open_k: float = 0.0
var _opt_k: Array = [0.0, 0.0, 0.0, 0.0, 0.0]
var _card: Control = null
## THE ONE-TIME NOTE (co-op walkthrough, 2026-10-11: nothing ever taught G):
## the first time this machine is at sea with a crewmate aboard, a quiet line
## on the water says how to call them, once (remembered on this machine).
const HINT_PREF: String = "ping_hint_seen"
const HINT_AFTER: float = 3.0
const HINT_FOR: float = 7.0
var _hint_wait: float = 0.0
var _hint_t: float = -1.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if sea.net != null:
		sea.net.pinged.connect(_on_ping)
	# Under the HUD's own sheets (the Charter sheet, the chest): the pings
	# drew across them (co-op walkthrough, 2026-10-11). The sea's panels held
	# on this layer later stay above it as before.
	_under_hud.call_deferred()


func _under_hud() -> void:
	var hud: Node = sea._hud if sea != null else null
	if hud != null and is_instance_valid(hud) and hud.get_parent() == get_parent():
		get_parent().move_child(self, hud.get_index())


static func kind_of(id: String) -> Array:
	for k: Array in KINDS:
		if k[0] == id:
			return k
	return KINDS[KINDS.size() - 1]


func _on_ping(key: String, who: String, kind: String, at: Vector2) -> void:
	# One live ping a captain: a new one takes the place of their last.
	pings = pings.filter(func(p: Dictionary) -> bool: return p["key"] != key)
	pings.append({ "key": key, "name": who, "kind": kind, "at": at, "t": 0.0 })
	Sound.plip()


func _unhandled_input(e: InputEvent) -> void:
	if sea.net == null or sea.stage != null:
		return
	if e.is_action_pressed("ping") and not e.is_echo():
		_open = true
		_held = 0.0
		_centre = get_local_mouse_position()
		_pick = -1
		get_viewport().set_input_as_handled()
	elif e.is_action_released("ping") and _open:
		_open = false
		get_viewport().set_input_as_handled()
		var kind: String = "look" if _pick < 0 else str(KINDS[_pick][0])
		if kind == "derby":
			_derby()
		else:
			_send(kind, _centre)


func _send(kind: String, screen: Vector2) -> void:
	if _t - _last_sent < 1.2:
		return
	_last_sent = _t
	var world: Vector2 = sea._world.get_global_transform_with_canvas().affine_inverse() * (get_global_transform_with_canvas() * screen)
	sea.net.send_ping(kind, world)


func _process(delta: float) -> void:
	_t += delta
	_open_k = move_toward(_open_k, 1.0 if _open else 0.0, delta / WHEEL_S)
	for i: int in _opt_k.size():
		_opt_k[i] = move_toward(float(_opt_k[i]), 1.0 if (_open and i == _pick) else 0.0, delta * 18.0 / 3.0)
	if _open:
		_held += delta
		var off: Vector2 = get_local_mouse_position() - _centre
		_pick = -1
		if off.length() > 28.0:
			var best: float = -2.0
			for i: int in DIRS.size():
				var d: float = off.normalized().dot(DIRS[i])
				if d > best:
					best = d
					_pick = i
	for p: Dictionary in pings:
		p["t"] = float(p["t"]) + delta
	pings = pings.filter(func(p: Dictionary) -> bool: return float(p["t"]) < LIFE)
	_hint_step(delta)
	queue_redraw()


func _hint_step(delta: float) -> void:
	if _hint_t >= 0.0:
		_hint_t += delta
		if _hint_t > HINT_FOR:
			_hint_t = -1.0
		return
	if _hint_wait < 0.0:
		return
	if sea.net == null or sea._mates.is_empty() or sea.stage != null or sea._hud.busy():
		return
	_hint_wait += delta
	if _hint_wait < HINT_AFTER:
		return
	_hint_wait = -1.0
	if bool(Prefs.get_value(HINT_PREF, false)):
		return
	Prefs.set_value(HINT_PREF, true)
	_hint_t = 0.0


func _draw() -> void:
	var f_big: Font = Kit.font("cinzel", 800)
	var f_small: Font = Kit.font("karla", 700)
	var to_screen: Transform2D = get_global_transform_with_canvas().affine_inverse() * sea._world.get_global_transform_with_canvas()
	# The pings on the water.
	for p: Dictionary in pings:
		var k: Array = kind_of(str(p["kind"]))
		var col: Color = k[2]
		var t: float = float(p["t"])
		var a: float = clampf(minf(t / 0.2, (LIFE - t) / 1.5), 0.0, 1.0)
		var at: Vector2 = to_screen * (p["at"] as Vector2)
		# Rings opening on the water, quicker at first, then a slow pulse.
		draw_set_transform(at, 0.0, Vector2(1.0, GROUND))
		for i: int in 2:
			var u: float = fmod(t * (1.2 if t < 2.0 else 0.5) + i * 0.5, 1.0)
			draw_arc(Vector2.ZERO, 18.0 + 60.0 * u, 0.0, TAU, 40, Color(col, (1.0 - u) * 0.8 * a), 2.5, true)
		draw_circle(Vector2.ZERO, 6.0, Color(col, 0.9 * a))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		var title: String = str(k[1])
		var tw: float = f_big.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
		_text(f_big, at + Vector2(-tw / 2.0, -34), title, 20, Color(col, a))
		var who: String = str(p["name"])
		# The sender in the lifted cream of the water's lettering (it was a
		# small grey, hard to read on the water).
		var ww: float = f_small.get_string_size(who, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
		_text(f_small, at + Vector2(-ww / 2.0, -15), who, 14, Color(Kit.SEA_INK, a))
	# The wheel while G is held: it opens out over WHEEL_S and closes the
	# same way; the option picked grows to it and lights, rather than jumping.
	if _open_k > 0.0:
		var ok: float = _open_k * _open_k * (3.0 - 2.0 * _open_k)
		draw_circle(_centre, 4.0, Color(Kit.SEA_INK, 0.8 * ok))
		for i2: int in KINDS.size():
			var k2: Array = KINDS[i2]
			var pk: float = float(_opt_k[i2])
			var pos: Vector2 = _centre + (DIRS[i2] as Vector2) * SPREAD * lerpf(0.8, 1.0, ok)
			var s: String = _label_of(k2)
			var sc: float = lerpf(1.0, 19.0 / 16.0, pk)
			var sw: float = f_big.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
			draw_set_transform(pos, 0.0, Vector2.ONE * sc)
			_text(f_big, Vector2(-sw / 2.0, 6), s, 16, Color(k2[2], lerpf(0.82, 1.0, pk) * ok))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if _hint_t >= 0.0:
		var ha: float = clampf(minf(_hint_t / 0.6, (HINT_FOR - _hint_t) / 1.0), 0.0, 1.0)
		var line: String = "Hold G to call the crew"
		var hw: float = f_small.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
		_text(f_small, Vector2((size.x - hw) / 2.0, size.y * 0.66), line, 17, Color(Kit.SEA_INK, ha * 0.92))


## An option's words; the derby's say when one is on and how long it has left.
func _label_of(k: Array) -> String:
	if k[0] == "derby" and _derby_on():
		var left: float = Menus.derby_left(sea.net.fishing)
		return "Derby on %d:%02d" % [int(left) / 60, int(left) % 60]
	return str(k[1])


func _derby_on() -> bool:
	return sea.net != null and sea.net.fishing != null and Menus.running_derby(sea.net.fishing)


## "Call a derby" let go: the card, or (one on) where its standings are.
func _derby() -> void:
	if _derby_on():
		var left: float = Menus.derby_left(sea.net.fishing)
		sea._hud.toast("A derby is on: %d:%02d left. The standings are on the water at the right." % [int(left) / 60, int(left) % 60])
		return
	if sea._hud.busy() or (_card != null and is_instance_valid(_card)):
		return
	var p: Control = Control.new()
	p.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	p.theme = UiTheme.make()
	# A crew menu: the night paper, its primaries cream as they land.
	p.set_meta("night_root", true)
	Kit.scrim(p)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	p.add_child(center)
	var spec: Dictionary = Kit.modal(Kit.GOLD, 22)
	spec["night"] = true
	var card: Pane = Kit.pane(center, spec)
	card.custom_minimum_size = Vector2(460, 0)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	card.add_child(v)
	Kit.text(v, "Fishing together", "small", Dossier.SOFT)
	Kit.text(v, "Call a derby", "title")
	Kit.text(v, "Everyone aboard fishes for %d minutes, and the standings show on the water. Pick what wins." % int(CrewFishing.DERBY_S / 60.0), "body", Dossier.SOFT, true)
	var why: Label = Kit.text(v, "", "small", Paper.RED, true)
	why.visible = false
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	v.add_child(row)
	var close: Callable = func() -> void:
		if is_instance_valid(p):
			p.queue_free()
	var first: Button = null
	var picks: Array = []
	for kind: String in CrewFishing.DERBY_KINDS:
		var b: Button = Kit.button(str(CrewFishing.DERBY_KINDS[kind]).capitalize(), "primary")
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func() -> void:
			b.disabled = true
			var r: Variant = await sea.session.act("crewDerby", ["start", kind])
			if not is_instance_valid(p):
				return
			if r is Dictionary and (r as Dictionary).has("error"):
				b.disabled = false
				why.text = str(r["error"])
				why.visible = true
			else:
				close.call())
		row.add_child(b)
		picks.append(b)
		if first == null:
			first = b
	var no: Button = Kit.button("Not now", "secondary")
	no.pressed.connect(close)
	row.add_child(no)
	# Esc / B is Not now.
	SeaFinds.back_closes(p, close)
	_card = p
	sea._hold(p, sea._room_layer)
	Pane.set_night(card, true)
	# The night repaint lightens every button's words; the cream primaries
	# keep their dark ones.
	for pb: Button in picks:
		Kit._ink_all(pb, Paper.NIGHT_PAPER_DEEP)
	Kit.modal_in(card)
	first.grab_focus.call_deferred()


## Lettering on the water, in the one recipe (Kit.sea_string).
func _text(f: Font, at: Vector2, t: String, px: int, col: Color) -> void:
	Kit.sea_string(self, f, at, t, px, col)
