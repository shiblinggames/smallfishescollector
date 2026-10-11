extends Control
## THE SHARED SPOILS SHEET (ENDING TOGETHER, Kong, 2026-10-11): the end of a
## co-op raid (won or lost) and of a co-op dive (banked or lost) is one sheet
## on the night paper, a column per captain: their avatar and name, what they
## took (coin, XP, the dive's Fathoms), the items won (each on the glow of its
## rarity, never a coloured border), the tier's seal (a raid) or the depth (a
## dive), and a line for a captain who fled, sank, lost touch or was towed.
## The loss is headed with what happened ("The line was broken at fight 3")
## and says what was banked before it.
##
## Every number comes from the table's state (`spoils`, kept on the founder's
## game by game/raid_table.gd and game/gauntlet_pay.gd), so every captain sees
## the same sheet. It stays up until Continue; after that it says who it is
## still waiting on ("Waiting on Ben") until all have pressed it, or WAIT_MAX
## passes.
##
## Two homes: on the sea (this Control, opened by game/crew_ending.gd, for a
## raid's end and for a captain who followed a dive from outside it), and in
## the dive's own sheet (game/gauntlet_overlay.gd draws the columns with
## board() for the captains still in the dive).

signal closed

const W: float = 1120.0
const H: float = 640.0
## How long "Waiting on Ben" holds after Continue before the sheet goes anyway.
const WAIT_MAX: float = 10.0

var sea: Sea
## The founder's table this sheet follows (RaidTable or GauntletTable), and
## the op that reaches it.
var table: Node = null
var op: String = "raidTable"
var my_key: String = ""
## The state the sheet was opened from (its spoils are drawn once; later
## states only update who is still to press Continue).
var st: Dictionary = {}

var _card: Panel
var _scrim: ColorRect
var _btn: Button
var _wait_l: Label
var _pressed_ms: int = -1


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	_scrim = Kit.scrim(self, Kit.SCRIM_SHEET)
	var vp: Vector2 = get_viewport_rect().size
	_card = Panel.new()
	_card.add_theme_stylebox_override("panel", BattleLook.box(Dossier.FILL, Dossier.HAIR, 1, 18, 40.0, Color(0, 0, 0, 0.55)))
	_card.size = Vector2(minf(W, vp.x - 40.0), minf(H, vp.y - 40.0))
	_card.position = (vp - _card.size) / 2.0
	_card.clip_contents = true
	add_child(_card)
	var sp: Dictionary = Js.obj(st.get("spoils"))
	var w: float = _card.size.x
	var top: float = head(_card, sp, w)
	board(_card, Rect2(36, top + 6.0, w - 72.0, _card.size.y - top - 96.0), sp, my_key)
	var foot: Array = foot_row(_card, Vector2(0, _card.size.y - 78.0), w, _press)
	_btn = foot[0]
	_wait_l = foot[1]
	Pane.set_night(_card, true)
	if table != null:
		table.connect("changed", _on_table)
	Motion.panel_in(_card)
	Sound.chest(true)


func _on_table(s: Dictionary) -> void:
	# Only the presses of this same run (a new raid called meanwhile replaces
	# the table's state; the sheet keeps its own copy and goes on its timer).
	if str(s.get("rid", "")) == str(st.get("rid", "")):
		st = s
		_paint_wait()


func _press() -> void:
	if _pressed_ms >= 0:
		return
	_pressed_ms = Time.get_ticks_msec()
	Sound.plip()
	if sea != null:
		sea.session.act(op, ["seen" if op == "raidTable" else "home"])
	# Marked here at once (the founder's answer comes back as a state).
	var given: Dictionary = _given().duplicate()
	given[my_key] = true
	_paint_wait(given)


## Who has pressed Continue: a raid's `seen`, a dive's end acks.
func _given() -> Dictionary:
	return Js.obj(st.get("seen" if op == "raidTable" else "acks"))


func _paint_wait(given: Dictionary = {}) -> void:
	if _pressed_ms < 0:
		return
	var g: Dictionary = given if not given.is_empty() else _given().merged({ my_key: true })
	var names: Array = waiting_names(Js.obj(st.get("spoils")), g, my_key)
	_btn.disabled = true
	if names.is_empty():
		_close()
		return
	_btn.visible = false
	_wait_l.text = "Waiting on %s" % BattleLook.join_names(names)
	_wait_l.visible = true


