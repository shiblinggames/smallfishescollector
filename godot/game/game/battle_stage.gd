class_name BattleStage
extends Control
## THE FIGHT ON THE WATER (Kong, 2026-10-03: a battle screen of its own for a
## raid's set run of enemies, "but a super seamless cut from the sea", and a
## free hand on the look "utilizing Godot and for multiplayer"). The sea
## itself becomes the screen: the camera eases onto the two of you, black
## bars slide in top and bottom, the HUD of the sea falls away and the deck
## rises; the enemy is a real hull in the same water, sailing in from the
## right with its portrait over the masthead. Nothing is swapped, so there is
## no seam to hide.
##
##   THE DECK   Fire (1), Volley (3), Reload, Dodge (keys 1 to 4), your
##              charges, and your crew's orders as cards (one a turn, each
##              once a raid; a heal or shield may go to a crewmate's ship).
##              Fire or Volley brings up the aim bar in the deck's place.
##   A ROUND    plays as a show: crew orders pop as cards, the turn strip at
##              the top lights each ship as it acts, cannonballs arc across
##              the water, splashes, splinters and numbers; a sinking hull
##              goes under; after a kill the next enemy sails in.
##   THE END    the crate (or, sunk, the sail back to the Gunwharf).
## Rules: core/battle.gd and core/raid_run.gd.
##
## TOGETHER (a Charter's raid, game/raid_table.gd): the founder's game runs the
## fight and every screen follows it. Each captain sits in their own seat of the
## line with their own deck; a round is planned by all, then played on every
## screen from the same events; the flares and the tides are each one's own.
## A captain sunk or got away leaves the screen; the rest fight on.

signal finished(won: bool)

const BAR: float = 74.0
const NIGHT: Color = Color("#1a1512")
const BRASS: Color = Color(0.86, 0.68, 0.36)
const CREAM: Color = Color(0.96, 0.92, 0.84)
## Ink on the night paper.
const NIGHT_INK: Color = Color(0.93, 0.88, 0.78)

