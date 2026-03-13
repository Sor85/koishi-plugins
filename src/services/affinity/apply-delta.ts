/**
 * 好感度增量应用
 * 提供基于 XML 参数的好感度更新函数，不依赖当前会话上下文
 */

import type {
  ActionStats,
  CoefficientState,
  LogFn,
  SessionSeed,
} from "../../types";
import { appendActionEntry } from "./calculator";

export interface ApplyAffinityDeltaParams {
  seed: SessionSeed;
  userId: string;
  delta: number;
  action: "increase" | "decrease";
  store: {
    ensureForSeed: (
      seed: SessionSeed,
      userId: string,
      clampFn: (value: number, low: number, high: number) => number,
    ) => Promise<{
      longTermAffinity?: number;
      shortTermAffinity?: number;
      chatCount?: number;
      actionStats?: ActionStats;
      coefficientState?: CoefficientState;
    }>;
    save: (
      seed: SessionSeed,
      value: number,
      relation: string,
      extra?: Record<string, unknown>,
    ) => Promise<unknown>;
    clamp: (value: number) => number;
  };
  levelResolver: {
    resolveLevelByAffinity: (affinity: number) => { relation?: string } | null;
  };
  maxActionEntries: number;
  shortTermConfig: {
    promoteThreshold: number;
    demoteThreshold: number;
    longTermPromoteStep: number;
    longTermDemoteStep: number;
  };
  log?: LogFn;
}

export interface ApplyAffinityDeltaResult {
  success: boolean;
  message: string;
  shortTermAffinity?: number;
  longTermAffinity?: number;
  combinedAffinity?: number;
  coefficient?: number;
  delta?: number;
  actionStats?: ActionStats;
}

export async function applyAffinityDelta(
  params: ApplyAffinityDeltaParams,
): Promise<ApplyAffinityDeltaResult> {
  const {
    seed,
    userId,
    delta,
    action,
    store,
    levelResolver,
    maxActionEntries,
    shortTermConfig,
    log,
  } = params;

  try {
    const platform = seed.platform || "onebot";

    const current = await store.ensureForSeed(
      { ...seed, platform, userId },
      userId,
      (value, low, high) => Math.min(Math.max(value, low), high),
    );
    const longTerm = current?.longTermAffinity ?? 0;
    const shortTerm = current?.shortTermAffinity ?? 0;
    const coefficient = current?.coefficientState?.coefficient ?? 1;
    const combined = Math.round(longTerm * coefficient);

    let actualDelta = Math.abs(delta);
    if (action === "decrease") {
      actualDelta = -actualDelta;
    }

    const rawShortTerm = shortTerm + actualDelta;
    const crossedPromoteThreshold =
      rawShortTerm >= shortTermConfig.promoteThreshold;
    const crossedDemoteThreshold =
      rawShortTerm <= shortTermConfig.demoteThreshold;
    let newLongTerm = longTerm;
    let newShortTerm = rawShortTerm;

    if (crossedPromoteThreshold) {
      newLongTerm = store.clamp(longTerm + shortTermConfig.longTermPromoteStep);
      newShortTerm = 0;
    } else if (crossedDemoteThreshold) {
      newLongTerm = store.clamp(longTerm - shortTermConfig.longTermDemoteStep);
      newShortTerm = 0;
    }
    const newActionStats: ActionStats = {
      total: (current?.actionStats?.total || 0) + 1,
      counts: {
        increase:
          (current?.actionStats?.counts?.increase || 0) +
          (action === "increase" ? 1 : 0),
        decrease:
          (current?.actionStats?.counts?.decrease || 0) +
          (action === "decrease" ? 1 : 0),
      },
      entries: appendActionEntry(
        current?.actionStats?.entries,
        action,
        Date.now(),
        maxActionEntries,
      ),
    };
    const newCombined = store.clamp(Math.round(newLongTerm * coefficient));
    await store.save({ ...seed, platform, userId }, newCombined, "", {
      shortTermAffinity: newShortTerm,
      longTermAffinity: newLongTerm,
      actionStats: newActionStats,
      coefficientState: current?.coefficientState || undefined,
    });

    const message = `好感度调整: scopeId=${seed.scopeId || ""}, user=${userId}, action=${action}, delta=${Math.abs(actualDelta)}, shortTerm=${newShortTerm}, longTerm=${newLongTerm}, coefficient=${coefficient}, combined=${newCombined}, stats=increase:${newActionStats.counts.increase}/decrease:${newActionStats.counts.decrease}`;
    log?.("info", message);

    return {
      success: true,
      message,
      shortTermAffinity: newShortTerm,
      longTermAffinity: newLongTerm,
      combinedAffinity: newCombined,
      coefficient,
      delta: actualDelta,
      actionStats: newActionStats,
    };
  } catch (error) {
    const errorMessage = `applyAffinityDelta failed: ${(error as Error).message}`;
    params.log?.("warn", errorMessage, error);
    return { success: false, message: errorMessage };
  }
}
