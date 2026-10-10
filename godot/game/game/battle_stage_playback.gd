extends RefCounted
## Part of BattleStage (game/battle_stage.gd): a round played on the water: the
## events in order, each event's moment (_one_play), the broadside, the crew's
## summons, a boss's summon, the flares, the tides, the last boss's end, and the
## hulls' answers to the guns (the react, the hold on contact).
## Split out of game/battle_stage.gd on 2026-10-10 for size. Static helpers
## taking the stage (bs) first; every piece of the fight's state stays on it.

const BattleStageDeck = preload("res://game/battle_stage_deck.gd")
const BattleStageHud = preload("res://game/battle_stage_hud.gd")
const BattleStageSync = preload("res://game/battle_stage_sync.gd")
const BattleStageDive = preload("res://game/battle_stage_dive.gd")


# ── Playing a round ──────────────────────────────────────────────────────────

static func _play(bs: BattleStage, ev: Array) -> void:
	await _play_events(bs, ev)
	bs._strip_lit = -99
	if bs.b.has("flares") and bs.b["state"] == "plan":
		await _flares(bs)
	match bs.b["state"]:
		"fled":
			await bs._got_away()
		"won":
			await bs._won()
		"lost":
			await bs._lost()
		_:
			BattleStageDeck._await_plan(bs)


static func _play_events(bs: BattleStage, ev: Array) -> void:
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
			if bs._clog != null:
				bs._clog.add(x)
				for g0: Dictionary in group:
					bs._clog.add(g0)
			await _broadside(bs, x, group)
			continue
		await _one(bs, x)
		i += 1


static func _one(bs: BattleStage, x: Dictionary) -> void:
	bs._ctx(int(x.get("foe", 0)))
	if bs._clog != null:
		bs._clog.add(x)
	await _one_play(bs, x)
	if bs._clog != null:
		bs._clog.covering = false


