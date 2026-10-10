extends RefCounted
## Part of FishingHud: THE FISHING LOOP. The cast, the wait and its nibbles,
## the bite and the dial, the Ancient Deep's fight, the Tide Turner's skip,
## the strike and the reel fight, the catch shown (the note, the flight to the
## hold, the wormhole's card, a stowed crate), the giants' ceremony, and what
## follows a catch (levels crossed, a golden to answer). It holds the loop's
## state; the HUD it plays on (`h`) holds the chrome it speaks through (the
## dial, the readouts, the action button, the toasts). Split out of
## game/fishing_hud.gd on 2026-10-10 for size; the HUD forwards what other
## files read of it (phase, _shot, _boss, cast(), ...).

const HOLD_S: float = 0.62
## A perfect holds longer than a catch so the leap lands before the card.
const HOLD_PERFECT_S: float = 1.15

## The HUD this loop plays on.
var h: FishingHud
var phase: String = "idle"

var _shot: Dictionary = {}
var _wait_left: float = 0.0
var _since_cast: float = 0.0
var _cast_zone: String = ""
var _mods: Dictionary = {}
var _gen: int = 0
## The Ancient Deep's fight in progress (BossFight), or {} for an ordinary
## fish: its name, mechanic, config, stage, the window's shrink and the
## needle's multiplier, and whether it is one of the six giants.
var _boss: Dictionary = {}
var _boss_sweep: float = 0.0
## The Auto Caster's countdown to the next cast (-1: none due), and how long
## the Auto Catcher has watched this bite.
var _auto_t: float = -1.0
var _catch_t: float = 0.0
var _card: Control
var _fly_pending: bool = false
## The waiting words have faded in for this cast.
var _wait_shown: bool = false
var _dial_tw: Tween
var _wait_tw: Tween
var _level_seen: int = 0
## An action is out with the rules (in a Charter, with the founder's game).
var _asking: bool = false


func _init(hud: FishingHud) -> void:
	h = hud


func _set_phase(p: String) -> void:
	phase = p
	h.fishing_changed.emit(p != "idle" and p != "result")
	h._update_action()


# ── The loop ───────────────────────────────────────────────────────────────────

func cast() -> void:
	_nibbles = 0
	_wait_shown = false
	if h._modal != null or _asking or (phase != "idle" and phase != "result") or h._action.disabled:
		return
	_close_card()
	_cast_zone = h.water["id"]
	_asking = true
	# Where the line goes in, so a hotspot here counts (re-derived by the rules).
	var res: Dictionary = await h.session.act("castLine", [h._bait, _cast_zone, { "x": h.boat.position.x, "y": h.boat.position.y }])
	_asking = false
	h.session.persist()
	if res.has("error"):
		h.toast(res["error"])
		h.refresh()
		return
	_gen += 1
	var gen: int = _gen
	_shot = res
	_mods = _tackle()
	_wait_left = maxf(float(res["waitMs"]), 760.0) / 1000.0 + 0.05
	if res.get("instantBite") == true:
		_wait_left = 0.82
		# Good news, said at the hook, in the cast's teal.
		Fx.pill(h, "Instant Bite", _hook_screen() + Vector2(0, -60.0), Kit.INK, Kit.a(Kit.CAST, 0.22), Kit.a(Kit.CAST, 0.6), 1.1)
	_since_cast = 0.0
	_set_phase("waiting")
	Rumble.tap(12)
	Sound.cast()
	h.boat.set_pose("cast")
	# ONE CLOCK for the line landing: the plop and the wait pose together,
	# when the rope's flight ends (Motion.CAST_LAND_S).
	h.get_tree().create_timer(Motion.CAST_LAND_S).timeout.connect(func() -> void:
		if gen == _gen and phase != "idle":
			Sound.line_in()
		if gen == _gen and phase == "waiting":
			h.boat.set_pose("wait"))
	h.refresh()


## What the captain's tackle does to the dial.
func _tackle() -> Dictionary:
	var p: Dictionary = h.session.profile()
	var rod: Dictionary = Rules.effective_rod(Js.num(p.get("rod_tier")), p.get("completionist_effects"))
	var lines: Array = Rules.data()["lines"]
	var line: Dictionary = lines[clampi(int(Js.num(p.get("line_tier"))), 0, lines.size() - 1)]
	var reels: Array = Rules.data()["reels"]
	var reel: Dictionary = reels[clampi(int(Js.num(p.get("reel_tier"))), 0, reels.size() - 1)]
	return {
		"hook": Js.num(p.get("hook_tier")), "line": float(line["penaltyMultiplier"]), "reel": float(reel["needleSpeedMultiplier"]),
		"rodCatch": Js.num(rod.get("catchZoneBonus")), "rodPerfect": Js.num(rod.get("perfectZoneBonus")),
		"retry": Js.num(rod.get("retryOnMissChance")), "snagImmune": rod.get("snagImmune") == true,
		"baitCatch": Js.num(Rules.bait(h._bait).get("catchZoneBonus")), "level": h.session.level(),
	}


## The Tide Turner: how many skips are left this sea day, or -1 without one seated.
func _skips_left() -> int:
	var p: Dictionary = h.session.profile()
	if not Js.truthy(p.get("has_tide_turner")) or p.get("equipped_special") != "tide_turner":
		return -1
	var used: float = Js.num(p.get("tide_turner_used")) if p.get("tide_turner_date") == Fishing.tide_day() else 0.0
	return int(3.0 - used)


