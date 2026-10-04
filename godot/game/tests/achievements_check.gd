extends SceneTree
## THE BADGES (core/achievements.gd, core/raid_feats.gd): every listed badge
## is in the catalogue, every check runs on a fresh captain without fault and
## grants nothing, a sample of the expedition side is earned off state, and
## the raid feats read off battle events.
##
##   godot --headless --path godot/game -s tests/achievements_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://achievements_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var c: Charter = Charter.found("Badge check", false, "a0", "Captain 0")
	var s: Session = c.session_for("a0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var ids: Array = (Rules.data()["badges"] as Array).map(func(b: Dictionary) -> String: return b["id"])
	for id: String in Achievements.CHECKED + Achievements.EXPEDITION + Achievements.EXP_MOMENTS:
		check(ids.has(id), "%s is in the catalogue" % id)
	var defs: Array = Achievements.defs()
	print("  listed: %d" % defs.size())
	check(defs.size() >= 210, "the badges listed (%d)" % defs.size())
	for id: String in Achievements.EXPEDITION:
		check(not Achievements.earned(id, db, uid), "a fresh captain has not earned %s" % id)
	# A captain some way along.
	var p: Dictionary = db.me(uid)
	p["expedition_xp"] = 1.0e9
	p["trawls_collected"] = 30.0
	p["bounties_claimed"] = 2.0
	p["bounty_boards_cleared"] = 1.0
	p["highest_raid_damage"] = 260.0
	p["ship_tier"] = 6.0
	p["gauntlet_deepest"] = 12.0
	p["owned_crew_skins"] = ["dole_frostbite"]
	db.save["raidClears"] = [{ "raid_id": "corsairs_reckoning", "ms": 80000.0, "at": "2026-10-04T00:00:00.000Z" }]
	db.save["clears"] = ["corsairs_reckoning", "captain_krust_challenge"]
	var got: Array = Achievements.sweep(db, uid)
	for want: String in ["navigator", "master_navigator", "first_haul", "steady_nets", "first_bounty", "full_board", "opening_salvo", "hard_hitter",
			"heavy_broadside", "ship_of_the_line", "into_the_deep", "davy_jones", "first_descent", "colors_raised", "swift_reckoning", "ghost_ship"]:
		check(got.has(want), "earned off state: %s" % want)
	for not_yet: String in ["overkill", "deep_trawler", "abyssward", "quick_draw", "corsairs_bane"]:
		check(not got.has(not_yet), "not yet: %s" % not_yet)
	# The feats.
	var st: Dictionary = RaidFeats.fresh()
	RaidFeats.feed(st, [{ "t": "shot", "seat": 0, "aim": "critical" }, { "t": "eShot", "target": 0, "dmg": 0.0, "dodged": true }], 0, 0)
	RaidFeats.fight_won(st, false)
	RaidFeats.feed(st, [{ "t": "eShot", "target": 1, "dmg": 30.0 }], 0, 1)
	RaidFeats.fight_won(st, true)
	var f: Array = RaidFeats.grant(db, uid, "cartographer_challenge", st)
	check(f.has("dead_reckoning") and f.has("not_a_shot_fired"), "every shot critical, a boss fight without a shot (%s)" % str(f))
	st = RaidFeats.fresh()
	RaidFeats.feed(st, [{ "t": "eShot", "target": 0, "dmg": 12.0 }, { "t": "ability", "seat": 0 }], 0, 0)
	f = RaidFeats.grant(db, uid, "coffers_fleet", st)
	check(not f.has("iron_ruse"), "a hit taken spoils the Ruse")
	f = RaidFeats.grant(db, uid, "the_quartermaster", RaidFeats.fresh())
	check(f.has("tight_quarters"), "no crew order against the Quartermaster")
	print("  achievements check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
