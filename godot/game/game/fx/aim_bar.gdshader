shader_type canvas_item;
render_mode unshaded;
// THE AIM BAR (Godot over the web, 2026-10-04): flat, in the game's own clean
// UI (Kong: "more flat looking to still match our overall aesthetic"; earlier,
// not the fishing dial's look). A dark lacquer panel with a hairline edge
// round a darker track; the bands solid and flat (a muted amber graze, the
// hit green, the crit a solid gold seam), the one under the needle at full
// strength and the rest held back; plain range ticks; a lock flashes the band
// it hit. No bevels, no gloss, no glow. game/aim_bar.gd draws the needle, the
// words and what the enemy does to the bar on top.

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
uniform float u_needle = 0.5;

const vec3 PANEL = vec3(0.135, 0.11, 0.095);
const vec3 TRACK = vec3(0.07, 0.06, 0.055);
const vec3 GRAZE = vec3(0.86, 0.62, 0.3);
const vec3 HIT = vec3(0.4, 0.78, 0.52);
const vec3 CRIT = vec3(0.98, 0.8, 0.32);

float sd_box(vec2 p, vec2 c, vec2 b, float r) {
	vec2 q = abs(p - c) - b + vec2(r);
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 p = UV * u_size;
	vec2 tc = u_track.xy + u_track.zw * 0.5;
	vec2 th = u_track.zw * 0.5;
	float d_track = sd_box(p, tc, th, 6.0);
	float d_body = sd_box(p, tc, th + vec2(8.0, 8.0), 12.0);
	vec4 col = vec4(0.0);

	// THE PANEL: flat lacquer, a hairline edge.
	if (d_body < 0.5) {
		vec3 c = PANEL;
		c = mix(c, vec3(1.0), 0.09 * (1.0 - smoothstep(0.0, 1.2, abs(d_body + 0.6))));
		col = vec4(c, 0.96 * (1.0 - smoothstep(-0.5, 0.5, d_body)));
	}

	// THE TRACK: flat and dark, the bands solid on it.
	if (d_track < 0.5) {
		float u = (p.x - u_track.x) / u_track.z;
		float px_u = u_track.z;
		vec3 c = TRACK;
		// Plain range ticks along its foot.
		float maj = abs(fract(u * 12.0 + 0.5) - 0.5) * px_u / 12.0;
		float foot = step(tc.y + th.y * 0.45, p.y);
		c = mix(c, vec3(1.0), (1.0 - step(0.75, maj)) * 0.08 * foot);
		float dz = abs(u - u_zone) * px_u;
		float dc = abs(u - u_crit_c) * px_u;
		if (dz < (u_hit + u_graze) * px_u) {
			c = mix(TRACK, GRAZE, u_lit == 1 ? 0.95 : 0.5);
		}
		if (dz < u_hit * px_u) {
			c = mix(TRACK, HIT, u_lit == 2 ? 1.0 : 0.62);
		}
		if (dc < u_crit * px_u) {
			c = mix(TRACK, CRIT, u_lit == 3 ? 1.0 : 0.85);
		}
		// A lock flashes the band it hit (flat, fading).
		c = mix(c, u_burst_col, u_burst * 0.5 * (1.0 - step(70.0, abs(p.x - (u_track.x + u_burst_x * px_u)))));
		col = vec4(c, 1.0 - smoothstep(-0.5, 0.5, d_track));
	}
	COLOR = col;
}
