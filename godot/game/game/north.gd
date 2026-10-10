class_name North
extends RefCounted
## NORTH OF THE REEF (Kong, 2026-10-02: "build out the northern region now,
## with the Crew Hall and everything else"; places first). A port of the
## reef, the anchorage and the Sea Gate in app/(app)/sea/chart.ts and the rock
## that draws them (reefRocks, anchorageRocks in SeaMap.tsx).
##
## THE REEF runs the whole width of the chart at NORTH_WALL, rock all the way,
## with one gap: the arch at GATE_X. Sailing through it is how you leave the
## fishing grounds, and under the sign in the passage the boat changes under
## you to your expedition ship (crossing back, the fishing boat again).
##
## THE ANCHORAGE is the harbour beyond it: a disc 3,600 across from
## EXP_ORIGIN, walled in the same rock wherever it is north of the reef, with
## the islands expeditions are run from (the Crew Hall with the Posting House
## and the Forge either side, the Gunwharf and the Charterhouse flanking the
## way out). THE SEA GATE is that way out, due north, dead opposite the arch;
## past it is the campaign's water (CampaignWater), open once a crew is seated.

const GATE_X: float = -900.0
const GATE_HALF: float = 430.0
const GATE_SIGN_Y: float = Explore.NORTH_WALL - 210.0
const EXP_ORIGIN: Vector2 = Vector2(0.0, Explore.NORTH_WALL - 1500.0)
const EXP_EDGE: float = 3600.0
const SEA_GATE: Vector2 = Vector2(0.0, Explore.NORTH_WALL - 1500.0 - 3600.0)
const SEA_GATE_HALF: float = 620.0
const REEF_STEP: float = 700.0
const PEBBLE_STEP: float = 175.0
## How far off the rock a hull's centre keeps.
const KEEP: float = 150.0

## The port's own rock (Godot over the web baseline; Kong 2026-10-02: the
## web's pale side-on crags did not fit), painted from the camera's angle in
## the islands' blue-grey stone: [art, least width, most width].
const BOULDERS: Array = [["sea/north-reef-1.png", 480.0, 660.0], ["sea/north-reef-2.png", 400.0, 560.0], ["sea/north-reef-3.png", 300.0, 400.0], ["sea/north-reef-4.png", 420.0, 580.0], ["sea/north-reef-5.png", 400.0, 540.0], ["sea/north-reef-6.png", 380.0, 520.0], ["sea/north-reef-9.png", 460.0, 620.0], ["sea/north-reef-10.png", 360.0, 480.0]]
const SHINGLE: Array = [["sea/north-reef-7.png", 160.0, 300.0], ["sea/north-reef-8.png", 200.0, 340.0], ["sea/north-reef-2.png", 150.0, 260.0], ["sea/north-reef-5.png", 150.0, 240.0]]
## The anchorage's wall: older, darker basalt.
const WALL: Array = [["sea/north-wall-1.png", 480.0, 660.0], ["sea/north-wall-2.png", 340.0, 460.0], ["sea/north-wall-3.png", 420.0, 580.0], ["sea/north-wall-4.png", 420.0, 560.0]]
const WALL_SHINGLE: Array = [["sea/north-wall-5.png", 170.0, 320.0], ["sea/north-wall-3.png", 160.0, 280.0], ["sea/north-reef-8.png", 180.0, 300.0]]
## The arch: one picture over the passage; its opening is 0.26 to 0.83 of its
## width, and its far (right) footing stands higher in the picture than the near.
const ARCH: String = "sea/north-arch.png"
const ARCH_WIDE: float = 1600.0


## Is this point north of the reef (the anchorage)?
static func is_north(p: Vector2) -> bool:
	return p.y < Explore.NORTH_WALL


## Past the sign in the arch: the expedition ship's water.
static func ship_water(p: Vector2) -> bool:
	return p.y < GATE_SIGN_Y


## The wall's angle sweep: wherever the rim is north of the reef.
static func arc() -> Vector2:
	var s: float = (Explore.NORTH_WALL - EXP_ORIGIN.y) / EXP_EDGE
	var a: float = asin(s)
	return Vector2(PI - a, TAU + a)


