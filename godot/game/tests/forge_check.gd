extends SceneTree
## THE FORGE (core/forge.gd, the port's redesign): locked without the Locker,
## recipes found by trying pairs (a miss remembered), forging a found recipe
## for one copy of each part, notes for Fathoms, tempering (a spare copy and
## scrap, a tenth of the bonus a grade, shared by every copy, into the battle),
## salvage (never the last mounted copy), transmuting two epics and scrap.
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
	var c: Charter = Charter.found("Forge check", false, "f0", "Captain 0")
	var s: Session = c.session_for("f0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var p: Dictionary = db.me(uid)
	p["gauntlet_fathoms"] = 1000.0
	p["raid_items"] = ["gunners_sight", "reinforced_hull", "reinforced_hull", "war_drum", "war_drum", "corsair_prime_cannon", "corsair_prime_cannon"]
	p["equipped_raid_items"] = ["gunners_sight", "corsair_prime_cannon"]
	check(Forge.try_pair(db, uid, "gunners_sight", "reinforced_hull").has("error"), "the anvil cold without the Forge")
	p["gauntlet_upgrades"] = ["forge"]
	check(Forge.forge(db, uid, "heavy_gunners_sight").has("error"), "not before the recipe is found")
	var r: Dictionary = Forge.try_pair(db, uid, "reinforced_hull", "gunners_sight")
	check(r.get("fused", false) and r["result"] == "heavy_gunners_sight" and r["discovered"], "a pair found, either way round (%s)" % str(r))
	check(Js.list(db.me(uid).get("forge_recipes_learned")).has("heavy_gunners_sight") and Js.num(db.me(uid).get("gauntlet_fathoms")) == 1000.0, "into the book, no toll")
	r = Forge.try_pair(db, uid, "war_drum", "gunners_sight")
	check(not r.get("fused", true) and Js.list(db.me(uid).get("forge_tried")).has(Forge.pair_key("war_drum", "gunners_sight")), "a miss remembered")
	r = Forge.forge(db, uid, "heavy_gunners_sight")
	check(r.get("ok", false), "forged (%s)" % str(r))
	var held: Dictionary = Forge.counts(Js.list(db.me(uid).get("raid_items")))
	check(held.get("heavy_gunners_sight", 0) == 1 and held.get("reinforced_hull", 0) == 1 and not held.has("gunners_sight"), "one copy of each part")
	check(not Js.list(db.me(uid).get("equipped_raid_items")).has("gunners_sight"), "a spent part off its mount")
	# A note.
	r = Forge.buy_note(db, uid)
	check(r.get("ok", false) and Js.num(db.me(uid).get("gauntlet_fathoms")) == 940.0 and Js.obj(db.me(uid).get("forge_notes")).has(r["result"]), "a note for 60 Fathoms (%s)" % str(r))
	# Salvage and temper.
	check(Forge.salvage(db, uid, "heavy_gunners_sight").get("ok", false) and Js.num(db.me(uid).get("forge_scrap")) == 25.0, "a legendary salvaged for 25 scrap")
	db.update_profile(uid, { "forge_scrap": 100.0 })
	check(Forge.salvage(db, uid, "corsair_prime_cannon").get("ok", false), "a spare mounted copy can go")
	check(Forge.salvage(db, uid, "corsair_prime_cannon").has("error"), "never the last mounted copy")
	db.update_profile(uid, { "raid_items": Js.list(db.me(uid).get("raid_items")) + ["corsair_prime_cannon"] })
	r = Forge.temper(db, uid, "corsair_prime_cannon")
	check(r.get("ok", false) and Forge.grade_of(db.me(uid), "corsair_prime_cannon") == 1 and Js.num(db.me(uid).get("forge_scrap")) == 115.0, "tempered to +1 for a copy and 10 scrap (100 + 25 salvaged - 10) (%s)" % str(r))
	check(Forge.temper(db, uid, "corsair_prime_cannon").has("error"), "no spare copy, no tempering")
	var base: Array = Armory.effects_of("corsair_prime_cannon")
	var t1: Array = Forge.tempered_effects(base, 1)
	for k: int in base.size():
		var bv: float = float(base[k]["value"])
		var tv: float = float(t1[k]["value"])
		if str(base[k]["type"]).ends_with("_mult") and bv > 1.0:
			check(is_equal_approx(tv, 1.0 + (bv - 1.0) * 1.1), "a multiplier's bonus up a tenth (%s %s)" % [bv, tv])
	check(Forge.tempered_effects([{ "type": "lethal_save", "value": 1.0 }], 3)[0]["value"] == 1.0, "an on/off effect untouched")
	check(is_equal_approx(float(Forge.tempered_effects([{ "type": "noncrit_damage_mult", "value": 0.85 }], 3)[0]["value"]), 0.85), "a cost untouched")
	check(float(Forge.tempered_effects([{ "type": "start_charge_chance", "value": 1.0 }], 2)[0]["value"]) == 1.0, "a chance never past 1")
	var seat: Dictionary = Battle.seat_for(db, uid)
	check(Js.obj(seat.get("grades")).get("corsair_prime_cannon") == 1.0, "the grade rides into battle")
	# Transmuting.
	check(Forge.try_pair(db, uid, "war_drum", "war_drum").get("kind") == "transmute_locked", "transmuting locked without the Accelerator")
	p = db.me(uid)
	p["dons_gauntlet_upgrades"] = ["dg_abyssal_forge", "dg_abyssal_accel"]
	check(Forge.try_pair(db, uid, "war_drum", "war_drum").get("kind") == "transmute", "two drums on the anvil")
	r = Forge.transmute(db, uid, "war_drum")
	held = Forge.counts(Js.list(db.me(uid).get("raid_items")))
	check(r.get("ok", false) and held.get("thunder_drum", 0) == 1 and not held.has("war_drum") and Js.num(db.me(uid).get("forge_scrap")) == 90.0, "two war drums and 25 scrap made a Thunder Drum (%s)" % str(r))
	print("  forge check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
