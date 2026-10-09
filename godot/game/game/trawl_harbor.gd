class_name TrawlHarbor
extends Control
## THE TRAWL HARBOR (Godot port of the web's trawl docks; core/trawls.gd), on
## the night paper: every water with what is out in it, a hand to send to a
## free one, and a finished trawl's haul brought in. Savvy fishes up XP,
## Fortune doubloons. Esc or a press outside closes it.

signal closed

var session: Session
var _body: VBoxContainer
## The water a hand is being picked for ("" when none).
var _picking: String = ""
## The last haul brought in, shown until dismissed.
var _haul: Dictionary = {}
var _tick: float = 0.0
var _parts: Dictionary = {}
var _status: Label
## A word for the status line, said on the next paint.
var _said: String = ""


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	# THE shell every sheet shares (Paper.open), on the night paper.
	_parts = Paper.open(self, Vector2(940, 720), true, close, 28)
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
		if _picking != "" or not _haul.is_empty():
			_picking = ""
			_haul = {}
			_paint()
			return
		close()


## The countdowns move on their own.
func _process(delta: float) -> void:
	_tick += delta
	if _tick >= 20.0 and _picking == "" and _haul.is_empty():
		_tick = 0.0
		_paint()


## Time left on a run, in sea days (and the last day in minutes).
static func _back(ms: float) -> String:
	var days: float = maxf(0.0, ms) / SeaClock.CYCLE_MS
	if days > 1.0:
		return "Back within %d sea days" % int(ceil(days))
	return "Back today, in %s" % _left(ms)


static func _left(ms: float) -> String:
	var mins: int = int(ceil(maxf(0.0, ms) / 60000.0))
	return "%dm" % mins if mins < 60 else "%dh %dm" % [mins / 60, mins % 60]


func _paint() -> void:
	Paper.night = true
	for c: Node in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	# THE shared header and the feedback line under it.
	Paper.header(_body, "The Trawl Harbor", "", close)
	_status = Paper.status_line(_body)
	if _said != "":
		Paper.say(_status, _said, Paper.NIGHT_RED)
		_said = ""
	if not _haul.is_empty():
		_paint_haul()
		Paper.night = false
		return
	var st: Dictionary = RulesApi.run(session.store, session.uid, "trawlState", [])
	var out: int = (st["zones"] as Array).filter(func(z: Dictionary) -> bool: return z["trawl"] != null).size()
	var slots: int = int(st["unlockedSlots"])
	Paper.text(_body, "Send a hand to fish a water for you. Their Savvy brings in fishing XP, their Fortune doubloons. They stay out for the whole run; one hand to a water.", "small", Paper.ink_soft(), true)
	var nx: Array = st["nextSlot"]
	var slot_line: String = "TRAWLS OUT  ·  %d OF %d" % [out, slots]
	if slots == 0:
		slot_line = "THE FIRST TRAWL OPENS AT FISHING %d" % Trawls.UNLOCK_LEVEL
	elif not nx.is_empty():
		slot_line += "  ·  ANOTHER AT FISHING %d AND NAVIGATION %d" % [int(nx[0]), int(nx[1])]
	Paper.text(_body, slot_line, "eyebrow", Paper.ink_soft())
	var now: float = Clock.now_ms()
	for z: Dictionary in st["zones"]:
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 14)
		row.custom_minimum_size = Vector2(0, 64)
		_body.add_child(row)
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 0)
		v.custom_minimum_size = Vector2(200, 0)
		v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(v)
		Paper.text(v, str(z["label"]), "body_strong", Paper.ink() if z["unlocked"] else Paper.ink_faint())
		var days: int = int(z["seaDays"])
		Paper.text(v, "Runs %d sea day%s" % [days, "" if days == 1 else "s"], "small", Paper.ink_soft())
		var mid: HBoxContainer = HBoxContainer.new()
		mid.add_theme_constant_override("separation", 10)
		mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(mid)
		var key: String = z["key"]
		if not z["unlocked"]:
			var why: String = "Fishing %d" % int(z["minLevel"]) if int(st["fishingLevel"]) < int(z["minLevel"]) else "Clear Chapter 3 first"
			var wl: Label = Paper.text(mid, why, "small", Paper.ink_faint())
			wl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			continue
		var t: Variant = z["trawl"]
		if t != null:
			var td: Dictionary = t
			mid.add_child(_face(str(td["crew"]["filename"]), 52))
			var cv: VBoxContainer = VBoxContainer.new()
			cv.add_theme_constant_override("separation", 0)
			cv.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			mid.add_child(cv)
			Paper.text(cv, str(td["crew"]["name"]), "body_strong", Paper.ink())
			Paper.text(cv, "About %s XP and %s ⟡" % [Js.thousands(float(td["expectedXp"])), Js.thousands(float(td["expectedDoubloons"]))], "small", Paper.ink_soft())
			if td["ready"]:
				var cb: Pane.PaneButton = Paper.button("Bring them in", true)
				cb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
				cb.pressed.connect(func() -> void: _collect(key))
				row.add_child(cb)
			else:
				var bl: Label = Paper.text(row, _back(float(td["endsMs"]) - now), "small", Paper.ink_soft())
				bl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
				bl.tooltip_text = "About %s of real time" % _left(float(td["endsMs"]) - now)
			continue
		if _picking == key:
			var pl: Label = Paper.text(mid, "Who goes? Pick a hand below.", "small", Paper.ink())
			pl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			var cancel: Pane.PaneButton = Paper.button("Cancel")
			cancel.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			cancel.pressed.connect(func() -> void:
				_picking = ""
				_paint())
			row.add_child(cancel)
			continue
		var full: bool = out >= slots
		var sb: Pane.PaneButton = Paper.button("Send a hand")
		sb.disabled = full or (st["freeCrew"] as Array).is_empty()
		sb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		if full:
			sb.tooltip_text = "Every trawl slot is out."
		sb.pressed.connect(func() -> void:
			_picking = key
			_paint())
		row.add_child(sb)
	if _picking != "":
		_paint_picker(st["freeCrew"])
	Paper.night = false


