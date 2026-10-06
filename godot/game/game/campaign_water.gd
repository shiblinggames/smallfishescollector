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
## chest from its island's edge inside 240; the nearest wins. The gauntlets'
## maelstroms (Davy's in the junction, the Don's in the Last Fathom, port
## rules) from their rim.

signal node_pressed(node_id: String)

const SKIN: float = 14.0
const ENCOUNTER_REACH: float = 300.0
const ISLE_REACH: float = 240.0
const DOCK_OFF: Vector2 = Vector2(-340, 250)
const PORTAL_REACH: float = 340.0
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
var _homes: Array = []
var _spans: Array = []
var _maelstroms: Array = []
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
	for pt: Dictionary in w["portals"]:
		var h: WayHome = WayHome.new()
		h.info = pt
		sea._world.add_child(h)
		_homes.append(h)
	for sp: Dictionary in w["spans"]:
		var c: Span = Span.new()
		c.info = sp
		sea._world.add_child(c)
		_spans.append(c)
	for fb: Dictionary in w["banks"]:
		var f: FogBank = FogBank.new()
		f.info = fb
		sea._world.add_child(f)
	for ml: Dictionary in Js.list(w.get("maelstroms")):
		var m: Maelstrom = Maelstrom.new()
		m.info = ml
		sea._world.add_child(m)
		_maelstroms.append(m)
	refresh()


## Where a campaign stop stands on the water (its ship or its island), or null.
func node_at(nid: String) -> Variant:
	if _ships.has(nid):
		return (_ships[nid] as Node2D).position
	for id: String in _isles:
		var n: Isle = _isles[id]
		if str(n.carries.get("node", "")) == nid:
			return n.position
	return null


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
		var rid: String = str(Campaign.node(nid).get("raidId", ""))
		s.seals = RaidRun.tier_clears(sea.session.store, sea.session.uid, rid) if rid != "" and not rid.ends_with("_challenge") and Battle.raid_def(rid).get("skirmish", false) != true else {}
		_seen[nid] = vis2
	for h: WayHome in _homes:
		h.open = status.get(h.info["node"]) == "cleared"
	for c: Span in _spans:
		c.cleared = status.get(c.info["node"]) == "cleared"
	for m: Maelstrom in _maelstroms:
		# A maelstrom in a shut bay is not drawn; one whose descent is still
		# shut turns quieter, and says why at the rim.
		var c0: Vector2 = m.position
		var in_shut: bool = false
		for b0: Dictionary in Campaign.water()["bays"]:
			if b0.get("opensBy") != null and status.get(b0["opensBy"]) != "cleared" and c0.distance_to(Vector2(float(b0["centre"]["x"]), float(b0["centre"]["y"]))) <= float(b0["r"]):
				in_shut = true
		m.visible = not in_shut
		m.why = GauntletTable.shut(sea.session, str(m.info["id"]))
		# The Don's Ghost stands in his door only once the Throne is down.
		m.show_keeper = str(m.info["id"]) != "don" or sea.session.store.clear_count(sea.session.uid, "the_throne") > 0
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


