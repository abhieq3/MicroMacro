'use client';
import { Fragment, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Avatar } from './ui';
import { PragatiMark } from './PragatiMark';
import { CurrentUserProvider } from './CurrentUserContext';
import { AvatarRegistryProvider } from './AvatarRegistry';
import { NotificationBell } from './NotificationBell';
import { clearActivityGraphCache } from './ActivityGraph';
import { api } from '@/lib/client/api';
import { WHITEBOARD_ENABLED } from '@/lib/features';
import { NavigationProgress } from './NavigationProgress';

// Heavy shell chrome — lazy so first paint of every authed page does not pay
// for command palette search + calendar month math until the shell is idle.
const CommandPalette = dynamic(() => import('./CommandPalette').then((m) => m.CommandPalette), {
  ssr: false,
  loading: () => null,
});
const SidebarCalendar = dynamic(() => import('./SidebarCalendar').then((m) => m.SidebarCalendar), {
  ssr: false,
  loading: () => null,
});

// Wipe every module-level, cross-mount client cache that could carry one
// user's data into the next session sharing this browser tab (e.g. team-leader
// logs out, admin logs in — without this, the admin would briefly see the
// team-leader's calendar/activity until their own fetch overwrites it).
function clearSessionScopedCaches() {
  void import('./SidebarCalendar').then((m) => m.clearSidebarCalendarCache());
  clearActivityGraphCache();
}

// Force-password modal — only ships when a user has mustChangePassword set.
// Keeps the long form code (strength meter, validators) out of the main bundle.
const ForcePasswordModal = dynamic(() => import('./ForcePasswordModal').then((m) => m.ForcePasswordModal), {
  ssr: false,
  loading: () => null,
});
// Mandatory Quick-PIN setup on first login — lazy so it stays out of the bundle
// for everyone who already has a PIN.
const SetPinModal = dynamic(() => import('./SetPinModal').then((m) => m.SetPinModal), {
  ssr: false,
  loading: () => null,
});
// Guided "spotlight" product tour for first-time users — lazy so its portal,
// rect-tracking, and step data stay out of the bundle for returning users.
const FirstTimeTour = dynamic(() => import('./FirstTimeTour').then((m) => m.FirstTimeTour), {
  ssr: false,
  loading: () => null,
});
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  UsersRound,
  ShieldCheck,
  NotebookPen,
  Presentation,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  UserCircle,
  Layers,
  Globe,
  ExternalLink,
  Search,
} from 'lucide-react';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  /** Login handle — also the path to the user's public profile (/<username>). */
  username?: string | null;
  role: 'contributor' | 'lead' | 'admin' | 'master_admin';
  title?: string;
  mustChangePassword?: boolean;
  hasPin?: boolean;
  /** Number of successful full logins. Used to defer the Quick-PIN modal
   *  until the second visit so first-time users aren't piled on. */
  loginCount?: number;
  /** ISO date when the user dismissed the Quick-PIN prompt; suppresses
   *  the modal until they re-engage from Settings. */
  pinPromptDismissedAt?: string | null;
  /** Whether the user has already completed the onboarding tour. */
  hasSeenTour?: boolean;
  /** Server-persisted monogram avatar (Google-style). */
  avatarLetter?: string;
  avatarBg?: string;
  avatarFont?: number;
  avatarImage?: string;
  /** Drop-sound preference for kanban / dashboard reorders. */
  soundDropEnabled?: boolean;
}

/* ── Dark-mode hook ─────────────────────────────────────────────────
   The initial value is read from the `theme` cookie that's painted onto
   <html class="dark"> server-side (see (authed)/layout.tsx). That kills
   the FOUC: previously we mounted with light, then a useEffect flipped
   to dark, causing a visible flash + a full re-paint of the shell. */
