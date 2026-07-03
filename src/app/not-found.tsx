import Link from 'next/link';
import { PragatiMark } from '@/components/PragatiMark';

/**
 * App-wide 404. Lives at the root segment so unknown URLs across every
 * route fall through to the same friendly screen instead of Next's
 * default plain-text page.
 */
export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="inline-flex">
          <PragatiMark size={56} flat />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">We can't find that page.</h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          The link you followed might be out of date, or you may not have access. Either way: this page is not
          the main thing — your dashboard is.
        </p>
        <div>
          <Link href="/" className="btn-primary text-sm inline-flex">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
