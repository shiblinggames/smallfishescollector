class_name SeaScale
extends RefCounted
## THE SEA, WIDENED (Kong, 2026-10-02: "the Shallows start too close to the
## Mainland; an overall expansion is fine"). Everything on the fishing side
## past the Mainland's own water (1,400 out) moves port_rules seaExpand
## (1,000) further out along its own bearing: the five waters keep their
## widths and the calm water round the Mainland grows. Applied once, when the
## port's rules load (Rules.data), to the tables (isles, sites, regulars,
## buyers, currents, kelp, the traders' reach) and to the waters' rings; the
## parity run (web tables alone) never sees it. North of the reef nothing moves.

const HARBOUR: float = 1400.0
static var d: float = 0.0


## A point on the fishing side, widened.
static func expand(p: Vector2) -> Vector2:
	if d <= 0.0 or p.y <= Explore.NORTH_WALL:
		return p
	var r: float = p.length()
	if r <= HARBOUR:
		return p
	var q: Vector2 = p * ((r + d) / r)
	if q.y < Explore.NORTH_WALL + 100.0:
		q.y = Explore.NORTH_WALL + 100.0
	return q


## The other way (a widened point back to the web's): inside the new calm
## water, onto the old edge of it.
static func contract(p: Vector2) -> Vector2:
	if d <= 0.0 or p.y <= Explore.NORTH_WALL:
		return p
	var r: float = p.length()
	if r <= HARBOUR:
		return p
	return p * (maxf(HARBOUR, r - d) / r)


static func _xy(o: Dictionary) -> void:
	var q: Vector2 = expand(Vector2(float(o["x"]), float(o["y"])))
	o["x"] = q.x
	o["y"] = q.y


## Widen the rules' tables and the waters, once.
static func apply(data: Dictionary) -> void:
	d = Js.num(data.get("seaExpand"))
	if d <= 0.0:
		return
	for i: Dictionary in Js.list(data.get("isles")):
		_xy(i)
	for s: Dictionary in Js.list(data.get("digSites")):
		_xy(s)
	for r: Dictionary in Js.list(data.get("residents")):
		_xy(r)
	for m: Dictionary in Js.list(Js.obj(data.get("regulars")).get("moorings")):
		_xy(m)
	var flow: Dictionary = Js.obj(data.get("flow"))
	for lane: Dictionary in Js.list(flow.get("currents")):
		var pts: Array = lane["pts"]
		for k: int in pts.size():
			var q: Vector2 = expand(Vector2(float(pts[k][0]), float(pts[k][1])))
			pts[k] = [q.x, q.y]
	for kp: Dictionary in Js.list(flow.get("kelp")):
		_xy(kp)
	var tr: Dictionary = Js.obj(data.get("traders"))
	if tr.has("outerEdge"):
		tr["outerEdge"] = float(tr["outerEdge"]) + d
	if tr.has("doorstep"):
		tr["doorstep"] = float(tr["doorstep"]) + d
	Chart.widen(d)
