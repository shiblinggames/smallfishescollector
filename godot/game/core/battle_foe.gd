extends RefCounted
## Part of Battle (core/battle.gd): the enemy's behaviour: its pattern and move
## (predict, pick_enemy), its action and shots and their targets, its death, the
## mechanic checks, and the boss's ways (phase abilities, the ward, the Last
## Wall's aegis). Split out of core/battle.gd on 2026-10-10 for size; every
## function is static over the battle's plain Dictionaries, as it was there.

const BattleCoop = preload("res://core/battle_coop.gd")
const BattleSeat = preload("res://core/battle_seat.gd")
const BattleTides = preload("res://core/battle_tides.gd")


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
	elif (a == "fire" and ch < 1.0) or (a == "volley" and ch < float(Battle.VOLLEY_COST)):
		a = "reload"
	elif a == "reload" and ch >= float(e["mag"]):
		idx += 1
		var nxt: String = pat[idx % pat.size()]
		if float(e["feint"]) < 1.0 and not e["dodgedLast"] and nxt != "dodge" and Dice.next() < Battle.FEINT_CHANCE:
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


static func _enemy_act(b: Dictionary, act: String, e_mods: Dictionary, plans: Array, ev: Array) -> void:
	var e: Dictionary = b["enemy"]
	if float(e["foresight"]) > 0.0:
		e["foresight"] = float(e["foresight"]) - 1.0
	if float(e["ward"]) > 0.0:
		e["ward"] = float(e["ward"]) - 1.0
	if e.get("frozenNow", false):
		ev.append({ "t": "eFrozen" })
		return
	if str(e.get("role", "")) != "" and BattleCoop._role_turn(b, e, ev):
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
			if Battle.alive(b).is_empty():
				return
	# Resilient: now and then it patches itself up.
	var af: Dictionary = e["affix"]
	if af.has("turnStartHealChance") and float(e["hp"]) > 0.0 and float(e["hp"]) < float(e["max"]) and Dice.next() < float(af["turnStartHealChance"]):
		var h: float = minf(maxf(maxf(1.0, float(Js.nz(af.get("turnStartHealBase"), 5.0))), float(Js.round(float(e["max"]) * float(Js.nz(af.get("turnStartHealMaxPct"), 0.05))))), float(e["max"]) - float(e["hp"]))
		e["hp"] = float(e["hp"]) + h
		ev.append({ "t": "eHeal", "hp": e["hp"], "heal": h, "why": "Resilient" })
	# A re-price: a ship that stripped its charges earlier this round.
	var cost: float = float(e["mag"]) if act == "ultimate" else (float(Battle.VOLLEY_COST) if act == "volley" else (1.0 if act == "fire" else 0.0))
	if float(e["charges"]) < cost:
		act = "reload"
	# Counter-Battery: a ship that rolled it smashes this shot out of the air.
	if act in ["fire", "volley"]:
		var me_j: int = Battle._idx(Battle.foes(b), e)
		for ci: int in (b["seats"] as Array).size():
			var cs: Dictionary = b["seats"][ci]
			if Battle._out(cs) or int(Js.nz(cs.get("counterOn"), -1.0)) != me_j:
				continue
			cs.erase("counterOn")
			e["charges"] = maxf(0.0, float(e["charges"]) - cost)
			var cta: Dictionary = BattleTides.tide_agg(cs)
			var gain: float = minf(float(cs["maxCharges"]) - float(cs["charges"]), float(cta["counterRefund"]))
			if gain > 0.0:
				cs["charges"] = float(cs["charges"]) + gain
			var cev: Dictionary = { "t": "counter", "seat": ci, "gain": gain }
			if float(cta["counterReflect"]) > 0.0 and float(e["hp"]) > 0.0:
				var pm: float = float(Js.nz(_phase(e).get("damageMult"), 1.0))
				var back: float = maxf(1.0, floor(float(Battle.rand_int(int(e["min"]), int(e["maxDmg"]))) * (2.0 if act == "volley" else 1.0) * pm * float(cta["counterReflect"])))
				e["hp"] = maxf(0.0, float(e["hp"]) - back)
				cev["reflect"] = back
				cev["enemyHp"] = e["hp"]
			ev.append(cev)
			BattleSeat.finish_check(b, ci, false, ev)
			if float(e["hp"]) <= 0.0:
				_enemy_down(b, ev, false)
			return
	match act:
		"reload":
			var more: float = 1.0 if float(BattleTides._line(b)["enemyUltCharge"]) > 0.0 and Dice.next() < float(BattleTides._line(b)["enemyUltCharge"]) else 0.0
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
					Battle.apply_status(e["statuses"], str(sp["status"]), Js.nz(sp.get("magnitude"), 0.0), Js.nz(sp.get("turns"), 1.0))
				else:
					var tg: int = _target(b, -1)
					if tg >= 0:
						BattleTides.seat_status(b["seats"][tg], str(sp["status"]), Js.nz(sp.get("magnitude"), 0.0), Js.nz(sp.get("turns"), 1.0))
			ev.append({ "t": "eSpecial", "name": sp.get("name", ""), "line": sp.get("line", "") })
		"fire", "volley", "ultimate":
			e["charges"] = maxf(0.0, float(e["charges"]) - cost)
			if broadside(b, act):
				# A BROADSIDE: every ship afloat at once, each its own dodge.
				ev.append({ "t": "eBroadside", "action": act })
				var k0: int = 0
				for i: int in (b["seats"] as Array).size():
					var s3: Dictionary = b["seats"][i]
					if not Battle._out(s3) and float(s3["hp"]) > 0.0:
						_enemy_shot(b, act, i, e_mods, plans, ev, k0 == 0, true)
						k0 += 1
			else:
				# Aimed shots (party scaling: a bigger line draws more), each at
				# a different ship it picks as it fires.
				var shots: int = 1
				var sh_tab: Array = Js.list(Js.obj(Battle.cfg().get("party")).get("shots"))
				if not sh_tab.is_empty():
					shots = int(sh_tab[clampi((b["seats"] as Array).size(), 1, sh_tab.size()) - 1])
				if Battle.foes(b).size() > 1:
					shots = maxi(1, shots - 1) if e["boss"] else 1
				var focus: bool = Js.obj(Battle.cfg().get("party")).get("focus", false) == true
				var hit: Array = []
				for k: int in shots:
					if Battle.alive(b).is_empty():
						break
					var ti: int = _target(b, -1) if focus else _target_new(b, hit)
					hit.append(ti)
					_enemy_shot(b, act, ti, e_mods, plans, ev, k == 0)
				# Frenzied: sometimes a second gun goes off.
				var af2: Dictionary = e["affix"]
				if act != "ultimate" and af2.has("doubleFireChance") and not Battle.alive(b).is_empty() and Dice.next() < float(af2["doubleFireChance"]):
					_enemy_shot(b, "fire", _target(b, -1), e_mods, plans, ev, false, false, true)


