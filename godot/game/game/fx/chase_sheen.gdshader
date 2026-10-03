shader_type canvas_item;
// A CHASE SKIN'S SHEEN (the web's ChaseSkinFx, in a shader): a band of light
// sweeps across the painting now and then, tinted the skin's colour, only
// where the painting is (its alpha), so the card itself glints.
uniform vec4 tint : source_color = vec4(1.0, 0.85, 0.5, 1.0);
uniform float period = 3.2;
uniform float width = 0.12;

void fragment() {
	vec4 c = texture(TEXTURE, UV) * COLOR;
	float t = fract(TIME / period) * 2.2 - 0.6;
	float d = (UV.x + UV.y * 0.45) - t * 1.45;
	float band = smoothstep(width, 0.0, abs(d));
	c.rgb += tint.rgb * band * 0.55 * c.a;
	COLOR = c;
}
