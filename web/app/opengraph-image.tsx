import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HOME, SOCIAL_CARD } from '@/lib/homeCopy'

/**
 * ── THE LINK PREVIEW ────────────────────────────────────────────────────────
 *
 * There was not one. Every share of seasthebooty.com anywhere that unfurls a
 * link (a Discord paste, an Instagram bio tap, a text to a friend, a tester
 * forwarding it on) rendered a bare grey card with a title and no picture, and
 * the description under it was from an economy the game has not had in months:
 * "Redeem your pack code and collect all 36 digital fish cards."
 *
 * That card is the most-seen page of any game site, because far more people see
 * the link than open it. It is the landing page's landing page.
 *
 * ── WHY IT IS GENERATED AND NOT PAINTED ─────────────────────────────────────
 *
 * The plate is the game's own night sea, cropped to the band with the moon and
 * the headlands in it, with the title set in the game's own faces. Generated at
 * BUILD time rather than per request, so it is a static PNG on the CDN and
 * costs a visitor nothing; nothing in here reads the request, which is what
 * keeps it static.
 *
 * Everything the card needs is bundled next to it: satori has no system fonts
 * and no network, so both faces and the plate are read off disk and inlined.
 * The budget is 500KB for the lot and this comes in around 140KB.
 */
export const alt = `${HOME.title}: ${HOME.tagline} ${SOCIAL_CARD.line}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  const dir = join(process.cwd(), 'assets')
  const [cinzel, karla, plate] = await Promise.all([
    readFile(join(dir, 'Cinzel.ttf')),
    readFile(join(dir, 'Karla.ttf')),
    readFile(join(dir, 'og-plate.jpg')),
  ])
  const bg = `data:image/jpeg;base64,${plate.toString('base64')}`

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', backgroundColor: '#050c16' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bg} alt="" width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0 }} />

        {/* The words live on the left, because the moon is on the right and a
            title laid over a moon is a title nobody can read. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            background:
              'linear-gradient(100deg, rgba(3,8,16,0.90) 0%, rgba(3,8,16,0.74) 38%, rgba(3,8,16,0.18) 66%, rgba(3,8,16,0.34) 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 78px',
          }}
        >
          <div
            style={{
              fontFamily: 'Karla',
              fontSize: 21,
              letterSpacing: 6,
              color: '#7ab8cc',
              marginBottom: 20,
            }}
          >
            {HOME.eyebrow.toUpperCase()}
          </div>
          <div style={{ fontFamily: 'Cinzel', fontSize: 104, lineHeight: 1, color: '#f4ecd8' }}>
            {HOME.title}
          </div>
          <div style={{ fontFamily: 'Cinzel', fontSize: 40, lineHeight: 1.2, color: '#f0c040', marginTop: 12 }}>
            {HOME.tagline}
          </div>
          {/* ── IT BREAKS AT SENTENCES, NOT WHEREVER THE BOX ENDS ──────────
              One line of prose set to a fixed width wraps where the width says,
              which put "explore." alone on a second line under "Just a cozy
              fishing game. And a whole sea to". A card is read in a feed in
              about a second and a widow like that is the whole impression.

              So each SENTENCE gets its own line. It reads as a deliberate break
              at any length, which matters because the line is edited by hand in
              lib/homeCopy.ts and nobody should have to count characters. */}
          {SOCIAL_CARD.line.split(/(?<=\.)\s+/).filter(Boolean).map((sentence, i) => (
            <div
              key={i}
              style={{
                fontFamily: 'Karla',
                fontSize: 28,
                lineHeight: 1.4,
                color: '#c3d6e2',
                marginTop: i === 0 ? 26 : 2,
                maxWidth: 700,
              }}
            >
              {sentence}
            </div>
          ))}
          <div style={{ fontFamily: 'Karla', fontSize: 22, color: '#89a2b5', marginTop: 10 }}>
            {SOCIAL_CARD.note}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Cinzel', data: cinzel as unknown as ArrayBuffer, weight: 900, style: 'normal' },
        { name: 'Karla', data: karla as unknown as ArrayBuffer, weight: 400, style: 'normal' },
      ],
    },
  )
}
