/**
 * 模型响应日志拦截
 * 提供 logger hook 与 runtime 生命周期管理能力
 */

import type { Context } from "koishi";
import type { LogFn } from "../../types";

interface LoggerLike {
  debug?: (...args: unknown[]) => void;
}

interface CharacterServiceLike {
  logger?: LoggerLike;
}

interface HookCharacterModelResponseLoggerParams {
  logger: LoggerLike | null | undefined;
  processModelResponse: (response: string) => Promise<void>;
  log?: LogFn;
  tag?: string;
}

interface CharacterModelResponseRuntimeParams {
  ctx: Pick<Context, "setTimeout" | "setInterval">;
  getCharacterService: () => CharacterServiceLike | null | undefined;
  processModelResponse: (response: string) => Promise<void>;
  log?: LogFn;
  startupDelayMs?: number;
  retryIntervalMs?: number;
  monitorIntervalMs?: number;
  tag?: string;
}

export interface CharacterModelResponseRuntime {
  start: () => void;
  stop: () => void;
  attach: () => boolean;
  isActive: () => boolean;
}

const MODEL_RESPONSE_PREFIX = "model response:";
const HOOK_TAG = "__chatlunaAffinityModelResponseInterceptor";
const ORIGINAL_DEBUG_TAG = "__chatlunaAffinityOriginalDebug";
const OWNER_TAG = "__chatlunaAffinityHookOwner";

