class_name GauntletTable
extends "res://game/crew_table.gd"
## A DESCENT TOGETHER (Kong, 2026-10-03: "multiplayer coop gauntlet ... the end
## game coop repeatable game loop"). One table runs every gauntlet dive, alone
## or with a Charter's crew: alone it is this game's own (key "me"); in a
## Charter it runs on the founder's game like the raid table (op
## `gauntletTable`, caught by Charter.run) and after every change the run is
## sent to everyone aboard, every screen playing the same events.
##
## The rules are core/gauntlet.gd (the web's, parity-checked) and the fights
## core/battle.gd. What the party SHARES and what stays each captain's own
## (Kong's answers, 2026-10-03):
##   SHARED   the depth, the pot (each captain banks all of it), the curses
##            (the Locker curses the party), the fights (a field of one to
##            four ships, like a co-op raid's), the jobs, the vote at every
##            breather.
##   OWN      the hull, the crew and their orders, the boons, synergies and
##            Marks, the Locker's perks, the Fathoms, the haul.
##
##   THE MUSTER   a captain calls a dive from the maelstrom (within NEAR of
##                it) and picks SOLO (one ship, one enemy at a time) or CO-OP
##                (two to four ships against fields); the rest join from the
##                same water and say Ready. (Kong, 2026-10-03: no hardcore
##                gauntlets, a hardcore Charter is the hardcore; so no Terms
##                and no Blood Gems from a dive either.)
##   THE DRAFT TABLE (Kong: "a live draft table"): a face-up spread of power
##                cards, party size plus two, picked in turn; the order
##                rotates each draft; every pick is stamped with its captain
##                as it lands. A card is a FAMILY: each captain takes the next
##                tier of it for themselves. Each captain may also hold a
##                private synergy card (their own pair), taken instead of a
##                card from the spread. The one whose turn it is may reroll
##                the cards left (a Locker reroll) or banish one (Blacklist).
##   THE VOTE     (Kong: "party vote"): at a breather every captain afloat
##                votes to bank or to dive; a majority carries, a tie banks.
##   TOWED HOME   (Kong): a captain sunk in a fight the crew wins is towed
##                along and rejoins at a quarter hull, the pot still theirs.
##                The whole party sunk: the dive is lost, pots and all.
##   HELD DIVES   every breather writes the dive down (a crash picks it up
##                there); the crew may also vote to HOLD it (everyone must),
##                and come back to the maelstrom to resume it, the same crew,
##                any day. A held dive may be ended instead: Fathoms paid, the
##                pot lost. One held dive per descent (alone: in the
##                captain's save; in a Charter: in the Charter's).
## Nothing runs on a clock: every step waits for the crew.
##
## The plumbing it shares with RaidTable (the wire, the invites, the AFK clock,
## welcome and drop) is in game/crew_table.gd, which it extends.

## How near the maelstrom a ship must be to call or join a dive.
const NEAR: float = 1500.0
## The share of a mob's pot an escort adds when it sinks.
const ESCORT_POT: float = 0.5
## A towed ship rejoins at this share of its hull.
const TOW_HP: float = 0.25

## The table's parts (split out on 2026-10-10 for size; each takes the table
## as its first argument, and the table forwards to them under the old names).
const GauntletDraft = preload("res://game/gauntlet_draft.gd")
const GauntletBetween = preload("res://game/gauntlet_between.gd")
const GauntletPay = preload("res://game/gauntlet_pay.gd")
const GauntletHeld = preload("res://game/gauntlet_held.gd")

static var live: GauntletTable = null

## Alone: the one captain (on the founder's game, `charter` is the Charter).
var solo: Session = null


func _ready() -> void:
	name = "GauntletTable"
	if charter != null or live == null:
		live = self


func _exit_tree() -> void:
	if live == self:
		live = null


func hosting() -> bool:
	return charter != null or solo != null


func _session(key: String) -> Session:
	if solo != null:
		return solo if key == "me" else null
	return charter.session_for(key) if charter != null else null


# ══ The founder's side ════════════════════════════════════════════════════════

## The dive's own choices, each taken only from a captain still in it (a stale
## screen or a forged request from anyone else is refused: a seat index of -1
## would land on the LAST seat).
const DIVERS_ONLY: Array[String] = ["shrine", "fence", "done", "mark", "bear", "vote", "contract"]


func handle(key: String, s: Session, args: Array) -> Dictionary:
	var action: String = str(args[0]) if args.size() > 0 else ""
	var p: Variant = args[1] if args.size() > 1 else null
	if DIVERS_ONLY.has(action) and _r.has("caps") and not _keys_in().has(key):
		return { "error": "You are out of this dive." }
	match action:
		"call": return _call(key, s, Js.obj(p))
		"join": return _join(key, s, Js.obj(p))
		"leave": return _leave(key)
		"ready": return _ready_up(key, p == true)
		"mode": return _mode(key, str(p))
		"resume": return _resume_pick(key, p == true)
		"endHeld": return _end_held(key)
		"go": return _go(key)
		"plan": return _plan(key, Js.obj(p))
		"played": return _played(key, int(Js.num(p)))
		"flares": return _flare_result(key, Js.obj(p))
		"drum": return _drum(key)
		"out": return _out(key)
		"bear": return _bear(key)
		"recurse": return _recurse(key)
		"pick": return _pick(key, Js.obj(p))
		"reroll": return _reroll(key)
		"banish": return _banish(key, int(Js.num(p)))
		"shrine": return _shrine(key, Js.obj(p))
		"fence": return _fence(key, str(p))
		"done": return _done(key)
		"contract": return _contract_vote(key, int(Js.num(p)))
		"mark": return _mark(key, str(p))
		"vote": return _vote(key, str(p))
		"invite": return _invite(key, str(p))
		"answer": return _answer(key, p == true)
		"home": return _home(key)
		"nudge": return _nudge(key)
	return { "error": "There is no such order." }


# ── The muster ────────────────────────────────────────────────────────────────

