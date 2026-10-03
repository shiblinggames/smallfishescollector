class_name EnemyCard
extends Control
## THE ENEMY'S STAT CARD (Godot port of RaidCombat's EnemyStatsPopup; Kong,
## 2026-10-03: "If you click on an enemy it shows their full art image like in
## the web game and their stats and statuses"). Click the enemy's hull or its
## plate. The card opens on the enemy: the whole painting on a pool of its
## colour, its rank and name over the foot of it; then its numbers (hull,
## damage, volley, initiative, crits), an elite's affix, every ability it
## carries in plain words, a boss's phases and the telegraphed move each one
## arms (and what answers it), what is on it right now, and one fuzzy tell
## about how it fights (never the turn-by-turn pattern: reading that is the
## player's puzzle). Flat and clean, on the night side's browns. Escape, the
## close button or a click outside shuts it.

signal closed

## The fight's enemy (core/battle.gd b["enemy"]) and its shown hull.
var e: Dictionary = {}
var hp: float = 0.0
var portrait: Texture2D

const STATUS: Dictionary = {
	"weaken": ["Weakened", "#f0a05a", "deals %s less damage"],
	"feeble": ["Feeble", "#f47c7c", "takes %s more damage"],
	"marked": ["Marked", "#f43f5e", "marked for death: takes %s more damage from all sources"],
	"slowed": ["Slowed", "#8fb4e0", "%s slower (turn order)"],
	"silence": ["Silenced", "#c084fc", "special abilities are locked"],
	"corrode": ["Corroded", "#a3e635", "its shield takes %s more damage"],
	"fortify": ["Fortified", "#5eead4", "takes %s less damage"],
	"enrage": ["Enraged", "#fb923c", "deals %s more damage"],
	"regen": ["Mending", "#4ade80", "heals %s each round"],
}
const RESPONSE: Dictionary = { "brace": "a defensive one", "shield": "a defensive one", "snare": "a disrupting one", "heal": "a recovery one", "burst": "a heavy-hitting one" }

var _body: VBoxContainer


