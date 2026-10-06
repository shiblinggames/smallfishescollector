class_name Forge
extends RefCounted
## THE FORGE (Godot port, redesigned with Kong 2026-10-04; the web's
## forgeRaidItem / learnForgeRecipe / the Abyssal Accelerator are the base).
## One anvil at the forge island; raid items are held as copies.
##
## DISCOVERY, not a toll: two items on the anvil either take to each other (the
## recipe goes into the book for good, no forging needed to learn it) or they
## do not (the pair is remembered, never tested twice). Fathoms buy RECIPE
## NOTES: one part of an undiscovered recipe that uses something you hold.
## FORGING a discovered recipe takes ONE copy of each part. The tier-3 Abyssal
## recipes need the Don's Abyssal Forge.
##
## TEMPERING: a spare copy and scrap raise an item to +1, +2, +3 (every copy
## held shares the grade); each grade adds a tenth to the item's BONUS part
## (tempered_effects). SALVAGE breaks a copy you do not need into scrap (never
## the last copy of a mounted item). TRANSMUTING (the Accelerator, folded in;
## the Don's "dg_abyssal_accel"): an epic boss item, a second copy of itself and
## scrap make its legendary at once.
##
## The recipes are content/rules.json "forgeRecipes". On the profile:
## forge_recipes_learned (discovered), forge_tried (pairs that would not
## take), forge_notes { result: part }, raid_item_grades { id: grade },
## forge_scrap.

const NOTE_COST: float = 60.0
const TEMPER_SCRAP: Array = [10.0, 25.0, 50.0]
const MAX_GRADE: int = 3
const GRADE_STEP: float = 0.10
const SALVAGE: Dictionary = { "rare": 5.0, "epic": 10.0, "legendary": 25.0, "ancient": 40.0 }
const TRANSMUTE_SCRAP: float = 25.0
const EPIC_TO_LEGENDARY: Dictionary = {
	"corsair_cannon": "corsair_prime_cannon", "krusts_carapace": "captains_carapace",
	"cartographers_astrolabe": "captains_astrolabe", "spets_primer": "tollmasters_primer",
	"tell_tale_glass": "admirals_eye", "war_drum": "thunder_drum", "court_fang": "dons_signet",
	"chain_shot": "brackwater_rack",
}
## Effects that are switched on or off, which a grade does not touch.
const FLAGS: Array = ["lethal_save", "ambush_each_phase", "pierce_crit", "ward_refill_on_save", "crit_ramp_turns"]
## Multipliers under 1 that are a cost, not a bonus.
const DOWNSIDES: Array = ["noncrit_damage_mult"]


static func recipes() -> Array:
	return Js.list(Rules.data().get("forgeRecipes"))


static func recipe(result: String) -> Dictionary:
	for r: Dictionary in recipes():
		if r["result"] == result:
			return r
	return {}


static func has_forge(p: Dictionary) -> bool:
	return Gauntlet.owns(p, "forge")


static func has_abyssal(p: Dictionary) -> bool:
	return has_forge(p) and Gauntlet.owns(p, "dg_abyssal_forge")


static func has_transmute(p: Dictionary) -> bool:
	return has_abyssal(p) and Gauntlet.owns(p, "dg_abyssal_accel")


static func counts(list: Array) -> Dictionary:
	var out: Dictionary = {}
	for id: Variant in list:
		out[str(id)] = int(out.get(str(id), 0)) + 1
	return out


static func grade_of(p: Dictionary, id: String) -> int:
	return int(Js.num(Js.obj(p.get("raid_item_grades")).get(id)))


static func pair_key(a: String, b: String) -> String:
	return "%s|%s" % [a, b] if a <= b else "%s|%s" % [b, a]


static func _match(a: String, b: String) -> Dictionary:
	for r: Dictionary in recipes():
		var c: Array = r["components"]
		if c.size() == 2 and ((c[0] == a and c[1] == b) or (c[0] == b and c[1] == a)):
			return r
	return {}


## An item's effects at a grade: each grade adds GRADE_STEP of the bonus part
## (a 1.20 multiplier, +0.02 a grade; a 30% chance, +3%); a cost and an on/off
## effect stay as they are; a chance never passes 1.
static func tempered_effects(effects: Array, grade: int) -> Array:
	if grade <= 0:
		return effects
	var k: float = 1.0 + GRADE_STEP * float(grade)
	var out: Array = []
	for e: Dictionary in effects:
		var t: String = str(e["type"])
		var v: float = float(e["value"])
		var n: float = v
		if FLAGS.has(t) or DOWNSIDES.has(t):
			n = v
		elif t.ends_with("_mult"):
			n = 1.0 + (v - 1.0) * k
		else:
			n = v * k
			if t.ends_with("_chance"):
				n = minf(1.0, n)
		out.append({ "type": t, "value": snappedf(n, 0.0001) })
	return out


