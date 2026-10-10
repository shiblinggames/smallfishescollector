extends RefCounted
## Part of FishingHud: TREASURE HUNTS. The clues in hand in the top-left
## column, and a hunt's question on a slip of paper. Split out of
## game/fishing_hud.gd on 2026-10-10 for size; the HUD's refresh() paints it.

## The HUD the clues are listed on.
var h: FishingHud


func _init(hud: FishingHud) -> void:
	h = hud


var _clues_box: VBoxContainer
var _clues_sig: String = "-"


## The clues in hand, at the left: tier, step, and what it says.
func _paint_clues() -> void:
	if not Clues.on():
		return
	var p: Dictionary = h.session.profile()
	var hunts: Array = Clues.hunts(p)
	var sig: String = JSON.stringify(hunts)
	if sig == _clues_sig:
		return
	_clues_sig = sig
	if _clues_box == null:
		# In the top-left column, under whatever is above it (the purse, the
		# Charter's buttons, the Auto pill), never pinned over them.
		_clues_box = VBoxContainer.new()
		_clues_box.add_theme_constant_override("separation", 8)
		_clues_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_clues_box.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_clues_box.custom_minimum_size = Vector2(330, 0)
		h._tl.add_child(_clues_box)
	for c: Node in _clues_box.get_children():
		c.queue_free()
	for th: Array in hunts:
		var h: Dictionary = th[1]
		var s: Dictionary = (h["steps"] as Array)[int(h["step"])]
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 1)
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_clues_box.add_child(v)
		var e: Label = Kit.lift(Kit.text(v, "%s  ·  STEP %d OF %d" % [str(Clues.TIER_NAME[th[0]]).to_upper(), int(h["step"]) + 1, (h["steps"] as Array).size()], "eyebrow", Kit.SEA_GOLD))
		var t: Label = Kit.lift(Kit.text(v, str(s["text"]), "small", Kit.SEA_INK, true))
		t.custom_minimum_size = Vector2(330, 0)
		if s.get("kind") == "trivia":
			var tier: String = th[0]
			var ab: Button = Kit.button("Answer the note", "accent", "small", Kit.SEA_GOLD)
			ab.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
			ab.mouse_filter = Control.MOUSE_FILTER_STOP
			ab.pressed.connect(func() -> void: _clue_question(tier, str(s["qid"])))
			v.add_child(ab)


## A hunt's question: the note's four answers on a slip of paper.
func _clue_question(tier: String, qid: String) -> void:
	if h._modal != null:
		return
	var q: Dictionary = Parlor.question(qid)
	if q.is_empty():
		return
	var shade: Control = Control.new()
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	h.add_child(shade)
	h._modal = shade
	var dim: ColorRect = Kit.scrim(shade)
	var cc: CenterContainer = CenterContainer.new()
	cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.add_child(cc)
	var card: Pane = Kit.pane(cc, { "radius": 10, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.4)], "shadow": [Color(0, 0, 0, 0.5), 20, Vector2(0, 6)], "pad": [26, 20, 26, 22], "paper": true })
	card.custom_minimum_size = Vector2(620, 0)
	Motion.panel_in(card)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	card.add_child(v)
	Paper.text(v, "%s  ·  THE NOTE ASKS" % str(Clues.TIER_NAME[tier]).to_upper(), "eyebrow", Paper.RED)
	Paper.text(v, str(q["question"]), "title", Paper.INK, true)
	var close: Callable = func() -> void:
		h._modal = null
		Motion.dismiss(shade, card, dim)
		_clues_sig = ""
		h.refresh()
	for i: int in 4:
		var ob: Button = Paper.button(str(q["options"][i]))
		ob.custom_minimum_size = Vector2(0, 46)
		ob.pressed.connect(func() -> void:
			var r: Dictionary = await h.session.act("clueAnswer", [tier, float(i)])
			h.session.persist()
			close.call()
			if r.has("error"):
				h.toast(str(r["error"]))
			elif r.get("correct", false):
				Sound.perfect()
				h.toast("Right. The note gives up its next line.")
			else:
				Sound.slack()
				h.toast("Wrong. The ink has run; look again tomorrow."))
		v.add_child(ob)
	var back: Button = Paper.button("Not yet")
	back.pressed.connect(close)
	v.add_child(back)
