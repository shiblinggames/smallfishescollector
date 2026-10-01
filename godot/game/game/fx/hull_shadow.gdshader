shader_type canvas_item;
// A hull's shadow on the water (seaCaptain.ts bakeSilhouette): the hull's own
// shape, black, blurred soft.
uniform float blur = 0.03;
uniform float strength = 0.30;

void fragment() {
	float a = 0.0;
	vec2 k = vec2(1.0, TEXTURE_PIXEL_SIZE.y / TEXTURE_PIXEL_SIZE.x) * blur;
	for (int i = -2; i <= 2; i++) {
		for (int j = -2; j <= 2; j++) {
			a += texture(TEXTURE, UV + vec2(float(i), float(j)) * k * 0.5).a;
		}
	}
	COLOR = vec4(0.0, 0.0, 0.0, a / 25.0 * strength);
}