## The zones for this bite: the web's buildFishZones, then, in a fight, the
## mechanic's mods (a breathing shrink narrows the green by its breath too)
## and a giant's palette.
func _zones(breath: float = 0.0) -> Array:
	var diff: float = float(_shot["catchDifficulty"])
	var zd: Dictionary = (Rules.data()["dial"]["zoneDifficulty"] as Dictionary).get(_cast_zone, {})
	var zones: Array = Dial.build_zones(diff, _mods["hook"], _mods["line"], float(zd.get("catchMultiplier", 1.0)),
		Rules.level_catch_bonus(float(_mods["level"])) + float(_mods["baitCatch"]) + float(_mods["rodCatch"]) - breath, float(_mods["rodPerfect"]) + 1.0)
	if _boss.is_empty():
		return zones
	var shrink: float = breath if _boss["mechanic"] == "shrink" else float(_boss["shrink"])
	zones = BossFight.apply_mods(zones, _boss["mechanic"], shrink)
	if _boss["giant"]:
		zones = BossFight.palette(zones, _shot.get("vigilRank"))
	return zones


func _start_fight() -> void:
	_boss = {}
	if _cast_zone != "ancient_deep" or float(_shot["fishId"]) == FishingRules.CRATE_FISH_ID:
		return
	var fish: Dictionary = h.session.store.species(float(_shot["fishId"]))
	var base: Dictionary = BossFight.base_config(fish["name"])
	var mechanic: String = BossFight.WILDCARD[randi() % BossFight.WILDCARD.size()] if base.get("wildcard", false) else base["mechanic"]
	var cfg: Dictionary = BossFight.config(fish["name"], mechanic, _shot.get("vigilRank"))
	_boss = {
		"name": fish["name"], "mechanic": mechanic, "cfg": cfg, "stage": 1,
		"shrink": float(cfg.get("perfectShrinkStart", 0.0)), "mult": 1.0,
		"giant": Js.num(fish.get("sell_value")) == 0.0,
	}


func _fight_hud() -> void:
	var n: int = int(_boss["cfg"]["phases"])
	var rank: Variant = _shot.get("vigilRank")
	var pips: String = ""
	for i: int in n:
		pips += "● " if i < int(_boss["stage"]) else "○ "
	h._status.text = ("Rank %s  ·  " % ["", "I", "II", "III", "IV", "V"][int(rank)] if rank != null else "") + "Stage %d/%d" % [int(_boss["stage"]), n]
	h._dots.text = pips.strip_edges()
	h._timer.text = ""
	_readouts(true)
	for l: Label in [h._status, h._dots]:
		l.modulate.a = 1.0


func _bite() -> void:
	_focus_on(true)
	var diff: float = float(_shot["catchDifficulty"])
	_start_fight()
	var zones: Array = _zones()
	var speeds: Array = Rules.data()["dial"]["fishDifficultySpeed"]
	var sp: Dictionary = speeds[clampi(int(diff) - 1, 0, 4)]
	var sweep: float = (float(sp["speedMin"]) + randf() * (float(sp["speedMax"]) - float(sp["speedMin"]))) * float(_mods["reel"])
	h._dial.streak = h._streak()
	h._dial.mechanic = "" if _boss.is_empty() else String(_boss["mechanic"])
	h._dial.rebuild = _zones if not _boss.is_empty() and _boss["mechanic"] == "shrink" else Callable()
	h._dial.blackout_chance = 0.0 if _boss.is_empty() or _boss["cfg"].get("noBlackout", false) else 0.12 * diff / 5.0
	h._dial.ancient_aura = not _boss.is_empty() and _boss["giant"]
	h._dial.stage = 1
	_boss_sweep = sweep
	h._dial.begin(zones, sweep)
	# In its place before its first frame (it showed in the corner for one),
	# then in on the instrument's arrival (its pivot is its centre).
	if _dial_tw != null and _dial_tw.is_valid():
		_dial_tw.kill()
	_place_dial()
	h._dial.visible = true
	h._dial.scale = Vector2.ONE
	h._dial.mouse_filter = Control.MOUSE_FILTER_STOP
	Motion.arrive(h._dial, "m")
	if _boss.is_empty():
		# The waiting words go as the dial comes.
		_fade_wait_out()
	else:
		if _wait_tw != null and _wait_tw.is_valid():
			_wait_tw.kill()
		h._timer.text = ""
		# One message, in the toast lane over the dial: the encounter, then
		# the warning under it.
		h.toast("Ancient Encounter  ·  %d stages required" % int(_boss["cfg"]["phases"]), "name")
		h.toast("Miss once and it escapes. Stay sharp.", "danger")
		_fight_hud()
	var skips: int = _skips_left()
	h._tide.visible = skips > 0
	h._tide.text = ("Tide Turner · Skip · %d left" % skips).to_upper()
	Rumble.buzz(Rumble.BITE)
	Sound.dial_start(diff)
	_set_phase("hooked")


