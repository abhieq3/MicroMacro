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
  Check,
  X,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { BOARD_TEMPLATES, templateById, type BoardTemplateId } from '@/lib/whiteboardTemplates';

/**
 * Whiteboard — personal thinking surface.
 *
 * Text is intentionally easy (Jensen would not fight a UI to write on a board):
 *   • Double-click anywhere → type a note
 *   • Text tool + click → type
 *   • Click existing text → edit it
 *   • Enter = new line; ⌘/Ctrl+Enter or Done = place; Esc = cancel
 * Font sizes are real marker sizes (S/M/L), not pen-width * magic.
 */

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'rect' | 'ellipse' | 'arrow';
interface Stroke {
  tool: Tool;
  color: string;
  size: number;
  points: { x: number; y: number }[];
  text?: string;
}
type Doc = { strokes: Stroke[] };

/** Discrete text sizes — what users pick in the toolbar. */
const TEXT_SIZES: { id: 's' | 'm' | 'l'; label: string; size: number; px: number }[] = [
  { id: 's', label: 'S', size: 2.0, px: 16 },
  { id: 'm', label: 'M', size: 2.8, px: 22 },
  { id: 'l', label: 'L', size: 4.2, px: 30 },
];

/** Map stored stroke.size → on-screen font px (handles old templates too). */
function textFontPx(size: number): number {
  if (size <= 1.9) return 15;
  if (size <= 2.3) return 17;
  if (size <= 2.6) return 20;
  if (size <= 3.2) return 22;
  if (size <= 4) return 26;
  if (size <= 5) return 30;
  return 36;
}

function textLineHeight(size: number): number {
  return Math.round(textFontPx(size) * 1.35);
}