static func _one_play(bs: BattleStage, x: Dictionary) -> void:
	var e: Dictionary = Battle.foes(bs.b)[mini(bs._cur, Battle.foes(bs.b).size() - 1)]
	match x["t"]:
		"ability":
			await _ability_card(bs, x)
		# Two events share "order": the turn order (an Array) and a captain's
		# class order (a seat and a String id, handled further down).
		"order" when x["order"] is Array:
			bs._strip = x["order"]
		"reload":
			var rs: int = int(x["seat"])
			bs._strip_lit = rs
			bs._fx.reload(bs._seat_at(rs), true)
			await bs._wait(0.3)
			_react(bs, rs, "reload")
			var got: int = 1 + int(Js.num(x.get("extra")))
			bs._num(bs._seat_at(rs) + Vector2(0, -70), "+%d ball%s" % [got, "" if got == 1 else "s"], BattleLook.CREAM)
			await bs._wait(0.2)
		"brace":
			bs._strip_lit = int(x["seat"])
			_react(bs, int(x["seat"]), "brace")
			bs._num(bs._seat_at(int(x["seat"])), "Dodging", BattleLook.SHIELD)
			await bs._wait(0.25)
		"shot":
			var ss: int = int(x["seat"])
			var fj: int = bs._cur
			bs._strip_lit = ss
			var land: String = "dodge" if x.get("dodged", false) else ("miss" if x["aim"] == "miss" else ("crit" if x["aim"] == "critical" else "hit"))
			var mid: String = str(x.get("mega", ""))
			var fire_cb: Callable = func(_k: int) -> void: _react(bs, ss, "recoil")
			var land_cb: Callable = func(k: int) -> void: _landed(bs, -1 - fj, land, k)
			if x["action"] == "mega":
				var mg2: Dictionary = Armory.augment(mid)
				bs._say(str(mg2.get("name", "")) + "!")
				var col: Color = Color(str(mg2.get("color", "#ffffff")))
				match mid:
					"railgun":
						_react(bs, ss, "brace")
						await bs._fx.beam(bs._seat_at(ss), bs._enemy_at, col, x.get("grazed", false))
						_react(bs, ss, "recoil")
						_landed(bs, -1 - fj, "crit" if not x.get("grazed", false) else "hit", 0)
					"barrage":
						await bs._fx.barrage(bs._seat_at(ss) + Vector2(40, 0), bs._enemy_at, land, fire_cb, land_cb)
					_:
						await bs._fx.nuke(bs._seat_at(ss) + Vector2(40, 0), bs._enemy_at, land not in ["miss", "dodge"], fire_cb)
						if land not in ["miss", "dodge"]:
							_landed(bs, -1 - fj, "crit", 0)
			else:
				await bs._fx.shot(bs._seat_at(ss) + Vector2(40, 0), bs._enemy_at, land, 3 if x["action"] == "volley" else 1, x["action"] == "volley", fire_cb, land_cb)
			if x.get("dodged", false):
				bs._num(bs._enemy_at, "Dodged!", BattleLook.MUTED)
			elif float(x["dmg"]) > 0.0 or x["aim"] != "miss":
				bs._dmg(bs._enemy_at, int(x["dmg"]), false, land == "crit")
				if x.has("shielded"):
					bs._num(bs._enemy_at + Vector2(-40, -30), "-%d shield" % int(x["shielded"]), BattleLook.SHIELD)
			else:
				bs._num(bs._enemy_at, "Miss", BattleLook.MUTED)
			bs._shown_hp[bs._ek()] = float(x["enemyHp"])
			if x.has("crossfire") and not x.get("dodged", false):
				bs._num(bs._enemy_at, "Crossfire  x%s" % str(snappedf(float(x["crossfire"]), 0.01)), BattleLook.GOLD)
			await bs._wait(0.15)
		"intent":
			pass
		"eReload":
			bs._strip_lit = -1 - bs._cur
			bs._fx.reload(bs._enemy_at, false)
			await bs._wait(0.3)
			_react(bs, -1 - bs._cur, "reload")
			bs._num(bs._enemy_at + Vector2(0, -70), "Reloads", Color(BattleLook.CREAM, 0.8))
			await bs._wait(0.15)
		"eDodge":
			bs._strip_lit = -1 - bs._cur
			_react(bs, -1 - bs._cur, "brace")
			bs._num(bs._enemy_at, "Dodging", BattleLook.SHIELD)
			await bs._wait(0.2)
		"eSpecial":
			bs._fx.sigil(bs._enemy_at, Color(1.0, 0.6, 0.4))
			bs._strip_lit = -1 - bs._cur
			bs._say(str(x.get("name", "")))
			bs._log_line(str(x.get("line", "")))
			await bs._wait(0.9)
		"eShot":
			bs._strip_lit = -1 - bs._cur
			var ti: int = int(x["target"])
			var fj2: int = bs._cur
			var land2: String = "dodge" if x.get("dodged", false) else ("crit" if x["crit"] else "hit")
			await bs._fx.shot(bs._enemy_at + Vector2(-40, 0), bs._seat_at(ti), land2, 3 if x["action"] == "volley" else 1, x["action"] != "fire",
				func(_k: int) -> void: _react(bs, -1 - fj2, "recoil"),
				func(k: int) -> void: _landed(bs, ti, land2, k))
			if x.get("fog", false):
				bs._num(bs._seat_at(ti), "Lost in the fog", BattleLook.WORD)
			elif x.get("dodged", false):
				bs._num(bs._seat_at(ti), "Dodged!", BattleLook.SHIELD)
			else:
				bs._dmg(bs._seat_at(ti), int(x["dmg"]), true, x["crit"])
				if x.get("braced", false):
					bs._num(bs._seat_at(ti) + Vector2(0, -40), "Braced", BattleLook.SHIELD)
				Rumble.buzz([0, 40] if not x["crit"] else [0, 60, 30, 60])
			bs._shown_hp[ti] = float(x["hp"])
			await bs._wait(0.15)
		"phase":
			bs._say(str(x.get("badge", "")) if str(x.get("badge", "")) != "" else str(e["name"]) + " rises again!")
			bs._log_line(str(x.get("line", "")))
			if not Js.obj(x.get("aegis")).is_empty():
				bs._num(bs._enemy_at + Vector2(-120, -80), "%s rises" % x["aegis"]["name"], Color(0.75, 0.82, 0.9), true)
			bs._shown_hp[bs._ek()] = float(x["hp"])
			Sound.horn()
			await bs._wait(1.2)
		"sunkEnemy":
			if bs._raid.get("defeatSequence") is Dictionary and Battle.fight_at(bs._raid, int(bs.b["fight"]))["boss"]:
				await _defeat_sequence(bs, bs._raid["defeatSequence"])
			else:
				var tw: Tween = bs._enemy.create_tween()
				tw.tween_property(bs._enemy, "sink", 1.0, 1.8).set_ease(Tween.EASE_IN)
				bs._fx.burst(bs._enemy_at, true)
				Sound.chest(true)
				await bs._wait(1.0)
		"checkArm":
			bs._say(str(x.get("name", "")))
			bs._log_line("%s  ·  answer it within %d turns with the right crew order" % [x.get("telegraph", ""), int(x["turns"])])
			await bs._wait(1.0)
		"checkMet":
			bs._fx.pulse(bs._enemy_at, Color(1.0, 0.85, 0.45))
			bs._log_line(str(x.get("line", "Countered!")))
			Sound.perfect()
			await bs._wait(0.8)
		"checkFail":
			bs._fx.fizzle(bs._seat_at(bs.me))
			bs._log_line(str(x.get("line", "")))
			Rumble.buzz([0, 60, 30, 60])
			await bs._wait(0.9)
		"cheat":
			bs._say("The anchor holds!" if x.get("anchor", false) else "The ward holds!")
			bs._shown_hp[int(x["seat"])] = float(x["hp"])
			await bs._wait(0.9)
		"sunk":
			bs._sunk_said = true
			bs._say("Holed below the waterline")
			await bs._wait(0.8)
		"burn":
			bs._fx.flare_up(bs._seat_at(int(x["seat"])))
			var si: int = int(x["seat"])
			bs._dmg(bs._seat_at(si), int(x["dmg"]), true, false, "Burning", BattleLook.FIRE)
			bs._shown_hp[si] = float(x["hp"])
			Sound.impact(false)
			await bs._wait(0.35)
		"eBurn":
			bs._fx.flare_up(bs._enemy_at)
			bs._dmg(bs._enemy_at, int(x["dmg"]), false, false, "Burning", BattleLook.FIRE)
			bs._shown_hp[bs._ek()] = float(x["hp"])
			await bs._wait(0.35)
		"frozen":
			bs._fx.freeze_snap(bs._seat_at(int(x["seat"])))
			bs._strip_lit = int(x["seat"])
			bs._num(bs._seat_at(int(x["seat"])), "Frozen solid", BattleLook.ICE, true)
			await bs._wait(0.6)
		"eFrozen":
			bs._fx.freeze_snap(bs._enemy_at)
			bs._strip_lit = -1 - bs._cur
			bs._num(bs._enemy_at, "Frozen solid", BattleLook.ICE, true)
			await bs._wait(0.6)
		"ablaze":
			bs._fx.flare_up(bs._seat_at(int(x["seat"])), true)
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -40), "Set ablaze!", BattleLook.FIRE)
		"iced":
			bs._fx.freeze_snap(bs._seat_at(int(x["seat"])))
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -40), "Iced over!", BattleLook.ICE)
		"eAblaze":
			bs._fx.flare_up(bs._enemy_at, true)
			bs._num(bs._enemy_at + Vector2(0, -40), "Ablaze!", BattleLook.FIRE)
		"eIced":
			bs._fx.freeze_snap(bs._enemy_at)
			bs._num(bs._enemy_at + Vector2(0, -40), "Iced over!", BattleLook.ICE)
		"fumble":
			bs._fx.burst(bs._seat_at(int(x["seat"])), false)
			bs._strip_lit = int(x["seat"])
			bs._dmg(bs._seat_at(int(x["seat"])), int(x["chip"]), true, false, "False colors!", BattleLook.FOE)
			bs._shown_hp[int(x["seat"])] = float(x["hp"])
			Rumble.buzz([0, 40])
			await bs._wait(0.6)
		"parry", "reflect":
			# A riposte (at a ship) or a parry thrown back (at the enemy).
			if x.has("enemyHp"):
				bs._fx.shot(bs._seat_at(int(x["seat"])) + Vector2(40, -20), bs._enemy_at, "hit")
				await bs._wait(0.35)
				bs._dmg(bs._enemy_at, int(x["dmg"]), false, false, str(x.get("name", "Parry")), BattleLook.SHIELD)
				bs._shown_hp[bs._ek()] = float(x["enemyHp"])
			else:
				bs._fx.shot(bs._enemy_at + Vector2(-40, -20), bs._seat_at(int(x["seat"])), "hit")
				await bs._wait(0.35)
				bs._dmg(bs._seat_at(int(x["seat"])), int(x["dmg"]), true, false, str(x.get("name", "Riposte")), BattleLook.FOE)
				bs._shown_hp[int(x["seat"])] = float(x["hp"])
			await bs._wait(0.2)
		"volatile":
			bs._fx.burst(bs._enemy_at, true)
			bs._dmg(bs._seat_at(int(x["seat"])), int(x["dmg"]), true, false, "The wreck goes up!", BattleLook.FIRE)
			bs._shown_hp[int(x["seat"])] = float(x["hp"])
			await bs._wait(0.5)
		"bite":
			bs._fx.toss(bs._seat_at(int(x["seat"])), bs._seat_at(int(x["seat"])) + Vector2(-140, 70), true)
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -40), "A ball knocked loose", Color(1.0, 0.7, 0.4))
		"loaded":
			bs._fx.reload(bs._seat_at(int(x["seat"])), true)
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -40), "+1 ball", BattleLook.CREAM)
		"strip":
			bs._fx.toss(bs._enemy_at, bs._enemy_at + Vector2(130, 80), true)
			bs._num(bs._enemy_at + Vector2(0, -40), "Its powder spilled", BattleLook.GOLD)
		"leech":
			bs._fx.motes(bs._enemy_at, bs._seat_at(int(x["seat"])), BattleLook.HEAL, 8)
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -40), "+%d" % int(x["heal"]), BattleLook.HEAL)
			bs._shown_hp[int(x["seat"])] = float(x["hp"])
		"rack":
			for ld: Variant in Js.list(x.get("landed")):
				bs._fx.status_burst(bs._enemy_at, str(ld))
			bs._num(bs._enemy_at + Vector2(0, -60), "The rack fires", Color(0.85, 0.75, 0.55))
		"eHeal":
			bs._fx.rise(bs._enemy_at, BattleLook.HEAL)
			bs._num(bs._enemy_at + Vector2(0, -40), "+%d" % int(x["heal"]), BattleLook.HEAL, false, false, str(x.get("why", "")), BattleLook.HEAL)
			bs._shown_hp[bs._ek()] = float(x["hp"])
			await bs._wait(0.25)
		"wardSurge":
			bs._say("It will not go down!")
			bs._shown_hp[bs._ek()] = float(x["hp"])
			Sound.horn()
			await bs._wait(0.9)
		"aegisHit":
			var ea: HullAura = bs._aura(bs._ek())
			if ea != null:
				ea.crack()
			bs._num(bs._enemy_at + Vector2(-120, -60), "The wall holds  ·  %d left" % int(x["left"]), Color(0.75, 0.82, 0.9))
			Sound.impact(false)
			await bs._wait(0.3)
		"aegisBreak":
			var ea2: HullAura = bs._aura(bs._ek())
			if ea2 != null:
				ea2.shatter()
			bs._say("%s breaks!" % x.get("name", "The Last Wall"))
			Rumble.buzz([0, 60, 30, 90])
			Sound.impact(true)
			await bs._wait(1.0)
		"bossAbility":
			await _summon(bs, x)
		"refund":
			bs._fx.rise(bs._seat_at(int(x["seat"])), Color(1.0, 0.85, 0.45), 6)
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -40), "The Maw takes nothing", Color(0.9, 0.65, 0.3))
		"flares":
			pass
		"role":
			await _role_move(bs, x)
		"reaction":
			await _reaction(bs, x)
		"order":
			# A captain's class order (core/captain_class.gd), on the water.
			# As much ceremony as a crew order: the strip lights the captain,
			# the order's name goes up as the banner, the seal sounds.
			var osi: int = int(x["seat"])
			bs._strip_lit = osi
			bs._say(str(x.get("name", "")))
			Sound.seal(true)
			bs._num(bs._seat_at(osi) + Vector2(0, -130), str(x.get("name", "")), BattleLook.GOLD, true)
			match str(x.get("order", "")):
				"powder_keg":
					bs._fx.rise(bs._seat_at(osi), BattleLook.FIRE, 10)
				"draw_fire":
					bs._fx.pulse(bs._seat_at(osi), Color(0.95, 0.4, 0.3))
				"field_surgery":
					for h: Dictionary in Js.list(x.get("healed")):
						var hsi: int = int(h["seat"])
						bs._fx.heal_rain(bs._seat_at(hsi), BattleLook.HEAL, 10)
						bs._num(bs._seat_at(hsi), "+%d" % int(h["heal"]), BattleLook.HEAL, true)
						bs._shown_hp[hsi] = float(bs.b["seats"][hsi]["hp"]) if hsi < (bs.b["seats"] as Array).size() else 0.0
				"full_sail":
					for li: Variant in Js.list(x.get("loaded")):
						bs._fx.rise(bs._seat_at(int(li)), Color(0.85, 0.9, 1.0), 6)
						bs._num(bs._seat_at(int(li)) + Vector2(0, -60), "+1 ball", Color(0.85, 0.9, 1.0))
			await bs._wait(0.6)
		"repair":
			var rsi: int = int(x["seat"])
			bs._strip_lit = rsi
			bs._fx.heal_rain(bs._seat_at(rsi), BattleLook.HEAL, 10)
			await bs._wait(0.5)
			bs._num(bs._seat_at(rsi), "+%d" % int(x["heal"]), BattleLook.HEAL, true)
			bs._shown_hp[rsi] = float(x["hp"])
			await bs._wait(0.3)
		"comboNote":
			# A pack's combo (or a jammed role) at work: its name over the ship.
			var fj2: int = int(x.get("foe", -1))
			bs._fx.pulse(bs._foe_at(maxi(0, fj2)), Color(1.0, 0.62, 0.45))
			var at2: Vector2 = bs._seat_at(int(x["seat"])) + Vector2(0, -110) if x.has("seat") else bs._foe_at(maxi(0, fj2)) + Vector2(0, -80)
			bs._num(at2, str(x.get("text", "")), Color(1.0, 0.62, 0.45))
			if x.has("hp") and fj2 >= 0:
				bs._shown_hp["e%d" % fj2] = float(x["hp"])
		"comboBroken":
			bs._fx.fizzle(bs._foe_at(int(x["foe"])))
			bs._num(bs._foe_at(int(x["foe"])) + Vector2(0, -80), "%s broken" % str(x.get("name", "")), Color(0.85, 0.85, 0.8))
			bs._log_line("%s is broken: the %s fights alone now." % [str(x.get("name", "")), str(Battle.foes(bs.b)[int(x["foe"])]["name"])])
		"eBroadside":
			# Every gun down its side at once.
			bs._say("Broadside!")
			for k5: int in 4:
				bs._fx.muzzle(bs._enemy_at + Vector2(-60.0 + k5 * 40.0, 0), false, true)
			Sound.cannon(true)
			await bs._wait(0.3)
		"drum":
			bs._fx.pulse(bs._seat_at(int(x["seat"])), Color(1.0, 0.8, 0.45))
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -90), str(x.get("name", "The drum")), BattleLook.GOLD)
			if x.has("refreshed"):
				bs._log_line("The drum beats: an order is ready again.")
		"intercept":
			bs._strip_lit = -1 - bs._cur
			_react(bs, -1 - bs._cur, "brace")
			bs._num(bs._enemy_at + Vector2(0, -70), "Intercepted!", BattleLook.SHIELD, true)
			await bs._wait(0.35)
		"crossfire":
			bs._xfire_seats = Js.list(x["seats"])
			bs._xfire_foe = int(x.get("foe", 0))
			bs._xfire_t = 2.4
			bs._say("Crossfire!")
			var who: Array = []
			for si3: Variant in bs._xfire_seats:
				who.append("you" if int(si3) == bs.me else str(bs.b["seats"][int(si3)]["name"]))
				bs._num(bs._seat_at(int(si3)) + Vector2(0, -60), "Critical", BattleLook.GOLD, true)
			bs._log_line("Criticals from %s: each of those shots hits %d%% harder." % [" and ".join(PackedStringArray(who)), int(round((float(x["mult"]) - 1.0) * 100.0))])
			Sound.perfect()
			Rumble.buzz([0, 30, 30, 50])
			await bs._wait(0.9)
		"flee":
			var fs: int = int(x["seat"])
			if fs == bs.me:
				await BattleStageDeck._show_flee(bs, x, int(x["need"]))
			else:
				if x["success"]:
					bs._num(bs._seat_at(fs), "Got away", BattleLook.HEAL, true)
				else:
					bs._dmg(bs._seat_at(fs), int(x.get("dmg", 0)), true, false, "Caught!", BattleLook.FOE)
				if x.has("hp"):
					bs._shown_hp[fs] = float(x["hp"])
				await bs._wait(0.6)
		"begin":
			if bs.gauntlet != "":
				await BattleStageDive._descend(bs)
				await BattleStageDive._depth_call(bs)
			await bs._pre_fight_words()
			await bs._enemy_enters()
		"nextFight" when bs.gauntlet != "":
			await BattleStageDive._descend(bs)
			await BattleStageDive._depth_call(bs)
			await bs._enemy_enters()
		"nextFight":
			await bs._next_fight_in(x)
		"pay":
			if x["key"] == bs.my_key:
				bs._say("%s sunk" % bs.b["enemy"]["name"])
				bs._log_line("+%d Navigation XP  ·  +%d ⟡ to the crew's purse" % [int(x["xp"]), int(x["doubloons"])])
				await bs._wait(2.0)
		"crate":
			if x["key"] == bs.my_key:
				bs._say(str(bs._raid.get("bossDefeatedText", "Victory")) if str(bs._raid.get("bossDefeatedText", "")) != "" else "Victory")
				var items: Array = Js.list(x.get("items"))
				bs._log_line("Your crate: %s ⟡%s" % [Js.thousands(Js.num(x.get("coin"))), ("  ·  " + ", ".join(PackedStringArray(items))) if not items.is_empty() else ""])
				Sound.chest(true)
				await bs._wait(3.2)
		"tierClear":
			if x["key"] == bs.my_key:
				BattleStageHud._stamp(bs, str(x.get("tier", "normal")), x.get("first", false) == true)
				await bs._wait(1.6)
		"potUp":
			bs._say("%s sunk" % bs.b["enemy"]["name"])
			bs._log_line("+%s ⟡ to the pot  ·  %s ⟡ riding on it" % [Js.thousands(Js.num(x.get("add"))), Js.thousands(Js.num(x.get("pot")))])
			Sound.chest(false)
			await bs._wait(1.6)
		"towed":
			var tk: int = bs._seat_index(str(x["key"]))
			if tk >= 0:
				bs._num(bs._seat_at(tk) + Vector2(0, -80), "Towed along", Color(0.6, 0.85, 1.0), true)
			bs._log_line("%s towed along, back in the line at a quarter hull." % ("You are" if x["key"] == bs.my_key else str(bs.b["seats"][maxi(0, tk)]["name"]) + " is"))
			await bs._wait(1.0)
		"drowned":
			var dk2: int = bs._seat_index(str(x["key"]))
			bs._log_line("%s went down for good, crew and all." % ("You" if x["key"] == bs.my_key else str(bs.b["seats"][maxi(0, dk2)]["name"])))
			await bs._wait(1.2)
		"refresh":
			if x["key"] == bs.my_key:
				bs._log_line("Your crew catch their breath. Every order is ready again.")
		"seize":
			bs._fx.pulse(bs._seat_at(int(x["seat"])), Color(1.0, 0.85, 0.45))
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -90), "Weather Gauge", BattleLook.GOLD)
		"steal":
			bs._fx.toss(bs._enemy_at, bs._seat_at(int(x["seat"])))
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -80), "Press-Gang  +1 ball" if x.get("kept", false) else "Press-Gang", BattleLook.GOLD)
			await bs._wait(0.2)
		"overkill":
			bs._fx.motes(bs._enemy_at, bs._seat_at(int(x["seat"])), BattleLook.HEAL, 10)
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -70), "+%d" % int(x["heal"]), BattleLook.HEAL)
		"bond":
			# A bond reaching a crewmate (or the ship it marked): its motion,
			# then a line over them.
			var bt: int = int(x.get("to", -1))
			var at: Vector2 = bs._seat_at(bt) if bt >= 0 else bs._enemy_at
			_bond_move(bs, x, at)
			bs._num(at + Vector2(0, -100), str(x.get("text", "")), Color(0.75, 0.9, 1.0))
		"rake":
			var fj: int = int(x["foe"])
			bs._fx.splash(bs._foe_at(fj))
			bs._dmg(bs._foe_at(fj), int(x["dmg"]), false, false, "Raked")
			bs._shown_hp["e%d" % fj] = float(x["enemyHp"])
		"execute":
			bs._fx.finisher(bs._enemy_at)
			bs._say({ "execute": "Executioner!", "deathMark": "Death Mark!" }.get(str(x.get("kind", "")), "Coup de Grace!"))
			bs._shown_hp[bs._ek()] = 0.0
			await bs._wait(0.5)
		"tithe":
			bs._fx.motes(bs._enemy_at, bs._seat_at(int(x["seat"])), Color(0.85, 1.0, 0.6), 12)
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -70), "+%d" % int(x["heal"]), BattleLook.HEAL, true, false, "Tithe", BattleLook.HEAL)
		"coil":
			bs._fx.splash(bs._enemy_at + Vector2(randf_range(-60, 60), 10))
			bs._num(bs._enemy_at + Vector2(0, -90), "Coils %d/%d" % [int(x["coils"]), int(x["of"])], Color(0.55, 0.85, 0.8))
		"grip":
			bs._say("Kraken's Grip!")
			_react(bs, -1 - bs._cur, "hit")
			bs._dmg(bs._enemy_at, int(x["crush"]), false)
			bs._shown_hp[bs._ek()] = float(x["enemyHp"])
			await bs._wait(0.5)
		"thermal":
			bs._say("Thermal Shock!")
			bs._fx.splash(bs._enemy_at)
			bs._dmg(bs._enemy_at, int(x["dmg"]), false)
			bs._shown_hp[bs._ek()] = float(x["enemyHp"])
			await bs._wait(0.5)
		"counter":
			var cs: int = int(x["seat"])
			bs._say("Counter-Battery!")
			await bs._fx.shot(bs._seat_at(cs) + Vector2(40, 0), bs._enemy_at, "hit", 1, false, func(_k: int) -> void: _react(bs, cs, "recoil"), func(_k: int) -> void: pass)
			bs._num(bs._enemy_at + Vector2(0, -80), "Countered", BattleLook.SHIELD, true)
			if x.has("reflect"):
				bs._dmg(bs._enemy_at, int(x["reflect"]), false)
				bs._shown_hp[bs._ek()] = float(x["enemyHp"])
			await bs._wait(0.3)
		"streak":
			bs._fx.rise(bs._seat_at(int(x["seat"])), Color(1.0, 0.85, 0.45), 5)
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -100), "Cannonade x%d" % int(x["n"]), BattleLook.GOLD)
		"streakBroken":
			bs._fx.fizzle(bs._seat_at(int(x["seat"])))
			bs._num(bs._seat_at(int(x["seat"])) + Vector2(0, -100), "Cannonade broken", Color(BattleLook.CREAM, 0.7))
		"eStatus":
			bs._fx.status_burst(bs._enemy_at, str(x.get("status", "")))
			bs._num(bs._enemy_at + Vector2(0, -100), str(x["status"]).capitalize(), Color(0.8, 0.6, 1.0))
		"tided":
			await _tide_shown(bs, Js.obj(Js.obj(x.get("picks")).get(bs.my_key)))


