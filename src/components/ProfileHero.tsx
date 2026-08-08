'use client';
import Link from 'next/link';
import { ReactNode } from 'react';
import { MapPin, Building2, Briefcase, Fingerprint } from 'lucide-react';

/**
 * Shared profile hero — used on both the editable settings page (self) and
 * the read-only public profile at /[username].
 *
 * Design: deliberately minimal — no cover banner, no tint. A clean
 * neutral-framed avatar beside name + role and quiet metadata, with an
 * optional footer strip for links so the whole identity reads as one
 * self-contained unit. Keeping one component means a profile looks consistent
 * whether you're editing your own or viewing a colleague's.
 */
export function ProfileHero({
  name,
  username,
  roleText,
  employeeId,
  title,
  department,
  location,
  organisation,
  avatar,
  avatarExtra,
  actions,
  footer,
  linkUsername = false,
  showMemberId = true,
}: {
  name: string;
  username?: string | null;
  roleText: string;
  employeeId?: string | null;
  title?: string | null;
  department?: string | null;
  location?: string | null;
  organisation?: string | null;
  /** The avatar node (editable button on settings, plain Avatar on public). */
  avatar: ReactNode;
  /** Rendered BELOW the avatar (e.g. the photo upload/remove links) —
   *  never inside it, so text can't overlap the circle. */
  avatarExtra?: ReactNode;
  /** Top-right action slot in the hero — Edit (self) or Follow (public). */
  actions?: ReactNode;
  /** Optional strip below the identity block — links, share, etc. */
  footer?: ReactNode;
  /** When true, @username links to the public profile route. */
  linkUsername?: boolean;
  /** Member ID is internal — hidden on the public profile view. */
  showMemberId?: boolean;
}) {
  const meta = [
    title ? { icon: Briefcase, text: title } : null,
    department || organisation
      ? { icon: Building2, text: [department, organisation].filter(Boolean).join(' · ') }
      : null,
    location ? { icon: MapPin, text: location } : null,
    showMemberId && employeeId ? { icon: Fingerprint, text: `ID ${employeeId}` } : null,
  ].filter(Boolean) as { icon: any; text: string }[];

  const handle = username ? (
    linkUsername ? (
      <Link
        href={`/${username}`}
        className="font-mono text-[13px] text-slate-400 dark:text-white/40 break-all hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
      >
        @{username}
      </Link>
    ) : (
      <span className="font-mono text-[13px] text-slate-400 dark:text-white/40 break-all">@{username}</span>
    )
  ) : null;

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
        {/* Avatar — clean neutral frame, no gradient. avatarExtra (photo
            controls) sits centred beneath it. */}
        <div className="shrink-0 self-start flex flex-col items-center gap-2">
          <div className="rounded-full p-[3px] bg-white dark:bg-[#262624] ring-1 ring-slate-200 dark:ring-white/10 shadow-sm grid place-items-center leading-none">
            {avatar}
          </div>
          {avatarExtra && <div className="w-full flex justify-center">{avatarExtra}</div>}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-slate-900 dark:text-white break-words">
                  {name}
                </h1>
                <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/55">
                  {roleText}
                </span>
              </div>

              {handle && <div className="mt-1">{handle}</div>}

              {meta.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {meta.map((m, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-white/45"
                    >
                      <m.icon size={12} className="text-slate-300 dark:text-white/25 shrink-0" />
                      {m.text}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {actions && <div className="shrink-0 flex items-center gap-1.5">{actions}</div>}
          </div>
        </div>
      </div>

      {footer && <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/[0.06]">{footer}</div>}
    </section>
  );
}
