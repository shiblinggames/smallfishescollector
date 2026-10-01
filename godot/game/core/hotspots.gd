class_name Hotspots
extends RefCounted
## THE SEA'S HOTSPOTS, a port of web/lib/seaHotspots.ts (Godot port, the rest
## of the sea, stage 2).
##
## Nothing is stored: every ten minutes three patches stand on the water,
## derived from the clock alone, one of each kind (a shoal: faster bites; a
## trench: rarer fish; flotsam: more crates), each in a different fishing band,
## somewhere on its southern arc, at a strength of 1 to 3. The cast re-derives
## the one it is in from where the line went in, so nothing about a patch is
## ever taken from the player. The hash and the random stream are the web's,
## bit for bit (32-bit integer arithmetic as JavaScript does it).

const WINDOW_MS: float = 600000.0
const COUNT: int = 3
const KINDS: Array[String] = ["shoal", "trench", "flotsam"]
const U32: int = 0xFFFFFFFF

const DEFS: Dictionary = {
	"shoal": { "color": "#5fd4a0", "family": "Faster bites", "tiers": [
		["Scattered Shoal", "Fish bite about 5% faster here."],
		["Running Shoal", "Fish bite about 7% faster here."],
		["Boiling Shoal", "Fish bite about 10% faster here."]] },
	"trench": { "color": "#a78bfa", "family": "Rarer fish", "tiers": [
		["Cold Trench", "Rare fish a little likelier, legendaries about 1.4x."],
		["Deep Trench", "Rare fish notably likelier, legendaries about 2x."],
		["Black Trench", "Rare fish much likelier, legendaries nearly 3x."]] },
	"flotsam": { "color": "#f0c040", "family": "More crates", "tiers": [
		["Drifting Flotsam", "About 60% more sunken crates here."],
		["Heavy Flotsam", "Better than twice as many sunken crates here."],
		["Wreck Field", "Three times as many sunken crates here."]] },
}
## How brightly each strength glows on the water: fill, rim, spread.
const GLOW: Dictionary = { 1: [0.16, 0.16, 0.40], 2: [0.26, 0.30, 0.55], 3: [0.40, 0.52, 0.70] }


static func _hash(a: int, b: int) -> int:
	var h: int = ((a * 0x27d4eb2d) & U32) ^ ((b * 0x165667b1) & U32) ^ 0x9e3779b9
	h = Dice.imul(h ^ (h >> 15), 0x2c1b3c6d)
	h = Dice.imul(h ^ (h >> 12), 0x297a2d39)
	return (h ^ (h >> 15)) & U32


## xorshift32 (13, 17, 5): a stream of floats in [0, 1).
class Stream:
	extends RefCounted
	var s: int = 1

	func _init(seed: int) -> void:
		s = seed if seed != 0 else 1

	func next() -> float:
		s = (s ^ (s << 13)) & 0xFFFFFFFF
		s = s ^ (s >> 17)
		s = (s ^ (s << 5)) & 0xFFFFFFFF
		return float(s) / 4294967296.0


## The three patches standing at this moment.
static func at_time(now: float) -> Array:
	var win: int = int(floor(now / WINDOW_MS))
	var ends_at: float = float(win + 1) * WINDOW_MS
	var zones: Array = Chart.WATERS
	var pick: Stream = Stream.new(_hash(win, 0x5eed))
	var pool: Array = range(zones.size())
	var chosen: Array = []
	for i: int in COUNT:
		if pool.is_empty():
			break
		var k: int = int(floor(pick.next() * pool.size()))
		chosen.append(pool[k])
		pool.remove_at(k)
	var out: Array = []
	for slot: int in chosen.size():
		var z: Dictionary = zones[chosen[slot]]
		var rnd: Stream = Stream.new(_hash(win, slot + 1))
		var inner: float = float(z["inner"])
		var outer: float = float(z["outer"])
		var big_r: float = inner + (outer - inner) * (0.2 + rnd.next() * 0.6)
		var deg: float = 14.0 + rnd.next() * 152.0
		var th: float = deg * PI / 180.0
		var r: float = Js.round((outer - inner) * 0.16)
		var roll: float = rnd.next()
		var tier: int = 3 if roll < 0.12 else (2 if roll < 0.12 + 0.28 else 1)
		out.append({
			"key": "%d:%d" % [win, slot], "kind": KINDS[slot % KINDS.size()], "tier": tier,
			"x": Js.round(cos(th) * big_r), "y": Js.round(sin(th) * big_r), "r": r,
			"zoneId": z["id"], "endsAt": ends_at,
		})
	return out


## The patch this point is in, or {}.
static func at_point(x: float, y: float, now: float) -> Dictionary:
	for h: Dictionary in at_time(now):
		if Vector2(x - float(h["x"]), y - float(h["y"])).length() <= float(h["r"]):
			return h
	return {}


## What a patch does to a cast (hotspotEffect).
static func effect(kind: Variant, tier: int = 1) -> Dictionary:
	match kind:
		"shoal":
			return { "waitMult": [0.95, 0.93, 0.9][tier - 1], "rarityBonus": 0.0, "crateChanceMult": 1.0 }
		"trench":
			return { "waitMult": 1.0, "rarityBonus": [0.15, 0.45, 1.1][tier - 1], "crateChanceMult": 1.0 }
		"flotsam":
			return { "waitMult": 1.0, "rarityBonus": 0.0, "crateChanceMult": [1.6, 2.2, 3.0][tier - 1] }
	return Rules.no_hotspot()
