class_name VoyageBoard
extends Control
## THE CHARTERHOUSE'S VOYAGE BOARD (Godot port of DailyVoyagePanel; core/
## voyages.gd), on the night paper. Who sails (the voyage seats, filled from
## the free hands here), their Power, Navigation and Fortune, and the five
## routes as tall cards, each with its painting, what it pays, how long it
## takes in sea days, how the one event tends to go and what it risks; a
## press chooses one and a confirm sends them. While they are out: how long
## until they are home. Home: their tale and the haul. Esc steps back, then
## closes.

signal closed

var session: Session
var _body: VBoxContainer
## The route chosen and awaiting Set Sail ("" when none).
var _chosen: String = ""
## The seat being filled (-1 when none).
var _seat: int = -1
## The last haul, shown until dismissed.
var _haul: Dictionary = {}
var _log: bool = false
var _tick: float = 0.0

const RED: Color = Paper.NIGHT_RED
const GREEN: Color = Paper.NIGHT_GREEN

var _parts: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE shell every sheet shares (Paper.open), on the night paper.
	_parts = Paper.open(self, Paper.SHEET_WIDE, true, close, 26)
	_body = _parts["body"]
	_paint()


func close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	Paper.close(self, _parts)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		if _chosen != "" or _seat >= 0 or not _haul.is_empty() or _log:
			_chosen = ""
			_seat = -1
			_haul = {}
			_log = false
			_paint()
			return
		close()


func _process(delta: float) -> void:
	_tick += delta
	if _tick >= 20.0 and _chosen == "" and _seat < 0 and _haul.is_empty():
		_tick = 0.0
		_paint()


static func _left(ms: float) -> String:
	var mins: int = int(ceil(maxf(0.0, ms) / 60000.0))
	return "%dm" % mins if mins < 60 else "%dh %dm" % [mins / 60, mins % 60]


static func _days(ms: float) -> String:
	var d: float = ms / SeaClock.CYCLE_MS
	return "%s sea day%s" % [Js.text(snappedf(d, 0.1)), "" if is_equal_approx(d, 1.0) else "s"]


func _paint() -> void:
	Paper.night = true
	for c: Node in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	var st: Dictionary = RulesApi.run(session.store, session.uid, "voyageState", [])
	# THE shared header: the Charterhouse over the title; Past voyages and
	# Close on the right; the rule.
	var hd: Dictionary = Paper.header(_body, "The voyage board", "The Charterhouse", close)
	if not (st["history"] as Array).is_empty():
		var lb: Pane.PaneButton = Paper.button("Past voyages", _log)
		lb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		lb.pressed.connect(func() -> void:
			_log = not _log
			_paint())
		(hd["right"] as HBoxContainer).add_child(lb)
	if not _haul.is_empty():
		_paint_haul()
	elif _log:
		_paint_log(st["history"])
	elif not (st["voyage"] as Dictionary).is_empty():
		_paint_out(st)
	else:
		_paint_crew(st)
		if _seat >= 0:
			_paint_picker(st)
		else:
			_paint_routes(st)
	Paper.night = false


# ── The crew ─────────────────────────────────────────────────────────────────

func _face(filename: String, px: float) -> TextureRect:
	var pic: TextureRect = TextureRect.new()
	pic.custom_minimum_size = Vector2(px, px)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if filename != "":
		pic.texture = Skipper.tex("card_thumbs/%s.png" % filename.get_basename())
	return pic


