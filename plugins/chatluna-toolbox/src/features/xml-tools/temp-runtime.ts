/**
 * XML temp-runtime
 * 通过共享 runtime 框架监听模型回复
 */

import type { Session } from "koishi";
import {
  createCharacterTempRuntime,
  type CompletionMessagesLike,
  type TempLike,
  type CharacterServiceLike as SharedCharacterServiceLike,
} from "chatluna-xml-tools";
import type { LogFn } from "../../types";

type CompletionMessagesArray = CompletionMessagesLike;

interface GroupTempLike extends TempLike {
  completionMessages?: CompletionMessagesArray;
}

interface CharacterServiceLike extends SharedCharacterServiceLike<GroupTempLike> {
  getTemp?: (...args: unknown[]) => Promise<GroupTempLike>;
}

export interface XmlRuntimeContext {
  response: string;
  session: Session | null;
}

export interface CharacterTempXmlRuntime {
  start: () => boolean;
  stop: () => void;
  isActive: () => boolean;
}

export interface CharacterTempXmlRuntimeParams {
  getCharacterService: () => CharacterServiceLike | null | undefined;
  processModelResponse: (context: XmlRuntimeContext) => Promise<boolean>;
  log?: LogFn;
}

export function createCharacterTempXmlRuntime(
  params: CharacterTempXmlRuntimeParams,
): CharacterTempXmlRuntime {
  const { getCharacterService, processModelResponse, log } = params;

  return createCharacterTempRuntime<GroupTempLike, Session>({
    getCharacterService,
    symbolNamespace: "chatluna-toolbox",
    resolveSession: (args) =>
      args[0] && typeof args[0] === "object"
        ? (args[0] as Session)
        : null,
    onListenerError: (error) => {
      log?.("warn", "处理 XML completionMessages 监听器失败", error);
    },
    onResponseError: (error) => {
      log?.("warn", "处理 XML 模型响应失败", error);
    },
    onResponse: async ({ response, session }) => {
      await processModelResponse({ response, session });
    },
  });
}
