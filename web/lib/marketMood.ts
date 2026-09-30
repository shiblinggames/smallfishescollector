// ── Market mood ─────────────────────────────────────────────────────────────
// Pure, so the market screen (a client component) can import it. It lived in
// lib/fishMarket, whose server reads came along with it into the client.
//
// Lifted out of MarketClient so the Fishing hub's Market card can name the
// weather with the same words the market itself uses. Two screens, one
// vocabulary.
export const MOOD_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; desc: string }> = {
  calm:           { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.25)',  label: 'Calm Market',   desc: 'Flat water. Prices barely breathe.' },
  storm:          { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.25)',  label: 'Storm',         desc: 'The board jumps with the swell. Could break either way.' },
  kraken:         { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.25)',   label: 'Kraken',        desc: 'Something big is under the hull. Sell brave or sell nothing.' },
  tide_rising:    { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.25)',  label: 'Tide Rising',   desc: 'The tide lifts every price with it. Holding pays.' },
  bounty_season:  { color: '#f0c040', bg: 'rgba(240,192,64,0.1)',   border: 'rgba(240,192,64,0.25)',  label: 'Bounty Season', desc: 'Buyers flush with coin. Rare fish are climbing fast.' },
  low_tide:       { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.25)', label: 'Low Tide',      desc: 'Buyers are tight-fisted today. Hold if you can stomach it.' },
  cursed_waters:  { color: '#c084fc', bg: 'rgba(192,132,252,0.1)',  border: 'rgba(192,132,252,0.25)', label: 'Cursed Waters', desc: 'Bad water. Every price is sinking and picking up speed.' },
}
