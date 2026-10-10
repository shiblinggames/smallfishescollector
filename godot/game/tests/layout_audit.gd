extends RefCounted
## WORDS THAT DO NOT FIT (Kong, 2026-10-10: "text overflows off a menu or is
## word wrapping and shifting UI"). Run on a screen as it stands (tests/shot.gd
## with LAYOUT=1): every visible Label, RichTextLabel and Button is checked for
##   OVER  its text running past the panel it sits in, or off the screen;
##   BTN   a button whose words are wider than the button;
##   SHIFT a control whose size changes while nothing is happening (a number
##         ticking in a label that is not fixed-width, a line re-wrapping).
## Each issue is printed once as "LAYOUT <kind> <node path> <text>  <detail>".


## The panel a control is drawn inside: the nearest ancestor that clips, or is
## a panel, or the screen.
static func _frame_of(c: Control, screen: Rect2) -> Rect2:
	var p: Node = c.get_parent()
	while p != null:
		if p is Control:
			var pc: Control = p
			if pc.clip_contents or pc is ScrollContainer or pc is PanelContainer or pc is Panel:
				# A scroll's content may run past it by design: only its width counts.
				if pc is ScrollContainer:
					var r: Rect2 = pc.get_global_rect()
					return Rect2(r.position.x, -1e6, r.size.x, 2e6)
				return pc.get_global_rect()
		p = p.get_parent()
	return screen


static func _text_of(c: Control) -> String:
	if c is Label:
		return (c as Label).text
	if c is RichTextLabel:
		return (c as RichTextLabel).get_parsed_text()
	if c is Button:
		return (c as Button).text
	return ""


static func _all(n: Node, out: Array) -> void:
	for ch: Node in n.get_children():
		if ch is Control and not (ch as Control).is_visible_in_tree():
			continue
		if ch is CanvasItem and not (ch as CanvasItem).visible:
			continue
		# Words on the water (under the sea's World, a Node2D) sail off the
		# screen by design: only the menus and the HUD are checked.
		if ch is Node2D:
			continue
		if ch is Label or ch is RichTextLabel or ch is Button:
			out.append(ch)
		_all(ch, out)


## The issues on the screen now (and SHIFT, against an earlier snapshot).
static func snapshot(root: Node) -> Dictionary:
	var out: Array = []
	_all(root, out)
	var sizes: Dictionary = {}
	for c: Control in out:
		sizes[c.get_instance_id()] = [c.size, _text_of(c)]
	return sizes


static func audit(root: Node, before: Dictionary, case_name: String) -> Array:
	var issues: Array = []
	var screen: Rect2 = root.get_viewport().get_visible_rect()
	var out: Array = []
	_all(root, out)
	for c: Control in out:
		var t: String = _text_of(c).strip_edges()
		if t == "" or c.modulate.a < 0.05:
			continue
		var r: Rect2 = c.get_global_rect()
		var where: String = str(c.get_path()).replace("/root/", "")
		var short: String = t.substr(0, 40).replace("\n", " ")
		# OVER: past its frame by more than 3px (the text itself: a label
		# may be wider than its words, so measure the words).
		var fr: Rect2 = _frame_of(c, screen)
		var tw: float = r.size.x
		if c is Label and (c as Label).autowrap_mode == TextServer.AUTOWRAP_OFF and not (c as Label).clip_text:
			var f: Font = c.get_theme_font("font")
			var fs: int = c.get_theme_font_size("font_size")
			var widest: float = 0.0
			for line: String in (c as Label).text.split("\n"):
				widest = maxf(widest, f.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x)
			if widest > r.size.x + 3.0 and c.get_parent() is Container == false:
				issues.append("LAYOUT OVER %s | %s | %s | words %d wide in a %d box" % [case_name, where, short, int(widest), int(r.size.x)])
			tw = maxf(r.size.x, widest)
			var x0: float = r.position.x
			match (c as Label).horizontal_alignment:
				HORIZONTAL_ALIGNMENT_CENTER:
					x0 = r.position.x + (r.size.x - tw) / 2.0
				HORIZONTAL_ALIGNMENT_RIGHT:
					x0 = r.end.x - tw
			r = Rect2(x0, r.position.y, tw, r.size.y)
		if r.position.x < fr.position.x - 3.0 or r.end.x > fr.end.x + 3.0 or r.position.y < fr.position.y - 3.0 or r.end.y > fr.end.y + 3.0:
			var off: String = "past its panel" if fr != screen else "off the screen"
			issues.append("LAYOUT OVER %s | %s | %s | %s (text %s, panel %s)" % [case_name, where, short, off, _r(r), _r(fr)])
		elif not screen.grow(2.0).encloses(r) and _in_scroll(c) == false:
			# A panel that grew to hold its words, off the screen.
			issues.append("LAYOUT OVER %s | %s | %s | off the screen (text %s)" % [case_name, where, short, _r(r)])
		# SQUEEZE: a wrapping label narrower than its longest word: it is
		# being squeezed (a word a line, or words cut).
		if c is Label and (c as Label).autowrap_mode != TextServer.AUTOWRAP_OFF:
			var lf: Font = c.get_theme_font("font")
			var lfs: int = c.get_theme_font_size("font_size")
			var longest: float = 0.0
			for wd: String in (c as Label).text.split(" ", false):
				longest = maxf(longest, lf.get_string_size(wd, HORIZONTAL_ALIGNMENT_LEFT, -1, lfs).x)
			if longest > c.size.x + 2.0 or ((c as Label).get_line_count() > 3 and c.size.x < 120.0):
				issues.append("LAYOUT SQUEEZE %s | %s | %s | a %d-wide wrapping label, %d lines, longest word %d" % [case_name, where, short, int(c.size.x), (c as Label).get_line_count(), int(longest)])
		# BTN: the words wider than the button.
		if c is Button and not (c as Button).clip_text and (c as Button).icon == null:
			var bf: Font = c.get_theme_font("font")
			var bs: int = c.get_theme_font_size("font_size")
			var need: float = bf.get_string_size((c as Button).text, HORIZONTAL_ALIGNMENT_LEFT, -1, bs).x
			if need > c.size.x - 4.0:
				issues.append("LAYOUT BTN %s | %s | %s | words %d wide on a %d button" % [case_name, where, short, int(need), int(c.size.x)])
		# SHIFT: the same text, a different size (it re-wrapped or reflowed),
		# or new text that changed the box's size.
		var id: int = c.get_instance_id()
		if before.has(id):
			var was: Array = before[id]
			var sz: Vector2 = was[0]
			if (absf(sz.x - c.size.x) > 1.5 or absf(sz.y - c.size.y) > 1.5):
				issues.append("LAYOUT SHIFT %s | %s | %s | %s -> %s (text was \"%s\")" % [case_name, where, short, str(sz), str(c.size), str(was[1]).substr(0, 30).replace("\n", " ")])
	return issues


static func _in_scroll(c: Node) -> bool:
	var p: Node = c.get_parent()
	while p != null:
		if p is ScrollContainer:
			return true
		p = p.get_parent()
	return false


static func _r(r: Rect2) -> String:
	return "%d,%d %dx%d" % [int(r.position.x), int(r.position.y), int(r.size.x), int(r.size.y)]
