class_name FlareBarrage
extends Control
## THE FLARE BARRAGE (the web's FlareBarrage, redone for Godot): the enemy
## looses a spread of signal flares. Each climbs out of its rail on a smoking
## trail and hangs over the water burning, its fuse a ring of light running
## down; swat it (press it) before the ring closes or it drops burning onto
## your deck. At the third tier some are live shells: dark iron with a
## sizzling fuse, and pressing one sets it off. finished(missed, feints).
## The schedule is the web's: fuses tighten as it goes, clusters and lulls.

signal finished(missed: float, feints: float)

var count: int = 5
var feint_chance: float = 0.0
var cluster: float = 0.2
var fuse_scale: float = 1.0
var title: String = "Flare Barrage"
## Where the flares come from and fall to, on screen.
var source: Vector2 = Vector2(1200, 420)
var target: Vector2 = Vector2(500, 520)

var _flares: Array = []
var _pops: Array = []
var _t: float = 0.0
var _missed: float = 0.0
var _feints: float = 0.0
var _resolved: int = 0
var _done: bool = false
var _dim: float = 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var t: float = 0.9
	var placed: Array = []
	for k: int in count:
		var fuse: float = (maxf(560.0, 960.0 - k * 34.0) + randf() * 150.0) * fuse_scale / 1000.0
		var best: Vector2 = Vector2(0.12 + randf() * 0.76, 0.24 + randf() * 0.5)
		var best_d: float = -1.0
		for attempt: int in 28:
			var c: Vector2 = Vector2(0.12 + randf() * 0.76, 0.24 + randf() * 0.5)
			var md: float = INF
			for p: Dictionary in placed:
				if float(p["end"]) > t:
					md = minf(md, Vector2((c.x - float(p["x"])) / 0.07, (c.y - float(p["y"])) / 0.11).length())
			if md >= 1.0:
				best = c
				break
			if md > best_d:
				best_d = md
				best = c
		placed.append({ "x": best.x, "y": best.y, "end": t + fuse })
		_flares.append({ "id": k, "at": best, "appear": t, "fuse": fuse, "feint": k > 0 and randf() < feint_chance, "state": "wait" })
		var r: float = randf()
		t += (0.205 + randf() * 0.11) if r < cluster else ((0.77 + randf() * 0.28) if r < cluster + 0.26 else (0.38 + randf() * 0.23))
	Sound.horn()


func _process(delta: float) -> void:
	_t += delta
	_dim = minf(1.0, _dim + delta * 3.0)
	for f: Dictionary in _flares:
		var st: String = f["state"]
		if st == "wait" and _t >= float(f["appear"]):
			f["state"] = "climb"
			Sound.plip()
		elif st == "climb" and _t >= float(f["appear"]) + 0.28:
			f["state"] = "lit"
		elif st == "lit" and _t >= float(f["appear"]) + 0.28 + float(f["fuse"]):
			_resolve(f, false)
		elif st == "drop" and _t >= float(f["dropAt"]) + 0.35:
			f["state"] = "gone"
	for p: Dictionary in _pops:
		p["t"] = float(p["t"]) + delta
	_pops = _pops.filter(func(p: Dictionary) -> bool: return float(p["t"]) < 0.7)
	queue_redraw()


func _pos(f: Dictionary) -> Vector2:
	return Vector2(size.x * (f["at"] as Vector2).x, size.y * (f["at"] as Vector2).y)


