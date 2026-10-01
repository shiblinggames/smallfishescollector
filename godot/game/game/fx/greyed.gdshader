shader_type canvas_item;
// NOT COLLECTED YET (the Locker's crate drop tables): the picture in grey
// pencil on the paper, faint, so you can see what it is and that you lack it.
// (In a fragment, COLOR already carries the texture's colour, so the tint is
// taken from the vertex instead, or the colour would come straight back.)
uniform float strength = 0.45;

varying vec4 v_mod;

void vertex() {
	v_mod = COLOR;
}

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	float g = dot(c.rgb, vec3(0.3, 0.59, 0.11));
	COLOR = vec4(vec3(g * 0.55 + 0.22) * vec3(0.95, 0.9, 0.82), c.a * strength * v_mod.a);
}
