/**
 * 好感度计算器
 * 提供短期/长期好感度、动作窗口、系数等配置解析和计算函数
 */

import { AFFINITY_DYNAMICS_DEFAULTS } from "../../constants";
import type {
  Config,
  ActionType,
  ActionEntry,
  ResolvedShortTermConfig,
  ResolvedActionWindowConfig,
  ResolvedCoefficientConfig,
  CoefficientResult,
  SummarizedActions,
  CombinedState,
} from "../../types";
import { clampFloat } from "../../utils";

function normalizeAction(action: unknown): ActionType {
  const text = typeof action === "string" ? action.toLowerCase() : "";
  if (text === "increase" || text === "decrease") return text;
  return "increase";
}

export function resolveShortTermConfig(
  config: Config,
): ResolvedShortTermConfig {
  const cfg = config?.affinityDynamics?.shortTerm || {};
  const defaults = AFFINITY_DYNAMICS_DEFAULTS.shortTerm;
  const promoteRaw = Number(cfg.promoteThreshold);
  const demoteRaw = Number(cfg.demoteThreshold);
  let promoteThreshold = Number.isFinite(promoteRaw)
    ? Math.round(promoteRaw)
    : defaults.promoteThreshold;
  let demoteThreshold = Number.isFinite(demoteRaw)
    ? Math.round(demoteRaw)
    : defaults.demoteThreshold;

  if (promoteThreshold <= demoteThreshold) {
    const midpoint = Math.round((promoteThreshold + demoteThreshold) / 2) || 0;
    promoteThreshold = midpoint + 15;
    demoteThreshold = midpoint - 15;
  }

  const promoteStepRaw = Number(cfg.longTermPromoteStep);
  const demoteStepRaw = Number(cfg.longTermDemoteStep);
  const longTermPromoteStep = Math.max(
    1,
    Math.round(
      Math.abs(
        Number.isFinite(promoteStepRaw)
          ? promoteStepRaw
          : Number.isFinite(cfg.longTermStep)
            ? cfg.longTermStep!
            : defaults.longTermPromoteStep,
      ),
    ),
  );
  const longTermDemoteStep = Math.max(
    1,
    Math.round(
      Math.abs(
        Number.isFinite(demoteStepRaw)
          ? demoteStepRaw
          : Number.isFinite(cfg.longTermStep)
            ? cfg.longTermStep!
            : defaults.longTermDemoteStep,
      ),
    ),
  );

  return {
    promoteThreshold,
    demoteThreshold,
    longTermPromoteStep,
    longTermDemoteStep,
  };
}

export function resolveActionWindowConfig(
  config: Config,
): ResolvedActionWindowConfig {
  const cfg = config?.affinityDynamics?.actionWindow || {};
  const defaults = AFFINITY_DYNAMICS_DEFAULTS.actionWindow;
  const windowHoursRaw = Number(cfg.windowHours);
  const windowHours = Math.max(
    1,
    Number.isFinite(windowHoursRaw) ? windowHoursRaw : defaults.windowHours,
  );
  const increaseBonus = Number.isFinite(cfg.increaseBonus)
    ? cfg.increaseBonus!
    : defaults.increaseBonus;
  const decreaseBonus = Number.isFinite(cfg.decreaseBonus)
    ? cfg.decreaseBonus!
    : defaults.decreaseBonus;
  const bonusChatThresholdRaw = Number(cfg.bonusChatThreshold);
  const bonusChatThreshold = Math.max(
    0,
    Number.isFinite(bonusChatThresholdRaw)
      ? Math.round(bonusChatThresholdRaw)
      : defaults.bonusChatThreshold,
  );
  const maxEntriesRaw = Number(cfg.maxEntries);
  const maxEntries = Math.max(
    10,
    Number.isFinite(maxEntriesRaw)
      ? Math.round(maxEntriesRaw)
      : defaults.maxEntries,
  );

  return {
    windowHours,
    windowMs: windowHours * 3600 * 1000,
    increaseBonus,
    decreaseBonus,
    bonusChatThreshold,
    maxEntries,
  };
}

export function resolveCoefficientConfig(
  config: Config,
): ResolvedCoefficientConfig {
  const cfg = config?.affinityDynamics?.coefficient || {};
  const defaults = AFFINITY_DYNAMICS_DEFAULTS.coefficient;
  const base = Number.isFinite(cfg.base) ? cfg.base! : defaults.base;
  const maxDrop = Math.max(
    0,
    Number.isFinite(cfg.maxDrop) ? cfg.maxDrop! : defaults.maxDrop,
  );
  const maxBoost = Math.max(
    0,
    Number.isFinite(cfg.maxBoost) ? cfg.maxBoost! : defaults.maxBoost,
  );
  const decayPerDay = Math.max(
    0,
    Number.isFinite(cfg.decayPerDay) ? cfg.decayPerDay! : defaults.decayPerDay,
  );
  const boostPerDay = Math.max(
    0,
    Number.isFinite(cfg.boostPerDay) ? cfg.boostPerDay! : defaults.boostPerDay,
  );
  const min = base - maxDrop;
  const max = base + maxBoost;

  return { base, maxDrop, maxBoost, decayPerDay, boostPerDay, min, max };
}

