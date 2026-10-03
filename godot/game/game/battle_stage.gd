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
## Rules: core/battle.gd and core/raid_run.gd. Solo for now; the plans array
## and the seats are already a party's.

signal finished(won: bool)

const BAR: float = 74.0
const NIGHT: Color = Color("#1a1512")
const BRASS: Color = Color(0.86, 0.68, 0.36)
const CREAM: Color = Color(0.96, 0.92, 0.84)

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


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.make()
	_raid = Battle.raid_def(raid_id)
	var seat: Dictionary = Battle.seat_for(sea.session.store, sea.session.uid, str(sea.session.profile().get("username", "You")))
	b = Battle.begin(raid_id, [seat])
	# Out from wherever she lay into open water: the fight's own patch of sea.
	# Out through the Sea Gate into open water: the fight's own patch of sea
	# (until the campaign's water is in the port, its fights are sailed out
	# to from the Gunwharf). She sails back when it is over.
	_from = sea._boat.position
	_at = North.SEA_GATE + Vector2(-300, -1300)
	_enemy_at = _at + Vector2(620, -40)
	sea._boat.velocity = Vector2.ZERO
	sea._boat.target = null
	sea._boat.hold_still = true
	var sail: Tween = create_tween()
	sail.tween_property(sea._boat, "position", _at, 2.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
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
	_at = sea._boat.position
	_enemy_at = _at + Vector2(620, -40)
	_frame()
	await _enemy_enters()
	_await_plan()


## The camera's frame on the fight: centred between the two, zoomed so the
## pair fills the middle of the screen.
func _frame() -> void:
	var vp: Vector2 = get_viewport_rect().size
	var span: float = absf(_enemy_at.x - _at.x) + 520.0
	var z: float = clampf(vp.x * 0.72 / span, 0.55, 1.5)
	var mid: Vector2 = (_enemy_at - _at) / 2.0
	sea.stage = { "zoom": z, "shift": Vector2(mid.x, mid.y * Chart.GROUND - 40.0) * z }


func _process(delta: float) -> void:
	_t += delta
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


func _seat_at(i: int) -> Vector2:
	var base: Vector2 = sea._boat.position if sea != null else _at
	return base + Vector2(-60.0 * i, 170.0 * i * (1.0 if i % 2 == 1 else -1.0))


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
	_enemy.position = _enemy_at + Vector2(900, 30)
	_enemy.z_index = 1
	sea._world.add_child(_enemy)
	_portrait = Skipper.tex(str(e.get("portrait", "")).trim_prefix("/"))
	_shown_hp["e"] = float(e["hp"])
	var f: Dictionary = Battle.fight_at(_raid, int(b["fight"]))
	_say("%s%s" % [("Boss: " if e["boss"] else ""), e["name"]])
	_log_line("Fight %d of %d" % [int(b["fight"]) + 1, int(f["of"])])
	var tw: Tween = create_tween()
	tw.tween_property(_enemy, "position", _enemy_at, 1.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	for k: int in 6:
		tw.parallel().tween_callback(func() -> void: sea._field.ring(_enemy.position + Vector2(60, 10), 90.0, 1.2, 0.4)).set_delay(0.25 * k)
	await tw.finished


# ── The deck ─────────────────────────────────────────────────────────────────

func _build_deck() -> void:
	_deck = Control.new()
	_deck.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_deck.offset_left = -470
	_deck.offset_right = 470
	_deck.offset_top = -BAR - 150
	_deck.offset_bottom = -BAR + 6
	_deck.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_deck)
	var pane: Pane = Kit.pane(_deck, { "radius": 14, "fill": [Color(0.13, 0.1, 0.08, 0.94)], "border": [2, Color(BRASS, 0.7)], "shadow": [Color(0, 0, 0, 0.6), 18, Vector2(0, 6)], "pad": [18, 12, 18, 12] })
	pane.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_deck_box = VBoxContainer.new()
	_deck_box.add_theme_constant_override("separation", 8)
	pane.add_child(_deck_box)
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
	if autoplay:
		await _wait(0.6)
		var s: Dictionary = b["seats"][0]
		var lg: Dictionary = Battle.legal(b, s)
		if float(b["turn"]) == 2.0 and not (s["crew"] as Array).is_empty() and Battle.ability_ok(b, s, s["crew"][0]["id"]) == "":
			_plan["ability"] = { "crew": s["crew"][0]["id"], "target": 0 }
			_paint_actions()
			await _wait(0.4)
		_choose("volley" if lg["volley"] else ("fire" if lg["fire"] and Dice.next() < 0.6 else "reload"))
		if _plan.get("action") in ["fire", "volley"]:
			await _wait(randf_range(0.6, 1.6))
			for bar: Node in find_children("", "AimBar", true, false):
				(bar as AimBar).lock()


func _paint_actions() -> void:
	_clear_deck()
	var s: Dictionary = b["seats"][0]
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 10)
	_deck_box.add_child(top)
	var lg: Dictionary = Battle.legal(b, s)
	var acts: Array = [["fire", "Fire", "1 ball", KEY_1], ["volley", "Volley", "3 balls, double", KEY_2], ["reload", "Reload", "+1 ball", KEY_3], ["dodge", "Dodge", "brace to slip a shot", KEY_4]]
	for a: Array in acts:
		var on: bool = lg.get(a[0], false)
		var bt: Button = Kit.button("%s  ·  %s" % [a[1], str(a[3] - KEY_0)], "primary" if a[0] == "fire" and on else "secondary", "small")
		bt.disabled = not on
		bt.tooltip_text = a[2]
		bt.custom_minimum_size = Vector2(150, 44)
		var act: String = a[0]
		bt.pressed.connect(func() -> void: _choose(act))
		top.add_child(bt)
	var sp: Control = Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(sp)
	var pips: Control = Control.new()
	pips.custom_minimum_size = Vector2(120, 44)
	pips.draw.connect(func() -> void:
		var f: Font = Kit.font("karla", 700)
		pips.draw_string(f, Vector2(0, 14), "BALLS", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(Paper.INK, 0.6))
		for k: int in int(s["maxCharges"]):
			var c: Vector2 = Vector2(14 + k * 28, 30)
			var full: bool = k < int(s["charges"])
			pips.draw_circle(c, 10.0, Color(0, 0, 0, 0.4))
			pips.draw_circle(c, 9.0, Color(0.16, 0.16, 0.17) if full else Color(0.3, 0.26, 0.22))
			if full:
				pips.draw_circle(c + Vector2(-3, -3), 3.0, Color(1, 1, 1, 0.3)))
	top.add_child(pips)
	# The crew's orders.
	var crew: Array = s["crew"]
	if not crew.is_empty():
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		_deck_box.add_child(row)
		Kit.text(row, "ORDERS", "eyebrow", Color(Paper.INK, 0.6)).size_flags_vertical = Control.SIZE_SHRINK_CENTER
		for c: Dictionary in crew:
			row.add_child(_order_card(s, c))


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
	Kit.text(v, str(c["name"]), "small", Paper.INK if why == "" else Color(Paper.INK, 0.4))
	Kit.text(v, ("READY" if chosen else str(cls.get("shortLabel", ""))) if why == "" else ("USED" if why.begins_with("Already") else why.to_upper()), "eyebrow", col.darkened(0.35) if why == "" else Color(Paper.INK, 0.35))
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
			_plan["ability"] = { "crew": c["id"], "target": 0 }
			Sound.plip()
		_paint_actions())
	return bt


