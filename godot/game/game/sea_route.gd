class_name SeaRoute
extends RefCounted
## GPS FOR THE SEA (Godot, 2026-10-01). A course from where she is to anywhere
## on the chart, round every island: Godot's AStarGrid2D over the whole sea in
## 160px cells, the islands (their shores, with room for a hull) blocked, kelp
## beds costing more so a course goes round them when that is cheap, then
## pulled taut by line of sight so it reads as a course a captain would sail,
## not a staircase. A destination on land is moved to the water: a port's
## berth, an isle's landing, or the nearest open water.
##
## The water follows the same lines the hull is held by (North.hold,
## CampaignWater.hold): the fishing grounds out to Chart.LAST_OUTER (widened by
## SeaScale), the reef crossed only in the arch, the anchorage's wall passed
## only in the Sea Gate's mouth, and the campaign's water out to
## North.RAID_EDGE. Built 2026-10-01 before the reef existed, it once treated
## all of that as open sea and drove courses into the rock.

const CELL: float = 160.0
## How far from a shore a course keeps (on top of the hull's own clearance).
const KEEP_OFF: float = 70.0

## The grid's bounds, set by _bounds() when the grid is built (after the rules
## have widened the chart, so they follow LAST_OUTER).
static var _x0: float = -22800.0
static var _y0: float = -6600.0
static var _x1: float = 22800.0
static var _y1: float = 22800.0

static var _grid: AStarGrid2D
## The Sea Gate's mouth: open water in the grid, shut while the gate is
## (North.gate_open changes as a crew is seated, so it is laid per plan).
static var _gate_cells: Array[Vector2i] = []
## Cells made solid by what changes as the campaign goes (its shown isles, its
## shut bays, the gate): undone and laid again before each plan.
static var _live: Array[Vector2i] = []


static func _bounds() -> void:
	var half: float = maxf(Chart.LAST_OUTER, North.RAID_EDGE + absf(North.EXP_ORIGIN.x)) + CELL
	_x0 = -half
	_x1 = half
	_y0 = North.EXP_ORIGIN.y - North.RAID_EDGE - CELL
	_y1 = Chart.LAST_OUTER + CELL


static func _cell(p: Vector2) -> Vector2i:
	return Vector2i(int(floor((p.x - _x0) / CELL)), int(floor((p.y - _y0) / CELL)))


static func _centre(c: Vector2i) -> Vector2:
	return Vector2(_x0 + (c.x + 0.5) * CELL, _y0 + (c.y + 0.5) * CELL)


## In the Sea Gate's mouth, across the anchorage's wall (the part of it a
## hull may pass while the gate is open).
static func _mouth(p: Vector2) -> bool:
	var m: float = CELL * 0.5
	return p.distance_to(North.SEA_GATE) < North.SEA_GATE_HALF + North.KEEP + m and absf(p.x - North.SEA_GATE.x) < North.SEA_GATE_HALF - North.KEEP * 0.5 - m


## On the anchorage's wall (either side of it), north of the reef.
static func _on_wall(p: Vector2) -> bool:
	return p.y < Explore.NORTH_WALL and absf(p.distance_to(North.EXP_ORIGIN) - North.EXP_EDGE) < North.KEEP + CELL * 0.5


## The sea before any island: inside the fishing water's rim south of the
## reef, inside the campaign's edge north of it, and off the reef (but for the
## arch) and the anchorage's wall (but for the Sea Gate's mouth). Kept half a
## cell in from every line so a course along cell centres clears it.
static func _sea(p: Vector2) -> bool:
	var m: float = CELL * 0.5
	var nw: float = Explore.NORTH_WALL
	if absf(p.y - nw) < North.KEEP * 0.5 + m and absf(p.x - North.GATE_X) > North.GATE_HALF - 60.0 - m:
		return false
	if p.y >= nw:
		return p.length() < Chart.LAST_OUTER - 100.0
	if _on_wall(p) and not _mouth(p):
		return false
	return p.distance_to(North.EXP_ORIGIN) < North.RAID_EDGE - m


