class_name Battle
extends RefCounted
## THE BATTLE ENGINE (Kong, 2026-10-03: "rebuild for parties"; the decisions
## in docs/systems/steam-port.md, the co-op combat section). One engine for
## every fight, solo or a Charter's raid: solo is a party of one. The web's
## NUMBERS are kept (web/app/(app)/raids/RaidCombat.tsx, lib/expeditions,
## lib/crewClasses, lib/statuses, lib/bossRaids: the aim bar's judgment, the
## damage roll, the dodge contest, initiative, the enemy's scripted pattern,
## crew abilities by milestone, statuses, mechanic checks, phases); the
## STRUCTURE is new and the dice are the rules' own (Dice), so the host can
## resolve a round once and every captain's screen plays the same events.
##
## A ROUND: every captain PLANS (an action, its aim already judged on their
## own bar, and maybe one crew ability), then resolve(): crew abilities in
## seat order, initiative (each ship and the enemy roll d20 + speed; ties to
## the ships), and every ship and the enemy act in that order. The enemy
## picks its move from its pattern as on the web; its TARGET is a ship it
## chooses as it fires, never shown before (Kong: hidden). Then the round's
## end: deaths and revives, the win, the mechanic check's countdown, statuses.
##
## Every captain keeps their own ship, HP, crew and balls. PARTY SCALING
## (port rules battle.party): the ENEMY's HP times enemyHpMult[n-1]; an
## ordinary attack is shots[n-1] aimed shots, each at a ship it picks as it
## fires (focus: the same ship may be picked twice). BROADSIDES (port rules battle.broadside, Kong): a boss's
## volleys and ultimates, and the volleys of listed enemies, hit EVERY ship
## at once, each with its own dodge. Hits stay the size they are.
##
## NOT YET (later raids need them; each is in the specs): raid items, tides,
## elite affixes, boss off-turn abilities, the Last Wall, flare barrages, aim
## afflictions, burn and freeze, flee.
##
## Everything is plain Dictionaries and Arrays (it crosses the Charter's wire).

const MAX_CHARGES: int = 3
const VOLLEY_COST: int = 3
const FEINT_CHANCE: float = 0.30
const VENGEANCE_WARD_TURNS: int = 3


static func d20() -> int:
	return int(floor(Dice.next() * 20.0)) + 1


static func rand_int(a: int, b: int) -> int:
	return int(floor(Dice.next() * float(b - a + 1))) + a


static func cfg() -> Dictionary:
	return Js.obj(Rules.data().get("battle"))


# ══ Who is in the fight ═══════════════════════════════════════════════════════

## A ship in the line, from a captain's save: the hull's stats by tier, the
## crew seated for raids (slot 0 is the captain's hand at full weight, the
## rest at 0.8), the Navigation level's bonuses (lib/raidLoadout).
static func seat_for(db: CaptainStore, uid: String, name: String = "") -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var tier: int = clampi(int(Js.nz(prof.get("ship_tier"), 2.0)), 2, 6)
	var hull: Dictionary = Rules.data()["shipCombat"][str(tier)]
	var nav: int = Loadout.nav_level_from_xp(Js.num(prof.get("expedition_xp")))
	var seated: Array = Crew.live(db).filter(func(c: Dictionary) -> bool: return c.get("raid_slot") != null)
	seated.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["raid_slot"]) < float(b["raid_slot"]))
	var pw: float = 0.0
	var dg: float = 0.0
	var ft: float = 0.0
	var crew: Array = []
	for c: Dictionary in seated.slice(0, int(hull["crewSlots"])):
		var st: Dictionary = Crew.leveled_stats(c)
		var mult: float = 1.0 if float(c["raid_slot"]) == 0.0 else 0.8
		pw += float(Js.round(float(st["power"]) * mult))
		dg += float(Js.round(float(st["dodge"]) * mult))
		ft += float(Js.round(float(st["fortune"]) * mult))
		var card: Dictionary = Crew.card(float(c["card_id"]))
		var slug: String = str(card.get("slug", "")).to_lower()
		var cls_id: Variant = Js.obj(Crew.t().get("classBySlug")).get(slug)
		var cls: Dictionary = Crew.class_of(slug)
		crew.append({
			"id": c["id"], "slug": slug, "name": c["nickname"] if c.get("nickname") != null else Crew.display_name(slug, str(card.get("name", ""))),
			"filename": Skins.filename_for(prof, slug, str(card.get("filename", ""))), "cls": cls_id,
			"ms": _milestone(cls, Crew.level(Js.num(c.get("xp")))),
		})
	var max_hp: float = float(Js.round(float(hull["durability"]) + nav))
	return {
		"uid": uid, "name": name if name != "" else str(prof.get("username", "Captain")),
		"tier": float(tier), "hp": max_hp, "max": max_hp, "speed": float(hull["speed"]),
		"shipMin": float(hull["minDamage"]), "power": pw + floor(nav / 5.0), "nav": dg + floor(nav / 5.0),
		"fortune": ft + floor(nav / 5.0), "dmgMult": 1.0, "maxCharges": float(MAX_CHARGES),
		"crew": crew, "used": [], "repairKit": prof.get("equipped_repair_kit"),
	}


