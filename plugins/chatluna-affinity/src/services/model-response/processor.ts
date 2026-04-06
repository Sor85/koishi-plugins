/**
 * 模型响应处理器
 * 负责解析 XML 动作并执行好感度、黑名单、关系与昵称更新
 */

import { parseSelfClosingXmlTags } from "chatluna-xml-tools";
import { collectNicknameCandidates, fetchMember } from "../../helpers";
import type { ModelResponseContext } from "./temp-runtime";
import type { Config, LogFn } from "../../types";
import { applyAffinityDelta } from "../affinity/apply-delta";

export interface ModelResponseProcessorParams {
  config: Config;
  cache: {
    clear: (scopeId: string, userId: string) => void;
  };
  store: {
    ensureForSeed: Parameters<
      typeof applyAffinityDelta
    >[0]["store"]["ensureForSeed"];
    recordInteraction: (
      seed: Parameters<typeof applyAffinityDelta>[0]["seed"],
      userId: string,
    ) => Promise<unknown>;
    save: (
      seed: Parameters<typeof applyAffinityDelta>[0]["seed"],
      value: number,
      relation?: string,
      extra?: Record<string, unknown>,
    ) => Promise<unknown>;
    clamp: Parameters<typeof applyAffinityDelta>[0]["store"]["clamp"];
    load: (
      scopeId: string,
      userId: string,
    ) => Promise<
      | {
          affinity?: number | null;
          longTermAffinity?: number | null;
          nickname?: string | null;
          specialRelation?: string | null;
        }
      | null
      | undefined
    >;
  };
  blacklist: {
    removeTemporary: (platform: string, userId: string) => Promise<unknown>;
    recordPermanent: (
      platform: string,
      userId: string,
      detail: { note: string; nickname: string },
    ) => Promise<unknown>;
    recordTemporary: (
      platform: string,
      userId: string,
      durationHours: number,
      penalty: number,
      detail: { note: string; nickname: string },
    ) => Promise<unknown>;
  };
  unblockPermanent: (params: {
    source: "xml" | "command";
    platform: string;
    userId: string;
    seed?: { scopeId: string; platform: string; userId: string };
  }) => Promise<unknown>;
  userAlias: {
    setAlias: (
      platform: string,
      userId: string,
      alias: string,
    ) => Promise<unknown>;
  };
  shortTermConfig: {
    promoteThreshold: number;
    demoteThreshold: number;
    longTermPromoteStep: number;
    longTermDemoteStep: number;
  };
  actionWindowConfig: {
    maxEntries: number;
  };
  coefficientConfig?: {
    base: number;
    maxDrop: number;
    maxBoost: number;
    decayPerDay: number;
    boostPerDay: number;
    min: number;
    max: number;
  };
  log: LogFn;
}

export function resolveXmlScopeId(
  attrs: Record<string, string>,
  config: Config,
): string | null {
  const rawScopeId = String(attrs.scopeId || "").trim();
  if (!rawScopeId) return null;
  if (rawScopeId !== config.scopeId) return null;
  return rawScopeId;
}

function resolveInitNicknameCandidates(
  session: {
    username?: string;
  } | null,
): string[] {
  return session?.username ? [session.username] : [];
}

async function initializeAffinityOnFirstReply(
  context: ModelResponseContext,
  params: Pick<ModelResponseProcessorParams, "config" | "store" | "log">,
): Promise<void> {
  const session = context.session;
  if (!session?.userId || !session.selfId) return;

  const allowedSelfIds = Array.isArray(params.config.botSelfIds)
    ? params.config.botSelfIds
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
  if (allowedSelfIds.length > 0 && !allowedSelfIds.includes(session.selfId)) {
    return;
  }

  const platform = String(session.platform || "onebot").trim() || "onebot";
  const userId = String(session.userId || "").trim();
  if (!userId || userId === String(session.selfId || "").trim()) return;

  const existing = await params.store.load(params.config.scopeId, userId);
  if (existing) return;

  const member = await fetchMember(session as never, userId);
  const nickname =
    collectNicknameCandidates(
      member,
      userId,
      resolveInitNicknameCandidates(session),
    )[0] || userId;

  await params.store.ensureForSeed(
    {
      scopeId: params.config.scopeId,
      platform,
      userId,
      session: session as never,
      nickname,
    },
    userId,
    params.store.clamp,
  );
}

