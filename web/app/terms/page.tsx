import Nav from '@/components/Nav'

export default function TermsPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-14">
        <div style={{ maxWidth: 640, width: '100%', margin: '0 auto' }}>
          <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#4a6a8a', marginBottom: '0.5rem' }}>
            Shibling Games LLC
          </p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>
            Terms of Service
          </h1>
          <p className="font-karla font-300" style={{ fontSize: '0.72rem', color: '#4a4845', marginBottom: '2.5rem' }}>
            Last updated: April 2026
          </p>

          <div className="font-karla font-300" style={{ fontSize: '0.85rem', color: '#a0a09a', lineHeight: 1.85, display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Acceptance</h2>
              <p>By creating an account or using Small Fishes (&quot;the Game&quot;), you agree to these Terms of Service. If you do not agree, do not use the Game. These terms apply to all users of seasthebooty.com and any associated services operated by Shibling Games LLC.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Your Account</h2>
              <p>You are responsible for maintaining the security of your account. You must provide a valid email address. You may not share your account or create accounts on behalf of others. We reserve the right to suspend or terminate accounts that violate these terms.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Virtual Items</h2>
              <p>Gems, doubloons, packs, cards, and all other in-game items are virtual goods with no real-world monetary value. They cannot be transferred, sold, or exchanged for real money. All purchases of in-game currency or packs are final and non-refundable. We may modify, reset, or discontinue virtual items at any time.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Prohibited Conduct</h2>
              <p>You agree not to: exploit bugs or glitches to gain unfair advantages; use automated scripts, bots, or cheating software; attempt to access other users&apos; accounts; reverse-engineer or scrape the Game; or engage in any conduct that disrupts or harms other players or the service.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Intellectual Property</h2>
              <p>All content in the Game — including artwork, card designs, names, and code — is owned by Shibling Games LLC. You may not reproduce, distribute, or create derivative works without our written permission.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Disclaimers</h2>
              <p>The Game is provided &quot;as is&quot; without warranties of any kind. We do not guarantee uninterrupted access or that the service will be error-free. We are not liable for any loss of virtual items, progress, or data due to technical issues.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Changes</h2>
              <p>We may update these terms at any time. Continued use of the Game after changes constitutes acceptance of the new terms. We will note the last updated date at the top of this page.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Contact</h2>
              <p>Questions? Email us at{' '}
                <a href="mailto:hello@shiblinggames.com" className="text-[#f0c040] hover:text-[#ffd966] transition-colors">
                  hello@shiblinggames.com
                </a>.
              </p>
            </section>

          </div>
        </div>
      </main>
    </>
  )
}
