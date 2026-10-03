extends SceneTree
## CREW SKINS AND VOUCHERS, through the rules (core/skins.gd): the 75 skins
## and their tiers; the Parlor's ranks paying one voucher each, once; a
## voucher never opening below its floor nor to a skin owned; a skin for a
## crew not aboard waiting, one for a crew aboard worn at once; equip and
## take off; the roster wearing it; every skin owned paying doubloons.
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
	var count: Dictionary = {}
	for k: Dictionary in all:
		count[Skins.tier_of(k)] = int(count.get(Skins.tier_of(k), 0)) + 1
		check(FileAccess.file_exists("res://art/card-arts/%s.webp" % str(k["filename"]).get_basename()), "art for %s" % k["id"])
	check(all.size() == 75, "75 skins (%d)" % all.size())
	print("  tiers: %s" % str(count))

	# ── The Parlor's ranks ──
	prof["parlor_points"] = 50.0
	Skins.sync_parlor(db, uid)
	var vs: Array = Skins.vouchers(db.me(uid))
	check(vs.size() == 2 and vs[0]["floor"] == "rare" and vs[1]["floor"] == "rare", "two ranks, two rare vouchers (%d)" % vs.size())
	Skins.sync_parlor(db, uid)
	check(Skins.vouchers(db.me(uid)).size() == 2, "paid once")
	prof["parlor_points"] = 1000.0
	RulesApi.run(db, uid, "parlorState", [])
	vs = Skins.vouchers(db.me(uid))
	check(vs.size() == 9 and vs[8]["floor"] == "chase" and vs[4]["floor"] == "legendary", "all nine ranks paid, the last a chase (%d)" % vs.size())

	# ── Opening ──
	var order: Array = Skins.TIERS
	var seen: Dictionary = {}
	for v: Dictionary in vs:
		var r: Dictionary = RulesApi.run(db, uid, "openSkinVoucher", [v["id"]])
		check(r.get("ok", false) and r.has("skin"), "a voucher opens (%s)" % str(r.get("error", "")))
		check(order.find(r["tier"]) >= order.find(v["floor"]), "%s never below its floor %s" % [r["tier"], v["floor"]])
		check(not seen.has(r["skin"]["id"]), "never a skin already owned")
		seen[r["skin"]["id"]] = true
		check(not r["worn"] or r["crewHas"], "worn only when that crew is aboard")
	check(Skins.vouchers(db.me(uid)).is_empty(), "the hand is empty")
	check(RulesApi.run(db, uid, "openSkinVoucher", ["v1"]).has("error"), "a voucher opens once")

	# The weights: from rare floors, rares come most.
	var rare_hits: int = 0
	for i: int in 400:
		Skins.grant(db, uid, "rare", "test")
		var vv: Array = Skins.vouchers(db.me(uid))
		var r2: Dictionary = Skins.open(db, uid, str(vv[vv.size() - 1]["id"]))
		if r2.has("skin") and r2["tier"] == "rare":
			rare_hits += 1
		# Give it back, so the pool stays whole.
		if r2.has("skin"):
			var o: Array = Skins.owned(db.me(uid)).duplicate()
			o.erase(r2["skin"]["id"])
			db.update_profile(uid, { "owned_crew_skins": o })
	check(rare_hits > 150, "rares are the likeliest from a rare floor (%d of 400)" % rare_hits)

	# ── Wearing ──
	var aboard: Dictionary = Crew.live(db)[0] if not Crew.live(db).is_empty() else {}
	if aboard.is_empty():
		db.save["crew"] = [{ "id": 1.0, "card_id": float(Crew.cards()[0]["id"]), "rarity": 2.0, "power": 10.0, "dodge": 10.0, "fortune": 10.0, "effects": [], "recruited": true, "recruited_at": "x", "xp": 0.0 }]
		aboard = Crew.live(db)[0]
	var card: Dictionary = Crew.card(float(aboard["card_id"]))
	var slug: String = str(card["slug"]).to_lower()
	var kins: Array = Skins.for_slug(slug)
	if kins.is_empty():
		for cd: Dictionary in Crew.cards():
			if not Skins.for_slug(str(cd["slug"]).to_lower()).is_empty():
				card = cd
				slug = str(cd["slug"]).to_lower()
				kins = Skins.for_slug(slug)
				aboard["card_id"] = float(cd["id"])
				break
	var k0: Dictionary = kins[0]
	db.update_profile(uid, { "owned_crew_skins": [k0["id"]], "equipped_crew_skins": {} })
	check(RulesApi.run(db, uid, "equipCrewSkin", [slug, "nope"]).has("error"), "an unknown skin is refused")
	if kins.size() > 1:
		check(RulesApi.run(db, uid, "equipCrewSkin", [slug, kins[1]["id"]]).has("error"), "a skin not owned is refused")
	check(not RulesApi.run(db, uid, "equipCrewSkin", [slug, k0["id"]]).has("error"), "an owned skin is worn")
	var roster: Array = Crew.state(db, uid)["roster"]
	var me: Dictionary = roster.filter(func(m: Dictionary) -> bool: return m["slug"] == slug)[0]
	check(me["filename"] == k0["filename"] and me["baseFilename"] == card["filename"], "the roster wears it (%s)" % me["filename"])
	RulesApi.run(db, uid, "equipCrewSkin", [slug, null])
	me = (Crew.state(db, uid)["roster"] as Array).filter(func(m: Dictionary) -> bool: return m["slug"] == slug)[0]
	check(me["filename"] == card["filename"], "and takes it off")

	# ── Every skin owned ──
	db.update_profile(uid, { "owned_crew_skins": all.map(func(k: Dictionary) -> String: return k["id"]) })
	Skins.grant(db, uid, "epic", "test")
	var d0: float = Js.num(db.me(uid).get("doubloons"))
	var vl: Array = Skins.vouchers(db.me(uid))
	var rp: Dictionary = Skins.open(db, uid, str(vl[vl.size() - 1]["id"]))
	check(float(rp.get("doubloons", 0)) == 2500.0 and Js.num(db.me(uid).get("doubloons")) == d0 + 2500.0, "every skin owned pays 2,500")

	print("  skins check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