## The chapter whose celebration is owed (state-based: every main stop of the
## chapter before it cleared, and not yet seen), or {}.
func owed_chapter() -> Dictionary:
	var chs: Array = Campaign.chapters()
	var seen: Array = Js.list(view.get("seenChapterUnlocks"))
	for i: int in range(1, mini(5, chs.size())):
		var ch: Dictionary = chs[i]
		if seen.has(ch["id"]):
			continue
		var prev: String = str(chs[i - 1]["id"])
		var all: bool = true
		for n: Dictionary in Campaign.nodes():
			if Campaign.chapter_for(str(n["id"]))["id"] != prev or n.get("sideBranch") != null or n.get("comingSoon") == true:
				continue
			if status.get(n["id"]) != "cleared":
				all = false
				break
		if all:
			return ch
	return {}


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
	var home: WayHome = null
	for h: WayHome in _homes:
		h.gather = h.open and at.distance_to(h.position) < PORTAL_REACH
		if h.gather and at.distance_to(h.position) < best:
			best = at.distance_to(h.position)
			home = h
	for m: Maelstrom in _maelstroms:
		var dm: float = at.distance_to(m.position) - float(m.info["r"])
		m.gather = m.visible and dm < 420.0
		if m.gather and dm < best:
			best = dm
			home = null
			pick = ""
			var variant: String = str(m.info["id"])
			if m.why != "":
				return ["%s: %s" % [m.info["name"], m.why], func() -> void: sea._hud.toast(m.why)]
			return ["Dive into %s" % m.info["name"], func() -> void: sea.open_gauntlet(variant)]
	if home != null:
		var to: Dictionary = Campaign.water()["portalHome"]
		return ["Take the way home", func() -> void: sea._warp(float(to["x"]), float(to["y"]), Color(0.55, 0.85, 0.95))]
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
		var hull_art: String = North.fleet_art(enc.get("hull", ""), str(enc.get("bay", "")))
		rig.tex = Skipper.tex(hull_art.trim_prefix("/"))
		rig.def = { "seaFlip": North.bow_left(hull_art) }
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
	## The tiers of this raid beaten (gold seals under the hull).
	var seals: Dictionary = {}

	func _draw() -> void:
		if _st == "locked" or fighting:
			return
		# Its tiers beaten: Normal, Co-op, Co-op Challenge, as seals on the water.
		if not seals.is_empty() and seals.get("normal", false):
			draw_set_transform(Vector2(0, 64), 0.0, Vector2(1.0, 1.0 / Chart.GROUND * 0.6))
			for q: int in 3:
				ReadyScreen.seal(self, Vector2(-44.0 + q * 44.0, 0), 15.0, seals.get(["normal", "coop", "coopc"][q], false) == true)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		var inside: bool = boat_at.distance_to(dock()) < ENCOUNTER_REACH
		var col: Color = GOLD if inside else Color(0.85, 0.92, 1.0)
		var a: float = 0.32 if inside else 0.14
		draw_circle(DOCK_OFF, ENCOUNTER_REACH, Color(col, a * 0.18))
		draw_arc(DOCK_OFF, ENCOUNTER_REACH, 0.0, TAU, 64, Color(col, a + 0.1 * sin(_t * 2.0)), 3.0, true)
		draw_arc(DOCK_OFF, ENCOUNTER_REACH * 0.9, 0.0, TAU, 64, Color(col, a * 0.4), 1.5, true)


# ── A way home: a well beside a beaten raid's anchorage ──────────────────────

## A WAY HOME (RETURN_PORTALS): one beside each raid's anchorage, opening once
## that raid is beaten; take it and she comes out at the anchorage's mouth.
class WayHome:
	extends Node2D
	var info: Dictionary = {}
	var open: bool = false
	var gather: bool = false
	var _t: float = randf() * 4.0
	var _g: float = 0.0
	var _label: Label

	func _ready() -> void:
		position = Vector2(float(info["at"]["x"]), float(info["at"]["y"]))
		z_index = -1
		var holder: Node2D = Node2D.new()
		holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
		holder.position = Vector2(0, PORTAL_REACH * 0.7)
		holder.z_index = 6
		add_child(holder)
		_label = Kit.lift(Kit.text(holder, "Way Home", "heading", Color("#eef4f8")))
		_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_label.resized.connect(func() -> void: _label.position = Vector2(-_label.size.x / 2.0, 0))

	func _process(delta: float) -> void:
		_t += delta
		_g = move_toward(_g, 1.0 if gather else 0.0, delta * 2.0)
		visible = open
		queue_redraw()

	func _draw() -> void:
		var r: float = PORTAL_REACH
		var c: Color = Color(0.55, 0.85, 0.95)
		var hot: float = 1.5 + _g * 1.2
		var spin: float = -_t * (0.4 + _g * 0.9)
		draw_circle(Vector2.ZERO, r, Color(c, 0.08 + 0.08 * _g))
		draw_circle(Vector2.ZERO, r * 0.4, Color(c, 0.12 + 0.18 * _g))
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 128, Color(c, 0.5 + 0.3 * _g), 4.0, true)
		for k: int in 5:
			var a0: float = spin + k * TAU / 5.0
			for s: int in 3:
				var arm: Color = c.lightened(0.3) * hot
				arm.a = (0.3 - s * 0.08) * (0.7 + 0.5 * _g)
				draw_arc(Vector2.ZERO, r * (0.88 - s * 0.22), a0 + s * 0.5, a0 + s * 0.5 + 0.9, 24, arm, 3.0 - s * 0.6, true)


