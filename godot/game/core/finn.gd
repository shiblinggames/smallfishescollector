class_name Finn
extends RefCounted
## FINN, a port of finnState, speakToFinn and turnInFinnQuest in
## web/lib/core/sea.ts with the helpers of web/lib/finnQuests.ts,
## web/lib/finn.ts and web/lib/seaFinn.ts; his words, jobs and chapters come
## from rules.json "finn".
##
## The fishing campaign (in the port, The Long Cast). Beat, job, hand it back,
## beat: a job blocks the story until it is handed in, and handing it in pays,
## records it and gives the next beat and the next job in one moment. A job
## is measured as a delta from a snapshot taken when he set it, off counters
## the catch already keeps (the lifetime log, zone_perfects, the streak); the
## giants are the one absolute (a lifetime trophy). Each job waits on the level
## of its water, and the story never gates anything else.

const SEL: String = "finn_encounters, finn_seen_beats, finn_revealed, finn_quest, finn_quests_done, fishing_xp, doubloons, ancient_catches, current_perfect_streak, total_perfects, zone_perfects"


static func d() -> Dictionary:
	return Rules.data()["finn"]


static func quests() -> Array:
	return d()["quests"]


static func chapters() -> Array:
	return d()["chapters"]


static func quest_by_id(id: Variant) -> Dictionary:
	if id == null or str(id) == "":
		return {}
	for q: Dictionary in quests():
		if q["id"] == id:
			return q
	return {}


## The next job he has not set you, if your level reaches its water.
static func next_quest(done: Array, level: int) -> Dictionary:
	var q: Dictionary = pending_quest(done)
	if q.is_empty():
		return {}
	return q if float(q["minLevel"]) <= level else {}


## The next job whatever the level, so he can say what he is waiting for.
static func pending_quest(done: Array) -> Dictionary:
	for q: Dictionary in quests():
		if not done.has(q["id"]):
			return q
	return {}


static func chapter_quests(chapter_id: String) -> Array:
	for ch: Dictionary in chapters():
		if ch["id"] == chapter_id:
			return quests().filter(func(q: Dictionary) -> bool: return q["band"] == ch["band"])
	return []


## Every chapter with its state (finnChapters): done, total, complete, current
## (the first open and unfinished one), open (by level).
static func chapter_views(done: Array, level: int) -> Array:
	var found: bool = false
	var out: Array = []
	for ch: Dictionary in chapters():
		var qs: Array = quests().filter(func(q: Dictionary) -> bool: return q["band"] == ch["band"])
		var n: int = qs.filter(func(q: Dictionary) -> bool: return done.has(q["id"])).size()
		var complete: bool = qs.size() > 0 and n == qs.size()
		var open: bool = level >= int(ch["minLevel"])
		var current: bool = not found and open and not complete
		if current:
			found = true
		out.append({ "chapter": ch, "done": n, "total": qs.size(), "complete": complete, "current": current, "open": open })
	return out


## The chapter you are waiting on a level for, when nothing reachable is left.
static func waiting_on(done: Array, level: int) -> Dictionary:
	var views: Array = chapter_views(done, level)
	for v: Dictionary in views:
		if v["current"]:
			return {}
	for v: Dictionary in views:
		if not v["complete"] and not v["open"]:
			return v["chapter"]
	return {}


static func progress_label(q: Dictionary, have: float) -> String:
	var target: int = int(q["target"])
	if q["type"] == "zone_streak":
		return "Best run since he asked: %d of %d" % [mini(int(have), target), target]
	if q["type"] == "catch_ancient":
		return "Landed" if have >= 1.0 else "Not yet raised"
	return "%d of %d" % [mini(int(have), target), target]


static func next_beat(seen: Array) -> Dictionary:
	for b: Dictionary in d()["beats"]:
		if not seen.has(b["id"]):
			return b
	return {}


