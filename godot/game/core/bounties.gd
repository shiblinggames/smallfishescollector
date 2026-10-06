class_name Bounties
extends RefCounted
## THE BOUNTY BOARD (Godot port of lib/core/bounties.ts and lib/bounties.ts,
## with the Steam decisions of 2026-09-30 in docs/systems/bounties.md): orders
## to go and DO something out past the Sea Gate (sink a named captain, beat a
## raid under the clock, dive the Gauntlet deep, land a big voyage). The board
## opens with Chapter I and grows a rung with every chapter (one order, then
## two, three, four), the elite rung the Don's.
##
## THE BOARD RESETS ON COMPLETION, not by the day: claim every order and a new
## board is dealt at once. One swap a board, for an order you cannot attempt.
## An order pays DOUBLOONS by tier (Kong, 2026-10-04: "port with just doubloons
## for now"; the web's gems x 100) and bounty points; finishing a board adds the
## sweep's points. Points climb a ladder of milestones (doubloons, the Corsair
## Hull at the top) and the honorific ranks. The longer cosmetic track decided
## for Steam is not built.
##
## Progress is what has happened since the board was dealt, read off what the
## game already writes down: the raid clears ("raidClears"), the voyages, and
## "bounty_events" for the moments nothing else keeps (a big hit, a depth
## reached, a Gauntlet run ended). The catalogue is content/bounties.json
## (tools/export_bounties.mts). The board is the profile's "bounty_board".
##
## IN A CHARTER ONE BOARD FOR THE CREW (Kong, 2026-10-06; CrewRules): the
## board, the points and the ladder are shared profile columns; every
## captain's play counts toward it; the board is dealt for the captain
## furthest along; a claim pays the crew's purse once; a ladder rung's ship
## skin goes to every captain.

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://content/bounties.json"))
	return _data


static func by_id(id: String) -> Dictionary:
	for b: Dictionary in data()["bounties"]:
		if b["id"] == id:
			return b
	return {}


static func pay(b: Dictionary) -> float:
	return float(data()["doubloons"][b["tier"]])


static func points_for(b: Dictionary) -> float:
	return float(data()["points"][b["tier"]])


static func rung_pay(slots: Array) -> float:
	var n: float = 0.0
	for t: Variant in slots:
		n += float(data()["doubloons"][t])
	return n


## The raids this captain has cleared (tier keys like "raid@coop" left out).
static func _cleared(db: CaptainStore, uid: String) -> Array:
	var seen: Dictionary = {}
	for m: Array in CrewRules.of(db, uid):
		var cdb: CaptainStore = m[0]
		for r: Variant in cdb.cleared_raid_ids(str(m[1])):
			if not str(r).contains("@"):
				seen[r] = true
	return seen.keys()


## Has anyone in the crew run a Gauntlet.
static func _crew_ran(db: CaptainStore, uid: String) -> bool:
	for m: Array in CrewRules.of(db, uid):
		var cdb: CaptainStore = m[0]
		if _ran_gauntlet(cdb.me(str(m[1]))):
			return true
	return false


## A lifetime counter summed over the crew.
static func _crew_counter(db: CaptainStore, uid: String, col: String) -> float:
	var n: float = 0.0
	for m: Array in CrewRules.of(db, uid):
		var cdb: CaptainStore = m[0]
		n += _counter(cdb.me(str(m[1])), col)
	return n


static func rung_for(cleared: Array) -> Dictionary:
	var best: Dictionary = {}
	for r: Dictionary in data()["rungs"]:
		if cleared.has(r["raid"]):
			best = r
	return best


static func next_rung(cur: Dictionary) -> Dictionary:
	var rungs: Array = data()["rungs"]
	var i: int = -1
	for k: int in rungs.size():
		if not cur.is_empty() and int(rungs[k]["chapter"]) == int(cur["chapter"]):
			i = k
	return rungs[i + 1] if i + 1 < rungs.size() else {}


static func _ran_gauntlet(p: Dictionary) -> bool:
	return Js.num(p.get("gauntlet_runs_completed")) + Js.num(p.get("gauntlet_runs_sunk")) > 0.0 or Js.num(p.get("gauntlet_deepest")) > 0.0


