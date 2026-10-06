class_name RaidTable
extends Node
## A CHARTER'S RAID TOGETHER (Kong, 2026-10-03: co-op raids; the settled shape
## in docs/systems/steam-port.md: the founder's game runs the fight, a shared
## planning phase, the boss's target hidden, joining only at a raid's start).
##
## Run on the founder's game like the Den's tables (a raid action is
## `raidTable`, caught by Charter.run); after every change the raid is sent to
## everyone aboard (changed), and every screen plays the same events.
##
##   THE READY CHECK (Kong, 2026-10-03: "like going into a group dungeon in
##   like Warcraft"): a captain calls a raid from its hull at anchor and the
##   entry screen opens (game/ready_screen.gd); everyone aboard hears it. Only
##   a captain whose map has reached that raid, and whose ship is at it
##   (within NEAR of its dock), may join, up to four. Each captain's card
##   (avatar, ship, hull, crew, the tiers beaten) is made here and sent with the
##   state. The caller picks the TIER (Normal; Co-op and Co-op Challenge need
##   two or more, Challenge once every captain has cleared the raid on Co-op;
##   a change of tier asks everyone again), every other captain says Ready,
##   and the caller sails. No clock: it waits for the crew.
##   A ROUND: each captain in the fight plans (an action, its aim judged on
##   their own bar, maybe a crew order, maybe aimed at a crewmate) and says
##   ready. NO CLOCK (Kong: the turn does not move until every captain has
##   committed): the founder's game resolves it (Battle.resolve) when all are
##   in. A tide waits the same way. A captain whose game drops leaves the
##   line (drop). A flee goes in as a plan.
##   PLAYING: every screen plays the round; each says when it is done (or
##   PLAY seconds pass) before the raid moves on, so nobody is left behind.
##   BETWEEN: a flare barrage, played by each captain on their own sky; a
##   tide, each captain choosing their own; the next fight.
##   PAY: every kill pays each captain still in the fight into their own save
##   (a captain sunk or fled is out of it); the boss's crate is each one's own,
##   and the clear is recorded for each.

signal changed(state: Dictionary)

const MUSTER: float = 25.0
const PLAN: float = 30.0
const PLAY: float = 25.0
const FLARES: float = 25.0
const TIDE: float = 30.0
const MAX_SEATS: int = 4
## How near the raid's dock a ship must be to call or join it.
const NEAR: float = 1400.0

## Who in this game is listening (the battle stage, the muster call).
static var live: RaidTable = null

## On the founder's game: the Charter the raid belongs to.
var charter: Charter = null
## The latest raid, as everyone sees it.
var state: Dictionary = {}
var _r: Dictionary = { "phase": "idle", "seq": 0 }
var _began_ms: int = 0


func _ready() -> void:
	name = "RaidTable"
	live = self


func _exit_tree() -> void:
	if live == self:
		live = null


func hosting() -> bool:
	return charter != null


# ── The founder's side ─────────────────────────────────────────────────────────

