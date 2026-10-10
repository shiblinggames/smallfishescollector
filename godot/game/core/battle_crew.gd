extends RefCounted
## Part of Battle (core/battle.gd): the captain's class order and the crew's
## abilities (order_ok, use_order, ability_ok, use_ability), with their heals,
## cleanses and ability damage. Split out of core/battle.gd on 2026-10-10 for
## size; every function is static over the battle's plain Dictionaries, as it
## was there.

const BattleCoop = preload("res://core/battle_coop.gd")
const BattleFoe = preload("res://core/battle_foe.gd")
const BattleTides = preload("res://core/battle_tides.gd")


# ══ The captain's class order (core/captain_class.gd) ═════════════════════════

## Why this captain's class order cannot go now, or "".
static func order_ok(s: Dictionary) -> String:
	var cf: Dictionary = Js.obj(s.get("cls"))
	if str(cf.get("order", "")) == "":
		return "No class order"
	if Battle._out(s):
		return "Sunk"
	if s.get("orderUsed", false):
		return "Used: back at the rest"
	if Battle.mods(s["statuses"])["silence"]:
		return "Silenced"
	return ""


## The order goes, at the start of the round with the crew's orders. `ally`:
## the ship Field Surgery is aimed at.
static func use_order(b: Dictionary, si: int, ally: int, ev: Array) -> void:
	var s: Dictionary = b["seats"][si]
	if order_ok(s) != "":
		return
	var cf: Dictionary = s["cls"]
	s["orderUsed"] = true
	var out: Dictionary = { "t": "order", "seat": si, "order": cf["order"], "name": CaptainClass.ORDER_NAME.get(cf["order"], "") }
	match str(cf["order"]):
		"powder_keg":
			s["keg"] = true
		"draw_fire":
			s["drawing"] = { "turns": 2.0, "cut": float(cf["drawCut"]) }
		"field_surgery":
			var power: float = 1.0 + float(cf.get("heal", 0.0))
			var who: Array = []
			if cf.get("surgeryAll", false):
				who = Battle.alive(b)
			else:
				var t: Dictionary = b["seats"][clampi(ally, 0, (b["seats"] as Array).size() - 1)]
				who = [s if Battle._out(t) else t]
			var healed: Array = []
			for t2: Dictionary in who:
				var got: float = _heal_m(t2, float(Js.round(float(t2["max"]) * float(cf["surgeryPct"]) * power)))
				if float(cf.get("surgeryShield", 0.0)) > 0.0:
					t2["shield"] = float(t2["shield"]) + float(Js.round(float(t2["max"]) * float(cf["surgeryShield"]) * power))
				healed.append({ "seat": Battle._idx(b["seats"], t2), "heal": got })
			out["healed"] = healed
		"full_sail":
			var loaded: Array = []
			for t3: Dictionary in Battle.alive(b):
				if Dice.next() < float(cf["sail"]) and float(t3["charges"]) < float(t3["maxCharges"]):
					t3["charges"] = float(t3["charges"]) + 1.0
					loaded.append(Battle._idx(b["seats"], t3))
			out["loaded"] = loaded
	ev.append(out)


