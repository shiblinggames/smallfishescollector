class_name Trawls
extends RefCounted
## TRAWLS (Godot port of lib/core/voyages.ts getTrawlState, deployTrawl and
## collectTrawl, lib/trawlRules.ts and fishing/trawls/constants.ts): send ONE
## hand to fish a water for a hard-locked run of SEA DAYS (Kong, 2026-10-04:
## "trawls will follow in game days"; a sea day is SeaClock.CYCLE_MS, 48
## minutes): one in the Shallows, two in Open Waters, the Deep and the Abyss,
## four in the Ancient Deep, the nearest whole days to the web's 68 to 180
## minutes. The haul scales by the new run over the web's, so what a trawl
## earns an hour is the web's exactly. Collect for fishing XP (their Savvy) and
## doubloons (their Fortune). One trawl per water; up to four at once, each
## slot behind a Fishing AND a Navigation level. Sending a hand takes them out
## of their seat; a hand on a voyage or mid-stint in a bunk cannot go.
##
## Kept in the save as "trawls": [{ id, zone, crew_id, ends_ms }].

const ZONES: Array = [
	{ "key": "shallows", "label": "Shallows", "minLevel": 4, "activeXpHr": 2000.0, "activeDblHr": 1300.0, "durationMin": 68.0, "seaDays": 1 },
	{ "key": "open_waters", "label": "Open Waters", "minLevel": 18, "activeXpHr": 5000.0, "activeDblHr": 2100.0, "durationMin": 83.0, "seaDays": 2 },
	{ "key": "deep", "label": "Deep", "minLevel": 33, "activeXpHr": 11000.0, "activeDblHr": 2850.0, "durationMin": 98.0, "seaDays": 2 },
	{ "key": "abyss", "label": "Abyss", "minLevel": 53, "activeXpHr": 19000.0, "activeDblHr": 5800.0, "durationMin": 117.0, "seaDays": 2, "xpPct": 0.29 },
	{ "key": "ancient_deep", "label": "Ancient Deep", "minLevel": 78, "activeXpHr": 42000.0, "activeDblHr": 5400.0, "durationMin": 180.0, "seaDays": 4, "xpPct": 0.24 },
]
const UNLOCK_LEVEL: int = 25
const SLOT_LADDER: Array = [[25, 0], [45, 20], [70, 45], [90, 50]]
const XP_PCT: float = 0.35
const DBL_PCT: float = 0.15
const STAT_REF: float = 40.0
const FACTOR_FLOOR: float = 0.2
const MULT_MIN: float = 0.8
const MULT_MAX: float = 1.2

const BUMPERS: Dictionary = {
	"slim": ["Slim Haul", "Quiet waters today.", "#9a958c"],
	"normal": ["", "", "#f0c040"],
	"good": ["Good Haul", "The nets came back heavy.", "#7fd49a"],
	"bumper": ["Bumper Haul", "The nets came back full!", "#5ec8e8"],
	"jackpot": ["Jackpot Haul", "A once-in-a-voyage catch!", "#c4a0ff"],
}

