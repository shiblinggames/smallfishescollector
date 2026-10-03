class_name CampaignWater
extends Node
## THE CAMPAIGN'S WATER, past the Sea Gate (a port of app/(app)/sea/raidWaters.ts
## and the campaign half of SeaMap.tsx). Five bays round a junction, one per
## chapter, each with its own water colour (Chart.sea_at), its islands, and the
## campaign's 64 nodes standing on them: a post with a note for a story beat, a
## chest for a cache, an enemy hull riding at anchor for a fight.
##
## WHAT IS DRAWN is the chain so far: a node shows once it is not locked (or it
## is one of the few that preview while locked), and an island carrying a
## node is drawn, and solid, only while its node is. Islands carrying nothing
## always are. The next stop wears a bobbing gold "?", a cleared one a tick.
##
## A BAY IS SHUT until the chapter before it is done (its class pick, or the
## Chapter IV refit for the coda). Nothing is drawn for a shut bay: sail into
## its disc and the hull is set back on the rim with the helm saying why.
##
## REACH: a ship from its dock (hull + (-340, 250)) inside 300; a post or a
## chest from its island's edge inside 240; the nearest wins.

signal node_pressed(node_id: String)

const SKIN: float = 14.0
const ENCOUNTER_REACH: float = 300.0
const ISLE_REACH: float = 240.0
const DOCK_OFF: Vector2 = Vector2(-340, 250)
const GOLD: Color = Color(1.0, 0.82, 0.38)

## The shown campaign isles (collision, Chart.off_shore) and the shut bays
## (the hold, Boat), kept current by refresh().
static var solid: Array = []
static var shut: Array = []

var sea: Sea
var view: Dictionary = {}
var status: Dictionary = {}
var next_id: String = ""
var _isles: Dictionary = {}
var _ships: Dictionary = {}
var _seen: Dictionary = {}
var _primed: bool = false


func _ready() -> void:
	var w: Dictionary = Campaign.water()
	var carries: Dictionary = {}
	for c: Dictionary in w["caches"]:
		carries[c["isle"]] = { "node": c["node"], "kind": "cache" }
	for b: Dictionary in w["beats"]:
		carries[b["isle"]] = { "node": b["node"], "kind": "beat" }
	for i: Dictionary in w["isles"]:
		var n: Isle = Isle.new()
		n.isle = i
		n.carries = carries.get(i["id"], {})
		sea._world.add_child(n)
		_isles[i["id"]] = n
	for e: Dictionary in w["encounters"]:
		var s: Ship = Ship.new()
		s.enc = e
		sea._world.add_child(s)
		_ships[e["node"]] = s
	refresh()


## Read the map again and set every mark, island and bay by it. Anything that
## came into view since the last read rises out of the water.
func refresh() -> void:
	view = RulesApi.run(sea.session.store, sea.session.uid, "getRaidMapView", [])
	status = Campaign.statuses(view)
	next_id = ""
	for x: Dictionary in view["views"]:
		if x["status"] == "available" and x["node"].get("sideBranch") == null:
			next_id = x["node"]["id"]
			break
	var sol: Array = []
	for id: String in _isles:
		var n: Isle = _isles[id]
		var nid: String = str(n.carries.get("node", ""))
		var vis: bool = nid == "" or shown(nid)
		n.visible = vis
		if vis:
			sol.append(n.isle)
		if nid != "":
			n.set_state(str(status.get(nid, "locked")), nid == next_id, _primed and vis and not _seen.get(nid, false), sea._field)
			_seen[nid] = vis
	solid = sol
	for nid: String in _ships:
		var s: Ship = _ships[nid]
		var vis2: bool = shown(nid)
		s.visible = vis2
		s.set_state(str(status.get(nid, "locked")), nid == next_id, _primed and vis2 and not _seen.get(nid, false), sea._field)
		_seen[nid] = vis2
	var sh: Array = []
	for b: Dictionary in Campaign.water()["bays"]:
		if b.get("opensBy") != null and status.get(b["opensBy"]) != "cleared":
			sh.append(b)
	shut = sh
	_primed = true


var _bay_in: String = ""


## The names come up as you near an island; the docks light as you near them;
## sailing into a bay names its chapter across the sky.
func _process(_delta: float) -> void:
	var at: Vector2 = sea._boat.position
	var bay: Dictionary = bay_at(at)
	var bid: String = str(bay.get("id", ""))
	if bid != _bay_in:
		_bay_in = bid
		if bid != "" and not shut.has(bay) and sea.stage == null:
			var ch: Dictionary = {}
			for c: Dictionary in Campaign.chapters():
				if int(c["number"]) == int(bay["chapter"]):
					ch = c
			var num: String = str(ch.get("romanNumeral", ""))
			sea._hud.side_banner(str(bay["name"]), ("Chapter %s" % num) if num != "" else "The last of it")
			Sound.horn()
	for id: String in _isles:
		var n: Isle = _isles[id]
		n.near = n.visible and at.distance_to(n.position) < float(n.isle["r"]) + 700.0
	for nid: String in _ships:
		(_ships[nid] as Ship).boat_at = at
		(_ships[nid] as Ship).fighting = sea.stage != null


