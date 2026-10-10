extends RefCounted
## Part of Battle (core/battle.gd): seats and their loadout: a ship in the line
## from a captain's save (seat_for, class cards and milestones), the raid items'
## fx, the on-hit gear (parry, leech, streaks, finishing checks) and the drum's
## once-a-raid rally. Split out of core/battle.gd on 2026-10-10 for size; every
## function is static over the battle's plain Dictionaries, as it was there.

const BattleCoop = preload("res://core/battle_coop.gd")
const BattleCrew = preload("res://core/battle_crew.gd")
const BattleFoe = preload("res://core/battle_foe.gd")
const BattleTides = preload("res://core/battle_tides.gd")


# ══ Who is in the fight ═══════════════════════════════════════════════════════

## A ship in the line, from a captain's save: the hull's stats by tier, the
## crew seated for raids (slot 0 is the captain's hand at full weight, the
## rest at 0.8), the Navigation level's bonuses (lib/raidLoadout).
static func seat_for(db: CaptainStore, uid: String, name: String = "") -> Dictionary:
	var prof: Dictionary = db.me(uid)
	var tier: int = clampi(int(Js.nz(prof.get("ship_tier"), 2.0)), 2, 6)
	var hull: Dictionary = Rules.data()["shipCombat"][str(tier)]
	var nav: int = Loadout.nav_level_from_xp(Js.num(prof.get("expedition_xp")))
	var seated: Array = Crew.live(db).filter(func(c: Dictionary) -> bool: return c.get("raid_slot") != null)
	seated.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["raid_slot"]) < float(b["raid_slot"]))
	var pw: float = 0.0
	var dg: float = 0.0
	var ft: float = 0.0
	var crew: Array = []
	# The seats the party fills (raidLoadout): the hull's berths, a class
	# pick's extra seat (Expanded Quarters) and the Sixth Berth.
	var cls_fx: Dictionary = Campaign.class_effects(prof.get("ship_classes"))
	var slots: int = int(hull["crewSlots"]) + int(cls_fx["crewSlots"]) + (1 if prof.get("has_sixth_berth") == true else 0)
	for c: Dictionary in seated.slice(0, slots):
		var st: Dictionary = Crew.leveled_stats(c)
		var mult: float = 1.0 if float(c["raid_slot"]) == 0.0 else 0.8
		pw += float(Js.round(float(st["power"]) * mult))
		dg += float(Js.round(float(st["dodge"]) * mult))
		ft += float(Js.round(float(st["fortune"]) * mult))
		var card: Dictionary = Crew.card(float(c["card_id"]))
		var slug: String = str(card.get("slug", "")).to_lower()
		var cls_id: Variant = Js.obj(Crew.t().get("classBySlug")).get(slug)
		var cls: Dictionary = Crew.class_of(slug)
		crew.append({
			"id": c["id"], "slug": slug, "name": c["nickname"] if c.get("nickname") != null else Crew.display_name(slug, str(card.get("name", ""))),
			"filename": Skins.filename_for(prof, slug, str(card.get("filename", ""))), "cls": cls_id,
			"ms": _milestone(cls, Crew.level(Js.num(c.get("xp")))),
		})
	# The chapters' class picks (raidLoadout): hull, speed and damage (cls_fx,
	# read above).
	# The raid items on the hull (the loadout's cap, and the finale's mount).
	var items: Array = Armory.live_items(prof)
	var grades: Dictionary = {} if Rules.web_only else Js.obj(prof.get("raid_item_grades"))
	var fx: Dictionary = item_fx(items, grades)
	# Navigation Renown: Might (damage) and Bulwark (hull).
	var ren: Dictionary = Js.obj(prof.get("nav_renown_alloc"))
	var might: float = maxf(0.0, floor(Js.num(ren.get("might"))))
	var bulwark: float = maxf(0.0, floor(Js.num(ren.get("bulwark"))))
	var max_hp: float = float(Js.round((float(hull["durability"]) + nav + 3.0 * bulwark) * float(fx["maxHp"]) * float(cls_fx["hpMult"])))
	# Deep-Sea Plating (the Don's Locker): a tenth more hull in every fight.
	if Gauntlet.owns(prof, "dg_deep_plating"):
		max_hp = float(Js.round(max_hp * 1.10))
	return {
		"uid": uid, "name": name if name != "" else str(prof.get("username", "Captain")),
		"face": { "characterColor": str(Js.nz(prof.get("character_color"), "default")), "hat": prof.get("equipped_hat") },
		"shipSkin": prof.get("equipped_ship_skin"), "classes": _class_cards(prof.get("ship_classes")),
		"tier": float(tier), "hp": max_hp, "max": max_hp, "speed": maxf(0.0, float(hull["speed"]) + float(cls_fx["speedFlat"])),
		"shipMin": float(hull["minDamage"]), "power": pw + floor(nav / 5.0), "nav": dg + floor(nav / 5.0),
		"fortune": ft + floor(nav / 5.0), "dmgMult": float(cls_fx["damageMult"]) * (1.0 + 0.005 * might),
		"maxCharges": float(Battle.MAX_CHARGES + (1 if Armory.has_rack(prof) else 0)), "mega": Armory.mega_of(prof),
		"crew": crew, "used": [], "repairKit": prof.get("equipped_repair_kit"),
		"repairMult": 1.25 if Gauntlet.owns(prof, "seasoned_timbers") else 1.0,
		"items": items, "grades": grades, "fx": fx, "saves": float(fx["lethalSave"]), "drum": false,
		"cls": CaptainClass.effects(prof.get("ship_classes")) if CaptainClass.on() else {}, "orderUsed": false,
	}