const EVENTS: Dictionary = {
	"jackpot": [
		"Your crew hauled up a sunken galleon's strongbox, still locked and heavy with gold.",
		"A giant squid surfaced, dropped a chest it had been hoarding, and slipped back into the dark.",
		"The nets snagged a merchant wreck's whole payroll, coins and all.",
		"A whale breached clean over the deck and rained half the sea into the hold.",
		"Your crew followed a lone gull to a reef no chart has ever marked.",
		"They found the honey hole. The nets nearly tore loose from the weight of it.",
		"A mermaid took a shine to the cook and pointed the crew straight to the motherlode.",
		"Your crew won a kraken's hoard in a game of cards and didn't stick around to gloat.",
		"A waterspout dropped a wriggling fortune right into the open hold.",
		"The tide rolled in silver by the thousand, with a little gold besides.",
	],
	"bumper": [
		"A whole school swam into the nets like they had somewhere to be.",
		"The crew found a feeding frenzy and rode it until the hold groaned.",
		"Fat tuna all morning. Nobody aboard is complaining.",
		"The nets came up so full the crew had to bail just to stay afloat.",
		"A pod of dolphins herded the catch right to the boat, the show-offs.",
		"Warm sun, flat sea, and fish practically queueing to come aboard.",
		"Your crew trawled clean over a sunken pier swarming with the things.",
		"The bait was perfect today. The fish filed a complaint, then got caught anyway.",
		"A deckhand sang a shanty so fine the fish surfaced to listen.",
	],
	"good": [
		"Steady nets, steady fins, a good morning's work.",
		"Nothing flashy, just a reliably heavy haul.",
		"The crew read the current right and it paid them back.",
		"A clean run. The fish cooperated for once in their lives.",
		"Fair weather and willing fish. It adds up.",
		"The crew found a good patch and had the sense to stay put.",
		"A tidy haul, and the cook's already eyeing the biggest one.",
	],
	"normal": [
		"An honest day's trawl. Nothing to write the captain about.",
		"The crew did their job and came home for supper.",
		"Fish were biting, then they weren't. An average sort of day.",
		"Nets in, nets out, a bit of everything in between.",
		"A respectable hold and a crew already asking what's for dinner.",
		"Some came, some didn't. Fair is fair.",
		"The usual. The sea gave what it felt like giving.",
		"Quiet shift. One deckhand swears the big one got away.",
	],
	"slim": [
		"A kraken spooked half the catch clean out of the nets.",
		"The crew spent most of the cycle arguing about lunch.",
		"A gull made off with the bait. All of it. Brazenly.",
		"The fish unionised and refused to cooperate.",
		"Your crew got into a staring contest with a grouper and lost track of the day.",
		"Choppy water, tangled nets, and a great deal of swearing.",
		"The crew swears they saw a sea serpent and rowed the other way.",
		"Somebody forgot to actually lower the nets for a good hour.",
		"The fish were biting somewhere else entirely. Typical.",
		"A whale settled on the net for a nap. The crew waited. The whale won.",
		"Half the crew got seasick. The other half found it hilarious.",
	],
}


static func zone(key: String) -> Dictionary:
	for z: Dictionary in ZONES:
		if z["key"] == key:
			return z
	return {}


static func unlocked_slots(fishing: int, nav: int) -> int:
	var n: int = 0
	for s: Array in SLOT_LADDER:
		if fishing >= int(s[0]) and nav >= int(s[1]):
			n += 1
		else:
			break
	return n


static func next_slot(fishing: int, nav: int) -> Array:
	var have: int = unlocked_slots(fishing, nav)
	return SLOT_LADDER[have] if have < SLOT_LADDER.size() else []


static func stat_factor(stat: float) -> float:
	return maxf(FACTOR_FLOOR, minf(1.0, stat / STAT_REF))


## How long a run is, in milliseconds (its sea days).
static func run_ms(key: String) -> float:
	return float(zone(key).get("seaDays", 1)) * SeaClock.CYCLE_MS


static func expected(key: String, savvy: float, fortune: float) -> Dictionary:
	var z: Dictionary = zone(key)
	# The web's haul per cycle, scaled to the run in sea days.
	var scale: float = run_ms(key) / (float(z["durationMin"]) * 60000.0)
	return {
		"xp": float(Js.round(float(z["activeXpHr"]) * float(z.get("xpPct", XP_PCT)) * stat_factor(savvy) * scale)),
		"doubloons": float(Js.round(float(z["activeDblHr"]) * DBL_PCT * stat_factor(fortune) * scale)),
	}


