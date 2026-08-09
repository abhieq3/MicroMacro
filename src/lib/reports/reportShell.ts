/**
 * Shared HTML report shell — print/PDF grade.
 *
 * Used by team + project exports so every artifact looks like one product:
 * classic Pragati blue→green brand, A4 print rules, page chrome, and a
 * floating "Save as PDF" bar. Pure string builders — no React, no DOM deps
 * until open/download on the client.
 */

export function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtDate(d: any): string {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: any = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export function dueDaysFromNow(d: any): number | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const dueDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((dueDay - today) / 86400000);
}

export function isTaskOverdue(target: any, status: any): boolean {
  if (status === 'done') return false;
  const d = dueDaysFromNow(target);
  return d !== null && d < 0;
}

export function targetOf(t: any): any {
  return t?.ccTcd || t?.dueDate || null;
}

export const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
  planning: 'Planning',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STATUS_COLOR: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  review: '#8b5cf6',
  blocked: '#ef4444',
  done: '#22c55e',
  planning: '#94a3b8',
  on_hold: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export function bar(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= 90 ? '#22c55e' : clamped >= 60 ? '#3b82f6' : clamped >= 30 ? '#f59e0b' : '#94a3b8';
  return `<div class="bar"><div class="bar-fill" style="width:${clamped}%;background:${color}"></div></div>`;
}

export function statusDot(status: string): string {
  return `<span class="dot" style="background:${STATUS_COLOR[status] || '#94a3b8'}"></span>${esc(
    STATUS_LABEL[status] || status || '—',
  )}`;
}

export function ragPill(label: string, tone: 'ok' | 'warn' | 'bad' | 'neutral' = 'neutral'): string {
  const map = {
    ok: { bg: '#f0fdf4', color: '#15803d' },
    warn: { bg: '#fffbeb', color: '#b45309' },
    bad: { bg: '#fef2f2', color: '#b91c1c' },
    neutral: { bg: '#f1f5f9', color: '#475569' },
  }[tone];
  return `<span class="pill" style="background:${map.bg};color:${map.color};font-weight:700">${esc(label)}</span>`;
}

/** Brand mark SVG (inline) — classic Pragati blue→green. */
export function brandMarkSvg(size = 34): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="pg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop stop-color="#1565C0"/><stop offset="0.45" stop-color="#1769C8"/><stop offset="1" stop-color="#2B8C29"/></linearGradient></defs>
  <rect width="64" height="64" rx="17" fill="url(#pg)"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 40 L32 22 L50 40" stroke="#ffffff" stroke-width="7"/>
    <path d="M18 52 L32 38 L46 52" stroke="#B7E4C2" stroke-width="5" opacity="0.92"/>
  </g>
