class_name Explore
extends RefCounted
## EXPLORING THE SEA, a port of the isles, digs, bottles and the fog: web/lib/
## seaIsles.ts, seaDigs.ts, seaBottles.ts, seaExplore.ts, and goAshore,
## digHere, openBottle, getDigState in lib/core/sea.ts with the fog part of
## saveSeaPosition in lib/core/selling.ts (Godot port, the rest of the sea,
## stage 3).
##
## THE ISLES pay once, ever: a landing claims the isle, then grants its gems
## and doubloons; five chests hold the only copy of a furnishing, and the first
## cache opened in a band is that band's portal stone. THE DIGS are twelve
## buried sites, never drawn: sail over one and dig. THE BOTTLES drift on
## eleven-minute windows, derived from the clock; a third carry a bearing to
## the nearest site you can sail to. THE FOG is a 700-pixel grid over the
## fishing side, saved as a bitfield, revealed three cells square around the
## boat. Every hash is the web's, in its arithmetic.

const U32: int = 0xFFFFFFFF
const ISLE_LAND_EXTRA: float = 260.0
const DIG_RANGE: float = 420.0
const DIG_HINT_RANGE: float = 900.0
const BOTTLE_CELL: float = 2600.0
const BOTTLE_RATE: float = 0.18
const BOTTLE_WINDOW_MS: float = 660000.0
const BOTTLE_REACH: float = 300.0
const FOG_CELL: float = 700.0
const FOG_REVEAL: int = 1
const NORTH_WALL: float = -1500.0


# ── JavaScript's arithmetic ────────────────────────────────────────────────────

## ToInt32 of a JS number, as an unsigned 32-bit int: the double truncated and
## taken modulo 2^32 (exact, as the spec does it, however large the double).
static func to_u32(d: float) -> int:
	if is_nan(d) or is_inf(d):
		return 0
	var t: float = d - fmod(d, 1.0)
	var m: float = fmod(t, 4294967296.0)
	if m < 0.0:
		m += 4294967296.0
	return int(m) & U32


# ── The bottles (lib/seaBottles) ───────────────────────────────────────────────

static func _bhash(a: float, b: float) -> int:
	var h: int = to_u32(a * 2654435761.0) ^ to_u32(b * 2246822507.0)
	h &= U32
	h = (h ^ (h << 13)) & U32
	h = h ^ (h >> 17)
	h = (h ^ (h << 5)) & U32
	return h


static func _outer() -> float:
	return Chart.LAST_OUTER


static func _inner() -> float:
	return float(Chart.WATERS[0]["inner"])


static func bottle_window(now: float) -> int:
	return int(floor(now / BOTTLE_WINDOW_MS))


static func bottle_at(cx: int, cy: int, win: int) -> Dictionary:
	var a: int = to_u32(float(cx) * 73856093.0) ^ to_u32(float(cy) * 19349663.0)
	# The XOR is an int32 in JS; as a number it is that signed value.
	var a_signed: float = float(a - 4294967296) if a >= 2147483648 else float(a)
	var h: int = _bhash(a_signed, float(win + 0x5bd1))
	if float(h % 1000) / 1000.0 >= BOTTLE_RATE:
		return {}
	var h2: int = _bhash(float(h), float(0x2f1b))
	var x: float = cx * BOTTLE_CELL + (float(h2 % 1000) / 1000.0) * BOTTLE_CELL
	var h3: int = _bhash(float(h2), float(0x77a3))
	var y: float = cy * BOTTLE_CELL + (float(h3 % 1000) / 1000.0) * BOTTLE_CELL
	if y < 400.0:
		return {}
	# Doubles throughout: Vector2 is 32-bit and would round a far bottle.
	var r: float = sqrt(x * x + y * y)
	if r < _inner() + 200.0 or r > _outer() - 200.0:
		return {}
	return { "key": "%d:%d:%d" % [cx, cy, win], "x": x, "y": y, "seed": h3 }


