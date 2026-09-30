class_name Market
extends RefCounted
## THE FISH MARKET'S PRICES, a port of web/lib/marketRules.ts and currentMarket
## in web/lib/data/local/sellLocal.ts (Godot port, docking).
##
## Every species has a multiplier on its sell value that wanders each hour:
## pulled back toward 1, shaken by its rarity (rarer, wilder), pushed by the
## market's mood (a kraken sighting, bounty season, cursed waters, a rising or
## low tide, a storm, or calm, each lasting 2 to 5 hours), and held between
## 0.40 and 2.50. The captain's market lives in the save and is caught up hour
## by hour (at most 48) whenever it is read. Every roll is the rules' dice.

const HOUR: float = 3600000.0
const MAX_CATCH_UP_TICKS: int = 48


static func _hours(min_h: float) -> float:
	return (min_h + floor(Dice.next() * 4.0)) * HOUR


static func roll_mood(now: float) -> Dictionary:
	var roll: float = Dice.next()
	var mood: String
	var bias: float
	if roll < 0.05:
		mood = "kraken"
		bias = 0.02 if Dice.next() < 0.5 else -0.02
	elif roll < 0.10:
		mood = "bounty_season"; bias = 0.025
	elif roll < 0.16:
		mood = "cursed_waters"; bias = -0.025
	elif roll < 0.28:
		mood = "tide_rising"; bias = 0.012
	elif roll < 0.40:
		mood = "low_tide"; bias = -0.012
	elif roll < 0.60:
		mood = "storm"
		bias = 0.01 if Dice.next() < 0.5 else -0.01
	else:
		mood = "calm"; bias = 0.0
	return { "mood": mood, "bias": bias, "moodExpiresAt": now + _hours(2.0) }


static func rarity_volatility(r: float) -> float:
	return 0.04 if r == 1 else (0.06 if r == 2 else (0.09 if r == 3 else (0.14 if r == 4 else 0.20)))


static func mood_volatility(mood: String) -> float:
	return 1.5 if mood == "storm" else (2.0 if mood == "kraken" else (1.2 if mood == "bounty_season" or mood == "cursed_waters" else 1.0))


static func next_multiplier(m: float, rarity: float, mood: String, bias: float) -> float:
	var volatility: float = rarity_volatility(rarity) * mood_volatility(mood)
	var drift: float = 0.08 * (1.0 - m)
	var noise: float = (Dice.next() + Dice.next() + Dice.next() - 1.5) * volatility
	return Js.round(maxf(0.40, minf(2.50, m + drift + noise + bias)) * 100.0) / 100.0


static func tick(state: Dictionary, species: Array, now: float) -> Dictionary:
	var mood_part: Dictionary
	if now >= float(state["moodExpiresAt"]):
		mood_part = roll_mood(now)
	else:
		mood_part = { "mood": state["mood"], "bias": state["bias"], "moodExpiresAt": state["moodExpiresAt"] }
	var fish: Dictionary = {}
	var old: Dictionary = Js.obj(state.get("fish"))
	for s: Dictionary in species:
		var k: String = Js.key(s["id"])
		var cur: Dictionary = Js.obj(old.get(k))
		var m: float = float(cur.get("m", 1.0))
		var hist: Array = Js.list(cur.get("history")).duplicate()
		hist.append(Js.round(m * 100.0) / 100.0)
		fish[k] = {
			"m": next_multiplier(m, float(s["bite_rarity"]), mood_part["mood"], mood_part["bias"]),
			"prev": m,
			"history": hist.slice(maxi(0, hist.size() - 24)),
		}
	var out: Dictionary = mood_part.duplicate()
	out["lastTickAt"] = now
	out["fish"] = fish
	return out


static func fresh(now: float) -> Dictionary:
	var hour: float = floor(now / HOUR) * HOUR
	var out: Dictionary = roll_mood(hour)
	out["lastTickAt"] = hour
	out["fish"] = {}
	return out


static func catch_up(state: Dictionary, species: Array, now: float) -> Dictionary:
	var due: int = int(floor((now - float(state["lastTickAt"])) / HOUR))
	if due <= 0:
		return state
	var s: Dictionary = state
	var skip: int = maxi(0, due - MAX_CATCH_UP_TICKS)
	for k: int in range(skip + 1, due + 1):
		s = tick(s, species, float(state["lastTickAt"]) + k * HOUR)
	return s


## The captain's market, caught up to now (and started, the first time).
static func current(save: Dictionary) -> Dictionary:
	var now: float = Clock.now_ms()
	var m: Variant = save.get("market")
	save["market"] = catch_up(m if m != null else fresh(now), save["species"], now)
	return save["market"]


static func multiplier(save: Dictionary, fish_id: float) -> float:
	var f: Variant = (current(save)["fish"] as Dictionary).get(Js.key(fish_id))
	return float((f as Dictionary)["m"]) if f != null else 1.0


static func price_each(sell_value: float, mult: float) -> float:
	return floor(sell_value * mult * 1.0)