## The xorshift the web rolls the rock with.
class Roll:
	extends RefCounted
	var s: int

	func _init(seed: int) -> void:
		s = seed

	func next() -> float:
		s = (s ^ (s << 13)) & 0xFFFFFFFF
		s = s ^ (s >> 17)
		s = (s ^ (s << 5)) & 0xFFFFFFFF
		return float(s) / 4294967296.0


static func _pick(list: Array, rnd: Roll) -> Array:
	return list[mini(list.size() - 1, int(floor(rnd.next() * list.size())))]


## Every rock of the reef and the anchorage's wall: [art, x, y, width], far
## (north) first, so the nearer ones draw over them.
static func rocks() -> Array:
	var out: Array = []
	var out_r: float = Chart.LAST_OUTER
	var nw: float = Explore.NORTH_WALL
	var rnd: Roll = Roll.new(0x7f4a7c15)
	# The reef: two staggered rows of boulders, clear of the arch.
	for row: int in 2:
		var x: float = -out_r - REEF_STEP + (row * REEF_STEP) / 2.0
		while x < out_r + REEF_STEP:
			if absf(x - GATE_X) >= GATE_HALF + 520.0:
				var b: Array = _pick(BOULDERS, rnd)
				var jx: float = (rnd.next() - 0.5) * REEF_STEP * 0.22
				var jy: float = (1.0 if row == 1 else -1.0) * 110.0 + (rnd.next() - 0.5) * 150.0
				out.append([b[0], x + jx, nw + jy, b[1] + rnd.next() * (b[2] - b[1])])
			x += REEF_STEP
	# The arch over the passage, and a stack behind either footing.
	out.append([ARCH, GATE_X - ARCH_WIDE * 0.045, nw + 60.0, ARCH_WIDE])
	for side: float in [-1.0, 1.0]:
		out.append(["sea/north-reef-3.png", GATE_X + side * (ARCH_WIDE * 0.5 + 120.0), nw - 120.0, 380.0])
	# The shingle, packed tight.
	var px: float = -out_r - PEBBLE_STEP
	while px < out_r + PEBBLE_STEP:
		if absf(px - GATE_X) >= GATE_HALF + 300.0:
			var p: Array = _pick(SHINGLE, rnd)
			var r: float = rnd.next()
			var jx2: float = (rnd.next() - 0.5) * PEBBLE_STEP * 0.8
			out.append([p[0], px + jx2, nw + (rnd.next() - 0.5) * 330.0, p[1] + r * r * (p[2] - p[1])])
		px += PEBBLE_STEP
	# The anchorage's wall, by angle, with the Sea Gate's gap at the middle.
	var a: Vector2 = arc()
	var mid: float = (a.x + a.y) / 2.0
	var at: Callable = func(th: float, off: float) -> Vector2:
		return EXP_ORIGIN + Vector2(cos(th), sin(th)) * (EXP_EDGE + off)
	var rnd2: Roll = Roll.new(0x1f83d9ab)
	var skip: float = (SEA_GATE_HALF + 520.0) / EXP_EDGE
	for row: int in 2:
		var step: float = REEF_STEP / EXP_EDGE
		var th: float = a.x + (row * step) / 2.0
		while th < a.y:
			if absf(th - mid) >= skip:
				var b: Array = _pick(WALL, rnd2)
				var q: Vector2 = at.call(th + (rnd2.next() - 0.5) * step * 0.22, (1.0 if row == 1 else -1.0) * 110.0 + (rnd2.next() - 0.5) * 150.0)
				out.append([b[0], q.x, q.y, b[1] + rnd2.next() * (b[2] - b[1])])
			th += step
	var gate: float = (SEA_GATE_HALF + 370.0) / EXP_EDGE
	var gw: Vector2 = at.call(mid - gate, 40.0)
	var ge: Vector2 = at.call(mid + gate, 40.0)
	out.append(["sea/north-wall-2.png", gw.x, gw.y, 620.0])
	out.append(["sea/north-wall-2.png", ge.x, ge.y, 620.0])
	for side: float in [-1.0, 1.0]:
		var c: Vector2 = at.call(mid + side * (SEA_GATE_HALF + 640.0) / EXP_EDGE, -140.0)
		out.append(["sea/north-wall-1.png", c.x, c.y, 560.0])
	var pskip: float = (SEA_GATE_HALF + 300.0) / EXP_EDGE
	var pstep: float = PEBBLE_STEP / EXP_EDGE
	var pth: float = a.x
	while pth < a.y:
		if absf(pth - mid) >= pskip:
			var sp: Array = _pick(SHINGLE, rnd2)
			var r2: float = rnd2.next()
			var q2: Vector2 = at.call(pth + (rnd2.next() - 0.5) * pstep * 0.8, (rnd2.next() - 0.5) * 330.0)
			out.append([sp[0], q2.x, q2.y, sp[1] + r2 * r2 * (sp[2] - sp[1])])
		pth += pstep
	out.sort_custom(func(p: Array, q: Array) -> bool: return float(p[2]) < float(q[2]))
	return out


