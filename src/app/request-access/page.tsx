import Link from 'next/link';
import { PragatiMark } from '@/components/PragatiMark';
import { RequestAccessForm } from '@/components/RequestAccessForm';

export const metadata = {
  title: 'Request access',
  description: 'Everyone sees the whole board. Request access to Pragati.',
};

/**
 * Public conversion page. A stranger lands, understands the product in one
 * breath, and can ask to be let in — no account required. Sign-in lives
 * next door; this page does not pretend to be a sign-up.
 */
export default function RequestAccessPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: '#F4F7FB' }}
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <PragatiMark size={48} />
          <div className="brand-wordmark brand-wordmark-gradient text-2xl mt-3">Pragati</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-slate-100">
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              Everyone sees the whole board
            </h1>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              Overdue, blocked, due, owner. If you can see it, you don&apos;t need a status meeting. Finished
              work is celebrated. Nothing is quietly deleted.
            </p>
          </div>

          <div className="p-6">
            <RequestAccessForm />
          </div>

          <div className="px-6 py-4 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-400">
              Already on this workspace?{' '}
              <Link href="/login" className="text-blue-600 font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
