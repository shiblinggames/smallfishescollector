import { type ReactNode, type CSSProperties, type HTMLAttributes } from 'react'

// Shared iOS-material card surface. The look lives in `.app-card` (globals.css)
// so it stays themeable in one place; this is just an ergonomic wrapper.
//
//   <Card>…</Card>                      neutral frosted-glass panel
//   <Card gold>…</Card>                 warm premium/hero variant
//   <Card interactive onClick={…}>…</Card>  adds the .tap press feedback
//
// Reserve real art (fish, crew portraits, the rod emblem) for the CONTENTS of
// a card — the card itself is depth-from-light, never a painted background.
export default function Card({
  children,
  gold = false,
  interactive = false,
  className = '',
  style,
  ...rest
}: {
  children: ReactNode
  /** Warm gold border + glow for premium / hero panels. */
  gold?: boolean
  /** Adds .tap so the whole card depresses on touch (for tappable cards). */
  interactive?: boolean
  className?: string
  style?: CSSProperties
} & HTMLAttributes<HTMLDivElement>) {
  const classes = ['app-card']
  if (gold) classes.push('app-card-gold')
  if (interactive) classes.push('tap')
  if (className) classes.push(className)
  return (
    <div className={classes.join(' ')} style={style} {...rest}>
      {children}
    </div>
  )
}