## Whether the Sea Gate lets her out: only with somebody seated to fight
## (the Sea sets it from the raid party).
static var gate_open: bool = true
## How far out the campaign's water runs, from the anchorage's centre.
const RAID_EDGE: float = 21000.0


## Where a hull moving from `from` to `to` may go: the reef stops it except in
## the arch; the anchorage's wall stops it, from either side, except in the
## Sea Gate's mouth (and there only with a crew aboard); past it, the
## campaign's water runs to RAID_EDGE.
## { at, hit, why } with why "" / "reef" / "wall" / "gate" / "edge".
static func hold(from: Vector2, to: Vector2) -> Dictionary:
	var nw: float = Explore.NORTH_WALL
	var out: Vector2 = to
	var why: String = ""
	# Through the reef only in the arch.
	var crossing: bool = (from.y >= nw) != (to.y >= nw) or absf(to.y - nw) < KEEP * 0.5
	if crossing and absf(to.x - GATE_X) > GATE_HALF - 60.0:
		out.y = nw + (KEEP * 0.5 if from.y >= nw else -KEEP * 0.5)
		why = "reef"
	if out.y < nw:
		var d: Vector2 = out - EXP_ORIGIN
		var mouth: bool = out.distance_to(SEA_GATE) < SEA_GATE_HALF + KEEP
		if from.distance_to(EXP_ORIGIN) <= EXP_EDGE:
			# Inside the anchorage's wall.
			var lim: float = EXP_EDGE - KEEP
			if d.length() > lim and not (mouth and gate_open and absf(out.x - SEA_GATE.x) < SEA_GATE_HALF - KEEP * 0.5):
				why = "gate" if mouth else "wall"
				out = EXP_ORIGIN + d.normalized() * lim
		else:
			# Out on the campaign's water: the wall from outside, and the edge.
			var lim2: float = EXP_EDGE + KEEP
			if d.length() < lim2 and not mouth:
				why = "wall"
				out = EXP_ORIGIN + d.normalized() * lim2
			elif d.length() > RAID_EDGE:
				why = "edge"
				out = EXP_ORIGIN + d.normalized() * RAID_EDGE
	return { "at": out, "hit": why != "", "why": why }


## What each northern building will be (shown on mooring until it is built).
const COMING: Dictionary = {
	"crew_hall": "Your crew sleep, drill and are signed on here: recruiting, the roster, the bunks and who sails in which seat.",
	"gunwharf": "Where your ship lies at her berth, is refitted and armed for the campaign.",
}


## Whether a hull painting has her bow to the LEFT (Kong, 2026-10-05: every
## ship is painted bow-right but the Man-o-War and its skins, and the
## Man-o-War hulls the enemies sail). seaFlip on the ship tiers says the same
## for the player's own; this answers it for any painting by its file.
static func bow_left(path: Variant) -> bool:
	var p: String = str(path).trim_prefix("/")
	if p.contains("man-o-war") or p.contains("finnship"):
		return true
	# A skin's Man-o-War painting (its smaller hulls face right like the rest).
	for sk: Dictionary in Js.list(Rules.data().get("shipSkins")):
		if str(Js.obj(sk.get("imageByTier")).get("6", "")).trim_prefix("/") == p:
			return true
	return false


