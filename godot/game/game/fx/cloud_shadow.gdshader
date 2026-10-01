shader_type canvas_item;
render_mode blend_mul;
// A cloud's shadow on the water: multiplied, and only where the cloud is
// (a plain multiply ignores alpha, so its empty corners came out as black
// boxes).
uniform vec4 tint : source_color = vec4(0.576, 0.659, 0.749, 1.0);
uniform float strength = 0.5;

void fragment() {
	float a = texture(TEXTURE, UV).a;
	COLOR = vec4(mix(vec3(1.0), tint.rgb, a * strength), 1.0);
}
