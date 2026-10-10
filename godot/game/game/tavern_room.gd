class_name TavernRoom
extends Room
## THE TAVERN (Godot port of /tavern, the social room; core/tavern.gd), the
## room with other people in it. It says how things STAND:
##   OVERHEARD     three snatches of the room's talk, turning over on the hour
##                 (how the game teaches itself: nobody is talking to you)
##   YOUR CREW     the Charter's captains, who is aboard now (alone: a word on
##                 founding one); a face opens that captain's papers
##   THE SALT ROAD where you stand with the nine regulars, read only: rapport
##                 moves by pulling alongside them on the water
## The web's daily tot and races are gone with the port's cuts.

const AMBER: Color = Color("#e0a545")


func _init() -> void:
	title = "The Tavern"
	accent = AMBER


func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.color = Color("#15100b")
	add_child(bg)
	var glow: TextureRect = TextureRect.new()
	glow.texture = Glow.radial(256, Color(1.0, 0.7, 0.35))
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	glow.modulate = Color(1, 1, 1, 0.1)
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(glow)


func _paper(parent: Control) -> VBoxContainer:
	var p: Pane = Kit.pane(parent, { "radius": Kit.R_LARGE, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.3)], "shadow": [Color(0, 0, 0, 0.45), 16, Vector2(0, 5)], "pad": [22, 14, 22, 16], "paper": true })
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p.add_child(v)
	return v


func _avatar(parent: Control, face: Dictionary, px: float) -> void:
	var a: Avatar = Avatar.new()
	a.face = face
	a.px = px
	a.custom_minimum_size = Vector2(px, px)
	a.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	parent.add_child(a)


func _build() -> void:
	# OVERHEARD.
	var ov: VBoxContainer = _paper(col)
	Kit.text(ov, "OVERHEARD", "eyebrow", Kit.ink(AMBER))
	for heard: Dictionary in Tavern.overheard(session.uid, Clock.now_ms()):
		var says: Array = heard["say"]
		var faces: Array = heard["faces"]
		var block: VBoxContainer = VBoxContainer.new()
		block.add_theme_constant_override("separation", 6)
		ov.add_child(block)
		for i: int in says.size():
			var row: HBoxContainer = HBoxContainer.new()
			row.add_theme_constant_override("separation", 12)
			block.add_child(row)
			var right: bool = i % 2 == 1
			if not right:
				_avatar(row, faces[0], 44.0)
			var t: Label = Kit.text(row, "“%s”" % says[i], "body", Kit.PAPER_INK)
			t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			t.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if right else HORIZONTAL_ALIGNMENT_LEFT
			if right:
				_avatar(row, faces[1], 44.0)
		var from: Label = Kit.text(block, "%s" % heard["from"], "small", Kit.PAPER_INK_SOFT)
		from.add_theme_font_override("font", Kit.italic())
		Paper.rule(ov)
	Kit.text(ov, "The room turns over on the hour.", "small", Kit.PAPER_INK_SOFT)
	# YOUR CREW.
	var cr: VBoxContainer = _paper(col)
	Kit.text(cr, "YOUR CREW", "eyebrow", Kit.ink(AMBER))
	var ch: Charter = session.charter
	var berths: Array = Js.list(ch.data.get("berths")) if ch != null else []
	if berths.size() <= 1:
		Kit.text(cr, "Sailing on your own. A Charter is a crew of captains sharing one sea, one purse and one homestead; it is founded from the title screen, and friends join it there.", "body", Kit.PAPER_INK, true)
	else:
		var row2: HBoxContainer = HBoxContainer.new()
		row2.add_theme_constant_override("separation", 16)
		cr.add_child(row2)
		var aboard: int = 0
		for b: Dictionary in berths:
			var here: bool = ch.sessions.has(b["key"])
			if here:
				aboard += 1
			var v: VBoxContainer = VBoxContainer.new()
			v.add_theme_constant_override("separation", 2)
			row2.add_child(v)
			var look: Dictionary = Js.obj(b.get("look"))
			_avatar(v, { "characterColor": str(look.get("color", "default")), "hat": look.get("hat"), "bg": "#1d150d", "ring": "#e0a545" if here else "#5a4a36" }, 56.0)
			# A crewmate's face opens their papers (the Captain's Log, read only).
			var face: Control = v.get_child(0)
			face.mouse_filter = Control.MOUSE_FILTER_STOP
			face.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
			face.tooltip_text = "%s's papers" % str(b.get("name", "?"))
			var key: String = str(b["key"])
			face.gui_input.connect(func(e: InputEvent) -> void:
				if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
					_papers(ch, key))
			Kit.text(v, str(b.get("name", "?")), "small", Kit.PAPER_INK)
			Kit.text(v, "aboard" if here else "ashore", "small", Paper.GREEN if here else Kit.PAPER_INK_SOFT)
		Kit.text(cr, "%s  ·  %d of %d aboard now" % [str(ch.data.get("name", "The Charter")), aboard, berths.size()], "small", Kit.PAPER_INK_SOFT)
	# THE SALT ROAD.
	var sr: VBoxContainer = _paper(col)
	Kit.text(sr, "THE SALT ROAD", "eyebrow", Kit.ink(AMBER))
	var st: Array = Folk.state(session.store, session.uid)
	var known: int = st.filter(func(r: Dictionary) -> bool: return float(r["points"]) > 0.0).size()
	var trusted: int = st.filter(func(r: Dictionary) -> bool: return int(r["tier"]) >= 3).size()
	var top: Array = st.duplicate()
	top.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["points"]) > float(b["points"]))
	top = top.filter(func(r: Dictionary) -> bool: return float(r["points"]) > 0.0).slice(0, 3)
	if top.is_empty():
		Kit.text(sr, "Nobody out on the water knows you yet. Pull alongside the regulars and have a word; they warm to the captains who keep turning up.", "body", Kit.PAPER_INK, true)
	else:
		var row3: HBoxContainer = HBoxContainer.new()
		row3.add_theme_constant_override("separation", 22)
		sr.add_child(row3)
		for r: Dictionary in top:
			var f: Dictionary = Folk.by_id(str(r["folkId"]))
			var v2: VBoxContainer = VBoxContainer.new()
			v2.add_theme_constant_override("separation", 2)
			row3.add_child(v2)
			_avatar(v2, Js.obj(f.get("face")), 60.0)
			Kit.text(v2, str(f.get("short", f.get("name", ""))), "body_strong", Kit.PAPER_INK)
			# Where you stand, in words (no colour per regular).
			Kit.text(v2, Folk.TIER_NAME[int(r["tier"])], "small", Kit.PAPER_INK_SOFT)
	Kit.text(sr, "%d of %d know your face  ·  %d trust you" % [known, st.size(), trusted], "small", Kit.PAPER_INK_SOFT)


func _papers(ch: Charter, key: String) -> void:
	var log: CaptainsLog = CaptainsLog.for_berth(ch, key)
	if log != null:
		add_child(log)
