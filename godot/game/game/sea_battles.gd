extends RefCounted
## Part of Sea (game/sea.gd): THE FIGHTS, launched. A campaign node pressed at
## the helm, the raids (alone, or through a Charter's table), the gauntlets'
## dives, and the chapter's parchment after. The fights themselves are
## game/battle_stage.gd's; the solo dive's table stays on the Sea.
## Split out of game/sea.gd on 2026-10-10 for size.


## A node of the campaign pressed at the helm: a fight is taken on from its
## dock; anything else opens its sheet (or its scene).
static func open_node(o: Sea, id: String) -> void:
	var n: Dictionary = Campaign.node(id)
	var st: String = str(o._campaign.status.get(id, "locked"))
	if n["type"] == "skirmish" and st != "locked" and n.get("raidId") != null:
		o.start_battle(str(n["raidId"]), id)
		return
	var sheet: NodeSheet = NodeSheet.new()
	sheet.sea = o
	sheet.node_id = id
	sheet.done.connect(func() -> void:
		o._campaign.refresh()
		o._hud.refresh()
		o.get_tree().create_timer(0.4).timeout.connect(o.celebrate_chapter))
	o._hold(sheet, o._hud_layer)


## A new chapter's water opened: the parchment, once (markChapterUnlockSeen).
static func celebrate_chapter(o: Sea) -> void:
	var ch: Dictionary = o._campaign.owed_chapter()
	if ch.is_empty() or o._hud.busy():
		return
	var prev: Dictionary = Campaign.chapters()[int(ch["number"]) - 2]
	var card: ChapterCard = ChapterCard.new()
	card.chapter = ch
	card.sparks = true
	card.eyebrow = "CHAPTER %s COMPLETE  ·  NEW CHAPTER UNLOCKED" % str(prev.get("romanNumeral", ""))
	card.finished.connect(func() -> void:
		o.session.act("markChapterUnlockSeen", [ch["id"]])
		o.session.persist()
		o._campaign.refresh())
	o._hold(card, o._hud_layer)


## A FIGHT ON THE WATER (game/battle_stage.gd): the sea becomes its stage.
static func start_battle(o: Sea, raid_id: String, node_id: String) -> void:
	# In a Charter every raid goes through the founder's table (the purse is
	# the crew's): the call goes out, and the line forms when it sails.
	if raids_shared(o):
		var r: Variant = await o.session.act("raidTable", ["call", { "raidId": raid_id, "nodeId": node_id, "x": o._boat.position.x, "y": o._boat.position.y }])
		if r is Dictionary and r.has("error"):
			o._hud.toast(str(r["error"]))
		return
	# Alone: the entry screen first (the skirmish, a lesson, sails straight in).
	if Battle.raid_def(raid_id).get("skirmish", false) != true:
		var rs: ReadyScreen = ReadyScreen.new()
		rs.sea = o
		rs.raid_id = raid_id
		rs.node_id = node_id
		rs.sail.connect(func(_tier: String) -> void: o._launch(raid_id, node_id))
		o._hold(rs, o._hud_layer)
		return
	o._launch(raid_id, node_id)


## A raid's fight screen, at the campaign mark it was taken on from (when
## there is one): alone, or (coop) a Charter's line at RaidTable.live as
## my_key. As it ends the campaign, the Sea Gate and the HUD catch up, then
## the chapter's parchment.
static func raid_stage(o: Sea, raid_id: String, node_id: String, coop: bool, my_key: String) -> void:
	var st: BattleStage = BattleStage.new()
	st.sea = o
	st.raid_id = raid_id
	if coop:
		st.table = RaidTable.live
		st.my_key = my_key
	var mark: CampaignWater.Ship = o._campaign.ship(node_id) if node_id != "" else null
	if mark != null:
		st.mark = mark
		st.dock = mark.dock()
	st.finished.connect(func(_won: bool) -> void:
		o._campaign.refresh()
		o._open_sea_gate()
		o._hud.refresh()
		o.get_tree().create_timer(0.4).timeout.connect(o.celebrate_chapter))
	o._hold(st, o._hud_layer)


## A gauntlet's maelstrom pressed: in a Charter the call goes to the crew's
## table (the muster opens the entry screen for the line); alone, this game's
## own table, with its own muster.
static func open_gauntlet(o: Sea, variant: String) -> void:
	if o.net != null and o.net.gauntlets != null:
		var r: Variant = await o.session.act("gauntletTable", ["call", { "variant": variant, "x": o._boat.position.x, "y": o._boat.position.y }])
		if r is Dictionary and (r as Dictionary).has("error"):
			o._hud.toast(str(r["error"]))
		return
	if o._solo_dive != null and is_instance_valid(o._solo_dive):
		o._solo_dive.queue_free()
	var t: GauntletTable = GauntletTable.new()
	t.solo = o.session
	o.add_child(t)
	o._solo_dive = t
	var gm: GauntletMuster = GauntletMuster.new()
	gm.sea = o
	gm.table = t
	gm.my_key = "me"
	o._hud_layer.add_child(gm)
	t.changed.connect(func(st: Dictionary) -> void:
		if str(st.get("phase", "")) in ["idle", "done"] and is_instance_valid(gm):
			gm.queue_free())
	var r2: Dictionary = t.handle("me", o.session, ["call", { "variant": variant }])
	if r2.has("error"):
		o._hud.toast(str(r2["error"]))
		gm.queue_free()
		t.queue_free()


## Into a dive: the fight screen, held for the whole descent, at the maelstrom.
static func open_gauntlet_battle(o: Sea, t: GauntletTable, my_key: String, variant: String) -> void:
	var st: BattleStage = BattleStage.new()
	st.sea = o
	st.raid_id = ""
	st.table = t
	st.my_key = my_key
	st.gauntlet = variant
	var at: Vector2 = GauntletTable.maelstrom_of(variant)
	if at != Vector2.INF:
		st.dock = at + Vector2(-1250, 820)
	st.finished.connect(func(_won: bool) -> void:
		o._hud.refresh()
		o._campaign.refresh())
	o._hold(st, o._hud_layer)


## Is this captain in a Charter whose raids go through the founder's table?
static func raids_shared(o: Sea) -> bool:
	if RaidTable.live == null:
		return false
	return o.session.remote != null or (o.session.charter != null and o.session.charter.raids != null)
