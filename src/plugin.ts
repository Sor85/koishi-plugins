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
import { createMessageHistory } from "./services/message/history";
import {
  createCharacterTempModelResponseRuntime,
  createModelResponseProcessor,
} from "./services/model-response";
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
  };

  config.xmlToolSettings = xmlToolSettings;
  config.variableSettings = variableSettings;
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

  const processModelResponse = createModelResponseProcessor({
    config,
    cache,
    store,
    blacklist,
    unblockPermanent,
    userAlias,
    levelResolver,
    shortTermConfig,
    actionWindowConfig,
    log,
  });

  const modelResponseRuntime = createCharacterTempModelResponseRuntime({
    getCharacterService: () =>
      (
        ctx as unknown as {
          chatluna_character?: {
            getTemp?: (
              ...args: unknown[]
            ) => Promise<{ completionMessages?: unknown[] }>;
          };
        }
      ).chatluna_character,
    processModelResponse,
    log,
  });
  let modelResponseRuntimeMonitor: (() => void) | null = null;

  ctx.on("dispose", () => {
    modelResponseRuntimeMonitor?.();
    modelResponseRuntimeMonitor = null;
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
      getUserAlias: async (scopeId, platform, userId) => {
        if (scopeId !== config.scopeId) return null;
        return userAlias.getAlias(platform, userId);
      },
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

    log("info", "准备启动模型响应拦截 runtime");
    modelResponseRuntime.start();
    modelResponseRuntimeMonitor?.();
    modelResponseRuntimeMonitor = ctx.setInterval(() => {
      modelResponseRuntime.start();
    }, 3000);
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
