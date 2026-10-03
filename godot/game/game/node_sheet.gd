class_name NodeSheet
extends Control
## A STOP OF THE CAMPAIGN, OPENED (Godot port of app/(app)/sea/SeaNodeSheet.tsx
## with SeaStory's flow), on the night paper.
##
##   A STORY (or a berth's terms with a scene): the scene plays, and reading
##   it to the end is its clear (markStoryNodeRead, or claimScoutDebt when
##   its pay rides an earlier choice). A replay can be skipped.
##   ANYTHING ELSE with a scene plays it once a session as the intro, then
##   the sheet: the toll (milestone), the cache's two items, the call
##   (event), the bones (dice), the gate (DPS check), the muster, the class
##   pick, the yard's terms (berth), the spoils, or the puzzle.
##   A LOCKED stop that previews says what it is waiting on.
## Every action is the rules' (core/campaign.gd), through session.act.

signal done

const GOLD: Color = Color(1.0, 0.82, 0.38)

static var _intro_seen: Dictionary = {}

var sea: Sea
var node_id: String = ""
var _n: Dictionary = {}
var _st: String = "locked"
var _sheet: Control
var _body: VBoxContainer
var _err: Label
var _armed: String = ""


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	_n = Campaign.node(node_id)
	_st = str(sea._campaign.status.get(node_id, "locked"))
	var has_scene: bool = not Js.list(_n.get("scene")).is_empty()
	var t: String = str(_n["type"])
	if has_scene and (t == "story" or t == "berth") and _st != "locked":
		_play(false)
		return
	if has_scene and _st == "available" and not _intro_seen.has(node_id):
		_intro_seen[node_id] = true
		_play(true)
		return
	_open_sheet()


## The scene: as the read itself, or as the intro before the sheet.
func _play(intro: bool) -> void:
	var sc: StoryScene = StoryScene.new()
	sc.node = _n
	sc.allow_skip = _st == "cleared" and not intro
	sc.cta = "Go on" if intro else str(Js.obj(_n.get("detail")).get("ctaLabel", "Log it"))
	if _st == "cleared" and not intro:
		sc.cta = "Close"
	add_child(sc)
	var read: bool = await sc.finished
	if intro:
		_open_sheet()
		return
	if read and _st != "cleared":
		var r: Variant
		if _n.get("payoff") is Dictionary:
			r = await sea.session.act("claimScoutDebt", [node_id])
		else:
			r = await sea.session.act("markStoryNodeRead", [node_id])
		sea.session.persist()
		if r is Dictionary and (r as Dictionary).has("error"):
			sea._hud.toast(str(r["error"]))
		elif r is Dictionary:
			_paid(r)
	_close()


## What a clear paid, said on the sea.
func _paid(r: Dictionary) -> void:
	var bits: Array = []
	if Js.num(r.get("doubloonsDelta")) > 0.0:
		bits.append("+%s ⟡" % Js.thousands(float(r["doubloonsDelta"])))
	if Js.num(r.get("navXpDelta")) > 0.0:
		bits.append("+%s Navigation XP" % Js.thousands(float(r["navXpDelta"])))
	if not bits.is_empty():
		sea._hud.toast("  ·  ".join(PackedStringArray(bits)))
	var leg: Variant = r.get("unlockedLegendary")
	if leg is Dictionary:
		sea._hud.notify("NEW RECRUIT", "%s can be recruited" % leg["name"], "%s now turns up on the Crew Hall's board of hopefuls." % leg["name"], Skipper.tex("card-arts/%s" % str(leg.get("filename", ""))))
	Sound.chest(true)


func _close() -> void:
	if is_queued_for_deletion():
		return
	done.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if _sheet != null and event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		_close()


# ── The sheet ─────────────────────────────────────────────────────────────────