func shown(id: String) -> bool:
	if status.get(id, "locked") != "locked":
		return true
	return Campaign.node(id).get("previewWhenLocked") == true


## A ship's mark, by node, for the fight to take over.
func ship(node_id: String) -> Ship:
	return _ships.get(node_id)


## The bay this point is in (its disc), or {}.
static func bay_at(at: Vector2) -> Dictionary:
	for b: Dictionary in Campaign.water()["bays"]:
		var c: Vector2 = Vector2(float(b["centre"]["x"]), float(b["centre"]["y"]))
		if at.distance_to(c) <= float(b["r"]):
			return b
	return {}


## outOfWater: a hull inside a shut bay goes back to its rim, SKIN outside.
static func hold(at: Vector2) -> Dictionary:
	for b: Dictionary in shut:
		var c: Vector2 = Vector2(float(b["centre"]["x"]), float(b["centre"]["y"]))
		var d: Vector2 = at - c
		if d.length() <= float(b["r"]):
			var u: Vector2 = d.normalized() if d.length() > 0.001 else Vector2.UP
			return { "hit": true, "at": c + u * (float(b["r"]) + SKIN), "out": u, "line": b["shutLine"] }
	return { "hit": false }


## What is in reach: [label, Callable] for the nearest shown node, or null.
func reach(at: Vector2) -> Variant:
	var best: float = INF
	var pick: String = ""
	for nid: String in _ships:
		var s: Ship = _ships[nid]
		if not s.visible:
			continue
		var d: float = at.distance_to(s.dock())
		if d < ENCOUNTER_REACH and d < best:
			best = d
			pick = nid
	for id: String in _isles:
		var n: Isle = _isles[id]
		var nid2: String = str(n.carries.get("node", ""))
		if nid2 == "" or not n.visible:
			continue
		var d2: float = at.distance_to(n.position) - float(n.isle["r"])
		if d2 < ISLE_REACH and d2 < best:
			best = d2
			pick = nid2
	if pick == "":
		return null
	return [label_for(pick), func() -> void: node_pressed.emit(pick)]


## verbFor: what the helm offers at a node.
func label_for(id: String) -> String:
	var n: Dictionary = Campaign.node(id)
	var st: String = str(status.get(id, "locked"))
	var lab: String = str(n["label"])
	var t: String = str(n["type"])
	if t == "raid" or t == "skirmish":
		if st == "locked":
			return "Look at %s" % lab if n.get("previewWhenLocked") == true else "%s, not yet" % lab
		return "Take on %s%s" % [lab, " again" if st == "cleared" else ""]
	if st == "locked":
		return "%s, not yet" % lab
	if st == "cleared":
		return ("Read again: %s" if n.get("scene") != null and (t == "story" or t == "berth") else "Look again at %s") % lab
	var verb: String = "Read"
	if t == "milestone":
		verb = "Settle with"
	elif n.get("choice") != null:
		verb = "Open the"
	elif n.get("classPick") != null:
		verb = "Make"
	elif n.get("puzzle") != null:
		verb = "Crack"
	elif n.get("dice") != null:
		verb = "Throw at"
	elif n.get("dpsCheck") != null:
		verb = "Run"
	elif n.get("event") != null:
		verb = "Make the call at"
	elif n.get("muster") != null:
		verb = "Stand"
	elif t == "berth":
		verb = "Hear the yard at"
	elif t == "spoils":
		verb = "Divide"
	return "%s %s" % [verb, lab]


# ── The glyph over a node: a gold "?" for the next stop, a tick once done ─────

class Glyph:
	extends Node2D
	var kind: String = ""
	var _t: float = randf() * 6.0

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		if kind == "":
			return
		var f: Font = Kit.font("cinzel", 900)
		var bob: float = sin(_t * 2.4) * 7.0 if kind == "next" else 0.0
		if kind == "next":
			var pulse: float = 0.5 + 0.5 * sin(_t * 2.4)
			draw_circle(Vector2(0, bob), 30.0 + 4.0 * pulse, Color(1.0, 0.82, 0.38, 0.16 + 0.1 * pulse))
			draw_circle(Vector2(0, bob), 22.0, Color(0.1, 0.07, 0.03, 0.82))
			draw_arc(Vector2(0, bob), 22.0, 0.0, TAU, 40, GOLD, 3.0, true)
			var sz: Vector2 = f.get_string_size("?", HORIZONTAL_ALIGNMENT_LEFT, -1, 30)
			draw_string(f, Vector2(-sz.x / 2.0, bob + 11.0), "?", HORIZONTAL_ALIGNMENT_LEFT, -1, 30, GOLD)
		else:
			draw_circle(Vector2.ZERO, 17.0, Color(0.05, 0.12, 0.08, 0.8))
			draw_arc(Vector2.ZERO, 17.0, 0.0, TAU, 32, Color(0.5, 0.86, 0.58), 2.5, true)
			draw_polyline(PackedVector2Array([Vector2(-8, 0), Vector2(-2, 7), Vector2(9, -7)]), Color(0.6, 0.95, 0.66), 3.5, true)


