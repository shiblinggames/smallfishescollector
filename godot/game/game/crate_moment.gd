class_name CrateMoment
extends RefCounted
## THE CRATES' TABLES (what is left of the Godot port of
## components/CrateOpening.tsx): each tier's name, colour, art and burst, the
## art loader, what a loot reads as, and the rays behind a rare find. The
## strip-roller panel that once showed an opening is gone (2026-10-10): the
## opening plays on the water now (game/crate_surface.gd), and the Locker,
## the Sea and the HUD read these tables.


## tier: [name, accent, art stem, spin seconds, shake, burst count, burst tint]
const TIERS: Dictionary = {
	"wooden": ["Wooden Crate", "#c08a5a", "crate", 0.85, 0.55, 14, "#e0b183"],
	"metal": ["Metal Crate", "#b8c4d0", "metalcrate", 1.1, 0.75, 26, "#eef4ff"],
	"gold": ["Gold Crate", "#f0c040", "goldcrate", 1.4, 1.0, 46, "#fff0c2"],
	"diamond": ["Diamond Crate", "#7dd3fc", "diamondcrate", 1.75, 1.25, 72, "#ffffff"],
	"ancient": ["Ancient Chest", "#d8cfbb", "ancientcrate", 2.2, 1.5, 96, "#f6ecd2"],
}


static func _tex(file: String) -> Texture2D:
	var path: String = "res://art/%s" % file.trim_prefix("/")
	return load(path) if ResourceLoader.exists(path) else null


## What a loot is, as a title, a subtitle, a picture and a tint.
static func loot_view(l: Dictionary) -> Dictionary:
	match l.get("type", ""):
		"doubloons":
			return { "title": "+%s ⟡" % Js.thousands(float(l["amount"])), "sub": "Doubloons", "art": "smallpile.png", "tint": "#fbbf24", "rare": false }
		"bait":
			return { "title": "%d× %s" % [int(l["quantity"]), l["baitName"]], "sub": "Bait", "art": String(Rules.bait(l["baitType"]).get("imageUrl", "/worms.png")), "tint": "#86efac", "rare": false }
		"skin":
			return { "title": l["skinName"], "sub": "Character colorway", "art": "fishing_%s_rest.png" % l["skinId"], "tint": "#4ade80", "rare": true, "why": "New character color unlocked." }
		"hat":
			return { "title": l["hatName"], "sub": "Bandana", "art": l["hatImageUrl"], "tint": "#4ade80", "rare": true, "why": "New bandana unlocked." }
		"boat":
			return { "title": l["boatName"], "sub": "Boat", "art": l["boatImageUrl"], "tint": "#4ade80", "rare": true, "why": "New boat unlocked." }
		"pet":
			return { "title": l["petName"], "sub": "New pet", "art": l["petImageUrl"], "tint": l["petAccent"], "rare": true, "why": "Equip it from your Appearance loadout.", "pet": true }
	return { "title": "", "sub": "", "art": "", "tint": "#ffffff", "rare": false }


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