## Where a bottle has drifted to: { x, y } in doubles (a Vector2 is 32-bit).
static func bottle_pos(b: Dictionary, now_sec: float) -> Dictionary:
	var p: float = float(int(b["seed"]) % 1000) / 1000.0 * PI * 2.0
	return {
		"x": float(b["x"]) + sin(now_sec * 0.09 + p) * 46.0 + sin(now_sec * 0.031 + p * 2.0) * 26.0,
		"y": float(b["y"]) + cos(now_sec * 0.07 + p) * 30.0 + cos(now_sec * 0.024 + p * 3.0) * 18.0,
	}


static func bottles_around(x: float, y: float, radius: float, now: float) -> Array:
	var win: int = bottle_window(now)
	var out: Array = []
	var c0: int = int(floor((x - radius) / BOTTLE_CELL))
	var c1: int = int(floor((x + radius) / BOTTLE_CELL))
	var r0: int = int(floor((y - radius) / BOTTLE_CELL))
	var r1: int = int(floor((y + radius) / BOTTLE_CELL))
	for cx: int in range(c0, c1 + 1):
		for cy: int in range(r0, r1 + 1):
			var b: Dictionary = bottle_at(cx, cy, win)
			if not b.is_empty():
				out.append(b)
	return out


static func bottle_from_key(key: String, now: float) -> Dictionary:
	var parts: PackedStringArray = key.split(":")
	if parts.size() != 3 or not parts[0].is_valid_int() or not parts[1].is_valid_int() or not parts[2].is_valid_int():
		return {}
	var win: int = parts[2].to_int()
	var now_win: int = bottle_window(now)
	if win != now_win and win != now_win - 1:
		return {}
	return bottle_at(parts[0].to_int(), parts[1].to_int(), win)


static func fragment_for(b: Dictionary) -> String:
	var f: Array = Rules.data()["bottleFragments"]
	return f[int(b["seed"]) % f.size()]


static func carries_bearing(b: Dictionary) -> bool:
	return _bhash(float(b["seed"]), float(0x9c11)) % 100 < 34


# ── The fog (lib/seaExplore) ───────────────────────────────────────────────────

static func fog_w() -> int:
	return int(ceil(_outer() * 2.0 / FOG_CELL))


static func fog_h() -> int:
	return int(ceil((_outer() - NORTH_WALL) / FOG_CELL))


static func fog_cells() -> int:
	return fog_w() * fog_h()


static func fog_index(x: float, y: float) -> int:
	var cx: int = int(floor((x + _outer()) / FOG_CELL))
	var cy: int = int(floor((y - NORTH_WALL) / FOG_CELL))
	if cx < 0 or cy < 0 or cx >= fog_w() or cy >= fog_h():
		return -1
	return cy * fog_w() + cx


static func fog_centre(i: int) -> Vector2:
	return Vector2(-_outer() + (i % fog_w() + 0.5) * FOG_CELL, NORTH_WALL + (i / fog_w() + 0.5) * FOG_CELL)


static func fog_reveal(x: float, y: float) -> Array:
	var out: Array = []
	for dy: int in range(-FOG_REVEAL, FOG_REVEAL + 1):
		for dx: int in range(-FOG_REVEAL, FOG_REVEAL + 1):
			var i: int = fog_index(x + dx * FOG_CELL, y + dy * FOG_CELL)
			if i >= 0:
				out.append(i)
	return out


