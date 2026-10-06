class_name GauntletTable
extends Node
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

signal changed(state: Dictionary)

const MAX_SEATS: int = 4
const PLAY: float = 25.0
## How near the maelstrom a ship must be to call or join a dive.
const NEAR: float = 1500.0
## The share of a mob's pot an escort adds when it sinks.
const ESCORT_POT: float = 0.5
## A towed ship rejoins at this share of its hull.
const TOW_HP: float = 0.25

static var live: GauntletTable = null

## On the founder's game: the Charter. Alone: the one captain.
var charter: Charter = null
var solo: Session = null
var state: Dictionary = {}
var _r: Dictionary = { "phase": "idle", "seq": 0 }
var _began_ms: int = 0


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

func handle(key: String, s: Session, args: Array) -> Dictionary:
	var action: String = str(args[0]) if args.size() > 0 else ""
	var p: Variant = args[1] if args.size() > 1 else null
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
		"out":
			if _r.has("gone"):
				_r["gone"][key] = true
				if _r["phase"] == "playing" and _everyone_played():
					_advance()
			return { "ok": true }
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


func _leave(key: String) -> Dictionary:
	if _r["phase"] != "muster":
		return { "error": "The dive is under way." }
	if _r.get("by") == key:
		_r["phase"] = "idle"
		_r["result"] = "called off"
	else:
		_r["members"] = (_r["members"] as Array).filter(func(m: Dictionary) -> bool: return m["key"] != key)
	_push()
	return { "ok": true }


func _ready_up(key: String, yes: bool) -> Dictionary:
	if _r["phase"] != "muster":
		return { "error": "Not now." }
	for m: Dictionary in _r["members"]:
		if m["key"] == key:
			m["ready"] = yes
	_push()
	return { "ok": true }


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

func _seat_of(key: String) -> int:
	if not (_r.get("b") is Dictionary):
		return -1
	var seats: Array = _r["b"]["seats"]
	for i: int in seats.size():
		if seats[i].get("key") == key:
			return i
	return -1


## Move to a phase with this round's events; everyone plays them first.
func _step(next: String, ev: Array) -> void:
	_r["seq"] = int(_r["seq"]) + 1
	_r["ev"] = ev
	_r["acks"] = {}
	_r["after"] = next
	_r["phase"] = "playing"
	_r["left"] = PLAY
	_push()


## A phase of its own (a draft, a curse, the breather): nobody plays events.
func _enter(phase: String) -> void:
	_r["seq"] = int(_r["seq"]) + 1
	_r["phase"] = phase
	_r["left"] = -1.0
	_r["acks"] = {}
	_push()


func _played(key: String, seq: int) -> Dictionary:
	if _r["phase"] != "playing" or seq != int(_r["seq"]):
		return { "ok": true }
	_r["acks"][key] = true
	if _everyone_played():
		_advance()
	return { "ok": true }


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
	for s: Dictionary in Battle.alive(_r["b"]):
		if not _r["plans"].has(s["key"]):
			return false
	return true


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


func _drum(key: String) -> Dictionary:
	if _r["phase"] != "plan":
		return { "error": "Not now." }
	var si: int = _seat_of(key)
	if si < 0:
		return { "error": "You are out of this fight." }
	var r: Dictionary = Battle.use_drum(_r["b"], si)
	_push()
	return r


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
	_r["events"] = ev
	_r["after"] = "chain"
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


# ── The curse ─────────────────────────────────────────────────────────────────

func _bear(key: String) -> Dictionary:
	if _r["phase"] != "curse":
		return { "ok": true }
	_r["curse"]["acks"][key] = true
	for k: String in _keys_in():
		if not _r["curse"]["acks"].has(k):
			_push()
			return { "ok": true }
	# Everyone has borne it: it lands on the party.
	var run: Dictionary = _r["run"]
	var c: Dictionary = _r["curse"]["offer"]
	run["curses"][c["id"]] = c["tier"]
	# Dead Hands: each captain loses that many crew orders for the run.
	var want: int = Gauntlet.curse_silence(run["curses"])
	for s: Dictionary in _r["b"]["seats"]:
		var cp: Dictionary = Js.obj(_r["caps"].get(s["key"]))
		if cp.is_empty():
			continue
		var sil: Array = cp["silenced"]
		var pool: Array = (s["crew"] as Array).map(func(x: Dictionary) -> Variant: return x["id"]).filter(func(id: Variant) -> bool: return not sil.has(id))
		while sil.size() < want and not pool.is_empty():
			var id: Variant = pool.pop_at(int(floor(Dice.next() * pool.size())))
			sil.append(id)
			if not (s["used"] as Array).has(id):
				(s["used"] as Array).append(id)
	_r.erase("curse")
	_chain()
	return { "ok": true }


## A Salt Ward reroll: the curse drawn again (never the same one twice).
func _recurse(key: String) -> Dictionary:
	if _r["phase"] != "curse":
		return { "error": "Not now." }
	var cp: Dictionary = Js.obj(_r["caps"].get(key))
	var used: int = int(Js.num(_r["curse"]["rerolls"].get(key)))
	if used >= Gauntlet.curse_rerolls(Js.list(cp.get("ups"))):
		return { "error": "No curse rerolls left." }
	_r["curse"]["rerolls"][key] = float(used + 1)
	var run: Dictionary = _r["run"]
	var nd: int = int(run["roll"]["cleared"]) + 1 + int(run["skip"])
	var old: Dictionary = _r["curse"]["offer"]
	var nx: Dictionary = {}
	for g: int in 6:
		nx = Gauntlet.draw_curse(run["curses"], nd, run["tm"]["curseStartsAtWorst"], str(run["variant"]))
		if nx.is_empty() or nx["id"] != old["id"] or nx["tier"] != old["tier"]:
			break
	if not nx.is_empty():
		_r["curse"]["offer"] = nx
	_r["curse"]["acks"] = {}
	_push()
	return { "ok": true }


# ── The draft table ───────────────────────────────────────────────────────────

