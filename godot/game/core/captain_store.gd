class_name CaptainStore
extends RefCounted
## ONE CAPTAIN'S SAVE, AS THE RULES READ AND WRITE IT (Godot port, stage 1).
##
## A port of web/lib/data/local/save.ts (localCaptain) and fishingLocal.ts
## (localFishingData): the operations the cores call, over the save
## dictionary. Every write lands in the same place and shape as the TS's, so
## the saves compare equal after the same session.
##
## Id-keyed objects (the hold, the log, the bests) are keyed by the id as text
## (Js.key), as JSON writes a JS object's number keys.

var save: Dictionary


func _init(s: Dictionary) -> void:
	save = s


## The profile, for this save's captain only.
func me(uid: String) -> Dictionary:
	if uid != save["uid"]:
		push_error("local save belongs to %s, not %s" % [save["uid"], uid])
	return save["profile"]


# ── The captain (save.ts) ──────────────────────────────────────────────────────

## profile(uid, "a, b, c"): the named columns, null where missing. The values
## are the profile's own (not copies), as in the TS.
func profile(uid: String, cols: String) -> Dictionary:
	var prof: Dictionary = me(uid)
	if cols.strip_edges() == "*":
		return prof.duplicate(true)
	var out: Dictionary = {}
	for c: String in cols.split(","):
		var k: String = c.strip_edges()
		if k != "":
			out[k] = prof.get(k)
	return out


func update_profile(uid: String, patch: Dictionary) -> void:
	var prof: Dictionary = me(uid)
	var copy: Dictionary = patch.duplicate(true)
	for k: Variant in copy:
		prof[k] = copy[k]


func bump_stat(uid: String, col: String, n: float) -> void:
	var prof: Dictionary = me(uid)
	prof[col] = Js.num(prof.get(col)) + n


func bump_json_counter(uid: String, col: String, key: String, n: float) -> void:
	var prof: Dictionary = me(uid)
	var o: Dictionary = Js.obj(prof.get(col)).duplicate()
	o[key] = Js.num(o.get(key)) + n
	prof[col] = o


func has_cleared(uid: String, raid_id: String) -> bool:
	me(uid)
	return Js.includes(save["clears"], raid_id)


## raidLocal addClear: a clear with its time, and the raid in the cleared list.
func add_clear(uid: String, raid_id: String, ms: Variant) -> void:
	me(uid)
	if not (save.get("raidClears") is Array):
		save["raidClears"] = []
	(save["raidClears"] as Array).append({ "raid_id": raid_id, "ms": ms, "at": Js.iso(Clock.now_ms()) })
	if not Js.includes(save["clears"], raid_id):
		(save["clears"] as Array).append(raid_id)


## raidLocal clearedRaidIds: every raid this captain has cleared.
func cleared_raid_ids(uid: String) -> Array:
	me(uid)
	var out: Array = []
	for id: Variant in Js.list(save.get("clears")):
		if not out.has(id):
			out.append(id)
	for c: Dictionary in Js.list(save.get("raidClears")):
		if not out.has(c["raid_id"]):
			out.append(c["raid_id"])
	return out


## How many times a raid has been cleared (the sheets' tally).
func clear_count(uid: String, raid_id: String) -> int:
	me(uid)
	var n: int = 0
	for c: Dictionary in Js.list(save.get("raidClears")):
		if c["raid_id"] == raid_id:
			n += 1
	return n


func add_bait(uid: String, bait: String, qty: float) -> void:
	me(uid)
	save["bait"][bait] = Js.num((save["bait"] as Dictionary).get(bait)) + qty


func grant(uid: String, col: String, n: float) -> float:
	var prof: Dictionary = me(uid)
	var add: float = 0.0 if is_nan(n) else float(int(n))
	prof[col] = Js.num(prof.get(col)) + maxf(0.0, add)
	return prof[col]


func add_to_list(uid: String, col: String, value: Variant) -> bool:
	var prof: Dictionary = me(uid)
	var list: Array = Js.list(prof.get(col))
	if Js.includes(list, value):
		return false
	var next: Array = list.duplicate()
	next.append(value)
	prof[col] = next
	return true


## updateProfileIf with a single "is null" guard, the only form the cores
## here use.
func update_profile_if_null(uid: String, patch: Dictionary, col: String) -> bool:
	var prof: Dictionary = me(uid)
	if prof.get(col) != null:
		return false
	update_profile(uid, patch)
	return true


