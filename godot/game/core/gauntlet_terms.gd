extends RefCounted
## Part of Gauntlet: Davy's Terms, the Marks of the Don, the Fence and the
## Don's contracts (gauntletTerms, gauntletMarks, gauntletMerchant,
## gauntletContracts), held to parity. Split out of core/gauntlet.gd on
## 2026-10-10 for size. Callers go through Gauntlet's forwarders.

# ══ Terms (hardcore only) ═════════════════════════════════════════════════════

static func term_def(id: String) -> Dictionary:
	for x: Dictionary in Js.list(Gauntlet.t().get("terms")):
		if x["id"] == id:
			return x
	return {}


static func pressure(signed: Dictionary) -> float:
	var p: float = 0.0
	for id: String in signed:
		var x: Dictionary = term_def(id)
		var tr: int = int(Js.num(signed[id]))
		if x.is_empty() or tr < 1:
			continue
		p += Js.num(Js.obj(x["tiers"][mini(tr, Js.list(x["tiers"]).size()) - 1]).get("pressure"))
	return p


static func no_terms() -> Dictionary:
	return {
		"forceContracts": false, "eliteChanceMult": 1.0, "affixPairFromStart": false, "tripleAffixChance": 0.0,
		"eliteHpMult": 1.0, "eliteDmgMult": 1.0, "bossHpMult": 1.0, "bossDmgMult": 1.0, "bossAffixCount": 0.0,
		"crewRefreshChance": 1.0, "crewSlotsLost": 0.0, "boonPicks": 3.0, "boonFrequencyMult": 1.0, "commonSkew": 0.0,
		"confluenceOfferMult": 1.0, "curseFrequencyMult": 1.0, "curseStartsAtWorst": false, "maxHpPct": 1.0,
		"noLethalSaves": false, "noReprieves": false, "noPeek": false, "bloodPriceToOne": false,
		"cashOutOnlyAfterBoss": false, "healMult": 1.0,
	}


## resolveTerms: the signed board folded into the knobs the run reads.
static func resolve_terms(signed: Dictionary) -> Dictionary:
	var e: Dictionary = no_terms()
	var tier_of: Callable = func(id: String) -> int:
		var x: Dictionary = term_def(id)
		return mini(int(Js.num(signed.get(id))), Js.list(x.get("tiers")).size()) if not x.is_empty() else 0
	if tier_of.call("every_job") > 0:
		e["forceContracts"] = true
	var press: int = tier_of.call("press_ganged")
	if press > 0:
		e["eliteChanceMult"] = 1.8 if press == 1 else 2.6
	var marked: int = tier_of.call("marked_hulls")
	if marked > 0:
		e["affixPairFromStart"] = true
		if marked >= 2:
			e["tripleAffixChance"] = 0.33
	var iron: int = tier_of.call("ironbacked")
	if iron > 0:
		e["eliteHpMult"] = 1.2 if iron == 1 else 1.45
		e["eliteDmgMult"] = 1.12 if iron == 1 else 1.28
	var court: int = tier_of.call("davys_court")
	if court > 0:
		e["bossHpMult"] = 1.25 if court == 1 else 1.5
		e["bossDmgMult"] = 1.15 if court == 1 else 1.3
	e["bossAffixCount"] = float(tier_of.call("crowned"))
	var skel: int = tier_of.call("skeleton_crew")
	if skel > 0:
		e["crewRefreshChance"] = 0.6 if skel == 1 else 0.3
	if tier_of.call("short_handed") > 0:
		e["crewSlotsLost"] = 1.0
	var comm: int = tier_of.call("no_communion")
	if comm > 0:
		e["confluenceOfferMult"] = 0.5 if comm == 1 else 0.0
	var powder: int = tier_of.call("scarce_powder")
	if powder > 0:
		e["boonPicks"] = 2.0
		if powder >= 2:
			e["boonFrequencyMult"] = 0.65
	var barren: int = tier_of.call("barren_tides")
	if barren > 0:
		e["commonSkew"] = 0.6 if barren == 1 else 0.85
	var tongue: int = tier_of.call("loose_tongue")
	if tongue > 0:
		e["curseFrequencyMult"] = 1.5 if tongue == 1 else 1.9
		if tongue >= 2:
			e["curseStartsAtWorst"] = true
	var draft: int = tier_of.call("deep_draft")
	if draft > 0:
		e["maxHpPct"] = 0.85 if draft == 1 else 0.70
	if tier_of.call("full_measure") > 0:
		e["bloodPriceToOne"] = true
	if tier_of.call("no_second_thoughts") > 0:
		e["cashOutOnlyAfterBoss"] = true
	var rations: int = tier_of.call("iron_rations")
	if rations > 0:
		e["healMult"] = 0.5 if rations == 1 else 0.0
	if tier_of.call("no_mercy") > 0:
		e["noLethalSaves"] = true
	if tier_of.call("no_quarter") > 0:
		e["noReprieves"] = true
	if tier_of.call("blind_descent") > 0:
		e["noPeek"] = true
	return e


