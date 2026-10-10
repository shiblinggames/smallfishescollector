extends RefCounted
## Part of GauntletTable (game/gauntlet_table.gd): THE END OF A DIVE, banked or
## lost to the deep: each captain's haul into their own save, the co-op
## rewards, the records, and the Fathoms paid when the party sinks. Split out
## of gauntlet_table.gd on 2026-10-10 for size. Every function takes the table
## as `t` and works on its state (t._r); the table forwards to these under
## their old names, and other parts reach each other through those.

static func bank(t: GauntletTable) -> void:
	var run: Dictionary = t._r["run"]
	var cleared: int = int(run["roll"]["cleared"])
	if str(run.get("mode", "solo")) == "coop":
		t._crew_moment("coop_dive", float(cleared + int(run["skip"])))
	var live_offer: Dictionary = Js.obj(Js.obj(run["offer"]).get("live"))
	var offer: Dictionary = live_offer if not live_offer.is_empty() and int(live_offer["depth"]) == cleared else {}
	var pays: Dictionary = {}
	for k: String in t._keys_in():
		var s: Session = t._session(k)
		if s == null:
			continue
		t._lend(s)
		pays[k] = pay(t, k, s, cleared, offer)
		t._take(s)
	t._r["pays"] = pays
	t._r["result"] = "banked"
	t._held_clear()
	t._settle()
	t._enter("haul")


## One captain's haul into their own save, and their records.
static func pay(t: GauntletTable, key: String, s: Session, cleared: int, offer: Dictionary) -> Dictionary:
	var run: Dictionary = t._r["run"]
	var v: String = str(run["variant"])
	var c: Dictionary = t._r["caps"][key]
	var p: Dictionary = s.profile()
	var cd: int = cleared + int(run["skip"])
	var ren: Dictionary = Js.obj(p.get("nav_renown_alloc"))
	var mults: Dictionary = {
		"shipClass": float(Campaign.class_effects(p.get("ship_classes"))["doubloonMult"]),
		"renown": 1.0 + maxf(0.0, floor(Js.num(ren.get("plunder")))) * 0.015,
		"haul": Gauntlet.haul_mult(c["ups"]), "xp": Gauntlet.xp_mult(c["ups"]), "fathoms": Gauntlet.fathoms_mult(c["ups"]),
		"crewXp": 1.0 + maxf(0.0, floor(Js.num(ren.get("command")))) * 0.02,
		"fortune": t._fortune(key),
	}
	var h: Dictionary = Gauntlet.haul(cleared, cd, v, float(run["pot"]), false, 0.0, Js.list(p.get("owned_ship_skins")), mults, offer, float(c["fenceSpent"]))
	var db: CaptainStore = s.store
	if str(run.get("mode", "solo")) == "coop":
		coop_rewards(t, key, s, h, cd)
	if float(h["doubloons"]) > 0.0:
		db.bump_stat(s.uid, "doubloons", float(h["doubloons"]))
		db.ledger(s.uid, float(h["doubloons"]), "%s: banked at depth %d" % [Gauntlet.NAMES[v], cd])
		if t.charter != null:
			t.charter._note(s.captain_name(), float(h["doubloons"]), "%s: banked at depth %d" % [Gauntlet.NAMES[v], cd])
	db.bump_stat(s.uid, "expedition_xp", float(h["navXp"]))
	db.bump_stat(s.uid, "gauntlet_fathoms", float(h["fathoms"]))
	db.bump_stat(s.uid, "gauntlet_fathoms_earned", float(h["fathoms"]))
	if not h["items"].is_empty():
		var held: Array = Js.list(p.get("raid_items")).duplicate()
		held += h["items"]
		db.update_profile(s.uid, { "raid_items": held })
	for sk: Variant in h["skins"]:
		db.add_to_list(s.uid, "owned_ship_skins", sk)
	# Crew XP to every hand seated for raids.
	var crew_up: Array = []
	for cr: Dictionary in Crew.live(db):
		if cr.get("raid_slot") != null and float(h["crewXp"]) > 0.0:
			var old: float = Js.num(cr.get("xp"))
			cr["xp"] = old + float(h["crewXp"])
			crew_up.append({ "name": cr.get("nickname") if cr.get("nickname") != null else Crew.display_name(str(Crew.card(float(cr["card_id"])).get("slug", "")), str(Crew.card(float(cr["card_id"])).get("name", ""))), "from": float(Crew.level(old)), "to": float(Crew.level(old + float(h["crewXp"]))) })
	h["crewUp"] = crew_up
	h["record"] = record(t, key, s, cd, true)
	return h


