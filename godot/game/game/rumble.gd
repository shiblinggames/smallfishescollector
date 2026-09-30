class_name Rumble
extends RefCounted
## THE WEB'S HAPTICS AS CONTROLLER RUMBLE (Godot port, fishing pass 2).
##
## web/lib/haptics.ts takes vibrate patterns ([on, off, on, ...] in ms) and, in
## the native shell, maps each to one impact by its total on-time: 60 or more
## is heavy, 20 or more medium, less light. The same rule drives the pad.

## The patterns the fishing loop uses, named for their moment.
const CAST: Array = [12]
const BITE: Array = [0, 26, 40, 18]
const PERFECT: Array = [40, 60, 80]
const CATCH: Array = [6]
const MISS: Array = [6]
const SECOND_WIND: Array = [0, 20, 50, 20]
const SKIP: Array = [10]
const HOLD: Array = [8]
const GOLDEN: Array = [0, 18, 40, 26]
const LEVEL_UP: Array = [0, 22, 50, 30]


static func buzz(pattern: Array) -> void:
	var on: float = 0.0
	for i: int in pattern.size():
		if i % 2 == 0:
			on += float(pattern[i])
	if on <= 0.0:
		return
	var strength: float = 1.0 if on >= 60.0 else (0.6 if on >= 20.0 else 0.3)
	for pad: int in Input.get_connected_joypads():
		Input.start_joy_vibration(pad, strength * 0.7, strength, maxf(0.06, on / 1000.0 * 1.6))


## A single pulse of `ms` on, as vibrate(ms).
static func tap(ms: float) -> void:
	buzz([ms])
