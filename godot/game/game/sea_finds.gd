class_name SeaFinds
extends RefCounted
## WHAT IS OUT ON THE FISHING SIDE TO FIND (Godot port of IsleRock, the dig
## hint and the bottles in app/(app)/sea/SeaMap.tsx, the rest of the sea,
## stage 3), drawn in the World node, and the panel that says what you found.


## AN ISLE: its land plate, what stands on it (a chest, or a post with a note;
## an open chest once you have landed, dimmed), and its name with a tick once
## you have been ashore, shown only when you are near or have been.
class IsleNode:
	extends Node2D
	var isle: Dictionary = {}
	var found: bool = false
	var near: bool = false
	var lift: Color = Color.WHITE
	var _prop: Sprite2D
	var _label: Node2D
	var _name: Label
	var _band: Label

	func _ready() -> void:
		position = Vector2(float(isle["x"]), float(isle["y"]))
		var r: float = float(isle["r"])
		var pl: Variant = isle.get("plate")
		if pl != null:
			var plate: Sprite2D = Sprite2D.new()
			plate.texture = Lit.tex(String((pl as Dictionary)["art"]))
			if plate.texture != null:
				var w: float = r * 2.0 * float(pl.get("width", 1.0))
				var sc: float = w / float(plate.texture.get_width())
				plate.scale = Vector2(sc, sc / Chart.GROUND)
				plate.position = Vector2(0, (0.5 - float(pl.get("water", 0.42))) * plate.texture.get_height() * sc / Chart.GROUND)
				plate.z_index = -2
				add_child(plate)
				Shore.trace(plate)
		_prop = Sprite2D.new()
		_prop.centered = true
		add_child(_prop)
		_label = Node2D.new()
		_label.scale = Vector2(1.0, 1.0 / Chart.GROUND)
		_label.position = Vector2(0, -r * 1.05)
		_label.z_index = 6
		add_child(_label)
		var v: VBoxContainer = VBoxContainer.new()
		v.add_theme_constant_override("separation", 0)
		_label.add_child(v)
		_name = Kit.lift(Kit.text(v, isle["name"], "heading", Kit.INK))
		_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_band = Kit.lift(Kit.text(v, String(isle["band"]).replace("_", " ").capitalize(), "small", Color(1.0, 0.81, 0.54, 0.86)))
		_band.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.resized.connect(func() -> void: v.position = Vector2(-v.size.x / 2.0, -v.size.y))
		refresh()

	func refresh() -> void:
		var r: float = float(isle["r"])
		var note: bool = isle["kind"] == "note"
		var art: String = "sea/isle-note.png" if note else ("sea/isle-chest-open.png" if found else ("sea/isle-chest-deep.png" if isle["band"] in ["deep", "abyss", "ancient_deep"] else "sea/isle-chest.png"))
		_prop.texture = Skipper.tex(art)
		if _prop.texture != null:
			var w: float = r * (0.24 if note else 0.30)
			var sc: float = w / float(_prop.texture.get_width())
			_prop.scale = Vector2(sc, sc / Chart.GROUND)
			_prop.offset = Vector2(0, -_prop.texture.get_height() / 2.0)
			_prop.position = Vector2(0, r * 0.08)
		_prop.modulate = Color(0.78, 0.8, 0.76) if found else Color.WHITE
		_name.text = ("✓  " if found else "") + String(isle["name"])
		_name.add_theme_color_override("font_color", Color(0.89, 0.91, 0.88, 0.82) if found else Kit.INK)
		_band.add_theme_color_override("font_color", Color(0.66, 0.78, 0.69, 0.7) if found else Color(1.0, 0.81, 0.54, 0.86))
		_label.visible = near or found

	func _process(_delta: float) -> void:
		_label.modulate = lift


