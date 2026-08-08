/**
 * LinkedIn-style skeleton screens.
 *
 * These are intentionally quiet: no spinner, no brand animation. The only
 * copy is one small personalised LoadingQuip line per page.
 * The blocks mirror the page structure that is about to load, which gives the
 * eye a stable layout immediately and prevents the content from jumping when the
 * server payload arrives.
 */
import { LoadingQuip } from '@/components/LoadingQuip';

function Skel({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/* ── Shared ghosts for the redesigned profile / settings / team pages ──────
   Kept structurally faithful (cover height, straddling avatar, the 4 impact
   tiles, the Foresight panel) so the real content lands without a jump. */
function ProfileHeroGhost() {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
        <div className="shrink-0">
          <Skel className="h-[96px] w-[96px] rounded-full ring-1 ring-slate-200 dark:ring-white/10" />
        </div>
        <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2.5">
            <Skel className="h-6 w-52 max-w-full rounded-lg" />
            <Skel className="h-3.5 w-32 rounded" />
            <Skel className="h-3.5 w-64 max-w-full rounded" />
          </div>
          <Skel className="h-7 w-24 rounded-full shrink-0" />
        </div>
      </div>
      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <Skel className="h-3.5 w-28 rounded" />
        <Skel className="h-7 w-20 rounded-full" />
      </div>
    </div>
  );
}

function StatTilesGhost() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skel className="h-8 w-8 rounded-xl shrink-0" />
            <Skel className="h-2.5 w-16 rounded" />
          </div>
          <Skel className="h-7 w-12 rounded" />
          <Skel className="h-2.5 w-20 rounded" />
        </div>
      ))}
    </div>
  );
}

function ForesightGhost() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <Skel className="h-8 w-8 rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skel className="h-3.5 w-44 rounded" />
          <Skel className="h-2.5 w-64 max-w-full rounded" />
        </div>
        <Skel className="h-5 w-24 rounded-full shrink-0" />
      </div>
      <div className="flex items-center gap-4">
        <Skel className="h-[72px] w-[72px] rounded-full shrink-0" />
        <div className="flex-1 space-y-2.5">
          <Skel className="h-4 w-3/4 rounded" />
          <Skel className="h-3 w-1/2 rounded" />
        </div>
      </div>
    </div>
  );
}

function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
      <div className="space-y-2 min-w-0 flex-1">
        <Skel className="h-8 w-44 rounded-lg" />
        <Skel className="h-3.5 w-80 max-w-full rounded" />
      </div>
      {action && <Skel className="h-10 w-32 rounded-xl" />}
    </div>
  );
}

function ToolbarSkeleton({ filters = 2 }: { filters?: number }) {
  return (
    <div className="card p-4 min-h-[74px] flex items-center gap-3">
      <Skel className="h-10 flex-1 rounded-xl" />
      {Array.from({ length: filters }).map((_, i) => (
        <Skel key={i} className="hidden md:block h-10 w-28 rounded-xl" />
      ))}
    </div>
  );
}

function StatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 space-y-3">
          <Skel className="h-3 w-16 rounded" />
          <Skel className="h-7 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function CardGridSkeleton({ count = 6, avatar = false }: { count?: number; avatar?: boolean }) {
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <Skel className="h-1.5 w-full rounded-none" />
          <div className="p-5 flex flex-col space-y-3">
            {avatar ? (
              <>
                <div className="flex items-start gap-4">
                  <Skel className="h-12 w-12 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skel className="h-5 w-3/4 rounded" />
                    <Skel className="h-5 w-20 rounded-full" />
                  </div>
                </div>
                <Skel className="h-3.5 w-full rounded" />
                <Skel className="h-3.5 w-2/3 rounded" />
                <div className="flex items-center -space-x-2 pt-1">
                  {[0, 1, 2, 3].map((n) => (
                    <Skel key={n} className="h-8 w-8 rounded-full ring-2 ring-white" />
                  ))}
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <Skel className="h-3.5 w-28 rounded" />
                  <Skel className="h-3.5 w-20 rounded" />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Skel className="h-5 w-16 rounded-full" />
                  <Skel className="h-5 w-20 rounded-full" />
                  <Skel className="ml-auto h-4 w-16 rounded" />
                </div>
                <Skel className="h-5 w-3/4 rounded" />
                <Skel className="h-3.5 w-full rounded" />
                <Skel className="h-3.5 w-2/3 rounded" />
                <div className="flex items-center gap-2 flex-wrap">
                  <Skel className="h-5 w-24 rounded-full" />
                  <Skel className="h-5 w-20 rounded-full" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Skel className="h-3 w-16 rounded" />
                    <Skel className="h-3 w-8 rounded" />
                  </div>
                  <Skel className="h-2 w-full rounded-full" />
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <Skel className="h-3.5 w-24 rounded" />
                  <Skel className="h-5 w-20 rounded-full" />
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RowListSkeleton({
  count = 8,
  avatar = false,
  tall = false,
  action = false,
}: {
  count?: number;
  avatar?: boolean;
  tall?: boolean;
  action?: boolean;
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`card px-4 ${tall ? 'py-4' : 'py-3'}`}>
          <div className="flex items-center gap-3">
            {avatar && <Skel className="h-10 w-10 rounded-full shrink-0" />}
            <div className="space-y-2 flex-1 min-w-0">
              <Skel className="h-4 w-3/4 max-w-[420px] rounded" />
              <Skel className="h-3 w-1/2 max-w-[260px] rounded" />
            </div>
            <Skel className="h-6 w-16 rounded-full" />
            {action && <Skel className="h-6 w-16 rounded-full" />}
            {action && <Skel className="h-7 w-7 rounded-lg" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function TabsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-2 border-b border-slate-100 dark:border-white/10">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-8 rounded-t-xl px-4 flex items-center">
          <Skel className="h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

function DetailHeaderSkeleton() {
  return (
    <div className="card p-5 sm:p-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-3 flex-1 min-w-0">
          <Skel className="h-3 w-28 rounded" />
          <Skel className="h-9 w-full max-w-xl rounded-xl" />
          <Skel className="h-4 w-full max-w-2xl rounded" />
        </div>
        <div className="flex gap-2">
          <Skel className="h-10 w-28 rounded-xl" />
          <Skel className="h-10 w-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  titleW = 40,
  rows = 4,
  rowH = 20,
}: {
  titleW?: number;
  rows?: number;
  rowH?: number;
}) {
  return (
    <div className="card p-4 space-y-3">
      <Skel className={`h-5 w-${titleW} rounded`} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skel key={i} className={`h-${rowH} w-full rounded-2xl`} />
      ))}
    </div>
  );
}

export function ProjectsListSkeleton() {
  return (
    <div className="pb-12 max-w-[1120px] space-y-5" role="status" aria-label="Loading projects">
      <div className="mb-3">
        <LoadingQuip />
      </div>
      <div className="flex items-start justify-between pt-1">
        <div className="space-y-2">
          <Skel className="h-9 w-32 rounded-lg" />
          <Skel className="h-3.5 w-72 rounded" />
        </div>
        <Skel className="h-10 w-32 rounded-xl" />
      </div>
      <div className="flex gap-1 border-b border-slate-100">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 px-4 flex items-center">
            <Skel className="h-3 w-14 rounded" />
          </div>
        ))}
      </div>
      <div className="card p-4 min-h-[72px] flex items-center gap-3">
        <Skel className="h-10 flex-1 rounded-xl" />
        <Skel className="hidden sm:block h-10 w-40 rounded-xl" />
        <Skel className="hidden sm:block h-10 w-44 rounded-xl" />
      </div>
      <CardGridSkeleton count={6} />
    </div>
  );
}