## EACH CHAPTER SAILS IN ITS GANG'S COLOURS (Kong, 2026-10-06: bosses "should
## be wearing their dropped hull cosmetic"; the whole chapter fleet; on the v3
## ships): the v3 ships recoloured in each bay's hull (tools/dye_fleet.py bakes
## art/fleet/<bay>_<ship>.png). Finn's own red ship is his already.
const FLEET_BAYS: Array = ["thread", "sunken_hand", "the_coffers", "the_last_fathom"]
const FLEET_SHIPS: Array = ["man-o-war", "brigantine", "schooner", "galleon", "sloop"]
static var _raid_bay: Dictionary = {}


## The bay a raid belongs to (by the anchored ship that leads to it, else by
## the chapter hull it drops), or "".
static func raid_bay(raid_id: String) -> String:
	if _raid_bay.is_empty():
		var by_node: Dictionary = {}
		for n: Dictionary in Campaign.nodes():
			if n.get("raidId") != null:
				by_node[str(n["id"])] = str(n["raidId"])
		for enc: Dictionary in Js.list(Js.obj(Rules.data().get("campaignWater")).get("encounters")):
			var rid: String = str(by_node.get(str(enc.get("node", "")), ""))
			if rid != "":
				_raid_bay[rid] = str(enc.get("bay", ""))
		var drops: Dictionary = { "finndicate_hull": "thread", "chartmaker_hull": "sunken_hand", "coffers_hull": "the_coffers", "last_fathom_hull": "the_last_fathom" }
		for rid2: Variant in Js.obj(Rules.data().get("raids")):
			if _raid_bay.has(rid2):
				continue
			var base: String = str(rid2).trim_suffix("_challenge")
			if _raid_bay.has(base):
				_raid_bay[rid2] = _raid_bay[base]
				continue
			for row: Dictionary in Js.list(Js.obj(Rules.data()["raids"][rid2]).get("loot")):
				if drops.has(str(row.get("id", ""))) and not _raid_bay.has(rid2):
					_raid_bay[rid2] = drops[str(row["id"])]
		_raid_bay["_built"] = ""
	return str(_raid_bay.get(raid_id, ""))


## A chapter ship's painting in its bay's colours: the same v3 ship. Anything
## that is not a plain ship (Finn's) is kept.
static func fleet_art(image: Variant, bay: String) -> String:
	var path: String = str(image)
	if not FLEET_BAYS.has(bay):
		return path
	var file: String = path.get_file()
	if not (path.contains("ship-hero/") or file.begins_with("enemychapter")):
		return path
	for ship: String in FLEET_SHIPS:
		if file.contains(ship):
			return "fleet/%s_%s.png" % [bay, ship]
	return path


## A captain's expedition ship as the web's chart draws it (lib/ships.ts; a
## skin's hull if worn): the rules' row, the picture, how much wider a skin's
## padded plate is drawn.
static func ship_art(ship_tier: Variant, skin: Variant) -> Dictionary:
	var tier: int = clampi(int(Js.num(ship_tier)), 2, 6)
	var def: Dictionary = {}
	for sd: Dictionary in Js.list(Rules.data().get("ships")):
		if int(sd["tier"]) == tier:
			def = sd
	var art: String = str(def.get("seaImageUrl", ""))
	var wide: float = 1.0
	for sk: Dictionary in Js.list(Rules.data().get("shipSkins")):
		# A skin shows on the Man-o-War only (docs ship.md).
		if sk["id"] == skin and tier >= Hulls.SKIN_TIER and sk.get("imageByTier") != null:
			var by: Dictionary = sk["imageByTier"]
			if by.has(str(tier)):
				art = str(by[str(tier)])
				wide = 0.969 / 0.651
	return { "def": def, "art": art, "wide": wide }
