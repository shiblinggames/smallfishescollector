extends RefCounted
## Part of Sea (game/sea.gd): THE PORTS AND THE NORTH. Each port drawn on the
## water (its plate, its buildings, its berth), the reef and the arch, what
## tying up at each berth opens, the Mainland's doors, the expedition row, the
## change of boat at the arch, the Sea Gate, and the crew hall's sunrise. The
## state (the berths, the house, the arch) stays on the Sea.
## Split out of game/sea.gd on 2026-10-10 for size.


static func draw_port(o: Sea, port: Dictionary) -> void:
	var c: Vector2 = Vector2(float(port["x"]), float(port["y"]))
	var r: float = float(port["r"])
	var d: float = r * 2.0
	var pl: Variant = port.get("plate")
	if pl != null:
		var plate: Sprite2D = Sprite2D.new()
		plate.texture = Lit.tex(String((pl as Dictionary)["art"]))
		if plate.texture != null:
			var w: float = d * float(pl.get("width", 1.0))
			var sc: float = w / float(plate.texture.get_width())
			plate.scale = Vector2(sc, sc / Chart.GROUND)
			var h: float = plate.texture.get_height() * sc
			plate.position = c + Vector2(0, (0.5 - float(pl.get("water", 0.42))) * h / Chart.GROUND)
			plate.z_index = -2
			o._world.add_child(plate)
			Shore.trace(plate)
	var bds: Array = port["buildings"]
	# The Homestead wears the house that stands (core/homestead.gd).
	if port["id"] == "home":
		bds = [Homestead.sea_building(o.session.store)]
	for bd: Dictionary in bds:
		var b: Sprite2D = Sprite2D.new()
		b.texture = Lit.tex(String(bd["art"]))
		if b.texture == null:
			continue
		var bs: float = d * float(bd["scale"]) / float(b.texture.get_width())
		b.scale = Vector2(bs, bs / Chart.GROUND)
		b.offset = Vector2(0, -b.texture.get_height() / 2.0)
		b.position = c + Vector2(-r + float(bd["x"]) / 100.0 * d, -r + float(bd["y"]) / 100.0 * d)
		o._world.add_child(b)
		if port["id"] == "home":
			if o._home_house != null and is_instance_valid(o._home_house):
				o._home_house.queue_free()
			o._home_house = b
	var be: Dictionary = port["berth"]
	var berth: Berth = Berth.new()
	berth.r = float(be["r"])
	berth.position = Vector2(float(be["x"]), float(be["y"]))
	berth.z_index = -1
	o._world.add_child(berth)
	o._berths[port["id"]] = berth


## The house redrawn after a build.
static func refresh_home(o: Sea) -> void:
	if o._home_house == null or not is_instance_valid(o._home_house):
		return
	var bd: Dictionary = Homestead.sea_building(o.session.store)
	var port: Dictionary = Chart.port("home")
	var c: Vector2 = Vector2(float(port["x"]), float(port["y"]))
	var r: float = float(port["r"])
	var d: float = r * 2.0
	o._home_house.texture = Lit.tex(String(bd["art"]))
	if o._home_house.texture == null:
		return
	var bs: float = d * float(bd["scale"]) / float(o._home_house.texture.get_width())
	o._home_house.scale = Vector2(bs, bs / Chart.GROUND)
	o._home_house.offset = Vector2(0, -o._home_house.texture.get_height() / 2.0)
	o._home_house.position = c + Vector2(-r + float(bd["x"]) / 100.0 * d, -r + float(bd["y"]) / 100.0 * d)


