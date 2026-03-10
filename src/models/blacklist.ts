/**
 * 黑名单数据表定义
 * 定义 chatluna_blacklist 表结构及类型声明
 */

import type { Context } from "koishi";
import type { BlacklistRecord, LegacyBlacklistRecord } from "../types";

export const BLACKLIST_MODEL_NAME = "chatluna_blacklist";
export const BLACKLIST_MODEL_NAME_V2 = "chatluna_blacklist_v2";

declare module "koishi" {
  interface Tables {
    [BLACKLIST_MODEL_NAME]: LegacyBlacklistRecord;
    [BLACKLIST_MODEL_NAME_V2]: BlacklistRecord;
  }
}

export function extendBlacklistModel(ctx: Context): void {
  ctx.model.extend(
    BLACKLIST_MODEL_NAME,
    {
      platform: { type: "string", length: 64 },
      userId: { type: "string", length: 64 },
      mode: { type: "string", length: 16 },
      blockedAt: { type: "timestamp" },
      expiresAt: { type: "timestamp", nullable: true },
      nickname: { type: "string", length: 255, nullable: true },
      note: { type: "string", length: 255, nullable: true },
      durationHours: { type: "integer", nullable: true },
      penalty: { type: "integer", nullable: true },
    },
    { primary: ["userId", "mode"] },
  );

  ctx.model.extend(
    BLACKLIST_MODEL_NAME_V2,
    {
      scopeId: { type: "string", length: 32 },
      platform: { type: "string", length: 64 },
      userId: { type: "string", length: 64 },
      mode: { type: "string", length: 16 },
      blockedAt: { type: "timestamp" },
      expiresAt: { type: "timestamp", nullable: true },
      nickname: { type: "string", length: 255, nullable: true },
      note: { type: "string", length: 255, nullable: true },
      durationHours: { type: "integer", nullable: true },
      penalty: { type: "integer", nullable: true },
    },
    { primary: ["scopeId", "userId", "mode"] },
  );
}
