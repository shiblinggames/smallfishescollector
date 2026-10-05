class_name BattleStage
extends Control
## THE FIGHT ON THE WATER (Kong, 2026-10-03: a battle screen of its own for a
## raid's set run of enemies, "but a super seamless cut from the sea", and a
## free hand on the look "utilizing Godot and for multiplayer"). The sea
## itself becomes the screen: the camera eases onto the two of you, black
## bars slide in top and bottom, the HUD of the sea falls away and the deck
## rises; the enemy is a real hull in the same water, sailing in from the
## right with its portrait over the masthead. Nothing is swapped, so there is
## no seam to hide.
##
##   THE DECK   Fire (1), Volley (3), Reload, Dodge (keys 1 to 4), your
##              charges, and your crew's orders as cards (one a turn, each
##              once a raid; a heal or shield may go to a crewmate's ship).
##              Fire or Volley brings up the aim bar in the deck's place.
##   A ROUND    plays as a show: crew orders pop as cards, the turn strip at
##              the top lights each ship as it acts, cannonballs arc across
##              the water, splashes, splinters and numbers; a sinking hull
##              goes under; after a kill the next enemy sails in.
##   THE END    the crate (or, sunk, the sail back to the Gunwharf).
## Rules: core/battle.gd and core/raid_run.gd.
##
## TOGETHER (a Charter's raid, game/raid_table.gd): the founder's game runs the
## fight and every screen follows it. Each captain sits in their own seat of the
## line with their own deck; a round is planned by all, then played on every
## screen from the same events; the flares and the tides are each one's own.
## A captain sunk or got away leaves the screen; the rest fight on.
##
## A GAUNTLET (game/gauntlet_table.gd, alone or together): the screen stays up
## for the whole dive. Each new depth is called over the water (its number,
## the band of the deep, the host's voice), the field sails in, and between
## fights the dive's sheet comes up (game/gauntlet_overlay.gd): the curse, the
## draft table, the shrine, the Fence, the Don's job, the breather's vote.
## Sunk in a dive the crew win, a ship is towed along and rejoins.

signal finished(won: bool)

const BAR: float = 74.0
const NIGHT: Color = Color("#1a1512")
const BRASS: Color = Color(0.86, 0.68, 0.36)
const CREAM: Color = Color(0.96, 0.92, 0.84)
## Ink on the night paper.
const NIGHT_INK: Color = Color(0.93, 0.88, 0.78)

var sea: Sea
var raid_id: String = "corsairs_reckoning"
var b: Dictionary = {}
var _raid: Dictionary = {}
var _at: Vector2
var _enemy_at: Vector2
var _enemy: HullRig
var _fx: BattleFx
var _bars: float = 0.0
var _deck: Control
var _deck_box: VBoxContainer
var _crew_row: HBoxContainer
var _log: Label
## The combat log on the right edge (game/combat_log.gd).
var _clog: CombatLog
## The deck's paper and panel (faded away while the aim bar floats free).
var _deck_bg: Array = []
## The deck: orders on the left, the log's last lines on the right.
const DECK_W: float = 1280.0
## How far the crew's cards stand up above the deck's top edge.
const CREW_LIFT: float = 160.0
const LOG_W: float = 400.0
var _deck_log: Control
var _strip: Array = []
var _strip_lit: int = -99
var _plan: Dictionary = {}
var _busy: bool = true
var _numbers: Array = []
var _banner: Label
var _banner_t: float = -1.0
var _t: float = 0.0
var _portrait: Texture2D
var _shown_hp: Dictionary = {}
## How far the deck has sunk below its place (it rises in, sinks out).
var _drop: float = 260.0
var _from: Vector2
## Out on the campaign's water: the dock she fights from, and the hull riding
## at anchor there (it becomes the enemy it stands for: the skirmish's raider,
## a raid's boss, who waits at anchor while their crew come at you first).
var dock: Vector2 = Vector2.INF
var mark: CampaignWater.Ship = null
var _began_ms: int = 0
## What each hull is wearing (fire, ice, shields, wards, the Last Wall).
var _auras: Dictionary = {}
## Together: the Charter's raid this screen follows, this captain's key and seat.
var table: Node = null
var my_key: String = ""
## A gauntlet dive: its descent ("davy" or "don"), and the sheet between fights.
var gauntlet: String = ""
var _ov: GauntletOverlay = null
## The dive's moments on the water (game/gauntlet_moments.gd), each staged
## before its sheet comes up; the phase the sheet shows; what has been staged.
var _moments: GauntletMoments = null
## The dive's own water: each band's murk, dark, weather and drift (DeepAtmos).
var _atmos: DeepAtmos = null
var _ov_phase: String = ""
var _staged: Dictionary = {}

var me: int = 0
## What this captain has done over the raid, for the feat badges (core/raid_feats.gd).
var _feats: Dictionary = RaidFeats.fresh()
var _latest: Dictionary = {}
var _handled: String = ""
var _pumping: bool = false
var _gone: bool = false
var _spoke: bool = false
var _plan_until: float = 0.0
## A crossfire's lines from the ships to the enemy, fading (seconds left).
var _xfire_seats: Array = []
## A co-op tier's field: every enemy ship's hull, where it rides, its portrait;
## the one an event is about (_cur), and this captain's target.
var _foe_nodes: Array = []
var _foe_pos: Array = []
var _foe_tex: Array = []
var _cur: int = 0
var _target: int = 0
var _xfire_foe: int = 0
## Where each plate was last drawn (key: seat, or "e" and its index).
var _plate_at: Dictionary = {}
var _num_glow: Texture2D = Glow.radial(128, Color.WHITE)
var _xfire_t: float = 0.0
## The pale trail on each plate's health bar (key: seat, or "e"), as a share.
var _trail: Dictionary = {}
## Each captain's avatar, rendered once (seat: texture).
var _faces: Dictionary = {}
## The enemy's stat card while it is open.
var _card: Dossier = null
## Until the card has been opened once, the plate says it can be.
static var card_seen: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.make()
	_raid = Battle.raid_def(raid_id)
	tree_exiting.connect(SteamLayer.presence_home)
	if gauntlet == "":
		SteamLayer.presence("#Raid", { "raid": str(_raid.get("raidTitle", "a raid")) })
	if table != null:
		b = (Js.obj(table.get("state"))["b"] as Dictionary).duplicate(true)
		for i: int in (b["seats"] as Array).size():
			if b["seats"][i].get("key") == my_key:
				me = i
	else:
		var seat: Dictionary = Battle.seat_for(sea.session.store, sea.session.uid, str(sea.session.profile().get("username", "You")))
		b = Battle.begin(raid_id, [seat])
	# Out from wherever she lay into open water: the fight's own patch of sea.
	# Out through the Sea Gate into open water: the fight's own patch of sea
	# (until the campaign's water is in the port, its fights are sailed out
	# to from the Gunwharf). She sails back when it is over.
	_from = sea._boat.position
	_began_ms = Time.get_ticks_msec()
	_at = dock if dock != Vector2.INF else North.SEA_GATE + Vector2(-300, -1300)
	_enemy_at = _at + Vector2(620, -40)
	sea._boat.velocity = Vector2.ZERO
	sea._boat.target = null
	sea._boat.hold_still = true
	# The line faces the enemy, off to the east.
	sea._boat.face_to(1.0)
	for k: Variant in sea._mates:
		(sea._mates[k] as Shipmate).face_lock = 1.0 if table != null else 0.0
		# Their sea nametag gives way to the fight's plate.
		(sea._mates[k] as Shipmate)._plate.visible = false
	var sail: Tween = create_tween()
	sail.tween_property(sea._boat, "position", _at + _offset(me), 2.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	sea._hud.visible = false
	_fx = BattleFx.new()
	_fx.field = sea._field
	_fx.z_index = 6
	sea._world.add_child(_fx)
	_frame()
	_banner = Kit.text(self, "", "display", CREAM)
	_banner.add_theme_font_size_override("font_size", 44)
	_banner.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	_banner.add_theme_constant_override("shadow_outline_size", 12)
	_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_banner.offset_left = -500
	_banner.offset_right = 500
	_banner.offset_top = BAR + 40
	_banner.offset_bottom = BAR + 110
	_banner.modulate.a = 0.0
	_build_deck()
	if gauntlet != "":
		sea.water_theme = _water_theme({})
		_ov = GauntletOverlay.new()
		_ov.my_key = my_key
		_ov.profile = sea.session.profile()
		_ov.face_of = func(k: String) -> Texture2D:
			for i: int in (b["seats"] as Array).size():
				if b["seats"][i].get("key") == k:
					return _face(i)
			return null
		_ov.acted.connect(func(a: Array) -> void:
			var r: Variant = await _act(a)
			if r is Dictionary and (r as Dictionary).has("error"):
				_log_line(str(r["error"])))
		add_child(_ov)
		_moments = GauntletMoments.new()
		_moments.field = sea._field
		_moments.fx = _fx
		sea._world.add_child(_moments)
		_atmos = DeepAtmos.new()
		_atmos.sea = sea
		add_child(_atmos)
		_atmos.set_look(sea.water_theme)
	var tw: Tween = create_tween()
	tw.tween_property(self, "_bars", 1.0, 0.7).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	Sound.horn()
	await sail.finished
	# Where she actually lies (a rock may have held her short).
	_at = sea._boat.position - _offset(me)
	_enemy_at = _at + Vector2(620, -40)
	if _from_mark():
		_enemy_at = mark.position
	_frame()
	var aura: HullAura = HullAura.new()
	aura.width = 300.0
	aura.face = 1.0
	aura.z_index = 2
	sea._boat.add_child(aura)
	_auras[me] = aura
	if table != null:
		table.connect("changed", _pump)
		_pump(Js.obj(table.get("state")))
		return
	await _pre_fight_words()
	await _enemy_enters()
	_await_plan()


## The camera's frame on the fight: centred between the two, zoomed so the
## pair fills the middle of the screen.
func _frame() -> void:
	var vp: Vector2 = get_viewport_rect().size
	# Every ship in the line in the frame (together), the enemy facing them.
	var lo: Vector2 = _at
	var hi: Vector2 = _at
	for i: int in (b["seats"] as Array).size() if not b.is_empty() else 1:
		lo = lo.min(_at + _offset(i))
		hi = hi.max(_at + _offset(i))
	# Where the enemies END UP (their marks), never where they are sailing in
	# from: framed mid-entrance, the camera centred on a ship still off the
	# right of the screen, and every fight sat to the left.
	var mark_of: Callable = func(j: int) -> Vector2: return _foe_pos[j] if j < _foe_pos.size() else _enemy_at
	var elo: Vector2 = mark_of.call(0)
	var ehi: Vector2 = mark_of.call(0)
	for j: int in maxi(1, _foe_pos.size()):
		elo = elo.min(mark_of.call(j))
		ehi = ehi.max(mark_of.call(j))
	lo = lo.min(Vector2(lo.x, elo.y))
	hi = hi.max(Vector2(hi.x, ehi.y))
	var span: float = absf(ehi.x - lo.x) + 520.0
	var tall: float = (hi.y - lo.y) * Chart.GROUND + 560.0
	var z: float = clampf(minf(vp.x * 0.72 / span, vp.y * 0.6 / tall), 0.4, 1.5)
	var mid: Vector2 = Vector2((lo.x + ehi.x) / 2.0, (lo.y + hi.y) / 2.0) - (_at + _offset(me))
	sea.stage = { "zoom": z, "shift": Vector2(mid.x, mid.y * Chart.GROUND - 40.0) * z }


func _process(delta: float) -> void:
	_t += delta
	if not b.is_empty():
		for i: int in (b["seats"] as Array).size():
			var a0: HullAura = _aura(i)
			if a0 == null and i != me:
				a0 = _mate_aura(i)
			if a0 == null:
				continue
			var s0: Dictionary = b["seats"][i]
			a0.burn = not Js.obj(s0.get("burn")).is_empty()
			a0.ice = s0.get("frozenNow", false) or float(s0.get("freeze", 0.0)) > 0.0
			a0.shield = float(s0["shield"])
			a0.wear = Js.obj(s0.get("statuses"))
			if i == me:
				sea._boat.modulate = Color(0.75, 0.88, 1.0) if a0.ice else Color.WHITE
		var fs0: Array = Battle.foes(b)
		for j0: int in mini(fs0.size(), _foe_nodes.size()):
			var ae: HullAura = _aura("e%d" % j0)
			if ae == null or not is_instance_valid(ae):
				continue
			var e0: Dictionary = fs0[j0]
			var en0: HullRig = _foe_nodes[j0] if is_instance_valid(_foe_nodes[j0]) else null
			ae.burn = not Js.obj(e0.get("burn")).is_empty()
			ae.ice = e0.get("frozenNow", false) or float(e0.get("freeze", 0.0)) > 0.0
			ae.shield = float(e0["shield"])
			ae.ward = float(e0.get("ward", 0.0)) > 0.0
			ae.foresight = float(e0.get("foresight", 0.0)) > 0.0
			ae.surge = float(e0.get("wardBuff", 0.0)) > 0.0
			ae.wear = Js.obj(e0.get("statuses"))
			var cl: float = 0.0
			for gk: Variant in Js.obj(e0.get("grip")):
				cl = maxf(cl, float(e0["grip"][gk]))
			ae.coils = int(cl)
			ae.fog = Js.num(e0.get("fogged")) > 0.0
			ae.spot = not Js.obj(e0.get("spot")).is_empty()
			ae.boarded = e0.get("boarded", false) == true
			var ag: Dictionary = Js.obj(e0.get("aegis"))
			ae.wall_left = float(ag.get("left", 0.0))
			ae.wall_of = float(ag.get("of", 0.0))
			if en0 != null and is_instance_valid(en0):
				en0.modulate = Color(0.75, 0.88, 1.0) if ae.ice else _wash(e0)
		# A pack's combo: a rope between its two halves while both float.
		var lk: Array = []
		for j1: int in fs0.size():
			var cb: Dictionary = Js.obj(fs0[j1].get("combo"))
			if cb.is_empty() or str(cb.get("half", "")) != "role":
				continue
			var pj: int = int(cb["with"])
			if pj >= 0 and pj < fs0.size() and Battle.foe_up(fs0[j1]) and Battle.foe_up(fs0[pj]):
				lk.append([_foe_at(j1), _foe_at(pj), Color(1.0, 0.75, 0.55)])
		if _fx != null:
			_fx.links = lk
	if _deck != null:
		# As tall as what is on it (an order row, the aim bar, the die).
		var dh: float = maxf(110.0, _deck_box.get_combined_minimum_size().y + 20.0)
		var top_y: float = -BAR - 12.0 - dh
		# While a round plays the deck stays up (its log is being written);
		# only the orders dim, out of play.
		var dip: float = 0.0
		_deck.offset_top = top_y + dip
		_deck.offset_bottom = -BAR - 12.0 + dip
		_deck_box.modulate.a = 1.0 - 0.65 * clampf(_drop / 190.0, 0.0, 1.0)
		_crew_row.modulate.a = _deck_box.modulate.a
		_log.offset_top = top_y - 54.0
		_log.offset_bottom = top_y - 22.0
	for n: Dictionary in _numbers:
		n["t"] = float(n["t"]) + delta
	_numbers = _numbers.filter(func(n: Dictionary) -> bool: return float(n["t"]) < 1.4)
	if _banner_t >= 0.0:
		_banner_t += delta
		_banner.modulate.a = clampf(_banner_t / 0.2, 0.0, 1.0) * (1.0 - smoothstep(1.6, 2.1, _banner_t))
		if _banner_t > 2.1:
			_banner_t = -1.0
	queue_redraw()


# ── The screen positions of things on the water ──────────────────────────────

func _screen(world_p: Vector2) -> Vector2:
	return sea._world.get_global_transform_with_canvas() * world_p


## Where seat i rides in the line, from the first seat's place.
static func _offset(i: int) -> Vector2:
	return [Vector2.ZERO, Vector2(-300, 340), Vector2(-300, -340), Vector2(-600, 0)][clampi(i, 0, 3)]


func _seat_at(i: int) -> Vector2:
	if i == me:
		return sea._boat.position if sea != null else _at + _offset(i)
	var m: Shipmate = _mate_of(i)
	return m.position if m != null else _at + _offset(i)


## A crewmate's hull on this screen (together), by their seat.
func _mate_of(i: int) -> Shipmate:
	if table == null or sea == null or i >= (b["seats"] as Array).size():
		return null
	var k: String = str(b["seats"][i].get("key", ""))
	var m: Variant = sea._mates.get(k)
	return m if m != null and is_instance_valid(m) else null


func _mate_aura(i: int) -> HullAura:
	var m: Shipmate = _mate_of(i)
	if m == null:
		return null
	var a: HullAura = HullAura.new()
	a.width = 300.0
	a.face = 1.0
	a.z_index = 2
	m.add_child(a)
	_auras[i] = a
	return a


# ── The enemy ────────────────────────────────────────────────────────────────

func _enemy_enters() -> void:
	for n0: Variant in _foe_nodes:
		if n0 != null and is_instance_valid(n0):
			(n0 as Node).queue_free()
	_foe_nodes = []
	_foe_pos = []
	_foe_tex = []
	var fs: Array = Battle.foes(b)
	var at_anchor: bool = _from_mark()
	var lead_at: Vector2 = mark.position if at_anchor else _at + Vector2(620, 60 if mark != null else -40)
	var tw: Tween = null
	# A gauntlet's lead boss or elite comes on its own way (GauntletMoments).
	var lead_kind: String = ""
	var lead_node: HullRig = null
	var lead_spot: Vector2 = Vector2.ZERO
	for j: int in fs.size():
		var e: Dictionary = fs[j]
		var node: HullRig = HullRig.new()
		node.tex = Skipper.tex(str(e["image"]).trim_prefix("/"))
		node.def = {}
		node.box = 400.0 if e["boss"] else (340.0 if j == 0 else 300.0)
		node.face = -1.0
		var at: Vector2 = lead_at + _foe_offset(j)
		var anchored: bool = at_anchor and j == 0
		node.position = at if anchored else at + Vector2(900, 30)
		node.z_index = 1
		sea._world.add_child(node)
		var kind: String = GauntletMoments.entry_for(e) if gauntlet != "" and j == 0 and _moments != null and not autoplay and not anchored else ""
		if kind != "":
			_moments.prep(kind, node, at)
			lead_kind = kind
			lead_node = node
			lead_spot = at
		var ea: HullAura = HullAura.new()
		ea.width = node.box
		ea.face = -1.0
		node.add_child(ea)
		_auras["e%d" % j] = ea
		_foe_nodes.append(node)
		_foe_pos.append(at)
		_foe_tex.append(Skipper.tex(str(e.get("portrait", "")).trim_prefix("/")))
		_shown_hp["e%d" % j] = float(e["hp"])
		if not anchored and kind == "":
			if tw == null:
				tw = create_tween().set_parallel()
			tw.tween_property(node, "position", at, 1.6 + 0.2 * j).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT).set_delay(0.15 * j)
	if lead_kind != "":
		await _moments.enter(lead_kind, lead_node, lead_spot)
	_target = maxi(0, Battle.first_foe(b))
	_ctx(0)
	if at_anchor:
		# The hull at anchor IS the lead: it swaps in place, weighing anchor.
		mark.visible = false
		for k: int in 4:
			sea._field.ring(_enemy_at + Vector2(randf_range(-60, 60), 10), 120.0, 1.3, 0.5)
	_frame()
	var e0: Dictionary = fs[0]
	var f: Dictionary = Battle.fight_at(_raid, int(b["fight"])) if gauntlet == "" else { "of": 0 }
	if fs.size() > 1:
		_say("%s and %d more" % [e0["name"], fs.size() - 1])
	else:
		_say("%s%s" % [("Boss: " if e0["boss"] else ("Elite: " if e0.get("elite", false) else "")), e0["name"]])
	var notes: Array = ["Fight %d of %d" % [int(b["fight"]) + 1, int(f["of"])]] if gauntlet == "" else ["Depth %d" % int(Js.num(b.get("depth")))]
	if fs.size() > 1:
		notes.append("%d ships: click one to aim at it, or press Tab" % fs.size())
	var af: Dictionary = e0["affix"]
	if not af.is_empty():
		notes.append("%s: %s" % [af.get("name", ""), af.get("description", "")])
	if float(e0["dr"]) > 0.0:
		notes.append("%s: takes %d%% less from a single shot" % [e0["drName"], int(round(float(e0["dr"]) * 100.0))])
	var rp: Variant = b["seats"][me].get("repossessed")
	if rp != null:
		notes.append("%s: %s takes back your %s for this fight" % [e0["repossessName"], e0["name"], Armory.item(str(rp)).get("name", "gear")])
	_log_line("  ·  ".join(PackedStringArray(notes)))
	if tw != null:
		var k2: int = 0
		for node2: Variant in _foe_nodes:
			if node2 != null and float((node2 as Node2D).position.x) > float(_foe_pos[k2].x) + 10.0:
				for r: int in 5:
					var nd: Node2D = node2
					tw.tween_callback(func() -> void:
						if is_instance_valid(nd):
							sea._field.ring(nd.position + Vector2(60, 10), 90.0, 1.2, 0.4)).set_delay(0.25 * r)
			k2 += 1
		await tw.finished
	else:
		await _wait(1.1)


