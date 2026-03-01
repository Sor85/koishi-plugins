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
import type { ContextWithOptionalServices } from "./register/types";
import { installDirectAliasRuntime } from "./register/direct-alias-runtime";
import { installXmlRuntime } from "./register/xml-runtime";
import { installRandomAndPokeRuntime } from "./register/random-poke-runtime";

interface StrippedLike {
  content?: string;
}

function hasLeadingAtBeforeMemeCommand(session: unknown): boolean {
  if (!session || typeof session !== "object") return false;
  const stripped = (session as { stripped?: StrippedLike }).stripped;
  const content = typeof stripped?.content === "string" ? stripped.content : "";
  const normalized = content.trim();
  if (!normalized) return false;
  return /^<at\b[^>]*>\s*meme\b/i.test(normalized);
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
    enableInfoFetchConcurrencyLimit: config.enableInfoFetchConcurrencyLimit,
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
        targetAvatarImage?: PreparedAvatarImage,
        secondaryTargetAvatarImage?: PreparedAvatarImage,
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
          targetAvatarImage,
          secondaryTargetAvatarImage,
          botAvatarImage,
          senderName,
          groupNicknameText,
        );
      },
      handleRuntimeError,
    });
  }

  if (config.enableDirectAliasWithoutPrefix) {
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
      if (!key) return handleErrorReply("meme.generate", "请提供模板 key。");

      if (
        config.disallowLeadingAtBeforeCommand &&
        hasLeadingAtBeforeMemeCommand(session)
      ) {
        return handleErrorReply(
          "meme.generate",
          "不支持前置@参数，请使用 meme @用户 的格式。",
        );
      }
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

  installRandomAndPokeRuntime({
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
      targetAvatarImage?: PreparedAvatarImage,
      secondaryTargetAvatarImage?: PreparedAvatarImage,
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
        targetAvatarImage,
        secondaryTargetAvatarImage,
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