## One raid action from a captain: [action, payload].
func handle(key: String, s: Session, args: Array) -> Dictionary:
	var action: String = str(args[0]) if args.size() > 0 else ""
	var payload: Variant = args[1] if args.size() > 1 else null
	match action:
		"call":
			return _call(key, s, Js.obj(payload))
		"join":
			return _join(key, s, Js.obj(payload))
		"leave":
			return _leave(key)
		"go":
			if _r["phase"] != "muster" or _r.get("by") != key:
				return { "error": "Only the captain who called it can sail." }
			if str(Js.obj(_r.get("tiers")).get(_r["tier"], "")) != "":
				return { "error": str(_r["tiers"][_r["tier"]]) }
			for m: Dictionary in _r["members"]:
				if m["key"] != key and not m.get("ready", false):
					return { "error": "Not everyone is ready." }
			_start()
			return { "ok": true }
		"ready":
			if _r["phase"] != "muster":
				return { "error": "Not now." }
			for m: Dictionary in _r["members"]:
				if m["key"] == key:
					m["ready"] = payload == true
			_push()
			return { "ok": true }
		"tier":
			if _r["phase"] != "muster" or _r.get("by") != key:
				return { "error": "Only the captain who called it picks the tier." }
			if not ["normal", "coop", "coopc"].has(str(payload)):
				return { "error": "There is no such tier." }
			if str(Js.obj(_r.get("tiers")).get(str(payload), "")) != "":
				return { "error": str(_r["tiers"][str(payload)]) }
			_r["tier"] = str(payload)
			# A new tier: everyone is asked again.
			for m: Dictionary in _r["members"]:
				m["ready"] = false
			_push()
			return { "ok": true }
		"invite":
			return _invite(key, str(payload))
		"answer":
			return _answer(key, payload == true)
		"plan":
			return _plan(key, Js.obj(payload))
		"played":
			return _played(key, int(Js.num(payload)))
		"flares":
			return _flare_result(key, Js.obj(payload))
		"tide":
			return _tide_pick(key, str(payload))
		"drum":
			return _drum(key)
		"nudge":
			return _nudge(key)
		"out":
			# Sunk or got away: this screen has left the fight, so the rounds
			# no longer wait on it.
			if _r.has("gone"):
				_r["gone"][key] = true
				if _r["phase"] == "playing" and _everyone_played():
					_advance()
			return { "ok": true }
	return { "error": "There is no such order." }


func _seat_of(key: String) -> int:
	if not (_r.get("b") is Dictionary):
		return -1
	var seats: Array = _r["b"]["seats"]
	for i: int in seats.size():
		if seats[i].get("key") == key:
			return i
	return -1


## May this captain take on that raid? Their own map must have reached it.
static func eligible(s: Session, node_id: String) -> bool:
	var st: Dictionary = Campaign.statuses(Campaign.view(s.store, s.uid))
	return st.get(node_id, "locked") != "locked"


func _call(key: String, s: Session, p: Dictionary) -> Dictionary:
	if _r["phase"] not in ["idle", "done"]:
		return { "error": "The crew are already at a raid." }
	var node_id: String = str(p.get("nodeId", ""))
	var raid_id: String = str(p.get("raidId", ""))
	if Battle.raid_def(raid_id).is_empty() or not eligible(s, node_id):
		return { "error": "Your map has not reached that raid." }
	if not near(node_id, p):
		return { "error": "Sail to the raid to call the crew to it." }
	_r = { "phase": "muster", "seq": int(_r["seq"]) + 1, "left": -1.0, "raidId": raid_id, "nodeId": node_id, "by": key, "tier": "normal",
		"members": [{ "key": key, "name": s.captain_name(), "ready": true, "card": card_of(s, raid_id) }], "ev": [], "plans": {}, "acks": {}, "flareRes": {}, "tidePicks": {}, "gone": {}, "result": "", "invites": {} }
	_push()
	return { "ok": true }


## Is a ship (its position in the payload) at this raid?
static func near(node_id: String, p: Dictionary) -> bool:
	if not p.has("x"):
		return false
	var at: Vector2 = Vector2(Js.num(p["x"]), Js.num(p["y"]))
	return at.distance_to(dock_of(node_id)) <= NEAR


## Where a raid is fought from: its hull's dock on the campaign's water (or,
## for a raid with no hull there, the open water out of the Sea Gate).
static func dock_of(node_id: String) -> Vector2:
	for e: Dictionary in Js.list(Campaign.water().get("encounters")):
		if e["node"] == node_id:
			return Vector2(float(e["at"]["x"]), float(e["at"]["y"])) + CampaignWater.DOCK_OFF
	return North.SEA_GATE + Vector2(-300, -1300)


func _join(key: String, s: Session, p: Dictionary) -> Dictionary:
	if _r["phase"] != "muster":
		return { "error": "That raid has already sailed." }
	var mem: Array = _r["members"]
	if mem.any(func(m: Dictionary) -> bool: return m["key"] == key):
		return { "ok": true }
	if mem.size() >= MAX_SEATS:
		return { "error": "The line is full." }
	if not eligible(s, str(_r["nodeId"])):
		return { "error": "Your map has not reached that raid yet." }
	var base: String = str(_r["raidId"]).trim_suffix("_challenge")
	if base != str(_r["raidId"]) and s.store.clear_count(s.uid, base) <= 0:
		return { "error": "Beat the raid itself before its Challenge." }
	if not near(str(_r["nodeId"]), p):
		return { "error": "Sail to the raid to join it." }
	mem.append({ "key": key, "name": s.captain_name(), "ready": false, "card": card_of(s, str(_r["raidId"])) })
	if _r.has("invites"):
		_r["invites"].erase(key)
	_push()
	return { "ok": true }


