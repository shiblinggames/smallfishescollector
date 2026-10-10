class_name CompassRibbon
extends Control
## THE COMPASS, AS A HEADING RIBBON (Kong, 2026-10-06: "a visual overhaul and
## improvement of the compass system in Godot"; he chose the ribbon, pinning,
## and fading while fishing). A thin strip under the level bar, NORTH-UP
## (Kong, 2026-10-09: the heading-up strip, sliding with every swing of the bow
## over a sea that never turns, was "a bit nauseating"): north fixed in the
## middle and the whole round across it, south at both ends, as the map is
## drawn. Every mark sits at its true bearing from her with its name and its
## sailing time under it, drifting only as she sails; a small notch on the
## line shows where her bow points. Nothing is
## drawn on the edges of the sea any more (it replaces the buyer's "!", the
## crew's edge marks, Finn's arrow and the course's edge mark).
##
## WHAT IT MARKS, by role, not by distance (the web's rules, ocean-hub.md "The
## compass"), and only what is off the screen:
##   always    a pinned mark; the World Chart's track; your crewmates
##   fishing   the nearest port; the buyer of the water you are in; Finn when
##             he has a job; regulars you have met who are waiting on a fish
##             or have a word (in amber); the next water out and in (their
##             nearest edge, dim with the Fishing level they need); the other
##             ports, as room allows
##   north     in the anchorage: Fishing (the gap in the reef) and the
##             northern ports; out in a bay: the campaign's next stop first,
##             and The Anchorage
## Up to SLOTS role marks. A time is at the hull's full speed, so it shortens
## with a faster ship.
##
## PRESS A MARK TO PIN IT (press again to let go): it stays lit, and a dotted
## road runs on the water toward it until you arrive. It never steers for you
## (the web's sail-to-mark was removed on purpose).

const W: float = 820.0
const SPAN: float = PI
const SLOTS: int = 5
const CARDINAL: Array = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
const ARRIVE: float = 420.0

## Lettering on the water: the one cream and the one gold (spec 1.3).
const INK: Color = Kit.SEA_INK
const SOFT: Color = Color(0.8, 0.76, 0.68)
const GOLD: Color = Kit.SEA_GOLD
const AMBER: Color = Color(1.0, 0.68, 0.32)
const TEAL: Color = Color(0.5, 0.9, 0.86)
const DIM: Color = Color(0.62, 0.66, 0.7)

var sea: Sea
var pinned: String = ""
var _marks: Array = []
var _hits: Array = []
var _alpha: float = 1.0
var _folk_t: float = 99.0
var _folk: Dictionary = {}
var _road: Node2D
var _road_to: Variant = null
## The marks are gathered GATHER_EVERY, not every frame (the ports sorted, the
## regulars looked up, the waters read): only positions move faster than that,
## and a mark on something that moves holds the node, so it is read live.
const GATHER_EVERY: float = 0.15
var _gather_t: float = 99.0
var _gathered_pin: String = ""
var _pin_mark: Dictionary = {}
## FILM_QUIET is fixed for the run: read once.
static var _film_quiet: int = -1


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_road = Node2D.new()
	_road.z_index = 3
	_road.draw.connect(_draw_road)
	sea._world.add_child(_road)


func _exit_tree() -> void:
	if is_instance_valid(_road):
		_road.queue_free()


## Only the marks themselves take a press; the rest of the strip lets the
## sea under it have the click.
func _has_point(p: Vector2) -> bool:
	for h: Array in _hits:
		if (h[0] as Rect2).has_point(p):
			return true
	return false


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		for h: Array in _hits:
			if (h[0] as Rect2).has_point((e as InputEventMouseButton).position):
				pinned = "" if pinned == str(h[1]) else str(h[1])
				Sound.plip()
				accept_event()
				return


# ── What to mark ──────────────────────────────────────────────────────────────

func _speed() -> float:
	return maxf(1.0, Boat.SPEED * sea._boat.hull * sea._boat.boat_speed * 0.92)


