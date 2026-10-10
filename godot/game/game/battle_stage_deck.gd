extends RefCounted
## Part of BattleStage (game/battle_stage.gd): the deck and its input: the
## orders row, the choosers (Fire, Special, Field Surgery), the crew's order
## cards and the order preview on the water, a heal's target row, the keys and
## clicks, the aim bar for a shot, the drum and the run for it (the die).
## Split out of game/battle_stage.gd on 2026-10-10 for size. Static helpers
## taking the stage (bs) first; every piece of the fight's state stays on it.

const BattleStagePlayback = preload("res://game/battle_stage_playback.gd")
const BattleStageSync = preload("res://game/battle_stage_sync.gd")


static func _build_deck(bs: BattleStage) -> void:
	bs._deck = Control.new()
	bs._deck.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	bs._deck.offset_left = -BattleStage.DECK_W / 2.0
	bs._deck.offset_right = BattleStage.DECK_W / 2.0
	bs._deck.offset_top = -BattleStage.BAR - 150
	bs._deck.offset_bottom = -BattleStage.BAR + 6
	bs._deck.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bs.add_child(bs._deck)
	# No paper behind the deck (Kong, 2026-10-05): the bottom of the screen
	# just darkens softly into the black bar, so the discs, the crew and the
	# log stand on the water.
	var fade: ColorRect = ColorRect.new()
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fade.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	fade.offset_top = -BattleStage.BAR - 300.0
	fade.offset_bottom = -BattleStage.BAR
	var fm: ShaderMaterial = ShaderMaterial.new()
	var fsh: Shader = Shader.new()
	fsh.code = "shader_type canvas_item;\nvoid fragment() { float a = smoothstep(0.0, 1.0, UV.y); COLOR = vec4(0.01, 0.015, 0.025, a * a * 0.72); }"
	fm.shader = fsh
	fade.material = fm
	bs.add_child(fade)
	bs.move_child(fade, bs._deck.get_index())
	bs._deck_bg = [fade]
	var pad: MarginContainer = MarginContainer.new()
	pad.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: Array in [["left", 22], ["right", BattleStage.LOG_W + 34], ["top", 16], ["bottom", 14]]:
		pad.add_theme_constant_override("margin_" + side[0], side[1])
	bs._deck.add_child(pad)
	bs._deck_box = VBoxContainer.new()
	bs._deck_box.add_theme_constant_override("separation", 8)
	bs._deck_box.alignment = BoxContainer.ALIGNMENT_CENTER
	pad.add_child(bs._deck_box)
	# The crew stand up out of the deck's top edge, half over the water.
	bs._crew_row = HBoxContainer.new()
	bs._crew_row.add_theme_constant_override("separation", 10)
	bs._crew_row.set_anchors_preset(Control.PRESET_TOP_LEFT)
	bs._crew_row.offset_left = 26.0
	bs._crew_row.offset_top = -BattleStage.CREW_LIFT
	bs._crew_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bs._deck.add_child(bs._crew_row)
	# The log's last lines, on the deck's right, a rule between.
	bs._deck_log = Control.new()
	bs._deck_log.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
	bs._deck_log.offset_left = -BattleStage.LOG_W - 18.0
	bs._deck_log.offset_right = -18.0
	bs._deck_log.offset_top = 14.0
	bs._deck_log.offset_bottom = -12.0
	bs._deck_log.mouse_filter = Control.MOUSE_FILTER_PASS
	bs._deck.add_child(bs._deck_log)
	# The deck's log (CombatLog) carries every line; there is no floating one.
	if bs._clog == null:
		bs._clog = CombatLog.new()
		bs._clog.stage = bs
		bs.add_child(bs._clog)
		bs._clog.mini.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		bs._deck_log.add_child(bs._clog.mini)
	_deck_dim(bs, false, 0.6)


## The deck's orders dimmed out of play (on) or lit for your turn: one 0.2s
## SINE curve both ways, for every caller.
static func _deck_dim(bs: BattleStage, on: bool, delay: float = 0.0) -> void:
	if bs._dim_tw != null and bs._dim_tw.is_valid():
		bs._dim_tw.kill()
	bs._dim_tw = bs.create_tween()
	Motion.ease_fade(bs._dim_tw, bs, "_dim", 1.0 if on else 0.0, 0.2).set_delay(delay)


