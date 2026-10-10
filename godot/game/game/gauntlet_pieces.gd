extends RefCounted
## Part of GauntletOverlay: the drawn widgets its phase builders lay on the
## sheet (GCard, OrderStrip, ArtStrip, ChestArt, BankPane, CrewPane). Split out
## of game/gauntlet_overlay.gd on 2026-10-10 for size; the overlay reaches them
## through its own consts of the same names.

## A card on the table: a small kicker, its name, what it does, a foot line.
## A tall card (the draft's powers, synergies and reprieve, the curse) is FRAMELESS
## (M9, Kong 2026-10-09): the painting stands on the sheet's ground, no ring
## or disc; its rarity shows only in the kicker word; a surface comes up only
## under the pointer. Cards without art (an offering, a stall, a stake) keep a
## plain surface to press. Taken, a captain's face is stamped on it.
class GCard:
	extends Button
	var art: Texture2D
	var tone: Color = Dossier.SOFT
	var kicker: String = ""
	var title: String = ""
	var body: String = ""
	var foot: String = ""
	var foot_tone: Color = Dossier.FAINT
	var stamp: Texture2D
	var stamp_name: String = ""
	var live: bool = false
	var dim: bool = false
	var own: bool = false
	var legend: bool = false
	var banish: bool = false
	var wide: bool = false
	var short: bool = false
	var voters: Array = []
	## A bond's role: its mark in the card's corner.
	var role: String = ""
	var delay: float = -1.0
	var _t: float = 0.0
	var _frames: int = 0
	var _hover: float = 0.0

	func _init() -> void:
		flat = true
		focus_mode = Control.FOCUS_NONE
		clip_contents = false

	func _ready() -> void:
		if delay >= 0.0:
			# Dealt: each card comes up in turn, the one arrival with a
			# bounce (BACK is kept for the dealt cards only).
			modulate.a = 0.0
			var y0: float = position.y
			position.y += 12.0
			var tw: Tween = create_tween().set_parallel()
			Motion.ease_fade(tw, self, "modulate:a", 1.0, 0.24).set_delay(delay)
			Motion.ease_pop(tw, self, "position:y", y0, 0.3).set_delay(delay)
			if legend:
				tw.tween_callback(func() -> void: Sound.seal(true)).set_delay(delay + 0.2)

	func _process(d: float) -> void:
		_t += d
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if live or banish else Control.CURSOR_ARROW
		# Hover eases in and out (as every hover in the fight does).
		var want: float = 1.0 if is_hovered() and (live or banish) else 0.0
		if _hover != want:
			_hover = lerpf(_hover, want, Motion.hover_k(d))
			if absf(_hover - want) < 0.01:
				_hover = want
			queue_redraw()
		elif _frames < 12:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		var r: Rect2 = Rect2(Vector2.ZERO, size)
		var rr: Rect2 = Rect2(r.position + Vector2(0, -4.0 * _hover), r.size)
		# The tall cards of the spread (and the curse) stand frameless.
		var frameless: bool = art != null or not short
		if frameless:
			# No resting card: a surface only under the pointer (and the
			# banish mode's hairline, which says what a press will do).
			if _hover > 0.01 or banish:
				var rim0: Color = Color(Dossier.HARM, 0.9) if banish else Color(0, 0, 0, 0)
				BattleLook.draw_box(self, rr, BattleLook.box(Color(BattleLook.LACQUER_HI, 0.9 * _hover), rim0, 2 if banish else 0, 14))
		else:
			var bg: Color = BattleLook.LACQUER_HI.lightened(0.06 * _hover)
			var rim: Color = Color(tone, 0.85 * _hover) if _hover > 0.01 else Color(1, 1, 1, 0.08)
			if banish:
				rim = Color(Dossier.HARM, 0.9)
			BattleLook.draw_box(self, rr, BattleLook.box(bg, rim, 2 if (_hover > 0.5 or banish) else 1, 14, lerpf(8.0, 18.0, _hover), Color(0, 0, 0, 0.45)))
		var a: float = 0.45 if dim else 1.0
		if role != "":
			_role_mark(Vector2(rr.end.x - 26.0, rr.position.y + 26.0), a)
		var x0: float = 18.0
		var y: float = rr.position.y + 20.0
		if wide:
			# Wide: art on the left, words on the right.
			if art != null:
				var c0: Vector2 = Vector2(rr.position.x + 110.0, rr.get_center().y)
				_fit(art, Rect2(c0 - Vector2(78, 78), Vector2(156, 156)), a)
			x0 = 230.0
			y = rr.position.y + 36.0
			y = _words(Vector2(x0, y), size.x - x0 - 22.0, a)
			return
		if art != null and not short:
			var c: Vector2 = Vector2(rr.get_center().x, y + 66.0)
			_fit(art, Rect2(c - Vector2(62, 62), Vector2(124, 124)), a)
			y += 148.0
		elif not short:
			var c2: Vector2 = Vector2(rr.get_center().x, y + 50.0)
			# A reprieve: a plain cross of relief (drawn, no disc behind it).
			draw_line(c2 - Vector2(14, 0), c2 + Vector2(14, 0), tone, 6.0, true)
			draw_line(c2 - Vector2(0, 14), c2 + Vector2(0, 14), tone, 6.0, true)
			y += 110.0
		_words(Vector2(x0, y), size.x - 36.0, a)
		# Votes on it, as names.
		if not voters.is_empty():
			draw_string(Kit.font("karla", 800), Vector2(x0, rr.end.y - 14.0), "Voted:  " + ", ".join(PackedStringArray(voters)), HORIZONTAL_ALIGNMENT_LEFT, size.x - 36.0, 12, Dossier.WARN)
		# Taken: the captain's face, stamped.
		if stamp != null or stamp_name != "":
			draw_rect(rr.grow(-2), Color(0.03, 0.025, 0.02, 0.78))
			var sc: Vector2 = Vector2(rr.get_center().x, rr.position.y + rr.size.y * 0.42)
			BattleLook.medallion(self, sc, 34.0, stamp, BattleLook.GOLD, stamp_name.substr(0, 1), 1.0, Vector2(0.5, 0.5), 0.5)
			BattleLook.say(self, Kit.font("cinzel", 700), sc.x, sc.y + 56.0, "Taken by %s" % stamp_name if stamp_name != "You" else "Yours", 15, BattleLook.GOLD)

	## The role's mark: a shield (tank), a cross (healer), a pennant (support),
	## a gunsight (gunner), drawn in one ink: the shape carries the role (no
	## colour coding).
	func _role_mark(c: Vector2, a: float) -> void:
		var col: Color = Color(Dossier.SOFT, a)
		draw_circle(c, 15.0, Color(col, 0.16 * a))
		match role:
			"tank":
				draw_colored_polygon(PackedVector2Array([c + Vector2(-8, -9), c + Vector2(8, -9), c + Vector2(8, 1), c + Vector2(0, 10), c + Vector2(-8, 1)]), col)
			"healer":
				draw_rect(Rect2(c + Vector2(-2.5, -8), Vector2(5, 16)), col)
				draw_rect(Rect2(c + Vector2(-8, -2.5), Vector2(16, 5)), col)
			"support":
				draw_line(c + Vector2(-6, -9), c + Vector2(-6, 10), col, 2.0, true)
				draw_colored_polygon(PackedVector2Array([c + Vector2(-5, -9), c + Vector2(9, -4), c + Vector2(-5, 1)]), col)
			_:
				draw_arc(c, 7.5, 0.0, TAU, 24, col, 2.0, true)
				draw_line(c + Vector2(0, -11), c + Vector2(0, -4), col, 2.0)
				draw_line(c + Vector2(0, 4), c + Vector2(0, 11), col, 2.0)
				draw_line(c + Vector2(-11, 0), c + Vector2(-4, 0), col, 2.0)
				draw_line(c + Vector2(4, 0), c + Vector2(11, 0), col, 2.0)

	func _words(at: Vector2, w: float, a: float) -> float:
		# Fitted to the card: the words step down a size, then the flavour
		# line goes, before anything runs off the bottom.
		var room: float = size.y - at.y - 18.0
		var sizes: Array = [[17, 13, 12, true], [16, 12, 11, true], [15, 12, 11, false], [14, 11, 10, false]]
		var pick: Array = sizes[sizes.size() - 1]
		for sz: Array in sizes:
			if _fit_h(w, sz) <= room:
				pick = sz
				break
		var y: float = at.y
		if kicker != "":
			y = _para(Kit.font("karla", 800), at.x, y - 13.0, kicker.to_upper(), w, 10, Color(tone, 0.95 * a)) + 10.0
		y = _para(Kit.font("cinzel", 700), at.x, y, title, w, int(pick[0]) if not wide else 20, Color(Dossier.INK, a)) + 6.0
		y = _para(Kit.font("karla", 600), at.x, y, body, w, int(pick[1]), Color(Dossier.SOFT, a)) + 8.0
		if foot != "" and (pick[3] or foot_tone != Dossier.FAINT):
			y = _para(Kit.font("karla", 700), at.x, y, foot, w, int(pick[2]), Color(foot_tone, a))
		return y

	## How tall the words would stand at these sizes.
	func _fit_h(w: float, sz: Array) -> float:
		var h: float = 0.0
		if kicker != "":
			h += _lines(Kit.font("karla", 800), kicker.to_upper(), w, 10) * 14.0 + 10.0
		h += _lines(Kit.font("cinzel", 700), title, w, int(sz[0])) * (int(sz[0]) + 4.0) + 6.0
		h += _lines(Kit.font("karla", 600), body, w, int(sz[1])) * (int(sz[1]) + 4.0) + 8.0
		if foot != "" and (sz[3] or foot_tone != Dossier.FAINT):
			h += _lines(Kit.font("karla", 700), foot, w, int(sz[2])) * (int(sz[2]) + 4.0)
		return h

	func _lines(f: Font, s: String, w: float, fs: int) -> int:
		if s == "":
			return 0
		var n: int = 0
		for part: String in s.split("\n"):
			var cur: String = ""
			n += 1
			for word: String in part.split(" "):
				var tr: String = word if cur == "" else cur + " " + word
				if f.get_string_size(tr, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > w and cur != "":
					n += 1
					cur = word
				else:
					cur = tr
		return n

	func _para(f: Font, x: float, y: float, s: String, w: float, fs: int, c: Color) -> float:
		if s == "":
			return y
		var lines: PackedStringArray = []
		for part: String in s.split("\n"):
			var cur: String = ""
			for word: String in part.split(" "):
				var tr: String = word if cur == "" else cur + " " + word
				if f.get_string_size(tr, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > w and cur != "":
					lines.append(cur)
					cur = word
				else:
					cur = tr
			lines.append(cur)
		for ln: String in lines:
			y += fs + 4.0
			draw_string(f, Vector2(x, y), ln, HORIZONTAL_ALIGNMENT_LEFT, w, fs, c)
		return y

	func _fit(t: Texture2D, box: Rect2, a: float) -> void:
		var sc: float = minf(box.size.x / float(t.get_width()), box.size.y / float(t.get_height()))
		var ts: Vector2 = t.get_size() * sc
		draw_texture_rect(t, Rect2(box.get_center() - ts / 2.0, ts), false, Color(1, 1, 1, a))


## The order of the table: faces in turn, the one at it lit, the ones done
## ticked.
class OrderStrip:
	extends Control
	var faces: Array = []
	var names: Array = []
	var done: Array = []
	var at: int = 0
	var _t: float = 0.0

	func _process(d: float) -> void:
		_t += d
		queue_redraw()

	func _draw() -> void:
		for i: int in faces.size():
			var c: Vector2 = Vector2(66.0 + i * 132.0, 24.0)
			if i < faces.size() - 1:
				draw_line(c + Vector2(30, 0), c + Vector2(102, 0), Color(1, 1, 1, 0.12), 1.5)
			var lit: bool = i == at
			var col: Color = BattleLook.GOLD if lit else (Dossier.HELP if done[i] else Color(1, 1, 1, 0.3))
			if lit:
				draw_circle(c, 27.0 + 2.0 * sin(_t * Motion.PULSE_CALL), Color(BattleLook.GOLD, 0.18))
			BattleLook.medallion(self, c, 21.0, faces[i], col, str(names[i]).substr(0, 1), 1.0 if (lit or not done[i]) else 0.6, Vector2(0.5, 0.5), 0.5)
			BattleLook.say(self, Kit.font("karla", 800), c.x, 62.0, str(names[i]), 12, BattleLook.GOLD if lit else Dossier.SOFT)


## A wide strip of a painting (the shrine, the Fence's hulk), faded at its ends.
class ArtStrip:
	extends Control
	var tex: Texture2D
	var _frames: int = 0

	func _process(_d: float) -> void:
		if _frames < 12:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		if tex == null:
			return
		var sc: float = size.x / float(tex.get_width())
		var src_h: float = size.y / sc
		var src: Rect2 = Rect2(0, maxf(0.0, (tex.get_height() - src_h) * 0.45), tex.get_width(), minf(src_h, tex.get_height()))
		draw_texture_rect_region(tex, Rect2(Vector2.ZERO, size), src, Color(1, 1, 1, 0.9))
		# Its ends fade into the sheet: one gradient each side.
		draw_texture_rect(_edge(), Rect2(0, 0, 80.0, size.y), false, Dossier.FILL)
		draw_texture_rect(_edge(), Rect2(size.x, 0, -80.0, size.y), false, Dossier.FILL)

	static var _et: GradientTexture2D

	## Opaque at its left, clear at its right.
	static func _edge() -> GradientTexture2D:
		if _et == null:
			var g: Gradient = Gradient.new()
			g.set_color(0, Color(1, 1, 1, 1))
			g.set_color(1, Color(1, 1, 1, 0))
			_et = GradientTexture2D.new()
			_et.gradient = g
			_et.width = 64
			_et.height = 1
		return _et


## A chest's painting and its name.
class ChestArt:
	extends Control
	var tex: Texture2D
	var label: String = ""
	## Sunk: dimmed and cold, settling slowly in the dark.
	var sunk: bool = false
	## Rolled: shut until open_at, shaking harder toward it, then open with a
	## burst of light and coin.
	var shut: Texture2D = null
	var open_at: float = -1.0
	var _t: float = 0.0
	var _frames: int = 0

	func _process(d: float) -> void:
		_t += d
		if _frames < 12 or sunk or (open_at > 0.0 and _t < open_at + 2.0):
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		draw_circle(size / 2.0, size.x * 0.42, Color(Color(0.3, 0.55, 0.6) if sunk else BattleLook.GOLD, 0.08))
		if shut != null and _t < open_at:
			# Shut, rattling harder as the lid gives.
			var k: float = clampf(_t / open_at, 0.0, 1.0)
			var sc0: float = minf(size.x / float(shut.get_width()), (size.y - 40.0) / float(shut.get_height()))
			var ts0: Vector2 = shut.get_size() * sc0
			var jig: Vector2 = Vector2(sin(_t * 47.0), cos(_t * 39.0)) * 3.0 * k * k
			draw_set_transform(Vector2(size.x / 2.0, ts0.y) + jig, sin(_t * 31.0) * 0.05 * k * k, Vector2.ONE)
			draw_texture_rect(shut, Rect2(Vector2(-ts0.x / 2.0, -ts0.y), ts0), false)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			BattleLook.say(self, Kit.font("cinzel", 700), size.x / 2.0, size.y - 8.0, label, 17, Dossier.INK)
			return
		if open_at > 0.0:
			# The burst: light, and coin thrown up out of it, falling back.
			var since: float = _t - open_at
			if since < 1.6:
				var c0: Vector2 = Vector2(size.x / 2.0, size.y * 0.42)
				var g: Texture2D = FxSheet.glow()
				var fl: float = 1.0 - smoothstep(0.0, 1.0, since)
				draw_texture_rect(g, Rect2(c0 - Vector2(170, 170), Vector2(340, 340)), false, Color(BattleLook.GOLD, 0.55 * fl))
				for k2: int in 22:
					var ang: float = -PI / 2.0 + (fposmod(k2 * 0.618, 1.0) - 0.5) * 2.2
					var sp: float = 260.0 + 160.0 * fposmod(k2 * 0.37, 1.0)
					var pos: Vector2 = c0 + Vector2.from_angle(ang) * sp * since + Vector2(0, 420.0 * since * since)
					draw_circle(pos, 4.5, Color(1.0, 0.82, 0.32, 1.0 - smoothstep(0.9, 1.6, since)))
		if tex != null:
			var sc: float = minf(size.x / float(tex.get_width()), (size.y - 40.0) / float(tex.get_height()))
			var ts: Vector2 = tex.get_size() * sc
			var dy: float = 6.0 * sin(_t * 0.8) if sunk else 0.0
			draw_texture_rect(tex, Rect2(Vector2((size.x - ts.x) / 2.0, dy), ts), false, Color(0.45, 0.6, 0.65, 0.85) if sunk else Color.WHITE)
			if sunk:
				# Bubbles rising off it.
				for k: int in 7:
					var f: float = fposmod(_t * 0.25 + k * 0.143, 1.0)
					var bx: float = size.x * (0.35 + 0.3 * fposmod(k * 0.37, 1.0)) + sin(_t * 2.0 + k) * 6.0
					var by: float = ts.y * (0.8 - f * 0.9)
					draw_arc(Vector2(bx, by), 3.0 + k % 3, 0.0, TAU, 12, Color(0.8, 0.95, 1.0, 0.5 * (1.0 - f)), 1.2, true)
		BattleLook.say(self, Kit.font("cinzel", 700), size.x / 2.0, size.y - 8.0, label, 17, Dossier.INK)


## What banking now pays this captain: the pot through the chest, the rest,
## and the chase drops' odds.
class BankPane:
	extends Control
	var view: Dictionary = {}
	var pot: float = 0.0
	var variant: String = "davy"
	var chest_tex: Texture2D
	var _frames: int = 0

	func _process(_d: float) -> void:
		if _frames < 12:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		BattleLook.draw_box(self, Rect2(Vector2.ZERO, size), BattleLook.box(BattleLook.LACQUER_HI, Color(1, 1, 1, 0.06), 1, 14))
		if chest_tex != null:
			var sc: float = 96.0 / float(chest_tex.get_height())
			draw_texture_rect(chest_tex, Rect2(Vector2(size.x - 24.0 - chest_tex.get_width() * sc, 18), chest_tex.get_size() * sc), false)
		var chest: Dictionary = Js.obj(view.get("chest"))
		draw_string(Kit.font("karla", 800), Vector2(22, 32), "IF YOU BANK NOW", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		draw_string(Kit.font("cinzel", 700), Vector2(22, 72), "%s ⟡" % Js.thousands(Js.num(view.get("doubloons"))), HORIZONTAL_ALIGNMENT_LEFT, -1, 34, BattleLook.GOLD)
		draw_string(Kit.font("karla", 600), Vector2(22, 96), "%s pot  x%s  %s" % [Js.thousands(pot), str(chest.get("potMult", 1)), str(view.get("chestLabel", ""))], HORIZONTAL_ALIGNMENT_LEFT, size.x - 160.0, 12, Dossier.SOFT)
		draw_string(Kit.font("karla", 700), Vector2(22, 124), "+%s Nav XP   ·   +%s Fathoms   ·   +%s XP to every hand" % [Js.thousands(Js.num(view.get("navXp"))), Js.thousands(Js.num(view.get("fathoms"))), Js.thousands(Js.num(view.get("crewXp")))], HORIZONTAL_ALIGNMENT_LEFT, size.x - 40.0, 13, Dossier.INK)
		draw_line(Vector2(22, 142), Vector2(size.x - 22, 142), Dossier.HAIR, 1.0)
		draw_string(Kit.font("karla", 800), Vector2(22, 164), "THE CHEST COULD HOLD", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		var x: float = 22.0
		var y: float = 190.0
		for o: Dictionary in Js.list(view.get("odds")):
			var t: String = "%s  %s" % [o["name"], ("%.1f%%" % (float(o["chance"]) * 100.0)) if o.get("lockedUntilDepth") == null else "from depth %d" % int(o["lockedUntilDepth"])]
			var tw: float = Kit.font("karla", 700).get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			if x + tw > size.x - 22.0:
				x = 22.0
				y += 22.0
			draw_string(Kit.font("karla", 700), Vector2(x, y), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Dossier.WARN if o.get("kind") == "skin" else Dossier.INK)
			x += tw + 18.0


## The crew's hulls and votes, and the run's curses and this captain's powers.
class CrewPane:
	extends Control
	var rows: Array = []
	var curses: Dictionary = {}
	var boons: Dictionary = {}
	var _frames: int = 0

	## Static once painted: redrawn for its first frames only (the faces'
	## textures land a frame or two late), as the other panes do.
	func _process(_d: float) -> void:
		if _frames < 12:
			_frames += 1
			queue_redraw()

	func _draw() -> void:
		draw_string(Kit.font("karla", 800), Vector2(0, 12), "THE CREW", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		var y: float = 30.0
		for r: Dictionary in rows:
			BattleLook.medallion(self, Vector2(20, y + 20), 18.0, r.get("face"), Color(1, 1, 1, 0.3), str(r["name"]).substr(0, 1), 1.0, Vector2(0.5, 0.5), 0.5)
			draw_string(Kit.font("cinzel", 700), Vector2(48, y + 14), str(r["name"]), HORIZONTAL_ALIGNMENT_LEFT, size.x - 150.0, 15, Dossier.INK)
			var share: float = clampf(float(r["hp"]) / maxf(1.0, float(r["max"])), 0.0, 1.0)
			var col: Color = Dossier.HARM if share < 0.3 else (Dossier.WARN if share < 0.6 else Dossier.HELP)
			BattleLook.bar(self, Rect2(48, y + 22, size.x - 150.0, 8), share, share, 0.0, col, col.darkened(0.5))
			draw_string(Kit.font("karla", 700), Vector2(48, y + 46), "%d / %d hull  ·  %d powers%s" % [int(r["hp"]), int(r["max"]), int(r["boons"]), ("  ·  %d Marks" % int(r["marks"])) if int(r["marks"]) > 0 else ""], HORIZONTAL_ALIGNMENT_LEFT, size.x - 150.0, 12, Dossier.SOFT)
			var v: String = str(r.get("vote", ""))
			if v != "":
				var t: String = "Bank" if v == "bank" else "Dive"
				BattleLook.pill(self, Vector2(size.x - 84, y + 8), t, Dossier.WARN if v == "bank" else Dossier.HELP)
			y += 64.0
		y += 6.0
		draw_string(Kit.font("karla", 800), Vector2(0, y), "CURSES ON THE CREW", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		y += 12.0
		if curses.is_empty():
			draw_string(Kit.font("karla", 600), Vector2(0, y + 14), "None yet.", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Dossier.FAINT)
			y += 26.0
		var x: float = 0.0
		for id: String in curses:
			var cd: Dictionary = Gauntlet.curse_def(id)
			var nm: String = str(cd.get("name", id.capitalize())) + ("  " + Gauntlet.tier_label(int(curses[id])) if int(curses[id]) > 1 else "")
			var w: float = _chip_w(nm)
			if x + w > size.x:
				x = 0.0
				y += 36.0
			_chip(Vector2(x, y), nm, Dossier.HARM, _tex(cd.get("image")))
			x += w + 8.0
		y += 52.0
		draw_string(Kit.font("karla", 800), Vector2(0, y), "YOUR POWERS", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Dossier.SOFT)
		y += 12.0
		x = 0.0
		if boons.is_empty():
			draw_string(Kit.font("karla", 600), Vector2(0, y + 14), "None yet.", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Dossier.FAINT)
		for id2: String in boons:
			var bd: Dictionary = Gauntlet.boon_def(id2)
			var nm2: String = str(bd.get("name", id2.capitalize())) + "  " + Gauntlet.tier_label(int(boons[id2]))
			var w2: float = _chip_w(nm2)
			if x + w2 > size.x:
				x = 0.0
				y += 36.0
			_chip(Vector2(x, y), nm2, Kit.rarity("rare"), _tex(bd.get("image")))
			x += w2 + 8.0

	var _texs: Dictionary = {}

	func _tex(path: Variant) -> Texture2D:
		var p: String = str(path if path != null else "").trim_prefix("/")
		if p == "":
			return null
		if not _texs.has(p):
			_texs[p] = Skipper.tex(p)
		return _texs[p]

	func _chip_w(t: String) -> float:
		return Kit.font("karla", 700).get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x + 46.0

	## A chip: the power's or the curse's own icon, its name.
	func _chip(at: Vector2, t: String, tone: Color, icon: Texture2D) -> void:
		var r: Rect2 = Rect2(at, Vector2(_chip_w(t), 30))
		BattleLook.draw_box(self, r, BattleLook.box(Color(tone, 0.14), Color(tone, 0.35), 1, 15))
		if icon != null:
			draw_texture_rect(icon, Rect2(at + Vector2(4, 3), Vector2(24, 24)), false)
		else:
			draw_circle(at + Vector2(16, 15), 5.0, tone)
		draw_string(Kit.font("karla", 700), at + Vector2(34, 20), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, tone.lightened(0.45))
