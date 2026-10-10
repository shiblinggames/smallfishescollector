extends RefCounted
## Part of Locker (game/locker.gd): THE CRATES tab. The row of crates, the
## chosen one's whole drop table and how much of it is collected, and opening
## one on the sea. Static helpers that take the Locker as their first
## parameter; the tab's state (_crate_sel, _opening) stays on the Locker.
## Split out of game/locker.gd on 2026-10-10 for size.

const TIER_ORDER: Array = ["wooden", "metal", "gold", "diamond", "ancient"]
const BAND_PIGMENT: Dictionary = { "common": Color(0.52, 0.5, 0.46), "uncommon": Color(0.3, 0.58, 0.36), "rare": Color(0.28, 0.46, 0.72), "epic": Color(0.55, 0.34, 0.7) }


static func stash(o: Locker) -> Dictionary:
	return Js.obj(o.session.profile().get("crate_stash"))


static func crate_count(o: Locker) -> int:
	var n: int = 0
	for k: Variant in stash(o):
		n += int(Js.num(stash(o)[k]))
	return n


## THE CRATES (Kong, 2026-10-01): every crate there is, with how many are
## stowed, and the chosen one's whole drop table: what is always inside (the
## doubloons and the bait, with their odds), every cosmetic it can hold (by
## band) and the pets in its own set, the ones you have in colour with a
## tick and the ones you lack in grey pencil, and how much of it you have
## collected. Collect everything a crate can give and it is complete.
static func build(o: Locker) -> void:
	var st: Dictionary = stash(o)
	if o._crate_sel == "":
		o._crate_sel = "wooden"
		for t: String in TIER_ORDER:
			if Js.num(st.get(t)) > 0.0:
				o._crate_sel = t
	# The crates, in a row.
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	o._body.add_child(row)
	for tier: String in TIER_ORDER:
		var t: Array = CrateMoment.TIERS[tier]
		var n: int = int(Js.num(st.get(tier)))
		var got: Array = collection(o, tier)
		var tile: Paper.Tile = Paper.Tile.new()
		tile.on = tier == o._crate_sel
		tile.label = str(t[0]).replace(" Crate", "").replace(" Chest", "")
		tile.art = CrateMoment._tex("%sclosed.png" % t[2])
		tile.pigment = Color(t[1]).darkened(0.2)
		tile.corner = ("×%d" % n) if n > 0 else ""
		tile.custom_minimum_size = Vector2(100, 104)
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tile.tooltip_text = "%s: %d of %d collected" % [t[0], got[0], got[1]]
		tile.pressed.connect(func() -> void:
			o._crate_sel = tier
			o._show_tab("crates"))
		row.add_child(tile)
	Paper.rule(o._body)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	o._body.add_child(scroll)
	var col: VBoxContainer = VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 8)
	scroll.add_child(col)
	table(o, col, o._crate_sel, int(Js.num(st.get(o._crate_sel))))


## [collected, total] of what a crate can give that can be collected.
static func collection(o: Locker, tier: String) -> Array:
	var have: int = 0
	var total: int = 0
	for e: Array in cosmetics(o, tier):
		total += 1
		if e[3]:
			have += 1
	for p: Array in pets(o, tier):
		total += 1
		if p[3]:
			have += 1
	return [have, total]


## The cosmetics a tier can hold: [entry, band, art, owned], best band first.
static func cosmetics(o: Locker, tier: String) -> Array:
	var c: Dictionary = Rules.data()["crate"]
	var bands: Dictionary = Js.obj(Js.obj(c.get("cosmeticBands")).get(tier))
	var rarity: Dictionary = Js.obj(c.get("cosmeticRarity"))
	var p: Dictionary = o.session.profile()
	var out: Array = []
	if float(Js.nz((c["outcomeWeights"][tier] as Dictionary).get("cosmetic"), 0.0)) <= 0.0:
		return out
	for e: Dictionary in c["cosmeticPool"]:
		var band: String = str(rarity.get("%s:%s" % [e["kind"], e["id"]], "common"))
		if not rarity.is_empty() and float(bands.get(band, 0.0)) <= 0.0:
			continue
		var owned: bool
		var art: Texture2D
		match e["kind"]:
			"skin":
				owned = Js.includes(Js.list(p.get("unlocked_character_colors")), e["id"])
				art = Skipper.look_art(e["id"])
			"boat":
				owned = Js.includes(Js.list(p.get("unlocked_boats")), e["id"])
				art = Skipper.tex(e.get("imageUrl"))
			_:
				owned = Js.includes(Js.list(p.get("unlocked_hats")), e["id"])
				art = Skipper.tex(e.get("imageUrl"))
		out.append([e, band, art, owned])
	var order: Array = ["epic", "rare", "uncommon", "common"]
	out.sort_custom(func(a: Array, b: Array) -> bool: return order.find(a[1]) < order.find(b[1]))
	return out


