/**
 * XML 工具调用运行时
 * 负责 XML 输入构建、temp 消息拦截与生命周期管理
 */

import {
  createCharacterTempRuntime,
  type CharacterServiceLike as SharedCharacterServiceLike,
  type TempLike,
} from "shared-chatluna-xmltools";
import { h, type Context, type Session } from "koishi";
import type { Config } from "../../config";
import {
  getBotAvatarImage,
  getSenderAvatarImage,
  getSenderDisplayName,
  resolveAvatarImageByUserId,
  resolveDisplayNameByUserId,
} from "../../utils/avatar";
import { downloadImage } from "../../utils/image";
import { extractXmlMemeToolCalls } from "../xml-tool-call";
import type { PreparedAvatarImage, PreparedImages } from "./generate";
import type {
  ChatlunaCompletionMessageLike,
  ChatlunaTempLike,
  ContextWithChatlunaCharacter,
} from "./types";

export interface XmlGenerateInput {
  texts: string[];
  images: PreparedImages;
  senderAvatarImage?: PreparedAvatarImage;
  mentionedAvatarImages: PreparedImages;
  senderName?: string;
  groupNicknameText?: string;
}

export interface XmlToolCallInput {
  key: string;
  texts: string[];
  imageSources: string[];
  atUserIds: string[];
}

export interface XmlToolSendPayload {
  memeKey: string;
  result: string | ReturnType<typeof h.image>;
}

export interface XmlMemeToolExecutorDeps {
  ctx: Context;
  config: Config;
  ensureCategoryExcludedMemeKeySet: () => Promise<void>;
  resolveMemeKey: (key: string) => Promise<string>;
  isExcludedMemeKey: (key: string) => boolean;
  handleGenerateWithPreparedInput: (
    key: string,
    texts: string[],
    images: PreparedImages,
    senderAvatarImage?: PreparedAvatarImage,
    mentionedAvatarImages?: PreparedImages,
    botAvatarImage?: PreparedAvatarImage,
    senderName?: string,
    groupNicknameText?: string,
  ) => Promise<ReturnType<typeof h.image>>;
  handleRuntimeError: (scope: string, error: unknown) => string;
}

export interface XmlMemeToolExecutor {
  executeToolCall: (
    session: Session,
    toolCall: XmlToolCallInput,
  ) => Promise<XmlToolSendPayload | null>;
}

export interface InstallXmlRuntimeControls {
  shouldExecuteXmlActions?: () => boolean;
}

interface InstallXmlRuntimeOptions {
  ctx: Context;
  config: Config;
  logger: ReturnType<Context["logger"]>;
  ensureCategoryExcludedMemeKeySet: () => Promise<void>;
  resolveMemeKey: (key: string) => Promise<string>;
  isExcludedMemeKey: (key: string) => boolean;
  handleGenerateWithPreparedInput: (
    key: string,
    texts: string[],
    images: PreparedImages,
    senderAvatarImage?: PreparedAvatarImage,
    mentionedAvatarImages?: PreparedImages,
    botAvatarImage?: PreparedAvatarImage,
    senderName?: string,
    groupNicknameText?: string,
  ) => Promise<ReturnType<typeof h.image>>;
  handleRuntimeError: (scope: string, error: unknown) => string;
  controls?: InstallXmlRuntimeControls;
}

interface BuildXmlGenerateInputOptions {
  ctx: Context;
  config: Config;
  session: Session;
  pickedCall: XmlToolCallInput;
}

const DEFAULT_XML_RUNTIME_CONTROLS: Required<InstallXmlRuntimeControls> = {
  shouldExecuteXmlActions: () => true,
};

