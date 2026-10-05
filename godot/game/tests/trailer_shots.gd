class_name TrailerShots
extends RefCounted
## THE TRAILER'S OWN SHOTS (Kong, 2026-10-05: "a really professional, polished
## gameplay trailer"). tests/shot.gd's "trailer" mode runs one of these under
## Godot's movie maker (godot/trailer/record.sh drives it), printing MARK in
## movie frames where the shot proper starts; the cut is made from there.
##   sail      dawn, the ship heading out, the camera keeping up
##   flotilla  a Charter's four ships under sail together, names on the water
##   together  fishing side by side: the crew at their lines, your cast, a
##             perfect strike, the catch
##   night     the flotilla after dark, lanterns lit
##   coop      a Charter's raid: both ships' orders in, a crossfire round
##   summon    a crewmate ordered, their card standing up, their summon played
## Every shot runs for MOVIE_S seconds after its MARK.

var tree: SceneTree
var sea: Sea
var hud: FishingHud
var p: Dictionary
var _mates: Array = []
var _offsets: Array = []


func _frames(n: int) -> void:
	for i: int in n:
		await tree.process_frame


func _mark() -> void:
	print("MARK ", Engine.get_frames_drawn())
	TrailerShots.caption(tree)


## The trailer's words, laid over the shot from its MARK (CAPTION; CAPTION_AT
## seconds in, held CAPTION_FOR; CAPTION_STYLE "line" low on the left, "title"
## in the middle, "end" the title and SUB under it). Cinzel, a soft dark
## breath behind, fading in and out; nothing else.
static func caption(t: SceneTree) -> void:
	var text: String = OS.get_environment("CAPTION")
	if text == "":
		return
	var style: String = OS.get_environment("CAPTION_STYLE") if OS.get_environment("CAPTION_STYLE") != "" else "line"
	var at: float = float(OS.get_environment("CAPTION_AT")) if OS.get_environment("CAPTION_AT") != "" else 0.6
	var hold: float = float(OS.get_environment("CAPTION_FOR")) if OS.get_environment("CAPTION_FOR") != "" else 2.6
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 60
	t.root.add_child(layer)
	var box: Control = Control.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.modulate.a = 0.0
	layer.add_child(box)
	var shade: TextureRect = TextureRect.new()
	shade.texture = FxSheet.glow()
	shade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shade.modulate = Color(0, 0, 0, 0.75 if style != "line" else 0.6)
	box.add_child(shade)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	box.add_child(col)
	var big: Label = Label.new()
	big.text = text
	# The name as the game's own title screen sets it: cream Cinzel, spaced.
	big.add_theme_font_override("font", Kit.tracked("cinzel", 700, 76, 0.08) if style != "line" else Kit.font("cinzel", 700))
	big.add_theme_font_size_override("font_size", 76 if style != "line" else 46)
	big.add_theme_color_override("font_color", Color(0.97, 0.92, 0.82))
	big.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
	big.add_theme_constant_override("shadow_outline_size", 14)
	col.add_child(big)
	if style == "end" and OS.get_environment("SUB") != "":
		var sub: Label = Label.new()
		sub.text = OS.get_environment("SUB").to_upper()
		sub.add_theme_font_override("font", Kit.tracked("karla", 800, 22, 0.24))
		sub.add_theme_font_size_override("font_size", 22)
		sub.add_theme_color_override("font_color", Color(0.97, 0.92, 0.82))
		sub.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
		sub.add_theme_constant_override("shadow_outline_size", 10)
		sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(sub)
	var vp: Vector2 = t.root.get_visible_rect().size
	if style == "line":
		big.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		col.position = Vector2(vp.x * 0.07, vp.y * 0.70)
		shade.position = col.position + Vector2(-220, -110)
		shade.size = Vector2(1300, 300)
	else:
		big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.size = Vector2(vp.x, 0)
		col.position = Vector2(0, vp.y * 0.40)
		shade.position = Vector2(vp.x * 0.12, vp.y * 0.22)
		shade.size = Vector2(vp.x * 0.76, vp.y * 0.5)
	var tw: Tween = box.create_tween()
	tw.tween_interval(at)
	tw.tween_property(box, "modulate:a", 1.0, 0.55).set_trans(Tween.TRANS_SINE)
	tw.parallel().tween_property(col, "position:y", col.position.y - 10.0, 1.2).from(col.position.y + 8.0).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_interval(hold)
	if style != "end":
		tw.tween_property(box, "modulate:a", 0.0, 0.5)