static func _milestone(cls: Dictionary, lv: int) -> Dictionary:
	var now: Dictionary = {}
	for m: Dictionary in Js.list(cls.get("milestones")):
		if lv >= int(m["unlockLevel"]):
			now = m
	return now


## Fresh per-fight state for a seat (the web remounts a fight: charges,
## statuses and the rest reset; HP carries).
static func _ready_seat(s: Dictionary) -> void:
	s["charges"] = 0.0
	s["statuses"] = {}
	s["last"] = ""
	s["shield"] = 0.0
	s["brace"] = {}
	s["ward"] = {}
	s["vBuff"] = 0.0
	s["sharp"] = {}
	s["dodgeToken"] = 0.0
	s["abilityThisTurn"] = false
	s["sunk"] = s.get("sunk", false) == true


# ══ A raid and its fights ═════════════════════════════════════════════════════

static func raid_def(raid_id: String) -> Dictionary:
	return Js.obj(Js.obj(Rules.data().get("raids")).get(raid_id))


## The fight at round r of a raid: its enemy id, whether it is the boss.
static func fight_at(raid: Dictionary, r: int) -> Dictionary:
	var seq: Array = Js.list(raid.get("sequence"))
	var n: int = seq.size()
	var boss: bool = r % (n + 1) == n
	return { "enemyId": raid["bossId"] if boss else seq[r % (n + 1)], "boss": boss, "of": n + 1 }


## A new battle for a raid and its party (seats from seat_for).
static func begin(raid_id: String, seats: Array) -> Dictionary:
	var raid: Dictionary = raid_def(raid_id)
	var b: Dictionary = { "raidId": raid_id, "round": 0.0, "fight": 0.0, "seats": seats, "turn": 1.0, "state": "plan", "events": [] }
	start_fight(b, 0)
	return b


static func party_hp_mult(n: int) -> float:
	var m: Array = Js.list(Js.obj(cfg().get("party")).get("enemyHpMult"))
	if m.is_empty():
		return 1.0
	return float(m[clampi(n, 1, m.size()) - 1])


static func alive(b: Dictionary) -> Array:
	return (b["seats"] as Array).filter(func(s: Dictionary) -> bool: return not s.get("sunk", false))


static func start_fight(b: Dictionary, r: int) -> void:
	var raid: Dictionary = raid_def(str(b["raidId"]))
	var f: Dictionary = fight_at(raid, r)
	var e: Dictionary = Js.obj(raid["enemies"][f["enemyId"]]).duplicate(true)
	var n: int = maxi(1, alive(b).size())
	var skirmish: bool = raid.get("skirmish", false) == true
	var hp: float = maxf(1.0, float(Js.round(float(e["hpBase"]) * party_hp_mult(n))))
	var acc: float = Js.nz(e.get("accuracy"), Js.nz(raid.get("enemyAccuracy"), 0.0)) + float(e["shipSpeed"])
	b["fight"] = float(r)
	b["enemy"] = {
		"id": e["id"], "name": e["name"], "hp": hp, "max": hp, "min": e["minDmg"], "maxDmg": e["maxDmg"],
		"speed": e["shipSpeed"], "acc": acc, "crit": Js.nz(e.get("critChance"), 0.0), "pattern": e["pattern"],
		"mag": float(maxi(VOLLEY_COST, int(Js.nz(e.get("magazineSize"), 3.0)))), "charges": float(clampi(int(Js.nz(e.get("startCharges"), 0.0)), 0, 99)),
		"idx": 0.0, "statuses": {}, "dodgedLast": false, "feint": 0.0, "shield": float(Js.round(hp * Js.nz(e.get("shieldPct"), 0.0))),
		"snare": {}, "markPierce": 0.0, "boss": f["boss"] and not skirmish, "phase": 1.0,
		"phases": Js.list(Js.nz(e.get("phases"), [e["phase2"]] if e.get("phase2") != null else [])),
		"special": e.get("special"), "ultimate": e.get("ultimate"), "image": e.get("image"), "portrait": e.get("portrait"),
		"check": {}, "action": "", "dodgeRoll": false,
	}
	b["turn"] = 1.0
	b["state"] = "plan"
	for s: Dictionary in b["seats"]:
		_ready_seat(s)
	# A boss's opening mechanic check.
	if b["enemy"]["boss"] and e.get("openingCheck") != null:
		_arm_check(b, e["openingCheck"], [])


# ══ The aim bar's judgment and the damage roll (RaidCombat, expeditions) ═════

const CRIT_W: float = 0.012
const HIT_W: float = 0.06
const GRAZE_W: float = 0.038


## Where the needle stopped against the zone (positions 0..1), as the web
## judges a lock: crit, hit, graze or miss. Inclusive. critW is the live crit
## half-width (a Sharpshot widens it).
static func judge(pos: float, zone: float, crit_w: float = CRIT_W) -> String:
	if absf(pos - zone) <= crit_w:
		return "critical"
	if absf(pos - zone) <= HIT_W:
		return "hit"
	if absf(pos - zone) <= HIT_W + GRAZE_W:
		return "graze"
	return "miss"


