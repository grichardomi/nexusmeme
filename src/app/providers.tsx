'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ServiceWorkerRegister />
        {children}
      </SessionProvider>
    </ThemeProvider>
  );
}