## A draft for the party (who = "") or one captain alone (a shrine's Blood
## Price, the Fence's Contraband, a job's reward). Returns false when every
## card is spent.
func _open_draft(who: String, nd: int) -> bool:
	var run: Dictionary = _r["run"]
	var keys: Array = [who] if who != "" else _keys_in()
	if keys.is_empty():
		return false
	var solo_draft: bool = keys.size() == 1
	var tm: Dictionary = run["tm"]
	# Each captain's private synergy (a pair of their own boons).
	var syn: Dictionary = {}
	for k: String in keys:
		var c: Dictionary = _r["caps"][k]
		var mult: float = float(tm["confluenceOfferMult"]) * Gauntlet.synergy_mult(c["ups"])
		var o: Dictionary = Gauntlet.draw_convergence(c["boons"], c["taken"], c["takenCv"], c["offeredCv"], mult, str(run["variant"])) if run["variant"] == "don" else {}
		if o.is_empty():
			o = Gauntlet.draw_confluence(c["boons"], c["taken"], c["offered"], mult, str(run["variant"]))
		if not o.is_empty():
			syn[k] = o
			(c["offeredCv"] if o.get("isConvergence", false) else c["offered"]).append(o["id"])
	var picks: int = int(tm["boonPicks"])
	var n: int = (maxi(1, picks - 1) if not syn.is_empty() else picks) if solo_draft else keys.size() + 2 - (1 if picks < 3 else 0)
	var cards: Array = _deal(n, keys, [])
	# Co-op only: a bond power in place of the last card (at most one), and a
	# crew synergy for two captains who each hold half of one.
	if who == "" and keys.size() >= 2:
		var pc: Dictionary = Gauntlet.coop_cfg()
		if Dice.next() < float(pc.get("bondChance", 0.55)):
			var bd: Dictionary = Gauntlet.draw_bond(_lowest(keys), Js.list(run["banned"]))
			if not bd.is_empty():
				bd["card"] = "boon"
				if not cards.is_empty():
					cards[cards.size() - 1] = bd
				else:
					cards.append(bd)
		var cs: Dictionary = _crew_synergy(keys)
		if not cs.is_empty() and Dice.next() < float(pc.get("crewSynChance", 0.7)):
			cards.append(cs)
	if cards.is_empty() and syn.is_empty():
		return false
	# A reprieve card, when nobody was offered a synergy (it forgoes the pick).
	if syn.is_empty() and who == "" and not tm["noReprieves"] and nd >= Gauntlet.REPRIEVE_MIN_DEPTH and Dice.next() < Gauntlet.REPRIEVE_CHANCE:
		var rp: Dictionary = Gauntlet.draw_reprieve(Js.obj(run["curses"]).size()).duplicate()
		rp["card"] = "reprieve"
		cards.append(rp)
	# The order rotates each draft.
	var order: Array = keys.duplicate()
	var rot: int = int(run["drafts"]) % maxi(1, order.size())
	order = order.slice(rot) + order.slice(0, rot)
	run["drafts"] = float(run["drafts"]) + 1.0
	_r["draft"] = {
		"cards": cards, "syn": syn, "order": order, "turn": 0.0, "stamps": {}, "took": {},
		"rerolls": {}, "personal": who != "", "title": "Paid in Blood" if who != "" else "Choose a Power",
	}
	_enter("draft")
	return true


## Deal n family cards from the pool the party can still take (a family maxed
## for every captain in the draft is gone; a banished one never returns).
func _deal(n: int, keys: Array, excl: Array) -> Array:
	var run: Dictionary = _r["run"]
	var luck: float = 1.0
	var owned: Dictionary = {}
	for k: String in keys:
		var c: Dictionary = _r["caps"][k]
		luck = maxf(luck, Gauntlet.boon_luck(c["ups"]))
	# A family is live while ANY captain here can still take a tier of it; the
	# draw sees it at its lowest held tier so it is offered at all.
	for b: Dictionary in Js.list(Gauntlet.t().get("boons")):
		var lo: int = 99
		for k2: String in keys:
			lo = mini(lo, int(Js.num(Js.obj(_r["caps"][k2]["boons"]).get(b["id"]))))
		if lo > 0:
			owned[b["id"]] = float(lo)
	var drawn: Array = Gauntlet.draw_boons(n, owned, luck, float(run["tm"]["commonSkew"]), str(run["variant"]), Js.list(run["banned"]) + excl)
	for d: Dictionary in drawn:
		d["card"] = "boon"
	return drawn


## The lowest tier any of these captains holds of every family (a family is
## live while anyone can still take a tier).
func _lowest(keys: Array) -> Dictionary:
	var out: Dictionary = {}
	for b: Dictionary in Js.list(Gauntlet.t().get("boons")) + Gauntlet.bonds():
		var lo: int = 99
		for k: String in keys:
			lo = mini(lo, int(Js.num(Js.obj(_r["caps"][k]["boons"]).get(b["id"]))))
		if lo > 0:
			out[b["id"]] = float(lo)
	return out


## A crew synergy for this table: a synergy whose two powers two different
## captains hold one each (neither holds both, and the pair has not taken it).
func _crew_synergy(keys: Array) -> Dictionary:
	var run: Dictionary = _r["run"]
	var found: Array = []
	for c: Dictionary in Gauntlet.confluences():
		if not Gauntlet.in_pool(c.get("gauntlet"), str(run["variant"])):
			continue
		var h1: String = str(c["requires"][0]["boonId"])
		var h2: String = str(c["requires"][1]["boonId"])
		for a: String in keys:
			for b2: String in keys:
				if a == b2:
					continue
				var ca: Dictionary = _r["caps"][a]["boons"]
				var cb: Dictionary = _r["caps"][b2]["boons"]
				if Js.num(ca.get(h1)) >= 1.0 and Js.num(cb.get(h2)) >= 1.0 and Js.num(ca.get(h2)) < 1.0 and Js.num(cb.get(h1)) < 1.0 and not _crew_has(str(c["id"]), a, b2):
					found.append([c, a, b2, mini(mini(int(ca[h1]), int(cb[h2])), Js.list(c["levels"]).size())])
	if found.is_empty():
		return {}
	var pick: Array = found[int(floor(Dice.next() * found.size()))]
	var cf: Dictionary = pick[0]
	var names: Dictionary = Js.obj(run.get("names"))
	return { "card": "crew", "id": cf["id"], "name": cf["name"], "keys": [pick[1], pick[2]], "level": float(pick[3]),
		"desc": Js.obj(Js.list(cf["levels"])[int(pick[3]) - 1]).get("desc", ""), "image": cf.get("image"),
		"names": [names.get(pick[1], "A captain"), names.get(pick[2], "A captain")] }


func _crew_has(id: String, a: String, b2: String) -> bool:
	for x: Dictionary in Js.list(_r["run"].get("crewSyn")):
		if x["id"] == id and Js.list(x["keys"]).has(a) and Js.list(x["keys"]).has(b2):
			return true
	return false


