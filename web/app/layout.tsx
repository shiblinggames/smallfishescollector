import type { Metadata } from 'next'
import { Cinzel, Karla } from 'next/font/google'
import './globals.css'
import DailyBonus from '@/components/DailyBonus'

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
      <body className="min-h-full bg-[#000000] text-[#f0ede8] font-karla">
        <DailyBonus />
        {children}
        <footer className="pb-28 sm:pb-10 pt-6 text-center">
          <p className="font-karla font-300 text-[#3a3835]" style={{ fontSize: '0.65rem' }}>
            &copy; {new Date().getFullYear()} Shibling Games LLC
          </p>
        </footer>
      </body>
    </html>
  )
}
