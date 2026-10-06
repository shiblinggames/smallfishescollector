class_name GauntletOverlay
extends Control
## THE DIVE BETWEEN FIGHTS (Kong, 2026-10-03: "the experience of selecting
## boons should be a fun experience for the parties. Visually overhaul the
## menus for gauntlets to match our current style"). The fight screen
## (BattleStage) stays up for the whole descent; between fights this sheet
## comes up over the water for whatever the table is doing, drawn in the flat
## night-paper browns of the stat cards and the entry screens:
##
##   THE CURSE       the Locker's curse on the party: its mark, its tier, what
##                   it does; each captain bears it (a Salt Ward may reroll).
##   THE DRAFT TABLE the spread face up; the order along the top, the one at the
##                   table lit; each card the tier YOU would take, what it
##                   unlocks or deepens for you; a card taken is stamped with
##                   its captain's face. Your private synergy sits apart.
##   THE SHRINE      Davy's Coin, the Blood Price, Walk On, each their own.
##   THE FENCE       a stall of three, paid from this dive's Fathoms.
##   THE DON'S JOB   three stakes and a vote; a tie walks away.
##   HIS FALL        his words, then each captain's Mark of the Shark or Whale.
##   THE BREATHER    the depth, the pot, what banking pays YOU, the chase odds,
##                   the crew's hulls, the vote: bank or dive.
##   THE HAUL / THE DEEP   what came home, or what the Locker took.
##   HELD            the dive written down to come back to (Hold at a breather:
##                   alone at once, together when everyone votes it).
## Rules: core/gauntlet.gd; the table: game/gauntlet_table.gd.

signal acted(args: Array)

const W: float = 1120.0

var my_key: String = ""
## This captain's profile (the Codex reads what they have discovered).
var profile: Dictionary = {}
## (key) -> Texture2D: a captain's avatar.
var face_of: Callable
var _st: Dictionary = {}
var _sheet: Panel
var _body: Control
var _stake: int = 1
var _seen_tag: String = ""
var _tex: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.make()


## A phase to show (or the same one, changed). Empty hides it.
func show_state(st: Dictionary) -> void:
	_st = st
	var ph: String = str(st.get("phase", ""))
	if not PHASES.has(ph):
		_hide()
		return
	var tag: String = "%s:%d" % [ph, int(Js.num(st.get("seq")))]
	var fresh: bool = tag != _seen_tag
	# The same state handed over again: nothing to redraw (a repaint would cut
	# short what the sheet is playing, such as the haul's roll).
	if not fresh and st == _last_st:
		return
	_seen_tag = tag
	_last_st = st.duplicate(true)
	_paint(fresh)


var _last_st: Dictionary = {}


const PHASES: Array = ["curse", "draft", "shrine", "fence", "contract", "jobResult", "marks", "breather", "haul", "dead", "held"]


## The fight receding behind a sheet: a soft dark scrim over the water.
var _scrim: ColorRect


func _hide() -> void:
	if _scrim != null:
		var sc: ColorRect = _scrim
		_scrim = null
		var tw0: Tween = create_tween()
		tw0.tween_property(sc, "modulate:a", 0.0, 0.2)
		tw0.tween_callback(sc.queue_free)
	if _sheet != null:
		var s: Panel = _sheet
		_sheet = null
		var tw: Tween = create_tween()
		tw.tween_property(s, "modulate:a", 0.0, 0.18)
		tw.tween_callback(s.queue_free)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _paint(fresh: bool) -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	# Over everything on the screen (a depth's call, a banner).
	get_parent().move_child(self, -1)
	if _scrim == null:
		_scrim = ColorRect.new()
		_scrim.color = Color(0.01, 0.015, 0.03, 0.62)
		_scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_scrim.modulate.a = 0.0
		add_child(_scrim)
		move_child(_scrim, 0)
		create_tween().tween_property(_scrim, "modulate:a", 1.0, 0.25)
	var vp: Vector2 = get_viewport_rect().size
	if _sheet == null:
		_sheet = Panel.new()
		_sheet.add_theme_stylebox_override("panel", BattleLook.box(Color(Dossier.FILL, 0.97), Dossier.HAIR, 1, 18, 40.0, Color(0, 0, 0, 0.6)))
		_sheet.clip_contents = true
		add_child(_sheet)
		_sheet.modulate.a = 0.0
		create_tween().tween_property(_sheet, "modulate:a", 1.0, 0.22)
	var h: float = minf(_height(), vp.y - 150.0)
	_sheet.size = Vector2(minf(W, vp.x - 40.0), h)
	_sheet.position = Vector2((vp.x - _sheet.size.x) / 2.0, maxf(84.0, (vp.y - h) / 2.0 - 30.0))
	if _body != null:
		_body.queue_free()
	_body = Control.new()
	_body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_sheet.add_child(_body)
	match str(_st["phase"]):
		"curse": _curse()
		"draft": _draft(fresh)
		"shrine": _shrine()
		"fence": _fence()
		"contract": _contract()
		"jobResult": _job_result()
		"marks": _marks()
		"breather": _breather()
		"haul": _haul(fresh)
		"dead": _dead()
		"held": _held()
	Pane.set_night(_body, true)


func _height() -> float:
	match str(_st.get("phase", "")):
		"held": return 420.0
		"draft": return 640.0
		"breather": return 660.0 if not Js.obj(Js.obj(_run().get("offer")).get("live")).is_empty() else 560.0
		"haul", "dead": return 600.0
		"curse", "jobResult": return 470.0
	return 560.0


# ── Who is in the dive, and what is theirs ───────────────────────────────────

func _run() -> Dictionary:
	return Js.obj(_st.get("run"))


func _cap(key: String = "") -> Dictionary:
	return Js.obj(Js.obj(_st.get("caps")).get(key if key != "" else my_key))


func _keys() -> Array:
	var out: Array = []
	for k: String in Js.obj(_st.get("caps")):
		if str(Js.obj(_st["caps"][k]).get("out", "")) == "" and not Js.obj(_st.get("gone")).has(k):
			out.append(k)
	return out


func _seat(key: String) -> Dictionary:
	for s: Dictionary in Js.list(Js.obj(_st.get("b")).get("seats")):
		if s.get("key") == key:
			return s
	return {}


func _name(key: String) -> String:
	if key == my_key:
		return "You"
	return str(_seat(key).get("name", "A captain"))


func _variant() -> String:
	return str(_run().get("variant", "davy"))


func _don() -> bool:
	return _variant() == "don"


func _send(args: Array) -> void:
	Sound.plip()
	acted.emit(args)


func _tx(path: Variant) -> Texture2D:
	var p: String = str(path if path != null else "").trim_prefix("/")
	if p == "":
		return null
	if not _tex.has(p):
		_tex[p] = Skipper.tex(p)
	return _tex[p]


# ── Building blocks ──────────────────────────────────────────────────────────

