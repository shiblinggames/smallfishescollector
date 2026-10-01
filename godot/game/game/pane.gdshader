// A PANE: one shader that paints what the web's panels are made of in CSS
// (Godot port, the style kit). Drawn by Pane over a rect grown by the shadow,
// in pixels of the pane, so every measure below is in pixels:
//   a rounded rect (radius);
//   its fill, a linear gradient of up to four stops at a CSS angle
//     (180 = top to bottom, 90 = left to right);
//   a radial wash over the fill (glow: colour, centre and radii as fractions);
//   a sheen down from the top (white, fading out over the top fifth);
//   an inner glow from the edge (inset);
//   a border, and a separate top edge (the tiles' accent line);
//   a soft outer shadow, offset.
// The result is multiplied by the draw colour, so modulate still fades it.
shader_type canvas_item;
render_mode unshaded;

uniform vec2 rect_size = vec2(100.0, 100.0);
uniform float radius = 14.0;

uniform float angle = 180.0;
uniform int stops = 1;
uniform vec4 c0 : source_color = vec4(0.05, 0.07, 0.09, 1.0);
uniform vec4 c1 : source_color = vec4(0.0);
uniform vec4 c2 : source_color = vec4(0.0);
uniform vec4 c3 : source_color = vec4(0.0);
uniform float p0 = 0.0;
uniform float p1 = 1.0;
uniform float p2 = 1.0;
uniform float p3 = 1.0;

uniform vec4 glow : source_color = vec4(0.0);
uniform vec2 glow_at = vec2(0.5, 0.0);
uniform vec2 glow_r = vec2(0.6, 0.6);

uniform float sheen = 0.0;
uniform vec4 inset : source_color = vec4(0.0);
uniform float inset_blur = 0.0;

uniform float border = 0.0;
uniform vec4 border_color : source_color = vec4(0.0);
uniform float top_border = 0.0;
uniform vec4 top_color : source_color = vec4(0.0);

// Paper (1) or wood grain (0.6): grain, fibres, a torn edge, a tea stain.
uniform float paper = 0.0;

uniform vec4 shadow : source_color = vec4(0.0);
uniform float shadow_blur = 0.0;
uniform vec2 shadow_offset = vec2(0.0);

varying vec2 local;

void vertex() {
	local = VERTEX;
}

float phash(vec2 p) {
	vec3 q = fract(vec3(p.xyx) * 0.1031);
	q += dot(q, q.yzx + 33.33);
	return fract((q.x + q.y) * q.z);
}

float pnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(phash(i), phash(i + vec2(1.0, 0.0)), u.x), mix(phash(i + vec2(0.0, 1.0)), phash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// src over dst, straight alpha.
vec4 over(vec4 dst, vec4 src) {
	float a = src.a + dst.a * (1.0 - src.a);
	if (a <= 0.0) {
		return vec4(0.0);
	}
	return vec4((src.rgb * src.a + dst.rgb * dst.a * (1.0 - src.a)) / a, a);
}

vec4 ramp(float t) {
	if (stops <= 1 || t <= p0) {
		return c0;
	}
	if (t <= p1 || stops == 2) {
		return mix(c0, c1, clamp((t - p0) / max(0.0001, p1 - p0), 0.0, 1.0));
	}
	if (t <= p2 || stops == 3) {
		return mix(c1, c2, clamp((t - p1) / max(0.0001, p2 - p1), 0.0, 1.0));
	}
	return mix(c2, c3, clamp((t - p2) / max(0.0001, p3 - p2), 0.0, 1.0));
}

void fragment() {
	vec2 half_size = rect_size * 0.5;
	vec2 c = local - half_size;
	float r = min(radius, min(half_size.x, half_size.y));
	float d = box(c, half_size, r);
	if (paper > 0.9) {
		// A torn edge: the outline wanders a pixel or two, in and out.
		d += (pnoise(local * 0.11) - 0.5) * 2.6 + (pnoise(local * 0.5) - 0.5) * 0.9;
	}
	vec4 col = vec4(0.0);
	if (shadow.a > 0.0) {
		float ds = box(c - shadow_offset, half_size, r);
		float k = 1.0 - smoothstep(-shadow_blur * 0.35, shadow_blur, ds);
		col = vec4(shadow.rgb, shadow.a * k * k);
	}
	float inside = 1.0 - smoothstep(-0.6, 0.6, d);
	if (inside > 0.0) {
		float a = radians(angle);
		vec2 dir = vec2(sin(a), -cos(a));
		float len = abs(rect_size.x * sin(a)) + abs(rect_size.y * cos(a));
		vec4 fill = ramp(clamp(dot(c, dir) / max(1.0, len) + 0.5, 0.0, 1.0));
		if (glow.a > 0.0) {
			vec2 g = (local / rect_size - glow_at) / glow_r;
			fill = over(fill, vec4(glow.rgb, glow.a * (1.0 - smoothstep(0.0, 1.0, length(g)))));
		}
		if (paper > 0.9) {
			float grain = phash(floor(local * 0.9)) * 0.5 + pnoise(local * 0.12) * 0.5;
			float mottle = pnoise(local * 0.012);
			fill.rgb *= (0.95 + grain * 0.07) * (0.98 + mottle * 0.04);
			float stain = 1.0 - smoothstep(0.0, 18.0 + pnoise(local * 0.03) * 16.0, -d);
			fill.rgb = mix(fill.rgb, fill.rgb * vec3(0.84, 0.75, 0.62), stain * 0.45);
		} else if (paper > 0.5) {
			// Wood: long grain along the plank.
			float g = pnoise(vec2(local.x * 0.02, local.y * 0.5)) * 0.6 + pnoise(vec2(local.x * 0.06, local.y * 1.4)) * 0.4;
			fill.rgb *= 0.88 + g * 0.2;
		}
		if (sheen > 0.0) {
			fill = over(fill, vec4(1.0, 1.0, 1.0, sheen * (1.0 - smoothstep(0.0, 0.2, local.y / rect_size.y))));
		}
		if (inset.a > 0.0) {
			fill = over(fill, vec4(inset.rgb, inset.a * (1.0 - smoothstep(0.0, max(1.0, inset_blur), -d))));
		}
		if (border > 0.0) {
			fill = over(fill, vec4(border_color.rgb, border_color.a * (1.0 - smoothstep(border - 0.6, border + 0.6, -d))));
		}
		if (top_border > 0.0) {
			fill = over(fill, vec4(top_color.rgb, top_color.a * (1.0 - smoothstep(top_border - 0.6, top_border + 0.6, local.y))));
		}
		col = over(col, vec4(fill.rgb, fill.a * inside));
	}
	COLOR = col * COLOR;
}