func _leave(key: String) -> Dictionary:
	if _r["phase"] != "muster":
		return { "error": "The fight is on." }
	if _r.get("by") == key:
		_r["phase"] = "idle"
		_r["result"] = "called off"
	else:
		_r["members"] = (_r["members"] as Array).filter(func(m: Dictionary) -> bool: return m["key"] != key)
	_push()
	return { "ok": true }


## The muster is over: every ship joins the line, the first fight begins.
func _start() -> void:
	var seats: Array = []
	for m: Dictionary in _r["members"]:
		var s: Session = _session(m["key"])
		if s == null:
			continue
		var seat: Dictionary = Battle.seat_for(s.store, s.uid, str(m["name"]))
		seat["key"] = m["key"]
		seats.append(seat)
	_r["b"] = Battle.begin(str(_r["raidId"]), seats, str(_r.get("tier", "normal")))
	_began_ms = Time.get_ticks_msec()
	_feats = {}
	_step("plan", [{ "t": "begin" }])


## Move to a phase with this round's events; everyone plays them first.
func _step(next: String, ev: Array) -> void:
	_r["seq"] = int(_r["seq"]) + 1
	_r["ev"] = ev
	_r["acks"] = {}
	_r["after"] = next
	_r["phase"] = "playing"
	_r["left"] = PLAY
	_push()


func _played(key: String, seq: int) -> Dictionary:
	if _r["phase"] != "playing" or seq != int(_r["seq"]):
		return { "ok": true }
	_r["acks"][key] = true
	if _everyone_played():
		_advance()
	return { "ok": true }


func _everyone_played() -> bool:
	for m: Dictionary in _r["members"]:
		if not _r["acks"].has(m["key"]) and not Js.obj(_r.get("gone")).has(m["key"]):
			return false
	return true


## After a round has played on every screen: what comes next.
func _advance() -> void:
	var b: Dictionary = _r["b"]
	var after: String = str(_r.get("after", "plan"))
	match after:
		"plan":
			if b.has("flares") and b["state"] == "plan":
				_r["phase"] = "flares"
				_r["left"] = FLARES
				_r["flareRes"] = {}
				_push()
				return
			_open_plan()
		"won":
			# A tide, or the Throne's reprieve, then the next fight (or the end).
			var tide: Dictionary = Battle.tide_due(b)
			if tide.is_empty():
				tide = Battle.reprieve_due(b)
			if not tide.is_empty():
				_r["phase"] = "tide"
				_r["tide"] = tide
				_r["tidePicks"] = {}
				_r["left"] = -1.0
				_push()
				return
			_next_fight()
		"tided":
			_next_fight()
		_:
			_r["phase"] = "done"
			_push()


func _open_plan() -> void:
	_r["phase"] = "plan"
	_r["plans"] = {}
	_r["left"] = -1.0
	_push()


func _next_fight() -> void:
	var b: Dictionary = _r["b"]
	var nx: Dictionary = Battle.next_fight(b)
	if nx["done"]:
		var ev: Array = _crates()
		_r["result"] = "won"
		_step("end", ev)
		return
	_step("plan", [{ "t": "nextFight", "rest": nx.get("rest", false), "boss": nx.get("boss", false) }])


func _plan(key: String, plan: Dictionary) -> Dictionary:
	if _r["phase"] != "plan":
		return { "error": "Not now." }
	var si: int = _seat_of(key)
	if si < 0 or not Battle.alive(_r["b"]).has(_r["b"]["seats"][si]):
		return { "error": "You are out of this fight." }
	_r["plans"][key] = plan
	_push()
	if _all_planned():
		_resolve()
	return { "ok": true }