## Where he is: moored off the Shallows, circling his mooring once every lap.
static func haunt(encounters: float, _level: int) -> Dictionary:
	var n: int = int(maxf(0.0, minf(100000.0, floor(encounters))))
	var now_sec: float = Clock.now_ms() / 1000.0
	var lap: float = float(d()["lap"])
	var a: float = (fmod(now_sec, lap) / lap) * PI * 2.0
	var m: Vector2 = SeaScale.expand(Vector2(float(d()["mooring"]["x"]), float(d()["mooring"]["y"])))
	var roam: float = float(d()["roam"])
	# To a thousandth of a pixel, as the web: the sines' last bits agree.
	var x: float = Js.round((m.x + cos(a) * roam) * 1000.0) / 1000.0
	var y: float = Js.round((m.y + sin(a) * roam * 0.6) * 1000.0) / 1000.0
	return { "x": x, "y": y, "bandId": "shallows", "bandName": str(d().get("bandName", "The Shallows")), "key": "finn:%d" % n }


static func _at(h: Dictionary) -> Dictionary:
	return { "x": h["x"], "y": h["y"], "bandName": h["bandName"] }


## The standing he holds you in: meetings, and each job handed back counts two.
static func standing(encounters: float, jobs_done: float) -> float:
	return encounters + jobs_done * 2.0


static func standing_tier(points: float) -> int:
	var at: Array = d()["standingAt"]
	for t: int in range(at.size() - 1, 0, -1):
		if points >= float(at[t]):
			return t
	return 0


# ── Measuring a job ────────────────────────────────────────────────────────────

static func lifetime_catches(db: CaptainStore, uid: String) -> float:
	db.me(uid)
	var n: float = 0.0
	for k: String in (db.save["lifetime"] as Dictionary):
		var r: Variant = db.save["lifetime"][k]
		n += Js.num((r as Dictionary).get("n")) if r != null else 0.0
	return n


static func catches_where(db: CaptainStore, uid: String, zone: Variant, min_rarity: Variant) -> float:
	db.me(uid)
	var has_zone: bool = zone != null and str(zone) != ""
	var has_rar: bool = min_rarity != null and float(min_rarity) != 0.0
	if not has_zone and not has_rar:
		return 0.0
	var ids: Dictionary = {}
	for sp: Dictionary in db.save["species"]:
		if (not has_zone or sp["habitat"] == zone) and (not has_rar or Js.num(sp.get("bite_rarity")) >= float(min_rarity)):
			ids[Js.key(sp["id"])] = true
	if ids.is_empty():
		return 0.0
	var n: float = 0.0
	for k: String in (db.save["lifetime"] as Dictionary):
		if ids.has(k):
			var r: Variant = db.save["lifetime"][k]
			n += Js.num((r as Dictionary).get("n")) if r != null else 0.0
	return n


static func _snapshot(db: CaptainStore, uid: String, q: Dictionary, perf_now: float, zp: Dictionary) -> Dictionary:
	var zone: Variant = q.get("zone")
	var rar: Variant = q.get("minRarity")
	return {
		"id": q["id"],
		"at": Js.iso(Clock.now_ms()),
		"catch0": lifetime_catches(db, uid),
		"perf0": perf_now,
		"zone0": catches_where(db, uid, zone, null) if zone != null else 0.0,
		"rare0": catches_where(db, uid, zone, rar) if rar != null and float(rar) != 0.0 else 0.0,
		"zperf0": Js.num(zp.get(str(zone))) if zone != null else 0.0,
	}


static func progress(db: CaptainStore, uid: String, q: Dictionary, stored: Dictionary, row: Dictionary) -> float:
	var zp: Dictionary = Js.obj(row.get("zone_perfects"))
	var zone: String = str(q.get("zone", "")) if q.get("zone") != null else ""
	var zone0: float = Js.num(stored.get("zone0"))
	var rare0: float = Js.num(stored.get("rare0"))
	var zperf0: float = Js.num(stored.get("zperf0"))
	match q["type"]:
		"catch_zone":
			return catches_where(db, uid, q.get("zone"), null) - zone0
		"zone_perfects":
			return Js.num(zp.get(zone)) - zperf0
		"zone_streak":
			var streak: float = Js.num(row.get("current_perfect_streak"))
			return minf(streak, Js.num(zp.get(zone)) - zperf0)
		"catch_rarity":
			return catches_where(db, uid, q.get("zone"), q.get("minRarity")) - rare0
		"catch_ancient":
			var wall: Array = Js.list(row.get("ancient_catches"))
			return 1.0 if q.get("ancientId") != null and Js.includes(wall, q["ancientId"]) else 0.0
	return 0.0


