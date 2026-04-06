"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createCharacterTempRuntime: () => createCharacterTempRuntime,
  extractAssistantText: () => extractAssistantText,
  extractTextContent: () => extractTextContent,
  getMessageType: () => getMessageType,
  isAssistantMessage: () => isAssistantMessage,
  parseSelfClosingXmlTags: () => parseSelfClosingXmlTags,
  registerGetTempListener: () => registerGetTempListener,
  subscribeAssistantResponses: () => subscribeAssistantResponses
});
module.exports = __toCommonJS(index_exports);

// src/xml/parse-self-closing-xml-tags.ts
function parseSelfClosingXmlTags(text, tagName) {
  const tags = Array.from(
    text.matchAll(new RegExp(`<${tagName}\\b([^>]*)\\/>`, "gi"))
  );
  if (!tags.length) return [];
  return tags.map((tag) => {
    const attrText = String(tag[1] || "");
    const attrs = {};
    for (const pair of attrText.matchAll(/([a-zA-Z_][\w-]*)="([^"]*)"/g)) {
      attrs[pair[1]] = pair[2];
    }
    return attrs;
  });
}

// src/message/assistant-text.ts
function getMessageType(message) {
  if (!message) return "";
  if (typeof message._getType === "function") {
    return String(message._getType() || "").trim().toLowerCase();
  }
  return String(message.type || message.role || "").trim().toLowerCase();
}
function isAssistantMessage(message) {
  const type = getMessageType(message);
  return type === "assistant" || type === "ai";
}
function extractTextContent(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((item) => extractTextContent(item)).join("");
  }
  if (typeof value !== "object") return "";
  const record = value;
  if (typeof record.text === "string") return record.text;
  if (record.content !== void 0 && record.content !== value) {
    return extractTextContent(record.content);
  }
  if (Array.isArray(record.children)) {
    return extractTextContent(record.children);
  }
  if (typeof record.attrs === "object" && record.attrs) {
    const attrs = record.attrs;
    if (typeof attrs.content === "string") return attrs.content;
    if (typeof attrs.text === "string") return attrs.text;
  }
  return "";
}
function extractAssistantText(message) {
  if (!isAssistantMessage(message)) return "";
  return extractTextContent(message?.content ?? message?.text).trim();
}

// src/runtime/get-temp-listener.ts
var GET_TEMP_TAG_PREFIX = "chatlunaXmlToolsGetTempTag";
var GET_TEMP_ORIGINAL_PREFIX = "chatlunaXmlToolsGetTempOriginal";
var GET_TEMP_LISTENERS_PREFIX = "chatlunaXmlToolsGetTempListeners";
function resolveSymbolNamespace(namespace) {
  return namespace?.trim() || "default";
}
function resolveGetTempTag(namespace) {
  return /* @__PURE__ */ Symbol.for(`${GET_TEMP_TAG_PREFIX}:${resolveSymbolNamespace(namespace)}`);
}
function resolveGetTempOriginal(namespace) {
  return /* @__PURE__ */ Symbol.for(
    `${GET_TEMP_ORIGINAL_PREFIX}:${resolveSymbolNamespace(namespace)}`
  );
}
function resolveGetTempListeners(namespace) {
  return /* @__PURE__ */ Symbol.for(
    `${GET_TEMP_LISTENERS_PREFIX}:${resolveSymbolNamespace(namespace)}`
  );
}
function registerGetTempListener(service, listener, options = {}) {
  const getTemp = service.getTemp;
  if (typeof getTemp !== "function") return null;
  const tagKey = resolveGetTempTag(options.symbolNamespace);
  const originalKey = resolveGetTempOriginal(options.symbolNamespace);
  const listenersKey = resolveGetTempListeners(options.symbolNamespace);
  const serviceRecord = service;
  let listeners = serviceRecord[listenersKey];
  if (!listeners) {
    listeners = /* @__PURE__ */ new Set();
    serviceRecord[listenersKey] = listeners;
  }
  if (!serviceRecord[tagKey]) {
    Object.defineProperty(serviceRecord, originalKey, {
      value: getTemp,
      configurable: true,
      enumerable: false,
      writable: true
    });
    service.getTemp = async (...args) => {
      const originalGetTemp = serviceRecord[originalKey];
      const temp = await originalGetTemp?.apply(service, args);
      const activeListeners = serviceRecord[listenersKey];
      const session = options.resolveSession ? options.resolveSession(args) : args[0] && typeof args[0] === "object" ? args[0] : null;
      if (temp && activeListeners?.size) {
        for (const handler of Array.from(activeListeners)) {
          handler(temp, session);
        }
      }
      return temp;
    };
    serviceRecord[tagKey] = true;
  }
  listeners.add(listener);
  return () => {
    const currentListeners = serviceRecord[listenersKey];
    currentListeners?.delete(listener);
    if (currentListeners?.size) return;
    const originalGetTemp = serviceRecord[originalKey];
    if (originalGetTemp && service.getTemp !== originalGetTemp) {
      service.getTemp = originalGetTemp;
    }
    delete serviceRecord[originalKey];
    delete serviceRecord[tagKey];
    delete serviceRecord[listenersKey];
  };
}

