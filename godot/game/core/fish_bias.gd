class_name FishBias
extends RefCounted
## WHEN A FISH BITES BEST (Kong, 2026-10-02: "weather slightly boosts the
## catch rates of certain fish, and day and night too"). port_rules fishBias
## names a few species per condition (Night, Golden hour, Storm, Fog; Fair
## Wind deliberately is not one), chosen for what the real fish do. While a
## condition holds where the line goes in, those species are nudged up
## (boost, 25%; a Tempest's storm, 40%), but ONLY among fish of the same
## rarity: the chance of a rarer fish is untouched, and so are pay, XP and
## crates. The look of the day and the fronts are core/weather.gd and
## game/sea_clock.gd.

const LABEL: Dictionary = { "night": "Night", "golden": "Golden hour", "storm": "Storm", "fog": "Fog" }
const BEST: Dictionary = { "night": "at night", "golden": "at dawn and dusk", "storm": "in a storm", "fog": "in fog" }


static func cfg() -> Dictionary:
	return Js.obj(Rules.data().get("fishBias"))


static func on() -> bool:
	return not Rules.web_only and not cfg().is_empty()


## The conditions holding at this point now, with their nudge: { cond: mult }.
static func conditions(at: Vector2, now: float) -> Dictionary:
	var out: Dictionary = {}
	if not on():
		return out
	var boost: float = float(cfg().get("boost", 0.25))
	var clock: Dictionary = SeaClock.at(now)
	if float(clock["darkness"]) >= 0.5:
		out["night"] = 1.0 + boost
	elif clock["phase"] == "dawn" or clock["phase"] == "dusk" or float(SeaClock.sky(now)["low"]) > 0.6:
		out["golden"] = 1.0 + boost
	var fx: Dictionary = Weather.effect(at, now, 0.0)
	var f: Dictionary = fx["front"]
	if not f.is_empty() and float(fx["k"]) > 0.3:
		if f["kind"] in ["squall", "gale", "tempest"]:
			out["storm"] = 1.0 + (float(cfg().get("tempestBoost", 0.4)) if f["kind"] == "tempest" else boost)
		elif f["kind"] == "fog":
			out["fog"] = 1.0 + boost
	return out


## The nudge on each species here and now: { species id: mult } (empty when
## nothing holds, so the pick is the web's uniform one).
static func for_cast(candidates: Array, at: Vector2, now: float) -> Dictionary:
	var out: Dictionary = {}
	var conds: Dictionary = conditions(at, now)
	if conds.is_empty():
		return out
	var lists: Dictionary = cfg()
	for f: Dictionary in candidates:
		for c: String in conds:
			if Js.list(lists.get(c)).has(str(f["name"])):
				out[float(f["id"])] = maxf(float(out.get(float(f["id"]), 1.0)), float(conds[c]))
	return out


## What is stirring in this water: "Night: Channel Catfish, Walleye and
## European Eel are feeding." or "".
static func stirring(species: Array, habitat: String, at: Vector2, now: float) -> String:
	var conds: Dictionary = conditions(at, now)
	var parts: Array = []
	for c: String in conds:
		var names: Array = []
		for f: Dictionary in species:
			if f["habitat"] == habitat and Js.list(cfg().get(c)).has(str(f["name"])):
				names.append(str(f["name"]))
		if not names.is_empty():
			var list: String = names[0] if names.size() == 1 else ", ".join(PackedStringArray(names.slice(0, names.size() - 1))) + " and " + str(names[names.size() - 1])
			parts.append("%s: %s %s feeding." % [LABEL[c], list, "is" if names.size() == 1 else "are"])
	return "  ".join(PackedStringArray(parts))


## "Bites best at night." for the Log, or "".
static func best_text(name: String) -> String:
	if not on():
		return ""
	for c: String in BEST:
		if Js.list(cfg().get(c)).has(name):
			return "Bites best %s." % BEST[c]
	return ""
