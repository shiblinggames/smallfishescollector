shader_type canvas_item;
// INK GOING ON (the Long Cast's paper, 2026-10-16): the drawn thing appears
// left to right behind a soft, ragged edge, the way a pen or a wet brush lays
// it down. box is the node's own size (local px); progress 0 to 1.

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec2 box = vec2(100.0, 40.0);
// Where the ink starts (local px): a centred line's words begin past its left.
uniform float left = 0.0;
uniform float soft = 0.08;

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
	float x = (local.x - left) / max(box.x, 1.0) + (noise(local * 0.09) - 0.5) * 0.05;
	float p = progress * (1.0 + soft * 2.0);
	COLOR.a *= 1.0 - smoothstep(p - soft, p, x + soft * 0.5);
}
