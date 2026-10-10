class_name CrewPings
extends Control
## PINGS (Kong, 2026-10-06; the doc's "talking is pings and emotes, with
## Steam's own chat and voice"): hold G over the water and a small wheel of
## callouts opens round the pointer; slide toward one and let go to call it
## there (a tap calls "Look"). Everyone aboard sees it on that water, words
## and a ring opening, and on their compass while it lasts. Only in a Charter.

const KINDS: Array = [
	["hotspot", "Hotspot here", Kit.SEA_GOLD],
	["here", "Over here", Color(0.6, 0.92, 0.88)],
	["help", "Need a hand", Color(1.0, 0.58, 0.42)],
	["look", "Look", Kit.SEA_INK],
]
const LIFE: float = 12.0
const GROUND: float = Chart.GROUND
## Where each of the four sits on the wheel (up, right, down, left).
const DIRS: Array = [Vector2(0, -1), Vector2(1, 0), Vector2(0, 1), Vector2(-1, 0)]
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
var _opt_k: Array = [0.0, 0.0, 0.0, 0.0]


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if sea.net != null:
		sea.net.pinged.connect(_on_ping)


static func kind_of(id: String) -> Array:
	for k: Array in KINDS:
		if k[0] == id:
			return k
	return KINDS[3]


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
	queue_redraw()


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
		var ww: float = f_small.get_string_size(who, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
		_text(f_small, at + Vector2(-ww / 2.0, -16), who, 13, Color(Kit.INK_2, a))
	# The wheel while G is held: it opens out over WHEEL_S and closes the
	# same way; the option picked grows to it and lights, rather than jumping.
	if _open_k > 0.0:
		var ok: float = _open_k * _open_k * (3.0 - 2.0 * _open_k)
		draw_circle(_centre, 4.0, Color(Kit.SEA_INK, 0.8 * ok))
		for i2: int in KINDS.size():
			var k2: Array = KINDS[i2]
			var pk: float = float(_opt_k[i2])
			var pos: Vector2 = _centre + (DIRS[i2] as Vector2) * 74.0 * lerpf(0.8, 1.0, ok)
			var s: String = str(k2[1])
			var sc: float = lerpf(1.0, 19.0 / 16.0, pk)
			var sw: float = f_big.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
			draw_set_transform(pos, 0.0, Vector2.ONE * sc)
			_text(f_big, Vector2(-sw / 2.0, 6), s, 16, Color(k2[2], lerpf(0.6, 1.0, pk) * ok))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## Lettering on the water, in the one recipe (Kit.sea_string).
func _text(f: Font, at: Vector2, t: String, px: int, col: Color) -> void:
	Kit.sea_string(self, f, at, t, px, col)
