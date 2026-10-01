extends SceneTree
## EVERY PIECE OF THE STYLE KIT ON ONE SCREEN (Godot port), as a picture:
##   godot --path godot/game --resolution 1600x900 -s tests/kit_gallery.gd -- <out.png>


func _init() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.color = Color("#0a090d")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.theme = UiTheme.make()
	root.add_child(bg)
	var cols: HBoxContainer = HBoxContainer.new()
	cols.position = Vector2(30, 24)
	cols.add_theme_constant_override("separation", 26)
	bg.add_child(cols)

	var a: VBoxContainer = VBoxContainer.new()
	a.custom_minimum_size = Vector2(470, 0)
	a.add_theme_constant_override("separation", 8)
	cols.add_child(a)
	for r: String in ["display", "title", "heading", "name", "number", "eyebrow", "eyebrow_hero", "label", "body", "small", "value", "chip"]:
		Kit.text(a, "%s  The Angler's Almanac 1,250" % r, r, Kit.INK if not r.begins_with("eyebrow") else Kit.a(Kit.VIOLET, 0.75))
	Kit.section(a, "Section heading", "An italic note under it.", Kit.VIOLET)
	Kit.stat_row(a, "Catch zone from the rod", "+8°", "good")
	Kit.stat_row(a, "Needle speed", "×0.94")
	Kit.bar(a, 0.62, Kit.BLUE)
	Kit.bar(a, 0.4, Kit.TEAL, true)
	Kit.money(a, 48250)
	Kit.money(a, 120, "total", true)

	var b: VBoxContainer = VBoxContainer.new()
	b.custom_minimum_size = Vector2(470, 0)
	b.add_theme_constant_override("separation", 10)
	cols.add_child(b)
	var m: Pane = Kit.pane(b, Kit.modal(Kit.SAND))
	var mv: VBoxContainer = VBoxContainer.new()
	m.add_child(mv)
	var head: HBoxContainer = HBoxContainer.new()
	mv.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(titles)
	Kit.text(titles, "Buyer", "eyebrow", Kit.a(Kit.SAND, 0.75))
	Kit.text(titles, "Sandy Sole", "title")
	head.add_child(Kit.close_button())
	var btns: HBoxContainer = HBoxContainer.new()
	btns.add_theme_constant_override("separation", 8)
	mv.add_child(btns)
	for k: String in ["primary", "accent", "secondary", "danger"]:
		var bt: Button = Kit.button(k.capitalize(), k, "large", Kit.SAND)
		btns.add_child(bt)
	var small: HBoxContainer = HBoxContainer.new()
	small.add_theme_constant_override("separation", 8)
	mv.add_child(small)
	for k: String in ["primary", "accent", "secondary", "danger"]:
		small.add_child(Kit.button("Buy 1,500", k, "small", Kit.GOLD))
	var chips: HBoxContainer = HBoxContainer.new()
	chips.add_theme_constant_override("separation", 6)
	b.add_child(chips)
	for k: String in ["active", "owned", "next", "locked"]:
		Kit.status(chips, k)
	Kit.chip(chips, "+8° catch zone", Kit.BLUE)
	Kit.chip(chips, "no penalty", Kit.DIM, true)
	Kit.tabs(b, [["c", "Collection"], ["g", "Goldens"], ["p", "Pets"]], "c", Kit.VIOLET, func(_k: Variant) -> void: pass)
	Kit.tabs(b, [["n", "vs Normal"], ["r", "Recent"]], "n", Kit.GOLD, func(_k: Variant) -> void: pass, true)
	b.add_child(Kit.back_pill("The Sea"))

	var c: VBoxContainer = VBoxContainer.new()
	c.custom_minimum_size = Vector2(520, 0)
	c.add_theme_constant_override("separation", 10)
	cols.add_child(c)
	var g: GridContainer = GridContainer.new()
	g.columns = 2
	g.add_theme_constant_override("h_separation", 10)
	g.add_theme_constant_override("v_separation", 10)
	c.add_child(g)
	for st: Array in [["active", Kit.TEAL], ["owned", Kit.BLUE], ["ready", Kit.GOLD], ["locked", Kit.DIM]]:
		var t: Pane = Kit.pane(g, Kit.tile(st[1], st[0]))
		t.custom_minimum_size = Vector2(250, 90)
		Kit.text(t, "Tile: %s" % st[0], "name")
	var d: Pane = Kit.pane(c, Kit.door(Color("#7fd6a0")))
	d.custom_minimum_size = Vector2(0, 150)
	var dv: VBoxContainer = VBoxContainer.new()
	d.add_child(dv)
	Kit.art(dv, "sea/market.png", Vector2(140, 90), Color("#7fd6a0"))
	Kit.text(dv, "The Market", "name")
	var shelf: HBoxContainer = HBoxContainer.new()
	c.add_child(shelf)
	Kit.art(shelf, "fish/albacore-tuna.png", Vector2(110, 90), Kit.rarity(2))
	Kit.art(shelf, "fish/alligator-gar.png", Vector2(110, 90), Kit.rarity(4), true)
	for f: int in 8:
		await process_frame
	root.get_texture().get_image().save_png(OS.get_cmdline_user_args()[0])
	quit()