## Take one copy; false if none is held.
static func _take(db: CaptainStore, uid: String, id: String) -> bool:
	var held: Array = Js.list(db.me(uid).get("raid_items")).duplicate()
	var i: int = held.find(id)
	if i < 0:
		return false
	held.remove_at(i)
	db.update_profile(uid, { "raid_items": held })
	return true


static func _give(db: CaptainStore, uid: String, id: String) -> void:
	var held: Array = Js.list(db.me(uid).get("raid_items")).duplicate()
	held.append(id)
	db.update_profile(uid, { "raid_items": held })


## After copies leave: an item no longer held comes off the mounts and loses
## its grade.
static func _tidy(db: CaptainStore, uid: String) -> void:
	var p: Dictionary = db.me(uid)
	var held: Array = Js.list(p.get("raid_items"))
	var grades: Dictionary = Js.obj(p.get("raid_item_grades")).duplicate()
	for id: Variant in grades.keys():
		if not held.has(id):
			grades.erase(id)
	db.update_profile(uid, {
		"equipped_raid_items": Js.list(p.get("equipped_raid_items")).filter(func(id: Variant) -> bool: return held.has(id)),
		"raid_item_grades": grades,
	})


static func _scrap(db: CaptainStore, uid: String, n: float) -> void:
	db.update_profile(uid, { "forge_scrap": Js.num(db.me(uid).get("forge_scrap")) + n })


# ── The anvil ────────────────────────────────────────────────────────────────

