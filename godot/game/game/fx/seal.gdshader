shader_type canvas_item;
// THE CAST SEAL (game/dial_button.gd; Kong, 2026-10-01 chose a watercolour
// seal over the wooden disc): a round of torn paper with a ring of pigment
// laid on it, pooled darker at the ring's edges and granulating, an inked
// hairline either side, and a paper face for the word. Sea-teal to cast,
// warm red-gold to reel. Dull and grey when it cannot be pressed. A press
// sends a ring of wet pigment out across it.
uniform vec4 pigment : source_color = vec4(0.2, 0.52, 0.55, 1.0);
uniform float lit = 1.0;
uniform float press = 9.0;   // seconds since the last press
uniform float hover = 0.0;
uniform vec4 paper : source_color = vec4(0.83, 0.77, 0.65, 1.0);
uniform vec4 ink : source_color = vec4(0.18, 0.13, 0.09, 1.0);

float hash(vec2 p) {
	vec3 q = fract(vec3(p.xyx) * 0.1031);
	q += dot(q, q.yzx + 33.33);
	return fract((q.x + q.y) * q.z);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void fragment() {
	// The ColorRect is a little larger than the seal, for its shadow.
	vec2 c = (UV - 0.5) * 2.0 * 1.14;
	float r = length(c);
	float a = atan(c.y, c.x);
	float tear = (vnoise(vec2(a * 5.0, 1.0)) - 0.5) * 0.035 + (vnoise(vec2(a * 19.0, 3.0)) - 0.5) * 0.015;
	float rr = r + tear;
	float disc = 1.0 - smoothstep(0.955, 0.975, rr);
	// The shadow it throws on the water.
	float sh = (1.0 - smoothstep(0.85, 1.12, length(c - vec2(0.0, 0.06)))) * 0.45;
	vec3 pig = mix(vec3(dot(pigment.rgb, vec3(0.33))) * 0.9, pigment.rgb, lit);
	float grain = hash(floor(UV * 220.0)) * 0.5 + vnoise(UV * 30.0) * 0.5;
	vec3 col = paper.rgb * (0.94 + grain * 0.08);
	// The ring of pigment: pooled darker where it dried at its edges.
	float wob = (vnoise(vec2(a * 3.0, 7.0)) - 0.5) * 0.04;
	float ring_in = 0.6 + wob;
	float ring_out = 0.9 + wob * 0.5;
	float band = smoothstep(ring_in - 0.02, ring_in + 0.02, rr) * (1.0 - smoothstep(ring_out - 0.02, ring_out + 0.02, rr));
	float pool = (1.0 - smoothstep(0.0, 0.07, abs(rr - ring_in))) + (1.0 - smoothstep(0.0, 0.06, abs(rr - ring_out)));
	float wet = 0.55 + 0.35 * pool + (grain - 0.5) * 0.25 + hover * 0.12;
	col = mix(col, pig, band * clamp(wet, 0.0, 1.0));
	// A faint bloom of the same pigment soaking into the face while it can
	// be pressed.
	col = mix(col, pig, (1.0 - smoothstep(0.0, 0.6, rr)) * 0.1 * lit);
	// The inked hairlines.
	float line_a = 1.0 - smoothstep(0.004, 0.014, abs(rr - (ring_in - 0.035)));
	float line_b = 1.0 - smoothstep(0.004, 0.012, abs(rr - 0.94));
	col = mix(col, ink.rgb, (line_a * 0.7 + line_b * 0.45) * (0.75 + 0.25 * grain));
	// A press: a wet ring running out across the face.
	float pr = press * 2.4;
	float wave = (1.0 - smoothstep(0.0, 0.05, abs(rr - pr))) * (1.0 - smoothstep(0.0, 0.5, press));
	col = mix(col, pig, wave * 0.6);
	// The torn lip, a touch darker.
	col *= 1.0 - (1.0 - smoothstep(0.0, 0.03, 0.965 - rr)) * 0.2 * disc;
	vec4 seal = vec4(col, disc);
	vec4 shadow = vec4(0.0, 0.0, 0.0, sh * (1.0 - disc));
	COLOR = seal.a > 0.0 ? seal : shadow;
}
