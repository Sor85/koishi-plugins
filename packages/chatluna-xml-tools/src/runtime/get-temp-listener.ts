/**
 * getTemp 监听注册
 * 统一处理 patch、监听器复用与恢复
 */

import type { CharacterServiceLike, TempLike } from "./types";

const GET_TEMP_TAG_PREFIX = "chatlunaXmlToolsGetTempTag";
const GET_TEMP_ORIGINAL_PREFIX = "chatlunaXmlToolsGetTempOriginal";
const GET_TEMP_LISTENERS_PREFIX = "chatlunaXmlToolsGetTempListeners";

function resolveSymbolNamespace(namespace?: string): string {
  return namespace?.trim() || "default";
}

function resolveGetTempTag(namespace?: string): symbol {
  return Symbol.for(`${GET_TEMP_TAG_PREFIX}:${resolveSymbolNamespace(namespace)}`);
}

function resolveGetTempOriginal(namespace?: string): symbol {
  return Symbol.for(
    `${GET_TEMP_ORIGINAL_PREFIX}:${resolveSymbolNamespace(namespace)}`,
  );
}

function resolveGetTempListeners(namespace?: string): symbol {
  return Symbol.for(
    `${GET_TEMP_LISTENERS_PREFIX}:${resolveSymbolNamespace(namespace)}`,
  );
}

export interface RegisterGetTempListenerOptions<TSession = unknown> {
  symbolNamespace?: string;
  resolveSession?: (args: unknown[]) => TSession | null;
}

export function registerGetTempListener<
  TTemp extends TempLike = TempLike,
  TSession = unknown,
>(
  service: CharacterServiceLike<TTemp>,
  listener: (temp: TTemp, session: TSession | null) => void,
  options: RegisterGetTempListenerOptions<TSession> = {},
): (() => void) | null {
  const getTemp = service.getTemp;
  if (typeof getTemp !== "function") return null;

  const tagKey = resolveGetTempTag(options.symbolNamespace);
  const originalKey = resolveGetTempOriginal(options.symbolNamespace);
  const listenersKey = resolveGetTempListeners(options.symbolNamespace);
  const serviceRecord = service as unknown as Record<symbol, unknown>;

  let listeners = serviceRecord[listenersKey] as
    | Set<(temp: TTemp, session: TSession | null) => void>
    | undefined;

  if (!listeners) {
    listeners = new Set<(temp: TTemp, session: TSession | null) => void>();
    serviceRecord[listenersKey] = listeners;
  }

  if (!(serviceRecord[tagKey] as boolean)) {
    Object.defineProperty(serviceRecord, originalKey, {
      value: getTemp,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    service.getTemp = async (...args: unknown[]) => {
      const originalGetTemp = serviceRecord[originalKey] as
        | CharacterServiceLike<TTemp>["getTemp"]
        | undefined;
      const temp = (await originalGetTemp?.apply(service, args)) as
        | TTemp
        | undefined;
      const activeListeners = serviceRecord[listenersKey] as
        | Set<(temp: TTemp, session: TSession | null) => void>
        | undefined;
      const session = options.resolveSession
        ? options.resolveSession(args)
        : ((args[0] && typeof args[0] === "object"
            ? (args[0] as TSession)
            : null) as TSession | null);

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
    const currentListeners = serviceRecord[listenersKey] as
      | Set<(temp: TTemp, session: TSession | null) => void>
      | undefined;
    currentListeners?.delete(listener);
    if (currentListeners?.size) return;

    const originalGetTemp = serviceRecord[originalKey] as
      | CharacterServiceLike<TTemp>["getTemp"]
      | undefined;
    if (originalGetTemp && service.getTemp !== originalGetTemp) {
      service.getTemp = originalGetTemp;
    }
    delete serviceRecord[originalKey];
    delete serviceRecord[tagKey];
    delete serviceRecord[listenersKey];
  };
}
