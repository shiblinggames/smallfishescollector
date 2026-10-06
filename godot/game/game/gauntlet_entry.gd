class_name GauntletEntry
extends Control
## THE DIVE'S ENTRY SCREEN at the maelstrom (the raids' ready check, as Kong
## asked of the raids, for the gauntlets): alone, or the line of a Charter's
## crew who have sailed to it (game/gauntlet_table.gd).
##
##   THE DESCENT  its name, the host's voice, the line's deepest.
##   THE MODE     Solo (one ship, one enemy at a time) or Co-op (two to four
##                ships against fields), and a dive the crew HELD, when there
##                is one: resume it where it was left, or end it.
##   THE LINE     four seats, each captain's card: their face, ship, hull,
##                hands, their deepest here, Ready or not.
##   THE SIDE     (Kong, 2026-10-03: "all of it will be in that screen";
##                party building and readiness stay in view while you look)
##                tabs in place, your Fathoms beside them: THE DESCENT (the
##                host, the chest ladder by depth, the chase), the LOCKER
##                (buy and switch perks), the CODEX (the synergies), the
##                RECORDS (yours, Solo and Co-op).
##   THE FOOT     who is still to say ready; Dive / Leave.
## Flat and clean on the night side's browns, as the raid's entry screen is.

signal closed

const W: float = 1440.0
const H: float = 780.0
## The share of the screen the ready check takes; the side has the rest.
const LEFT: float = 0.53

var sea: Sea
var table: GauntletTable
var my_key: String = "me"

var _st: Dictionary = {}
var _card: Panel
var _body: Control
var _faces: Dictionary = {}
var _side: Control
var _side_body: Control
var _side_tab: String = "descent"
var _side_bar: HBoxContainer
var _fathoms: Label


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
	_build_side()
	table.changed.connect(_on_table)
	_on_table(table.state)
	_card.modulate.a = 0.0
	create_tween().tween_property(_card, "modulate:a", 1.0, 0.18)


func _on_table(st: Dictionary) -> void:
	if str(st.get("phase", "")) != "muster" or not Js.list(st.get("members")).any(func(m: Dictionary) -> bool: return m["key"] == my_key):
		if str(st.get("result", "")) == "called off" and sea != null:
			sea._hud.toast("The dive was called off.")
		_close()
		return
	_st = st
	_paint()
	if _side_tab == "descent":
		_side_paint()


func _close() -> void:
	if table != null and table.changed.is_connected(_on_table):
		table.changed.disconnect(_on_table)
	closed.emit()
	queue_free()


func _act(args: Array) -> Variant:
	var r: Variant
	if table.solo != null:
		r = table.handle(my_key, sea.session, args)
	else:
		r = await sea.session.act("gauntletTable", args)
	if r is Dictionary and (r as Dictionary).has("error") and sea != null:
		sea._hud.toast(str(r["error"]))
	return r


func _variant() -> String:
	return str(_st.get("variant", "davy"))