## A co-op bank's own: the Fleet Chest (every captain afloat past the first
## lifts everyone's doubloons) and skin vouchers by depth (port rules
## battle.gauntlet.vouchers; a full crew of four deep enough rolls twice;
## crew Fortune lifts the odds as it lifts the chase).
static func coop_rewards(t: GauntletTable, key: String, s: Session, h: Dictionary, cd: int) -> void:
	var pc: Dictionary = Gauntlet.coop_cfg()
	var afloat: int = t._keys_in().size()
	var fleet: float = 1.0 + float(pc.get("fleetPerCaptain", 0.05)) * maxi(0, afloat - 1)
	h["fleet"] = fleet
	h["doubloons"] = float(Js.round(float(h["doubloons"]) * fleet))
	var rolls: int = 2 if afloat >= 4 and cd >= int(pc.get("fullCrewDepth", 20)) else 1
	var got: Array = []
	for kind: String in ["bosun", "captain"]:
		var chance: float = 0.0
		for st: Variant in Js.list(Js.obj(pc.get("vouchers")).get(kind)):
			if cd >= int(st[0]):
				chance = float(st[1])
		chance = minf(0.25, chance * t._fortune(key))
		for k: int in rolls:
			if chance > 0.0 and Dice.next() < chance:
				Skins.grant(s.store, s.uid, kind)
				got.append(kind)
	h["vouchers"] = got


