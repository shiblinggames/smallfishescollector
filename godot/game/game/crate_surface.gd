class_name CrateSurface
extends Node2D
## A CRATE ON THE WATER (Kong, 2026-10-01: crates go into the stash and are
## opened when the captain chooses; the opening is a moment on the water, not
## a strip of prizes rolling past). Put in the world beside her boat.
##
## mode "stow": a crate just reeled up breaks the surface with a splash, rides
## the swell a moment, and is hauled aboard (it lifts out, swings to the boat
## and is gone into the stash).
## mode "open": a stowed crate is put over the side and opened. It surfaces,
## strains at its lid (how hard depends on the tier), and bursts: a bloom of
## light in its colour, its own spray (wood splinters, metal sparks, gold
## glints, diamond frost, the ancient chest's slow green motes rising), a
## ring across the water, and the prize rises out of it on a paper tag. A rare
## find then has the full-screen reveal. The crate settles back under.
##
## What is inside was decided by the rules before this starts (openCrate);
## this only shows it.

signal done

var tier: String = "wooden"
var mode: String = "open"
var loot: Dictionary = {}
var boat: Boat
## Which side of her it comes up on (-1 left, 1 right; 0 = ahead of her).
var side: float = 0.0

const SPRAY: Dictionary = {
	# colour, amount, speed, gravity (up is negative), life, size
	"wooden": [Color(0.62, 0.43, 0.24), 26, 260.0, 520.0, 0.9, 0.55],
	"metal": [Color(0.92, 0.96, 1.0), 40, 420.0, 300.0, 0.55, 0.35],
	"gold": [Color(1.0, 0.84, 0.4), 50, 240.0, 120.0, 1.2, 0.45],
	"diamond": [Color(0.8, 0.95, 1.0), 64, 300.0, 80.0, 1.3, 0.4],
	"ancient": [Color(0.75, 1.0, 0.85), 70, 120.0, -90.0, 2.2, 0.5],
}
const STRAIN: Dictionary = { "wooden": [0.6, 3.0], "metal": [0.8, 4.0], "gold": [1.0, 5.0], "diamond": [1.2, 6.0], "ancient": [1.6, 7.0] }

var _body: Node2D
var _spr: Sprite2D
var _collar: Sprite2D
var _mat: ShaderMaterial
var _cmat: ShaderMaterial
var _t: float = 0.0
var _bob: bool = true


func _ready() -> void:
	z_index = 2
	var f: float = side if side != 0.0 else boat.facing()
	# Ahead of her and a little toward the viewer when opened from the
	# Locker (side -1: the camera has her on the left of the screen).
	position = boat.position + (Vector2(-120.0, 110.0) if side < 0.0 else Vector2(f * 200.0, 36.0))
	_body = Node2D.new()
	_body.scale = Vector2(1.0, 1.0 / Chart.GROUND)
	add_child(_body)
	var t: Array = CrateMoment.TIERS.get(tier, CrateMoment.TIERS["wooden"])
	_spr = Sprite2D.new()
	_spr.texture = CrateMoment._tex("%sclosed.png" % t[2])
	if _spr.texture == null:
		_finish()
		return
	var sc: float = 80.0 / float(_spr.texture.get_width())
	_spr.scale = Vector2(sc, sc)
	_mat = Skipper.afloat_mat("res://game/fx/waterline.gdshader", _spr, 0.02, 0.2, randf() * 6.0)
	_spr.material = _mat
	_collar = Skipper.collar_of(_spr, 0.02, 0.2, randf() * 6.0)
	_cmat = _collar.material
	_body.add_child(_collar)
	_body.add_child(_spr)
	_body.position.y = 34.0
	_splash(1.0)
	if mode == "stow":
		_stow()
	else:
		_open()


func _process(delta: float) -> void:
	_t += delta
	if _bob and _spr != null:
		_spr.position.y = sin(_t * 2.2) * 2.5
		_spr.rotation = sin(_t * 1.6) * 0.03 + _spr.rotation * 0.0


## How much of it is out of the water (0 under, about 0.72 floating).
func _set_cut(c: float) -> void:
	if _mat != null:
		_mat.set_shader_parameter("cut", c)
	if _cmat != null:
		_cmat.set_shader_parameter("cut", c)


func _rise(s: float) -> void:
	var tw: Tween = create_tween().set_parallel().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_method(_set_cut, 0.02, 0.7, s)
	tw.tween_property(_body, "position:y", 0.0, s)
	await tw.finished


