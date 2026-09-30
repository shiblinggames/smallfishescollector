class_name BossFight
extends RefCounted
## THE ANCIENT DEEP'S FIGHT (Godot port of the multi-phase reel in the deleted
## app/(app)/fishing/FishingGame.tsx, in git at 7e1891b9^; brought back by Kong,
## 2026-09-30, see docs/systems/steam-port.md).
##
## Every Ancient Deep fish is a fight of several phases. Each phase is a catch
## on the dial; a miss or a snag and it escapes. Only the last phase's result
## goes to the reel, so a Vigil rank needs a perfect on the last. Each fish has
## its mechanic:
##   drift       the ring circles one way (about 80 degrees a second)
##   gyre        the ring rocks like a swell (46 degrees either way, 1.5s)
##   surge       drift, and the needle quickens each phase
##   accelerate  the needle quickens each phase (x1.4, to x4 at most)
##   randomize   the ring snaps to somewhere new on some ticks
##   split       a second perfect on the far side of the ring
##   precision   the green is gone: perfect or nothing
##   shrink      the landing window breathes, tighter and faster each phase
## A wildcard fish rolls a new mechanic each phase. The Long Vigil steepens a
## released giant's fight by its rank (more phases, a closing window, a faster
## needle) without changing what it is. Blackouts dim the dial now and then in
## the Ancient Deep (never for Megalodon).

const CONFIG: Dictionary = {
	"Megalodon": { "mechanic": "precision", "phases": 4, "perfectShrinkStart": -18.0, "perfectShrinkStep": 6.0, "speedStepMult": 1.12, "noBlackout": true },
	"Plesiosaurus": { "mechanic": "drift", "phases": 3 },
	"Dunkleosteus": { "mechanic": "accelerate", "phases": 3 },
	"Mosasaurus": { "mechanic": "gyre", "phases": 3 },
	"Basilosaurus": { "mechanic": "surge", "phases": 3 },
	"Shastasaurus": { "mechanic": "shrink", "phases": 3 },
	"Chambered Nautilus": { "mechanic": "drift", "phases": 2 },
	"Ghost Shark": { "mechanic": "randomize", "phases": 2 },
	"Spookfish": { "mechanic": "split", "phases": 2 },
	"Snipe Eel": { "mechanic": "precision", "phases": 2 },
	"Yeti Crab": { "mechanic": "accelerate", "phases": 2 },
	"Sea Lamprey": { "mechanic": "shrink", "phases": 2, "wildcard": true },
	"Pacific Hagfish": { "mechanic": "split", "phases": 2 },
	"Tripod Fish": { "mechanic": "drift", "phases": 2 },
	"Sea Pig": { "mechanic": "accelerate", "phases": 2 },
	"Bigfin Squid": { "mechanic": "gyre", "phases": 2 },
	"Vent Octopus": { "mechanic": "shrink", "phases": 2 },
	"Black Dragonfish": { "mechanic": "shrink", "phases": 2, "wildcard": true },
}
const WILDCARD: Array[String] = ["shrink", "drift", "accelerate", "randomize", "split", "precision", "gyre"]
## The Vigil's scale by the rank being fought for: extra phases, the window's
## start and step, and the needle's step (lib/ancientVigil VIGIL_SCALE).
const VIGIL_SCALE: Dictionary = {
	2: [0, -6.0, 2.5, 1.06], 3: [1, -9.0, 3.0, 1.09], 4: [1, -12.0, 3.5, 1.12], 5: [2, -15.0, 4.0, 1.15],
}


static func base_config(fish_name: String) -> Dictionary:
	return (CONFIG.get(fish_name, { "mechanic": "shrink", "phases": 2 }) as Dictionary).duplicate()


