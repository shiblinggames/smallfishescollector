extends RefCounted
## Part of Gauntlet: the co-op packs, port-native rules with no web mirror (a
## party's escorts, their fleets and named combos, the party and co-op
## settings, and the bond powers and their draw). Split out of core/gauntlet.gd
## on 2026-10-10 for size, and so the parity-held parts of Gauntlet read on
## their own. Callers go through Gauntlet's forwarders.

## A party's field (port rule, Kong 2026-10-03: "multiple ships for enemies
## just like in raids"): the lead from generate_fight, then escorts, mobs of
## the same depth, each with its own elite roll. port_rules gauntlet.party.
static func escorts(fight: Dictionary, n: int, terms: Dictionary, variant: String) -> Array:
	if n < 2:
		return []
	var pk: Dictionary = packs_cfg()
	var tm: Dictionary = terms if not terms.is_empty() else Gauntlet.no_terms()
	var d: int = int(fight["depth"])
	var boss: bool = fight["isBoss"] == true
	# The threat budget: the party's size, a little either way, less under a
	# boss, more in deep water.
	var budget: int = int(Js.num(Js.obj(pk.get("budget")).get(str(clampi(n, 2, 4)))))
	var sp: int = int(Js.nz(pk.get("spread"), 1.0))
	budget += int(floor(Dice.next() * (2 * sp + 1))) - sp
	if boss:
		budget -= int(Js.nz(pk.get("bossCut"), 2.0))
	budget += _deep_bonus(pk, variant, d)
	# The fleet: the lead's own when it is one of the descent's crews.
	var fleets: Dictionary = _fleets(variant)
	var names: Array = fleets.keys()
	names.sort()
	var lead_fleet: String = str(Js.obj(fight["enemy"]).get("raidId", ""))
	var home: String = lead_fleet if fleets.has(lead_fleet) else str(names[int(floor(Dice.next() * names.size()))])
	var away: String = ""
	if names.size() > 1 and d >= int(Js.num(Js.obj(pk.get("mixFrom")).get(variant))) and Dice.next() < float(Js.nz(pk.get("mixChance"), 0.4)):
		var others: Array = names.filter(func(x: String) -> bool: return x != home)
		away = str(others[int(floor(Dice.next() * others.size()))])
	fight["pack"] = _fleet_name(home) + ((" and " + _fleet_name(away)) if away != "" else "")
	var tm2: Dictionary = tm.duplicate()
	tm2["eliteChanceMult"] = float(tm["eliteChanceMult"]) * float(party_cfg().get("escortElite", 1.0))
	var out: Array = []
	var support: Array = Js.list(pk.get("support"))
	var has_sup: bool = false
	var has_other: bool = false
	var cost: Dictionary = Js.obj(pk.get("cost"))
	while out.size() < int(Js.nz(pk.get("maxEscorts"), 3.0)):
		var fl: String = home if away == "" or Dice.next() < 0.5 else away
		var afford: Array = Js.list(fleets[fl]).filter(func(p: Array) -> bool: return int(Js.nz(cost.get(str(p[1])), 2.0)) <= budget)
		if afford.is_empty():
			break
		var pair: Array = afford[int(floor(Dice.next() * afford.size()))]
		budget -= int(Js.nz(cost.get(str(pair[1])), 2.0))
		var en: Dictionary = Gauntlet.scale_to_curve(Gauntlet.hand(pair), d, false, variant)
		var r: Dictionary = Gauntlet._elite_roll(en, d, tm2)
		if r["elite"]:
			budget -= int(Js.nz(pk.get("eliteCost"), 2.0))
		# A role, from the ship's own fleet, when the pack has room for it.
		var role: String = ""
		if budget >= int(Js.nz(pk.get("roleCost"), 1.0)) and Dice.next() < float(Js.nz(pk.get("roleChance"), 0.55)):
			var can: Array = Js.list(Js.obj(Js.obj(pk.get("fleets")).get(fl)).get("roles")).filter(func(x: String) -> bool:
				return (not has_sup) if support.has(x) else (not has_other))
			if not can.is_empty():
				role = str(can[int(floor(Dice.next() * can.size()))])
				budget -= int(Js.nz(pk.get("roleCost"), 1.0))
				if support.has(role):
					has_sup = true
				else:
					has_other = true
		out.append({ "enemy": r["enemy"], "isElite": r["elite"], "affix": r["affix"], "role": role, "kind": str(pair[1]), "fleet": fl })
	_combo(fight, out, variant, d)
	return out


## The deep water's extra budget at this depth (the last step reached).
static func _deep_bonus(pk: Dictionary, variant: String, d: int) -> int:
	var add: int = 0
	for st: Variant in Js.list(Js.obj(pk.get("deepBonus")).get(variant)):
		if d >= int(st[0]):
			add = int(st[1])
	return add


## Co-op packs (port rules battle.gauntlet.packs).
static func packs_cfg() -> Dictionary:
	return Js.obj(coop_cfg().get("packs"))


