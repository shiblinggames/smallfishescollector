class_name GauntletEntry
extends Control
## THE DIVE'S ENTRY SCREEN at the maelstrom (the raids' ready check, as Kong
## asked of the raids, for the gauntlets): alone, or the line of a Charter's
## crew who have sailed to it (game/gauntlet_table.gd).
##
##   THE DESCENT  its name, the host's voice, the line's deepest.
##   THE MODE     Normal or Hardcore (each captain's crew at risk; hardcore
##                dives in hand; the caller signs Terms for the crew).
##   THE LINE     four seats, each captain's card: their face, ship, hull,
##                hands, their deepest here, Ready or not.
##   THE HOST     Davy or the Don, the chest ladder by depth and the chase.
##   THE FOOT     who is still to say ready; the Locker; Dive / Leave.
## Flat and clean on the night side's browns, as the raid's entry screen is.

signal closed

const W: float = 1180.0
const H: float = 690.0

var sea: Sea
var table: GauntletTable
var my_key: String = "me"

var _st: Dictionary = {}
var _card: Panel
var _body: Control
var _faces: Dictionary = {}
var _sub: Control = null


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
	var right_w: float = 340.0
	var members: Array = Js.list(_st.get("members"))
	var caller: bool = _st.get("by") == my_key
	var hc: bool = _st.get("hardcore", false) == true
	var deepest: float = 0.0
	for m0: Dictionary in members:
		deepest = maxf(deepest, Js.num(Js.obj(m0.get("card")).get("deepest")))
	_label(Vector2(pad, 30), "The descent  ·  a fight a depth, bank or dive at every breather", "karla", 600, 14, Dossier.SOFT)
	_label(Vector2(pad, 50), str(Gauntlet.NAMES[v]), "cinzel", 700, 34, Dossier.INK)
	# THE MODE.
	var tabs: HBoxContainer = HBoxContainer.new()
	tabs.position = Vector2(pad, 112)
	tabs.size = Vector2(w - right_w - pad * 2.0 - 24.0, 74)
	tabs.add_theme_constant_override("separation", 10)
	_body.add_child(tabs)
	var my_card: Dictionary = {}
	for m1: Dictionary in members:
		if m1["key"] == my_key:
			my_card = Js.obj(m1.get("card"))
	var hc_shut: String = ""
	for m2: Dictionary in members:
		var why: String = str(Js.obj(m2.get("card")).get("hcShut", ""))
		if why != "":
			hc_shut = why if m2["key"] == my_key or members.size() == 1 else "%s: %s" % [m2["name"], why]
	for t: Array in [["normal", "Normal", "Sink and lose the pot. Fathoms are always paid."], ["hardcore", "Hardcore", "Crew at risk: sunk is drowned."]]:
		var tab: ReadyScreen.TierTab = ReadyScreen.TierTab.new()
		tab.id = t[0]
		tab.title = t[1]
		tab.note = t[2] if t[0] == "normal" else "%s %d in hand." % [t[2], int(Js.num(my_card.get("hcLeft")))]
		tab.shut = hc_shut if t[0] == "hardcore" else ""
		tab.chosen = (t[0] == "hardcore") == hc
		tab.can = caller
		tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tab.custom_minimum_size = Vector2(0, 74)
		var want: bool = t[0] == "hardcore"
		tab.pressed.connect(func() -> void:
			if tab.shut != "" or not caller or want == hc:
				return
			Sound.plip()
			_act(["mode", want]))
		tabs.add_child(tab)
	# THE LINE.
	var seats: HBoxContainer = HBoxContainer.new()
	seats.position = Vector2(pad, 206)
	seats.size = Vector2(w - right_w - pad * 2.0 - 24.0, h - 206 - 104)
	seats.add_theme_constant_override("separation", 10)
	_body.add_child(seats)
	for i: int in GauntletTable.MAX_SEATS:
		var sc: DiveSeat = DiveSeat.new()
		sc.solo = table.solo != null
		sc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
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
			sc.hardcore = hc
		seats.add_child(sc)
	# THE HOST.
	var hp: HostPane = HostPane.new()
	hp.position = Vector2(w - right_w, 0)
	hp.size = Vector2(right_w, h - 88)
	hp.variant = v
	hp.hardcore = hc
	hp.portrait = Skipper.tex("donsgauntlet.png" if v == "don" else "davyjones.png")
	hp.deepest = deepest
	_body.add_child(hp)
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
			waiting.append("you" if m3["key"] == my_key else str(m3["name"]))
	var status: String = "Everyone is ready." if waiting.is_empty() else "Waiting on %s." % ", ".join(PackedStringArray(waiting))
	if members.size() == 1:
		status = "Diving alone." if table.solo != null else "Diving alone, unless a crewmate at the maelstrom joins."
	_label(Vector2(pad, foot_y + 18), status, "karla", 800, 15, Dossier.INK)
	var signed: Dictionary = Js.obj(_st.get("signed"))
	var foot2: String = "Normal: the pot is lost if every ship sinks. Each captain banks all of it." if not hc else "Hardcore: %s.  Pressure %d: Blood Gems x%s from depth 30." % [("%d Term%s signed" % [signed.size(), "" if signed.size() == 1 else "s"]) if not signed.is_empty() else "no Terms signed", int(Gauntlet.pressure(signed)), str(snappedf(Gauntlet.pressure_gem_mult(Gauntlet.pressure(signed), 30), 0.01))]
	_label(Vector2(pad, foot_y + 42), foot2, "karla", 500, 13, Dossier.SOFT, w - 640.0)
	var btns: HBoxContainer = HBoxContainer.new()
	btns.add_theme_constant_override("separation", 10)
	btns.alignment = BoxContainer.ALIGNMENT_END
	btns.position = Vector2(w - 620 - pad, foot_y + 20)
	btns.size = Vector2(620, 48)
	_body.add_child(btns)
	_button(btns, "Locker", "secondary", func() -> void: _open_locker(), 120.0)
	if hc and caller:
		_button(btns, "%s" % Gauntlet.terms_title(v), "secondary", func() -> void: _open_terms(), 150.0)
	var my_ready: bool = members.any(func(m: Dictionary) -> bool: return m["key"] == my_key and m.get("ready", false))
	if caller:
		_button(btns, "Leave" if table.solo != null else "Disband", "secondary", func() -> void: _act(["leave"]), 120.0)
		var go: Button = _button(btns, "Dive", "primary", func() -> void:
			Sound.horn()
			_act(["go"]), 150.0)
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
			if _sub != null and is_instance_valid(_sub):
				_sub.queue_free()
				_sub = null
			else:
				_act(["leave"])