func _process(_delta: float) -> void:
	if _pressed_ms >= 0 and Time.get_ticks_msec() - _pressed_ms > int(WAIT_MAX * 1000.0):
		_close()


func _close() -> void:
	if Motion.closing(self):
		return
	if table != null and table.is_connected("changed", _on_table):
		table.disconnect("changed", _on_table)
	closed.emit()
	Motion.dismiss(self, _card, _scrim)


# ══ The pieces, shared with the dive's own sheet ═════════════════════════════

## The captains still to press Continue (named, in the line's order): not you,
## and not one whose game lost touch (nothing can come from them).
static func waiting_names(sp: Dictionary, given: Dictionary, me: String) -> Array:
	var out: Array = []
	var seats: Dictionary = Js.obj(sp.get("seats"))
	for k: Variant in Js.list(sp.get("order")):
		var c: Dictionary = Js.obj(seats.get(k))
		if str(k) == me or given.has(k) or str(c.get("out", "")) == "away":
			continue
		out.append(str(c.get("name", "A captain")))
	return out


## The words over the columns: [eyebrow, title, line under]. A loss is headed
## with what happened, and says what was banked before it.
static func words(sp: Dictionary) -> Array:
	var res: String = str(sp.get("result", ""))
	var at: int = int(Js.num(sp.get("at")))
	if str(sp.get("kind", "")) == "dive":
		var don: bool = str(sp.get("variant", "")) == "don"
		var eb: String = "%s  ·  Co-op" % ("The Don's Gauntlet" if don else "Davy's Gauntlet")
		if res == "lost":
			return [eb, "%s took the crew at depth %d" % ["The green" if don else "The Locker", at],
				"The pot of %s ⟡ went down with the ships. Every captain's Fathoms are paid all the same." % Js.thousands(Js.num(sp.get("pot")))]
		return [eb, "Banked at depth %d" % at, "Each captain banks the whole pot, lifted by the Fleet Chest for every ship afloat."]
	var tier: String = { "normal": "Normal", "coop": "Co-op", "coopc": "Co-op Challenge" }.get(str(sp.get("tier", "")), "Normal")
	var eb2: String = "%s  ·  %s" % [sp.get("raid", "The raid"), tier]
	match res:
		"lost":
			return [eb2, "The line was broken at fight %d" % at, "No crate. What was banked is what each kill paid as it went down: the doubloons to the crew's purse, the XP to each captain."]
		"fled":
			return [eb2, "The line fell back at fight %d" % at, "No crate. What was banked is what each kill paid before the crew turned for home."]
	return [eb2, "The Spoils", "Doubloons go to the crew's purse; the XP and every item are each captain's own."]


## The head of the sheet into `host` (width w); returns where the columns
## may start.
static func head(host: Control, sp: Dictionary, w: float) -> float:
	var wd: Array = words(sp)
	var lost: bool = str(sp.get("result", "")) in ["lost", "fled"]
	_text(host, Vector2(0, 24), str(wd[0]).to_upper(), "karla", 800, 12, Dossier.HARM if lost else Dossier.SOFT, w, true)
	_text(host, Vector2(0, 42), str(wd[1]), "cinzel", 700, 30, Dossier.INK, w, true)
	_text(host, Vector2(60, 86), str(wd[2]), "karla", 500, 14, Dossier.SOFT, w - 120.0, true)
	return 124.0


## The foot: Continue, and the line that takes its place once pressed.
## Returns [button, label].
static func foot_row(host: Control, at: Vector2, w: float, on_press: Callable) -> Array:
	var b: Button = Kit.button("Continue", "primary")
	b.custom_minimum_size = Vector2(220, 46)
	b.position = at + Vector2((w - 220.0) / 2.0, 0)
	b.size = Vector2(220, 46)
	b.pressed.connect(on_press)
	host.add_child(b)
	var l: Label = _text(host, at + Vector2(0, 12), "", "karla", 700, 15, Dossier.SOFT, w, true)
	l.visible = false
	return [b, l]


