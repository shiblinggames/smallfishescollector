class_name BattleSummon
extends Node2D
## A BOSS'S OFF-TURN ABILITY, on the water (the web's SummonCreature, redone
## for Godot): the water beside the boss boils in the ability's colour, the
## creature it calls (one of the Ancient Deep's giants) breaches out of it,
## and then does the thing: the Maw lunges across at a ship, the Wake of the
## Drowned rakes the line, Old Armour wraps the boss in light, the eye of
## From the Wrong Water opens, Still Going burns its runes, All That Tonnage
## settles a mark on every ship. Then it sinks back where it came from.
## In the sea's World (squashed by GROUND); the creature stands upright.

const GROUND: float = Chart.GROUND

var field: SeaField
var tex: Texture2D
var col: Color = Color(0.65, 0.55, 1.0)
var _spr: Sprite2D
var _glow: Sprite2D
var _t: float = 0.0
var _rings: Array = []


func _ready() -> void:
	_glow = Sprite2D.new()
	_glow.texture = Glow.radial(128, col)
	_glow.scale = Vector2(4.5, 4.5 * GROUND)
	_glow.modulate.a = 0.0
	add_child(_glow)
	_spr = Sprite2D.new()
	_spr.texture = tex
	if tex != null:
		var s: float = 420.0 / float(maxi(tex.get_width(), tex.get_height()))
		_spr.scale = Vector2(s, s / GROUND)
		_spr.offset = Vector2(0, -tex.get_height() * 0.35)
	_spr.position = Vector2(0, 260.0)
	_spr.modulate = Color(col.lightened(0.6), 0.0)
	_spr.material = _cut()
	add_child(_spr)


## The creature cut at the waterline so it seems to rise out of the sea.
func _cut() -> ShaderMaterial:
	var sh: Shader = Shader.new()
	sh.code = """shader_type canvas_item;
uniform float water_y = 0.78;
uniform vec4 tint : source_color = vec4(1.0);
void fragment() {
	vec4 c = texture(TEXTURE, UV);
	float under = smoothstep(water_y - 0.02, water_y + 0.02, UV.y);
	c.rgb = mix(c.rgb, c.rgb * vec3(0.4, 0.6, 0.75), under * 0.7);
	c.a *= 1.0 - under;
	c.rgb = mix(c.rgb, tint.rgb, 0.18);
	COLOR = c * COLOR;
}"""
	var m: ShaderMaterial = ShaderMaterial.new()
	m.shader = sh
	m.set_shader_parameter("tint", col)
	return m


## Up out of the water: the boil, the breach.
func rise() -> void:
	Sound.horn()
	Rumble.buzz([0, 40, 30, 60])
	for k: int in 5:
		get_tree().create_timer(0.08 * k).timeout.connect(func() -> void:
			if field != null:
				field.ring(global_position_in_world(), 160.0 + 60.0 * k, 1.6, 0.9))
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_glow, "modulate:a", 0.45, 0.4)
	tw.tween_property(_spr, "position:y", 0.0, 0.9).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_spr, "modulate:a", 1.0, 0.35)
	await tw.finished


func global_position_in_world() -> Vector2:
	return position


## Across the water at a ship (the Maw), and back.
func lunge(to: Vector2) -> void:
	var home: Vector2 = position
	_spr.flip_h = to.x < position.x
	var tw: Tween = create_tween()
	tw.tween_property(self, "position", home.lerp(to, 0.86), 0.32).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	await tw.finished
	if field != null:
		field.ring(position, 220.0, 1.3, 1.0)
	Sound.impact(true)
	Rumble.buzz([0, 70, 30, 90])
	var back: Tween = create_tween()
	back.tween_property(self, "position", home, 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	await back.finished


## Wraps the boss in light (Old Armour): a pulse of its colour.
func pulse() -> void:
	var tw: Tween = create_tween()
	tw.tween_property(_glow, "scale", Vector2(8.0, 8.0 * GROUND), 0.5).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(_glow, "modulate:a", 0.7, 0.2)
	tw.tween_property(_glow, "scale", Vector2(4.5, 4.5 * GROUND), 0.5)
	await tw.finished


## Back under.
func sink() -> void:
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_spr, "position:y", 300.0, 0.8).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_property(_spr, "modulate:a", 0.0, 0.7)
	tw.tween_property(_glow, "modulate:a", 0.0, 0.8)
	if field != null:
		field.ring(position, 200.0, 1.4, 0.7)
	await tw.finished
	queue_free()


func _process(delta: float) -> void:
	_t += delta
	if _spr != null:
		_spr.rotation = sin(_t * 1.6) * 0.03
