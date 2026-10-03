extends SceneTree
## THE BATTLE ENGINE, through its rules (core/battle.gd): the aim bar's
## judgment, the damage roll's ranges, the enemy's pattern (Pete's crew never
## feint), a raid of fights with HP carried, crew orders (a heal reaching a
## crewmate), and Pete's raid played many times by simple captains, alone and
## in parties of two to four, for the win rate and the rounds it takes.
##
##   godot --headless --path godot/game -s tests/battle_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _seat(name: String, tier: int, power: float, nav: float, crew: Array) -> Dictionary:
	var hull: Dictionary = Rules.data()["shipCombat"][str(tier)]
	return {
		"uid": name, "name": name, "tier": float(tier), "hp": float(hull["durability"]), "max": float(hull["durability"]),
		"speed": float(hull["speed"]), "shipMin": float(hull["minDamage"]), "power": power, "nav": nav, "fortune": 5.0,
		"dmgMult": 1.0, "maxCharges": 3.0, "crew": crew, "used": [],
	}


func _crew(id: float, cls: String, lv: int) -> Dictionary:
	var c: Dictionary = Crew.t()["classes"][cls]
	var ms: Dictionary = {}
	for m: Dictionary in c["milestones"]:
		if lv >= int(m["unlockLevel"]):
			ms = m
	return { "id": id, "slug": cls, "name": cls, "cls": cls, "ms": ms }


## A fair captain: reads the enemy's pattern (as players learn it), holds
## fire into a dodge, dodges a volley or a shot when low, and aims like a
## fair player (crit 10%, hit 50%, graze 25%, miss 15%).
func _plan(b: Dictionary, si: int, use_crew: bool) -> Dictionary:
	var s: Dictionary = b["seats"][si]
	var lg: Dictionary = Battle.legal(b, s)
	var r: float = Dice.next()
	var aim: String = "critical" if r < 0.10 else ("hit" if r < 0.60 else ("graze" if r < 0.85 else "miss"))
	var nxt: String = Battle.predict(b, 1)[0]
	var act: String = "reload"
	if nxt == "dodge":
		act = "reload" if lg["reload"] else "fire"
	elif (nxt == "volley" or (nxt == "fire" and float(s["hp"]) < float(s["max"]) * 0.35)) and lg["dodge"]:
		act = "dodge"
	elif lg["volley"]:
		act = "volley"
	elif lg["fire"]:
		act = "fire"
	var plan: Dictionary = { "action": act, "aim": aim }
	if use_crew and float(s["hp"]) < float(s["max"]) * 0.5 and not (s["crew"] as Array).is_empty():
		var c: Dictionary = s["crew"][0]
		if Battle.ability_ok(b, s, c["id"]) == "":
			plan["ability"] = { "crew": c["id"], "target": si }
	return plan


func _run(n: int, seed: int, use_crew: bool) -> Dictionary:
	Dice.install(Dice.Mulberry32.new(seed))
	var seats: Array = []
	for i: int in n:
		seats.append(_seat("C%d" % i, 3, 14.0, 6.0, [_crew(float(i * 10 + 1), "mender", 10)]))
	var b: Dictionary = Battle.begin("corsairs_reckoning", seats)
	var rounds: int = 0
	while b["state"] != "lost" and b["state"] != "done" and rounds < 400:
		var plans: Array = []
		for i: int in n:
			plans.append(_plan(b, i, use_crew))
		Battle.resolve(b, plans)
		rounds += 1
		if b["state"] == "won":
			Battle.next_fight(b)
	return { "won": b["state"] == "done", "rounds": rounds }