## Where a descent's maelstrom turns on the campaign's water.
static func maelstrom_of(variant: String) -> Vector2:
	for m: Dictionary in Js.list(Campaign.water().get("maelstroms")):
		if str(m.get("id", "")) == variant:
			return Vector2(float(m["x"]), float(m["y"]))
	return Vector2.INF


static func near(variant: String, p: Dictionary) -> bool:
	if not p.has("x"):
		return false
	var at: Vector2 = maelstrom_of(variant)
	return at != Vector2.INF and Vector2(Js.num(p["x"]), Js.num(p["y"])).distance_to(at) <= NEAR


## Why this captain may not dive this descent ("" when they may).
static func shut(s: Session, variant: String) -> String:
	var p: Dictionary = s.profile()
	var cleared: Array = Js.list(Js.obj(p.get("raid_node_progress")).get("cleared"))
	if variant == "davy" and not cleared.has(Gauntlet.UNLOCK_NODE):
		return "Davy's Gauntlet opens once the second chapter's Captain's Choice is made."
	if variant == "don" and s.store.clear_count(s.uid, "the_throne") <= 0:
		return "Don's Gauntlet opens once the Throne has fallen."
	return ""


func _call(key: String, s: Session, p: Dictionary) -> Dictionary:
	if _r["phase"] not in ["idle", "done"]:
		return { "error": "The crew are already in a dive." }
	var variant: String = str(p.get("variant", "davy"))
	if not Gauntlet.VARIANTS.has(variant):
		return { "error": "There is no such descent." }
	var why: String = shut(s, variant)
	if why != "":
		return { "error": why }
	if solo == null and not near(variant, p):
		return { "error": "Sail to the maelstrom to call the crew to it." }
	_r = { "phase": "muster", "seq": int(_r["seq"]) + 1, "variant": variant, "by": key, "mode": "solo", "resume": false,
		"members": [_member(key, s, variant, true)], "ev": [], "plans": {}, "acks": {}, "flareRes": {}, "gone": {}, "result": "", "invites": {} }
	_r["held"] = _held_note(variant)
	_push()
	return { "ok": true }


func _member(key: String, s: Session, variant: String, ready: bool) -> Dictionary:
	var card: Dictionary = RaidTable.card_of(s, "")
	var p: Dictionary = s.profile()
	card["deepest"] = Js.num(p.get("dons_gauntlet_deepest" if variant == "don" else "gauntlet_deepest"))
	var pre: String = "dons_gauntlet_" if variant == "don" else "gauntlet_"
	card["soloDeepest"] = Js.num(p.get(pre + "solo_deepest"))
	card["coopDeepest"] = Js.num(p.get(pre + "coop_deepest"))
	card["fathoms"] = Js.num(p.get("gauntlet_fathoms"))
	card["perks"] = _perks(p, variant).size()
	return { "key": key, "name": s.captain_name(), "ready": ready, "card": card }


## A captain's Run Upgrades on for this descent (and the Permanent ones,
## which both Lockers share).
static func _perks(p: Dictionary, variant: String) -> Array:
	var own: Array = Js.list(p.get("dons_gauntlet_upgrades" if variant == "don" else "gauntlet_upgrades"))
	var off: Array = Js.list(p.get("dons_gauntlet_upgrades_off" if variant == "don" else "gauntlet_upgrades_off"))
	var on: Array = Gauntlet.active_upgrades(own, off)
	for id: Variant in Js.list(p.get("gauntlet_upgrades")) + Js.list(p.get("dons_gauntlet_upgrades")):
		if not on.has(id) and str(Gauntlet.upgrade_def(str(id)).get("scope", "")) != "gauntlet":
			on.append(id)
	return on


func _join(key: String, s: Session, p: Dictionary) -> Dictionary:
	if _r["phase"] != "muster":
		return { "error": "That dive has already gone down." }
	var mem: Array = _r["members"]
	if mem.any(func(m: Dictionary) -> bool: return m["key"] == key):
		return { "ok": true }
	if mem.size() >= MAX_SEATS:
		return { "error": "The line is full." }
	if str(_r.get("mode", "solo")) == "solo":
		return { "error": "That is a solo dive. The caller can switch it to Co-op." }
	var why: String = shut(s, str(_r["variant"]))
	if why != "":
		return { "error": why }
	if not near(str(_r["variant"]), p):
		return { "error": "Sail to the maelstrom to join the dive." }
	mem.append(_member(key, s, str(_r["variant"]), false))
	if _r.has("invites"):
		_r["invites"].erase(key)
	_push()
	return { "ok": true }


func _under_way() -> String:
	return "The dive is under way."


## Solo or Co-op, the caller's pick. Solo sends anyone else in the line back.
func _mode(key: String, mode: String) -> Dictionary:
	if _r["phase"] != "muster" or _r.get("by") != key:
		return { "error": "Only the captain who called it picks the mode." }
	if not ["solo", "coop"].has(mode):
		return { "error": "There is no such mode." }
	_r["mode"] = mode
	if mode == "solo":
		_r["members"] = (_r["members"] as Array).filter(func(m: Dictionary) -> bool: return m["key"] == key)
	_r["resume"] = false
	for m: Dictionary in _r["members"]:
		m["ready"] = m["key"] == key
	_push()
	return { "ok": true }


func _go(key: String) -> Dictionary:
	if _r["phase"] != "muster" or _r.get("by") != key:
		return { "error": "Only the captain who called it can dive." }
	for m: Dictionary in _r["members"]:
		if m["key"] != key and not m.get("ready", false):
			return { "error": "Not everyone is ready." }
	if _r.get("resume", false):
		return _resume()
	var n: int = (_r["members"] as Array).size()
	if _r["mode"] == "coop" and n < 2:
		return { "error": "Co-op needs two or more captains. Wait for a crewmate, or dive solo." }
	_start()
	return { "ok": true }


# ── The dive begins ───────────────────────────────────────────────────────────