func _paint() -> void:
	if _body != null:
		_body.queue_free()
	_body = Control.new()
	_body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_card.add_child(_body)
	var v: String = _variant()
	var w: float = _card.size.x
	var h: float = _card.size.y
	var pad: float = 34.0
	var right_w: float = w * (1.0 - LEFT)
	var members: Array = Js.list(_st.get("members"))
	var caller: bool = _st.get("by") == my_key
	var mode: String = str(_st.get("mode", "solo"))
	var resume: bool = _st.get("resume", false) == true
	var held: Dictionary = Js.obj(_st.get("held"))
	var mine_held: bool = not held.is_empty() and Js.list(held.get("keys")).has(my_key)
	var deepest: float = 0.0
	for m0: Dictionary in members:
		deepest = maxf(deepest, Js.num(Js.obj(m0.get("card")).get("deepest")))
	_label(Vector2(pad, 30), "The descent  ·  a fight a depth, bank or dive at every breather", "karla", 600, 14, Dossier.SOFT)
	_label(Vector2(pad, 50), str(Gauntlet.NAMES[v]), "cinzel", 700, 34, Dossier.INK)
	# THE MODE (and a held dive of this crew, to take up again).
	var tabs: HBoxContainer = HBoxContainer.new()
	tabs.position = Vector2(pad, 112)
	tabs.size = Vector2(w - right_w - pad * 2.0 - 24.0, 74)
	tabs.add_theme_constant_override("separation", 10)
	_body.add_child(tabs)
	var opts: Array = [["solo", "Solo", "One enemy at a time."], ["coop", "Co-op", "Two to four ships."]]
	if mine_held:
		var who: Array = []
		for k: String in Js.obj(held.get("names")):
			if k != my_key:
				who.append(str(held["names"][k]))
		opts.append(["held", "Held dive", "Depth %d, %s ⟡%s" % [int(Js.num(held.get("depth"))), Js.thousands(Js.num(held.get("pot"))), (", with %s" % ", ".join(PackedStringArray(who))) if not who.is_empty() else ""]])
	for t: Array in opts:
		var tab: ReadyScreen.TierTab = ReadyScreen.TierTab.new()
		tab.id = t[0]
		tab.title = t[1]
		tab.note = t[2]
		tab.shut = "Needs a Charter's crew." if t[0] == "coop" and table.solo != null else ""
		tab.chosen = (t[0] == "held" and resume) or (not resume and t[0] == mode)
		tab.can = caller
		tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tab.custom_minimum_size = Vector2(0, 74)
		var id: String = t[0]
		tab.pressed.connect(func() -> void:
			if tab.shut != "" or not caller or tab.chosen:
				return
			Sound.plip()
			if id == "held":
				_act(["resume", true])
			else:
				_act(["mode", id]))
		tabs.add_child(tab)
	# THE LINE.
	var seats: HBoxContainer = HBoxContainer.new()
	seats.position = Vector2(pad, 206)
	seats.size = Vector2(w - right_w - pad * 2.0 - 24.0, h - 206 - 104)
	seats.add_theme_constant_override("separation", 10)
	_body.add_child(seats)
	# The crewmates aboard but not in the line, each in an open seat.
	var crew: Array = Js.list(_st.get("crew")) if table.solo == null else []
	var pool: Vector2 = GauntletTable.maelstrom_of(v)
	for i: int in GauntletTable.MAX_SEATS:
		var sc: DiveSeat = DiveSeat.new()
		sc.solo = table.solo != null
		sc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if i >= members.size() and i - members.size() < crew.size():
			ReadyScreen.invite_seat(sc, crew[i - members.size()], sea, pool, func(a: Array) -> void: _act(a))
		if i < members.size():
			var m: Dictionary = members[i]
			sc.member = m
			sc.face = _face_tex(Js.obj(Js.obj(m.get("card")).get("face")))
			var cd0: Dictionary = Js.obj(m.get("card"))
			var sa0: Dictionary = North.ship_art(cd0.get("shipTier"), cd0.get("shipSkin"))
			sc.ship_tex = Skipper.tex(str(sa0["art"]).trim_prefix("/"))
			sc.ship_name = str(Js.obj(sa0["def"]).get("name", "Ship"))
			for cm0: Variant in Js.list(cd0.get("crew")):
				sc.crew_tex.append(Skipper.tex("card_thumbs/%s.png" % str(Js.obj(cm0).get("filename", "")).get_basename()))
			sc.me = m["key"] == my_key
			sc.leader = m["key"] == _st.get("by")
		seats.add_child(sc)
	# THE FOOT.
	var foot_y: float = h - 88.0
	var rule: ColorRect = ColorRect.new()
	rule.color = Dossier.HAIR
	rule.position = Vector2(0, foot_y)
	rule.size = Vector2(w - right_w, 1)
	_body.add_child(rule)
	var waiting: Array = []
	for m3: Dictionary in members:
		if m3["key"] != _st.get("by") and not m3.get("ready", false):
			waiting.append("you" if m3["key"] == my_key else str(m3["name"]))
	var status: String = "Everyone is ready." if waiting.is_empty() else "Waiting on %s." % ", ".join(PackedStringArray(waiting))
	if members.size() == 1 and mode == "solo":
		status = "Diving alone."
	elif members.size() == 1:
		status = "Co-op: waiting for a crewmate to sail to the maelstrom and join."
	_label(Vector2(pad, foot_y + 18), status, "karla", 800, 15, Dossier.INK)
	var foot2: String = "Solo: sink and the pot is lost; your Fathoms are always paid." if mode == "solo" else "Co-op: the crew dive together. Each captain banks the whole pot; a ship sunk in a fight the crew win is towed along."
	if resume:
		foot2 = "Resuming at depth %d with %s ⟡ in the pot. The whole crew of that dive must be here." % [int(Js.num(held.get("depth"))), Js.thousands(Js.num(held.get("pot")))]
	_label(Vector2(pad, foot_y + 42), foot2, "karla", 500, 13, Dossier.SOFT, w - right_w - 420.0)
	var btns: HBoxContainer = HBoxContainer.new()
	btns.add_theme_constant_override("separation", 10)
	btns.alignment = BoxContainer.ALIGNMENT_END
	btns.position = Vector2(w - right_w - 400 - 24, foot_y + 20)
	btns.size = Vector2(400, 48)
	_body.add_child(btns)
	if resume and caller:
		_button(btns, "End it", "secondary", func() -> void:
			var r: Variant = await _act(["endHeld"])
			if r is Dictionary and not (r as Dictionary).has("error") and sea != null:
				sea._hud.toast("The held dive is ended. Fathoms paid; the pot is lost."), 100.0)
	var my_ready: bool = members.any(func(m: Dictionary) -> bool: return m["key"] == my_key and m.get("ready", false))
	if caller:
		_button(btns, "Leave" if table.solo != null else "Disband", "secondary", func() -> void: _act(["leave"]), 120.0)
		var go: Button = _button(btns, "Resume" if resume else "Dive", "primary", func() -> void:
			Sound.horn()
			_act(["go"]), 130.0)
		go.disabled = not waiting.is_empty()
	else:
		_button(btns, "Leave", "secondary", func() -> void: _act(["leave"]), 120.0)
		_button(btns, "Not ready" if my_ready else "Ready", "secondary" if my_ready else "primary", func() -> void: _act(["ready", not my_ready]), 150.0)
	Pane.set_night(_body, true)