static func roll_mult(fortune: float) -> float:
	var base: float = (Dice.next() + Dice.next()) / 2.0
	var shift: float = (minf(40.0, fortune) / 40.0) * 0.15 - 0.05
	return MULT_MIN + (MULT_MAX - MULT_MIN) * clampf(base + shift, 0.0, 1.0)


static func bumper_for(mult: float) -> String:
	if mult >= 1.17:
		return "jackpot"
	if mult >= 1.10:
		return "bumper"
	if mult >= 1.04:
		return "good"
	if mult <= 0.90:
		return "slim"
	return "normal"


## A hand as a trawler: Savvy is their levelled Navigation (dodge) with trait,
## Fortune likewise, each at least 1.
static func crew_view(c: Dictionary) -> Dictionary:
	var st: Dictionary = Crew.leveled_stats(c)
	var card: Dictionary = Crew.card(Js.num(c.get("card_id")))
	return {
		"id": c["id"], "name": str(Js.nz(c.get("nickname"), Crew.display_name(str(card.get("slug", "")), str(card.get("name", "Crew"))))),
		"filename": str(card.get("filename", "")), "savvy": float(st["dodge"]), "fortune": float(st["fortune"]),
		"level": Crew.level(Js.num(c.get("xp"))), "inRaidParty": c.get("raid_slot") != null,
	}


static func _out(db: CaptainStore) -> Array:
	if not (db.save.get("trawls") is Array):
		db.save["trawls"] = []
	return db.save["trawls"]


static func _ancient_open(db: CaptainStore, uid: String, p: Dictionary) -> bool:
	return p.get("has_ancient_deep_access") == true or db.has_cleared(uid, "the_quartermaster")


static func state(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.me(uid)
	var fishing: int = Rules.level_from_xp(Js.num(p.get("fishing_xp")))
	var nav: int = Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))
	var now: float = Clock.now_ms()
	var by_id: Dictionary = {}
	for c: Dictionary in Crew.live(db):
		by_id[float(c["id"])] = c
	var at_sea: Array = []
	var by_zone: Dictionary = {}
	for t: Dictionary in _out(db):
		at_sea.append(float(t["crew_id"]))
		var c: Variant = by_id.get(float(t["crew_id"]))
		if c == null:
			continue
		var v: Dictionary = crew_view(c)
		var e: Dictionary = expected(t["zone"], v["savvy"], v["fortune"])
		by_zone[t["zone"]] = { "zone": t["zone"], "crew": v, "endsMs": float(t["ends_ms"]), "runMs": run_ms(t["zone"]), "ready": float(t["ends_ms"]) <= now, "expectedXp": e["xp"], "expectedDoubloons": e["doubloons"] }
	var free: Array = []
	for c: Dictionary in Crew.live(db):
		if at_sea.has(float(c["id"])) or Crew._reassign_error(db, uid, c) != "":
			continue
		free.append(crew_view(c))
	free.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a["savvy"] + a["fortune"] > b["savvy"] + b["fortune"])
	var zones: Array = []
	var anc: bool = _ancient_open(db, uid, p)
	for z: Dictionary in ZONES:
		zones.append({ "key": z["key"], "label": z["label"], "minLevel": z["minLevel"], "seaDays": int(z["seaDays"]),
			"unlocked": fishing >= int(z["minLevel"]) and (z["key"] != "ancient_deep" or anc), "trawl": by_zone.get(z["key"]) })
	return { "fishingLevel": fishing, "navLevel": nav, "unlockedSlots": unlocked_slots(fishing, nav), "nextSlot": next_slot(fishing, nav), "zones": zones, "freeCrew": free }


