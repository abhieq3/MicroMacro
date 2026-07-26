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
[vercel.com/new](https://vercel.com/new)). Set three environment variables:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | your Atlas connection string |
| `JWT_SECRET` | a long random secret — `openssl rand -base64 48` |
| `ALLOW_PUBLIC_REGISTRATION` | `true` — **only while you create the first account** (step 3), then delete it and redeploy |

Deploy. That's the whole required configuration.

**3. First account — in the browser.**
Open your deployment. On an empty database the login page drops straight into
**Set up workspace** — create the first account (it becomes a lead). No shell,
no seed script, no config file.

Then go back to Vercel and **delete `ALLOW_PUBLIC_REGISTRATION`** (and
redeploy). It's a deliberate safety latch: without it, registration stays
closed even if the database is ever emptied — an empty user collection must
never mean "anyone can sign up as the owner." Every account after the first
comes from an invite inside the app, so you won't need the flag again.

You now have a private Pragati: dashboard, projects, teams, My Day,
whiteboard, bird's-eye view, installable PWA, the morning-priority spotlight —
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

## On your own domain (e.g. beside a personal site)

If you already own a domain (say your blog lives at `example.com`), the natural
home for a private instance is a subdomain — `pragati.example.com` — so your
workspace lives under a name you own, reachable from anywhere, with your blog
untouched:

1. Deploy your instance (button above, or import your fork at
   [vercel.com/new](https://vercel.com/new) into **your personal** Vercel
   account — separate account = separate billing, logs, and access from any
   org you belong to).
2. Vercel → your Pragati project → **Settings → Domains** → add
   `pragati.example.com`. Vercel shows the DNS record to create — one CNAME
   (`pragati` → `cname.vercel-dns.com`) at your DNS provider.
3. Set `APP_URL=https://pragati.example.com` in the project's env vars and
   redeploy, so email links and the calendar feed use your domain.
4. Optional nicety: add a redirect on your main site (e.g.
   `example.com/pragati` → `https://pragati.example.com`) so you only ever
   have to remember one domain.

**Privacy model:** the instance is private because *you hold the only
account*. There is no public registration — nobody can sign up, and nothing is
readable without signing in. The URL being guessable doesn't matter; the auth
is what protects it (plus your own database, which no one else can reach).

## Using it solo — e.g. "track my IELTS exam on 25 July"

Pragati's team machinery is optional. A single person gets the full operating
system — here's the two-minute setup for a fixed-date exam:

1. **New project → toggle "Personal project"** (personal projects are private
   to you — even admins on a shared instance can never see them).
2. Pick the **Study Plan** template for a ready-made spine (Setup → Learn →
   Apply → Assess), or start **Blank** and add your own phases — a mock every
   Saturday, a daily drill, a final-week taper.
3. Set the **project due date to 25 July** and give each task its own date —
   e.g. mocks on the Saturdays before, review tasks after each, light-only
   review in the last five days. Work backwards from the exam.

Then the system runs the ritual for you:

- **Up Next** and **My Tasks** surface overdue and due-soon work first — no
  separate spotlight banner; the board is the priority list.
- The **sidebar calendar** dots every practice date; the **forecast chip** on
  the project tells you the likely finish — and the *speed-of-light* date it
  could be if nothing queued.
- Turn on the **morning brief** and the day's study task is in your inbox at
  08:30 — one task to start, no fluff.
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