## raidDamageProfile + rollShotDamage.
static func roll_shot(res: String, ship_min: float, power: float) -> float:
	var base: float = ship_min + 2.0 + floor(power / 4.0)
	var pmax: float = maxf(ship_min, float(Js.round(base)))
	var hit_min: float = maxf(ship_min, floor(pmax * 0.4))
	var crit_max: float = float(Js.round(pmax * 1.5))
	match res:
		"critical":
			return floor(Dice.next() * (crit_max - 2.0 * ship_min + 1.0)) + 2.0 * ship_min
		"hit":
			return floor(Dice.next() * (pmax - hit_min + 1.0)) + hit_min
		"graze":
			return floor(Dice.next() * maxf(1.0, ceil(pmax * 0.4))) + 1.0
	return 0.0


static func crit_max(ship_min: float, power: float) -> float:
	var pmax: float = maxf(ship_min, float(Js.round(ship_min + 2.0 + floor(power / 4.0))))
	return float(Js.round(pmax * 1.5))


# ══ Statuses (lib/statuses) ═══════════════════════════════════════════════════

static func apply_status(st: Dictionary, id: String, mag: float, turns: float) -> void:
	var cur: Dictionary = Js.obj(st.get(id))
	st[id] = { "mag": maxf(mag, Js.num(cur.get("mag"))), "turns": maxf(turns, Js.num(cur.get("turns"))) }


static func tick_statuses(st: Dictionary) -> void:
	for id: String in st.keys():
		if float(st[id]["turns"]) <= 1.0:
			st.erase(id)
		else:
			st[id]["turns"] = float(st[id]["turns"]) - 1.0


static func mods(st: Dictionary) -> Dictionary:
	var dealt: float = 1.0
	var taken: float = 1.0
	var speed: float = 0.0
	var shield_taken: float = 1.0
	var regen: float = 0.0
	for id: String in st:
		var m: float = float(st[id]["mag"])
		match id:
			"weaken": dealt *= 1.0 - m
			"enrage": dealt *= 1.0 + m
			"feeble", "marked": taken *= 1.0 + m
			"fortify": taken *= 1.0 - m
			"slowed": speed -= m
			"corrode": shield_taken *= 1.0 + m
			"regen": regen += m
	return { "dealt": maxf(0.1, dealt), "taken": maxf(0.1, taken), "speed": speed, "shieldTaken": shield_taken, "regen": regen, "silence": st.has("silence") }


# ══ Planning ══════════════════════════════════════════════════════════════════

## What a seat may do this round (the web's legality rules).
static func legal(b: Dictionary, s: Dictionary) -> Dictionary:
	var c: float = float(s.get("charges", 0.0))
	return {
		"fire": c >= 1.0, "volley": c >= float(VOLLEY_COST), "reload": c < float(s["maxCharges"]),
		"dodge": s.get("last", "") != "dodge",
		"repair": false,
	}


## A crew ability a seat may fire now: not used this raid, one per turn, not
## silenced.
static func ability_ok(b: Dictionary, s: Dictionary, crew_id: Variant) -> String:
	if s.get("sunk", false):
		return "Sunk"
	if s.get("abilityThisTurn", false):
		return "One crew order a turn"
	if Js.list(s["used"]).any(func(x: Variant) -> bool: return float(x) == float(crew_id)):
		return "Already used this raid"
	if mods(s["statuses"])["silence"]:
		return "Silenced"
	return ""


# ══ Crew abilities (RaidCombat fireCrewAbility, CC milestones) ═══════════════
#
# Fired at the start of the round, before anyone acts, in seat order. A heal,
# a shield or a cleanse may be given to ANOTHER ship in the line (target).

