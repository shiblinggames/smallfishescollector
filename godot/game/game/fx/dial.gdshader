shader_type canvas_item;
render_mode unshaded;
// THE CATCH DIAL, PAINTED (Godot over the web baseline, 2026-10-01; restyled
// the same day at Kong's word to sit with the game's watercolour hand). Drawn
// in the web's 220 box: a wash of ochre for the rim with ink ticks at the
// quarters; the zones as washes of pigment that pool darker at their edges
// and granulate, the one under the needle the strongest; a deep indigo face
// that blooms lighter in the middle; paper grain over everything; and soft,
// brush-uneven edges. The needle and hub are game/dial.gd's. The logic is
// untouched: this only paints what the dial already knows.

uniform vec2 u_size = vec2(300.0);
uniform float u_rot = 0.0;
uniform float u_angle = 0.0;
uniform float u_trail = 0.0;
uniform int u_n = 0;
uniform vec4 u_zones[16];   // start, end, kind (0 miss 1 catch 2 perfect 3 snag), lit (0/1)
uniform vec4 u_cols[16];    // a zone's own colour (alpha 0 = the kind's)
uniform vec4 u_needle_col : source_color = vec4(1.0);
uniform float u_burst = 0.0;
uniform float u_dark = 0.0;

// Watercolour pigments: slate, sap green, gold ochre, madder.
const vec3 MISS = vec3(0.50, 0.57, 0.66);
const vec3 CATCH = vec3(0.42, 0.72, 0.50);
const vec3 PERFECT = vec3(0.93, 0.78, 0.40);
const vec3 SNAG = vec3(0.84, 0.45, 0.42);
const vec3 PAPER = vec3(0.93, 0.89, 0.80);

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
	return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.3) * 0.3 + vnoise(p * 4.3 + 1.7) * 0.15;
}

vec3 kind_col(float kind) {
	if (kind < 0.5) return MISS;
	if (kind < 1.5) return CATCH;
	if (kind < 2.5) return PERFECT;
	return SNAG;
}

float ddeg(float a, float b) {
	return mod(b - a + 540.0, 360.0) - 180.0;
}

