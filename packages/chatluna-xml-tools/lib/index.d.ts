/**
 * 自闭合 XML 标签解析
 * 提供标签属性提取能力
 */
declare function parseSelfClosingXmlTags(text: string, tagName: string): Array<Record<string, string>>;

/**
 * assistant 消息文本提取
 * 统一处理 content/text/children/attrs 结构
 */
interface AssistantMessageLike {
    _getType?: () => unknown;
    type?: unknown;
    role?: unknown;
    content?: unknown;
    text?: unknown;
}
declare function getMessageType(message: AssistantMessageLike | null | undefined): string;
declare function isAssistantMessage(message: AssistantMessageLike | null | undefined): boolean;
declare function extractTextContent(value: unknown): string;
declare function extractAssistantText(message: AssistantMessageLike | null | undefined): string;

/**
 * runtime 类型定义
 * 统一约束 getTemp 与 completionMessages 结构
 */

interface CompletionMessagesLike extends Array<unknown> {
    push: (...items: unknown[]) => number;
}
interface TempLike {
    completionMessages?: CompletionMessagesLike;
}
interface CharacterServiceLike<TTemp extends TempLike = TempLike> {
    getTemp?: (...args: unknown[]) => Promise<TTemp | undefined> | TTemp | undefined;
}
interface Dispatcher<TMessage extends AssistantMessageLike = AssistantMessageLike> {
    messages: CompletionMessagesLike;
    originalPush: CompletionMessagesLike["push"];
    patchedPush: CompletionMessagesLike["push"];
    listeners: Set<(message: TMessage) => void>;
    processedMessages: WeakSet<object>;
}

/**
 * getTemp 监听注册
 * 统一处理 patch、监听器复用与恢复
 */

interface RegisterGetTempListenerOptions<TSession = unknown> {
    symbolNamespace?: string;
    resolveSession?: (args: unknown[]) => TSession | null;
}
declare function registerGetTempListener<TTemp extends TempLike = TempLike, TSession = unknown>(service: CharacterServiceLike<TTemp>, listener: (temp: TTemp, session: TSession | null) => void, options?: RegisterGetTempListenerOptions<TSession>): (() => void) | null;

/**
 * completionMessages 监听注册
 * 统一处理 assistant 消息分发、去重与恢复
 */

interface SubscribeAssistantResponsesOptions<TMessage extends AssistantMessageLike = AssistantMessageLike, TSession = unknown> {
    onResponse: (context: {
        response: string;
        message: TMessage;
        session: TSession | null;
    }) => void;
    getSession?: () => TSession | null;
    onListenerError?: (error: unknown) => void;
    symbolNamespace?: string;
}
declare function subscribeAssistantResponses<TMessage extends AssistantMessageLike = AssistantMessageLike, TSession = unknown>(messages: CompletionMessagesLike, options: SubscribeAssistantResponsesOptions<TMessage, TSession>): () => void;

/**
 * 通用 temp runtime 编排
 * 统一 getTemp 接管、消息分发与生命周期管理
 */

interface CharacterTempRuntime {
    start: () => boolean;
    stop: () => void;
    isActive: () => boolean;
}
interface CreateCharacterTempRuntimeOptions<TTemp extends TempLike = TempLike, TSession = unknown, TMessage extends AssistantMessageLike = AssistantMessageLike> {
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
    onBound?: (context: {
        service: CharacterServiceLike<TTemp>;
    }) => void;
    onStarted?: (context: {
        changed: boolean;
    }) => void;
    onResponseError?: (error: unknown) => void;
    onListenerError?: (error: unknown) => void;
}
declare function createCharacterTempRuntime<TTemp extends TempLike = TempLike, TSession = unknown, TMessage extends AssistantMessageLike = AssistantMessageLike>(options: CreateCharacterTempRuntimeOptions<TTemp, TSession, TMessage>): CharacterTempRuntime;

export { type AssistantMessageLike, type CharacterServiceLike, type CharacterTempRuntime, type CompletionMessagesLike, type CreateCharacterTempRuntimeOptions, type Dispatcher, type RegisterGetTempListenerOptions, type SubscribeAssistantResponsesOptions, type TempLike, createCharacterTempRuntime, extractAssistantText, extractTextContent, getMessageType, isAssistantMessage, parseSelfClosingXmlTags, registerGetTempListener, subscribeAssistantResponses };