func _all_planned() -> bool:
	var b: Dictionary = _r["b"]
	for s: Dictionary in Battle.alive(b):
		if not _r["plans"].has(s["key"]):
			return false
	return true


## Resolve the round on the founder's game (flees first), and pay any kill.
func _resolve() -> void:
	var b: Dictionary = _r["b"]
	var ev: Array = []
	var plans: Array = []
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		var p: Dictionary = Js.obj(_r["plans"].get(s["key"]))
		if p.is_empty():
			var lg: Dictionary = Battle.legal(b, s)
			p = { "action": "reload" if lg["reload"] else "dodge" }
		if str(p.get("action", "")) == "flee" and Battle.alive(b).has(s):
			ev += Battle.flee(b, i)
			p = { "action": "reload" }
		plans.append(p)
	if b["state"] == "plan":
		var rev: Array = Battle.resolve(b, plans)
		# Each captain's biggest hit counts toward their raid-damage bounties.
		for i: int in (b["seats"] as Array).size():
			var ss: Session = _session(str(b["seats"][i].get("key", "")))
			if ss != null:
				Bounties.note_raid_hits(ss.store, ss.uid, rev, i)
				_feat(str(b["seats"][i].get("key", "")), rev, i, int(b["fight"]))
		ev += rev
	match str(b["state"]):
		"won":
			ev += _pay_kill()
			_step("won", ev)
		"lost", "fled":
			_r["result"] = str(b["state"])
			if b["state"] == "lost":
				_lives_lost()
			_step("end", ev)
		_:
			_step("plan", ev)


## A lost raid in a hardcore Charter: a life for every ship that went down.
func _lives_lost() -> void:
	if charter == null:
		return
	var title: String = str(Battle.raid_def(str(_r["raidId"])).get("raidTitle", "a raid"))
	for s: Dictionary in _r["b"]["seats"]:
		if s.get("sunk", false):
			charter.spend_life(str(s.get("key", "")), "Sunk at %s" % title)


## Each captain's feats over the raid (core/raid_feats.gd), by seat key.
var _feats: Dictionary = {}


func _feat(key: String, ev: Array, seat: int, fight: int) -> void:
	if not _feats.has(key):
		_feats[key] = RaidFeats.fresh()
	RaidFeats.feed(_feats[key], ev, seat, fight)


## A kill pays each captain still in the fight.
func _pay_kill() -> Array:
	var b: Dictionary = _r["b"]
	var raid: Dictionary = Battle.raid_def(str(_r["raidId"]))
	var boss: bool = Battle.fight_at(raid, int(b["fight"]))["boss"]
	for k: Variant in _feats:
		RaidFeats.fight_won(_feats[k], boss)
	var tc: Dictionary = Battle.tier_cfg(b)
	var out: Array = []
	for s: Dictionary in Battle.alive(b):
		var ss: Session = _session(s["key"])
		if ss == null:
			continue
		# Through the Charter's book: the purse is the crew's, so the pay is
		# lent in, earned, taken back and noted under the captain's name.
		charter._lend(ss)
		var xp: float = 0.0
		var coin: float = 0.0
		for f: Dictionary in Battle.foes(b):
			var esc: bool = f.get("escort", false)
			var paid: Dictionary = RaidRun.award_kill(ss.store, ss.uid, raid, str(f["id"]), boss and not esc, tc, float(Js.nz(tc.get("escortPay"), 1.0)) if esc else 1.0)
			xp += float(paid["xp"])
			coin += float(paid["doubloons"])
		charter._take(ss)
		if coin > 0.0:
			charter._note(ss.captain_name(), coin, "%s: %s sunk" % [raid.get("raidTitle", "Raid"), b["foes"][0]["name"] if b.has("foes") else b["enemy"]["name"]])
		out.append({ "t": "pay", "key": s["key"], "xp": xp, "doubloons": coin })
	_settle_saves()
	return out


