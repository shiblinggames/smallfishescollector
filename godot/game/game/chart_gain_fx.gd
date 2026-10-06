class_name ChartGainFx
extends Control
## CHARTING, SEEN (Kong, 2026-10-06: "is it very visually rewarding and
## satisfying as you sail around and you gain xp and it's flying into your xp
## bar?"). Where the northern fog lifts, the XP it paid rises off that water
## as a word ("+6") and pours into the Navigation bar (FishingHud.nav_gain).
## Flat words on the water, no icons.

var _words: Array = []


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func word(at: Vector2, text: String, big: bool = false) -> void:
	_words.append({ "at": at, "text": text, "t": 0.0, "big": big })


func _process(delta: float) -> void:
	if _words.is_empty():
		return
	for w: Dictionary in _words:
		w["t"] = float(w["t"]) + delta
	_words = _words.filter(func(w: Dictionary) -> bool: return float(w["t"]) < 1.4)
	queue_redraw()


func _draw() -> void:
	var font: Font = Kit.font("cinzel", 800)
	for w: Dictionary in _words:
		var t: float = float(w["t"])
		var px: int = 30 if w["big"] else 22
		var a: float = clampf(minf(t / 0.15, (1.4 - t) / 0.45), 0.0, 1.0)
		var rise: float = 46.0 * (1.0 - pow(1.0 - minf(1.0, t / 1.4), 2.0))
		var s: String = str(w["text"])
		var sz: float = font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
		var at: Vector2 = (w["at"] as Vector2) + Vector2(-sz / 2.0, -rise)
		draw_string_outline(font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, 7, Color(0.03, 0.05, 0.07, 0.75 * a))
		draw_string(font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color(0.98, 0.8, 0.5, a))
