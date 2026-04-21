import type { Metadata } from 'next'
import { Cinzel, Karla } from 'next/font/google'
import './globals.css'

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-cinzel',
})

const karla = Karla({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-karla',
})

export const metadata: Metadata = {
  title: 'Small Fishes: Seas the Booty — Digital Collectibles',
  description: 'Redeem your pack code and collect all 36 digital fish cards.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${cinzel.variable} ${karla.variable}`}>
      <body className="min-h-full bg-[#000000] text-[#f0ede8] font-karla">{children}</body>
    </html>
  )
}
