/**
 * 手动关系配置管理
 * 提供特殊关系的配置管理和数据库同步功能
 */

import type { Context } from "koishi";
import type {
  Config,
  ManualRelationship,
  AffinityRecord,
  LogFn,
} from "../../types";
import { MODEL_NAME_V2 } from "../../models";

export interface ManualConfigOptions {
  ctx: Context;
  config: Config;
  log: LogFn;
  applyConfigUpdate: () => void;
}

export function createManualRelationshipManager(options: ManualConfigOptions) {
  const { ctx, config, log, applyConfigUpdate } = options;

  const find = (
    _platform: string,
    userId: string,
  ): ManualRelationship | null => {
    const list = config.relationships || [];
    return list.find((r) => r.userId === userId) || null;
  };

  const update = (userId: string, relationName: string): void => {
    const list = config.relationships || [];
    const existing = list.find((r) => r.userId === userId);
    if (existing) {
      config.relationships = list.map((item) =>
        item.userId === userId ? { ...item, relation: relationName } : item,
      );
    } else {
      config.relationships = [...list, { userId, relation: relationName }];
    }
    applyConfigUpdate();
  };

  const remove = async (userId: string): Promise<boolean> => {
    if (!config.relationships) return false;
    const list = config.relationships || [];
    const exists = list.some((item) => item.userId === userId);
    if (!exists) return false;

    config.relationships = list.filter((item) => item.userId !== userId);
    applyConfigUpdate();

    try {
      const records = await ctx.database.get(MODEL_NAME_V2, {
        scopeId: config.scopeId,
        userId,
      });
      const existing = records[0];
      if (existing) {
        await ctx.database.upsert(MODEL_NAME_V2, [
          { ...existing, specialRelation: null } as AffinityRecord,
        ]);
      }
    } catch (error) {
      log("warn", "同步删除关系到数据库失败", error);
    }

    return true;
  };

  const syncToDatabase = async (): Promise<void> => {
    const relationships = config.relationships || [];
    if (relationships.length === 0) return;

    const relationshipMap = new Map(
      relationships.map((r) => [r.userId, r.relation]),
    );
    const targetUserIds = relationships.map((r) => r.userId);
    if (targetUserIds.length === 0) return;

    const records = await ctx.database.get(MODEL_NAME_V2, {
      scopeId: config.scopeId,
      userId: { $in: targetUserIds },
    });

    const toUpdate: AffinityRecord[] = [];

    for (const record of records) {
      const configRelation = relationshipMap.get(record.userId);
      if (
        configRelation !== undefined &&
        record.specialRelation !== configRelation
      ) {
        toUpdate.push({
          ...record,
          specialRelation: configRelation,
        } as AffinityRecord);
      }
    }

    if (toUpdate.length > 0) {
      await ctx.database.upsert(MODEL_NAME_V2, toUpdate);
      log("info", "已同步特殊关系配置到数据库", { count: toUpdate.length });
    }
  };

  return {
    find,
    update,
    remove,
    syncToDatabase,
  };
}

export type ManualRelationshipManager = ReturnType<
  typeof createManualRelationshipManager
>;