## A phase held: say so for 1.1s, then the next, harder (a closing window and a
## faster needle on a curve, a quicker needle on the ramps, a new mechanic for
## a wildcard), on a new place on the ring.
func _next_phase(result: String) -> void:
	var cfg: Dictionary = _boss["cfg"]
	if result == "perfect":
		Sound.perfect()
		Rumble.buzz(Rumble.PERFECT)
	else:
		Sound.line_in()
		Rumble.tap(6)
	_set_phase("reeling")
	var n: int = int(cfg["phases"])
	h._status.text = "Stage %d/%d" % [int(_boss["stage"]), n]
	await h.get_tree().create_timer(1.1).timeout
	_boss["stage"] = int(_boss["stage"]) + 1
	if cfg.has("perfectShrinkStep"):
		_boss["shrink"] = float(_boss["shrink"]) + float(cfg["perfectShrinkStep"])
		if cfg.has("speedStepMult"):
			_boss["mult"] = minf(float(_boss["mult"]) * float(cfg["speedStepMult"]), 4.0)
	elif _boss["mechanic"] == "accelerate" or _boss["mechanic"] == "surge":
		_boss["mult"] = minf(float(_boss["mult"]) * 1.4, 4.0)
	if cfg.get("wildcard", false):
		var nxt: String = BossFight.WILDCARD[randi() % BossFight.WILDCARD.size()]
		_boss["mechanic"] = nxt
		_boss["shrink"] = 0.0
		_boss["mult"] = 1.5 if (nxt == "accelerate" or nxt == "surge") else 1.0
		h._dial.mechanic = nxt
		h._dial.rebuild = _zones if nxt == "shrink" else Callable()
	h._dial.stage = int(_boss["stage"])
	h._dial.next_phase(_zones(), _boss_sweep * float(_boss["mult"]))
	_fight_hud()
	_set_phase("hooked")


func _skip() -> void:
	if phase != "hooked":
		return
	if _asking:
		return
	_asking = true
	var r: Dictionary = await h.session.act("tideTurnerSkip")
	_asking = false
	if phase != "hooked":
		return
	h.session.persist()
	if r.has("error"):
		h.toast(r["error"])
		return
	h._dial.spinning = false
	h._dial.visible = false
	h._tide.visible = false
	Sound.dial_stop()
	h.boat.set_pose("rest")
	Rumble.tap(10)
	h.toast("Thrown back. The streak holds. %d skip%s left this sea day." % [int(r["skipsLeft"]), "" if int(r["skipsLeft"]) == 1 else "s"])
	_set_phase("idle")
	h.refresh()


