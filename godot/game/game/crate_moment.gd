class_name CrateMoment
extends Pane
## THE CRATE MOMENT (Godot port of components/CrateOpening.tsx, fishing pass 2).
##
## The crate is already opened by the rules (reelCrate) when this starts; this
## is the showing of it. Closed, bobbing; after 700ms it pries itself open (a
## press opens it sooner): the crate shakes while a strip of prizes spins at
## the tier's speed and lands on the real one, the crate pops open with a
## burst, and the reward springs up. A rare find (a color, a bandana, a boat,
## a pet) then gets the full-screen reveal. A pet already aboard is a line
## under the reward. The web plays no sound here, so neither does this.

signal done

const TIERS: Dictionary = {
	"wooden": ["Wooden Crate", "#c08a5a", "crate", 0.85, 0.55, 14, "#e0b183"],
	"metal": ["Metal Crate", "#b8c4d0", "metalcrate", 1.1, 0.75, 26, "#eef4ff"],
	"gold": ["Gold Crate", "#f0c040", "goldcrate", 1.4, 1.0, 46, "#fff0c2"],
	"diamond": ["Diamond Crate", "#7dd3fc", "diamondcrate", 1.75, 1.25, 72, "#ffffff"],
	"ancient": ["Ancient Chest", "#d8cfbb", "ancientcrate", 2.2, 1.5, 96, "#f6ecd2"],
}
const LAND_S: float = 0.76
const FILLERS: Array = [["+75 ⟡", "smallpile.png"], ["+150 ⟡", "smallpile.png"], ["+250 ⟡", "smallpile.png"], ["+350 ⟡", "smallpile.png"], ["+500 ⟡", "smallpile.png"],
	["5× Worms", "worms.png"], ["5× Minnow", "minnow.png"], ["5× Night Crawler", "nightcrawler.png"], ["5× Chum", "chum.png"], ["5× Angler's Formula", "anglersformula.png"]]

var tier: String = "wooden"
var loot: Dictionary = {}

var _crate: TextureRect
var _strip: Control
var _reel: HBoxContainer
var _reveal: VBoxContainer
var _phase: String = "closed"
var _burst: GPUParticles2D


static func _tex(file: String) -> Texture2D:
	var path: String = "res://art/%s" % file.trim_prefix("/")
	return load(path) if ResourceLoader.exists(path) else null


func _ready() -> void:
	var t: Array = TIERS.get(tier, TIERS["wooden"])
	var accent: Color = Color(t[1])
	set_spec(Kit.card(accent, 18))
	custom_minimum_size = Vector2(360, 0)
	var col: VBoxContainer = VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 8)
	add_child(col)
	_text(col, "YOU REELED UP A", 11, Color(1, 1, 1, 0.42), false)
	_text(col, t[0], 22, accent, true)
	var holder: CenterContainer = CenterContainer.new()
	holder.custom_minimum_size = Vector2(0, 110)
	col.add_child(holder)
	_crate = TextureRect.new()
	_crate.texture = _tex("%sclosed.png" % t[2])
	_crate.custom_minimum_size = Vector2(110, 110)
	_crate.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_crate.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_crate.pivot_offset = Vector2(55, 55)
	holder.add_child(_crate)
	_burst = GPUParticles2D.new()
	_burst.one_shot = true
	_burst.emitting = false
	_burst.explosiveness = 1.0
	_burst.amount = int(t[5])
	_burst.lifetime = 0.9
	_burst.texture = Glow.radial(16, Color.WHITE)
	var add: CanvasItemMaterial = CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_burst.material = add
	var m: ParticleProcessMaterial = ParticleProcessMaterial.new()
	m.spread = 180.0
	m.initial_velocity_min = 90.0
	m.initial_velocity_max = 260.0
	m.gravity = Vector3(0, 160, 0) if tier != "ancient" else Vector3(0, -60, 0)
	m.scale_min = 0.3
	m.scale_max = 0.7
	m.color = Color(t[6])
	var fade: Gradient = Gradient.new()
	fade.set_color(0, Color.WHITE)
	fade.set_color(1, Color(1, 1, 1, 0))
	var ramp: GradientTexture1D = GradientTexture1D.new()
	ramp.gradient = fade
	m.color_ramp = ramp
	_burst.process_material = m
	_burst.position = Vector2(55, 55)
	_crate.add_child(_burst)

	_strip = Control.new()
	_strip.custom_minimum_size = Vector2(300, 72)
	_strip.clip_contents = true
	_strip.visible = false
	col.add_child(_strip)
	_reel = HBoxContainer.new()
	_reel.add_theme_constant_override("separation", 8)
	_strip.add_child(_reel)

	_reveal = VBoxContainer.new()
	_reveal.add_theme_constant_override("separation", 4)
	_reveal.visible = false
	col.add_child(_reveal)

	var bob: Tween = create_tween().set_loops()
	bob.tween_property(_crate, "position:y", -4.0, 1.2).set_trans(Tween.TRANS_SINE)
	bob.tween_property(_crate, "position:y", 0.0, 1.2).set_trans(Tween.TRANS_SINE)
	get_tree().create_timer(0.7).timeout.connect(open)


