// WHICH BUILD THIS IS (Steam prep, 2026-09-30).
//
// The desktop (Steam) build defines NEXT_PUBLIC_PLATFORM as 'desktop' in its
// Vite config; Next never sets it, so on the web this is always false and the
// code it guards is exactly what it was.
//
// Use it only for what the Steam build decisively does not have (see
// docs/systems/steam-port.md, "Working it through"), such as the leaderboards,
// which do not exist there at all. Game rules never branch on it: the rules are
// the same on both builds.

export const IS_DESKTOP = process.env.NEXT_PUBLIC_PLATFORM === 'desktop'