func _open_sheet() -> void:
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.02, 0.03, 0.05, 0.6)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			_close())
	add_child(shade)
	_sheet = Control.new()
	_sheet.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_sheet.offset_left = -500
	_sheet.offset_right = 500
	_sheet.offset_top = -380
	_sheet.offset_bottom = 380
	add_child(_sheet)
	Paper.night = true
	Paper.sheet(_sheet, 8.0)
	var row: HBoxContainer = HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.add_theme_constant_override("separation", 0)
	_sheet.add_child(row)
	# The picture down the left: the stop's face, or the place.
	var pic_path: String = str(_n.get("image", ""))
	if pic_path == "":
		pic_path = str(Js.obj(Rules.data()["campaign"].get("backdrops")).get(node_id, ""))
	if pic_path != "":
		var pic: TextureRect = TextureRect.new()
		pic.texture = Skipper.tex(pic_path.trim_prefix("/"))
		pic.custom_minimum_size = Vector2(300, 0)
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED if pic_path.ends_with(".png") or pic_path.ends_with(".webp") else TextureRect.STRETCH_KEEP_ASPECT_COVERED
		pic.modulate = Color(0.6, 0.62, 0.7) if _st == "locked" else Color.WHITE
		row.add_child(pic)
	var m: MarginContainer = MarginContainer.new()
	m.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for side: String in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 30)
	row.add_child(m)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	m.add_child(scroll)
	_body = VBoxContainer.new()
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 10)
	scroll.add_child(_body)
	Paper.night = false
	_paint()
	Kit.modal_in(_sheet)


func _paint() -> void:
	Paper.night = true
	for c: Node in _body.get_children():
		c.queue_free()
	var ch: Dictionary = Campaign.chapter_for(node_id)
	var num: String = str(ch.get("romanNumeral", ""))
	Paper.text(_body, ("CHAPTER %s  ·  %s" % [num, str(ch["title"]).to_upper()]) if num != "" else str(ch["title"]).to_upper(), "eyebrow", Paper.ink_soft())
	Paper.text(_body, str(_n["label"]), "display", Paper.ink())
	Paper.text(_body, str(_n.get("flavor", "")), "body", Paper.ink_soft(), true).add_theme_font_override("font", Kit.font("karla", 400))
	Paper.rule(_body)
	var det: Dictionary = Js.obj(_n.get("detail"))
	if _n["type"] == "raid" and _st != "locked":
		_boss_card(det)
		_err = Paper.text(_body, "", "small", Paper.red(), true)
		_footer(false)
		Paper.night = false
		_fit.call_deferred()
		return
	if _st == "locked":
		var why: String = ""
		for v: Dictionary in sea._campaign.view["views"]:
			if v["node"]["id"] == node_id:
				why = str(v.get("lockReason", ""))
		Paper.text(_body, "NOT YET", "eyebrow", Paper.red())
		Paper.text(_body, why, "body_strong", Paper.ink(), true)
		Paper.text(_body, str(det.get("description", "")), "small", Paper.ink_soft(), true)
		_footer(false)
		Paper.night = false
		_fit.call_deferred()
		return
	if _st == "cleared":
		Paper.text(_body, "DONE", "eyebrow", Color(0.5, 0.86, 0.58))
		Paper.text(_body, str(det.get("summary", _n.get("bridge", ""))), "body", Paper.ink(), true)
		var choice: Variant = Js.obj(sea._campaign.view.get("raidNodeChoices")).get(node_id)
		if choice != null:
			Paper.text(_body, "You chose: %s" % _choice_label(str(choice)), "small", Paper.ink_soft())
		_footer(not Js.list(_n.get("scene")).is_empty())
		Paper.night = false
		_fit.call_deferred()
		return
	Paper.text(_body, str(det.get("description", "")), "small", Paper.ink_soft(), true)
	match str(_n["type"]):
		"milestone": _toll()
		"shop": _cache()
		"event": _event()
		"dice": _dice()
		"dps_check": _gate()
		"muster": _muster()
		"class_pick": _class_pick()
		"berth": _berth()
		"spoils": _spoils()
		"puzzle": _puzzle()
	_err = Paper.text(_body, "", "small", Paper.red(), true)
	_footer(not Js.list(_n.get("scene")).is_empty())
	Paper.night = false
	_fit.call_deferred()


