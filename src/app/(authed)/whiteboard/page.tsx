import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import WhiteboardPageClient from './WhiteboardPageClient';

export const metadata: Metadata = { title: 'Think — Pragati' };

/**
 * One living board per project. The team sees it. Text boxes become tasks.
 */
export default async function WhiteboardPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');
  return (
    <Suspense fallback={null}>
      <WhiteboardPageClient />
    </Suspense>
  );
}
