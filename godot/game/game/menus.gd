class_name Menus
extends RefCounted
## THE ROD'S MENUS (Godot port of the bottom row in app/(app)/sea/FishingHere.tsx
## and its sheets, fishing pass 3). Bait, the Hold and the Loadout moved into
## the Locker (game/locker.gd) on 2026-10-01; the crew's purse is left here.


## THE CREW PURSE (a Charter): one purse for the crew, and its ledger, newest
## first: who earned what, who spent what.
## THE CHARTER at sea: the crew's purse, a hardcore Charter's lives, the crew
## (each aboard or away; the founder can hand the Charter to a crewmate aboard:
## `hand` takes their key and answers "" or why not; `aboard` is who is on the
## line when it opened), and the ledger. On the night paper (a crew menu), and
## repainted while open as the purse, the lives or the crew aboard change
## (the walkthrough, 2026-10-11: it was a snapshot on the day paper).
static func purse_sheet(session: Session, hand: Callable = Callable(), aboard: Array = []) -> Sheet:
	var s: Sheet = Sheet.new()
	var crew0: Dictionary = Js.obj(session.save.get("charter"))
	s.title = "The Charter"
	s.eyebrow = str(crew0.get("name", "The Charter"))
	s.accent = Kit.GOLD
	s.blurb = "Every doubloon any of you earns goes in the purse, and every captain spends from it."
	s.set_meta("night_root", true)
	var net: CrewNet = _net(session)
	# What the sheet keeps across a repaint: the crewmate a handover is being
	# asked about, whether it is under way, and what went wrong.
	var st: Dictionary = { "asking": "", "handing": false, "why": "" }
	var paint: Array = [Callable()]
	paint[0] = func() -> void:
		if not is_instance_valid(s) or s.body == null or Motion.closing(s):
			return
		for c: Node in s.body.get_children():
			s.body.remove_child(c)
			c.queue_free()
		_purse_body(s, session, hand, aboard, net, st, paint[0])
		Pane.set_night(s, true)
	s.ready.connect(func() -> void:
		(paint[0] as Callable).call()
		# Let go when the sheet goes (never a lambda left on CrewNet).
		var again: Callable = func(_a: Variant = null) -> void: (paint[0] as Callable).call()
		var failed: Callable = func(why: String) -> void:
			st["handing"] = false
			st["asking"] = ""
			st["why"] = why
			(paint[0] as Callable).call()
		session.changed.connect(again)
		if net != null:
			net.roster_changed.connect(again)
			net.hand_failed.connect(failed)
			# A derby starting, scoring or ending repaints the Derby part.
			if net.fishing != null:
				net.fishing.derby_changed.connect(again)
		s.tree_exiting.connect(func() -> void:
			if session.changed.is_connected(again):
				session.changed.disconnect(again)
			if net != null and is_instance_valid(net):
				if net.roster_changed.is_connected(again):
					net.roster_changed.disconnect(again)
				if net.hand_failed.is_connected(failed):
					net.hand_failed.disconnect(failed)
				if net.fishing != null and net.fishing.derby_changed.is_connected(again):
					net.fishing.derby_changed.disconnect(again)))
	return s


## The crew's line on this game (a crewmate's session holds it; the founder's
## is found in the tree), or null.
static func _net(session: Session) -> CrewNet:
	if session.remote != null:
		return session.remote
	var tree: SceneTree = Engine.get_main_loop() as SceneTree
	if tree == null or tree.root == null:
		return null
	return tree.root.find_child("CrewNet", true, false) as CrewNet