## The rise of a mark coming into view: two gold rings on the water, a glow,
## and the mark itself lifting out of it (NodeReveal).
static func reveal(holder: Node2D, mark: Node2D, field: SeaField) -> void:
	if field != null:
		field.ring(holder.position, 260.0, 1.5, 0.9)
		holder.get_tree().create_timer(0.34).timeout.connect(func() -> void: field.ring(holder.position, 260.0, 1.5, 0.7))
	var g: Sprite2D = Sprite2D.new()
	g.texture = Glow.radial(128, GOLD)
	g.scale = Vector2(4.6, 4.6 / Chart.GROUND) * 0.6
	g.modulate.a = 0.0
	g.z_index = -1
	holder.add_child(g)
	var tw: Tween = holder.create_tween()
	tw.tween_property(g, "modulate:a", 0.8, 0.3)
	tw.tween_property(g, "modulate:a", 0.0, 1.6)
	tw.tween_callback(g.queue_free)
	var to: Vector2 = mark.position
	mark.position = to + Vector2(0, 26.0 / Chart.GROUND)
	mark.modulate.a = 0.0
	var t2: Tween = holder.create_tween().set_parallel()
	t2.tween_property(mark, "position", to, 0.85).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	t2.tween_property(mark, "modulate:a", 1.0, 0.85)
	Sound.chest(false)


# ── An island of the campaign: its plate, and the post or chest on it ────────

class Isle:
	extends Node2D
	var isle: Dictionary = {}
	var carries: Dictionary = {}
	var near: bool = false
	var _prop: Sprite2D
	var _halo: Sprite2D
	var _glyph: Glyph
	var _name: Label
	var _label: Node2D
	var _st: String = ""
	var _t: float = randf() * 6.0

	func _ready() -> void:
		position = Vector2(float(isle["x"]), float(isle["y"]))
		var r: float = float(isle["r"])
		var pl: Variant = isle.get("plate")
		if pl != null:
			var plate: Sprite2D = Sprite2D.new()
			plate.texture = Lit.tex(String((pl as Dictionary)["art"]))
			if plate.texture != null:
				var w: float = r * 2.0 * float(pl.get("width", 1.0))
				var sc: float = w / float(plate.texture.get_width())
				plate.scale = Vector2(sc, sc / Chart.GROUND)
				plate.position = Vector2(0, (0.5 - float(pl.get("water", 0.42))) * plate.texture.get_height() * sc / Chart.GROUND)
				plate.z_index = -2
				add_child(plate)
				Shore.trace(plate)
		_label = Node2D.new()
		_label.scale = Vector2(1.0, 1.0 / Chart.GROUND)
		_label.position = Vector2(0, -r * 1.05)
		_label.z_index = 6
		add_child(_label)
		_name = Kit.lift(Kit.text(_label, str(isle["name"]), "heading", Kit.INK))
		_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_name.resized.connect(func() -> void: _name.position = Vector2(-_name.size.x / 2.0, -_name.size.y))
		_label.visible = false
		if carries.is_empty():
			return
		_halo = Sprite2D.new()
		_halo.texture = Glow.radial(128, GOLD)
		_halo.z_index = -1
		_halo.visible = false
		add_child(_halo)
		_prop = Sprite2D.new()
		add_child(_prop)
		_glyph = Glyph.new()
		_glyph.scale = Vector2(1.0, 1.0 / Chart.GROUND)
		_glyph.z_index = 7
		add_child(_glyph)

	func set_state(st: String, is_next: bool, rising: bool, field: SeaField) -> void:
		_st = st
		var r: float = float(isle["r"])
		var chest: bool = carries.get("kind") == "cache"
		_prop.texture = Skipper.tex("sea/isle-chest-open.png" if chest and st == "cleared" else ("sea/isle-chest.png" if chest else "sea/isle-note.png"))
		if _prop.texture != null:
			var w: float = r * (0.34 if chest else 0.26)
			var sc: float = w / float(_prop.texture.get_width())
			_prop.scale = Vector2(sc, sc / Chart.GROUND)
			_prop.offset = Vector2(0, -_prop.texture.get_height() / 2.0)
			_prop.position = Vector2(0, r * 0.08)
			_glyph.position = Vector2(0, r * 0.08 - _prop.texture.get_height() * sc / Chart.GROUND - 40.0 / Chart.GROUND)
			_label.position = Vector2(0, minf(-r * 1.05, _glyph.position.y - 40.0 / Chart.GROUND))
			_halo.scale = Vector2(w * 4.2, w * 2.4) / 128.0
			_halo.position = _prop.position + Vector2(0, -_prop.texture.get_height() * sc / Chart.GROUND * 0.5)
		match st:
			"cleared":
				_prop.modulate = Color(0.86, 0.88, 0.84, 0.66 if not chest else 0.9)
			"locked":
				_prop.modulate = Color(0.62, 0.68, 0.78, 0.9)
			_:
				_prop.modulate = Color.WHITE
		_halo.visible = st == "available"
		_glyph.kind = "next" if is_next else ("done" if st == "cleared" else "")
		if rising:
			CampaignWater.reveal(self, _prop, field)

	func _process(delta: float) -> void:
		_t += delta
		if _halo != null and _halo.visible:
			_halo.modulate.a = 0.28 + 0.22 * sin(_t * TAU / 2.6)
		_label.visible = near