</svg>`;
}

export function reportCss(): string {
  return `
  @page { size: A4; margin: 14mm 12mm 16mm 12mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    margin: 0;
    background: #eef2f7;
    font-size: 12.5px;
    line-height: 1.45;
  }
  .page {
    max-width: 880px;
    margin: 24px auto;
    padding: 36px 40px 44px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(15,23,42,.06), 0 12px 40px rgba(15,23,42,.06);
    border-radius: 4px;
  }
  .brand {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 3px solid #1565C0;
    padding-bottom: 14px;
    margin-bottom: 4px;
  }
  .brand .mark { display: flex; align-items: center; gap: 10px; }
  .brand .logo {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: .16em;
    color: #1565C0;
    text-transform: uppercase;
    line-height: 1.25;
  }
  .brand .logo small {
    display: block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .1em;
    color: #94a3b8;
  }
  .brand .gen {
    font-size: 10.5px;
    color: #94a3b8;
    text-align: right;
    line-height: 1.45;
  }
  .doc-type {
    display: inline-block;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: #1565C0;
    background: #E3F2FD;
    border-radius: 4px;
    padding: 3px 8px;
    margin-bottom: 8px;
  }
  h1 {
    font-size: 24px;
    margin: 10px 0 4px;
    letter-spacing: -0.02em;
    line-height: 1.2;
    font-weight: 900;
  }
  h2 {
    font-size: 11px;
    margin: 28px 0 10px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: #1565C0;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 6px;
    font-weight: 800;
    break-after: avoid;
    page-break-after: avoid;
  }
  h3 {
    font-size: 12.5px;
    margin: 16px 0 6px;
    color: #334155;
    font-weight: 700;
    break-after: avoid;
  }
  .muted { color: #94a3b8; font-weight: 400; }
  .sub { color: #64748b; margin: 0; font-size: 12.5px; line-height: 1.5; }
  .refchip {
    display: inline-block;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    font-weight: 700;
    color: #1565C0;
    background: #E3F2FD;
    border-radius: 6px;
    padding: 3px 9px;
    margin-top: 6px;
  }
  .summary {
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    border-left: 4px solid #1565C0;
    border-radius: 0 10px 10px 0;
    padding: 14px 16px;
    margin: 16px 0;
    font-size: 13px;
    line-height: 1.65;
  }
  .summary b { font-weight: 800; }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 14px 0 6px;
  }
  @media (max-width: 720px) {
    .kpis { grid-template-columns: repeat(2, 1fr); }
  }
  .kpi {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 12px 14px;
    background: #fff;
  }
  .kpi .n {
    font-size: 22px;
    font-weight: 900;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .kpi .l {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: #64748b;
    margin-top: 4px;
    font-weight: 700;
  }
  .kpi.warn .n { color: #b45309; }
  .kpi.bad .n { color: #b91c1c; }
  .kpi.ok .n { color: #15803d; }
  .dist {
    display: flex;
    height: 12px;
    border-radius: 6px;
    overflow: hidden;
    margin: 6px 0 10px;
    border: 1px solid #e2e8f0;
  }
  .dist .seg { min-width: 2px; }
  .legend {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 11px;
    color: #475569;
    margin-bottom: 6px;
  }
  .legend .lg { display: inline-flex; align-items: center; gap: 5px; }
  .legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
    margin-bottom: 6px;
  }
  th, td {
    text-align: left;
    padding: 7px 8px;
    border-bottom: 1px solid #eef2f7;
    vertical-align: middle;
  }
  th {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #64748b;
    background: #f8fafc;
    font-weight: 800;
  }
  tbody tr:hover td { background: #fafbfd; }
  .pill {
    font-size: 10.5px;
    padding: 2px 8px;
    border-radius: 99px;
    background: #eef2f7;
    color: #475569;
    display: inline-block;
  }
  .bar { height: 7px; background: #eef2f7; border-radius: 99px; overflow: hidden; min-width: 72px; }
  .bar-fill { height: 100%; border-radius: 99px; }
  .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 99px;
    margin-right: 5px;
    vertical-align: middle;
  }
  .risk {
    border: 1px solid #fecaca;
    background: #fef2f2;
    border-radius: 10px;
    padding: 2px 10px 8px;
  }
  .risk table th { background: #fff5f5; }
  .callout {
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 12.5px;
    line-height: 1.55;
    margin: 10px 0 4px;
  }
  .callout.warn { border-color: #fde68a; background: #fffbeb; }
  .callout.bad { border-color: #fecaca; background: #fef2f2; }
  .callout strong { font-weight: 800; }
  .footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 10px;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .footer .conf {
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: #64748b;
  }
  .section-note {
    font-size: 11px;
    color: #64748b;
    margin: -4px 0 10px;
  }
  .num { font-variant-numeric: tabular-nums; }
  @media print {
    body { background: #fff; }
    .page {
      margin: 0;
      padding: 0;
      max-width: none;
      box-shadow: none;
      border-radius: 0;
    }
    h2 { break-after: avoid; page-break-after: avoid; }
    table { break-inside: auto; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .kpis { grid-template-columns: repeat(4, 1fr); }
    .no-print { display: none !important; }
  }
`;
}

export function wrapReportHtml(opts: {
  title: string;
  docType: string;
  generated: string;
  exportedBy?: string;
  bodyHtml: string;
  footerLeft?: string;
  footerRight?: string;
}): string {
  const conf = 'Internal use · Pragati';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>${reportCss()}</style>
</head>
<body>
  <div class="page">
    <div class="brand">
      <span class="mark">
        ${brandMarkSvg(34)}
        <span class="logo">Pragati<small>Bird's eye view</small></span>
      </span>
      <span class="gen">
        <span class="doc-type">${esc(opts.docType)}</span><br>
        Generated ${esc(opts.generated)}
        ${opts.exportedBy ? `<br>Exported by ${esc(opts.exportedBy)}` : ''}
      </span>
    </div>
    ${opts.bodyHtml}
    <div class="footer">
      <span class="conf">${esc(opts.footerLeft || conf)}</span>
      <span>${esc(opts.footerRight || `Generated by Pragati · ${opts.generated}`)}</span>
    </div>
  </div>
</body></html>`;
}

/** Inject floating print/PDF chrome into a full HTML document. */
export function withPrintChrome(html: string, opts?: { filenameHint?: string }): string {
  const hint = opts?.filenameHint ? esc(opts.filenameHint) : 'report';
  return html.replace(
    '</body>',
    `<div id="pragati-print-bar" class="no-print" style="position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif">
       <div style="background:#0f172a;color:#fff;border-radius:12px;padding:10px 12px;font-size:11px;line-height:1.4;max-width:240px;box-shadow:0 10px 30px rgba(15,23,42,.25)">
         <div style="font-weight:800;margin-bottom:2px">Save as PDF</div>
         <div style="opacity:.75">Print → Destination: <b>Save as PDF</b>. Margins: Default. Background graphics: On.</div>
       </div>
       <div style="display:flex;gap:8px">
         <button onclick="window.print()" style="background:linear-gradient(135deg,#1565C0,#2E7D32);color:#fff;border:0;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 6px 18px rgba(15,23,42,.2)">Save as PDF / Print</button>
         <button onclick="window.close()" style="background:#fff;color:#475569;border:1px solid #cbd5e1;border-radius:10px;padding:11px 14px;font-size:13px;font-weight:600;cursor:pointer">Close</button>
       </div>
     </div>
     <style>@media print { #pragati-print-bar { display:none !important; } }</style>
     <script>document.title=${JSON.stringify(hint)};</script>
     </body>`,
  );
}

export function openPrintableReport(html: string, filenameHint: string, fallbackDownload: () => void) {
  const w = window.open('', '_blank');
  if (!w) {
    fallbackDownload();
    return;
  }
  w.document.write(withPrintChrome(html, { filenameHint }));
  w.document.close();
  w.focus();
}

export function triggerDownload(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvCell(v: any): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvEscapeBom(rows: string[]): string {
  return '\uFEFF' + rows.join('\r\n');
}

export function tcdKey(t: any): number {
  const d = targetOf(t);
  return d ? new Date(d).getTime() : Number.POSITIVE_INFINITY;
}

export function byTcd(a: any, b: any): number {
  const k = tcdKey(a) - tcdKey(b);
  if (k !== 0) return k;
  return (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
}

export function distBar(tasks: any[]): { segments: string; legend: string } {
  const order = ['todo', 'in_progress', 'review', 'blocked', 'done'];
  const counts: Record<string, number> = {};
  for (const s of order) counts[s] = 0;
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
  const segments = order
    .filter((s) => counts[s] > 0)
    .map(
      (s) =>
        `<div class="seg" title="${STATUS_LABEL[s]}: ${counts[s]}" style="flex:${counts[s]};background:${STATUS_COLOR[s]}"></div>`,
    )
    .join('');
  const legend = order
    .map(
      (s) =>
        `<span class="lg"><i style="background:${STATUS_COLOR[s]}"></i>${STATUS_LABEL[s]} <b>${counts[s]}</b></span>`,
    )
    .join('');
  return { segments, legend };
}

export function kpi(
  n: string | number,
  label: string,
  tone?: 'ok' | 'warn' | 'bad',
): string {
  return `<div class="kpi${tone ? ` ${tone}` : ''}"><div class="n num">${esc(n)}</div><div class="l">${esc(label)}</div></div>`;
}
