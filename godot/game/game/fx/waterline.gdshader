shader_type canvas_item;
// SITTING IN THE WATER, NOT ON IT (Godot over the web baseline; replaces the
// web's soak plate). Put on anything afloat: the hull, the bottle. Below a
// lapping waterline the picture bends with the water, takes the sea's colour
// and fades out by the keel, so the bottom is under the surface and not a
// painted edge resting on it. Just above it the wood is wet and dark; at it,
// a bright lip where the water climbs the side.
// cut is where the water meets this picture, depth how far below that the
// keel is, both as fractions of its height; aspect is its width / height.
uniform float cut = 0.9;
// The keel's slope: how much lower the waterline sits per picture-width to
// the right, as a share of the picture's height (a hull drawn with its stern
// riding higher than its bow; Skipper.keel_tilt measures it).
uniform float tilt = 0.0;
uniform float depth = 0.05;
uniform float aspect = 1.0;
uniform float phase = 0.0;
// This picture's height against the captain's sheet, so the lapping is the
// same size on every hull (a boat overlay is a far shorter picture).
uniform float ref = 1.0;
// How hard the water laps at it (a rock's long face is calmer than a hull's).
uniform float lap_amp = 1.0;
uniform vec4 sea : source_color = vec4(0.17, 0.34, 0.39, 1.0);
uniform vec4 foam : source_color = vec4(0.88, 0.94, 0.93, 1.0);

varying vec4 v_mod;

void vertex() {
	v_mod = COLOR;
}

void fragment() {
	float x = UV.x * aspect * ref;
	float lap = (sin(x * 34.0 + TIME * 2.0 + phase) * 0.6 + sin(x * 67.0 - TIME * 2.7 + phase * 1.7) * 0.4) * depth * 0.16 * lap_amp;
	float below = UV.y - (cut + tilt * (UV.x - 0.5) + lap);
	float sub = clamp(below / max(depth, 0.0001), 0.0, 1.0);
	vec2 uv = UV;
	// Under the surface the picture wavers sideways, more the deeper it is.
	uv.x += sin(UV.y * ref * 240.0 - TIME * 3.0 + phase) * 0.006 * sub / max(aspect * ref, 0.05);
	vec4 c = texture(TEXTURE, uv);
	// Wet just above the water.
	float wet = (1.0 - smoothstep(0.0, depth * 0.7, -below)) * step(below, 0.0);
	c.rgb *= 1.0 - wet * 0.2;
	if (below > 0.0) {
		c.rgb = mix(c.rgb, sea.rgb, 0.4 + 0.45 * sub);
		c.a *= mix(0.72, 0.0, smoothstep(0.0, 1.0, sub));
	}
	// The lip: where the water climbs the side, catching the light.
	float lip = exp(-pow(below / (depth * 0.14), 2.0));
	c.rgb = mix(c.rgb, foam.rgb, lip * 0.3);
	COLOR = c * v_mod;
}