func _stow() -> void:
	await _rise(0.7)
	await get_tree().create_timer(0.8).timeout
	# Hauled aboard: out of the water, swung across to her, gone.
	_bob = false
	var tw: Tween = create_tween().set_parallel().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_method(_set_cut, 0.7, 1.2, 0.25)
	tw.tween_property(_body, "position:y", -70.0, 0.35).set_ease(Tween.EASE_OUT)
	await tw.finished
	_splash(0.4)
	var to: Vector2 = boat.position - position
	var tw2: Tween = create_tween().set_parallel().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw2.tween_property(_body, "position", Vector2(to.x, to.y - 40.0), 0.45)
	tw2.tween_property(_body, "scale", _body.scale * 0.35, 0.45)
	tw2.tween_property(_body, "modulate:a", 0.0, 0.45)
	await tw2.finished
	Rumble.tap(8)
	_finish()


func _open() -> void:
	await _rise(0.8)
	# It strains at its lid: longer and harder the better the crate.
	var st: Array = STRAIN.get(tier, STRAIN["wooden"])
	_bob = false
	var shake: Tween = create_tween()
	var steps: int = int(float(st[0]) / 0.07)
	for i: int in steps:
		var k: float = float(i) / maxf(1.0, steps)
		shake.tween_property(_spr, "rotation_degrees", (float(st[1]) * (0.4 + k)) * (1.0 if i % 2 == 0 else -1.0), 0.07)
	await shake.finished
	_spr.rotation = 0.0
	_burst()
	await _tag()
	if _rare():
		await _rare_reveal()
	# Back under.
	var tw: Tween = create_tween().set_parallel()
	tw.tween_method(_set_cut, 0.7, 0.0, 1.1).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_property(_body, "position:y", 30.0, 1.1)
	tw.tween_property(_body, "modulate:a", 0.0, 1.1).set_delay(0.4)
	await tw.finished
	_finish()


func _finish() -> void:
	done.emit()
	queue_free()


## Spray thrown up as it breaks the surface, and the ring across the water.
func _splash(k: float) -> void:
	if boat.field != null:
		boat.field.ring(position, 150.0 * k, 1.5, 0.8 * k)
	var p: GPUParticles2D = _particles(Color(0.88, 0.95, 1.0), int(18 * k), 220.0 * k, 520.0, 0.8, 0.35)
	p.position = Vector2(0, 30)
	_body.add_child(p)
	p.emitting = true


func _particles(c: Color, n: int, speed: float, grav: float, life: float, size: float) -> GPUParticles2D:
	var p: GPUParticles2D = GPUParticles2D.new()
	p.one_shot = true
	p.explosiveness = 0.92
	p.amount = maxi(1, n)
	p.lifetime = life
	p.texture = Glow.radial(16, Color.WHITE)
	var m: ParticleProcessMaterial = ParticleProcessMaterial.new()
	m.direction = Vector3(0, -1, 0)
	m.spread = 70.0 if grav > 0.0 else 180.0
	m.initial_velocity_min = speed * 0.5
	m.initial_velocity_max = speed
	m.gravity = Vector3(0, grav, 0)
	m.scale_min = size * 0.6
	m.scale_max = size * 1.4
	m.color = c
	var fade: Gradient = Gradient.new()
	fade.set_color(0, Color.WHITE)
	fade.set_color(1, Color(1, 1, 1, 0))
	var ramp: GradientTexture1D = GradientTexture1D.new()
	ramp.gradient = fade
	m.color_ramp = ramp
	p.process_material = m
	p.finished.connect(p.queue_free)
	return p


