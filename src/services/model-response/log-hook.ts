/**
 * 模型响应日志拦截
 * 提供 legacy logger hook 与响应文本提取能力
 */

import type { LogFn } from "../../types";

interface LoggerLike {
  debug?: (...args: unknown[]) => void;
}

interface HookCharacterModelResponseLoggerParams {
  logger: LoggerLike | null | undefined;
  processModelResponse: (response: string) => Promise<void>;
  log?: LogFn;
  tag?: string;
}

const MODEL_RESPONSE_PREFIX = "model response:";
const HOOK_TAG = "__chatlunaAffinityModelResponseInterceptor";
const ORIGINAL_DEBUG_TAG = "__chatlunaAffinityOriginalDebug";

function stringifyLogPart(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
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

  logger.debug = patchedDebug;

  return () => {
    if (logger.debug === patchedDebug) {
      logger.debug = originalDebug;
      return;
    }

    const currentDebug = logger.debug as unknown as Record<string, unknown>;
    if (currentDebug?.[tag]) {
      currentDebug[ORIGINAL_DEBUG_TAG] = originalDebug;
    }
  };
}
