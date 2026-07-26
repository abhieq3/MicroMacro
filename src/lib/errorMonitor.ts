import { connectDB } from '@/lib/db';
import { ErrorLog } from '@/models/ErrorLog';

export interface CaptureInput {
  source?: 'server' | 'client';
  message: string;
  stack?: string;
  digest?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  userId?: string | null;
  userName?: string | null;
}

/**
 * Optional outbound webhook (Slack, Discord, custom collector, Sentry-style
 * relay). Set ERROR_WEBHOOK_URL to a POST endpoint that accepts JSON. Never
 * blocks the request path — fire-and-forget with a hard timeout.
 */
async function notifyWebhook(input: CaptureInput & { message: string }): Promise<void> {
  const url = process.env.ERROR_WEBHOOK_URL?.trim();
  if (!url) return;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[Pragati ${input.source || 'server'}] ${input.message}`,
        source: input.source || 'server',
        message: input.message,
        path: input.path || '',
        method: input.method || '',
        statusCode: input.statusCode ?? 500,
        userName: input.userName || '',
        digest: input.digest || '',
        // Truncate stack for chat relays; full stack stays in Mongo.
        stack: (input.stack || '').slice(0, 1500),
        at: new Date().toISOString(),
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch {
    // Webhook failure is non-fatal.
  } finally {
    clearTimeout(t);
  }
}

/**
 * Persist a production error for admin monitoring. Best-effort and fully
 * self-contained: it opens its own DB connection and never throws, so a logging
 * failure can never turn into a second error on the request path.
 *
 * Repeated occurrences of the same message are rolled up (count++, lastSeenAt)
 * within a short window rather than flooding the collection, so the admin view
 * shows "this broke 42 times" instead of 42 identical rows.
 *
 * When ERROR_WEBHOOK_URL is set, the first occurrence in a rollup window also
 * pings the webhook so on-call sees it without opening the admin console.
 */
export async function captureError(input: CaptureInput): Promise<void> {
  try {
    const message = (input.message || 'Unknown error').slice(0, 1000);
    await connectDB();

    // Roll up an identical, recent, unacknowledged signature.
    const since = new Date(Date.now() - 1000 * 60 * 60); // 1 hour window
    const existing = await ErrorLog.findOneAndUpdate(
      { message, source: input.source || 'server', acknowledged: false, lastSeenAt: { $gte: since } },
      { $inc: { count: 1 }, $set: { lastSeenAt: new Date() } },
      { new: true },
    );
    if (existing) return;

    await ErrorLog.create({
      source: input.source || 'server',
      message,
      stack: (input.stack || '').slice(0, 8000),
      digest: input.digest || '',
      path: input.path || '',
      method: input.method || '',
      statusCode: input.statusCode ?? 500,
      userId: input.userId || undefined,
      userName: input.userName || '',
      lastSeenAt: new Date(),
    });

    // Only the first occurrence of a signature notifies — avoids webhook spam.
    void notifyWebhook({ ...input, message });
  } catch {
    // Swallow — monitoring must never break the request it is monitoring.
  }
}
