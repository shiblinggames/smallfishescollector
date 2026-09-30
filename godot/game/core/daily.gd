class_name Daily
extends RefCounted
## THE DAILY CHALLENGES' PICKING AND COUNTING, a port of web/lib/dailyChallenges
## (Godot port, stage 1). The pools are in content/rules.json.
##
## The pick hashes the date with JavaScript's number arithmetic, including one
## product that exceeds 2^53 and is rounded as a double before it is cut to 32
## bits; the port does that multiply in floats so it rounds the same way.

const TWO_32: float = 4294967296.0
const ZONE_MIN_LEVEL: Dictionary = { "shallows": 1, "open_waters": 15, "deep": 30, "abyss": 50, "ancient_deep": 75 }


## x >>> 0 for a double that is already a whole number.
static func _u32(x: float) -> float:
	return fposmod(x, TWO_32)


## x | 0 then back to unsigned: the ToInt32 a bitwise operator applies.
static func _i32_bits(x: float) -> int:
	return int(_u32(x))


static func date_hash(date: String, salt: float) -> float:
	var h: float = _u32(salt * 2654435761.0)
	for c: int in date.to_utf8_buffer():
		# (((h ^ c) * 1664525) >>> 0) + 1013904223: h ^ c is a 32-bit integer
		# (signed in JS, the same bits), the product is exact below 2^53.
		var x: int = (_i32_bits(h) ^ c) & 0xFFFFFFFF
		var signed_x: float = float(x - 0x100000000) if x >= 0x80000000 else float(x)
		h = _u32(signed_x * 1664525.0) + 1013904223.0
	return _u32(h)


static func _eligible(c: Dictionary, level: float) -> bool:
	if not Js.truthy(c.get("zone")):
		return true
	return level >= float(ZONE_MIN_LEVEL.get(c["zone"], 1))


static func _pick(date: String, salt: float, pool: Array, level: float) -> Dictionary:
	var h: float = date_hash(date, salt)
	for attempt: int in pool.size():
		var idx: int = int(fmod(h, float(pool.size())))
		if _eligible(pool[idx], level):
			return pool[idx]
		h = _u32(h * 2654435761.0 + 1.0)
	return pool[int(fmod(date_hash(date, salt), float(pool.size())))]


static func challenges(date: String, level: float) -> Array:
	var tiers: Array = Rules.data()["daily"]["tiers"]
	var out: Array = [_pick(date, 1, tiers[0], level), _pick(date, 2, tiers[1], level), _pick(date, 3, tiers[2], level)]
	if level >= float(Rules.data()["daily"]["masterMinLevel"]):
		out.append(_pick(date, 4, tiers[3], level))
	return out


static func with_override(date: String, override: Variant, level: float) -> Array:
	if typeof(override) == TYPE_DICTIONARY:
		var o: Dictionary = override
		var out: Array = [o["tier1"], o["tier2"], o["tier3"]]
		if level >= float(Rules.data()["daily"]["masterMinLevel"]):
			out.append(_pick(date, 4, (Rules.data()["daily"]["tiers"] as Array)[3], level))
		return out
	return challenges(date, level)


static func today_utc() -> String:
	return Js.iso(Clock.now_ms()).substr(0, 10)


static func increment(c: Dictionary, habitat: String, rarity: float, sell_value: float, qty: float, perfect: bool) -> float:
	match c["type"]:
		"catch_any":
			return qty
		"catch_zone":
			return qty if habitat == c.get("zone") else 0.0
		"land_perfects":
			return 1.0 if perfect else 0.0
		"catch_rarity":
			return 1.0 if rarity >= float(Js.nz(c.get("minRarity"), 1.0)) else 0.0
		"earn_value":
			return sell_value * qty
	return 0.0
