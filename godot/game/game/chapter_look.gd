class_name ChapterLook
extends RefCounted
## EACH NORTHERN CHAPTER'S OWN SEA (Kong, 2026-10-06: on the web "the
## northern seas change color thematically for each of their chapter areas.
## Each area feels very unique and special to itself"; "port the web's mood
## but improve it in any way through Godot's engine"). The web's BAY_MOOD
## (raidWaters.ts) gave each bay its swell, light, fog and storms; here each
## also grades the whole screen, lays its own haze and vignette over the
## water, drifts its own things through the air (DeepAtmos draws them), and
## brings its own weather. The water's colours stay Chart.sea_at's.
##
##   I    THE LOOSE THREAD   clear, warm green, a long swell, bright sun,
##                           sea spray drifting on the wind
##   II   A BIGGER FISH      flat jade water under fog, the light gone dim
##                           and green, spores hanging in the air
##   III  THE COFFERS        gold: the light amber and warm, a glow on
##                           everything, gold dust glinting in the air
##   IV   THE LAST FATHOM    black water with a heavy swell, night at noon,
##                           cold glowing specks drifting, the dark close,
##                           rain and lightning
##   V    ONE LAST RIDE      Finn's water: violet-blood, a standing tempest,
##                           ash on the wind
##
## Blended by distance from each bay's water as the colours are (a strait is
## a soft change; the name banner and horn mark the arrival).
##
##   swell  the water's swell (1 the open sea)
##   grade  the screen: brightness, contrast, saturation
##   light  the colour laid over the world (by day)
##   glow   added bloom
##   murk / murkA / vig   DeepAtmos's haze and how close the dark sits
##   rain / storm / fog   the bay's own weather, over the sea's
##   motes / mote         what drifts in the air (DeepAtmos kinds)

const BAYS: Dictionary = {
	"thread": { "swell": 1.25, "grade": [1.05, 1.03, 1.14], "light": "#f4f2e2", "glow": 0.06,
		"murk": "#d8f4e4", "murkA": 0.03, "vig": 0.1, "rain": 0.0, "storm": false, "fog": 0.0, "motes": "wisp", "mote": "#f2fff8" },
	"sunken_hand": { "swell": 0.55, "grade": [0.95, 1.02, 0.86], "light": "#a8bea0", "glow": 0.04,
		"murk": "#7a9a66", "murkA": 0.16, "vig": 0.3, "rain": 0.0, "storm": false, "fog": 0.75, "motes": "spore", "mote": "#d4eea2" },
	"the_coffers": { "swell": 1.0, "grade": [1.04, 1.07, 1.1], "light": "#ffdfa8", "glow": 0.14,
		"murk": "#e0b45a", "murkA": 0.06, "vig": 0.16, "rain": 0.0, "storm": false, "fog": 0.0, "motes": "speck", "mote": "#ffd27a" },
	"the_last_fathom": { "swell": 1.6, "grade": [0.9, 1.13, 0.84], "light": "#68738e", "glow": 0.32,
		"murk": "#0a1424", "murkA": 0.22, "vig": 0.46, "rain": 0.2, "storm": true, "fog": 0.0, "motes": "speck", "mote": "#6fd0ff" },
	"one_last_ride": { "swell": 1.4, "grade": [0.92, 1.12, 0.92], "light": "#9a6478", "glow": 0.2,
		"murk": "#3d0e26", "murkA": 0.2, "vig": 0.5, "rain": 0.85, "storm": true, "fog": 0.0, "motes": "ash", "mote": "#c8a4b4" },
}


## The bay whose water this is and how much (0..1), and its look; {} on the
## open sea or south of the Sea Gate.
static func at(p: Vector2) -> Dictionary:
	if p.y > -6000.0:
		return {}
	var best: String = ""
	var best_w: float = 0.0
	for b: Dictionary in Js.list(Js.obj(Rules.data().get("campaignWater")).get("bays")):
		var d: float = p.distance_to(Vector2(float(b["centre"]["x"]), float(b["centre"]["y"])))
		var w: float = 1.0 - smoothstep(float(b["r"]) * 0.7, float(b["r"]) + 1600.0, d)
		if w > best_w and BAYS.has(str(b["id"])):
			best_w = w
			best = str(b["id"])
	if best == "":
		return {}
	return { "bay": best, "k": best_w, "look": BAYS[best] }


## The look as DeepAtmos reads it, its haze and dark scaled by how far in.
static func atmos(look: Dictionary, k: float) -> Dictionary:
	return {
		"murk": Color(str(look["murk"])), "murkA": float(look["murkA"]) * k, "vig": float(look["vig"]) * k,
		"motes": str(look["motes"]) if k > 0.35 else "", "mote": Color(str(look["mote"])),
	}
