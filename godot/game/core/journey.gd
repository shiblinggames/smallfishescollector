class_name Journey
extends RefCounted
## THE CAPTAIN'S LOG, READ FROM THE SAVE (Godot port of the /achievements
## journey and story recap, lib/core/badgesPage.ts and storyLogData.ts; the AI
## voyage log is left out, Kong 2026-10-05).
##   groups()  every goal the port lists, grouped by pursuit as the web groups
##             them (content/journey.json, tools/export_journey.py), with how
##             far along you are where the save keeps the same count
##   story()   the campaign stops you have cleared, and where the trail goes
##             next (no spoilers)
##   record()  the career numbers the Captain tab prints

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://content/journey.json"))
	return _data


## The save's count behind each of the web's measures, where the port keeps it.
static func _measures(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var n: Callable = func(col: String) -> float: return Js.num(p.get(col))
	var gifts: float = 0.0
	for r: Dictionary in Js.list(db.save.get("rapport")):
		gifts += Js.num(r.get("gifts_given"))
	var landed: int = 0
	var found: Array = Js.list(db.save.get("discoveries"))
	for i: Dictionary in Rules.data()["isles"]:
		if Js.includes(found, i["id"]):
			landed += 1
	return {
		"fishLevel": float(Rules.level_from_xp(n.call("fishing_xp"))),
		"navLevel": float(Loadout.nav_level_from_xp(n.call("expedition_xp"))),
		"streakBest": n.call("highest_perfect_streak"),
		"totalPerfects": n.call("total_perfects"),
		"casts": n.call("fishing_casts"),
		"cratesOpened": n.call("fishing_crates_opened"),
		"doubleCatches": n.call("fishing_double_catches"),
		"trophySizeCatches": n.call("trophy_size_catches"),
		"snags": n.call("fishing_snags"),
		"collectionCount": float(Achievements._species(p)),
		"goldenCount": float(Achievements._goldens(db)),
		"petsOwned": float(Js.list(p.get("unlocked_pets")).size()),
		"doubloons": n.call("doubloons"),
		"fishSold": n.call("fish_sold_doubloons"),
		"dailySweeps": n.call("daily_challenge_sweeps"),
		"masterCleared": n.call("daily_master_cleared"),
		"finnJobs": float(Js.list(p.get("finn_quests_done")).size()),
		"ancientsCaught": float(Js.list(p.get("ancient_catches")).size()),
		"recruits": n.call("lifetime_recruits"),
		"voyagesDone": float(_voyages_done(db)),
		"highestRaidDmg": n.call("highest_raid_damage"),
		"trawlsCollected": n.call("trawls_collected"),
		"gauntletDeepest": n.call("gauntlet_deepest"),
		"gauntletHcDeepest": n.call("gauntlet_hc_deepest"),
		"donsGauntletDeepest": n.call("dons_gauntlet_deepest"),
		"gauntletFathoms": n.call("gauntlet_fathoms"),
		"gauntletFathomsEarned": n.call("gauntlet_fathoms_earned"),
		"parlorBestStreak": n.call("parlor_best_streak"),
		"puzzlePoints": n.call("puzzle_points"),
		"forgeRecipesLearned": float(Js.list(p.get("forge_recipes_learned")).size()),
		"sea.gifts": gifts,
		"sea.isles.length": float(landed),
		"sea.digs": n.call("clues_done"),
	}


static func _voyages_done(db: CaptainStore) -> int:
	return Js.list(db.save.get("voyages")).filter(func(v: Dictionary) -> bool: return v.get("status") == "revealed").size()


## Every group, each goal { id, label, desc, image, difficulty, done, current,
## target } (target 0: a thing done or not). Goals the port does not list are
## left out, and so are groups left empty; where the port words a badge its own
## way the bar is left off, since its target is the port's, not the web's.
static func groups(db: CaptainStore, uid: String) -> Array:
	var defs: Dictionary = {}
	for d: Dictionary in Achievements.defs():
		defs[d["id"]] = d
	var reworded: Dictionary = Js.obj(Achievements._cfg().get("badgeText"))
	var have: Array = Js.list(db.me(uid).get("unlocked_badges"))
	var m: Dictionary = _measures(db, uid)
	var out: Array = []
	for g: Dictionary in data()["groups"]:
		var goals: Array = []
		for goal: Dictionary in g["goals"]:
			var d: Dictionary = defs.get(goal["id"], {})
			if d.is_empty():
				continue
			var done: bool = Js.includes(have, goal["id"])
			var target: float = 0.0
			var current: float = 0.0
			if goal.get("binary") != true and goal.has("target") and m.has(str(goal.get("measure", ""))) and not reworded.has(goal["id"]):
				target = float(goal["target"])
				current = minf(float(m[goal["measure"]]), target)
				# A met bar is met (the web's rule too), whether or not the sweep
				# has stamped the badge yet.
				done = done or current >= target
			goals.append({
				"id": goal["id"], "label": d.get("name", goal["label"]), "desc": str(d.get("description", "")),
				"image": d.get("imageUrl"), "difficulty": str(d.get("difficulty", "")), "points": d.get("points", 0.0),
				"done": done, "current": target if done and target > 0.0 else current, "target": target,
			})
		if not goals.is_empty():
			out.append({ "title": g["title"], "flavor": g["flavor"], "accent": g["accent"], "goals": goals,
				"done": goals.filter(func(x: Dictionary) -> bool: return x["done"]).size() })
	return out


static func _plain(t: String) -> String:
	return t.replace("*", "")


## storyLogData's campaign half: every stop cleared, by kind, with what comes
## next (Finn's half is the Journal's, game/journal.gd).
static func story(db: CaptainStore, uid: String) -> Dictionary:
	var views: Array = Campaign.view(db, uid)["views"]
	var done: Array = []
	var next: Dictionary = {}
	for v: Dictionary in views:
		var nd: Dictionary = v["node"]
		if v["status"] == "cleared":
			var ty: String = str(nd.get("type", ""))
			var kind: String = "combat" if ["skirmish", "raid"].has(ty) else ("milestone" if ty == "milestone" else ("shop" if ty == "berth" else "story"))
			done.append({ "label": nd["label"], "kind": kind, "text": _plain(str(Js.nz(nd.get("bridge"), nd.get("flavor", "")))) })
		elif next.is_empty() and v["status"] == "available":
			next = { "label": nd["label"], "text": _plain(str(nd.get("flavor", ""))) }
	return {
		"done": done, "next": next, "total": views.size(),
	}


## The career, in numbers.
static func record(db: CaptainStore, uid: String) -> Array:
	var p: Dictionary = db.me(uid)
	var n: Callable = func(col: String) -> float: return Js.num(p.get(col))
	var caught: float = 0.0
	var lt: Dictionary = Js.obj(db.save.get("lifetime"))
	for k: Variant in lt:
		caught += Js.num((lt[k] as Dictionary).get("n"))
	var crew: Array = Js.list(db.save.get("crew"))
	var lost: int = crew.filter(func(c: Dictionary) -> bool: return c.get("died_at") != null).size()
	var deepest: float = maxf(n.call("gauntlet_deepest"), n.call("dons_gauntlet_deepest"))
	return [
		["Fish landed", Js.thousands(caught)],
		["Species logged", "%d of %d" % [Achievements._species(p), (db.save["species"] as Array).size()]],
		["Golden fish", Js.thousands(float(Achievements._goldens(db)))],
		["Best perfect streak", Js.thousands(n.call("highest_perfect_streak"))],
		["Perfect catches", Js.thousands(n.call("total_perfects"))],
		["Lines cast", Js.thousands(n.call("fishing_casts"))],
		["Fish sold", "%s ⟡" % Js.thousands(n.call("fish_sold_doubloons"))],
		["Raids won", Js.thousands(float(db.cleared_raid_ids(uid).size()))],
		["Biggest raid hit", Js.thousands(n.call("highest_raid_damage"))],
		["Voyages home", Js.thousands(float(_voyages_done(db)))],
		["Deepest Gauntlet", "depth %d" % int(deepest) if deepest > 0.0 else "not yet"],
		["Crew recruited", Js.thousands(n.call("lifetime_recruits"))],
		["Crew lost", "%d" % lost],
		["Isles landed", Js.thousands(float(_measures(db, uid)["sea.isles.length"]))],
	]
