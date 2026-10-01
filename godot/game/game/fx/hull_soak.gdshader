shader_type canvas_item;
// THE WATER COMING UP HER SIDE (seaCaptain.ts soakPlate): the hull's own alpha,
// filled with the sea's colour on a ramp over the lowest part of the painted
// hull. Nothing on the top 62% of the paint, then slow, then quick: water takes
// the last inch all at once.
uniform float top = 0.0;
uniform float bot = 1.0;
uniform vec4 tint : source_color = vec4(0.32, 0.46, 0.5, 1.0);
uniform float level = 0.78;

void fragment() {
	float a = texture(TEXTURE, UV).a;
	float t = clamp((UV.y - top) / max(bot - top, 0.0001), 0.0, 1.0);
	float r = 0.0;
	if (t > 0.62) {
		float u = (t - 0.62) / 0.38;
		if (u < 0.47) r = mix(0.0, 0.22, u / 0.47);
		else if (u < 0.82) r = mix(0.22, 0.58, (u - 0.47) / 0.35);
		else r = mix(0.58, 0.82, (u - 0.82) / 0.18);
	}
	COLOR = vec4(tint.rgb, a * r * level);
}