func _label(at: Vector2, s: String, family: String, weight: int, fs: int, c: Color, w: float = -1.0, center: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = s
	l.position = at
	l.add_theme_font_override("font", Kit.font(family, weight))
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", c)
	if w > 0.0:
		l.size = Vector2(w, 0)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if center:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_body.add_child(l)
	return l


func _head(eyebrow: String, title: String, sub: String = "") -> float:
	var w: float = _sheet.size.x
	_label(Vector2(0, 26), eyebrow.to_upper(), "karla", 800, 12, Dossier.SOFT, w, true)
	_label(Vector2(0, 44), title, "cinzel", 700, 30, Dossier.INK, w, true)
	if sub != "":
		_label(Vector2(60, 88), sub, "karla", 500, 14, Dossier.SOFT, w - 120.0, true)
		return 124.0
	return 100.0


func _btn(parent: Control, t: String, kind: String, f: Callable, wide: float = 170.0) -> Button:
	var b: Button = Kit.button(t, kind)
	b.custom_minimum_size = Vector2(wide, 46)
	b.pressed.connect(f)
	parent.add_child(b)
	return b


func _foot(y: float) -> HBoxContainer:
	var row: HBoxContainer = HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	row.position = Vector2(0, y)
	row.size = Vector2(_sheet.size.x, 50)
	_body.add_child(row)
	return row


## Who still has to answer, as a line.
func _waiting_on(given: Dictionary) -> String:
	var names: Array = []
	for k: String in _keys():
		if not given.has(k):
			names.append("you" if k == my_key else _name(k))
	if names.is_empty():
		return ""
	return "Waiting on %s." % ", ".join(PackedStringArray(names))


func _card(at: Vector2, sz: Vector2) -> GCard:
	var c: GCard = GCard.new()
	c.position = at
	c.size = sz
	_body.add_child(c)
	return c


# ══ The curse ═════════════════════════════════════════════════════════════════

func _curse() -> void:
	var cu: Dictionary = Js.obj(_st.get("curse"))
	var o: Dictionary = Js.obj(cu.get("offer"))
	var w: float = _sheet.size.x
	var up: bool = o.get("isUpgrade", false) == true
	_head("The Locker tightens its grip" if up else "The Locker curses you", "%s%s" % [o.get("name", ""), ("  " + Gauntlet.tier_label(int(o.get("tier", 1)))) if int(o.get("tier", 1)) > 1 else ""])
	var c: GCard = _card(Vector2(w / 2.0 - 300.0, 112), Vector2(600, 230))
	c.art = _tx(o.get("image"))
	c.tone = Dossier.HARM
	c.title = str(o.get("desc", ""))
	c.body = str(o.get("detail", ""))
	c.foot = str(o.get("flavor", ""))
	c.wide = true
	var acks: Dictionary = Js.obj(cu.get("acks"))
	var n: int = Js.obj(_run().get("curses")).size()
	_label(Vector2(0, 352), "The whole crew carries it.  %d curse%s upon you." % [n + (0 if up else 1), "" if n + (0 if up else 1) == 1 else "s"], "karla", 600, 13, Dossier.SOFT, w, true)
	var waiting: String = _waiting_on(acks)
	if waiting != "":
		_label(Vector2(0, 372), waiting, "karla", 700, 13, Dossier.FAINT, w, true)
	var row: HBoxContainer = _foot(400)
	var left: int = Gauntlet.curse_rerolls(Js.list(_cap().get("ups"))) - int(Js.num(Js.obj(cu.get("rerolls")).get(my_key)))
	if left > 0:
		_btn(row, "Reroll the curse  ·  %d left" % left, "secondary", func() -> void: _send(["recurse"]), 240.0)
	var b: Button = _btn(row, "Bear it" if not acks.has(my_key) else "Borne", "primary", func() -> void: _send(["bear"]))
	b.disabled = acks.has(my_key)


# ══ The draft table ═══════════════════════════════════════════════════════════

func _draft(fresh: bool) -> void:
	var d: Dictionary = Js.obj(_st.get("draft"))
	var w: float = _sheet.size.x
	var order: Array = Js.list(d.get("order"))
	var turn: int = int(Js.num(d.get("turn")))
	var who: String = str(order[turn]) if turn < order.size() else ""
	var mine: bool = who == my_key
	_label(Vector2(0, 22), ("A paid draft" if d.get("personal", false) else ("The draft table" if order.size() > 1 else "A gift from the deep")).to_upper(), "karla", 800, 12, Dossier.SOFT, w, true)
	_label(Vector2(0, 40), str(d.get("title", "Choose a Power")), "cinzel", 700, 30, Dossier.INK, w, true)
	# The order of the table: each captain's face in turn, the one at it lit.
	if order.size() > 1:
		var strip: OrderStrip = OrderStrip.new()
		strip.position = Vector2(w / 2.0 - order.size() * 66.0, 86)
		strip.size = Vector2(order.size() * 132.0, 60)
		for k: String in order:
			strip.faces.append(face_of.call(k) if face_of.is_valid() else null)
			strip.names.append(_name(k))
			strip.done.append(Js.obj(d.get("took")).has(k))
		strip.at = turn
		_body.add_child(strip)
	var line: String = "Your pick. Take a card, or your synergy." if mine else ("%s is choosing." % _name(who) if who != "" else "The table is cleared.")
	if order.size() == 1 and mine:
		line = "Take one."
	_label(Vector2(0, 160 if order.size() > 1 else 92), line, "karla", 800, 15, Dossier.WARN if mine else Dossier.SOFT, w, true)
	# The spread.
	var cards: Array = Js.list(d.get("cards"))
	var syn: Dictionary = Js.obj(Js.obj(d.get("syn")).get(my_key))
	var n: int = cards.size() + (1 if not syn.is_empty() else 0)
	var gap: float = 14.0
	var cw: float = minf(206.0, (w - 60.0 - gap * float(n - 1) - (24.0 if not syn.is_empty() else 0.0)) / float(maxi(1, n)))
	var ch: float = 330.0
	var total: float = cw * n + gap * (n - 1) + (24.0 if not syn.is_empty() else 0.0)
	var x: float = (w - total) / 2.0
	var y: float = 196.0 if order.size() > 1 else 130.0
	var stamps: Dictionary = Js.obj(d.get("stamps"))
	var own: Dictionary = Js.obj(_cap().get("boons"))
	var taken: Array = Js.list(_cap().get("taken"))
	for i: int in cards.size():
		var cd: Dictionary = cards[i]
		var c: GCard = _card(Vector2(x, y), Vector2(cw, ch))
		c.delay = 0.08 * i if fresh else -1.0
		var crew_card: bool = cd["card"] == "crew"
		if crew_card:
			var cf: Dictionary = Gauntlet.confluence_def(str(cd["id"]))
			c.art = _tx(cf.get("image"))
			c.title = str(cd["name"])
			c.kicker = "Crew synergy  ·  Level %s" % Gauntlet.tier_label(int(Js.num(cd.get("level"))))
			c.tone = Color("#c79bff")
			c.body = str(cd.get("desc", ""))
			c.foot = "For %s.  Either may take it; both get it." % " and ".join(PackedStringArray(Js.list(cd.get("names")).map(func(x: Variant) -> String: return str(x))))
			c.foot_tone = Dossier.WARN
		elif cd["card"] == "reprieve":
			c.title = str(cd["name"])
			c.kicker = "A reprieve"
			c.tone = Dossier.HELP
			c.body = str(cd.get("desc", ""))
			c.foot = str(cd.get("flavor", ""))
		else:
			var fam: Dictionary = Gauntlet.boon_def(str(cd["id"]))
			var nx: int = int(Js.num(own.get(cd["id"]))) + 1
			var tiers: Array = Js.list(fam.get("tiers"))
			var rar: String = str(cd.get("rarity", "common"))
			c.art = _tx(fam.get("image"))
			c.title = str(cd["name"])
			c.tone = RARITY.get(rar, Dossier.SOFT)
			c.role = str(fam.get("role", ""))
			var pre: String = ("Bond  ·  %s  ·  " % c.role.capitalize()) if c.role != "" else ""
			if nx > tiers.size():
				c.kicker = pre + "%s  ·  maxed" % rar.capitalize()
				c.body = str(Js.obj(tiers[tiers.size() - 1]).get("desc", ""))
				c.dim = true
			else:
				c.kicker = pre + "%s  ·  %s" % [rar.capitalize(), ("Tier %s" % Gauntlet.tier_label(nx)) if nx > 1 else "New"]
				c.body = str(Js.obj(tiers[nx - 1]).get("desc", ""))
				var hints: Array = Gauntlet.confluence_hints(str(cd["id"]), nx, own, taken)
				var hl: Array = []
				for hn: Dictionary in hints:
					hl.append(("Unlocks %s" if hn["kind"] == "unlocks" else "Deepens %s") % hn["name"])
				c.foot = "  ·  ".join(PackedStringArray(hl)) if not hl.is_empty() else str(fam.get("flavor", ""))
				c.foot_tone = Dossier.WARN if not hl.is_empty() else Dossier.FAINT
			c.legend = rar == "legendary"
		if stamps.has(str(i)):
			var sk: String = str(stamps[str(i)])
			c.stamp = face_of.call(sk) if face_of.is_valid() else null
			c.stamp_name = _name(sk)
		c.live = mine and not stamps.has(str(i)) and not c.dim and (not crew_card or Js.list(cd.get("keys")).has(my_key))
		var ii: int = i
		c.pressed.connect(func() -> void:
			if c.live:
				_send(["pick", { "card": float(ii) }]))
		x += cw + gap
	# Your own synergy, apart from the spread.
	if not syn.is_empty():
		x += 24.0 - gap
		var sc: GCard = _card(Vector2(x, y), Vector2(cw, ch))
		sc.kicker = "Your %s  ·  %s" % ["convergence" if syn.get("isConvergence", false) else "synergy", "Level %s" % Gauntlet.tier_label(int(syn.get("level", 1)))]
		sc.title = str(syn["name"])
		sc.art = _tx(syn.get("image"))
		sc.tone = Color("#c79bff")
		sc.body = str(syn.get("desc", ""))
		sc.foot = "%s + %s.  Taken instead of a card." % [syn["halves"][0], syn["halves"][1]]
		sc.foot_tone = Dossier.SOFT
		sc.own = true
		sc.live = mine
		sc.delay = 0.08 * cards.size() if fresh else -1.0
		if Js.obj(Js.obj(d.get("took")).get(my_key)).get("kind", "") == "syn":
			sc.stamp = face_of.call(my_key) if face_of.is_valid() else null
			sc.stamp_name = "You"
			sc.live = false
		sc.pressed.connect(func() -> void:
			if sc.live:
				_send(["pick", { "syn": true }]))
	# The one at the table may reroll what is left, or banish a card.
	var row: HBoxContainer = _foot(y + ch + 22.0)
	if mine and not d.get("personal", false):
		var rr: int = Gauntlet.boon_rerolls(Js.list(_cap().get("ups"))) - int(Js.num(Js.obj(d.get("rerolls")).get(my_key)))
		if rr > 0:
			_btn(row, "Reroll the cards left  ·  %d" % rr, "secondary", func() -> void: _send(["reroll"]), 260.0)
		var fl: int = int(Js.num(_cap().get("filters")))
		if fl > 0:
			_btn(row, "Banish a card  ·  %d left" % fl, "secondary", func() -> void: _banish_mode(), 230.0)
	var took: Dictionary = Js.obj(Js.obj(d.get("took")).get(my_key))
	if not took.is_empty() and str(took.get("kind", "")) != "none":
		_label(Vector2(0, y + ch + 76.0), "You took %s." % _took_line(took), "karla", 700, 13, Dossier.HELP, w, true)


const RARITY: Dictionary = { "common": Color("#6ee7d6"), "rare": Color("#8b9cff"), "legendary": Color("#f5b94a") }


func _took_line(t: Dictionary) -> String:
	match str(t.get("kind", "")):
		"boon": return "%s %s" % [t["name"], Gauntlet.tier_label(int(t.get("tier", 1)))]
		"syn": return "the synergy %s" % t["name"]
		"reprieve": return str(t["name"])
	return "nothing"


var _banishing: bool = false


func _banish_mode() -> void:
	_banishing = not _banishing
	for c: Node in _body.get_children():
		if c is GCard and not (c as GCard).own and (c as GCard).stamp == null:
			(c as GCard).banish = _banishing
			if _banishing:
				for con: Dictionary in (c as GCard).pressed.get_connections():
					(c as GCard).pressed.disconnect(con["callable"])
				var idx: int = _body.get_children().filter(func(n: Node) -> bool: return n is GCard and not (n as GCard).own).find(c)
				(c as GCard).pressed.connect(func() -> void: _send(["banish", float(idx)]))


# ══ The Drowned Shrine ════════════════════════════════════════════════════════

func _shrine() -> void:
	var sh: Dictionary = Js.obj(_st.get("shrine"))
	var picks: Dictionary = Js.obj(sh.get("picks"))
	var w: float = _sheet.size.x
	_head("A shrine rises from the water", "The Drowned Shrine", "Each captain makes their own offering.")
	var art: ArtStrip = ArtStrip.new()
	art.tex = _tx("gauntlet-shrine.webp")
	art.position = Vector2(30, 124)
	art.size = Vector2(w - 60, 196)
	_body.add_child(art)
	var s: Dictionary = _seat(my_key)
	var half: int = int(maxf(1.0, round(Js.num(s.get("hp")) * 0.5)))
	var opts: Array = [
		["coin", "Davy's Coin", "Stake up to %d Fathoms on a coin. Double or nothing." % Gauntlet.SHRINE_WAGER_CAP, Dossier.WARN],
		["blood", "The Blood Price", "Give half your hull (%d) for a power, now." % half, Dossier.HARM],
		["walk", "Walk On", "Leave it be. The calm mends 5% of your hull.", Dossier.HELP],
	]
	var cw: float = (w - 60.0 - 28.0) / 3.0
	for i: int in 3:
		var o: Array = opts[i]
		var c: GCard = _card(Vector2(30 + i * (cw + 14.0), 334), Vector2(cw, 112))
		c.title = o[1]
		c.body = o[2]
		c.tone = o[3]
		c.short = true
		var mine: Dictionary = Js.obj(picks.get(my_key))
		c.live = mine.is_empty()
		if not mine.is_empty() and mine["choice"] == o[0]:
			c.stamp = face_of.call(my_key) if face_of.is_valid() else null
			c.stamp_name = "You"
		var ch: String = o[0]
		c.pressed.connect(func() -> void:
			if c.live:
				_send(["shrine", { "choice": ch, "stake": float(_stake) }]))
	var mine2: Dictionary = Js.obj(picks.get(my_key))
	if mine2.is_empty():
		var row: HBoxContainer = _foot(452)
		_btn(row, "Stake less", "secondary", func() -> void:
			_stake = maxi(1, _stake - 1)
			_paint(false), 150.0)
		var stake_l: Label = Label.new()
		stake_l.text = "Stake  %d Fathom%s" % [_stake, "" if _stake == 1 else "s"]
		stake_l.add_theme_font_override("font", Kit.font("cinzel", 700))
		stake_l.add_theme_font_size_override("font_size", 18)
		stake_l.add_theme_color_override("font_color", Dossier.INK)
		row.add_child(stake_l)
		_btn(row, "Stake more", "secondary", func() -> void:
			_stake = mini(Gauntlet.SHRINE_WAGER_CAP, _stake + 1)
			_paint(false), 150.0)
	else:
		var res: String = ""
		match str(mine2["choice"]):
			"coin": res = ("The coin lands your way: +%d Fathoms." if mine2.get("won", false) else "The coin lands his way: -%d Fathoms.") % int(Js.num(mine2.get("stake")))
			"blood": res = "You paid %d hull. A power is yours once the crew have chosen." % int(Js.num(mine2.get("lost")))
			"walk": res = "You walk on. +%d hull." % int(Js.num(mine2.get("heal")))
		_label(Vector2(0, 456), res, "karla", 700, 15, Dossier.INK, w, true)
	var waiting: String = _waiting_on(picks)
	if waiting != "":
		_label(Vector2(0, 500), waiting, "karla", 600, 13, Dossier.FAINT, w, true)


# ══ The Fence ═════════════════════════════════════════════════════════════════

func _fence() -> void:
	var fe: Dictionary = Js.obj(_st.get("fence"))
	var stall: Dictionary = Js.obj(Js.obj(fe.get("stalls")).get(my_key))
	var w: float = _sheet.size.x
	var cleared: int = int(Js.num(Js.obj(_run().get("roll")).get("cleared")))
	var spend: float = Gauntlet.fathoms_for_depth(cleared, "don") - Js.num(_cap().get("fenceSpent"))
	_head("A hulk draws alongside", "The Fence", "Paid from the Fathoms you have earned this dive: %d to spend." % int(spend))
	var art: ArtStrip = ArtStrip.new()
	art.tex = _tx("gauntlet-merchant.webp")
	art.position = Vector2(30, 128)
	art.size = Vector2(w - 60, 110)
	_body.add_child(art)
	var items: Array = Js.list(stall.get("items"))
	var sold: Array = Js.list(stall.get("sold"))
	var cw: float = (w - 60.0 - 28.0) / 3.0
	var shop: Dictionary = Js.obj(Gauntlet.t().get("merchant"))
	for i: int in items.size():
		var it: Dictionary = Js.obj(shop.get(items[i]))
		var c: GCard = _card(Vector2(30 + i * (cw + 14.0), 256), Vector2(cw, 180))
		c.kicker = "%d Fathoms" % int(Js.num(it.get("price")))
		c.title = str(it.get("name", ""))
		c.body = str(it.get("blurb", "")).replace(" — ", ". ")
		c.tone = Color(str(it.get("color", "#cccccc")))
		c.short = true
		var price: float = Js.num(it.get("price"))
		c.dim = sold.has(items[i]) or spend < price
		c.foot = "Sold" if sold.has(items[i]) else ("Earn %d more" % int(price - spend) if spend < price else "")
		c.live = not c.dim and not Js.obj(fe.get("done")).has(my_key)
		var id: String = str(items[i])
		c.pressed.connect(func() -> void:
			if c.live:
				_send(["fence", id]))
	var row: HBoxContainer = _foot(462)
	var done: bool = Js.obj(fe.get("done")).has(my_key)
	var lv: Button = _btn(row, "Leave the Fence" if not done else "Waiting on the crew", "primary", func() -> void: _send(["done"]), 220.0)
	lv.disabled = done


# ══ The Don's job ════════════════════════════════════════════════════════════

func _contract() -> void:
	var job: Dictionary = Js.obj(_st.get("job"))
	var w: float = _sheet.size.x
	var def: Dictionary = Js.obj(Js.obj(Gauntlet.t().get("contracts")).get(job.get("kind", "")))
	_head("The Don has a job", str(def.get("name", "")), "\"%s\"" % def.get("job", ""))
	var offers: Array = Js.list(job.get("offers"))
	var votes: Dictionary = Js.obj(job.get("votes"))
	var cw: float = (w - 60.0 - 28.0) / 3.0
	var stakes: Dictionary = Js.obj(Gauntlet.t().get("stakes"))
	for i: int in offers.size():
		var o: Dictionary = offers[i]
		var c: GCard = _card(Vector2(30 + i * (cw + 14.0), 140), Vector2(cw, 250))
		c.kicker = str(stakes.get(str(i + 1), ""))
		c.title = Gauntlet.contract_goal(o)
		c.body = "If done:  %s\nIf broken:  %s" % [Gauntlet.describe_reward(o["reward"]), Gauntlet.describe_penalty(o["penalty"])]
		c.tone = [Dossier.HELP, Dossier.WARN, Dossier.HARM][i]
		c.short = true
		c.voters = _voters(votes, i + 1)
		c.live = not votes.has(my_key)
		var stake: int = i + 1
		c.pressed.connect(func() -> void:
			if c.live:
				_send(["contract", float(stake)]))
	var row: HBoxContainer = _foot(412)
	var wb: Button = _btn(row, "Walk away", "secondary", func() -> void: _send(["contract", 0.0]))
	wb.disabled = votes.has(my_key)
	var walkers: Array = _voters(votes, 0)
	var line: String = _waiting_on(votes)
	if not walkers.is_empty():
		line = ("%s would walk away.  " % ", ".join(PackedStringArray(walkers))) + line
	_label(Vector2(0, 470), line + "  The most votes carry; a tie walks away.", "karla", 600, 13, Dossier.FAINT, w, true)


func _voters(votes: Dictionary, v: int) -> Array:
	var out: Array = []
	for k: String in votes:
		if int(votes[k]) == v:
			out.append(_name(k))
	return out


func _job_result() -> void:
	var jr: Dictionary = Js.obj(_st.get("jobResult"))
	var job: Dictionary = Js.obj(jr.get("job"))
	var met: bool = jr.get("met", false) == true
	var w: float = _sheet.size.x
	var def: Dictionary = Js.obj(Js.obj(Gauntlet.t().get("contracts")).get(job.get("kind", "")))
	_head(str(def.get("name", "The job")), "Contract Cleared" if met else "Contract Broken")
	var c: GCard = _card(Vector2(w / 2.0 - 260.0, 120), Vector2(520, 160))
	c.title = Gauntlet.describe_reward(job["reward"]) if met else Gauntlet.describe_penalty(job["penalty"])
	c.body = Gauntlet.contract_goal(job)
	c.tone = Dossier.HELP if met else Dossier.HARM
	c.short = true
	var acks: Dictionary = Js.obj(_st.get("acks"))
	var row: HBoxContainer = _foot(310)
	var b: Button = _btn(row, "Onward", "primary", func() -> void: _send(["home"]))
	b.disabled = acks.has(my_key)
	var waiting: String = _waiting_on(acks)
	if waiting != "" and acks.has(my_key):
		_label(Vector2(0, 372), waiting, "karla", 600, 13, Dossier.FAINT, w, true)


# ══ The Don falls; his Marks ══════════════════════════════════════════════════

func _marks() -> void:
	var fall: Dictionary = Js.obj(_st.get("donFall"))
	var mk: Dictionary = Js.obj(_st.get("marks"))
	var offer: Dictionary = Js.obj(Js.obj(mk.get("offers")).get(my_key))
	var picks: Dictionary = Js.obj(mk.get("picks"))
	var w: float = _sheet.size.x
	_head(str(fall.get("eyebrow", "The Don falls")), str(fall.get("title", "Don Finleone Falls")), "\"%s\"" % fall.get("line", ""))
	var meta: Dictionary = Js.obj(Js.obj(Gauntlet.t().get("marks")).get("meta"))
	var cats: Dictionary = Js.obj(Js.obj(Gauntlet.t().get("marks")).get("cats"))
	var held: int = Js.list(_cap().get("marks")).size()
	var cw: float = 380.0
	for i: int in 2:
		var kind: String = ["shark", "whale"][i]
		var m: Dictionary = Js.obj(meta.get(kind))
		var c: GCard = _card(Vector2(w / 2.0 - cw - 10.0 + i * (cw + 20.0), 150), Vector2(cw, 260))
		c.kicker = "Mark of the %s" % kind.capitalize()
		c.title = str(m.get("name", kind.capitalize()))
		var lines: Array = []
		for bf: Dictionary in Js.list(offer.get(kind)):
			lines.append("+%d%%  %s" % [int(bf["pct"]), Js.obj(cats.get(bf["cat"])).get("label", bf["cat"])])
		c.body = "\n".join(PackedStringArray(lines))
		c.foot = str(m.get("tagline", ""))
		c.tone = Dossier.HARM if kind == "shark" else Color("#8ccfff")
		c.short = true
		c.live = not picks.has(my_key)
		if picks.get(my_key) == kind:
			c.stamp = face_of.call(my_key) if face_of.is_valid() else null
			c.stamp_name = "You"
		c.pressed.connect(func() -> void:
			if c.live:
				_send(["mark", kind]))
	_label(Vector2(0, 430), ("%d Mark%s already yours.  " % [held, "" if held == 1 else "s"] if held > 0 else "") + _waiting_on(picks), "karla", 600, 13, Dossier.FAINT, w, true)


# ══ The breather: the vote ════════════════════════════════════════════════════

func _breather() -> void:
	var run: Dictionary = _run()
	var w: float = _sheet.size.x
	var cleared: int = int(Js.num(Js.obj(run.get("roll")).get("cleared")))
	var depth: int = cleared + int(Js.num(run.get("skip")))
	var band: Dictionary = Gauntlet.band(maxi(1, depth), _variant())
	_label(Vector2(36, 26), str(band.get("name", "")).to_upper(), "karla", 800, 12, Color(str(band.get("accent", "#cccccc"))))
	_label(Vector2(36, 42), "Depth %d" % depth, "cinzel", 700, 34, Dossier.INK)
	_label(Vector2(36, 88), "%d ship%s sunk.  The pot rides on what you bank." % [cleared, "" if cleared == 1 else "s"], "karla", 600, 13, Dossier.SOFT)
	# What banking pays this captain.
	var bv: Dictionary = Js.obj(Js.obj(_st.get("bank")).get(my_key))
	var offer: Dictionary = Js.obj(Js.obj(run.get("offer")).get("live"))
	var left_w: float = w * 0.56
	var pot: BankPane = BankPane.new()
	pot.position = Vector2(36, 120)
	pot.size = Vector2(left_w - 50.0, 230)
	pot.view = bv
	pot.pot = Js.num(run.get("pot"))
	pot.variant = _variant()
	pot.chest_tex = _tx("donschestclosed.png" if _don() else "davychestclosed.png")
	_body.add_child(pot)
	# Davy's offer, when he leans over the rail.
	var y2: float = 364.0
	if not offer.is_empty():
		var oc: Dictionary = Gauntlet.offer_copy(offer)
		var c: GCard = _card(Vector2(36, y2), Vector2(left_w - 50.0, 92))
		c.kicker = str(oc["badge"])
		c.title = str(oc["title"])
		c.body = str(oc["line"])
		c.tone = Dossier.WARN
		c.short = true
		y2 += 104.0
	# The Sounding Line: what waits below.
	var pk: Dictionary = Js.obj(run.get("peekNote"))
	if not pk.is_empty():
		var t: String = "Something holds this water: a boss lies below." if pk.get("boss", false) else ("A hunter waits below: an elite%s." % ((" (%s)" % pk["affix"]) if pk.get("affix") != null else "") if pk.get("elite", false) else "Open water below.")
		if pk.get("apex", false):
			t = "The green goes still. The Don rises below."
		if int(Js.num(pk.get("ships"))) > 1:
			t += "  %d ships." % int(pk["ships"])
		_label(Vector2(36, y2), "The Sounding Line:  " + t, "karla", 700, 13, Dossier.SOFT, left_w - 50.0)
		y2 += 30.0
	# The crew's hulls and the run so far, on the right.
	var crew: CrewPane = CrewPane.new()
	crew.position = Vector2(left_w, 30)
	crew.size = Vector2(w - left_w - 36.0, _sheet.size.y - 140.0)
	for k: String in _keys():
		var s: Dictionary = _seat(k)
		crew.rows.append({ "name": _name(k), "face": face_of.call(k) if face_of.is_valid() else null, "hp": Js.num(s.get("hp")), "max": Js.num(s.get("max")),
			"vote": Js.obj(_st.get("votes")).get(k, ""), "boons": Js.obj(_cap(k).get("boons")).size(), "marks": Js.list(_cap(k).get("marks")).size() })
	crew.curses = Js.obj(run.get("curses"))
	crew.boons = Js.obj(_cap().get("boons"))
	_body.add_child(crew)
	# The vote.
	var votes: Dictionary = Js.obj(_st.get("votes"))
	var row: HBoxContainer = _foot(_sheet.size.y - 92.0)
	var shut: String = str(_st.get("bankShut", ""))
	var bank_t: String = "Take the deal" if not offer.is_empty() else "Bank the haul"
	var bb: Button = _btn(row, bank_t, "secondary", func() -> void: _send(["vote", "bank"]), 220.0)
	bb.disabled = shut != "" or votes.has(my_key)
	if shut != "":
		bb.tooltip_text = shut
	var dv: Button = _btn(row, "Dive deeper  ·  Depth %d" % (depth + 1), "primary", func() -> void: _send(["vote", "dive"]), 260.0)
	dv.disabled = votes.has(my_key)
	var keys: Array = _keys()
	var hb: Button = _btn(row, "Hold the dive" if keys.size() == 1 else "Vote to hold", "secondary", func() -> void: _send(["vote", "hold"]), 180.0)
	hb.disabled = votes.has(my_key)
	hb.tooltip_text = "Leave the dive where it is and come back to the maelstrom to resume it, depth, pot and powers all kept."
	_btn(row, "Codex", "secondary", func() -> void: _codex(), 120.0)
	var line: String = "Alone: bank, dive, or hold the dive for later." if keys.size() == 1 else "The crew votes. A majority carries; a tie banks. Holding takes everyone (a vote to hold counts as banking)."
	if votes.has(my_key):
		line = "You voted to %s.  %s" % [{ "bank": "bank", "dive": "dive", "hold": "hold the dive" }.get(str(votes[my_key]), "bank"), _waiting_on(votes)]
	if shut != "":
		line = shut
	_label(Vector2(0, _sheet.size.y - 36.0), line, "karla", 600, 13, Dossier.FAINT, w, true)


# ══ The haul, and the deep ════════════════════════════════════════════════════

## THE HAUL, ROLLED (Kong, 2026-10-05: "a loot roll ... to show off earning
## loot"): the chest comes up shut and shakes, bursts open, and what it paid
## counts up a line at a time, the drops landing last. Seen once (fresh); a
## repaint shows it as it ended.
func _haul(fresh: bool = false) -> void:
	var p: Dictionary = Js.obj(Js.obj(_st.get("pays")).get(my_key))
	var w: float = _sheet.size.x
	_head("Banked at depth %d" % int(Js.num(p.get("depth"))), "You climbed back into the light")
	var art: ChestArt = ChestArt.new()
	art.tex = _tx("donschestopen.png" if _don() else "davychestopen.png")
	art.position = Vector2(40, 110)
	art.size = Vector2(300, 300)
	art.label = str(p.get("chestLabel", ""))
	_body.add_child(art)
	var shown: Array = []
	var roll: float = 1.5 if fresh else 0.0
	if fresh:
		art.shut = _tx("donschestclosed.png" if _don() else "davychestclosed.png")
		art.open_at = 1.1
		get_tree().create_timer(1.1).timeout.connect(func() -> void:
			Sound.chest(true)
			Rumble.buzz([0, 40, 30, 80]))
	var rows: Array = [
		["Doubloons", "%s ⟡" % Js.thousands(Js.num(p.get("doubloons"))), Dossier.WARN],
		["Navigation XP", "+%s" % Js.thousands(Js.num(p.get("navXp"))), Dossier.INK],
		["Fathoms", "+%s" % Js.thousands(Js.num(p.get("fathoms"))), Color("#7fd6c8")],
	]
	if Js.num(p.get("fleet")) > 1.0:
		rows.append(["Fleet Chest", "+%d%% doubloons" % int(round((float(p["fleet"]) - 1.0) * 100.0)), Dossier.WARN])
	if Js.num(p.get("crewXp")) > 0.0:
		rows.append(["Every hand aboard", "+%s XP" % Js.thousands(Js.num(p.get("crewXp"))), Dossier.HELP])
	var y: float = 126.0
	for r: Array in rows:
		var kl: Label = _label(Vector2(380, y), r[0], "karla", 700, 15, Dossier.SOFT)
		var v: Label = _label(Vector2(380, y - 4), r[1], "cinzel", 700, 22, r[2], w - 420.0)
		v.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		shown.append([kl, v])
		y += 42.0
	var drops: Array = []
	for it: Variant in Js.list(p.get("items")):
		drops.append(str(Gauntlet.DROP_NAMES.get(str(it), Armory.item(str(it)).get("name", it))))
	for sk: Variant in Js.list(p.get("skins")):
		drops.append(str(Gauntlet.DROP_NAMES.get(str(sk), sk)))
	for vk: Variant in Js.list(p.get("vouchers")):
		drops.append("a %s skin voucher" % ("Captain's" if str(vk) == "captain" else "Bosun's"))
	if not drops.is_empty():
		var dl: Label = _label(Vector2(380, y + 6), "From the chest:  " + ", ".join(PackedStringArray(drops)), "karla", 800, 15, Dossier.WARN, w - 420.0)
		shown.append([dl])
		y += 40.0
	if p.get("record", false) == true:
		_label(Vector2(380, y + 6), "Your deepest descent yet.", "karla", 800, 15, Dossier.HELP, w - 420.0)
		y += 30.0
	var ups: Array = Js.list(p.get("crewUp")).filter(func(c: Dictionary) -> bool: return float(c["to"]) > float(c["from"]))
	if not ups.is_empty():
		var ul: Label = _label(Vector2(380, y + 6), "Level up:  " + ", ".join(PackedStringArray(ups.map(func(c: Dictionary) -> String: return "%s %d" % [c["name"], int(c["to"])]))), "karla", 600, 13, Dossier.SOFT, w - 420.0)
		shown.append([ul])
	_home_foot()
	if fresh:
		# A line at a time after the lid: each fades in and rises into place,
		# the numbers counting up as they come.
		for i: int in shown.size():
			var at: float = roll + 0.32 * i
			for c: Variant in shown[i]:
				var lb: Label = c
				lb.modulate.a = 0.0
				var y0: float = lb.position.y
				lb.position.y = y0 + 8.0
				var tw: Tween = lb.create_tween().set_parallel()
				tw.tween_property(lb, "modulate:a", 1.0, 0.25).set_delay(at)
				tw.tween_property(lb, "position:y", y0, 0.3).set_delay(at).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			if (shown[i] as Array).size() == 2:
				var val: Label = shown[i][1]
				var full: String = val.text
				var m: RegExMatch = RegEx.create_from_string("[0-9][0-9,]*").search(full)
				if m != null:
					var n: float = float(m.get_string().replace(",", ""))
					var pre: String = full.substr(0, m.get_start())
					var post: String = full.substr(m.get_end())
					val.create_tween().tween_method(func(f: float) -> void: val.text = pre + Js.thousands(round(f)) + post, 0.0, n, 0.7).set_delay(at).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			get_tree().create_timer(at).timeout.connect(func() -> void: Sound.xp_tick())


func _dead() -> void:
	var p: Dictionary = Js.obj(Js.obj(_st.get("pays")).get(my_key))
	if p.is_empty():
		p = Js.obj(_cap().get("paid"))
	var w: float = _sheet.size.x
	_head("Depth %d" % int(Js.num(p.get("depth"))), "The Green Takes It" if _don() else "The Locker Takes It", "Every ship sank." if _keys().size() > 1 or Js.obj(_st.get("caps")).size() > 1 else "You sank.")
	var lost: float = Js.num(_st.get("lostPot", _run().get("pot", 0.0)))
	# The chest, shut and sinking into the dark.
	var art: ChestArt = ChestArt.new()
	art.tex = _tx("donschestclosed.png" if _don() else "davychestclosed.png")
	art.position = Vector2(40, 110)
	art.size = Vector2(300, 300)
	art.label = "Lost to the deep"
	art.sunk = true
	_body.add_child(art)
	var c: Dictionary = _cap()
	var rows: Array = [
		["The pot, gone", "%s ⟡" % Js.thousands(lost), Color(Dossier.HARM, 0.9)],
		["Fathoms salvaged", "+%s" % Js.thousands(Js.num(p.get("fathoms"))), Color("#7fd6c8")],
		["Depth reached", str(int(Js.num(p.get("depth")))), Dossier.INK],
		["Powers held", str(Js.obj(c.get("boons")).size()), Dossier.INK],
		["Curses borne", str(Js.obj(_run().get("curses")).size()), Dossier.INK],
	]
	var y: float = 126.0
	for r: Array in rows:
		_label(Vector2(380, y), r[0], "karla", 700, 15, Dossier.SOFT)
		var v: Label = _label(Vector2(380, y - 4), r[1], "cinzel", 700, 22, r[2], w - 420.0)
		v.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		y += 42.0
	_label(Vector2(380, y + 10), "Your Fathoms are always paid. Spend them in the Locker." , "karla", 600, 13, Dossier.SOFT, w - 420.0)
	_home_foot()


## The dive held: where it waits, and how to come back to it.
func _held() -> void:
	var w: float = _sheet.size.x
	var d: int = int(Js.num(_st.get("heldAt")))
	_head("The dive is held", "Depth %d, waiting" % d, "The pot, the powers, the curses and every hull stay as they are.")
	_label(Vector2(0, 160), "%s ⟡ riding on it" % Js.thousands(Js.num(_run().get("pot"))), "cinzel", 700, 30, Dossier.WARN, w, true)
	var who: String = "Sail back to the %s maelstrom to resume it." % ("Don's" if _don() else "Davy's")
	if Js.obj(_st.get("caps")).size() > 1:
		who = "Sail back to the maelstrom together to resume it: the whole crew of this dive must be there."
	_label(Vector2(60, 214), who, "karla", 600, 15, Dossier.INK, w - 120.0, true)
	_label(Vector2(60, 244), "Or end it there: your Fathoms are paid and the pot is lost.", "karla", 500, 13, Dossier.SOFT, w - 120.0, true)
	_home_foot()


func _codex() -> void:
	var cx: GauntletCodex = GauntletCodex.new()
	cx.variant = _variant()
	cx.profile = profile
	cx.run_cap = _cap()
	add_child(cx)


func _home_foot() -> void:
	var acks: Dictionary = Js.obj(_st.get("acks"))
	var row: HBoxContainer = _foot(_sheet.size.y - 84.0)
	var b: Button = _btn(row, "Back to the sea", "primary", func() -> void: _send(["home"]), 220.0)
	b.disabled = acks.has(my_key)


# ══ Its pieces ════════════════════════════════════════════════════════════════

## A card on the table: art in a ring of its tone, a small kicker, its name,
## what it does, a foot line. Taken, a captain's face is stamped on it.
class GCard:
	extends Button
	const ROLE_TONE: Dictionary = { "tank": Color("#8fb4d8"), "healer": Color("#8fd8a8"), "support": Color("#e6c36f"), "gunner": Color("#e88a6a") }
	var art: Texture2D
	var tone: Color = Dossier.SOFT
	var kicker: String = ""
	var title: String = ""
	var body: String = ""
	var foot: String = ""
	var foot_tone: Color = Dossier.FAINT
	var stamp: Texture2D
	var stamp_name: String = ""
	var live: bool = false
	var dim: bool = false
	var own: bool = false
	var legend: bool = false
	var banish: bool = false
	var wide: bool = false
	var short: bool = false
	var voters: Array = []
	## A bond's role: its mark in the card's corner.
	var role: String = ""
	var delay: float = -1.0
	var _t: float = 0.0
	var _frames: int = 0

	func _init() -> void:
		flat = true
		focus_mode = Control.FOCUS_NONE
		clip_contents = false

	func _ready() -> void:
		if delay >= 0.0:
			# Dealt: each card flips up in turn.
			modulate.a = 0.0
			var y0: float = position.y
			position.y += 26.0
			var tw: Tween = create_tween().set_parallel()
			tw.tween_property(self, "modulate:a", 1.0, 0.24).set_delay(delay)
			tw.tween_property(self, "position:y", y0, 0.32).set_delay(delay).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			if legend:
				tw.tween_callback(func() -> void: Sound.seal(true)).set_delay(delay + 0.2)

	func _process(d: float) -> void:
		_t += d
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if live or banish else Control.CURSOR_ARROW
		if _frames < 12 or live or legend:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var hov: bool = is_hovered() and (live or banish)
		var lift: float = -4.0 if hov else 0.0
		var rr: Rect2 = Rect2(r.position + Vector2(0, lift), r.size)
		var bg: Color = BattleLook.LACQUER_HI.lightened(0.06 if hov else 0.0)
		var rim: Color = Color(tone, 0.85) if (hov or legend) else Color(1, 1, 1, 0.08)
		if banish:
			rim = Color(Dossier.HARM, 0.9)
		BattleLook.draw_box(self, rr, BattleLook.box(bg, rim, 2 if (hov or legend or banish) else 1, 14, 18.0 if hov else 8.0, Color(0, 0, 0, 0.45)))
		var a: float = 0.45 if dim else 1.0
		if role != "":
			_role_mark(Vector2(rr.end.x - 26.0, rr.position.y + 26.0), a)
		var x0: float = 18.0
		var y: float = rr.position.y + 20.0
		if wide:
			# Wide: art on the left, words on the right.
			if art != null:
				var c0: Vector2 = Vector2(rr.position.x + 110.0, rr.get_center().y)
				draw_circle(c0, 82.0, Color(tone, 0.12))
				_fit(art, Rect2(c0 - Vector2(70, 70), Vector2(140, 140)), a)
			x0 = 230.0
			y = rr.position.y + 36.0
			y = _words(Vector2(x0, y), size.x - x0 - 22.0, a)
			return
		if art != null and not short:
			var c: Vector2 = Vector2(rr.get_center().x, y + 66.0)
			draw_circle(c, 64.0, Color(tone, 0.12 + (0.05 * sin(_t * 3.0) if legend else 0.0)))
			draw_arc(c, 64.0, 0.0, TAU, 48, Color(tone, 0.35 * a), 1.5, true)
			_fit(art, Rect2(c - Vector2(54, 54), Vector2(108, 108)), a)
			y += 148.0
		elif not short:
			var c2: Vector2 = Vector2(rr.get_center().x, y + 50.0)
			draw_circle(c2, 44.0, Color(tone, 0.14))
			# A reprieve: a plain cross of relief.
			draw_line(c2 - Vector2(14, 0), c2 + Vector2(14, 0), tone, 6.0, true)
			draw_line(c2 - Vector2(0, 14), c2 + Vector2(0, 14), tone, 6.0, true)
			y += 110.0
		_words(Vector2(x0, y), size.x - 36.0, a)
		# Votes on it, as names.
		if not voters.is_empty():
			draw_string(Kit.font("karla", 800), Vector2(x0, rr.end.y - 14.0), "Voted:  " + ", ".join(PackedStringArray(voters)), HORIZONTAL_ALIGNMENT_LEFT, size.x - 36.0, 12, Dossier.WARN)
		# Taken: the captain's face, stamped.
		if stamp != null or stamp_name != "":
			draw_rect(rr.grow(-2), Color(0.03, 0.025, 0.02, 0.78))
			var sc: Vector2 = Vector2(rr.get_center().x, rr.position.y + rr.size.y * 0.42)
			BattleLook.medallion(self, sc, 34.0, stamp, BattleLook.GOLD, stamp_name.substr(0, 1), 1.0, Vector2(0.5, 0.5), 0.5)
			BattleLook.say(self, Kit.font("cinzel", 700), sc.x, sc.y + 56.0, "Taken by %s" % stamp_name if stamp_name != "You" else "Yours", 15, BattleLook.GOLD)

	## The role's mark: a shield (tank), a cross (healer), a pennant (support),
	## a gunsight (gunner), drawn, in the role's colour.
	func _role_mark(c: Vector2, a: float) -> void:
		var col: Color = Color(ROLE_TONE.get(role, Dossier.SOFT), a)
		draw_circle(c, 15.0, Color(col, 0.16 * a))
		match role:
			"tank":
				draw_colored_polygon(PackedVector2Array([c + Vector2(-8, -9), c + Vector2(8, -9), c + Vector2(8, 1), c + Vector2(0, 10), c + Vector2(-8, 1)]), col)
			"healer":
				draw_rect(Rect2(c + Vector2(-2.5, -8), Vector2(5, 16)), col)
				draw_rect(Rect2(c + Vector2(-8, -2.5), Vector2(16, 5)), col)
			"support":
				draw_line(c + Vector2(-6, -9), c + Vector2(-6, 10), col, 2.0, true)
				draw_colored_polygon(PackedVector2Array([c + Vector2(-5, -9), c + Vector2(9, -4), c + Vector2(-5, 1)]), col)
			_:
				draw_arc(c, 7.5, 0.0, TAU, 24, col, 2.0, true)
				draw_line(c + Vector2(0, -11), c + Vector2(0, -4), col, 2.0)
				draw_line(c + Vector2(0, 4), c + Vector2(0, 11), col, 2.0)
				draw_line(c + Vector2(-11, 0), c + Vector2(-4, 0), col, 2.0)
				draw_line(c + Vector2(4, 0), c + Vector2(11, 0), col, 2.0)

	func _words(at: Vector2, w: float, a: float) -> float:
		# Fitted to the card: the words step down a size, then the flavour
		# line goes, before anything runs off the bottom.
		var room: float = size.y - at.y - 18.0
		var sizes: Array = [[17, 13, 12, true], [16, 12, 11, true], [15, 12, 11, false], [14, 11, 10, false]]
		var pick: Array = sizes[sizes.size() - 1]
		for sz: Array in sizes:
			if _fit_h(w, sz) <= room:
				pick = sz
				break
		var y: float = at.y
		if kicker != "":
			y = _para(Kit.font("karla", 800), at.x, y - 13.0, kicker.to_upper(), w, 10, Color(tone, 0.95 * a)) + 10.0
		y = _para(Kit.font("cinzel", 700), at.x, y, title, w, int(pick[0]) if not wide else 20, Color(Dossier.INK, a)) + 6.0
		y = _para(Kit.font("karla", 600), at.x, y, body, w, int(pick[1]), Color(Dossier.SOFT, a)) + 8.0
		if foot != "" and (pick[3] or foot_tone != Dossier.FAINT):
			y = _para(Kit.font("karla", 700), at.x, y, foot, w, int(pick[2]), Color(foot_tone, a))
		return y

	## How tall the words would stand at these sizes.
	func _fit_h(w: float, sz: Array) -> float:
		var h: float = 0.0
		if kicker != "":
			h += _lines(Kit.font("karla", 800), kicker.to_upper(), w, 10) * 14.0 + 10.0
		h += _lines(Kit.font("cinzel", 700), title, w, int(sz[0])) * (int(sz[0]) + 4.0) + 6.0
		h += _lines(Kit.font("karla", 600), body, w, int(sz[1])) * (int(sz[1]) + 4.0) + 8.0
		if foot != "" and (sz[3] or foot_tone != Dossier.FAINT):
			h += _lines(Kit.font("karla", 700), foot, w, int(sz[2])) * (int(sz[2]) + 4.0)
		return h

	func _lines(f: Font, s: String, w: float, fs: int) -> int:
		if s == "":
			return 0
		var n: int = 0
		for part: String in s.split("
"):
			var cur: String = ""
			n += 1
			for word: String in part.split(" "):
				var tr: String = word if cur == "" else cur + " " + word
				if f.get_string_size(tr, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > w and cur != "":
					n += 1
					cur = word
				else:
					cur = tr
		return n

	func _para(f: Font, x: float, y: float, s: String, w: float, fs: int, c: Color) -> float:
		if s == "":
			return y
		var lines: PackedStringArray = []
		for part: String in s.split("\n"):
			var cur: String = ""
			for word: String in part.split(" "):
				var tr: String = word if cur == "" else cur + " " + word
				if f.get_string_size(tr, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > w and cur != "":
					lines.append(cur)
					cur = word
				else:
					cur = tr
			lines.append(cur)
		for ln: String in lines:
			y += fs + 4.0
			draw_string(f, Vector2(x, y), ln, HORIZONTAL_ALIGNMENT_LEFT, w, fs, c)
		return y

	func _fit(t: Texture2D, box: Rect2, a: float) -> void:
		var sc: float = minf(box.size.x / float(t.get_width()), box.size.y / float(t.get_height()))
		var ts: Vector2 = t.get_size() * sc
		draw_texture_rect(t, Rect2(box.get_center() - ts / 2.0, ts), false, Color(1, 1, 1, a))


## The order of the table: faces in turn, the one at it lit, the ones done
## ticked.
class OrderStrip:
	extends Control
	var faces: Array = []
	var names: Array = []
	var done: Array = []
	var at: int = 0
	var _t: float = 0.0

	func _process(d: float) -> void:
		_t += d
		queue_redraw()

	func _draw() -> void:
		for i: int in faces.size():
			var c: Vector2 = Vector2(66.0 + i * 132.0, 24.0)
			if i < faces.size() - 1:
				draw_line(c + Vector2(30, 0), c + Vector2(102, 0), Color(1, 1, 1, 0.12), 1.5)
			var lit: bool = i == at
			var col: Color = BattleLook.GOLD if lit else (Dossier.HELP if done[i] else Color(1, 1, 1, 0.3))
			if lit:
				draw_circle(c, 27.0 + 2.0 * sin(_t * 4.0), Color(BattleLook.GOLD, 0.18))
			BattleLook.medallion(self, c, 21.0, faces[i], col, str(names[i]).substr(0, 1), 1.0 if (lit or not done[i]) else 0.6, Vector2(0.5, 0.5), 0.5)
			BattleLook.say(self, Kit.font("karla", 800), c.x, 62.0, str(names[i]), 12, BattleLook.GOLD if lit else Dossier.SOFT)


## A wide strip of a painting (the shrine, the Fence's hulk), faded at its ends.
class ArtStrip:
	extends Control
	var tex: Texture2D
	var _frames: int = 0

	func _process(_d: float) -> void:
		if _frames < 12:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		if tex == null:
			return
		var sc: float = size.x / float(tex.get_width())
		var src_h: float = size.y / sc
		var src: Rect2 = Rect2(0, maxf(0.0, (tex.get_height() - src_h) * 0.45), tex.get_width(), minf(src_h, tex.get_height()))
		draw_texture_rect_region(tex, Rect2(Vector2.ZERO, size), src, Color(1, 1, 1, 0.9))
		for k: int in 20:
			var t: float = k / 20.0
			var a: float = 1.0 - t
			draw_rect(Rect2(k * 4.0, 0, 4.0, size.y), Color(Dossier.FILL, a))
			draw_rect(Rect2(size.x - (k + 1) * 4.0, 0, 4.0, size.y), Color(Dossier.FILL, a))


## A chest's painting and its name.
class ChestArt:
	extends Control
	var tex: Texture2D
	var label: String = ""
	## Sunk: dimmed and cold, settling slowly in the dark.
	var sunk: bool = false
	## Rolled: shut until open_at, shaking harder toward it, then open with a
	## burst of light and coin.
	var shut: Texture2D = null
	var open_at: float = -1.0
	var _t: float = 0.0
	var _frames: int = 0

	func _process(d: float) -> void:
		_t += d
		if _frames < 12 or sunk or (open_at > 0.0 and _t < open_at + 2.0):
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		draw_circle(size / 2.0, size.x * 0.42, Color(Color(0.3, 0.55, 0.6) if sunk else BattleLook.GOLD, 0.08))
		if shut != null and _t < open_at:
			# Shut, rattling harder as the lid gives.
			var k: float = clampf(_t / open_at, 0.0, 1.0)
			var sc0: float = minf(size.x / float(shut.get_width()), (size.y - 40.0) / float(shut.get_height()))
			var ts0: Vector2 = shut.get_size() * sc0
			var jig: Vector2 = Vector2(sin(_t * 47.0), cos(_t * 39.0)) * 3.0 * k * k
			draw_set_transform(Vector2(size.x / 2.0, ts0.y) + jig, sin(_t * 31.0) * 0.05 * k * k, Vector2.ONE)
			draw_texture_rect(shut, Rect2(Vector2(-ts0.x / 2.0, -ts0.y), ts0), false)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			BattleLook.say(self, Kit.font("cinzel", 700), size.x / 2.0, size.y - 8.0, label, 17, Dossier.INK)
			return
		if open_at > 0.0:
			# The burst: light, and coin thrown up out of it, falling back.
			var since: float = _t - open_at
			if since < 1.6:
				var c0: Vector2 = Vector2(size.x / 2.0, size.y * 0.42)
				var g: Texture2D = FxSheet.glow()
				var fl: float = 1.0 - smoothstep(0.0, 1.0, since)
				draw_texture_rect(g, Rect2(c0 - Vector2(170, 170), Vector2(340, 340)), false, Color(BattleLook.GOLD, 0.55 * fl))
				for k2: int in 22:
					var ang: float = -PI / 2.0 + (fposmod(k2 * 0.618, 1.0) - 0.5) * 2.2
					var sp: float = 260.0 + 160.0 * fposmod(k2 * 0.37, 1.0)
					var pos: Vector2 = c0 + Vector2.from_angle(ang) * sp * since + Vector2(0, 420.0 * since * since)
					draw_circle(pos, 4.5, Color(1.0, 0.82, 0.32, 1.0 - smoothstep(0.9, 1.6, since)))
		if tex != null:
			var sc: float = minf(size.x / float(tex.get_width()), (size.y - 40.0) / float(tex.get_height()))
			var ts: Vector2 = tex.get_size() * sc
			var dy: float = 6.0 * sin(_t * 0.8) if sunk else 0.0
			draw_texture_rect(tex, Rect2(Vector2((size.x - ts.x) / 2.0, dy), ts), false, Color(0.45, 0.6, 0.65, 0.85) if sunk else Color.WHITE)
			if sunk:
				# Bubbles rising off it.
				for k: int in 7:
					var f: float = fposmod(_t * 0.25 + k * 0.143, 1.0)
					var bx: float = size.x * (0.35 + 0.3 * fposmod(k * 0.37, 1.0)) + sin(_t * 2.0 + k) * 6.0
					var by: float = ts.y * (0.8 - f * 0.9)
					draw_arc(Vector2(bx, by), 3.0 + k % 3, 0.0, TAU, 12, Color(0.8, 0.95, 1.0, 0.5 * (1.0 - f)), 1.2, true)
		BattleLook.say(self, Kit.font("cinzel", 700), size.x / 2.0, size.y - 8.0, label, 17, Dossier.INK)


## What banking now pays this captain: the pot through the chest, the rest,
## and the chase drops' odds.
class BankPane:
	extends Control
	var view: Dictionary = {}
	var pot: float = 0.0
	var variant: String = "davy"
	var hardcore: bool = false
	var chest_tex: Texture2D
	var _frames: int = 0

	func _process(_d: float) -> void:
		if _frames < 12:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		BattleLook.draw_box(self, Rect2(Vector2.ZERO, size), BattleLook.box(BattleLook.LACQUER_HI, Color(1, 1, 1, 0.06), 1, 14))
		if chest_tex != null:
			var sc: float = 96.0 / float(chest_tex.get_height())
			draw_texture_rect(chest_tex, Rect2(Vector2(size.x - 24.0 - chest_tex.get_width() * sc, 18), chest_tex.get_size() * sc), false)
		var chest: Dictionary = Js.obj(view.get("chest"))
		draw_string(Kit.font("karla", 800), Vector2(22, 32), "IF YOU BANK NOW", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		draw_string(Kit.font("cinzel", 700), Vector2(22, 72), "%s ⟡" % Js.thousands(Js.num(view.get("doubloons"))), HORIZONTAL_ALIGNMENT_LEFT, -1, 34, BattleLook.GOLD)
		draw_string(Kit.font("karla", 600), Vector2(22, 96), "%s pot  x%s  %s" % [Js.thousands(pot), str(chest.get("potMult", 1)), str(view.get("chestLabel", ""))], HORIZONTAL_ALIGNMENT_LEFT, size.x - 160.0, 12, Dossier.SOFT)
		draw_string(Kit.font("karla", 700), Vector2(22, 124), "+%s Nav XP   ·   +%s Fathoms   ·   +%s XP to every hand" % [Js.thousands(Js.num(view.get("navXp"))), Js.thousands(Js.num(view.get("fathoms"))), Js.thousands(Js.num(view.get("crewXp")))], HORIZONTAL_ALIGNMENT_LEFT, size.x - 40.0, 13, Dossier.INK)
		draw_line(Vector2(22, 142), Vector2(size.x - 22, 142), Dossier.HAIR, 1.0)
		draw_string(Kit.font("karla", 800), Vector2(22, 164), "THE CHEST COULD HOLD", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		var x: float = 22.0
		var y: float = 190.0
		for o: Dictionary in Js.list(view.get("odds")):
			var t: String = "%s  %s" % [o["name"], ("%.1f%%" % (float(o["chance"]) * 100.0)) if o.get("lockedUntilDepth") == null else "from depth %d" % int(o["lockedUntilDepth"])]
			var tw: float = Kit.font("karla", 700).get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			if x + tw > size.x - 22.0:
				x = 22.0
				y += 22.0
			draw_string(Kit.font("karla", 700), Vector2(x, y), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Dossier.WARN if o.get("kind") == "skin" else Dossier.INK)
			x += tw + 18.0


## The crew's hulls and votes, and the run's curses and this captain's powers.
class CrewPane:
	extends Control
	var rows: Array = []
	var curses: Dictionary = {}
	var boons: Dictionary = {}

	func _process(_d: float) -> void:
		queue_redraw()

	func _draw() -> void:
		draw_string(Kit.font("karla", 800), Vector2(0, 12), "THE CREW", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		var y: float = 30.0
		for r: Dictionary in rows:
			BattleLook.medallion(self, Vector2(20, y + 20), 18.0, r.get("face"), Color(1, 1, 1, 0.3), str(r["name"]).substr(0, 1), 1.0, Vector2(0.5, 0.5), 0.5)
			draw_string(Kit.font("cinzel", 700), Vector2(48, y + 14), str(r["name"]), HORIZONTAL_ALIGNMENT_LEFT, size.x - 150.0, 15, Dossier.INK)
			var share: float = clampf(float(r["hp"]) / maxf(1.0, float(r["max"])), 0.0, 1.0)
			var col: Color = Dossier.HARM if share < 0.3 else (Dossier.WARN if share < 0.6 else Dossier.HELP)
			BattleLook.bar(self, Rect2(48, y + 22, size.x - 150.0, 8), share, share, 0.0, col, col.darkened(0.5))
			draw_string(Kit.font("karla", 700), Vector2(48, y + 46), "%d / %d hull  ·  %d powers%s" % [int(r["hp"]), int(r["max"]), int(r["boons"]), ("  ·  %d Marks" % int(r["marks"])) if int(r["marks"]) > 0 else ""], HORIZONTAL_ALIGNMENT_LEFT, size.x - 150.0, 12, Dossier.SOFT)
			var v: String = str(r.get("vote", ""))
			if v != "":
				var t: String = "Bank" if v == "bank" else "Dive"
				BattleLook.pill(self, Vector2(size.x - 84, y + 8), t, Dossier.WARN if v == "bank" else Dossier.HELP)
			y += 64.0
		y += 6.0
		draw_string(Kit.font("karla", 800), Vector2(0, y), "CURSES ON THE CREW", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		y += 12.0
		if curses.is_empty():
			draw_string(Kit.font("karla", 600), Vector2(0, y + 14), "None yet.", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Dossier.FAINT)
			y += 26.0
		var x: float = 0.0
		for id: String in curses:
			var cd: Dictionary = Gauntlet.curse_def(id)
			var nm: String = str(cd.get("name", id.capitalize())) + ("  " + Gauntlet.tier_label(int(curses[id])) if int(curses[id]) > 1 else "")
			var w: float = _chip_w(nm)
			if x + w > size.x:
				x = 0.0
				y += 36.0
			_chip(Vector2(x, y), nm, Dossier.HARM, _tex(cd.get("image")))
			x += w + 8.0
		y += 52.0
		draw_string(Kit.font("karla", 800), Vector2(0, y), "YOUR POWERS", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		y += 12.0
		x = 0.0
		if boons.is_empty():
			draw_string(Kit.font("karla", 600), Vector2(0, y + 14), "None yet.", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Dossier.FAINT)
		for id2: String in boons:
			var bd: Dictionary = Gauntlet.boon_def(id2)
			var nm2: String = str(bd.get("name", id2.capitalize())) + "  " + Gauntlet.tier_label(int(boons[id2]))
			var w2: float = _chip_w(nm2)
			if x + w2 > size.x:
				x = 0.0
				y += 36.0
			_chip(Vector2(x, y), nm2, Color("#8b9cff"), _tex(bd.get("image")))
			x += w2 + 8.0

	var _texs: Dictionary = {}

	func _tex(path: Variant) -> Texture2D:
		var p: String = str(path if path != null else "").trim_prefix("/")
		if p == "":
			return null
		if not _texs.has(p):
			_texs[p] = Skipper.tex(p)
		return _texs[p]

	func _chip_w(t: String) -> float:
		return Kit.font("karla", 700).get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x + 46.0

	## A chip: the power's or the curse's own icon, its name.
	func _chip(at: Vector2, t: String, tone: Color, icon: Texture2D) -> void:
		var r: Rect2 = Rect2(at, Vector2(_chip_w(t), 30))
		BattleLook.draw_box(self, r, BattleLook.box(Color(tone, 0.14), Color(tone, 0.35), 1, 15))
		if icon != null:
			draw_texture_rect(icon, Rect2(at + Vector2(4, 3), Vector2(24, 24)), false)
		else:
			draw_circle(at + Vector2(16, 15), 5.0, tone)
		draw_string(Kit.font("karla", 700), at + Vector2(34, 20), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, tone.lightened(0.45))
