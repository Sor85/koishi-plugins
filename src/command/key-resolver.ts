/**
 * 模板 key 解析器
 * 支持将中文关键词与快捷别名映射为后端真实 key
 */

import type { MemeInfoResponse, MemeShortcut } from "../types";

interface MemeKeyResolverClient {
  getKeys(): Promise<string[]>;
  getInfo(key: string): Promise<MemeInfoResponse>;
}

export interface DirectAliasEntry {
  alias: string;
  keys: string[];
}

export interface DirectAliasListResult {
  entries: DirectAliasEntry[];
  totalKeys: number;
  failedInfoKeys: number;
  hasInfoFailure: boolean;
}

export interface KeyResolverOptions {
  infoFetchConcurrency?: number;
}

function normalizeAlias(input: string): string {
  return input.trim().toLowerCase();
}

function registerAliasCandidate(
  index: Map<string, Set<string>>,
  alias: string,
  key: string,
): void {
  const normalizedAlias = normalizeAlias(alias);
  if (!normalizedAlias) return;

  const candidates = index.get(normalizedAlias);
  if (candidates) {
    candidates.add(key);
    return;
  }

  index.set(normalizedAlias, new Set([key]));
}

function collectShortcutAliases(shortcuts: MemeShortcut[]): string[] {
  const aliases: string[] = [];

  for (const shortcut of shortcuts) {
    aliases.push(shortcut.key);
    if (shortcut.humanized) aliases.push(shortcut.humanized);
  }

  return aliases;
}

function toSortedUniqueKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.filter(Boolean))].sort();
}

const INFO_FETCH_CONCURRENCY = 10;

function resolveInfoFetchConcurrency(
  options: KeyResolverOptions,
  keyCount: number,
): number {
  if (keyCount <= 0) return 0;

  const normalizedConcurrency =
    typeof options.infoFetchConcurrency === "number" &&
    Number.isFinite(options.infoFetchConcurrency)
      ? Math.floor(options.infoFetchConcurrency)
      : 0;

  if (normalizedConcurrency <= 0) return keyCount;
  return Math.min(keyCount, Math.max(1, normalizedConcurrency));
}

interface KeyInfoResult {
  key: string;
  info?: MemeInfoResponse;
  failed: boolean;
}

