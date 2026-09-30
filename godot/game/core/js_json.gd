class_name JsJson
extends RefCounted
## JSON AS JAVASCRIPT WRITES IT (Godot port, stage 0).
##
## The saves and content are the web's JSON, and the rules are ported with
## JavaScript's numbers: every number is a double. Godot's parser already reads
## every number as a float, which is exactly that, so parse() is Godot's own.
##
## Writing differs: Godot writes 25 as "25.0" and, by default, rounds doubles to
## 15 digits. stringify() writes whole numbers as integers (as JSON.stringify
## does), keeps full precision otherwise, and writes -0 as 0.
##
## PORTING RULE THIS IMPLIES: rules code does its maths in floats, as the TS
## does. 7 / 2 is 3.5 in the TS; in GDScript it is 3.5 only when a side is a
## float. Use floor(), not int division, where the TS uses Math.floor.

const MAX_SAFE: float = 9007199254740991.0


static func parse(text: String) -> Variant:
	return JSON.parse_string(text)


static func stringify(value: Variant) -> String:
	var out: PackedStringArray = PackedStringArray()
	_write(value, out)
	return "".join(out)


static func _write(v: Variant, out: PackedStringArray) -> void:
	match typeof(v):
		TYPE_NIL:
			out.append("null")
		TYPE_BOOL:
			out.append("true" if v else "false")
		TYPE_INT:
			out.append(str(v))
		TYPE_FLOAT:
			out.append(number(v))
		TYPE_STRING, TYPE_STRING_NAME:
			out.append(JSON.stringify(String(v)))
		TYPE_DICTIONARY:
			var d: Dictionary = v
			out.append("{")
			var first: bool = true
			for k: Variant in d:
				if not first:
					out.append(",")
				first = false
				out.append(JSON.stringify(str(k)))
				out.append(":")
				_write(d[k], out)
			out.append("}")
		TYPE_ARRAY, TYPE_PACKED_STRING_ARRAY, TYPE_PACKED_INT32_ARRAY, TYPE_PACKED_INT64_ARRAY, TYPE_PACKED_FLOAT32_ARRAY, TYPE_PACKED_FLOAT64_ARRAY:
			out.append("[")
			var i: int = 0
			for item: Variant in v:
				if i > 0:
					out.append(",")
				i += 1
				_write(item, out)
			out.append("]")
		_:
			push_error("JsJson: cannot write a %s" % type_string(typeof(v)))
			out.append("null")


## A number as JSON.stringify writes it (whole numbers without a decimal point).
static func number(f: float) -> String:
	if is_nan(f) or is_inf(f):
		return "null"
	if f == floor(f) and absf(f) <= MAX_SAFE:
		return str(int(f))
	return JSON.stringify(f, "", false, true)


## Whether two JSON values are the same data: dictionaries compared by key
## (order is not state), numbers by value (25 and 25.0 are one number).
## Returns "" when equal, else the path to the first difference.
static func diff(a: Variant, b: Variant, path: String = "$") -> String:
	var ta: int = typeof(a)
	var tb: int = typeof(b)
	var na: bool = ta == TYPE_INT or ta == TYPE_FLOAT
	var nb: bool = tb == TYPE_INT or tb == TYPE_FLOAT
	if na and nb:
		return "" if float(a) == float(b) else "%s: %s vs %s" % [path, number(float(a)), number(float(b))]
	if ta != tb:
		return "%s: %s vs %s" % [path, short(a), short(b)]
	if ta == TYPE_DICTIONARY:
		var da: Dictionary = a
		var db: Dictionary = b
		for k: Variant in da:
			if not db.has(k):
				return "%s.%s: only on the left (%s)" % [path, k, short(da[k])]
		for k: Variant in db:
			if not da.has(k):
				return "%s.%s: only on the right (%s)" % [path, k, short(db[k])]
		for k: Variant in da:
			var d: String = diff(da[k], db[k], "%s.%s" % [path, k])
			if d != "":
				return d
		return ""
	if ta == TYPE_ARRAY:
		var aa: Array = a
		var ab: Array = b
		if aa.size() != ab.size():
			return "%s: %d items vs %d" % [path, aa.size(), ab.size()]
		for i: int in aa.size():
			var d: String = diff(aa[i], ab[i], "%s[%d]" % [path, i])
			if d != "":
				return d
		return ""
	return "" if a == b else "%s: %s vs %s" % [path, short(a), short(b)]


## A value as short JSON, for messages.
static func short(v: Variant) -> String:
	var s: String = stringify(v)
	return s if s.length() <= 80 else s.substr(0, 77) + "..."
