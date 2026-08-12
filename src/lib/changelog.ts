/**
 * Pragati release history — the source of truth for the in-app Changelog page.
 *
 * Append a new entry at the TOP of `CHANGELOG` whenever a feature ships,
 * keeping the list in reverse-chronological order. The admin-only
 * /audit/changelog route renders directly off this array, so a code review
 * doubles as the release-notes review.
 *
 * Why a TS module instead of a CMS or markdown file: keeps the changelog
 * versioned alongside the code, gives type-safe references to the entry
 * shape, and ships with the bundle (no runtime fetch, no CDN).
 */

export type ChangelogTag =
  | 'feature' // New capability added
  | 'improvement' // Refinement of existing capability
  | 'fix' // Bug fix
  | 'security' // Security or compliance change
  | 'admin'; // Admin-only / workspace-level change

export interface ChangelogEntry {
  date: string; // ISO date (yyyy-mm-dd)
  title: string; // One-line headline
  body: string[]; // Bullets, plain text
  tags: ChangelogTag[];
  // Optional highlight banner — when set, the entry renders with a colour
  // accent so the visual scanner catches it (e.g. major releases).
  highlight?: boolean;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-06-25',
    title: 'Quality (QMS) tracking is now a generic, configurable tracker',
    tags: ['feature', 'improvement'],
    highlight: true,
    body: [
      'The Quality (QMS) module is no longer shaped around any one team’s process. Each tracker sheet now defines its own columns: add, rename, or remove the steps a record moves through, so the same module serves a validation checklist, an approval flow, an onboarding tracker, or a support-process pipeline — whatever the team needs.',
      'All domain-specific wording has been replaced with neutral terms: a sheet has a Reference and an optional Reference 2; rows have an Item (reference + name) and a Note; each column cell records a Reference, a Date, and a Status. New sheets start with three editable default columns (Draft / Review / Approval).',
      'Existing sheets are untouched — those created before columns were configurable keep their original layout automatically, and their data continues to render and export as before.',
    ],
  },
  {
    date: '2026-06-24',
    title: 'Login quotes: Elon Musk and the canon he admires',
    tags: ['improvement'],
    body: [
      'The rotating login quote is now drawn from Elon Musk — his own documented words and five-step engineering “algorithm” (question the requirement, delete before you optimize, simplify, accelerate, automate last) — together with the books and authors that shaped him (Isaac Asimov’s Foundation, Douglas Adams, Robert Heinlein, J.R.R. Tolkien, Peter Thiel’s Zero to One) and the inventors and leaders he names as heroes (Nikola Tesla, Benjamin Franklin, Isaac Newton, Henry Ford, Richard Feynman, Albert Einstein, Steve Jobs, Winston Churchill). Curated to what Pragati is for: building, shipping, focus, finishing, and deleting the unessential.',
      'As always, no attribution is ever shown — the words stand alone. The library ships with the app (no feed, no CMS) and never repeats a line on a device until the whole set has cycled.',
    ],
  },
  {
    date: '2026-06-24',
    title: 'Cleaner login & generic team Quality (QMS) tracking',
    tags: ['improvement'],
    body: [
      'The login screen no longer shows the first-run “Welcome to Pragati / Set up your workspace” banner. A brand-new, empty workspace now opens straight into the create-the-first-account form; an existing workspace shows a clean sign-in.',
      'A team’s Quality (QMS) tracking module is now presented as a generic quality-tracking section — “Quality tracking”, with one record per change control — rather than being framed around any single team’s spreadsheet. The underlying tracker is unchanged.',
    ],
  },
  {
    date: '2026-06-22',
    title: 'Public demo accounts can no longer be locked out',
    tags: ['fix', 'security'],
    body: [
      'The read-only demo accounts (whose password is published in the README) are now exempt from the brute-force lockout. Because the password is intentionally public, the lockout secured nothing for them and only handed any visitor a way to take the live demo down — five wrong passwords would lock the shared account until an admin cleared it by hand, and the lockout wall then refused even the correct, published password.',
      'Demo logins no longer accrue failed-attempt counts, so they can never lock; and a successful demo login now clears any lock an earlier visitor left behind, so the demo self-heals. Real accounts are unaffected — they keep the full five-attempt lockout. The demo-account pattern (demo.*@pragati.local) is now shared between the seed and the auth path so the two can never disagree.',
    ],
  },
  {
    date: '2026-06-22',
    title: 'Login quotes: re-sourced to Elon Musk and the books he recommends',
    tags: ['improvement'],
    body: [
      'The rotating login quote is now drawn exclusively from Elon Musk’s own documented words — his five-step engineering “algorithm” (question the requirement, delete before you optimize, simplify, accelerate, automate last) chief among them — and the books he has publicly recommended (Douglas Adams’ The Hitchhiker’s Guide to the Galaxy, Asimov’s Foundation). Same theme as before: lines that map to getting work shipped, not wealth or career in the abstract.',
      'Every line was checked against multiple independent sources before inclusion — the login screen is public, so nothing is trusted from memory. As always, no attribution is ever shown: the words stand alone.',
      'Simplified the plumbing behind it: the optional live-feed system (a public API route, an in-memory cache, and the QUOTES_FEED_URL env var that let the quote library be swapped without a redeploy) has been deleted. The curated library now ships with the app and nothing else — fewer moving parts, one less public endpoint, same screen.',
    ],
  },
  {
    date: '2026-06-15',
    title: 'Login screen: quotes on doing the work',
    tags: ['improvement', 'fix'],
    body: [
      'The rotating login quote is now curated to what Pragati is for — doing the work: action over talk, focus on the one thing in front of you, cutting the unessential, and compounding small daily progress into delivery. Drawn from Naval Ravikant and the books he recommends (Munger, Marcus Aurelius, Seneca, Bruce Lee, James Clear, Feynman, Deutsch), keeping only the lines that speak to execution — not wealth or career in the abstract.',
      'Fixed the repeat: the page used to re-open on the same daily quote on every visit (and never record it as seen). It now advances to a line this device hasn’t shown yet and remembers it, so no quote returns until every other one has had its turn — and never two in a row.',
    ],
  },
  {
    date: '2026-06-15',
    title: 'Bird’s-eye: real slip-risk model, single/double-click, drag fix',
    tags: ['feature', 'fix', 'improvement'],
    body: [
      'The time-simulation “HEAT %” is now a calibrated logistic slip-risk probability (engineered features → log-odds → sigmoid, the same model family as the slip-risk early warning) instead of an ad-hoc point sum — so the number is an interpretable probability, and advancing the +1d/+3d/+7d horizon genuinely re-forecasts each task’s chance of slipping rather than re-bucketing a counter.',
      'A single click on any node now opens/hides its branch; a double-click opens that node’s detail page. Dragging a node toward the top-left no longer pushes it off-canvas and breaks the view.',
    ],
  },
  {
    date: '2026-06-15',
    title: 'One daily brief at 08:30; crisper login avatars',
    tags: ['improvement', 'fix'],
    body: [
      'The daily email now goes to everyone at a single fixed time — 08:30 (workspace timezone), every morning, even on a clear day. The per-user send-time picker is gone: one predictable brief, and the fragile per-user hour-matching is deleted with it.',
      'Each brief now opens with an executive top-line — the shape of the day in one sentence, leading with the move that matters, before any list.',
      'Polished the returning-user avatars (the Quick-PIN “welcome back” screen and the post-unlock loading veil) into a clean circular photo with a crisp brand-gradient ring.',
    ],
  },
  {
    date: '2026-06-15',
    title: 'Team page repair + bird’s-eye / My Day polish; delete dead multi-tenant code',
    tags: ['fix', 'improvement'],
    body: [
      'Fixed the team detail header (a bad merge had corrupted the avatar markup and left two duplicate Export/bird’s-eye controls) — it now renders one clean Export and a single, minimal hero.',
      'The bird’s-eye view opens with tasks expanded for a team or project — the work is visible immediately instead of a near-empty canvas with one collapsed count. Only the all-teams workspace view still opens collapsed.',
      'My Day: swapped the Whiteboard and Notes floating buttons, and the whiteboard now opens full-screen.',
      'Deleted dead code: the unused multi-tenant scaffolding (no document ever carried a tenantId) and a stale diagnostic CI workflow.',
    ],
  },
  {
    date: '2026-06-15',
    title: 'Reliability & performance hardening (first-principles audit)',
    tags: ['fix', 'improvement', 'security'],
    body: [
      'QA sign-off is now an atomic, one-time act — a concurrent double-sign can no longer overwrite the first signer’s e-signature (21 CFR Part 11 §11.70).',
      '“My tasks” and the team board now bound and project their task queries, and a new index on subtasks.assigneeId turns the “my subtasks” lookup from a collection scan into an index seek — no more unbounded reads as task history grows.',
      'The daily-email settings now warn when the scheduled trigger looks stale (hasn’t run in over an hour), so a paused cron/Action fails loudly instead of silently dropping everyone’s digest.',
      'Removed dead export scaffolding from the bird’s-eye view.',
    ],
  },
  {
    date: '2026-06-15',
    title: 'Bird’s-eye view: one-click SVG/PNG export, copy-to-clipboard',
    tags: ['feature', 'improvement'],
    body: [
      'The Export menu’s “Bird Eye View · SVG” now downloads the map directly instead of opening the viewer, and a new “· PNG” option exports a crisp 2× image — both rendered headlessly from the same data, with the whole tree expanded so the file is complete.',
      'Inside the viewer, the single SVG button became an export group: vector SVG, high-res PNG, or copy the image straight to your clipboard to paste into a deck or chat.',
    ],
  },
  {
    date: '2026-06-14',
    title: 'Delivery Foresight — a predictive read on profiles, briefs and teams',
    tags: ['feature', 'improvement'],
    highlight: true,
    body: [
      'Profiles and the daily email now carry Delivery Foresight: a forward-looking, plain-language read on whether your dates will hold — “on pace to clear your plate by ~Jun 20”, or “this task is trending to miss its date — start it today”.',
      'Behind one quiet line sits a real model: log-normal duration fits with empirical-Bayes shrinkage, Holt’s-linear velocity forecasting, an inter-completion-gap throughput model, a seeded Monte-Carlo schedule simulation, and a robust MAD control-chart anomaly detector — fully deterministic and auditable, with no LLM on the path.',
      'Team detail pages get a redesigned hero (function-tinted cover, summary strip) plus a Team Foresight panel — each member’s pace vs. their plate rolled into one capacity read, with the people to look at first floated to the top. Lead/admin only, shared work only.',
      'My Day opens with a Foresight strip — a “start here” pointer at the one task most likely to slip — and the Settings profile now shows the same impact tiles (delivered, this year, projects, streak) as the public profile.',
      'Your own profile and brief get the full forecast (plate-clear date and the single riskiest task); a colleague’s profile shows only your delivery rhythm and reliability, never your current workload.',
      'Retired the profile Highlights (story-style cards) in favour of this — substance over a status update.',
    ],
  },
  {
    date: '2026-05-31',
    title: 'Monogram avatars, personal templates, kanban drop sound',
    tags: ['feature', 'improvement'],
    highlight: true,
    body: [
      'Profile avatars are now Google-style monograms — pick a letter, colour, and font (with an "Inspire me" shuffle). Updates propagate to every surface where the user is shown.',
      'New "Personal" workflow templates (Goal, Study Plan, Habit, Side Project, Event Planner) appear when the Personal-project toggle is on.',
      'Drag-drop interactions on the dashboard and kanban board now play a short audible cue — togglable per user.',
      'Dark-mode contrast fixes on workflow template cards.',
    ],
  },
  {
    date: '2026-05-30',
    title: 'Mobile layout polish + dark-mode activity heatmap',
    tags: ['improvement', 'fix'],
    body: [
      'Dashboard, Projects list and Profile pages tightened for phone-sized viewports — titles no longer truncate to "BOT Automa…", filters stack full-width.',
      'Activity heatmap palette switches with the theme — no more wall of white cells in dark mode.',
    ],
  },
  {
    date: '2026-05-29',
    title: 'Production error monitoring + activity scoring',
    tags: ['admin', 'feature'],
    body: [
      'Admin profile now surfaces a live error monitor for the last 30 days of caught application errors (ErrorLog model, 30-day TTL).',
      'Activity contributions are weighted by on-time delivery, GxP-criticality, priority, and review work — logins no longer count.',
    ],
  },
  {
    date: '2026-05-28',
    title: 'Team report — branded header + CSV export',
    tags: ['feature'],
    body: ['Lead team-report exports to CSV with a branded Pragati header for sharing with management.'],
  },
  {
    date: '2026-05-27',
    title: 'Quick PIN + trusted devices',
    tags: ['security'],
    body: [
      'Devices that completed a full sign-in can now re-unlock with a 4-digit PIN. The first sign-in on any device still requires the full credential, preserving 21 CFR Part 11 §11.10(d) access control.',
    ],
  },
  {
    date: '2026-05-25',
    title: 'GAMP 5 / CSV lifecycle templates',
    tags: ['feature'],
    body: [
      'New project templates for CSV / GAMP 5, SOP Development, Audit, and Validation. Each ships with regulatory references and pre-built phases & tasks.',
    ],
  },
];

// Visual metadata for the tag chips — kept beside the data so the changelog
// page renders without prop drilling.
export const CHANGELOG_TAG_META: Record<ChangelogTag, { label: string; bg: string; text: string }> = {
  feature: {
    label: 'New',
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  improvement: {
    label: 'Improved',
    bg: 'bg-blue-50    dark:bg-blue-500/15',
    text: 'text-blue-700    dark:text-blue-300',
  },
  fix: {
    label: 'Fixed',
    bg: 'bg-amber-50   dark:bg-amber-500/15',
    text: 'text-amber-700   dark:text-amber-300',
  },
  security: {
    label: 'Security',
    bg: 'bg-rose-50    dark:bg-rose-500/15',
    text: 'text-rose-700    dark:text-rose-300',
  },
  admin: {
    label: 'Admin',
    bg: 'bg-violet-50  dark:bg-violet-500/15',
    text: 'text-violet-700  dark:text-violet-300',
  },
};
