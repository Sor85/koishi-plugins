/**
 * 迁移记录表定义
 * 记录 scopeId 级别迁移状态与版本
 */

import type { Context } from "koishi";

export const MIGRATION_MODEL_NAME = "chatluna_affinity_migrations";

export interface MigrationRecord {
  scopeId: string;
  version: string;
  migratedAt: Date;
  status: "success" | "failed" | "skipped";
}

declare module "koishi" {
  interface Tables {
    [MIGRATION_MODEL_NAME]: MigrationRecord;
  }
}

export function extendMigrationModel(ctx: Context): void {
  ctx.model.extend(
    MIGRATION_MODEL_NAME,
    {
      scopeId: { type: "string", length: 32 },
      version: { type: "string", length: 32 },
      migratedAt: { type: "timestamp" },
      status: { type: "string", length: 32 },
    },
    { primary: ["scopeId", "version"] },
  );
}