## The ship's class picks as the ledger shows them: name, colour, bullets.
static func _class_cards(picks: Variant) -> Array:
	var out: Array = []
	var defs: Dictionary = Js.obj(Js.obj(Rules.data().get("shipClasses")).get("classes"))
	for id: Variant in Js.obj(picks).values():
		var c: Dictionary = Js.obj(defs.get(id))
		if not c.is_empty():
			out.append({ "name": c.get("name", ""), "color": c.get("color", ""), "bullets": c.get("bullets", []) })
	return out


static func _milestone(cls: Dictionary, lv: int) -> Dictionary:
	var now: Dictionary = {}
	for m: Dictionary in Js.list(cls.get("milestones")):
		if lv >= int(m["unlockLevel"]):
			now = m
	return now


## Fresh per-fight state for a seat (the web remounts a fight: charges,
## statuses and the rest reset; HP carries).
static func _ready_seat(s: Dictionary) -> void:
	s["charges"] = 0.0
	s["statuses"] = {}
	s["last"] = ""
	s["shield"] = 0.0
	s["brace"] = {}
	s["ward"] = {}
	s["vBuff"] = 0.0
	s["sharp"] = {}
	s["dodgeToken"] = 0.0
	s["abilityThisTurn"] = false
	s["burn"] = {}
	s["freeze"] = 0.0
	s["frozenNow"] = false
	s["afflict"] = {}
	s["shots"] = 0.0
	s["critRamp"] = 0.0
	s["firstBlow"] = false
	s["cheated"] = false
	s["anchorUsed"] = false
	s["lashUsed"] = false
	s["kitUsed"] = false
	# The run effects' per-fight counts: shots locked (duds too), volleys
	# loosed, the crit streak, the counter-battery's roll.
	s["locked"] = 0.0
	s["volleys"] = 0.0
	s["streak"] = 0.0
	s.erase("counterOn")
	s["sunk"] = s.get("sunk", false) == true
	if s.has("items"):
		s["live"] = (s["items"] as Array).duplicate()
		s["fx"] = item_fx(s["live"], Js.obj(s.get("grades")))
	if not s.has("tfx"):
		s["tfx"] = []


# ══ Raid items (lib/raidItems effects) ═════════════════════════════════════════