## Where the j-th enemy of a field rides, from the lead's place.
static func _foe_offset(j: int) -> Vector2:
	return [Vector2.ZERO, Vector2(260, 340), Vector2(260, -340), Vector2(520, 0)][clampi(j, 0, 3)]


func _foe_at(j: int) -> Vector2:
	if j >= 0 and j < _foe_nodes.size() and is_instance_valid(_foe_nodes[j]):
		return (_foe_nodes[j] as Node2D).position
	return _foe_pos[j] if j >= 0 and j < _foe_pos.size() else _enemy_at


## An event is about this enemy: the hull, its place and its portrait.
func _ctx(j: int) -> void:
	if _foe_nodes.is_empty():
		return
	_cur = clampi(j, 0, _foe_nodes.size() - 1)
	_enemy = _foe_nodes[_cur] if is_instance_valid(_foe_nodes[_cur]) else null
	_enemy_at = _foe_at(_cur)
	_portrait = _foe_tex[_cur]


func _ek() -> String:
	return "e%d" % _cur


func _field() -> bool:
	return Battle.foes(b).filter(func(f: Dictionary) -> bool: return Battle.foe_up(f)).size() > 1


func _set_target(j: int) -> void:
	var fs: Array = Battle.foes(b)
	if j < 0 or j >= fs.size() or not Battle.foe_up(fs[j]) or j == _target:
		return
	_target = j
	Sound.plip()
	_log_line("Aiming at %s." % fs[j]["name"])


## Is this fight the hull riding at anchor (the skirmish's one raider, or a
## raid's boss)?
func _from_mark() -> bool:
	if mark == null or b.is_empty() or gauntlet != "":
		return false
	return _raid.get("skirmish", false) == true or Battle.fight_at(_raid, int(b["fight"]))["boss"] == true


# ── The deck ─────────────────────────────────────────────────────────────────

