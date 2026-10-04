class_name ReadyScreen
extends Control
## THE RAID'S ENTRY SCREEN (Kong, 2026-10-03: "should function like an actual
## ready screen like going into a group dungeon in like Warcraft"). Opens
## when a raid is called at its hull: solo, or in a Charter for everyone who
## joins (the state comes from the founder's game, game/raid_table.gd).
##
##   THE RAID   its name and what lies ahead (how many fights, the boss).
##   THE TIER   Normal, Co-op, Co-op Challenge, side by side; a shut one says
##              why. The caller picks; a new pick asks everyone again.
##   THE LINE   four seats: each captain who has joined as a card (their
##              avatar, ship, Navigation and hull, the hands seated for raids,
##              the tiers they have beaten) with Ready or Not ready; an empty seat waits
##              for a crewmate at the raid to join.
##   THE BOSS   its portrait and what the crate can pay: each item and the
##              chance it is in this captain's crate on this tier, the coin.
##   THE FOOT   who is still to say ready, the tier's terms, and the buttons:
##              Ready / Not ready and Leave for a crewmate; Sail (when all are
##              ready) and Disband for the caller; Sail and Back alone.
## Flat and clean on the night side's browns, as the stat cards are.

signal sail(tier: String)
signal closed

const W: float = 1180.0
const H: float = 680.0

var sea: Sea
## Solo (no table): the raid and node, and this captain's own card.
var raid_id: String = ""
var node_id: String = ""
## In a Charter: the founder's table and this captain's key.
var table: RaidTable = null
var my_key: String = ""

var _st: Dictionary = {}
var _card: Panel
var _faces: Dictionary = {}
var _body: Control
var _solo_tier: String = "normal"


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var scrim: ColorRect = ColorRect.new()
	scrim.color = Color(0, 0, 0, 0.78)
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(scrim)
	var vp: Vector2 = get_viewport_rect().size
	_card = Panel.new()
	_card.add_theme_stylebox_override("panel", BattleLook.box(Dossier.FILL, Dossier.HAIR, 1, 18, 40.0, Color(0, 0, 0, 0.55)))
	_card.size = Vector2(minf(W, vp.x - 40.0), minf(H, vp.y - 40.0))
	_card.position = (vp - _card.size) / 2.0
	_card.clip_contents = true
	add_child(_card)
	if table != null:
		table.changed.connect(_on_table)
		_on_table(table.state)
	else:
		_st = _solo_state()
		_paint()
	_card.modulate.a = 0.0
	create_tween().tween_property(_card, "modulate:a", 1.0, 0.18)


func _solo_state() -> Dictionary:
	var me: Dictionary = { "key": "me", "name": sea.session.captain_name(), "ready": true, "card": RaidTable.card_of(sea.session, raid_id) }
	return { "phase": "muster", "raidId": raid_id, "nodeId": node_id, "by": "me", "tier": _solo_tier, "members": [me], "tiers": RaidTable.tiers_open([me]) }


func _on_table(st: Dictionary) -> void:
	match str(st.get("phase", "")):
		"muster":
			_st = st
			if not Js.list(st.get("members")).any(func(m: Dictionary) -> bool: return m["key"] == my_key):
				_close()
				return
			_paint()
		"playing":
			# The line has sailed: the fight takes it from here (RaidMuster).
			_close()
		_:
			if str(st.get("result", "")) == "called off" and sea != null:
				sea._hud.toast("The raid was called off.")
			_close()


func _close() -> void:
	if table != null and table.changed.is_connected(_on_table):
		table.changed.disconnect(_on_table)
	closed.emit()
	queue_free()


func _mine() -> String:
	return my_key if table != null else "me"


func _act(args: Array) -> void:
	var r: Variant = await sea.session.act("raidTable", args)
	if r is Dictionary and r.has("error") and sea != null:
		sea._hud.toast(str(r["error"]))


# ── The screen ────────────────────────────────────────────────────────────────

