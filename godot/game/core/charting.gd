class_name Charting
extends RefCounted
## CHARTING THE NORTHERN WATER PAYS NAVIGATION XP (Godot port, Kong
## 2026-10-06: players find early Navigation slow; RuneScape's sailing pays
## for sailing; "this should only be for the northern waters", Navigation's
## half of the sea). Every patch of the campaign water's fog (700 square, its
## own grid) pays once, the first time the captain's fog lifts there, more in
## the later chapters' bays. Charting a bay nearly whole (DONE_AT of its
## patches) pays a bonus once. Water already charted pays nothing, so idling
## cannot farm it, and each bay opens with its chapter, so the XP comes as the
## captain needs it. The fishing sea's fog pays nothing.
## Called from Explore.save_sea_position with the patches that are new.
## Kept on the profile: charted_waters (the bays whose bonus is paid).

## XP a patch, by bay (Ch I 158 patches, II 128, III 123, IV 224, V 32);
## NORTH_OTHER for the 700 between the bays. About 7,500 in all with the
## bonuses; Chapter I's bay whole is about 1,070.
const NORTH: Dictionary = { "thread": 6.0, "sunken_hand": 7.0, "the_coffers": 8.0, "the_last_fathom": 8.0, "one_last_ride": 8.0 }
const NORTH_OTHER: float = 2.5
## The bonus for charting a bay nearly whole.
const BONUS: Dictionary = { "thread": 120.0, "sunken_hand": 150.0, "the_coffers": 180.0, "the_last_fathom": 220.0, "one_last_ride": 220.0 }
const DONE_AT: float = 0.95

static var _north: Dictionary = {}
static var _sizes: Dictionary = {}


## The bay a patch lies in ("" between the bays; "-" never fogged).
static func area(i: int) -> String:
	if _north.is_empty():
		var bays: Array = Js.list(Js.obj(Rules.data().get("campaignWater")).get("bays"))
		for k: int in Explore.xfog_cells():
			if Explore.xfog_free(k):
				_north[k] = "-"
				continue
			var c: Vector2 = Explore.xfog_centre(k)
			var at: String = ""
			for b: Dictionary in bays:
				if c.distance_to(Vector2(float(b["centre"]["x"]), float(b["centre"]["y"]))) <= float(b["r"]):
					at = str(b["id"])
			_north[k] = at
			if at != "":
				_sizes[at] = int(_sizes.get(at, 0)) + 1
	return str(_north.get(i, "-"))


static func rate(i: int) -> float:
	var a: String = area(i)
	if a == "-":
		return 0.0
	return float(NORTH.get(a, NORTH_OTHER))


## How much of a bay the captain has charted (0..1).
static func share(bay: String, bits: PackedByteArray) -> float:
	area(0)
	var tot: int = int(_sizes.get(bay, 0))
	if tot <= 0:
		return 0.0
	var seen: int = 0
	for k: Variant in _north:
		if _north[k] == bay and Explore.xfog_has(bits, int(k)):
			seen += 1
	return float(seen) / float(tot)


## "+6", "+2.5": a patch's pay as words.
static func words(xp: float) -> String:
	return "+%s" % (str(int(xp)) if is_equal_approx(xp, round(xp)) else "%.1f" % xp)


static func bay_name(bay: String) -> String:
	for b: Dictionary in Js.list(Js.obj(Rules.data().get("campaignWater")).get("bays")):
		if b["id"] == bay:
			return str(b["name"])
	return bay


## Pay for the patches that are new (already set in `bits`). Returns
## { xp, done: [{ name, bonus } for each bay charted whole] }.
static func pay(db: CaptainStore, uid: String, fresh: Array, bits: PackedByteArray) -> Dictionary:
	var xp: float = 0.0
	var touched: Dictionary = {}
	for i: Variant in fresh:
		xp += rate(int(i))
		var a: String = area(int(i))
		if a != "" and a != "-":
			touched[a] = true
	var done: Array = []
	var paid: Array = Js.list(db.me(uid).get("charted_waters")).duplicate()
	for bay: String in touched:
		if paid.has(bay) or not BONUS.has(bay):
			continue
		if share(bay, bits) >= DONE_AT:
			paid.append(bay)
			xp += float(BONUS[bay])
			done.append({ "name": bay_name(bay), "bonus": float(BONUS[bay]) })
	if not done.is_empty():
		db.update_profile(uid, { "charted_waters": paid })
	if xp > 0.0:
		db.bump_stat(uid, "expedition_xp", xp)
		db.bump_stat(uid, "charting_nav_xp", xp)
	return { "xp": xp, "done": done }
