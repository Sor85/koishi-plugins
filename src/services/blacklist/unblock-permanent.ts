/**
 * 永久黑名单解除编排
 * 统一处理解封后的好感度重置与缓存清理
 */

import type { Config, LogFn, SessionSeed } from "../../types";
import type { AffinityCache } from "../../types/affinity";
import type { AffinityStore } from "../affinity/store";
import type { BlacklistService } from "./repository";

export interface UnblockPermanentDeps {
  config: Config;
  log: LogFn;
  store: AffinityStore;
  cache: AffinityCache;
  blacklist: BlacklistService;
}

export interface UnblockPermanentInput {
  source: "command" | "xml";
  platform: string;
  userId: string;
  seed?: SessionSeed;
}

export interface UnblockPermanentResult {
  removed: boolean;
  affinityReset: boolean;
  affinity: number | null;
}

export function createPermanentUnblockHandler(deps: UnblockPermanentDeps) {
  const { config, log, store, cache, blacklist } = deps;

  return async (
    input: UnblockPermanentInput,
  ): Promise<UnblockPermanentResult> => {
    const { source, platform, userId, seed } = input;
    const exists = await blacklist.isBlacklisted(platform, userId);
    if (!exists) {
      log("info", "解除永久黑名单未命中目标用户", {
        source,
        platform,
        userId,
      });
      return {
        removed: false,
        affinityReset: false,
        affinity: null,
      };
    }

    const nextAffinity = Number(config.unblockPermanentInitialAffinity ?? 0);
    const existing = await store.load(config.scopeId, userId);
    const removed = await blacklist.removePermanent(platform, userId);
    if (!removed) {
      log("warn", "解除永久黑名单失败，删除黑名单记录未成功", {
        source,
        platform,
        userId,
      });
      return {
        removed: false,
        affinityReset: false,
        affinity: null,
      };
    }

    try {
      const saved = await store.save(
        {
          ...seed,
          platform,
          userId,
        },
        nextAffinity,
        existing?.specialRelation || "",
        {
          longTermAffinity: nextAffinity,
          shortTermAffinity: 0,
          chatCount: 0,
          actionStats: {
            entries: [],
            total: 0,
            counts: { increase: 0, decrease: 0 },
          },
          coefficientState: {
            streak: 0,
            coefficient: 1,
            decayPenalty: 0,
            streakBoost: 0,
            inactivityDays: 0,
            lastInteractionAt: null,
          },
          lastInteractionAt: new Date(0),
        },
      );

      cache.clear(config.scopeId, userId);

      log("info", "解除永久黑名单后已重置好感度", {
        scopeId: config.scopeId,
        source,
        platform,
        userId,
        affinity: saved?.affinity ?? nextAffinity,
      });

      return {
        removed: true,
        affinityReset: true,
        affinity: saved?.affinity ?? nextAffinity,
      };
    } catch (error) {
      await blacklist.recordPermanent(platform, userId, {
        note: `rollback:${source}`,
        nickname: existing?.nickname || userId,
      });
      cache.clear(config.scopeId, userId);
      log("warn", "解除永久黑名单后重置好感度失败，已回滚黑名单状态", {
        scopeId: config.scopeId,
        source,
        platform,
        userId,
        error,
      });
      return {
        removed: false,
        affinityReset: false,
        affinity: null,
      };
    }
  };
}
