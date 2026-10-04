shader_type canvas_item;
render_mode unshaded;
// THE AIM BAR, PAINTED (Godot over the web, 2026-10-04; Kong: "look at how our
// fishing dial got updated ... its more game-like visual that also fits our
// aesthetic"). The dial's instrument laid flat: a body of dark wood pooled at
// its edges with a thin brass line round the track; the track cream paper with
// grain and ink ticks; the bands as watercolour washes (ochre graze, sap-green
// hit, gold crit with light moving through it), pooled darker at their edges,
// the one under the needle the full pigment. game/aim_bar.gd draws the needle,
// the words and what the enemy does to the bar on top.

uniform vec2 u_size = vec2(720.0, 130.0);
uniform vec4 u_track = vec4(30.0, 22.0, 660.0, 40.0);
uniform float u_zone = 0.5;
uniform float u_hit = 0.06;
uniform float u_graze = 0.1;
uniform float u_crit_c = 0.5;
uniform float u_crit = 0.02;
uniform int u_lit = 0;          // 0 none, 1 graze, 2 hit, 3 crit
uniform float u_burst = 0.0;
uniform vec3 u_burst_col = vec3(1.0, 0.85, 0.4);
uniform float u_burst_x = 0.5;

const vec3 PAPER = vec3(0.93, 0.89, 0.80);
const vec3 GRAZE = vec3(0.90, 0.78, 0.52);
const vec3 HIT = vec3(0.42, 0.70, 0.49);
const vec3 CRIT = vec3(0.95, 0.77, 0.36);
const vec3 BRASS = vec3(0.79, 0.64, 0.36);
const vec3 INK = vec3(0.17, 0.13, 0.11);

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

// Signed distance to a rounded box (centre c, half size b, radius r).
float sd_box(vec2 p, vec2 c, vec2 b, float r) {
	vec2 q = abs(p - c) - b + vec2(r);
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 p = UV * u_size;
	vec2 tc = u_track.xy + u_track.zw * 0.5;
	vec2 th = u_track.zw * 0.5;
	// Brush-uneven edges: the boundaries wobble a little along their length.
	float wob = (vnoise(vec2(p.x * 0.05, 3.0)) - 0.5) * 1.4;
	float d_track = sd_box(p, tc, th, 7.0) + wob * 0.5;
	float d_body = sd_box(p, tc, th + vec2(12.0, 11.0), 16.0) + wob;
	float grain = fbm(p * 0.35) * 0.6 + hash(floor(p * 1.5)) * 0.4;
	vec4 col = vec4(0.0);

	// A soft shadow under the instrument, bled into the water.
	float d_sh = sd_box(p - vec2(2.0, 6.0), tc, th + vec2(14.0, 13.0), 18.0);
	col = vec4(0.02, 0.03, 0.05, 0.5 * (1.0 - smoothstep(-6.0, 16.0, d_sh)));

	// THE BODY: dark wood, pooled darker at its rim, the grain running along it.
	if (d_body < 0.5) {
		float along = vnoise(vec2(p.x * 0.012, p.y * 0.35)) * 0.6 + vnoise(vec2(p.x * 0.04, p.y * 0.9)) * 0.4;
		vec3 wood = mix(vec3(0.24, 0.15, 0.09), vec3(0.42, 0.27, 0.15), along);
		wood *= 0.85 + grain * 0.25;
		wood = mix(wood, wood * 0.55, smoothstep(-4.0, 0.0, d_body));
		// The brass line round the track, catching the light along its top.
		float ring = 1.0 - smoothstep(0.6, 1.6, abs(d_track - 3.0));
		vec3 brass = BRASS * (0.85 + 0.3 * (1.0 - smoothstep(tc.y - th.y - 6.0, tc.y + th.y + 6.0, p.y)));
		wood = mix(wood, brass, ring * 0.9);
		// Ink ticks on the wood under the track: majors at the twelfths.
		float u = (p.x - u_track.x) / u_track.z;
		float maj = abs(fract(u * 12.0 + 0.5) - 0.5) * u_track.z / 12.0;
		float below = step(tc.y + th.y + 5.0, p.y) * (1.0 - step(tc.y + th.y + 10.0, p.y)) * step(0.0, u) * step(u, 1.0);
		wood = mix(wood, vec3(0.86, 0.76, 0.55), (1.0 - smoothstep(0.5, 1.4, maj)) * below * 0.75);
		float a = 1.0 - smoothstep(-0.5, 0.5, d_body);
		col = mix(col, vec4(wood, 1.0), a);
	}

	// THE TRACK: cream paper, an inner shadow at its edges, the washes on it.
	if (d_track < 0.5) {
		float u = (p.x - u_track.x) / u_track.z;
		vec3 paper = PAPER * (0.88 + grain * 0.16);
		paper = mix(paper, paper * 0.72, smoothstep(-6.0, 0.0, d_track));
		vec3 c = paper;
		float dz = abs(u - u_zone);
		float dc = abs(u - u_crit_c);
		float px_u = u_track.z;
		// Graze, then hit, then the crit seam over them.
		if (dz < u_hit + u_graze) {
			float edge = 1.0 - smoothstep(0.0, 4.0, (u_hit + u_graze - dz) * px_u);
			vec3 w = mix(paper, GRAZE, u_lit == 1 ? 0.95 : 0.55);
			c = mix(w, w * 0.8, edge * 0.7);
		}
		if (dz < u_hit) {
			float edge = 1.0 - smoothstep(0.0, 4.0, (u_hit - dz) * px_u);
			vec3 w = mix(paper, HIT, u_lit == 2 ? 1.0 : 0.72);
			w *= 0.9 + grain * 0.16;
			c = mix(w, w * 0.72, edge * 0.8);
		}
		if (dc < u_crit) {
			float edge = 1.0 - smoothstep(0.0, 3.0, (u_crit - dc) * px_u);
			vec3 w = mix(paper, CRIT, u_lit == 3 ? 1.0 : 0.85);
			float sheen = pow(0.5 + 0.5 * sin(p.x * 0.18 - TIME * 4.0), 6.0);
			w = mix(w, vec3(1.0, 0.96, 0.82), sheen * 0.35);
			c = mix(w, w * 0.75, edge * 0.7);
		}
		// Faint ink ticks across the paper's foot.
		float maj = abs(fract(u * 12.0 + 0.5) - 0.5) * px_u / 12.0;
		float minr = abs(fract(u * 36.0 + 0.5) - 0.5) * px_u / 36.0;
		float foot = smoothstep(tc.y + th.y * 0.25, tc.y + th.y * 0.6, p.y);
		c = mix(c, INK, (1.0 - smoothstep(0.4, 1.0, maj)) * 0.22 * foot + (1.0 - smoothstep(0.3, 0.8, minr)) * 0.1 * foot);
		// A lock's burst: the paper washed with its colour for a moment.
		c = mix(c, u_burst_col, u_burst * 0.35 * (1.0 - smoothstep(0.0, th.y * 4.0, abs(p.x - (u_track.x + u_burst_x * px_u)))));
		float a = 1.0 - smoothstep(-0.5, 0.5, d_track);
		col = mix(col, vec4(c, 1.0), a);
	}
	COLOR = col;
}
