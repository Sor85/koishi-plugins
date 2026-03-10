/**
 * 好感度变量提供者
 * 为 ChatLuna 提供当前用户及上下文用户好感度变量
 */

import type { Session } from "koishi";
import type { Config, AffinityCache } from "../../../types";
import type { AffinityStore } from "../../../services/affinity/store";
import type { HistoryEntry } from "../../../services/message/history";
import { resolveScopedVariableArgs } from "../../../helpers";

interface ProviderConfigurable {
  session?: Session;
}

export interface AffinityProviderDeps {
  config: Config;
  cache: AffinityCache;
  store: AffinityStore;
  fetchEntries?: (session: Session, count: number) => Promise<HistoryEntry[]>;
}

export function createAffinityProvider(deps: AffinityProviderDeps) {
  const { config, cache, store, fetchEntries } = deps;

  return async (
    args: unknown[] | undefined,
    _variables: unknown,
    configurable?: ProviderConfigurable,
  ): Promise<number | string> => {
    const session = configurable?.session;
    if (!session?.platform || !session?.userId) {
      return "";
    }

    const resolved = resolveScopedVariableArgs(args);
    const scopeId = resolved?.scopeId;
    if (!scopeId || scopeId !== config.scopeId) return "";

    const targetUserId = resolved?.targetUserId || session.userId;
    if (config.debugLogging) {
      console.log("[chatluna-affinity] affinity variable", {
        scopeId,
        targetUserId,
        sessionUserId: session.userId,
        platform: session.platform,
        hasArgs: Array.isArray(args) && args.length > 0,
        resolvedScopeId: resolved?.scopeId || "",
        resolvedTargetUserId: resolved?.targetUserId || "",
      });
    }
    const cached = cache.get(scopeId, targetUserId);
    if (cached !== null && (config.affinityDisplayRange ?? 1) <= 1) {
      return cached;
    }

    const currentRecord = await store.load(scopeId, targetUserId);
    if (!currentRecord) return "";

    const currentAffinity = currentRecord.affinity ?? 0;
    cache.set(scopeId, targetUserId, currentAffinity);

    const displayRange = Math.max(
      1,
      Math.floor(config.affinityDisplayRange ?? 1),
    );
    if (displayRange <= 1) return currentAffinity;
    if (typeof fetchEntries !== "function") return currentAffinity;

    const entries = await fetchEntries(session, Math.max(1, displayRange * 10));
    const orderedUsers: { userId: string; username: string }[] = [];
    const seen = new Set<string>([targetUserId]);

    for (const entry of entries) {
      const userId = entry.userId;
      if (!userId || userId === session.selfId) continue;
      if (seen.has(userId)) continue;
      seen.add(userId);
      orderedUsers.push({
        userId,
        username: entry.username || userId,
      });
      if (orderedUsers.length >= displayRange - 1) break;
    }

    const rows: string[] = [];
    const currentRelation =
      currentRecord.specialRelation || currentRecord.relation || "未知";
    const currentName = currentRecord.nickname || targetUserId;
    rows.push(
      `id:${targetUserId} name:${currentName} affinity:${currentAffinity} relationship:${currentRelation}`,
    );

    if (!orderedUsers.length) return rows.join("\n");

    const others = await Promise.all(
      orderedUsers.map(async ({ userId, username }) => {
        const record = await store.load(scopeId, userId);
        if (!record) return null;
        const affinity = record.affinity ?? 0;
        const relation = record.specialRelation || record.relation || "未知";
        const name = username || record.nickname || userId;
        return `id:${userId} name:${name} affinity:${affinity} relationship:${relation}`;
      }),
    );

    rows.push(...(others.filter(Boolean) as string[]));
    return rows.join("\n");
  };
}

export type AffinityProvider = ReturnType<typeof createAffinityProvider>;
