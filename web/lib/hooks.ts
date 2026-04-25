export interface HookDef {
  tier: number
  name: string
  cost: number
  description: string
  luckLabel: string
  luckScore: number  // 0–6, used to render the luck bar
  deepChance: number // combined deep + abyss %, shown to casual users
  color: string      // hex color for border/icon theming
  multiplier: number // doubloon multiplier for fishing game earnings
  weights: { shallows: number; openWaters: number; deep: number; abyss: number }
  modelUrl?: string
}

export const HOOKS: HookDef[] = [
  {
    tier: 0, name: 'Rusty Hook', cost: 0,
    description: 'A worn hook from the bottom of the tackle box.',
    luckLabel: 'Standard', luckScore: 0, deepChance: 15, color: '#a07858', multiplier: 0.10,
    weights: { shallows: 0.520, openWaters: 0.330, deep: 0.148, abyss: 0.002 }, modelUrl: '/models/hooks/rusty-hook.glb',
  },
  {
    tier: 1, name: 'Bent Hook', cost: 150,
    description: 'Slightly bent, but it still catches fish.',
    luckLabel: 'Slight', luckScore: 1, deepChance: 17, color: '#9ca3af', multiplier: 0.15,
    weights: { shallows: 0.500, openWaters: 0.327, deep: 0.170, abyss: 0.003 }, modelUrl: '/models/hooks/bent-hook.glb',
  },
  {
    tier: 2, name: 'Iron Hook', cost: 400,
    description: 'Solid iron. Reaches a bit deeper.',
    luckLabel: 'Low', luckScore: 2, deepChance: 20, color: '#60a5fa', multiplier: 0.20,
    weights: { shallows: 0.480, openWaters: 0.324, deep: 0.192, abyss: 0.004 }, modelUrl: '/models/hooks/iron-hook.glb',
  },
  {
    tier: 3, name: 'Steel Hook', cost: 1000,
    description: 'Tempered steel. The deep waters are within reach.',
    luckLabel: 'Moderate', luckScore: 3, deepChance: 22, color: '#4ade80', multiplier: 0.27,
    weights: { shallows: 0.460, openWaters: 0.320, deep: 0.215, abyss: 0.005 }, modelUrl: '/models/hooks/steel-hook.glb',
  },
  {
    tier: 4, name: 'Gold Hook', cost: 2500,
    description: "Polished gold. Fish can't resist the shine.",
    luckLabel: 'Good', luckScore: 4, deepChance: 24, color: '#f0c040', multiplier: 0.36,
    weights: { shallows: 0.440, openWaters: 0.318, deep: 0.235, abyss: 0.007 }, modelUrl: '/models/hooks/gold-hook.glb',
  },
  {
    tier: 5, name: 'Enchanted Hook', cost: 6000,
    description: 'Glows faintly. Something stirs in the deep.',
    luckLabel: 'High', luckScore: 5, deepChance: 28, color: '#a78bfa', multiplier: 0.47,
    weights: { shallows: 0.410, openWaters: 0.312, deep: 0.269, abyss: 0.009 }, modelUrl: '/models/hooks/enchanted-hook.glb',
  },
  {
    tier: 6, name: 'Legendary Hook', cost: 18000,
    description: 'Said to have been lost at sea — and returned.',
    luckLabel: 'Maximum', luckScore: 6, deepChance: 31, color: '#ff6b35', multiplier: 0.62,
    weights: { shallows: 0.380, openWaters: 0.310, deep: 0.300, abyss: 0.010 }, modelUrl: '/models/hooks/legendary-hook.glb',
  },
]

export function getHook(tier: number): HookDef {
  return HOOKS[Math.min(Math.max(tier, 0), HOOKS.length - 1)]
}