# ── The Coffers' gate and boom: iron across the channel until it is beaten ───

## A SPAN (seaChains.ts): the harbor gate's eleven iron bars between its two
## posts, or the boom's sagging chain on three floats between the wall's two
## rocks. Decoration (the rocks either end are the solid part). Once its stop
## is cleared the gate's bars blow outward from the middle and the boom goes
## slack and sinks, easing open at 0.7 a second; on first sight it is
## simply as it is.
class Span:
	extends Node2D
	var info: Dictionary = {}
	var cleared: bool = false
	var _open: float = -1.0
	var _t: float = 0.0

	func _process(delta: float) -> void:
		_t += delta
		var want: float = 1.0 if cleared else 0.0
		_open = want if _open < 0.0 else move_toward(_open, want, delta * 0.7)
		visible = _open < 0.999
		queue_redraw()

	func _draw() -> void:
		var a: Vector2 = Vector2(float(info["ends"]["a"]["x"]), float(info["ends"]["a"]["y"]))
		var b: Vector2 = Vector2(float(info["ends"]["b"]["x"]), float(info["ends"]["b"]["y"]))
		var u: float = clampf(_open, 0.0, 1.0)
		var fade: float = 1.0 - smoothstep(0.55, 1.0, u)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 1.0 / Chart.GROUND))
		var A: Vector2 = Vector2(a.x, a.y * Chart.GROUND)
		var B: Vector2 = Vector2(b.x, b.y * Chart.GROUND)
		var iron: Color = Color(0.2, 0.19, 0.18, fade)
		var rust: Color = Color(0.45, 0.27, 0.16, fade)
		if info["kind"] == "gate":
			# The bars, standing out of the water, blown outward from the middle.
			var mid: Vector2 = (A + B) / 2.0
			var n: int = 11
			var top: float = 150.0
			draw_line(A + Vector2(0, -top), B + Vector2(0, -top), Color(iron, fade * (1.0 - u)), 9.0, true)
			for k: int in n:
				var f: float = (k + 0.5) / n
				var foot: Vector2 = A.lerp(B, f)
				var away: Vector2 = (foot - mid).normalized() * 160.0 * u * (0.6 + absf(f - 0.5))
				var fall: float = 120.0 * u * u
				var tilt: float = (f - 0.5) * 1.6 * u
				var p0: Vector2 = foot + away + Vector2(0, fall)
				var p1: Vector2 = p0 + Vector2(sin(tilt), -cos(tilt)) * top
				draw_line(p0, p1, iron, 10.0, true)
				draw_line(p0 + Vector2(-2, 0), p1 + Vector2(-2, 0), rust, 3.0, true)
				draw_circle(p1, 7.0, iron)
		else:
			# The boom: links along a sagging line, three floats, going slack and down.
			var len: float = A.distance_to(B)
			var sag: float = 0.055 * len * (1.0 + 2.2 * u)
			var sink: float = 100.0 * u
			var pts: PackedVector2Array = PackedVector2Array()
			for k: int in 27:
				var f2: float = k / 26.0
				var p: Vector2 = A.lerp(B, f2) + Vector2(0, sin(f2 * PI) * sag + sink + sin(_t * 1.4 + f2 * 6.0) * 3.0)
				pts.append(p)
			for k: int in 26:
				var c: Vector2 = (pts[k] + pts[k + 1]) / 2.0
				var d: Vector2 = (pts[k + 1] - pts[k])
				draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 1.0 / Chart.GROUND))
				var w: Vector2 = d.normalized() * d.length() * 0.62
				var h2: Vector2 = d.normalized().orthogonal() * (6.0 if k % 2 == 0 else 3.0)
				var poly: PackedVector2Array = PackedVector2Array([c - w / 2.0 - h2, c + w / 2.0 - h2, c + w / 2.0 + h2, c - w / 2.0 + h2])
				draw_colored_polygon(poly, iron)
				poly.append(poly[0])
				draw_polyline(poly, rust, 1.5, true)
			for f3: float in [0.25, 0.5, 0.75]:
				var fp: Vector2 = A.lerp(B, f3) + Vector2(0, sin(f3 * PI) * sag * 0.6 + sink * 1.1 + sin(_t * 1.2 + f3 * 5.0) * 4.0)
				draw_circle(fp, 22.0, Color(0.42, 0.28, 0.16, fade))
				draw_circle(fp + Vector2(-5, -6), 8.0, Color(0.62, 0.44, 0.26, fade))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