func grant_badge(uid: String, badge_id: String) -> void:
	var prof: Dictionary = me(uid)
	var list: Array = Js.list(prof.get("unlocked_badges"))
	if Js.includes(list, badge_id):
		return
	var next: Array = list.duplicate()
	next.append(badge_id)
	prof["unlocked_badges"] = next
	prof["badge_unlocked_at"] = Rules.stamp_badges(prof.get("badge_unlocked_at"), [badge_id])


func flag_anomaly(uid: String, kind: String, severity: float, detail: Dictionary) -> void:
	me(uid)
	(save["anomalies"] as Array).append({ "kind": kind, "severity": severity, "detail": detail })


## The save's next row id (save.nextId++, the local stores' shared counter).
func next_id() -> float:
	var id: float = float(save["nextId"])
	save["nextId"] = id + 1.0
	return id


func mail_to(uid: String, subject: String, body: String, sender: String) -> void:
	me(uid)
	var id: float = float(save["nextId"])
	save["nextId"] = id + 1.0
	(save["mail"] as Array).append({
		"id": "local-mail-%d" % int(id), "subject": subject, "body": body, "sender": sender,
		"created_at": Js.iso(Clock.now_ms()), "attachment_doubloons": 0.0, "attachment_gems": 0.0, "read_at": null, "claimed_at": null,
	})


func claim_contest(contest_id: String, uid: String) -> bool:
	me(uid)
	if (save["contests"] as Dictionary).has(contest_id):
		return false
	save["contests"][contest_id] = uid
	save["contestsWonAt"][contest_id] = Js.iso(Clock.now_ms())
	return true


# ── The cast (fishingLocal.ts) ─────────────────────────────────────────────────

func pending_cast(uid: String) -> Variant:
	return me(uid).get("pending_cast")


func claim_cast(uid: String, cast_at: float) -> bool:
	var prof: Dictionary = me(uid)
	var pc: Variant = prof.get("pending_cast")
	if not Js.truthy(pc) or float((pc as Dictionary).get("castAt", NAN)) != cast_at:
		return false
	prof["pending_cast"] = null
	prof["catch_pending"] = false
	return true


func claim_crate_cast(uid: String, cast_at: float) -> bool:
	var prof: Dictionary = me(uid)
	var pc: Variant = prof.get("pending_cast")
	if not Js.truthy(pc) or float((pc as Dictionary).get("castAt", NAN)) != cast_at:
		return false
	prof["pending_cast"] = null
	return true


func claim_pending_reroll(uid: String) -> bool:
	var prof: Dictionary = me(uid)
	if prof.get("pending_reroll") == null:
		return false
	prof["pending_reroll"] = null
	return true


# ── Bait ───────────────────────────────────────────────────────────────────────

## The count held, or null when the captain has never held this bait.
func bait_count(uid: String, bait: String) -> Variant:
	me(uid)
	return (save["bait"] as Dictionary).get(bait)


## Set the count; with if_was, only if the count still reads that.
func set_bait_count(uid: String, bait: String, qty: float, if_was: Variant = null) -> void:
	me(uid)
	var b: Dictionary = save["bait"]
	if not b.has(bait):
		return
	if if_was != null and float(b[bait]) != float(if_was):
		return
	b[bait] = qty


# ── The water ──────────────────────────────────────────────────────────────────

func candidates(habitat: String) -> Array:
	var out: Array = []
	for f: Dictionary in save["species"]:
		if f["habitat"] == habitat:
			out.append({ "id": f["id"], "catch_difficulty": f["catch_difficulty"], "catch_score": f.get("catch_score"), "bite_rarity": f["bite_rarity"], "sell_value": f.get("sell_value") })
	return out


func species(fish_id: float) -> Variant:
	for f: Dictionary in save["species"]:
		if float(f["id"]) == fish_id:
			return f
	return null


func non_ancient_species_ids() -> Array:
	var out: Array = []
	for f: Dictionary in save["species"]:
		if f["habitat"] != "ancient_deep":
			out.append(f["id"])
	return out


# ── The hold ───────────────────────────────────────────────────────────────────

func hold_count(uid: String) -> float:
	me(uid)
	var n: float = 0.0
	for k: Variant in save["hold"]:
		n += float(save["hold"][k])
	return n


func hold_qty(uid: String, fish_id: float) -> Variant:
	me(uid)
	return (save["hold"] as Dictionary).get(Js.key(fish_id))