## The pets a crate can hold (its own set, content/port_rules.json; every
## crate-borne pet without one): [pet, species, art, owned].
static func pets(o: Locker, tier: String) -> Array:
	var owned: Array = Js.list(o.session.profile().get("unlocked_pets"))
	var own: Array = Js.list(Js.obj(Rules.data()["crate"].get("petTiers")).get(tier))
	var out: Array = []
	for pt: Dictionary in Rules.data()["pets"]:
		if pt["earnedOnly"]:
			continue
		if not own.is_empty() and not Js.includes(own, pt["id"]):
			continue
		out.append([pt, pt["species"], trimmed(Skipper.tex(pt["restImageUrl"])), Js.includes(owned, pt["id"])])
	return out


static var _trims: Dictionary = {}


## A picture cut to where it is painted (the pet sheets are mostly margin).
static func trimmed(t: Texture2D) -> Texture2D:
	if t == null:
		return null
	if _trims.has(t.resource_path):
		return _trims[t.resource_path]
	var img: Image = t.get_image()
	var out: Texture2D = t
	if img != null:
		if img.is_compressed():
			img.decompress()
		var r: Rect2i = img.get_used_rect()
		if r.size.x > 0:
			var at: AtlasTexture = AtlasTexture.new()
			at.atlas = t
			at.region = Rect2(r).grow(4.0)
			out = at
	_trims[t.resource_path] = out
	return out


static func table(o: Locker, col: VBoxContainer, tier: String, stowed: int) -> void:
	var c: Dictionary = Rules.data()["crate"]
	var t: Array = CrateMoment.TIERS[tier]
	var got: Array = collection(o, tier)
	var head: HBoxContainer = HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	col.add_child(head)
	var tv: VBoxContainer = VBoxContainer.new()
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tv.add_theme_constant_override("separation", 0)
	head.add_child(tv)
	Paper.text(tv, t[0], "title", Paper.INK)
	var waters: Array = []
	for h: String in ["shallows", "open_waters", "deep", "abyss", "ancient_deep"]:
		if float(Js.nz((Rules.data()["zones"]["crateTiers"][h] as Dictionary).get(tier), 0.0)) > 0.0:
			for w: Dictionary in Chart.WATERS:
				if w["id"] == h:
					waters.append(w["name"])
	Paper.text(tv, ("Comes up in %s" % ", ".join(PackedStringArray(waters))) if not waters.is_empty() else "Does not come up anywhere", "note", Paper.INK_SOFT)
	if got[0] >= got[1] and got[1] > 0:
		var done_l: Label = Paper.text(head, "Complete", "title", Paper.RED)
		done_l.rotation_degrees = -6.0
	if stowed > 0:
		var b: Pane.PaneButton = Paper.button("Open one  ·  %d stowed" % stowed, true)
		b.custom_minimum_size = Vector2(0, 38)
		b.disabled = o._opening
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void: open_crate(o, tier))
		head.add_child(b)
	# Collected.
	Paper.text(col, "Collected  %d of %d" % [got[0], got[1]], "value", Paper.INK)
	Locker._bar(col, float(got[0]) / maxf(1.0, float(got[1])), Paper.GREEN)
	# Always inside.
	var w: Dictionary = c["outcomeWeights"][tier]
	var tot: float = float(w["doubloons"]) + float(w["bait"]) + float(w["cosmetic"])
	var r: Array = c["doubloonRange"][tier]
	var baits: Array = []
	for b: Dictionary in c["baitPools"][tier]:
		baits.append(str(Rules.bait(b["type"]).get("name", b["type"])))
	Paper.text(col, "Inside", "eyebrow", Paper.INK_SOFT)
	Paper.stat(col, "Doubloons, %s to %s ⟡" % [Js.thousands(float(r[0])), Js.thousands(float(r[1]))], "%d%%" % int(round(100.0 * float(w["doubloons"]) / tot)))
	Paper.stat(col, "%d bait: %s" % [int(c["baitQty"][tier]), ", ".join(PackedStringArray(baits))], "%d%%" % int(round(100.0 * float(w["bait"]) / tot)))
	Paper.stat(col, "A cosmetic you do not have yet", ("%d%%" % int(round(100.0 * float(w["cosmetic"]) / tot))) if float(w["cosmetic"]) > 0.0 else "None")
	Paper.stat(col, "A pet, as well as the rest", "%s%%" % str(snappedf(float(c["petChance"][tier]) * 100.0, 0.1)))
	# What can be collected.
	var cos: Array = cosmetics(o, tier)
	if not cos.is_empty():
		Paper.text(col, "Cosmetics it can hold", "eyebrow", Paper.INK_SOFT)
		var g: GridContainer = GridContainer.new()
		g.columns = 4
		g.add_theme_constant_override("h_separation", 8)
		g.add_theme_constant_override("v_separation", 6)
		col.add_child(g)
		for e: Array in cos:
			var tile: Paper.Tile = Paper.Tile.new()
			tile.label = str((e[0] as Dictionary)["name"])
			tile.art = e[2]
			tile.grey = not e[3]
			tile.pigment = BAND_PIGMENT.get(e[1], Color(0.5, 0.5, 0.5))
			tile.corner = "✓" if e[3] else str(e[1]).capitalize()
			tile.custom_minimum_size = Vector2(124, 112)
			tile.tooltip_text = "%s  ·  %s  ·  %s" % [(e[0] as Dictionary)["name"], str(e[1]).capitalize(), "collected" if e[3] else "not yet"]
			g.add_child(tile)
	Paper.text(col, "Pets it can hold", "eyebrow", Paper.INK_SOFT)
	var pg: GridContainer = GridContainer.new()
	pg.columns = 5
	pg.add_theme_constant_override("h_separation", 6)
	pg.add_theme_constant_override("v_separation", 6)
	col.add_child(pg)
	for pe: Array in pets(o, tier):
		var tile: Paper.Tile = Paper.Tile.new()
		tile.label = str((pe[0] as Dictionary)["name"])
		tile.art = pe[2]
		tile.grey = not pe[3]
		tile.pigment = Color(str((pe[0] as Dictionary).get("accentColor", "#7a9a8a"))).darkened(0.2)
		tile.corner = "✓" if pe[3] else ""
		tile.custom_minimum_size = Vector2(96, 96)
		tile.tooltip_text = "%s  ·  %s" % [(pe[0] as Dictionary)["name"], "collected" if pe[3] else "not yet"]
		pg.add_child(tile)