static func use_ability(b: Dictionary, si: int, crew_id: Variant, target: int, ev: Array) -> void:
	var s: Dictionary = b["seats"][si]
	if ability_ok(b, s, crew_id) != "":
		return
	var c: Dictionary = {}
	for x: Dictionary in s["crew"]:
		if float(x["id"]) == float(crew_id):
			c = x
	if c.is_empty():
		return
	(s["used"] as Array).append(c["id"])
	s["abilityThisTurn"] = true
	var t: Dictionary = b["seats"][clampi(target, 0, (b["seats"] as Array).size() - 1)]
	if t.get("sunk", false):
		t = s
	var e: Dictionary = b["enemy"]
	var ms: Dictionary = c["ms"]
	var out: Dictionary = { "t": "ability", "seat": si, "crew": c["id"], "cls": c["cls"], "name": c["name"], "target": (b["seats"] as Array).find(t) }
	var flags: Array = []
	match str(c["cls"]):
		"mender":
			var heal: float = float(Js.round(float(t["max"]) * float(ms["pctMaxHp"])))
			out["heal"] = _heal(t, heal)
			if ms.get("cleanseDebuff", false):
				_cleanse(t)
			flags = ["heal"]
		"abyssal_tide":
			out["heal"] = _heal(t, float(Js.round(float(t["max"]) * float(ms["pctMaxHp"]))))
			var sh: float = float(Js.round(float(t["max"]) * float(ms["shieldPctMaxHp"])))
			t["shield"] = float(t["shield"]) + sh
			out["shield"] = sh
			if ms.get("cleanseDebuff", false):
				_cleanse(t)
			flags = ["heal", "shield", "brace"]
		"sharpshot":
			s["sharp"] = { "mult": ms["critZoneMultiplier"], "shots": ms["shotsBuffed"] }
		"snare":
			e["snare"] = { "turns": ms["disableDodgeTurns"], "jam": ms["jamChance"] }
			flags = ["snare"]
		"anchor":
			t["brace"] = { "pct": ms["pctReduction"], "crits": ms.get("absorbsCrits", false) == true }
			flags = ["brace"]
		"navigator":
			var p2: float = Js.nz(ms.get("twoChargeChance"), 0.0)
			var p1: float = float(ms["oneChargeChance"])
			var two: bool = p2 > 0.0 and Dice.next() < p2
			var one: bool = not two and (p1 >= 1.0 or Dice.next() < p1)
			var gain: float = 2.0 if two else (1.0 if one else 0.0)
			s["charges"] = minf(float(s["maxCharges"]), float(s["charges"]) + gain)
			out["charges"] = gain
		"leviathan":
			var big: bool = e["boss"]
			var dmg: float = floor(crit_max(float(s["shipMin"]), float(s["power"])) * float(ms["dmgMult"]))
			dmg = floor(dmg * (1.0 + float(ms["bossBonusPct"])) if big else dmg * (1.0 - float(ms["mobPenaltyPct"])))
			dmg = maxf(1.0, floor(dmg * _ability_mult(b, s)))
			out["dmg"] = _ability_damage(b, dmg)
			flags = ["burst", "snare"]
		"blitz":
			var hits: Array = []
			var hp_sim: float = float(e["hp"])
			for k: int in int(ms["shots"]):
				if hp_sim <= 0.0:
					break
				var frac: float = hp_sim / float(e["max"])
				var d: float = maxf(1.0, floor(roll_shot("hit", float(s["shipMin"]), float(s["power"])) * float(ms["shotDmgMult"]) * (1.0 + float(ms["frenzyMaxPct"]) * (1.0 - frac)) * _ability_mult(b, s)))
				hp_sim -= d
				hits.append(d)
			var tot: float = 0.0
			for d: float in hits:
				tot += _ability_damage(b, d)
			out["hits"] = hits
			out["dmg"] = tot
			flags = ["burst", "snare"]
		"foresight":
			out["reveal"] = predict(b, int(ms["revealMoves"]))
			if Js.nz(ms.get("dodgeRefreshChance"), 0.0) > 0.0 and s.get("last", "") == "dodge" and Dice.next() < float(ms["dodgeRefreshChance"]):
				s["last"] = ""
				out["refresh"] = true
			flags = ["brace", "shield", "snare", "heal", "burst"]
		"vengeance":
			t["ward"] = { "turns": float(VENGEANCE_WARD_TURNS), "heal": ms["healPctMaxHp"], "buff": ms["dmgBuffPct"], "cleanse": ms.get("cleanseDebuff", false) == true }
			flags = ["brace", "shield"]
		"requiem":
			apply_status(e["statuses"], "marked", float(ms["markMag"]), float(ms["markTurns"]))
			if ms.get("pierceShield", false):
				e["markPierce"] = float(ms["markTurns"])
			flags = ["snare", "burst"]
	_note_check(b, flags)
	ev.append(out)
	if float(e["hp"]) <= 0.0:
		_enemy_down(b, ev, true)


static func _heal(t: Dictionary, n: float) -> float:
	var before: float = float(t["hp"])
	t["hp"] = minf(float(t["max"]), before + n)
	return float(t["hp"]) - before


static func _cleanse(t: Dictionary) -> void:
	for id: String in ["weaken", "feeble", "marked", "slowed", "silence", "corrode"]:
		(t["statuses"] as Dictionary).erase(id)


static func _ability_mult(b: Dictionary, s: Dictionary) -> float:
	var raw: float = float(s["dmgMult"]) * (1.0 + float(s["vBuff"])) * float(mods(s["statuses"])["dealt"]) * float(mods(b["enemy"]["statuses"])["taken"])
	return 1.0 + (raw - 1.0) * 0.7


## Ability damage: soaked by the shield (without corrode) unless marked to
## pierce; no dodge, no ward.
static func _ability_damage(b: Dictionary, dmg: float) -> float:
	var e: Dictionary = b["enemy"]
	var to_hull: float = dmg
	if float(e["markPierce"]) <= 0.0 and float(e["shield"]) > 0.0:
		var absorbed: float = minf(float(e["shield"]), dmg)
		e["shield"] = float(e["shield"]) - absorbed
		to_hull = dmg - absorbed
	e["hp"] = maxf(0.0, float(e["hp"]) - to_hull)
	return to_hull


## predictEnemyMoves: the next n slots of its pattern as they stand.
static func predict(b: Dictionary, n: int) -> Array:
	var e: Dictionary = b["enemy"]
	var pat: Array = _pattern(e)
	var out: Array = []
	for k: int in n:
		out.append(pat[(int(e["idx"]) + k) % pat.size()])
	return out


# ══ The enemy's move (pickEnemyAction) ════════════════════════════════════════

static func _pattern(e: Dictionary) -> Array:
	var ph: int = int(e["phase"])
	if ph >= 2:
		return e["phases"][ph - 2]["pattern"]
	return e["pattern"]