func _accent() -> Color:
	if e.get("boss", false):
		return Color("#fbbf24")
	if e.get("elite", false):
		return Color("#c4b5fd")
	return Color("#c4a96a")


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var scrim: ColorRect = ColorRect.new()
	scrim.color = Color(0, 0, 0, 0.84)
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scrim.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
			_close())
	add_child(scrim)
	var vp: Vector2 = get_viewport_rect().size
	var w: float = 600.0
	var h: float = minf(vp.y - 72.0, 920.0)
	var card: Panel = Panel.new()
	var boss: bool = e.get("boss", false)
	card.add_theme_stylebox_override("panel", BattleLook.box(Color(0.11, 0.09, 0.078, 0.99), Color(_accent(), 0.6) if boss else Color(1, 1, 1, 0.08), 1, 20, 36.0, Color(0, 0, 0, 0.6)))
	card.size = Vector2(w, h)
	card.position = (vp - card.size) / 2.0
	card.clip_contents = true
	add_child(card)
	var sc: ScrollContainer = ScrollContainer.new()
	sc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	card.add_child(sc)
	var col: VBoxContainer = VBoxContainer.new()
	col.custom_minimum_size.x = w
	col.add_theme_constant_override("separation", 0)
	sc.add_child(col)
	var hero: Hero = Hero.new()
	hero.tex = portrait
	hero.accent = _accent()
	hero.pool = Color(0.98, 0.75, 0.14, 0.34) if boss else (Color(0.55, 0.36, 0.96, 0.42) if e.get("elite", false) else Color(0.25, 0.52, 0.63, 0.36))
	hero.eyebrow = "BOSS" if boss else ("ELITE" if e.get("elite", false) else "ENEMY")
	hero.title = str(e.get("name", ""))
	hero.custom_minimum_size = Vector2(w, 300)
	col.add_child(hero)
	var pad: MarginContainer = MarginContainer.new()
	for side: Array in [["left", 18], ["right", 18], ["top", 14], ["bottom", 20]]:
		pad.add_theme_constant_override("margin_" + side[0], side[1])
	col.add_child(pad)
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 14)
	pad.add_child(_body)
	_fill()
	# The close button, over the art.
	var x: CloseButton = CloseButton.new()
	x.position = Vector2(w - 46, 14)
	x.size = Vector2(32, 32)
	x.pressed.connect(_close)
	card.add_child(x)
	card.modulate.a = 0.0
	# As tall as what it says (up to the screen), centred.
	await get_tree().process_frame
	card.size.y = minf(h, col.get_combined_minimum_size().y)
	card.position = (vp - card.size) / 2.0
	card.scale = Vector2(0.97, 0.97)
	card.pivot_offset = card.size / 2.0
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(card, "modulate:a", 1.0, 0.18)
	tw.tween_property(card, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventKey and (ev as InputEventKey).pressed:
		get_viewport().set_input_as_handled()
		if (ev as InputEventKey).keycode == KEY_ESCAPE:
			_close()


func _close() -> void:
	closed.emit()
	queue_free()


# ── What the card says ────────────────────────────────────────────────────────

func _fill() -> void:
	var mn: float = float(e.get("min", 0.0))
	var mx: float = float(e.get("maxDmg", 0.0))
	var crit: float = float(e.get("crit", 0.0))
	var grid: GridContainer = GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	_body.add_child(grid)
	for r: Array in [
		["HP", "%d / %d" % [int(hp), int(e.get("max", 0.0))], "remaining / total hull", "#86efac"],
		["Damage", "%d–%d" % [int(mn), int(mx)], "per normal shot", "#f87171"],
		["Volley", "%d–%d" % [int(mn * 2.0), int(mx * 2.0)], "3-charge heavy shot", "#fb923c"],
		["Initiative", str(int(e.get("speed", 0.0))), "turn order", "#60a5fa"],
		["Crit Chance", "%d%%" % int(round(crit * 100.0)), "%d–%d on crit" % [int(floor(mn * 1.5)), int(floor(mx * 1.5))], "#fbbf24"],
	]:
		grid.add_child(_stat(r[0], r[1], r[2], Color(r[3])))
	var af: Dictionary = Js.obj(e.get("affix"))
	if not af.is_empty():
		_ability("ELITE AFFIX", Color("#a78bfa"), str(af.get("name", "")), str(af.get("description", "")), "affix")
	var dr: float = float(e.get("dr", 0.0))
	if dr > 0.0:
		var pct: int = int(round(dr * 100.0))
		_ability("ABILITY", Color("#7dd3fc"), "%s −%d%%" % [e.get("drName", "Carapace"), pct], "Soaks %d%% off your fire and graze hits. Volleys punch through it for full damage." % pct, "shield")
	if float(e.get("fog", 0.0)) > 0.0 and str(e.get("fogName", "")) != "":
		_ability("ABILITY", Color("#b0c4d8"), str(e["fogName"]), "Fog drifts across your aim bar, hiding the gold center. Lock through the mist by rhythm and timing.", "fog")
	if float(e.get("critDrift", 0.0)) > 0.0:
		_ability("ABILITY", Color("#f0c040"), str(e.get("critDriftName", "")) if str(e.get("critDriftName", "")) != "" else "Rolling Plate", "Its armor plating rolls as it fights: the gold critical seam wanders the whole target zone, even out into the gray fringe. Hitting the seam always crits, but chasing it into the fringe is a wager: miss it by a hair out there and you only graze.", "drift")
	if float(e.get("parry", 0.0)) > 0.0:
		_ability("COUNTER-ABILITY", Color("#f0c040"), str(e.get("parryName", "Riposte")), "Counters a dodged strike for %d%% of his damage roll, %d%% of the time. Firing into his dodge is never safe." % [int(round(float(e.get("parryPct", 0.0)) * 100.0)), int(round(float(e["parry"]) * 100.0))], "parry")
	if float(e.get("bite", 0.0)) > 0.0:
		_ability("ABILITY", Color("#f0715e"), "Shark's Bite", "When a shot lands on you, %d%% of the time it also tears a loaded cannonball off your rack. Dodging, bracing, or soaking it fully on shield spares the shot; a reload puts the cannonball back." % int(round(float(e["bite"]) * 100.0)), "bite")
	var sp: Dictionary = Js.obj(e.get("special"))
	if not sp.is_empty():
		_ability("SPECIAL", Color("#a78bfa"), str(sp.get("name", "")), _special_desc(sp), "special")
	var ul: Dictionary = Js.obj(e.get("ultimate"))
	if not ul.is_empty():
		_ability("ULTIMATE", Color("#fbbf24"), str(ul.get("name", "")), "At a full magazine it spends every cannonball at once for one massive blow, about %sx a normal shot. The pips glow full as the tell. Burn its charges down, brace, or shield before it fires." % str(Js.nz(ul.get("mult"), 2.6)), "ultimate")
	var tier: int = int(e.get("decoy", 0.0))
	if tier > 0:
		var shots: int = 3 + tier * 2
		_ability("ABILITY", Color("#fb923c"), "Signal Flares", "Every few turns a screen of %d false flares goes up. Swat each amber flare before its fuse burns out. Every one you let through chips your hull.%s" % [shots, " Some glow red: those are live shells, so let them fizzle. Swatting a red flare hurts worse than missing an amber one." if tier >= 3 else ""], "flares")
	_phases()
	_now()
	_eyebrow("BEHAVIOR", BattleLook.MUTED)
	Kit.text(_body, _behavior(), "small", BattleLook.CREAM, true)


func _stat(label: String, value: String, hint: String, c: Color) -> Control:
	var p: PanelContainer = PanelContainer.new()
	var sb: StyleBoxFlat = BattleLook.box(Color(1, 1, 1, 0.035), Color(0, 0, 0, 0), 0, 12).duplicate()
	sb.border_width_left = 3
	sb.border_color = c
	sb.content_margin_left = 12
	sb.content_margin_right = 10
	sb.content_margin_top = 9
	sb.content_margin_bottom = 9
	p.add_theme_stylebox_override("panel", sb)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	p.add_child(v)
	Kit.text(v, label, "small", c)
	var val: Label = Kit.text(v, value, "title", BattleLook.CREAM)
	val.add_theme_font_size_override("font_size", 20)
	Kit.text(v, hint, "note", BattleLook.MUTED)
	return p


func _eyebrow(t: String, c: Color) -> void:
	Kit.text(_body, t, "eyebrow", c)


## A titled box: the kind's glyph in a square of its colour, its name, what it
## does.
func _ability(eyebrow: String, c: Color, name: String, desc: String, glyph: String) -> void:
	var holder: VBoxContainer = VBoxContainer.new()
	holder.add_theme_constant_override("separation", 6)
	_body.add_child(holder)
	Kit.text(holder, eyebrow, "eyebrow", c)
	holder.add_child(_row(c, name, desc, glyph, ""))


func _row(c: Color, name: String, desc: String, glyph: String, aside: String) -> Control:
	var p: PanelContainer = PanelContainer.new()
	var sb: StyleBoxFlat = BattleLook.box(Color(c, 0.07), Color(c, 0.28), 1, 12).duplicate()
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	p.add_theme_stylebox_override("panel", sb)
	var hb: HBoxContainer = HBoxContainer.new()
	hb.add_theme_constant_override("separation", 10)
	p.add_child(hb)
	var g: Glyph = Glyph.new()
	g.kind = glyph
	g.col = c
	g.custom_minimum_size = Vector2(34, 34)
	g.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	hb.add_child(g)
	var v: VBoxContainer = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 2)
	hb.add_child(v)
	var nl: Label = Kit.text(v, name + aside, "body_strong", c.lightened(0.15))
	nl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	Kit.text(v, desc, "small", Color(BattleLook.CREAM, 0.78), true)
	return p


