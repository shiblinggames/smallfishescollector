extends RefCounted
## Part of Locker (game/locker.gd): THE LOADOUT tab and the slot data behind
## it. The slots (Rod, Bait, Special, Look, Hat, Pet; the Boat tab reads the
## same data for the hull); what you own as tiles, hover to try it on the real
## boat, press to wear it; and for rods and bait what they do to the dial
## against what you have now, on a small painted dial (ZoneGauge moved with it).
##
## The slot data (options, worn, name_for, look_with, equip, HOW_TO_GET) takes
## a Session and no Locker, so the Shipyard's "Your rig" tab (LoadoutView)
## reads the same lists and wears things through the same calls: the two
## screens were once two copies and drifted. The tab's builders take the
## Locker as their first parameter; its state stays on the Locker.
## Split out of game/locker.gd on 2026-10-10 for size.

const SLOTS: Array = [["rod", "Rod"], ["bait", "Bait"], ["special", "Special"], ["skin", "Look"], ["hat", "Hat"], ["pet", "Pet"]]
## Where to get more, per slot. "boat" is read by the Shipyard's rig tab (the
## Locker's Boat tab has its own line).
const HOW_TO_GET: Dictionary = {
	"rod": "New rods are sold at the Tackle Shop. Stronger ones unlock as your Fishing level climbs.",
	"bait": "Bait is sold at the Tackle Shop, by the traders out on the water, and found in crates.",
	"skin": "Looks unlock with achievement points (see the Fishing Guide), and come from nowhere else.",
	"hat": "Hats are bought with doubloons. A few only come out of crates.",
	"boat": "Boats come only from fishing crates.",
	"pet": "Pets come out of supply crates.",
	"special": "One special rides with you. The Auto Caster is sold at the Tackle Shop; the others come back from voyages.",
}


# ── The slot data (shared with LoadoutView) ────────────────────────────────────

## The name of what is worn in a slot. bait_id is the bait on the line (the
## HUD's), read only for the bait slot.
static func name_for(session: Session, s: String, bait_id: String) -> String:
	var p: Dictionary = session.profile()
	match s:
		"rod":
			return String(Rules.rod(Js.num(p.get("rod_tier")))["name"])
		"bait":
			return String(Rules.bait(bait_id).get("name", "None"))
		"hat":
			return String(Skipper._find("hats", p.get("equipped_hat")).get("name", "None"))
		"boat":
			return String(Skipper._find("boats", p.get("equipped_boat")).get("name", "Default"))
		"pet":
			return String(Skipper._find("pets", p.get("equipped_pet")).get("name", "None"))
		"special":
			var sid: Variant = p.get("equipped_special")
			return "None" if sid == null else str(special_def(str(sid), p).get("name", sid))
		"skin":
			for c: Dictionary in Rules.data()["characterColors"]:
				if c["id"] == str(Js.nz(p.get("character_color"), "default")):
					return c["name"]
			return "Default"
	return ""


