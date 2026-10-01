shader_type canvas_item;
// A FISH UNDER THE SURFACE (game/sea_life.gd): drawn into the sea's
// under-water layer, which the water shader lays beneath its own surface. The
// body bends as it swims, the tail most, each fish on its own beat.
uniform float beat = 7.0;

void vertex() {
	float tail = 1.0 - UV.x;
	float ph = float(INSTANCE_ID) * 1.7;
	VERTEX.y += sin(TIME * beat + ph - UV.x * 4.0) * 0.10 * tail * tail;
}
