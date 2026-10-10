class_name Homestead
extends RefCounted
## THE HOMESTEAD (Godot port of lib/core/homestead.ts and lib/homestead.ts):
## the house built a rung at a time (a lean-to, a cottage, a longhouse, a
## great hall, the Estate), each rung repainting the island and opening
## another furniture slot and a room (the gallery, the menagerie, the trophy
## room); the island named; the main room furnished (bought, or found on the
## far isles, and every piece kept); up to six badges hung in the gallery.
## In a Charter it is the crew's one base (the save's "homestead"). The tables
## are content/homestead.json (tools/export_homestead.mts).

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://content/homestead.json"))
	return _data


static func of(db: CaptainStore) -> Dictionary:
	var h: Dictionary = Js.obj(db.save.get("homestead"))
	return {
		"house": int(Js.num(h.get("house"))), "name": h.get("name"), "furniture": Js.obj(h.get("furniture")),
		"owned": Js.list(h.get("owned")), "pinned": Js.list(h.get("pinned")),
	}


static func _write(db: CaptainStore, h: Dictionary) -> void:
	db.save["homestead"] = h


static func tier(h: Dictionary) -> int:
	return clampi(int(h["house"]), 0, (data()["house"] as Array).size() - 1)


static func built(h: Dictionary) -> Dictionary:
	return data()["house"][tier(h)]


static func next_build(h: Dictionary) -> Dictionary:
	var t: int = tier(h) + 1
	return data()["house"][t] if t < (data()["house"] as Array).size() else {}


static func name_of(h: Dictionary) -> String:
	var n: String = str(Js.nz(h.get("name"), "")).strip_edges()
	return n if n != "" else "The Homestead"


static func open_slots(h: Dictionary) -> Array:
	var slots: Array = data()["slots"]
	var n: int = int(slots[clampi(int(h["house"]), 0, slots.size() - 1)])
	return (data()["furniture"] as Array).slice(0, n).map(func(f: Dictionary) -> String: return f["slot"])


static func slot_def(slot: String) -> Dictionary:
	for f: Dictionary in data()["furniture"]:
		if f["slot"] == slot:
			return f
	return {}


static func furnishing(id: String) -> Dictionary:
	for f: Dictionary in data()["furniture"]:
		for o: Dictionary in f["options"]:
			if o["id"] == id:
				return { "slot": f["slot"], "item": o }
	return {}


## What stands in a slot (the slot's first option when nothing is chosen).
static func in_slot(h: Dictionary, slot: String) -> Dictionary:
	var chosen: Variant = Js.obj(h["furniture"]).get(slot)
	var opts: Array = slot_def(slot)["options"]
	for o: Dictionary in opts:
		if o["id"] == chosen:
			return o
	return opts[0]


## The main room's painting and spots for the house that stands.
static func room_art(room: Dictionary, t: int) -> String:
	var a: Variant = room["art"]
	return str(a[clampi(t, 0, (a as Array).size() - 1)]) if a is Array else str(a)


static func room_spots(room: Dictionary, t: int) -> Dictionary:
	var s: Variant = room.get("spots")
	if not (s is Array):
		return {}
	return (s as Array)[clampi(t, 0, (s as Array).size() - 1)]


static func build(db: CaptainStore, uid: String) -> Dictionary:
	var h: Dictionary = of(db)
	var nx: Dictionary = next_build(h)
	if nx.is_empty():
		return { "error": "The Estate is finished." }
	var bal: Variant = db.deduct_doubloons(uid, float(nx["cost"]))
	if bal == null:
		return { "error": "Need %s ⟡" % Js.thousands(float(nx["cost"])) }
	h["house"] = tier(h) + 1
	_write(db, h)
	db.ledger(uid, -float(nx["cost"]), "Homestead: %s" % nx["name"])
	return { "ok": true, "built": nx["name"], "spent": float(nx["cost"]) }


## Name your island: 2 to 24 letters, numbers, spaces, apostrophes, hyphens
## or ampersands; an empty box goes back to "The Homestead".
static func rename(db: CaptainStore, uid: String, name: String) -> Dictionary:
	var clean: String = " ".join(name.strip_edges().split(" ", false))
	var h: Dictionary = of(db)
	if clean == "":
		h["name"] = null
		_write(db, h)
		return { "ok": true }
	if clean.length() < 2 or clean.length() > 24:
		return { "error": "A name wants between 2 and 24 characters." }
	var re: RegEx = RegEx.create_from_string("^[\\p{L}\\p{N} '\\-&]+$")
	if re.search(clean) == null:
		return { "error": "Letters, numbers, spaces, apostrophes and hyphens only." }
	h["name"] = clean
	_write(db, h)
	return { "ok": true }


## Put something in a slot: bought once (a found piece only by standing on its
## isle), kept for good, put back for free.
static func furnish(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var found: Dictionary = furnishing(id)
	if found.is_empty():
		return { "error": "No such thing." }
	var slot: String = found["slot"]
	var item: Dictionary = found["item"]
	var h: Dictionary = of(db)
	if not open_slots(h).has(slot):
		return { "error": "%s has no room for that yet." % built(h)["name"] }
	if Js.obj(h["furniture"]).get(slot) == id:
		return { "error": "That is already there." }
	var owned: bool = (h["owned"] as Array).has(id)
	if item.get("found") != null and not owned:
		var isle_name: String = "an isle a long way out"
		for i: Dictionary in Rules.data()["isles"]:
			if i["id"] == item["found"]["isle"]:
				isle_name = str(i.get("name", isle_name))
		return { "error": "Nobody sells that. There is one, on %s." % isle_name }
	var cost: float = float(item["cost"])
	if cost > 0.0 and not owned:
		if db.deduct_doubloons(uid, cost) == null:
			return { "error": "Need %s ⟡" % Js.thousands(cost) }
		db.ledger(uid, -cost, "Homestead: %s" % item["name"])
	var fur: Dictionary = Js.obj(h["furniture"]).duplicate()
	fur[slot] = id
	h["furniture"] = fur
	if not owned:
		h["owned"] = (h["owned"] as Array) + [id]
	_write(db, h)
	return { "ok": true, "spent": 0.0 if owned else cost }


## The gallery's wall: up to six earned badges, once the gallery stands.
static func pin(db: CaptainStore, uid: String, ids: Array) -> Dictionary:
	var h: Dictionary = of(db)
	var gallery: Dictionary = {}
	for r: Dictionary in data()["rooms"]:
		if r["id"] == "gallery":
			gallery = r
	if tier(h) < int(gallery.get("needsHouse", 2)):
		return { "error": "Nowhere to hang them yet." }
	var earned: Array = Js.list(db.me(uid).get("unlocked_badges"))
	var out: Array = []
	for id: Variant in ids:
		if earned.has(id) and not out.has(id) and out.size() < int(data()["pinnedMax"]):
			out.append(id)
	h["pinned"] = out
	_write(db, h)
	return { "ok": true }


## The island's house on the chart: the rung's painting at its spot.
static func sea_building(db: CaptainStore) -> Dictionary:
	var b: Dictionary = built(of(db))
	return { "art": b["seaArt"], "x": b["x"], "y": b["y"], "scale": b["scale"] }