## What this captain owns for a slot: [id, name, art, pigment, corner note]
## (null id = none). Art "look:<id>" is a captain colour (Skipper.look_art).
static func options(session: Session, s: String) -> Array:
	var p: Dictionary = session.profile()
	var out: Array = []
	var sea_blue: Color = Color(0.32, 0.5, 0.6)
	match s:
		"rod":
			var tiers: Array = [0.0] + session.store.held_rod_tiers(session.uid)
			# In the ladder's order, not the save's (a converted web captain's
			# rods came in the order they were bought).
			tiers.sort()
			for t: Variant in tiers:
				var r: Dictionary = Rules.rod(float(t))
				out.append([float(t), r["name"], "%s_thumb.png" % r.get("slug", ""), Paper.rarity(1.0 + minf(4.0, float(t) / 2.0)), ""])
		"bait":
			for b: Array in session.baits():
				var def: Dictionary = Rules.bait(b[0])
				out.append([b[0], b[1], str(def.get("imageUrl", "")), Color(str(def.get("color", "#5f9fb0"))).darkened(0.15), "×" + Js.thousands(float(b[2]))])
		"skin":
			var owned: Array = Js.list(p.get("unlocked_character_colors"))
			for c: Dictionary in Rules.data()["characterColors"]:
				if c["free"] or Js.includes(owned, c["id"]):
					out.append([c["id"], c["name"], "look:" + str(c["id"]), sea_blue, ""])
		"hat":
			out.append([null, "No hat", "", Paper.INK_FAINT, ""])
			for id: Variant in Js.list(p.get("unlocked_hats")):
				var h: Dictionary = Skipper._find("hats", id)
				if not h.is_empty():
					out.append([id, h["name"], h["restImageUrl"], Color(0.7, 0.48, 0.3), ""])
		"boat":
			for id: Variant in Js.list(p.get("unlocked_boats")):
				var b: Dictionary = Skipper._find("boats", id)
				if not b.is_empty():
					out.append([id, b["name"], b["restImageUrl"], sea_blue, ""])
		"special":
			out.append([null, "No special", "", Paper.INK_FAINT, ""])
			# The Sunken Hand's slot, beside the first: the Primeval Eye alone.
			if p.get("has_anglers_patience") == true and (p.get("finn_spoil_free") == "fishing" or p.get("finn_spoil_paid") == "fishing"):
				var eye: Dictionary = special_def("anglers_patience", p)
				out.append(["anglers_patience", eye["name"], str(eye.get("image", "")), Color(str(eye.get("color", "#c4a96a"))).darkened(0.2), "Seated" if p.get("equipped_special_2") == "anglers_patience" else "Hand's slot"])
			for d: Dictionary in Rules.data()["specialItems"]:
				if d["finaleSlotOnly"] or d["id"] == "auto_catcher":
					continue
				if p.get((Rules.data()["specialOwnedColumn"] as Dictionary)[d["id"]]) != true:
					continue
				var e: Dictionary = special_def(str(d["id"]), p)
				out.append([d["id"], e["name"], str(e.get("image", "")), Color(str(e.get("color", "#9aa3ad"))).darkened(0.2), ""])
		"pet":
			out.append([null, "No pet", "", Paper.INK_FAINT, ""])
			for id: Variant in Js.list(p.get("unlocked_pets")):
				var pt: Dictionary = Skipper._find("pets", id)
				if not pt.is_empty():
					out.append([id, pt["name"], pt["restImageUrl"], Color(0.4, 0.58, 0.4), ""])
	return out


## A special as shown (content/port_rules.json specialInfo over the rules):
## the Auto Caster wears the Auto Catcher's name once it is upgraded.
static func special_def(id: String, p: Dictionary) -> Dictionary:
	if id == "auto_caster" and p.get("has_auto_catcher") == true:
		id = "auto_catcher"
	var out: Dictionary = {}
	for d: Dictionary in Rules.data()["specialItems"]:
		if d["id"] == id:
			out = d.duplicate()
	out.merge(Js.obj(Js.obj(Rules.data().get("specialInfo")).get(id)), true)
	return out


## The id worn in a slot. bait_id as name_for.
static func worn(session: Session, s: String, bait_id: String) -> Variant:
	var p: Dictionary = session.profile()
	match s:
		"rod":
			return Js.num(p.get("rod_tier"))
		"bait":
			return bait_id
		"skin":
			return str(Js.nz(p.get("character_color"), "default"))
		"hat":
			return p.get("equipped_hat")
		"boat":
			return p.get("equipped_boat")
		"pet":
			return p.get("equipped_pet")
		"special":
			var sid: Variant = p.get("equipped_special")
			return "auto_caster" if sid == "auto_catcher" else sid
	return null


## The captain's look with option o (an options() row) tried on; o empty is
## the look as worn. Bait and specials change nothing on her.
static func look_with(session: Session, s: String, o: Array) -> Dictionary:
	var look: Dictionary = Skipper.look_of(session.profile())
	if not o.is_empty():
		match s:
			"rod":
				look["rodSlug"] = Rules.rod(float(o[0])).get("slug")
			"skin":
				look["color"] = o[0]
			"hat":
				look["hat"] = o[0]
			"boat":
				look["boat"] = o[0]
			"pet":
				look["pet"] = o[0]
	return look


## Wears id in a slot through the rules (every slot but bait, which is the
## HUD's and never a rule call). Returns the action's result.
static func equip(session: Session, s: String, id: Variant) -> Dictionary:
	var r: Dictionary = {}
	match s:
		"rod":
			r = await session.act("equipTackleRod", [float(id)])
		"skin":
			r = await session.act("updateCharacterColor", [id])
		"hat":
			r = await session.act("equipHat", [id])
		"boat":
			r = await session.act("equipBoat", [id])
		"pet":
			r = await session.act("equipPet", [id, "stern"])
		"special":
			if id == "anglers_patience":
				# Its own slot: press to seat it, again to take it out.
				var seated: bool = session.profile().get("equipped_special_2") == "anglers_patience"
				r = await session.act("equipSecondSpecial", [null if seated else id])
			else:
				r = await session.act("equipSpecialItem", [id])
	return r