static func _deck_paper(bs: BattleStage, on: bool) -> void:
	for n: Control in bs._deck_bg:
		if is_instance_valid(n):
			bs.create_tween().tween_property(n, "modulate:a", 1.0 if on else 0.0, 0.25 if on else 0.18)


static func _clear_deck(bs: BattleStage) -> void:
	# An aim still unlocked is called off: freed wherever it stands (the dial
	# is on the stage, not in the deck) and the deck's paper comes back.
	if bs._aiming != null:
		if is_instance_valid(bs._aiming):
			bs._aiming.queue_free()
		bs._aiming = null
		_deck_paper(bs, true)
	for c: Node in bs._deck_box.get_children():
		c.queue_free()
	if bs._crew_row != null:
		for c2: Node in bs._crew_row.get_children():
			c2.queue_free()


static func _await_plan(bs: BattleStage) -> void:
	bs._busy = false
	bs._plan = {}
	bs._menu = ""
	_paint_actions(bs)
	# The deck lights back up for your turn.
	_deck_dim(bs, false)
	if bs.autoplay:
		await bs._wait(0.3)
		var s: Dictionary = bs.b["seats"][bs.me]
		var lg: Dictionary = Battle.legal(bs.b, s)
		if float(bs.b["turn"]) == 2.0 and not (s["crew"] as Array).is_empty() and Battle.ability_ok(bs.b, s, s["crew"][0]["id"]) == "":
			bs._plan["ability"] = { "crew": s["crew"][0]["id"], "target": bs.me }
			_paint_actions(bs)
			await bs._wait(0.4)
		_choose(bs, "volley" if lg["volley"] else ("fire" if lg["fire"] and Dice.next() < 0.6 else "reload"))
		if bs._plan.get("action") in ["fire", "volley"]:
			await bs._wait(randf_range(0.4, 1.0))
			for bar: Node in bs.find_children("", "AimBar", true, false):
				(bar as AimBar).lock()