## The tier a captain would take of a family card (0: they hold it all).
func next_tier(key: String, fam: String) -> int:
	var b: Dictionary = Gauntlet.boon_def(fam)
	var nx: int = int(Js.num(Js.obj(_r["caps"][key]["boons"]).get(fam))) + 1
	return nx if nx <= Js.list(b.get("tiers")).size() else 0


func _turn_key() -> String:
	var d: Dictionary = _r["draft"]
	var order: Array = d["order"]
	var i: int = int(d["turn"])
	return str(order[i]) if i < order.size() else ""


## A pick: { card: index } from the spread, or { syn: true } for one's own.
func _pick(key: String, p: Dictionary) -> Dictionary:
	if _r["phase"] != "draft":
		return { "error": "Not now." }
	if key != _turn_key():
		return { "error": "Not your turn at the table." }
	var d: Dictionary = _r["draft"]
	var c: Dictionary = _r["caps"][key]
	var got: Dictionary = {}
	if p.get("syn", false) == true:
		var o: Dictionary = Js.obj(d["syn"].get(key))
		if o.is_empty():
			return { "error": "No synergy in your hand." }
		(c["takenCv"] if o.get("isConvergence", false) else c["taken"]).append(o["id"])
		got = { "kind": "syn", "id": o["id"], "name": o["name"], "level": o["level"] }
		_mark_seen(key, str(o["id"]))
	else:
		var i: int = int(Js.num(p.get("card")))
		var cards: Array = d["cards"]
		if i < 0 or i >= cards.size() or d["stamps"].has(str(i)):
			return { "error": "That card is gone." }
		var card: Dictionary = cards[i]
		if card["card"] == "reprieve":
			got = _take_reprieve(key, card)
		elif card["card"] == "crew":
			if not Js.list(card["keys"]).has(key):
				return { "error": "That crew synergy belongs to %s." % " and ".join(PackedStringArray(Js.list(card["names"]).map(func(x: Variant) -> String: return str(x)))) }
			if not _r["run"].has("crewSyn"):
				_r["run"]["crewSyn"] = []
			(_r["run"]["crewSyn"] as Array).append({ "id": card["id"], "keys": card["keys"] })
			got = { "kind": "crew", "id": card["id"], "name": card["name"], "level": card["level"] }
			for k9: Variant in card["keys"]:
				_mark_seen(str(k9), str(card["id"]))
		else:
			var tr: int = next_tier(key, str(card["id"]))
			if tr <= 0:
				return { "error": "You hold all of that power already." }
			c["boons"][card["id"]] = float(tr)
			got = { "kind": "boon", "id": card["id"], "name": card["name"], "tier": float(tr), "rarity": card["rarity"] }
		d["stamps"][str(i)] = key
	d["took"][key] = got
	d["turn"] = float(d["turn"]) + 1.0
	_turn_on()
	return { "ok": true }


## The draft's turn passes on: past anyone with nothing they can take and
## anyone gone from the Charter (Kong's audit, 2026-10-06: a dropped captain
## next in line held the table forever); the draft closes after the last.
func _turn_on() -> void:
	var d: Dictionary = _r["draft"]
	while _turn_key() != "" and (Js.obj(_r.get("gone")).has(_turn_key()) or not _can_pick(_turn_key())):
		d["took"][_turn_key()] = { "kind": "none" }
		d["turn"] = float(d["turn"]) + 1.0
	if _turn_key() == "":
		_r["seq"] = int(_r["seq"]) + 1
		_push()
		_draft_done()
		return
	_push()


func _can_pick(key: String) -> bool:
	var d: Dictionary = _r["draft"]
	if not Js.obj(d["syn"].get(key)).is_empty():
		return true
	for i: int in (d["cards"] as Array).size():
		if d["stamps"].has(str(i)):
			continue
		var card: Dictionary = d["cards"][i]
		if card["card"] == "crew":
			if Js.list(card["keys"]).has(key):
				return true
			continue
		if card["card"] == "reprieve" or next_tier(key, str(card["id"])) > 0:
			return true
	return false


func _draft_done() -> void:
	var personal: bool = _r["draft"].get("personal", false)
	var back: String = str(_r["draft"].get("back", ""))
	_r["lastDraft"] = _r["draft"]
	_r.erase("draft")
	if personal and back == "shrine":
		_r["phase"] = "shrine"
		_shrine_check()
		return
	if personal and back == "fence":
		_r["phase"] = "fence"
		_fence_check()
		return
	_chain()


func _take_reprieve(key: String, card: Dictionary) -> Dictionary:
	var run: Dictionary = _r["run"]
	var si: int = _seat_of(key)
	var s: Dictionary = _r["b"]["seats"][si]
	var out: Dictionary = { "kind": "reprieve", "id": card["id"], "name": card["name"] }
	match str(card["kind"]):
		"heal":
			var h: float = float(Js.round(float(s["max"]) * float(card["amount"]) * float(run["tm"]["healMult"])))
			s["hp"] = minf(float(s["max"]), float(s["hp"]) + h)
			out["heal"] = h
		"crew":
			s["used"] = Js.list(_r["caps"][key]["silenced"]).duplicate()
		"charges":
			s["carry"] = float(3 + (1 if Armory.has_rack(_session(key).profile()) else 0))
		"cleanse":
			out["shed"] = _shed_curse()
	return out


## A curse shed from the party (a reprieve, the Fence's Hex-Breaker); Dead
## Hands' silence lifts with it.
func _shed_curse() -> String:
	var run: Dictionary = _r["run"]
	var ids: Array = Js.obj(run["curses"]).keys()
	if ids.is_empty():
		return ""
	var id: String = str(ids[int(floor(Dice.next() * ids.size()))])
	run["curses"].erase(id)
	var want: int = Gauntlet.curse_silence(run["curses"])
	for s: Dictionary in _r["b"]["seats"]:
		var cp: Dictionary = Js.obj(_r["caps"].get(s["key"]))
		if cp.is_empty():
			continue
		while (cp["silenced"] as Array).size() > want:
			var freed: Variant = (cp["silenced"] as Array).pop_back()
			(s["used"] as Array).erase(freed)
	return str(Gauntlet.curse_def(id).get("name", id))


