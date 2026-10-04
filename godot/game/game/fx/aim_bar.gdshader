shader_type canvas_item;
render_mode unshaded;
// THE AIM BAR: A GUNNERY SIGHT (Godot over the web, 2026-10-04; Kong: the
// first restyle "took on the fishing reel identity too strongly ... make it
// feel more game-y"). Its own look, not the dial's: a gunmetal rail, bevelled
// and brushed, round a smoked-glass track; the bands burn inside the glass
// like heated powder (an amber graze, a hot green hit, the crit a white-hot
// gold seam that pulses), the one under the needle blazing; faint range marks
// in the glass; a lock floods the glass with its colour. game/aim_bar.gd draws
// the needle, the words and what the enemy does to the bar on top.

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
uniform float u_needle = 0.5;   // where the needle is (0..1), for the glass's glow

const vec3 GRAZE = vec3(1.0, 0.62, 0.22);
const vec3 HIT = vec3(0.3, 1.0, 0.55);
const vec3 CRIT = vec3(1.0, 0.86, 0.35);

float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float sd_box(vec2 p, vec2 c, vec2 b, float r) {
	vec2 q = abs(p - c) - b + vec2(r);
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// A band's glow: full inside, a soft bloom spilling past its edges.
float band(float d_in_px, float bloom) {
	return clamp(1.0 - d_in_px / bloom, 0.0, 1.0);
}

void fragment() {
	vec2 p = UV * u_size;
	vec2 tc = u_track.xy + u_track.zw * 0.5;
	vec2 th = u_track.zw * 0.5;
	float d_track = sd_box(p, tc, th, 6.0);
	float d_body = sd_box(p, tc, th + vec2(9.0, 8.0), 12.0);
	vec4 col = vec4(0.0);

	// A shadow under it on the water.
	float d_sh = sd_box(p - vec2(0.0, 6.0), tc, th + vec2(12.0, 10.0), 14.0);
	col = vec4(0.0, 0.01, 0.02, 0.55 * (1.0 - smoothstep(-4.0, 18.0, d_sh)));

	// THE RAIL: gunmetal, brushed along its length, lit along its top edge.
	if (d_body < 0.5) {
		float brushed = hash(vec2(floor(p.y * 1.3), floor(p.x * 0.05))) * 0.06;
		float vy = (p.y - (tc.y - th.y - 8.0)) / (u_track.w + 16.0);
		vec3 metal = mix(vec3(0.32, 0.35, 0.39), vec3(0.11, 0.12, 0.14), smoothstep(0.0, 1.0, vy));
		metal += brushed;
		// The bevel: a bright lip on the outer top edge, a dark one under.
		float lip = 1.0 - smoothstep(0.0, 2.2, -d_body);
		metal = mix(metal, vec3(0.62, 0.66, 0.72), lip * (1.0 - vy) * 0.8);
		metal = mix(metal, vec3(0.04, 0.04, 0.05), lip * vy * 0.8);
		// The glass's rim: a thin dark groove.
		metal = mix(metal, vec3(0.02, 0.02, 0.03), 1.0 - smoothstep(0.0, 1.6, abs(d_track - 1.5)));
		// Rivets at the rail's ends.
		for (int s = 0; s < 2; s++) {
			vec2 rv = vec2(s == 0 ? u_track.x - 3.0 : u_track.x + u_track.z + 3.0, tc.y);
			float rd = length(p - rv);
			metal = mix(metal, vec3(0.55, 0.58, 0.62), 1.0 - smoothstep(2.0, 3.0, rd));
		}
		col = mix(col, vec4(metal, 1.0), 1.0 - smoothstep(-0.5, 0.5, d_body));
	}

	// THE GLASS: smoked, dark, the bands burning inside it.
	if (d_track < 0.5) {
		float u = (p.x - u_track.x) / u_track.z;
		float px_u = u_track.z;
		float vy = (p.y - u_track.y) / u_track.w;
		vec3 glass = mix(vec3(0.05, 0.07, 0.09), vec3(0.015, 0.02, 0.03), vy);
		// Range marks etched in the glass.
		float maj = abs(fract(u * 12.0 + 0.5) - 0.5) * px_u / 12.0;
		float minr = abs(fract(u * 48.0 + 0.5) - 0.5) * px_u / 48.0;
		glass += vec3(0.45, 0.55, 0.62) * ((1.0 - smoothstep(0.3, 0.9, maj)) * 0.12 + (1.0 - smoothstep(0.2, 0.6, minr)) * 0.04 * step(0.62, vy));
		// The bands: graze, hit, crit, each glowing from within.
		float dz = abs(u - u_zone) * px_u;
		float dc = abs(u - u_crit_c) * px_u;
		float gw = (u_hit + u_graze) * px_u;
		float hw = u_hit * px_u;
		float cw = u_crit * px_u;
		float core = 1.0 - abs(vy - 0.5) * 1.2;
		float pulse = 0.85 + 0.15 * sin(TIME * 7.0);
		vec3 emit = vec3(0.0);
		emit += GRAZE * band(max(0.0, dz - gw), 6.0) * (u_lit == 1 ? 0.9 : 0.48) * (0.55 + 0.45 * core);
		emit += HIT * band(max(0.0, dz - hw), 7.0) * (u_lit == 2 ? 1.0 : 0.58) * (0.55 + 0.45 * core);
		// A crisp bright edge on each band's boundary.
		emit += GRAZE * 0.5 * (1.0 - smoothstep(0.0, 1.2, abs(dz - gw)));
		emit += HIT * 0.6 * (1.0 - smoothstep(0.0, 1.2, abs(dz - hw)));
		float crit_in = band(max(0.0, dc - cw), 9.0);
		emit = mix(emit, CRIT * (u_lit == 3 ? 1.35 : 0.95) * pulse, crit_in * core);
		// The crit's white-hot heart.
		emit += vec3(1.0, 0.97, 0.85) * (1.0 - smoothstep(0.0, cw + 1.0, dc)) * 0.5 * core;
		// The needle's light in the glass around it.
		emit += vec3(0.8, 0.9, 1.0) * 0.12 * (1.0 - smoothstep(0.0, 34.0, abs(u - u_needle) * px_u));
		vec3 c = glass + emit;
		// The glass's sheen across its top.
		c += vec3(0.6, 0.7, 0.8) * 0.07 * (1.0 - smoothstep(0.0, 0.3, vy));
		// A lock floods the glass with its colour from where it was fired.
		c += u_burst_col * u_burst * 0.6 * (1.0 - smoothstep(0.0, 160.0, abs(p.x - (u_track.x + u_burst_x * px_u))));
		col = mix(col, vec4(c, 1.0), 1.0 - smoothstep(-0.5, 0.5, d_track));
	}
	COLOR = col;
}
