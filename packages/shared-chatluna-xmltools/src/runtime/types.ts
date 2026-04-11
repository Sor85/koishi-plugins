/**
 * runtime 类型定义
 * 统一约束 getTemp 与 completionMessages 结构
 */

import type { AssistantMessageLike } from "../message/assistant-text";

export interface CompletionMessagesLike extends Array<unknown> {
  push: (...items: unknown[]) => number;
}

export interface TempLike {
  completionMessages?: CompletionMessagesLike;
}

export interface CharacterServiceLike<TTemp extends TempLike = TempLike> {
  getTemp?: (...args: unknown[]) => Promise<TTemp | undefined> | TTemp | undefined;
}

export interface Dispatcher<TMessage extends AssistantMessageLike = AssistantMessageLike> {
  messages: CompletionMessagesLike;
  originalPush: CompletionMessagesLike["push"];
  patchedPush: CompletionMessagesLike["push"];
  listeners: Set<(message: TMessage) => void>;
  processedMessages: WeakMap<object, string>;
}