export function summarizeActionEntries(
  rawEntries: ActionEntry[] | undefined,
  windowMs: number,
  nowMs: number,
): SummarizedActions {
  const fallback: SummarizedActions = {
    entries: [],
    counts: { increase: 0, decrease: 0 },
    total: 0,
  };
  if (!Array.isArray(rawEntries)) return fallback;

  const cutoff = nowMs - windowMs;
  const entries: ActionEntry[] = [];
  const counts = { increase: 0, decrease: 0 };

  for (const entry of rawEntries) {
    if (!entry) continue;
    const ts = Number(entry.timestamp);
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    const normalizedAction = normalizeAction(entry.action);
    entries.push({ action: normalizedAction, timestamp: ts });
    counts[normalizedAction] += 1;
  }

  return { entries, counts, total: counts.increase + counts.decrease };
}

export function appendActionEntry(
  entries: ActionEntry[] | undefined,
  action: ActionType | string,
  nowMs: number,
  maxEntries: number,
): ActionEntry[] {
  const next = Array.isArray(entries) ? [...entries] : [];
  next.push({ action: normalizeAction(action), timestamp: nowMs });
  if (next.length > maxEntries) next.splice(0, next.length - maxEntries);
  return next;
}

export function computeShortTermReset(): number {
  return 0;
}

function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / 86400000);
}

export function computeDailyStreak(
  previousStreak: number | undefined,
  lastInteractionAt: Date | null | undefined,
  now: Date,
): number {
  const last = lastInteractionAt instanceof Date ? lastInteractionAt : null;
  const currentDay = dayNumber(now);
  const previousDay = last ? dayNumber(last) : null;

  if (previousDay === null) return 1;
  if (previousDay === currentDay) return Math.max(1, previousStreak || 1);
  if (previousDay === currentDay - 1)
    return Math.max(1, (previousStreak || 0) + 1);
  return 1;
}

export function computeCoefficientValue(
  coefConfig: ResolvedCoefficientConfig,
  streak: number,
  lastInteractionAt: Date | null | undefined,
  now: Date,
  todayIncreaseCount: number = 0,
  todayDecreaseCount: number = 0,
): CoefficientResult {
  const lastMs =
    lastInteractionAt instanceof Date ? lastInteractionAt.getTime() : null;
  const nowMs = now.getTime();
  const inactivityDays = lastMs
    ? Math.max(0, Math.floor((nowMs - lastMs) / 86400000))
    : 0;
  const hasInteractedToday = inactivityDays === 0;
  const isPositiveDay = todayIncreaseCount > todayDecreaseCount;
  const isNegativeDay = todayDecreaseCount > todayIncreaseCount;

  let decayPenalty = 0;
  let streakBoost = 0;

  if (!hasInteractedToday || isNegativeDay) {
    if (!hasInteractedToday) {
      decayPenalty = Math.min(
        coefConfig.maxDrop,
        inactivityDays * coefConfig.decayPerDay,
      );
    } else if (isNegativeDay) {
      decayPenalty = Math.min(coefConfig.maxDrop, coefConfig.decayPerDay);
    }
  }

  if (hasInteractedToday && isPositiveDay && streak > 0) {
    streakBoost = Math.min(
      coefConfig.maxBoost,
      Math.max(0, (Math.max(1, streak) - 1) * coefConfig.boostPerDay),
    );
  }

  const coefficient = clampFloat(
    coefConfig.base - decayPenalty + streakBoost,
    coefConfig.min,
    coefConfig.max,
  );

  return { coefficient, decayPenalty, streakBoost, inactivityDays };
}

export function composeState(
  longTerm: number,
  shortTerm: number,
  clampFn: (value: number) => number,
): CombinedState {
  return {
    affinity: clampFn(longTerm),
    longTermAffinity: clampFn(longTerm),
    shortTermAffinity: Math.round(shortTerm),
  };
}

export function formatActionCounts(counts: {
  increase?: number;
  decrease?: number;
}): string {
  const safe = counts || {};
  const increase = Number(safe.increase) || 0;
  const decrease = Number(safe.decrease) || 0;
  return `提升 ${increase} / 降低 ${decrease}`;
}