## The paper sized to what is on it (a picture keeps it tall enough to stand).
func _fit() -> void:
	if _sheet == null or not is_instance_valid(_body):
		return
	await get_tree().process_frame
	var h: float = clampf(_body.get_combined_minimum_size().y + 64.0, 440.0, minf(820.0, size.y - 120.0))
	_sheet.offset_top = -h / 2.0
	_sheet.offset_bottom = h / 2.0


func _footer(replay: bool) -> void:
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	h.alignment = BoxContainer.ALIGNMENT_END
	_body.add_child(h)
	if replay:
		var r: Pane.PaneButton = Paper.button("Read the scene again")
		r.pressed.connect(func() -> void:
			_sheet.visible = false
			var sc: StoryScene = StoryScene.new()
			sc.node = _n
			sc.allow_skip = true
			sc.cta = "Close"
			add_child(sc)
			await sc.finished
			_sheet.visible = true)
		h.add_child(r)
	var x: Pane.PaneButton = Paper.button("Close  Esc")
	x.pressed.connect(_close)
	h.add_child(x)


func _choice_label(id: String) -> String:
	for c: Dictionary in Js.list(Js.obj(_n.get("event")).get("choices")) + Js.list(Js.obj(_n.get("dice")).get("options")):
		if c["id"] == id:
			return str(c["label"])
	var it: Dictionary = _item(id)
	if not it.is_empty():
		return str(it["name"])
	return {"paid": "Paid the toll", "passed": "Blew the gate"}.get(id, id)


func _item(id: String) -> Dictionary:
	for it: Dictionary in Rules.data()["raidItems"]:
		if it["id"] == id:
			return it
	return {}


func _purse() -> float:
	return Js.num(sea.session.profile().get("doubloons"))


## Run an action; on a refusal say why and keep the sheet; otherwise refresh
## the water and `then` the result.
func _act(op: String, args: Array, then: Callable) -> void:
	var r: Variant = await sea.session.act(op, args)
	sea.session.persist()
	if r is Dictionary and (r as Dictionary).has("error"):
		if _err != null:
			_err.text = str(r["error"])
		Rumble.tap(10)
		return
	sea._campaign.refresh()
	sea._hud.refresh()
	then.call(r)


func _cleared_now(r: Variant) -> void:
	if r is Dictionary:
		_paid(r)
	_close()


# ── Each kind ─────────────────────────────────────────────────────────────────

