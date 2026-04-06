import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Set once when this module is first loaded = unique per server process start
const SERVER_START_ID = Date.now().toString();

// Kick off orchestrator on first ping (instrumentation.ts register() is unreliable in dev)
let bootstrapped = false;
async function bootstrapOnce() {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    const { initializeApp } = await import('@/lib/init');
    await initializeApp();
    console.log('✅ [ping] App bootstrapped via first ping');
  } catch (err) {
    bootstrapped = false; // allow retry on next ping
    console.error('[ping] Bootstrap error:', err);
  }
}

export async function GET() {
  void bootstrapOnce();
  return NextResponse.json({ id: SERVER_START_ID }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
