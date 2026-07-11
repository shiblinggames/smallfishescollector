// ── Game icons ───────────────────────────────────────────────────────────────
// Small stroke-SVG icon components used wherever the UI needs a glyph. The
// project has a hard "no emoji as UI icons" rule (emoji take pictographic
// presentation on iOS and clash with the drawn art style), so these replace
// every emoji that used to serve as chrome. Color inherits from the parent
// via currentColor; size defaults to 14px to match inline text glyphs.

import React from 'react'

type IconProps = { size?: number }

function Svg({ size = 14, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: '-0.12em' }}
    >
      {children}
    </svg>
  )
}

export function IconLock({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  )
}

export function IconSkull({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 3a8 8 0 0 0-8 8c0 3 1.6 5.4 4 6.8V21h8v-3.2c2.4-1.4 4-3.8 4-6.8a8 8 0 0 0-8-8z" />
      <circle cx="9" cy="11" r="0.6" fill="currentColor" />
      <circle cx="15" cy="11" r="0.6" fill="currentColor" />
      <path d="M10 21v-2.5M14 21v-2.5" />
    </Svg>
  )
}

export function IconWarning({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.2" r="0.6" fill="currentColor" />
    </Svg>
  )
}

export function IconCheck({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M4.5 12.5 10 18 19.5 6.5" />
    </Svg>
  )
}

export function IconMap({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" />
      <path d="M9 4v13M15 6.5v13" />
    </Svg>
  )
}

export function IconSwords({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M4 4l12.5 12.5M20 20l-2-2M14.5 17.5l3 3M18 4 5.5 16.5M4 20l2-2M9.5 17.5l-3 3" />
    </Svg>
  )
}

export function IconBolt({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M13 2.5 5 13.5h5.5L11 21.5l8-11h-5.5L13 2.5z" />
    </Svg>
  )
}

export function IconWave({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M2.5 9.5c2.4-2.6 4.4-2.6 6.8 0s4.4 2.6 6.8 0 3.4-2 5.4-.4" />
      <path d="M2.5 15.5c2.4-2.6 4.4-2.6 6.8 0s4.4 2.6 6.8 0 3.4-2 5.4-.4" />
    </Svg>
  )
}

export function IconGull({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M2.5 12.5c3.2-3.4 6.4-3.6 9.5-.5 3.1-3.1 6.3-2.9 9.5.5" />
    </Svg>
  )
}

export function IconShield({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    </Svg>
  )
}

export function IconAnchor({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="5" r="2.2" />
      <path d="M12 7.2V20M8 10.5h8M4.5 14c.6 4 3.6 6 7.5 6s6.9-2 7.5-6" />
    </Svg>
  )
}

export function IconFlame({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 2.5c4 4 6 7 6 10.3A6 6 0 0 1 6 12.8C6 9.5 8 6.5 12 2.5z" />
      <path d="M12 11.5c1.6 1.7 1.6 3.4 0 5.1-1.6-1.7-1.6-3.4 0-5.1z" />
    </Svg>
  )
}

export function IconStar({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7L12 3z" />
    </Svg>
  )
}

export function IconTrophy({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H3.5c0 3 1.5 5 3.5 5M17 6h3.5c0 3-1.5 5-3.5 5" />
      <path d="M12 15v3M8.5 20.5h7" />
    </Svg>
  )
}

export function IconBurst({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8" />
    </Svg>
  )
}

export function IconFog({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M3.5 8c2-1.6 3.8-1.6 5.8 0s3.8 1.6 5.8 0" />
      <path d="M6 13c2-1.6 3.8-1.6 5.8 0s3.8 1.6 5.8 0" />
      <path d="M3.5 18c2-1.6 3.8-1.6 5.8 0s3.8 1.6 5.8 0" />
    </Svg>
  )
}

export function IconCrate({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M4.5 4.5l15 15M19.5 4.5l-15 15" />
    </Svg>
  )
}

export function IconHourglass({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M6.5 3h11M6.5 21h11" />
      <path d="M7.5 3c0 4.2 3.4 5.6 4.5 7 1.1-1.4 4.5-2.8 4.5-7M7.5 21c0-4.2 3.4-5.6 4.5-7 1.1 1.4 4.5 2.8 4.5 7" />
    </Svg>
  )
}