func _paint_crew(st: Dictionary) -> void:
	var seats: int = Crew.party_slots(session.profile())
	var t: Dictionary = st["totals"]
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_body.add_child(row)
	var lead: VBoxContainer = VBoxContainer.new()
	lead.add_theme_constant_override("separation", 2)
	lead.custom_minimum_size = Vector2(230, 0)
	row.add_child(lead)
	Paper.text(lead, "WHO SAILS  ·  %d SEAT%s" % [seats, "" if seats == 1 else "S"], "eyebrow", Paper.ink_soft())
	Paper.text(lead, "Power %d  ·  Navigation %d  ·  Fortune %d" % [int(t["power"]), int(t["dodge"]), int(t["fortune"])], "body_strong", Paper.ink())
	Paper.text(lead, "Power sets how the voyage goes, Navigation how long it takes, Fortune what comes home and how safe the crew are. The first seat counts in full, the rest at 80%.", "small", Paper.ink_soft(), true)
	var hands: Array = st["hands"]
	var seated: Dictionary = {}
	for c: Dictionary in Crew.live(session.store):
		if c.get("voyage_slot") != null:
			seated[int(c["voyage_slot"])] = Voyages.hand(c)
	for k: int in seats:
		var who: Dictionary = seated.get(k, {})
		var b: Pane.PaneButton = Paper.button("")
		# The seat being filled stands out by the others stepping back (no gold fill).
		b.modulate.a = 0.45 if _seat >= 0 and _seat != k else 1.0
		b.custom_minimum_size = Vector2(150, 96)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var kk: int = k
		b.pressed.connect(func() -> void:
			_seat = -1 if _seat == kk else kk
			_chosen = ""
			_paint())
		row.add_child(b)
		var h: HBoxContainer = HBoxContainer.new()
		h.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		h.offset_left = 8
		h.offset_right = -8
		h.add_theme_constant_override("separation", 6)
		h.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(h)
		if who.is_empty():
			var e: Label = Paper.text(h, ("Captain's seat" if k == 0 else "Seat %d" % (k + 1)) + "\nempty", "small", Paper.ink_faint())
			e.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			e.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			e.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		else:
			h.add_child(_face(str(who["filename"]), 64))
			var v: VBoxContainer = VBoxContainer.new()
			v.add_theme_constant_override("separation", 0)
			v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			h.add_child(v)
			Paper.text(v, str(who["name"]), "body_strong", Paper.ink())
			Paper.text(v, "Lv %d" % int(who["level"]), "small", Paper.ink_soft())
			Paper.text(v, "P %d  N %d  F %d" % [int(who["power"]), int(who["dodge"]), int(who["fortune"])], "small", Paper.ink_soft())
		for n: Node in h.get_children():
			(n as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	if hands.is_empty():
		Paper.text(_body, "Press a seat to put a hand in it.", "small", Paper.ink_soft())


## The hands who can fill the seat being chosen.
func _paint_picker(st: Dictionary) -> void:
	Paper.rule(_body)
	var top: HBoxContainer = HBoxContainer.new()
	_body.add_child(top)
	var tl: Label = Paper.text(top, "WHO TAKES %s" % ("THE CAPTAIN'S SEAT" if _seat == 0 else "SEAT %d" % (_seat + 1)), "eyebrow", Paper.ink_soft())
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var clear: Pane.PaneButton = Paper.button("Empty this seat")
	clear.pressed.connect(func() -> void:
		for c: Dictionary in Crew.live(session.store):
			if c.get("voyage_slot") != null and int(c["voyage_slot"]) == _seat:
				await session.act("benchCrew", [float(c["id"])])
		session.persist()
		_seat = -1
		_paint())
	top.add_child(clear)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 3
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 14)
	grid.add_theme_constant_override("v_separation", 6)
	scroll.add_child(grid)
	var trawling: Array = Js.list(session.store.save.get("trawls")).map(func(t: Dictionary) -> float: return float(t["crew_id"]))
	var hands: Array = []
	for c: Dictionary in Crew.live(session.store):
		if trawling.has(float(c["id"])) or Crew._reassign_error(session.store, session.uid, c) != "":
			continue
		var h: Dictionary = Voyages.hand(c)
		h["raid"] = c.get("raid_slot") != null
		h["voyage"] = c.get("voyage_slot")
		hands.append(h)
	hands.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a["power"] + a["dodge"] + a["fortune"] > b["power"] + b["dodge"] + b["fortune"])
	for h: Dictionary in hands:
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(row)
		row.add_child(_face(str(h["filename"]), 44))
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 0)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(v)
		var where: String = "  ·  in your raid party" if h["raid"] else ("  ·  seat %d" % (int(h["voyage"]) + 1) if h["voyage"] != null else "")
		Paper.text(v, "%s  ·  Lv %d%s" % [h["name"], int(h["level"]), where], "body_strong", Paper.ink())
		Paper.text(v, "Power %d, Navigation %d, Fortune %d" % [int(h["power"]), int(h["dodge"]), int(h["fortune"])], "small", Paper.ink_soft())
		var b: Pane.PaneButton = Paper.button("Seat")
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var id: float = float(h["id"])
		b.pressed.connect(func() -> void:
			var r: Variant = await session.act("assignToVoyage", [id, float(_seat)])
			session.persist()
			if r is Dictionary and (r as Dictionary).has("error"):
				Sound.slack()
			else:
				Sound.plip()
			_seat = -1
			_paint())
		row.add_child(b)
	if hands.is_empty():
		Paper.text(grid, "Every hand is busy: out on a trawl, training in the hall, or away.", "small", Paper.ink_soft(), true)


# ── The routes ───────────────────────────────────────────────────────────────

