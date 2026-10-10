extends RefCounted
## Part of Sea (game/sea.gd): THE FINDS, driven. The isles to land on, the
## dig sites' bubbles, the bottles drifting near, the treasure hunts' steps,
## and what each one does when pressed (the rules' answer, then its panel).
## The nodes themselves are game/sea_finds.gd's; the state (which isles, digs
## and bottles stand, the bottles taken) stays on the Sea.
## Split out of game/sea.gd on 2026-10-10 for size.


## The isles' marks and the digs' tells, laid on the world once.
static func build(o: Sea) -> void:
	for i: Dictionary in Rules.data()["isles"]:
		var n: SeaFinds.IsleNode = SeaFinds.IsleNode.new()
		n.isle = i
		n.found = Js.includes(o.session.save.get("discoveries", []), i["id"])
		o._world.add_child(n)
		o._isles[i["id"]] = n
	for d: Dictionary in Rules.data()["digSites"]:
		var h: SeaFinds.DigHint = SeaFinds.DigHint.new()
		h.site = d
		h.z_index = -1
		o._world.add_child(h)
		o._digs[d["id"]] = h


## A rules answer's error for a toast, or fallback when there is none (or no
## answer at all).
static func err(r: Variant, fallback: String) -> String:
	return str((r as Dictionary).get("error", fallback)) if r is Dictionary else fallback


## The isles, the digs' tells and the bottles: what to draw, and how close.
static func finds(o: Sea, delta: float, now: float, lift: Color) -> void:
	var at: Vector2 = o._boat.position
	var near_isle: Dictionary = Explore.isle_near(at.x, at.y)
	var found: Array = o.session.save.get("discoveries", [])
	for id: String in o._isles:
		var n: SeaFinds.IsleNode = o._isles[id]
		var was: bool = n.found
		var was_near: bool = n.near
		n.found = Js.includes(found, id)
		n.near = near_isle.get("id") == id
		n.lift = lift
		if n.found != was or n.near != was_near:
			n.refresh()
	for id: String in o._digs:
		var h: SeaFinds.DigHint = o._digs[id]
		var d: float = at.distance_to(h.position)
		h.strength = 0.0
		# Out of range it is 0 whatever: the save is only read for the near.
		if d < Explore.DIG_HINT_RANGE:
			h.strength = clampf((Explore.DIG_HINT_RANGE - d) / 480.0, 0.0, 1.0) if not dug(o, id) else 0.0
			# A buried site shows itself only to a hunt that points at it.
			if Clues.on() and Clues.dig_open(o.session.profile(), id) == "":
				h.strength = 0.0
		# Something on the bottom: bubbles breaking the surface over it, more
		# of them and stronger the closer she is.
		if h.strength > 0.0:
			h.bubble_t -= delta
			if h.bubble_t <= 0.0:
				h.bubble_t = randf_range(0.35, 1.1) / (0.4 + h.strength)
				var off: Vector2 = Vector2(randf_range(-55.0, 55.0), randf_range(-35.0, 35.0))
				o._field.ring(h.position + off, randf_range(26.0, 58.0), 1.2, 0.25 + 0.4 * h.strength)
	o._bottle_t += delta
	var win: int = Clues.sea_day(now) if Clues.on() else Explore.bottle_window(now)
	if o._bottle_t > 10.0 or win != o._bottle_win:
		o._bottle_t = 0.0
		o._bottle_win = win
		var want: Dictionary = {}
		var near: Array = Clues.bottles_near(o.session.profile(), at.x, at.y, 5200.0, now) if Clues.on() else Explore.bottles_around(at.x, at.y, 5200.0, now)
		for b: Dictionary in near:
			if not o._taken.has(b["key"]):
				want[b["key"]] = b
		for k: String in o._bottles.keys():
			if not want.has(k):
				(o._bottles[k] as Node).queue_free()
				o._bottles.erase(k)
		for k: String in want:
			if not o._bottles.has(k):
				var bn: SeaFinds.BottleNode = SeaFinds.BottleNode.new()
				bn.bottle = want[k]
				o._world.add_child(bn)
				o._bottles[k] = bn


static func dug(o: Sea, site_id: String) -> bool:
	for r: Dictionary in o.session.save.get("digs", []):
		if r["site_id"] == site_id and r.get("dug_at") != null:
			return true
	return false