## The one at the table rerolls the cards left (a Locker reroll, per draft).
func _reroll(key: String) -> Dictionary:
	if _r["phase"] != "draft" or key != _turn_key():
		return { "error": "Not your turn at the table." }
	var d: Dictionary = _r["draft"]
	var used: int = int(Js.num(d["rerolls"].get(key)))
	if d.get("personal", false) or used >= Gauntlet.boon_rerolls(Js.list(_r["caps"][key]["ups"])):
		return { "error": "No rerolls left." }
	d["rerolls"][key] = float(used + 1)
	var keep: Array = []
	var left: int = 0
	for i: int in (d["cards"] as Array).size():
		if d["stamps"].has(str(i)) or d["cards"][i]["card"] == "reprieve":
			keep.append(i)
		else:
			left += 1
	var fresh: Array = _deal(left, d["order"], [])
	var k2: int = 0
	for i2: int in (d["cards"] as Array).size():
		if not keep.has(i2) and k2 < fresh.size():
			d["cards"][i2] = fresh[k2]
			k2 += 1
	_push()
	return { "ok": true }


## Blacklist (Don's Locker): a card banished for the whole party's run, its
## place dealt again.
func _banish(key: String, i: int) -> Dictionary:
	if _r["phase"] != "draft" or key != _turn_key():
		return { "error": "Not your turn at the table." }
	var c: Dictionary = _r["caps"][key]
	var d: Dictionary = _r["draft"]
	if float(c["filters"]) <= 0.0:
		return { "error": "No banishments left this run." }
	if i < 0 or i >= (d["cards"] as Array).size() or d["stamps"].has(str(i)) or d["cards"][i]["card"] != "boon":
		return { "error": "That card cannot be banished." }
	c["filters"] = float(c["filters"]) - 1.0
	(_r["run"]["banned"] as Array).append(d["cards"][i]["id"])
	var shown: Array = (d["cards"] as Array).map(func(x: Dictionary) -> String: return str(x.get("id", "")))
	var fresh: Array = _deal(1, d["order"], shown)
	if fresh.is_empty():
		(d["cards"] as Array).remove_at(i)
		var st2: Dictionary = {}
		for k: String in d["stamps"]:
			st2[str(int(k) - (1 if int(k) > i else 0))] = d["stamps"][k]
		d["stamps"] = st2
	else:
		d["cards"][i] = fresh[0]
	_push()
	return { "ok": true }


## The codex: a synergy taken for the first time.
## Reactions set off this round: each captain in the fight who had never
## seen one has it written into their Codex (gauntlet_reactions_seen), and
## the event names them so their screen can say it was discovered.
func _reactions_found(ev: Array) -> void:
	for x: Variant in ev:
		if not (x is Dictionary) or str(x.get("t", "")) != "reaction":
			continue
		var fresh: Array = []
		for st: Dictionary in _r["b"]["seats"]:
			var key: String = str(st.get("key", ""))
			var s: Session = _session(key)
			if s == null:
				continue
			_lend(s)
			if not Js.list(s.profile().get("gauntlet_reactions_seen")).has(x["id"]):
				s.store.add_to_list(s.uid, "gauntlet_reactions_seen", x["id"])
				fresh.append(key)
			_take(s)
		x["new"] = fresh


func _mark_seen(key: String, id: String) -> void:
	var s: Session = _session(key)
	if s == null:
		return
	_lend(s)
	var seen: Array = Js.list(s.profile().get("gauntlet_confluences_seen"))
	if not seen.has(id):
		s.store.add_to_list(s.uid, "gauntlet_confluences_seen", id)
	_take(s)


# ── The Drowned Shrine (each captain their own choice) ────────────────────────

## { choice: "coin" (stake) | "blood" | "walk" }.
func _shrine(key: String, p: Dictionary) -> Dictionary:
	if _r["phase"] != "shrine":
		return { "error": "Not now." }
	var sh: Dictionary = _r["shrine"]
	if sh["picks"].has(key):
		return { "error": "You have made your offering." }
	var si: int = _seat_of(key)
	var s: Dictionary = _r["b"]["seats"][si]
	var run: Dictionary = _r["run"]
	var out: Dictionary = { "choice": str(p.get("choice", "walk")) }
	match out["choice"]:
		"coin":
			var ss: Session = _session(key)
			_lend(ss)
			var bank: float = Js.num(ss.profile().get("gauntlet_fathoms"))
			var stake: float = minf(minf(maxf(1.0, floor(Js.num(p.get("stake")))), float(Gauntlet.SHRINE_WAGER_CAP)), bank)
			if stake <= 0.0:
				_take(ss)
				return { "error": "No Fathoms banked to stake." }
			var won: bool = Dice.next() < 0.5
			ss.store.bump_stat(ss.uid, "gauntlet_fathoms", stake if won else -stake)
			_take(ss)
			out["stake"] = stake
			out["won"] = won
		"blood":
			var lose: float = float(s["hp"]) - 1.0 if run["tm"]["bloodPriceToOne"] else maxf(1.0, float(Js.round(float(s["hp"]) * 0.5)))
			s["hp"] = maxf(1.0, float(s["hp"]) - lose)
			out["lost"] = lose
		_:
			var h: float = float(Js.round(float(s["max"]) * 0.05))
			s["hp"] = minf(float(s["max"]), float(s["hp"]) + h)
			out["heal"] = h
	sh["picks"][key] = out
	_push()
	_shrine_check()
	return { "ok": true }


func _shrine_check() -> void:
	var sh: Dictionary = _r["shrine"]
	# Blood Price: each paid draft dealt in turn, one captain at a time.
	for k: String in _keys_in():
		if not sh["picks"].has(k):
			return
	for k2: String in _keys_in():
		if str(sh["picks"][k2]["choice"]) == "blood" and not sh["drafts"].has(k2):
			sh["drafts"][k2] = true
			var nd: int = int(_r["run"]["roll"]["cleared"]) + 1 + int(_r["run"]["skip"])
			if _open_draft(k2, nd):
				_r["draft"]["back"] = "shrine"
				_push()
				return
	_r["lastShrine"] = sh
	_r.erase("shrine")
	_breather()


# ── The Fence (Don's; each captain their own stall, paid from this dive) ─────

