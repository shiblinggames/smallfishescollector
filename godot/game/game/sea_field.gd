class_name SeaField
extends Node
## THE SEA'S DISTURBANCE (Godot over the web baseline, 2026-10-01): an
## off-screen picture of everything that is moving the water, which the water
## shader reads to bend its own surface.
##
## A SubViewport at half the screen, watched by a camera that follows the
## chart's, holds height: the wake's own marks and rings (the SAME MultiMeshes
## the Wake draws, so nothing is computed twice), a push of water under every
## hull, and one-off rings for casts, splashes and bobbers. The water samples it
## at the screen position and turns its slope into light and shade, foam on the
## crests, the swell bent around it, and at night a cold glow where it is
## stirred.

const BLOB_CAP: int = 96
const RING_CAP: int = 96

var viewport: SubViewport
## WHAT IS UNDER THE SURFACE: the shoals are drawn here, and the water shader
## lays this beneath its own surface (refracted by the swell, lit over).
var under: SubViewport
var under_world: Node2D
var _under_cam: Camera2D
## THE FLOW MAP (2026-10-01): the current lanes drawn as which way the water
## runs (rg) and how strongly (b), so the water shader can stream its surface
## along them. Follows the camera like the field.
var flow: SubViewport
var _flow_cam: Camera2D
var _cam: Camera2D
var _world: Node2D
var _blobs: MultiMeshInstance2D
var _rings: MultiMeshInstance2D
## Per ring: [x, y, age, life, grow, strength]
var _r: Array = []
var _ring_next: int = 0


func _ready() -> void:
	viewport = SubViewport.new()
	viewport.disable_3d = true
	viewport.transparent_bg = false
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.render_target_clear_mode = SubViewport.CLEAR_MODE_ALWAYS
	viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR
	add_child(viewport)
	var bg: CanvasLayer = CanvasLayer.new()
	bg.layer = -1
	viewport.add_child(bg)
	var black: ColorRect = ColorRect.new()
	black.color = Color.BLACK
	black.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.add_child(black)
	_cam = Camera2D.new()
	viewport.add_child(_cam)
	_world = Node2D.new()
	_world.scale = Vector2(1.0, Chart.GROUND)
	viewport.add_child(_world)
	under = SubViewport.new()
	under.disable_3d = true
	under.transparent_bg = true
	under.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	under.render_target_clear_mode = SubViewport.CLEAR_MODE_ALWAYS
	under.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR
	add_child(under)
	_under_cam = Camera2D.new()
	under.add_child(_under_cam)
	under_world = Node2D.new()
	under_world.scale = Vector2(1.0, Chart.GROUND)
	under.add_child(under_world)
	flow = SubViewport.new()
	flow.disable_3d = true
	flow.transparent_bg = false
	flow.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	flow.render_target_clear_mode = SubViewport.CLEAR_MODE_ALWAYS
	flow.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR
	add_child(flow)
	var fbg: CanvasLayer = CanvasLayer.new()
	fbg.layer = -1
	flow.add_child(fbg)
	var fblack: ColorRect = ColorRect.new()
	fblack.color = Color.BLACK
	fblack.set_anchors_preset(Control.PRESET_FULL_RECT)
	fbg.add_child(fblack)
	_flow_cam = Camera2D.new()
	flow.add_child(_flow_cam)
	var fw: Node2D = Node2D.new()
	fw.scale = Vector2(1.0, Chart.GROUND)
	flow.add_child(fw)
	fw.add_child(FlowPainter.new())
	_blobs = _layer(BLOB_CAP, _blob_tex())
	_rings = _layer(RING_CAP, Wake._ring_tex())
	_world.add_child(_blobs)
	_world.add_child(_rings)
	for i: int in RING_CAP:
		_r.append([0.0, 0.0, 1.0, 1.0, 1.0, 1.0])
		_hide(_rings.multimesh, i)
	for i: int in BLOB_CAP:
		_hide(_blobs.multimesh, i)


## The wake's marks and rings, drawn again here as height.
func share_wake(w: Wake) -> void:
	for src: MultiMeshInstance2D in [w._marks, w._rings]:
		var mi: MultiMeshInstance2D = MultiMeshInstance2D.new()
		mi.multimesh = src.multimesh
		mi.texture = _blob_tex() if src == w._marks else src.texture
		# The wake draws its foam faint; as height it wants to be felt.
		mi.material = _gain(5.0 if src == w._marks else 4.5)
		_world.add_child(mi)


static func _gain(g: float) -> ShaderMaterial:
	var m: ShaderMaterial = ShaderMaterial.new()
	m.shader = load("res://game/fx/field_add.gdshader")
	m.set_shader_parameter("gain", g)
	return m


func _layer(n: int, tex: Texture2D) -> MultiMeshInstance2D:
	var mm: MultiMesh = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_2D
	mm.use_colors = true
	var q: QuadMesh = QuadMesh.new()
	q.size = Vector2(1, 1)
	mm.mesh = q
	mm.instance_count = n
	var mi: MultiMeshInstance2D = MultiMeshInstance2D.new()
	mi.multimesh = mm
	mi.texture = tex
	var add: CanvasItemMaterial = CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	mi.material = add
	return mi


func _hide(mm: MultiMesh, i: int) -> void:
	mm.set_instance_transform_2d(i, Transform2D(0.0, Vector2.ZERO, 0.0, Vector2.ZERO))
	mm.set_instance_color(i, Color(0, 0, 0, 0))


static var _blob: Texture2D


