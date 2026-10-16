extends RefCounted
## Part of BattleStage (game/battle_stage.gd): together, following the founder's
## table: acting on it, the state pump and each phase, the deck while the crew
## decide, the crossfire hint, and Go on without them.
## Split out of game/battle_stage.gd on 2026-10-10 for size. Static helpers
## taking the stage (bs) first; every piece of the fight's state stays on it.

const BattleStageDeck = preload("res://game/battle_stage_deck.gd")
const BattleStagePlayback = preload("res://game/battle_stage_playback.gd")
const BattleStageDive = preload("res://game/battle_stage_dive.gd")


static func _act(bs: BattleStage, args: Array) -> Variant:
	if bs.gauntlet != "":
		var gt: GauntletTable = bs.table as GauntletTable
		if gt != null and gt.solo != null:
			return gt.handle(bs.my_key, bs.sea.session, args)
		return await bs.sea.session.act("gauntletTable", args)
	return await bs.sea.session.act("raidTable", args)


## GO ON WITHOUT THEM, one home for raids and dives alike (the walkthrough,
## 2026-10-11: in a dive it sat under the sheet and could not be pressed; in a
## raid it was a day-paper button over a captain's plate): a row in the
## bottom bar, "Waiting on Ben" beside the button, flat night style, kept
## above any sheet (_nudge_tick raises it). The captain held up sees the same
## row with "The crew are waiting on you" and no button.
static func _nudge_build(bs: BattleStage) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 14)
	row.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	row.offset_left = -360
	row.offset_right = 360
	row.offset_top = -BattleStage.BAR + 16
	row.offset_bottom = -16
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.visible = false
	bs._nudge_l = Label.new()
	bs._nudge_l.add_theme_font_override("font", Kit.font("karla", 800))
	bs._nudge_l.add_theme_font_size_override("font_size", 14)
	bs._nudge_l.add_theme_color_override("font_color", BattleLook.CREAM)
	bs._nudge_l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(bs._nudge_l)
	bs._nudge_btn = BattleLook.night_button("Go on without them")
	bs._nudge_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bs._nudge_btn.tooltip_text = "Anyone who has not chosen yet is skipped and the crew carry on (at a breather their vote does not count)."
	bs._nudge_btn.pressed.connect(func() -> void:
		bs._nudge_btn.visible = false
		bs._wait_ms = Time.get_ticks_msec()
		var r: Variant = await _act(bs, ["nudge"])
		if r is Dictionary and (r as Dictionary).has("error"):
			bs._log_line(str(r["error"])))
	row.add_child(bs._nudge_btn)
	bs._nudge_row = row
	bs.add_child(row)


## The row's state each frame: shown with the button once the choice has
## waited AFK_WAIT on someone else; shown with the warning to the captain
## being waited on after HOLD_WARN; else hidden. Kept the last child, so no
## sheet (the dive's overlay moves itself to the top as it paints) covers it.
const HOLD_WARN: float = 20.0


static func _nudge_tick(bs: BattleStage) -> void:
	if bs._nudge_row == null:
		return
	var waited: float = float(Time.get_ticks_msec() - bs._wait_ms) / 1000.0
	var p: Dictionary = {} if bs._gone else _pending(bs)
	var others: Array = Js.list(p.get("others"))
	var show_btn: bool = not others.is_empty() and p.get("mine", false) == true and waited >= RaidTable.AFK_WAIT
	var warn: bool = not show_btn and p.get("me", false) == true and p.get("crew_in", false) == true and waited >= HOLD_WARN
	bs._nudge_row.visible = show_btn or warn
	if not bs._nudge_row.visible:
		return
	bs._nudge_btn.visible = show_btn
	bs._nudge_l.text = ("Waiting on %s" % BattleLook.join_names(others)) if show_btn else "The crew are waiting on you"
	bs._nudge_l.add_theme_color_override("font_color", BattleLook.CREAM if show_btn else Color(Kit.GOLD_HI, 0.7 + 0.3 * sin(bs._t * 3.0)))
	if bs._nudge_row.get_index() != bs.get_child_count() - 1:
		bs.move_child(bs._nudge_row, -1)


