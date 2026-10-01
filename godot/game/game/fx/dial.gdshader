shader_type canvas_item;
render_mode unshaded;
// THE CATCH DIAL, DRAWN (Godot over the web baseline, 2026-10-01). Everything
// the dial is made of, in the web's 220 box: a brass bezel lit from the upper
// left with engraved ticks and rivets; the zone track, bevelled, each zone cut
// from the next, the live one lit and the rest dimmed as the web dims them,
// the perfect a moving gold sheen and the snag hazard-striped; a glass face
// with a compass rose and light moving under it; and the needle's trail, a
// comet of the colour it is over. The needle, hub, glyphs and fire are drawn
// on top by game/dial.gd. The logic is untouched: this only draws what the
// dial already knows.

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

const vec3 MISS = vec3(0.392, 0.455, 0.545);
const vec3 CATCH = vec3(0.290, 0.871, 0.502);
const vec3 PERFECT = vec3(0.992, 0.902, 0.541);
const vec3 SNAG = vec3(0.973, 0.443, 0.443);

float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

vec3 kind_col(float kind) {
	if (kind < 0.5) return MISS;
	if (kind < 1.5) return CATCH;
	if (kind < 2.5) return PERFECT;
	return SNAG;
}

float dim_of(float kind) {
	if (kind < 0.5) return 0.30;
	if (kind < 1.5) return 0.34;
	if (kind < 2.5) return 0.55;
	return 0.48;
}

// Signed degrees from a to b, the short way round.
float ddeg(float a, float b) {
	return mod(b - a + 540.0, 360.0) - 180.0;
}

