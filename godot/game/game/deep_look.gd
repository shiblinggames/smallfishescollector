class_name DeepLook
extends RefCounted
## HOW EACH BAND OF A DIVE LOOKS (Kong, 2026-10-05: "visually it needs to look
## and feel a lot more intense and different" as you go deeper). Every band of
## both gauntlets has its own sea: the water's colours, the light over it, a
## murk in the water, how close the dark sits round you (the vignette), the
## dive's own weather (the sea's ordinary weather is set aside for a dive),
## and one thing in the water that is only there (DeepAtmos draws them).
## Within a band it keeps getting darker toward the next; a boss leans the
## dark in, and the Don's rise takes it all the way.
##
## Davy's dive goes from pale teal mist, down through rain and a court of
## candles, a starless black, falling silt, the Leviathan's road in a storm,
## the ash of the Black Meridian, the red Crush with embers rising, to the
## Bottom of the World where there is only your own light. The Don's stays
## still and green: weed, the Kraken's arm under you, ink, a drowned canopy
## shedding fronds, the Leviathan's coil, black kelp, spores in the crushing
## deep, and the Maw.
##
##   sea     the water's three stops (deep, mid, shallow)
##   light   the colour laid over the world
##   murk    the water's own haze: colour and amount
##   vig     how far in the dark closes (0 open, 1 a pool round your hull)
##   rain    the dive's rain (0..1); storm: lightning in it
##   motes   what is in the water: "wisp", "plank", "candle", "speck",
##           "silt", "shadow", "ash", "ember", "kelp", "tentacle", "ink",
##           "leaf", "spore"; mote: its colour

const DAVY: Array = [
	{ "sea": ["#06202a", "#16505c", "#3e8e92"], "light": "#b4ccd2", "murk": "#a8d0d0", "murkA": 0.10, "vig": 0.22, "rain": 0.0, "storm": false, "motes": "wisp", "mote": "#c8fff0" },
	{ "sea": ["#041a22", "#103e4a", "#2c6e70"], "light": "#93b2b6", "murk": "#5d8a86", "murkA": 0.14, "vig": 0.34, "rain": 0.3, "storm": false, "motes": "plank", "mote": "#6e5638" },
	{ "sea": ["#03141f", "#0c3346", "#24607a"], "light": "#7f9cb8", "murk": "#4a6a8a", "murkA": 0.16, "vig": 0.42, "rain": 0.6, "storm": false, "motes": "candle", "mote": "#ffd27a" },
	{ "sea": ["#020810", "#06182a", "#123450"], "light": "#55657e", "murk": "#0a1424", "murkA": 0.28, "vig": 0.58, "rain": 0.4, "storm": true, "motes": "speck", "mote": "#6fd0ff" },
	{ "sea": ["#0b0a16", "#1e1c34", "#3c3858"], "light": "#7a7290", "murk": "#4a4060", "murkA": 0.2, "vig": 0.55, "rain": 0.0, "storm": false, "motes": "silt", "mote": "#c4bad8" },
	{ "sea": ["#0a0618", "#1c1236", "#382a60"], "light": "#6a5a90", "murk": "#2a1c48", "murkA": 0.24, "vig": 0.62, "rain": 0.85, "storm": true, "motes": "shadow", "mote": "#05020c" },
	{ "sea": ["#05030a", "#120c1c", "#241a34"], "light": "#4e4460", "murk": "#08060c", "murkA": 0.38, "vig": 0.72, "rain": 0.2, "storm": false, "motes": "ash", "mote": "#9a94a0" },
	{ "sea": ["#12030a", "#30081a", "#5a1428"], "light": "#8a4a50", "murk": "#2a0408", "murkA": 0.28, "vig": 0.72, "rain": 0.9, "storm": true, "motes": "ember", "mote": "#ff7a4a" },
	{ "sea": ["#080104", "#1a030a", "#300810"], "light": "#5a343c", "murk": "#040001", "murkA": 0.46, "vig": 0.88, "rain": 0.0, "storm": false, "motes": "ember", "mote": "#ff5a3a" },
]