func _resolve(f: Dictionary, tapped: bool) -> void:
	if f["state"] in ["done", "drop", "gone"]:
		return
	var bad: bool = (tapped if f["feint"] else not tapped)
	if bad:
		if f["feint"]:
			_feints += 1.0
			Rumble.buzz([0, 55, 35, 75])
			Sound.impact(true)
		else:
			_missed += 1.0
			Rumble.tap(10)
	elif tapped:
		Rumble.tap(8)
		Sound.plip()
	_pops.append({ "p": _pos(f), "t": 0.0, "bad": bad, "feint": f["feint"] })
	if not tapped and not f["feint"]:
		f["state"] = "drop"
		f["dropAt"] = _t
	else:
		f["state"] = "done"
	_resolved += 1
	if _resolved >= count and not _done:
		_done = true
		await get_tree().create_timer(0.6).timeout
		var tw: Tween = create_tween()
		tw.tween_property(self, "modulate:a", 0.0, 0.3)
		await tw.finished
		finished.emit(_missed, _feints)
		queue_free()


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		accept_event()
		var at: Vector2 = (e as InputEventMouseButton).position
		var best: Dictionary = {}
		var bd: float = 64.0
		for f: Dictionary in _flares:
			if f["state"] != "lit":
				continue
			var d: float = _pos(f).distance_to(at)
			if d < bd:
				bd = d
				best = f
		if not best.is_empty():
			_resolve(best, true)


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.02, 0.03, 0.07, 0.35 * _dim))
	var f0: Font = Kit.font("cinzel", 800)
	var head: String = title.to_upper()
	var hw: float = f0.get_string_size(head, HORIZONTAL_ALIGNMENT_LEFT, -1, 28).x
	draw_string_outline(f0, Vector2(size.x / 2.0 - hw / 2.0, 130), head, HORIZONTAL_ALIGNMENT_LEFT, -1, 28, 8, Color(0, 0, 0, 0.7))
	draw_string(f0, Vector2(size.x / 2.0 - hw / 2.0, 130), head, HORIZONTAL_ALIGNMENT_LEFT, -1, 28, Color(1.0, 0.75, 0.4))
	var sub: String = "Swat every flare before its fuse runs out" + ("  ·  leave the iron shells alone" if feint_chance > 0.0 else "")
	var f1: Font = Kit.font("karla", 700)
	var sw: float = f1.get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
	draw_string(f1, Vector2(size.x / 2.0 - sw / 2.0, 156), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(0.95, 0.9, 0.8, 0.85))
	for f: Dictionary in _flares:
		var st: String = f["state"]
		var p: Vector2 = _pos(f)
		if st == "climb":
			var u: float = clampf((_t - float(f["appear"])) / 0.28, 0.0, 1.0)
			var q: Vector2 = source.lerp(p, u) + Vector2(0, -sin(u * PI) * 80.0)
			draw_line(source.lerp(p, maxf(0.0, u - 0.25)), q, Color(1.0, 0.8, 0.5, 0.4), 3.0, true)
			draw_circle(q, 6.0, Color(1.0, 0.85, 0.5))
		elif st == "lit":
			var life: float = clampf((_t - float(f["appear"]) - 0.28) / float(f["fuse"]), 0.0, 1.0)
			if f["feint"]:
				# A live shell: dark iron, a fuse sizzling.
				draw_circle(p, 22.0, Color(0.13, 0.13, 0.15))
				draw_circle(p + Vector2(-6, -6), 6.0, Color(0.4, 0.4, 0.45, 0.6))
				draw_line(p + Vector2(10, -16), p + Vector2(18, -28), Color(0.5, 0.4, 0.3), 3.0, true)
				for k: int in 4:
					draw_circle(p + Vector2(18, -28) + Vector2(randf_range(-6, 6), randf_range(-6, 6)), 2.0, Color(1.0, 0.8, 0.3, randf()))
				draw_arc(p, 30.0, -PI / 2.0, -PI / 2.0 + TAU * (1.0 - life), 40, Color(0.9, 0.35, 0.25, 0.8), 3.0, true)
			else:
				var fl: float = 0.85 + 0.15 * sin(_t * 30.0 + float(f["id"]))
				for k: int in 4:
					draw_circle(p, (34.0 - k * 7.0) * fl, Color(1.0, 0.45 + k * 0.12, 0.2, 0.12 + k * 0.12))
				draw_circle(p, 9.0, Color(1.0, 0.95, 0.75))
				draw_arc(p, 40.0, -PI / 2.0, -PI / 2.0 + TAU * (1.0 - life), 48, Color(1.0, 0.85, 0.45, 0.95), 4.0, true)
		elif st == "drop":
			var u2: float = clampf((_t - float(f["dropAt"])) / 0.35, 0.0, 1.0)
			var q2: Vector2 = p.lerp(target, u2 * u2)
			draw_line(p.lerp(target, maxf(0.0, u2 * u2 - 0.2)), q2, Color(1.0, 0.5, 0.25, 0.6), 4.0, true)
			draw_circle(q2, 8.0, Color(1.0, 0.7, 0.35))
	for pp: Dictionary in _pops:
		var u3: float = float(pp["t"]) / 0.7
		var c: Color = Color(1.0, 0.35, 0.2) if pp["bad"] else Color(1.0, 0.95, 0.8)
		draw_arc(pp["p"], 20.0 + 50.0 * u3, 0.0, TAU, 32, Color(c, 1.0 - u3), 3.0, true)
		for k: int in 8:
			var a: float = k * TAU / 8.0
			draw_line(pp["p"] + Vector2.from_angle(a) * (14.0 + 40.0 * u3), pp["p"] + Vector2.from_angle(a) * (22.0 + 56.0 * u3), Color(c, 1.0 - u3), 2.0, true)
	var left: int = count - _resolved
	var lt: String = "%d left" % left
	draw_string(f1, Vector2(size.x / 2.0 - 30, size.y - 210), lt, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(0.95, 0.9, 0.8, 0.8))
