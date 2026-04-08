/**
 * 基于 temp 的模型响应适配层
 * 通过共享 runtime 框架监听 AI 回复写入
 */

import {
  createCharacterTempRuntime,
  type CompletionMessagesLike,
  type TempLike,
  type CharacterServiceLike as SharedCharacterServiceLike,
} from "shared-chatluna-xmltools";
import type { LogFn } from "../../types";

interface SessionLike {
  userId?: string;
  selfId?: string;
  platform?: string;
  guildId?: string;
  username?: string;
  bot?: unknown;
}

interface GroupTempLike extends TempLike {
  completionMessages?: CompletionMessagesLike;
}

interface CharacterServiceLike extends SharedCharacterServiceLike<GroupTempLike> {}

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

export interface ModelResponseContext {
  response: string;
  session: SessionLike | null;
}

export interface CharacterTempModelResponseRuntime {
  start: () => boolean;
  stop: () => void;
  isActive: () => boolean;
}

export interface CharacterTempModelResponseRuntimeParams {
  getCharacterService: () => CharacterServiceLike | null | undefined;
  processModelResponse: (context: ModelResponseContext) => Promise<void>;
  log?: LogFn;
  logActivation?: boolean;
}

function getObjectId(value: object): number {
  const existing = objectIds.get(value);
  if (existing) return existing;
  const id = nextObjectId;
  nextObjectId += 1;
  objectIds.set(value, id);
  return id;
}

function logDiagnostic(
  enabled: boolean,
  log: LogFn | undefined,
  message: string,
  detail: Record<string, unknown>,
): void {
  if (!enabled) return;
  log?.("info", message, detail);
}

function getListenerSet(
  service: CharacterServiceLike,
): Set<(temp: GroupTempLike, session: SessionLike | null) => void> {
  const record = service as unknown as Record<symbol, unknown>;
  return (
    (record[
      Symbol.for("chatlunaXmlToolsGetTempListeners:chatluna-affinity")
    ] as Set<(temp: GroupTempLike, session: SessionLike | null) => void>) ||
    new Set<(temp: GroupTempLike, session: SessionLike | null) => void>()
  );
}

export function createCharacterTempModelResponseRuntime(
  params: CharacterTempModelResponseRuntimeParams,
): CharacterTempModelResponseRuntime {
  const {
    getCharacterService,
    processModelResponse,
    log,
    logActivation = false,
  } = params;

  return createCharacterTempRuntime<GroupTempLike, SessionLike>({
    getCharacterService,
    symbolNamespace: "chatluna-affinity",
    resolveSession: (args) =>
      args[0] && typeof args[0] === "object"
        ? (args[0] as SessionLike)
        : null,
    onServiceMissing: () => {
      log?.("warn", "chatluna_character.getTemp 不可用，跳过 temp 模型响应适配");
    },
    onServiceChanged: ({ changed, previousService, nextService }) => {
      if (!changed) {
        logDiagnostic(
          logActivation,
          log,
          "模型响应 runtime 检测到当前 service 未变化",
          {
            serviceId: getObjectId(nextService as object),
            changed: false,
          },
        );
        return;
      }

      logDiagnostic(logActivation, log, "模型响应 runtime 检测到 service 变化", {
        previousServiceId: previousService
          ? getObjectId(previousService as object)
          : null,
        nextServiceId: getObjectId(nextService as object),
        changed: true,
      });

      const listenerSetAfter = getListenerSet(nextService);
      logDiagnostic(logActivation, log, "模型响应 runtime 已接管 getTemp", {
        serviceId: getObjectId(nextService as object),
        listenerCount: listenerSetAfter.size,
        originalEqualsCurrentBeforePatch: false,
        originalEqualsPatchedAfterPatch: false,
        repeatedPatch: listenerSetAfter.size > 1,
      });
      logDiagnostic(logActivation, log, "模型响应 runtime 已注册 getTemp 监听器", {
        serviceId: getObjectId(nextService as object),
        listenerCount: listenerSetAfter.size,
        getTempPatched: true,
      });
    },
    onStarted: ({ changed }) => {
      if (changed && logActivation) {
        log?.("info", "已启用基于 getTemp 的模型响应适配");
      }
    },
    onListenerError: (error) => {
      log?.("warn", "处理 completionMessages 消息监听器失败", error);
    },
    onResponseError: (error) => {
      log?.("warn", "处理 completionMessages 模型响应失败", error);
    },
    onResponse: async ({ response, session }) => {
      await processModelResponse({ response, session });
    },
  });
}
