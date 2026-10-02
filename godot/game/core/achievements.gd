class_name Achievements
extends RefCounted
## ACHIEVEMENTS (Kong, 2026-10-02: "a RuneScape-style achievement point
## system; badges should not pay out doubloons and inflate the economy").
##
## A badge pays nothing but its points (1 rookie to 5 grandmaster, the web's
## BADGE_POINTS). Points add up, and captain COLOURS unlock at point
## milestones (port_rules achievements.colors): colours come from nowhere
## else (Kong: "skin colours only come from achievements"), save the four a
## new captain chooses from.
##
## Each badge here is one the port's systems can earn, checked against the
## state the save already keeps (a badge is earned on state, not on a moment,
## so one missed in the past is granted the next time anything is checked).
## Badges for systems not yet ported are not listed. sweep() runs after every
## action (RulesApi.run), not under the parity run.


static func _cfg() -> Dictionary:
	return Js.obj(Rules.data().get("achievements"))


## Every badge the port lists: the web's badge with any port wording laid
## over it, and its points.
static func defs() -> Array:
	var over: Dictionary = Js.obj(_cfg().get("badgeText"))
	var pts: Dictionary = Rules.data()["badgePoints"]
	var out: Array = []
	for b: Dictionary in Js.list(Rules.data().get("badges")):
		if not CHECKED.has(b["id"]):
			continue
		var d: Dictionary = b.duplicate()
		if over.has(b["id"]):
			d.merge(over[b["id"]], true)
		d["points"] = float(pts.get(b["id"], 0.0))
		out.append(d)
	return out


## The ids checked here (and so listed).
const CHECKED: Array = [
	"prestige_i", "trophy_catch", "unbroken", "relentless", "untouchable", "dead_eye", "master_angler", "zone_legend", "prestige_stars",
	"two_for_the_pot", "saltlung", "crate_digger", "half_the_sea", "ancient_ones", "full_collection",
	"completionist_rod", "fully_rigged", "reforged", "baby_steps", "deep_pockets", "bilge_baron",
	"got_away", "reel_lucky", "two_fisted", "sure_shot", "salted_through", "hundred_fins", "friend_at_sea",
	"wet_behind_ears", "beginners_luck", "struck_gold", "old_hand", "crate_expectations", "a_real_keeper", "full_stringer",
	"fresh_coat", "twice_the_haul", "menagerie", "fishmonger", "crack_shot", "wreck_diver", "salvage_rights", "high_water_mark",
	"fish_baron", "hoard_of_gold", "in_the_flow", "eagle_eyed", "el_dorado", "full_drydock", "trophy_hunter", "full_tackle_box",
	"three_for_three", "standing_watch", "old_reliable", "the_fourth_task",
	"back_to_the_dark", "twice_landed", "six_abreast", "struck_in_gold", "deep_remembers", "the_long_vigil",
	"known_face", "whole_road", "you_remembered", "bearing_gifts", "good_company", "trusted_three", "open_hand", "thick_as_thieves", "salt_of_the_earth",
	"first_ashore", "beachcomber", "others_came_before", "far_rocks", "every_last_rock",
	"wake_behind_you", "home_waters", "no_blank_spaces",
	"first_spade", "six_feet_down", "salted_away",
]
## Granted where they happen, not from state (the moment is the badge).
const MOMENTS: Array = ["full_collection", "completionist_rod", "reforged", "back_to_the_dark", "you_remembered"]