## The reef and the anchorage's wall, rock by rock (North), and the names
## over the arch and the Sea Gate.
static func draw_north(o: Sea) -> void:
	# IN THE WATER, as the boats are (Kong: "the boulders don't look
	# submerged"): the foot of each rock below a lapping waterline, and the
	# water it pushes aside ringing it. Each its own material, since the
	# shader's sizes follow the rock's.
	for r: Array in North.rocks():
		var t: Texture2D = Skipper.tex(r[0])
		if t == null:
			continue
		var holder: Node2D = Node2D.new()
		holder.position = Vector2(float(r[1]), float(r[2]))
		o._world.add_child(holder)
		var s: Sprite2D = Sprite2D.new()
		s.texture = t
		var sc: float = float(r[3]) / float(t.get_width())
		s.scale = Vector2(sc, sc / Chart.GROUND)
		# The painted foot, and the water a little up from it.
		var band: Vector2 = Skipper._band(t)
		# Standing on the water: the picture's foot at its point (so the
		# arch's span draws over a boat in the passage behind its front foot).
		s.offset = Vector2(0, -t.get_height() * (band.y - 0.5))
		var arch: bool = r[0] == North.ARCH
		var cut: float = band.y - 0.13
		var depth: float = 0.12
		var phase: float = randf() * 6.0
		if arch:
			# Its two feet at different heights: the water slopes between them.
			cut = 0.72
		var m: ShaderMaterial = Skipper.afloat_mat("res://game/fx/waterline.gdshader", s, cut, depth, phase)
		m.set_shader_parameter("lap_amp", 0.4)
		if arch:
			m.set_shader_parameter("tilt", -0.43)
		s.material = m
		# The ring sits behind the rock, from its own shape (not the arch's:
		# one ring would run across the open passage).
		if not arch:
			var ring: Sprite2D = Skipper.collar_of(s, cut, depth, phase)
			ring.offset = s.offset
			holder.add_child(ring)
		holder.add_child(s)
		if arch:
			o._arch = s
	for sign: Array in [["The Sea Gate", North.SEA_GATE + Vector2(0, 520.0)]]:
		var holder: Node2D = Node2D.new()
		holder.position = sign[1]
		holder.scale = Vector2(1.0, 1.0 / Chart.GROUND)
		holder.z_index = 5
		o._world.add_child(holder)
		# Lettering on the water: the one recipe (the hero role, Kit.lift),
		# lifted out of the night with the other words on the water.
		var l: Label = Kit.lift(Kit.text(null, sign[0], "hero", Kit.SEA_INK))
		holder.add_child(l)
		l.position = Vector2(-l.get_minimum_size().x / 2.0, -30.0)
		o._gate_sign = l


## The bell and the buzz of tying up.
static func dock_bell() -> void:
	Rumble.buzz([18, 40, 24])
	Sound.bell()


## A room over the sea from a mooring: it gets the session, holds the HUD
## while it is up, and on_closed runs as it closes.
static func open_room(o: Sea, room: Control, on_closed: Callable) -> void:
	room.set("session", o.session)
	room.connect("closed", on_closed)
	o._hold(room, o._room_layer)


## Tying up: the bell, then whatever the port opens.
static func dock(o: Sea, id: String) -> void:
	match id:
		"home":
			dock_bell()
			open_room(o, HomesteadRoom.new(), func() -> void:
				o.refresh_home()
				o._hud.refresh())
		"mainland":
			o._go_ashore()
		"shipyard":
			dock_bell()
			o._enter_room("shipyard")
		"crew_hall":
			dock_bell()
			open_room(o, CrewHall.new(), o._hud.refresh)
		"forge_isle":
			dock_bell()
			open_room(o, ForgeBench.new(), o._hud.refresh)
		"posting_house":
			dock_bell()
			open_room(o, BountyBoard.new(), o._hud.refresh)
		"charterhouse":
			dock_bell()
			open_room(o, VoyageBoard.new(), o._hud.refresh)
		"trawl_fleet":
			dock_bell()
			open_room(o, TrawlHarbor.new(), o._hud.refresh)
		"trawl_docks":
			# The Tally House: the day's orders, in the Locker.
			dock_bell()
			o._open_locker("orders", "")
		"gunwharf":
			dock_bell()
			open_room(o, GunwharfSheet.new(), func() -> void:
				o._open_sea_gate()
				reship(o))
		_:
			Rumble.tap(10)
			var p: Dictionary = Chart.port(id)
			if North.COMING.has(id):
				Sound.bell()
				o._show_find(SeaFinds.panel(o._room_layer, str(Js.obj(p.get("plate")).get("art", "")).trim_prefix("/"), "Moored", str(p.get("name", "")),
					[[str(p.get("blurb", "")).replace("’", "'"), "body_strong"], [North.COMING[id], "note"], ["Its rooms come in a later build of the port.", "small"]], []))
			else:
				o._hud.toast("%s is not built yet in this build." % p.get("name", "That port"))


static func go_ashore(o: Sea) -> void:
	dock_bell()
	var a: Ashore = Ashore.new()
	a.chose.connect(o._enter_room)
	o._hold(a, o._hud_layer)


static func enter_room(o: Sea, door: String) -> void:
	var room: Room
	match door:
		"market":
			room = MarketRoom.new()
		"shipyard":
			room = ShipyardRoom.new()
		"den":
			room = DenRoom.new()
		"parlor":
			room = ParlorRoom.new()
		"chart_room":
			room = ChartStudy.new()
		"tavern":
			room = TavernRoom.new()
		_:
			room = TackleRoom.new()
	room.session = o.session
	room.closed.connect(func() -> void:
		o._boat.set_look(Skipper.look_of(o.session.profile()))
		o._boat.set_fit(o.session.profile())
		o._send_look()
		o._hud.refresh())
	o._hold(room, o._room_layer)