## The boss card: who waits, what they carry, your best, and Normal or the
## Challenge (the harder run hanging off this one, open once it is beaten).
func _boss_card(det: Dictionary) -> void:
	Paper.text(_body, str(det.get("description", "")), "small", Paper.ink_soft(), true)
	var foes: Array = Js.list(det.get("enemies"))
	if not foes.is_empty():
		Paper.stat(_body, "The run", " · ".join(PackedStringArray(foes)), Paper.ink())
	var raid: Dictionary = Js.obj(Rules.data()["raids"].get(_n["raidId"]))
	var drops: Array = []
	for row: Dictionary in Js.list(raid.get("loot")):
		var rid: String = str(row["id"])
		if rid.begins_with("doubloons") or rid.begins_with("gems") or rid.begins_with("pack"):
			continue
		drops.append(str(row.get("label", rid)))
	if not drops.is_empty():
		Paper.stat(_body, "The crate may hold", ", ".join(PackedStringArray(drops)), GOLD)
	var rec: Dictionary = Js.obj(Js.obj(sea._campaign.view.get("raidRecords")).get(_n["raidId"]))
	var times: int = sea.session.store.clear_count(sea.session.uid, str(_n["raidId"]))
	if times > 0:
		var best: Variant = rec.get("yourBestMs")
		Paper.stat(_body, "Beaten", "%d time%s%s" % [times, "" if times == 1 else "s", ("  ·  best %s" % _clock(float(best))) if best != null else ""], Paper.ink())
	var ch: Dictionary = {}
	for n: Dictionary in Campaign.nodes():
		if Js.obj(n.get("sideBranch")).get("parentId") == node_id and n["type"] == "raid":
			ch = n
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	_body.add_child(h)
	var go: Pane.PaneButton = Paper.button("Set sail against %s" % _n["label"] if _st != "cleared" else "Take them on again", true)
	go.pressed.connect(func() -> void:
		var rid: String = str(_n["raidId"])
		_close()
		sea.start_battle(rid, node_id))
	h.add_child(go)
	if not ch.is_empty():
		var cst: String = str(sea._campaign.status.get(ch["id"], "locked"))
		var cb: Pane.PaneButton = Paper.button("Challenge" if cst != "locked" else "Challenge: beat the raid first")
		cb.disabled = cst == "locked"
		cb.tooltip_text = str(ch.get("flavor", ""))
		cb.pressed.connect(func() -> void:
			var crid: String = str(ch["raidId"])
			_close()
			sea.start_battle(crid, node_id))
		h.add_child(cb)


static func _clock(ms: float) -> String:
	var s2: int = int(ms / 1000.0)
	return "%d:%02d" % [s2 / 60, s2 % 60]


func _toll() -> void:
	var m: Dictionary = _n["milestone"]
	var amt: float = float(m["amount"])
	Paper.stat(_body, "Their price", "%s ⟡" % Js.thousands(amt), Paper.ink())
	Paper.stat(_body, "In your purse", "%s ⟡" % Js.thousands(_purse()), Paper.ink() if _purse() >= amt else Paper.red())
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	_body.add_child(h)
	var pay: Pane.PaneButton = Paper.button(("Pay %s ⟡" % Js.thousands(amt)) if _purse() >= amt else "Not enough aboard", _purse() >= amt)
	pay.disabled = _purse() < amt
	pay.pressed.connect(func() -> void:
		_act("claimMilestoneNode", [node_id], func(_r: Variant) -> void:
			Sound.chest(true)
			sea._hud.toast("Paid. The way through is open.")
			_close()))
	h.add_child(pay)


func _cache() -> void:
	Paper.text(_body, "TAKE ONE. THE OTHER STAYS.", "eyebrow", Paper.ink_soft())
	var held: Array = Js.list(sea.session.profile().get("raid_items"))
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	_body.add_child(row)
	for id: Variant in _n["choice"]["items"]:
		var it: Dictionary = _item(str(id))
		var card: VBoxContainer = VBoxContainer.new()
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.add_theme_constant_override("separation", 4)
		row.add_child(card)
		var pic: TextureRect = TextureRect.new()
		pic.texture = Skipper.tex(str(it.get("image", "")).trim_prefix("/"))
		pic.custom_minimum_size = Vector2(0, 120)
		pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		card.add_child(pic)
		Paper.text(card, str(it.get("name", id)), "body_strong", Paper.ink())
		Paper.text(card, str(it.get("rarity", "")).to_upper(), "eyebrow", Paper.ink_soft())
		Paper.text(card, str(it.get("description", "")), "small", Paper.ink_soft(), true)
		if held.has(id):
			Paper.text(card, "Already in the hold", "small", Color(0.5, 0.86, 0.58))
		var b: Pane.PaneButton = Paper.button("Take the %s" % it.get("name", id), _armed == id)
		b.pressed.connect(func() -> void:
			if _armed != id:
				_armed = str(id)
				_paint()
				return
			_act("claimQuartermasterChoice", [node_id, id], func(_r: Variant) -> void:
				Sound.chest(true)
				sea._hud.toast("%s is yours." % it.get("name", id))
				_close()))
		card.add_child(b)
	Paper.text(_body, "Press once to choose, again to take it.", "small", Paper.ink_faint())