func _face(filename: String, px: float) -> TextureRect:
	var pic: TextureRect = TextureRect.new()
	pic.custom_minimum_size = Vector2(px, px)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if filename != "":
		pic.texture = Skipper.tex("card_thumbs/%s.png" % filename.get_basename())
	return pic


## The free hands for the water being picked for, best trawlers first, each
## with the haul they would bring.
func _paint_picker(free: Array) -> void:
	Paper.rule(_body)
	Paper.text(_body, "FREE HANDS  ·  THE %s" % str(Trawls.zone(_picking)["label"]).to_upper(), "eyebrow", Paper.ink_soft())
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.add_child(scroll)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 18)
	grid.add_theme_constant_override("v_separation", 6)
	scroll.add_child(grid)
	for c: Dictionary in free:
		var e: Dictionary = Trawls.expected(_picking, c["savvy"], c["fortune"])
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(row)
		row.add_child(_face(str(c["filename"]), 44))
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 0)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(v)
		Paper.text(v, "%s  ·  Lv %d%s" % [c["name"], int(c["level"]), "  ·  in your raid party" if c["inRaidParty"] else ""], "body_strong", Paper.ink())
		Paper.text(v, "Savvy %d, Fortune %d  ·  about %s XP and %s ⟡" % [int(c["savvy"]), int(c["fortune"]), Js.thousands(float(e["xp"])), Js.thousands(float(e["doubloons"]))], "small", Paper.ink_soft())
		var b: Pane.PaneButton = Paper.button("Send")
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var id: float = float(c["id"])
		var zk: String = _picking
		b.pressed.connect(func() -> void:
			var r: Variant = await session.act("deployTrawl", [zk, id])
			session.persist()
			if r is Dictionary and (r as Dictionary).has("error"):
				Sound.slack()
				_said = str(r["error"])
			else:
				Sound.plip()
			_picking = ""
			_paint())
		row.add_child(b)


func _collect(key: String) -> void:
	var r: Variant = await session.act("collectTrawl", [key])
	session.persist()
	if r is Dictionary and not (r as Dictionary).has("error"):
		_haul = r
		Sound.chest(str(r["bumper"]) in ["good", "bumper", "jackpot"])
	else:
		Sound.slack()
		if r is Dictionary:
			_said = str(r["error"])
	_paint()


func _paint_haul() -> void:
	var b: Array = Trawls.BUMPERS.get(str(_haul["bumper"]), Trawls.BUMPERS["normal"])
	Paper.text(_body, "%s  ·  THE %s" % [str(_haul["crewName"]).to_upper(), str(Trawls.zone(str(_haul["zone"]))["label"]).to_upper()], "eyebrow", Paper.ink_soft())
	if str(b[0]) != "":
		Paper.text(_body, str(b[0]), "heading", Color(str(b[2])))
	Paper.text(_body, str(_haul.get("event", "")), "body", Paper.ink(), true)
	Paper.stat(_body, "Fishing XP", "+%s" % Js.thousands(float(_haul["xpGained"])))
	Paper.stat(_body, "Doubloons", "+%s ⟡" % Js.thousands(float(_haul["doubloonsGained"])))
	if not (_haul["fish"] as Array).is_empty():
		Paper.text(_body, "In the nets: %s." % ", ".join(_haul["fish"]), "small", Paper.ink_soft(), true)
	if int(_haul["newFishingLevel"]) > int(_haul["oldFishingLevel"]):
		Paper.text(_body, "Fishing level %d." % int(_haul["newFishingLevel"]), "body_strong", Paper.NIGHT_GREEN)
	var ok: Pane.PaneButton = Paper.button("Back to the harbor", true)
	ok.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	ok.pressed.connect(func() -> void:
		_haul = {}
		_paint())
	_body.add_child(ok)