func _build_deck() -> void:
	_deck = Control.new()
	_deck.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_deck.offset_left = -DECK_W / 2.0
	_deck.offset_right = DECK_W / 2.0
	_deck.offset_top = -BAR - 150
	_deck.offset_bottom = -BAR + 6
	_deck.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_deck)
	# No paper behind the deck (Kong, 2026-10-05): the bottom of the screen
	# just darkens softly into the black bar, so the discs, the crew and the
	# log stand on the water.
	var fade: ColorRect = ColorRect.new()
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fade.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	fade.offset_top = -BAR - 300.0
	fade.offset_bottom = -BAR
	var fm: ShaderMaterial = ShaderMaterial.new()
	var fsh: Shader = Shader.new()
	fsh.code = "shader_type canvas_item;\nvoid fragment() { float a = smoothstep(0.0, 1.0, UV.y); COLOR = vec4(0.01, 0.015, 0.025, a * a * 0.72); }"
	fm.shader = fsh
	fade.material = fm
	add_child(fade)
	move_child(fade, _deck.get_index())
	_deck_bg = [fade]
	var pad: MarginContainer = MarginContainer.new()
	pad.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: Array in [["left", 22], ["right", LOG_W + 34], ["top", 16], ["bottom", 14]]:
		pad.add_theme_constant_override("margin_" + side[0], side[1])
	_deck.add_child(pad)
	_deck_box = VBoxContainer.new()
	_deck_box.add_theme_constant_override("separation", 8)
	_deck_box.alignment = BoxContainer.ALIGNMENT_CENTER
	pad.add_child(_deck_box)
	# The crew stand up out of the deck's top edge, half over the water.
	_crew_row = HBoxContainer.new()
	_crew_row.add_theme_constant_override("separation", 10)
	_crew_row.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_crew_row.offset_left = 26.0
	_crew_row.offset_top = -CREW_LIFT
	_crew_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_deck.add_child(_crew_row)
	# The log's last lines, on the deck's right, a rule between.
	_deck_log = Control.new()
	_deck_log.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
	_deck_log.offset_left = -LOG_W - 18.0
	_deck_log.offset_right = -18.0
	_deck_log.offset_top = 14.0
	_deck_log.offset_bottom = -12.0
	_deck_log.mouse_filter = Control.MOUSE_FILTER_PASS
	_deck.add_child(_deck_log)
	_log = Kit.text(self, "", "body_strong", CREAM)
	_log.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_log.offset_left = -470
	_log.offset_right = 470
	_log.offset_top = -BAR - 186
	_log.offset_bottom = -BAR - 156
	_log.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# The deck's log says it now: the floating line stays hidden.
	_log.visible = false
	_log.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	_log.add_theme_constant_override("shadow_outline_size", 8)
	if _clog == null:
		_clog = CombatLog.new()
		_clog.stage = self
		add_child(_clog)
		_clog.mini.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_deck_log.add_child(_clog.mini)
	create_tween().tween_property(self, "_drop", 0.0, 0.6).set_delay(0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _deck_paper(on: bool) -> void:
	for n: Control in _deck_bg:
		if is_instance_valid(n):
			create_tween().tween_property(n, "modulate:a", 1.0 if on else 0.0, 0.25 if on else 0.18)


func _clear_deck() -> void:
	for c: Node in _deck_box.get_children():
		c.queue_free()
	if _crew_row != null:
		for c2: Node in _crew_row.get_children():
			c2.queue_free()


## Films and tests: the deck plays itself (fire when loaded, else reload;
## the aim locks after a moment).
var autoplay: bool = false


func _await_plan() -> void:
	_busy = false
	_plan = {}
	_menu = ""
	_paint_actions()
	# The deck rises back for your turn.
	create_tween().tween_property(self, "_drop", 0.0, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if autoplay:
		await _wait(0.3)
		var s: Dictionary = b["seats"][me]
		var lg: Dictionary = Battle.legal(b, s)
		if float(b["turn"]) == 2.0 and not (s["crew"] as Array).is_empty() and Battle.ability_ok(b, s, s["crew"][0]["id"]) == "":
			_plan["ability"] = { "crew": s["crew"][0]["id"], "target": me }
			_paint_actions()
			await _wait(0.4)
		_choose("volley" if lg["volley"] else ("fire" if lg["fire"] and Dice.next() < 0.6 else "reload"))
		if _plan.get("action") in ["fire", "volley"]:
			await _wait(randf_range(0.4, 1.0))
			for bar: Node in find_children("", "AimBar", true, false):
				(bar as AimBar).lock()


## Which chooser is open on the deck: "" the orders, "fire" (Fire, Volley,
## the Mega) or "special" (the repair kit), as the web's ActionMenu.
var _menu: String = ""


func _paint_actions() -> void:
	_clear_deck()
	var s: Dictionary = b["seats"][me]
	var lg: Dictionary = Battle.legal(b, s)
	var mg: Dictionary = Js.obj(s.get("mega"))
	var kit: Dictionary = Battle.repair_kit(s)
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 22)
	_deck_box.add_child(top)
	match _menu:
		"fire":
			# Fire's chooser: the single shot, the volley, the Mega.
			var fk2: BattleLook.ActionKey = _word_key("Fire", "F", lg["fire"], true, "One ball, one shot", BattleLook.GOLD, func() -> void: _pick_fire("fire"), "fire")
			top.add_child(fk2)
			top.add_child(_word_key("Volley", "V", lg["volley"], lg["volley"], "Three balls: a double-damage broadside", BattleLook.GOLD, func() -> void: _pick_fire("volley"), "volley"))
			if not mg.is_empty():
				top.add_child(_word_key(str(mg["name"]), "M", lg.get("mega", false), lg.get("mega", false), "%s  ·  %d balls" % [mg.get("tagline", ""), int(Armory.aug()["megaCost"])], Color(str(mg.get("color", "#d8b26b"))), func() -> void: _pick_fire("mega"), "mega"))
			top.add_child(_word_key("Back", "Esc", true, false, "", BattleLook.MUTED, func() -> void: _close_menu(), "back"))
		"special":
			# The specials: the repair kit (the crew's orders have their row).
			if not kit.is_empty():
				var rg: Vector2 = Battle.repair_range(s)
				var why: String = "Used this fight" if s.get("kitUsed", false) else ("Hull already full" if float(s["hp"]) >= float(s["max"]) else "Heals %d-%d, costs your turn" % [int(rg.x), int(rg.y)])
				var kk: BattleLook.ActionKey = _word_key(str(kit["name"]), "1", lg.get("repair", false), lg.get("repair", false), str(kit.get("description", "")), Color(0.5, 0.95, 0.6), func() -> void:
					_menu = ""
					_choose("repair"), "special")
				kk.sub = why
				kk.custom_minimum_size = Vector2(maxf(kk.custom_minimum_size.x, 220.0), 82)
				top.add_child(kk)
			top.add_child(_word_key("Back", "Esc", true, false, "", BattleLook.MUTED, func() -> void: _close_menu(), "back"))
		_:
			top.add_child(_word_key("Reload", "R", lg["reload"], false, "+1 ball", BattleLook.CREAM, func() -> void: _choose("reload"), "reload"))
			var fk: BattleLook.ActionKey = _word_key("Fire", "F", lg["fire"], true, "Fire; with the balls for it, a Volley or the Mega" if (lg["volley"] or lg.get("mega", false)) else "One ball, one shot", BattleLook.GOLD, _tap_fire, "fire")
			top.add_child(fk)
			top.add_child(_word_key("Dodge", "D", lg["dodge"], false, "Brace for a shot (not twice running)", BattleLook.CREAM, func() -> void: _choose("dodge"), "dodge"))
			top.add_child(_word_key("Special", "S", not kit.is_empty(), false, str(kit.get("name", "No special aboard")), BattleLook.CREAM, func() -> void: _open_menu("special"), "special"))
			var drum: Dictionary = Battle.drum_of(s)
			if not drum.is_empty():
				top.add_child(_word_key(str(drum["name"]), "B", not (s.get("drum", false) or (s["used"] as Array).is_empty()), false, str(drum.get("description", "")), BattleLook.GOLD, _beat_drum, "drum"))
			if gauntlet == "":
				top.add_child(_word_key("Flee", "X", true, false, "Roll to get away: a %d or better on a d20. A miss takes a parting shot." % Battle.flee_need(b, me), BattleLook.MUTED, _flee, "flee"))
	# The shot in the rack shows on your ship's plate, not here (Kong, 2026-10-05).
	# The crew's orders: standing up out of the deck's top edge.
	var crew: Array = s["crew"]
	for ci: int in crew.size():
		_crew_row.add_child(_order_card(s, crew[ci], ci))
	_target_row()


## Fire: with a Volley or the Mega in reach it opens the chooser; else it fires.
func _tap_fire() -> void:
	var lg: Dictionary = Battle.legal(b, b["seats"][me])
	if not lg["fire"]:
		return
	if lg["volley"] or lg.get("mega", false):
		_open_menu("fire")
	else:
		_choose("fire")


func _pick_fire(act: String) -> void:
	if not Battle.legal(b, b["seats"][me]).get(act, false):
		return
	_menu = ""
	_choose(act)


func _open_menu(m: String) -> void:
	if m == "special" and Battle.repair_kit(b["seats"][me]).is_empty():
		return
	_menu = m
	Sound.plip()
	_paint_actions()


func _close_menu() -> void:
	_menu = ""
	Sound.plip()
	_paint_actions()


## An action on the deck: its word and its key, nothing else.
func _word_key(word: String, key: String, on: bool, primary: bool, tip: String, accent: Color, f: Callable, icon: String = "") -> BattleLook.ActionKey:
	var k: BattleLook.ActionKey = BattleLook.ActionKey.new()
	k.kind = icon
	k.disc = true
	k.big = primary and icon == "fire"
	k.label = word
	k.key_hint = key
	k.primary = on and primary
	k.accent = accent
	k.disabled = not on
	k.tooltip_text = tip
	var w: float = Kit.font("karla", 800).get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x + 44.0 + Kit.font("karla", 800).get_string_size(key, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + (30.0 if icon != "" else 0.0)
	var big: bool = primary and icon == "fire"
	var ww: float = Kit.font("cinzel", 700).get_string_size(word.to_upper() if big else word, HORIZONTAL_ALIGNMENT_LEFT, -1, 30 if big else 22).x
	k.custom_minimum_size = Vector2(maxf(96.0, ww + 34.0), 82)
	k.pressed.connect(f)
	return k


func _order_card(s: Dictionary, c: Dictionary, i: int = 0) -> Control:
	var why: String = Battle.ability_ok(b, s, c["id"])
	var chosen: bool = Js.obj(_plan.get("ability")).get("crew") == c["id"]
	var cls: Dictionary = Js.obj(Js.obj(Crew.t().get("classes")).get(c["cls"]))
	var bt: BattleLook.CrewCard = BattleLook.CrewCard.new()
	bt.tex = Skipper.tex("card_thumbs/%s.png" % str(c["filename"]).get_basename())
	bt.hand = str(c["name"])
	bt.col = Color(str(cls.get("color", "#cccccc")))
	bt.chosen = chosen
	bt.key_hint = str(i + 1) if i < 6 else ""
	bt.state = ("ORDERED" if chosen else str(cls.get("shortLabel", "")).to_upper()) if why == "" else ("USED" if why.begins_with("Already") else why.to_upper())
	bt.disabled = why != ""
	bt.title = str(cls.get("shortLabel", cls.get("name", "")))
	bt.desc = str(Js.obj(c["ms"]).get("desc", "")) if why == "" else why
	if (s["crew"] as Array).size() > 5:
		bt.custom_minimum_size = Vector2(100, 168)
	bt.pressed.connect(func() -> void: _toggle_order(c))
	return bt


## A crew hand's order given (or taken back): their card stands up, lit.
func _toggle_order(c: Dictionary) -> void:
	var s: Dictionary = b["seats"][me]
	if Battle.ability_ok(b, s, c["id"]) != "":
		return
	if Js.obj(_plan.get("ability")).get("crew") == c["id"]:
		_plan.erase("ability")
		Sound.plip()
	else:
		_plan["ability"] = { "crew": c["id"], "target": me }
		Sound.charge()
	_paint_actions()


## The crew orders that may go to another ship in the line.
const SHARED_ORDERS: Array = ["mender", "abyssal_tide", "anchor", "vengeance"]


## Together: a heal, shield, brace or ward ordered this turn may go to a crewmate.
func _target_row() -> void:
	var ab: Dictionary = Js.obj(_plan.get("ability"))
	if ab.is_empty() or table == null or Battle.alive(b).size() < 2:
		return
	var cls: String = ""
	for c: Dictionary in b["seats"][me]["crew"]:
		if c["id"] == ab["crew"]:
			cls = str(c["cls"])
	if cls not in SHARED_ORDERS:
		return
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_deck_box.add_child(row)
	Kit.text(row, "ORDER FOR", "eyebrow", BattleLook.MUTED).size_flags_vertical = Control.SIZE_SHRINK_CENTER
	for i: int in (b["seats"] as Array).size():
		var st: Dictionary = b["seats"][i]
		if not Battle.alive(b).has(st):
			continue
		var bt: BattleLook.ActionKey = BattleLook.ActionKey.new()
		bt.label = "Your ship" if i == me else str(st["name"])
		bt.sub = "%d / %d hull" % [int(st["hp"]), int(st["max"])]
		bt.chosen = int(ab.get("target", me)) == i
		bt.custom_minimum_size = Vector2(150, 48)
		var at: int = i
		bt.pressed.connect(func() -> void:
			_plan["ability"]["target"] = at
			Sound.plip()
			_paint_actions())
		row.add_child(bt)


func _unhandled_input(e: InputEvent) -> void:
	if _card != null and is_instance_valid(_card):
		return
	# A click on the enemy (its hull or its plate) opens its stat card.
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		if not find_children("", "AimBar", true, false).is_empty():
			return
		var mp: Vector2 = (e as InputEventMouseButton).position
		var pj: int = _foe_plate_hit(mp)
		if pj >= 0:
			get_viewport().set_input_as_handled()
			_open_enemy_card(pj)
			return
		var hj: int = _foe_hull_hit(mp)
		if hj >= 0:
			get_viewport().set_input_as_handled()
			if _field() and not _busy:
				_set_target(hj)
			else:
				_open_enemy_card(hj)
			return
		# A click on a ship's plate opens that captain's ledger.
		for i: int in (b["seats"] as Array).size():
			var sp: Vector2 = _plate_at.get(i, _screen(_seat_at(i)) + Vector2(0, _plate_lift(215.0)))
			if Rect2(sp + Vector2(-121, 0), Vector2(258, 60)).has_point((e as InputEventMouseButton).position):
				get_viewport().set_input_as_handled()
				_open_captain_card(i)
				return
		return
	if _busy or not (e is InputEventKey) or not (e as InputEventKey).pressed or (e as InputEventKey).echo:
		return
	var kc: int = (e as InputEventKey).keycode
	if kc == KEY_TAB and _field():
		get_viewport().set_input_as_handled()
		var fs3: Array = Battle.foes(b)
		for k3: int in range(1, fs3.size() + 1):
			var nj: int = (_target + k3) % fs3.size()
			if Battle.foe_up(fs3[nj]):
				_set_target(nj)
				break
		return
	var lg: Dictionary = Battle.legal(b, b["seats"][me])
	var hit: bool = true
	match _menu:
		"fire":
			match kc:
				KEY_F: _pick_fire("fire")
				KEY_V: _pick_fire("volley")
				KEY_M: _pick_fire("mega")
				KEY_ESCAPE: _close_menu()
				_: hit = false
		"special":
			match kc:
				KEY_1:
					if lg.get("repair", false):
						_menu = ""
						_choose("repair")
				KEY_S, KEY_ESCAPE: _close_menu()
				_: hit = false
		_:
			match kc:
				KEY_F: _tap_fire()
				KEY_R:
					if lg["reload"]:
						_choose("reload")
				KEY_D:
					if lg["dodge"]:
						_choose("dodge")
				KEY_S: _open_menu("special")
				KEY_B:
					if not Battle.drum_of(b["seats"][me]).is_empty():
						_beat_drum()
				KEY_X:
					if gauntlet == "":
						_flee()
				KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6:
					# The crew's orders, by their number on the card.
					var crew: Array = b["seats"][me]["crew"]
					var ci: int = kc - KEY_1
					if ci < crew.size():
						_toggle_order(crew[ci])
					else:
						hit = false
				_: hit = false
	if hit:
		get_viewport().set_input_as_handled()


func _choose(act: String) -> void:
	if _busy:
		return
	_plan["action"] = act
	if act == "fire" or act == "volley" or act == "mega":
		_busy = true
		_clear_deck()
		var s: Dictionary = b["seats"][me]
		# Finn's fight aims on the dial (aimStyle "dial"), fed by fishing gear.
		var on_dial: bool = str(Battle.raid_def(str(b.get("raidId", ""))).get("aimStyle", "")) == "dial"
		var bar: AimBar = AimDial.new() if on_dial else AimBar.new()
		bar.enemy_speed = float(b["enemy"]["speed"])
		bar.nav = float(s["nav"])
		var sh: Dictionary = s["sharp"]
		# A Sharpshot ordered this turn widens the gold band now.
		var ab: Dictionary = Js.obj(_plan.get("ability"))
		for c: Dictionary in s["crew"]:
			if not ab.is_empty() and c["id"] == ab["crew"] and c["cls"] == "sharpshot":
				sh = { "mult": c["ms"]["critZoneMultiplier"] }
		var aim: Dictionary = Battle.aim_for(b, me, _target)
		bar.crit_w = Battle.CRIT_W * (1.0 + float(sh.get("mult", 0.0))) * float(aim["critZone"]) * float(aim["narrow"])
		bar.narrow = float(aim["narrow"])
		bar.blind = float(aim["blind"])
		bar.volley = act != "fire"
		bar.zone_stack = float(aim["zoneStack"])
		bar.needle_mult = float(aim["needleMult"])
		bar.crit_drift = float(aim["critDrift"])
		bar.fog = float(aim["fog"])
		bar.afflict = str(aim["afflict"])
		bar.decoy_n = int(aim["decoys"])
		if on_dial:
			var dial: AimDial = bar
			dial.fit(AimDial.gear(sea.session.profile()))
			var rs: Dictionary = Js.obj(s.get("raidStreak"))
			dial.streak = Js.num(s.get("streak"))
			dial.streak_per = Js.num(rs.get("perStack"))
			dial.streak_label = str(rs.get("label", "Streak"))
			dial.pierce_at = Js.num(rs.get("pierceAt"))
		bar.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		if on_dial:
			# The dial stands over the water, centred, as the fishing dial does.
			add_child(bar)
			bar.anchor_left = 0.5
			bar.anchor_right = 0.5
			bar.anchor_top = 0.5
			bar.anchor_bottom = 0.5
			bar.offset_left = -210.0
			bar.offset_right = 210.0
			bar.offset_top = -300.0
			bar.offset_bottom = 170.0
		else:
			_deck_box.add_child(bar)
		# The bar floats free over the water, like the fishing dial: the
		# deck's paper fades away while you aim, and comes back after.
		_deck_paper(false)
		var res: String = await bar.locked
		_deck_paper(true)
		_plan["aim"] = res
		_plan["target"] = _target
		await get_tree().create_timer(0.3).timeout
	_busy = true
	_clear_deck()
	if table != null:
		_act(["plan", _plan])
		_waiting()
		return
	# The deck dips out of the way while the round plays on the water.
	create_tween().tween_property(self, "_drop", 190.0, 0.2).set_ease(Tween.EASE_IN)
	var rev: Array = Battle.resolve(b, [_plan])
	# A big hit counts toward the raid-damage bounties and badges; the round
	# toward the feat badges.
	Bounties.note_raid_hits(sea.session.store, sea.session.uid, rev, me)
	RaidFeats.feed(_feats, rev, me, int(b["fight"]))
	_play(rev)


# ── Playing a round ──────────────────────────────────────────────────────────

func _play(ev: Array) -> void:
	await _play_events(ev)
	_strip_lit = -99
	if b.has("flares") and b["state"] == "plan":
		await _flares()
	match b["state"]:
		"fled":
			await _got_away()
		"won":
			await _won()
		"lost":
			await _lost()
		_:
			_await_plan()


func _play_events(ev: Array) -> void:
	var i: int = 0
	while i < ev.size():
		var x: Dictionary = ev[i]
		if x["t"] == "eBroadside":
			# Every ship's shot of a broadside together, not one by one.
			var group: Array = []
			i += 1
			while i < ev.size() and ev[i]["t"] == "eShot" and ev[i].get("all", false):
				group.append(ev[i])
				i += 1
			if _clog != null:
				_clog.add(x)
				for g0: Dictionary in group:
					_clog.add(g0)
			await _broadside(x, group)
			continue
		await _one(x)
		i += 1


func _one(x: Dictionary) -> void:
	_ctx(int(x.get("foe", 0)))
	if _clog != null:
		_clog.add(x)
	await _one_play(x)
	if _clog != null:
		_clog.covering = false


func _one_play(x: Dictionary) -> void:
	var e: Dictionary = Battle.foes(b)[mini(_cur, Battle.foes(b).size() - 1)]
	match x["t"]:
		"ability":
			await _ability_card(x)
		"order":
			_strip = x["order"]
		"reload":
			var rs: int = int(x["seat"])
			_strip_lit = rs
			_fx.reload(_seat_at(rs), true)
			await _wait(0.3)
			_react(rs, "reload")
			var got: int = 1 + int(Js.num(x.get("extra")))
			_num(_seat_at(rs) + Vector2(0, -70), "+%d ball%s" % [got, "" if got == 1 else "s"], CREAM)
			await _wait(0.2)
		"brace":
			_strip_lit = int(x["seat"])
			_react(int(x["seat"]), "brace")
			_num(_seat_at(int(x["seat"])), "Bracing", Color(0.7, 0.85, 1.0))
			await _wait(0.25)
		"shot":
			var ss: int = int(x["seat"])
			var fj: int = _cur
			_strip_lit = ss
			var land: String = "dodge" if x.get("dodged", false) else ("miss" if x["aim"] == "miss" else ("crit" if x["aim"] == "critical" else "hit"))
			var mid: String = str(x.get("mega", ""))
			var fire_cb: Callable = func(_k: int) -> void: _react(ss, "recoil")
			var land_cb: Callable = func(k: int) -> void: _landed(-1 - fj, land, k)
			if x["action"] == "mega":
				var mg2: Dictionary = Armory.augment(mid)
				_say(str(mg2.get("name", "")) + "!")
				var col: Color = Color(str(mg2.get("color", "#ffffff")))
				match mid:
					"railgun":
						_react(ss, "brace")
						await _fx.beam(_seat_at(ss), _enemy_at, col, x.get("grazed", false))
						_react(ss, "recoil")
						_landed(-1 - fj, "crit" if not x.get("grazed", false) else "hit", 0)
					"barrage":
						await _fx.barrage(_seat_at(ss) + Vector2(40, 0), _enemy_at, land, fire_cb, land_cb)
					_:
						await _fx.nuke(_seat_at(ss) + Vector2(40, 0), _enemy_at, land not in ["miss", "dodge"], fire_cb)
						if land not in ["miss", "dodge"]:
							_landed(-1 - fj, "crit", 0)
			else:
				await _fx.shot(_seat_at(ss) + Vector2(40, 0), _enemy_at, land, 3 if x["action"] == "volley" else 1, x["action"] == "volley", fire_cb, land_cb)
			if land == "crit":
				# A beat held on a critical, before the number.
				await _wait(0.07)
			if x.get("dodged", false):
				_num(_enemy_at, "Slipped it!", Color(0.85, 0.85, 0.85))
			elif float(x["dmg"]) > 0.0 or x["aim"] != "miss":
				_num(_enemy_at, ("%d!" % int(x["dmg"])) if land == "crit" else str(int(x["dmg"])), Color(1.0, 0.85, 0.35) if land == "crit" else CREAM, land == "crit")
				if x.has("shielded"):
					_num(_enemy_at + Vector2(-40, -30), "-%d shield" % int(x["shielded"]), Color(0.55, 0.8, 1.0))
			else:
				_num(_enemy_at, "Miss", Color(0.8, 0.8, 0.8))
			_shown_hp[_ek()] = float(x["enemyHp"])
			if x.has("crossfire") and not x.get("dodged", false):
				_num(_enemy_at, "Crossfire  x%s" % str(snappedf(float(x["crossfire"]), 0.01)), Color(1.0, 0.85, 0.35))
			await _wait(0.15)
		"intent":
			pass
		"eReload":
			_strip_lit = -1 - _cur
			_fx.reload(_enemy_at, false)
			await _wait(0.3)
			_react(-1 - _cur, "reload")
			_num(_enemy_at + Vector2(0, -70), "Reloads", Color(CREAM, 0.8))
			await _wait(0.15)
		"eDodge":
			_strip_lit = -1 - _cur
			_react(-1 - _cur, "brace")
			_num(_enemy_at, "Evades", Color(0.75, 0.85, 1.0))
			await _wait(0.2)
		"eSpecial":
			_fx.sigil(_enemy_at, Color(1.0, 0.6, 0.4))
			_strip_lit = -1 - _cur
			_say(str(x.get("name", "")))
			_log_line(str(x.get("line", "")))
			await _wait(0.9)
		"eShot":
			_strip_lit = -1 - _cur
			var ti: int = int(x["target"])
			var fj2: int = _cur
			var land2: String = "dodge" if x.get("dodged", false) else ("crit" if x["crit"] else "hit")
			await _fx.shot(_enemy_at + Vector2(-40, 0), _seat_at(ti), land2, 3 if x["action"] == "volley" else 1, x["action"] != "fire",
				func(_k: int) -> void: _react(-1 - fj2, "recoil"),
				func(k: int) -> void: _landed(ti, land2, k))
			if x.get("fog", false):
				_num(_seat_at(ti), "Lost in the fog", Color(0.85, 0.9, 0.95))
			elif x.get("dodged", false):
				_num(_seat_at(ti), "Dodged!", Color(0.6, 0.9, 1.0))
			else:
				_num(_seat_at(ti), ("%d!" % int(x["dmg"])) if x["crit"] else str(int(x["dmg"])), Color(1.0, 0.45, 0.35), x["crit"])
				if x.get("braced", false):
					_num(_seat_at(ti) + Vector2(0, -40), "Braced", Color(0.7, 0.85, 1.0))
				Rumble.buzz([0, 40] if not x["crit"] else [0, 60, 30, 60])
			_shown_hp[ti] = float(x["hp"])
			await _wait(0.15)
		"phase":
			_say(str(x.get("badge", "")) if str(x.get("badge", "")) != "" else str(e["name"]) + " rises again!")
			_log_line(str(x.get("line", "")))
			if not Js.obj(x.get("aegis")).is_empty():
				_num(_enemy_at + Vector2(-120, -80), "%s rises" % x["aegis"]["name"], Color(0.75, 0.82, 0.9), true)
			_shown_hp[_ek()] = float(x["hp"])
			Sound.horn()
			await _wait(1.2)
		"sunkEnemy":
			if _raid.get("defeatSequence") is Dictionary and Battle.fight_at(_raid, int(b["fight"]))["boss"]:
				await _defeat_sequence(_raid["defeatSequence"])
			else:
				var tw: Tween = _enemy.create_tween()
				tw.tween_property(_enemy, "sink", 1.0, 1.8).set_ease(Tween.EASE_IN)
				_fx.burst(_enemy_at, true)
				Sound.chest(true)
				await _wait(1.0)
		"checkArm":
			_say(str(x.get("name", "")))
			_log_line("%s  ·  answer it within %d turns with the right crew order" % [x.get("telegraph", ""), int(x["turns"])])
			await _wait(1.0)
		"checkMet":
			_fx.pulse(_enemy_at, Color(1.0, 0.85, 0.45))
			_log_line(str(x.get("line", "Countered!")))
			Sound.perfect()
			await _wait(0.8)
		"checkFail":
			_fx.fizzle(_seat_at(me))
			_log_line(str(x.get("line", "")))
			Rumble.buzz([0, 60, 30, 60])
			await _wait(0.9)
		"cheat":
			_say("The anchor holds!" if x.get("anchor", false) else "The ward holds!")
			_shown_hp[int(x["seat"])] = float(x["hp"])
			await _wait(0.9)
		"sunk":
			_say("Holed below the waterline")
			await _wait(0.8)
		"burn":
			_fx.flare_up(_seat_at(int(x["seat"])))
			var si: int = int(x["seat"])
			_num(_seat_at(si), "-%d  burning" % int(x["dmg"]), Color(1.0, 0.55, 0.25))
			_shown_hp[si] = float(x["hp"])
			Sound.impact(false)
			await _wait(0.35)
		"eBurn":
			_fx.flare_up(_enemy_at)
			_num(_enemy_at, "-%d  burning" % int(x["dmg"]), Color(1.0, 0.55, 0.25))
			_shown_hp[_ek()] = float(x["hp"])
			await _wait(0.35)
		"frozen":
			_fx.freeze_snap(_seat_at(int(x["seat"])))
			_strip_lit = int(x["seat"])
			_num(_seat_at(int(x["seat"])), "Frozen solid", Color(0.75, 0.9, 1.0), true)
			await _wait(0.6)
		"eFrozen":
			_fx.freeze_snap(_enemy_at)
			_strip_lit = -1 - _cur
			_num(_enemy_at, "Frozen solid", Color(0.75, 0.9, 1.0), true)
			await _wait(0.6)
		"ablaze":
			_fx.flare_up(_seat_at(int(x["seat"])), true)
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "Set ablaze!", Color(1.0, 0.5, 0.2))
		"iced":
			_fx.freeze_snap(_seat_at(int(x["seat"])))
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "Iced over!", Color(0.75, 0.9, 1.0))
		"eAblaze":
			_fx.flare_up(_enemy_at, true)
			_num(_enemy_at + Vector2(0, -40), "Ablaze!", Color(1.0, 0.5, 0.2))
		"eIced":
			_fx.freeze_snap(_enemy_at)
			_num(_enemy_at + Vector2(0, -40), "Iced over!", Color(0.75, 0.9, 1.0))
		"fumble":
			_fx.burst(_seat_at(int(x["seat"])), false)
			_strip_lit = int(x["seat"])
			_num(_seat_at(int(x["seat"])), "False colors!  -%d" % int(x["chip"]), Color(1.0, 0.55, 0.35), true)
			_shown_hp[int(x["seat"])] = float(x["hp"])
			Rumble.buzz([0, 40])
			await _wait(0.6)
		"parry", "reflect":
			# A riposte (at a ship) or a parry thrown back (at the enemy).
			if x.has("enemyHp"):
				_fx.shot(_seat_at(int(x["seat"])) + Vector2(40, -20), _enemy_at, "hit")
				await _wait(0.35)
				_num(_enemy_at, "%s  %d" % [x.get("name", "Parry"), int(x["dmg"])], Color(0.7, 0.9, 1.0))
				_shown_hp[_ek()] = float(x["enemyHp"])
			else:
				_fx.shot(_enemy_at + Vector2(-40, -20), _seat_at(int(x["seat"])), "hit")
				await _wait(0.35)
				_num(_seat_at(int(x["seat"])), "%s  %d" % [x.get("name", "Riposte"), int(x["dmg"])], Color(1.0, 0.5, 0.4))
				_shown_hp[int(x["seat"])] = float(x["hp"])
			await _wait(0.2)
		"volatile":
			_fx.burst(_enemy_at, true)
			_num(_seat_at(int(x["seat"])), "The wreck goes up!  -%d" % int(x["dmg"]), Color(1.0, 0.5, 0.25), true)
			_shown_hp[int(x["seat"])] = float(x["hp"])
			await _wait(0.5)
		"bite":
			_fx.toss(_seat_at(int(x["seat"])), _seat_at(int(x["seat"])) + Vector2(-140, 70), true)
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "A ball knocked loose", Color(1.0, 0.7, 0.4))
		"loaded":
			_fx.reload(_seat_at(int(x["seat"])), true)
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "+1 ball", CREAM)
		"strip":
			_fx.toss(_enemy_at, _enemy_at + Vector2(130, 80), true)
			_num(_enemy_at + Vector2(0, -40), "Its powder spilled", Color(1.0, 0.85, 0.35))
		"leech":
			_fx.motes(_enemy_at, _seat_at(int(x["seat"])), Color(0.5, 0.95, 0.6), 8)
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "+%d" % int(x["heal"]), Color(0.5, 0.95, 0.6))
			_shown_hp[int(x["seat"])] = float(x["hp"])
		"rack":
			for ld: Variant in Js.list(x.get("landed")):
				_fx.status_burst(_enemy_at, str(ld))
			_num(_enemy_at + Vector2(0, -60), "The rack fires", Color(0.85, 0.75, 0.55))
		"eHeal":
			_fx.rise(_enemy_at, Color(0.5, 0.95, 0.6))
			_num(_enemy_at + Vector2(0, -40), "%s  +%d" % [x.get("why", ""), int(x["heal"])], Color(0.6, 0.95, 0.6))
			_shown_hp[_ek()] = float(x["hp"])
			await _wait(0.25)
		"wardSurge":
			_say("It will not go down!")
			_shown_hp[_ek()] = float(x["hp"])
			Sound.horn()
			await _wait(0.9)
		"aegisHit":
			var ea: HullAura = _aura(_ek())
			if ea != null:
				ea.crack()
			_num(_enemy_at + Vector2(-120, -60), "The wall holds  ·  %d left" % int(x["left"]), Color(0.75, 0.82, 0.9))
			Sound.impact(false)
			await _wait(0.3)
		"aegisBreak":
			var ea2: HullAura = _aura(_ek())
			if ea2 != null:
				ea2.shatter()
			_say("%s breaks!" % x.get("name", "The Last Wall"))
			Rumble.buzz([0, 60, 30, 90])
			Sound.impact(true)
			await _wait(1.0)
		"bossAbility":
			await _summon(x)
		"refund":
			_fx.rise(_seat_at(int(x["seat"])), Color(1.0, 0.85, 0.45), 6)
			_num(_seat_at(int(x["seat"])) + Vector2(0, -40), "The Maw takes nothing", Color(0.9, 0.65, 0.3))
		"flares":
			pass
		"role":
			await _role_move(x)
		"reaction":
			await _reaction(x)
		"repair":
			var rsi: int = int(x["seat"])
			_strip_lit = rsi
			_fx.heal_rain(_seat_at(rsi), Color(0.5, 0.95, 0.6), 10)
			await _wait(0.5)
			_num(_seat_at(rsi), "+%d" % int(x["heal"]), Color(0.5, 0.95, 0.6), true)
			_shown_hp[rsi] = float(x["hp"])
			await _wait(0.3)
		"comboNote":
			# A pack's combo (or a jammed role) at work: its name over the ship.
			var fj2: int = int(x.get("foe", -1))
			_fx.pulse(_foe_at(maxi(0, fj2)), Color(1.0, 0.62, 0.45))
			var at2: Vector2 = _seat_at(int(x["seat"])) + Vector2(0, -110) if x.has("seat") else _foe_at(maxi(0, fj2)) + Vector2(0, -80)
			_num(at2, str(x.get("text", "")), Color(1.0, 0.62, 0.45))
			if x.has("hp") and fj2 >= 0:
				_shown_hp["e%d" % fj2] = float(x["hp"])
		"comboBroken":
			_fx.fizzle(_foe_at(int(x["foe"])))
			_num(_foe_at(int(x["foe"])) + Vector2(0, -80), "%s broken" % str(x.get("name", "")), Color(0.85, 0.85, 0.8))
			_log_line("%s is broken: the %s fights alone now." % [str(x.get("name", "")), str(Battle.foes(b)[int(x["foe"])]["name"])])
		"eBroadside":
			# Every gun down its side at once.
			_say("Broadside!")
			for k5: int in 4:
				_fx.muzzle(_enemy_at + Vector2(-60.0 + k5 * 40.0, 0), false, true)
			Sound.cannon(true)
			await _wait(0.3)
		"drum":
			_fx.pulse(_seat_at(int(x["seat"])), Color(1.0, 0.8, 0.45))
			_num(_seat_at(int(x["seat"])) + Vector2(0, -90), str(x.get("name", "The drum")), Color(1.0, 0.85, 0.5))
			if x.has("refreshed"):
				_log_line("The drum beats: an order is ready again.")
		"intercept":
			_strip_lit = -1 - _cur
			_react(-1 - _cur, "brace")
			_num(_enemy_at + Vector2(0, -70), "Intercepted!", Color(0.75, 0.85, 1.0), true)
			await _wait(0.35)
		"crossfire":
			_xfire_seats = Js.list(x["seats"])
			_xfire_foe = int(x.get("foe", 0))
			_xfire_t = 2.4
			_say("Crossfire!")
			var who: Array = []
			for si3: Variant in _xfire_seats:
				who.append("you" if int(si3) == me else str(b["seats"][int(si3)]["name"]))
				_num(_seat_at(int(si3)) + Vector2(0, -60), "Critical", Color(1.0, 0.85, 0.35), true)
			_log_line("Criticals from %s: each of those shots hits %d%% harder." % [" and ".join(PackedStringArray(who)), int(round((float(x["mult"]) - 1.0) * 100.0))])
			Sound.perfect()
			Rumble.buzz([0, 30, 30, 50])
			await _wait(0.9)
		"flee":
			var fs: int = int(x["seat"])
			if fs == me:
				await _show_flee(x, int(x["need"]))
			else:
				_num(_seat_at(fs), "Got away" if x["success"] else "Caught!  -%d" % int(x.get("dmg", 0)), Color(0.5, 0.86, 0.58) if x["success"] else Color(1.0, 0.45, 0.35), true)
				if x.has("hp"):
					_shown_hp[fs] = float(x["hp"])
				await _wait(0.6)
		"begin":
			if gauntlet != "":
				await _descend()
				await _depth_call()
			await _pre_fight_words()
			await _enemy_enters()
		"nextFight" when gauntlet != "":
			await _descend()
			await _depth_call()
			await _enemy_enters()
		"nextFight":
			if x.get("rest", false):
				_say("Rest stop")
				_log_line("The crew catch their breath: every crew order is ready again.")
				await _wait(1.8)
			if x.get("boss", false):
				Sound.horn()
				await _pre_fight_words()
			await _enemy_enters()
		"pay":
			if x["key"] == my_key:
				_say("%s sunk" % b["enemy"]["name"])
				_log_line("+%d Navigation XP  ·  +%d ⟡ to the crew's purse" % [int(x["xp"]), int(x["doubloons"])])
				await _wait(2.0)
		"crate":
			if x["key"] == my_key:
				_say(str(_raid.get("bossDefeatedText", "Victory")) if str(_raid.get("bossDefeatedText", "")) != "" else "Victory")
				var items: Array = Js.list(x.get("items"))
				_log_line("Your crate: %s ⟡%s" % [Js.thousands(Js.num(x.get("coin"))), ("  ·  " + ", ".join(PackedStringArray(items))) if not items.is_empty() else ""])
				Sound.chest(true)
				await _wait(3.2)
		"tierClear":
			if x["key"] == my_key:
				_stamp(str(x.get("tier", "normal")), x.get("first", false) == true)
				await _wait(1.6)
		"potUp":
			_say("%s sunk" % b["enemy"]["name"])
			_log_line("+%s ⟡ to the pot  ·  %s ⟡ riding on it" % [Js.thousands(Js.num(x.get("add"))), Js.thousands(Js.num(x.get("pot")))])
			Sound.chest(false)
			await _wait(1.6)
		"towed":
			var tk: int = _seat_index(str(x["key"]))
			if tk >= 0:
				_num(_seat_at(tk) + Vector2(0, -80), "Towed along", Color(0.6, 0.85, 1.0), true)
			_log_line("%s towed along, back in the line at a quarter hull." % ("You are" if x["key"] == my_key else str(b["seats"][maxi(0, tk)]["name"]) + " is"))
			await _wait(1.0)
		"drowned":
			var dk2: int = _seat_index(str(x["key"]))
			_log_line("%s went down for good, crew and all." % ("You" if x["key"] == my_key else str(b["seats"][maxi(0, dk2)]["name"])))
			await _wait(1.2)
		"refresh":
			if x["key"] == my_key:
				_log_line("Your crew catch their breath. Every order is ready again.")
		"seize":
			_fx.pulse(_seat_at(int(x["seat"])), Color(1.0, 0.85, 0.45))
			_num(_seat_at(int(x["seat"])) + Vector2(0, -90), "Weather Gauge", BattleLook.GOLD)
		"steal":
			_fx.toss(_enemy_at, _seat_at(int(x["seat"])))
			_num(_seat_at(int(x["seat"])) + Vector2(0, -80), "Press-Gang  +1 ball" if x.get("kept", false) else "Press-Gang", BattleLook.GOLD)
			await _wait(0.2)
		"overkill":
			_fx.motes(_enemy_at, _seat_at(int(x["seat"])), Color(0.5, 0.95, 0.6), 10)
			_num(_seat_at(int(x["seat"])) + Vector2(0, -70), "+%d" % int(x["heal"]), Color(0.5, 0.95, 0.6))
		"leech":
			_fx.motes(_enemy_at, _seat_at(int(x["seat"])), Color(0.5, 0.95, 0.6), 8)
			_num(_seat_at(int(x["seat"])) + Vector2(0, -70), "+%d" % int(x["heal"]), Color(0.5, 0.95, 0.6))
		"bond":
			# A bond reaching a crewmate (or the ship it marked): its motion,
			# then a line over them.
			var bt: int = int(x.get("to", -1))
			var at: Vector2 = _seat_at(bt) if bt >= 0 else _enemy_at
			_bond_move(x, at)
			_num(at + Vector2(0, -100), str(x.get("text", "")), Color(0.75, 0.9, 1.0))
		"rake":
			var fj: int = int(x["foe"])
			_fx.splash(_foe_at(fj))
			_num(_foe_at(fj), "Raked  -%d" % int(x["dmg"]), Color(1.0, 0.75, 0.45))
			_shown_hp["e%d" % fj] = float(x["enemyHp"])
		"execute":
			_fx.finisher(_enemy_at)
			_say({ "execute": "Executioner!", "deathMark": "Death Mark!" }.get(str(x.get("kind", "")), "Coup de Grace!"))
			_shown_hp[_ek()] = 0.0
			await _wait(0.5)
		"tithe":
			_fx.motes(_enemy_at, _seat_at(int(x["seat"])), Color(0.85, 1.0, 0.6), 12)
			_num(_seat_at(int(x["seat"])) + Vector2(0, -70), "Tithe  +%d" % int(x["heal"]), Color(0.5, 0.95, 0.6), true)
		"coil":
			_fx.splash(_enemy_at + Vector2(randf_range(-60, 60), 10))
			_num(_enemy_at + Vector2(0, -90), "Coils %d/%d" % [int(x["coils"]), int(x["of"])], Color(0.55, 0.85, 0.8))
		"grip":
			_say("Kraken's Grip!")
			_react(-1 - _cur, "hit")
			_num(_enemy_at, "-%d" % int(x["crush"]), Color(0.55, 0.85, 0.8), true)
			_shown_hp[_ek()] = float(x["enemyHp"])
			await _wait(0.5)
		"thermal":
			_say("Thermal Shock!")
			_fx.splash(_enemy_at)
			_num(_enemy_at, "-%d" % int(x["dmg"]), Color(1.0, 0.75, 0.5), true)
			_shown_hp[_ek()] = float(x["enemyHp"])
			await _wait(0.5)
		"counter":
			var cs: int = int(x["seat"])
			_say("Counter-Battery!")
			await _fx.shot(_seat_at(cs) + Vector2(40, 0), _enemy_at, "hit", 1, false, func(_k: int) -> void: _react(cs, "recoil"), func(_k: int) -> void: pass)
			_num(_enemy_at + Vector2(0, -80), "Countered", Color(0.75, 0.85, 1.0), true)
			if x.has("reflect"):
				_num(_enemy_at, "-%d" % int(x["reflect"]), CREAM)
				_shown_hp[_ek()] = float(x["enemyHp"])
			await _wait(0.3)
		"streak":
			_fx.rise(_seat_at(int(x["seat"])), Color(1.0, 0.85, 0.45), 5)
			_num(_seat_at(int(x["seat"])) + Vector2(0, -100), "Cannonade x%d" % int(x["n"]), BattleLook.GOLD)
		"streakBroken":
			_fx.fizzle(_seat_at(int(x["seat"])))
			_num(_seat_at(int(x["seat"])) + Vector2(0, -100), "Cannonade broken", Color(CREAM, 0.7))
		"eStatus":
			_fx.status_burst(_enemy_at, str(x.get("status", "")))
			_num(_enemy_at + Vector2(0, -100), str(x["status"]).capitalize(), Color(0.8, 0.6, 1.0))
		"tided":
			var r: Dictionary = Js.obj(Js.obj(x.get("picks")).get(my_key))
			if Js.num(r.get("heal")) > 0.0:
				_num(_seat_at(me), "+%d" % int(r["heal"]), Color(0.5, 0.95, 0.6), true)
			if r.get("refreshed") != null:
				_log_line("A spent crew order is ready again.")
			await _wait(0.6)


