'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker for PWA offline support and caching.
 * Must be a client component — navigator.serviceWorker is browser-only.
 */
export function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then(reg => {
            // Check for updates every hour
            setInterval(() => reg.update(), 60 * 60 * 1000);
          })
          .catch(() => {
            // SW registration failed — app still works, just no offline support
          });
      });
    }
  }, []);

  return null;
}