## A BROADSIDE: the call over the water, the enemy heeling with the recoil,
## a ball for every ship in the line at once.
static func _broadside(bs: BattleStage, x: Dictionary, group: Array) -> void:
	bs._ctx(int(x.get("foe", 0)))
	bs._strip_lit = -1 - bs._cur
	bs._say("Broadside!")
	Rumble.buzz([0, 50, 30, 80])
	_react(bs, -1 - bs._cur, "brace")
	await bs._wait(0.35)
	_react(bs, -1 - bs._cur, "recoil")
	_react(bs, -1 - bs._cur, "recoil")
	for g: Dictionary in group:
		var ti: int = int(g["target"])
		var land: String = "dodge" if g.get("dodged", false) else ("crit" if g["crit"] else "hit")
		bs._fx.shot(bs._enemy_at + Vector2(-40, 0), bs._seat_at(ti), land, 2 if x["action"] == "volley" else 3, true, Callable(), func(k: int) -> void: _landed(bs, ti, land, k))
	await bs._wait(0.65)
	for g: Dictionary in group:
		var ti2: int = int(g["target"])
		if g.get("dodged", false):
			bs._num(bs._seat_at(ti2), "Dodged!", BattleLook.SHIELD)
		else:
			bs._dmg(bs._seat_at(ti2), int(g["dmg"]), true, g["crit"])
		bs._shown_hp[ti2] = float(g["hp"])
	await bs._wait(0.4)


