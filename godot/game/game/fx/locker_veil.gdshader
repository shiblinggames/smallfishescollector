shader_type canvas_item;
// THE LOCKER'S VEIL (game/locker.gd): the sea dims and cools away from her,
// a soft clearing round the boat so she is lit like a figure on a stage,
// and a little more toward the paper on the right so the sheet sits on
// shadow. Alpha darkening only (a multiply would grey into boxes under the
// night tint).
uniform vec2 u_focus = vec2(500.0, 450.0);
uniform vec2 u_res = vec2(1600.0, 900.0);

void fragment() {
	vec2 px = UV * u_res;
	vec2 d = (px - u_focus) / vec2(1.25, 1.0);
	float r = length(d) / (u_res.y * 0.5);
	float shade = smoothstep(0.42, 1.25, r) * 0.62;
	shade = max(shade, smoothstep(0.45, 0.85, UV.x) * 0.38);
	COLOR = vec4(0.02, 0.05, 0.08, shade);
}
