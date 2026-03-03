/**
 * 直连别名运行时
 * 负责别名匹配、注册重试与生命周期清理
 */

import { h, type Context, type Session } from "koishi";
import type { Config } from "../../config";
import { MemeBackendClient } from "../../infra/client";
import { listDirectAliases, shouldRegisterDirectAlias } from "../key-resolver";
import type { ElementLike } from "./types";

function collectMentionTokens(session: Session): string[] {
  const mentionTokens: string[] = [];

  const appendMentionToken = (value: unknown): void => {
    if (typeof value !== "string" && typeof value !== "number") return;
    const normalizedValue = String(value).trim();
    if (!normalizedValue) return;
    mentionTokens.push(`@${normalizedValue}`);
  };

  const walk = (elements: readonly ElementLike[]): void => {
    for (const element of elements) {
      if (element.type === "at") {
        appendMentionToken(element.attrs?.id);
        appendMentionToken(element.attrs?.name);
        appendMentionToken(element.attrs?.userId);
        appendMentionToken(element.attrs?.qq);
      }
      if (element.children?.length) walk(element.children);
    }
  };

  if (Array.isArray(session.elements)) {
    walk(session.elements as ElementLike[]);
  }

  return mentionTokens.sort((left, right) => right.length - left.length);
}

function removeFirstOccurrence(source: string, target: string): string {
  const index = source.indexOf(target);
  if (index < 0) return source;
  return `${source.slice(0, index)} ${source.slice(index + target.length)}`;
}

function normalizeDirectAliasRestText(
  rest: string,
  session: Session,
): string[] {
  let normalizedRest = rest
    .replace(/^\s+/, "")
    .replace(/<at\b[^>]*>(?:<\/at>)?/gi, " ");

  for (const mentionToken of collectMentionTokens(session)) {
    normalizedRest = removeFirstOccurrence(normalizedRest, mentionToken);
  }

  normalizedRest = normalizedRest.trim();
  if (!normalizedRest) return [];

  return normalizedRest
    .split(/\s+/)
    .map((text) => text.trim())
    .filter(Boolean);
}

function extractDirectAliasTexts(
  session: Session,
  alias: string,
  allowMergedSuffix: boolean,
  allowLeadingAtBeforeCommand: boolean,
): string[] | undefined {
  if (!allowLeadingAtBeforeCommand && session.stripped?.atSelf)
    return undefined;

  const strippedContent = session.stripped?.content;
  if (typeof strippedContent !== "string") return undefined;

  const content = strippedContent.trim();
  if (!content.startsWith(alias)) return undefined;

  const rest = content.slice(alias.length);
  if (!rest) return [];
  if (!allowMergedSuffix && !/^\s/.test(rest)) return undefined;

  return normalizeDirectAliasRestText(rest, session);
}

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createStrictDirectAliasPattern(alias: string): RegExp {
  return new RegExp(`^${escapeRegExp(alias)}(?:\\s+[\\s\\S]*)?$`);
}

function createMergedDirectAliasPattern(alias: string): RegExp {
  return new RegExp(`^${escapeRegExp(alias)}[\\s\\S]*$`);
}

export function resolveFirstDirectAlias(
  keywords: string[],
  shortcuts: Array<{ key: string; humanized?: string }>,
): string | undefined {
  const aliases = [
    ...keywords,
    ...shortcuts.flatMap((shortcut) =>
      shortcut.humanized ? [shortcut.key, shortcut.humanized] : [shortcut.key],
    ),
  ]
    .map((alias) => alias.trim())
    .filter(Boolean)
    .filter((alias) => shouldRegisterDirectAlias(alias));

  return aliases.find(
    (alias) => /[^\x00-\x7F]/.test(alias) && alias.length >= 2,
  );
}

interface InstallDirectAliasRuntimeOptions {
  ctx: Context;
  config: Config;
  client: MemeBackendClient;
  logger: ReturnType<Context["logger"]>;
  ensureCategoryExcludedMemeKeySet: () => Promise<void>;
  notifyInitializedSummary: (count: number) => void;
  isExcludedMemeKey: (key: string) => boolean;
  handleGenerate: (
    session: Session,
    key: string,
    texts: string[],
  ) => Promise<string | ReturnType<typeof h.image>>;
}

