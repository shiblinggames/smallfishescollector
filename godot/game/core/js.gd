class_name Js
extends RefCounted
## JAVASCRIPT'S SEMANTICS, WHERE THE PORTED RULES NEED THEM (Godot port, stage 1).
##
## The rules are ported line for line from TypeScript, and a handful of JS
## behaviours differ from GDScript's in ways that change results. Each is here
## once, named for the JS it stands in for:
##
##   round()   Math.round: halves go UP, also for negatives (-2.5 -> -2).
##             GDScript's round() goes away from zero.
##   nz()      the ?? operator: only null falls through, never 0 or false.
##   truthy()  JS truthiness (0, "", null and false are false).
##   iso()     new Date(ms).toISOString(), to the millisecond.
##   parse_ms() new Date(text).getTime() for the ISO strings the game writes.
##   key()     a number used as an object key: JS writes 12, not 12.0.
##   ids()     Object.keys of an id-keyed object, as numbers, in JS's order
##             (integer keys ascending, whatever order they were added in).


static func round(x: float) -> float:
	var f: float = floor(x)
	return f + 1.0 if x - f >= 0.5 else f


static func nz(v: Variant, fallback: Variant) -> Variant:
	return fallback if v == null else v


static func truthy(v: Variant) -> bool:
	match typeof(v):
		TYPE_NIL:
			return false
		TYPE_BOOL:
			return v
		TYPE_INT, TYPE_FLOAT:
			return float(v) != 0.0 and not is_nan(float(v))
		TYPE_STRING, TYPE_STRING_NAME:
			return String(v) != ""
	return true


## A number, as the rules read one: null and missing are 0.
static func num(v: Variant) -> float:
	if v == null:
		return 0.0
	if typeof(v) == TYPE_BOOL:
		return 1.0 if v else 0.0
	if typeof(v) == TYPE_STRING:
		return String(v).to_float()
	return float(v)


static func iso(ms: float) -> String:
	var total: int = int(floor(ms))
	var secs: int = floori(total / 1000.0)
	var milli: int = total - secs * 1000
	var d: Dictionary = Time.get_datetime_dict_from_unix_time(secs)
	return "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ" % [d["year"], d["month"], d["day"], d["hour"], d["minute"], d["second"], milli]


## Milliseconds since the epoch for an ISO date the game wrote
## ("2026-09-30T12:00:00.000Z", or without the milliseconds), NAN otherwise.
static func parse_ms(text: Variant) -> float:
	if typeof(text) != TYPE_STRING:
		return NAN
	var s: String = text
	var re: RegEx = RegEx.create_from_string("^(\\d{4})-(\\d{2})-(\\d{2})(?:T(\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{1,3}))?)?)?(Z|[+-]00:?00)?$")
	var m: RegExMatch = re.search(s)
	if m == null:
		return NAN
	var d: Dictionary = {
		"year": m.get_string(1).to_int(), "month": m.get_string(2).to_int(), "day": m.get_string(3).to_int(),
		"hour": m.get_string(4).to_int(), "minute": m.get_string(5).to_int(), "second": m.get_string(6).to_int(),
	}
	var ms: String = m.get_string(7)
	var frac: float = 0.0 if ms == "" else ms.rpad(3, "0").to_int()
	return float(Time.get_unix_time_from_datetime_dict(d)) * 1000.0 + frac


static func key(id: Variant) -> String:
	return str(int(float(id)))


static func ids(obj: Dictionary) -> Array:
	var out: Array = []
	for k: Variant in obj:
		out.append(float(str(k).to_int()))
	out.sort()
	return out


## structuredClone: a deep copy of a JSON value.
static func clone(v: Variant) -> Variant:
	if typeof(v) == TYPE_DICTIONARY:
		return (v as Dictionary).duplicate(true)
	if typeof(v) == TYPE_ARRAY:
		return (v as Array).duplicate(true)
	return v


## Array.includes, with numbers compared by value (5 and 5.0 are one number).
static func includes(list: Variant, v: Variant) -> bool:
	if typeof(list) != TYPE_ARRAY:
		return false
	var numeric: bool = typeof(v) == TYPE_INT or typeof(v) == TYPE_FLOAT
	for x: Variant in list:
		if numeric and (typeof(x) == TYPE_INT or typeof(x) == TYPE_FLOAT):
			if float(x) == float(v):
				return true
		elif typeof(x) == typeof(v) and x == v:
			return true
	return false


## A list, or [] when the value is null or not a list (the TS's `?? []`).
static func list(v: Variant) -> Array:
	return v if typeof(v) == TYPE_ARRAY else []


## An object, or {} when the value is null or not one (the TS's `?? {}`).
static func obj(v: Variant) -> Dictionary:
	return v if typeof(v) == TYPE_DICTIONARY else {}