## A crew ability a seat may fire now: not used this raid, one per turn, not
## silenced.
static func ability_ok(b: Dictionary, s: Dictionary, crew_id: Variant) -> String:
	if Battle._out(s):
		return "Sunk"
	if s.get("abilityThisTurn", false):
		return "One crew order a turn"
	if Js.list(s["used"]).any(func(x: Variant) -> bool: return float(x) == float(crew_id)):
		return "Already used this raid"
	if Battle.mods(s["statuses"])["silence"]:
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
	if Battle._out(t):
		t = s
	var e: Dictionary = b["enemy"]
	var ms: Dictionary = c["ms"]
	var out: Dictionary = { "t": "ability", "seat": si, "crew": c["id"], "cls": c["cls"], "name": c["name"], "target": Battle._idx(b["seats"], t) }
	var flags: Array = []
	## The Last Wall's crack or break from this order, played after it.
	var wall_ev: Array = []
	match str(c["cls"]):
		"mender":
			var heal: float = float(Js.round(float(t["max"]) * float(ms["pctMaxHp"]) * (1.0 + float(Js.obj(s.get("cls")).get("heal", 0.0)))))
			out["heal"] = _heal_m(t, heal)
			t["burn"] = {}
			if ms.get("cleanseDebuff", false):
				_cleanse(t)
			flags = ["heal"]
		"abyssal_tide":
			var hp_k: float = 1.0 + float(Js.obj(s.get("cls")).get("heal", 0.0))
			out["heal"] = _heal_m(t, float(Js.round(float(t["max"]) * float(ms["pctMaxHp"]) * hp_k)))
			t["burn"] = {}
			var sh: float = float(Js.round(float(t["max"]) * float(ms["shieldPctMaxHp"]) * hp_k))
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
			var dmg: float = floor(Battle.crit_max(float(s["shipMin"]), float(s["power"])) * float(ms["dmgMult"]))
			dmg = floor(dmg * (1.0 + float(ms["bossBonusPct"])) if big else dmg * (1.0 - float(ms["mobPenaltyPct"])))
			dmg = maxf(1.0, floor(dmg * _ability_mult(b, s)))
			out["dmg"] = _ability_damage(b, dmg, wall_ev)
			flags = ["burst", "snare"]
		"blitz":
			var hits: Array = []
			var hp_sim: float = float(e["hp"])
			for k: int in int(ms["shots"]):
				if hp_sim <= 0.0:
					break
				var frac: float = hp_sim / float(e["max"])
				var d: float = maxf(1.0, floor(Battle.roll_shot("hit", float(s["shipMin"]), float(s["power"])) * float(ms["shotDmgMult"]) * (1.0 + float(ms["frenzyMaxPct"]) * (1.0 - frac)) * _ability_mult(b, s)))
				hp_sim -= d
				hits.append(d)
			var tot: float = 0.0
			for d: float in hits:
				tot += _ability_damage(b, d, wall_ev)
			out["hits"] = hits
			out["dmg"] = tot
			flags = ["burst", "snare"]
		"foresight":
			out["reveal"] = BattleFoe.predict(b, int(ms["revealMoves"]))
			if Js.nz(ms.get("dodgeRefreshChance"), 0.0) > 0.0 and s.get("last", "") == "dodge" and Dice.next() < float(ms["dodgeRefreshChance"]):
				s["last"] = ""
				out["refresh"] = true
			flags = ["brace", "shield", "snare", "heal", "burst"]
		"vengeance":
			t["ward"] = { "turns": float(Battle.VENGEANCE_WARD_TURNS), "heal": ms["healPctMaxHp"], "buff": ms["dmgBuffPct"], "cleanse": ms.get("cleanseDebuff", false) == true }
			flags = ["brace", "shield"]
		"requiem":
			Battle.apply_status(e["statuses"], "marked", float(ms["markMag"]), float(ms["markTurns"]))
			BattleCoop._el(b, e, "marked", si)
			if ms.get("pierceShield", false):
				e["markPierce"] = float(ms["markTurns"])
			flags = ["snare", "burst"]
	BattleFoe._note_check(b, flags)
	# Second Calling: the order may stay unspent.
	var rf: float = float(BattleTides.tide_agg(s)["abilityRefund"])
	if rf > 0.0 and Dice.next() < rf:
		(s["used"] as Array).erase(c["id"])
		out["refund"] = true
	ev.append(out)
	ev.append_array(wall_ev)
	if float(e["hp"]) <= 0.0:
		BattleFoe._enemy_down(b, ev, true)


static func _heal(t: Dictionary, n: float) -> float:
	var before: float = float(t["hp"])
	t["hp"] = maxf(before, minf(float(t.get("healCap", t["max"])), before + n))
	return float(t["hp"]) - before


## A heal the run's heal multiplier scales (Iron Rations, Mending).
static func _heal_m(t: Dictionary, n: float) -> float:
	return _heal(t, float(Js.round(n * float(t.get("healMult", 1.0)))))


static func _cleanse(t: Dictionary) -> void:
	if BattleTides.tide_agg(t)["noCleanse"]:
		return
	for id: String in ["weaken", "feeble", "marked", "slowed", "silence", "corrode"]:
		(t["statuses"] as Dictionary).erase(id)


static func _ability_mult(b: Dictionary, s: Dictionary) -> float:
	var e: Dictionary = b["enemy"]
	var ta: Dictionary = BattleTides.tide_agg(s, e["boss"])
	var raw: float = float(s["dmgMult"]) * (1.0 + float(s["vBuff"])) * float(Battle.mods(s["statuses"])["dealt"]) * float(Battle.mods(e["statuses"])["taken"]) * float(ta["dmgMult"])
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
static func _ability_damage(b: Dictionary, dmg: float, ev: Array) -> float:
	var e: Dictionary = b["enemy"]
	if not (e["aegis"] as Dictionary).is_empty():
		BattleFoe._aegis_hit(b, 1.0, ev)
		return 0.0
	var to_hull: float = dmg
	if float(e["markPierce"]) <= 0.0 and float(e["shield"]) > 0.0:
		var absorbed: float = minf(float(e["shield"]), dmg)
		e["shield"] = float(e["shield"]) - absorbed
		to_hull = dmg - absorbed
	e["hp"] = maxf(0.0, float(e["hp"]) - to_hull)
	return to_hull
