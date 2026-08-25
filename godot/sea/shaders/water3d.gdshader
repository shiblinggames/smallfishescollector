shader_type spatial;
// UNSHADED, and this is the single most important line in the file.
//
// The house style is hand-painted: look at fishing-zones-bg.jpg and there is not
// one specular highlight in it. Nothing is shiny, nothing is lit — the whole
// image is flat washes of value. A PBR water surface with roughness and
// specular is the exact opposite of that and reads as "3D render" no matter what
// colours you feed it. Taking the lighting out is what makes this a painting.
render_mode unshaded, cull_disabled;

// THE PALETTE IS SAMPLED FROM THE PAINTING, not invented. Desaturated
// blue-greys in a narrow band, with depth carried almost entirely by VALUE.
// The earlier teal was far more saturated than anything in the game's art.
uniform float scale : hint_range(0.002, 0.5) = 0.10;
uniform vec4 deep_color : source_color = vec4(0.086, 0.137, 0.169, 1.0);
uniform vec4 mid_color : source_color = vec4(0.243, 0.361, 0.404, 1.0);
uniform vec4 pale_color : source_color = vec4(0.549, 0.647, 0.671, 1.0);
uniform vec4 crest_color : source_color = vec4(0.820, 0.871, 0.871, 1.0);
/// How many flat washes the water is quantised into. Watercolour and gouache do
/// not blend smoothly — they pool into steps with edges. Raise for smoother,
/// lower for more graphic.
uniform float bands : hint_range(2.0, 16.0) = 6.0;
/// How elongated the strokes are. The painting's surface is long horizontal
/// brush marks, not round blobs.
uniform float stroke : hint_range(1.0, 12.0) = 6.0;
uniform float crest_strength : hint_range(0.0, 1.0) = 0.85;
/// Paper tooth. Small, but it is a large part of why watercolour reads as paint
/// rather than as gradient.
uniform float grain : hint_range(0.0, 0.5) = 0.055;

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
	vec2 w = world_pos.xz * scale;
	float t = TIME;

	// Long horizontal strokes rather than round patches. The painting's surface
	// is brush marks travelling across the frame, so the sample is squashed far
	// harder than a naturalistic ocean would want.
	vec2 s = w * vec2(1.0, stroke);

	float warp = noise(s * 0.6 + vec2(t * 0.02, -t * 0.015));
	s += vec2(warp - 0.5) * 1.6;

	float swell = noise(rot(0.00) * s * 1.00 + vec2(t * 0.050, t * 0.020));
	float chop  = noise(rot(0.87) * s * 2.30 + vec2(-t * 0.110, t * 0.050));
	float fine  = noise(rot(1.94) * s * 5.10 + vec2(t * 0.190, -t * 0.080));

	float h = swell * 0.52 + chop * 0.31 + fine * 0.17;
	h = clamp((h - 0.5) * 1.6 + 0.5, 0.0, 1.0);

	// POOL IT INTO FLAT WASHES. Paint does not ramp smoothly from one value to
	// the next, it settles into steps with edges where the pigment stops. The
	// tiny smoothstep keeps those edges soft rather than aliased.
	float q = floor(h * bands) / bands;
	float frac_h = fract(h * bands);
	q += smoothstep(0.42, 0.58, frac_h) / bands;

	// Three stops rather than two, because the painting's depth runs
	// dark -> mid -> pale before it ever reaches foam.
	vec3 col = mix(deep_color.rgb, mid_color.rgb, smoothstep(0.0, 0.55, q));
	col = mix(col, pale_color.rgb, smoothstep(0.5, 0.92, q));
	col = mix(col, crest_color.rgb, smoothstep(0.90, 1.0, q) * crest_strength);

	// PAPER TOOTH. High-frequency, low-amplitude, and anchored to the world so
	// it does not crawl when the camera moves. Barely visible on its own and
	// most of the reason the result reads as pigment on a surface.
	float paper = noise(world_pos.xz * 9.0) * 0.6 + noise(world_pos.xz * 31.0) * 0.4;
	col *= 1.0 + (paper - 0.5) * grain;

	ALBEDO = col;
}