func _paint() -> void:
	if _body != null:
		_body.queue_free()
	_body = Control.new()
	_body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_card.add_child(_body)
	var raid: Dictionary = Battle.raid_def(str(_st["raidId"]))
	var boss: Dictionary = Js.obj(Js.obj(raid.get("enemies")).get(raid.get("bossId")))
	var w: float = _card.size.x
	var h: float = _card.size.y
	var pad: float = 34.0
	var right_w: float = 340.0
	# THE RAID.
	var of: int = int(Battle.fight_at(raid, 0)["of"])
	_label(_body, Vector2(pad, 30), "Raid  ·  %d fights, the last a boss" % of, "karla", 600, 14, Dossier.SOFT)
	_label(_body, Vector2(pad, 50), str(raid.get("raidTitle", "")), "cinzel", 700, 34, Dossier.INK)
	# THE TIER.
	var tiers: HBoxContainer = HBoxContainer.new()
	tiers.position = Vector2(pad, 112)
	tiers.size = Vector2(w - right_w - pad * 2.0 - 24.0, 74)
	tiers.add_theme_constant_override("separation", 10)
	_body.add_child(tiers)
	var caller: bool = _st.get("by") == _mine()
	for t: Array in [["normal", "Normal", "One enemy at a time"], ["coop", "Co-op", "Enemies 1 to 4 at once"], ["coopc", "Co-op Challenge", "More, tougher, elite escorts"]]:
		var tab: TierTab = TierTab.new()
		tab.id = t[0]
		tab.title = t[1]
		tab.note = t[2]
		tab.shut = str(Js.obj(_st.get("tiers")).get(t[0], ""))
		tab.chosen = _st.get("tier", "normal") == t[0]
		for m4: Dictionary in Js.list(_st.get("members")):
			if m4["key"] == _mine():
				tab.cleared = Js.obj(Js.obj(m4.get("card")).get("clears")).get(t[0], false) == true
		tab.can = caller
		tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tab.custom_minimum_size = Vector2(0, 74)
		tab.tooltip_text = ("Every captain in the line must clear this raid on Co-op first." if tab.shut.begins_with("Each") else tab.shut) if tab.shut != "" else ""
		var tid: String = t[0]
		tab.pressed.connect(func() -> void:
			if tab.shut != "" or not caller or tid == _st.get("tier"):
				return
			Sound.plip()
			if table != null:
				_act(["tier", tid])
			else:
				_solo_tier = tid
				_st = _solo_state()
				_paint())
		tiers.add_child(tab)
	# THE LINE.
	var members: Array = Js.list(_st.get("members"))
	var seats: HBoxContainer = HBoxContainer.new()
	seats.position = Vector2(pad, 206)
	seats.size = Vector2(w - right_w - pad * 2.0 - 24.0, h - 206 - 104)
	seats.add_theme_constant_override("separation", 10)
	_body.add_child(seats)
	for i: int in RaidTable.MAX_SEATS:
		var sc: SeatCard = SeatCard.new()
		sc.solo = table == null
		sc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if i < members.size():
			var m: Dictionary = members[i]
			sc.member = m
			sc.face = _face_tex(Js.obj(Js.obj(m.get("card")).get("face")))
			# Pictures loaded here, never first inside _draw (they come out white).
			var cd0: Dictionary = Js.obj(m.get("card"))
			var sa0: Dictionary = North.ship_art(cd0.get("shipTier"), cd0.get("shipSkin"))
			sc.ship_tex = Skipper.tex(str(sa0["art"]).trim_prefix("/"))
			sc.ship_name = str(Js.obj(sa0["def"]).get("name", "Ship"))
			for cm0: Variant in Js.list(cd0.get("crew")):
				sc.crew_tex.append(Skipper.tex("card_thumbs/%s.png" % str(Js.obj(cm0).get("filename", "")).get_basename()))
			sc.me = m["key"] == _mine()
			sc.leader = m["key"] == _st.get("by")
		seats.add_child(sc)
	# THE BOSS.
	var bp: BossPane = BossPane.new()
	bp.position = Vector2(w - right_w, 0)
	bp.size = Vector2(right_w, h - 88)
	bp.boss = boss
	bp.portrait = Skipper.tex(str(boss.get("portrait", boss.get("image", ""))).trim_prefix("/"))
	var my_card: Dictionary = {}
	for m2: Dictionary in members:
		if m2["key"] == _mine():
			my_card = Js.obj(m2.get("card"))
	var tc: Dictionary = Js.obj(Js.obj(Battle.cfg().get("tiers")).get(_st.get("tier", "normal")))
	bp.odds = RaidRun.crate_odds(raid, Js.num(my_card.get("fortune")), tc, Js.list(my_card.get("ownedSkins")))
	_body.add_child(bp)
	# THE FOOT.
	var foot_y: float = h - 88.0
	var rule: ColorRect = ColorRect.new()
	rule.color = Dossier.HAIR
	rule.position = Vector2(0, foot_y)
	rule.size = Vector2(w, 1)
	_body.add_child(rule)
	var waiting: Array = []
	for m3: Dictionary in members:
		if m3["key"] != _st.get("by") and not m3.get("ready", false):
			waiting.append("you" if m3["key"] == _mine() else str(m3["name"]))
	var status: String = "Everyone is ready." if waiting.is_empty() else "Waiting on %s." % ", ".join(PackedStringArray(waiting))
	if members.size() == 1:
		status = "Sailing alone." if table == null else "Sailing alone, unless a crewmate at the raid joins."
	_label(_body, Vector2(pad, foot_y + 22), status, "karla", 800, 15, Dossier.INK)
	_label(_body, Vector2(pad, foot_y + 46), _terms(str(_st.get("tier", "normal")), tc), "karla", 500, 13, Dossier.SOFT)
	var btns: HBoxContainer = HBoxContainer.new()
	btns.add_theme_constant_override("separation", 10)
	btns.alignment = BoxContainer.ALIGNMENT_END
	btns.position = Vector2(w - 520 - pad, foot_y + 20)
	btns.size = Vector2(520, 48)
	_body.add_child(btns)
	var my_ready: bool = members.any(func(m: Dictionary) -> bool: return m["key"] == _mine() and m.get("ready", false))
	if table == null:
		_button(btns, "Back", "secondary", func() -> void: _close())
		_button(btns, "Sail", "primary", func() -> void:
			sail.emit(_solo_tier)
			_close())
	elif caller:
		_button(btns, "Disband", "secondary", func() -> void: _act(["leave"]))
		var go: Button = _button(btns, "Sail", "primary", func() -> void: _act(["go"]))
		go.disabled = not waiting.is_empty() or str(Js.obj(_st.get("tiers")).get(_st.get("tier"), "")) != ""
	else:
		_button(btns, "Leave", "secondary", func() -> void: _act(["leave"]))
		_button(btns, "Not ready" if my_ready else "Ready", "secondary" if my_ready else "primary", func() -> void: _act(["ready", not my_ready]))
	Pane.set_night(_body, true)


