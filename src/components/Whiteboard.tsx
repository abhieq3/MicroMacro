'use client';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Pen,
  Eraser,
  Undo2,
  Redo2,
  Save,
  RotateCcw,
  Highlighter,
  Type as TypeIcon,
  Square,
  Circle,
  ArrowRight as ArrowIcon,
  Download,
} from 'lucide-react';
import { api } from '@/lib/client/api';
// onSaveToNotes removed — whiteboard is a scratch surface; notes are independent

/**
 * Whiteboard — a free-form drawing surface for My Day.
 *
 * Marker on board, nothing precious. Drag to draw, switch tools, rub
 * things out, start again. Designed for *thinking out loud* — the kind of
 * scrappy sketch a team would draw on a real whiteboard when defending an
 * idea, not the polished node-link diagrams a mind-map app produces.
 *
 * Implementation notes:
 *   - One <canvas> with unified pointer handlers. No SVG, no React-DOM
 *     redraws on every stroke — we paint directly with the 2D context so
 *     a busy session stays at 60fps.
 *   - Strokes are stored as polylines (array of points + color + width)
 *     so undo/redo is just a list-pointer move. The canvas is repainted
 *     from the polyline list whenever the pointer changes.
 *   - Autosaves the polyline list as JSON (`PUT /api/scratch/whiteboard`)
 *     ~1.5s after the last stroke. Owner-private — same posture as the
 *     mind-map endpoint it replaced.
 *   - Canvas backing-store is sized to DPR for crisp lines on retina.
 */

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'rect' | 'ellipse' | 'arrow';
interface Stroke {
  tool: Tool;
  color: string;
  size: number;
  points: { x: number; y: number }[];
  // For text strokes only — the canvas owns rendering; we store the typed
  // label and one anchor point.
  text?: string;
}
type Doc = { strokes: Stroke[] };

