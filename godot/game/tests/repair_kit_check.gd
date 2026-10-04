extends SceneTree
## THE REPAIR KITS' LADDER (core/repair_kits.gd): bought in tier order, each
## behind its Navigation level and its price, worn at once; an owned kit can
## be carried again; the next rung's range lifted by Fortune.
##
##   godot --headless --path godot/game -s tests/repair_kit_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://repair_kit_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var c: Charter = Charter.found("Kit check", false, "k0", "Captain 0")
	var s: Session = c.session_for("k0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var p: Dictionary = db.me(uid)
	p["doubloons"] = 100000.0
	p["expedition_xp"] = 0.0
	p["owned_repair_kits"] = ["basic_repair_kit"]
	p["equipped_repair_kit"] = "basic_repair_kit"
	check(RepairKits.next_kit(p)["id"] == "reinforced_repair_kit", "the next rung is the Reinforced Kit")
	var r: Dictionary = RepairKits.buy(db, uid)
	check(r.has("error") and str(r["error"]).contains("Navigation 6"), "Navigation 6 gates it (%s)" % str(r))
	check(Js.num(db.me(uid).get("doubloons")) == 100000.0, "a refused buy takes nothing")
	p["expedition_xp"] = 50000000.0
	r = RepairKits.buy(db, uid)
	check(r.get("ok", false), "bought at Navigation (%s)" % str(r))
	p = db.me(uid)
	check(p["equipped_repair_kit"] == "reinforced_repair_kit" and RepairKits.owned(p).has("reinforced_repair_kit"), "worn at once and owned")
	check(Js.num(p.get("doubloons")) == 96000.0, "4,000 spent (%s)" % str(p.get("doubloons")))
	check(RepairKits.next_kit(p)["id"] == "shipwrights_kit", "then the Shipwright's Kit, in order")
	check(RepairKits.equip(db, uid, "basic_repair_kit").get("ok", false) and db.me(uid)["equipped_repair_kit"] == "basic_repair_kit", "an owned kit can be carried again")
	check(RepairKits.equip(db, uid, "ironclad_kit").has("error"), "a kit not owned cannot")
	p["doubloons"] = 10.0
	check(RepairKits.buy(db, uid).has("error"), "not enough doubloons")
	check(RepairKits.range_for(RepairKits.by_id("drydock_kit"), 40.0) == Vector2(12, 35), "the Drydock heals 12 to 25 + 40 x 0.25")
	print("  repair kit check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