## An item list's effects, folded the way RaidCombat reads each type:
## products for multipliers, sums for the ward, crit upgrades, lifesteal and
## saves, the best for chances.
static func item_fx(ids: Array, grades: Dictionary = {}) -> Dictionary:
	var fx: Dictionary = {
		"bossMult": 1.0, "nonbossMult": 1.0, "critMult": 1.0, "noncritMult": 1.0, "inMult": 1.0, "maxHp": 1.0,
		"firstShot": 1.0, "afflicted": 1.0, "avengeElite": 1.0, "ramp": 0.0, "critUpgrade": 0.0, "lifesteal": 0.0,
		"wardPct": 0.0, "lethalSave": 0.0, "offensive": false, "fireMult": 1.0, "volleyMult": 1.0, "megaMult": 1.0,
	}
	var best: Array = ["burn", "freeze", "parry", "parryReflect", "firstBlowParry", "maxHitPct", "maxHitChance", "chargeOnHit",
		"reloadCharge", "navSpeed", "startCharge", "extraStart", "critStrip", "dodgePierce", "wardRefill", "weaken", "corrode",
		"feeble", "critSpread", "critRamp", "critRefund"]
	for k: String in best:
		fx[k] = 0.0
	var key: Dictionary = {
		"burn_chance": "burn", "freeze_chance": "freeze", "parry_chance": "parry", "parry_reflect_pct": "parryReflect",
		"first_blow_parry_chance": "firstBlowParry", "max_hit_chance": "maxHitChance", "charge_on_hit_chance": "chargeOnHit",
		"reload_charge_chance": "reloadCharge", "speed_roll_nav_pct": "navSpeed", "start_charge_chance": "startCharge",
		"extra_start_charge_chance": "extraStart", "crit_strip_charge": "critStrip", "dodge_pierce_chance": "dodgePierce",
		"ward_refill_pct": "wardRefill", "weaken_on_hit": "weaken", "corrode_on_hit": "corrode", "feeble_on_hit": "feeble",
		"crit_spread_chance": "critSpread", "crit_ramp_turns": "critRamp", "crit_charge_refund_chance": "critRefund",
	}
	var offensive: Array = ["boss_damage_mult", "crit_damage_mult", "noncrit_damage_mult", "nonboss_damage_mult", "ramp_damage_per_turn", "burn_chance", "freeze_chance", "parry_chance", "parry_reflect_pct"]
	for id: Variant in ids:
		# A tempered item (the port's forge) adds to its bonus part.
		for e: Dictionary in Forge.tempered_effects(Armory.effects_of(str(id)), int(Js.num(grades.get(str(id))))):
			var t: String = str(e["type"])
			var v: float = float(e["value"])
			if offensive.has(t):
				fx["offensive"] = true
			match t:
				"boss_damage_mult": fx["bossMult"] = float(fx["bossMult"]) * v
				"fire_damage_mult": fx["fireMult"] = float(fx["fireMult"]) * v
				"volley_damage_mult": fx["volleyMult"] = float(fx["volleyMult"]) * v
				"mega_damage_mult": fx["megaMult"] = float(fx["megaMult"]) * v
				"nonboss_damage_mult": fx["nonbossMult"] = float(fx["nonbossMult"]) * v
				"crit_damage_mult": fx["critMult"] = float(fx["critMult"]) * v
				"noncrit_damage_mult": fx["noncritMult"] = float(fx["noncritMult"]) * v
				"incoming_damage_mult": fx["inMult"] = float(fx["inMult"]) * v
				"max_hp_mult": fx["maxHp"] = float(fx["maxHp"]) * v
				"first_shot_mult": fx["firstShot"] = float(fx["firstShot"]) * v
				"afflicted_damage_mult": fx["afflicted"] = float(fx["afflicted"]) * v
				"avenge_elite_mult": fx["avengeElite"] = float(fx["avengeElite"]) * v
				"ramp_damage_per_turn": fx["ramp"] = float(fx["ramp"]) + v
				"crit_upgrade_chance": fx["critUpgrade"] = float(fx["critUpgrade"]) + v
				"lifesteal_pct": fx["lifesteal"] = float(fx["lifesteal"]) + v
				"ward_pct": fx["wardPct"] = float(fx["wardPct"]) + v
				"lethal_save": fx["lethalSave"] = float(fx["lethalSave"]) + v
				"max_hit_pct":
					fx["maxHitPct"] = v if float(fx["maxHitPct"]) == 0.0 else minf(float(fx["maxHitPct"]), v)
				"pierce_crit": fx["pierceCrit"] = true
				"ambush_each_phase": fx["ambush"] = true
				"ward_refill_on_save": fx["wardOnSave"] = true
				_:
					if key.has(t):
						fx[key[t]] = maxf(float(fx[key[t]]), v)
	return fx