static func _ability_card(bs: BattleStage, x: Dictionary) -> void:
	var si: int = int(x["seat"])
	var s: Dictionary = bs.b["seats"][si]
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
	bs._strip_lit = si
	bs._fx.summon_circle(bs._seat_at(si), col, big)
	var cast: SummonCast = SummonCast.new()
	cast.tex = Skipper.tex("card-arts/%s.webp" % str(c.get("filename", "")).get_basename())
	cast.col = col
	cast.crew_name = str(c.get("name", x.get("name", "")))
	cast.order = "%s  ·  %s" % [cls.get("name", ""), cls.get("shortLabel", "")]
	cast.skin = skin
	bs.add_child(cast)
	await cast.done
	# What it did, on the water: each order its own strike.
	var tgt: int = int(x.get("target", si))
	var tat: Vector2 = bs._seat_at(tgt if tgt >= 0 else si)
	match cid:
		"mender":
			if chase == "catfish_galaxy":
				bs._fx.cosmic(tat, col)
			await bs._fx.heal_rain(tat, col if chase != "" else FxSheet.status_color("regen"))
		"abyssal_tide":
			await bs._fx.tide(tat, col)
		"sharpshot":
			bs._fx.mark("reticle", bs._enemy_at, col, 1.2)
			bs._num(bs._seat_at(si) + Vector2(0, -90), "Steady aim: a wider crit", BattleLook.CREAM)
		"snare":
			bs._fx.mark("chains", bs._enemy_at, col, 1.4)
			await bs._wait(0.4)
			bs._fx.status_burst(bs._enemy_at, "slowed")
			bs._num(bs._enemy_at + Vector2(0, -90), "Snared: it cannot dodge", BattleLook.CREAM)
		"anchor":
			bs._fx.splash(tat)
			bs._fx.status_burst(tat, "fortify")
			bs._num(tat + Vector2(0, -90), "Braced", BattleLook.CREAM)
		"navigator":
			var got: int = int(Js.num(x.get("charges")))
			for k2: int in got:
				bs._fx.toss(tat + Vector2(randf_range(-120, 120), -420), tat)
				await bs._wait(0.15)
		"leviathan":
			if chase == "dole_krakenhunter":
				bs._fx.splash(bs._enemy_at)
				bs._fx.glyph_burst(bs._enemy_at, "ember", col, 24, 300.0, 16.0, 500.0)
			await _breach(bs, cast.tex, col)
		"blitz":
			var hits: Array = Js.list(x.get("hits"))
			for h: Variant in hits:
				if chase == "mako_tempest":
					bs._fx.lightning(bs._enemy_at, col)
				else:
					bs._fx.shot(bs._seat_at(si), bs._enemy_at + Vector2(randf_range(-40, 40), 0), "hit")
				bs._dmg(bs._enemy_at + Vector2(randf_range(-40, 40), -20), int(Js.num(h)), false)
				await bs._wait(0.16)
		"foresight":
			bs._fx.mark("glyphs", bs._enemy_at, col, 1.8, big)
		"vengeance":
			bs._fx.mark("aureole", tat, col, 1.8, big)
			bs._fx.status_burst(tat, "fortify")
		"requiem":
			bs._fx.mark("reticle", bs._enemy_at, col, 1.6, big)
			await bs._wait(0.45)
			bs._fx.status_burst(bs._enemy_at, "marked")
	# The numbers.
	if x.has("heal") and float(x["heal"]) > 0.0:
		bs._num(tat, "+%d" % int(x["heal"]), BattleLook.HEAL, true)
		bs._shown_hp[tgt] = float(bs.b["seats"][tgt]["hp"])
	if x.has("shield"):
		bs._num(tat + Vector2(0, -40), "+%d shield" % int(x["shield"]), BattleLook.SHIELD)
	if x.has("charges"):
		bs._num(tat, "+%d ball%s" % [int(x["charges"]), "" if int(x["charges"]) == 1 else "s"] if float(x["charges"]) > 0.0 else "No luck", BattleLook.CREAM)
	if x.has("dmg"):
		bs._fx.finisher(bs._enemy_at) if cid == "leviathan" else bs._fx.burst(bs._enemy_at, true)
		bs._dmg(bs._enemy_at, int(x["dmg"]), false)
		bs._shown_hp[bs._ek()] = float(bs.b["enemy"]["hp"])
	if x.has("reveal"):
		bs._log_line("Next: %s" % ", ".join(PackedStringArray(x["reveal"])))
	await bs._wait(0.4)