async function recordInteractionFromReply(
  context: ModelResponseContext,
  params: Pick<ModelResponseProcessorParams, "config" | "store">,
): Promise<void> {
  const session = context.session;
  if (!session?.userId || !session.selfId) return;

  const platform = String(session.platform || "onebot").trim() || "onebot";
  const userId = String(session.userId || "").trim();
  const selfId = String(session.selfId || "").trim();
  if (!userId || !selfId || userId === selfId) return;

  await params.store.recordInteraction(
    {
      scopeId: params.config.scopeId,
      platform,
      userId,
      session: session as never,
    },
    userId,
  );
}

export function createModelResponseProcessor(
  params: ModelResponseProcessorParams,
): (context: ModelResponseContext) => Promise<void> {
  const {
    config,
    cache,
    store,
    blacklist,
    unblockPermanent,
    userAlias,
    shortTermConfig,
    actionWindowConfig,
    coefficientConfig,
    log,
  } = params;

  return async (context: ModelResponseContext): Promise<void> => {
    const response = String(context?.response || "").trim();
    if (!response) return;

    const affinityTags = parseSelfClosingXmlTags(response, "affinity");
    const blacklistTags = parseSelfClosingXmlTags(response, "blacklist");
    const userAliasTags = parseSelfClosingXmlTags(response, "userAlias");
    const relationshipTags = parseSelfClosingXmlTags(response, "relationship");

    if (config.debugLogging) {
      log("debug", "拦截到模型输出事件", {
        scopeId: config.scopeId,
        length: response.length,
        affinityTagCount: affinityTags.length,
        blacklistTagCount: blacklistTags.length,
        userAliasTagCount: userAliasTags.length,
        relationshipTagCount: relationshipTags.length,
      });
    }

    try {
      await initializeAffinityOnFirstReply(context, {
        config,
        store,
        log,
      });
      await recordInteractionFromReply(context, {
        config,
        store,
      });

      if (
        config.affinityEnabled &&
        config.xmlToolSettings.enableAffinityXmlToolCall
      ) {
        for (const attrs of affinityTags) {
          const scopeId = resolveXmlScopeId(attrs, config);
          const action = String(attrs.action || "")
            .trim()
            .toLowerCase();
          const userId = String(
            attrs.userId || attrs.id || attrs.targetUserId || "",
          ).trim();
          const platform = String(attrs.platform || "onebot").trim();
          const delta = Number(attrs.delta || "");

          if (config.debugLogging) {
            log("debug", "开始处理 affinity XML", {
              scopeId,
              inputScopeId: attrs.scopeId || "",
              action,
              userId,
            });
          }

          if (!scopeId) {
            log("warn", "忽略 affinity XML：scopeId 非法或不属于当前实例", {
              scopeId,
              inputScopeId: attrs.scopeId || "",
              action,
              userId,
            });
            continue;
          }
          if (!userId || !action) {
            log("warn", "忽略 affinity XML：缺少必要字段", {
              scopeId,
              action,
              userId,
            });
            continue;
          }

          if (action !== "increase" && action !== "decrease") {
            log("warn", "忽略 affinity XML：action 非法", {
              scopeId,
              action,
              userId,
            });
            continue;
          }
          if (!Number.isFinite(delta) || delta <= 0) {
            log("warn", "忽略 affinity XML：delta 非法", {
              scopeId,
              action,
              userId,
              delta,
            });
            continue;
          }

          await applyAffinityDelta({
            seed: {
              scopeId,
              platform,
              userId,
            },
            userId,
            delta,
            action,
            store: {
              ensureForSeed: store.ensureForSeed,
              save: store.save,
              clamp: store.clamp,
            },
            maxActionEntries: actionWindowConfig.maxEntries,
            shortTermConfig,
            coefficientConfig,
            log,
          });
          cache.clear(scopeId, userId);
        }
      } else if (config.debugLogging && affinityTags.length > 0) {
        log("debug", "跳过 affinity XML 处理", {
          scopeId: config.scopeId,
          affinityEnabled: config.affinityEnabled,
          enableAffinityXmlToolCall:
            config.xmlToolSettings.enableAffinityXmlToolCall,
          affinityTagCount: affinityTags.length,
        });
      }

      if (config.xmlToolSettings.enableBlacklistXmlToolCall) {
        for (const attrs of blacklistTags) {
          const scopeId = resolveXmlScopeId(attrs, config);
          const action = String(attrs.action || "")
            .trim()
            .toLowerCase();
          const mode = String(attrs.mode || "")
            .trim()
            .toLowerCase();
          const platform = String(attrs.platform || "onebot").trim();
          const userId = String(
            attrs.userId || attrs.id || attrs.targetUserId || "",
          ).trim();
          const note = String(attrs.note || "xml").trim();

          if (config.debugLogging) {
            log("debug", "开始处理 blacklist XML", {
              scopeId,
              inputScopeId: attrs.scopeId || "",
              action,
              mode,
              userId,
            });
          }

          if (!scopeId) {
            log("warn", "忽略 blacklist XML：scopeId 非法或不属于当前实例", {
              scopeId,
              inputScopeId: attrs.scopeId || "",
              action,
              mode,
              userId,
            });
            continue;
          }
          if (!userId || (action !== "add" && action !== "remove")) {
            log("warn", "忽略 blacklist XML：action 或 userId 非法", {
              scopeId,
              action,
              mode,
              userId,
            });
            continue;
          }

          if (action === "remove") {
            if (mode === "temporary") {
              await blacklist.removeTemporary(platform, userId);
              cache.clear(scopeId, userId);
              continue;
            }
            if (mode === "permanent") {
              await unblockPermanent({
                source: "xml",
                platform,
                userId,
                seed: { scopeId, platform, userId },
              });
              continue;
            }
            log("warn", "忽略 blacklist XML：remove 的 mode 非法", {
              scopeId,
              action,
              mode,
              userId,
            });
            continue;
          }

          if (mode === "permanent") {
            const existing = await store.load(scopeId, userId);
            await blacklist.recordPermanent(platform, userId, {
              note,
              nickname: existing?.nickname || userId,
            });
            cache.clear(scopeId, userId);
            continue;
          }

          if (mode === "temporary") {
            const durationHours = Number(attrs.durationHours || "");
            if (!Number.isFinite(durationHours) || durationHours <= 0) {
              log(
                "warn",
                "忽略 blacklist XML：temporary 缺少合法 durationHours",
                {
                  scopeId,
                  action,
                  mode,
                  userId,
                  durationHours,
                },
              );
              continue;
            }
            const penalty = Math.max(
              0,
              Number(config.shortTermBlacklistPenalty ?? 5),
            );
            const existing = await store.load(scopeId, userId);
            const entry = await blacklist.recordTemporary(
              platform,
              userId,
              durationHours,
              penalty,
              {
                note,
                nickname: existing?.nickname || userId,
              },
            );
            if (!entry) continue;

            if (existing && penalty > 0) {
              const nextAffinity = store.clamp(
                (existing.longTermAffinity ?? existing.affinity ?? 0) - penalty,
              );
              await store.save(
                {
                  scopeId,
                  platform,
                  userId,
                },
                nextAffinity,
                existing.specialRelation || "",
              );
            }
            cache.clear(scopeId, userId);
            continue;
          }

          log("warn", "忽略 blacklist XML：add 的 mode 非法", {
            scopeId,
            action,
            mode,
            userId,
          });
        }
      } else if (config.debugLogging && blacklistTags.length > 0) {
        log("debug", "跳过 blacklist XML 处理", {
          scopeId: config.scopeId,
          enableBlacklistXmlToolCall:
            config.xmlToolSettings.enableBlacklistXmlToolCall,
          blacklistTagCount: blacklistTags.length,
        });
      }

      if (config.xmlToolSettings.enableUserAliasXmlToolCall) {
        for (const attrs of userAliasTags) {
          const scopeId = resolveXmlScopeId(attrs, config);
          const platform = String(attrs.platform || "onebot").trim();
          const userId = String(
            attrs.userId || attrs.id || attrs.targetUserId || "",
          ).trim();
          const alias = String(attrs.name || attrs.alias || "").trim();

          if (config.debugLogging) {
            log("debug", "开始处理 userAlias XML", {
              scopeId,
              inputScopeId: attrs.scopeId || "",
              userId,
              alias,
            });
          }

          if (!scopeId) {
            log("warn", "忽略 userAlias XML：scopeId 非法或不属于当前实例", {
              scopeId,
              inputScopeId: attrs.scopeId || "",
              userId,
              alias,
            });
            continue;
          }
          if (!userId || !alias) {
            log("warn", "忽略 userAlias XML：缺少必要字段", {
              scopeId,
              userId,
              alias,
            });
            continue;
          }

          await userAlias.setAlias(platform, userId, alias);
        }
      } else if (config.debugLogging && userAliasTags.length > 0) {
        log("debug", "跳过 userAlias XML 处理", {
          scopeId: config.scopeId,
          enableUserAliasXmlToolCall:
            config.xmlToolSettings.enableUserAliasXmlToolCall,
          userAliasTagCount: userAliasTags.length,
        });
      }

      if (config.xmlToolSettings.enableRelationshipXmlToolCall) {
        for (const attrs of relationshipTags) {
          const scopeId = resolveXmlScopeId(attrs, config);
          const action = String(attrs.action || "set")
            .trim()
            .toLowerCase();
          const relation = String(attrs.relation || "").trim();
          const platform = String(attrs.platform || "onebot").trim();
          const userId = String(
            attrs.userId || attrs.id || attrs.targetUserId || "",
          ).trim();

          if (config.debugLogging) {
            log("debug", "开始处理 relationship XML", {
              scopeId,
              inputScopeId: attrs.scopeId || "",
              action,
              relation,
              userId,
            });
          }

          if (!scopeId) {
            log("warn", "忽略 relationship XML：scopeId 非法或不属于当前实例", {
              scopeId,
              inputScopeId: attrs.scopeId || "",
              action,
              relation,
              userId,
            });
            continue;
          }
          if (!userId || (action !== "set" && action !== "clear")) {
            log("warn", "忽略 relationship XML：action 或 userId 非法", {
              scopeId,
              action,
              relation,
              userId,
            });
            continue;
          }
          if (action === "set" && !relation) {
            log("warn", "忽略 relationship XML：set 缺少 relation", {
              scopeId,
              action,
              userId,
            });
            continue;
          }

          await store.save(
            {
              scopeId,
              platform,
              userId,
            },
            Number.NaN,
            action === "clear" ? "" : relation,
          );
          cache.clear(scopeId, userId);
        }
      } else if (config.debugLogging && relationshipTags.length > 0) {
        log("debug", "跳过 relationship XML 处理", {
          scopeId: config.scopeId,
          enableRelationshipXmlToolCall:
            config.xmlToolSettings.enableRelationshipXmlToolCall,
          relationshipTagCount: relationshipTags.length,
        });
      }
    } catch (error) {
      log("warn", "处理模型输出事件失败", { scopeId: config.scopeId, error });
    }
  };
}
