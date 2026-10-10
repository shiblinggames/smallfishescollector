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
## gear; the Nuke leaves the wreck burning. It breaks the Last Wall at once
## (other shots and crew orders only crack it, down to its last blow).
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

## The engine's parts, split out of this file on 2026-10-10 for size (each
## holds one job; the names other files call stay reachable on Battle).
const BattleSeat = preload("res://core/battle_seat.gd")
const BattleCrew = preload("res://core/battle_crew.gd")
const BattleFoe = preload("res://core/battle_foe.gd")
const BattleTides = preload("res://core/battle_tides.gd")
const BattleCoop = preload("res://core/battle_coop.gd")


static func d20() -> int:
	return int(floor(Dice.next() * 20.0)) + 1


static func rand_int(a: int, b: int) -> int:
	return int(floor(Dice.next() * float(b - a + 1))) + a


static func cfg() -> Dictionary:
	return Js.obj(Rules.data().get("battle"))


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
	# A raid's own crit streak (Finn's Perfect Streak, critStreak): every
	# captain carries it for the fight.
	if raid.get("critStreak") is Dictionary:
		for st: Dictionary in seats:
			st["raidStreak"] = raid["critStreak"]
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
	b["tides"] = BattleTides.draw_tides(Js.list(td.get("slots")).size(), int(Js.nz(td.get("maxTier"), 1.0))) if not td.is_empty() else []
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


## Where a ship sits in its line, by identity. Godot's find() and == compare
## Dictionaries by content, and two fresh escorts of one kind are equal until
## one is hit, so find() would hand back the first one's index.
static func _idx(arr: Array, d: Dictionary) -> int:
	for i: int in arr.size():
		if is_same(arr[i], d):
			return i
	return -1


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
		hp_scale *= float(BattleTides.tide_agg(s0)["enemyHpScale"])
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
	var l: Dictionary = BattleTides._line(b)
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
	# A raid that is its boss alone (the Quartermaster's Ghost, the Sunken
	# Hand) has no crew to field: the boss stands alone, at the tier's weight
	# (the loot audit, 2026-10-06: picking from the empty list crashed).
	if seq.is_empty():
		return
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
	var pc: Dictionary = Gauntlet.party_cfg()
	var hp_scale: float = 1.0
	for s0: Dictionary in b["seats"]:
		hp_scale *= float(BattleTides.tide_agg(s0)["enemyHpScale"])
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
		BattleSeat._ready_seat(s)
		if _out(s):
			continue
		# The tides the captain took: the fight's opening HP and balls, and
		# their banked sure dodges.
		var ta: Dictionary = BattleTides.tide_agg(s, f["boss"])
		var mx: float = float(s["max"])
		s["healMult"] = float(ta["healMult"])
		s["healCap"] = float(Js.round(mx * (1.0 + float(ta["overheal"]))))
		var hp1: float = float(s["hp"]) + float(Js.round(float(ta["startHpPct"]) * mx)) + float(Js.round(float(ta["startHealPct"]) * mx * float(ta["healMult"])))
		s["hp"] = clampf(hp1, 1.0, float(s["healCap"]))
		# The Quartermaster takes back one item he sold you, for this fight.
		if e.get("repossess") == true and not Js.list(s.get("live")).is_empty():
			var live: Array = s["live"]
			var edge: Array = live.filter(func(id: Variant) -> bool:
				return BattleSeat.item_fx([id])["offensive"])
			var pool: Array = edge if not edge.is_empty() else live
			var taken: Variant = pool[int(floor(Dice.next() * pool.size()))]
			live.erase(taken)
			s["fx"] = BattleSeat.item_fx(live, Js.obj(s.get("grades")))
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
			BattleTides.seat_status(s, str(st0["status"]), float(st0["magnitude"]), float(st0["turns"]))
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
		BattleFoe._arm_check(b, e["openingCheck"], [])


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


## raidDamageProfile: a straight hit's top (pmax) and floor (hitMin), and a
## crit's top (critMax). The one source for the shot, the crew orders and
## the DPS gate's preview.
static func shot_range(ship_min: float, power: float) -> Dictionary:
	var pmax: float = maxf(ship_min, float(Js.round(ship_min + 2.0 + floor(power / 4.0))))
	return { "pmax": pmax, "hitMin": maxf(ship_min, floor(pmax * 0.4)), "critMax": float(Js.round(pmax * 1.5)) }


