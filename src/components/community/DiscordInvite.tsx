'use client';

import { useState, useEffect } from 'react';

/**
 * Discord Invite Component
 * Prominent call-to-action to join Discord community
 * Shows online member count and quick join button
 */

interface DiscordInviteProps {
  /** Variant style */
  variant?: 'banner' | 'card' | 'compact';
  /** Custom className */
  className?: string;
  /** Show online members count */
  showOnlineCount?: boolean;
}

interface DiscordWidgetData {
  success: boolean;
  totalMembers: number;
  onlineMembers: number;
  serverName: string;
  inviteUrl: string;
}

export function DiscordInvite({
  variant = 'card',
  className = '',
  showOnlineCount = true
}: DiscordInviteProps) {
  const [widgetData, setWidgetData] = useState<DiscordWidgetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const discordInvite = process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/psad3vBVmv';

  useEffect(() => {
    fetchWidgetData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchWidgetData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchWidgetData = async () => {
    try {
      const response = await fetch('/api/discord-widget');
      const data = await response.json();
      setWidgetData(data);
    } catch (error) {
      console.error('Failed to fetch Discord widget data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const memberCount = widgetData?.totalMembers || 0;
  const onlineCount = widgetData?.onlineMembers || 0;

  // Compact variant (for inline use)
  if (variant === 'compact') {
    return (
      <a
        href={discordInvite}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition font-semibold text-sm ${className}`}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
        Join Discord
      </a>
    );
  }

  // Banner variant (full width)
  if (variant === 'banner') {
    return (
      <div className={`bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-xl p-4 sm:p-6 ${className}`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-white">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </div>
            <div className="text-center sm:text-left">
              <h3 className="text-lg sm:text-xl font-bold mb-1">
                💬 Get instant help from the community
              </h3>
              <p className="text-sm sm:text-base text-indigo-100">
                {!isLoading && showOnlineCount && memberCount > 0 ? (
                  <>Join {memberCount.toLocaleString()} members • 🟢 {onlineCount.toLocaleString()} online</>
                ) : (
                  <>Join our community for real-time support and trading tips</>
                )}
              </p>
            </div>
          </div>
          <a
            href={discordInvite}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-white text-indigo-600 rounded-lg font-bold hover:bg-indigo-50 transition whitespace-nowrap shadow-lg flex items-center gap-2 touch-manipulation"
          >
            <span>Join Discord</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    );
  }

  // Card variant (default)
  return (
    <div className={`bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl p-6 text-white shadow-xl ${className}`}>
      <div className="flex items-start gap-4 mb-4">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold mb-2">Join the Community</h3>
          <p className="text-indigo-100 text-sm leading-relaxed">
            Get instant answers from experienced traders, share strategies, and stay updated with the latest features.
          </p>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Real-time support from community</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Trading strategy discussions</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Beta features & early access</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Announcements & updates</span>
        </div>
      </div>

      <a
        href={discordInvite}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full px-6 py-3 bg-white text-indigo-600 rounded-lg font-bold hover:bg-indigo-50 transition text-center shadow-lg touch-manipulation"
      >
        Join Discord Community →
      </a>

      {!isLoading && showOnlineCount && memberCount > 0 && (
        <p className="text-xs text-indigo-200 mt-3 text-center">
          🟢 {onlineCount.toLocaleString()} online • {memberCount.toLocaleString()} members
        </p>
      )}
    </div>
  );
}
