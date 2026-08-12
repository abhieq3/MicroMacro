'use client';
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Avatar } from '@/components/ui';
import { ProfileHero } from '@/components/ProfileHero';
import {
  Activity,
  Pencil,
  Github,
  Linkedin,
  Twitter,
  Instagram,
  Youtube,
  Mail,
  Globe,
  Link as LinkIcon,
  Check,
} from 'lucide-react';
import { linkMeta, type LinkBrand } from '@/lib/links';
import { DeliveryForesight } from '@/components/DeliveryForesight';
import { ProfileStatTiles } from '@/components/ProfileStatTiles';

// Map a detected brand to a lucide icon. Anything without a dedicated mark
// (Medium, Dribbble, a personal site, …) renders the clean Globe chip — its
// brand accent colour still carries the identity.
const BRAND_ICON: Record<LinkBrand, typeof Globe> = {
  github: Github,
  linkedin: Linkedin,
  twitter: Twitter,
  instagram: Instagram,
  youtube: Youtube,
  email: Mail,
  medium: Globe,
  dribbble: Globe,
  behance: Globe,
  figma: Globe,
  gitlab: Globe,
  website: Globe,
};

// The contribution heatmap is a sizeable, below-the-fold client component —
// lazy-load it so it never blocks first paint of the profile page.
const ActivityGraph = dynamic(() => import('@/components/ActivityGraph').then((m) => m.ActivityGraph), {
  ssr: false,
  loading: () => <div className="h-40 rounded-xl bg-slate-50 animate-pulse" />,
});

/**
 * Read-only public profile, shown at /[username]. Any signed-in member can
 * view any colleague's profile — the workspace directory is open by design
 * (see CLAUDE.md). The hero matches the settings page exactly; only the
 * actions differ: your own profile shows "Edit profile" (→ /settings), a
 * colleague's shows a Follow / Unfollow button.
 */
export default function ProfileView({
  profile,
  isSelf,
}: {
  profile: {
    id: string;
    name: string;
    username?: string | null;
    role: string;
    employeeId?: string | null;
    title?: string | null;
    department?: string | null;
    location?: string | null;
    organisation?: string | null;
    avatarLetter?: string;
    avatarBg?: string;
    avatarFont?: number;
    avatarImage?: string;
    githubUrl?: string;
    links?: { url: string; label?: string }[];
    joinedAt?: string | null;
    stats?: {
      totalDone: number;
      doneThisYear: number;
      projectCount: number;
      streak: number;
    };
  };
  isSelf: boolean;
}) {
  const isLeadOrAdmin = profile.role === 'lead' || profile.role === 'admin';
  const roleText =
    profile.role === 'admin' ? 'Admin' : isLeadOrAdmin ? 'Team Lead' : 'Individual Contributor';

  const firstName = profile.name.split(/\s+/)[0];

  // The public link row. New profiles use the generic `links` list; older rows
  // may only have the legacy githubUrl — fold it in (deduped) so nothing the
  // member previously saved disappears.
  const allLinks: { url: string; label?: string }[] = [...(profile.links || [])];
  if (profile.githubUrl && !allLinks.some((l) => l.url === profile.githubUrl)) {
    allLinks.unshift({ url: profile.githubUrl });
  }

  // Share affordance — the profile URL is the user's public face inside the
  // workspace; copying it should be one click, not an address-bar ritual.
  const [copied, setCopied] = useState(false);
  function copyLink() {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable (http / permissions) — silently skip */
    }
  }

  const joined =
    profile.joinedAt &&
    new Date(profile.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Impact row — server-rendered numbers so the first impression of a profile
  // is what this person delivers, before the heatmap streams in below.
  const stats = profile.stats;

  // ── Edit action (self only) — a quiet pill in the hero's top-right ─────────
  const coverAction = isSelf ? (
    <Link
      href="/settings"
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-white/70 transition hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300"
    >
      <Pencil size={12} /> Edit profile
    </Link>
  ) : null;

  // ── Hero footer — tenure + links + share, folded into the hero card ────────
  const heroFooter = (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
      <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
        {joined && <span className="text-slate-400">Joined {joined}</span>}
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        {allLinks.map((l, i) => {
          const m = linkMeta(l.url, l.label);
          const Icon = BRAND_ICON[m.brand] || Globe;
          return (
            <a
              key={`${l.url}-${i}`}
              href={m.href}
              target="_blank"
              rel="noopener noreferrer"
              title={m.href}
              className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-white/75 transition hover:-translate-y-px hover:border-slate-300 hover:shadow-sm"
            >
              <span style={{ color: m.color }} className="shrink-0">
                <Icon size={14} />
              </span>
              <span className="max-w-[160px] truncate">{m.label}</span>
            </a>
          );
        })}

        <button
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-white/75 transition hover:bg-slate-100 dark:hover:bg-white/[0.08] hover:border-slate-300"
          title="Copy a link to this profile"
        >
          {copied ? <Check size={14} className="text-green-600" /> : <LinkIcon size={14} />}
          {copied ? 'Copied' : 'Share'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto pb-16 space-y-5 page-enter">
      <ProfileHero
        name={profile.name}
        username={profile.username}
        roleText={roleText}
        showMemberId={false}
        title={profile.title}
        department={profile.department}
        location={profile.location}
        organisation={profile.organisation}
        avatar={
          <Avatar
            name={profile.name}
            size={88}
            letter={profile.avatarLetter}
            bg={profile.avatarBg}
            font={profile.avatarFont}
            image={profile.avatarImage}
          />
        }
        actions={coverAction}
        footer={heroFooter}
      />

      {/* ── Impact row — what this person delivers, at a glance ─────────── */}
      {stats && <ProfileStatTiles stats={stats} />}

      {/* ── Activity section ────────────────────────────────────────────── */}
      <div id="activity" className="scroll-mt-6">
        <div className="card rounded-xl border overflow-hidden">
          <div className="section-head px-5 py-4 border-b flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
              style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}
            >
              <Activity size={18} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-slate-800 leading-tight">Activity</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                {isSelf ? 'Your' : `${firstName}'s`} delivered work on Pragati — completed tasks, weighted for
                on-time and priority.
              </p>
            </div>
          </div>
          <div className="px-5 py-5">
            <ActivityGraph userId={profile.id} name={profile.name} />
          </div>
        </div>
      </div>

      {/* ── Delivery Foresight — forward-looking read, kept last so the page
          reads backward-then-forward: identity, impact, activity, then where
          they're heading. Self sees the full forecast; a colleague sees rhythm. */}
      <DeliveryForesight userId={profile.id} isSelf={isSelf} />
    </div>
  );
}
