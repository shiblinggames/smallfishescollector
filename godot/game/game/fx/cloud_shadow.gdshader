shader_type canvas_item;
render_mode unshaded;
// A cloud's shadow on the water: an ordinary see-through darkening, only
// where the cloud is. (A multiply's "no change" white was greyed by the sea's
// day/night tint, so its empty corners showed as boxes.)
uniform vec4 tint : source_color = vec4(0.10, 0.16, 0.24, 1.0);
uniform float strength = 0.5;

void fragment() {
	float a = texture(TEXTURE, UV).a;
	COLOR = vec4(tint.rgb, a * strength * 0.55);
}
