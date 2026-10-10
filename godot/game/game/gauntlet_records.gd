class_name GauntletRecords
extends Control
## THE RECORDS of a descent, this captain's own (kept by GauntletPay.record in game/gauntlet_pay.gd):
## Solo and Co-op side by side (the deepest banked and the time it took, the
## deepest sunk, the dives banked and sunk), then across both the Fathoms
## earned and the biggest single hit; and two recaps, the deepest dive of each
## mode and the last dive: its depth, its crew, its pot, the powers, synergies,
## Marks and curses it carried, and how the guns went.

const W: float = 1060.0

var variant: String = "davy"
var profile: Dictionary = {}
## Drawn inside a pane (its size set before it is added) rather than as a sheet.
var embedded: bool = false

var _box: Panel
var _list: VBoxContainer
var _tex: Dictionary = {}


func _ready() -> void:
	theme = UiTheme.make()
	_box = Panel.new()
	if embedded:
		mouse_filter = Control.MOUSE_FILTER_PASS
		_box.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
		_box.size = size
	else:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_STOP
		var scrim: ColorRect = ColorRect.new()
		scrim.color = Color(0, 0, 0, 0.66)
		scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(scrim)
		var vp: Vector2 = get_viewport_rect().size
		_box.add_theme_stylebox_override("panel", BattleLook.box(Dossier.FILL, Dossier.HAIR, 1, 18, 40.0, Color(0, 0, 0, 0.6)))
		_box.size = Vector2(minf(W, vp.x - 60.0), minf(760.0, vp.y - 60.0))
		_box.position = (vp - _box.size) / 2.0
	add_child(_box)
	if not embedded:
		var eb: Label = Kit.text(_box, "THE RECORDS  ·  %s" % str(Gauntlet.NAMES[variant]).to_upper(), "small", Dossier.SOFT)
		eb.position = Vector2(32, 24)
		var tl: Label = Kit.text(_box, "Your descents", "title", Dossier.INK)
		tl.position = Vector2(32, 42)
	var sc: ScrollContainer = ScrollContainer.new()
	sc.position = Vector2(0, 8) if embedded else Vector2(24, 100)
	sc.size = _box.size - (Vector2(0, 8) if embedded else Vector2(48, 170))
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_box.add_child(sc)
	_list = VBoxContainer.new()
	_list.custom_minimum_size = Vector2(sc.size.x - 14.0, 0)
	_list.add_theme_constant_override("separation", 12)
	sc.add_child(_list)
	if not embedded:
		var close: Button = Kit.button("Done", "primary")
		close.custom_minimum_size = Vector2(150, 46)
		close.position = Vector2(_box.size.x - 182, _box.size.y - 62)
		close.pressed.connect(queue_free)
		_box.add_child(close)
	_fill()
	Pane.set_night(_box, true)


func _unhandled_input(ev: InputEvent) -> void:
	if embedded:
		return
	if ev is InputEventKey and (ev as InputEventKey).pressed and (ev as InputEventKey).keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		queue_free()


func _base() -> String:
	return "dons_gauntlet_" if variant == "don" else "gauntlet_"


static func clock(ms: float) -> String:
	if ms <= 0.0 or ms > 1e15:
		return "-"
	var s: int = int(round(ms / 1000.0))
	if s >= 3600:
		return "%d:%02d:%02d" % [s / 3600, (s / 60) % 60, s % 60]
	return "%d:%02d" % [s / 60, s % 60]


