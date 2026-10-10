extends RefCounted
## Part of Battle (core/battle.gd): the co-op layer: the crossfire, a co-op
## field's escort roles, the breakwater, combos, bond powers and the elements'
## reactions. Split out of core/battle.gd on 2026-10-10 for size; every function
## is static over the battle's plain Dictionaries, as it was there.

const BattleCrew = preload("res://core/battle_crew.gd")
const BattleFoe = preload("res://core/battle_foe.gd")
const BattleSeat = preload("res://core/battle_seat.gd")
const BattleTides = preload("res://core/battle_tides.gd")


## A crossfire's multiplier for n criticals in one round (1 under two).
static func crossfire_mult(n: float) -> float:
	if n < 2.0:
		return 1.0
	return 1.0 + float(Js.nz(Js.obj(Battle.cfg().get("crossfire")).get("pct"), 0.25)) * (n - 1.0)


# ══ Roles (a co-op field's escorts) ════════════════════════════════════════════

## Every few of its turns an escort spends the turn on its role, instantly.
## Returns whether it did (it then does nothing else this turn).
static func _role_turn(b: Dictionary, e: Dictionary, ev: Array) -> bool:
	var rc: Dictionary = Battle.roles_cfg()
	e["roleTurn"] = float(e.get("roleTurn", 0.0)) + 1.0
	if int(e["roleTurn"]) % int(Js.nz(rc.get("every"), 3.0)) != 2 % int(Js.nz(rc.get("every"), 3.0)):
		return false
	# Boarded: its crew are busy repelling boarders, and the turn is lost
	# (its own flag: "jammed" is the snare's, on a dodge).
	if e.get("boardedJam", false):
		e["boardedJam"] = false
		ev.append({ "t": "comboNote", "foe": Battle._idx(Battle.foes(b), e), "text": "Boarders! No %s this turn" % str(Js.obj(rc.get(str(e["role"]))).get("name", "")) })
		return false
	var fs: Array = Battle.foes(b)
	var me_j: int = Battle._idx(fs, e)
	var r: String = str(e["role"])
	var def: Dictionary = Js.obj(rc.get(r))
	match r:
		"shieldwright", "sawbones":
			# Its most hurt ally afloat (itself if it is the only one).
			var best: int = -1
			for j: int in fs.size():
				var f: Dictionary = fs[j]
				if not Battle.foe_up(f):
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
			var ti: int = BattleFoe._target(b, -1)
			if ti < 0:
				return false
			var blind: bool = Dice.next() < 0.5
			BattleTides.seat_status(b["seats"][ti], "blinded" if blind else "narrowed", float(def["blind"]) if blind else float(def["narrow"]), float(def["turns"]))
			ev.append({ "t": "role", "role": r, "foe": me_j, "seat": ti, "status": "blinded" if blind else "narrowed", "name": def.get("name", "") })
		"rallier":
			var to: Array = []
			for j2: int in fs.size():
				if Battle.foe_up(fs[j2]):
					Battle.apply_status(fs[j2]["statuses"], "enrage", float(def["mag"]), float(def["turns"]))
					to.append(j2)
			ev.append({ "t": "role", "role": r, "foe": me_j, "all": to, "name": def.get("name", "") })
			# War Drums: the partner loads a ball on the beat.
			var pj: int = combo_partner(b, e, "war_drums")
			if pj >= 0 and float(fs[pj]["charges"]) < float(fs[pj]["mag"]):
				fs[pj]["charges"] = float(fs[pj]["charges"]) + 1.0
				ev.append({ "t": "comboNote", "foe": pj, "text": "War Drums  +1 ball" })
		"spotter":
			# _target: Draw Fire pulls the spotter's eye to the tank as well.
			var ts: int = BattleFoe._target(b, -1)
			if ts < 0:
				return false
			BattleTides.seat_status(b["seats"][ts], "marked", float(def["mark"]), float(def["turns"]))
			ev.append({ "t": "role", "role": r, "foe": me_j, "seat": ts, "status": "marked", "name": def.get("name", "") })
		_:
			return false
	return true


