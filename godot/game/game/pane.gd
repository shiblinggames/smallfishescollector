class_name Pane
extends PanelContainer
## A PANEL PAINTED THE WAY THE WEB'S CSS PAINTS ONE (Godot port, the style
## kit): a container whose background is pane.gdshader, so a panel can have a
## gradient, a wash of light, a sheen, an inner glow, a border, an accent top
## edge and a soft shadow instead of a flat box. Lays its children out like any
## PanelContainer, inside `pad`.
##
## The look is a spec (a Dictionary), normally one of Kit's named surfaces:
##   radius      corner radius, px
##   fill        [color] or [[color, at 0..1], ...] up to 4; angle, CSS degrees
##   glow        [color, Vector2 centre (fractions), Vector2 radii (fractions)]
##   sheen       alpha of the white band down from the top
##   inset       [color, blur px]
##   border      [width px, color];  top  [width px, color]
##   shadow      [color, blur px, Vector2 offset]
##   pad         px, or [left, top, right, bottom]
##
## To round off what is inside a pane (art in a slab), set clip_children on a
## pane WITHOUT a shadow: the clip is to everything the pane draws, and a
## shadow would make it a dark box.

const SHADER: Shader = preload("res://game/pane.gdshader")

var spec: Dictionary = {}
## The spec as given (before it was made paper), to repaint it by.
var raw: Dictionary = {}
var _mat: ShaderMaterial


func _init(s: Dictionary = {}) -> void:
	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	material = _mat
	set_spec(s)
	resized.connect(_sized)


func set_spec(s: Dictionary) -> void:
	raw = s
	s = Pane.paperize(s)
	spec = s
	Pane.apply(_mat, s)
	set_meta("night", s.get("night", false) == true)
	if s.get("night", false):
		# Night paper keeps its words light: they are not inked dark.
		set_meta("paper", false)
	elif s.get("paper", false):
		set_meta("paper", true)
	elif s.get("keep", false) and s.has("grain"):
		set_meta("paper", false)
	elif has_meta("paper"):
		remove_meta("paper")
	# A button's own face speaks for the button (its words are its children).
	var host: Node = get_parent()
	if host is PaneButton and (host as PaneButton)._bg == self:
		if has_meta("paper"):
			host.set_meta("paper", get_meta("paper"))
		elif host.has_meta("paper"):
			host.remove_meta("paper")
	var pad: Variant = s.get("pad", 14)
	var box: StyleBoxEmpty = StyleBoxEmpty.new()
	if pad is Array:
		box.content_margin_left = float(pad[0])
		box.content_margin_top = float(pad[1])
		box.content_margin_right = float(pad[2])
		box.content_margin_bottom = float(pad[3])
	else:
		box.set_content_margin_all(float(pad))
	add_theme_stylebox_override("panel", box)
	queue_redraw()


## Is this under a root that has gone to the night paper (Pane.set_night)?
static func night_root(n: Node) -> bool:
	var p: Node = n.get_parent()
	var hops: int = 0
	while p != null and hops < 30:
		if p.has_meta("night_root"):
			return p.get_meta("night_root") == true
		p = p.get_parent()
		hops += 1
	return false


func _notification(what: int) -> void:
	if what == NOTIFICATION_ENTER_TREE and not raw.get("keep", false) and not (get_parent() is PaneButton) and raw.get("night", false) != Pane.night_root(self) and Pane.night_root(self):
		var r0: Dictionary = raw.duplicate()
		r0["night"] = true
		set_spec(r0)
		return
	if what == NOTIFICATION_ENTER_TREE and not spec.get("paper", false) and not spec.get("keep", false) and not spec.get("_force", false):
		var top: float = 0.0
		for f: Variant in spec.get("fill", []):
			top = maxf(top, (f[0] if f is Array else f as Color).a)
		if top >= 0.02 and Pane._in_room(self):
			var s: Dictionary = spec.duplicate(true)
			s["_force"] = true
			set_spec(s)


static func _in_room(n: Node) -> bool:
	var p: Node = n.get_parent()
	var hops: int = 0
	while p != null and hops < 24:
		if p.has_meta("paper_room"):
			return true
		if p is CanvasLayer:
			return false
		p = p.get_parent()
		hops += 1
	return false


func _sized() -> void:
	_mat.set_shader_parameter("rect_size", size)
	queue_redraw()


func _draw() -> void:
	var m: float = Pane.reach(spec)
	draw_rect(Rect2(Vector2(-m, -m), size + Vector2(m, m) * 2.0), Color.WHITE)


## How far past its rect the pane draws (its shadow).
static func reach(s: Dictionary) -> float:
	var sh: Variant = s.get("shadow")
	if sh == null:
		return 1.0
	var off: Vector2 = sh[2] if (sh as Array).size() > 2 else Vector2.ZERO
	return float(sh[1]) * 1.4 + maxf(absf(off.x), absf(off.y)) + 2.0


