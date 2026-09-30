class_name Clock
extends RefCounted
## THE CLOCK, a port of web/lib/clock.ts (Godot port, stage 0).
##
## Rules read the time from Clock.now_ms(), never the system clock, so a test
## (or a replayed session) can script it. Milliseconds since the epoch as a
## float, because the rules are ported with JavaScript's numbers (see JsJson):
## every number in them is a double.

static var _scripted: Callable = Callable()


static func now_ms() -> float:
	if _scripted.is_valid():
		return float(_scripted.call())
	return Time.get_unix_time_from_system() * 1000.0


## Script the clock (an empty Callable goes back to the system clock).
static func install(now: Callable) -> void:
	_scripted = now