func _outcome_pill(oc: Dictionary) -> String:
	var bits: Array = []
	var d: float = Js.num(oc.get("doubloons", oc.get("amount") if oc.get("type") == "doubloons" else 0))
	if d != 0.0:
		bits.append("%s%s ⟡" % ["+" if d > 0 else "", Js.thousands(d)])
	var x: float = Js.num(oc.get("navXp", oc.get("amount") if oc.get("type") == "navXp" else 0))
	if x != 0.0:
		bits.append("+%s Nav XP" % Js.thousands(x))
	return "  ·  ".join(PackedStringArray(bits)) if not bits.is_empty() else "Nothing paid"


func _event() -> void:
	Paper.text(_body, "MAKE THE CALL", "eyebrow", Paper.ink_soft())
	for c: Dictionary in _n["event"]["choices"]:
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 2)
		_body.add_child(v)
		var h: HBoxContainer = HBoxContainer.new()
		v.add_child(h)
		var l: Label = Paper.text(h, str(c["label"]), "body_strong", Paper.ink())
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		Paper.text(h, _outcome_pill(c["outcome"]), "small", GOLD)
		Paper.text(v, str(c.get("description", "")), "small", Paper.ink_soft(), true)
		var cid: String = str(c["id"])
		var b: Pane.PaneButton = Paper.button(str(c["label"]) if _armed != cid else "Press again to commit", _armed == cid)
		b.size_flags_horizontal = Control.SIZE_SHRINK_END
		b.pressed.connect(func() -> void:
			if _armed != cid:
				_armed = cid
				_paint()
				return
			_act("pickRaidEventChoice", [node_id, cid], func(r: Variant) -> void:
				var paid: Dictionary = {}
				if Js.num(r.get("newExpeditionXp")) > 0.0:
					paid["navXpDelta"] = c["outcome"]["amount"]
				if c["outcome"]["type"] == "doubloons":
					paid["doubloonsDelta"] = c["outcome"]["amount"]
				_cleared_now(paid)))
		v.add_child(b)


func _dice() -> void:
	var d: Dictionary = _n["dice"]
	var nav: int = Loadout.nav_level_from_xp(Js.num(sea.session.profile().get("expedition_xp")))
	var bonus: int = mini(int(d["maxBonus"]), int(floor(nav / float(d["bonusPerLevels"]))))
	Paper.text(_body, "THROW THE BONES  ·  d20 + %d (Navigation)" % bonus, "eyebrow", Paper.ink_soft())
	for o: Dictionary in d["options"]:
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 2)
		_body.add_child(v)
		var h: HBoxContainer = HBoxContainer.new()
		v.add_child(h)
		var l: Label = Paper.text(h, "%s  ·  needs %d" % [o["label"], int(o["dc"])], "body_strong", Paper.ink())
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var odds: int = clampi(21 - (int(o["dc"]) - bonus), 0, 20) * 5
		Paper.text(h, "%d%% to win" % odds, "small", GOLD)
		Paper.text(v, str(o.get("description", "")), "small", Paper.ink_soft(), true)
		Paper.text(v, "Win %s   ·   Miss %s" % [_outcome_pill(o["win"]), _outcome_pill(o["miss"])], "small", Paper.ink_faint())
		var need: float = Js.num(o.get("requiresDoubloons"))
		var oid: String = str(o["id"])
		var b: Pane.PaneButton = Paper.button("Throw" if need <= _purse() else "Need %s ⟡ to risk it" % Js.thousands(need), false)
		b.disabled = need > _purse()
		b.size_flags_horizontal = Control.SIZE_SHRINK_END
		b.pressed.connect(func() -> void:
			_act("rollDiceNode", [node_id, oid], func(r: Variant) -> void:
				_roll_show(r, o)))
		v.add_child(b)


