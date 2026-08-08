import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { ToastProvider } from '@/components/Toast';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  title: {
    default: 'Pragati',
    template: '%s · Pragati',
  },
  description: 'Team work, fully visible. Track projects and tasks across your organization.',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  applicationName: 'Pragati',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pragati',
  },
  formatDetection: {
    telephone: false,
  },
  // Explicit icons so the tab mark is never missing (Next file icons + PNGs).
  icons: {
    icon: [
      { url: '/icons/favicon-16.png?v=classic-blue', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png?v=classic-blue', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png?v=classic-blue', sizes: '192x192', type: 'image/png' },
      { url: '/icon.svg?v=classic-blue', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png?v=classic-blue', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/icons/favicon-32.png?v=classic-blue'],
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#1f1e1d' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Classic brand: light office canvas. Dark opt-in.
  const theme = cookies().get('pragati_theme')?.value;
  const dark = theme === 'dark';

  return (
    <html lang="en" className={dark ? 'dark' : undefined}>
      <head />
      <body>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