## rollShotDamage over raidDamageProfile.
static func roll_shot(res: String, ship_min: float, power: float) -> float:
	var rg: Dictionary = shot_range(ship_min, power)
	var pmax: float = rg["pmax"]
	var hit_min: float = rg["hitMin"]
	var crit_max: float = rg["critMax"]
	match res:
		"critical":
			return floor(Dice.next() * (crit_max - 2.0 * ship_min + 1.0)) + 2.0 * ship_min
		"hit":
			return floor(Dice.next() * (pmax - hit_min + 1.0)) + hit_min
		"graze":
			return floor(Dice.next() * maxf(1.0, ceil(pmax * 0.4))) + 1.0
	return 0.0


static func crit_max(ship_min: float, power: float) -> float:
	return float(shot_range(ship_min, power)["critMax"])


## What a captain's aim bar does this pass (RaidCombat's aim set-up): the
## zone's speed stack (the enemy, an affix, capped at 4), the needle's speed,
## a drifting crit seam, the fog over the bar, the crit band (a tide), and an
## affliction the enemy laid on this ship (a false court of decoys, iron
## shutters that take a first knock, a squall). A read only: resolve spends
## the pass (_spend_afflict).
static func aim_for(b: Dictionary, si: int, target: int = -1) -> Dictionary:
	if target >= 0 and target < foes(b).size():
		var keep: Dictionary = b["enemy"]
		b["enemy"] = foes(b)[target]
		var out: Dictionary = aim_for(b, si)
		b["enemy"] = keep
		return out
	var e: Dictionary = b["enemy"]
	var s: Dictionary = b["seats"][si]
	var ta: Dictionary = BattleTides.tide_agg(s)
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
		if not is_same(o, s):
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
	return out


## An aimed shot taken spends one pass of the seat's affliction. Done in
## resolve, on the battle that is the truth, never in aim_for: a co-op screen
## reads aim_for on a copy, and a bar reopened on the same plan must not
## spend two.
static func _spend_afflict(s: Dictionary) -> void:
	var af: Dictionary = Js.obj(s.get("afflict"))
	if af.is_empty():
		return
	af["passes"] = float(af["passes"]) - 1.0
	if float(af["passes"]) <= 0.0:
		s["afflict"] = {}


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


## What a seat may do this round (the web's legality rules).
static func legal(b: Dictionary, s: Dictionary) -> Dictionary:
	var c: float = float(s.get("charges", 0.0))
	var mg: Dictionary = Js.obj(s.get("mega"))
	return {
		"fire": c >= 1.0, "volley": c >= BattleTides.volley_cost(s), "reload": c < float(s["maxCharges"]),
		"mega": not mg.is_empty() and c >= BattleTides.mega_cost(s),
		"dodge": s.get("last", "") != "dodge",
		"repair": not repair_kit(s).is_empty() and not s.get("kitUsed", false) and float(s.get("hp", 0.0)) < float(s.get("max", 0.0)),
		"order": BattleCrew.order_ok(s) == "",
	}


# ══ Resolving a round ═════════════════════════════════════════════════════════

## plans: one per seat: { action, aim ("critical"/"hit"/"graze"/"miss"),
## ability: { crew, target } or null }. Returns the round's events.
## Each seat's run effects are added up once for the round (_ta_memo): a
## co-op round asks tide_agg hundreds of times, and nothing it reads (tfx,
## runKills, runDepth, raidStreak) changes inside a resolve. It rolls no dice,
## so the outcome is the same.
static func resolve(b: Dictionary, plans: Array) -> Array:
	BattleTides._ta_memo = true
	var ev: Array = _resolve_round(b, plans)
	BattleTides._ta_memo = false
	for s: Dictionary in b["seats"]:
		s.erase("_ta")
		s.erase("_taBoss")
	return ev


