/**
 * 插件主逻辑
 * 组装所有模块并初始化插件功能
 */

import * as path from "path";
import { Context, Session } from "koishi";

import type { Config } from "./types";
import { BASE_AFFINITY_DEFAULTS } from "./constants";
import { registerModels } from "./models";
import { assertScopeId, createLogger } from "./helpers";
import { stripAtPrefix } from "./utils";
import { createAffinityStore } from "./services/affinity/store";
import { createAffinityCache } from "./services/affinity/cache";
import {
  resolveShortTermConfig,
  resolveActionWindowConfig,
} from "./services/affinity/calculator";
import { applyAffinityDelta } from "./services/affinity/apply-delta";
import { createMessageHistory } from "./services/message/history";
import { createCharacterModelResponseRuntime } from "./services/model-response/log-hook";
import { createBlacklistService } from "./services/blacklist/repository";
import { createBlacklistGuard } from "./services/blacklist/guard";
import { createPermanentUnblockHandler } from "./services/blacklist/unblock-permanent";
import { createUserAliasService } from "./services/user-alias/repository";
import { createLevelResolver } from "./services/relationship/level-resolver";
import { createManualRelationshipManager } from "./services/relationship/manual-config";
import { createMigrationService } from "./services/migration";
import { createRenderService } from "./renders";
import {
  createAffinityProvider,
  createRelationshipLevelProvider,
  createBlacklistListProvider,
  createUserAliasProvider,
} from "./integrations/chatluna/variables";
import {
  registerRankCommand,
  registerInspectCommand,
  registerBlacklistCommand,
  registerBlockCommand,
  registerTempBlockCommand,
  registerClearAllCommand,
  registerAdjustCommand,
} from "./commands";
import {
  fetchMember,
  resolveUserIdentity,
  findMemberByName,
  fetchGroupMemberIds,
  resolveGroupId,
} from "./helpers/member";
const BASE_KEYS = Object.keys(BASE_AFFINITY_DEFAULTS);

function normalizeBaseAffinityConfig(config: Config): void {
  const base = {
    ...BASE_AFFINITY_DEFAULTS,
    ...(config.baseAffinityConfig || {}),
  };
  const legacyInitialMin = (config as unknown as Record<string, unknown>)
    .initialRandomMin;
  const legacyInitialMax = (config as unknown as Record<string, unknown>)
    .initialRandomMax;
  const legacyInitialAffinity = (config as unknown as Record<string, unknown>)
    .initialAffinity;

  const readNumeric = (value: unknown): number | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const explicitInitialAffinity = readNumeric(legacyInitialAffinity);
  const explicitInitialMin = readNumeric(legacyInitialMin);
  const explicitInitialMax = readNumeric(legacyInitialMax);

  if (explicitInitialAffinity !== null) {
    base.initialAffinity = explicitInitialAffinity;
  } else if (explicitInitialMin !== null && explicitInitialMax !== null) {
    base.initialAffinity = Math.floor(
      (explicitInitialMin + explicitInitialMax) / 2,
    );
  } else if (explicitInitialMin !== null) {
    base.initialAffinity = explicitInitialMin;
  } else if (explicitInitialMax !== null) {
    base.initialAffinity = explicitInitialMax;
  }

  for (const key of BASE_KEYS) {
    const legacy = (config as unknown as Record<string, unknown>)[key];
    if (legacy !== undefined && legacy !== null) {
      const numeric = Number(legacy);
      if (Number.isFinite(numeric)) {
        (base as Record<string, number>)[key] = numeric;
      }
    }
  }

  config.baseAffinityConfig = base;
  for (const legacyKey of ["initialRandomMin", "initialRandomMax"]) {
    if (Object.prototype.hasOwnProperty.call(config, legacyKey)) {
      delete (config as unknown as Record<string, unknown>)[legacyKey];
    }
  }
  for (const key of BASE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      delete (config as unknown as Record<string, unknown>)[key];
    }
    Object.defineProperty(config, key, {
      configurable: true,
      enumerable: true,
      get() {
        const target = (
          config.baseAffinityConfig as unknown as Record<string, number>
        )?.[key];
        return Number.isFinite(target)
          ? target
          : (BASE_AFFINITY_DEFAULTS as unknown as Record<string, number>)[key];
      },
      set(value: number) {
        if (!config.baseAffinityConfig) {
          config.baseAffinityConfig = { ...BASE_AFFINITY_DEFAULTS };
        }
        (config.baseAffinityConfig as unknown as Record<string, number>)[key] =
          value;
      },
    });
  }
}

