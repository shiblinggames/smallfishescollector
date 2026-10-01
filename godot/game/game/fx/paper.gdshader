shader_type canvas_item;
// A SHEET OF WATERCOLOUR PAPER (game/paper.gd): the menus' ground since the
// paper-and-wood restyle. Cold-press grain and a few fibres, a slow uneven
// wash (the paper took the size unevenly), a tea-stained edge, and a deckled,
// torn border cut into the alpha so no sheet has a ruled edge. With u_wash it
// is a watercolour blot instead (behind an item's art): a pigment pool that
// dries darker at its rim and granulates.
uniform vec2 u_size = vec2(400.0, 300.0);
uniform vec4 u_paper : source_color = vec4(0.93, 0.89, 0.80, 1.0);
uniform vec4 u_wash : source_color = vec4(0.0);
uniform float u_deckle = 7.0;
uniform float u_seed = 0.0;
uniform float u_stain = 1.0;

float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
	return vnoise(p) * 0.5 + vnoise(p * 2.03 + 3.1) * 0.27 + vnoise(p * 4.1 + 7.7) * 0.15 + vnoise(p * 8.3 + 1.3) * 0.08;
}

void fragment() {
	vec2 px = UV * u_size;
	vec2 s = px + u_seed * 137.0;
	// Distance in from the nearest edge, torn by noise.
	float edge = min(min(px.x, u_size.x - px.x), min(px.y, u_size.y - px.y));
	float tear = (fbm(s * 0.09) - 0.5) * u_deckle * 1.6 + (vnoise(s * 0.6) - 0.5) * u_deckle * 0.35;
	float inside = smoothstep(0.0, 1.5, edge - u_deckle * 0.6 - tear);
	float grain = hash(floor(px * 0.9) + u_seed) * 0.5 + fbm(px * 0.11) * 0.5;
	vec3 col;
	if (u_wash.a > 0.0) {
		// The blot: a soft pool, pigment pooled at the rim, granulated.
		vec2 c = (UV - 0.5) * 2.0;
		float r = length(c * vec2(1.0, 1.08)) + (fbm(s * 0.035) - 0.5) * 0.45;
		float body = 1.0 - smoothstep(0.62, 0.86, r);
		float rim = smoothstep(0.5, 0.8, r) * body;
		float gran = 0.85 + grain * 0.3;
		vec3 pig = u_wash.rgb;
		col = mix(u_paper.rgb, pig, (0.32 + rim * 0.42) * gran);
		COLOR = vec4(col, body * u_wash.a);
	} else {
		float mottle = fbm(s * 0.006);
		col = u_paper.rgb * (0.94 + grain * 0.08) * (0.97 + mottle * 0.05);
		// Fibres: a few long faint strands.
		float fib = smoothstep(0.985, 1.0, vnoise(vec2(s.x * 0.02 + s.y * 0.11, s.y * 0.02 - s.x * 0.05)));
		col *= 1.0 - fib * 0.06;
		// The tea-stained edge, pooling unevenly.
		float stain = (1.0 - smoothstep(0.0, 34.0 + fbm(s * 0.02) * 30.0, edge)) * u_stain;
		col = mix(col, col * vec3(0.82, 0.72, 0.58), stain * 0.55);
		// The torn lip is a touch darker, like a deckle.
		col *= 1.0 - (1.0 - smoothstep(0.0, 3.0, edge - u_deckle * 0.6 - tear)) * 0.18;
		COLOR = vec4(col, inside * u_paper.a);
	}
}