static func _terms(tier: String, tc: Dictionary) -> String:
	match tier:
		"coop":
			return "Co-op: enemies come one to four at a time and hit harder. x%s coin and XP, %d extra crate roll." % [str(tc.get("coin", 1.5)), int(Js.num(tc.get("extraRolls")))]
		"coopc":
			return "Co-op Challenge: more ships, tougher, elite escorts. x%s coin and XP, %d extra crate rolls, rarer finds." % [str(tc.get("coin", 2.0)), int(Js.num(tc.get("extraRolls")))]
	return "Normal: one enemy at a time, as the raid was charted."


func _label(parent: Control, at: Vector2, s: String, family: String, weight: int, fs: int, c: Color) -> Label:
	var l: Label = Label.new()
	l.text = s
	l.position = at
	l.add_theme_font_override("font", Kit.font(family, weight))
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", c)
	parent.add_child(l)
	return l


func _button(parent: Control, t: String, kind: String, f: Callable) -> Button:
	var b: Button = Kit.button(t, kind)
	b.custom_minimum_size = Vector2(150, 48)
	b.pressed.connect(f)
	parent.add_child(b)
	return b


## A captain's avatar as a texture (game/avatar.gd), rendered once.
func _face_tex(face: Dictionary) -> Texture2D:
	var k: String = JSON.stringify(face)
	if _faces.has(k):
		return _faces[k]
	var sv: SubViewport = SubViewport.new()
	sv.size = Vector2i(128, 128)
	sv.transparent_bg = true
	sv.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	var av: Avatar = Avatar.new()
	av.px = 128.0
	av.face = face.merged({ "bg": "#2a1f17", "ring": "#00000000" })
	sv.add_child(av)
	add_child(sv)
	_faces[k] = sv.get_texture()
	return _faces[k]