func _start() -> void:
	var variant: String = str(_r["variant"])
	var tm: Dictionary = Gauntlet.no_terms()
	var seats: Array = []
	var caps: Dictionary = {}
	var skip: int = 99
	var calm: bool = false
	for m: Dictionary in _r["members"]:
		var s: Session = _session(m["key"])
		if s == null:
			continue
		_lend(s)
		var p: Dictionary = s.profile()
		var ups: Array = _perks(p, variant)
		var seat: Dictionary = Battle.seat_for(s.store, s.uid, str(m["name"]))
		seat["key"] = m["key"]
		# Short-Handed: the last crew station stands empty.
		if float(tm["crewSlotsLost"]) > 0.0 and (seat["crew"] as Array).size() > 1:
			seat["crew"] = (seat["crew"] as Array).slice(0, (seat["crew"] as Array).size() - int(tm["crewSlotsLost"]))
		# The Locker's own: the hull, the guns, the armour.
		seat["baseMax"] = float(Js.round(float(seat["max"]) * Gauntlet.run_hp_mult(ups) * float(tm["maxHpPct"])))
		seat["max"] = seat["baseMax"]
		seat["hp"] = seat["baseMax"]
		seat["dmgMult"] = float(seat["dmgMult"]) * (1.0 + Gauntlet.damage_mod(ups) / 100.0)
		seat["lockerTaken"] = 1.0 + Gauntlet.damage_taken_mod(ups) / 100.0
		if tm["noLethalSaves"]:
			seat["saves"] = 0.0
		seats.append(seat)
		var own: Dictionary = {}
		if Gauntlet.blood_oath(ups):
			var oath: String = Gauntlet.blood_oath_boon(variant)
			if oath != "":
				own[oath] = 1.0
		caps[m["key"]] = {
			"boons": own, "taken": [], "takenCv": [], "offered": [], "offeredCv": [], "marks": [], "hullMult": 1.0,
			"ups": ups, "filters": float(Gauntlet.boon_filters(ups)), "silenced": [], "fenceSpent": 0.0,
			"stats": { "shots": 0.0, "crits": 0.0, "dmgDealt": 0.0, "highestHit": 0.0, "dmgTaken": 0.0, "volleys": 0.0, "megas": 0.0 },
			"out": "",
		}
		skip = mini(skip, Gauntlet.start_depth(ups) - 1)
		calm = calm or Gauntlet.skips_first_curse(ups)
		_take(s)
	if seats.is_empty():
		_r["phase"] = "idle"
		_push()
		return
	_r["caps"] = caps
	_r["run"] = {
		"variant": variant, "mode": str(_r["mode"]), "tm": tm, "roll": Gauntlet.new_roll(), "names": _names(),
		# Veteran's Start for the party only when every captain has it.
		"skip": float(skip if skip < 99 else 0), "pot": 0.0, "bosses": 0.0, "curses": {}, "banned": [],
		"nextShrine": float(Gauntlet.SHRINE_FIRST), "nextMerchant": float(Gauntlet.MERCHANT_FIRST), "calm": calm,
		"offer": {}, "contract": {}, "drafts": 0.0, "peek": {}, "log": [],
	}
	_began_ms = Time.get_ticks_msec()
	var field: Dictionary = _roll_field(seats.size())
	_r["fight"] = field
	_effects_onto(seats)
	_r["b"] = Battle.begin_gauntlet(seats, field, variant)
	_r["descent"] = _descent_note(field)
	_step("plan", [{ "t": "begin", "depth": field["depth"] }])


## The next fight, rolled: the lead (the web's generateFight), then escorts
## for a party.
func _roll_field(n: int) -> Dictionary:
	var run: Dictionary = _r["run"]
	var lead: Dictionary = Gauntlet.generate_fight(run["roll"], int(run["skip"]), run["tm"], str(run["variant"]))
	var out: Dictionary = lead.duplicate()
	out["escorts"] = Gauntlet.escorts(out, n, run["tm"], str(run["variant"])) if not lead["isApex"] else []
	return out


func _descent_note(f: Dictionary) -> Dictionary:
	var run: Dictionary = _r["run"]
	var v: String = str(run["variant"])
	var d: int = int(f["depth"])
	var out: Dictionary = { "depth": float(d), "band": Gauntlet.band(d, v), "taunt": Gauntlet.taunt(d, v), "boss": f["isBoss"], "elite": f["isElite"], "apex": f["isApex"], "ships": 1 + Js.list(f.get("escorts")).size() }
	if f["isApex"]:
		out["rise"] = Js.obj(Gauntlet.don_rise(d).get("rise"))
	return out


## Every captain's run effects onto their ship before a fight: their boons,
## synergies and Marks, the party's curses and Terms, the Locker's armour; the
## hull ceiling the HP boons and contracts raise, the momentum counts.
func _effects_onto(seats: Array) -> void:
	var run: Dictionary = _r["run"]
	var party: Array = Gauntlet.curse_effects(run["curses"])
	var depth: int = int(run["roll"]["cleared"]) + 1 + int(run["skip"])
	var kills: int = int(run["roll"]["cleared"])
	for s: Dictionary in seats:
		var c: Dictionary = Js.obj(Js.obj(_r["caps"]).get(s["key"]))
		if c.is_empty():
			continue
		var own: Array = Gauntlet.boon_effects(c["boons"]) + Gauntlet.confluence_effects(c["boons"], c["taken"]) + Gauntlet.convergence_effects(c["boons"], c["taken"], c["takenCv"]) + Gauntlet.mark_effects(c["marks"]) + _crew_effects(str(s["key"]))
		var fx: Array = own + party
		if float(s.get("lockerTaken", 1.0)) != 1.0:
			fx.append({ "kind": "incomingDmgMult", "mult": float(s["lockerTaken"]), "scope": "allRemaining" })
		s["tfx"] = fx
		s["runKills"] = float(kills)
		s["runDepth"] = float(depth)
		var mx: float = maxf(1.0, float(Js.round(float(s["baseMax"]) * Gauntlet.hp_boon_mult(fx, depth, kills) * float(c["hullMult"]))))
		if mx > float(s["max"]):
			s["hp"] = float(s["hp"]) + (mx - float(s["max"]))
		s["max"] = mx
		s["hp"] = minf(float(s["hp"]), mx)


