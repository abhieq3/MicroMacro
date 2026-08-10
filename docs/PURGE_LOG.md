# Purge log (Elon pass)

**Date:** 2026-08-09  
**Intent:** Delete corpses. Protect the morning loop. Freeze identity thrash.

## Deleted this pass

| Surface | Removed |
|---------|---------|
| Delivery Foresight engine | `src/lib/ai/deliveryForesight.ts` |
| Project finish forecast engine | `src/lib/ai/projectForecast.ts` |
| Foresight UI | `DeliveryForesight.tsx`, `TeamForesight.tsx` |
| Forecast UI | `ForecastChip.tsx` |
| APIs | `/api/me/foresight`, `/api/users/[id]/foresight`, `/api/teams/[id]/foresight`, `/api/projects/[id]/forecast` |
| Tests | `delivery-foresight.test.ts`, `project-forecast.test.ts` |
| Digest | `foresightLine` field + dead injection path |
| Work Mixer shadow attach | `WORK_MIXER_ENABLED` payload on lead dashboard (scoring helpers **kept** for leverage/pressing) |
| Login veil | Post-PIN “Welcome back / Loading workspace” (earlier same day) |

## Kept on purpose

| Surface | Why |
|---------|-----|
| `slipRisk` on dashboard tasks | Fact-adjacent early warning, already used in UI |
| `workMixer` score/classify | Powers task leverage/pressing on home — not the shadow product |
| Live quotes `/api/quotes` | Optional login atmosphere; not a workstream |
| Bird’s-eye | Power export tool; not the morning path |
| Digest cron | High leverage if exceptions-first |

## Follow-ups completed

- `/api/dashboard` aliases lead-dashboard payload  
- Kanban extracted + lazy-loaded from project detail  
- Mobile task sticky status; Due list denser on small screens  
- Contributors panel desktop-only (hidden on mobile)  

## 2026-08-10 — Universal beast pass (not vertical cosplay)

| Change | Detail |
|--------|--------|
| Mission | Product principles rewritten: work board for everyone; GxP is not the face |
| Nav | Dashboard → **Today** |
| Templates | Blank / Sprint / Launch first; regulated structures under **Specialized** |
| Blockers | `status=blocked` requires `pendingWith` (API + UI prompt) |
| Workbench | Team trackers/tickets **off by default** (`NEXT_PUBLIC_WORKBENCH_MODULES=1` to enable) |
| Language | Lifecycle labels universal; QMS tab → Trackers |

## 2026-08-10 wave 2 — machine tightens

| Change | Detail |
|--------|--------|
| Critical path | `Task.onCriticalPath` + board strip + lead toggle |
| Exception-only digest/push | Skip send when no overdue/due-today/team fire |
| Today You panel | Exceptions first; My Day renamed **Capture** |
| Digest CTA | Open Today only |

## 2026-08-10 wave 3 — complete the machine

| Change | Detail |
|--------|--------|
| Path edges | `blockedByTaskId` + topo order on project strip |
| Offline queue | Task PATCH queues offline; AppShell flushes + banner |
| Birds-eye | Opt-in `NEXT_PUBLIC_BIRDS_EYE_ENABLED=1` |
| Flow Signal | Default mode `off` |
| Today capture | One-line scratch → `/scratch` |

## Still optional later

- Multi-predecessor DAG / Gantt  
- Full offline board cache  
- Confirm ICS/install API dead ends  
- Further split DashboardClient panels into files  



## Rule

If UI is gone, **code must die the same week**.
