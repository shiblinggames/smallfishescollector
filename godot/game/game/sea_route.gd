class_name SeaRoute
extends RefCounted
## GPS FOR THE SEA (Godot, 2026-10-01). A course from where she is to anywhere
## on the chart, round every island: Godot's AStarGrid2D over the whole sea in
## 160px cells, the islands (their shores, with room for a hull) blocked, kelp
## beds costing more so a course goes round them when that is cheap, then
## pulled taut by line of sight so it reads as a course a captain would sail,
## not a staircase. A destination on land is moved to the water: a port's
## berth, an isle's landing, or the nearest open water.

const CELL: float = 160.0
const X0: float = -22800.0
const Y0: float = -6600.0
const X1: float = 22800.0
const Y1: float = 22800.0
## How far from a shore a course keeps (on top of the hull's own clearance).
const KEEP_OFF: float = 70.0

static var _grid: AStarGrid2D


static func _cell(p: Vector2) -> Vector2i:
	return Vector2i(int(floor((p.x - X0) / CELL)), int(floor((p.y - Y0) / CELL)))


static func _centre(c: Vector2i) -> Vector2:
	return Vector2(X0 + (c.x + 0.5) * CELL, Y0 + (c.y + 0.5) * CELL)


## Open sea: inside the chart's rim (the fishing water's outer edge, or the
## anchorage north of the reef) and clear of every island.
static func open_at(p: Vector2) -> bool:
	var in_sea: bool = p.length() < 22500.0 or p.distance_to(Vector2(0, -3000)) < 3500.0
	if not in_sea:
		return false
	for isl: Dictionary in Chart.ports() + (Rules.data()["isles"] as Array):
		var c: Vector2 = Vector2(float(isl["x"]), float(isl["y"]))
		if p.distance_to(c) < float(isl["r"]) * Chart.SHORE + Chart.HULL + KEEP_OFF:
			return false
	return true


static func grid() -> AStarGrid2D:
	if _grid != null:
		return _grid
	_grid = AStarGrid2D.new()
	_grid.region = Rect2i(0, 0, int(ceil((X1 - X0) / CELL)), int(ceil((Y1 - Y0) / CELL)))
	_grid.cell_size = Vector2(CELL, CELL)
	_grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	_grid.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_grid.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_grid.update()
	# The rim: everything outside the sea.
	for y: int in _grid.region.size.y:
		for x: int in _grid.region.size.x:
			var at: Vector2 = _centre(Vector2i(x, y))
			if not (at.length() < 22500.0 or at.distance_to(Vector2(0, -3000)) < 3500.0):
				_grid.set_point_solid(Vector2i(x, y), true)
	# Each island stamps out its own shore; each kelp bed weighs its cells.
	for isl: Dictionary in Chart.ports() + (Rules.data()["isles"] as Array):
		_stamp(Vector2(float(isl["x"]), float(isl["y"])), float(isl["r"]) * Chart.SHORE + Chart.HULL + KEEP_OFF, -1.0)
	for k: Dictionary in SeaFlow.flow()["kelp"]:
		_stamp(Vector2(float(k["x"]), float(k["y"])), float(k["r"]), 2.5)
	return _grid


## Every cell whose centre is within `r` of `c`: solid (weight < 0) or weighted.
static func _stamp(c: Vector2, r: float, weight: float) -> void:
	var lo: Vector2i = _cell(c - Vector2(r, r))
	var hi: Vector2i = _cell(c + Vector2(r, r))
	for y: int in range(lo.y, hi.y + 1):
		for x: int in range(lo.x, hi.x + 1):
			var cell: Vector2i = Vector2i(x, y)
			if not _grid.region.has_point(cell) or _centre(cell).distance_to(c) > r:
				continue
			if weight < 0.0:
				_grid.set_point_solid(cell, true)
			elif not _grid.is_point_solid(cell):
				_grid.set_point_weight_scale(cell, weight)


## Where to actually sail for a point the captain chose: a port's berth, an
## isle's landing side, or open water nearest the point.
static func landfall(p: Vector2) -> Vector2:
	for port: Dictionary in Chart.ports():
		var c: Vector2 = Vector2(float(port["x"]), float(port["y"]))
		if p.distance_to(c) < float(port["r"]) * 1.1:
			var be: Dictionary = port["berth"]
			return Vector2(float(be["x"]), float(be["y"]))
	if open_at(p):
		return p
	# Walk out from the point until the water is open.
	for ring: int in range(1, 40):
		for k: int in 16:
			var q: Vector2 = p + Vector2.from_angle(k * TAU / 16.0) * ring * 60.0
			if open_at(q):
				return q
	return p


static func _clear_line(a: Vector2, b: Vector2) -> bool:
	var g: AStarGrid2D = grid()
	var steps: int = maxi(1, int(a.distance_to(b) / (CELL * 0.5)))
	for i: int in steps + 1:
		var c: Vector2i = _cell(a.lerp(b, float(i) / steps))
		if not g.region.has_point(c) or g.is_point_solid(c):
			return false
	return true


## The course from `from` to `to` (world px), pulled taut. Empty if there is
## no way through.
static func plan(from: Vector2, to: Vector2) -> PackedVector2Array:
	var g: AStarGrid2D = grid()
	var a: Vector2i = _cell(from)
	var b: Vector2i = _cell(landfall(to))
	if not g.region.has_point(a) or not g.region.has_point(b):
		return PackedVector2Array()
	# A start inside a blocked cell (she is moored close in): step out first.
	if g.is_point_solid(a):
		var best: Vector2i = a
		var bd: float = INF
		for dy: int in range(-4, 5):
			for dx: int in range(-4, 5):
				var c: Vector2i = a + Vector2i(dx, dy)
				if g.region.has_point(c) and not g.is_point_solid(c) and Vector2(dx, dy).length() < bd:
					bd = Vector2(dx, dy).length()
					best = c
		a = best
	if g.is_point_solid(b):
		return PackedVector2Array()
	var cells: Array[Vector2i] = g.get_id_path(a, b)
	if cells.is_empty():
		return PackedVector2Array()
	var raw: PackedVector2Array = PackedVector2Array([from])
	for c: Vector2i in cells:
		raw.append(_centre(c))
	raw.append(landfall(to))
	# Pull it taut: from each kept point, jump to the furthest one still in
	# plain sight.
	var out: PackedVector2Array = PackedVector2Array([raw[0]])
	var i: int = 0
	while i < raw.size() - 1:
		var j: int = raw.size() - 1
		while j > i + 1 and not _clear_line(raw[i], raw[j]):
			j -= 1
		out.append(raw[j])
		i = j
	return out


static func length_of(path: PackedVector2Array) -> float:
	var n: float = 0.0
	for k: int in range(1, path.size()):
		n += path[k - 1].distance_to(path[k])
	return n
