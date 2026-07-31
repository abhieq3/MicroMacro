import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import WhiteboardPageClient from './WhiteboardPageClient';

export const metadata: Metadata = { title: 'Whiteboard' };

/** Private sketch board for the signed-in user. */
export default async function WhiteboardPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');
  return <WhiteboardPageClient />;
}
