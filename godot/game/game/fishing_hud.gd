class_name FishingHud
extends Control
## THE HUD AND THE FISHING LOOP (Godot port, stage 1).
##
## A port of the loop in web/app/(app)/sea/FishingHere.tsx: cast where the
## boat is, wait out the bite, strike on the dial, and read the card. The
## verdicts are the ported rules (Fishing.cast_line / reel_in / reel_crate);
## this only shows them. The save is written after every call.
##
## Phases: idle, waiting, hooked, reeling (the frozen dial holds), result.
## Controls: Space, Enter or the pad's A to cast and to reel in; Escape or B
## to walk away from a cast (it stays out, and resumes on the next cast here,
## as on the web).

signal fishing_changed(active: bool)

const HOLD_S: float = 0.62
const HOLD_PERFECT_S: float = 0.9
const INK: Color = Color("#f0ede8")
const DIM: Color = Color("#a0a09a")
const GOLD: Color = Color("#f0c040")

var session: Session
var water: Dictionary = {}
var phase: String = "idle"

var _shot: Dictionary = {}
var _bait: String = "worm"
var _wait_left: float = 0.0
var _cast_zone: String = ""
var _mods: Dictionary = {}

var _name: Label
var _level: Label
var _xp: ProgressBar
var _purse: Label
var _where: Label
var _blurb: Label
var _clock: Label
var _bait_pick: OptionButton
var _cast: Button
var _status: Label
var _hint: Label
var _dial: Dial
var _card: PanelContainer
var _toast: Label
var _toast_t: float = 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.make()

	var tl: VBoxContainer = _box(Vector2(20, 16), false)
	_name = _label(tl, "", 22, INK, true)
	var row: HBoxContainer = HBoxContainer.new()
	tl.add_child(row)
	_level = _label(row, "", 15, DIM)
	_xp = ProgressBar.new()
	_xp.custom_minimum_size = Vector2(160, 10)
	_xp.show_percentage = false
	_xp.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_xp)
	_purse = _label(tl, "", 17, GOLD, true)

	var tr: VBoxContainer = _box(Vector2(-20, 16), true)
	_where = _label(tr, "", 20, INK, true)
	_blurb = _label(tr, "", 14, DIM)
	_clock = _label(tr, "", 14, DIM)
	for l: Label in [_where, _blurb, _clock]:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT

	var bottom: HBoxContainer = HBoxContainer.new()
	bottom.alignment = BoxContainer.ALIGNMENT_CENTER
	_place(bottom, Vector2(0.5, 1.0), Vector2(-240, -84), Vector2(480, 56))
	bottom.add_theme_constant_override("separation", 12)
	add_child(bottom)
	_bait_pick = OptionButton.new()
	_bait_pick.custom_minimum_size = Vector2(190, 52)
	_bait_pick.item_selected.connect(func(i: int) -> void: _bait = _bait_pick.get_item_metadata(i))
	bottom.add_child(_bait_pick)
	_cast = Button.new()
	_cast.custom_minimum_size = Vector2(170, 52)
	_cast.text = "Cast"
	_cast.pressed.connect(cast)
	bottom.add_child(_cast)

	_status = _label(self, "", 22, INK, true)
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_status, Vector2(0.5, 0.5), Vector2(-10, 150), Vector2(600, 32))
	_hint = _label(self, "", 15, DIM)
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_hint, Vector2(0.5, 0.5), Vector2(-10, 188), Vector2(600, 24))

	_dial = Dial.new()
	# Beside the boat (which is always at the middle of the screen), not over it.
	_place(_dial, Vector2(0.5, 0.5), Vector2(140, -170), Vector2(300, 300))
	_dial.visible = false
	_dial.mouse_filter = Control.MOUSE_FILTER_STOP
	_dial.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and phase == "hooked":
			_dial.strike())
	_dial.struck.connect(_on_struck)
	add_child(_dial)

	_toast = _label(self, "", 18, GOLD, true)
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(_toast, Vector2(0.5, 0.0), Vector2(-300, 90), Vector2(600, 30))
	refresh()


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


func _box(at: Vector2, right: bool) -> VBoxContainer:
	var b: VBoxContainer = VBoxContainer.new()
	_place(b, Vector2(1.0 if right else 0.0, 0.0), at + (Vector2(-360, 0) if right else Vector2.ZERO), Vector2(360, 120))
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