const COLORS: { value: string; label: string }[] = [
  { value: '#0f172a', label: 'Ink' },
  { value: '#1565C0', label: 'Blue' },
  { value: '#22C55E', label: 'Green' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#EF4444', label: 'Red' },
  { value: '#8B5CF6', label: 'Violet' },
];

const PEN_SIZES = [1.5, 2.5, 4, 6];

export function Whiteboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0].value);
  const [penSize, setPenSize] = useState(2.5);
  const [doc, setDoc] = useState<Doc>({ strokes: [] });
  // Undo/redo by pointer rather than rebuilding the whole history on every
  // commit — cheap and intuitive for a single-user scratch pad.
  const [pointer, setPointer] = useState(0);
  const drawing = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const currentStroke = useRef<Stroke | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingText, setEditingText] = useState<{ x: number; y: number; value: string } | null>(null);
  const dirty = useRef(false);
  // Ref so commitText always reads the latest typed value even when called
  // from onBlur (which fires before the React re-render that would update state).
  const pendingTextValue = useRef('');

  /** Visible (un-redone) prefix of the stroke list. */
  const visibleStrokes = doc.strokes.slice(0, pointer);

  // Track container size — canvas grows with the column.
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(360, r.width), h: Math.max(420, r.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Initial load from the server.
  useEffect(() => {
    api<{ strokes: Stroke[]; updatedAt?: string }>('/scratch/whiteboard')
      .then((d) => {
        const strokes = Array.isArray(d?.strokes) ? d.strokes : [];
        setDoc({ strokes });
        setPointer(strokes.length);
        if (d?.updatedAt) setSavedAt(new Date(d.updatedAt));
      })
      .catch(() => {
        /* empty board */
      });
  }, []);

  // Debounced autosave — fires 1.5s after the last change.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      void save();
    }, 1500);
    return () => clearTimeout(t);
  }, [doc, pointer]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    try {
      const strokes = doc.strokes.slice(0, pointer);
      await api('/scratch/whiteboard', { method: 'PUT', body: { strokes } });
      setSavedAt(new Date());
      dirty.current = false;
    } catch {
      /* keep dirty so the next change retries */
    } finally {
      setBusy(false);
    }
  }

  // ── Canvas rendering ─────────────────────────────────────────────────
  // Repaint from the polyline list whenever stroke state or canvas size
  // changes. The current in-progress stroke is painted on top of the
  // committed list during a drag, so we don't push half-finished state
  // into the React tree.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    cv.style.width = `${size.w}px`;
    cv.style.height = `${size.h}px`;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    repaint(ctx);
  }, [size, doc, pointer]); // eslint-disable-line react-hooks/exhaustive-deps

  const repaint = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.clearRect(0, 0, size.w, size.h);
      // Faint dot grid — gives the surface "whiteboard" texture without
      // dominating the marks the user makes on it.
      ctx.fillStyle = '#cbd5e1';
      for (let x = 24; x < size.w; x += 24) {
        for (let y = 24; y < size.h; y += 24) {
          ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
        }
      }
      for (const s of visibleStrokes) paintStroke(ctx, s);
    },
    [size.w, size.h, visibleStrokes],
  );

  function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
    if (s.tool === 'text' && s.text) {
      ctx.fillStyle = s.color;
      ctx.font = `${Math.round(s.size * 6)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      const lines = s.text.split('\n');
      const p = s.points[0];
      lines.forEach((ln, i) => ctx.fillText(ln, p.x, p.y + i * Math.round(s.size * 7)));
      return;
    }
    if (s.points.length < 2) return;
    const p0 = s.points[0];
    const p1 = s.points[s.points.length - 1];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;

    if (s.tool === 'rect') {
      ctx.beginPath();
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      return;
    }
    if (s.tool === 'ellipse') {
      const rx = Math.abs(p1.x - p0.x) / 2;
      const ry = Math.abs(p1.y - p0.y) / 2;
      const cx = p0.x + (p1.x - p0.x) / 2;
      const cy = p0.y + (p1.y - p0.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (s.tool === 'arrow') {
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const angle = Math.atan2(dy, dx);
      const headLen = Math.max(12, s.size * 4);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(
        p1.x - headLen * Math.cos(angle - Math.PI / 6),
        p1.y - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(
        p1.x - headLen * Math.cos(angle + Math.PI / 6),
        p1.y - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
      return;
    }

    if (s.tool === 'highlighter') {
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size * 5;
    } else if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = s.size * 4;
    }
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
    // Reset state — eraser sets composite, highlighter sets alpha.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function pointFromPointer(e: ReactPointerEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const SHAPE_TOOLS: Tool[] = ['rect', 'ellipse', 'arrow'];

  function startStroke(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = pointFromPointer(e);
    if (!p) return;
    e.preventDefault();
    if (tool === 'text') {
      setEditingText({ x: p.x, y: p.y, value: '' });
      return;
    }
    drawing.current = true;
    activePointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    currentStroke.current = { tool, color, size: penSize, points: [p] };
    paintLive();
  }

  function continueStroke(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !currentStroke.current) return;
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;
    const p = pointFromPointer(e);
    if (!p) return;
    e.preventDefault();
    if (SHAPE_TOOLS.includes(currentStroke.current.tool)) {
      // For shapes keep only start + current end — avoids storing every mousemove
      currentStroke.current.points = [currentStroke.current.points[0], p];
    } else {
      // Skip points that are basically a duplicate — keeps the stroke list
      // light and the canvas crisp on touch devices.
      const last = currentStroke.current.points[currentStroke.current.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;
      currentStroke.current.points.push(p);
    }
    paintLive();
  }

  function endStroke(e?: ReactPointerEvent<HTMLCanvasElement>) {
    if (e && activePointerId.current !== null && e.pointerId !== activePointerId.current) return;
    if (!drawing.current || !currentStroke.current) return;
    if (e) e.currentTarget.releasePointerCapture?.(e.pointerId);
    drawing.current = false;
    activePointerId.current = null;
    const s = currentStroke.current;
    currentStroke.current = null;
    if (s.points.length < 2 && s.tool !== 'text') return; // ignore stray taps
    // Truncate any "redo" tail (we're starting a new branch).
    setDoc((d) => ({ strokes: [...d.strokes.slice(0, pointer), s] }));
    setPointer((n) => n + 1);
    dirty.current = true;
  }

  /** Paint the current in-progress stroke over the committed strokes
   *  without touching React state. */
  function paintLive() {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    repaint(ctx);
    if (currentStroke.current) paintStroke(ctx, currentStroke.current);
  }

  function commitText() {
    if (!editingText) return;
    const value = (pendingTextValue.current || editingText.value).trim();
    pendingTextValue.current = '';
    if (!value) {
      setEditingText(null);
      return;
    }
    const s: Stroke = {
      tool: 'text',
      color,
      size: penSize,
      points: [{ x: editingText.x, y: editingText.y }],
      text: value,
    };
    setDoc((d) => ({ strokes: [...d.strokes.slice(0, pointer), s] }));
    setPointer((n) => n + 1);
    setEditingText(null);
    dirty.current = true;
  }

  function undo() {
    if (pointer > 0) {
      setPointer((n) => n - 1);
      dirty.current = true;
    }
  }
  function redo() {
    if (pointer < doc.strokes.length) {
      setPointer((n) => n + 1);
      dirty.current = true;
    }
  }

  function exportPng() {
    const cv = canvasRef.current;
    if (!cv) return;
    const url = cv.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }

  function clearAll() {
    if (!confirm("Erase the whole board? This can't be undone after the next save.")) return;
    setDoc({ strokes: [] });
    setPointer(0);
    dirty.current = true;
  }

  // Keyboard shortcuts — Cmd/Ctrl+Z to undo, Shift+Cmd/Ctrl+Z to redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointer, doc.strokes.length]);

  return (
    <div
      className="h-full bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden flex flex-col"
      style={{ minHeight: 460 }}
    >
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 dark:border-white/[0.06] flex-wrap">
        {/* Tool group */}
        <div className="flex items-center gap-1">
          <ToolBtn
            active={tool === 'pen'}
            label="Pen"
            icon={<Pen size={14} />}
            onClick={() => setTool('pen')}
          />
          <ToolBtn
            active={tool === 'highlighter'}
            label="Highlighter"
            icon={<Highlighter size={14} />}
            onClick={() => setTool('highlighter')}
          />
          <ToolBtn
            active={tool === 'eraser'}
            label="Eraser"
            icon={<Eraser size={14} />}
            onClick={() => setTool('eraser')}
          />
          <ToolBtn
            active={tool === 'text'}
            label="Text"
            icon={<TypeIcon size={14} />}
            onClick={() => setTool('text')}
          />
          <span className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
          <ToolBtn
            active={tool === 'rect'}
            label="Rectangle"
            icon={<Square size={14} />}
            onClick={() => setTool('rect')}
          />
          <ToolBtn
            active={tool === 'ellipse'}
            label="Ellipse"
            icon={<Circle size={14} />}
            onClick={() => setTool('ellipse')}
          />
          <ToolBtn
            active={tool === 'arrow'}
            label="Arrow"
            icon={<ArrowIcon size={14} />}
            onClick={() => setTool('arrow')}
          />
        </div>

        {/* Colour swatches */}
        {tool !== 'eraser' && (
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => setColor(c.value)}
                className={`w-5 h-5 rounded-full transition-transform ${color === c.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                style={{ background: c.value }}
                aria-label={`Use ${c.label}`}
              />
            ))}
          </div>
        )}

        {/* Pen size */}
        <div className="flex items-center gap-1">
          {PEN_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              title={`Size ${s}`}
              onClick={() => setPenSize(s)}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${penSize === s ? 'bg-slate-100 dark:bg-white/[0.08]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'}`}
              aria-label={`Pen size ${s}`}
            >
              <span
                className="block rounded-full"
                style={{ width: s * 2.5, height: s * 2.5, background: tool === 'eraser' ? '#94a3b8' : color }}
              />
            </button>
          ))}
        </div>

        {/* Undo / redo / export / save / clear */}
        <div className="flex items-center gap-1">
          {savedAt && (
            <span className="text-[10px] text-slate-400 dark:text-white/30 hidden sm:inline mr-1">
              {busy
                ? 'Saving…'
                : `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          )}
          <ToolBtn label="Undo" icon={<Undo2 size={14} />} onClick={undo} disabled={pointer === 0} />
          <ToolBtn
            label="Redo"
            icon={<Redo2 size={14} />}
            onClick={redo}
            disabled={pointer >= doc.strokes.length}
          />
          <ToolBtn
            label="Export as PNG"
            icon={<Download size={14} />}
            onClick={exportPng}
            disabled={visibleStrokes.length === 0}
          />
          <ToolBtn label="Save now" icon={<Save size={14} />} onClick={() => void save()} disabled={busy} />
          <ToolBtn label="Clear board" icon={<RotateCcw size={14} />} onClick={clearAll} dangerous />
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 relative"
        style={{ cursor: tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair' }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          style={{ display: 'block', touchAction: 'none' }}
        />

        {/* Inline text editor */}
        {editingText && (
          <textarea
            autoFocus
            value={editingText.value}
            onChange={(e) => {
              const v = e.target.value;
              pendingTextValue.current = v;
              setEditingText((prev) => (prev ? { ...prev, value: v } : prev));
            }}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                pendingTextValue.current = '';
                setEditingText(null);
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitText();
              }
            }}
            className="absolute outline-none border-2 border-dashed border-blue-400 bg-white/95 rounded-md p-2 shadow-md"
            style={{
              left: editingText.x,
              top: editingText.y - 2,
              minWidth: 140,
              minHeight: 32,
              color,
              font: `${Math.round(penSize * 6)}px ui-sans-serif, system-ui, sans-serif`,
              zIndex: 10,
            }}
            placeholder="Type · Enter to place"
          />
        )}

        {visibleStrokes.length === 0 && !editingText && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center max-w-sm">
              <Pen size={26} className="mx-auto mb-2 text-slate-300" />
              <div className="text-sm font-bold text-slate-500">Start drawing</div>
              <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                Drag to draw. Switch to highlighter, eraser, or text. Undo with Cmd/Ctrl + Z. Nothing precious
                — start over any time.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({
  active,
  label,
  icon,
  onClick,
  disabled,
  dangerous,
}: {
  active?: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  dangerous?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
        disabled
          ? 'opacity-30 cursor-not-allowed'
          : active
            ? 'bg-blue-600 text-white'
            : dangerous
              ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
      }`}
    >
      {icon}
    </button>
  );
}
