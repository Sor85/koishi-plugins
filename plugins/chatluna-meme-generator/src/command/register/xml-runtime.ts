/**
 * XML 工具调用运行时
 * 负责 XML 输入构建、temp 消息拦截与生命周期管理
 */

import {
  createCharacterTempRuntime,
  type CharacterServiceLike as SharedCharacterServiceLike,
  type TempLike,
} from "chatluna-xml-tools";
import { h, type Context, type Session } from "koishi";
import type { Config } from "../../config";
import { downloadImage } from "../../utils/image";
import {
  getBotAvatarImage,
  getSenderAvatarImage,
  getSenderDisplayName,
  resolveAvatarImageByUserId,
  resolveDisplayNameByUserId,
} from "../../utils/avatar";
import { extractXmlMemeToolCalls } from "../xml-tool-call";
import type {
  ChatlunaCompletionMessageLike,
  ChatlunaTempLike,
  ContextWithChatlunaCharacter,
} from "./types";
import type { PreparedImages } from "./generate";

interface XmlGenerateInput {
  texts: string[];
  images: PreparedImages;
  senderAvatarImage?: Awaited<ReturnType<typeof getSenderAvatarImage>>;
  mentionedAvatarImages: PreparedImages;
  senderName?: string;
  groupNicknameText?: string;
}

interface XmlToolSendPayload {
  memeKey: string;
  result: string | ReturnType<typeof h.image>;
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
    senderAvatarImage?: Awaited<ReturnType<typeof getSenderAvatarImage>>,
    mentionedAvatarImages?: PreparedImages,
    botAvatarImage?: Awaited<ReturnType<typeof getSenderAvatarImage>>,
    senderName?: string,
    groupNicknameText?: string,
  ) => Promise<ReturnType<typeof h.image>>;
  handleRuntimeError: (scope: string, error: unknown) => string;
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

  const buildXmlGenerateInput = async (
    session: Session,
    pickedCall: {
      texts: string[];
      imageSources: string[];
      atUserIds: string[];
    },
  ): Promise<XmlGenerateInput> => {
    const senderName = getSenderDisplayName(session);
    const preferredGuildId =
      session.guildId && session.guildId !== "private"
        ? session.guildId
        : undefined;

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
    if (
      config.autoUseGroupNicknameWhenNoDefaultText &&
      pickedCall.atUserIds.length > 0
    ) {
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
  };

  const handleXmlMemeToolCall = async (
    session: Session,
    content: string,
  ): Promise<XmlToolSendPayload | null> => {
    if (!content) return null;

    const toolCalls = extractXmlMemeToolCalls(content);
    if (toolCalls.length === 0) return null;

    const pickedCall = toolCalls[0];
    let resolvedKey = pickedCall.key;

    try {
      await ensureCategoryExcludedMemeKeySet();
      resolvedKey = await resolveMemeKey(pickedCall.key);
      if (isExcludedMemeKey(resolvedKey)) {
        return {
          memeKey: resolvedKey,
          result: "该模板已被排除。",
        };
      }

      const xmlInput = await buildXmlGenerateInput(session, pickedCall);
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

  const dispatchXmlToolCall = async (
    session: Session | null,
    content: string,
  ): Promise<void> => {
    if (!session || !content) return;
    try {
      const payload = await handleXmlMemeToolCall(session, content);
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
      args[0] && typeof args[0] === "object"
        ? (args[0] as Session)
        : null,
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