## Everything read off the save: the purse, the level, the bait held.
func refresh() -> void:
	var p: Dictionary = session.profile()
	var lvl: int = session.level()
	var table: Array = Rules.data()["xpTable"]
	var xp: float = Js.num(p.get("fishing_xp"))
	_name.text = session.captain_name()
	_level.text = "Fishing %d  " % lvl
	if lvl >= Rules.MAX_LEVEL:
		_xp.value = 100.0
	else:
		var lo: float = float(table[lvl - 1])
		var hi: float = float(table[lvl])
		_xp.value = 100.0 * (xp - lo) / maxf(1.0, hi - lo)
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
	_update_cast()


static func _thousands(n: float) -> String:
	return Js.thousands(n)


func set_water(w: Dictionary) -> void:
	if w.get("id") == water.get("id"):
		return
	water = w
	_where.text = w.get("name", "Harbor approach")
	_blurb.text = w.get("blurb", "Sail south to fish")
	if not w.is_empty():
		toast(w["name"])
	_update_cast()


func set_clock(label: String) -> void:
	_clock.text = label


func _update_cast() -> void:
	if phase != "idle":
		_cast.disabled = true
		return
	if water.is_empty():
		_cast.disabled = true
		_cast.text = "Sail south to fish"
		return
	var need: float = float((Rules.data()["zones"]["minLevel"] as Dictionary).get(water["id"], 1.0))
	if session.level() < need:
		_cast.disabled = true
		_cast.text = "Needs Fishing %d" % int(need)
		return
	if _bait_pick.item_count == 0:
		_cast.disabled = true
		_cast.text = "No bait"
		return
	_cast.disabled = false
	_cast.text = "Cast"


func toast(text: String) -> void:
	_toast.text = text
	_toast.modulate.a = 1.0
	_toast_t = 2.4


func _set_phase(p: String) -> void:
	phase = p
	fishing_changed.emit(p != "idle")
	_update_cast()


# ── The loop ───────────────────────────────────────────────────────────────────

func cast() -> void:
	if phase != "idle" or _cast.disabled:
		return
	_close_card()
	_cast_zone = water["id"]
	var res: Dictionary = Fishing.cast_line(session.store, session.uid, _bait, _cast_zone)
	session.persist()
	if res.has("error"):
		toast(res["error"])
		refresh()
		return
	_shot = res
	_mods = _tackle()
	_wait_left = maxf(float(res["waitMs"]), 760.0) / 1000.0 + 0.05
	if res.get("instantBite") == true:
		_wait_left = 0.81
	_set_phase("waiting")
	_status.text = "Waiting for a bite"
	_hint.text = "Escape walks away. The line stays out."
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


func _bite() -> void:
	var diff: float = float(_shot["catchDifficulty"])
	var zd: Dictionary = (Rules.data()["dial"]["zoneDifficulty"] as Dictionary).get(_cast_zone, {})
	var zones: Array = Dial.build_zones(diff, _mods["hook"], _mods["line"], float(zd.get("catchMultiplier", 1.0)),
		floor(float(_mods["level"]) * 0.2) + float(_mods["baitCatch"]) + float(_mods["rodCatch"]), float(_mods["rodPerfect"]) + 1.0)
	var speeds: Array = Rules.data()["dial"]["fishDifficultySpeed"]
	var sp: Dictionary = speeds[clampi(int(diff) - 1, 0, 4)]
	var sweep: float = (float(sp["speedMin"]) + randf() * (float(sp["speedMax"]) - float(sp["speedMin"]))) * float(_mods["reel"])
	_dial.begin(zones, sweep)
	_dial.visible = true
	_set_phase("hooked")
	_status.text = "Something is on the line" if float(_shot["fishId"]) != FishingRules.CRATE_FISH_ID else "Something heavy is on the line"
	_hint.text = "Press Space, click the dial, or press A to reel in"


