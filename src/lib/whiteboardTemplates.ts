/**
 * Whiteboard thinking scaffolds — not pretty decks.
 *
 * Jensen uses whiteboards to force first-principles structure: name the
 * problem, list what's true, map options, kill fluff. Blank boards fail
 * because people freeze; a light template is a starting constraint so the
 * pen has somewhere to go. Strokes are plain text/rect so they stay editable
 * with the existing canvas tools (erase, redraw, wipe).
 */

export type BoardTemplateId = 'first_principles' | 'blockers' | 'decide' | 'delivery' | 'blank';

export interface BoardStroke {
  tool: 'pen' | 'highlighter' | 'eraser' | 'text' | 'rect' | 'ellipse' | 'arrow';
  color: string;
  size: number;
  points: { x: number; y: number }[];
  text?: string;
}

export interface BoardTemplate {
  id: BoardTemplateId;
  label: string;
  /** One line: why open this template. */
  blurb: string;
  /** Default problem-field seed (user can rewrite). */
  prompt: string;
  build: () => BoardStroke[];
}

const INK = '#0f172a';
const MUTED = '#64748b';
const GUIDE = '#94a3b8';
const ACCENT = '#1565C0';

/** size ~2.0 labels, ~2.5 body, ~2.8 emphasis — mapped to readable px in Whiteboard. */
function t(x: number, y: number, text: string, opts?: { size?: number; color?: string }): BoardStroke {
  return {
    tool: 'text',
    color: opts?.color ?? MUTED,
    size: opts?.size ?? 2.5,
    points: [{ x, y }],
    text,
  };
}

function box(x: number, y: number, w: number, h: number, color = GUIDE): BoardStroke {
  return {
    tool: 'rect',
    color,
    size: 1.5,
    points: [
      { x, y },
      { x: x + w, y: y + h },
    ],
  };
}

function line(x0: number, y0: number, x1: number, y1: number, color = GUIDE): BoardStroke {
  return {
    tool: 'arrow',
    color,
    size: 1.4,
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y1 },
    ],
  };
}

const firstPrinciples: BoardTemplate = {
  id: 'first_principles',
  label: 'First principles',
  blurb: 'Strip to what’s true, then rebuild the plan.',
  prompt: 'What are we actually trying to make true?',
  build: () => [
    t(40, 28, 'PROBLEM (one sentence)', { size: 2.0, color: ACCENT }),
    box(36, 52, 720, 56),
    t(48, 68, '…', { size: 2.8, color: INK }),

    t(40, 130, '1. WHAT IS TRUE?  (facts only — no opinions)', { size: 2.0, color: ACCENT }),
    box(36, 154, 340, 200),
    t(48, 170, '•', { size: 2.5, color: INK }),
    t(48, 200, '•', { size: 2.5, color: INK }),
    t(48, 230, '•', { size: 2.5, color: INK }),
    t(48, 260, '•', { size: 2.5, color: INK }),

    t(400, 130, '2. CONSTRAINTS  (time, people, GxP, cost)', { size: 2.0, color: ACCENT }),
    box(396, 154, 360, 200),
    t(408, 170, '•', { size: 2.5, color: INK }),
    t(408, 200, '•', { size: 2.5, color: INK }),
    t(408, 230, '•', { size: 2.5, color: INK }),

    t(40, 380, '3. FASTEST PATH FROM TRUTH → OUTCOME', { size: 2.0, color: ACCENT }),
    box(36, 404, 720, 100),
    t(48, 420, '1.', { size: 2.5, color: INK }),
    t(48, 450, '2.', { size: 2.5, color: INK }),
    t(48, 480, '3.', { size: 2.5, color: INK }),
  ],
};

