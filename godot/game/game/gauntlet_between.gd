extends RefCounted
## Part of GauntletTable (game/gauntlet_table.gd): BETWEEN FIGHTS, the stops
## the chain after a kill may make: the curse (borne by the party, a Salt Ward
## reroll), the Drowned Shrine, the Fence, the Don's jobs (the party's vote on
## the stake, and the verdict) and the Don's fall and his Marks. Split out of
## gauntlet_table.gd on 2026-10-10 for size. Every function takes the table
## as `t` and works on its state (t._r); the table forwards to these under
## their old names, and other parts reach each other through those.

# ── The curse ─────────────────────────────────────────────────────────────────

static func bear(t: GauntletTable, key: String) -> Dictionary:
	if t._r["phase"] != "curse":
		return { "ok": true }
	t._r["curse"]["acks"][key] = true
	for k: String in t._keys_in():
		if not t._r["curse"]["acks"].has(k):
			t._push()
			return { "ok": true }
	# Everyone has borne it: it lands on the party.
	var run: Dictionary = t._r["run"]
	var c: Dictionary = t._r["curse"]["offer"]
	run["curses"][c["id"]] = c["tier"]
	# Dead Hands: each captain loses that many crew orders for the run.
	var want: int = Gauntlet.curse_silence(run["curses"])
	for s: Dictionary in t._r["b"]["seats"]:
		var cp: Dictionary = Js.obj(t._r["caps"].get(s["key"]))
		if cp.is_empty():
			continue
		var sil: Array = cp["silenced"]
		var pool: Array = (s["crew"] as Array).map(func(x: Dictionary) -> Variant: return x["id"]).filter(func(id: Variant) -> bool: return not sil.has(id))
		while sil.size() < want and not pool.is_empty():
			var id: Variant = pool.pop_at(int(floor(Dice.next() * pool.size())))
			sil.append(id)
			if not (s["used"] as Array).has(id):
				(s["used"] as Array).append(id)
	t._r.erase("curse")
	t._chain()
	return { "ok": true }


## A Salt Ward reroll: the curse drawn again (never the same one twice).
static func recurse(t: GauntletTable, key: String) -> Dictionary:
	if t._r["phase"] != "curse":
		return { "error": "Not now." }
	var cp: Dictionary = Js.obj(t._r["caps"].get(key))
	var used: int = int(Js.num(t._r["curse"]["rerolls"].get(key)))
	if used >= Gauntlet.curse_rerolls(Js.list(cp.get("ups"))):
		return { "error": "No curse rerolls left." }
	t._r["curse"]["rerolls"][key] = float(used + 1)
	var run: Dictionary = t._r["run"]
	var nd: int = int(run["roll"]["cleared"]) + 1 + int(run["skip"])
	var old: Dictionary = t._r["curse"]["offer"]
	var nx: Dictionary = {}
	for g: int in 6:
		nx = Gauntlet.draw_curse(run["curses"], nd, run["tm"]["curseStartsAtWorst"], str(run["variant"]))
		if nx.is_empty() or nx["id"] != old["id"] or nx["tier"] != old["tier"]:
			break
	if not nx.is_empty():
		t._r["curse"]["offer"] = nx
	t._r["curse"]["acks"] = {}
	t._push()
	return { "ok": true }


# ── The Drowned Shrine (each captain their own choice) ────────────────────────

