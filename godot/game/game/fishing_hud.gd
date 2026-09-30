class_name FishingHud
extends Control
## THE HUD AND THE FISHING LOOP (Godot port of web/app/(app)/sea/FishingHere.tsx).
##
## The verdicts are the ported rules (Fishing.*); this shows them, on the web's
## timeline:
##   cast      the cast sound and pose at once, the line hitting the water at
##             600ms, the wait pose at 650ms; the waiting dots, "Waiting on a
##             bite" and the timer from 1.5s (an instant bite skips all that
##             and says so);
##   the bite  the dial springs in, the tick starts, the pad buzzes;
##   strike    the needle freezes where it is drawn; the snap, the splash at
##             the bow, and on a perfect the burst, the flash and its sound;
##             the frozen dial holds 620ms (900 on a perfect);
##   result    the XP rises off the boat, the fish flies to the hold, the card
##             arrives; a crate plays its own moment; a golden is asked about;
##             a level crossed is celebrated.
## The Tide Turner rides the dial while it is up; the wormhole rides the card.
##
## Controls: Space, Enter or the pad's A to cast and to reel in; Escape or B
## to walk away (the line stays out and resumes on the next cast here) or to
## close the card.

signal fishing_changed(active: bool)

const HOLD_S: float = 0.62
const HOLD_PERFECT_S: float = 0.9
const INK: Color = Color("#f0ede8")
const DIM: Color = Color("#a0a09a")
const GOLD: Color = Color("#f0c040")
const TEAL: Color = Color("#67d4e8")

var session: Session
var boat: Boat
var water: Dictionary = {}
var phase: String = "idle"

var _shot: Dictionary = {}
var _bait: String = "worm"
var _wait_left: float = 0.0
var _since_cast: float = 0.0
var _cast_zone: String = ""
var _mods: Dictionary = {}
var _gen: int = 0

var _name: Label
var _xp: XpBar
var _purse: Label
var _where: Label
var _blurb: Label
var _clock: Label
var _bait_pick: OptionButton
var _action: Button
var _hold: Label
var _blocked: Label
var _status: Label
var _dots: Label
var _timer: Label
var _tide: Button
var _dial: Dial
var _card: Control
var _toast: Label
var _toast_t: float = 0.0
var _modal: Control
var _level_seen: int = 0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.make()

	var tl: VBoxContainer = _box(Vector2(20, 14), false, 580)
	_name = _label(tl, "", 22, INK, true)
	_xp = XpBar.new()
	tl.add_child(_xp)
	_purse = _label(tl, "", 17, GOLD, true)

	var tr: VBoxContainer = _box(Vector2(-20, 16), true, 360)
	_where = _label(tr, "", 20, INK, true)
	_blurb = _label(tr, "", 14, DIM)
	_clock = _label(tr, "", 14, DIM)
	for l: Label in [_where, _blurb, _clock]:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT

	var bottom: HBoxContainer = HBoxContainer.new()
	bottom.alignment = BoxContainer.ALIGNMENT_CENTER
	bottom.add_theme_constant_override("separation", 12)
	_place(bottom, Vector2(0.5, 1.0), Vector2(-320, -86), Vector2(640, 58))
	add_child(bottom)
	_hold = _label(bottom, "", 15, DIM, true)
	_hold.custom_minimum_size = Vector2(110, 0)
	_hold.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_hold.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_bait_pick = OptionButton.new()
	_bait_pick.custom_minimum_size = Vector2(190, 52)
	_bait_pick.item_selected.connect(func(i: int) -> void:
		_bait = _bait_pick.get_item_metadata(i)
		Rumble.tap(10))
	bottom.add_child(_bait_pick)
	_action = Button.new()
	_action.custom_minimum_size = Vector2(190, 56)
	_action.pressed.connect(_act)
	bottom.add_child(_action)
	_blocked = _label(self, "", 14, Color("#f8a2a2"))
	_blocked.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_blocked.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_place(_blocked, Vector2(0.5, 1.0), Vector2(-300, -118), Vector2(600, 28))

	_status = _label(self, "", 22, INK, true)
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_status, Vector2(0.5, 0.5), Vector2(-300, 110), Vector2(600, 32))
	_dots = _label(self, "", 22, Color(0.78, 0.86, 0.91, 0.9), true)
	_dots.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_dots, Vector2(0.5, 0.5), Vector2(-150, 80), Vector2(300, 30))
	_timer = _label(self, "", 14, Color(0.75, 0.83, 0.89, 0.55))
	_timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_timer, Vector2(0.5, 0.5), Vector2(-150, 146), Vector2(300, 22))

	_dial = Dial.new()
	_place(_dial, Vector2(0.5, 0.5), Vector2(140, -170), Vector2(300, 300))
	_dial.visible = false
	_dial.mouse_filter = Control.MOUSE_FILTER_STOP
	_dial.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and phase == "hooked":
			_dial.strike())
	_dial.struck.connect(_on_struck)
	add_child(_dial)
	_tide = Button.new()
	_tide.add_theme_color_override("font_color", Color("#cdbdf8"))
	_place(_tide, Vector2(0.5, 0.5), Vector2(150, 150), Vector2(280, 44))
	_tide.visible = false
	_tide.pressed.connect(_skip)
	add_child(_tide)

	_toast = _label(self, "", 18, GOLD, true)
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_toast, Vector2(0.5, 0.0), Vector2(-300, 120), Vector2(600, 30))
	_level_seen = session.level()
	refresh()
	# What the sea owes on opening: levels not yet celebrated, then a golden
	# still waiting on an answer.
	_after_catch.call_deferred(false)


