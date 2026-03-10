/**
 * 好感度缓存
 * 提供简单的单条目缓存，用于快速读取最近访问的好感度值
 */

import type { AffinityCache } from "../../types";

export function createAffinityCache(): AffinityCache {
  let entry: { scopeId: string; userId: string; value: number } | null = null;

  const match = (scopeId: string, userId: string): boolean =>
    entry !== null && entry.scopeId === scopeId && entry.userId === userId;

  return {
    get(scopeId: string, userId: string): number | null {
      return match(scopeId, userId) ? entry!.value : null;
    },
    set(scopeId: string, userId: string, value: number): void {
      entry = { scopeId, userId, value };
    },
    clear(scopeId: string, userId: string): void {
      if (match(scopeId, userId)) entry = null;
    },
    clearAll(): void {
      entry = null;
    },
  };
}
