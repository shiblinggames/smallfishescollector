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
	big.add_theme_font_override("font", Kit.font("cinzel", 800 if style != "line" else 700))
	big.add_theme_font_size_override("font_size", 96 if style != "line" else 46)
	big.add_theme_color_override("font_color", Color(0.97, 0.92, 0.82) if style == "line" else Color("#f0c040"))
	big.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
	big.add_theme_constant_override("shadow_outline_size", 14)
	col.add_child(big)
	if style == "end" and OS.get_environment("SUB") != "":
		var sub: Label = Label.new()
		sub.text = OS.get_environment("SUB")
		sub.add_theme_font_override("font", Kit.font("cinzel", 700))
		sub.add_theme_font_size_override("font_size", 34)
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
	sea._zoom_to = 1.3 if crew else 1.7
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
	sea._zoom_to = 1.35
	sea._camera.zoom = Vector2.ONE * 1.35
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
	hud._on_struck("perfect", 0.0)
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