# ── The Terms board (the caller signs for the crew) ──────────────────────────

func _open_terms() -> void:
	var tb: TermsBoard = TermsBoard.new()
	tb.variant = _variant()
	tb.signed = Js.obj(_st.get("signed")).duplicate()
	tb.done.connect(func(sg: Dictionary) -> void: _act(["terms", sg]))
	_sub = tb
	add_child(tb)


# ── The Locker ───────────────────────────────────────────────────────────────

func _open_locker() -> void:
	var lk: DiveLocker = DiveLocker.new()
	lk.sea = sea
	lk.variant = _variant()
	_sub = lk
	add_child(lk)


# ══ Its pieces ════════════════════════════════════════════════════════════════

## A seat in the line: as the raid's, with the captain's deepest here.
class DiveSeat:
	extends ReadyScreen.SeatCard
	var hardcore: bool = false

	func _draw() -> void:
		super._draw()
		if member.is_empty():
			return
		var c: Dictionary = Js.obj(member.get("card"))
		var cx: float = size.x / 2.0
		# Over the raid seals: this descent's record instead.
		draw_rect(Rect2(8, 286, size.x - 16, 30), BattleLook.LACQUER_HI)
		var t: String = "Deepest  %d" % int(Js.num(c.get("hcDeepest" if hardcore else "deepest")))
		BattleLook.say(self, Kit.font("cinzel", 700), cx, 306, t, 15, Dossier.WARN if hardcore else Dossier.INK)
		BattleLook.say(self, Kit.font("karla", 600), cx, 326, "%d Fathoms  ·  %d perks on" % [int(Js.num(c.get("fathoms"))), int(Js.num(c.get("perks")))], 11, Dossier.SOFT)


