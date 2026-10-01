shader_type canvas_item;
render_mode unshaded;
// THE CHART'S FOG (game/world_map.gd): water not yet sailed lies under cloud.
// The mask is the captain's real fog grid, stamped soft at four times its
// resolution (so a sailed stretch opens as a rounded clearing, never a
// square), broken at its edge by the wash so it dissolves like wet paint,
// with an inked tide-line where it gives way. The cloud is shaded, not blank,
// so unknown water reads as unknown and not as paper.

uniform sampler2D u_fog : filter_linear, repeat_disable;
uniform vec2 u_center = vec2(0.0, 9000.0);
uniform float u_scale = 0.03;
uniform vec2 u_res = vec2(1600.0, 900.0);
uniform vec2 u_origin = vec2(-22600.0, -1500.0);
uniform vec2 u_span = vec2(45500.0, 24500.0);
uniform float u_dark = 0.0;

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

void fragment() {
	vec2 px = (UV - 0.5) * u_res;
	vec2 w = u_center + px / u_scale;
	float r = length(w);
	float north = length(w - vec2(0.0, -3000.0));
	bool in_sea = r < 22800.0 || north < 3800.0;
	if (!in_sea) {
		COLOR = vec4(0.0);
	} else {
		// Sampled through a slow warp, so a clearing takes the shape of a
		// coastline and not of the square cells it was sailed in.
		vec2 warp = (vec2(fbm(w * 0.00045), fbm(w * 0.00045 + 5.2)) - 0.5) * 1500.0;
		vec2 uv = (w + warp - u_origin) / u_span;
		float seen = (uv.y < 0.0) ? 0.0 : texture(u_fog, uv).r;
		float n = (fbm(w * 0.0012) - 0.5) + (vnoise(w * 0.004) - 0.5) * 0.35;
		float f = 1.0 - smoothstep(0.30, 0.58, seen + n * 0.42);
		// The cloud: shaded billows of paper and grey wash.
		float billow = fbm(w * 0.00028 + vec2(0.0, 3.0));
		vec3 cloud = mix(vec3(0.80, 0.76, 0.68), vec3(0.62, 0.6, 0.56), smoothstep(0.35, 0.8, billow));
		cloud *= 0.95 + hash(floor(FRAGCOORD.xy * 0.75)) * 0.07;
		float rim = (1.0 - smoothstep(0.0, 0.16, abs(f - 0.5)));
		cloud = mix(cloud, vec3(0.38, 0.32, 0.27), rim * 0.4);
		cloud = mix(cloud, cloud * vec3(0.55, 0.5, 0.48), u_dark * 0.55);
		COLOR = vec4(cloud, clamp(f * 0.9 + rim * 0.35, 0.0, 0.95));
	}
}
