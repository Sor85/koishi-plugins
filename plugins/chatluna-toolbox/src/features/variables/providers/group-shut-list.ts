/**
 * 群禁言列表变量提供者
 * 输出当前群聊中被禁言成员的统一文本列表
 */

import type { Session } from "koishi";
import {
  callOneBotAPI,
  ensureOneBotSession,
} from "../../native-tools/onebot-api";
import { resolveOneBotProtocol } from "../../native-tools/register";
import type { Config, LogFn } from "../../../types";

interface ProviderConfigurable {
  session?: Session;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

interface NapCatShutItem {
  uin?: string | number;
  nick?: string;
  remark?: string;
  cardName?: string;
  shutUpTime?: string | number;
}

interface LlbotShutItem {
  user_id?: string | number;
  nickname?: string;
  shut_up_time?: string | number;
}

interface NormalizedShutItem {
  userId: string;
  cardName: string;
  shutUpTimeText: string;
}

interface OneBotEnvelope {
  status?: string;
  retcode?: number;
  message?: string;
  wording?: string;
  data?: unknown;
}

interface CallGroupShutListResult {
  list: Array<NapCatShutItem | LlbotShutItem>;
  shouldFallback: boolean;
}

interface GroupShutListDebugMeta {
  stage?: string;
  preferredProtocol?: string;
  groupId?: string | number;
  groupIdType?: string;
  canFallback?: boolean;
  elapsedMs?: number;
  resultKind?: string;
  status?: string;
  retcode?: number;
  dataKind?: string;
  dataLength?: number;
  shouldFallback?: boolean;
  errorMessage?: string;
}

export interface GroupShutListProviderDeps {
  config: Config;
  log?: LogFn;
}

const GROUP_SHUT_LIST_TIMEOUT_MS = 200;
const GROUP_SHUT_LIST_TIMEOUT_ERROR = "请求群禁言列表超时。";
const GROUP_SHUT_LIST_CACHE_TTL_MS = 15_000;

function normalizeTimestamp(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "" || Number(raw) === 0)
    return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return numeric < 1e11 ? numeric * 1000 : numeric;
}

