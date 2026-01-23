/**
 * App Initializer Component
 * Runs server-side initialization on first render
 * Handles background job processing setup
 */

import { initializeApp } from '@/lib/init';

export async function AppInitializer() {
  try {
    // This runs on the server and initializes background job processing
    await initializeApp();
  } catch (error) {
    // Log but don't throw - allow app to continue
    console.error('AppInitializer error:', error);
  }

  // This component doesn't render anything
  return null;
}
