shader_type canvas_item;
// THE SEA KEPT BEHIND A TALK WITH FINN (2026-10-16): not dimmed, only softly
// out of focus with a breath of warm light over it, so a word with him reads
// as the same sunny afternoon you were fishing in. Fades in with modulate.

uniform sampler2D screen : hint_screen_texture, filter_linear_mipmap;
uniform float lod = 2.6;
uniform vec4 tint : source_color = vec4(1.0, 0.94, 0.82, 0.12);

void fragment() {
	vec2 px = SCREEN_PIXEL_SIZE * 6.0;
	vec3 c = textureLod(screen, SCREEN_UV, lod).rgb * 0.4;
	c += textureLod(screen, SCREEN_UV + vec2(px.x, px.y), lod).rgb * 0.15;
	c += textureLod(screen, SCREEN_UV + vec2(-px.x, px.y), lod).rgb * 0.15;
	c += textureLod(screen, SCREEN_UV + vec2(px.x, -px.y), lod).rgb * 0.15;
	c += textureLod(screen, SCREEN_UV + vec2(-px.x, -px.y), lod).rgb * 0.15;
	COLOR = vec4(mix(c, tint.rgb, tint.a), COLOR.a);
}