static func fog_decode(raw: Variant) -> PackedByteArray:
	var bits: PackedByteArray = PackedByteArray()
	bits.resize(int(ceil(fog_cells() / 8.0)))
	if raw == null or str(raw) == "":
		return bits
	var got: PackedByteArray = Marshalls.base64_to_raw(str(raw))
	# A chart saved before the sea was widened (a smaller grid): each cell it
	# had seen is carried to where that water is now (SeaScale).
	var old_outer: float = _outer() - SeaScale.d
	var old_w: int = int(ceil(old_outer * 2.0 / FOG_CELL))
	var old_h: int = int(ceil((old_outer - NORTH_WALL) / FOG_CELL))
	if SeaScale.d > 0.0 and got.size() == int(ceil(old_w * old_h / 8.0)) and got.size() != bits.size():
		for i: int in old_w * old_h:
			if (got[i >> 3] & (1 << (i & 7))) != 0:
				var c: Vector2 = Vector2(-old_outer + (i % old_w + 0.5) * FOG_CELL, NORTH_WALL + (i / old_w + 0.5) * FOG_CELL)
				fog_set(bits, fog_index(SeaScale.expand(c).x, SeaScale.expand(c).y))
		return bits
	for i: int in mini(got.size(), bits.size()):
		bits[i] = got[i]
	return bits


static func fog_encode(bits: PackedByteArray) -> String:
	return Marshalls.raw_to_base64(bits)


static func fog_has(bits: PackedByteArray, i: int) -> bool:
	return i >= 0 and (i >> 3) < bits.size() and (bits[i >> 3] & (1 << (i & 7))) != 0


static func fog_set(bits: PackedByteArray, i: int) -> void:
	if i >= 0 and i < fog_cells():
		bits[i >> 3] = bits[i >> 3] | (1 << (i & 7))


static var _water: Array = []


## The cells that count toward the fishing side's progress.
static func water_cells() -> Array:
	if _water.is_empty():
		for i: int in fog_cells():
			var c: Vector2 = fog_centre(i)
			if c.y > 0.0 and c.length() <= _outer():
				_water.append(i)
	return _water


static func fog_progress(bits: PackedByteArray) -> float:
	var seen: int = 0
	for i: int in water_cells():
		if fog_has(bits, i):
			seen += 1
	return float(seen) / maxf(1.0, water_cells().size())


## saveSeaPosition (the fishing side's part): where the boat is, when it was
## last seen, and the cells it has revealed, OR'd into the mask.
static func save_sea_position(db: CaptainStore, uid: String, x: float, y: float, seen: Array) -> Dictionary:
	if is_nan(x) or is_nan(y) or is_inf(x) or is_inf(y):
		return { "helm": "mine" }
	var patch: Dictionary = {
		"sea_x": clampf(x, -1e6, 1e6), "sea_y": clampf(y, -1e6, 1e6),
		"sea_seen_at": Js.iso(Clock.now_ms()), "sea_side": "fishing",
	}
	if not seen.is_empty():
		var row: Dictionary = db.profile(uid, "sea_explored")
		var bits: PackedByteArray = fog_decode(row.get("sea_explored"))
		for i: Variant in seen:
			fog_set(bits, int(i))
		patch["sea_explored"] = fog_encode(bits)
	db.update_profile(uid, patch)
	return { "helm": "mine" }


# ── The isles and the digs ─────────────────────────────────────────────────────

static func isle(id: String) -> Dictionary:
	for i: Dictionary in Rules.data()["isles"]:
		if i["id"] == id:
			return i
	return {}


static func dig_site(id: String) -> Dictionary:
	for d: Dictionary in Rules.data()["digSites"]:
		if d["id"] == id:
			return d
	return {}


static func _band(id: String) -> Dictionary:
	for w: Dictionary in Chart.WATERS:
		if w["id"] == id:
			return w
	return {}


static func _band_min(id: String) -> float:
	return float((Rules.data()["zones"]["minLevel"] as Dictionary).get(id, 1.0))


static func _near_enough(profile: Dictionary, x: float, y: float, limit: float) -> bool:
	var sx: Variant = profile.get("sea_x")
	var sy: Variant = profile.get("sea_y")
	if sx == null or sy == null:
		return true
	var dx: float = x - float(sx)
	var dy: float = y - float(sy)
	return sqrt(dx * dx + dy * dy) <= limit


## The isle within landing range of a point, nearest first, or {}.
static func isle_near(x: float, y: float) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = INF
	for i: Dictionary in Rules.data()["isles"]:
		var d: float = Vector2(x - float(i["x"]), y - float(i["y"])).length()
		if d <= float(i["r"]) + ISLE_LAND_EXTRA and d < best_d:
			best = i
			best_d = d
	return best


