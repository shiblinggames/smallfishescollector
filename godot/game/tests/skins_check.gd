extends SceneTree
## CREW SKINS AND VOUCHERS, through the rules (core/skins.gd): the 75 skins
## and their tiers; the two kinds rolling near their weights; never a skin
## owned; a tier owned in full left out; the Parlor's capstone paid once;
## crates and caskets dropping vouchers by tier; a skin for a crew aboard
## worn at once; equip and take off; every skin owned paying doubloons; the
## first build's voucher list read as kinds.
##
##   godot --headless --path godot/game -s tests/skins_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://skins_captains"
	for f: String in DirAccess.get_files_at(Captains.dir_override) if DirAccess.dir_exists_absolute(Captains.dir_override) else PackedStringArray():
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	var fresh: Dictionary = Captains.create(Captains.new_id())
	var s: Session = Session.new(fresh["save"], fresh["carried"])
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var prof: Dictionary = db.me(uid)
	Dice.install(Dice.Mulberry32.new(7))

	var all: Array = Skins.all()
	for k: Dictionary in all:
		check(FileAccess.file_exists("res://art/card-arts/%s.webp" % str(k["filename"]).get_basename()), "art for %s" % k["id"])
	check(all.size() == 75, "75 skins (%d)" % all.size())
	for kind: String in Skins.KINDS:
		check(ResourceLoader.exists("res://art/%s" % Skins.kind_def(kind)["art"]), "%s painting" % kind)

	# ── The weights, on a fresh collection (each skin handed back) ──
	for kind: String in Skins.KINDS:
		var n: Dictionary = {}
		var runs: int = 4000
		Skins.grant(db, uid, kind, float(runs))
		for i: int in runs:
			var r: Dictionary = RulesApi.run(db, uid, "openSkinVoucher", [kind])
			n[r["tier"]] = int(n.get(r["tier"], 0)) + 1
			check(Skins.tier_of(r["skin"]) == r["tier"], "the skin is of its tier")
			db.update_profile(uid, { "owned_crew_skins": [] })
		var w: Dictionary = Skins.kind_def(kind)["weights"]
		for t: String in Skins.TIERS:
			var got: float = 100.0 * float(n.get(t, 0)) / float(runs)
			check(absf(got - float(w[t])) < maxf(1.0, float(w[t]) * 0.2), "%s %s %.1f%% near %s%%" % [kind, t, got, str(w[t])])
		print("  %s: %s" % [kind, str(n)])
	check(Skins.held(db.me(uid)) == 0, "every voucher spent")
	check(RulesApi.run(db, uid, "openSkinVoucher", ["bosun"]).has("error"), "none left to open")

	# ── Never a skin owned; a full tier left out ──
	var rares: Array = all.filter(func(k: Dictionary) -> bool: return Skins.tier_of(k) == "rare").map(func(k: Dictionary) -> String: return k["id"])
	db.update_profile(uid, { "owned_crew_skins": rares.duplicate() })
	Skins.grant(db, uid, "bosun", 30.0)
	var seen: Dictionary = {}
	for i: int in 30:
		var r: Dictionary = Skins.open(db, uid, "bosun")
		check(r["tier"] != "rare", "rares all owned: none rolled")
		check(not seen.has(r["skin"]["id"]) and not rares.has(r["skin"]["id"]), "never a skin owned")
		seen[r["skin"]["id"]] = true

	# ── The Parlor's capstone ──
	db.update_profile(uid, { "skin_vouchers": {}, "parlor_points": 900.0 })
	RulesApi.run(db, uid, "parlorState", [])
	check(Skins.held(db.me(uid)) == 0, "no voucher below Parlor Legend")
	prof["parlor_points"] = 1000.0
	RulesApi.run(db, uid, "parlorState", [])
	RulesApi.run(db, uid, "parlorState", [])
	check(int(Js.num(Skins.vouchers(db.me(uid)).get("captain"))) == 1 and Skins.held(db.me(uid)) == 1, "Parlor Legend pays one Captain's Voucher, once")

	# ── Drops ──
	db.update_profile(uid, { "skin_vouchers": {} })
	var got_c: Dictionary = {}
	for i: int in 20000:
		for kv: Variant in Skins.drops(db, uid, "crate", "gold"):
			got_c[kv] = int(got_c.get(kv, 0)) + 1
		for kv: Variant in Skins.drops(db, uid, "crate", "ancient"):
			got_c["a_" + str(kv)] = int(got_c.get("a_" + str(kv), 0)) + 1
	check(not got_c.has("captain") and not got_c.has("a_bosun"), "gold crates give Bosun's, ancient Captain's (%s)" % str(got_c))
	check(absf(float(got_c.get("bosun", 0)) / 20000.0 - 0.025) < 0.006, "a gold crate's chance (%d in 20000)" % int(got_c.get("bosun", 0)))
	check(Skins.held(db.me(uid)) == int(got_c.get("bosun", 0)) + int(got_c.get("a_captain", 0)), "drops are held")
	check(Skins.drops(db, uid, "casket", "nope").is_empty(), "an unknown table drops nothing")

	# ── Wearing ──
	var aboard: Dictionary = {}
	for cd: Dictionary in Crew.cards():
		if not Skins.for_slug(str(cd["slug"]).to_lower()).is_empty():
			db.save["crew"] = [{ "id": 1.0, "card_id": float(cd["id"]), "rarity": 2.0, "power": 10.0, "dodge": 10.0, "fortune": 10.0, "effects": [], "recruited": true, "recruited_at": "x", "xp": 0.0 }]
			aboard = cd
			break
	var slug: String = str(aboard["slug"]).to_lower()
	var kins: Array = Skins.for_slug(slug)
	var others: Array = all.filter(func(k: Dictionary) -> bool: return k["slug"] != slug).map(func(k: Dictionary) -> String: return k["id"])
	others.append_array(kins.slice(1).map(func(k: Dictionary) -> String: return k["id"]))
	db.update_profile(uid, { "owned_crew_skins": others, "equipped_crew_skins": {}, "skin_vouchers": { "bosun": 1.0 } })
	var ro: Dictionary = Skins.open(db, uid, "bosun")
	check(ro["skin"]["id"] == kins[0]["id"] and ro["worn"] and ro["crewHas"], "the last skin left, for a crew aboard, is worn at once")
	var k0: Dictionary = kins[0]
	check(RulesApi.run(db, uid, "equipCrewSkin", [slug, "nope"]).has("error"), "an unknown skin is refused")
	var roster: Array = Crew.state(db, uid)["roster"]
	check(roster[0]["filename"] == k0["filename"] and roster[0]["baseFilename"] == aboard["filename"], "the roster wears it (%s)" % roster[0]["filename"])
	RulesApi.run(db, uid, "equipCrewSkin", [slug, null])
	check(Crew.state(db, uid)["roster"][0]["filename"] == aboard["filename"], "and takes it off")
	db.update_profile(uid, { "owned_crew_skins": [] })
	if kins.size() > 1:
		check(RulesApi.run(db, uid, "equipCrewSkin", [slug, kins[1]["id"]]).has("error"), "a skin not owned is refused")

	# ── Every skin owned ──
	db.update_profile(uid, { "owned_crew_skins": all.map(func(k: Dictionary) -> String: return k["id"]), "skin_vouchers": { "captain": 1.0 } })
	var d0: float = Js.num(db.me(uid).get("doubloons"))
	var rp: Dictionary = Skins.open(db, uid, "captain")
	check(float(rp.get("doubloons", 0)) == 2500.0 and Js.num(db.me(uid).get("doubloons")) == d0 + 2500.0, "every skin owned pays 2,500")

	# ── The first build's list ──
	var old: Dictionary = Skins.vouchers({ "skin_vouchers": [{ "id": "v1", "floor": "rare" }, { "id": "v2", "floor": "epic" }, { "id": "v3", "floor": "chase" }] })
	check(int(old.get("bosun", 0)) == 2 and int(old.get("captain", 0)) == 1, "the old list reads as kinds (%s)" % str(old))

	print("  skins check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