func _fence(key: String, item: String) -> Dictionary:
	if _r["phase"] != "fence":
		return { "error": "Not now." }
	var st: Dictionary = Js.obj(_r["fence"]["stalls"].get(key))
	if st.is_empty() or not Js.list(st["items"]).has(item) or Js.list(st["sold"]).has(item):
		return { "error": "Not for sale." }
	var price: float = float(Js.obj(Js.obj(Gauntlet.t().get("merchant")).get(item)).get("price", 0.0))
	var c: Dictionary = _r["caps"][key]
	var run: Dictionary = _r["run"]
	var spendable: float = Gauntlet.fathoms_for_depth(int(run["roll"]["cleared"]), "don") - float(c["fenceSpent"])
	if spendable < price:
		return { "error": "Earn %d more Fathoms this dive." % int(price - spendable) }
	c["fenceSpent"] = float(c["fenceSpent"]) + price
	(st["sold"] as Array).append(item)
	var si: int = _seat_of(key)
	var s: Dictionary = _r["b"]["seats"][si]
	match item:
		"heal":
			s["hp"] = minf(float(s["max"]), float(s["hp"]) + float(Js.round(float(s["max"]) * 0.35 * float(run["tm"]["healMult"]))))
		"cleanse":
			st["shed"] = _shed_curse()
		"charges":
			s["carry"] = float(3 + (1 if Armory.has_rack(_session(key).profile()) else 0))
		"crew":
			s["used"] = Js.list(c["silenced"]).duplicate()
		"boon":
			_r["fence"]["done"][key] = true
			_r["fence"]["drafts"][key] = true
	_push()
	_fence_check()
	return { "ok": true }


func _done(key: String) -> Dictionary:
	if _r["phase"] == "fence":
		_r["fence"]["done"][key] = true
		_push()
		_fence_check()
	return { "ok": true }


func _fence_check() -> void:
	var fe: Dictionary = _r["fence"]
	for k: String in _keys_in():
		if not fe["done"].has(k):
			return
	for k2: String in _keys_in():
		if fe["drafts"].get(k2, false) == true:
			fe["drafts"][k2] = "dealt"
			var nd: int = int(_r["run"]["roll"]["cleared"]) + 1 + int(_r["run"]["skip"])
			if _open_draft(k2, nd):
				_r["draft"]["back"] = "fence"
				_push()
				return
	_r.erase("fence")
	_breather()


# ── The Don's jobs (a party vote on the stake) ────────────────────────────────

func _contract_vote(key: String, stake: int) -> Dictionary:
	if _r["phase"] != "contract":
		return { "error": "Not now." }
	_r["job"]["votes"][key] = float(clampi(stake, 0, 3))
	_contract_check()
	return { "ok": true }


## The stake settles once every captain still in has voted.
func _contract_check() -> void:
	for k: String in _keys_in():
		if not _r["job"]["votes"].has(k):
			_push()
			return
	var tally: Dictionary = {}
	for k2: String in _r["job"]["votes"]:
		var v: int = int(_r["job"]["votes"][k2])
		tally[v] = int(tally.get(v, 0)) + 1
	var best: int = 0
	var most: int = -1
	for v2: Variant in tally:
		if int(tally[v2]) > most:
			most = int(tally[v2])
			best = int(v2)
	# A tie walks away (no one is talked into a job).
	var tied: bool = tally.values().filter(func(n: Variant) -> bool: return int(n) == most).size() > 1
	if tied:
		best = 0
	if best > 0:
		_r["run"]["contract"] = _r["job"]["offers"][best - 1]
	_r["jobTaken"] = best
	_descend()


func _job_land(jr: Dictionary) -> void:
	var run: Dictionary = _r["run"]
	var job: Dictionary = jr["job"]
	var ev: Dictionary = { "met": jr["met"], "job": job }
	var curse_next: bool = false
	var draft_next: bool = false
	var hit: Dictionary = job["reward"] if jr["met"] else job["penalty"]
	match str(hit["kind"]):
		"plunder":
			run["pot"] = float(run["pot"]) + float(hit["n"])
		"plunderLose":
			run["pot"] = maxf(0.0, float(run["pot"]) - float(hit["n"]))
		"hullBoost", "hullCut":
			for k: String in _keys_in():
				var c: Dictionary = _r["caps"][k]
				c["hullMult"] = float(c["hullMult"]) * (1.0 + float(hit["pct"]) if hit["kind"] == "hullBoost" else 1.0 - float(hit["pct"]))
			_effects_onto(_r["b"]["seats"])
		"fullHeal":
			for s: Dictionary in Battle.alive(_r["b"]):
				s["hp"] = float(s["max"])
		"hpLossPct":
			for s2: Dictionary in Battle.alive(_r["b"]):
				s2["hp"] = maxf(1.0, float(s2["hp"]) - float(Js.round(float(s2["hp"]) * float(hit["pct"]))))
		"curse":
			curse_next = true
		"boonDraft":
			draft_next = true
	_r["jobResult"] = ev
	run["jobNext"] = "curse" if curse_next else ("draft" if draft_next else "")
	_enter("jobResult")


# ── The Don's fall and his Marks ──────────────────────────────────────────────

func _mark(key: String, kind: String) -> Dictionary:
	if _r["phase"] != "marks" or not ["shark", "whale"].has(kind):
		return { "error": "Not now." }
	var mk: Dictionary = _r["marks"]
	if mk["picks"].has(key):
		return { "ok": true }
	var o: Dictionary = Js.obj(mk["offers"].get(key))
	(_r["caps"][key]["marks"] as Array).append({ "type": kind, "buffs": o.get(kind, []) })
	mk["picks"][key] = kind
	_marks_check()
	return { "ok": true }


func _marks_check() -> void:
	var mk: Dictionary = _r["marks"]
	for k: String in _keys_in():
		if not mk["picks"].has(k):
			_push()
			return
	_effects_onto(_r["b"]["seats"])
	_r.erase("donFall")
	_r["lastMarks"] = mk
	_r.erase("marks")
	_chain()


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


# ── The end: banked, or lost to the deep ──────────────────────────────────────

func _bank() -> void:
	var run: Dictionary = _r["run"]
	var cleared: int = int(run["roll"]["cleared"])
	var live_offer: Dictionary = Js.obj(Js.obj(run["offer"]).get("live"))
	var offer: Dictionary = live_offer if not live_offer.is_empty() and int(live_offer["depth"]) == cleared else {}
	var pays: Dictionary = {}
	for k: String in _keys_in():
		var s: Session = _session(k)
		if s == null:
			continue
		_lend(s)
		pays[k] = _pay(k, s, cleared, offer)
		_take(s)
	_r["pays"] = pays
	_r["result"] = "banked"
	_held_clear()
	_settle()
	_enter("haul")