static func term_effects(signed: Dictionary) -> Array:
	var out: Array = []
	for id: String in signed:
		var x: Dictionary = term_def(id)
		var tr: int = int(Js.num(signed[id]))
		if x.is_empty() or tr < 1:
			continue
		out += Js.list(Js.obj(x["tiers"][mini(tr, Js.list(x["tiers"]).size()) - 1]).get("effects"))
	return out


# ══ Marks of the Don ═════════════════════════════════════════════════════════

static func roll_marks() -> Dictionary:
	var m: Dictionary = Gauntlet.t()["marks"]
	return { "shark": _roll_buffs(Js.list(m["shark"])), "whale": _roll_buffs(Js.list(m["whale"])) }


static func _roll_buffs(cats: Array) -> Array:
	var pool: Array = cats.duplicate()
	var out: Array = []
	for i: int in mini(Gauntlet.MARK_BUFFS_PER, pool.size()):
		var cat: String = str(pool.pop_at(int(floor(Dice.next() * pool.size()))))
		var pct: int = Gauntlet.MARK_ROLL_MIN + int(floor(Dice.next() * (Gauntlet.MARK_ROLL_MAX - Gauntlet.MARK_ROLL_MIN + 1)))
		out.append({ "cat": cat, "pct": float(pct) })
	return out


static func mark_effects(marks: Array) -> Array:
	var out: Array = []
	for mk: Dictionary in marks:
		for b: Dictionary in Js.list(mk.get("buffs")):
			var p: float = float(b["pct"]) / 100.0
			match str(b["cat"]):
				"gunnery": out.append({ "kind": "damageMult", "mult": 1.0 + p })
				"broadside": out.append({ "kind": "volleyDmgMult", "mult": 1.0 + p })
				"bombards": out.append({ "kind": "megaDmgMult", "mult": 1.0 + p })
				"marksman": out.append({ "kind": "critDmgMult", "mult": 1.0 + p })
				"keen_eye": out.append({ "kind": "critChanceBonus", "chance": p })
				"wildfire": out.append({ "kind": "fireAffinity", "burnChance": p, "burnTurnsBonus": 0.0, "burnTickMult": 1.0 + p })
				"hoarfrost": out.append({ "kind": "iceAffinity", "freezeChance": p, "frozenDmgMult": 1.0 + p })
				"ironhull": out.append({ "kind": "maxHpMult", "mult": 1.0 + p })
				"bulwark": out.append({ "kind": "fightShield", "pctMax": p })
				"mending": out.append({ "kind": "healMult", "mult": 1.0 + p })
				"aegis": out.append({ "kind": "incomingDmgMult", "mult": 1.0 - p, "scope": "allRemaining" })
				"bloodward": out.append({ "kind": "lifestealPct", "pct": p })
	return out


# ══ The Fence, the Shrine, the Don's jobs ═════════════════════════════════════

static func fence_stock(has_curse: bool) -> Array:
	var extras: Array = ["charges", "crew", "boon"]
	if has_curse:
		extras.append("cleanse")
	for i: int in range(extras.size() - 1, 0, -1):
		var j: int = int(floor(Dice.next() * (i + 1)))
		var tmp: Variant = extras[i]
		extras[i] = extras[j]
		extras[j] = tmp
	return ["heal"] + extras.slice(0, 2)