## Two items on the anvil: a recipe found (and booked), a transmutation, or a
## pair that will not take (remembered).
static func try_pair(db: CaptainStore, uid: String, a: String, b: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	if not has_forge(p):
		return { "error": "The Forge is locked. Unlock it in the Davy Jones Gauntlet's Locker." }
	if a == b and EPIC_TO_LEGENDARY.has(a):
		if not has_transmute(p):
			return { "fused": false, "kind": "transmute_locked", "result": EPIC_TO_LEGENDARY[a] }
		return { "fused": true, "kind": "transmute", "result": EPIC_TO_LEGENDARY[a] }
	var r: Dictionary = _match(a, b)
	if r.is_empty():
		if not Js.list(p.get("forge_tried")).has(pair_key(a, b)):
			db.add_to_list(uid, "forge_tried", pair_key(a, b))
		return { "fused": false, "kind": "none" }
	if int(Js.nz(r.get("tier"), 2.0)) == 3 and not has_abyssal(p):
		return { "fused": false, "kind": "abyssal_locked" }
	var fresh: bool = not Js.list(p.get("forge_recipes_learned")).has(r["result"])
	if fresh:
		db.add_to_list(uid, "forge_recipes_learned", r["result"])
		db.bump_stat(uid, "forge_recipes_found", 1.0)
	return { "fused": true, "kind": "recipe", "result": r["result"], "discovered": fresh }


static func forge(db: CaptainStore, uid: String, result: String) -> Dictionary:
	var r: Dictionary = recipe(result)
	if r.is_empty():
		return { "error": "Unknown recipe." }
	var p: Dictionary = db.me(uid)
	if not has_forge(p):
		return { "error": "The Forge is locked." }
	if int(Js.nz(r.get("tier"), 2.0)) == 3 and not has_abyssal(p):
		return { "error": "Only the Abyssal Forge can fuse that." }
	if not Js.list(p.get("forge_recipes_learned")).has(result):
		return { "error": "Put the parts on the anvil first to find the recipe." }
	var need: Dictionary = counts(r["components"])
	var have: Dictionary = counts(Js.list(p.get("raid_items")))
	for id: String in need:
		if int(have.get(id, 0)) < int(need[id]):
			return { "error": "You don't hold every part yet." }
	for id: Variant in r["components"]:
		_take(db, uid, str(id))
	_give(db, uid, result)
	_tidy(db, uid)
	db.bump_stat(uid, "raid_items_forged", 1.0)
	return { "ok": true, "result": result }


static func transmute(db: CaptainStore, uid: String, epic: String) -> Dictionary:
	var legend: String = str(EPIC_TO_LEGENDARY.get(epic, ""))
	if legend == "":
		return { "error": "That item can't be transmuted." }
	var p: Dictionary = db.me(uid)
	if not has_transmute(p):
		return { "error": "Transmuting is locked. Unlock the Abyssal Accelerator in the Don's Locker." }
	if int(counts(Js.list(p.get("raid_items"))).get(epic, 0)) < 2:
		return { "error": "Transmuting takes two copies of it." }
	if Js.num(p.get("forge_scrap")) < TRANSMUTE_SCRAP:
		return { "error": "Transmuting takes %d scrap." % int(TRANSMUTE_SCRAP) }
	_scrap(db, uid, -TRANSMUTE_SCRAP)
	_take(db, uid, epic)
	_take(db, uid, epic)
	_give(db, uid, legend)
	_tidy(db, uid)
	return { "ok": true, "result": legend }


## A recipe note: one part of an undiscovered recipe that uses something held.
static func buy_note(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	if not has_forge(p):
		return { "error": "The Forge is locked." }
	var held: Array = Js.list(p.get("raid_items"))
	var found: Array = Js.list(p.get("forge_recipes_learned"))
	var notes: Dictionary = Js.obj(p.get("forge_notes"))
	var open: Array = recipes().filter(func(r: Dictionary) -> bool:
		return not found.has(r["result"]) and not notes.has(r["result"]) \
			and (int(Js.nz(r.get("tier"), 2.0)) < 3 or has_abyssal(p)) \
			and Js.list(r["components"]).any(func(c: Variant) -> bool: return held.has(c)))
	if open.is_empty():
		return { "error": "Nothing left to hint at with what you hold." }
	if db.spend(uid, "gauntlet_fathoms", NOTE_COST) == null:
		return { "error": "A note costs %d Fathoms." % int(NOTE_COST) }
	var r: Dictionary = open[int(Dice.next() * open.size())]
	var c: Array = r["components"]
	# Name the part they do NOT hold if there is one: that is the news.
	var part: String = str(c[1]) if held.has(c[0]) and not held.has(c[1]) else str(c[0]) if held.has(c[1]) and not held.has(c[0]) else str(c[0])
	var other: String = str(c[1]) if part == str(c[0]) else str(c[0])
	notes = notes.duplicate()
	notes[r["result"]] = { "part": part, "with": other }
	db.update_profile(uid, { "forge_notes": notes })
	return { "ok": true, "result": r["result"], "part": part, "with": other }


# ── Your items: tempering and salvage ─────────────────────────────────────────

## Whether a grade changes anything (a drum's power is its beat, not a bonus).
static func temperable(id: String) -> bool:
	var base: Array = Armory.effects_of(id)
	return tempered_effects(base, 1) != base


static func temper(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	if not has_forge(p):
		return { "error": "The Forge is locked." }
	if not temperable(id):
		return { "error": "Tempering cannot strengthen this one." }
	var g: int = grade_of(p, id)
	if g >= MAX_GRADE:
		return { "error": "It is tempered as far as it goes." }
	if int(counts(Js.list(p.get("raid_items"))).get(id, 0)) < 2:
		return { "error": "Tempering takes a spare copy of it." }
	var cost: float = float(TEMPER_SCRAP[g])
	if Js.num(p.get("forge_scrap")) < cost:
		return { "error": "Tempering to +%d takes %d scrap." % [g + 1, int(cost)] }
	_scrap(db, uid, -cost)
	_take(db, uid, id)
	var grades: Dictionary = Js.obj(db.me(uid).get("raid_item_grades")).duplicate()
	grades[id] = float(g + 1)
	db.update_profile(uid, { "raid_item_grades": grades })
	return { "ok": true, "grade": g + 1 }


static func salvage(db: CaptainStore, uid: String, id: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	if not has_forge(p):
		return { "error": "The Forge is locked." }
	var it: Dictionary = Armory.item(id)
	var worth: float = float(SALVAGE.get(str(it.get("rarity", "")), 0.0))
	if worth <= 0.0:
		return { "error": "That one cannot be broken down." }
	var n: int = int(counts(Js.list(p.get("raid_items"))).get(id, 0))
	if n < 1:
		return { "error": "You don't hold that." }
	if n == 1 and Js.list(p.get("equipped_raid_items")).has(id):
		return { "error": "It is mounted and it is your last. Take it off first." }
	_take(db, uid, id)
	_scrap(db, uid, worth)
	_tidy(db, uid)
	return { "ok": true, "scrap": worth }


# ── The bench, read ──────────────────────────────────────────────────────────

static func state(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var held: Dictionary = counts(Js.list(p.get("raid_items")))
	var found: Array = Js.list(p.get("forge_recipes_learned"))
	var book: Array = []
	for r: Dictionary in recipes():
		if not found.has(r["result"]):
			continue
		var parts: Array = []
		var ready: bool = true
		var need: Dictionary = counts(r["components"])
		for id: Variant in r["components"]:
			parts.append({ "id": id, "held": int(held.get(str(id), 0)) })
			if int(held.get(str(id), 0)) < int(need[str(id)]):
				ready = false
		var tier: int = int(Js.nz(r.get("tier"), 2.0))
		book.append({ "result": r["result"], "tier": tier, "parts": parts, "ready": ready and (tier < 3 or has_abyssal(p)) })
	var undiscovered: int = recipes().filter(func(r: Dictionary) -> bool: return not found.has(r["result"])).size()
	return {
		"forge": has_forge(p), "abyssal": has_abyssal(p), "transmute": has_transmute(p),
		"fathoms": Js.num(p.get("gauntlet_fathoms")), "scrap": Js.num(p.get("forge_scrap")),
		"held": held, "grades": Js.obj(p.get("raid_item_grades")), "mounted": Js.list(p.get("equipped_raid_items")),
		"book": book, "undiscovered": undiscovered, "total": recipes().size(),
		"notes": Js.obj(p.get("forge_notes")), "tried": Js.list(p.get("forge_tried")),
	}


# ── Effects, in words ─────────────────────────────────────────────────────────

const _PCT_UP: Dictionary = {
	"boss_damage_mult": "damage to bosses", "nonboss_damage_mult": "damage to escorts", "crit_damage_mult": "critical damage",
	"afflicted_damage_mult": "damage to burning, frozen or weakened ships", "first_shot_mult": "damage on your first shot",
	"max_hp_mult": "hull", "avenge_elite_mult": "damage once an elite is down", "fire_damage_mult": "Fire damage",
	"volley_damage_mult": "Volley damage", "mega_damage_mult": "Mega damage",
}
const _CHANCE: Dictionary = {
	"burn_chance": "chance to set them burning", "freeze_chance": "chance to freeze them", "parry_chance": "chance to parry a hit",
	"first_blow_parry_chance": "chance to parry the first blow", "charge_on_hit_chance": "chance a hit loads a charge",
	"reload_charge_chance": "chance a reload loads a spare charge", "start_charge_chance": "chance to start with a charge",
	"extra_start_charge_chance": "chance to start with an extra charge", "crit_strip_charge": "chance a critical strips an enemy charge",
	"dodge_pierce_chance": "chance to hit through a dodge", "crit_upgrade_chance": "chance a hit turns critical",
	"crit_spread_chance": "chance a critical splashes the rack", "weaken_on_hit": "chance a hit weakens them",
	"corrode_on_hit": "chance a hit corrodes them", "feeble_on_hit": "chance a hit leaves them feeble",
	"crit_charge_refund_chance": "chance a critical refunds its charge",
}


static func effect_line(e: Dictionary) -> String:
	var t: String = str(e["type"])
	var v: float = float(e["value"])
	if _PCT_UP.has(t):
		return "+%s%% %s" % [_n((v - 1.0) * 100.0), _PCT_UP[t]]
	if _CHANCE.has(t):
		return "%s%% %s" % [_n(v * 100.0), _CHANCE[t]]
	match t:
		"incoming_damage_mult": return "-%s%% damage taken" % _n((1.0 - v) * 100.0)
		"noncrit_damage_mult": return "-%s%% damage on ordinary hits" % _n((1.0 - v) * 100.0)
		"ramp_damage_per_turn": return "+%s%% damage every turn the fight goes on" % _n(v * 100.0)
		"lifesteal_pct": return "Heals %s%% of the damage you deal" % _n(v * 100.0)
		"ward_pct": return "A ward worth %s%% of your hull" % _n(v * 100.0)
		"ward_refill_pct": return "The ward refills %s%% each turn" % _n(v * 100.0)
		"parry_reflect_pct": return "A parry sends back %s%% of the hit" % _n(v * 100.0)
		"max_hit_pct": return "No single hit takes more than %s%% of your hull" % _n(v * 100.0)
		"max_hit_chance": return "%s%% chance that cap holds" % _n(v * 100.0)
		"speed_roll_nav_pct": return "+%s%% of your crew's Navigation to speed" % _n(v * 100.0)
		"lethal_save": return "Survives one lethal hit a fight"
		"ambush_each_phase": return "A free shot at the start of each boss phase"
		"pierce_crit": return "Criticals hit through a dodge"
		"ward_refill_on_save": return "The ward refills when you survive a lethal hit"
		"crit_ramp_turns": return "Each critical adds to the next"
	return t.replace("_", " ")


static func _n(x: float) -> String:
	var r: float = snappedf(x, 0.1)
	return str(int(r)) if is_equal_approx(r, round(r)) else str(r)


## An item's lines at a grade.
static func lines(id: String, grade: int = 0) -> Array:
	return tempered_effects(Armory.effects_of(id), grade).map(func(e: Dictionary) -> String: return effect_line(e))