function stringifyLogPart(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function isTaggedDebug(
  debug: LoggerLike["debug"],
  tag: string = HOOK_TAG,
): boolean {
  return Boolean(
    debug &&
    typeof debug === "function" &&
    (debug as unknown as Record<string, unknown>)[tag],
  );
}

function getHookOwner(
  debug: LoggerLike["debug"],
  tag: string = HOOK_TAG,
): unknown {
  if (!isTaggedDebug(debug, tag)) return null;
  return (debug as unknown as Record<string, unknown>)[OWNER_TAG] ?? null;
}

function getOriginalDebug(
  debug: LoggerLike["debug"],
  tag: string = HOOK_TAG,
): LoggerLike["debug"] | undefined {
  if (!isTaggedDebug(debug, tag)) return undefined;
  return (debug as unknown as Record<string, unknown>)[ORIGINAL_DEBUG_TAG] as
    | LoggerLike["debug"]
    | undefined;
}

function hasOwnedTaggedDebug(
  debug: LoggerLike["debug"],
  owner: unknown,
  tag: string = HOOK_TAG,
): boolean {
  if (!owner || typeof debug !== "function") return false;
  if (!isTaggedDebug(debug, tag)) return false;
  if (getHookOwner(debug, tag) === owner) return true;
  return hasOwnedTaggedDebug(getOriginalDebug(debug, tag), owner, tag);
}

function removeOwnedTaggedDebug(
  debug: LoggerLike["debug"],
  owner: unknown,
  tag: string = HOOK_TAG,
): { debug: LoggerLike["debug"]; removed: boolean } {
  if (!owner || typeof debug !== "function" || !isTaggedDebug(debug, tag)) {
    return { debug, removed: false };
  }

  if (getHookOwner(debug, tag) === owner) {
    return {
      debug: getOriginalDebug(debug, tag),
      removed: true,
    };
  }

  const originalDebug = getOriginalDebug(debug, tag);
  const next = removeOwnedTaggedDebug(originalDebug, owner, tag);
  if (!next.removed) {
    return { debug, removed: false };
  }

  (debug as unknown as Record<string, unknown>)[ORIGINAL_DEBUG_TAG] =
    next.debug;
  return { debug, removed: true };
}

function restoreTaggedLogger(
  logger: LoggerLike,
  owner?: unknown,
  tag: string = HOOK_TAG,
): void {
  const currentDebug = logger.debug;
  if (!isTaggedDebug(currentDebug, tag)) return;
  if (owner === undefined) {
    const originalDebug = getOriginalDebug(currentDebug, tag);
    if (typeof originalDebug === "function") {
      logger.debug = originalDebug;
    }
    return;
  }

  const next = removeOwnedTaggedDebug(currentDebug, owner, tag);
  if (!next.removed) return;
  if (typeof next.debug === "function") {
    logger.debug = next.debug;
  }
}

export function extractModelResponseText(args: unknown[]): string | null {
  if (!Array.isArray(args) || args.length < 1) return null;

  const [first, ...rest] = args.map(stringifyLogPart);
  if (!first.startsWith(MODEL_RESPONSE_PREFIX)) return null;

  const inline = first.slice(MODEL_RESPONSE_PREFIX.length).trimStart();
  if (inline) return inline;

  const joined = rest.join(" ").trim();
  return joined || null;
}

export function hookCharacterModelResponseLogger(
  params: HookCharacterModelResponseLoggerParams,
): (() => void) | null {
  const { logger, processModelResponse, log, tag = HOOK_TAG } = params;
  if (!logger || typeof logger.debug !== "function") return null;

  const originalDebug = logger.debug;
  if (typeof originalDebug !== "function") return null;

  const patchedDebug = function patchedDebug(
    this: unknown,
    ...args: unknown[]
  ): void {
    originalDebug.apply(this, args);

    const response = extractModelResponseText(args);
    if (!response) return;

    void processModelResponse(response).catch((error) => {
      log?.("warn", "处理模型响应日志失败", { error });
    });
  };

  (patchedDebug as unknown as Record<string, unknown>)[tag] = true;
  (patchedDebug as unknown as Record<string, unknown>)[ORIGINAL_DEBUG_TAG] =
    originalDebug;
  (patchedDebug as unknown as Record<string, unknown>)[OWNER_TAG] =
    patchedDebug;

  logger.debug = patchedDebug;

  return () => {
    if (logger.debug === patchedDebug) {
      logger.debug = originalDebug;
      return;
    }
    restoreTaggedLogger(logger, patchedDebug, tag);
  };
}

export function createCharacterModelResponseRuntime(
  params: CharacterModelResponseRuntimeParams,
): CharacterModelResponseRuntime {
  const {
    ctx,
    getCharacterService,
    processModelResponse,
    log,
    startupDelayMs = 3000,
    retryIntervalMs = 3000,
    monitorIntervalMs = 5000,
    tag = HOOK_TAG,
  } = params;

  let startupHandle: (() => void) | null = null;
  let fastRetryHandle: (() => void) | null = null;
  let monitorHandle: (() => void) | null = null;
  let activeLogger: LoggerLike | null = null;
  let activeOwner: unknown = null;
  let restoreActiveHook: (() => void) | null = null;

  const restore = (): void => {
    if (activeLogger) {
      restoreTaggedLogger(activeLogger, activeOwner ?? undefined, tag);
    } else {
      restoreActiveHook?.();
    }
    restoreActiveHook = null;
    activeLogger = null;
    activeOwner = null;
  };

  const attach = (): boolean => {
    const characterService = getCharacterService();
    const logger = characterService?.logger;
    const debug = logger?.debug;
    const sameLogger = Boolean(activeLogger && activeLogger === logger);
    const sameDebug = Boolean(activeOwner && activeOwner === debug);
    const tagged = isTaggedDebug(debug, tag);
    const owned = hasOwnedTaggedDebug(debug, activeOwner, tag);
    log?.("info", "模型响应拦截 runtime attach 检查", {
      hasCharacterService: Boolean(characterService),
      hasLogger: Boolean(logger),
      debugType: typeof debug,
      sameLogger,
      sameDebug,
      tagged,
      owned,
    });
    if (!logger || typeof debug !== "function") return false;

    if (activeLogger && activeLogger !== logger) {
      log?.("warn", "模型响应拦截器检测到 logger 实例变化", {
        hadActiveLogger: Boolean(activeLogger),
        sameLogger,
      });
      restore();
    }

    if (activeLogger === logger && owned) {
      return true;
    }

    const unhook = hookCharacterModelResponseLogger({
      logger,
      processModelResponse,
      log,
      tag,
    });
    if (!unhook) return false;

    activeLogger = logger;
    activeOwner = logger.debug;
    restoreActiveHook = unhook;
    log?.("info", "已挂载 chatluna_character 模型响应拦截器");
    return true;
  };

  const stopFastRetry = (): void => {
    if (!fastRetryHandle) return;
    fastRetryHandle();
    fastRetryHandle = null;
  };

  const isActive = (): boolean => {
    const logger = getCharacterService()?.logger;
    const debug = logger?.debug;
    const owned = Boolean(
      logger && hasOwnedTaggedDebug(debug, activeOwner, tag),
    );

    if (!owned && activeOwner) {
      log?.("debug", "模型响应拦截器当前判定为失活", {
        hasLogger: Boolean(logger),
        sameLogger: Boolean(activeLogger && activeLogger === logger),
        sameDebug: activeOwner === debug,
        tagged: isTaggedDebug(debug, tag),
        debugType: typeof debug,
      });
    }

    return owned;
  };

  const startFastRetry = (): void => {
    if (fastRetryHandle) return;
    fastRetryHandle = ctx.setInterval(() => {
      if (isActive()) {
        stopFastRetry();
        return;
      }
      if (attach()) {
        log?.("info", "模型响应拦截器已恢复");
        stopFastRetry();
      }
    }, retryIntervalMs);
  };

  const ensureActive = (): void => {
    if (isActive()) {
      stopFastRetry();
      return;
    }
    if (!attach()) {
      log?.("debug", "模型响应拦截器未就绪，等待重试");
      startFastRetry();
    }
  };

  const startMonitor = (): void => {
    if (monitorHandle) return;
    monitorHandle = ctx.setInterval(() => {
      const wasActive = isActive();
      ensureActive();
      if (!wasActive && isActive()) {
        log?.("info", "模型响应拦截器监测到失活后已重新挂载");
      }
    }, monitorIntervalMs);
  };

  return {
    start: () => {
      if (startupHandle) return;
      log?.("info", "模型响应拦截 runtime start 已调用", {
        startupDelayMs,
        retryIntervalMs,
        monitorIntervalMs,
      });
      log?.("debug", "模型响应拦截 runtime 启动中");
      startupHandle = ctx.setTimeout(() => {
        startupHandle = null;
        log?.("info", "模型响应拦截 runtime 启动定时器已触发");
        if (!attach()) {
          log?.("warn", "chatluna_character logger 不可用，将自动重试挂载");
          startFastRetry();
        }
        startMonitor();
      }, startupDelayMs);
    },
    stop: () => {
      if (startupHandle) {
        startupHandle();
        startupHandle = null;
      }
      stopFastRetry();
      if (monitorHandle) {
        monitorHandle();
        monitorHandle = null;
      }
      restore();
      log?.("debug", "模型响应拦截 runtime 已停止");
    },
    attach,
    isActive,
  };
}
