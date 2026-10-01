shader_type canvas_item;
render_mode blend_add, unshaded;
// A strip of a current (game/sea_flow.gd): its ripple texture scrolling down
// the lane at its own speed, tiled along the lane every tile_px.
uniform float speed_px = 60.0;
uniform float tile_px = 1500.0;
uniform float width_px = 300.0;
uniform vec4 tint : source_color = vec4(1.0);
uniform float alpha = 0.15;

void fragment() {
	// A Line2D in tile mode repeats the texture every `width` px along it;
	// stretch that to tile_px and run it with the current.
	float along = UV.x * width_px / tile_px - TIME * speed_px / tile_px;
	vec4 c = texture(TEXTURE, vec2(along, UV.y));
	float shimmer = 0.85 + 0.15 * sin(TIME * 1.3 + UV.x * 0.7);
	COLOR = vec4(tint.rgb * c.a * alpha * shimmer * COLOR.a, 1.0);
}