func _on_struck(raw: String, _angle: float) -> void:
	var result: String = "miss" if raw == "penalty" and _mods["snagImmune"] else raw
	var landed: bool = result == "perfect" or result == "catch"
	if not landed and float(_mods["retry"]) > 0.0 and randf() < float(_mods["retry"]):
		toast("Second wind. One more try.")
		_dial.respin()
		return
	_set_phase("reeling")
	_status.text = "Perfect!" if result == "perfect" else ("Hooked" if landed else ("Snagged" if result == "penalty" else "It slipped the hook"))
	_hint.text = ""
	await get_tree().create_timer(HOLD_PERFECT_S if result == "perfect" else HOLD_S).timeout
	var before_level: int = session.level()
	var card: Dictionary
	if float(_shot["fishId"]) == FishingRules.CRATE_FISH_ID:
		if landed:
			var loot: Dictionary = Fishing.reel_crate(session.store, session.uid, result)
			card = { "kind": "error", "text": loot["error"] } if loot.has("error") else { "kind": "crate", "tier": _shot["crateTier"], "loot": loot }
		else:
			card = { "kind": "miss", "result": result }
	else:
		var r: Dictionary = Fishing.reel_in(session.store, session.uid, float(_shot["fishId"]), result, _bait)
		session.persist()
		if r.has("error"):
			card = { "kind": "error", "text": r["error"] }
		elif r.get("caught") == true:
			card = { "kind": "fish", "r": r, "perfect": result == "perfect" }
		else:
			card = { "kind": "miss", "result": result }
	session.persist()
	_dial.visible = false
	_status.text = ""
	if session.level() > before_level:
		toast("Fishing level %d" % session.level())
	_show_card(card)
	_set_phase("result")
	refresh()


func _process(delta: float) -> void:
	if phase == "waiting":
		_wait_left -= delta
		if _wait_left <= 0.0:
			_bite()
	if _toast_t > 0.0:
		_toast_t -= delta
		_toast.modulate.a = clampf(_toast_t / 0.6, 0.0, 1.0)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_act"):
		match phase:
			"idle":
				cast()
			"hooked":
				_dial.strike()
			"result":
				_close_card()
				_set_phase("idle")
				cast()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("fish_back"):
		if phase == "waiting" or phase == "hooked":
			_dial.visible = false
			_status.text = ""
			_hint.text = ""
			toast("You walked away. The line is still out.")
			_set_phase("idle")
		elif phase == "result":
			_close_card()
			_set_phase("idle")
		get_viewport().set_input_as_handled()


# ── The card ───────────────────────────────────────────────────────────────────

func _close_card() -> void:
	if _card != null:
		_card.queue_free()
		_card = null