## PAPER (2026-10-01): a dark, solid fill is a panel, and panels are paper
## now. Its stops become paper (a tinted stop, paper washed with that tint),
## light hairlines become ink, shadows soften, sheens and inner glows go. A
## spec with "keep" (a wash over art, the wood) is left alone. A spec with
## "night" becomes the expedition side's tarred night paper instead, inked in
## cream (Paper.NIGHT_PAPER).
static func paperize(s: Dictionary) -> Dictionary:
	if s.get("keep", false):
		return s
	if s.get("paper", false):
		# Already paper: on the night side its sheet is the night paper.
		if s.get("night", false) and not s.has("_day"):
			var n: Dictionary = s.duplicate(true)
			n["fill"] = [Paper.NIGHT_PAPER]
			for key: String in ["border", "top"]:
				if n.get(key) != null:
					n[key] = [n[key][0], Color(Paper.NIGHT_INK_FAINT, 0.5)]
			return n
		return s
	var fill: Array = s.get("fill", [Color(0.05, 0.07, 0.09)])
	var dark: bool = s.get("_force", false)
	for f: Variant in fill:
		var c: Color = f[0] if f is Array else f
		if c.a > 0.5 and c.get_luminance() < 0.22:
			dark = true
	if not dark:
		return s
	var out: Dictionary = s.duplicate(true)
	var stops: Array = []
	var base: Color = Paper.NIGHT_PAPER if s.get("night", false) else Kit.PAPER
	var hair: Color = Paper.NIGHT_INK_FAINT if s.get("night", false) else Kit.PAPER_INK
	for f: Variant in fill:
		var c: Color = f[0] if f is Array else f
		var pc: Color
		if c.get_luminance() < 0.22:
			pc = base.darkened(clampf(0.1 - c.get_luminance(), 0.0, 0.06)) if base == Kit.PAPER else base.lightened(clampf(c.get_luminance() * 0.6, 0.0, 0.08))
		else:
			pc = base.lerp(Color(c, 1.0), clampf(c.a * 1.4, 0.0, 0.45))
		pc.a = maxf(0.97, c.a) if c.a > 0.3 else 0.97
		stops.append([pc, float(f[1])] if f is Array else pc)
	out["fill"] = stops
	for key: String in ["border", "top"]:
		var b: Variant = out.get(key)
		if b != null:
			var bc: Color = b[1]
			out[key] = [b[0], Color(hair, clampf(bc.a * 2.4, 0.18, 0.55)) if bc.s < 0.25 else Color(Kit.ink(Color(bc, 1.0)), clampf(bc.a * 1.4, 0.35, 0.85))]
	var sh: Variant = out.get("shadow")
	if sh != null:
		out["shadow"] = [Color(0, 0, 0, minf(0.3, Color(sh[0]).a * 0.5)), sh[1], sh[2] if (sh as Array).size() > 2 else Vector2.ZERO]
	var g: Variant = out.get("glow")
	if g != null:
		out["glow"] = [Color(Kit.ink(Color(g[0], 1.0)), Color(g[0]).a * 0.5), g[1], g[2]]
	out["sheen"] = 0.0
	out.erase("inset")
	out["paper"] = true
	return out


## Set a shader material from a spec.
static func apply(m: ShaderMaterial, s: Dictionary) -> void:
	m.set_shader_parameter("paper", 1.0 if s.get("paper", false) else (0.6 if s.get("grain", false) else 0.0))
	m.set_shader_parameter("radius", float(s.get("radius", 14.0)))
	m.set_shader_parameter("angle", float(s.get("angle", 180.0)))
	var fill: Array = s.get("fill", [Color(0.05, 0.07, 0.09)])
	var stops: Array = []
	for i: int in fill.size():
		var f: Variant = fill[i]
		if f is Array:
			stops.append([f[0], float(f[1])])
		else:
			stops.append([f, 0.0 if fill.size() == 1 else float(i) / float(fill.size() - 1)])
	m.set_shader_parameter("stops", mini(4, stops.size()))
	for i: int in 4:
		var st: Array = stops[mini(i, stops.size() - 1)]
		m.set_shader_parameter("c%d" % i, st[0])
		m.set_shader_parameter("p%d" % i, st[1])
	var glow: Variant = s.get("glow")
	m.set_shader_parameter("glow", glow[0] if glow != null else Color(0, 0, 0, 0))
	if glow != null:
		m.set_shader_parameter("glow_at", glow[1])
		m.set_shader_parameter("glow_r", glow[2])
	m.set_shader_parameter("sheen", float(s.get("sheen", 0.0)))
	var inset: Variant = s.get("inset")
	m.set_shader_parameter("inset", inset[0] if inset != null else Color(0, 0, 0, 0))
	m.set_shader_parameter("inset_blur", float(inset[1]) if inset != null else 0.0)
	var b: Variant = s.get("border")
	m.set_shader_parameter("border", float(b[0]) if b != null else 0.0)
	m.set_shader_parameter("border_color", b[1] if b != null else Color(0, 0, 0, 0))
	var t: Variant = s.get("top")
	m.set_shader_parameter("top_border", float(t[0]) if t != null else 0.0)
	m.set_shader_parameter("top_color", t[1] if t != null else Color(0, 0, 0, 0))
	var sh: Variant = s.get("shadow")
	m.set_shader_parameter("shadow", sh[0] if sh != null else Color(0, 0, 0, 0))
	m.set_shader_parameter("shadow_blur", float(sh[1]) if sh != null else 0.0)
	m.set_shader_parameter("shadow_offset", (sh[2] if (sh as Array).size() > 2 else Vector2.ZERO) if sh != null else Vector2.ZERO)


