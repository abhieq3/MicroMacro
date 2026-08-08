# Identity freeze (30 days)

**Decision date:** 2026-08-09  
**Expires:** 2026-09-08  

Steve Jobs rule: ship the home run, then stop redrawing the face.

## Frozen

| Decision | Choice |
|----------|--------|
| Visual system | **Mars** — warm light default (`#faf8f5`), pure dark opt-in, rust accent (`--mars`) |
| Home layout | **Two-column** board (Projects · Due). No flat-feed or single-column rewrites |
| Login voice | **Steve Jobs only** (`src/lib/quotes.ts`, ledger `pragati_quotes_seen_v13`) |
| Personal tools | **My Day + Whiteboard** (whiteboard on by default) |
| Theme thrash | **Forbidden** — no X-blue restyles, no pure-black-only redesigns, no third palette |

## Allowed without breaking freeze

- Bug fixes and performance
- Domain features (tasks, QMS, digests, audit)
- Copy micro-edits that preserve meaning
- Opt-out flags (`NEXT_PUBLIC_WHITEBOARD_ENABLED=0`) for emergencies

## Not allowed until freeze ends

- New founder “product pass” themes (Naval / Jensen / Elon / X / …)
- Home layout experiments without a measured 2-week trial with real leads
- Removing Whiteboard from nav without an in-app migration notice

## If users hate something

Restore. Document in changelog. Do **not** invent a third version the same day.

See also: `docs/PRODUCT_PRINCIPLES.md` (Jobs lens).
