# Setup Guide

## 1. Supabase project

1. Create a project at supabase.com
2. In the SQL editor, run `supabase/schema.sql` then `supabase/seed.sql`
3. Go to **Storage → New bucket**, create `card-arts`, set to **Public**
4. Upload all 36 PNGs from `../fish_card_assets/fish_arts/` into the bucket

## 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both values are in Supabase → Settings → API.

## 3. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## 4. Deploy to Vercel

1. Push to GitHub
2. Import in Vercel, add the two env vars
3. Deploy

## Test codes

`FISH-DEMO1` through `FISH-DEMO5` — each grants 1 pack.

## Upload script (optional)

To upload card art via the Supabase CLI or a script instead of the dashboard UI, use:

```bash
# From fish_card_assets/fish_arts/
for f in *.png; do
  supabase storage cp "$f" ss://card-arts/"$f"
done
```