## Pin a control to a point of the screen (anchor, 0..1 each way) at an offset
## from it, with a size. `position` would be measured from the top-left of the
## screen whatever the anchor; offsets are measured from the anchor.
static func _place(c: Control, anchor: Vector2, offset: Vector2, size_px: Vector2) -> void:
	c.anchor_left = anchor.x
	c.anchor_right = anchor.x
	c.anchor_top = anchor.y
	c.anchor_bottom = anchor.y
	c.offset_left = offset.x
	c.offset_top = offset.y
	c.offset_right = offset.x + size_px.x
	c.offset_bottom = offset.y + size_px.y


func _box(at: Vector2, right: bool, w: float) -> VBoxContainer:
	var b: VBoxContainer = VBoxContainer.new()
	_place(b, Vector2(1.0 if right else 0.0, 0.0), at + (Vector2(-w, 0) if right else Vector2.ZERO), Vector2(w, 120))
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(b)
	return b


func _label(parent: Control, text: String, px: int, col: Color, title: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	l.add_theme_constant_override("shadow_offset_y", 2)
	if title:
		l.add_theme_font_override("font", UiTheme.title_font())
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(l)
	return l


static func _thousands(n: float) -> String:
	return Js.thousands(n)


static func length_text(inches: float) -> String:
	if inches <= 0.0:
		return ""
	if inches < 36.0:
		return "%.1f in" % inches
	var rounded: int = int(Js.round(inches))
	return "%d' %d in" % [rounded / 12, rounded % 12]


func _streak() -> int:
	return int(Js.num(session.profile().get("current_perfect_streak")))


## Everything read off the save: the purse, the level, the streak, the bait, the hold.
func refresh() -> void:
	var p: Dictionary = session.profile()
	var lvl: int = session.level()
	var table: Array = Rules.data()["xpTable"]
	var xp: float = Js.num(p.get("fishing_xp"))
	_name.text = session.captain_name()
	var frac: float = 1.0
	var left: float = 0.0
	if lvl < Rules.MAX_LEVEL:
		var lo: float = float(table[lvl - 1])
		var hi: float = float(table[lvl])
		frac = (xp - lo) / maxf(1.0, hi - lo)
		left = hi - xp
	var next: Dictionary = (Rules.data()["levelRewards"] as Dictionary).get(str(lvl + 1), {})
	_xp.set_values(lvl, frac, left, LevelUp.reward_label(next) if not next.is_empty() else "", next.get("milestone", false), _streak())
	_dial.streak = _streak()
	_purse.text = "%s ⟡" % _thousands(Js.num(p.get("doubloons")))
	var keep: String = _bait
	_bait_pick.clear()
	var i: int = 0
	for b: Array in session.baits():
		_bait_pick.add_item("%s  %d" % [b[1], int(b[2])])
		_bait_pick.set_item_metadata(i, b[0])
		if b[0] == keep:
			_bait_pick.select(i)
		i += 1
	if _bait_pick.item_count > 0 and _bait_pick.selected >= 0:
		_bait = _bait_pick.get_item_metadata(_bait_pick.selected)
	_hold.text = "Hold %d/%d" % [int(session.store.hold_count(session.uid)), int(Rules.fish_hold(Js.num(p.get("fish_hold_tier")))["capacity"])]
	_update_action()


func set_water(w: Dictionary) -> void:
	if w.get("id") == water.get("id"):
		return
	water = w
	_where.text = w.get("name", "Harbor approach")
	_blurb.text = w.get("blurb", "Sail south to fish")
	if not w.is_empty():
		toast(w["name"])
	_update_action()


func set_clock(label: String) -> void:
	_clock.text = label


## The one button: Cast, Reel In, Cast Again, or why it cannot.
func _update_action() -> void:
	_blocked.text = ""
	var teal: bool = true
	match phase:
		"hooked":
			_action.text = "Reel In"
			_action.disabled = false
			teal = false
		"waiting", "reeling":
			_action.text = "…"
			_action.disabled = true
		_:
			_action.text = "Cast Again" if phase == "result" else "Cast"
			_action.disabled = false
			if water.is_empty():
				_action.disabled = true
				_action.text = "Sail south to fish"
			else:
				var need: float = float((Rules.data()["zones"]["minLevel"] as Dictionary).get(water["id"], 1.0))
				var p: Dictionary = session.profile()
				if session.level() < need:
					_action.disabled = true
					_action.text = "Needs Fishing %d" % int(need)
				elif session.store.hold_count(session.uid) >= float(Rules.fish_hold(Js.num(p.get("fish_hold_tier")))["capacity"]):
					_action.disabled = true
					_action.text = "Hold Full"
					_blocked.add_theme_color_override("font_color", Color("#f8a2a2"))
					_blocked.text = "Your hold is full. Sell it to the buyer in this water, or sail it home to the market."
				elif _bait_pick.item_count == 0:
					_action.disabled = true
					_action.text = "No Bait"
					_blocked.add_theme_color_override("font_color", Color("#e8c98a"))
					_blocked.text = "Out of bait. There are peddlers out here, and the shop ashore."
	_action.add_theme_color_override("font_color", TEAL if teal else GOLD)
	_action.add_theme_color_override("font_hover_color", TEAL.lightened(0.2) if teal else GOLD.lightened(0.2))


func toast(text: String) -> void:
	_toast.text = text
	_toast.modulate.a = 1.0
	_toast_t = 2.4


func _set_phase(p: String) -> void:
	phase = p
	fishing_changed.emit(p != "idle" and p != "result")
	_update_action()


func _act() -> void:
	match phase:
		"idle", "result":
			cast()
		"hooked":
			_dial.strike()


# ── The loop ───────────────────────────────────────────────────────────────────

func cast() -> void:
	if _modal != null or (phase != "idle" and phase != "result") or _action.disabled:
		return
	_close_card()
	_cast_zone = water["id"]
	var res: Dictionary = Fishing.cast_line(session.store, session.uid, _bait, _cast_zone)
	session.persist()
	if res.has("error"):
		toast(res["error"])
		refresh()
		return
	_gen += 1
	var gen: int = _gen
	_shot = res
	_mods = _tackle()
	_wait_left = maxf(float(res["waitMs"]), 760.0) / 1000.0 + 0.05
	if res.get("instantBite") == true:
		_wait_left = 0.82
		Fx.pill(self, "Instant Bite", Vector2(size.x / 2.0, 90.0), Color.WHITE, Color(1.0, 0.23, 0.28, 0.32), Color(1.0, 0.35, 0.39, 0.7), 1.1)
	_since_cast = 0.0
	_set_phase("waiting")
	Rumble.tap(12)
	Sound.cast()
	boat.set_pose("cast")
	get_tree().create_timer(0.6).timeout.connect(func() -> void:
		if gen == _gen and phase != "idle":
			Sound.line_in())
	get_tree().create_timer(0.65).timeout.connect(func() -> void:
		if gen == _gen and phase == "waiting":
			boat.set_pose("wait"))
	refresh()


## What the captain's tackle does to the dial.
func _tackle() -> Dictionary:
	var p: Dictionary = session.profile()
	var rod: Dictionary = Rules.effective_rod(Js.num(p.get("rod_tier")), p.get("completionist_effects"))
	var lines: Array = Rules.data()["lines"]
	var line: Dictionary = lines[clampi(int(Js.num(p.get("line_tier"))), 0, lines.size() - 1)]
	var reels: Array = Rules.data()["reels"]
	var reel: Dictionary = reels[clampi(int(Js.num(p.get("reel_tier"))), 0, reels.size() - 1)]
	return {
		"hook": Js.num(p.get("hook_tier")), "line": float(line["penaltyMultiplier"]), "reel": float(reel["needleSpeedMultiplier"]),
		"rodCatch": Js.num(rod.get("catchZoneBonus")), "rodPerfect": Js.num(rod.get("perfectZoneBonus")),
		"retry": Js.num(rod.get("retryOnMissChance")), "snagImmune": rod.get("snagImmune") == true,
		"baitCatch": Js.num(Rules.bait(_bait).get("catchZoneBonus")), "level": session.level(),
	}


## The Tide Turner: how many skips are left today, or -1 without one seated.
func _skips_left() -> int:
	var p: Dictionary = session.profile()
	if not Js.truthy(p.get("has_tide_turner")) or p.get("equipped_special") != "tide_turner":
		return -1
	var today: String = Js.iso(Clock.now_ms()).split("T")[0]
	var used: float = Js.num(p.get("tide_turner_used")) if p.get("tide_turner_date") == today else 0.0
	return int(3.0 - used)


func _bite() -> void:
	var diff: float = float(_shot["catchDifficulty"])
	var zd: Dictionary = (Rules.data()["dial"]["zoneDifficulty"] as Dictionary).get(_cast_zone, {})
	var zones: Array = Dial.build_zones(diff, _mods["hook"], _mods["line"], float(zd.get("catchMultiplier", 1.0)),
		floor(float(_mods["level"]) * 0.2) + float(_mods["baitCatch"]) + float(_mods["rodCatch"]), float(_mods["rodPerfect"]) + 1.0)
	var speeds: Array = Rules.data()["dial"]["fishDifficultySpeed"]
	var sp: Dictionary = speeds[clampi(int(diff) - 1, 0, 4)]
	var sweep: float = (float(sp["speedMin"]) + randf() * (float(sp["speedMax"]) - float(sp["speedMin"]))) * float(_mods["reel"])
	_dial.streak = _streak()
	_dial.begin(zones, sweep)
	_dial.visible = true
	_dial.modulate.a = 0.0
	_dial.pivot_offset = Vector2(150, 150)
	_dial.scale = Vector2(0.92, 0.92)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(_dial, "modulate:a", 1.0, 0.18)
	tw.tween_property(_dial, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_dots.text = ""
	_timer.text = ""
	_status.text = ""
	var skips: int = _skips_left()
	_tide.visible = skips > 0
	_tide.text = "Tide Turner · Skip · %d left" % skips
	Rumble.buzz(Rumble.BITE)
	Sound.dial_start(diff)
	_set_phase("hooked")


func _skip() -> void:
	if phase != "hooked":
		return
	var r: Dictionary = Fishing.tide_turner_skip(session.store, session.uid)
	session.persist()
	if r.has("error"):
		toast(r["error"])
		return
	_dial.spinning = false
	_dial.visible = false
	_tide.visible = false
	Sound.dial_stop()
	boat.set_pose("rest")
	Rumble.tap(10)
	toast("Thrown back. The streak holds. %d skip%s left today." % [int(r["skipsLeft"]), "" if int(r["skipsLeft"]) == 1 else "s"])
	_set_phase("idle")
	refresh()


func _on_struck(raw: String, _angle: float) -> void:
	var result: String = "miss" if raw == "penalty" and _mods["snagImmune"] else raw
	var landed: bool = result == "perfect" or result == "catch"
	if not landed and float(_mods["retry"]) > 0.0 and randf() < float(_mods["retry"]):
		Rumble.buzz(Rumble.SECOND_WIND)
		Fx.pill(self, "Second Wind", Vector2(size.x / 2.0 + 290.0, size.y / 2.0 - 200.0), Color("#99f6e4"), Color(0.08, 0.3, 0.3, 0.8), Color(0.37, 0.92, 0.83, 0.7), 1.2)
		_dial.respin()
		return
	Sound.dial_stop()
	_tide.visible = false
	boat.set_pose("rest")
	if result == "perfect":
		Sound.perfect()
		Rumble.buzz(Rumble.PERFECT)
		add_child(Fx.PerfectFlash.new())
	elif landed:
		Sound.line_in()
		Rumble.tap(6)
	else:
		Rumble.tap(6)
	if landed:
		boat.splash(result == "perfect")
	_set_phase("reeling")
	await get_tree().create_timer(HOLD_PERFECT_S if result == "perfect" else HOLD_S).timeout
	var before_level: int = session.level()
	var crate: bool = float(_shot["fishId"]) == FishingRules.CRATE_FISH_ID
	var r: Dictionary = {}
	if crate and landed:
		r = Fishing.reel_crate(session.store, session.uid, result)
	elif not crate:
		r = Fishing.reel_in(session.store, session.uid, float(_shot["fishId"]), result, _bait)
	session.persist()
	_dial.visible = false
	_set_phase("result")
	if r.has("error"):
		_note_card("The line went slack", r["error"])
	elif crate and landed:
		_crate_card(r)
	elif r.get("caught") == true:
		_fish_card(r, result == "perfect")
	else:
		_note_card("Snagged" if result == "penalty" else "It got away",
			"The line fouled and took a bait with it." if result == "penalty" else "The line went slack. Cast again.")
	refresh()
	if session.level() > before_level or r.get("isShiny") == true:
		_after_catch(true)


# ── The card, and what follows it ──────────────────────────────────────────────

func _mount_card(c: Control) -> void:
	_close_card()
	_card = c
	_place(c, Vector2(0.5, 0.5), Vector2(110, -250), Vector2(440, 0))
	add_child(c)


func _close_card() -> void:
	if _card != null:
		_card.queue_free()
		_card = null


func _wire(card: ResultCard) -> void:
	card.cast_again.connect(func() -> void: cast())
	card.closed.connect(func() -> void:
		_close_card()
		_set_phase("idle"))
	card.wormhole.connect(func() -> void:
		var w: Dictionary = Fishing.reroll_wormhole(session.store, session.uid)
		session.persist()
		card.set_note(w["error"] if w.has("error") else "Rerolled into %s" % (w["fish"] as Dictionary)["name"])
		refresh())


func _fish_card(r: Dictionary, perfect: bool) -> void:
	var card: ResultCard = ResultCard.new()
	_mount_card(card)
	card.show_fish(r, perfect, _shot)
	_wire(card)
	# The XP rises off the boat; the fish flies to the hold.
	var mid: Vector2 = Vector2(size.x / 2.0, size.y * 0.5 - 70.0)
	Fx.rise(self, "+%s XP%s" % [_thousands(float(r["xpGained"])), "  PERFECT" if perfect else ""], mid, GOLD if perfect else Color("#4ade80"), 20)
	if float(r.get("catchQty", 0.0)) > 0.0 and r.get("isShiny") != true:
		_fly_to_hold(r["fish"], float(r["catchQty"]))


func _crate_card(loot: Dictionary) -> void:
	var m: CrateMoment = CrateMoment.new()
	m.tier = _shot.get("crateTier", "wooden")
	m.loot = loot
	_close_card()
	_card = m
	_place(m, Vector2(0.5, 0.5), Vector2(130, -200), Vector2(360, 0))
	add_child(m)


func _note_card(title: String, body: String) -> void:
	var card: ResultCard = ResultCard.new()
	_mount_card(card)
	card.show_note(title, body)
	_wire(card)


## HoldFlight: the fish, as a dark shape, thrown from the water to the hold;
## the count there changes only when it lands.
func _fly_to_hold(fish: Dictionary, qty: float) -> void:
	var path: String = ResultCard.fish_art_path(fish["name"])
	if not ResourceLoader.exists(path):
		return
	var t: TextureRect = TextureRect.new()
	t.texture = load(path)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.modulate = Color(0.05, 0.1, 0.14, 0.0)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(t)
	t.custom_minimum_size = Vector2(64, 40)
	t.size = Vector2(64, 40)
	t.pivot_offset = Vector2(32, 20)
	var from: Vector2 = Vector2(size.x / 2.0, size.y * 0.42) - t.size / 2.0
	var to: Vector2 = _hold.get_global_rect().get_center() - global_position - t.size / 2.0
	t.position = from
	if qty > 1.0:
		var c: Label = _label(t, "×%d" % int(qty), 14, GOLD, true)
		c.position = Vector2(40, -8)
	var fly: Callable = func(u: float) -> void:
		var x: float = lerpf(from.x, to.x, u * u * (3.0 - 2.0 * u))
		var peak: float = minf(from.y, to.y) - 54.0
		var y: float = lerpf(from.y, peak, u / 0.42) if u < 0.42 else lerpf(peak, to.y, (u - 0.42) / 0.58)
		t.position = Vector2(x, y)
		t.scale = Vector2.ONE * lerpf(1.0, 0.34, u)
		t.modulate.a = clampf(u / 0.22, 0.0, 1.0)
	var tw: Tween = create_tween()
	tw.tween_method(fly, 0.0, 1.0, 0.62)
	tw.tween_callback(func() -> void:
		t.queue_free()
		Rumble.tap(8)
		_hold.pivot_offset = _hold.size / 2.0
		var knock: Tween = create_tween()
		knock.tween_property(_hold, "scale", Vector2(1.14, 1.14), 0.12).set_trans(Tween.TRANS_BACK)
		knock.tween_property(_hold, "scale", Vector2.ONE, 0.22))


## After a catch (and on opening the sea): celebrate levels crossed, then ask
## about any golden still waiting. One at a time.
func _after_catch(from_catch: bool) -> void:
	if session.level() > _level_seen or not from_catch:
		var claim: Dictionary = Fishing.claim_fishing_level_rewards(session.store, session.uid)
		session.persist()
		_level_seen = session.level()
		if float(claim["to"]) > float(claim["from"]):
			var lu: LevelUp = LevelUp.new()
			lu.claim = claim
			_modal = lu
			add_child(lu)
			await lu.closed
			_modal = null
			refresh()
	var held: Variant = Fishing.held_golden(session.store, session.uid)
	while held != null:
		var g: GoldenChoice = GoldenChoice.new()
		g.session = session
		g.golden = held
		_modal = g
		add_child(g)
		await g.answered
		_modal = null
		refresh()
		held = Fishing.held_golden(session.store, session.uid)


func _process(delta: float) -> void:
	if phase == "waiting":
		_wait_left -= delta
		_since_cast += delta
		if _since_cast >= 1.5:
			var n: int = int(_since_cast / 0.22) % 3
			_dots.text = ["●  ·  ·", "·  ●  ·", "·  ·  ●"][n]
			_status.text = "Waiting on a bite"
			if session.profile().get("show_wait_timer") != false:
				_timer.text = "%.1fs" % _since_cast
		if _wait_left <= 0.0:
			_bite()
	if _toast_t > 0.0:
		_toast_t -= delta
		_toast.modulate.a = clampf(_toast_t / 0.6, 0.0, 1.0)


func _unhandled_input(event: InputEvent) -> void:
	if _modal != null:
		return
	if event.is_action_pressed("fish_act"):
		if phase == "idle" or phase == "result":
			cast()
		elif phase == "hooked":
			_dial.strike()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("fish_back"):
		if phase == "waiting" or phase == "hooked":
			_dial.visible = false
			_tide.visible = false
			_status.text = ""
			_dots.text = ""
			_timer.text = ""
			Sound.dial_stop()
			boat.set_pose("rest")
			toast("You walked away. The line is still out.")
			_set_phase("idle")
		elif phase == "result":
			_close_card()
			_set_phase("idle")
		get_viewport().set_input_as_handled()
