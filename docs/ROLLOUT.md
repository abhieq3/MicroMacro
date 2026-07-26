# Pragati — team-lead rollout playbook

How to put Pragati into every team lead's hands without a training day.
Designed for a workspace of ~35 leads; one MES lead is already on it
end-to-end, so the playbook below is what they actually did, distilled.

## Week 0 — the day before they hear about it

You (admin):

1. Confirm the launch checklist (`docs/LAUNCH_CHECKLIST.md`) is green.
2. For every new lead you plan to invite, pre-create their team in
   `/teams` so the workspace looks lived-in on day one — empty
   sidebars feel like a beta.
3. Pre-create the **MES** team's projects so other leads see what
   "good" looks like when they open their own teams.

## Day 1 — onboarding a lead, in 4 minutes

For each lead, in order, in **People → + Add lead**:

1. Type their **full name** and **corporate username** (the part of
   their work email before the `@` — e.g. for `priya.sharma@company.com`
   you enter `priya.sharma`). Hit submit; Pragati generates a temp
   `Pragati-XXXX` password and shows it once. Copy it.
2. Share both lines over chat (not email): "Username `priya.sharma`,
   password `Pragati-XXXX`. Sign in at pragatialm.vercel.app — you'll
   be asked to set a real password on first login."
3. They sign in. The onboarding tour fires once, then never again.

**Why the username == corporate handle:** zero confusion for the lead
(it's the identifier they already know), zero accounts to keep in sync
with HR, and no email-format requirement so we never accidentally try
to mail them.

The lead now has admin-of-their-own-team scope: they can create their
team, add team members, create projects, and assign tasks.

## What a lead does in their first hour

This is the script we used with the MES lead. Have them do it in
this order; each step takes 30 - 90 seconds.

| # | They do | Why |
|---|---|---|
| 1 | Open **Team** in the sidebar. Click **+ Add team** if they don't already have one. | Without a team, no project rolls up to them. |
| 2 | On their team page, click **+ Add member**. Add every person on their team — either pick from existing names, or click **+ New contributor** to create a profile (name + title only; no login). | These names become the assignee dropdown for every task they'll create. |
| 3 | Open **Projects** → **+ New project**. Set name, code, lifecycle. Assign it to their team via the team selector. | Project visibility = team membership. |
| 4 | Open the new project. Use **+ Add task** to seed 5–10 known tasks. Pick assignees from the team-scoped list. | Day-one dashboard isn't empty. |
| 5 | Back to **Dashboard**. They should see "1 ongoing project · N open tasks · M overdue · K team". This is the view their manager will see. | The dashboard is the promise of the tool; it has to look populated. |

## Contributor sign-in — one-time password handoff

When an admin adds a team member they enter the person's **corporate
username** (the part before `@` in their work email), **employee ID**,
and a real notify email. The server returns a **one-time temporary
password** (`Pragati-…`) shown once in the UI — copy it and share over
chat (not email if your policy forbids secrets in mail).

On first sign-in the user **must** set their own password. The force-
password step is enforced in the UI **and** on every API call except the
password-change / logout endpoints — a temp session cannot mutate work.

```
Username:  their corporate handle (e.g. priya.sharma)
Password:  the one-time value from People → Add member (shown once)
```

If an account locks after 5 wrong attempts, unlock it from the People
page. Prefer **Reset password** when you need a fresh temp — never reuse
an old secret.

> **Legacy verbal convention** (`FirstName@employeeId`) is disabled by
> default. Only enable with `PRAGATI_PREDICTABLE_DEFAULT_PASSWORD=1` if
> you truly cannot show a one-time secret at create time.

## Roles, in one paragraph

- **Lead** — creates teams, projects, tasks; assigns work; full edit on
  everything in their teams.
- **Contributor** — signs in with their corporate username, sees their
  team's board read-only, and can update the **status, subtasks, and
  comments of tasks assigned to them** (nothing else). This is optional:
  add a contributor without ever giving them the password and they're
  just an assignable name.
- **Admin** (you) — sees every team/project/user; resets passwords and
  unlocks accounts.

## What we tell leads explicitly

- **Forgot your password?** Message the admin (you). Reset takes one
  click on the People page; you'll send a new `Pragati-XXXX`.
- **Locked out after 5 wrong attempts?** Same — message the admin.
  Unlock is one click. The admin doesn't see your real password and
  doesn't need to.
- **Contributors can update their own tasks.** If you want a team member
  to mark their own work done, share their username + temp password.
  If you'd rather keep status changes in your own hands, just don't hand
  out the password — the account still works as an assignable name.
- **Effort tracking lives behind a disclosure** on the task page.
  Open it when you need to log time; leave it shut the rest of the
  time. The day-to-day workflow is title + assignee + status + due.
- **Archiving** preserves the project and every task, including
  effort history. Restore from the **Archived** tab on Projects.
  Nothing is lost.

## Day 2-5 — what to watch

You (admin), from the People page:

- Anyone with a **Locked** pill = was guessing their password. Click
  Unlock, ping them to confirm they need a reset.
- Anyone with **0 projects + 0 tasks** = stalled onboarding. Reach out.
- Run `npm run smoke-prod https://pragatialm.vercel.app` once a day
  for the first week. If it fails, you see it before the team does.

## Week 2 and beyond

- Watch Speed Insights. If RES on `/` drops below 80, that's the
  signal to schedule the AppShell server-split (listed in section 8
  of `LAUNCH_CHECKLIST.md`).
- Add Sentry. Errors today land in Vercel logs only.
- Move `rateLimit.ts` to Upstash Redis once you have multi-region.

## When something is on fire

```bash
git fetch origin main
git log --oneline -10 origin/main      # find last known-good SHA
git revert <bad-sha>
git push origin main                   # Vercel auto-redeploys
npm run smoke-prod https://pragatialm.vercel.app
```

For data damage, restore from the most recent Atlas daily snapshot.

That's it. Keep the surface small.