func _hold() -> void:
	await tree.create_timer(float(OS.get_environment("MOVIE_S")) if OS.get_environment("MOVIE_S") != "" else 6.0).timeout
	print("END ", Engine.get_frames_drawn())


## Each frame, every HUD part hidden but the ones a shot keeps (the HUD shows
## its parts again as it updates, so once is not enough).
class Clean:
	extends Node
	var hud: Control
	var keep: Array = []

	## When set: hide only these (script class names), leave the rest be.
	var only: Array = []

	func _process(_d: float) -> void:
		for c: Node in hud.get_children():
			if not only.is_empty():
				if c is CanvasItem and c.get_script() != null and only.has(c.get_script().get_global_name()):
					(c as CanvasItem).visible = false
				continue
			if c is CanvasItem:
				var mine: bool = false
				for k0: Variant in keep:
					# A name is a HUD field read each frame (the card comes later).
					var k: Variant = hud.get(k0) if k0 is String else k0
					if k != null and is_instance_valid(k) and (k == c or (c as Node).is_ancestor_of(k)):
						mine = true
				# Hide the rest; what is kept shows or hides as the HUD says.
				if not mine:
					(c as CanvasItem).visible = false


func _clean(keep: Array = []) -> void:
	var cl: Clean = Clean.new()
	cl.hud = hud
	cl.keep = keep
	tree.root.add_child(cl)


func run(t: SceneTree, s: Sea, h: FishingHud, prof: Dictionary, clip: String) -> void:
	tree = t
	sea = s
	hud = h
	p = prof
	match clip:
		"sail": await _sail(false)
		"flotilla": await _sail(true)
		"night": await _sail(true)
		"together": await _together()
		"coop": await _coop()
		"summon": await _summon()
		"mega": await _mega()
		"log": await _log()
		"crate": await _crate()
		"recruit": await _recruit()
		"armory": await _armory()
		"forge": await _forge()
		"fish": await _fish()
		"treasure": await _treasure()
		"pets": await _pets()
		"wardrobe": await _wardrobe()
		"recruits": await _recruits()
		"skinreel": await _skinreel()
		"north": await _north()
		"people": await _people()


## Three crewmates in looks of their own, each a Shipmate on your sea.
func _crew(names: Array) -> void:
	var cols: Array = ["sky", "ruby", "forest", "lavender"]
	var hats: Array = ["black", "golden", "green", "purple"]
	var boats: Array = ["mahogany", "fire", "ice", "celestial"]
	for i: int in names.size():
		var m: Shipmate = sea._mate(str(names[i]).to_lower())
		m.set_mate_name(str(names[i]))
		var look: Dictionary = Skipper.look_of(p).duplicate()
		look["color"] = cols[i % cols.size()]
		look["hat"] = hats[i % hats.size()]
		look["boat"] = boats[i % boats.size()]
		m.set_look(look)
		_mates.append(m)


## Each crewmate kept at their place round your hull, sailing as you sail.
func _keep(pose: String = "rest") -> void:
	var b: Boat = sea._boat
	for i: int in _mates.size():
		var at: Vector2 = b.position + (_offsets[i] as Vector2)
		var wob: Vector2 = Vector2(sin(Time.get_ticks_msec() * 0.0007 + i * 2.0) * 30.0, cos(Time.get_ticks_msec() * 0.0009 + i) * 18.0)
		(_mates[i] as Shipmate).state({ "x": at.x + wob.x, "y": at.y + wob.y, "vx": b.velocity.x, "vy": b.velocity.y, "facing": 1.0 if b.velocity.x >= 0.0 else -1.0, "pose": pose })


func _sail(crew: bool) -> void:
	var b: Boat = sea._boat
	_clean()
	b.position = Chart.HOME + Vector2(700, 600)
	b.heading = 0.15
	sea._zoom_to = 0.85 if crew else 1.0
	sea._camera.zoom = Vector2.ONE * sea._zoom_to
	if crew:
		_crew(["Ben", "Cal", "Dot"])
		_offsets = [Vector2(-360, -300), Vector2(-420, 300), Vector2(-760, 10)]
		_keep()
	b.target = b.position + Vector2(9000, 1400)
	for f: int in 90:
		_keep()
		await tree.process_frame
	_mark()
	var end: float = Time.get_ticks_msec() + 1000.0 * (float(OS.get_environment("MOVIE_S")) if OS.get_environment("MOVIE_S") != "" else 6.0)
	var frames: int = int(60.0 * (float(OS.get_environment("MOVIE_S")) if OS.get_environment("MOVIE_S") != "" else 6.0))
	for f: int in frames:
		_keep()
		await tree.process_frame
	print("END ", Engine.get_frames_drawn())


