/**
 * 命令注册与执行链路
 * 注册 meme 相关命令并完成生成请求调用
 */

import { h, type Context } from "koishi";
import type { Config } from "../config";
import { MemeBackendClient } from "../infra/client";
import { createMemeKeyResolver } from "./key-resolver";
import {
  buildCategoryExcludedMemeKeySet,
  buildMemeListEntries,
  buildMemeListSections,
  buildListMessage,
  fetchMemeListInfos,
  formatMemeListLines,
} from "./register/meme-list";
import {
  buildExcludedMemeKeySet,
  filterExcludedMemeKeys,
  isExcludedMemeKey,
} from "./register/exclusion";
import { mapRuntimeErrorMessage, replyOrSilent } from "./register/errors";
import {
  buildRandomConfig,
  handleGenerate,
  handleGenerateWithPreparedInput,
  type PreparedAvatarImage,
  type PreparedImages,
} from "./register/generate";
import {
  hasReplyToolsEnabled,
  registerCharacterReplyTools,
} from "./register/reply-tools";
import type {
  ChatlunaCharacterServiceLike,
  ContextWithOptionalServices,
} from "./register/types";
import { installDirectAliasRuntime } from "./register/direct-alias-runtime";
import {
  createXmlMemeToolExecutor,
  installXmlRuntime,
} from "./register/xml-runtime";
import { installRandomRuntime } from "./register/random-poke-runtime";

interface LeadingAtCommandParts {
  leadingAtSegments: string[];
  commandText: string;
  suffix: string;
}

interface ElementLike {
  type?: string;
  attrs?: {
    id?: string;
    content?: unknown;
  };
}

function resolveSessionTextContent(session: {
  content?: unknown;
  stripped?: { content?: unknown };
}): string {
  const rawContent =
    typeof session.content === "string" ? session.content.trim() : "";
  if (rawContent) return rawContent;

  const strippedContent =
    typeof session.stripped?.content === "string"
      ? session.stripped.content.trim()
      : "";
  return strippedContent;
}

function extractAtIdSegments(rawAts: string): string[] {
  const segments: string[] = [];
  const idPattern = /\bid\s*=\s*"([^"]+)"/gi;
  let match: RegExpExecArray | null = idPattern.exec(rawAts);
  while (match) {
    const id = (match[1] || "").trim();
    if (id) segments.push(`<at id="${id}"/>`);
    match = idPattern.exec(rawAts);
  }
  return segments;
}

