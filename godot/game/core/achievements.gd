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
		if not (CHECKED.has(b["id"]) or EXPEDITION.has(b["id"]) or EXP_MOMENTS.has(b["id"])):
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
	if EXPEDITION.has(id):
		return _exp(id, db, uid)
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
	for id: String in CHECKED + EXPEDITION:
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


# ══ The expedition side and the rest (2026-10-04) ══════════════════════════════
#
# The badges for the systems ported since the first list: crew, voyages,
# trawls, Finn's jobs, raids and challenges, the ship, the Sunken Hand's
# spoils, the forge, the gauntlets, the Chart Room, the Parlor, the Den, crew
# skins, bounties and the campaign's fog. Conditions are the web's
# (lib/badgeConditions.ts) read off the port's own records. Cut with their
# systems: the Captain tier, the Hardcore Gauntlet and Davy's Terms, Blood
# Gems, the Exchange.

const EXPEDITION: Array = [
	"navigator", "master_navigator", "complete_captain",
	"growing_crew", "full_muster", "crewmaster", "leviathan_hall", "fully_outfitted", "legendary_recruit", "three_legends",
	"six_legends", "theres_a_grave", "old_salt", "full_complement", "deep_cut", "divine_hand", "six_divine",
	"maiden_voyage", "old_sea_dog", "fleet_admiral", "massive_booty",
	"first_haul", "steady_nets", "deep_trawler", "net_positive",
	"one_upped", "finns_rival", "the_better_angler",
	"corsairs_bane", "ghost_ship", "cartographers_fall", "toll_paid", "ruse_undone", "account_settled", "blockade_broken",
	"don_drowned", "finndicates_bane", "the_sunken_hand", "one_last_ride", "cut_off_at_the_wrist", "the_long_quiet",
	"swift_reckoning", "quick_draw", "opening_salvo", "hard_hitter", "heavy_broadside", "overkill",
	"ship_of_the_line", "mark_of_mastery", "weapon_of_legend", "six_aboard", "expanded_armory", "colours_of_the_hand",
	"dons_ghost_hull_won", "the_sixth_mount",
	"salvors_claim", "both_hands", "ancient_tackle", "something_old", "both_in_hand", "waking_it", "fully_attuned",
	"first_fusion", "grand_forgemaster", "abyssal_smith", "abyssal_master", "forge_awakened",
	"into_the_deep", "davy_jones", "first_descent", "abyssward", "forge_worthy", "davys_doorstep", "fathomless", "fathom_hoarder",
	"well_provisioned", "locker_raider", "master_of_the_locker", "push_your_luck", "again_and_again", "one_shot", "one_true_shot",
	"greeds_price", "storm_reader", "deep_cartographer", "first_convergence", "dons_descent", "dons_doorstep", "dons_reckoning",
	"ghost_armory",
	"quartermaster", "den_magnate", "the_long_watch", "landfall", "uncharted_no_more", "master_cartographer",
	"parlor_hot_hand", "parlor_sharpshooter", "parlor_flawless", "parlor_cardsharp", "parlor_kingpin", "parlor_legend",
	"colors_raised", "dressed_to_the_nines", "the_chase", "fashionista", "full_wardrobe",
	"first_bounty", "fifty_orders", "full_board", "seven_boards", "elite_order", "bounty_hoard",
	"into_the_fog", "fog_burned_off",
	"roof_of_your_own", "the_longhouse", "the_great_hall", "the_estate", "name_on_the_chart", "furnished", "every_comfort", "gallery_hung",
]
## Granted where they happen (the moment is the badge), on the expedition side
## and in the rooms.
const EXP_MOMENTS: Array = [
	"catfish_jackpot", "called_it", "unstoppable", "stacked_deck", "fully_laden", "clean_manifest", "crowned", "throne_in_sight",
	"all_hands_legends", "iron_ruse", "tight_quarters", "dead_reckoning", "not_a_shot_fired",
	"ultimate_only", "weight_of_green", "untouched", "clean_sweep",
]
const BASE_LEGENDS: Array = ["catfish", "doby_mick", "mako", "dole", "coelacanth"]
const CHALLENGES: Array = ["corsairs_reckoning_challenge", "captain_krust_challenge", "cartographer_challenge", "tollmasters_cut_challenge",
	"coffers_fleet_challenge", "the_quartermaster_challenge", "the_blockade_challenge", "the_throne_challenge"]


static func _slug(c: Dictionary) -> String:
	return str(Crew.card(float(c["card_id"])).get("slug", "")).to_lower()


static func _held_eye(p: Dictionary) -> bool:
	return p.get("has_anglers_patience") == true or Js.list(p.get("raid_items")).has("anglers_patience")