const DON: Array = [
	{ "sea": ["#03200f", "#0e4c2c", "#3a8e60"], "light": "#acd0b4", "murk": "#8ac8a0", "murkA": 0.08, "vig": 0.24, "rain": 0.0, "storm": false, "motes": "wisp", "mote": "#c0ffd2" },
	{ "sea": ["#021a0c", "#0a3e22", "#2a7048"], "light": "#90b498", "murk": "#4a7a58", "murkA": 0.14, "vig": 0.34, "rain": 0.0, "storm": false, "motes": "kelp", "mote": "#3f8a4a" },
	{ "sea": ["#02140c", "#08321e", "#1e5a3c"], "light": "#7a9c84", "murk": "#2a5038", "murkA": 0.18, "vig": 0.45, "rain": 0.3, "storm": false, "motes": "tentacle", "mote": "#03100a" },
	{ "sea": ["#010a06", "#041c12", "#0e3624"], "light": "#557560", "murk": "#020604", "murkA": 0.30, "vig": 0.58, "rain": 0.0, "storm": false, "motes": "ink", "mote": "#000000" },
	{ "sea": ["#03100a", "#0a2a1a", "#1c4a30"], "light": "#647e5e", "murk": "#3a5a3a", "murkA": 0.30, "vig": 0.52, "rain": 0.0, "storm": false, "motes": "leaf", "mote": "#86ad6a" },
	{ "sea": ["#020c08", "#06201a", "#12402e"], "light": "#4c6c5c", "murk": "#0a2018", "murkA": 0.26, "vig": 0.62, "rain": 0.5, "storm": false, "motes": "shadow", "mote": "#010603" },
	{ "sea": ["#010604", "#04120c", "#0a2418"], "light": "#3e4e44", "murk": "#010302", "murkA": 0.40, "vig": 0.72, "rain": 0.0, "storm": false, "motes": "kelp", "mote": "#1d4a2a" },
	{ "sea": ["#020804", "#06160c", "#10301c"], "light": "#3c5242", "murk": "#000200", "murkA": 0.42, "vig": 0.78, "rain": 0.0, "storm": false, "motes": "spore", "mote": "#7affb0" },
	{ "sea": ["#000402", "#020a06", "#06180e"], "light": "#2c4434", "murk": "#000100", "murkA": 0.52, "vig": 0.9, "rain": 0.0, "storm": false, "motes": "spore", "mote": "#4aff90" },
]


static func _bands(variant: String) -> Array:
	return Js.list(Js.obj(Gauntlet.t().get("bands")).get(variant))


## The band index for a depth (0..8).
static func band_index(depth: int, variant: String) -> int:
	var bands: Array = _bands(variant)
	var at: int = 0
	for i: int in bands.size():
		if depth >= int(bands[i]["minDepth"]):
			at = i
	return at


## The sea for this depth of this dive: what sea.water_theme and DeepAtmos read.
static func look(variant: String, depth: int, boss: bool = false, apex: bool = false) -> Dictionary:
	var table: Array = DON if variant == "don" else DAVY
	var bands: Array = _bands(variant)
	var i: int = mini(band_index(maxi(1, depth), variant), table.size() - 1)
	var row: Dictionary = table[i]
	# How far through this band (toward the next band's water).
	var lo: int = int(bands[i]["minDepth"]) if i < bands.size() else 1
	var hi: int = int(bands[i + 1]["minDepth"]) if i + 1 < bands.size() else lo + 30
	var k: float = clampf(float(depth - lo) / float(maxi(1, hi - lo)), 0.0, 1.0)
	var sea: Array = []
	for h: String in row["sea"]:
		sea.append(Color(h))
	if i + 1 < table.size():
		var nxt: Dictionary = table[i + 1]
		for s: int in 3:
			sea[s] = (sea[s] as Color).lerp(Color(str(nxt["sea"][s])), k * 0.5)
	var vig: float = float(row["vig"]) + 0.08 * k + (0.1 if boss else 0.0) + (0.18 if apex else 0.0)
	var murk_a: float = float(row["murkA"]) + 0.04 * k + (0.05 if boss else 0.0)
	return {
		"band": i, "variant": variant,
		# The hulls stay readable however deep: the light never falls all the
		# way to the band's colour (the water and the dark carry the depth).
		"sea": sea, "light": Color(str(row["light"])).lerp(Color(0.86, 0.86, 0.86), 0.32), "dim": 0.06 * k + (0.12 if boss else 0.0) + (0.2 if apex else 0.0),
		"murk": Color(str(row["murk"])), "murkA": minf(0.7, murk_a), "vig": minf(0.95, vig),
		"rain": float(row["rain"]), "storm": row["storm"] == true,
		"motes": str(row["motes"]), "mote": Color(str(row["mote"])),
		"accent": Color(str(bands[i].get("accent", "#9fc4e0"))) if i < bands.size() else Color("#9fc4e0"),
		"boss": boss, "apex": apex,
	}