## The raid is done: each captain still in it opens their own crate, and the
## clear is theirs.
func _crates() -> Array:
	var b: Dictionary = _r["b"]
	var raid: Dictionary = Battle.raid_def(str(_r["raidId"]))
	var out: Array = []
	var ms: float = float(Time.get_ticks_msec() - _began_ms)
	for s: Dictionary in Battle.alive(b):
		var ss: Session = _session(s["key"])
		if ss == null:
			continue
		charter._lend(ss)
		var tc2: Dictionary = Battle.tier_cfg(b)
		var r: Dictionary = RaidRun.open_crate(ss.store, ss.uid, raid, float(s["fortune"]), tc2)
		var first: bool = RaidRun.record_tier_clear(ss.store, ss.uid, str(_r["raidId"]), str(b.get("tier", "normal")), tc2, ms)
		RaidFeats.grant(ss.store, ss.uid, str(_r["raidId"]), Js.obj(_feats.get(s["key"])) if _feats.has(s["key"]) else RaidFeats.fresh())
		charter._take(ss)
		out.append({ "t": "tierClear", "key": s["key"], "tier": str(b.get("tier", "normal")), "first": first })
		if Js.num(r.get("coin")) > 0.0:
			charter._note(ss.captain_name(), float(r["coin"]), "%s: the crate" % raid.get("raidTitle", "Raid"))
		out.append({ "t": "crate", "key": s["key"], "coin": r.get("coin", 0.0), "items": (Js.list(r.get("items"))).map(func(x: Dictionary) -> String: return str(x.get("label", x["id"]))) })
	_settle_saves()
	return out


func _flare_result(key: String, res: Dictionary) -> Dictionary:
	if _r["phase"] != "flares":
		return { "ok": true }
	_r["flareRes"][key] = res
	if _all_in("flareRes"):
		_land_flares()
	return { "ok": true }


func _all_in(field: String) -> bool:
	for s: Dictionary in Battle.alive(_r["b"]):
		if not _r[field].has(s["key"]):
			return false
	return true


func _land_flares() -> void:
	var b: Dictionary = _r["b"]
	var res: Array = []
	for s: Dictionary in b["seats"]:
		# A captain who never played their sky let every flare through.
		res.append(Js.obj(_r["flareRes"].get(s["key"], { "missed": float(Js.obj(b.get("flares")).get("count", 0)), "feints": 0.0 })))
	var ev: Array = Battle.flares_land(b, res)
	for i: int in (b["seats"] as Array).size():
		_feat(str(b["seats"][i].get("key", "")), ev, i, int(b["fight"]))
	if b["state"] == "lost":
		_r["result"] = "lost"
		_lives_lost()
	_step("end" if b["state"] == "lost" else "plan", ev)


func _tide_pick(key: String, choice: String) -> Dictionary:
	if _r["phase"] != "tide":
		return { "ok": true }
	var si: int = _seat_of(key)
	if si < 0 or _r["tidePicks"].has(key):
		return { "ok": true }
	var r: Dictionary = Battle.tide_pick(_r["b"], si, _r["tide"], choice)
	_r["tidePicks"][key] = r
	_push()
	if _all_in("tidePicks"):
		_step("tided", [{ "t": "tided", "picks": _r["tidePicks"] }])
	return { "ok": true }


func _drum(key: String) -> Dictionary:
	if _r["phase"] != "plan":
		return { "error": "Not now." }
	var si: int = _seat_of(key)
	if si < 0:
		return { "error": "You are out of this fight." }
	var r: Dictionary = Battle.use_drum(_r["b"], si)
	_push()
	return r


func _process(delta: float) -> void:
	if not hosting():
		return
	if float(_r.get("left", -1.0)) <= 0.0:
		return
	_r["left"] = float(_r["left"]) - delta
	if float(_r["left"]) > 0.0:
		return
	_r["left"] = -1.0
	match str(_r["phase"]):
		"plan":
			_resolve()
		"playing":
			_advance()
		"flares":
			_land_flares()
		"tide":
			for s: Dictionary in Battle.alive(_r["b"]):
				if not _r["tidePicks"].has(s["key"]):
					var ch: Array = Js.list(_r["tide"].get("choices"))
					_tide_pick(s["key"], str(ch[ch.size() - 1]["id"]) if not ch.is_empty() else "")


