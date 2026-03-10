/**
 * 好感度区间变量提供者
 * 提供当前用户的好感度区间、关系与备注
 */

import type { AffinityStore } from "../../../services/affinity/store";
import type { Config } from "../../../types";
import { resolveScopedVariableArgs } from "../../../helpers";

interface ProviderConfigurable {
  session?: {
    platform?: string;
    userId?: string;
    selfId?: string;
  };
}

export interface RelationshipLevelProviderDeps {
  store: AffinityStore;
  config: Config;
}

export function createRelationshipLevelProvider(
  deps: RelationshipLevelProviderDeps,
) {
  const { store, config } = deps;

  return async (
    args: unknown[] | undefined,
    _variables: unknown,
    configurable?: ProviderConfigurable,
  ): Promise<string> => {
    const session = configurable?.session;
    const resolved = resolveScopedVariableArgs(args);
    const scopeId = resolved?.scopeId;
    if (!scopeId || scopeId !== config.scopeId) return "";

    const userId = String(
      resolved?.targetUserId || session?.userId || "",
    ).trim();
    if (!userId) return "";

    const levels = config.relationshipAffinityLevels || [];
    if (!levels.length) return "";

    await store.load(scopeId, userId);

    const lines = levels.map((level) => {
      const range = `${level.min}-${level.max}`;
      const note = level.note?.trim();
      const detail = note ? `${level.relation}（${note}）` : level.relation;
      return `${range}：${detail}`;
    });

    return lines.join("\n");
  };
}

export type RelationshipLevelProvider = ReturnType<
  typeof createRelationshipLevelProvider
>;