## The host and what the deep pays: the chest ladder, the chase.
class HostPane:
	extends Control
	var variant: String = "davy"
	var hardcore: bool = false
	var portrait: Texture2D
	var deepest: float = 0.0
	var _frames: int = 0

	func _process(_d: float) -> void:
		if _frames < 12:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = Dossier.ART_FILL
		sb.corner_radius_top_right = 18
		sb.anti_aliasing = true
		sb.draw(get_canvas_item(), r)
		draw_line(Vector2(0.5, 0), Vector2(0.5, r.size.y), Dossier.HAIR, 1.0)
		var tone: Color = Color("#4fc98a") if variant == "don" else Color("#5eead4")
		if hardcore:
			tone = Dossier.HARM
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
		if hardcore:
			chase += (["Don's Palisade"] if variant == "don" else ["Davy's Blood Cannon", "Bad Blood Hull", "Pitch Black Hull"])
		draw_multiline_string(Kit.font("karla", 600), Vector2(28, y), ", ".join(PackedStringArray(chase)) + ".", HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 56, 12, 3, Dossier.SOFT)
		draw_string(Kit.font("karla", 600), Vector2(28, y + 58), "Odds climb with depth, to 10% at 50.", HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 56, 12, Dossier.FAINT)


## The Terms board: every Term by group, its tiers as chips; the pressure and
## what it does to Blood Gems.
class TermsBoard:
	extends Control
	signal done(signed: Dictionary)
	var variant: String = "davy"
	var signed: Dictionary = {}
	var _box: Panel
	var _list: VBoxContainer
	var _head: Label

	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_STOP
		var scrim: ColorRect = ColorRect.new()
		scrim.color = Color(0, 0, 0, 0.6)
		scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(scrim)
		var vp: Vector2 = get_viewport_rect().size
		_box = Panel.new()
		_box.add_theme_stylebox_override("panel", BattleLook.box(Dossier.FILL, Dossier.HAIR, 1, 18, 40.0, Color(0, 0, 0, 0.6)))
		_box.size = Vector2(minf(980.0, vp.x - 60.0), minf(720.0, vp.y - 60.0))
		_box.position = (vp - _box.size) / 2.0
		add_child(_box)
		var t: Label = Kit.text(_box, Gauntlet.terms_title(variant), "title", Dossier.INK)
		t.position = Vector2(30, 22)
		_head = Kit.text(_box, "", "body", Dossier.SOFT)
		_head.position = Vector2(30, 64)
		var sc: ScrollContainer = ScrollContainer.new()
		sc.position = Vector2(30, 100)
		sc.size = _box.size - Vector2(60, 180)
		_box.add_child(sc)
		_list = VBoxContainer.new()
		_list.custom_minimum_size = Vector2(sc.size.x - 20.0, 0)
		_list.add_theme_constant_override("separation", 8)
		sc.add_child(_list)
		var row: HBoxContainer = HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_END
		row.add_theme_constant_override("separation", 10)
		row.position = Vector2(30, _box.size.y - 66)
		row.size = Vector2(_box.size.x - 60, 48)
		_box.add_child(row)
		for b: Array in [["Sign nothing", "secondary", func() -> void:
				signed = {}
				done.emit(signed)
				queue_free()], ["Take these Terms", "primary", func() -> void:
				done.emit(signed)
				queue_free()]]:
			var bt: Button = Kit.button(b[0], b[1])
			bt.custom_minimum_size = Vector2(190, 48)
			bt.pressed.connect(b[2])
			row.add_child(bt)
		_fill()
		Pane.set_night(_box, true)

	func _fill() -> void:
		for c: Node in _list.get_children():
			c.queue_free()
		var p: float = Gauntlet.pressure(signed)
		_head.text = "Pressure %d of %d.  Blood Gems x%s at depth 30 and deeper. Terms change nothing else you are paid." % [int(p), int(Gauntlet.max_pressure(variant)), str(snappedf(Gauntlet.pressure_gem_mult(p, 30), 0.01))]
		var groups: Dictionary = Js.obj(Js.obj(Js.obj(Gauntlet.t().get("termGroups")).get(variant)))
		for g: String in ["opposition", "gunnery", "crew", "build", "safety"]:
			var gm: Dictionary = Js.obj(groups.get(g))
			var gl: Label = Kit.text(_list, str(gm.get("label", g)), "heading", Color(str(gm.get("accent", "#cccccc"))))
			gl.add_theme_font_size_override("font_size", 16)
			for x: Dictionary in Gauntlet.terms_for(variant):
				if str(x.get("group", "")) != g:
					continue
				var line: HBoxContainer = HBoxContainer.new()
				line.add_theme_constant_override("separation", 8)
				_list.add_child(line)
				var nm: Label = Kit.text(line, str(x["name"]), "body_strong", Dossier.INK)
				nm.custom_minimum_size = Vector2(180, 0)
				var cur: int = int(Js.num(signed.get(x["id"])))
				var tiers: Array = Js.list(x["tiers"])
				for i: int in tiers.size():
					var tr: Dictionary = tiers[i]
					var on: bool = cur == i + 1
					var bt: Button = Kit.button("%s  +%d" % ["I" if i == 0 else "II", int(Js.num(tr.get("pressure")))], "primary" if on else "secondary", "small")
					bt.tooltip_text = "%s\n%s" % [tr.get("desc", ""), tr.get("detail", "")]
					var id: String = str(x["id"])
					var tier: int = i + 1
					bt.pressed.connect(func() -> void:
						if int(Js.num(signed.get(id))) == tier:
							signed.erase(id)
						else:
							signed[id] = float(tier)
						Sound.plip()
						_fill())
					line.add_child(bt)
				var ds: Label = Kit.text(line, str(Js.obj(tiers[maxi(0, cur - 1)]).get("desc", "")) if cur > 0 else str(x.get("flavor", "")), "small", Dossier.SOFT if cur == 0 else Dossier.WARN, true)
				ds.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		Pane.set_night(_list, true)


