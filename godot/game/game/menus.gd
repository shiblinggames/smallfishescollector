class_name Menus
extends RefCounted
## THE ROD'S MENUS (Godot port of the bottom row in app/(app)/sea/FishingHere.tsx
## and its sheets, fishing pass 3): Bait, the Hold, and the Loadout. The Log
## opens the Almanac.


## BAIT: every bait held, its catch-zone bonus, and the one on the line.
static func bait_sheet(session: Session, current: String, on_pick: Callable) -> Sheet:
	var s: Sheet = Sheet.new()
	s.title = "Bait"
	s.blurb = "A wider catch zone is an easier reel. Nothing else changes."
	s.ready.connect(func() -> void:
		for b: Array in session.baits():
			var def: Dictionary = Rules.bait(b[0])
			var on: bool = b[0] == current
			var teal: Color = Color("#67d4e8")
			var rs: Dictionary = Kit.row(0)
			if on:
				rs["fill"] = [Color(teal, 0.14)]
				rs["border"] = [1, Color(teal, 0.55)]
			var rh: Dictionary = rs.duplicate()
			rh["border"] = [1, Color(teal, 0.7) if on else Color(1, 1, 1, 0.24)]
			var row: Pane.PaneButton = Pane.PaneButton.new(rs, rh)
			row.custom_minimum_size = Vector2(0, 58)
			var h: HBoxContainer = HBoxContainer.new()
			h.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			h.offset_left = 12
			h.offset_right = -14
			h.add_theme_constant_override("separation", 12)
			h.mouse_filter = Control.MOUSE_FILTER_IGNORE
			row.add_child(h)
			Kit.art(h, def.get("imageUrl"), Vector2(44, 44), Color(def.get("color", "#67d4e8")))
			var nv: VBoxContainer = VBoxContainer.new()
			nv.alignment = BoxContainer.ALIGNMENT_CENTER
			nv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			nv.add_theme_constant_override("separation", 0)
			nv.mouse_filter = Control.MOUSE_FILTER_IGNORE
			h.add_child(nv)
			Kit.text(nv, b[1], "name", teal if on else Kit.INK)
			var bonus: float = Js.num(def.get("catchZoneBonus"))
			Kit.text(nv, ("+%d° catch zone" % int(bonus)) if bonus > 0 else "No catch bonus", "small", Kit.GOOD if bonus > 0 else Kit.DIM)
			var count: Label = Kit.text(h, Js.thousands(float(b[2])), "number", Kit.INK_2)
			count.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			Kit.tap(row)
			row.pressed.connect(func() -> void:
				on_pick.call(b[0])
				s.close())
			s.body.add_child(row))
	return s


## THE HOLD: what is aboard, what it is worth, and where to sell it. Read-only.
static func hold_sheet(session: Session) -> Sheet:
	var s: Sheet = Sheet.new()
	var p: Dictionary = session.profile()
	var cap: float = float(Rules.fish_hold(Js.num(p.get("fish_hold_tier")))["capacity"])
	var count: float = session.store.hold_count(session.uid)
	s.title = "The hold"
	s.blurb = "%d of %d aboard." % [int(count), int(cap)]
	s.ready.connect(func() -> void:
		var frac: float = count / maxf(1.0, cap)
		Kit.bar(s.body, frac, Color("#f87171") if frac >= 0.9 else (Color("#e8b463") if frac >= 0.75 else Color("#5fb0c8")))
		var rows: Array = []
		var hold: Dictionary = session.save["hold"]
		for k: Variant in hold:
			var f: Variant = session.store.species(float(str(k)))
			if f == null or float(hold[k]) <= 0:
				continue
			rows.append({ "name": (f as Dictionary)["name"], "qty": float(hold[k]), "value": Js.num((f as Dictionary).get("sell_value")) * float(hold[k]) })
		if rows.is_empty():
			s.note("Empty. Every fish you catch goes in here until you sell it.")
		else:
			rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["value"]) > float(b["value"]))
			s.section("Aboard")
			var total: float = 0.0
			for r: Dictionary in rows:
				total += float(r["value"])
			for i: int in mini(5, rows.size()):
				var r: Dictionary = rows[i]
				s.stat("×%d  %s" % [int(r["qty"]), r["name"]], "%s ⟡" % Js.thousands(float(r["value"])))
			if rows.size() > 5:
				var rest_qty: float = 0.0
				var rest_val: float = 0.0
				for i: int in range(5, rows.size()):
					rest_qty += float(rows[i]["qty"])
					rest_val += float(rows[i]["value"])
				s.stat("×%d  %d more" % [int(rest_qty), rows.size() - 5], "%s ⟡" % Js.thousands(rest_val))
			s.stat("Worth at the Market", "%s ⟡" % Js.thousands(total), "good")
		s.section("Selling it")
		s.note("Sail it home to the Market on the Mainland for full price. Or sell to the buyer out in this water for a little less, 78 to 86%.")
		s.section("A bigger hold")
		var tiers: Array = Rules.data()["fishHoldTiers"]
		var at: int = clampi(int(Js.num(p.get("fish_hold_tier"))), 0, tiers.size() - 1)
		if at + 1 < tiers.size():
			var nxt: Dictionary = tiers[at + 1]
			s.note("The Shipyard sells the next size, %d fish, for ⟡ %s." % [int(nxt["capacity"]), Js.thousands(float(nxt["cost"]))])
		else:
			s.note("This is the biggest hold there is."))
	return s


