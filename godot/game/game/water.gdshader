// THE WATER (Godot port, stage 1).
//
// A port of web/app/(app)/sea/seaWater.ts, whose notes explain every term: the
// CSS gradient it grew out of, the golden hour stack, the swell stretched along
// a fixed wind, the shelf darkening with depth, caustics over the sandy
// shallows, glints facing the sun, whitecaps on the crests, and the moon's road
// at night. The colour is decided by Chart.sea_at on the CPU (the zone blend
// and the night pull); this shader only disturbs it, in brightness, never hue.
//
// Added for Godot (Kong, 2026-09-30, "water shaders on the plates"):
//   FLOW   the swell is advected along a slow current that bends with the
//          coarse field, so the sea drifts past rather than breathing in place;
//   LANTERN a warm pool on the water around the boat at night, the one light
//          that reaches the surface (the 2D lights reach the sprites).
// Storms, blooms and the campaign bays come with those systems.

shader_type canvas_item;
render_mode unshaded;

uniform vec2 u_cam = vec2(0.0);
uniform float u_zoom = 1.0;
uniform vec2 u_res = vec2(1600.0, 900.0);
uniform vec3 u_shallow;
uniform vec3 u_mid;
uniform vec3 u_deep;
uniform float u_dark = 0.0;
uniform float u_warm = 0.0;
uniform vec2 u_light = vec2(-0.7, -0.7);
uniform float u_swell = 1.0;
uniform float u_rush = 0.0;
uniform vec2 u_shelf = vec2(1400.0, 22600.0);
uniform float u_lantern = 0.0;
// THE DISTURBANCE (game/sea_field.gd): height from every wake, hull, cast and
// splash, at half the screen's resolution.
uniform sampler2D u_field : filter_linear, repeat_disable;
uniform vec2 u_field_px = vec2(0.00125, 0.0022);
uniform float u_field_on = 0.0;
// UNDER THE SURFACE (sea_field.gd's under layer): the shoals, laid beneath the
// water's own surface and bent by it.
uniform sampler2D u_under : filter_linear, repeat_disable;
// THE SHORE (game/shore.gd): Godot's distance field to the islands' painted
// plates, in screen pixels.
uniform float u_shore_on = 1.0;
// LAMPS reflected on the water at night: screen uv of the water under each
// light (x, y), its width in px (z) and strength (w); and their colours.
uniform vec4 u_lamps[16];
uniform vec4 u_lamp_cols[16];
uniform int u_lamp_n = 0;
// BLOOMS (lib/seaBlooms.ts): bioluminescent water, (x, y, r, on) in world px.
uniform vec4 u_blooms[4];
// SQUALLS (core/weather.gd): (x, y, r, power) in world px.
uniform vec4 u_storms[2];
// A lightning flash, 0 to 1.
uniform float u_flash = 0.0;

const float GROUND = 0.58;
const vec2 WIND = vec2(0.8231, 0.5679);

vec2 along_wind(vec2 p, float k) {
	return vec2(dot(p, WIND), dot(p, vec2(-WIND.y, WIND.x)) * k);
}