## One captain's haul into their own save, and their records.
func _pay(key: String, s: Session, cleared: int, offer: Dictionary) -> Dictionary:
	var run: Dictionary = _r["run"]
	var v: String = str(run["variant"])
	var c: Dictionary = _r["caps"][key]
	var p: Dictionary = s.profile()
	var cd: int = cleared + int(run["skip"])
	var ren: Dictionary = Js.obj(p.get("nav_renown_alloc"))
	var mults: Dictionary = {
		"shipClass": float(Campaign.class_effects(p.get("ship_classes"))["doubloonMult"]),
		"renown": 1.0 + maxf(0.0, floor(Js.num(ren.get("plunder")))) * 0.015,
		"haul": Gauntlet.haul_mult(c["ups"]), "xp": Gauntlet.xp_mult(c["ups"]), "fathoms": Gauntlet.fathoms_mult(c["ups"]),
		"crewXp": 1.0 + maxf(0.0, floor(Js.num(ren.get("command")))) * 0.02,
		"fortune": _fortune(key),
	}
	var h: Dictionary = Gauntlet.haul(cleared, cd, v, float(run["pot"]), false, 0.0, Js.list(p.get("owned_ship_skins")), mults, offer, float(c["fenceSpent"]))
	var db: CaptainStore = s.store
	if str(run.get("mode", "solo")) == "coop":
		_coop_rewards(key, s, h, cd)
	if float(h["doubloons"]) > 0.0:
		db.bump_stat(s.uid, "doubloons", float(h["doubloons"]))
		db.ledger(s.uid, float(h["doubloons"]), "%s: banked at depth %d" % [Gauntlet.NAMES[v], cd])
		if charter != null:
			charter._note(s.captain_name(), float(h["doubloons"]), "%s: banked at depth %d" % [Gauntlet.NAMES[v], cd])
	db.bump_stat(s.uid, "expedition_xp", float(h["navXp"]))
	db.bump_stat(s.uid, "gauntlet_fathoms", float(h["fathoms"]))
	db.bump_stat(s.uid, "gauntlet_fathoms_earned", float(h["fathoms"]))
	if not h["items"].is_empty():
		var held: Array = Js.list(p.get("raid_items")).duplicate()
		held += h["items"]
		db.update_profile(s.uid, { "raid_items": held })
	for sk: Variant in h["skins"]:
		db.add_to_list(s.uid, "owned_ship_skins", sk)
	# Crew XP to every hand seated for raids.
	var crew_up: Array = []
	for cr: Dictionary in Crew.live(db):
		if cr.get("raid_slot") != null and float(h["crewXp"]) > 0.0:
			var old: float = Js.num(cr.get("xp"))
			cr["xp"] = old + float(h["crewXp"])
			crew_up.append({ "name": cr.get("nickname") if cr.get("nickname") != null else Crew.display_name(str(Crew.card(float(cr["card_id"])).get("slug", "")), str(Crew.card(float(cr["card_id"])).get("name", ""))), "from": float(Crew.level(old)), "to": float(Crew.level(old + float(h["crewXp"]))) })
	h["crewUp"] = crew_up
	h["record"] = _record(key, s, cd, true)
	return h


## A co-op bank's own: the Fleet Chest (every captain afloat past the first
## lifts everyone's doubloons) and skin vouchers by depth (port rules
## battle.gauntlet.vouchers; a full crew of four deep enough rolls twice;
## crew Fortune lifts the odds as it lifts the chase).
func _coop_rewards(key: String, s: Session, h: Dictionary, cd: int) -> void:
	var pc: Dictionary = Gauntlet.coop_cfg()
	var afloat: int = _keys_in().size()
	var fleet: float = 1.0 + float(pc.get("fleetPerCaptain", 0.05)) * maxi(0, afloat - 1)
	h["fleet"] = fleet
	h["doubloons"] = float(Js.round(float(h["doubloons"]) * fleet))
	var rolls: int = 2 if afloat >= 4 and cd >= int(pc.get("fullCrewDepth", 20)) else 1
	var got: Array = []
	for kind: String in ["bosun", "captain"]:
		var chance: float = 0.0
		for st: Variant in Js.list(Js.obj(pc.get("vouchers")).get(kind)):
			if cd >= int(st[0]):
				chance = float(st[1])
		chance = minf(0.25, chance * _fortune(key))
		for k: int in rolls:
			if chance > 0.0 and Dice.next() < chance:
				Skins.grant(s.store, s.uid, kind)
				got.append(kind)
	h["vouchers"] = got