## { choice: "coin" (stake) | "blood" | "walk" }.
static func shrine(t: GauntletTable, key: String, p: Dictionary) -> Dictionary:
	if t._r["phase"] != "shrine":
		return { "error": "Not now." }
	var sh: Dictionary = t._r["shrine"]
	if sh["picks"].has(key):
		return { "error": "You have made your offering." }
	var si: int = t._seat_of(key)
	var s: Dictionary = t._r["b"]["seats"][si]
	var run: Dictionary = t._r["run"]
	var out: Dictionary = { "choice": str(p.get("choice", "walk")) }
	match out["choice"]:
		"coin":
			var ss: Session = t._session(key)
			t._lend(ss)
			var bank: float = Js.num(ss.profile().get("gauntlet_fathoms"))
			var stake: float = minf(minf(maxf(1.0, floor(Js.num(p.get("stake")))), float(Gauntlet.SHRINE_WAGER_CAP)), bank)
			if stake <= 0.0:
				t._take(ss)
				return { "error": "No Fathoms banked to stake." }
			var won: bool = Dice.next() < 0.5
			ss.store.bump_stat(ss.uid, "gauntlet_fathoms", stake if won else -stake)
			t._take(ss)
			out["stake"] = stake
			out["won"] = won
		"blood":
			var lose: float = float(s["hp"]) - 1.0 if run["tm"]["bloodPriceToOne"] else maxf(1.0, float(Js.round(float(s["hp"]) * 0.5)))
			s["hp"] = maxf(1.0, float(s["hp"]) - lose)
			out["lost"] = lose
		_:
			var h: float = float(Js.round(float(s["max"]) * 0.05))
			s["hp"] = minf(float(s["max"]), float(s["hp"]) + h)
			out["heal"] = h
	sh["picks"][key] = out
	t._push()
	shrine_check(t)
	return { "ok": true }


static func shrine_check(t: GauntletTable) -> void:
	var sh: Dictionary = t._r["shrine"]
	# Blood Price: each paid draft dealt in turn, one captain at a time.
	for k: String in t._keys_in():
		if not sh["picks"].has(k):
			return
	for k2: String in t._keys_in():
		if str(sh["picks"][k2]["choice"]) == "blood" and not sh["drafts"].has(k2):
			sh["drafts"][k2] = true
			var nd: int = int(t._r["run"]["roll"]["cleared"]) + 1 + int(t._r["run"]["skip"])
			if t._open_draft(k2, nd):
				t._r["draft"]["back"] = "shrine"
				t._push()
				return
	t._r["lastShrine"] = sh
	t._r.erase("shrine")
	t._breather()


# ── The Fence (Don's; each captain their own stall, paid from this dive) ─────

static func fence(t: GauntletTable, key: String, item: String) -> Dictionary:
	if t._r["phase"] != "fence":
		return { "error": "Not now." }
	var st: Dictionary = Js.obj(t._r["fence"]["stalls"].get(key))
	if st.is_empty() or not Js.list(st["items"]).has(item) or Js.list(st["sold"]).has(item):
		return { "error": "Not for sale." }
	var price: float = float(Js.obj(Js.obj(Gauntlet.t().get("merchant")).get(item)).get("price", 0.0))
	var c: Dictionary = t._r["caps"][key]
	var run: Dictionary = t._r["run"]
	var spendable: float = Gauntlet.fathoms_for_depth(int(run["roll"]["cleared"]), "don") - float(c["fenceSpent"])
	if spendable < price:
		return { "error": "Earn %d more Fathoms this dive." % int(price - spendable) }
	c["fenceSpent"] = float(c["fenceSpent"]) + price
	(st["sold"] as Array).append(item)
	var si: int = t._seat_of(key)
	var s: Dictionary = t._r["b"]["seats"][si]
	match item:
		"heal":
			s["hp"] = minf(float(s["max"]), float(s["hp"]) + float(Js.round(float(s["max"]) * 0.35 * float(run["tm"]["healMult"]))))
		"cleanse":
			st["shed"] = t._shed_curse()
		"charges":
			s["carry"] = float(3 + (1 if Armory.has_rack(t._session(key).profile()) else 0))
		"crew":
			s["used"] = Js.list(c["silenced"]).duplicate()
		"boon":
			t._r["fence"]["done"][key] = true
			t._r["fence"]["drafts"][key] = true
	t._push()
	fence_check(t)
	return { "ok": true }


static func done(t: GauntletTable, key: String) -> Dictionary:
	if t._r["phase"] == "fence":
		t._r["fence"]["done"][key] = true
		t._push()
		fence_check(t)
	return { "ok": true }


static func fence_check(t: GauntletTable) -> void:
	var fe: Dictionary = t._r["fence"]
	for k: String in t._keys_in():
		if not fe["done"].has(k):
			return
	for k2: String in t._keys_in():
		if fe["drafts"].get(k2, false) == true:
			fe["drafts"][k2] = "dealt"
			var nd: int = int(t._r["run"]["roll"]["cleared"]) + 1 + int(t._r["run"]["skip"])
			if t._open_draft(k2, nd):
				t._r["draft"]["back"] = "fence"
				t._push()
				return
	t._r.erase("fence")
	t._breather()


