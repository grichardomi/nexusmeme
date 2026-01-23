'use client';

import { useEffect } from 'react';

/**
 * Service Worker Registration Component
 * Registers the service worker for PWA functionality and offline support
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Register service worker only in browser and production
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Use stale cache from sw.js, update in background
      navigator.serviceWorker
        .register('/sw.js', {
          scope: '/',
        })
        .then((registration) => {
          console.log('✓ Service worker registered');

          // Check for updates in the background
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available, notify user (optional)
                  console.log('App update available - refresh to see changes');
                }
              });
            }
          });

          // Poll for updates every hour
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
        })
        .catch((err) => {
          console.warn('Service worker registration failed:', err);
        });
    }
  }, []);

  return null;
}