## The Locker: this descent's perks, bought with Fathoms (one purse for both),
## the Run Upgrades switchable for the next dives.
class DiveLocker:
	extends Control
	var sea: Sea
	var variant: String = "davy"
	var _box: Panel
	var _list: VBoxContainer
	var _head: Label

	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_STOP
		var scrim: ColorRect = ColorRect.new()
		scrim.color = Color(0, 0, 0, 0.6)
		scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(scrim)
		var vp: Vector2 = get_viewport_rect().size
		_box = Panel.new()
		_box.add_theme_stylebox_override("panel", BattleLook.box(Dossier.FILL, Dossier.HAIR, 1, 18, 40.0, Color(0, 0, 0, 0.6)))
		_box.size = Vector2(minf(980.0, vp.x - 60.0), minf(720.0, vp.y - 60.0))
		_box.position = (vp - _box.size) / 2.0
		add_child(_box)
		var t: Label = Kit.text(_box, "%s's Locker" % ("The Don" if variant == "don" else "Davy"), "title", Dossier.INK)
		t.position = Vector2(30, 22)
		_head = Kit.text(_box, "", "body", Dossier.SOFT)
		_head.position = Vector2(30, 64)
		var sc: ScrollContainer = ScrollContainer.new()
		sc.position = Vector2(30, 100)
		sc.size = _box.size - Vector2(60, 180)
		_box.add_child(sc)
		_list = VBoxContainer.new()
		_list.custom_minimum_size = Vector2(sc.size.x - 20.0, 0)
		_list.add_theme_constant_override("separation", 6)
		sc.add_child(_list)
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
		_head.text = "%s Fathoms in the purse  ·  your deepest here: %d" % [Js.thousands(fathoms), int(deep)]
		var ups: Array = Gauntlet.upgrades_for(variant).duplicate()
		ups.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			var ka: int = 0 if str(a.get("scope", "")) == "gauntlet" else 1
			var kb: int = 0 if str(b.get("scope", "")) == "gauntlet" else 1
			return ka < kb if ka != kb else float(a["cost"]) < float(b["cost"]))
		var last_scope: String = ""
		for u: Dictionary in ups:
			var run_up: bool = str(u.get("scope", "")) == "gauntlet"
			var scope_name: String = "Run Upgrades: only in a dive, switch them off to dive plain" if run_up else "Permanent Upgrades: always on, everywhere"
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
					_fill())
			bt.custom_minimum_size = Vector2(130, 40)
			line.add_child(bt)
		Pane.set_night(_list, true)