function useDarkMode(initialDark: boolean): [boolean, () => void] {
  const [dark, setDark] = useState(initialDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    // Persist via cookie so the next SSR render starts in the right
    // mode. 365 d, sameSite=lax so it travels with normal navigation.
    document.cookie = `theme=${dark ? 'dark' : 'light'}; path=/; max-age=31536000; SameSite=Lax`;
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

/* ── Main shell ─────────────────────────────────────────────────────── */
export default function AppShell({
  user,
  initialDark,
  initialSidebarCollapsed = false,
  initialSidebarWidth = 220,
  initialAvatars,
  initialUnread = 0,
  children,
}: {
  user: CurrentUser;
  initialDark: boolean;
  initialSidebarCollapsed?: boolean;
  initialSidebarWidth?: number;
  initialAvatars?: Record<string, { letter: string; bg: string; font: number }>;
  initialUnread?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [idleWarning, setIdleWarning] = useState(false);
  const [dark, toggleDark] = useDarkMode(initialDark);
  const [mustChangePw, setMustChangePw] = useState(!!user.mustChangePassword);
  // Show the PIN modal only when ALL of these hold:
  //  • the user doesn't already have a PIN
  //  • they've completed at least 2 full logins (first visit is busy with
  //    password change + onboarding tour)
  //  • they haven't dismissed the prompt this session with "Maybe later"
  const shouldOfferPin = !user.hasPin && (user.loginCount ?? 0) >= 2 && !user.pinPromptDismissedAt;
  const [needsPin, setNeedsPin] = useState(shouldOfferPin);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Desktop "distraction-free" collapse: shrinks the sidebar to an icon rail
  // (icons + avatar only). Persisted in a cookie (read server-side) so the
  // server knows the initial width on first paint — no layout shift after hydration.
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `sidebar_collapsed=${next ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });

  // Resizable sidebar width — clamped between 180 and 340. Only applies when
  // the sidebar is expanded. Persisted in a cookie so it survives refreshes.
  const SIDEBAR_MIN = 180;
  const SIDEBAR_MAX = 340;
  const clampWidth = (w: number) => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w));
  const [sidebarWidth, setSidebarWidth] = useState(() => clampWidth(initialSidebarWidth));
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWRef = useRef(0);

  function onDragHandleMouseDown(e: React.MouseEvent) {
    // Only drag when sidebar is expanded and not on mobile.
    if (collapsed || open) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWRef.current = sidebarWidth;

    const onMouseMove = (mv: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = mv.clientX - dragStartXRef.current;
      setSidebarWidth(clampWidth(dragStartWRef.current + delta));
    };
    const onMouseUp = (mu: MouseEvent) => {
      isDraggingRef.current = false;
      const delta = mu.clientX - dragStartXRef.current;
      const final = clampWidth(dragStartWRef.current + delta);
      setSidebarWidth(final);
      document.cookie = `sidebar_width=${final}; path=/; max-age=31536000; SameSite=Lax`;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // Keyboard shortcuts modal state
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Cmd/Ctrl+K command palette state
  const [paletteOpen, setPaletteOpen] = useState(false);
  // "G then X" two-key navigation buffer
  const gPressedRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOpen(false);
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (accountMenuRef.current?.contains(e.target as Node)) return;
      setAccountMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountMenuOpen]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  // Cmd/Ctrl+D toggles dark mode. We preventDefault so it overrides the
  // browser's "bookmark this page" default while the app is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
        const el = document.activeElement as HTMLElement | null;
        // Don't hijack the shortcut while the user is typing in a field.
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        e.preventDefault();
        toggleDark();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleDark]);

  // Cmd/Ctrl+K opens the command palette. Unlike the single-letter 'G…'
  // sequence, a modifier chord is unambiguous typed-text input, so — like
  // Cmd/Ctrl+D above — it fires even while a field is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Idle auto-logout ────────────────────────────────────────────────
  // 21 CFR Part 11 §11.10(d): unattended sessions must not stay open.
  // At 25 min idle we show a "Still there?" modal; at 30 min we force log out.
  useEffect(() => {
    const WARN_MS = 25 * 60 * 1000;
    const IDLE_MS = 30 * 60 * 1000;
    const mark = () => {
      lastActivityRef.current = Date.now();
      setIdleWarning(false);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const iv = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_MS) {
        clearInterval(iv);
        setIdleWarning(false);
        clearSessionScopedCaches();
        api('/auth/logout', { method: 'POST' }).finally(() => {
          router.replace('/login');
          router.refresh();
        });
      } else if (idle >= WARN_MS) {
        setIdleWarning(true);
      }
    }, 30_000);
    return () => {
      clearInterval(iv);
      events.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [router]);

  // Warm the primary routes while the shell is idle so the next hop is instant.
  useEffect(() => {
    const warm = () => {
      for (const href of ['/', '/projects', '/teams', '/my-day', '/settings', '/whiteboard']) {
        try {
          router.prefetch(href);
        } catch {
          /* ignore */
        }
      }
    };
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
    const id = ric ? ric(warm, { timeout: 1800 }) : window.setTimeout(warm, 400);
    return () => {
      if (ric && (window as any).cancelIdleCallback) (window as any).cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [router]);

  // ── Global keyboard shortcuts ───────────────────────────────────────────────
  // G→D: Dashboard, G→P: Projects, G→T: Teams, G→M: My Day, G→W: Whiteboard,
  // ?: shortcuts modal
  // Skipped when focus is on a text input / textarea / contenteditable.
  useEffect(() => {
    function isTextFocused(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    }

    function handleKey(e: KeyboardEvent) {
      if (isTextFocused()) return;

      // Shortcuts modal: open with '?', close with Escape
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        return;
      }

      // 'G' starts the two-key sequence (up to 500 ms window)
      if (e.key === 'g' || e.key === 'G') {
        if (gTimerRef.current) clearTimeout(gTimerRef.current);
        gPressedRef.current = true;
        gTimerRef.current = setTimeout(() => {
          gPressedRef.current = false;
        }, 500);
        return;
      }

      if (gPressedRef.current) {
        gPressedRef.current = false;
        if (gTimerRef.current) clearTimeout(gTimerRef.current);
        const dest: Record<string, string> = {
          d: '/',
          D: '/',
          p: '/projects',
          P: '/projects',
          t: '/teams',
          T: '/teams',
          m: '/my-day',
          M: '/my-day',
          ...(WHITEBOARD_ENABLED
            ? { w: '/whiteboard', W: '/whiteboard' }
            : {}),
        };
        if (dest[e.key]) {
          e.preventDefault();
          window.dispatchEvent(new Event('pragati:nav-start'));
          router.push(dest[e.key]);
        }
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [router]);

  type NavItem = {
    href: string;
    label: string;
    icon: any;
    iconColor: string;
    iconBg: string;
    adminOnly?: boolean;
  };

  const isAdmin = user.role === 'admin' || user.role === 'master_admin';
  const isMasterAdmin = user.role === 'master_admin';
  const isLeadOrAdmin = user.role === 'lead' || isAdmin;

  // Team-lead nav: run teams, projects and tasks. NOT People — workspace
  // user management (create/reset/unlock/delete/promote accounts) is an
  // admin-only surface, appended via adminExtra below.
  // My Day and Whiteboard are NOT in the main nav list — they render pinned
  // Think sits beside My Day: capture vs the project meeting board.
  const whiteboardItem: NavItem = {
    href: '/whiteboard',
    label: 'Think',
    icon: Presentation,
    iconColor: '#0E7490',
    iconBg: '#E0F7FA',
  };
  const leadNav: NavItem[] = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard, iconColor: '#1565C0', iconBg: '#E3F2FD' },
    { href: '/projects', label: 'Projects', icon: FolderKanban, iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
    { href: '/teams', label: 'Teams', icon: Users, iconColor: '#2E7D32', iconBg: '#E8F5E9' },
  ];
  const adminExtra: NavItem[] = [
    {
      href: '/admin',
      label: 'Console',
      icon: ShieldCheck,
      iconColor: '#B45309',
      iconBg: '#FEF3C7',
      adminOnly: true,
    },
    {
      href: '/people',
      label: 'People',
      icon: UsersRound,
      iconColor: '#00897B',
      iconBg: '#E0F2F1',
      adminOnly: true,
    },
    {
      href: '/audit',
      label: 'Logs',
      icon: ScrollText,
      iconColor: '#6366F1',
      iconBg: '#EEF2FF',
      adminOnly: true,
    },
  ];
  // The master-admin item is only added when the signed-in user actually holds
  // that role. In the current single-tenant deploy no one does, so the link
  // never appears — the route itself also redirects non-master-admins.
  const masterAdminExtra: NavItem[] = isMasterAdmin
    ? [
        {
          href: '/master-admin',
          label: 'Platform',
          icon: Globe,
          iconColor: '#9333EA',
          iconBg: '#F3E8FF',
          adminOnly: true,
        },
      ]
    : [];

  const contributorNav: NavItem[] = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard, iconColor: '#1565C0', iconBg: '#E3F2FD' },
    { href: '/projects', label: 'Projects', icon: FolderKanban, iconColor: '#7B1FA2', iconBg: '#F3E5F5' },
    { href: '/teams', label: 'Teams', icon: Users, iconColor: '#2E7D32', iconBg: '#E8F5E9' },
  ];

  const myDayItem: NavItem = {
    href: '/my-day',
    label: 'My Day',
    icon: NotebookPen,
    iconColor: '#1565C0',
    iconBg: '#EFF6FF',
  };

  const nav = isAdmin
    ? [...leadNav, ...adminExtra, ...masterAdminExtra]
    : isLeadOrAdmin
      ? leadNav
      : contributorNav;
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname?.startsWith(href));

  async function logout() {
    clearSessionScopedCaches();
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const roleText =
    user.role === 'admin' ? 'Admin' : user.role === 'lead' ? 'Team Lead' : 'Individual Contributor';

  // Decluttered: a single entry into the profile (which now holds Activity and,
  // behind a disclosure, Security / Quick PIN / admin tools). Notifications and
  // their preferences live in the bell. Dark mode + Sign out follow below.
  const accountItems = [{ href: '/settings', label: 'Profile & activity', icon: UserCircle }];

  const AccountMenu = accountMenuOpen ? (
    <div
      ref={accountMenuRef}
      className="absolute left-3 bottom-[72px] z-30 w-[270px] rounded-2xl border p-2 shadow-2xl"
      style={{
        background: dark ? '#2b2b29' : '#ffffff',
        borderColor: dark ? 'rgba(255,255,255,0.10)' : '#dbe3ef',
        boxShadow: dark ? '0 18px 44px rgba(0,0,0,0.45)' : '0 18px 44px rgba(15,23,42,0.16)',
      }}
    >
      <div
        className="px-2.5 py-2.5 flex items-center gap-3 border-b mb-1.5"
        style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : '#eef2f7' }}
      >
        <Avatar
          name={user.name}
          size={38}
          letter={user.avatarLetter}
          bg={user.avatarBg}
          font={user.avatarFont}
          image={user.avatarImage}
          ring
        />
        <div className="min-w-0">
          <div className={`text-sm font-black truncate ${dark ? 'text-white' : 'text-slate-900'}`}>
            {user.name}
          </div>
          <div className={`text-[11px] truncate ${dark ? 'text-white/45' : 'text-slate-400'}`}>
            {user.username ? `@${user.username}` : roleText}
          </div>
        </div>
      </div>

      {accountItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              dark
                ? 'text-white/70 hover:text-white hover:bg-white/5'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Icon size={16} className={dark ? 'text-white/40' : 'text-slate-400'} />
            <span>{item.label}</span>
          </Link>
        );
      })}

      <div className="my-1.5 border-t" style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : '#eef2f7' }} />
      <button
        type="button"
        onClick={() => {
          toggleDark();
          setAccountMenuOpen(false);
        }}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
          dark
            ? 'text-white/70 hover:text-white hover:bg-white/5'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
      >
        {dark ? <Sun size={16} className="text-amber-300" /> : <Moon size={16} className="text-slate-400" />}
        <span>{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          setAccountMenuOpen(false);
          setConfirmLogout(true);
        }}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
          dark ? 'text-red-300/75 hover:text-red-300 hover:bg-red-400/10' : 'text-red-600 hover:bg-red-50'
        }`}
      >
        <LogOut size={16} />
        <span>Sign out</span>
      </button>
    </div>
  ) : null;

  // Icon-only rail on desktop when collapsed. On mobile the drawer is always
  // shown full-width (the collapse toggle is desktop-only), so we suppress the
  // collapsed look whenever the mobile drawer is open.
  // When hovered while collapsed, we show the full sidebar as a fly-out overlay
  // (not locked — collapses back when mouse leaves). Clicking anywhere on the
  // sidebar while in hover-expand mode permanently expands it (toggleCollapsed).
  const showCollapsed = collapsed && !open && !sidebarHovered;

  /* ── Sidebar inner content ─────────────────────────────────────────── */
  const SidebarInner = (
    <>
      {/* Brand header — the mark is `shrink-0` so flexbox never compresses it,
          and the wordmark is only *rendered* when expanded (not just faded),
          so it can't occupy width and squeeze the 30px mark in the 68px rail.
          That double-guard is what fixes the "logo squeezed from both sides"
          in the collapsed sidebar. */}
      <div
        className="relative flex items-center h-14 shrink-0 border-b overflow-hidden"
        style={{ borderColor: dark ? 'rgba(255,255,255,0.07)' : '#e8edf4' }}
      >
        <Link
          href="/"
          className={`flex items-center min-w-0 w-full ${showCollapsed ? 'justify-center' : 'gap-2.5 pl-[18px] pr-4'}`}
        >
          <span className="shrink-0">
            <PragatiMark size={30} />
          </span>
          {!showCollapsed && (
            <span
              className={`brand-wordmark text-[21px] whitespace-nowrap ${dark ? 'text-white' : 'brand-wordmark-gradient'}`}
            >
              Pragati
            </span>
          )}
        </Link>
        {!showCollapsed && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {/* Close on mobile only */}
            <button
              className={`lg:hidden p-1 rounded-md ${dark ? 'text-white/40 hover:text-white/70' : 'text-slate-400 hover:text-slate-600'}`}
              onClick={() => setOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Command palette trigger — icon-only in the collapsed rail, a full
          "Search… ⌘K" pill when expanded. */}
      <div className={`px-3 pt-3 ${showCollapsed ? 'flex justify-center' : ''}`}>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          title="Search (⌘K)"
          className={`flex items-center gap-2 rounded-lg text-[12px] font-medium transition-colors ${
            showCollapsed ? 'p-2 justify-center' : 'w-full px-2.5 py-1.5'
          } ${
            dark
              ? 'text-white/40 hover:text-white/70 bg-white/[0.04] hover:bg-white/[0.08]'
              : 'text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100'
          }`}
        >
          <Search size={14} className="shrink-0" />
          {!showCollapsed && (
            <>
              <span className="flex-1 text-left">Search</span>
              <span
                className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md ${
                  dark ? 'bg-white/10 text-white/40' : 'bg-white text-slate-400 border border-slate-200'
                }`}
              >
                ⌘K
              </span>
            </>
          )}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 overflow-auto flex flex-col">
        <div className="space-y-0.5 flex-1">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = isActive(n.href);
            // Visually separate the admin surfaces from everyday navigation —
            // a small section label before the first admin-only item makes
            // the role boundary legible at a glance.
            const startsAdminSection = n.adminOnly && nav.find((x) => x.adminOnly) === n;
            return (
              <Fragment key={n.href}>
                {startsAdminSection && !showCollapsed && (
                  <div className="px-2.5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/30">
                    Administration
                  </div>
                )}
                {startsAdminSection && showCollapsed && (
                  <div
                    className="my-2 mx-2 border-t"
                    style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : '#e8edf4' }}
                  />
                )}
                <Link
                  href={n.href}
                  prefetch
                  title={showCollapsed ? n.label : undefined}
                  data-tour={`nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`group flex items-center gap-2.5 ${showCollapsed ? 'justify-center px-0' : 'px-2.5'} py-2 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                    active
                      ? 'text-brand-700 dark:text-[#faf9f5]'
                      : 'text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white/90 hover:bg-slate-50 dark:hover:bg-white/5 hover:translate-x-[1px]'
                  }`}
                  style={
                    active
                      ? showCollapsed
                        ? {
                            background: dark ? 'rgba(255,255,255,0.08)' : '#EEF4FD',
                          }
                        : {
                            background: dark ? 'rgba(255,255,255,0.08)' : '#EEF4FD',
                            borderLeft: `3px solid ${n.iconColor}`,
                            paddingLeft: '9px',
                          }
                      : {}
                  }
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
                    style={{
                      background: active
                        ? dark
                          ? `${n.iconColor}30`
                          : n.iconBg
                        : dark
                          ? `${n.iconColor}18`
                          : `${n.iconColor}14`,
                    }}
                  >
                    <Icon
                      size={14}
                      style={{ color: active ? n.iconColor : dark ? n.iconColor + 'bb' : n.iconColor + '99' }}
                    />
                  </div>
                  {!showCollapsed && <span className="flex-1 truncate">{n.label}</span>}
                </Link>
              </Fragment>
            );
          })}
        </div>

        {/* Sidebar calendar — compact month view with due-date dots. Hidden on
            the collapsed icon rail; sits just above the personal surfaces so
            those stay pinned closest to the footer. */}
        {!showCollapsed && <SidebarCalendar dark={dark} />}

        {/* Personal surfaces — My Day (+ Whiteboard when enabled), pinned just
            above the footer. Both are "yours alone": capture and thinking. */}
        <div
          className="mt-2 pt-2 border-t space-y-0.5"
          style={{ borderColor: dark ? 'rgba(255,255,255,0.06)' : '#eef2f7' }}
        >
          {[myDayItem, ...(WHITEBOARD_ENABLED ? [whiteboardItem] : [])].map((n) => {
            const Icon = n.icon;
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                prefetch
                title={showCollapsed ? n.label : undefined}
                data-tour={`nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={`flex items-center gap-2.5 ${showCollapsed ? 'justify-center px-0' : 'px-2.5'} py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? 'text-brand-700 dark:text-[#faf9f5]'
                    : 'text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white/90 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
                style={
                  active
                    ? showCollapsed
                      ? {
                          background: dark ? 'rgba(255,255,255,0.08)' : '#EEF4FD',
                        }
                      : {
                          background: dark ? 'rgba(255,255,255,0.08)' : '#EEF4FD',
                          borderLeft: `3px solid ${n.iconColor}`,
                          paddingLeft: '9px',
                        }
                    : {}
                }
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
                  style={{
                    background: active
                      ? dark
                        ? `${n.iconColor}30`
                        : n.iconBg
                      : dark
                        ? `${n.iconColor}18`
                        : `${n.iconColor}14`,
                  }}
                >
                  <Icon
                    size={14}
                    style={{ color: active ? n.iconColor : dark ? n.iconColor + 'bb' : n.iconColor + '99' }}
                  />
                </div>
                {!showCollapsed && <span className="flex-1 truncate">{n.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Collapsed footer — notification + logout + account avatar. */}
      {showCollapsed ? (
        <div
          className="px-2 py-3 border-t shrink-0 flex flex-col items-center gap-1.5 relative"
          style={{ borderColor: dark ? 'rgba(255,255,255,0.05)' : '#e8edf4' }}
        >
          {AccountMenu}
          {/* Notifications are intentionally NOT shown on the collapsed rail —
              the bell + count live in the expanded sidebar; hover/expand to
              reach them. Keeps the narrow rail uncluttered. */}
          {/* No standalone sign-out here when collapsed — it lives inside the
              account menu (tap the avatar), keeping the rail uncluttered. */}
          <button
            type="button"
            title="Account menu"
            aria-label="Account menu"
            data-tour="account-menu"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setAccountMenuOpen((v) => !v)}
            className="relative shrink-0 rounded-full focus:outline-none mt-0.5"
          >
            <Avatar
              name={user.name}
              size={32}
              letter={user.avatarLetter}
              bg={user.avatarBg}
              font={user.avatarFont}
              image={user.avatarImage}
              ring
            />
          </button>
        </div>
      ) : (
        /* User footer — avatar + name open the account menu; the bell sits to
         the side, large enough to tap on touch devices. The whole strip is a
         single subtly-tinted card so the avatar doesn't read as floating in a
         corner — it feels like a deliberate identity panel. */
        <div
          className="p-3 border-t shrink-0 relative"
          style={{ borderColor: dark ? 'rgba(255,255,255,0.05)' : '#e8edf4' }}
        >
          {AccountMenu}

          <div
            className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors cursor-pointer ${
              dark ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-slate-50 hover:bg-slate-100/80'
            }`}
            style={{ border: dark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #e8edf4' }}
            onClick={() => setAccountMenuOpen((v) => !v)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Avatar + name -> account menu */}
            <button
              type="button"
              title="Account menu"
              aria-label="Account menu"
              data-tour="account-menu"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setAccountMenuOpen((v) => !v);
              }}
              className="relative shrink-0 rounded-full focus:outline-none"
            >
              <Avatar
                name={user.name}
                size={34}
                letter={user.avatarLetter}
                bg={user.avatarBg}
                font={user.avatarFont}
                image={user.avatarImage}
                ring
              />
            </button>

            <div className="flex-1 min-w-0">
              <div
                className={`text-[13px] font-bold truncate leading-tight ${dark ? 'text-white/90' : 'text-slate-800'}`}
              >
                {user.name}
              </div>
              {/* Role as plain muted metadata — no dot, no colour-coded chip. The
                role is contextual info, not an alert, so it shouldn't compete
                visually with the user's name above it. */}
              <div
                className={`text-[10px] font-semibold uppercase tracking-wider truncate mt-0.5 ${dark ? 'text-white/45' : 'text-slate-400'}`}
              >
                {roleText}
              </div>
            </div>

            {/* Notifications — opens upward so it's never clipped at the bottom.
              Seeded with the SSR unread count so the badge is correct on first
              paint instead of popping in after the first poll. */}
            <div onClick={(e) => e.stopPropagation()}>
              <NotificationBell dark={dark} openUp initialUnread={initialUnread} />
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <CurrentUserProvider user={user}>
      <AvatarRegistryProvider
        seed={{
          id: user.id,
          letter: user.avatarLetter,
          bg: user.avatarBg,
          font: user.avatarFont,
          image: user.avatarImage,
        }}
        initial={initialAvatars}
      >
        {/* Fixed-height app shell: the shell itself never scrolls (overflow-hidden),
        so the sidebar stays put — only <main> scrolls. This is what keeps the
        sidebar pinned regardless of how far the page content scrolls. */}
        <div
          className="h-screen flex overflow-hidden"
          style={{ background: 'var(--bg-page)' }}
          onPointerOver={(e) => {
            const a = (e.target as HTMLElement).closest('a[href^="/"]') as HTMLAnchorElement | null;
            if (!a) return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('//')) return;
            try {
              router.prefetch(href);
            } catch {
              /* ignore */
            }
          }}
          onClick={(e) => {
            const a = (e.target as HTMLElement).closest('a[href^="/"]') as HTMLAnchorElement | null;
            if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            window.dispatchEvent(new Event('pragati:nav-start'));
          }}
        >
          <NavigationProgress />
          {/* Mobile backdrop */}
          <div
            className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
              open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* ── Sidebar ─────────────────────────────────────────────────────── */}
          <aside
            className={`
          shrink-0 flex flex-col
          fixed inset-y-0 left-0 z-50
          lg:sticky lg:top-0 lg:h-screen
          transition-[transform,width] duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${collapsed && !open && sidebarHovered ? 'lg:fixed lg:z-50' : ''}
        `}
            style={{
              width: showCollapsed ? 68 : sidebarWidth,
              background: dark ? '#262624' : '#ffffff',
              borderRight: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e8edf4',
              boxShadow:
                collapsed && !open && sidebarHovered
                  ? dark
                    ? '4px 0 24px rgba(0,0,0,0.5)'
                    : '4px 0 24px rgba(15,23,42,0.18)'
                  : undefined,
            }}
            onMouseEnter={() => {
              if (collapsed && !open) setSidebarHovered(true);
            }}
            onMouseLeave={() => setSidebarHovered(false)}
            onClick={() => {
              if (collapsed && !open && sidebarHovered) {
                toggleCollapsed();
                setSidebarHovered(false);
              }
            }}
          >
            {SidebarInner}

            {/* Drag-to-resize handle — shown on expanded desktop sidebar only.
            Split into top/bottom halves to leave a gap at the vertical midpoint
            where the collapse button sits, so the two never conflict. */}
            {!showCollapsed && (
              <>
                <div
                  className="hidden lg:block absolute right-0 top-0 w-1 group/drag cursor-col-resize z-20"
                  style={{ bottom: 'calc(50% + 22px)' }}
                  onMouseDown={onDragHandleMouseDown}
                  aria-hidden="true"
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 w-[3px] transition-all duration-150 rounded-full opacity-0 group-hover/drag:opacity-100"
                    style={{ background: '#3b82f6', margin: '8px 0' }}
                  />
                </div>
                <div
                  className="hidden lg:block absolute right-0 bottom-0 w-1 group/drag2 cursor-col-resize z-20"
                  style={{ top: 'calc(50% + 22px)' }}
                  onMouseDown={onDragHandleMouseDown}
                  aria-hidden="true"
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 w-[3px] transition-all duration-150 rounded-full opacity-0 group-hover/drag2:opacity-100"
                    style={{ background: '#3b82f6', margin: '8px 0' }}
                  />
                </div>
              </>
            )}

            {/* Collapse/expand ribbon — desktop only, on the right edge of sidebar.
            z-[25] sits above the drag handle (z-20) so hovering the button
            never activates the resize cursor behind it. */}
            <button
              className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-[25] w-5 h-10 items-center justify-center rounded-full transition-colors cursor-pointer"
              style={{
                background: dark ? '#30302e' : '#ffffff',
                border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #dde3ec',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                color: dark ? 'rgba(255,255,255,0.35)' : '#94a3b8',
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapsed();
                setSidebarHovered(false);
              }}
              title={showCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={showCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {showCollapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
            </button>
          </aside>

          {/* ── Main content ─────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            {/* Mobile-only top bar — taller for better touch targets, right side
            shows notification bell instead of the hamburger (nav is bottom). */}
            <div
              className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14"
              style={{
                background: dark ? 'rgba(38,38,36,0.92)' : 'rgba(255,255,255,0.92)',
                backdropFilter: 'saturate(180%) blur(12px)',
                WebkitBackdropFilter: 'saturate(180%) blur(12px)',
                borderBottom: dark ? '1px solid rgba(255,255,255,0.07)' : '1px solid #e8edf4',
                boxShadow: dark ? '0 2px 16px rgba(0,0,0,0.45)' : '0 2px 12px rgba(15,23,42,0.07)',
              }}
            >
              <Link href="/" className="flex items-center gap-2.5">
                <PragatiMark size={26} />
                <span
                  className={`brand-wordmark text-[17px] ${dark ? 'text-white' : 'brand-wordmark-gradient'}`}
                >
                  Pragati
                </span>
              </Link>
              <div className="flex items-center gap-2">
                <NotificationBell dark={dark} openUp={false} initialUnread={initialUnread} />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="relative rounded-full focus:outline-none"
                  aria-label="Account menu"
                  data-tour="account-menu"
                >
                  <Avatar
                    name={user.name}
                    size={32}
                    letter={user.avatarLetter}
                    bg={user.avatarBg}
                    font={user.avatarFont}
                    image={user.avatarImage}
                    ring
                  />
                </button>
              </div>
            </div>

            {/* Page content — on mobile, pad the bottom so content isn't hidden
            behind the bottom tab bar (approx 64px + safe-area). */}
            <main className="flex-1 min-h-0 overflow-y-auto relative">
              {pathname === '/' && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 right-0 h-[200px]"
                  style={{
                    zIndex: 0,
                    background:
                      'linear-gradient(180deg, rgba(21,101,192,0.09) 0%, rgba(21,101,192,0.04) 50%, transparent 100%)',
                  }}
                />
              )}
              <div
                key={pathname}
                className="page-fade max-w-7xl mx-auto px-4 sm:px-5 lg:px-7 py-5 lg:py-7 pb-24 lg:pb-7 relative overflow-x-hidden"
              >
                {children}
              </div>
            </main>

            {/* ── Mobile bottom navigation bar ──────────────────────────────── */}
            {/* Replaces the hamburger drawer for primary navigation on touch
            devices. The account menu is accessed via the top-bar avatar. */}
            <nav
              className="lg:hidden fixed bottom-0 inset-x-0 z-40 mobile-bottom-nav"
              style={{
                background: dark ? 'rgba(38,38,36,0.97)' : 'rgba(255,255,255,0.97)',
                borderTop: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e8edf4',
                boxShadow: dark ? '0 -4px 20px rgba(0,0,0,0.5)' : '0 -4px 20px rgba(15,23,42,0.08)',
                backdropFilter: 'saturate(180%) blur(12px)',
                WebkitBackdropFilter: 'saturate(180%) blur(12px)',
                paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
              }}
              aria-label="Main navigation"
            >
              <div className="flex items-center justify-around pt-2 px-2">
                {/* Show up to 4 primary nav items + My Day = 5 tabs max. */}
                {[
                  // Mobile is its own composition, not a compressed desktop:
                  // 5 thumb-reach tabs — the three core surfaces, My Day, and
                  // the user's own profile. Admin surfaces stay in the avatar
                  // sheet, where they always lived on mobile.
                  ...nav.slice(0, 3),
                  myDayItem,
                  {
                    href: user.username ? `/${user.username}` : '/settings',
                    label: 'Profile',
                    icon: UserCircle,
                    iconColor: '#C2185B',
                    iconBg: '#FCE4EC',
                  } as NavItem,
                ].map((n) => {
                  const Icon = n.icon;
                  const active = isActive(n.href);
                  const tourKey = `nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      prefetch
                      data-mobile-tour={tourKey}
                      className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors min-w-[52px]"
                      style={
                        active
                          ? {
                              background: dark ? 'rgba(255,255,255,0.06)' : `${n.iconColor}12`,
                            }
                          : {}
                      }
                    >
                      <div className="relative w-6 h-6 flex items-center justify-center">
                        <Icon
                          size={active ? 20 : 18}
                          style={{ color: active ? n.iconColor : dark ? 'rgba(255,255,255,0.4)' : '#94a3b8' }}
                        />
                        {n.adminOnly && (
                          <span
                            className="absolute top-0 right-0 w-2 h-2 rounded-full bg-amber-400"
                            style={{ boxShadow: `0 0 0 2px ${dark ? '#262624' : '#ffffff'}` }}
                            title="Admin"
                          />
                        )}
                      </div>
                      <span
                        className="text-[9px] font-semibold truncate max-w-full"
                        style={{ color: active ? n.iconColor : dark ? 'rgba(255,255,255,0.35)' : '#94a3b8' }}
                      >
                        {n.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>

          {/* Mobile account menu — slides up from the avatar button in the top bar.
          Uses its own mobileMenuOpen state so the desktop sidebar's mousedown
          outside-click handler (accountMenuRef) never races with navigation. */}
          {mobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 z-[55]" onClick={() => setMobileMenuOpen(false)}>
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-3xl shadow-2xl p-6 space-y-1"
                style={{
                  background: dark ? '#262624' : '#ffffff',
                  border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #dbe3ef',
                  boxShadow: dark ? '0 -20px 60px rgba(0,0,0,0.6)' : '0 -20px 60px rgba(15,23,42,0.15)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Drag handle indicator */}
                <div className="flex justify-center mb-4">
                  <div
                    className="w-10 h-1 rounded-full"
                    style={{ background: dark ? 'rgba(255,255,255,0.15)' : '#e2e8f0' }}
                  />
                </div>
                {/* User identity */}
                <div
                  className="flex items-center gap-3 pb-4 mb-2 border-b"
                  style={{ borderColor: dark ? 'rgba(255,255,255,0.08)' : '#eef2f7' }}
                >
                  <Avatar
                    name={user.name}
                    size={44}
                    letter={user.avatarLetter}
                    bg={user.avatarBg}
                    font={user.avatarFont}
                    image={user.avatarImage}
                    ring
                  />
                  <div>
                    <div className={`text-sm font-black ${dark ? 'text-white' : 'text-slate-900'}`}>
                      {user.name}
                    </div>
                    <div className={`text-[11px] ${dark ? 'text-white/45' : 'text-slate-400'}`}>
                      {user.username ? `@${user.username}` : roleText}
                    </div>
                  </div>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors ${dark ? 'text-white/70 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <UserCircle size={18} className="text-slate-400" /> Profile &amp; settings
                </Link>
                {/* Whiteboard doesn't fit the 5-tab bottom bar, so the sheet is
                its mobile entry point — the canvas itself is touch-native. */}
                {WHITEBOARD_ENABLED && (
                  <Link
                    href="/whiteboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors ${dark ? 'text-white/70 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <Presentation size={18} style={{ color: '#0E7490' }} /> Think
                  </Link>
                )}
                {/* Admin-only links — these never fit in the 4-tab bottom nav, so
                this is the only mobile entry point for Logs (and Platform for
                master-admins). */}
                {isAdmin && [...adminExtra, ...masterAdminExtra].length > 0 && (
                  <>
                    <div
                      className={`px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-amber-400/70' : 'text-amber-600/80'}`}
                    >
                      Admin
                    </div>
                    {[...adminExtra, ...masterAdminExtra].map((n) => {
                      const Icon = n.icon;
                      return (
                        <Link
                          key={n.href}
                          href={n.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors ${dark ? 'text-white/70 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          <Icon size={18} style={{ color: n.iconColor }} /> {n.label}
                        </Link>
                      );
                    })}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    toggleDark();
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors ${dark ? 'text-white/70 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {dark ? (
                    <Sun size={18} className="text-amber-400" />
                  ) : (
                    <Moon size={18} className="text-slate-400" />
                  )}
                  {dark ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setConfirmLogout(true);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-colors ${dark ? 'text-red-400 hover:bg-red-400/10' : 'text-red-600 hover:bg-red-50'}`}
                >
                  <LogOut size={18} /> Sign out
                </button>
              </div>
            </div>
          )}

          {mustChangePw && (
            <ForcePasswordModal
              onDone={() => {
                setMustChangePw(false);
                router.refresh();
              }}
            />
          )}

          {/* Quick-PIN prompt — only after the password step (if any) is cleared,
          and from the user's second login onward (see shouldOfferPin above).
          Dismissable: "Maybe later" records pinPromptDismissedAt so we stop
          blocking and re-offer gently next session. */}
          {!mustChangePw && needsPin && (
            <SetPinModal
              onDone={() => {
                setNeedsPin(false);
                router.refresh();
              }}
              onDismiss={async () => {
                setNeedsPin(false);
                try {
                  await api('/me/pin-prompt-dismissed', { method: 'POST' });
                } catch {
                  /* best-effort */
                }
              }}
            />
          )}

          {/* Guided product tour — gated behind the forced-password step so the
          two full-screen overlays never stack on a brand-new account. The
          component is itself the source of truth on whether to open: it
          checks `alreadySeen` (server) and a localStorage fast-path, and
          POSTs /api/me/tour-seen on dismissal so it never reappears. */}
          {!mustChangePw && <FirstTimeTour alreadySeen={!!user.hasSeenTour} role={user.role} />}

          {/* Sign-out confirmation — fixed centered modal, works in both expanded and collapsed sidebar */}
          {confirmLogout && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
              onClick={() => setConfirmLogout(false)}
            >
              <div
                className="w-[300px] rounded-2xl p-6 flex flex-col items-center gap-4 text-center shadow-2xl"
                style={{
                  background: dark ? '#262624' : '#ffffff',
                  border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #e2e8f0',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: dark ? 'rgba(239,68,68,0.12)' : '#FEF2F2' }}
                >
                  <AlertTriangle size={18} className="text-red-500" />
                </div>
                <div>
                  <div className={`text-sm font-bold ${dark ? 'text-white/90' : 'text-slate-800'}`}>
                    Sign out?
                  </div>
                  <div className={`text-xs mt-1 ${dark ? 'text-white/40' : 'text-slate-400'}`}>
                    You'll need to sign back in.
                  </div>
                </div>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => setConfirmLogout(false)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      dark
                        ? 'text-white/60 hover:text-white/80'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    style={dark ? { background: 'rgba(255,255,255,0.07)' } : {}}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={logout}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
                      dark ? 'text-red-300 hover:text-red-200' : 'text-red-600 bg-red-50 hover:bg-red-100'
                    }`}
                    style={dark ? { background: 'rgba(239,68,68,0.18)' } : {}}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Keyboard shortcuts modal ─────────────────────────────────────── */}
          {shortcutsOpen && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm"
              onClick={() => setShortcutsOpen(false)}
            >
              <div
                className="w-[340px] rounded-2xl p-5 shadow-2xl"
                style={{
                  background: dark ? '#262624' : '#ffffff',
                  border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #e2e8f0',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className={`text-sm font-black mb-4 tracking-tight ${dark ? 'text-white/90' : 'text-slate-800'}`}
                >
                  Keyboard shortcuts
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { keys: ['⌘', 'K'], label: 'Command palette' },
                    { keys: ['G', 'D'], label: 'Dashboard' },
                    { keys: ['G', 'P'], label: 'Projects' },
                    { keys: ['G', 'T'], label: 'Teams' },
                    { keys: ['G', 'M'], label: 'My Day' },
                    ...(WHITEBOARD_ENABLED
                      ? [{ keys: ['G', 'W'], label: 'Whiteboard' }]
                      : []),
                    { keys: ['?'], label: 'Shortcuts' },
                    { keys: ['Esc'], label: 'Close dialogs' },
                  ].map(({ keys, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="flex items-center gap-1 shrink-0">
                        {keys.map((k, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold font-mono leading-none ${
                              dark
                                ? 'bg-white/10 text-white/70 border border-white/15'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                      <span
                        className={`text-[12px] font-medium ${dark ? 'text-white/55' : 'text-slate-500'}`}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  className={`mt-4 w-full py-2 rounded-xl text-xs font-semibold transition-colors ${
                    dark
                      ? 'text-white/50 hover:text-white/70 bg-white/5 hover:bg-white/8'
                      : 'text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100'
                  }`}
                  onClick={() => setShortcutsOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            dark={dark}
            user={{ name: user.name, role: user.role, username: user.username }}
            onToggleDark={toggleDark}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onLogout={logout}
          />

          {/* Idle session warning — 5 min before automatic sign-out */}
          {idleWarning && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div
                className="w-[320px] rounded-2xl p-6 flex flex-col gap-4 text-center shadow-2xl"
                style={{
                  background: dark ? '#262624' : '#ffffff',
                  border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #e2e8f0',
                }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                  style={{ background: dark ? 'rgba(245,158,11,0.12)' : '#FEF3C7' }}
                >
                  <AlertTriangle size={22} className="text-amber-500" />
                </div>
                <div>
                  <div className={`text-base font-bold ${dark ? 'text-white/90' : 'text-slate-800'}`}>
                    Still there?
                  </div>
                  <div className={`text-xs mt-1 leading-snug ${dark ? 'text-white/45' : 'text-slate-500'}`}>
                    You'll be signed out in 5 minutes due to inactivity.
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      lastActivityRef.current = Date.now();
                      setIdleWarning(false);
                    }}
                    className="flex-1 py-2 rounded-xl text-sm font-bold transition-colors"
                    style={
                      dark
                        ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)' }
                        : { background: '#F1F5F9', color: '#475569' }
                    }
                  >
                    Continue
                  </button>
                  <button
                    onClick={logout}
                    className="flex-1 py-2 rounded-xl text-sm font-bold text-red-500 transition-colors"
                    style={dark ? { background: 'rgba(239,68,68,0.18)' } : { background: '#FEF2F2' }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AvatarRegistryProvider>
    </CurrentUserProvider>
  );
}
