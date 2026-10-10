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

## The stage's parts (split out on 2026-10-10 for size): each holds static
## helpers that take the stage first; every piece of state stays here.
## The deck and its input; a round played on the water; the HUD drawn over
## it; a Charter's table followed; a gauntlet's own staging.
const BattleStageDeck = preload("res://game/battle_stage_deck.gd")
const BattleStagePlayback = preload("res://game/battle_stage_playback.gd")
const BattleStageHud = preload("res://game/battle_stage_hud.gd")
const BattleStageSync = preload("res://game/battle_stage_sync.gd")
const BattleStageDive = preload("res://game/battle_stage_dive.gd")

const BAR: float = 74.0
## The fight's shared colours come from BattleLook (aliases of the Kit and
## Paper tokens); one-off tints for single effects are typed where they are used.

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
## The crew's XP showing after a fight: their row stays lit while it plays.
var _crew_lit: bool = false
var _deck_h: float = 0.0
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
## How far the deck's orders are dimmed, out of play (0 lit, 1 dimmed):
## eased by _deck_dim, one curve both ways.
var _dim: float = 1.0
var _dim_tw: Tween = null
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
## The plan's whole wait when it began (for the draining line).
var _plan_len: float = 0.0
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
		# A fight of your own: crewmates sailing nearby step out of it (they
		# come back as it ends, below).
		if table == null:
			(sea._mates[k] as Node2D).create_tween().tween_property(sea._mates[k], "modulate:a", 0.0, 0.6)
	var sail: Tween = create_tween()
	sail.tween_property(sea._boat, "position", _at + _offset(me), 2.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	sea._hud.visible = false
	_fx = BattleFx.new()
	_fx.field = sea._field
	_fx.z_index = 6
	_fx.set_meta("fight", true)
	sea._world.add_child(_fx)
	_frame()
	_banner = Kit.text(self, "", "display", BattleLook.CREAM)
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
	BattleStageDeck._build_deck(self)
	if table != null:
		BattleStageSync._nudge_build(self)
	if gauntlet != "":
		sea.water_theme = BattleStageDive._water_theme(self, {})
		_ov = GauntletOverlay.new()
		_ov.my_key = my_key
		_ov.profile = sea.session.profile()
		_ov.face_of = func(k: String) -> Texture2D:
			var si: int = _seat_index(k)
			return _face(si) if si >= 0 else null
		_ov.acted.connect(func(a: Array) -> void:
			var r: Variant = await BattleStageSync._act(self, a)
			if r is Dictionary and (r as Dictionary).has("error"):
				_log_line(str(r["error"])))
		add_child(_ov)
		_moments = GauntletMoments.new()
		_moments.field = sea._field
		_moments.fx = _fx
		_moments.set_meta("fight", true)
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
		BattleStageSync._pump(self, Js.obj(table.get("state")))
		return
	await _pre_fight_words()
	await _enemy_enters()
	BattleStageDeck._await_plan(self)


## The camera's frame on the fight: centred between the two, zoomed so the
## pair fills the middle of the screen.
const FRAME_FILL: Vector2 = Vector2(0.56, 0.47)
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
	# FRAME_FILL: how much of the screen the fight fills (Kong, 2026-10-09:
	# "very zoomed in" at 0.72 / 0.6, eased out about a fifth).
	var z: float = clampf(minf(vp.x * FRAME_FILL.x / span, vp.y * FRAME_FILL.y / tall), 0.35, 1.5)
	var mid: Vector2 = Vector2((lo.x + ehi.x) / 2.0, (lo.y + hi.y) / 2.0) - (_at + _offset(me))
	sea.stage = { "zoom": z, "shift": Vector2(mid.x, mid.y * Chart.GROUND - 40.0) * z }


func _process(delta: float) -> void:
	_t += delta
	if _nudge_btn != null:
		_nudge_btn.visible = not _gone and Time.get_ticks_msec() - _wait_ms >= int(RaidTable.AFK_WAIT * 1000.0) and BattleStageSync._held_up(self)
	# Every player ship in the line faces the enemy, bow to the right, for the
	# whole fight (Kong, 2026-10-05: one hull was seen turned away); only a
	# ship running from it (fled, the stage gone) turns about.
	if not _gone and sea != null:
		sea._boat.face_to(1.0)
		if not b.is_empty():
			for i0: int in (b["seats"] as Array).size():
				var sm: Shipmate = _mate_of(i0) if i0 != me else null
				if sm != null and sm.face_lock != 1.0:
					sm.face_lock = 1.0
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
				en0.modulate = Color(0.75, 0.88, 1.0) if ae.ice else BattleStageDive._wash(self, e0)
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
		# Eased, not snapped: a repaint swaps the deck's rows over a frame, and
		# the height read mid-swap made it jump for that frame.
		var want_h: float = maxf(110.0, _deck_box.get_combined_minimum_size().y + 20.0)
		_deck_h = want_h if _deck_h <= 0.0 else lerpf(_deck_h, want_h, 1.0 - exp(-delta * 14.0))
		var dh: float = _deck_h
		var top_y: float = -BAR - 12.0 - dh
		# While a round plays the deck stays up (its log is being written);
		# only the orders dim, out of play.
		_deck.offset_top = top_y
		_deck.offset_bottom = -BAR - 12.0
		_deck_box.modulate.a = 1.0 - 0.65 * clampf(_dim, 0.0, 1.0)
		# A chooser open (Fire, Special): the crew's keys mean other things
		# there, so their row steps back.
		_crew_row.modulate.a = 1.0 if _crew_lit else _deck_box.modulate.a * (0.45 if _menu != "" else 1.0)
	for n: Dictionary in _numbers:
		n["t"] = float(n["t"]) + delta
	_numbers = _numbers.filter(func(n: Dictionary) -> bool: return float(n["t"]) < 1.4)
	if _banner_t >= 0.0:
		_banner_t += delta
		_banner.modulate.a = clampf(_banner_t / 0.2, 0.0, 1.0) * (1.0 - smoothstep(1.6, 2.1, _banner_t))
		if _banner_t > 2.1:
			_banner_t = -1.0
		# A queued line takes the banner once the one up has finished arriving.
		if not _say_queue.is_empty() and (_banner_t < 0.0 or _banner_t >= 0.6):
			_say(str(_say_queue.pop_front()))
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
		# A chapter's raid: its ships in the gang's colours (North.fleet_art).
		var hull_art: String = North.fleet_art(e["image"], North.raid_bay(str(b.get("raidId", ""))))
		node.tex = Skipper.tex(hull_art.trim_prefix("/"))
		# Bow toward the line: a bow-left painting (a Man-o-War) is not turned.
		node.def = { "seaFlip": North.bow_left(hull_art) }
		node.box = 400.0 if e["boss"] else (340.0 if j == 0 else 300.0)
		node.face = -1.0
		var at: Vector2 = lead_at + _foe_offset(j)
		var anchored: bool = at_anchor and j == 0
		node.position = at if anchored else at + Vector2(900, 30)
		node.z_index = 1
		node.set_meta("fight", true)
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
	# Films (FILM_QUIET): no banner of the field's generated names.
	if OS.get_environment("FILM_QUIET") != "":
		pass
	elif fs.size() > 1:
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


# ── The deck's state (its pieces: game/battle_stage_deck.gd) ─────────────────

## The aim bar (or Finn's dial) still waiting on its lock, or null. A Charter's
## table can default the plan and start the round while it waits: the deck is
## then cleared under it, and the aim is called off (see _clear_deck).
var _aiming: AimBar = null


## Films and tests: the deck plays itself (fire when loaded, else reload;
## the aim locks after a moment).
var autoplay: bool = false


## Which chooser is open on the deck: "" the orders, "fire" (Fire, Volley,
## the Mega) or "special" (the repair kit), as the web's ActionMenu.
var _menu: String = ""


# ── Over the water: the waits, the figures, the banner, the log ──────────────

func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


## Words or a figure rising off the water. crit: a critical (gold, the glow,
## CRITICAL over it), set only where the event says so; word: a small source
## word over the figure ("Burning", "Raked"), in word_col.
func _num(world_p: Vector2, text: String, col: Color, big: bool = false, crit: bool = false, word: String = "", word_col: Color = BattleLook.MUTED) -> void:
	# Words landing on the same spot at once stack upward rather than overprint.
	var stack: int = 0
	for n: Dictionary in _numbers:
		if float(n["t"]) < 0.7 and (n["p"] as Vector2).distance_to(world_p) < 90.0:
			stack = maxi(stack, int(n.get("k", 0)) + 1)
	_numbers.append({ "p": world_p, "text": text, "col": col, "big": big, "crit": crit, "word": word, "wcol": word_col, "t": 0.0, "k": stack, "dx": randf_range(-26.0, 26.0) })


## THE damage figure, one style: a bare number, cream on an enemy, the
## damage-taken red on your line, gold only for a critical; where it came
## from goes in a small word over it.
func _dmg(world_p: Vector2, amount: int, on_you: bool, crit: bool = false, word: String = "", word_col: Color = BattleLook.MUTED) -> void:
	var col: Color = BattleLook.CRIT if crit else (BattleLook.DMG_TAKEN if on_you else BattleLook.CREAM)
	_num(world_p, ("%d!" % amount) if crit else str(amount), col, crit, crit, word, word_col)


## The headline banner. One at a time: a new line while one is up swaps its
## words in place (no blink); one under 0.6s old is let finish its entrance
## first (queued). A Stamp on screen holds it (it carries the moment).
var _say_queue: Array = []


func _say(text: String) -> void:
	if _stamp_up():
		return
	if _banner_t >= 0.0 and _banner_t < 0.6 and _banner.text != text:
		_say_queue.append(text)
		return
	if _banner_t >= 0.2 and _banner_t <= 1.6:
		_banner.text = text
		_banner_t = 0.2
		return
	_banner.text = text
	_banner_t = 0.0


func _stamp_up() -> bool:
	for c: Node in get_children():
		if c is BattleStageHud.Stamp and not c.is_queued_for_deletion():
			return true
	return false


func _log_line(text: String) -> void:
	if _clog != null:
		_clog.note(text)


# ── A fight won, a raid done, a ship lost ─────────────────────────────────────

func _won() -> void:
	var e: Dictionary = b["enemy"]
	RaidFeats.fight_won(_feats, Battle.fight_at(_raid, int(b["fight"]))["boss"])
	var paid: Dictionary = RaidRun.award_kill(sea.session.store, sea.session.uid, _raid, str(e["id"]), Battle.fight_at(_raid, int(b["fight"]))["boss"])
	sea.session.persist()
	_say("%s sunk" % e["name"])
	_log_line("+%d Navigation XP  ·  +%d ⟡" % [int(paid["xp"]), int(paid["doubloons"])])
	await _crew_gains(Js.list(paid.get("crew")))
	await _wait(2.0)
	# A tide turns after some kills; the Throne offers a reprieve before its don.
	var tide: Dictionary = Battle.tide_due(b)
	if not tide.is_empty():
		await BattleStagePlayback._tide(self, tide, "A TIDE TURNS")
	var rp: Dictionary = Battle.reprieve_due(b)
	if not rp.is_empty():
		await BattleStagePlayback._tide(self, rp, "A REPRIEVE")
	var nx: Dictionary = Battle.next_fight(b)
	if nx["done"]:
		await _crate()
		return
	await _next_fight_in(nx)
	BattleStageDeck._await_plan(self)


## The next fight coming on (the solo path's next_fight, or a table's
## "nextFight" event): a rest stop called, a boss's horn and words, then
## the enemy enters.
func _next_fight_in(nx: Dictionary) -> void:
	if nx.get("rest", false):
		_say("Rest stop")
		_log_line("The crew catch their breath: every crew order is ready again.")
		await _wait(1.8)
	if nx.get("boss", false):
		Sound.horn()
		await _pre_fight_words()
	await _enemy_enters()


## THE CREW'S XP (Kong, 2026-10-05): after a fight, the hands who sailed it
## stand up on the deck, their XP rising off them; one who reached a level
## flashes it, and says the stronger order it brings when it brings one.
func _crew_gains(grants: Array) -> void:
	if grants.is_empty() or _crew_row == null:
		return
	var s: Dictionary = b["seats"][me]
	var by_id: Dictionary = {}
	for g: Dictionary in grants:
		by_id[str(g["id"])] = g
	for c0: Node in _crew_row.get_children():
		c0.queue_free()
	var any_up: bool = false
	var crew: Array = s["crew"]
	for ci: int in crew.size():
		var c: Dictionary = crew[ci]
		var g: Dictionary = by_id.get(str(c["id"]), {})
		var card: BattleLook.CrewCard = BattleStageDeck._order_card(self, s, c, ci) as BattleLook.CrewCard
		card.disabled = true
		card.state = str(Js.obj(Js.obj(Crew.t().get("classes")).get(c["cls"])).get("shortLabel", "")).to_upper()
		card.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_crew_row.add_child(card)
		if g.is_empty():
			continue
		card.disabled = false
		card.gain = "+%d XP" % int(paid_xp(g))
		card._gt = -0.15 * ci
		var lo: int = int(g["oldLevel"])
		var hi: int = int(g["newLevel"])
		if hi > lo:
			any_up = true
			card.level_up = "Level %d!" % hi
			var cls: Dictionary = Crew.class_of(str(c.get("slug", "")))
			for m: Dictionary in Js.list(cls.get("milestones")):
				if int(m["unlockLevel"]) > lo and int(m["unlockLevel"]) <= hi:
					card.unlock = "New: %s" % str(m.get("desc", ""))
	_crew_lit = true
	Sound.xp_tick()
	if any_up:
		get_tree().create_timer(0.6).timeout.connect(func() -> void: Sound.streak(5))
	await _wait(2.4 if any_up else 1.6)
	_crew_lit = false


static func paid_xp(g: Dictionary) -> float:
	return Js.num(g.get("gained"))


func _crate() -> void:
	var s: Dictionary = b["seats"][me]
	var r: Dictionary = RaidRun.open_crate(sea.session.store, sea.session.uid, _raid, float(s["fortune"]))
	var first: bool = RaidRun.record_tier_clear(sea.session.store, sea.session.uid, raid_id, "normal", {}, float(Time.get_ticks_msec() - _began_ms))
	if not _raid.get("skirmish", false):
		RaidFeats.grant(sea.session.store, sea.session.uid, raid_id, _feats)
	sea.session.persist()
	if not _raid.get("skirmish", false):
		# The Stamp carries the moment (and the boss line); no banner over it.
		BattleStageHud._stamp(self, "normal", first, str(_raid.get("bossDefeatedText", "")))
	else:
		_say(str(_raid.get("bossDefeatedText", "Victory")) if str(_raid.get("bossDefeatedText", "")) != "" else "Victory")
	if not r.is_empty():
		var items: Array = (r["items"] as Array).map(func(x: Dictionary) -> String: return str(x.get("label", x["id"])))
		_log_line("The crate: %s ⟡%s" % [Js.thousands(float(r["coin"])), ("  ·  " + ", ".join(PackedStringArray(items))) if not items.is_empty() else ""])
		Sound.chest(true)
	await _wait(3.2)
	_end(true)


## The "sunk" event's banner already said it: _lost only says it when no
## event did (one sinking banner, not two).
var _sunk_said: bool = false


func _lost() -> void:
	if not _sunk_said:
		_say("Holed below the waterline")
	_log_line("Your ship is going down. She limps home to the Gunwharf. Refit and come back.")
	Sound.slack()
	# Her hull answers as an enemy's does: a slow list and a settle, with a
	# burst and bubbles off her (righted when she is towed home).
	var at: Vector2 = _seat_at(me)
	if _fx != null:
		_fx.burst(at, false)
		_fx.glyph_burst(at, "bubble", BattleLook.CREAM, 8, 90.0, 18.0, -120.0)
	var ls: Tween = sea._boat.create_tween()
	ls.tween_property(sea._boat, "rotation", 0.1, 1.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
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
		# The sheet fades away before it goes.
		_ov._hide()
		var ov: GauntletOverlay = _ov
		get_tree().create_timer(0.25).timeout.connect(func() -> void:
			if is_instance_valid(ov):
				ov.queue_free())
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
	# A listing hull rights itself (sunk, she settled over).
	if absf(sea._boat.rotation) > 0.001:
		var rt: Tween = sea._boat.create_tween()
		rt.tween_property(sea._boat, "rotation", 0.0, 0.8).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	for k3: Variant in sea._mates:
		if is_instance_valid(sea._mates[k3]):
			(sea._mates[k3] as Node2D).modulate = Color.WHITE
			(sea._mates[k3] as Node2D).rotation = 0.0
	for k2: Variant in sea._mates:
		if is_instance_valid(sea._mates[k2]):
			(sea._mates[k2] as Shipmate).face_lock = 0.0
			(sea._mates[k2] as Shipmate)._plate.visible = true
	# The enemy hulls fade off the water; the fight's effects fade out (smoke
	# still rising is not cut off) before they go.
	for n0: Variant in _foe_nodes:
		if n0 != null and is_instance_valid(n0):
			var hn: Node2D = n0
			var ht: Tween = hn.create_tween()
			Motion.ease_exit(ht, hn, "modulate:a", 0.0, 0.4)
			ht.tween_callback(hn.queue_free)
	if mark != null:
		mark.visible = true
	if _fx != null and is_instance_valid(_fx):
		var fx0: BattleFx = _fx
		_fx = null
		var ft: Tween = fx0.create_tween()
		Motion.ease_fade(ft, fx0, "modulate:a", 0.0, 0.5)
		ft.tween_callback(fx0.queue_free)
	sea.stage = null
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
	# The bars leave as they came, mirrored (CUBIC in), the deck dimming with
	# them; then the sea's HUD fades back in.
	var tw: Tween = create_tween()
	Motion.ease_exit(tw, self, "_bars", 0.0, Motion.BARS_OUT)
	BattleStageDeck._deck_dim(self, true)
	await tw.finished
	var hud: Control = sea._hud
	hud.modulate.a = 0.0
	hud.visible = true
	var hw: Tween = hud.create_tween()
	Motion.ease_fade(hw, hud, "modulate:a", 1.0, 0.35)
	finished.emit(won and not fled)
	queue_free()


# ── Drawing (game/battle_stage_hud.gd): its state ────────────────────────────

## Each plate's balls as last drawn, and when each slot was last loaded.
var _rack_seen: Dictionary = {}
var _rack_pop: Dictionary = {}


# ── The boss's words, getting away, the auras ────────────────────────────────

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


# ── Together (game/battle_stage_sync.gd): its state ──────────────────────────

## GO ON WITHOUT THEM: a crew choice that has waited a minute on someone
## (you have answered, they have not) can be moved on by you; they take the
## default (the tables, _nudge).
var _nudge_btn: Button = null
var _wait_tag: String = ""
var _wait_ms: int = 0


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
	_faces[i] = Avatar.texture_of(face, self)
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
	return float(Js.obj(sea.stage).get("zoom", 1.0)) * sea.fight_zoom if sea != null and sea.stage is Dictionary else 1.0


## How far above a hull's keel its plate sits: a fixed lift over the masthead
## (the caller's height at zoom one), not scaled with the zoom.
func _plate_lift(at_one: float) -> float:
	return -at_one


## A slim hull tag's height over the keel (frames mode), following the zoom.
func _tag_lift() -> float:
	return -clampf(200.0 * _z(), 110.0, 240.0)


## Frames rather than plates on the water: a field of enemies, or more than
## two ships in the line (they would crowd the water and each other).
func _frames_mode() -> bool:
	return not b.is_empty() and (Battle.foes(b).size() > 1 or (b["seats"] as Array).size() > 2)


## A hold on contact (game/battle_stage_playback.gd) never outlives the fight.
func _exit_tree() -> void:
	Engine.time_scale = 1.0


## A captain's seat in the line, by their key (-1 if none).
func _seat_index(key: String) -> int:
	for i: int in (b["seats"] as Array).size():
		if b["seats"][i].get("key") == key:
			return i
	return -1


# ── The parts' pieces reached from outside (tests, films, signals) ────────────
# Each forwards to its part with the same signature.

func _unhandled_input(e: InputEvent) -> void:
	BattleStageDeck._unhandled_input(self, e)


func _draw() -> void:
	BattleStageHud._draw(self)


## The table's "changed" signal is connected to this (and disconnected by it).
func _pump(st: Dictionary) -> void:
	BattleStageSync._pump(self, st)


func _clear_deck() -> void:
	BattleStageDeck._clear_deck(self)


func _await_plan() -> void:
	await BattleStageDeck._await_plan(self)


func _paint_actions() -> void:
	BattleStageDeck._paint_actions(self)


func _toggle_order(c: Dictionary) -> void:
	BattleStageDeck._toggle_order(self, c)


func _choose(act: String) -> void:
	await BattleStageDeck._choose(self, act)


func _flee() -> void:
	await BattleStageDeck._flee(self)


func _one(x: Dictionary) -> void:
	await BattleStagePlayback._one(self, x)


func _summon(x: Dictionary) -> void:
	await BattleStagePlayback._summon(self, x)


func _flares() -> void:
	await BattleStagePlayback._flares(self)


func _tide(tide: Dictionary, eyebrow: String) -> void:
	await BattleStagePlayback._tide(self, tide, eyebrow)


func _defeat_sequence(ds: Dictionary) -> void:
	await BattleStagePlayback._defeat_sequence(self, ds)


func _stamp(tier: String, first: bool, line: String = "") -> void:
	BattleStageHud._stamp(self, tier, first, line)


func _water_theme(dn: Dictionary) -> Dictionary:
	return BattleStageDive._water_theme(self, dn)