## Fishing side by side: the crew at their lines round you, then your own
## cast, the bite, a perfect strike and the catch.
func _together() -> void:
	var b: Boat = sea._boat
	b.position = Vector2(-1500, 2600)
	sea._zoom_to = 0.95
	sea._camera.zoom = Vector2.ONE * 0.95
	_clean(["_dial", "_card", "_toast", "_status"])
	_crew(["Ben", "Cal"])
	_offsets = [Vector2(-430, -240), Vector2(450, 230)]
	for f: int in 30:
		_keep("wait")
		await tree.process_frame
	# The rules' clock runs on from the shot's own moment (SHOT_T keeps its
	# light), and jumps past the wait for the bite.
	var ahead: Array = [0.0]
	var t0: float = Clock.now_ms()
	var tick0: float = float(Time.get_ticks_msec())
	Clock.install(func() -> float: return t0 + (float(Time.get_ticks_msec()) - tick0) + float(ahead[0]))
	_mark()
	for f: int in 40:
		_keep("wait")
		await tree.process_frame
	(_mates[0] as Shipmate).state({ "x": b.position.x - 430, "y": b.position.y - 240, "facing": 1.0, "pose": "cast" })
	hud.cast()
	for f: int in 50:
		await tree.process_frame
	ahead[0] = float(hud._shot["waitMs"]) + 1000.0
	hud._wait_left = 1.2
	var guard: int = 0
	while hud.phase != "hooked" and guard < 900:
		guard += 1
		await tree.process_frame
	for f: int in 50:
		await tree.process_frame
	# The strike, perfect (as the needle would land it); then the HUD may say
	# what came up (the catch's own words), with only the clutter kept down.
	await _strike_true()
	for n: Node in tree.root.get_children():
		if n is Clean:
			(n as Clean).queue_free()
	var quiet: Clean = Clean.new()
	quiet.hud = hud
	quiet.keep = []
	quiet.only = ["FinnArrow", "StoryLine", "XpBar"]
	tree.root.add_child(quiet)
	await _hold()


func _stage() -> BattleStage:
	for n: Node in sea._hud_layer.get_children():
		if n is BattleStage:
			return n
	return null


## A Charter's raid, as Anna's screen sees it: Ben's ship beside hers, both
## orders in, a crossfire round played out.
func _coop() -> void:
	var kdb: CaptainStore = sea.session.store
	var ku: String = sea.session.uid
	p["expedition_xp"] = 2000.0
	p["ship_tier"] = 5.0
	for d: int in 2:
		var kst: Dictionary = RulesApi.run(kdb, ku, "getCrewState", [])
		for c: Dictionary in kst["board"]:
			RulesApi.run(kdb, ku, "recruitCrew", [c["id"]])
		p["last_free_recruit_date"] = "old%d" % d
	var kids: Array = (RulesApi.run(kdb, ku, "getCrewState", [])["roster"] as Array).map(func(m: Dictionary) -> float: return float(m["id"]))
	for k: int in mini(3, kids.size()):
		RulesApi.run(kdb, ku, "assignToRaid", [kids[k], float(k)])
	var tb: RaidTable = RaidTable.new()
	tree.root.add_child(tb)
	var s0: Dictionary = Battle.seat_for(kdb, ku, "Anna")
	s0["key"] = "anna"
	var s1: Dictionary = Battle.seat_for(kdb, ku, "Ben")
	s1["key"] = "ben"
	Dice.install(Dice.Mulberry32.new(7))
	var kb: Dictionary = Battle.begin("captain_krust", [s0, s1], "normal")
	var mate: Shipmate = sea._mate("ben")
	mate.set_mate_name("Ben")
	var look: Dictionary = Skipper.look_of(p).duplicate()
	look["color"] = "ruby"
	look["hat"] = "golden"
	mate.set_look(look)
	var gate: Vector2 = North.SEA_GATE + Vector2(-300, -1300)
	var mp: Vector2 = gate + BattleStage._offset(1)
	mate.state({ "x": mp.x, "y": mp.y, "facing": 1.0 })
	sea._boat.position = gate + Vector2(-400, 200)
	var seq: Array = [1]
	var push: Callable = func(ph: String, ev: Array, extra: Dictionary) -> void:
		seq[0] += 1 if ph == "playing" else 0
		var st: Dictionary = { "phase": ph, "seq": seq[0], "b": kb.duplicate(true), "ev": ev, "after": "plan", "left": 30.0, "plans": {}, "raidId": "captain_krust", "nodeId": "", "members": [{ "key": "anna", "name": "Anna" }, { "key": "ben", "name": "Ben" }], "result": "" }
		st.merge(extra, true)
		tb._state(st)
	push.call("playing", [{ "t": "begin" }], {})
	sea.open_coop_battle(tb.state, "anna")
	var bs: BattleStage = null
	for f: int in 10:
		await tree.process_frame
	bs = _stage()
	bs._spoke = true
	for f: int in 200:
		await tree.process_frame
	kb["seats"][0]["charges"] = 3.0
	kb["seats"][1]["charges"] = 3.0
	push.call("plan", [], { "plans": { "ben": { "action": "volley", "aim": "critical" } } })
	for f: int in 20:
		await tree.process_frame
	_mark()
	for f: int in 50:
		await tree.process_frame
	bs._choose("volley")
	for f: int in 70:
		await tree.process_frame
	for bar: Node in bs.find_children("", "AimBar", true, false):
		(bar as AimBar)._pos = (bar as AimBar)._zone
		(bar as AimBar).lock()
	for f: int in 30:
		await tree.process_frame
	var ev: Array = Battle.resolve(kb, [{ "action": "volley", "aim": "critical" }, { "action": "volley", "aim": "critical" }])
	push.call("playing", ev, {})
	await _hold()


