extends RefCounted
## Part of BattleStage (game/battle_stage.gd): a gauntlet's own staging: the
## descent, the depth called, the between-fights moments (GauntletMoments)
## before each sheet, where the party rides, the deep's wash and the dive's
## water.
## Split out of game/battle_stage.gd on 2026-10-10 for size. Static helpers
## taking the stage (bs) first; every piece of the fight's state stays on it.

const BattleStageHud = preload("res://game/battle_stage_hud.gd")


## Each new depth, called over the water: its number, the band of the deep,
## the host's voice; a boss or an elite waiting; the Don rising.
## The descent, on the water: the spiral under the party, then the depth.
static func _descend(bs: BattleStage) -> void:
	var dn: Dictionary = Js.obj(bs._latest.get("descent"))
	if bs._moments != null and bs._moments._pieces.has("fence"):
		bs._moments.fence_leave()
	if bs._moments != null and bs._moments._pieces.has("launch"):
		bs._moments.launch_leave()
	if dn.is_empty() or bs._moments == null or bs.autoplay:
		return
	var d: int = int(Js.num(dn.get("depth")))
	var band: Dictionary = Gauntlet.band(maxi(1, d), bs.gauntlet)
	await bs._moments.descent(_party_center(bs), d, Color(str(band.get("accent", "#9fc4e0"))))


## The sheet steps aside while a moment plays on the water.
static func _sheet_aside(bs: BattleStage) -> void:
	if bs._ov != null:
		bs._ov_phase = ""
		bs._ov.show_state({})


## Across the water from the party, where the enemy stood (a set piece's spot).
static func _ahead(bs: BattleStage) -> Vector2:
	if not bs._foe_pos.is_empty():
		return bs._foe_pos[0]
	return bs.sea._boat.position + Vector2(620, -40)


## Where the party rides, the middle of its hulls.
static func _party_center(bs: BattleStage) -> Vector2:
	var sum: Vector2 = Vector2.ZERO
	var n: int = (bs.b["seats"] as Array).size()
	for i: int in n:
		sum += bs._seat_at(i)
	return sum / float(maxi(1, n))


## Every hull of the party on the water (yours first).
static func _party_hulls(bs: BattleStage) -> Array:
	var out: Array = [bs.sea._boat]
	for i: int in (bs.b["seats"] as Array).size():
		if i != bs.me:
			var m: Shipmate = bs._mate_of(i)
			if m != null:
				out.append(m)
	return out


## A between-fights moment, staged before its sheet: once each, per depth.
static func _stage(bs: BattleStage, cur: Dictionary) -> void:
	if bs._moments == null or bs.autoplay:
		return
	var ph: String = str(cur.get("phase", ""))
	var depth: int = int(Js.num(bs.b.get("depth")))
	if ph != "fence" and bs._moments._pieces.has("fence"):
		bs._moments.fence_leave()
	if not ph in ["contract", "jobResult"] and bs._moments._pieces.has("launch"):
		bs._moments.launch_leave()
	if ph != "shrine" and bs._moments._pieces.has("shrine"):
		_sheet_aside(bs)
		var sh: Dictionary = Js.obj(cur.get("shrine")) if cur.has("shrine") else Js.obj(cur.get("lastShrine"))
		await bs._moments.shrine_answer(Js.obj(Js.obj(sh.get("picks")).get(bs.my_key)), bs._seat_at(bs.me))
	var key: String = "%s:%d" % [ph, depth]
	if bs._staged.has(key):
		return
	bs._staged[key] = true
	if ph in ["shrine", "fence", "haul", "dead", "curse", "contract", "breather"]:
		_sheet_aside(bs)
	match ph:
		"shrine":
			await bs._moments.shrine_rise(_ahead(bs) + Vector2(-60, 40))
		"fence":
			await bs._moments.fence_arrive(_ahead(bs) + Vector2(-20, 20))
		"curse":
			await bs._moments.curse(_party_center(bs), Color(str(Gauntlet.band(maxi(1, depth), bs.gauntlet).get("accent", "#9a6ad0"))))
		"contract":
			await bs._moments.launch_arrive(_ahead(bs) + Vector2(-60, 120))
		"breather":
			await bs._moments.breather(_party_center(bs))
		"haul":
			await bs._moments.homeward(_party_center(bs), _party_hulls(bs))
		"dead":
			await bs._moments.drowned(_party_hulls(bs))


static func _depth_call(bs: BattleStage) -> void:
	var dn: Dictionary = Js.obj(bs._latest.get("descent"))
	if dn.is_empty():
		return
	SteamLayer.presence("#Gauntlet", { "gauntlet": str(Gauntlet.NAMES.get(bs.gauntlet, "The gauntlet")), "depth": str(int(Js.num(dn.get("depth")))) })
	if bs.gauntlet != "":
		bs.sea.water_theme = _water_theme(bs, dn)
	var dc: BattleStageHud.DepthCall = BattleStageHud.DepthCall.new()
	dc.depth = int(Js.num(dn.get("depth")))
	dc.band = Js.obj(dn.get("band"))
	dc.taunt = str(dn.get("taunt", ""))
	dc.rise = Js.obj(dn.get("rise"))
	dc.note = "Something holds this water." if dn.get("boss", false) else ("A hunter waits below." if dn.get("elite", false) else "")
	if int(Js.num(dn.get("ships"))) > 1:
		dc.note = ("%s  " % dc.note if dc.note != "" else "") + "%d ships." % int(dn["ships"])
	dc.don = bs.gauntlet == "don"
	bs.add_child(dc)
	if dn.get("apex", false) or dn.get("boss", false):
		Sound.horn()
	var hold: float = 4.2 if dn.get("apex", false) else (3.0 if dc.taunt != "" else 1.8)
	await bs._wait(hold if not bs.autoplay else 0.4)
	dc.leave()


## The deep's wash on an enemy's hull.
static func _wash(bs: BattleStage, e: Dictionary) -> Color:
	match str(e.get("wash", "")):
		"davy": return Color(0.78, 0.84, 0.86)
		"don": return Color(0.72, 0.92, 0.74)
	return Color.WHITE


## A dive's water, as the web's arena graded it (arenaTheme): the descent's
## own sea (Davy's cold teal-grey, the Don's kraken green),
## falling toward black the deeper the dive, heavier for a boss, the Don's
## rise the darkest green of all; the world's light tinted to match.
static func _water_theme(bs: BattleStage, dn: Dictionary) -> Dictionary:
	var d: int = int(Js.num(dn.get("depth", bs.b.get("depth", 1))))
	var l: Dictionary = DeepLook.look(bs.gauntlet, maxi(1, d), dn.get("boss", false) == true, dn.get("apex", false) == true)
	if bs._atmos != null:
		bs._atmos.set_look(l)
	return l