func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventKey and (ev as InputEventKey).pressed:
		get_viewport().set_input_as_handled()
		if (ev as InputEventKey).keycode == KEY_ESCAPE:
			if table != null:
				_act(["leave"])
			else:
				_close()


# ── Its pieces ────────────────────────────────────────────────────────────────

## A tier, side by side with the others: its name and what it means; the
## chosen one in gold; a shut one faint, with why.
class TierTab:
	extends Button
	var id: String = ""
	var title: String = ""
	var note: String = ""
	var shut: String = ""
	var chosen: bool = false
	var can: bool = false
	var cleared: bool = false

	func _init() -> void:
		flat = true
		focus_mode = Control.FOCUS_NONE

	func _process(_d: float) -> void:
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if can and shut == "" and not chosen else Control.CURSOR_ARROW
		queue_redraw()

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var hov: bool = is_hovered() and can and shut == "" and not chosen
		var bg: Color = BattleLook.LACQUER_HI.lightened(0.08 if hov else 0.0)
		if chosen:
			bg = bg.lerp(BattleLook.GOLD.darkened(0.6), 0.35)
		BattleLook.draw_box(self, r, BattleLook.box(bg, Color(BattleLook.GOLD, 0.9) if chosen else Color(1, 1, 1, 0.07), 2 if chosen else 1, 12))
		var a: float = 0.45 if shut != "" else 1.0
		draw_string(Kit.font("cinzel", 700), Vector2(16, 32), title, HORIZONTAL_ALIGNMENT_LEFT, size.x - 24, 18, Color(Dossier.INK, a))
		draw_string(Kit.font("karla", 600), Vector2(16, 54), shut if shut != "" else note, HORIZONTAL_ALIGNMENT_LEFT, size.x - 56, 12, Color(Dossier.HARM if shut != "" else Dossier.SOFT, 0.8 if shut != "" else 1.0))
		if cleared:
			ReadyScreen.seal(self, Vector2(size.x - 26.0, size.y / 2.0), 14.0, true)