func _label(at: Vector2, s: String, family: String, weight: int, fs: int, c: Color, w: float = -1.0) -> Label:
	var l: Label = Label.new()
	l.text = s
	l.position = at
	l.add_theme_font_override("font", Kit.font(family, weight))
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", c)
	if w > 0.0:
		l.size = Vector2(w, 0)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.add_child(l)
	return l


func _button(parent: Control, t: String, kind: String, f: Callable, wide: float = 150.0) -> Button:
	var b: Button = Kit.button(t, kind)
	b.custom_minimum_size = Vector2(wide, 48)
	b.pressed.connect(f)
	parent.add_child(b)
	return b


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
			_act(["leave"])


# ── The side: the descent, the Locker, the Codex, the Records, in place ──────

func _build_side() -> void:
	var w: float = _card.size.x
	var h: float = _card.size.y
	_side = Control.new()
	_side.position = Vector2(w * LEFT, 0)
	_side.size = Vector2(w * (1.0 - LEFT), h)
	_card.add_child(_side)
	var bg: Panel = Panel.new()
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Dossier.ART_FILL
	sb.corner_radius_top_right = 18
	sb.corner_radius_bottom_right = 18
	bg.add_theme_stylebox_override("panel", sb)
	bg.size = _side.size
	_side.add_child(bg)
	var line: ColorRect = ColorRect.new()
	line.color = Dossier.HAIR
	line.size = Vector2(1, h)
	_side.add_child(line)
	_side_bar = HBoxContainer.new()
	_side_bar.position = Vector2(22, 22)
	_side_bar.size = Vector2(_side.size.x - 44, 40)
	_side_bar.add_theme_constant_override("separation", 6)
	_side.add_child(_side_bar)
	_side_paint()