## The Leviathan's salvo: the crew's own creature breaches beside the enemy
## and slams into it.
static func _breach(bs: BattleStage, tex: Texture2D, col: Color) -> void:
	var sm: BattleSummon = BattleSummon.new()
	sm.field = bs.sea._field
	sm.tex = tex
	sm.col = col
	sm.position = bs._enemy_at + Vector2(-220, 200)
	sm.z_index = 3
	sm.set_meta("fight", true)
	bs.sea._world.add_child(sm)
	await sm.rise()
	await sm.lunge(bs._enemy_at)
	sm.sink()


# ── The enemies' moments ─────────────────────────────────────────────────────

## A boss's summon: the creature breaches beside it, does its work, sinks.
static func _summon(bs: BattleStage, x: Dictionary) -> void:
	bs._strip_lit = -1 - bs._cur
	var sm: BattleSummon = BattleSummon.new()
	sm.field = bs.sea._field
	sm.tex = Skipper.tex(str(x.get("image", "")).trim_prefix("/"))
	sm.col = Color(str(x.get("color", "#a78bfa")))
	sm.position = bs._enemy_at + Vector2(-90, 260)
	sm.z_index = 3
	sm.set_meta("fight", true)
	bs.sea._world.add_child(sm)
	bs._say(str(x.get("name", "")))
	await sm.rise()
	match str(x["kind"]):
		"leviathan":
			for h: Dictionary in x["hits"]:
				await sm.lunge(bs._seat_at(int(h["seat"])))
				bs._dmg(bs._seat_at(int(h["seat"])), int(h["dmg"]), true)
				bs._shown_hp[int(h["seat"])] = float(h["hp"])
		"blitz":
			for h: Dictionary in x["hits"]:
				for k: int in 4:
					bs._fx.shot(sm.position, bs._seat_at(int(h["seat"])) + Vector2(randf_range(-40, 40), 0), "hit")
					await bs._wait(0.12)
				bs._dmg(bs._seat_at(int(h["seat"])), int(h["dmg"]), true)
				bs._shown_hp[int(h["seat"])] = float(h["hp"])
		"abyssal_tide":
			await sm.pulse()
			bs._num(bs._enemy_at, "+%d  ·  +%d shield" % [int(x.get("heal", 0)), int(x.get("shield", 0))], BattleLook.HEAL, true)
			bs._shown_hp[bs._ek()] = float(x["enemyHp"])
		"foresight":
			await sm.pulse()
			bs._log_line("It sees your next shots coming: it will slip any it braces for.")
		"vengeance":
			await sm.pulse()
			bs._log_line("A ward burns under it: the next killing blow will not take.")
		"requiem":
			await sm.pulse()
			for i: int in (bs.b["seats"] as Array).size():
				bs._num(bs._seat_at(i), "Marked", Color(0.75, 0.85, 1.0))
	await bs._wait(0.4)
	await sm.sink()


