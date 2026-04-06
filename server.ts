/**
 * Custom Next.js dev/prod server.
 * Starts the trade orchestrator in-process before Next.js handles any request.
 * Run via: tsx server.ts  (tsx resolves @/ path aliases from tsconfig.json)
 */
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { config as loadEnv } from 'dotenv';
import path from 'path';

// Load .env.local (same files Next.js loads, in priority order)
loadEnv({ path: path.resolve(process.cwd(), '.env.local'), override: false });
loadEnv({ path: path.resolve(process.cwd(), '.env'), override: false });

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT ?? '3000', 10);

async function main() {
  // 1. Start orchestrator + background services BEFORE any request arrives
  console.log('[server] Starting background services...');
  try {
    const { initializeApp } = await import('./src/lib/init');
    await initializeApp();
    console.log('[server] ✅ Background services started');
  } catch (err) {
    console.error('[server] ❌ Failed to start background services:', err);
    // Continue anyway — trading will start on first page visit via AppInitializer
  }

  // 2. Hand off to Next.js
  const app = next({ dev });
  const handle = app.getRequestHandler();
  await app.prepare();

  createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl).catch((err) => {
      console.error('Request error:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    });
  }).listen(port, () => {
    console.log(`▲ Next.js ready — http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal:', err);
  process.exit(1);
});
