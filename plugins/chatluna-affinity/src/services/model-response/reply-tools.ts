/**
 * 回复参数工具注册
 * 将 affinity XML 工具动作挂载到 chatluna-character 实验性 reply tool 字段
 */

import type { Context, Session } from "koishi";
import type { Config, LogFn } from "../../types";
import { applyAffinityDelta } from "../affinity/apply-delta";
import type { ModelResponseProcessorParams } from "./processor";

interface ReplyField {
  name: string;
  schema: Record<string, unknown>;
  invoke?: (
    ctx: Context,
    session: Session,
    value: unknown,
    config: unknown,
  ) => Promise<void> | void;
  render?: (
    ctx: Context,
    session: Session,
    value: unknown,
    config: unknown,
  ) => string | string[] | undefined;
}

interface CharacterService {
  registerReplyToolField?: (field: ReplyField) => () => void;
}

type RegisterDeps = Pick<
  ModelResponseProcessorParams,
  | "config"
  | "cache"
  | "store"
  | "blacklist"
  | "unblockPermanent"
  | "userAlias"
  | "shortTermConfig"
  | "actionWindowConfig"
  | "coefficientConfig"
> & {
  ctx: Context;
  log?: LogFn;
};

type XmlActionItem = Record<string, unknown>;

function escapeAttr(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function asArrayOfObjects(value: unknown): XmlActionItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is XmlActionItem =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function readString(item: XmlActionItem, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) return normalized;
    }
  }
  return "";
}

function readOptionalString(item: XmlActionItem, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string") {
      return value.trim();
    }
  }
  return "";
}

function readNumber(item: XmlActionItem, keys: string[]): number {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (!normalized) continue;
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return Number.NaN;
}

function resolvePlatform(item: XmlActionItem): string {
  return readOptionalString(item, ["platform"]) || "onebot";
}

function normalizeAction(value: unknown): "increase" | "decrease" | "" {
  const action = String(value ?? "")
    .trim()
    .toLowerCase();
  if (action === "increase" || action === "decrease") return action;
  return "";
}

function normalizeBlacklistAction(value: unknown): "add" | "remove" | "" {
  const action = String(value ?? "")
    .trim()
    .toLowerCase();
  if (action === "add" || action === "remove") return action;
  return "";
}

function normalizeBlacklistMode(value: unknown): "permanent" | "temporary" | "" {
  const mode = String(value ?? "")
    .trim()
    .toLowerCase();
  if (mode === "permanent" || mode === "temporary") return mode;
  return "";
}

function normalizeRelationshipAction(value: unknown): "set" | "clear" | "" {
  const action = String(value ?? "set")
    .trim()
    .toLowerCase();
  if (action === "set" || action === "clear") return action;
  return "";
}

function platformAttr(item: XmlActionItem): string {
  const platform = readOptionalString(item, ["platform"]);
  if (!platform || platform === "onebot") return "";
  return ` platform="${escapeAttr(platform)}"`;
}

function hasAnyXmlToolEnabled(config: Config): boolean {
  return Boolean(
    config.xmlToolSettings.enableAffinityXmlToolCall ||
      config.xmlToolSettings.enableBlacklistXmlToolCall ||
      config.xmlToolSettings.enableRelationshipXmlToolCall ||
      config.xmlToolSettings.enableUserAliasXmlToolCall,
  );
}

export function hasReplyToolsEnabled(config: Config): boolean {
  return Boolean(config.xmlToolSettings.injectXmlToolAsReplyTool && hasAnyXmlToolEnabled(config));
}