static func pick_enemy(b: Dictionary) -> String:
	var e: Dictionary = b["enemy"]
	var pat: Array = _pattern(e)
	var idx: int = int(e["idx"])
	var a: String = pat[idx % pat.size()]
	var ch: float = float(e["charges"])
	if a == "special" and e.get("special") == null:
		a = "reload"
		idx += 1
	elif a == "ultimate" and e.get("ultimate") == null:
		a = "reload"
		idx += 1
	elif a == "ultimate" and ch < float(e["mag"]):
		a = "reload"
	elif (a == "fire" and ch < 1.0) or (a == "volley" and ch < float(VOLLEY_COST)):
		a = "reload"
	elif a == "reload" and ch >= float(e["mag"]):
		idx += 1
		var nxt: String = pat[idx % pat.size()]
		if float(e["feint"]) < 1.0 and not e["dodgedLast"] and nxt != "dodge" and Dice.next() < FEINT_CHANCE:
			a = "dodge"
			e["feint"] = float(e["feint"]) + 1.0
		else:
			a = "fire"
			e["feint"] = 0.0
	else:
		idx += 1
	var sn: Dictionary = e["snare"]
	if a == "dodge" and Js.nz(sn.get("turns"), 0.0) > 0.0 and Dice.next() < float(sn["jam"]):
		a = "fire" if ch >= 1.0 else "reload"
		e["jammed"] = true
	if a == "dodge" and e["dodgedLast"]:
		a = "fire" if ch >= 1.0 else "reload"
	e["dodgedLast"] = a == "dodge"
	e["idx"] = float(idx)
	return a


# ══ Resolving a round ═════════════════════════════════════════════════════════

## plans: one per seat: { action, aim ("critical"/"hit"/"graze"/"miss"),
## ability: { crew, target } or null }. Returns the round's events.
static func resolve(b: Dictionary, plans: Array) -> Array:
	var ev: Array = []
	var e: Dictionary = b["enemy"]
	e["jammed"] = false
	# Crew orders first, in seat order.
	for i: int in plans.size():
		var ab: Variant = Js.obj(plans[i]).get("ability")
		if ab is Dictionary and not b["seats"][i].get("sunk", false):
			use_ability(b, i, ab["crew"], int(Js.nz(ab.get("target"), float(i))), ev)
	if b["state"] != "plan":
		return _finish(b, ev)
	# Each ship's action as it will be taken (an illegal pick falls back), so
	# a dodge stance is read the same whichever side acts first.
	for i: int in plans.size():
		var s0: Dictionary = b["seats"][i]
		if s0.get("sunk", false):
			continue
		var p0: Dictionary = Js.obj(plans[i]).duplicate()
		var lg0: Dictionary = legal(b, s0)
		var act0: String = str(p0.get("action", "reload"))
		if not lg0.get(act0, false):
			act0 = "reload" if lg0["reload"] else ("fire" if lg0["fire"] else "dodge")
			p0["aim"] = "miss"
		p0["action"] = act0
		plans[i] = p0
	var e_act: String = pick_enemy(b)
	e["action"] = e_act
	ev.append({ "t": "intent", "action": e_act, "jammed": e.get("jammed", false) })
	# Initiative.
	var order: Array = []
	for i: int in plans.size():
		var s: Dictionary = b["seats"][i]
		if s.get("sunk", false):
			continue
		var roll: int = d20() + int(maxf(1.0, float(s["speed"]) + float(mods(s["statuses"])["speed"])))
		order.append({ "who": i, "roll": roll })
	var er: int = d20() + int(maxf(1.0, float(e["speed"]) + float(mods(e["statuses"])["speed"])))
	order.append({ "who": -1, "roll": er })
	order.sort_custom(func(x: Dictionary, y: Dictionary) -> bool:
		if x["roll"] != y["roll"]:
			return x["roll"] > y["roll"]
		if (x["who"] == -1) != (y["who"] == -1):
			return x["who"] != -1
		return x["who"] < y["who"])
	ev.append({ "t": "order", "order": order.map(func(o: Dictionary) -> int: return o["who"]) })
	# Round-start snapshots (statuses read as they stood).
	var e_mods: Dictionary = mods(e["statuses"])
	for o: Dictionary in order:
		if float(e["hp"]) <= 0.0 or alive(b).is_empty():
			break
		var who: int = o["who"]
		if who == -1:
			_enemy_act(b, e_act, e_mods, plans, ev)
		else:
			var s2: Dictionary = b["seats"][who]
			if s2.get("sunk", false) or float(s2["hp"]) <= 0.0:
				continue
			_seat_act(b, who, Js.obj(plans[who]), e_act, e_mods, ev)
			if b.get("revived", false):
				b.erase("revived")
				break
	return _finish(b, ev)