## THE CREW PURSE (a Charter): one purse for the crew, and its ledger, newest
## first: who earned what, who spent what.
static func purse_sheet(session: Session) -> Sheet:
	var s: Sheet = Sheet.new()
	var crew: Dictionary = Js.obj(session.save.get("charter"))
	s.title = "The crew's purse"
	s.eyebrow = str(crew.get("name", "The Charter"))
	s.accent = Kit.GOLD
	s.blurb = "Every doubloon any of you earns goes in here, and every captain spends from it."
	s.ready.connect(func() -> void:
		var top: HBoxContainer = HBoxContainer.new()
		s.body.add_child(top)
		Kit.text(top, "In the purse", "small", Kit.DIM).size_flags_horizontal = Control.SIZE_EXPAND_FILL
		Kit.money(top, Js.num(session.profile().get("doubloons")), "price", false, "number")
		s.section("The ledger")
		var rows: Array = Js.list(crew.get("ledger")).duplicate()
		rows.reverse()
		if rows.is_empty():
			s.note("Nothing earned or spent yet.")
		for r: Dictionary in rows:
			var amt: float = float(r.get("amount", 0.0))
			Kit.stat_row(s.body, "%s  ·  %s" % [r.get("by", "?"), r.get("reason", "")], "%s%s ⟡" % ["+" if amt > 0 else "-", Js.thousands(absf(amt))], "good" if amt > 0 else "bad"))
	return s


## THE LOADOUT: try on and equip what you own (equip only, nothing is bought
## here), what your tackle does to the dial, and your perfect streak.
static func loadout_sheet(session: Session, line_out: bool, on_change: Callable) -> Sheet:
	var s: Sheet = Sheet.new()
	s.title = "Loadout"
	s.blurb = "What you sailed with, and what it is doing to the dial."
	s.wide = true
	s.ready.connect(func() -> void:
		var view: LoadoutView = LoadoutView.new()
		view.session = session
		view.line_out = line_out
		view.changed.connect(on_change)
		s.body.add_child(view)
		_dial_rows(s, session)
		_streak_rows(s, session)
		s.section("")
		s.note("You sailed with one rod. Reels, lines, hooks and the rack you carry are all set at the Shipyard before you leave."))
	return s


static func _dial_rows(s: Sheet, session: Session) -> void:
	var p: Dictionary = session.profile()
	var rod: Dictionary = Rules.effective_rod(Js.num(p.get("rod_tier")), p.get("completionist_effects"))
	var bait: Dictionary = Rules.bait(str(Js.nz(p.get("last_used_bait"), "worm")))
	var lines: Array = Rules.data()["lines"]
	var line: Dictionary = lines[clampi(int(Js.num(p.get("line_tier"))), 0, lines.size() - 1)]
	var reels: Array = Rules.data()["reels"]
	var reel: Dictionary = reels[clampi(int(Js.num(p.get("reel_tier"))), 0, reels.size() - 1)]
	s.section("On the dial")
	s.stat("Catch zone from the rod", "+%d°" % int(Js.num(rod.get("catchZoneBonus"))), "good")
	var bb: float = Js.num(bait.get("catchZoneBonus"))
	s.stat("Catch zone from the bait", ("+%d°" % int(bb)) if bb > 0 else "None")
	var pz: float = Js.num(rod.get("perfectZoneBonus"))
	s.stat("Perfect zone", ("+%d°" % int(pz)) if pz > 0 else "Standard")
	var ns: float = float(reel["needleSpeedMultiplier"])
	s.stat("Needle speed", "×%.2f%s" % [ns, " (slower)" if ns < 1.0 else ""], "good" if ns < 1.0 else "")
	var lp: float = float(line["penaltyMultiplier"])
	if lp != 1.0:
		s.stat("Miss penalty", "×%.2f" % lp, "good" if lp < 1.0 else "warn")
	var retry: float = Js.num(rod.get("retryOnMissChance"))
	if retry > 0:
		s.stat("Second chance on a miss", "%d%%" % int(Js.round(retry * 100.0)))
	if rod.get("snagImmune") == true:
		s.stat("Snags", "Immune")
	var pxm: float = float(Js.nz(rod.get("perfectXpMult"), 1.0))
	if pxm != 1.0:
		s.stat("XP on a perfect", "×%s" % str(pxm))


static func _streak_rows(s: Sheet, session: Session) -> void:
	var n: int = int(Js.num(session.profile().get("current_perfect_streak")))
	var lvl: int = session.level()
	s.section("Your perfect streak")
	s.stat(("Running now, %d perfect%s" % [n, "" if n == 1 else "s"]) if n > 0 else "Running now", ("×%.2f XP" % Rules.streak_mult(n, lvl)) if n > 0 else "None", "good" if n > 0 else "")
	s.stat("Held at 10, the most it pays", "×%.2f XP" % Rules.streak_mult(10, lvl), "good")
	s.note("It multiplies the fish you land, so it is worth the same in any water. One miss resets it. The ceiling grows as you level, up to ×%.2f at Fishing 100." % Rules.streak_mult(10, 100))
