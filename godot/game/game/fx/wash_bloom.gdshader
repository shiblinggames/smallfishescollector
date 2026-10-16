shader_type canvas_item;
render_mode blend_mul;
// A WATERCOLOUR SOAKING INTO THE PAGE (the Long Cast's chapter card,
// 2026-10-16): the painting multiplies onto the parchment (its cream paper
// disappears into the sheet's) and blooms out from the middle behind a ragged
// wet edge. box is the node's size (local px); progress 0 to 1.

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec2 box = vec2(560.0, 250.0);
uniform float soft = 0.18;

varying vec2 local;

void vertex() {
	local = VERTEX;
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void fragment() {
	vec4 t = texture(TEXTURE, UV);
	vec2 q = (local / max(box, vec2(1.0)) - 0.5) * vec2(1.0, 0.75) * 2.0;
	float n = noise(local * 0.025) * 0.6 + noise(local * 0.08) * 0.4;
	float d = length(q) + (n - 0.5) * 0.35;
	float p = progress * (1.5 + soft);
	// The painting's own edges feather into the page, so no box shows.
	vec2 e = local / max(box, vec2(1.0));
	float edge = smoothstep(0.0, 0.09, min(e.x, 1.0 - e.x) + (n - 0.5) * 0.04) * smoothstep(0.0, 0.14, min(e.y, 1.0 - e.y) + (n - 0.5) * 0.06);
	float a = (1.0 - smoothstep(p - soft, p, d)) * edge * COLOR.a;
	COLOR = vec4(mix(vec3(1.0), t.rgb, a), 1.0);
}