## A record for this captain: the deepest, the last run, the deepest run's
## recap, kept twice: across both modes (the Locker reads it) and for this
## mode (gauntlet_solo_* / gauntlet_coop_*, dons_gauntlet_* for the Don's);
## the dives banked and sunk, the biggest hit. Returns whether it went deeper
## than ever in this mode.
func _record(key: String, s: Session, cd: int, banked: bool) -> bool:
	var run: Dictionary = _r["run"]
	var v: String = str(run["variant"])
	var base: String = "dons_gauntlet_" if v == "don" else "gauntlet_"
	var p: Dictionary = s.profile()
	var c: Dictionary = _r["caps"][key]
	var names: Array = []
	for k: String in Js.obj(run.get("names")):
		if k != key:
			names.append(run["names"][k])
	var snap: Dictionary = {
		"depth": float(cd), "boons": c["boons"], "taken": c["taken"], "takenCv": c["takenCv"], "marks": c["marks"],
		"curses": run["curses"], "stats": c["stats"], "crew": names, "mode": run.get("mode", "solo"),
		"banked": banked, "pot": run["pot"], "at": Js.iso(Clock.now_ms()), "ms": float(Time.get_ticks_msec() - _began_ms),
	}
	var patch: Dictionary = {}
	var deeper: bool = false
	for pre: String in [base, base + str(run.get("mode", "solo")) + "_"]:
		patch[pre + "last_run"] = snap
		patch[pre + ("runs_completed" if banked else "runs_sunk")] = Js.num(p.get(pre + ("runs_completed" if banked else "runs_sunk"))) + 1.0
		if banked:
			if float(cd) > Js.num(p.get(pre + "deepest")) or (float(cd) == Js.num(p.get(pre + "deepest")) and float(snap["ms"]) < Js.num(p.get(pre + "best_depth_ms", 1e18))):
				deeper = deeper or float(cd) > Js.num(p.get(pre + "deepest"))
				patch[pre + "deepest"] = float(cd)
				patch[pre + "deepest_run"] = snap
				patch[pre + "best_depth"] = float(cd)
				patch[pre + "best_depth_ms"] = snap["ms"]
				patch[pre + "best_depth_at"] = snap["at"]
		elif float(cd) > Js.num(p.get(pre + "deepest_died")):
			patch[pre + "deepest_died"] = float(cd)
	# A crew's own record: these captains together, in this descent.
	if str(run.get("mode", "solo")) == "coop" and banked:
		var ks: Array = Js.obj(run.get("names")).keys()
		ks.sort()
		var ck: String = v + ":" + ",".join(PackedStringArray(ks))
		var crews: Dictionary = Js.obj(p.get("gauntlet_crews")).duplicate(true)
		var cr: Dictionary = Js.obj(crews.get(ck))
		if float(cd) > Js.num(cr.get("deepest")) or (float(cd) == Js.num(cr.get("deepest")) and float(snap["ms"]) < Js.num(cr.get("ms", 1e18))):
			crews[ck] = { "variant": v, "names": Js.obj(run.get("names")).values(), "deepest": float(cd), "ms": snap["ms"], "at": snap["at"] }
			patch["gauntlet_crews"] = crews
	if Js.num(c["stats"].get("highestHit")) > Js.num(p.get("gauntlet_max_hit")):
		patch["gauntlet_max_hit"] = c["stats"]["highestHit"]
	s.store.update_profile(s.uid, patch)
	# The Don's feats, on a banked run (the web's donFeats).
	if v == "don" and banked:
		var feats: Array = []
		var shots: float = Js.num(c["stats"].get("shots"))
		if cd >= 10 and shots >= 1.0 and shots == Js.num(c["stats"].get("megas")):
			feats.append("ultimate_only")
		if cd >= 30 and Js.obj(run.get("curses")).size() >= 5:
			feats.append("weight_of_green")
		if cd >= 5 and Js.num(c["stats"].get("dmgTaken")) == 0.0:
			feats.append("untouched")
		for f: String in feats:
			if not Js.list(s.profile().get("unlocked_badges")).has(f):
				s.store.grant_badge(s.uid, f)
				s.store.save["badges_new"] = Js.list(s.store.save.get("badges_new")) + [f]
	# The bounty board's moments: Davy Jones' depth reached and biggest hit.
	if v != "don":
		Bounties.log_event(s.store, s.uid, "gauntlet_depth", float(cd))
		if Js.num(c["stats"].get("highestHit")) > 0.0:
			Bounties.log_event(s.store, s.uid, "gauntlet_hit", Js.num(c["stats"].get("highestHit")))
	return deeper


## The whole party sunk: the pot goes to the deep; Fathoms are paid.
func _dive_lost(ev: Array) -> void:
	var run: Dictionary = _r["run"]
	var cd: int = int(run["roll"]["cleared"]) + int(run["skip"])
	var pays: Dictionary = Js.obj(_r.get("pays"))
	for k: String in _keys_in():
		var c: Dictionary = _r["caps"][k]
		var s: Session = _session(k)
		if s == null:
			continue
		_lend(s)
		pays[k] = _death_pay(k, s, cd)
		_take(s)
		c["out"] = "sunk"
		if charter != null:
			charter.spend_life(k, "Sunk in %s at depth %d" % ["the Don's Gauntlet" if str(run["variant"]) == "don" else "Davy's Gauntlet", cd])
	_r["pays"] = pays
	_r["result"] = "lost"
	_r["lostPot"] = run["pot"]
	_held_clear()
	_settle()
	_step("dead", ev)


func _death_pay(key: String, s: Session, cd: int) -> Dictionary:
	var run: Dictionary = _r["run"]
	var c: Dictionary = _r["caps"][key]
	var cleared: int = int(run["roll"]["cleared"])
	var f: float = Gauntlet.run_fathoms(cleared, str(run["variant"]), Gauntlet.fathoms_mult(c["ups"]), {}, float(c["fenceSpent"]))
	s.store.bump_stat(s.uid, "gauntlet_fathoms", f)
	s.store.bump_stat(s.uid, "gauntlet_fathoms_earned", f)
	_record(key, s, cd, false)
	return { "fathoms": f, "depth": float(cd) }


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


func _push() -> void:
	_clock()
	if str(_r.get("phase", "")) == "muster":
		_r["crew"] = _crew_view()
	var pub: Dictionary = _r.duplicate(true)
	if pub.has("run"):
		# Kept on the founder's game: the next fight before it is fought.
		var run: Dictionary = pub["run"]
		var pk: Dictionary = Js.obj(run.get("peek"))
		if not pk.is_empty():
			run["peekNote"] = _peek_note(pk)
		run.erase("peek")
	if charter != null and multiplayer.multiplayer_peer != null and not multiplayer.get_peers().is_empty():
		_state.rpc(pub)
	else:
		_state(pub)


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


@rpc("authority", "call_local", "reliable")
func _state(pub: Dictionary) -> void:
	state = pub
	changed.emit(pub)


func _process(delta: float) -> void:
	if not hosting():
		return
	if float(_r.get("left", -1.0)) <= 0.0:
		return
	_r["left"] = float(_r["left"]) - delta
	if float(_r["left"]) > 0.0:
		return
	_r["left"] = -1.0
	if str(_r["phase"]) == "playing":
		_advance()



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


func _nudge(key: String) -> Dictionary:
	if not _keys_in().has(key):
		return { "error": "You are out of this dive." }
	if not _waited():
		return { "error": "Give them a moment more." }
	var ph: String = str(_r["phase"])
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
	if str(_r.get("mode", "solo")) == "solo":
		return "Switch the dive to Co-op to bring the crew."
	var why: String = shut(s, str(_r["variant"]))
	return "They have not opened this descent yet." if why != "" else ""


## A captain back on the line mid-dive (their game dropped and came back):
## back in their seat, and shown where the dive is now.
func welcome(key: String, id: int) -> void:
	if _r.get("phase", "idle") == "idle":
		return
	if Js.obj(_r.get("gone")).has(key) and not ["muster", "done"].has(str(_r["phase"])):
		_r["gone"].erase(key)
		var si: int = _seat_of(key)
		if si >= 0 and not _r["b"]["seats"][si].get("sunk", false):
			_r["b"]["seats"][si].erase("fled")
		_push()
		return
	if multiplayer.multiplayer_peer != null:
		var pub: Dictionary = _r.duplicate(true)
		if pub.has("run"):
			(pub["run"] as Dictionary).erase("peek")
		_state.rpc_id(id, pub)


