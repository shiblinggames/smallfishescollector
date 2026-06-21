export interface HookDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  modelUrl?: string
  imageUrl?: string
  glow?: boolean
  // Per-keyframe aura defined in globals.css as hook-glow-<glowType>.
  // chrome / gilded are very subtle (silver / gold); arcane / cursed are
  // moderate (enchanted / abyssal); mythic is the legendary showpiece.
  // Falls back to the generic .rod-glow pulse if omitted but glow: true.
  glowType?: 'chrome' | 'gilded' | 'arcane' | 'cursed' | 'mythic'
  /** Fishing Level required to BUY this hook (on top of the strict tier-order
   *  ladder). Overrides the price bracket in gearGating; tune unlock pacing
   *  here, one hook at a time. */
  minLevel?: number
}

// Each tier adds 3° to the catch zone (handled in depths.ts CATCH_BONUS_PER_TIER)
export const HOOKS: HookDef[] = [
  { tier: 0, name: 'Copper Hook',    cost: 0,      minLevel: 1,  description: 'A simple copper hook. Reliable enough to land your first catch.', color: '#b87333', imageUrl: '/hook_copper.png' },
  { tier: 1, name: 'Bronze Hook',    cost: 1500,   minLevel: 6,  description: 'Forged bronze. A touch sturdier than copper.',              color: '#a07858', imageUrl: '/hook_bronze.png' },
  { tier: 2, name: 'Iron Hook',      cost: 3000,   minLevel: 11, description: 'Solid iron. A noticeably wider catch window.',               color: '#9ca3af', imageUrl: '/hook_iron.png' },
  { tier: 3, name: 'Steel Hook',     cost: 6000,   minLevel: 18, description: 'Tempered steel. Reliable in any depth.',                    color: '#60a5fa', imageUrl: '/hook_steel.png' },
  { tier: 4, name: 'Silver Hook',    cost: 12000,  minLevel: 26, description: 'Polished silver. Catches the light — and the fish.',         color: '#d4d4d8', imageUrl: '/hook_silver.png',    glow: true, glowType: 'chrome' },
  { tier: 5, name: 'Gold Hook',      cost: 22000,  minLevel: 34, description: "Polished gold. Fish can't resist the shine.",               color: '#f0c040', imageUrl: '/hook_gold.png',      glow: true, glowType: 'gilded' },
  { tier: 6, name: 'Enchanted Hook', cost: 40000,  minLevel: 44, description: 'Glows faintly. Something stirs in the deep.',              color: '#a78bfa', imageUrl: '/hook_enchanted.png', glow: true, glowType: 'arcane' },
  { tier: 7, name: 'Abyssal Hook',   cost: 70000,  minLevel: 56, description: 'Drawn from the dark. The catch window is remarkably wide.', color: '#38bdf8', imageUrl: '/hook_abyssal.png',   glow: true, glowType: 'cursed' },
  { tier: 8, name: 'Legendary Hook', cost: 150000, minLevel: 70, description: 'Said to have been lost at sea — and returned.',             color: '#ff6b35', imageUrl: '/hook_legendary.png', glow: true, glowType: 'mythic' },
]

export function getHook(tier: number): HookDef {
  return HOOKS[Math.min(Math.max(tier, 0), HOOKS.length - 1)]
}

// Resolve the CSS class for a hook's glow aura. Mirrors rodGlowClass —
// every place that renders a hook (game, shop, profiles, gear picker)
// pulls from this so a new glowType automatically lights up across the
// whole app.
export function hookGlowClass(hook: HookDef): string | undefined {
  if (!hook.glow) return undefined
  return hook.glowType ? `hook-glow-${hook.glowType}` : 'rod-glow'
}