const blockers: BoardTemplate = {
  id: 'blockers',
  label: 'Unblock',
  blurb: 'Name the stuck work. Who owns the next move.',
  prompt: 'What is blocked — and who can unstick it today?',
  build: () => [
    t(40, 28, 'BLOCKED WORK', { size: 2.0, color: '#b91c1c' }),
    box(36, 52, 360, 280, '#fca5a5'),
    t(48, 70, '1.', { color: INK }),
    t(48, 120, '2.', { color: INK }),
    t(48, 170, '3.', { color: INK }),
    t(48, 220, '4.', { color: INK }),

    t(420, 28, 'NEXT MOVE  ·  OWNER  ·  BY WHEN', { size: 2.0, color: ACCENT }),
    box(416, 52, 340, 280),
    t(428, 70, '→', { color: INK }),
    t(428, 120, '→', { color: INK }),
    t(428, 170, '→', { color: INK }),
    t(428, 220, '→', { color: INK }),

    t(40, 360, 'ESCALATE IF STILL STUCK AFTER', { size: 2.0, color: MUTED }),
    box(36, 384, 720, 72),
  ],
};

const decide: BoardTemplate = {
  id: 'decide',
  label: 'Decide',
  blurb: 'Two options max. Pick. Commit.',
  prompt: 'What decision must we make before we leave this board?',
  build: () => [
    t(40, 28, 'DECISION', { size: 2.0, color: ACCENT }),
    box(36, 52, 720, 48),
    t(48, 66, 'We will…', { color: INK }),

    t(40, 120, 'OPTION A', { size: 2.0, color: ACCENT }),
    box(36, 144, 340, 180),
    t(48, 160, 'Pros', { size: 2.0, color: MUTED }),
    t(48, 220, 'Cons', { size: 2.0, color: MUTED }),

    t(400, 120, 'OPTION B', { size: 2.0, color: ACCENT }),
    box(396, 144, 360, 180),
    t(408, 160, 'Pros', { size: 2.0, color: MUTED }),
    t(408, 220, 'Cons', { size: 2.0, color: MUTED }),

    t(40, 350, 'CALL  (circle one)     A     B     Neither — need more truth', {
      size: 2.2,
      color: INK,
    }),
    box(36, 380, 720, 80),
    t(48, 400, 'Owner of the outcome:', { color: MUTED }),
    t(48, 430, 'First action in 24h:', { color: MUTED }),
  ],
};

const delivery: BoardTemplate = {
  id: 'delivery',
  label: 'Delivery path',
  blurb: 'Now / next / later — kill the pile of “someday”.',
  prompt: 'What ships this week if everything else stopped?',
  build: () => [
    t(40, 28, 'NOW  (this week — ship or fail)', { size: 2.0, color: '#b91c1c' }),
    box(36, 52, 230, 320, '#fca5a5'),
    t(48, 70, '1.', { color: INK }),
    t(48, 120, '2.', { color: INK }),
    t(48, 170, '3.', { color: INK }),

    t(290, 28, 'NEXT  (after NOW is done)', { size: 2.0, color: ACCENT }),
    box(286, 52, 230, 320),
    t(298, 70, '1.', { color: INK }),
    t(298, 120, '2.', { color: INK }),
    t(298, 170, '3.', { color: INK }),

    t(540, 28, 'LATER  (parked, not forgotten)', { size: 2.0, color: MUTED }),
    box(536, 52, 220, 320, GUIDE),
    t(548, 70, '•', { color: INK }),
    t(548, 120, '•', { color: INK }),

    line(266, 200, 286, 200, GUIDE),
    line(516, 200, 536, 200, GUIDE),

    t(40, 400, 'Kill list — work we will NOT do:', { size: 2.0, color: MUTED }),
    box(36, 424, 720, 64),
  ],
};

const blank: BoardTemplate = {
  id: 'blank',
  label: 'Blank',
  blurb: 'Empty board. Start drawing.',
  prompt: '',
  build: () => [],
};

export const BOARD_TEMPLATES: BoardTemplate[] = [
  firstPrinciples,
  blockers,
  decide,
  delivery,
  blank,
];

export function templateById(id: BoardTemplateId): BoardTemplate {
  return BOARD_TEMPLATES.find((t) => t.id === id) || blank;
}
