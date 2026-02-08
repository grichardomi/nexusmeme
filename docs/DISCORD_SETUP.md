# Discord Integration Setup Guide

Complete guide for setting up Discord integration with NexusMeme admin panel.

## Table of Contents
1. [Enable Discord Widget](#1-enable-discord-widget)
2. [Create Discord Webhooks](#2-create-discord-webhooks)
3. [Configure Environment Variables](#3-configure-environment-variables)
4. [Test Integration](#4-test-integration)
5. [Channel Recommendations](#5-channel-recommendations)

---

## 1. Enable Discord Widget

The widget provides live member counts and server stats.

### Steps:
1. Go to your Discord Server
2. Click **Server Settings** (gear icon)
3. Navigate to **Widget** in the left sidebar
4. Toggle **"Enable Server Widget"** to **ON**
5. Copy the **Server ID**
6. Verify it matches `.env.local`:
   ```
   NEXT_PUBLIC_DISCORD_GUILD_ID=1397058780310802442
   ```
7. Click **Save Changes**

### What this enables:
- ✅ Live member counts on help page
- ✅ Online member tracking
- ✅ Discord analytics in admin dashboard
- ✅ Social proof throughout the app

---

## 2. Create Discord Webhooks

Webhooks allow posting announcements from the admin panel to Discord.

### Steps for Each Channel:

#### A. Announcements Channel Webhook:
1. Go to your Discord Server
2. Right-click **#announcements** channel → **Edit Channel**
3. Click **Integrations** in left sidebar
4. Click **Webhooks**
5. Click **New Webhook**
6. Name it: `NexusMeme Bot`
7. (Optional) Upload avatar: Use your logo
8. Click **Copy Webhook URL**
9. Save the URL (you'll need it in step 3)

#### B. General Channel Webhook:
Repeat steps above for **#general** channel

#### C. Beta Feedback Channel Webhook:
Repeat steps above for **#beta-feedback** channel

### Webhook Security:
⚠️ **Never commit webhook URLs to git!**
- Webhooks allow posting to your Discord
- Keep URLs in `.env.local` only
- Add `.env.local` to `.gitignore` (already done)

---

## 3. Configure Environment Variables

Add webhook URLs to `/home/omi/nexusmeme/.env.local`:

```bash
# Discord Webhooks (for posting announcements from admin panel)
DISCORD_WEBHOOK_ANNOUNCEMENTS=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID_HERE
DISCORD_WEBHOOK_GENERAL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID_HERE
DISCORD_WEBHOOK_BETA=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID_HERE
```

### Example:
```bash
DISCORD_WEBHOOK_ANNOUNCEMENTS=https://discord.com/api/webhooks/123456789/AbCdEfGhIjKlMnOpQrStUvWxYz
DISCORD_WEBHOOK_GENERAL=https://discord.com/api/webhooks/987654321/ZyXwVuTsRqPoNmLkJiHgFeDcBa
DISCORD_WEBHOOK_BETA=https://discord.com/api/webhooks/456789123/qWeRtYuIoPaSdFgHjKlZxCvBnM
```

---

## 4. Test Integration

### Test Widget:
1. Visit `/admin/dashboard`
2. Check "Discord Members" stat card
3. Should show: member count + online members
4. If shows 0, check:
   - Widget is enabled
   - Guild ID matches
   - Wait 60 seconds for cache refresh

### Test Webhook Posting:
1. Visit `/admin/discord`
2. Click **"📣 New Announcement"**
3. Select channel: **Announcements**
4. Enter test message: "Testing webhook integration"
5. Click **"Post to Discord"**
6. Check Discord #announcements channel
7. Should see message from NexusMeme Bot

---

## 5. Channel Recommendations

### Recommended Channel Structure:

```
📢 ANNOUNCEMENTS
├── #announcements (read-only, admin posts only)
└── #updates (feature releases, platform updates)

💬 COMMUNITY
├── #general (casual chat)
├── #introductions (new member greetings)
└── #off-topic (non-trading discussion)

❓ SUPPORT
├── #help-general (quick questions)
├── #bot-setup (bot configuration help)
├── #trading-strategies (strategy discussions)
└── #bug-reports (community-vetted bugs)

🧪 BETA
├── #beta-feedback (beta tester feedback)
├── #feature-requests (user suggestions)
└── #beta-announcements (beta updates)

📊 TRADING
├── #trade-signals (optional: automated signals)
├── #market-analysis (market discussions)
└── #profit-sharing (success stories)
```

### Channel Permissions:

**#announcements:**
- Admin: Post messages ✅
- Everyone: Read messages ✅, Post messages ❌
- Purpose: Important updates only

**#help-general:**
- Everyone: Post messages ✅
- Purpose: Community peer-to-peer support

**#beta-feedback:**
- Beta role: Post messages ✅
- Everyone: Read messages ✅
- Purpose: Beta tester discussions

---

## 6. Auto-Moderation (Optional)

Consider adding a bot like:
- **MEE6**: Auto-moderation, leveling
- **Dyno**: Auto-mod, custom commands
- **Carl-bot**: Reaction roles, logging

---

## 7. Community Guidelines Template

Post in #rules or #guidelines:

```
🌟 NexusMeme Community Guidelines

1️⃣ Be respectful and helpful to all members
2️⃣ No spam, advertising, or self-promotion
3️⃣ Keep discussions trading-related in trading channels
4️⃣ Use appropriate channels for your questions
5️⃣ No financial advice - share strategies, not recommendations
6️⃣ Respect privacy - no sharing API keys or sensitive info
7️⃣ Have fun and help grow our community! 🚀

Need help? Ask in #help-general or create a support ticket on nexusmeme.com
```

---

## 8. Moderation Roles

### Recommended Role Structure:

1. **Admin** (you)
   - Full permissions
   - Manage server, channels, webhooks

2. **Moderator**
   - Kick/ban members
   - Delete messages
   - Timeout users
   - Pin messages

3. **Beta Tester**
   - Access to #beta-feedback
   - Early feature testing
   - Direct feedback to dev team

4. **Helper** (power users)
   - Answer questions in #help-general
   - Guide new users
   - Report issues to mods

5. **Member** (everyone)
   - Default role
   - Access to public channels

---

## 9. Troubleshooting

### Widget Not Showing:
- ✅ Check widget is enabled in Discord settings
- ✅ Verify Guild ID matches
- ✅ Wait 5 minutes for cache refresh
- ✅ Check browser console for errors

### Webhook Not Working:
- ✅ Verify webhook URL is correct (starts with https://discord.com/api/webhooks/)
- ✅ Check webhook hasn't been deleted in Discord
- ✅ Verify channel still exists
- ✅ Check admin permissions in app

### Admin Can't Post:
- ✅ Verify user has admin role in database
- ✅ Check session is valid (try logout/login)
- ✅ Check browser console for API errors

---

## 10. Support

Need help setting up Discord integration?
- Email: support@nexusmeme.com
- Discord: Join and ask in #help-general

---

**Last Updated:** 2026-02-08
**Author:** NexusMeme Team
