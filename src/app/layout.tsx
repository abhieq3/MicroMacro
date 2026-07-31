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
  description: 'Everyone sees the whole board. Project intelligence without the noise.',
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
  icons: {
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dark-first. New cookie name so old light sessions don't stick.
  const theme = cookies().get('pragati_theme')?.value;
  const dark = theme !== 'light';

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