## The result, arriving in order: the fish springs in, the length a beat later,
## then the ledger left to right. Timing only; the card itself stays flat and
## opaque on the moving water (docs/systems/fishing.md).
func _show_card(card: Dictionary) -> void:
	_close_card()
	_card = PanelContainer.new()
	_card.add_theme_stylebox_override("panel", UiTheme.card())
	_place(_card, Vector2(0.5, 0.5), Vector2(-220, -250), Vector2(440, 0))
	add_child(_card)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	_card.add_child(col)
	var beats: Array[Control] = []

	match card["kind"]:
		"fish":
			var r: Dictionary = card["r"]
			var fish: Dictionary = r["fish"]
			if r.get("isShiny") == true:
				beats.append(_label(col, "A golden one", 15, GOLD, true))
			elif r.get("isNewSpecies") == true:
				beats.append(_label(col, "New species", 15, Color("#7dd3fc"), true))
			beats.append(_label(col, fish["name"], 28, INK, true))
			var art: TextureRect = _fish_art(fish["name"], r.get("isShiny") == true)
			if art != null:
				col.add_child(art)
				beats.append(art)
			var size_line: String = _length(float(r["sizeIn"]))
			if r.has("sizeTier") and (r["sizeTier"] == "large" or r["sizeTier"] == "trophy"):
				size_line += "  ·  " + String(r["sizeTier"]).capitalize()
			if r.get("isPB") == true and r.get("previousBest") != null:
				size_line += "  ·  Personal best"
			beats.append(_label(col, size_line, 17, DIM))
			var ledger: HBoxContainer = HBoxContainer.new()
			ledger.add_theme_constant_override("separation", 18)
			col.add_child(ledger)
			beats.append(_label(ledger, "+%d XP" % int(r["xpCatch"]), 18, INK, true))
			if r.has("perfectBonusXP"):
				beats.append(_label(ledger, "+%d Perfect" % int(r["perfectBonusXP"]), 18, GOLD, true))
			if float(r.get("xpStreak", 0.0)) > 0.0:
				beats.append(_label(ledger, "+%d Streak x%d" % [int(r["xpStreak"]), int(r["perfectStreak"])], 18, Color("#fb923c"), true))
			var extras: Array[String] = []
			if float(r.get("catchQty", 1.0)) > 1.0:
				extras.append("%d in the hold" % int(r["catchQty"]))
			if r.get("baitSaved") == true:
				extras.append("Bait saved")
			if float(r.get("sigilBonus", 0.0)) > 0.0:
				extras.append("Sigil +%d ⟡" % int(r["sigilBonus"]))
			if extras.size() > 0:
				beats.append(_label(col, "  ·  ".join(extras), 15, DIM))
		"crate":
			var loot: Dictionary = card["loot"]
			beats.append(_label(col, "%s crate" % String(card["tier"]).capitalize(), 26, INK, true))
			beats.append(_label(col, _loot_line(loot), 19, GOLD))
			if loot.has("dupePet"):
				beats.append(_label(col, "A %s was in it too. You already have one." % (loot["dupePet"] as Dictionary)["petName"], 14, DIM))
		"miss":
			beats.append(_label(col, "Snagged" if card["result"] == "penalty" else "It got away", 26, INK, true))
			beats.append(_label(col, "The snag cost one extra bait." if card["result"] == "penalty" else "The streak starts again.", 16, DIM))
		"error":
			beats.append(_label(col, card["text"], 18, INK))

	var buttons: HBoxContainer = HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 12)
	col.add_child(buttons)
	var again: Button = Button.new()
	again.text = "Cast again"
	again.pressed.connect(func() -> void:
		_close_card()
		_set_phase("idle")
		cast())
	buttons.add_child(again)
	var close: Button = Button.new()
	close.text = "Close"
	close.pressed.connect(func() -> void:
		_close_card()
		_set_phase("idle"))
	buttons.add_child(close)
	beats.append(buttons)
	again.grab_focus.call_deferred()

	_card.pivot_offset = Vector2(210, 150)
	_card.scale = Vector2(0.92, 0.92)
	_card.modulate.a = 0.0
	var tw: Tween = create_tween()
	tw.tween_property(_card, "modulate:a", 1.0, 0.18)
	tw.parallel().tween_property(_card, "scale", Vector2.ONE, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	for i: int in beats.size():
		var b: Control = beats[i]
		b.modulate.a = 0.0
		var bt: Tween = create_tween()
		bt.tween_interval(0.12 + 0.09 * i)
		bt.tween_property(b, "modulate:a", 1.0, 0.22)


func _fish_art(fish_name: String, golden: bool) -> TextureRect:
	var slug: String = fish_name.to_lower().replace(" ", "-")
	var clean: String = ""
	for ch: String in slug:
		if (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9") or ch == "-":
			clean += ch
	var path: String = "res://art/fish/%s.png" % clean
	if not ResourceLoader.exists(path):
		return null
	var t: TextureRect = TextureRect.new()
	t.texture = load(path)
	t.custom_minimum_size = Vector2(380, 190)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	if golden:
		var m: ShaderMaterial = ShaderMaterial.new()
		m.shader = load("res://game/golden.gdshader")
		t.material = m
	return t


static func _length(inches: float) -> String:
	if inches <= 0.0:
		return ""
	if inches < 36.0:
		return "%.1f in" % inches
	var rounded: int = int(Js.round(inches))
	return "%d' %d in" % [rounded / 12, rounded % 12]


static func _loot_line(loot: Dictionary) -> String:
	match loot["type"]:
		"doubloons":
			return "+%s ⟡" % _thousands(float(loot["amount"]))
		"bait":
			return "%d %s" % [int(loot["quantity"]), loot["baitName"]]
		"skin":
			return "New color: %s" % loot["skinName"]
		"hat":
			return "New hat: %s" % loot["hatName"]
		"boat":
			return "New boat: %s" % loot["boatName"]
		"pet":
			return "A new companion: %s" % loot["petName"]
	return ""