## Send the raid to everyone (and to this game's own screens).
func _push() -> void:
	_clock()
	if _r["phase"] == "muster":
		_r["crew"] = _crew_view()
		_r["tiers"] = tiers_open(Js.list(_r.get("members")))
		if str(_r["tiers"].get(_r.get("tier", "normal"), "")) != "":
			_r["tier"] = "normal"
	var pub: Dictionary = _r.duplicate(true)
	if multiplayer.multiplayer_peer != null and not multiplayer.get_peers().is_empty():
		_state.rpc(pub)
	else:
		_state(pub)


@rpc("authority", "call_local", "reliable")
func _state(pub: Dictionary) -> void:
	state = pub
	changed.emit(pub)


func _settle_saves() -> void:
	if charter == null:
		return
	charter._spread("")
	charter.write()


func _session(key: String) -> Session:
	return charter.session_for(key) if charter != null else null



## GO ON WITHOUT THEM (Kong's audit, 2026-10-06: one captain gone to make tea
## held the whole crew). Once a choice has waited AFK_WAIT seconds, any
## captain still in can move it on: the ones not yet answered take the
## default (a ship holds and reloads, a curse is borne, a vote banks). The
## clock is the founder's, from when the choice opened.
const AFK_WAIT: float = 60.0
var _phase_ms: int = 0
var _phase_seen: String = ""


func _clock() -> void:
	var tag: String = "%s:%s:%s" % [_r.get("phase", ""), str(_r.get("seq", "")), str(Js.obj(_r.get("draft")).get("turn", ""))]
	if tag != _phase_seen:
		_phase_seen = tag
		_phase_ms = Time.get_ticks_msec()


func _waited() -> bool:
	return Time.get_ticks_msec() - _phase_ms >= int((AFK_WAIT - 5.0) * 1000.0)


# ── Invites (Kong, 2026-10-06: "an option to invite them and they get a
#    notification"; no sailing for them: they still sail there) ─────────────

## Who is aboard the Charter now ([{ key, name }]; CrewNet sets it).
var aboard: Callable = Callable()


## The crewmates aboard but not in the line: each with whether they can come
## ("" or why not) and what they said to an invite ("", asked, coming, no).
func _crew_view() -> Array:
	var out: Array = []
	if not aboard.is_valid():
		return out
	var inv: Dictionary = Js.obj(_r.get("invites"))
	for a: Dictionary in aboard.call():
		var k: String = str(a["key"])
		if (_r["members"] as Array).any(func(m: Dictionary) -> bool: return m["key"] == k):
			continue
		var s: Session = _session(k)
		out.append({ "key": k, "name": a["name"], "can": _invite_refusal(s) if s != null else "Not aboard.", "state": str(inv.get(k, "")) })
	return out


## A captain in the line asks a crewmate aboard to come.
func _invite(key: String, who: String) -> Dictionary:
	if _r["phase"] != "muster":
		return { "error": "Not now." }
	if not (_r["members"] as Array).any(func(m: Dictionary) -> bool: return m["key"] == key):
		return { "error": "Only a captain in the line can ask." }
	var row: Dictionary = {}
	for c: Dictionary in _crew_view():
		if c["key"] == who:
			row = c
	if row.is_empty():
		return { "error": "They are not aboard." }
	if str(row["can"]) != "":
		return { "error": str(row["can"]) }
	if not _r.has("invites"):
		_r["invites"] = {}
	_r["invites"][who] = "asked"
	_push()
	return { "ok": true }


## An invited captain's answer: on their way, or not now.
func _answer(key: String, yes: bool) -> Dictionary:
	if _r["phase"] != "muster" or not Js.obj(_r.get("invites")).has(key):
		return { "ok": true }
	_r["invites"][key] = "coming" if yes else "no"
	_push()
	return { "ok": true }


func _invite_refusal(s: Session) -> String:
	if not eligible(s, str(_r["nodeId"])):
		return "Their map has not reached this raid."
	var base: String = str(_r["raidId"]).trim_suffix("_challenge")
	if base != str(_r["raidId"]) and s.store.clear_count(s.uid, base) <= 0:
		return "They have not beaten the raid itself yet."
	return ""


