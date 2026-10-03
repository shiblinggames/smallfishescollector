shader_type canvas_item;
// THE WORLD CHART'S FOG (the Chart Room): a drifting paper-white fog over
// the painted map, burned through at each landmark the captain has uncovered
// (holes: x, y in the picture's 0-1, radius as a share of its width, and how
// far it has burned, 0 to 1). The fog's edge is ragged, like burnt parchment.
uniform vec4 holes[13];
uniform float aspect = 0.805;
uniform vec4 fog_col : source_color = vec4(0.93, 0.9, 0.82, 1.0);

uniform sampler2D noise_tex : repeat_enable, filter_linear;
float fbm(vec2 p) { return texture(noise_tex, p * 0.25).r * 0.65 + texture(noise_tex, p * 0.61 + 0.3).r * 0.35; }

void fragment() {
	vec4 map = texture(TEXTURE, UV);
	vec2 q = vec2(UV.x, UV.y / aspect);
	float n = fbm(UV * 6.0 + vec2(TIME * 0.03, TIME * 0.015));
	float clear = 0.0;
	for (int i = 0; i < 13; i++) {
		vec4 h = holes[i];
		if (h.w <= 0.0) continue;
		vec2 c = vec2(h.x, h.y / aspect);
		float d = distance(q, c);
		float r = h.z * h.w * (0.85 + 0.3 * n);
		clear = max(clear, 1.0 - smoothstep(r * 0.75, r, d));
	}
	float fog = (1.0 - clear) * (0.62 + 0.22 * n);
	vec3 fogc = fog_col.rgb * (0.92 + 0.12 * n);
	// A singed rim where the fog has burned back.
	float rim = smoothstep(0.15, 0.5, clear) * (1.0 - smoothstep(0.5, 0.85, clear));
	vec3 col = mix(map.rgb, fogc, fog);
	col = mix(col, vec3(0.45, 0.32, 0.18), rim * 0.35);
	COLOR = vec4(col, map.a);
}
