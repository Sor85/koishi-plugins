/**
 * XML 工具调用运行时
 * 负责 XML 输入构建、raw 拦截器挂载与生命周期管理
 */

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
  ChatlunaCharacterLoggerLike,
  ChatlunaCharacterServiceLike,
  ContextWithChatlunaCharacter,
} from "./types";
import type { PreparedImages } from "./generate";

interface XmlGenerateInput {
  texts: string[];
  images: PreparedImages;
  senderAvatarImage?: Awaited<ReturnType<typeof getSenderAvatarImage>>;
  targetAvatarImage?: Awaited<ReturnType<typeof getSenderAvatarImage>>;
  secondaryTargetAvatarImage?: Awaited<ReturnType<typeof getSenderAvatarImage>>;
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
    targetAvatarImage?: Awaited<ReturnType<typeof getSenderAvatarImage>>,
    secondaryTargetAvatarImage?: Awaited<
      ReturnType<typeof getSenderAvatarImage>
    >,
    botAvatarImage?: Awaited<ReturnType<typeof getSenderAvatarImage>>,
    senderName?: string,
    groupNicknameText?: string,
  ) => Promise<ReturnType<typeof h.image>>;
  handleRuntimeError: (scope: string, error: unknown) => string;
}

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

    const atAvatarImages: PreparedImages = [];
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
      atAvatarImages.push(avatar);
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
      targetAvatarImage: atAvatarImages[0],
      secondaryTargetAvatarImage: atAvatarImages[1],
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
          xmlInput.targetAvatarImage,
          xmlInput.secondaryTargetAvatarImage,
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

  let rawModelResponseSessionKey: string | null = null;
  const rawModelResponseSessionMap = new Map<string, Session>();
  let lastCharacterSession: Session | null = null;
  let rawInterceptorMonitorHandle: (() => void) | null = null;
  let rawInterceptorFastRetryHandle: (() => void) | null = null;
  let rawInterceptorStartHandle: (() => void) | null = null;
  let rawInterceptorReady = false;
  let rawInterceptorService: ChatlunaCharacterServiceLike | null = null;
  let rawCollectorBound = false;
  let rawInterceptorLogger: ChatlunaCharacterLoggerLike | null = null;
  let rawInterceptorOriginalDebug: ((...args: unknown[]) => void) | null = null;

  const RAW_INTERCEPTOR_TAG = "__chatlunaMemeGeneratorRawInterceptor";
  const RAW_MODEL_RESPONSE_PREFIXES = [
    "model response: ",
    "model response:\n",
  ] as const;
  const RAW_INTERCEPTOR_MONITOR_INTERVAL = 5 * 1000;
  const RAW_INTERCEPTOR_FAST_INTERVAL = 3 * 1000;
  const RAW_INTERCEPTOR_START_DELAY = 3 * 1000;

  const setManagedInterval = (
    callback: () => void,
    delayMs: number,
  ): (() => void) => {
    const ctxLike = ctx as unknown as {
      setInterval?:
        | ((handler: () => void, delay: number) => () => void)
        | ((
            handler: () => void,
            delay: number,
          ) => ReturnType<typeof setInterval>);
    };

    if (typeof ctxLike.setInterval === "function") {
      const handle = ctxLike.setInterval(callback, delayMs);
      if (typeof handle === "function") return handle;
      return () => clearInterval(handle as ReturnType<typeof setInterval>);
    }

    const timer = setInterval(callback, delayMs);
    return () => clearInterval(timer);
  };

  const setManagedTimeout = (
    callback: () => void,
    delayMs: number,
  ): (() => void) => {
    const ctxLike = ctx as unknown as {
      setTimeout?:
        | ((handler: () => void, delay: number) => () => void)
        | ((
            handler: () => void,
            delay: number,
          ) => ReturnType<typeof setTimeout>);
    };

    if (typeof ctxLike.setTimeout === "function") {
      const handle = ctxLike.setTimeout(callback, delayMs);
      if (typeof handle === "function") return handle;
      return () => clearTimeout(handle as ReturnType<typeof setTimeout>);
    }

    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  };

  const restoreRawModelInterceptor = (): void => {
    if (rawInterceptorLogger && rawInterceptorOriginalDebug) {
      rawInterceptorLogger.debug = rawInterceptorOriginalDebug;
    }
    rawInterceptorLogger = null;
    rawInterceptorOriginalDebug = null;
  };

  const isRawInterceptorActive = (): boolean => {
    const characterService = (ctx as ContextWithChatlunaCharacter)
      .chatluna_character;
    const debugFn = characterService?.logger?.debug as
      | Record<string, boolean>
      | undefined;
    return Boolean(debugFn?.[RAW_INTERCEPTOR_TAG]);
  };

  const initRawModelInterceptor = (): boolean => {
    const characterService = (ctx as ContextWithChatlunaCharacter)
      .chatluna_character;
    if (!characterService) return false;

    if (rawInterceptorService !== characterService) {
      rawInterceptorService = characterService;
      rawCollectorBound = false;
    }

    if (!rawCollectorBound && typeof characterService.collect === "function") {
      characterService.collect(async (session: Session) => {
        const sessionKey =
          (session as unknown as { guildId?: string }).guildId ||
          session.channelId ||
          session.userId ||
          null;
        rawModelResponseSessionKey = sessionKey;
        if (sessionKey) rawModelResponseSessionMap.set(sessionKey, session);
        lastCharacterSession = session;
      });
      rawCollectorBound = true;
    }

    const characterLogger = characterService.logger;
    if (!characterLogger || typeof characterLogger.debug !== "function") {
      return false;
    }

    const taggedDebug = characterLogger.debug as unknown as Record<
      string,
      boolean
    >;
    if (taggedDebug[RAW_INTERCEPTOR_TAG]) return true;

    restoreRawModelInterceptor();
    const originalDebug = characterLogger.debug.bind(characterLogger);
    const wrappedDebug = (...args: unknown[]) => {
      originalDebug(...args);
      const message = args[0];
      if (typeof message !== "string") {
        return;
      }

      const matchedPrefix = RAW_MODEL_RESPONSE_PREFIXES.find((prefix) =>
        message.startsWith(prefix),
      );
      if (!matchedPrefix) {
        return;
      }

      const response = message.substring(matchedPrefix.length);
      if (!response) return;

      const session =
        (rawModelResponseSessionKey
          ? rawModelResponseSessionMap.get(rawModelResponseSessionKey)
          : undefined) ||
        lastCharacterSession ||
        null;
      if (!session) {
        logger.warn("拦截到原始输出但缺少会话上下文，XML 工具不会执行");
        return;
      }

      void handleXmlMemeToolCall(session, response)
        .then(async (payload) => {
          if (!payload) return;
          await session.send(payload.result);
          logger.info(
            "meme=%s, user=%s, guild=%s",
            payload.memeKey,
            session.userId,
            session.guildId,
          );
        })
        .catch((error) => {
          logger.warn("meme.xml raw interceptor failed: %s", String(error));
        });
    };

    (wrappedDebug as unknown as Record<string, boolean>)[RAW_INTERCEPTOR_TAG] =
      true;
    characterLogger.debug = wrappedDebug;
    rawInterceptorLogger = characterLogger;
    rawInterceptorOriginalDebug = originalDebug;
    return true;
  };

  const stopRawInterceptorFastRetry = (): void => {
    if (!rawInterceptorFastRetryHandle) return;
    rawInterceptorFastRetryHandle();
    rawInterceptorFastRetryHandle = null;
  };

  const startRawInterceptorFastRetry = (): void => {
    if (rawInterceptorFastRetryHandle) return;
    rawInterceptorFastRetryHandle = setManagedInterval(() => {
      if (isRawInterceptorActive()) {
        rawInterceptorReady = true;
        stopRawInterceptorFastRetry();
        return;
      }

      const ready = initRawModelInterceptor();
      if (ready && !rawInterceptorReady) {
        logger.info("原始输出拦截已恢复");
      }
      rawInterceptorReady = ready;
      if (ready) stopRawInterceptorFastRetry();
    }, RAW_INTERCEPTOR_FAST_INTERVAL);
  };

  const ensureRawInterceptorActive = (): void => {
    if (isRawInterceptorActive()) {
      rawInterceptorReady = true;
      stopRawInterceptorFastRetry();
      return;
    }

    const ready = initRawModelInterceptor();
    if (ready && !rawInterceptorReady) {
      logger.info("原始输出拦截已恢复");
    }
    rawInterceptorReady = ready;
    if (!ready) startRawInterceptorFastRetry();
  };

  const startRawInterceptorMonitor = (): void => {
    if (rawInterceptorMonitorHandle) return;
    rawInterceptorMonitorHandle = setManagedInterval(() => {
      const wasReady = rawInterceptorReady;
      ensureRawInterceptorActive();
      if (!rawInterceptorReady && wasReady) {
        logger.warn("原始输出拦截失效，将继续重试");
      }
    }, RAW_INTERCEPTOR_MONITOR_INTERVAL);
  };

  ctx.on("ready", () => {
    rawInterceptorStartHandle = setManagedTimeout(() => {
      rawInterceptorReady = initRawModelInterceptor();
      if (rawInterceptorReady) {
        logger.info("已启用原始输出拦截模式");
      } else {
        logger.warn("chatluna_character 服务不可用，将每3秒重试一次");
        startRawInterceptorFastRetry();
      }
      startRawInterceptorMonitor();
    }, RAW_INTERCEPTOR_START_DELAY);
  });

  ctx.on("dispose", () => {
    restoreRawModelInterceptor();
    rawInterceptorMonitorHandle?.();
    rawInterceptorMonitorHandle = null;
    rawInterceptorFastRetryHandle?.();
    rawInterceptorFastRetryHandle = null;
    rawInterceptorStartHandle?.();
    rawInterceptorStartHandle = null;
    rawModelResponseSessionMap.clear();
    lastCharacterSession = null;
    rawModelResponseSessionKey = null;
    rawCollectorBound = false;
    rawInterceptorService = null;
  });
}