## Who the choice in front of the crew waits on: { mine: you have answered,
## me: you have not, others: the names of the rest still to answer, crew_in:
## someone else has answered }. Empty when nothing is being waited on.
static func _pending(bs: BattleStage) -> Dictionary:
	var st: Dictionary = bs._latest
	var ph: String = str(st.get("phase", ""))
	if Js.list(st.get("members")).size() < 2:
		return {}
	var gone: Dictionary = Js.obj(st.get("gone"))
	if ph == "draft":
		var d: Dictionary = Js.obj(st.get("draft"))
		var order: Array = Js.list(d.get("order"))
		var i: int = int(Js.num(d.get("turn")))
		if i >= order.size() or gone.has(str(order[i])):
			return {}
		var tk: String = str(order[i])
		if tk == bs.my_key:
			return { "me": true, "crew_in": true, "others": [] }
		return { "mine": true, "others": [_name_of(bs, tk)] }
	var given: Dictionary
	var keys: Array = []
	match ph:
		"plan", "flares", "tide":
			given = Js.obj(st.get({ "plan": "plans", "flares": "flareRes", "tide": "tidePicks" }[ph]))
			for s: Dictionary in Battle.alive(Js.obj(st.get("b"))):
				keys.append(str(s.get("key", "")))
		"curse", "shrine", "fence", "marks", "contract":
			var sub: Dictionary = Js.obj(st.get("job" if ph == "contract" else ph))
			given = Js.obj(sub.get({ "curse": "acks", "fence": "done", "contract": "votes" }.get(ph, "picks")))
		"breather":
			given = Js.obj(st.get("votes"))
		"jobResult":
			given = Js.obj(st.get("acks"))
		_:
			return {}
	if keys.is_empty():
		var caps: Dictionary = Js.obj(st.get("caps"))
		for k: Variant in caps:
			if str(Js.obj(caps[k]).get("out", "")) == "":
				keys.append(str(k))
	var others: Array = []
	var crew_in: bool = false
	for k2: String in keys:
		if k2 == bs.my_key or gone.has(k2):
			continue
		if given.has(k2):
			crew_in = true
		else:
			others.append(_name_of(bs, k2))
	return { "mine": given.has(bs.my_key), "me": keys.has(bs.my_key) and not given.has(bs.my_key), "others": others, "crew_in": crew_in }


## You have answered the choice in front of the crew, and someone still in
## has not.
static func _held_up(bs: BattleStage) -> bool:
	var p: Dictionary = _pending(bs)
	return p.get("mine", false) == true and not Js.list(p.get("others")).is_empty()


## A captain's name by key (their seat in the line).
static func _name_of(bs: BattleStage, key: String) -> String:
	var si: int = bs._seat_index(key)
	return str(bs.b["seats"][si].get("name", "A captain")) if si >= 0 else "A captain"


## What the line's state says happened to its captains since the last one: a
## game dropped (greyed AWAY on its plate; "Ben's game dropped. The line sails
## on without them.") or came back ("Ben is back in the line."), and a nudge
## that went on without THIS captain ("The crew went on without you").
static func _notes(bs: BattleStage, st: Dictionary) -> void:
	var dropped: Dictionary = Js.obj(st.get("dropped"))
	for k: Variant in dropped:
		if not bs._dropped_seen.has(k) and str(k) != bs.my_key:
			bs._log_line("%s's game dropped. The line sails on without them." % _name_of(bs, str(k)))
	for k2: Variant in bs._dropped_seen:
		if not dropped.has(k2) and str(k2) != bs.my_key:
			bs._log_line("%s is back in the line." % _name_of(bs, str(k2)))
			bs._say("%s is back" % _name_of(bs, str(k2)))
	bs._dropped_seen = dropped.duplicate()
	var af: Dictionary = Js.obj(st.get("afk"))
	var n: int = int(Js.num(af.get("n")))
	if n != bs._afk_seen:
		bs._afk_seen = n
		if Js.list(af.get("keys")).has(bs.my_key):
			var why: String = str({ "plan": "your ship took the plain order", "flares": "the flares came through", "tide": "the tide took its last choice",
				"breather": "your vote did not count", "draft": "your pick passed", "curse": "the curse is borne", "shrine": "you walked past the shrine",
				"fence": "the Fence is left", "marks": "you took the shark Mark", "contract": "you walked away from the job" }.get(str(af.get("what", "")), ""))
			bs._say("The crew went on without you")
			bs._log_line("%s went on without you%s." % [str(af.get("by", "The crew")), (": " + why) if why != "" else ""])


