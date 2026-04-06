'use client';

import { useEffect } from 'react';

/**
 * Polls /api/ping every 3s to detect server restarts.
 * When the server nonce changes, reloads the page so the new
 * orchestrator instance starts and the UI reflects fresh state.
 * Mounted in the root layout so it works on every page.
 */
export function ServerRestartDetector() {
  useEffect(() => {
    let knownId: string | null = null;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/ping', { cache: 'no-store' });
        const { id } = await res.json();
        if (knownId === null) {
          knownId = id;
        } else if (id !== knownId) {
          window.location.href = '/dashboard/trading';
        }
      } catch {
        // Server unreachable — retry next tick
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return null;
}