static func deploy(db: CaptainStore, uid: String, key: String, crew_id: float) -> Dictionary:
	var z: Dictionary = zone(key)
	if z.is_empty():
		return { "error": "Unknown water." }
	var p: Dictionary = db.me(uid)
	var fishing: int = Rules.level_from_xp(Js.num(p.get("fishing_xp")))
	var nav: int = Loadout.nav_level_from_xp(Js.num(p.get("expedition_xp")))
	var active: Array = _out(db)
	if fishing < int(z["minLevel"]):
		return { "error": "Reach Fishing Level %d to trawl the %s." % [int(z["minLevel"]), z["label"]] }
	if key == "ancient_deep" and not _ancient_open(db, uid, p):
		return { "error": "Clear Chapter 3 (defeat the Quartermaster) to trawl the Ancient Deep." }
	if active.size() >= unlocked_slots(fishing, nav):
		return { "error": "No free trawl slot." }
	if active.any(func(t: Dictionary) -> bool: return t["zone"] == key):
		return { "error": "You're already trawling the %s." % z["label"] }
	if active.any(func(t: Dictionary) -> bool: return float(t["crew_id"]) == crew_id):
		return { "error": "That crew is already at sea." }
	var c: Dictionary = {}
	for m: Dictionary in Crew.live(db):
		if float(m["id"]) == crew_id:
			c = m
	if c.is_empty():
		return { "error": "Crew not available." }
	var why: String = Crew._reassign_error(db, uid, c)
	if why != "":
		return { "error": why }
	active.append({ "id": db.next_id(), "zone": key, "crew_id": crew_id, "ends_ms": Clock.now_ms() + run_ms(key) })
	# Out of their seat: the trawl holds them now.
	c["voyage_slot"] = null
	c["raid_slot"] = null
	return state(db, uid)


static func collect(db: CaptainStore, uid: String, key: String) -> Dictionary:
	var active: Array = _out(db)
	var t: Dictionary = {}
	for row: Dictionary in active:
		if row["zone"] == key:
			t = row
	if t.is_empty():
		return { "error": "No trawl to collect there." }
	if float(t["ends_ms"]) > Clock.now_ms():
		return { "error": "Your crew has not returned yet." }
	active.erase(t)
	var v: Dictionary = { "name": "Your crew", "savvy": 5.0, "fortune": 5.0 }
	for m: Dictionary in Crew.live(db):
		if float(m["id"]) == float(t["crew_id"]):
			v = crew_view(m)
	var e: Dictionary = expected(key, v["savvy"], v["fortune"])
	var mult: float = roll_mult(v["fortune"])
	var xp: float = maxf(0.0, float(Js.round(float(e["xp"]) * mult)))
	var dbl: float = maxf(0.0, float(Js.round(float(e["doubloons"]) * mult)))
	var p: Dictionary = db.me(uid)
	var old_xp: float = Js.num(p.get("fishing_xp"))
	var jaw: Variant = FishingRules.jaw_charge_after(p, xp)
	var bal: float = db.grant(uid, "doubloons", dbl)
	db.bump_stat(uid, "fishing_xp", xp)
	if jaw != null:
		db.bump_stat(uid, "borrowed_jaw_xp", xp)
	if dbl > 0.0:
		db.ledger(uid, dbl, "Crew trawl: %s" % zone(key)["label"])
	db.bump_stat(uid, "trawls_collected", 1.0)
	# Up to three species from the water, for the haul.
	var names: Array = []
	for f: Dictionary in db.save["species"]:
		if f["habitat"] == key:
			names.append(str(f["name"]))
	var fish: Array = []
	for i: int in mini(3, names.size()):
		fish.append(names.pop_at(int(Dice.next() * names.size())))
	var bumper: String = bumper_for(mult)
	var pool: Array = EVENTS[bumper]
	return {
		"zone": key, "xpGained": xp, "doubloonsGained": dbl, "newFishingXP": old_xp + xp,
		"oldFishingLevel": Rules.level_from_xp(old_xp), "newFishingLevel": Rules.level_from_xp(old_xp + xp),
		"newDoubloons": bal, "fish": fish, "crewName": v["name"], "bumper": bumper, "mult": mult,
		"event": pool[int(Dice.next() * pool.size())],
	}
