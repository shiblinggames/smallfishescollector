extends SceneTree
## RAID BALANCE SIM (Godot port, 2026-10-06; the co-op raid audit). Fair
## captains play whole raids on the real rules: they aim like an average
## player (crit 10%, hit 50%, graze 25%, miss 15%), read the enemy's pattern
## as players learn it, dodge a volley or a shot when low, answer a boss's
## check with a crew order that meets it, heal or shield the lowest ship in
## the line, and focus the weakest foe on a field. Each raid is played by the
## captain it is made for (tuned so one alone wins Normal about 3 in 4), then
## by lines of 2 and 4 on each tier: win rate, rounds, ships sunk.
##
##   godot --headless --path godot/game -s tests/raid_balance_sim.gd -- [raid ...] [--runs=N]

const FLAGS: Dictionary = {
	"mender": ["heal"], "abyssal_tide": ["heal", "shield", "brace"], "snare": ["snare"], "anchor": ["brace"],
	"leviathan": ["burst", "snare"], "blitz": ["burst", "snare"], "foresight": ["brace", "shield", "snare", "heal", "burst"],
	"vengeance": ["brace", "shield"], "requiem": ["snare", "burst"],
}
const SUPPORT: Array = ["mender", "abyssal_tide", "anchor", "vengeance"]

var strength: float = 0.5


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


## The captain a raid is made for, by strength (tuned per raid so one alone
## wins Normal about 3 in 4): up to 1 the hull, guns, Navigation and crew
## grow; past 1 an endgame hull takes on its Abyssal pieces one by one.
func _build(rid: String, i: int) -> Dictionary:
	var p: float = strength
	var crew_lv: int = int(10 + 60 * minf(1.0, p))
	var classes: Array = ["mender", "anchor", "abyssal_tide", "snare"] + (["leviathan"] if p > 1.0 else [])
	var crew: Array = []
	for c: int in classes.size():
		crew.append(_crew(i * 10 + c + 1.0, classes[c], crew_lv))
	if p <= 1.0:
		var tier: int = clampi(int(round(2.0 + p * 4.0)), 2, 6)
		var s: Dictionary = _seat("S%d" % i, tier, 10.0 + 110.0 * p, 5.0 + 35.0 * p, crew)
		s["max"] = float(Js.round(float(s["max"]) * (1.0 + p)))
		s["hp"] = s["max"]
		return s
	var st: Dictionary = _seat("S%d" % i, 6, 120.0, 40.0, crew)
	var all: Array = ["the_standing_wall", "warden_of_the_deep", "bloodletter", "leviathans_cannon"]
	st["items"] = all.slice(0, clampi(int(floor((p - 1.0) * 4.0 + 0.001)), 0, 4))
	st["fx"] = Battle.item_fx(st["items"])
	st["saves"] = float(Js.nz(st["fx"].get("lethalSave"), 0.0))
	st["max"] = float(Js.round((125.0 + 80.0) * float(Js.nz(st["fx"].get("maxHp"), 1.0))))
	st["hp"] = st["max"]
	return st


func _plan(b: Dictionary, si: int, answered: Array, healed: Array) -> Dictionary:
	var s: Dictionary = b["seats"][si]
	var lg: Dictionary = Battle.legal(b, s)
	var fs: Array = Battle.foes(b)
	var t: int = 0
	if fs.size() > 1:
		t = -1
		for j: int in fs.size():
			if Battle.foe_up(fs[j]) and (t < 0 or float(fs[j]["hp"]) < float(fs[t]["hp"])):
				t = j
		t = maxi(0, t)
	var keep: Dictionary = b["enemy"]
	if fs.size() > 1:
		b["enemy"] = fs[t]
	var r: float = Dice.next()
	var aim: String = "critical" if r < 0.10 else ("hit" if r < 0.60 else ("graze" if r < 0.85 else "miss"))
	var nxt: String = Battle.predict(b, 1)[0]
	b["enemy"] = keep
	var act: String = "reload"
	if nxt == "dodge":
		act = "reload" if lg["reload"] else "fire"
	elif (nxt == "volley" or (nxt == "fire" and float(s["hp"]) < float(s["max"]) * 0.35)) and lg["dodge"]:
		act = "dodge"
	elif lg["volley"]:
		act = "volley"
	elif lg["fire"]:
		act = "fire"
	var plan: Dictionary = { "action": act, "aim": aim, "target": t }
	# A boss's check: the first captain who can, answers it.
	var ck: Dictionary = Js.obj(Js.obj(b.get("enemy")).get("check"))
	if not ck.is_empty() and answered.is_empty():
		var resp: Array = Js.list(Js.obj(ck.get("def")).get("responses"))
		for c: Dictionary in s["crew"]:
			if Battle.ability_ok(b, s, c["id"]) == "" and (FLAGS.get(c["cls"], []) as Array).any(func(f: String) -> bool: return resp.has(f)):
				plan["ability"] = { "crew": c["id"], "target": si }
				answered.append(si)
				return plan
	# The lowest ship in the line, under half: healed or shielded by one captain.
	var low: int = -1
	for i: int in (b["seats"] as Array).size():
		var x: Dictionary = b["seats"][i]
		if Battle.alive(b).has(x) and float(x["hp"]) < float(x["max"]) * 0.5 and (low < 0 or float(x["hp"]) / float(x["max"]) < float(b["seats"][low]["hp"]) / float(b["seats"][low]["max"])):
			low = i
	if low >= 0 and not healed.has(low):
		for c2: Dictionary in s["crew"]:
			if SUPPORT.has(c2["cls"]) and Battle.ability_ok(b, s, c2["id"]) == "":
				plan["ability"] = { "crew": c2["id"], "target": low }
				healed.append(low)
				break
	return plan