## The flare barrage: every captain swats their own sky.
static func _flares(bs: BattleStage) -> void:
	var fl: Dictionary = bs.b["flares"]
	var fb: FlareBarrage = FlareBarrage.new()
	fb.count = int(fl["count"])
	fb.feint_chance = float(fl["feint"])
	fb.cluster = float(fl["cluster"])
	fb.fuse_scale = float(fl["fuse"])
	fb.title = str(fl["name"])
	fb.source = bs._screen(bs._enemy_at) + Vector2(0, -60)
	fb.target = bs._screen(bs._seat_at(bs.me)) + Vector2(0, -40)
	if bs.autoplay:
		fb.fuse_scale = 0.4
	bs.add_child(fb)
	var got: Array = await fb.finished
	if bs.table != null:
		BattleStageSync._act(bs, ["flares", { "missed": float(got[0]), "feints": float(got[1]) }])
		return
	var landed_fl: Array = Battle.flares_land(bs.b, [{ "missed": got[0], "feints": got[1] }])
	RaidFeats.feed(bs._feats, landed_fl, bs.me, int(bs.b["fight"]))
	await _play_list(bs, landed_fl)


static func _play_list(bs: BattleStage, ev: Array) -> void:
	for x: Dictionary in ev:
		match x["t"]:
			"flareHit":
				if bs._clog != null:
					bs._clog.add(x)
				if float(x["dmg"]) > 0.0:
					bs._fx.burst(bs._seat_at(int(x["seat"])), float(x["missed"]) >= 2.0)
					bs._dmg(bs._seat_at(int(x["seat"])), int(x["dmg"]), true)
					bs._shown_hp[int(x["seat"])] = float(x["hp"])
					await bs._wait(0.4)
				else:
					bs._num(bs._seat_at(int(x["seat"])), "Not a spark landed", BattleLook.CREAM)
					await bs._wait(0.4)
			_:
				await _one(bs, x)


## A tide (or the reprieve): the card, the captain's pick, what it did.
static func _tide(bs: BattleStage, tide: Dictionary, eyebrow: String) -> void:
	var card: TideCard = TideCard.new()
	card.tide = tide
	card.eyebrow = eyebrow
	bs.add_child(card)
	if bs.autoplay:
		await bs._wait(1.2)
		card._pick(str(tide["choices"][0]["id"]))
	var id: String = await card.chosen
	if bs.table != null:
		BattleStageSync._act(bs, ["tide", id])
		return
	var r: Dictionary = Battle.tide_pick(bs.b, bs.me, tide, id)
	if Js.num(r.get("heal")) > 0.0:
		bs._shown_hp[bs.me] = float(bs.b["seats"][bs.me]["hp"])
	await _tide_shown(bs, r)


## What a tide picked did for you (solo, or a table's "tided" event): the
## heal over your ship, a line for an order made ready.
static func _tide_shown(bs: BattleStage, r: Dictionary) -> void:
	if Js.num(r.get("heal")) > 0.0:
		bs._num(bs._seat_at(bs.me), "+%d" % int(r["heal"]), BattleLook.HEAL, true)
	if r.get("refreshed") != null:
		bs._log_line("A spent crew order is ready again.")
	await bs._wait(0.6)