## A captain's crew synergies: each at the lower tier of the two halves the
## pair holds between them.
func _crew_effects(key: String) -> Array:
	var out: Array = []
	for x: Dictionary in Js.list(_r["run"].get("crewSyn")):
		if not Js.list(x["keys"]).has(key):
			continue
		var cf: Dictionary = Gauntlet.confluence_def(str(x["id"]))
		var lv: int = 99
		for r: Dictionary in Js.list(cf.get("requires")):
			var best: int = 0
			for k: Variant in x["keys"]:
				best = maxi(best, int(Js.num(Js.obj(Js.obj(_r["caps"].get(k)).get("boons")).get(r["boonId"]))))
			lv = mini(lv, best)
		lv = mini(lv, Js.list(cf.get("levels")).size())
		if lv >= 1:
			out += Js.list(cf["levels"][lv - 1]["effects"])
	return out


# ── A round (as the raid table plays one) ─────────────────────────────────────

## A phase of its own (a draft, a curse, the breather): nobody plays events.
func _enter(phase: String) -> void:
	_r["seq"] = int(_r["seq"]) + 1
	_r["phase"] = phase
	_r["left"] = -1.0
	_r["acks"] = {}
	_push()


func _everyone_played() -> bool:
	for k: String in _keys_in():
		if not _r["acks"].has(k) and not Js.obj(_r.get("gone")).has(k):
			return false
	return true


## The captains still in the dive (not out of it, not
## gone from the Charter).
func _keys_in() -> Array:
	var out: Array = []
	for k: String in Js.obj(_r.get("caps")):
		if str(_r["caps"][k].get("out", "")) == "" and not Js.obj(_r.get("gone")).has(k):
			out.append(k)
	return out


func _advance() -> void:
	var after: String = str(_r.get("after", "plan"))
	match after:
		"plan":
			var b: Dictionary = _r["b"]
			if b.has("flares") and b["state"] == "plan":
				_r["phase"] = "flares"
				_r["left"] = -1.0
				_r["flareRes"] = {}
				_push()
				return
			_r["phase"] = "plan"
			_r["plans"] = {}
			_r["left"] = -1.0
			_push()
		"won":
			_after_fight()
		"dead":
			_enter("dead")
		"haul":
			_enter("haul")
		"refight":
			# A dive taken up where it was left mid-fight: that same fight.
			_descend()
		"breather":
			_breather()
		"chain":
			_chain()
		_:
			_r["phase"] = "done"
			_push()


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
		plans.append(p)
	if b["state"] == "plan":
		ev += Battle.resolve(b, plans)
	for x: Dictionary in ev:
		if str(x.get("t", "")) == "crossfire":
			_crew_moment("crossfire", 1.0)
	_reactions_found(ev)
	_tally(ev, plans)
	match str(b["state"]):
		"won":
			_step("won", ev)
		"lost":
			_dive_lost(ev)
		_:
			_step("plan", ev)


## The run's telemetry and a job's facts, read off a round's events.
func _tally(ev: Array, plans: Array) -> void:
	var b: Dictionary = _r["b"]
	var facts: Dictionary = Js.obj(_r.get("facts"))
	for i: int in plans.size():
		var a: String = str(Js.obj(plans[i]).get("action", ""))
		if a == "dodge":
			facts["dodges"] = Js.num(facts.get("dodges")) + 1.0
	for x: Dictionary in ev:
		var si: int = int(Js.nz(x.get("seat"), -1.0))
		var key: String = str(b["seats"][si].get("key", "")) if si >= 0 and si < (b["seats"] as Array).size() else ""
		var st: Dictionary = Js.obj(Js.obj(Js.obj(_r["caps"]).get(key)).get("stats"))
		match str(x.get("t", "")):
			"shot":
				facts["shots"] = Js.num(facts.get("shots")) + 1.0
				var act: String = str(x.get("action", ""))
				facts[{ "fire": "fires", "volley": "volleys", "mega": "megas" }.get(act, "fires")] = Js.num(facts.get({ "fire": "fires", "volley": "volleys", "mega": "megas" }.get(act, "fires"))) + 1.0
				if str(x.get("aim", "")) == "critical":
					facts["crits"] = Js.num(facts.get("crits")) + 1.0
				if not st.is_empty():
					st["shots"] = float(st["shots"]) + 1.0
					st["dmgDealt"] = float(st["dmgDealt"]) + Js.num(x.get("dmg"))
					st["highestHit"] = maxf(float(st["highestHit"]), Js.num(x.get("dmg")))
					if str(x.get("aim", "")) == "critical":
						st["crits"] = float(st["crits"]) + 1.0
					if act == "volley":
						st["volleys"] = float(st["volleys"]) + 1.0
					if act == "mega":
						st["megas"] = float(st["megas"]) + 1.0
			"ability":
				facts["crewAbilities"] = Js.num(facts.get("crewAbilities")) + 1.0
			"eShot":
				if Js.num(x.get("dmg")) > 0.0 and not x.get("frenzy", false):
					facts["nonSpecialHitsTaken"] = Js.num(facts.get("nonSpecialHitsTaken")) + 1.0
				var tk: String = str(b["seats"][int(x["target"])].get("key", ""))
				var st2: Dictionary = Js.obj(Js.obj(Js.obj(_r["caps"]).get(tk)).get("stats"))
				if not st2.is_empty():
					st2["dmgTaken"] = float(st2["dmgTaken"]) + Js.num(x.get("dmg"))
	_r["facts"] = facts