## The nearest thing to do out here: an isle to land on, a site to dig, a
## bottle to fish out. [label, action] or null.
static func find_in_reach(o: Sea, at: Vector2) -> Variant:
	var clue: Variant = clue_in_reach(o, at)
	if clue != null:
		return clue
	var isle: Dictionary = Explore.isle_near(at.x, at.y)
	if not isle.is_empty():
		var been: bool = Js.includes(o.session.save.get("discoveries", []), isle["id"])
		return [("Look again at %s" if been else "Go ashore at %s") % isle["name"], o._land.bind(isle)]
	var site: Dictionary = Explore.dig_at(at.x, at.y)
	if not site.is_empty() and not Clues.on() and not dug(o, site["id"]):
		return ["Drop the grapple", o._dig.bind(site)]
	for k: String in o._bottles:
		var bn: SeaFinds.BottleNode = o._bottles[k]
		if at.distance_to(bn.position) < Explore.BOTTLE_REACH:
			return ["Take the bottle", o._bottle.bind(bn.bottle)]
	return null


## A treasure hunt's step she has reached: [label, action] or null. A dig is
## the hunt's last step and the only way a site is found (port rules).
static func clue_in_reach(o: Sea, at: Vector2) -> Variant:
	if not Clues.on():
		return null
	var p: Dictionary = o.session.profile()
	for th: Array in Clues.hunts(p):
		var tier: String = th[0]
		var s: Dictionary = Clues.current(p, tier)
		match s.get("kind", ""):
			"bearing":
				if at.distance_to(Vector2(float(s["x"]), float(s["y"]))) < Clues.SEARCH_RANGE:
					return ["Search here  ·  %s" % Clues.TIER_NAME[tier], o._clue_search.bind(tier)]
			"riddle":
				if at.distance_to(Vector2(float(s["x"]), float(s["y"]))) < float(s["r"]) + Clues.SEARCH_RANGE:
					return ["Search here  ·  %s" % Clues.TIER_NAME[tier], o._clue_search.bind(tier)]
			"dig":
				if at.distance_to(Vector2(float(s["x"]), float(s["y"]))) < Clues.SEARCH_RANGE:
					return ["Dig here  ·  %s" % Clues.TIER_NAME[tier], o._clue_search.bind(tier)]
			"speak":
				var w: Variant = o._regulars.get("folk:%s" % s["folk"])
				if w != null and (w as Wanderer).near(at):
					return ["Ask %s about the clue" % (w as Wanderer).info["name"], o._clue_search.bind(tier)]
	return null


static func clue_search(o: Sea, tier: String) -> void:
	Rumble.tap(14)
	await o._flush_position()
	var r: Variant = await o.session.act("clueSearch", [tier])
	o.session.persist()
	if not r is Dictionary or not (r as Dictionary).get("ok", false):
		o._hud.toast(err(r, "Nothing here."))
		return
	var res: Dictionary = r
	if res.get("done", false):
		var haul: Array = []
		if Js.num(res.get("doubloons")) > 0:
			haul.append([res["doubloons"], "doubloons"])
		var lines: Array = [["The %s's hunt is done. The casket held:" % Clues.TIER_NAME[tier], "note"]]
		for b: Variant in Js.obj(res.get("bait")):
			lines.append(["%d %s" % [int(res["bait"][b]), Rules.bait(str(b)).get("name", b)], "body_strong"])
		for nt: Variant in Js.obj(res.get("notices")):
			lines.append(["A %s, for the Crew Hall" % Js.obj(Crew.notice_defs().get(nt)).get("name", nt), "body_strong"])
		for kv: Variant in Js.obj(res.get("vouchers")):
			lines.append(["A %s! Open it in the Crew Hall's Trunk" % Skins.kind_def(str(kv)).get("name", kv), "body_strong"])
		for c: Variant in Js.obj(res.get("crates")):
			var cname: String = str((CrateMoment.TIERS.get(c, [str(c).capitalize()]) as Array)[0])
			var cn: int = int(res["crates"][c])
			lines.append([("%s, stowed in your Locker" % cname) if cn == 1 else ("%d of the %s, stowed in your Locker" % [cn, cname]), "body_strong"])
		Sound.chest(true)
		o._show_find(SeaFinds.panel(o._room_layer, "sea/dig-box.png", "Hauled up from the bottom", "%s casket" % Clues.TIER_NAME[tier], lines, haul))
	else:
		Sound.bell()
		o._show_find(SeaFinds.panel(o._room_layer, "sea/sea-bottle.png", "%s  ·  step %d of %d" % [Clues.TIER_NAME[tier], int(res["stepNo"]), int(res["of"])], "The next step", [[str(res["next"]["text"]), "body_strong"]], []))
	o._hud.refresh()


