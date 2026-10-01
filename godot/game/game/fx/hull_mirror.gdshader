shader_type canvas_item;
// A HULL'S REFLECTION, as one picture (Godot over the web baseline). The
// mirrored boat is drawn into a CanvasGroup first, so it fades as ONE image
// (the web's per-sprite alpha let the rod show through the hull), then here it
// is rippled with the water, pulled toward the sea's colour, and dissolved the
// further it is from the waterline. UV.y runs 0 at the waterline to 1 at the
// far end of the reflection.
uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform float strength = 0.36;
uniform float ripple = 0.0035;
uniform vec4 sea : source_color = vec4(0.10, 0.22, 0.27, 1.0);

void fragment() {
	float depth = clamp(UV.y, 0.0, 1.0);
	// Bands of ripple that run along the water, stronger further from the hull.
	float wave = sin(SCREEN_UV.y * 340.0 - TIME * 2.4) * 0.6 + sin(SCREEN_UV.y * 610.0 + TIME * 1.7) * 0.4;
	vec2 at = SCREEN_UV + vec2(wave * ripple * (0.35 + depth), 0.0);
	vec4 c = textureLod(screen_texture, at, 0.0);
	if (c.a > 0.0001) c.rgb /= c.a;
	c.rgb = mix(c.rgb, sea.rgb, 0.25 + 0.35 * depth);
	// Broken into streaks near its far end, the way a reflection breaks up.
	float streak = 0.75 + 0.25 * sin(SCREEN_UV.y * 900.0 + TIME * 3.1);
	float fade = (1.0 - smoothstep(0.15, 1.0, depth)) * mix(1.0, streak, depth);
	COLOR = vec4(c.rgb, c.a * strength * fade);
}
