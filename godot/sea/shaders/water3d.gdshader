shader_type spatial;
render_mode cull_disabled, specular_schlick_ggx;

// OPEN WATER, as a surface rather than a wallpaper.
//
// The 2D version shaded a screen-sized rect. This shades a plane lying in the
// world, so the same noise now has perspective: waves compress toward the
// horizon on their own, which is most of what sells 2.5D before anything else
// is done.
//
// NO VERTEX DISPLACEMENT, deliberately. Real geometry waves need a densely
// subdivided plane, and this has to survive WKWebView on a phone — the platform
// already flagged as the weakest target for the web export. Everything here is
// fragment work on a flat plane, which at this camera angle is indistinguishable
// and costs a fraction.
//
// The noise itself is carried over from the 2D shader along with the three fixes
// that made it stop showing its lattice: octaves each turned to their own angle,
// a quintic fade, and a domain warp.

uniform float scale : hint_range(0.002, 0.5) = 0.10;
uniform vec4 deep_color : source_color = vec4(0.012, 0.045, 0.082, 1.0);
uniform vec4 shallow_color : source_color = vec4(0.045, 0.145, 0.208, 1.0);
uniform vec4 crest_color : source_color = vec4(0.62, 0.84, 0.90, 1.0);
uniform float crest_strength : hint_range(0.0, 1.0) = 0.5;

varying vec3 world_pos;

float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
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

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	// World XZ, so the pattern is anchored to the sea and not to the camera.
	// Sail across it and the water stays put, which is the whole difference
	// between moving through a place and scrolling a texture.
	vec2 w = world_pos.xz * scale;
	float t = TIME;

	float warp = noise(w * 0.6 + vec2(t * 0.02, -t * 0.015));
	w += vec2(warp - 0.5) * 1.6;

	float swell = noise(rot(0.00) * w * 1.00 + vec2(t * 0.050, t * 0.020));
	float chop  = noise(rot(0.87) * w * 2.30 + vec2(-t * 0.110, t * 0.050));
	float fine  = noise(rot(1.94) * w * 5.10 + vec2(t * 0.190, -t * 0.080));
	float tiny  = noise(rot(2.71) * w * 11.0 + vec2(-t * 0.300, t * 0.140));

	float h = swell * 0.45 + chop * 0.28 + fine * 0.18 + tiny * 0.09;
	h = clamp((h - 0.5) * 1.55 + 0.5, 0.0, 1.0);

	vec3 col = mix(deep_color.rgb, shallow_color.rgb, h);
	col = mix(col, crest_color.rgb, smoothstep(0.82, 0.99, h) * crest_strength);

	ALBEDO = col;
	// Water is a mirror at grazing angles and nearly matte overhead. Cheap
	// approximation, but it is what stops a flat plane reading as painted lino.
	METALLIC = 0.0;
	ROUGHNESS = mix(0.06, 0.42, h);
	SPECULAR = 0.55;
}