## THE LAST BOSS'S END (defeatSequence; Finn, the web's bespoke one): a
## hit-stop on the blow, the water going dark as he goes UP rather than under,
## his last words, then the dark lifting from him outward. The loot follows.
static func _defeat_sequence(bs: BattleStage, ds: Dictionary) -> void:
	var lines: Array = Js.list(ds.get("lines"))
	var boss: Dictionary = Js.obj(bs._raid["enemies"][bs._raid["bossId"]])
	# The blow lands and everything holds for a breath.
	bs._fx.burst(bs._enemy_at, true)
	Sound.impact(true)
	Rumble.buzz([0, 90, 40, 140])
	await bs._wait(0.45 if not GameSettings.calm() else 0.2)
	# The dark comes in over the water.
	var dark: ColorRect = ColorRect.new()
	dark.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dark.color = Color(0.01, 0.015, 0.03, 0.0)
	bs.add_child(dark)
	bs.move_child(dark, 0)
	var tw: Tween = bs.create_tween().set_parallel()
	tw.tween_property(dark, "color:a", 0.72, 1.6)
	# He goes UP: lifted off the water, thinning as he climbs, light pouring off.
	var him: Node2D = bs._enemy if bs._enemy != null and is_instance_valid(bs._enemy) else null
	if him == null:
		for n0: Variant in bs._foe_nodes:
			if n0 != null and is_instance_valid(n0):
				him = n0
				break
	if him != null:
		tw.tween_property(him, "position:y", him.position.y - 320.0, 2.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		tw.tween_property(him, "modulate:a", 0.0, 2.6).set_ease(Tween.EASE_IN)
	for k: int in 3:
		bs._fx.rise(bs._enemy_at + Vector2(randf_range(-60, 60), -20.0 * k), Color(0.85, 0.92, 1.0), 10)
		await bs._wait(0.5)
	await bs._wait(1.2)
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
		bs.add_child(sc)
		if bs.autoplay:
			await bs._wait(0.5)
			sc._end(true)
		await sc.finished
	# The dark lifts, from where he was outward.
	bs._fx.pulse(bs._enemy_at, Color(1.0, 0.88, 0.6))
	Sound.chest(true)
	var tw2: Tween = bs.create_tween()
	tw2.tween_property(dark, "color:a", 0.0, 2.2).set_trans(Tween.TRANS_SINE)
	await tw2.finished
	dark.queue_free()


# ── The hulls' answers to the guns ────────────────────────────────────────────

## The hull of a ship in the fight: a seat (yours, or a crewmate's), or an
## enemy (-1 - its index).
static func _hull_of(bs: BattleStage, who: int) -> Object:
	if who < 0:
		var j: int = -1 - who
		return bs._foe_nodes[j] if j < bs._foe_nodes.size() and is_instance_valid(bs._foe_nodes[j]) else null
	if who == bs.me:
		return bs.sea._boat
	return bs._mate_of(who)


## How a hull answers: a hit (leans and is shoved away from the guns, flushes
## red), a crit (harder), its own guns' recoil, a brace (a lean into it), a
## reload (a settle), a dodge (a hard swerve aside with foam).
static func _react(bs: BattleStage, who: int, kind: String) -> void:
	var h: Object = _hull_of(bs, who)
	if h == null or not h.has_method("react"):
		return
	# The enemies ride to the east: a blow pushes them east, the line west.
	var away: float = 1.0 if who < 0 else -1.0
	match kind:
		"hit":
			h.call("react", 0.07 * away, Vector2(18.0 * away, 2.0), 0.85)
		"crit":
			h.call("react", 0.2 * away, Vector2(40.0 * away, -4.0), 1.0)
		"recoil":
			h.call("react", 0.035 * away, Vector2(12.0 * away, 0.0), 0.0)
		"brace":
			h.call("react", -0.05 * away, Vector2(-4.0 * away, 0.0), 0.0)
		"reload":
			h.call("react", 0.0, Vector2(0.0, 6.0), 0.0)
		"dodge":
			var side: float = -1.0 if randf() < 0.5 else 1.0
			h.call("react", -0.14 * away, Vector2(30.0 * away, 70.0 * side), 0.0)


## THE HOLD ON CONTACT (Kong, 2026-10-09: hits should feel weighty, no screen
## shake): the whole fight holds a few frames as a ball lands (HOLD_HIT, a
## critical HOLD_CRIT, a volley's later balls HOLD_LATER) and the hull flashes
## white through it; the splinters burst and the number rises as it lets go
## (they run on the fight's own clock). A critical also pushes the camera in a
## touch toward the ship it struck and eases back (Sea.punch).
const HOLD_HIT: float = 0.05
const HOLD_CRIT: float = 0.09
const HOLD_LATER: float = 0.03
const HOLD_SCALE: float = 0.02
const PUNCH: float = 0.02
static var _held_until: int = 0


static func _strike(bs: BattleStage, who: int, land: String, k: int) -> void:
	var h: Object = _hull_of(bs, who)
	if h != null and h.has_method("flash_white"):
		h.call("flash_white")
	_hold(bs, HOLD_CRIT if land == "crit" else (HOLD_LATER if k > 0 else HOLD_HIT))
	if land == "crit" and bs.sea != null:
		bs.sea.punch_at = bs._seat_at(who) if who >= 0 else bs._foe_at(-1 - who)
		var tw: Tween = bs.sea.create_tween().set_ignore_time_scale(true)
		tw.tween_property(bs.sea, "punch", PUNCH, 0.07).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_property(bs.sea, "punch", 0.0, 0.25).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


## Hold the fight for s seconds of real time (the longest asked wins; holds
## never add up). Released by a static callback, so a fight that ends mid-hold
## never leaves the game slowed.
static func _hold(bs: BattleStage, s: float) -> void:
	var until: int = Time.get_ticks_msec() + int(s * 1000.0)
	if until <= _held_until:
		return
	_held_until = until
	Engine.time_scale = HOLD_SCALE
	bs.get_tree().create_timer(s, true, false, true).timeout.connect(_unhold)


static func _unhold() -> void:
	if Time.get_ticks_msec() >= _held_until - 4:
		Engine.time_scale = 1.0


## A ball came down on (or past) a ship.
static func _landed(bs: BattleStage, who: int, land: String, k: int) -> void:
	match land:
		"hit", "crit":
			_react(bs, who, land)
			_strike(bs, who, land, k)
			if who >= 0:
				Rumble.buzz([0, 35] if land == "hit" else [0, 60, 30, 60])
		"dodge":
			if k == 0:
				_react(bs, who, "dodge")
				var at: Vector2 = bs._seat_at(who) if who >= 0 else bs._foe_at(-1 - who)
				bs._fx.swerve(at, -1.0 if who >= 0 else 1.0)


## A bond's motion, read from what it did: a ball handed over, a shield
## thrown, a heal carried, a mark set, a status lifted.
static func _bond_move(bs: BattleStage, x: Dictionary, at: Vector2) -> void:
	var from: Vector2 = bs._seat_at(int(x["seat"]))
	var tx: String = str(x.get("text", ""))
	if tx.contains("ball"):
		if int(x.get("to", -1)) == int(x["seat"]):
			bs._fx.reload(from, true)
		else:
			bs._fx.toss(from, at)
	elif tx.contains("shield") or tx == "Shield Wall":
		bs._fx.tether(from, at, Color(0.6, 0.85, 1.0))
	elif tx.begins_with("+"):
		bs._fx.motes(from, at, BattleLook.HEAL, 8)
	elif tx == "Marked" or tx.begins_with("Spotted"):
		bs._fx.sigil(at, Color(1.0, 0.82, 0.4))
	elif tx == "Boarded!":
		bs._fx.tether(from, at, Color(0.85, 0.7, 0.5))
	elif tx == "Cleared":
		bs._fx.rise(at, Color(0.95, 0.95, 1.0), 6)
	elif tx == "Signal up":
		bs._fx.pulse(from, Color(1.0, 0.85, 0.45))


## A REACTION (two captains' elements on one ship): its own moment each, the
## name over the water, and "Reaction discovered" the first time this captain
## sees it.
static func _reaction(bs: BattleStage, x: Dictionary) -> void:
	var fj: int = int(x["foe"])
	var at: Vector2 = bs._foe_at(fj)
	var from: Vector2 = bs._seat_at(int(x["seat"]))
	var others: Array = Js.list(x.get("others"))
	match str(x["id"]):
		"fog_bank":
			# Fire meets ice: a wall of white steam boils up off the hull.
			bs._fx.glyph_burst(at, "frost", Color(0.95, 0.97, 1.0, 0.7), 12, 140.0, 90.0)
			bs._fx.glyph_burst(at, "ember", Color(1.0, 0.6, 0.3), 6, 200.0, 14.0)
			bs._num(at + Vector2(0, -60), "Lost in the steam", Color(0.85, 0.9, 0.95))
		"greek_fire":
			# Green fire leaping hull to hull.
			bs._fx.flare_up(at, true)
			for o: Variant in others:
				bs._fx.fire_leap(at, bs._foe_at(int(Js.obj(o)["foe"])), Color(0.45, 1.0, 0.4))
		"powder_keg":
			bs._fx.blast(at)
			bs._fx.glyph_burst(at, "ember", Color(1.0, 0.7, 0.3), 18, 360.0, 16.0, 400.0)
			for o2: Variant in others:
				bs._fx.fling(at, bs._foe_at(int(Js.obj(o2)["foe"])), "fireball", Color(1.0, 0.7, 0.4))
		"brittle_hull":
			# The ice shatters: slivers flung out, cracks across the hull.
			bs._fx.glyph_burst(at, "ice", Color(0.85, 0.95, 1.0), 16, 300.0, 34.0, 500.0)
			bs._fx.glyph_burst(at, "crack", Color(0.8, 0.92, 1.0), 4, 60.0, 60.0)
			bs._fx.burst(at, true)
		"crushing_deep":
			# The coils close: the spiral collapses inward and the sea leaps up.
			bs._fx.status_burst(at, "slowed")
			bs._fx.splash(at)
			bs._fx.glyph_burst(at, "ember", Color(0.35, 0.95, 0.8), 14, 240.0, 16.0)
		"boiling_sea":
			# Bubbles boiling up round the hull, steam over them.
			for k: int in 3:
				bs._fx.glyph_burst(at + Vector2(randf_range(-60, 60), 0), "bubble", Color(1.0, 0.7, 0.35), 6, 90.0, 22.0, -120.0)
			bs._fx.glyph_burst(at, "frost", Color(1.0, 0.95, 0.9, 0.5), 6, 80.0, 70.0)
		"rot":
			# The barrier rots: acid bubbles, its shell cracking away.
			bs._fx.glyph_burst(at, "bubble", FxSheet.status_color("corrode"), 10, 120.0, 24.0, -60.0)
			bs._fx.glyph_burst(at, "crack", Color(0.75, 0.9, 1.0), 6, 140.0, 50.0)
			bs._num(at + Vector2(0, -60), "Barrier rots away", Color(0.75, 0.85, 0.35))
		"numbed":
			bs._fx.freeze_snap(at)
			bs._fx.status_burst(at, "slowed")
			bs._num(at + Vector2(0, -60), "Numbed  +1 turn frozen", BattleLook.ICE)
		"last_rites":
			# A beam of gold down onto the marked hull.
			bs._fx.beam(from, at, Color(1.0, 0.85, 0.45), false)
			bs._fx.finisher(at)
		"davys_kiss":
			# A whirlpool opening under every ship.
			for j2: int in Battle.foes(bs.b).size():
				bs._fx.status_burst(bs._foe_at(j2), "slowed")
				bs._fx.glyph_burst(bs._foe_at(j2), "ember", Color(0.3, 0.85, 0.85), 16, 200.0, 14.0)
				bs._fx.splash(bs._foe_at(j2))
	if Js.num(x.get("dmg")) > 0.0:
		bs._dmg(at, int(x["dmg"]), false)
	for o2: Variant in others:
		var od: Dictionary = Js.obj(o2)
		if od.has("dmg"):
			bs._dmg(bs._foe_at(int(od["foe"])), int(od["dmg"]), false)
			bs._shown_hp["e%d" % int(od["foe"])] = float(od["hp"])
	bs._shown_hp["e%d" % fj] = float(x["enemyHp"])
	var fresh: bool = Js.list(x.get("new")).has(bs.my_key)
	bs._say(("Reaction discovered!  " if fresh else "") + str(x["name"]))
	bs._log_line("%s!  %s" % [x["name"], str(Battle.reaction_def(str(x["id"])).get("desc", ""))] if fresh else "%s!" % x["name"])
	Sound.seal(true)
	if fresh:
		Sound.perfect()
	await bs._wait(1.1 if fresh else 0.6)


## A role's move on the water: a beam of light from the caster to the ally it
## shields or mends, a bolt to the captain it hexes, a pulse through the line
## it rallies.
static func _role_move(bs: BattleStage, x: Dictionary) -> void:
	bs._strip_lit = -1 - bs._cur
	var from: Vector2 = bs._enemy_at
	var nm: String = str(x.get("name", ""))
	match str(x["role"]):
		"shieldwright", "sawbones":
			var tj: int = int(x["to"])
			var to: Vector2 = bs._foe_at(tj)
			var col: Color = BattleLook.SHIELD if x["role"] == "shieldwright" else BattleLook.HEAL
			_react(bs, -1 - bs._cur, "brace")
			bs._fx.tether(from, to, col)
			await bs._wait(0.45)
			if x["role"] == "shieldwright":
				bs._num(to + Vector2(0, -60), "+%d shield" % int(x["amount"]), col, true)
			else:
				bs._num(to + Vector2(0, -60), "+%d" % int(x["amount"]), col, true)
				bs._shown_hp["e%d" % tj] = float(x["hp"])
			bs._log_line("The %s %s %s." % [nm, "throws a barrier over" if x["role"] == "shieldwright" else "patches up", "itself" if tj == bs._cur else Battle.foes(bs.b)[tj]["name"]])
		"hexer":
			var si: int = int(x["seat"])
			bs._fx.tether(from, bs._seat_at(si), FxSheet.status_color(str(x["status"])))
			bs._fx.status_burst(bs._seat_at(si), str(x["status"]))
			await bs._wait(0.4)
			_react(bs, si, "hit")
			bs._num(bs._seat_at(si) + Vector2(0, -60), "Blinded!" if x["status"] == "blinded" else "Narrowed!", Color(0.8, 0.6, 1.0), true)
			bs._log_line("The %s hexes %s: %s." % [nm, "you" if si == bs.me else bs.b["seats"][si]["name"], "sight only near the needle" if x["status"] == "blinded" else "a smaller mark to hit"])
		"spotter":
			var sj: int = int(x["seat"])
			bs._fx.tether(from, bs._seat_at(sj), FxSheet.status_color("marked"))
			bs._fx.status_burst(bs._seat_at(sj), "marked")
			await bs._wait(0.4)
			bs._num(bs._seat_at(sj) + Vector2(0, -60), "Marked!", Color(1.0, 0.5, 0.4), true)
			bs._log_line("The %s spots %s: Marked, every hit lands harder for a while." % [nm, "you" if sj == bs.me else bs.b["seats"][sj]["name"]])
		"rallier":
			_react(bs, -1 - bs._cur, "brace")
			for j: Variant in Js.list(x.get("all")):
				bs._fx.status_burst(bs._foe_at(int(j)), "enrage")
				bs._num(bs._foe_at(int(j)) + Vector2(0, -60), "Enraged!", Color(1.0, 0.55, 0.4))
			bs._log_line("The %s rallies the line: they hit harder for a while." % nm)
	Sound.seal(true)
	await bs._wait(0.45)