## Every state the table sends: each phase is handled once, in order.
static func _pump(bs: BattleStage, st: Dictionary) -> void:
	bs._latest = st
	bs._scene_follow(st)
	if not bs._gone:
		_notes(bs, st)
	var wt: String = "%s:%s:%s" % [st.get("phase", ""), str(st.get("seq", "")), str(Js.obj(st.get("draft")).get("turn", ""))]
	if wt != bs._wait_tag:
		bs._wait_tag = wt
		bs._wait_ms = Time.get_ticks_msec()
	var ph0: String = str(st.get("phase", ""))
	# A sheet's own updates go straight to it; a NEW sheet waits for its moment.
	if bs._ov != null and not bs._gone and ph0 != "playing" and (not GauntletOverlay.PHASES.has(ph0) or ph0 == bs._ov_phase):
		bs._ov.show_state(st)
	if bs._pumping or bs._gone:
		return
	bs._pumping = true
	while not bs._gone:
		var cur: Dictionary = bs._latest
		var tag: String = "%s:%d" % [cur.get("phase", ""), int(Js.num(cur.get("seq")))]
		if tag == bs._handled:
			break
		bs._handled = tag
		await _phase(bs, cur)
	bs._pumping = false
	if not bs._gone and str(bs._latest.get("phase", "")) == "plan":
		bs.b = (bs._latest["b"] as Dictionary).duplicate(true)
		if Js.obj(bs._latest.get("plans")).has(bs.my_key):
			_waiting(bs)
		else:
			if not bs._busy:
				BattleStageDeck._paint_actions(bs)
			_xfire_hint(bs)


static func _alive_me(bs: BattleStage) -> bool:
	return Battle.alive(bs.b).has(bs.b["seats"][bs.me])


static func _phase(bs: BattleStage, cur: Dictionary) -> void:
	match str(cur.get("phase", "")):
		"playing":
			# The hulls show what they showed until the round says otherwise.
			for i: int in (bs.b["seats"] as Array).size():
				bs._shown_hp[i] = float(bs.b["seats"][i]["hp"])
			var fs1: Array = Battle.foes(bs.b)
			for j1: int in fs1.size():
				bs._shown_hp["e%d" % j1] = float(fs1[j1]["hp"])
			bs.b = (cur["b"] as Dictionary).duplicate(true)
			bs._busy = true
			BattleStageDeck._clear_deck(bs)
			BattleStageDeck._deck_dim(bs, true)
			await BattleStagePlayback._play_events(bs, Js.list(cur.get("ev")))
			bs._strip_lit = -99
			bs._shown_hp.clear()
			var seq: int = int(Js.num(cur.get("seq")))
			var mine: Dictionary = bs.b["seats"][bs.me]
			if bs.gauntlet != "" and mine.get("sunk", false):
				var cp: Dictionary = Js.obj(Js.obj(cur.get("caps")).get(bs.my_key))
				if str(cp.get("out", "")) == "drowned":
					# Hardcore: down with the crew; the dive goes on without her.
					bs._gone = true
					await _act(bs, ["played", int(Js.num(cur.get("seq")))])
					bs._say("Your ship is going down")
					var dead: Dictionary = cur.duplicate()
					dead["phase"] = "dead"
					dead["pays"] = { bs.my_key: cp.get("paid", {}) }
					dead["seq"] = -1
					bs._ov.acted.connect(func(_a: Array) -> void: bs._end(false), CONNECT_ONE_SHOT)
					if bs._moments != null:
						await bs._moments.drowned([bs.sea._boat])
					bs._ov_phase = "dead"
					bs._ov.show_state(dead)
					return
				bs._log_line("Your ship is down. If the crew win this fight, she is towed along.")
			elif mine.get("sunk", false) or mine.get("fled", false):
				bs._gone = true
				await _act(bs, ["played", seq])
				await _act(bs, ["out"])
				if mine.get("fled", false):
					await bs._got_away()
				else:
					await bs._lost()
				return
			_act(bs, ["played", seq])
			if str(cur.get("after", "")) == "end":
				bs._gone = true
				match str(cur.get("result", "")):
					"won":
						bs._end(true)
					"fled":
						await bs._got_away()
					_:
						await bs._lost()
		"plan":
			bs._ov_phase = ""
			bs.b = (cur["b"] as Dictionary).duplicate(true)
			bs._plan_len = float(Js.nz(cur.get("left"), RaidTable.PLAN))
			bs._plan_until = bs._t + bs._plan_len
			if _alive_me(bs) and not Js.obj(cur.get("plans")).has(bs.my_key):
				BattleStageDeck._await_plan(bs)
				_xfire_hint(bs)
			else:
				_waiting(bs)
		"flares":
			bs.b = (cur["b"] as Dictionary).duplicate(true)
			if _alive_me(bs):
				await BattleStagePlayback._flares(bs)
			_waiting(bs)
		"tide":
			if _alive_me(bs) and not Js.obj(cur.get("tidePicks")).has(bs.my_key):
				var tide: Dictionary = Js.obj(cur.get("tide"))
				var rp: Variant = Js.obj(Rules.data().get("tides")).get("reprieve")
				await BattleStagePlayback._tide(bs, tide, "A REPRIEVE" if tide == rp else "A TIDE TURNS")
			_waiting(bs)
		"curse", "draft", "shrine", "fence", "contract", "jobResult", "marks", "breather", "haul", "dead", "held":
			bs.b = (cur["b"] as Dictionary).duplicate(true)
			bs._busy = true
			BattleStageDeck._clear_deck(bs)
			BattleStageDeck._deck_dim(bs, true)
			var ph: String = str(cur.get("phase", ""))
			await BattleStageDive._stage(bs, cur)
			bs._ov_phase = ph
			if bs._ov != null and not bs._gone:
				bs._ov.show_state(bs._latest if str(bs._latest.get("phase", "")) == ph else cur)
		"done", "idle":
			bs._gone = true
			bs._end(str(cur.get("result", "")) in ["won", "banked"])