void fragment() {
	float k = min(u_size.x, u_size.y) / 220.0;
	vec2 p = (UV - 0.5) * u_size / k;
	float r = length(p);
	// Degrees clockwise from the top.
	float deg = mod(degrees(atan(p.x, -p.y)) + 360.0, 360.0);
	vec2 dir = r > 0.001 ? p / r : vec2(0.0, -1.0);
	vec2 light = normalize(vec2(-0.6, -0.8));
	float aa = 1.2 / k;
	vec4 col = vec4(0.0);

	// The drop shadow under the whole instrument.
	float sh = 1.0 - smoothstep(102.0, 110.0, length(p - vec2(0.0, 3.0)));
	col = vec4(0.0, 0.0, 0.0, sh * 0.55);

	// THE BEZEL: brass, rounded across its width, lit from the upper left.
	if (r > 94.0 && r < 108.0) {
		float u = (r - 94.0) / 14.0;
		float round_ = sin(u * 3.14159);
		float lit = 0.5 + 0.5 * dot(dir, light) * (u < 0.5 ? 1.0 : -0.4);
		vec3 brass = mix(vec3(0.36, 0.24, 0.10), vec3(0.93, 0.76, 0.42), clamp(lit * 0.85 + round_ * 0.25, 0.0, 1.0));
		// Brushed: fine rings.
		brass *= 0.92 + 0.08 * sin(r * 9.0);
		// Engraved ticks: every 7.5 degrees, longer every 30.
		float minor = abs(mod(deg + 3.75, 7.5) - 3.75);
		float major = abs(mod(deg + 15.0, 30.0) - 15.0);
		float tick = (1.0 - smoothstep(0.25, 0.6, minor)) * step(0.55, u) + (1.0 - smoothstep(0.3, 0.8, major)) * step(0.3, u);
		brass *= 1.0 - clamp(tick, 0.0, 1.0) * 0.45;
		// Rivets at the four diagonals.
		float rv = abs(mod(deg + 45.0, 90.0) - 45.0);
		vec2 rp = vec2(rv * 0.0174 * r, r - 101.0);
		float rivet = 1.0 - smoothstep(1.6, 2.4, length(rp));
		brass = mix(brass, vec3(1.0, 0.9, 0.64) * (0.7 + 0.3 * dot(dir, light)), rivet);
		float edge = smoothstep(94.0, 94.0 + aa, r) * (1.0 - smoothstep(108.0 - aa, 108.0, r));
		col = mix(col, vec4(brass, 1.0), edge);
	}

	// THE TRACK: the zones, bevelled, each cut from the next.
	if (r >= 64.0 && r <= 94.5) {
		float rot = mod(deg - u_rot, 360.0);
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
				zc = u_cols[i].a > 0.5 ? u_cols[i].rgb : kind_col(kind);
			}
		}
		float u = (r - 64.0) / 30.0;
		// Bevel: the outer lip catches the light, the inner falls away.
		float bevel = 0.78 + 0.32 * u + 0.14 * dot(dir, light) * (1.0 - abs(u - 0.5) * 2.0);
		float dimk = lit > 0.5 ? 1.0 : dim_of(kind);
		vec3 c = zc * bevel;
		if (kind > 1.5 && kind < 2.5) {
			// The perfect: a sheen running round it.
			float sheen = pow(0.5 + 0.5 * sin(deg * 0.35 - TIME * 4.0), 6.0);
			c = mix(c, vec3(1.0, 0.98, 0.86), sheen * 0.55 + u_burst * 0.4);
		} else if (kind > 2.5) {
			// The snag: hazard stripes.
			float st = step(0.5, fract((deg * 0.9 + r * 0.6) / 9.0 + TIME * 0.05));
			c *= 0.82 + 0.18 * st;
		} else if (kind < 0.5) {
			c *= 0.9 + 0.1 * hash(floor(vec2(deg * 2.0, r)));
		}
		vec3 base = vec3(0.035, 0.05, 0.07);
		c = mix(base, c, dimk);
		// The lit zone glows from inside its edges.
		if (lit > 0.5) {
			float into = min(ddeg(z0, rot), ddeg(rot, z1));
			c += zc * 0.25 * (1.0 - smoothstep(0.0, 6.0, into)) + zc * 0.12 * (1.0 - abs(u - 0.5) * 2.0);
		}
		// The seams between zones, and the track's inner and outer lips.
		float seam = min(abs(ddeg(rot, z0)), abs(ddeg(rot, z1))) * 0.0174 * r;
		c *= mix(0.25, 1.0, smoothstep(0.4, 1.4, seam));
		c *= mix(0.55, 1.0, smoothstep(64.0, 66.5, r)) * mix(0.6, 1.0, 1.0 - smoothstep(92.5, 94.5, r));
		float on = smoothstep(64.0 - aa, 64.0, r) * (1.0 - smoothstep(94.5 - aa, 94.5, r));
		col = mix(col, vec4(c, 1.0), on);
	}

	// A thin brass rim inside the track.
	if (r > 60.0 && r < 64.5) {
		float lit = 0.5 + 0.5 * dot(dir, light);
		vec3 rim = mix(vec3(0.3, 0.2, 0.08), vec3(0.85, 0.68, 0.36), lit);
		float on = smoothstep(60.0, 60.0 + aa, r) * (1.0 - smoothstep(64.5 - aa, 64.5, r));
		col = mix(col, vec4(rim, 1.0), on);
	}

	// THE FACE: deep glass, a compass rose under it, light moving through.
	if (r <= 60.5) {
		vec3 face = mix(vec3(0.05, 0.10, 0.15), vec3(0.012, 0.022, 0.035), smoothstep(0.0, 60.0, r));
		// The rose: eight points, faint, engraved.
		float a8 = abs(mod(deg + 22.5, 45.0) - 22.5);
		float spoke = 1.0 - smoothstep(0.0, 1.0 + r * 0.03, a8 * 0.0174 * r);
		float main = abs(mod(deg + 45.0, 90.0) - 45.0) < 22.5 ? 1.0 : 0.55;
		face += vec3(0.75, 0.65, 0.42) * spoke * main * 0.07 * smoothstep(8.0, 20.0, r) * (1.0 - smoothstep(40.0, 56.0, r));
		float ringl = 1.0 - smoothstep(0.0, 0.7, abs(r - 46.0));
		face += vec3(0.75, 0.65, 0.42) * ringl * 0.06;
		// Light moving under the glass.
		vec2 q = p * 0.06;
		float caust = sin(q.x * 3.1 + TIME * 0.7 + sin(q.y * 2.3 + TIME * 0.5)) * sin(q.y * 3.7 - TIME * 0.6 + sin(q.x * 1.9));
		face += vec3(0.25, 0.55, 0.65) * pow(max(caust, 0.0), 3.0) * 0.06;
		// The glass: a highlight across the upper left.
		vec2 g = p - vec2(-14.0, -22.0);
		float gloss = (1.0 - smoothstep(0.0, 1.0, abs(length(g) - 44.0) / 10.0)) * smoothstep(0.1, 0.9, dot(normalize(g + vec2(0.0001)), vec2(-0.5, -0.86)));
		face += vec3(1.0) * gloss * 0.07;
		float on = 1.0 - smoothstep(60.5 - aa, 60.5, r);
		col = mix(col, vec4(face, 1.0), on);
	}

	// THE TRAIL: a comet behind the needle, the colour of what it is over.
	if (u_trail > 0.5 && r > 14.0 && r < 92.0) {
		float behind = ddeg(deg, u_angle);
		if (behind > 0.0 && behind < u_trail) {
			float f = 1.0 - behind / u_trail;
			float across = smoothstep(14.0, 30.0, r) * (1.0 - smoothstep(70.0, 92.0, r));
			col.rgb += u_needle_col.rgb * pow(f, 2.2) * across * 0.30;
		}
	}

	// A blackout (the Ancient Deep): the whole instrument goes dark.
	col.rgb = mix(col.rgb, vec3(0.005, 0.005, 0.01), u_dark * 0.92);
	COLOR = col;
}