## A death cheated: the Drowned Crown's vengeance arms, the Standing Wall
## raises the palisade again.
static func _cheated(s: Dictionary) -> void:
	s["cheated"] = true
	if Js.obj(s.get("fx")).get("wardOnSave", false):
		s["shield"] = maxf(float(s["shield"]), float(s.get("wardMax", 0.0)))


## Thrown back at the enemy (a parry): through its shield and its ward.
static func _reflect(b: Dictionary, si: int, dmg: float, ev: Array, name: String) -> void:
	var e: Dictionary = b["enemy"]
	if not (e["aegis"] as Dictionary).is_empty():
		return
	var absorbed: float = minf(float(e["shield"]), dmg)
	e["shield"] = float(e["shield"]) - absorbed
	e["hp"] = BattleFoe._ward_floor(b, float(e["hp"]) - (dmg - absorbed), ev)
	ev.append({ "t": "reflect", "seat": si, "dmg": dmg - absorbed, "enemyHp": e["hp"], "name": name })
	finish_check(b, si, false, ev)
	if float(e["hp"]) <= 0.0:
		BattleFoe._enemy_down(b, ev, false)


## Lifesteal off a landed blow (the run's and the items', capped at 35%),
## through the heal multiplier, up to the heal cap.
static func _leech(b: Dictionary, si: int, dmg: float, ta: Dictionary, ev: Array) -> void:
	var s: Dictionary = b["seats"][si]
	var rate: float = minf(0.35, float(ta["lifesteal"]) + float(Js.obj(s.get("fx")).get("lifesteal", 0.0)))
	if rate <= 0.0 or float(s["hp"]) <= 0.0:
		return
	var heal: float = float(Js.round(minf(float(Js.round(float(s["max"]) * rate * 2.0)), maxf(1.0, float(Js.round(dmg * rate)))) * float(s.get("healMult", 1.0))))
	var got: float = BattleCrew._heal(s, heal)
	if got > 0.0:
		ev.append({ "t": "leech", "seat": si, "heal": got, "hp": s["hp"] })
		BattleCoop._surgeon(b, si, got, ev)


## The crit streak (Cannonade): a crit adds a stack (a won counter-battery
## adds its bonus), anything else breaks it unless the counter kept it.
static func _streak(s: Dictionary, ta: Dictionary, crit: bool, ev: Array, si: int) -> void:
	if float(ta["streakPer"]) <= 0.0:
		return
	var prior: float = Js.num(s.get("streak"))
	var bonus: float = float(ta["counterStack"]) if s.get("counterProc", false) else 0.0
	if crit:
		s["streak"] = minf(float(ta["streakMax"]), prior + 1.0 + bonus)
		if float(s["streak"]) >= 2.0:
			ev.append({ "t": "streak", "seat": si, "n": s["streak"], "pct": float(Js.round(float(ta["streakPer"]) * float(s["streak"]) * 100.0)) })
	elif bonus > 0.0:
		s["streak"] = minf(float(ta["streakMax"]), prior + bonus)
	else:
		s["streak"] = 0.0
		if prior >= 2.0:
			ev.append({ "t": "streakBroken", "seat": si })