// NOT THE WEB'S sin() HASH. fract(sin(x) * 43758) leans on sin being exact
// for large x, and GPUs are not: on a desktop card through Vulkan it broke the
// sea into hard angular blocks. This one (Dave Hoskins' hash12) is fract and
// dot only, the same everywhere.
float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
	           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void fragment() {
	vec2 uv = UV;

	// The gradient the CSS drew.
	vec2 g = (uv - vec2(0.5, -0.10)) / vec2(1.30, 1.04);
	float t = clamp(length(g), 0.0, 1.0);
	vec3 col;
	if (t < 0.24) col = mix(u_shallow, u_mid, t / 0.24);
	else if (t < 0.60) col = mix(u_mid, u_deep, (t - 0.24) / 0.36);
	else col = mix(u_deep, u_deep * 0.62, (t - 0.60) / 0.40);

	// Golden hour: fire at the horizon end, gold around it, a little everywhere.
	float horizon = 1.0 - smoothstep(0.0, 0.72, t);
	float ember = 1.0 - smoothstep(0.0, 0.30, t);
	vec3 gold = vec3(1.00, 0.56, 0.20);
	vec3 fire = vec3(0.98, 0.26, 0.11);
	vec3 warm_col = mix(gold, fire, ember * 0.85);
	col = mix(col, col * 0.34 + warm_col * 0.92, u_warm * horizon * 0.88);
	col = mix(col, col * 0.78 + gold * 0.30, u_warm * 0.38);

	// Screen to world, undoing the squash so a wave is as long across as along.
	vec2 px = (uv - 0.5) * u_res;
	vec2 world = u_cam + vec2(px.x, px.y / GROUND) / u_zoom;
	float depth = 1.0 - uv.y;
	float recede = depth * depth;
	vec2 w = (world - u_cam) * (0.0016 * (1.0 + recede * 1.5)) + u_cam * 0.0016;

	// DISTURBED: how stirred the water is here, and which way it slopes.
	float fh = 0.0;
	vec2 fg = vec2(0.0);
	if (u_field_on > 0.5) {
		fh = texture(u_field, SCREEN_UV).r;
		fg = vec2(
			texture(u_field, SCREEN_UV + vec2(u_field_px.x, 0.0)).r - texture(u_field, SCREEN_UV - vec2(u_field_px.x, 0.0)).r,
			texture(u_field, SCREEN_UV + vec2(0.0, u_field_px.y)).r - texture(u_field, SCREEN_UV - vec2(0.0, u_field_px.y)).r);
		// The swell itself is pushed around by it.
		w += fg * 0.35;
	}

	// FLOW: a slow current, bent by a very coarse field, carries the swell.
	vec2 wa = along_wind(w, 0.62);
	float bend = vnoise(wa * 0.35 + vec2(TIME * 0.004, 0.0)) - 0.5;
	vec2 flow = vec2(TIME * 0.020, TIME * -0.013) + vec2(bend, -bend) * 0.8;
	float d1 = vnoise(wa + flow);
	float d2 = vnoise(wa * 2.7 + vec2(-TIME * 0.031, TIME * 0.017) + flow * 0.5);
	float fine = min(0.62, 0.16 * (1.0 - 0.85 * u_rush));
	float swell = (d1 * (1.0 - fine) + d2 * fine) - 0.5;

	// How deep in a squall this water is (lib/seaWeather squallAt).
	float storm = 0.0;
	for (int q = 0; q < 2; q++) {
		vec4 S = u_storms[q];
		if (S.z < 1.0) continue;
		float sdist = length(world - S.xy);
		float kq = 1.0 - max(0.0, (sdist - S.z * 0.35) / (S.z * 0.65));
		storm = max(storm, clamp(kq, 0.0, 1.0) * S.w);
	}
	// The squall's ragged edge, so it reads as weather and not a circle.
	storm *= smoothstep(0.15, 0.6, vnoise(world * 0.0012 + vec2(TIME * 0.01, 0.0)) * 0.5 + storm * 0.9);
	swell *= 1.0 + storm * 1.6;

	// What swims beneath: refracted by the swell and the stirred water, and
	// dimmed by the water above it; the surface's light, glints and foam are
	// all laid over it below.
	vec2 refr = vec2(swell * 0.010, swell * 0.006) + fg * 0.02;
	vec4 fish = texture(u_under, SCREEN_UV + refr);
	col = mix(col, fish.rgb, clamp(fish.a * 1.15, 0.0, 0.92));

	float shelf = smoothstep(u_shelf.x, u_shelf.y, length(world));
	float shade = 1.0 + swell * 0.20 * u_swell * (1.0 - recede * 0.55);
	shade *= 1.0 - shelf * 0.14;
	float facing = dot(normalize(vec2(swell, swell * 0.6) + vec2(0.0001)), normalize(u_light));
	shade += facing * 0.035 * u_swell;
	// The stirred water's slope catches the light on one side, shadows the other.
	shade += dot(fg, normalize(u_light)) * 0.85 + fh * 0.05;
	col *= shade;

	// Caustics over the sandy shallows, by day.
	float sandy = 1.0 - smoothstep(3000.0, 6200.0, length(world));
	if (sandy > 0.01 && u_dark < 0.9) {
		vec2 cw = w * 3.1 + vec2(swell * 1.5, swell * -0.9);
		vec2 cwa = along_wind(cw, 0.44);
		float c1 = vnoise(cwa + vec2(TIME * 0.035, TIME * 0.021));
		float c2 = vnoise(cwa * 2.1 + vec2(c1 * 0.9 - TIME * 0.026, TIME * 0.033));
		float r1 = 1.0 - abs(c1 * 2.0 - 1.0);
		float r2 = 1.0 - abs(c2 * 2.0 - 1.0);
		float ridged = pow(r1, 2.4) * 0.62 + pow(r2, 3.6) * 0.30;
		float vary = 0.40 + 0.60 * vnoise(cw * 0.55 - vec2(TIME * 0.013, TIME * 0.008));
		float caust = ridged * vary * sandy * (1.0 - u_dark) * (1.0 - 0.85 * u_rush);
		col += caust * vec3(0.72, 0.92, 0.86) * 0.07 * u_swell;
	}

	// The moon's road.
	if (u_dark > 0.02) {
		vec2 lp = vec2(px.x, px.y / GROUND);
		vec2 axis = normalize(u_light);
		float along_l = dot(lp, axis);
		float across_l = abs(dot(lp, vec2(axis.y, -axis.x)));
		float half_w = mix(0.10, 0.36, 1.0 - depth) * u_res.x * 0.5;
		float lane = exp(-pow(across_l / max(1.0, half_w), 2.0));
		float toward_moon = 0.5 + 0.5 * smoothstep(-0.9, 0.9, along_l / (u_res.x * 0.5));
		// Fine flecks (the web's scale smeared into big shapes up close).
		float gl = vnoise(w * 13.0 + axis * 1.5 + vec2(TIME * 0.12, TIME * -0.07));
		float glit = smoothstep(mix(0.985, 0.88, lane), 1.0, gl) * smoothstep(0.30, 0.80, d1);
		float road = lane * 0.030 + glit * 0.42 * lane;
		col += road * toward_moon * vec3(0.80, 0.88, 1.0) * u_dark * u_swell * (1.0 - 0.88 * u_rush);
	}

	// Glints facing the sun.
	if (u_dark < 0.98) {
		vec2 gv = vec2(u_light.y, -u_light.x);
		float sparkle = vnoise(w * 3.2 + gv * 2.0 + vec2(TIME * 0.05, TIME * 0.03));
		float lo = mix(0.86, 0.72, u_warm);
		sparkle = smoothstep(lo, 1.0, sparkle) * smoothstep(0.30, 0.75, d1) * 0.7;
		float sun_road = mix(1.0, 1.0 + horizon * 1.1, u_warm);
		vec3 glint_col = mix(vec3(1.0), vec3(1.0, 0.62, 0.28), u_warm);
		col += sparkle * glint_col * 0.060 * sun_road * u_swell * (1.0 - u_dark) * (1.0 - 0.88 * u_rush);
	}

	// Whitecaps on the crests.
	float crest = smoothstep(0.60, 0.80, d1) * smoothstep(0.50, 0.85, d2);
	float rag = vnoise(wa * 7.0 + vec2(TIME * 0.09, TIME * -0.05));
	crest *= smoothstep(0.35, 0.75, rag);
	float cap_amt = 0.09 * 0.6 * u_swell * (1.0 - u_dark * 0.55) * (1.0 - 0.55 * u_rush) * (1.0 - recede * 0.6);
	col += crest * vec3(0.90, 0.96, 1.0) * cap_amt;

	// SQUALL: the water goes slate and choppy, whipped white on the crests,
	// and pocked by rain.
	if (storm > 0.01) {
		vec3 slate = vec3(dot(col, vec3(0.3, 0.5, 0.2))) * vec3(0.78, 0.86, 0.92);
		col = mix(col, slate * 0.72, storm * 0.7);
		col += crest * vec3(0.85, 0.92, 1.0) * storm * 0.18;
		vec2 rc = world / 34.0;
		vec2 cell = floor(rc);
		float rh = hash(cell);
		float ph = fract(TIME * (1.1 + rh) + rh * 7.0);
		vec2 rp = (fract(rc) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6) * 34.0;
		float ring = exp(-pow((length(vec2(rp.x, rp.y)) - ph * 9.0) / 1.4, 2.0)) * (1.0 - ph);
		col += vec3(0.8, 0.88, 0.95) * ring * storm * 0.14 * step(0.62, rh);
	}
	col += vec3(0.75, 0.82, 1.0) * u_flash * 0.35;

	// Foam where it is most stirred, and broken by the swell.
	float froth = smoothstep(0.30, 0.95, fh) * (0.55 + 0.45 * smoothstep(0.3, 0.7, rag));
	col += froth * vec3(0.90, 0.96, 1.0) * 0.16 * (1.0 - u_dark * 0.5);
	// AT NIGHT THE STIRRED WATER GLOWS: plankton lighting up in the wake, round
	// a cast, under a hull that moves.
	col += vec3(0.36, 0.96, 0.85) * smoothstep(0.05, 0.7, fh) * u_dark * 0.55 * (0.7 + 0.3 * rag);
	col += vec3(0.30, 0.85, 0.75) * smoothstep(0.5, 1.0, fh) * u_dark * 0.5;

	// LANTERN: warm light pooled on the water around the boat, at night. The
	// boat is always at the middle of the screen.
	if (u_lantern > 0.001) {
		vec2 off = vec2(px.x, px.y / GROUND);
		float pool = exp(-dot(off, off) / (260.0 * 260.0));
		float shimmer = 0.75 + 0.25 * vnoise(w * 9.0 + vec2(TIME * 0.3, -TIME * 0.2));
		col += vec3(1.0, 0.72, 0.38) * pool * shimmer * 0.16 * u_lantern;
	}

	// THE ISLANDS' SHADOWS on the water: marched from here toward the sun
	// through the distance field; long and soft when the sun is low.
	if (u_shore_on > 0.5 && u_dark < 0.95) {
		vec2 sp = screen_uv_to_sdf(SCREEN_UV);
		vec2 dir = normalize(vec2(u_light.x, u_light.y * GROUND));
		float reach = mix(70.0, 520.0, u_warm) * u_zoom;
		float lit = 1.0;
		float tt = 6.0;
		for (int i = 0; i < 18; i++) {
			float dd = texture_sdf(sp + dir * tt);
			if (dd < 0.5) { lit = 0.0; break; }
			lit = min(lit, 6.0 * dd / tt);
			tt += max(dd, 5.0);
			if (tt > reach) break;
		}
		float fade = 1.0 - smoothstep(reach * 0.4, reach, tt);
		col *= mix(1.0, 0.70, (1.0 - clamp(lit, 0.0, 1.0)) * (1.0 - u_dark) * mix(0.55, 1.0, u_warm) * (lit < 0.5 ? 1.0 : fade));
	}

	// THE SHORE. Near land the water shoals: lighter and clearer over sand, and
	// foam laps in toward the beach in bands that run up and fall back.
	if (u_shore_on > 0.5) {
		float sd = texture_sdf(screen_uv_to_sdf(SCREEN_UV)) / max(u_zoom, 0.01);
		if (sd < 420.0) {
			float shoal = 1.0 - smoothstep(0.0, 260.0, sd);
			col = mix(col, col * 1.18 + vec3(0.06, 0.13, 0.11), shoal * 0.55 * (1.0 - u_dark * 0.6));
			// Sand showing through the last few yards.
			col = mix(col, vec3(0.62, 0.66, 0.52) * (1.0 - u_dark * 0.75), (1.0 - smoothstep(0.0, 26.0, sd)) * 0.16);
			float wob = vnoise(world * 0.012 + vec2(TIME * 0.05, 0.0)) * 18.0;
			float lap = 0.0;
			for (int k = 0; k < 3; k++) {
				float ph = fract(TIME * 0.11 + float(k) / 3.0);
				float at = mix(70.0, 4.0, ph) + wob;
				float band = exp(-pow((sd - at) / (4.0 + 6.0 * ph), 2.0));
				// Broken along the shore, so it is foam and not a contour line.
				float broken = smoothstep(0.35, 0.75, vnoise(world * 0.018 + vec2(float(k) * 7.3, TIME * 0.04)));
				lap += band * sin(ph * 3.14159) * broken * (0.6 + 0.4 * rag);
			}
			float edge = exp(-pow(sd / 6.0, 2.0)) * smoothstep(0.3, 0.8, vnoise(world * 0.04 + vec2(TIME * 0.25, 0.0)));
			col += (lap * 0.13 + edge * 0.22) * vec3(0.92, 0.97, 1.0) * (1.0 - u_dark * 0.55);
			col += (lap + edge) * vec3(0.36, 0.96, 0.85) * u_dark * 0.12;
		}
	}

	// NIGHT ON THE WATER.
	if (u_dark > 0.05) {
		// Every lamp throws a column down the water toward the viewer, broken
		// into ripples by the swell and by whatever stirred it.
		vec2 scr = SCREEN_UV * u_res;
		for (int i = 0; i < 16; i++) {
			if (i >= u_lamp_n) break;
			vec4 L = u_lamps[i];
			vec2 at = L.xy * u_res;
			float dy = scr.y - at.y;
			if (dy < -6.0 || dy > 260.0 * u_zoom) continue;
			float wob = sin(dy * 0.21 / u_zoom - TIME * 2.6 + float(i)) * 3.0 + (fg.x * 900.0);
			float wid = L.z * u_zoom * (0.55 + dy / (260.0 * u_zoom));
			float across = exp(-pow((scr.x - at.x - wob) / max(wid, 1.0), 2.0));
			float down = exp(-max(dy, 0.0) / (110.0 * u_zoom)) * smoothstep(-6.0, 4.0, dy);
			float broken = 0.62 + 0.38 * sin(dy * 0.55 / u_zoom + TIME * 3.4 + swell * 9.0 + vnoise(vec2(dy * 0.05, TIME)) * 4.0);
			col += u_lamp_cols[i].rgb * across * down * broken * L.w * u_dark;
		}
		// Stars, caught and lost on the swell.
		vec2 sg = floor(scr / 9.0);
		float sh = hash(sg + floor(u_cam / 900.0));
		if (sh > 0.9965) {
			vec2 c = (sg + 0.5) * 9.0;
			float tw = 0.5 + 0.5 * sin(TIME * (2.0 + sh * 40.0) + sh * 90.0);
			float dot_ = exp(-dot(scr - c, scr - c) / 2.2);
			col += vec3(0.85, 0.9, 1.0) * dot_ * tw * u_dark * 0.55 * smoothstep(0.35, 0.7, d1);
		}
		// The blooms: patches of water that glow when it is dark.
		for (int b = 0; b < 4; b++) {
			vec4 B = u_blooms[b];
			if (B.w < 0.5) continue;
			float dd = length(world - B.xy);
			if (dd > B.z) continue;
			float kk = 1.0 - max(0.0, (dd - 0.33 * B.z) / (0.67 * B.z));
			float e = kk * kk * (3.0 - 2.0 * kk);
			float mottle = smoothstep(0.35, 0.85, vnoise(wa * 1.6 + vec2(TIME * 0.012, -TIME * 0.009)));
			float breathe = 0.75 + 0.25 * sin(TIME * 0.35 + world.x * 0.0007);
			col += e * mottle * breathe * vec3(0.22, 0.86, 0.72) * 0.14 * u_dark;
			// Stirred water in a bloom burns brighter.
			col += e * vec3(0.30, 1.0, 0.85) * smoothstep(0.05, 0.6, fh) * u_dark * 0.6;
		}
	}

	// Dither away banding.
	float n0 = hash(FRAGCOORD.xy);
	float n1 = hash(FRAGCOORD.xy + vec2(17.31, 91.7));
	col += (n0 + n1 - 1.0) / 255.0;

	COLOR = vec4(col, 1.0);
}
