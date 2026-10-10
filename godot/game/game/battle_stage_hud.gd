extends RefCounted
## Part of BattleStage (game/battle_stage.gd): the HUD drawn over the water: the
## bars, the plates over the ships, the fight track (a dive's depth track), the
## turn strip, the order chips, the numbers rising, and the Stamp and the
## DepthCall.
## Split out of game/battle_stage.gd on 2026-10-10 for size. Static helpers
## taking the stage (bs) first; every piece of the fight's state stays on it.

const BattleStageDeck = preload("res://game/battle_stage_deck.gd")


static func _draw(bs: BattleStage) -> void:
	var vp: Vector2 = bs.size
	var hb: float = BattleStage.BAR * bs._bars
	bs.draw_rect(Rect2(0, 0, vp.x, hb), Color(0, 0, 0, 0.92))
	bs.draw_rect(Rect2(0, vp.y - hb, vp.x, hb), Color(0, 0, 0, 0.92))
	if bs._bars < 0.5 or bs.b.is_empty():
		return
	BattleStageDeck._order_preview(bs)
	# A crossfire: gold lines from each critical ship to the enemy, fading.
	bs._xfire_t = maxf(0.0, bs._xfire_t - bs.get_process_delta_time())
	if bs._xfire_t > 0.0 and bs._enemy != null and is_instance_valid(bs._enemy):
		var xa: float = clampf(bs._xfire_t / 2.4, 0.0, 1.0)
		var ep2: Vector2 = bs._screen(bs._foe_at(bs._xfire_foe)) + Vector2(0, -60)
		for si4: Variant in bs._xfire_seats:
			var sp4: Vector2 = bs._screen(bs._seat_at(int(si4))) + Vector2(30, -60)
			bs.draw_line(sp4, ep2, Color(1.0, 0.82, 0.35, 0.18 * xa), 14.0, true)
			bs.draw_line(sp4, ep2, Color(1.0, 0.9, 0.55, 0.85 * xa), 3.0, true)
		bs.draw_circle(ep2, 26.0 + 18.0 * (1.0 - xa), Color(1.0, 0.85, 0.4, 0.35 * xa))
	var f: Font = Kit.font("cinzel", 800)
	_fight_track(bs, hb)
	_draw_strip(bs, Vector2(vp.x - 30, hb * 0.42))
	if bs.table != null and str(bs._latest.get("phase", "")) == "plan":
		var who: Array = []
		var given: Dictionary = Js.obj(bs._latest.get("plans"))
		for st: Dictionary in Battle.alive(bs.b):
			if not given.has(st.get("key")):
				who.append("You" if st.get("key") == bs.my_key else str(st["name"]))
		var cd: String = ("Choosing: " + ", ".join(PackedStringArray(who))) if not who.is_empty() else "Every order is in"
		var cw: float = f.get_string_size(cd, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
		var cr: Rect2 = Rect2(vp.x / 2.0 - cw / 2.0 - 22.0, hb * 0.5 - 15.0, cw + 44.0, 30.0)
		BattleLook.draw_box(bs, cr, BattleLook.box(Color(BattleLook.LACQUER_HI, 0.95), Color(0, 0, 0, 0), 0, 15))
		BattleLook.say(bs, f, vp.x / 2.0, cr.get_center().y + 5.0, cd, 15, Kit.GOLD_HI)
		# How long the table waits before it takes the default: a thin
		# draining line under the pill and the seconds (gold in the last 10).
		var left: float = bs._plan_until - bs._t
		if not who.is_empty() and left > 0.0 and bs._plan_len > 0.0:
			var share: float = clampf(left / bs._plan_len, 0.0, 1.0)
			var lw: float = 120.0
			var ly: float = cr.end.y + 5.0
			var lx: float = vp.x / 2.0 - lw / 2.0 - 14.0
			var hot: bool = left <= 10.0
			bs.draw_rect(Rect2(lx, ly, lw, 2.0), Color(1, 1, 1, 0.14))
			bs.draw_rect(Rect2(lx, ly, lw * share, 2.0), BattleLook.GOLD if hot else BattleLook.MUTED)
			bs.draw_string(Kit.font("karla", 800), Vector2(lx + lw + 8.0, ly + 5.0), "%ds" % ceili(left), HORIZONTAL_ALIGNMENT_LEFT, -1, 10, BattleLook.GOLD if hot else BattleLook.MUTED)

	# Each enemy's plate over its masthead (on a field, the target marked), and
	# each ship's; plates that would overlap are spread apart (_spread).
	var fs2: Array = Battle.foes(bs.b)
	var aiming: bool = bs._field() and not bs._busy
	var want: Array = []
	var frames: bool = bs._frames_mode()
	var row: int = 0
	for j2: int in mini(fs2.size(), bs._foe_nodes.size()):
		if not is_instance_valid(bs._foe_nodes[j2]):
			continue
		var en: HullRig = bs._foe_nodes[j2]
		if float(en.sink) >= 0.95:
			continue
		if frames:
			# A field: the enemies' frames down the right edge, a slim tag on
			# each hull.
			want.append(["e%d" % j2, Vector2(vp.x - 150.0, BattleStage.BAR + 22.0 + 76.0 * row)])
			row += 1
			var e1: Dictionary = fs2[j2]
			_hull_tag(bs, bs._screen(en.position) + Vector2(0, bs._tag_lift()), str(e1["name"]), float(bs._shown_hp.get("e%d" % j2, e1["hp"])) / maxf(1.0, float(e1["max"])), BattleLook.FOE, bs._strip_lit == -1 - j2 or (aiming and j2 == bs._target), 1.0 - float(en.sink))
		else:
			want.append(["e%d" % j2, bs._screen(en.position) + Vector2(0, bs._plate_lift(225.0))])
	for i: int in (bs.b["seats"] as Array).size():
		if frames:
			want.append([i, Vector2(150.0, BattleStage.BAR + 22.0 + 76.0 * i)])
			var s1: Dictionary = bs.b["seats"][i]
			_hull_tag(bs, bs._screen(bs._seat_at(i)) + Vector2(0, bs._tag_lift()), "You" if i == bs.me else str(s1["name"]), float(bs._shown_hp.get(i, s1["hp"])) / maxf(1.0, float(s1["max"])), BattleLook.ALLY, bs._strip_lit == i, 1.0)
		else:
			want.append([i, bs._screen(bs._seat_at(i)) + Vector2(0, bs._plate_lift(215.0))])
	bs._plate_at = want.reduce(func(acc: Dictionary, w: Array) -> Dictionary:
		acc[w[0]] = w[1]
		return acc, {}) if frames else _spread(want)
	for j2: int in mini(fs2.size(), bs._foe_nodes.size()):
		if not is_instance_valid(bs._foe_nodes[j2]):
			continue
		var en: HullRig = bs._foe_nodes[j2]
		var key: String = "e%d" % j2
		if not bs._plate_at.has(key):
			continue
		var e: Dictionary = fs2[j2]
		var ep: Vector2 = bs._plate_at[key]
		var etag: String = "TARGET" if aiming and j2 == bs._target else ("BOSS" if e["boss"] else (_role_name(bs, e).to_upper() if str(e.get("role", "")) != "" else ("ELITE" if e.get("elite", false) else "")))
		if aiming and j2 == bs._target:
			var hc: Vector2 = bs._screen(en.position) + Vector2(0, -60.0 * bs._z())
			var rr: float = en.box * 0.45 * bs._z()
			for q: int in 4:
				var a0: float = TAU * q / 4.0 + bs._t * 0.6
				bs.draw_arc(hc, rr, a0 - 0.32, a0 + 0.32, 12, Color(BattleLook.GOLD, 0.9), 2.5, true)
		_plate(bs, ep, str(e["name"]), float(bs._shown_hp.get(key, e["hp"])), float(e["max"]), float(e["shield"]), int(e["charges"]), int(e["mag"]), e["statuses"], true, bs._strip_lit == -1 - j2, key, etag, bs._foe_tex[j2], "", 1.0 - float(en.sink))
		if not BattleStage.card_seen and float(en.sink) < 0.05 and j2 == 0:
			if not frames:
				BattleLook.say(bs, Kit.font("karla", 800), ep.x + 8.0, ep.y + 76.0, "CLICK FOR STATS", 10, Color(BattleLook.GOLD, 0.6 + 0.3 * sin(bs._t * Motion.PULSE_CALL)), 4)
			else:
				BattleLook.say(bs, Kit.font("karla", 800), ep.x + 8.0, ep.y - 14.0, "CLICK A FRAME FOR STATS", 10, Color(BattleLook.GOLD, 0.6 + 0.3 * sin(bs._t * Motion.PULSE_CALL)), 4)
	for i: int in (bs.b["seats"] as Array).size():
		var s: Dictionary = bs.b["seats"][i]
		var sp: Vector2 = bs._plate_at[i]
		var out_word: String = "SUNK" if s.get("sunk", false) else ("AWAY" if s.get("fled", false) else "")
		_plate(bs, sp, str(s["name"]), float(bs._shown_hp.get(i, s["hp"])), float(s["max"]), float(s["shield"]), int(s["charges"]), int(s["maxCharges"]), s["statuses"], false, bs._strip_lit == i, i, "YOU" if bs.table != null and i == bs.me else "", bs._face(i), out_word, 1.0)
		if bs.table != null and str(bs._latest.get("phase", "")) == "plan" and Battle.alive(bs.b).has(s):
			if frames:
				_order_chip(bs, sp + Vector2(136, 18), s, true)
			else:
				_order_chip(bs, sp + Vector2(0, 66), s)
	# Numbers rising off the water.
	# Damage slams in big and settles (an overshoot), drifts off its hull and
	# up, and fades; a critical is bigger, tilted, gold, on a glow, with
	# CRITICAL over it. Words (a dodge, a reload) are smaller and calmer.
	for n: Dictionary in bs._numbers:
		var u: float = float(n["t"]) / 1.4
		var txt: String = n["text"]
		var dmg: bool = txt.trim_suffix("!").is_valid_int()
		var crit: bool = n.get("crit", false) == true
		var rise: float = 1.0 - pow(1.0 - clampf(u, 0.0, 1.0), 3.0)
		var p: Vector2 = bs._screen(n["p"]) + Vector2(float(n.get("dx", 0.0)) * rise, -40.0 - (90.0 if dmg else 60.0) * rise - 38.0 * float(n.get("k", 0)))
		var fs: int = (46 if crit else (34 if dmg else (30 if n["big"] else 21)))
		var w: float = f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var a: float = 1.0 - smoothstep(0.62, 1.0, u)
		var e0: float = clampf(u / 0.16, 0.0, 1.0)
		var pop: float = (lerpf(1.9, 0.92, e0) if e0 < 1.0 else 1.0) if dmg else lerpf(1.3, 1.0, e0)
		if u > 0.16 and u < 0.26 and dmg:
			pop = lerpf(0.92, 1.0, (u - 0.16) / 0.1)
		var rot: float = (-0.09 if crit else 0.0) * (1.0 - e0 * 0.4)
		bs.draw_set_transform(p, rot, Vector2(pop, pop))
		if crit:
			var gr: float = fs * 1.5
			bs.draw_texture_rect(bs._num_glow, Rect2(Vector2(-gr, -fs * 0.3 - gr), Vector2(gr, gr) * 2.0), false, Color(BattleLook.CRIT, 0.5 * a))
			var cw2: float = Kit.font("karla", 800).get_string_size("CRITICAL", HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			bs.draw_string_outline(Kit.font("karla", 800), Vector2(-cw2 / 2.0, -fs * 0.95), "CRITICAL", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, 5, Color(0, 0, 0, 0.7 * a))
			bs.draw_string(Kit.font("karla", 800), Vector2(-cw2 / 2.0, -fs * 0.95), "CRITICAL", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(Kit.GOLD_HI, a))
		# Where it came from, a small word over the figure.
		var wd: String = str(n.get("word", ""))
		if wd != "":
			var wf: Font = Kit.font("karla", 800)
			var wy: float = -fs * 0.95 - (16.0 if crit else 0.0)
			var ww: float = wf.get_string_size(wd, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
			bs.draw_string_outline(wf, Vector2(-ww / 2.0, wy), wd, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, 5, Color(0, 0, 0, 0.7 * a))
			bs.draw_string(wf, Vector2(-ww / 2.0, wy), wd, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(n.get("wcol", BattleLook.MUTED), a))
		bs.draw_string_outline(f, Vector2(-w / 2.0, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 9 if dmg else 7, Color(0, 0, 0, 0.8 * a))
		bs.draw_string(f, Vector2(-w / 2.0, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(n["col"], a))
		# The first instant of a hit: a white flash on the figure.
		if dmg and u < 0.08:
			bs.draw_string(f, Vector2(-w / 2.0, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1, 1, 1, 0.8 * (1.0 - u / 0.08)))
		bs.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


static func _plate(bs: BattleStage, at: Vector2, name: String, hp: float, mx: float, shield: float, ch: int, mag: int, st: Dictionary, foe: bool, lit: bool, key: Variant, tag: String, portrait: Texture2D, out_word: String, alpha: float) -> void:
	if alpha <= 0.01:
		return
	var w: float = 258.0
	var h: float = 60.0
	var r: Rect2 = Rect2(at.x - w / 2.0 + 16.0, at.y, w - 16.0, h)
	var share: float = clampf(hp / maxf(1.0, mx), 0.0, 1.0)
	# The trail drains toward the hull after a hit; a heal jumps it up.
	var tr: float = float(bs._trail.get(key, share))
	tr = share if tr < share else move_toward(tr, share, bs.get_process_delta_time() * 0.45)
	bs._trail[key] = tr
	var out: bool = out_word != ""
	var a: float = alpha * (0.55 if out else 1.0)
	var glow: float = (0.65 + 0.35 * sin(bs._t * Motion.PULSE_CALL)) if lit else 0.0
	BattleLook.panel(bs, r, 12.0, a, glow)
	var mc: Vector2 = Vector2(r.position.x + 4.0, r.position.y + h * 0.5)
	BattleLook.medallion(bs, mc, 27.0 if foe else 24.0, portrait, BattleLook.FOE if foe else BattleLook.ALLY, name.substr(0, 1), a, Vector2(0.5, 0.27) if foe else Vector2(0.5, 0.5), 0.25 if foe else 0.5)
	if tag != "":
		# Gold means aimed at (as the reticle round the hull); green your
		# line; red the boss; a role or ELITE in plain cream.
		var tone: Color = BattleLook.FOE if tag == "BOSS" else (BattleLook.GOLD if tag == "TARGET" else (BattleLook.ALLY if tag == "YOU" else BattleLook.CREAM))
		var tf: Font = BattleLook.tag_font()
		var tw: float = BattleLook.pill_w(tag)
		var tr2: Rect2 = Rect2(Vector2(r.position.x + 36.0, r.position.y - 10.0), Vector2(tw, 17))
		BattleLook.draw_box(bs, tr2, BattleLook.box(Color(BattleLook.LACQUER_LO, a), Color(tone, a), 1, 8))
		bs.draw_string(tf, tr2.position + Vector2(6, 12.5), tag.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, Kit.role_px("tag"), Color(tone.lightened(0.3), a))
	var x0: float = r.position.x + 36.0
	var hf: Font = Kit.font("karla", 800)
	var ht: String = "%d / %d" % [int(hp), int(mx)]
	var hw: float = hf.get_string_size(ht, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
	bs.draw_string(hf, Vector2(r.end.x - 12.0 - hw, r.position.y + 21.0), ht, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(BattleLook.MUTED, a))
	bs.draw_string(Kit.font("cinzel", 800), Vector2(x0, r.position.y + 21.0), name, HORIZONTAL_ALIGNMENT_LEFT, r.end.x - 20.0 - hw - x0, 14, Color(BattleLook.CREAM, a))
	var bar: Rect2 = Rect2(x0, r.position.y + 28.0, r.end.x - 12.0 - x0, 10.0)
	BattleLook.bar(bs, bar, share, tr, shield / maxf(1.0, mx), BattleLook.FOE if foe else BattleLook.ALLY, BattleLook.FOE_LO if foe else BattleLook.ALLY_LO, a)
	# The rack: a ball just loaded pops in (BattleLook.ball), so a reload
	# reads as balls gained.
	var rk: String = str(key)
	var had: int = int(bs._rack_seen.get(rk, ch))
	var now: int = Time.get_ticks_msec()
	if ch > had:
		for k0: int in range(had, ch):
			bs._rack_pop["%s:%d" % [rk, k0]] = now
	bs._rack_seen[rk] = ch
	for k: int in mag:
		var at_ms: int = int(bs._rack_pop.get("%s:%d" % [rk, k], 0))
		var pop: float = clampf(1.0 - float(now - at_ms) / 450.0, 0.0, 1.0) if at_ms > 0 and k < ch else 0.0
		BattleLook.ball(bs, Vector2(x0 + 7.0 + k * 17.0, r.position.y + 49.0), 6.5, k < ch, a, pop)
	# What it is under, right to left.
	var sx: float = r.end.x - 12.0
	for id: String in st:
		var word: String = id.capitalize()
		if word.length() > 9:
			word = word.substr(0, 9)
		# Its own colour, the same as the effect the ship wears.
		var tone2: Color = FxSheet.status_color(id) if FxSheet.STATUS.has(id) else (BattleLook.ALLY if id in ["fortify", "enrage", "regen", "haste"] else BattleLook.FOE)
		sx -= BattleLook.pill_w(word)
		if sx < x0 + mag * 17.0:
			break
		BattleLook.pill(bs, Vector2(sx, r.position.y + 41.0), word, tone2, a)
		sx -= 4.0
	if out:
		BattleLook.draw_box(bs, r, BattleLook.box(Color(0, 0, 0, 0.45 * alpha), Color(0, 0, 0, 0), 0, 12))
		BattleLook.say(bs, Kit.font("cinzel", 900), r.get_center().x + 10.0, r.get_center().y + 7.0, out_word, 20, Color(BattleLook.CREAM, 0.9 * alpha), 6)


## The raid's title, and its fights as knots on a cord: sailed, this one lit,
## to come hollow; the boss's knot bigger and red.
static func _fight_track(bs: BattleStage, hb: float) -> void:
	if bs.gauntlet != "":
		_depth_track(bs, hb)
		return
	var f: Font = Kit.font("cinzel", 800)
	bs.draw_string(f, Vector2(30, hb * 0.5 - 2.0), str(bs._raid.get("raidTitle", "")), HORIZONTAL_ALIGNMENT_LEFT, -1, 19, Color(BattleLook.CREAM, 0.96))
	var cur: int = int(bs.b["fight"])
	var of: int = int(Battle.fight_at(bs._raid, cur)["of"])
	var y: float = hb * 0.5 + 15.0
	bs.draw_line(Vector2(36, y), Vector2(36 + (of - 1) * 22.0, y), Color(1, 1, 1, 0.14), 1.5)
	for k: int in of:
		var c: Vector2 = Vector2(36 + k * 22.0, y)
		var boss: bool = Battle.fight_at(bs._raid, k)["boss"] == true
		var s: float = 6.5 if boss else 5.0
		var rim: Color = BattleLook.FOE if boss else Color(1, 1, 1, 0.35)
		if k < cur:
			BattleLook.knot(bs, c, s, Color(BattleLook.CREAM, 0.7), rim)
		elif k == cur:
			BattleLook.knot(bs, c, s + 2.0, BattleLook.FOE if boss else BattleLook.GOLD, rim)
		else:
			BattleLook.knot(bs, c, s, Color(0, 0, 0, 0.4), Color(BattleLook.FOE if boss else Color(1, 1, 1, 0.35), 0.8))
	bs.draw_string(Kit.font("karla", 800), Vector2(36 + (of - 1) * 22.0 + 16.0, y + 4.0), "FIGHT %d OF %d" % [cur + 1, of], HORIZONTAL_ALIGNMENT_LEFT, -1, 10, BattleLook.MUTED)


## The turn strip: who acts in what order this round, the one acting lit.
static func _draw_strip(bs: BattleStage, right: Vector2) -> void:
	if bs._strip.is_empty():
		return
	var n: int = bs._strip.size()
	var gap: float = 72.0
	var x0: float = right.x - (n - 1) * gap - 26.0
	bs.draw_line(Vector2(x0, right.y), Vector2(x0 + (n - 1) * gap, right.y), Color(1, 1, 1, 0.14), 1.5)
	var cf: Font = Kit.font("karla", 800)
	for k: int in n:
		var who: int = bs._strip[k]
		var c: Vector2 = Vector2(x0 + k * gap, right.y)
		var lit: bool = who == bs._strip_lit
		var rad: float = 17.0 if lit else 14.0
		if lit:
			bs.draw_arc(c, rad + 5.0, 0.0, TAU, 40, Color(BattleLook.GOLD, 0.95), 2.0, true)
		var nm: String
		if who < 0:
			var fj: int = -1 - who
			var fe: Dictionary = Battle.foes(bs.b)[mini(fj, Battle.foes(bs.b).size() - 1)]
			nm = str(fe["name"])
			BattleLook.medallion(bs, c, rad, bs._foe_tex[fj] if fj < bs._foe_tex.size() else bs._portrait, BattleLook.FOE, nm.substr(0, 1), 0.4 if not Battle.foe_up(fe) else 1.0, Vector2(0.5, 0.27), 0.25)
		else:
			var st: Dictionary = bs.b["seats"][who]
			nm = "You" if bs.table != null and who == bs.me else str(st["name"])
			BattleLook.medallion(bs, c, rad, bs._face(who), BattleLook.ALLY, str(st["name"]).substr(0, 1), 0.45 if (st.get("sunk", false) or st.get("fled", false)) else 1.0, Vector2(0.5, 0.5), 0.5)
		if nm.length() > 10:
			nm = nm.substr(0, 9) + "."
		BattleLook.say(bs, cf, c.x, c.y + rad + 14.0, nm, 10, BattleLook.CREAM if lit else BattleLook.MUTED)


## A ship's order for the round, under its plate while the crew plan: what it
## will do, where its aim landed (a critical in gold: half a crossfire), and a
## crew order with who it is for. "Choosing" until it is in.
static func _order_chip(bs: BattleStage, at: Vector2, s: Dictionary, beside: bool = false) -> void:
	var pl: Dictionary = Js.obj(Js.obj(bs._latest.get("plans")).get(s.get("key")))
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
			if bs._field():
				txt += " at %s" % Battle.foes(bs.b)[maxi(0, Battle.target_of(bs.b, pl))]["name"]
		var ab: Dictionary = Js.obj(pl.get("ability"))
		if not ab.is_empty():
			for c: Dictionary in s["crew"]:
				if c["id"] == ab["crew"]:
					txt += "  +  %s's %s" % [c["name"], BattleStageDeck._order_label(bs, c)]
			var ti: int = int(Js.nz(ab.get("target"), -1.0))
			if ti >= 0 and ti < (bs.b["seats"] as Array).size() and bs.b["seats"][ti] != s:
				txt += " for %s" % ("you" if ti == bs.me else str(bs.b["seats"][ti]["name"]))
	var f: Font = Kit.font("karla", 800)
	var w: float = f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x + (40.0 if kind != "" else 24.0)
	var r: Rect2 = Rect2(at - Vector2(w / 2.0 - 8.0, 0), Vector2(w, 24)) if not beside else Rect2(at, Vector2(w, 24))
	BattleLook.draw_box(bs, r, BattleLook.box(Color(BattleLook.LACQUER, 0.94), Color(BattleLook.GOLD, 0.95) if crit else Color(0, 0, 0, 0), 1 if crit else 0, 12))
	var tx: float = r.position.x + 12.0
	if kind != "":
		BattleLook.icon(bs, kind, Vector2(r.position.x + 16.0, r.get_center().y), 7.0, BattleLook.GOLD if crit else BattleLook.CREAM)
		tx = r.position.x + 30.0
	bs.draw_string(f, Vector2(tx, r.position.y + 16.5), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, BattleLook.GOLD if crit else (BattleLook.CREAM if kind != "" else BattleLook.MUTED))


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


## A slim tag over a hull in frames mode: its name and a thin bar of its hull.
static func _hull_tag(bs: BattleStage, at: Vector2, nm: String, share: float, col: Color, lit: bool, alpha: float) -> void:
	if alpha <= 0.05:
		return
	var f: Font = Kit.font("karla", 800)
	BattleLook.say(bs, f, at.x, at.y, nm, 12, Color(BattleLook.GOLD if lit else BattleLook.CREAM, alpha), 5)
	var r: Rect2 = Rect2(at + Vector2(-45, 6), Vector2(90, 5))
	BattleLook.draw_box(bs, r.grow(1.0), BattleLook.box(Color(0, 0, 0, 0.6 * alpha), Color(0, 0, 0, 0), 0, 3))
	BattleLook.draw_box(bs, Rect2(r.position, Vector2(maxf(3.0, r.size.x * clampf(share, 0.0, 1.0)), r.size.y)), BattleLook.box(Color(col, alpha), Color(0, 0, 0, 0), 0, 2.5))


static func _role_name(bs: BattleStage, e: Dictionary) -> String:
	return str(Js.obj(Battle.roles_cfg().get(str(e.get("role", "")))).get("name", ""))


## THE MARK OF A RAID BEATEN: a gold seal slams down mid-screen (a thump, a
## ring of light), "RAID CLEARED" over it and the tier under it; the first
## clear of that tier says so on a ribbon, with a burst of gold.
static func _stamp(bs: BattleStage, tier: String, first: bool, line: String = "") -> void:
	var st: Stamp = Stamp.new()
	st.tier = { "normal": "Normal", "coop": "Co-op", "coopc": "Co-op Challenge" }.get(tier, "Normal")
	st.first = first
	st.line = line
	# One headline at a time: the banner gives way to the Stamp.
	bs._banner_t = -1.0
	bs._banner.modulate.a = 0.0
	bs._say_queue.clear()
	bs.add_child(st)
	Sound.impact(true)
	Sound.seal(true)
	if first:
		Sound.chest(true)
	Rumble.buzz([0, 70, 40, 50])


class Stamp:
	extends Control
	var tier: String = ""
	var first: bool = false
	## The boss's last line (bossDefeatedText), under the tier.
	var line: String = ""
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
		draw_rect(Rect2(Vector2.ZERO, size), Color(Kit.SCRIM_BASE, 0.62 * a))
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
		# Flat: a gold disc and a dark check, no highlight or shadow.
		draw_circle(Vector2.ZERO, r, Color(BattleLook.GOLD.darkened(0.12), a))
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
		if line != "":
			BattleLook.say(self, Kit.font("karla", 700), c.x, c.y + (190.0 if first else 156.0), line, 17, Color(BattleLook.CREAM, 0.92 * a), 6)


static func _depth_track(bs: BattleStage, hb: float) -> void:
	var run: Dictionary = Js.obj(bs._latest.get("run"))
	var d: int = int(Js.num(bs.b.get("depth")))
	var band: Dictionary = Gauntlet.band(maxi(1, d), bs.gauntlet)
	bs.draw_string(Kit.font("cinzel", 800), Vector2(30, hb * 0.5 - 2.0), str(Gauntlet.NAMES.get(bs.gauntlet, "")), HORIZONTAL_ALIGNMENT_LEFT, -1, 19, Color(BattleLook.CREAM, 0.96))
	var line: String = "DEPTH %d  ·  %s  ·  %s ⟡ IN THE POT" % [d, str(band.get("name", "")).to_upper(), Js.thousands(Js.num(run.get("pot")))]
	var nc: int = Js.obj(run.get("curses")).size()
	if nc > 0:
		line += "  ·  %d CURSE%s" % [nc, "" if nc == 1 else "S"]
	if str(run.get("mode", "solo")) == "coop":
		line += "  ·  CO-OP"
	bs.draw_string(Kit.font("karla", 800), Vector2(32, hb * 0.5 + 19.0), line, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(str(band.get("accent", "#cccccc"))).lerp(BattleLook.MUTED, 0.3))


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
		Motion.ease_fade(create_tween(), self, "_a", 1.0, 0.35)

	func leave() -> void:
		var tw: Tween = create_tween()
		Motion.ease_fade(tw, self, "_a", 0.0, 0.4)
		tw.tween_callback(queue_free)

	## The dark band behind the call: one vertical gradient, soft at its
	## edges (not stacked strips).
	static var _band: GradientTexture2D

	static func band_tex() -> GradientTexture2D:
		if _band == null:
			var g: Gradient = Gradient.new()
			g.offsets = PackedFloat32Array([0.0, 0.12, 0.88, 1.0])
			g.colors = PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 1), Color(1, 1, 1, 1), Color(1, 1, 1, 0)])
			_band = GradientTexture2D.new()
			_band.gradient = g
			_band.width = 1
			_band.height = 64
			_band.fill_from = Vector2(0, 0)
			_band.fill_to = Vector2(0, 1)
		return _band

	func _process(_d: float) -> void:
		queue_redraw()

	func _draw() -> void:
		var vp: Vector2 = size
		var c: Vector2 = Vector2(vp.x / 2.0, vp.y * 0.36)
		var acc: Color = Color(str(band.get("accent", "#cccccc")))
		draw_texture_rect(band_tex(), Rect2(0, c.y - 110, vp.x, 220), false, Color(0, 0, 0, 0.42 * _a))
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