## A seat in the line: a captain's card, or an open seat.
class SeatCard:
	extends Control
	var member: Dictionary = {}
	var face: Texture2D
	var me: bool = false
	var leader: bool = false
	var solo: bool = false
	var ship_tex: Texture2D
	var ship_name: String = "Ship"
	var crew_tex: Array = []
	var _frames: int = 0

	# A texture first loaded in _draw is white until the next frame: draw again.
	func _process(_d: float) -> void:
		if _frames < 12:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		if member.is_empty():
			_dashed(r.grow(-1.0))
			BattleLook.say(self, Kit.font("cinzel", 700), r.size.x / 2.0, r.size.y * 0.46, "Open seat", 16, Color(Dossier.SOFT, 0.7))
			BattleLook.say(self, Kit.font("karla", 600), r.size.x / 2.0, r.size.y * 0.46 + 22.0, "sail in a Charter" if solo else "a crewmate at the raid", 12, Dossier.FAINT)
			BattleLook.say(self, Kit.font("karla", 600), r.size.x / 2.0, r.size.y * 0.46 + 38.0, "to fill it" if solo else "can join", 12, Dossier.FAINT)
			return
		var c: Dictionary = Js.obj(member.get("card"))
		var ready: bool = member.get("ready", false) or leader
		BattleLook.draw_box(self, r, BattleLook.box(BattleLook.LACQUER_HI, Color(Dossier.HELP, 0.8) if ready else Color(1, 1, 1, 0.07), 2 if ready else 1, 14))
		var cx: float = r.size.x / 2.0
		BattleLook.medallion(self, Vector2(cx, 60), 42.0, face, Dossier.HELP if ready else Color(1, 1, 1, 0.3), str(member.get("name", "?")).substr(0, 1), 1.0, Vector2(0.5, 0.5), 0.5)
		var nm: String = str(member.get("name", ""))
		BattleLook.say(self, Kit.font("cinzel", 700), cx, 126, nm if nm.length() <= 14 else nm.substr(0, 13) + ".", 17, Dossier.INK)
		var role: String = ("Leader" if leader else "") + ("  ·  you" if me else "")
		if role != "":
			BattleLook.say(self, Kit.font("karla", 600), cx, 144, role.trim_prefix("  ·  "), 12, Dossier.FAINT)
		# Their ship.
		var tex: Texture2D = ship_tex
		if tex != null:
			var box: Vector2 = Vector2(r.size.x - 40.0, 70.0)
			var sc: float = minf(box.x / float(tex.get_width()), box.y / float(tex.get_height()))
			var ts: Vector2 = tex.get_size() * sc
			draw_texture_rect(tex, Rect2(Vector2(cx - ts.x / 2.0, 156), ts), false)
		BattleLook.say(self, Kit.font("karla", 700), cx, 244, "%s  ·  Nav %d  ·  Hull %d" % [ship_name, int(Js.num(c.get("nav"))), int(Js.num(c.get("hull")))], 12, Dossier.SOFT)
		# The hands seated for raids.
		var crew: Array = Js.list(c.get("crew"))
		var n: int = mini(crew.size(), 6)
		var x0: float = cx - (n * 26.0 - 4.0) / 2.0 + 11.0
		for k: int in n:
			var cm: Dictionary = crew[k]
			BattleLook.medallion(self, Vector2(x0 + k * 26.0, 268), 11.0, crew_tex[k] if k < crew_tex.size() else null, Color(str(cm.get("color", "#cccccc"))), str(cm.get("name", "?")).substr(0, 1), 1.0, Vector2(0.5, 0.36), 0.36)
		if crew.is_empty():
			BattleLook.say(self, Kit.font("karla", 600), cx, 272, "no hands seated", 11, Dossier.FAINT)
		# The tiers of this raid they have beaten, as seals.
		var cl: Dictionary = Js.obj(c.get("clears"))
		for q: int in 3:
			var tid: String = ["normal", "coop", "coopc"][q]
			ReadyScreen.seal(self, Vector2(cx - 26.0 + q * 26.0, 300), 9.0, cl.get(tid, false) == true)
		# Ready or not.
		var st: String = "Ready" if ready else "Not ready"
		var f: Font = Kit.font("karla", 800)
		var sw: float = f.get_string_size(st, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x + (40.0 if ready else 24.0)
		var pr: Rect2 = Rect2(Vector2(cx - sw / 2.0, r.size.y - 44.0), Vector2(sw, 28))
		BattleLook.draw_box(self, pr, BattleLook.box(Color(Dossier.HELP, 0.18) if ready else Color(1, 1, 1, 0.05), Color(0, 0, 0, 0), 0, 14))
		var tx: float = pr.position.x + 12.0
		if ready:
			draw_polyline(PackedVector2Array([Vector2(tx, pr.get_center().y), Vector2(tx + 5, pr.get_center().y + 5), Vector2(tx + 13, pr.get_center().y - 5)]), Dossier.HELP, 2.2, true)
			tx += 20.0
		draw_string(f, Vector2(tx, pr.get_center().y + 5), st, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Dossier.HELP if ready else Dossier.SOFT)

	func _dashed(r: Rect2) -> void:
		var pts: Array = [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y), r.position]
		for k: int in 4:
			var a: Vector2 = pts[k]
			var bb: Vector2 = pts[k + 1]
			var L: float = a.distance_to(bb)
			var d: Vector2 = (bb - a) / L
			var t: float = 12.0
			while t < L - 12.0:
				draw_line(a + d * t, a + d * minf(t + 7.0, L - 12.0), Color(1, 1, 1, 0.14), 1.0)
				t += 13.0