## The throw: the die tumbles onto the rules' roll.
func _roll_show(r: Dictionary, o: Dictionary) -> void:
	for c: Node in _body.get_children():
		c.queue_free()
	Paper.night = true
	Paper.text(_body, str(o["label"]).to_upper(), "eyebrow", Paper.ink_soft())
	var die: DiceFace = DiceFace.new()
	die.custom_minimum_size = Vector2(0, 200)
	die.final = int(r["roll"])
	_body.add_child(die)
	var line: Label = Paper.text(_body, "", "display", Paper.ink())
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Paper.night = false
	await die.landed
	Paper.night = true
	line.text = "%d + %d = %d  ·  %s" % [int(r["roll"]), int(r["bonus"]), int(r["total"]), "WON" if r["success"] else "MISSED"]
	line.add_theme_color_override("font_color", Color(0.5, 0.86, 0.58) if r["success"] else Paper.red())
	var said: String = str(o.get("winText" if r["success"] else "missText", ""))
	if said != "":
		Paper.text(_body, said, "body", Paper.ink_soft(), true)
	Paper.text(_body, _outcome_pill({ "doubloons": r["doubloonsDelta"], "navXp": r["navXpDelta"] }), "body_strong", GOLD)
	var x: Pane.PaneButton = Paper.button("Done", true)
	x.size_flags_horizontal = Control.SIZE_SHRINK_END
	x.pressed.connect(_close)
	_body.add_child(x)
	Paper.night = false
	if r["success"]:
		Sound.perfect()
	else:
		Sound.slack()


func _gate() -> void:
	var dc: Dictionary = _n["dpsCheck"]
	var pv: Dictionary = RulesApi.run(sea.session.store, sea.session.uid, "getDpsCheckPreview", [node_id])
	Paper.stat(_body, "Your straight hit", "%d to %d%s" % [int(pv["rangeMin"]), int(pv["rangeMax"]), ("  ×%.2f" % float(pv["mult"])) if float(pv["mult"]) != 1.0 else ""], Paper.ink())
	Paper.stat(_body, "The gate gives at", "%d" % int(dc["threshold"]), Paper.ink())
	var pc: float = float(pv["passChance"])
	var tier: String = "Likely" if pc >= 75 else ("Even" if pc >= 45 else ("Risky" if pc >= 20 else "Long shot"))
	Paper.stat(_body, "Your odds", "%d%%  ·  %s" % [int(pc), tier], GOLD)
	Paper.text(_body, "One shot, no aiming. Short of it and the gate holds: nothing is charged, and you wake at the Gunwharf.", "small", Paper.ink_faint(), true)
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	_body.add_child(h)
	var fire: Pane.PaneButton = Paper.button("Fire one shot", true)
	fire.pressed.connect(func() -> void:
		_act("resolveDpsCheck", [node_id, "shot"], func(r: Variant) -> void:
			Sound.cannon(true)
			if r["outcome"] == "passed":
				sea._hud.toast("%d damage. The gate blows open." % int(r["damage"]))
				_close()
			else:
				sea._hud.toast("%d damage. The gate holds, and so do their guns." % int(r["damage"]))
				_close()
				sea.warp_to_gunwharf()))
	h.add_child(fire)
	var cost: float = float(dc["payCost"])
	var pay: Pane.PaneButton = Paper.button("Pay %s ⟡ to pass" % Js.thousands(cost))
	pay.disabled = _purse() < cost
	pay.pressed.connect(func() -> void:
		_act("resolveDpsCheck", [node_id, "pay"], func(_r: Variant) -> void:
			sea._hud.toast("Paid. They wave you through.")
			_close()))
	h.add_child(pay)