## The descent's crews: { raidId: [[raidId, key], ...] }.
static func _fleets(variant: String) -> Dictionary:
	var out: Dictionary = {}
	for p: Variant in Js.list(Gauntlet.t()["pools"]["donMobs" if variant == "don" else "davyMobs"]):
		var pr: Array = p
		if not out.has(str(pr[0])):
			out[str(pr[0])] = []
		(out[str(pr[0])] as Array).append(pr)
	return out


static func _fleet_name(id: String) -> String:
	return str(Js.obj(Js.obj(packs_cfg().get("fleets")).get(id)).get("name", id.capitalize()))


## One named combo for the pack, past its depth: a role ship and a partner
## (the lead counts when it is a plain ship), neither with an elite affix.
## Written as { id, with } on each half (0 is the lead, escort j is j + 1).
static func _combo(fight: Dictionary, out: Array, variant: String, d: int) -> void:
	var pk: Dictionary = packs_cfg()
	if d < int(Js.num(Js.obj(pk.get("comboFrom")).get(variant))) or Dice.next() >= float(Js.nz(pk.get("comboChance"), 0.6)):
		return
	var heavy: Array = Js.list(pk.get("heavy"))
	var ships: Array = []
	var lead: Dictionary = Js.obj(fight["enemy"])
	if fight["isBoss"] != true and Js.obj(fight.get("affix")).is_empty() and fight.get("isElite", false) != true:
		ships.append({ "i": 0, "role": "", "kind": str(lead.get("key", "")), "name": str(lead.get("name", "")) })
	for j: int in out.size():
		var x: Dictionary = out[j]
		if Js.obj(x.get("affix")).is_empty():
			ships.append({ "i": j + 1, "role": str(x["role"]), "kind": str(x["kind"]), "name": str(Js.obj(x["enemy"]).get("name", "")) })
	var can: Array = []
	for c: Dictionary in Js.list(pk.get("combos")):
		for a: Dictionary in ships:
			if a["role"] != c["role"]:
				continue
			for p: Dictionary in ships:
				if p["i"] == a["i"]:
					continue
				var ok: bool = false
				match str(c["partner"]):
					"heavy": ok = heavy.has(p["kind"]) and p["role"] == ""
					"plain": ok = p["role"] == ""
					_: ok = p["role"] == c["partner"]
				if ok:
					can.append([c, a, p])
	if can.is_empty():
		return
	var pick: Array = can[int(floor(Dice.next() * can.size()))]
	var cb: Dictionary = pick[0]
	var halves: Array = [pick[1], pick[2]]
	for h: int in 2:
		var me: Dictionary = halves[h]
		var other: Dictionary = halves[1 - h]
		var tag: Dictionary = { "id": cb["id"], "with": float(other["i"]), "withName": other["name"], "half": "role" if h == 0 else "partner" }
		if int(me["i"]) == 0:
			fight["leadCombo"] = tag
		else:
			out[int(me["i"]) - 1]["combo"] = tag


static func combo_def(id: String) -> Dictionary:
	for c: Dictionary in Js.list(packs_cfg().get("combos")):
		if c["id"] == id:
			return c
	return {}


static func party_cfg() -> Dictionary:
	return Js.obj(Js.obj(Battle.cfg().get("gauntlet")).get("party"))


## Co-op's own (port rules battle.gauntlet): bond and crew synergy odds, the
## Fleet Chest, the vouchers.
static func coop_cfg() -> Dictionary:
	return Js.obj(Battle.cfg().get("gauntlet"))


## The co-op bond powers (port rules battle.gauntlet.bonds; none under the
## parity run, which reads the web's tables alone).
static func bonds() -> Array:
	return Js.list(Js.obj(Battle.cfg().get("gauntlet")).get("bonds"))


## One bond card for a co-op spread, weighted by rarity like the powers,
## among the families someone at the table can still take.
static func draw_bond(lowest: Dictionary, banned: Array) -> Dictionary:
	var meta: Dictionary = Gauntlet.t()["rarity"]
	var pool: Array = []
	var tot: float = 0.0
	for b: Dictionary in bonds():
		if banned.has(b["id"]):
			continue
		var nx: int = int(Js.num(lowest.get(b["id"]))) + 1
		if nx > Js.list(b["tiers"]).size():
			continue
		var w: float = float(Js.obj(meta.get(Gauntlet.rarity(b))).get("weight", 1.0))
		pool.append([b, nx, w])
		tot += w
	if pool.is_empty():
		return {}
	var r: float = Dice.next() * tot
	for p: Array in pool:
		r -= float(p[2])
		if r <= 0.0:
			var o: Dictionary = Gauntlet.boon_offer(p[0], int(p[1]))
			o["bond"] = true
			o["role"] = p[0].get("role", "")
			return o
	var last: Array = pool[pool.size() - 1]
	var o2: Dictionary = Gauntlet.boon_offer(last[0], int(last[1]))
	o2["bond"] = true
	o2["role"] = last[0].get("role", "")
	return o2