func _init() -> void:
	# The judgment, inclusive at the edges.
	check(Battle.judge(0.5, 0.5) == "critical", "dead centre is a crit")
	check(Battle.judge(0.5 + 0.0115, 0.5) == "critical", "just inside the crit band")
	check(Battle.judge(0.25 + 0.06, 0.25) == "hit", "the hit edge")
	check(Battle.judge(0.5 + 0.098, 0.5) == "graze", "the graze edge")
	check(Battle.judge(0.5 + 0.0981, 0.5) == "miss", "past it, a miss")
	# The roll's ranges (a Schooner, power 14: base 6+2+3 = 11).
	Dice.install(Dice.Mulberry32.new(3))
	var lo: float = 999.0
	var hi: float = 0.0
	for k: int in 2000:
		var d: float = Battle.roll_shot("hit", 6.0, 14.0)
		lo = minf(lo, d)
		hi = maxf(hi, d)
	check(lo == 6.0 and hi == 11.0, "a hit rolls 6 to 11 (%d to %d)" % [int(lo), int(hi)])
	lo = 999.0
	hi = 0.0
	for k: int in 2000:
		var d2: float = Battle.roll_shot("critical", 6.0, 14.0)
		lo = minf(lo, d2)
		hi = maxf(hi, d2)
	check(lo == 12.0 and hi == 17.0, "a crit rolls 12 to 17 (%d to %d)" % [int(lo), int(hi)])
	# Pete's pattern from empty, as the web traces it.
	var b: Dictionary = Battle.begin("corsairs_reckoning", [_seat("A", 3, 14.0, 6.0, [])])
	for k: int in 4:
		b["fight"] = 0.0
	var e: Dictionary = b["enemy"]
	var acts: Array = []
	for k: int in 4:
		var a: String = Battle.pick_enemy(b)
		acts.append(a)
		if a == "reload":
			e["charges"] = float(e["charges"]) + 1.0
		elif a == "fire":
			e["charges"] = float(e["charges"]) - 1.0
	check(acts == ["reload", "fire", "reload", "fire"], "the Reef Raider's pattern (%s)" % str(acts))
	check(float(e["max"]) == 20.0 and float(e["acc"]) == 8.0, "its HP 20 and accuracy 4 + speed 4")
	# The enemy's HP, scaled by the party.
	var b4: Dictionary = Battle.begin("corsairs_reckoning", [_seat("A", 3, 14.0, 6.0, []), _seat("B", 3, 14.0, 6.0, []), _seat("C", 3, 14.0, 6.0, []), _seat("D", 3, 14.0, 6.0, [])])
	check(float(b4["enemy"]["max"]) == 64.0, "four captains face 20 x 3.2 = 64 (%d)" % int(b4["enemy"]["max"]))
	# A heal given to a crewmate.
	Dice.install(Dice.Mulberry32.new(9))
	var b2: Dictionary = Battle.begin("corsairs_reckoning", [_seat("A", 3, 14.0, 6.0, [_crew(1.0, "mender", 40)]), _seat("B", 3, 14.0, 6.0, [])])
	b2["seats"][1]["hp"] = 10.0
	var ev: Array = Battle.resolve(b2, [{ "action": "reload", "ability": { "crew": 1.0, "target": 1 } }, { "action": "reload" }])
	var healed: Array = ev.filter(func(x: Dictionary) -> bool: return x["t"] == "ability")
	check(not healed.is_empty() and int(healed[0]["target"]) == 1 and float(healed[0]["heal"]) == 16.0, "a Lv 40 Mender heals a crewmate 35%% of 45 (%s)" % str(healed))
	check(Battle.ability_ok(b2, b2["seats"][0], 1.0) != "", "an order once a raid")
	# Pete's raid, many times.
	for n: int in [1, 2, 3, 4]:
		var wins: int = 0
		var rounds: int = 0
		var runs: int = 300
		for k: int in runs:
			var r: Dictionary = _run(n, 1000 + k * 7 + n, true)
			if r["won"]:
				wins += 1
			rounds += int(r["rounds"])
		print("  Pete's raid, %d captain%s: %d%% won, %.1f rounds a run" % [n, "" if n == 1 else "s", int(100.0 * wins / runs), float(rounds) / runs])
		check(wins > 0, "a party of %d can win" % n)
	# The enemies' own ways.
	_ways()
	# Every raid, a strong captain alone, to see each plays through.
	for rid: String in ["captain_krust", "cartographer", "tollmasters_cut", "coffers_fleet", "the_quartermaster", "the_quartermasters_ghost", "the_blockade", "the_throne", "the_sunken_hand", "the_blockade_challenge", "the_throne_challenge"]:
		var wins2: int = 0
		var runs2: int = 60
		var stuck: int = 0
		for k: int in runs2:
			var r2: Dictionary = _run_raid(rid, 1, 5000 + k * 13)
			if r2["won"]:
				wins2 += 1
			if r2["stuck"]:
				stuck += 1
		print("  %s, 1 strong captain: %d%% won" % [rid, int(100.0 * wins2 / runs2)])
		check(stuck == 0, "%s always ends (%d stuck)" % [rid, stuck])
	print("  battle check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)


## A strong late-game captain: a Man-o-War, a full crew of the useful hands.
func _strong(name: String) -> Dictionary:
	var s: Dictionary = _seat(name, 6, 120.0, 40.0, [_crew(1.0, "mender", 70), _crew(2.0, "anchor", 70), _crew(3.0, "abyssal_tide", 70), _crew(4.0, "leviathan", 70), _crew(5.0, "snare", 70)])
	# A late-game hull: Navigation 80's hull, and four Abyssal pieces.
	s["items"] = ["the_standing_wall", "warden_of_the_deep", "bloodletter", "leviathans_cannon"]
	s["fx"] = Battle.item_fx(s["items"])
	s["saves"] = float(s["fx"]["lethalSave"])
	s["max"] = float(Js.round((125.0 + 80.0) * float(s["fx"]["maxHp"])))
	s["hp"] = s["max"]
	return s


func _run_raid(rid: String, n: int, seed: int) -> Dictionary:
	Dice.install(Dice.Mulberry32.new(seed))
	var seats: Array = []
	for i: int in n:
		seats.append(_strong("S%d" % i))
	var b: Dictionary = Battle.begin(rid, seats)
	var rounds: int = 0
	while b["state"] != "lost" and b["state"] != "done" and rounds < 600:
		var plans: Array = []
		for i: int in n:
			var p: Dictionary = _plan(b, i, false)
			# Any crew order that answers a check, or a heal when low.
			var s: Dictionary = b["seats"][i]
			for c: Dictionary in s["crew"]:
				if Battle.ability_ok(b, s, c["id"]) == "" and (not (b["enemy"]["check"] as Dictionary).is_empty() or float(s["hp"]) < float(s["max"]) * 0.5):
					p["ability"] = { "crew": c["id"], "target": i }
					break
			plans.append(p)
		Battle.resolve(b, plans)
		if b.has("flares"):
			var res: Array = []
			for i: int in n:
				res.append({ "missed": float(Dice.next() < 0.5), "feints": 0.0 })
			Battle.flares_land(b, res)
		rounds += 1
		if b["state"] == "won":
			var t: Dictionary = Battle.tide_due(b)
			if not t.is_empty():
				for i: int in n:
					Battle.tide_pick(b, i, t, str(t["choices"][0]["id"]))
			var rp: Dictionary = Battle.reprieve_due(b)
			if not rp.is_empty():
				for i: int in n:
					Battle.tide_pick(b, i, rp, str(rp["choices"][0]["id"]))
			Battle.next_fight(b)
	return { "won": b["state"] == "done", "stuck": rounds >= 600 }


func _ways() -> void:
	Dice.install(Dice.Mulberry32.new(77))
	# Carapace: Krust's crew take a slice off a single shot.
	var b: Dictionary = Battle.begin("captain_krust", [_strong("A")])
	b["enemy"]["pattern"] = ["reload"]
	b["seats"][0]["charges"] = 3.0
	var ev: Array = Battle.resolve(b, [{ "action": "fire", "aim": "hit" }])
	var shot: Array = ev.filter(func(x: Dictionary) -> bool: return x["t"] == "shot")
	check(not shot.is_empty() and shot[0].has("armour"), "Krust's carapace bites a fire (%s)" % str(shot))
	# An elite in a challenge run: two slots hardened with an affix.
	var bc: Dictionary = Battle.begin("captain_krust_challenge", [_strong("A")])
	check((bc["elites"] as Dictionary).size() == 2, "a challenge run rolls two elites (%s)" % str(bc["elites"]))
	# The Last Wall: Sal's second phase stands behind it.
	var bw: Dictionary = Battle.begin("the_blockade", [_strong("A")])
	while Battle.fight_at(Battle.raid_def("the_blockade"), int(bw["fight"]))["boss"] == false:
		Battle.next_fight(bw)
	var e: Dictionary = bw["enemy"]
	e["phase"] = 2.0
	e["hp"] = 1.0
	e["shield"] = 0.0
	e["pattern"] = ["reload"]
	(e["phases"][0] as Dictionary)["pattern"] = ["reload"]
	bw["seats"][0]["charges"] = 3.0
	Battle.resolve(bw, [{ "action": "fire", "aim": "critical" }])
	check(not (e["aegis"] as Dictionary).is_empty() and float(e["aegis"]["left"]) == 6.0, "phase 3 raises the Last Wall (%s)" % str(e["aegis"]))
	var hp0: float = float(e["hp"])
	bw["seats"][0]["charges"] = 3.0
	var ev2: Array = Battle.resolve(bw, [{ "action": "volley", "aim": "critical" }])
	check(float(e["hp"]) == hp0 and float(e["aegis"]["left"]) == 4.0, "a volley into the wall does nothing and cracks it twice")
	# Flares: the Coffers fleet's barrage on the third turn.
	var bf: Dictionary = Battle.begin("coffers_fleet", [_strong("A")])
	bf["enemy"]["pattern"] = ["reload"]
	var seen: bool = false
	for k: int in 3:
		Battle.resolve(bf, [{ "action": "dodge" if k % 2 == 1 else "reload" }])
		if bf.has("flares"):
			seen = true
			var hp1: float = float(bf["seats"][0]["hp"])
			Battle.flares_land(bf, [{ "missed": 2.0, "feints": 0.0 }])
			check(float(bf["seats"][0]["hp"]) < hp1, "two flares let through cost hull")
			break
	check(seen, "the flare barrage comes on turn three")
	# A tide's heal lands at once.
	var bt: Dictionary = Battle.begin("cartographer", [_strong("A")])
	bt["seats"][0]["hp"] = 10.0
	var pool: Array = Rules.data()["tides"]["pool"]
	var cove: Dictionary = pool.filter(func(t: Dictionary) -> bool: return t["id"] == "sheltered_cove")[0]
	var r: Dictionary = Battle.tide_pick(bt, 0, cove, "beach")
	check(float(bt["seats"][0]["hp"]) == float(bt["seats"][0]["max"]) and float(Battle.tide_agg(bt["seats"][0])["dmgMult"]) < 1.0, "the beach: a full heal, and gentler guns (%s)" % str(r))
	# The Sunken Hand's first ability (foresight) comes two to four turns in.
	var bh: Dictionary = Battle.begin("the_sunken_hand", [_strong("A")])
	var got: bool = false
	for k: int in 6:
		var ev3: Array = Battle.resolve(bh, [{ "action": "reload" if k % 2 == 0 else "dodge" }])
		if ev3.any(func(x: Dictionary) -> bool: return x["t"] == "bossAbility"):
			got = true
			break
	check(got, "the Hand's first ability comes early")