static func dig_at(x: float, y: float, range_px: float = DIG_RANGE) -> Dictionary:
	for d: Dictionary in Rules.data()["digSites"]:
		if Vector2(x - float(d["x"]), y - float(d["y"])).length() < range_px:
			return d
	return {}


static func get_dig_state(db: CaptainStore, uid: String) -> Dictionary:
	db.me(uid)
	var bearings: Array = []
	var dug: Array = []
	for r: Dictionary in db.save["digs"]:
		bearings.append(r["site_id"])
		if r.get("dug_at") != null:
			dug.append(r["site_id"])
	return { "bearings": bearings, "dug": dug }


static func _add_dig_bearing(db: CaptainStore, site_id: String) -> String:
	for d: Dictionary in db.save["digs"]:
		if d["site_id"] == site_id:
			return "dup"
	(db.save["digs"] as Array).append({ "site_id": site_id, "dug_at": null })
	return "ok"


static func open_bottle(db: CaptainStore, uid: String, key: String) -> Dictionary:
	# Port rules: a bottle is a clue (core/clues.gd).
	if Clues.on():
		return Clues.take_bottle(db, uid, key)
	var bottle: Dictionary = bottle_from_key(key, Clock.now_ms())
	if bottle.is_empty():
		return { "ok": false, "error": "The tide took it." }
	var profile: Dictionary = db.profile(uid, "fishing_xp, sea_x, sea_y")
	var at: Dictionary = bottle_pos(bottle, Clock.now_ms() / 1000.0)
	if not _near_enough(profile, float(at["x"]), float(at["y"]), BOTTLE_REACH * 3.0):
		return { "ok": false, "error": "It is out of reach." }
	var fragment: String = fragment_for(bottle)
	if not carries_bearing(bottle):
		return { "ok": true, "kind": "fragment", "text": fragment }
	var have: Dictionary = {}
	for r: Dictionary in db.save["digs"]:
		have[r["site_id"]] = true
	var fishing: int = Rules.level_from_xp(Js.num(profile.get("fishing_xp")))
	var open: Array = []
	for d: Dictionary in Rules.data()["digSites"]:
		if have.has(d["id"]):
			continue
		if _band(d["band"]).is_empty() or fishing >= _band_min(d["band"]):
			open.append(d)
	if open.is_empty():
		return { "ok": true, "kind": "fragment", "text": fragment }
	var pick: Dictionary = open[0]
	for d: Dictionary in open:
		if Vector2(float(d["x"]) - float(bottle["x"]), float(d["y"]) - float(bottle["y"])).length() < Vector2(float(pick["x"]) - float(bottle["x"]), float(pick["y"]) - float(bottle["y"])).length():
			pick = d
	_add_dig_bearing(db, pick["id"])
	return { "ok": true, "kind": "bearing", "name": pick["name"], "band": pick["band"], "text": fragment, "bearing": pick["bearing"] }


