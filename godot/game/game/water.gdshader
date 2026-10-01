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
		float gl = vnoise(w * 7.0 + axis * 1.5 + vec2(TIME * 0.16, TIME * -0.09));
		float glit = smoothstep(mix(0.985, 0.86, lane), 1.0, gl) * smoothstep(0.30, 0.80, d1);
		float road = lane * 0.030 + glit * 0.42 * lane;
		col += road * toward_moon * vec3(0.80, 0.88, 1.0) * u_dark * u_swell * (1.0 - 0.88 * u_rush);
	}

	// Glints facing the sun.
	if (u_dark < 0.98) {
		vec2 gv = vec2(u_light.y, -u_light.x);
		float sparkle = vnoise(w * 6.0 + gv * 2.0 + vec2(TIME * 0.10, TIME * 0.06));
		float lo = mix(0.90, 0.74, u_warm);
		sparkle = smoothstep(lo, 0.995, sparkle) * smoothstep(0.30, 0.75, d1);
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

	// Foam where it is most stirred, and broken by the swell.
	float froth = smoothstep(0.30, 0.95, fh) * (0.55 + 0.45 * smoothstep(0.3, 0.7, rag));
	col += froth * vec3(0.90, 0.96, 1.0) * 0.16 * (1.0 - u_dark * 0.5);
	// Glints come off the slopes of what she stirred, too.
	col += smoothstep(0.02, 0.10, length(fg)) * smoothstep(0.6, 0.9, rag) * vec3(1.0, 0.97, 0.9) * 0.10 * (1.0 - u_dark);
	// AT NIGHT THE STIRRED WATER GLOWS: plankton lighting up in the wake, round
	// a cast, under a hull that moves.
	col += vec3(0.36, 0.96, 0.85) * smoothstep(0.05, 0.7, fh) * u_dark * 0.55 * (0.7 + 0.3 * rag);

	// LANTERN: warm light pooled on the water around the boat, at night. The
	// boat is always at the middle of the screen.
	if (u_lantern > 0.001) {
		vec2 off = vec2(px.x, px.y / GROUND);
		float pool = exp(-dot(off, off) / (260.0 * 260.0));
		float shimmer = 0.75 + 0.25 * vnoise(w * 9.0 + vec2(TIME * 0.3, -TIME * 0.2));
		col += vec3(1.0, 0.72, 0.38) * pool * shimmer * 0.16 * u_lantern;
	}

	// Dither away banding.
	float n0 = hash(FRAGCOORD.xy);
	float n1 = hash(FRAGCOORD.xy + vec2(17.31, 91.7));
	col += (n0 + n1 - 1.0) / 255.0;

	COLOR = vec4(col, 1.0);
}
