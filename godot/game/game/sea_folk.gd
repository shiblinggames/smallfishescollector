extends RefCounted
## Part of Sea (game/sea.gd): THE PEOPLE ON THE WATER. The regulars and Yoon,
## the strangers round the boat, the buyers' and traders' panels, Finn, and
## the crew in a Charter (their ships, their looks, their votes, and what
## this captain is doing, for them). The state (who stands where, who was
## dealt with) stays on the Sea.
## Split out of game/sea.gd on 2026-10-10 for size.


# ── The crew ───────────────────────────────────────────────────────────────────

## CREWMATE STATUS (Kong, 2026-10-06): in a raid (which fight), diving (how
## deep), ashore, fishing (which water), away (nothing pressed for three
## minutes), or where she is sailing.
static func status_text(o: Sea) -> String:
	var at: Vector2 = o._boat.position
	for c: Node in o._hud_layer.get_children():
		if c is BattleStage and not (c as BattleStage).is_queued_for_deletion():
			var bs: BattleStage = c
			if bs.gauntlet != "":
				var dep: int = int(Js.num(bs.b.get("depth")))
				return "diving  ·  depth %d" % dep if dep > 0 else "diving"
			var raid: Dictionary = Battle.raid_def(bs.raid_id)
			if raid.is_empty() or bs.b.is_empty():
				return "in a fight"
			return "in a raid  ·  fight %d of %d" % [int(Js.num(bs.b.get("fight"))) + 1, int(Battle.fight_at(raid, 0)["of"])]
	if o._input_ms > 0 and Time.get_ticks_msec() - o._input_ms > 180000:
		return "away"
	var port: Dictionary = Chart.berth_at(at)
	if o._room_layer.get_child_count() > 0:
		return "ashore at %s" % port["name"] if not port.is_empty() else "ashore"
	if o._hud.phase != "idle":
		var w: Dictionary = Chart.water_at(at)
		return "fishing  ·  %s" % w["name"] if not w.is_empty() else "fishing"
	if not port.is_empty():
		return "in port at %s" % port["name"]
	if North.is_north(at):
		if at.distance_to(North.EXP_ORIGIN) <= North.EXP_EDGE:
			return "in the anchorage"
		var ch: Dictionary = ChapterLook.at(at)
		if not ch.is_empty() and float(ch["k"]) > 0.5:
			return "sailing  ·  %s" % Charting.bay_name(str(ch["bay"]))
		return "sailing north"
	var w2: Dictionary = Chart.water_at(at)
	return "sailing  ·  %s" % w2["name"] if not w2.is_empty() else "sailing"


## A Charter's crew line, wired to the sea: their ships and looks, one
## leaving, the votes, their pings and the waters they fish.
static func join_crew(o: Sea) -> void:
	o.net.mate_boat.connect(o._on_mate_boat)
	o.net.mate_look.connect(o._on_mate_look)
	o.net.mate_left.connect(func(k: String) -> void:
		if o._mates.has(k):
			var gone: Shipmate = o._mates[k]
			o._hud.toast("%s has left port" % gone.mate_name)
			gone.leave()
			o._mates.erase(k))
	o._send_look()
	o.net.proposed.connect(o._on_proposed)
	o._pings = CrewPings.new()
	o._pings.sea = o
	o._hud_layer.add_child(o._pings)
	var cw: CrewWatersView = CrewWatersView.new()
	cw.sea = o
	cw.fishing = o.net.fishing
	cw.my_key = o.net.key
	o._hud_layer.add_child(cw)


static func mate(o: Sea, k: String) -> Shipmate:
	if not o._mates.has(k):
		var m: Shipmate = Shipmate.new()
		o._world.add_child(m)
		o._mates[k] = m
	return o._mates[k]


static func on_mate_look(o: Sea, k: String, mate_name: String, look: Dictionary) -> void:
	if k == o.net.key:
		return
	var m: Shipmate = mate(o, k)
	var fresh: bool = m.mate_name == ""
	m.set_mate_name(mate_name)
	m.set_look(look)
	if fresh:
		o._hud.toast("%s is on the water" % mate_name)


