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
	check(sea._berth.lit > 0.5, "the berth lights up")

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
	market._sell(1.0, 6.0)
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
	market._sell(2.0, 2.0)
	await process_frame
	check(float(s.store.hold_qty(s.uid, 2.0)) == 2.0, "part of a stack sells")
	market._confirm_all = true
	market.rebuild()
	await process_frame
	market._sell_all()
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
	shop._do("b", func() -> Dictionary: return Harbour.buy_bait(s.store, s.uid, "worm", 25))
	check(Js.num((s.save["bait"] as Dictionary).get("worm")) == worms + 25.0, "bait is bought")
	shop._open("rod")
	shop._do("r", func() -> Dictionary:
		var r: Dictionary = Harbour.purchase_rod(s.store, s.uid, 1.0)
		if not r.has("error"):
			Loadout.equip_tackle_rod(s.store, s.uid, 1.0)
		return r)
	check(Js.num(p.get("rod_tier")) == 1.0, "a bought rod is in hand (%s)" % shop._error)
	shop._sell_confirm = 1.0
	shop._do("r", func() -> Dictionary: return Harbour.sell_rod(s.store, s.uid, 1.0))
	check(not Js.includes(s.store.held_rod_tiers(s.uid), 1.0), "a rod sells back (%s)" % shop._error)
	shop._open("reel")
	var reel: float = Js.num(p.get("reel_tier"))
	shop._do("tier", func() -> Dictionary: return Harbour.buy_reel(s.store, s.uid))
	check(Js.num(p.get("reel_tier")) == reel + 1.0, "the next reel is bought (%s)" % shop._error)
	shop._open("hook")
	shop._do("tier", func() -> Dictionary: return Harbour.buy_hook(s.store, s.uid))
	shop._back()
	await process_frame
	check(shop.section == "", "back goes to the shop's landing")
	shop.rebuild()
	await process_frame
	shop._back()
	await process_frame
	check(not hud.busy(), "leaving the shop frees the HUD")

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
	panel._do_sell()
	check(Js.num(p.get("doubloons")) > purse and s.store.hold_count(s.uid) == 0.0, "the buyer takes the hold")
	panel.close()
	await process_frame
	await process_frame
	check(hud._reach_text.begins_with("Speak to "), "after dealing it is Speak to (%s)" % hud._reach_text)

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