func _paint_routes(st: Dictionary) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_child(row)
	var crew_n: int = (st["hands"] as Array).size()
	for r: Dictionary in st["routes"]:
		row.add_child(_route_card(r, crew_n, st))
	if _chosen != "":
		var r: Dictionary = {}
		for x: Dictionary in st["routes"]:
			if x["key"] == _chosen:
				r = x
		var bar: HBoxContainer = HBoxContainer.new()
		bar.add_theme_constant_override("separation", 10)
		_body.add_child(bar)
		var lost: float = float(r["lossChance"])
		var note: Label = Paper.text(bar, "%s: %s aboard, home in about %s.%s" % [r["name"], "%d hand%s" % [crew_n, "" if crew_n == 1 else "s"], _days(float(r["durationMs"])), (" %d%% chance one hand does not come back." % int(round(lost * 100.0))) if lost > 0.0 else " No crew at risk."], "body_strong", RED if lost > 0.0 else Paper.ink(), true)
		note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var go: Pane.PaneButton = Paper.primary("Set sail", true)
		go.pressed.connect(func() -> void:
			var res: Variant = await session.act("sendVoyage", [_chosen])
			session.persist()
			if res is Dictionary and (res as Dictionary).has("error"):
				Sound.slack()
			else:
				Sound.horn()
			_chosen = ""
			_paint())
		bar.add_child(go)
		var no: Pane.PaneButton = Paper.button("Not yet")
		no.pressed.connect(func() -> void:
			_chosen = ""
			_paint())
		bar.add_child(no)


func _route_card(r: Dictionary, crew_n: int, st: Dictionary) -> Control:
	var key: String = r["key"]
	var open: bool = r["open"]
	var enough: bool = crew_n >= int(r["needCrew"])
	var b: Pane.PaneButton = Paper.button("")
	b.modulate.a = 0.4 if _chosen != "" and _chosen != key else 1.0
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.size_flags_vertical = Control.SIZE_EXPAND_FILL
	b.disabled = not open or not enough
	b.pressed.connect(func() -> void:
		_chosen = "" if _chosen == key else key
		_paint())
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.offset_left = 6
	v.offset_right = -6
	v.offset_top = 6
	v.offset_bottom = -8
	v.add_theme_constant_override("separation", 3)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(v)
	var art: TextureRect = TextureRect.new()
	art.texture = Skipper.tex(str(r["image"]).trim_prefix("/"))
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	art.custom_minimum_size = Vector2(0, 250)
	art.clip_contents = true
	art.modulate = Color.WHITE if open else Color(0.5, 0.5, 0.5)
	v.add_child(art)
	Paper.text(v, str(r["name"]), "body_strong", Paper.ink() if open else Paper.ink_faint())
	Paper.text(v, str(r["tagline"]), "small", Paper.ink_soft(), true)
	if not open:
		Paper.text(v, "Opens at Navigation %d" % int(r["minLevel"]), "small", Paper.ink_faint())
		return b
	var e: Dictionary = r["expected"]
	Paper.text(v, "About %s ⟡" % Js.thousands(float(e["doubloons"])), "body_strong", Paper.NIGHT_GOLD)
	Paper.text(v, "%s Navigation XP  ·  %s crew XP each" % [Js.thousands(float(e["xp"])), Js.thousands(float(e["crewXp"]))], "small", Paper.ink_soft(), true)
	Paper.text(v, "Home in about %s" % _days(float(r["durationMs"])), "small", Paper.ink_soft())
	var ch: Dictionary = r["chances"]
	Paper.text(v, "Goes well %d%%  ·  badly %d%%" % [int(round(float(ch["triumph"]) * 100.0)), int(round(float(ch["setback"]) * 100.0))], "small", Paper.ink_soft())
	var lost: float = float(r["lossChance"])
	var base: float = float(r["baseCrewLossChance"])
	if base <= 0.0 or st["safe"]:
		Paper.text(v, "No crew at risk", "small", GREEN)
	elif lost > 0.0:
		Paper.text(v, "%d%% a hand is lost  ·  Fortune %d makes it safe" % [int(round(lost * 100.0)), int(r["minLevel"])], "small", RED, true)
	else:
		Paper.text(v, "Your Fortune keeps the crew safe", "small", GREEN, true)
	if not enough:
		Paper.text(v, "Needs %d crew aboard" % int(r["needCrew"]), "small", Paper.ink_faint())
	for n: Node in v.get_children():
		(n as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	return b


# ── At sea, home, the haul ───────────────────────────────────────────────────

func _paint_out(st: Dictionary) -> void:
	var o: Dictionary = st["voyage"]
	var r: Dictionary = Voyages.route(str(o["route"]))
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 22)
	_body.add_child(row)
	var art: TextureRect = TextureRect.new()
	art.texture = Skipper.tex(str(r["image"]).trim_prefix("/"))
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	art.custom_minimum_size = Vector2(300, 520)
	row.add_child(art)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(v)
	var home: bool = st["home"]
	Paper.text(v, ("HOME FROM " if home else "OUT ON ") + str(r["name"]).to_upper(), "eyebrow", Paper.ink_soft())
	var left: float = float(o["created_ms"]) + float(o["duration_ms"]) - Clock.now_ms()
	Paper.text(v, "Your crew is home" if home else ("Back today, in %s" % _left(left) if left <= SeaClock.CYCLE_MS else "Home in about %s" % _days(left)), "display", Paper.ink())
	var faces: HBoxContainer = HBoxContainer.new()
	faces.add_theme_constant_override("separation", 10)
	v.add_child(faces)
	for c: Dictionary in Js.list(session.store.save.get("crew")):
		if Js.list(o["crew_variant_ids"]).has(float(c["id"])):
			var f: VBoxContainer = VBoxContainer.new()
			f.add_theme_constant_override("separation", 0)
			faces.add_child(f)
			f.add_child(_face(Voyages.hand(c)["filename"], 72))
			Paper.text(f, str(Voyages.hand(c)["name"]), "small", Paper.ink_soft())
	if home:
		Paper.text(v, "They are tied up at the Charterhouse with a tale to tell and a hold to empty.", "body", Paper.ink_soft(), true)
		var b: Pane.PaneButton = Paper.button("Hear their tale", true)
		b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		b.pressed.connect(func() -> void:
			var res: Variant = await session.act("revealVoyage", [float(o["id"])])
			session.persist()
			if res is Dictionary and (res as Dictionary).get("ok") == true:
				_haul = res
				Sound.chest(true)
			else:
				Sound.slack()
			_paint())
		v.add_child(b)
	else:
		Paper.text(v, "Nothing to do but wait. What happens out there was settled when they sailed; you will hear it when they are back. Their seats are held until then.", "body", Paper.ink_soft(), true)