export function TeamsListSkeleton() {
  return (
    <div className="pb-12 max-w-[1120px] space-y-5" role="status" aria-label="Loading teams">
      <div className="mb-3">
        <LoadingQuip />
      </div>
      <div className="flex items-start justify-between gap-3 flex-wrap pt-1">
        <div className="space-y-2">
          <Skel className="h-9 w-24 rounded-lg" />
          <Skel className="h-3.5 w-80 max-w-full rounded" />
        </div>
        <Skel className="h-10 w-28 rounded-xl" />
      </div>
      <CardGridSkeleton count={6} avatar />
    </div>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <div className="pb-12 max-w-[1440px] space-y-5" role="status" aria-label="Loading project">
      <div className="mb-3">
        <LoadingQuip />
      </div>
      <div className="card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-3 flex-1 min-w-0">
            <Skel className="h-3 w-24 rounded" />
            <Skel className="h-8 w-full max-w-xl rounded-xl" />
            <Skel className="h-3.5 w-full max-w-2xl rounded" />
            <div className="flex items-center gap-2 flex-wrap">
              <Skel className="h-6 w-20 rounded-full" />
              <Skel className="h-6 w-24 rounded-full" />
              <Skel className="h-6 w-16 rounded-full" />
            </div>
            <Skel className="h-3.5 w-40 rounded" />
          </div>
          <div className="flex gap-2 shrink-0">
            <Skel className="h-9 w-24 rounded-xl" />
            <Skel className="h-9 w-28 rounded-xl" />
          </div>
        </div>
      </div>
      <StatCards />
      <div className="flex items-center gap-2 mb-1">
        <Skel className="h-8 w-28 rounded-full" />
        <Skel className="h-8 w-24 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/80 border-b border-slate-100">
              <Skel className="h-5 w-5 rounded-full" />
              <Skel className="h-4 w-32 rounded" />
              <Skel className="h-4 w-10 rounded" />
              <Skel className="h-5 w-14 rounded-full ml-auto" />
            </div>
            <div className="p-3 space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div
                  key={j}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100"
                >
                  <Skel className="h-3.5 w-3.5 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skel className="h-3.5 w-2/3 rounded" />
                    <Skel className="h-2.5 w-1/3 rounded" />
                  </div>
                  <Skel className="h-5 w-14 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamDetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading team">
      <div className="mb-1">
        <LoadingQuip />
      </div>
      {/* Header — avatar tile + title/description, actions top-right, stat strip.
          No cover band: mirrors the minimal team header. */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-start gap-4 sm:gap-5">
          <Skel className="h-[74px] w-[74px] rounded-2xl shrink-0 ring-1 ring-slate-200 dark:ring-white/10" />
          <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <Skel className="h-6 w-44 rounded-lg" />
              <Skel className="h-3.5 w-64 max-w-full rounded" />
            </div>
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <Skel className="h-9 w-9 rounded-full" />
              <Skel className="h-9 w-24 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/[0.06] grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200/70 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02] px-3 py-2.5 space-y-1.5"
            >
              <Skel className="h-2.5 w-16 rounded" />
              <Skel className="h-5 w-12 rounded" />
            </div>
          ))}
        </div>
      </div>
      {/* Members rail (1/4) + work column (3/4). */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 card p-4 space-y-3">
          <Skel className="h-3 w-28 rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5">
              <Skel className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 min-w-0 space-y-1">
                <Skel className="h-3.5 w-3/4 rounded" />
                <Skel className="h-2.5 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="lg:col-span-3 space-y-4">
          <div className="flex gap-2">
            <Skel className="h-8 w-20 rounded" />
            <Skel className="h-8 w-20 rounded" />
            <Skel className="h-8 w-20 rounded" />
          </div>
          <div className="card p-4 space-y-4">
            <Skel className="h-4 w-40 rounded" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skel className="h-3 w-3/4 rounded" />
                <Skel className="h-5 w-16 rounded-full ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskDetailSkeleton() {
  return (
    <div className="pb-12 max-w-6xl space-y-4" role="status" aria-label="Loading task">
      <div className="mb-3">
        <LoadingQuip />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="space-y-2">
            <Skel className="h-3 w-40 rounded" />
            <Skel className="h-6 w-3/4 rounded" />
            <div className="flex gap-2 mt-1">
              <Skel className="h-5 w-20 rounded-full" />
              <Skel className="h-5 w-16 rounded-full" />
              <Skel className="h-5 w-18 rounded-full" />
            </div>
          </div>
          <div className="card p-5 space-y-3">
            <Skel className="h-4 w-32 rounded" />
            <Skel className="h-3 w-full rounded" />
            <Skel className="h-3 w-5/6 rounded" />
            <Skel className="h-3 w-4/6 rounded" />
          </div>
          <div className="card p-5 space-y-3">
            <Skel className="h-4 w-28 rounded" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 items-center">
                <Skel className="h-4 w-4 rounded" />
                <Skel className="h-3.5 flex-1 rounded" />
              </div>
            ))}
            <Skel className="h-8 w-full rounded-xl" />
          </div>
          <div className="card p-5 space-y-3">
            <Skel className="h-4 w-36 rounded" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex gap-3 items-start">
                <Skel className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skel className="h-3 w-24 rounded" />
                  <Skel className="h-3 w-full rounded" />
                  <Skel className="h-3 w-2/3 rounded" />
                </div>
              </div>
            ))}
            <Skel className="h-16 w-full rounded-xl" />
          </div>
          <div className="card p-5 space-y-3">
            <Skel className="h-4 w-24 rounded" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skel className="h-3 w-20 rounded" />
                <Skel className="h-3 w-10 rounded" />
                <Skel className="h-3 w-16 rounded ml-auto" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <Skel className="h-4 w-28 rounded" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skel className="h-2.5 w-20 rounded" />
                <Skel className="h-9 w-full rounded-xl" />
              </div>
            ))}
          </div>
          <div className="card p-5 space-y-3">
            <Skel className="h-4 w-20 rounded" />
            <Skel className="h-3 w-full rounded" />
            <Skel className="h-3 w-3/4 rounded" />
            <Skel className="h-6 w-24 rounded-full" />
          </div>
          <div className="card p-5 space-y-3">
            <Skel className="h-4 w-28 rounded" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skel className="h-8 w-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skel className="h-3 w-3/4 rounded" />
                  <Skel className="h-2.5 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MyDaySkeleton() {
  return (
    <div className="pb-14 max-w-6xl mx-auto" role="status" aria-label="Loading My Day">
      <div className="mb-3">
        <LoadingQuip />
      </div>
      {/* Hero header — label, greeting, date. No right-side widget on this page. */}
      <div className="mb-5 pt-1 space-y-2">
        <Skel className="h-2.5 w-20 rounded" />
        <Skel className="h-9 w-80 max-w-full rounded-xl" />
        <Skel className="h-3.5 w-40 rounded" />
      </div>
      {/* Capture bar */}
      <div className="mb-4">
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3.5 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Skel className="h-9 w-9 rounded-xl shrink-0" />
            <Skel className="h-5 flex-1 rounded-lg" />
          </div>
        </div>
      </div>
      {/* Open todo rows — no trailing chip; the track/priority controls only
          appear on hover, so a resting row is just a checkbox + text. */}
      <div className="space-y-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.025]"
          >
            <Skel className="h-[18px] w-[18px] rounded-[5px] shrink-0" />
            <Skel className="h-4 flex-1 max-w-[380px] rounded" />
          </div>
        ))}
      </div>
      {/* Completed section is collapsed by default — just its toggle line. */}
      <div className="mt-5">
        <Skel className="h-3.5 w-32 rounded" />
      </div>
    </div>
  );
}

