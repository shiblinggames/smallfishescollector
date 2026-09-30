// next/link, for the desktop shell: an anchor that moves the shell's router
// (./navigation) instead of loading a page. A modified click (a new window) or
// an outside link is left alone, and the shell opens those outside the game.

import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { useRouter } from './navigation'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string; query?: Record<string, string> }
  prefetch?: boolean | null
  replace?: boolean
  scroll?: boolean
}

function hrefOf(h: Props['href']): string {
  if (typeof h === 'string') return h
  const q = h.query ? `?${new URLSearchParams(h.query)}` : ''
  return `${h.pathname ?? ''}${q}`
}

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch: _p, replace, scroll: _s, onClick, ...rest }, ref) {
  const router = useRouter()
  const to = hrefOf(href)
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (rest.target && rest.target !== '_self') return
    if (/^[a-z]+:/i.test(to)) return
    e.preventDefault()
    if (replace) router.replace(to); else router.push(to)
  }
  return <a ref={ref} href={to} onClick={click} {...rest} />
})

export default Link