static func land(o: Sea, isle: Dictionary) -> void:
	Rumble.buzz([18, 40, 24])
	await o._flush_position()
	var r: Variant = await o.session.act("goAshore", [isle["id"]])
	o.session.persist()
	if not r is Dictionary or not (r as Dictionary).get("ok", false):
		o._hud.toast(err(r, "The sea took that one. Try again."))
		return
	var res: Dictionary = r
	var note: Variant = res.get("note")
	var lines: Array = []
	if note != null:
		lines.append([str(note["title"]), "heading"])
		lines.append([str(note["body"]), "note"])
	if res.get("already", false):
		o._show_find(SeaFinds.panel(o._room_layer, "sea/isle-note.png" if note != null else "sea/isle-chest-open.png", "Been ashore before", res["name"], lines if not lines.is_empty() else ["Nothing left here but the view."], []))
		return
	var haul: Array = []
	if Js.num(res.get("doubloons")) > 0:
		haul.append([res["doubloons"], "doubloons"])
	if Js.num(res.get("gems")) > 0 and Rules.web_only:
		haul.append([res["gems"], "gems"])
	if res.get("salvage") != null:
		lines.append(["Salvaged: %s. Nobody sells one. It is waiting at the Homestead." % res["salvage"]["name"], "body"])
	if res.get("stone") != null:
		lines.append(["A portal stone for %s. The Homestead portal will remember the road." % res["stone"]["name"], "body"])
	Sound.chest(not haul.is_empty())
	o._show_find(SeaFinds.panel(o._room_layer, "sea/isle-note.png" if note != null else "sea/isle-chest-open.png", "Ashore", res["name"], lines, haul))
	o._hud.refresh()


static func dig(o: Sea, site: Dictionary) -> void:
	Rumble.buzz([0, 40, 30, 60])
	await o._flush_position()
	var r: Variant = await o.session.act("digHere", [site["id"]])
	o.session.persist()
	if not r is Dictionary or not (r as Dictionary).get("ok", false):
		o._hud.toast(err(r, "The spade turned nothing up. Try again."))
		return
	Sound.chest(true)
	o._show_find(SeaFinds.panel(o._room_layer, "sea/dig-box.png", "Hauled up from the bottom", r["name"], [[str(r["found"]), "note"]], [[r["doubloons"], "doubloons"]]))
	o._hud.refresh()


static func bottle(o: Sea, b: Dictionary) -> void:
	Rumble.tap(14)
	await o._flush_position()
	var r: Variant = await o.session.act("openBottle", [b["key"]])
	o.session.persist()
	# Holding a clue of its tier: it is left where it floats.
	if r is Dictionary and (r as Dictionary).get("held", false):
		o._hud.toast(str(r["error"]))
		return
	# The rules answered (opened, or the tide took it): it is gone. No answer
	# at all (a Charter's line timed out, no peer: { error } with no "ok"):
	# it stays floating, so "try again" can be done.
	if r is Dictionary and (r as Dictionary).has("ok"):
		o._taken[b["key"]] = true
		if o._bottles.has(b["key"]):
			(o._bottles[b["key"]] as Node).queue_free()
			o._bottles.erase(b["key"])
	if not r is Dictionary or not (r as Dictionary).get("ok", false):
		o._hud.toast(err(r, "It slipped out of your hands. Try that one again."))
		return
	if Clues.on():
		var hunt: Dictionary = r["hunt"]
		Sound.bell()
		o._show_find(SeaFinds.panel(o._room_layer, "sea/sea-bottle.png", "Fished out of the water", "A %s" % Clues.TIER_NAME[r["tier"]],
			[["A treasure hunt: %d steps, then a dig. Your clues are listed at the left of the screen." % (hunt["steps"] as Array).size(), "note"], ["Step 1: %s" % r["step"]["text"], "body_strong"]], []))
		o._hud.refresh()
		return
	var lines: Array = [[str(r["text"]), "note"]]
	var title: String = "A note in a bottle"
	if r.get("kind") == "bearing":
		title = "A bearing: %s" % r["name"]
		lines.append([str(r["bearing"]), "body_strong"])
		lines.append(["Something lies on the bottom there. Sail over it and drop the grapple.", "small"])
	o._show_find(SeaFinds.panel(o._room_layer, "sea/sea-bottle.png", "Fished out of the water", title, lines, []))