static func _blob_tex() -> Texture2D:
	if _blob != null:
		return _blob
	var img: Image = Image.create(64, 64, false, Image.FORMAT_RGBA8)
	for y: int in 64:
		for x: int in 64:
			var d: float = Vector2(x + 0.5 - 32.0, y + 0.5 - 32.0).length() / 32.0
			img.set_pixel(x, y, Color(1, 1, 1, exp(-d * d * 4.0) * (1.0 if d < 1.0 else 0.0)))
	_blob = ImageTexture.create_from_image(img)
	return _blob


## A ring of disturbance spreading from a point on the water: a cast landing,
## a catch, a bobber twitching. grow is how far it runs (world px).
func ring(at: Vector2, grow: float = 160.0, life: float = 1.6, strength: float = 0.8) -> void:
	var r: Array = _r[_ring_next]
	_ring_next = (_ring_next + 1) % RING_CAP
	r[0] = at.x; r[1] = at.y; r[2] = 0.0; r[3] = life; r[4] = grow; r[5] = strength


## Follow the chart's camera, push the water under every hull, and run the
## rings. contacts are the wake's (x, y at the bow; cx, cy under the keel).
func step(delta: float, cam_pos: Vector2, zoom: float, screen: Vector2, contacts: Array, speeds: Dictionary) -> void:
	var size: Vector2i = Vector2i(maxi(64, int(screen.x / 2.0)), maxi(64, int(screen.y / 2.0)))
	if viewport.size != size:
		viewport.size = size
	_cam.position = cam_pos
	_cam.zoom = Vector2(zoom, zoom) * (float(size.x) / screen.x)
	if under.size != size:
		under.size = size
	_under_cam.position = cam_pos
	_under_cam.zoom = _cam.zoom
	if flow.size != size:
		flow.size = size
	_flow_cam.position = cam_pos
	_flow_cam.zoom = _cam.zoom
	var bm: MultiMesh = _blobs.multimesh
	var n: int = 0
	for c: Dictionary in contacts:
		if n >= BLOB_CAP:
			break
		var push: float = clampf(float(speeds.get(c["id"], 0.0)) / 300.0, 0.0, 1.0)
		var sc: float = float(c.get("scale", 1.0))
		# Under the keel, the hull sitting in the water.
		bm.set_instance_transform_2d(n, Transform2D(0.0, Vector2(170.0 * sc, 60.0 / Chart.GROUND * sc), 0.0, Vector2(float(c["cx"]), float(c["cy"]))))
		bm.set_instance_color(n, Color(1, 1, 1, 0.20 + 0.25 * push))
		n += 1
		# At the bow, the water she shoves aside as she goes.
		if push > 0.05 and n < BLOB_CAP:
			bm.set_instance_transform_2d(n, Transform2D(0.0, Vector2(90.0 * sc, 70.0 / Chart.GROUND * sc), 0.0, Vector2(float(c["x"]), float(c["y"]))))
			bm.set_instance_color(n, Color(1, 1, 1, 0.55 * push))
			n += 1
	for i: int in range(n, BLOB_CAP):
		_hide(bm, i)
	var rm: MultiMesh = _rings.multimesh
	for i: int in RING_CAP:
		var r: Array = _r[i]
		if float(r[2]) >= float(r[3]):
			continue
		r[2] = float(r[2]) + delta
		if float(r[2]) >= float(r[3]):
			_hide(rm, i)
			continue
		var age: float = float(r[2]) / float(r[3])
		var k: float = 30.0 + float(r[4]) * (1.0 - pow(1.0 - age, 2.0))
		rm.set_instance_transform_2d(i, Transform2D(0.0, Vector2(k * 2.0, k * 2.0), 0.0, Vector2(float(r[0]), float(r[1]))))
		rm.set_instance_color(i, Color(1, 1, 1, float(r[5]) * pow(1.0 - age, 1.5)))


func texture() -> Texture2D:
	return viewport.get_texture()


## The lanes, painted once, as one unbroken strip each: at every point the way
## the lane runs there (the two stretches either side averaged, so the turn is
## smooth) and its width out to both sides; neighbouring quads share their
## corners, so nothing overlaps and nothing doubles. Full strength down the
## middle (b), none at the edges.
class FlowPainter:
	extends Node2D

	func _draw() -> void:
		for L: Dictionary in SeaFlow.lanes():
			var pts: PackedVector2Array = L["pts"]
			var dist: PackedFloat32Array = L["dist"]
			var half: float = float(L["half"])
			var n: int = pts.size()
			var tang: PackedVector2Array = PackedVector2Array()
			for i: int in n:
				var a: Vector2 = pts[maxi(0, i - 1)]
				var b: Vector2 = pts[mini(n - 1, i + 1)]
				tang.append((b - a).normalized())
			for i: int in range(1, n):
				var cols: Array = []
				for j: int in [i - 1, i]:
					var d: Vector2 = tang[j]
					cols.append(Color(d.x * 0.5 + 0.5, d.y * 0.5 + 0.5, SeaFlow.taper(L, dist[j]), 1.0))
				var ca: Color = cols[0]
				var cb: Color = cols[1]
				var ea: Color = Color(ca.r, ca.g, 0.0, 1.0)
				var eb: Color = Color(cb.r, cb.g, 0.0, 1.0)
				for side: float in [-1.0, 1.0]:
					var na: Vector2 = tang[i - 1].orthogonal() * half * side
					var nb: Vector2 = tang[i].orthogonal() * half * side
					draw_polygon(PackedVector2Array([pts[i - 1], pts[i], pts[i] + nb, pts[i - 1] + na]), PackedColorArray([ca, cb, eb, ea]))
