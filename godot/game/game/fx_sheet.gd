class_name FxSheet
extends RefCounted
## THE PAINTED EFFECT CELLS (Godot over the web, 2026-10-04): the web's
## fx-sheet.webp (fire, ice, smoke, light) and the port's own fx-sheet-2.webp
## (port_art/: the things a ship wears: a kraken's tentacle, a hunter's mark,
## acid, a padlock on the guns, splintered planks, rope, a broken cutlass, an
## anchor), each a 128 px cell with the element centred. Drawn as sprites by
## the battle's effects (BattleFx) and the hulls' wear (HullAura).

const CELL: float = 128.0
const ONE: Dictionary = {
	"flame": Rect2(0, 0, 128, 128), "ember": Rect2(128, 0, 128, 128), "ice": Rect2(256, 0, 128, 128), "frost": Rect2(384, 0, 128, 128),
	"ward": Rect2(0, 128, 128, 128), "smoke": Rect2(128, 128, 128, 128), "spark": Rect2(256, 128, 128, 128), "splash": Rect2(384, 128, 128, 128),
	"flash": Rect2(0, 256, 128, 128), "fireball": Rect2(128, 256, 128, 128),
}
const TWO: Dictionary = {
	"tentacle": Rect2(0, 0, 128, 128), "reticle": Rect2(128, 0, 128, 128), "acid": Rect2(256, 0, 128, 128), "padlock": Rect2(384, 0, 128, 128),
	"plank": Rect2(0, 128, 128, 128), "rope": Rect2(128, 128, 128, 128), "cutlass": Rect2(256, 128, 128, 128), "anchor": Rect2(384, 128, 128, 128),
}
## What is light (drawn added, on a light layer).
const LIGHT: Array = ["flame", "ember", "spark", "flash", "fireball", "ward"]

static var _one: Texture2D
static var _two: Texture2D


static func has(k: String) -> bool:
	return (ONE.has(k) and _sheet_one() != null) or (TWO.has(k) and _sheet_two() != null)


static func _sheet_one() -> Texture2D:
	if _one == null:
		_one = Skipper.tex("fx-sheet.webp")
	return _one


static func _sheet_two() -> Texture2D:
	if _two == null:
		_two = Skipper.tex("fx-sheet-2.webp")
	return _two


## One cell, `w` px across, centred at `at` in a standing space (y un-squashed
## by 1/ground; ground 1.0 for a plain canvas), turned `rot`, tinted `c`.
## `flip` mirrors it. Leaves the canvas transform as `rest`.
static func draw(on: CanvasItem, k: String, at: Vector2, w: float, rot: float, c: Color, ground: float, rest: Transform2D, flip: bool = false) -> void:
	if c.a <= 0.003 or w <= 0.5:
		return
	var tex: Texture2D = _sheet_one() if ONE.has(k) else _sheet_two()
	if tex == null:
		return
	var sc: float = w / CELL
	var m: Transform2D = Transform2D(0.0, Vector2(1.0, 1.0 / ground), 0.0, Vector2.ZERO) * Transform2D(rot, Vector2(-sc if flip else sc, sc), 0.0, at)
	on.draw_set_transform_matrix(m)
	on.draw_texture_rect_region(tex, Rect2(-64, -64, 128, 128), ONE[k] if ONE.has(k) else TWO[k], c)
	on.draw_set_transform_matrix(rest)
