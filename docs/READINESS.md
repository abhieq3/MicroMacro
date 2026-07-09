# Pragati — readiness principles

What "ready" means for this product, decided from first principles — not a
feature checklist.

## 1. Identity must not be computable from public data

A password derived from `name + employeeId` turns every org directory into a
login dictionary. **Default: random one-time temps**, shown once to the admin,
with `mustChangePassword` enforced on the **server** (`requireUser` allowlist),
not only by a modal.

Escape hatch: `PRAGATI_PREDICTABLE_DEFAULT_PASSWORD=1` (air-gapped verbal
handoffs only).

## 2. Time-to-value is the product

If the dashboard takes six seconds to paint, foresight and triage do not
matter. Keep heavy surfaces lazy:

- Birds-eye SVG, activity graph, foresight panels, force-password, tour
- Shell chrome: command palette + sidebar calendar
- Team workbench panels only when the tab is open

Measure with Vercel Speed Insights (RES / LCP), not lab-only scores.

## 3. Mission before workbench

The mission loop is: **see the one thing → act → know if dates hold**.

Secondary surfaces (whiteboard, tickets, CSV/QMS, scratchpad) are real but
optional. Use:

| Flag | Effect |
| --- | --- |
| `NEXT_PUBLIC_FOCUS_MODE=1` | Hide whiteboard + workbench modules |
| `NEXT_PUBLIC_WHITEBOARD_ENABLED=0` | Hide whiteboard only |
| `NEXT_PUBLIC_WORKBENCH_MODULES=0` | Hide tickets / QMS / recurring tabs |
| `NEXT_PUBLIC_SCRATCHPAD_ENABLED=1` | Opt-in scratchpad on My Day |

Defaults preserve full UI; focus mode is for hard launches and demos.

## 4. Ops without a vendor lock-in

Errors already land in Mongo (`ErrorLog`) + admin console. Set
`ERROR_WEBHOOK_URL` for on-call pings on first signature. Sentry is optional
later; do not block launch on it.

## 5. Edge + Node both guard the door

Middleware bounces cookie-less traffic for every authed segment (including
`/whiteboard` and `/csv-activity`). Layout + `validateSession` remain the
source of truth.

## Go / no-go

Use [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md) for the 25-minute open
runbook. This file is the *why*.
