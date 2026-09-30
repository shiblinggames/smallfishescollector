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