## THE COLUMNS, a captain each, centred in `rect` of `host`; yours marked
## "You" over the avatar. Each column fades in a beat after the one before.
static func board(host: Control, rect: Rect2, sp: Dictionary, me: String) -> void:
	var seats: Dictionary = Js.obj(sp.get("seats"))
	var order: Array = Js.list(sp.get("order")).filter(func(k: Variant) -> bool: return seats.has(k))
	var n: int = maxi(1, order.size())
	var cw: float = minf(250.0, rect.size.x / float(n))
	var x0: float = rect.position.x + (rect.size.x - cw * n) / 2.0
	var dive: bool = str(sp.get("kind", "")) == "dive"
	for i: int in order.size():
		var k: String = str(order[i])
		var col: Control = Control.new()
		col.position = Vector2(x0 + cw * i, rect.position.y)
		col.size = Vector2(cw, rect.size.y)
		col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		host.add_child(col)
		_column(col, Js.obj(seats[k]), k == me, sp, dive)
		if i > 0:
			# A hairline between captains (no boxes round them).
			var hl: ColorRect = ColorRect.new()
			hl.color = Dossier.HAIR
			hl.position = Vector2(0, 10)
			hl.size = Vector2(1, rect.size.y - 20.0)
			hl.mouse_filter = Control.MOUSE_FILTER_IGNORE
			col.add_child(hl)
		Motion.stagger(col, i * 4)


static func _column(col: Control, c: Dictionary, mine: bool, sp: Dictionary, dive: bool) -> void:
	var cw: float = col.size.x
	var out: String = str(c.get("out", ""))
	if mine:
		_text(col, Vector2(0, 0), "YOU", "karla", 800, 11, Dossier.WARN, cw, true)
	# The avatar (the captain's own face, as the plates show it).
	var face: TextureRect = TextureRect.new()
	face.texture = Avatar.texture_of(Js.obj(c.get("face")), col)
	face.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	face.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	face.position = Vector2(cw / 2.0 - 40.0, 18)
	face.size = Vector2(80, 80)
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if out in ["sank", "away"]:
		face.modulate = Color(1, 1, 1, 0.5)
	col.add_child(face)
	_text(col, Vector2(8, 102), str(c.get("name", "A captain")), "cinzel", 700, 20, Dossier.INK, cw - 16.0, true)
	var line: Array = _status(c, sp, dive)
	_text(col, Vector2(8, 130), str(line[0]), "karla", 700, 13, line[1], cw - 16.0, true)
	# The seal of the tier (a raid seen through), or the depth (a dive).
	if dive:
		_text(col, Vector2(0, 158), "Depth %d" % int(Js.num(c.get("depth"))), "cinzel", 700, 24, Dossier.INK if out != "sank" else Dossier.SOFT, cw, true)
		if c.get("record", false) == true:
			_text(col, Vector2(0, 190), "Your deepest yet" if mine else "Their deepest yet", "karla", 700, 12, Dossier.HELP, cw, true)
	else:
		var seal: Dictionary = Js.obj(c.get("seal"))
		if not seal.is_empty():
			var sl: Seal = Seal.new()
			sl.tier = { "normal": "Normal", "coop": "Co-op", "coopc": "Co-op Challenge" }.get(str(seal.get("tier", "")), "Normal")
			sl.first = seal.get("first", false) == true
			sl.position = Vector2(0, 156)
			sl.size = Vector2(cw, 62)
			col.add_child(sl)
		else:
			_text(col, Vector2(0, 176), "No crate", "karla", 600, 13, Dossier.FAINT, cw, true)
	# What they took.
	var rows: Array = [["Doubloons", "%s ⟡" % Js.thousands(Js.num(c.get("coin"))), Dossier.WARN], ["Navigation XP", "+%s" % Js.thousands(Js.num(c.get("xp"))), Dossier.INK]]
	if dive:
		rows.append(["Fathoms", "+%s" % Js.thousands(Js.num(c.get("fathoms"))), Kit.TEAL])
		# A lost dive banks only the Fathoms: the zero rows would be noise.
		if str(sp.get("result", "")) == "lost":
			rows = [rows[2]]
	var y: float = 226.0
	for r: Array in rows:
		_text(col, Vector2(18, y + 4), str(r[0]), "karla", 700, 13, Dossier.SOFT)
		var v: Label = _text(col, Vector2(18, y), str(r[1]), "cinzel", 700, 18, r[2], cw - 36.0)
		v.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		y += 28.0
	# The items, each on its rarity's glow, the name under it.
	var items: Array = Js.list(c.get("items"))
	y += 8.0
	if items.is_empty():
		if out == "" or out == "towed":
			_text(col, Vector2(0, y + 10), "No items this time", "karla", 600, 12, Dossier.FAINT, cw, true)
		return
	# A row each: the art on its rarity's glow, the name beside it (names in
	# a narrow column ran into each other under a grid of tiles).
	var tile: float = 52.0
	var fits: int = maxi(1, int((col.size.y - y) / (tile + 6.0)))
	# All that fit; else one row fewer and "and 2 more" under them (at least one shown).
	var shown: int = items.size() if items.size() <= fits else maxi(1, fits - 1)
	for i: int in shown:
		var it: Dictionary = Js.obj(items[i])
		var halo: Color = Kit.rarity(it.get("rarity")) if Kit.rarity_key(it.get("rarity")) != "" else Kit.RARITY["chase"]
		var ty: float = y + i * (tile + 6.0)
		if str(it.get("image", "")) != "":
			var art: Control = Kit.art(col, it["image"], Vector2(tile, tile), halo)
			art.position = Vector2(14, ty)
			art.size = Vector2(tile, tile)
			# The halo a touch stronger than the shelf's: it is the rarity's word.
			(art.get_child(0) as CanvasItem).modulate.a = 0.55
		else:
			var g: TextureRect = TextureRect.new()
			g.texture = Glow.radial(128, halo)
			g.modulate.a = 0.55
			g.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			g.position = Vector2(14, ty)
			g.size = Vector2(tile, tile)
			g.mouse_filter = Control.MOUSE_FILTER_IGNORE
			col.add_child(g)
		var nl: Label = _text(col, Vector2(14 + tile + 8.0, ty), str(it.get("name", "")), "karla", 700, 13, Dossier.INK, cw - tile - 40.0)
		nl.custom_minimum_size = Vector2(cw - tile - 40.0, tile)
		nl.size = nl.custom_minimum_size
		nl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		nl.max_lines_visible = 2
	if items.size() > shown:
		_text(col, Vector2(0, y + shown * (tile + 6.0) + 4.0), "and %d more" % (items.size() - shown), "karla", 600, 12, Dossier.SOFT, cw, true)


