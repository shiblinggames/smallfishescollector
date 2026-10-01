shader_type canvas_item;
render_mode blend_mul;
// Weed lying in the water: multiplied, and only where the weed is (a plain
// multiply ignores alpha).
uniform vec4 tint : source_color = vec4(0.66, 0.74, 0.68, 1.0);
uniform float strength = 0.3;

void fragment() {
	vec4 t = texture(TEXTURE, UV);
	vec3 weed = mix(vec3(1.0), t.rgb * tint.rgb, t.a * strength);
	COLOR = vec4(weed, 1.0);
}