static func _paint_actions(bs: BattleStage) -> void:
	_clear_deck(bs)
	var s: Dictionary = bs.b["seats"][bs.me]
	var lg: Dictionary = Battle.legal(bs.b, s)
	var mg: Dictionary = Js.obj(s.get("mega"))
	var kit: Dictionary = Battle.repair_kit(s)
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 22)
	bs._deck_box.add_child(top)
	match bs._menu:
		"fire":
			# Fire's chooser: the single shot, the volley, the Mega.
			# One rule for emphasis: the recommended action is the big gold
			# word. Here that is the Volley when it can be fired, else Fire.
			var fk2: BattleLook.ActionKey = _word_key(bs, "Fire", "F", lg["fire"], false, "One ball, one shot", BattleLook.CREAM, func() -> void: _pick_fire(bs, "fire"), "fire")
			top.add_child(fk2)
			top.add_child(_word_key(bs, "Volley", "V", lg["volley"], lg["volley"], "Three balls: a double-damage broadside", BattleLook.GOLD, func() -> void: _pick_fire(bs, "volley"), "volley"))
			if not mg.is_empty():
				top.add_child(_word_key(bs, str(mg["name"]), "M", lg.get("mega", false), false, "%s  ·  %d balls" % [mg.get("tagline", ""), int(Armory.aug()["megaCost"])], BattleLook.GOLD, func() -> void: _pick_fire(bs, "mega"), "mega"))
			top.add_child(_word_key(bs, "Back", "Esc", true, false, "", BattleLook.MUTED, func() -> void: _close_menu(bs), "back"))
		"special":
			# The specials: the repair kit (the crew's orders have their row).
			if not kit.is_empty():
				var rg: Vector2 = Battle.repair_range(s)
				var why: String = "Used this fight" if s.get("kitUsed", false) else ("Hull already full" if float(s["hp"]) >= float(s["max"]) else "Heals %d-%d, costs your turn" % [int(rg.x), int(rg.y)])
				var kk: BattleLook.ActionKey = _word_key(bs, str(kit["name"]), "1", lg.get("repair", false), false, str(kit.get("description", "")), BattleLook.HEAL, func() -> void:
					bs._menu = ""
					_choose(bs, "repair"), "special")
				kk.sub = why
				kk.custom_minimum_size = Vector2(maxf(kk.custom_minimum_size.x, 220.0), 82)
				top.add_child(kk)
			# The captain's class order (core/captain_class.gd): once, back at
			# the rest, a turn spent (Powder Keg with Quick Fuse rides beside an
			# attack instead).
			var cf: Dictionary = Js.obj(s.get("cls"))
			if str(cf.get("order", "")) != "":
				var why2: String = Battle.order_ok(s)
				var armed: bool = bs._plan.get("keg", false) == true
				var ok_k: BattleLook.ActionKey = _word_key(bs, str(CaptainClass.ORDER_NAME.get(cf["order"], "Order")), "2", why2 == "" and not armed, false, CaptainClass.order_line(cf), BattleLook.GOLD, func() -> void: _press_order(bs), "special")
				ok_k.sub = "Armed: your next attack" if armed else (why2 if why2 != "" else ("No turn spent" if cf.get("kegFree", false) and cf["order"] == "powder_keg" else "Takes your turn"))
				ok_k.custom_minimum_size = Vector2(maxf(ok_k.custom_minimum_size.x, 240.0), 82)
				top.add_child(ok_k)
			top.add_child(_word_key(bs, "Back", "Esc", true, false, "", BattleLook.MUTED, func() -> void: _close_menu(bs), "back"))
		"surgery":
			# Field Surgery: which ship.
			for i: int in (bs.b["seats"] as Array).size():
				var st: Dictionary = bs.b["seats"][i]
				if not Battle.alive(bs.b).has(st):
					continue
				var at: int = i
				var sk: BattleLook.ActionKey = _word_key(bs, "Your ship" if i == bs.me else str(st["name"]), "", true, false, "%d / %d hull" % [int(st["hp"]), int(st["max"])], BattleLook.HEAL, func() -> void:
					bs._menu = ""
					bs._plan["ally"] = at
					_choose(bs, "order"), "special")
				sk.custom_minimum_size = Vector2(170, 64)
				top.add_child(sk)
			top.add_child(_word_key(bs, "Back", "Esc", true, false, "", BattleLook.MUTED, func() -> void: _open_menu(bs, "special"), "back"))
		_:
			# Fire is one of the row, not a bigger gold word (Kong, 2026-10-09).
			top.add_child(_word_key(bs, "Reload", "R", lg["reload"], false, "+1 ball", BattleLook.CREAM, func() -> void: _choose(bs, "reload"), "reload"))
			var fk: BattleLook.ActionKey = _word_key(bs, "Fire", "F", lg["fire"], false, "Fire; with the balls for it, a Volley or the Mega" if (lg["volley"] or lg.get("mega", false)) else "One ball, one shot", BattleLook.CREAM, func() -> void: _tap_fire(bs), "fire")
			top.add_child(fk)
			top.add_child(_word_key(bs, "Dodge", "D", lg["dodge"], false, "Dodge the next shot (not twice running)", BattleLook.CREAM, func() -> void: _choose(bs, "dodge"), "dodge"))
			var ord_name: String = str(CaptainClass.ORDER_NAME.get(str(Js.obj(s.get("cls")).get("order", "")), ""))
			var sp_sub: String = " and ".join(PackedStringArray([str(kit.get("name", "")), ord_name].filter(func(x: String) -> bool: return x != "")))
			top.add_child(_word_key(bs, "Special", "S", not kit.is_empty() or ord_name != "", false, sp_sub if sp_sub != "" else "No special aboard", BattleLook.CREAM, func() -> void: _open_menu(bs, "special"), "special"))
			var drum: Dictionary = Battle.drum_of(s)
			if not drum.is_empty():
				top.add_child(_word_key(bs, str(drum["name"]), "B", not (s.get("drum", false) or (s["used"] as Array).is_empty()), false, str(drum.get("description", "")), BattleLook.GOLD, func() -> void: _beat_drum(bs), "drum"))
			if bs.gauntlet == "":
				top.add_child(_word_key(bs, "Flee", "X", true, false, "Roll to get away: a %d or better on a d20. A miss takes a parting shot." % Battle.flee_need(bs.b, bs.me), BattleLook.MUTED, func() -> void: _flee(bs), "flee"))
	# The shot in the rack shows on your ship's plate, not here (Kong, 2026-10-05).
	# The crew's orders: standing up out of the deck's top edge.
	var crew: Array = s["crew"]
	for ci: int in crew.size():
		bs._crew_row.add_child(_order_card(bs, s, crew[ci], ci))
	_target_row(bs)


