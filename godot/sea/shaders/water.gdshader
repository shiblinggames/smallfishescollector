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
	// Two mixes rather than one sin(dot()). A single sin hash correlates along
	// diagonals, which is one of the ways the lattice shows itself.
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	// QUINTIC fade, not cubic. A cubic smoothstep leaves the second derivative
	// discontinuous at cell edges and the eye reads that as a grid. This is the
	// same reason Perlin moved to quintic.
	vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

mat2 rot(float a) {
	float c = cos(a);
	float s = sin(a);
	return mat2(vec2(c, -s), vec2(s, c));
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
	// DOMAIN WARP. Bend the sample space with one slow coarse noise before the
	// detail octaves read it. Costs a single extra sample and is the biggest
	// single reason the result stops looking procedural.
	float warp = noise(w * 0.6 + vec2(t * 0.02, -t * 0.015));
	w += vec2(warp - 0.5) * 1.6;

	// Each octave TURNED to a different angle. Sampling them all on the same
	// axis-aligned grid let their lattices line up and reinforce each other,
	// which is what put visible squares marching across the sea.
	float swell = noise(rot(0.00) * w * 1.00 + vec2(t * 0.050, t * 0.020));
	float chop  = noise(rot(0.87) * w * 2.30 + vec2(-t * 0.110, t * 0.050));
	float fine  = noise(rot(1.94) * w * 5.10 + vec2(t * 0.190, -t * 0.080));
	float tiny  = noise(rot(2.71) * w * 11.0 + vec2(-t * 0.300, t * 0.140));

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
