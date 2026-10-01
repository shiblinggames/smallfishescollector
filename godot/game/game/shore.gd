class_name Shore
extends RefCounted
## WHERE THE LAND IS (Godot over the web baseline, 2026-10-01): every island's
## painted plate traced into a LightOccluder2D, so Godot's 2D signed distance
## field knows the true shoreline. The water shader reads it for the shallows'
## colour, the foam lapping each beach, and the long shadows islands throw at
## dusk; the sun's shadows reach the boats through the same occluders.
##
## Traced from the plate's own alpha, so the shore is the painting's, not the
## collision circle's. Traced once per picture and cached.

static var _polys: Dictionary = {}


## A LightOccluder2D hugging this sprite's painted shape (a child of it, so it
## takes the sprite's transform).
static func trace(s: Sprite2D) -> void:
	var tex: Texture2D = Lit.diffuse(s.texture)
	if tex == null:
		return
	var key: String = tex.resource_path
	if not _polys.has(key):
		var img: Image = tex.get_image()
		var out: Array = []
		if img != null:
			if img.is_compressed():
				img.decompress()
			# Traced from a coarse copy (a twelfth): the ground survives and the
			# thin things standing on it (palms, masts, spars) average away, so
			# the shore follows the land and not the treetops.
			var small: Image = img.duplicate()
			small.resize(maxi(8, img.get_width() / 12), maxi(8, img.get_height() / 12), Image.INTERPOLATE_BILINEAR)
			var bm: BitMap = BitMap.new()
			bm.create_from_image_alpha(small, 0.62)
			var k: Vector2 = Vector2(img.get_width(), img.get_height()) / Vector2(small.get_width(), small.get_height())
			for poly: PackedVector2Array in bm.opaque_to_polygons(Rect2i(Vector2i.ZERO, small.get_size()), 1.5):
				var p: PackedVector2Array = PackedVector2Array()
				for v: Vector2 in poly:
					p.append(v * k)
				if p.size() >= 3:
					out.append(p)
		_polys[key] = out
	var size: Vector2 = tex.get_size()
	var shift: Vector2 = (-size / 2.0 if s.centered else Vector2.ZERO) + s.offset
	for p: PackedVector2Array in _polys[key]:
		var o: LightOccluder2D = LightOccluder2D.new()
		var op: OccluderPolygon2D = OccluderPolygon2D.new()
		var moved: PackedVector2Array = PackedVector2Array()
		for v: Vector2 in p:
			moved.append(v + shift)
		op.polygon = moved
		op.cull_mode = OccluderPolygon2D.CULL_DISABLED
		o.occluder = op
		o.sdf_collision = true
		s.add_child(o)
