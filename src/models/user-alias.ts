/**
 * 用户自定义昵称数据表定义
 * 定义 chatluna_user_alias 表结构及类型声明
 */

import type { Context } from "koishi";
import type { UserAliasRecord, LegacyUserAliasRecord } from "../types";

export const USER_ALIAS_MODEL_NAME = "chatluna_user_alias";
export const USER_ALIAS_MODEL_NAME_V2 = "chatluna_user_alias_v2";

declare module "koishi" {
  interface Tables {
    [USER_ALIAS_MODEL_NAME]: LegacyUserAliasRecord;
    [USER_ALIAS_MODEL_NAME_V2]: UserAliasRecord;
  }
}

export function extendUserAliasModel(ctx: Context): void {
  ctx.model.extend(
    USER_ALIAS_MODEL_NAME,
    {
      platform: { type: "string", length: 64 },
      userId: { type: "string", length: 64 },
      alias: { type: "string", length: 255 },
      updatedAt: { type: "timestamp" },
    },
    { primary: ["platform", "userId"] },
  );

  ctx.model.extend(
    USER_ALIAS_MODEL_NAME_V2,
    {
      scopeId: { type: "string", length: 32 },
      platform: { type: "string", length: 64 },
      userId: { type: "string", length: 64 },
      alias: { type: "string", length: 255 },
      updatedAt: { type: "timestamp" },
    },
    { primary: ["scopeId", "platform", "userId"] },
  );
}