export function installDirectAliasRuntime(
  options: InstallDirectAliasRuntimeOptions,
): void {
  const {
    ctx,
    config,
    client,
    logger,
    ensureCategoryExcludedMemeKeySet,
    notifyInitializedSummary,
    isExcludedMemeKey,
    handleGenerate,
  } = options;

  const directAliasMatchDisposers = new Map<string, () => void>();
  const registeredAliasKeySignatures = new Map<string, string>();
  const duplicatedAliasSignatures = new Map<string, string>();
  let aliasRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let aliasRetryAttempts = 0;
  let aliasRetryRunning = false;
  let aliasRetryDisposed = false;

  const maxAliasRetryAttempts = config.initLoadRetryTimes;

  const registerDirectAliases = async (): Promise<boolean> => {
    if (aliasRetryDisposed) return true;
    const result = await listDirectAliases(client, {
      infoFetchConcurrency: config.infoFetchConcurrency,
    });
    await ensureCategoryExcludedMemeKeySet();
    if (aliasRetryDisposed) return true;
    notifyInitializedSummary(result.totalKeys);
    let registeredCount = 0;
    let updatedCount = 0;
    let removedCount = 0;

    const filteredEntries = result.entries
      .map((entry) => ({
        ...entry,
        keys: entry.keys.filter((key) => !isExcludedMemeKey(key)),
      }))
      .filter((entry) => entry.keys.length > 0);

    const sortedEntries = [...filteredEntries].sort(
      (left, right) => right.alias.length - left.alias.length,
    );
    const activeAliases = new Set<string>();

    const duplicatedAliasEntries = sortedEntries.filter(
      (entry) => entry.keys.length > 1,
    );
    const duplicatedAliasSet = new Set(
      duplicatedAliasEntries.map((entry) => entry.alias),
    );
    for (const existingAlias of duplicatedAliasSignatures.keys()) {
      if (!duplicatedAliasSet.has(existingAlias)) {
        duplicatedAliasSignatures.delete(existingAlias);
      }
    }
    for (const duplicatedEntry of duplicatedAliasEntries) {
      const duplicatedSignature = duplicatedEntry.keys.join("\u0000");
      if (
        duplicatedAliasSignatures.get(duplicatedEntry.alias) ===
        duplicatedSignature
      ) {
        continue;
      }

      duplicatedAliasSignatures.set(duplicatedEntry.alias, duplicatedSignature);
      logger.warn(
        "detected duplicate direct alias: %s -> %s",
        duplicatedEntry.alias,
        duplicatedEntry.keys.join(", "),
      );
    }

    for (const entry of sortedEntries) {
      if (!shouldRegisterDirectAlias(entry.alias)) continue;
      if (ctx.$commander.get(entry.alias)) continue;

      const aliasKeys = entry.keys.filter(Boolean);
      if (aliasKeys.length === 0) continue;
      activeAliases.add(entry.alias);

      const aliasKeySignature = aliasKeys.join("\u0000");
      const registeredSignature = registeredAliasKeySignatures.get(entry.alias);
      if (registeredSignature === aliasKeySignature) continue;

      const previousDispose = directAliasMatchDisposers.get(entry.alias);
      if (previousDispose) {
        previousDispose();
        updatedCount += 1;
      } else {
        registeredCount += 1;
      }

      const directAliasPattern = config.allowMentionPrefixDirectAliasTrigger
        ? createMergedDirectAliasPattern(entry.alias)
        : createStrictDirectAliasPattern(entry.alias);

      const matcherContext =
        !config.allowLeadingAtBeforeCommand &&
        typeof (ctx as any).exclude === "function"
          ? (ctx as any).exclude((session: Session) =>
              Boolean(session.stripped?.atSelf),
            )
          : ctx;

      const disposeMatch = matcherContext.$processor.match(
        directAliasPattern,
        async (session: Session) => {
          if (config.enableDeveloperDebugLog) {
            logger.info(
              "direct-alias debug: alias=%s stripped=%s atSelf=%s hasAt=%s appel=%s allowLeadingAt=%s",
              entry.alias,
              JSON.stringify(session.stripped?.content || ""),
              String(Boolean(session.stripped?.atSelf)),
              String(Boolean(session.stripped?.hasAt)),
              String(Boolean(session.stripped?.appel)),
              String(config.allowLeadingAtBeforeCommand),
            );
          }

          const directAliasTexts = extractDirectAliasTexts(
            session,
            entry.alias,
            config.allowMentionPrefixDirectAliasTrigger,
            config.allowLeadingAtBeforeCommand,
          );
          if (!directAliasTexts) {
            if (config.enableDeveloperDebugLog) {
              logger.info(
                "direct-alias debug: bypass/skip alias=%s",
                entry.alias,
              );
            }
            return undefined as unknown as string;
          }

          const pickedKey =
            aliasKeys.length === 1
              ? aliasKeys[0]
              : aliasKeys[Math.floor(Math.random() * aliasKeys.length)];

          if (config.enableDeveloperDebugLog) {
            logger.info(
              "direct-alias debug: trigger alias=%s key=%s texts=%s",
              entry.alias,
              pickedKey,
              JSON.stringify(directAliasTexts),
            );
          }

          return (
            (await handleGenerate(session, pickedKey, directAliasTexts)) ?? ""
          );
        },
        {
          appel: false,
          i18n: false,
          fuzzy: false,
        },
      );

      directAliasMatchDisposers.set(entry.alias, disposeMatch);
      registeredAliasKeySignatures.set(entry.alias, aliasKeySignature);
    }

    for (const [alias, disposeMatch] of directAliasMatchDisposers.entries()) {
      if (activeAliases.has(alias)) continue;
      disposeMatch();
      directAliasMatchDisposers.delete(alias);
      registeredAliasKeySignatures.delete(alias);
      duplicatedAliasSignatures.delete(alias);
      removedCount += 1;
    }

    logger.info(
      "registered direct aliases: %d (new: %d, updated: %d, removed: %d, duplicated aliases: %d, failed info keys: %d/%d)",
      directAliasMatchDisposers.size,
      registeredCount,
      updatedCount,
      removedCount,
      duplicatedAliasEntries.length,
      result.failedInfoKeys,
      result.totalKeys,
    );

    return !result.hasInfoFailure;
  };

  const clearAliasRetryTimer = (): void => {
    if (aliasRetryTimer) {
      clearTimeout(aliasRetryTimer);
      aliasRetryTimer = undefined;
    }
  };

  const stopAliasRetry = (): void => {
    clearAliasRetryTimer();
    aliasRetryRunning = false;
  };

  const scheduleAliasRetry = (delayMs: number): void => {
    if (aliasRetryDisposed) return;
    if (aliasRetryRunning && aliasRetryTimer) return;
    if (aliasRetryAttempts >= maxAliasRetryAttempts) {
      logger.warn(
        "direct alias retry stopped after %d attempts",
        aliasRetryAttempts,
      );
      stopAliasRetry();
      return;
    }

    aliasRetryRunning = true;
    aliasRetryTimer = setTimeout(() => {
      if (aliasRetryDisposed) {
        aliasRetryTimer = undefined;
        return;
      }
      aliasRetryTimer = undefined;
      aliasRetryAttempts += 1;

      void registerDirectAliases()
        .then((isComplete) => {
          if (aliasRetryDisposed) {
            stopAliasRetry();
            return;
          }
          if (isComplete) {
            aliasRetryAttempts = 0;
            stopAliasRetry();
            return;
          }

          logger.warn(
            "direct alias list still incomplete (attempt %d/%d), scheduling retry",
            aliasRetryAttempts,
            maxAliasRetryAttempts,
          );
          scheduleAliasRetry(3000);
        })
        .catch((retryError) => {
          if (aliasRetryDisposed) {
            stopAliasRetry();
            return;
          }
          logger.warn(
            "failed to register direct aliases on retry (attempt %d/%d): %s",
            aliasRetryAttempts,
            maxAliasRetryAttempts,
            String(retryError),
          );
          scheduleAliasRetry(3000);
        });
    }, delayMs);
  };

  ctx.on("ready", () => {
    aliasRetryDisposed = false;
    aliasRetryAttempts = 0;
    stopAliasRetry();

    void registerDirectAliases()
      .then((isComplete) => {
        if (!isComplete) {
          logger.warn(
            "direct alias list is incomplete at startup, scheduling retry",
          );
          scheduleAliasRetry(3000);
        }
      })
      .catch((error) => {
        logger.warn(
          "failed to register direct aliases at startup: %s",
          String(error),
        );
        scheduleAliasRetry(3000);
      });
  });

  ctx.on("dispose", () => {
    aliasRetryDisposed = true;
    stopAliasRetry();
    for (const disposeMatch of directAliasMatchDisposers.values()) {
      disposeMatch();
    }
    directAliasMatchDisposers.clear();
    registeredAliasKeySignatures.clear();
    duplicatedAliasSignatures.clear();
  });
}