# ── The Don's jobs (a party vote on the stake) ────────────────────────────────

static func contract_vote(t: GauntletTable, key: String, stake: int) -> Dictionary:
	if t._r["phase"] != "contract":
		return { "error": "Not now." }
	t._r["job"]["votes"][key] = float(clampi(stake, 0, 3))
	contract_check(t)
	return { "ok": true }


## The stake settles once every captain still in has voted.
static func contract_check(t: GauntletTable) -> void:
	for k: String in t._keys_in():
		if not t._r["job"]["votes"].has(k):
			t._push()
			return
	var tally: Dictionary = {}
	for k2: String in t._r["job"]["votes"]:
		var v: int = int(t._r["job"]["votes"][k2])
		tally[v] = int(tally.get(v, 0)) + 1
	var best: int = 0
	var most: int = -1
	for v2: Variant in tally:
		if int(tally[v2]) > most:
			most = int(tally[v2])
			best = int(v2)
	# A tie walks away (no one is talked into a job).
	var tied: bool = tally.values().filter(func(n: Variant) -> bool: return int(n) == most).size() > 1
	if tied:
		best = 0
	if best > 0:
		t._r["run"]["contract"] = t._r["job"]["offers"][best - 1]
	t._r["jobTaken"] = best
	t._descend()


static func job_land(t: GauntletTable, jr: Dictionary) -> void:
	var run: Dictionary = t._r["run"]
	var job: Dictionary = jr["job"]
	var ev: Dictionary = { "met": jr["met"], "job": job }
	var curse_next: bool = false
	var draft_next: bool = false
	var hit: Dictionary = job["reward"] if jr["met"] else job["penalty"]
	match str(hit["kind"]):
		"plunder":
			run["pot"] = float(run["pot"]) + float(hit["n"])
		"plunderLose":
			run["pot"] = maxf(0.0, float(run["pot"]) - float(hit["n"]))
		"hullBoost", "hullCut":
			for k: String in t._keys_in():
				var c: Dictionary = t._r["caps"][k]
				c["hullMult"] = float(c["hullMult"]) * (1.0 + float(hit["pct"]) if hit["kind"] == "hullBoost" else 1.0 - float(hit["pct"]))
			t._effects_onto(t._r["b"]["seats"])
		"fullHeal":
			for s: Dictionary in Battle.alive(t._r["b"]):
				s["hp"] = float(s["max"])
		"hpLossPct":
			for s2: Dictionary in Battle.alive(t._r["b"]):
				s2["hp"] = maxf(1.0, float(s2["hp"]) - float(Js.round(float(s2["hp"]) * float(hit["pct"]))))
		"curse":
			curse_next = true
		"boonDraft":
			draft_next = true
	t._r["jobResult"] = ev
	run["jobNext"] = "curse" if curse_next else ("draft" if draft_next else "")
	t._enter("jobResult")


# ── The Don's fall and his Marks ──────────────────────────────────────────────

static func mark(t: GauntletTable, key: String, kind: String) -> Dictionary:
	if t._r["phase"] != "marks" or not ["shark", "whale"].has(kind):
		return { "error": "Not now." }
	var mk: Dictionary = t._r["marks"]
	if mk["picks"].has(key):
		return { "ok": true }
	var o: Dictionary = Js.obj(mk["offers"].get(key))
	(t._r["caps"][key]["marks"] as Array).append({ "type": kind, "buffs": o.get(kind, []) })
	mk["picks"][key] = kind
	marks_check(t)
	return { "ok": true }


static func marks_check(t: GauntletTable) -> void:
	var mk: Dictionary = t._r["marks"]
	for k: String in t._keys_in():
		if not mk["picks"].has(k):
			t._push()
			return
	t._effects_onto(t._r["b"]["seats"])
	t._r.erase("donFall")
	t._r.erase("marks")
	t._chain()
