extends RefCounted
## Part of Battle (core/battle.gd): the run's effects: tides between fights and
## the Throne's reprieve (draw_tides, tide_due, reprieve_due, tide_pick,
## expire_tides), each ship's summed run effects (tide_agg, with its in-resolve
## memo), the line's curses (line_fx) and the costs and statuses those effects
## change. Split out of core/battle.gd on 2026-10-10 for size; every function is
## static over the battle's plain Dictionaries, as it was there.

const BattleCrew = preload("res://core/battle_crew.gd")


## On only inside Battle.resolve(): tide_agg keeps each seat's sum on the seat.
static var _ta_memo: bool = false


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
	var raid: Dictionary = Battle.raid_def(str(b["raidId"]))
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
	var raid: Dictionary = Battle.raid_def(str(b["raidId"]))
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
					out["heal"] = float(out["heal"]) + BattleCrew._heal(s, float(fx["n"]))
				"instantHealPct":
					out["heal"] = float(out["heal"]) + BattleCrew._heal(s, float(Js.round(float(fx["pct"]) * float(s["max"]))))
				"fullHeal":
					out["heal"] = float(out["heal"]) + BattleCrew._heal(s, float(s["max"]))
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
	var memo_key: String = "_taBoss" if boss else "_ta"
	if _ta_memo and s.has(memo_key):
		return s[memo_key]
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
	var rs: Dictionary = Js.obj(s.get("raidStreak"))
	if not rs.is_empty():
		a["streakPer"] = Js.num(rs.get("perStack"))
		a["streakMax"] = Js.num(rs.get("maxStacks"))
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
	if _ta_memo:
		s[memo_key] = a
	return a


## What the line's curses and Terms do to the enemy, from every ship still in
## the fight (the strongest of each; the Locker's curses are the party's).
static func line_fx(b: Dictionary) -> Dictionary:
	var l: Dictionary = { "enemyShield": 0.0, "regrow": 0.0, "enemyParry": 0.0, "enemyLeech": 0.0, "enemyBite": 0.0, "enemyStartCharges": 0.0,
		"enemyUlt": 1.0, "enemyUltCharge": 0.0, "flareFuse": 1.0, "flareDmg": 1.0, "hideHp": 0.0, "hideCharges": 0.0 }
	for s: Dictionary in b["seats"]:
		if Battle._out(s):
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
	return maxf(2.0, float(Battle.VOLLEY_COST) - float(tide_agg(s)["volleyCut"]))


static func mega_cost(s: Dictionary) -> float:
	return maxf(3.0, float(Armory.aug()["megaCost"]) - float(tide_agg(s)["megaCut"]))


## A status laid on a ship (its run may lengthen every one: Bad Blood).
static func seat_status(s: Dictionary, id: String, mag: float, turns: float) -> void:
	var dur: float = float(tide_agg(s)["statusDur"])
	Battle.apply_status(s["statuses"], id, mag, ceil(turns * dur) if dur != 1.0 else turns)
