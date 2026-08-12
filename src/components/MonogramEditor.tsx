'use client';
import { useEffect, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import { Avatar, AVATAR_PRESETS } from './ui';
import { X, Sparkles, Check } from 'lucide-react';

/**
 * Minimal monogram editor.
 *
 * Pick a letter and roll a "Surprise me" combination — every preset behind
 * that button is a hand-curated (colour, font) pair validated to read
 * beautifully at the 28–32px sizes avatars actually live in (see
 * AVATAR_PRESETS in ui.tsx). A row of small dots lets a user nudge to a
 * specific preset without scrolling a sea of swatches.
 */

interface Props {
  initial: { letter: string; bg: string; font: number };
  name: string;
  onSave: (next: { letter: string; bg: string; font: number }) => Promise<void> | void;
  onClose: () => void;
}

function findPresetIndex(bg: string | undefined, font: number | undefined): number {
  if (!bg) return 0;
  const i = AVATAR_PRESETS.findIndex(
    (p) => p.bg.toLowerCase() === bg.toLowerCase() && p.font === (font ?? 0),
  );
  return i >= 0 ? i : 0;
}

export function MonogramEditor({ initial, name, onSave, onClose }: Props) {
  const defaultLetter = (name || '').trim().charAt(0).toUpperCase() || 'A';
  const [letter, setLetter] = useState((initial.letter || defaultLetter).slice(0, 2).toUpperCase());
  const [idx, setIdx] = useState<number>(findPresetIndex(initial.bg, initial.font));
  const [saving, setSaving] = useState(false);
  const preset = AVATAR_PRESETS[idx] || AVATAR_PRESETS[0];

  function surpriseMe() {
    // Always land on a different preset than the one currently showing —
    // a re-roll that returns the same combination feels broken.
    let next = idx;
    while (next === idx && AVATAR_PRESETS.length > 1) {
      next = Math.floor(Math.random() * AVATAR_PRESETS.length);
    }
    setIdx(next);
  }

  // Esc to dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    try {
      await onSave({ letter: letter || defaultLetter, bg: preset.bg, font: preset.font });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#262624] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white/90">Your avatar</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Hero preview */}
          <div className="flex flex-col items-center gap-4 px-5 py-7">
            <Avatar name={name} letter={letter} bg={preset.bg} font={preset.font} size={88} />

            {/* Letter input */}
            <input
              value={letter}
              maxLength={2}
              onChange={(e) => {
                const v = e.target.value
                  .replace(/[^A-Za-z0-9]/g, '')
                  .slice(0, 2)
                  .toUpperCase();
                setLetter(v);
              }}
              placeholder={defaultLetter}
              aria-label="Monogram letter(s)"
              className="text-center text-base font-bold tracking-widest w-24 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-800 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />

            {/* Hero action — Surprise me */}
            <button
              type="button"
              onClick={surpriseMe}
              className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: 'linear-gradient(120deg, #1565C0 0%, #1976D2 45%, #2E7D32 100%)' }}
            >
              <Sparkles size={15} className="transition-transform duration-500 group-hover:rotate-180" />
              Surprise me
            </button>

            {/* Tiny preset dots — direct pick without leaving the dialog. Each dot
              is rendered in its own (bg, font) so you preview the combo, not
              just the colour. */}
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-[280px]">
              {AVATAR_PRESETS.map((p, i) => {
                const active = i === idx;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-pressed={active}
                    aria-label={`Style ${i + 1}`}
                    className="relative transition-transform hover:scale-110 active:scale-95"
                    style={{ outline: 'none' }}
                  >
                    <Avatar
                      name={letter || defaultLetter}
                      letter={letter || defaultLetter}
                      bg={p.bg}
                      font={p.font}
                      size={26}
                    />
                    {active && (
                      <span
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                        style={{ background: '#1565C0' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-sm font-semibold text-slate-500 dark:text-white/60 hover:text-slate-700 dark:hover:text-white/80 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Check size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
