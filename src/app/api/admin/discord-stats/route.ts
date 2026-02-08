import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Discord Analytics API
 * Fetches Discord server statistics for admin dashboard
 *
 * GET /api/admin/discord-stats
 * Returns: Discord server stats, member counts, activity metrics
 */

interface DiscordWidgetData {
  id: string;
  name: string;
  instant_invite: string;
  channels: Array<{ id: string; name: string; position: number }>;
  members: Array<{
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    status: string;
    avatar_url: string;
  }>;
  presence_count: number;
}

interface DiscordStatsResponse {
  success: boolean;
  stats: {
    totalMembers: number;
    onlineMembers: number;
    channels: Array<{ id: string; name: string }>;
    serverName: string;
    inviteUrl: string;
  };
  error?: string;
}

export async function GET() {
  try {
    // Check admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const guildId = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID;

    if (!guildId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Discord Guild ID not configured',
          stats: {
            totalMembers: 0,
            onlineMembers: 0,
            channels: [],
            serverName: 'NexusMeme',
            inviteUrl: process.env.NEXT_PUBLIC_DISCORD_INVITE || '',
          }
        },
        { status: 200 }
      );
    }

    // Fetch Discord widget data (public endpoint, no auth needed)
    const widgetUrl = `https://discord.com/api/guilds/${guildId}/widget.json`;
    const response = await fetch(widgetUrl, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      // Widget might be disabled or guild ID incorrect
      console.error('Discord widget fetch failed:', response.status, response.statusText);
      return NextResponse.json(
        {
          success: false,
          error: 'Discord widget not available. Enable it in Server Settings → Widget',
          stats: {
            totalMembers: 0,
            onlineMembers: 0,
            channels: [],
            serverName: 'NexusMeme',
            inviteUrl: process.env.NEXT_PUBLIC_DISCORD_INVITE || '',
          }
        },
        { status: 200 }
      );
    }

    const widgetData: DiscordWidgetData = await response.json();

    // Extract stats from widget data
    const stats: DiscordStatsResponse['stats'] = {
      totalMembers: widgetData.members?.length || 0,
      onlineMembers: widgetData.presence_count || 0,
      channels: (widgetData.channels || []).map(ch => ({
        id: ch.id,
        name: ch.name,
      })),
      serverName: widgetData.name || 'NexusMeme',
      inviteUrl: widgetData.instant_invite || process.env.NEXT_PUBLIC_DISCORD_INVITE || '',
    };

    return NextResponse.json({
      success: true,
      stats,
    });

  } catch (error) {
    console.error('Discord stats API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch Discord stats',
        stats: {
          totalMembers: 0,
          onlineMembers: 0,
          channels: [],
          serverName: 'NexusMeme',
          inviteUrl: process.env.NEXT_PUBLIC_DISCORD_INVITE || '',
        }
      },
      { status: 500 }
    );
  }
}
