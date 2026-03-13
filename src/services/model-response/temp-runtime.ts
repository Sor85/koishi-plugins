/**
 * 基于 temp 的模型响应适配层
 * 通过接管 getTemp 与 completionMessages.push 稳定监听 AI 回复写入
 */

import type { LogFn } from "../../types";

interface SessionLike {
  userId?: string;
  selfId?: string;
  platform?: string;
  guildId?: string;
  username?: string;
  bot?: unknown;
}

interface MessageLike {
  _getType?: () => string;
  type?: string;
  role?: string;
  content?: unknown;
  text?: string;
}

interface CompletionMessagesArray extends Array<unknown> {
  push: (...items: unknown[]) => number;
}

interface GroupTempLike {
  completionMessages?: CompletionMessagesArray;
}

interface CharacterServiceLike {
  getTemp?: (...args: unknown[]) => Promise<GroupTempLike>;
}

interface Dispatcher {
  originalPush: CompletionMessagesArray["push"];
  patchedPush: CompletionMessagesArray["push"];
  listeners: Set<(message: MessageLike) => void>;
  processedMessages: WeakSet<object>;
}

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

const GET_TEMP_TAG = Symbol("chatlunaAffinityGetTempRuntime");
const GET_TEMP_ORIGINAL = Symbol("chatlunaAffinityOriginalGetTemp");
const GET_TEMP_LISTENERS = Symbol("chatlunaAffinityGetTempListeners");
const PUSH_DISPATCHER = Symbol("chatlunaAffinityPushDispatcher");

function getMessageType(message: MessageLike | null | undefined): string {
  if (!message) return "";
  if (typeof message._getType === "function") {
    return String(message._getType() || "")
      .trim()
      .toLowerCase();
  }
  return String(message.type || message.role || "")
    .trim()
    .toLowerCase();
}

function isAiMessage(message: MessageLike | null | undefined): boolean {
  const type = getMessageType(message);
  return type === "ai" || type === "assistant";
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((item) => extractText(item)).join("");
  }
  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (record.content !== undefined && record.content !== value) {
    return extractText(record.content);
  }
  if (Array.isArray(record.children)) {
    return extractText(record.children);
  }
  if (typeof record.attrs === "object" && record.attrs) {
    const attrs = record.attrs as Record<string, unknown>;
    if (typeof attrs.content === "string") return attrs.content;
    if (typeof attrs.text === "string") return attrs.text;
  }
  return "";
}

function getResponseText(message: MessageLike | null | undefined): string {
  if (!isAiMessage(message)) return "";
  return extractText(message?.content ?? message?.text).trim();
}

function getDispatcher(messages: CompletionMessagesArray): Dispatcher | null {
  return ((messages as unknown as Record<symbol, unknown>)[PUSH_DISPATCHER] ??
    null) as Dispatcher | null;
}

