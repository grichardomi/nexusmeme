/**
 * GET /api/bots/health-score
 * Returns a 0-100 bot health score for the current user's bot.
 *
 * Score components (total 100):
 *   30 — Bot running & API keys valid
 *   25 — Billing in good standing (no unpaid invoices)
 *   25 — Trade win rate (last 30 days, min 5 trades)
 *   20 — Activity (traded in last 7 days OR market blocked with reason)
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

interface ScoreComponent {
  label: string;
  score: number;   // actual points earned
  max: number;     // max possible
  status: 'good' | 'warn' | 'bad';
  detail: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const components: ScoreComponent[] = [];

  // ── 1. Bot running & API keys valid (30pts) ──────────────────────────────
  const botRows = await query<{ status: string; exchange: string }>(
    `SELECT bi.status, bi.exchange
     FROM bot_instances bi
     WHERE bi.user_id = $1
     ORDER BY bi.created_at DESC LIMIT 1`,
    [userId]
  );
  const apiKeyRows = await query<{ id: string }>(
    `SELECT id FROM exchange_api_keys WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  const botStatus = botRows[0]?.status;
  const hasApiKeys = apiKeyRows.length > 0;
  const botRunning = botStatus === 'running';

  if (botRunning && hasApiKeys) {
    components.push({ label: 'Bot & API Keys', score: 30, max: 30, status: 'good', detail: 'Bot is running with valid API keys' });
  } else if (!hasApiKeys) {
    components.push({ label: 'Bot & API Keys', score: 0, max: 30, status: 'bad', detail: 'No exchange API keys connected' });
  } else if (botStatus === 'paused') {
    components.push({ label: 'Bot & API Keys', score: 20, max: 30, status: 'warn', detail: 'Bot is paused — resume to start trading' });
  } else if (botStatus === 'stopped') {
    components.push({ label: 'Bot & API Keys', score: 10, max: 30, status: 'warn', detail: 'Bot is stopped' });
  } else {
    components.push({ label: 'Bot & API Keys', score: 0, max: 30, status: 'bad', detail: 'No bot configured' });
  }

  // ── 2. Billing standing (25pts) ──────────────────────────────────────────
  const invoiceRows = await query<{ count: number; total_amount: number }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total_amount
     FROM invoices
     WHERE user_id = $1 AND status IN ('open','draft')`,
    [userId]
  );
  const unpaidCount = parseInt(String(invoiceRows[0]?.count || 0), 10);
  const unpaidAmount = parseFloat(String(invoiceRows[0]?.total_amount || 0));

  if (unpaidCount === 0) {
    components.push({ label: 'Billing', score: 25, max: 25, status: 'good', detail: 'No outstanding invoices' });
  } else if (unpaidCount === 1) {
    components.push({ label: 'Billing', score: 10, max: 25, status: 'warn', detail: `1 unpaid invoice ($${unpaidAmount.toFixed(2)} USDC)` });
  } else {
    components.push({ label: 'Billing', score: 0, max: 25, status: 'bad', detail: `${unpaidCount} unpaid invoices ($${unpaidAmount.toFixed(2)} USDC total)` });
  }

  // ── 3. Win rate last 30 days (25pts) ─────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const tradeRows = await query<{ total: number; wins: number }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE profit_loss > 0) AS wins
     FROM trades t
     JOIN bot_instances bi ON bi.id = t.bot_instance_id
     WHERE bi.user_id = $1
       AND t.status = 'closed'
       AND t.exit_time >= $2`,
    [userId, thirtyDaysAgo]
  );
  const total30 = parseInt(String(tradeRows[0]?.total || 0), 10);
  const wins30 = parseInt(String(tradeRows[0]?.wins || 0), 10);

  if (total30 < 5) {
    components.push({ label: 'Win Rate', score: 15, max: 25, status: 'warn', detail: total30 === 0 ? 'No closed trades in 30 days — market conditions pending' : `Only ${total30} trades — more data needed` });
  } else {
    const wr = (wins30 / total30) * 100;
    if (wr >= 55) {
      components.push({ label: 'Win Rate', score: 25, max: 25, status: 'good', detail: `${wr.toFixed(0)}% win rate (${wins30}/${total30} trades)` });
    } else if (wr >= 40) {
      components.push({ label: 'Win Rate', score: 15, max: 25, status: 'warn', detail: `${wr.toFixed(0)}% win rate (${wins30}/${total30} trades)` });
    } else {
      components.push({ label: 'Win Rate', score: 5, max: 25, status: 'bad', detail: `${wr.toFixed(0)}% win rate — below target` });
    }
  }

  // ── 4. Activity last 7 days (20pts) ──────────────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentRows = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM trades t
     JOIN bot_instances bi ON bi.id = t.bot_instance_id
     WHERE bi.user_id = $1
       AND t.entry_time >= $2`,
    [userId, sevenDaysAgo]
  );
  const recentTrades = parseInt(String(recentRows[0]?.count || 0), 10);

  if (recentTrades >= 1) {
    components.push({ label: 'Activity', score: 20, max: 20, status: 'good', detail: `${recentTrades} trade${recentTrades > 1 ? 's' : ''} in the last 7 days` });
  } else if (botRunning) {
    // Bot is running but no trades — likely market conditions
    components.push({ label: 'Activity', score: 15, max: 20, status: 'warn', detail: 'No trades this week — bot watching for entry conditions' });
  } else {
    components.push({ label: 'Activity', score: 0, max: 20, status: 'bad', detail: 'Bot inactive — no trades in 7 days' });
  }

  const totalScore = components.reduce((sum, c) => sum + c.score, 0);

  return NextResponse.json({ score: totalScore, components });
}