func _fill() -> void:
	var b: String = _base()
	# The two modes, side by side.
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	_list.add_child(row)
	for m: Array in [["solo", "Solo"], ["coop", "Co-op"]]:
		var pre: String = b + m[0] + "_"
		var card: Stat = Stat.new()
		card.title = m[1]
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.custom_minimum_size = Vector2(0, 186)
		card.big = int(Js.num(profile.get(pre + "deepest")))
		card.rows = [
			["Best time to it", clock(Js.num(profile.get(pre + "best_depth_ms")))],
			["Deepest sunk", str(int(Js.num(profile.get(pre + "deepest_died"))))],
			["Dives banked", str(int(Js.num(profile.get(pre + "runs_completed"))))],
			["Dives sunk", str(int(Js.num(profile.get(pre + "runs_sunk"))))],
		]
		row.add_child(card)
	if _list.custom_minimum_size.x < 760.0:
		row = HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		_list.add_child(row)
	var all: Stat = Stat.new()
	all.title = "Every descent"
	all.custom_minimum_size = Vector2(0, 186 if _list.custom_minimum_size.x >= 760.0 else 146)
	all.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	all.big = -1
	all.rows = [
		["Deepest here, any mode", str(int(Js.num(profile.get(b + "deepest"))))],
		["Fathoms earned", Js.thousands(Js.num(profile.get("gauntlet_fathoms_earned")))],
		["Fathoms in the purse", Js.thousands(Js.num(profile.get("gauntlet_fathoms")))],
		["Biggest single hit", Js.thousands(Js.num(profile.get("gauntlet_max_hit")))],
	]
	row.add_child(all)
	# The recaps.
	for r: Array in [[b + "solo_deepest_run", "Deepest solo dive"], [b + "coop_deepest_run", "Deepest co-op dive"], [b + "last_run", "Last dive"]]:
		var snap: Dictionary = Js.obj(profile.get(r[0]))
		var rc: Recap = Recap.new()
		rc.title = r[1]
		rc.snap = snap
		rc.tex = _tex
		rc.custom_minimum_size = Vector2(0, 200 if not snap.is_empty() else 70)
		_list.add_child(rc)