## Fire: with a Volley or the Mega in reach it opens the chooser; else it fires.
static func _tap_fire(bs: BattleStage) -> void:
	var lg: Dictionary = Battle.legal(bs.b, bs.b["seats"][bs.me])
	if not lg["fire"]:
		return
	if lg["volley"] or lg.get("mega", false):
		_open_menu(bs, "fire")
	else:
		_choose(bs, "fire")


static func _pick_fire(bs: BattleStage, act: String) -> void:
	if not Battle.legal(bs.b, bs.b["seats"][bs.me]).get(act, false):
		return
	bs._menu = ""
	_choose(bs, act)


static func _open_menu(bs: BattleStage, m: String) -> void:
	if m == "special" and Battle.repair_kit(bs.b["seats"][bs.me]).is_empty() and str(Js.obj(bs.b["seats"][bs.me].get("cls")).get("order", "")) == "":
		return
	bs._menu = m
	Sound.plip()
	_paint_actions(bs)


static func _close_menu(bs: BattleStage) -> void:
	bs._menu = ""
	Sound.plip()
	_paint_actions(bs)


## An action on the deck: its word and its key, nothing else.
static func _word_key(bs: BattleStage, word: String, key: String, on: bool, primary: bool, tip: String, accent: Color, f: Callable, icon: String = "") -> BattleLook.ActionKey:
	var k: BattleLook.ActionKey = BattleLook.ActionKey.new()
	k.kind = icon
	k.disc = true
	# The recommended action (primary) is the big gold word: one rule.
	k.big = primary
	k.label = word
	k.key_hint = key
	k.primary = on and primary
	k.accent = accent
	k.disabled = not on
	k.tooltip_text = tip
	var w: float = Kit.font("karla", 800).get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x + 44.0 + Kit.font("karla", 800).get_string_size(key, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + (30.0 if icon != "" else 0.0)
	var big: bool = primary
	var ww: float = Kit.font("cinzel", 700).get_string_size(word.to_upper() if big else word, HORIZONTAL_ALIGNMENT_LEFT, -1, 30 if big else 22).x
	k.custom_minimum_size = Vector2(maxf(96.0, ww + 34.0), 82)
	k.pressed.connect(f)
	return k


static func _order_card(bs: BattleStage, s: Dictionary, c: Dictionary, i: int = 0) -> Control:
	var why: String = Battle.ability_ok(bs.b, s, c["id"])
	var chosen: bool = Js.obj(bs._plan.get("ability")).get("crew") == c["id"]
	var cls: Dictionary = Js.obj(Js.obj(Crew.t().get("classes")).get(c["cls"]))
	var bt: BattleLook.CrewCard = BattleLook.CrewCard.new()
	bt.tex = Skipper.tex("card_thumbs/%s.png" % str(c["filename"]).get_basename())
	bt.hand = str(c["name"])
	bt.chosen = chosen
	# A chooser open (Fire, Special): 1 and 2 mean other things there, so the
	# crew's keys are hidden until it closes.
	bt.key_hint = str(i + 1) if i < 6 and bs._menu == "" else ""
	bt.state = ("ORDERED" if chosen else str(cls.get("shortLabel", "")).to_upper()) if why == "" else ("USED" if why.begins_with("Already") else why.to_upper())
	bt.disabled = why != ""
	bt.title = str(cls.get("shortLabel", cls.get("name", "")))
	bt.desc = str(Js.obj(c["ms"]).get("desc", "")) if why == "" else why
	if (s["crew"] as Array).size() > 5:
		bt.custom_minimum_size = Vector2(100, 168)
	bt.pressed.connect(func() -> void: _toggle_order(bs, c))
	return bt


## The class order pressed: Field Surgery asks which ship (in a line of more
## than one); Powder Keg with no turn spent arms the next attack and leaves
## the turn to you; the rest spend the turn now.
static func _press_order(bs: BattleStage) -> void:
	var s: Dictionary = bs.b["seats"][bs.me]
	if Battle.order_ok(s) != "":
		return
	var cf: Dictionary = s["cls"]
	match str(cf["order"]):
		"field_surgery":
			if Battle.alive(bs.b).size() > 1 and not cf.get("surgeryAll", false):
				_open_menu(bs, "surgery")
				return
			bs._menu = ""
			bs._plan["ally"] = bs.me
			_choose(bs, "order")
		"powder_keg":
			if cf.get("kegFree", false):
				bs._plan["keg"] = true
				Sound.charge()
				_close_menu(bs)
				return
			bs._menu = ""
			_choose(bs, "order")
		_:
			bs._menu = ""
			_choose(bs, "order")


## A crew hand's order given (or taken back): their card stands up, lit.
static func _toggle_order(bs: BattleStage, c: Dictionary) -> void:
	var s: Dictionary = bs.b["seats"][bs.me]
	if Battle.ability_ok(bs.b, s, c["id"]) != "":
		return
	if Js.obj(bs._plan.get("ability")).get("crew") == c["id"]:
		bs._plan.erase("ability")
		Sound.plip()
	else:
		bs._plan["ability"] = { "crew": c["id"], "target": bs.me }
		Sound.charge()
	_paint_actions(bs)


## AN ORDER GIVEN SHOWS AT ONCE (Kong, 2026-10-09: pressing a crewmate "doesn't
## use their ability"; it goes first in the round, with the captain's action).
## While choosing: a ring breathing on the water under what it will touch (the
## ship it helps, your own ship, or the enemy it works on) with its name, and
## beside the crew, what it is and when it goes.
## The crew orders that help a ship (and so may go to another ship in the line).
const ORDER_ALLY: Array = ["mender", "abyssal_tide", "anchor", "vengeance"]
const ORDER_FOE: Array = ["snare", "leviathan", "blitz", "requiem"]


static func _order_label(bs: BattleStage, c: Dictionary) -> String:
	var cls: Dictionary = Js.obj(Js.obj(Crew.t().get("classes")).get(c["cls"]))
	return str(cls.get("shortLabel", cls.get("name", "order")))


static func _order_preview(bs: BattleStage) -> void:
	var ab: Dictionary = Js.obj(bs._plan.get("ability"))
	if ab.is_empty() or bs._busy or bs.me < 0 or bs.me >= (bs.b["seats"] as Array).size():
		return
	var c: Dictionary = {}
	for x: Dictionary in bs.b["seats"][bs.me]["crew"]:
		if x["id"] == ab["crew"]:
			c = x
	if c.is_empty():
		return
	var cls: String = str(c["cls"])
	var at: Vector2
	var col: Color = BattleLook.GOLD
	if cls in ORDER_FOE:
		at = bs._screen(bs._foe_at(maxi(0, bs._target) if bs._field() else maxi(0, bs._cur)))
		col = Color(1.0, 0.62, 0.42)
	elif cls in ORDER_ALLY:
		var ti: int = int(Js.nz(ab.get("target"), float(bs.me)))
		at = bs._screen(bs._seat_at(ti if ti >= 0 and ti < (bs.b["seats"] as Array).size() else bs.me))
		col = BattleLook.HEAL if cls == "mender" else (BattleLook.CREAM if cls == "anchor" else BattleLook.SHIELD)
	else:
		at = bs._screen(bs._seat_at(bs.me))
	var z: float = bs._z()
	var k: float = 0.5 + 0.5 * sin(bs._t * 3.2)
	bs.draw_set_transform(at + Vector2(0, 8.0 * z), 0.0, Vector2(1.0, 0.3))
	bs.draw_arc(Vector2.ZERO, (128.0 + 10.0 * k) * z, 0.0, TAU, 64, Color(col, 0.3 + 0.35 * k), 3.0, true)
	bs.draw_arc(Vector2.ZERO, 104.0 * z, 0.0, TAU, 64, Color(col, 0.16), 2.0, true)
	bs.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	var f_big: Font = Kit.font("cinzel", 800)
	var lw: float = f_big.get_string_size(_order_label(bs, c), HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
	Kit.sea_string(bs, f_big, Vector2(at.x - lw / 2.0, at.y + 62.0 * z), _order_label(bs, c), 16, Color(col, 0.75 + 0.25 * k))
	# Beside the crew: who, what, and when it goes.
	if bs._crew_row != null and is_instance_valid(bs._crew_row):
		var cr: Rect2 = bs._crew_row.get_global_rect()
		var o: Vector2 = cr.position - bs.get_global_rect().position
		var x0: float = o.x + cr.size.x + 22.0
		var y0: float = o.y + cr.size.y * 0.55
		Kit.sea_string(bs, f_big, Vector2(x0, y0), "%s: %s" % [str(c["name"]), _order_label(bs, c)], 17, Color(BattleLook.GOLD, 0.95))
		Kit.sea_string(bs, Kit.font("karla", 700), Vector2(x0, y0 + 20.0), "Goes first this round, with your action", 12, Color(BattleLook.CREAM, 0.85))


## Together: a heal, shield, brace or ward ordered this turn may go to a crewmate.
static func _target_row(bs: BattleStage) -> void:
	var ab: Dictionary = Js.obj(bs._plan.get("ability"))
	if ab.is_empty() or bs.table == null or Battle.alive(bs.b).size() < 2:
		return
	var cls: String = ""
	for c: Dictionary in bs.b["seats"][bs.me]["crew"]:
		if c["id"] == ab["crew"]:
			cls = str(c["cls"])
	if cls not in ORDER_ALLY:
		return
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	bs._deck_box.add_child(row)
	Kit.text(row, "ORDER FOR", "eyebrow", BattleLook.MUTED).size_flags_vertical = Control.SIZE_SHRINK_CENTER
	for i: int in (bs.b["seats"] as Array).size():
		var st: Dictionary = bs.b["seats"][i]
		if not Battle.alive(bs.b).has(st):
			continue
		var bt: BattleLook.ActionKey = BattleLook.ActionKey.new()
		bt.label = "Your ship" if i == bs.me else str(st["name"])
		bt.sub = "%d / %d hull" % [int(st["hp"]), int(st["max"])]
		bt.chosen = int(ab.get("target", bs.me)) == i
		bt.custom_minimum_size = Vector2(150, 48)
		var at: int = i
		bt.pressed.connect(func() -> void:
			bs._plan["ability"]["target"] = at
			Sound.plip()
			_paint_actions(bs))
		row.add_child(bt)


static func _unhandled_input(bs: BattleStage, e: InputEvent) -> void:
	if bs._card != null and is_instance_valid(bs._card):
		return
	# A click on the enemy (its hull or its plate) opens its stat card.
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		if not bs.find_children("", "AimBar", true, false).is_empty():
			return
		var mp: Vector2 = (e as InputEventMouseButton).position
		var pj: int = bs._foe_plate_hit(mp)
		if pj >= 0:
			bs.get_viewport().set_input_as_handled()
			bs._open_enemy_card(pj)
			return
		var hj: int = bs._foe_hull_hit(mp)
		if hj >= 0:
			bs.get_viewport().set_input_as_handled()
			if bs._field() and not bs._busy:
				bs._set_target(hj)
			else:
				bs._open_enemy_card(hj)
			return
		# A click on a ship's plate opens that captain's ledger.
		for i: int in (bs.b["seats"] as Array).size():
			var sp: Vector2 = bs._plate_at.get(i, bs._screen(bs._seat_at(i)) + Vector2(0, bs._plate_lift(215.0)))
			if Rect2(sp + Vector2(-121, 0), Vector2(258, 60)).has_point((e as InputEventMouseButton).position):
				bs.get_viewport().set_input_as_handled()
				bs._open_captain_card(i)
				return
		return
	if bs._busy or not (e is InputEventKey) or not (e as InputEventKey).pressed or (e as InputEventKey).echo:
		return
	var kc: int = (e as InputEventKey).keycode
	if kc == KEY_TAB and bs._field():
		bs.get_viewport().set_input_as_handled()
		var fs3: Array = Battle.foes(bs.b)
		for k3: int in range(1, fs3.size() + 1):
			var nj: int = (bs._target + k3) % fs3.size()
			if Battle.foe_up(fs3[nj]):
				bs._set_target(nj)
				break
		return
	var lg: Dictionary = Battle.legal(bs.b, bs.b["seats"][bs.me])
	var hit: bool = true
	match bs._menu:
		"fire":
			match kc:
				KEY_F: _pick_fire(bs, "fire")
				KEY_V: _pick_fire(bs, "volley")
				KEY_M: _pick_fire(bs, "mega")
				KEY_ESCAPE: _close_menu(bs)
				_: hit = false
		"special":
			match kc:
				KEY_1:
					if lg.get("repair", false):
						bs._menu = ""
						_choose(bs, "repair")
				KEY_2:
					if lg.get("order", false):
						_press_order(bs)
				KEY_S, KEY_ESCAPE: _close_menu(bs)
				_: hit = false
		"surgery":
			match kc:
				KEY_ESCAPE: _open_menu(bs, "special")
				_: hit = false
		_:
			match kc:
				KEY_F: _tap_fire(bs)
				KEY_R:
					if lg["reload"]:
						_choose(bs, "reload")
				KEY_D:
					if lg["dodge"]:
						_choose(bs, "dodge")
				KEY_S: _open_menu(bs, "special")
				KEY_B:
					if not Battle.drum_of(bs.b["seats"][bs.me]).is_empty():
						_beat_drum(bs)
				KEY_X:
					if bs.gauntlet == "":
						_flee(bs)
				KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6:
					# The crew's orders, by their number on the card.
					var crew: Array = bs.b["seats"][bs.me]["crew"]
					var ci: int = kc - KEY_1
					if ci < crew.size():
						_toggle_order(bs, crew[ci])
					else:
						hit = false
				_: hit = false
	if hit:
		bs.get_viewport().set_input_as_handled()


static func _choose(bs: BattleStage, act: String) -> void:
	if bs._busy:
		return
	bs._plan["action"] = act
	if act == "fire" or act == "volley" or act == "mega":
		bs._busy = true
		_clear_deck(bs)
		var s: Dictionary = bs.b["seats"][bs.me]
		# Finn's fight aims on the dial (aimStyle "dial"), fed by fishing gear.
		var on_dial: bool = str(Battle.raid_def(str(bs.b.get("raidId", ""))).get("aimStyle", "")) == "dial"
		var bar: AimBar = AimDial.new() if on_dial else AimBar.new()
		bar.enemy_speed = float(bs.b["enemy"]["speed"])
		bar.nav = float(s["nav"])
		var sh: Dictionary = s["sharp"]
		# A Sharpshot ordered this turn widens the gold band now.
		var ab: Dictionary = Js.obj(bs._plan.get("ability"))
		for c: Dictionary in s["crew"]:
			if not ab.is_empty() and c["id"] == ab["crew"] and c["cls"] == "sharpshot":
				sh = { "mult": c["ms"]["critZoneMultiplier"] }
		var aim: Dictionary = Battle.aim_for(bs.b, bs.me, bs._target)
		bar.crit_w = Battle.CRIT_W * (1.0 + float(sh.get("mult", 0.0))) * float(aim["critZone"]) * float(aim["narrow"])
		bar.narrow = float(aim["narrow"])
		bar.blind = float(aim["blind"])
		bar.volley = act != "fire"
		bar.zone_stack = float(aim["zoneStack"])
		bar.needle_mult = float(aim["needleMult"])
		bar.crit_drift = float(aim["critDrift"])
		bar.fog = float(aim["fog"])
		bar.afflict = str(aim["afflict"])
		bar.decoy_n = int(aim["decoys"])
		if on_dial:
			var dial: AimDial = bar
			dial.fit(AimDial.gear(bs.sea.session.profile()))
			var rs: Dictionary = Js.obj(s.get("raidStreak"))
			dial.streak = Js.num(s.get("streak"))
			dial.streak_per = Js.num(rs.get("perStack"))
			dial.streak_label = str(rs.get("label", "Streak"))
			dial.pierce_at = Js.num(rs.get("pierceAt"))
		bar.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		if on_dial:
			# The dial stands over the water, centred, as the fishing dial does.
			bs.add_child(bar)
			bar.anchor_left = 0.5
			bar.anchor_right = 0.5
			bar.anchor_top = 0.5
			bar.anchor_bottom = 0.5
			bar.offset_left = -210.0
			bar.offset_right = 210.0
			bar.offset_top = -300.0
			bar.offset_bottom = 170.0
		else:
			bs._deck_box.add_child(bar)
		# The bar floats free over the water, like the fishing dial: the
		# deck's paper fades away while you aim, and comes back after.
		_deck_paper(bs, false)
		bs._aiming = bar
		var res: String = await bar.locked
		# Called off while it waited (the table moved on): nothing to send.
		if bs._aiming != bar:
			return
		bs._aiming = null
		_deck_paper(bs, true)
		bs._plan["aim"] = res
		bs._plan["target"] = bs._target
		# The lock's feedback (its word, ring and embers) plays out first.
		if is_instance_valid(bar) and not bar._settled:
			await bar.settled
	bs._busy = true
	_clear_deck(bs)
	if bs.table != null:
		BattleStageSync._act(bs, ["plan", bs._plan])
		BattleStageSync._waiting(bs)
		return
	# The deck dims out of play while the round plays on the water.
	_deck_dim(bs, true)
	var rev: Array = Battle.resolve(bs.b, [bs._plan])
	# A big hit counts toward the raid-damage bounties and badges; the round
	# toward the feat badges.
	Bounties.note_raid_hits(bs.sea.session.store, bs.sea.session.uid, rev, bs.me)
	RaidFeats.feed(bs._feats, rev, bs.me, int(bs.b["fight"]))
	BattleStagePlayback._play(bs, rev)


## The drum: a free beat, once a raid.
static func _beat_drum(bs: BattleStage) -> void:
	if bs._busy:
		return
	var r: Dictionary
	if bs.table != null:
		r = Js.obj(await BattleStageSync._act(bs, ["drum"]))
		if not r.has("error"):
			bs.b["seats"][bs.me]["drum"] = true
	else:
		r = Battle.use_drum(bs.b, bs.me)
	if r.has("error"):
		return
	Sound.horn()
	Rumble.buzz([0, 40, 40, 40, 40, 60])
	if r.get("refreshed") != null:
		bs._num(bs._seat_at(bs.me), "A crew order is back", BattleLook.GOLD, true)
	else:
		bs._num(bs._seat_at(bs.me), "The drum goes unanswered", BattleLook.CREAM)
	_paint_actions(bs)


## The die for getting away, over the deck: a d20 tumbling onto the roll,
## the face needed beside it. Away: she turns and runs. Caught: the parting shot.
static func _flee(bs: BattleStage) -> void:
	if bs._busy:
		return
	bs._busy = true
	if bs.table != null:
		_clear_deck(bs)
		BattleStageSync._act(bs, ["plan", { "action": "flee" }])
		BattleStageSync._waiting(bs)
		return
	var ev: Array = Battle.flee(bs.b, bs.me)
	await _show_flee(bs, ev[0], Battle.flee_need(bs.b, bs.me))
	for k: int in range(1, ev.size()):
		await BattleStagePlayback._one(bs, ev[k])
	match bs.b["state"]:
		"fled":
			await bs._got_away()
		"lost":
			await bs._lost()
		_:
			_await_plan(bs)


static func _show_flee(bs: BattleStage, x: Dictionary, need: int) -> void:
	_clear_deck(bs)
	_deck_dim(bs, false)
	Paper.night = true
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	bs._deck_box.add_child(row)
	var die: NodeSheet.DiceFace = NodeSheet.DiceFace.new()
	die.custom_minimum_size = Vector2(180, 120)
	die.final = int(x["natural"])
	row.add_child(die)
	var v: VBoxContainer = VBoxContainer.new()
	row.add_child(v)
	Paper.text(v, "MAKING A RUN FOR IT", "eyebrow", Paper.ink_soft())
	Paper.text(v, "Need %d or better  ·  a 20 always gets away, a 1 never does" % need, "body_strong", Paper.ink())
	var said: Label = Paper.text(v, "", "display", Paper.ink())
	# Read while the night paper is set: Caught in its red, Away in the heal.
	var caught_col: Color = Paper.red()
	Paper.night = false
	await die.landed
	if x["success"]:
		said.text = "Away!"
		said.add_theme_color_override("font_color", BattleLook.HEAL)
		Sound.horn()
	else:
		said.text = "Caught!"
		said.add_theme_color_override("font_color", caught_col)
		await bs._wait(0.4)
		bs._fx.shot(bs._enemy_at + Vector2(-40, 0), bs._seat_at(bs.me), "hit")
		await bs._wait(0.5)
		bs._dmg(bs._seat_at(bs.me), int(x.get("dmg", 0)), true, false, "Parting shot", BattleLook.FOE)
		bs._shown_hp[bs.me] = float(x.get("hp", bs.b["seats"][bs.me]["hp"]))
	await bs._wait(1.0)
	_clear_deck(bs)
