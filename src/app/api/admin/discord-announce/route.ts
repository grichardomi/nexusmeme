import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Discord Announcement API
 * Posts announcements from admin panel to Discord channels
 *
 * POST /api/admin/discord-announce
 * Body: { message, channelType, embedTitle?, embedDescription?, embedColor? }
 */

interface DiscordAnnouncementRequest {
  message: string;
  channelType: 'announcements' | 'general' | 'beta-feedback';
  embedTitle?: string;
  embedDescription?: string;
  embedColor?: string;
}

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
  fields?: DiscordEmbedField[];
}

interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const body: DiscordAnnouncementRequest = await request.json();
    const { message, channelType, embedTitle, embedDescription, embedColor } = body;

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get webhook URL based on channel type
    const webhookUrl = getWebhookUrl(channelType);

    if (!webhookUrl) {
      return NextResponse.json(
        {
          success: false,
          error: `Discord webhook not configured for channel: ${channelType}. Set DISCORD_WEBHOOK_${channelType.toUpperCase()} in environment variables.`,
        },
        { status: 400 }
      );
    }

    // Build Discord message payload
    const payload: DiscordWebhookPayload = {
      username: 'NexusMeme',
      avatar_url: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/logo.png`
        : undefined,
    };

    // Use embed if title/description provided, otherwise plain message
    if (embedTitle || embedDescription) {
      payload.embeds = [
        {
          title: embedTitle || 'Announcement',
          description: embedDescription || message,
          color: embedColor ? parseInt(embedColor.replace('#', ''), 16) : 5793266, // Default: indigo
          timestamp: new Date().toISOString(),
          footer: {
            text: `Posted by ${session.user.name || 'Admin'}`,
          },
        },
      ];
    } else {
      payload.content = message;
    }

    // Send to Discord webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Discord webhook error:', response.status, errorText);
      return NextResponse.json(
        {
          success: false,
          error: `Failed to post to Discord: ${response.status} ${response.statusText}`,
        },
        { status: 500 }
      );
    }

    // Log announcement to database (optional - TODO: implement if needed)
    // await logAnnouncement(session.user.id, channelType, message);

    return NextResponse.json({
      success: true,
      message: 'Announcement posted to Discord successfully',
      channelType,
    });

  } catch (error) {
    console.error('Discord announce API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to post announcement',
      },
      { status: 500 }
    );
  }
}

/**
 * Get webhook URL based on channel type
 */
function getWebhookUrl(channelType: string): string | undefined {
  switch (channelType) {
    case 'announcements':
      return process.env.DISCORD_WEBHOOK_ANNOUNCEMENTS;
    case 'general':
      return process.env.DISCORD_WEBHOOK_GENERAL;
    case 'beta-feedback':
      return process.env.DISCORD_WEBHOOK_BETA;
    default:
      return undefined;
  }
}