## Has this captain earned this badge, by what the save holds now?
static func earned(id: String, db: CaptainStore, uid: String) -> bool:
	var p: Dictionary = db.me(uid)
	var n: Callable = func(col: String) -> float: return Js.num(p.get(col))
	var lvl: int = Rules.level_from_xp(n.call("fishing_xp"))
	match id:
		"master_angler": return lvl >= 100
		"wet_behind_ears": return lvl >= 25
		"old_hand": return lvl >= 50
		"unbroken": return n.call("highest_perfect_streak") >= 10
		"relentless": return n.call("highest_perfect_streak") >= 15
		"untouchable": return n.call("highest_perfect_streak") >= 20
		"in_the_flow": return n.call("highest_perfect_streak") >= 30
		"sure_shot": return n.call("total_perfects") >= 250
		"dead_eye": return n.call("total_perfects") >= 1000
		"crack_shot": return n.call("total_perfects") >= 2500
		"eagle_eyed": return n.call("total_perfects") >= 5000
		"saltlung": return n.call("fishing_casts") >= 1000
		"salted_through": return n.call("fishing_casts") >= 10000
		"beginners_luck": return n.call("fishing_crates_opened") >= 1
		"crate_digger": return n.call("fishing_crates_opened") >= 50
		"crate_expectations": return n.call("fishing_crates_opened") >= 250
		"wreck_diver": return n.call("fishing_crates_opened") >= 500
		"salvage_rights": return n.call("fishing_crates_opened") >= 1000
		"two_for_the_pot": return n.call("fishing_double_catches") >= 1
		"two_fisted": return n.call("fishing_double_catches") >= 100
		"twice_the_haul": return n.call("fishing_double_catches") >= 500
		"trophy_catch": return n.call("trophy_size_catches") >= 1
		"a_real_keeper": return n.call("trophy_size_catches") >= 10
		"trophy_hunter": return n.call("trophy_size_catches") >= 25
		"reel_lucky": return n.call("fishing_jackpots") >= 1
		"got_away": return n.call("fishing_snags") >= 50
		"half_the_sea": return _species(p) >= 50
		"hundred_fins": return _species(p) >= 100
		"ancient_ones": return Js.list(p.get("ancient_catches")).size() >= 6
		"struck_gold": return _goldens(db) >= 1
		"hoard_of_gold": return _goldens(db) >= 10
		"el_dorado": return _goldens(db) >= 25
		"friend_at_sea": return Js.list(p.get("unlocked_pets")).size() >= 1
		"full_stringer": return Js.list(p.get("unlocked_pets")).size() >= 3
		"menagerie": return Js.list(p.get("unlocked_pets")).size() >= 5
		"fresh_coat": return Js.list(p.get("unlocked_boats")).size() >= 1
		"full_drydock": return _all_boats(p)
		"baby_steps": return n.call("doubloons") >= 100000.0
		"deep_pockets": return n.call("doubloons") >= 1000000.0
		"bilge_baron": return n.call("doubloons") >= 2500000.0
		"fishmonger": return n.call("fish_sold_doubloons") >= 250000.0
		"fish_baron": return n.call("fish_sold_doubloons") >= 1000000.0
		"fully_rigged": return Js.list(p.get("completionist_effects")).size() >= 3
		"full_tackle_box": return _all_rods(db, uid)
		"prestige_i": return _prestige(p).any(func(v: float) -> bool: return v >= 1.0)
		"high_water_mark": return _prestige(p).any(func(v: float) -> bool: return v >= 5.0)
		"zone_legend": return _prestige(p).size() >= 4 and _prestige(p).all(func(v: float) -> bool: return v >= 1.0)
		"prestige_stars": return _prestige(p).size() >= 4 and _prestige(p).all(func(v: float) -> bool: return v >= 5.0)
		"three_for_three": return n.call("daily_challenge_sweeps") >= 7
		"standing_watch": return n.call("daily_challenge_sweeps") >= 30
		"old_reliable": return n.call("daily_challenge_sweeps") >= 100
		"the_fourth_task": return n.call("daily_master_cleared") >= 25
		"twice_landed", "six_abreast", "struck_in_gold", "deep_remembers", "the_long_vigil":
			var v: Dictionary = Vigil.state_for(p.get("ancient_vigil"), p.get("ancient_catches"))
			var ranks: Array = []
			for k: Variant in v:
				ranks.append(float((v[k] as Dictionary)["rank"]))
			match id:
				"twice_landed": return ranks.any(func(r: float) -> bool: return r >= 2.0)
				"struck_in_gold": return ranks.any(func(r: float) -> bool: return r >= 5.0)
				"six_abreast": return ranks.size() >= 6 and ranks.all(func(r: float) -> bool: return r >= 3.0)
				"the_long_vigil": return ranks.size() >= 6 and ranks.all(func(r: float) -> bool: return r >= 5.0)
				_: return Vigil.total(v) >= 20.0
		"known_face", "whole_road", "bearing_gifts", "good_company", "trusted_three", "open_hand", "thick_as_thieves", "salt_of_the_earth":
			var rows: Array = Js.list(db.save.get("rapport"))
			var tiers: Array = []
			var gifts: float = 0.0
			for r: Dictionary in rows:
				tiers.append(Folk.tier_for(Js.num(r.get("points"))))
				gifts += Js.num(r.get("gifts_given"))
			var at_least: Callable = func(t: int) -> int: return tiers.filter(func(x: int) -> bool: return x >= t).size()
			match id:
				"known_face": return at_least.call(1) >= 1
				"whole_road": return rows.size() >= Folk.roster().size()
				"bearing_gifts": return gifts >= 25.0
				"open_hand": return gifts >= 100.0
				"good_company": return at_least.call(2) >= 5
				"trusted_three": return at_least.call(3) >= 3
				"thick_as_thieves": return at_least.call(4) >= 1
				_: return at_least.call(4) >= Folk.roster().size()
		"first_ashore", "beachcomber", "far_rocks", "every_last_rock", "others_came_before":
			var found: Array = Js.list(db.save.get("discoveries"))
			var landed: int = 0
			var notes: int = 0
			var all_notes: int = 0
			for i: Dictionary in Rules.data()["isles"]:
				if i["kind"] == "note":
					all_notes += 1
				if Js.includes(found, i["id"]):
					landed += 1
					if i["kind"] == "note":
						notes += 1
			match id:
				"first_ashore": return landed >= 1
				"beachcomber": return landed >= 10
				"far_rocks": return landed >= 20
				"every_last_rock": return landed >= (Rules.data()["isles"] as Array).size()
				_: return notes >= all_notes
		"wake_behind_you", "home_waters", "no_blank_spaces":
			var f: float = Explore.fog_progress(Explore.fog_decode(p.get("sea_explored")))
			return f >= { "wake_behind_you": 0.25, "home_waters": 0.6, "no_blank_spaces": 0.9 }[id]
		# The treasure hunts (core/clues.gd) took the digs' badges.
		"first_spade": return n.call("clues_done") >= 1
		"six_feet_down": return n.call("clues_done") >= 10
		"salted_away":
			var by: Dictionary = Js.obj(p.get("clues_by_tier"))
			for t: String in Clues.TIERS:
				if Js.num(by.get(t)) < 1.0:
					return false
			return true
	return false


