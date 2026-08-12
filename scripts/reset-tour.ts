/**
 * Replay the guided onboarding tour for one user — sets `hasSeenTour: false`
 * so FirstTimeTour opens again on their next page load (and clears the
 * matching localStorage fast-path note below).
 *
 *   npx tsx scripts/reset-tour.ts <username-or-email>
 *
 * The tour is otherwise one-shot per account (the whole point is that new
 * users see it once); this is purely a manual override for re-recording demo
 * footage, QA, etc. After running it, also clear the browser's
 * `pragati-tour-v5` localStorage key for that account — the component checks
 * both the server flag and that fast-path note before opening.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';

async function main() {
  const handle = process.argv[2]?.toLowerCase().trim();
  if (!handle) {
    console.error('usage: tsx scripts/reset-tour.ts <username-or-email>');
    process.exit(1);
  }

  await connectDB();

  const target = await User.findOne({ $or: [{ username: handle }, { email: handle }] });
  if (!target) {
    console.error(`No user found with username/email "${handle}".`);
    process.exit(1);
  }

  target.hasSeenTour = false as any;
  await target.save();
  console.log(`Tour reset for ${target.email} (${target.username || 'no username'}).`);
  console.log("Also clear localStorage key 'pragati-tour-v5' in that browser before recording.");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
