shader_type canvas_item;
// Weed lying in the water: the weed's own shape, darkened and tinted, laid
// over the water as ordinary see-through paint (a multiply's neutral white was
// greyed by the sea's day/night tint and showed as boxes).
uniform vec4 tint : source_color = vec4(0.66, 0.74, 0.68, 1.0);
uniform float strength = 0.3;

void fragment() {
	vec4 t = texture(TEXTURE, UV);
	vec3 weed = t.rgb * tint.rgb * 0.45;
	COLOR = vec4(weed, t.a * strength * 1.6);
}