func add_to_hold(uid: String, fish_id: float, qty: float, had: Variant) -> void:
	me(uid)
	save["hold"][Js.key(fish_id)] = Js.num(had) + qty


# ── The log ────────────────────────────────────────────────────────────────────

func collection_row(uid: String, fish_id: float) -> Variant:
	me(uid)
	var r: Variant = (save["collection"] as Dictionary).get(Js.key(fish_id))
	if r == null:
		return null
	return { "catch_count": (r as Dictionary)["catch_count"], "is_golden": (r as Dictionary).get("is_golden") }


func log_catch(uid: String, fish_id: float, had: Variant, at: String) -> void:
	me(uid)
	var col: Dictionary = save["collection"]
	var k: String = Js.key(fish_id)
	if had == null:
		col[k] = { "catch_count": 1.0, "is_golden": null }
		return
	var row: Dictionary = (col[k] as Dictionary).duplicate()
	row["catch_count"] = float((had as Dictionary)["catch_count"]) + 1.0
	row["last_caught_at"] = at
	col[k] = row


func collection_ids(uid: String) -> Array:
	me(uid)
	return Js.ids(save["collection"])


func bump_lifetime(uid: String, fish_id: float, at: String) -> void:
	me(uid)
	var lt: Dictionary = save["lifetime"]
	var k: String = Js.key(fish_id)
	var r: Variant = lt.get(k)
	var row: Dictionary = { "n": (Js.num((r as Dictionary).get("n")) if r != null else 0.0) + 1.0, "last": at }
	var first: Variant = (r as Dictionary).get("first") if r != null else at
	if first != null:
		row["first"] = first
	lt[k] = row


func personal_best(uid: String, fish_id: float) -> Variant:
	me(uid)
	var r: Variant = (save["bests"] as Dictionary).get(Js.key(fish_id))
	return null if r == null else (r as Dictionary).get("len")


func set_personal_best(uid: String, fish_id: float, size_in: float, at: String) -> void:
	me(uid)
	save["bests"][Js.key(fish_id)] = { "len": size_in, "at": at }


func add_shiny(uid: String, fish_id: float, size_in: Variant) -> float:
	me(uid)
	var shinies: Array = save["shinies"]
	var id: float = (float((shinies.back() as Dictionary)["id"]) if shinies.size() > 0 else 0.0) + 1.0
	shinies.append({ "id": id, "fish_id": fish_id, "size_in": size_in, "status": "hold", "caught_at": Js.iso(Clock.now_ms()) })
	return id


# ── The day ────────────────────────────────────────────────────────────────────

func daily_progress(uid: String, date: String) -> Variant:
	me(uid)
	return (save["daily"] as Dictionary).get(date)


func save_daily_progress(uid: String, date: String, prog: Array, snapshot: float) -> void:
	me(uid)
	var prev: Variant = (save["daily"] as Dictionary).get(date)
	var row: Dictionary = (prev as Dictionary).duplicate() if prev != null else { "claimed_1": null, "claimed_2": null, "claimed_3": null, "claimed_4": null, "p4": null }
	row["p1"] = prog[0]
	row["p2"] = prog[1]
	row["p3"] = prog[2]
	if prog.size() > 3:
		row["p4"] = prog[3]
	row["fishing_level_snapshot"] = snapshot
	save["daily"][date] = row


func challenge_override(date: String) -> Variant:
	return (save["overrides"] as Dictionary).get(date)


# ── The sea ────────────────────────────────────────────────────────────────────

func folk_wanting(uid: String, fish_id: float) -> Array:
	me(uid)
	var out: Array = []
	for r: Dictionary in save["rapport"]:
		if r.get("want_fish_id") != null and float(r["want_fish_id"]) == fish_id:
			out.append(r["folk_id"])
	return out


# ── The rest of fishing and the loadout ────────────────────────────────────────

func ledger(uid: String, amount: float, reason: String, currency: String = "doubloons") -> void:
	me(uid)
	(save["ledger"] as Array).append({ "amount": amount, "reason": reason, "currency": currency })


## Take n from a column, or null (and nothing taken) when short.
func spend(uid: String, col: String, n: float) -> Variant:
	var prof: Dictionary = me(uid)
	var have: float = Js.num(prof.get(col))
	if n != floor(n) or n < 0 or have < n:
		return null
	prof[col] = have - n
	return prof[col]