## A record for this captain: the deepest, the last run, the deepest run's
## recap, kept twice: across both modes (the Locker reads it) and for this
## mode (gauntlet_solo_* / gauntlet_coop_*, dons_gauntlet_* for the Don's);
## the dives banked and sunk, the biggest hit. Returns whether it went deeper
## than ever in this mode.
static func record(t: GauntletTable, key: String, s: Session, cd: int, banked: bool) -> bool:
	var run: Dictionary = t._r["run"]
	var v: String = str(run["variant"])
	var base: String = "dons_gauntlet_" if v == "don" else "gauntlet_"
	var p: Dictionary = s.profile()
	var c: Dictionary = t._r["caps"][key]
	var names: Array = []
	for k: String in Js.obj(run.get("names")):
		if k != key:
			names.append(run["names"][k])
	var snap: Dictionary = {
		"depth": float(cd), "boons": c["boons"], "taken": c["taken"], "takenCv": c["takenCv"], "marks": c["marks"],
		"curses": run["curses"], "stats": c["stats"], "crew": names, "mode": run.get("mode", "solo"),
		"banked": banked, "pot": run["pot"], "at": Js.iso(Clock.now_ms()), "ms": float(Time.get_ticks_msec() - t._began_ms),
	}
	var patch: Dictionary = {}
	var deeper: bool = false
	for pre: String in [base, base + str(run.get("mode", "solo")) + "_"]:
		patch[pre + "last_run"] = snap
		patch[pre + ("runs_completed" if banked else "runs_sunk")] = Js.num(p.get(pre + ("runs_completed" if banked else "runs_sunk"))) + 1.0
		if banked:
			if float(cd) > Js.num(p.get(pre + "deepest")) or (float(cd) == Js.num(p.get(pre + "deepest")) and float(snap["ms"]) < Js.num(p.get(pre + "best_depth_ms", 1e18))):
				deeper = deeper or float(cd) > Js.num(p.get(pre + "deepest"))
				patch[pre + "deepest"] = float(cd)
				patch[pre + "deepest_run"] = snap
				patch[pre + "best_depth"] = float(cd)
				patch[pre + "best_depth_ms"] = snap["ms"]
				patch[pre + "best_depth_at"] = snap["at"]
		elif float(cd) > Js.num(p.get(pre + "deepest_died")):
			patch[pre + "deepest_died"] = float(cd)
	# A crew's own record: these captains together, in this descent.
	if str(run.get("mode", "solo")) == "coop" and banked:
		var ks: Array = Js.obj(run.get("names")).keys()
		ks.sort()
		var ck: String = v + ":" + ",".join(PackedStringArray(ks))
		var crews: Dictionary = Js.obj(p.get("gauntlet_crews")).duplicate(true)
		var cr: Dictionary = Js.obj(crews.get(ck))
		if float(cd) > Js.num(cr.get("deepest")) or (float(cd) == Js.num(cr.get("deepest")) and float(snap["ms"]) < Js.num(cr.get("ms", 1e18))):
			crews[ck] = { "variant": v, "names": Js.obj(run.get("names")).values(), "deepest": float(cd), "ms": snap["ms"], "at": snap["at"] }
			patch["gauntlet_crews"] = crews
	if Js.num(c["stats"].get("highestHit")) > Js.num(p.get("gauntlet_max_hit")):
		patch["gauntlet_max_hit"] = c["stats"]["highestHit"]
	s.store.update_profile(s.uid, patch)
	# The Don's feats, on a banked run (the web's donFeats).
	if v == "don" and banked:
		var feats: Array = []
		var shots: float = Js.num(c["stats"].get("shots"))
		if cd >= 10 and shots >= 1.0 and shots == Js.num(c["stats"].get("megas")):
			feats.append("ultimate_only")
		if cd >= 30 and Js.obj(run.get("curses")).size() >= 5:
			feats.append("weight_of_green")
		if cd >= 5 and Js.num(c["stats"].get("dmgTaken")) == 0.0:
			feats.append("untouched")
		for f: String in feats:
			if not Js.list(s.profile().get("unlocked_badges")).has(f):
				s.store.grant_badge(s.uid, f)
				s.store.save["badges_new"] = Js.list(s.store.save.get("badges_new")) + [f]
	# The bounty board's moments: Davy Jones' depth reached and biggest hit.
	if v != "don":
		Bounties.log_event(s.store, s.uid, "gauntlet_depth", float(cd))
		if Js.num(c["stats"].get("highestHit")) > 0.0:
			Bounties.log_event(s.store, s.uid, "gauntlet_hit", Js.num(c["stats"].get("highestHit")))
	return deeper


## The whole party sunk: the pot goes to the deep; Fathoms are paid.
static func dive_lost(t: GauntletTable, ev: Array) -> void:
	var run: Dictionary = t._r["run"]
	var cd: int = int(run["roll"]["cleared"]) + int(run["skip"])
	var pays: Dictionary = Js.obj(t._r.get("pays"))
	for k: String in t._keys_in():
		var c: Dictionary = t._r["caps"][k]
		var s: Session = t._session(k)
		if s == null:
			continue
		t._lend(s)
		pays[k] = death_pay(t, k, s, cd)
		t._take(s)
		c["out"] = "sunk"
		if t.charter != null:
			t.charter.spend_life(k, "Sunk in %s at depth %d" % ["the Don's Gauntlet" if str(run["variant"]) == "don" else "Davy's Gauntlet", cd])
	t._r["pays"] = pays
	t._r["result"] = "lost"
	t._r["lostPot"] = run["pot"]
	t._held_clear()
	t._settle()
	t._step("dead", ev)


static func death_pay(t: GauntletTable, key: String, s: Session, cd: int) -> Dictionary:
	var run: Dictionary = t._r["run"]
	var c: Dictionary = t._r["caps"][key]
	var cleared: int = int(run["roll"]["cleared"])
	var f: float = Gauntlet.run_fathoms(cleared, str(run["variant"]), Gauntlet.fathoms_mult(c["ups"]), {}, float(c["fenceSpent"]))
	s.store.bump_stat(s.uid, "gauntlet_fathoms", f)
	s.store.bump_stat(s.uid, "gauntlet_fathoms_earned", f)
	record(t, key, s, cd, false)
	return { "fathoms": f, "depth": float(cd) }