# ── A ship riding at anchor: the fight waiting for you ───────────────────────

class Ship:
	extends Node2D
	var enc: Dictionary = {}
	var boat_at: Vector2 = Vector2.INF
	var rig: HullRig
	var _face: Sprite2D
	var _glyph: Glyph
	var _st: String = ""
	var _near: bool = false
	var _t: float = randf() * 6.0
	var _w: float = 300.0

	func dock() -> Vector2:
		return position + DOCK_OFF

	func _ready() -> void:
		position = Vector2(float(enc["at"]["x"]), float(enc["at"]["y"]))
		var art: Dictionary = Js.obj(enc.get("art"))
		rig = HullRig.new()
		rig.tex = Skipper.tex(str(enc.get("hull", "")).trim_prefix("/"))
		_w = float(art.get("box", 240.0)) / 0.8
		rig.box = _w
		rig.face = -1.0
		add_child(rig)
		_face = Sprite2D.new()
		_face.texture = Skipper.tex(str(enc.get("portrait", "")).trim_prefix("/"))
		if _face.texture != null:
			var s: float = _w * 0.46 / float(_face.texture.get_width())
			_face.scale = Vector2(s, s / Chart.GROUND)
			_face.offset = Vector2(0, -_face.texture.get_height() / 2.0)
		_face.position = Vector2(0, -_w * 0.74 / Chart.GROUND)
		_face.z_index = 5
		add_child(_face)
		_glyph = Glyph.new()
		_glyph.scale = Vector2(1.0, 1.0 / Chart.GROUND)
		_glyph.z_index = 7
		add_child(_glyph)

	func set_state(st: String, is_next: bool, rising: bool, field: SeaField) -> void:
		_st = st
		_face.visible = st != "locked"
		_face.modulate = Color(0.62, 0.62, 0.62, 0.7) if st == "cleared" else Color.WHITE
		rig.modulate = Color(0.68, 0.72, 0.8) if st == "locked" else (Color(1, 1, 1, 0.85) if st == "cleared" else Color.WHITE)
		_glyph.kind = "next" if is_next else ("done" if st == "cleared" else "")
		var top: float = -_w * 0.74 / Chart.GROUND
		if _face.texture != null and _face.visible:
			top -= _face.texture.get_height() * _face.scale.y
		_glyph.position = Vector2(0, top - 34.0 / Chart.GROUND)
		if rising:
			CampaignWater.reveal(self, rig, field)

	func _process(delta: float) -> void:
		_t += delta
		_face.position.y = (-_w * 0.74 + sin(_t * TAU / 6.8) * 6.0) / Chart.GROUND
		queue_redraw()

	## The dock: the patch of water you fight from, gold when you are in it.
	var fighting: bool = false

	func _draw() -> void:
		if _st == "locked" or fighting:
			return
		var inside: bool = boat_at.distance_to(dock()) < ENCOUNTER_REACH
		var col: Color = GOLD if inside else Color(0.85, 0.92, 1.0)
		var a: float = 0.32 if inside else 0.14
		draw_circle(DOCK_OFF, ENCOUNTER_REACH, Color(col, a * 0.18))
		draw_arc(DOCK_OFF, ENCOUNTER_REACH, 0.0, TAU, 64, Color(col, a + 0.1 * sin(_t * 2.0)), 3.0, true)
		draw_arc(DOCK_OFF, ENCOUNTER_REACH * 0.9, 0.0, TAU, 64, Color(col, a * 0.4), 1.5, true)
