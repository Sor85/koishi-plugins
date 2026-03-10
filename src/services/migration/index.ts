/**
 * 数据迁移服务
 * 将旧表数据迁移到 *_v2 新表并记录迁移状态
 */

import type { Context } from "koishi";
import type {
  AffinityRecord,
  BlacklistRecord,
  LegacyAffinityRecord,
  LegacyBlacklistRecord,
  LegacyUserAliasRecord,
  LogFn,
  UserAliasRecord,
} from "../../types";
import {
  BLACKLIST_MODEL_NAME,
  BLACKLIST_MODEL_NAME_V2,
  MIGRATION_MODEL_NAME,
  MODEL_NAME,
  MODEL_NAME_V2,
  USER_ALIAS_MODEL_NAME,
  USER_ALIAS_MODEL_NAME_V2,
} from "../../models";

const MIGRATION_VERSION = "v2";

export interface MigrationOptions {
  ctx: Context;
  scopeId: string;
  log: LogFn;
}

export function createMigrationService(options: MigrationOptions) {
  const { ctx, scopeId, log } = options;

  const shouldMigrate = async (): Promise<boolean> => {
    const records = await ctx.database.get(MIGRATION_MODEL_NAME, {
      scopeId,
      version: MIGRATION_VERSION,
    });
    return (
      records.length === 0 || records.some((item) => item.status === "failed")
    );
  };

  const markMigration = async (
    status: "success" | "failed" | "skipped",
  ): Promise<void> => {
    await ctx.database.upsert(MIGRATION_MODEL_NAME, [
      {
        scopeId,
        version: MIGRATION_VERSION,
        migratedAt: new Date(),
        status,
      },
    ]);
  };

  const markSkipped = async (): Promise<void> => {
    await markMigration("skipped");
  };

  const migrateAffinity = async (): Promise<number> => {
    const legacyRows = (await ctx.database.get(
      MODEL_NAME,
      {},
    )) as unknown as LegacyAffinityRecord[];
    if (legacyRows.length === 0) return 0;

    const rows: AffinityRecord[] = legacyRows.map((row) => ({
      scopeId,
      ...row,
    }));
    await ctx.database.upsert(MODEL_NAME_V2, rows);
    return rows.length;
  };

  const migrateBlacklist = async (): Promise<number> => {
    const legacyRows = (await ctx.database.get(
      BLACKLIST_MODEL_NAME,
      {},
    )) as unknown as LegacyBlacklistRecord[];
    if (legacyRows.length === 0) return 0;

    const rows: BlacklistRecord[] = legacyRows.map((row) => ({
      scopeId,
      ...row,
    }));
    await ctx.database.upsert(BLACKLIST_MODEL_NAME_V2, rows);
    return rows.length;
  };

  const migrateUserAlias = async (): Promise<number> => {
    const legacyRows = (await ctx.database.get(
      USER_ALIAS_MODEL_NAME,
      {},
    )) as unknown as LegacyUserAliasRecord[];
    if (legacyRows.length === 0) return 0;

    const rows: UserAliasRecord[] = legacyRows.map((row) => ({
      scopeId,
      ...row,
    }));
    await ctx.database.upsert(USER_ALIAS_MODEL_NAME_V2, rows);
    return rows.length;
  };

  const run = async (): Promise<void> => {
    if (!scopeId) return;
    const needed = await shouldMigrate();
    if (!needed) return;

    try {
      const migrationOwners = await ctx.database.get(MIGRATION_MODEL_NAME, {
        scopeId,
        version: MIGRATION_VERSION,
      });
      const hasSuccessOwner = migrationOwners.some(
        (item) => item.status === "success",
      );
      if (hasSuccessOwner) {
        await markSkipped();
        log("info", "迁移跳过：已由其他实例完成", { scopeId });
        return;
      }

      const legacyAffinityCount = (await ctx.database.get(MODEL_NAME, {}))
        .length;
      const legacyBlacklistCount = (
        await ctx.database.get(BLACKLIST_MODEL_NAME, {})
      ).length;
      const legacyAliasCount = (
        await ctx.database.get(USER_ALIAS_MODEL_NAME, {})
      ).length;
      const legacyTotal =
        legacyAffinityCount + legacyBlacklistCount + legacyAliasCount;

      if (legacyTotal === 0) {
        await markSkipped();
        log("info", "迁移跳过：旧表无数据", { scopeId });
        return;
      }

      const affinityCount = await migrateAffinity();
      const blacklistCount = await migrateBlacklist();
      const aliasCount = await migrateUserAlias();

      await markMigration("success");
      log("info", "迁移完成", {
        scopeId,
        affinityCount,
        blacklistCount,
        aliasCount,
      });
    } catch (error) {
      await markMigration("failed");
      log("warn", "迁移失败", error);
    }
  };

  return { run };
}