## finishCheck: the run's kill riders after any blow that lowered the hull:
## the Executioner's line, the crit's Coup de Grace, the Reaper's Tithe.
static func finish_check(b: Dictionary, si: int, crit: bool, ev: Array) -> void:
	var e: Dictionary = b["enemy"]
	if si < 0 or si >= (b["seats"] as Array).size():
		return
	var s: Dictionary = b["seats"][si]
	var ta: Dictionary = BattleTides.tide_agg(s, e["boss"])
	var hp: float = float(e["hp"])
	var mx: float = float(e["max"])
	var done: bool = false
	if hp > 0.0 and float(ta["execute"]) > 0.0 and hp <= ceil(mx * float(ta["execute"])):
		e["hp"] = BattleFoe._ward_floor(b, 0.0, ev)
		if float(e["hp"]) <= 0.0:
			done = true
			ev.append({ "t": "execute", "seat": si, "kind": "execute" })
	if not done and crit and float(e["hp"]) > 0.0 and float(ta["critExecute"]) > 0.0 and float(e["hp"]) <= ceil(mx * float(ta["critExecute"])):
		e["hp"] = BattleFoe._ward_floor(b, 0.0, ev)
		if float(e["hp"]) <= 0.0:
			done = true
			ev.append({ "t": "execute", "seat": si, "kind": "coup" })
	if not done and float(e["hp"]) > 0.0 and Js.num(e.get("deathMark")) > 0.0 and float(e["hp"]) <= ceil(mx * float(e["deathMark"])):
		e["hp"] = BattleFoe._ward_floor(b, 0.0, ev)
		if float(e["hp"]) <= 0.0:
			ev.append({ "t": "execute", "seat": si, "kind": "deathMark" })
	var revives: bool = int(e["phase"]) - 1 < (e["phases"] as Array).size()
	if float(e["hp"]) <= 0.0 and hp > 0.0 and float(ta["executeHeal"]) > 0.0 and float(s["hp"]) > 0.0 and not revives:
		var heal: float = minf(minf(float(s["max"]) - float(s["hp"]), float(Js.round(mx * float(ta["executeHeal"])))), float(Js.round(float(s["max"]) * 0.15)))
		if heal > 0.0:
			s["hp"] = float(s["hp"]) + heal
			ev.append({ "t": "tithe", "seat": si, "heal": heal, "hp": s["hp"] })


## A shot that landed and left it afloat: the items' riders (crit strip,
## lifesteal, fire and ice, the rack's spread, the Leviathan's stoking).
static func _proc(c: float, hits: int) -> bool:
	if c <= 0.0:
		return false
	if hits > 1:
		return Dice.next() < 1.0 - (1.0 - c) * pow(1.0 - c * 0.3, hits - 1)
	return Dice.next() < c