## A BROADSIDE: the call over the water, the enemy heeling with the recoil,
## a ball for every ship in the line at once.
func _broadside(x: Dictionary, group: Array) -> void:
	_ctx(int(x.get("foe", 0)))
	_strip_lit = -1 - _cur
	_say("Broadside!")
	Rumble.buzz([0, 50, 30, 80])
	_react(-1 - _cur, "brace")
	await _wait(0.35)
	_react(-1 - _cur, "recoil")
	_react(-1 - _cur, "recoil")
	for g: Dictionary in group:
		var ti: int = int(g["target"])
		var land: String = "dodge" if g.get("dodged", false) else ("crit" if g["crit"] else "hit")
		_fx.shot(_enemy_at + Vector2(-40, 0), _seat_at(ti), land, 2 if x["action"] == "volley" else 3, true, Callable(), func(k: int) -> void: _landed(ti, land, k))
	await _wait(0.65)
	for g: Dictionary in group:
		var ti2: int = int(g["target"])
		if g.get("dodged", false):
			_num(_seat_at(ti2), "Dodged!", Color(0.6, 0.9, 1.0))
		else:
			_num(_seat_at(ti2), ("%d!" % int(g["dmg"])) if g["crit"] else str(int(g["dmg"])), Color(1.0, 0.45, 0.35), true)
		_shown_hp[ti2] = float(g["hp"])
	await _wait(0.4)


func _ability_card(x: Dictionary) -> void:
	var si: int = int(x["seat"])
	var s: Dictionary = b["seats"][si]
	var c: Dictionary = {}
	for cc: Dictionary in s["crew"]:
		if cc["id"] == x["crew"]:
			c = cc
	var cid: String = str(x["cls"])
	var cls: Dictionary = Js.obj(Js.obj(Crew.t().get("classes")).get(cid))
	# The equipped skin themes the whole summon; a chase skin brings its
	# signature strike.
	var skin: Dictionary = {}
	for k: Dictionary in Skins.all():
		if str(k.get("filename", "")) == str(c.get("filename", "")):
			skin = k
	var col: Color = Color(str(skin.get("color", cls.get("color", "#cccccc"))))
	var chase: String = str(skin.get("id", "")) if skin.get("chase", false) else ""
	var big: float = 1.5 if chase != "" else 1.0
	# The sigil turns on the water under the caster as the summon plays.
	_strip_lit = si
	_fx.summon_circle(_seat_at(si), col, big)
	var cast: SummonCast = SummonCast.new()
	cast.tex = Skipper.tex("card-arts/%s.webp" % str(c.get("filename", "")).get_basename())
	cast.col = col
	cast.crew_name = str(c.get("name", x.get("name", "")))
	cast.order = "%s  ·  %s" % [cls.get("name", ""), cls.get("shortLabel", "")]
	cast.skin = skin
	add_child(cast)
	await cast.done
	# What it did, on the water: each order its own strike.
	var tgt: int = int(x.get("target", si))
	var tat: Vector2 = _seat_at(tgt if tgt >= 0 else si)
	match cid:
		"mender":
			if chase == "catfish_galaxy":
				_fx.cosmic(tat, col)
			await _fx.heal_rain(tat, col if chase != "" else FxSheet.status_color("regen"))
		"abyssal_tide":
			await _fx.tide(tat, col)
		"sharpshot":
			_fx.mark("reticle", _enemy_at, col, 1.2)
			_num(_seat_at(si) + Vector2(0, -90), "Steady aim: a wider crit", col.lightened(0.3))
		"snare":
			_fx.mark("chains", _enemy_at, col, 1.4)
			await _wait(0.4)
			_fx.status_burst(_enemy_at, "slowed")
			_num(_enemy_at + Vector2(0, -90), "Snared: it cannot dodge", col.lightened(0.3))
		"anchor":
			_fx.splash(tat)
			_fx.status_burst(tat, "fortify")
			_num(tat + Vector2(0, -90), "Braced", col.lightened(0.3))
		"navigator":
			var got: int = int(Js.num(x.get("charges")))
			for k2: int in got:
				_fx.toss(tat + Vector2(randf_range(-120, 120), -420), tat)
				await _wait(0.15)
		"leviathan":
			if chase == "dole_krakenhunter":
				_fx.splash(_enemy_at)
				_fx.glyph_burst(_enemy_at, "ember", col, 24, 300.0, 16.0, 500.0)
			await _breach(cast.tex, col)
		"blitz":
			var hits: Array = Js.list(x.get("hits"))
			for h: Variant in hits:
				if chase == "mako_tempest":
					_fx.lightning(_enemy_at, col)
				else:
					_fx.shot(_seat_at(si), _enemy_at + Vector2(randf_range(-40, 40), 0), "hit")
				_num(_enemy_at + Vector2(randf_range(-40, 40), -20), "%d" % int(Js.num(h)), col.lightened(0.3))
				await _wait(0.16)
		"foresight":
			_fx.mark("glyphs", _enemy_at, col, 1.8, big)
		"vengeance":
			_fx.mark("aureole", tat, col, 1.8, big)
			_fx.status_burst(tat, "fortify")
		"requiem":
			_fx.mark("reticle", _enemy_at, col, 1.6, big)
			await _wait(0.45)
			_fx.status_burst(_enemy_at, "marked")
	# The numbers.
	if x.has("heal") and float(x["heal"]) > 0.0:
		_num(tat, "+%d" % int(x["heal"]), Color(0.5, 0.95, 0.6), true)
		_shown_hp[tgt] = float(b["seats"][tgt]["hp"])
	if x.has("shield"):
		_num(tat + Vector2(0, -40), "+%d shield" % int(x["shield"]), Color(0.55, 0.8, 1.0))
	if x.has("charges"):
		_num(tat, "+%d ball%s" % [int(x["charges"]), "" if int(x["charges"]) == 1 else "s"] if float(x["charges"]) > 0.0 else "No luck", CREAM)
	if x.has("dmg"):
		_fx.finisher(_enemy_at) if cid == "leviathan" else _fx.burst(_enemy_at, true)
		_num(_enemy_at, "%d!" % int(x["dmg"]), col.lightened(0.3), true)
		_shown_hp[_ek()] = float(b["enemy"]["hp"])
	if x.has("reveal"):
		_log_line("Next: %s" % ", ".join(PackedStringArray(x["reveal"])))
	await _wait(0.4)


## The Leviathan's salvo: the crew's own creature breaches beside the enemy
## and slams into it.
func _breach(tex: Texture2D, col: Color) -> void:
	var sm: BattleSummon = BattleSummon.new()
	sm.field = sea._field
	sm.tex = tex
	sm.col = col
	sm.position = _enemy_at + Vector2(-220, 200)
	sm.z_index = 3
	sea._world.add_child(sm)
	await sm.rise()
	await sm.lunge(_enemy_at)
	sm.sink()


func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


func _num(world_p: Vector2, text: String, col: Color, big: bool = false) -> void:
	# Words landing on the same spot at once stack upward rather than overprint.
	var stack: int = 0
	for n: Dictionary in _numbers:
		if float(n["t"]) < 0.7 and (n["p"] as Vector2).distance_to(world_p) < 90.0:
			stack = maxi(stack, int(n.get("k", 0)) + 1)
	_numbers.append({ "p": world_p, "text": text, "col": col, "big": big, "t": 0.0, "k": stack, "dx": randf_range(-26.0, 26.0) })


func _puff(world_p: Vector2, text: String, col: Color) -> void:
	_num(world_p, text, col)


func _say(text: String) -> void:
	_banner.text = text
	_banner_t = 0.0


func _log_line(text: String) -> void:
	if _clog != null:
		_clog.note(text)
	_log.text = text
	_log.modulate.a = 0.0
	create_tween().tween_property(_log, "modulate:a", 1.0, 0.2)


