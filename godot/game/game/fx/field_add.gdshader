shader_type canvas_item;
render_mode blend_add;
// Height into the sea's disturbance: what it is drawn with, turned up.
uniform float gain = 1.0;

void fragment() {
	vec4 c = texture(TEXTURE, UV) * COLOR;
	COLOR = vec4(vec3(c.a * gain), 1.0);
}