## Does this attack hit every ship (a boss's volley or ultimate, or the
## volley of an enemy listed as a broadside hand)?
static func broadside(b: Dictionary, act: String) -> bool:
	var bs: Dictionary = Js.obj(Battle.cfg().get("broadside"))
	if bs.is_empty():
		return false
	var e: Dictionary = b["enemy"]
	if e["boss"] and Js.list(bs.get("bossActions")).has(act):
		return true
	return act == "volley" and Js.list(bs.get("enemyVolleys")).has(e["id"])


## A target not yet shot at this round if any is left, else any ship afloat.
static func _target_new(b: Dictionary, hit: Array) -> int:
	var df: int = BattleCoop._draw_fire(b)
	if df >= 0:
		return df
	var pool: Array = []
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if not Battle._out(s) and float(s["hp"]) > 0.0 and not hit.has(i):
			pool.append(i)
	if pool.is_empty():
		return _target(b, -1)
	return pool[int(floor(Dice.next() * pool.size()))]


## Its target: a ship still afloat, at random (never shown before it fires);
## `not_i` is passed over when another ship is left.
static func _target(b: Dictionary, not_i: int) -> int:
	var df: int = BattleCoop._draw_fire(b, not_i)
	if df >= 0:
		return df
	var pool: Array = []
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if not Battle._out(s) and float(s["hp"]) > 0.0 and i != not_i:
			pool.append(i)
	if pool.is_empty():
		return not_i
	return pool[int(floor(Dice.next() * pool.size()))]


