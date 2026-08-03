/** THE CREW PLATE.
 *
 *  The quiet dark timber every crew surface sits on. It started as a private
 *  const in CrewClient, which was fine while the roster card was the only thing
 *  wearing it — but the assign board now has to match the roster exactly, and
 *  "match exactly" written as a second copy of a hex pair is a drift waiting to
 *  happen. One value, imported.
 *
 *  History: the crew pages were originally a warm parchment, then flattened to
 *  neutral charcoal so the coloured elements could pop. The charcoal read as an
 *  app dashboard, so this is the 2026-07 warmth pass: same calm-backdrop
 *  property (coloured chips still pop, far more muted than the badges page),
 *  but the temperature is the ship's rather than a settings screen's.
 */
export const CREW_PANEL_BG = 'linear-gradient(157deg, #201a10 0%, #100c07 100%)'
export const CREW_PANEL_BORDER = '#3a3122'
