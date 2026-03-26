'use client';

import React, { useEffect, useState } from 'react';
import { CollapsibleQA } from '../CollapsibleQA';

interface FAQSectionProps {
  searchQuery: string;
}

export function FAQSection({ searchQuery }: FAQSectionProps) {
  const [feePercent, setFeePercent] = useState<number | null>(null);
  const [trialDays, setTrialDays] = useState<number | null>(null);
  const [flatFeeUsdc, setFlatFeeUsdc] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/billing/fee-rate/default')
      .then(r => r.json())
      .then(d => setFeePercent(d.feePercent ?? null))
      .catch(() => {});
    fetch('/api/billing/trial-days')
      .then(r => r.json())
      .then(d => setTrialDays(typeof d.trialDays === 'number' ? d.trialDays : null))
      .catch(() => {});
    fetch('/api/billing/flat-fee')
      .then(r => r.json())
      .then(d => setFlatFeeUsdc(typeof d.flatFeeUsdc === 'number' ? d.flatFeeUsdc : null))
      .catch(() => {});
  }, []);
  const fee = feePercent !== null ? `${feePercent}%` : '…';
  const trial = trialDays !== null ? `${trialDays}-day` : '…';
  const flatFee = flatFeeUsdc !== null && flatFeeUsdc > 0 ? `$${flatFeeUsdc} USDC/mo` : null;

  const questions = [
    {
      question: 'Does the bot go short or use leverage?',
      answer: `No — NexusMeme only takes **long positions**. This means the bot buys BTC or ETH and sells when a profit target is hit. It never short-sells (betting on prices falling) and never uses leverage or margin.\n\n**Why long-only?**\n• Simpler and more transparent — you always know what the bot is doing\n• No risk of liquidation that comes with leveraged positions\n• Aligned with how most retail investors approach crypto\n• Short-selling requires a different risk profile and is not suitable for all users\n\n**What happens in a falling market?**\nThe bot sits out. Our regime filter blocks new entries when BTC is in a confirmed downtrend (price below EMA200) or when market conditions are too choppy. Protecting your capital during bad conditions is as important as making money in good ones.\n\n**In summary**: The bot only makes money when prices go up. When prices are falling, it waits.`,
    },
    {
      question: 'Why is my bot not trading? Is something wrong?',
      answer: `Nothing is wrong! NexusMeme is fundamentally different from other trading platforms:\n\n**Most trading bots**: Trade constantly in ANY market condition (often losing money when conditions are bad)\n\n**NexusMeme's approach**: Wait patiently for good opportunities, skip bad conditions\n\n**Common reasons your bot might not be trading:**\n\n1. **Unfavorable Market Conditions** - Our system detects that overall market conditions are not favorable for profitable trades right now.\n\n2. **No Clear Opportunities** - Prices aren't showing clear patterns or trends that meet our quality standards.\n\n3. **Risk Too High** - Current volatility or market behavior suggests higher risk of loss.\n\n4. **Movement Too Small** - Price changes aren't significant enough to justify the trading fees.\n\n5. **Already in Position** - Your bot has an open trade and is managing that position.\n\n**This is intentional!** Check your bot activity feed — you'll see messages explaining what's happening:\n• "Market conditions unfavorable - waiting"\n• "Protecting your capital - skipping"\n• "Good opportunity found - entering trade"\n\n**The result**: You only enter trades when conditions favor success. Our performance fee means we only profit when YOU profit — we're motivated to be patient and selective, not reckless.`,
    },
    {
      question: 'How often should my bot be trading?',
      answer: `**There is no "normal" frequency** - it varies significantly based on market conditions:\n\n**When Markets Are Favorable**:\n• More trading activity\n• Multiple opportunities per week\n• Bot is more active\n\n**When Markets Are Uncertain**:\n• Reduced activity\n• Fewer quality setups\n• Bot is highly selective\n\n**When Markets Are Unfavorable**:\n• Minimal to no trading\n• Capital protection is the priority\n• Bot waits for conditions to improve\n\n**Key insight**: More trades doesn't mean more profit. Quality beats quantity.\n\n**Compare to other platforms**:\n• Traditional bots: Trade constantly (50-100+ times per week)\n• Scheduled platforms: Trade on autopilot regardless of conditions\n• NexusMeme: Trades only when quality opportunities exist\n\n**Why trading less can be BETTER**:\n• Each trade has a higher probability of success\n• You pay fewer trading fees (fees compound quickly!)\n• Your capital is protected during poor market conditions\n• You avoid the losses that aggressive platforms suffer\n\n**Check your bot's activity**: Go to Live Trading Dashboard → Recent Activity to see what your bot is doing and why.`,
    },
    {
      question: 'How does my bot decide when to trade?',
      answer: `Your bot uses multiple safety checks before entering any trade. We don't disclose the exact logic (that's our proprietary technology), but here's what it considers:\n\n**Market Direction**\n• Is the overall market trending in a favorable direction?\n• Are individual trading pairs showing clear patterns?\n\n**Risk Conditions**\n• Are market conditions stable or chaotic?\n• Is there unusual activity that signals high risk?\n\n**Profit Potential**\n• Is the expected movement large enough to be worthwhile?\n• Will the potential profit cover all trading fees with room for gain?\n\n**AI Analysis**\n• What does our AI system predict about market behavior?\n• How confident is the system about the opportunity?\n\n**Your bot must pass ALL safety checks before entering a trade.**\n\n**What you'll see in your activity feed:**\n"Market conditions unfavorable - waiting"\n"Good opportunity found - entering trade"\n"Protecting your capital - skipping this setup"\n\nThis selective approach is why NexusMeme users see better results than platforms that trade constantly regardless of conditions.`,
    },
    {
      question: 'How can I see what my bot is doing?',
      answer: `**Check your bot activity** to understand what's happening:\n\n1. Go to Dashboard → Live Trading\n2. Select your bot from the dropdown\n3. Look at the "Recent Activity" section\n4. You'll see messages explaining the bot's status\n\n**Types of messages you'll see**:\n\n✋ **Waiting Messages**\n"Market conditions unfavorable - waiting"\n"Protecting your capital - skipping"\n"Risk too high - staying out"\n\n→ These mean your bot is being selective and protecting you\n\n✅ **Action Messages**\n"Good opportunity found - entering trade"\n"Taking profit - exiting trade"\n"Trade complete - result: +$X.XX"\n\n→ These mean your bot found a quality setup or closed a position\n\n**Helpful tip**: If your bot shows repeated "waiting" messages for several days, it means market conditions remain unfavorable. Your bot is doing its job by PROTECTING you from potential losses.`,
    },
    {
      question: 'What is the minimum capital required?',
      answer: `During your ${trial} trial, you use paper trading (simulated, no real money required).\n\nFor live trading:\n- Minimum $1,000 total account value (cash + any open positions)\n- At least $100 in free USDT/USD to place new trades\n- This ensures your account can absorb normal market volatility\n- The more capital you have, the more you can potentially earn\n- It's recommended to only trade with capital you can afford to lose`,
    },
    {
      question: 'Can I run multiple bots?',
      answer: `No, each NexusMeme account is limited to 1 trading bot. This design:\n- Ensures focused risk management\n- Prevents over-leveraging your capital\n- Simplifies bot management\n\nIf you need multiple bots, you would need to create separate accounts.`,
    },
    {
      question: 'What are trading pairs and how many can I have?',
      answer: `Trading pairs are the cryptocurrencies your bot trades:\n- BTC/USDT: Bitcoin priced in Tether (USDT ≈ $1 USD)\n- ETH/USDT: Ethereum priced in Tether\n\nYour bot is focused on BTC and ETH — the most established crypto markets. USDT is a stablecoin pegged 1:1 to USD, so prices display in dollars. This disciplined approach means more consistent results than spreading across dozens of altcoins.`,
    },
    {
      question: 'How is NexusMeme different from other trading platforms?',
      answer: `**NexusMeme vs. Other Trading Platforms:**\n\n**Traditional Auto-Trading Platforms**\n• How they work: Trade constantly on a schedule or grid pattern\n• Frequency: 50-100+ trades per week\n• Problem: Trade even when market conditions are terrible\n• Problem: Huge fees pile up fast (can eat all your profits)\n• Problem: Keep buying during crashes with no protection\n\n**Copy Trading Platforms**\n• How they work: Copy what other traders do\n• Problem: You're at the mercy of someone else's decisions\n• Problem: No way to know if they're having a good or bad day\n• Problem: Often charge monthly subscription fees\n\n**Simple Buy-and-Hold**\n• How it works: Buy crypto and hold it\n• Problem: You lose money when markets go down\n• Problem: No way to capture profits along the way\n• Problem: No protection during crashes\n\n**NexusMeme (Smart Selective Trading)**\n• How it works: WAIT for quality opportunities, skip bad conditions\n• Frequency: 0-10 trades per week (only when it makes sense)\n• Benefit: Enters trades only when market is favorable\n• Benefit: Automatically adjusts profit targets (2-12% based on how strong the trend is)\n• Benefit: Protects your capital when Bitcoin is falling\n• Benefit: Won't trade if the movement is too small to cover fees\n\n**The Big Difference**: Other platforms trade on autopilot regardless of conditions. NexusMeme actively WAITS and PROTECTS your capital when conditions are bad.\n\n**Our Pricing**: ${flatFee ? `${flatFee} flat fee covers infrastructure. ` : ''}${fee} performance fee only on your profits — $0 when your bot doesn't profit. This means we want PROFITABLE trades for you, not just frequent activity.`,
    },
    {
      question: 'How much profit can I expect?',
      answer: `Profits depend on many factors:\n- Market conditions (going up, sideways, or down)\n- How much capital you're trading with\n- Your risk settings\n- Which trading pairs you choose\n\nYour bot automatically adjusts its approach based on market conditions to maximize profit potential while managing risk.\n\n**Realistic expectations**:\n• When markets are going up: Returns can be strong\n• When markets are flat/sideways: More modest returns\n• When markets are going down: Focus is on protecting your capital\n\n**Why do returns vary so much?** Because NexusMeme doesn't force trades. When conditions are bad, your bot WAITS instead of losing money. This means:\n- You might have great months when markets are good\n- You might have quiet months when markets are bad\n- Overall, you avoid the big losses that constant-trading platforms suffer\n\n**Important**: We cannot guarantee specific returns. Trading results vary widely based on market conditions and timing. Past performance does not predict future results. All trading involves risk of loss. Only trade with money you can afford to lose.`,
    },
    {
      question: 'My bot hasn\'t traded in days - should I be concerned?',
      answer: `**No! Extended periods without trading are completely NORMAL** when market conditions are unfavorable.\n\n**Why your bot might not trade for days or even weeks:**\n\n**Unfavorable Market Conditions**\n• Markets are trending down or too unstable\n• No clear opportunities that meet our quality standards\n• Our system detects conditions that favor losses over gains\n• This can last for extended periods during poor market cycles\n\n**Low Activity Periods**\n• Markets sometimes become very quiet\n• Movement isn't significant enough to justify trading fees\n• Common during: Holidays, weekends, uncertain economic periods\n\n**Post-Volatility Recovery**\n• After major market events, things need time to stabilize\n• Bot waits for calmer conditions before trading\n• Avoids entering during unstable recovery periods\n\n**What to check if your bot hasn't traded in 7+ days:**\n\n✅ Look at your bot activity feed for status messages\n✅ Check overall crypto market conditions\n✅ Verify your bot status shows "Running" (not "Stopped")\n✅ Make sure your Binance API connection is still working\n\n**Important context**: During major market downturns, selective trading platforms can go weeks without activity. This patience helps users avoid significant losses that aggressive constant-trading platforms suffer.\n\n**Remember**: Not trading = not losing money. Your bot's job is to profit when conditions are favorable, and protect your capital when they're not.`,
    },
    {
      question: 'What if I want to test before going live with my own capital?',
      answer: `Your ${trial} trial is your testing period:\n- You trade in paper mode (simulated, no real money)\n- See how the AI strategy performs in real market conditions\n- No capital required during the trial\n- You can monitor performance and see if the strategy works for you\n\nAfter your trial, continue trading and pay${flatFee ? ` ${flatFee} flat +` : ''} ${fee} on profits.`,
    },
    {
      question: 'Why did my trade lose money?',
      answer: `All trading has risk - losses can happen even with the best systems. Common reasons:\n\n- Price suddenly moved in the wrong direction\n- Unexpected news (regulations, exchange issues, etc.)\n- Market became very volatile (wild price swings)\n- Your automatic exit triggered to prevent bigger losses\n\nYou can reduce (but not eliminate) losses by:\n- Using smaller trade sizes\n- Trading fewer pairs at once\n- Being more patient during uncertain times\n- Understanding that down markets mean more losses\n\n**Important**: No trading platform can guarantee profits. Even with smart protection, losses will happen. Only trade with money you can afford to lose.`,
    },
    {
      question: 'How often does the AI update its strategy?',
      answer: `The AI system:\n- Analyzes market conditions continuously\n- Adjusts to current market regime (bullish, sideways, bearish)\n- Updates profit targets based on trend strength\n- Re-evaluates entry signals in real-time\n\nStrategy updates happen automatically without requiring manual intervention.`,
    },
    {
      question: 'What happens if I lose my exchange API keys?',
      answer: `If you lose your API keys or suspect they may be compromised:\n\n1. Log in to binance.com immediately\n2. Go to Profile > API Management\n3. Delete the compromised API key\n4. Create a new API key with Reading + Spot & Margin Trading only (no Withdrawals)\n5. In NexusMeme, go to Settings → Exchange Connections → Binance\n6. Paste the new keys and click "Connect"\n\nThe old keys stop working immediately after deletion. If you suspect unauthorized access, also change your exchange account password.`,
    },
    {
      question: 'Is my account secure?',
      answer: `Security features:\n- All your data is encrypted (scrambled so hackers can't read it)\n- Your API keys are stored securely and encrypted at rest\n- NexusMeme can only VIEW your balance and place trades\n- NexusMeme CANNOT withdraw money from your exchange account\n- We recommend enabling extra security (2FA) on your exchange account\n\nBest practices to stay safe:\n- Use a strong, unique password on your exchange\n- Enable 2-factor authentication (adds an extra login step)\n- Never share your API keys with anyone\n- Never enable "Withdrawals" on your API key — NexusMeme never needs it\n- Review your exchange account regularly for any suspicious activity`,
    },
    {
      question: 'Is NexusMeme available in my country?',
      answer: `NexusMeme is available globally — including the United States.\n\n**Supported exchanges:**\n- **Binance International (binance.com)** — available in 180+ countries. Not available to US residents.\n- **Binance US (binance.us)** — available to US residents.\n\n**Available worldwide** including:\n- United States (via Binance US)\n- Southeast Asia (Philippines, Vietnam, Thailand, Indonesia, Singapore, Malaysia)\n- Europe (UK, Germany, France, Netherlands, and more)\n- Latin America (Brazil, Colombia, Argentina, Mexico)\n- Middle East (UAE, Turkey, Saudi Arabia)\n- Africa (Nigeria, Kenya, South Africa)\n\nConnect whichever exchange is available in your country during onboarding.`,
    },
    {
      question: 'What exchange does NexusMeme support?',
      answer: `NexusMeme supports Binance:\n\n**Binance International (binance.com)** — world's largest crypto exchange\n- Available in 180+ countries (not US residents)\n- Low fees (0.10% per trade)\n- Highest global liquidity, tighter spreads\n\n**Binance US (binance.us)** — for US residents\n- Available to US residents\n- Low fees (0.10% per trade)\n- Fully compliant for US traders\n\n**How it works:**\n- Your money stays in YOUR exchange account at all times\n- NexusMeme connects via API to view your balance and place trades\n- NexusMeme CANNOT withdraw your money (only you can)\n- You can revoke API access anytime by deleting the key on your exchange\n\n**To get started:**\n1. Create an account on whichever Binance exchange is available in your country\n2. Complete identity verification (required for trading)\n3. Create an API key with trading permissions only — do NOT enable withdrawals\n4. Connect your key in NexusMeme: Settings → Exchange Connections`,
    },
    {
      question: 'Can I export my trading data?',
      answer: `Yes! You can export your trading data anytime:\n\nTo export:\n1. Go to Dashboard > Select your bot > Trading History\n2. Click "Export"\n3. Choose date range\n4. Select format (CSV, JSON, or PDF)\n5. Download\n\nUseful for:\n- Tax reporting and accounting\n- Performance analysis\n- Sharing with financial advisors\n- Personal record keeping`,
    },
    {
      question: 'How is my data retained?',
      answer: `All your trading data is retained indefinitely:\n- Complete trade history is always available\n- All historical data is preserved\n- You can access data anytime\n\nBest practices:\n- Export your data regularly for backup\n- Keep local copies for tax records\n- Archive data annually for compliance`,
    },
    {
      question: 'What if I have technical issues?',
      answer: `For technical support:\n\n1. Check the Help Center (you're reading it!)\n2. Check your bot status:\n   - Go to Dashboard\n   - Look for status indicator (Running, Stopped, Error)\n   - Check bot logs for error messages\n3. Common issues:\n   - Bot stopped? Check your exchange API key is still active\n   - No trades executing? Check trading pairs and capital\n   - API error? Verify your exchange API permissions (Reading + Spot Trading)\n4. Contact support:\n   - Email: support@nexusmeme.com\n   - Include bot ID and error message\n   - We respond as quickly as possible`,
    },
    {
      question: 'Can I get my money back?',
      answer: `Your capital and profits are always yours:\n\nTo withdraw your capital and profits:\n1. Stop your bot (optional)\n2. Wait for all trades to close\n3. Go to your Binance account directly\n4. Withdraw to your bank\n\nFees and considerations:\n- Exchange withdrawal fees (set by your exchange)\n- Bank transfer fees may apply\n- Currency conversion fees if applicable\n- Trading losses are your responsibility (you bear trading risk)\n- We only charge ${fee} on profitable trades`,
    },
  ];

  const filtered = questions.filter(
    (q) =>
      searchQuery === '' ||
      q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">Frequently Asked Questions</h2>
        <p className="text-slate-700 dark:text-slate-300">
          Common questions about NexusMeme features, plans, and trading.
        </p>
      </div>

      <div className="space-y-3">
        {filtered.length > 0 ? (
          filtered.map((qa, index) => <CollapsibleQA key={index} question={qa.question} answer={qa.answer} />)
        ) : (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">No results found for "{searchQuery}"</p>
        )}
      </div>
    </div>
  );
}