static func _on_hit(b: Dictionary, si: int, dmg: float, crit: bool, ev: Array, hits: int = 1) -> void:
	var s: Dictionary = b["seats"][si]
	var e: Dictionary = b["enemy"]
	var fx: Dictionary = Js.obj(s.get("fx"))
	if crit and float(e["charges"]) > 0.0 and float(fx.get("critStrip", 0.0)) > 0.0 and Dice.next() < float(fx["critStrip"]):
		e["charges"] = float(e["charges"]) - 1.0
		ev.append({ "t": "strip", "seat": si, "charges": e["charges"] })
	var ta: Dictionary = BattleTides.tide_agg(s, e["boss"])
	# Fire: a hit may set it ablaze (and a burning hull may be stoked again).
	var old_burn: Dictionary = Js.obj(e.get("burn"))
	if ta["reignite"] and not old_burn.is_empty():
		old_burn["turns"] = 2.0 + float(ta["burnTurns"])
	var bc: float = minf(0.20, float(fx.get("burn", 0.0)) + float(ta["burnChance"]))
	if bc > 0.0 and _proc(bc, hits):
		var turns: float = 2.0 + float(ta["burnTurns"])
		var tick: float = maxf(1.0, float(Js.round(dmg * minf(0.20, 0.10 * float(ta["burnTick"])))))
		e["burn"] = { "turns": turns, "dmg": maxf(tick, float(old_burn.get("dmg", 0.0)) if ta["reignite"] else 0.0), "by": float(si), "backdraft": ta["backdraft"], "feed": ta["burnTickHeal"] }
		BattleCoop._el(b, e, "fire", si)
		ev.append({ "t": "eAblaze", "seat": si, "dmg": e["burn"]["dmg"], "turns": turns })
	# Ice: the next turn (two, in deep ice) frozen.
	var fc: float = minf(0.20, float(fx.get("freeze", 0.0)) + float(ta["freezeChance"]))
	if fc > 0.0 and _proc(fc, hits):
		e["freeze"] = 2.0 if ta["deepFreeze"] else 1.0
		BattleCoop._el(b, e, "ice", si)
		ev.append({ "t": "eIced", "seat": si, "deep": ta["deepFreeze"] })
	# Statuses a run's shot leaves.
	for so: Dictionary in ta["onHit"]:
		if _proc(float(so["chance"]), hits):
			Battle.apply_status(e["statuses"], str(so["status"]), float(so["magnitude"]), float(so["turns"]))
			BattleCoop._el(b, e, str(so["status"]), si)
			ev.append({ "t": "eStatus", "seat": si, "status": so["status"] })
	# Kraken's Grip: coils build; when they close the hull is held and crushed.
	if float(ta["gripHits"]) > 0.0:
		var gk: String = str(si)
		if not e.has("grip"):
			e["grip"] = {}
		var coils: float = Js.num(e["grip"].get(gk)) + 1.0
		e["grip"][gk] = coils
		var hits_need: float = float(ta["gripHits"])
		if coils >= hits_need or Dice.next() < pow(coils / hits_need, 2.0):
			e["grip"][gk] = 0.0
			e["freeze"] = maxf(Js.num(e.get("freeze")), float(ta["gripTurns"]))
			var crush: float = maxf(1.0, float(Js.round(float(e["max"]) * float(ta["gripCrush"]) * coils)))
			e["hp"] = maxf(0.0, float(e["hp"]) - crush)
			ev.append({ "t": "grip", "seat": si, "coils": coils, "crush": crush, "enemyHp": e["hp"], "turns": ta["gripTurns"] })
			finish_check(b, si, false, ev)
		else:
			ev.append({ "t": "coil", "seat": si, "coils": coils, "of": hits_need })
	# Thermal Shock: ice meets fire and the frozen hull bursts.
	if float(ta["thermal"]) > 0.0 and float(e["hp"]) > 0.0 and (e.get("frozenNow", false) or Js.num(e.get("freeze")) > 0.0) and not Js.obj(e.get("burn")).is_empty():
		var burst: float = maxf(1.0, float(Js.round(dmg * float(ta["thermal"]))))
		var ab: float = minf(float(e["shield"]), burst)
		e["shield"] = float(e["shield"]) - ab
		e["hp"] = BattleFoe._ward_floor(b, float(e["hp"]) - (burst - ab), ev)
		e["freeze"] = 0.0
		e["frozenNow"] = false
		ev.append({ "t": "thermal", "seat": si, "dmg": burst - ab, "enemyHp": e["hp"] })
		finish_check(b, si, false, ev)
	var rack: float = maxf(float(fx.get("weaken", 0.0)), maxf(float(fx.get("corrode", 0.0)), float(fx.get("feeble", 0.0))))
	var fired: bool = rack > 0.0 and _proc(rack, hits)
	if not fired and rack > 0.0 and crit and float(fx.get("critSpread", 0.0)) > 0.0 and Dice.next() < float(fx["critSpread"]):
		fired = true
	if fired:
		var landed: Array = []
		if float(fx.get("weaken", 0.0)) > 0.0:
			Battle.apply_status(e["statuses"], "weaken", 0.20, 2.0)
			landed.append("weaken")
		if float(fx.get("corrode", 0.0)) > 0.0:
			Battle.apply_status(e["statuses"], "corrode", 0.30, 2.0)
			landed.append("corrode")
		if float(fx.get("feeble", 0.0)) > 0.0:
			Battle.apply_status(e["statuses"], "feeble", 0.20, 2.0)
			landed.append("feeble")
		for l9: String in landed:
			BattleCoop._el(b, e, l9, si)
		ev.append({ "t": "rack", "seat": si, "landed": landed })
	if crit and float(fx.get("critRamp", 0.0)) > 0.0:
		s["critRamp"] = float(s.get("critRamp", 0.0)) + float(fx["critRamp"])


## The drum (War Drum, Thunder Drum, the drums forged from them): once a
## raid, a free beat that may bring a spent crew order back.
static func drum_of(s: Dictionary) -> Dictionary:
	for id: Variant in Js.list(s.get("items")):
		var it: Dictionary = Armory.item(str(id))
		if it.get("activated") is Dictionary:
			return it
	return {}


static func use_drum(b: Dictionary, si: int) -> Dictionary:
	var s: Dictionary = b["seats"][si]
	var it: Dictionary = drum_of(s)
	if it.is_empty() or s.get("drum", false):
		return { "error": "No drum to beat" }
	s["drum"] = true
	var spent: Array = Js.list(s.get("used"))
	var out: Dictionary = { "t": "drum", "seat": si, "name": it["name"] }
	if not spent.is_empty() and Dice.next() < float(it["activated"]["chance"]):
		var k: int = int(floor(Dice.next() * spent.size()))
		out["refreshed"] = spent[k]
		spent.remove_at(k)
	return out