const COLORS: { value: string; label: string }[] = [
  { value: '#0f172a', label: 'Ink' },
  { value: '#1565C0', label: 'Blue' },
  { value: '#22C55E', label: 'Green' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#EF4444', label: 'Red' },
  { value: '#8B5CF6', label: 'Violet' },
];

const PEN_SIZES = [1.5, 2.5, 4, 6];

interface TextEdit {
  x: number;
  y: number;
  value: string;
  color: string;
  size: number;
  /** Visible-list index when editing an existing stroke. */
  replaceIndex?: number;
}

export function Whiteboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0].value);
  const [penSize, setPenSize] = useState(2.5);
  const [textSize, setTextSize] = useState<(typeof TEXT_SIZES)[number]>(TEXT_SIZES[1]);
  const [doc, setDoc] = useState<Doc>({ strokes: [] });
  const [pointer, setPointer] = useState(0);
  const drawing = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const currentStroke = useRef<Stroke | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingText, setEditingText] = useState<TextEdit | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loaded, setLoaded] = useState(false);
  const dirty = useRef(false);
  const pendingTextValue = useRef('');
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  // Avoid blur-commit when Done/Cancel mousedown steals focus.
  const skipBlurCommit = useRef(false);

  const visibleStrokes = doc.strokes.slice(0, pointer);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(360, r.width), h: Math.max(420, r.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    api<{ strokes: Stroke[]; prompt?: string; updatedAt?: string }>('/scratch/whiteboard')
      .then((d) => {
        const strokes = Array.isArray(d?.strokes) ? d.strokes : [];
        setDoc({ strokes });
        setPointer(strokes.length);
        setPrompt(typeof d?.prompt === 'string' ? d.prompt : '');
        if (d?.updatedAt) setSavedAt(new Date(d.updatedAt));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      void save();
    }, 1500);
    return () => clearTimeout(t);
  }, [doc, pointer, prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editingText && textAreaRef.current) {
      textAreaRef.current.focus();
      const len = textAreaRef.current.value.length;
      textAreaRef.current.setSelectionRange(len, len);
    }
  }, [editingText?.x, editingText?.y, editingText?.replaceIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    try {
      const strokes = doc.strokes.slice(0, pointer);
      await api('/scratch/whiteboard', {
        method: 'PUT',
        body: { strokes, prompt: promptRef.current.slice(0, 280) },
      });
      setSavedAt(new Date());
      dirty.current = false;
    } catch {
      /* keep dirty */
    } finally {
      setBusy(false);
    }
  }

  function applyTemplate(id: BoardTemplateId) {
    const tpl = templateById(id);
    if (visibleStrokes.length > 0) {
      if (
        !window.confirm(
          'Replace the current board with this template? Current strokes will be wiped after save.',
        )
      ) {
        return;
      }
    }
    const strokes = tpl.build() as Stroke[];
    setDoc({ strokes });
    setPointer(strokes.length);
    if (tpl.prompt) setPrompt(tpl.prompt);
    setEditingText(null);
    dirty.current = true;
  }

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

  const measureTextWidth = useCallback((ctx: CanvasRenderingContext2D, s: Stroke): number => {
    if (!s.text) return 0;
    const px = textFontPx(s.size);
    ctx.font = `600 ${px}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    return Math.max(...s.text.split('\n').map((ln) => ctx.measureText(ln || ' ').width), 24);
  }, []);

  const hitTextIndex = useCallback(
    (p: { x: number; y: number }, strokes: Stroke[]): number | null => {
      const cv = canvasRef.current;
      if (!cv) return null;
      const ctx = cv.getContext('2d');
      if (!ctx) return null;
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        if (s.tool !== 'text' || !s.text || !s.points[0]) continue;
        const ax = s.points[0].x;
        const ay = s.points[0].y;
        const lh = textLineHeight(s.size);
        const lines = s.text.split('\n');
        const w = measureTextWidth(ctx, s);
        const h = lines.length * lh;
        const pad = 10;
        if (p.x >= ax - pad && p.x <= ax + w + pad && p.y >= ay - pad && p.y <= ay + h + pad) {
          return i;
        }
      }
      return null;
    },
    [measureTextWidth],
  );

  const repaint = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.clearRect(0, 0, size.w, size.h);
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
      const px = textFontPx(s.size);
      const lh = textLineHeight(s.size);
      ctx.fillStyle = s.color;
      ctx.font = `600 ${px}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'top';
      const lines = s.text.split('\n');
      const p = s.points[0];
      lines.forEach((ln, i) => ctx.fillText(ln, p.x, p.y + i * lh));
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
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function pointFromEvent(e: { clientX: number; clientY: number }) {
    const cv = canvasRef.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function openTextEditor(at: {
    x: number;
    y: number;
    value?: string;
    replaceIndex?: number;
    color?: string;
    size?: number;
  }) {
    const edit: TextEdit = {
      x: Math.max(8, Math.min(at.x, size.w - 200)),
      y: Math.max(8, Math.min(at.y, size.h - 80)),
      value: at.value ?? '',
      color: at.color ?? color,
      size: at.size ?? textSize.size,
      replaceIndex: at.replaceIndex,
    };
    pendingTextValue.current = edit.value;
    setEditingText(edit);
    setTool('text');
  }

  const SHAPE_TOOLS: Tool[] = ['rect', 'ellipse', 'arrow'];

  function startStroke(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // While typing, ignore canvas draws (editor owns focus).
    if (editingText) return;
    const p = pointFromEvent(e);
    if (!p) return;

    // Click existing text → edit (any tool except eraser).
    if (tool !== 'eraser') {
      const hit = hitTextIndex(p, visibleStrokes);
      if (hit !== null) {
        e.preventDefault();
        const s = visibleStrokes[hit];
        openTextEditor({
          x: s.points[0].x,
          y: s.points[0].y,
          value: s.text || '',
          replaceIndex: hit,
          color: s.color,
          size: s.size,
        });
        return;
      }
    }

    e.preventDefault();
    if (tool === 'text') {
      openTextEditor({ x: p.x, y: p.y });
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
    const p = pointFromEvent(e);
    if (!p) return;
    e.preventDefault();
    if (SHAPE_TOOLS.includes(currentStroke.current.tool)) {
      currentStroke.current.points = [currentStroke.current.points[0], p];
    } else {
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
    if (s.points.length < 2 && s.tool !== 'text') return;
    setDoc((d) => ({ strokes: [...d.strokes.slice(0, pointer), s] }));
    setPointer((n) => n + 1);
    dirty.current = true;
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (editingText) return;
    const p = pointFromEvent(e);
    if (!p) return;
    e.preventDefault();
    const hit = hitTextIndex(p, visibleStrokes);
    if (hit !== null) {
      const s = visibleStrokes[hit];
      openTextEditor({
        x: s.points[0].x,
        y: s.points[0].y,
        value: s.text || '',
        replaceIndex: hit,
        color: s.color,
        size: s.size,
      });
      return;
    }
    openTextEditor({ x: p.x, y: p.y });
  }

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
    const value = (pendingTextValue.current || editingText.value).replace(/\s+$/, '');
    pendingTextValue.current = '';
    if (!value.trim()) {
      setEditingText(null);
      return;
    }
    const s: Stroke = {
      tool: 'text',
      color: editingText.color,
      size: editingText.size,
      points: [{ x: editingText.x, y: editingText.y }],
      text: value,
    };

    if (typeof editingText.replaceIndex === 'number') {
      // Replace in the visible prefix; drop any redo tail.
      const base = doc.strokes.slice(0, pointer);
      const next = base.map((st, i) => (i === editingText.replaceIndex ? s : st));
      setDoc({ strokes: next });
      setPointer(next.length);
    } else {
      setDoc((d) => ({ strokes: [...d.strokes.slice(0, pointer), s] }));
      setPointer((n) => n + 1);
    }
    setEditingText(null);
    dirty.current = true;
  }

  function cancelText() {
    pendingTextValue.current = '';
    setEditingText(null);
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
    if (!confirm('Wipe the board? Strokes and the problem line clear after the next save.')) return;
    setDoc({ strokes: [] });
    setPointer(0);
    setPrompt('');
    setEditingText(null);
    dirty.current = true;
  }

  // Shortcuts: tools + undo (skip when typing in the text editor / prompt).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'v' || k === 'p') setTool('pen');
      else if (k === 'h') setTool('highlighter');
      else if (k === 'e') setTool('eraser');
      else if (k === 't') setTool('text');
      else if (k === 'r') setTool('rect');
      else if (k === 'o') setTool('ellipse');
      else if (k === 'a') setTool('arrow');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointer, doc.strokes.length]);

  const editorFontPx = editingText ? textFontPx(editingText.size) : textFontPx(textSize.size);

  // Keep editor on-canvas: clamp position so the box stays usable.
  const editorStyle = editingText
    ? {
        left: Math.min(editingText.x, Math.max(8, size.w - 280)),
        top: Math.min(editingText.y, Math.max(8, size.h - 120)),
      }
    : { left: 0, top: 0 };

  return (
    <div
      className="h-full bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden flex flex-col"
      style={{ minHeight: 460 }}
    >
      <div className="shrink-0 px-3 pt-2.5 pb-1.5 border-b border-slate-100 dark:border-white/[0.06]">
        <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-white/30 mb-1">
          Working on
        </label>
        <input
          type="text"
          value={prompt}
          maxLength={280}
          onChange={(e) => {
            setPrompt(e.target.value);
            dirty.current = true;
          }}
          placeholder="Name the problem in one line — then draw the path."
          className="w-full bg-transparent text-[14px] font-semibold text-slate-800 dark:text-white/90 placeholder:text-slate-300 dark:placeholder:text-white/20 outline-none border-0 p-0"
        />
      </div>

      <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 dark:border-white/[0.06] overflow-x-auto">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/25 shrink-0 mr-0.5">
          Start from
        </span>
        {BOARD_TEMPLATES.filter((t) => t.id !== 'blank').map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            title={tpl.blurb}
            onClick={() => applyTemplate(tpl.id)}
            className="shrink-0 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-white/60 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            {tpl.label}
          </button>
        ))}
        <button
          type="button"
          title="Empty board"
          onClick={() => applyTemplate('blank')}
          className="shrink-0 rounded-full border border-transparent px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-white/60"
        >
          Blank
        </button>
      </div>

      <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 dark:border-white/[0.06] flex-wrap">
        <div className="flex items-center gap-1">
          <ToolBtn active={tool === 'pen'} label="Pen (V)" icon={<Pen size={14} />} onClick={() => setTool('pen')} />
          <ToolBtn
            active={tool === 'highlighter'}
            label="Highlighter (H)"
            icon={<Highlighter size={14} />}
            onClick={() => setTool('highlighter')}
          />
          <ToolBtn
            active={tool === 'eraser'}
            label="Eraser (E)"
            icon={<Eraser size={14} />}
            onClick={() => setTool('eraser')}
          />
          <ToolBtn
            active={tool === 'text'}
            label="Text (T) — or double-click the board"
            icon={<TypeIcon size={14} />}
            onClick={() => setTool('text')}
            emphasize
          />
          <span className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
          <ToolBtn active={tool === 'rect'} label="Box (R)" icon={<Square size={14} />} onClick={() => setTool('rect')} />
          <ToolBtn
            active={tool === 'ellipse'}
            label="Circle (O)"
            icon={<Circle size={14} />}
            onClick={() => setTool('ellipse')}
          />
          <ToolBtn
            active={tool === 'arrow'}
            label="Arrow (A)"
            icon={<ArrowIcon size={14} />}
            onClick={() => setTool('arrow')}
          />
        </div>

        {tool !== 'eraser' && (
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => {
                  setColor(c.value);
                  if (editingText) setEditingText({ ...editingText, color: c.value });
                }}
                className={`w-5 h-5 rounded-full transition-transform ${
                  (editingText ? editingText.color : color) === c.value
                    ? 'ring-2 ring-offset-2 ring-slate-400 scale-110'
                    : 'hover:scale-110'
                }`}
                style={{ background: c.value }}
                aria-label={`Use ${c.label}`}
              />
            ))}
          </div>
        )}

        {/* Size: pen dots OR text S/M/L */}
        {tool === 'text' || editingText ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400 mr-0.5">Aa</span>
            {TEXT_SIZES.map((ts) => (
              <button
                key={ts.id}
                type="button"
                title={`Text ${ts.label}`}
                onClick={() => {
                  setTextSize(ts);
                  if (editingText) setEditingText({ ...editingText, size: ts.size });
                }}
                className={`min-w-[28px] h-7 px-1.5 rounded-md text-[11px] font-bold transition-colors ${
                  (editingText ? editingText.size : textSize.size) === ts.size
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                {ts.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {PEN_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                title={`Size ${s}`}
                onClick={() => setPenSize(s)}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                  penSize === s ? 'bg-slate-100 dark:bg-white/[0.08]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                }`}
                aria-label={`Pen size ${s}`}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: s * 2.5,
                    height: s * 2.5,
                    background: tool === 'eraser' ? '#94a3b8' : color,
                  }}
                />
              </button>
            ))}
          </div>
        )}

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
            label="Export PNG"
            icon={<Download size={14} />}
            onClick={exportPng}
            disabled={visibleStrokes.length === 0}
          />
          <ToolBtn label="Save" icon={<Save size={14} />} onClick={() => void save()} disabled={busy} />
          <ToolBtn label="Wipe board" icon={<RotateCcw size={14} />} onClick={clearAll} dangerous />
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 relative min-h-0"
        style={{
          cursor: tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onDoubleClick={onDoubleClick}
          style={{ display: 'block', touchAction: 'none' }}
        />

        {/* Text editor — big, obvious, multi-line friendly */}
        {editingText && (
          <div
            className="absolute z-20 flex flex-col gap-1.5"
            style={{ left: editorStyle.left, top: editorStyle.top, width: Math.min(360, size.w - 24) }}
          >
            <textarea
              ref={textAreaRef}
              value={editingText.value}
              rows={Math.min(8, Math.max(2, editingText.value.split('\n').length + 1))}
              onChange={(e) => {
                const v = e.target.value;
                pendingTextValue.current = v;
                setEditingText((prev) => (prev ? { ...prev, value: v } : prev));
              }}
              onBlur={() => {
                if (skipBlurCommit.current) {
                  skipBlurCommit.current = false;
                  return;
                }
                // Defer so a click on Done still wins.
                requestAnimationFrame(() => commitText());
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelText();
                }
                // ⌘/Ctrl+Enter places. Plain Enter = new line (natural typing).
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commitText();
                }
              }}
              className="w-full resize-y outline-none rounded-xl border-2 border-blue-500 bg-white dark:bg-[#1c1c1a] shadow-xl px-3 py-2.5 text-slate-900 dark:text-white/90 placeholder:text-slate-400"
              style={{
                font: `600 ${editorFontPx}px ui-sans-serif, system-ui, -apple-system, sans-serif`,
                lineHeight: '1.35',
                color: editingText.color,
                minHeight: 56,
              }}
              placeholder="Type here…  ⌘↵ to place"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onMouseDown={() => {
                  skipBlurCommit.current = true;
                }}
                onClick={commitText}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-2.5 py-1.5 shadow"
              >
                <Check size={13} /> Done
              </button>
              <button
                type="button"
                onMouseDown={() => {
                  skipBlurCommit.current = true;
                }}
                onClick={cancelText}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.06] text-[11px] font-semibold text-slate-600 dark:text-white/60 px-2.5 py-1.5"
              >
                <X size={13} /> Cancel
              </button>
              <span className="text-[10px] text-slate-400 dark:text-white/30 ml-1 hidden sm:inline">
                Enter = new line · Esc = cancel
              </span>
            </div>
          </div>
        )}

        {loaded && visibleStrokes.length === 0 && !editingText && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center max-w-lg w-full">
              <Pen size={22} className="mx-auto mb-2 text-slate-300 dark:text-white/25" />
              <div className="text-sm font-bold text-slate-700 dark:text-white/80">
                Think on the board — not in a deck
              </div>
              <p className="text-[12px] text-slate-400 dark:text-white/35 mt-1.5 leading-relaxed max-w-sm mx-auto">
                Pick a scaffold, or double-click anywhere to type. Private — wipe when done.
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-left pointer-events-auto">
                {BOARD_TEMPLATES.filter((t) => t.id !== 'blank').map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2.5 hover:border-blue-300 dark:hover:border-blue-400/40 transition-colors"
                  >
                    <div className="text-[12px] font-bold text-slate-800 dark:text-white/85">{tpl.label}</div>
                    <div className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5 leading-snug">
                      {tpl.blurb}
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-300 dark:text-white/20">
                Double-click to type · T text · V pen · E eraser · ⌘Z undo
              </p>
            </div>
          </div>
        )}

        {/* Quiet tip when board has content */}
        {loaded && visibleStrokes.length > 0 && !editingText && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none">
            <span className="text-[10px] font-medium text-slate-400/80 dark:text-white/20 bg-white/70 dark:bg-black/20 px-2 py-0.5 rounded-full backdrop-blur-sm">
              Double-click to type · click text to edit
            </span>
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
  emphasize,
}: {
  active?: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  dangerous?: boolean;
  emphasize?: boolean;
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
              : emphasize
                ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
      }`}
    >
      {icon}
    </button>
  );
}
