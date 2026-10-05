class_name Tavern
extends RefCounted
## THE TAVERN'S TALK (Godot port of lib/tavernGossip.ts): what you overhear.
## Three snatches of conversation at a time, from a deck of 81 shuffled per
## captain, turning over ON THE HOUR (so the room does not change while you
## stand in it, and every line is heard once before any repeats: 27 hours).
## Each line is always said by the same two people, their faces hashed from
## what they said. The lines teach the game the way a room does (nobody talks
## to you; every factual line is true in the port; a third are just talk).
## content/tavern.json.

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://content/tavern.json"))
	return _data


## FNV-1a, 32-bit.
static func _hash(s: String) -> int:
	var h: int = 2166136261
	for c: int in s.to_utf8_buffer():
		h = (h ^ c) & 0xFFFFFFFF
		h = Dice.imul(h, 16777619)
	return h


## A face for one speaker of a line (a patron: a plain colour, maybe a hat).
static func face(line: String, which: String) -> Dictionary:
	var h: int = _hash(line + "::" + which)
	var cols: Array = data()["colours"]
	var hats: Array = data()["hats"]
	return { "characterColor": cols[h % cols.size()], "hat": hats[(h >> 8) % hats.size()], "bg": "#171009", "ring": "#8a6f42", "mirrored": which == "b" }


## The three snatches heard this hour, each { say, from, faces }.
static func overheard(seed: String, now_ms: float, count: int = 3) -> Array:
	var deck: Array = (data()["lines"] as Array).duplicate()
	var s: Seeded = Seeded.new(_hash(seed))
	for i: int in range(deck.size() - 1, 0, -1):
		var j: int = int(s.next() * (i + 1))
		var t: Variant = deck[i]
		deck[i] = deck[j]
		deck[j] = t
	var hour: int = int(floor(now_ms / 3600000.0))
	var start: int = posmod(hour * count, deck.size())
	var out: Array = []
	for k: int in count:
		var o: Dictionary = (deck[(start + k) % deck.size()] as Dictionary).duplicate()
		o["faces"] = [face(str(o["say"][0]), "a"), face(str(o["say"][0]), "b")]
		out.append(o)
	return out


class Seeded:
	var h: int

	func _init(seed: int) -> void:
		h = seed & 0xFFFFFFFF

	func next() -> float:
		h = (h + 0x6d2b79f5) & 0xFFFFFFFF
		var t: int = h
		t = Dice.imul(t ^ (t >> 15), t | 1)
		t = (t ^ ((t + Dice.imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
		return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