# ── The Locker's tab ───────────────────────────────────────────────────────────

static func build(o: Locker) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 5)
	o._body.add_child(row)
	for s: Array in SLOTS:
		var b: Pane.PaneButton = Paper.tab(s[1], s[0] == o.slot, false)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func() -> void: o.pick_slot(s[0]))
		row.add_child(b)
	o._note = Paper.text(o._body, HOW_TO_GET[o.slot], "note", Paper.INK_SOFT, true)
	if o.slot == "rod" and o.line_out():
		o._note.text = "Rods stay put while a line is in the water. Bring it in to change rods."
		o._note.add_theme_color_override("font_color", Paper.RED)
	if o.slot == "bait" and o.line_out():
		o._note.text = "Bait goes on before the cast. Bring the line in to change it."
		o._note.add_theme_color_override("font_color", Paper.RED)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	o._body.add_child(scroll)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 4
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(grid)
	var on_now: Variant = worn(o.session, o.slot, o.hud._bait)
	var opts: Array = options(o.session, o.slot)
	if opts.is_empty():
		Paper.text(grid, "Nothing here yet.", "note", Paper.INK_SOFT)
	for op: Array in opts:
		var t: Paper.Tile = Paper.Tile.new()
		t.on = (op[0] == null and on_now == null) or (op[0] != null and on_now != null and str(op[0]) == str(on_now))
		t.label = op[1]
		t.art = (Skipper.look_art(str(op[2]).trim_prefix("look:")) if str(op[2]).begins_with("look:") else Skipper.tex(op[2])) if op[2] != "" else null
		t.pigment = op[3]
		t.corner = op[4]
		t.custom_minimum_size = Vector2(124, 124)
		t.mouse_entered.connect(func() -> void: try_on(o, op))
		t.focus_entered.connect(func() -> void: try_on(o, op))
		t.mouse_exited.connect(func() -> void: try_on(o, []))
		t.pressed.connect(func() -> void: choose(o, op[0]))
		grid.add_child(t)
	Paper.rule(o._body)
	o._trying = ["__"]
	o._compare = VBoxContainer.new()
	o._compare.add_theme_constant_override("separation", 3)
	o._compare.custom_minimum_size = Vector2(0, 176)
	o._body.add_child(o._compare)
	try_on(o, [])


## The real boat wears the thing under the pointer; the card and the dial
## say what it would change.
static func try_on(o: Locker, op: Array) -> void:
	if o._trying == op:
		return
	o._trying = op
	var trying: bool = not op.is_empty()
	var look: Dictionary = look_with(o.session, o.slot, op)
	if o.slot != "bait":
		o._wear(look)
		if trying and o.sea._boat.field != null:
			o.sea._boat.field.ring(o.sea._boat.position, 90.0, 0.9, 0.35)
	o._card_eyebrow.text = ("Trying on  ·  " if trying else "Wearing  ·  ") + slot_name(o.slot)
	o._card_title.text = op[1] if trying else name_for(o.session, o.slot, o.hud._bait)
	o._card_body.text = blurb(o, o.slot, op)
	fill_compare(o, op)


static func slot_name(s: String) -> String:
	for x: Array in SLOTS:
		if x[0] == s:
			return x[1]
	return s


static func blurb(o: Locker, s: String, op: Array) -> String:
	match s:
		"rod":
			var tier: float = float(op[0]) if not op.is_empty() else Js.num(o.session.profile().get("rod_tier"))
			return Kit.clean_copy(str(Rules.rod(tier).get("description", "")))
		"bait":
			var id: String = str(op[0]) if not op.is_empty() else o.hud._bait
			var bonus: float = Js.num(Rules.bait(id).get("catchZoneBonus"))
			return ("Widens the catch zone by %d°. A wider catch zone is an easier reel; nothing else changes." % int(bonus)) if bonus > 0 else "Plain bait. No change to the catch zone."
	if s == "special":
		var sid: Variant = (op[0] if not op.is_empty() else o.session.profile().get("equipped_special"))
		if sid == null:
			return "No special in the slot."
		var e: Dictionary = special_def(str(sid), o.session.profile())
		return "%s. %s" % [e.get("effect", ""), Kit.clean_copy(str(e.get("description", "")))]
	if s == "boat":
		return "A look, not a stat: her fittings are what make her faster. Boats come only from fishing crates."
	return "A look, not a stat. It changes how you appear on the water and nothing about the catch."