func _on_struck(raw: String, _angle: float) -> void:
	var result: String = "miss" if raw == "penalty" and _mods["snagImmune"] else raw
	var landed: bool = result == "perfect" or result == "catch"
	if not landed and float(_mods["retry"]) > 0.0 and randf() < float(_mods["retry"]):
		Rumble.buzz(Rumble.SECOND_WIND)
		Fx.pill(h, "Second Wind", h._dial.position + Vector2(h._dial.size.x / 2.0, -24.0), Kit.INK, Kit.a(Kit.TEAL, 0.22), Kit.a(Kit.TEAL, 0.6), 1.2)
		h._dial.respin()
		return
	if not _boss.is_empty() and landed and int(_boss["stage"]) < int(_boss["cfg"]["phases"]):
		await _next_phase(result)
		return
	if not _boss.is_empty():
		h._status.text = ""
		h._dots.text = ""
		_readouts(false)
	_boss = {}
	h._dial.mechanic = ""
	h._dial.ancient_aura = false
	Sound.dial_stop()
	h._tide.visible = false
	if result == "perfect":
		Sound.perfect()
		# The streak, heard: a step higher for each perfect in a row.
		Sound.streak(h._streak() + 1)
		Rumble.buzz(Rumble.PERFECT)
		var pf: Fx.PerfectFlash = Fx.PerfectFlash.new()
		pf.at = h._dial.position + h._dial.size / 2.0
		h.add_child(pf)
	else:
		# (The plop is the cast's; the catch is heard in the reel and the
		# splash of the fight.)
		Rumble.tap(6)
	# THE FIGHT: the fish played in on the water through the hold, in place
	# of a still pause (game/reel_fight.gd). A miss and a snag speak too.
	var hold: float = HOLD_PERFECT_S if result == "perfect" else HOLD_S
	var fight: ReelFight = ReelFight.new()
	fight.boat = h.boat
	fight.result = result
	fight.length_s = hold
	var crate_shot: bool = float(_shot["fishId"]) == FishingRules.CRATE_FISH_ID
	fight.crate = crate_shot
	if crate_shot:
		fight.fish_art = CrateMoment._tex("%sclosed.png" % CrateMoment.TIERS.get(_shot.get("crateTier", "wooden"), CrateMoment.TIERS["wooden"])[2])
	else:
		var sp: Variant = h.session.store.species(float(_shot["fishId"]))
		if sp != null:
			fight.fish_art = Skipper.tex("fish/%s" % ResultCard.fish_art_path((sp as Dictionary)["name"]).get_file())
	h.boat.get_parent().add_child(fight)
	# The dial has had its moment (the strike, the perfect's burst): it fades
	# so the fight plays in the open, and the focus lifts with it.
	# It leaves as it came, mirrored (a fade and a slight shrink, CUBIC in);
	# on a perfect it holds until the burst ring on it has finished.
	if _dial_tw != null and _dial_tw.is_valid():
		_dial_tw.kill()
	h._dial.pivot_offset = h._dial.size / 2.0
	_dial_tw = h._dial.create_tween()
	_dial_tw.tween_interval(0.45 if result == "perfect" else 0.22)
	_dial_tw.tween_callback(func() -> void: h._dial.mouse_filter = Control.MOUSE_FILTER_IGNORE)
	Motion.ease_exit(_dial_tw, h._dial, "modulate:a", 0.0, Motion.LEAVE)
	_dial_tw.parallel().tween_property(h._dial, "scale", Vector2.ONE * Motion.LEAVE_SCALE, Motion.LEAVE).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	_dial_tw.tween_callback(func() -> void:
		h._dial.visible = false
		h._dial.modulate.a = 1.0
		h._dial.scale = Vector2.ONE
		h._dial.mouse_filter = Control.MOUSE_FILTER_STOP)
	_set_phase("reeling")
	await h.get_tree().create_timer(hold).timeout
	# The fight is over: the line comes in.
	h.boat.set_pose("rest")
	var before_level: int = h.session.level()
	var crate: bool = float(_shot["fishId"]) == FishingRules.CRATE_FISH_ID
	var r: Dictionary = {}
	# The hold reads what it held until the fish lands in it.
	_fly_pending = false
	if not crate:
		h._hold_shown = int(h.session.store.hold_count(h.session.uid))
	if crate and landed:
		r = await h.session.act("stowCrate", [result])
	elif not crate:
		r = await h.session.act("reelIn", [float(_shot["fishId"]), result, h._bait])
	h.session.persist()
	h._dial.visible = false
	_set_phase("result")
	# NO CARD (Kong, 2026-10-01): the catch is a small note that floats up
	# over her and fades while the fish flies to the hold; she can cast again
	# at once. Only a wormhole (a choice to make) still brings the card.
	if r.has("error"):
		h.toast(str(r["error"]))
	elif crate and landed:
		_stow_card(r)
	elif r.get("caught") == true:
		_fish_card(r, result == "perfect")
	else:
		# Said where it happened: over her, where a catch's note would rise.
		var at: Vector2 = _boat_screen() + Vector2(0, -150.0)
		if result == "penalty":
			Fx.rise(h, "Snagged, bait lost", at, Kit.DANGER_INK, 16, 30.0, 1.6)
		else:
			Fx.rise(h, "Got away", at, Kit.DIM, 16, 30.0, 1.6)
	if not _fly_pending:
		h._hold_shown = -1
	h.refresh()
	_auto_t = (3.3 if crate else 1.7) if (h._auto_on and h._auto_tier() > 0) else -1.0
	var giant: bool = r.get("caught") == true and (r["fish"] as Dictionary)["habitat"] == "ancient_deep" and Js.num((r["fish"] as Dictionary).get("sell_value")) == 0.0
	if giant:
		await _ceremony(r)
	if h.session.level() > before_level or r.get("isShiny") == true:
		# One thing at a time: the bar crosses (the XP poured, the line run
		# to full and flashed) before the level card comes.
		_after_catch(true, r.get("isShiny") == true, true)


# ── The card, and what follows it ──────────────────────────────────────────────

func _mount_card(c: Control) -> void:
	_close_card()
	_card = c
	FishingHud._place(c, Vector2(0.5, 0.5), Vector2(110, -250), Vector2(440, 0))
	h.add_child(c)


func _close_card() -> void:
	if _card != null:
		_card.queue_free()
		_card = null


func _wire(card: ResultCard) -> void:
	card.cast_again.connect(func() -> void: cast())
	card.closed.connect(func() -> void:
		_close_card()
		_set_phase("idle"))
	card.wormhole.connect(func() -> void:
		var w: Dictionary = await h.session.act("rerollWormhole")
		h.session.persist()
		card.set_note(w["error"] if w.has("error") else "Rerolled into %s" % (w["fish"] as Dictionary)["name"])
		h.refresh())


func _fish_card(r: Dictionary, perfect: bool) -> void:
	# The web never passed the count, so its card read "Ancient 0 of 6"; it is
	# the wall as it stands.
	r["ancientCount"] = float(Js.list(h.session.profile().get("ancient_catches")).size())
	if r.get("wormhole") == true:
		var card: ResultCard = ResultCard.new()
		_mount_card(card)
		card.show_fish(r, perfect, _shot)
		_wire(card)
	else:
		_catch_note(r, perfect)
	# The catch a treasure hunt asked for.
	for st: Variant in Js.list(r.get("clueSteps")):
		var sd: Dictionary = st
		if sd.get("ok", false) and sd.has("next"):
			h.notify("%s  ·  STEP %d OF %d" % [str(Clues.TIER_NAME[sd["tier"]]).to_upper(), int(sd["stepNo"]), int(sd["of"])], "That is the fish", str(sd["next"]["text"]), Skipper.tex("sea/sea-bottle.png"))
	# An order this catch finished.
	for lbl: Variant in Js.list(r.get("ordersDone")):
		h.toast("Order done: %s. Claim it under Orders." % str(lbl), "good")
	# The Log has something new to show.
	if r.get("isNewSpecies") == true or r.get("isPB") == true or str(r.get("sizeTier", "")) == "trophy" or r.get("isShiny") == true:
		h._log_dot = true
		h._paint_log_dot()
	# The XP rises off the boat; the fish flies to the hold.
	var mid: Vector2 = Vector2(h.size.x / 2.0, h.size.y * 0.5 - 70.0)
	# What made it: the streak's multiplier, shown when it is working.
	var sm: float = Rules.streak_mult(float(h._streak()), float(h.session.level()))
	var why: String = ("  ×%.2f streak" % sm) if sm > 1.001 else ""
	# (The perfect is announced once, by its flash over the dial; the gold
	# here says it again quietly.)
	Fx.rise(h, "+%s XP%s" % [FishingHud._thousands(float(r["xpGained"])), why], mid, FishingHud.GOLD if perfect else Kit.UP, 20)
	# The XP flies from where the fish came up into the bar.
	var rar: float = float(Js.nz((r["fish"] as Dictionary).get("bite_rarity"), 1.0))
	var src: Vector2 = h.boat.get_parent().get_global_transform_with_canvas() * h.boat.hook_at()
	h._xp.gain(float(r["xpGained"]), src, 0.6 + rar * 0.35 + (0.8 if perfect else 0.0) + minf(1.0, float(h._streak()) * 0.1))
	if float(r.get("catchQty", 0.0)) > 0.0 and r.get("isShiny") != true:
		_fly_pending = _fly_to_hold(r["fish"], float(r["catchQty"]))