## The boss and the crate.
class BossPane:
	extends Control
	var boss: Dictionary = {}
	var portrait: Texture2D
	var odds: Dictionary = {}

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = Dossier.ART_FILL
		sb.corner_radius_top_right = 18
		sb.anti_aliasing = true
		sb.draw(get_canvas_item(), r)
		draw_line(Vector2(0.5, 0), Vector2(0.5, r.size.y), Dossier.HAIR, 1.0)
		var c: Vector2 = Vector2(r.size.x / 2.0, 120)
		draw_circle(c, 92.0, Color("#e0a63a", 0.16))
		draw_circle(c, 64.0, Color("#e0a63a", 0.12))
		if portrait != null:
			var box: Vector2 = Vector2(r.size.x - 70.0, 200.0)
			var sc: float = minf(box.x / float(portrait.get_width()), box.y / float(portrait.get_height()))
			var ts: Vector2 = portrait.get_size() * sc
			draw_texture_rect(portrait, Rect2(Vector2(c.x - ts.x / 2.0, 222.0 - ts.y), ts), false)
		draw_string(Kit.font("karla", 600), Vector2(28, 252), "The boss", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Dossier.SOFT)
		draw_string(Kit.font("cinzel", 700), Vector2(28, 278), str(boss.get("name", "")), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 56, 22, Dossier.INK)
		draw_string(Kit.font("cinzel", 700), Vector2(28, 318), "In the crate", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Dossier.INK)
		draw_string(Kit.font("karla", 600), Vector2(28, 338), "%s–%s ⟡  ·  your odds on this tier" % [Js.thousands(Js.num(odds.get("coinMin"))), Js.thousands(Js.num(odds.get("coinMax")))], HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 56, 12, Dossier.SOFT)
		var y: float = 366.0
		var items: Array = Js.list(odds.get("items"))
		items.sort_custom(func(x: Dictionary, z: Dictionary) -> bool: return float(x["chance"]) > float(z["chance"]))
		for it: Dictionary in items:
			if y > r.size.y - 16.0:
				break
			var rc: Color = { "epic": Color("#b69cf6"), "legendary": Color("#f0c040"), "cosmetic": Color("#5eead4"), "ancient": Color("#f2826e") }.get(str(it.get("rarity", "")), Dossier.SOFT)
			draw_circle(Vector2(32, y - 4), 3.0, rc)
			draw_string(Kit.font("karla", 700), Vector2(42, y), str(it.get("label", "")), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 130, 13, Dossier.INK)
			var pct: String = "%.1f%%" % (float(it["chance"]) * 100.0)
			var pw: float = Kit.font("karla", 800).get_string_size(pct, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
			draw_string(Kit.font("karla", 800), Vector2(r.size.x - 28 - pw, y), pct, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Dossier.SOFT)
			y += 24.0



## A gold seal with a check: a tier beaten. Hollow and faint when not yet.
static func seal(ci: CanvasItem, c: Vector2, r: float, won: bool) -> void:
	if not won:
		ci.draw_arc(c, r, 0.0, TAU, 32, Color(1, 1, 1, 0.18), 1.2, true)
		return
	ci.draw_circle(c, r + 2.0, Color(0, 0, 0, 0.35))
	ci.draw_circle(c, r, BattleLook.GOLD.darkened(0.15))
	ci.draw_arc(c, r * 0.78, 0.0, TAU, 32, Color(1, 0.95, 0.75, 0.6), 1.0, true)
	ci.draw_polyline(PackedVector2Array([c + Vector2(-r * 0.42, 0), c + Vector2(-r * 0.1, r * 0.32), c + Vector2(r * 0.45, -r * 0.34)]), Color(0.18, 0.12, 0.05), maxf(1.6, r * 0.2), true)
