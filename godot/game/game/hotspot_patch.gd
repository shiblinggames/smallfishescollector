class_name HotspotPatch
extends Node2D
## A HOTSPOT ON THE WATER (Godot port of glowPatches in app/(app)/sea/
## SeaMap.tsx): a soft pool of its kind's colour with a rim, breathing slowly,
## stronger the higher its tier (TIER_GLOW: fill, rim, spread; a beat of
## 11 - 2 x tier seconds; a swell of 0.01 + 0.03 x tier). Lives in the World
## node, so it lies flat on the squashed plane. Fades in when it appears and
## out when its ten minutes are up.

var spot: Dictionary = {}
var _t: float = 0.0
var _fade: float = 0.0
var _leaving: bool = false
var _pool: Sprite2D


func _ready() -> void:
	position = Vector2(float(spot["x"]), float(spot["y"]))
	var add: CanvasItemMaterial = CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	material = add
	_pool = Sprite2D.new()
	_pool.texture = Glow.radial(256, Color.WHITE)
	_pool.use_parent_material = true
	add_child(_pool)
	_t = randf() * 10.0


func leave() -> void:
	_leaving = true


func _process(delta: float) -> void:
	_t += delta
	var was: float = _fade
	_fade = move_toward(_fade, 0.0 if _leaving else 1.0, delta / 1.2)
	if _leaving and _fade <= 0.0:
		queue_free()
		return
	var tier: int = int(spot["tier"])
	var g: Array = Hotspots.GLOW[tier]
	var beat: float = 11.0 - tier * 2.0
	var swell: float = 0.01 + tier * 0.03
	var breath: float = 0.5 + 0.5 * sin(_t * TAU / beat)
	var r: float = float(spot["r"]) * (1.0 + swell * breath)
	var c: Color = Color(Hotspots.DEFS[spot["kind"]]["color"])
	_pool.scale = Vector2.ONE * (r * 2.0 * (0.8 + float(g[2]) * 0.4) / 256.0)
	_pool.modulate = Color(c, minf(1.0, float(g[0]) * 2.2) * (0.75 + 0.25 * breath) * _fade)
	# The rim depends only on the fade (the breathing is the pool's), so it
	# is redrawn only while that moves.
	if _fade != was:
		queue_redraw()


func _draw() -> void:
	var tier: int = int(spot["tier"])
	var g: Array = Hotspots.GLOW[tier]
	var c: Color = Color(Hotspots.DEFS[spot["kind"]]["color"])
	var r: float = float(spot["r"])
	var a: float = minf(1.0, float(g[1]) * 2.0) * _fade
	for k: int in 5:
		draw_arc(Vector2.ZERO, r - k * 6.0, 0.0, TAU, 128, Color(c, a * (1.0 - k / 5.0) * 0.7), 4.0 + tier * 1.5, true)