func _text(parent: Control, text: String, px: int, col: Color, title: bool) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	Kit.face(l, px, title)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(l)
	return l


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		open()


## What the loot is, as a title, a subtitle, a picture and a tint.
func _loot_view() -> Dictionary:
	match loot.get("type", ""):
		"doubloons":
			return { "title": "+%s ⟡" % Js.thousands(float(loot["amount"])), "sub": "Doubloons", "art": "smallpile.png", "tint": "#fbbf24", "rare": false }
		"bait":
			return { "title": "%d× %s" % [int(loot["quantity"]), loot["baitName"]], "sub": "Bait", "art": String(Rules.bait(loot["baitType"]).get("imageUrl", "/worms.png")), "tint": "#86efac", "rare": false }
		"skin":
			return { "title": loot["skinName"], "sub": "Character colorway", "art": "fishing_%s_rest.png" % loot["skinId"], "tint": "#4ade80", "rare": true, "why": "New character color unlocked." }
		"hat":
			return { "title": loot["hatName"], "sub": "Bandana", "art": loot["hatImageUrl"], "tint": "#4ade80", "rare": true, "why": "New bandana unlocked." }
		"boat":
			return { "title": loot["boatName"], "sub": "Boat", "art": loot["boatImageUrl"], "tint": "#4ade80", "rare": true, "why": "New boat unlocked." }
		"pet":
			return { "title": loot["petName"], "sub": "New pet", "art": loot["petImageUrl"], "tint": loot["petAccent"], "rare": true, "why": "Equip it from your Appearance loadout.", "pet": true }
	return { "title": "", "sub": "", "art": "", "tint": "#ffffff", "rare": false }


func open() -> void:
	if _phase != "closed":
		return
	_phase = "rolling"
	Rumble.tap(6)
	var t: Array = TIERS.get(tier, TIERS["wooden"])
	var spin: float = t[3]
	var shake: float = t[4]
	# The shake, repeating until it lands.
	var sh: Tween = create_tween().set_loops(int(ceil((spin + LAND_S) / maxf(0.1, 0.34 - 0.06 * shake))))
	var step: float = maxf(0.1, 0.34 - 0.06 * shake) / 7.0
	for deg: float in [-5.0, 5.0, -4.0, 4.0, -3.0, 3.0, 0.0]:
		sh.tween_property(_crate, "rotation_degrees", deg * shake, step)
	# The strip: seventeen fillers, then the real reward.
	_strip.visible = true
	var view: Dictionary = _loot_view()
	for n: int in 17:
		var f: Array = FILLERS[randi() % FILLERS.size()]
		_reel.add_child(_tile(f[0], f[1], Color(1, 1, 1, 0.8)))
	_reel.add_child(_tile(view["title"], view["art"], Color(view["tint"])))
	_reel.add_child(_tile("", "", Color.WHITE))
	await get_tree().process_frame
	var tile_w: float = 96.0 + 8.0
	var end_x: float = -(17.0 * tile_w) + (_strip.size.x - 96.0) / 2.0
	_reel.position.x = 0.0
	var roll: Tween = create_tween()
	roll.tween_property(_reel, "position:x", end_x - tile_w * 3.0, spin)
	roll.tween_property(_reel, "position:x", end_x, LAND_S).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	await roll.finished
	sh.kill()
	_crate.rotation_degrees = 0.0
	_land(view, shake)