func _phases() -> void:
	var ph: Array = Js.list(e.get("phases"))
	if ph.is_empty():
		return
	var holder: VBoxContainer = VBoxContainer.new()
	holder.add_theme_constant_override("separation", 6)
	_body.add_child(holder)
	Kit.text(holder, "PHASES  ·  %d" % (ph.size() + 1), "eyebrow", BattleLook.FOE)
	Kit.text(holder, "This boss falls, then rises again, meaner each time. Watch for a telegraphed move and answer it in time.", "small", Color(BattleLook.CREAM, 0.72), true)
	for i: int in ph.size():
		var p: Dictionary = Js.obj(ph[i])
		var line: String = "revives ~%d%% HP" % int(round(Js.num(p.get("revivePct")) * 100.0))
		if Js.num(p.get("damageMult")) > 1.0:
			line += "  ·  +%d%% damage" % int(round((Js.num(p["damageMult"]) - 1.0) * 100.0))
		var chk: Dictionary = Js.obj(p.get("check"))
		var desc: String = line
		if not chk.is_empty():
			var hint: String = str(chk.get("hint", ""))
			if hint == "":
				hint = _counter_cue(Js.list(chk.get("responses")))
			desc += "\nTelegraphed: “%s”  ·  %s\n%s" % [chk.get("name", ""), chk.get("telegraph", ""), hint]
		holder.add_child(_row(BattleLook.FOE, "Phase %d" % (i + 2), desc, "phase", ""))