var sea: Sea
var raid_id: String = "corsairs_reckoning"
var b: Dictionary = {}
var _raid: Dictionary = {}
var _at: Vector2
var _enemy_at: Vector2
var _enemy: HullRig
var _fx: BattleFx
var _bars: float = 0.0
var _deck: Control
var _deck_box: VBoxContainer
var _log: Label
var _strip: Array = []
var _strip_lit: int = -99
var _plan: Dictionary = {}
var _busy: bool = true
var _numbers: Array = []
var _banner: Label
var _banner_t: float = -1.0
var _t: float = 0.0
var _portrait: Texture2D
var _shown_hp: Dictionary = {}
## How far the deck has sunk below its place (it rises in, sinks out).
var _drop: float = 260.0
var _from: Vector2
## Out on the campaign's water: the dock she fights from, and the hull riding
## at anchor there (it becomes the enemy it stands for: the skirmish's raider,
## a raid's boss, who waits at anchor while their crew come at you first).
var dock: Vector2 = Vector2.INF
var mark: CampaignWater.Ship = null
var _began_ms: int = 0
## What each hull is wearing (fire, ice, shields, wards, the Last Wall).
var _auras: Dictionary = {}
## Together: the Charter's raid this screen follows, this captain's key and seat.
var table: RaidTable = null
var my_key: String = ""
var me: int = 0
var _latest: Dictionary = {}
var _handled: String = ""
var _pumping: bool = false
var _gone: bool = false
var _spoke: bool = false
var _plan_until: float = 0.0
## A crossfire's lines from the ships to the enemy, fading (seconds left).
var _xfire_seats: Array = []
var _xfire_t: float = 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.make()
	_raid = Battle.raid_def(raid_id)
	if table != null:
		b = (table.state["b"] as Dictionary).duplicate(true)
		for i: int in (b["seats"] as Array).size():
			if b["seats"][i].get("key") == my_key:
				me = i
	else:
		var seat: Dictionary = Battle.seat_for(sea.session.store, sea.session.uid, str(sea.session.profile().get("username", "You")))
		b = Battle.begin(raid_id, [seat])
	# Out from wherever she lay into open water: the fight's own patch of sea.
	# Out through the Sea Gate into open water: the fight's own patch of sea
	# (until the campaign's water is in the port, its fights are sailed out
	# to from the Gunwharf). She sails back when it is over.
	_from = sea._boat.position
	_began_ms = Time.get_ticks_msec()
	_at = dock if dock != Vector2.INF else North.SEA_GATE + Vector2(-300, -1300)
	_enemy_at = _at + Vector2(620, -40)
	sea._boat.velocity = Vector2.ZERO
	sea._boat.target = null
	sea._boat.hold_still = true
	# The line faces the enemy, off to the east.
	sea._boat.face_to(1.0)
	for k: Variant in sea._mates:
		(sea._mates[k] as Shipmate).face_lock = 1.0 if table != null else 0.0
	var sail: Tween = create_tween()
	sail.tween_property(sea._boat, "position", _at + _offset(me), 2.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	sea._hud.visible = false
	_fx = BattleFx.new()
	_fx.field = sea._field
	_fx.z_index = 6
	sea._world.add_child(_fx)
	_frame()
	_banner = Kit.text(self, "", "display", CREAM)
	_banner.add_theme_font_size_override("font_size", 44)
	_banner.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	_banner.add_theme_constant_override("shadow_outline_size", 12)
	_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_banner.offset_left = -500
	_banner.offset_right = 500
	_banner.offset_top = BAR + 40
	_banner.offset_bottom = BAR + 110
	_banner.modulate.a = 0.0
	_build_deck()
	var tw: Tween = create_tween()
	tw.tween_property(self, "_bars", 1.0, 0.7).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	Sound.horn()
	await sail.finished
	# Where she actually lies (a rock may have held her short).
	_at = sea._boat.position - _offset(me)
	_enemy_at = _at + Vector2(620, -40)
	if _from_mark():
		_enemy_at = mark.position
	_frame()
	var aura: HullAura = HullAura.new()
	aura.width = 300.0
	aura.face = 1.0
	aura.z_index = 2
	sea._boat.add_child(aura)
	_auras[me] = aura
	if table != null:
		table.changed.connect(_pump)
		_pump(table.state)
		return
	await _pre_fight_words()
	await _enemy_enters()
	_await_plan()


## The camera's frame on the fight: centred between the two, zoomed so the
## pair fills the middle of the screen.
func _frame() -> void:
	var vp: Vector2 = get_viewport_rect().size
	# Every ship in the line in the frame (together), the enemy facing them.
	var lo: Vector2 = _at
	var hi: Vector2 = _at
	for i: int in (b["seats"] as Array).size() if not b.is_empty() else 1:
		lo = lo.min(_at + _offset(i))
		hi = hi.max(_at + _offset(i))
	var span: float = absf(_enemy_at.x - lo.x) + 520.0
	var tall: float = (hi.y - lo.y) * Chart.GROUND + 520.0
	var z: float = clampf(minf(vp.x * 0.72 / span, vp.y * 0.62 / tall), 0.45, 1.5)
	var mid: Vector2 = Vector2((lo.x + _enemy_at.x) / 2.0, ((lo.y + hi.y) / 2.0 + _enemy_at.y) / 2.0) - (_at + _offset(me))
	sea.stage = { "zoom": z, "shift": Vector2(mid.x, mid.y * Chart.GROUND - 40.0) * z }


func _process(delta: float) -> void:
	_t += delta
	if not b.is_empty():
		for i: int in (b["seats"] as Array).size():
			var a0: HullAura = _aura(i)
			if a0 == null and i != me:
				a0 = _mate_aura(i)
			if a0 == null:
				continue
			var s0: Dictionary = b["seats"][i]
			a0.burn = not Js.obj(s0.get("burn")).is_empty()
			a0.ice = s0.get("frozenNow", false) or float(s0.get("freeze", 0.0)) > 0.0
			a0.shield = float(s0["shield"])
			if i == me:
				sea._boat.modulate = Color(0.75, 0.88, 1.0) if a0.ice else Color.WHITE
		var ae: HullAura = _aura("e")
		if ae != null and is_instance_valid(ae):
			var e0: Dictionary = b["enemy"]
			ae.burn = not Js.obj(e0.get("burn")).is_empty()
			ae.ice = e0.get("frozenNow", false) or float(e0.get("freeze", 0.0)) > 0.0
			ae.shield = float(e0["shield"])
			ae.ward = float(e0.get("ward", 0.0)) > 0.0
			ae.foresight = float(e0.get("foresight", 0.0)) > 0.0
			ae.surge = float(e0.get("wardBuff", 0.0)) > 0.0
			var ag: Dictionary = Js.obj(e0.get("aegis"))
			ae.wall_left = float(ag.get("left", 0.0))
			ae.wall_of = float(ag.get("of", 0.0))
			if _enemy != null and is_instance_valid(_enemy):
				_enemy.modulate = Color(0.75, 0.88, 1.0) if ae.ice else Color.WHITE
	if _deck != null:
		_deck.offset_top = -BAR - 150.0 + _drop
		_deck.offset_bottom = -BAR + 6.0 + _drop
	for n: Dictionary in _numbers:
		n["t"] = float(n["t"]) + delta
	_numbers = _numbers.filter(func(n: Dictionary) -> bool: return float(n["t"]) < 1.4)
	if _banner_t >= 0.0:
		_banner_t += delta
		_banner.modulate.a = clampf(_banner_t / 0.2, 0.0, 1.0) * (1.0 - smoothstep(1.6, 2.1, _banner_t))
		if _banner_t > 2.1:
			_banner_t = -1.0
	queue_redraw()


# ── The screen positions of things on the water ──────────────────────────────

func _screen(world_p: Vector2) -> Vector2:
	return sea._world.get_global_transform_with_canvas() * world_p


## Where seat i rides in the line, from the first seat's place.
static func _offset(i: int) -> Vector2:
	return [Vector2.ZERO, Vector2(-300, 300), Vector2(-300, -300), Vector2(-600, 0)][clampi(i, 0, 3)]


func _seat_at(i: int) -> Vector2:
	if i == me:
		return sea._boat.position if sea != null else _at + _offset(i)
	var m: Shipmate = _mate_of(i)
	return m.position if m != null else _at + _offset(i)


## A crewmate's hull on this screen (together), by their seat.
func _mate_of(i: int) -> Shipmate:
	if table == null or sea == null or i >= (b["seats"] as Array).size():
		return null
	var k: String = str(b["seats"][i].get("key", ""))
	var m: Variant = sea._mates.get(k)
	return m if m != null and is_instance_valid(m) else null


func _mate_aura(i: int) -> HullAura:
	var m: Shipmate = _mate_of(i)
	if m == null:
		return null
	var a: HullAura = HullAura.new()
	a.width = 300.0
	a.face = 1.0
	a.z_index = 2
	m.add_child(a)
	_auras[i] = a
	return a


# ── The enemy ────────────────────────────────────────────────────────────────

func _enemy_enters() -> void:
	var e: Dictionary = b["enemy"]
	if _enemy != null:
		_enemy.queue_free()
	_enemy = HullRig.new()
	_enemy.tex = Skipper.tex(str(e["image"]).trim_prefix("/"))
	_enemy.def = {}
	_enemy.box = 400.0 if e["boss"] else 340.0
	_enemy.face = -1.0
	var at_anchor: bool = _from_mark()
	_enemy_at = mark.position if at_anchor else _at + Vector2(620, 60 if mark != null else -40)
	_enemy.position = _enemy_at if at_anchor else _enemy_at + Vector2(900, 30)
	_enemy.z_index = 1
	sea._world.add_child(_enemy)
	var ea: HullAura = HullAura.new()
	ea.width = _enemy.box
	ea.face = -1.0
	_enemy.add_child(ea)
	_auras["e"] = ea
	if at_anchor:
		# The hull at anchor IS this one: it swaps in place, weighing anchor.
		mark.visible = false
		_frame()
		for k: int in 4:
			sea._field.ring(_enemy_at + Vector2(randf_range(-60, 60), 10), 120.0, 1.3, 0.5)
	_portrait = Skipper.tex(str(e.get("portrait", "")).trim_prefix("/"))
	_shown_hp["e"] = float(e["hp"])
	var f: Dictionary = Battle.fight_at(_raid, int(b["fight"]))
	_say("%s%s" % [("Boss: " if e["boss"] else ("Elite: " if e.get("elite", false) else "")), e["name"]])
	var notes: Array = ["Fight %d of %d" % [int(b["fight"]) + 1, int(f["of"])]]
	var af: Dictionary = e["affix"]
	if not af.is_empty():
		notes.append("%s: %s" % [af.get("name", ""), af.get("description", "")])
	if float(e["dr"]) > 0.0:
		notes.append("%s: takes %d%% less from a single shot" % [e["drName"], int(round(float(e["dr"]) * 100.0))])
	var rp: Variant = b["seats"][me].get("repossessed")
	if rp != null:
		notes.append("%s: %s takes back your %s for this fight" % [e["repossessName"], e["name"], Armory.item(str(rp)).get("name", "gear")])
	_log_line("  ·  ".join(PackedStringArray(notes)))
	if at_anchor:
		await _wait(1.1)
		return
	_frame()
	var tw: Tween = create_tween()
	tw.tween_property(_enemy, "position", _enemy_at, 1.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	for k: int in 6:
		tw.parallel().tween_callback(func() -> void: sea._field.ring(_enemy.position + Vector2(60, 10), 90.0, 1.2, 0.4)).set_delay(0.25 * k)
	await tw.finished


## Is this fight the hull riding at anchor (the skirmish's one raider, or a
## raid's boss)?
func _from_mark() -> bool:
	if mark == null or b.is_empty():
		return false
	return _raid.get("skirmish", false) == true or Battle.fight_at(_raid, int(b["fight"]))["boss"] == true


# ── The deck ─────────────────────────────────────────────────────────────────

func _build_deck() -> void:
	_deck = Control.new()
	_deck.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_deck.offset_left = -520
	_deck.offset_right = 520
	_deck.offset_top = -BAR - 150
	_deck.offset_bottom = -BAR + 6
	_deck.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_deck)
	# The expedition side's night paper.
	var sheet: Control = Control.new()
	sheet.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	sheet.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_deck.add_child(sheet)
	Paper.night = true
	Paper.sheet(sheet, 6.0)
	Paper.night = false
	var pad: MarginContainer = MarginContainer.new()
	pad.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: Array in [["left", 20], ["right", 20], ["top", 14], ["bottom", 12]]:
		pad.add_theme_constant_override("margin_" + side[0], side[1])
	_deck.add_child(pad)
	_deck_box = VBoxContainer.new()
	_deck_box.add_theme_constant_override("separation", 8)
	pad.add_child(_deck_box)
	_log = Kit.text(self, "", "body_strong", CREAM)
	_log.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_log.offset_left = -470
	_log.offset_right = 470
	_log.offset_top = -BAR - 186
	_log.offset_bottom = -BAR - 156
	_log.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_log.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	_log.add_theme_constant_override("shadow_outline_size", 8)
	create_tween().tween_property(self, "_drop", 0.0, 0.6).set_delay(0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _clear_deck() -> void:
	for c: Node in _deck_box.get_children():
		c.queue_free()


## Films and tests: the deck plays itself (fire when loaded, else reload;
## the aim locks after a moment).
var autoplay: bool = false


func _await_plan() -> void:
	_busy = false
	_plan = {}
	_paint_actions()
	# The deck rises back for your turn.
	create_tween().tween_property(self, "_drop", 0.0, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if autoplay:
		await _wait(0.3)
		var s: Dictionary = b["seats"][me]
		var lg: Dictionary = Battle.legal(b, s)
		if float(b["turn"]) == 2.0 and not (s["crew"] as Array).is_empty() and Battle.ability_ok(b, s, s["crew"][0]["id"]) == "":
			_plan["ability"] = { "crew": s["crew"][0]["id"], "target": me }
			_paint_actions()
			await _wait(0.4)
		_choose("volley" if lg["volley"] else ("fire" if lg["fire"] and Dice.next() < 0.6 else "reload"))
		if _plan.get("action") in ["fire", "volley"]:
			await _wait(randf_range(0.4, 1.0))
			for bar: Node in find_children("", "AimBar", true, false):
				(bar as AimBar).lock()


func _paint_actions() -> void:
	_clear_deck()
	var s: Dictionary = b["seats"][me]
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 10)
	_deck_box.add_child(top)
	var lg: Dictionary = Battle.legal(b, s)
	var acts: Array = [["fire", "Fire", "1 ball", KEY_1], ["volley", "Volley", "3 balls, double", KEY_2], ["reload", "Reload", "+1 ball", KEY_3], ["dodge", "Dodge", "brace to slip a shot", KEY_4]]
	var mg: Dictionary = Js.obj(s.get("mega"))
	if not mg.is_empty():
		acts.insert(2, ["mega", str(mg["name"]), str(mg.get("tagline", "")), KEY_6])
	for a: Array in acts:
		var on: bool = lg.get(a[0], false)
		Paper.night = true
		var bt: Button = Paper.button("%s  ·  %s" % [a[1], str(a[3] - KEY_0)], a[0] == "fire" and on)
		Paper.night = false
		bt.disabled = not on
		bt.tooltip_text = a[2]
		bt.custom_minimum_size = Vector2(150 if acts.size() <= 4 else 118, 44)
		var act: String = a[0]
		bt.pressed.connect(func() -> void: _choose(act))
		top.add_child(bt)
	var drum: Dictionary = Battle.drum_of(s)
	if not drum.is_empty():
		Paper.night = true
		var db: Button = Paper.button("%s  ·  5" % drum["name"] if not s.get("drum", false) else "%s  ·  beaten" % drum["name"])
		Paper.night = false
		db.disabled = s.get("drum", false) or (s["used"] as Array).is_empty()
		db.tooltip_text = str(drum.get("description", ""))
		db.custom_minimum_size = Vector2(150, 44)
		db.pressed.connect(_beat_drum)
		top.add_child(db)
	var sp: Control = Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(sp)
	Paper.night = true
	var fl: Button = Paper.button("Flee  ·  F")
	Paper.night = false
	fl.tooltip_text = "Roll to get away: a %d or better on a d20. A miss takes a parting shot." % Battle.flee_need(b, me)
	fl.custom_minimum_size = Vector2(96, 44)
	fl.pressed.connect(_flee)
	top.add_child(fl)
	var pips: Control = Control.new()
	pips.custom_minimum_size = Vector2(120, 44)
	pips.draw.connect(func() -> void:
		var f: Font = Kit.font("karla", 700)
		pips.draw_string(f, Vector2(0, 14), "BALLS", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(NIGHT_INK, 0.6))
		for k: int in int(s["maxCharges"]):
			var c: Vector2 = Vector2(14 + k * 28, 30)
			var full: bool = k < int(s["charges"])
			if full:
				pips.draw_circle(c, 10.0, Color(0.85, 0.68, 0.36, 0.55))
				pips.draw_circle(c, 8.5, Color(0.12, 0.12, 0.13))
				pips.draw_circle(c + Vector2(-3, -3), 3.0, Color(1, 1, 1, 0.35))
			else:
				pips.draw_arc(c, 8.5, 0.0, TAU, 24, Color(NIGHT_INK, 0.3), 1.5, true))
	top.add_child(pips)
	# The crew's orders.
	var crew: Array = s["crew"]
	if not crew.is_empty():
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		_deck_box.add_child(row)
		Kit.text(row, "ORDERS", "eyebrow", Color(NIGHT_INK, 0.6)).size_flags_vertical = Control.SIZE_SHRINK_CENTER
		for c: Dictionary in crew:
			row.add_child(_order_card(s, c))
	_target_row()


func _order_card(s: Dictionary, c: Dictionary) -> Control:
	var why: String = Battle.ability_ok(b, s, c["id"])
	var chosen: bool = Js.obj(_plan.get("ability")).get("crew") == c["id"]
	var cls: Dictionary = Js.obj(Js.obj(Crew.t().get("classes")).get(c["cls"]))
	var col: Color = Color(str(cls.get("color", "#cccccc")))
	var bt: Button = Button.new()
	bt.flat = true
	bt.focus_mode = Control.FOCUS_NONE
	bt.custom_minimum_size = Vector2(150, 56)
	bt.disabled = why != ""
	bt.tooltip_text = "%s  ·  %s" % [cls.get("name", ""), Js.obj(c["ms"]).get("desc", "")] if why == "" else why
	var h: HBoxContainer = HBoxContainer.new()
	h.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_theme_constant_override("separation", 6)
	bt.add_child(h)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex("card_thumbs/%s.png" % str(c["filename"]).get_basename())
	pic.custom_minimum_size = Vector2(48, 56)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pic.modulate = Color(1, 1, 1, 0.35 if why != "" else 1.0)
	h.add_child(pic)
	var v: VBoxContainer = VBoxContainer.new()
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_theme_constant_override("separation", 0)
	h.add_child(v)
	Kit.text(v, str(c["name"]), "small", NIGHT_INK if why == "" else Color(NIGHT_INK, 0.4))
	Kit.text(v, ("READY" if chosen else str(cls.get("shortLabel", ""))) if why == "" else ("USED" if why.begins_with("Already") else why.to_upper()), "eyebrow", col.lightened(0.25) if why == "" else Color(NIGHT_INK, 0.35))
	var ring: Panel = Panel.new()
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(col, 0.18 if chosen else 0.06)
	sb.border_color = Color(col, 0.95 if chosen else 0.35)
	sb.set_border_width_all(2 if chosen else 1)
	sb.set_corner_radius_all(8)
	ring.add_theme_stylebox_override("panel", sb)
	ring.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ring.show_behind_parent = true
	bt.add_child(ring)
	bt.pressed.connect(func() -> void:
		if chosen:
			_plan.erase("ability")
		else:
			_plan["ability"] = { "crew": c["id"], "target": me }
			Sound.plip()
		_paint_actions())
	return bt


## The crew orders that may go to another ship in the line.
const SHARED_ORDERS: Array = ["mender", "abyssal_tide", "anchor", "vengeance"]


## Together: a heal, shield, brace or ward ordered this turn may go to a crewmate.
func _target_row() -> void:
	var ab: Dictionary = Js.obj(_plan.get("ability"))
	if ab.is_empty() or table == null or Battle.alive(b).size() < 2:
		return
	var cls: String = ""
	for c: Dictionary in b["seats"][me]["crew"]:
		if c["id"] == ab["crew"]:
			cls = str(c["cls"])
	if cls not in SHARED_ORDERS:
		return
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_deck_box.add_child(row)
	Kit.text(row, "TO", "eyebrow", Color(NIGHT_INK, 0.6)).size_flags_vertical = Control.SIZE_SHRINK_CENTER
	for i: int in (b["seats"] as Array).size():
		var st: Dictionary = b["seats"][i]
		if not Battle.alive(b).has(st):
			continue
		Paper.night = true
		var bt: Button = Paper.button("%s  ·  %d / %d" % ["Your ship" if i == me else str(st["name"]), int(st["hp"]), int(st["max"])], int(ab.get("target", me)) == i)
		Paper.night = false
		bt.custom_minimum_size = Vector2(150, 36)
		var at: int = i
		bt.pressed.connect(func() -> void:
			_plan["ability"]["target"] = at
			Sound.plip()
			_paint_actions())
		row.add_child(bt)


func _unhandled_input(e: InputEvent) -> void:
	if _busy or not (e is InputEventKey) or not (e as InputEventKey).pressed or (e as InputEventKey).echo:
		return
	var m: Dictionary = { KEY_1: "fire", KEY_2: "volley", KEY_3: "reload", KEY_4: "dodge", KEY_6: "mega" }
	if (e as InputEventKey).keycode == KEY_F:
		get_viewport().set_input_as_handled()
		_flee()
		return
	var kc: int = (e as InputEventKey).keycode
	if kc == KEY_5 and not Battle.drum_of(b["seats"][me]).is_empty():
		get_viewport().set_input_as_handled()
		_beat_drum()
		return
	if m.has(kc) and Battle.legal(b, b["seats"][me]).get(m[kc], false):
		get_viewport().set_input_as_handled()
		_choose(m[kc])


func _choose(act: String) -> void:
	if _busy:
		return
	_plan["action"] = act
	if act == "fire" or act == "volley" or act == "mega":
		_busy = true
		_clear_deck()
		var s: Dictionary = b["seats"][me]
		var bar: AimBar = AimBar.new()
		bar.enemy_speed = float(b["enemy"]["speed"])
		bar.nav = float(s["nav"])
		var sh: Dictionary = s["sharp"]
		# A Sharpshot ordered this turn widens the gold band now.
		var ab: Dictionary = Js.obj(_plan.get("ability"))
		for c: Dictionary in s["crew"]:
			if not ab.is_empty() and c["id"] == ab["crew"] and c["cls"] == "sharpshot":
				sh = { "mult": c["ms"]["critZoneMultiplier"] }
		var aim: Dictionary = Battle.aim_for(b, me)
		bar.crit_w = Battle.CRIT_W * (1.0 + float(sh.get("mult", 0.0))) * float(aim["critZone"])
		bar.volley = act != "fire"
		bar.zone_stack = float(aim["zoneStack"])
		bar.needle_mult = float(aim["needleMult"])
		bar.crit_drift = float(aim["critDrift"])
		bar.fog = float(aim["fog"])
		bar.afflict = str(aim["afflict"])
		bar.decoy_n = int(aim["decoys"])
		bar.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		_deck_box.add_child(bar)
		var res: String = await bar.locked
		_plan["aim"] = res
		await get_tree().create_timer(0.3).timeout
	_busy = true
	_clear_deck()
	if table != null:
		_act(["plan", _plan])
		_waiting()
		return
	# The deck dips out of the way while the round plays on the water.
	create_tween().tween_property(self, "_drop", 190.0, 0.2).set_ease(Tween.EASE_IN)
	_play(Battle.resolve(b, [_plan]))


# ── Playing a round ──────────────────────────────────────────────────────────

func _play(ev: Array) -> void:
	await _play_events(ev)
	_strip_lit = -99
	if b.has("flares") and b["state"] == "plan":
		await _flares()
	match b["state"]:
		"fled":
			await _got_away()
		"won":
			await _won()
		"lost":
			await _lost()
		_:
			_await_plan()


func _play_events(ev: Array) -> void:
	var i: int = 0
	while i < ev.size():
		var x: Dictionary = ev[i]
		if x["t"] == "eBroadside":
			# Every ship's shot of a broadside together, not one by one.
			var group: Array = []
			i += 1
			while i < ev.size() and ev[i]["t"] == "eShot" and ev[i].get("all", false):
				group.append(ev[i])
				i += 1
			await _broadside(x, group)
			continue
		await _one(x)
		i += 1


func _one(x: Dictionary) -> void:
	var e: Dictionary = b["enemy"]
	match x["t"]:
		"ability":
			await _ability_card(x)
		"order":
			_strip = x["order"]
		"reload":
			_strip_lit = int(x["seat"])
			_puff(_seat_at(int(x["seat"])), "+1 ball", CREAM)
			Sound.plip()
			await _wait(0.25)
		"brace":
			_strip_lit = int(x["seat"])
			_puff(_seat_at(int(x["seat"])), "Bracing", Color(0.7, 0.85, 1.0))
			await _wait(0.25)
		"shot":
			_strip_lit = int(x["seat"])
			var land: String = "dodge" if x.get("dodged", false) else ("miss" if x["aim"] == "miss" else ("crit" if x["aim"] == "critical" else "hit"))
			var mid: String = str(x.get("mega", ""))
			if x["action"] == "mega":
				var mg2: Dictionary = Armory.augment(mid)
				_say(str(mg2.get("name", "")) + "!")
				var col: Color = Color(str(mg2.get("color", "#ffffff")))
				match mid:
					"railgun":
						await _fx.beam(_seat_at(int(x["seat"])), _enemy_at, col, x.get("grazed", false))
					"barrage":
						for k: int in 4:
							_fx.shot(_seat_at(int(x["seat"])) + Vector2(40, 0), _enemy_at + Vector2(randf_range(-40, 40), 0), land, 2, true)
							await _wait(0.11)
						await _wait(0.4)
					_:
						await _fx.shot(_seat_at(int(x["seat"])) + Vector2(40, 0), _enemy_at, "miss" if land in ["miss", "dodge"] else "hit", 1, true)
						if land not in ["miss", "dodge"]:
							_fx.blast(_enemy_at)
			else:
				await _fx.shot(_seat_at(int(x["seat"])) + Vector2(40, 0), _enemy_at, land, 3 if x["action"] == "volley" else 1, x["action"] == "volley")
			if x.get("dodged", false):
				_enemy.heel = -0.12
				_num(_enemy_at, "Slipped it!", Color(0.85, 0.85, 0.85))
			elif float(x["dmg"]) > 0.0 or x["aim"] != "miss":
				_enemy.heel = 0.08 if land != "crit" else 0.16
				_num(_enemy_at, ("%d!" % int(x["dmg"])) if land == "crit" else str(int(x["dmg"])), Color(1.0, 0.85, 0.35) if land == "crit" else CREAM, land == "crit")
				if x.has("shielded"):
					_num(_enemy_at + Vector2(-40, -30), "-%d shield" % int(x["shielded"]), Color(0.55, 0.8, 1.0))
			else:
				_num(_enemy_at, "Miss", Color(0.8, 0.8, 0.8))
			_shown_hp["e"] = float(x["enemyHp"])
			if x.has("crossfire") and not x.get("dodged", false):
				_num(_enemy_at + Vector2(0, -150), "Crossfire  x%s" % str(snappedf(float(x["crossfire"]), 0.01)), Color(1.0, 0.85, 0.35))
			await _wait(0.15)
		"intent":
			pass
		"eReload":
			_strip_lit = -1
			_puff(_enemy_at, "Reloads", Color(CREAM, 0.8))
			await _wait(0.25)
		"eDodge":
			_strip_lit = -1
			_enemy.heel = -0.1
			_puff(_enemy_at, "Evades", Color(0.75, 0.85, 1.0))
			await _wait(0.2)
		"eSpecial":
			_strip_lit = -1
			_say(str(x.get("name", "")))
			_log_line(str(x.get("line", "")))
			await _wait(0.9)
		"eShot":
			_strip_lit = -1
			var ti: int = int(x["target"])
			var land2: String = "dodge" if x.get("dodged", false) else ("crit" if x["crit"] else "hit")
			await _fx.shot(_enemy_at + Vector2(-40, 0), _seat_at(ti), land2, 3 if x["action"] == "volley" else 1, x["action"] != "fire")
			if x.get("dodged", false):
				_num(_seat_at(ti), "Dodged!", Color(0.6, 0.9, 1.0))
			else:
				_num(_seat_at(ti), ("%d!" % int(x["dmg"])) if x["crit"] else str(int(x["dmg"])), Color(1.0, 0.45, 0.35), x["crit"])
				if x.get("braced", false):
					_num(_seat_at(ti) + Vector2(0, -40), "Braced", Color(0.7, 0.85, 1.0))
				Rumble.buzz([0, 40] if not x["crit"] else [0, 60, 30, 60])
			_shown_hp[ti] = float(x["hp"])
			await _wait(0.15)
		"phase":
			_say(str(x.get("badge", "")) if str(x.get("badge", "")) != "" else str(e["name"]) + " rises again!")
			_log_line(str(x.get("line", "")))
			if not Js.obj(x.get("aegis")).is_empty():
				_num(_enemy_at + Vector2(-120, -80), "%s rises" % x["aegis"]["name"], Color(0.75, 0.82, 0.9), true)
			_shown_hp["e"] = float(x["hp"])
			Sound.horn()
			await _wait(1.2)
		"sunkEnemy":
			var tw: Tween = _enemy.create_tween()
			tw.tween_property(_enemy, "sink", 1.0, 1.8).set_ease(Tween.EASE_IN)
			_fx.burst(_enemy_at, true)
			Sound.chest(true)
			await _wait(1.0)
		"checkArm":
			_say(str(x.get("name", "")))
			_log_line("%s  ·  answer it within %d turns with the right crew order" % [x.get("telegraph", ""), int(x["turns"])])
			await _wait(1.0)
		"checkMet":
			_log_line(str(x.get("line", "Countered!")))
			Sound.perfect()
			await _wait(0.8)
		"checkFail":
			_log_line(str(x.get("line", "")))
			Rumble.buzz([0, 60, 30, 60])
			await _wait(0.9)
		"cheat":
			_say("The anchor holds!" if x.get("anchor", false) else "The ward holds!")
			_shown_hp[int(x["seat"])] = float(x["hp"])
			await _wait(0.9)
		"sunk":
			_say("Holed below the waterline")
			await _wait(0.8)
		"burn":
			var si: int = int(x["seat"])
			_num(_seat_at(si), "-%d  burning" % int(x["dmg"]), Color(1.0, 0.55, 0.25))
			_shown_hp[si] = float(x["hp"])
			Sound.impact(false)
			await _wait(0.35)
		"eBurn":
			_num(_enemy_at, "-%d  burning" % int(x["dmg"]), Color(1.0, 0.55, 0.25))
			_shown_hp["e"] = float(x["hp"])
			await _wait(0.35)
		"frozen":
			_strip_lit = int(x["seat"])
			_num(_seat_at(int(x["seat"])), "Frozen solid", Color(0.75, 0.9, 1.0), true)
			await _wait(0.6)
		"eFrozen":
			_strip_lit = -1
			_num(_enemy_at, "Frozen solid", Color(0.75, 0.9, 1.0), true)
			await _wait(0.6)
		"ablaze":
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "Set ablaze!", Color(1.0, 0.5, 0.2))
		"iced":
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "Iced over!", Color(0.75, 0.9, 1.0))
		"eAblaze":
			_num(_enemy_at + Vector2(0, -40), "Ablaze!", Color(1.0, 0.5, 0.2))
		"eIced":
			_num(_enemy_at + Vector2(0, -40), "Iced over!", Color(0.75, 0.9, 1.0))
		"fumble":
			_strip_lit = int(x["seat"])
			_num(_seat_at(int(x["seat"])), "False colors!  -%d" % int(x["chip"]), Color(1.0, 0.55, 0.35), true)
			_shown_hp[int(x["seat"])] = float(x["hp"])
			Rumble.buzz([0, 40])
			await _wait(0.6)
		"parry", "reflect":
			# A riposte (at a ship) or a parry thrown back (at the enemy).
			if x.has("enemyHp"):
				_fx.shot(_seat_at(int(x["seat"])) + Vector2(40, -20), _enemy_at, "hit")
				await _wait(0.35)
				_num(_enemy_at, "%s  %d" % [x.get("name", "Parry"), int(x["dmg"])], Color(0.7, 0.9, 1.0))
				_shown_hp["e"] = float(x["enemyHp"])
			else:
				_fx.shot(_enemy_at + Vector2(-40, -20), _seat_at(int(x["seat"])), "hit")
				await _wait(0.35)
				_num(_seat_at(int(x["seat"])), "%s  %d" % [x.get("name", "Riposte"), int(x["dmg"])], Color(1.0, 0.5, 0.4))
				_shown_hp[int(x["seat"])] = float(x["hp"])
			await _wait(0.2)
		"volatile":
			_fx.burst(_enemy_at, true)
			_num(_seat_at(int(x["seat"])), "The wreck goes up!  -%d" % int(x["dmg"]), Color(1.0, 0.5, 0.25), true)
			_shown_hp[int(x["seat"])] = float(x["hp"])
			await _wait(0.5)
		"bite":
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "A ball knocked loose", Color(1.0, 0.7, 0.4))
		"loaded":
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "+1 ball", CREAM)
		"strip":
			_num(_enemy_at + Vector2(0, -40), "Its powder spilled", Color(1.0, 0.85, 0.35))
		"leech":
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "+%d" % int(x["heal"]), Color(0.5, 0.95, 0.6))
			_shown_hp[int(x["seat"])] = float(x["hp"])
		"rack":
			_num(_enemy_at + Vector2(0, -60), "The rack fires", Color(0.85, 0.75, 0.55))
		"eHeal":
			_num(_enemy_at + Vector2(0, -40), "%s  +%d" % [x.get("why", ""), int(x["heal"])], Color(0.6, 0.95, 0.6))
			_shown_hp["e"] = float(x["hp"])
			await _wait(0.25)
		"wardSurge":
			_say("It will not go down!")
			_shown_hp["e"] = float(x["hp"])
			Sound.horn()
			await _wait(0.9)
		"aegisHit":
			var ea: HullAura = _aura("e")
			if ea != null:
				ea.crack()
			_num(_enemy_at + Vector2(-120, -60), "The wall holds  ·  %d left" % int(x["left"]), Color(0.75, 0.82, 0.9))
			Sound.impact(false)
			await _wait(0.3)
		"aegisBreak":
			var ea2: HullAura = _aura("e")
			if ea2 != null:
				ea2.shatter()
			_say("%s breaks!" % x.get("name", "The Last Wall"))
			Rumble.buzz([0, 60, 30, 90])
			Sound.impact(true)
			await _wait(1.0)
		"bossAbility":
			await _summon(x)
		"refund":
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "The Maw takes nothing", Color(0.9, 0.65, 0.3))
		"flares":
			pass
		"crossfire":
			_xfire_seats = Js.list(x["seats"])
			_xfire_t = 2.4
			_say("Crossfire!")
			var who: Array = []
			for si3: Variant in _xfire_seats:
				who.append("you" if int(si3) == me else str(b["seats"][int(si3)]["name"]))
				_num(_seat_at(int(si3)) + Vector2(0, -60), "Critical", Color(1.0, 0.85, 0.35), true)
			_log_line("Criticals from %s: each of those shots hits %d%% harder." % [" and ".join(PackedStringArray(who)), int(round((float(x["mult"]) - 1.0) * 100.0))])
			Sound.perfect()
			Rumble.buzz([0, 30, 30, 50])
			await _wait(0.9)
		"flee":
			var fs: int = int(x["seat"])
			if fs == me:
				await _show_flee(x, int(x["need"]))
			else:
				_num(_seat_at(fs), "Got away" if x["success"] else "Caught!  -%d" % int(x.get("dmg", 0)), Color(0.5, 0.86, 0.58) if x["success"] else Color(1.0, 0.45, 0.35), true)
				if x.has("hp"):
					_shown_hp[fs] = float(x["hp"])
				await _wait(0.6)
		"begin":
			await _pre_fight_words()
			await _enemy_enters()
		"nextFight":
			if x.get("rest", false):
				_say("Rest stop")
				_log_line("The crew catch their breath: every crew order is ready again.")
				await _wait(1.8)
			if x.get("boss", false):
				Sound.horn()
				await _pre_fight_words()
			await _enemy_enters()
		"pay":
			if x["key"] == my_key:
				_say("%s sunk" % b["enemy"]["name"])
				_log_line("+%d Navigation XP  ·  +%d ⟡ to the crew's purse" % [int(x["xp"]), int(x["doubloons"])])
				await _wait(2.0)
		"crate":
			if x["key"] == my_key:
				_say(str(_raid.get("bossDefeatedText", "Victory")) if str(_raid.get("bossDefeatedText", "")) != "" else "Victory")
				var items: Array = Js.list(x.get("items"))
				_log_line("Your crate: %s ⟡%s" % [Js.thousands(Js.num(x.get("coin"))), ("  ·  " + ", ".join(PackedStringArray(items))) if not items.is_empty() else ""])
				Sound.chest(true)
				await _wait(3.2)
		"tided":
			var r: Dictionary = Js.obj(Js.obj(x.get("picks")).get(my_key))
			if Js.num(r.get("heal")) > 0.0:
				_num(_seat_at(me), "+%d" % int(r["heal"]), Color(0.5, 0.95, 0.6), true)
			if r.get("refreshed") != null:
				_log_line("A spent crew order is ready again.")
			await _wait(0.6)


