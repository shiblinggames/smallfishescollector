shader_type canvas_item;
render_mode unshaded;
// THE WORLD CHART'S PAPER AND SEA (game/world_map.gd): a sea chart painted
// in watercolour on paper. Plan view, in world px: the waters as washes that
// deepen from pale shallows to indigo, pooling darker where one water meets
// the next, inked contour lines at each water's edge, a faint graticule, and
// paper grain under everything. At night the paper sits in lamplight.

uniform vec2 u_center = vec2(0.0, 9000.0);
uniform float u_scale = 0.03;
uniform vec2 u_res = vec2(1600.0, 900.0);
uniform float u_dark = 0.0;
uniform float u_outer = 22600.0;
// The waters' edges (widened with the sea), the reef and its arch, and the
// anchorage beyond it (game/north.gd).
uniform vec4 u_bands_a = vec4(1400.0, 3800.0, 6900.0, 10900.0);
uniform vec2 u_bands_b = vec2(16000.0, 22600.0);
uniform float u_wall = -1500.0;
uniform vec2 u_gate = vec2(-900.0, 430.0);
uniform vec3 u_anchor = vec3(0.0, -3000.0, 3600.0);
const vec3 PAPER = vec3(0.83, 0.77, 0.65);
const vec3 INK = vec3(0.22, 0.18, 0.16);

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

// The wash for a radius: pale aqua in the shallows to deep indigo at the rim.
float band(int i) {
	if (i < 4) return u_bands_a[i];
	return u_bands_b[i - 4];
}

vec3 sea_wash(float r) {
	float t = clamp((r - u_bands_a.x) / (u_outer - u_bands_a.x), 0.0, 1.0);
	vec3 a = vec3(0.56, 0.78, 0.76);
	vec3 b = vec3(0.30, 0.55, 0.66);
	vec3 c = vec3(0.18, 0.33, 0.50);
	vec3 d = vec3(0.13, 0.18, 0.33);
	if (t < 0.33) return mix(a, b, t / 0.33);
	if (t < 0.66) return mix(b, c, (t - 0.33) / 0.33);
	return mix(c, d, (t - 0.66) / 0.34);
}

void fragment() {
	vec2 px = (UV - 0.5) * u_res;
	vec2 w = u_center + px / u_scale;
	// Paper grain in screen space (it is the paper, not the sea, that is
	// grained), and a slow mottle in world space (the wash dried unevenly).
	float grain = hash(floor(FRAGCOORD.xy * 0.75)) * 0.5 + fbm(FRAGCOORD.xy * 0.02) * 0.5;
	float mottle = fbm(w * 0.00035);
	vec3 paper = PAPER * (0.92 + grain * 0.1);
	vec3 col = paper;

	float r = length(w);
	float north = length(w - u_anchor.xy);
	// The edge of the known sea wobbles like a brushed line.
	float edge_wob = (fbm(w * 0.0006) - 0.5) * 260.0;
	// The fishing sea stops at the reef; north of it, only the anchorage.
	float south = smoothstep(u_wall - 60.0, u_wall + 60.0, w.y);
	float fish_in = (1.0 - smoothstep(u_outer - 120.0, u_outer + 120.0, r + edge_wob)) * south;
	float anch_in = (1.0 - smoothstep(u_anchor.z - 100.0, u_anchor.z + 100.0, north + edge_wob)) * (1.0 - south);
	float sea_in = max(fish_in, anch_in);
	// Beyond the anchorage, the campaign's water: not yet charted, a faint
	// hatching on bare paper.
	if (w.y < u_wall && anch_in < 0.5 && length(w - u_anchor.xy) < u_outer + 3000.0) {
		float hatch = abs(fract((w.x + w.y) / 900.0) - 0.5);
		col = mix(col, INK, (1.0 - smoothstep(0.02, 0.05, hatch)) * 0.07);
	}
	if (sea_in > 0.001) {
		vec3 wash = anch_in > fish_in ? vec3(0.52, 0.66, 0.62) : sea_wash(r);
		// Pigment pools darker at each water's edge.
		float pool = 0.0;
		for (int i = 0; i < 6; i++) {
			float d = abs(r + edge_wob * 0.4 - band(i)) + (1.0 - fish_in) * 9999.0;
			pool = max(pool, 1.0 - smoothstep(0.0, 260.0, d));
		}
		wash *= 0.86 + mottle * 0.22;
		wash = mix(wash, wash * 0.72, pool * 0.6);
		// Granulation.
		wash *= 0.93 + grain * 0.1;
		// Paper shows through a watercolour wash.
		col = mix(paper, wash, 0.78 * sea_in);
		// Inked contour lines at each water's edge.
		for (int i = 0; i < 6; i++) {
			float d = (abs(r + edge_wob * 0.25 - band(i)) + (1.0 - fish_in) * 9999.0) * u_scale;
			col = mix(col, INK, (1.0 - smoothstep(0.4, 1.3, d)) * 0.35);
		}
		// The graticule: faint inked lines every 2,000 px.
		vec2 g = abs(fract(w / 2000.0 + 0.5) - 0.5) * 2000.0 * u_scale;
		float grid = 1.0 - smoothstep(0.3, 0.9, min(g.x, g.y));
		col = mix(col, INK, grid * 0.10 * sea_in);
	}
	// The reef: a heavy inked line of rock across the chart, broken at the arch.
	float reef = abs(w.y - u_wall + (fbm(vec2(w.x * 0.002, 0.0)) - 0.5) * 120.0) * u_scale;
	float in_arch = 1.0 - smoothstep(u_gate.y - 40.0, u_gate.y + 40.0, abs(w.x - u_gate.x));
	float reef_span = 1.0 - smoothstep(u_outer, u_outer + 400.0, abs(w.x));
	col = mix(col, INK * 0.8, (1.0 - smoothstep(1.2, 3.2, reef)) * 0.75 * (1.0 - in_arch) * reef_span);
	// The anchorage's wall, the same, broken at the Sea Gate (due north).
	float rim = abs(north - u_anchor.z) * u_scale;
	float at_gate = 1.0 - smoothstep(620.0, 700.0, length(w - (u_anchor.xy - vec2(0.0, u_anchor.z))));
	col = mix(col, INK * 0.8, (1.0 - smoothstep(1.2, 3.2, rim)) * 0.75 * (1.0 - south) * (1.0 - at_gate));
	// A darker margin round the sheet, like an old chart's edge.
	vec2 q = UV - 0.5;
	col *= 1.0 - smoothstep(0.35, 0.75, length(q * vec2(1.0, 1.3))) * 0.28;
	// At night: the chart under a lamp.
	vec3 lamp = col * vec3(0.55, 0.5, 0.48) + vec3(0.06, 0.04, 0.02) * (1.0 - length(q) * 1.5);
	col = mix(col, lamp, u_dark * 0.55);
	COLOR = vec4(col, 1.0);
}
