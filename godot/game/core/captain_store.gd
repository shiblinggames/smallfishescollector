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
