class_name Berth
extends Node2D
## A PORT'S MOORING (Godot, rebuilt twice on 2026-10-01). The web's glowing
## pool, neon rim and lamps bloomed into blobs under the glow; drawn posts and
## floats clashed with the painted world. So a mooring is now the WATER: the
## water shader paints a calmer, lighter harbour patch here with a soft broken
## foam edge (the same hand as the shores), which warms while she is inside.
## This node only holds where it is and how lit it is; Sea hands the nearby
## berths to the shader (u_berths).

var r: float = 330.0
## The direction from the island to the berth.
var bearing: float = 0.0
var inside: bool = false
var darkness: float = 0.0
var lit: float = 0.0
var field: SeaField


func _process(delta: float) -> void:
	lit = move_toward(lit, 1.0 if inside else 0.0, delta * 3.0)
