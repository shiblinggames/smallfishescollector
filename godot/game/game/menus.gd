class_name Menus
extends RefCounted
## THE ROD'S MENUS (Godot port of the bottom row in app/(app)/sea/FishingHere.tsx
## and its sheets, fishing pass 3). Bait, the Hold and the Loadout moved into
## the Locker (game/locker.gd) on 2026-10-01; the crew's purse is left here.


## THE CREW PURSE (a Charter): one purse for the crew, and its ledger, newest
## first: who earned what, who spent what.
## THE CHARTER at sea: the crew's purse, a hardcore Charter's lives, the crew
## (the founder can hand the Charter to a crewmate aboard: `hand` takes their
## key and answers "" or why not; `aboard` is who is on the line now), and
## the ledger.
static func purse_sheet(session: Session, hand: Callable = Callable(), aboard: Array = []) -> Sheet:
	var s: Sheet = Sheet.new()
	var crew: Dictionary = Js.obj(session.save.get("charter"))
	s.title = "The Charter"
	s.eyebrow = str(crew.get("name", "The Charter"))
	s.accent = Kit.GOLD
	s.blurb = "Every doubloon any of you earns goes in the purse, and every captain spends from it."
	s.ready.connect(func() -> void:
		var top: HBoxContainer = HBoxContainer.new()
		s.body.add_child(top)
		Kit.text(top, "In the purse", "small", Kit.DIM).size_flags_horizontal = Control.SIZE_EXPAND_FILL
		Kit.money(top, Js.num(session.profile().get("doubloons")), "price", false, "number")
		var lives: float = Js.num(crew.get("lives", -1.0))
		if lives >= 0.0:
			s.section("Lives")
			s.stat("Left of %d" % int(Js.num(crew.get("livesMax"))), str(int(lives)), "bad" if lives <= 1.0 else "warn")
			s.note("Hardcore: a captain sunk in a lost raid or a lost dive spends one. At none, the Charter is gone for good.")
		var members: Array = Js.list(crew.get("members"))
		if not members.is_empty():
			s.section("The crew")
			for m: Dictionary in members:
				var row: HBoxContainer = HBoxContainer.new()
				row.add_theme_constant_override("separation", 10)
				s.body.add_child(row)
				Kit.text(row, str(m.get("name", "?")) + ("  ·  founder" if m.get("founder", false) else ""), "body", Kit.INK).size_flags_horizontal = Control.SIZE_EXPAND_FILL
				if crew.get("founder", false) and hand.is_valid() and not m.get("founder", false) and aboard.has(m.get("key")):
					var asking: Array = [false]
					var hb: Button = Kit.button("Hand over", "secondary", "small")
					hb.tooltip_text = "Give them the whole Charter. They host it from then on, and everyone leaves port."
					hb.pressed.connect(func() -> void:
						if not asking[0]:
							asking[0] = true
							hb.text = "Hand it to %s?" % m.get("name", "them")
							return
						hb.disabled = true
						var why: String = hand.call(str(m["key"]))
						if why != "":
							hb.text = why)
					row.add_child(hb)
			if crew.get("founder", false):
				s.note("Hand the Charter over and it lives on their machine instead; they host it from then on. Release a berth from the title screen.")
		# Fishing together: start a derby for everyone aboard; the records.
		s.section("Derby")
		s.note("Everyone aboard fishes for %d minutes. Standings show on the water." % int(CrewFishing.DERBY_S / 60.0))
		var drow: HBoxContainer = HBoxContainer.new()
		drow.add_theme_constant_override("separation", 10)
		s.body.add_child(drow)
		for kind: String in CrewFishing.DERBY_KINDS:
			var db_: Button = Kit.button(str(CrewFishing.DERBY_KINDS[kind]).capitalize(), "secondary", "small")
			db_.pressed.connect(func() -> void:
				db_.disabled = true
				var r: Variant = await session.act("crewDerby", ["start", kind])
				if r is Dictionary and (r as Dictionary).has("error"):
					db_.text = str(r["error"])
				else:
					s.close())
			drow.add_child(db_)
		var cs: Dictionary = Js.obj(crew.get("crewStreak"))
		if not cs.is_empty():
			s.stat("Crew best streak", "%d  (%s)" % [int(Js.num(cs.get("n"))), ", ".join(PackedStringArray(Js.list(cs.get("names")).map(func(x: Variant) -> String: return str(x))))])
		var dl: Array = Js.list(crew.get("derbies")).duplicate()
		dl.reverse()
		for d: Dictionary in dl:
			if str(d.get("winner", "")) != "":
				s.stat("%s derby" % str(CrewFishing.DERBY_KINDS.get(d.get("kind"), "")).capitalize(), "%s: %s" % [d["winner"], d.get("label", "")])
		s.section("The ledger")
		var rows: Array = Js.list(crew.get("ledger")).duplicate()
		rows.reverse()
		if rows.is_empty():
			s.note("Nothing earned or spent yet.")
		for r: Dictionary in rows:
			var amt: float = float(r.get("amount", 0.0))
			Kit.stat_row(s.body, "%s  ·  %s" % [r.get("by", "?"), r.get("reason", "")], "%s%s ⟡" % ["+" if amt > 0 else "-", Js.thousands(absf(amt))], "good" if amt > 0 else "bad"))
	return s