func _time(d: float) -> String:
	var s: float = d / _speed()
	if s < 60.0:
		return "%ds" % maxi(1, int(ceil(s / 5.0) * 5.0))
	return "%d min" % int(round(s / 60.0))


## at: a place (Vector2) or the Node2D the mark follows.
func _mark(id: String, name: String, at: Variant, col: Color, sub: String = "") -> Dictionary:
	return { "id": id, "name": name, "at": at, "last": (at as Node2D).position if at is Node2D else at, "col": col, "sub": sub }


## Where a mark is now: its node's live position, or where it was last seen
## if the node has gone.
static func _at(m: Dictionary) -> Vector2:
	var a: Variant = m["at"]
	if a is Vector2:
		return a
	if is_instance_valid(a):
		m["last"] = (a as Node2D).position
	return m["last"]


## The regulars' state (who waits on a fish, who has a word), read now and
## then rather than every frame.
func _folk_rows(delta: float) -> void:
	_folk_t += delta
	if _folk_t < 2.0:
		return
	_folk_t = 0.0
	_folk = {}
	for r: Dictionary in Folk.state(sea.session.store, sea.session.uid):
		_folk[str(r["folkId"])] = r


func _gather() -> Array:
	var at: Vector2 = sea._boat.position
	var north: bool = North.is_north(at)
	var always: Array = []
	var roles: Array = []
	# The World Chart's track.
	if sea._course != null and sea._course.active():
		always.append(_mark("track", sea._course.label, sea._course.dest, GOLD, "your course"))
	# A raid or a dive the crew asked you to (whichever side it lies).
	var me_key: String = sea.net.key if sea.net != null else ""
	if me_key != "":
		var rt: RaidTable = RaidTable.live
		if rt != null and str(rt.state.get("phase", "")) == "muster" and ["asked", "coming"].has(str(Js.obj(rt.state.get("invites")).get(me_key, ""))):
			always.append(_mark("muster", str(Battle.raid_def(str(rt.state.get("raidId", ""))).get("raidTitle", "The raid")), RaidTable.dock_of(str(rt.state.get("nodeId", ""))), GOLD, "the crew's raid"))
		var gt: GauntletTable = GauntletTable.live
		if gt != null and str(gt.state.get("phase", "")) == "muster" and ["asked", "coming"].has(str(Js.obj(gt.state.get("invites")).get(me_key, ""))):
			always.append(_mark("dive", str(Gauntlet.NAMES.get(str(gt.state.get("variant", "davy")), "The dive")), GauntletTable.maelstrom_of(str(gt.state.get("variant", "davy"))), GOLD, "the crew's dive"))
	# Pings while they last (game/crew_pings.gd).
	if sea._pings != null:
		for pg: Dictionary in sea._pings.pings:
			var kd: Array = CrewPings.kind_of(str(pg["kind"]))
			always.append(_mark("ping:" + str(pg["key"]), "%s: %s" % [pg["name"], kd[1]], pg["at"], kd[2]))
	# Your crewmates, in their own teal.
	for k: String in sea._mates:
		var m: Shipmate = sea._mates[k]
		if North.is_north(m.position) == north and m.mate_name != "":
			always.append(_mark("mate:" + k, m.mate_name, m, TEAL, m.status))
	if north:
		var anch: bool = at.distance_to(North.EXP_ORIGIN) <= North.EXP_EDGE
		if not anch:
			var nid: String = sea._campaign.next_id if sea._campaign != null else ""
			var np: Variant = sea._campaign.node_at(nid) if nid != "" else null
			if np != null:
				roles.append(_mark("node:" + nid, str(Campaign.node(nid).get("label", "Next")), np, GOLD, "next stop"))
			roles.append(_mark("anchorage", "The Anchorage", North.SEA_GATE, INK))
		else:
			roles.append(_mark("reef", "Fishing", Vector2(North.GATE_X, Explore.NORTH_WALL + 200.0), INK, "through the reef"))
			for p: Dictionary in _ports(true, at):
				roles.append(p)
	else:
		var ports: Array = _ports(false, at)
		if not ports.is_empty():
			roles.append(ports.pop_front())
		var w: Dictionary = Chart.water_at(at)
		for b: Buyer in sea._buyers:
			if not w.is_empty() and b.info["zoneId"] == w["id"]:
				roles.append(_mark("buyer:" + str(w["id"]), str(b.info.get("name", "The buyer")), b, GOLD, "buys here"))
		if sea._finn != null and sea._finn.mark != "":
			roles.append(_mark("finn", "Finn", sea._finn, AMBER, "a job done" if sea._finn.mark == "!" else "has work"))
		for k2: String in sea._regulars:
			var wn: Wanderer = sea._regulars[k2]
			var fid: String = str(wn.info.get("folkId", ""))
			var r: Dictionary = _folk.get(fid, {})
			if r.is_empty() or (Js.num(r.get("points")) <= 0.0 and Js.list(r.get("seenLines")).is_empty()):
				continue
			var nm: String = str(Js.obj(Folk.by_id(fid)).get("short", wn.info.get("name", "")))
			if r.get("want") != null:
				roles.append(_mark("folk:" + fid, nm, wn, AMBER, "wants a %s" % r["want"]["name"]))
			elif r.get("chattedToday") != true:
				roles.append(_mark("folk:" + fid, nm, wn, AMBER.lerp(INK, 0.4), "has a word"))
		# The next water out and in, at their nearest edge.
		var i: int = -1
		for j: int in Chart.WATERS.size():
			if not w.is_empty() and Chart.WATERS[j]["id"] == w["id"]:
				i = j
		var lvl: int = Rules.level_from_xp(Js.num(sea.session.profile().get("fishing_xp")))
		var mins: Dictionary = Js.obj(Js.obj(Rules.data().get("zones")).get("minLevel"))
		var dir: Vector2 = at.normalized() if at.length() > 1.0 else Vector2.DOWN
		for step: int in [1, -1]:
			var j2: int = i + step
			if j2 < 0 or j2 >= Chart.WATERS.size():
				continue
			var wj: Dictionary = Chart.WATERS[j2]
			var edge: float = float(wj["inner"]) + 120.0 if step > 0 else float(wj["outer"]) - 120.0
			var need: int = int(Js.num(mins.get(wj["id"])))
			var locked: bool = need > lvl
			roles.append(_mark("water:" + str(wj["id"]), str(wj["name"]), dir * edge, DIM if locked else Color(0.62, 0.82, 0.98), ("Fishing %d" % need) if locked else ""))
		for p2: Dictionary in ports:
			roles.append(p2)
	# Drop what is already on the screen (an arrow to something you can see is
	# noise), keep a pinned one whatever.
	var out: Array = []
	var seen: Dictionary = {}
	var always_ids: Dictionary = {}
	for a0: Dictionary in always:
		always_ids[a0["id"]] = true
	var every: Array = always + roles
	for m2: Dictionary in every:
		if seen.has(m2["id"]):
			continue
		seen[m2["id"]] = true
		if m2["id"] != pinned and _on_screen(_at(m2)):
			continue
		out.append(m2)
	# The role marks capped; the always-marks and a pin are free.
	var kept: Array = []
	var n: int = 0
	for m3: Dictionary in out:
		var free: bool = m3["id"] == pinned or always_ids.has(m3["id"])
		if free or n < SLOTS:
			kept.append(m3)
			if not free:
				n += 1
	# A pinned mark that has gone (a crewmate left, the stop was cleared).
	if pinned != "" and not seen.has(pinned):
		pinned = ""
	_pin_mark = {}
	for m4: Dictionary in every:
		if m4["id"] == pinned:
			_pin_mark = m4
			break
	return kept


