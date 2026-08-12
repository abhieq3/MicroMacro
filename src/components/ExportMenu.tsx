'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Sheet, ChevronDown, FileSpreadsheet, Network, Image } from 'lucide-react';

export function ExportMenu({
  onExcel,
  onPdf,
  onCsv,
  onBirdEyeSvg,
  onBirdEyePng,
  label = 'Export',
  disabled = false,
}: {
  onExcel?: () => void;
  onPdf?: () => void;
  onCsv?: () => void;
  onBirdEyeSvg?: () => void;
  onBirdEyePng?: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 12 });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const placeMenu = () => {
      const trigger = buttonRef.current?.getBoundingClientRect();
      if (!trigger) return;
      setMenuPosition({
        top: trigger.bottom + 6,
        right: Math.max(12, window.innerWidth - trigger.right),
      });
    };

    placeMenu();
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open]);

  const items = [
    ...(onExcel
      ? [
          {
            key: 'xlsx',
            label: 'Excel',
            hint: 'Editable — dropdowns, filters, live totals',
            icon: FileSpreadsheet,
            onClick: onExcel,
            tint: '#15803d',
          },
        ]
      : []),
    ...(onPdf
      ? [
          {
            key: 'pdf',
            label: 'PDF',
            hint: 'Formatted report, ready to share',
            icon: FileText,
            onClick: onPdf,
            tint: '#dc2626',
          },
        ]
      : []),
    ...(onCsv
      ? [
          {
            key: 'csv',
            label: 'CSV',
            hint: 'Raw data — import to any spreadsheet',
            icon: Sheet,
            onClick: onCsv,
            tint: '#16a34a',
          },
        ]
      : []),
    ...(onBirdEyeSvg
      ? [
          {
            key: 'bird-eye-svg',
            label: 'Bird Eye View · SVG',
            hint: 'Vector map — scales to any size, crisp in print',
            icon: Network,
            onClick: onBirdEyeSvg,
            tint: '#2563eb',
          },
        ]
      : []),
    ...(onBirdEyePng
      ? [
          {
            key: 'bird-eye-png',
            label: 'Bird Eye View · PNG',
            hint: 'High-res image, ready to paste into a deck',
            icon: Image,
            onClick: onBirdEyePng,
            tint: '#7c3aed',
          },
        ]
      : []),
  ];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800 transition-colors disabled:opacity-50"
        title="Export this report"
      >
        <Download size={15} /> {label}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed w-64 max-w-[calc(100vw-24px)] rounded-xl border border-slate-200/80 bg-white dark:bg-[#262624] dark:border-white/10 shadow-xl z-[80] overflow-hidden p-1 modal-in"
            style={{
              top: menuPosition.top,
              right: menuPosition.right,
              maxHeight: `calc(100vh - ${menuPosition.top + 12}px)`,
              overflowY: 'auto',
              boxShadow: '0 18px 44px rgba(15,23,42,0.16)',
            }}
          >
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Download as
            </div>
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${it.tint}1a` }}
                  >
                    <Icon size={15} style={{ color: it.tint }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-white/90">
                      {it.label}
                    </span>
                    <span className="block text-[11px] text-slate-400">{it.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