func _muster() -> void:
	var rep: Dictionary = Campaign.muster_report(_n["muster"], Campaign.muster_party(sea.session.store, sea.session.uid))
	Paper.text(_body, "THE CLERK'S LEDGER", "eyebrow", Paper.ink_soft())
	for row: Dictionary in rep["rows"]:
		var h: HBoxContainer = HBoxContainer.new()
		h.add_theme_constant_override("separation", 10)
		_body.add_child(h)
		Paper.text(h, "✓" if row["ok"] else "✗", "body_strong", Color(0.5, 0.86, 0.58) if row["ok"] else Paper.red())
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 0)
		h.add_child(v)
		Paper.text(v, str(row["label"]), "body_strong", Paper.ink())
		if not (row["met"] as Array).is_empty():
			Paper.text(v, ", ".join(PackedStringArray(row["met"])), "small", Paper.ink_soft(), true)
	if rep["passed"]:
		var b: Pane.PaneButton = Paper.button("Stand for inspection", true)
		b.size_flags_horizontal = Control.SIZE_SHRINK_END
		b.pressed.connect(func() -> void:
			_act("standForMuster", [node_id], func(_r: Variant) -> void:
				sea._hud.toast("The clerk closes his ledger. The line parts.")
				_close()))
		_body.add_child(b)
	else:
		Paper.text(_body, "The clerk turns you back. Fix the party at the Gunwharf and come alongside again.", "small", Paper.red(), true)


func _class_pick() -> void:
	var picks: Dictionary = Js.obj(sea.session.profile().get("ship_classes"))
	var opts: Array = Js.list(_n["classPick"].get("options")) if _n["classPick"].get("options") != null else Campaign.offered_classes(picks)
	var defs: Dictionary = Rules.data()["shipClasses"]["classes"]
	Paper.text(_body, "PICK A CLASS  ·  THIS IS PERMANENT", "eyebrow", Paper.ink_soft())
	var grid: GridContainer = GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_child(grid)
	for id: Variant in opts:
		var c: Dictionary = defs.get(id, {})
		var v: VBoxContainer = VBoxContainer.new()
		v.custom_minimum_size = Vector2(280, 0)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 3)
		grid.add_child(v)
		var col: Color = Color(str(c.get("color", "#d8b26a")))
		Paper.text(v, str(c.get("name", id)), "body_strong", col)
		Paper.text(v, str(c.get("tagline", "")), "small", Paper.ink(), true)
		for b: Dictionary in Js.list(c.get("bullets")):
			Paper.text(v, ("+  " if b["positive"] else "−  ") + str(b["label"]).trim_prefix("+").trim_prefix("−"), "small", Color(0.5, 0.86, 0.58) if b["positive"] else Paper.red())
		var cid: String = str(id)
		var btn: Pane.PaneButton = Paper.button("Sail as the %s" % c.get("name", id) if _armed == cid else "Choose", _armed == cid)
		btn.pressed.connect(func() -> void:
			if _armed != cid:
				_armed = cid
				_paint()
				return
			_act("pickShipClass", [node_id, cid], func(_r: Variant) -> void:
				Sound.horn()
				sea._hud.toast("You sail as the %s." % c.get("name", id))
				_close()))
		v.add_child(btn)


func _berth() -> void:
	var price: float = Js.num(Js.obj(_n.get("berth")).get("price"))
	var what: String = "a sixth item mount" if _n.get("armory") != null else "a sixth crew berth"
	Paper.text(_body, "%s ⟡ buys %s, for good." % [Js.thousands(price), what], "body_strong", Paper.ink(), true)
	Paper.text(_body, "The yard does the cutting at the Gunwharf.", "small", Paper.ink_soft(), true)
	var b: Pane.PaneButton = Paper.button("Terms heard", true)
	b.size_flags_horizontal = Control.SIZE_SHRINK_END
	b.pressed.connect(func() -> void:
		_act("markStoryNodeRead", [node_id], func(_r: Variant) -> void: _close()))
	_body.add_child(b)


