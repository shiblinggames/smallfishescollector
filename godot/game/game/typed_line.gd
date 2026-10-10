class_name TypedLine
extends Label
## A LINE TYPED OUT (Godot port of useTypewriter in components/cutscene.tsx):
## 22ms a character, 80 after a comma, 190 after a stop, so a line breathes
## where it should. `finish()` shows the rest at once; `typing` says whether
## it is still going, and `done` fires when it lands.

signal done

const TYPE_MS: float = 22.0
const PUNCT_MS: float = 190.0
const COMMA_MS: float = 80.0

var typing: bool = false
var _at: PackedFloat32Array = PackedFloat32Array()
var _t: float = 0.0


## When each character of a plain line shows, in ms from the line's start: the
## one cadence every typed line shares (StoryScene and the Ancient Deep's Finn
## drive their own labels from it).
static func schedule(plain: String) -> PackedFloat32Array:
	var at: PackedFloat32Array = PackedFloat32Array()
	at.resize(plain.length())
	var t: float = 0.0
	for i: int in plain.length():
		at[i] = t
		var ch: String = plain[i]
		t += PUNCT_MS if ".!?".contains(ch) else (COMMA_MS if ",;:".contains(ch) else TYPE_MS)
	return at


func say(line: String) -> void:
	text = line
	_at = schedule(line)
	_t = 0.0
	visible_characters = 0
	typing = line.length() > 0
	if not typing:
		done.emit()


func finish() -> void:
	if not typing:
		return
	visible_characters = -1
	typing = false
	done.emit()


func _process(delta: float) -> void:
	if not typing:
		return
	_t += delta * 1000.0
	var n: int = visible_characters
	while n < _at.size() and _at[n] <= _t:
		n += 1
	visible_characters = n
	if n >= _at.size():
		visible_characters = -1
		typing = false
		done.emit()