static func choose(o: Locker, id: Variant) -> void:
	var r: Dictionary = {}
	var session: Session = o.session
	var hud: FishingHud = o.hud
	var s: String = o.slot
	if (s == "rod" or s == "bait") and o.line_out():
		return
	if s == "bait":
		hud.set_bait(str(id))
		r = { "ok": true }
	else:
		r = await equip(session, s, id)
		if not is_instance_valid(o):
			return
	session.persist()
	if r.get("error") != null:
		hud.toast(str(r["error"]))
	Rumble.tap(10)
	if o.sea._boat.field != null:
		o.sea._boat.field.ring(o.sea._boat.position, 150.0, 1.3, 0.7)
	hud.refresh()
	o._trying = ["__"]
	o._show_tab("loadout")


# ── What it does to the dial ───────────────────────────────────────────────────

static func fill_compare(o: Locker, op: Array) -> void:
	if o._compare == null or not is_instance_valid(o._compare):
		return
	for c: Node in o._compare.get_children():
		c.queue_free()
	o._gauge = null
	if o.slot == "special":
		Paper.text(o._compare, "What it does", "eyebrow", Paper.INK_SOFT)
		Paper.text(o._compare, "A special works beside your rod and bait; it never changes the dial itself.", "note", Paper.INK_SOFT, true)
		streak_line(o)
		return
	if o.slot != "rod" and o.slot != "bait":
		Paper.text(o._compare, "On the dial", "eyebrow", Paper.INK_SOFT)
		Paper.text(o._compare, "Looks never touch the catch. Rods and bait do: pick one of those to see how.", "note", Paper.INK_SOFT, true)
		streak_line(o)
		return
	var p: Dictionary = o.session.profile()
	var effects: Variant = p.get("completionist_effects")
	var my_rod: Dictionary = Rules.effective_rod(Js.num(p.get("rod_tier")), effects)
	var rod: Dictionary = my_rod
	var bait_id: String = o.hud._bait
	if not op.is_empty():
		if o.slot == "rod":
			rod = Rules.effective_rod(float(op[0]), effects)
		else:
			bait_id = str(op[0])
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	o._compare.add_child(row)
	o._gauge = ZoneGauge.new()
	o._gauge.custom_minimum_size = Vector2(168, 168)
	o._gauge.now_zones = zones_for(o, my_rod, o.hud._bait)
	o._gauge.zones = zones_for(o, rod, bait_id)
	row.add_child(o._gauge)
	var v: VBoxContainer = VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 2)
	row.add_child(v)
	Paper.text(v, "On the dial, for a middling bite", "eyebrow", Paper.INK_SOFT)
	var my_bait: float = Js.num(Rules.bait(o.hud._bait).get("catchZoneBonus"))
	var bait: float = Js.num(Rules.bait(bait_id).get("catchZoneBonus"))
	delta_row(v, "Catch zone, rod", Js.num(my_rod.get("catchZoneBonus")), Js.num(rod.get("catchZoneBonus")), "+%d°", true)
	delta_row(v, "Catch zone, bait", my_bait, bait, "+%d°", true)
	delta_row(v, "Perfect zone", Js.num(my_rod.get("perfectZoneBonus")), Js.num(rod.get("perfectZoneBonus")), "+%d°", true)
	var r0: float = Js.num(my_rod.get("retryOnMissChance"))
	var r1: float = Js.num(rod.get("retryOnMissChance"))
	if r0 > 0 or r1 > 0:
		delta_row(v, "Second chance on a miss", r0 * 100.0, r1 * 100.0, "%d%%", true)
	var x0: float = float(Js.nz(my_rod.get("perfectXpMult"), 1.0))
	var x1: float = float(Js.nz(rod.get("perfectXpMult"), 1.0))
	if x0 != 1.0 or x1 != 1.0:
		delta_row(v, "XP on a perfect", x0, x1, "×%.2f", true)
	if my_rod.get("snagImmune") == true or rod.get("snagImmune") == true:
		Paper.stat(v, "Snags", "Immune" if rod.get("snagImmune") == true else "Can snag", Paper.GREEN if rod.get("snagImmune") == true else Paper.RED)
	streak_line(o)


static func delta_row(parent: Node, label: String, was: float, now: float, fmt: String, more_is_better: bool) -> void:
	var tone: Color = Paper.INK
	var txt: String = fmt % now
	if now != was:
		var better: bool = (now > was) == more_is_better
		tone = Paper.GREEN if better else Paper.RED
		txt = "%s  →  %s" % [fmt % was, fmt % now]
	Paper.stat(parent, label, txt, tone)


