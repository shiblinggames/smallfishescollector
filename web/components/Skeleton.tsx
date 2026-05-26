// Tiny shimmer-block primitive for loading skeletons. Pulses opacity via
// Tailwind's animate-pulse over a neutral fill that reads on the app's dark
// palette. Use it in route-level `loading.tsx` files so tab clicks paint
// instantly while the real page streams in. Keep skeletons cheap — match the
// page's general shape, don't try to mimic exact content.

import type { CSSProperties } from 'react'

interface SkeletonBoxProps {
  width?: number | string
  height?: number | string
  radius?: number | string
  className?: string
  style?: CSSProperties
}

export function SkeletonBox({ width = '100%', height = 14, radius = 8, className = '', style }: SkeletonBoxProps) {
  return (
    <div
      aria-hidden
      className={`animate-pulse ${className}`}
      style={{
        width, height, borderRadius: radius,
        background: 'rgba(255,255,255,0.06)',
        ...style,
      }}
    />
  )
}

// A standard centered page skeleton wrapper that matches the app's mobile-first
// max-w-md scaffold + padding. Compose SkeletonBoxes inside.
export function PageSkeletonShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md" style={{ padding: '1.25rem 1rem 5rem' }}>
      {children}
    </div>
  )
}