## A Breakwater afloat may take a shot aimed at an ally (passive). Returns the
## enemy the shot now goes to.
static func breakwater(b: Dictionary, si: int, tj: int, ev: Array) -> int:
	var fs: Array = Battle.foes(b)
	if fs.size() < 2:
		return tj
	var ch: float = float(Js.nz(Js.obj(Battle.roles_cfg().get("breakwater")).get("chance"), 0.35))
	# A ship our spotter marked is in the open: nothing covers it.
	if tj >= 0 and tj < fs.size() and not Js.obj(fs[tj].get("spot")).is_empty():
		return tj
	for j: int in fs.size():
		if j == tj or not Battle.foe_up(fs[j]) or fs[j].get("role", "") != "breakwater":
			continue
		var c2: float = ch
		if combo_partner(b, fs[j], "shield_sword") == tj:
			c2 += float(Js.nz(Gauntlet.combo_def("shield_sword").get("chance"), 0.25))
		if Dice.next() < c2:
			ev.append({ "t": "intercept", "foe": j, "from": tj, "seat": si })
			if combo_partner(b, fs[j], "field_surgeon") >= 0:
				var amt: float = minf(float(fs[j]["max"]) - float(fs[j]["hp"]), maxf(1.0, float(Js.round(float(fs[j]["max"]) * float(Js.nz(Gauntlet.combo_def("field_surgeon").get("pct"), 0.06))))))
				if amt > 0.0:
					fs[j]["hp"] = float(fs[j]["hp"]) + amt
					ev.append({ "t": "comboNote", "foe": j, "text": "Field Surgeon  +%d" % int(amt), "hp": fs[j]["hp"] })
			return j
	return tj


## A co-op pack's combo: the other half's index when this ship is in the
## named combo and both halves still float; else -1.
static func combo_partner(b: Dictionary, e: Dictionary, id: String) -> int:
	var cb: Dictionary = Js.obj(e.get("combo"))
	if cb.is_empty() or str(cb["id"]) != id or not Battle.foe_up(e):
		return -1
	var fs: Array = Battle.foes(b)
	var j: int = int(cb["with"])
	if j < 0 or j >= fs.size() or not Battle.foe_up(fs[j]):
		return -1
	return j


# ══ Bond powers (a co-op gauntlet's role powers; port rules battle.gauntlet.bonds) ══
#
# Each is a TideEffect of kind bond*, held by one captain and reaching the
# others. None of this does anything (or rolls a die) unless a ship in the
# line holds the bond, so solo fights and raids are untouched.

static func bond_of(s: Dictionary, kind: String) -> Dictionary:
	if Js.list(s.get("tfx")).is_empty():
		return {}
	return Js.obj(Js.obj(BattleTides.tide_agg(s).get("bond")).get(kind))


## Every ship in the fight holding a bond: [[seat index, effect]].
static func _holders(b: Dictionary, kind: String) -> Array:
	var out: Array = []
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if Battle._out(s) or float(s["hp"]) <= 0.0:
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
		if Battle._out(s) or float(s["hp"]) <= 0.0:
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
		for o: Dictionary in Battle.alive(b):
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
					e["boardedJam"] = true
				Battle.apply_status(e["statuses"], "marked", best, 2.0)
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
				for f: Dictionary in Battle.foes(b):
					if is_same(f, e) or not Battle.foe_up(f):
						continue
					# It rakes, it never sinks a ship.
					var hit: float = minf(splash, float(f["hp"]) - 1.0)
					if hit > 0.0:
						f["hp"] = float(f["hp"]) - hit
						ev.append({ "t": "rake", "seat": si, "foe": Battle._idx(Battle.foes(b), f), "dmg": hit, "enemyHp": f["hp"] })


## A reload: Powder Runner hands a ball along; Signal Flags go up.
static func _bond_reload(b: Dictionary, si: int, ev: Array) -> void:
	var s: Dictionary = b["seats"][si]
	var pr: Dictionary = bond_of(s, "bondPowder")
	if not pr.is_empty():
		var best: int = -1
		for i: int in (b["seats"] as Array).size():
			var o: Dictionary = b["seats"][i]
			if i == si or Battle._out(o) or float(o["hp"]) <= 0.0 or float(o["charges"]) >= float(o["maxCharges"]):
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
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		if i != not_i and not Js.obj(s.get("drawing")).is_empty() and not Battle._out(s) and float(s["hp"]) > 0.0:
			return i
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
		m *= 1.0 - float(cr["pct"]) * mini(3, Battle.alive(b).size() - 1)
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
			if i == int(h[0]) or Battle._out(o) or float(o["hp"]) <= 0.0:
				continue
			var got: float = BattleCrew._heal_m(o, float(Js.round(float(o["max"]) * float(h[1]["pct"]))))
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
	var h: float = BattleCrew._heal(b["seats"][to], float(Js.round(got * float(sg["pct"]))))
	if h > 0.0:
		_bond_note(ev, si, to, "+%d" % int(h))


