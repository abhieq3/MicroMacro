'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { Whiteboard } from '@/components/Whiteboard';
import { api } from '@/lib/client/api';
import { Select } from '@/components/Select';

/**
 * The whiteboard's job: one living board per project, visible to the team.
 * Think the problem. Type the move. Make it a task. Wipe when it's solved.
 */

type Proj = { id: string; name: string; code?: string; status?: string };

export default function WhiteboardPageClient() {
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = params.get('project') || '';
  const [projects, setProjects] = useState<Proj[]>([]);
  const [projectId, setProjectId] = useState(fromUrl);

  useEffect(() => {
    api<Proj[]>('/projects')
      .then((rows) => {
        const active = (rows || []).filter((p) => p.status !== 'completed' && p.status !== 'cancelled');
        setProjects(active.length ? active : rows || []);
      })
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (fromUrl) setProjectId(fromUrl);
  }, [fromUrl]);

  const selected = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  function pick(id: string) {
    setProjectId(id);
    const q = id ? `?project=${id}` : '';
    router.replace(`/whiteboard${q}`, { scroll: false });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] min-h-[540px] max-w-[1440px]">
      <div className="mb-2.5 shrink-0 flex items-center gap-2 min-w-0 flex-wrap">
        <PenLine size={13} className="text-slate-400 dark:text-white/30 shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-white/40 shrink-0">
          Board
        </span>
        <span className="text-slate-300 dark:text-white/15 shrink-0">·</span>
        <div className="min-w-[220px] max-w-sm flex-1">
          <Select
            value={projectId}
            onChange={pick}
            ariaLabel="Project board"
            placeholder={projects.length ? 'Pick a project' : 'No projects yet'}
            options={projects.map((p) => ({
              value: p.id,
              label: p.code ? `${p.name} · ${p.code}` : p.name,
            }))}
          />
        </div>
        {selected && (
          <span className="text-[12px] text-slate-400 dark:text-white/35 truncate min-w-0">
            Team sees this. Text boxes become tasks.
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {projectId ? (
          <Whiteboard
            key={projectId}
            endpoint={`/projects/${projectId}/whiteboard`}
            projectId={projectId}
          />
        ) : (
          <div className="h-full rounded-2xl border border-dashed border-slate-200 dark:border-white/10 grid place-items-center px-6 text-center">
            <div>
              <div className="text-sm font-black text-slate-700 dark:text-white/80">Pick a project</div>
              <div className="mt-1.5 text-[13px] text-slate-500 dark:text-white/40 max-w-sm">
                This is the meeting surface for that project — not a private doodle pad.
                Draw the problem. Type the next move. Make it a task.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
