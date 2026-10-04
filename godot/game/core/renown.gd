class_name Renown
extends RefCounted
## RENOWN (Godot port of lib/renown.ts and the allocation in
## lib/core/progress.ts): past level 100 in Fishing or Navigation, XP keeps
## earning Renown levels, each a point to spend on that skill's board. The
## first comes after 50,000 XP, each after 15,000 more, steady at 200,000.
## Points stay where they are put; a respec token clears one board. A token
## costs DOUBLOONS in the port (the web's 2,000 gems x 100). The effects are
## read in Rules.fishing_renown and the battle seat (nav_renown_alloc).

const BASE_COST: float = 50000.0
const COST_STEP: float = 15000.0
const COST_CAP: float = 200000.0
const RESPEC_COST: float = 200000.0

const STATS: Dictionary = {
	"fishing": [
		{ "id": "bounty", "name": "Bounty", "blurb": "When you sell your catch at market.", "unit": "doubloons", "per": 0.015, "kind": "pct", "color": "#f0c040" },
		{ "id": "wisdom", "name": "Wisdom", "blurb": "From every catch you land.", "unit": "Fishing XP", "per": 0.02, "kind": "pct", "color": "#5eead4" },
		{ "id": "patience", "name": "Patience", "blurb": "Fish take the hook sooner (up to 30%).", "unit": "bite speed", "per": 0.004, "kind": "pct", "color": "#60a5fa" },
		{ "id": "providence", "name": "Providence", "blurb": "Supply crates surface more often.", "unit": "more crates", "per": 0.05, "kind": "pct", "color": "#a78bfa" },
	],
	"nav": [
		{ "id": "plunder", "name": "Plunder", "blurb": "From raids and the Gauntlet.", "unit": "doubloons", "per": 0.015, "kind": "pct", "color": "#f0c040" },
		{ "id": "might", "name": "Might", "blurb": "Your broadsides in every raid.", "unit": "raid damage", "per": 0.005, "kind": "pct", "color": "#f87171" },
		{ "id": "bulwark", "name": "Bulwark", "blurb": "Extra hull on your ship.", "unit": "hull", "per": 3.0, "kind": "flat", "color": "#7dd3fc" },
		{ "id": "command", "name": "Command", "blurb": "For your whole crew, every raid.", "unit": "crew XP", "per": 0.02, "kind": "pct", "color": "#4ade80" },
	],
}


static func _ramp() -> int:
	return int(floor((COST_CAP - BASE_COST) / COST_STEP)) + 1


static func cost_of(n: int) -> float:
	return 0.0 if n <= 0 else minf(COST_CAP, BASE_COST + float(n - 1) * COST_STEP)


static func _cum(n: int) -> float:
	if n <= 0:
		return 0.0
	var k: int = mini(n, _ramp())
	var s: float = float(k) * BASE_COST + COST_STEP * float(k * (k - 1)) / 2.0
	if n > _ramp():
		s += float(n - _ramp()) * COST_CAP
	return s


static func _xp_col(skill: String) -> String:
	return "fishing_xp" if skill == "fishing" else "expedition_xp"


static func alloc_col(skill: String) -> String:
	return "fishing_renown_alloc" if skill == "fishing" else "nav_renown_alloc"


static func _max_xp(skill: String) -> float:
	var t: Array = Rules.data()["xpTable"] if skill == "fishing" else Rules.data()["navXpTable"]
	return float(t[mini(Rules.MAX_LEVEL, t.size()) - 1])


static func level(skill: String, xp: float) -> int:
	var over: float = xp - _max_xp(skill)
	if over <= 0.0:
		return 0
	var ramp_total: float = _cum(_ramp())
	if over >= ramp_total:
		return _ramp() + int(floor((over - ramp_total) / COST_CAP))
	var lvl: int = 0
	for k: int in range(1, _ramp() + 1):
		if _cum(k) <= over:
			lvl = k
		else:
			break
	return lvl


## [into, span] toward the next Renown level.
static func progress(skill: String, xp: float) -> Array:
	var over: float = xp - _max_xp(skill)
	if over <= 0.0:
		return [0.0, cost_of(1)]
	var lv: int = level(skill, xp)
	return [over - _cum(lv), cost_of(lv + 1)]


static func spent(skill: String, alloc: Dictionary) -> int:
	var n: int = 0
	for s: Dictionary in STATS[skill]:
		n += int(maxf(0.0, floor(Js.num(alloc.get(s["id"])))))
	return n


static func state(db: CaptainStore, uid: String, skill: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var xp: float = Js.num(p.get(_xp_col(skill)))
	var alloc: Dictionary = Js.obj(p.get(alloc_col(skill)))
	var lv: int = level(skill, xp)
	return {
		"skill": skill, "level": lv, "spent": spent(skill, alloc), "available": maxi(0, lv - spent(skill, alloc)),
		"alloc": alloc, "respecs": int(Js.num(p.get("renown_respecs"))), "progress": progress(skill, xp),
		"reached": xp >= _max_xp(skill),
	}


static func allocate(db: CaptainStore, uid: String, skill: String, stat: String) -> Dictionary:
	if not STATS.has(skill) or not (STATS[skill] as Array).any(func(s: Dictionary) -> bool: return s["id"] == stat):
		return { "error": "Unknown stat." }
	var st: Dictionary = state(db, uid, skill)
	if int(st["available"]) <= 0:
		return { "error": "No Renown points to spend." }
	var next: Dictionary = (st["alloc"] as Dictionary).duplicate()
	next[stat] = maxf(0.0, floor(Js.num(next.get(stat)))) + 1.0
	db.update_profile(uid, { alloc_col(skill): next })
	return state(db, uid, skill)


static func respec(db: CaptainStore, uid: String, skill: String) -> Dictionary:
	var st: Dictionary = state(db, uid, skill)
	if int(st["respecs"]) <= 0:
		return { "error": "No respec tokens. One costs %s ⟡." % Js.thousands(RESPEC_COST) }
	if int(st["spent"]) == 0:
		return { "error": "Nothing to undo on this board yet." }
	db.update_profile(uid, { "renown_respecs": float(int(st["respecs"]) - 1), alloc_col(skill): {} })
	return state(db, uid, skill)


static func buy_respec(db: CaptainStore, uid: String) -> Dictionary:
	if db.deduct_doubloons(uid, RESPEC_COST) == null:
		return { "error": "A respec token costs %s ⟡." % Js.thousands(RESPEC_COST) }
	db.ledger(uid, -RESPEC_COST, "A Renown respec token")
	db.bump_stat(uid, "renown_respecs", 1.0)
	return { "ok": true }


## A stat's total at its points, in words ("+3% doubloons", "+9 hull").
static func total_text(s: Dictionary, points: float) -> String:
	if s["kind"] == "flat":
		return "+%d %s" % [int(points * float(s["per"])), s["unit"]]
	var pct: float = points * float(s["per"]) * 100.0
	if s["id"] == "patience":
		pct = minf(30.0, pct)
	return "+%s%% %s" % [str(snappedf(pct, 0.1)).trim_suffix(".0"), s["unit"]]