## A crate reeled up: it breaks the surface beside her and is hauled aboard
## into the stash, to be opened from the Locker when she likes.
func _stow_card(r: Dictionary) -> void:
	var tier: String = str(r.get("stowed", "wooden"))
	var t: Array = CrateMoment.TIERS.get(tier, CrateMoment.TIERS["wooden"])
	var cs: CrateSurface = CrateSurface.new()
	cs.tier = tier
	cs.mode = "stow"
	cs.boat = h.boat
	h.boat.get_parent().add_child(cs)
	var total: int = 0
	for k: Variant in Js.obj(r.get("stash")):
		total += int(Js.num(Js.obj(r.get("stash"))[k]))
	h.toast("%s stowed  ·  %d in your stash (Locker, Crates)" % [t[0], total])


## THE CATCH, IN A NOTE: a small slip of paper rising over her with the
## fish, its name, its size, and any news (a new species, a personal best, a
## trophy, a golden); it holds a moment and fades. It takes no press.
func _catch_note(r: Dictionary, perfect: bool) -> void:
	var fish: Dictionary = r["fish"]
	var rar: int = clampi(int(Js.num(fish.get("bite_rarity"))), 1, 5)
	var news: Array = []
	if r.get("isShiny") == true:
		news.append(["Golden", Paper.MONEY])
	if r.get("isNewSpecies") == true:
		news.append(["New species", Kit.ink(Kit.SKY)])
	if r.get("isPB") == true and r.get("previousBest") != null:
		news.append(["Personal best", Kit.ink(Kit.TEAL)])
	if str(r.get("sizeTier", "")) == "trophy":
		news.append(["Trophy", Paper.RED])
	var note: Pane = Kit.pane(h, { "radius": 12, "fill": [Kit.PAPER], "border": [1, Color(Paper.rarity(rar), 0.7)], "shadow": [Color(0, 0, 0, 0.35), 12, Vector2(0, 4)], "pad": [10, 6, 14, 6], "paper": true })
	note.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Unseen until it is measured and placed (it flashed in the corner for a
	# frame before).
	note.modulate.a = 0.0
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	note.add_child(row)
	var art: TextureRect = TextureRect.new()
	art.texture = Skipper.fish_thumb(fish["name"])
	art.custom_minimum_size = Vector2(54, 40)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if r.get("isShiny") == true:
		var gm: ShaderMaterial = ShaderMaterial.new()
		gm.shader = load("res://game/golden.gdshader")
		art.material = gm
	row.add_child(art)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(col)
	var name_l: Label = Kit.text(col, fish["name"], "name", Kit.PAPER_INK)
	name_l.add_theme_font_size_override("font_size", 16)
	var bits: Array = [Almanac.RARITY_NAMES[rar - 1]]
	if float(r.get("sizeIn", 0.0)) > 0.0:
		bits.append(FishingHud.length_text(float(r["sizeIn"])))
	if float(r.get("catchQty", 1.0)) > 1.0:
		bits.append("×%d" % int(r["catchQty"]))
	if perfect:
		bits.append("Perfect")
	Kit.text(col, "  ·  ".join(PackedStringArray(bits)), "note", Paper.rarity(rar).darkened(0.25))
	for n: Array in news:
		Kit.text(col, "★ " + str(n[0]), "small", n[1])
	await h.get_tree().process_frame
	# SMOOTH, AND WITH HER (Kong, 2026-10-02: it stuttered): it rides over
	# the boat every frame as she sails, rising quickly into place and then
	# holding still, never a slow crawl (a control creeping a pixel every few
	# frames is what stuttered: they snap to whole pixels).
	note.pivot_offset = note.size / 2.0
	note.scale = Vector2.ONE * float(Motion.ARRIVE_S[1])
	note.modulate.a = 0.0
	var hold: float = 2.0 + 0.8 * news.size()
	var rise: Array = [0.0]
	var place: Callable = func() -> void:
		if not is_instance_valid(note) or not is_instance_valid(h.boat):
			return
		var at: Vector2 = h.boat.get_parent().get_global_transform_with_canvas() * h.boat.position
		note.position = (at + Vector2(-note.size.x / 2.0, -150.0 - note.size.y - rise[0])).round()
	place.call()
	h.get_tree().process_frame.connect(place)
	note.tree_exiting.connect(func() -> void: h.get_tree().process_frame.disconnect(place))
	var tw: Tween = note.create_tween()
	tw.set_parallel()
	Motion.ease_fade(tw, note, "modulate:a", 1.0, Motion.NOTE_IN)
	Motion.ease_pop(tw, note, "scale", Vector2.ONE, float(Motion.ARRIVE_S[2]))
	tw.tween_method(func(v: float) -> void: rise[0] = v, -14.0, 0.0, 0.4).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.chain().tween_interval(hold)
	tw.chain().set_parallel()
	Motion.ease_fade(tw, note, "modulate:a", 0.0, Motion.NOTE_OUT)
	tw.tween_method(func(v: float) -> void: rise[0] = v, 0.0, 22.0, Motion.NOTE_OUT).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(note.queue_free)


## HoldFlight: the fish, as a dark shape, thrown from where it came up to
## the hold; the count there changes only when it lands. False when there is
## no art to throw (the count then changes at once).
func _fly_to_hold(fish: Dictionary, qty: float) -> bool:
	var path: String = ResultCard.fish_art_path(fish["name"])
	if not ResourceLoader.exists(path):
		return false
	var t: TextureRect = TextureRect.new()
	t.texture = load(path)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.modulate = Color(0.05, 0.1, 0.14, 0.0)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(t)
	t.custom_minimum_size = Vector2(64, 40)
	t.size = Vector2(64, 40)
	t.pivot_offset = Vector2(32, 20)
	var from: Vector2 = _hook_screen() - t.size / 2.0
	var to: Vector2 = h._hold.get_global_rect().get_center() - h.global_position - t.size / 2.0
	t.position = from
	if qty > 1.0:
		var c: Label = _label(t, "×%d" % int(qty), 14, FishingHud.GOLD, true)
		c.position = Vector2(40, -8)
	var fly: Callable = func(u: float) -> void:
		var x: float = lerpf(from.x, to.x, u * u * (3.0 - 2.0 * u))
		var peak: float = minf(from.y, to.y) - 54.0
		var y: float = lerpf(from.y, peak, u / 0.42) if u < 0.42 else lerpf(peak, to.y, (u - 0.42) / 0.58)
		t.position = Vector2(x, y)
		t.scale = Vector2.ONE * lerpf(1.0, 0.34, u)
		t.modulate.a = clampf(u / 0.22, 0.0, 1.0)
	var tw: Tween = h.create_tween()
	tw.tween_method(fly, 0.0, 1.0, 0.62)
	tw.tween_callback(func() -> void:
		t.queue_free()
		Rumble.tap(8)
		# It has landed: now the count changes, with a thump.
		h._hold_shown = -1
		h._paint_hold()
		h._hold.pivot_offset = h._hold.size / 2.0
		var knock: Tween = h.create_tween()
		knock.tween_property(h._hold, "scale", Vector2(1.14, 1.14), 0.08).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		Motion.ease_pop(knock, h._hold, "scale", Vector2.ONE, 0.22))
	return true


## Where the hook is on the screen now (this HUD's coordinates).
func _hook_screen() -> Vector2:
	if h.boat == null or not is_instance_valid(h.boat) or h.boat.get_parent() == null:
		return Vector2(h.size.x / 2.0, h.size.y * 0.42)
	return (h.boat.get_parent() as CanvasItem).get_global_transform_with_canvas() * h.boat.hook_at() - h.global_position


## Where the boat is on the screen now (this HUD's coordinates).
func _boat_screen() -> Vector2:
	if h.boat == null or not is_instance_valid(h.boat) or h.boat.get_parent() == null:
		return Vector2(h.size.x / 2.0, h.size.y / 2.0)
	return (h.boat.get_parent() as CanvasItem).get_global_transform_with_canvas() * h.boat.position - h.global_position


## Wait (at most a moment) for the level bar's crossing to play out: the XP
## pours, the line runs to full and flashes. Then the level card may come.
func _await_crossing() -> void:
	if h._xp == null or not h._xp.crossing():
		return
	var done: Array = [false]
	var on_done: Callable = func() -> void: done[0] = true
	h._xp.crossing_done.connect(on_done, CONNECT_ONE_SHOT)
	var waited: float = 0.0
	while not done[0] and waited < 1.2 and h.is_inside_tree():
		await h.get_tree().process_frame
		waited += h.get_process_delta_time()
	if h._xp.crossing_done.is_connected(on_done):
		h._xp.crossing_done.disconnect(on_done)


## A giant landed: the first time, the slain cinematic and then Finn's words;
## a rank climbed, the rank-up; all six mastered, the capstone.
func _ceremony(r: Dictionary) -> void:
	var fish: Dictionary = r["fish"]
	var scenes: Array = []
	if r.get("isNewSpecies") == true:
		var count: int = Js.list(h.session.profile().get("ancient_catches")).size()
		scenes.append(["slain", { "id": fish["id"], "name": fish["name"], "count": count, "total": 6 }])
		var beat: Variant = (Rules.data()["finnAncientBeats"] as Dictionary).get(Js.key(fish["id"]))
		if beat != null:
			scenes.append(["finn", { "beat": beat }])
	if r.get("vigilRankUp") != null:
		scenes.append(["rank_up", { "name": fish["name"], "from": (r["vigilRankUp"] as Dictionary)["from"], "to": (r["vigilRankUp"] as Dictionary)["to"] }])
	if r.get("vigilPetGranted") == true:
		scenes.append(["capstone", { "species": func(id: float) -> Variant: return h.session.store.species(id) }])
	for sc: Array in scenes:
		if sc[0] == "rank_up" or sc[0] == "capstone":
			await h.get_tree().create_timer(1.5).timeout
		var a: AncientScenes = AncientScenes.new()
		a.kind = sc[0]
		a.data = sc[1]
		h._modal = a
		h.add_child(a)
		await a.done
		h._modal = null
	h.refresh()
	if r.get("vigilPetGranted") == true:
		h.boat.set_look(Skipper.look_of(h.session.profile()))


## After a catch (and on opening the sea): celebrate levels crossed, then ask
## about any golden still waiting. One at a time. shiny: this catch was the
## golden, so its note holds a beat before the choice comes. wait_bar: the
## level card waits for the level bar's crossing to play out first. While a
## card waits its turn it is already the modal (the boat holds, no cast),
## and it is put on the screen when its moment comes.
func _after_catch(from_catch: bool, shiny: bool = false, wait_bar: bool = false) -> void:
	if h.session.level() > _level_seen or not from_catch:
		# In a Charter act() can come back as { error } (no peer, or the line
		# timed out): that is told, never read as a claim or a golden.
		var got: Variant = await h.session.act("claimFishingLevelRewards")
		var claim: Dictionary = got if got is Dictionary else { "error": "The level rewards did not come through." }
		# Fishing levels raise the ship's upgrades for free (port rules).
		var floors: Variant = await h.session.act("levelFloors")
		if floors is Array and not (floors as Array).is_empty():
			for f: Array in floors:
				h.toast("Fishing %d: %s upgraded for free" % [int(f[2]), { "hull_speed_tier": "Hull", "hull_handling_tier": "Rudder", "hull_accel_tier": "Rig" }.get(f[0], f[0])], "good")
		h.session.persist()
		_level_seen = h.session.level()
		if claim.has("error"):
			h.toast(str(claim["error"]), "danger")
		elif Js.num(claim.get("to")) > Js.num(claim.get("from")):
			var lu: LevelUp = LevelUp.new()
			lu.claim = claim
			h._modal = lu
			# The cast lettering steps aside while the level is shown.
			h._action.visible = false
			if wait_bar:
				await _await_crossing()
			h.add_child(lu)
			await lu.closed
			h._modal = null
			h.refresh()
	var held: Variant = await h.session.act("heldGolden")
	if held is Dictionary and (held as Dictionary).has("error"):
		h.toast(str((held as Dictionary)["error"]), "danger")
		return
	var first: bool = true
	while held is Dictionary and not (held as Dictionary).has("error"):
		var g: GoldenChoice = GoldenChoice.new()
		g.session = h.session
		g.golden = held
		h._modal = g
		var said: Array = [false]
		g.answered.connect(func() -> void: said[0] = true)
		var beat: bool = first and shiny and from_catch
		if beat:
			# The golden's own beat: its note is read first, then the choice
			# arrives with the chest and the golden rumble.
			await h.get_tree().create_timer(Motion.GOLDEN_HOLD).timeout
		first = false
		if said[0]:
			# Answered before it was shown (a script did it): it never shows.
			if is_instance_valid(g) and not g.is_queued_for_deletion():
				g.queue_free()
		else:
			if beat:
				Sound.chest(true)
				Rumble.buzz(Rumble.GOLDEN)
			h.add_child(g)
			while not said[0] and is_instance_valid(g):
				await h.get_tree().process_frame
		h._modal = null
		h.refresh()
		held = await h.session.act("heldGolden")


## THE BITE COMING: the bobber dips twice before the fish takes it, with a
## soft plip each time, so the bite lands as a payoff and not a surprise.
## (Only on a wait long enough to have them; the rules' wait is unchanged.)
var _nibbles: int = 0


func _nibble() -> void:
	_nibbles += 1
	h.boat.nibble()


func _place_dial() -> void:
	# FOCUS (Kong, 2026-10-01): the dial in the middle of the screen, and
	# everything else dimmed behind it while a fish is on.
	var vp: Vector2 = h.get_viewport_rect().size
	h._dial.position = (vp - h._dial.size) / 2.0 + Vector2(0, -30)


var _focus: ColorRect


func _focus_on(on: bool) -> void:
	if _focus == null:
		_focus = ColorRect.new()
		_focus.color = Color(Kit.SCRIM_BASE, 0.0)
		_focus.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_focus.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		h.add_child(_focus)
	if on:
		# THE FIGHT'S LAYERS (spec 1.6): the dim, then the dial, then what the
		# fight says (its stage and pips, the toasts over the dial), then the
		# Reel In lettering, then the Tide Turner. Nothing that matters is
		# left under the dim.
		h.move_child(_focus, -1)
		h.move_child(h._dial, -1)
		h.move_child(h._status, -1)
		h.move_child(h._dots, -1)
		h.move_child(h._notes._toasts, -1)
		h.move_child(h._action, -1)
		h.move_child(h._tide, -1)


## Where the waiting words sit: under the boat while she waits (fight =
## false), or in a fight ABOVE the dial and over the dim (stage first, then
## its pips), so the stage is never behind the ring.
func _readouts(fight: bool) -> void:
	if not fight:
		FishingHud._place(h._status, Vector2(0.5, 0.5), Vector2(-300, 110), Vector2(600, 32))
		FishingHud._place(h._dots, Vector2(0.5, 0.5), Vector2(-150, 80), Vector2(300, 30))
		return
	var top: float = h._dial.position.y
	FishingHud._place(h._status, Vector2(0.5, 0.0), Vector2(-300, top - 72.0), Vector2(600, 32))
	FishingHud._place(h._dots, Vector2(0.5, 0.0), Vector2(-150, top - 38.0), Vector2(300, 30))


func _label(parent: Control, text: String, px: int, col: Color, title: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	l.add_theme_constant_override("shadow_offset_y", 2)
	if title:
		l.add_theme_font_override("font", UiTheme.title_font())
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(l)
	return l


## The waiting words go as the dial comes: a quick fade, then cleared.
func _fade_wait_out() -> void:
	if _wait_tw != null and _wait_tw.is_valid():
		_wait_tw.kill()
	_wait_shown = false
	if h._status.text == "" and h._dots.text == "" and h._timer.text == "":
		return
	_wait_tw = h.create_tween().set_parallel(true)
	for l: Label in [h._status, h._dots, h._timer]:
		Motion.ease_fade(_wait_tw, l, "modulate:a", 0.0, 0.12)
	_wait_tw.chain().tween_callback(func() -> void:
		if phase == "waiting":
			return
		if _boss.is_empty():
			h._status.text = ""
			h._dots.text = ""
		h._timer.text = ""
		for l: Label in [h._status, h._dots, h._timer]:
			l.modulate.a = 1.0)



## Each frame (from the HUD's _process): the focus dim follows the dial, the
## dial keeps its place, the wait runs down to the bite, and the Auto Catcher
## and Auto Caster do their work.
func step(delta: float) -> void:
	if _focus != null:
		var want: float = Kit.SCRIM_FOCUS if h._dial.visible else 0.0
		_focus.color.a = lerpf(_focus.color.a, want, 1.0 - exp(-delta * (10.0 if want > 0.0 else 6.0)))
	if h._dial.visible:
		_place_dial()
	if phase == "waiting":
		_wait_left -= delta
		_since_cast += delta
		if _since_cast + _wait_left > 1.8:
			if _nibbles == 0 and _wait_left < 1.15:
				_nibble()
			elif _nibbles == 1 and _wait_left < 0.5:
				_nibble()
		if _since_cast >= 1.5:
			if not _wait_shown:
				# The waiting words fade in, once a cast.
				_wait_shown = true
				if _wait_tw != null and _wait_tw.is_valid():
					_wait_tw.kill()
				_wait_tw = h.create_tween().set_parallel(true)
				for l: Label in [h._status, h._dots, h._timer]:
					l.modulate.a = 0.0
					Motion.ease_fade(_wait_tw, l, "modulate:a", 1.0, 0.25)
			var n: int = int(_since_cast / 0.22) % 3
			h._dots.text = ["●  ·  ·", "·  ●  ·", "·  ·  ●"][n]
			h._status.text = "Waiting on a bite"
			if h.session.profile().get("show_wait_timer") != false:
				h._timer.text = "%.1fs" % _since_cast
		if _wait_left <= 0.0:
			_bite()
	if phase == "hooked" and h._auto_on and h._auto_tier() == 2 and float(_shot["fishId"]) != FishingRules.CRATE_FISH_ID \
			and float(Js.nz(_shot.get("biteRarity"), 1.0)) <= h._auto_max_rarity():
		_catch_t += delta
		if _catch_t >= 0.42 and h._dial.zone_at(h._dial.angle) == "catch":
			h._dial.strike()
	else:
		_catch_t = 0.0
	if _auto_t >= 0.0:
		_auto_t -= delta
		if _auto_t < 0.0 and phase == "result" and h._modal == null and h._auto_on and not h._action.disabled:
			cast()


## Escape or B: walk away from a line that is out (it stays out and resumes
## on the next cast here), or put the card away.
func walk_away() -> void:
	if phase == "waiting" or phase == "hooked":
		if _wait_tw != null and _wait_tw.is_valid():
			_wait_tw.kill()
		if _dial_tw != null and _dial_tw.is_valid():
			_dial_tw.kill()
		h._dial.visible = false
		h._dial.modulate.a = 1.0
		h._dial.scale = Vector2.ONE
		h._tide.visible = false
		h._status.text = ""
		h._dots.text = ""
		h._timer.text = ""
		_wait_shown = false
		_readouts(false)
		for l: Label in [h._status, h._dots, h._timer]:
			l.modulate.a = 1.0
		Sound.dial_stop()
		h.boat.set_pose("rest")
		_boss = {}
		h._dial.mechanic = ""
		h._dial.ancient_aura = false
		h.toast("You walked away. The line is still out.")
		_set_phase("idle")
	elif phase == "result":
		_close_card()
		_set_phase("idle")
