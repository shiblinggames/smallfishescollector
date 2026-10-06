extends SceneTree
## CAPTAIN'S CHOICE, REWORKED (core/captain_class.gd): the numbers replace and
## never stack, the menus by chapter, old picks read as a class, and each
## order in a fight (once, back at the rest, a turn spent).
##
##   godot --headless --path godot/game -s tests/class_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _seat(name: String, picks: Dictionary) -> Dictionary:
	var hull: Dictionary = Rules.data()["shipCombat"]["4"]
	return {
		"uid": name, "name": name, "tier": 4.0, "hp": 200.0, "max": 200.0, "speed": float(hull["speed"]), "shipMin": float(hull["minDamage"]),
		"power": 40.0, "nav": 10.0, "fortune": 5.0, "dmgMult": 1.0, "maxCharges": 3.0, "crew": [], "used": [],
		"cls": CaptainClass.effects(picks), "orderUsed": false,
	}


func _init() -> void:
	# The numbers.
	var g: Dictionary = CaptainClass.effects({ "thread": "master_gunner" })
	check(g["order"] == "powder_keg" and is_equal_approx(float(g["crit"]), 0.10), "Gunner: Powder Keg, crits 10%")
	check(is_equal_approx(float(CaptainClass.effects({ "thread": "master_gunner", "sunken_hand": "master_gunner_ii_a" })["crit"]), 0.15), "raised to 15%, not 25%")
	var g2: Dictionary = CaptainClass.effects({ "thread": "master_gunner", "sunken_hand": "master_gunner_ii_b", "the_coffers": "master_gunner_iii_a" })
	check(is_equal_approx(float(g2["crit"]), 0.10) and is_equal_approx(float(g2["greenCrit"]), 0.10) and g2["kegFree"], "Keen Eye and Quick Fuse keep the 10% passive")
	check(is_equal_approx(float(CaptainClass.effects({ "thread": "ironside", "sunken_hand": "ironside_ii_a", "the_coffers": "ironside_iii_a" })["hp"]), 0.50), "Ironside +50% hull, not +90%")
	check(is_equal_approx(float(CaptainClass.effects({ "thread": "helmsman", "sunken_hand": "helmsman_ii_b", "the_coffers": "helmsman_iii_a" })["coin"]), 0.25) and float(CaptainClass.effects({ "thread": "helmsman", "sunken_hand": "helmsman_ii_b", "the_coffers": "helmsman_iii_a" })["sail"]) == 1.0, "Helmsman: +25% coin and Full Sail for all")
	check(is_equal_approx(float(Campaign.class_effects({ "thread": "ironside" })["hpMult"]), 1.15) and float(Campaign.class_effects({ "thread": "ironside" })["damageMult"]) == 1.0, "no more flat damage trades")
	# The menus.
	check(CaptainClass.offered({}).size() == 4, "Chapter I: four classes")
	check(CaptainClass.offered({ "thread": "surgeon" }) == ["surgeon_ii_a", "surgeon_ii_b"], "Chapter II: two upgrades of the class")
	check(CaptainClass.offered({ "thread": "surgeon", "sunken_hand": "surgeon_ii_b" }) == ["surgeon_iii_a", "surgeon_iii_b"], "Chapter III: two more")
	# Old picks.
	var old: Dictionary = CaptainClass.normalize({ "thread": "buccaneer", "sunken_hand": "buccaneer_ii", "the_coffers": "master_gunner" })
	check(old["thread"] == "surgeon" and old["sunken_hand"] == "surgeon_ii_a" and old["the_coffers"] == "surgeon_iii_b", "an old Buccaneer reads as a Surgeon with raised passives (%s)" % str(old))
	var defs: Dictionary = Rules.data()["shipClasses"]["classes"]
	for cls: String in CaptainClass.CLASSES:
		for id: String in [cls, cls + "_ii_a", cls + "_ii_b", cls + "_iii_a", cls + "_iii_b"]:
			check(defs.has(id), "a card for %s" % id)

	# ── In a fight ──
	Dice.install(Dice.Mulberry32.new(7))
	var gun: Dictionary = _seat("G", { "thread": "master_gunner" })
	var iron: Dictionary = _seat("I", { "thread": "ironside" })
	var surg: Dictionary = _seat("S", { "thread": "surgeon", "sunken_hand": "surgeon_ii_a" })
	var helm: Dictionary = _seat("H", { "thread": "helmsman", "sunken_hand": "helmsman_ii_a", "the_coffers": "helmsman_iii_a" })
	var b: Dictionary = Battle.begin("captain_krust", [gun, iron, surg, helm], "coop")
	for s0: Dictionary in b["seats"]:
		s0["charges"] = 0.0
	check(Battle.legal(b, b["seats"][0])["order"], "an order is ready")
	# Full Sail at 100%: every ship loads a ball, and the Helmsman's turn is spent.
	var ev: Array = Battle.resolve(b, [{ "action": "reload" }, { "action": "order" }, { "action": "order", "ally": 0.0 }, { "action": "order" }])
	check(ev.any(func(e: Dictionary) -> bool: return e.get("t") == "order" and e.get("order") == "full_sail" and (e["loaded"] as Array).size() >= 3), "Full Sail loads every ship")
	check(ev.any(func(e: Dictionary) -> bool: return e.get("t") == "order" and e.get("order") == "field_surgery"), "Field Surgery goes")
	check(not Js.obj(b["seats"][1].get("drawing")).is_empty() or b["state"] != "plan", "Draw Fire is raised")
	check(not Battle.legal(b, b["seats"][3])["order"] and str(Battle.order_ok(b["seats"][3])).begins_with("Used"), "once, until the rest")
	# Draw Fire: aimed shots come at the Ironside.
	if b["state"] == "plan":
		var drawn: int = Battle._draw_fire(b)
		check(drawn == 1, "the aimed shots go to the one drawing fire")
	# Powder Keg: the next attack lands on every enemy afloat.
	var b2: Dictionary = Battle.begin("captain_krust", [_seat("G", { "thread": "master_gunner" }), _seat("G2", { "thread": "master_gunner" })], "coopc")
	for t: int in 6:
		if Battle.foes(b2).size() >= 2:
			break
		b2 = Battle.begin("captain_krust", [_seat("G", { "thread": "master_gunner" }), _seat("G2", { "thread": "master_gunner" })], "coopc")
	if Battle.foes(b2).size() >= 2:
		Battle.resolve(b2, [{ "action": "order" }, { "action": "reload" }])
		check(b2["seats"][0].get("keg", false), "Powder Keg arms the next attack")
		b2["seats"][0]["charges"] = 3.0
		var ev2: Array = Battle.resolve(b2, [{ "action": "fire", "aim": "hit", "target": 0 }, { "action": "reload" }])
		var hit_foes: Dictionary = {}
		for e2: Dictionary in ev2:
			if e2.get("t") == "shot" and int(e2.get("seat", -1)) == 0:
				hit_foes[int(Js.nz(e2.get("foe"), 0.0))] = true
		check(hit_foes.size() >= 2, "the attack lands on every enemy afloat (%d)" % hit_foes.size())
		check(float(b2["seats"][0]["charges"]) == 2.0, "for one attack's balls")
	else:
		print("  (no field of two came up; Powder Keg's spread not checked)")
	print("class check: %s" % ("ok" if bad == 0 else "%d failed" % bad))
	quit(1 if bad > 0 else 0)
