// A GOLDEN FISH (Godot port, stage 1; Kong 2026-09-30, "shader glows on art").
//
// The web gilds a fish with a CSS filter stack (grayscale, sepia, saturate,
// hue-rotate, two drop-shadows), which pixelated in motion. Here the art is
// turned to gold by its own brightness, a slow sheen crosses it, and the glow
// is drawn around the silhouette from the alpha, crisp at any size.

shader_type canvas_item;

uniform float glow = 1.0;

void fragment() {
	vec4 tex = texture(TEXTURE, UV);
	float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
	vec3 gold = mix(vec3(0.55, 0.33, 0.06), vec3(1.0, 0.86, 0.45), smoothstep(0.1, 0.9, lum));
	float sheen = smoothstep(0.08, 0.0, abs(fract(UV.x * 0.8 + UV.y * 0.4 - TIME * 0.25) - 0.5));
	gold += vec3(1.0, 0.95, 0.8) * sheen * 0.35;
	// The halo: alpha sampled around the pixel, where the fish is not.
	float around = 0.0;
	for (int i = 0; i < 12; i++) {
		float a = float(i) / 12.0 * 6.2832;
		around += texture(TEXTURE, UV + vec2(cos(a), sin(a)) * 0.035).a;
	}
	around /= 12.0;
	vec4 halo = vec4(0.98, 0.75, 0.25, around * (1.0 - tex.a) * 0.75 * glow);
	COLOR = mix(halo, vec4(gold, tex.a), tex.a);
}
