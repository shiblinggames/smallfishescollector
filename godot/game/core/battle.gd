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
## CROSSFIRE (Kong, 2026-10-03: skill based): when two or more ships in the
## line land a CRITICAL on their own aim bar in the same round, each of those
## shots hits harder (port rules battle.crossfire.pct for every crit past the
## first). A hit turned crit by gear or a tide does not count; a frozen ship
## does not fire.
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
	# Deep-Sea Plating (the Don's Locker): a tenth more hull in every fight.
	if Gauntlet.owns(prof, "dg_deep_plating"):
		max_hp = float(Js.round(max_hp * 1.10))
	return {
		"uid": uid, "name": name if name != "" else str(prof.get("username", "Captain")),
		"face": { "characterColor": str(Js.nz(prof.get("character_color"), "default")), "hat": prof.get("equipped_hat") },
		"shipSkin": prof.get("equipped_ship_skin"), "classes": _class_cards(prof.get("ship_classes")),
		"tier": float(tier), "hp": max_hp, "max": max_hp, "speed": maxf(0.0, float(hull["speed"]) + float(cls_fx["speedFlat"])),
		"shipMin": float(hull["minDamage"]), "power": pw + floor(nav / 5.0), "nav": dg + floor(nav / 5.0),
		"fortune": ft + floor(nav / 5.0), "dmgMult": float(cls_fx["damageMult"]) * (1.0 + 0.005 * might),
		"maxCharges": float(MAX_CHARGES + (1 if Armory.has_rack(prof) else 0)), "mega": Armory.mega_of(prof),
		"crew": crew, "used": [], "repairKit": prof.get("equipped_repair_kit"),
		"repairMult": 1.25 if Gauntlet.owns(prof, "seasoned_timbers") else 1.0,
		"items": items, "fx": fx, "saves": float(fx["lethalSave"]), "drum": false,
	}


## The ship's class picks as the ledger shows them: name, colour, bullets.
static func _class_cards(picks: Variant) -> Array:
	var out: Array = []
	var defs: Dictionary = Js.obj(Js.obj(Rules.data().get("shipClasses")).get("classes"))
	for id: Variant in Js.obj(picks).values():
		var c: Dictionary = Js.obj(defs.get(id))
		if not c.is_empty():
			out.append({ "name": c.get("name", ""), "color": c.get("color", ""), "bullets": c.get("bullets", []) })
	return out


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
	s["lashUsed"] = false
	s["kitUsed"] = false
	# The run effects' per-fight counts: shots locked (duds too), volleys
	# loosed, the crit streak, the counter-battery's roll.
	s["locked"] = 0.0
	s["volleys"] = 0.0
	s["streak"] = 0.0
	s.erase("counterOn")
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
static func begin(raid_id: String, seats: Array, tier: String = "normal") -> Dictionary:
	var raid: Dictionary = raid_def(raid_id)
	var b: Dictionary = { "raidId": raid_id, "round": 0.0, "fight": 0.0, "seats": seats, "turn": 1.0, "state": "plan", "events": [], "tier": tier }
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


## The raid's tier rules (port rules battle.tiers), empty for Normal.
static func tier_cfg(b: Dictionary) -> Dictionary:
	return Js.obj(Js.obj(cfg().get("tiers")).get(str(b.get("tier", "normal"))))


## The enemy ships of this fight (one, unless a co-op tier fields more).
static func foes(b: Dictionary) -> Array:
	return Js.list(b.get("foes")) if b.has("foes") else [b["enemy"]]


static func foe_up(f: Dictionary) -> bool:
	return float(f["hp"]) > 0.0 and not f.get("down", false)


## The first enemy still afloat (the lead, while it lives), or -1.
static func first_foe(b: Dictionary) -> int:
	var fs: Array = foes(b)
	for j: int in fs.size():
		if foe_up(fs[j]):
			return j
	return -1


## A seat's target this round: its pick if that ship is still afloat.
static func target_of(b: Dictionary, plan: Dictionary) -> int:
	var fs: Array = foes(b)
	var t: int = int(Js.nz(plan.get("target"), 0.0))
	if t >= 0 and t < fs.size() and foe_up(fs[t]):
		return t
	return first_foe(b)


static func _tag(ev: Array, from: int, j: int) -> void:
	for k: int in range(from, ev.size()):
		if not (ev[k] as Dictionary).has("foe"):
			ev[k]["foe"] = j


## A raid's hand as the port fights it: the raid's own, with the port's
## changes laid over (port rules battle.enemyMods: an earlier status special
## and the pattern that uses it).
static func enemy_def(raid: Dictionary, id: Variant) -> Dictionary:
	var e: Dictionary = Js.obj(raid["enemies"][id]).duplicate(true)
	var md: Dictionary = Js.obj(Js.obj(Js.obj(cfg().get("enemyMods")).get(str(raid.get("raidId", "")))).get(str(id)))
	for k: String in md:
		e[k] = md[k].duplicate(true) if md[k] is Dictionary or md[k] is Array else md[k]
	return e


static func roles_cfg() -> Dictionary:
	return Js.obj(cfg().get("roles"))


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


## Out of the fight: sunk, or got away.
static func _out(s: Dictionary) -> bool:
	return s.get("sunk", false) == true or s.get("fled", false) == true


static func alive(b: Dictionary) -> Array:
	return (b["seats"] as Array).filter(func(s: Dictionary) -> bool: return not s.get("sunk", false) and not s.get("fled", false))


static func start_fight(b: Dictionary, r: int) -> void:
	var raid: Dictionary = raid_def(str(b["raidId"]))
	var f: Dictionary = fight_at(raid, r)
	var e: Dictionary = enemy_def(raid, f["enemyId"])
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
	var tc: Dictionary = tier_cfg(b)
	var hp_mult: float = party_hp_mult(n)
	if not tc.is_empty():
		# A field: more ships instead of a fatter one (the boss keeps some of it).
		hp_mult = (party_hp_mult(n) * float(tc["bossHp"]) if f["boss"] else float(tc["leadHp"])) * float(tc["hpMult"])
		e["minDmg"] = maxf(1.0, float(Js.round(float(e["minDmg"]) * float(tc["dmgMult"]))))
		e["maxDmg"] = maxf(1.0, float(Js.round(float(e["maxDmg"]) * float(tc["dmgMult"]))))
	var hp: float = maxf(1.0, float(Js.round(float(e["hpBase"]) * hp_mult * hp_scale)))
	b["fight"] = float(r)
	b["enemy"] = _make_foe(raid, e, f["boss"] and not skirmish, affix, elite, hp)
	b["foes"] = [b["enemy"]]
	if not tc.is_empty():
		_escorts(b, raid, f, n, hp_scale)
	b["turn"] = 1.0
	b["state"] = "plan"
	b.erase("flares")
	_seats_into_fight(b, raid, e, f)


