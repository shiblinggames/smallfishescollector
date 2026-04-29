import Nav from '@/components/Nav'

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-14">
        <div style={{ maxWidth: 640, width: '100%', margin: '0 auto' }}>
          <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#4a6a8a', marginBottom: '0.5rem' }}>
            Shibling Games LLC
          </p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>
            Privacy Policy
          </h1>
          <p className="font-karla font-300" style={{ fontSize: '0.72rem', color: '#4a4845', marginBottom: '2.5rem' }}>
            Last updated: April 2026
          </p>

          <div className="font-karla font-300" style={{ fontSize: '0.85rem', color: '#a0a09a', lineHeight: 1.85, display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>What We Collect</h2>
              <p>When you create an account, we collect your email address. If you sign in with Google, we also receive your name and profile picture from Google. During gameplay, we store your progress, card collection, fishing stats, pack history, and in-game currency balances.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>How We Use It</h2>
              <p>We use your data solely to operate Small Fishes — to authenticate your account, save your progress, and display leaderboards and social features. We do not sell your data, use it for advertising, or share it with third parties except as described below.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Third-Party Services</h2>
              <p>We use <span className="text-[#f0ede8]">Supabase</span> to store account and gameplay data. Their servers are located in the United States. We use <span className="text-[#f0ede8]">Google OAuth</span> as an optional sign-in method, governed by Google&apos;s own privacy policy. We do not use third-party analytics or advertising platforms.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Data Retention</h2>
              <p>We retain your account data for as long as your account is active. If you wish to delete your account and all associated data, contact us at the email below and we will process your request within 30 days.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Children</h2>
              <p>Small Fishes is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with their information, please contact us and we will delete it.</p>
            </section>

            <section>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Contact</h2>
              <p>Questions about this policy? Email us at{' '}
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