func _spoils() -> void:
	var p: Dictionary = sea.session.profile()
	var free: Variant = p.get("finn_spoil_free")
	var price: float = Campaign.SPOILS_PRICE
	for side: Array in [["fishing", "The Deep Reel", "A second special slot on your fishing rig. Only The Primeval Eye seats in it."], ["nav", "The Sixth Mount", "One more raid item on your hull. Only The Primeval Maw mounts on it."]]:
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 2)
		_body.add_child(v)
		Paper.text(v, side[1], "body_strong", Paper.ink())
		Paper.text(v, side[2], "small", Paper.ink_soft(), true)
		var sid: String = side[0]
		var have: bool = free == sid or p.get("finn_spoil_paid") == sid
		if have:
			Paper.text(v, "Aboard", "small", Color(0.5, 0.86, 0.58))
			continue
		var b: Pane.PaneButton = Paper.button("Take it" if free == null else "Buy it for %s ⟡" % Js.thousands(price), free == null)
		b.size_flags_horizontal = Control.SIZE_SHRINK_END
		b.pressed.connect(func() -> void:
			_act("chooseSpoil" if free == null else "buySpoil", [sid], func(r: Variant) -> void:
				if r is Dictionary and r.get("ok") == false:
					_err.text = str(r.get("error", ""))
					return
				Sound.chest(true)
				_paint()))
		v.add_child(b)


func _puzzle() -> void:
	var pz: Dictionary = _n["puzzle"]
	Paper.stat(_body, "Cracking it pays", "+%s Navigation XP" % Js.thousands(Js.num(pz.get("rewardNavXp"))), GOLD)
	var b: Pane.PaneButton = Paper.button("Crack it", true)
	b.size_flags_horizontal = Control.SIZE_SHRINK_END
	b.pressed.connect(func() -> void:
		var board: PuzzleBoard = PuzzleBoard.make(pz)
		if board == null:
			_err.text = "This board is not in this build yet."
			return
		_sheet.visible = false
		add_child(board)
		var solved: bool = await board.finished
		if not solved:
			_sheet.visible = true
			return
		_act("solvePuzzleNode", [node_id], func(_r: Variant) -> void:
			_cleared_now({ "navXpDelta": pz.get("rewardNavXp", 0) })))
	_body.add_child(b)


## A d20 tumbling to its face.
class DiceFace:
	extends Control
	signal landed
	var final: int = 20
	var _shown: int = 1
	var _t: float = 0.0
	var _done: bool = false

	func _process(delta: float) -> void:
		_t += delta
		if not _done:
			if fmod(_t, 0.07) < delta:
				_shown = randi_range(1, 20)
				if randf() < 0.3:
					Sound.plip()
			if _t > 1.3:
				_shown = final
				_done = true
				Rumble.tap(16)
				landed.emit()
		queue_redraw()

	func _draw() -> void:
		var c: Vector2 = size / 2.0
		var spin: float = 0.0 if _done else _t * 9.0
		var bounce: float = 0.0 if _done else absf(sin(_t * 7.0)) * -26.0 * (1.0 - _t / 1.3)
		var pts: PackedVector2Array = PackedVector2Array()
		for k: int in 6:
			pts.append(c + Vector2(0, bounce) + Vector2.from_angle(spin + TAU * k / 6.0 - PI / 2.0) * 78.0)
		draw_colored_polygon(pts, Color(0.92, 0.88, 0.8))
		pts.append(pts[0])
		draw_polyline(pts, Color(0.3, 0.2, 0.1), 4.0, true)
		var f: Font = Kit.font("cinzel", 900)
		var s: String = str(_shown)
		var sz: Vector2 = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 54)
		draw_string(f, c + Vector2(-sz.x / 2.0, bounce + 19), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 54, Color(0.2, 0.12, 0.06) if _shown != 20 else Color(0.75, 0.5, 0.1))