## What is on it right now, each with what it means.
func _now() -> void:
	var items: Array = []
	var ag: Dictionary = Js.obj(e.get("aegis"))
	if not ag.is_empty():
		items.append([str(ag.get("name", "The Last Wall")), Color("#e8d8a8"), "A wall of iron and will stands between your guns and his hull. Single shots glance off it whole. If anything can bring it down in one stroke, it is everything you have, all at once.", -1])
	var st: Dictionary = Js.obj(e.get("statuses"))
	for id: String in st:
		var d: Array = STATUS.get(id, [id.capitalize(), "#c4a96a", "%s"])
		var m: float = Js.num(Js.obj(st[id]).get("mag"))
		var amt: String = ("%d%%" % int(round(m * 100.0))) if id not in ["slowed", "regen"] else str(int(m))
		items.append([d[0], Color(d[1]), (d[2] as String) % amt if (d[2] as String).contains("%s") else d[2], int(Js.num(Js.obj(st[id]).get("turns")))])
	var bn: Dictionary = Js.obj(e.get("burn"))
	if not bn.is_empty():
		items.append(["Ablaze", Color("#fb923c"), "Its hull is on fire. It loses %d HP at the end of each of its turns." % int(Js.num(bn.get("dmg"))), int(Js.num(bn.get("turns")))])
	if e.get("frozenNow", false) or Js.num(e.get("freeze")) > 0.0:
		items.append(["Frozen", Color("#7dd3fc"), "Iced over. Its next turn is skipped, and it cannot weave aside from your shots while frozen.", -1])
	var sn: Dictionary = Js.obj(e.get("snare"))
	if Js.num(sn.get("turns")) > 0.0:
		items.append(["Snared", Color("#d9b066"), "A snare fouls its rigging. Each time it tries to dodge, there is a chance the dodge fails and it must act instead.", int(Js.num(sn["turns"]))])
	if items.is_empty():
		return
	var holder: VBoxContainer = VBoxContainer.new()
	holder.add_theme_constant_override("separation", 6)
	_body.add_child(holder)
	Kit.text(holder, "RIGHT NOW" + ("  ·  %d" % items.size() if items.size() > 1 else ""), "eyebrow", Color("#c084fc"))
	for it: Array in items:
		var turns: int = it[3]
		holder.add_child(_row(it[1], it[0], it[2], "status", ("  ·  %d turn%s left" % [turns, "" if turns == 1 else "s"]) if turns > 0 else ""))