## vigilBossConfig: the rank steepens the fight without replacing it.
static func config(fish_name: String, mechanic: String, rank: Variant) -> Dictionary:
	var base: Dictionary = base_config(fish_name)
	if rank == null or not VIGIL_SCALE.has(int(rank)):
		return base
	var sc: Array = VIGIL_SCALE[int(rank)]
	var own_curve: bool = base.has("perfectShrinkStep")
	var steps_shrink: bool = mechanic != "shrink" and not own_curve
	var ramps: bool = mechanic == "accelerate" or mechanic == "surge"
	var out: Dictionary = base.duplicate()
	out["phases"] = int(base["phases"]) + int(sc[0])
	if steps_shrink:
		out["perfectShrinkStart"] = sc[1]
		out["perfectShrinkStep"] = sc[2]
	out["speedStepMult"] = float(base.get("speedStepMult", 1.4 if ramps else 1.0)) * float(sc[3])
	return out


## Cut a zone into the ring, trimming whatever it overlaps.
static func _splice(zones: Array, ins: Array) -> Array:
	var out: Array = []
	for z: Array in zones:
		if float(z[1]) <= float(ins[0]) or float(z[0]) >= float(ins[1]):
			out.append(z)
			continue
		if float(z[0]) < float(ins[0]):
			out.append([z[0], ins[0], z[2]] + z.slice(3))
		if float(z[1]) > float(ins[1]):
			out.append([ins[1], z[1], z[2]] + z.slice(3))
	out.append(ins)
	out.sort_custom(func(a: Array, b: Array) -> bool: return float(a[0]) < float(b[0]))
	return out


## applyBossMods: precision turns the green into a red miss; split adds a
## second perfect opposite; a shrink narrows the perfect (or, negative, widens
## it) and its neighbours meet it.
static func apply_mods(zones: Array, mechanic: String, shrink: float) -> Array:
	var result: Array = zones.duplicate(true)
	if mechanic == "precision":
		for i: int in result.size():
			if result[i][2] == "catch":
				result[i] = [result[i][0], result[i][1], "miss", "#f87171"]
	if mechanic == "split":
		for z: Array in result:
			if z[2] == "perfect":
				var center: float = (float(z[0]) + float(z[1])) / 2.0
				var half: float = (float(z[1]) - float(z[0])) / 2.0
				var opposite: float = fmod(center + 180.0, 360.0)
				if opposite - half >= 0.0 and opposite + half <= 360.0:
					result = _splice(result, [opposite - half, opposite + half, "perfect"])
				break
	if shrink != 0.0:
		var pi: int = -1
		for i: int in result.size():
			if result[i][2] == "perfect":
				pi = i
				break
		if pi >= 0:
			var p: Array = result[pi]
			var center: float = (float(p[0]) + float(p[1])) / 2.0
			var half: float = maxf(2.0, (float(p[1]) - float(p[0])) / 2.0 - shrink / 2.0)
			var nf: float = center - half
			var nt: float = center + half
			if shrink < 0.0:
				var rest: Array = result.duplicate()
				rest.remove_at(pi)
				result = _splice(rest, [nf, nt, "perfect"] + p.slice(3))
			else:
				var old_from: float = float(p[0])
				var old_to: float = float(p[1])
				for i: int in result.size():
					var z: Array = result[i]
					if i == pi:
						result[i] = [nf, nt, z[2]] + z.slice(3)
					elif absf(float(z[1]) - old_from) < 1e-6:
						result[i] = [z[0], nf, z[2]] + z.slice(3)
					elif absf(float(z[0]) - old_to) < 1e-6:
						result[i] = [nt, z[1], z[2]] + z.slice(3)
	return result


## applyAncientPalette: a giant's dial in its Vigil rank's colors.
static func palette(zones: Array, rank: Variant) -> Array:
	var pal: Dictionary = (Rules.data()["vigilDial"] as Dictionary).get(str(int(rank) if rank != null else 1), (Rules.data()["vigilDial"] as Dictionary)["1"])
	var out: Array = []
	for z: Array in zones:
		out.append([z[0], z[1], z[2], pal.get(z[2], "#4b3a63")])
	return out