function normalizeTrimmedStrings(items: readonly string[]): string[] {
  return items
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function normalizeAtUserIds(items: readonly string[]): string[] {
  const dedupe = new Set<string>();
  const normalized: string[] = [];
  for (const item of normalizeTrimmedStrings(items)) {
    const userId = item.replace(/^@+/, "").trim();
    if (!userId || dedupe.has(userId)) continue;
    dedupe.add(userId);
    normalized.push(userId);
  }
  return normalized;
}

function normalizeXmlToolCallInput(toolCall: XmlToolCallInput): XmlToolCallInput {
  return {
    key: String(toolCall.key ?? "").trim(),
    texts: normalizeTrimmedStrings(toolCall.texts ?? []),
    imageSources: normalizeTrimmedStrings(toolCall.imageSources ?? []),
    atUserIds: normalizeAtUserIds(toolCall.atUserIds ?? []),
  };
}

async function buildXmlGenerateInput(
  options: BuildXmlGenerateInputOptions,
): Promise<XmlGenerateInput> {
  const { ctx, config, session, pickedCall } = options;
  const senderName = getSenderDisplayName(session);
  const preferredGuildId =
    session.guildId && session.guildId !== "private" ? session.guildId : undefined;

  const downloadedImages: PreparedImages = [];
  for (let index = 0; index < pickedCall.imageSources.length; index += 1) {
    const src = pickedCall.imageSources[index];
    const image = await downloadImage(
      ctx,
      src,
      config.timeoutMs,
      `xml-image-${index + 1}`,
    );
    downloadedImages.push(image);
  }

  const mentionedAvatarImages: PreparedImages = [];
  for (let index = 0; index < pickedCall.atUserIds.length; index += 1) {
    const userId = pickedCall.atUserIds[index];
    const avatar = await resolveAvatarImageByUserId(
      ctx,
      session,
      userId,
      config.timeoutMs,
      preferredGuildId,
      `xml-at-avatar-${index + 1}`,
    );
    if (!avatar) continue;
    mentionedAvatarImages.push(avatar);
  }

  let targetDisplayName: string | undefined;
  if (config.autoUseGroupNicknameWhenNoDefaultText && pickedCall.atUserIds.length > 0) {
    targetDisplayName = await resolveDisplayNameByUserId(
      session,
      pickedCall.atUserIds[0],
      preferredGuildId,
    );
  }

  const senderAvatarImage = await getSenderAvatarImage(
    ctx,
    session,
    config.timeoutMs,
  );

  return {
    texts: pickedCall.texts,
    images: downloadedImages,
    senderAvatarImage,
    mentionedAvatarImages,
    senderName,
    groupNicknameText: config.autoUseGroupNicknameWhenNoDefaultText
      ? targetDisplayName || senderName
      : undefined,
  };
}

export function createXmlMemeToolExecutor(
  deps: XmlMemeToolExecutorDeps,
): XmlMemeToolExecutor {
  const {
    ctx,
    config,
    ensureCategoryExcludedMemeKeySet,
    resolveMemeKey,
    isExcludedMemeKey,
    handleGenerateWithPreparedInput,
    handleRuntimeError,
  } = deps;

  const executeToolCall = async (
    session: Session,
    toolCall: XmlToolCallInput,
  ): Promise<XmlToolSendPayload | null> => {
    const normalized = normalizeXmlToolCallInput(toolCall);
    if (!normalized.key) return null;

    let resolvedKey = normalized.key;
    try {
      await ensureCategoryExcludedMemeKeySet();
      resolvedKey = await resolveMemeKey(normalized.key);
      if (isExcludedMemeKey(resolvedKey)) {
        return {
          memeKey: resolvedKey,
          result: "该模板已被排除。",
        };
      }

      const xmlInput = await buildXmlGenerateInput({
        ctx,
        config,
        session,
        pickedCall: normalized,
      });
      const botAvatarImage = await getBotAvatarImage(
        ctx,
        session,
        config.timeoutMs,
      );

      return {
        memeKey: resolvedKey,
        result: await handleGenerateWithPreparedInput(
          resolvedKey,
          xmlInput.texts,
          xmlInput.images,
          xmlInput.senderAvatarImage,
          xmlInput.mentionedAvatarImages,
          botAvatarImage,
          xmlInput.senderName,
          xmlInput.groupNicknameText,
        ),
      };
    } catch (error) {
      return {
        memeKey: resolvedKey,
        result: handleRuntimeError("meme.xml", error),
      };
    }
  };

  return {
    executeToolCall,
  };
}

type CharacterServiceLike = SharedCharacterServiceLike<ChatlunaTempLike & TempLike>;

export function installXmlRuntime(options: InstallXmlRuntimeOptions): void {
  const {
    ctx,
    config,
    logger,
    ensureCategoryExcludedMemeKeySet,
    resolveMemeKey,
    isExcludedMemeKey,
    handleGenerateWithPreparedInput,
    handleRuntimeError,
  } = options;
  const controls = {
    ...DEFAULT_XML_RUNTIME_CONTROLS,
    ...(options.controls || {}),
  };

  const executor = createXmlMemeToolExecutor({
    ctx,
    config,
    ensureCategoryExcludedMemeKeySet,
    resolveMemeKey,
    isExcludedMemeKey,
    handleGenerateWithPreparedInput,
    handleRuntimeError,
  });

  const dispatchXmlToolCall = async (
    session: Session | null,
    content: string,
  ): Promise<void> => {
    if (!session || !content) return;
    if (!controls.shouldExecuteXmlActions()) return;

    try {
      const toolCalls = extractXmlMemeToolCalls(content);
      if (toolCalls.length === 0) return;
      const payload = await executor.executeToolCall(session, toolCalls[0]);
      if (!payload) return;

      await session.send(payload.result);
      logger.info(
        "meme=%s, user=%s, guild=%s",
        payload.memeKey,
        session.userId,
        session.guildId,
      );
    } catch (error) {
      logger.warn("meme.xml temp runtime failed: %s", String(error));
    }
  };

  let currentCharacterService: CharacterServiceLike | null | undefined = (
    ctx as ContextWithChatlunaCharacter
  ).chatluna_character as CharacterServiceLike | null | undefined;

  const runtime = createCharacterTempRuntime<
    ChatlunaTempLike & TempLike,
    Session,
    ChatlunaCompletionMessageLike
  >({
    getCharacterService: () => currentCharacterService,
    symbolNamespace: "chatluna-meme-generator",
    getMessages: (temp) => temp?.completionMessages,
    resolveSession: (args) =>
      args[0] && typeof args[0] === "object" ? (args[0] as Session) : null,
    onResponse: ({ response, session }) => {
      void dispatchXmlToolCall(session, response);
    },
  });

  const bindFromContext = (currentCtx: Context): void => {
    currentCharacterService = (currentCtx as ContextWithChatlunaCharacter)
      .chatluna_character as CharacterServiceLike | null | undefined;
    if (!runtime.start() && currentCharacterService) {
      logger.warn("chatluna_character.getTemp 不可用，XML 工具不会启用");
    }
  };

  ctx.on("ready", () => {
    bindFromContext(ctx);
  });

  ctx.inject(["chatluna_character"], (injectedCtx) => {
    bindFromContext(injectedCtx);
  });

  ctx.on("dispose", () => {
    runtime.stop();
    currentCharacterService = null;
  });
}
