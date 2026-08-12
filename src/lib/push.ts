import { PushSubscription } from '@/models/PushSubscription';
import { digestTimeZone, localDateKey } from '@/lib/digest';

/**
 * Web Push via VAPID — the free-forever notification channel.
 *
 * Inert until the operator generates a key pair (`npx web-push
 * generate-vapid-keys`) and sets:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY – public key (safe to expose; the browser
 *                                  needs it to subscribe)
 *   VAPID_PRIVATE_KEY            – signing key (server only)
 *   VAPID_SUBJECT                – mailto: or https: contact (optional;
 *                                  defaults to a placeholder)
 *
 * Mirrors the mailer/cache pattern: unconfigured ⇒ transparent no-op, never
 * a crash. `web-push` is imported lazily so cold starts that never push pay
 * nothing for it.
 */

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open on click, e.g. "/" or "/my-day". */
  url?: string;
}

/**
 * Morning fan-out: one personalised push per subscribed user, carrying their
 * Daily Brief headline. Runs after the email digest in the same cron. The
 * same "silence is a feature" rule applies — users with nothing material get
 * nothing. Dynamic imports keep brief/user modules off the cold-start path.
 */
export async function sendDailyBriefPushes(
  opts: { now?: Date } = {},
): Promise<{ users: number; delivered: number }> {
  if (!pushConfigured()) return { users: 0, delivered: 0 };
  const { buildDailyBrief } = await import('@/lib/brief');
  const { User } = await import('@/models/User');
  const now = opts.now ?? new Date();
  const sentOn = localDateKey(now, digestTimeZone());

  const userIds = await PushSubscription.distinct('userId');
  let users = 0;
  let delivered = 0;
  for (const uid of userIds.slice(0, 500)) {
    const u = await User.findById(uid).select('role active lastBriefPushSentOn').lean();
    if (!u || (u as any).active === false) continue;
    if ((u as any).lastBriefPushSentOn === sentOn) continue;
    const claim = await User.updateOne(
      { _id: uid, lastBriefPushSentOn: { $ne: sentOn } },
      { $set: { lastBriefPushSentOn: sentOn } },
    );
    if (claim.modifiedCount !== 1) continue;
    const brief = await buildDailyBrief(String(uid), (u as any).role, now);
    if (!brief.hasContent) continue;
    users += 1;
    delivered += await sendPushToUser(String(uid), {
      title: 'Pragati — morning brief',
      body: brief.headline,
      url: '/',
    });
  }
  return { users, delivered };
}

/** Send `payload` to every subscription a user holds. Dead endpoints
 *  (404/410 from the push service) are deleted as we go. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  const subs = await PushSubscription.find({ userId }).lean();
  if (subs.length === 0) return 0;

  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@pragati.local',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  let delivered = 0;
  for (const s of subs as any[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        JSON.stringify(payload),
        { TTL: 12 * 60 * 60 }, // a daily brief is stale after half a day
      );
      delivered += 1;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: s._id }).catch(() => {});
      }
    }
  }
  return delivered;
}
