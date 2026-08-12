/**
 * Flow Signal — runtime configuration and feature flags.
 *
 * All knobs are environment-variable driven so an operator can pull the
 * feature back without a redeploy. Defaults are conservative: facts on,
 * everything inferred OFF at launch. The spec is explicit that observable
 * blockers may launch earlier than learned inference.
 */

export type FlowMode = 'off' | 'shadow' | 'pilot' | 'live';

const parseMode = (raw: string | undefined): FlowMode => {
  switch ((raw || '').toLowerCase()) {
    case 'off':
      return 'off';
    case 'shadow':
      return 'shadow';
    case 'pilot':
      return 'pilot';
    case 'live':
      return 'live';
    default:
      return 'pilot'; // default: pilot — fact layer is visible, inference layers are still off
  }
};

const parseBool = (raw: string | undefined, def: boolean): boolean => {
  if (raw === undefined) return def;
  return raw === '1' || raw.toLowerCase() === 'true';
};

const parseInt0 = (raw: string | undefined, def: number): number => {
  const n = parseInt(raw || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

const parseCsv = (raw: string | undefined): string[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

export interface FlowConfig {
  mode: FlowMode;
  factsEnabled: boolean; // observable-fact path (today's launch)
  anomalyEnabled: boolean; // baseline / Welford / EWMA inference  (Phase 4 — shadow by default)
  survivalEnabled: boolean; // discrete-time survival model         (Phase 5 — shadow)
  textClassifierEnabled: boolean; // local hashed bag-of-words classifier (Phase 6 — shadow)
  banditEnabled: boolean; // safe contextual bandit               (Phase 7 — off)
  pilotTeamIds: string[]; // when mode=pilot, only these teams see prompts
  modelCacheTtlSeconds: number;
  maxIcPromptsPerDay: number;
  maxLeadItems: number;
  stillMovingCooldownHours: number;
}

export function getFlowConfig(): FlowConfig {
  return {
    mode: parseMode(process.env.FLOW_SIGNAL_MODE),
    factsEnabled: parseBool(process.env.FLOW_SIGNAL_FACTS_ENABLED, true),
    anomalyEnabled: parseBool(process.env.FLOW_SIGNAL_ANOMALY_ENABLED, false),
    survivalEnabled: parseBool(process.env.FLOW_SIGNAL_SURVIVAL_ENABLED, false),
    textClassifierEnabled: parseBool(process.env.FLOW_SIGNAL_TEXT_CLASSIFIER_ENABLED, false),
    banditEnabled: parseBool(process.env.FLOW_SIGNAL_BANDIT_ENABLED, false),
    pilotTeamIds: parseCsv(process.env.FLOW_SIGNAL_PILOT_TEAM_IDS),
    modelCacheTtlSeconds: parseInt0(process.env.FLOW_SIGNAL_MODEL_CACHE_TTL_SECONDS, 600),
    maxIcPromptsPerDay: parseInt0(process.env.FLOW_SIGNAL_MAX_IC_PROMPTS_PER_DAY, 3),
    maxLeadItems: parseInt0(process.env.FLOW_SIGNAL_MAX_LEAD_ITEMS, 3),
    stillMovingCooldownHours: parseInt0(process.env.FLOW_SIGNAL_STILL_MOVING_COOLDOWN_HOURS, 24),
  };
}

/** True if a strip should render at all (off/shadow → no UI). */
export function isUiEnabled(cfg: FlowConfig = getFlowConfig()): boolean {
  return cfg.mode === 'pilot' || cfg.mode === 'live';
}

/** Pilot mode restricts the UI to a configured team allowlist. Empty list =
 *  pilot is effectively no-op (safer default than "everyone"). */
export function isPilotTeamVisible(
  teamIds: ReadonlyArray<string>,
  cfg: FlowConfig = getFlowConfig(),
): boolean {
  if (cfg.mode === 'live') return true;
  if (cfg.mode !== 'pilot') return false;
  if (cfg.pilotTeamIds.length === 0) return false;
  const allow = new Set(cfg.pilotTeamIds.map(String));
  return teamIds.some((t) => allow.has(String(t)));
}
