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
## THE ENEMIES' OWN WAYS (lib/bossRaids, lib/raidAffixes): affixes (baked on a
## named hand, or rolled onto two elites a challenge run), armour (Carapace),
## the riposte, the shark's bite on your balls, aim afflictions (the zone's
## speed, a drifting crit seam, fog, a false court of decoys, iron shutters, a
## squall), the flare barrage, a boss's off-turn abilities, the vengeance ward
## and foresight, the Last Wall. Burn and freeze on a ship. TIDES between
## fights and the Throne's reprieve, each captain choosing their own.
##
## RAID ITEMS (lib/raidItems effects, as RaidCombat reads them): each
## captain's equipped items become their ship's fx (products, sums or the best
## of each type), and the Quartermaster repossesses one for a fight. The War
## Drum family's once-a-raid rally is a free action (use_drum).
##
## THE MEGA (a Man-o-War's ultimate, lib/shipAugments): a full magazine of four
## (the Rack's fourth ball) for megaMult: the Railgun pierces shields and a
## clean dodge only grazes it; the Barrage's four blows each roll the on-hit
## gear; the Nuke leaves the wreck burning. It alone breaks the Last Wall.
## FLEE (the web's riskyFlee): a d20 plus the hull's speed against 10 plus the
## enemy's (and 3 more for a boss); a natural 20 always gets away, a natural 1
## never; a miss takes a parting shot. A ship that gets away is out of the
## fight, and (alone) out of the raid with what it earned so far.
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
	# The chapters' class picks (raidLoadout): hull, speed and damage.
	var cls_fx: Dictionary = Campaign.class_effects(prof.get("ship_classes"))
	# The raid items on the hull (the loadout's cap, and the finale's mount).
	var items: Array = Armory.live_items(prof)
	var fx: Dictionary = item_fx(items)
	# Navigation Renown: Might (damage) and Bulwark (hull).
	var ren: Dictionary = Js.obj(prof.get("nav_renown_alloc"))
	var might: float = maxf(0.0, floor(Js.num(ren.get("might"))))
	var bulwark: float = maxf(0.0, floor(Js.num(ren.get("bulwark"))))
	var max_hp: float = float(Js.round((float(hull["durability"]) + nav + 3.0 * bulwark) * float(fx["maxHp"]) * float(cls_fx["hpMult"])))
	return {
		"uid": uid, "name": name if name != "" else str(prof.get("username", "Captain")),
		"tier": float(tier), "hp": max_hp, "max": max_hp, "speed": maxf(0.0, float(hull["speed"]) + float(cls_fx["speedFlat"])),
		"shipMin": float(hull["minDamage"]), "power": pw + floor(nav / 5.0), "nav": dg + floor(nav / 5.0),
		"fortune": ft + floor(nav / 5.0), "dmgMult": float(cls_fx["damageMult"]) * (1.0 + 0.005 * might),
		"maxCharges": float(MAX_CHARGES + (1 if Armory.has_rack(prof) else 0)), "mega": Armory.mega_of(prof),
		"crew": crew, "used": [], "repairKit": prof.get("equipped_repair_kit"),
		"items": items, "fx": fx, "saves": float(fx["lethalSave"]), "drum": false,
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
	s["burn"] = {}
	s["freeze"] = 0.0
	s["frozenNow"] = false
	s["afflict"] = {}
	s["shots"] = 0.0
	s["critRamp"] = 0.0
	s["firstBlow"] = false
	s["cheated"] = false
	s["anchorUsed"] = false
	s["sunk"] = s.get("sunk", false) == true
	if s.has("items"):
		s["live"] = (s["items"] as Array).duplicate()
		s["fx"] = item_fx(s["live"])
	if not s.has("tfx"):
		s["tfx"] = []


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
	var seq_n: int = Js.list(raid.get("sequence")).size()
	# A challenge run: two of its fights are elites, each with a rolled affix;
	# the Quartermaster's merges a second onto every baked one.
	b["elites"] = {}
	b["bonusAffix"] = {}
	if raid_id.ends_with("_challenge"):
		var pool: Array = range(seq_n)
		var picks: Array = []
		for k: int in mini(2, seq_n):
			picks.append(pool.pop_at(int(floor(Dice.next() * pool.size()))))
		picks.sort()
		for slot: int in picks:
			b["elites"][str(slot)] = _roll_affix()
		if raid.get("mergeRandomAffix") == true:
			var seq: Array = Js.list(raid.get("sequence"))
			for i: int in seq.size():
				var baked: Variant = Js.obj(raid["enemies"][seq[i]]).get("affix")
				if baked != null:
					var second: String = _roll_affix()
					for g: int in 8:
						if second != baked:
							break
						second = _roll_affix()
					b["bonusAffix"][str(i)] = second
	# The run's tides, drawn at the start (drawTides).
	var td: Dictionary = Js.obj(raid.get("tides"))
	b["tides"] = draw_tides(Js.list(td.get("slots")).size(), int(Js.nz(td.get("maxTier"), 1.0))) if not td.is_empty() else []
	b["tideFired"] = []
	start_fight(b, 0)
	return b


static func _affixes() -> Dictionary:
	return Js.obj(Js.obj(Rules.data().get("raidAffixes")).get("affixes"))


static func _roll_affix() -> String:
	var all: Array = Js.list(Js.obj(Rules.data().get("raidAffixes")).get("all"))
	return str(all[int(floor(Dice.next() * all.size()))])


static func party_hp_mult(n: int) -> float:
	var m: Array = Js.list(Js.obj(cfg().get("party")).get("enemyHpMult"))
	if m.is_empty():
		return 1.0
	return float(m[clampi(n, 1, m.size()) - 1])


static func alive(b: Dictionary) -> Array:
	return (b["seats"] as Array).filter(func(s: Dictionary) -> bool: return not s.get("sunk", false) and not s.get("fled", false))


static func start_fight(b: Dictionary, r: int) -> void:
	var raid: Dictionary = raid_def(str(b["raidId"]))
	var f: Dictionary = fight_at(raid, r)
	var e: Dictionary = Js.obj(raid["enemies"][f["enemyId"]]).duplicate(true)
	var n: int = maxi(1, alive(b).size())
	var skirmish: bool = raid.get("skirmish", false) == true
	# Its affix: a baked one (with a challenge's merged second), else a rolled
	# elite's (which also hardens it: HP x1.5, damage x1.25).
	var seq_n: int = Js.list(raid.get("sequence")).size()
	var slot: String = str(r % (seq_n + 1))
	var affix: Dictionary = {}
	var elite: bool = false
	if e.get("affix") != null:
		affix = Js.obj(_affixes().get(e["affix"])).duplicate()
		var bonus: Variant = Js.obj(b.get("bonusAffix")).get(slot)
		if bonus != null:
			var bd: Dictionary = Js.obj(_affixes().get(bonus))
			var nm: String = "%s + %s" % [affix.get("name", ""), bd.get("name", "")]
			affix.merge(bd, true)
			affix["name"] = nm
	elif not f["boss"] and Js.obj(b.get("elites")).has(slot):
		affix = Js.obj(_affixes().get(b["elites"][slot])).duplicate()
		elite = true
		var ra: Dictionary = Js.obj(Rules.data().get("raidAffixes"))
		e["hpBase"] = float(Js.round(float(e["hpBase"]) * float(Js.nz(ra.get("eliteHp"), 1.5))))
		e["minDmg"] = maxf(1.0, float(Js.round(float(e["minDmg"]) * float(Js.nz(ra.get("eliteDmg"), 1.25)))))
		e["maxDmg"] = maxf(1.0, float(Js.round(float(e["maxDmg"]) * float(Js.nz(ra.get("eliteDmg"), 1.25)))))
	# The tides the line took that shrink the next enemy.
	var hp_scale: float = 1.0
	for s0: Dictionary in b["seats"]:
		hp_scale *= float(tide_agg(s0)["enemyHpScale"])
	var hp: float = maxf(1.0, float(Js.round(float(e["hpBase"]) * party_hp_mult(n) * hp_scale)))
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
		"affix": affix, "elite": elite, "dr": Js.nz(e.get("damageReduction"), 0.0), "drName": e.get("abilityName", "Carapace"),
		"parry": Js.nz(e.get("parryChance"), 0.0), "parryPct": Js.nz(e.get("parryDamagePct"), 0.0), "parryName": e.get("parryName", "Riposte"),
		"bite": Js.nz(e.get("chargeBiteChance"), 0.0), "decoy": Js.nz(e.get("decoyCount"), 0.0), "decoyName": e.get("decoyName", "Flare Barrage"),
		"flareDmg": Js.nz(e.get("flareDmgMult"), 1.0), "flareFuse": Js.nz(e.get("flareFuseMult"), 1.0),
		"zoneMult": Js.nz(e.get("zoneSpeedMult"), 1.0), "aimSpeed": Js.nz(e.get("aimSpeedMult"), 1.0), "critDrift": Js.nz(e.get("critDrift"), 0.0),
		"fog": Js.nz(e.get("aimFogDensity"), 0.0), "fogName": e.get("aimFogName", ""), "critDriftName": e.get("critDriftName", ""),
		"phaseAbility": e.get("phaseAbility"), "abTurn": 0.0, "abOn": 0.0, "abUsed": false,
		"foresight": 0.0, "ward": 0.0, "wardBuff": 0.0, "aegis": {}, "frozenNow": false, "burn": {}, "freeze": 0.0,
		"repossess": e.get("repossess") == true, "repossessName": e.get("repossessName", "Repossession"),
	}
	# The opening barrier: its own, or a Warded affix's, whichever is bigger.
	var sp: float = maxf(Js.nz(e.get("shieldPct"), 0.0), Js.nz(affix.get("shieldPctMaxHp"), 0.0))
	b["enemy"]["shield"] = float(Js.round(hp * sp))
	b["enemy"]["shieldMax"] = b["enemy"]["shield"]
	b["turn"] = 1.0
	b["state"] = "plan"
	b.erase("flares")
	for s: Dictionary in b["seats"]:
		_ready_seat(s)
		if s.get("sunk", false):
			continue
		# The tides the captain took: the fight's opening HP and balls, and
		# their banked sure dodges.
		var ta: Dictionary = tide_agg(s, f["boss"])
		var mx: float = float(s["max"])
		var hp1: float = float(s["hp"]) + float(Js.round(float(ta["startHpPct"]) * mx)) + float(Js.round(float(ta["startHealPct"]) * mx))
		s["hp"] = clampf(hp1, 1.0, mx)
		# The Quartermaster takes back one item he sold you, for this fight.
		if e.get("repossess") == true and not Js.list(s.get("live")).is_empty():
			var live: Array = s["live"]
			var edge: Array = live.filter(func(id: Variant) -> bool:
				return item_fx([id])["offensive"])
			var pool: Array = edge if not edge.is_empty() else live
			var taken: Variant = pool[int(floor(Dice.next() * pool.size()))]
			live.erase(taken)
			s["fx"] = item_fx(live)
			s["repossessed"] = taken
		else:
			s.erase("repossessed")
		var fx: Dictionary = Js.obj(s.get("fx"))
		# The primers: a chance to open with a ball chambered (best of), and
		# the extra opener on its own roll.
		var primed: float = 0.0
		if float(fx.get("startCharge", 0.0)) > 0.0 and Dice.next() < float(fx["startCharge"]):
			primed += 1.0
		if float(fx.get("extraStart", 0.0)) > 0.0 and Dice.next() < float(fx["extraStart"]):
			primed += 1.0
		s["charges"] = clampf(primed + float(ta["startCharges"]), 0.0, float(s["maxCharges"]))
		s["dodgeToken"] = float(ta["guaranteedDodge"])
		# The palisade: a ward over the hull every fight.
		s["wardMax"] = float(Js.round(float(fx.get("wardPct", 0.0)) * mx))
		s["wardRefill"] = float(Js.round(float(s["wardMax"]) * float(fx.get("wardRefill", 0.0))))
		if float(s["wardMax"]) > 0.0:
			s["shield"] = float(s["wardMax"])
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


