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
uniform float scale : hint_range(0.0005, 0.05) = 0.006;
uniform vec4 deep_color : source_color = vec4(0.035, 0.094, 0.145, 1.0);
uniform vec4 shallow_color : source_color = vec4(0.090, 0.220, 0.298, 1.0);
uniform vec4 crest_color : source_color = vec4(0.55, 0.78, 0.85, 1.0);

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
	// STRETCHED ACROSS ONE AXIS. Isotropic noise gives round patches, and round
	// patches read as camouflage, not sea. Squashing the sample makes every
	// octave elongate into travelling bands, which is what a surface actually
	// looks like from above.
	vec2 w = world * vec2(1.0, 2.4);
	float t = TIME;

	// Four octaves, each smaller and faster, all drifting the same general way
	// so the whole surface has a direction rather than boiling in place.
	float swell = noise(w * 1.00 + vec2(t * 0.050, t * 0.020));
	float chop  = noise(w * 2.30 + vec2(-t * 0.110, t * 0.050));
	float fine  = noise(w * 5.10 + vec2(t * 0.190, -t * 0.080));
	float tiny  = noise(w * 11.0 + vec2(-t * 0.300, t * 0.140));

	float h = swell * 0.45 + chop * 0.28 + fine * 0.18 + tiny * 0.09;

	// A GENTLE gain around the midpoint, not a smoothstep. Averaging octaves
	// leaves a distribution bunched near 0.5, and a smoothstep across that
	// bunching drove nearly every pixel to one end or the other -- hard blobs
	// with no midtones. A modest linear stretch keeps the middle intact.
	h = clamp((h - 0.5) * 1.55 + 0.5, 0.0, 1.0);

	vec3 col = mix(deep_color.rgb, shallow_color.rgb, h);
	// Crests: a thin sliver at the very top, so they read as the odd wave
	// catching light rather than as foam over half the ocean.
	col = mix(col, crest_color.rgb, smoothstep(0.82, 0.99, h) * 0.5);

	COLOR = vec4(col, 1.0);
}