# ── A fight won, a raid done, a ship lost ─────────────────────────────────────

func _won() -> void:
	var e: Dictionary = b["enemy"]
	RaidFeats.fight_won(_feats, Battle.fight_at(_raid, int(b["fight"]))["boss"])
	var paid: Dictionary = RaidRun.award_kill(sea.session.store, sea.session.uid, _raid, str(e["id"]), Battle.fight_at(_raid, int(b["fight"]))["boss"])
	sea.session.persist()
	_say("%s sunk" % e["name"])
	_log_line("+%d Navigation XP  ·  +%d ⟡" % [int(paid["xp"]), int(paid["doubloons"])])
	await _wait(2.0)
	# A tide turns after some kills; the Throne offers a reprieve before its don.
	var tide: Dictionary = Battle.tide_due(b)
	if not tide.is_empty():
		await _tide(tide, "A TIDE TURNS")
	var rp: Dictionary = Battle.reprieve_due(b)
	if not rp.is_empty():
		await _tide(rp, "A REPRIEVE")
	var nx: Dictionary = Battle.next_fight(b)
	if nx["done"]:
		await _crate()
		return
	if nx.get("rest", false):
		_say("Rest stop")
		_log_line("The crew catch their breath: every crew order is ready again.")
		await _wait(1.8)
	if nx.get("boss", false):
		Sound.horn()
		await _pre_fight_words()
	await _enemy_enters()
	_await_plan()


func _crate() -> void:
	var s: Dictionary = b["seats"][me]
	var r: Dictionary = RaidRun.open_crate(sea.session.store, sea.session.uid, _raid, float(s["fortune"]))
	var first: bool = RaidRun.record_tier_clear(sea.session.store, sea.session.uid, raid_id, "normal", {}, float(Time.get_ticks_msec() - _began_ms))
	if not _raid.get("skirmish", false):
		RaidFeats.grant(sea.session.store, sea.session.uid, raid_id, _feats)
	sea.session.persist()
	if not _raid.get("skirmish", false):
		_stamp("normal", first)
	_say(str(_raid.get("bossDefeatedText", "Victory")) if str(_raid.get("bossDefeatedText", "")) != "" else "Victory")
	if not r.is_empty():
		var items: Array = (r["items"] as Array).map(func(x: Dictionary) -> String: return str(x.get("label", x["id"])))
		_log_line("The crate: %s ⟡%s" % [Js.thousands(float(r["coin"])), ("  ·  " + ", ".join(PackedStringArray(items))) if not items.is_empty() else ""])
		Sound.chest(true)
	await _wait(3.2)
	_end(true)


func _lost() -> void:
	_say("Your ship is going down")
	_log_line("She limps home to the Gunwharf. Refit and come back.")
	Sound.slack()
	await _wait(2.6)
	_end(false)