export function PeopleSkeleton() {
  return (
    <div className="pb-12 max-w-[1200px] space-y-5" role="status" aria-label="Loading people">
      <div className="mb-3">
        <LoadingQuip />
      </div>
      <div className="flex items-start justify-between gap-3 flex-wrap pt-1">
        <div className="space-y-2">
          <Skel className="h-9 w-28 rounded-lg" />
          <Skel className="h-3.5 w-64 rounded" />
        </div>
        <Skel className="h-10 w-36 rounded-xl" />
      </div>
      <div className="card p-4 flex items-center gap-3">
        <Skel className="h-10 flex-1 rounded-xl" />
        <Skel className="hidden sm:block h-10 w-36 rounded-xl" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="card px-4 py-3">
            <div className="flex items-center gap-3">
              <Skel className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skel className="h-4 w-40 max-w-full rounded" />
                <Skel className="h-3 w-56 max-w-full rounded" />
              </div>
              <Skel className="h-6 w-16 rounded-full hidden sm:block" />
              <Skel className="h-6 w-20 rounded-full hidden sm:block" />
              <Skel className="h-8 w-8 rounded-lg shrink-0" />
              <Skel className="h-8 w-8 rounded-lg shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuditSkeleton() {
  return (
    <div className="max-w-5xl space-y-5 pb-12" role="status" aria-label="Loading audit log">
      <div className="mb-3">
        <LoadingQuip />
      </div>
      <HeaderSkeleton action={false} />
      <div className="flex gap-1.5 flex-wrap">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skel key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <RowListSkeleton count={10} />
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="max-w-5xl mx-auto pb-16 space-y-5" role="status" aria-label="Loading settings">
      <div className="mb-3">
        <LoadingQuip />
      </div>
      <ProfileHeroGhost />
      <StatTilesGhost />
      <ForesightGhost />
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Skel className="h-8 w-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skel className="h-4 w-24 rounded" />
            <Skel className="h-3 w-64 max-w-full rounded" />
          </div>
        </div>
        <Skel className="h-40 w-full rounded-2xl" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07] flex items-center gap-2.5">
            <Skel className="h-4 w-4 rounded" />
            <div className="flex-1 space-y-1">
              <Skel className="h-4 w-36 rounded" />
              <Skel className="h-3 w-80 max-w-full rounded" />
            </div>
            <Skel className="h-4 w-4 rounded shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NewProjectSkeleton() {
  return (
    <div className="max-w-3xl pb-20" role="status" aria-label="Loading new project">
      <div className="mb-3">
        <LoadingQuip />
      </div>
      <div className="flex items-center gap-3 mb-6 pt-1">
        <div className="space-y-1.5">
          <Skel className="h-7 w-32 rounded-xl" />
          <Skel className="h-3 w-48 rounded" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Skel className="h-7 w-20 rounded-full" />
          <Skel className="h-7 w-20 rounded-full" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="card p-5 space-y-4">
          <div className="space-y-1.5">
            <Skel className="h-3 w-24 rounded" />
            <Skel className="h-10 w-full rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Skel className="h-3 w-24 rounded" />
            <Skel className="h-16 w-full rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Skel className="h-3 w-16 rounded" />
            <Skel className="h-10 w-full rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Skel className="h-3 w-20 rounded" />
              <Skel className="h-10 w-full rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Skel className="h-3 w-16 rounded" />
              <Skel className="h-10 w-full rounded-xl" />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2.5 flex items-start gap-3">
            <Skel className="h-5 w-9 rounded-full shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <Skel className="h-3.5 w-32 rounded" />
              <Skel className="h-3 w-64 max-w-full rounded" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Skel className="h-3 w-16 rounded" />
            <Skel className="h-10 w-full rounded-xl" />
          </div>
        </div>
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Skel className="h-3 w-36 rounded" />
          </div>
          <Skel className="h-3 w-full max-w-lg rounded" />
          <div className="space-y-3">
            {[0, 1, 2].map((g) => (
              <div key={g} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Skel className="h-2.5 w-28 rounded" />
                  <Skel className="h-2.5 w-20 rounded" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 px-3 py-2 space-y-1">
                      <Skel className="h-3.5 w-3/4 rounded" />
                      <Skel className="h-2.5 w-full rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Skel className="h-10 w-48 rounded-xl" />
          <Skel className="h-10 w-20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="max-w-5xl mx-auto pb-16 space-y-5" role="status" aria-label="Loading profile">
      <div className="mb-3">
        <LoadingQuip />
      </div>
      <ProfileHeroGhost />
      <StatTilesGhost />
      <ForesightGhost />
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Skel className="h-8 w-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skel className="h-4 w-24 rounded" />
            <Skel className="h-3 w-64 max-w-full rounded" />
          </div>
        </div>
        <Skel className="h-40 w-full rounded-2xl" />
      </div>
    </div>
  );
}
