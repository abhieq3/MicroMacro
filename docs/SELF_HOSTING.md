# Self-hosting Pragati

Pragati is MIT-licensed and built to run on free tiers end to end. This is the
whole path — from zero to your own private instance — and then a walkthrough of
using it **solo** (no team required), e.g. tracking an exam.

The design principle throughout: **everything optional is inert until
configured.** The app builds, runs, and is fully usable with exactly two
environment variables. Email, push, Redis, AI — all off until you switch them
on, and nothing breaks while they're off.

## The 10-minute path (free, no shell)

**1. Database — MongoDB Atlas free tier (M0).**
Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas),
add a database user, allow access from anywhere (`0.0.0.0/0` — Vercel's
egress IPs vary), and copy the connection string.

**2. Deploy — Vercel free tier.**
Click the **Deploy** button in the README (or fork the repo and import it at
[vercel.com/new](https://vercel.com/new)). Set two environment variables:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | your Atlas connection string |
| `JWT_SECRET` | a long random secret — `openssl rand -base64 48` |

Deploy. That's the whole required configuration.

**3. First account — in the browser.**
Open your deployment. On an empty database the login page drops straight into
**Set up workspace** — create the first account (it becomes a lead). No shell,
no seed script, no config file.

You now have a private Pragati: dashboard, projects, teams, My Day,
whiteboard, bird's-eye view, Top 5 Things, the morning-priority spotlight —
all working.

### Optional extras (each one independent, each one free)

| Want | Do |
| --- | --- |
| Morning brief email (08:30) | Free [Brevo](https://www.brevo.com) key → `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `CRON_SECRET`, `APP_URL` — see the README's *Daily email digest* section |
| Browser push notifications | `npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| An admin role | `ADMIN_EMAIL=you@example.com` — that account gets admin on next sign-in |
| Demo data to explore | `npm run seed:demo` (and `-- --clean` to remove it) |
| AI copilot (chat only; scoring never uses AI) | `GEMINI_API_KEY` |

## Run it on your own machine instead

```bash
git clone https://github.com/abhipatelz/Pragati && cd Pragati
npm install

# Zero-setup: embedded in-memory MongoDB, nothing else needed
USE_IN_MEMORY_MONGO=true npm run dev     # http://localhost:3000
```

For a persistent local DB, `docker compose up -d` starts MongoDB 7 on
`localhost:27017`; put `MONGODB_URI=mongodb://localhost:27017/pragati` and a
`JWT_SECRET` in `.env.local` and run `npm run dev`.

## Using it solo — e.g. "track my IELTS exam on 25 July"

Pragati's team machinery is optional. A single person gets the full operating
system — here's the two-minute setup for a fixed-date exam:

1. **New project → toggle "Personal project"** (personal projects are private
   to you — even admins on a shared instance can never see them).
2. Pick the **Exam Countdown** template. It scaffolds the whole campaign,
   worked backwards from the date:
   - *Baseline* — book the exam, take an honest baseline mock, set the target
     score, plan backwards from exam day
   - *Drills* — weakest section first, daily habit, timed practice at exam pace
   - *Mocks & review* — full mocks under strict conditions; review every miss
     (misses teach more than scores)
   - *Final week* — light review only, logistics, full night's sleep
   - *Exam day* — sit it; you did the work
3. Set the **project due date to 25 July** and give each task its own date —
   e.g. mocks on the Saturdays before, final-week tasks in the last five days.

Then the system runs the ritual for you:

- Each morning, the **spotlight spawns** with the one pressing task — an
  IELTS mock due this week outranks everything else on your plate that day.
  Nothing spawns on a calm day; it never cries wolf.
- The **sidebar calendar** dots every practice date; **Up Next** shows the
  week; the **forecast chip** on the project tells you the likely finish —
  and the *speed-of-light* date it could be if nothing queued.
- Turn on the **morning brief** and the day's study task is in your inbox at
  08:30 with "Your morning priority" on top.
- Sketch essay outlines or speaking-part-2 maps on the **Whiteboard** (`G→W`)
  — wipe it clean when a problem is solved.
- Evenings, My Day stops pushing and points you home. Sleep is part of the
  plan; it's literally a task in the final week.

The same pattern works for anything with a hard date — a thesis defence, a
certification, a product launch of one.

## What self-hosters should know

- **Auth is self-contained** — JWT + bcrypt + httpOnly cookies. No third-party
  identity provider, nothing to sign up for.
- **Invite-only by design** — there is no public registration endpoint; the
  workspace owner creates accounts. Good default for a private instance.
- **Your data is yours** — one MongoDB database, exportable with standard
  tools; project/team exports (xlsx/CSV/PDF) built in.
- **Upgrades** — pull the repo, redeploy. Schema changes are additive; the
  models create their own indexes.
- **Security basics** — set a long `JWT_SECRET`, keep it secret, and prefer
  Atlas IP allow-listing narrowed to your platform's egress ranges where
  practical.