## A BROADSIDE: the call over the water, the enemy heeling with the recoil,
## a ball for every ship in the line at once.
func _broadside(x: Dictionary, group: Array) -> void:
	_strip_lit = -1
	_say("Broadside!")
	Rumble.buzz([0, 50, 30, 80])
	_enemy.kick = 30.0
	_enemy.heel = 0.1
	await _wait(0.35)
	for g: Dictionary in group:
		var ti: int = int(g["target"])
		var land: String = "dodge" if g.get("dodged", false) else ("crit" if g["crit"] else "hit")
		_fx.shot(_enemy_at + Vector2(-40, 0), _seat_at(ti), land, 2 if x["action"] == "volley" else 3, true)
	await _wait(0.65)
	for g: Dictionary in group:
		var ti2: int = int(g["target"])
		if g.get("dodged", false):
			_num(_seat_at(ti2), "Dodged!", Color(0.6, 0.9, 1.0))
		else:
			_num(_seat_at(ti2), ("%d!" % int(g["dmg"])) if g["crit"] else str(int(g["dmg"])), Color(1.0, 0.45, 0.35), true)
		_shown_hp[ti2] = float(g["hp"])
	await _wait(0.4)


func _ability_card(x: Dictionary) -> void:
	var s: Dictionary = b["seats"][int(x["seat"])]
	var c: Dictionary = {}
	for cc: Dictionary in s["crew"]:
		if cc["id"] == x["crew"]:
			c = cc
	var cls: Dictionary = Js.obj(Js.obj(Crew.t().get("classes")).get(x["cls"]))
	var col: Color = Color(str(cls.get("color", "#cccccc")))
	# The hand steps up: their card rises over the deck, the class's colour
	# behind it, the order's name under it.
	var card: Control = Control.new()
	card.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	card.offset_left = -110
	card.offset_right = 110
	card.offset_top = -BAR - 470
	card.offset_bottom = -BAR - 190
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.pivot_offset = Vector2(110, 280)
	add_child(card)
	var glow: TextureRect = TextureRect.new()
	glow.texture = Glow.radial(128, col)
	glow.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	glow.offset_left = -60
	glow.offset_right = 60
	glow.offset_top = -30
	glow.offset_bottom = 30
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.modulate = Color(1, 1, 1, 0.5)
	card.add_child(glow)
	var pic: TextureRect = TextureRect.new()
	pic.texture = Skipper.tex("card-arts/%s.webp" % str(c.get("filename", "")).get_basename())
	pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pic.offset_bottom = -44
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	card.add_child(pic)
	var nm: Label = Kit.text(card, "%s  ·  %s" % [c.get("name", ""), cls.get("shortLabel", "")], "heading", col.lightened(0.3))
	nm.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	nm.offset_top = -40
	nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	nm.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	nm.add_theme_constant_override("shadow_outline_size", 8)
	card.scale = Vector2(0.6, 0.6)
	card.modulate.a = 0.0
	Sound.seal(true)
	var tw: Tween = card.create_tween().set_parallel()
	tw.tween_property(card, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(card, "modulate:a", 1.0, 0.2)
	await _wait(0.45)
	# What it did, on the water.
	var tgt: int = int(x.get("target", x["seat"]))
	if x.has("heal") and float(x["heal"]) > 0.0:
		_num(_seat_at(tgt), "+%d" % int(x["heal"]), Color(0.5, 0.95, 0.6), true)
		_shown_hp[tgt] = float(b["seats"][tgt]["hp"])
	if x.has("shield"):
		_num(_seat_at(tgt) + Vector2(0, -40), "+%d shield" % int(x["shield"]), Color(0.55, 0.8, 1.0))
	if x.has("charges"):
		_num(_seat_at(tgt), "+%d ball%s" % [int(x["charges"]), "" if int(x["charges"]) == 1 else "s"] if float(x["charges"]) > 0.0 else "No luck", CREAM)
	if x.has("dmg"):
		_fx.burst(_enemy_at, true)
		_num(_enemy_at, "%d!" % int(x["dmg"]), col.lightened(0.3), true)
		_shown_hp["e"] = float(b["enemy"]["hp"])
	if x.has("reveal"):
		_log_line("Next: %s" % ", ".join(PackedStringArray(x["reveal"])))
	await _wait(0.5)
	var out: Tween = card.create_tween()
	out.tween_property(card, "modulate:a", 0.0, 0.25)
	out.tween_callback(card.queue_free)


func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


func _num(world_p: Vector2, text: String, col: Color, big: bool = false) -> void:
	_numbers.append({ "p": world_p, "text": text, "col": col, "big": big, "t": 0.0 })


func _puff(world_p: Vector2, text: String, col: Color) -> void:
	_num(world_p, text, col)


func _say(text: String) -> void:
	_banner.text = text
	_banner_t = 0.0


func _log_line(text: String) -> void:
	_log.text = text
	_log.modulate.a = 0.0
	create_tween().tween_property(_log, "modulate:a", 1.0, 0.2)


# ── A fight won, a raid done, a ship lost ─────────────────────────────────────

func _won() -> void:
	var e: Dictionary = b["enemy"]
	var paid: Dictionary = RaidRun.award_kill(sea.session.store, sea.session.uid, _raid, str(e["id"]), Battle.fight_at(_raid, int(b["fight"]))["boss"])
	sea.session.persist()
	_say("%s sunk" % e["name"])
	_log_line("+%d Navigation XP  ·  +%d ⟡" % [int(paid["xp"]), int(paid["doubloons"])])
	await _wait(2.0)
	# A tide turns after some kills; the Throne offers a reprieve before its don.
	var tide: Dictionary = Battle.tide_due(b)
	if not tide.is_empty():
		await _tide(tide, "A TIDE TURNS")
	var rp: Dictionary = Battle.reprieve_due(b)
	if not rp.is_empty():
		await _tide(rp, "A REPRIEVE")
	var nx: Dictionary = Battle.next_fight(b)
	if nx["done"]:
		await _crate()
		return
	if nx.get("rest", false):
		_say("Rest stop")
		_log_line("The crew catch their breath: every crew order is ready again.")
		await _wait(1.8)
	if nx.get("boss", false):
		Sound.horn()
		await _pre_fight_words()
	await _enemy_enters()
	_await_plan()


func _crate() -> void:
	var s: Dictionary = b["seats"][me]
	var r: Dictionary = RaidRun.open_crate(sea.session.store, sea.session.uid, _raid, float(s["fortune"]))
	RaidRun.record_clear(sea.session.store, sea.session.uid, raid_id, float(Time.get_ticks_msec() - _began_ms))
	sea.session.persist()
	_say(str(_raid.get("bossDefeatedText", "Victory")) if str(_raid.get("bossDefeatedText", "")) != "" else "Victory")
	if not r.is_empty():
		var items: Array = (r["items"] as Array).map(func(x: Dictionary) -> String: return str(x.get("label", x["id"])))
		_log_line("The crate: %s ⟡%s" % [Js.thousands(float(r["coin"])), ("  ·  " + ", ".join(PackedStringArray(items))) if not items.is_empty() else ""])
		Sound.chest(true)
	await _wait(3.2)
	_end(true)


func _lost() -> void:
	_say("Your ship is going down")
	_log_line("She limps home to the Gunwharf. Refit and come back.")
	Sound.slack()
	await _wait(2.6)
	_end(false)


func _end(won: bool, fled: bool = false) -> void:
	for k: Variant in _auras:
		var a0: HullAura = _aura(k)
		if a0 != null and k != "e":
			a0.queue_free()
	if table != null and table.changed.is_connected(_pump):
		table.changed.disconnect(_pump)
	sea._boat.modulate = Color.WHITE
	for k2: Variant in sea._mates:
		if is_instance_valid(sea._mates[k2]):
			(sea._mates[k2] as Shipmate).face_lock = 0.0
	if _enemy != null:
		_enemy.queue_free()
	if mark != null:
		mark.visible = true
	_fx.queue_free()
	sea.stage = null
	sea._hud.visible = true
	# Home: back to where she lay (sunk, to the Gunwharf's berth).
	var home: Vector2 = _from
	if not won and dock != Vector2.INF:
		# Out on the campaign's water: she wakes at the Gunwharf.
		sea._boat.hold_still = false
		sea.warp_to_gunwharf()
	else:
		if not won and sea._berths.has("gunwharf"):
			home = (sea._berths["gunwharf"] as Node2D).position
		var back: Tween = create_tween()
		back.tween_property(sea._boat, "position", home, 2.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		back.tween_callback(func() -> void: sea._boat.hold_still = false)
	var tw: Tween = create_tween()
	tw.tween_property(self, "_bars", 0.0, 0.5)
	tw.parallel().tween_property(self, "_drop", 260.0, 0.4)
	await tw.finished
	finished.emit(won and not fled)
	queue_free()


# ── Drawing: the bars, the plates over the ships, the strip, the numbers ─────

func _draw() -> void:
	var vp: Vector2 = size
	var hb: float = BAR * _bars
	draw_rect(Rect2(0, 0, vp.x, hb), Color(0, 0, 0, 0.92))
	draw_rect(Rect2(0, vp.y - hb, vp.x, hb), Color(0, 0, 0, 0.92))
	if _bars < 0.5 or b.is_empty():
		return
	# A crossfire: gold lines from each critical ship to the enemy, fading.
	_xfire_t = maxf(0.0, _xfire_t - get_process_delta_time())
	if _xfire_t > 0.0 and _enemy != null and is_instance_valid(_enemy):
		var xa: float = clampf(_xfire_t / 2.4, 0.0, 1.0)
		var ep2: Vector2 = _screen(_enemy_at) + Vector2(0, -60)
		for si4: Variant in _xfire_seats:
			var sp4: Vector2 = _screen(_seat_at(int(si4))) + Vector2(30, -60)
			draw_line(sp4, ep2, Color(1.0, 0.82, 0.35, 0.18 * xa), 14.0, true)
			draw_line(sp4, ep2, Color(1.0, 0.9, 0.55, 0.85 * xa), 3.0, true)
		draw_circle(ep2, 26.0 + 18.0 * (1.0 - xa), Color(1.0, 0.85, 0.4, 0.35 * xa))
	var f: Font = Kit.font("cinzel", 800)
	var small: Font = Kit.font("karla", 700)
	# The raid's name in the top bar, and the turn strip.
	var title: String = "%s  ·  Fight %d of %d" % [_raid.get("raidTitle", ""), int(b["fight"]) + 1, int(Battle.fight_at(_raid, int(b["fight"]))["of"])]
	draw_string(f, Vector2(28, hb * 0.62), title, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(CREAM, 0.9))
	_draw_strip(Vector2(vp.x - 28, hb * 0.5))
	if table != null and str(_latest.get("phase", "")) == "plan":
		var who: Array = []
		var given: Dictionary = Js.obj(_latest.get("plans"))
		for st: Dictionary in Battle.alive(b):
			if not given.has(st.get("key")):
				who.append("You" if st.get("key") == my_key else str(st["name"]))
		var cd: String = ("Choosing: " + ", ".join(PackedStringArray(who))) if not who.is_empty() else "Every order is in"
		var cw: float = f.get_string_size(cd, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
		draw_string(f, Vector2(vp.x / 2.0 - cw / 2.0, hb * 0.62), cd, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(BRASS, 0.95))
	# The enemy's plate over its masthead.
	if _enemy != null and is_instance_valid(_enemy):
		var e: Dictionary = b["enemy"]
		var ep: Vector2 = _screen(_enemy.position) + Vector2(0, -215)
		if _portrait != null:
			var ps: float = 110.0 / maxf(1.0, float(_portrait.get_height()))
			var pw: Vector2 = _portrait.get_size() * ps
			draw_texture_rect(_portrait, Rect2(ep - Vector2(pw.x / 2.0, pw.y + 30), pw), false, Color(1, 1, 1, 1.0 - float(_enemy.sink)))
		_plate(ep, str(e["name"]), float(_shown_hp.get("e", e["hp"])), float(e["max"]), float(e["shield"]), int(e["charges"]), int(e["mag"]), e["statuses"], Color(0.9, 0.35, 0.3), _strip_lit == -1)
	# Each ship's plate.
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		var sp: Vector2 = _screen(_seat_at(i)) + Vector2(0, -215)
		_plate(sp, str(s["name"]), float(_shown_hp.get(i, s["hp"])), float(s["max"]), float(s["shield"]), int(s["charges"]), int(s["maxCharges"]), s["statuses"], Color(0.4, 0.8, 0.5), _strip_lit == i)
		if table != null and str(_latest.get("phase", "")) == "plan" and Battle.alive(b).has(s):
			_order_chip(sp + Vector2(0, 52), s)
	# Numbers rising off the water.
	for n: Dictionary in _numbers:
		var u: float = float(n["t"]) / 1.4
		var p: Vector2 = _screen(n["p"]) + Vector2(0, -30.0 - 80.0 * u)
		var fs: int = 34 if n["big"] else 24
		var txt: String = n["text"]
		var w: float = f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var a: float = 1.0 - smoothstep(0.6, 1.0, u)
		var pop: float = 1.0 + 0.25 * (1.0 - clampf(u / 0.12, 0.0, 1.0))
		draw_set_transform(p, 0.0, Vector2(pop, pop))
		draw_string_outline(f, Vector2(-w / 2.0, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 7, Color(0, 0, 0, 0.75 * a))
		draw_string(f, Vector2(-w / 2.0, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(n["col"], a))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _plate(at: Vector2, name: String, hp: float, mx: float, shield: float, ch: int, mag: int, st: Dictionary, col: Color, lit: bool) -> void:
	var f: Font = Kit.font("karla", 800)
	var w: float = 190.0
	var r: Rect2 = Rect2(at - Vector2(w / 2.0, 0), Vector2(w, 46))
	draw_rect(r.grow(2), Color(0, 0, 0, 0.55))
	draw_rect(r, Color(0.1, 0.08, 0.07, 0.85))
	if lit:
		var g: float = 0.5 + 0.5 * sin(_t * 8.0)
		draw_rect(r.grow(3), Color(BRASS, 0.6 + 0.4 * g), false, 2.0)
	var nw: float = f.get_string_size(name, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
	draw_string(f, Vector2(at.x - nw / 2.0, r.position.y + 15), name, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, CREAM)
	var bar: Rect2 = Rect2(r.position + Vector2(8, 21), Vector2(w - 16, 10))
	draw_rect(bar, Color(0.25, 0.08, 0.07))
	draw_rect(Rect2(bar.position, Vector2(bar.size.x * clampf(hp / maxf(1.0, mx), 0.0, 1.0), bar.size.y)), col)
	if shield > 0.0:
		draw_rect(Rect2(bar.position, Vector2(bar.size.x * clampf(shield / maxf(1.0, mx), 0.0, 1.0), 4)), Color(0.55, 0.8, 1.0))
	var ht: String = "%d / %d" % [int(hp), int(mx)]
	var hw: float = f.get_string_size(ht, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
	draw_string(f, Vector2(at.x - hw / 2.0, bar.end.y - 1), ht, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.9))
	for k: int in mag:
		var c: Vector2 = Vector2(r.position.x + 12 + k * 14, r.end.y - 7)
		draw_circle(c, 4.5, Color(0.12, 0.12, 0.13) if k < ch else Color(0.35, 0.3, 0.26))
	var sx: float = r.end.x - 10
	for id: String in st:
		var tone: Color = Color(0.5, 0.9, 0.55) if id in ["fortify", "enrage", "regen"] else Color(0.95, 0.5, 0.4)
		var lab: String = id.substr(0, 3).to_upper()
		var lw: float = f.get_string_size(lab, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x
		sx -= lw + 6
		draw_string(f, Vector2(sx, r.end.y - 3), lab, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, tone)


## The turn strip: who acts in what order this round, the one acting lit.
func _draw_strip(right: Vector2) -> void:
	if _strip.is_empty():
		return
	var x: float = right.x
	var f: Font = Kit.font("karla", 800)
	for k: int in range(_strip.size() - 1, -1, -1):
		var who: int = _strip[k]
		var name: String = str(b["enemy"]["name"]) if who == -1 else str(b["seats"][who]["name"])
		var w: float = f.get_string_size(name, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x + 22
		x -= w
		var r: Rect2 = Rect2(x, right.y - 14, w, 28)
		var lit: bool = who == _strip_lit
		draw_rect(r, Color(0.9, 0.35, 0.3, 0.35) if who == -1 else Color(0.4, 0.8, 0.5, 0.3))
		if lit:
			draw_rect(r.grow(2), BRASS, false, 2.0)
		draw_string(f, Vector2(x + 11, right.y + 5), name, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, CREAM if lit else Color(CREAM, 0.7))
		x -= 8
		if k > 0:
			draw_string(f, Vector2(x - 2, right.y + 5), "›", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(CREAM, 0.5))
			x -= 10


# ── The enemies' moments ─────────────────────────────────────────────────────

## A boss's summon: the creature breaches beside it, does its work, sinks.
func _summon(x: Dictionary) -> void:
	_strip_lit = -1
	var sm: BattleSummon = BattleSummon.new()
	sm.field = sea._field
	sm.tex = Skipper.tex(str(x.get("image", "")).trim_prefix("/"))
	sm.col = Color(str(x.get("color", "#a78bfa")))
	sm.position = _enemy_at + Vector2(-90, 260)
	sm.z_index = 3
	sea._world.add_child(sm)
	_say(str(x.get("name", "")))
	await sm.rise()
	match str(x["kind"]):
		"leviathan":
			for h: Dictionary in x["hits"]:
				await sm.lunge(_seat_at(int(h["seat"])))
				_num(_seat_at(int(h["seat"])), "%d!" % int(h["dmg"]), Color(1.0, 0.4, 0.35), true)
				_shown_hp[int(h["seat"])] = float(h["hp"])
		"blitz":
			for h: Dictionary in x["hits"]:
				for k: int in 4:
					_fx.shot(sm.position, _seat_at(int(h["seat"])) + Vector2(randf_range(-40, 40), 0), "hit")
					await _wait(0.12)
				_num(_seat_at(int(h["seat"])), "%d!" % int(h["dmg"]), Color(1.0, 0.4, 0.35), true)
				_shown_hp[int(h["seat"])] = float(h["hp"])
		"abyssal_tide":
			await sm.pulse()
			_num(_enemy_at, "+%d  ·  +%d shield" % [int(x.get("heal", 0)), int(x.get("shield", 0))], Color(0.6, 0.95, 0.7), true)
			_shown_hp["e"] = float(x["enemyHp"])
		"foresight":
			await sm.pulse()
			_log_line("It sees your next shots coming: it will slip any it braces for.")
		"vengeance":
			await sm.pulse()
			_log_line("A ward burns under it: the next killing blow will not take.")
		"requiem":
			await sm.pulse()
			for i: int in (b["seats"] as Array).size():
				_num(_seat_at(i), "Marked", Color(0.75, 0.85, 1.0))
	await _wait(0.4)
	await sm.sink()


## The flare barrage: every captain swats their own sky.
func _flares() -> void:
	var fl: Dictionary = b["flares"]
	var fb: FlareBarrage = FlareBarrage.new()
	fb.count = int(fl["count"])
	fb.feint_chance = float(fl["feint"])
	fb.cluster = float(fl["cluster"])
	fb.fuse_scale = float(fl["fuse"])
	fb.title = str(fl["name"])
	fb.source = _screen(_enemy_at) + Vector2(0, -60)
	fb.target = _screen(_seat_at(me)) + Vector2(0, -40)
	if autoplay:
		fb.fuse_scale = 0.4
	add_child(fb)
	var got: Array = await fb.finished
	if table != null:
		_act(["flares", { "missed": float(got[0]), "feints": float(got[1]) }])
		return
	await _play_list(Battle.flares_land(b, [{ "missed": got[0], "feints": got[1] }]))


func _play_list(ev: Array) -> void:
	for x: Dictionary in ev:
		match x["t"]:
			"flareHit":
				if float(x["dmg"]) > 0.0:
					_fx.burst(_seat_at(int(x["seat"])), float(x["missed"]) >= 2.0)
					_num(_seat_at(int(x["seat"])), "-%d" % int(x["dmg"]), Color(1.0, 0.5, 0.3), true)
					_shown_hp[int(x["seat"])] = float(x["hp"])
					await _wait(0.4)
				else:
					_num(_seat_at(int(x["seat"])), "Not a spark landed", CREAM)
					await _wait(0.4)
			_:
				await _one(x)


## A tide (or the reprieve): the card, the captain's pick, what it did.
func _tide(tide: Dictionary, eyebrow: String) -> void:
	var card: TideCard = TideCard.new()
	card.tide = tide
	card.eyebrow = eyebrow
	add_child(card)
	if autoplay:
		await _wait(1.2)
		card._pick(str(tide["choices"][0]["id"]))
	var id: String = await card.chosen
	if table != null:
		_act(["tide", id])
		return
	var r: Dictionary = Battle.tide_pick(b, me, tide, id)
	if float(r.get("heal", 0.0)) > 0.0:
		_num(_seat_at(me), "+%d" % int(r["heal"]), Color(0.5, 0.95, 0.6), true)
		_shown_hp[me] = float(b["seats"][me]["hp"])
	if r.get("refreshed") != null:
		_log_line("A spent crew order is ready again.")
	await _wait(0.6)


## The boss's words before its fight (preFightDialogue), over the water.
func _pre_fight_words() -> void:
	var lines: Array = Js.list(_raid.get("preFightDialogue"))
	var f: Dictionary = Battle.fight_at(_raid, int(b["fight"]))
	if lines.is_empty() or not f["boss"] or _spoke:
		return
	_spoke = true
	var boss: Dictionary = Js.obj(_raid["enemies"][_raid["bossId"]])
	var scene: Array = []
	for l: Dictionary in lines:
		var o: Dictionary = { "text": l.get("text", ""), "pause": l.get("pause", 0) }
		match str(l.get("speaker", "narrator")):
			"boss":
				o["speaker"] = boss.get("name", "")
				o["portrait"] = boss.get("portrait", boss.get("image", ""))
			"crew":
				o["speaker"] = Js.obj(l.get("crew")).get("name", "")
				o["portrait"] = Js.obj(l.get("crew")).get("portrait", "")
		scene.append(o)
	var sc: StoryScene = StoryScene.new()
	sc.node = { "id": "", "scene": scene }
	sc.over_water = true
	sc.allow_skip = sea.session.store.clear_count(sea.session.uid, raid_id) > 0
	sc.cta = "To the guns"
	add_child(sc)
	if autoplay:
		await _wait(0.5)
		sc._end(true)
	await sc.finished


## The drum: a free beat, once a raid.
func _beat_drum() -> void:
	if _busy:
		return
	var r: Dictionary
	if table != null:
		r = Js.obj(await _act(["drum"]))
		if not r.has("error"):
			b["seats"][me]["drum"] = true
	else:
		r = Battle.use_drum(b, me)
	if r.has("error"):
		return
	Sound.horn()
	Rumble.buzz([0, 40, 40, 40, 40, 60])
	if r.get("refreshed") != null:
		_num(_seat_at(me), "A crew order is back", Color(0.95, 0.85, 0.5), true)
	else:
		_num(_seat_at(me), "The drum goes unanswered", CREAM)
	_paint_actions()


# ── Flee ─────────────────────────────────────────────────────────────────────

## The die for getting away, over the deck: a d20 tumbling onto the roll,
## the face needed beside it. Away: she turns and runs. Caught: the parting shot.
func _flee() -> void:
	if _busy:
		return
	_busy = true
	if table != null:
		_clear_deck()
		_act(["plan", { "action": "flee" }])
		_waiting()
		return
	var ev: Array = Battle.flee(b, me)
	await _show_flee(ev[0], Battle.flee_need(b, me))
	for k: int in range(1, ev.size()):
		await _one(ev[k])
	match b["state"]:
		"fled":
			await _got_away()
		"lost":
			await _lost()
		_:
			_await_plan()


func _show_flee(x: Dictionary, need: int) -> void:
	_clear_deck()
	create_tween().tween_property(self, "_drop", 0.0, 0.2)
	Paper.night = true
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	_deck_box.add_child(row)
	var die: NodeSheet.DiceFace = NodeSheet.DiceFace.new()
	die.custom_minimum_size = Vector2(180, 120)
	die.final = int(x["natural"])
	row.add_child(die)
	var v: VBoxContainer = VBoxContainer.new()
	row.add_child(v)
	Paper.text(v, "MAKING A RUN FOR IT", "eyebrow", Paper.ink_soft())
	Paper.text(v, "Need %d or better  ·  a 20 always gets away, a 1 never does" % need, "body_strong", Paper.ink())
	var said: Label = Paper.text(v, "", "display", Paper.ink())
	Paper.night = false
	await die.landed
	if x["success"]:
		said.text = "Away!"
		said.add_theme_color_override("font_color", Color(0.5, 0.86, 0.58))
		Sound.horn()
	else:
		said.text = "Caught!"
		said.add_theme_color_override("font_color", Color(0.93, 0.45, 0.33))
		await _wait(0.4)
		_fx.shot(_enemy_at + Vector2(-40, 0), _seat_at(me), "hit")
		await _wait(0.5)
		_num(_seat_at(me), "Parting shot  -%d" % int(x.get("dmg", 0)), Color(1.0, 0.45, 0.35), true)
		_shown_hp[me] = float(x.get("hp", b["seats"][me]["hp"]))
	await _wait(1.0)
	_clear_deck()


## Out of the fight: she comes about and runs for it, keeping what she earned.
func _got_away() -> void:
	_say("You got away")
	_log_line("Out of the fight, with what you earned so far. The raid will be here when you come back.")
	var away: Vector2 = sea._boat.position + Vector2(-700, 260)
	sea._boat.face_to(-1.0)
	var tw: Tween = create_tween()
	tw.tween_property(sea._boat, "position", away, 1.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	for k: int in 5:
		tw.parallel().tween_callback(func() -> void: sea._field.ring(sea._boat.position, 100.0, 1.0, 0.5)).set_delay(0.3 * k)
	await _wait(2.0)
	_from = sea._boat.position
	_end(true, true)



## A hull's aura, or null once it has gone (the enemy's sinks with it).
func _aura(k: Variant) -> HullAura:
	var a: Variant = _auras.get(k)
	return a if a != null and is_instance_valid(a) else null


# ── Together: following the founder's table ──────────────────────────────────

func _act(args: Array) -> Variant:
	return await sea.session.act("raidTable", args)


## Every state the table sends: each phase is handled once, in order.
func _pump(st: Dictionary) -> void:
	_latest = st
	if _pumping or _gone:
		return
	_pumping = true
	while not _gone:
		var cur: Dictionary = _latest
		var tag: String = "%s:%d" % [cur.get("phase", ""), int(Js.num(cur.get("seq")))]
		if tag == _handled:
			break
		_handled = tag
		await _phase(cur)
	_pumping = false
	if not _gone and str(_latest.get("phase", "")) == "plan":
		b = (_latest["b"] as Dictionary).duplicate(true)
		if Js.obj(_latest.get("plans")).has(my_key):
			_waiting()
		else:
			if not _busy:
				_paint_actions()
			_xfire_hint()


func _alive_me() -> bool:
	return Battle.alive(b).has(b["seats"][me])


func _phase(cur: Dictionary) -> void:
	match str(cur.get("phase", "")):
		"playing":
			# The hulls show what they showed until the round says otherwise.
			for i: int in (b["seats"] as Array).size():
				_shown_hp[i] = float(b["seats"][i]["hp"])
			_shown_hp["e"] = float(b["enemy"]["hp"])
			b = (cur["b"] as Dictionary).duplicate(true)
			_busy = true
			_clear_deck()
			create_tween().tween_property(self, "_drop", 190.0, 0.2).set_ease(Tween.EASE_IN)
			await _play_events(Js.list(cur.get("ev")))
			_strip_lit = -99
			_shown_hp.clear()
			var seq: int = int(Js.num(cur.get("seq")))
			var mine: Dictionary = b["seats"][me]
			if mine.get("sunk", false) or mine.get("fled", false):
				_gone = true
				await _act(["played", seq])
				await _act(["out"])
				if mine.get("fled", false):
					await _got_away()
				else:
					await _lost()
				return
			_act(["played", seq])
			if str(cur.get("after", "")) == "end":
				_gone = true
				match str(cur.get("result", "")):
					"won":
						_end(true)
					"fled":
						await _got_away()
					_:
						await _lost()
		"plan":
			b = (cur["b"] as Dictionary).duplicate(true)
			_plan_until = _t + float(Js.nz(cur.get("left"), RaidTable.PLAN))
			if _alive_me() and not Js.obj(cur.get("plans")).has(my_key):
				_await_plan()
				_xfire_hint()
			else:
				_waiting()
		"flares":
			b = (cur["b"] as Dictionary).duplicate(true)
			if _alive_me():
				await _flares()
			_waiting()
		"tide":
			if _alive_me() and not Js.obj(cur.get("tidePicks")).has(my_key):
				var tide: Dictionary = Js.obj(cur.get("tide"))
				var rp: Variant = Js.obj(Rules.data().get("tides")).get("reprieve")
				await _tide(tide, "A REPRIEVE" if tide == rp else "A TIDE TURNS")
			_waiting()
		"done", "idle":
			_gone = true
			_end(str(cur.get("result", "")) == "won")


## The deck while the crew decide: who is still choosing.
func _waiting() -> void:
	if _pumping and str(_latest.get("phase", "")) == "playing":
		return
	_busy = true
	_clear_deck()
	var names: Array = []
	var plans: Dictionary = Js.obj(_latest.get("plans"))
	var field: String = { "plan": "plans", "flares": "flareRes", "tide": "tidePicks" }.get(str(_latest.get("phase", "")), "plans")
	var given: Dictionary = Js.obj(_latest.get(field))
	for st: Dictionary in Battle.alive(b):
		if st.get("key") != my_key and not given.has(st.get("key")):
			names.append(str(st["name"]))
	var line: String = "Orders given. Waiting on %s." % ", ".join(PackedStringArray(names)) if not names.is_empty() else "Orders given. The round is coming."
	if not _alive_me():
		line = "You are out of this fight. The crew fight on."
	var lb: Label = Kit.text(_deck_box, line, "body_strong", NIGHT_INK)
	lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lb.size_flags_vertical = Control.SIZE_EXPAND_FILL
	lb.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if plans.is_empty() and str(_latest.get("phase", "")) != "plan":
		lb.text = "The crew are seeing to it."
	create_tween().tween_property(self, "_drop", 0.0, 0.2)


## A ship's order for the round, under its plate while the crew plan: what it
## will do, where its aim landed (a critical in gold: half a crossfire), and a
## crew order with who it is for. "Choosing" until it is in.
func _order_chip(at: Vector2, s: Dictionary) -> void:
	var pl: Dictionary = Js.obj(Js.obj(_latest.get("plans")).get(s.get("key")))
	var txt: String = "Choosing"
	var col: Color = Color(CREAM, 0.55)
	var crit: bool = false
	if not pl.is_empty():
		var act: String = str(pl.get("action", ""))
		txt = { "fire": "Fire", "volley": "Volley", "reload": "Reload", "dodge": "Dodge", "flee": "Flee" }.get(act, str(Js.obj(s.get("mega")).get("name", "Mega")))
		if act in ["fire", "volley", "mega"]:
			var aim: String = str(pl.get("aim", ""))
			crit = aim == "critical"
			txt += "  ·  " + ("Critical" if crit else aim.capitalize())
		var ab: Dictionary = Js.obj(pl.get("ability"))
		if not ab.is_empty():
			for c: Dictionary in s["crew"]:
				if c["id"] == ab["crew"]:
					txt += "  +  %s" % c["name"]
			var ti: int = int(Js.nz(ab.get("target"), -1.0))
			if ti >= 0 and ti < (b["seats"] as Array).size() and b["seats"][ti] != s:
				txt += " for %s" % ("you" if ti == me else str(b["seats"][ti]["name"]))
		col = Color(1.0, 0.85, 0.35) if crit else CREAM
	var f: Font = Kit.font("karla", 800)
	var w: float = f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x + 20.0
	var r: Rect2 = Rect2(at - Vector2(w / 2.0, 0), Vector2(w, 22))
	draw_rect(r, Color(0.1, 0.08, 0.07, 0.85))
	draw_rect(r, Color(BRASS, 0.9) if crit else Color(CREAM, 0.2), false, 1.5 if crit else 1.0)
	draw_string(f, Vector2(r.position.x + 10, r.position.y + 15), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, col)


## While choosing: a crewmate's critical already in is half a crossfire.
func _xfire_hint() -> void:
	if table == null or not _alive_me() or Battle.alive(b).size() < 2:
		return
	var plans: Dictionary = Js.obj(_latest.get("plans"))
	if plans.has(my_key):
		return
	var names: Array = []
	for st: Dictionary in Battle.alive(b):
		var pl: Dictionary = Js.obj(plans.get(st.get("key")))
		if st.get("key") != my_key and str(pl.get("aim", "")) == "critical" and str(pl.get("action", "")) in ["fire", "volley", "mega"]:
			names.append(str(st["name"]))
	if not names.is_empty():
		_log_line("%s landed a critical. Land one too for a crossfire." % " and ".join(PackedStringArray(names)))
	else:
		_log_line("Crossfire: two or more criticals in one round hit harder.")
