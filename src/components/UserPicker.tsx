'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

interface UserPickerProps {
  value: string;
  onChange: (v: string) => void;
  teamId?: string | null;
  excludeAdmin?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  valueLabel?: string | null;
}

export function UserPicker({
  value,
  onChange,
  teamId,
  disabled,
  size = 'md',
  placeholder = 'Unassigned',
  className = '',
  ariaLabel,
}: UserPickerProps) {
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!teamId) return;
    api<any>(`/teams/${teamId}`)
      .then((t) => setMembers(t.members || []))
      .catch(() => {});
  }, [teamId]);

  const small = size === 'sm';

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${small ? 'text-xs px-2 py-1' : 'text-sm px-3 py-2'} w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-800 dark:text-white/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${className}`}
    >
      <option value="">{placeholder}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