func _unhandled_input(e: InputEvent) -> void:
	if _busy or not (e is InputEventKey) or not (e as InputEventKey).pressed or (e as InputEventKey).echo:
		return
	var m: Dictionary = { KEY_1: "fire", KEY_2: "volley", KEY_3: "reload", KEY_4: "dodge" }
	var kc: int = (e as InputEventKey).keycode
	if m.has(kc) and Battle.legal(b, b["seats"][0]).get(m[kc], false):
		get_viewport().set_input_as_handled()
		_choose(m[kc])


func _choose(act: String) -> void:
	if _busy:
		return
	_plan["action"] = act
	if act == "fire" or act == "volley":
		_busy = true
		_clear_deck()
		var s: Dictionary = b["seats"][0]
		var bar: AimBar = AimBar.new()
		bar.enemy_speed = float(b["enemy"]["speed"])
		bar.nav = float(s["nav"])
		var sh: Dictionary = s["sharp"]
		# A Sharpshot ordered this turn widens the gold band now.
		var ab: Dictionary = Js.obj(_plan.get("ability"))
		for c: Dictionary in s["crew"]:
			if not ab.is_empty() and c["id"] == ab["crew"] and c["cls"] == "sharpshot":
				sh = { "mult": c["ms"]["critZoneMultiplier"] }
		bar.crit_w = Battle.CRIT_W * (1.0 + float(sh.get("mult", 0.0)))
		bar.volley = act == "volley"
		bar.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		_deck_box.add_child(bar)
		var res: String = await bar.locked
		_plan["aim"] = res
		await get_tree().create_timer(0.45).timeout
	_busy = true
	_clear_deck()
	_play(Battle.resolve(b, [_plan]))


