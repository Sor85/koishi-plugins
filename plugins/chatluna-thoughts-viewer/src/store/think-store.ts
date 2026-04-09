/**
 * 思考内容内存存储
 * 按平台/群维度缓存当前与上一次思考
 */

import type { ThoughtSession, ThinkStore, ThoughtSnapshot } from "../types";

export function buildThoughtStoreKey(
  session: ThoughtSession | null | undefined,
): string | null {
  if (!session?.platform) {
    return null;
  }

  const guildId = session.guildId || "private";
  return `${session.platform}:${guildId}`;
}

export function createThinkStore(): ThinkStore {
  const storage = new Map<string, ThoughtSnapshot>();

  return {
    update: (key, content) => {
      const existing = storage.get(key);
      if (!existing) {
        storage.set(key, { current: content });
        return;
      }

      storage.set(key, {
        current: content,
        previous: existing.current,
      });
    },
    getCurrent: (key) => storage.get(key)?.current,
    getPrevious: (key) => storage.get(key)?.previous,
    size: () => storage.size,
  };
}