function normalizeToolSettings(config: Config): void {
  const xmlToolSettings = {
    enableAffinityXmlToolCall:
      config.xmlToolSettings?.enableAffinityXmlToolCall ?? true,
    enableBlacklistXmlToolCall:
      config.xmlToolSettings?.enableBlacklistXmlToolCall ?? true,
    enableRelationshipXmlToolCall:
      config.xmlToolSettings?.enableRelationshipXmlToolCall ?? true,
    enableUserAliasXmlToolCall:
      config.xmlToolSettings?.enableUserAliasXmlToolCall ?? true,
    characterPromptTemplate:
      config.xmlToolSettings?.characterPromptTemplate ||
      (config as unknown as { characterPromptTemplate?: string })
        .characterPromptTemplate ||
      "",
  };

  const variableSettings = {
    affinityVariableName:
      config.variableSettings?.affinityVariableName ||
      (config as unknown as { affinityVariableName?: string })
        .affinityVariableName ||
      "affinity",
    relationshipLevelVariableName:
      config.variableSettings?.relationshipLevelVariableName ||
      (config as unknown as { relationshipLevelVariableName?: string })
        .relationshipLevelVariableName ||
      "relationshipLevel",
    blacklistListVariableName:
      config.variableSettings?.blacklistListVariableName ||
      (config as unknown as { blacklistListVariableName?: string })
        .blacklistListVariableName ||
      "blacklistList",
    userAliasVariableName:
      config.variableSettings?.userAliasVariableName ||
      (config as unknown as { userAliasVariableName?: string })
        .userAliasVariableName ||
      "userAlias",
  };

  config.xmlToolSettings = xmlToolSettings;
  config.variableSettings = variableSettings;
}

function parseSelfClosingXmlTags(
  text: string,
  tagName: string,
): Array<Record<string, string>> {
  const tags = Array.from(
    text.matchAll(new RegExp(`<${tagName}\\b([^>]*)\\/>`, "gi")),
  );
  if (!tags.length) return [];

  return tags.map((tag) => {
    const attrText = String(tag[1] || "");
    const attrs: Record<string, string> = {};
    for (const pair of attrText.matchAll(/([a-zA-Z_][\w-]*)="([^"]*)"/g)) {
      attrs[pair[1]] = pair[2];
    }
    return attrs;
  });
}

function resolveXmlScopeId(
  attrs: Record<string, string>,
  config: Config,
): string | null {
  const rawScopeId = String(attrs.scopeId || "").trim();
  if (!rawScopeId) return null;
  if (rawScopeId !== config.scopeId) return null;
  return rawScopeId;
}

