import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import WhiteboardPageClient from './WhiteboardPageClient';

export const metadata: Metadata = { title: 'Whiteboard — Pragati' };

/**
 * /whiteboard — the thinking surface, first-class for every role.
 *
 * The whole app runs on the NVIDIA meeting rule: no slides, no deck — you
 * stand at a whiteboard and reason from first principles, in front of
 * everyone, in real time. A slide shows a conclusion; a whiteboard shows
 * *thinking*. And when the problem is solved you wipe it clean — the board
 * (like the plan) is never precious.
 *
 * The board itself is owner-private (a place to think, not a record), which
 * is exactly what makes people willing to think honestly on it.
 */
export default async function WhiteboardPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');
  return <WhiteboardPageClient />;
}