## What a captain's aim bar does this pass (RaidCombat's aim set-up): the
## zone's speed stack (the enemy, an affix, capped at 4), the needle's speed,
## a drifting crit seam, the fog over the bar, the crit band (a tide), and an
## affliction the enemy laid on this ship (a false court of decoys, iron
## shutters that take a first knock, a squall), which spends one pass.
static func aim_for(b: Dictionary, si: int) -> Dictionary:
	var e: Dictionary = b["enemy"]
	var s: Dictionary = b["seats"][si]
	var stack: float = minf(4.0, float(e["zoneMult"]) * float(Js.nz(Js.obj(e["affix"]).get("zoneSpeedMult"), 1.0)))
	var out: Dictionary = {
		"enemySpeed": float(e["speed"]), "zoneStack": stack, "needleMult": float(e["aimSpeed"]),
		"critDrift": float(e["critDrift"]), "fog": minf(0.92, float(e["fog"])), "critZone": float(tide_agg(s)["critZone"]),
		"afflict": "", "decoys": 0,
	}
	var af: Dictionary = s["afflict"]
	if not af.is_empty() and float(af["passes"]) > 0.0:
		out["afflict"] = af["kind"]
		if af["kind"] == "decoys":
			out["decoys"] = 2
		af["passes"] = float(af["passes"]) - 1.0
		if float(af["passes"]) <= 0.0:
			s["afflict"] = {}
	return out


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
	var mg: Dictionary = Js.obj(s.get("mega"))
	return {
		"fire": c >= 1.0, "volley": c >= float(VOLLEY_COST), "reload": c < float(s["maxCharges"]),
		"mega": not mg.is_empty() and c >= float(Armory.aug()["megaCost"]),
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
			t["burn"] = {}
			if ms.get("cleanseDebuff", false):
				_cleanse(t)
			flags = ["heal"]
		"abyssal_tide":
			out["heal"] = _heal(t, float(Js.round(float(t["max"]) * float(ms["pctMaxHp"]))))
			t["burn"] = {}
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
	if not (e["aegis"] as Dictionary).is_empty():
		_aegis_hit(b, 1.0, [])
		return 0.0
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
	# Freezes that were waiting take hold this round; burns tick.
	e["frozenNow"] = float(e.get("freeze", 0.0)) > 0.0
	if e["frozenNow"]:
		e["freeze"] = float(e["freeze"]) - 1.0
	var eb: Dictionary = e.get("burn", {})
	if not eb.is_empty() and float(e["hp"]) > 0.0 and (e["aegis"] as Dictionary).is_empty():
		e["hp"] = _ward_floor(b, float(e["hp"]) - float(eb["dmg"]), ev)
		ev.append({ "t": "eBurn", "dmg": eb["dmg"], "hp": e["hp"] })
		eb["turns"] = float(eb["turns"]) - 1.0
		if float(eb["turns"]) <= 0.0:
			e["burn"] = {}
		if float(e["hp"]) <= 0.0:
			_enemy_down(b, ev, false)
			if b.get("revived", false):
				b.erase("revived")
			return _finish(b, ev)
	for i: int in (b["seats"] as Array).size():
		var sf: Dictionary = b["seats"][i]
		sf["frozenNow"] = float(sf.get("freeze", 0.0)) > 0.0 and not sf.get("sunk", false)
		if sf["frozenNow"]:
			sf["freeze"] = 0.0
		var bn: Dictionary = sf.get("burn", {})
		if not bn.is_empty() and not sf.get("sunk", false):
			sf["hp"] = maxf(0.0, float(sf["hp"]) - float(bn["dmg"]))
			ev.append({ "t": "burn", "seat": i, "dmg": bn["dmg"], "hp": sf["hp"] })
			bn["turns"] = float(bn["turns"]) - 1.0
			if float(bn["turns"]) <= 0.0:
				sf["burn"] = {}
	# Initiative.
	var order: Array = []
	for i: int in plans.size():
		var s: Dictionary = b["seats"][i]
		if s.get("sunk", false):
			continue
		var roll: int = d20() + int(maxf(1.0, float(s["speed"]) + float(tide_agg(s)["speed"]) + float(mods(s["statuses"])["speed"]))) + int(floor(float(s["nav"]) * float(Js.obj(s.get("fx")).get("navSpeed", 0.0))))
		order.append({ "who": i, "roll": roll })
	var er: int = d20() + int(maxf(1.0, float(e["speed"]) + float(mods(e["statuses"])["speed"]))) + int(Js.nz(Js.obj(e["affix"]).get("speedBonus"), 0.0))
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
			if s2.get("frozenNow", false):
				s2["last"] = ""
				ev.append({ "t": "frozen", "seat": who })
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
			var ta: Dictionary = tide_agg(s)
			var extra: float = float(ta["reloadBonus"]) if float(ta["reloadChance"]) > 0.0 and Dice.next() < float(ta["reloadChance"]) else 0.0
			var fxr: Dictionary = Js.obj(s.get("fx"))
			if float(fxr.get("reloadCharge", 0.0)) > 0.0 and Dice.next() < float(fxr["reloadCharge"]):
				extra += 1.0
			s["charges"] = minf(float(s["maxCharges"]), float(s["charges"]) + 1.0 + extra)
			# The palisade braces back on a reload, never past its opening size.
			if float(s.get("wardRefill", 0.0)) > 0.0:
				s["shield"] = float(s["shield"]) + minf(float(s["wardRefill"]), maxf(0.0, float(s["wardMax"]) - float(s["shield"])))
			ev.append({ "t": "reload", "seat": si, "charges": s["charges"], "extra": extra })
		"dodge":
			ev.append({ "t": "brace", "seat": si })
		"fire", "volley", "mega":
			var mega: Dictionary = Js.obj(s.get("mega")) if act == "mega" else {}
			var cost: float = 1.0 if act == "fire" else (float(VOLLEY_COST) if act == "volley" else float(Armory.aug()["megaCost"]))
			var res: String = str(plan.get("aim", "miss"))
			# A crit may cost nothing (the Primeval Maw).
			var refund: float = float(Js.obj(s.get("fx")).get("critRefund", 0.0))
			if res == "critical" and refund > 0.0 and Dice.next() < refund:
				ev.append({ "t": "refund", "seat": si })
			else:
				s["charges"] = float(s["charges"]) - cost
			# Locked on a decoy: the shot never leaves, and the gun bites back.
			if res == "fumble":
				var chip: float = maxf(float(e["min"]), float(Js.round(float(s["max"]) * 0.06)))
				s["hp"] = maxf(1.0, float(s["hp"]) - chip)
				ev.append({ "t": "fumble", "seat": si, "chip": chip, "hp": s["hp"] })
				return
			var ta2: Dictionary = tide_agg(s, e["boss"])
			var fx: Dictionary = Js.obj(s.get("fx"))
			s["shots"] = float(s.get("shots", 0.0)) + 1.0
			# A hit may still come up a crit (a tide's chance, a crow's nest).
			var up: float = float(ta2["critBonus"]) + float(fx.get("critUpgrade", 0.0))
			if res == "hit" and up > 0.0 and Dice.next() < up:
				res = "critical"
			var sh: Dictionary = s["sharp"]
			if not sh.is_empty():
				sh["shots"] = float(sh["shots"]) - 1.0
				if float(sh["shots"]) <= 0.0:
					s["sharp"] = {}
			var tmult: float = float(ta2["dmgMult"]) * (float(ta2["fireMult"]) if act == "fire" else (float(ta2["volleyMult"]) if act == "volley" else 1.0))
			if e["boss"]:
				tmult *= float(ta2["bossMult"]) * (float(ta2["bossVolMult"]) if act != "fire" else 1.0)
			tmult *= float(fx.get("fireMult", 1.0)) if act == "fire" else (float(fx.get("volleyMult", 1.0)) if act == "volley" else float(fx.get("megaMult", 1.0)))
			var crit_shot: bool = res == "critical"
			var imult: float = float(fx.get("bossMult", 1.0)) if e["boss"] else float(fx.get("nonbossMult", 1.0))
			imult *= float(fx.get("critMult", 1.0)) if crit_shot else float(fx.get("noncritMult", 1.0))
			imult *= 1.0 + minf(1.0, float(fx.get("ramp", 0.0)) * (maxf(0.0, float(b["turn"]) - 1.0) + float(s.get("critRamp", 0.0))))
			if float(s["shots"]) == 1.0:
				imult *= float(fx.get("firstShot", 1.0))
			if not (e["statuses"] as Dictionary).is_empty() or not Js.obj(e.get("burn")).is_empty() or e.get("frozenNow", false):
				imult *= float(fx.get("afflicted", 1.0))
			if s.get("cheated", false) and (e.get("elite", false) or not (e["affix"] as Dictionary).is_empty()):
				imult *= float(fx.get("avengeElite", 1.0))
			var base_mult: float = 1.0 if act == "fire" else (2.0 if act == "volley" else float(Js.nz(mega.get("megaMult"), 2.6)))
			var mult: float = base_mult * float(s["dmgMult"]) * (1.0 + float(s["vBuff"])) * float(mods(s["statuses"])["dealt"]) * float(e_mods["taken"]) * tmult * imult
			var dmg: float = floor(roll_shot(res, float(s["shipMin"]), float(s["power"])) * mult)
			var out: Dictionary = { "t": "shot", "seat": si, "action": act, "aim": res, "raw": dmg, "mega": mega.get("id") }
			var af: Dictionary = e["affix"]
			# Carapace: armour takes a slice off a single shot (not a volley).
			if float(e["dr"]) > 0.0 and dmg > 0.0 and act == "fire":
				dmg = maxf(1.0, float(Js.round(dmg * (1.0 - float(e["dr"])))))
				out["armour"] = e["drName"]
			# Ironclad: sometimes soaks a third.
			if af.has("damageTakenMult") and dmg > 0.0 and Dice.next() < float(Js.nz(af.get("damageTakenChance"), 1.0)):
				dmg = maxf(1.0, float(Js.round(dmg * float(af["damageTakenMult"]))))
				out["ironclad"] = true
			# A phase that shrugs some blows off.
			var ph: Dictionary = _phase(e)
			if ph.get("damageTakenMult") != null and dmg > 0.0 and not (ph.get("damageTakenVolleyBypass") == true and act == "volley") and Dice.next() < float(Js.nz(ph.get("damageTakenChance"), 1.0)):
				dmg = maxf(1.0, float(Js.round(dmg * float(ph["damageTakenMult"]))))
			var walled: bool = not (e["aegis"] as Dictionary).is_empty()
			# Only a Mega breaks the Last Wall, and its blow comes through.
			if walled and act == "mega":
				e["aegis"] = {}
				walled = false
				ev.append({ "t": "aegisBreak", "name": "The Last Wall" })
			# The Railgun cannot be slipped: a clean dodge only grazes it.
			if e_act == "dodge" and not walled and not e.get("frozenNow", false) and mega.get("pierce", false):
				var def2: int = d20() + int(maxf(0.0, float(e["acc"])))
				var atk2: int = d20() + int(s["nav"])
				if def2 >= atk2:
					dmg = maxf(1.0, floor(dmg * float(Armory.aug()["railgunGraze"])))
					out["grazed"] = true
			# The enemy's dodge stance (not behind the Last Wall, not frozen).
			elif e_act == "dodge" and not walled and not e.get("frozenNow", false):
				var dodged: bool
				if float(e["foresight"]) > 0.0:
					dodged = true
					out["foresight"] = true
				else:
					var def: int = d20() + int(maxf(0.0, float(e["acc"])))
					var atk: int = d20() + int(s["nav"])
					dodged = def >= atk
					if dodged and float(fx.get("dodgePierce", 0.0)) > 0.0 and Dice.next() < float(fx["dodgePierce"]):
						dodged = false
						out["pierced"] = true
						if fx.get("pierceCrit", false) and not crit_shot:
							dmg = floor(roll_shot("critical", float(s["shipMin"]), float(s["power"])) * mult)
							crit_shot = true
							out["aim"] = "critical"
				if dodged:
					var would: float = dmg
					dmg = 0.0
					out["dodged"] = true
					# The riposte: a parry that cuts back, or the Riposte affix.
					if float(e["parry"]) > 0.0 and Dice.next() < float(e["parry"]):
						var cut: float = maxf(1.0, floor(float(rand_int(int(e["min"]), int(e["maxDmg"]))) * float(e["parryPct"])))
						_hit_seat(b, si, cut, ev, "parry", str(e["parryName"]))
					elif af.has("riposteReflectPct") and would > 0.0:
						_hit_seat(b, si, maxf(1.0, float(Js.round(would * float(af["riposteReflectPct"])))), ev, "parry", "Riposte")
				elif not out.get("pierced", false):
					dmg = maxf(1.0, floor(dmg * 0.3))
					out["partial"] = true
			# The Last Wall: nothing through; each blow cracks it (a volley twice).
			if walled and not out.get("dodged", false):
				out["walled"] = true
				out["dmg"] = 0.0
				out["enemyHp"] = e["hp"]
				ev.append(out)
				_aegis_hit(b, 2.0 if act == "volley" else 1.0, ev)
				return
			# The enemy's shield.
			var to_hull: float = dmg
			if dmg > 0.0 and float(e["shield"]) > 0.0 and float(e["markPierce"]) <= 0.0 and not mega.get("pierce", false):
				var bite: float = float(Js.round(dmg * float(e_mods["shieldTaken"])))
				var absorbed: float = minf(float(e["shield"]), bite)
				e["shield"] = float(e["shield"]) - absorbed
				to_hull = maxf(0.0, dmg - ceil(absorbed / float(e_mods["shieldTaken"])))
				out["shielded"] = absorbed
			var before: float = float(e["hp"])
			e["hp"] = _ward_floor(b, float(e["hp"]) - to_hull, ev)
			out["dmg"] = to_hull
			out["enemyHp"] = e["hp"]
			ev.append(out)
			if dmg > 0.0 and float(e["hp"]) > 0.0:
				_on_hit(b, si, dmg, crit_shot, ev, Js.list(mega.get("hits")).size())
				# The Nuke's fallout: the wreck burns.
				if mega.get("fallout") is Dictionary:
					e["burn"] = { "turns": float(mega["fallout"]["turns"]), "dmg": maxf(1.0, float(Js.round(dmg * float(mega["fallout"]["pct"])))) }
					ev.append({ "t": "eAblaze", "seat": si, "dmg": e["burn"]["dmg"], "fallout": true })
			# Reflective: a slice of the blow comes back.
			if dmg > 0.0 and af.has("reflectPct") and Dice.next() < float(Js.nz(af.get("reflectChance"), 1.0)):
				_hit_seat(b, si, maxf(1.0, float(Js.round(dmg * float(af["reflectPct"])))), ev, "reflect", "Reflective")
			if float(e["hp"]) <= 0.0:
				# Volatile: the wreck goes up as it sinks.
				if af.has("deathBurnRemainingPct") and (e["phases"] as Array).size() < int(e["phase"]):
					var boom: float = minf(maxf(1.0, float(Js.round(float(s["hp"]) * float(af["deathBurnRemainingPct"])))), float(s["hp"]) - 1.0)
					if boom > 0.0:
						s["hp"] = float(s["hp"]) - boom
						ev.append({ "t": "volatile", "seat": si, "dmg": boom, "hp": s["hp"] })
				_enemy_down(b, ev, false)


static func _enemy_act(b: Dictionary, act: String, e_mods: Dictionary, plans: Array, ev: Array) -> void:
	var e: Dictionary = b["enemy"]
	if float(e["foresight"]) > 0.0:
		e["foresight"] = float(e["foresight"]) - 1.0
	if float(e["ward"]) > 0.0:
		e["ward"] = float(e["ward"]) - 1.0
	if e.get("frozenNow", false):
		ev.append({ "t": "eFrozen" })
		return
	# The boss's off-turn ability, once a phase, two to four turns in.
	var abl: Dictionary = _ability_now(e)
	if not abl.is_empty() and not e["abUsed"]:
		e["abTurn"] = float(e["abTurn"]) + 1.0
		if float(e["abOn"]) <= 0.0:
			e["abOn"] = 2.0 + floor(Dice.next() * 3.0)
		if float(e["abTurn"]) >= float(e["abOn"]):
			e["abUsed"] = true
			_boss_ability(b, abl, ev)
			if alive(b).is_empty():
				return
	# Resilient: now and then it patches itself up.
	var af: Dictionary = e["affix"]
	if af.has("turnStartHealChance") and float(e["hp"]) > 0.0 and float(e["hp"]) < float(e["max"]) and Dice.next() < float(af["turnStartHealChance"]):
		var h: float = minf(maxf(maxf(1.0, float(Js.nz(af.get("turnStartHealBase"), 5.0))), float(Js.round(float(e["max"]) * float(Js.nz(af.get("turnStartHealMaxPct"), 0.05))))), float(e["max"]) - float(e["hp"]))
		e["hp"] = float(e["hp"]) + h
		ev.append({ "t": "eHeal", "hp": e["hp"], "heal": h, "why": "Resilient" })
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
			if sp.get("aimAttack") != null:
				var tg0: int = _target(b, -1)
				if tg0 >= 0:
					b["seats"][tg0]["afflict"] = { "kind": sp["aimAttack"], "passes": Js.nz(sp.get("aimPasses"), 2.0) }
			elif sp.get("status") != null:
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
				# Frenzied: sometimes a second gun goes off.
				var af2: Dictionary = e["affix"]
				if act != "ultimate" and af2.has("doubleFireChance") and not alive(b).is_empty() and Dice.next() < float(af2["doubleFireChance"]):
					_enemy_shot(b, "fire", _target(b, -1), e_mods, plans, ev, false, false, true)


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


static func _enemy_shot(b: Dictionary, act: String, ti: int, e_mods: Dictionary, plans: Array, ev: Array, main: bool, all: bool = false, frenzy: bool = false) -> void:
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
	if float(e["wardBuff"]) > 0.0:
		dmg = maxf(1.0, floor(dmg * (1.0 + float(e["wardBuff"]))))
	var af: Dictionary = e["affix"]
	var eff_crit: float = 0.0 if act == "ultimate" else minf(1.0, float(e["crit"]) * float(Js.nz(af.get("critMult"), 1.0)))
	var crit: bool = Dice.next() < eff_crit
	if crit:
		dmg = floor(dmg * 1.5)
	var out: Dictionary = { "t": "eShot", "action": act, "target": ti, "crit": crit, "extra": not main, "all": all, "frenzy": frenzy }
	var ta: Dictionary = tide_agg(t, e["boss"])
	# The target's dodge stance (a frozen ship cannot; the Frenzied shot
	# comes in under it).
	if str(Js.obj(plans[ti]).get("action", "")) == "dodge" and not t.get("frozenNow", false) and not frenzy:
		if float(t["dodgeToken"]) > 0.0:
			t["dodgeToken"] = float(t["dodgeToken"]) - 1.0
			dmg = 0.0
			out["dodged"] = true
		else:
			var def: int = d20() + int(t["nav"])
			var atk: int = d20() + int(maxf(0.0, float(e["acc"])))
			var ok: bool = def >= atk
			var db: float = float(ta["dodgeBonus"])
			if db > 0.0 and not ok and Dice.next() < db:
				ok = true
			elif db < 0.0 and ok and Dice.next() < -db:
				ok = false
			if ok:
				var would: float = dmg
				dmg = 0.0
				out["dodged"] = true
				# An astrolabe's parry throws some of it back.
				var tfx: Dictionary = Js.obj(t.get("fx"))
				if float(tfx.get("parry", 0.0)) > 0.0 and float(tfx.get("parryReflect", 0.0)) > 0.0 and Dice.next() < float(tfx["parry"]):
					_reflect(b, ti, maxf(1.0, floor(would * float(tfx["parryReflect"]))), ev, "Parry")
			else:
				dmg = maxf(1.0, floor(dmg * 0.3))
				out["partial"] = true
	var tfx2: Dictionary = Js.obj(t.get("fx"))
	# The first blow of a fight, turned aside outright.
	if dmg > 0.0 and not t.get("firstBlow", false):
		t["firstBlow"] = true
		if float(tfx2.get("firstBlowParry", 0.0)) > 0.0 and Dice.next() < float(tfx2["firstBlowParry"]):
			if float(tfx2.get("parryReflect", 0.0)) > 0.0:
				_reflect(b, ti, maxf(1.0, floor(dmg * float(tfx2["parryReflect"]))), ev, "Aegis")
			dmg = 0.0
			out["parried"] = true
	if dmg > 0.0:
		var taken: float = float(mods(t["statuses"])["taken"]) * (1.0 if frenzy else float(ta["inDmg"])) * float(tfx2.get("inMult", 1.0))
		if taken != 1.0:
			dmg = maxf(1.0, floor(dmg * taken))
		var br: Dictionary = t["brace"]
		if not frenzy and not br.is_empty() and (not crit or br.get("crits", false)):
			dmg = maxf(1.0, float(Js.round(dmg * (1.0 - float(br["pct"])))))
			t["brace"] = {}
			out["braced"] = true
		# The dampener: a big hit cut back to a share of the hull.
		if float(tfx2.get("maxHitPct", 0.0)) > 0.0:
			var cap: float = maxf(1.0, float(Js.round(float(t["max"]) * float(tfx2["maxHitPct"]))))
			if dmg > cap and Dice.next() < (float(tfx2["maxHitChance"]) if float(tfx2.get("maxHitChance", 0.0)) > 0.0 else 1.0):
				dmg = cap
				out["dampened"] = true
		if float(t["shield"]) > 0.0:
			var soaked: float = minf(float(t["shield"]), dmg)
			t["shield"] = float(t["shield"]) - soaked
			dmg -= soaked
			out["shielded"] = soaked
		t["hp"] = maxf(0.0, float(t["hp"]) - dmg)
	out["dmg"] = dmg
	out["hp"] = t["hp"]
	ev.append(out)
	if dmg <= 0.0:
		return
	# Being hit feeds the guns.
	if float(tfx2.get("chargeOnHit", 0.0)) > 0.0 and Dice.next() < float(tfx2["chargeOnHit"]) and float(t["charges"]) < float(t["maxCharges"]):
		t["charges"] = float(t["charges"]) + 1.0
		ev.append({ "t": "loaded", "seat": ti, "charges": t["charges"] })
	# The shark's bite: a landed shot knocks a ball out of the rack.
	if not frenzy and float(e["bite"]) > 0.0 and float(t["charges"]) > 0.0 and Dice.next() < minf(1.0, float(e["bite"])):
		t["charges"] = float(t["charges"]) - 1.0
		ev.append({ "t": "bite", "seat": ti, "charges": t["charges"] })
	# Scorching, else Glacial.
	if float(t["hp"]) > 0.0:
		if af.has("burnChance") and Dice.next() < float(af["burnChance"]):
			t["burn"] = { "turns": 2.0, "dmg": maxf(1.0, minf(float(Js.round(dmg * 0.10)), float(Js.round(float(t["max"]) * 0.10)))) }
			ev.append({ "t": "ablaze", "seat": ti })
		elif af.has("freezeChance") and Dice.next() < float(af["freezeChance"]):
			t["freeze"] = 1.0
			ev.append({ "t": "iced", "seat": ti })
	# Vampiric: it drinks some of it back.
	if af.has("lifestealPct") and float(e["hp"]) < float(e["max"]) and Dice.next() < float(Js.nz(af.get("lifestealChance"), 1.0)):
		var h: float = minf(float(e["max"]) - float(e["hp"]), maxf(1.0, float(Js.round(dmg * float(af["lifestealPct"])))))
		e["hp"] = float(e["hp"]) + h
		ev.append({ "t": "eHeal", "hp": e["hp"], "heal": h, "why": "Vampiric" })


## The enemy at 0: a phase left revives it (the round ends); else it is sunk.
static func _enemy_down(b: Dictionary, ev: Array, by_ability: bool) -> void:
	var e: Dictionary = b["enemy"]
	var ph: int = int(e["phase"])
	if ph - 1 < (e["phases"] as Array).size():
		var nc: Dictionary = e["phases"][ph - 1]
		e["phase"] = float(ph + 1)
		e["idx"] = 0.0
		e["feint"] = 0.0
		e["abTurn"] = 0.0
		e["abOn"] = 0.0
		e["abUsed"] = false
		for s9: Dictionary in b["seats"]:
			if Js.obj(s9.get("fx")).get("ambush", false):
				s9["shots"] = 0.0
		e["hp"] = maxf(1.0, floor(float(e["max"]) * float(nc["revivePct"])))
		if by_ability:
			e["shield"] = float(Js.round(float(e["max"]) * Js.nz(nc.get("shieldPct"), 0.0)))
			e["ward"] = 0.0
			e["wardBuff"] = 0.0
			e["foresight"] = 0.0
		elif nc.get("shieldPct") != null:
			e["shield"] = float(Js.round(float(e["max"]) * float(nc["shieldPct"])))
		e["aegis"] = {}
		if nc.get("aegis") is Dictionary:
			e["aegis"] = { "name": nc["aegis"].get("name", "The Last Wall"), "left": float(nc["aegis"]["hitsToBreak"]), "of": float(nc["aegis"]["hitsToBreak"]) }
		ev.append({ "t": "phase", "phase": e["phase"], "line": nc.get("dialogueLine", ""), "hp": e["hp"], "badge": nc.get("badge", ""), "aegis": e["aegis"] })
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
			"burnDot":
				s["burn"] = { "turns": float(c["turns"]), "dmg": maxf(1.0, float(Js.round(float(s["max"]) * float(c["pctPerTurn"])))) }
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
	_deaths(b, ev)
	if alive(b).is_empty():
		b["state"] = "lost"
		ev.append({ "t": "lost" })
		return ev
	if float(e["hp"]) <= 0.0:
		b["state"] = "won"
		ev.append({ "t": "won" })
		return ev
	return _round_end(b, ev)


## Deaths, and the Vengeance ward's cheat.
static func _deaths(b: Dictionary, ev: Array) -> void:
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
			_cheated(s)
			ev.append({ "t": "cheat", "seat": i, "hp": s["hp"] })
		elif float(s.get("saves", 0.0)) > 0.0 and not s.get("anchorUsed", false):
			s["saves"] = float(s["saves"]) - 1.0
			s["anchorUsed"] = true
			s["hp"] = 1.0
			_cheated(s)
			ev.append({ "t": "cheat", "seat": i, "hp": 1.0, "anchor": true })
		else:
			s["sunk"] = true
			ev.append({ "t": "sunk", "seat": i })


static func _round_end(b: Dictionary, ev: Array) -> Array:
	var e: Dictionary = b["enemy"]
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
	# A flare barrage every third turn (Flare Barrage, by tier).
	var tier: int = int(e["decoy"])
	if tier > 0 and int(b["turn"]) % 3 == 0:
		var per: float = float(Js.round(maxf(float(Js.round(float(e["min"]) * 0.7)), 0.0) * float(e["flareDmg"])))
		b["flares"] = {
			"name": e["decoyName"], "count": 3 + tier * 2, "feint": 0.22 if tier >= 3 else 0.0, "cluster": 0.34 if tier >= 2 else 0.20,
			"fuse": (0.9 if tier >= 3 else (1.02 if tier == 2 else 1.18)) * float(e["flareFuse"]), "per": per,
		}
		ev.append({ "t": "flares", "name": e["decoyName"], "count": b["flares"]["count"] })
	ev.append({ "t": "end", "turn": b["turn"] })
	return ev


## The flare barrage's toll, once every captain has played it: each real
## flare let through costs perMiss (at least 3.2% of their hull), each live
## shell tapped 1.4 times that, straight off the hull. results: per seat
## { missed, feints }.
static func flares_land(b: Dictionary, results: Array) -> Array:
	var ev: Array = []
	var fl: Dictionary = Js.obj(b.get("flares"))
	b.erase("flares")
	if fl.is_empty():
		return ev
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if s.get("sunk", false) or i >= results.size():
			continue
		var r: Dictionary = Js.obj(results[i])
		var per: float = float(Js.round(maxf(float(fl["per"]), float(Js.round(float(s["max"]) * 0.032)))))
		var dmg: float = float(r.get("missed", 0.0)) * per + float(r.get("feints", 0.0)) * float(Js.round(per * 1.4))
		if dmg > 0.0:
			s["hp"] = maxf(0.0, float(s["hp"]) - dmg)
		ev.append({ "t": "flareHit", "seat": i, "dmg": dmg, "hp": s["hp"], "missed": r.get("missed", 0.0) })
	_deaths(b, ev)
	if alive(b).is_empty():
		b["state"] = "lost"
		ev.append({ "t": "lost" })
	return ev


# ══ Between fights ═════════════════════════════════════════════════════════════

## After a fight is won: the next one (HP carries), or the raid is done. A
## Rest Stop refreshes crew orders once, halfway through a long raid.
static func next_fight(b: Dictionary) -> Dictionary:
	var raid: Dictionary = raid_def(str(b["raidId"]))
	var n: int = Js.list(raid.get("sequence")).size()
	var r: int = int(b["fight"]) + 1
	for s0: Dictionary in b["seats"]:
		s0["tfx"] = expire_tides(Js.list(s0.get("tfx")))
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


# ══ The boss's ways (BossAbility, the ward, the Last Wall) ════════════════════

static func _phase(e: Dictionary) -> Dictionary:
	var ph: int = int(e["phase"])
	return Js.obj(e["phases"][ph - 2]) if ph >= 2 else {}


## The ability of the phase it is in (phase 1: phaseAbility).
static func _ability_now(e: Dictionary) -> Dictionary:
	if int(e["phase"]) >= 2:
		return Js.obj(_phase(e).get("ability"))
	return Js.obj(e.get("phaseAbility"))


## A boss's off-turn ability (RaidCombat, BossAbility), before its action.
static func _boss_ability(b: Dictionary, a: Dictionary, ev: Array) -> void:
	var e: Dictionary = b["enemy"]
	var pm: float = float(Js.nz(_phase(e).get("damageMult"), 1.0))
	var out: Dictionary = { "t": "bossAbility", "kind": a["kind"], "name": a.get("name", ""), "image": a.get("summonImage", ""), "color": a.get("summonColor", "#a78bfa"), "hits": [] }
	match str(a["kind"]):
		"leviathan":
			# One great blow at a ship, no dodge, through its shield.
			var ti: int = _target(b, -1)
			if ti >= 0:
				var d: float = maxf(1.0, float(Js.round(float(e["maxDmg"]) * 1.5 * float(Js.nz(a.get("value"), 1.0)) * pm)))
				(out["hits"] as Array).append(_soak_seat(b, ti, d))
		"blitz":
			# A flurry, fiercer the lower the ship is, at every ship afloat.
			for i: int in (b["seats"] as Array).size():
				var s: Dictionary = b["seats"][i]
				if s.get("sunk", false) or float(s["hp"]) <= 0.0:
					continue
				var frenzy: float = 1.0 + (1.0 - float(s["hp"]) / float(s["max"])) * float(Js.nz(a.get("value"), 0.3))
				var tot: float = 0.0
				for k: int in int(Js.nz(a.get("shots"), 4.0)):
					tot += maxf(1.0, float(Js.round(float(e["min"]) * 0.42 * frenzy * pm)))
				(out["hits"] as Array).append(_soak_seat(b, i, tot))
		"abyssal_tide":
			var h: float = maxf(1.0, float(Js.round(float(e["max"]) * float(Js.nz(a.get("value"), 0.14)))))
			e["hp"] = minf(float(e["max"]), float(e["hp"]) + h)
			var sh: float = maxf(1.0, float(Js.round(float(e["max"]) * float(Js.nz(a.get("shieldValue"), 0.08)))))
			e["shield"] = float(e["shield"]) + sh
			out["heal"] = h
			out["shield"] = sh
		"foresight":
			e["foresight"] = Js.nz(a.get("turns"), 2.0)
		"vengeance":
			e["ward"] = Js.nz(a.get("turns"), 4.0)
		"requiem":
			for s2: Dictionary in alive(b):
				apply_status(s2["statuses"], "marked", Js.nz(a.get("value"), 0.3), Js.nz(a.get("turns"), 3.0))
	out["enemyHp"] = e["hp"]
	ev.append(out)


## Damage straight at a ship through its shield (a boss ability, a parry).
static func _soak_seat(b: Dictionary, ti: int, dmg: float) -> Dictionary:
	var t: Dictionary = b["seats"][ti]
	var soaked: float = minf(float(t["shield"]), dmg)
	t["shield"] = float(t["shield"]) - soaked
	t["hp"] = maxf(0.0, float(t["hp"]) - (dmg - soaked))
	return { "seat": ti, "dmg": dmg - soaked, "shielded": soaked, "hp": t["hp"] }


## A riposte or a reflection back at a ship (through its taken multiplier
## and its shield).
static func _hit_seat(b: Dictionary, ti: int, dmg: float, ev: Array, kind: String, name: String) -> void:
	var t: Dictionary = b["seats"][ti]
	var taken: float = float(mods(t["statuses"])["taken"]) * float(tide_agg(t)["inDmg"])
	if taken != 1.0:
		dmg = maxf(1.0, floor(dmg * taken))
	var h: Dictionary = _soak_seat(b, ti, dmg)
	h["t"] = kind
	h["name"] = name
	ev.append(h)


## wardFloor: the boss's vengeance ward holds it up once, at a fifth of its
## hull, and it hits a quarter harder for the rest of the phase.
static func _ward_floor(b: Dictionary, hp: float, ev: Array) -> float:
	var e: Dictionary = b["enemy"]
	if hp <= 0.0 and float(e["ward"]) > 0.0:
		e["ward"] = 0.0
		e["wardBuff"] = 0.25
		var up: float = maxf(1.0, float(Js.round(float(e["max"]) * 0.20)))
		ev.append({ "t": "wardSurge", "hp": up })
		return up
	return maxf(0.0, hp)


## The Last Wall takes a blow (a volley counts twice); at none left it falls.
static func _aegis_hit(b: Dictionary, n: float, ev: Array) -> void:
	var e: Dictionary = b["enemy"]
	var ag: Dictionary = e["aegis"]
	if ag.is_empty():
		return
	ag["left"] = float(ag["left"]) - n
	if float(ag["left"]) <= 0.0:
		e["aegis"] = {}
		ev.append({ "t": "aegisBreak", "name": ag["name"] })
	else:
		ev.append({ "t": "aegisHit", "left": ag["left"], "of": ag["of"] })


# ══ Tides (lib/tides) ═════════════════════════════════════════════════════════
#
# Each captain chooses their own: a tide's effects ride on their ship (s.tfx),
# and the ones that shrink the next enemy multiply across the line.

## drawTides: one tier-2 at most (55%), the rest tier 1, shuffled.
static func draw_tides(n: int, max_tier: int) -> Array:
	var pool: Array = Js.list(Js.obj(Rules.data().get("tides")).get("pool"))
	var t1: Array = _shuffle(pool.filter(func(t: Dictionary) -> bool: return int(t["tier"]) == 1))
	var t2: Array = _shuffle(pool.filter(func(t: Dictionary) -> bool: return int(t["tier"]) >= 2 and int(t["tier"]) <= max_tier))
	var picks: Array = []
	if not t2.is_empty() and Dice.next() < 0.55:
		picks.append(t2[0])
	for t: Dictionary in t1:
		if picks.size() >= n:
			break
		picks.append(t)
	for k: int in range(1, t2.size()):
		if picks.size() >= n:
			break
		picks.append(t2[k])
	return _shuffle(picks).slice(0, n)


static func _shuffle(a: Array) -> Array:
	var out: Array = a.duplicate()
	for i: int in range(out.size() - 1, 0, -1):
		var j: int = int(floor(Dice.next() * (i + 1)))
		var tmp: Variant = out[i]
		out[i] = out[j]
		out[j] = tmp
	return out


## The tide due after this kill (a non-boss fight won), or {}.
static func tide_due(b: Dictionary) -> Dictionary:
	var raid: Dictionary = raid_def(str(b["raidId"]))
	var slots: Array = Js.list(Js.obj(raid.get("tides")).get("slots"))
	var kills: int = int(b["fight"]) + 1
	var at: int = -1
	for k: int in slots.size():
		if int(slots[k]) == kills:
			at = k
	if at < 0 or (b["tideFired"] as Array).has(at) or at >= (b["tides"] as Array).size():
		return {}
	(b["tideFired"] as Array).append(at)
	return b["tides"][at]


## The Throne's reprieve before its boss, once (PRE_BOSS_REPRIEVE), or {}.
static func reprieve_due(b: Dictionary) -> Dictionary:
	var raid: Dictionary = raid_def(str(b["raidId"]))
	if raid.get("preBossReprieve") != true or b.get("reprieved", false):
		return {}
	var n: int = Js.list(raid.get("sequence")).size()
	if int(b["fight"]) + 1 != n:
		return {}
	b["reprieved"] = true
	return Js.obj(Js.obj(Rules.data().get("tides")).get("reprieve"))


## A captain's choice: an instant heal lands now, the rest ride on their ship.
static func tide_pick(b: Dictionary, si: int, tide: Dictionary, choice_id: String) -> Dictionary:
	var s: Dictionary = b["seats"][si]
	var out: Dictionary = { "seat": si, "heal": 0.0 }
	for c: Dictionary in Js.list(tide.get("choices")):
		if c["id"] != choice_id:
			continue
		out["label"] = c.get("label", "")
		for fx: Dictionary in Js.list(c.get("effects")):
			match str(fx["kind"]):
				"instantHeal":
					out["heal"] = float(out["heal"]) + _heal(s, float(fx["n"]))
				"instantHealPct":
					out["heal"] = float(out["heal"]) + _heal(s, float(Js.round(float(fx["pct"]) * float(s["max"]))))
				"fullHeal":
					out["heal"] = float(out["heal"]) + _heal(s, float(s["max"]))
				"refreshAbility":
					var spent: Array = Js.list(s.get("used"))
					if not spent.is_empty():
						var k: int = int(floor(Dice.next() * spent.size()))
						out["refreshed"] = spent[k]
						spent.remove_at(k)
				_:
					var keep: Dictionary = fx.duplicate()
					(s["tfx"] as Array).append(keep)
	return out


## expireAfterFight: what a tide meant for the next fight goes.
static func expire_tides(fx: Array) -> Array:
	var out: Array = []
	for e: Dictionary in fx:
		var k: String = str(e["kind"])
		var scope: String = str(e.get("scope", ""))
		if k == "guaranteedDodge":
			continue
		if scope == "nextFight" and k in ["enemyHpScale", "enemyStartChargesDelta", "startCharges", "startHpDelta", "startHpPctDelta", "incomingDmgMult", "dodgeBonus"]:
			continue
		if k == "speedDelta" and scope == "next2Fights":
			var left: float = Js.nz(e.get("_fights"), 2.0) - 1.0
			if left > 0.0:
				var e2: Dictionary = e.duplicate()
				e2["_fights"] = left
				out.append(e2)
			continue
		out.append(e)
	return out


## A captain's tides, added up (multipliers multiply, the rest add).
static func tide_agg(s: Dictionary, boss: bool = false) -> Dictionary:
	var a: Dictionary = {
		"dmgMult": 1.0, "fireMult": 1.0, "volleyMult": 1.0, "bossMult": 1.0, "bossVolMult": 1.0, "critBonus": 0.0, "critZone": 1.0,
		"inDmg": 1.0, "speed": 0.0, "reloadChance": 0.0, "reloadBonus": 0.0, "dodgeBonus": 0.0, "startHpPct": 0.0, "startHealPct": 0.0,
		"startCharges": 0.0, "enemyHpScale": 1.0, "guaranteedDodge": 0.0, "doubloonsAtEnd": 0.0,
	}
	for e: Dictionary in Js.list(s.get("tfx")):
		var scope: String = str(e.get("scope", ""))
		match str(e["kind"]):
			"damageMult": a["dmgMult"] = float(a["dmgMult"]) * float(e["mult"])
			"fireDmgMult": a["fireMult"] = float(a["fireMult"]) * float(e["mult"])
			"volleyDmgMult": a["volleyMult"] = float(a["volleyMult"]) * float(e["mult"])
			"bossDamageMult": a["bossMult"] = float(a["bossMult"]) * float(e["mult"])
			"bossVolleyDmgMult": a["bossVolMult"] = float(a["bossVolMult"]) * float(e["mult"])
			"critChanceBonus": a["critBonus"] = float(a["critBonus"]) + float(e["chance"])
			"critZoneScale": a["critZone"] = float(a["critZone"]) * float(e["mult"])
			"incomingDmgMult": a["inDmg"] = float(a["inDmg"]) * float(e["mult"])
			"speedDelta": a["speed"] = float(a["speed"]) + float(e["n"])
			"reloadProc":
				a["reloadChance"] = minf(1.0, float(a["reloadChance"]) + float(e["chance"]))
				a["reloadBonus"] = float(a["reloadBonus"]) + float(Js.nz(e.get("bonusCharges"), 1.0))
			"dodgeBonus": a["dodgeBonus"] = float(a["dodgeBonus"]) + float(e["chance"])
			"startHpPctDelta":
				if scope != "boss" or boss:
					a["startHpPct"] = float(a["startHpPct"]) + float(e["pct"])
			"startOfFightHealPct": a["startHealPct"] = float(a["startHealPct"]) + float(e["pctMax"])
			"startCharges":
				a["startCharges"] = 0.0 if float(e["n"]) <= -10.0 else float(a["startCharges"]) + float(e["n"])
			"enemyHpScale": a["enemyHpScale"] = float(a["enemyHpScale"]) * float(e["mult"])
			"guaranteedDodge": a["guaranteedDodge"] = float(a["guaranteedDodge"]) + float(e["n"])
			"doubloonsAtRaidEnd": a["doubloonsAtEnd"] = float(a["doubloonsAtEnd"]) + float(e["n"])
	return a


# ══ Raid items (lib/raidItems effects) ═════════════════════════════════════════

## An item list's effects, folded the way RaidCombat reads each type:
## products for multipliers, sums for the ward, crit upgrades, lifesteal and
## saves, the best for chances.
static func item_fx(ids: Array) -> Dictionary:
	var fx: Dictionary = {
		"bossMult": 1.0, "nonbossMult": 1.0, "critMult": 1.0, "noncritMult": 1.0, "inMult": 1.0, "maxHp": 1.0,
		"firstShot": 1.0, "afflicted": 1.0, "avengeElite": 1.0, "ramp": 0.0, "critUpgrade": 0.0, "lifesteal": 0.0,
		"wardPct": 0.0, "lethalSave": 0.0, "offensive": false, "fireMult": 1.0, "volleyMult": 1.0, "megaMult": 1.0,
	}
	var best: Array = ["burn", "freeze", "parry", "parryReflect", "firstBlowParry", "maxHitPct", "maxHitChance", "chargeOnHit",
		"reloadCharge", "navSpeed", "startCharge", "extraStart", "critStrip", "dodgePierce", "wardRefill", "weaken", "corrode",
		"feeble", "critSpread", "critRamp", "critRefund"]
	for k: String in best:
		fx[k] = 0.0
	var key: Dictionary = {
		"burn_chance": "burn", "freeze_chance": "freeze", "parry_chance": "parry", "parry_reflect_pct": "parryReflect",
		"first_blow_parry_chance": "firstBlowParry", "max_hit_chance": "maxHitChance", "charge_on_hit_chance": "chargeOnHit",
		"reload_charge_chance": "reloadCharge", "speed_roll_nav_pct": "navSpeed", "start_charge_chance": "startCharge",
		"extra_start_charge_chance": "extraStart", "crit_strip_charge": "critStrip", "dodge_pierce_chance": "dodgePierce",
		"ward_refill_pct": "wardRefill", "weaken_on_hit": "weaken", "corrode_on_hit": "corrode", "feeble_on_hit": "feeble",
		"crit_spread_chance": "critSpread", "crit_ramp_turns": "critRamp", "crit_charge_refund_chance": "critRefund",
	}
	var offensive: Array = ["boss_damage_mult", "crit_damage_mult", "noncrit_damage_mult", "nonboss_damage_mult", "ramp_damage_per_turn", "burn_chance", "freeze_chance", "parry_chance", "parry_reflect_pct"]
	for id: Variant in ids:
		for e: Dictionary in Armory.effects_of(str(id)):
			var t: String = str(e["type"])
			var v: float = float(e["value"])
			if offensive.has(t):
				fx["offensive"] = true
			match t:
				"boss_damage_mult": fx["bossMult"] = float(fx["bossMult"]) * v
				"fire_damage_mult": fx["fireMult"] = float(fx["fireMult"]) * v
				"volley_damage_mult": fx["volleyMult"] = float(fx["volleyMult"]) * v
				"mega_damage_mult": fx["megaMult"] = float(fx["megaMult"]) * v
				"nonboss_damage_mult": fx["nonbossMult"] = float(fx["nonbossMult"]) * v
				"crit_damage_mult": fx["critMult"] = float(fx["critMult"]) * v
				"noncrit_damage_mult": fx["noncritMult"] = float(fx["noncritMult"]) * v
				"incoming_damage_mult": fx["inMult"] = float(fx["inMult"]) * v
				"max_hp_mult": fx["maxHp"] = float(fx["maxHp"]) * v
				"first_shot_mult": fx["firstShot"] = float(fx["firstShot"]) * v
				"afflicted_damage_mult": fx["afflicted"] = float(fx["afflicted"]) * v
				"avenge_elite_mult": fx["avengeElite"] = float(fx["avengeElite"]) * v
				"ramp_damage_per_turn": fx["ramp"] = float(fx["ramp"]) + v
				"crit_upgrade_chance": fx["critUpgrade"] = float(fx["critUpgrade"]) + v
				"lifesteal_pct": fx["lifesteal"] = float(fx["lifesteal"]) + v
				"ward_pct": fx["wardPct"] = float(fx["wardPct"]) + v
				"lethal_save": fx["lethalSave"] = float(fx["lethalSave"]) + v
				"max_hit_pct":
					fx["maxHitPct"] = v if float(fx["maxHitPct"]) == 0.0 else minf(float(fx["maxHitPct"]), v)
				"pierce_crit": fx["pierceCrit"] = true
				"ambush_each_phase": fx["ambush"] = true
				"ward_refill_on_save": fx["wardOnSave"] = true
				_:
					if key.has(t):
						fx[key[t]] = maxf(float(fx[key[t]]), v)
	return fx


## A death cheated: the Drowned Crown's vengeance arms, the Standing Wall
## raises the palisade again.
static func _cheated(s: Dictionary) -> void:
	s["cheated"] = true
	if Js.obj(s.get("fx")).get("wardOnSave", false):
		s["shield"] = maxf(float(s["shield"]), float(s.get("wardMax", 0.0)))


## Thrown back at the enemy (a parry): through its shield and its ward.
static func _reflect(b: Dictionary, si: int, dmg: float, ev: Array, name: String) -> void:
	var e: Dictionary = b["enemy"]
	if not (e["aegis"] as Dictionary).is_empty():
		return
	var absorbed: float = minf(float(e["shield"]), dmg)
	e["shield"] = float(e["shield"]) - absorbed
	e["hp"] = _ward_floor(b, float(e["hp"]) - (dmg - absorbed), ev)
	ev.append({ "t": "reflect", "seat": si, "dmg": dmg - absorbed, "enemyHp": e["hp"], "name": name })
	if float(e["hp"]) <= 0.0:
		_enemy_down(b, ev, false)


## A shot that landed and left it afloat: the items' riders (crit strip,
## lifesteal, fire and ice, the rack's spread, the Leviathan's stoking).
static func _proc(c: float, hits: int) -> bool:
	if c <= 0.0:
		return false
	if hits > 1:
		return Dice.next() < 1.0 - (1.0 - c) * pow(1.0 - c * 0.3, hits - 1)
	return Dice.next() < c


static func _on_hit(b: Dictionary, si: int, dmg: float, crit: bool, ev: Array, hits: int = 1) -> void:
	var s: Dictionary = b["seats"][si]
	var e: Dictionary = b["enemy"]
	var fx: Dictionary = Js.obj(s.get("fx"))
	if fx.is_empty():
		return
	if crit and float(e["charges"]) > 0.0 and float(fx.get("critStrip", 0.0)) > 0.0 and Dice.next() < float(fx["critStrip"]):
		e["charges"] = float(e["charges"]) - 1.0
		ev.append({ "t": "strip", "seat": si, "charges": e["charges"] })
	var rate: float = minf(0.35, float(fx.get("lifesteal", 0.0)))
	if rate > 0.0 and float(s["hp"]) > 0.0:
		var heal: float = float(Js.round(minf(float(Js.round(float(s["max"]) * rate * 2.0)), maxf(1.0, float(Js.round(dmg * rate))))))
		var got: float = _heal(s, heal)
		if got > 0.0:
			ev.append({ "t": "leech", "seat": si, "heal": got, "hp": s["hp"] })
	if float(fx.get("burn", 0.0)) > 0.0 and _proc(minf(0.20, float(fx["burn"])), hits):
		e["burn"] = { "turns": 2.0, "dmg": maxf(1.0, float(Js.round(dmg * 0.10))) }
		ev.append({ "t": "eAblaze", "seat": si, "dmg": e["burn"]["dmg"] })
	if float(fx.get("freeze", 0.0)) > 0.0 and _proc(minf(0.20, float(fx["freeze"])), hits):
		e["freeze"] = 1.0
		ev.append({ "t": "eIced", "seat": si })
	var rack: float = maxf(float(fx.get("weaken", 0.0)), maxf(float(fx.get("corrode", 0.0)), float(fx.get("feeble", 0.0))))
	var fired: bool = rack > 0.0 and _proc(rack, hits)
	if not fired and rack > 0.0 and crit and float(fx.get("critSpread", 0.0)) > 0.0 and Dice.next() < float(fx["critSpread"]):
		fired = true
	if fired:
		var landed: Array = []
		if float(fx.get("weaken", 0.0)) > 0.0:
			apply_status(e["statuses"], "weaken", 0.20, 2.0)
			landed.append("weaken")
		if float(fx.get("corrode", 0.0)) > 0.0:
			apply_status(e["statuses"], "corrode", 0.30, 2.0)
			landed.append("corrode")
		if float(fx.get("feeble", 0.0)) > 0.0:
			apply_status(e["statuses"], "feeble", 0.20, 2.0)
			landed.append("feeble")
		ev.append({ "t": "rack", "seat": si, "landed": landed })
	if crit and float(fx.get("critRamp", 0.0)) > 0.0:
		s["critRamp"] = float(s.get("critRamp", 0.0)) + float(fx["critRamp"])


## The drum (War Drum, Thunder Drum, the drums forged from them): once a
## raid, a free beat that may bring a spent crew order back.
static func drum_of(s: Dictionary) -> Dictionary:
	for id: Variant in Js.list(s.get("items")):
		var it: Dictionary = Armory.item(str(id))
		if it.get("activated") is Dictionary:
			return it
	return {}


static func use_drum(b: Dictionary, si: int) -> Dictionary:
	var s: Dictionary = b["seats"][si]
	var it: Dictionary = drum_of(s)
	if it.is_empty() or s.get("drum", false):
		return { "error": "No drum to beat" }
	s["drum"] = true
	var spent: Array = Js.list(s.get("used"))
	var out: Dictionary = { "t": "drum", "seat": si, "name": it["name"] }
	if not spent.is_empty() and Dice.next() < float(it["activated"]["chance"]):
		var k: int = int(floor(Dice.next() * spent.size()))
		out["refreshed"] = spent[k]
		spent.remove_at(k)
	return out


# ══ Flee (riskyFlee) ═══════════════════════════════════════════════════════════

## What a captain needs on the die to get away (a natural 20 always does).
static func flee_need(b: Dictionary, si: int) -> int:
	var s: Dictionary = b["seats"][si]
	var e: Dictionary = b["enemy"]
	var spd: float = maxf(1.0, float(s["speed"]) + float(tide_agg(s)["speed"]))
	var dc: float = 10.0 + float(e["speed"]) + (3.0 if e["boss"] else 0.0)
	return clampi(int(dc - spd), 2, 20)


## The roll. Away: out of the fight (and, when nobody is left in it, the raid
## ends as fled). Caught: the enemy's parting shot, which a vengeance ward
## still catches.
static func flee(b: Dictionary, si: int) -> Array:
	var s: Dictionary = b["seats"][si]
	var e: Dictionary = b["enemy"]
	var nat: int = d20()
	var need: int = flee_need(b, si)
	var spd: float = maxf(1.0, float(s["speed"]) + float(tide_agg(s)["speed"]))
	var dc: float = 10.0 + float(e["speed"]) + (3.0 if e["boss"] else 0.0)
	var ok: bool = nat == 20 or (nat > 1 and float(nat) + spd >= dc)
	var out: Dictionary = { "t": "flee", "seat": si, "natural": nat, "need": need, "success": ok }
	var ev: Array = [out]
	if ok:
		s["fled"] = true
		if alive(b).is_empty():
			b["state"] = "fled"
	else:
		var dmg: float = maxf(1.0, float(rand_int(int(e["min"]), int(e["maxDmg"]))))
		s["hp"] = maxf(0.0, float(s["hp"]) - dmg)
		out["dmg"] = dmg
		out["hp"] = s["hp"]
		if float(s["hp"]) <= 0.0:
			var w: Dictionary = s["ward"]
			if not w.is_empty() and float(w["turns"]) > 0.0:
				s["hp"] = maxf(1.0, float(Js.round(float(s["max"]) * float(w["heal"]))))
				s["ward"] = {}
				_cheated(s)
				ev.append({ "t": "cheat", "seat": si, "hp": s["hp"] })
			else:
				s["sunk"] = true
				ev.append({ "t": "sunk", "seat": si })
				if alive(b).is_empty():
					b["state"] = "lost"
					ev.append({ "t": "lost" })
	return ev