## A BOTTLE bobbing on the water, drifting round where it came to rest.
class BottleNode:
	extends Node2D
	var bottle: Dictionary = {}
	var _spr: Sprite2D

	func _ready() -> void:
		_spr = Sprite2D.new()
		_spr.texture = Skipper.tex("sea/sea-bottle.png")
		if _spr.texture != null:
			var sc: float = 46.0 / float(_spr.texture.get_width())
			_spr.scale = Vector2(sc, sc / Chart.GROUND)
		add_child(_spr)
		if _spr.texture != null:
			_mirror = SeaFinds.reflect(self, _spr, _spr.texture.get_height() * _spr.scale.y * 0.18)
		_place()

	var _mirror: Node2D

	func _place() -> void:
		var at: Dictionary = Explore.bottle_pos(bottle, Clock.now_ms() / 1000.0)
		position = Vector2(float(at["x"]), float(at["y"]))

	func _process(_delta: float) -> void:
		_place()
		_spr.rotation = sin(Clock.now_ms() / 700.0 + float(int(bottle["seed"]) % 100)) * 0.18
		if _mirror != null:
			(_mirror.get_child(0) as Sprite2D).rotation = -_spr.rotation


## A DIG's tell: the water looks odd over a buried site (a slow, faint swirl
## that brightens as you close in), whether or not you hold its bearing.
class DigHint:
	extends Node2D
	var site: Dictionary = {}
	var strength: float = 0.0
	var bubble_t: float = 0.0
	var _t: float = 0.0

	func _ready() -> void:
		position = Vector2(float(site["x"]), float(site["y"]))
		var add: CanvasItemMaterial = CanvasItemMaterial.new()
		add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = add

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	## The tell itself is bubbles breaking the surface, drawn by the sea's
	## reactive water (see Sea._finds): nothing is painted here any more.
	func _draw() -> void:
		pass


## A REFLECTION for something floating (Godot over the web baseline): the
## boats' own (a twin in a CanvasGroup, flipped about the waterline at 55%,
## rippled and faded by fx/hull_mirror.gdshader). waterline is how far below
## the sprite's centre the water meets it.
static func reflect(owner: Node2D, spr: Sprite2D, waterline: float) -> Node2D:
	var g: CanvasGroup = CanvasGroup.new()
	g.fit_margin = 10.0
	var m: ShaderMaterial = ShaderMaterial.new()
	m.shader = load("res://game/fx/hull_mirror.gdshader")
	g.material = m
	g.position = Vector2(0, waterline * 1.55)
	g.scale = Vector2(1.0, -0.55)
	g.show_behind_parent = true
	var t: Sprite2D = Sprite2D.new()
	t.texture = spr.texture
	t.scale = spr.scale
	t.position = spr.position
	g.add_child(t)
	owner.add_child(g)
	owner.move_child(g, 0)
	return g


## WHAT YOU FOUND: one quiet panel for a landing, a dig, or a bottle.
static func panel(parent: Node, art: String, eyebrow: String, title: String, lines: Array, haul: Array) -> Control:
	var root: Control = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	root.theme = UiTheme.make()
	var shade: ColorRect = Kit.scrim(root)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			root.queue_free())
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(center)
	var card: Pane = Kit.pane(center, Kit.card(Kit.SAND, 20))
	card.custom_minimum_size = Vector2(440, 0)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	card.add_child(v)
	if art != "":
		var a: Control = Kit.art(v, art, Vector2(0, 120), Kit.SAND)
		a.ready.connect(func() -> void: Kit.pop(a))
	var e: Label = Kit.text(v, eyebrow, "eyebrow", Kit.a(Kit.SAND, 0.8))
	e.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var t: Label = Kit.text(v, title, "title", Kit.INK)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if not haul.is_empty():
		var row: HBoxContainer = HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_CENTER
		row.add_theme_constant_override("separation", 18)
		v.add_child(row)
		for h: Array in haul:
			Kit.money(row, float(h[0]), "price", h[1] == "gems", "number")
	for l: Variant in lines:
		var line: Array = l if l is Array else [l, "body"]
		var lab: Label = Kit.text(v, str(line[0]), line[1], Kit.INK_2 if line[1] != "note" else Kit.DIM, true)
		lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		if line[1] == "note":
			lab.add_theme_font_override("font", Kit.italic())
	var ok: Button = Kit.button("Back to the water", "secondary")
	ok.pressed.connect(root.queue_free)
	v.add_child(ok)
	ok.grab_focus.call_deferred()
	parent.add_child(root)
	card.ready.connect(func() -> void: Kit.modal_in(card))
	return root
