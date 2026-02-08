'use client';

import { useState } from 'react';

/**
 * Discord Announcement Component
 * Allows admins to post announcements to Discord channels
 */

interface DiscordAnnouncementProps {
  onClose?: () => void;
  onSuccess?: () => void;
}

type ChannelType = 'announcements' | 'general' | 'beta-feedback';

export function DiscordAnnouncement({ onClose, onSuccess }: DiscordAnnouncementProps) {
  const [channelType, setChannelType] = useState<ChannelType>('announcements');
  const [useEmbed, setUseEmbed] = useState(true);
  const [embedTitle, setEmbedTitle] = useState('');
  const [message, setMessage] = useState('');
  const [embedColor, setEmbedColor] = useState('#5865F2'); // Discord blurple
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePost = async () => {
    if (!message.trim()) {
      setError('Message is required');
      return;
    }

    setIsPosting(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/discord-announce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          channelType,
          embedTitle: useEmbed ? embedTitle : undefined,
          embedDescription: useEmbed ? message : undefined,
          embedColor: useEmbed ? embedColor : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to post announcement');
      }

      setSuccess(true);
      setMessage('');
      setEmbedTitle('');
      setTimeout(() => {
        setSuccess(false);
        onSuccess?.();
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post announcement');
    } finally {
      setIsPosting(false);
    }
  };

  const channelOptions = [
    { value: 'announcements', label: '📢 Announcements', description: 'Important updates & news' },
    { value: 'general', label: '💬 General', description: 'Community discussions' },
    { value: 'beta-feedback', label: '🧪 Beta Feedback', description: 'Beta tester updates' },
  ];

  const colorPresets = [
    { name: 'Discord Blue', value: '#5865F2' },
    { name: 'Green', value: '#57F287' },
    { name: 'Yellow', value: '#FEE75C' },
    { name: 'Red', value: '#ED4245' },
    { name: 'Purple', value: '#9B59B6' },
  ];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Post to Discord
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
          >
            ✕
          </button>
        )}
      </div>

      {/* Success Message */}
      {success && (
        <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg flex items-center gap-2">
          <span className="text-xl">✓</span>
          <span>Posted to Discord successfully!</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Channel Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Channel
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {channelOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setChannelType(option.value as ChannelType)}
                className={`p-3 rounded-lg border-2 transition text-left ${
                  channelType === option.value
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="font-semibold text-sm text-slate-900 dark:text-white">
                  {option.label}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Use Embed Toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="useEmbed"
            checked={useEmbed}
            onChange={(e) => setUseEmbed(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="useEmbed" className="text-sm text-slate-700 dark:text-slate-300">
            Use rich embed (recommended)
          </label>
        </div>

        {/* Embed Title (if using embed) */}
        {useEmbed && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Title
            </label>
            <input
              type="text"
              value={embedTitle}
              onChange={(e) => setEmbedTitle(e.target.value)}
              placeholder="e.g., New Feature Released"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        )}

        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter your announcement message..."
            rows={6}
            className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {message.length} characters • Supports Discord markdown
          </p>
        </div>

        {/* Color Picker (if using embed) */}
        {useEmbed && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Embed Color
            </label>
            <div className="flex flex-wrap gap-2">
              {colorPresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setEmbedColor(preset.value)}
                  className={`px-3 py-2 rounded-lg border-2 transition text-xs font-medium ${
                    embedColor === preset.value
                      ? 'border-slate-900 dark:border-white'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                  style={{
                    backgroundColor: preset.value + '20',
                    color: preset.value,
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Preview */}
        {useEmbed && (message || embedTitle) && (
          <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Preview:</p>
            <div className="border-l-4 pl-3" style={{ borderColor: embedColor }}>
              {embedTitle && (
                <div className="font-bold text-slate-900 dark:text-white mb-1">
                  {embedTitle}
                </div>
              )}
              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {message}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition font-medium"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handlePost}
            disabled={isPosting || !message.trim()}
            className={`flex-1 px-4 py-2.5 rounded-lg font-bold transition ${
              isPosting || !message.trim()
                ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {isPosting ? 'Posting...' : 'Post to Discord'}
          </button>
        </div>
      </div>
    </div>
  );
}
