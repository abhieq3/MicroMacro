'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Custom listbox — a styled, accessible replacement for the native <select>.
 *
 * Matches the look of `.input` / `.select` (so it lines up in forms) but opens
 * a polished popover with hover/active states, a check on the selected row,
 * full keyboard support, and a brand-gradient accent — instead of the OS'
 * default menu. Drop-in: pass `value`, `onChange`, and `options`.
 *
 * The popover is portalled to <body> and positioned against the trigger so it
 * never gets clipped by an ancestor's `overflow:hidden`.
 */
export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = '',
  disabled = false,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(
    null,
  );

  const selected = options.find((o) => o.value === value) || null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const POP_H = Math.min(options.length * 38 + 12, 300);
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < POP_H + 12 && r.top > POP_H + 12;
      setCoords({
        top: openUp ? r.top - POP_H - 6 : r.bottom + 6,
        left: r.left,
        width: r.width,
        openUp,
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // When opening, focus the currently-selected row.
  useEffect(() => {
    if (open)
      setActive(
        Math.max(
          0,
          options.findIndex((o) => o.value === value),
        ),
      );
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(idx: number) {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    btnRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(active);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(options.length - 1);
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`select flex items-center justify-between gap-2 text-left ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${open ? 'ring-2 ring-blue-100 border-blue-300' : ''}`}
        style={{ backgroundImage: 'none', paddingRight: '0.75rem' }}
      >
        <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {mounted &&
        open &&
        coords &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            tabIndex={-1}
            className="popover-in fixed z-[9999] rounded-xl border border-slate-200/80 bg-white dark:bg-[#262624] dark:border-white/10 shadow-xl overflow-hidden p-1 datepicker-pop origin-top"
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: 300,
              overflowY: 'auto',
              boxShadow: '0 18px 44px rgba(15,23,42,0.16)',
            }}
            onKeyDown={onKeyDown}
          >
            {options.map((opt, i) => {
              const isSel = opt.value === value;
              const isActive = i === active;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  disabled={opt.disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(i)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
                    opt.disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : isActive
                        ? 'bg-blue-50 dark:bg-white/5'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="w-4 shrink-0 flex items-center justify-center">
                    {isSel && <Check size={14} className="text-blue-600 dark:text-blue-400" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate ${isSel ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-white/80'}`}
                    >
                      {opt.label}
                    </span>
                    {opt.hint && (
                      <span className="block text-[11px] text-slate-400 truncate">{opt.hint}</span>
                    )}
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