// src/runtime/completion-messages-listener.ts
var PUSH_DISPATCHER_PREFIX = "chatlunaXmlToolsPushDispatcher";
function resolvePushDispatcherKey(namespace) {
  const target = namespace?.trim() || "default";
  return /* @__PURE__ */ Symbol.for(`${PUSH_DISPATCHER_PREFIX}:${target}`);
}
function getDispatcher(messages, key) {
  return messages[key] ?? null;
}
function setDispatcher(messages, key, dispatcher) {
  const record = messages;
  if (!dispatcher) {
    delete record[key];
    return;
  }
  Object.defineProperty(record, key, {
    value: dispatcher,
    configurable: true,
    enumerable: false,
    writable: true
  });
}
function restoreDispatcher(key, dispatcher) {
  if (dispatcher.messages.push === dispatcher.patchedPush) {
    dispatcher.messages.push = dispatcher.originalPush;
  }
  setDispatcher(dispatcher.messages, key, null);
}
function subscribeAssistantResponses(messages, options) {
  const key = resolvePushDispatcherKey(options.symbolNamespace);
  let dispatcher = getDispatcher(messages, key);
  if (!dispatcher) {
    const listeners = /* @__PURE__ */ new Set();
    const processedMessages = /* @__PURE__ */ new WeakSet();
    const originalPush = messages.push;
    const patchedPush = function patchedPush2(...items) {
      const result = originalPush.apply(this, items);
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        if (processedMessages.has(item)) continue;
        processedMessages.add(item);
        const message = item;
        const response = extractAssistantText(message);
        if (!response) continue;
        for (const listener2 of Array.from(listeners)) {
          try {
            listener2(message);
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
      processedMessages
    };
    messages.push = patchedPush;
    setDispatcher(messages, key, dispatcher);
  }
  const listener = (message) => {
    const response = extractAssistantText(message);
    if (!response) return;
    options.onResponse({
      response,
      message,
      session: options.getSession?.() ?? null
    });
  };
  dispatcher.listeners.add(listener);
  return () => {
    const current = getDispatcher(messages, key);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    restoreDispatcher(key, current);
  };
}

// src/runtime/character-temp-runtime.ts
function createCharacterTempRuntime(options) {
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
    onListenerError
  } = options;
  const messageSubscriptions = /* @__PURE__ */ new WeakMap();
  const sessionByMessages = /* @__PURE__ */ new WeakMap();
  const trackedMessages = /* @__PURE__ */ new Set();
  let detachGetTempListener = null;
  let activeService = null;
  let active = false;
  const cleanupMessageSubscriptions = () => {
    for (const messages of Array.from(trackedMessages)) {
      messageSubscriptions.get(messages)?.();
      messageSubscriptions.delete(messages);
      sessionByMessages.delete(messages);
      trackedMessages.delete(messages);
    }
  };
  const cleanupServiceBinding = () => {
    detachGetTempListener?.();
    detachGetTempListener = null;
    activeService = null;
    active = false;
  };
  const handleTemp = (temp, session) => {
    const messages = getMessages(temp);
    if (!Array.isArray(messages) || typeof messages.push !== "function") return;
    sessionByMessages.set(messages, session);
    if (messageSubscriptions.has(messages)) return;
    const unsubscribe = subscribeAssistantResponses(messages, {
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
            session: boundSession
          })
        ).catch((error) => {
          onResponseError?.(error);
        });
      }
    });
    trackedMessages.add(messages);
    messageSubscriptions.set(messages, () => {
      unsubscribe();
      trackedMessages.delete(messages);
      sessionByMessages.delete(messages);
    });
  };
  const bindCurrentService = () => {
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
        nextService: service
      });
      return { bound: true, changed: false, missing: false };
    }
    const previousService = activeService;
    cleanupServiceBinding();
    cleanupMessageSubscriptions();
    const detach = registerGetTempListener(service, handleTemp, {
      symbolNamespace,
      resolveSession
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
      nextService: service
    });
    onBound?.({ service });
    return {
      bound: true,
      changed: previousService !== service,
      missing: false
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
    isActive: () => active
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createCharacterTempRuntime,
  extractAssistantText,
  extractTextContent,
  getMessageType,
  isAssistantMessage,
  parseSelfClosingXmlTags,
  registerGetTempListener,
  subscribeAssistantResponses
});
