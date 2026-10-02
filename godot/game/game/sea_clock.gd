class_name SeaClock
extends RefCounted
## THE SEA'S DAY, a port of web/lib/seaClock (Godot port, stage 1).
##
## A sea day is 48 real minutes; a third of it is night, with a fade either
## side. darkness runs 0 to 1, warmth peaks with the sun on the horizon.

const CYCLE_MS: float = 48.0 * 60.0 * 1000.0
const NIGHT_FRACTION: float = 1.0 / 3.0
const FADE: float = 0.09
const PHASE_LABEL: Dictionary = { "dawn": "First light", "day": "Daylight", "dusk": "The light is going", "night": "Dark water" }


## { t, phase, darkness, warmth }.
static func at(now_ms: float) -> Dictionary:
	var t: float = fposmod(now_ms, CYCLE_MS) / CYCLE_MS
	var night_start: float = 0.5 - NIGHT_FRACTION / 2.0
	var night_end: float = 0.5 + NIGHT_FRACTION / 2.0
	var darkness: float
	var phase: String
	if t < night_start - FADE:
		darkness = 0.0; phase = "day"
	elif t < night_start:
		darkness = (t - (night_start - FADE)) / FADE; phase = "dusk"
	elif t < night_end:
		darkness = 1.0; phase = "night"
	elif t < night_end + FADE:
		darkness = 1.0 - (t - night_end) / FADE; phase = "dawn"
	else:
		darkness = 0.0; phase = "day"
	var warmth: float = 0.0
	if phase == "dusk":
		warmth = sin(PI * ((t - (night_start - FADE)) / FADE))
	elif phase == "dawn":
		warmth = sin(PI * ((t - night_end) / FADE))
	return { "t": t, "phase": phase, "darkness": darkness, "warmth": warmth }


## The sun's bearing on screen (radians), for the light the water answers.
static func sun_angle(now_ms: float) -> float:
	var night_start: float = 0.5 - NIGHT_FRACTION / 2.0
	var night_end: float = 0.5 + NIGHT_FRACTION / 2.0
	var t: float = fposmod(now_ms, CYCLE_MS) / CYCLE_MS
	var base: float = -PI * 0.75
	var u: float = fposmod(t - night_end, 1.0) / (1.0 - NIGHT_FRACTION)
	if u > 1.0 or (t >= night_start and t < night_end):
		return base
	return base + (u - 0.5) * deg_to_rad(45.0)


## THE SKY'S PATH (Kong, 2026-10-02: "a real day and night over 48 minutes,
## the sun rising east and setting west, moving the shadows and the light on
## the water"). By day the sun rises in the east, crosses the northern sky
## (the top of the screen, so at noon shadows fall toward you, as the painted
## art is lit) and sets in the west; by night the moon takes the same road,
## lower and fainter. { toward (the way to the light, on the sea's plane),
## elev (0 on the horizon, 1 overhead), moon, u (how far across, 0 to 1),
## low (the sun near the horizon, 0 to 1, daytime only) }.
## The look only: night for the rules is still at()'s phase.
static func sky(now_ms: float) -> Dictionary:
	var t: float = fposmod(now_ms, CYCLE_MS) / CYCLE_MS
	var night_start: float = 0.5 - NIGHT_FRACTION / 2.0
	var night_end: float = 0.5 + NIGHT_FRACTION / 2.0
	var moon: bool = t >= night_start and t < night_end
	var u: float = (t - night_start) / NIGHT_FRACTION if moon else fposmod(t - night_end, 1.0) / (1.0 - NIGHT_FRACTION)
	var elev: float = sin(PI * u)
	return {
		"toward": Vector2.from_angle(-PI * u), "elev": elev * (0.75 if moon else 1.0), "moon": moon, "u": u,
		"low": 0.0 if moon else 1.0 - smoothstep(0.0, 0.42, elev),
	}


## The sea's time of day in words: sunrise at 6 am, sunset at 8 pm.
static func time_label(now_ms: float) -> String:
	var s: Dictionary = sky(now_ms)
	var hours: float = 20.0 + float(s["u"]) * 10.0 if s["moon"] else 6.0 + float(s["u"]) * 14.0
	var h: int = int(floor(hours)) % 24
	var m: int = int(floor(fposmod(hours, 1.0) * 60.0 / 5.0)) * 5
	return "%d:%02d %s" % [12 if h % 12 == 0 else h % 12, m, "am" if h < 12 else "pm"]