export function registerCharacterReplyTools(deps: RegisterDeps): () => void {
  const {
    ctx,
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
  } = deps;
  const service = (ctx as unknown as { chatluna_character?: CharacterService })
    .chatluna_character;

  if (!service?.registerReplyToolField) {
    return () => {};
  }

  const disposers: (() => void)[] = [];
  const scopeId = config.scopeId;

  if (
    config.xmlToolSettings.injectXmlToolAsReplyTool &&
    config.xmlToolSettings.enableAffinityXmlToolCall
  ) {
    disposers.push(
      service.registerReplyToolField({
        name: "affinity_affinity",
        schema: {
          type: "array",
          description: "更新一个或多个用户的好感度动作。",
          items: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description: "目标用户 ID。",
              },
              action: {
                type: "string",
                enum: ["increase", "decrease"],
                description: "increase 或 decrease。",
              },
              delta: {
                type: "number",
                description: "变化幅度，必须是正数。",
              },
              platform: {
                type: "string",
                description: "可选平台，默认 onebot。",
              },
            },
            required: ["user_id", "action", "delta"],
          },
        },
        async invoke(_, session, value) {
          for (const item of asArrayOfObjects(value)) {
            const userId = readString(item, ["user_id", "userId", "id"]);
            const action = normalizeAction(item.action);
            const delta = readNumber(item, ["delta"]);
            const platform = resolvePlatform(item);
            if (!userId || !action || !Number.isFinite(delta) || delta <= 0) {
              continue;
            }
            await applyAffinityDelta({
              seed: {
                scopeId,
                platform,
                userId,
                session,
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
        },
        render(_, __, value) {
          return asArrayOfObjects(value).flatMap((item) => {
            const userId = readString(item, ["user_id", "userId", "id"]);
            const action = normalizeAction(item.action);
            const delta = readNumber(item, ["delta"]);
            if (!userId || !action || !Number.isFinite(delta) || delta <= 0) {
              return [];
            }
            return [
              `<affinity scopeId="${escapeAttr(scopeId)}" userId="${escapeAttr(userId)}" action="${escapeAttr(action)}" delta="${escapeAttr(delta)}"${platformAttr(item)} />`,
            ];
          });
        },
      }),
    );
  }

  if (
    config.xmlToolSettings.injectXmlToolAsReplyTool &&
    config.xmlToolSettings.enableBlacklistXmlToolCall
  ) {
    disposers.push(
      service.registerReplyToolField({
        name: "affinity_blacklist",
        schema: {
          type: "array",
          description: "新增或移除一个或多个黑名单动作。",
          items: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description: "目标用户 ID。",
              },
              action: {
                type: "string",
                enum: ["add", "remove"],
                description: "add 或 remove。",
              },
              mode: {
                type: "string",
                enum: ["permanent", "temporary"],
                description: "permanent 或 temporary。",
              },
              duration_hours: {
                type: "number",
                description: "临时黑名单时长（小时），仅 temporary 且 add 时有效。",
              },
              note: {
                type: "string",
                description: "可选备注。",
              },
              platform: {
                type: "string",
                description: "可选平台，默认 onebot。",
              },
            },
            required: ["user_id", "action", "mode"],
          },
        },
        async invoke(_, __, value) {
          for (const item of asArrayOfObjects(value)) {
            const userId = readString(item, ["user_id", "userId", "id"]);
            const action = normalizeBlacklistAction(item.action);
            const mode = normalizeBlacklistMode(item.mode);
            const platform = resolvePlatform(item);
            const note = readOptionalString(item, ["note"]) || "xml";
            if (!userId || !action || !mode) {
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
              }
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

            const durationHours = readNumber(item, [
              "duration_hours",
              "durationHours",
            ]);
            if (!Number.isFinite(durationHours) || durationHours <= 0) {
              continue;
            }
            const penalty = Math.max(0, Number(config.shortTermBlacklistPenalty ?? 5));
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
          }
        },
        render(_, __, value) {
          return asArrayOfObjects(value).flatMap((item) => {
            const userId = readString(item, ["user_id", "userId", "id"]);
            const action = normalizeBlacklistAction(item.action);
            const mode = normalizeBlacklistMode(item.mode);
            if (!userId || !action || !mode) {
              return [];
            }
            const note = readOptionalString(item, ["note"]);
            const noteAttr = note ? ` note="${escapeAttr(note)}"` : "";
            const durationHours = readNumber(item, [
              "duration_hours",
              "durationHours",
            ]);
            const durationAttr =
              action === "add" &&
              mode === "temporary" &&
              Number.isFinite(durationHours) &&
              durationHours > 0
                ? ` durationHours="${escapeAttr(durationHours)}"`
                : "";
            return [
              `<blacklist scopeId="${escapeAttr(scopeId)}" userId="${escapeAttr(userId)}" action="${escapeAttr(action)}" mode="${escapeAttr(mode)}"${durationAttr}${noteAttr}${platformAttr(item)} />`,
            ];
          });
        },
      }),
    );
  }

  if (
    config.xmlToolSettings.injectXmlToolAsReplyTool &&
    config.xmlToolSettings.enableRelationshipXmlToolCall
  ) {
    disposers.push(
      service.registerReplyToolField({
        name: "affinity_relationship",
        schema: {
          type: "array",
          description: "设置或清空一个或多个用户的关系。",
          items: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description: "目标用户 ID。",
              },
              action: {
                type: "string",
                enum: ["set", "clear"],
                description: "set 或 clear。",
              },
              relation: {
                type: "string",
                description: "关系名，仅 action=set 时需要。",
              },
              platform: {
                type: "string",
                description: "可选平台，默认 onebot。",
              },
            },
            required: ["user_id"],
          },
        },
        async invoke(_, __, value) {
          for (const item of asArrayOfObjects(value)) {
            const userId = readString(item, ["user_id", "userId", "id"]);
            const action = normalizeRelationshipAction(item.action);
            const relation = readOptionalString(item, ["relation"]);
            const platform = resolvePlatform(item);
            if (!userId || !action) {
              continue;
            }
            if (action === "set" && !relation) {
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
        },
        render(_, __, value) {
          return asArrayOfObjects(value).flatMap((item) => {
            const userId = readString(item, ["user_id", "userId", "id"]);
            const action = normalizeRelationshipAction(item.action);
            const relation = readOptionalString(item, ["relation"]);
            if (!userId || !action) {
              return [];
            }
            if (action === "set" && !relation) {
              return [];
            }
            const relationAttr =
              action === "set"
                ? ` relation="${escapeAttr(relation)}"`
                : "";
            return [
              `<relationship scopeId="${escapeAttr(scopeId)}" userId="${escapeAttr(userId)}" action="${escapeAttr(action)}"${relationAttr}${platformAttr(item)} />`,
            ];
          });
        },
      }),
    );
  }

  if (
    config.xmlToolSettings.injectXmlToolAsReplyTool &&
    config.xmlToolSettings.enableUserAliasXmlToolCall
  ) {
    disposers.push(
      service.registerReplyToolField({
        name: "affinity_user_alias",
        schema: {
          type: "array",
          description: "设置一个或多个用户的自定义昵称。",
          items: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description: "目标用户 ID。",
              },
              name: {
                type: "string",
                description: "要设置的昵称。",
              },
              platform: {
                type: "string",
                description: "可选平台，默认 onebot。",
              },
            },
            required: ["user_id", "name"],
          },
        },
        async invoke(_, __, value) {
          for (const item of asArrayOfObjects(value)) {
            const userId = readString(item, ["user_id", "userId", "id"]);
            const name = readString(item, ["name", "alias"]);
            const platform = resolvePlatform(item);
            if (!userId || !name) {
              continue;
            }
            await userAlias.setAlias(platform, userId, name);
          }
        },
        render(_, __, value) {
          return asArrayOfObjects(value).flatMap((item) => {
            const userId = readString(item, ["user_id", "userId", "id"]);
            const name = readString(item, ["name", "alias"]);
            if (!userId || !name) {
              return [];
            }
            return [
              `<userAlias scopeId="${escapeAttr(scopeId)}" userId="${escapeAttr(userId)}" name="${escapeAttr(name)}"${platformAttr(item)} />`,
            ];
          });
        },
      }),
    );
  }

  return () => {
    for (const dispose of disposers.reverse()) {
      dispose();
    }
  };
}