## canOffer. No hardcore Gauntlet in the port (a hardcore Charter is the
## hardcore), so the hardcore order is never offered.
static func can_offer(b: Dictionary, cleared: Array, ran: bool) -> bool:
	var req: Dictionary = Js.obj(b.get("requires"))
	if req.get("raid") != null and not cleared.has(req["raid"]):
		return false
	if req.get("anyRaid") != null and not Js.list(req["anyRaid"]).any(func(r: Variant) -> bool: return cleared.has(r)):
		return false
	if req.get("gauntlet") == true and not ran:
		return false
	if req.get("hardcore") == true:
		return false
	return true


## The web's seeded roll (FNV then a mulberry step), per captain per board.
class Seeded:
	var h: int

	func _init(seed: String) -> void:
		h = 2166136261
		for c: int in seed.to_utf8_buffer():
			h = (h ^ c) & 0xFFFFFFFF
			h = Dice.imul(h, 16777619)

	func next() -> float:
		h = (h + 0x6d2b79f5) & 0xFFFFFFFF
		var t: int = h
		t = Dice.imul(t ^ (t >> 15), t | 1)
		t = (t ^ ((t + Dice.imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
		return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


## One order per slot, never two of a family, never one out of reach.
static func roll(seed: String, slots: Array, cleared: Array, ran: bool) -> Array:
	var rand: Seeded = Seeded.new(seed)
	var out: Array = []
	for tier: Variant in slots:
		var pool: Array = (data()["bounties"] as Array).filter(func(b: Dictionary) -> bool:
			return b["tier"] == tier and not out.any(func(o: Dictionary) -> bool: return o["id"] == b["id"]) \
				and not (b.get("family") != null and out.any(func(o: Dictionary) -> bool: return o.get("family") == b["family"])) \
				and can_offer(b, cleared, ran))
		if pool.is_empty():
			continue
		out.append(pool[int(rand.next() * pool.size())])
	return out


# ── What has happened since the board was dealt ───────────────────────────────

## A moment the game keeps nowhere else (bounty_events).
static func log_event(db: CaptainStore, uid: String, kind: String, value: float) -> void:
	db.me(uid)
	if not (db.save.get("bounty_events") is Array):
		db.save["bounty_events"] = []
	var ev: Array = db.save["bounty_events"]
	ev.append({ "kind": kind, "value": value, "at_ms": Clock.now_ms() })
	if ev.size() > 300:
		db.save["bounty_events"] = ev.slice(ev.size() - 300)


## The raid shots in a run of battle events: the biggest one this captain's
## seat landed, logged for the raid-damage orders.
static func note_raid_hits(db: CaptainStore, uid: String, ev: Array, seat: int) -> void:
	var best: float = 0.0
	for x: Dictionary in ev:
		if str(x.get("t", "")) == "shot" and int(Js.nz(x.get("seat"), -1.0)) == seat:
			best = maxf(best, Js.num(x.get("dmg")))
	# The biggest raid hit ever (the raid-damage badges).
	if best > Js.num(db.me(uid).get("highest_raid_damage")):
		db.update_profile(uid, { "highest_raid_damage": best })
	if best >= _smallest("raid_hit"):
		log_event(db, uid, "raid_hit", best)


static func _smallest(kind: String) -> float:
	var m: float = INF
	for b: Dictionary in data()["bounties"]:
		var mt: Dictionary = b["meter"]
		if mt["kind"] == "event" and mt["eventKind"] == kind:
			m = minf(m, float(mt["atLeast"]))
	return m


static func _signals(db: CaptainStore, uid: String, since_ms: float) -> Dictionary:
	var since: String = Js.iso(since_ms)
	var raids: Array = []
	var voyages: Array = []
	var events: Array = []
	var profiles: Array = []
	# Every captain in the crew (a solo captain is a crew of one).
	for m: Array in CrewRules.of(db, uid):
		var cdb: CaptainStore = m[0]
		raids += Js.list(cdb.save.get("raidClears")).filter(func(c: Dictionary) -> bool:
			return str(c.get("at", "")) >= since and not str(c["raid_id"]).contains("@")).map(func(c: Dictionary) -> Dictionary:
			return { "raid_id": c["raid_id"], "elapsed_ms": c.get("ms") })
		voyages += Js.list(cdb.save.get("voyages")).filter(func(v: Dictionary) -> bool:
			return v.get("status") == "revealed" and float(v["created_ms"]) >= since_ms)
		events += Js.list(cdb.save.get("bounty_events")).filter(func(e: Dictionary) -> bool: return float(e["at_ms"]) >= since_ms)
		profiles.append(cdb.me(str(m[1])))
	return { "raids": raids, "voyages": voyages, "events": events, "profile": db.me(uid), "profiles": profiles }


static func _base_of(id: String) -> String:
	return id.trim_suffix("_challenge")


static func measure(m: Dictionary, s: Dictionary, baseline: float) -> float:
	var raids: Array = s["raids"]
	match str(m["kind"]):
		"raid_clear":
			return float(raids.filter(func(r: Dictionary) -> bool:
				return r["raid_id"] == m["raidId"] or (str(r["raid_id"]).ends_with("_challenge") and _base_of(str(r["raid_id"])) == m["raidId"])).size())
		"raid_any":
			return float(raids.size())
		"raid_any_of":
			return float(raids.filter(func(r: Dictionary) -> bool: return Js.list(m["raidIds"]).has(r["raid_id"])).size())
		"raid_fast":
			return float(raids.filter(func(r: Dictionary) -> bool:
				return r["raid_id"] == m["raidId"] and r.get("elapsed_ms") != null and float(r["elapsed_ms"]) <= float(m["underS"]) * 1000.0).size())
		"voyages":
			return float((s["voyages"] as Array).size())
		"raid_distinct":
			var seen: Dictionary = {}
			for r: Dictionary in raids:
				seen[r["raid_id"]] = true
			return float(seen.size())
		"raid_budget":
			var times: Array = raids.filter(func(r: Dictionary) -> bool: return r.get("elapsed_ms") != null).map(func(r: Dictionary) -> float: return float(r["elapsed_ms"]))
			times.sort()
			times = times.slice(0, int(m["raids"]))
			if times.size() < int(m["raids"]):
				return 0.0
			var tot: float = 0.0
			for t: float in times:
				tot += t
			return 1.0 if tot <= float(m["totalS"]) * 1000.0 else 0.0
		"voyage_haul":
			return float((s["voyages"] as Array).filter(func(v: Dictionary) -> bool: return Js.num(v.get("total_doubloons")) >= float(m["atLeast"])).size())
		"voyage_haul_total":
			var sum: float = 0.0
			for v: Dictionary in s["voyages"]:
				sum += Js.num(v.get("total_doubloons"))
			return 1.0 if sum >= float(m["atLeast"]) else 0.0
		"voyage_route":
			return float((s["voyages"] as Array).filter(func(v: Dictionary) -> bool: return v["route"] == m["route"]).size())
		"counter":
			var sum: float = 0.0
			for p: Dictionary in Js.list(s.get("profiles", [s["profile"]])):
				sum += _counter(p, str(m["column"]))
			return maxf(0.0, sum - baseline)
		"event":
			return float((s["events"] as Array).filter(func(e: Dictionary) -> bool: return e["kind"] == m["eventKind"] and float(e["value"]) >= float(m["atLeast"])).size())
	return 0.0


## A lifetime counter. The port keeps the Gauntlet's runs as banked and sunk;
## "a finished run" (dying counts) is both.
static func _counter(p: Dictionary, col: String) -> float:
	if col == "gauntlet_runs_completed":
		return Js.num(p.get("gauntlet_runs_completed")) + Js.num(p.get("gauntlet_runs_sunk"))
	return Js.num(p.get(col))


# ── The board ────────────────────────────────────────────────────────────────

static func _deal(db: CaptainStore, uid: String, rung: Dictionary, n: float) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var picked: Array = roll("%s:board-%d" % [uid, int(n)], rung["slots"], _cleared(db, uid), _crew_ran(db, uid))
	var baselines: Dictionary = {}
	for b: Dictionary in picked:
		if b["meter"]["kind"] == "counter":
			baselines[b["id"]] = _crew_counter(db, uid, str(b["meter"]["column"]))
	var board: Dictionary = {
		"n": n, "ids": picked.map(func(b: Dictionary) -> String: return b["id"]), "baselines": baselines,
		"claimed": picked.map(func(_b: Dictionary) -> bool: return false), "assigned_ms": Clock.now_ms(), "reroll_used": false,
	}
	db.update_profile(uid, { "bounty_board": board })
	return board


## The board as it stands, dealing a new one when there is none, when the last
## was finished, or when the rung has grown under an untouched board.
static func board(db: CaptainStore, uid: String) -> Dictionary:
	var rung: Dictionary = rung_for(_cleared(db, uid))
	if rung.is_empty():
		return {}
	var p: Dictionary = db.me(uid)
	var row: Dictionary = Js.obj(p.get("bounty_board"))
	if row.is_empty():
		return _deal(db, uid, rung, 1.0)
	var claimed: Array = Js.list(row.get("claimed"))
	if not claimed.is_empty() and claimed.all(func(c: Variant) -> bool: return c == true):
		return _deal(db, uid, rung, float(row["n"]) + 1.0)
	var tiers: Array = Js.list(row.get("ids")).map(func(id: Variant) -> String: return str(by_id(str(id)).get("tier", "")))
	tiers.sort()
	var want: Array = (rung["slots"] as Array).duplicate()
	want.sort()
	if not claimed.any(func(c: Variant) -> bool: return c == true) and tiers != want:
		return _deal(db, uid, rung, float(row["n"]) + 1.0)
	return row


static func state(db: CaptainStore, uid: String) -> Dictionary:
	var cleared: Array = _cleared(db, uid)
	var rung: Dictionary = rung_for(cleared)
	var p: Dictionary = db.me(uid)
	var points: float = Js.num(p.get("bounty_points"))
	var claimed_ms: int = int(Js.num(p.get("bounty_milestones_claimed")))
	var ms: Array = data()["milestones"]
	var earned: int = ms.filter(func(m: Dictionary) -> bool: return points >= float(m["points"])).size()
	var out: Dictionary = {
		"unlocked": not rung.is_empty(), "points": points, "milestonesClaimed": claimed_ms,
		"milestonesReady": maxi(0, earned - claimed_ms), "nextMilestone": ms[claimed_ms] if claimed_ms < ms.size() else {},
		"rank": _rank(points), "nextRank": _next_rank(points),
	}
	if rung.is_empty():
		out["lockReason"] = "Clear Chapter I (sink Captain Krust) to open the bounty board."
		return out
	var row: Dictionary = board(db, uid)
	var s: Dictionary = _signals(db, uid, float(row["assigned_ms"]))
	var views: Array = []
	var ids: Array = row["ids"]
	for i: int in ids.size():
		var b: Dictionary = by_id(str(ids[i]))
		if b.is_empty():
			continue
		views.append({
			"id": b["id"], "name": b["name"], "desc": b["desc"], "tier": b["tier"], "pay": pay(b), "points": points_for(b),
			"target": float(b["target"]), "progress": minf(float(b["target"]), measure(b["meter"], s, Js.num(Js.obj(row.get("baselines")).get(b["id"])))),
			"claimed": row["claimed"][i] == true,
		})
	var nx: Dictionary = next_rung(rung)
	var seen: int = int(Js.num(p.get("bounty_rung_seen")))
	out.merge({
		"board": int(row["n"]), "bounties": views, "rerollUsed": row.get("reroll_used") == true,
		"rung": { "chapter": rung["chapter"], "title": rung["title"], "boss": rung["boss"], "pay": rung_pay(rung["slots"]) },
		"next": {} if nx.is_empty() else { "chapter": nx["chapter"], "title": nx["title"], "boss": nx["boss"], "pay": rung_pay(nx["slots"]) },
		"news": {} if int(rung["chapter"]) <= seen else { "chapter": rung["chapter"], "title": rung["title"], "boss": rung["boss"], "orders": (rung["slots"] as Array).size(), "first": int(rung["chapter"]) == 1 },
		"sweepPoints": float(data()["sweepPoints"]),
	}, true)
	return out


static func claim(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var row: Dictionary = board(db, uid)
	if row.is_empty():
		return { "error": "The board is shut." }
	var ids: Array = row["ids"]
	var i: int = ids.find(id)
	if i < 0:
		return { "error": "Not on your board." }
	if row["claimed"][i] == true:
		return { "error": "Already claimed." }
	var b: Dictionary = by_id(id)
	var s: Dictionary = _signals(db, uid, float(row["assigned_ms"]))
	if measure(b["meter"], s, Js.num(Js.obj(row.get("baselines")).get(id))) < float(b["target"]):
		return { "error": "Not finished yet." }
	row["claimed"][i] = true
	var sweep: bool = (row["claimed"] as Array).all(func(c: Variant) -> bool: return c == true)
	db.update_profile(uid, { "bounty_board": row })
	var d: float = pay(b)
	var pts: float = points_for(b) + (float(data()["sweepPoints"]) if sweep else 0.0)
	var before: float = Js.num(db.me(uid).get("bounty_points"))
	var bal: float = db.grant(uid, "doubloons", d)
	db.ledger(uid, d, "Bounty: %s" % b["name"])
	db.bump_stat(uid, "bounties_claimed", 1.0)
	db.bump_stat(uid, "bounty_doubloons_earned", d)
	db.bump_stat(uid, "bounty_points", pts)
	if sweep:
		db.bump_stat(uid, "bounty_boards_cleared", 1.0)
	if b["tier"] == "elite":
		db.bump_stat(uid, "bounty_elites_claimed", 1.0)
	var r_before: Dictionary = _rank(before)
	var r_after: Dictionary = _rank(before + pts)
	return {
		"ok": true, "doubloons": d, "total": bal, "points": pts, "sweep": sweep,
		"rankGained": r_after if not r_after.is_empty() and r_after.get("slug") != r_before.get("slug") else {},
	}


## The one swap a board: same tier, never one on the board, never one out of reach.
static func reroll(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var row: Dictionary = board(db, uid)
	if row.is_empty():
		return { "error": "The board is shut." }
	if row.get("reroll_used") == true:
		return { "error": "You have used this board's swap." }
	var ids: Array = (row["ids"] as Array).duplicate()
	var i: int = ids.find(id)
	if i < 0:
		return { "error": "Not on your board." }
	if row["claimed"][i] == true:
		return { "error": "That one is already paid." }
	var old: Dictionary = by_id(id)
	var p: Dictionary = db.me(uid)
	var cleared: Array = _cleared(db, uid)
	var ran: bool = _crew_ran(db, uid)
	var others: Array = ids.filter(func(x: Variant) -> bool: return x != id).map(func(x: Variant) -> Dictionary: return by_id(str(x)))
	var pool: Array = (data()["bounties"] as Array).filter(func(b: Dictionary) -> bool:
		return b["tier"] == old["tier"] and b["id"] != id and not ids.has(b["id"]) \
			and not (b.get("family") != null and others.any(func(o: Dictionary) -> bool: return o.get("family") == b["family"])) \
			and can_offer(b, cleared, ran))
	if pool.is_empty():
		return { "error": "Nothing else to offer." }
	var rep: Dictionary = pool[int(Dice.next() * pool.size())]
	ids[i] = rep["id"]
	var baselines: Dictionary = Js.obj(row.get("baselines")).duplicate()
	baselines.erase(id)
	if rep["meter"]["kind"] == "counter":
		baselines[rep["id"]] = _crew_counter(db, uid, str(rep["meter"]["column"]))
	row["ids"] = ids
	row["baselines"] = baselines
	row["reroll_used"] = true
	db.update_profile(uid, { "bounty_board": row })
	return { "ok": true }


## Collect the next rung of the points ladder, strictly in order.
static func claim_milestone(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var n: int = int(Js.num(p.get("bounty_milestones_claimed")))
	var ms: Array = data()["milestones"]
	if n >= ms.size():
		return { "error": "Every milestone is already collected." }
	var m: Dictionary = ms[n]
	if Js.num(p.get("bounty_points")) < float(m["points"]):
		return { "error": "%d more points needed." % int(float(m["points"]) - Js.num(p.get("bounty_points"))) }
	db.update_profile(uid, { "bounty_milestones_claimed": float(n + 1) })
	var d: float = float(m["doubloons"])
	if d > 0.0:
		db.grant(uid, "doubloons", d)
		db.ledger(uid, d, "Bounty milestone")
	var skin: Variant = null
	# The rung's ship skin: to every captain in the crew.
	if m.get("shipSkinId") != null:
		for cm: Array in CrewRules.of(db, uid):
			var cdb: CaptainStore = cm[0]
			if not Js.list(cdb.me(str(cm[1])).get("owned_ship_skins")).has(m["shipSkinId"]):
				cdb.add_to_list(str(cm[1]), "owned_ship_skins", m["shipSkinId"])
				if cdb == db:
					skin = m["shipSkinId"]
	return { "ok": true, "label": m["label"], "doubloons": d, "shipSkinId": skin }


## Told about the rung: only ever raised.
static func mark_rung_seen(db: CaptainStore, uid: String, chapter: float) -> Dictionary:
	if Js.num(db.me(uid).get("bounty_rung_seen")) < chapter:
		db.update_profile(uid, { "bounty_rung_seen": chapter })
	return { "ok": true }


static func _rank(points: float) -> Dictionary:
	var held: Dictionary = {}
	for r: Dictionary in data()["ranks"]:
		if points >= float(r["points"]):
			held = r
	return held


static func _next_rank(points: float) -> Dictionary:
	for r: Dictionary in data()["ranks"]:
		if points < float(r["points"]):
			return r
	return {}
