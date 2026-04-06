/**
 * completionMessages 监听注册
 * 统一处理 assistant 消息分发、去重与恢复
 */

import {
  extractAssistantText,
  type AssistantMessageLike,
} from "../message/assistant-text";
import type { CompletionMessagesLike, Dispatcher } from "./types";

const PUSH_DISPATCHER_PREFIX = "chatlunaXmlToolsPushDispatcher";

function resolvePushDispatcherKey(namespace?: string): symbol {
  const target = namespace?.trim() || "default";
  return Symbol.for(`${PUSH_DISPATCHER_PREFIX}:${target}`);
}

function getDispatcher<TMessage extends AssistantMessageLike>(
  messages: CompletionMessagesLike,
  key: symbol,
): Dispatcher<TMessage> | null {
  return ((messages as unknown as Record<symbol, unknown>)[key] ??
    null) as Dispatcher<TMessage> | null;
}

function setDispatcher<TMessage extends AssistantMessageLike>(
  messages: CompletionMessagesLike,
  key: symbol,
  dispatcher: Dispatcher<TMessage> | null,
): void {
  const record = messages as unknown as Record<symbol, unknown>;
  if (!dispatcher) {
    delete record[key];
    return;
  }
  Object.defineProperty(record, key, {
    value: dispatcher,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

function restoreDispatcher<TMessage extends AssistantMessageLike>(
  key: symbol,
  dispatcher: Dispatcher<TMessage>,
): void {
  if (dispatcher.messages.push === dispatcher.patchedPush) {
    dispatcher.messages.push = dispatcher.originalPush;
  }
  setDispatcher(dispatcher.messages, key, null);
}

export interface SubscribeAssistantResponsesOptions<
  TMessage extends AssistantMessageLike = AssistantMessageLike,
  TSession = unknown,
> {
  onResponse: (context: {
    response: string;
    message: TMessage;
    session: TSession | null;
  }) => void;
  getSession?: () => TSession | null;
  onListenerError?: (error: unknown) => void;
  symbolNamespace?: string;
}

export function subscribeAssistantResponses<
  TMessage extends AssistantMessageLike = AssistantMessageLike,
  TSession = unknown,
>(
  messages: CompletionMessagesLike,
  options: SubscribeAssistantResponsesOptions<TMessage, TSession>,
): () => void {
  const key = resolvePushDispatcherKey(options.symbolNamespace);
  let dispatcher = getDispatcher<TMessage>(messages, key);

  if (!dispatcher) {
    const listeners = new Set<(message: TMessage) => void>();
    const processedMessages = new WeakSet<object>();
    const originalPush = messages.push;

    const patchedPush: CompletionMessagesLike["push"] = function patchedPush(
      this: CompletionMessagesLike,
      ...items: unknown[]
    ): number {
      const result = originalPush.apply(this, items);

      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        if (processedMessages.has(item)) continue;
        processedMessages.add(item);

        const message = item as TMessage;
        const response = extractAssistantText(message);
        if (!response) continue;

        for (const listener of Array.from(listeners)) {
          try {
            listener(message);
          } catch (error) {
            options.onListenerError?.(error);
          }
        }
      }

      return result;
    };

    dispatcher = {
      messages,
      originalPush,
      patchedPush,
      listeners,
      processedMessages,
    };
    messages.push = patchedPush;
    setDispatcher(messages, key, dispatcher);
  }

  const listener = (message: TMessage): void => {
    const response = extractAssistantText(message);
    if (!response) return;
    options.onResponse({
      response,
      message,
      session: options.getSession?.() ?? null,
    });
  };

  dispatcher.listeners.add(listener);

  return () => {
    const current = getDispatcher<TMessage>(messages, key);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    restoreDispatcher(key, current);
  };
}