## A captain back on the line mid-raid: back in their seat, and shown where
## the raid is now.
func welcome(key: String, id: int) -> void:
	if str(_r.get("phase", "idle")) == "idle":
		return
	if Js.obj(_r.get("gone")).has(key) and not ["muster", "done"].has(str(_r["phase"])):
		_r["gone"].erase(key)
		var si: int = _seat_of(key)
		if si >= 0 and not _r["b"]["seats"][si].get("sunk", false):
			_r["b"]["seats"][si].erase("fled")
		_push()
		return
	if multiplayer.multiplayer_peer != null:
		_state.rpc_id(id, _r.duplicate(true))


func _nudge(key: String) -> Dictionary:
	var si: int = _seat_of(key)
	if si < 0 or not Battle.alive(_r["b"]).has(_r["b"]["seats"][si]):
		return { "error": "You are out of this fight." }
	if not _waited():
		return { "error": "Give them a moment more." }
	match str(_r["phase"]):
		"plan":
			_resolve()
		"flares":
			_land_flares()
		"tide":
			for s: Dictionary in Battle.alive(_r["b"]):
				if str(_r["phase"]) == "tide" and not _r["tidePicks"].has(s["key"]):
					var ch: Array = Js.list(_r["tide"].get("choices"))
					_tide_pick(s["key"], str(ch[ch.size() - 1]["id"]) if not ch.is_empty() else "")
	return { "ok": true }


## A captain's game has dropped out of the Charter: out of the muster, or out
## of the line (as one who got away, paid nothing more), and nothing waits on
## them.
func drop(key: String) -> void:
	match str(_r["phase"]):
		"idle", "done":
			return
		"muster":
			_leave(key)
			return
	var si: int = _seat_of(key)
	if si >= 0:
		_r["b"]["seats"][si]["fled"] = true
	_r["gone"][key] = true
	var b: Dictionary = _r["b"]
	if Battle.alive(b).is_empty():
		b["state"] = "fled"
		_r["result"] = "fled"
		_r["phase"] = "done"
		_push()
		return
	match str(_r["phase"]):
		"plan":
			if _all_planned():
				_resolve()
		"playing":
			if _everyone_played():
				_advance()
		"flares":
			if _all_in("flareRes"):
				_land_flares()
		"tide":
			if _all_in("tidePicks"):
				_step("tided", [{ "t": "tided", "picks": _r["tidePicks"] }])



## Why each tier is shut for this line ("" when open).
static func tiers_open(members: Array) -> Dictionary:
	var n: int = members.size()
	var coop: String = "" if n >= 2 else "Needs two or more captains."
	var coopc: String = coop
	if coopc == "" and not members.all(func(m: Dictionary) -> bool: return Js.obj(m.get("card")).get("coopClear", false) == true):
		coopc = "Each captain needs a Co-op clear."
	return { "normal": "", "coop": coop, "coopc": coopc }


## What the entry screen shows of a captain: their face, their ship, its hull
## and Navigation, the hands seated for raids, the tiers of this raid they have beaten, and whether
## they have cleared this raid on Co-op (for the Challenge).
static func card_of(s: Session, raid_id: String) -> Dictionary:
	var p: Dictionary = s.profile()
	var seat: Dictionary = Battle.seat_for(s.store, s.uid, s.captain_name())
	var crew: Array = []
	for c: Dictionary in Js.list(seat.get("crew")):
		var cd: Dictionary = Js.obj(Js.obj(Crew.t().get("classes")).get(c["cls"]))
		crew.append({ "name": c["name"], "filename": c.get("filename", ""), "color": cd.get("color", "#cccccc"), "cls": cd.get("name", "") })
	return {
		"face": seat.get("face"), "shipTier": seat.get("tier"), "shipSkin": seat.get("shipSkin"),
		"hull": seat.get("max"), "nav": Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp"))), "fortune": seat.get("fortune"),
		"crew": crew, "clears": RaidRun.tier_clears(s.store, s.uid, raid_id),
		"coopClear": s.store.clear_count(s.uid, raid_id + "@coop") > 0,
		"ownedSkins": Js.list(p.get("owned_ship_skins")),
	}