static func _resolve_round(b: Dictionary, plans: Array) -> Array:
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
		f0["boardedJam"] = false
		f0.erase("xfSeats")
	BattleCoop._bond_round_start(b)
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
			BattleCrew.use_ability(b, i, ab["crew"], int(Js.nz(ab.get("target"), float(i))), ev)
			_tag(ev, n0, tj)
			if float(fs[tj]["hp"]) <= 0.0 and not b.get("revived", false):
				fs[tj]["down"] = true
			b.erase("revived")
	# The class orders (a turn spent; Powder Keg with no turn rides beside an
	# attack as "keg").
	## The seats whose order went this round: the order is spent by now, so
	## legal() calls it used, and the plan must not fall back to a reload.
	var ordered: Dictionary = {}
	for i2: int in plans.size():
		var pl2: Dictionary = Js.obj(plans[i2])
		if _out(b["seats"][i2]):
			continue
		if str(pl2.get("action", "")) == "order" or (pl2.get("keg", false) == true and Js.obj(b["seats"][i2].get("cls")).get("kegFree", false)):
			BattleCrew.use_order(b, i2, int(Js.nz(pl2.get("ally"), float(i2))), ev)
			if str(pl2.get("action", "")) == "order":
				ordered[i2] = true
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
		if not lg0.get(act0, false) and not (act0 == "order" and ordered.has(i)):
			act0 = "reload" if lg0["reload"] else ("fire" if lg0["fire"] else "dodge")
			p0["aim"] = "miss"
		elif act0 in ["fire", "volley", "mega"]:
			_spend_afflict(s0)
		p0["action"] = act0
		plans[i] = p0
	# Every enemy's move; freezes take hold, burns tick.
	for j: int in fs.size():
		var e: Dictionary = fs[j]
		if not foe_up(e):
			continue
		b["enemy"] = e
		var n1: int = ev.size()
		var e_act: String = BattleFoe.pick_enemy(b)
		e["action"] = e_act
		ev.append({ "t": "intent", "action": e_act, "jammed": e.get("jammed", false) })
		# A curse's barrier grows back toward its opening size.
		var rg: float = float(BattleTides._line(b)["regrow"])
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
			e["hp"] = BattleFoe._ward_floor(b, float(e["hp"]) - (tick + flare), ev)
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
				BattleSeat.finish_check(b, by, false, ev)
			if float(e["hp"]) <= 0.0:
				BattleFoe._enemy_down(b, ev, false)
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
	BattleCoop._bond_plans(b, plans)
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
			var cg: Dictionary = BattleCoop.bond_of(sc3, "bondCrossed")
			if cg.is_empty() or crits.has(i3) or _out(sc3) or sc3.get("frozenNow", false) or crits.is_empty():
				continue
			if str(pc3.get("action", "")) in ["fire", "volley", "mega"] and str(pc3.get("aim", "")) == "hit" and target_of(b, pc3) == int(tj3):
				weight += float(cg["pct"])
				joined.append(i3)
		if weight >= 2.0:
			fs[int(tj3)]["xfire"] = weight
			fs[int(tj3)]["xfSeats"] = joined
			ev.append({ "t": "crossfire", "seats": joined, "mult": BattleCoop.crossfire_mult(weight), "foe": int(tj3) })
	# Counter-Battery: a ship shooting into a foe that is shooting back may
	# smash its shot out of the air (rolled now, spent on the foe's turn).
	for i: int in plans.size():
		var sc2: Dictionary = b["seats"][i]
		sc2.erase("counterOn")
		sc2["counterProc"] = false
		if _out(sc2) or sc2.get("frozenNow", false):
			continue
		var pc2: Dictionary = Js.obj(plans[i])
		var ta0: Dictionary = BattleTides.tide_agg(sc2)
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
		var ta1: Dictionary = BattleTides.tide_agg(s)
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
			BattleFoe._enemy_act(b, str(ef["action"]), e_mods[j2], plans, ev)
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
				tj4 = BattleCoop.breakwater(b, who, tj4, ev)
			var et: Dictionary = fs[tj4]
			b["enemy"] = et
			s2["firstVs"] = not acted.has(tj4)
			var n3: int = ev.size()
			var act4: String = str(Js.obj(plans[who]).get("action", ""))
			var keg: bool = s2.get("keg", false) == true and act4 in ["fire", "volley", "mega"]
			var cost4: float = 1.0 if act4 == "fire" else (BattleTides.volley_cost(s2) if act4 == "volley" else BattleTides.mega_cost(s2))
			_seat_act(b, who, Js.obj(plans[who]), str(et["action"]), e_mods[tj4], ev)
			_tag(ev, n3, tj4)
			if float(et["hp"]) <= 0.0 and not b.get("revived", false):
				et["down"] = true
			# Powder Keg: the same attack at every other enemy afloat, for the
			# one attack's balls.
			if keg:
				s2["keg"] = false
				for j5: int in fs.size():
					if j5 == tj4 or not foe_up(fs[j5]) or b.get("revived", false):
						continue
					s2["charges"] = float(s2["charges"]) + cost4
					b["enemy"] = fs[j5]
					var n5: int = ev.size()
					_seat_act(b, who, Js.obj(plans[who]), str(fs[j5]["action"]), e_mods[j5], ev)
					# A crit refund (the Primeval Maw) left the lent balls in
					# the rack: take them back, so an extra attack is free
					# either way and never lifts the rack past its size.
					for k5: int in range(n5, ev.size()):
						if str(Js.obj(ev[k5]).get("t", "")) == "refund" and int(Js.obj(ev[k5]).get("seat", -1)) == who:
							s2["charges"] = maxf(0.0, float(s2["charges"]) - cost4)
							break
					_tag(ev, n5, j5)
					if float(fs[j5]["hp"]) <= 0.0 and not b.get("revived", false):
						fs[j5]["down"] = true
				b["enemy"] = et
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
			var ta: Dictionary = BattleTides.tide_agg(s)
			var extra: float = float(ta["reloadBonus"]) if float(ta["reloadChance"]) > 0.0 and Dice.next() < float(ta["reloadChance"]) else 0.0
			var fxr: Dictionary = Js.obj(s.get("fx"))
			if float(fxr.get("reloadCharge", 0.0)) > 0.0 and Dice.next() < float(fxr["reloadCharge"]):
				extra += 1.0
			s["charges"] = minf(float(s["maxCharges"]), float(s["charges"]) + 1.0 + extra)
			# The palisade braces back on a reload, never past its opening size.
			if float(s.get("wardRefill", 0.0)) > 0.0:
				s["shield"] = float(s["shield"]) + minf(float(s["wardRefill"]), maxf(0.0, float(s["wardMax"]) - float(s["shield"])))
			ev.append({ "t": "reload", "seat": si, "charges": s["charges"], "extra": extra })
			BattleCoop._bond_reload(b, si, ev)
		"dodge":
			ev.append({ "t": "brace", "seat": si })
		"order":
			pass
		"repair":
			# The repair kit: a heal off the kit's range (Fortune lifts its
			# ceiling), the turn spent, once a fight.
			var kit: Dictionary = repair_kit(s)
			if not kit.is_empty() and not s.get("kitUsed", false):
				s["kitUsed"] = true
				var rg: Vector2 = repair_range(s)
				var roll: float = rg.x + floor(Dice.next() * (rg.y - rg.x + 1.0))
				roll = float(Js.round(roll * float(BattleTides.tide_agg(s)["repairHeal"]) * float(s.get("healMult", 1.0)) * float(s.get("repairMult", 1.0))))
				var got: float = BattleCrew._heal(s, roll)
				ev.append({ "t": "repair", "seat": si, "heal": got, "hp": s["hp"], "name": kit.get("name", "Repair Kit") })
		"fire", "volley", "mega":
			var mega: Dictionary = Js.obj(s.get("mega")) if act == "mega" else {}
			var cost: float = 1.0 if act == "fire" else (BattleTides.volley_cost(s) if act == "volley" else BattleTides.mega_cost(s))
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
			var ta2: Dictionary = BattleTides.tide_agg(s, e["boss"])
			var fx: Dictionary = Js.obj(s.get("fx"))
			s["shots"] = float(s.get("shots", 0.0)) + 1.0
			# A hit may still come up a crit (a tide's chance, a crow's nest),
			# and every Nth locked shot that hits does (Gunner's Count).
			var up: float = float(ta2["critBonus"]) + float(fx.get("critUpgrade", 0.0)) + float(Js.obj(s.get("cls")).get("greenCrit", 0.0))
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
			var xf: float = BattleCoop.crossfire_mult(float(e.get("xfire", 0.0))) if (str(plan.get("aim", "")) == "critical" or Js.list(e.get("xfSeats")).has(si)) else 1.0
			# Converging Fire: this ship's share of the crossfire, bigger.
			var cvg: Dictionary = BattleCoop.bond_of(s, "bondConverge")
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
			rmult *= BattleCoop._bond_shot_mult(b, si, e, ev)
			if crit_shot:
				rmult *= 1.0 + float(Js.obj(s.get("cls")).get("crit", 0.0))
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
			var ph: Dictionary = BattleFoe._phase(e)
			if ph.get("damageTakenMult") != null and dmg > 0.0 and not (ph.get("damageTakenVolleyBypass") == true and act == "volley") and Dice.next() < float(Js.nz(ph.get("damageTakenChance"), 1.0)):
				dmg = maxf(1.0, float(Js.round(dmg * float(ph["damageTakenMult"]))))
			var walled: bool = not (e["aegis"] as Dictionary).is_empty()
			# A Mega breaks the Last Wall at once, and its blow comes through
			# (any other blow only cracks it, _aegis_hit).
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
						BattleFoe._hit_seat(b, si, cut, ev, "parry", str(e["parryName"]))
					elif af.has("riposteReflectPct") and would > 0.0:
						BattleFoe._hit_seat(b, si, maxf(1.0, float(Js.round(would * float(af["riposteReflectPct"])))), ev, "parry", "Riposte")
				elif not out.get("pierced", false):
					dmg = maxf(1.0, floor(dmg * 0.3))
					out["partial"] = true
			# The Last Wall: nothing through; each blow cracks it (a volley twice).
			if walled and not out.get("dodged", false):
				out["walled"] = true
				out["dmg"] = 0.0
				out["enemyHp"] = e["hp"]
				ev.append(out)
				BattleFoe._aegis_hit(b, 2.0 if act == "volley" else 1.0, ev)
				BattleSeat._streak(s, ta2, crit_shot, ev, si)
				return
			# A curse's parry: the shot turned aside (never a Mega).
			if dmg > 0.0 and act != "mega" and float(BattleTides._line(b)["enemyParry"]) > 0.0 and Dice.next() < float(BattleTides._line(b)["enemyParry"]):
				dmg = 0.0
				out["eParried"] = true
			# The enemy's shield (a run's piercing shot sends part past it).
			var to_hull: float = dmg
			# The raid's streak, deep enough, goes through plate (Finn's: at 5).
			var rs2: Dictionary = Js.obj(s.get("raidStreak"))
			var streak_pierce: bool = Js.num(rs2.get("pierceAt")) > 0.0 and Js.num(s.get("streak")) >= Js.num(rs2.get("pierceAt"))
			if dmg > 0.0 and float(e["shield"]) > 0.0 and float(e["markPierce"]) <= 0.0 and not mega.get("pierce", false) and not streak_pierce:
				var bypass: float = float(Js.round(dmg * minf(1.0, float(ta2["shieldPierce"])))) if float(ta2["shieldPierce"]) > 0.0 else 0.0
				var soakable: float = dmg - bypass
				var bite: float = float(Js.round(soakable * float(e_mods["shieldTaken"])))
				var absorbed: float = minf(float(e["shield"]), bite)
				e["shield"] = float(e["shield"]) - absorbed
				to_hull = maxf(0.0, soakable - ceil(absorbed / float(e_mods["shieldTaken"]))) + bypass
				out["shielded"] = absorbed
			var before: float = float(e["hp"])
			var overkill: float = maxf(0.0, to_hull - before)
			e["hp"] = BattleFoe._ward_floor(b, float(e["hp"]) - to_hull, ev)
			out["dmg"] = to_hull
			out["enemyHp"] = e["hp"]
			ev.append(out)
			if dmg > 0.0:
				BattleCoop._bond_landed(b, si, e, act, crit_shot, dmg, xf, ev)
			if dmg > 0.0:
				# Press-Gang: a ball ripped off its rack and rammed into yours.
				if float(ta2["steal"]) > 0.0 and float(e["hp"]) > 0.0 and float(e["charges"]) > 0.0 and Dice.next() < float(ta2["steal"]):
					e["charges"] = float(e["charges"]) - 1.0
					var kept: bool = float(s["charges"]) < float(s["maxCharges"])
					if kept:
						s["charges"] = float(s["charges"]) + 1.0
					ev.append({ "t": "steal", "seat": si, "kept": kept, "charges": s["charges"], "eCharges": e["charges"] })
				BattleSeat._leech(b, si, dmg, ta2, ev)
				if overkill > 0.0 and float(ta2["overkillHeal"]) > 0.0 and float(s["hp"]) > 0.0:
					var pk: float = float(ta2["overkillHeal"])
					var got2: float = BattleCrew._heal(s, float(Js.round(minf(float(Js.round(float(s["max"]) * minf(pk, 0.35) * 2.0)), maxf(1.0, float(Js.round(overkill * pk)))) * float(s.get("healMult", 1.0)))))
					if got2 > 0.0:
						ev.append({ "t": "overkill", "seat": si, "heal": got2, "hp": s["hp"] })
						BattleCoop._surgeon(b, si, got2, ev)
				BattleSeat.finish_check(b, si, crit_shot, ev)
			if dmg > 0.0 and float(e["hp"]) > 0.0:
				BattleSeat._on_hit(b, si, dmg, crit_shot, ev, Js.list(mega.get("hits")).size())
				# The Nuke's fallout: the wreck burns.
				if mega.get("fallout") is Dictionary:
					e["burn"] = { "turns": float(mega["fallout"]["turns"]), "dmg": maxf(1.0, float(Js.round(dmg * float(mega["fallout"]["pct"])))), "by": float(si) }
					BattleCoop._el(b, e, "fire", si)
					ev.append({ "t": "eAblaze", "seat": si, "dmg": e["burn"]["dmg"], "fallout": true })
				BattleCoop._reactions(b, si, e, act, dmg, ev)
			if not out.get("dodged", false):
				BattleSeat._streak(s, ta2, crit_shot, ev, si)
			# Reflective: a slice of the blow comes back.
			if dmg > 0.0 and af.has("reflectPct") and Dice.next() < float(Js.nz(af.get("reflectChance"), 1.0)):
				BattleFoe._hit_seat(b, si, maxf(1.0, float(Js.round(dmg * float(af["reflectPct"])))), ev, "reflect", "Reflective")
			if float(e["hp"]) <= 0.0:
				# Volatile: the wreck goes up as it sinks.
				if af.has("deathBurnRemainingPct") and (e["phases"] as Array).size() < int(e["phase"]):
					var boom: float = minf(maxf(1.0, float(Js.round(float(s["hp"]) * float(af["deathBurnRemainingPct"])))), float(s["hp"]) - 1.0)
					if boom > 0.0:
						s["hp"] = float(s["hp"]) - boom
						ev.append({ "t": "volatile", "seat": si, "dmg": boom, "hp": s["hp"] })
				BattleFoe._enemy_down(b, ev, false)


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
				BattleCrew._cleanse(s)
			s["ward"] = {}
			BattleSeat._cheated(s)
			ev.append({ "t": "cheat", "seat": i, "hp": s["hp"] })
		elif float(s.get("saves", 0.0)) > 0.0 and not s.get("anchorUsed", false):
			s["saves"] = float(s["saves"]) - 1.0
			s["anchorUsed"] = true
			s["hp"] = 1.0
			BattleSeat._cheated(s)
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
			elif BattleFoe._check_met(b):
				ev.append({ "t": "checkMet", "line": ck["def"].get("counteredLine", "") })
				e["check"] = {}
			else:
				ck["left"] = float(ck["left"]) - 1.0
				if float(ck["left"]) <= 0.0:
					BattleFoe._check_fail(b, ev)
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
				"fuse": (0.9 if tier >= 3 else (1.02 if tier == 2 else 1.18)) * float(e["flareFuse"]) * float(BattleTides._line(b)["flareFuse"]), "per": float(Js.round(per * float(BattleTides._line(b)["flareDmg"]))),
			}
			ev.append({ "t": "flares", "name": e["decoyName"], "count": b["flares"]["count"] })
		_tag(ev, n0, j)
	# A failed check can take a ship to nothing: the ward, the Anchor or the
	# deep has it now (before the ward's turns tick), and a line with no ship
	# left is lost this round.
	_deaths(b, ev)
	if alive(b).is_empty():
		var lead0: int = first_foe(b)
		b["enemy"] = fs[lead0] if lead0 >= 0 else fs[0]
		b["state"] = "lost"
		ev.append({ "t": "lost" })
		return ev
	BattleCoop._bond_round_end(b, ev)
	# The turn's change on the ships: orders, regen, statuses, wards.
	for s: Dictionary in b["seats"]:
		s["abilityThisTurn"] = false
		var dw: Dictionary = Js.obj(s.get("drawing"))
		if not dw.is_empty():
			dw["turns"] = float(dw["turns"]) - 1.0
			if float(dw["turns"]) <= 0.0:
				s.erase("drawing")
		if _out(s):
			continue
		var rg: float = float(mods(s["statuses"])["regen"])
		if rg > 0.0:
			BattleCrew._heal_m(s, rg)
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
		s0["tfx"] = BattleTides.expire_tides(Js.list(s0.get("tfx")))
	if r > n:
		b["state"] = "done"
		return { "done": true }
	var rest: bool = n >= 4 and r == int(floor(n / 2.0)) and not b.get("rested", false)
	if rest:
		b["rested"] = true
		for s: Dictionary in b["seats"]:
			s["used"] = []
			s["orderUsed"] = false
	start_fight(b, r)
	return { "done": false, "rest": rest, "boss": fight_at(raid, r)["boss"] }