## A crewmate's order: their figure stands up out of the line, then their
## summon plays on the water.
func _summon() -> void:
	var bdb: CaptainStore = sea.session.store
	var bu: String = sea.session.uid
	p["expedition_xp"] = 2000.0
	p["ship_tier"] = 5.0
	for d: int in 2:
		var st1: Dictionary = RulesApi.run(bdb, bu, "getCrewState", [])
		for c: Dictionary in st1["board"]:
			RulesApi.run(bdb, bu, "recruitCrew", [c["id"]])
		p["last_free_recruit_date"] = "old%d" % d
	var ids2: Array = (RulesApi.run(bdb, bu, "getCrewState", [])["roster"] as Array).map(func(m: Dictionary) -> float: return float(m["id"]))
	for k: int in mini(3, ids2.size()):
		RulesApi.run(bdb, bu, "assignToRaid", [ids2[k], float(k)])
	if sea._berths.has("gunwharf"):
		sea._boat.position = (sea._berths["gunwharf"] as Node2D).position + Vector2(-500, 200)
	for f: int in 60:
		await tree.process_frame
	sea._launch("corsairs_reckoning", "")
	for f: int in 10:
		await tree.process_frame
	var bs: BattleStage = _stage()
	bs._spoke = true
	while bs._busy:
		await tree.process_frame
	for f: int in 30:
		await tree.process_frame
	_mark()
	for f: int in 40:
		await tree.process_frame
	var crew: Array = bs.b["seats"][0]["crew"]
	var who: int = mini(1, crew.size() - 1)
	bs._toggle_order(crew[who])
	for f: int in 50:
		await tree.process_frame
	var sc: Dictionary = crew[who]
	var cls: String = OS.get_environment("SUM_CLS") if OS.get_environment("SUM_CLS") != "" else "blitz"
	bs._busy = true
	bs._clear_deck()
	bs._one({ "t": "ability", "seat": 0, "crew": sc["id"], "cls": cls, "name": sc.get("name", ""), "target": 0, "heal": 12.0, "hits": [4.0, 5.0, 6.0], "dmg": 15.0, "charges": 2.0, "shield": 8.0 })
	await _hold()


## The Man-o-War's Mega: Fire chosen, the Mega picked, the aim locked true.
func _mega() -> void:
	var bdb: CaptainStore = sea.session.store
	var bu: String = sea.session.uid
	p["expedition_xp"] = 2000.0
	p["ship_tier"] = 6.0
	for d: int in 2:
		var st1: Dictionary = RulesApi.run(bdb, bu, "getCrewState", [])
		for c: Dictionary in st1["board"]:
			RulesApi.run(bdb, bu, "recruitCrew", [c["id"]])
		p["last_free_recruit_date"] = "old%d" % d
	var ids2: Array = (RulesApi.run(bdb, bu, "getCrewState", [])["roster"] as Array).map(func(m: Dictionary) -> float: return float(m["id"]))
	for k: int in mini(3, ids2.size()):
		RulesApi.run(bdb, bu, "assignToRaid", [ids2[k], float(k)])
	if sea._berths.has("gunwharf"):
		sea._boat.position = (sea._berths["gunwharf"] as Node2D).position + Vector2(-500, 200)
	for f: int in 60:
		await tree.process_frame
	sea._launch("captain_krust", "")
	for f: int in 10:
		await tree.process_frame
	var bs: BattleStage = _stage()
	bs._spoke = true
	while bs._busy:
		await tree.process_frame
	var ms: Dictionary = bs.b["seats"][0]
	ms["mega"] = Armory.augment(OS.get_environment("MEGA") if OS.get_environment("MEGA") != "" else "railgun")
	ms["maxCharges"] = 4.0
	ms["charges"] = 4.0
	bs.b["enemy"]["pattern"] = ["reload"]
	bs._paint_actions()
	for f: int in 20:
		await tree.process_frame
	_mark()
	for f: int in 30:
		await tree.process_frame
	bs._choose("mega")
	for f: int in 55:
		await tree.process_frame
	for bar: Node in bs.find_children("", "AimBar", true, false):
		(bar as AimBar)._pos = (bar as AimBar)._zone
		(bar as AimBar).lock()
	await _hold()