func _flare_result(key: String, res: Dictionary) -> Dictionary:
	if _r["phase"] != "flares":
		return { "ok": true }
	_r["flareRes"][key] = res
	_flares_check()
	return { "ok": true }


## The flares land once every captain still afloat has answered them (or at
## once, pressed on: an unanswered sky lets every flare through).
func _flares_check(now: bool = false) -> void:
	for s: Dictionary in Battle.alive(_r["b"]):
		if not now and not _r["flareRes"].has(s["key"]) and not Js.obj(_r.get("gone")).has(s["key"]):
			return
	var b: Dictionary = _r["b"]
	var res2: Array = []
	for s2: Dictionary in b["seats"]:
		res2.append(Js.obj(_r["flareRes"].get(s2["key"], { "missed": float(Js.obj(b.get("flares")).get("count", 0)), "feints": 0.0 })))
	var ev: Array = Battle.flares_land(b, res2)
	if b["state"] == "lost":
		_dive_lost(ev)
		return
	_step("plan", ev)


# ── After a kill ──────────────────────────────────────────────────────────────

func _after_fight() -> void:
	var run: Dictionary = _r["run"]
	var b: Dictionary = _r["b"]
	var f: Dictionary = _r["fight"]
	var tm: Dictionary = run["tm"]
	var ev: Array = []
	var won_depth: int = int(f["depth"])
	# The pot: the lead's share, and half a mob's for each escort sunk.
	var pot_add: float = float(f["pot"])
	for _e: Variant in Js.list(f.get("escorts")):
		if int(run["roll"]["cleared"]) + 1 <= Gauntlet.REWARD_DEPTH_CAP:
			pot_add += float(Js.round(Gauntlet.round_contribution(int(run["roll"]["cleared"]) + 1, false, str(run["variant"])) * ESCORT_POT))
	run["pot"] = float(run["pot"]) + pot_add
	run["roll"] = Gauntlet.advance_roll(run["roll"], f)
	if f["isBoss"]:
		run["bosses"] = float(run["bosses"]) + 1.0
	ev.append({ "t": "potUp", "add": pot_add, "pot": run["pot"], "depth": float(won_depth) })
	for s: Dictionary in b["seats"]:
		var c: Dictionary = Js.obj(_r["caps"].get(s["key"]))
		if c.is_empty() or str(c.get("out", "")) != "":
			continue
		if s.get("sunk", false):
			# Towed home: the crew won, she rejoins at a quarter hull.
			s["sunk"] = false
			s["hp"] = maxf(1.0, float(Js.round(float(s["max"]) * TOW_HP)))
			ev.append({ "t": "towed", "key": s["key"], "hp": s["hp"] })
		# Powder Hoard: balls still loaded ride into the next fight.
		var cap: float = 0.0
		for e0: Dictionary in Gauntlet.boon_effects(c["boons"]):
			if str(e0.get("kind", "")) == "chargeCarryover":
				cap = float(e0["cap"])
				break
		s["carry"] = clampf(float(s.get("charges", 0.0)), 0.0, cap)
		# Overheal sheds; Vigor and its kin patch the hull for the kill.
		s["hp"] = minf(float(s["max"]), float(s["hp"]))
		var kh: float = Gauntlet.kill_heal_pct(c["ups"]) * float(tm["healMult"])
		if kh > 0.0:
			s["hp"] = minf(float(s["max"]), float(s["hp"]) + float(Js.round(float(s["max"]) * kh)))
		# A boss sunk: every crew order comes back (bar the silenced).
		if f["isBoss"] and (float(tm["crewRefreshChance"]) >= 1.0 or Dice.next() < float(tm["crewRefreshChance"])):
			s["used"] = Js.list(c["silenced"]).duplicate()
			ev.append({ "t": "refresh", "key": s["key"] })
	# A job that rode this fight.
	var job: Dictionary = Js.obj(run.get("contract"))
	if not job.is_empty():
		var facts: Dictionary = Js.obj(_r.get("facts"))
		facts["won"] = true
		facts["turns"] = float(b["turn"]) - 1.0
		var met: bool = Gauntlet.contract_met(job, facts)
		run["jobResult"] = { "job": job, "met": met }
		run["contract"] = {}
	_r["facts"] = {}
	if f["isApex"]:
		run["donFall"] = float(won_depth)
	if _keys_in().is_empty():
		_dive_lost(ev)
		return
	_step("chain", ev)


## The chain after a kill, in the web's order (proceedAfterFight): a job's
## verdict, the Don's fall and his Mark, a curse and a draft, the shrine, the
## Fence, else the breather.
func _chain() -> void:
	var run: Dictionary = _r["run"]
	var jr: Dictionary = Js.obj(run.get("jobResult"))
	if not jr.is_empty():
		run.erase("jobResult")
		_job_land(jr)
		return
	if run.has("donFall"):
		var d: int = int(run["donFall"])
		run.erase("donFall")
		_r["donFall"] = Gauntlet.don_rise(d).get("fall", {})
		var offers: Dictionary = {}
		for k: String in _keys_in():
			offers[k] = Gauntlet.roll_marks()
		_r["marks"] = { "offers": offers, "picks": {} }
		_enter("marks")
		return
	var nd: int = int(run["roll"]["cleared"]) + 1 + int(run["skip"])
	var tm: Dictionary = run["tm"]
	if not run.get("chainDone", false):
		run["chainDone"] = true
		run["wantCurse"] = Gauntlet.is_curse_depth(nd, float(tm["curseFrequencyMult"]))
		run["wantDraft"] = Gauntlet.is_boon_depth(nd, float(tm["boonFrequencyMult"]))
	if run.get("wantCurse", false):
		run["wantCurse"] = false
		if run.get("calm", false):
			run["calm"] = false
			_r["notice"] = "Calm Before: the Locker's first curse passes you by."
		else:
			var c: Dictionary = Gauntlet.draw_curse(run["curses"], nd, tm["curseStartsAtWorst"], str(run["variant"]))
			if not c.is_empty():
				_r["curse"] = { "offer": c, "acks": {}, "rerolls": {} }
				_enter("curse")
				return
	if run.get("wantDraft", false):
		run["wantDraft"] = false
		if _open_draft("", nd):
			return
	# A shrine or the Fence on a quiet depth (no curse, no draft).
	if not Gauntlet.is_curse_depth(nd, float(tm["curseFrequencyMult"])) and not Gauntlet.is_boon_depth(nd, float(tm["boonFrequencyMult"])):
		if nd >= int(run["nextShrine"]):
			run["nextShrine"] = float(nd + Gauntlet.SHRINE_INTERVAL + int(floor(Dice.next() * 3.0)))
			_r["shrine"] = { "picks": {}, "drafts": {} }
			run["chainDone"] = false
			_enter("shrine")
			return
		if str(run["variant"]) == "don" and nd >= int(run["nextMerchant"]):
			run["nextMerchant"] = float(nd + Gauntlet.MERCHANT_INTERVAL + int(floor(Dice.next() * 3.0)))
			var stock: Dictionary = {}
			var cursed: bool = not Js.obj(run["curses"]).is_empty()
			for k: String in _keys_in():
				stock[k] = { "items": Gauntlet.fence_stock(cursed), "sold": [] }
			_r["fence"] = { "stalls": stock, "done": {}, "drafts": {} }
			run["chainDone"] = false
			_enter("fence")
			return
	run["chainDone"] = false
	_breather()


