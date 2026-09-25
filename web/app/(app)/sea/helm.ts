// THE WHEEL'S DIMENSIONS, in a module that imports nothing.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// The helm and the cast button are the SAME control in two roles: you steer
// with the wheel, and when the rod comes out the wheel becomes the cast, in the
// same place at the same size so the thumb never moves. That only holds if both
// screens read one set of numbers.
//
// The obvious way to share them was to export them from SeaMap, which is where
// the helm is drawn. That shipped, and it broke the whole chart: SeaMap imports
// FishingHere, so FishingHere importing back from SeaMap is a CYCLE — and
// FishingHere does the arithmetic at module scope, which runs while SeaMap is
// still evaluating and its exports are in the temporal dead zone. The page died
// on load with "cannot access HELM_BOTTOM before initialization", and a build
// that typechecks and compiles cleanly says nothing about it: a cycle is only a
// problem at RUNTIME, and only when one side reads the other eagerly.
//
// So the numbers live here, in a leaf. Both sides import down into it and
// nothing imports back out.

/** The wheel's radius. */
export const HELM_R = 56

/** How far past the drawn ring the helm still takes a press. Invisible: the
 *  wheel looks the same size, and a thumb that lands a little wide of it no
 *  longer hits the sea and plots a course instead. */
export const HELM_CATCH = 28

/** The knob's diameter (was 42; Kong wanted it bigger with the ring unchanged).
 *  Its travel is the ring's radius less half of this, so it stays inside. */
export const HELM_KNOB = 54

/** Its diameter — the cast button matches it exactly. */
export const HELM_D = HELM_R * 2

/**
 * How far the wheel sits off the bottom of the chart.
 *
 * It was 92 to clear the row of action pills that used to live at 22; those are
 * gone and the wheel does their job now, so this is simply where the thumb
 * wants it. The fishing screen's action row is padded to land its cast button
 * on exactly this spot.
 */
export const HELM_BOTTOM = 92

/** How far a press must travel before it is a steer rather than a tap.
 *  Generous: a thumb resting on glass drifts a pixel or two, and that must not
 *  read as a course. */
export const HELM_DEADZONE = 14

/**
 * ── HOW FAR THE THUMB TRAVELS FOR FULL HELM ─────────────────────────────────
 *
 * The stick is measured from WHERE THE THUMB LANDED rather than from the
 * wheel's centre, so this is a distance of travel and not a place on the glass.
 * See the note on `stickVec` for why that distinction is the whole feel of it.
 *
 * 46px is about a comfortable thumb roll without moving the hand, and it is
 * deliberately smaller than the wheel's own 56px radius: full helm should be
 * reachable INSIDE the ring you can see, because past the edge is where the
 * thumb stops being sure where it is.
 */
export const HELM_STICK_R = 46

/**
 * THE SLOWEST THE HELM WILL DRIVE HER, as a share of full.
 *
 * Deflection used to mean nothing: any push at all ran the boat flat out, so
 * the stick had one speed and the only way to move gently was to tap the helm
 * over and over. Now a small push is a slow bell and the rim is full ahead.
 *
 * The floor is high because a stick that can be nudged to a crawl is a stick
 * you have to be careful with, and nobody wants to be careful with a helm. A
 * third of full is "easing alongside", not "barely moving".
 */
export const HELM_SLOW = 0.34

/** How long a still thumb rests before the rod goes in. Long enough that a slow
 *  tap is never mistaken for it, short enough to be a gesture and not a wait. */
export const HELM_HOLD_MS = 480