function setDispatcher(
  messages: CompletionMessagesArray,
  dispatcher: Dispatcher | null,
): void {
  const record = messages as unknown as Record<symbol, unknown>;
  if (!dispatcher) {
    delete record[PUSH_DISPATCHER];
    return;
  }
  Object.defineProperty(record, PUSH_DISPATCHER, {
    value: dispatcher,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

function attachDispatcher(
  messages: CompletionMessagesArray,
  log?: LogFn,
): Dispatcher {
  const existing = getDispatcher(messages);
  if (existing) return existing;

  const listeners = new Set<(message: MessageLike) => void>();
  const processedMessages = new WeakSet<object>();
  const originalPush = messages.push;

  const patchedPush: CompletionMessagesArray["push"] = function patchedPush(
    this: CompletionMessagesArray,
    ...items: unknown[]
  ): number {
    const result = originalPush.apply(this, items);

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const message = item as MessageLike;
      if (!isAiMessage(message)) continue;
      if (processedMessages.has(item)) continue;
      processedMessages.add(item);
      for (const listener of Array.from(listeners)) {
        try {
          listener(message);
        } catch (error) {
          log?.("warn", "处理 completionMessages 消息监听器失败", error);
        }
      }
    }

    return result;
  };

  const dispatcher: Dispatcher = {
    originalPush,
    patchedPush,
    listeners,
    processedMessages,
  };
  messages.push = patchedPush;
  setDispatcher(messages, dispatcher);
  return dispatcher;
}

function restoreDispatcher(messages: CompletionMessagesArray): void {
  const dispatcher = getDispatcher(messages);
  if (!dispatcher) return;
  if (messages.push === dispatcher.patchedPush) {
    messages.push = dispatcher.originalPush;
  }
  setDispatcher(messages, null);
}

function registerGetTempListener(
  service: CharacterServiceLike,
  listener: (temp: GroupTempLike, session: SessionLike | null) => void,
): (() => void) | null {
  const getTemp = service.getTemp;
  if (typeof getTemp !== "function") return null;

  const serviceRecord = service as unknown as Record<symbol, unknown>;
  let listeners = serviceRecord[GET_TEMP_LISTENERS] as
    | Set<(temp: GroupTempLike, session: SessionLike | null) => void>
    | undefined;

  if (!listeners) {
    listeners = new Set<
      (temp: GroupTempLike, session: SessionLike | null) => void
    >();
    serviceRecord[GET_TEMP_LISTENERS] = listeners;
  }

  if (!(serviceRecord[GET_TEMP_TAG] as boolean)) {
    Object.defineProperty(serviceRecord, GET_TEMP_ORIGINAL, {
      value: getTemp,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    service.getTemp = async (...args: unknown[]) => {
      const originalGetTemp = serviceRecord[
        GET_TEMP_ORIGINAL
      ] as CharacterServiceLike["getTemp"];
      const temp = (await originalGetTemp?.apply(
        service,
        args,
      )) as GroupTempLike;
      const activeListeners = serviceRecord[GET_TEMP_LISTENERS] as
        | Set<(temp: GroupTempLike, session: SessionLike | null) => void>
        | undefined;
      const session =
        args[0] && typeof args[0] === "object"
          ? (args[0] as SessionLike)
          : null;
      if (temp && activeListeners?.size) {
        for (const handler of Array.from(activeListeners)) {
          handler(temp, session);
        }
      }
      return temp;
    };
    serviceRecord[GET_TEMP_TAG] = true;
  }

  listeners.add(listener);
  return () => {
    const currentListeners = serviceRecord[GET_TEMP_LISTENERS] as
      | Set<(temp: GroupTempLike, session: SessionLike | null) => void>
      | undefined;
    currentListeners?.delete(listener);
    if (currentListeners?.size) return;
    const originalGetTemp = serviceRecord[
      GET_TEMP_ORIGINAL
    ] as CharacterServiceLike["getTemp"];
    if (typeof originalGetTemp === "function" && service.getTemp) {
      service.getTemp = originalGetTemp;
    }
    delete serviceRecord[GET_TEMP_TAG];
    delete serviceRecord[GET_TEMP_ORIGINAL];
    delete serviceRecord[GET_TEMP_LISTENERS];
  };
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
  const messageSubscriptions = new WeakMap<
    CompletionMessagesArray,
    () => void
  >();
  const sessionByMessages = new WeakMap<CompletionMessagesArray, SessionLike>();
  const trackedArrays = new Set<CompletionMessagesArray>();
  let restoreGetTemp: (() => void) | null = null;
  let activeService: CharacterServiceLike | null = null;
  let active = false;

  const ensureTempPatched = (
    temp: GroupTempLike,
    session: SessionLike | null,
  ): void => {
    const messages = temp?.completionMessages;
    if (!Array.isArray(messages) || typeof messages.push !== "function") return;
    if (session) {
      sessionByMessages.set(messages, session);
    }
    if (messageSubscriptions.has(messages)) return;

    const dispatcher = attachDispatcher(messages, log);
    const listener = (message: MessageLike) => {
      const response = getResponseText(message);
      if (!response) return;
      const boundSession = sessionByMessages.get(messages) ?? null;
      void processModelResponse({ response, session: boundSession }).catch(
        (error) => {
          log?.("warn", "处理 completionMessages 模型响应失败", error);
        },
      );
    };

    dispatcher.listeners.add(listener);
    trackedArrays.add(messages);
    messageSubscriptions.set(messages, () => {
      dispatcher.listeners.delete(listener);
      if (dispatcher.listeners.size > 0) return;
      restoreDispatcher(messages);
      trackedArrays.delete(messages);
    });
  };

  const bindCurrentService = (): {
    bound: boolean;
    changed: boolean;
    missing: boolean;
  } => {
    const service = getCharacterService();
    if (!service || typeof service.getTemp !== "function") {
      if (restoreGetTemp) {
        restoreGetTemp();
        restoreGetTemp = null;
      }
      activeService = null;
      active = false;
      return { bound: false, changed: false, missing: true };
    }

    if (restoreGetTemp && activeService === service) {
      active = true;
      return { bound: true, changed: false, missing: false };
    }

    restoreGetTemp?.();
    restoreGetTemp = registerGetTempListener(service, ensureTempPatched);
    activeService = restoreGetTemp ? service : null;
    active = Boolean(restoreGetTemp);
    return {
      bound: active,
      changed: true,
      missing: false,
    };
  };

  return {
    start: () => {
      const { bound, changed, missing } = bindCurrentService();
      if (!bound) {
        if (missing) {
          log?.(
            "warn",
            "chatluna_character.getTemp 不可用，跳过 temp 模型响应适配",
          );
        }
        return false;
      }

      if (changed && logActivation) {
        log?.("info", "已启用基于 getTemp 的模型响应适配");
      }
      return true;
    },
    stop: () => {
      restoreGetTemp?.();
      restoreGetTemp = null;
      activeService = null;
      for (const messages of Array.from(trackedArrays)) {
        messageSubscriptions.get(messages)?.();
        messageSubscriptions.delete(messages);
      }
      trackedArrays.clear();
      active = false;
    },
    isActive: () => active,
  };
}