## It bursts: the lid off, a bloom of light, its own spray, a ring.
func _burst() -> void:
	var t: Array = CrateMoment.TIERS.get(tier, CrateMoment.TIERS["wooden"])
	var open_tex: Texture2D = CrateMoment._tex("%sopen.png" % t[2])
	if open_tex != null:
		_spr.texture = open_tex
	Rumble.tap(int(10 + float(STRAIN.get(tier, STRAIN["wooden"])[1]) * 3.0))
	var bloom: Sprite2D = Sprite2D.new()
	bloom.texture = Glow.radial(128, Color(t[6]))
	var add: CanvasItemMaterial = CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	bloom.material = add
	bloom.position = Vector2(0, -20)
	bloom.scale = Vector2(0.2, 0.2)
	_body.add_child(bloom)
	_body.move_child(bloom, 0)
	var bt: Tween = create_tween().set_parallel()
	bt.tween_property(bloom, "scale", Vector2(2.4, 2.4), 0.5).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	bt.tween_property(bloom, "modulate:a", 0.0, 1.4).set_delay(0.3)
	bt.chain().tween_callback(bloom.queue_free)
	var sp: Array = SPRAY.get(tier, SPRAY["wooden"])
	var p: GPUParticles2D = _particles(sp[0], sp[1], sp[2], sp[3], sp[4], sp[5])
	p.position = Vector2(0, -24)
	_body.add_child(p)
	p.emitting = true
	var pop: Tween = create_tween()
	_spr.scale *= 0.88
	pop.tween_property(_spr, "scale", _spr.scale / 0.88 * 1.08, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	pop.tween_property(_spr, "scale", _spr.scale / 0.88, 0.2)
	if boat.field != null:
		boat.field.ring(position, 260.0, 1.9, 1.0)


func _view() -> Dictionary:
	var m: CrateMoment = CrateMoment.new()
	m.loot = loot
	var v: Dictionary = m._loot_view()
	m.free()
	return v


func _rare() -> bool:
	return _view().get("rare", false)


## The prize rises out of the crate on a paper tag, and hangs there a moment.
func _tag() -> void:
	var v: Dictionary = _view()
	var holder: Node2D = Node2D.new()
	holder.z_index = 20
	holder.position = Vector2(0, -56)
	_body.add_child(holder)
	var tag: Pane = Kit.pane(holder, { "radius": 12, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.4)], "shadow": [Color(0, 0, 0, 0.35), 14, Vector2(0, 5)], "pad": [16, 10, 16, 12], "paper": true })
	# Unseen until measured and placed (it flashed for a frame before).
	tag.modulate.a = 0.0
	tag.light_mask = 0
	var col: VBoxContainer = VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 2)
	tag.add_child(col)
	if str(v.get("art", "")) != "":
		var a: TextureRect = TextureRect.new()
		a.texture = Skipper.look_art(loot["skinId"]) if loot.get("type") == "skin" else CrateMoment._tex(v["art"])
		a.custom_minimum_size = Vector2(150, 64)
		a.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		a.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		col.add_child(a)
	var ti: Label = Kit.text(col, str(v["title"]), "title", Color(v["tint"]))
	ti.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var su: Label = Kit.text(col, str(v["sub"]), "eyebrow", Kit.PAPER_INK_SOFT)
	su.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if loot.has("dupePet"):
		Kit.text(col, "%s surfaced too. Already aboard." % (loot["dupePet"] as Dictionary)["petName"], "note", Kit.PAPER_INK_SOFT)
	await get_tree().process_frame
	tag.position = Vector2(-tag.size.x / 2.0, -tag.size.y)
	tag.pivot_offset = Vector2(tag.size.x / 2.0, tag.size.y)
	tag.scale = Vector2(0.4, 0.4)
	tag.modulate.a = 0.0
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(tag, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(tag, "modulate:a", 1.0, 0.25)
	tw.tween_property(holder, "position:y", -86.0, 0.9).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	await get_tree().create_timer(2.8).timeout
	var out: Tween = create_tween()
	out.tween_property(tag, "modulate:a", 0.0, 0.4)
	await out.finished
	holder.queue_free()


## A rare find: the screen dims, light turns slowly behind it, the prize on a
## sheet of paper, and a button.
func _rare_reveal() -> void:
	var v: Dictionary = _view()
	var top: CanvasLayer = CanvasLayer.new()
	top.layer = 50
	get_tree().root.add_child(top)
	var layer: Control = Control.new()
	layer.theme = UiTheme.make()
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	top.add_child(layer)
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.008, 0.016, 0.03, 0.78)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(shade)
	var rays: CrateMoment.Rays = CrateMoment.Rays.new()
	rays.tint = Color(v["tint"])
	rays.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(rays)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(center)
	var card: Pane = Kit.pane(center, { "radius": 16, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.4)], "shadow": [Color(0, 0, 0, 0.5), 30, Vector2(0, 10)], "pad": 26, "paper": true })
	var col: VBoxContainer = VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 8)
	col.custom_minimum_size = Vector2(380, 0)
	card.add_child(col)
	var eb: Label = Kit.text(col, "Pet unlocked" if v.get("pet", false) else "Rare find", "eyebrow", Color(v["tint"]))
	eb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var img: TextureRect = TextureRect.new()
	img.texture = Skipper.look_art(loot["skinId"]) if loot.get("type") == "skin" else CrateMoment._tex(v["art"])
	img.custom_minimum_size = Vector2(0, 160)
	img.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	img.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	col.add_child(img)
	var ti: Label = Kit.text(col, str(v["title"]), "title", Kit.PAPER_INK)
	ti.add_theme_font_size_override("font_size", 28)
	ti.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var why: Label = Kit.text(col, str(v.get("why", "")), "body", Kit.PAPER_INK_SOFT, true)
	why.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var ok: Button = Kit.button("Nice", "primary", "large")
	ok.custom_minimum_size = Vector2(180, 48)
	ok.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(ok)
	ok.grab_focus.call_deferred()
	card.pivot_offset = Vector2(200, 200)
	card.scale = Vector2(0.6, 0.6)
	create_tween().tween_property(card, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	await ok.pressed
	top.queue_free()
