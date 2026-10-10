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


static func _nudge_build(bs: BattleStage) -> void:
	bs._nudge_btn = Kit.button("Go on without them", "secondary", "small")
	bs._nudge_btn.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	bs._nudge_btn.offset_left = -130
	bs._nudge_btn.offset_right = 130
	bs._nudge_btn.offset_top = BattleStage.BAR + 120
	bs._nudge_btn.offset_bottom = BattleStage.BAR + 160
	bs._nudge_btn.tooltip_text = "Anyone who has not chosen yet takes the default and the crew carry on."
	bs._nudge_btn.visible = false
	bs._nudge_btn.pressed.connect(func() -> void:
		bs._nudge_btn.visible = false
		bs._wait_ms = Time.get_ticks_msec()
		var r: Variant = await _act(bs, ["nudge"])
		if r is Dictionary and (r as Dictionary).has("error"):
			bs._log_line(str(r["error"])))
	bs.add_child(bs._nudge_btn)


## You have answered the choice in front of the crew, and someone still in
## has not.
static func _held_up(bs: BattleStage) -> bool:
	var st: Dictionary = bs._latest
	var ph: String = str(st.get("phase", ""))
	if Js.list(st.get("members")).size() < 2:
		return false
	var gone: Dictionary = Js.obj(st.get("gone"))
	if ph == "draft":
		var d: Dictionary = Js.obj(st.get("draft"))
		var order: Array = Js.list(d.get("order"))
		var i: int = int(Js.num(d.get("turn")))
		return i < order.size() and str(order[i]) != bs.my_key and not gone.has(str(order[i]))
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
			return false
	if keys.is_empty():
		var caps: Dictionary = Js.obj(st.get("caps"))
		for k: Variant in caps:
			if str(Js.obj(caps[k]).get("out", "")) == "":
				keys.append(str(k))
	if not given.has(bs.my_key):
		return false
	for k2: String in keys:
		if k2 != bs.my_key and not given.has(k2) and not gone.has(k2):
			return true
	return false


## Every state the table sends: each phase is handled once, in order.
static func _pump(bs: BattleStage, st: Dictionary) -> void:
	bs._latest = st
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
	var line: String = "Orders given. Waiting on %s." % ", ".join(PackedStringArray(names)) if not names.is_empty() else "Orders given. The round is coming."
	if not _alive_me(bs):
		line = "You are out of this fight. The crew fight on."
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