func run(rid: String, n: int, tier: String, seed: int) -> Dictionary:
	Dice.install(Dice.Mulberry32.new(seed))
	var seats: Array = []
	for i: int in n:
		seats.append(_build(rid, i))
	var b: Dictionary = Battle.begin(rid, seats, tier)
	var rounds: int = 0
	while b["state"] != "lost" and b["state"] != "done" and rounds < 900:
		var plans: Array = []
		var answered: Array = []
		var healed: Array = []
		for i: int in n:
			plans.append(_plan(b, i, answered, healed))
		Battle.resolve(b, plans)
		if b.has("flares"):
			var res: Array = []
			for i: int in n:
				res.append({ "missed": float(Dice.next() < 0.5), "feints": 0.0 })
			Battle.flares_land(b, res)
		rounds += 1
		if b["state"] == "won":
			for due: Dictionary in [Battle.tide_due(b), Battle.reprieve_due(b)]:
				if not due.is_empty():
					for i: int in n:
						Battle.tide_pick(b, i, due, str(due["choices"][0]["id"]))
			Battle.next_fight(b)
	var sunk: int = 0
	for s: Dictionary in b["seats"]:
		if s.get("sunk", false):
			sunk += 1
	return { "won": b["state"] == "done", "rounds": rounds, "sunk": sunk }


func rate(rid: String, n: int, tier: String, runs: int) -> Dictionary:
	var w: int = 0
	var rs: float = 0.0
	var sk: float = 0.0
	for k: int in runs:
		var r: Dictionary = run(rid, n, tier, 1000 + k)
		w += 1 if r["won"] else 0
		rs += float(r["rounds"])
		sk += float(r["sunk"])
	return { "w": float(w) / runs, "rounds": rs / runs, "sunk": sk / runs }


## The raid's captain: one alone wins Normal about 3 in 4.
func tune(rid: String) -> void:
	var lo: float = 0.0
	var hi: float = 2.0
	for it: int in 8:
		strength = (lo + hi) / 2.0
		if float(rate(rid, 1, "normal", 30)["w"]) < 0.75:
			lo = strength
		else:
			hi = strength
	strength = hi


func _init() -> void:
	var raids: Array = []
	var runs: int = 100
	var only: PackedStringArray = []
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--runs="):
			runs = int(a.trim_prefix("--runs="))
		elif a.begins_with("--coop=") or a.begins_with("--coopc="):
			# Try a tier's numbers without touching the rules: --coop=dmgMult:1.6,leadHp:1
			var tier_id: String = a.substr(2, a.find("=") - 2)
			for kv: String in a.substr(a.find("=") + 1).split(","):
				var pr: PackedStringArray = kv.split(":")
				Battle.cfg()["tiers"][tier_id][pr[0]] = float(pr[1]) if pr[1] not in ["true", "false"] else pr[1] == "true"
		elif a.begins_with("--revive="):
			# A boss's phases revive less: --revive=the_throne:don_finleone:0.3
			var pr2: PackedStringArray = a.trim_prefix("--revive=").split(":")
			var ph: Array = Js.list(Js.obj(Rules.data()["raids"][pr2[0]]["enemies"][pr2[1]]).get("phases")).duplicate(true)
			for x: Dictionary in ph:
				x["revivePct"] = float(x["revivePct"]) * float(pr2[2])
			var mods: Dictionary = Js.obj(Battle.cfg().get("enemyMods"))
			var rm: Dictionary = Js.obj(mods.get(pr2[0]))
			var em: Dictionary = Js.obj(rm.get(pr2[1]))
			em["phases"] = ph
			rm[pr2[1]] = em
			mods[pr2[0]] = rm
			Battle.cfg()["enemyMods"] = mods
		elif a.begins_with("--only="):
			only = a.trim_prefix("--only=").split(",")
		else:
			raids.append(a)
	if raids.is_empty():
		raids = ["captain_krust", "cartographer", "the_quartermaster", "the_throne"]
	for rid: String in raids:
		tune(rid)
		print("== %s  (captain strength %.2f)" % [rid, strength])
		for cfg: Array in [[1, "normal"], [2, "normal"], [4, "normal"], [2, "coop"], [4, "coop"], [2, "coopc"], [4, "coopc"]]:
			if not only.is_empty() and not only.has(str(cfg[1])) and not (cfg[1] == "normal" and cfg[0] == 1):
				continue
			var r: Dictionary = rate(rid, cfg[0], cfg[1], runs)
			print("  %d x %-6s  won %3d%%  rounds %5.1f  sunk/run %.2f" % [cfg[0], cfg[1], int(100.0 * float(r["w"])), float(r["rounds"]), float(r["sunk"])])
	quit()
