/**
 * 通用 temp runtime 编排
 * 统一 getTemp 接管、消息分发与生命周期管理
 */

import {
  type AssistantMessageLike,
  extractAssistantText,
} from "../message/assistant-text";
import {
  registerGetTempListener,
  type RegisterGetTempListenerOptions,
} from "./get-temp-listener";
import { subscribeAssistantResponses } from "./completion-messages-listener";
import type {
  CharacterServiceLike,
  CompletionMessagesLike,
  TempLike,
} from "./types";

export interface CharacterTempRuntime {
  start: () => boolean;
  stop: () => void;
  isActive: () => boolean;
}

export interface CreateCharacterTempRuntimeOptions<
  TTemp extends TempLike = TempLike,
  TSession = unknown,
  TMessage extends AssistantMessageLike = AssistantMessageLike,
> {
  getCharacterService: () => CharacterServiceLike<TTemp> | null | undefined;
  symbolNamespace: string;
  onResponse: (context: {
    response: string;
    message: TMessage;
    session: TSession | null;
  }) => void | Promise<void>;
  getMessages?: (temp: TTemp) => CompletionMessagesLike | null | undefined;
  resolveSession?: RegisterGetTempListenerOptions<TSession>["resolveSession"];
  onServiceMissing?: () => void;
  onServiceChanged?: (context: {
    changed: boolean;
    previousService: CharacterServiceLike<TTemp> | null;
    nextService: CharacterServiceLike<TTemp>;
  }) => void;
  onBound?: (context: { service: CharacterServiceLike<TTemp> }) => void;
  onStarted?: (context: { changed: boolean }) => void;
  onResponseError?: (error: unknown) => void;
  onListenerError?: (error: unknown) => void;
}

export function createCharacterTempRuntime<
  TTemp extends TempLike = TempLike,
  TSession = unknown,
  TMessage extends AssistantMessageLike = AssistantMessageLike,
>(
  options: CreateCharacterTempRuntimeOptions<TTemp, TSession, TMessage>,
): CharacterTempRuntime {
  const {
    getCharacterService,
    symbolNamespace,
    onResponse,
    getMessages = (temp) => temp?.completionMessages,
    resolveSession,
    onServiceMissing,
    onServiceChanged,
    onBound,
    onStarted,
    onResponseError,
    onListenerError,
  } = options;

  const messageSubscriptions = new WeakMap<CompletionMessagesLike, () => void>();
  const sessionByMessages = new WeakMap<CompletionMessagesLike, TSession | null>();
  const trackedMessages = new Set<CompletionMessagesLike>();

  let detachGetTempListener: (() => void) | null = null;
  let activeService: CharacterServiceLike<TTemp> | null = null;
  let active = false;

  const cleanupMessageSubscriptions = (): void => {
    for (const messages of Array.from(trackedMessages)) {
      messageSubscriptions.get(messages)?.();
      messageSubscriptions.delete(messages);
      sessionByMessages.delete(messages);
      trackedMessages.delete(messages);
    }
  };

  const cleanupServiceBinding = (): void => {
    detachGetTempListener?.();
    detachGetTempListener = null;
    activeService = null;
    active = false;
  };

  const handleTemp = (temp: TTemp, session: TSession | null): void => {
    const messages = getMessages(temp);
    if (!Array.isArray(messages) || typeof messages.push !== "function") return;

    sessionByMessages.set(messages, session);
    if (messageSubscriptions.has(messages)) return;

    const unsubscribe = subscribeAssistantResponses<TMessage, TSession>(messages, {
      symbolNamespace,
      getSession: () => sessionByMessages.get(messages) ?? null,
      onListenerError,
      onResponse: ({ response, message, session: boundSession }) => {
        const text = response || extractAssistantText(message);
        if (!text) return;
        void Promise.resolve(
          onResponse({
            response: text,
            message,
            session: boundSession,
          }),
        ).catch((error) => {
          onResponseError?.(error);
        });
      },
    });

    trackedMessages.add(messages);
    messageSubscriptions.set(messages, () => {
      unsubscribe();
      trackedMessages.delete(messages);
      sessionByMessages.delete(messages);
    });
  };

  const bindCurrentService = (): {
    bound: boolean;
    changed: boolean;
    missing: boolean;
  } => {
    const service = getCharacterService();
    if (!service || typeof service.getTemp !== "function") {
      cleanupServiceBinding();
      cleanupMessageSubscriptions();
      onServiceMissing?.();
      return { bound: false, changed: false, missing: true };
    }

    if (detachGetTempListener && activeService === service) {
      active = true;
      onServiceChanged?.({
        changed: false,
        previousService: activeService,
        nextService: service,
      });
      return { bound: true, changed: false, missing: false };
    }

    const previousService = activeService;
    cleanupServiceBinding();
    cleanupMessageSubscriptions();

    const detach = registerGetTempListener<TTemp, TSession>(service, handleTemp, {
      symbolNamespace,
      resolveSession,
    });

    if (!detach) {
      onServiceMissing?.();
      return { bound: false, changed: false, missing: true };
    }

    detachGetTempListener = detach;
    activeService = service;
    active = true;

    onServiceChanged?.({
      changed: previousService !== service,
      previousService,
      nextService: service,
    });
    onBound?.({ service });

    return {
      bound: true,
      changed: previousService !== service,
      missing: false,
    };
  };

  return {
    start: () => {
      const { bound, changed, missing } = bindCurrentService();
      if (!bound) {
        if (!missing) {
          onServiceMissing?.();
        }
        return false;
      }
      onStarted?.({ changed });
      return true;
    },
    stop: () => {
      cleanupServiceBinding();
      cleanupMessageSubscriptions();
    },
    isActive: () => active,
  };
}