# ── Playing a round ──────────────────────────────────────────────────────────

func _play(ev: Array) -> void:
	for x: Dictionary in ev:
		await _one(x)
	_strip_lit = -99
	match b["state"]:
		"won":
			await _won()
		"lost":
			await _lost()
		_:
			_await_plan()


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
			await _wait(0.45)
		"brace":
			_strip_lit = int(x["seat"])
			_puff(_seat_at(int(x["seat"])), "Bracing", Color(0.7, 0.85, 1.0))
			await _wait(0.4)
		"shot":
			_strip_lit = int(x["seat"])
			var land: String = "dodge" if x.get("dodged", false) else ("miss" if x["aim"] == "miss" else ("crit" if x["aim"] == "critical" else "hit"))
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
			await _wait(0.35)
		"intent":
			pass
		"eReload":
			_strip_lit = -1
			_puff(_enemy_at, "Reloads", Color(CREAM, 0.8))
			await _wait(0.4)
		"eDodge":
			_strip_lit = -1
			_enemy.heel = -0.1
			_puff(_enemy_at, "Evades", Color(0.75, 0.85, 1.0))
			await _wait(0.35)
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
			await _wait(0.35)
		"phase":
			_say(str(e["name"]) + " rises again!")
			_log_line(str(x.get("line", "")))
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
			_say("The ward holds!")
			_shown_hp[int(x["seat"])] = float(x["hp"])
			await _wait(0.9)
		"sunk":
			_say("Holed below the waterline")
			await _wait(0.8)


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
	await _wait(0.6)
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
	await _wait(0.7)
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
	await _enemy_enters()
	_await_plan()


func _crate() -> void:
	var s: Dictionary = b["seats"][0]
	var r: Dictionary = RaidRun.open_crate(sea.session.store, sea.session.uid, _raid, float(s["fortune"]))
	RaidRun.record_clear(sea.session.store, sea.session.uid, raid_id)
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
	_log_line("Sail back to the Gunwharf and try again.")
	Sound.slack()
	await _wait(2.6)
	_end(false)


func _end(won: bool) -> void:
	if _enemy != null:
		_enemy.queue_free()
	_fx.queue_free()
	sea.stage = null
	sea._hud.visible = true
	# Home: back to where she lay (sunk, to the Gunwharf's berth).
	var home: Vector2 = _from
	if not won and sea._berths.has("gunwharf"):
		home = (sea._berths["gunwharf"] as Node2D).position
	var back: Tween = create_tween()
	back.tween_property(sea._boat, "position", home, 2.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	back.tween_callback(func() -> void: sea._boat.hold_still = false)
	var tw: Tween = create_tween()
	tw.tween_property(self, "_bars", 0.0, 0.5)
	tw.parallel().tween_property(self, "_drop", 260.0, 0.4)
	await tw.finished
	finished.emit(won)
	queue_free()


# ── Drawing: the bars, the plates over the ships, the strip, the numbers ─────

func _draw() -> void:
	var vp: Vector2 = size
	var hb: float = BAR * _bars
	draw_rect(Rect2(0, 0, vp.x, hb), Color(0, 0, 0, 0.92))
	draw_rect(Rect2(0, vp.y - hb, vp.x, hb), Color(0, 0, 0, 0.92))
	if _bars < 0.5 or b.is_empty():
		return
	var f: Font = Kit.font("cinzel", 800)
	var small: Font = Kit.font("karla", 700)
	# The raid's name in the top bar, and the turn strip.
	var title: String = "%s  ·  Fight %d of %d" % [_raid.get("raidTitle", ""), int(b["fight"]) + 1, int(Battle.fight_at(_raid, int(b["fight"]))["of"])]
	draw_string(f, Vector2(28, hb * 0.62), title, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(CREAM, 0.9))
	_draw_strip(Vector2(vp.x - 28, hb * 0.5))
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