func _tile(title: String, art: String, tint: Color) -> Control:
	var box: VBoxContainer = VBoxContainer.new()
	box.custom_minimum_size = Vector2(96, 72)
	box.add_theme_constant_override("separation", 0)
	var tex: Texture2D = _tex(art) if art != "" else null
	var img: TextureRect = TextureRect.new()
	img.custom_minimum_size = Vector2(96, 44)
	img.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	img.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	img.texture = tex
	box.add_child(img)
	var l: Label = Label.new()
	l.text = title
	Kit.style(l, "chip", tint)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.clip_text = true
	box.add_child(l)
	return box


func _land(view: Dictionary, shake: float) -> void:
	_phase = "revealed"
	var rare: bool = view["rare"]
	Rumble.tap(round((30.0 if rare else 12.0) * shake))
	_burst.restart()
	var t: Array = TIERS.get(tier, TIERS["wooden"])
	_crate.texture = _tex("%sopen.png" % t[2])
	_crate.scale = Vector2(0.85, 0.85)
	var pop: Tween = create_tween()
	pop.tween_property(_crate, "scale", Vector2.ONE * (1.0 + 0.12 * shake), 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	pop.tween_property(_crate, "scale", Vector2.ONE, 0.22)
	_strip.visible = false
	_reveal.visible = true
	if rare:
		_text(_reveal, "RARE FIND", 11, Color(view["tint"]), true)
	var title: Label = _text(_reveal, view["title"], 24, Color(view["tint"]), true)
	_text(_reveal, String(view["sub"]).to_upper(), 11, Color(1, 1, 1, 0.5), false)
	title.pivot_offset = Vector2(160, 14)
	title.scale = Vector2(0.62, 0.62)
	create_tween().tween_property(title, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT).set_delay(0.08)
	if loot.has("dupePet"):
		_text(_reveal, "%s surfaced too. Already aboard." % (loot["dupePet"] as Dictionary)["petName"], 12, Color(1, 1, 1, 0.38), false)
	if rare:
		await get_tree().create_timer(0.6).timeout
		await _rare_reveal(view)
	done.emit()


## The full-screen reveal for a rare find: slow rays in its colour, the prize
## on a spring, and a button.
func _rare_reveal(view: Dictionary) -> void:
	var top: CanvasLayer = CanvasLayer.new()
	top.layer = 50
	get_tree().root.add_child(top)
	var layer: Control = Control.new()
	layer.theme = UiTheme.make()
	top.add_child(layer)
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.008, 0.016, 0.03, 0.86)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(shade)
	var rays: Rays = Rays.new()
	rays.tint = Color(view["tint"])
	rays.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(rays)
	var col: VBoxContainer = VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.add_theme_constant_override("separation", 10)
	layer.add_child(col)
	_text(col, "PET UNLOCKED" if view.get("pet", false) else "RARE FIND", 13, Color(view["tint"]), true)
	var img: TextureRect = TextureRect.new()
	img.texture = _tex(view["art"])
	img.custom_minimum_size = Vector2(0, 150)
	img.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	img.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	col.add_child(img)
	_text(col, view["title"], 30, Color("#f2ece0"), true)
	_text(col, view.get("why", ""), 15, Color(1, 1, 1, 0.65), false)
	var center: CenterContainer = CenterContainer.new()
	col.add_child(center)
	var ok: Button = Kit.button("Nice", "accent", "large", Color(view["tint"]))
	ok.custom_minimum_size = Vector2(180, 48)
	center.add_child(ok)
	ok.grab_focus.call_deferred()
	img.pivot_offset = Vector2(img.size.x / 2.0, 75)
	img.scale = Vector2(0.5, 0.5)
	create_tween().tween_property(img, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	await ok.pressed
	top.queue_free()


## Rays turning slowly behind a rare find (a full turn every 24 seconds).
class Rays:
	extends Control
	var tint: Color = Color.WHITE
	var t: float = 0.0

	func _process(delta: float) -> void:
		t += delta
		queue_redraw()

	func _draw() -> void:
		var c: Vector2 = size / 2.0
		var turn: float = t / 24.0 * TAU
		for i: int in 16:
			var a: float = turn + i * TAU / 16.0
			var pts: PackedVector2Array = PackedVector2Array([c, c + Vector2.from_angle(a - 0.08) * 460.0, c + Vector2.from_angle(a + 0.08) * 460.0])
			draw_colored_polygon(pts, Color(tint, 0.10))
		draw_circle(c, 150.0, Color(tint, 0.08))