static func roll_contract(d: int) -> String:
	if d < Gauntlet.CONTRACT_MIN_DEPTH:
		return ""
	if Dice.next() >= Gauntlet.CONTRACT_OFFER_CHANCE:
		return ""
	return Gauntlet.CONTRACT_KINDS[int(floor(Dice.next() * Gauntlet.CONTRACT_KINDS.size()))]


static func contract_param(kind: String, stake: int, d: int) -> int:
	return maxi(2, (6 - stake) + int(floor(d / 25.0))) if kind == "fast" else 0


static func build_contract(kind: String, stake: int, d: int) -> Dictionary:
	var plunder: float = float(Js.round(Gauntlet.round_contribution(d, true, "don") * (0.4 + 0.3 * stake)))
	var reward: Dictionary
	if stake == 3 and Dice.next() < 0.5:
		reward = { "kind": "boonDraft" }
	elif Dice.next() < 0.3:
		reward = { "kind": "hullBoost", "pct": 0.15 }
	elif Dice.next() < 0.22:
		reward = { "kind": "fullHeal" }
	else:
		reward = { "kind": "plunder", "n": plunder }
	var penalty: Dictionary
	if stake == 3 and Dice.next() < 0.5:
		penalty = { "kind": "curse" }
	elif stake >= 2 and Dice.next() < 0.3:
		penalty = { "kind": "hullCut", "pct": 0.08 }
	elif Dice.next() < 0.4:
		penalty = { "kind": "hpLossPct", "pct": minf(0.4, 0.1 + 0.06 * stake) }
	else:
		penalty = { "kind": "plunderLose", "n": float(Js.round(plunder * 0.7)) }
	return { "kind": kind, "stake": float(stake), "param": float(contract_param(kind, stake, d)), "reward": reward, "penalty": penalty }


## Was the job done? f: the fight's facts, summed over the party.
static func contract_met(c: Dictionary, f: Dictionary) -> bool:
	var won: bool = f.get("won", false) == true
	var n: Callable = func(k: String) -> float: return Js.num(f.get(k))
	match str(c["kind"]):
		"fast": return won and n.call("turns") <= float(c["param"])
		"deadeye": return won and n.call("shots") > 0.0 and n.call("crits") == n.call("shots")
		"no_crew": return won and n.call("crewAbilities") == 0.0
		"fire_only": return won and n.call("volleys") == 0.0 and n.call("megas") == 0.0
		"volley_only": return won and n.call("fires") == 0.0 and n.call("megas") == 0.0
		"ultimate_only": return won and n.call("fires") == 0.0 and n.call("volleys") == 0.0 and n.call("megas") > 0.0
		"no_dodge": return won and n.call("dodges") == 0.0
		"untouched": return won and n.call("nonSpecialHitsTaken") == 0.0
	return false


static func contract_goal(c: Dictionary) -> String:
	var d: Dictionary = Js.obj(Js.obj(Gauntlet.t().get("contracts")).get(str(c["kind"])))
	if str(c["kind"]) == "fast":
		var k: int = int(c["param"])
		return "Sink it in %d turn%s or fewer." % [k, "" if k == 1 else "s"]
	return str(d.get("goal", ""))


static func describe_reward(r: Dictionary) -> String:
	match str(r["kind"]):
		"plunder": return "+%s ⟡ plunder" % Js.thousands(float(r["n"]))
		"hullBoost": return "+%d%% max hull, rest of run" % int(round(float(r["pct"]) * 100.0))
		"boonDraft": return "A free power draft"
	return "Patched to full hull"


static func describe_penalty(p: Dictionary) -> String:
	match str(p["kind"]):
		"plunderLose": return "Lose %s ⟡ plunder" % Js.thousands(float(p["n"]))
		"curse": return "A curse for the rest of the run"
		"hpLossPct": return "Lose %d%% of your hull" % int(round(float(p["pct"]) * 100.0))
	return "-%d%% max hull, rest of run" % int(round(float(p["pct"]) * 100.0))