# ── The Sounding: a fog bank that never lifts ─────────────────────────────────

## A FOG BANK (seaBanks.ts): seven puffs lying on the water and four drifting
## in the air above them, pale and breathing, drawn lighter than the sea.
class FogBank:
	extends Node2D
	var info: Dictionary = {}
	var _puffs: Array = []
	var _t: float = 0.0

	func _ready() -> void:
		position = Vector2(float(info["at"]["x"]), float(info["at"]["y"]))
		z_index = 8
		var r: float = float(info["r"])
		var mat: CanvasItemMaterial = CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		var tex: Texture2D = Glow.radial(256, Color(0.85, 0.9, 0.95))
		var rnd: RandomNumberGenerator = RandomNumberGenerator.new()
		rnd.seed = hash(str(info["id"]))
		for k: int in 11:
			var lying: bool = k < 7
			var s: Sprite2D = Sprite2D.new()
			s.texture = tex
			s.material = mat
			var size: float = r * (rnd.randf_range(0.9, 1.6) if lying else rnd.randf_range(1.5, 2.2))
			s.scale = Vector2(size, size * (1.0 if lying else 0.62 / Chart.GROUND)) / 128.0
			var at: Vector2 = Vector2.from_angle(rnd.randf() * TAU) * r * rnd.randf_range(0.0, 0.7)
			s.position = at
			add_child(s)
			_puffs.append({ "s": s, "at": at, "ph": rnd.randf() * TAU, "lying": lying, "a": float(info["density"]) * (0.85 if lying else 0.5) * rnd.randf_range(0.7, 1.2) })

	func _process(delta: float) -> void:
		_t += delta
		for p: Dictionary in _puffs:
			var s: Sprite2D = p["s"]
			var ph: float = float(p["ph"])
			s.position = (p["at"] as Vector2) + Vector2(sin(_t * 0.05 + ph) * 160.0, cos(_t * 0.037 + ph * 1.3) * 90.0)
			s.modulate.a = float(p["a"]) * (0.8 + 0.2 * sin(_t * 0.3 + ph)) * 0.55



# ── A gauntlet's maelstrom: the water turning down into the deep ─────────────

## The pull of the maelstroms on a hull (Boat._flow): within twice the rim the
## water carries her round and in, harder the nearer; inside the eye's lip it
## throws her back out (the dive is a choice, never an accident).
static func whirl(at: Vector2) -> Vector2:
	var out: Vector2 = Vector2.ZERO
	for m: Dictionary in Js.list(Campaign.water().get("maelstroms")):
		var c: Vector2 = Vector2(float(m["x"]), float(m["y"]))
		var r: float = float(m["r"])
		var d: Vector2 = at - c
		var dist: float = d.length()
		if dist > r * 2.2 or dist < 1.0:
			continue
		var u: Vector2 = d / dist
		var k: float = 1.0 - smoothstep(r * 0.5, r * 2.2, dist)
		var spin: float = -1.0 if str(m.get("id", "")) == "don" else 1.0
		out += u.orthogonal() * spin * 260.0 * k
		if dist < r * 0.42:
			out += u * 420.0 * (1.0 - dist / (r * 0.42))
		else:
			out -= u * 120.0 * k
	return out