export function apply(ctx: Context, config: Config): void {
  const runtimeFingerprint =
    "chatluna-affinity fingerprint: 2026-03-08-runtime-check-a";
  config.scopeId = assertScopeId(config.scopeId);
  normalizeBaseAffinityConfig(config);
  normalizeToolSettings(config);
  registerModels(ctx);

  ctx.inject(["console"], (innerCtx) => {
    const consoleService = (
      innerCtx as unknown as {
        console?: { addEntry?: (entry: unknown) => void };
      }
    ).console;
    consoleService?.addEntry?.({
      dev: path.resolve(__dirname, "../client/index.ts"),
      prod: path.resolve(__dirname, "../dist"),
    });
  });

  const log = createLogger(ctx, config);

  log("info", runtimeFingerprint);

  log(
    "warn",
    "⚠️ 升级提示：已启用 v2 数据表与迁移逻辑。旧表数据会迁移到新表，若需查看旧表请直接使用数据库工具。",
  );
  const cache = createAffinityCache();
  const store = createAffinityStore({
    ctx,
    config,
    log,
  });
  const migration = createMigrationService({
    ctx,
    scopeId: config.scopeId,
    log,
  });
  const shortTermConfig = resolveShortTermConfig(config);
  const actionWindowConfig = resolveActionWindowConfig(config);
  const history = createMessageHistory({ ctx, config, log });
  const levelResolver = createLevelResolver(config);
  const manualRelationship = createManualRelationshipManager({
    ctx,
    config,
    log,
    applyConfigUpdate: () => {
      ctx.scope.update(config, false);
    },
  });
  const blacklist = createBlacklistService({
    ctx,
    config,
    log,
  });
  const unblockPermanent = createPermanentUnblockHandler({
    config,
    log,
    store,
    cache,
    blacklist,
  });
  const userAlias = createUserAliasService({
    ctx,
    scopeId: config.scopeId,
    log,
  });
  const renders = createRenderService({ ctx, log });

  ctx.accept(
    ["relationships"],
    () => {
      manualRelationship
        .syncToDatabase()
        .catch((error) => log("warn", "同步特殊关系配置到数据库失败", error));
    },
    { passive: true },
  );

  const blacklistGuard = createBlacklistGuard({
    config,
    blacklist,
    log,
  });
  ctx.middleware(
    blacklistGuard.middleware as Parameters<typeof ctx.middleware>[0],
    true,
  );

  const processModelResponse = async (response: string): Promise<void> => {
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
          const value = Number(attrs.value || "");

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

          if (action === "set") {
            if (!Number.isFinite(value)) {
              log("warn", "忽略 affinity XML：set 缺少合法 value", {
                scopeId,
                action,
                userId,
                value,
              });
              continue;
            }
            await store.save(
              {
                scopeId,
                platform,
                userId,
              },
              value,
            );
            cache.clear(scopeId, userId);
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
            levelResolver: {
              resolveLevelByAffinity: levelResolver.resolveLevelByAffinity,
            },
            maxIncrease: config.maxIncreasePerMessage || 5,
            maxDecrease: config.maxDecreasePerMessage || 3,
            maxActionEntries: actionWindowConfig.maxEntries,
            shortTermConfig,
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
                (existing.longTermAffinity ?? existing.affinity) - penalty,
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

  const modelResponseRuntime = createCharacterModelResponseRuntime({
    ctx,
    getCharacterService: () =>
      (
        ctx as unknown as {
          chatluna_character?: {
            logger?: {
              debug?: (...args: unknown[]) => void;
            };
          };
        }
      ).chatluna_character,
    processModelResponse,
    log,
  });

  ctx.on("dispose", () => {
    modelResponseRuntime.stop();
  });

  const fetchMemberBound = (session: Session, userId: string) =>
    fetchMember(session, userId);
  const resolveUserIdentityBound = (session: Session, input: string) =>
    resolveUserIdentity(session, input);
  const findMemberByNameBound = (session: Session, name: string) =>
    findMemberByName(session, name, log);
  const fetchGroupMemberIdsBound = (session: Session) =>
    fetchGroupMemberIds(session, log);

  const commandDeps = {
    ctx,
    config,
    log,
    store,
    cache,
    renders,
    fetchMember: fetchMemberBound,
    resolveUserIdentity: resolveUserIdentityBound,
    findMemberByName: findMemberByNameBound,
    fetchGroupMemberIds: fetchGroupMemberIdsBound,
    resolveGroupId,
    stripAtPrefix,
    unblockPermanent,
  };

  registerRankCommand(commandDeps);
  registerInspectCommand(commandDeps);
  registerAdjustCommand(commandDeps);
  registerBlacklistCommand({
    ...commandDeps,
    blacklist,
  });
  registerBlockCommand({ ...commandDeps, blacklist });
  registerTempBlockCommand({ ...commandDeps, blacklist });
  registerClearAllCommand(commandDeps);

  const initializeServices = async () => {
    log("info", "插件初始化开始...");

    await migration.run();

    try {
      await manualRelationship.syncToDatabase();
    } catch (error) {
      log("warn", "同步特殊关系配置到数据库失败", error);
    }

    const chatlunaService = (
      ctx as unknown as {
        chatluna?: {
          createChatModel?: (model: string) => Promise<unknown>;
          config?: { defaultModel?: string };
          promptRenderer?: {
            registerFunctionProvider?: (
              name: string,
              provider: unknown,
            ) => void;
          };
        };
      }
    ).chatluna;

    const promptRenderer = chatlunaService?.promptRenderer;

    const affinityProvider = createAffinityProvider({
      config,
      cache,
      store,
      fetchEntries: history.fetchEntries.bind(history),
    });
    promptRenderer?.registerFunctionProvider?.(
      config.variableSettings.affinityVariableName,
      affinityProvider,
    );
    log(
      "info",
      `好感度变量已注册: ${config.variableSettings.affinityVariableName}`,
    );

    const relationshipLevelName = String(
      config.variableSettings.relationshipLevelVariableName ||
        "relationshipLevel",
    ).trim();
    if (relationshipLevelName) {
      const relationshipLevelProvider = createRelationshipLevelProvider({
        store,
        config,
      });
      promptRenderer?.registerFunctionProvider?.(
        relationshipLevelName,
        relationshipLevelProvider,
      );
      log("info", `好感度区间变量已注册: ${relationshipLevelName}`);
    }

    const blacklistListName = String(
      config.variableSettings.blacklistListVariableName || "blacklistList",
    ).trim();
    if (blacklistListName) {
      const blacklistListProvider = createBlacklistListProvider({
        scopeId: config.scopeId,
        store,
        blacklist,
      });
      promptRenderer?.registerFunctionProvider?.(
        blacklistListName,
        blacklistListProvider,
      );
      log("info", `黑名单列表变量已注册: ${blacklistListName}`);
    }

    const userAliasName = String(
      config.variableSettings.userAliasVariableName || "userAlias",
    ).trim();
    if (userAliasName) {
      const userAliasProvider = createUserAliasProvider({
        scopeId: config.scopeId,
        userAlias,
      });
      promptRenderer?.registerFunctionProvider?.(
        userAliasName,
        userAliasProvider,
      );
      log("info", `用户自定义昵称变量已注册: ${userAliasName}`);
    }

    log("info", "准备启动模型响应拦截 runtime");
    modelResponseRuntime.start();
    log("info", "模型响应拦截 runtime.start() 调用完成");

    log("info", "插件初始化完成");
  };

  if (ctx.root.lifecycle.isActive) {
    initializeServices().catch((error) => log("warn", "插件初始化失败", error));
  } else {
    ctx.on("ready", () => {
      initializeServices().catch((error) =>
        log("warn", "插件初始化失败", error),
      );
    });
  }
}