static func _view(db: CaptainStore, uid: String, row: Dictionary) -> Variant:
	var stored: Variant = row.get("finn_quest")
	if stored == null:
		return null
	var q: Dictionary = quest_by_id((stored as Dictionary).get("id"))
	if q.is_empty():
		return null
	var have: float = maxf(0.0, progress(db, uid, q, stored, row))
	return {
		"id": q["id"], "label": q["label"], "reward": q["reward"], "xp": q["xp"],
		"have": have, "target": q["target"], "done": have >= float(q["target"]),
		"progressText": progress_label(q, have),
	}


# ── The actions ────────────────────────────────────────────────────────────────

static func state(db: CaptainStore, uid: String) -> Variant:
	var row: Dictionary = db.profile(uid, SEL)
	if row.is_empty():
		return null
	var enc: float = Js.num(row.get("finn_encounters"))
	var level: int = Rules.level_from_xp(Js.num(row.get("fishing_xp")))
	var h: Dictionary = haunt(enc, level)
	var quest: Variant = _view(db, uid, row)
	return {
		"encounters": enc,
		"seenBeats": Js.list(row.get("finn_seen_beats")),
		"revealed": row.get("finn_revealed") == true,
		"fishingLevel": level,
		"at": _at(h),
		"quest": quest,
		"questReady": quest != null and (quest as Dictionary)["done"] == true,
		"questsDone": Js.list(row.get("finn_quests_done")),
	}


## One rung: the next unheard beat and the next unset job, together.
static func _next_rung(db: CaptainStore, uid: String, row: Dictionary) -> Dictionary:
	var seen: Array = Js.list(row.get("finn_seen_beats"))
	var beat: Dictionary = next_beat(seen)
	var lines: Array = []
	if not beat.is_empty():
		for l: Variant in beat["lines"]:
			lines.append(l if typeof(l) == TYPE_STRING else (l as Dictionary)["text"])
	var q: Dictionary = next_quest(Js.list(row.get("finn_quests_done")), Rules.level_from_xp(Js.num(row.get("fishing_xp"))))
	var stored: Variant = null
	if not q.is_empty():
		stored = _snapshot(db, uid, q, Js.num(row.get("total_perfects")), Js.obj(row.get("zone_perfects")))
		lines.append(q["give"])
	var out_seen: Array = seen
	if not beat.is_empty() and not seen.has(beat["id"]):
		out_seen = seen + [beat["id"]]
	return { "lines": lines, "seen": out_seen, "quest": stored }


static func turn_in(db: CaptainStore, uid: String) -> Variant:
	var row: Dictionary = db.profile(uid, SEL)
	if row.is_empty():
		return null
	var stored: Variant = row.get("finn_quest")
	var q: Dictionary = quest_by_id((stored as Dictionary).get("id")) if stored is Dictionary else {}
	if stored == null or q.is_empty():
		return { "error": "He has not set you anything." }
	var have: float = maxf(0.0, progress(db, uid, q, stored, row))
	if have < float(q["target"]):
		return { "error": q["waiting"] }
	var done_ids: Array = Js.list(row.get("finn_quests_done"))
	var new_done: Array = done_ids if done_ids.has(q["id"]) else done_ids + [q["id"]]
	var row2: Dictionary = row.duplicate()
	row2["finn_quests_done"] = new_done
	var rung: Dictionary = _next_rung(db, uid, row2)
	var settled: bool = db.update_profile_if(uid, {
		"finn_quest": rung["quest"], "finn_quests_done": new_done, "finn_seen_beats": rung["seen"], "finn_last_outcome": null,
	}, [{ "col": "finn_quest", "notNull": true }])
	if not settled:
		return { "error": "That one is already handed in." }
	if float(q["reward"]) > 0.0:
		db.bump_stat(uid, "doubloons", float(q["reward"]))
		db.ledger(uid, float(q["reward"]), "Finn's job: %s" % q["label"])
	if float(q["xp"]) > 0.0:
		db.bump_stat(uid, "fishing_xp", float(q["xp"]))
	var after: Dictionary = db.profile(uid, "doubloons, fishing_xp")
	return {
		"reward": q["reward"], "lines": [q["done"]] + rung["lines"], "questsDone": new_done,
		"newDoubloons": Js.num(after.get("doubloons")), "xp": q["xp"], "newFishingXP": Js.num(after.get("fishing_xp")),
	}