## A button with a pane behind its text, and a second spec for hover and press.
class PaneButton:
	extends Button
	var normal: Dictionary = {}
	var hot: Dictionary = {}
	var _bg: Pane

	func _init(n: Dictionary, h: Dictionary = {}) -> void:
		normal = n
		hot = h if not h.is_empty() else n
		_bg = Pane.new(n)
		_bg.show_behind_parent = true
		_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(_bg)
		var empty: StyleBoxEmpty = StyleBoxEmpty.new()
		var pad: Variant = n.get("pad", 12)
		if pad is Array:
			empty.content_margin_left = float(pad[0])
			empty.content_margin_top = float(pad[1])
			empty.content_margin_right = float(pad[2])
			empty.content_margin_bottom = float(pad[3])
		else:
			empty.set_content_margin_all(float(pad))
		for st: String in ["normal", "hover", "pressed", "disabled", "hover_pressed"]:
			add_theme_stylebox_override(st, empty)
		# The focus ring follows the button's own shape, so a controller always
		# shows where it is without a pill drawn round a square.
		var ring: StyleBoxFlat = StyleBoxFlat.new()
		ring.draw_center = false
		ring.border_color = Color("#f0c040")
		ring.set_border_width_all(2)
		ring.set_corner_radius_all(int(minf(float(n.get("radius", 12)), 999.0)) + 3)
		ring.set_expand_margin_all(3)
		add_theme_stylebox_override("focus", ring)
		if _bg.has_meta("paper"):
			set_meta("paper", _bg.get_meta("paper"))
		mouse_entered.connect(func() -> void: _bg.set_spec(hot))
		mouse_exited.connect(func() -> void: _bg.set_spec(normal))
		focus_entered.connect(func() -> void: _bg.set_spec(hot))
		focus_exited.connect(func() -> void: _bg.set_spec(normal))

	func _notification(what: int) -> void:
		if what == NOTIFICATION_ENTER_TREE and Pane.night_root(self) and normal.get("night", false) != true:
			var nm: Dictionary = normal.duplicate()
			var ht: Dictionary = hot.duplicate()
			nm["night"] = true
			ht["night"] = true
			restyle(nm, ht)
			set_meta("night", true)
			if not has_meta("day_font"):
				set_meta("day_font", get_theme_color("font_color"))
			var col: Color = Kit.night_ink(get_meta("day_font"))
			for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
				add_theme_color_override(st, col)

	func restyle(n: Dictionary, h: Dictionary = {}) -> void:
		normal = n
		hot = h if not h.is_empty() else n
		_bg.set_spec(normal)



## THE SIDE OF THE REEF (Kong, 2026-10-03: expedition menus are the dark night
## paper, fishing's the day's): every pane and pane button under `root` is
## repainted on the night paper (on) or the day's (off), and every word on
## them re-inked to match.
static func set_night(root: Node, on: bool) -> void:
	root.set_meta("night_root", on)
	for n: Node in root.find_children("", "Pane", true, false):
		var pn: Pane = n
		if pn.get_parent() is PaneButton and (pn.get_parent() as PaneButton)._bg == pn:
			continue
		if pn.raw.get("keep", false):
			continue
		var r: Dictionary = pn.raw.duplicate()
		r["night"] = on
		pn.set_spec(r)
	for n: Node in root.find_children("", "Button", true, false):
		if n is PaneButton:
			var b: PaneButton = n
			var nm: Dictionary = b.normal.duplicate()
			var ht: Dictionary = b.hot.duplicate()
			nm["night"] = on
			ht["night"] = on
			b.restyle(nm, ht)
			if b._bg.has_meta("paper"):
				b.set_meta("paper", b._bg.get_meta("paper"))
			b.set_meta("night", on)
			# The button's own words: kept for the day, lightened for the night.
			if not b.has_meta("day_font"):
				b.set_meta("day_font", b.get_theme_color("font_color"))
			var day: Color = b.get_meta("day_font")
			var col: Color = Kit.night_ink(day) if on else day
			for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
				b.add_theme_color_override(st, col)
	for n: Node in root.find_children("", "Label", true, false):
		if n.has_meta("raw_ink"):
			Kit._settle(n as Label)