# ── Between fights: the curse, the Drowned Shrine, the Fence, the Don's jobs
#    and his Marks (game/gauntlet_between.gd) ──────────────────────────────────

func _bear(key: String) -> Dictionary:
	return GauntletBetween.bear(self, key)


func _recurse(key: String) -> Dictionary:
	return GauntletBetween.recurse(self, key)


func _shrine(key: String, p: Dictionary) -> Dictionary:
	return GauntletBetween.shrine(self, key, p)


func _shrine_check() -> void:
	GauntletBetween.shrine_check(self)


func _fence(key: String, item: String) -> Dictionary:
	return GauntletBetween.fence(self, key, item)


func _done(key: String) -> Dictionary:
	return GauntletBetween.done(self, key)


func _fence_check() -> void:
	GauntletBetween.fence_check(self)


func _contract_vote(key: String, stake: int) -> Dictionary:
	return GauntletBetween.contract_vote(self, key, stake)


func _contract_check() -> void:
	GauntletBetween.contract_check(self)


func _job_land(jr: Dictionary) -> void:
	GauntletBetween.job_land(self, jr)


func _mark(key: String, kind: String) -> Dictionary:
	return GauntletBetween.mark(self, key, kind)


func _marks_check() -> void:
	GauntletBetween.marks_check(self)


# ── The draft table and the codex (game/gauntlet_draft.gd) ───────────────────

func _open_draft(who: String, nd: int) -> bool:
	return GauntletDraft.open_draft(self, who, nd)


func next_tier(key: String, fam: String) -> int:
	return GauntletDraft.next_tier(self, key, fam)


func _turn_key() -> String:
	return GauntletDraft.turn_key(self)


func _pick(key: String, p: Dictionary) -> Dictionary:
	return GauntletDraft.pick_card(self, key, p)


func _turn_on() -> void:
	GauntletDraft.turn_on(self)


func _shed_curse() -> String:
	return GauntletDraft.shed_curse(self)


func _reroll(key: String) -> Dictionary:
	return GauntletDraft.reroll(self, key)


func _banish(key: String, i: int) -> Dictionary:
	return GauntletDraft.banish(self, key, i)


func _reactions_found(ev: Array) -> void:
	GauntletDraft.reactions_found(self, ev)


# ── The breather: the vote ────────────────────────────────────────────────────

func _breather() -> void:
	var run: Dictionary = _r["run"]
	var b: Dictionary = _r["b"]
	var cleared: int = int(run["roll"]["cleared"])
	# The next fight is rolled now: Dive Deeper fights exactly this one.
	run["peek"] = _roll_field(_keys_in().size())
	var hp_pct: float = 1.0
	for s: Dictionary in Battle.alive(b):
		hp_pct = minf(hp_pct, float(s["hp"]) / maxf(1.0, float(s["max"])))
	var blocked: bool = run["tm"]["cashOutOnlyAfterBoss"] and not run["roll"]["prevWasBoss"]
	run["offer"] = Gauntlet.roll_offer(run["offer"], cleared, hp_pct, true, blocked)
	_r["votes"] = {}
	_r["bankShut"] = "No Second Thoughts: you may bank only after a boss." if blocked else ""
	# Each captain's look at what banking pays them (the chest, the chase).
	var view: Dictionary = {}
	for k: String in _keys_in():
		view[k] = _bank_view(k)
	_r["bank"] = view
	# Written down at every breather: a crash comes back to here.
	_checkpoint("open")
	_enter("breather")


func _bank_view(key: String) -> Dictionary:
	var run: Dictionary = _r["run"]
	var s: Session = _session(key)
	if s == null:
		return {}
	var p: Dictionary = s.profile()
	var cleared: int = int(run["roll"]["cleared"])
	var c: Dictionary = _r["caps"][key]
	var chest: Dictionary = Gauntlet.chest_for_depth(mini(cleared, Gauntlet.REWARD_DEPTH_CAP))
	# Gear drops as copies, so what is held can still come (the item list is
	# passed empty); the live offer's chest and the combat depth count, as the
	# haul rolls them (the loot audit, 2026-10-06).
	var odds: Array = Gauntlet.chest_odds(cleared, str(run["variant"]), false, 0.0,
		[], Js.list(p.get("owned_ship_skins")), Gauntlet.offer_chest_mult(Js.obj(run.get("offer"))), _fortune(key), cleared + int(run["skip"]))
	return {
		"chest": chest, "chestLabel": Gauntlet.chest_label(chest, str(run["variant"]), false),
		"doubloons": float(Js.round(floor(float(run["pot"])) * float(chest["potMult"]) * Gauntlet.haul_mult(c["ups"]))),
		"navXp": float(Js.round(Gauntlet.xp_for_depth(mini(cleared, Gauntlet.REWARD_DEPTH_CAP), str(run["variant"])) * Gauntlet.xp_mult(c["ups"]))),
		"fathoms": Gauntlet.run_fathoms(cleared, str(run["variant"]), Gauntlet.fathoms_mult(c["ups"]), {}, float(c["fenceSpent"])),
		"crewXp": Gauntlet.crew_xp(mini(cleared, Gauntlet.REWARD_DEPTH_CAP), str(run["variant"])),
		"odds": odds,
	}