func _side_paint() -> void:
	for c: Node in _side_bar.get_children():
		c.queue_free()
	for t: Array in [["descent", "The Descent"], ["locker", "Locker"], ["codex", "Codex"], ["records", "Records"]]:
		var b: Button = Kit.button(t[1], "primary" if _side_tab == t[0] else "secondary", "small")
		b.custom_minimum_size = Vector2(0, 38)
		var id: String = t[0]
		b.pressed.connect(func() -> void:
			if _side_tab == id:
				return
			Sound.plip()
			_side_tab = id
			_side_paint())
		_side_bar.add_child(b)
	var sp: Control = Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_side_bar.add_child(sp)
	_fathoms = Kit.text(_side_bar, "%s Fathoms" % Js.thousands(Js.num(sea.session.profile().get("gauntlet_fathoms"))), "body_strong", Color("#7fd6c8"))
	_fathoms.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if _side_body != null:
		_side_body.queue_free()
	var area: Vector2 = Vector2(_side.size.x - 44, _side.size.y - 96)
	var at: Vector2 = Vector2(22, 78)
	match _side_tab:
		"descent":
			var hp: HostPane = HostPane.new()
			hp.variant = _variant()
			hp.portrait = Skipper.tex("donsgauntlet.png" if _variant() == "don" else "davyjones.png")
			var deepest: float = 0.0
			for m0: Dictionary in Js.list(_st.get("members")):
				deepest = maxf(deepest, Js.num(Js.obj(m0.get("card")).get("deepest")))
			hp.deepest = deepest
			hp.position = Vector2(0, 62)
			hp.size = Vector2(_side.size.x, _side.size.y - 62)
			_side_body = hp
		"locker":
			var lk: DiveLocker = DiveLocker.new()
			lk.sea = sea
			lk.variant = _variant()
			lk.embedded = true
			lk.position = at
			lk.size = area
			lk.bought.connect(func() -> void: _fathoms.text = "%s Fathoms" % Js.thousands(Js.num(sea.session.profile().get("gauntlet_fathoms"))))
			_side_body = lk
		"codex":
			var cx: GauntletCodex = GauntletCodex.new()
			cx.variant = _variant()
			cx.profile = sea.session.profile()
			cx.embedded = true
			cx.position = at
			cx.size = area
			_side_body = cx
		"records":
			var rc: GauntletRecords = GauntletRecords.new()
			rc.variant = _variant()
			rc.profile = sea.session.profile()
			rc.embedded = true
			rc.position = at
			rc.size = area
			_side_body = rc
	_side.add_child(_side_body)
	Pane.set_night(_side_bar, true)


# ══ Its pieces ════════════════════════════════════════════════════════════════

## A seat in the line: as the raid's, with the captain's deepest here.
class DiveSeat:
	extends ReadyScreen.SeatCard

	func _draw() -> void:
		super._draw()
		if member.is_empty():
			return
		var c: Dictionary = Js.obj(member.get("card"))
		var cx: float = size.x / 2.0
		# Over the raid seals: this descent's record instead.
		draw_rect(Rect2(8, 286, size.x - 16, 30), BattleLook.LACQUER_HI)
		var t: String = "Solo %d  ·  Co-op %d" % [int(Js.num(c.get("soloDeepest"))), int(Js.num(c.get("coopDeepest")))]
		BattleLook.say(self, Kit.font("cinzel", 700), cx, 306, t, 15, Dossier.INK)
		BattleLook.say(self, Kit.font("karla", 600), cx, 326, "%d Fathoms  ·  %d perks on" % [int(Js.num(c.get("fathoms"))), int(Js.num(c.get("perks")))], 11, Dossier.SOFT)