## The crew is asked to agree to something: a small panel over the sea,
## Agree or Not now.
static func on_proposed(o: Sea, n: int, by: String, text: String) -> void:
	var p: Control = Control.new()
	p.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	p.theme = UiTheme.make()
	Kit.scrim(p)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	p.add_child(center)
	var card: Pane = Kit.pane(center, Kit.modal(Kit.GOLD, 22))
	card.custom_minimum_size = Vector2(480, 0)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	card.add_child(v)
	Kit.text(v, "A crew vote", "eyebrow", Kit.a(Kit.GOLD, 0.8))
	Kit.text(v, "%s asks the crew" % by, "title")
	Kit.text(v, text, "body", Kit.INK_2, true)
	Kit.text(v, "It goes ahead only if everyone aboard agrees.", "note", Kit.DIM, true)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	v.add_child(row)
	var no: Button = Kit.button("Not now", "secondary")
	no.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(no)
	var yes: Button = Kit.button("Agree", "primary")
	yes.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(yes)
	no.pressed.connect(func() -> void:
		o.net.vote(n, false)
		p.queue_free())
	yes.pressed.connect(func() -> void:
		o.net.vote(n, true)
		p.queue_free())
	# Esc / B is "Not now".
	SeaFinds.back_closes(p, func() -> void:
		o.net.vote(n, false)
		p.queue_free())
	o._hold(p, o._room_layer)
	Kit.modal_in(card)
	no.grab_focus.call_deferred()


# ── Finn ───────────────────────────────────────────────────────────────────────

## Finn on the water, with the shallows' fish he talks of, his splashes
## ringing the water (and plipping when she is near).
static func build_finn(o: Sea) -> void:
	o._finn = FinnHull.new()
	for sp: Dictionary in o.session.save["species"]:
		if sp["habitat"] == "shallows":
			o._finn.catch_names.append(sp["name"])
	o._finn.splashed.connect(func(at: Vector2) -> void:
		o._field.ring(at, 90.0, 1.2, 0.7)
		if at.distance_to(o._boat.position) < 900.0:
			Sound.plip())
	o._world.add_child(o._finn)


static func finn_tick(o: Sea, delta: float) -> void:
	if o._finn == null:
		return
	# The calm round him: slow rings going out, as off nobody else.
	o._finn_ring += delta
	if o._finn_ring >= 3.2:
		o._finn_ring = 0.0
		o._field.ring(o._finn.position, 170.0, 3.2, 0.32)
	o._finn_t += delta
	if o._finn_t >= 1.0:
		o._finn_t = 0.0
		finn_refresh(o)


static func finn_refresh(o: Sea) -> void:
	var r: Variant = Finn.state(o.session.store, o.session.uid)
	if not (r is Dictionary):
		return
	o._finn_st = r
	var q: Variant = o._finn_st.get("quest")
	if o._finn_st.get("questReady", false):
		o._finn.mark = "!"
	elif q == null and not Finn.next_quest(Js.list(o._finn_st.get("questsDone")), int(Js.num(o._finn_st.get("fishingLevel")))).is_empty():
		o._finn.mark = "?"
	else:
		o._finn.mark = ""
	o._hud.set_story(o._finn_st)


static func open_finn(o: Sea) -> void:
	Rumble.tap(12)
	o._boat.velocity = Vector2.ZERO
	o._boat.target = null
	finn_refresh(o)
	var sc: FinnScene = FinnScene.new()
	sc.session = o.session
	sc.st = o._finn_st
	sc.changed.connect(func() -> void:
		o.session.persist()
		finn_refresh(o))
	sc.paid.connect(func(xp: float, from: Vector2) -> void: o._hud.story_pour(xp, from))
	var moment: Array = [0]
	sc.chapter_done.connect(func(n: int) -> void: moment[0] = n)
	sc.closed.connect(func() -> void:
		# A chapter closed: the sea round her answers (game/finn_moment.gd).
		if moment[0] > 0:
			FinnMoment.play(o._world, o._boat.position, o._field, moment[0], o._boat.z_index + 1)
		finn_refresh(o)
		o._hud.after_story.call_deferred())
	o._hold(sc, o._hud_layer)


# ── The regulars, the wanderers and the buyers ─────────────────────────────────