static func _enemy_shot(b: Dictionary, act: String, ti: int, e_mods: Dictionary, plans: Array, ev: Array, main: bool, all: bool = false, frenzy: bool = false) -> void:
	if ti < 0:
		return
	ti = BattleCoop._shield_wall(b, ti, ev)
	var e: Dictionary = b["enemy"]
	var t: Dictionary = b["seats"][ti]
	var base: float = float(Battle.rand_int(int(e["min"]), int(e["maxDmg"])))
	var dmg: float
	if act == "ultimate":
		dmg = maxf(1.0, floor(base * Js.nz(Js.obj(e.get("ultimate")).get("mult"), 2.6) * float(BattleTides._line(b)["enemyUlt"])))
	else:
		dmg = base * (2.0 if act == "volley" else 1.0)
	if float(e_mods["dealt"]) != 1.0:
		dmg = maxf(1.0, floor(dmg * float(e_mods["dealt"])))
	if int(e["phase"]) >= 2:
		dmg = maxf(1.0, floor(dmg * float(e["phases"][int(e["phase"]) - 2].get("damageMult", 1.0))))
	if float(e["wardBuff"]) > 0.0:
		dmg = maxf(1.0, floor(dmg * (1.0 + float(e["wardBuff"]))))
	var af: Dictionary = e["affix"]
	var ta: Dictionary = BattleTides.tide_agg(t, e["boss"])
	var eff_crit: float = 0.0 if act == "ultimate" else minf(1.0, float(e["crit"]) * float(Js.nz(af.get("critMult"), 1.0)))
	var combo_ev: String = ""
	if not Js.obj(e.get("combo")).is_empty() and str(e["combo"].get("half", "")) == "partner":
		var st: Dictionary = t["statuses"]
		if BattleCoop.combo_partner(b, e, "hammer_anvil") >= 0 and (st.has("blinded") or st.has("narrowed")):
			dmg = maxf(1.0, floor(dmg * (1.0 + float(Js.nz(Gauntlet.combo_def("hammer_anvil").get("pct"), 0.25)))))
			combo_ev = "Hammer and Anvil"
		if BattleCoop.combo_partner(b, e, "called_shot") >= 0 and st.has("marked") and act != "ultimate":
			eff_crit = minf(1.0, eff_crit + float(Js.nz(Gauntlet.combo_def("called_shot").get("crit"), 0.2)))
			combo_ev = "Called Shot"
	if combo_ev != "":
		ev.append({ "t": "comboNote", "foe": Battle._idx(Battle.foes(b), e), "seat": ti, "text": combo_ev })
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
			var def: int = Battle.d20() + int(t["nav"])
			var atk: int = Battle.d20() + int(maxf(0.0, float(e["acc"])))
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
					BattleSeat._reflect(b, ti, maxf(1.0, float(Js.round(would * float(ta["retaliateDodge"])))), ev, "Spiteful Wake")
				# An astrolabe's parry throws some of it back.
				var tfx: Dictionary = Js.obj(t.get("fx"))
				if float(tfx.get("parry", 0.0)) > 0.0 and float(tfx.get("parryReflect", 0.0)) > 0.0 and Dice.next() < float(tfx["parry"]):
					BattleSeat._reflect(b, ti, maxf(1.0, floor(would * float(tfx["parryReflect"]))), ev, "Parry")
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
			BattleSeat._reflect(b, ti, maxf(1.0, float(Js.round(raw_in * float(ta["parryReflect"])))), ev, "Cutlass Guard")
	# The first blow of a fight, turned aside outright.
	if dmg > 0.0 and not t.get("firstBlow", false):
		t["firstBlow"] = true
		if float(tfx2.get("firstBlowParry", 0.0)) > 0.0 and Dice.next() < float(tfx2["firstBlowParry"]):
			if float(tfx2.get("parryReflect", 0.0)) > 0.0:
				BattleSeat._reflect(b, ti, maxf(1.0, floor(dmg * float(tfx2["parryReflect"]))), ev, "Aegis")
			dmg = 0.0
			out["parried"] = true
	if dmg > 0.0:
		var taken: float = float(Battle.mods(t["statuses"])["taken"]) * (1.0 if frenzy else float(ta["inDmg"])) * float(tfx2.get("inMult", 1.0)) * BattleCoop._bond_taken(b, ti)
		taken *= 1.0 - float(Js.obj(t.get("cls")).get("dmgTaken", 0.0))
		if not Js.obj(t.get("drawing")).is_empty():
			taken *= 1.0 - float(t["drawing"]["cut"])
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
		BattleCoop._lashed(b, ti, ev)
	if dmg <= 0.0:
		return
	# Being hit feeds the guns.
	if float(tfx2.get("chargeOnHit", 0.0)) > 0.0 and Dice.next() < float(tfx2["chargeOnHit"]) and float(t["charges"]) < float(t["maxCharges"]):
		t["charges"] = float(t["charges"]) + 1.0
		ev.append({ "t": "loaded", "seat": ti, "charges": t["charges"] })
	# The shark's bite: a landed shot knocks a ball out of the rack.
	var bite_c: float = minf(1.0, float(e["bite"]) + float(BattleTides._line(b)["enemyBite"]))
	if not frenzy and bite_c > 0.0 and float(t["charges"]) > 0.0 and Dice.next() < bite_c:
		t["charges"] = float(t["charges"]) - 1.0
		ev.append({ "t": "bite", "seat": ti, "charges": t["charges"] })
	# Spiteful Wake's thorns, off the blow before it was cut down.
	if not frenzy and float(ta["retaliate"]) > 0.0 and raw_in > 0.0 and float(e["hp"]) > 0.0 and not out.get("parried", false):
		BattleSeat._reflect(b, ti, maxf(1.0, float(Js.round(raw_in * float(ta["retaliate"]) * float(ta["retaliateBoost"])))), ev, "Spiteful Wake")
	# Scorching, else Glacial.
	if float(t["hp"]) > 0.0:
		if af.has("burnChance") and Dice.next() < float(af["burnChance"]):
			t["burn"] = { "turns": 2.0, "dmg": maxf(1.0, minf(float(Js.round(dmg * 0.10)), float(Js.round(float(t["max"]) * 0.10)))) }
			ev.append({ "t": "ablaze", "seat": ti })
		elif af.has("freezeChance") and Dice.next() < float(af["freezeChance"]):
			t["freeze"] = 1.0
			ev.append({ "t": "iced", "seat": ti })
	# Vampiric (or a curse's leech): it drinks some of it back.
	var steal_pct: float = maxf(Js.num(af.get("lifestealPct")), 0.0 if frenzy else float(BattleTides._line(b)["enemyLeech"]))
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
	BattleCoop._spoils(b, e, ev)
	# A combo's half gone: the other is on its own now.
	var cb: Dictionary = Js.obj(e.get("combo"))
	if not cb.is_empty():
		var j: int = int(cb["with"])
		if j >= 0 and j < Battle.foes(b).size() and Battle.foe_up(Battle.foes(b)[j]):
			ev.append({ "t": "comboBroken", "foe": j, "name": str(Gauntlet.combo_def(str(cb["id"])).get("name", "")) })


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
		for s: Dictionary in Battle.alive(b):
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
	## The seats whose hull the failure cost (the feats read it).
	var hurt: Array = []
	for si: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][si]
		if Battle._out(s):
			continue
		var hp0: float = float(s["hp"])
		match str(c["kind"]):
			"damagePctMaxHp":
				s["hp"] = maxf(0.0, float(s["hp"]) - maxf(1.0, float(Js.round(float(s["max"]) * float(c["value"])))))
			"burnDot":
				s["burn"] = { "turns": float(c["turns"]), "dmg": maxf(1.0, float(Js.round(float(s["max"]) * float(c["pctPerTurn"])))) }
			"status":
				BattleTides.seat_status(s, str(c["status"]), float(c["magnitude"]), float(c["turns"]))
				if c.get("dmgPct") != null:
					s["hp"] = maxf(0.0, float(s["hp"]) - maxf(1.0, float(Js.round(float(s["max"]) * float(c["dmgPct"])))))
		if float(s["hp"]) < hp0:
			hurt.append(si)
	if str(c["kind"]) == "enemyHealPctMaxHp":
		e["hp"] = minf(float(e["max"]), float(e["hp"]) + maxf(1.0, float(Js.round(float(e["max"]) * float(c["value"])))))
	ev.append({ "t": "checkFail", "line": e["check"]["def"].get("failLine", ""), "hurt": hurt })
	e["check"] = {}


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
				if Battle._out(s) or float(s["hp"]) <= 0.0:
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
			for s2: Dictionary in Battle.alive(b):
				BattleTides.seat_status(s2, "marked", Js.nz(a.get("value"), 0.3), Js.nz(a.get("turns"), 3.0))
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
	var taken: float = float(Battle.mods(t["statuses"])["taken"]) * float(BattleTides.tide_agg(t)["inDmg"])
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
