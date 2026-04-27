export interface HookDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  modelUrl?: string
}

// Each tier adds 3° to the catch zone (handled in depths.ts CATCH_BONUS_PER_TIER)
export const HOOKS: HookDef[] = [
  { tier: 0, name: 'Rusty Hook',     cost: 0,      description: 'A worn hook from the bottom of the tackle box.',         color: '#a07858', modelUrl: '/models/hooks/rusty-hook.glb' },
  { tier: 1, name: 'Bent Hook',      cost: 1500,   description: 'Slightly bent, but it still catches fish.',               color: '#9ca3af', modelUrl: '/models/hooks/bent-hook.glb' },
  { tier: 2, name: 'Iron Hook',      cost: 3000,   description: 'Solid iron. A noticeably wider catch window.',            color: '#60a5fa', modelUrl: '/models/hooks/iron-hook.glb' },
  { tier: 3, name: 'Steel Hook',     cost: 6000,   description: 'Tempered steel. Reliable in any depth.',                  color: '#4ade80', modelUrl: '/models/hooks/steel-hook.glb' },
  { tier: 4, name: 'Barbed Hook',    cost: 12000,  description: 'Once it bites, it holds. Wider strike window.',           color: '#fb923c', modelUrl: undefined },
  { tier: 5, name: 'Gold Hook',      cost: 22000,  description: "Polished gold. Fish can't resist the shine.",             color: '#f0c040', modelUrl: '/models/hooks/gold-hook.glb' },
  { tier: 6, name: 'Enchanted Hook', cost: 40000,  description: 'Glows faintly. Something stirs in the deep.',            color: '#a78bfa', modelUrl: '/models/hooks/enchanted-hook.glb' },
  { tier: 7, name: 'Abyssal Hook',   cost: 70000,  description: 'Drawn from the dark. The catch window is remarkably wide.', color: '#38bdf8', modelUrl: undefined },
  { tier: 8, name: 'Legendary Hook', cost: 150000, description: 'Said to have been lost at sea — and returned.',          color: '#ff6b35', modelUrl: '/models/hooks/legendary-hook.glb' },
]

export function getHook(tier: number): HookDef {
  return HOOKS[Math.min(Math.max(tier, 0), HOOKS.length - 1)]
}