static func streak_line(o: Locker) -> void:
	var n: int = int(Js.num(o.session.profile().get("current_perfect_streak")))
	var lvl: int = o.session.level()
	var t: String = ("Perfect streak running: %d, paying ×%.2f XP. It pays up to ×%.2f at 10." % [n, Rules.streak_mult(n, lvl), Rules.streak_mult(10, lvl)]) if n > 0 else ("No perfect streak running. Ten in a row pays ×%.2f XP at your level." % Rules.streak_mult(10, lvl))
	Paper.text(o._compare, t, "note", Paper.INK_SOFT, true)


static func zones_for(o: Locker, rod: Dictionary, bait_id: String) -> Array:
	var p: Dictionary = o.session.profile()
	var lines: Array = Rules.data()["lines"]
	var line: Dictionary = lines[clampi(int(Js.num(p.get("line_tier"))), 0, lines.size() - 1)]
	var level_bonus: float = Rules.level_catch_bonus(float(o.session.level())) + Js.num(Rules.bait(bait_id).get("catchZoneBonus")) + Js.num(rod.get("catchZoneBonus"))
	return Dial.build_zones(3.0, Js.num(p.get("hook_tier")), float(line["penaltyMultiplier"]), 1.0, level_bonus, Js.num(rod.get("perfectZoneBonus")) + 1.0)


## A SMALL PAINTED DIAL: the zones a middling bite would have with what you
## are trying, as watercolour on the ring, and where your catch zone ends now
## as two inked ticks, so a wider or narrower zone shows at a glance.
class ZoneGauge:
	extends Control
	var zones: Array = []
	var now_zones: Array = []
	var _t: float = 0.0

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _ang(deg: float) -> float:
		return deg_to_rad(deg - 90.0)

	func _catch_span(zs: Array) -> Vector2:
		var lo: float = 999.0
		var hi: float = -1.0
		for z: Array in zs:
			if z[2] == "catch" or z[2] == "perfect":
				lo = minf(lo, float(z[0]))
				hi = maxf(hi, float(z[1]))
		return Vector2(lo, hi)

	func _draw() -> void:
		var c: Vector2 = size / 2.0
		var r: float = minf(size.x, size.y) / 2.0 - 10.0
		draw_circle(c, r + 8.0, Color(Kit.PAPER.lightened(0.06), 0.95))
		draw_arc(c, r + 8.0, 0.0, TAU, 64, Color(Paper.INK, 0.5), 1.5, true)
		for z: Array in zones:
			var col: Color = Color(0.85, 0.82, 0.74, 0.5)
			match z[2]:
				"catch":
					col = Color(0.36, 0.62, 0.42, 0.85)
				"perfect":
					col = Color(0.88, 0.66, 0.2, 0.95)
				"penalty":
					col = Color(0.72, 0.3, 0.24, 0.55)
			var a0: float = _ang(float(z[0]))
			var a1: float = _ang(float(z[1]))
			if a1 > a0:
				draw_arc(c, r - 6.0, a0, a1, maxi(4, int((a1 - a0) * 20.0)), col, 12.0, true)
		for k: int in 36:
			var a: float = TAU * k / 36.0
			draw_line(c + Vector2.from_angle(a) * (r + 3.0), c + Vector2.from_angle(a) * (r + (7.0 if k % 3 == 0 else 5.0)), Color(Paper.INK, 0.45), 1.0, true)
		# Where your catch zone ends today.
		var now: Vector2 = _catch_span(now_zones)
		for d: float in [now.x, now.y]:
			var a: float = _ang(d)
			draw_line(c + Vector2.from_angle(a) * (r - 16.0), c + Vector2.from_angle(a) * (r + 6.0), Color(Paper.INK, 0.85), 2.0, true)
		# A slow needle so it reads as a dial.
		var na: float = _ang(fposmod(_t * 60.0, 360.0))
		draw_line(c, c + Vector2.from_angle(na) * (r - 12.0), Color(Paper.INK, 0.8), 2.0, true)
		draw_circle(c, 4.0, Paper.INK)
		var span: Vector2 = _catch_span(zones)
		var f: Font = Kit.font("cinzel", 700)
		var s: String = "%d°" % int(span.y - span.x)
		var w: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
		draw_string(f, c + Vector2(-w / 2.0, 34.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Paper.INK)
		var f2: Font = Kit.font("karla", 600)
		var s2: String = "catch zone"
		var w2: float = f2.get_string_size(s2, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		draw_string(f2, c + Vector2(-w2 / 2.0, 48.0), s2, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Paper.INK_SOFT)