async function fetchKeyInfos(
  client: MemeKeyResolverClient,
  keys: string[],
  options: KeyResolverOptions,
): Promise<KeyInfoResult[]> {
  const results: KeyInfoResult[] = new Array(keys.length);
  const workerCount = resolveInfoFetchConcurrency(options, keys.length);
  let nextIndex = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= keys.length) break;

      const key = keys[index];
      try {
        const info = await client.getInfo(key);
        results[index] = { key, info, failed: false };
      } catch {
        results[index] = { key, failed: true };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

async function buildAliasIndex(
  client: MemeKeyResolverClient,
  keyMap: Map<string, string>,
  options: KeyResolverOptions,
): Promise<{ aliasIndex: Map<string, string[]>; hasInfoFailure: boolean }> {
  const aliasCandidateMap = new Map<string, Set<string>>();
  const keys = Array.from(keyMap.values());

  for (const key of keys) {
    registerAliasCandidate(aliasCandidateMap, key, key);
  }

  const keyInfos = await fetchKeyInfos(client, keys, options);
  const hasInfoFailure = keyInfos.some((item) => item.failed);

  for (const item of keyInfos) {
    if (!item.info) continue;
    for (const keyword of item.info.keywords) {
      registerAliasCandidate(aliasCandidateMap, keyword, item.key);
    }
    for (const shortcutAlias of collectShortcutAliases(item.info.shortcuts)) {
      registerAliasCandidate(aliasCandidateMap, shortcutAlias, item.key);
    }
  }

  return {
    aliasIndex: new Map(
      Array.from(aliasCandidateMap.entries()).map(([alias, keyCandidates]) => [
        alias,
        toSortedUniqueKeys(Array.from(keyCandidates)),
      ]),
    ),
    hasInfoFailure,
  };
}

export function shouldRegisterDirectAlias(alias: string): boolean {
  const normalizedAlias = normalizeAlias(alias);
  if (!normalizedAlias) return false;
  if (normalizedAlias.includes(" ")) return false;
  if (/^[a-z0-9._-]+$/i.test(normalizedAlias)) return false;
  return true;
}

export async function listDirectAliases(
  client: MemeKeyResolverClient,
  options: KeyResolverOptions = {},
): Promise<DirectAliasListResult> {
  const keyMap = new Map<string, string>();
  for (const key of await client.getKeys()) {
    const normalizedKey = normalizeAlias(key);
    if (!normalizedKey) continue;
    keyMap.set(normalizedKey, key);
  }

  const aliasCandidateMap = new Map<string, Set<string>>();
  const keys = Array.from(keyMap.values());
  const keyInfos = await fetchKeyInfos(client, keys, options);
  for (const item of keyInfos) {
    if (!item.info) continue;
    for (const keyword of item.info.keywords) {
      if (!shouldRegisterDirectAlias(keyword)) continue;
      registerAliasCandidate(aliasCandidateMap, keyword, item.key);
    }
    for (const shortcutAlias of collectShortcutAliases(item.info.shortcuts)) {
      if (!shouldRegisterDirectAlias(shortcutAlias)) continue;
      registerAliasCandidate(aliasCandidateMap, shortcutAlias, item.key);
    }
  }

  const failedInfoKeys = keyInfos.filter((item) => item.failed).length;
  return {
    entries: Array.from(aliasCandidateMap.entries()).map(
      ([alias, keyCandidates]) => ({
        alias,
        keys: toSortedUniqueKeys(Array.from(keyCandidates)),
      }),
    ),
    totalKeys: keys.length,
    failedInfoKeys,
    hasInfoFailure: failedInfoKeys > 0,
  };
}

export function createMemeKeyResolver(
  client: MemeKeyResolverClient,
  options: KeyResolverOptions = {},
) {
  let keyMapPromise: Promise<Map<string, string>> | undefined;
  let aliasIndexPromise: Promise<Map<string, string[]>> | undefined;

  const getKeyMap = async (): Promise<Map<string, string>> => {
    if (!keyMapPromise) {
      keyMapPromise = client
        .getKeys()
        .then((keys) => {
          const keyMap = new Map<string, string>();
          for (const key of keys) {
            const normalizedKey = normalizeAlias(key);
            if (!normalizedKey) continue;
            keyMap.set(normalizedKey, key);
          }
          return keyMap;
        })
        .catch((error) => {
          keyMapPromise = undefined;
          aliasIndexPromise = undefined;
          throw error;
        });
    }
    return await keyMapPromise;
  };

  const getAliasIndex = async (): Promise<Map<string, string[]>> => {
    if (!aliasIndexPromise) {
      aliasIndexPromise = getKeyMap()
        .then(async (keyMap) => {
          const { aliasIndex, hasInfoFailure } = await buildAliasIndex(
            client,
            keyMap,
            options,
          );
          if (hasInfoFailure) {
            aliasIndexPromise = undefined;
          }
          return aliasIndex;
        })
        .catch((error) => {
          aliasIndexPromise = undefined;
          throw error;
        });
    }
    return await aliasIndexPromise;
  };

  return async (input: string): Promise<string> => {
    const trimmedInput = input.trim();
    const normalizedInput = normalizeAlias(trimmedInput);
    if (!normalizedInput) return trimmedInput;

    const keyMap = await getKeyMap();
    const directKey = keyMap.get(normalizedInput);
    if (directKey) return directKey;

    const aliasIndex = await getAliasIndex();
    const aliasCandidates = aliasIndex.get(normalizedInput);
    if (!aliasCandidates || aliasCandidates.length === 0) return trimmedInput;
    if (aliasCandidates.length === 1) return aliasCandidates[0];
    return aliasCandidates[Math.floor(Math.random() * aliasCandidates.length)];
  };
}