## Set a flag, only if it was not already set; whether this call set it.
func flag_on(uid: String, col: String) -> bool:
	var prof: Dictionary = me(uid)
	if prof.get(col) == true:
		return false
	prof[col] = true
	return true


## updateProfileIf: patch the profile only while every guard holds. A guard is
## { col, is: null } / { col, notNull } / { col, contains: [...] } / { col, eq }.
func update_profile_if(uid: String, patch: Dictionary, guards: Array) -> bool:
	var prof: Dictionary = me(uid)
	for g: Dictionary in guards:
		var v: Variant = prof.get(g["col"])
		if g.has("is"):
			if v != null:
				return false
		elif g.has("notNull"):
			if v == null:
				return false
		elif g.has("contains"):
			if typeof(v) != TYPE_ARRAY:
				return false
			for x: Variant in g["contains"]:
				if not Js.includes(v, x):
					return false
		else:
			var eq: Variant = g["eq"]
			if typeof(eq) == TYPE_STRING and v != null and (typeof(v) == TYPE_DICTIONARY or typeof(v) == TYPE_ARRAY):
				if JsJson.stringify(v) != eq:
					return false
			elif not _strict_eq(v, eq):
				return false
	update_profile(uid, patch)
	return true


func move_level_watermark(uid: String, from: Variant, to: float) -> bool:
	var prof: Dictionary = me(uid)
	if JsJson.stringify(prof.get("claimed_fishing_levels")) != JsJson.stringify(from):
		return false
	prof["claimed_fishing_levels"] = to
	return true


func raise_hold_tier(uid: String, tier: float) -> void:
	var prof: Dictionary = me(uid)
	if prof.get("fish_hold_tier") == null or float(prof["fish_hold_tier"]) < tier:
		prof["fish_hold_tier"] = tier


func species_ids_in(habitat: String) -> Array:
	var out: Array = []
	for f: Dictionary in save["species"]:
		if f["habitat"] == habitat:
			out.append(f["id"])
	return out


func logged_count(uid: String, ids: Array) -> int:
	me(uid)
	var n: int = 0
	for id: Variant in ids:
		if (save["collection"] as Dictionary).has(Js.key(id)):
			n += 1
	return n


func golden_ids(uid: String, ids: Array) -> Array:
	me(uid)
	var out: Array = []
	for id: Variant in ids:
		var r: Variant = (save["collection"] as Dictionary).get(Js.key(id))
		if r != null and (r as Dictionary).get("is_golden") == true:
			out.append(id)
	return out


func clear_log(uid: String, ids: Array) -> void:
	me(uid)
	for id: Variant in ids:
		(save["collection"] as Dictionary).erase(Js.key(id))


func set_golden(uid: String, fish_id: float) -> void:
	me(uid)
	var r: Variant = (save["collection"] as Dictionary).get(Js.key(fish_id))
	if r != null:
		(r as Dictionary)["is_golden"] = true


func oldest_held_shiny(uid: String) -> Variant:
	me(uid)
	var held: Array = []
	for s: Dictionary in save["shinies"]:
		if s["status"] == "hold":
			held.append(s)
	if held.is_empty():
		return null
	# A stable sort on caught_at, as the TS's (localeCompare on ISO strings).
	var best: Dictionary = held[0]
	for s: Dictionary in held:
		if str(s["caught_at"]) < str(best["caught_at"]):
			best = s
	var f: Variant = species(float(best["fish_id"]))
	return { "id": best["id"], "fish_id": best["fish_id"], "size_in": best.get("size_in"), "name": (f as Dictionary)["name"] if f != null else null }


func shiny(uid: String, shiny_id: float) -> Variant:
	me(uid)
	for s: Dictionary in save["shinies"]:
		if float(s["id"]) == shiny_id:
			var f: Variant = species(float(s["fish_id"]))
			return { "id": s["id"], "status": s["status"], "fish_id": s["fish_id"], "fish_species": { "name": (f as Dictionary)["name"], "sell_value": (f as Dictionary).get("sell_value") } if f != null else null }
	return null


## Resolve a held golden: { failed, claimed }, claimed only if it was on hold.
func resolve_shiny(shiny_id: float, patch: Dictionary) -> Dictionary:
	for s: Dictionary in save["shinies"]:
		if float(s["id"]) == shiny_id:
			if s["status"] != "hold":
				return { "failed": false, "claimed": false }
			for k: Variant in patch:
				s[k] = patch[k]
			return { "failed": false, "claimed": true }
	return { "failed": false, "claimed": false }