## A captain's game has dropped out of the Charter: out of the muster, or
## out of the dive (keeping nothing of the pot), and nothing waits on them.
func drop(key: String) -> void:
	match str(_r["phase"]):
		"idle", "done":
			return
		"muster":
			_leave(key)
			return
	_r["gone"][key] = true
	var si: int = _seat_of(key)
	if si >= 0:
		_r["b"]["seats"][si]["fled"] = true
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



# ══ Held dives: written down at every breather, held by vote, resumed ═════════

func _names() -> Dictionary:
	var out: Dictionary = {}
	for m: Dictionary in _r.get("members", []):
		out[m["key"]] = m["name"]
	return out


## Where held dives are kept: alone, in the captain's save; in a Charter, in
## the Charter's own file (the crew's).
func _held_all() -> Dictionary:
	if charter != null:
		if not (charter.data.get("gauntletHeld") is Dictionary):
			charter.data["gauntletHeld"] = {}
		return charter.data["gauntletHeld"]
	if solo != null:
		var p: Dictionary = solo.profile()
		if not (p.get("gauntlet_held") is Dictionary):
			p["gauntlet_held"] = {}
		return p["gauntlet_held"]
	return {}


func _held_write() -> void:
	if charter != null:
		charter.write()
	elif solo != null:
		solo.persist()


## What the entry screen shows of a held dive of this descent.
func _held_note(variant: String) -> Dictionary:
	var h: Dictionary = Js.obj(_held_all().get(variant))
	if h.is_empty():
		return {}
	return { "depth": h["depth"], "mode": h["mode"], "names": h["names"], "keys": h["keys"], "status": h["status"], "at": h["at"], "pot": h["pot"] }


## The dive written down as it stands at a breather.
func _checkpoint(status: String, fight: Dictionary = {}) -> void:
	var run: Dictionary = _r["run"].duplicate(true)
	run["peek"] = fight.duplicate(true)
	var seats: Array = []
	for st: Dictionary in _r["b"]["seats"]:
		if _keys_in().has(st.get("key")):
			var c: Dictionary = st.duplicate(true)
			c.erase("statuses")
			seats.append(c)
	var names: Dictionary = {}
	for k: String in _keys_in():
		names[k] = Js.obj(run.get("names")).get(k, "A captain")
	_held_all()[str(run["variant"])] = {
		"status": status, "at": Js.iso(Clock.now_ms()), "variant": run["variant"], "mode": run.get("mode", "solo"),
		"depth": float(int(run["roll"]["cleared"]) + int(run["skip"])), "pot": run["pot"], "keys": _keys_in(), "names": names,
		"run": run, "caps": _r["caps"].duplicate(true), "seats": seats,
	}
	_held_write()


func _held_clear() -> void:
	if not _r.has("run"):
		return
	_held_all().erase(str(_r["run"]["variant"]))
	_held_write()


## Everyone voted to hold it: written down, and the crew go back up.
func _hold() -> void:
	_checkpoint("held")
	_r["result"] = "held"
	_r["heldAt"] = float(int(_r["run"]["roll"]["cleared"]) + int(_r["run"]["skip"]))
	_settle()
	_enter("held")


## The caller picks the held dive (or a fresh one) at the muster.
func _resume_pick(key: String, yes: bool) -> Dictionary:
	if _r["phase"] != "muster" or _r.get("by") != key:
		return { "error": "Only the captain who called it decides." }
	var h: Dictionary = Js.obj(_r.get("held"))
	if yes and h.is_empty():
		return { "error": "There is no held dive here." }
	_r["resume"] = yes
	if yes:
		_r["mode"] = h["mode"]
	for m: Dictionary in _r["members"]:
		m["ready"] = m["key"] == key
	_push()
	return { "ok": true }


## The held dive, back where it was left: its breather, its crew, its pot.
func _resume() -> Dictionary:
	var v: String = str(_r["variant"])
	var h: Dictionary = Js.obj(_held_all().get(v))
	if h.is_empty():
		return { "error": "There is no held dive here." }
	var here: Array = (_r["members"] as Array).map(func(m: Dictionary) -> String: return str(m["key"]))
	var missing: Array = []
	for k: String in h["keys"]:
		if not here.has(k):
			missing.append(str(Js.obj(h["names"]).get(k, "a captain")))
	if not missing.is_empty():
		return { "error": "The held dive needs its whole crew: waiting on %s." % ", ".join(PackedStringArray(missing)) }
	for k2: String in here:
		if not (h["keys"] as Array).has(k2):
			return { "error": "%s was not in the held dive." % _names().get(k2, "A captain") }
	_r["run"] = (h["run"] as Dictionary).duplicate(true)
	_r["caps"] = (h["caps"] as Dictionary).duplicate(true)
	var seats: Array = (h["seats"] as Array).duplicate(true)
	for st: Dictionary in seats:
		st["statuses"] = {}
	_r["b"] = { "raidId": "", "gauntlet": v, "round": 0.0, "fight": 0.0, "seats": seats, "turn": 1.0, "state": "won", "events": [],
		"tier": "normal", "elites": {}, "bonusAffix": {}, "tides": [], "tideFired": [], "foes": [], "enemy": {}, "depth": h["depth"] }
	_r["gone"] = {}
	_r["fight"] = {}
	_r["descent"] = {}
	_began_ms = Time.get_ticks_msec()
	var mid: bool = str(h.get("status", "")) == "fighting" and not Js.obj(Js.obj(h["run"]).get("peek")).is_empty()
	_step("refight" if mid else "breather", [{ "t": "resume", "depth": h["depth"] }])
	return { "ok": true }


## A held dive given up: each of its captains is paid their Fathoms, the pot
## is lost, it is gone.
func _end_held(key: String) -> Dictionary:
	if _r["phase"] != "muster" or _r.get("by") != key:
		return { "error": "Only the captain who called it decides." }
	var v: String = str(_r["variant"])
	var h: Dictionary = Js.obj(_held_all().get(v))
	if h.is_empty():
		return { "error": "There is no held dive here." }
	if not (h["keys"] as Array).has(key):
		return { "error": "Only a captain of that dive can end it." }
	var keep_r: Dictionary = _r
	_r = { "run": h["run"], "caps": h["caps"], "phase": "muster" }
	var cd: int = int(h["depth"])
	for k: String in h["keys"]:
		var s: Session = _session(k)
		if s == null:
			continue
		_lend(s)
		_death_pay(k, s, cd)
		_take(s)
	_r = keep_r
	_held_all().erase(v)
	_held_write()
	_settle()
	_r["held"] = {}
	_r["resume"] = false
	_push()
	return { "ok": true }
