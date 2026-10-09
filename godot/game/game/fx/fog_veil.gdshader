shader_type canvas_item;
// FOG (core/weather.gd's Fog front): a pale veil over the screen, thin round
// her boat and thick toward the edges, rolling in slow wisps, so in fog you
// see less of the sea around you.

uniform float u_amt = 0.0;
uniform vec2 u_focus = vec2(800.0, 450.0);
uniform vec2 u_res = vec2(1600.0, 900.0);
uniform vec2 u_drift = vec2(0.0);
// The veil sits above the world's night CanvasModulate (SquallFx, layer 1),
// so it takes the dark itself (SquallFx.night), and a bay's own colour.
uniform float u_dark = 0.0;
uniform vec3 u_tint = vec3(1.0);

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

void fragment() {
	vec2 px = SCREEN_UV * u_res;
	float d = length((px - u_focus) / vec2(u_res.y * 1.25, u_res.y * 0.85));
	float thick = smoothstep(0.12, 0.75, d);
	vec2 q = px / 260.0 + u_drift;
	float w = vnoise(q) * 0.55 + vnoise(q * 2.3 - u_drift * 0.6) * 0.3 + vnoise(q * 5.1) * 0.15;
	float a = u_amt * clamp(thick * (0.55 + w * 0.7) + w * 0.12, 0.0, 1.0) * 0.86;
	vec3 col = vec3(0.86, 0.89, 0.9) * u_tint;
	col = mix(col, col * vec3(0.30, 0.34, 0.46), u_dark * 0.85);
	COLOR = vec4(col, a);
}
