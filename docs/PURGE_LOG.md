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

## Next purge candidates (not this commit)

- Merge `/api/dashboard` + lead-dashboard dual path  
- Split `ProjectDetailClient` / `DashboardClient` god files  
- Trim lifecycle templates  
- Confirm ICS/install API dead ends  

## Rule

If UI is gone, **code must die the same week**.
