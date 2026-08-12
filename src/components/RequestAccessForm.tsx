'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { ArrowRight } from 'lucide-react';

/**
 * Public "let me in" form. Invite-only workspace — this is the only thing a
 * stranger can complete without an account. Shared by /request-access and
 * the login-page request mode so both surfaces speak the same sentence.
 */
export function RequestAccessForm({ compact = false }: { compact?: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await api<{ ok: true; message: string; kind?: string }>('/access-requests', {
        method: 'POST',
        body: { name, email, organisation, title, note, website },
      });
      setDone(res.message || "Request received. We'll review it and get back to you.");
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.');
      setLoading(false);
    }
  }

  if (done) {
    const alreadyMember = /already have an account/i.test(done);
    return (
      <div className="form-swap space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm text-emerald-900 leading-snug font-medium">{done}</p>
        </div>
        {alreadyMember ? (
          <Link href="/login" className="btn-primary w-full justify-center py-3 text-sm font-bold">
            Sign in
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        ) : (
          <p className="text-xs text-slate-400 leading-snug">
            Invite-only — an admin reviews every request. Already on the workspace?{' '}
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">
              Sign in
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="relative space-y-4">
      <div>
        <label className="label" htmlFor="access-name">
          Full name
        </label>
        <input
          id="access-name"
          className="input"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </div>
      <div>
        <label className="label" htmlFor="access-email">
          Work email
        </label>
        <input
          id="access-email"
          className="input"
          type="email"
          required
          autoComplete="email"
          spellCheck={false}
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </div>
      <div>
        <label className="label" htmlFor="access-org">
          Organisation <span className="normal-case font-normal text-slate-300">(optional)</span>
        </label>
        <input
          id="access-org"
          className="input"
          autoComplete="organization"
          value={organisation}
          onChange={(e) => setOrganisation(e.target.value)}
          placeholder="Company or team"
        />
      </div>
      {!compact && (
        <>
          <div>
            <label className="label" htmlFor="access-title">
              Role <span className="normal-case font-normal text-slate-300">(optional)</span>
            </label>
            <input
              id="access-title"
              className="input"
              autoComplete="organization-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Team lead"
            />
          </div>
          <div>
            <label className="label" htmlFor="access-note">
              Why you need it <span className="normal-case font-normal text-slate-300">(optional)</span>
            </label>
            <textarea
              id="access-note"
              className="input min-h-[88px] resize-y"
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A sentence is enough."
            />
          </div>
        </>
      )}
      {/* Honeypot — off-screen, tab-skipped. Bots that fill it are dropped. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="access-website">Website</label>
        <input
          id="access-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      {err && (
        <div
          role="alert"
          aria-live="assertive"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-snug"
        >
          {err}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="btn-primary w-full justify-center py-3 text-sm font-bold group"
        style={{ boxShadow: '0 4px 14px rgba(21,101,192,0.35)' }}
      >
        {loading ? (
          <>
            <span
              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
              aria-hidden="true"
            />
            <span>Sending…</span>
          </>
        ) : (
          <>
            Request access
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </>
        )}
      </button>
    </form>
  );
}
