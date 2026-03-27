import { EmailTemplate } from '@/types/email';
import { getLogoUrl, appUrl } from './shared';

export interface WeeklyDigestProps {
  name?: string;
  weekLabel: string; // e.g. "Mar 20 – Mar 26, 2026"
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  grossProfitUsdt: number;
  netProfitUsdt: number;
  feesUsdt: number;
  winRate: number; // 0-100
  bestTrade: { pair: string; profitPct: number } | null;
  worstTrade: { pair: string; profitPct: number } | null;
  openTradesCount: number;
  botStatus: 'running' | 'paused' | 'stopped';
  marketNote: string; // plain-text market condition summary e.g. "Low volume — bot protecting capital"
}

function pct(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}
function usd(n: number) {
  return (n >= 0 ? '+' : '') + '$' + Math.abs(n).toFixed(2);
}
function winRateColor(rate: number) {
  return rate >= 60 ? '#28a745' : rate >= 45 ? '#f59e0b' : '#dc3545';
}

export function WeeklyDigestEmailTemplate({
  name = 'Trader',
  weekLabel,
  totalTrades,
  winningTrades,
  losingTrades,
  grossProfitUsdt,
  netProfitUsdt,
  feesUsdt,
  winRate,
  bestTrade,
  worstTrade,
  openTradesCount,
  botStatus,
  marketNote,
}: WeeklyDigestProps): EmailTemplate {
  const noTrades = totalTrades === 0;
  const netColor = netProfitUsdt >= 0 ? '#28a745' : '#dc3545';
  const statusBadge = botStatus === 'running' ? '🟢 Running' : botStatus === 'paused' ? '🟡 Paused' : '🔴 Stopped';

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
      .wrapper { max-width: 600px; margin: 0 auto; padding: 20px; }
      .card { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 36px 24px; text-align: center; }
      .logo-box { background: white; border-radius: 10px; padding: 12px; display: inline-block; margin-bottom: 16px; }
      .logo { max-width: 120px; height: auto; display: block; }
      .header h1 { margin: 0 0 4px; font-size: 22px; }
      .header p { margin: 0; opacity: 0.85; font-size: 14px; }
      .body { padding: 28px 24px; }
      .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0; }
      .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center; }
      .stat-value { font-size: 22px; font-weight: 700; margin-bottom: 2px; }
      .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
      .section-title { font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 24px 0 10px; }
      .trade-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border-radius: 6px; margin-bottom: 6px; font-size: 14px; }
      .trade-pair { font-weight: 600; color: #1e293b; }
      .note-box { background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 14px 16px; margin: 20px 0; font-size: 14px; color: #1e40af; }
      .no-trades-box { text-align: center; padding: 28px 16px; background: #f8fafc; border-radius: 8px; margin: 20px 0; }
      .no-trades-box p { margin: 6px 0; font-size: 14px; color: #64748b; }
      .btn { display: inline-block; background: #2563eb; color: white !important; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 20px; }
      .status-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border-radius: 6px; font-size: 13px; margin-bottom: 6px; }
      .footer { background: #1e293b; color: #94a3b8; padding: 20px 24px; text-align: center; font-size: 12px; }
      .footer a { color: #60a5fa; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <!-- Header -->
        <div class="header">
          <div class="logo-box">
            <img src="${getLogoUrl()}" alt="NexusMeme" class="logo" width="120" />
          </div>
          <h1>📊 Weekly Bot Report</h1>
          <p>${weekLabel}</p>
        </div>

        <!-- Body -->
        <div class="body">
          <p>Hi ${name},</p>
          <p>Here's your bot's performance summary for the week.</p>

          <!-- Bot status -->
          <div class="status-row">
            <span style="color:#64748b;">Bot Status</span>
            <span style="font-weight:600;">${statusBadge}</span>
          </div>
          ${openTradesCount > 0 ? `<div class="status-row"><span style="color:#64748b;">Open Trades</span><span style="font-weight:600;">${openTradesCount}</span></div>` : ''}

          ${noTrades ? `
          <!-- No trades this week -->
          <div class="no-trades-box">
            <div style="font-size:36px;margin-bottom:8px;">💤</div>
            <p style="font-weight:600;color:#1e293b;font-size:15px;">No trades this week</p>
            <p>Market conditions didn't meet entry criteria. Your capital was protected.</p>
          </div>
          ` : `
          <!-- Stats grid -->
          <div class="stat-grid">
            <div class="stat-box">
              <div class="stat-value" style="color:${netColor};">${usd(netProfitUsdt)}</div>
              <div class="stat-label">Net Profit (USDT)</div>
            </div>
            <div class="stat-box">
              <div class="stat-value" style="color:${winRateColor(winRate)};">${winRate.toFixed(0)}%</div>
              <div class="stat-label">Win Rate</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${totalTrades}</div>
              <div class="stat-label">Total Trades</div>
            </div>
            <div class="stat-box">
              <div class="stat-value" style="color:#64748b;">$${feesUsdt.toFixed(2)}</div>
              <div class="stat-label">Exchange Fees</div>
            </div>
          </div>

          <!-- Win / Loss breakdown -->
          <div class="section-title">Trade Breakdown</div>
          <div class="trade-row">
            <span class="trade-pair">✅ Winning trades</span>
            <span style="color:#28a745;font-weight:600;">${winningTrades}</span>
          </div>
          <div class="trade-row">
            <span class="trade-pair">❌ Losing trades</span>
            <span style="color:#dc3545;font-weight:600;">${losingTrades}</span>
          </div>
          <div class="trade-row">
            <span class="trade-pair">Gross profit</span>
            <span style="font-weight:600;">${usd(grossProfitUsdt)}</span>
          </div>

          ${bestTrade ? `
          <!-- Best & worst -->
          <div class="section-title">Highlights</div>
          <div class="trade-row">
            <span class="trade-pair">🏆 Best trade — ${bestTrade.pair}</span>
            <span style="color:#28a745;font-weight:600;">${pct(bestTrade.profitPct)}</span>
          </div>
          ${worstTrade ? `<div class="trade-row">
            <span class="trade-pair">📉 Worst trade — ${worstTrade.pair}</span>
            <span style="color:#dc3545;font-weight:600;">${pct(worstTrade.profitPct)}</span>
          </div>` : ''}
          ` : ''}
          `}

          <!-- Market note -->
          <div class="note-box">
            📡 <strong>Market this week:</strong> ${marketNote}
          </div>

          <!-- CTA -->
          <div style="text-align:center;">
            <a href="${appUrl('/dashboard')}" class="btn">View Full Dashboard →</a>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <p>NexusMeme — AI-powered crypto trading</p>
          <p><a href="${appUrl('/dashboard/settings')}">Manage email preferences</a> · <a href="${appUrl('/help')}">Help Center</a></p>
          <p style="margin-top:10px;font-size:11px;color:#475569;">You're receiving this because you have an active NexusMeme bot. Weekly digests send every Monday.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const text = `Weekly Bot Report — ${weekLabel}

Hi ${name},

Bot Status: ${statusBadge}
${noTrades
  ? 'No trades this week. Market conditions didn\'t meet entry criteria — your capital was protected.'
  : `Net Profit: ${usd(netProfitUsdt)}
Win Rate: ${winRate.toFixed(0)}%
Trades: ${totalTrades} (${winningTrades} wins / ${losingTrades} losses)
Exchange Fees: $${feesUsdt.toFixed(2)}
${bestTrade ? `Best Trade: ${bestTrade.pair} ${pct(bestTrade.profitPct)}` : ''}
${worstTrade ? `Worst Trade: ${worstTrade.pair} ${pct(worstTrade.profitPct)}` : ''}`}

Market this week: ${marketNote}

View your dashboard: ${appUrl('/dashboard')}

NexusMeme — AI-powered crypto trading`;

  return {
    subject: noTrades
      ? `Weekly Report: Market quiet this week — capital protected`
      : netProfitUsdt >= 0
      ? `Weekly Report: ${usd(netProfitUsdt)} profit — ${winRate.toFixed(0)}% win rate`
      : `Weekly Report: Tough week — ${usd(netProfitUsdt)} — here's what happened`,
    html,
    text,
  };
}
