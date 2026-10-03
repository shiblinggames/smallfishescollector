class_name PuzzleBoard
extends Control
## A CAMPAIGN PUZZLE'S BOARD (the five boards of app/(app)/expeditions:
## the beacon chain, the cipher dials, the mirror run, the cargo shuffle and
## the tumbler lock). Each is its own script; make() picks it by the node's
## puzzle kind. finished(solved) when it is cracked or put down.

signal finished(solved: bool)

var puzzle: Dictionary = {}


static func make(pz: Dictionary) -> PuzzleBoard:
	var path: String = "res://game/puzzles/%s.gd" % str(pz.get("kind", ""))
	if not ResourceLoader.exists(path):
		return null
	var b: PuzzleBoard = (load(path) as GDScript).new()
	b.puzzle = pz
	return b
