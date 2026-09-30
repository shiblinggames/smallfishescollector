class_name Dice
extends RefCounted
## THE DICE, a port of web/lib/rng.ts (Godot port, stage 0).
##
## Every roll in the rules goes through Dice.next(). With a generator installed
## (the save's own seeded mulberry32, as the desktop build does) the same seed
## gives the same game, roll for roll, as the TypeScript rules; the parity
## cases (tests/parity) hold the two to it. Without one it is randf().
##
## The arithmetic is JavaScript's 32-bit integer maths on Godot's 64-bit ints:
## every value is kept as an unsigned 32-bit number (masked with U32), and
## Math.imul is the low 32 bits of the wrapped 64-bit product.
##
## NOT FOR VISUALS. Particles, sound and camera shake use randf(); they are not
## rules and nothing replays them.

const U32: int = 0xFFFFFFFF
const TWO_32: float = 4294967296.0

static var _installed: Mulberry32 = null
## Rolls taken from the installed generator since the last reset (the parity
## cases record rolls per call, so a drift points at the call that drifted).
static var rolls: int = 0


## mulberry32: small, fast, seedable, and the web's generator.
class Mulberry32:
	extends RefCounted
	var _a: int

	func _init(seed: int) -> void:
		_a = seed & Dice.U32

	## The next float in [0, 1), as the web's generator gives it.
	func next() -> float:
		return float(next_u32()) / Dice.TWO_32

	## The same roll as the 32-bit integer behind it.
	func next_u32() -> int:
		_a = (_a + 0x6D2B79F5) & Dice.U32
		var t: int = Dice.imul(_a ^ (_a >> 15), 1 | _a)
		t = ((t + Dice.imul(t ^ (t >> 7), 61 | t)) & Dice.U32) ^ t
		return (t ^ (t >> 14)) & Dice.U32


## Math.imul on unsigned 32-bit values, as an unsigned 32-bit result.
static func imul(a: int, b: int) -> int:
	return ((a & U32) * (b & U32)) & U32


## The next roll: a float in [0, 1). Use this, not randf(), in rules code.
static func next() -> float:
	if _installed == null:
		return randf()
	rolls += 1
	return _installed.next()


## Install a generator for every roll (null goes back to randf()).
static func install(rng: Mulberry32) -> void:
	_installed = rng


## A 32-bit seed from any text (a run id, a date, a captain id). FNV-1a over
## UTF-16 code units, as JavaScript's charCodeAt sees the text.
static func seed_of(text: String) -> int:
	var h: int = 0x811C9DC5
	var units: PackedByteArray = text.to_utf16_buffer()
	for i: int in range(0, units.size(), 2):
		h ^= units[i] | (units[i + 1] << 8)
		h = (h * 0x01000193) & U32
	return h