## The host and what the deep pays: the chest ladder, the chase.
class HostPane:
	extends Control
	var variant: String = "davy"
	var portrait: Texture2D
	var deepest: float = 0.0
	var _frames: int = 0

	func _process(_d: float) -> void:
		if _frames < 12:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var tone: Color = Color("#4fc98a") if variant == "don" else Color("#5eead4")
		var c: Vector2 = Vector2(r.size.x / 2.0, 118)
		draw_circle(c, 96.0, Color(tone, 0.13))
		draw_circle(c, 66.0, Color(tone, 0.1))
		if portrait != null:
			var box: Vector2 = Vector2(r.size.x - 60.0, 212.0)
			var sc: float = minf(box.x / float(portrait.get_width()), box.y / float(portrait.get_height()))
			var ts: Vector2 = portrait.get_size() * sc
			draw_texture_rect(portrait, Rect2(Vector2(c.x - ts.x / 2.0, 226.0 - ts.y), ts), false)
		draw_string(Kit.font("karla", 600), Vector2(28, 252), "Your host", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Dossier.SOFT)
		draw_string(Kit.font("cinzel", 700), Vector2(28, 278), "Don Finleone's ghost" if variant == "don" else "Davy Jones", HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 56, 22, Dossier.INK)
		draw_string(Kit.font("cinzel", 700), Vector2(28, 318), "The chest, by depth", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Dossier.INK)
		var y: float = 344.0
		for ch: Dictionary in Js.list(Gauntlet.t().get("chests")):
			var lit: bool = deepest >= float(ch["minDepth"])
			var lab: String = Gauntlet.chest_label(ch, variant, false)
			draw_circle(Vector2(32, y - 4), 3.5, BattleLook.GOLD if lit else Color(1, 1, 1, 0.2))
			draw_string(Kit.font("karla", 700), Vector2(44, y), lab, HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 150, 13, Dossier.INK if lit else Dossier.SOFT)
			var tx: String = "x%s pot  ·  %d+" % [str(ch["potMult"]), int(ch["minDepth"])]
			var tw: float = Kit.font("karla", 700).get_string_size(tx, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			draw_string(Kit.font("karla", 700), Vector2(r.size.x - 28 - tw, y), tx, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Dossier.SOFT)
			y += 24.0
		y += 12.0
		draw_string(Kit.font("cinzel", 700), Vector2(28, y), "The chase", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Dossier.INK)
		y += 22.0
		var chase: Array = ["Vanguard Battery", "Dampener Plate", "Carrion Sight", "Galaxy Hull", "Don's Ghost Hull"] if variant == "don" else ["Davy's Heavy Cannon", "Davy's Hand Cannon", "Golden Gauntlet Hull"]
		draw_multiline_string(Kit.font("karla", 600), Vector2(28, y), ", ".join(PackedStringArray(chase)) + ".", HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 56, 12, 3, Dossier.SOFT)
		draw_string(Kit.font("karla", 600), Vector2(28, y + 58), "Odds climb with depth, to 10% at 50.", HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 56, 12, Dossier.FAINT)


## The Locker: this descent's perks, bought with Fathoms (one purse for both),
## the Run Upgrades switchable for the next dives.
class DiveLocker:
	extends Control
	signal bought
	var sea: Sea
	var variant: String = "davy"
	## In the entry screen's side pane (its size set before it is added).
	var embedded: bool = false
	var _box: Panel
	var _list: VBoxContainer
	var _head: Label

	func _ready() -> void:
		_box = Panel.new()
		if embedded:
			mouse_filter = Control.MOUSE_FILTER_PASS
			_box.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
			_box.size = size
		else:
			set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			mouse_filter = Control.MOUSE_FILTER_STOP
			var scrim: ColorRect = ColorRect.new()
			scrim.color = Color(0, 0, 0, 0.6)
			scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			add_child(scrim)
			var vp: Vector2 = get_viewport_rect().size
			_box.add_theme_stylebox_override("panel", BattleLook.box(Dossier.FILL, Dossier.HAIR, 1, 18, 40.0, Color(0, 0, 0, 0.6)))
			_box.size = Vector2(minf(980.0, vp.x - 60.0), minf(720.0, vp.y - 60.0))
			_box.position = (vp - _box.size) / 2.0
		add_child(_box)
		var top: float = 0.0
		if not embedded:
			var t: Label = Kit.text(_box, "%s's Locker" % ("The Don" if variant == "don" else "Davy"), "title", Dossier.INK)
			t.position = Vector2(30, 22)
			top = 42.0
		_head = Kit.text(_box, "", "body", Dossier.SOFT)
		_head.position = Vector2(8 if embedded else 30, top + (6.0 if embedded else 22.0))
		var sc: ScrollContainer = ScrollContainer.new()
		sc.position = Vector2(0, 40) if embedded else Vector2(30, 100)
		sc.size = _box.size - (Vector2(0, 40) if embedded else Vector2(60, 180))
		sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		_box.add_child(sc)
		_list = VBoxContainer.new()
		_list.custom_minimum_size = Vector2(sc.size.x - 20.0, 0)
		_list.add_theme_constant_override("separation", 6)
		sc.add_child(_list)
		if not embedded:
			var close: Button = Kit.button("Done", "primary")
			close.custom_minimum_size = Vector2(160, 48)
			close.position = Vector2(_box.size.x - 190, _box.size.y - 66)
			close.pressed.connect(queue_free)
			_box.add_child(close)
		_fill()
		Pane.set_night(_box, true)

	func _fill() -> void:
		for c: Node in _list.get_children():
			c.queue_free()
		var p: Dictionary = sea.session.profile()
		var fathoms: float = Js.num(p.get("gauntlet_fathoms"))
		var own: Array = Js.list(p.get("dons_gauntlet_upgrades" if variant == "don" else "gauntlet_upgrades"))
		var off: Array = Js.list(p.get(("dons_gauntlet_upgrades" if variant == "don" else "gauntlet_upgrades") + "_off"))
		var deep: float = Js.num(p.get("dons_gauntlet_deepest" if variant == "don" else "gauntlet_deepest"))
		_head.text = ("Your deepest here: %d.  Perks gated by depth open as you go deeper." % int(deep)) if embedded else "%s Fathoms in the purse  ·  your deepest here: %d" % [Js.thousands(fathoms), int(deep)]
		var ups: Array = Gauntlet.upgrades_for(variant).duplicate()
		ups.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			var ka: int = 0 if str(a.get("scope", "")) == "gauntlet" else 1
			var kb: int = 0 if str(b.get("scope", "")) == "gauntlet" else 1
			return ka < kb if ka != kb else float(a["cost"]) < float(b["cost"]))
		var last_scope: String = ""
		for u: Dictionary in ups:
			var run_up: bool = str(u.get("scope", "")) == "gauntlet"
			var scope_name: String = "Run Upgrades  ·  in a dive; switch one off to dive without it" if run_up else "Permanent Upgrades  ·  always on, everywhere"
			if scope_name != last_scope:
				last_scope = scope_name
				Kit.text(_list, scope_name, "heading", Dossier.WARN)
			var line: HBoxContainer = HBoxContainer.new()
			line.add_theme_constant_override("separation", 10)
			_list.add_child(line)
			var words: VBoxContainer = VBoxContainer.new()
			words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			line.add_child(words)
			Kit.text(words, str(u["name"]), "body_strong", Dossier.INK)
			Kit.text(words, str(u.get("description", "")), "small", Dossier.SOFT, true)
			var id: String = str(u["id"])
			var bt: Button
			if own.has(id):
				if run_up:
					bt = Kit.button("Off" if off.has(id) else "On", "secondary" if off.has(id) else "primary", "small")
					bt.pressed.connect(func() -> void:
						await sea.session.act("toggleGauntletUpgrade", [id])
						_fill())
				else:
					bt = Kit.button("Owned", "secondary", "small")
					bt.disabled = true
			else:
				var gate: float = Js.num(u.get("depthRequired"))
				var cost: float = Js.num(u.get("cost"))
				bt = Kit.button(("Depth %d" % int(gate)) if deep < gate else "%s Fathoms" % Js.thousands(cost), "primary", "small")
				bt.disabled = deep < gate or fathoms < cost
				bt.pressed.connect(func() -> void:
					var r: Variant = await sea.session.act("buyGauntletUpgrade", [id])
					if r is Dictionary and (r as Dictionary).has("error"):
						sea._hud.toast(str(r["error"]))
					else:
						Sound.chest(true)
						bought.emit()
					_fill())
			bt.custom_minimum_size = Vector2(130, 40)
			bt.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			line.add_child(bt)
		Pane.set_night(_list, true)