## The deck while the crew decide: who is still choosing.
static func _waiting(bs: BattleStage) -> void:
	if bs._pumping and str(bs._latest.get("phase", "")) == "playing":
		return
	bs._busy = true
	BattleStageDeck._clear_deck(bs)
	var names: Array = []
	var plans: Dictionary = Js.obj(bs._latest.get("plans"))
	var field: String = { "plan": "plans", "flares": "flareRes", "tide": "tidePicks" }.get(str(bs._latest.get("phase", "")), "plans")
	var given: Dictionary = Js.obj(bs._latest.get(field))
	for st: Dictionary in Battle.alive(bs.b):
		if st.get("key") != bs.my_key and not given.has(st.get("key")):
			names.append(str(st["name"]))
	var line: String = "Orders given. Waiting on %s." % BattleLook.join_names(names) if not names.is_empty() else "Orders given. The round is coming."
	if not _alive_me(bs):
		# Sunk in a dive the crew may yet win: towed along (told while waiting).
		line = "You are out of this fight. If the crew win, you are towed along." if bs.gauntlet != "" and bs.b["seats"][bs.me].get("sunk", false) else "You are out of this fight. The crew fight on."
	var lb: Label = Kit.text(bs._deck_box, line, "body_strong", BattleLook.CREAM)
	lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lb.size_flags_vertical = Control.SIZE_EXPAND_FILL
	lb.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if plans.is_empty() and str(bs._latest.get("phase", "")) != "plan":
		lb.text = "The crew are seeing to it."
	BattleStageDeck._deck_dim(bs, false)


## While choosing: a crewmate's critical already in is half a crossfire.
static func _xfire_hint(bs: BattleStage) -> void:
	if bs.table == null or not _alive_me(bs) or Battle.alive(bs.b).size() < 2:
		return
	var plans: Dictionary = Js.obj(bs._latest.get("plans"))
	if plans.has(bs.my_key):
		return
	var names: Array = []
	for st: Dictionary in Battle.alive(bs.b):
		var pl: Dictionary = Js.obj(plans.get(st.get("key")))
		if st.get("key") != bs.my_key and str(pl.get("aim", "")) == "critical" and str(pl.get("action", "")) in ["fire", "volley", "mega"]:
			names.append([str(st["name"]), Battle.target_of(bs.b, pl)])
	if not names.is_empty():
		if bs._field():
			var fe2: Dictionary = Battle.foes(bs.b)[maxi(0, int(names[0][1]))]
			bs._log_line("%s landed a critical on %s. Land one on it too for a crossfire." % [names[0][0], fe2["name"]])
		else:
			bs._log_line("%s landed a critical. Land one too for a crossfire." % " and ".join(PackedStringArray(names.map(func(n: Array) -> String: return str(n[0])))))
	else:
		bs._log_line("Crossfire: two or more criticals in one round hit harder.")