## The expedition row (Crew, Recruits, Ship), north of the arch.
static func open_expedition(o: Sea, what: String) -> void:
	if o._hud.busy():
		return
	var c: Control
	if what == "ship":
		var sh: ShipSheet = ShipSheet.new()
		sh.session = o.session
		sh.closed.connect(func() -> void: o._hud.refresh())
		c = sh
	else:
		var ch: CrewHall = CrewHall.new()
		ch.session = o.session
		ch.at_hall = false
		ch.room = "roster" if what == "crew" else "recruit"
		ch.closed.connect(func() -> void: o._hud.refresh())
		c = ch
	o._hold(c, o._room_layer)


## THE CHANGE OF BOAT (North): past the sign in the arch, the ship.
static func ship_side(o: Sea) -> void:
	var want: bool = North.ship_water(o._boat.position)
	if want == o._boat.on_ship:
		o._sided = true
		return
	var sa: Dictionary = North.ship_art(o.session.profile().get("ship_tier"), o.session.profile().get("equipped_ship_skin"))
	var def: Dictionary = sa["def"]
	var art: String = sa["art"]
	var wide: float = sa["wide"]
	# The first time (opening the sea already north) is no crossing.
	var crossing: bool = o._sided
	o._sided = true
	o._boat.set_ship(want, def, Skipper.tex(art), wide, crossing)
	o._hud.set_side(want, crossing)
	if not crossing:
		return
	# The water gives under her: rings running out, one after another.
	for k: int in 3:
		o.get_tree().create_timer(0.12 * k).timeout.connect(func() -> void:
			if is_instance_valid(o._boat):
				o._field.ring(o._boat.position, 120.0 + 70.0 * k, 1.6 + 0.3 * k, 0.6 - 0.15 * k))
	Rumble.buzz([0, 30, 30, 50])
	if want:
		Sound.horn()
	else:
		Sound.bell()
	if want:
		o._hud.side_banner("The Anchorage", "Your %s is under you" % str(def.get("name", "ship")))
	else:
		o._hud.side_banner("The Fishing Grounds", "Back on your boat")


## SUNRISE AT THE CREW HALL (Kong, 2026-10-02): a fresh board of hopefuls comes
## in each sea day; say so when it does, and on coming back to one not yet
## looked at (the board is stamped when the hall is opened).
static func crew_morning(o: Sea, now: float) -> void:
	if Crew.port().is_empty():
		return
	var key: String = Crew.board_key(now)
	if key == o._crew_key:
		return
	var first: bool = o._crew_key == ""
	o._crew_key = key
	if str(o.session.profile().get("last_free_recruit_date", "")) == key:
		return
	if first and o.session.profile().get("last_free_recruit_date") == null and Crew.live(o.session.store).is_empty():
		# A captain who has never been to the hall hears of it once they have.
		return
	o._hud.notify("SUNRISE", "New hopefuls at the Crew Hall",
		"A fresh board of hands is looking for a ship. Moor at the Crew Hall, north through the arch, to meet them.",
		Skipper.tex("crew/hall_%d.png" % Crew.clamp_hall(o.session.profile().get("crew_hall_tier"))))


static func held_at_gate(o: Sea) -> void:
	var now: float = Time.get_ticks_msec() / 1000.0
	if now - o._gate_note_t < 6.0:
		return
	o._gate_note_t = now
	o._hud.toast("She sails with nobody aboard. Seat your raid party at the Gunwharf before you go out.")


## Held on a shut bay's rim: the helm says which, and what opens it.
static func held_at_bay(o: Sea, line: String) -> void:
	var now: float = Time.get_ticks_msec() / 1000.0
	if now - o._bay_note_t < 4.0:
		return
	o._bay_note_t = now
	Rumble.tap(12)
	o._hud.toast(line)


## Out of the Gunwharf: a new hull or paint shows on the water at once.
static func reship(o: Sea) -> void:
	o._hud.refresh()
	if not o._boat.on_ship:
		return
	var sa: Dictionary = North.ship_art(o.session.profile().get("ship_tier"), o.session.profile().get("equipped_ship_skin"))
	o._boat.set_ship(true, sa["def"], Skipper.tex(sa["art"]), sa["wide"], false)


## The Sea Gate opens with a captain seated to fight (an empty ship does not
## go out: every fight past it is fought by the crew in the seats).
static func open_sea_gate(o: Sea) -> void:
	var seated: bool = false
	for c: Dictionary in Crew.live(o.session.store):
		if c.get("raid_slot") != null and float(c["raid_slot"]) == 0.0:
			seated = true
	North.gate_open = seated