func _end(won: bool, fled: bool = false) -> void:
	# The ships' own auras (the enemies' go with their hulls).
	for k: Variant in _auras:
		var a0: HullAura = _aura(k)
		if a0 != null and k is int:
			a0.queue_free()
	if table != null and table.is_connected("changed", _pump):
		table.disconnect("changed", _pump)
	if _ov != null:
		_ov.queue_free()
	if _moments != null:
		_moments.clear()
		_moments.queue_free()
		_moments = null
	if _atmos != null and is_instance_valid(_atmos):
		_atmos.reparent(sea)
		_atmos.leave()
		_atmos = null
	if gauntlet != "":
		sea.water_theme = {}
	sea._boat.modulate = Color.WHITE
	sea._boat.rotation = 0.0
	for k3: Variant in sea._mates:
		if is_instance_valid(sea._mates[k3]):
			(sea._mates[k3] as Node2D).modulate = Color.WHITE
			(sea._mates[k3] as Node2D).rotation = 0.0
	for k2: Variant in sea._mates:
		if is_instance_valid(sea._mates[k2]):
			(sea._mates[k2] as Shipmate).face_lock = 0.0
			(sea._mates[k2] as Shipmate)._plate.visible = true
	for n0: Variant in _foe_nodes:
		if n0 != null and is_instance_valid(n0):
			(n0 as Node).queue_free()
	if mark != null:
		mark.visible = true
	_fx.queue_free()
	sea.stage = null
	sea._hud.visible = true
	# Home: back to where she lay (sunk, to the Gunwharf's berth).
	var home: Vector2 = _from
	if gauntlet != "":
		var back0: Tween = create_tween()
		back0.tween_property(sea._boat, "position", home, 2.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		back0.tween_callback(func() -> void: sea._boat.hold_still = false)
	elif not won and dock != Vector2.INF:
		# Out on the campaign's water: she wakes at the Gunwharf.
		sea._boat.hold_still = false
		sea.warp_to_gunwharf()
	else:
		if not won and sea._berths.has("gunwharf"):
			home = (sea._berths["gunwharf"] as Node2D).position
		var back: Tween = create_tween()
		back.tween_property(sea._boat, "position", home, 2.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		back.tween_callback(func() -> void: sea._boat.hold_still = false)
	var tw: Tween = create_tween()
	tw.tween_property(self, "_bars", 0.0, 0.5)
	tw.parallel().tween_property(self, "_drop", 260.0, 0.4)
	await tw.finished
	finished.emit(won and not fled)
	queue_free()


# ── Drawing: the bars, the plates over the ships, the strip, the numbers ─────

func _draw() -> void:
	var vp: Vector2 = size
	var hb: float = BAR * _bars
	draw_rect(Rect2(0, 0, vp.x, hb), Color(0, 0, 0, 0.92))
	draw_rect(Rect2(0, vp.y - hb, vp.x, hb), Color(0, 0, 0, 0.92))
	if _bars < 0.5 or b.is_empty():
		return
	# A crossfire: gold lines from each critical ship to the enemy, fading.
	_xfire_t = maxf(0.0, _xfire_t - get_process_delta_time())
	if _xfire_t > 0.0 and _enemy != null and is_instance_valid(_enemy):
		var xa: float = clampf(_xfire_t / 2.4, 0.0, 1.0)
		var ep2: Vector2 = _screen(_foe_at(_xfire_foe)) + Vector2(0, -60)
		for si4: Variant in _xfire_seats:
			var sp4: Vector2 = _screen(_seat_at(int(si4))) + Vector2(30, -60)
			draw_line(sp4, ep2, Color(1.0, 0.82, 0.35, 0.18 * xa), 14.0, true)
			draw_line(sp4, ep2, Color(1.0, 0.9, 0.55, 0.85 * xa), 3.0, true)
		draw_circle(ep2, 26.0 + 18.0 * (1.0 - xa), Color(1.0, 0.85, 0.4, 0.35 * xa))
	var f: Font = Kit.font("cinzel", 800)
	_fight_track(hb)
	_draw_strip(Vector2(vp.x - 30, hb * 0.42))
	if table != null and str(_latest.get("phase", "")) == "plan":
		var who: Array = []
		var given: Dictionary = Js.obj(_latest.get("plans"))
		for st: Dictionary in Battle.alive(b):
			if not given.has(st.get("key")):
				who.append("You" if st.get("key") == my_key else str(st["name"]))
		var cd: String = ("Choosing: " + ", ".join(PackedStringArray(who))) if not who.is_empty() else "Every order is in"
		var cw: float = f.get_string_size(cd, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
		var cr: Rect2 = Rect2(vp.x / 2.0 - cw / 2.0 - 22.0, hb * 0.5 - 15.0, cw + 44.0, 30.0)
		BattleLook.draw_box(self, cr, BattleLook.box(Color(BattleLook.LACQUER_HI, 0.95), Color(0, 0, 0, 0), 0, 15))
		BattleLook.say(self, f, vp.x / 2.0, cr.get_center().y + 5.0, cd, 15, BattleLook.BRASS_HI)
	# The log's backing, and the banner's brass flourish.
	if _log.visible and _log.text != "" and _log.modulate.a > 0.01:
		var la: float = _log.modulate.a
		var lw: float = _log.get_minimum_size().x
		var lr: Rect2 = Rect2(vp.x / 2.0 - lw / 2.0 - 24.0, _log.position.y + _log.size.y / 2.0 - 17.0, lw + 48.0, 34.0)
		BattleLook.draw_box(self, lr, BattleLook.box(Color(BattleLook.LACQUER_LO, 0.82 * la), Color(0, 0, 0, 0), 0, 17))

	# Each enemy's plate over its masthead (on a field, the target marked), and
	# each ship's; plates that would overlap are spread apart (_spread).
	var fs2: Array = Battle.foes(b)
	var aiming: bool = _field() and not _busy
	var want: Array = []
	var frames: bool = _frames_mode()
	var row: int = 0
	for j2: int in mini(fs2.size(), _foe_nodes.size()):
		if not is_instance_valid(_foe_nodes[j2]):
			continue
		var en: HullRig = _foe_nodes[j2]
		if float(en.sink) >= 0.95:
			continue
		if frames:
			# A field: the enemies' frames down the right edge, a slim tag on
			# each hull.
			want.append(["e%d" % j2, Vector2(vp.x - 150.0, BAR + 22.0 + 76.0 * row)])
			row += 1
			var e1: Dictionary = fs2[j2]
			_hull_tag(_screen(en.position) + Vector2(0, _tag_lift()), str(e1["name"]), float(_shown_hp.get("e%d" % j2, e1["hp"])) / maxf(1.0, float(e1["max"])), BattleLook.FOE, _strip_lit == -1 - j2 or (aiming and j2 == _target), 1.0 - float(en.sink))
		else:
			want.append(["e%d" % j2, _screen(en.position) + Vector2(0, _plate_lift(225.0))])
	for i: int in (b["seats"] as Array).size():
		if frames:
			want.append([i, Vector2(150.0, BAR + 22.0 + 76.0 * i)])
			var s1: Dictionary = b["seats"][i]
			_hull_tag(_screen(_seat_at(i)) + Vector2(0, _tag_lift()), "You" if i == me else str(s1["name"]), float(_shown_hp.get(i, s1["hp"])) / maxf(1.0, float(s1["max"])), BattleLook.ALLY, _strip_lit == i, 1.0)
		else:
			want.append([i, _screen(_seat_at(i)) + Vector2(0, _plate_lift(215.0))])
	_plate_at = want.reduce(func(acc: Dictionary, w: Array) -> Dictionary:
		acc[w[0]] = w[1]
		return acc, {}) if frames else _spread(want)
	for j2: int in mini(fs2.size(), _foe_nodes.size()):
		if not is_instance_valid(_foe_nodes[j2]):
			continue
		var en: HullRig = _foe_nodes[j2]
		var key: String = "e%d" % j2
		if not _plate_at.has(key):
			continue
		var e: Dictionary = fs2[j2]
		var ep: Vector2 = _plate_at[key]
		var etag: String = "TARGET" if aiming and j2 == _target else ("BOSS" if e["boss"] else (_role_name(e).to_upper() if str(e.get("role", "")) != "" else ("ELITE" if e.get("elite", false) else "")))
		if aiming and j2 == _target:
			var hc: Vector2 = _screen(en.position) + Vector2(0, -60.0 * _z())
			var rr: float = en.box * 0.45 * _z()
			for q: int in 4:
				var a0: float = TAU * q / 4.0 + _t * 0.6
				draw_arc(hc, rr, a0 - 0.32, a0 + 0.32, 12, Color(BattleLook.GOLD, 0.9), 2.5, true)
		_plate(ep, str(e["name"]), float(_shown_hp.get(key, e["hp"])), float(e["max"]), float(e["shield"]), int(e["charges"]), int(e["mag"]), e["statuses"], true, _strip_lit == -1 - j2, key, etag, _foe_tex[j2], "", 1.0 - float(en.sink))
		if not card_seen and float(en.sink) < 0.05 and j2 == 0:
			if not frames:
				BattleLook.say(self, Kit.font("karla", 800), ep.x + 8.0, ep.y + 76.0, "CLICK FOR STATS", 10, Color(BattleLook.GOLD, 0.6 + 0.3 * sin(_t * 3.0)), 4)
			else:
				BattleLook.say(self, Kit.font("karla", 800), ep.x + 8.0, ep.y - 14.0, "CLICK A FRAME FOR STATS", 10, Color(BattleLook.GOLD, 0.6 + 0.3 * sin(_t * 3.0)), 4)
	for i: int in (b["seats"] as Array).size():
		var s: Dictionary = b["seats"][i]
		var sp: Vector2 = _plate_at[i]
		var out_word: String = "SUNK" if s.get("sunk", false) else ("AWAY" if s.get("fled", false) else "")
		_plate(sp, str(s["name"]), float(_shown_hp.get(i, s["hp"])), float(s["max"]), float(s["shield"]), int(s["charges"]), int(s["maxCharges"]), s["statuses"], false, _strip_lit == i, i, "YOU" if table != null and i == me else "", _face(i), out_word, 1.0)
		if table != null and str(_latest.get("phase", "")) == "plan" and Battle.alive(b).has(s):
			if frames:
				_order_chip(sp + Vector2(136, 18), s, true)
			else:
				_order_chip(sp + Vector2(0, 66), s)
	# Numbers rising off the water.
	# Damage slams in big and settles (an overshoot), drifts off its hull and
	# up, and fades; a critical is bigger, tilted, gold, on a glow, with
	# CRITICAL over it. Words (a dodge, a reload) are smaller and calmer.
	for n: Dictionary in _numbers:
		var u: float = float(n["t"]) / 1.4
		var txt: String = n["text"]
		var dmg: bool = txt.trim_suffix("!").is_valid_int()
		var crit: bool = n["big"] and dmg
		var rise: float = 1.0 - pow(1.0 - clampf(u, 0.0, 1.0), 3.0)
		var p: Vector2 = _screen(n["p"]) + Vector2(float(n.get("dx", 0.0)) * rise, -40.0 - (90.0 if dmg else 60.0) * rise - 38.0 * float(n.get("k", 0)))
		var fs: int = (46 if crit else (34 if dmg else (30 if n["big"] else 21)))
		var w: float = f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var a: float = 1.0 - smoothstep(0.62, 1.0, u)
		var e0: float = clampf(u / 0.16, 0.0, 1.0)
		var pop: float = (lerpf(1.9, 0.92, e0) if e0 < 1.0 else 1.0) if dmg else lerpf(1.3, 1.0, e0)
		if u > 0.16 and u < 0.26 and dmg:
			pop = lerpf(0.92, 1.0, (u - 0.16) / 0.1)
		var rot: float = (-0.09 if crit else 0.0) * (1.0 - e0 * 0.4)
		draw_set_transform(p, rot, Vector2(pop, pop))
		if crit:
			var gr: float = fs * 1.5
			draw_texture_rect(_num_glow, Rect2(Vector2(-gr, -fs * 0.3 - gr), Vector2(gr, gr) * 2.0), false, Color(1.0, 0.72, 0.25, 0.5 * a))
			var cw2: float = Kit.font("karla", 800).get_string_size("CRITICAL", HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			draw_string_outline(Kit.font("karla", 800), Vector2(-cw2 / 2.0, -fs * 0.95), "CRITICAL", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, 5, Color(0, 0, 0, 0.7 * a))
			draw_string(Kit.font("karla", 800), Vector2(-cw2 / 2.0, -fs * 0.95), "CRITICAL", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1.0, 0.9, 0.55, a))
		draw_string_outline(f, Vector2(-w / 2.0, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 9 if dmg else 7, Color(0, 0, 0, 0.8 * a))
		draw_string(f, Vector2(-w / 2.0, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(n["col"], a))
		# The first instant of a hit: a white flash on the figure.
		if dmg and u < 0.08:
			draw_string(f, Vector2(-w / 2.0, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1, 1, 1, 0.8 * (1.0 - u / 0.08)))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _plate(at: Vector2, name: String, hp: float, mx: float, shield: float, ch: int, mag: int, st: Dictionary, foe: bool, lit: bool, key: Variant, tag: String, portrait: Texture2D, out_word: String, alpha: float) -> void:
	if alpha <= 0.01:
		return
	var w: float = 258.0
	var h: float = 60.0
	var r: Rect2 = Rect2(at.x - w / 2.0 + 16.0, at.y, w - 16.0, h)
	var share: float = clampf(hp / maxf(1.0, mx), 0.0, 1.0)
	# The trail drains toward the hull after a hit; a heal jumps it up.
	var tr: float = float(_trail.get(key, share))
	tr = share if tr < share else move_toward(tr, share, get_process_delta_time() * 0.45)
	_trail[key] = tr
	var out: bool = out_word != ""
	var a: float = alpha * (0.55 if out else 1.0)
	var glow: float = (0.65 + 0.35 * sin(_t * 6.0)) if lit else 0.0
	BattleLook.panel(self, r, 12.0, a, glow)
	var mc: Vector2 = Vector2(r.position.x + 4.0, r.position.y + h * 0.5)
	BattleLook.medallion(self, mc, 27.0 if foe else 24.0, portrait, BattleLook.FOE if foe else BattleLook.ALLY, name.substr(0, 1), a, Vector2(0.5, 0.27) if foe else Vector2(0.5, 0.5), 0.25 if foe else 0.5)
	if tag != "":
		var tone: Color = BattleLook.FOE if tag == "BOSS" else (BattleLook.GOLD if tag == "ELITE" else BattleLook.ALLY)
		var tf: Font = Kit.font("karla", 800)
		var tw: float = tf.get_string_size(tag, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x + 12.0
		var tr2: Rect2 = Rect2(Vector2(r.position.x + 36.0, r.position.y - 9.0), Vector2(tw, 15))
		BattleLook.draw_box(self, tr2, BattleLook.box(Color(BattleLook.LACQUER_LO, a), Color(tone, a), 1, 7))
		draw_string(tf, tr2.position + Vector2(6, 11), tag, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(tone.lightened(0.3), a))
	var x0: float = r.position.x + 36.0
	var hf: Font = Kit.font("karla", 800)
	var ht: String = "%d / %d" % [int(hp), int(mx)]
	var hw: float = hf.get_string_size(ht, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
	draw_string(hf, Vector2(r.end.x - 12.0 - hw, r.position.y + 21.0), ht, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(BattleLook.MUTED, a))
	draw_string(Kit.font("cinzel", 800), Vector2(x0, r.position.y + 21.0), name, HORIZONTAL_ALIGNMENT_LEFT, r.end.x - 20.0 - hw - x0, 14, Color(BattleLook.CREAM, a))
	var bar: Rect2 = Rect2(x0, r.position.y + 28.0, r.end.x - 12.0 - x0, 10.0)
	BattleLook.bar(self, bar, share, tr, shield / maxf(1.0, mx), BattleLook.FOE if foe else BattleLook.ALLY, BattleLook.FOE_LO if foe else BattleLook.ALLY_LO, a)
	for k: int in mag:
		BattleLook.ball(self, Vector2(x0 + 6.0 + k * 14.0, r.position.y + 49.0), 5.0, k < ch, a)
	# What it is under, right to left.
	var sx: float = r.end.x - 12.0
	var pf: Font = Kit.font("karla", 800)
	for id: String in st:
		var word: String = id.capitalize()
		if word.length() > 9:
			word = word.substr(0, 9)
		# Its own colour, the same as the effect the ship wears.
		var tone2: Color = FxSheet.status_color(id) if FxSheet.STATUS.has(id) else (BattleLook.ALLY if id in ["fortify", "enrage", "regen", "haste"] else BattleLook.FOE)
		sx -= pf.get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x + 12.0
		if sx < x0 + mag * 14.0:
			break
		BattleLook.pill(self, Vector2(sx, r.position.y + 42.0), word, tone2, a)
		sx -= 4.0
	if out:
		BattleLook.draw_box(self, r, BattleLook.box(Color(0, 0, 0, 0.45 * alpha), Color(0, 0, 0, 0), 0, 12))
		BattleLook.say(self, Kit.font("cinzel", 900), r.get_center().x + 10.0, r.get_center().y + 7.0, out_word, 20, Color(BattleLook.CREAM, 0.9 * alpha), 6)


## The raid's title, and its fights as knots on a cord: sailed, this one lit,
## to come hollow; the boss's knot bigger and red.
func _fight_track(hb: float) -> void:
	if gauntlet != "":
		_depth_track(hb)
		return
	var f: Font = Kit.font("cinzel", 800)
	draw_string(f, Vector2(30, hb * 0.5 - 2.0), str(_raid.get("raidTitle", "")), HORIZONTAL_ALIGNMENT_LEFT, -1, 19, Color(BattleLook.CREAM, 0.96))
	var cur: int = int(b["fight"])
	var of: int = int(Battle.fight_at(_raid, cur)["of"])
	var y: float = hb * 0.5 + 15.0
	draw_line(Vector2(36, y), Vector2(36 + (of - 1) * 22.0, y), Color(1, 1, 1, 0.14), 1.5)
	for k: int in of:
		var c: Vector2 = Vector2(36 + k * 22.0, y)
		var boss: bool = Battle.fight_at(_raid, k)["boss"] == true
		var s: float = 6.5 if boss else 5.0
		var rim: Color = BattleLook.FOE if boss else Color(1, 1, 1, 0.35)
		if k < cur:
			BattleLook.knot(self, c, s, Color(BattleLook.CREAM, 0.7), rim)
		elif k == cur:
			BattleLook.knot(self, c, s + 2.0, BattleLook.FOE if boss else BattleLook.GOLD, rim)
		else:
			BattleLook.knot(self, c, s, Color(0, 0, 0, 0.4), Color(BattleLook.FOE if boss else Color(1, 1, 1, 0.35), 0.8))
	draw_string(Kit.font("karla", 800), Vector2(36 + (of - 1) * 22.0 + 16.0, y + 4.0), "FIGHT %d OF %d" % [cur + 1, of], HORIZONTAL_ALIGNMENT_LEFT, -1, 10, BattleLook.MUTED)


## The turn strip: who acts in what order this round, the one acting lit.
func _draw_strip(right: Vector2) -> void:
	if _strip.is_empty():
		return
	var n: int = _strip.size()
	var gap: float = 72.0
	var x0: float = right.x - (n - 1) * gap - 26.0
	draw_line(Vector2(x0, right.y), Vector2(x0 + (n - 1) * gap, right.y), Color(1, 1, 1, 0.14), 1.5)
	var cf: Font = Kit.font("karla", 800)
	for k: int in n:
		var who: int = _strip[k]
		var c: Vector2 = Vector2(x0 + k * gap, right.y)
		var lit: bool = who == _strip_lit
		var rad: float = 17.0 if lit else 14.0
		if lit:
			draw_arc(c, rad + 5.0, 0.0, TAU, 40, Color(BattleLook.GOLD, 0.95), 2.0, true)
		var nm: String
		if who < 0:
			var fj: int = -1 - who
			var fe: Dictionary = Battle.foes(b)[mini(fj, Battle.foes(b).size() - 1)]
			nm = str(fe["name"])
			BattleLook.medallion(self, c, rad, _foe_tex[fj] if fj < _foe_tex.size() else _portrait, BattleLook.FOE, nm.substr(0, 1), 0.4 if not Battle.foe_up(fe) else 1.0, Vector2(0.5, 0.27), 0.25)
		else:
			var st: Dictionary = b["seats"][who]
			nm = "You" if table != null and who == me else str(st["name"])
			BattleLook.medallion(self, c, rad, _face(who), BattleLook.ALLY, str(st["name"]).substr(0, 1), 0.45 if (st.get("sunk", false) or st.get("fled", false)) else 1.0, Vector2(0.5, 0.5), 0.5)
		if nm.length() > 10:
			nm = nm.substr(0, 9) + "."
		BattleLook.say(self, cf, c.x, c.y + rad + 14.0, nm, 10, BattleLook.CREAM if lit else BattleLook.MUTED)


# ── The enemies' moments ─────────────────────────────────────────────────────

## A boss's summon: the creature breaches beside it, does its work, sinks.
func _summon(x: Dictionary) -> void:
	_strip_lit = -1 - _cur
	var sm: BattleSummon = BattleSummon.new()
	sm.field = sea._field
	sm.tex = Skipper.tex(str(x.get("image", "")).trim_prefix("/"))
	sm.col = Color(str(x.get("color", "#a78bfa")))
	sm.position = _enemy_at + Vector2(-90, 260)
	sm.z_index = 3
	sea._world.add_child(sm)
	_say(str(x.get("name", "")))
	await sm.rise()
	match str(x["kind"]):
		"leviathan":
			for h: Dictionary in x["hits"]:
				await sm.lunge(_seat_at(int(h["seat"])))
				_num(_seat_at(int(h["seat"])), "%d!" % int(h["dmg"]), Color(1.0, 0.4, 0.35), true)
				_shown_hp[int(h["seat"])] = float(h["hp"])
		"blitz":
			for h: Dictionary in x["hits"]:
				for k: int in 4:
					_fx.shot(sm.position, _seat_at(int(h["seat"])) + Vector2(randf_range(-40, 40), 0), "hit")
					await _wait(0.12)
				_num(_seat_at(int(h["seat"])), "%d!" % int(h["dmg"]), Color(1.0, 0.4, 0.35), true)
				_shown_hp[int(h["seat"])] = float(h["hp"])
		"abyssal_tide":
			await sm.pulse()
			_num(_enemy_at, "+%d  ·  +%d shield" % [int(x.get("heal", 0)), int(x.get("shield", 0))], Color(0.6, 0.95, 0.7), true)
			_shown_hp[_ek()] = float(x["enemyHp"])
		"foresight":
			await sm.pulse()
			_log_line("It sees your next shots coming: it will slip any it braces for.")
		"vengeance":
			await sm.pulse()
			_log_line("A ward burns under it: the next killing blow will not take.")
		"requiem":
			await sm.pulse()
			for i: int in (b["seats"] as Array).size():
				_num(_seat_at(i), "Marked", Color(0.75, 0.85, 1.0))
	await _wait(0.4)
	await sm.sink()


## The flare barrage: every captain swats their own sky.
func _flares() -> void:
	var fl: Dictionary = b["flares"]
	var fb: FlareBarrage = FlareBarrage.new()
	fb.count = int(fl["count"])
	fb.feint_chance = float(fl["feint"])
	fb.cluster = float(fl["cluster"])
	fb.fuse_scale = float(fl["fuse"])
	fb.title = str(fl["name"])
	fb.source = _screen(_enemy_at) + Vector2(0, -60)
	fb.target = _screen(_seat_at(me)) + Vector2(0, -40)
	if autoplay:
		fb.fuse_scale = 0.4
	add_child(fb)
	var got: Array = await fb.finished
	if table != null:
		_act(["flares", { "missed": float(got[0]), "feints": float(got[1]) }])
		return
	var landed_fl: Array = Battle.flares_land(b, [{ "missed": got[0], "feints": got[1] }])
	RaidFeats.feed(_feats, landed_fl, me, int(b["fight"]))
	await _play_list(landed_fl)


func _play_list(ev: Array) -> void:
	for x: Dictionary in ev:
		match x["t"]:
			"flareHit":
				if _clog != null:
					_clog.add(x)
				if float(x["dmg"]) > 0.0:
					_fx.burst(_seat_at(int(x["seat"])), float(x["missed"]) >= 2.0)
					_num(_seat_at(int(x["seat"])), "-%d" % int(x["dmg"]), Color(1.0, 0.5, 0.3), true)
					_shown_hp[int(x["seat"])] = float(x["hp"])
					await _wait(0.4)
				else:
					_num(_seat_at(int(x["seat"])), "Not a spark landed", CREAM)
					await _wait(0.4)
			_:
				await _one(x)


## A tide (or the reprieve): the card, the captain's pick, what it did.
func _tide(tide: Dictionary, eyebrow: String) -> void:
	var card: TideCard = TideCard.new()
	card.tide = tide
	card.eyebrow = eyebrow
	add_child(card)
	if autoplay:
		await _wait(1.2)
		card._pick(str(tide["choices"][0]["id"]))
	var id: String = await card.chosen
	if table != null:
		_act(["tide", id])
		return
	var r: Dictionary = Battle.tide_pick(b, me, tide, id)
	if float(r.get("heal", 0.0)) > 0.0:
		_num(_seat_at(me), "+%d" % int(r["heal"]), Color(0.5, 0.95, 0.6), true)
		_shown_hp[me] = float(b["seats"][me]["hp"])
	if r.get("refreshed") != null:
		_log_line("A spent crew order is ready again.")
	await _wait(0.6)


## The boss's words before its fight (preFightDialogue), over the water.
func _pre_fight_words() -> void:
	if gauntlet != "":
		return
	var lines: Array = Js.list(_raid.get("preFightDialogue"))
	var f: Dictionary = Battle.fight_at(_raid, int(b["fight"]))
	if lines.is_empty() or not f["boss"] or _spoke:
		return
	_spoke = true
	var boss: Dictionary = Js.obj(_raid["enemies"][_raid["bossId"]])
	var scene: Array = []
	for l: Dictionary in lines:
		var o: Dictionary = { "text": l.get("text", ""), "pause": l.get("pause", 0) }
		match str(l.get("speaker", "narrator")):
			"boss":
				o["speaker"] = boss.get("name", "")
				o["portrait"] = boss.get("portrait", boss.get("image", ""))
			"crew":
				o["speaker"] = Js.obj(l.get("crew")).get("name", "")
				o["portrait"] = Js.obj(l.get("crew")).get("portrait", "")
		scene.append(o)
	var sc: StoryScene = StoryScene.new()
	sc.node = { "id": "", "scene": scene }
	sc.over_water = true
	sc.allow_skip = sea.session.store.clear_count(sea.session.uid, raid_id) > 0
	sc.cta = "To the guns"
	add_child(sc)
	if autoplay:
		await _wait(0.5)
		sc._end(true)
	await sc.finished


## THE LAST BOSS'S END (defeatSequence; Finn, the web's bespoke one): a
## hit-stop on the blow, the water going dark as he goes UP rather than under,
## his last words, then the dark lifting from him outward. The loot follows.
func _defeat_sequence(ds: Dictionary) -> void:
	var lines: Array = Js.list(ds.get("lines"))
	var boss: Dictionary = Js.obj(_raid["enemies"][_raid["bossId"]])
	# The blow lands and everything holds for a breath.
	_fx.burst(_enemy_at, true)
	Sound.impact(true)
	Rumble.buzz([0, 90, 40, 140])
	await _wait(0.45 if not GameSettings.calm() else 0.2)
	# The dark comes in over the water.
	var dark: ColorRect = ColorRect.new()
	dark.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dark.color = Color(0.01, 0.015, 0.03, 0.0)
	add_child(dark)
	move_child(dark, 0)
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(dark, "color:a", 0.72, 1.6)
	# He goes UP: lifted off the water, thinning as he climbs, light pouring off.
	var him: Node2D = _enemy if _enemy != null and is_instance_valid(_enemy) else null
	if him == null:
		for n0: Variant in _foe_nodes:
			if n0 != null and is_instance_valid(n0):
				him = n0
				break
	if him != null:
		tw.tween_property(him, "position:y", him.position.y - 320.0, 2.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		tw.tween_property(him, "modulate:a", 0.0, 2.6).set_ease(Tween.EASE_IN)
	for k: int in 3:
		_fx.rise(_enemy_at + Vector2(randf_range(-60, 60), -20.0 * k), Color(0.85, 0.92, 1.0), 10)
		await _wait(0.5)
	await _wait(1.2)
	# His last words; the closing line is the sea's.
	var scene: Array = []
	for i: int in lines.size():
		var o2: Dictionary = { "text": lines[i], "pause": 0 }
		if i < lines.size() - 1:
			o2["speaker"] = boss.get("name", "")
			o2["portrait"] = boss.get("portrait", boss.get("image", ""))
		scene.append(o2)
	if not scene.is_empty():
		var sc: StoryScene = StoryScene.new()
		sc.node = { "id": "", "scene": scene }
		sc.over_water = true
		sc.allow_skip = true
		sc.cta = "Onward"
		add_child(sc)
		if autoplay:
			await _wait(0.5)
			sc._end(true)
		await sc.finished
	# The dark lifts, from where he was outward.
	_fx.pulse(_enemy_at, Color(1.0, 0.88, 0.6))
	Sound.chest(true)
	var tw2: Tween = create_tween()
	tw2.tween_property(dark, "color:a", 0.0, 2.2).set_trans(Tween.TRANS_SINE)
	await tw2.finished
	dark.queue_free()


## The drum: a free beat, once a raid.
func _beat_drum() -> void:
	if _busy:
		return
	var r: Dictionary
	if table != null:
		r = Js.obj(await _act(["drum"]))
		if not r.has("error"):
			b["seats"][me]["drum"] = true
	else:
		r = Battle.use_drum(b, me)
	if r.has("error"):
		return
	Sound.horn()
	Rumble.buzz([0, 40, 40, 40, 40, 60])
	if r.get("refreshed") != null:
		_num(_seat_at(me), "A crew order is back", Color(0.95, 0.85, 0.5), true)
	else:
		_num(_seat_at(me), "The drum goes unanswered", CREAM)
	_paint_actions()


# ── Flee ─────────────────────────────────────────────────────────────────────

## The die for getting away, over the deck: a d20 tumbling onto the roll,
## the face needed beside it. Away: she turns and runs. Caught: the parting shot.
func _flee() -> void:
	if _busy:
		return
	_busy = true
	if table != null:
		_clear_deck()
		_act(["plan", { "action": "flee" }])
		_waiting()
		return
	var ev: Array = Battle.flee(b, me)
	await _show_flee(ev[0], Battle.flee_need(b, me))
	for k: int in range(1, ev.size()):
		await _one(ev[k])
	match b["state"]:
		"fled":
			await _got_away()
		"lost":
			await _lost()
		_:
			_await_plan()


func _show_flee(x: Dictionary, need: int) -> void:
	_clear_deck()
	create_tween().tween_property(self, "_drop", 0.0, 0.2)
	Paper.night = true
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	_deck_box.add_child(row)
	var die: NodeSheet.DiceFace = NodeSheet.DiceFace.new()
	die.custom_minimum_size = Vector2(180, 120)
	die.final = int(x["natural"])
	row.add_child(die)
	var v: VBoxContainer = VBoxContainer.new()
	row.add_child(v)
	Paper.text(v, "MAKING A RUN FOR IT", "eyebrow", Paper.ink_soft())
	Paper.text(v, "Need %d or better  ·  a 20 always gets away, a 1 never does" % need, "body_strong", Paper.ink())
	var said: Label = Paper.text(v, "", "display", Paper.ink())
	Paper.night = false
	await die.landed
	if x["success"]:
		said.text = "Away!"
		said.add_theme_color_override("font_color", Color(0.5, 0.86, 0.58))
		Sound.horn()
	else:
		said.text = "Caught!"
		said.add_theme_color_override("font_color", Color(0.93, 0.45, 0.33))
		await _wait(0.4)
		_fx.shot(_enemy_at + Vector2(-40, 0), _seat_at(me), "hit")
		await _wait(0.5)
		_num(_seat_at(me), "Parting shot  -%d" % int(x.get("dmg", 0)), Color(1.0, 0.45, 0.35), true)
		_shown_hp[me] = float(x.get("hp", b["seats"][me]["hp"]))
	await _wait(1.0)
	_clear_deck()


## Out of the fight: she comes about and runs for it, keeping what she earned.
func _got_away() -> void:
	_say("You got away")
	_log_line("Out of the fight, with what you earned so far. The raid will be here when you come back.")
	var away: Vector2 = sea._boat.position + Vector2(-700, 260)
	sea._boat.face_to(-1.0)
	var tw: Tween = create_tween()
	tw.tween_property(sea._boat, "position", away, 1.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	for k: int in 5:
		tw.parallel().tween_callback(func() -> void: sea._field.ring(sea._boat.position, 100.0, 1.0, 0.5)).set_delay(0.3 * k)
	await _wait(2.0)
	_from = sea._boat.position
	_end(true, true)



## A hull's aura, or null once it has gone (the enemy's sinks with it).
func _aura(k: Variant) -> HullAura:
	var a: Variant = _auras.get(k)
	return a if a != null and is_instance_valid(a) else null


# ── Together: following the founder's table ──────────────────────────────────

func _act(args: Array) -> Variant:
	if gauntlet != "":
		var gt: GauntletTable = table as GauntletTable
		if gt != null and gt.solo != null:
			return gt.handle(my_key, sea.session, args)
		return await sea.session.act("gauntletTable", args)
	return await sea.session.act("raidTable", args)


## Every state the table sends: each phase is handled once, in order.
func _pump(st: Dictionary) -> void:
	_latest = st
	var ph0: String = str(st.get("phase", ""))
	# A sheet's own updates go straight to it; a NEW sheet waits for its moment.
	if _ov != null and not _gone and ph0 != "playing" and (not GauntletOverlay.PHASES.has(ph0) or ph0 == _ov_phase):
		_ov.show_state(st)
	if _pumping or _gone:
		return
	_pumping = true
	while not _gone:
		var cur: Dictionary = _latest
		var tag: String = "%s:%d" % [cur.get("phase", ""), int(Js.num(cur.get("seq")))]
		if tag == _handled:
			break
		_handled = tag
		await _phase(cur)
	_pumping = false
	if not _gone and str(_latest.get("phase", "")) == "plan":
		b = (_latest["b"] as Dictionary).duplicate(true)
		if Js.obj(_latest.get("plans")).has(my_key):
			_waiting()
		else:
			if not _busy:
				_paint_actions()
			_xfire_hint()


func _alive_me() -> bool:
	return Battle.alive(b).has(b["seats"][me])


func _phase(cur: Dictionary) -> void:
	match str(cur.get("phase", "")):
		"playing":
			# The hulls show what they showed until the round says otherwise.
			for i: int in (b["seats"] as Array).size():
				_shown_hp[i] = float(b["seats"][i]["hp"])
			var fs1: Array = Battle.foes(b)
			for j1: int in fs1.size():
				_shown_hp["e%d" % j1] = float(fs1[j1]["hp"])
			b = (cur["b"] as Dictionary).duplicate(true)
			_busy = true
			_clear_deck()
			create_tween().tween_property(self, "_drop", 190.0, 0.2).set_ease(Tween.EASE_IN)
			await _play_events(Js.list(cur.get("ev")))
			_strip_lit = -99
			_shown_hp.clear()
			var seq: int = int(Js.num(cur.get("seq")))
			var mine: Dictionary = b["seats"][me]
			if gauntlet != "" and mine.get("sunk", false):
				var cp: Dictionary = Js.obj(Js.obj(cur.get("caps")).get(my_key))
				if str(cp.get("out", "")) == "drowned":
					# Hardcore: down with the crew; the dive goes on without her.
					_gone = true
					await _act(["played", int(Js.num(cur.get("seq")))])
					_say("Your ship is going down")
					var dead: Dictionary = cur.duplicate()
					dead["phase"] = "dead"
					dead["pays"] = { my_key: cp.get("paid", {}) }
					dead["seq"] = -1
					_ov.acted.connect(func(_a: Array) -> void: _end(false), CONNECT_ONE_SHOT)
					if _moments != null:
						await _moments.drowned([sea._boat])
					_ov_phase = "dead"
					_ov.show_state(dead)
					return
				_log_line("Your ship is down. If the crew win this fight, she is towed along.")
			elif mine.get("sunk", false) or mine.get("fled", false):
				_gone = true
				await _act(["played", seq])
				await _act(["out"])
				if mine.get("fled", false):
					await _got_away()
				else:
					await _lost()
				return
			_act(["played", seq])
			if str(cur.get("after", "")) == "end":
				_gone = true
				match str(cur.get("result", "")):
					"won":
						_end(true)
					"fled":
						await _got_away()
					_:
						await _lost()
		"plan":
			_ov_phase = ""
			b = (cur["b"] as Dictionary).duplicate(true)
			_plan_until = _t + float(Js.nz(cur.get("left"), RaidTable.PLAN))
			if _alive_me() and not Js.obj(cur.get("plans")).has(my_key):
				_await_plan()
				_xfire_hint()
			else:
				_waiting()
		"flares":
			b = (cur["b"] as Dictionary).duplicate(true)
			if _alive_me():
				await _flares()
			_waiting()
		"tide":
			if _alive_me() and not Js.obj(cur.get("tidePicks")).has(my_key):
				var tide: Dictionary = Js.obj(cur.get("tide"))
				var rp: Variant = Js.obj(Rules.data().get("tides")).get("reprieve")
				await _tide(tide, "A REPRIEVE" if tide == rp else "A TIDE TURNS")
			_waiting()
		"curse", "draft", "shrine", "fence", "contract", "jobResult", "marks", "breather", "haul", "dead", "held":
			b = (cur["b"] as Dictionary).duplicate(true)
			_busy = true
			_clear_deck()
			create_tween().tween_property(self, "_drop", 260.0, 0.3).set_ease(Tween.EASE_IN)
			var ph: String = str(cur.get("phase", ""))
			await _stage(cur)
			_ov_phase = ph
			if _ov != null and not _gone:
				_ov.show_state(_latest if str(_latest.get("phase", "")) == ph else cur)
		"done", "idle":
			_gone = true
			_end(str(cur.get("result", "")) in ["won", "banked"])


## The deck while the crew decide: who is still choosing.
func _waiting() -> void:
	if _pumping and str(_latest.get("phase", "")) == "playing":
		return
	_busy = true
	_clear_deck()
	var names: Array = []
	var plans: Dictionary = Js.obj(_latest.get("plans"))
	var field: String = { "plan": "plans", "flares": "flareRes", "tide": "tidePicks" }.get(str(_latest.get("phase", "")), "plans")
	var given: Dictionary = Js.obj(_latest.get(field))
	for st: Dictionary in Battle.alive(b):
		if st.get("key") != my_key and not given.has(st.get("key")):
			names.append(str(st["name"]))
	var line: String = "Orders given. Waiting on %s." % ", ".join(PackedStringArray(names)) if not names.is_empty() else "Orders given. The round is coming."
	if not _alive_me():
		line = "You are out of this fight. The crew fight on."
	var lb: Label = Kit.text(_deck_box, line, "body_strong", NIGHT_INK)
	lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lb.size_flags_vertical = Control.SIZE_EXPAND_FILL
	lb.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if plans.is_empty() and str(_latest.get("phase", "")) != "plan":
		lb.text = "The crew are seeing to it."
	create_tween().tween_property(self, "_drop", 0.0, 0.2)


## A ship's order for the round, under its plate while the crew plan: what it
## will do, where its aim landed (a critical in gold: half a crossfire), and a
## crew order with who it is for. "Choosing" until it is in.
func _order_chip(at: Vector2, s: Dictionary, beside: bool = false) -> void:
	var pl: Dictionary = Js.obj(Js.obj(_latest.get("plans")).get(s.get("key")))
	var txt: String = "Choosing"
	var crit: bool = false
	var kind: String = ""
	if not pl.is_empty():
		var act: String = str(pl.get("action", ""))
		kind = act
		txt = { "fire": "Fire", "volley": "Volley", "reload": "Reload", "dodge": "Dodge", "flee": "Flee" }.get(act, str(Js.obj(s.get("mega")).get("name", "Mega")))
		if act in ["fire", "volley", "mega"]:
			var aim: String = str(pl.get("aim", ""))
			crit = aim == "critical"
			txt += "  ·  " + ("Critical" if crit else aim.capitalize())
			if _field():
				txt += " at %s" % Battle.foes(b)[maxi(0, Battle.target_of(b, pl))]["name"]
		var ab: Dictionary = Js.obj(pl.get("ability"))
		if not ab.is_empty():
			for c: Dictionary in s["crew"]:
				if c["id"] == ab["crew"]:
					txt += "  +  %s" % c["name"]
			var ti: int = int(Js.nz(ab.get("target"), -1.0))
			if ti >= 0 and ti < (b["seats"] as Array).size() and b["seats"][ti] != s:
				txt += " for %s" % ("you" if ti == me else str(b["seats"][ti]["name"]))
	var f: Font = Kit.font("karla", 800)
	var w: float = f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x + (40.0 if kind != "" else 24.0)
	var r: Rect2 = Rect2(at - Vector2(w / 2.0 - 8.0, 0), Vector2(w, 24)) if not beside else Rect2(at, Vector2(w, 24))
	BattleLook.draw_box(self, r, BattleLook.box(Color(BattleLook.LACQUER, 0.94), Color(BattleLook.GOLD, 0.95) if crit else Color(0, 0, 0, 0), 1 if crit else 0, 12))
	var tx: float = r.position.x + 12.0
	if kind != "":
		BattleLook.icon(self, kind, Vector2(r.position.x + 16.0, r.get_center().y), 7.0, BattleLook.GOLD if crit else BattleLook.CREAM)
		tx = r.position.x + 30.0
	draw_string(f, Vector2(tx, r.position.y + 16.5), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, BattleLook.GOLD if crit else (BattleLook.CREAM if kind != "" else BattleLook.MUTED))


## While choosing: a crewmate's critical already in is half a crossfire.
func _xfire_hint() -> void:
	if table == null or not _alive_me() or Battle.alive(b).size() < 2:
		return
	var plans: Dictionary = Js.obj(_latest.get("plans"))
	if plans.has(my_key):
		return
	var names: Array = []
	for st: Dictionary in Battle.alive(b):
		var pl: Dictionary = Js.obj(plans.get(st.get("key")))
		if st.get("key") != my_key and str(pl.get("aim", "")) == "critical" and str(pl.get("action", "")) in ["fire", "volley", "mega"]:
			names.append([str(st["name"]), Battle.target_of(b, pl)])
	if not names.is_empty():
		if _field():
			var fe2: Dictionary = Battle.foes(b)[maxi(0, int(names[0][1]))]
			_log_line("%s landed a critical on %s. Land one on it too for a crossfire." % [names[0][0], fe2["name"]])
		else:
			_log_line("%s landed a critical. Land one too for a crossfire." % " and ".join(PackedStringArray(names.map(func(n: Array) -> String: return str(n[0])))))
	else:
		_log_line("Crossfire: two or more criticals in one round hit harder.")



## A captain's avatar as a texture (game/avatar.gd, the web's CharacterAvatar:
## their colour and hat, framed as the leaderboards frame it), rendered once
## off screen for the plates and the turn track.
func _face(i: int) -> Texture2D:
	if _faces.has(i):
		return _faces[i]
	if b.is_empty() or i >= (b["seats"] as Array).size():
		return null
	var face: Dictionary = Js.obj(b["seats"][i].get("face"))
	if face.is_empty() and i == me and sea != null:
		face = { "characterColor": str(Js.nz(sea.session.profile().get("character_color"), "default")), "hat": sea.session.profile().get("equipped_hat") }
	var sv: SubViewport = SubViewport.new()
	sv.size = Vector2i(128, 128)
	sv.transparent_bg = true
	sv.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	var av: Avatar = Avatar.new()
	av.px = 128.0
	av.face = face.merged({ "bg": "#2a1f17", "ring": "#00000000" })
	sv.add_child(av)
	add_child(sv)
	_faces[i] = sv.get_texture()
	return _faces[i]


# ── The enemy's stat card ────────────────────────────────────────────────────

## Is a screen point on the enemy's hull or its plate?
func _foe_plate_hit(p: Vector2) -> int:
	for j: int in _foe_nodes.size():
		var en: Variant = _foe_nodes[j]
		if en == null or not is_instance_valid(en) or float((en as HullRig).sink) > 0.3:
			continue
		var pa: Vector2 = _plate_at.get("e%d" % j, _screen((en as Node2D).position) + Vector2(0, _plate_lift(225.0)))
		if Rect2(pa + Vector2(-121, 0), Vector2(258, 60)).has_point(p):
			return j
	return -1


func _foe_hull_hit(p: Vector2) -> int:
	for j: int in _foe_nodes.size():
		var en: Variant = _foe_nodes[j]
		if en == null or not is_instance_valid(en) or float((en as HullRig).sink) > 0.3:
			continue
		var at: Vector2 = _screen((en as Node2D).position)
		var bx: float = (en as HullRig).box
		var z: float = _z()
		if Rect2(at + Vector2(-bx * 0.5 * z, -200.0 * z), Vector2(bx * z, 240.0 * z)).has_point(p):
			return j
	return -1


func _open_enemy_card(j: int = 0) -> void:
	card_seen = true
	Sound.plip()
	var fs: Array = Battle.foes(b)
	j = clampi(j, 0, fs.size() - 1)
	var e: Dictionary = fs[j]
	var tex: Texture2D = _foe_tex[j] if j < _foe_tex.size() else _portrait
	_card = EnemyCard.new()
	(_card as EnemyCard).e = e
	(_card as EnemyCard).hp = float(_shown_hp.get("e%d" % j, e["hp"]))
	# Its painting; an enemy with no portrait shows its ship.
	(_card as EnemyCard).portrait = tex if tex != null else Skipper.tex(str(e.get("image", "")).trim_prefix("/"))
	(_card as EnemyCard).ground = tex != null
	(_card as EnemyCard).where = ("%s, depth %d" % [Gauntlet.NAMES.get(gauntlet, ""), int(Js.num(b.get("depth")))]) if gauntlet != "" else "%s, fight %d of %d" % [_raid.get("raidTitle", ""), int(b["fight"]) + 1, int(Battle.fight_at(_raid, int(b["fight"]))["of"])]
	add_child(_card)


func _open_captain_card(i: int) -> void:
	Sound.plip()
	var c: CaptainCard = CaptainCard.new()
	c.s = b["seats"][i]
	c.face = _face(i)
	c.mine = i == me
	_card = c
	add_child(c)


## The camera's zoom on the fight (things drawn over the water scale with it).
func _z() -> float:
	return float(Js.obj(sea.stage).get("zoom", 1.0)) if sea != null and sea.stage is Dictionary else 1.0


## How far above a hull's keel its plate sits: over the masthead, following
## the zoom (never so low it covers the hull, nor so high it floats off).
func _plate_lift(at_one: float) -> float:
	return -at_one


## A slim hull tag's height over the keel (frames mode), following the zoom.
func _tag_lift() -> float:
	return -clampf(200.0 * _z(), 110.0, 240.0)


## Plates that would overlap (side by side within a plate's width, less than
## a plate apart) are pushed down to clear the one above. Returns key: place.
static func _spread(want: Array) -> Dictionary:
	want.sort_custom(func(x: Array, y: Array) -> bool: return (x[1] as Vector2).y < (y[1] as Vector2).y)
	var placed: Array = []
	var out: Dictionary = {}
	for w: Array in want:
		var p: Vector2 = w[1]
		for q: Vector2 in placed:
			if absf(q.x - p.x) < 262.0 and p.y < q.y + 74.0 and p.y > q.y - 74.0:
				p.y = q.y + 74.0
		placed.append(p)
		out[w[0]] = p
	return out



## Frames rather than plates on the water: a field of enemies, or more than
## two ships in the line (they would crowd the water and each other).
func _frames_mode() -> bool:
	return not b.is_empty() and (Battle.foes(b).size() > 1 or (b["seats"] as Array).size() > 2)


## A slim tag over a hull in frames mode: its name and a thin bar of its hull.
func _hull_tag(at: Vector2, nm: String, share: float, col: Color, lit: bool, alpha: float) -> void:
	if alpha <= 0.05:
		return
	var f: Font = Kit.font("karla", 800)
	BattleLook.say(self, f, at.x, at.y, nm, 12, Color(BattleLook.GOLD if lit else BattleLook.CREAM, alpha), 5)
	var r: Rect2 = Rect2(at + Vector2(-45, 6), Vector2(90, 5))
	BattleLook.draw_box(self, r.grow(1.0), BattleLook.box(Color(0, 0, 0, 0.6 * alpha), Color(0, 0, 0, 0), 0, 3))
	BattleLook.draw_box(self, Rect2(r.position, Vector2(maxf(3.0, r.size.x * clampf(share, 0.0, 1.0)), r.size.y)), BattleLook.box(Color(col, alpha), Color(0, 0, 0, 0), 0, 2.5))



# ── The hulls' answers to the guns ────────────────────────────────────────────

## The hull of a ship in the fight: a seat (yours, or a crewmate's), or an
## enemy (-1 - its index).
func _hull_of(who: int) -> Object:
	if who < 0:
		var j: int = -1 - who
		return _foe_nodes[j] if j < _foe_nodes.size() and is_instance_valid(_foe_nodes[j]) else null
	if who == me:
		return sea._boat
	return _mate_of(who)


## How a hull answers: a hit (leans and is shoved away from the guns, flushes
## red), a crit (harder), its own guns' recoil, a brace (a lean into it), a
## reload (a settle), a dodge (a hard swerve aside with foam).
func _react(who: int, kind: String) -> void:
	var h: Object = _hull_of(who)
	if h == null or not h.has_method("react"):
		return
	# The enemies ride to the east: a blow pushes them east, the line west.
	var away: float = 1.0 if who < 0 else -1.0
	match kind:
		"hit":
			h.call("react", 0.07 * away, Vector2(18.0 * away, 2.0), 0.85)
		"crit":
			h.call("react", 0.15 * away, Vector2(34.0 * away, -4.0), 1.0)
		"recoil":
			h.call("react", 0.035 * away, Vector2(12.0 * away, 0.0), 0.0)
		"brace":
			h.call("react", -0.05 * away, Vector2(-4.0 * away, 0.0), 0.0)
		"reload":
			h.call("react", 0.0, Vector2(0.0, 6.0), 0.0)
		"dodge":
			var side: float = -1.0 if randf() < 0.5 else 1.0
			h.call("react", -0.14 * away, Vector2(30.0 * away, 70.0 * side), 0.0)


## A ball came down on (or past) a ship.
func _landed(who: int, land: String, k: int) -> void:
	match land:
		"hit", "crit":
			_react(who, land)
			if who >= 0:
				Rumble.buzz([0, 35] if land == "hit" else [0, 60, 30, 60])
		"dodge":
			if k == 0:
				_react(who, "dodge")
				var at: Vector2 = _seat_at(who) if who >= 0 else _foe_at(-1 - who)
				_fx.swerve(at, -1.0 if who >= 0 else 1.0)



func _role_name(e: Dictionary) -> String:
	return str(Js.obj(Battle.roles_cfg().get(str(e.get("role", "")))).get("name", ""))


## A bond's motion, read from what it did: a ball handed over, a shield
## thrown, a heal carried, a mark set, a status lifted.
func _bond_move(x: Dictionary, at: Vector2) -> void:
	var from: Vector2 = _seat_at(int(x["seat"]))
	var tx: String = str(x.get("text", ""))
	if tx.contains("ball"):
		if int(x.get("to", -1)) == int(x["seat"]):
			_fx.reload(from, true)
		else:
			_fx.toss(from, at)
	elif tx.contains("shield") or tx == "Shield Wall":
		_fx.tether(from, at, Color(0.6, 0.85, 1.0))
	elif tx.begins_with("+"):
		_fx.motes(from, at, Color(0.5, 0.95, 0.6), 8)
	elif tx == "Marked" or tx.begins_with("Spotted"):
		_fx.sigil(at, Color(1.0, 0.82, 0.4))
	elif tx == "Boarded!":
		_fx.tether(from, at, Color(0.85, 0.7, 0.5))
	elif tx == "Cleared":
		_fx.rise(at, Color(0.95, 0.95, 1.0), 6)
	elif tx == "Signal up":
		_fx.pulse(from, Color(1.0, 0.85, 0.45))


## A REACTION (two captains' elements on one ship): its own moment each, the
## name over the water, and "Reaction discovered" the first time this captain
## sees it.
func _reaction(x: Dictionary) -> void:
	var fj: int = int(x["foe"])
	var at: Vector2 = _foe_at(fj)
	var from: Vector2 = _seat_at(int(x["seat"]))
	var others: Array = Js.list(x.get("others"))
	match str(x["id"]):
		"fog_bank":
			# Fire meets ice: a wall of white steam boils up off the hull.
			_fx.glyph_burst(at, "frost", Color(0.95, 0.97, 1.0, 0.7), 12, 140.0, 90.0)
			_fx.glyph_burst(at, "ember", Color(1.0, 0.6, 0.3), 6, 200.0, 14.0)
			_num(at + Vector2(0, -60), "Lost in the steam", Color(0.85, 0.9, 0.95))
		"greek_fire":
			# Green fire leaping hull to hull.
			_fx.flare_up(at, true)
			for o: Variant in others:
				_fx.fire_leap(at, _foe_at(int(Js.obj(o)["foe"])), Color(0.45, 1.0, 0.4))
		"powder_keg":
			_fx.blast(at)
			_fx.glyph_burst(at, "ember", Color(1.0, 0.7, 0.3), 18, 360.0, 16.0, 400.0)
			for o2: Variant in others:
				_fx.fling(at, _foe_at(int(Js.obj(o2)["foe"])), "fireball", Color(1.0, 0.7, 0.4))
		"brittle_hull":
			# The ice shatters: slivers flung out, cracks across the hull.
			_fx.glyph_burst(at, "ice", Color(0.85, 0.95, 1.0), 16, 300.0, 34.0, 500.0)
			_fx.glyph_burst(at, "crack", Color(0.8, 0.92, 1.0), 4, 60.0, 60.0)
			_fx.burst(at, true)
		"crushing_deep":
			# The coils close: the spiral collapses inward and the sea leaps up.
			_fx.status_burst(at, "slowed")
			_fx.splash(at)
			_fx.glyph_burst(at, "ember", Color(0.35, 0.95, 0.8), 14, 240.0, 16.0)
		"boiling_sea":
			# Bubbles boiling up round the hull, steam over them.
			for k: int in 3:
				_fx.glyph_burst(at + Vector2(randf_range(-60, 60), 0), "bubble", Color(1.0, 0.7, 0.35), 6, 90.0, 22.0, -120.0)
			_fx.glyph_burst(at, "frost", Color(1.0, 0.95, 0.9, 0.5), 6, 80.0, 70.0)
		"rot":
			# The barrier rots: acid bubbles, its shell cracking away.
			_fx.glyph_burst(at, "bubble", FxSheet.status_color("corrode"), 10, 120.0, 24.0, -60.0)
			_fx.glyph_burst(at, "crack", Color(0.75, 0.9, 1.0), 6, 140.0, 50.0)
			_num(at + Vector2(0, -60), "Barrier rots away", Color(0.75, 0.85, 0.35))
		"numbed":
			_fx.freeze_snap(at)
			_fx.status_burst(at, "slowed")
			_num(at + Vector2(0, -60), "Numbed  +1 turn frozen", Color(0.7, 0.85, 1.0))
		"last_rites":
			# A beam of gold down onto the marked hull.
			_fx.beam(from, at, Color(1.0, 0.85, 0.45), false)
			_fx.finisher(at)
		"davys_kiss":
			# A whirlpool opening under every ship.
			for j2: int in Battle.foes(b).size():
				_fx.status_burst(_foe_at(j2), "slowed")
				_fx.glyph_burst(_foe_at(j2), "ember", Color(0.3, 0.85, 0.85), 16, 200.0, 14.0)
				_fx.splash(_foe_at(j2))
	if Js.num(x.get("dmg")) > 0.0:
		_num(at, "-%d" % int(x["dmg"]), Color(1.0, 0.8, 0.5), true)
	for o2: Variant in others:
		var od: Dictionary = Js.obj(o2)
		if od.has("dmg"):
			_num(_foe_at(int(od["foe"])), "-%d" % int(od["dmg"]), Color(1.0, 0.75, 0.45))
			_shown_hp["e%d" % int(od["foe"])] = float(od["hp"])
	_shown_hp["e%d" % fj] = float(x["enemyHp"])
	var fresh: bool = Js.list(x.get("new")).has(my_key)
	_say(("Reaction discovered!  " if fresh else "") + str(x["name"]))
	_log_line("%s!  %s" % [x["name"], str(Battle.reaction_def(str(x["id"])).get("desc", ""))] if fresh else "%s!" % x["name"])
	Sound.seal(true)
	if fresh:
		Sound.perfect()
	await _wait(1.1 if fresh else 0.6)


## A role's move on the water: a beam of light from the caster to the ally it
## shields or mends, a bolt to the captain it hexes, a pulse through the line
## it rallies.
func _role_move(x: Dictionary) -> void:
	_strip_lit = -1 - _cur
	var from: Vector2 = _enemy_at
	var nm: String = str(x.get("name", ""))
	match str(x["role"]):
		"shieldwright", "sawbones":
			var tj: int = int(x["to"])
			var to: Vector2 = _foe_at(tj)
			var col: Color = Color(0.55, 0.8, 1.0) if x["role"] == "shieldwright" else Color(0.5, 0.95, 0.6)
			_react(-1 - _cur, "brace")
			_fx.tether(from, to, col)
			await _wait(0.45)
			if x["role"] == "shieldwright":
				_num(to + Vector2(0, -60), "+%d shield" % int(x["amount"]), col, true)
			else:
				_num(to + Vector2(0, -60), "+%d" % int(x["amount"]), col, true)
				_shown_hp["e%d" % tj] = float(x["hp"])
			_log_line("The %s %s %s." % [nm, "throws a barrier over" if x["role"] == "shieldwright" else "patches up", "itself" if tj == _cur else Battle.foes(b)[tj]["name"]])
		"hexer":
			var si: int = int(x["seat"])
			_fx.tether(from, _seat_at(si), FxSheet.status_color(str(x["status"])))
			_fx.status_burst(_seat_at(si), str(x["status"]))
			await _wait(0.4)
			_react(si, "hit")
			_num(_seat_at(si) + Vector2(0, -60), "Blinded!" if x["status"] == "blinded" else "Narrowed!", Color(0.8, 0.6, 1.0), true)
			_log_line("The %s hexes %s: %s." % [nm, "you" if si == me else b["seats"][si]["name"], "sight only near the needle" if x["status"] == "blinded" else "a smaller mark to hit"])
		"spotter":
			var sj: int = int(x["seat"])
			_fx.tether(from, _seat_at(sj), FxSheet.status_color("marked"))
			_fx.status_burst(_seat_at(sj), "marked")
			await _wait(0.4)
			_num(_seat_at(sj) + Vector2(0, -60), "Marked!", Color(1.0, 0.5, 0.4), true)
			_log_line("The %s spots %s: Marked, every hit lands harder for a while." % [nm, "you" if sj == me else b["seats"][sj]["name"]])
		"rallier":
			_react(-1 - _cur, "brace")
			for j: Variant in Js.list(x.get("all")):
				_fx.status_burst(_foe_at(int(j)), "enrage")
				_num(_foe_at(int(j)) + Vector2(0, -60), "Enraged!", Color(1.0, 0.55, 0.4))
			_log_line("The %s rallies the line: they hit harder for a while." % nm)
	Sound.seal(true)
	await _wait(0.45)



## THE MARK OF A RAID BEATEN: a gold seal slams down mid-screen (a thump, a
## ring of light), "RAID CLEARED" over it and the tier under it; the first
## clear of that tier says so on a ribbon, with a burst of gold.
func _stamp(tier: String, first: bool) -> void:
	var st: Stamp = Stamp.new()
	st.tier = { "normal": "Normal", "coop": "Co-op", "coopc": "Co-op Challenge" }.get(tier, "Normal")
	st.first = first
	add_child(st)
	Sound.impact(true)
	Sound.seal(true)
	if first:
		Sound.chest(true)
	Rumble.buzz([0, 70, 40, 50])


class Stamp:
	extends Control
	var tier: String = ""
	var first: bool = false
	var _t: float = 0.0

	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(delta: float) -> void:
		_t += delta
		if _t > 3.2:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var c: Vector2 = Vector2(size.x / 2.0, size.y * 0.42)
		var land: float = clampf(_t / 0.22, 0.0, 1.0)
		var k: float = lerpf(2.6, 1.0, 1.0 - pow(1.0 - land, 3.0))
		var a: float = clampf(_t / 0.12, 0.0, 1.0) * (1.0 - smoothstep(2.6, 3.2, _t))
		# The sea dims behind it, so the seal reads.
		draw_rect(Rect2(Vector2.ZERO, size), Color(0, 0, 0, 0.62 * a))
		# The ring of light where it lands.
		if land >= 1.0:
			var u: float = clampf((_t - 0.22) / 0.6, 0.0, 1.0)
			draw_arc(c, 90.0 + 160.0 * u, 0.0, TAU, 64, Color(1.0, 0.85, 0.45, 0.6 * (1.0 - u)), 6.0 * (1.0 - u) + 1.0, true)
			if first:
				for q: int in 18:
					var ang: float = TAU * q / 18.0 + 0.3
					var d: float = 100.0 + 220.0 * u
					draw_circle(c + Vector2(cos(ang), sin(ang)) * d, 4.0 * (1.0 - u), Color(1.0, 0.85, 0.4, 1.0 - u))
		draw_set_transform(c, -0.06, Vector2(k, k))
		var r: float = 78.0
		draw_circle(Vector2(0, 4), r + 8.0, Color(0, 0, 0, 0.35 * a))
		draw_circle(Vector2.ZERO, r, Color(BattleLook.GOLD.darkened(0.12), a))
		draw_arc(Vector2.ZERO, r - 8.0, 0.0, TAU, 64, Color(1, 0.95, 0.75, 0.55 * a), 2.0, true)
		draw_arc(Vector2.ZERO, r - 14.0, 0.0, TAU, 64, Color(0.3, 0.2, 0.08, 0.35 * a), 1.0, true)
		draw_polyline(PackedVector2Array([Vector2(-30, 2), Vector2(-8, 24), Vector2(32, -22)]), Color(0.18, 0.12, 0.05, a), 9.0, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		var f: Font = Kit.font("cinzel", 800)
		BattleLook.say(self, f, c.x, c.y - 110.0, "RAID CLEARED", 30, Color(BattleLook.CREAM, a), 8)
		BattleLook.say(self, Kit.font("karla", 800), c.x, c.y + 122.0, tier.to_upper(), 16, Color(BattleLook.GOLD, a), 6)
		if first:
			var rib: String = "FIRST CLEAR"
			var rw: float = Kit.font("karla", 800).get_string_size(rib, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x + 30.0
			var rr: Rect2 = Rect2(Vector2(c.x - rw / 2.0, c.y + 136.0), Vector2(rw, 26))
			BattleLook.draw_box(self, rr, BattleLook.box(Color(BattleLook.GOLD.darkened(0.5), 0.95 * a), Color(BattleLook.GOLD, a), 1, 13))
			BattleLook.say(self, Kit.font("karla", 800), c.x, rr.end.y - 8.0, rib, 13, Color(BattleLook.GOLD.lightened(0.3), a))



# ── A gauntlet's own: the depth called, the track, the wash ──────────────────

func _seat_index(key: String) -> int:
	for i: int in (b["seats"] as Array).size():
		if b["seats"][i].get("key") == key:
			return i
	return -1


## Each new depth, called over the water: its number, the band of the deep,
## the host's voice; a boss or an elite waiting; the Don rising.
## The descent, on the water: the spiral under the party, then the depth.
func _descend() -> void:
	var dn: Dictionary = Js.obj(_latest.get("descent"))
	if _moments != null and _moments._pieces.has("fence"):
		_moments.fence_leave()
	if _moments != null and _moments._pieces.has("launch"):
		_moments.launch_leave()
	if dn.is_empty() or _moments == null or autoplay:
		return
	var d: int = int(Js.num(dn.get("depth")))
	var band: Dictionary = Gauntlet.band(maxi(1, d), gauntlet)
	await _moments.descent(_party_center(), d, Color(str(band.get("accent", "#9fc4e0"))))


## The sheet steps aside while a moment plays on the water.
func _sheet_aside() -> void:
	if _ov != null:
		_ov_phase = ""
		_ov.show_state({})


## Across the water from the party, where the enemy stood (a set piece's spot).
func _ahead() -> Vector2:
	if not _foe_pos.is_empty():
		return _foe_pos[0]
	return sea._boat.position + Vector2(620, -40)


## Where the party rides, the middle of its hulls.
func _party_center() -> Vector2:
	var sum: Vector2 = Vector2.ZERO
	var n: int = (b["seats"] as Array).size()
	for i: int in n:
		sum += _seat_at(i)
	return sum / float(maxi(1, n))


## Every hull of the party on the water (yours first).
func _party_hulls() -> Array:
	var out: Array = [sea._boat]
	for i: int in (b["seats"] as Array).size():
		if i != me:
			var m: Shipmate = _mate_of(i)
			if m != null:
				out.append(m)
	return out


## A between-fights moment, staged before its sheet: once each, per depth.
func _stage(cur: Dictionary) -> void:
	if _moments == null or autoplay:
		return
	var ph: String = str(cur.get("phase", ""))
	var depth: int = int(Js.num(b.get("depth")))
	if ph != "fence" and _moments._pieces.has("fence"):
		_moments.fence_leave()
	if not ph in ["contract", "jobResult"] and _moments._pieces.has("launch"):
		_moments.launch_leave()
	if ph != "shrine" and _moments._pieces.has("shrine"):
		_sheet_aside()
		var sh: Dictionary = Js.obj(cur.get("shrine")) if cur.has("shrine") else Js.obj(cur.get("lastShrine"))
		await _moments.shrine_answer(Js.obj(Js.obj(sh.get("picks")).get(my_key)), _seat_at(me))
	var key: String = "%s:%d" % [ph, depth]
	if _staged.has(key):
		return
	_staged[key] = true
	if ph in ["shrine", "fence", "haul", "dead", "curse", "contract", "breather"]:
		_sheet_aside()
	match ph:
		"shrine":
			await _moments.shrine_rise(_ahead() + Vector2(-60, 40))
		"fence":
			await _moments.fence_arrive(_ahead() + Vector2(-20, 20))
		"curse":
			await _moments.curse(_party_center(), Color(str(Gauntlet.band(maxi(1, depth), gauntlet).get("accent", "#9a6ad0"))))
		"contract":
			await _moments.launch_arrive(_ahead() + Vector2(-60, 120))
		"breather":
			await _moments.breather(_party_center())
		"haul":
			await _moments.homeward(_party_center(), _party_hulls())
		"dead":
			await _moments.drowned(_party_hulls())


func _depth_call() -> void:
	var dn: Dictionary = Js.obj(_latest.get("descent"))
	if dn.is_empty():
		return
	SteamLayer.presence("#Gauntlet", { "gauntlet": str(Gauntlet.NAMES.get(gauntlet, "The gauntlet")), "depth": str(int(Js.num(dn.get("depth")))) })
	if gauntlet != "":
		sea.water_theme = _water_theme(dn)
	var dc: DepthCall = DepthCall.new()
	dc.depth = int(Js.num(dn.get("depth")))
	dc.band = Js.obj(dn.get("band"))
	dc.taunt = str(dn.get("taunt", ""))
	dc.rise = Js.obj(dn.get("rise"))
	dc.note = "Something holds this water." if dn.get("boss", false) else ("A hunter waits below." if dn.get("elite", false) else "")
	if int(Js.num(dn.get("ships"))) > 1:
		dc.note = ("%s  " % dc.note if dc.note != "" else "") + "%d ships." % int(dn["ships"])
	dc.don = gauntlet == "don"
	add_child(dc)
	if dn.get("apex", false) or dn.get("boss", false):
		Sound.horn()
	var hold: float = 4.2 if dn.get("apex", false) else (3.0 if dc.taunt != "" else 1.8)
	await _wait(hold if not autoplay else 0.4)
	dc.leave()


func _depth_track(hb: float) -> void:
	var run: Dictionary = Js.obj(_latest.get("run"))
	var d: int = int(Js.num(b.get("depth")))
	var band: Dictionary = Gauntlet.band(maxi(1, d), gauntlet)
	draw_string(Kit.font("cinzel", 800), Vector2(30, hb * 0.5 - 2.0), str(Gauntlet.NAMES.get(gauntlet, "")), HORIZONTAL_ALIGNMENT_LEFT, -1, 19, Color(BattleLook.CREAM, 0.96))
	var line: String = "DEPTH %d  ·  %s  ·  %s ⟡ IN THE POT" % [d, str(band.get("name", "")).to_upper(), Js.thousands(Js.num(run.get("pot")))]
	var nc: int = Js.obj(run.get("curses")).size()
	if nc > 0:
		line += "  ·  %d CURSE%s" % [nc, "" if nc == 1 else "S"]
	if str(run.get("mode", "solo")) == "coop":
		line += "  ·  CO-OP"
	draw_string(Kit.font("karla", 800), Vector2(32, hb * 0.5 + 19.0), line, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(str(band.get("accent", "#cccccc"))).lerp(BattleLook.MUTED, 0.3))


## The deep's wash on an enemy's hull.
func _wash(e: Dictionary) -> Color:
	match str(e.get("wash", "")):
		"davy": return Color(0.78, 0.84, 0.86)
		"don": return Color(0.72, 0.92, 0.74)
	return Color.WHITE


## A depth called: big over the water, then gone.
class DepthCall:
	extends Control
	var depth: int = 1
	var band: Dictionary = {}
	var taunt: String = ""
	var note: String = ""
	var rise: Dictionary = {}
	var don: bool = false
	var _a: float = 0.0

	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		create_tween().tween_property(self, "_a", 1.0, 0.35)

	func leave() -> void:
		var tw: Tween = create_tween()
		tw.tween_property(self, "_a", 0.0, 0.4)
		tw.tween_callback(queue_free)

	func _process(_d: float) -> void:
		queue_redraw()

	func _draw() -> void:
		var vp: Vector2 = size
		var c: Vector2 = Vector2(vp.x / 2.0, vp.y * 0.36)
		var acc: Color = Color(str(band.get("accent", "#cccccc")))
		for k: int in 6:
			draw_rect(Rect2(0, c.y - 110 + k * 4, vp.x, 220 - k * 8), Color(0, 0, 0, 0.07 * _a))
		var eyebrow: String = str(rise.get("eyebrow", "")) if not rise.is_empty() else ("Into the Green" if don else "Into the Locker") if depth <= 1 else ("A milestone" if depth % 10 == 0 else "Deeper still")
		BattleLook.say(self, Kit.font("karla", 800), c.x, c.y - 62, eyebrow.to_upper(), 13, Color(acc, _a))
		var title: String = str(rise.get("title", "")) if not rise.is_empty() else "Depth %d" % depth
		BattleLook.say(self, Kit.font("cinzel", 800), c.x, c.y + 4, title, 58, Color(BattleLook.CREAM, _a), 10)
		var sub: String = str(rise.get("sublabel", "")) if not rise.is_empty() else str(band.get("name", ""))
		BattleLook.say(self, Kit.font("cinzel", 700), c.x, c.y + 40, sub, 20, Color(acc.lerp(BattleLook.CREAM, 0.3), _a))
		var words: String = str(rise.get("line", "")) if not rise.is_empty() else taunt
		if words != "":
			BattleLook.say(self, Kit.font("karla", 600), c.x, c.y + 78, "\"%s\"" % words, 16, Color(BattleLook.CREAM, 0.85 * _a))
		if note != "":
			BattleLook.say(self, Kit.font("karla", 800), c.x, c.y + (110 if words != "" else 76), note, 14, Color(Dossier.HARM if note.begins_with("Something") else Dossier.WARN, _a))



## A dive's water, as the web's arena graded it (arenaTheme): the descent's
## own sea (Davy's cold teal-grey, the Don's kraken green),
## falling toward black the deeper the dive, heavier for a boss, the Don's
## rise the darkest green of all; the world's light tinted to match.
func _water_theme(dn: Dictionary) -> Dictionary:
	var d: int = int(Js.num(dn.get("depth", b.get("depth", 1))))
	var l: Dictionary = DeepLook.look(gauntlet, maxi(1, d), dn.get("boss", false) == true, dn.get("apex", false) == true)
	if _atmos != null:
		_atmos.set_look(l)
	return l