func _paint_haul() -> void:
	var ev: Dictionary = _haul["event"]
	var r: Dictionary = Voyages.route(str(_haul["route"]))
	Paper.text(_body, str(r["name"]).to_upper(), "eyebrow", Paper.ink_soft())
	if ev.get("booty") == true:
		Paper.text(_body, "Massive Booty", "heading", Paper.NIGHT_GOLD)
	Paper.text(_body, str(ev["title"]), "display", Paper.ink())
	Paper.text(_body, str(ev["narrative"]), "body", Paper.ink(), true)
	Paper.rule(_body)
	Paper.stat(_body, "Doubloons", "+%s ⟡" % Js.thousands(float(_haul["earnedDoubloons"])))
	Paper.stat(_body, "Navigation XP", "+%s" % Js.thousands(float(_haul["xpEarned"])))
	if int(_haul["newExpeditionLevel"]) > int(_haul["oldExpeditionLevel"]):
		Paper.text(_body, "Navigation %d." % int(_haul["newExpeditionLevel"]), "body_strong", GREEN)
	for g: Dictionary in Js.list(_haul.get("crewGrants")):
		var up: String = "  ·  Lv %d" % int(g["newLevel"]) if int(g["newLevel"]) > int(g["oldLevel"]) else ""
		Paper.stat(_body, str(g["name"]), "+%s crew XP%s" % [Js.thousands(float(_haul["crewXp"])), up])
	for b: Dictionary in Js.list(_haul.get("earnedBait")):
		Paper.text(_body, "They brought back a %s lure." % ("Golden" if b["type"] == "golden" else "Luminous"), "body_strong", Paper.NIGHT_GOLD)
	for n: Variant in Js.list(_haul.get("crewLostNames")):
		Paper.text(_body, "%s did not come home. They are remembered in the Crew Hall." % str(n), "body_strong", RED, true)
	var ok: Pane.PaneButton = Paper.button("Back to the board", true)
	ok.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	ok.pressed.connect(func() -> void:
		_haul = {}
		_paint())
	_body.add_child(ok)


func _paint_log(history: Array) -> void:
	Paper.text(_body, "PAST VOYAGES", "eyebrow", Paper.ink_soft())
	for v: Dictionary in history:
		var ev: Dictionary = (v["events"] as Array)[0]
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		_body.add_child(row)
		var c: VBoxContainer = VBoxContainer.new()
		c.add_theme_constant_override("separation", 0)
		c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(c)
		Paper.text(c, "%s  ·  %s" % [Voyages.route(str(v["route"]))["name"], ev["title"]], "body_strong", Paper.ink())
		Paper.text(c, str(ev["narrative"]), "small", Paper.ink_soft(), true)
		var lost: int = Js.list(v.get("crew_lost")).size()
		Paper.text(row, "%s ⟡%s" % [Js.thousands(float(v["total_doubloons"])), "  ·  %d lost" % lost if lost > 0 else ""], "small", RED if lost > 0 else Paper.ink_soft())