func _ports(north: bool, at: Vector2) -> Array:
	var rows: Array = []
	for p: Dictionary in Chart.ports():
		var b: Dictionary = p["berth"]
		var bp: Vector2 = Vector2(float(b["x"]), float(b["y"]))
		if North.is_north(bp) != north:
			continue
		rows.append([at.distance_to(bp), _mark("port:" + str(p["id"]), str(p["name"]), bp, INK)])
	rows.sort_custom(func(a: Array, b2: Array) -> bool: return float(a[0]) < float(b2[0]))
	return rows.map(func(r: Array) -> Dictionary: return r[1])


func _on_screen(p: Vector2) -> bool:
	var s: Vector2 = sea._world.get_global_transform_with_canvas() * p
	var vp: Vector2 = get_viewport_rect().size
	return s.x > 40.0 and s.y > 140.0 and s.x < vp.x - 40.0 and s.y < vp.y - 120.0


# ── Each frame ────────────────────────────────────────────────────────────────

func _process(delta: float) -> void:
	_folk_rows(delta)
	if _film_quiet < 0:
		_film_quiet = 1 if OS.get_environment("FILM_QUIET") != "" else 0
	var hide: bool = sea.stage != null or _film_quiet == 1 or (sea._hud != null and sea._hud._modal != null)
	# Dims with the HUD's focus while the dial is up (the dial has the
	# screen), to the weight the focus dim leaves everything else at; it sits
	# above the HUD, so the dim itself never covers it.
	var dial_up: bool = sea._hud != null and sea._hud._dial != null and sea._hud._dial.visible
	var want: float = 0.0 if hide else ((1.0 - Kit.SCRIM_FOCUS / 0.6) if dial_up else 1.0)
	_alpha = move_toward(_alpha, want, delta * 3.0)
	var was: bool = visible
	visible = _alpha > 0.01
	_gather_t += delta
	if _gather_t >= GATHER_EVERY or pinned != _gathered_pin or visible != was:
		_gather_t = 0.0
		_gathered_pin = pinned
		if visible or pinned != "":
			var g: Array = _gather()
			_marks = g if visible else []
		else:
			_marks = []
			_pin_mark = {}
	# The pinned road (its mark read live); arriving lets go of it.
	_road_to = null
	if pinned != "" and not _pin_mark.is_empty() and _pin_mark["id"] == pinned:
		_road_to = _at(_pin_mark)
	if _road_to != null and sea._boat.position.distance_to(_road_to) < ARRIVE:
		pinned = ""
		_road_to = null
	_road.queue_redraw()
	queue_redraw()


