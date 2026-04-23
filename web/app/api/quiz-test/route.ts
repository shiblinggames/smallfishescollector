import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY

  if (!key) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set' })
  }

  try {
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
    })
    return NextResponse.json({ ok: true, response: (msg.content[0] as any).text })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err), status: err?.status })
  }
}