# ══ Flee (riskyFlee) ═══════════════════════════════════════════════════════════

## What a captain needs on the die to get away (a natural 20 always does).
static func flee_need(b: Dictionary, si: int) -> int:
	var s: Dictionary = b["seats"][si]
	var e: Dictionary = b["enemy"]
	var spd: float = maxf(1.0, float(s["speed"]) + float(BattleTides.tide_agg(s)["speed"]))
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
	var spd: float = maxf(1.0, float(s["speed"]) + float(BattleTides.tide_agg(s)["speed"]))
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
				BattleSeat._cheated(s)
				ev.append({ "t": "cheat", "seat": si, "hp": s["hp"] })
			else:
				s["sunk"] = true
				ev.append({ "t": "sunk", "seat": si })
				if alive(b).is_empty():
					b["state"] = "lost"
					ev.append({ "t": "lost" })
	return ev


# ══ Forwarders (the moved names other files call as Battle.x) ════════════════

## In BattleSeat.
static func seat_for(db: CaptainStore, uid: String, name: String = "") -> Dictionary:
	return BattleSeat.seat_for(db, uid, name)


## In BattleSeat.
static func item_fx(ids: Array, grades: Dictionary = {}) -> Dictionary:
	return BattleSeat.item_fx(ids, grades)