## The line under a captain's name: how their part ended, plainly.
static func _status(c: Dictionary, sp: Dictionary, dive: bool) -> Array:
	var at: int = int(Js.num(c.get("outAt")))
	match str(c.get("out", "")):
		"fled":
			return ["Fled at fight %d" % at, Dossier.SOFT]
		"sank":
			if dive:
				return ["Sank at depth %d" % int(Js.num(c.get("depth"))), Dossier.HARM]
			return ["Sank at fight %d" % at, Dossier.HARM]
		"away":
			return ["Lost touch at fight %d" % at if at > 0 else "Lost touch", Dossier.FAINT]
		"towed":
			var n: int = int(Js.num(c.get("towed")))
			return ["Towed along%s" % ("" if n <= 1 else ", %d times" % n), Kit.SHIELD]
	if dive:
		return ["Banked", Dossier.HELP]
	return ["Saw it to the end", Dossier.HELP] if str(sp.get("result", "")) == "won" else ["In the line to the last", Dossier.SOFT]


static func _text(parent: Control, at: Vector2, s: String, family: String, weight: int, fs: int, col: Color, w: float = -1.0, center: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = s
	l.position = at
	l.add_theme_font_override("font", Kit.font(family, weight))
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", col)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if w > 0.0:
		l.size = Vector2(w, 0)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if center:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	parent.add_child(l)
	return l


## The tier's seal, small and flat: the raid's Stamp (a gold disc and a dark
## check) at rest, the tier under it, and "First clear" when it was.
class Seal:
	extends Control
	var tier: String = "Normal"
	var first: bool = false

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c: Vector2 = Vector2(size.x / 2.0, 20)
		draw_circle(c, 19.0, BattleLook.GOLD.darkened(0.12))
		draw_polyline(PackedVector2Array([c + Vector2(-8, 1), c + Vector2(-2, 7), c + Vector2(9, -6)]), Color(0.18, 0.12, 0.05), 3.0, true)
		var f: Font = Kit.font("karla", 800)
		var t: String = tier.to_upper() + ("  ·  FIRST CLEAR" if first else "")
		var w: float = f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		draw_string(f, Vector2((size.x - w) / 2.0, 56), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.WARN)