## A compass bearing (0 north, clockwise) of a direction in the world.
var _bow: float = 0.0


static func bearing(v: Vector2) -> float:
	return atan2(v.x, -v.y)


func _draw() -> void:
	_hits = []
	var a: float = _alpha
	var c: Vector2 = Vector2(size.x / 2.0, 14.0)
	var heading: float = bearing(Vector2.from_angle(sea._boat.heading))
	var half: float = W / 2.0
	# North-up: the strip never turns; the bow's notch moves along it.
	var up: float = 0.0
	var f_card: Font = Kit.font("cinzel", 800)
	var f_name: Font = Kit.font("karla", 700)
	var f_sub: Font = Kit.font("karla", 600)
	# The line, fading at both ends, and its ticks every fifteen degrees.
	for i: int in 40:
		var x0: float = -half + W * i / 40.0
		var x1: float = -half + W * (i + 1) / 40.0
		var fade: float = 1.0 - pow(absf((x0 + x1) / 2.0) / half, 3.0)
		draw_line(c + Vector2(x0, 0), c + Vector2(x1, 0), Color(INK, 0.32 * fade * a), 1.5)
	for d: int in range(0, 360, 15):
		var rel: float = wrapf(deg_to_rad(float(d)) - up, -PI, PI)
		var x: float = rel / SPAN * half
		var fade2: float = maxf(0.35, 1.0 - pow(absf(x) / half, 3.0))
		if d % 45 == 0:
			var t: String = CARDINAL[d / 45]
			var px: int = 15 if d % 90 == 0 else 11
			var tw: float = f_card.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
			_text(f_card, c + Vector2(x - tw / 2.0, -5), t, px, Color(INK, (0.9 if d % 90 == 0 else 0.6) * fade2 * a))
		else:
			draw_line(c + Vector2(x, -3), c + Vector2(x, 3), Color(INK, 0.35 * fade2 * a), 1.0)
	# The bow: a small notch on the line where she points, eased so a quick
	# swing of the helm glides rather than jumps.
	_bow = _bow + wrapf(heading - _bow, -PI, PI) * minf(1.0, get_process_delta_time() * 8.0)
	var bx0: float = wrapf(_bow - up, -PI, PI) / SPAN * half
	draw_colored_polygon(PackedVector2Array([c + Vector2(bx0 - 5, 8), c + Vector2(bx0 + 5, 8), c + Vector2(bx0, 2)]), Color(INK, 0.85 * a))
	# The marks, nearest the bow drawn last; labels that would collide stack.
	var placed: Array = []
	var rows: Array = []
	for m: Dictionary in _marks:
		var v: Vector2 = _at(m) - sea._boat.position
		var rel2: float = wrapf(bearing(v) - up, -PI, PI)
		var x2: float = clampf(rel2 / SPAN, -1.0, 1.0) * (half - 6.0)
		rows.append([absf(rel2), m, x2, v.length()])
	rows.sort_custom(func(p: Array, q: Array) -> bool: return float(p[0]) > float(q[0]))
	for r: Array in rows:
		var m2: Dictionary = r[1]
		var x3: float = r[2]
		var pin: bool = m2["id"] == pinned
		var col: Color = m2["col"]
		var k: float = a
		var name: String = str(m2["name"])
		var line2: String = _time(float(r[3]))
		if str(m2["sub"]) != "":
			line2 = "%s  ·  %s" % [m2["sub"], line2]
		var nw: float = f_name.get_string_size(name, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
		var sw: float = f_sub.get_string_size(line2, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
		var bw: float = maxf(nw, sw)
		var bx: float = clampf(x3 - bw / 2.0, -half, half - bw)
		# Stack down a row when it would sit on a label already placed.
		var row: int = 0
		for pl: Array in placed:
			if absf(float(pl[0]) - (bx + bw / 2.0)) < (float(pl[1]) + bw) / 2.0 + 10.0 and int(pl[2]) == row:
				row += 1
		row = mini(row, 1)
		placed.append([bx + bw / 2.0, bw, row])
		var y: float = 22.0 + row * 34.0
		# The tick on the line where it lies, in its colour.
		draw_line(c + Vector2(x3, -6), c + Vector2(x3, 6), Color(col, k), 3.0 if pin else 2.0)
		if pin:
			draw_circle(c + Vector2(x3, 0), 5.0, Color(col, k))
		_text(f_name, c + Vector2(bx + (bw - nw) / 2.0, y + 13), name, 14, Color(col, k))
		_text(f_sub, c + Vector2(bx + (bw - sw) / 2.0, y + 28), line2, 12, Color(SOFT, 0.9 * k))
		if pin:
			draw_line(c + Vector2(bx, y + 33), c + Vector2(bx + bw, y + 33), Color(col, 0.8 * k), 1.5)
		_hits.append([Rect2(c + Vector2(bx - 6, y - 2), Vector2(bw + 12, 38)), m2["id"]])


## Lettering on the water, in the one recipe (Kit.sea_string).
func _text(f: Font, at: Vector2, t: String, px: int, col: Color) -> void:
	Kit.sea_string(self, f, at, t, px, col)


## The pinned road: dots on the water from the bow toward the mark.
func _draw_road() -> void:
	if _road_to == null or _alpha <= 0.01:
		return
	var from: Vector2 = sea._boat.position
	var to: Vector2 = _road_to
	var d: float = from.distance_to(to)
	var dir: Vector2 = (to - from) / maxf(1.0, d)
	var t: float = Time.get_ticks_msec() / 1000.0
	var step: float = 70.0
	var off: float = fmod(t * 60.0, step)
	var s: float = 160.0 + off
	while s < minf(d - 80.0, 2600.0):
		var fade: float = 1.0 - smoothstep(1800.0, 2600.0, s)
		_road.draw_circle(from + dir * s, 7.0, Color(GOLD, 0.55 * fade * _alpha))
		s += step