## The nine regulars and Yoon, where the chart moors them: each regular works
## their own water (all the slack it leaves them, in legs with a sit between);
## Yoon barely moves.
static func moor_regulars(o: Sea) -> void:
	for m: Dictionary in Rules.data()["regulars"]["moorings"]:
		var f: Dictionary = Folk.by_id(str(m["folkId"]))
		var info: Dictionary
		if m["folkId"] == "yoon":
			info = Traders.yoon()
		else:
			info = {
				"key": "folk:%s" % m["folkId"], "kind": "talker", "folkId": m["folkId"], "name": m["name"],
				"x": m["x"], "y": m["y"], "line": m["line"],
				"driftR": Chart.drift_r(Vector2(float(m["x"]), float(m["y"])), m["zoneId"]) / 0.6,
				"driftRate": m["driftRate"], "driftPhase": m["driftPhase"], "look": m["look"],
				"deal": "talk", "topic": "chat", "mood": "One of the regulars", "lines": [m["line"]],
			}
		var w: Wanderer = Wanderer.new()
		w.info = info
		w.role = str(f.get("role", "One of the regulars"))
		if not f.is_empty():
			w.accent = Color(str(f["accent"]))
		o._world.add_child(w)
		o._regulars[info["key"]] = w


## The strangers round the boat: re-derived when the boat crosses a cell or
## night comes and goes (the runners), and the day's dealt list when the sea
## day turns.
static func wanderers(o: Sea, now: float, clock: Dictionary, lift: Color) -> void:
	var day: int = Traders.sea_day(now)
	if day != o._dealt_day:
		o._dealt_day = day
		load_dealt(o)
	var at: Vector2 = o._boat.position
	var cell: float = float(Rules.data()["traders"]["cell"])
	var night: bool = clock["phase"] == "night" or clock["phase"] == "dusk"
	var ck: String = "%d:%d|%s|%d" % [int(floor(at.x / cell)), int(floor(at.y / cell)), night, day]
	if ck != o._trader_cell:
		o._trader_cell = ck
		var want: Dictionary = {}
		for t: Dictionary in Traders.around(at.x, at.y, 2400.0, day, now):
			want[t["key"]] = t
		for k: String in o._strangers.keys():
			if not want.has(k) and k != o._hailing:
				# A trader leaving the water fades off it (never gone in a frame).
				Motion.leave(o._strangers[k] as Wanderer, true, false)
				o._strangers.erase(k)
		var labels: Dictionary = Rules.data()["traders"]["kindLabel"]
		for k: String in want:
			if o._strangers.has(k):
				continue
			var w: Wanderer = Wanderer.new()
			w.info = want[k]
			w.role = str(labels.get(want[k]["kind"], ""))
			w.done = o._dealt_keys.has(k)
			o._world.add_child(w)
			o._strangers[k] = w
			# And one coming into it fades in.
			w.modulate.a = 0.0
			Motion.ease_fade(w.create_tween(), w, "modulate:a", 1.0, Shipmate.FADE)
	for list: Dictionary in [o._regulars, o._strangers]:
		for k: String in list:
			(list[k] as Wanderer).lift = lift


static func load_dealt(o: Sea) -> void:
	var r: Variant = await o.session.act("dealtToday", [])
	o._dealt_keys = r if r is Array else []
	for k: String in o._strangers:
		(o._strangers[k] as Wanderer).done = o._dealt_keys.has(k)


static func hail_wanderer(o: Sea, w: Wanderer) -> void:
	Rumble.tap(12)
	var key: String = w.info["key"]
	o._hailing = key
	var p: TraderPanel = TraderPanel.new()
	p.session = o.session
	p.trader = w.info
	p.already_dealt = o._dealt_keys.has(key)
	p.deals_left = int(Rules.data()["traders"]["dealsPerDay"]) - o._dealt_keys.size()
	p.dealt.connect(func(k: String) -> void:
		if not o._dealt_keys.has(k):
			o._dealt_keys.append(k)
		if is_instance_valid(w):
			w.done = true)
	p.changed.connect(func() -> void: o._hud.refresh())
	p.closed.connect(func() -> void: o._hailing = "")
	o._hold(p, o._hud_layer)


static func hail(o: Sea, b: Buyer) -> void:
	Rumble.tap(12)
	var p: BuyerPanel = BuyerPanel.new()
	p.session = o.session
	p.info = b.info
	p.closed.connect(func() -> void: o._dealt[b.info["zoneId"]] = true)
	p.sold.connect(func() -> void: o._hud.refresh())
	o._hold(p, o._hud_layer)