static func speak(db: CaptainStore, uid: String, at_index: float) -> Variant:
	var row: Dictionary = db.profile(uid, SEL)
	if row.is_empty():
		return null
	var enc: float = Js.num(row.get("finn_encounters"))
	if enc != at_index:
		return null
	var seen: Array = Js.list(row.get("finn_seen_beats"))
	var revealed: bool = row.get("finn_revealed") == true
	var level: int = Rules.level_from_xp(Js.num(row.get("fishing_xp")))
	var has_trophy: bool = Js.list(row.get("ancient_catches")).size() > 0
	# The mask slips once a giant is landed, at a meeting.
	if has_trophy and not revealed:
		var rs: Array = seen if seen.has("reveal") else seen + ["reveal"]
		db.update_profile(uid, { "finn_revealed": true, "finn_seen_beats": rs })
		return {
			"lines": d()["reveal"]["lines"], "mode": "reveal",
			"encounters": enc, "seenBeats": rs, "revealed": true, "at": _at(haunt(enc, level)),
		}
	# A job blocks the story: beat, job, hand it back, next beat.
	var open_stored: Variant = row.get("finn_quest")
	var open_q: Dictionary = quest_by_id((open_stored as Dictionary).get("id")) if open_stored is Dictionary else {}
	var rung: Variant = null if not open_q.is_empty() else _next_rung(db, uid, row)
	var new_seen: Array = (rung as Dictionary)["seen"] if rung != null else seen
	var new_enc: float = enc + 1.0
	var idle: Array = d()["epilogueIdle"] if revealed else d()["idle"]
	var lines: Array
	var done_ids: Array = Js.list(row.get("finn_quests_done"))
	if not open_q.is_empty():
		var have: float = maxf(0.0, progress(db, uid, open_q, open_stored, row))
		lines = ["You have got it. Go on then, hand it over."] if have >= float(open_q["target"]) else [open_q["waiting"]]
	elif rung != null and ((rung as Dictionary)["lines"] as Array).size() > 0:
		lines = (rung as Dictionary)["lines"]
	elif not pending_quest(done_ids).is_empty():
		lines = [pending_quest(done_ids)["gated"]]
	elif revealed and Dice.next() < float(d()["loreChance"]):
		lines = [_pick(d()["epilogueLore"])]
	else:
		lines = [_pick(idle)]
	var keep_quest: Variant = row.get("finn_quest")
	if rung != null and (rung as Dictionary)["quest"] != null:
		keep_quest = (rung as Dictionary)["quest"]
	var won: bool = db.update_profile_if(uid, {
		"finn_encounters": new_enc, "finn_seen_beats": new_seen, "finn_quest": keep_quest,
	}, [{ "col": "finn_encounters", "eq": row.get("finn_encounters") if row.get("finn_encounters") != null else 0.0 }])
	if not won:
		return null
	return { "lines": lines, "mode": "offer", "encounters": new_enc, "seenBeats": new_seen, "revealed": revealed, "at": _at(haunt(new_enc, level)) }


static func _pick(pool: Array) -> String:
	var i: int = int(floor(Dice.next() * pool.size()))
	return str(pool[i]) if i < pool.size() else ""
