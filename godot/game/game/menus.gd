class_name Menus
extends RefCounted
## THE ROD'S MENUS (Godot port of the bottom row in app/(app)/sea/FishingHere.tsx
## and its sheets, fishing pass 3). Bait, the Hold and the Loadout moved into
## the Locker (game/locker.gd) on 2026-10-01; the crew's purse is left here.


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
