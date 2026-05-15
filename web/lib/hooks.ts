export interface HookDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  modelUrl?: string
  imageUrl?: string
  glow?: boolean
}

// Each tier adds 3° to the catch zone (handled in depths.ts CATCH_BONUS_PER_TIER)
export const HOOKS: HookDef[] = [
  { tier: 0, name: 'Copper Hook',    cost: 0,      description: 'A simple copper hook. Reliable enough to land your first catch.', color: '#b87333', imageUrl: '/hook_copper.png' },
  { tier: 1, name: 'Bronze Hook',    cost: 1500,   description: 'Forged bronze. A touch sturdier than copper.',              color: '#a07858', imageUrl: '/hook_bronze.png' },
  { tier: 2, name: 'Iron Hook',      cost: 3000,   description: 'Solid iron. A noticeably wider catch window.',               color: '#9ca3af', imageUrl: '/hook_iron.png' },
  { tier: 3, name: 'Steel Hook',     cost: 6000,   description: 'Tempered steel. Reliable in any depth.',                    color: '#60a5fa', imageUrl: '/hook_steel.png' },
  { tier: 4, name: 'Silver Hook',    cost: 12000,  description: 'Polished silver. Catches the light — and the fish.',         color: '#d4d4d8', imageUrl: '/hook_silver.png' },
  { tier: 5, name: 'Gold Hook',      cost: 22000,  description: "Polished gold. Fish can't resist the shine.",               color: '#f0c040', imageUrl: '/hook_gold.png' },
  { tier: 6, name: 'Enchanted Hook', cost: 40000,  description: 'Glows faintly. Something stirs in the deep.',              color: '#a78bfa', imageUrl: '/hook_enchanted.png' },
  { tier: 7, name: 'Abyssal Hook',   cost: 70000,  description: 'Drawn from the dark. The catch window is remarkably wide.', color: '#38bdf8', imageUrl: '/hook_abyssal.png' },
  { tier: 8, name: 'Legendary Hook', cost: 150000, description: 'Said to have been lost at sea — and returned.',             color: '#ff6b35', imageUrl: '/hook_legendary.png', glow: true },
]

export function getHook(tier: number): HookDef {
  return HOOKS[Math.min(Math.max(tier, 0), HOOKS.length - 1)]
}