## Open sea: on the water (_sea), through the Sea Gate only while it is open,
## and clear of every island and shut bay.
static func open_at(p: Vector2) -> bool:
	if not _sea(p):
		return false
	if not North.gate_open and _on_wall(p):
		return false
	for isl: Dictionary in Chart.ports() + (Rules.data()["isles"] as Array) + CampaignWater.solid:
		var c: Vector2 = Vector2(float(isl["x"]), float(isl["y"]))
		if p.distance_to(c) < float(isl["r"]) * Chart.SHORE + Chart.HULL + KEEP_OFF:
			return false
	for b: Dictionary in CampaignWater.shut:
		var bc: Vector2 = Vector2(float(b["centre"]["x"]), float(b["centre"]["y"]))
		if p.distance_to(bc) < float(b["r"]) + CampaignWater.SKIN + KEEP_OFF:
			return false
	return true


static func grid() -> AStarGrid2D:
	if _grid != null:
		return _grid
	# The rules first: reading them applies SeaScale, which widens LAST_OUTER.
	Rules.data()
	_bounds()
	_grid = AStarGrid2D.new()
	_grid.region = Rect2i(0, 0, int(ceil((_x1 - _x0) / CELL)), int(ceil((_y1 - _y0) / CELL)))
	_grid.cell_size = Vector2(CELL, CELL)
	_grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	_grid.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_grid.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_grid.update()
	_gate_cells.clear()
	_live.clear()
	# The rim, the reef and the anchorage's wall: everything that is not sea.
	for y: int in _grid.region.size.y:
		for x: int in _grid.region.size.x:
			var cell: Vector2i = Vector2i(x, y)
			var at: Vector2 = _centre(cell)
			if not _sea(at):
				_grid.set_point_solid(cell, true)
			elif _on_wall(at):
				_gate_cells.append(cell)
	# Each island stamps out its own shore; each kelp bed weighs its cells.
	for isl: Dictionary in Chart.ports() + (Rules.data()["isles"] as Array):
		_stamp(Vector2(float(isl["x"]), float(isl["y"])), float(isl["r"]) * Chart.SHORE + Chart.HULL + KEEP_OFF, -1.0)
	for k: Dictionary in SeaFlow.flow()["kelp"]:
		_stamp(Vector2(float(k["x"]), float(k["y"])), float(k["r"]), 2.5)
	return _grid


## What changes as the campaign goes, laid fresh on the grid: the Sea Gate
## shut while no crew is seated, the campaign's shown isles and its shut bays.
static func _lay_live() -> void:
	var g: AStarGrid2D = grid()
	for c: Vector2i in _live:
		g.set_point_solid(c, false)
	_live.clear()
	if not North.gate_open:
		for c: Vector2i in _gate_cells:
			if not g.is_point_solid(c):
				g.set_point_solid(c, true)
				_live.append(c)
	for isl: Dictionary in CampaignWater.solid:
		_stamp(Vector2(float(isl["x"]), float(isl["y"])), float(isl["r"]) * Chart.SHORE + Chart.HULL + KEEP_OFF, -1.0, true)
	for b: Dictionary in CampaignWater.shut:
		_stamp(Vector2(float(b["centre"]["x"]), float(b["centre"]["y"])), float(b["r"]) + CampaignWater.SKIN + KEEP_OFF, -1.0, true)


## Every cell whose centre is within `r` of `c`: solid (weight < 0) or weighted.
## A `live` stamp records the cells it shut so _lay_live can open them again.
static func _stamp(c: Vector2, r: float, weight: float, live: bool = false) -> void:
	var lo: Vector2i = _cell(c - Vector2(r, r))
	var hi: Vector2i = _cell(c + Vector2(r, r))
	for y: int in range(lo.y, hi.y + 1):
		for x: int in range(lo.x, hi.x + 1):
			var cell: Vector2i = Vector2i(x, y)
			if not _grid.region.has_point(cell) or _centre(cell).distance_to(c) > r:
				continue
			if weight < 0.0:
				if live:
					if not _grid.is_point_solid(cell):
						_grid.set_point_solid(cell, true)
						_live.append(cell)
				else:
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
	_lay_live()
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
