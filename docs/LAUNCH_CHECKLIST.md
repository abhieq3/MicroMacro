# Pragati — Production launch runbook

This is the **single source of truth** for opening the workspace to real users.
Top-to-bottom, no skipping. Twenty-five minutes start to finish if everything
is in order.

> If anything below fails, stop and fix it before opening. The cost of a
> 30-minute delay is zero; the cost of a public security incident on day one
> is not.

---

## 1. Deploy the readiness branch

Open https://github.com/abhieq31/Pragati/pulls and merge the latest
hardening / readiness PR into `main`. Vercel will redeploy automatically —
wait for the green check on the deployment dashboard before continuing.

Confirmed: ☐

---

## 2. Production environment variables

In **Vercel → Settings → Environment Variables → Production**, confirm:

| Name | Value | Required? |
|---|---|---|
| `MONGODB_URI` | Atlas connection string | **YES** |
| `JWT_SECRET` | Output of `openssl rand -base64 48` (≥16 chars) | **YES — refuses to sign tokens otherwise** |
| `ADMIN_EMAIL` | Your admin login email | **YES** — no hardcoded fallback |
| `GEMINI_API_KEY` | Your Gemini key | Optional (brief polish only; scoring never uses LLM) |
| `ADMIN_BOOTSTRAP_TOKEN` | **UNSET** | Only set when you specifically need `/bootstrap`; delete + redeploy immediately after. |
| `ALLOW_PUBLIC_REGISTRATION` | **UNSET** | Never set in production. Public sign-up is permanently off. |
| `PRAGATI_PREDICTABLE_DEFAULT_PASSWORD` | **UNSET** | Leave unset so create/reset use random one-time temps. |
| `ERROR_WEBHOOK_URL` | Slack/Discord/custom webhook | Optional — first error signature pings ops. |
| `NEXT_PUBLIC_FOCUS_MODE` | `1` for mission-only UI | Optional — hides whiteboard + workbench modules. |

Re-deploy once after any change so the new values take effect.

Confirmed: ☐

---

## 3. Automated smoke test

From any machine with Node (your laptop is fine), run:

```bash
git clone https://github.com/abhieq31/Pragati && cd Pragati
npm install
npm run smoke-prod https://pragatialm.vercel.app
```

The script checks the four things that absolutely must be true before opening:

- ✓ `/api/health` returns 200 with `db: up` and latency < 1 s
- ✓ `/bootstrap` returns **404** (the safe state — token unset)
- ✓ `/api/admin/bootstrap` returns 404
- ✓ `/api/auth/register` returns 403 (public sign-up off)
- ✓ Security headers are present (CSP, X-Frame-Options, HSTS, etc.)

Expected output: `✓ All checks passed. Safe to open the workspace.`

If any line says **FAIL**, the script exits non-zero. Fix before opening.

Confirmed: ☐

---

## 4. Manual smoke (in Chrome, as you)

These need a real browser because they touch authenticated paths.

| # | Action | Expected |
|---|---|---|
| 4.1 | Open `https://pragatialm.vercel.app/login` | Pragati gradient mark, no corporate logo |
| 4.2 | Sign in as the account set in `ADMIN_EMAIL` | Sidebar footer reads **"Workspace Admin"**, full nav (Dashboard, Projects, Team, People) |
| 4.3 | Dashboard | Greeting hero shows shimmering blue→green title, summary chips, project rows |
| 4.4 | Projects → pick MES project → **Archive project** → confirm | Yellow "Archived" pill appears; project disappears from Dashboard and Projects/Active list |
| 4.5 | Projects → **Archived** tab → restore | Pill gone, project re-appears in Active |
| 4.6 | People → pick a lead → **Reset password** | `Pragati-XXXX` temp password modal appears |
| 4.7 | People → try to **Remove** the workspace admin (yourself) | "You cannot remove your own account." (403) |
| 4.8 | Sign out → try a wrong password 5 times against your account | 6th attempt rejected with the same generic "Invalid email or password" |
| 4.9 | Sign back in as a different lead → People → Unlock your account | Pill clears, account can sign in again |
| 4.10 | Open a project → **Export to Excel** | File opens in Excel/LibreOffice without formula warnings |

Confirmed: ☐

---

## 5. Uptime monitor

Point any uptime service at `https://pragatialm.vercel.app/api/health` with:

- **Interval**: 60 seconds
- **Expected status**: 200
- **Expected body contains**: `"db":"up"`
- **Alert when**: 2 consecutive failures (avoids paging on a single transient)

Recommended free tiers: **BetterUptime**, **UptimeRobot**, **Vercel's built-in monitoring**.

Confirmed: ☐

---

## 6. Operational notes for day one

- **Lockouts**: 5 wrong passwords → account locked. Any lead/admin can click
  **Unlock** on the People page. Resetting the password also clears the lock.
- **Adding new leads**: People page → **+ Add lead** → email + name. Pragati
  generates a temp password (`Pragati-XXXX`); copy and share over chat.
- **Adding contributors to a team**: Teams → click team → **+ Add member**.
  Once on the team, they automatically see every project assigned to that
  team. There is no separate permissions surface — by design.
- **Archiving vs deleting**: Archive hides a project from the dashboard and
  default lists but preserves it (and all tasks) for audit. Delete is
  permanent and requires the deleter's password.
- **Onboarding tour**: Fires once for each fresh lead, then never again
  (stored server-side as `User.hasSeenTour`).

---

## 7. Rollback procedure

If something breaks within the first hour:

```bash
git fetch origin main
git log --oneline -5 origin/main      # find the last known-good SHA
git revert <bad-sha>                  # creates a new commit reverting the bad one
git push origin main                  # Vercel auto-redeploys (~60 s)
```

Then re-run `npm run smoke-prod https://pragatialm.vercel.app` to confirm
the rollback succeeded.

For data damage, restore from the most recent Atlas snapshot (Atlas →
your cluster → Backup → Restore). Atlas keeps daily snapshots by default;
verify retention on the cluster's Backup tab.

---

## 8. Post-launch (do within 48 hours)

- Set `ERROR_WEBHOOK_URL` (Slack/Discord) so first error signatures page
  someone — errors already persist in Mongo (`ErrorLog`) and the admin
  console; the webhook is the on-call path.
- Confirm `npm run smoke-prod` is on a scheduled GitHub Action
  (`.github/workflows/smoke-prod.yml`) so production-safe state is checked
  at least daily.
- Confirm `ADMIN_EMAIL` is set (no personal-email fallback in the repo).
- Replace `src/lib/rateLimit.ts` (in-memory) with Upstash Redis once you
  scale beyond a single Vercel region.
- Watch Vercel Speed Insights: target RES ≥ 90, LCP ≤ 2.5s — keep splitting
  large client components if budgets regress.

---

**Go / no-go authority: you. The runbook above is everything I can do from code.**