static func _seat_act(b: Dictionary, si: int, plan: Dictionary, e_act: String, e_mods: Dictionary, ev: Array) -> void:
	var s: Dictionary = b["seats"][si]
	var e: Dictionary = b["enemy"]
	var act: String = str(plan.get("action", "reload"))
	s["last"] = act
	match act:
		"reload":
			s["charges"] = minf(float(s["maxCharges"]), float(s["charges"]) + 1.0)
			ev.append({ "t": "reload", "seat": si, "charges": s["charges"] })
		"dodge":
			ev.append({ "t": "brace", "seat": si })
		"fire", "volley":
			var cost: float = 1.0 if act == "fire" else float(VOLLEY_COST)
			s["charges"] = float(s["charges"]) - cost
			var res: String = str(plan.get("aim", "miss"))
			var sh: Dictionary = s["sharp"]
			if not sh.is_empty():
				sh["shots"] = float(sh["shots"]) - 1.0
				if float(sh["shots"]) <= 0.0:
					s["sharp"] = {}
			var mult: float = (1.0 if act == "fire" else 2.0) * float(s["dmgMult"]) * (1.0 + float(s["vBuff"])) * float(mods(s["statuses"])["dealt"]) * float(e_mods["taken"])
			var dmg: float = floor(roll_shot(res, float(s["shipMin"]), float(s["power"])) * mult)
			var out: Dictionary = { "t": "shot", "seat": si, "action": act, "aim": res, "raw": dmg }
			# The enemy's dodge stance.
			if e_act == "dodge":
				var def: int = d20() + int(maxf(0.0, float(e["acc"])))
				var atk: int = d20() + int(s["nav"])
				if def >= atk:
					dmg = 0.0
					out["dodged"] = true
				else:
					dmg = maxf(1.0, floor(dmg * 0.3))
					out["partial"] = true
			# The enemy's shield.
			var to_hull: float = dmg
			if dmg > 0.0 and float(e["shield"]) > 0.0 and float(e["markPierce"]) <= 0.0:
				var bite: float = float(Js.round(dmg * float(e_mods["shieldTaken"])))
				var absorbed: float = minf(float(e["shield"]), bite)
				e["shield"] = float(e["shield"]) - absorbed
				to_hull = maxf(0.0, dmg - ceil(absorbed / float(e_mods["shieldTaken"])))
				out["shielded"] = absorbed
			e["hp"] = maxf(0.0, float(e["hp"]) - to_hull)
			out["dmg"] = to_hull
			out["enemyHp"] = e["hp"]
			ev.append(out)
			if float(e["hp"]) <= 0.0:
				_enemy_down(b, ev, false)


static func _enemy_act(b: Dictionary, act: String, e_mods: Dictionary, plans: Array, ev: Array) -> void:
	var e: Dictionary = b["enemy"]
	# A re-price: a ship that stripped its charges earlier this round.
	var cost: float = float(e["mag"]) if act == "ultimate" else (float(VOLLEY_COST) if act == "volley" else (1.0 if act == "fire" else 0.0))
	if float(e["charges"]) < cost:
		act = "reload"
	match act:
		"reload":
			e["charges"] = minf(float(e["mag"]), float(e["charges"]) + 1.0)
			ev.append({ "t": "eReload", "charges": e["charges"] })
		"dodge":
			ev.append({ "t": "eDodge" })
		"special":
			var sp: Dictionary = Js.obj(e.get("special"))
			if sp.get("status") != null:
				if str(sp.get("target", "player")) == "self":
					apply_status(e["statuses"], str(sp["status"]), Js.nz(sp.get("magnitude"), 0.0), Js.nz(sp.get("turns"), 1.0))
				else:
					var tg: int = _target(b, -1)
					if tg >= 0:
						apply_status(b["seats"][tg]["statuses"], str(sp["status"]), Js.nz(sp.get("magnitude"), 0.0), Js.nz(sp.get("turns"), 1.0))
			ev.append({ "t": "eSpecial", "name": sp.get("name", ""), "line": sp.get("line", "") })
		"fire", "volley", "ultimate":
			e["charges"] = maxf(0.0, float(e["charges"]) - cost)
			if broadside(b, act):
				# A BROADSIDE: every ship afloat at once, each its own dodge.
				ev.append({ "t": "eBroadside", "action": act })
				var k0: int = 0
				for i: int in (b["seats"] as Array).size():
					var s3: Dictionary = b["seats"][i]
					if not s3.get("sunk", false) and float(s3["hp"]) > 0.0:
						_enemy_shot(b, act, i, e_mods, plans, ev, k0 == 0, true)
						k0 += 1
			else:
				# Aimed shots (party scaling: a bigger line draws more), each at
				# a different ship it picks as it fires.
				var shots: int = 1
				var sh_tab: Array = Js.list(Js.obj(cfg().get("party")).get("shots"))
				if not sh_tab.is_empty():
					shots = int(sh_tab[clampi((b["seats"] as Array).size(), 1, sh_tab.size()) - 1])
				var focus: bool = Js.obj(cfg().get("party")).get("focus", false) == true
				var hit: Array = []
				for k: int in shots:
					if alive(b).is_empty():
						break
					var ti: int = _target(b, -1) if focus else _target_new(b, hit)
					hit.append(ti)
					_enemy_shot(b, act, ti, e_mods, plans, ev, k == 0)


## Does this attack hit every ship (a boss's volley or ultimate, or the
## volley of an enemy listed as a broadside hand)?
static func broadside(b: Dictionary, act: String) -> bool:
	var bs: Dictionary = Js.obj(cfg().get("broadside"))
	if bs.is_empty():
		return false
	var e: Dictionary = b["enemy"]
	if e["boss"] and Js.list(bs.get("bossActions")).has(act):
		return true
	return act == "volley" and Js.list(bs.get("enemyVolleys")).has(e["id"])


