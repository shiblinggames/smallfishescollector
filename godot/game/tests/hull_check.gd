extends SceneTree
## THE HULL LADDER (core/hulls.gd): bought a rung at a time from the Sloop,
## each behind its Navigation level and its price; her name; paint worn on the
## Man-o-War only.
##
##   godot --headless --path godot/game -s tests/hull_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://hull_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var c: Charter = Charter.found("Hull check", false, "h0", "Captain 0")
	var s: Session = c.session_for("h0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var p: Dictionary = db.me(uid)
	p["doubloons"] = 1000000.0
	p["expedition_xp"] = 0.0
	p["ship_tier"] = 2.0
	check(Hulls.next_hull(p)["name"] == "Schooner", "the Sloop's next rung is the Schooner")
	var r: Dictionary = Hulls.buy(db, uid)
	check(r.has("error") and str(r["error"]).contains("Navigation 10"), "Navigation 10 gates it (%s)" % str(r))
	check(Js.num(db.me(uid).get("doubloons")) == 1000000.0, "a refused buy takes nothing")
	p["expedition_xp"] = 50000000.0
	r = Hulls.buy(db, uid)
	check(r.get("ok", false) and int(db.me(uid)["ship_tier"]) == 3, "the Schooner bought (%s)" % str(r))
	check(Js.num(db.me(uid).get("doubloons")) == 995000.0, "5,000 spent")
	for k: int in 3:
		Hulls.buy(db, uid)
	p = db.me(uid)
	check(Hulls.tier_of(p) == 6, "up to the Man-o-War, in order")
	check(Js.num(p.get("doubloons")) == 1000000.0 - 5000.0 - 22000.0 - 80000.0 - 200000.0, "every rung paid")
	check(Hulls.buy(db, uid).has("error"), "nothing past the Man-o-War")
	check(Hulls.rename(db, uid, "  The Salt Widow  ").get("ok", false) and db.me(uid)["ship_name"] == "The Salt Widow", "renamed, trimmed")
	check(Hulls.rename(db, uid, "   ").has("error"), "an empty name refused")
	p["owned_ship_skins"] = ["finndicate_hull"]
	check(Hulls.equip_skin(db, uid, "finndicate_hull").get("ok", false), "an owned paint worn on the Man-o-War")
	check(Hulls.equip_skin(db, uid, "nope").has("error"), "a paint not owned cannot be")
	check(North.ship_art(6, "finndicate_hull")["art"] != North.ship_art(6, null)["art"], "the paint shows at tier 6")
	check(North.ship_art(5, "finndicate_hull")["art"] == North.ship_art(5, null)["art"], "and not below it")
	p["ship_tier"] = 5.0
	check(Hulls.equip_skin(db, uid, "finndicate_hull").has("error"), "no paint below the Man-o-War")
	check(Hulls.equip_skin(db, uid, null).get("ok", false), "the plain hull always")
	p["ship_tier"] = 2.0
	p["doubloons"] = 10.0
	check(Hulls.buy(db, uid).has("error"), "not enough doubloons")
	# THE REFIT: after the Throne, all picks at once, in order; first free.
	# (The class ids are the reworked Captain's Choice's, core/captain_class.gd.)
	p["doubloons"] = 1500000.0
	p["ship_classes"] = { "thread": "master_gunner", "sunken_hand": "master_gunner_ii_a", "the_coffers": "master_gunner_iii_a" }
	var walk: Dictionary = { "thread": "helmsman", "sunken_hand": "helmsman_ii_a", "the_coffers": "helmsman_iii_a" }
	check(Campaign.refit_classes(db, uid, walk).has("error"), "not before the Throne")
	db.save["clears"].append("the_throne")
	check(Campaign.refit_classes(db, uid, { "thread": "helmsman_ii_a", "sunken_hand": "helmsman", "the_coffers": "helmsman_iii_a" }).has("error"), "a Mark II before its Mark I refused")
	check(Campaign.refit_classes(db, uid, { "thread": "helmsman" }).has("error"), "every chapter re-walked")
	check(Campaign.refit_classes(db, uid, walk).get("ok", false) and Js.obj(db.me(uid)["ship_classes"])["the_coffers"] == "helmsman_iii_a", "re-cut to a Mark III line")
	check(Js.num(db.me(uid).get("doubloons")) == 1500000.0, "the first refit free")
	check(Campaign.refit_classes(db, uid, { "thread": "ironside", "sunken_hand": "ironside_ii_b", "the_coffers": "ironside_iii_a" }).get("ok", false), "a second refit")
	check(Js.num(db.me(uid).get("doubloons")) == 500000.0, "the second costs 1,000,000")
	check(Campaign.refit_classes(db, uid, walk).has("error"), "a third without the doubloons refused")
	print("  hull check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
