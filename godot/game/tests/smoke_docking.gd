extends SceneTree
## A SMOKE RUN OF DOCKING (Godot port): the real game on a fresh captain in a
## scratch folder. It opens at HOME, inside the Mainland's berth, so the dock
## prompt must be up; E goes ashore; the Market sells a stack, part of a
## stack through the trade sheet and then the whole hold (asked twice), with
## Advanced on and off; the Tackle Shop opens every section and buys bait, a
## rod (equipped), sells one back (asked twice), buys a reel and a hook; then
## the boat sails to the Shallows' buyer, hails them and sells the hold. It
## checks the screens never break and the purse and hold move as they should;
## the rules themselves are held by tests/parity.gd.
##
##   godot --headless --path godot/game -s tests/smoke_docking.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://smoke_captains"
	for f: String in DirAccess.get_files_at(Captains.dir_override) if DirAccess.dir_exists_absolute(Captains.dir_override) else PackedStringArray():
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	Main.straight_to_sea = true
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	var hud: FishingHud = sea._hud
	var s: Session = sea.session
	var p: Dictionary = s.profile()
	p["doubloons"] = 60000.0
	p["fishing_xp"] = float((Rules.data()["xpTable"] as Array)[29])
	s.save["hold"] = { "1": 6.0, "2": 4.0, "7": 3.0, "12": 2.0 }
	for id: int in [1, 2, 7, 12, 20]:
		s.save["collection"][str(id)] = { "catch_count": 1.0, "is_golden": null }
	hud.refresh()
	for f: int in 5:
		await process_frame

	# The berth and the prompt.
	check(Chart.in_berth(sea._boat.position), "a fresh captain opens inside the berth")
	check(hud._reach_btn.visible and hud._reach_text == "Go ashore at The Mainland", "the dock prompt is up (%s)" % hud._reach_text)
	for f: int in 30:
		await process_frame
	check((sea._berths["mainland"] as Berth).lit > 0.5, "the berth lights up")

	# Ashore, then the Market.
	hud._press_reach()
	await process_frame
	var ashore: Ashore = _find(sea, Ashore)
	check(ashore != null, "going ashore opens the picker")
	check(hud.busy(), "the HUD holds still while ashore")
	ashore.chose.emit("market")
	ashore.close()
	await process_frame
	var market: MarketRoom = _find(sea, MarketRoom)
	check(market != null, "the Market opens")
	var purse: float = Js.num(p.get("doubloons"))
	await market._sell(1.0, 6.0)
	await process_frame
	check(Js.num(p.get("doubloons")) > purse, "selling a stack pays")
	check(s.store.hold_qty(s.uid, 1.0) == null or float(s.store.hold_qty(s.uid, 1.0)) == 0.0, "the stack is gone")
	market._advanced = true
	market.rebuild()
	await process_frame
	market._mode = "movement"
	market._sort = "change"
	market.rebuild()
	await process_frame
	var e: Dictionary = {}
	for x: Dictionary in market._entries():
		if x["id"] == 2.0:
			e = x
	market._trade(e)
	await process_frame
	var sheet: Sheet = _find(market, Sheet)
	check(sheet != null, "the trade sheet opens")
	sheet.close()
	await market._sell(2.0, 2.0)
	await process_frame
	check(float(s.store.hold_qty(s.uid, 2.0)) == 2.0, "part of a stack sells")
	market._confirm_all = true
	market.rebuild()
	await process_frame
	await market._sell_all()
	await process_frame
	check(s.store.hold_count(s.uid) == 0.0, "Sell all empties the hold")
	market.rebuild()
	await process_frame
	market._back()
	await process_frame
	check(not hud.busy(), "leaving the Market frees the HUD")

	# The Tackle Shop.
	sea._enter_room("tackle")
	await process_frame
	var shop: TackleRoom = _find(sea, TackleRoom)
	check(shop != null, "the Tackle Shop opens")
	for sec: String in ["bait", "hook", "reel", "line", "rod"]:
		shop._open(sec)
		await process_frame
		check(shop.section == sec, "the %s section opens" % sec)
	shop._open("bait")
	var worms: float = Js.num((s.save["bait"] as Dictionary).get("worm"))
	await shop._do("b", "buyBait", ["worm", 25.0])
	check(Js.num((s.save["bait"] as Dictionary).get("worm")) == worms + 25.0, "bait is bought")
	shop._open("rod")
	await shop._do("r", "purchaseRod", [1.0], ["equipTackleRod", [1.0]])
	check(Js.num(p.get("rod_tier")) == 1.0, "a bought rod is in hand (%s)" % shop._error)
	shop._sell_confirm = 1.0
	await shop._do("r", "sellRod", [1.0])
	check(not Js.includes(s.store.held_rod_tiers(s.uid), 1.0), "a rod sells back (%s)" % shop._error)
	shop._open("reel")
	var reel: float = Js.num(p.get("reel_tier"))
	await shop._do("tier", "buyReel", [])
	check(Js.num(p.get("reel_tier")) == reel + 1.0, "the next reel is bought (%s)" % shop._error)
	shop._open("hook")
	await shop._do("tier", "buyHook", [])
	shop._back()
	await process_frame
	check(shop.section == "", "back goes to the shop's landing")
	shop.rebuild()
	await process_frame
	shop._back()
	await process_frame
	check(not hud.busy(), "leaving the shop frees the HUD")

	# The Shipyard: a refit, the hold, and the boat's fit follows.
	sea._enter_room("shipyard")
	await process_frame
	var yard: ShipyardRoom = _find(sea, ShipyardRoom)
	check(yard != null, "the Shipyard opens")
	var hull_was: float = sea._boat.hull
	await yard._buy(ShipyardRoom.LADDERS[0])
	check(Js.num(p.get("hull_speed_tier")) == 1.0, "a hull refit is fitted (%s)" % yard._error)
	await yard._buy(ShipyardRoom.LADDERS[3])
	check(Js.num(p.get("fish_hold_tier")) == 1.0, "the hold is upgraded (%s)" % yard._error)
	yard._tab = "rig"
	yard.rebuild()
	await process_frame
	yard._back()
	await process_frame
	check(sea._boat.hull > hull_was, "the boat sails on her new hull")

	# The Shallows' buyer.
	var buyer: Buyer = sea._buyers[0]
	sea._boat.position = buyer.position + Vector2(0, 120)
	s.save["hold"] = { "3": 5.0, "4": 2.0 }
	await process_frame
	await process_frame
	check(hud._reach_text.begins_with("Hail "), "a buyer in range can be hailed (%s)" % hud._reach_text)
	hud._press_reach()
	await process_frame
	var panel: BuyerPanel = _find(sea, BuyerPanel)
	check(panel != null, "hailing opens the buyer's panel")
	purse = Js.num(p.get("doubloons"))
	await panel._do_sell()
	check(Js.num(p.get("doubloons")) > purse and s.store.hold_count(s.uid) == 0.0, "the buyer takes the hold")
	panel.close()
	await process_frame
	await process_frame
	check(hud._reach_text.begins_with("Speak to "), "after dealing it is Speak to (%s)" % hud._reach_text)

	# Exploring: an isle, a dig, a bottle.
	var isle: Dictionary = (Rules.data()["isles"] as Array)[0]
	sea._boat.position = Vector2(float(isle["x"]), float(isle["y"]) + float(isle["r"]) + 120.0)
	var purse0: float = Js.num(p.get("doubloons"))
	await sea._land(isle)
	check(Js.includes(s.save["discoveries"], isle["id"]) and Js.num(p.get("doubloons")) > purse0, "landing on an isle pays and is remembered")
	for c: Node in sea._room_layer.get_children():
		c.queue_free()
	await process_frame
	var site: Dictionary = (Rules.data()["digSites"] as Array)[0]
	sea._boat.position = Vector2(float(site["x"]), float(site["y"]))
	await sea._dig(site)
	check(sea._dug(site["id"]), "a dig is dug")
	for c: Node in sea._room_layer.get_children():
		c.queue_free()
	await process_frame
	var bottles: Array = Explore.bottles_around(0, 3000, 6000, Clock.now_ms())
	if not bottles.is_empty():
		var at: Dictionary = Explore.bottle_pos(bottles[0], Clock.now_ms() / 1000.0)
		sea._boat.position = Vector2(float(at["x"]), float(at["y"]))
		await sea._bottle(bottles[0])
		check(sea._taken.has(bottles[0]["key"]), "a bottle is fished out")
	check(Explore.fog_progress(Explore.fog_decode(p.get("sea_explored"))) > 0.0, "the fog is lifting where the boat has been")

	print("  docking smoke: %s" % ("ok" if bad == 0 else "%d failed" % bad))
	quit(0 if bad == 0 else 1)


func _find(n: Node, type: Variant) -> Variant:
	for c: Node in n.get_children():
		if is_instance_of(c, type) and not c.is_queued_for_deletion():
			return c
		var deeper: Variant = _find(c, type)
		if deeper != null:
			return deeper
	return null
