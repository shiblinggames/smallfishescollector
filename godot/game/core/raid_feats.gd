class_name RaidFeats
extends RefCounted
## THE RAID FEAT BADGES (the web's RaidGame / RaidCombat moments): what one
## captain did over a raid, read off the battle's events as they are played,
## and the badges it earns when the raid is cleared.
##   iron_ruse         the Admiral Ruse raid (coffers_fleet) taking no damage
##   tight_quarters    the Quartermaster raid using no crew order
##   dead_reckoning    the Cartographer raid with every shot a critical
##   not_a_shot_fired  a boss fight won without a shot or a crew order
##   all_hands_legends a raid in the Man-o-War with five Level 100 legendaries
## A tracker is a Dictionary kept by the battle stage (solo) or the raid table
## (each captain's seat).


static func fresh() -> Dictionary:
	return { "hurt": false, "orders": false, "shots": 0, "noncrit": false, "fight": -1, "fShots": 0, "fOrders": 0, "bossFree": false }


## A round's events, for the captain at `seat`, in fight `fight`.
static func feed(st: Dictionary, ev: Array, seat: int, fight: int) -> void:
	if int(st["fight"]) != fight:
		st["fight"] = fight
		st["fShots"] = 0
		st["fOrders"] = 0
	for x: Dictionary in ev:
		match str(x.get("t", "")):
			"shot":
				if int(Js.nz(x.get("seat"), -1.0)) == seat:
					st["shots"] = int(st["shots"]) + 1
					st["fShots"] = int(st["fShots"]) + 1
					if str(x.get("aim", "")) != "critical":
						st["noncrit"] = true
			"ability":
				if int(Js.nz(x.get("seat"), -1.0)) == seat:
					st["orders"] = true
					st["fOrders"] = int(st["fOrders"]) + 1
			"eShot":
				if int(Js.nz(x.get("target"), -1.0)) == seat and Js.num(x.get("dmg")) > 0.0 and x.get("dodged") != true:
					st["hurt"] = true
			"flareHit":
				if int(Js.nz(x.get("seat"), -1.0)) == seat and Js.num(x.get("dmg")) > 0.0:
					st["hurt"] = true


## A fight won: a boss's with no shot and no order is the feat.
static func fight_won(st: Dictionary, boss: bool) -> void:
	if boss and int(st["fShots"]) == 0 and int(st["fOrders"]) == 0:
		st["bossFree"] = true


## The raid cleared: the feats it earned, granted (the grant skips one held).
static func grant(db: CaptainStore, uid: String, raid_id: String, st: Dictionary) -> Array:
	if Rules.web_only:
		return []
	var got: Array = []
	var base: String = raid_id.trim_suffix("_challenge")
	if base == "coffers_fleet" and not st["hurt"]:
		got.append("iron_ruse")
	if base == "the_quartermaster" and not st["orders"]:
		got.append("tight_quarters")
	if base == "cartographer" and int(st["shots"]) > 0 and not st["noncrit"]:
		got.append("dead_reckoning")
	if st["bossFree"]:
		got.append("not_a_shot_fired")
	var p: Dictionary = db.me(uid)
	if Hulls.tier_of(p) >= 6:
		var legends: int = Crew.live(db).filter(func(c: Dictionary) -> bool:
			return c.get("raid_slot") != null and Crew.level(Js.num(c.get("xp"))) >= 100 \
				and Achievements.BASE_LEGENDS.has(str(Crew.card(float(c["card_id"])).get("slug", "")).to_lower())).size()
		if legends >= 5:
			got.append("all_hands_legends")
	var out: Array = []
	for id: String in got:
		if not Js.list(db.me(uid).get("unlocked_badges")).has(id):
			db.grant_badge(uid, id)
			out.append(id)
	if not out.is_empty():
		db.save["badges_new"] = Js.list(db.save.get("badges_new")) + out
	return out