static func open_crate(o: Locker, tier: String) -> void:
	if o._opening:
		return
	o._opening = true
	var hud: FishingHud = o.hud
	var r: Dictionary = await o.session.act("openCrate", [tier])
	if not is_instance_valid(o):
		return
	o.session.persist()
	if r.has("error"):
		hud.toast(str(r["error"]))
		o._opening = false
		return
	var cs: CrateSurface = CrateSurface.new()
	cs.tier = tier
	cs.mode = "open"
	cs.loot = r
	cs.boat = o.sea._boat
	cs.side = -1.0
	o.sea._boat.get_parent().add_child(cs)
	o._show_tab("crates")
	after_crate(cs, hud, r, o)


## Waits out the crate on the sea, then posts what was found in it. Static, and
## nothing here runs on the Locker unless it is still open: the Locker can be
## shut (Esc, I) while the crate plays, and a coroutine on a freed Locker would
## be dropped with the notices unsent.
static func after_crate(cs: CrateSurface, h: FishingHud, r: Dictionary, lk: Locker) -> void:
	await cs.done
	if is_instance_valid(lk):
		lk._opening = false
	if not is_instance_valid(h):
		return
	# A notice for the Crew Hall in the crate (port rules, core/crew.gd).
	for nt: Variant in Js.obj(r.get("notices")):
		h.notify("FOUND IN THE CRATE", "A %s" % Js.obj(Crew.notice_defs().get(nt)).get("name", nt), "Post it at the Crew Hall for a fresh board of hopefuls.", Skipper.tex("crew/hall_1.png"))
	# A skin voucher (core/skins.gd): opened in the Crew Hall's Trunk.
	for kv: Variant in Js.obj(r.get("vouchers")):
		var vd: Dictionary = Skins.kind_def(str(kv))
		Sound.chest(kv == "captain")
		h.notify("FOUND IN THE CRATE", "A %s!" % vd.get("name", kv), "Open it in the Crew Hall's Trunk for a crew skin you do not own yet.", Skipper.tex(str(vd.get("art", ""))))
	h.refresh()
	if is_instance_valid(lk) and lk.is_inside_tree() and lk.tab == "crates":
		lk._show_tab("crates")
