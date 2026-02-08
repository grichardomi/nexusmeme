import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const guildId = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID;

    if (!guildId) {
      return NextResponse.json({
        success: false,
        totalMembers: 0,
        onlineMembers: 0,
        serverName: 'NexusMeme',
        inviteUrl: process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/psad3vBVmv',
      });
    }

    // Fetch Discord widget data (public endpoint)
    const widgetUrl = `https://discord.com/api/guilds/${guildId}/widget.json`;
    const response = await fetch(widgetUrl, {
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!response.ok) {
      console.warn('Discord widget not available');
      return NextResponse.json({
        success: false,
        totalMembers: 0,
        onlineMembers: 0,
        serverName: 'NexusMeme',
        inviteUrl: process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/psad3vBVmv',
      });
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      totalMembers: data.members?.length || 0,
      onlineMembers: data.presence_count || 0,
      serverName: data.name || 'NexusMeme',
      inviteUrl: data.instant_invite || process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/psad3vBVmv',
    });

  } catch (error) {
    console.error('Discord widget API error:', error);
    return NextResponse.json({
      success: false,
      totalMembers: 0,
      onlineMembers: 0,
      serverName: 'NexusMeme',
      inviteUrl: process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/psad3vBVmv',
    });
  }
}