## A target not yet shot at this round if any is left, else any ship afloat.
static func _target_new(b: Dictionary, hit: Array) -> int:
	var pool: Array = []
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if not s.get("sunk", false) and float(s["hp"]) > 0.0 and not hit.has(i):
			pool.append(i)
	if pool.is_empty():
		return _target(b, -1)
	return pool[int(floor(Dice.next() * pool.size()))]


## Its target: a ship still afloat, at random (never shown before it fires);
## `not_i` is passed over when another ship is left.
static func _target(b: Dictionary, not_i: int) -> int:
	var pool: Array = []
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if not s.get("sunk", false) and float(s["hp"]) > 0.0 and i != not_i:
			pool.append(i)
	if pool.is_empty():
		return not_i
	return pool[int(floor(Dice.next() * pool.size()))]


static func _enemy_shot(b: Dictionary, act: String, ti: int, e_mods: Dictionary, plans: Array, ev: Array, main: bool, all: bool = false) -> void:
	if ti < 0:
		return
	var e: Dictionary = b["enemy"]
	var t: Dictionary = b["seats"][ti]
	var base: float = float(rand_int(int(e["min"]), int(e["maxDmg"])))
	var dmg: float
	if act == "ultimate":
		dmg = maxf(1.0, floor(base * Js.nz(Js.obj(e.get("ultimate")).get("mult"), 2.6)))
	else:
		dmg = base * (2.0 if act == "volley" else 1.0)
	if float(e_mods["dealt"]) != 1.0:
		dmg = maxf(1.0, floor(dmg * float(e_mods["dealt"])))
	if int(e["phase"]) >= 2:
		dmg = maxf(1.0, floor(dmg * float(e["phases"][int(e["phase"]) - 2].get("damageMult", 1.0))))
	var eff_crit: float = 0.0 if act == "ultimate" else float(e["crit"])
	var crit: bool = Dice.next() < eff_crit
	if crit:
		dmg = floor(dmg * 1.5)
	var out: Dictionary = { "t": "eShot", "action": act, "target": ti, "crit": crit, "extra": not main, "all": all }
	# The target's dodge stance.
	if str(Js.obj(plans[ti]).get("action", "")) == "dodge":
		if float(t["dodgeToken"]) > 0.0:
			t["dodgeToken"] = float(t["dodgeToken"]) - 1.0
			dmg = 0.0
			out["dodged"] = true
		else:
			var def: int = d20() + int(t["nav"])
			var atk: int = d20() + int(maxf(0.0, float(e["acc"])))
			if def >= atk:
				dmg = 0.0
				out["dodged"] = true
			else:
				dmg = maxf(1.0, floor(dmg * 0.3))
				out["partial"] = true
	if dmg > 0.0:
		var taken: float = float(mods(t["statuses"])["taken"])
		if taken != 1.0:
			dmg = maxf(1.0, floor(dmg * taken))
		var br: Dictionary = t["brace"]
		if not br.is_empty() and (not crit or br.get("crits", false)):
			dmg = maxf(1.0, float(Js.round(dmg * (1.0 - float(br["pct"])))))
			t["brace"] = {}
			out["braced"] = true
		if float(t["shield"]) > 0.0:
			var soaked: float = minf(float(t["shield"]), dmg)
			t["shield"] = float(t["shield"]) - soaked
			dmg -= soaked
			out["shielded"] = soaked
		t["hp"] = maxf(0.0, float(t["hp"]) - dmg)
	out["dmg"] = dmg
	out["hp"] = t["hp"]
	ev.append(out)


## The enemy at 0: a phase left revives it (the round ends); else it is sunk.
static func _enemy_down(b: Dictionary, ev: Array, by_ability: bool) -> void:
	var e: Dictionary = b["enemy"]
	var ph: int = int(e["phase"])
	if ph - 1 < (e["phases"] as Array).size():
		var nc: Dictionary = e["phases"][ph - 1]
		e["phase"] = float(ph + 1)
		e["idx"] = 0.0
		e["feint"] = 0.0
		e["hp"] = maxf(1.0, floor(float(e["max"]) * float(nc["revivePct"])))
		if by_ability:
			e["shield"] = float(Js.round(float(e["max"]) * Js.nz(nc.get("shieldPct"), 0.0)))
		ev.append({ "t": "phase", "phase": e["phase"], "line": nc.get("dialogueLine", ""), "hp": e["hp"] })
		if nc.get("check") != null:
			_arm_check(b, nc["check"], ev)
		b["revived"] = true
		return
	ev.append({ "t": "sunkEnemy" })


# ══ Mechanic checks (BossMechanicCheck) ═══════════════════════════════════════

static func _arm_check(b: Dictionary, check: Dictionary, ev: Array) -> void:
	b["enemy"]["check"] = { "def": check, "left": check["chargeTurns"], "armed": true, "flags": [] }
	ev.append({ "t": "checkArm", "name": check.get("name", ""), "telegraph": check.get("telegraph", ""), "turns": check["chargeTurns"] })


static func _note_check(b: Dictionary, flags: Array) -> void:
	var ck: Dictionary = b["enemy"]["check"]
	if ck.is_empty():
		return
	for f: Variant in flags:
		if not (ck["flags"] as Array).has(f):
			(ck["flags"] as Array).append(f)


