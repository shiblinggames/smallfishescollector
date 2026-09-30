class_name Berth
extends Node2D
## A PORT'S BERTH ON THE WATER (Godot port of app/(app)/sea/seaBerth.ts,
## docking): the circle you sail into to tie up.
##
## Additive light on the squashed plane, three parts:
##   the pool, a soft disc 2r across, breathing slowly, teal by day and warm
##     once it is dark;
##   the rim, a thin ring just inside 2.1r, tightening to 2.04r when you are in;
##   the approach, 14 lamps on the ring with a wave of light chasing round them.
## `lit` eases to 1 while the boat is inside (about a third of a second) and
## everything brightens with it. Lives in the World node, so its circles are
## ellipses on screen like everything else lying on the water.

const DAY: Color = Color8(0x9f, 0xe0, 0xd8)
const WARM: Color = Color8(0xff, 0xc4, 0x78)
const COOL: Color = Color8(0xbc, 0xd8, 0xe6)
const LAMPS: int = 14

var r: float = 330.0
## The direction from the island to the berth: the chase starts there.
var bearing: float = 0.0
var inside: bool = false
var darkness: float = 0.0
var lit: float = 0.0
var _t: float = 0.0
var _pool: Sprite2D
var _lamps: Array[Sprite2D] = []


func _ready() -> void:
	var add: CanvasItemMaterial = CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	material = add
	_pool = Sprite2D.new()
	_pool.texture = Glow.radial(256, Color.WHITE)
	_pool.scale = Vector2.ONE * (2.0 * r / 256.0)
	_pool.use_parent_material = true
	add_child(_pool)
	var dot: Texture2D = Glow.radial(64, Color.WHITE)
	var px: float = maxf(14.0, r * 0.13)
	for i: int in LAMPS:
		var s: Sprite2D = Sprite2D.new()
		s.texture = dot
		s.use_parent_material = true
		var a: float = TAU * i / LAMPS
		s.position = Vector2(cos(a), sin(a)) * r
		# Round on screen: undo the plane's squash.
		s.scale = Vector2(1.0, 1.0 / Chart.GROUND) * (px / 64.0)
		s.modulate = WARM
		add_child(s)
		_lamps.append(s)


func _process(delta: float) -> void:
	_t += delta
	lit = move_toward(lit, 1.0 if inside else 0.0, minf(1.0, delta * 3.4))
	var dark: float = darkness
	var breath: float = 0.5 + 0.5 * sin(_t * 0.55 + position.x * 0.01)
	var pool_a: float = ((0.10 + lit * 0.10) * (1.0 - dark) + (0.07 + lit * 0.14) * dark) * (0.86 + breath * 0.14)
	_pool.modulate = Color(WARM if dark > 0.5 else DAY, pool_a)
	var head: float = bearing + _t * 1.15
	for i: int in LAMPS:
		var a: float = TAU * i / LAMPS
		var gap: float = absf(wrapf(a - head, -PI, PI))
		var near: float = maxf(0.0, 1.0 - gap / 0.9)
		_lamps[i].modulate.a = clampf((0.20 + lit * 0.18) + near * near * (0.40 + lit * 0.40), 0.0, 1.0)
	queue_redraw()


func _draw() -> void:
	# The rim: a thin ring peaking just inside its edge, drawn as a few
	# concentric strokes fading out on either side of the peak.
	var rim_r: float = r * lerpf(2.1, 2.04, lit) / 2.0 * 0.955
	var col: Color = WARM if lit > 0.5 else COOL
	var a: float = 0.26 + lit * 0.30
	for k: int in 5:
		var off: float = (k - 2) * 3.0
		var fall: float = 1.0 - absf(k - 2) / 3.0
		draw_arc(Vector2.ZERO, rim_r + off, 0.0, TAU, 128, Color(col, a * fall * 0.5), 3.0, true)