## One enemy ship, ready to fight.
static func _make_foe(raid: Dictionary, e: Dictionary, boss: bool, affix: Dictionary, elite: bool, hp: float) -> Dictionary:
	var acc: float = Js.nz(e.get("accuracy"), Js.nz(raid.get("enemyAccuracy"), 0.0)) + float(e["shipSpeed"])
	var foe: Dictionary = {
		"id": e["id"], "name": e["name"], "hp": hp, "max": hp, "min": e["minDmg"], "maxDmg": e["maxDmg"],
		"speed": e["shipSpeed"], "acc": acc, "crit": Js.nz(e.get("critChance"), 0.0), "pattern": e["pattern"],
		"mag": float(maxi(VOLLEY_COST, int(Js.nz(e.get("magazineSize"), 3.0)))), "charges": float(clampi(int(Js.nz(e.get("startCharges"), 0.0)), 0, 99)),
		"idx": 0.0, "statuses": {}, "dodgedLast": false, "feint": 0.0, "shield": float(Js.round(hp * Js.nz(e.get("shieldPct"), 0.0))),
		"snare": {}, "markPierce": 0.0, "boss": boss, "phase": 1.0,
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
	foe["shield"] = float(Js.round(hp * sp))
	foe["shieldMax"] = foe["shield"]
	foe["shieldPct"] = sp
	return foe


## The line's curses and Terms on the enemy at a fight's start: a barrier
## (the strongest of its own, its affix's, the curse's), loaded guns, hidden
## bars.
static func _line_into_foes(b: Dictionary) -> void:
	b.erase("line")
	var l: Dictionary = _line(b)
	for f: Dictionary in foes(b):
		if float(l["enemyShield"]) > Js.num(f.get("shieldPct")):
			f["shield"] = float(Js.round(float(f["max"]) * float(l["enemyShield"])))
			f["shieldMax"] = f["shield"]
		if float(l["enemyStartCharges"]) != 0.0:
			f["charges"] = clampf(float(f["charges"]) + float(l["enemyStartCharges"]), 0.0, float(f["mag"]))
		if float(l["hideHp"]) > 0.0:
			f["hideHp"] = Dice.next() < float(l["hideHp"])
		if float(l["hideCharges"]) > 0.0:
			f["hideCharges"] = Dice.next() < float(l["hideCharges"])


## The rest of a field (a co-op tier): escorts from the raid's own crew. An
## ordinary fight fields the party's size (sometimes one fewer; on Challenge
## sometimes one more), the boss comes with the same, 1 to 4 ships in all.
static func _escorts(b: Dictionary, raid: Dictionary, f: Dictionary, n: int, hp_scale: float) -> void:
	var tc: Dictionary = tier_cfg(b)
	var k: int = n
	if Dice.next() < 0.4:
		k -= 1
	if Dice.next() < float(tc["extraFoeChance"]):
		k += 1
	k = clampi(k, 1, 4)
	var seq: Array = Js.list(raid.get("sequence"))
	for j: int in range(1, k):
		var id: Variant = seq[int(floor(Dice.next() * seq.size()))]
		var e: Dictionary = enemy_def(raid, id)
		var affix: Dictionary = {}
		var elite: bool = false
		if tc.get("eliteEscorts", false) and e.get("affix") == null:
			affix = Js.obj(_affixes().get(_roll_affix())).duplicate()
			elite = true
		elif e.get("affix") != null:
			affix = Js.obj(_affixes().get(e["affix"])).duplicate()
		e["minDmg"] = maxf(1.0, float(Js.round(float(e["minDmg"]) * float(tc["dmgMult"]))))
		e["maxDmg"] = maxf(1.0, float(Js.round(float(e["maxDmg"]) * float(tc["dmgMult"]))))
		var hp: float = maxf(1.0, float(Js.round(float(e["hpBase"]) * float(tc["escortHp"]) * float(tc["hpMult"]) * hp_scale)))
		var foe: Dictionary = _make_foe(raid, e, false, affix, elite, hp)
		_escort_of(b, foe)
		(b["foes"] as Array).append(foe)


## An escort's trappings: a role, each its own while any are left, and none
## of a boss's.
static func _escort_of(b: Dictionary, foe: Dictionary, given: Variant = null) -> void:
	foe["escort"] = true
	# A gauntlet pack gives its own (or none); a raid's field deals them out.
	if given != null:
		if str(given) != "":
			foe["role"] = str(given)
			foe["roleTurn"] = 0.0
		foe["phases"] = []
		foe["decoy"] = 0.0
		return
	var rl: Array = Js.list(roles_cfg().get("list")).duplicate()
	for f2: Dictionary in Js.list(b.get("foes")):
		rl.erase(f2.get("role", ""))
	if not rl.is_empty():
		foe["role"] = rl[int(floor(Dice.next() * rl.size()))]
		foe["roleTurn"] = 0.0
	foe["phases"] = []
	foe["decoy"] = 0.0


# ══ A gauntlet's fights (core/gauntlet.gd rolls them, GauntletTable runs the
#    dive) ═══════════════════════════════════════════════════════════════════════

## A dive's battle: the party and its first field. HP carries from fight to
## fight; the table lays the run's effects on each ship (s.tfx) before each.
static func begin_gauntlet(seats: Array, field: Dictionary, variant: String) -> Dictionary:
	var b: Dictionary = { "raidId": "", "gauntlet": variant, "round": 0.0, "fight": -1.0, "seats": seats, "turn": 1.0, "state": "plan", "events": [], "tier": "normal",
		"elites": {}, "bonusAffix": {}, "tides": [], "tideFired": [] }
	gauntlet_fight(b, field, variant)
	return b


## The next field: { enemy, isBoss, isElite, isApex, affix, depth, escorts }.
static func gauntlet_fight(b: Dictionary, field: Dictionary, variant: String) -> void:
	var n: int = maxi(1, alive(b).size())
	var pc: Dictionary = Js.obj(Js.obj(cfg().get("gauntlet")).get("party"))
	var hp_scale: float = 1.0
	for s0: Dictionary in b["seats"]:
		hp_scale *= float(tide_agg(s0)["enemyHpScale"])
	var e: Dictionary = Js.obj(field["enemy"]).duplicate(true)
	var boss: bool = field["isBoss"] == true
	var hp_mult: float = 1.0
	if n > 1:
		hp_mult = party_hp_mult(n) * float(Js.nz(pc.get("bossHp"), 0.9)) if boss else float(Js.nz(pc.get("leadHp"), 1.45))
		for k: String in ["minDmg", "maxDmg"]:
			e[k] = maxf(1.0, float(Js.round(float(e[k]) * float(Js.nz(pc.get("dmgMult"), 1.0)))))
	var hp: float = maxf(1.0, float(Js.round(float(e["hpBase"]) * hp_mult * hp_scale)))
	# The gauntlet's curve already folds the hull's speed into its aim.
	e["accuracy"] = float(e["accuracy"]) - float(e["shipSpeed"])
	b["fight"] = float(b["fight"]) + 1.0
	b["depth"] = field["depth"]
	b["enemy"] = _make_foe({}, e, boss, Js.obj(field.get("affix")), field.get("isElite", false) == true, hp)
	b["enemy"]["wash"] = variant
	b["enemy"]["apex"] = field.get("isApex", false) == true
	b["enemy"]["kind"] = str(e.get("key", ""))
	if field.has("pack"):
		b["enemy"]["pack"] = field["pack"]
	if field.has("leadCombo"):
		b["enemy"]["combo"] = Js.obj(field["leadCombo"]).duplicate()
	b["foes"] = [b["enemy"]]
	var sup: Array = Js.list(Js.obj(Js.obj(Js.obj(cfg().get("gauntlet")).get("packs"))).get("support"))
	for x: Dictionary in Js.list(field.get("escorts")):
		var ex: Dictionary = Js.obj(x["enemy"]).duplicate(true)
		for k2: String in ["minDmg", "maxDmg"]:
			ex[k2] = maxf(1.0, float(Js.round(float(ex[k2]) * float(Js.nz(pc.get("dmgMult"), 1.0)))))
		var hp_k: float = float(Js.nz(pc.get("escortHp"), 0.62))
		# A support ship sails a lighter hull.
		if sup.has(str(x.get("role", ""))):
			hp_k *= float(Js.nz(Js.obj(Js.obj(cfg().get("gauntlet")).get("packs")).get("supportHp"), 0.75))
		var hp2: float = maxf(1.0, float(Js.round(float(ex["hpBase"]) * hp_k * hp_scale)))
		ex["accuracy"] = float(ex["accuracy"]) - float(ex["shipSpeed"])
		var foe: Dictionary = _make_foe({}, ex, false, Js.obj(x.get("affix")), x.get("isElite", false) == true, hp2)
		foe["wash"] = variant
		foe["kind"] = str(x.get("kind", ""))
		if field.has("pack"):
			foe["pack"] = field["pack"]
		if x.has("combo"):
			foe["combo"] = Js.obj(x["combo"]).duplicate()
		_escort_of(b, foe, x.get("role") if x.has("role") else null)
		(b["foes"] as Array).append(foe)
	b["turn"] = 1.0
	b["state"] = "plan"
	b.erase("flares")
	b.erase("line")
	_seats_into_fight(b, {}, e, { "boss": boss })


## The seats readied for a new fight (charges, tides, the palisade, the
## Quartermaster's repossession), and a boss's opening check.
static func _seats_into_fight(b: Dictionary, raid: Dictionary, e: Dictionary, f: Dictionary) -> void:
	for s: Dictionary in b["seats"]:
		_ready_seat(s)
		if _out(s):
			continue
		# The tides the captain took: the fight's opening HP and balls, and
		# their banked sure dodges.
		var ta: Dictionary = tide_agg(s, f["boss"])
		var mx: float = float(s["max"])
		s["healMult"] = float(ta["healMult"])
		s["healCap"] = float(Js.round(mx * (1.0 + float(ta["overheal"]))))
		var hp1: float = float(s["hp"]) + float(Js.round(float(ta["startHpPct"]) * mx)) + float(Js.round(float(ta["startHealPct"]) * mx * float(ta["healMult"])))
		s["hp"] = clampf(hp1, 1.0, float(s["healCap"]))
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
		# A gauntlet's carried balls (Powder Hoard) come aboard on top.
		s["charges"] = clampf(primed + float(ta["startCharges"]) + Js.num(s.get("carry")), 0.0, float(s["maxCharges"]))
		s.erase("carry")
		s["dodgeToken"] = float(ta["guaranteedDodge"])
		# The palisade: a ward over the hull every fight; a run's fight shield
		# (Bulwark, the Whale's Mark) adds to it.
		s["wardMax"] = float(Js.round(float(fx.get("wardPct", 0.0)) * mx))
		s["wardRefill"] = float(Js.round(float(s["wardMax"]) * float(fx.get("wardRefill", 0.0))))
		var pool: float = float(Js.round(float(ta["fightShield"]) * mx)) + float(s["wardMax"])
		if pool > 0.0:
			s["shield"] = pool
		# The run's opening statuses (a curse's Feeble), then the Don's Favor.
		for st0: Dictionary in ta["startStatus"]:
			seat_status(s, str(st0["status"]), float(st0["magnitude"]), float(st0["turns"]))
		if float(ta["favor"]) > 0.0:
			var mag: float = float(ta["favor"])
			var r: float = Dice.next()
			if r < 0.34:
				apply_status(s["statuses"], "enrage", mag, 99.0)
				s["favor"] = "enrage"
			elif r < 0.67:
				apply_status(s["statuses"], "fortify", mag, 99.0)
				s["favor"] = "fortify"
			else:
				apply_status(s["statuses"], "regen", maxf(3.0, float(Js.round(mx * (0.03 + mag * 0.06)))), 99.0)
				s["favor"] = "regen"
	_line_into_foes(b)
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
static func judge(pos: float, zone: float, crit_w: float = CRIT_W, scale: float = 1.0) -> String:
	if absf(pos - zone) <= crit_w:
		return "critical"
	if absf(pos - zone) <= HIT_W * scale:
		return "hit"
	if absf(pos - zone) <= (HIT_W + GRAZE_W) * scale:
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
static func aim_for(b: Dictionary, si: int, target: int = -1) -> Dictionary:
	if target >= 0 and target < foes(b).size():
		var keep: Dictionary = b["enemy"]
		b["enemy"] = foes(b)[target]
		var out: Dictionary = aim_for(b, si)
		b["enemy"] = keep
		return out
	var e: Dictionary = b["enemy"]
	var s: Dictionary = b["seats"][si]
	var ta: Dictionary = tide_agg(s)
	var stack: float = minf(4.0, float(ta["zoneSpeed"]) * float(e["zoneMult"]) * float(Js.nz(Js.obj(e["affix"]).get("zoneSpeedMult"), 1.0)))
	var clear: float = 1.0 - float(ta["clarity"])
	var out: Dictionary = {
		"enemySpeed": float(e["speed"]), "zoneStack": stack, "needleMult": float(e["aimSpeed"]) * float(ta["aimSpeed"]),
		"critDrift": float(e["critDrift"]), "fog": minf(0.95, float(e["fog"]) + float(ta["fog"])) * clear, "critZone": float(ta["critZone"]),
		"afflict": "", "decoys": 0,
		"blind": 0.0, "narrow": 1.0,
		# The run's own: a dark veil that comes and goes (render only), and
		# phantom zones (the bar rolls whether they come, 45%).
		"blackout": float(ta["blackout"]) * clear, "decoyN": 0 if float(ta["clarity"]) >= 1.0 else int(ta["decoys"]),
	}
	var st: Dictionary = Js.obj(s.get("statuses"))
	if st.has("blinded"):
		out["blind"] = clampf(float(st["blinded"]["mag"]), 0.05, 0.3)
	# Signal Flags: a crewmate's reload last round widens this ship's crit zone.
	var sig: float = 0.0
	for o: Dictionary in b["seats"]:
		if o != s:
			sig = maxf(sig, Js.num(o.get("signalLive")))
	if sig > 0.0:
		out["critZone"] = float(out["critZone"]) * (1.0 + sig)
	if st.has("narrowed"):
		out["narrow"] = clampf(1.0 - float(st["narrowed"]["mag"]), 0.3, 1.0)
	var af: Dictionary = s["afflict"]
	if not af.is_empty() and float(af["passes"]) > 0.0:
		out["afflict"] = af["kind"]
		if af["kind"] == "decoys" and float(ta["clarity"]) < 1.0:
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
## The repair kit a seat carries (its captain's equipped one), or {}.
static func repair_kit(s: Dictionary) -> Dictionary:
	var id: String = str(s.get("repairKit", ""))
	if id == "" or id == "<null>":
		return {}
	for k: Dictionary in Js.list(Js.obj(cfg().get("repairKits")).get("list")):
		if k["id"] == id:
			return k
	return {}


## Its heal range: the kit's floor, its ceiling lifted by the crew's Fortune.
static func repair_range(s: Dictionary) -> Vector2:
	var k: Dictionary = repair_kit(s)
	if k.is_empty():
		return Vector2.ZERO
	var bonus: float = floor(maxf(0.0, Js.num(s.get("fortune"))) * float(Js.nz(Js.obj(cfg().get("repairKits")).get("fortuneHealScale"), 0.25)))
	return Vector2(float(k["baseMin"]), float(k["baseMax"]) + bonus)


static func legal(b: Dictionary, s: Dictionary) -> Dictionary:
	var c: float = float(s.get("charges", 0.0))
	var mg: Dictionary = Js.obj(s.get("mega"))
	return {
		"fire": c >= 1.0, "volley": c >= volley_cost(s), "reload": c < float(s["maxCharges"]),
		"mega": not mg.is_empty() and c >= mega_cost(s),
		"dodge": s.get("last", "") != "dodge",
		"repair": not repair_kit(s).is_empty() and not s.get("kitUsed", false) and float(s.get("hp", 0.0)) < float(s.get("max", 0.0)),
	}


## A crew ability a seat may fire now: not used this raid, one per turn, not
## silenced.
static func ability_ok(b: Dictionary, s: Dictionary, crew_id: Variant) -> String:
	if _out(s):
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
	if _out(t):
		t = s
	var e: Dictionary = b["enemy"]
	var ms: Dictionary = c["ms"]
	var out: Dictionary = { "t": "ability", "seat": si, "crew": c["id"], "cls": c["cls"], "name": c["name"], "target": (b["seats"] as Array).find(t) }
	var flags: Array = []
	match str(c["cls"]):
		"mender":
			var heal: float = float(Js.round(float(t["max"]) * float(ms["pctMaxHp"])))
			out["heal"] = _heal_m(t, heal)
			t["burn"] = {}
			if ms.get("cleanseDebuff", false):
				_cleanse(t)
			flags = ["heal"]
		"abyssal_tide":
			out["heal"] = _heal_m(t, float(Js.round(float(t["max"]) * float(ms["pctMaxHp"]))))
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
			_el(b, e, "marked", si)
			if ms.get("pierceShield", false):
				e["markPierce"] = float(ms["markTurns"])
			flags = ["snare", "burst"]
	_note_check(b, flags)
	# Second Calling: the order may stay unspent.
	var rf: float = float(tide_agg(s)["abilityRefund"])
	if rf > 0.0 and Dice.next() < rf:
		(s["used"] as Array).erase(c["id"])
		out["refund"] = true
	ev.append(out)
	if float(e["hp"]) <= 0.0:
		_enemy_down(b, ev, true)


static func _heal(t: Dictionary, n: float) -> float:
	var before: float = float(t["hp"])
	t["hp"] = maxf(before, minf(float(t.get("healCap", t["max"])), before + n))
	return float(t["hp"]) - before


## A heal the run's heal multiplier scales (Iron Rations, Mending).
static func _heal_m(t: Dictionary, n: float) -> float:
	return _heal(t, float(Js.round(n * float(t.get("healMult", 1.0)))))


static func _cleanse(t: Dictionary) -> void:
	if tide_agg(t)["noCleanse"]:
		return
	for id: String in ["weaken", "feeble", "marked", "slowed", "silence", "corrode"]:
		(t["statuses"] as Dictionary).erase(id)


static func _ability_mult(b: Dictionary, s: Dictionary) -> float:
	var e: Dictionary = b["enemy"]
	var ta: Dictionary = tide_agg(s, e["boss"])
	var raw: float = float(s["dmgMult"]) * (1.0 + float(s["vBuff"])) * float(mods(s["statuses"])["dealt"]) * float(mods(e["statuses"])["taken"]) * float(ta["dmgMult"])
	# A crew order counts an elite as big game (a shot counts only a boss).
	if e["boss"] or e.get("elite", false):
		raw *= float(ta["bossMult"])
	if Js.num(e.get("freeze")) > 0.0 and float(ta["frozenDmg"]) > 1.0:
		raw *= float(ta["frozenDmg"])
	if float(ta["lowHp"]) > 0.0:
		raw *= 1.0 + float(ta["lowHp"]) * maxf(0.0, 1.0 - float(s["hp"]) / float(s["max"]))
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
	var fs: Array = foes(b)
	for f0: Dictionary in fs:
		f0["jammed"] = false
		f0["xfire"] = 0.0
		f0["spot"] = {}
		f0.erase("deathMark")
		f0["hitBy"] = []
		f0["volleyBy"] = []
		f0["boarded"] = false
		f0.erase("xfSeats")
	_bond_round_start(b)
	# Crew orders first, in seat order (one aimed at an enemy goes at the
	# captain's target).
	for i: int in plans.size():
		var ab: Variant = Js.obj(plans[i]).get("ability")
		if ab is Dictionary and not _out(b["seats"][i]):
			var tj: int = target_of(b, Js.obj(plans[i]))
			if tj < 0:
				break
			b["enemy"] = fs[tj]
			var n0: int = ev.size()
			use_ability(b, i, ab["crew"], int(Js.nz(ab.get("target"), float(i))), ev)
			_tag(ev, n0, tj)
			if float(fs[tj]["hp"]) <= 0.0 and not b.get("revived", false):
				fs[tj]["down"] = true
			b.erase("revived")
	if first_foe(b) < 0 or b["state"] != "plan":
		return _finish(b, ev)
	# Each ship's action as it will be taken (an illegal pick falls back), so
	# a dodge stance is read the same whichever side acts first.
	for i: int in plans.size():
		var s0: Dictionary = b["seats"][i]
		if _out(s0):
			continue
		var p0: Dictionary = Js.obj(plans[i]).duplicate()
		var lg0: Dictionary = legal(b, s0)
		var act0: String = str(p0.get("action", "reload"))
		if not lg0.get(act0, false):
			act0 = "reload" if lg0["reload"] else ("fire" if lg0["fire"] else "dodge")
			p0["aim"] = "miss"
		p0["action"] = act0
		plans[i] = p0
	# Every enemy's move; freezes take hold, burns tick.
	for j: int in fs.size():
		var e: Dictionary = fs[j]
		if not foe_up(e):
			continue
		b["enemy"] = e
		var n1: int = ev.size()
		var e_act: String = pick_enemy(b)
		e["action"] = e_act
		ev.append({ "t": "intent", "action": e_act, "jammed": e.get("jammed", false) })
		# A curse's barrier grows back toward its opening size.
		var rg: float = float(_line(b)["regrow"])
		if rg > 0.0 and Js.num(e.get("shieldMax")) > 0.0 and float(e["hp"]) > 0.0 and float(e["shield"]) < float(e["shieldMax"]):
			e["shield"] = minf(float(e["shieldMax"]), float(e["shield"]) + float(Js.round(float(e["shieldMax"]) * rg)))
		e["frozenNow"] = float(e.get("freeze", 0.0)) > 0.0
		if e["frozenNow"]:
			e["freeze"] = float(e["freeze"]) - 1.0
		var eb: Dictionary = e.get("burn", {})
		if not eb.is_empty() and float(e["hp"]) > 0.0 and (e["aegis"] as Dictionary).is_empty():
			# Backdraft: the flames flare a second time; the fire feeds the
			# ship that lit it.
			var tick: float = float(eb["dmg"])
			var flare: float = float(Js.round(tick * 0.7)) if eb.get("backdraft", false) and Dice.next() < 0.35 else 0.0
			e["hp"] = _ward_floor(b, float(e["hp"]) - (tick + flare), ev)
			var bev: Dictionary = { "t": "eBurn", "dmg": tick + flare, "flare": flare, "hp": e["hp"] }
			var by: int = int(Js.nz(eb.get("by"), -1.0))
			if by >= 0 and float(eb.get("feed", 0.0)) > 0.0 and not _out(b["seats"][by]) and float(b["seats"][by]["hp"]) > 0.0:
				var bs: Dictionary = b["seats"][by]
				var pf: float = float(eb["feed"])
				var feed: float = minf(minf(float(Js.round(float(bs["max"]) * minf(pf, 0.35) * 2.0)), float(bs.get("healCap", bs["max"])) - float(bs["hp"])), float(Js.round((tick + flare) * pf)))
				if feed > 0.0:
					bs["hp"] = float(bs["hp"]) + feed
					bev["feed"] = feed
					bev["seat"] = by
			ev.append(bev)
			eb["turns"] = float(eb["turns"]) - 1.0
			if float(eb["turns"]) <= 0.0:
				e["burn"] = {}
			if by >= 0:
				finish_check(b, by, false, ev)
			if float(e["hp"]) <= 0.0:
				_enemy_down(b, ev, false)
				if not b.get("revived", false):
					e["down"] = true
				b.erase("revived")
		_tag(ev, n1, j)
	if first_foe(b) < 0:
		return _finish(b, ev)
	for i: int in (b["seats"] as Array).size():
		var sf: Dictionary = b["seats"][i]
		sf["frozenNow"] = float(sf.get("freeze", 0.0)) > 0.0 and not _out(sf)
		if sf["frozenNow"]:
			sf["freeze"] = 0.0
		var bn: Dictionary = sf.get("burn", {})
		if not bn.is_empty() and not _out(sf):
			sf["hp"] = maxf(0.0, float(sf["hp"]) - float(bn["dmg"]))
			ev.append({ "t": "burn", "seat": i, "dmg": bn["dmg"], "hp": sf["hp"] })
			bn["turns"] = float(bn["turns"]) - 1.0
			if float(bn["turns"]) <= 0.0:
				sf["burn"] = {}
	_bond_plans(b, plans)
	# Crossfire: the criticals landed on the bars this round, on ONE enemy.
	var by_foe: Dictionary = {}
	for i: int in plans.size():
		var sc: Dictionary = b["seats"][i]
		var pc: Dictionary = Js.obj(plans[i])
		if not _out(sc) and not sc.get("frozenNow", false) and str(pc.get("action", "")) in ["fire", "volley", "mega"] and str(pc.get("aim", "")) == "critical":
			var tj2: int = target_of(b, pc)
			if not by_foe.has(tj2):
				by_foe[tj2] = []
			(by_foe[tj2] as Array).append(i)
	for tj3: Variant in by_foe:
		var crits: Array = by_foe[tj3]
		# Crossed Guns: a plain hit on a ship a crewmate crits joins in.
		var weight: float = float(crits.size())
		var joined: Array = crits.duplicate()
		for i3: int in plans.size():
			var sc3: Dictionary = b["seats"][i3]
			var pc3: Dictionary = Js.obj(plans[i3])
			var cg: Dictionary = bond_of(sc3, "bondCrossed")
			if cg.is_empty() or crits.has(i3) or _out(sc3) or sc3.get("frozenNow", false) or crits.is_empty():
				continue
			if str(pc3.get("action", "")) in ["fire", "volley", "mega"] and str(pc3.get("aim", "")) == "hit" and target_of(b, pc3) == int(tj3):
				weight += float(cg["pct"])
				joined.append(i3)
		if weight >= 2.0:
			fs[int(tj3)]["xfire"] = weight
			fs[int(tj3)]["xfSeats"] = joined
			ev.append({ "t": "crossfire", "seats": joined, "mult": crossfire_mult(weight), "foe": int(tj3) })
	# Counter-Battery: a ship shooting into a foe that is shooting back may
	# smash its shot out of the air (rolled now, spent on the foe's turn).
	for i: int in plans.size():
		var sc2: Dictionary = b["seats"][i]
		sc2.erase("counterOn")
		sc2["counterProc"] = false
		if _out(sc2) or sc2.get("frozenNow", false):
			continue
		var pc2: Dictionary = Js.obj(plans[i])
		var ta0: Dictionary = tide_agg(sc2)
		if float(ta0["counter"]) <= 0.0 or not (str(pc2.get("action", "")) in ["fire", "volley", "mega"]) or str(pc2.get("aim", "")) in ["miss", "fumble"]:
			continue
		var tjc: int = target_of(b, pc2)
		if tjc >= 0 and str(fs[tjc].get("action", "")) in ["fire", "volley"] and Dice.next() < float(ta0["counter"]) + float(ta0["counterChance"]):
			sc2["counterOn"] = tjc
			sc2["counterProc"] = true
	# Initiative: every ship and every enemy (an enemy's place is -1 - its
	# index: -1 the lead). A ship may seize the opening (Weather Gauge).
	var order: Array = []
	for i: int in plans.size():
		var s: Dictionary = b["seats"][i]
		if _out(s):
			continue
		var ta1: Dictionary = tide_agg(s)
		var roll: int = d20() + int(maxf(1.0, float(s["speed"]) + float(ta1["speed"]) + float(mods(s["statuses"])["speed"]))) + int(floor(float(s["nav"]) * float(Js.obj(s.get("fx")).get("navSpeed", 0.0))))
		if float(ta1["firstStrike"]) > 0.0 and Dice.next() < float(ta1["firstStrike"]):
			roll += 1000
			ev.append({ "t": "seize", "seat": i })
		order.append({ "who": i, "roll": roll })
	var e_mods: Array = []
	for j: int in fs.size():
		var e2: Dictionary = fs[j]
		e_mods.append(mods(e2["statuses"]))
		if not foe_up(e2):
			continue
		var er: int = d20() + int(maxf(1.0, float(e2["speed"]) + float(mods(e2["statuses"])["speed"]))) + int(Js.nz(Js.obj(e2["affix"]).get("speedBonus"), 0.0))
		order.append({ "who": -1 - j, "roll": er })
	order.sort_custom(func(x: Dictionary, y: Dictionary) -> bool:
		if x["roll"] != y["roll"]:
			return x["roll"] > y["roll"]
		if (x["who"] < 0) != (y["who"] < 0):
			return x["who"] >= 0
		return absi(x["who"]) < absi(y["who"]))
	ev.append({ "t": "order", "order": order.map(func(o: Dictionary) -> int: return o["who"]) })
	var acted: Dictionary = {}
	for o: Dictionary in order:
		if first_foe(b) < 0 or alive(b).is_empty():
			break
		var who: int = o["who"]
		if who < 0:
			var j2: int = -1 - who
			var ef: Dictionary = fs[j2]
			if not foe_up(ef):
				continue
			b["enemy"] = ef
			acted[j2] = true
			var n2: int = ev.size()
			_enemy_act(b, str(ef["action"]), e_mods[j2], plans, ev)
			_tag(ev, n2, j2)
		else:
			var s2: Dictionary = b["seats"][who]
			if _out(s2) or float(s2["hp"]) <= 0.0:
				continue
			if s2.get("frozenNow", false):
				s2["last"] = ""
				ev.append({ "t": "frozen", "seat": who })
				continue
			var tj4: int = target_of(b, Js.obj(plans[who]))
			if tj4 < 0:
				break
			if str(Js.obj(plans[who]).get("action", "")) in ["fire", "volley", "mega"]:
				tj4 = breakwater(b, who, tj4, ev)
			var et: Dictionary = fs[tj4]
			b["enemy"] = et
			s2["firstVs"] = not acted.has(tj4)
			var n3: int = ev.size()
			_seat_act(b, who, Js.obj(plans[who]), str(et["action"]), e_mods[tj4], ev)
			_tag(ev, n3, tj4)
			if float(et["hp"]) <= 0.0 and not b.get("revived", false):
				et["down"] = true
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
			_bond_reload(b, si, ev)
		"dodge":
			ev.append({ "t": "brace", "seat": si })
		"repair":
			# The repair kit: a heal off the kit's range (Fortune lifts its
			# ceiling), the turn spent, once a fight.
			var kit: Dictionary = repair_kit(s)
			if not kit.is_empty() and not s.get("kitUsed", false):
				s["kitUsed"] = true
				var rg: Vector2 = repair_range(s)
				var roll: float = rg.x + floor(Dice.next() * (rg.y - rg.x + 1.0))
				roll = float(Js.round(roll * float(tide_agg(s)["repairHeal"]) * float(s.get("healMult", 1.0)) * float(s.get("repairMult", 1.0))))
				var got: float = _heal(s, roll)
				ev.append({ "t": "repair", "seat": si, "heal": got, "hp": s["hp"], "name": kit.get("name", "Repair Kit") })
		"fire", "volley", "mega":
			var mega: Dictionary = Js.obj(s.get("mega")) if act == "mega" else {}
			var cost: float = 1.0 if act == "fire" else (volley_cost(s) if act == "volley" else mega_cost(s))
			var res: String = str(plan.get("aim", "miss"))
			# Every locked shot counts (a dud too): the every-Nth crit and the
			# opening double strike read it.
			var out_every: bool = false
			var locked_before: float = Js.num(s.get("locked"))
			s["locked"] = locked_before + 1.0
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
			# A hit may still come up a crit (a tide's chance, a crow's nest),
			# and every Nth locked shot that hits does (Gunner's Count).
			var up: float = float(ta2["critBonus"]) + float(fx.get("critUpgrade", 0.0))
			if res == "hit" and up > 0.0 and Dice.next() < up:
				res = "critical"
			if res == "hit" and float(ta2["critEvery"]) > 0.0 and int(locked_before + 1.0) % int(ta2["critEvery"]) == 0:
				res = "critical"
				out_every = true
			var sh: Dictionary = s["sharp"]
			if not sh.is_empty():
				sh["shots"] = float(sh["shots"]) - 1.0
				if float(sh["shots"]) <= 0.0:
					s["sharp"] = {}
			var tmult: float = float(ta2["dmgMult"]) * (float(ta2["fireMult"]) if act == "fire" else (float(ta2["volleyMult"]) if act == "volley" else float(ta2["megaMult"])))
			if e["boss"]:
				tmult *= float(ta2["bossMult"]) * (float(ta2["bossVolMult"]) if act != "fire" else 1.0)
			tmult *= float(fx.get("fireMult", 1.0)) if act == "fire" else (float(fx.get("volleyMult", 1.0)) if act == "volley" else float(fx.get("megaMult", 1.0)))
			var crit_shot: bool = res == "critical"
			# Crossfire rides only on a crit landed on the bar.
			var xf: float = crossfire_mult(float(e.get("xfire", 0.0))) if (str(plan.get("aim", "")) == "critical" or Js.list(e.get("xfSeats")).has(si)) else 1.0
			# Converging Fire: this ship's share of the crossfire, bigger.
			var cvg: Dictionary = bond_of(s, "bondConverge")
			if xf > 1.0 and not cvg.is_empty():
				xf = 1.0 + (xf - 1.0) * (1.0 + float(cvg["pct"]))
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
			# The run's riders on this shot: crit and plain-shot lanes, the
			# low-hull fury, a frozen hull (brittle doubles it on a crit), the
			# volley ramp, the crit streak, the opening double strike.
			var rmult: float = float(ta2["critDmg"]) if crit_shot else float(ta2["noncrit"])
			if float(ta2["lowHp"]) > 0.0:
				rmult *= 1.0 + float(ta2["lowHp"]) * maxf(0.0, 1.0 - float(s["hp"]) / float(s["max"]))
			if e.get("frozenNow", false) and float(ta2["frozenDmg"]) > 1.0:
				var fm: float = float(ta2["frozenDmg"])
				rmult *= 1.0 + 2.0 * (fm - 1.0) if crit_shot and ta2["brittle"] else fm
			if act == "volley" and float(ta2["volleyRamp"]) > 0.0:
				rmult *= 1.0 + minf(float(ta2["volleyRamp"]) * Js.num(s.get("volleys")), 1.0)
			if crit_shot and float(ta2["streakPer"]) > 0.0:
				rmult *= 1.0 + float(ta2["streakPer"]) * minf(float(ta2["streakMax"]), Js.num(s.get("streak")) + 1.0)
			var doubled: bool = false
			if float(ta2["doubleStrike"]) > 0.0 and locked_before == 0.0 and s.get("firstVs", false) and act != "mega" and res != "miss" and Dice.next() < float(ta2["doubleStrike"]):
				rmult *= 2.0
				doubled = true
			rmult *= _bond_shot_mult(b, si, e, ev)
			var mult: float = base_mult * float(s["dmgMult"]) * (1.0 + float(s["vBuff"])) * float(mods(s["statuses"])["dealt"]) * float(e_mods["taken"]) * tmult * imult * xf * rmult
			var dmg: float = floor(roll_shot(res, float(s["shipMin"]), float(s["power"])) * mult)
			var out: Dictionary = { "t": "shot", "seat": si, "action": act, "aim": res, "raw": dmg, "mega": mega.get("id") }
			if xf > 1.0:
				out["crossfire"] = xf
			if doubled:
				out["double"] = true
			if out_every:
				out["every"] = true
			if act == "volley":
				s["volleys"] = Js.num(s.get("volleys")) + 1.0
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
				_streak(s, ta2, crit_shot, ev, si)
				return
			# A curse's parry: the shot turned aside (never a Mega).
			if dmg > 0.0 and act != "mega" and float(_line(b)["enemyParry"]) > 0.0 and Dice.next() < float(_line(b)["enemyParry"]):
				dmg = 0.0
				out["eParried"] = true
			# The enemy's shield (a run's piercing shot sends part past it).
			var to_hull: float = dmg
			if dmg > 0.0 and float(e["shield"]) > 0.0 and float(e["markPierce"]) <= 0.0 and not mega.get("pierce", false):
				var bypass: float = float(Js.round(dmg * minf(1.0, float(ta2["shieldPierce"])))) if float(ta2["shieldPierce"]) > 0.0 else 0.0
				var soakable: float = dmg - bypass
				var bite: float = float(Js.round(soakable * float(e_mods["shieldTaken"])))
				var absorbed: float = minf(float(e["shield"]), bite)
				e["shield"] = float(e["shield"]) - absorbed
				to_hull = maxf(0.0, soakable - ceil(absorbed / float(e_mods["shieldTaken"]))) + bypass
				out["shielded"] = absorbed
			var before: float = float(e["hp"])
			var overkill: float = maxf(0.0, to_hull - before)
			e["hp"] = _ward_floor(b, float(e["hp"]) - to_hull, ev)
			out["dmg"] = to_hull
			out["enemyHp"] = e["hp"]
			ev.append(out)
			if dmg > 0.0:
				_bond_landed(b, si, e, act, crit_shot, dmg, xf, ev)
			if dmg > 0.0:
				# Press-Gang: a ball ripped off its rack and rammed into yours.
				if float(ta2["steal"]) > 0.0 and float(e["hp"]) > 0.0 and float(e["charges"]) > 0.0 and Dice.next() < float(ta2["steal"]):
					e["charges"] = float(e["charges"]) - 1.0
					var kept: bool = float(s["charges"]) < float(s["maxCharges"])
					if kept:
						s["charges"] = float(s["charges"]) + 1.0
					ev.append({ "t": "steal", "seat": si, "kept": kept, "charges": s["charges"], "eCharges": e["charges"] })
				_leech(b, si, dmg, ta2, ev)
				if overkill > 0.0 and float(ta2["overkillHeal"]) > 0.0 and float(s["hp"]) > 0.0:
					var pk: float = float(ta2["overkillHeal"])
					var got2: float = _heal(s, float(Js.round(minf(float(Js.round(float(s["max"]) * minf(pk, 0.35) * 2.0)), maxf(1.0, float(Js.round(overkill * pk)))) * float(s.get("healMult", 1.0)))))
					if got2 > 0.0:
						ev.append({ "t": "overkill", "seat": si, "heal": got2, "hp": s["hp"] })
						_surgeon(b, si, got2, ev)
				finish_check(b, si, crit_shot, ev)
			if dmg > 0.0 and float(e["hp"]) > 0.0:
				_on_hit(b, si, dmg, crit_shot, ev, Js.list(mega.get("hits")).size())
				# The Nuke's fallout: the wreck burns.
				if mega.get("fallout") is Dictionary:
					e["burn"] = { "turns": float(mega["fallout"]["turns"]), "dmg": maxf(1.0, float(Js.round(dmg * float(mega["fallout"]["pct"])))), "by": float(si) }
					_el(b, e, "fire", si)
					ev.append({ "t": "eAblaze", "seat": si, "dmg": e["burn"]["dmg"], "fallout": true })
				_reactions(b, si, e, act, dmg, ev)
			if not out.get("dodged", false):
				_streak(s, ta2, crit_shot, ev, si)
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
	if str(e.get("role", "")) != "" and _role_turn(b, e, ev):
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
	# Counter-Battery: a ship that rolled it smashes this shot out of the air.
	if act in ["fire", "volley"]:
		var me_j: int = foes(b).find(e)
		for ci: int in (b["seats"] as Array).size():
			var cs: Dictionary = b["seats"][ci]
			if _out(cs) or int(Js.nz(cs.get("counterOn"), -1.0)) != me_j:
				continue
			cs.erase("counterOn")
			e["charges"] = maxf(0.0, float(e["charges"]) - cost)
			var cta: Dictionary = tide_agg(cs)
			var gain: float = minf(float(cs["maxCharges"]) - float(cs["charges"]), float(cta["counterRefund"]))
			if gain > 0.0:
				cs["charges"] = float(cs["charges"]) + gain
			var cev: Dictionary = { "t": "counter", "seat": ci, "gain": gain }
			if float(cta["counterReflect"]) > 0.0 and float(e["hp"]) > 0.0:
				var pm: float = float(Js.nz(_phase(e).get("damageMult"), 1.0))
				var back: float = maxf(1.0, floor(float(rand_int(int(e["min"]), int(e["maxDmg"]))) * (2.0 if act == "volley" else 1.0) * pm * float(cta["counterReflect"])))
				e["hp"] = maxf(0.0, float(e["hp"]) - back)
				cev["reflect"] = back
				cev["enemyHp"] = e["hp"]
			ev.append(cev)
			finish_check(b, ci, false, ev)
			if float(e["hp"]) <= 0.0:
				_enemy_down(b, ev, false)
			return
	match act:
		"reload":
			var more: float = 1.0 if float(_line(b)["enemyUltCharge"]) > 0.0 and Dice.next() < float(_line(b)["enemyUltCharge"]) else 0.0
			e["charges"] = minf(float(e["mag"]), float(e["charges"]) + 1.0 + more)
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
						seat_status(b["seats"][tg], str(sp["status"]), Js.nz(sp.get("magnitude"), 0.0), Js.nz(sp.get("turns"), 1.0))
			ev.append({ "t": "eSpecial", "name": sp.get("name", ""), "line": sp.get("line", "") })
		"fire", "volley", "ultimate":
			e["charges"] = maxf(0.0, float(e["charges"]) - cost)
			if broadside(b, act):
				# A BROADSIDE: every ship afloat at once, each its own dodge.
				ev.append({ "t": "eBroadside", "action": act })
				var k0: int = 0
				for i: int in (b["seats"] as Array).size():
					var s3: Dictionary = b["seats"][i]
					if not _out(s3) and float(s3["hp"]) > 0.0:
						_enemy_shot(b, act, i, e_mods, plans, ev, k0 == 0, true)
						k0 += 1
			else:
				# Aimed shots (party scaling: a bigger line draws more), each at
				# a different ship it picks as it fires.
				var shots: int = 1
				var sh_tab: Array = Js.list(Js.obj(cfg().get("party")).get("shots"))
				if not sh_tab.is_empty():
					shots = int(sh_tab[clampi((b["seats"] as Array).size(), 1, sh_tab.size()) - 1])
				if foes(b).size() > 1:
					shots = maxi(1, shots - 1) if e["boss"] else 1
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
	var df: int = _draw_fire(b)
	if df >= 0:
		return df
	var pool: Array = []
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if not _out(s) and float(s["hp"]) > 0.0 and not hit.has(i):
			pool.append(i)
	if pool.is_empty():
		return _target(b, -1)
	return pool[int(floor(Dice.next() * pool.size()))]


## Its target: a ship still afloat, at random (never shown before it fires);
## `not_i` is passed over when another ship is left.
static func _target(b: Dictionary, not_i: int) -> int:
	var df: int = _draw_fire(b, not_i)
	if df >= 0:
		return df
	var pool: Array = []
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if not _out(s) and float(s["hp"]) > 0.0 and i != not_i:
			pool.append(i)
	if pool.is_empty():
		return not_i
	return pool[int(floor(Dice.next() * pool.size()))]


static func _enemy_shot(b: Dictionary, act: String, ti: int, e_mods: Dictionary, plans: Array, ev: Array, main: bool, all: bool = false, frenzy: bool = false) -> void:
	if ti < 0:
		return
	ti = _shield_wall(b, ti, ev)
	var e: Dictionary = b["enemy"]
	var t: Dictionary = b["seats"][ti]
	var base: float = float(rand_int(int(e["min"]), int(e["maxDmg"])))
	var dmg: float
	if act == "ultimate":
		dmg = maxf(1.0, floor(base * Js.nz(Js.obj(e.get("ultimate")).get("mult"), 2.6) * float(_line(b)["enemyUlt"])))
	else:
		dmg = base * (2.0 if act == "volley" else 1.0)
	if float(e_mods["dealt"]) != 1.0:
		dmg = maxf(1.0, floor(dmg * float(e_mods["dealt"])))
	if int(e["phase"]) >= 2:
		dmg = maxf(1.0, floor(dmg * float(e["phases"][int(e["phase"]) - 2].get("damageMult", 1.0))))
	if float(e["wardBuff"]) > 0.0:
		dmg = maxf(1.0, floor(dmg * (1.0 + float(e["wardBuff"]))))
	var af: Dictionary = e["affix"]
	var ta: Dictionary = tide_agg(t, e["boss"])
	var eff_crit: float = 0.0 if act == "ultimate" else minf(1.0, float(e["crit"]) * float(Js.nz(af.get("critMult"), 1.0)))
	var combo_ev: String = ""
	if not Js.obj(e.get("combo")).is_empty() and str(e["combo"].get("half", "")) == "partner":
		var st: Dictionary = t["statuses"]
		if combo_partner(b, e, "hammer_anvil") >= 0 and (st.has("blinded") or st.has("narrowed")):
			dmg = maxf(1.0, floor(dmg * (1.0 + float(Js.nz(combo_def(e, "hammer_anvil").get("pct"), 0.25)))))
			combo_ev = "Hammer and Anvil"
		if combo_partner(b, e, "called_shot") >= 0 and st.has("marked") and act != "ultimate":
			eff_crit = minf(1.0, eff_crit + float(Js.nz(combo_def(e, "called_shot").get("crit"), 0.2)))
			combo_ev = "Called Shot"
	if combo_ev != "":
		ev.append({ "t": "comboNote", "foe": foes(b).find(e), "seat": ti, "text": combo_ev })
	if not frenzy and float(ta["inCritCut"]) != 0.0 and act != "ultimate":
		eff_crit = clampf(eff_crit - float(ta["inCritCut"]), 0.0, 1.0)
	var crit: bool = Dice.next() < eff_crit
	if crit:
		dmg = floor(dmg * 1.5)
	var out: Dictionary = { "t": "eShot", "action": act, "target": ti, "crit": crit, "extra": not main, "all": all, "frenzy": frenzy }
	# Fog Bank: its next shot goes into the steam.
	if Js.num(e.get("fogged")) > 0.0:
		var miss: float = float(e["fogged"])
		e.erase("fogged")
		if Dice.next() < miss:
			dmg = 0.0
			out["dodged"] = true
			out["fog"] = true
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
				# Spiteful Wake: a slipped shot lashes back.
				if float(ta["retaliateDodge"]) > 0.0 and would > 0.0 and float(e["hp"]) > 0.0:
					_reflect(b, ti, maxf(1.0, float(Js.round(would * float(ta["retaliateDodge"])))), ev, "Spiteful Wake")
				# An astrolabe's parry throws some of it back.
				var tfx: Dictionary = Js.obj(t.get("fx"))
				if float(tfx.get("parry", 0.0)) > 0.0 and float(tfx.get("parryReflect", 0.0)) > 0.0 and Dice.next() < float(tfx["parry"]):
					_reflect(b, ti, maxf(1.0, floor(would * float(tfx["parryReflect"]))), ev, "Parry")
			else:
				dmg = maxf(1.0, floor(dmg * 0.3))
				out["partial"] = true
	var tfx2: Dictionary = Js.obj(t.get("fx"))
	var raw_in: float = dmg
	# Cutlass Guard: the blow turned aside, maybe lashing back.
	if dmg > 0.0 and not frenzy and float(ta["parry"]) > 0.0 and Dice.next() < float(ta["parry"]):
		dmg = 0.0
		out["parried"] = true
		out["guard"] = true
		if float(ta["parryReflect"]) > 0.0 and float(e["hp"]) > 0.0:
			_reflect(b, ti, maxf(1.0, float(Js.round(raw_in * float(ta["parryReflect"])))), ev, "Cutlass Guard")
	# The first blow of a fight, turned aside outright.
	if dmg > 0.0 and not t.get("firstBlow", false):
		t["firstBlow"] = true
		if float(tfx2.get("firstBlowParry", 0.0)) > 0.0 and Dice.next() < float(tfx2["firstBlowParry"]):
			if float(tfx2.get("parryReflect", 0.0)) > 0.0:
				_reflect(b, ti, maxf(1.0, floor(dmg * float(tfx2["parryReflect"]))), ev, "Aegis")
			dmg = 0.0
			out["parried"] = true
	if dmg > 0.0:
		var taken: float = float(mods(t["statuses"])["taken"]) * (1.0 if frenzy else float(ta["inDmg"])) * float(tfx2.get("inMult", 1.0)) * _bond_taken(b, ti)
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
	if dmg > 0.0:
		_lashed(b, ti, ev)
	if dmg <= 0.0:
		return
	# Being hit feeds the guns.
	if float(tfx2.get("chargeOnHit", 0.0)) > 0.0 and Dice.next() < float(tfx2["chargeOnHit"]) and float(t["charges"]) < float(t["maxCharges"]):
		t["charges"] = float(t["charges"]) + 1.0
		ev.append({ "t": "loaded", "seat": ti, "charges": t["charges"] })
	# The shark's bite: a landed shot knocks a ball out of the rack.
	var bite_c: float = minf(1.0, float(e["bite"]) + float(_line(b)["enemyBite"]))
	if not frenzy and bite_c > 0.0 and float(t["charges"]) > 0.0 and Dice.next() < bite_c:
		t["charges"] = float(t["charges"]) - 1.0
		ev.append({ "t": "bite", "seat": ti, "charges": t["charges"] })
	# Spiteful Wake's thorns, off the blow before it was cut down.
	if not frenzy and float(ta["retaliate"]) > 0.0 and raw_in > 0.0 and float(e["hp"]) > 0.0 and not out.get("parried", false):
		_reflect(b, ti, maxf(1.0, float(Js.round(raw_in * float(ta["retaliate"]) * float(ta["retaliateBoost"])))), ev, "Spiteful Wake")
	# Scorching, else Glacial.
	if float(t["hp"]) > 0.0:
		if af.has("burnChance") and Dice.next() < float(af["burnChance"]):
			t["burn"] = { "turns": 2.0, "dmg": maxf(1.0, minf(float(Js.round(dmg * 0.10)), float(Js.round(float(t["max"]) * 0.10)))) }
			ev.append({ "t": "ablaze", "seat": ti })
		elif af.has("freezeChance") and Dice.next() < float(af["freezeChance"]):
			t["freeze"] = 1.0
			ev.append({ "t": "iced", "seat": ti })
	# Vampiric (or a curse's leech): it drinks some of it back.
	var steal_pct: float = maxf(Js.num(af.get("lifestealPct")), 0.0 if frenzy else float(_line(b)["enemyLeech"]))
	if steal_pct > 0.0 and float(e["hp"]) > 0.0 and float(e["hp"]) < float(e["max"]) and Dice.next() < float(Js.nz(af.get("lifestealChance"), 1.0)):
		var h: float = minf(float(e["max"]) - float(e["hp"]), maxf(1.0, float(Js.round(dmg * steal_pct))))
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
	_spoils(b, e, ev)
	# A combo's half gone: the other is on its own now.
	var cb: Dictionary = Js.obj(e.get("combo"))
	if not cb.is_empty():
		var j: int = int(cb["with"])
		if j >= 0 and j < foes(b).size() and foe_up(foes(b)[j]):
			ev.append({ "t": "comboBroken", "foe": j, "name": str(combo_def(e, str(cb["id"])).get("name", "")) })


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
				seat_status(s, str(c["status"]), float(c["magnitude"]), float(c["turns"]))
				if c.get("dmgPct") != null:
					s["hp"] = maxf(0.0, float(s["hp"]) - maxf(1.0, float(Js.round(float(s["max"]) * float(c["dmgPct"])))))
	if str(c["kind"]) == "enemyHealPctMaxHp":
		e["hp"] = minf(float(e["max"]), float(e["hp"]) + maxf(1.0, float(Js.round(float(e["max"]) * float(c["value"])))))
	ev.append({ "t": "checkFail", "line": e["check"]["def"].get("failLine", "") })
	e["check"] = {}


# ══ The round's end ═══════════════════════════════════════════════════════════

static func _finish(b: Dictionary, ev: Array) -> Array:
	_deaths(b, ev)
	for f0: Dictionary in foes(b):
		if float(f0["hp"]) <= 0.0:
			f0["down"] = true
	var lead: int = first_foe(b)
	b["enemy"] = foes(b)[lead] if lead >= 0 else foes(b)[0]
	if alive(b).is_empty():
		b["state"] = "lost"
		ev.append({ "t": "lost" })
		return ev
	if lead < 0:
		b["state"] = "won"
		ev.append({ "t": "won" })
		return ev
	return _round_end(b, ev)


## Deaths, and the Vengeance ward's cheat.
static func _deaths(b: Dictionary, ev: Array) -> void:
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if _out(s) or float(s["hp"]) > 0.0:
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
	b["turn"] = float(b["turn"]) + 1.0
	var fs: Array = foes(b)
	for j: int in fs.size():
		var e: Dictionary = fs[j]
		if not foe_up(e):
			continue
		b["enemy"] = e
		var n0: int = ev.size()
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
		var sn: Dictionary = e["snare"]
		if Js.nz(sn.get("turns"), 0.0) > 0.0:
			sn["turns"] = float(sn["turns"]) - 1.0
		var erg: float = float(mods(e["statuses"])["regen"])
		if erg > 0.0:
			e["hp"] = minf(float(e["max"]), float(e["hp"]) + erg)
		tick_statuses(e["statuses"])
		if float(e["markPierce"]) > 0.0:
			e["markPierce"] = float(e["markPierce"]) - 1.0
		# A flare barrage every third turn (Flare Barrage, by tier).
		var tier: int = int(e["decoy"])
		if tier > 0 and int(b["turn"]) % 3 == 0 and not b.has("flares"):
			var per: float = float(Js.round(maxf(float(Js.round(float(e["min"]) * 0.7)), 0.0) * float(e["flareDmg"])))
			b["flares"] = {
				"name": e["decoyName"], "count": 3 + tier * 2, "feint": 0.22 if tier >= 3 else 0.0, "cluster": 0.34 if tier >= 2 else 0.20,
				"fuse": (0.9 if tier >= 3 else (1.02 if tier == 2 else 1.18)) * float(e["flareFuse"]) * float(_line(b)["flareFuse"]), "per": float(Js.round(per * float(_line(b)["flareDmg"]))),
			}
			ev.append({ "t": "flares", "name": e["decoyName"], "count": b["flares"]["count"] })
		_tag(ev, n0, j)
	_bond_round_end(b, ev)
	# The turn's change on the ships: orders, regen, statuses, wards.
	for s: Dictionary in b["seats"]:
		s["abilityThisTurn"] = false
		if _out(s):
			continue
		var rg: float = float(mods(s["statuses"])["regen"])
		if rg > 0.0:
			_heal_m(s, rg)
		tick_statuses(s["statuses"])
		var w2: Dictionary = s["ward"]
		if not w2.is_empty():
			w2["turns"] = float(w2["turns"]) - 1.0
			if float(w2["turns"]) <= 1.0:
				s["ward"] = {}
	var lead: int = first_foe(b)
	b["enemy"] = fs[lead] if lead >= 0 else fs[0]
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
		if _out(s) or i >= results.size():
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
	if b.has("gauntlet"):
		return { "done": true }
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
				if _out(s) or float(s["hp"]) <= 0.0:
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
				seat_status(s2, "marked", Js.nz(a.get("value"), 0.3), Js.nz(a.get("turns"), 3.0))
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
		if not s.has("tidesTaken"):
			s["tidesTaken"] = []
		(s["tidesTaken"] as Array).append({ "title": tide.get("title", ""), "label": c.get("label", ""), "description": c.get("description", "") })
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


## A captain's run effects, added up the web's way (RaidCombat's tide memo):
## the tides a raid offers, and the gauntlet's boons, curses, synergies, Marks
## and Terms, which ride the same list (s.tfx). Multipliers multiply, flat
## bonuses add, the strongest of a kind wins where the web takes the max. The
## momentum axes (kills, depth) fold in once, off s.runKills and s.runDepth.
static func tide_agg(s: Dictionary, boss: bool = false) -> Dictionary:
	var a: Dictionary = {
		"dmgMult": 1.0, "fireMult": 1.0, "volleyMult": 1.0, "megaMult": 1.0, "bossMult": 1.0, "bossVolMult": 1.0, "critBonus": 0.0, "critZone": 1.0,
		"inDmg": 1.0, "speed": 0.0, "reloadChance": 0.0, "reloadBonus": 0.0, "dodgeBonus": 0.0, "startHpPct": 0.0, "startHealPct": 0.0,
		"startCharges": 0.0, "enemyHpScale": 1.0, "guaranteedDodge": 0.0, "doubloonsAtEnd": 0.0,
		"critDmg": 1.0, "noncrit": 1.0, "healMult": 1.0, "statusDur": 1.0, "aimSpeed": 1.0, "zoneSpeed": 1.0,
		"overkillHeal": 0.0, "volleyCut": 0.0, "megaCut": 0.0, "lifesteal": 0.0, "retaliate": 0.0, "retaliateDodge": 0.0, "retaliateBoost": 1.0,
		"repairHeal": 1.0, "fightShield": 0.0, "inCritCut": 0.0, "execute": 0.0, "lowHp": 0.0, "overheal": 0.0, "firstStrike": 0.0, "doubleStrike": 0.0,
		"blackout": 0.0, "decoys": 0.0, "fog": 0.0, "clarity": 0.0, "confuse": 0.0,
		"freezeChance": 0.0, "frozenDmg": 1.0, "brittle": false, "deepFreeze": false,
		"burnChance": 0.0, "burnTurns": 0.0, "burnTick": 1.0, "reignite": false, "backdraft": false,
		"thermal": 0.0, "critExecute": 0.0, "volleyRamp": 0.0, "executeHeal": 0.0, "burnTickHeal": 0.0,
		"counter": 0.0, "counterRefund": 0.0, "counterStack": 0.0, "counterChance": 0.0, "counterReflect": 0.0,
		"shieldPierce": 0.0, "steal": 0.0, "favor": 0.0, "abilityRefund": 0.0,
		"streakPer": 0.0, "streakMax": 0.0, "gripHits": 0.0, "gripTurns": 0.0, "gripCrush": 0.0, "critEvery": 0.0,
		"parry": 0.0, "parryReflect": 0.0, "onHit": [], "startStatus": [], "noCleanse": false, "bond": {},
		# What the line's effects do to the enemy (curses and Terms; line_fx).
		"enemyShield": 0.0, "regrow": 0.0, "enemyParry": 0.0, "enemyLeech": 0.0, "enemyBite": 0.0, "enemyStartCharges": 0.0,
		"enemyUlt": 1.0, "enemyUltCharge": 0.0, "flareFuse": 1.0, "flareDmg": 1.0, "hideHp": 0.0, "hideCharges": 0.0,
	}
	var kills: float = maxf(0.0, Js.num(s.get("runKills")))
	var depth: float = maxf(0.0, Js.num(s.get("runDepth")))
	var kill_rate: float = 0.0
	var kill_cap: float = 0.0
	var depth_rate: float = 0.0
	var depth_cap: float = 0.0
	for e: Dictionary in Js.list(s.get("tfx")):
		var scope: String = str(e.get("scope", ""))
		var n: Callable = func(k: String) -> float: return Js.num(e.get(k))
		match str(e["kind"]):
			"damageMult": a["dmgMult"] = float(a["dmgMult"]) * float(e["mult"])
			"fireDmgMult": a["fireMult"] = float(a["fireMult"]) * float(e["mult"])
			"volleyDmgMult": a["volleyMult"] = float(a["volleyMult"]) * float(e["mult"])
			"megaDmgMult": a["megaMult"] = float(a["megaMult"]) * float(e["mult"])
			"bossDamageMult": a["bossMult"] = float(a["bossMult"]) * float(e["mult"])
			"bossVolleyDmgMult": a["bossVolMult"] = float(a["bossVolMult"]) * float(e["mult"])
			"critChanceBonus": a["critBonus"] = float(a["critBonus"]) + float(e["chance"])
			"critZoneScale": a["critZone"] = float(a["critZone"]) * float(e["mult"])
			"critDmgMult": a["critDmg"] = float(a["critDmg"]) * float(e["mult"])
			"noncritDmgMult": a["noncrit"] = float(a["noncrit"]) * float(e["mult"])
			"incomingDmgMult": a["inDmg"] = float(a["inDmg"]) * float(e["mult"])
			"depthScaleMitigation": a["inDmg"] = float(a["inDmg"]) * (1.0 - minf(n.call("max"), n.call("perDepth") * depth))
			"healMult": a["healMult"] = float(a["healMult"]) * float(e["mult"])
			"repairHealMult": a["repairHeal"] = float(a["repairHeal"]) * float(e["mult"])
			"playerStatusDuration": a["statusDur"] = float(a["statusDur"]) * float(e["mult"])
			"aimSpeedMult": a["aimSpeed"] = float(a["aimSpeed"]) * float(e["mult"])
			"zoneSpeedMult": a["zoneSpeed"] = float(a["zoneSpeed"]) * float(e["mult"])
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
			"overkillHealPct": a["overkillHeal"] = float(a["overkillHeal"]) + n.call("pct")
			"volleyCostReduction": a["volleyCut"] = float(a["volleyCut"]) + n.call("n")
			"megaCostReduction": a["megaCut"] = float(a["megaCut"]) + n.call("n")
			"lifestealPct": a["lifesteal"] = float(a["lifesteal"]) + n.call("pct")
			"lifestealKillScale": a["lifesteal"] = float(a["lifesteal"]) + minf(n.call("max"), n.call("perKill") * kills)
			"retaliatePct":
				a["retaliate"] = float(a["retaliate"]) + n.call("pct")
				a["retaliateDodge"] = float(a["retaliateDodge"]) + n.call("dodgePct")
			"retaliateBoost": a["retaliateBoost"] = maxf(float(a["retaliateBoost"]), n.call("mult"))
			"fightShield": a["fightShield"] = float(a["fightShield"]) + n.call("pctMax")
			"incomingCritReduction": a["inCritCut"] = float(a["inCritCut"]) + n.call("chance")
			"executeThreshold": a["execute"] = maxf(float(a["execute"]), n.call("pct"))
			"lowHpDamage": a["lowHp"] = maxf(float(a["lowHp"]), n.call("maxBonus"))
			"overhealPct": a["overheal"] = maxf(float(a["overheal"]), n.call("pct"))
			"firstStrikeChance": a["firstStrike"] = maxf(float(a["firstStrike"]), n.call("chance"))
			"doubleStrikeOnFirst": a["doubleStrike"] = maxf(float(a["doubleStrike"]), n.call("chance"))
			"aimBlackout": a["blackout"] = minf(0.95, maxf(float(a["blackout"]), n.call("intensity")))
			"aimDecoys": a["decoys"] = maxf(float(a["decoys"]), n.call("n"))
			"aimFog": a["fog"] = minf(0.92, float(a["fog"]) + n.call("density"))
			"aimClarity": a["clarity"] = maxf(float(a["clarity"]), n.call("reduce"))
			"confuse": a["confuse"] = maxf(float(a["confuse"]), n.call("chance"))
			"iceAffinity":
				a["freezeChance"] = maxf(float(a["freezeChance"]), n.call("freezeChance"))
				a["frozenDmg"] = maxf(float(a["frozenDmg"]), Js.nz(e.get("frozenDmgMult"), 1.0))
				a["brittle"] = a["brittle"] or e.get("brittle") == true
				a["deepFreeze"] = a["deepFreeze"] or e.get("deepFreeze") == true
			"fireAffinity":
				a["burnChance"] = maxf(float(a["burnChance"]), n.call("burnChance"))
				a["burnTurns"] = maxf(float(a["burnTurns"]), n.call("burnTurnsBonus"))
				a["burnTick"] = maxf(float(a["burnTick"]), Js.nz(e.get("burnTickMult"), 1.0))
				a["reignite"] = a["reignite"] or e.get("reignite") == true
				a["backdraft"] = a["backdraft"] or e.get("backdraft") == true
			"thermalShock": a["thermal"] = maxf(float(a["thermal"]), n.call("burstMult"))
			"critExecute": a["critExecute"] = maxf(float(a["critExecute"]), n.call("pct"))
			"volleyRamp": a["volleyRamp"] = maxf(float(a["volleyRamp"]), n.call("perVolley"))
			"executeHeal": a["executeHeal"] = maxf(float(a["executeHeal"]), n.call("pctMaxHp"))
			"burnTickHeal": a["burnTickHeal"] = maxf(float(a["burnTickHeal"]), n.call("pctTick"))
			"counterFireChance": a["counter"] = maxf(float(a["counter"]), n.call("chance"))
			"counterBonus":
				a["counterRefund"] = maxf(float(a["counterRefund"]), n.call("refund"))
				a["counterStack"] = maxf(float(a["counterStack"]), n.call("bonusStack"))
				a["counterChance"] = maxf(float(a["counterChance"]), n.call("chanceBonus"))
			"counterReflect": a["counterReflect"] = maxf(float(a["counterReflect"]), n.call("pct"))
			"shieldPierce": a["shieldPierce"] = maxf(float(a["shieldPierce"]), n.call("pct"))
			"stealCharge": a["steal"] = maxf(float(a["steal"]), n.call("chance"))
			"randomFightBuff": a["favor"] = maxf(float(a["favor"]), n.call("magnitude"))
			"abilityRefundChance": a["abilityRefund"] = maxf(float(a["abilityRefund"]), n.call("chance"))
			"critStreakDamage":
				if n.call("perStack") > float(a["streakPer"]):
					a["streakPer"] = n.call("perStack")
					a["streakMax"] = n.call("maxStacks")
			"gripStacks":
				if n.call("hits") > 0.0 and (float(a["gripHits"]) == 0.0 or n.call("hits") < float(a["gripHits"])):
					a["gripHits"] = n.call("hits")
				a["gripTurns"] = maxf(float(a["gripTurns"]), n.call("turns"))
				a["gripCrush"] = maxf(float(a["gripCrush"]), n.call("crushPerStack"))
			"guaranteedCritEvery":
				if n.call("n") > 0.0 and (float(a["critEvery"]) == 0.0 or n.call("n") < float(a["critEvery"])):
					a["critEvery"] = n.call("n")
			"parryChance":
				if n.call("chance") > float(a["parry"]):
					a["parry"] = n.call("chance")
					a["parryReflect"] = n.call("reflectPct")
			"statusOnHit": (a["onHit"] as Array).append(e)
			"playerStartStatus": (a["startStatus"] as Array).append(e)
			"noCleanse": a["noCleanse"] = true
			"killStackDamage":
				kill_rate += n.call("perKill")
				kill_cap += n.call("maxBonus")
			"depthScaleDamage":
				depth_rate += n.call("perDepth")
				depth_cap += n.call("maxBonus")
			"enemyShield": a["enemyShield"] = maxf(float(a["enemyShield"]), n.call("pctMax"))
			"barrierRegrow": a["regrow"] = maxf(float(a["regrow"]), n.call("pctMax"))
			"enemyParry": a["enemyParry"] = maxf(float(a["enemyParry"]), n.call("chance"))
			"enemyLifesteal": a["enemyLeech"] = maxf(float(a["enemyLeech"]), n.call("pct"))
			"enemyChargeSteal": a["enemyBite"] = maxf(float(a["enemyBite"]), n.call("bonus"))
			"enemyStartChargesDelta": a["enemyStartCharges"] = float(a["enemyStartCharges"]) + n.call("n")
			"enemyUltimateBoost":
				a["enemyUlt"] = float(a["enemyUlt"]) * Js.nz(e.get("dmgMult"), 1.0)
				a["enemyUltCharge"] = maxf(float(a["enemyUltCharge"]), n.call("chargeChance"))
			"flareStorm":
				a["flareFuse"] = float(a["flareFuse"]) * Js.nz(e.get("fuseMult"), 1.0)
				a["flareDmg"] = float(a["flareDmg"]) * Js.nz(e.get("dmgMult"), 1.0)
			"hideEnemyHp": a["hideHp"] = maxf(float(a["hideHp"]), n.call("chance"))
			"hideEnemyCharges": a["hideCharges"] = maxf(float(a["hideCharges"]), n.call("chance"))
			_:
				# A co-op bond power (port rules battle.gauntlet.bonds): kept by kind.
				if str(e["kind"]).begins_with("bond"):
					(a["bond"] as Dictionary)[str(e["kind"])] = e
	if kill_rate > 0.0:
		a["dmgMult"] = float(a["dmgMult"]) * (1.0 + minf(kill_cap, kill_rate * kills))
	if depth_rate > 0.0:
		a["dmgMult"] = float(a["dmgMult"]) * (1.0 + minf(depth_cap, depth_rate * depth))
	return a


## What the line's curses and Terms do to the enemy, from every ship still in
## the fight (the strongest of each; the Locker's curses are the party's).
static func line_fx(b: Dictionary) -> Dictionary:
	var l: Dictionary = { "enemyShield": 0.0, "regrow": 0.0, "enemyParry": 0.0, "enemyLeech": 0.0, "enemyBite": 0.0, "enemyStartCharges": 0.0,
		"enemyUlt": 1.0, "enemyUltCharge": 0.0, "flareFuse": 1.0, "flareDmg": 1.0, "hideHp": 0.0, "hideCharges": 0.0 }
	for s: Dictionary in b["seats"]:
		if _out(s):
			continue
		var a: Dictionary = tide_agg(s)
		for k: String in ["enemyShield", "regrow", "enemyParry", "enemyLeech", "enemyBite", "enemyStartCharges", "enemyUlt", "enemyUltCharge", "flareDmg", "hideHp", "hideCharges"]:
			l[k] = maxf(float(l[k]), float(a[k]))
		l["flareFuse"] = minf(float(l["flareFuse"]), float(a["flareFuse"]))
	return l


static func _line(b: Dictionary) -> Dictionary:
	if not b.has("line"):
		b["line"] = line_fx(b)
	return b["line"]


## A volley's and a Mega's cost on this ship (the run's cost cuts).
static func volley_cost(s: Dictionary) -> float:
	return maxf(2.0, float(VOLLEY_COST) - float(tide_agg(s)["volleyCut"]))


static func mega_cost(s: Dictionary) -> float:
	return maxf(3.0, float(Armory.aug()["megaCost"]) - float(tide_agg(s)["megaCut"]))


## A status laid on a ship (its run may lengthen every one: Bad Blood).
static func seat_status(s: Dictionary, id: String, mag: float, turns: float) -> void:
	var dur: float = float(tide_agg(s)["statusDur"])
	apply_status(s["statuses"], id, mag, ceil(turns * dur) if dur != 1.0 else turns)


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
	finish_check(b, si, false, ev)
	if float(e["hp"]) <= 0.0:
		_enemy_down(b, ev, false)


## Lifesteal off a landed blow (the run's and the items', capped at 35%),
## through the heal multiplier, up to the heal cap.
static func _leech(b: Dictionary, si: int, dmg: float, ta: Dictionary, ev: Array) -> void:
	var s: Dictionary = b["seats"][si]
	var rate: float = minf(0.35, float(ta["lifesteal"]) + float(Js.obj(s.get("fx")).get("lifesteal", 0.0)))
	if rate <= 0.0 or float(s["hp"]) <= 0.0:
		return
	var heal: float = float(Js.round(minf(float(Js.round(float(s["max"]) * rate * 2.0)), maxf(1.0, float(Js.round(dmg * rate)))) * float(s.get("healMult", 1.0))))
	var got: float = _heal(s, heal)
	if got > 0.0:
		ev.append({ "t": "leech", "seat": si, "heal": got, "hp": s["hp"] })
		_surgeon(b, si, got, ev)


## The crit streak (Cannonade): a crit adds a stack (a won counter-battery
## adds its bonus), anything else breaks it unless the counter kept it.
static func _streak(s: Dictionary, ta: Dictionary, crit: bool, ev: Array, si: int) -> void:
	if float(ta["streakPer"]) <= 0.0:
		return
	var prior: float = Js.num(s.get("streak"))
	var bonus: float = float(ta["counterStack"]) if s.get("counterProc", false) else 0.0
	if crit:
		s["streak"] = minf(float(ta["streakMax"]), prior + 1.0 + bonus)
		if float(s["streak"]) >= 2.0:
			ev.append({ "t": "streak", "seat": si, "n": s["streak"], "pct": float(Js.round(float(ta["streakPer"]) * float(s["streak"]) * 100.0)) })
	elif bonus > 0.0:
		s["streak"] = minf(float(ta["streakMax"]), prior + bonus)
	else:
		s["streak"] = 0.0
		if prior >= 2.0:
			ev.append({ "t": "streakBroken", "seat": si })


## finishCheck: the run's kill riders after any blow that lowered the hull:
## the Executioner's line, the crit's Coup de Grace, the Reaper's Tithe.
static func finish_check(b: Dictionary, si: int, crit: bool, ev: Array) -> void:
	var e: Dictionary = b["enemy"]
	if si < 0 or si >= (b["seats"] as Array).size():
		return
	var s: Dictionary = b["seats"][si]
	var ta: Dictionary = tide_agg(s, e["boss"])
	var hp: float = float(e["hp"])
	var mx: float = float(e["max"])
	var done: bool = false
	if hp > 0.0 and float(ta["execute"]) > 0.0 and hp <= ceil(mx * float(ta["execute"])):
		e["hp"] = _ward_floor(b, 0.0, ev)
		if float(e["hp"]) <= 0.0:
			done = true
			ev.append({ "t": "execute", "seat": si, "kind": "execute" })
	if not done and crit and float(e["hp"]) > 0.0 and float(ta["critExecute"]) > 0.0 and float(e["hp"]) <= ceil(mx * float(ta["critExecute"])):
		e["hp"] = _ward_floor(b, 0.0, ev)
		if float(e["hp"]) <= 0.0:
			done = true
			ev.append({ "t": "execute", "seat": si, "kind": "coup" })
	if not done and float(e["hp"]) > 0.0 and Js.num(e.get("deathMark")) > 0.0 and float(e["hp"]) <= ceil(mx * float(e["deathMark"])):
		e["hp"] = _ward_floor(b, 0.0, ev)
		if float(e["hp"]) <= 0.0:
			ev.append({ "t": "execute", "seat": si, "kind": "deathMark" })
	var revives: bool = int(e["phase"]) - 1 < (e["phases"] as Array).size()
	if float(e["hp"]) <= 0.0 and hp > 0.0 and float(ta["executeHeal"]) > 0.0 and float(s["hp"]) > 0.0 and not revives:
		var heal: float = minf(minf(float(s["max"]) - float(s["hp"]), float(Js.round(mx * float(ta["executeHeal"])))), float(Js.round(float(s["max"]) * 0.15)))
		if heal > 0.0:
			s["hp"] = float(s["hp"]) + heal
			ev.append({ "t": "tithe", "seat": si, "heal": heal, "hp": s["hp"] })


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
	if crit and float(e["charges"]) > 0.0 and float(fx.get("critStrip", 0.0)) > 0.0 and Dice.next() < float(fx["critStrip"]):
		e["charges"] = float(e["charges"]) - 1.0
		ev.append({ "t": "strip", "seat": si, "charges": e["charges"] })
	var ta: Dictionary = tide_agg(s, e["boss"])
	# Fire: a hit may set it ablaze (and a burning hull may be stoked again).
	var old_burn: Dictionary = Js.obj(e.get("burn"))
	if ta["reignite"] and not old_burn.is_empty():
		old_burn["turns"] = 2.0 + float(ta["burnTurns"])
	var bc: float = minf(0.20, float(fx.get("burn", 0.0)) + float(ta["burnChance"]))
	if bc > 0.0 and _proc(bc, hits):
		var turns: float = 2.0 + float(ta["burnTurns"])
		var tick: float = maxf(1.0, float(Js.round(dmg * minf(0.20, 0.10 * float(ta["burnTick"])))))
		e["burn"] = { "turns": turns, "dmg": maxf(tick, float(old_burn.get("dmg", 0.0)) if ta["reignite"] else 0.0), "by": float(si), "backdraft": ta["backdraft"], "feed": ta["burnTickHeal"] }
		_el(b, e, "fire", si)
		ev.append({ "t": "eAblaze", "seat": si, "dmg": e["burn"]["dmg"], "turns": turns })
	# Ice: the next turn (two, in deep ice) frozen.
	var fc: float = minf(0.20, float(fx.get("freeze", 0.0)) + float(ta["freezeChance"]))
	if fc > 0.0 and _proc(fc, hits):
		e["freeze"] = 2.0 if ta["deepFreeze"] else 1.0
		_el(b, e, "ice", si)
		ev.append({ "t": "eIced", "seat": si, "deep": ta["deepFreeze"] })
	# Statuses a run's shot leaves.
	for so: Dictionary in ta["onHit"]:
		if _proc(float(so["chance"]), hits):
			apply_status(e["statuses"], str(so["status"]), float(so["magnitude"]), float(so["turns"]))
			_el(b, e, str(so["status"]), si)
			ev.append({ "t": "eStatus", "seat": si, "status": so["status"] })
	# Kraken's Grip: coils build; when they close the hull is held and crushed.
	if float(ta["gripHits"]) > 0.0:
		var gk: String = str(si)
		if not e.has("grip"):
			e["grip"] = {}
		var coils: float = Js.num(e["grip"].get(gk)) + 1.0
		e["grip"][gk] = coils
		var hits_need: float = float(ta["gripHits"])
		if coils >= hits_need or Dice.next() < pow(coils / hits_need, 2.0):
			e["grip"][gk] = 0.0
			e["freeze"] = maxf(Js.num(e.get("freeze")), float(ta["gripTurns"]))
			var crush: float = maxf(1.0, float(Js.round(float(e["max"]) * float(ta["gripCrush"]) * coils)))
			e["hp"] = maxf(0.0, float(e["hp"]) - crush)
			ev.append({ "t": "grip", "seat": si, "coils": coils, "crush": crush, "enemyHp": e["hp"], "turns": ta["gripTurns"] })
			finish_check(b, si, false, ev)
		else:
			ev.append({ "t": "coil", "seat": si, "coils": coils, "of": hits_need })
	# Thermal Shock: ice meets fire and the frozen hull bursts.
	if float(ta["thermal"]) > 0.0 and float(e["hp"]) > 0.0 and (e.get("frozenNow", false) or Js.num(e.get("freeze")) > 0.0) and not Js.obj(e.get("burn")).is_empty():
		var burst: float = maxf(1.0, float(Js.round(dmg * float(ta["thermal"]))))
		var ab: float = minf(float(e["shield"]), burst)
		e["shield"] = float(e["shield"]) - ab
		e["hp"] = _ward_floor(b, float(e["hp"]) - (burst - ab), ev)
		e["freeze"] = 0.0
		e["frozenNow"] = false
		ev.append({ "t": "thermal", "seat": si, "dmg": burst - ab, "enemyHp": e["hp"] })
		finish_check(b, si, false, ev)
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
		for l9: String in landed:
			_el(b, e, l9, si)
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



## A crossfire's multiplier for n criticals in one round (1 under two).
static func crossfire_mult(n: float) -> float:
	if n < 2.0:
		return 1.0
	return 1.0 + float(Js.nz(Js.obj(cfg().get("crossfire")).get("pct"), 0.25)) * (n - 1.0)



# ══ Roles (a co-op field's escorts) ════════════════════════════════════════════

## Every few of its turns an escort spends the turn on its role, instantly.
## Returns whether it did (it then does nothing else this turn).
static func _role_turn(b: Dictionary, e: Dictionary, ev: Array) -> bool:
	var rc: Dictionary = roles_cfg()
	e["roleTurn"] = float(e.get("roleTurn", 0.0)) + 1.0
	if int(e["roleTurn"]) % int(Js.nz(rc.get("every"), 3.0)) != 2 % int(Js.nz(rc.get("every"), 3.0)):
		return false
	# Boarded: its crew are busy repelling boarders, and the turn is lost.
	if e.get("jammed", false):
		e.erase("jammed")
		ev.append({ "t": "comboNote", "foe": foes(b).find(e), "text": "Boarders! No %s this turn" % str(Js.obj(rc.get(str(e["role"]))).get("name", "")) })
		return false
	var fs: Array = foes(b)
	var me_j: int = fs.find(e)
	var r: String = str(e["role"])
	var def: Dictionary = Js.obj(rc.get(r))
	match r:
		"shieldwright", "sawbones":
			# Its most hurt ally afloat (itself if it is the only one).
			var best: int = -1
			for j: int in fs.size():
				var f: Dictionary = fs[j]
				if not foe_up(f):
					continue
				var share: float = float(f["hp"]) / maxf(1.0, float(f["max"]))
				if r == "sawbones" and share >= 0.95:
					continue
				if best < 0 or share < float(fs[best]["hp"]) / maxf(1.0, float(fs[best]["max"])):
					best = j
			if best < 0:
				return false
			var t: Dictionary = fs[best]
			var amt: float = maxf(1.0, float(Js.round(float(t["max"]) * float(Js.nz(def.get("pct"), 0.18)))))
			if r == "shieldwright":
				t["shield"] = float(t["shield"]) + amt
			else:
				amt = minf(amt, float(t["max"]) - float(t["hp"]))
				t["hp"] = float(t["hp"]) + amt
			ev.append({ "t": "role", "role": r, "foe": me_j, "to": best, "amount": amt, "hp": t["hp"], "shield": t["shield"], "name": def.get("name", "") })
		"hexer":
			var ti: int = _target(b, -1)
			if ti < 0:
				return false
			var blind: bool = Dice.next() < 0.5
			seat_status(b["seats"][ti], "blinded" if blind else "narrowed", float(def["blind"]) if blind else float(def["narrow"]), float(def["turns"]))
			ev.append({ "t": "role", "role": r, "foe": me_j, "seat": ti, "status": "blinded" if blind else "narrowed", "name": def.get("name", "") })
		"rallier":
			var to: Array = []
			for j2: int in fs.size():
				if foe_up(fs[j2]):
					apply_status(fs[j2]["statuses"], "enrage", float(def["mag"]), float(def["turns"]))
					to.append(j2)
			ev.append({ "t": "role", "role": r, "foe": me_j, "all": to, "name": def.get("name", "") })
			# War Drums: the partner loads a ball on the beat.
			var pj: int = combo_partner(b, e, "war_drums")
			if pj >= 0 and float(fs[pj]["charges"]) < float(fs[pj]["mag"]):
				fs[pj]["charges"] = float(fs[pj]["charges"]) + 1.0
				ev.append({ "t": "comboNote", "foe": pj, "text": "War Drums  +1 ball" })
		"spotter":
			# _target: Draw Fire pulls the spotter's eye to the tank as well.
			var ts: int = _target(b, -1)
			if ts < 0:
				return false
			seat_status(b["seats"][ts], "marked", float(def["mark"]), float(def["turns"]))
			ev.append({ "t": "role", "role": r, "foe": me_j, "seat": ts, "status": "marked", "name": def.get("name", "") })
		_:
			return false
	return true


## A Breakwater afloat may take a shot aimed at an ally (passive). Returns the
## enemy the shot now goes to.
static func breakwater(b: Dictionary, si: int, tj: int, ev: Array) -> int:
	var fs: Array = foes(b)
	if fs.size() < 2:
		return tj
	var ch: float = float(Js.nz(Js.obj(roles_cfg().get("breakwater")).get("chance"), 0.35))
	# A ship our spotter marked is in the open: nothing covers it.
	if tj >= 0 and tj < fs.size() and not Js.obj(fs[tj].get("spot")).is_empty():
		return tj
	for j: int in fs.size():
		if j == tj or not foe_up(fs[j]) or fs[j].get("role", "") != "breakwater":
			continue
		var c2: float = ch
		if combo_partner(b, fs[j], "shield_sword") == tj:
			c2 += float(Js.nz(combo_def(fs[j], "shield_sword").get("chance"), 0.25))
		if Dice.next() < c2:
			ev.append({ "t": "intercept", "foe": j, "from": tj, "seat": si })
			if combo_partner(b, fs[j], "field_surgeon") >= 0:
				var amt: float = minf(float(fs[j]["max"]) - float(fs[j]["hp"]), maxf(1.0, float(Js.round(float(fs[j]["max"]) * float(Js.nz(combo_def(fs[j], "field_surgeon").get("pct"), 0.06))))))
				if amt > 0.0:
					fs[j]["hp"] = float(fs[j]["hp"]) + amt
					ev.append({ "t": "comboNote", "foe": j, "text": "Field Surgeon  +%d" % int(amt), "hp": fs[j]["hp"] })
			return j
	return tj


## A co-op pack's combo: the other half's index when this ship is in the
## named combo and both halves still float; else -1.
static func combo_partner(b: Dictionary, e: Dictionary, id: String) -> int:
	var cb: Dictionary = Js.obj(e.get("combo"))
	if cb.is_empty() or str(cb["id"]) != id or not foe_up(e):
		return -1
	var fs: Array = foes(b)
	var j: int = int(cb["with"])
	if j < 0 or j >= fs.size() or not foe_up(fs[j]):
		return -1
	return j


static func combo_def(_e: Dictionary, id: String) -> Dictionary:
	for c: Dictionary in Js.list(Js.obj(Js.obj(cfg().get("gauntlet")).get("packs")).get("combos")):
		if c["id"] == id:
			return c
	return {}



# ══ Bond powers (a co-op gauntlet's role powers; port rules battle.gauntlet.bonds) ══
#
# Each is a TideEffect of kind bond*, held by one captain and reaching the
# others. None of this does anything (or rolls a die) unless a ship in the
# line holds the bond, so solo fights and raids are untouched.

static func bond_of(s: Dictionary, kind: String) -> Dictionary:
	if Js.list(s.get("tfx")).is_empty():
		return {}
	return Js.obj(Js.obj(tide_agg(s).get("bond")).get(kind))


## Every ship in the fight holding a bond: [[seat index, effect]].
static func _holders(b: Dictionary, kind: String) -> Array:
	var out: Array = []
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if _out(s) or float(s["hp"]) <= 0.0:
			continue
		var e: Dictionary = bond_of(s, kind)
		if not e.is_empty():
			out.append([i, e])
	return out


static func _bond_note(ev: Array, si: int, to: int, text: String) -> void:
	ev.append({ "t": "bond", "seat": si, "to": to, "text": text })


## A round begins: last round's Signal Flags and Sea Shanty come into force.
static func _bond_round_start(b: Dictionary) -> void:
	b["shantyLive"] = Js.num(b.get("shantyNext"))
	b["shantyNext"] = 0.0
	b["cover"] = {}
	for s: Dictionary in b["seats"]:
		s["signalLive"] = Js.num(s.get("signalNext"))
		s["signalNext"] = 0.0


## The plans are in: Covering Fire from the ships that Dodge; a Sea Shanty
## when every captain does something different.
static func _bond_plans(b: Dictionary, plans: Array) -> void:
	for h: Array in _holders(b, "bondCover"):
		if str(Js.obj(plans[h[0]]).get("action", "")) == "dodge":
			b["cover"][h[0]] = float(h[1]["pct"])
	var sh: Array = _holders(b, "bondShanty")
	if sh.is_empty():
		return
	var acts: Array = []
	var n: int = 0
	for i: int in plans.size():
		var s: Dictionary = b["seats"][i]
		if _out(s) or float(s["hp"]) <= 0.0:
			continue
		n += 1
		var a: String = str(Js.obj(plans[i]).get("action", ""))
		if not acts.has(a):
			acts.append(a)
	if n >= 2 and acts.size() == n:
		var best: float = 0.0
		for h2: Array in sh:
			best = maxf(best, float(h2[1]["pct"]))
		b["shantyNext"] = best


## The bonds on one shot's damage: a spotter's mark, the wolfpack, the kill
## box, the rallying cry, last round's shanty.
static func _bond_shot_mult(b: Dictionary, si: int, e: Dictionary, ev: Array) -> float:
	var m: float = 1.0
	var s: Dictionary = b["seats"][si]
	var spot: Dictionary = Js.obj(e.get("spot"))
	if not spot.is_empty() and int(spot["by"]) != si:
		m *= 1.0 + float(spot["pct"])
		e["spot"] = {}
		_bond_note(ev, si, -1, "Spotted  +%d%%" % int(round(float(spot["pct"]) * 100.0)))
	var wolf: Dictionary = bond_of(s, "bondWolf")
	if not wolf.is_empty():
		var n: int = Js.list(e.get("hitBy")).filter(func(x: Variant) -> bool: return int(x) != si).size()
		m *= 1.0 + float(wolf["pct"]) * mini(3, n)
	var kb: Dictionary = bond_of(s, "bondKillBox")
	if not kb.is_empty():
		var n2: int = Js.list(e.get("fightHitBy")).filter(func(x: Variant) -> bool: return int(x) != si).size()
		m *= 1.0 + float(kb["pct"]) * mini(3, n2)
	var rally: Array = _holders(b, "bondRally")
	if not rally.is_empty():
		var all_up: bool = true
		var floor_at: float = 0.5
		for h3: Array in _holders(b, "bondRallyLow"):
			floor_at = minf(floor_at, float(h3[1]["below"]))
		for o: Dictionary in alive(b):
			if float(o["hp"]) < float(o["max"]) * floor_at:
				all_up = false
		if all_up:
			var best: float = 0.0
			for h: Array in rally:
				best = maxf(best, float(h[1]["pct"]))
			m *= 1.0 + best
	if Js.num(b.get("shantyLive")) > 0.0:
		m *= 1.0 + float(b["shantyLive"])
	if Js.num(s.get("primed")) > 0.0:
		m *= 1.0 + float(s["primed"])
		s.erase("primed")
	return m


## A shot landed: who has hit this ship; a spotter's mark; a boarding action;
## a crossfire's echo and its raking fire.
static func _bond_landed(b: Dictionary, si: int, e: Dictionary, act: String, crit: bool, dmg: float, xf: float, ev: Array) -> void:
	var s: Dictionary = b["seats"][si]
	if not Js.list(e.get("hitBy")).has(si):
		if not e.has("hitBy"):
			e["hitBy"] = []
		(e["hitBy"] as Array).append(si)
	if not e.has("fightHitBy"):
		e["fightHitBy"] = []
	if not (e["fightHitBy"] as Array).has(si):
		(e["fightHitBy"] as Array).append(si)
	var sp: Dictionary = bond_of(s, "bondSpot")
	if crit and not sp.is_empty() and float(e["hp"]) > 0.0:
		e["spot"] = { "by": si, "pct": float(sp["pct"]) }
		_bond_note(ev, si, -1, "Marked")
		var dm: Dictionary = bond_of(s, "bondDeathMark")
		if not dm.is_empty():
			e["deathMark"] = float(dm["pct"])
	if act == "volley":
		if not e.has("volleyBy"):
			e["volleyBy"] = []
		(e["volleyBy"] as Array).append(si)
		if (e["volleyBy"] as Array).size() >= 2 and not e.get("boarded", false):
			var best: float = 0.0
			for x: Variant in e["volleyBy"]:
				var bd: Dictionary = bond_of(b["seats"][int(x)], "bondBoard")
				if not bd.is_empty():
					best = maxf(best, float(bd["pct"]))
			if best > 0.0:
				e["boarded"] = true
				e["charges"] = maxf(0.0, float(e["charges"]) - 1.0)
				if str(e.get("role", "")) != "":
					e["jammed"] = true
				apply_status(e["statuses"], "marked", best, 2.0)
				_el(b, e, "marked", si)
				_bond_note(ev, si, -1, "Boarded!")
	if xf > 1.0:
		var ec: Dictionary = bond_of(s, "bondEcho")
		if not ec.is_empty() and float(s["charges"]) < float(s["maxCharges"]) and Dice.next() < float(ec["chance"]):
			s["charges"] = float(s["charges"]) + 1.0
			_bond_note(ev, si, si, "Echo  +1 ball")
		var rk: Dictionary = bond_of(s, "bondRake")
		if not rk.is_empty():
			var splash: float = float(Js.round(dmg * (1.0 - 1.0 / xf) * float(rk["pct"])))
			var rb: Dictionary = bond_of(s, "bondRakeCrit")
			if crit and not rb.is_empty():
				splash = float(Js.round(splash * float(rb["mult"])))
			if splash > 0.0:
				for f: Dictionary in foes(b):
					if f == e or not foe_up(f):
						continue
					# It rakes, it never sinks a ship.
					var hit: float = minf(splash, float(f["hp"]) - 1.0)
					if hit > 0.0:
						f["hp"] = float(f["hp"]) - hit
						ev.append({ "t": "rake", "seat": si, "foe": foes(b).find(f), "dmg": hit, "enemyHp": f["hp"] })


## A reload: Powder Runner hands a ball along; Signal Flags go up.
static func _bond_reload(b: Dictionary, si: int, ev: Array) -> void:
	var s: Dictionary = b["seats"][si]
	var pr: Dictionary = bond_of(s, "bondPowder")
	if not pr.is_empty():
		var best: int = -1
		for i: int in (b["seats"] as Array).size():
			var o: Dictionary = b["seats"][i]
			if i == si or _out(o) or float(o["hp"]) <= 0.0 or float(o["charges"]) >= float(o["maxCharges"]):
				continue
			if best < 0 or float(o["charges"]) < float(b["seats"][best]["charges"]):
				best = i
		if best >= 0 and Dice.next() < float(pr["chance"]):
			b["seats"][best]["charges"] = float(b["seats"][best]["charges"]) + 1.0
			_bond_note(ev, si, best, "+1 ball")
			var pt: Dictionary = bond_of(s, "bondPowderShot")
			if not pt.is_empty():
				b["seats"][best]["primed"] = maxf(Js.num(b["seats"][best].get("primed")), float(pt["pct"]))
	var sf: Dictionary = bond_of(s, "bondSignal")
	if not sf.is_empty():
		s["signalNext"] = float(sf["pct"])
		_bond_note(ev, si, si, "Signal up")


## Draw Fire: an enemy picking a target picks the tank first, some of the time.
static func _draw_fire(b: Dictionary, not_i: int = -1) -> int:
	for h: Array in _holders(b, "bondDraw"):
		if int(h[0]) != not_i and Dice.next() < float(h[1]["chance"]):
			return int(h[0])
	return -1


## Shield Wall: a shot at a crewmate low on hull is taken by the tank.
static func _shield_wall(b: Dictionary, ti: int, ev: Array) -> int:
	b.erase("walled")
	if ti < 0:
		return ti
	var t: Dictionary = b["seats"][ti]
	if float(t["hp"]) >= float(t["max"]) * 0.35:
		return ti
	for h: Array in _holders(b, "bondWall"):
		if int(h[0]) != ti and Dice.next() < float(h[1]["chance"]):
			_bond_note(ev, int(h[0]), ti, "Shield Wall")
			var ib: Dictionary = bond_of(b["seats"][h[0]], "bondWallCut")
			if not ib.is_empty():
				b["walled"] = float(ib["pct"])
			return int(h[0])
	return ti


## The bonds on a hit taken: Covering Fire, Close Ranks, Draw Fire's armour.
static func _bond_taken(b: Dictionary, ti: int) -> float:
	var m: float = 1.0
	if Js.num(b.get("walled")) > 0.0:
		m *= 1.0 - float(b["walled"])
		b.erase("walled")
	var cov: float = 0.0
	for k: Variant in Js.obj(b.get("cover")):
		if int(k) != ti:
			cov = maxf(cov, float(b["cover"][k]))
	m *= 1.0 - cov
	var t: Dictionary = b["seats"][ti]
	var cr: Dictionary = bond_of(t, "bondRanks")
	if not cr.is_empty():
		m *= 1.0 - float(cr["pct"]) * mini(3, alive(b).size() - 1)
	var dr: Dictionary = bond_of(t, "bondDraw")
	if not dr.is_empty():
		m *= 1.0 - float(dr["cut"])
	return m


## Lashed Hulls: a crewmate under 30% gets a shield from the tank, once a fight.
static func _lashed(b: Dictionary, ti: int, ev: Array) -> void:
	var t: Dictionary = b["seats"][ti]
	if float(t["hp"]) <= 0.0 or float(t["hp"]) >= float(t["max"]) * 0.3:
		return
	for h: Array in _holders(b, "bondLash"):
		var o: Dictionary = b["seats"][h[0]]
		if int(h[0]) == ti or o.get("lashUsed", false):
			continue
		o["lashUsed"] = true
		var sh: float = float(Js.round(float(o["max"]) * float(h[1]["pct"])))
		t["shield"] = float(t["shield"]) + sh
		_bond_note(ev, int(h[0]), ti, "+%d shield" % int(sh))
		return


## Shared Spoils: a ship sunk that a healer hit heals the crew.
static func _spoils(b: Dictionary, e: Dictionary, ev: Array) -> void:
	for h: Array in _holders(b, "bondSpoils"):
		if not Js.list(e.get("fightHitBy")).has(h[0]):
			continue
		for i: int in (b["seats"] as Array).size():
			var o: Dictionary = b["seats"][i]
			if i == int(h[0]) or _out(o) or float(o["hp"]) <= 0.0:
				continue
			var got: float = _heal_m(o, float(Js.round(float(o["max"]) * float(h[1]["pct"]))))
			if got > 0.0:
				_bond_note(ev, int(h[0]), i, "+%d" % int(got))


## Surgeon's Hand: a healer's self-heal reaches the crewmate in the most need.
static func _surgeon(b: Dictionary, si: int, got: float, ev: Array) -> void:
	var sg: Dictionary = bond_of(b["seats"][si], "bondSurgeon")
	if sg.is_empty():
		return
	var to: int = _most_hurt(b, si, 0.5)
	if to < 0:
		return
	var h: float = _heal(b["seats"][to], float(Js.round(got * float(sg["pct"]))))
	if h > 0.0:
		_bond_note(ev, si, to, "+%d" % int(h))


## The crewmate (not si) with the smallest share of their hull left, under
## `below` of it; -1 if none.
static func _most_hurt(b: Dictionary, si: int, below: float, skip: int = -1) -> int:
	var best: int = -1
	for i: int in (b["seats"] as Array).size():
		var o: Dictionary = b["seats"][i]
		if i == si or i == skip or _out(o) or float(o["hp"]) <= 0.0:
			continue
		var share: float = float(o["hp"]) / maxf(1.0, float(o["max"]))
		if share >= below:
			continue
		if best < 0 or share < float(b["seats"][best]["hp"]) / maxf(1.0, float(b["seats"][best]["max"])):
			best = i
	return best


## The round's end: Field Dressing patches the worst hurt; Smelling Salts may
## clear a status from each crewmate.
static func _bond_round_end(b: Dictionary, ev: Array) -> void:
	for h: Array in _holders(b, "bondDressing"):
		var to: int = _most_hurt(b, int(h[0]), 1.0)
		if to >= 0:
			var o: Dictionary = b["seats"][to]
			var got: float = _heal_m(o, float(Js.round(float(o["max"]) * float(h[1]["pct"]))))
			if got > 0.0:
				_bond_note(ev, int(h[0]), to, "+%d" % int(got))
			var fh: Dictionary = bond_of(b["seats"][h[0]], "bondDressingTwo")
			var to2: int = _most_hurt(b, int(h[0]), 1.0, to) if not fh.is_empty() else -1
			if to2 >= 0:
				var o3: Dictionary = b["seats"][to2]
				var got2: float = _heal_m(o3, float(Js.round(float(o3["max"]) * float(h[1]["pct"]) * float(fh["pct"]))))
				if got2 > 0.0:
					_bond_note(ev, int(h[0]), to2, "+%d" % int(got2))
	for h2: Array in _holders(b, "bondSalts"):
		for i: int in (b["seats"] as Array).size():
			var o2: Dictionary = b["seats"][i]
			if i == int(h2[0]) or _out(o2):
				continue
			for id: String in ["weaken", "feeble", "marked", "slowed", "silence", "corrode", "blinded", "narrowed"]:
				if (o2["statuses"] as Dictionary).has(id):
					if Dice.next() < float(h2[1]["chance"]):
						(o2["statuses"] as Dictionary).erase(id)
						_bond_note(ev, int(h2[0]), i, "Cleared")
					break



# ══ Reactions (co-op gauntlets: two captains' elements on one ship; port rules
#    battle.gauntlet.reactions) ═══════════════════════════════════════════════════
#
# Nothing here runs outside a co-op gauntlet, so solo dives and raids are as
# they were (no die is rolled, nothing is written).

static func _coop_dive(b: Dictionary) -> bool:
	return str(b.get("gauntlet", "")) != "" and (b["seats"] as Array).size() >= 2


static func reaction_def(id: String) -> Dictionary:
	for r: Dictionary in Js.list(Js.obj(cfg().get("gauntlet")).get("reactions")):
		if r["id"] == id:
			return r
	return {}


## An element laid on a ship, and by whom.
static func _el(b: Dictionary, e: Dictionary, el: String, si: int) -> void:
	if not _coop_dive(b):
		return
	if not e.has("elBy"):
		e["elBy"] = {}
	e["elBy"][el] = float(si)


## Who holds each element on this ship now: { element: seat } (coils: the
## captain with the most).
static func _elements(e: Dictionary) -> Dictionary:
	var by: Dictionary = Js.obj(e.get("elBy"))
	var st: Dictionary = e["statuses"]
	var out: Dictionary = {}
	if not Js.obj(e.get("burn")).is_empty():
		out["fire"] = int(Js.nz(e["burn"].get("by"), by.get("fire", -1.0)))
	if (Js.num(e.get("freeze")) > 0.0 or e.get("frozenNow", false)) and by.has("ice"):
		out["ice"] = int(by["ice"])
	for k: String in ["corrode", "weaken", "feeble", "marked"]:
		if st.has(k) and by.has(k):
			out[k] = int(by[k])
	var best: float = 0.0
	for gk: Variant in Js.obj(e.get("grip")):
		if float(e["grip"][gk]) > best:
			best = float(e["grip"][gk])
			out["coils"] = int(str(gk))
	if best > 0.0:
		out["coilsN"] = best
	return out


## A hit by `si` landed: does it set off a reaction? (At most one a ship a
## round; damage scales off the hit.)
static func _reactions(b: Dictionary, si: int, e: Dictionary, act: String, dmg: float, ev: Array) -> void:
	if not _coop_dive(b) or not foe_up(e) or str(e.get("reactRound", "")) == "%d:%d" % [int(b["fight"]), int(b["turn"])]:
		return
	var el: Dictionary = _elements(e)
	var two: Callable = func(x: String, y: String) -> bool:
		return el.has(x) and el.has(y) and int(el[x]) != int(el[y]) and (int(el[x]) == si or int(el[y]) == si)
	var by_other: Callable = func(x: String) -> bool:
		return el.has(x) and int(el[x]) != si
	var id: String = ""
	if el.has("fire") and el.has("ice") and el.has("corrode") and [int(el["fire"]), int(el["ice"]), int(el["corrode"])].has(si) \
			and int(el["fire"]) != int(el["ice"]) and int(el["ice"]) != int(el["corrode"]) and int(el["fire"]) != int(el["corrode"]) \
			and float(Js.nz(b.get("kissFight"), -1.0)) != float(b["fight"]):
		id = "davys_kiss"
	elif act == "mega" and by_other.call("marked"):
		id = "last_rites"
	elif act == "volley" and by_other.call("fire"):
		id = "powder_keg"
	elif act == "volley" and by_other.call("ice"):
		id = "brittle_hull"
	elif two.call("fire", "ice"):
		id = "fog_bank"
	elif two.call("fire", "corrode"):
		id = "greek_fire"
	elif two.call("ice", "coils"):
		id = "crushing_deep"
	elif two.call("fire", "coils") and not e["burn"].get("boiled", false):
		id = "boiling_sea"
	elif two.call("corrode", "feeble") and float(e["shield"]) > 0.0:
		id = "rot"
	elif two.call("weaken", "ice"):
		id = "numbed"
	if id == "":
		return
	var r: Dictionary = reaction_def(id)
	var pct: float = float(Js.nz(r.get("pct"), 0.0))
	var fs: Array = foes(b)
	var me_j: int = fs.find(e)
	var x: Dictionary = { "t": "reaction", "id": id, "name": r.get("name", ""), "seat": si, "foe": me_j, "others": [] }
	match id:
		"fog_bank":
			e["fogged"] = float(Js.nz(r.get("miss"), 0.6))
			e["freeze"] = 0.0
			e["frozenNow"] = false
		"greek_fire":
			for f: Dictionary in fs:
				if f != e and foe_up(f) and Js.obj(f.get("burn")).is_empty():
					f["burn"] = Js.obj(e["burn"]).duplicate()
					(x["others"] as Array).append({ "foe": fs.find(f), "burn": true })
			(e["statuses"] as Dictionary).erase("corrode")
		"powder_keg":
			_splash_others(b, e, float(Js.round(dmg * pct)), x)
			e["burn"] = {}
		"brittle_hull":
			_react_hit(b, si, e, float(Js.round(dmg * pct)), false, x, ev)
			e["freeze"] = 0.0
			e["frozenNow"] = false
		"crushing_deep":
			var coils: float = float(el.get("coilsN", 1.0))
			var crush: float = float(Js.round(dmg * pct * coils))
			_react_hit(b, si, e, crush, false, x, ev)
			for f2: Dictionary in fs:
				if f2 != e and foe_up(f2):
					_splash_one(f2, float(Js.round(crush * 0.5)), fs.find(f2), x)
					break
			e["grip"][str(el["coils"])] = 0.0
		"boiling_sea":
			var cn: float = float(el.get("coilsN", 1.0))
			e["burn"]["dmg"] = float(Js.round(float(e["burn"]["dmg"]) * (1.0 + pct * cn)))
			e["burn"]["turns"] = float(e["burn"]["turns"]) + 1.0
			e["burn"]["boiled"] = true
		"rot":
			x["shield"] = e["shield"]
			e["shield"] = 0.0
			(e["statuses"] as Dictionary).erase("corrode")
		"numbed":
			e["freeze"] = maxf(1.0, Js.num(e.get("freeze"))) + 1.0
			(e["statuses"] as Dictionary).erase("weaken")
		"last_rites":
			_react_hit(b, si, e, float(Js.round(dmg * pct)), true, x, ev)
			(e["statuses"] as Dictionary).erase("marked")
		"davys_kiss":
			b["kissFight"] = b["fight"]
			var kiss: float = float(Js.round(dmg * pct))
			_splash_others(b, e, kiss, x)
			_react_hit(b, si, e, kiss, false, x, ev)
			e["burn"] = {}
			e["freeze"] = 0.0
			e["frozenNow"] = false
			(e["statuses"] as Dictionary).erase("corrode")
	e["reactRound"] = "%d:%d" % [int(b["fight"]), int(b["turn"])]
	x["enemyHp"] = e["hp"]
	ev.append(x)


## A reaction's blow on the ship it went off on (past its barrier when
## `pierce`); it may sink it.
static func _react_hit(b: Dictionary, si: int, e: Dictionary, amt: float, pierce: bool, x: Dictionary, ev: Array) -> void:
	if amt <= 0.0 or not foe_up(e):
		return
	var to_hull: float = amt
	if not pierce and float(e["shield"]) > 0.0:
		var ab: float = minf(float(e["shield"]), amt)
		e["shield"] = float(e["shield"]) - ab
		to_hull = amt - ab
	e["hp"] = _ward_floor(b, float(e["hp"]) - to_hull, ev)
	x["dmg"] = to_hull
	finish_check(b, si, false, ev)


## A reaction's splash on every other ship afloat (it never sinks one).
static func _splash_others(b: Dictionary, e: Dictionary, amt: float, x: Dictionary) -> void:
	var fs: Array = foes(b)
	for f: Dictionary in fs:
		if f != e and foe_up(f):
			_splash_one(f, amt, fs.find(f), x)


static func _splash_one(f: Dictionary, amt: float, j: int, x: Dictionary) -> void:
	var hit: float = minf(amt, float(f["hp"]) - 1.0)
	if hit <= 0.0:
		return
	f["hp"] = float(f["hp"]) - hit
	(x["others"] as Array).append({ "foe": j, "dmg": hit, "hp": f["hp"] })