static func dig_here(db: CaptainStore, uid: String, site_id: String) -> Dictionary:
	# Port rules: a site is dug only as a treasure hunt's last step.
	if Clues.on():
		var tier: String = Clues.dig_open(db.me(uid), site_id)
		if tier == "":
			return { "ok": false, "error": "There is nothing here." }
		return Clues.search(db, uid, tier)
	var site: Dictionary = dig_site(site_id)
	if site.is_empty():
		return { "ok": false, "error": "There is nothing here." }
	var profile: Dictionary = db.profile(uid, "fishing_xp, sea_x, sea_y")
	var band: Dictionary = _band(site["band"])
	var level: int = Rules.level_from_xp(Js.num(profile.get("fishing_xp")))
	if not band.is_empty() and level < _band_min(site["band"]):
		return { "ok": false, "error": "%s is shut until Fishing %d." % [band["name"], int(_band_min(site["band"]))] }
	if not _near_enough(profile, float(site["x"]), float(site["y"]), DIG_RANGE * 2.0):
		return { "ok": false, "error": "You are not over it." }
	_add_dig_bearing(db, site_id)
	var row: Dictionary = {}
	for d: Dictionary in db.save["digs"]:
		if d["site_id"] == site_id:
			row = d
	if row.is_empty() or row.get("dug_at") != null:
		return { "ok": false, "error": "This one is already up. The hole is still here." }
	row["dug_at"] = Js.iso(Clock.now_ms())
	db.grant(uid, "doubloons", float(site["doubloons"]))
	db.grant(uid, "gems", float(site["gems"]))
	db.ledger(uid, float(site["doubloons"]), "Dug up: %s" % site["name"])
	var purse: Dictionary = db.profile(uid, "doubloons, gems")
	return {
		"ok": true, "name": site["name"], "gems": site["gems"], "doubloons": site["doubloons"], "found": site["found"],
		"newDoubloons": Js.num(purse.get("doubloons")), "newGems": Js.num(purse.get("gems")),
	}


static func go_ashore(db: CaptainStore, uid: String, isle_id: String) -> Dictionary:
	var i: Dictionary = isle(isle_id)
	if i.is_empty():
		return { "ok": false, "error": "No such island." }
	var profile: Dictionary = db.profile(uid, "fishing_xp, sea_x, sea_y")
	var band: Dictionary = _band(i["band"])
	var level: int = Rules.level_from_xp(Js.num(profile.get("fishing_xp")))
	if not band.is_empty() and level < _band_min(i["band"]):
		return { "ok": false, "error": "%s is shut until Fishing %d." % [band["name"], int(_band_min(i["band"]))] }
	if not _near_enough(profile, float(i["x"]), float(i["y"]), (float(i["r"]) + ISLE_LAND_EXTRA) * 3.0):
		return { "ok": false, "error": "You are not close enough to land." }
	var found: Array = db.save["discoveries"]
	if found.has(i["id"]):
		return { "ok": true, "already": true, "name": i["name"], "note": i.get("note") }
	found.append(i["id"])
	var gems: float = Js.num(i.get("gems"))
	var doubloons: float = Js.num(i.get("doubloons"))
	if gems > 0:
		db.grant(uid, "gems", gems)
	if doubloons > 0:
		db.grant(uid, "doubloons", doubloons)
		db.ledger(uid, doubloons, "Ashore: %s" % i["name"])
	var purse: Dictionary = db.profile(uid, "doubloons, gems")
	var salvage: Variant = null
	var f: Variant = (Rules.data()["isleFurnishing"] as Dictionary).get(i["id"])
	if f != null:
		var hs: Variant = db.save.get("homestead")
		var owned: Array = Js.list((hs as Dictionary).get("owned")) if hs is Dictionary else []
		if not owned.has(f["id"]):
			var next: Dictionary = (hs as Dictionary).duplicate() if hs is Dictionary else {}
			next["owned"] = owned + [f["id"]]
			db.save["homestead"] = next
		salvage = { "id": f["id"], "name": f["name"] } if f.get("name") != null else null
	var stone: Variant = null
	var rung: Dictionary = {}
	for t: Dictionary in Rules.data()["portalTiers"]:
		if t["band"] == i["band"]:
			rung = t
	if not rung.is_empty() and i["kind"] == "cache":
		var here: Dictionary = {}
		for x: Dictionary in Rules.data()["isles"]:
			if x["kind"] == "cache" and x["band"] == i["band"]:
				here[x["id"]] = true
		var opened: int = 0
		for id: Variant in found:
			if here.has(id):
				opened += 1
		if opened == 1:
			stone = { "tier": rung["tier"], "name": rung["name"] }
	return {
		"ok": true, "already": false, "name": i["name"], "gems": gems, "doubloons": doubloons, "note": i.get("note"),
		"salvage": salvage, "stone": stone,
		"newDoubloons": Js.num(purse.get("doubloons")), "newGems": Js.num(purse.get("gems")),
	}