function formatDateTime(value: number | null): string {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "未知";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function pickFirst(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeShutItem(
  item: NapCatShutItem | LlbotShutItem,
): NormalizedShutItem | null {
  const userId = pickFirst(
    (item as NapCatShutItem).uin,
    (item as LlbotShutItem).user_id,
  );
  if (!userId) return null;
  const cardName = pickFirst(
    (item as NapCatShutItem).cardName,
    (item as NapCatShutItem).remark,
    (item as NapCatShutItem).nick,
    (item as LlbotShutItem).nickname,
    userId,
  );
  const shutUpTimeText = formatDateTime(
    normalizeTimestamp(
      pickFirst(
        (item as NapCatShutItem).shutUpTime,
        (item as LlbotShutItem).shut_up_time,
      ),
    ),
  );
  return {
    userId,
    cardName,
    shutUpTimeText,
  };
}

function previewText(text: unknown, max = 180): string {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

function getDataKind(data: unknown): string {
  if (Array.isArray(data)) return "array";
  if (data === null) return "null";
  if (data === undefined) return "undefined";
  return typeof data;
}

function debug(log: LogFn | undefined, message: string, meta?: GroupShutListDebugMeta): void {
  log?.("debug", message, meta);
}

function debugErrorMessage(error: unknown): string {
  if (error instanceof Error) return previewText(error.message);
  return previewText(error);
}

function withTiming<T>(promise: Promise<T>): Promise<{ value: T; elapsedMs: number }> {
  const startedAt = Date.now();
  return promise.then((value) => ({
    value,
    elapsedMs: Date.now() - startedAt,
  }));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(GROUP_SHUT_LIST_TIMEOUT_ERROR));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isOneBotEnvelope(result: unknown): result is OneBotEnvelope {
  return !!result && typeof result === "object" && !Array.isArray(result);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === GROUP_SHUT_LIST_TIMEOUT_ERROR;
}

function normalizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "";
  return error.message.toLowerCase();
}

function shouldFallbackByError(error: unknown): boolean {
  if (isTimeoutError(error)) return false;
  const message = normalizeErrorMessage(error);
  if (!message) return false;
  return (
    message.includes("string required") ||
    message.includes("number required") ||
    message.includes("invalid") ||
    message.includes("type") ||
    message.includes("参数")
  );
}

function shouldFallbackByEnvelope(envelope: OneBotEnvelope): boolean {
  const message = `${envelope.message || ""} ${envelope.wording || ""}`
    .toLowerCase()
    .trim();
  if (!message) return false;
  return (
    message.includes("string") ||
    message.includes("number") ||
    message.includes("type") ||
    message.includes("参数")
  );
}

function debugEnvelopeMeta(result: unknown): GroupShutListDebugMeta {
  if (!isOneBotEnvelope(result)) {
    return {
      resultKind: Array.isArray(result) ? "array" : typeof result,
    };
  }

  return {
    resultKind: "envelope",
    status: previewText(result.status),
    retcode: typeof result.retcode === "number" ? result.retcode : undefined,
    dataKind: getDataKind(result.data),
    dataLength: Array.isArray(result.data) ? result.data.length : undefined,
    errorMessage: previewText(result.message || result.wording),
  };
}

function parseShutListResult(result: unknown): CallGroupShutListResult {
  if (Array.isArray(result)) {
    return { list: result, shouldFallback: false };
  }

  if (!isOneBotEnvelope(result)) {
    return { list: [], shouldFallback: false };
  }

  const status = String(result.status || "").toLowerCase();
  const hasRetcode = typeof result.retcode === "number";
  const failedByRetcode = hasRetcode && result.retcode !== 0;
  const failedByStatus = !!status && status !== "ok";

  if (failedByRetcode || failedByStatus) {
    if (shouldFallbackByEnvelope(result)) {
      return { list: [], shouldFallback: true };
    }

    const errorText = String(result.message || result.wording || "接口调用失败。");
    throw new Error(errorText);
  }

  if (Array.isArray(result.data)) {
    return {
      list: result.data as Array<NapCatShutItem | LlbotShutItem>,
      shouldFallback: false,
    };
  }

  if (result.data == null) {
    return { list: [], shouldFallback: false };
  }

  return { list: [], shouldFallback: false };
}

async function callGroupShutList(
  internal: Parameters<typeof callOneBotAPI>[0],
  groupId: string | number,
  log?: LogFn,
  preferredProtocol?: string,
): Promise<CallGroupShutListResult> {
  debug(log, "groupShutList: request start", {
    stage: "request.start",
    preferredProtocol,
    groupId,
    groupIdType: typeof groupId,
  });

  const { value: result, elapsedMs } = await withTiming(
    withTimeout(
      callOneBotAPI(
        internal,
        "get_group_shut_list",
        { group_id: groupId },
        ["getGroupShutList"],
      ),
      GROUP_SHUT_LIST_TIMEOUT_MS,
    ),
  );

  debug(log, "groupShutList: request resolved", {
    stage: "request.resolved",
    preferredProtocol,
    groupId,
    groupIdType: typeof groupId,
    elapsedMs,
    ...debugEnvelopeMeta(result),
  });

  const parsed = parseShutListResult(result);
  debug(log, "groupShutList: response parsed", {
    stage: "response.parsed",
    preferredProtocol,
    groupId,
    groupIdType: typeof groupId,
    elapsedMs,
    shouldFallback: parsed.shouldFallback,
    dataLength: parsed.list.length,
  });

  return parsed;
}

async function fetchGroupShutList(
  session: Session,
  config: Config,
  log?: LogFn,
): Promise<Array<NapCatShutItem | LlbotShutItem>> {
  const { error, internal } = ensureOneBotSession(session);
  if (error || !internal)
    throw new Error(error || "缺少 OneBot internal 接口。");

  const preferredProtocol = resolveOneBotProtocol(config);
  const preferredGroupId =
    preferredProtocol === "llbot"
      ? String(session.guildId)
      : Number(session.guildId);
  const fallbackGroupId =
    preferredProtocol === "llbot"
      ? Number(session.guildId)
      : String(session.guildId);

  const canFallback = preferredGroupId !== fallbackGroupId;

  debug(log, "groupShutList: fetch start", {
    stage: "fetch.start",
    preferredProtocol,
    canFallback,
    groupId: preferredGroupId,
    groupIdType: typeof preferredGroupId,
  });

  try {
    const primary = await callGroupShutList(
      internal,
      preferredGroupId,
      log,
      preferredProtocol,
    );

    if (!canFallback || !primary.shouldFallback) return primary.list;

    debug(log, "groupShutList: trigger fallback by envelope", {
      stage: "fallback.envelope",
      preferredProtocol,
      canFallback,
      groupId: fallbackGroupId,
      groupIdType: typeof fallbackGroupId,
      shouldFallback: primary.shouldFallback,
    });

    const fallback = await callGroupShutList(
      internal,
      fallbackGroupId,
      log,
      preferredProtocol,
    );
    return fallback.list;
  } catch (error) {
    const fallbackByError = shouldFallbackByError(error);
    debug(log, "groupShutList: request failed", {
      stage: "request.error",
      preferredProtocol,
      canFallback,
      errorMessage: debugErrorMessage(error),
      shouldFallback: fallbackByError,
    });

    if (!canFallback || !fallbackByError) throw error;

    debug(log, "groupShutList: trigger fallback by error", {
      stage: "fallback.error",
      preferredProtocol,
      groupId: fallbackGroupId,
      groupIdType: typeof fallbackGroupId,
      errorMessage: debugErrorMessage(error),
    });

    const fallback = await callGroupShutList(
      internal,
      fallbackGroupId,
      log,
      preferredProtocol,
    );
    return fallback.list;
  }
}

function readCache(
  cache: Map<string, CacheEntry>,
  guildId: string,
  now: number,
): string | null {
  const entry = cache.get(guildId);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(guildId);
    return null;
  }
  return entry.value;
}

function writeCache(
  cache: Map<string, CacheEntry>,
  guildId: string,
  value: string,
  now: number,
): void {
  cache.set(guildId, {
    value,
    expiresAt: now + GROUP_SHUT_LIST_CACHE_TTL_MS,
  });
}

function renderShutList(items: NormalizedShutItem[]): string {
  if (items.length === 0) return "当前群暂无禁言成员。";
  return items
    .map(
      (item) =>
        `id：${item.userId}，name：${item.cardName}，禁言截至：${item.shutUpTimeText}`,
    )
    .join("\n");
}

export function createGroupShutListProvider(deps: GroupShutListProviderDeps) {
  const { config, log } = deps;
  const cache = new Map<string, CacheEntry>();

  return async (
    _args: unknown,
    _variables: unknown,
    configurable?: ProviderConfigurable,
  ): Promise<string> => {
    const session = configurable?.session;
    if (!session) return "暂无群禁言列表。";
    if (!session.guildId) return "";
    if (session.platform !== "onebot")
      return "当前平台暂不支持查询群禁言列表。";

    const guildId = String(session.guildId);
    const cached = readCache(cache, guildId, Date.now());
    if (cached !== null) {
      debug(log, "groupShutList: cache hit", {
        stage: "cache.hit",
        groupId: guildId,
        groupIdType: typeof guildId,
      });
      return cached;
    }

    debug(log, "groupShutList: cache miss", {
      stage: "cache.miss",
      groupId: guildId,
      groupIdType: typeof guildId,
    });

    try {
      const list = await fetchGroupShutList(session, config, log);
      const normalized = list
        .map(normalizeShutItem)
        .filter(Boolean) as NormalizedShutItem[];
      const result = renderShutList(normalized);
      writeCache(cache, guildId, result, Date.now());

      debug(log, "groupShutList: provider success", {
        stage: "provider.success",
        groupId: guildId,
        dataLength: list.length,
      });

      return result;
    } catch (error) {
      debug(log, "groupShutList: provider failed", {
        stage: "provider.error",
        groupId: guildId,
        errorMessage: debugErrorMessage(error),
      });
      log?.("debug", "群禁言列表变量解析失败", error);
      if (isTimeoutError(error)) return "当前群暂无禁言成员。";
      return "获取群禁言列表失败。";
    }
  };
}
