import { EmailTemplate } from '@/types/email';
import { getLogoUrl } from './shared';

interface BotCreatedEmailProps {
  name: string;
  botName: string;
  strategy: string;
  exchange: string;
  dashboardUrl: string;
}

export function BotCreatedEmailTemplate({
  name,
  botName,
  strategy,
  exchange,
  dashboardUrl,
}: BotCreatedEmailProps): EmailTemplate {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .bot-box { background: white; border: 1px solid #667eea; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .bot-detail { margin: 10px 0; }
          .bot-detail-label { color: #666; font-size: 14px; }
          .bot-detail-value { font-weight: bold; color: #333; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; }
          .btn:hover { background: #5568d3; }
          h1 { margin: 0; font-size: 32px; }
          p { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-container">
              <div class="logo-box">
                <img src="${getLogoUrl()}" alt="NexusMeme Logo" class="logo" width="150" height="150" style="max-width: 150px; width: 150px; height: auto; display: block;" />
              </div>
            </div>
            <h1>🤖 Bot Created Successfully!</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>
            <p>Your new trading bot has been created and is ready to deploy!</p>

            <div class="bot-box">
              <h3 style="margin-top: 0;">${botName}</h3>
              <div class="bot-detail">
                <div class="bot-detail-label">Strategy</div>
                <div class="bot-detail-value">${strategy}</div>
              </div>
              <div class="bot-detail">
                <div class="bot-detail-label">Exchange</div>
                <div class="bot-detail-value">${exchange}</div>
              </div>
              <div class="bot-detail">
                <div class="bot-detail-label">Status</div>
                <div class="bot-detail-value">⚪ Ready to Deploy</div>
              </div>
            </div>

            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Review bot configuration and strategy parameters</li>
              <li>Backtest your bot with historical data (optional)</li>
              <li>Activate the bot to start live trading</li>
              <li>Monitor bot performance in your dashboard</li>
            </ol>

            <a href="${dashboardUrl}" class="btn">View Bot in Dashboard</a>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

            <p style="font-size: 14px; color: #666;">
              💡 Tip: Start with a small capital amount and monitor your bot's performance for a few days before scaling up.
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://docs.nexusmeme.com/bots" style="color: #667eea; text-decoration: none;">Bot Guide</a> | <a href="https://nexusmeme.com/support" style="color: #667eea; text-decoration: none;">Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Your Trading Bot "${botName}" Has Been Created!`,
    html,
    text: `
Bot Created Successfully!

Hi ${name || 'Trader'},

Your new trading bot has been created:

Bot Name: ${botName}
Strategy: ${strategy}
Exchange: ${exchange}
Status: Ready to Deploy

Next Steps:
1. Review bot configuration
2. Backtest with historical data (optional)
3. Activate the bot
4. Monitor performance

View in dashboard: ${dashboardUrl}

Best regards,
The NexusMeme Team
    `,
  };
}

interface TradeAlertEmailProps {
  name: string;
  botName: string;
  pair: string;
  action: 'BUY' | 'SELL';
  price: number;
  amount: number;
  profit?: number;
  dashboardUrl: string;
}

export function TradeAlertEmailTemplate({
  name,
  botName,
  pair,
  action,
  price,
  amount,
  profit,
  dashboardUrl,
}: TradeAlertEmailProps): EmailTemplate {
  const isProfit = profit && profit > 0;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .trade-box { background: white; border-left: 5px solid ${action === 'BUY' ? '#28a745' : '#dc3545'}; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .trade-detail { margin: 10px 0; }
          .trade-detail-label { color: #666; font-size: 14px; }
          .trade-detail-value { font-weight: bold; color: #333; font-size: 16px; }
          .action-badge { display: inline-block; padding: 8px 16px; border-radius: 4px; font-weight: bold; color: white; background-color: ${action === 'BUY' ? '#28a745' : '#dc3545'}; }
          .profit { color: #28a745; font-weight: bold; }
          .loss { color: #dc3545; font-weight: bold; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; }
          .btn:hover { background: #5568d3; }
          h1 { margin: 0; font-size: 28px; }
          p { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-container">
              <div class="logo-box">
                <img src="${getLogoUrl()}" alt="NexusMeme Logo" class="logo" width="150" height="150" style="max-width: 150px; width: 150px; height: auto; display: block;" />
              </div>
            </div>
            <h1>📊 Trade Executed</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>
            <p>Your trading bot has executed a new trade:</p>

            <div class="trade-box">
              <div style="margin-bottom: 15px;">
                <span class="action-badge">${action}</span>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">Bot</div>
                <div class="trade-detail-value">${botName}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">Pair</div>
                <div class="trade-detail-value">${pair}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">Price</div>
                <div class="trade-detail-value">$${price.toFixed(2)}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">Amount</div>
                <div class="trade-detail-value">${amount.toFixed(8)} ${pair.split('/')[0]}</div>
              </div>
              ${
                profit !== undefined
                  ? `<div class="trade-detail">
                <div class="trade-detail-label">Profit/Loss</div>
                <div class="trade-detail-value ${isProfit ? 'profit' : 'loss'}">
                  ${isProfit ? '+' : ''}$${profit.toFixed(2)}
                </div>
              </div>`
                  : ''
              }
            </div>

            <p>Track all your trades and bot performance in your dashboard:</p>
            <a href="${dashboardUrl}" class="btn">View Dashboard</a>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

            <p style="font-size: 14px; color: #666;">
              Note: This is an automated notification. No action is required from you.
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/settings/notifications" style="color: #667eea; text-decoration: none;">Manage Alerts</a> | <a href="https://nexusmeme.com/privacy" style="color: #667eea; text-decoration: none;">Privacy</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `${action} Alert - ${pair} on ${botName}`,
    html,
    text: `
Trade Executed

Hi ${name || 'Trader'},

Your bot has executed a trade:

Bot: ${botName}
Pair: ${pair}
Action: ${action}
Price: $${price.toFixed(2)}
Amount: ${amount.toFixed(8)} ${pair.split('/')[0]}
${profit !== undefined ? `Profit/Loss: ${isProfit ? '+' : ''}$${profit.toFixed(2)}` : ''}

View your dashboard: ${dashboardUrl}

Best regards,
The NexusMeme Team
    `,
  };
}