static func _held_maw(p: Dictionary) -> bool:
	return Js.list(p.get("raid_items")).has("borrowed_jaw") or p.get("finn_spoil_free") == "nav" or p.get("finn_spoil_paid") == "nav"


static func _confluences_seen(p: Dictionary) -> int:
	var seen: Array = Js.list(p.get("gauntlet_confluences_seen"))
	return Js.list(Gauntlet.t().get("confluences")).filter(func(c: Dictionary) -> bool: return seen.has(c["id"])).size()


static func _exp(id: String, db: CaptainStore, uid: String) -> bool:
	var p: Dictionary = db.me(uid)
	var n: Callable = func(col: String) -> float: return Js.num(p.get(col))
	var nav: int = Loadout.nav_level_from_xp(n.call("expedition_xp"))
	var crew: Array = Js.list(db.save.get("crew"))
	var voyages: int = Js.list(db.save.get("voyages")).filter(func(v: Dictionary) -> bool: return v.get("status") == "revealed").size()
	var clears: Array = Js.list(db.save.get("raidClears"))
	var skins: Array = Js.list(p.get("owned_crew_skins"))
	var hulls: Array = Js.list(p.get("owned_ship_skins"))
	var items: Array = Js.list(p.get("raid_items"))
	match id:
		"navigator": return nav >= 50
		"master_navigator": return nav >= 100
		"complete_captain": return nav >= 100 and Rules.level_from_xp(n.call("fishing_xp")) >= 100
		"growing_crew": return n.call("lifetime_recruits") >= 25
		"full_muster": return n.call("lifetime_recruits") >= 100
		"crewmaster": return n.call("crew_hall_tier") >= 5
		"leviathan_hall": return n.call("crew_hall_tier") >= 6
		"fully_outfitted": return float(Js.nz(p.get("crew_drill_level"), 1.0)) >= 6.0 and float(Js.nz(p.get("crew_stores_level"), 1.0)) >= 6.0
		"legendary_recruit": return crew.any(func(c: Dictionary) -> bool: return ["catfish", "doby_mick", "mako"].has(_slug(c)))
		"three_legends", "six_legends":
			var got: Dictionary = {}
			for c: Dictionary in crew:
				if BASE_LEGENDS.has(_slug(c)):
					got[_slug(c)] = true
			return got.size() >= (3 if id == "three_legends" else BASE_LEGENDS.size())
		"theres_a_grave": return crew.any(func(c: Dictionary) -> bool: return c.get("died_at") != null)
		"old_salt": return crew.any(func(c: Dictionary) -> bool: return Crew.level(Js.num(c.get("xp"))) >= 100)
		"full_complement": return Crew.live(db).filter(func(c: Dictionary) -> bool: return Crew.level(Js.num(c.get("xp"))) >= 100).size() >= 10
		"deep_cut": return Crew.live(db).any(func(c: Dictionary) -> bool: return Bunks.net_trait(Js.list(c.get("effects"))).has(4.0))
		"divine_hand", "six_divine":
			var d: int = Crew.live(db).filter(func(c: Dictionary) -> bool: return Crew.trait_label(Js.list(c.get("effects"))) == "Divine").size()
			return d >= (1 if id == "divine_hand" else 6)
		"maiden_voyage": return voyages >= 1
		"old_sea_dog": return voyages >= 50
		"fleet_admiral": return voyages >= 100
		"massive_booty": return n.call("voyage_booty_hauls") >= 1
		"first_haul": return n.call("trawls_collected") >= 1
		"steady_nets": return n.call("trawls_collected") >= 25
		"deep_trawler": return n.call("trawls_collected") >= 100
		"net_positive": return n.call("trawls_collected") >= 500
		"one_upped": return Js.list(p.get("finn_quests_done")).size() >= 6
		"finns_rival": return Js.list(p.get("finn_quests_done")).size() >= 18
		"the_better_angler": return Js.list(p.get("finn_quests_done")).size() >= 32
		"corsairs_bane": return db.has_cleared(uid, "corsairs_reckoning_challenge")
		"ghost_ship": return db.has_cleared(uid, "captain_krust_challenge")
		"cartographers_fall": return db.has_cleared(uid, "cartographer_challenge")
		"toll_paid": return db.has_cleared(uid, "tollmasters_cut_challenge")
		"ruse_undone": return db.has_cleared(uid, "coffers_fleet_challenge")
		"account_settled": return db.has_cleared(uid, "the_quartermaster_challenge")
		"blockade_broken": return db.has_cleared(uid, "the_blockade_challenge")
		"don_drowned": return db.has_cleared(uid, "the_throne_challenge")
		"finndicates_bane": return CHALLENGES.slice(0, 4).all(func(r: String) -> bool: return db.has_cleared(uid, r))
		"the_sunken_hand": return CHALLENGES.all(func(r: String) -> bool: return db.has_cleared(uid, r))
		"one_last_ride": return db.has_cleared(uid, "the_sunken_hand")
		"cut_off_at_the_wrist": return db.has_cleared(uid, "the_sunken_hand_challenge")
		"the_long_quiet": return Js.list(Js.obj(p.get("raid_node_progress")).get("cleared")).has("the_long_quiet")
		"swift_reckoning": return clears.any(func(c: Dictionary) -> bool: return c["raid_id"] == "corsairs_reckoning" and c.get("ms") != null and float(c["ms"]) <= 90000.0)
		"quick_draw": return clears.any(func(c: Dictionary) -> bool: return not str(c["raid_id"]).contains("@") and c.get("ms") != null and float(c["ms"]) <= 60000.0)
		"opening_salvo": return n.call("highest_raid_damage") >= 50
		"hard_hitter": return n.call("highest_raid_damage") >= 100
		"heavy_broadside": return n.call("highest_raid_damage") >= 250
		"overkill": return n.call("highest_raid_damage") >= 500
		"ship_of_the_line": return n.call("ship_tier") >= 6
		"mark_of_mastery": return Js.obj(p.get("ship_classes")).values().any(func(v: Variant) -> bool: return str(v).ends_with("_iii") or str(v).contains("_iii_"))
		"weapon_of_legend": return Js.truthy(p.get("manowar_augment"))
		"six_aboard": return p.get("has_sixth_berth") == true
		"expanded_armory": return p.get("has_armory_expansion") == true
		"colours_of_the_hand": return ["sunken_hand_hull", "drowned_giant_hull", "last_cast_hull"].all(func(h: String) -> bool: return hulls.has(h))
		"dons_ghost_hull_won": return hulls.has("dons_ghost_hull")
		"the_sixth_mount":
			var eq: Array = Js.list(p.get("equipped_raid_items"))
			var normal: int = eq.filter(func(i: Variant) -> bool: return Armory.item(str(i)).get("finaleSlotOnly") != true).size()
			return Armory.finale_mount(p) and eq.any(func(i: Variant) -> bool: return Armory.item(str(i)).get("finaleSlotOnly") == true) and normal >= Armory.slots(p) and normal + 1 >= 6
		"salvors_claim": return Js.truthy(p.get("finn_spoil_free")) or Js.truthy(p.get("finn_spoil_paid"))
		"both_hands": return Js.truthy(p.get("finn_spoil_free")) and Js.truthy(p.get("finn_spoil_paid"))
		"ancient_tackle", "something_old": return _held_eye(p) or _held_maw(p)
		"both_in_hand": return _held_eye(p) and _held_maw(p)
		"waking_it", "fully_attuned":
			var tier: int = 0
			if _held_eye(p):
				tier = Rules.finn_item_level(n.call("anglers_patience_xp"))
			if _held_maw(p):
				tier = maxi(tier, Rules.finn_item_level(n.call("borrowed_jaw_xp")))
			return tier >= (3 if id == "waking_it" else (Rules.data()["finn"]["thresholds"] as Array).size())
		"first_fusion": return n.call("raid_items_forged") >= 1
		"grand_forgemaster": return Js.list(p.get("forge_recipes_learned")).size() >= Forge.recipes().size()
		"abyssal_smith", "abyssal_master":
			var t3: Array = Forge.recipes().filter(func(r: Dictionary) -> bool: return int(Js.nz(r.get("tier"), 2.0)) == 3)
			var have: Array = t3.filter(func(r: Dictionary) -> bool: return items.has(r["result"]))
			return have.size() >= (1 if id == "abyssal_smith" else t3.size())
		"forge_awakened": return Gauntlet.owns(p, "forge")
		"into_the_deep": return n.call("gauntlet_deepest") >= 5
		"davy_jones": return n.call("gauntlet_deepest") >= 10
		"first_descent": return n.call("gauntlet_deepest") >= 1
		"abyssward": return n.call("gauntlet_deepest") >= 20
		"forge_worthy": return n.call("gauntlet_deepest") >= 35
		"davys_doorstep": return n.call("gauntlet_deepest") >= 60
		"fathomless": return n.call("gauntlet_fathoms") >= 500
		"fathom_hoarder": return n.call("gauntlet_fathoms_earned") >= 1000
		"well_provisioned": return Js.list(p.get("gauntlet_upgrades")).size() >= 1
		"locker_raider": return Js.list(p.get("gauntlet_upgrades")).size() >= 6
		"master_of_the_locker": return Gauntlet.upgrades_for("davy").all(func(u: Dictionary) -> bool: return Js.list(p.get("gauntlet_upgrades")).has(u["id"]))
		"push_your_luck", "again_and_again":
			var runs: float = n.call("gauntlet_runs_completed") + n.call("gauntlet_runs_sunk") + n.call("dons_gauntlet_runs_completed") + n.call("dons_gauntlet_runs_sunk")
			return runs >= (10.0 if id == "push_your_luck" else 50.0)
		"one_shot": return n.call("gauntlet_max_hit") >= 2000
		"one_true_shot": return n.call("gauntlet_max_hit") >= 4000
		"greeds_price": return n.call("gauntlet_deepest_died") > n.call("gauntlet_deepest")
		"storm_reader": return _confluences_seen(p) >= 1
		"deep_cartographer": return _confluences_seen(p) >= Js.list(Gauntlet.t().get("confluences")).size()
		"first_convergence": return Js.list(Gauntlet.t().get("convergences")).any(func(c: Dictionary) -> bool: return Js.list(p.get("gauntlet_confluences_seen")).has(c["id"]))
		"dons_descent": return n.call("dons_gauntlet_deepest") >= 1
		"dons_doorstep": return n.call("dons_gauntlet_deepest") >= 50
		"dons_reckoning": return n.call("dons_gauntlet_deepest") >= 75
		"ghost_armory": return Gauntlet.DON_ITEMS.all(func(i: String) -> bool: return items.has(i))
		"quartermaster": return n.call("puzzle_points") >= 40
		"den_magnate": return n.call("puzzle_points") >= 80
		"the_long_watch": return n.call("puzzle_points") >= 500
		"landfall": return Js.list(p.get("charting_landmarks_claimed")).size() >= 1
		"uncharted_no_more": return Js.list(p.get("charting_landmarks_claimed")).size() >= 7
		"master_cartographer": return Js.list(p.get("charting_landmarks_claimed")).size() >= 13
		"parlor_hot_hand": return n.call("parlor_best_streak") >= 5
		"parlor_sharpshooter": return n.call("parlor_best_streak") >= 10
		"parlor_flawless": return n.call("parlor_best_streak") >= 20
		"parlor_cardsharp": return n.call("parlor_points") >= 85
		"parlor_kingpin": return n.call("parlor_points") >= 520
		"parlor_legend": return n.call("parlor_points") >= 1000
		"colors_raised": return skins.size() >= 1
		"dressed_to_the_nines": return skins.size() >= 10
		"the_chase": return Skins.all().any(func(k: Dictionary) -> bool: return k.get("chase", false) and skins.has(k["id"]))
		"fashionista": return Js.obj(p.get("equipped_crew_skins")).size() >= 5
		"full_wardrobe":
			for k: Dictionary in Skins.all():
				if k.get("chase", false) and Skins.for_slug(str(k["slug"])).all(func(s: Dictionary) -> bool: return skins.has(s["id"])):
					return true
			return false
		"first_bounty": return n.call("bounties_claimed") >= 1
		"fifty_orders": return n.call("bounties_claimed") >= 50
		"full_board": return n.call("bounty_boards_cleared") >= 1
		"seven_boards": return n.call("bounty_boards_cleared") >= 7
		"elite_order": return n.call("bounty_elites_claimed") >= 1
		# The web's 5,000 gems from bounties, in the port's doubloons (x 100).
		"bounty_hoard": return n.call("bounty_doubloons_earned") >= 500000
		"roof_of_your_own", "the_longhouse", "the_great_hall", "the_estate", "name_on_the_chart", "furnished", "every_comfort", "gallery_hung":
			var h: Dictionary = Homestead.of(db)
			var every: int = 0
			for f: Dictionary in Homestead.data()["furniture"]:
				every += (f["options"] as Array).size()
			match id:
				"roof_of_your_own": return int(h["house"]) >= 1
				"the_longhouse": return int(h["house"]) >= 2
				"the_great_hall": return int(h["house"]) >= 3
				"the_estate": return int(h["house"]) >= (Homestead.data()["house"] as Array).size() - 1
				"name_on_the_chart": return str(Js.nz(h.get("name"), "")).strip_edges() != ""
				"furnished": return (h["owned"] as Array).size() >= 10
				"every_comfort": return (h["owned"] as Array).size() >= every
				_: return (h["pinned"] as Array).size() >= int(Homestead.data()["pinnedMax"])
		"into_the_fog": return Explore.xfog_progress(Explore.xfog_decode(p.get("sea_explored_exp"))) >= 0.5
		"fog_burned_off": return Explore.xfog_progress(Explore.xfog_decode(p.get("sea_explored_exp"))) >= 0.9
	return false