## A mode's numbers: its deepest big, the rest in rows.
class Stat:
	extends Control
	var title: String = ""
	var big: int = 0
	var rows: Array = []

	func _draw() -> void:
		BattleLook.draw_box(self, Rect2(Vector2.ZERO, size), BattleLook.box(BattleLook.LACQUER_HI, Color(1, 1, 1, 0.06), 1, 14))
		draw_string(Kit.font("karla", 800), Vector2(20, 30), title.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		var y: float = 54.0
		if big >= 0:
			draw_string(Kit.font("cinzel", 700), Vector2(20, 76), "Depth %d" % big if big > 0 else "Not yet banked", HORIZONTAL_ALIGNMENT_LEFT, size.x - 40, 26 if big > 0 else 18, Dossier.INK if big > 0 else Dossier.FAINT)
			y = 104.0
		for rw: Array in rows:
			draw_string(Kit.font("karla", 600), Vector2(20, y), str(rw[0]), HORIZONTAL_ALIGNMENT_LEFT, size.x - 120, 13, Dossier.SOFT)
			var v: String = str(rw[1])
			var vw: float = Kit.font("karla", 800).get_string_size(v, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
			draw_string(Kit.font("karla", 800), Vector2(size.x - 20 - vw, y), v, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Dossier.INK)
			y += 22.0


## A dive told back: depth, crew, pot, what it carried, how the guns went.
class Recap:
	extends Control
	var title: String = ""
	var snap: Dictionary = {}
	var tex: Dictionary = {}
	var _frames: int = 0

	func _process(_d: float) -> void:
		if _frames < 12:
			_frames += 1
			queue_redraw()

	func _icon(path: Variant) -> Texture2D:
		var p: String = str(path if path != null else "").trim_prefix("/")
		if p == "":
			return null
		if not tex.has(p):
			tex[p] = Skipper.tex(p)
		return tex[p]

	func _draw() -> void:
		BattleLook.draw_box(self, Rect2(Vector2.ZERO, size), BattleLook.box(BattleLook.LACQUER_HI, Color(1, 1, 1, 0.06), 1, 14))
		draw_string(Kit.font("karla", 800), Vector2(20, 28), title.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		if snap.is_empty():
			draw_string(Kit.font("karla", 600), Vector2(20, 52), "Nothing yet.", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Dossier.FAINT)
			return
		var banked: bool = snap.get("banked", false) == true
		var head: String = "Depth %d  ·  %s" % [int(Js.num(snap.get("depth"))), "banked %s ⟡" % Js.thousands(Js.num(snap.get("pot"))) if banked else "sunk, %s ⟡ lost" % Js.thousands(Js.num(snap.get("pot")))]
		draw_string(Kit.font("cinzel", 700), Vector2(20, 58), head, HORIZONTAL_ALIGNMENT_LEFT, size.x - 40, 20, Dossier.INK if banked else Dossier.HARM)
		var crew: Array = Js.list(snap.get("crew"))
		var sub: String = ("With %s" % ", ".join(PackedStringArray(crew))) if not crew.is_empty() else "Alone"
		sub += "  ·  %s" % clock_s(Js.num(snap.get("ms")))
		sub += "  ·  %s" % str(snap.get("at", "")).substr(0, 10)
		draw_string(Kit.font("karla", 600), Vector2(20, 80), sub, HORIZONTAL_ALIGNMENT_LEFT, size.x - 40, 12, Dossier.SOFT)
		# The powers, as icons with their tiers; then synergies, Marks, curses.
		var x: float = 20.0
		var y: float = 100.0
		var boons: Dictionary = Js.obj(snap.get("boons"))
		for id: String in boons:
			var b: Dictionary = Gauntlet.boon_def(id)
			var ic: Texture2D = _icon(b.get("image"))
			if ic != null:
				draw_texture_rect(ic, Rect2(Vector2(x, y), Vector2(34, 34)), false)
			draw_string(Kit.font("karla", 800), Vector2(x + 24, y + 34), Gauntlet.tier_label(int(boons[id])), HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color("#c9d2ff"))
			x += 42.0
			if x > size.x - 60.0:
				x = 20.0
				y += 42.0
		if boons.is_empty():
			draw_string(Kit.font("karla", 600), Vector2(20, y + 20), "No powers taken.", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Dossier.FAINT)
		y += 54.0
		var bits: Array = []
		var syn: Array = Js.list(snap.get("taken")) + Js.list(snap.get("takenCv"))
		if not syn.is_empty():
			bits.append("Synergies: " + ", ".join(PackedStringArray(syn.map(func(i: Variant) -> String:
				var c: Dictionary = Gauntlet.confluence_def(str(i))
				if c.is_empty():
					c = Gauntlet.convergence_def(str(i))
				return str(c.get("name", i))))))
		var mk: int = Js.list(snap.get("marks")).size()
		if mk > 0:
			bits.append("%d Mark%s of the Don" % [mk, "" if mk == 1 else "s"])
		var cu: Dictionary = Js.obj(snap.get("curses"))
		if not cu.is_empty():
			bits.append("Curses: " + ", ".join(PackedStringArray(cu.keys().map(func(i: Variant) -> String: return str(Gauntlet.curse_def(str(i)).get("name", i))))))
		var st: Dictionary = Js.obj(snap.get("stats"))
		var shots: float = Js.num(st.get("shots"))
		bits.append("%d shots, %d%% critical, %s dealt, %s taken, biggest hit %s" % [int(shots), int(round(Js.num(st.get("crits")) / maxf(1.0, shots) * 100.0)), Js.thousands(Js.num(st.get("dmgDealt"))), Js.thousands(Js.num(st.get("dmgTaken"))), Js.thousands(Js.num(st.get("highestHit")))])
		draw_multiline_string(Kit.font("karla", 600), Vector2(20, y), "  ·  ".join(PackedStringArray(bits)), HORIZONTAL_ALIGNMENT_LEFT, size.x - 40, 12, 4, Dossier.SOFT)

	static func clock_s(ms: float) -> String:
		return GauntletRecords.clock(ms)