func achievement_points(uid: String) -> float:
	var pts: Dictionary = Rules.data()["badgePoints"]
	var n: float = 0.0
	for id: Variant in Js.list(me(uid).get("unlocked_badges")):
		n += float(pts.get(id, 0.0))
	return n


## heldRodTiers: the tiers of the rods held, beyond the Bamboo.
func held_rod_tiers(uid: String) -> Array:
	me(uid)
	var out: Array = []
	var items: Dictionary = Js.obj(save.get("rodItems"))
	for id: Variant in items:
		if float(items[id]) <= 0 or id == "bamboo":
			continue
		var r: Dictionary = Rules.rod_by_id(id)
		if not r.is_empty():
			out.append(float(r["tier"]))
	return out


## JavaScript's === for the scalar values a guard compares (numbers by value).
static func _strict_eq(a: Variant, b: Variant) -> bool:
	var na: bool = typeof(a) == TYPE_INT or typeof(a) == TYPE_FLOAT
	var nb: bool = typeof(b) == TYPE_INT or typeof(b) == TYPE_FLOAT
	if na and nb:
		return float(a) == float(b)
	return typeof(a) == typeof(b) and a == b


func take_from_hold(uid: String, fish_id: float, qty: float) -> bool:
	me(uid)
	var hold: Dictionary = save["hold"]
	var k: String = Js.key(fish_id)
	var have: Variant = hold.get(k)
	if have == null or float(have) < qty:
		return false
	if float(have) - qty == 0.0:
		hold.erase(k)
	else:
		hold[k] = float(have) - qty
	return true


# ── Selling and the tackle shop (sellLocal.ts, harbourLocal.ts, inventoryLocal) ──

func deduct_doubloons(uid: String, amount: float) -> Variant:
	var prof: Dictionary = me(uid)
	var have: float = Js.num(prof.get("doubloons"))
	if have < amount:
		return null
	prof["doubloons"] = have - amount
	return prof["doubloons"]


## The hold as stacks, in the order JavaScript lists an id-keyed object.
func hold_stacks(uid: String) -> Array:
	me(uid)
	var out: Array = []
	for id: float in Js.ids(save["hold"]):
		out.append({ "fish_id": id, "quantity": float(save["hold"][Js.key(id)]) })
	return out


func take_stack(uid: String, fish_id: float, qty: float, if_was: float) -> bool:
	me(uid)
	var k: String = Js.key(fish_id)
	if not (save["hold"] as Dictionary).has(k) or float(save["hold"][k]) != if_was:
		return false
	if qty == 0.0:
		(save["hold"] as Dictionary).erase(k)
	else:
		save["hold"][k] = qty
	return true


func empty_stack(uid: String, fish_id: float, if_was: float) -> bool:
	me(uid)
	var k: String = Js.key(fish_id)
	if not (save["hold"] as Dictionary).has(k) or float(save["hold"][k]) != if_was:
		return false
	(save["hold"] as Dictionary).erase(k)
	return true


func take_whole_hold(uid: String) -> Array:
	var rows: Array = hold_stacks(uid)
	save["hold"] = {}
	return rows


func species_value(fish_id: float) -> Variant:
	var f: Variant = species(fish_id)
	return null if f == null else (f as Dictionary).get("sell_value")


## Copies of a rod held (the Bamboo is always one).
func rod_held(uid: String, id: String) -> float:
	me(uid)
	if id == "bamboo":
		return 1.0
	return Js.num(Js.obj(save.get("rodItems")).get(id))


func rod_give(uid: String, id: String) -> bool:
	me(uid)
	if id == "bamboo" or Rules.rod_by_id(id).is_empty():
		return false
	var items: Dictionary = Js.obj(save.get("rodItems")).duplicate()
	items[id] = Js.num(items.get(id)) + 1.0
	save["rodItems"] = items
	return true


func rod_take(uid: String, id: String) -> bool:
	me(uid)
	var had: float = rod_held(uid, id)
	if id == "bamboo" or had < 1.0:
		return false
	var items: Dictionary = Js.obj(save.get("rodItems")).duplicate()
	if had == 1.0:
		items.erase(id)
	else:
		items[id] = had - 1.0
	save["rodItems"] = items
	return true
