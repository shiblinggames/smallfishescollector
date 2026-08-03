# The iOS shell — getting it onto a test iPhone

A Capacitor **remote-URL** wrapper around the live site. No export, no API layer,
no bundled JS. The reasoning lives in `capacitor.config.ts`; this is the runbook.

## What is already done

- `capacitor.config.ts` — the shell config, pointed at production.
- `lib/haptics.ts` — talks to the Taptic Engine through Capacitor's global
  bridge when it is running inside the shell, and falls back to
  `navigator.vibrate` on the web. **No package import**, so the website's bundle
  is untouched and nothing new is installed for a normal deploy.

That means the app already produces real haptics on iPhone the moment it runs in
the shell, with no other code change. Today those calls do nothing on iOS,
because iOS Safari has no Vibration API.

## What still needs a Mac

Xcode only runs on macOS. There is no way around this for a device build. If you
do not have one: a cloud Mac (MacStadium, MacinCloud) or a cloud CI that builds
iOS (Codemagic, Ionic Appflow) both work, since the project below is ordinary.

## Steps

**1. Install the tooling** (Windows is fine for this part)

```bash
cd web
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/ios @capacitor/haptics @capacitor/splash-screen
```

`@capacitor/haptics` is installed for the NATIVE side to register the plugin.
Nothing in the web code imports it — `lib/haptics` reaches it through the
runtime bridge on purpose.

**2. Generate the Xcode project**

```bash
npx cap add ios
```

This only copies a template, so it runs on Windows. Note the repo already has a
top-level `ios/` folder holding the Tide Run native port brief — this one is
`web/ios/` and they do not collide.

**3. On the Mac**

```bash
npx cap sync ios
npx cap open ios
```

In Xcode: select your iPhone, set **Signing & Capabilities → Team** to your
Apple ID (a free account is enough), then Run.

A free account gives a build that expires after **7 days**, which is plenty to
answer the question. TestFlight needs the Apple Developer Program at $99/year —
do not pay it until the device build feels right.

## What to test, in order

The shell renders in WKWebView, which is the same engine as Safari, so it will
LOOK identical to the PWA. You are testing feel, not appearance.

1. **The fishing needle.** Twenty casts. The lock-in is a hand-tuned predictive
   freeze (see the needle protocol in the memory notes) and is the single most
   input-latency-sensitive thing in the game.
2. **The raid aim bar.** One full raid. Same reason: raw WYSIWYG judgment with
   no rewind, so any added latency is felt as unfairness rather than lag.
3. **Haptics everywhere.** They should be present for the first time on iOS.
   Tap, commit and reward should feel like three different things.
4. **Safe areas.** Notch and home indicator, with `contentInset: 'never'` set,
   so the web app's own padding is the only padding.
5. **A cheap Android device**, eventually. iOS webviews are uniformly good; a
   low-end Android running the gradient-heavy screens is the real worst case.

## Known things to watch

- **Guideline 4.2.** Apple rejects plain website wrappers. Native haptics plus
  IAP is the standard answer, and is why the haptics swap is step one rather
  than a nicety.
- **Deep links / redirects.** The site redirects apex to www; the config points
  at www so cold start does not pay a redirect.
- **Auth.** Supabase sessions live in the webview's storage. Logging in inside
  the shell is a separate session from mobile Safari, which is expected but
  will surprise you the first time.