function parseLeadingAtBeforeMemeCommand(
  content: string,
): LeadingAtCommandParts | undefined {
  const normalized = content.trim();
  if (!normalized) return undefined;

  const segmentMatch = normalized.match(
    /^((?:<at\b[^>]*>(?:<\/at>)?\s*)+)(\S+)([\s\S]*)$/i,
  );
  if (segmentMatch) {
    const leadingAtSegments = extractAtIdSegments(segmentMatch[1] || "");
    const commandText = (segmentMatch[2] || "").trim();
    if (leadingAtSegments.length === 0 || !commandText) return undefined;
    return {
      leadingAtSegments,
      commandText,
      suffix: (segmentMatch[3] || "").trim(),
    };
  }

  const plainMatch = normalized.match(/^((?:@\S+\s+)+)(\S+)([\s\S]*)$/i);
  if (!plainMatch) return undefined;

  const leadingAtSegments = (plainMatch[1] || "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.startsWith("@") && token.length > 1)
    .map((token) => {
      const mentionBody = token.slice(1).trim();
      return /^\d+$/.test(mentionBody)
        ? `<at id="${mentionBody}"/>`
        : `@${mentionBody}`;
    });

  const commandText = (plainMatch[2] || "").trim();
  if (leadingAtSegments.length === 0 || !commandText) return undefined;

  return {
    leadingAtSegments,
    commandText,
    suffix: (plainMatch[3] || "").trim(),
  };
}

function parseLeadingAtBeforeMemeByElements(
  elements: readonly ElementLike[] = [],
): LeadingAtCommandParts | undefined {
  if (elements.length < 2) return undefined;

  const atElements: ElementLike[] = [];
  let index = 0;
  for (; index < elements.length; index += 1) {
    const element = elements[index];
    if (element?.type !== "at") break;
    atElements.push(element);
  }

  if (atElements.length === 0) return undefined;

  let commandText = "";
  let suffix = "";
  let foundCommandText = false;
  for (; index < elements.length; index += 1) {
    const element = elements[index];
    if (element?.type !== "text") return undefined;

    const rawContent = element.attrs?.content;
    const textContent =
      typeof rawContent === "string" ? rawContent.trimStart() : "";
    if (!textContent) continue;

    const match = textContent.match(/^(\S+)([\s\S]*)$/i);
    if (!match) return undefined;

    commandText = (match[1] || "").trim();
    suffix = (match[2] || "").trim();
    foundCommandText = true;
    break;
  }

  if (!foundCommandText || !commandText) return undefined;

  const leadingAtSegments = atElements
    .map((element) => {
      const id = element.attrs?.id;
      return id ? `<at id="${id}"/>` : "";
    })
    .filter(Boolean);
  if (leadingAtSegments.length === 0) return undefined;

  return {
    leadingAtSegments,
    commandText,
    suffix,
  };
}

export function registerCommands(ctx: Context, config: Config): void {
  const client = new MemeBackendClient(
    ctx,
    config.baseUrl.replace(/\/$/, ""),
    config.timeoutMs,
  );
  const excludedMemeKeySet = buildExcludedMemeKeySet(config);
  let categoryExcludedMemeKeySet = new Set<string>();
  let categoryExcludedMemeKeySetLoaded = false;
  const ensureCategoryExcludedMemeKeySet = async (
    rawKeys?: string[],
    forceRefresh = false,
  ): Promise<void> => {
    if (categoryExcludedMemeKeySetLoaded && !forceRefresh) return;
    const keys = rawKeys ?? (await client.getKeys());
    categoryExcludedMemeKeySet = await buildCategoryExcludedMemeKeySet(
      client,
      keys,
      config,
    );
    categoryExcludedMemeKeySetLoaded = true;
  };
  const mergedExcludedMemeKeySet = (): Set<string> => {
    if (categoryExcludedMemeKeySet.size === 0) return excludedMemeKeySet;
    return new Set([...excludedMemeKeySet, ...categoryExcludedMemeKeySet]);
  };

  const resolveMemeKey = createMemeKeyResolver(client, {
    infoFetchConcurrency: config.infoFetchConcurrency,
  });
  const logger = ctx.logger("chatluna-meme-generator");

  const handleErrorReply = (scope: string, message: string): string => {
    if (!config.disableErrorReplyToPlatform) return message;
    logger.warn("%s failed: %s", scope, message);
    return "";
  };

  const handleRuntimeError = (scope: string, error: unknown): string => {
    return handleErrorReply(scope, mapRuntimeErrorMessage(error));
  };

  ctx.middleware(async (session, next) => {
    const sessionTextContent = resolveSessionTextContent(session);
    const strippedContent =
      typeof session.stripped?.content === "string"
        ? session.stripped.content.trim()
        : "";
    const sessionElements = Array.isArray(session.elements)
      ? (session.elements as ElementLike[])
      : [];
    const contentMatched = parseLeadingAtBeforeMemeCommand(sessionTextContent);
    const elementsMatched = parseLeadingAtBeforeMemeByElements(sessionElements);
    const leadingAtParts = contentMatched || elementsMatched;

    if (config.enableDeveloperDebugLog) {
      logger.info(
        "leading-at debug: content=%s stripped=%s contentMatched=%s elementsMatched=%s matched=%s allow=%s",
        JSON.stringify(sessionTextContent),
        JSON.stringify(strippedContent),
        String(Boolean(contentMatched)),
        String(Boolean(elementsMatched)),
        String(Boolean(leadingAtParts)),
        String(config.allowLeadingAtBeforeCommand),
      );
      logger.info(
        "leading-at debug: elements-count=%s elements-types=%s",
        String(sessionElements.length),
        JSON.stringify(sessionElements.map((element) => element?.type || "")),
      );
      if (contentMatched) {
        logger.info(
          "leading-at debug: content command=%s suffix=%s segments=%s",
          JSON.stringify(contentMatched.commandText),
          JSON.stringify(contentMatched.suffix),
          JSON.stringify(contentMatched.leadingAtSegments),
        );
      }
      if (elementsMatched) {
        logger.info(
          "leading-at debug: elements command=%s suffix=%s segments=%s",
          JSON.stringify(elementsMatched.commandText),
          JSON.stringify(elementsMatched.suffix),
          JSON.stringify(elementsMatched.leadingAtSegments),
        );
      }
    }

    if (!leadingAtParts) {
      if (config.enableDeveloperDebugLog) {
        logger.info("leading-at debug: pass-through middleware");
      }
      return await next();
    }

    const isMentioningSelf = Boolean(session.stripped?.atSelf);
    const isMemeCommand = /^meme$/i.test(leadingAtParts.commandText.trim());

    if (isMentioningSelf && !isMemeCommand) {
      if (config.enableDeveloperDebugLog) {
        logger.info("leading-at debug: pass-through at-self non-meme");
      }
      return await next();
    }

    if (!config.allowLeadingAtBeforeCommand) {
      if (config.enableDeveloperDebugLog) {
        logger.info(
          "leading-at debug: pass-through because allowLeadingAtBeforeCommand=false",
        );
      }
      return await next();
    }

    const normalizedCommandText = leadingAtParts.commandText.trim();
    const normalizedSuffix = leadingAtParts.suffix.trim();
    const rewrittenCommand = /^meme$/i.test(normalizedCommandText)
      ? normalizedSuffix
        ? `meme ${normalizedSuffix}`
        : "meme"
      : normalizedSuffix
        ? `meme ${normalizedCommandText} ${normalizedSuffix}`
        : `meme ${normalizedCommandText}`;

    if (config.enableDeveloperDebugLog) {
      logger.info(
        "leading-at debug: rewritten=%s",
        JSON.stringify(rewrittenCommand),
      );
    }

    const executed = await session.execute(rewrittenCommand);
    if (config.enableDeveloperDebugLog) {
      logger.info(
        "leading-at debug: execute returned=%s",
        JSON.stringify(executed),
      );
    }
    if (executed) await session.send(executed);
  });

  const executePreview = async (
    key: string,
  ): Promise<string | ReturnType<typeof h.image>> => {
    if (!key) return handleErrorReply("meme.preview", "请提供模板 key。");

    try {
      await ensureCategoryExcludedMemeKeySet();
      const resolvedKey = await resolveMemeKey(key);
      if (isExcludedMemeKey(resolvedKey, mergedExcludedMemeKeySet())) {
        return handleErrorReply("meme.preview", "该模板已被排除。");
      }
      const preview = await client.getPreview(resolvedKey);
      return h.image(Buffer.from(preview.buffer), preview.mimeType);
    } catch (error) {
      return handleRuntimeError("meme.preview", error);
    }
  };

  ctx.command("meme.list", "列出可用 meme 模板").action(async ({ session }) => {
    try {
      const oldMergedExcludedCount = mergedExcludedMemeKeySet().size;
      const rawKeys = await client.getKeys();
      await ensureCategoryExcludedMemeKeySet(rawKeys, true);
      const keys = filterExcludedMemeKeys(rawKeys, mergedExcludedMemeKeySet());
      if (oldMergedExcludedCount !== mergedExcludedMemeKeySet().size) {
        logger.info(
          "meme category exclusion loaded: %d keys",
          categoryExcludedMemeKeySet.size,
        );
      }
      if (keys.length === 0)
        return replyOrSilent(
          config,
          logger,
          "meme.list",
          "当前后端没有可用模板。",
        );

      const infoResults = await fetchMemeListInfos(client, keys, config);
      const entries = buildMemeListEntries(infoResults);
      const sections = buildMemeListSections(entries);
      const lines = formatMemeListLines(sections);
      if (lines.length === 0)
        return replyOrSilent(
          config,
          logger,
          "meme.list",
          "当前后端没有可用模板。",
        );

      return await buildListMessage(
        ctx as ContextWithOptionalServices,
        sections,
        lines,
        config.renderMemeListAsImage,
        (session as { platform?: string } | undefined)?.platform,
        logger,
      );
    } catch (error) {
      return handleRuntimeError("meme.list", error);
    }
  });

  ctx
    .command("meme.info <key:string>", "查看模板参数约束")
    .action(async (_, key) => {
      if (!key) return handleErrorReply("meme.info", "请提供模板 key。");
      try {
        await ensureCategoryExcludedMemeKeySet();
        const resolvedKey = await resolveMemeKey(key);
        if (isExcludedMemeKey(resolvedKey, mergedExcludedMemeKeySet())) {
          return handleErrorReply("meme.info", "该模板已被排除。");
        }
        const info = await client.getInfo(resolvedKey);
        const params = info.params_type;
        return [
          `key: ${info.key}`,
          `images: ${params.min_images} ~ ${params.max_images}`,
          `texts: ${params.min_texts} ~ ${params.max_texts}`,
          `default_texts: ${params.default_texts.join(" | ") || "(空)"}`,
        ].join("\n");
      } catch (error) {
        return handleRuntimeError("meme.info", error);
      }
    });

  ctx
    .command("meme.preview <key:string>", "预览模板效果")
    .action(async (_, key) => executePreview(key));

  const aliasLogger = logger;
  let initializedNotified = false;
  const notifier = (ctx as ContextWithOptionalServices).notifier?.create();

  const notifyInitializedSummary = (count: number): void => {
    if (initializedNotified) return;
    initializedNotified = true;
    notifier?.update({
      type: "success",
      content: `插件初始化完毕，共载入 ${count} 个表情。`,
    });
  };

  const isExcludedFromMergedSet = (key: string): boolean => {
    return isExcludedMemeKey(key, mergedExcludedMemeKeySet());
  };

  const filterExcludedFromMergedSet = (keys: string[]): string[] => {
    return filterExcludedMemeKeys(keys, mergedExcludedMemeKeySet());
  };

  const xmlExecutor = createXmlMemeToolExecutor({
    ctx,
    config,
    ensureCategoryExcludedMemeKeySet,
    resolveMemeKey,
    isExcludedMemeKey: isExcludedFromMergedSet,
    handleGenerateWithPreparedInput: async (
      key: string,
      texts: string[],
      images: PreparedImages,
      senderAvatarImage?: PreparedAvatarImage,
      mentionedAvatarImages?: PreparedImages,
      botAvatarImage?: PreparedAvatarImage,
      senderName?: string,
      groupNicknameText?: string,
    ) => {
      return await handleGenerateWithPreparedInput(
        client,
        config,
        key,
        texts,
        images,
        senderAvatarImage,
        mentionedAvatarImages,
        botAvatarImage,
        senderName,
        groupNicknameText,
      );
    },
    handleRuntimeError,
  });

  let xmlActionExecutionEnabled = true;
  let replyToolsDispose: (() => void) | null = null;
  let replyToolsBoundService: ChatlunaCharacterServiceLike | null = null;
  const enableReplyTools = hasReplyToolsEnabled(config);

  if (config.enableMemeXmlTool) {
    installXmlRuntime({
      ctx,
      config,
      logger,
      ensureCategoryExcludedMemeKeySet,
      resolveMemeKey,
      isExcludedMemeKey: isExcludedFromMergedSet,
      handleGenerateWithPreparedInput: async (
        key: string,
        texts: string[],
        images: PreparedImages,
        senderAvatarImage?: PreparedAvatarImage,
        mentionedAvatarImages?: PreparedImages,
        botAvatarImage?: PreparedAvatarImage,
        senderName?: string,
        groupNicknameText?: string,
      ) => {
        return await handleGenerateWithPreparedInput(
          client,
          config,
          key,
          texts,
          images,
          senderAvatarImage,
          mentionedAvatarImages,
          botAvatarImage,
          senderName,
          groupNicknameText,
        );
      },
      handleRuntimeError,
      controls: {
        shouldExecuteXmlActions: () => xmlActionExecutionEnabled,
      },
    });
  }

  const bindReplyTools = (bindCtx: Context): void => {
    const characterService = (bindCtx as {
      chatluna_character?: ChatlunaCharacterServiceLike;
    }).chatluna_character;

    if (!enableReplyTools) {
      replyToolsDispose?.();
      replyToolsDispose = null;
      replyToolsBoundService = null;
      xmlActionExecutionEnabled = true;
      return;
    }

    if (characterService && characterService === replyToolsBoundService && replyToolsDispose) {
      return;
    }

    replyToolsDispose?.();
    replyToolsDispose = null;
    replyToolsBoundService = null;
    xmlActionExecutionEnabled = true;

    if (characterService?.registerReplyToolField) {
      replyToolsDispose = registerCharacterReplyTools({
        ctx: bindCtx,
        config,
        logger,
        executeToolCall: xmlExecutor.executeToolCall,
      });
      replyToolsBoundService = characterService;
      xmlActionExecutionEnabled = false;
      if (config.enableDeveloperDebugLog) {
        logger.info("已启用实验性 reply tool 字段注入，关闭 XML 动作执行");
      }
      return;
    }

    if (config.enableDeveloperDebugLog) {
      logger.warn(
        "chatluna_character.registerReplyToolField 不可用，回退为 XML 动作执行模式",
      );
    }
  };


  if (enableReplyTools) {
    bindReplyTools(ctx);
  }

  if (typeof ctx.inject === "function") {
    ctx.inject(["chatluna_character"], (innerCtx) => {
      bindReplyTools(innerCtx);
      const innerCharacterService = (innerCtx as {
        chatluna_character?: ChatlunaCharacterServiceLike;
      }).chatluna_character;
      innerCtx.on("dispose", () => {
        if (
          innerCharacterService &&
          innerCharacterService === replyToolsBoundService
        ) {
          replyToolsDispose?.();
          replyToolsDispose = null;
          replyToolsBoundService = null;
          xmlActionExecutionEnabled = true;
        }
      });
    });
  }

  ctx.on("dispose", () => {
    replyToolsDispose?.();
    replyToolsDispose = null;
    replyToolsBoundService = null;
    xmlActionExecutionEnabled = true;
  });

  if (
    config.enableDirectAliasWithoutPrefix ||
    config.allowKeyWithoutPrefixTrigger
  ) {
    installDirectAliasRuntime({
      ctx,
      config,
      client,
      logger: aliasLogger,
      ensureCategoryExcludedMemeKeySet,
      notifyInitializedSummary,
      isExcludedMemeKey: isExcludedFromMergedSet,
      handleGenerate: async (session, key, texts) => {
        return await handleGenerate(ctx, session, client, config, key, texts);
      },
    });
  } else {
    let initRetryTimer: ReturnType<typeof setTimeout> | undefined;
    let initRetryAttempts = 0;
    let initRetryDisposed = false;
    const maxInitRetryAttempts = config.initLoadRetryTimes;

    const clearInitRetryTimer = (): void => {
      if (initRetryTimer) {
        clearTimeout(initRetryTimer);
        initRetryTimer = undefined;
      }
    };

    const stopInitRetry = (): void => {
      clearInitRetryTimer();
    };

    const scheduleInitRetry = (delayMs: number): void => {
      if (initRetryDisposed) return;
      if (initRetryTimer) return;
      if (initRetryAttempts >= maxInitRetryAttempts) {
        aliasLogger.warn(
          "初始化时获取表情列表重试在 %d 次后停止",
          initRetryAttempts,
        );
        stopInitRetry();
        return;
      }

      initRetryTimer = setTimeout(() => {
        if (initRetryDisposed) {
          initRetryTimer = undefined;
          return;
        }
        initRetryTimer = undefined;
        initRetryAttempts += 1;

        void client
          .getKeys()
          .then((keys) => {
            if (initRetryDisposed) {
              stopInitRetry();
              return;
            }
            notifyInitializedSummary(keys.length);
            initRetryAttempts = 0;
            stopInitRetry();
          })
          .catch((retryError) => {
            if (initRetryDisposed) {
              stopInitRetry();
              return;
            }
            aliasLogger.warn(
              "初始化时获取表情列表失败（attempt %d/%d）: %s",
              initRetryAttempts,
              maxInitRetryAttempts,
              String(retryError),
            );
            scheduleInitRetry(3000);
          });
      }, delayMs);
    };

    ctx.on("ready", async () => {
      try {
        const rawKeys = await client.getKeys();
        await ensureCategoryExcludedMemeKeySet(rawKeys, true);
        const keyCount = filterExcludedMemeKeys(
          rawKeys,
          mergedExcludedMemeKeySet(),
        ).length;
        notifyInitializedSummary(keyCount);
      } catch (error) {
        aliasLogger.warn("初始化时获取表情列表失败: %s", String(error));
        scheduleInitRetry(3000);
      }
    });

    ctx.on("dispose", () => {
      initRetryDisposed = true;
      stopInitRetry();
    });
  }

  ctx
    .command("meme <key:string> [...texts]", "生成 meme 图片")
    .action(async ({ session }, key, ...texts) => {
      if (!session)
        return handleErrorReply("meme.generate", "当前上下文不可用。");
      try {
        await ensureCategoryExcludedMemeKeySet();
        const resolvedKey = await resolveMemeKey(key);
        if (isExcludedMemeKey(resolvedKey, mergedExcludedMemeKeySet())) {
          return handleErrorReply("meme.generate", "该模板已被排除。");
        }
        return await handleGenerate(
          ctx,
          session,
          client,
          config,
          resolvedKey,
          texts,
        );
      } catch (error) {
        return handleRuntimeError("meme.generate", error);
      }
    });

  installRandomRuntime({
    ctx,
    config,
    client,
    logger,
    ensureCategoryExcludedMemeKeySet,
    filterExcludedMemeKeys: filterExcludedFromMergedSet,
    handleGenerateWithPreparedInput: async (
      key: string,
      texts: string[],
      images: PreparedImages,
      senderAvatarImage?: PreparedAvatarImage,
      mentionedAvatarImages?: PreparedImages,
      botAvatarImage?: PreparedAvatarImage,
      senderName?: string,
      groupNicknameText?: string,
      preferredTextSource?: "template-default" | "user-nickname",
    ) => {
      return await handleGenerateWithPreparedInput(
        client,
        buildRandomConfig(config),
        key,
        texts,
        images,
        senderAvatarImage,
        mentionedAvatarImages,
        botAvatarImage,
        senderName,
        groupNicknameText,
        preferredTextSource,
      );
    },
    handleErrorReply,
    handleRuntimeError,
  });
}
