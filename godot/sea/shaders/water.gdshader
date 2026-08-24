shader_type canvas_item;

// OPEN WATER, procedurally. No texture, so it scrolls forever without a seam
// and costs nothing to download — which matters when the whole build has to
// come down a phone connection before anything is playable.
//
// Three layers of the same cheap value-noise at different scales and speeds.
// One layer reads as a moving pattern; three read as water, because real swell
// is big slow shapes with small fast detail riding on them.
//
// world_offset is fed from the camera each frame (see sea.gd), which is what
// lets a screen-sized rect behave like an infinite ocean: the rect never moves,
// the noise samples somewhere else.

uniform vec2 world_offset = vec2(0.0);
uniform float scale : hint_range(0.0005, 0.02) = 0.0035;
uniform vec4 deep_color : source_color = vec4(0.016, 0.055, 0.094, 1.0);
uniform vec4 shallow_color : source_color = vec4(0.055, 0.184, 0.251, 1.0);
uniform vec4 crest_color : source_color = vec4(0.42, 0.72, 0.80, 1.0);

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Value noise with a smoothstep fade — cheaper than gradient noise and, at
// this scale under three octaves, indistinguishable.
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void fragment() {
	vec2 world = (FRAGCOORD.xy + world_offset) * scale;
	float t = TIME;

	// Swell: big and slow. This is the shape of the sea.
	float swell = noise(world * 1.0 + vec2(t * 0.020, t * 0.013));
	// Chop: mid-scale, faster, travelling across the swell rather than with it.
	float chop  = noise(world * 2.7 + vec2(-t * 0.055, t * 0.038));
	// Glitter: small and quick. Only ever seen in the crests.
	float fine  = noise(world * 7.5 + vec2(t * 0.11, -t * 0.09));

	float h = swell * 0.60 + chop * 0.30 + fine * 0.10;

	vec3 col = mix(deep_color.rgb, shallow_color.rgb, smoothstep(0.30, 0.72, h));
	// Crests are a narrow band at the very top of the range, so they read as
	// catching light rather than as a third colour smeared over everything.
	col = mix(col, crest_color.rgb, smoothstep(0.78, 0.94, h) * 0.55);

	COLOR = vec4(col, 1.0);
}