void fragment() {
	float k = min(u_size.x, u_size.y) / 220.0;
	vec2 p = (UV - 0.5) * u_size / k;
	float deg = mod(degrees(atan(p.x, -p.y)) + 360.0, 360.0);
	// Brush-uneven edges: every boundary wobbles a little with the angle.
	float wob = (vnoise(vec2(deg * 0.09, 3.0)) - 0.5) * 1.8 + (vnoise(vec2(deg * 0.31, 9.0)) - 0.5) * 0.7;
	float r = length(p) + wob;
	float grain = fbm(p * 0.55) * 0.6 + hash(floor(p * 2.0)) * 0.4;
	float aa = 1.6 / k;
	vec4 col = vec4(0.0);

	// A soft shadow under the whole instrument, like a wash bled into paper.
	float sh = 1.0 - smoothstep(98.0, 110.0, length(p - vec2(1.5, 3.5)) + wob);
	col = vec4(0.04, 0.05, 0.07, sh * 0.35);

	// THE RIM: a wash of warm ochre, darker where the pigment pools at its
	// edges, with ink ticks at the quarters and fainter ones between.
	if (r > 94.0 && r < 106.0) {
		float u = (r - 94.0) / 12.0;
		float pool = pow(abs(u - 0.5) * 2.0, 3.0);
		vec3 ochre = mix(vec3(0.78, 0.60, 0.36), vec3(0.52, 0.36, 0.20), pool * 0.8 + grain * 0.25);
		ochre = mix(ochre, PAPER, 0.12 * (1.0 - pool));
		float major = abs(mod(deg + 45.0, 90.0) - 45.0);
		float minor = abs(mod(deg + 15.0, 30.0) - 15.0);
		float ink = (1.0 - smoothstep(0.4, 1.2, major)) * 0.55 + (1.0 - smoothstep(0.3, 0.8, minor)) * 0.22 * step(0.45, u);
		ochre = mix(ochre, vec3(0.20, 0.15, 0.12), ink);
		float on = smoothstep(94.0, 94.0 + aa, r) * (1.0 - smoothstep(106.0 - aa, 106.0, r));
		col = mix(col, vec4(ochre, 1.0), on);
	}

	// THE ZONES: washes of pigment, pooled at their edges, granulating.
	if (r >= 63.0 && r <= 94.5) {
		float rot = mod(deg - u_rot + (vnoise(vec2(r * 0.2, deg * 0.05)) - 0.5) * 0.9, 360.0);
		vec3 zc = MISS;
		float lit = 0.0;
		float kind = 0.0;
		float z0 = 0.0;
		float z1 = 360.0;
		for (int i = 0; i < 16; i++) {
			if (i >= u_n) break;
			vec4 z = u_zones[i];
			if (rot >= z.x && rot < z.y) {
				kind = z.z;
				lit = z.w;
				z0 = z.x;
				z1 = z.y;
				zc = u_cols[i].a > 0.5 ? mix(u_cols[i].rgb, PAPER, 0.15) : kind_col(kind);
			}
		}
		// How far into its zone (in box px), and from the track's edges.
		float into = min(abs(ddeg(rot, z0)), abs(ddeg(rot, z1))) * 0.0174 * r;
		float rim_in = min(r - 63.0, 94.5 - r);
		float edge_pool = max(1.0 - smoothstep(0.0, 3.5, into), 1.0 - smoothstep(0.0, 3.0, rim_in));
		// Diluted when not under the needle; the lit wash is the full pigment.
		float strength = lit > 0.5 ? 1.0 : (kind > 1.5 && kind < 2.5 ? 0.62 : 0.42);
		vec3 wash = mix(PAPER * 0.30, zc, strength);
		wash *= 0.88 + grain * 0.22;
		wash = mix(wash, wash * 0.62, edge_pool * 0.85);
		if (kind > 1.5 && kind < 2.5) {
			// The perfect: a little light moving through the gold.
			float sheen = pow(0.5 + 0.5 * sin(deg * 0.35 - TIME * 3.0), 6.0);
			wash = mix(wash, vec3(1.0, 0.95, 0.80), sheen * 0.30 + u_burst * 0.35);
		} else if (kind > 2.5) {
			// The snag: brushed hatching.
			float st = smoothstep(0.35, 0.65, fract((deg * 0.9 + r * 0.6) / 10.0));
			wash *= 0.88 + 0.12 * st;
		}
		if (lit > 0.5) {
			wash += zc * 0.10 * (1.0 - edge_pool);
		}
		// The seams between zones: a thin dry line of paper.
		wash = mix(wash, PAPER * 0.55, (1.0 - smoothstep(0.2, 1.0, into)) * 0.5);
		float on = smoothstep(63.0, 63.0 + aa, r) * (1.0 - smoothstep(94.5 - aa, 94.5, r));
		col = mix(col, vec4(wash, 1.0), on);
	}

	// THE FACE: deep indigo, pooled dark at its edge and blooming lighter in
	// the middle, a compass rose in faint ink.
	if (r < 63.5) {
		float bloom = 1.0 - smoothstep(0.0, 58.0, r);
		vec3 face = mix(vec3(0.07, 0.10, 0.17), vec3(0.17, 0.24, 0.33), bloom * 0.8);
		face *= 0.86 + grain * 0.24;
		face = mix(face, face * 0.55, smoothstep(55.0, 63.0, r));
		float a8 = abs(mod(deg + 22.5, 45.0) - 22.5);
		float spoke = 1.0 - smoothstep(0.0, 0.9 + r * 0.02, a8 * 0.0174 * r);
		float main = abs(mod(deg + 45.0, 90.0) - 45.0) < 22.5 ? 1.0 : 0.5;
		face += vec3(0.80, 0.74, 0.60) * spoke * main * 0.08 * smoothstep(8.0, 22.0, r) * (1.0 - smoothstep(38.0, 54.0, r));
		face += vec3(0.80, 0.74, 0.60) * (1.0 - smoothstep(0.0, 0.8, abs(r - 46.0))) * 0.07;
		float on = 1.0 - smoothstep(63.5 - aa, 63.5, r);
		col = mix(col, vec4(face, 1.0), on);
	}

	// THE TRAIL: a soft bleed of the needle's colour behind it.
	if (u_trail > 0.5 && r > 14.0 && r < 92.0) {
		float behind = ddeg(deg, u_angle);
		if (behind > 0.0 && behind < u_trail) {
			float f = 1.0 - behind / u_trail;
			float across = smoothstep(14.0, 30.0, r) * (1.0 - smoothstep(70.0, 92.0, r));
			col.rgb = mix(col.rgb, u_needle_col.rgb, pow(f, 2.4) * across * 0.30 * (0.8 + grain * 0.4));
		}
	}

	col.rgb = mix(col.rgb, vec3(0.01, 0.01, 0.02), u_dark * 0.92);
	COLOR = col;
}
