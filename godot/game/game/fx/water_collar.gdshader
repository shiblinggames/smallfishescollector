shader_type canvas_item;
// THE WATER SHE PUSHES ASIDE (Godot over the web baseline): drawn behind a
// floating thing, from its own shape. Measured along the row just above the
// waterline, the thing's width is spread into a flattened ring at the water:
// a narrow pale lip heaped against it, and a wider darker trough where the
// water is pushed down and away. It breathes with the swell. Seen through the
// faded part under the waterline (fx/waterline.gdshader) and past its ends.
// cut, depth and aspect as fx/waterline.gdshader. The sprite's region is
// grown past the picture (Skipper.collar_of) so the ring is not cut off at
// the picture's edge. Drawn as ellipses from the measured span, so it is
// smooth (sampling the picture along the row stepped into bars).
uniform float cut = 0.9;
uniform float depth = 0.05;
uniform float aspect = 1.0;
uniform float phase = 0.0;
uniform float ref = 1.0;
uniform float strength = 1.0;
// Where the thing is at the water, left and right, as fractions of its width
// (measured once on the CPU: Skipper.collar_of).
uniform vec2 span = vec2(0.2, 0.8);
uniform vec4 foam : source_color = vec4(0.9, 0.95, 0.94, 1.0);
uniform vec4 trough : source_color = vec4(0.03, 0.12, 0.16, 1.0);

varying vec4 v_mod;

void vertex() {
	v_mod = COLOR;
}

void fragment() {
	float breathe = sin(TIME * 1.6 + phase) * 0.5 + 0.5;
	float hw = max(span.y - span.x, 0.001) * 0.5;
	float cx = (span.x + span.y) * 0.5;
	float dy = (UV.y - cut) / depth;
	// The lip: a thin lens heaped against her at the water, thickest
	// amidships, running a little past bow and stern, thinner below.
	float ex = (UV.x - cx) / (hw * (1.04 + 0.03 * breathe) + depth * 0.4 / max(aspect, 0.05));
	float body = sqrt(max(1.0 - ex * ex, 0.0));
	float lh = (dy > 0.0 ? 0.35 : 0.6) * (0.3 + 0.7 * body);
	float lip = body * exp(-pow(dy / max(lh, 0.001), 2.0));
	// The trough: a wider, deeper lens of water pushed down and out.
	float ex2 = (UV.x - cx) / (hw * 1.16 + depth * 1.2 / max(aspect, 0.05));
	float body2 = sqrt(max(1.0 - ex2 * ex2, 0.0));
	float sh = 0.5 + 1.5 * body2;
	float sink = smoothstep(0.0, 0.5, body2) * exp(-pow((dy - 0.4 * sh) / sh, 2.0));
	// Not over the thing itself above the water (it hides it there anyway).
	float own = texture(TEXTURE, clamp(UV, vec2(0.0), vec2(1.0))).a * step(UV.y, cut) * step(0.0, UV.x) * step(UV.x, 1.0) * step(0.0, UV.y);
	float ripple = 0.8 + 0.2 * sin(UV.x * aspect * ref * 26.0 - TIME * 2.2 + phase);
	float a_lip = lip * ripple * (0.2 + 0.07 * breathe);
	float a_sink = max(sink - lip, 0.0) * 0.28;
	float a = (a_lip + a_sink) * (1.0 - own) * strength;
	vec3 col = mix(trough.rgb, foam.rgb, a_lip / max(a_lip + a_sink, 0.0001));
	COLOR = vec4(col, a) * v_mod;
}