func _fortune(key: String) -> float:
	var si: int = _seat_of(key)
	var f: float = Js.num(_r["b"]["seats"][si].get("fortune")) if si >= 0 else 0.0
	return 1.0 + minf(1.0, maxf(0.0, f) / 150.0)


func _vote(key: String, v: String) -> Dictionary:
	if _r["phase"] != "breather" or not ["bank", "dive", "hold"].has(v):
		return { "error": "Not now." }
	if v == "bank" and str(_r.get("bankShut", "")) != "":
		return { "error": str(_r["bankShut"]) }
	_r["votes"][key] = v
	_vote_check()
	return { "ok": true }


## The breather settles once every captain still in has voted (a captain who
## drops is not counted, and casts nothing).
func _vote_check() -> void:
	var ks: Array = _keys_in()
	for k: String in ks:
		if not _r["votes"].has(k):
			_push()
			return
	# Everyone to hold it: held. Otherwise a vote to hold counts as banking.
	var holds: int = _r["votes"].values().filter(func(x: Variant) -> bool: return x == "hold").size()
	if holds == ks.size():
		_hold()
		return
	var banks: int = _r["votes"].values().filter(func(x: Variant) -> bool: return x == "bank" or x == "hold").size()
	# A majority carries; a tie banks.
	if banks * 2 >= ks.size() and str(_r.get("bankShut", "")) == "":
		_bank()
	else:
		_dive()


func _dive() -> void:
	var run: Dictionary = _r["run"]
	# The offer passes (it counts as refused when the next one is rolled).
	# Crushing Depth: the pressure takes its toll before the fight.
	var drain: float = Gauntlet.curse_hp_drain(run["curses"])
	if drain > 0.0:
		for s: Dictionary in Battle.alive(_r["b"]):
			s["hp"] = maxf(1.0, float(Js.round(float(s["hp"]) - float(s["max"]) * drain)))
	# The Don may have a job (or, under Every Job, it is taken for you).
	if str(run["variant"]) == "don" and Js.obj(run.get("contract")).is_empty():
		var nd: int = int(run["peek"]["depth"])
		var kind: String = Gauntlet.roll_contract(nd)
		if kind != "":
			var offers: Array = [Gauntlet.build_contract(kind, 1, nd), Gauntlet.build_contract(kind, 2, nd), Gauntlet.build_contract(kind, 3, nd)]
			if run["tm"]["forceContracts"]:
				run["contract"] = offers[1]
			else:
				_r["job"] = { "kind": kind, "offers": offers, "votes": {} }
				_enter("contract")
				return
	_descend()


## Down into the next fight (the one rolled at the breather).
func _descend() -> void:
	var run: Dictionary = _r["run"]
	_r.erase("job")
	var field: Dictionary = run["peek"]
	# Written down as the fight begins (the loot audit, 2026-10-06): a crash or
	# a quit mid-fight resumes into this same fight, never the breather before
	# it with a fresh look at what comes next.
	_checkpoint("fighting", field)
	run["peek"] = {}
	_r["fight"] = field
	var b: Dictionary = _r["b"]
	_effects_onto(b["seats"])
	Battle.gauntlet_fight(b, field, str(run["variant"]))
	_r["descent"] = _descent_note(field)
	_r["facts"] = {}
	_step("plan", [{ "t": "nextFight", "depth": field["depth"], "boss": field["isBoss"], "apex": field["isApex"] }])


# ── The end: banked, or lost to the deep (the pay and the records:
#    game/gauntlet_pay.gd) ──────────────────────────────────────────────────────

func _bank() -> void:
	GauntletPay.bank(self)


func _dive_lost(ev: Array) -> void:
	GauntletPay.dive_lost(self, ev)


func _death_pay(key: String, s: Session, cd: int) -> Dictionary:
	return GauntletPay.death_pay(self, key, s, cd)


func _home(key: String) -> Dictionary:
	if not ["haul", "dead", "jobResult", "held"].has(str(_r["phase"])):
		return { "ok": true }
	_r["acks"][key] = true
	_acks_check()
	return { "ok": true }


## The end screens (and a job's verdict) move on once every captain still in
## has pressed on.
func _acks_check() -> void:
	if _r["phase"] == "jobResult":
		# Onward from a job's verdict: a curse or a draft it brought, then on.
		for k: String in _keys_in():
			if not _r["acks"].has(k):
				_push()
				return
		var run: Dictionary = _r["run"]
		var nx: String = str(run.get("jobNext", ""))
		run.erase("jobNext")
		var nd: int = int(run["roll"]["cleared"]) + 1 + int(run["skip"])
		if nx == "curse":
			var cu: Dictionary = Gauntlet.draw_curse(run["curses"], nd, run["tm"]["curseStartsAtWorst"], str(run["variant"]))
			if not cu.is_empty():
				_r["curse"] = { "offer": cu, "acks": {}, "rerolls": {} }
				_enter("curse")
				return
		if nx == "draft" and _open_draft("", nd):
			return
		_chain()
		return
	for k2: String in Js.obj(_r.get("caps")):
		if not _r["acks"].has(k2) and not Js.obj(_r.get("gone")).has(k2):
			_push()
			return
	_r["phase"] = "done"
	_push()