## The crewmate (not si) with the smallest share of their hull left, under
## `below` of it; -1 if none.
static func _most_hurt(b: Dictionary, si: int, below: float, skip: int = -1) -> int:
	var best: int = -1
	for i: int in (b["seats"] as Array).size():
		var o: Dictionary = b["seats"][i]
		if i == si or i == skip or Battle._out(o) or float(o["hp"]) <= 0.0:
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
			var got: float = BattleCrew._heal_m(o, float(Js.round(float(o["max"]) * float(h[1]["pct"]))))
			if got > 0.0:
				_bond_note(ev, int(h[0]), to, "+%d" % int(got))
			var fh: Dictionary = bond_of(b["seats"][h[0]], "bondDressingTwo")
			var to2: int = _most_hurt(b, int(h[0]), 1.0, to) if not fh.is_empty() else -1
			if to2 >= 0:
				var o3: Dictionary = b["seats"][to2]
				var got2: float = BattleCrew._heal_m(o3, float(Js.round(float(o3["max"]) * float(h[1]["pct"]) * float(fh["pct"]))))
				if got2 > 0.0:
					_bond_note(ev, int(h[0]), to2, "+%d" % int(got2))
	for h2: Array in _holders(b, "bondSalts"):
		for i: int in (b["seats"] as Array).size():
			var o2: Dictionary = b["seats"][i]
			if i == int(h2[0]) or Battle._out(o2):
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
	for r: Dictionary in Js.list(Js.obj(Battle.cfg().get("gauntlet")).get("reactions")):
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
	if not _coop_dive(b) or not Battle.foe_up(e) or str(e.get("reactRound", "")) == "%d:%d" % [int(b["fight"]), int(b["turn"])]:
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
	var fs: Array = Battle.foes(b)
	var me_j: int = Battle._idx(fs, e)
	var x: Dictionary = { "t": "reaction", "id": id, "name": r.get("name", ""), "seat": si, "foe": me_j, "others": [] }
	match id:
		"fog_bank":
			e["fogged"] = float(Js.nz(r.get("miss"), 0.6))
			e["freeze"] = 0.0
			e["frozenNow"] = false
		"greek_fire":
			for f: Dictionary in fs:
				if not is_same(f, e) and Battle.foe_up(f) and Js.obj(f.get("burn")).is_empty():
					f["burn"] = Js.obj(e["burn"]).duplicate()
					(x["others"] as Array).append({ "foe": Battle._idx(fs, f), "burn": true })
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
				if not is_same(f2, e) and Battle.foe_up(f2):
					_splash_one(f2, float(Js.round(crush * 0.5)), Battle._idx(fs, f2), x)
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
	if amt <= 0.0 or not Battle.foe_up(e):
		return
	var to_hull: float = amt
	if not pierce and float(e["shield"]) > 0.0:
		var ab: float = minf(float(e["shield"]), amt)
		e["shield"] = float(e["shield"]) - ab
		to_hull = amt - ab
	e["hp"] = BattleFoe._ward_floor(b, float(e["hp"]) - to_hull, ev)
	x["dmg"] = to_hull
	BattleSeat.finish_check(b, si, false, ev)


## A reaction's splash on every other ship afloat (it never sinks one).
static func _splash_others(b: Dictionary, e: Dictionary, amt: float, x: Dictionary) -> void:
	var fs: Array = Battle.foes(b)
	for f: Dictionary in fs:
		if not is_same(f, e) and Battle.foe_up(f):
			_splash_one(f, amt, Battle._idx(fs, f), x)


static func _splash_one(f: Dictionary, amt: float, j: int, x: Dictionary) -> void:
	var hit: float = minf(amt, float(f["hp"]) - 1.0)
	if hit <= 0.0:
		return
	f["hp"] = float(f["hp"]) - hit
	(x["others"] as Array).append({ "foe": j, "dmg": hit, "hp": f["hp"] })