# ── The second pass (Kong, 2026-10-05: the log, crates, recruits, ship items) ──

## A button anywhere under n whose words begin so (Paper buttons are capitals).
func _button(n: Node, starts: String) -> BaseButton:
	for c: Node in n.find_children("", "BaseButton", true, false):
		if c is Button and (c as Button).text.to_upper().begins_with(starts.to_upper()) and not (c as Button).disabled:
			return c
	return null


## A captain with a log worth showing: most of the sea's fish caught, a few
## golden, many new.
func _fill_log() -> void:
	var save: Dictionary = sea.session.save
	var n: int = 0
	for f: Dictionary in save["species"]:
		if str(f.get("habitat", "")) == "ancient_deep":
			continue
		n += 1
		if n % 5 == 3:
			continue
		var id: String = str(int(f["id"]))
		save["collection"][id] = { "catch_count": float(1 + (n * 7) % 13), "is_golden": n % 11 == 0 }
		save["lifetime"][id] = { "n": float(2 + (n * 5) % 19), "last": "2026-10-04T10:00:00.000Z", "first": "2026-09-29T10:00:00.000Z" }
	p["lifetime_species_count"] = float(save["collection"].size())


## THE FISHING LOG: the collector's page, the book of the sea's fish, read
## down slowly.
func _log() -> void:
	_fill_log()
	hud._open_log()
	for f: int in 40:
		await tree.process_frame
	_mark()
	for f: int in 30:
		await tree.process_frame
	var sc: ScrollContainer = null
	for c: Node in tree.root.find_children("", "ScrollContainer", true, false):
		if (c as ScrollContainer).is_visible_in_tree() and (c as ScrollContainer).get_v_scroll_bar().max_value > 400.0:
			sc = c
	if sc != null:
		var tw: Tween = sc.create_tween()
		tw.tween_property(sc, "scroll_vertical", 520, 3.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	await _hold()


## A CHEST OPENED: the gold crate from the Locker's crates.
func _crate() -> void:
	p["crate_stash"] = { "gold": 2.0, "wooden": 3.0, "ancient": 1.0 }
	hud._open_loadout()
	for f: int in 30:
		await tree.process_frame
	sea._locker._show_tab("crates")
	for f: int in 30:
		await tree.process_frame
	_mark()
	for f: int in 30:
		await tree.process_frame
	sea._locker._open_crate("gold")
	await _hold()


## NEW HANDS: the board re-rolled with a posted notice, a hand picked, signed on.
func _recruit() -> void:
	p["crew_notices"] = { "harbor_bill": 2.0 }
	# Room aboard to sign them (a seasoned captain, a built hall).
	p["expedition_xp"] = 3000000.0
	p["crew_hall_tier"] = 6.0
	var save_crew: Array = Js.list(sea.session.save.get("crew"))
	sea.session.save["crew"] = save_crew.slice(0, mini(8, save_crew.size()))
	var ch: CrewHall = CrewHall.new()
	ch.session = sea.session
	ch.room = "recruit"
	sea._room_layer.add_child(ch)
	for f: int in 30:
		await tree.process_frame
	_mark()
	for f: int in 45:
		await tree.process_frame
	var post: BaseButton = _button(ch, "Post it")
	if post != null:
		post.pressed.emit()
	for f: int in 80:
		await tree.process_frame
	var board: Array = Js.list(ch._state.get("board"))
	if not board.is_empty():
		var best: Dictionary = board[0]
		for c: Dictionary in board:
			if float(c.get("rarity", 1.0)) > float(best.get("rarity", 1.0)):
				best = c
		ch._pick = best
		ch._pick_kind = "board"
		ch._draw_room()
	for f: int in 55:
		await tree.process_frame
	var sign: BaseButton = _button(ch, "Sign on")
	if sign != null:
		sign.pressed.emit()
	await _hold()


func _items_owned() -> void:
	p["ship_tier"] = 6.0
	p["expedition_xp"] = 3000000.0
	p["raid_items"] = ["gunners_sight", "reinforced_hull", "war_drum", "corsair_prime_cannon", "corsair_prime_cannon", "captains_carapace", "davys_hand_cannon", "navigators_compass", "quartermasters_anchor", "incendiary_cannonball", "frozen_cannonball", "thunder_drum"]
	p["equipped_raid_items"] = ["corsair_prime_cannon", "gunners_sight", "captains_carapace"]


## SHIP ITEMS: the Gunwharf's armory, her mounts and the hold of pieces.
func _armory() -> void:
	_items_owned()
	var gw: GunwharfSheet = GunwharfSheet.new()
	gw.session = sea.session
	gw._tab = "armory"
	sea._room_layer.add_child(gw)
	for f: int in 30:
		await tree.process_frame
	_mark()
	await _hold()


## THE FORGE: two pieces on the anvil, a recipe discovered, forged.
func _forge() -> void:
	_items_owned()
	p["gauntlet_upgrades"] = ["forge"]
	p["dons_gauntlet_upgrades"] = ["dg_abyssal_forge", "dg_abyssal_accel"]
	p["gauntlet_fathoms"] = 340.0
	p["forge_scrap"] = 60.0
	p["forge_recipes_learned"] = ["heavy_gunners_sight", "dreadnought_cannon"]
	hud._set_phase("idle")
	hud._dial.visible = false
	sea._dock("forge_isle")
	var fb: ForgeBench = null
	for f: int in 12:
		await tree.process_frame
	for n: Node in sea._room_layer.get_children():
		if n is ForgeBench:
			fb = n
	fb._tab = "anvil"
	fb._paint()
	for f: int in 20:
		await tree.process_frame
	_mark()
	for f: int in 40:
		await tree.process_frame
	fb._slots = ["incendiary_cannonball", ""]
	fb._paint()
	for f: int in 35:
		await tree.process_frame
	fb._slots = ["incendiary_cannonball", "frozen_cannonball"]
	fb._try()
	for f: int in 90:
		await tree.process_frame
	var go: BaseButton = _button(fb, "Forge it")
	if go != null:
		go.pressed.emit()
	await _hold()


# ── The third pass (Kong, 2026-10-05: more fishing, the collectables, treasure) ──

## FISHING, CLOSE: the cast, the bite, the dial, a perfect strike, the reel, and
## the catch as the game shows it (its note, the fish into the hold), a
## crewmate at their line nearby.
func _fish() -> void:
	var b: Boat = sea._boat
	b.position = Vector2(-1500, 2600)
	sea._zoom_to = 1.55
	sea._camera.zoom = Vector2.ONE * 1.55
	_clean(["_dial", "_card", "_toast", "_status"])
	_crew(["Ben"])
	_offsets = [Vector2(-330, -170)]
	for f: int in 30:
		_keep("wait")
		await tree.process_frame
	var ahead: Array = [0.0]
	var t0: float = Clock.now_ms()
	var tick0: float = float(Time.get_ticks_msec())
	Clock.install(func() -> float: return t0 + (float(Time.get_ticks_msec()) - tick0) + float(ahead[0]))
	_mark()
	for f: int in 20:
		_keep("wait")
		await tree.process_frame
	hud.cast()
	for f: int in 60:
		await tree.process_frame
	ahead[0] = float(hud._shot["waitMs"]) + 1000.0
	hud._wait_left = 0.8
	var guard: int = 0
	while hud.phase != "hooked" and guard < 900:
		guard += 1
		await tree.process_frame
	for f: int in 55:
		await tree.process_frame
	await _strike_true()
	for n: Node in tree.root.get_children():
		if n is Clean:
			(n as Clean).queue_free()
	var quiet: Clean = Clean.new()
	quiet.hud = hud
	quiet.only = ["FinnArrow", "StoryLine", "XpBar"]
	tree.root.add_child(quiet)
	while hud.phase != "result" and guard < 1500:
		guard += 1
		await tree.process_frame
	await _hold()


## BURIED TREASURE: a clue scroll's last step, the casket hauled up.
func _treasure() -> void:
	var site: Dictionary = (Rules.data()["digSites"] as Array)[0]
	sea._boat.position = Vector2(float(site["x"]) + 160.0, float(site["y"]) + 60.0)
	sea._zoom_to = 1.2
	_clean()
	for f: int in 60:
		await tree.process_frame
	_mark()
	for f: int in 45:
		await tree.process_frame
	Sound.chest(true)
	var lines: Array = [["The %s's hunt is done. The casket held:" % Clues.TIER_NAME["hard"], "note"],
		["A Captain's Voucher! Open it in the Crew Hall's Trunk", "body_strong"],
		["A Harbor Bill, for the Crew Hall", "body_strong"],
		["A Gold Crate, stowed in your Locker", "body_strong"]]
	sea._show_find(SeaFinds.panel(sea._room_layer, "sea/dig-box.png", "Hauled up from the bottom", "%s casket" % Clues.TIER_NAME["hard"], lines, [[4200.0, "doubloons"]]))
	await _hold()


## PETS: the Locker's pets, a row of them to choose from.
func _pets() -> void:
	p["unlocked_pets"] = ["parrot_red", "parrot_gold", "monkey_golden", "seal_gray", "lizard_indigo", "raccoon_black", "crab_gold", "crab_blue"]
	p["equipped_pet"] = "parrot_red"
	hud._open_loadout()
	for f: int in 20:
		await tree.process_frame
	sea._locker.slot = "pet"
	sea._locker._show_tab("loadout")
	for f: int in 30:
		await tree.process_frame
	_mark()
	await _hold()


## THE LOCKER, A HIGHLIGHT REEL (Kong, 2026-10-05: "switching between various
## ship skins, cosmetics, rods"): her boat, rod, colour, hat and pet changed on
## a beat, the Locker following each to its page.
func _wardrobe() -> void:
	p["unlocked_boats"] = ["oak", "fire", "golden", "celestial", "ice", "abyssal", "mahogany", "periwinkle"]
	p["unlocked_hats"] = ["golden", "cheetah", "fuego", "midnight", "sky", "spotted"]
	p["unlocked_pets"] = ["parrot_red", "parrot_gold", "monkey_golden", "seal_gray", "lizard_indigo", "crab_gold"]
	p["rod_tier"] = 5.0
	hud._open_loadout()
	for f: int in 20:
		await tree.process_frame
	sea._locker.slot = "rod"
	sea._locker._show_tab("loadout")
	for f: int in 20:
		await tree.process_frame
	_mark()
	var steps: Array = [
		["boat", "equipped_boat", "celestial"], ["boat", "equipped_boat", "fire"], ["boat", "equipped_boat", "golden"],
		["rod", "rod_tier", 2.0], ["rod", "rod_tier", 4.0], ["rod", "rod_tier", 5.0], ["rod", "rod_tier", 6.0], ["rod", "rod_tier", 7.0], ["rod", "rod_tier", 8.0], ["rod", "rod_tier", 9.0], ["rod", "rod_tier", 10.0], ["rod", "rod_tier", 11.0],
		["skin", "character_color", "galaxy"], ["skin", "character_color", "lava"],
		["hat", "equipped_hat", "fuego"], ["hat", "equipped_hat", "golden"],
		["pet", "equipped_pet", "monkey_golden"], ["pet", "equipped_pet", "parrot_gold"],
	]
	for st: Array in steps:
		await tree.create_timer(0.36 if st[0] == "rod" else 0.46).timeout
		p[st[1]] = st[2]
		if st[0] == "boat":
			if sea._locker.tab != "boat":
				sea._locker._show_tab("boat")
			else:
				sea._locker._show_tab("boat")
		else:
			sea._locker.slot = st[0]
			sea._locker._show_tab("loadout")
		sea._boat.set_look(Skipper.look_of(p))
		Sound.plip()
	await _hold()


# ── The fourth pass (Kong, 2026-10-05: more crew and rerolls, a skin reel) ──

## THE CREW HALL, ROLLED AGAIN AND AGAIN: three notices posted, each a fresh
## board, the last with a Legendary answering; that hand picked, signed on.
func _recruits() -> void:
	p["crew_notices"] = { "harbor_bill": 3.0 }
	p["expedition_xp"] = 3000000.0
	p["crew_hall_tier"] = 6.0
	var save_crew: Array = Js.list(sea.session.save.get("crew"))
	sea.session.save["crew"] = save_crew.slice(0, mini(8, save_crew.size()))
	var ch: CrewHall = CrewHall.new()
	ch.session = sea.session
	ch.room = "recruit"
	sea._room_layer.add_child(ch)
	for f: int in 30:
		await tree.process_frame
	_mark()
	for k: int in 3:
		await tree.create_timer(0.9 if k == 0 else 1.15).timeout
		if k == 2:
			# The last board: a Legendary among them (the game's own moment).
			var r: Dictionary = await ch._act("postNotice", ["harbor_bill"])
			var recs: Array = Js.list(sea.session.save.get("recruits"))
			var cat: Dictionary = {}
			for c: Dictionary in Crew.cards():
				if str(c.get("slug", "")).to_lower() == "catfish":
					cat = c
			if not recs.is_empty() and not cat.is_empty():
				recs[1]["card_id"] = cat["id"]
				recs[1]["rarity"] = 4.0
			await ch._load()
			ch._pick = {}
			ch._draw_room()
			Sound.chest(true)
			ch._sign_on_moment("A Legendary answers!", Color("#f0c040"))
		else:
			var post: BaseButton = _button(ch, "Post it")
			if post != null:
				post.pressed.emit()
	await tree.create_timer(1.6).timeout
	for c2: Dictionary in Js.list(ch._state.get("board")):
		if float(c2.get("rarity", 1.0)) >= 4.0:
			ch._pick = c2
			ch._pick_kind = "board"
	ch._draw_room()
	await tree.create_timer(1.0).timeout
	var sign: BaseButton = _button(ch, "Sign on")
	if sign != null:
		sign.pressed.emit()
	await _hold()


## CREW SKINS, A REEL: a voucher's reveal after another, each a skin to own.
func _skinreel() -> void:
	for d: int in 4:
		var st: Dictionary = RulesApi.run(sea.session.store, sea.session.uid, "getCrewState", [])
		for c: Dictionary in st["board"]:
			RulesApi.run(sea.session.store, sea.session.uid, "recruitCrew", [c["id"]])
		p["last_free_recruit_date"] = "old%d" % d
	var reveals: Array = []
	for kind: String in ["captain", "captain", "bosun", "captain", "bosun", "captain", "captain"]:
		Skins.grant(sea.session.store, sea.session.uid, kind, 1.0)
		var r: Dictionary = Skins.open(sea.session.store, sea.session.uid, kind)
		if r.has("skin"):
			reveals.append(r)
	var ch: CrewHall = CrewHall.new()
	ch.session = sea.session
	ch.room = "trunk"
	sea._room_layer.add_child(ch)
	for f: int in 20:
		await tree.process_frame
	_mark()
	# One voucher opened all the way, then the trunk's skins one after another.
	if reveals.is_empty():
		await _hold()
		return
	var show: Node = SkinReveal.play(ch, reveals[0])
	await tree.create_timer(2.9).timeout
	if is_instance_valid(show):
		show.queue_free()
	await ch._load()
	for r2: Dictionary in reveals.slice(1):
		ch._pick = r2["skin"]
		ch._pick_kind = "skin"
		ch._draw_room()
		Sound.plip()
		await tree.create_timer(0.62).timeout
	await _hold()


## THE NORTHERN SEAS: north through the arch, onto the campaign's water.
func _north() -> void:
	_clean()
	sea._boat.position = Vector2(North.GATE_X, Explore.NORTH_WALL + 520.0)
	sea._boat.heading = -PI / 2.0
	sea._zoom_to = 1.0
	for f: int in 20:
		await tree.process_frame
	_mark()
	sea._boat.target = Vector2(North.GATE_X, Explore.NORTH_WALL - 1400.0)
	await _hold()


## The strike as a player makes it: the needle is let run until it is in the
## perfect band, then the dial is struck (Kong: the dial must be seen landing
## in the zone, not a catch over a miss). A late zone's fallback: the catch band.
func _strike_true() -> void:
	var guard: int = 0
	while hud._dial.zone_at(hud._dial.angle) != "perfect" and guard < 900:
		guard += 1
		await tree.process_frame
	if hud._dial.zone_at(hud._dial.angle) != "perfect":
		while hud._dial.zone_at(hud._dial.angle) == "miss" and guard < 1400:
			guard += 1
			await tree.process_frame
	hud._dial.strike()


## THE REGULARS: the Journal's people, who you know on the water and how well,
## a few still to meet.
func _people() -> void:
	var pts: Array = [48.0, 30.0, 18.0, 9.0, 4.0, 1.0]
	var roster: Array = Folk.roster()
	for i: int in mini(pts.size(), roster.size()):
		var f0: Dictionary = roster[i]
		Folk._ensure(sea.session.store, f0["id"])
		Folk._row(sea.session.store, f0["id"])["points"] = pts[i]
	hud.open_journal("people")
	for f: int in 30:
		await tree.process_frame
	_mark()
	await _hold()
