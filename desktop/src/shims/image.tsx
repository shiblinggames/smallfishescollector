// next/image, for the desktop shell: a plain <img>. The art ships with the game,
// so there is nothing to optimise over the network.

import type { CSSProperties, ImgHTMLAttributes } from 'react'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | { src: string }
  fill?: boolean
  priority?: boolean
  quality?: number
  placeholder?: string
  blurDataURL?: string
  unoptimized?: boolean
}

export default function Image({ src, fill, priority: _p, quality: _q, placeholder: _ph, blurDataURL: _b, unoptimized: _u, style, ...rest }: Props) {
  const s = typeof src === 'string' ? src : src.src
  const fillStyle: CSSProperties | null = fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%' } : null
  return <img src={s} style={{ ...fillStyle, ...style }} {...rest} />
}