## The Charter sheet's body, painted afresh on every change.
static func _purse_body(s: Sheet, session: Session, hand: Callable, aboard_given: Array, net: CrewNet, st: Dictionary, repaint: Callable) -> void:
	var crew: Dictionary = Js.obj(session.save.get("charter"))
	# Who is aboard now: the roster as last heard, else what the opener gave.
	var aboard: Array = aboard_given.duplicate()
	if net != null and not net.last_roster.is_empty():
		aboard = []
		for r: Dictionary in net.last_roster:
			if r.get("aboard", false):
				aboard.append(r.get("key"))
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
		var can_hand: bool = false
		for m: Dictionary in members:
			var row: HBoxContainer = HBoxContainer.new()
			row.add_theme_constant_override("separation", 10)
			s.body.add_child(row)
			var here: bool = aboard.has(m.get("key"))
			Kit.text(row, str(m.get("name", "?")) + ("  ·  founder" if m.get("founder", false) else ""), "body", Kit.INK).size_flags_horizontal = Control.SIZE_EXPAND_FILL
			# Aboard, what they are doing as their plate says it ("at the Den
			# · roulette", "fishing · The Shallows"); away, away.
			var doing: String = net.doing_of(str(m.get("key", ""))) if net != null and here else ""
			Kit.text(row, (doing if doing != "" else "aboard") if here else "away", "small", Paper.GREEN if here else Kit.DIM).size_flags_vertical = Control.SIZE_SHRINK_CENTER
			if crew.get("founder", false) and hand.is_valid() and not m.get("founder", false) and here:
				can_hand = true
				var k: String = str(m["key"])
				var asking: bool = st["asking"] == k
				# One button style throughout; its words say the step.
				var hb: Button = Kit.button("Handing over..." if asking and st["handing"] else ("Yes, hand it over" if asking else "Hand over"), "secondary", "small")
				hb.disabled = bool(st["handing"])
				hb.tooltip_text = "Give them the whole Charter. They host it from then on, and everyone leaves port."
				hb.pressed.connect(func() -> void:
					st["why"] = ""
					if st["asking"] != k:
						st["asking"] = k
						repaint.call()
						return
					st["handing"] = true
					repaint.call()
					var why: String = hand.call(k)
					if why != "":
						st["handing"] = false
						st["asking"] = ""
						st["why"] = why
						repaint.call())
				row.add_child(hb)
				if asking and not st["handing"]:
					s.note("Hand %s to %s? Everyone goes back to port, and %s hosts it from then on." % [crew.get("name", "the Charter"), m.get("name", "them"), m.get("name", "they")])
		if str(st["why"]) != "":
			Kit.text(s.body, str(st["why"]), "small", Paper.RED, true)
		# The note only where there is someone to hand it to.
		if can_hand:
			s.note("Hand the Charter over and it lives on their machine instead; they host it from then on. Release a berth from the title screen.")
	# Fishing together: start a derby for everyone aboard; the records.
	s.section("Derby")
	# THE DERBY THAT IS ON (THE DEN AND THE WATER TOGETHER, Kong, 2026-10-11;
	# the walkthrough: this sheet offered to start another while one ran):
	# what it is, who started it, the time left ticking, the standings with
	# your row, and Fish on (everyone aboard is in it already).
	var cf: CrewFishing = net.fishing if net != null else null
	if cf != null and running_derby(cf):
		_derby_on(s, cf, net.key)
	else:
		_derby_start(s, session)
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
		Kit.stat_row(s.body, "%s  ·  %s" % [r.get("by", "?"), r.get("reason", "")], "%s%s ⟡" % ["+" if amt > 0 else "-", Js.thousands(absf(amt))], "good" if amt > 0 else "bad")


## Is a derby on now (as this game last heard it, its clock not yet run out)?
static func running_derby(cf: CrewFishing) -> bool:
	return not cf.derby.is_empty() and cf.derby.get("final") != true


## The time a derby has left, from what this game last heard.
static func derby_left(cf: CrewFishing) -> float:
	return maxf(0.0, Js.num(cf.derby.get("left")) - float(Time.get_ticks_msec() - cf.derby_got_ms) / 1000.0)


## The derby that is on: its kind and who started it, the time left (ticking
## while the sheet is open), the standings (your row as "You", in green), and
## Fish on, which closes the sheet.
static func _derby_on(s: Sheet, cf: CrewFishing, my_key: String) -> void:
	var st: Dictionary = cf.derby
	s.stat("On now", "%s  ·  started by %s" % [str(st.get("title", "")).capitalize(), st.get("by", "a crewmate")])
	var tr: HBoxContainer = Kit.stat_row(s.body, "Time left", "")
	var tl: Label = tr.get_child(1) as Label
	var tick: Callable = func() -> void:
		var left: float = derby_left(cf)
		tl.text = "%d:%02d" % [int(left) / 60, int(left) % 60] if left > 0.0 else "Finishing"
	tick.call()
	var tm: Timer = Timer.new()
	tm.wait_time = 0.5
	tm.autostart = true
	tm.timeout.connect(tick)
	tl.add_child(tm)
	var rows: Array = Js.list(st.get("rows"))
	if rows.is_empty():
		s.note("No catches yet. The first fish anyone lands leads it.")
	for i: int in rows.size():
		var r: Dictionary = rows[i]
		var me: bool = str(r.get("key", "")) == my_key
		if i >= 5 and not me:
			continue
		Kit.stat_row(s.body, "%d.  %s" % [i + 1, "You" if me else str(r.get("name", "?"))], str(r.get("label", "")), "good" if me else "")
	s.note("Everyone aboard is in it: every fish you land counts. The standings show on the water at the right.")
	var fish: Button = Kit.button("Fish on", "secondary", "small")
	fish.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	fish.pressed.connect(s.close)
	s.body.add_child(fish)


## No derby on: the two kinds to start one for everyone aboard.
static func _derby_start(s: Sheet, session: Session) -> void:
	s.note("Everyone aboard fishes for %d minutes. Standings show on the water." % int(CrewFishing.DERBY_S / 60.0))
	var drow: HBoxContainer = HBoxContainer.new()
	drow.add_theme_constant_override("separation", 10)
	s.body.add_child(drow)
	for kind: String in CrewFishing.DERBY_KINDS:
		var db_: Button = Kit.button(str(CrewFishing.DERBY_KINDS[kind]).capitalize(), "secondary", "small")
		db_.pressed.connect(func() -> void:
			db_.disabled = true
			var r: Variant = await session.act("crewDerby", ["start", kind])
			# A crewmate's start is a round trip: the sheet may have been
			# shut meanwhile.
			if not is_instance_valid(s) or Motion.closing(s) or not is_instance_valid(db_):
				return
			if r is Dictionary and (r as Dictionary).has("error"):
				db_.text = str(r["error"])
			else:
				s.close())
		drow.add_child(db_)