static func _special_desc(s: Dictionary) -> String:
	var turns: int = int(Js.nz(s.get("turns"), 2.0))
	var passes: int = int(Js.nz(s.get("aimPasses"), 2.0))
	var mag: float = Js.num(s.get("magnitude"))
	var pct: int = int(round(mag * 100.0))
	match str(s.get("aimAttack", "")):
		"decoys":
			return "Throws false gold across your aim bar for your next %d shots. Lock a decoy band and the shot misfires. Only the true mark scores." % passes
		"hardened":
			return "Plates your aim lock for your next %d shots, so it takes two taps to lock a shot instead of one." % passes
		"squall":
			return "Gusts your aim needle mid-sweep for your next %d shots, dragging the mark off line as you aim." % passes
	match str(s.get("status", "")):
		"fortify":
			return "Braces behind its own plating, taking %d%% less damage for %d turns. Wait out the braced window, or burst straight through it." % [pct, turns]
		"slowed":
			return "Fouls your rudder: -%d speed for %d turns, so you lose turn-order rolls and slip fewer shots." % [int(mag), turns]
		"weaken":
			return "Files down your guns: your shots deal %d%% less damage for %d turns." % [pct, turns]
		"feeble":
			return "Splits your seams: you take %d%% more damage for %d turns." % [pct, turns]
		"regen":
			return "Closes its own wounds, healing %d HP a turn for %d turns. Punish it with fast, heavy hits, not a slow trade." % [int(mag), turns]
		"silence":
			return "Silences your crew, locking their abilities for %d turns." % turns
	return str(s.get("line", ""))


static func _counter_cue(responses: Array) -> String:
	var cats: Array = []
	for r: Variant in responses:
		var c: String = str(RESPONSE.get(str(r), ""))
		if c != "" and not cats.has(c):
			cats.append(c)
	if cats.size() >= 4:
		return "Fire ANY crew ability to answer him. Somebody has to act."
	return "Fire a crew ability to counter it: %s." % " or ".join(PackedStringArray(cats))


## The web's enemyBehaviorHint: honest about WHAT it does, fuzzy about when.
func _behavior() -> String:
	var pat: Array = Js.list(e.get("pattern"))
	var n: int = maxi(1, pat.size())
	var c: Dictionary = { "reload": 0, "fire": 0, "volley": 0, "dodge": 0 }
	for a: Variant in pat:
		if c.has(str(a)):
			c[str(a)] = int(c[str(a)]) + 1
	var shots: int = int(c["fire"]) + int(c["volley"])
	var parts: Array = []
	if int(c["volley"]) >= 2:
		parts.append("Volley-happy. Lands more than one heavy volley a cycle.")
	elif int(c["volley"]) == 1:
		parts.append("Patient. Stacks charges, then lands a heavy volley." if int(c["reload"]) >= 2 else "Works a heavy volley in among its shots.")
		if int(c["fire"]) >= 3:
			parts.append("Trades shots freely in between.")
	elif shots > int(c["reload"]):
		parts.append("Aggressive. Trades shots constantly.")
	elif int(c["reload"]) > shots:
		parts.append("Methodical. Long reloads between strikes.")
	else:
		parts.append("Steady rhythm. Trades shot for shot.")
	if float(c["dodge"]) / float(n) >= 0.25 or int(c["dodge"]) >= 3:
		parts.append("Slippery, and weaves aside often.")
	return " ".join(PackedStringArray(parts))


# ── Its pieces ────────────────────────────────────────────────────────────────

## The portrait, first: the whole painting fitted on a pool of its colour,
## a shade up the foot, its rank and name set on it.
class Hero:
	extends Control
	var tex: Texture2D
	var pool: Color
	var accent: Color
	var eyebrow: String = ""
	var title: String = ""

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var g: Texture2D = Glow.radial(128, pool)
		if g != null:
			draw_texture_rect(g, Rect2(r.size.x * 0.12, r.size.y * 0.02, r.size.x * 0.76, r.size.y * 0.8), false)
		if tex != null:
			var box: Vector2 = Vector2(r.size.x - 40.0, r.size.y - 12.0)
			var sc: float = minf(box.x / float(tex.get_width()), box.y / float(tex.get_height()))
			var ts: Vector2 = tex.get_size() * sc
			draw_texture_rect(tex, Rect2(Vector2((r.size.x - ts.x) / 2.0, r.size.y - ts.y), ts), false)
		var base: Color = Color(0.11, 0.09, 0.078)
		var top: float = r.size.y * 0.54
		draw_polygon(PackedVector2Array([Vector2(0, top), Vector2(r.size.x, top), Vector2(r.size.x, r.size.y), Vector2(0, r.size.y)]),
			PackedColorArray([Color(base, 0.0), Color(base, 0.0), Color(base, 1.0), Color(base, 1.0)]))
		draw_string(Kit.font("karla", 800), Vector2(18, r.size.y - 44), eyebrow, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, accent)
		var f: Font = Kit.font("cinzel", 700)
		draw_string_outline(f, Vector2(18, r.size.y - 14), title, HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 36, 26, 8, Color(0, 0, 0, 0.5))
		draw_string(f, Vector2(18, r.size.y - 14), title, HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 36, 26, BattleLook.CREAM)