## In BattleSeat.
static func use_drum(b: Dictionary, si: int) -> Dictionary:
	return BattleSeat.use_drum(b, si)


## In BattleSeat.
static func drum_of(s: Dictionary) -> Dictionary:
	return BattleSeat.drum_of(s)


## In BattleTides.
static func tide_pick(b: Dictionary, si: int, tide: Dictionary, choice_id: String) -> Dictionary:
	return BattleTides.tide_pick(b, si, tide, choice_id)


## In BattleTides.
static func tide_due(b: Dictionary) -> Dictionary:
	return BattleTides.tide_due(b)


## In BattleTides.
static func reprieve_due(b: Dictionary) -> Dictionary:
	return BattleTides.reprieve_due(b)


## In BattleTides.
static func tide_agg(s: Dictionary, boss: bool = false) -> Dictionary:
	return BattleTides.tide_agg(s, boss)


## In BattleFoe.
static func pick_enemy(b: Dictionary) -> String:
	return BattleFoe.pick_enemy(b)


## In BattleFoe.
static func predict(b: Dictionary, n: int) -> Array:
	return BattleFoe.predict(b, n)


## In BattleCrew.
static func ability_ok(b: Dictionary, s: Dictionary, crew_id: Variant) -> String:
	return BattleCrew.ability_ok(b, s, crew_id)


## In BattleCrew.
static func order_ok(s: Dictionary) -> String:
	return BattleCrew.order_ok(s)


## In BattleCoop.
static func reaction_def(id: String) -> Dictionary:
	return BattleCoop.reaction_def(id)


## In BattleCoop.
static func _reactions(b: Dictionary, si: int, e: Dictionary, act: String, dmg: float, ev: Array) -> void:
	BattleCoop._reactions(b, si, e, act, dmg, ev)


## In BattleCoop.
static func _el(b: Dictionary, e: Dictionary, el: String, si: int) -> void:
	BattleCoop._el(b, e, el, si)


## In BattleCoop.
static func crossfire_mult(n: float) -> float:
	return BattleCoop.crossfire_mult(n)


## In BattleCoop.
static func _draw_fire(b: Dictionary, not_i: int = -1) -> int:
	return BattleCoop._draw_fire(b, not_i)
