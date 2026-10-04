extends SceneTree
## THE FORGE AND THE ACCELERATOR'S RULES (core/forge.gd): locked without the
## Locker's unlocks, a recipe learned once for Fathoms, a fusion taking ONE
## copy of each part, a spent part coming off the mounts, the Abyssal tier
## behind the Don's forge, and the Accelerator charged in doubloons.
##
##   godot --headless --path godot/game -s tests/forge_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://forge_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var now: Array = [1790000000000.0]
	Clock.install(func() -> float: return now[0])
	var c: Charter = Charter.found("Forge check", false, "f0", "Captain 0")
	var s: Session = c.session_for("f0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var p: Dictionary = db.me(uid)
	p["gauntlet_fathoms"] = 1000.0
	p["doubloons"] = 50000.0
	p["raid_items"] = ["gunners_sight", "reinforced_hull", "reinforced_hull", "war_drum"]
	p["equipped_raid_items"] = ["gunners_sight"]
	check(Forge.learn(db, uid, "heavy_gunners_sight").has("error"), "locked without the Forge")
	p["gauntlet_upgrades"] = ["forge"]
	check(Forge.forge(db, uid, "heavy_gunners_sight").has("error"), "not before it is learned")
	check(Forge.learn(db, uid, "heavy_gunners_sight").get("ok", false) and Js.num(db.me(uid).get("gauntlet_fathoms")) == 850.0, "learned for 150 Fathoms")
	check(Forge.learn(db, uid, "heavy_gunners_sight").has("error"), "learned once")
	var r: Dictionary = Forge.forge(db, uid, "heavy_gunners_sight")
	check(r.get("ok", false), "forged (%s)" % str(r))
	var held: Dictionary = Forge.counts(Js.list(db.me(uid).get("raid_items")))
	check(held.get("heavy_gunners_sight", 0) == 1 and held.get("reinforced_hull", 0) == 1 and not held.has("gunners_sight"), "one copy of each part taken (%s)" % str(held))
	check(not Js.list(db.me(uid).get("equipped_raid_items")).has("gunners_sight"), "a spent part comes off the mounts")
	check(Forge.forge(db, uid, "heavy_gunners_sight").has("error"), "not without the parts")
	check(Forge.learn(db, uid, "leviathans_cannon").has("error"), "the Abyssal tier behind the Don's forge")
	# The Accelerator.
	check(Forge.start_accel(db, uid, "war_drum").has("error"), "the Accelerator locked")
	p["dons_gauntlet_upgrades"] = ["dg_abyssal_forge", "dg_abyssal_accel"]
	r = Forge.start_accel(db, uid, "war_drum")
	check(r.get("ok", false) and Js.num(db.me(uid).get("doubloons")) == 40000.0, "charged for 10,000 doubloons (%s)" % str(r))
	check(Forge.start_accel(db, uid, "war_drum").has("error"), "one slot")
	check(Forge.claim_accel(db, uid).has("error"), "still transmuting")
	now[0] += Forge.ACCEL_MS
	r = Forge.claim_accel(db, uid)
	check(r.get("ok", false) and Js.list(db.me(uid).get("raid_items")).has("thunder_drum") and not Js.list(db.me(uid).get("raid_items")).has("war_drum"), "the legendary out, the epic gone")
	Clock.install(Callable())
	print("  forge check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