static func _species(p: Dictionary) -> int:
	return maxi(int(Js.num(p.get("lifetime_species_count"))), Js.list(p.get("lifetime_species")).size())


static func _goldens(db: CaptainStore) -> int:
	return Js.list(db.save.get("shinies")).size()


static func _prestige(p: Dictionary) -> Array:
	var out: Array = []
	var pl: Dictionary = Js.obj(p.get("prestige_levels"))
	for z: String in ["shallows", "open_waters", "deep", "abyss"]:
		if pl.has(z):
			out.append(Js.num(pl[z]))
	return out


static func _all_boats(p: Dictionary) -> bool:
	var owned: Array = Js.list(p.get("unlocked_boats"))
	for b: Dictionary in Rules.data()["boats"]:
		if not Js.includes(owned, b["id"]):
			return false
	return true


## Every rod a shop sells (not the Captain's), held.
static func _all_rods(db: CaptainStore, uid: String) -> bool:
	var held: Array = db.held_rod_tiers(uid)
	var shop: Dictionary = Rules.data()["rodShop"]
	for k: Variant in shop:
		if int(k) == 0 or (shop[k] as Dictionary).get("captainRod") == true:
			continue
		if not Js.includes(held, float(int(k))):
			return false
	return true


## Grant whatever is earned and not yet held, and the colours the points now
## reach. The new ones, in list order (a colour as "color:<id>").
static func sweep(db: CaptainStore, uid: String) -> Array:
	if Rules.web_only or _cfg().is_empty():
		return []
	var have: Array = Js.list(db.me(uid).get("unlocked_badges"))
	var out: Array = []
	for id: String in CHECKED:
		if MOMENTS.has(id) or Js.includes(have, id):
			continue
		if earned(id, db, uid):
			db.grant_badge(uid, id)
			out.append(id)
	# The colours the points have reached.
	var owned: Array = Js.list(db.me(uid).get("unlocked_character_colors"))
	for c: Variant in colors_for(db.achievement_points(uid)):
		if not Js.includes(owned, c):
			db.add_to_list(uid, "unlocked_character_colors", c)
			out.append("color:%s" % c)
	return out


## The captain's points.
static func points(db: CaptainStore, uid: String) -> float:
	return db.achievement_points(uid)


## The colour milestones: [[points, colour id], ...], lowest first.
static func colors() -> Array:
	return Js.list(_cfg().get("colors"))


## The colours these points have earned.
static func colors_for(points_now: float) -> Array:
	var out: Array = []
	for m: Array in colors():
		if points_now >= float(m[0]):
			out.append(m[1])
	return out


## The next colour still to earn: [points, id] or [].
static func next_color(points_now: float) -> Array:
	for m: Array in colors():
		if points_now < float(m[0]):
			return m
	return []