## A flat glyph in a square of its colour.
class Glyph:
	extends Control
	var kind: String = ""
	var col: Color = Color.WHITE

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		BattleLook.draw_box(self, r, BattleLook.box(Color(col, 0.12), Color(col, 0.3), 1, 9))
		var c: Vector2 = r.get_center()
		var s: float = 9.0
		match kind:
			"shield":
				draw_colored_polygon(PackedVector2Array([c + Vector2(-s * 0.8, -s * 0.8), c + Vector2(s * 0.8, -s * 0.8), c + Vector2(s * 0.8, 0), c + Vector2(0, s), c + Vector2(-s * 0.8, 0)]), col)
			"fog":
				for k: int in 3:
					var y: float = c.y - s * 0.55 + k * s * 0.55
					var pl: PackedVector2Array = PackedVector2Array()
					for j: int in 9:
						pl.append(Vector2(c.x - s + j * s / 4.0, y + sin(j * 1.2 + k) * 1.6))
					draw_polyline(pl, Color(col, 0.6 + 0.2 * k), 1.6, true)
			"drift":
				BattleLook.knot(self, c, s, col, col)
				draw_line(c + Vector2(-s, s * 0.9), c + Vector2(s, s * 0.9), Color(col, 0.6), 1.4)
			"parry":
				draw_line(c + Vector2(-s, -s), c + Vector2(s, s), col, 2.2, true)
				draw_line(c + Vector2(s, -s), c + Vector2(-s, s), col, 2.2, true)
			"bite":
				var pts: PackedVector2Array = PackedVector2Array([c + Vector2(-s, -s * 0.5)])
				for k: int in 4:
					pts.append(c + Vector2(-s + (k + 0.5) * s / 2.0, s * 0.5))
					pts.append(c + Vector2(-s + (k + 1) * s / 2.0, -s * 0.5))
				draw_polyline(pts, col, 2.0, true)
			"special", "affix":
				BattleLook.icon(self, "mega", c, s, col)
			"ultimate":
				BattleLook.icon(self, "volley", c, s, col)
			"flares":
				for k: int in 5:
					var a: float = TAU * k / 5.0 - PI / 2.0
					draw_circle(c + Vector2(cos(a), sin(a)) * s * 0.65, 2.4, col)
			"phase":
				draw_arc(c, s * 0.75, 0.0, TAU, 24, col, 2.0, true)
				draw_circle(c, s * 0.3, col)
			_:
				draw_circle(c, s * 0.45, col)


## The X in a dark disc, top right.
class CloseButton:
	extends Button
	func _init() -> void:
		flat = true
		focus_mode = Control.FOCUS_NONE
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

	func _draw() -> void:
		var c: Vector2 = size / 2.0
		draw_circle(c, size.x / 2.0, Color(0, 0, 0, 0.55 if not is_hovered() else 0.75))
		draw_arc(c, size.x / 2.0, 0.0, TAU, 32, Color(1, 1, 1, 0.14), 1.0, true)
		var s: float = size.x * 0.2
		draw_line(c + Vector2(-s, -s), c + Vector2(s, s), Color(1, 1, 1, 0.8), 2.0, true)
		draw_line(c + Vector2(s, -s), c + Vector2(-s, s), Color(1, 1, 1, 0.8), 2.0, true)

	func _process(_d: float) -> void:
		queue_redraw()
