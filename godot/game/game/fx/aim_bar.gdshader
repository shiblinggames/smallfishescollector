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

// The bands' colours come from AimBar.LIT_COL (one palette for the bands, the
// needle, the embers and the result word); these defaults mirror it.
uniform vec3 u_graze_col = vec3(0.92, 0.7, 0.38);
uniform vec3 u_hit_col = vec3(0.498, 0.839, 0.627);
uniform vec3 u_crit_col = vec3(0.961, 0.812, 0.416);

// PANEL mirrors BattleLook.LACQUER (Paper.NIGHT_PAPER_DEEP).
const vec3 PANEL = vec3(0.12, 0.1, 0.085);
const vec3 TRACK = vec3(0.07, 0.06, 0.055);

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

	// The crit seam stands proud of the track, top and bottom.
	{
		float px_u0 = u_track.z;
		float dc0 = abs((p.x - u_track.x) / px_u0 - u_crit_c) * px_u0;
		float cw0 = max(1.6, u_crit * px_u0);
		float over = abs(p.y - tc.y) - th.y;
		if (dc0 < cw0 && over > 0.0 && over < 6.0) {
			col = vec4(u_crit_col, (1.0 - smoothstep(cw0 - 1.2, cw0, dc0)) * 0.95);
		}
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
		float yy = p.y - tc.y;
		// THE ZONE, redrawn (Kong, 2026-10-05: the blocks "look really ugly"):
		// the graze a faint wash fading at its ends; the hit an inset, rounded
		// capsule with a fine light rim; the crit a crisp gold seam.
		float gw = (u_hit + u_graze) * px_u;
		if (dz < gw) {
			float fade = 1.0 - smoothstep(gw - 14.0, gw, dz);
			c = mix(c, u_graze_col, (u_lit == 1 ? 0.42 : 0.22) * fade);
		}
		float hw = u_hit * px_u;
		float d_hit = sd_box(vec2(abs(u - u_zone) * px_u, yy), vec2(0.0), vec2(hw, th.y - 5.0), th.y - 5.0);
		if (d_hit < 0.5) {
			float inside = 1.0 - smoothstep(-0.5, 0.5, d_hit);
			float rim = 1.0 - smoothstep(0.0, 1.4, abs(d_hit + 0.8));
			vec3 hc = mix(TRACK, u_hit_col, u_lit == 2 ? 0.92 : 0.6);
			hc = mix(hc, vec3(0.86, 1.0, 0.9), rim * 0.55);
			c = mix(c, hc, inside);
		}
		float cw = max(1.6, u_crit * px_u);
		if (dc < cw) {
			float core = 1.0 - smoothstep(cw - 1.2, cw, dc);
			c = mix(c, u_crit_col, (u_lit == 3 ? 1.0 : 0.9) * core);
		}
		// A lock flashes the band it hit (flat, fading).
		c = mix(c, u_burst_col, u_burst * 0.5 * (1.0 - step(70.0, abs(p.x - (u_track.x + u_burst_x * px_u)))));
		col = vec4(c, 1.0 - smoothstep(-0.5, 0.5, d_track));
	}
	COLOR = col;
}
