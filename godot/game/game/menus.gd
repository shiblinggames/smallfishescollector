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
		s.section("The ledger")
		var rows: Array = Js.list(crew.get("ledger")).duplicate()
		rows.reverse()
		if rows.is_empty():
			s.note("Nothing earned or spent yet.")
		for r: Dictionary in rows:
			var amt: float = float(r.get("amount", 0.0))
			Kit.stat_row(s.body, "%s  ·  %s" % [r.get("by", "?"), r.get("reason", "")], "%s%s ⟡" % ["+" if amt > 0 else "-", Js.thousands(absf(amt))], "good" if amt > 0 else "bad"))
	return s


## THE CREW CHEST (Kong, 2026-10-06): raid items, forge scrap and rods, put in
## and taken out by anyone (Charter.chest_run on the founder's game). Hooks
## and reels are each captain's own.
static func chest_sheet(session: Session) -> Sheet:
	var s: Sheet = Sheet.new()
	var crew: Dictionary = Js.obj(session.save.get("charter"))
	s.title = "The crew chest"
	s.eyebrow = str(crew.get("name", "The Charter"))
	s.accent = Kit.GOLD
	s.blurb = "Raid items, forge scrap and rods for the whole crew. Anyone can put in or take out."
	s.ready.connect(func() -> void: _chest_fill(s, session, Js.obj(crew.get("chest")), ""))
	return s


static func _chest_fill(s: Sheet, session: Session, chest: Dictionary, said: String) -> void:
	for c: Node in s.body.get_children():
		c.queue_free()
	var act: Callable = func(args: Array) -> void:
		var r: Variant = await session.act("crewChest", args)
		var d: Dictionary = r if r is Dictionary else {}
		_chest_fill(s, session, Js.obj(d.get("chest", Js.obj(session.save.get("charter")).get("chest"))), str(d.get("error", "")))
	if said != "":
		Kit.text(s.body, said, "note", Kit.WARN, true)
	var p: Dictionary = session.profile()
	var line: Callable = func(label: String, btn: String, args: Array) -> void:
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		s.body.add_child(row)
		Kit.text(row, label, "body", Kit.INK).size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var b: Button = Kit.button(btn, "secondary", "small")
		b.pressed.connect(func() -> void:
			b.disabled = true
			act.call(args))
		row.add_child(b)
	var count: Callable = func(n: float) -> String: return "" if n <= 1.0 else "  x%d" % int(n)
	# In the chest.
	s.section("In the chest")
	var any: bool = false
	var items: Dictionary = Js.obj(chest.get("items"))
	for id: Variant in items:
		any = true
		line.call(str(Armory.item(str(id)).get("name", id)) + count.call(Js.num(items[id])), "Take", ["take", "item", str(id)])
	var rods: Dictionary = Js.obj(chest.get("rods"))
	for id2: Variant in rods:
		any = true
		line.call(str(Rules.rod_by_id(str(id2)).get("name", id2)) + count.call(Js.num(rods[id2])), "Take", ["take", "rod", str(id2)])
	var scrap: float = Js.num(chest.get("scrap"))
	if scrap > 0.0:
		any = true
		line.call("Forge scrap  %s" % Js.thousands(scrap), "Take %s" % Js.thousands(minf(10.0, scrap)), ["take", "scrap", "", minf(10.0, scrap)])
	if not any:
		s.note("Empty. Put in what you can spare below.")
	# What this captain can put in.
	s.section("Yours to put in")
	var mine: bool = false
	var held: Dictionary = {}
	for id3: Variant in Js.list(p.get("raid_items")):
		held[str(id3)] = int(held.get(str(id3), 0)) + 1
	var mounted: Array = Js.list(p.get("equipped_raid_items"))
	for id4: String in held:
		mine = true
		var note4: String = "  (mounted)" if mounted.has(id4) and int(held[id4]) == 1 else ""
		line.call(str(Armory.item(id4).get("name", id4)) + count.call(float(held[id4])) + note4, "Put in", ["put", "item", id4])
	var own_rods: Dictionary = Js.obj(session.save.get("rodItems"))
	for id5: Variant in own_rods:
		var rd: Dictionary = Rules.rod_by_id(str(id5))
		if rd.is_empty() or str(id5) == "bamboo" or rd.get("earnedOnly") == true or Js.num(own_rods[id5]) <= 0.0:
			continue
		mine = true
		var fishing: String = "  (fishing with it)" if Js.num(p.get("rod_tier")) == float(rd["tier"]) and Js.num(own_rods[id5]) <= 1.0 else ""
		line.call(str(rd["name"]) + count.call(Js.num(own_rods[id5])) + fishing, "Put in", ["put", "rod", str(id5)])
	var my_scrap: float = Js.num(p.get("forge_scrap"))
	if my_scrap > 0.0:
		mine = true
		line.call("Forge scrap  %s" % Js.thousands(my_scrap), "Put in %s" % Js.thousands(minf(10.0, my_scrap)), ["put", "scrap", "", minf(10.0, my_scrap)])
	if not mine:
		s.note("Nothing to spare: raid items, rods and forge scrap can go in.")
	var log: Array = Js.list(chest.get("log")).duplicate()
	if not log.is_empty():
		s.section("Lately")
		log.reverse()
		for e: Dictionary in log.slice(0, 12):
			Kit.text(s.body, "%s %s %s" % [e.get("by", "?"), "put in" if e.get("verb") == "put" else "took", e.get("what", "")], "small", Kit.DIM)