# ── The Charter's book and the wire ──────────────────────────────────────────

func _lend(s: Session) -> void:
	if charter != null:
		charter._lend(s)


func _take(s: Session) -> void:
	if charter != null:
		charter._take(s)


func _settle() -> void:
	if charter != null:
		charter._spread("")
		charter.write()
	elif solo != null:
		solo.persist()


## What goes out on a push: all of it but the next fight before it is fought
## (kept on the founder's game), of which only the Sounding Line's note shows.
func _public() -> Dictionary:
	var pub: Dictionary = _r.duplicate(true)
	if pub.has("run"):
		var run: Dictionary = pub["run"]
		var pk: Dictionary = Js.obj(run.get("peek"))
		if not pk.is_empty():
			run["peekNote"] = _peek_note(pk)
		run.erase("peek")
	return pub


## A dive alone never goes over the wire.
func _on_the_wire() -> bool:
	return charter != null and super()


## What the Sounding Line shows of the next fight (when someone has it and
## Blind Descent is unsigned).
func _peek_note(pk: Dictionary) -> Dictionary:
	var run: Dictionary = _r["run"]
	if run["tm"]["noPeek"]:
		return {}
	var any: bool = false
	for k: String in _keys_in():
		any = any or Gauntlet.sounding_line(Js.list(_r["caps"][k]["ups"]))
	if not any:
		return {}
	return { "boss": pk["isBoss"], "elite": pk["isElite"], "apex": pk["isApex"], "affix": Js.obj(pk.get("affix")).get("name"), "ships": 1 + Js.list(pk.get("escorts")).size() }


func _nudge(key: String) -> Dictionary:
	var ph: String = str(_r["phase"])
	# The end screens (a bank, a loss, a hold) wait on every captain who saw
	# the dive through, drowned ones too: any of them may move it on.
	var end_screen: bool = ["haul", "dead", "held"].has(ph)
	var on_screen: bool = Js.obj(_r.get("caps")).has(key) and not Js.obj(_r.get("gone")).has(key)
	if not (_keys_in().has(key) or (end_screen and on_screen)):
		return { "error": "You are out of this dive." }
	if not _waited():
		return { "error": "Give them a moment more." }
	match ph:
		"plan":
			_resolve()
			return { "ok": true }
		"flares":
			_flares_check(true)
			return { "ok": true }
		"draft":
			var tk: String = _turn_key()
			if tk != "" and tk != key:
				_r["draft"]["took"][tk] = { "kind": "none" }
				_r["draft"]["turn"] = float(_r["draft"]["turn"]) + 1.0
				_turn_on()
			return { "ok": true }
		"haul", "dead", "held":
			# Nobody is left on these screens for good (they had no nudge).
			for k3: String in Js.obj(_r.get("caps")):
				if not _r["acks"].has(k3) and not Js.obj(_r.get("gone")).has(k3):
					_r["acks"][k3] = true
			_acks_check()
			return { "ok": true }
	for k: String in _keys_in():
		if k == key or str(_r["phase"]) != ph:
			continue
		match ph:
			"curse":
				if not _r["curse"]["acks"].has(k):
					_bear(k)
			"shrine":
				if not _r["shrine"]["picks"].has(k):
					_shrine(k, { "choice": "walk" })
			"fence":
				if not _r["fence"]["done"].has(k):
					_done(k)
			"marks":
				if not _r["marks"]["picks"].has(k):
					_mark(k, "shark")
			"breather":
				if not _r["votes"].has(k):
					_vote(k, "dive" if str(_r.get("bankShut", "")) != "" else "bank")
			"contract":
				if not _r["job"]["votes"].has(k):
					_contract_vote(k, 0)
			"jobResult":
				if not _r["acks"].has(k):
					_home(k)
	return { "ok": true }


func _invite_refusal(s: Session) -> String:
	if str(_r.get("mode", "solo")) == "solo":
		return "Switch the dive to Co-op to bring the crew."
	var why: String = shut(s, str(_r["variant"]))
	return "They have not opened this descent yet." if why != "" else ""


## The copy sent to a captain back on the line: the next fight kept back.
func _rejoin_copy() -> Dictionary:
	var pub: Dictionary = _r.duplicate(true)
	if pub.has("run"):
		(pub["run"] as Dictionary).erase("peek")
	return pub


## A captain's game has dropped out of the dive (drop, in the base: keeping
## nothing of the pot): nothing waits on them.
func _after_drop(key: String) -> void:
	if _keys_in().is_empty():
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
			_flares_check()
		"draft":
			if _turn_key() == key:
				_turn_on()
			else:
				_push()
		"jobResult", "haul", "dead", "held":
			_acks_check()
		"curse":
			_bear(key)
		"shrine":
			_shrine_check()
		"fence":
			_fence_check()
		"marks":
			_marks_check()
		"breather":
			_r["votes"].erase(key)
			_vote_check()
		"contract":
			_r["job"]["votes"].erase(key)
			_contract_check()
		_:
			_push()


# ══ Held dives: written down at every breather, held by vote, resumed
#    (game/gauntlet_held.gd) ═════════════════════════════════════════════════════

func _names() -> Dictionary:
	var out: Dictionary = {}
	for m: Dictionary in _r.get("members", []):
		out[m["key"]] = m["name"]
	return out


func _held_note(variant: String) -> Dictionary:
	return GauntletHeld.held_note(self, variant)


func _checkpoint(status: String, fight: Dictionary = {}) -> void:
	GauntletHeld.checkpoint(self, status, fight)


func _held_clear() -> void:
	GauntletHeld.held_clear(self)


func _hold() -> void:
	GauntletHeld.hold(self)


func _resume_pick(key: String, yes: bool) -> Dictionary:
	return GauntletHeld.resume_pick(self, key, yes)


func _resume() -> Dictionary:
	return GauntletHeld.resume(self)


func _end_held(key: String) -> Dictionary:
	return GauntletHeld.end_held(self, key)