static func _check_met(b: Dictionary) -> bool:
	var ck: Dictionary = b["enemy"]["check"]
	var fl: Array = ck["flags"]
	for r: Variant in ck["def"]["responses"]:
		if fl.has(r):
			return true
		for s: Dictionary in alive(b):
			if r == "brace" and not (s["brace"] as Dictionary).is_empty():
				return true
			if r == "shield" and float(s["shield"]) > 0.0:
				return true
		if r == "snare" and Js.nz(Js.obj(b["enemy"]["snare"]).get("turns"), 0.0) != 0.0:
			return true
	return false


## The check's consequence lands on every ship afloat (the whole line felt it).
static func _check_fail(b: Dictionary, ev: Array) -> void:
	var e: Dictionary = b["enemy"]
	var c: Dictionary = e["check"]["def"]["consequence"]
	for s: Dictionary in alive(b):
		match str(c["kind"]):
			"damagePctMaxHp":
				s["hp"] = maxf(0.0, float(s["hp"]) - maxf(1.0, float(Js.round(float(s["max"]) * float(c["value"])))))
			"status":
				apply_status(s["statuses"], str(c["status"]), float(c["magnitude"]), float(c["turns"]))
				if c.get("dmgPct") != null:
					s["hp"] = maxf(0.0, float(s["hp"]) - maxf(1.0, float(Js.round(float(s["max"]) * float(c["dmgPct"])))))
	if str(c["kind"]) == "enemyHealPctMaxHp":
		e["hp"] = minf(float(e["max"]), float(e["hp"]) + maxf(1.0, float(Js.round(float(e["max"]) * float(c["value"])))))
	ev.append({ "t": "checkFail", "line": e["check"]["def"].get("failLine", "") })
	e["check"] = {}


# ══ The round's end ═══════════════════════════════════════════════════════════

static func _finish(b: Dictionary, ev: Array) -> Array:
	var e: Dictionary = b["enemy"]
	# Deaths, and the Vengeance ward's cheat.
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if s.get("sunk", false) or float(s["hp"]) > 0.0:
			continue
		var w: Dictionary = s["ward"]
		if not w.is_empty() and float(w["turns"]) > 0.0:
			s["hp"] = maxf(1.0, float(Js.round(float(s["max"]) * float(w["heal"]))))
			s["vBuff"] = w["buff"]
			if w.get("cleanse", false):
				_cleanse(s)
			s["ward"] = {}
			ev.append({ "t": "cheat", "seat": i, "hp": s["hp"] })
		else:
			s["sunk"] = true
			ev.append({ "t": "sunk", "seat": i })
	if alive(b).is_empty():
		b["state"] = "lost"
		ev.append({ "t": "lost" })
		return ev
	if float(e["hp"]) <= 0.0:
		b["state"] = "won"
		ev.append({ "t": "won" })
		return ev
	b["turn"] = float(b["turn"]) + 1.0
	# The mechanic check's countdown.
	var ck: Dictionary = e["check"]
	if not ck.is_empty():
		if ck["armed"]:
			ck["armed"] = false
		elif _check_met(b):
			ev.append({ "t": "checkMet", "line": ck["def"].get("counteredLine", "") })
			e["check"] = {}
		else:
			ck["left"] = float(ck["left"]) - 1.0
			if float(ck["left"]) <= 0.0:
				_check_fail(b, ev)
	# The turn's change: orders, snare, regen, statuses, wards.
	var sn: Dictionary = e["snare"]
	if Js.nz(sn.get("turns"), 0.0) > 0.0:
		sn["turns"] = float(sn["turns"]) - 1.0
	for s: Dictionary in b["seats"]:
		s["abilityThisTurn"] = false
		if s.get("sunk", false):
			continue
		var rg: float = float(mods(s["statuses"])["regen"])
		if rg > 0.0:
			_heal(s, rg)
		tick_statuses(s["statuses"])
		var w2: Dictionary = s["ward"]
		if not w2.is_empty():
			w2["turns"] = float(w2["turns"]) - 1.0
			if float(w2["turns"]) <= 1.0:
				s["ward"] = {}
	var erg: float = float(mods(e["statuses"])["regen"])
	if erg > 0.0:
		e["hp"] = minf(float(e["max"]), float(e["hp"]) + erg)
	tick_statuses(e["statuses"])
	if float(e["markPierce"]) > 0.0:
		e["markPierce"] = float(e["markPierce"]) - 1.0
	ev.append({ "t": "end", "turn": b["turn"] })
	return ev


# ══ Between fights ═════════════════════════════════════════════════════════════

## After a fight is won: the next one (HP carries), or the raid is done. A
## Rest Stop refreshes crew orders once, halfway through a long raid.
static func next_fight(b: Dictionary) -> Dictionary:
	var raid: Dictionary = raid_def(str(b["raidId"]))
	var n: int = Js.list(raid.get("sequence")).size()
	var r: int = int(b["fight"]) + 1
	if r > n:
		b["state"] = "done"
		return { "done": true }
	var rest: bool = n >= 4 and r == int(floor(n / 2.0)) and not b.get("rested", false)
	if rest:
		b["rested"] = true
		for s: Dictionary in b["seats"]:
			s["used"] = []
	start_fight(b, r)
	return { "done": false, "rest": rest, "boss": fight_at(raid, r)["boss"] }
